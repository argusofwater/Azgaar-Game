import {
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
  attackProvince,
  endTurn,
  generateWorldBehavior
} from './state.js';
import { CanvasMapRenderer } from './mapRenderer.js';
import { importAzgaarFile, loadDemoMap } from './importer.js';

const els = {
  canvas: document.getElementById('map'),
  importModal: document.getElementById('importModal'),
  openImportBtn: document.getElementById('openImportBtn'),
  closeImportBtn: document.getElementById('closeImportBtn'),
  azgaarFile: document.getElementById('azgaarFile'),
  selectJsonBtn: document.getElementById('selectJsonBtn'),
  manualImportBtn: document.getElementById('manualImportBtn'),
  loadDemoBtn: document.getElementById('loadDemoBtn'),
  dropZone: document.getElementById('dropZone'),
  importStatus: document.getElementById('importStatus'),
  nationSelect: document.getElementById('nationSelect'),
  chooseNationBtn: document.getElementById('chooseNationBtn'),
  nationPicker: document.getElementById('nationPicker'),
  provinceInfo: document.getElementById('provinceInfo'),
  nationStats: document.getElementById('nationStats'),
  nationList: document.getElementById('nationList'),
  log: document.getElementById('log'),
  turnDisplay: document.getElementById('turnDisplay'),
  treasury: document.getElementById('sideGoldStat'),
  manpower: document.getElementById('sideManpowerStat'),
  industry: document.getElementById('sideIndustryStat'),
  army: document.getElementById('sideArmyStat'),
  buildIndustryBtn: document.getElementById('buildIndustryBtn'),
  recruitArmyBtn: document.getElementById('recruitArmyBtn'),
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
  rerollSeedBtn: document.getElementById('rerollSeedBtn')
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
  wireImportControls();
  wireNationControls();
  wireActionControls();
  wireDiplomacyControls();
  wireWorldControls();
  loadWorld(loadDemoMap(), 'Demo map loaded.');
  addLog('Game initialized. Load an Azgaar JSON or test the demo map.');
  renderUI();
}

function wireImportControls() {
  els.openImportBtn?.addEventListener('click', () => showImportModal());
  els.closeImportBtn?.addEventListener('click', () => hideImportModal());
  els.selectJsonBtn?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); els.azgaarFile?.click(); });
  els.manualImportBtn?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); importSelectedFile(); });
  els.azgaarFile?.addEventListener('change', event => { event.preventDefault(); event.stopPropagation(); const file = event.target?.files?.[0]; if (file) setImportStatus(`Selected ${file.name}. Importing...`); importSelectedFile(); });
  els.loadDemoBtn?.addEventListener('click', event => { event.preventDefault(); loadWorld(loadDemoMap(), 'Demo map loaded.'); hideImportModal(); });
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
  els.attackBtn?.addEventListener('click', () => {
    const oldOwner = getSelectedProvince()?.owner;
    const result = attackProvince();
    if (result?.conquered) {
      renderer.startConquestAnimation(result.provinceId, state.nations[result.oldOwner]?.color || '#6b7280', state.nations[state.playerNation]?.color || '#facc15');
      flashEvent('Province Captured', `${state.nations[state.playerNation]?.name || 'Your nation'} captured new territory.`, 'war');
    } else if (oldOwner && typeof result !== 'string') {
      renderer.updateWorld({ nations: state.nations, provinces: state.provinces, selectedProvinceId: state.selectedProvinceId });
    }
    handleActionResult(result);
  });
  els.endTurnBtn?.addEventListener('click', () => {
    const result = endTurn();
    handleActionResult(result);
    flashEvent('New Turn', `Turn ${state.turn} begins. Income collected and armies paid.`, 'neutral');
  });
}

function wireDiplomacyControls() {
  els.closeDiplomacyBtn?.addEventListener('click', closeDiplomacyModal);
  els.declareWarBtn?.addEventListener('click', () => {
    if (!selectedDiplomacyNation || !state.playerNation) return;
    declareWarWithAllies(state.playerNation, selectedDiplomacyNation);
    addLog(`${state.nations[state.playerNation].name} declares war on ${state.nations[selectedDiplomacyNation].name}.`);
    flashEvent('War Declared', `${state.nations[selectedDiplomacyNation].name} is now your enemy.`, 'war');
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
  renderer.setWorld({ nations: state.nations, provinces: state.provinces });
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
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .forEach(([id, nation]) => {
      const owned = state.provinces.filter(p => p.owner === id).length;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${nation.name} (${owned} provinces)`;
      option.title = nation.name;
      els.nationSelect.appendChild(option);
    });
  if (previous && state.nations[previous]) els.nationSelect.value = previous;
}

function handleActionResult(result) {
  if (typeof result === 'string') addLog(result);
  renderer.updateWorld({ nations: state.nations, provinces: state.provinces, selectedProvinceId: state.selectedProvinceId });
  refreshNationSelect();
  renderUI();
}

function renderUI() {
  renderTurn();
  renderWorldSeed();
  renderResources();
  renderProvinceInfo();
  renderNationStats();
  renderNationList();
  renderLog();
}

function renderTurn() { if (els.turnDisplay) els.turnDisplay.textContent = `Turn ${state.turn}`; }

function renderWorldSeed() {
  if (els.worldSeedBox) els.worldSeedBox.textContent = state.worldSeed || 'Unseeded';
  if (els.worldTraitsBox) {
    const t = state.worldTraits;
    els.worldTraitsBox.innerHTML = t
      ? `Aggression ${(t.aggression * 100).toFixed(0)}% • Development ${(t.development * 100).toFixed(0)}%<br>Volatility ${(t.volatility * 100).toFixed(0)}% • Diplomacy ${(t.diplomacy * 100).toFixed(0)}%`
      : 'No world behavior generated yet.';
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
  els.provinceInfo.innerHTML = `<div class="stat"><span>Name</span><strong>${province.name}</strong></div><div class="stat"><span>Owner</span><strong>${owner?.name ?? 'Unknown'}</strong></div><div class="stat"><span>Industry</span><strong>${province.industry}</strong></div><div class="stat"><span>Army</span><strong>${province.army}</strong></div><div class="stat"><span>Neighbors</span><strong>${province.neighbors?.length ?? 0}</strong></div>`;
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
  els.nationStats.innerHTML = `<div class="stat"><span>Nation</span><strong>${nation.name}</strong></div><div class="stat"><span>Provinces</span><strong>${owned.length}</strong></div><div class="stat"><span>Industry</span><strong>${industry}</strong></div><div class="stat"><span>Army</span><strong>${army}</strong></div><div class="stat"><span>Treasury</span><strong>${nation.treasury ?? 0}</strong></div><div class="stat"><span>Manpower</span><strong>${nation.manpower ?? 0}</strong></div><div class="stat"><span>Income / Turn</span><strong>${calculateIncome(state.playerNation)}</strong></div><div class="stat"><span>Allies</span><strong>${allies.length ? allies.join(', ') : 'None'}</strong></div><div class="stat"><span>Enemies</span><strong>${enemies.length ? enemies.join(', ') : 'None'}</strong></div>`;
}

function renderNationList() {
  if (!els.nationList) return;
  els.nationList.innerHTML = Object.entries(state.nations).map(([id, nation]) => {
    const owned = state.provinces.filter(p => p.owner === id);
    const industry = owned.reduce((sum, p) => sum + p.industry, 0);
    const army = owned.reduce((sum, p) => sum + p.army, 0);
    const relation = !state.playerNation ? 'neutral' : id === state.playerNation ? 'player' : getRelation(state.playerNation, id);
    const marker = relation === 'player' ? '👑' : relation === 'ally' ? '🤝' : relation === 'enemy' ? '⚔️' : '•';
    return `<button class="nation-row" data-nation-id="${id}" title="${nation.name}"><span class="nation-dot" style="background:${nation.color}"></span><span class="nation-name">${nation.name}</span><span>${marker}</span><span>⚙ ${industry}</span><span>⚔ ${army}</span><span>▣ ${owned.length}</span></button>`;
  }).join('');
  els.nationList.querySelectorAll('[data-nation-id]').forEach(btn => btn.addEventListener('click', () => openDiplomacyModal(btn.dataset.nationId)));
}

function openDiplomacyModal(nationId) {
  selectedDiplomacyNation = nationId;
  const nation = state.nations[nationId];
  if (!nation || !els.diplomacyModal) return;
  const owned = state.provinces.filter(p => p.owner === nationId);
  const industry = owned.reduce((sum, p) => sum + p.industry, 0);
  const army = owned.reduce((sum, p) => sum + p.army, 0);
  const relation = !state.playerNation ? 'neutral' : nationId === state.playerNation ? 'your nation' : getRelation(state.playerNation, nationId);
  els.diplomacyNationName.textContent = nation.name;
  els.diplomacyNationDetails.innerHTML = `<div class="stat"><span>Relation</span><strong>${relation}</strong></div><div class="stat"><span>Provinces</span><strong>${owned.length}</strong></div><div class="stat"><span>Industry</span><strong>${industry}</strong></div><div class="stat"><span>Army</span><strong>${army}</strong></div><div class="stat"><span>Treasury</span><strong>${nation.treasury ?? 0}</strong></div>`;
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
