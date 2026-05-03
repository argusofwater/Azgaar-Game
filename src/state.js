export const state = {
  nations: {},
  provinces: [],
  relations: {},
  playerNation: null,
  selectedProvinceId: null,
  selectedDiplomacyNation: null,
  turn: 1,
  log: [],
  worldSeed: '',
  worldTraits: null
};

export function setWorld({ nations, provinces }) {
  state.nations = nations || {};
  state.provinces = provinces || [];
  state.playerNation = null;
  state.selectedProvinceId = state.provinces[0]?.id ?? null;
  state.turn = 1;
  state.relations = createNeutralRelations(state.nations);
  state.log = [];
  generateWorldBehavior();
}

export function generateWorldBehavior() {
  const a = ['Salt', 'Iron', 'Moon', 'Cinder', 'Thorn', 'Storm', 'Violet', 'Lantern', 'Wolf', 'Star'];
  const b = ['River', 'Crown', 'March', 'Gate', 'Oath', 'Dawn', 'Compact', 'Banner', 'Accord', 'Ember'];
  state.worldSeed = `${pick(a)}-${pick(b)}-${Math.floor(Math.random() * 99999)}`;
  state.worldTraits = {
    aggression: randomRange(0.38, 0.78),
    development: randomRange(0.58, 0.92),
    diplomacy: randomRange(0.18, 0.48),
    volatility: randomRange(0.28, 0.58)
  };
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

export function selectProvince(provinceId) { state.selectedProvinceId = provinceId; }
export function getSelectedProvince() { return state.provinces.find(p => p.id === state.selectedProvinceId) || null; }
export function getRelation(a, b) { if (!a || !b || a === b) return 'self'; return state.relations?.[a]?.[b] || 'neutral'; }

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
  attackerSide.forEach(a => defenderSide.forEach(d => { if (a !== d) setRelation(a, d, 'enemy'); }));
}

export function calculateIncome(nationId) {
  const owned = state.provinces.filter(p => p.owner === nationId);
  return owned.reduce((sum, p) => sum + p.industry * 18, 0) + owned.length * 8;
}

export function canActOnProvince(province) { return Boolean(province && state.playerNation && province.owner === state.playerNation); }
export function getIndustryBuildCost(province) { return 120 + province.industry * 45; }
export function getRecruitCost(amount, province) { return amount * (35 + Math.max(0, province.army - 4) * 2); }

export function buildIndustry() {
  const province = getSelectedProvince();
  if (!canActOnProvince(province)) return 'Select one of your provinces first.';
  const nation = state.nations[state.playerNation];
  const cost = getIndustryBuildCost(province);
  if ((nation.treasury ?? 0) < cost) return `Not enough treasury. Building industry costs ${cost}.`;
  if ((nation.command ?? 0) < 1) return 'Not enough command. Building industry costs 1.';
  nation.treasury -= cost;
  nation.command -= 1;
  province.industry += 1;
  addLog(`${province.name} gains +1 industry for ${cost} treasury and 1 command.`);
  return true;
}

export function recruitArmy() {
  const province = getSelectedProvince();
  if (!canActOnProvince(province)) return 'Select one of your provinces first.';
  const nation = state.nations[state.playerNation];
  const amount = Math.min(3, nation.manpower ?? 0);
  if (amount <= 0) return 'No manpower remains.';
  const cost = getRecruitCost(amount, province);
  if ((nation.treasury ?? 0) < cost) return `Not enough treasury. Recruiting ${amount} army costs ${cost}.`;
  nation.treasury -= cost;
  nation.manpower -= amount;
  province.army += amount;
  addLog(`${province.name} recruits +${amount} army for ${cost} treasury.`);
  return true;
}

export function attackProvince() {
  const target = getSelectedProvince();
  if (!target) return 'Select an enemy province first.';
  if (!state.playerNation) return 'Choose your nation first.';
  if (target.owner === state.playerNation) return 'You cannot attack your own province.';
  const attackers = state.provinces.filter(p => p.owner === state.playerNation && p.neighbors?.includes(target.id)).sort((a, b) => b.army - a.army);
  const attacker = attackers[0];
  if (!attacker) return 'You need an adjacent province to attack from.';
  if (attacker.army < 2) return `${attacker.name} lacks enough army to attack.`;
  if (getRelation(state.playerNation, target.owner) !== 'enemy') {
    declareWarWithAllies(state.playerNation, target.owner);
    addLog(`${state.nations[state.playerNation].name} declares war on ${state.nations[target.owner]?.name || 'an unknown power'}.`);
  }
  return resolveAttack(attacker, target, state.playerNation);
}

function resolveAttack(attacker, target, newOwner) {
  const attackPower = attacker.army + roll(6);
  const defensePower = target.army + target.industry + roll(6);
  if (attackPower > defensePower) {
    const oldOwner = target.owner;
    target.owner = newOwner;
    target.army = Math.max(1, Math.floor(attacker.army / 2));
    attacker.army = Math.max(1, Math.floor(attacker.army / 2));
    addLog(`${target.name} falls to ${state.nations[newOwner].name}.`);
    cleanupDefeatedNations();
    return { conquered: true, provinceId: target.id, oldOwner };
  }
  attacker.army = Math.max(1, attacker.army - 2);
  target.army = Math.max(1, target.army - 1);
  addLog(`${target.name} holds against the attack.`);
  return false;
}

export function endTurn() {
  state.turn += 1;
  Object.entries(state.nations).forEach(([id, nation]) => {
    const owned = state.provinces.filter(p => p.owner === id);
    const industry = owned.reduce((sum, p) => sum + p.industry, 0);
    const army = owned.reduce((sum, p) => sum + p.army, 0);
    nation.treasury = Math.max(0, (nation.treasury ?? 0) + calculateIncome(id) - Math.floor(army * 2));
    nation.command = Math.min(10, (nation.command ?? 0) + Math.ceil(industry / 3));
    nation.manpower = (nation.manpower ?? 0) + owned.length * 2;
  });

  const diplomacyResults = runAiDiplomacy();
  const aiResults = runAiTurn();
  const eventResults = runWorldEvents();
  const actionCount = diplomacyResults.length + aiResults.length + eventResults.length;
  addLog(`Turn ${state.turn} begins. ${actionCount ? `${actionCount} world actions resolved.` : 'The world watches and waits.'}`);
  cleanupDefeatedNations();
  return { ok: true, aiResults, eventResults, diplomacyResults };
}

export function runAiDiplomacy() {
  const results = [];
  const ids = Object.keys(state.nations).filter(id => id !== state.playerNation);
  ids.forEach(id => {
    const owned = state.provinces.filter(p => p.owner === id);
    if (!owned.length) return;
    const neighbors = [...new Set(owned.flatMap(p => p.neighbors || []).map(pid => state.provinces.find(p => p.id === pid)?.owner).filter(owner => owner && owner !== id && state.nations[owner]))];
    if (!neighbors.length) return;

    const currentEnemies = neighbors.filter(other => getRelation(id, other) === 'enemy');
    if (!currentEnemies.length && Math.random() < (state.worldTraits?.aggression ?? 0.55) * 0.42) {
      const target = pick(neighbors);
      declareWarWithAllies(id, target);
      addLog(`${state.nations[id].name} declares war on ${state.nations[target].name}.`);
      results.push({ type: 'war', attackerId: id, defenderId: target });
      return;
    }

    const neutralNeighbors = neighbors.filter(other => getRelation(id, other) === 'neutral');
    if (neutralNeighbors.length && Math.random() < (state.worldTraits?.diplomacy ?? 0.25) * 0.20) {
      const target = pick(neutralNeighbors);
      setRelation(id, target, 'ally');
      addLog(`${state.nations[id].name} signs an alliance with ${state.nations[target].name}.`);
      results.push({ type: 'alliance', nationId: id, targetId: target });
    }
  });
  return results;
}

export function runAiTurn() {
  const results = [];
  Object.keys(state.nations).filter(id => id !== state.playerNation).forEach(id => {
    const owned = state.provinces.filter(p => p.owner === id);
    if (!owned.length) return;
    const nation = state.nations[id];

    if ((nation.manpower ?? 0) > 0 && Math.random() < (state.worldTraits?.development ?? 0.70)) {
      const target = owned.slice().sort((a, b) => a.army - b.army)[0];
      const amount = Math.min(3, nation.manpower);
      nation.manpower -= amount;
      target.army += amount;
      results.push({ type: 'recruit', nationId: id, provinceId: target.id });
    }

    if ((nation.treasury ?? 0) > 130 && (nation.command ?? 0) > 0 && Math.random() < (state.worldTraits?.development ?? 0.70) * 0.55) {
      const target = owned.slice().sort((a, b) => a.industry - b.industry)[0];
      const cost = Math.min(nation.treasury, 120 + target.industry * 35);
      nation.treasury -= cost;
      nation.command -= 1;
      target.industry += 1;
      addLog(`${state.nations[id].name} expands industry in ${target.name}.`);
      results.push({ type: 'build', nationId: id, provinceId: target.id });
    }

    const enemyTargets = state.provinces.filter(p => p.owner !== id && owned.some(o => o.neighbors?.includes(p.id)) && getRelation(id, p.owner) === 'enemy');
    if (enemyTargets.length && Math.random() < (state.worldTraits?.aggression ?? 0.55)) {
      const target = enemyTargets.slice().sort((a, b) => a.army + a.industry - (b.army + b.industry))[0];
      const attacker = owned.filter(p => p.neighbors?.includes(target.id)).sort((a, b) => b.army - a.army)[0];
      if (attacker && attacker.army > target.army + 1) results.push(resolveAttack(attacker, target, id));
    }
  });
  return results.filter(Boolean);
}

export function runWorldEvents() {
  const results = [];
  const ids = Object.keys(state.nations);
  const eventCount = Math.max(2, Math.min(8, Math.floor(ids.length / 6) + 2));
  for (let i = 0; i < eventCount; i++) {
    if (Math.random() > (state.worldTraits?.volatility ?? 0.40)) continue;
    const nationId = pick(ids);
    const owned = state.provinces.filter(p => p.owner === nationId);
    if (!nationId || !owned.length) continue;
    const province = pick(owned);
    if (Math.random() < 0.55) {
      province.industry += 1;
      state.nations[nationId].treasury = (state.nations[nationId].treasury ?? 0) + 75;
      addLog(`Trade boom in ${province.name}.`);
      results.push({ type: 'trade', nationId, provinceId: province.id });
    } else {
      province.army = Math.max(1, province.army - 1);
      province.industry = Math.max(1, province.industry - 1);
      addLog(`Unrest damages ${province.name}.`);
      results.push({ type: 'unrest', nationId, provinceId: province.id });
    }
  }
  return results;
}

export function addLog(message) { state.log.unshift(message); state.log = state.log.slice(0, 80); }

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

function roll(sides) { return Math.floor(Math.random() * sides) + 1; }
function randomRange(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
