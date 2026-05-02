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

export function canActOnProvince(province) {
  return Boolean(province && state.playerNation && province.owner === state.playerNation);
}

export function getIndustryBuildCost(province) {
  return 120 + province.industry * 45;
}

export function getRecruitCost(amount, province) {
  return amount * (35 + Math.max(0, province.army - 4) * 2);
}

export function buildIndustry() {
  const province = getSelectedProvince();
  if (!canActOnProvince(province)) return 'Select one of your provinces first.';

  const nation = state.nations[state.playerNation];
  const cost = getIndustryBuildCost(province);
  const commandCost = 2;

  if ((nation.treasury ?? 0) < cost) return `Not enough treasury. Building industry costs ${cost}.`;
  if ((nation.command ?? 0) < commandCost) return `Not enough command. Building industry costs ${commandCost}.`;

  nation.treasury -= cost;
  nation.command -= commandCost;
  province.industry += 1;
  addLog(`${province.name} gains +1 industry for ${cost} treasury.`);
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

  const attackers = state.provinces
    .filter(p => p.owner === state.playerNation && Array.isArray(p.neighbors) && p.neighbors.includes(target.id))
    .sort((a, b) => b.army - a.army);

  const attacker = attackers[0];
  if (!attacker) return 'You need an adjacent province to attack from.';
  if (attacker.army < 2) return `${attacker.name} lacks enough army to attack.`;

  if (getRelation(state.playerNation, target.owner) !== 'enemy') {
    declareWarWithAllies(state.playerNation, target.owner);
    addLog(`${state.nations[state.playerNation].name} declares war on ${state.nations[target.owner]?.name || 'an unknown power'}.`);
  }

  const attackPower = attacker.army + roll(6);
  const defensePower = target.army + target.industry + roll(6);

  if (attackPower > defensePower) {
    const oldOwner = target.owner;
    target.owner = state.playerNation;
    target.army = Math.max(1, Math.floor(attacker.army / 2));
    attacker.army = Math.max(1, Math.floor(attacker.army / 2));
    addLog(`${target.name} falls to ${state.nations[state.playerNation].name}.`);
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
    const income = calculateIncome(id);
    const upkeep = Math.floor(army * 2);

    nation.treasury = Math.max(0, (nation.treasury ?? 0) + income - upkeep);
    nation.command = Math.min(10, (nation.command ?? 0) + Math.ceil(industry / 3));
    nation.manpower = (nation.manpower ?? 0) + owned.length * 2;
  });

  addLog(`Turn ${state.turn} begins. Income collected and armies paid.`);
  cleanupDefeatedNations();
  return true;
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

function roll(sides) {
  return Math.floor(Math.random() * sides) + 1;
}
