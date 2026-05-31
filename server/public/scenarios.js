// Testovací scénáře pro Weasley Hours
// Souřadnice ověřeny z produkčních geofences (curl /geofences)
// Doma = Náš domeček (50.7793, 15.0581)

const SC_SCENARIOS = [

  // Souřadnice převzaty přímo z geofences (curl /geofences na produkčním serveru)
  // Doma = "Náš domeček": 50.7793, 15.0581

  // ── 1. Školní den ───────────────────────────────────────────────────────────
  {
    id: 'skolni-den',
    title: 'Školní den',
    icon: '🎒',
    tags: ['school'],
    desc: 'Pěšky do ZŠ Lesní, odpoledne karate, pak Albert domů.',
    steps: [
      { name: 'Náš domeček',               lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'foot-walking', icon: '🏠' },
      { name: 'ZŠ Lesní',                  lat: 50.7787, lon: 15.0734, stayMin: 30, mode: 'foot-walking', icon: '🏫', note: 'část dopolední výuky' },
      { name: 'SK Karate Shotokan Liberec',lat: 50.7865, lon: 15.0542, stayMin: 25, mode: 'driving-car',  icon: '🥋', note: 'karate trénink' },
      { name: 'Albert',                    lat: 50.7752, lon: 15.0625, stayMin: 15, mode: 'driving-car',  icon: '🛒', note: 'nákup po karate' },
      { name: 'Náš domeček',               lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car',  icon: '🏠' },
    ],
  },

  // ── 2. Nákupní sobota ───────────────────────────────────────────────────────
  {
    id: 'nakupni-sobota',
    title: 'Nákupní sobota',
    icon: '🛒',
    tags: ['weekend', 'errand'],
    desc: 'Tesco Ruprechtice, BAUHAUS, Albert, domů.',
    steps: [
      { name: 'Náš domeček',                    lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Tesco Liberec Ruprechtice',       lat: 50.7843, lon: 15.0605, stayMin: 25, mode: 'driving-car', icon: '🏪', note: 'hlavní nákup' },
      { name: 'BAUHAUS Liberec',                lat: 50.7766, lon: 15.0245, stayMin: 20, mode: 'driving-car', icon: '🔨', note: 'nářadí / zahrada' },
      { name: 'Albert',                         lat: 50.7752, lon: 15.0625, stayMin: 15, mode: 'driving-car', icon: '🛒', note: 'doplnit zeleninu' },
      { name: 'Náš domeček',                    lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 3. Výlet na Ještěd ──────────────────────────────────────────────────────
  {
    id: 'jested-vylet',
    title: 'Výlet na Ještěd',
    icon: '🏔',
    tags: ['weekend', 'leisure'],
    desc: 'Lanovkou na Ještěd (1012 m), výhled, oběd, zpět přes centrum.',
    steps: [
      { name: 'Náš domeček',                  lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car',  icon: '🏠' },
      { name: 'Dolní stanice lanovky Ještěd', lat: 50.7548, lon: 15.0311, stayMin: 10, mode: 'driving-car',  icon: '🚡', note: 'parkování + nástup' },
      { name: 'Ještěd – vrchol (1012 m)',      lat: 50.7322, lon: 14.9853, stayMin: 30, mode: 'foot-walking', icon: '📡', note: 'výhled + restaurace' },
      { name: 'SIX cafe',                     lat: 50.7780, lon: 15.0735, stayMin: 20, mode: 'driving-car',  icon: '☕', note: 'káva po výletu' },
      { name: 'Náš domeček',                  lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car',  icon: '🏠' },
    ],
  },

  // ── 4. Lezení ───────────────────────────────────────────────────────────────
  {
    id: 'lezeni',
    title: 'Lezení',
    icon: '🧗',
    tags: ['leisure'],
    desc: 'Boulder Point nebo Makak lezení v Jablonci, pak domů.',
    steps: [
      { name: 'Náš domeček',              lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Boulder Point',            lat: 50.7834, lon: 15.0645, stayMin: 30, mode: 'driving-car', icon: '🧗', note: 'lezecká stěna' },
      { name: 'SIX cafe',                 lat: 50.7780, lon: 15.0735, stayMin: 15, mode: 'foot-walking', icon: '☕', note: 'odpočinek po lezení' },
      { name: 'Náš domeček',              lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 5. Lékař ────────────────────────────────────────────────────────────────
  {
    id: 'lekar',
    title: 'Lékař',
    icon: '🏥',
    tags: ['errand'],
    desc: 'Poliklinika u Muzea nebo Lékař Benko, pak lékárna.',
    steps: [
      { name: 'Náš domeček',           lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car',  icon: '🏠' },
      { name: 'Poliklinika u Muzea',   lat: 50.7747, lon: 15.0674, stayMin: 30, mode: 'driving-car',  icon: '🏥', note: 'prohlídka + čekárna' },
      { name: 'Klinika Movela',        lat: 50.7716, lon: 15.0563, stayMin: 15, mode: 'foot-walking', icon: '👨‍⚕️', note: 'druhý lékař / vyzvednutí' },
      { name: 'Náš domeček',           lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car',  icon: '🏠' },
    ],
  },

  // ── 6. Výlet Makak + Jablonec ───────────────────────────────────────────────
  {
    id: 'jablonec-makak',
    title: 'Jablonec – Makak lezení',
    icon: '🚗',
    tags: ['weekend', 'leisure'],
    desc: 'Výlet do Jablonce — Makak lezení, nádraží, zpět.',
    steps: [
      { name: 'Náš domeček',                      lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Makak lezení (Jablonec)',           lat: 50.7271, lon: 15.1498, stayMin: 30, mode: 'driving-car', icon: '🧗', note: 'lezecká stěna Jablonec' },
      { name: 'Jablonec – dolní nádraží',          lat: 50.7265, lon: 15.1486, stayMin: 15, mode: 'foot-walking', icon: '🚂', note: 'procházka po nádraží' },
      { name: 'Náš domeček',                      lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 7. Rychlý test ──────────────────────────────────────────────────────────
  {
    id: 'rychly-test',
    title: '⚡ Rychlý test',
    icon: '⚡',
    tags: [],
    desc: 'Doma → ZŠ Lesní → Albert → doma. Rychlé ověření detekce zastávek.',
    steps: [
      { name: 'Náš domeček',  lat: 50.7793, lon: 15.0581, stayMin: 8,  mode: 'foot-walking', icon: '🏠' },
      { name: 'ZŠ Lesní',     lat: 50.7787, lon: 15.0734, stayMin: 10, mode: 'foot-walking', icon: '🏫' },
      { name: 'Albert',       lat: 50.7752, lon: 15.0625, stayMin: 8,  mode: 'driving-car',  icon: '🛒' },
      { name: 'Náš domeček',  lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car',  icon: '🏠' },
    ],
  },

];
