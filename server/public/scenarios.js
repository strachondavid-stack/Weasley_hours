// Testovací scénáře pro Weasley Hours
// Souřadnice ověřeny z produkčních geofences (curl /geofences)
// Doma = "Náš domeček": 50.7793, 15.0581

const SC_SCENARIOS = [

  // ── Výlet na Ještěd ──────────────────────────────────────────────────────
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

  // ── Školka Bertík ────────────────────────────────────────────────────────
  {
    id: 'skolka',
    title: 'Školka Bertík',
    icon: '🎒',
    tags: ['school'],
    desc: 'Odvoz do školky a zpět domů.',
    steps: [
      { name: 'Náš domeček',  lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'školka Bertík',lat: 50.7809, lon: 15.0756, stayMin: 25, mode: 'driving-car', icon: '🎒', note: 'předání ve školce' },
      { name: 'Náš domeček',  lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

];
