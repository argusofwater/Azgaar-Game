const colorPool = [
  '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2',
  '#be123c', '#4d7c0f', '#9333ea', '#0f766e', '#b45309', '#4338ca'
];

export function loadDemoMap() {
  return {
    nations: {
      aegis: { name: 'Aegis Compact', color: '#2563eb', treasury: 350, manpower: 80, industry: 4, command: 3 },
      thorn: { name: 'Thorn Marches', color: '#16a34a', treasury: 350, manpower: 100, industry: 3, command: 2 },
      ember: { name: 'Ember Crown', color: '#dc2626', treasury: 350, manpower: 70, industry: 5, command: 4 },
      dusk: { name: 'Dusk League', color: '#7c3aed', treasury: 350, manpower: 60, industry: 6, command: 3 }
    },
    provinces: [
      { id: 'p1', name: 'Northwatch', owner: 'aegis', x: 60, y: 70, w: 210, h: 150, industry: 2, army: 6, neighbors: ['p2', 'p4'], polygons: [] },
      { id: 'p2', name: 'Ironford', owner: 'aegis', x: 270, y: 70, w: 170, h: 150, industry: 2, army: 5, neighbors: ['p1', 'p3', 'p5'], polygons: [] },
      { id: 'p3', name: 'Ashenfield', owner: 'ember', x: 440, y: 70, w: 210, h: 150, industry: 3, army: 7, neighbors: ['p2', 'p6'], polygons: [] },
      { id: 'p4', name: 'Greenmere', owner: 'thorn', x: 60, y: 220, w: 210, h: 160, industry: 1, army: 8, neighbors: ['p1', 'p5', 'p7'], polygons: [] },
      { id: 'p5', name: 'Kingsroad', owner: 'thorn', x: 270, y: 220, w: 170, h: 160, industry: 2, army: 6, neighbors: ['p2', 'p4', 'p6', 'p8'], polygons: [] },
      { id: 'p6', name: 'Cindervale', owner: 'ember', x: 440, y: 220, w: 210, h: 160, industry: 2, army: 9, neighbors: ['p3', 'p5', 'p9'], polygons: [] },
      { id: 'p7', name: 'Moonfen', owner: 'dusk', x: 60, y: 380, w: 210, h: 150, industry: 2, army: 4, neighbors: ['p4', 'p8'], polygons: [] },
      { id: 'p8', name: 'Violet Gate', owner: 'dusk', x: 270, y: 380, w: 170, h: 150, industry: 3, army: 5, neighbors: ['p5', 'p7', 'p9'], polygons: [] },
      { id: 'p9', name: 'Starfall', owner: 'ember', x: 440, y: 380, w: 210, h: 150, industry: 1, army: 6, neighbors: ['p6', 'p8'], polygons: [] }
    ]
  };
}

export async function importAzgaarFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  return convertAzgaarToGame(data);
}

export function convertAzgaarToGame(data) {
  const pack = data.pack || data;
  const statesRaw = Array.isArray(pack.states) ? pack.states.filter(s => s && typeof s === 'object' && !s.removed && s.i !== 0) : [];
  const provincesRaw = Array.isArray(pack.provinces) ? pack.provinces.filter(p => p && typeof p === 'object' && !p.removed && p.i !== 0) : [];
  const burgsRaw = Array.isArray(pack.burgs) ? pack.burgs.filter(b => b && typeof b === 'object' && !b.removed && b.i !== 0) : [];
  const cellsRaw = Array.isArray(pack.cells) ? pack.cells.filter(c => c && typeof c === 'object') : [];
  const verticesRaw = Array.isArray(pack.vertices) ? pack.vertices.filter(v => v && typeof v === 'object') : [];

  if (!statesRaw.length) throw new Error('Missing Azgaar states array.');
  if (!provincesRaw.length) throw new Error('Missing Azgaar provinces array.');
  if (!cellsRaw.length) throw new Error('Missing Azgaar cells array.');

  const mapWidth = data.info?.width || 1875;
  const mapHeight = data.info?.height || 973;
  const stateById = new Map(statesRaw.map(s => [s.i, s]));
  const cellById = new Map(cellsRaw.map(c => [c.i, c]));
  const vertexById = new Map(verticesRaw.map(v => [v.i, v]));
  const burgById = new Map(burgsRaw.map(b => [b.i, b]));

  const usedStateIds = [...new Set(provincesRaw.map(p => p.state).filter(id => id && stateById.has(id)))];
  const nations = buildNations(usedStateIds, stateById);
  const cellsByProvince = groupCellsByProvince(cellsRaw);
  const provinces = buildProvinces(provincesRaw, cellsByProvince, cellById, vertexById, burgById, nations, mapWidth, mapHeight);
  assignProvinceNeighbors(provinces, cellsRaw, cellById);

  if (provinces.length < 2) throw new Error('Not enough playable provinces were created from this Azgaar file.');
  return { nations, provinces };
}

function buildNations(stateIds, stateById) {
  const nations = {};
  stateIds.forEach((stateId, index) => {
    const state = stateById.get(stateId);
    const militaryTotal = Array.isArray(state.military)
      ? state.military.reduce((sum, regiment) => sum + (Number(regiment.a) || 0), 0)
      : 0;

    nations[`s${stateId}`] = {
      name: state.fullName || state.name || `State ${stateId}`,
      color: state.color || colorPool[index % colorPool.length],
      treasury: Math.max(200, Math.round((state.urban || 0) * 3 + (state.rural || 0) / 10)),
      manpower: Math.max(20, Math.round((state.rural || 0) / 20 + (state.urban || 0) / 2)),
      industry: Math.max(1, Math.round((state.urban || 0) / 30) || 1),
      command: Math.max(2, Math.min(10, Math.round((militaryTotal || 1000) / 5000) + 2)),
      diplomacy: state.diplomacy || []
    };
  });
  return nations;
}

function groupCellsByProvince(cellsRaw) {
  const cellsByProvince = new Map();
  cellsRaw.forEach(cell => {
    if (!cell.province) return;
    if (!cellsByProvince.has(cell.province)) cellsByProvince.set(cell.province, []);
    cellsByProvince.get(cell.province).push(cell);
  });
  return cellsByProvince;
}

function buildProvinces(provincesRaw, cellsByProvince, cellById, vertexById, burgById, nations, mapWidth, mapHeight) {
  const provinces = provincesRaw
    .filter(province => province.state && nations[`s${province.state}`])
    .map(province => {
      const provinceCells = cellsByProvince.get(province.i) || [];
      const centerCell = cellById.get(province.center) || provinceCells[0];
      const burg = burgById.get(province.burg);
      const point = burg ? [burg.x, burg.y] : centerCell?.p || province.pole || [randomInt(80, 820), randomInt(80, 520)];
      const urban = burg?.population || 0;
      const pop = provinceCells.reduce((sum, cell) => sum + (Number(cell.pop) || 0), 0);
      const area = provinceCells.reduce((sum, cell) => sum + (Number(cell.area) || 0), 0);
      const fortBonus = burg?.citadel ? 1 : 0;
      const polygons = provinceCells
        .map(cell => (Array.isArray(cell.v) ? cell.v : [])
          .map(vertexId => vertexById.get(vertexId)?.p)
          .filter(point => Array.isArray(point) && point.length >= 2)
        )
        .filter(poly => poly.length >= 3);

      return {
        id: `p${province.i}`,
        sourceProvinceId: province.i,
        name: province.fullName || province.name || `Province ${province.i}`,
        owner: `s${province.state}`,
        color: province.color,
        x: point[0],
        y: point[1],
        labelX: point[0],
        labelY: point[1],
        w: Math.max(42, Math.min(95, 44 + Math.sqrt(Math.max(area, 1)) / 3)),
        h: Math.max(34, Math.min(80, 34 + Math.sqrt(Math.max(area, 1)) / 4)),
        polygons,
        industry: Math.max(1, Math.min(8, Math.round(urban / 8) + fortBonus + 1)),
        army: Math.max(2, Math.min(16, Math.round(pop / 8) + fortBonus + 2)),
        neighbors: []
      };
    });

  return normalizeProvinceLayout(provinces, mapWidth, mapHeight);
}

function assignProvinceNeighbors(provinces, cellsRaw, cellById) {
  const provinceIdMap = new Map(provinces.map(p => [p.sourceProvinceId, p.id]));
  const provinceBySourceId = new Map(provinces.map(p => [p.sourceProvinceId, p]));

  cellsRaw.forEach(cell => {
    if (!cell.province || !provinceIdMap.has(cell.province) || !Array.isArray(cell.c)) return;
    const from = provinceBySourceId.get(cell.province);
    cell.c.forEach(neighborCellId => {
      const neighborCell = cellById.get(neighborCellId);
      if (!neighborCell?.province || neighborCell.province === cell.province) return;
      const toId = provinceIdMap.get(neighborCell.province);
      if (from && toId && !from.neighbors.includes(toId)) from.neighbors.push(toId);
    });
  });

  provinces.forEach(p => delete p.sourceProvinceId);
}

function normalizeProvinceLayout(list, sourceWidth = 1875, sourceHeight = 973) {
  const scaleX = 820 / sourceWidth;
  const scaleY = 520 / sourceHeight;
  return list.map(p => ({
    ...p,
    x: 40 + p.x * scaleX,
    y: 40 + p.y * scaleY,
    labelX: 40 + (p.labelX ?? p.x) * scaleX,
    labelY: 40 + (p.labelY ?? p.y) * scaleY,
    w: Math.max(34, Math.min(85, p.w)),
    h: Math.max(28, Math.min(72, p.h)),
    polygons: Array.isArray(p.polygons)
      ? p.polygons.map(poly => poly.map(point => [40 + point[0] * scaleX, 40 + point[1] * scaleY]))
      : [],
    neighbors: p.neighbors || []
  }));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
