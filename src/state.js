export const state = {
  nations: {},
  provinces: [],
  relations: {},
  playerNation: null,
  selectedProvinceId: null,
  selectedDiplomacyNation: null,
  turn: 1,
  log: []
};

export function setWorld({ nations, provinces }) {
  state.nations = nations || {};
  state.provinces = provinces || [];
  state.playerNation = null;
  state.selectedProvinceId = state.provinces[0]?.id ?? null;
  state.turn = 1;
  state.relations = createNeutralRelations(state.nations);
  state.log = [];
}

export function createNeutralRelations(nations) {
  const ids = Object.keys(nations || {});
  const table = {};
  ids.forEach(a => {
    table[a] = {};
    ids.forEach(b => {
      if (a !== b) table[a][b] = 'neutral';
    });
  });
  return table;
}

export function choosePlayerNation(nationId) {
  if (!state.nations[nationId]) throw new Error(`Unknown nation: ${nationId}`);
  state.playerNation = nationId;
  state.selectedProvinceId = state.provinces.find(p => p.owner === nationId)?.id ?? state.selectedProvinceId;
}

export function selectProvince(provinceId) {
  state.selectedProvinceId = provinceId;
}

export function getSelectedProvince() {
  return state.provinces.find(p => p.id === state.selectedProvinceId) || null;
}

export function getRelation(a, b) {
  if (!a || !b || a === b) return 'self';
  return state.relations?.[a]?.[b] || 'neutral';
}

export function getRelationsFor(nationId, type) {
  return Object.entries(state.relations?.[nationId] || {})
    .filter(([, relation]) => relation === type)
    .map(([otherId]) => otherId)
    .filter(id => state.nations[id]);
}

export function setRelation(a, b, type) {
  if (!a || !b || a === b) return;
  if (!state.relations[a]) state.relations[a] = {};
  if (!state.relations[b]) state.relations[b] = {};
  state.relations[a][b] = type;
  state.relations[b][a] = type;
}

export function declareWarWithAllies(attackerId, defenderId) {
  if (!attackerId || !defenderId || attackerId === defenderId) return;
  const defenderSide = new Set([defenderId, ...getRelationsFor(defenderId, 'ally')]);
  const attackerSide = new Set([attackerId, ...getRelationsFor(attackerId, 'ally')]);

  attackerSide.forEach(a => {
    defenderSide.forEach(d => {
      if (a !== d) setRelation(a, d, 'enemy');
    });
  });
}

export function calculateIncome(nationId) {
  const owned = state.provinces.filter(p => p.owner === nationId);
  const industryIncome = owned.reduce((sum, p) => sum + p.industry * 18, 0);
  const provinceIncome = owned.length * 8;
  return industryIncome + provinceIncome;
}

export function addLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 80);
}

export function cleanupDefeatedNations() {
  const defeated = Object.keys(state.nations).filter(id => !state.provinces.some(p => p.owner === id));
  defeated.forEach(id => {
    const name = state.nations[id]?.name || id;
    delete state.nations[id];
    delete state.relations[id];
    Object.keys(state.relations).forEach(other => delete state.relations[other]?.[id]);
    addLog(`${name} has been eliminated from the world.`);
  });
  return defeated;
}
