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

function resolveStatus(member, lat, lon) {
  for (const fence of dynamicFences) {
    if (fence.only && !fence.only.includes(member)) continue;
    if (distance(lat, lon, fence.lat, fence.lon) <= fence.radius) return fence.name;
  }
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
  'bus_station', 'transportation_service', 'route', 'street_address', 'political'
];

async function getNearbyPlaces(lat, lon, radius = 300) {
  if (!GOOGLE_API_KEY) return [];
  try {
    const data = await httpPost(
      'places.googleapis.com',
      '/v1/places:searchNearby',
      {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.types,places.location,places.primaryType,places.rating'
      },
      JSON.stringify({
        locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius } },
        maxResultCount: 20,
        languageCode: 'cs'
      })
    );
    if (!data.places) return [];
    return data.places
      .map(p => ({
        name: p.displayName?.text || '',
        primaryType: p.primaryType || '',
        types: (p.types || []).slice(0, 5),
        dist: Math.round(distance(lat, lon, p.location.latitude, p.location.longitude)),
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

// ─── Historie návštěv ─────────────────────────────────────────────────────────
async function countNearbyHistory(member, lat, lon, radiusM = 100) {
  try {
    const raw = await redis.lRange('history:' + member, 0, 999);
    let count = 0;
    for (const r of raw) {
      const p = JSON.parse(r);
      if (distance(lat, lon, p.lat, p.lon) <= radiusM) count++;
    }
    return count;
  } catch(e) { return 0; }
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

  const placesStr = placesNearby.length > 0
    ? placesNearby.map(p => `  - ${p.name} (${p.primaryType || 'neznámý typ'}, ${p.dist}m${p.rating ? ', ★' + p.rating : ''})`).join('\n')
    : '  Žádná místa nenalezena';

  const nearbyStr = nearbyMembers.length > 0
    ? '\nDalší členové rodiny na tomto místě:\n' + nearbyMembers.map(m => `  - ${m.member} byl zde před ${m.minutesAgo} min`).join('\n')
    : '';

  const prompt = `Analyzuješ GPS data rodinného sledovacího systému. Rozhodneš, zda zastávka stojí za uložení.

Člen rodiny: ${member}
Čas: ${dayOfWeek} ${timeStr}
Zdroj: ${source === 'silence' ? 'Significant mode (GPS bod před odjezdem, mezera ' + gapMinutes + ' min)' : 'cluster bodů v Move mode, délka ' + gapMinutes + ' min'}
Souřadnice: ${lat.toFixed(5)}, ${lon.toFixed(5)}
Předchozí návštěvy tohoto místa: ${historyVisits}x
${nearbyStr}
Nejbližší místa z Google Places:
${placesStr}

Rodina v ČR. Chceme ukládat: práce, obchod, lékař, restaurace, sport, škola, návštěvy. Nechceme: průjezdy, čekání v autě, GPS artefakty.

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
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    );

    const durationMs = Date.now() - startTs;
    const raw = data.content?.[0]?.text || '';

    let result;
    try {
      result = JSON.parse(raw.replace(/```json|```/g, '').trim());
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
const redis = createClient({ socket: { host: REDIS_HOST, port: 6379 } });
redis.on('error', e => console.error('Redis error:', e));

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
const MIN_STOP_DURATION = 5 * 60 * 1000;
const MIN_STOP_POINTS = 3;
const SILENCE_MIN_DIST = 200;
const SILENCE_MIN_GAP = 20 * 60 * 1000;     // 20 minut — filtruje průjezdy
const SILENCE_MAX_GAP = 4 * 60 * 60 * 1000;

const AI_AUTOSAVE_THRESHOLD = 0.80;
const AI_SUGGEST_THRESHOLD = 0.65;


// ─── Rozlišení pohybu ─────────────────────────────────────────────────────────
// Kombinuje motionactivities (Core Motion iPhone) a vel (GPS rychlost v km/h)
function resolveMotion(motionActivities, vel) {
  const acts = motionActivities || [];
  const speed = vel || 0;

  // Stojí — nepřepisuj geofence status
  if (acts.includes('stationary') && speed < 3) return null;

  // Velmi pomalý pohyb nebo stojí
  if (speed < 1) return null;

  // ── Pěšky: 1–5 km/h ──────────────────────────────────────────────────────
  if (speed <= 5) {
    if (acts.includes('running')) return 'běh';  // kratší krok, ale rychlý
    return 'pěšky';
  }

  // ── Běh: 6–15 km/h — rozliš od kola podle motion ─────────────────────────
  if (speed <= 15) {
    if (acts.includes('running'))  return 'běh';
    if (acts.includes('cycling'))  return 'kolo';
    if (acts.includes('walking'))  return 'pěšky';
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

// ─── Tracker ──────────────────────────────────────────────────────────────────
const trackers = {};
const recentlyDetected = {};

function getTracker(member) {
  if (!trackers[member]) trackers[member] = { cluster: null, lastPoint: null };
  return trackers[member];
}

async function saveTracker(member) {
  try {
    const t = trackers[member];
    if (!t) return;
    await redis.set('tracker:' + member, JSON.stringify({ cluster: t.cluster, lastPoint: t.lastPoint }));
  } catch(e) {}
}

async function loadTrackers() {
  for (const m of MEMBERS) {
    try {
      const raw = await redis.get('tracker:' + m);
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
async function processStopCandidate(member, lat, lon, gapMinutes, source) {

  // Deduplikace — stejné místo max jednou za hodinu
  const dedupeKey = member + '_' + lat.toFixed(3) + '_' + lon.toFixed(3);
  if (recentlyDetected[dedupeKey] && Date.now() - recentlyDetected[dedupeKey] < 60 * 60 * 1000) {
    console.log(`[STOP] Duplikát ${dedupeKey}, přeskakuji`);
    return;
  }

  // Známé místo — nepřidávat znovu
  const alreadyKnown = dynamicFences.some(f => distance(lat, lon, f.lat, f.lon) < CLUSTER_RADIUS);
  if (alreadyKnown) {
    console.log(`[STOP] Známé místo @ ${lat.toFixed(5)},${lon.toFixed(5)}, přeskakuji`);
    return;
  }

  // Cross-member dedup — jiný člen zachytil stejné místo za posledních 60 minut
  const recentPlacesRaw = await redis.get('detected_places');
  const recentPlaces = recentPlacesRaw ? JSON.parse(recentPlacesRaw) : [];
  const crossDup = recentPlaces.find(p =>
    p.detectedBy !== member &&
    distance(lat, lon, p.lat, p.lon) < 150 &&
    (Date.now() - p.detectedAt) < 60 * 60 * 1000
  );
  if (crossDup) {
    console.log(`[STOP] ${crossDup.detectedBy} už zachytil stejné místo před ${Math.round((Date.now() - crossDup.detectedAt) / 60000)} min`);
    await logEvent('place_rejected', { member, lat, lon, reason: 'cross_member_dup', otherMember: crossDup.detectedBy, source });
    return;
  }

  recentlyDetected[dedupeKey] = Date.now();

  // Kontext pro AI
  const placesNearby = await getNearbyPlaces(lat, lon, 300);
  const historyVisits = await countNearbyHistory(member, lat, lon, 100);
  const nearbyMembers = await getRecentNearbyMembers(member, lat, lon);

  const now = new Date();
  const days = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const dayOfWeek = days[now.getDay()];
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');

  await logEvent('stop_candidate', { member, lat, lon, gapMinutes, historyVisits, nearbyMembers, placesCount: placesNearby.length, dayOfWeek, timeStr, source });
  console.log(`[STOP] Kandidát [${member}] ${gapMinutes}min @ ${lat.toFixed(5)},${lon.toFixed(5)} | ${placesNearby.length} POI | ${historyVisits}x navštíveno`);

  const aiResult = await askClaude(member, lat, lon, { gapMinutes, placesNearby, historyVisits, nearbyMembers, dayOfWeek, timeStr, source });

  if (!aiResult) {
    // Fallback — jen pokud je místo opakované a má POI
    if (placesNearby.length > 0 && historyVisits >= 3) {
      await savePlaceCandidate(member, lat, lon, gapMinutes, placesNearby, null, 0, 'fallback', source);
    } else {
      await logEvent('place_rejected', { member, lat, lon, reason: 'AI nedostupné, nedostatek signálů', source });
    }
    return;
  }

  if (!aiResult.should_save || aiResult.confidence < AI_SUGGEST_THRESHOLD) {
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

// ─── Silence detection ────────────────────────────────────────────────────────
// Significant mode: mezera > 20 minut mezi dvěma body = stáli jsme někde.
// Souřadnice zastávky = výchozí bod (kde jsme byli před odjezdem).
async function detectSilentStop(member, prevPoint, newLat, newLon, newTs) {
  const timeDiff = newTs - prevPoint.ts;
  const spaceDiff = distance(prevPoint.lat, prevPoint.lon, newLat, newLon);

  if (timeDiff < SILENCE_MIN_GAP) return;
  if (timeDiff > SILENCE_MAX_GAP) return;
  if (spaceDiff < SILENCE_MIN_DIST) return;

  const gapMinutes = Math.round(timeDiff / 60000);
  console.log(`[SILENCE] [${member}] mezera ${gapMinutes}min, vzdálenost ${Math.round(spaceDiff)}m`);

  await processStopCandidate(member, prevPoint.lat, prevPoint.lon, gapMinutes, 'silence');
}

// ─── Cluster tracking ─────────────────────────────────────────────────────────
// Move mode: husté body v malém okruhu = reálná zastávka.
async function evaluateCluster(member, cluster) {
  if (!cluster || cluster.points.length < MIN_STOP_POINTS) return;
  const duration = Date.now() - cluster.startTs;
  if (duration < MIN_STOP_DURATION) return;
  const center = clusterCenter(cluster.points);
  await processStopCandidate(member, center.lat, center.lon, Math.round(duration / 60000), 'cluster');
}

// ─── Hlavní tracker ───────────────────────────────────────────────────────────
async function updateTracker(member, lat, lon, ts) {
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

  if (dist <= CLUSTER_RADIUS) {
    tracker.cluster.points.push({ lat, lon, ts });
    console.log(`[TRACK] [${member}] V clusteru dist=${Math.round(dist)}m dur=${Math.round((ts - tracker.cluster.startTs)/60000)}min pts=${tracker.cluster.points.length}`);
  } else if (dist > LEAVE_RADIUS) {
    console.log(`[TRACK] [${member}] odchod dist=${Math.round(dist)}m`);
    await evaluateCluster(member, tracker.cluster);
    tracker.cluster = { points: [{ lat, lon, ts }], startTs: ts };
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

  const cacheKey = 'imgcache:' + status.toLowerCase();
  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      console.log(`[IMG] Cache hit: "${status}" → "${cached || 'žádný'}"`);
      return cached || null;
    }
  } catch(e) {}

  // Vyber správnou složku podle typu statusu
  const dir = isMotionStatus(status) ? IMG_DIR_MOTION : IMG_DIR_PLACES;
  const images = getAvailableImages(dir);
  const subfolder = isMotionStatus(status) ? 'motion' : 'places';
  if (images.length === 0) return null;
  if (!ANTHROPIC_API_KEY) return null;

  try {
    const prompt = `Vybíráš obrázek pro zobrazení stavu člena rodiny na GPS hodinkách.

Aktuální stav: "${status}"

Dostupné obrázky (názvy souborů):
${images.map(f => '- ' + f).join('\n')}

Vyber JEDEN soubor který nejvíce odpovídá danému stavu.
Pokud žádný obrázek neodpovídá, vrať prázdný string.

Odpověz POUZE názvem souboru nebo prázdným stringem, bez jakéhokoliv dalšího textu.`;

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
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      })
    );

    const result = (data.content?.[0]?.text || '').trim();
    const validFile = images.find(f => f === result);
    const finalResult = validFile || '';
    // Uložíme s prefixem složky pro správné URL
    const finalPath = finalResult ? subfolder + '/' + finalResult : '';

    console.log(`[IMG] Status "${status}" (${subfolder}) → "${finalResult || 'žádný'}"`);
    await redis.set(cacheKey, finalPath, { EX: IMG_CACHE_TTL });
    await logEvent('img_selected', { status, subfolder, selectedImg: finalResult || null, availableImgs: images, prompt });
    return finalPath || null;

  } catch(e) {
    console.error('[IMG] Chyba:', e.message);
    return null;
  }
}

async function processGPS(member, lat, lon, motionActivities = [], vel = 0) {
  const ts = Date.now();
  let status = resolveStatus(member, lat, lon);
  // Pohyb má přednost před geofence — kromě doma
  const motion = resolveMotion(motionActivities, vel);
  const homeFences = dynamicFences.filter(f => f.name === 'doma' || f.name === 'Náš domeček').map(f => f.name);
  if (motion && !homeFences.includes(status)) status = motion;
  else if (status === 'cesta' && motion) status = motion;
  const img = await suggestImageForStatus(status);
  const data = { status, lat, lon, ts, img };
  await redis.set('member:' + member, JSON.stringify(data));
  await redis.lPush('history:' + member, JSON.stringify({ lat, lon, ts, status }));
  await redis.lTrim('history:' + member, 0, 999);
  broadcast({ type: 'update', member, ...data });
  await logEvent('gps_received', { member, lat, lon, status });
  console.log(`[GPS] [${member}] ${status} (${lat.toFixed(5)}, ${lon.toFixed(5)}) vel=${vel} motion=${(motionActivities||[]).join(",")}`);
  await updateTracker(member, lat, lon, ts);
  return status;
}

// ─── API ──────────────────────────────────────────────────────────────────────

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
  const status = await processGPS(member, lat, lon);
  res.json({ ok: true, member, status });
});

app.post('/status/:member', async (req, res) => {
  const { member } = req.params;
  if (!MEMBERS.includes(member)) return res.status(404).json({ error: 'Unknown member' });
  const { status } = req.body;
  const data = { status, lat: null, lon: null, ts: Date.now(), manual: true };
  await redis.set('member:' + member, JSON.stringify(data));
  broadcast({ type: 'update', member, ...data });
  res.json({ ok: true, member, status });
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
  dynamicFences = dynamicFences.filter(f => f.id.startsWith('manual_'));
  await saveFences();
  console.log('✓ Reset detected_places, zachováno ' + dynamicFences.length + ' manuálních fences');
  res.json({ ok: true, remaining_fences: dynamicFences.length });
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
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const filterType = req.query.type || null;
    const filterMember = req.query.member || null;
    const keys = await redis.lRange('log:index', 0, limit * 5);
    const results = [];
    for (const key of keys) {
      if (results.length >= limit) break;
      try {
        const raw = await redis.get(key);
        if (!raw) continue;
        const entry = JSON.parse(raw);
        if (filterType && entry.type !== filterType) continue;
        if (filterMember && entry.member !== filterMember) continue;
        results.push(entry);
      } catch(e) { continue; }
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
      await processGPS(member, lat, lon, msg.motionactivities || [], msg.vel || 0);
    } catch(e) { console.error('MQTT error:', e.message); }
  });
  client.on('error', e => console.error('MQTT error:', e));
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function main() {
  await redis.connect();
  console.log('✓ Redis připojeno');
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
