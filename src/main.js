import {
  state,
  setWorld,
  choosePlayerNation,
  selectProvince,
  getSelectedProvince,
  getRelationsFor,
  calculateIncome,
  addLog
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
  army: document.getElementById('sideArmyStat')
};

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
  loadWorld(loadDemoMap(), 'Demo map loaded.');
  addLog('Game initialized. Load an Azgaar JSON or test the demo map.');
  renderUI();
}

function wireImportControls() {
  els.openImportBtn?.addEventListener('click', () => showImportModal());
  els.closeImportBtn?.addEventListener('click', () => hideImportModal());
  els.selectJsonBtn?.addEventListener('click', () => els.azgaarFile?.click());
  els.manualImportBtn?.addEventListener('click', () => importSelectedFile());
  els.azgaarFile?.addEventListener('change', () => importSelectedFile());
  els.loadDemoBtn?.addEventListener('click', () => loadWorld(loadDemoMap(), 'Demo map loaded.'));

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

async function importSelectedFile() {
  const file = els.azgaarFile?.files?.[0];
  if (!file) {
    setImportStatus('No JSON file selected.');
    return;
  }
  await importFile(file);
}

async function importFile(file) {
  try {
    setImportStatus(`Reading ${file.name}...`);
    const world = await importAzgaarFile(file);
    loadWorld(world, `Imported ${world.provinces.length} provinces from ${file.name}.`);
    setImportStatus(`Imported ${file.name}.`);
    hideImportModal();
  } catch (error) {
    console.error(error);
    setImportStatus(`Import failed: ${error.message}`);
    addLog(`Import failed: ${error.message}`);
    renderLog();
  }
}

function loadWorld(world, message) {
  setWorld(world);
  renderer.setWorld({ nations: state.nations, provinces: state.provinces });
  renderer.selectProvince(state.selectedProvinceId);
  refreshNationSelect();
  els.nationPicker?.classList.remove('hidden');
  addLog(message);
  renderUI();
}

function setupDropZone() {
  if (!els.dropZone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
    });
    els.dropZone.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  els.dropZone.addEventListener('dragover', () => els.dropZone.classList.add('dragging'));
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragging'));
  els.dropZone.addEventListener('drop', async event => {
    els.dropZone.classList.remove('dragging');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setImportStatus('That does not look like a .json file.');
      return;
    }
    await importFile(file);
  });
}

function refreshNationSelect() {
  if (!els.nationSelect) return;
  els.nationSelect.innerHTML = '';
  Object.entries(state.nations).forEach(([id, nation]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = nation.name;
    els.nationSelect.appendChild(option);
  });
}

function renderUI() {
  renderTurn();
  renderResources();
  renderProvinceInfo();
  renderNationStats();
  renderNationList();
  renderLog();
}

function renderTurn() {
  if (els.turnDisplay) els.turnDisplay.textContent = `Turn ${state.turn}`;
}

function renderResources() {
  if (!state.playerNation || !state.nations[state.playerNation]) {
    setText(els.treasury, '0');
    setText(els.manpower, '0');
    setText(els.industry, '0');
    setText(els.army, '0');
    return;
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
  if (!province) {
    els.provinceInfo.innerHTML = '<p class="muted">Select a province.</p>';
    return;
  }

  const owner = state.nations[province.owner];
  els.provinceInfo.innerHTML = `
    <div class="stat"><span>Name</span><strong>${province.name}</strong></div>
    <div class="stat"><span>Owner</span><strong>${owner?.name ?? 'Unknown'}</strong></div>
    <div class="stat"><span>Industry</span><strong>${province.industry}</strong></div>
    <div class="stat"><span>Army</span><strong>${province.army}</strong></div>
    <div class="stat"><span>Neighbors</span><strong>${province.neighbors?.length ?? 0}</strong></div>
  `;
}

function renderNationStats() {
  if (!els.nationStats) return;
  if (!state.playerNation) {
    els.nationStats.innerHTML = '<p class="muted">No nation chosen.</p>';
    return;
  }

  const nation = state.nations[state.playerNation];
  const owned = state.provinces.filter(p => p.owner === state.playerNation);
  const industry = owned.reduce((sum, p) => sum + p.industry, 0);
  const army = owned.reduce((sum, p) => sum + p.army, 0);
  const allies = getRelationsFor(state.playerNation, 'ally').map(id => state.nations[id]?.name).filter(Boolean);
  const enemies = getRelationsFor(state.playerNation, 'enemy').map(id => state.nations[id]?.name).filter(Boolean);

  els.nationStats.innerHTML = `
    <div class="stat"><span>Nation</span><strong>${nation.name}</strong></div>
    <div class="stat"><span>Provinces</span><strong>${owned.length}</strong></div>
    <div class="stat"><span>Industry</span><strong>${industry}</strong></div>
    <div class="stat"><span>Army</span><strong>${army}</strong></div>
    <div class="stat"><span>Treasury</span><strong>${nation.treasury ?? 0}</strong></div>
    <div class="stat"><span>Manpower</span><strong>${nation.manpower ?? 0}</strong></div>
    <div class="stat"><span>Income / Turn</span><strong>${calculateIncome(state.playerNation)}</strong></div>
    <div class="stat"><span>Allies</span><strong>${allies.length ? allies.join(', ') : 'None'}</strong></div>
    <div class="stat"><span>Enemies</span><strong>${enemies.length ? enemies.join(', ') : 'None'}</strong></div>
  `;
}

function renderNationList() {
  if (!els.nationList) return;
  els.nationList.innerHTML = Object.entries(state.nations).map(([id, nation]) => {
    const owned = state.provinces.filter(p => p.owner === id);
    const industry = owned.reduce((sum, p) => sum + p.industry, 0);
    const army = owned.reduce((sum, p) => sum + p.army, 0);
    const marker = id === state.playerNation ? '👑' : '•';
    return `<div class="nation-row"><span class="nation-dot" style="background:${nation.color}"></span><span class="nation-name">${nation.name}</span><span>${marker}</span><span>⚙ ${industry}</span><span>⚔ ${army}</span><span>▣ ${owned.length}</span></div>`;
  }).join('');
}

function renderLog() {
  if (!els.log) return;
  els.log.innerHTML = state.log.map(item => `<div>• ${item}</div>`).join('');
}

function showImportModal() {
  els.importModal?.classList.remove('hidden');
}

function hideImportModal() {
  els.importModal?.classList.add('hidden');
}

function setImportStatus(message) {
  if (els.importStatus) els.importStatus.textContent = message;
}

function setText(el, value) {
  if (el) el.textContent = String(value);
}
