const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const mqtt = require('mqtt');
const { createClient } = require('redis');
const https = require('https');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_TEST_HOST = process.env.REDIS_TEST_HOST || 'localhost';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || null;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;

const MEMBERS = ['mamka', 'tatka', 'misak', 'kubik'];

// ─── Geofences ────────────────────────────────────────────────────────────────
let dynamicFences = [];

async function loadFences() {
  try {
    const raw = await redis.get('geofences');
    dynamicFences = raw ? JSON.parse(raw) : [];
    console.log('✓ Načteno ' + dynamicFences.length + ' geofences z Redis');
  } catch(e) { dynamicFences = []; }
}

async function saveFences() {
  await redis.set('geofences', JSON.stringify(dynamicFences));
}

// ─── Geo helper ───────────────────────────────────────────────────────────────
function distance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function resolveStatus(member, lat, lon, vel = 0, motionActivities = [], ts = Date.now()) {
  const HOME_KEYWORDS = ['doma', 'náš domeček', 'home'];
  const isMovingFast = ((motionActivities.includes('automotive') || motionActivities.includes('cycling')) && vel > 5) || vel > 15;

  for (const fence of dynamicFences) {
    if (fence.only && !fence.only.includes(member)) continue;
    if (distance(lat, lon, fence.lat, fence.lon) <= fence.radius) {
      const isHome = HOME_KEYWORDS.some(k => fence.name.toLowerCase().includes(k));
      // Domov — okamžitě
      if (isHome) { memberFenceHyst[member] = null; return fence.name; }
      // Ostatní — potvrď N po sobě jdoucích bodů
      if (confirmFence(member, fence.name, fence.id, isMovingFast, ts)) {
        return fence.name;
      }
      return 'cesta';
    }
  }
  // Mimo geofence — reset hystereze
  memberFenceHyst[member] = null;
  return 'cesta';
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Logging ──────────────────────────────────────────────────────────────────
// Typy: gps_received, stop_candidate, ai_request, ai_response, ai_error,
//       place_saved, place_rejected, fence_added

const LOG_TTL = 30 * 24 * 3600;

async function logEvent(type, data) {
  try {
    const ts = Date.now();
    const key = 'log:' + ts + ':' + Math.random().toString(36).slice(2, 6);
    await redis.set(key, JSON.stringify({ type, ts, ...data }), { EX: LOG_TTL });
    await redis.lPush('log:index', key);
    await redis.lTrim('log:index', 0, 4999);
  } catch(e) {
    console.error('[LOG] Chyba:', e.message);
  }
}

// ─── Google Places ────────────────────────────────────────────────────────────
const SKIP_PLACE_TYPES = [
  'parking_lot', 'parking', 'transit_station', 'light_rail_station',
  'bus_station', 'transportation_service', 'route', 'street_address', 'political',
  'atm', 'bank', 'gas_station', 'car_wash', 'car_repair'
];

async function getNearbyPlaces(lat, lon, radius = 300) {
  if (!GOOGLE_API_KEY) return [];
  try {
    const url = `/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&language=cs&key=${GOOGLE_API_KEY}`;
    const data = await new Promise((resolve, reject) => {
      https.get({ hostname: 'maps.googleapis.com', path: url }, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      }).on('error', reject);
    });
    if (!data.results) return [];
    return data.results
      .map(p => ({
        name: p.name || '',
        primaryType: p.types?.[0] || '',
        types: (p.types || []).slice(0, 5),
        dist: Math.round(distance(lat, lon, p.geometry.location.lat, p.geometry.location.lng)),
        rating: p.rating || null,
      }))
      .filter(p => !SKIP_PLACE_TYPES.includes(p.primaryType) && p.name)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);
  } catch(e) {
    console.error('[PLACES] Chyba:', e.message);
    return [];
  }
}

// ─── Historie skutečných návštěv ───────────────────────────────────────────────
// Dedikovaný trvalý log návštěv per člen (visits:<member>) — JEDEN záznam = JEDNA
// návštěva, nezávisle na počtu GPS bodů a nezávisle na rolovacím history logu.
// Návštěvy téhož místa oddělené < VISIT_GAP_MS se považují za jednu (dlouhé stání = 1×).
const VISIT_GAP_MS = 6 * 60 * 60 * 1000;   // 6 h — odstup pro NOVOU návštěvu
const VISIT_RADIUS_M = 120;                // okruh pro "stejné místo"
const VISIT_LOG_MAX = 500;                 // strop záznamů na člena

// Spočítá DŘÍVĚJŠÍ samostatné návštěvy téhož místa (oddělené od času ts ≥ 6 h)
async function countNearbyVisits(member, lat, lon, ts, radiusM = VISIT_RADIUS_M) {
  try {
    const raw = await redis.lRange('visits:' + member, 0, VISIT_LOG_MAX);
    let n = 0;
    for (const r of raw) {
      const v = JSON.parse(r);
      if (distance(lat, lon, v.lat, v.lon) <= radiusM && Math.abs(ts - v.ts) >= VISIT_GAP_MS) n++;
    }
    return n;
  } catch(e) { return 0; }
}

// Zaznamená návštěvu. Pokud na stejném místě (<120 m) existuje záznam mladší než
// VISIT_GAP_MS, patří k téže návštěvě → neukládá se znovu (dlouhé stání = 1 návštěva).
async function recordVisit(member, lat, lon, ts) {
  try {
    const raw = await redis.lRange('visits:' + member, 0, VISIT_LOG_MAX);
    const same = raw.map(r => JSON.parse(r)).find(v =>
      distance(lat, lon, v.lat, v.lon) <= VISIT_RADIUS_M && Math.abs(ts - v.ts) < VISIT_GAP_MS);
    if (same) return false;   // patří k téže návštěvě
    await redis.lPush('visits:' + member, JSON.stringify({ lat, lon, ts }));
    await redis.lTrim('visits:' + member, 0, VISIT_LOG_MAX - 1);
    return true;
  } catch(e) { return false; }
}

// ─── Kdo jiný z rodiny byl nedávno na stejném místě ──────────────────────────
async function getRecentNearbyMembers(excludeMember, lat, lon, radiusM = 200, windowMs = 30 * 60 * 1000) {
  const result = [];
  const cutoff = Date.now() - windowMs;
  for (const m of MEMBERS) {
    if (m === excludeMember) continue;
    try {
      const raw = await redis.lRange('history:' + m, 0, 200);
      for (const r of raw) {
        const p = JSON.parse(r);
        if (p.ts < cutoff) break;
        if (distance(lat, lon, p.lat, p.lon) <= radiusM) {
          result.push({ member: m, minutesAgo: Math.round((Date.now() - p.ts) / 60000) });
          break;
        }
      }
    } catch(e) {}
  }
  return result;
}

// ─── Claude AI ────────────────────────────────────────────────────────────────
async function askClaude(member, lat, lon, context) {
  if (!ANTHROPIC_API_KEY) {
    await logEvent('ai_error', { member, lat, lon, error: 'API klíč chybí' });
    return null;
  }

  const { gapMinutes, placesNearby, historyVisits, nearbyMembers, dayOfWeek, timeStr, source } = context;

  // Zvýrazni nejbližší místo — pokud je výrazně blíž než ostatní, je to pravděpodobný cíl
  let placesStr = '  Žádná místa nenalezena';
  if (placesNearby.length > 0) {
    const nearest = placesNearby[0];
    const second = placesNearby[1];
    const nearestIsClose = nearest.dist < 50;
    const nearestIsMuchCloser = second && nearest.dist < second.dist * 0.4;
    placesStr = placesNearby.map((p, i) => {
      const highlight = '';  // neoznačujeme nejbližší — typ místa je důležitější než vzdálenost
      return `  - ${p.name} (${p.primaryType || 'neznámý typ'}, ${p.dist}m${p.rating ? ', ★' + p.rating : ''})${highlight}`;
    }).join('\n');
  }

  const nearbyStr = nearbyMembers.length > 0
    ? '\nDalší členové rodiny na tomto místě:\n' + nearbyMembers.map(m => `  - ${m.member} byl zde před ${m.minutesAgo} min`).join('\n')
    : '';

  const prompt = `Analyzuješ GPS data rodinného sledovacího systému. Rozhodneš, zda zastávka stojí za uložení.

Člen rodiny: ${member}
Čas: ${dayOfWeek} ${timeStr}
Zdroj: ${source === 'silence' ? 'Significant mode (GPS bod před odjezdem, mezera ' + gapMinutes + ' min)' : 'cluster bodů v Move mode, délka minimálně ' + gapMinutes + ' min (člen je pravděpodobně stále na místě — skutečná délka bude delší)'}
Souřadnice: ${lat.toFixed(5)}, ${lon.toFixed(5)}
Předchozí návštěvy tohoto místa: ${historyVisits}×${historyVisits >= 3 ? ' — PRAVIDELNĚ navštěvované místo. Opakovaná návštěva je SILNÝ důkaz, že místo je pro rodinu důležité (i bez klasického POI, např. práce, návštěva, kroužek) — silně zvaž uložení a vyšší confidence.' : (historyVisits >= 1 ? ' — místo už bylo navštíveno dříve, zvaž to jako signál.' : '')}
${nearbyStr}
Nejbližší místa z Google Places:
${placesStr}

Rodina v ČR. Chceme ukládat: práce, obchod, lékař, restaurace, sport, škola, návštěvy, turistické atrakce. Nechceme: průjezdy, čekání v autě, GPS artefakty. Délka zastávky je minimální hodnota — skutečná délka je delší, proto nezamítej jen kvůli krátké délce.

Pravidla pro výběr názvu:
1. Ignoruj generická místa bez turistické/praktické hodnoty: bankomaty (atm), benzínky, parkoviště, utility, průmyslové služby.
2. Pokud je v okolí turistická atrakce, hrad, zámek, zoo, muzeum, restaurace nebo obchod — upřednostni ji před bankomaty a podobnými.
3. Vzdálenost je důležitá ale ne absolutní — bankomat 20m je méně pravděpodobný cíl než zámek 100m v turistické lokalitě.
4. Kontext rozhoduje: pokud jsou v okolí samé turistické podniky (penziony, restaurace, info centrum), jde o turistické místo.

Odpověz POUZE jako JSON:
{"should_save": true/false, "name": "název česky nebo null", "confidence": 0.0-1.0, "reason": "zdůvodnění česky"}`;

  const startTs = Date.now();
  await logEvent('ai_request', { member, lat, lon, prompt, context: { gapMinutes, placesCount: placesNearby.length, historyVisits, source } });

  try {
    const data = await httpPost(
      'api.anthropic.com',
      '/v1/messages',
      {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: 'Odpovídáš POUZE validním JSON objektem bez markdown formátování, backtick bloků nebo jakéhokoliv dalšího textu.',
        messages: [{ role: 'user', content: prompt }]
      })
    );

    const durationMs = Date.now() - startTs;
    const raw = data.content?.[0]?.text || '';

    let result;
    try {
      // Odstraň markdown backticky, komentáře a vše před { a za }
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON object found');
      result = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch(e) {
      await logEvent('ai_error', { member, lat, lon, error: 'Nelze parsovat JSON: ' + raw, durationMs });
      return null;
    }

    await logEvent('ai_response', { member, lat, lon, result, durationMs });
    console.log(`[AI] ${member} @ ${lat.toFixed(5)},${lon.toFixed(5)} → ${result.should_save ? 'ULOŽIT' : 'ZAHODIT'} "${result.name}" confidence=${result.confidence} (${durationMs}ms)`);
    console.log(`[AI] ${result.reason}`);
    return result;

  } catch(e) {
    const durationMs = Date.now() - startTs;
    console.error('[AI] Chyba:', e.message);
    await logEvent('ai_error', { member, lat, lon, error: e.message, durationMs });
    return null;
  }
}

// ─── Redis ────────────────────────────────────────────────────────────────────
const redisLive = createClient({ socket: { host: REDIS_HOST, port: 6379 } });
const redisTest = createClient({ socket: { host: REDIS_TEST_HOST, port: 6379 } });
redisLive.on('error', e => console.error('Redis LIVE error:', e));
redisTest.on('error', e => console.error('Redis TEST error:', e));

let currentMode = 'live';
let redis = redisLive;

function setMode(mode) {
  currentMode = mode;
  redis = mode === 'live' ? redisLive : redisTest;
  console.log(`[MODE] Přepnuto na: ${mode.toUpperCase()}`);
}

const app = express();
app.use(express.json());
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

// ─── Konstanty ────────────────────────────────────────────────────────────────
const CLUSTER_RADIUS = 80;
const LEAVE_RADIUS = 150;
const MERGE_RADIUS = 150;   // detekce do této vzdálenosti od existujícího místa = totéž místo (drift)
const MIN_STOP_DURATION = 5 * 60 * 1000;
const MIN_STOP_POINTS = 3;
const SILENCE_MIN_DIST = 200;
const SILENCE_MIN_GAP = 20 * 60 * 1000;     // 20 minut — filtruje průjezdy
const SILENCE_MAX_GAP = 4 * 60 * 60 * 1000;

const AI_AUTOSAVE_THRESHOLD = 0.80;
const AI_SUGGEST_THRESHOLD = 0.65;

// Bonus k confidence za opakované návštěvy (deterministicky, nezávisle na AI)
const VISIT_BONUS_PER = 0.07;   // za každou návštěvu nad první
const VISIT_BONUS_MAX = 0.30;   // strop bonusu

// Cooldown na AI dotazy pro stejnou oblast — jedno místo spálí AI max jednou za 6 h
const AI_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const AI_COOLDOWN_RADIUS = MERGE_RADIUS;   // 150 m

// Záruka pro dlouhé stání — po této době se místo označí vždy (i když AI nedoporučí)
const LONG_STAY_MS = 30 * 60 * 1000;       // 30 minut


// ─── Rozlišení pohybu ─────────────────────────────────────────────────────────
// Kombinuje motionactivities (Core Motion iPhone) a vel (GPS rychlost v km/h)
function resolveMotion(motionActivities, vel) {
  const acts = motionActivities || [];
  const speed = vel || 0;

  // Stojí — nepřepisuj geofence status
  if (acts.includes('stationary') && speed < 3) return null;

  // Automotive nebo cycling vždy vrátí auto/kolo bez ohledu na vel
  // (GPS drift způsobuje nízké vel i při jízdě)
  if (acts.includes('automotive')) return 'auto';
  if (acts.includes('cycling') && speed > 1) return 'kolo';

  // Velmi pomalý pohyb nebo stojí
  if (speed < 1) return null;

  // ── Pěšky: 1–5 km/h ──────────────────────────────────────────────────────
  if (speed <= 5) {
    if (acts.includes('running')) return 'běh';
    return 'pěšky';
  }

  // ── Běh: 6–15 km/h — rozliš od kola podle motion ─────────────────────────
  if (speed <= 15) {
    if (acts.includes('running'))  return 'běh';
    if (acts.includes('cycling'))  return 'kolo';
    if (acts.includes('walking') && speed <= 10)  return 'pěšky';
    if (acts.includes('automotive')) return 'auto';
    // Bez motion: 6-10 spíš běh, 10-15 spíš kolo
    return speed <= 10 ? 'běh' : 'kolo';
  }

  // ── Kolo / pomalé auto: 15–30 km/h ───────────────────────────────────────
  if (speed <= 30) {
    if (acts.includes('cycling'))    return 'kolo';
    if (acts.includes('automotive')) return 'auto';
    if (acts.includes('running'))    return 'běh';  // velmi rychlý běžec
    // Bez motion: do 22 km/h spíš kolo, nad 22 spíš auto
    return speed <= 22 ? 'kolo' : 'auto';
  }

  // ── Auto: nad 30 km/h ─────────────────────────────────────────────────────
  return 'auto';
}

// ─── Geofence hystereze ──────────────────────────────────────────────────────
// Geofence se aplikuje až po N po sobě jdoucích bodech uvnitř s nízkou rychlostí
const FENCE_CONFIRM_MS = 2 * 60 * 1000; // 2 minuty simTime
const memberFenceHyst = {}; // { member: { fenceId, firstTs } }

function confirmFence(member, fenceName, fenceId, isMovingFast, ts) {
  if (isMovingFast) {
    memberFenceHyst[member] = null;
    return false;
  }
  const h = memberFenceHyst[member];
  if (!h || h.fenceId !== fenceId || ts < h.firstTs) {
    memberFenceHyst[member] = { fenceId, firstTs: ts };
    return false;
  }
  const elapsed = ts - h.firstTs;
  return elapsed >= FENCE_CONFIRM_MS;
}

// ─── Motion hystereze ────────────────────────────────────────────────────────
// Ukládá posledních N motion stavů pro každého člena
// Přechod na nový stav jen pokud je konzistentní N bodů za sebou
const MOTION_HISTORY_SIZE = 3; // počet bodů pro potvrzení změny
const memberMotionHistory = {}; // { member: ['auto','auto','pesky'] }

function resolveMotionWithHysteresis(member, motionActivities, vel) {
  const newMotion = resolveMotion(motionActivities, vel);

  if (!memberMotionHistory[member]) memberMotionHistory[member] = [];
  const history = memberMotionHistory[member];

  // Přidej nový stav do historie
  history.push(newMotion);
  if (history.length > MOTION_HISTORY_SIZE) history.shift();

  // Vrať nový stav jen pokud jsou poslední N bodů stejné
  if (history.length < MOTION_HISTORY_SIZE) return history[0]; // málo dat — vrať první
  const allSame = history.every(m => m === newMotion);
  if (allSame) return newMotion;

  // Nekonzistentní — vrať nejčastější stav z historie
  const counts = {};
  for (const m of history) counts[m] = (counts[m] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Tracker ──────────────────────────────────────────────────────────────────
const trackers = {};

// Paměť posledního způsobu pohybu — aby rozjezd autem neskočil na kolo
const lastMotion = {};  // member → { motion, ts }

// ─── Lepkavý dopravní prostředek ───────────────────────────────────────────────
// Aktivita je setrvačná: jednou na kole jedeš dlouho. Krátké zpomalení/zastávka
// (semafor, kopec, provoz) prostředek nemění. Změna jen na opakované potvrzení,
// dlouhé stání prostředek zapomene (reálně jsi dorazil a vystoupil).
const MOTION_CHANGE_CONFIRM = 5;             // bodů po sobě pro ZMĚNU prostředku
const MOTION_STOP_FORGET_MS = 5 * 60 * 1000; // stání → po 5 min zapomeň prostředek
const motionState = {};  // member → { mode, candMode, candCount, stoppedSince }

function resolveMotionSticky(member, motionActivities, vel, ts) {
  const inst = resolveMotion(motionActivities, vel);   // okamžité zařazení (rychlost+motion)
  let st = motionState[member];
  if (!st) { st = { mode: null, candMode: null, candCount: 0, stoppedSince: null }; motionState[member] = st; }

  // ── Stojí / velmi pomalu (inst===null) ──────────────────────────────────────
  if (inst === null) {
    if (!st.mode) return null;                 // nic nedržíme
    if (st.stoppedSince === null) st.stoppedSince = ts;
    if (ts - st.stoppedSince >= MOTION_STOP_FORGET_MS) {
      // dost dlouhé stání → zapomeň prostředek (příští rozjezd se klasifikuje znovu)
      st.mode = null; st.candMode = null; st.candCount = 0; st.stoppedSince = null;
      return null;
    }
    return st.mode;                            // krátká pauza → drž prostředek (semafor, zácpa)
  }

  // ── Pohyb (inst je auto/kolo/běh/pěšky) ──────────────────────────────────────
  st.stoppedSince = null;                      // zase jedeme

  if (!st.mode) { st.mode = inst; st.candMode = null; st.candCount = 0; return st.mode; } // první zařazení hned
  if (inst === st.mode) { st.candMode = null; st.candCount = 0; return st.mode; }          // potvrzení stávajícího

  // jiný prostředek než držíme → kandidát na změnu, musí se opakovat
  if (st.candMode === inst) st.candCount++; else { st.candMode = inst; st.candCount = 1; }
  if (st.candCount >= MOTION_CHANGE_CONFIRM) {
    st.mode = inst; st.candMode = null; st.candCount = 0;
    return st.mode;                            // potvrzená změna
  }
  return st.mode;                              // jednotlivý odlišný bod → ignoruj, drž stávající
}

function getTracker(member) {
  if (!trackers[member]) trackers[member] = { cluster: null, lastPoint: null };
  return trackers[member];
}

async function saveTracker(member) {
  try {
    const t = trackers[member];
    if (!t) return;
    await redisLive.set('tracker:' + member, JSON.stringify({ cluster: t.cluster, lastPoint: t.lastPoint }));
  } catch(e) {}
}

async function loadTrackers() {
  for (const m of MEMBERS) {
    try {
      const raw = await redisLive.get('tracker:' + m);
      if (raw) {
        trackers[m] = JSON.parse(raw);
        const t = trackers[m];
        if (t.cluster) console.log('✓ Tracker [' + m + '] obnoven: ' + t.cluster.points.length + ' bodů');
      }
    } catch(e) {}
  }
}

function clusterCenter(points) {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
}

// ─── Zpracování zastávky ──────────────────────────────────────────────────────
// ─── AI cooldown: stejná oblast smí spustit AI dotaz max jednou za AI_COOLDOWN_MS ──
// Ukládá se do aktivního Redisu (v test módu izolováno do redisTest).
async function aiRecentlyAsked(lat, lon) {
  try {
    const raw = await redis.get('ai_recent');
    const arr = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - AI_COOLDOWN_MS;
    return arr.some(e => e.ts >= cutoff && distance(lat, lon, e.lat, e.lon) < AI_COOLDOWN_RADIUS);
  } catch(e) { return false; }
}

async function recordAiAsked(lat, lon) {
  try {
    const raw = await redis.get('ai_recent');
    let arr = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - AI_COOLDOWN_MS;
    arr = arr.filter(e => e.ts >= cutoff);   // prune staré
    arr.push({ lat, lon, ts: Date.now() });
    if (arr.length > 500) arr = arr.slice(-500);
    await redis.set('ai_recent', JSON.stringify(arr));
  } catch(e) {}
}

async function processStopCandidate(member, lat, lon, gapMinutes, source, repeat = false, forceLong = false, ts = Date.now()) {
  // Zaznamenej návštěvu hned (dedup 6 h zajistí, že dlouhé stání = 1 návštěva,
  // a že early(5 min)+long(30 min) vyhodnocení téhož stání se nezapíše dvakrát).
  // isNewVisit = true jen u SAMOSTATNÉ návštěvy (≥6 h od minulé), ne u driftu.
  const isNewVisit = await recordVisit(member, lat, lon, ts);


  // Známé místo — uvnitř existující geofence, nepřidávat znovu
  const alreadyKnown = dynamicFences.some(f => distance(lat, lon, f.lat, f.lon) < Math.max(f.radius, CLUSTER_RADIUS));
  if (alreadyKnown) {
    console.log(`[STOP] Známé místo @ ${lat.toFixed(5)},${lon.toFixed(5)}, přeskakuji`);
    return;
  }

  // Robustní deduplikace proti driftu — blízké detekce sloučí do JEDNOHO místa.
  // Řeší i čekající ("?") místa od stejného člena: dlouhé stání s GPS driftem
  // dříve vytvořilo více klastrů → více "?" míst. Staré dedupeKey (mřížka ~111 m)
  // ani cross-member kontrola tohle nezachytily.
  const placesRaw = await redis.get('detected_places');
  const allPlaces = placesRaw ? JSON.parse(placesRaw) : [];
  let nearest = null, nearestDist = Infinity;
  for (const p of allPlaces) {
    const d = distance(lat, lon, p.lat, p.lon);
    if (d < MERGE_RADIUS && d < nearestDist) { nearest = p; nearestDist = d; }
  }
  if (nearest) {
    if (!nearest.name) {
      // Čekající místo — aktualizuj (delší trvání, novější čas) místo duplikátu
      nearest.duration = Math.max(nearest.duration || 0, gapMinutes);
      nearest.detectedAt = Date.now();
      nearest.mergeCount = (nearest.mergeCount || 1) + 1;
      if (!nearest.detectedByAll) nearest.detectedByAll = [nearest.detectedBy];
      if (!nearest.detectedByAll.includes(member)) nearest.detectedByAll.push(member);
      await redis.set('detected_places', JSON.stringify(allPlaces));
      broadcast({ type: 'stop_detected', member, place: nearest });
      console.log(`[STOP] Sloučeno s čekajícím místem ${nearest.id} (${nearest.mergeCount}×, ${Math.round(nearestDist)}m, ${gapMinutes}min)`);
      await logEvent('place_merged', { member, lat, lon, mergedInto: nearest.id, mergeCount: nearest.mergeCount, distM: Math.round(nearestDist), gapMinutes, source });
      // Samostatná návštěva (≥6 h od minulé) = nová informace → přehodnoť "?" přes AI
      // s bonusem za opakované návštěvy. Drift téhož stání (isNewVisit=false) jen sloučí.
      if (isNewVisit) {
        console.log(`[STOP] Samostatná návštěva čekajícího místa ${nearest.id} — přehodnocuji přes AI`);
        await reevaluatePendingPlace(member, nearest, allPlaces, ts, source);
      }
    } else {
      console.log(`[STOP] Blízko pojmenovaného místa "${nearest.name}" (${Math.round(nearestDist)}m), přeskakuji`);
      await logEvent('place_rejected', { member, lat, lon, reason: 'near_named_place', placeName: nearest.name, distM: Math.round(nearestDist), source });
    }
    return;
  }

  // Cooldown brána — pokud pro tuto oblast padl AI dotaz za posledních 6 h, přeskoč
  // Google i Claude. Chytá i zamítnutá místa, po kterých nezůstane "?" k merge.
  // forceLong (eskalace dlouhého stání) cooldown OBCHÁZÍ — je to legitimní druhý pokus.
  if (!forceLong && await aiRecentlyAsked(lat, lon)) {
    console.log(`[STOP] AI cooldown @ ${lat.toFixed(5)},${lon.toFixed(5)} — přeskakuji AI dotaz (úspora)`);
    await logEvent('ai_skipped', { member, lat, lon, reason: 'cooldown', gapMinutes, source });
    return;
  }

  // Kontext pro AI
  await recordAiAsked(lat, lon);   // zaznamenej cooldown PŘED drahými voláními (Google + Claude)
  const placesNearby = await getNearbyPlaces(lat, lon, 300);
  const historyVisits = await countNearbyVisits(member, lat, lon, ts, VISIT_RADIUS_M);
  const nearbyMembers = await getRecentNearbyMembers(member, lat, lon);

  const now = new Date(ts);   // čas datového bodu (v simulaci = simulovaný čas, ne reálný)
  const days = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const dayOfWeek = days[now.getDay()];
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  await logEvent('stop_candidate', { member, lat, lon, gapMinutes, historyVisits, nearbyMembers, placesCount: placesNearby.length, dayOfWeek, timeStr, source });
  console.log(`[STOP] Kandidát [${member}] ${gapMinutes}min @ ${lat.toFixed(5)},${lon.toFixed(5)} | ${placesNearby.length} POI | ${historyVisits}x navštíveno`);

  const aiResult = await askClaude(member, lat, lon, { gapMinutes, placesNearby, historyVisits, nearbyMembers, dayOfWeek, timeStr, source });

  // Tvrdý bonus k confidence za opakované návštěvy — opakování je silný signál,
  // který nenecháváme jen na uvážení AI. +0,07 za každou návštěvu nad první, strop +0,30.
  if (aiResult && typeof aiResult.confidence === 'number' && historyVisits > 1) {
    const bonus = Math.min(VISIT_BONUS_MAX, (historyVisits - 1) * VISIT_BONUS_PER);
    const before = aiResult.confidence;
    aiResult.confidence = Math.min(1, aiResult.confidence + bonus);
    if (bonus > 0) {
      console.log(`[STOP] Bonus za ${historyVisits}× návštěvu: confidence ${before.toFixed(2)} → ${aiResult.confidence.toFixed(2)} (+${bonus.toFixed(2)})`);
      await logEvent('visit_bonus', { member, lat, lon, historyVisits, confidenceBefore: before, confidenceAfter: aiResult.confidence, bonus });
    }
  }

  if (!aiResult) {
    // Fallback — jen pokud je místo opakované a má POI
    if (placesNearby.length > 0 && historyVisits >= 3) {
      await savePlaceCandidate(member, lat, lon, gapMinutes, placesNearby, null, 0, 'fallback', source);
    } else if (forceLong) {
      // Dlouhé stání: AI nedostupné, ale stání 30+ min označ vždy jako "?"
      console.log(`[STOP] Dlouhé stání ${gapMinutes}min, AI nedostupné — vytvářím "?" napřímo`);
      await savePlaceCandidate(member, lat, lon, gapMinutes, placesNearby, null, 0, 'long_stay', source);
    } else {
      await logEvent('place_rejected', { member, lat, lon, reason: 'AI nedostupné, nedostatek signálů', source });
    }
    return;
  }

  if (!aiResult.should_save || aiResult.confidence < AI_SUGGEST_THRESHOLD) {
    if (forceLong) {
      // Dlouhé stání: i když AI nedoporučuje, 30+ min na místě označ jako "?"
      // (s případným návrhem názvu od AI, pokud nějaký dala)
      console.log(`[STOP] Dlouhé stání ${gapMinutes}min, AI nedoporučila (conf=${aiResult.confidence}) — přesto "?": ${aiResult.reason}`);
      await savePlaceCandidate(member, lat, lon, gapMinutes, placesNearby, aiResult.name || null, aiResult.confidence || 0, 'long_stay: ' + (aiResult.reason || ''), source);
      return;
    }
    console.log(`[STOP] Zamítnuto (confidence=${aiResult.confidence}): ${aiResult.reason}`);
    await logEvent('place_rejected', { member, lat, lon, gapMinutes, source, aiName: aiResult.name, aiConfidence: aiResult.confidence, aiReason: aiResult.reason });
    return;
  }

  await savePlaceCandidate(member, lat, lon, gapMinutes, placesNearby, aiResult.name, aiResult.confidence, aiResult.reason, source);
}

async function savePlaceCandidate(member, lat, lon, gapMinutes, placesNearby, aiName, aiConfidence, aiReason, source) {
  const placeId = 'place_' + Date.now();
  const autoSave = aiConfidence >= AI_AUTOSAVE_THRESHOLD && aiName;

  const place = {
    id: placeId, lat, lon,
    detectedAt: Date.now(), detectedBy: member,
    duration: gapMinutes, source,
    name: autoSave ? aiName : null,
    suggestedName: aiName,
    aiConfidence, aiReason,
    candidates: placesNearby,
  };

  if (autoSave) {
    console.log(`[STOP] Auto-uloženo: "${aiName}" (confidence=${aiConfidence})`);
    const fence = { id: placeId, name: aiName, lat, lon, radius: 150 };
    dynamicFences.push(fence);
    await saveFences();
    broadcast({ type: 'fence_added', fence });
    await logEvent('place_saved', { member, lat, lon, name: aiName, aiConfidence, aiReason, autoSave: true, source });
  } else {
    console.log(`[STOP] Návrh: "${aiName}" (confidence=${aiConfidence}) — čeká na potvrzení`);
    await logEvent('place_saved', { member, lat, lon, name: null, suggestedName: aiName, aiConfidence, aiReason, autoSave: false, source });
  }

  const raw = await redis.get('detected_places');
  const places = raw ? JSON.parse(raw) : [];
  places.push(place);
  await redis.set('detected_places', JSON.stringify(places));
  broadcast({ type: 'stop_detected', member, place });
}

// Přehodnotí existující čekající ("?") místo přes AI při SAMOSTATNÉ návštěvě —
// s bonusem za opakované návštěvy. Buď ho povýší na pojmenované (auto-uložení),
// nebo aspoň zlepší návrh názvu. Obchází cooldown (jde o legitimní novou návštěvu).
async function reevaluatePendingPlace(member, place, allPlaces, ts, source) {
  const lat = place.lat, lon = place.lon;
  const historyVisits = await countNearbyVisits(member, lat, lon, ts, VISIT_RADIUS_M);
  const placesNearby = await getNearbyPlaces(lat, lon, 300);
  const nearbyMembers = await getRecentNearbyMembers(member, lat, lon);
  const now = new Date(ts);
  const days = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const dayOfWeek = days[now.getDay()];
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  await recordAiAsked(lat, lon);   // záznam cooldownu (přehodnocení je AI dotaz)
  const aiResult = await askClaude(member, lat, lon, { gapMinutes: place.duration || 0, placesNearby, historyVisits, nearbyMembers, dayOfWeek, timeStr, source });
  if (!aiResult) return;   // AI nedostupné — nech "?" jak je

  // Tvrdý bonus za opakované návštěvy (stejně jako v hlavní cestě)
  if (typeof aiResult.confidence === 'number' && historyVisits > 1) {
    const bonus = Math.min(VISIT_BONUS_MAX, (historyVisits - 1) * VISIT_BONUS_PER);
    const before = aiResult.confidence;
    aiResult.confidence = Math.min(1, aiResult.confidence + bonus);
    if (bonus > 0) {
      console.log(`[STOP] Reeval bonus za ${historyVisits}× návštěvu: ${before.toFixed(2)} → ${aiResult.confidence.toFixed(2)}`);
      await logEvent('visit_bonus', { member, lat, lon, historyVisits, confidenceBefore: before, confidenceAfter: aiResult.confidence, bonus, context: 'reeval' });
    }
  }

  // Aktualizuj návrh/confidence na existujícím místě
  if (aiResult.name) place.suggestedName = aiResult.name;
  place.aiConfidence = aiResult.confidence;
  place.aiReason = aiResult.reason;

  const autoSave = aiResult.should_save && aiResult.confidence >= AI_AUTOSAVE_THRESHOLD && aiResult.name;
  if (autoSave) {
    place.name = aiResult.name;
    if (!dynamicFences.some(f => f.id === place.id)) {
      const fence = { id: place.id, name: aiResult.name, lat, lon, radius: 150 };
      dynamicFences.push(fence);
      await saveFences();
      broadcast({ type: 'fence_added', fence });
    }
    console.log(`[STOP] "?" povýšeno na "${aiResult.name}" po ${historyVisits}× návštěvě (conf=${aiResult.confidence.toFixed(2)})`);
    await logEvent('place_saved', { member, lat, lon, name: aiResult.name, aiConfidence: aiResult.confidence, aiReason: aiResult.reason, autoSave: true, source: 'reeval', historyVisits });
  } else {
    console.log(`[STOP] "?" přehodnoceno po ${historyVisits}× návštěvě — návrh "${aiResult.name || '–'}" (conf=${aiResult.confidence.toFixed(2)}), zůstává čekat`);
    await logEvent('place_reevaluated', { member, lat, lon, historyVisits, confidence: aiResult.confidence, suggested: aiResult.name || null, promoted: false, source: 'reeval' });
  }
  await redis.set('detected_places', JSON.stringify(allPlaces));
  broadcast({ type: 'stop_detected', member, place });
}

// ─── Silence detection ────────────────────────────────────────────────────────
// Significant mode: mezera > 20 minut mezi dvěma body = stáli jsme někde.
// Souřadnice zastávky = výchozí bod (kde jsme byli před odjezdem).
async function detectSilentStop(member, prevPoint, newLat, newLon, newTs) {
  const timeDiff = newTs - prevPoint.ts;
  const spaceDiff = distance(prevPoint.lat, prevPoint.lon, newLat, newLon);

  if (timeDiff < SILENCE_MIN_GAP) return;
  if (timeDiff > SILENCE_MAX_GAP) return;
  if (spaceDiff < SILENCE_MIN_DIST) return;

  // Filtruj rychlou jízdu — pokud vzdálenost odpovídá jízdě autem (>30km/h), ignoruj
  // (timeDiff v ms, spaceDiff v m → rychlost v km/h)
  const speedKmh = (spaceDiff / (timeDiff / 1000)) * 3.6;
  if (speedKmh > 30) {
    // Příliš rychlý pohyb — není to silence stop ale jízda se simulovaným časem
    return;
  }

  const gapMinutes = Math.round(timeDiff / 60000);
  console.log(`[SILENCE] [${member}] mezera ${gapMinutes}min, vzdálenost ${Math.round(spaceDiff)}m, ${Math.round(speedKmh)}km/h`);

  await processStopCandidate(member, prevPoint.lat, prevPoint.lon, gapMinutes, 'silence', false, false, prevPoint.ts);
}

// ─── Cluster tracking ─────────────────────────────────────────────────────────
// Move mode: husté body v malém okruhu = reálná zastávka.
async function evaluateCluster(member, cluster, repeat = false, forceLong = false) {
  if (!cluster || cluster.points.length < MIN_STOP_POINTS) return;
  // Pouzij ts posledniho bodu misto Date.now() — funguje i se simulovanym casem
  const lastTs = cluster.points[cluster.points.length - 1].ts;
  const duration = lastTs - cluster.startTs;
  if (duration < MIN_STOP_DURATION) return;
  const center = clusterCenter(cluster.points);
  await processStopCandidate(member, center.lat, center.lon, Math.round(duration / 60000), 'cluster', repeat, forceLong, lastTs);
}

// ─── Hlavní tracker ───────────────────────────────────────────────────────────
async function updateTracker(member, lat, lon, ts, motionActivities = []) {
  const tracker = getTracker(member);

  if (tracker.lastPoint) {
    await detectSilentStop(member, tracker.lastPoint, lat, lon, ts);
  }

  if (!tracker.cluster) {
    tracker.cluster = { points: [{ lat, lon, ts }], startTs: ts };
    tracker.lastPoint = { lat, lon, ts };
    await saveTracker(member);
    return;
  }

  const center = clusterCenter(tracker.cluster.points);
  const dist = distance(lat, lon, center.lat, center.lon);

  // Automotive uzavře cluster jen pokud cluster obsahuje stationary body (bylo stání)
  const isAutomotive = motionActivities.includes('automotive') || motionActivities.includes('cycling');
  const clusterHasStationary = tracker.cluster.points.some(p => p.stationary);
  const forceClose = isAutomotive && clusterHasStationary;

  if (dist <= CLUSTER_RADIUS && !forceClose) {
    // Ulož info o pohybu do bodu
    tracker.cluster.points.push({ lat, lon, ts, stationary: !isAutomotive });
    const durMin = Math.round((ts - tracker.cluster.startTs) / 60000);
    console.log(`[TRACK] [${member}] V clusteru dist=${Math.round(dist)}m dur=${durMin}min pts=${tracker.cluster.points.length}`);
    // Detekce JEDNOU krátce po příjezdu (~5 min). Žádné opakování každých 10 min —
    // cooldown + merge brána ochrání před opakovanými AI dotazy při dlouhém stání.
    if (!tracker.cluster.earlyDetected
        && (ts - tracker.cluster.startTs) >= MIN_STOP_DURATION
        && tracker.cluster.points.length >= MIN_STOP_POINTS) {
      tracker.cluster.earlyDetected = true;
      console.log(`[TRACK] [${member}] Detekce zastávky po ${durMin} min`);
      evaluateCluster(member, tracker.cluster); // async, neblokuj
    }
    // Záruka pro DLOUHÉ stání: po LONG_STAY_MIN min, pokud pro tohle místo pořád
    // není ŽÁDNÉ místo (pojmenované ani "?"), spusť jednu eskalovanou detekci —
    // obejde cooldown a i při zamítnutí AI vytvoří "?". Délka stání je silný signál.
    if (!tracker.cluster.longDone
        && (ts - tracker.cluster.startTs) >= LONG_STAY_MS
        && tracker.cluster.points.length >= MIN_STOP_POINTS) {
      tracker.cluster.longDone = true;
      const c = clusterCenter(tracker.cluster.points);
      const knownFence = dynamicFences.some(f => distance(c.lat, c.lon, f.lat, f.lon) < Math.max(f.radius, CLUSTER_RADIUS));
      let knownPlace = knownFence;
      if (!knownPlace) {
        try {
          const raw = await redis.get('detected_places');
          const places = raw ? JSON.parse(raw) : [];
          knownPlace = places.some(p => distance(c.lat, c.lon, p.lat, p.lon) < MERGE_RADIUS);
        } catch(e) {}
      }
      if (!knownPlace) {
        console.log(`[TRACK] [${member}] Dlouhé stání ${durMin}min bez uloženého místa — eskalovaná detekce`);
        evaluateCluster(member, tracker.cluster, false, true); // forceLong=true
      }
    }
  } else if (dist > LEAVE_RADIUS || forceClose) {
    if (forceClose) console.log(`[TRACK] [${member}] automotive uzavrel stani dist=${Math.round(dist)}m`);
    else console.log(`[TRACK] [${member}] odchod dist=${Math.round(dist)}m`);
    // Pokud už proběhla průběžná detekce, nespouštěj znovu (deduplikace ochrání ale zbytečný AI call)
    if (!tracker.cluster.earlyDetected) {
      await evaluateCluster(member, tracker.cluster);
    } else {
      console.log(`[TRACK] [${member}] Přeskočeno — průběžná detekce již proběhla`);
    }
    tracker.cluster = { points: [{ lat, lon, ts, stationary: !isAutomotive }], startTs: ts };
  } else {
    console.log(`[TRACK] [${member}] přechodná zóna dist=${Math.round(dist)}m`);
  }

  tracker.lastPoint = { lat, lon, ts };
  await saveTracker(member);
}


// ─── Výběr obrázku pro status ─────────────────────────────────────────────────
const IMG_DIR_PLACES = '/app/public/img/places';  // místa — doma, školka, karate...
const IMG_DIR_MOTION = '/app/public/img/motion';  // pohyb — auto, kolo, běh, pěšky
const IMG_CACHE_TTL = 7 * 24 * 3600;

// Per-member image cache — drží obrázek po dobu jednoho pobytu na statusu
const memberImgCache = {}; // { member: { status, img } }

const MOTION_STATUSES = ['auto', 'kolo', 'běh', 'beh', 'pěšky', 'pesky', 'running', 'cycling', 'walking'];

function isMotionStatus(status) {
  return MOTION_STATUSES.includes((status || '').toLowerCase());
}

function getAvailableImages(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
  } catch(e) { return []; }
}

async function suggestImageForStatus(status) {
  if (!status || status === 'cesta' || status === 'neznamo') return null;

  const dir = isMotionStatus(status) ? IMG_DIR_MOTION : IMG_DIR_PLACES;
  const images = getAvailableImages(dir);
  const subfolder = isMotionStatus(status) ? 'motion' : 'places';
  if (images.length === 0) return null;

  // Zkus přímou shodu — soubory které obsahují název statusu (auto, auto_1, auto_2...)
  const statusKey = status.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const directMatches = images.filter(f => {
    const base = f.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '_');
    return base === statusKey || base.startsWith(statusKey + '_') || base.startsWith(statusKey + '-');
  });

  if (directMatches.length > 0) {
    // Náhodně vyber variantu — volající (processGPS) ji drží přes memberImgCache
    const chosen = directMatches[Math.floor(Math.random() * directMatches.length)];
    const finalPath = subfolder + '/' + chosen;
    console.log(`[IMG] Status "${status}" → varianta "${chosen}" (${directMatches.length} dostupných)`);
    return finalPath;
  }

  // Žádná přímá shoda — zavolej AI (výsledek cachuj, ale ze seznamu AI kandidátů
  // vyber náhodně při každém volání)
  const cacheKey = 'imgcache:' + statusKey;
  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      // Cache obsahuje JSON pole kandidátů — vyber náhodně (nový pobyt = nová varianta)
      let candidates;
      try { candidates = JSON.parse(cached); } catch(e) { candidates = cached ? [cached] : []; }
      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        console.log(`[IMG] Cache hit: "${status}" → "${chosen}" (${candidates.length} variant)`);
        return chosen || null;
      }
      return null;
    }
  } catch(e) {}

  if (!ANTHROPIC_API_KEY) return null;

  try {
    const prompt = `Vybíráš obrázky pro zobrazení stavu člena rodiny na GPS hodinkách.

Aktuální stav: "${status}"

Dostupné obrázky (názvy souborů):
${images.map(f => '- ' + f).join('\n')}

Vyber VŠECHNY soubory které by mohly odpovídat danému stavu (mohou být varianty stejného tématu).
Pokud žádný neodpovídá, vrať prázdný string.

Odpověz POUZE názvy souborů oddělené čárkou, nebo prázdným stringem. Bez dalšího textu.`;

    const data = await httpPost(
      'api.anthropic.com',
      '/v1/messages',
      {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      })
    );

    const result = (data.content?.[0]?.text || '').trim();
    const candidates = result.split(',')
      .map(f => f.trim())
      .filter(f => images.includes(f))
      .map(f => subfolder + '/' + f);

    const finalPath = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : '';

    console.log(`[IMG] Status "${status}" (${subfolder}) → AI vybrala ${candidates.length} kandidátů, zvoleno: "${finalPath || 'žádný'}"`);
    // Ulož pole kandidátů — při každém novém pobytu se vybere náhodná varianta
    await redis.set(cacheKey, JSON.stringify(candidates), { EX: IMG_CACHE_TTL });
    await logEvent('img_selected', { status, subfolder, candidates, selectedImg: finalPath || null, availableImgs: images });
    return finalPath || null;

  } catch(e) {
    console.error('[IMG] Chyba:', e.message);
    return null;
  }
}

async function processGPS(member, lat, lon, motionActivities = [], vel = 0, simTs = null, forceLive = false, source = 'unknown') {
  const ts = simTs || Date.now();
  // MQTT a live zdroje vždy zapisují do live Redis bez ohledu na mód
  const activeRedis = (forceLive || currentMode === 'live') ? redisLive : redis;
  let status = resolveStatus(member, lat, lon, vel, motionActivities, simTs || Date.now());
  // Pohyb má přednost před geofence (kromě doma). Lepkavý automat: prostředek
  // se drží a mění až po MOTION_CHANGE_CONFIRM bodech; krátká zastávka ho nemaže.
  let motion = resolveMotionSticky(member, motionActivities, vel, ts);

  // Motion přepisuje status pouze pokud jsme na cestě (ne uvnitř geofence)
  if (motion) {
    if (status === 'cesta') {
      // GPS drift — bod těsně mimo fence radius ale stojíme (ne automotive/cycling)
      const isMovingFast = ((motionActivities.includes('automotive') || motionActivities.includes('cycling')) && vel > 5) || vel > 15;
      if (!isMovingFast) {
        const nearFence = dynamicFences.find(f =>
          (!f.only || f.only.includes(member)) &&
          distance(lat, lon, f.lat, f.lon) < f.radius * 1.5
        );
        if (nearFence && confirmFence(member, nearFence.name, nearFence.id, false, simTs || Date.now())) {
          status = nearFence.name;
        } else {
          status = motion;
        }
      } else {
        status = motion;
      }
    }
    // Pokud jsme doma a pohybujeme se — necháme doma
  }
  // memberImgCache drží obrázek po dobu jednoho pobytu — mění se jen při změně statusu
  let img;
  const mc = memberImgCache[member];
  if (mc && mc.status === status) {
    img = mc.img;
  } else {
    img = await suggestImageForStatus(status);
    memberImgCache[member] = { status, img };
  }
  const data = { status, lat, lon, ts, img };
  await activeRedis.set('member:' + member, JSON.stringify(data));
  await activeRedis.lPush('history:' + member, JSON.stringify({ lat, lon, ts, status }));
  await activeRedis.lTrim('history:' + member, 0, 999);
  broadcast({ type: 'update', member, ...data });
  await logEvent('gps_received', { member, lat, lon, status, vel, motionActivities, source });
  console.log(`[GPS] [${member}] ${status} (${lat.toFixed(5)}, ${lon.toFixed(5)}) vel=${vel} motion=${(motionActivities||[]).join(",")}`);
  await updateTracker(member, lat, lon, ts, motionActivities);
  return status;
}

// ─── Server-side simulace ────────────────────────────────────────────────────
const activeSimulations = {}; // { member: { timer, step, coords, simTime, stayTimer } }

function simCalcVel(lat1, lon1, lat2, lon2, intervalMs) {
  const d = distance(lat1, lon1, lat2, lon2);
  return (d / (intervalMs / 1000)) * 3.6;
}

async function simSendGPSServer(member, lat, lon, vel, motionactivities, simTs) {
  await processGPS(member, lat, lon, motionactivities, vel, simTs, false, 'sim');
}

async function runSimStep(member) {
  const sim = activeSimulations[member];
  if (!sim || !sim.active) return;

  const { coords, step, speed } = sim;

  if (step >= coords.length) {
    // Dorazili jsme — spustí callback
    sim.active = false;
    broadcast({ type: 'sim_arrived', member, lat: coords[coords.length-1][0], lon: coords[coords.length-1][1] });
    return;
  }

  const [lat, lon] = coords[step];
  const intervalMs = 3000 / speed;
  sim.simTime += 3000;

  // Rychlost pevně podle profilu
  const profileVel = sim.profile === 'foot-walking' ? 5 :
                     sim.profile === 'cycling-regular' ? 15 : 40;
  const vel = step < 3 ? Math.round(profileVel * step / 3) : profileVel;

  const motionactivities = sim.profile === 'foot-walking' ? ['walking'] :
                           sim.profile === 'cycling-regular' ? ['cycling'] : ['automotive'];

  await simSendGPSServer(member, lat, lon, Math.round(vel), motionactivities, sim.simTime);
  sim.step++;

  broadcast({ type: 'sim_progress', member, step: sim.step, total: coords.length, vel: Math.round(vel) });

  sim.timer = setTimeout(() => runSimStep(member), intervalMs);
}

async function runSimStay(member, lat, lon, minutes, onDone, jitterM) {
  const sim = activeSimulations[member];
  if (!sim) return;

  const speed = sim.speed;
  const totalPoints = Math.max(minutes * 2, 5);
  const interval = (minutes * 60 * 1000) / speed / totalPoints;
  sim.stayActive = true;
  sim.stayStep = 0;
  sim.stayTotal = totalPoints;

  // Jednorázový posun parkoviště (kde reálně zastavím vůči POI) — zvolen JEDNOU
  // na celé stání. Dřív se losoval každý bod zvlášť → body skákaly po velkém
  // čtverci (nereálný drift + rozbíjelo to potvrzení geofence, protože body
  // padaly střídavě dovnitř/ven a hystereze se resetovala). Teď: stálé
  // parkoviště + drobný GPS šum.
  const parkMax = (typeof jitterM === 'number' && jitterM > 0) ? jitterM : 25;
  const _ang = Math.random() * 2 * Math.PI;
  const _r = Math.random() * parkMax;          // 0..parkMax m, jeden směr
  const parkLatM = _r * Math.cos(_ang);
  const parkLonM = _r * Math.sin(_ang);
  const GPS_NOISE_M = 12;                       // drobný šum GPS při stání

  const doStep = async () => {
    if (!sim.stayActive || !activeSimulations[member]) return;
    // Rozptyl mista zastaveni (parkoviste/vchod): jitterM v metrech -> stupne.
    // 1 stupen lat ~111320m; lon koriguj cos(lat). Fallback ~28m (puvodni chovani).
    // Stálé parkoviště (parkLatM/parkLonM zvoleno jednou) + drobný GPS šum (±12 m)
    const _latM = parkLatM + (Math.random() - 0.5) * 2 * GPS_NOISE_M;
    const _lonM = parkLonM + (Math.random() - 0.5) * 2 * GPS_NOISE_M;
    const dLat = _latM / 111320;
    const dLon = _lonM / (111320 * Math.cos(lat * Math.PI / 180));
    sim.simTime += 30000;
    if (sim.stayStep === 0) console.log(`[SIM] Stay start simTime=${sim.simTime}`);
    await simSendGPSServer(member, lat + dLat, lon + dLon, 0, ['stationary'], sim.simTime);
    sim.stayStep++;
    broadcast({ type: 'sim_staying', member, step: sim.stayStep, total: totalPoints, minutes });

    if (sim.stayStep >= totalPoints) {
      sim.stayActive = false;
      if (onDone) onDone();
    } else {
      sim.timer = setTimeout(doStep, interval);
    }
  };
  doStep();
}

// ─── OSRM fetch ───────────────────────────────────────────────────────────────
async function fetchOSRMRoute(fromLat, fromLon, toLat, toLon, profile = 'driving-car') {
  const osrmProfile = profile === 'cycling-regular' ? 'bike' : profile === 'foot-walking' ? 'foot' : 'driving';
  try {
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
    const data = await new Promise((resolve, reject) => {
      const req = require('https').get(url, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('OSRM timeout')); });
    });
    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    }
  } catch(e) {
    console.error('[OSRM] Chyba:', e.message);
  }
  // Fallback: přímá čára
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push([fromLat + (toLat-fromLat)*i/20, fromLon + (toLon-fromLon)*i/20]);
  return pts;
}

// ─── API ──────────────────────────────────────────────────────────────────────

// ─── Mode přepínání ──────────────────────────────────────────────────────────
app.get('/mode', (req, res) => {
  res.json({ mode: currentMode });
});

app.post('/mode', async (req, res) => {
  const { mode } = req.body;
  if (!['live', 'test'].includes(mode)) return res.status(400).json({ error: 'mode must be live or test' });
  // Při přepnutí do testu zkopíruj geofences z live
  if (mode === 'test' && currentMode === 'live') {
    try {
      const fencesRaw = await redisLive.get('geofences');
      if (fencesRaw) {
        await redisTest.set('geofences', fencesRaw);
        console.log('[MODE] Geofences zkopírovány z LIVE do TEST');
      }
    } catch(e) { console.error('[MODE] Chyba kopírování geofences:', e.message); }
    try { await redisTest.del('ai_recent'); } catch(e) {}   // čistý cooldown pro testovací běhy
  }
  setMode(mode);
  Object.keys(trackers).forEach(m => { trackers[m] = { cluster: null, lastPoint: null }; });
  await loadFences();
  await loadTrackers();
  broadcast({ type: 'mode_changed', mode: currentMode });
  res.json({ ok: true, mode: currentMode });
});

// Simulace — start trasy
app.post('/simulate/route-osrm', async (req, res) => {
  const { member, fromLat, fromLon, toLat, toLon, profile = 'driving-car', speed = 5, startSimTime } = req.body;
  if (!member || fromLat == null || fromLon == null || toLat == null || toLon == null) {
    return res.status(400).json({ error: 'member, fromLat, fromLon, toLat, toLon required' });
  }
  if (!MEMBERS.includes(member)) return res.status(404).json({ error: 'Unknown member' });

  const coords = await fetchOSRMRoute(parseFloat(fromLat), parseFloat(fromLon), parseFloat(toLat), parseFloat(toLon), profile);

  if (activeSimulations[member]) {
    activeSimulations[member].active = false;
    activeSimulations[member].stayActive = false;
    if (activeSimulations[member].timer) clearTimeout(activeSimulations[member].timer);
  }

  activeSimulations[member] = {
    active: true, stayActive: false,
    coords, step: 0, profile, speed,
    simTime: startSimTime || Date.now(), timer: null
  };

  memberFenceHyst[member] = null;
  console.log(`[SIM] Start trasy (OSRM) pro ${member}: ${coords.length} bodů, profil=${profile}, rychlost=${speed}x`);
  runSimStep(member);
  res.json({ ok: true, member, points: coords.length, simTime: activeSimulations[member].simTime });
});

app.post('/simulate/route', async (req, res) => {
  const { member, coords, profile = 'driving-car', speed = 5, startSimTime } = req.body;
  if (!member || !coords || !coords.length) return res.status(400).json({ error: 'member a coords required' });
  if (!MEMBERS.includes(member)) return res.status(404).json({ error: 'Unknown member' });

  // Zastav předchozí simulaci
  if (activeSimulations[member]) {
    activeSimulations[member].active = false;
    activeSimulations[member].stayActive = false;
    if (activeSimulations[member].timer) clearTimeout(activeSimulations[member].timer);
  }

  activeSimulations[member] = {
    active: true, stayActive: false,
    coords, step: 0, profile, speed,
    simTime: startSimTime || Date.now(), timer: null
  };

  // Reset fence hystereze při startu nového úseku
  memberFenceHyst[member] = null;
  console.log(`[SIM] Start trasy pro ${member}: ${coords.length} bodů, profil=${profile}, rychlost=${speed}x`);
  runSimStep(member);
  res.json({ ok: true, member, points: coords.length });
});

// Simulace — stání na místě
app.post('/simulate/stay', async (req, res) => {
  const { member, lat, lon, minutes = 10, speed = 5, jitterM, startSimTime } = req.body;
  if (!member || !lat || !lon) return res.status(400).json({ error: 'member, lat, lon required' });

  if (activeSimulations[member]) {
    activeSimulations[member].active = false;
    activeSimulations[member].stayActive = false;
    if (activeSimulations[member].timer) clearTimeout(activeSimulations[member].timer);
  }

  activeSimulations[member] = {
    active: false, stayActive: false,
    coords: [], step: 0, speed,
    simTime: startSimTime || Date.now(), timer: null
  };

  console.log(`[SIM] Stání pro ${member}: ${minutes} min na ${lat.toFixed(5)},${lon.toFixed(5)}`);
  // Reset tracker před stáním — aby cluster obsahoval jen stationary body
  const stayStartTs = activeSimulations[member].simTime;
  const tracker = getTracker(member);
  tracker.cluster = null;  // reset — prvni stationary bod inicializuje novy cluster
  await saveTracker(member);

  runSimStay(member, lat, lon, minutes, async () => {
    const tracker2 = getTracker(member);
    // Pošli sim_arrived okamžitě — klient čeká na pokračování scénáře
    broadcast({ type: 'sim_arrived', member, lat, lon, afterStay: true });
    delete activeSimulations[member];
    // evaluateCluster asynchronně aby neblokoval scénář (AI call trvá sekundy)
    if (tracker2.cluster && tracker2.cluster.points.length >= MIN_STOP_POINTS) {
      const dur = Math.round((tracker2.cluster.points[tracker2.cluster.points.length-1].ts - tracker2.cluster.startTs) / 60000);
      console.log(`[SIM] Vyhodnocuji cluster po stání: ${tracker2.cluster.points.length} bodů, dur=${dur}min`);
      evaluateCluster(member, tracker2.cluster).then(() => {
        tracker2.cluster = null;
        saveTracker(member);
      });
    } else {
      console.log(`[SIM] Cluster po stání: ${tracker2.cluster?.points.length || 0} bodů — málo pro vyhodnocení`);
    }
  }, jitterM);
  res.json({ ok: true, member, minutes });
});

// Simulace — stop
app.post('/simulate/speed', (req, res) => {
  const { member, speed } = req.body;
  if (!member || !speed) return res.status(400).json({ error: 'member a speed required' });
  if (activeSimulations[member]) {
    activeSimulations[member].speed = parseInt(speed);
    console.log(`[SIM] Rychlost ${member} → ${speed}x`);
  }
  res.json({ ok: true });
});

app.post('/simulate/stop', (req, res) => {
  const { member } = req.body;
  if (activeSimulations[member]) {
    activeSimulations[member].active = false;
    activeSimulations[member].stayActive = false;
    if (activeSimulations[member].timer) clearTimeout(activeSimulations[member].timer);
    delete activeSimulations[member];
    broadcast({ type: 'sim_stopped', member });
  }
  res.json({ ok: true });
});

// Zastaví VŠECHNY běžící simulace (rodinný scénář = 4 členové paralelně)
// Testovací den: vrátí famDayStart zakotvený na dayOfWeek, ale posunutý o týden
// za každý běh (test_run_index v aktivním=test Redisu). Tím je každý běh ≥ 7 dní
// od minulého → počítá se jako samostatná návštěva a návštěvy narůstají i bez mazání.
app.post('/simulate/test-day', async (req, res) => {
  const dow = parseInt(req.body.dayOfWeek);
  const target = (dow >= 0 && dow <= 6) ? dow : 1;
  let idx = 0;
  try { const r = await redis.get('test_run_index'); idx = r ? parseInt(r) : 0; } catch(e) {}
  const d = new Date(); d.setHours(7, 0, 0, 0);
  let g = 0; while (d.getDay() !== target && g < 7) { d.setDate(d.getDate() + 1); g++; }
  d.setDate(d.getDate() + idx * 7);   // posun o 'idx' týdnů
  const famDayStart = d.getTime();
  try { await redis.set('test_run_index', String(idx + 1)); } catch(e) {}
  console.log(`[TEST-DAY] běh #${idx + 1}: ${d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' })} 07:00`);
  res.json({ ok: true, famDayStart, runIndex: idx, dateLabel: d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }) });
});

app.post('/simulate/stop-all', (req, res) => {
  const stopped = [];
  for (const member of Object.keys(activeSimulations)) {
    const sim = activeSimulations[member];
    sim.active = false;
    sim.stayActive = false;
    if (sim.timer) clearTimeout(sim.timer);
    delete activeSimulations[member];
    broadcast({ type: 'sim_stopped', member });
    stopped.push(member);
  }
  console.log('[SIM] Stop-all: zastaveno ' + stopped.length + ' simulaci (' + stopped.join(', ') + ')');
  res.json({ ok: true, stopped });
});

// Simulace — stav
app.get('/simulate/status', (req, res) => {
  const out = {};
  for (const [m, s] of Object.entries(activeSimulations)) {
    out[m] = { active: s.active, stayActive: s.stayActive, step: s.step, total: s.coords.length, speed: s.speed };
  }
  res.json(out);
});

app.get('/status', async (req, res) => {
  try {
    const result = {};
    for (const m of MEMBERS) {
      const val = await redis.get('member:' + m);
      result[m] = val ? JSON.parse(val) : { status: 'neznamo', lat: null, lon: null, ts: null };
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/gps/:member', async (req, res) => {
  const { member } = req.params;
  if (!MEMBERS.includes(member)) return res.status(404).json({ error: 'Unknown member' });
  const lat = parseFloat(req.body.lat);
  const lon = parseFloat(req.body.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
  // V testovacím módu ignoruj reálnou GPS z mobilu, ať neruší simulaci
  if (currentMode === 'test') {
    console.log('[TEST] ignoruji reálnou GPS (/gps) od ' + member);
    return res.json({ ok: false, ignored: true, reason: 'test mode' });
  }
  const motionactivities = req.body.motionactivities || [];
  const vel = parseFloat(req.body.vel) || 0;
  const simTs = req.body.ts ? parseInt(req.body.ts) : null;
  const status = await processGPS(member, lat, lon, motionactivities, vel, simTs, false, 'http');
  res.json({ ok: true, member, status });
});

app.post('/status/:member', async (req, res) => {
  const { member } = req.params;
  if (!MEMBERS.includes(member)) return res.status(404).json({ error: 'Unknown member' });
  const { status } = req.body;
  // Zachovej poslední GPS pozici
  const existing = await redis.get('member:' + member);
  const prev = existing ? JSON.parse(existing) : {};
  // Pokud je cesta, upřesni pohyb z posledního známého stavu
  let finalStatus = status;
  if (status === 'cesta' && prev.lat) {
    const history = await redis.lRange('history:' + member, 0, 2);
    if (history.length >= 2) {
      const p1 = JSON.parse(history[0]);
      const p2 = JSON.parse(history[1]);
      const timeDiff = (p1.ts - p2.ts) / 1000;
      const distM = distance(p1.lat, p1.lon, p2.lat, p2.lon);
      const vel = timeDiff > 0 ? (distM / timeDiff) * 3.6 : 0;
      const motion = resolveMotion([], vel);
      if (motion) finalStatus = motion;
    }
  }
  let img;
  const mcSim = memberImgCache[member];
  if (mcSim && mcSim.status === finalStatus) {
    img = mcSim.img;
  } else {
    img = await suggestImageForStatus(finalStatus);
    memberImgCache[member] = { status: finalStatus, img };
  }
  const data = { status: finalStatus, lat: prev.lat || null, lon: prev.lon || null, ts: Date.now(), manual: true, img };
  await redis.set('member:' + member, JSON.stringify(data));
  broadcast({ type: 'update', member, ...data });
  res.json({ ok: true, member, status: finalStatus });
});

app.get('/places', async (req, res) => {
  const raw = await redis.get('detected_places');
  res.json(raw ? JSON.parse(raw) : []);
});

app.post('/places/:id/name', async (req, res) => {
  const { id } = req.params;
  const { name, radius = 150, only, lat: reqLat, lon: reqLon } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const raw = await redis.get('detected_places');
  const places = raw ? JSON.parse(raw) : [];
  const place = places.find(p => p.id === id);
  if (!place) return res.status(404).json({ error: 'Place not found' });
  place.name = name;
  // Pokud frontend poslal souradnice kandidata, pouzij je
  if (reqLat != null && reqLon != null) { place.lat = parseFloat(reqLat); place.lon = parseFloat(reqLon); }
  await redis.set('detected_places', JSON.stringify(places));
  const fence = { id, name, lat: place.lat, lon: place.lon, radius, ...(only ? { only } : {}) };
  dynamicFences.push(fence);
  await saveFences();
  console.log(`✓ Nový geofence: "${name}" @ ${place.lat.toFixed(5)},${place.lon.toFixed(5)} r=${radius}m`);
  await logEvent('fence_added', { id, name, lat: place.lat, lon: place.lon, radius, manual: true });
  broadcast({ type: 'fence_added', fence });
  res.json({ ok: true, fence });
});

// MUSÍ být před /places/:id
app.delete('/places/all', async (req, res) => {
  await redis.del('detected_places');
  await redis.del('ai_recent');   // reset cooldown spolu s místy
  await redis.del('test_run_index');   // reset počítadla testovacích běhů (posun dne)
  for (const m of MEMBERS) { try { await redis.del('visits:' + m); } catch(e) {} }  // reset historie návštěv
  dynamicFences = dynamicFences.filter(f => f.id.startsWith('manual_'));
  await saveFences();
  console.log('✓ Reset detected_places, zachováno ' + dynamicFences.length + ' manuálních fences');
  res.json({ ok: true, remaining_fences: dynamicFences.length });
});

// Sloučí již existující ČEKAJÍCÍ (nepojmenovaná) místa, která jsou blízko sebe
// (drift během dlouhého stání). Pojmenovaná místa zůstanou nedotčena.
// MUSÍ být před /places/:id
app.post('/places/dedupe', async (req, res) => {
  const radius = parseInt(req.body?.radius) || MERGE_RADIUS;
  const raw = await redis.get('detected_places');
  const places = raw ? JSON.parse(raw) : [];

  const named = places.filter(p => p.name);
  const pending = places.filter(p => !p.name);
  const kept = [];
  let merged = 0;

  for (const p of pending) {
    // hledej už ponechané čekající místo blízko (nebo už pojmenované — pak zahoď duplikát)
    const nearKept = kept.find(k => distance(p.lat, p.lon, k.lat, k.lon) < radius);
    if (nearKept) {
      nearKept.duration = Math.max(nearKept.duration || 0, p.duration || 0);
      nearKept.mergeCount = (nearKept.mergeCount || 1) + 1;
      nearKept.detectedAt = Math.max(nearKept.detectedAt || 0, p.detectedAt || 0);
      merged++;
      continue;
    }
    const nearNamed = named.find(n => distance(p.lat, p.lon, n.lat, n.lon) < radius);
    if (nearNamed) { merged++; continue; }  // už existuje pojmenované → zahoď čekající duplikát
    kept.push(p);
  }

  const result = named.concat(kept);
  await redis.set('detected_places', JSON.stringify(result));
  console.log(`✓ Dedupe: sloučeno ${merged} čekajících míst, zbývá ${kept.length} čekajících + ${named.length} pojmenovaných`);
  await logEvent('places_deduped', { merged, pendingBefore: pending.length, pendingAfter: kept.length, radius });
  broadcast({ type: 'stop_detected', member: null });  // klient si přenačte seznam
  res.json({ ok: true, merged, pending: kept.length, named: named.length });
});

app.delete('/places/:id', async (req, res) => {
  const { id } = req.params;
  const raw = await redis.get('detected_places');
  const places = (raw ? JSON.parse(raw) : []).filter(p => p.id !== id);
  await redis.set('detected_places', JSON.stringify(places));
  dynamicFences = dynamicFences.filter(f => f.id !== id);
  await saveFences();
  res.json({ ok: true });
});

// Editace jiz pojmenovaneho mista (vcetne prepisu souradnic kdyz uzivatel vybral jineho kandidata)
app.put('/places/:id', async (req, res) => {
  const { id } = req.params;
  const { name, radius, only, lat: reqLat, lon: reqLon } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const raw = await redis.get('detected_places');
  const places = raw ? JSON.parse(raw) : [];
  const place = places.find(p => p.id === id);
  if (!place) return res.status(404).json({ error: 'Place not found' });
  const oldName = place.name;
  place.name = name;
  if (reqLat != null && reqLon != null) { place.lat = parseFloat(reqLat); place.lon = parseFloat(reqLon); }
  await redis.set('detected_places', JSON.stringify(places));
  const fence = dynamicFences.find(f => f.id === id);
  if (fence) {
    fence.name = name;
    fence.lat = place.lat;
    fence.lon = place.lon;
    if (radius) fence.radius = parseInt(radius);
    if (only !== undefined) { if (only && only.length) fence.only = only; else delete fence.only; }
    await saveFences();
    console.log(`✓ Misto upraveno: "${oldName}" -> "${name}" @ ${place.lat.toFixed(5)},${place.lon.toFixed(5)}`);
    broadcast({ type: 'fence_updated', fence });
  } else {
    const newFence = { id, name, lat: place.lat, lon: place.lon, radius: parseInt(radius) || 150, ...(only && only.length ? { only } : {}) };
    dynamicFences.push(newFence);
    await saveFences();
    console.log(`✓ Misto pojmenovano (PUT): "${name}" @ ${place.lat.toFixed(5)},${place.lon.toFixed(5)} r=${newFence.radius}m`);
    await logEvent('fence_added', { id, name, lat: place.lat, lon: place.lon, radius: newFence.radius, manual: false });
    broadcast({ type: 'fence_added', fence: newFence });
  }
  res.json({ ok: true });
});

app.get('/geofences', (req, res) => res.json(dynamicFences));

app.post('/geofences', async (req, res) => {
  const { name, lat, lon, radius = 150, only } = req.body;
  if (!name || !lat || !lon) return res.status(400).json({ error: 'name, lat, lon required' });
  const id = 'manual_' + Date.now();
  const fence = { id, name, lat: parseFloat(lat), lon: parseFloat(lon), radius, ...(only ? { only } : {}) };
  dynamicFences.push(fence);
  await saveFences();
  console.log(`✓ Manuální geofence: "${name}"`);
  await logEvent('fence_added', { id, name, lat: fence.lat, lon: fence.lon, radius, manual: true });
  broadcast({ type: 'fence_added', fence });
  res.json({ ok: true, fence });
});

app.put('/geofences/:id', async (req, res) => {
  const { id } = req.params;
  const { name, radius, only } = req.body;
  const fence = dynamicFences.find(f => f.id === id);
  if (!fence) return res.status(404).json({ error: 'Fence not found' });
  if (name) fence.name = name;
  if (radius) fence.radius = parseInt(radius);
  if (only !== undefined) { if (only && only.length) fence.only = only; else delete fence.only; }
  await saveFences();
  console.log(`✓ Geofence upraven: "${fence.name}" r=${fence.radius}m`);
  broadcast({ type: 'fence_updated', fence });
  res.json({ ok: true, fence });
});

app.delete('/geofences/:id', async (req, res) => {
  const { id } = req.params;
  const before = dynamicFences.length;
  dynamicFences = dynamicFences.filter(f => f.id !== id);
  if (dynamicFences.length === before) return res.status(404).json({ error: 'Fence not found' });
  await saveFences();
  console.log(`✓ Geofence smazan: ${id}`);
  broadcast({ type: 'fence_deleted', id });
  res.json({ ok: true });
});

// GET /logs?limit=50&type=ai_response&member=tatka
app.get('/logs', async (req, res) => {
  try {
    const filterType = req.query.type || null;
    const filterMember = req.query.member || null;
    const since = req.query.since ? parseInt(req.query.since) : null;
    const until = req.query.until ? parseInt(req.query.until) : null;
    // Pokud je časové okno, prohledej všechny logy bez limitu (jen AI typy)
    const AI_TYPES = ['ai_request','ai_response','ai_error','place_saved','place_rejected','stop_candidate','fence_added'];
    const timeWindow = since !== null && until !== null;
    const limit = timeWindow ? 50000 : Math.min(parseInt(req.query.limit) || 50, 500);
    const totalKeys = await redis.lLen('log:index');
    const BATCH = 200;
    const results = [];
    let offset = 0;

    while (results.length < limit && offset < totalKeys) {
      const keys = await redis.lRange('log:index', offset, offset + BATCH - 1);
      if (!keys.length) break;
      for (const key of keys) {
        if (results.length >= limit) break;
        try {
          const raw = await redis.get(key);
          if (!raw) continue;
          const entry = JSON.parse(raw);
          if (filterType && entry.type !== filterType) continue;
          if (filterMember && entry.member !== filterMember) continue;
          // Časové filtrování
          if (since !== null && entry.ts < since) continue;
          if (until !== null && entry.ts > until) continue;
          // V časovém okně vrať jen AI typy (ne GPS body — těch jsou tisíce)
          if (timeWindow && !filterType && !AI_TYPES.includes(entry.type)) continue;
          results.push(entry);
        } catch(e) { continue; }
      }
      offset += BATCH;
      // Pokud hledáme v časovém okně a logy jsou seřazeny od nejnovějších,
      // můžeme skončit jakmile jsme před since
      if (timeWindow && results.length > 0) {
        const lastKey = keys[keys.length - 1];
        const ts = parseInt(lastKey.split(':')[1]);
        if (ts && ts < since) break;
      }
    }

    res.json({ count: results.length, logs: results });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/logs', async (req, res) => {
  const keys = await redis.lRange('log:index', 0, -1);
  for (const k of keys) { try { await redis.del(k); } catch(e) {} }
  await redis.del('log:index');
  res.json({ ok: true, deleted: keys.length });
});

app.get('/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseFloat(req.query.radius) || 300;
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat and lon required' });
  const places = await getNearbyPlaces(lat, lon, radius);
  res.json({ count: places.length, radius, places });
});

app.get('/img-list', (req, res) => {
  res.json(getAvailableImages());
});

app.delete('/img-cache', async (req, res) => {
  const keys = await redis.keys('imgcache:*');
  for (const k of keys) await redis.del(k);
  console.log('✓ Reset img cache, smazáno ' + keys.length + ' záznamů');
  res.json({ ok: true, deleted: keys.length });
});

app.get('/tracker', (req, res) => {
  const out = {};
  Object.entries(trackers).forEach(([m, t]) => {
    if (!t.cluster) { out[m] = null; return; }
    const center = clusterCenter(t.cluster.points);
    out[m] = { center, points: t.cluster.points.length, duration: Math.round((Date.now() - t.cluster.startTs) / 60000) + ' min', lastPoint: t.lastPoint };
  });
  res.json(out);
});

// ─── Scenarios API ───────────────────────────────────────────────────────────
const SCENARIOS_FILE = '/app/public/scenarios_data.json';

app.get('/scenarios', (req, res) => {
  try {
    const data = fs.readFileSync(SCENARIOS_FILE, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/scenarios', (req, res) => {
  try {
    fs.writeFileSync(SCENARIOS_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Scenario Reports ────────────────────────────────────────────────────────
const SC_REPORTS_KEY = 'sc_reports';
const SC_REPORTS_MAX = 100;

app.post('/sc-reports', async (req, res) => {
  try {
    const report = req.body;
    if (!report || !report.scenarioId) return res.status(400).json({ error: 'report required' });
    report.savedAt = Date.now();
    const raw = await redis.get(SC_REPORTS_KEY);
    const reports = raw ? JSON.parse(raw) : [];
    reports.unshift(report);
    if (reports.length > SC_REPORTS_MAX) reports.splice(SC_REPORTS_MAX);
    await redis.set(SC_REPORTS_KEY, JSON.stringify(reports));
    res.json({ ok: true, count: reports.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/sc-reports', async (req, res) => {
  try {
    const raw = await redis.get(SC_REPORTS_KEY);
    res.json(raw ? JSON.parse(raw) : []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/sc-reports', async (req, res) => {
  try {
    await redis.del(SC_REPORTS_KEY);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static('/app/public'));

// ─── MQTT ─────────────────────────────────────────────────────────────────────
async function startMqtt() {
  const client = mqtt.connect('mqtt://' + MQTT_HOST + ':1883');
  client.on('connect', () => {
    console.log('✓ MQTT připojeno');
    client.subscribe(['rodina/+/gps', 'owntracks/+/+'], err => {
      if (!err) console.log('✓ Subscribováno: rodina/+/gps + owntracks/+/+');
    });
  });
  client.on('message', async (topic, payload) => {
    try {
      const parts = topic.split('/');
      const member = parts[1];
      if (!MEMBERS.includes(member)) return;
      const msg = JSON.parse(payload.toString());
      if (msg._type && msg._type !== 'location') return;
      const lat = parseFloat(msg.lat);
      const lon = parseFloat(msg.lon);
      if (isNaN(lat) || isNaN(lon)) return;
      // V testovacím módu ignoruj reálnou GPS z mobilů (OwnTracks), ať neruší simulaci
      if (currentMode === 'test') {
        console.log('[TEST] ignoruji reálnou MQTT GPS od ' + member);
        return;
      }
      await processGPS(member, lat, lon, msg.motionactivities || [], msg.vel || 0, null, true);
    } catch(e) { console.error('MQTT error:', e.message); }
  });
  client.on('error', e => console.error('MQTT error:', e));
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  await redisLive.connect();
  await redisTest.connect();
  console.log('✓ Redis LIVE připojeno');
  console.log('✓ Redis TEST připojeno');
  await loadFences();
  await loadTrackers();
  await startMqtt();
  httpServer.listen(PORT, () => {
    console.log('✓ Server běží na portu ' + PORT);
    if (GOOGLE_API_KEY) console.log('✓ Google Places API klíč načten');
    else console.log('⚠ Google API klíč není nastaven');
    if (ANTHROPIC_API_KEY) console.log('✓ Anthropic API klíč načten');
    else console.log('⚠ Anthropic API klíč není nastaven');
  });
}

main().catch(console.error);
