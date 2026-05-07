export const TECH_TREE = [
  {
    id: 'logistics',
    name: 'Field Logistics',
    maxLevel: 3,
    baseCost: 180,
    description: '+1 reposition capacity per level and stronger frontline sustain.'
  },
  {
    id: 'doctrine',
    name: 'Battle Doctrine',
    maxLevel: 3,
    baseCost: 220,
    description: '+1 attack pressure per level during contested frontline ticks.'
  },
  {
    id: 'entrenchment',
    name: 'Entrenchment',
    maxLevel: 3,
    baseCost: 210,
    description: '+1 defense pressure per level when holding territory.'
  },
  {
    id: 'motorization',
    name: 'Motorization',
    maxLevel: 2,
    baseCost: 280,
    description: 'Armies push farther during frontline contests and reposition more troops.'
  },
  {
    id: 'industrialization',
    name: 'Industrialization',
    maxLevel: 3,
    baseCost: 240,
    description: '+10% income per level and cheaper industry development.'
  }
];

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
  worldTraits: null,
  activeFronts: []
};

export function setWorld({ nations, provinces }) {
  state.nations = nations || {};
  state.provinces = provinces || [];
  state.playerNation = null;
  state.selectedProvinceId = state.provinces[0]?.id ?? null;
  state.turn = 1;
  state.relations = createNeutralRelations(state.nations);
  state.log = [];
  state.activeFronts = [];
  Object.keys(state.nations).forEach(initNationTech);
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
    ids.forEach(b => { if (a !== b) table[a][b] = 'neutral'; });
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
export function getProvince(provinceId) { return state.provinces.find(p => p.id === provinceId) || null; }
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
  if (!attackerId || !defenderId || attackerId === defenderId) return [];
  const defenderSide = new Set([defenderId, ...getRelationsFor(defenderId, 'ally')]);
  const attackerSide = new Set([attackerId, ...getRelationsFor(attackerId, 'ally')]);
  const created = [];
  attackerSide.forEach(a => defenderSide.forEach(d => {
    if (a === d) return;
    setRelation(a, d, 'enemy');
    created.push(...seedFrontlinesForWar(a, d));
  }));
  return created;
}

export function calculateIncome(nationId) {
  const owned = state.provinces.filter(p => p.owner === nationId);
  const base = owned.reduce((sum, p) => sum + p.industry * 18, 0) + owned.length * 8;
  const tech = getTechEffects(nationId);
  return Math.floor(base * tech.incomeMultiplier);
}

export function canActOnProvince(province) { return Boolean(province && state.playerNation && province.owner === state.playerNation); }
export function getIndustryBuildCost(province, nationId = state.playerNation) {
  const tech = getTechEffects(nationId);
  return Math.floor((120 + province.industry * 45) * tech.industryCostMultiplier);
}
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

export function moveArmyToSelectedProvince() {
  const destination = getSelectedProvince();
  if (!canActOnProvince(destination)) return 'Select one of your provinces as the destination.';
  const sources = state.provinces
    .filter(p => p.owner === state.playerNation && p.id !== destination.id && p.neighbors?.includes(destination.id) && p.army > 1)
    .sort((a, b) => b.army - a.army);
  const source = sources[0];
  if (!source) return 'No adjacent friendly province has spare army to reposition.';
  const cap = getTechEffects(state.playerNation).moveCapacity;
  const amount = Math.min(cap, source.army - 1);
  source.army -= amount;
  destination.army += amount;
  addLog(`${amount} army repositioned from ${source.name} to ${destination.name}.`);
  return { ok: true, type: 'move', fromProvinceId: source.id, toProvinceId: destination.id, amount };
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
  const front = createFront(attacker.id, target.id, state.playerNation, target.owner, 'player offensive');
  if (!front) return 'That border already has an active frontline.';
  addLog(`${state.nations[state.playerNation].name} launches an offensive from ${attacker.name} into ${target.name}.`);
  return { type: 'front', front };
}

export function researchTech(techId, nationId = state.playerNation) {
  if (!nationId || !state.nations[nationId]) return 'Choose your nation first.';
  initNationTech(nationId);
  const tech = TECH_TREE.find(t => t.id === techId);
  if (!tech) return 'Unknown technology.';
  const current = state.nations[nationId].techs[techId] || 0;
  if (current >= tech.maxLevel) return `${tech.name} is already maxed.`;
  const cost = getTechCost(techId, nationId);
  const nation = state.nations[nationId];
  if ((nation.treasury ?? 0) < cost) return `Not enough treasury. ${tech.name} level ${current + 1} costs ${cost}.`;
  nation.treasury -= cost;
  nation.techs[techId] = current + 1;
  addLog(`${nation.name} researches ${tech.name} level ${current + 1}.`);
  return { ok: true, type: 'tech', techId, level: current + 1 };
}

export function getTechCost(techId, nationId = state.playerNation) {
  const tech = TECH_TREE.find(t => t.id === techId);
  const level = state.nations[nationId]?.techs?.[techId] || 0;
  return tech ? Math.floor(tech.baseCost * (level + 1) * 1.35) : 0;
}

export function getTechEffects(nationId) {
  const n = state.nations[nationId] || {};
  const techs = n.techs || {};
  const logistics = techs.logistics || 0;
  const doctrine = techs.doctrine || 0;
  const entrenchment = techs.entrenchment || 0;
  const motorization = techs.motorization || 0;
  const industrialization = techs.industrialization || 0;
  return {
    moveCapacity: 3 + logistics + motorization * 2,
    attackBonus: doctrine,
    defenseBonus: entrenchment,
    sustainBonus: logistics,
    pushBonus: motorization,
    incomeMultiplier: 1 + industrialization * 0.10,
    industryCostMultiplier: Math.max(0.65, 1 - industrialization * 0.08)
  };
}

export function seedFrontlinesForWar(a, b) {
  const created = [];
  const aOwned = state.provinces.filter(p => p.owner === a);
  for (const from of aOwned) {
    for (const neighborId of from.neighbors || []) {
      const to = getProvince(neighborId);
      if (!to || to.owner !== b) continue;
      const front = createFront(from.id, to.id, a, b, 'war declaration');
      if (front) created.push(front);
    }
  }
  if (created.length) {
    addLog(`${state.nations[a]?.name || a} and ${state.nations[b]?.name || b} clash across ${created.length} border front${created.length === 1 ? '' : 's'}.`);
  }
  return created;
}

export function resolveFrontlineTicks(ticks = 30) {
  const results = [];
  for (let i = 0; i < ticks; i++) {
    for (const front of state.activeFronts) tickFront(front, results);
    state.activeFronts = state.activeFronts.filter(front => !front.finished && front.tick < 30 && getProvince(front.fromProvinceId) && getProvince(front.toProvinceId));
  }
  for (const front of state.activeFronts) {
    if (front.tick >= 30) settleFront(front, results);
  }
  state.activeFronts = state.activeFronts.filter(front => !front.finished);
  cleanupDefeatedNations();
  return results;
}

export function endTurn() {
  const frontResults = resolveFrontlineTicks(30);
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
  const actionCount = frontResults.length + diplomacyResults.length + aiResults.length + eventResults.length;
  addLog(`Turn ${state.turn} begins. ${actionCount ? `${actionCount} world actions resolved.` : 'The world watches and waits.'}`);
  cleanupDefeatedNations();
  return { ok: true, frontResults, aiResults, eventResults, diplomacyResults };
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
    if (!currentEnemies.length && Math.random() < (state.worldTraits?.aggression ?? 0.55) * 0.55) {
      const target = pick(neighbors);
      const fronts = declareWarWithAllies(id, target);
      addLog(`${state.nations[id].name} declares war on ${state.nations[target].name}.`);
      results.push({ type: 'war', attackerId: id, defenderId: target, fronts });
      return;
    }
    const neutralNeighbors = neighbors.filter(other => getRelation(id, other) === 'neutral');
    if (neutralNeighbors.length && Math.random() < (state.worldTraits?.diplomacy ?? 0.25) * 0.12) {
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
    initNationTech(id);
    if ((nation.treasury ?? 0) > 220 && Math.random() < 0.18) {
      const tech = pick(TECH_TREE.filter(t => (nation.techs[t.id] || 0) < t.maxLevel));
      if (tech) results.push(researchTech(tech.id, id));
    }
    if ((nation.manpower ?? 0) > 0 && Math.random() < (state.worldTraits?.development ?? 0.70)) {
      const target = owned.slice().sort((a, b) => a.army - b.army)[0];
      const amount = Math.min(3, nation.manpower);
      nation.manpower -= amount;
      target.army += amount;
      results.push({ type: 'recruit', nationId: id, provinceId: target.id });
    }
    if ((nation.treasury ?? 0) > 130 && (nation.command ?? 0) > 0 && Math.random() < (state.worldTraits?.development ?? 0.70) * 0.55) {
      const target = owned.slice().sort((a, b) => a.industry - b.industry)[0];
      const cost = Math.min(nation.treasury, getIndustryBuildCost(target, id));
      nation.treasury -= cost;
      nation.command -= 1;
      target.industry += 1;
      addLog(`${state.nations[id].name} expands industry in ${target.name}.`);
      results.push({ type: 'build', nationId: id, provinceId: target.id });
    }
    const enemyTargets = state.provinces.filter(p => p.owner !== id && owned.some(o => o.neighbors?.includes(p.id)) && getRelation(id, p.owner) === 'enemy');
    const attacksThisTurn = Math.random() < 0.35 ? 2 : 1;
    for (let i = 0; i < attacksThisTurn; i++) {
      if (!enemyTargets.length || Math.random() >= (state.worldTraits?.aggression ?? 0.55)) continue;
      const target = enemyTargets.slice().sort((a, b) => a.army + a.industry - (b.army + b.industry))[0];
      const attacker = owned.filter(p => p.neighbors?.includes(target.id)).sort((a, b) => b.army - a.army)[0];
      if (attacker && attacker.army > 1) {
        const front = createFront(attacker.id, target.id, id, target.owner, 'ai offensive');
        if (front) results.push({ type: 'front', front });
      }
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

export function addLog(message) { state.log.unshift(message); state.log = state.log.slice(0, 100); }

export function cleanupDefeatedNations() {
  const defeated = Object.keys(state.nations).filter(id => !state.provinces.some(p => p.owner === id));
  defeated.forEach(id => {
    const name = state.nations[id]?.name || id;
    delete state.nations[id];
    delete state.relations[id];
    Object.keys(state.relations).forEach(other => delete state.relations[other]?.[id]);
    state.activeFronts = state.activeFronts.filter(f => f.attackerOwner !== id && f.defenderOwner !== id);
    addLog(`${name} has been eliminated from the world.`);
  });
  return defeated;
}

function initNationTech(nationId) {
  const nation = state.nations[nationId];
  if (!nation) return;
  if (!nation.techs) nation.techs = {};
  TECH_TREE.forEach(tech => { if (typeof nation.techs[tech.id] !== 'number') nation.techs[tech.id] = 0; });
}

function createFront(fromProvinceId, toProvinceId, attackerOwner, defenderOwner, reason = 'frontline') {
  const from = getProvince(fromProvinceId);
  const to = getProvince(toProvinceId);
  if (!from || !to || from.owner !== attackerOwner || to.owner !== defenderOwner || !from.neighbors?.includes(to.id)) return null;
  const key = [fromProvinceId, toProvinceId].sort().join('::');
  const existing = state.activeFronts.find(f => f.key === key);
  if (existing) {
    existing.attackerOwner = attackerOwner;
    existing.defenderOwner = defenderOwner;
    existing.reason = reason;
    return existing;
  }
  const front = {
    id: `front-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    key,
    fromProvinceId,
    toProvinceId,
    attackerOwner,
    defenderOwner,
    tick: 0,
    momentum: 0,
    border: 0.5,
    reason,
    finished: false
  };
  state.activeFronts.push(front);
  return front;
}

function tickFront(front, results) {
  const from = getProvince(front.fromProvinceId);
  const to = getProvince(front.toProvinceId);
  if (!from || !to || from.owner !== front.attackerOwner || to.owner !== front.defenderOwner) {
    front.finished = true;
    return;
  }
  front.tick += 1;
  const attackerTech = getTechEffects(front.attackerOwner);
  const defenderTech = getTechEffects(front.defenderOwner);
  const attackScore = from.army + attackerTech.attackBonus + attackerTech.sustainBonus + attackerTech.pushBonus + roll(6);
  const defenseScore = to.army + to.industry + defenderTech.defenseBonus + Math.ceil(defenderTech.sustainBonus / 2) + roll(6);
  const delta = Math.max(-5, Math.min(5, attackScore - defenseScore));
  front.momentum += delta;
  front.border = Math.max(0.08, Math.min(0.92, front.border + delta * 0.018));
  if (front.tick % 6 === 0) {
    if (delta > 0) to.army = Math.max(0, to.army - 1);
    if (delta < 0) from.army = Math.max(1, from.army - 1);
  }
  if (from.army <= 1 && front.momentum < -8) settleFront(front, results);
  if (to.army <= 0 || front.momentum > 18) settleFront(front, results);
}

function settleFront(front, results) {
  if (front.finished) return;
  const from = getProvince(front.fromProvinceId);
  const to = getProvince(front.toProvinceId);
  if (!from || !to) {
    front.finished = true;
    return;
  }
  if (front.momentum > 12 || to.army <= 0) {
    const oldOwner = to.owner;
    const newOwner = front.attackerOwner;
    const transfer = Math.max(1, Math.floor(from.army / 2));
    from.army = Math.max(1, from.army - transfer);
    to.owner = newOwner;
    to.army = Math.max(1, transfer);
    to.disputed = false;
    addLog(`${to.name} falls after 30 frontline ticks.`);
    results.push({ type: 'conquered', provinceId: to.id, oldOwner, newOwner, frontId: front.id });
    seedFrontlinesForWar(newOwner, oldOwner);
  } else if (front.momentum < -14) {
    from.army = Math.max(1, from.army - 1);
    to.disputed = false;
    addLog(`${to.name} repels the offensive. The border hardens.`);
    results.push({ type: 'repelled', provinceId: to.id, frontId: front.id });
  } else {
    to.disputed = true;
    to.disputeBorder = Number(front.border.toFixed(2));
    addLog(`${to.name} remains disputed. The front halts inside the province.`);
    results.push({ type: 'stalemate', provinceId: to.id, frontId: front.id, border: to.disputeBorder });
  }
  front.finished = true;
}

function roll(sides) { return Math.floor(Math.random() * sides) + 1; }
function randomRange(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
