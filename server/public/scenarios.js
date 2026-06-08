// Scénáře se načítají ze serveru (/scenarios endpoint)
// Soubor scenarios_data.json na serveru obsahuje všechna data

let SC_SCENARIOS = [];
let SC_CATEGORIES = [];

async function loadScenarios() {
  try {
    const data = await fetch('/scenarios').then(r => r.json());
    SC_CATEGORIES = data.categories || [];
    SC_SCENARIOS = SC_CATEGORIES.flatMap(c => c.scenarios || []);
    console.log(`[SC] Načteno ${SC_SCENARIOS.length} scénářů v ${SC_CATEGORIES.length} kategoriích`);
    if (typeof renderScenarios === 'function') renderScenarios();
  } catch(e) {
    console.error('[SC] Chyba načítání scénářů:', e);
  }
}

// Načti při startu
loadScenarios();
