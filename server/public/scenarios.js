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

  // ════════════════════════════════════════════════════════════════════════
  // RODINNÉ VÝLETY PO ČR (generováno z rodinne_vylety_cr.xlsx)
  // Každý scénář: doma → místo (30 min) → doma
  // ════════════════════════════════════════════════════════════════════════

  // ── 1. Divoká Šárka (weekend·leisure) ──
  {
    id: 'vylet_divoka_sarka',
    title: 'Divoká Šárka',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Divoká Šárka.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Divoká Šárka',      lat: 50.0933,      lon: 14.325,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 2. Pravčická brána (weekend·leisure) ──
  {
    id: 'vylet_pravcicka_brana',
    title: 'Pravčická brána',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Pravčická brána.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Pravčická brána',      lat: 50.8839,      lon: 14.2815,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 3. Propast Macocha (weekend·leisure) ──
  {
    id: 'vylet_propast_macocha',
    title: 'Propast Macocha',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Propast Macocha.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Propast Macocha',      lat: 49.3733,      lon: 16.7347,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 4. Adršpašsko-teplické skály (weekend·leisure) ──
  {
    id: 'vylet_adrspassko_teplicke_skaly',
    title: 'Adršpašsko-teplické skály',
    icon: '🪨',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Adršpašsko-teplické skály.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Adršpašsko-teplické skály',      lat: 50.6103,      lon: 16.1165,      stayMin: 30, mode: 'driving-car', icon: '🪨' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 5. Máchovo jezero (weekend·leisure) ──
  {
    id: 'vylet_machovo_jezero',
    title: 'Máchovo jezero',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Máchovo jezero.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Máchovo jezero',      lat: 50.5813,      lon: 14.6503,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 6. Lipno nad Vltavou (weekend·leisure) ──
  {
    id: 'vylet_lipno_nad_vltavou',
    title: 'Lipno nad Vltavou',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Lipno nad Vltavou.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Lipno nad Vltavou',      lat: 48.6384,      lon: 14.2262,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 7. Harrachov – Krkonoše (weekend·leisure) ──
  {
    id: 'vylet_harrachov_krkonose',
    title: 'Harrachov – Krkonoše',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Harrachov – Krkonoše.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Harrachov – Krkonoše',      lat: 50.7721,      lon: 15.4314,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 8. Botanická zahrada Praha – Troja (weekend·leisure) ──
  {
    id: 'vylet_botanicka_zahrada_praha_troja',
    title: 'Botanická zahrada Praha – Troja',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Botanická zahrada Praha – Troja.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Botanická zahrada Praha – Troja',      lat: 50.1214,      lon: 14.4132,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 9. Prachovské skály (weekend·leisure) ──
  {
    id: 'vylet_prachovske_skaly',
    title: 'Prachovské skály',
    icon: '🪨',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Prachovské skály.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Prachovské skály',      lat: 50.4684,      lon: 15.2851,      stayMin: 30, mode: 'driving-car', icon: '🪨' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 10. Lednicko-valtický areál (weekend·leisure) ──
  {
    id: 'vylet_lednicko_valticky_areal',
    title: 'Lednicko-valtický areál',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Lednicko-valtický areál.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Lednicko-valtický areál',      lat: 48.8017,      lon: 16.8025,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 11. Podyjí – hrad Vranov nad Dyjí (weekend·leisure) ──
  {
    id: 'vylet_podyji_hrad_vranov_nad_dyji',
    title: 'Podyjí – hrad Vranov nad Dyjí',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Podyjí – hrad Vranov nad Dyjí.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Podyjí – hrad Vranov nad Dyjí',      lat: 48.8914,      lon: 15.8073,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 12. Šumava – Boubínský prales (weekend·leisure) ──
  {
    id: 'vylet_sumava_boubinsky_prales',
    title: 'Šumava – Boubínský prales',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Šumava – Boubínský prales.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Šumava – Boubínský prales',      lat: 48.9731,      lon: 13.8069,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 13. Naučná stezka Blaník (weekend·leisure) ──
  {
    id: 'vylet_naucna_stezka_blanik',
    title: 'Naučná stezka Blaník',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Naučná stezka Blaník.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Naučná stezka Blaník',      lat: 49.6325,      lon: 14.8638,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 14. Rafting Vltava – Vyšší Brod (weekend·leisure) ──
  {
    id: 'vylet_rafting_vltava_vyssi_brod',
    title: 'Rafting Vltava – Vyšší Brod',
    icon: '🌲',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Rafting Vltava – Vyšší Brod.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Rafting Vltava – Vyšší Brod',      lat: 48.6234,      lon: 14.308,      stayMin: 30, mode: 'driving-car', icon: '🌲' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 15. Hrad Karlštejn (weekend·leisure) ──
  {
    id: 'vylet_hrad_karlstejn',
    title: 'Hrad Karlštejn',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Karlštejn.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Karlštejn',      lat: 49.9397,      lon: 14.1881,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 16. Hrad Křivoklát (weekend·leisure) ──
  {
    id: 'vylet_hrad_krivoklat',
    title: 'Hrad Křivoklát',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Křivoklát.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Křivoklát',      lat: 50.0376,      lon: 13.8725,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 17. Zámek Hluboká nad Vltavou (weekend·leisure) ──
  {
    id: 'vylet_zamek_hluboka_nad_vltavou',
    title: 'Zámek Hluboká nad Vltavou',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zámek Hluboká nad Vltavou.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zámek Hluboká nad Vltavou',      lat: 49.0511,      lon: 14.4416,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 18. Zámek Lednice (weekend·leisure) ──
  {
    id: 'vylet_zamek_lednice',
    title: 'Zámek Lednice',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zámek Lednice.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zámek Lednice',      lat: 48.8016,      lon: 16.8033,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 19. Hrad Houska (weekend·leisure) ──
  {
    id: 'vylet_hrad_houska',
    title: 'Hrad Houska',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Houska.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Houska',      lat: 50.4909,      lon: 14.624,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 20. Zámek Konopiště (weekend·leisure) ──
  {
    id: 'vylet_zamek_konopiste',
    title: 'Zámek Konopiště',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zámek Konopiště.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zámek Konopiště',      lat: 49.7795,      lon: 14.6566,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 21. Hrad Bouzov (weekend·leisure) ──
  {
    id: 'vylet_hrad_bouzov',
    title: 'Hrad Bouzov',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Bouzov.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Bouzov',      lat: 49.7049,      lon: 16.8895,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 22. Hrad Bezděz (weekend·leisure) ──
  {
    id: 'vylet_hrad_bezdez',
    title: 'Hrad Bezděz',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Bezděz.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Bezděz',      lat: 50.539,      lon: 14.7198,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 23. Zámek Červená Lhota (weekend·leisure) ──
  {
    id: 'vylet_zamek_cervena_lhota',
    title: 'Zámek Červená Lhota',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zámek Červená Lhota.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zámek Červená Lhota',      lat: 49.2466,      lon: 14.8852,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 24. Hrad Pernštejn (weekend·leisure) ──
  {
    id: 'vylet_hrad_pernstejn',
    title: 'Hrad Pernštejn',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Pernštejn.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Pernštejn',      lat: 49.4511,      lon: 16.3181,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 25. Hrad Trosky (weekend·leisure) ──
  {
    id: 'vylet_hrad_trosky',
    title: 'Hrad Trosky',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Trosky.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Trosky',      lat: 50.5165,      lon: 15.2308,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 26. Hrad Loket (weekend·leisure) ──
  {
    id: 'vylet_hrad_loket',
    title: 'Hrad Loket',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Loket.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Loket',      lat: 50.187,      lon: 12.7544,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 27. Hrad Špilberk Brno (weekend·leisure) ──
  {
    id: 'vylet_hrad_spilberk_brno',
    title: 'Hrad Špilberk Brno',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Špilberk Brno.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Špilberk Brno',      lat: 49.1945,      lon: 16.5992,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 28. Český Krumlov – zámek (weekend·leisure) ──
  {
    id: 'vylet_cesky_krumlov_zamek',
    title: 'Český Krumlov – zámek',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Český Krumlov – zámek.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Český Krumlov – zámek',      lat: 48.8118,      lon: 14.3176,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 29. Hrad Rožmberk nad Vltavou (weekend·leisure) ──
  {
    id: 'vylet_hrad_rozmberk_nad_vltavou',
    title: 'Hrad Rožmberk nad Vltavou',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Rožmberk nad Vltavou.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Rožmberk nad Vltavou',      lat: 48.6596,      lon: 14.3643,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 30. Kokořínsko – hrad Kokořín (weekend·leisure) ──
  {
    id: 'vylet_kokorinsko_hrad_kokorin',
    title: 'Kokořínsko – hrad Kokořín',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Kokořínsko – hrad Kokořín.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Kokořínsko – hrad Kokořín',      lat: 50.4336,      lon: 14.5533,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 31. Telč – historické centrum (weekend·leisure) ──
  {
    id: 'vylet_telc_historicke_centrum',
    title: 'Telč – historické centrum',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Telč – historické centrum.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Telč – historické centrum',      lat: 49.1846,      lon: 15.4536,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 32. Hrad Svojanov (weekend·leisure) ──
  {
    id: 'vylet_hrad_svojanov',
    title: 'Hrad Svojanov',
    icon: '🏰',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Hrad Svojanov.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hrad Svojanov',      lat: 49.7007,      lon: 16.4167,      stayMin: 30, mode: 'driving-car', icon: '🏰' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 33. Zoo Praha – Troja (weekend·leisure) ──
  {
    id: 'vylet_zoo_praha_troja',
    title: 'Zoo Praha – Troja',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Praha – Troja.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Praha – Troja',      lat: 50.1177,      lon: 14.4062,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 34. Zoo Zlín – Lešná (weekend·leisure) ──
  {
    id: 'vylet_zoo_zlin_lesna',
    title: 'Zoo Zlín – Lešná',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Zlín – Lešná.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Zlín – Lešná',      lat: 49.2716,      lon: 17.7148,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 35. Zoo Brno (weekend·leisure) ──
  {
    id: 'vylet_zoo_brno',
    title: 'Zoo Brno',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Brno.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Brno',      lat: 49.2297,      lon: 16.5327,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 36. Zoo Plzeň (weekend·leisure) ──
  {
    id: 'vylet_zoo_plzen',
    title: 'Zoo Plzeň',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Plzeň.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Plzeň',      lat: 49.7583,      lon: 13.3561,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 37. Zoo Olomouc (weekend·leisure) ──
  {
    id: 'vylet_zoo_olomouc',
    title: 'Zoo Olomouc',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Olomouc.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Olomouc',      lat: 49.6334,      lon: 17.3434,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 38. Safari Park Dvůr Králové (weekend·leisure) ──
  {
    id: 'vylet_safari_park_dvur_kralove',
    title: 'Safari Park Dvůr Králové',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Safari Park Dvůr Králové.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Safari Park Dvůr Králové',      lat: 50.4348,      lon: 15.7987,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 39. Zoopark Chomutov (weekend·leisure) ──
  {
    id: 'vylet_zoopark_chomutov',
    title: 'Zoopark Chomutov',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoopark Chomutov.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoopark Chomutov',      lat: 50.4735,      lon: 13.4203,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 40. Zoo Liberec (weekend·leisure) ──
  {
    id: 'vylet_zoo_liberec',
    title: 'Zoo Liberec',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Liberec.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Liberec',      lat: 50.7776,      lon: 15.0812,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 41. Zoo Jihlava (weekend·leisure) ──
  {
    id: 'vylet_zoo_jihlava',
    title: 'Zoo Jihlava',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Jihlava.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Jihlava',      lat: 49.3967,      lon: 15.5995,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 42. Zoo Ostrava (weekend·leisure) ──
  {
    id: 'vylet_zoo_ostrava',
    title: 'Zoo Ostrava',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Zoo Ostrava.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Zoo Ostrava',      lat: 49.8465,      lon: 18.3233,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 43. Sea World Praha (weekend·leisure) ──
  {
    id: 'vylet_sea_world_praha',
    title: 'Sea World Praha',
    icon: '🦁',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Sea World Praha.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Sea World Praha',      lat: 50.1057,      lon: 14.4316,      stayMin: 30, mode: 'driving-car', icon: '🦁' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 44. Aquapalace Praha – Čestlice (weekend·leisure) ──
  {
    id: 'vylet_aquapalace_praha_cestlice',
    title: 'Aquapalace Praha – Čestlice',
    icon: '🏊',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Aquapalace Praha – Čestlice.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Aquapalace Praha – Čestlice',      lat: 50.0075,      lon: 14.5715,      stayMin: 30, mode: 'driving-car', icon: '🏊' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 45. Aquapark Olomouc (weekend·leisure) ──
  {
    id: 'vylet_aquapark_olomouc',
    title: 'Aquapark Olomouc',
    icon: '🏊',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Aquapark Olomouc.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Aquapark Olomouc',      lat: 49.5743,      lon: 17.223,      stayMin: 30, mode: 'driving-car', icon: '🏊' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 46. Aquapark Babylon Liberec (weekend·leisure) ──
  {
    id: 'vylet_aquapark_babylon_liberec',
    title: 'Aquapark Babylon Liberec',
    icon: '🏊',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Aquapark Babylon Liberec.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Aquapark Babylon Liberec',      lat: 50.76,      lon: 15.0524,      stayMin: 30, mode: 'driving-car', icon: '🏊' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 47. Vodní svět Letňany Praha (weekend·leisure) ──
  {
    id: 'vylet_vodni_svet_letnany_praha',
    title: 'Vodní svět Letňany Praha',
    icon: '🏊',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Vodní svět Letňany Praha.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Vodní svět Letňany Praha',      lat: 50.127,      lon: 14.502,      stayMin: 30, mode: 'driving-car', icon: '🏊' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 48. Koupaliště Šakvice – Pavlovské moře (weekend·leisure) ──
  {
    id: 'vylet_koupaliste_sakvice_pavlovske_more',
    title: 'Koupaliště Šakvice – Pavlovské moře',
    icon: '🏊',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Koupaliště Šakvice – Pavlovské moře.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Koupaliště Šakvice – Pavlovské moře',      lat: 48.9142,      lon: 16.6734,      stayMin: 30, mode: 'driving-car', icon: '🏊' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 49. Lázně Darkov Karviná – Aquaforum (weekend·leisure) ──
  {
    id: 'vylet_lazne_darkov_karvina_aquaforum',
    title: 'Lázně Darkov Karviná – Aquaforum',
    icon: '🏊',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Lázně Darkov Karviná – Aquaforum.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Lázně Darkov Karviná – Aquaforum',      lat: 49.8634,      lon: 18.5148,      stayMin: 30, mode: 'driving-car', icon: '🏊' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 50. Aquacentrum Kohoutovice Brno (weekend·leisure) ──
  {
    id: 'vylet_aquacentrum_kohoutovice_brno',
    title: 'Aquacentrum Kohoutovice Brno',
    icon: '🏊',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Aquacentrum Kohoutovice Brno.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Aquacentrum Kohoutovice Brno',      lat: 49.202,      lon: 16.531,      stayMin: 30, mode: 'driving-car', icon: '🏊' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 51. Techmania Science Center Plzeň (weekend) ──
  {
    id: 'vylet_techmania_science_center_plzen',
    title: 'Techmania Science Center Plzeň',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Techmania Science Center Plzeň.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Techmania Science Center Plzeň',      lat: 49.7406,      lon: 13.362,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 52. Národní technické muzeum Praha (weekend) ──
  {
    id: 'vylet_narodni_technicke_muzeum_praha',
    title: 'Národní technické muzeum Praha',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Národní technické muzeum Praha.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Národní technické muzeum Praha',      lat: 50.0973,      lon: 14.4249,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 53. Muzeum v přírodě Rožnov pod Radhoštěm (weekend) ──
  {
    id: 'vylet_muzeum_v_prirode_roznov_pod_radhostem',
    title: 'Muzeum v přírodě Rožnov pod Radhoštěm',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Muzeum v přírodě Rožnov pod Radhoštěm.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Muzeum v přírodě Rožnov pod Radhoštěm',      lat: 49.4615,      lon: 18.1495,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 54. iQpark Liberec (weekend) ──
  {
    id: 'vylet_iqpark_liberec',
    title: 'iQpark Liberec',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: iQpark Liberec.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'iQpark Liberec',      lat: 50.7611,      lon: 15.0532,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 55. Hvězdárna a planetárium Brno (weekend) ──
  {
    id: 'vylet_hvezdarna_a_planetarium_brno',
    title: 'Hvězdárna a planetárium Brno',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Hvězdárna a planetárium Brno.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hvězdárna a planetárium Brno',      lat: 49.2048,      lon: 16.5837,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 56. Planetárium Praha (weekend) ──
  {
    id: 'vylet_planetarium_praha',
    title: 'Planetárium Praha',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Planetárium Praha.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Planetárium Praha',      lat: 50.1055,      lon: 14.4276,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 57. Muzeum v přírodě Veselý Kopec (weekend) ──
  {
    id: 'vylet_muzeum_v_prirode_vesely_kopec',
    title: 'Muzeum v přírodě Veselý Kopec',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Muzeum v přírodě Veselý Kopec.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Muzeum v přírodě Veselý Kopec',      lat: 49.7617,      lon: 15.837,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 58. Hornické muzeum Příbram – Šachta (weekend) ──
  {
    id: 'vylet_hornicke_muzeum_pribram_sachta',
    title: 'Hornické muzeum Příbram – Šachta',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Hornické muzeum Příbram – Šachta.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hornické muzeum Příbram – Šachta',      lat: 49.6829,      lon: 13.9871,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 59. Muzeum LEGO Praha (weekend) ──
  {
    id: 'vylet_muzeum_lego_praha',
    title: 'Muzeum LEGO Praha',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Muzeum LEGO Praha.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Muzeum LEGO Praha',      lat: 50.0826,      lon: 14.4194,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 60. Dino Park Harrachov (weekend) ──
  {
    id: 'vylet_dino_park_harrachov',
    title: 'Dino Park Harrachov',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Dino Park Harrachov.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Dino Park Harrachov',      lat: 50.7727,      lon: 15.4255,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 61. Muzeum loutek Chrudim (weekend) ──
  {
    id: 'vylet_muzeum_loutek_chrudim',
    title: 'Muzeum loutek Chrudim',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Muzeum loutek Chrudim.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Muzeum loutek Chrudim',      lat: 49.9505,      lon: 15.7955,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 62. Sklárna Crystalex Nový Bor (weekend) ──
  {
    id: 'vylet_sklarna_crystalex_novy_bor',
    title: 'Sklárna Crystalex Nový Bor',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Sklárna Crystalex Nový Bor.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Sklárna Crystalex Nový Bor',      lat: 50.7602,      lon: 14.5554,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 63. Hvězdárna Kleť – jižní Čechy (weekend) ──
  {
    id: 'vylet_hvezdarna_klet_jizni_cechy',
    title: 'Hvězdárna Kleť – jižní Čechy',
    icon: '🏛',
    tags: ['weekend'],
    desc: 'Rodinný výlet: Hvězdárna Kleť – jižní Čechy.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Hvězdárna Kleť – jižní Čechy',      lat: 48.866,      lon: 14.2903,      stayMin: 30, mode: 'driving-car', icon: '🏛' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 64. Punkevní jeskyně (weekend·leisure) ──
  {
    id: 'vylet_punkevni_jeskyne',
    title: 'Punkevní jeskyně',
    icon: '🕳',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Punkevní jeskyně.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Punkevní jeskyně',      lat: 49.371,      lon: 16.726,      stayMin: 30, mode: 'driving-car', icon: '🕳' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 65. Koněpruské jeskyně (weekend·leisure) ──
  {
    id: 'vylet_konepruske_jeskyne',
    title: 'Koněpruské jeskyně',
    icon: '🕳',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Koněpruské jeskyně.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Koněpruské jeskyně',      lat: 49.9161,      lon: 14.0688,      stayMin: 30, mode: 'driving-car', icon: '🕳' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 66. Bozkovské dolomitové jeskyně (weekend·leisure) ──
  {
    id: 'vylet_bozkovske_dolomitove_jeskyne',
    title: 'Bozkovské dolomitové jeskyně',
    icon: '🕳',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Bozkovské dolomitové jeskyně.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Bozkovské dolomitové jeskyně',      lat: 50.6476,      lon: 15.3386,      stayMin: 30, mode: 'driving-car', icon: '🕳' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 67. Javoříčské jeskyně (weekend·leisure) ──
  {
    id: 'vylet_javoricske_jeskyne',
    title: 'Javoříčské jeskyně',
    icon: '🕳',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Javoříčské jeskyně.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Javoříčské jeskyně',      lat: 49.6703,      lon: 16.9139,      stayMin: 30, mode: 'driving-car', icon: '🕳' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 68. Jeskyně Na Špičáku – Jeseníky (weekend·leisure) ──
  {
    id: 'vylet_jeskyne_na_spicaku_jeseniky',
    title: 'Jeskyně Na Špičáku – Jeseníky',
    icon: '🕳',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Jeskyně Na Špičáku – Jeseníky.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Jeskyně Na Špičáku – Jeseníky',      lat: 50.1085,      lon: 17.203,      stayMin: 30, mode: 'driving-car', icon: '🕳' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 69. Sněžka – lanovka z Pece (weekend·leisure) ──
  {
    id: 'vylet_snezka_lanovka_z_pece',
    title: 'Sněžka – lanovka z Pece',
    icon: '🏔',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Sněžka – lanovka z Pece.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Sněžka – lanovka z Pece',      lat: 50.7051,      lon: 15.7329,      stayMin: 30, mode: 'driving-car', icon: '🏔' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 70. Ještěd – lanovka Liberec (weekend·leisure) ──
  {
    id: 'vylet_jested_lanovka_liberec',
    title: 'Ještěd – lanovka Liberec',
    icon: '🏔',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Ještěd – lanovka Liberec.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Ještěd – lanovka Liberec',      lat: 50.7354,      lon: 15.0011,      stayMin: 30, mode: 'driving-car', icon: '🏔' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 71. Klínovec – Krušné hory (weekend·leisure) ──
  {
    id: 'vylet_klinovec_krusne_hory',
    title: 'Klínovec – Krušné hory',
    icon: '🏔',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Klínovec – Krušné hory.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Klínovec – Krušné hory',      lat: 50.3959,      lon: 12.9679,      stayMin: 30, mode: 'driving-car', icon: '🏔' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 72. Bobová dráha Tanvaldský Špičák (weekend·leisure) ──
  {
    id: 'vylet_bobova_draha_tanvaldsky_spicak',
    title: 'Bobová dráha Tanvaldský Špičák',
    icon: '🏔',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Bobová dráha Tanvaldský Špičák.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Bobová dráha Tanvaldský Špičák',      lat: 50.7466,      lon: 15.3102,      stayMin: 30, mode: 'driving-car', icon: '🏔' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 73. Skiareál Špindlerův Mlýn (weekend·leisure) ──
  {
    id: 'vylet_skiareal_spindleruv_mlyn',
    title: 'Skiareál Špindlerův Mlýn',
    icon: '🏔',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Skiareál Špindlerův Mlýn.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Skiareál Špindlerův Mlýn',      lat: 50.7241,      lon: 15.6177,      stayMin: 30, mode: 'driving-car', icon: '🏔' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 74. Skalní město Hruboskalsko (weekend·leisure) ──
  {
    id: 'vylet_skalni_mesto_hruboskalsko',
    title: 'Skalní město Hruboskalsko',
    icon: '🪨',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Skalní město Hruboskalsko.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Skalní město Hruboskalsko',      lat: 50.5029,      lon: 15.2401,      stayMin: 30, mode: 'driving-car', icon: '🪨' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 75. Certovy kazatelny – Kokořínsko (weekend·leisure) ──
  {
    id: 'vylet_certovy_kazatelny_kokorinsko',
    title: 'Certovy kazatelny – Kokořínsko',
    icon: '🪨',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Certovy kazatelny – Kokořínsko.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Certovy kazatelny – Kokořínsko',      lat: 50.3984,      lon: 14.5618,      stayMin: 30, mode: 'driving-car', icon: '🪨' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 76. Farma Volšovka Netolice (weekend·leisure) ──
  {
    id: 'vylet_farma_volsovka_netolice',
    title: 'Farma Volšovka Netolice',
    icon: '🐄',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Farma Volšovka Netolice.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Farma Volšovka Netolice',      lat: 49.0455,      lon: 14.1923,      stayMin: 30, mode: 'driving-car', icon: '🐄' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 77. Alpaka farma Vysočina (weekend·leisure) ──
  {
    id: 'vylet_alpaka_farma_vysocina',
    title: 'Alpaka farma Vysočina',
    icon: '🐄',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Alpaka farma Vysočina.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Alpaka farma Vysočina',      lat: 49.4801,      lon: 15.8764,      stayMin: 30, mode: 'driving-car', icon: '🐄' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 78. Dětská farma Líšnice u Prahy (weekend·leisure) ──
  {
    id: 'vylet_detska_farma_lisnice_u_prahy',
    title: 'Dětská farma Líšnice u Prahy',
    icon: '🐄',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Dětská farma Líšnice u Prahy.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Dětská farma Líšnice u Prahy',      lat: 49.922,      lon: 14.3085,      stayMin: 30, mode: 'driving-car', icon: '🐄' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 79. Ovčí farma Starý Hrozenkov (weekend·leisure) ──
  {
    id: 'vylet_ovci_farma_stary_hrozenkov',
    title: 'Ovčí farma Starý Hrozenkov',
    icon: '🐄',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Ovčí farma Starý Hrozenkov.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Ovčí farma Starý Hrozenkov',      lat: 49.0224,      lon: 17.7971,      stayMin: 30, mode: 'driving-car', icon: '🐄' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 80. Šiklův Mlýn – westernové město (weekend·leisure) ──
  {
    id: 'vylet_sikluv_mlyn_westernove_mesto',
    title: 'Šiklův Mlýn – westernové město',
    icon: '🐄',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Šiklův Mlýn – westernové město.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Šiklův Mlýn – westernové město',      lat: 49.4745,      lon: 16.1665,      stayMin: 30, mode: 'driving-car', icon: '🐄' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 81. Stezka korunami stromů Lipno (weekend·leisure) ──
  {
    id: 'vylet_stezka_korunami_stromu_lipno',
    title: 'Stezka korunami stromů Lipno',
    icon: '🎡',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Stezka korunami stromů Lipno.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Stezka korunami stromů Lipno',      lat: 48.6467,      lon: 14.2218,      stayMin: 30, mode: 'driving-car', icon: '🎡' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 82. Mirakulum Milovice (weekend·leisure) ──
  {
    id: 'vylet_mirakulum_milovice',
    title: 'Mirakulum Milovice',
    icon: '🎡',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Mirakulum Milovice.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Mirakulum Milovice',      lat: 50.2327,      lon: 14.8981,      stayMin: 30, mode: 'driving-car', icon: '🎡' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 83. Adrenalin park Jedlový důl Liberec (weekend·leisure) ──
  {
    id: 'vylet_adrenalin_park_jedlovy_dul_liberec',
    title: 'Adrenalin park Jedlový důl Liberec',
    icon: '🎡',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Adrenalin park Jedlový důl Liberec.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Adrenalin park Jedlový důl Liberec',      lat: 50.7556,      lon: 15.0811,      stayMin: 30, mode: 'driving-car', icon: '🎡' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 84. Centrum Babylon Liberec (weekend·leisure) ──
  {
    id: 'vylet_centrum_babylon_liberec',
    title: 'Centrum Babylon Liberec',
    icon: '🎡',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Centrum Babylon Liberec.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Centrum Babylon Liberec',      lat: 50.76,      lon: 15.0508,      stayMin: 30, mode: 'driving-car', icon: '🎡' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 85. Minigolf Mariánské Lázně (weekend·leisure) ──
  {
    id: 'vylet_minigolf_marianske_lazne',
    title: 'Minigolf Mariánské Lázně',
    icon: '🎡',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Minigolf Mariánské Lázně.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Minigolf Mariánské Lázně',      lat: 49.9643,      lon: 12.7012,      stayMin: 30, mode: 'driving-car', icon: '🎡' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 86. Dinopark Praha – Harfa (weekend·leisure) ──
  {
    id: 'vylet_dinopark_praha_harfa',
    title: 'Dinopark Praha – Harfa',
    icon: '🎡',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Dinopark Praha – Harfa.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Dinopark Praha – Harfa',      lat: 50.1106,      lon: 14.4788,      stayMin: 30, mode: 'driving-car', icon: '🎡' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

  // ── 87. Dinopark Plzeň (weekend·leisure) ──
  {
    id: 'vylet_dinopark_plzen',
    title: 'Dinopark Plzeň',
    icon: '🎡',
    tags: ['weekend', 'leisure'],
    desc: 'Rodinný výlet: Dinopark Plzeň.',
    steps: [
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
      { name: 'Dinopark Plzeň',      lat: 49.7474,      lon: 13.3776,      stayMin: 30, mode: 'driving-car', icon: '🎡' },
      { name: 'Náš domeček', lat: 50.7793, lon: 15.0581, stayMin: 0,  mode: 'driving-car', icon: '🏠' },
    ],
  },

];
