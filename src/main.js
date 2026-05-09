import {
  TECH_TREE,
  state,
  setWorld,
  choosePlayerNation,
  selectProvince,
  getSelectedProvince,
  getRelationsFor,
  getRelation,
  setRelation,
  declareWarWithAllies,
  calculateIncome,
  addLog,
  buildIndustry,
  recruitArmy,
  moveArmyToSelectedProvince,
  attackProvince,
  endTurn,
  generateWorldBehavior,
  researchTech,
  getTechCost,
  getTechEffects
} from './state.js';
import { CanvasMapRenderer } from './mapRenderer.js';
import { importAzgaarFile, loadDemoMap, generateProceduralWorld } from './importer.js';

const LEFT_MENU_ORDER_KEY = 'azgaarHoiLeftMenuOrder';

const els = {
  canvas: document.getElementById('map'),
  importModal: document.getElementById('importModal'),
  openImportBtn: document.getElementById('openImportBtn'),
  closeImportBtn: document.getElementById('closeImportBtn'),
  azgaarFile: document.getElementById('azgaarFile'),
  selectJsonBtn: document.getElementById('selectJsonBtn'),
  manualImportBtn: document.getElementById('manualImportBtn'),
  loadDemoBtn: document.getElementById('loadDemoBtn'),
  generateWorldBtn: document.getElementById('generateWorldBtn'),
  dropZone: document.getElementById('dropZone'),
  importStatus: document.getElementById('importStatus'),
  nationSelect: document.getElementById('nationSelect'),
  chooseNationBtn: document.getElementById('chooseNationBtn'),
  nationPicker: document.getElementById('nationPicker'),
  provinceInfo: document.getElementById('provinceInfo'),
  nationStats: document.getElementById('nationStats'),
  nationList: document.getElementById('nationList'),
  diplomacyNationList: document.getElementById('diplomacyNationList'),
  diplomacyOverview: document.getElementById('diplomacyOverview'),
  techTree: document.getElementById('techTree'),
  techSummary: document.getElementById('techSummary'),
  log: document.getElementById('log'),
  turnDisplay: document.getElementById('turnDisplay'),
  treasury: document.getElementById('sideGoldStat'),
  manpower: document.getElementById('sideManpowerStat'),
  industry: document.getElementById('sideIndustryStat'),
  army: document.getElementById('sideArmyStat'),
  buildIndustryBtn: document.getElementById('buildIndustryBtn'),
  recruitArmyBtn: document.getElementById('recruitArmyBtn'),
  moveArmyBtn: document.getElementById('moveArmyBtn'),
  attackBtn: document.getElementById('attackBtn'),
  endTurnBtn: document.getElementById('endTurnBtn'),
  diplomacyModal: document.getElementById('diplomacyModal'),
  diplomacyNationName: document.getElementById('diplomacyNationName'),
  diplomacyNationDetails: document.getElementById('diplomacyNationDetails'),
  declareWarBtn: document.getElementById('declareWarBtn'),
  offerAllianceBtn: document.getElementById('offerAllianceBtn'),
  makeNeutralBtn: document.getElementById('makeNeutralBtn'),
  closeDiplomacyBtn: document.getElementById('closeDiplomacyBtn'),
  eventFlash: document.getElementById('eventFlash'),
  worldSeedBox: document.getElementById('worldSeedBox'),
  worldTraitsBox: document.getElementById('worldTraitsBox'),
  rerollSeedBtn: document.getElementById('rerollSeedBtn'),
  leftMenuStack: document.getElementById('leftMenuStack'),
  resetLeftMenuBtn: document.getElementById('resetLeftMenuBtn')
};

let selectedDiplomacyNation = null;
let flashTimer = null;

const renderer = new CanvasMapRenderer({
  canvas: els.canvas,
  onProvinceSelected: (province) => {
    selectProvince(province.id);
    renderUI();
  }
});

boot();

function boot() {
  wireSortableLeftMenu();
  wireImportControls();
  wireNationControls();
  wireActionControls();
  wireDiplomacyControls();
  wireWorldControls();
  loadWorld(loadDemoMap(), 'Demo map loaded.');
  addLog('Game initialized. Load an Azgaar JSON, test the demo map, or generate a world.');
  renderUI();
}

function wireSortableLeftMenu() {
  if (!els.leftMenuStack) return;
  applySavedLeftMenuOrder();
  let dragged = null;
  let placeholder = null;

  els.leftMenuStack.querySelectorAll('.sortable-card').forEach(card => {
    card.draggable = true;
    card.addEventListener('dragstart', event => {
      dragged = card;
      placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      card.classList.add('dragging-card');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.menuId || '');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging-card');
      placeholder?.remove();
      placeholder = null;
      dragged = null;
      saveLeftMenuOrder();
    });
  });

  els.leftMenuStack.addEventListener('dragover', event => {
    event.preventDefault();
    if (!dragged || !placeholder) return;
    const afterElement = getDragAfterElement(els.leftMenuStack, event.clientY);
    if (!placeholder.parentElement) dragged.after(placeholder);
    if (afterElement == null) els.leftMenuStack.appendChild(placeholder);
    else els.leftMenuStack.insertBefore(placeholder, afterElement);
  });

  els.leftMenuStack.addEventListener('drop', event => {
    event.preventDefault();
    if (!dragged || !placeholder?.parentElement) return;
    els.leftMenuStack.insertBefore(dragged, placeholder);
  });

  els.resetLeftMenuBtn?.addEventListener('click', () => {
    localStorage.removeItem(LEFT_MENU_ORDER_KEY);
    const cards = [...els.leftMenuStack.querySelectorAll('.sortable-card')].sort((a, b) => ['world', 'resources', 'nation', 'actions'].indexOf(a.dataset.menuId) - ['world', 'resources', 'nation', 'actions'].indexOf(b.dataset.menuId));
    cards.forEach(card => els.leftMenuStack.appendChild(card));
  });
}

function applySavedLeftMenuOrder() {
  const saved = JSON.parse(localStorage.getItem(LEFT_MENU_ORDER_KEY) || '[]');
  if (!Array.isArray(saved) || !saved.length) return;
  const cards = new Map([...els.leftMenuStack.querySelectorAll('.sortable-card')].map(card => [card.dataset.menuId, card]));
  saved.forEach(id => { if (cards.has(id)) els.leftMenuStack.appendChild(cards.get(id)); });
  [...cards.entries()].filter(([id]) => !saved.includes(id)).forEach(([, card]) => els.leftMenuStack.appendChild(card));
}

function saveLeftMenuOrder() {
  if (!els.leftMenuStack) return;
  const order = [...els.leftMenuStack.querySelectorAll('.sortable-card')].map(card => card.dataset.menuId).filter(Boolean);
  localStorage.setItem(LEFT_MENU_ORDER_KEY, JSON.stringify(order));
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.sortable-card:not(.dragging-card)')];
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function wireImportControls() {
  els.openImportBtn?.addEventListener('click', () => showImportModal());
  els.closeImportBtn?.addEventListener('click', () => hideImportModal());
  els.selectJsonBtn?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); els.azgaarFile?.click(); });
  els.manualImportBtn?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); importSelectedFile(); });
  els.azgaarFile?.addEventListener('change', event => { event.preventDefault(); event.stopPropagation(); const file = event.target?.files?.[0]; if (file) setImportStatus(`Selected ${file.name}. Importing...`); importSelectedFile(); });
  els.loadDemoBtn?.addEventListener('click', event => { event.preventDefault(); loadWorld(loadDemoMap(), 'Demo map loaded.'); hideImportModal(); });
  els.generateWorldBtn?.addEventListener('click', event => { event.preventDefault(); loadWorld(generateProceduralWorld(), 'Procedural world generated.'); hideImportModal(); flashEvent('World Generated', 'A fresh campaign map has been forged.', 'good'); });
  setupDropZone();
}

function wireNationControls() {
  els.chooseNationBtn?.addEventListener('click', () => {
    const nationId = els.nationSelect.value;
    if (!nationId) return;
    choosePlayerNation(nationId);
    els.nationPicker?.classList.add('hidden');
    addLog(`You now command ${state.nations[nationId].name}.`);
    renderer.selectProvince(state.selectedProvinceId);
    renderUI();
  });
}

function wireWorldControls() {
  els.rerollSeedBtn?.addEventListener('click', () => {
    generateWorldBehavior();
    addLog(`World behavior rerolled: ${state.worldSeed}.`);
    renderWorldSeed();
    renderLog();
  });
}

function wireActionControls() {
  els.buildIndustryBtn?.addEventListener('click', () => handleActionResult(buildIndustry()));
  els.recruitArmyBtn?.addEventListener('click', () => handleActionResult(recruitArmy()));
  els.moveArmyBtn?.addEventListener('click', () => handleActionResult(moveArmyToSelectedProvince()));
  els.attackBtn?.addEventListener('click', () => {
    const result = attackProvince();
    if (result?.front) renderer.startFrontPulse(result.front);
    handleActionResult(result);
  });
  els.endTurnBtn?.addEventListener('click', () => {
    const result = endTurn();
    animateFrontResults(result?.frontResults || []);
    handleActionResult(result);
    flashEvent('New Turn', `Turn ${state.turn} begins. Frontlines resolved, income collected, and armies paid.`, 'neutral');
  });
}

function wireDiplomacyControls() {
  els.closeDiplomacyBtn?.addEventListener('click', closeDiplomacyModal);
  els.declareWarBtn?.addEventListener('click', () => {
    if (!selectedDiplomacyNation || !state.playerNation) return;
    const fronts = declareWarWithAllies(state.playerNation, selectedDiplomacyNation);
    addLog(`${state.nations[state.playerNation].name} declares war on ${state.nations[selectedDiplomacyNation].name}. ${fronts.length} border front${fronts.length === 1 ? '' : 's'} ignite.`);
    flashEvent('War Declared', `${state.nations[selectedDiplomacyNation].name} is now your enemy. Frontlines will resolve on End Turn.`, 'war');
    openDiplomacyModal(selectedDiplomacyNation);
    renderUI();
  });
  els.offerAllianceBtn?.addEventListener('click', () => {
    if (!selectedDiplomacyNation || !state.playerNation) return;
    setRelation(state.playerNation, selectedDiplomacyNation, 'ally');
    addLog(`${state.nations[state.playerNation].name} forms an alliance with ${state.nations[selectedDiplomacyNation].name}.`);
    openDiplomacyModal(selectedDiplomacyNation);
    renderUI();
  });
  els.makeNeutralBtn?.addEventListener('click', () => {
    if (!selectedDiplomacyNation || !state.playerNation) return;
    setRelation(state.playerNation, selectedDiplomacyNation, 'neutral');
    addLog(`${state.nations[state.playerNation].name} returns to neutrality with ${state.nations[selectedDiplomacyNation].name}.`);
    openDiplomacyModal(selectedDiplomacyNation);
    renderUI();
  });
}

async function importSelectedFile() {
  const file = els.azgaarFile?.files?.[0];
  if (!file) return setImportStatus('No JSON file selected. Use Select JSON File or drag a file into the drop zone.');
  await importFile(file);
}

async function importFile(file) {
  try {
    console.groupCollapsed('[Azgaar Import] start');
    console.log('File:', file);
    if (!file) throw new Error('No file was provided to the importer.');
    if (!file.name.toLowerCase().endsWith('.json')) throw new Error(`Expected a .json file, got ${file.name}.`);
    setImportStatus(`Reading ${file.name}...`);
    const world = await importAzgaarFile(file);
    console.log('Converted nations:', Object.keys(world.nations).length);
    console.log('Converted provinces:', world.provinces.length);
    console.groupEnd();
    if (!world?.provinces?.length || !Object.keys(world.nations || {}).length) throw new Error('Importer returned an empty world.');
    loadWorld(world, `Imported ${world.provinces.length} provinces from ${file.name}.`);
    setImportStatus(`Imported ${file.name}.`);
    hideImportModal();
  } catch (error) {
    console.error('[Azgaar Import] failed:', error);
    console.groupEnd?.();
    setImportStatus(`Import failed: ${error.message}`);
    addLog(`Import failed: ${error.message}`);
    renderLog();
  } finally {
    if (els.azgaarFile) els.azgaarFile.value = '';
  }
}

function loadWorld(world, message) {
  setWorld(world);
  renderer.setWorld({ nations: state.nations, provinces: state.provinces, fronts: state.activeFronts });
  renderer.selectProvince(state.selectedProvinceId);
  refreshNationSelect();
  els.nationPicker?.classList.remove('hidden');
  selectedDiplomacyNation = null;
  addLog(message);
  renderUI();
}

function setupDropZone() {
  if (!els.dropZone) return;
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, event => { event.preventDefault(); event.stopPropagation(); });
    els.dropZone.addEventListener(eventName, event => { event.preventDefault(); event.stopPropagation(); });
  });
  els.dropZone.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); els.azgaarFile?.click(); });
  els.dropZone.addEventListener('dragover', () => els.dropZone.classList.add('dragging'));
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragging'));
  els.dropZone.addEventListener('drop', async event => { els.dropZone.classList.remove('dragging'); const file = event.dataTransfer?.files?.[0]; if (!file) return setImportStatus('Drop failed: no file detected.'); await importFile(file); });
}

function refreshNationSelect() {
  if (!els.nationSelect) return;
  const previous = state.playerNation || els.nationSelect.value;
  els.nationSelect.innerHTML = '';
  Object.entries(state.nations)
    .sort(([, a], [, b]) => String(a?.name || '').localeCompare(String(b?.name || '')))
    .forEach(([id, nation]) => {
      const owned = state.provinces.filter(p => p.owner === id).length;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${String(nation.name || id)} (${owned} provinces)`;
      option.title = String(nation.name || id);
      els.nationSelect.appendChild(option);
    });
  if (previous && state.nations[previous]) els.nationSelect.value = previous;
}

function handleActionResult(result) {
  if (typeof result === 'string') addLog(result);
  refreshNationSelect();
  renderUI();
}

function animateFrontResults(results) {
  for (const result of results) {
    if (result.type !== 'conquered') continue;
    const oldColor = state.nations[result.oldOwner]?.color || '#6b7280';
    const newColor = state.nations[result.newOwner]?.color || '#facc15';
    renderer.startConquestAnimation(result.provinceId, oldColor, newColor);
  }
}

function renderUI() {
  renderTurn();
  renderWorldSeed();
  renderResources();
  renderProvinceInfo();
  renderNationStats();
  renderNationList();
  renderDiplomacyOverview();
  renderTechTree();
  renderLog();
  renderer.updateWorld({ nations: state.nations, provinces: state.provinces, selectedProvinceId: state.selectedProvinceId, fronts: state.activeFronts });
}

function renderTurn() { if (els.turnDisplay) els.turnDisplay.textContent = `Turn ${state.turn}`; }

function renderWorldSeed() {
  if (els.worldSeedBox) els.worldSeedBox.textContent = state.worldSeed || 'Unseeded';
  if (els.worldTraitsBox) {
    const t = state.worldTraits;
    els.worldTraitsBox.innerHTML = t ? `Aggression ${(t.aggression * 100).toFixed(0)}% • Development ${(t.development * 100).toFixed(0)}%<br>Volatility ${(t.volatility * 100).toFixed(0)}% • Diplomacy ${(t.diplomacy * 100).toFixed(0)}%` : 'No world behavior generated yet.';
  }
}

function renderResources() {
  if (!state.playerNation || !state.nations[state.playerNation]) {
    setText(els.treasury, '0'); setText(els.manpower, '0'); setText(els.industry, '0'); setText(els.army, '0'); return;
  }
  const nation = state.nations[state.playerNation];
  const owned = state.provinces.filter(p => p.owner === state.playerNation);
  setText(els.treasury, nation.treasury ?? 0);
  setText(els.manpower, nation.manpower ?? 0);
  setText(els.industry, owned.reduce((sum, p) => sum + p.industry, 0));
  setText(els.army, owned.reduce((sum, p) => sum + p.army, 0));
}

function renderProvinceInfo() {
  const province = getSelectedProvince();
  if (!els.provinceInfo) return;
  if (!province) return els.provinceInfo.innerHTML = '<p class="muted">Select a province.</p>';
  const owner = state.nations[province.owner];
  const active = state.activeFronts.filter(f => f.fromProvinceId === province.id || f.toProvinceId === province.id);
  const terrainName = String(province.terrain || 'plains').replace(/\b\w/g, c => c.toUpperCase());
  const defense = Number(province.defenseBonus || 0);
  els.provinceInfo.innerHTML = `<div class="stat"><span>Name</span><strong>${province.name}</strong></div><div class="stat"><span>Owner</span><strong>${owner?.name ?? 'Unknown'}</strong></div><div class="stat"><span>Terrain</span><strong>${terrainName}${defense ? ` +${defense} defense` : ''}</strong></div><div class="stat"><span>Mountain Score</span><strong>${province.mountainScore ?? 0}</strong></div><div class="stat"><span>Industry</span><strong>${province.industry}</strong></div><div class="stat"><span>Army</span><strong>${province.army}</strong></div><div class="stat"><span>Status</span><strong>${province.disputed ? `Disputed ${(province.disputeBorder * 100).toFixed(0)}%` : active.length ? `${active.length} active front${active.length === 1 ? '' : 's'}` : 'Stable'}</strong></div><div class="stat"><span>Neighbors</span><strong>${province.neighbors?.length ?? 0}</strong></div>`;
}

function renderNationStats() {
  if (!els.nationStats) return;
  if (!state.playerNation) return els.nationStats.innerHTML = '<p class="muted">No nation chosen.</p>';
  const nation = state.nations[state.playerNation];
  const owned = state.provinces.filter(p => p.owner === state.playerNation);
  const industry = owned.reduce((sum, p) => sum + p.industry, 0);
  const army = owned.reduce((sum, p) => sum + p.army, 0);
  const allies = getRelationsFor(state.playerNation, 'ally').map(id => state.nations[id]?.name).filter(Boolean);
  const enemies = getRelationsFor(state.playerNation, 'enemy').map(id => state.nations[id]?.name).filter(Boolean);
  const effects = getTechEffects(state.playerNation);
  els.nationStats.innerHTML = `<div class="stat"><span>Nation</span><strong>${nation.name}</strong></div><div class="stat"><span>Provinces</span><strong>${owned.length}</strong></div><div class="stat"><span>Industry</span><strong>${industry}</strong></div><div class="stat"><span>Army</span><strong>${army}</strong></div><div class="stat"><span>Treasury</span><strong>${nation.treasury ?? 0}</strong></div><div class="stat"><span>Manpower</span><strong>${nation.manpower ?? 0}</strong></div><div class="stat"><span>Income / Turn</span><strong>${calculateIncome(state.playerNation)}</strong></div><div class="stat"><span>Move Capacity</span><strong>${effects.moveCapacity}</strong></div><div class="stat"><span>Active Fronts</span><strong>${state.activeFronts.filter(f => f.attackerOwner === state.playerNation || f.defenderOwner === state.playerNation).length}</strong></div><div class="stat"><span>Allies</span><strong>${allies.length ? allies.join(', ') : 'None'}</strong></div><div class="stat"><span>Enemies</span><strong>${enemies.length ? enemies.join(', ') : 'None'}</strong></div>`;
}

function renderNationList() {
  if (!els.nationList) return;
  const html = Object.entries(state.nations)
    .sort(([, a], [, b]) => String(a?.name || '').localeCompare(String(b?.name || '')))
    .map(([id, nation]) => nationDetailsMarkup(id, nation)).join('');
  els.nationList.innerHTML = html || '<p class="muted">No nations available.</p>';
  els.nationList.querySelectorAll('[data-diplomacy-id]').forEach(btn => btn.addEventListener('click', () => openDiplomacyModal(btn.dataset.diplomacyId)));
  if (els.diplomacyNationList) {
    els.diplomacyNationList.innerHTML = html || '<p class="muted">No nations available.</p>';
    els.diplomacyNationList.querySelectorAll('[data-diplomacy-id]').forEach(btn => btn.addEventListener('click', () => openDiplomacyModal(btn.dataset.diplomacyId)));
  }
}

function nationDetailsMarkup(id, nation) {
  const owned = state.provinces.filter(p => p.owner === id);
  const industry = owned.reduce((sum, p) => sum + p.industry, 0);
  const army = owned.reduce((sum, p) => sum + p.army, 0);
  const relation = !state.playerNation ? 'neutral' : id === state.playerNation ? 'player' : getRelation(state.playerNation, id);
  const marker = relation === 'player' ? '👑' : relation === 'ally' ? '🤝' : relation === 'enemy' ? '⚔️' : '•';
  const activeFronts = state.activeFronts.filter(f => f.attackerOwner === id || f.defenderOwner === id).length;
  return `<details class="nation-drop"><summary><span class="nation-dot" style="background:${nation.color || '#6b7280'}"></span><span class="nation-name">${String(nation.name || id)}</span><span>${marker}</span></summary><div class="nation-drop-body"><div class="stat"><span>Provinces</span><strong>${owned.length}</strong></div><div class="stat"><span>Industry</span><strong>${industry}</strong></div><div class="stat"><span>Army</span><strong>${army}</strong></div><div class="stat"><span>Active Fronts</span><strong>${activeFronts}</strong></div><div class="stat"><span>Relation</span><strong>${relation}</strong></div><button type="button" data-diplomacy-id="${id}">Diplomacy</button></div></details>`;
}

function renderDiplomacyOverview() {
  if (!els.diplomacyOverview) return;
  if (!state.playerNation) return els.diplomacyOverview.innerHTML = 'Choose your nation to view diplomatic relations.';
  const allies = getRelationsFor(state.playerNation, 'ally').map(id => state.nations[id]?.name).filter(Boolean);
  const enemies = getRelationsFor(state.playerNation, 'enemy').map(id => state.nations[id]?.name).filter(Boolean);
  els.diplomacyOverview.innerHTML = `<div class="stat"><span>Allies</span><strong>${allies.length ? allies.join(', ') : 'None'}</strong></div><div class="stat"><span>Enemies</span><strong>${enemies.length ? enemies.join(', ') : 'None'}</strong></div><div class="stat"><span>Frontlines</span><strong>${state.activeFronts.length}</strong></div>`;
}

function renderTechTree() {
  if (!els.techTree) return;
  if (!state.playerNation || !state.nations[state.playerNation]) {
    if (els.techSummary) els.techSummary.textContent = 'Choose your nation to research upgrades.';
    els.techTree.innerHTML = '';
    return;
  }
  const nation = state.nations[state.playerNation];
  const effects = getTechEffects(state.playerNation);
  if (els.techSummary) els.techSummary.innerHTML = `Movement ${effects.moveCapacity} • Attack +${effects.attackBonus} • Defense +${effects.defenseBonus} • Income x${effects.incomeMultiplier.toFixed(2)}`;
  els.techTree.innerHTML = TECH_TREE.map(tech => {
    const level = nation.techs?.[tech.id] || 0;
    const cost = getTechCost(tech.id, state.playerNation);
    const maxed = level >= tech.maxLevel;
    return `<div class="tech-node"><div><strong>${tech.name}</strong><span>Level ${level}/${tech.maxLevel}</span><p>${tech.description}</p></div><button type="button" data-tech-id="${tech.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'Maxed' : `Research ${cost}`}</button></div>`;
  }).join('');
  els.techTree.querySelectorAll('[data-tech-id]').forEach(btn => btn.addEventListener('click', () => handleActionResult(researchTech(btn.dataset.techId))));
}

function openDiplomacyModal(nationId) {
  selectedDiplomacyNation = nationId;
  const nation = state.nations[nationId];
  if (!nation || !els.diplomacyModal) return;
  const owned = state.provinces.filter(p => p.owner === nationId);
  const industry = owned.reduce((sum, p) => sum + p.industry, 0);
  const army = owned.reduce((sum, p) => sum + p.army, 0);
  const relation = !state.playerNation ? 'neutral' : nationId === state.playerNation ? 'your nation' : getRelation(state.playerNation, nationId);
  const techLevels = TECH_TREE.map(t => `${t.name}: ${nation.techs?.[t.id] || 0}`).join('<br>');
  els.diplomacyNationName.textContent = String(nation.name || nationId);
  els.diplomacyNationDetails.innerHTML = `<div class="stat"><span>Relation</span><strong>${relation}</strong></div><div class="stat"><span>Provinces</span><strong>${owned.length}</strong></div><div class="stat"><span>Industry</span><strong>${industry}</strong></div><div class="stat"><span>Army</span><strong>${army}</strong></div><div class="stat"><span>Treasury</span><strong>${nation.treasury ?? 0}</strong></div><div class="stat"><span>Tech</span><strong>${techLevels}</strong></div>`;
  const disabled = !state.playerNation || nationId === state.playerNation;
  els.declareWarBtn.disabled = disabled; els.offerAllianceBtn.disabled = disabled; els.makeNeutralBtn.disabled = disabled;
  els.diplomacyModal.classList.remove('hidden');
}

function closeDiplomacyModal() { selectedDiplomacyNation = null; els.diplomacyModal?.classList.add('hidden'); }
function renderLog() { if (els.log) els.log.innerHTML = state.log.map(item => `<div>• ${item}</div>`).join(''); }
function showImportModal() { els.importModal?.classList.remove('hidden'); }
function hideImportModal() { els.importModal?.classList.add('hidden'); }
function setImportStatus(message) { if (els.importStatus) els.importStatus.textContent = message; }
function setText(el, value) { if (el) el.textContent = String(value); }
function flashEvent(title, body, type = 'neutral') { if (!els.eventFlash) return; clearTimeout(flashTimer); els.eventFlash.className = `event-flash ${type}`; els.eventFlash.innerHTML = `<strong>${title}</strong><span>${body}</span>`; requestAnimationFrame(() => els.eventFlash.classList.add('show')); flashTimer = setTimeout(() => els.eventFlash.classList.remove('show'), 6000); }
