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
      { id: 'p1', name: 'Northwatch', owner: 'aegis', x: 60, y: 70, w: 210, h: 150, industry: 2, army: 6, terrain: 'hills', mountainScore: 42, defenseBonus: 1, mountainIcons: [{ x: 150, y: 120 }], neighbors: ['p2', 'p4'], polygons: [] },
      { id: 'p2', name: 'Ironford', owner: 'aegis', x: 270, y: 70, w: 170, h: 150, industry: 2, army: 5, terrain: 'plains', mountainScore: 8, defenseBonus: 0, mountainIcons: [], neighbors: ['p1', 'p3', 'p5'], polygons: [] },
      { id: 'p3', name: 'Ashenfield', owner: 'ember', x: 440, y: 70, w: 210, h: 150, industry: 3, army: 7, terrain: 'mountains', mountainScore: 74, defenseBonus: 2, mountainIcons: [{ x: 535, y: 124 }, { x: 580, y: 160 }], neighbors: ['p2', 'p6'], polygons: [] },
      { id: 'p4', name: 'Greenmere', owner: 'thorn', x: 60, y: 220, w: 210, h: 160, industry: 1, army: 8, terrain: 'plains', mountainScore: 10, defenseBonus: 0, mountainIcons: [], neighbors: ['p1', 'p5', 'p7'], polygons: [] },
      { id: 'p5', name: 'Kingsroad', owner: 'thorn', x: 270, y: 220, w: 170, h: 160, industry: 2, army: 6, terrain: 'hills', mountainScore: 35, defenseBonus: 1, mountainIcons: [{ x: 350, y: 295 }], neighbors: ['p2', 'p4', 'p6', 'p8'], polygons: [] },
      { id: 'p6', name: 'Cindervale', owner: 'ember', x: 440, y: 220, w: 210, h: 160, industry: 2, army: 9, terrain: 'plains', mountainScore: 12, defenseBonus: 0, mountainIcons: [], neighbors: ['p3', 'p5', 'p9'], polygons: [] },
      { id: 'p7', name: 'Moonfen', owner: 'dusk', x: 60, y: 380, w: 210, h: 150, industry: 2, army: 4, terrain: 'plains', mountainScore: 3, defenseBonus: 0, mountainIcons: [], neighbors: ['p4', 'p8'], polygons: [] },
      { id: 'p8', name: 'Violet Gate', owner: 'dusk', x: 270, y: 380, w: 170, h: 150, industry: 3, army: 5, terrain: 'hills', mountainScore: 48, defenseBonus: 1, mountainIcons: [{ x: 340, y: 440 }], neighbors: ['p5', 'p7', 'p9'], polygons: [] },
      { id: 'p9', name: 'Starfall', owner: 'ember', x: 440, y: 380, w: 210, h: 150, industry: 1, army: 6, terrain: 'plains', mountainScore: 9, defenseBonus: 0, mountainIcons: [], neighbors: ['p6', 'p8'], polygons: [] }
    ]
  };
}

export function generateProceduralWorld({ columns = 8, rows = 6, nationCount = 6 } = {}) {
  const nameA = ['Iron', 'Violet', 'Dawn', 'Ash', 'Storm', 'Wolf', 'Cinder', 'Star', 'Thorn', 'Frost'];
  const nameB = ['Compact', 'Marches', 'League', 'Crown', 'Union', 'Dominion', 'Accord', 'Banner', 'Reach', 'Hegemony'];
  const provinceA = ['North', 'East', 'West', 'South', 'High', 'Low', 'Grey', 'Red', 'Gold', 'Black'];
  const provinceB = ['watch', 'ford', 'mere', 'gate', 'vale', 'field', 'rest', 'hold', 'fen', 'port'];
  const nations = {};
  for (let i = 0; i < nationCount; i++) {
    const id = `n${i + 1}`;
    nations[id] = { name: `${nameA[i % nameA.length]} ${nameB[(i * 3) % nameB.length]}`, color: colorPool[i % colorPool.length], treasury: 350 + randomInt(0, 180), manpower: 55 + randomInt(0, 60), industry: 2 + randomInt(0, 4), command: 3 + randomInt(0, 3) };
  }
  const provinces = [];
  const cellW = 90;
  const cellH = 78;
  const startX = 60;
  const startY = 55;
  const centers = Object.keys(nations).map((id, i) => ({ id, x: startX + ((i * 3 + 1) % columns) * cellW, y: startY + (Math.floor(i * rows / nationCount) % rows) * cellH }));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const id = `p${y * columns + x + 1}`;
      const px = startX + x * cellW;
      const py = startY + y * cellH;
      const owner = centers.map(center => ({ id: center.id, d: Math.hypot(center.x - px, center.y - py) + randomInt(0, 45) })).sort((a, b) => a.d - b.d)[0].id;
      const jitter = () => randomInt(-8, 8);
      const mountainScore = Math.max(0, Math.min(100, Math.round(20 + Math.sin(x * 0.8) * 18 + Math.cos(y * 1.1) * 16 + randomInt(-20, 28))));
      const defenseBonus = mountainScore >= 65 ? 2 : mountainScore >= 35 ? 1 : 0;
      const mountainIcons = Array.from({ length: defenseBonus }, (_, i) => ({ x: px + 26 + i * 28 + randomInt(-5, 5), y: py + 24 + randomInt(-5, 5) }));
      provinces.push({
        id,
        name: `${provinceA[(x + y) % provinceA.length]}${provinceB[(x * 2 + y) % provinceB.length]}`,
        owner,
        x: px,
        y: py,
        labelX: px + cellW / 2,
        labelY: py + cellH / 2,
        w: cellW - 10,
        h: cellH - 8,
        polygons: [[[px + jitter(), py + jitter()], [px + cellW - 10 + jitter(), py + jitter()], [px + cellW - 6 + jitter(), py + cellH - 8 + jitter()], [px + jitter(), py + cellH - 6 + jitter()]]],
        industry: 1 + randomInt(0, 4),
        army: 2 + randomInt(0, 8),
        terrain: defenseBonus === 2 ? 'mountains' : defenseBonus === 1 ? 'hills' : 'plains',
        mountainScore,
        defenseBonus,
        mountainIcons,
        neighbors: []
      });
    }
  }
  const provinceAt = (x, y) => provinces[y * columns + x];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const p = provinceAt(x, y);
      [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
        if (nx >= 0 && nx < columns && ny >= 0 && ny < rows) p.neighbors.push(provinceAt(nx, ny).id);
      });
    }
  }
  return { nations, provinces };
}

export async function importAzgaarFile(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); }
  catch (error) { throw new Error(`Could not parse JSON: ${error.message}`); }
  return convertAzgaarToGame(data);
}

export function convertAzgaarToGame(data) {
  const pack = data.pack || data;
  const statesRaw = normalizeCollection(pack.states).filter(s => s && !s.removed && Number(s.i) !== 0);
  const provincesRaw = normalizeCollection(pack.provinces).filter(p => p && !p.removed && Number(p.i) !== 0);
  const burgsRaw = normalizeCollection(pack.burgs).filter(b => b && !b.removed && Number(b.i) !== 0);
  const cellsRaw = normalizeCollection(pack.cells).filter(c => c && Number.isFinite(Number(c.i)));
  const verticesRaw = normalizeCollection(pack.vertices).filter(v => v && Number.isFinite(Number(v.i)));
  if (!statesRaw.length) throw new Error('Missing Azgaar states. Export with Tools → Export → Data/JSON.');
  if (!provincesRaw.length) throw new Error('Missing Azgaar provinces. Export with Tools → Export → Data/JSON.');
  if (!cellsRaw.length) throw new Error('Missing Azgaar cells. This looks like the wrong export type.');

  const mapWidth = data.info?.width || pack.info?.width || data.settings?.width || 1875;
  const mapHeight = data.info?.height || pack.info?.height || data.settings?.height || 973;
  const stateById = new Map(statesRaw.map(s => [Number(s.i), s]));
  const cellById = new Map(cellsRaw.map(c => [Number(c.i), c]));
  const vertexById = new Map(verticesRaw.map(v => [Number(v.i), v]));
  const burgById = new Map(burgsRaw.map(b => [Number(b.i), b]));

  const cellsByProvince = groupCellsByProvince(cellsRaw);
  const usedStateIds = getUsedStateIds(provincesRaw, cellsByProvince, stateById);
  if (!usedStateIds.length) throw new Error('No playable states were connected to provinces in this Azgaar file.');

  const nations = buildNations(usedStateIds, stateById);
  const provinces = buildProvinces(provincesRaw, cellsByProvince, cellById, vertexById, burgById, nations, mapWidth, mapHeight);
  assignProvinceNeighbors(provinces, cellsRaw, cellById);
  ensureFallbackNeighbors(provinces);
  if (provinces.length < 2) throw new Error('Not enough playable provinces were created from this Azgaar file.');
  return { nations, provinces };
}

function getUsedStateIds(provincesRaw, cellsByProvince, stateById) {
  const ids = new Set();
  provincesRaw.forEach(province => {
    const stateId = Number(province.state);
    if (!stateId || !stateById.has(stateId)) return;
    const cells = cellsByProvince.get(Number(province.i)) || [];
    if (cells.length) ids.add(stateId);
  });
  return [...ids];
}

function normalizeCollection(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map((item, index) => item && typeof item === 'object' && !Array.isArray(item) ? { i: item.i ?? index, ...item } : { i: index, value: item });
  if (typeof raw !== 'object') return [];
  const arrayKeys = Object.keys(raw).filter(key => Array.isArray(raw[key]));
  if (!arrayKeys.length) return Object.values(raw).filter(item => item && typeof item === 'object');
  const length = Math.max(...arrayKeys.map(key => raw[key].length));
  const rows = [];
  for (let i = 0; i < length; i++) {
    const row = { i };
    for (const key of arrayKeys) row[key] = raw[key][i];
    rows.push(row);
  }
  return rows;
}

function buildNations(stateIds, stateById) {
  const nations = {};
  stateIds.forEach((stateId, index) => {
    const state = stateById.get(Number(stateId));
    const militaryTotal = Array.isArray(state.military) ? state.military.reduce((sum, regiment) => sum + (Number(regiment.a) || 0), 0) : 0;
    nations[`s${stateId}`] = {
      name: state.fullName || state.name || `State ${stateId}`,
      color: normalizeColor(state.color, colorPool[index % colorPool.length]),
      treasury: Math.max(200, Math.round((Number(state.urban) || 0) * 3 + (Number(state.rural) || 0) / 10)),
      manpower: Math.max(20, Math.round((Number(state.rural) || 0) / 20 + (Number(state.urban) || 0) / 2)),
      industry: Math.max(1, Math.round((Number(state.urban) || 0) / 30) || 1),
      command: Math.max(2, Math.min(10, Math.round((militaryTotal || 1000) / 5000) + 2)),
      diplomacy: state.diplomacy || []
    };
  });
  return nations;
}

function groupCellsByProvince(cellsRaw) {
  const cellsByProvince = new Map();
  cellsRaw.forEach(cell => {
    const provinceId = Number(cell.province);
    if (!provinceId) return;
    if (!cellsByProvince.has(provinceId)) cellsByProvince.set(provinceId, []);
    cellsByProvince.get(provinceId).push(cell);
  });
  return cellsByProvince;
}

function buildProvinces(provincesRaw, cellsByProvince, cellById, vertexById, burgById, nations, mapWidth, mapHeight) {
  const provinces = provincesRaw
    .filter(province => Number(province.state) && nations[`s${Number(province.state)}`] && (cellsByProvince.get(Number(province.i)) || []).length)
    .map(province => {
      const provinceId = Number(province.i);
      const stateId = Number(province.state);
      const provinceCells = cellsByProvince.get(provinceId) || [];
      const centerCell = cellById.get(Number(province.center)) || provinceCells[0];
      const burg = burgById.get(Number(province.burg));
      const point = getPoint(province) || getPoint(burg) || getPoint(centerCell) || [randomInt(80, 820), randomInt(80, 520)];
      const urban = Number(province.urban ?? burg?.population) || 0;
      const pop = Number(province.rural) || provinceCells.reduce((sum, cell) => sum + (Number(cell.pop) || 0), 0);
      const area = Number(province.area) || provinceCells.reduce((sum, cell) => sum + (Number(cell.area) || 0), 0);
      const fortBonus = burg?.citadel ? 1 : 0;
      const terrain = calculateProvinceTerrain(provinceCells);
      const polygons = buildProvinceBoundaryPolygons(provinceCells, vertexById);
      return {
        id: `p${provinceId}`,
        sourceProvinceId: provinceId,
        name: province.fullName || province.name || `Province ${provinceId}`,
        owner: `s${stateId}`,
        color: normalizeColor(province.color, null),
        x: point[0],
        y: point[1],
        labelX: point[0],
        labelY: point[1],
        w: Math.max(42, Math.min(95, 44 + Math.sqrt(Math.max(area, 1)) / 3)),
        h: Math.max(34, Math.min(80, 34 + Math.sqrt(Math.max(area, 1)) / 4)),
        polygons,
        industry: Math.max(1, Math.min(10, Math.round(urban / 8) + fortBonus + 1)),
        army: Math.max(2, Math.min(20, Math.round(pop / 35) + fortBonus + 2)),
        terrain: terrain.type,
        mountainScore: terrain.mountainScore,
        defenseBonus: terrain.defenseBonus + fortBonus,
        mountainIcons: terrain.icons,
        neighbors: []
      };
    });
  return normalizeProvinceLayout(provinces, mapWidth, mapHeight);
}

function calculateProvinceTerrain(provinceCells) {
  const landCells = provinceCells.filter(cell => Number(cell.h) >= 20 || Number(cell.biome) > 0 || Number(cell.state) > 0);
  const sample = landCells.length ? landCells : provinceCells;
  const heights = sample.map(cell => Number(cell.h) || 0);
  const averageHeight = heights.reduce((sum, h) => sum + h, 0) / Math.max(1, heights.length);
  const mountainCells = sample.filter(cell => Number(cell.h) >= 70).length;
  const hillCells = sample.filter(cell => Number(cell.h) >= 50).length;
  const mountainRatio = mountainCells / Math.max(1, sample.length);
  const hillRatio = hillCells / Math.max(1, sample.length);
  const mountainScore = Math.round(Math.min(100, averageHeight * 0.7 + mountainRatio * 70 + hillRatio * 25));
  const defenseBonus = mountainScore >= 70 ? 2 : mountainScore >= 42 ? 1 : 0;
  const type = defenseBonus === 2 ? 'mountains' : defenseBonus === 1 ? 'hills' : 'plains';
  const iconCount = Math.min(3, defenseBonus + (mountainScore > 82 ? 1 : 0));
  const highCells = sample.filter(cell => Number(cell.h) >= (defenseBonus === 2 ? 65 : 50)).sort((a, b) => Number(b.h) - Number(a.h));
  const icons = highCells.slice(0, iconCount).map(cell => ({ x: getPoint(cell)?.[0] || 0, y: getPoint(cell)?.[1] || 0 }));
  return { type, mountainScore, defenseBonus, icons };
}

function buildProvinceBoundaryPolygons(provinceCells, vertexById) {
  const edgeMap = new Map();
  provinceCells.forEach(cell => {
    const vertices = getVertexIds(cell).map(Number).filter(id => Number.isFinite(id) && id >= 0);
    if (vertices.length < 3) return;
    for (let i = 0; i < vertices.length; i++) addBoundaryEdge(edgeMap, vertices[i], vertices[(i + 1) % vertices.length]);
  });

  const boundaryEdges = [...edgeMap.entries()].filter(([, edge]) => edge.count === 1);
  const loops = traceBoundaryLoops(boundaryEdges, vertexById);
  if (loops.length) return loops.map(poly => simplifyPolygon(poly, 240)).filter(poly => poly.length >= 3);
  return buildConvexFallback(provinceCells, vertexById);
}

function addBoundaryEdge(edgeMap, a, b) {
  if (a === b) return;
  const key = edgeKey(a, b);
  const existing = edgeMap.get(key);
  if (existing) existing.count += 1;
  else edgeMap.set(key, { a, b, count: 1 });
}

function traceBoundaryLoops(boundaryEntries, vertexById) {
  const adjacency = new Map();
  const remaining = new Set();
  boundaryEntries.forEach(([key, edge]) => {
    remaining.add(key);
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, new Set());
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, new Set());
    adjacency.get(edge.a).add(edge.b);
    adjacency.get(edge.b).add(edge.a);
  });

  const loops = [];
  while (remaining.size) {
    const firstKey = remaining.values().next().value;
    const [start, second] = firstKey.split('|').map(Number);
    const loop = [start, second];
    remaining.delete(firstKey);
    let previous = start;
    let current = second;
    let guard = 0;

    while (current !== start && guard++ < boundaryEntries.length + 8) {
      const options = [...(adjacency.get(current) || [])].filter(next => remaining.has(edgeKey(current, next)));
      const next = options.find(candidate => candidate !== previous) ?? options[0];
      if (next === undefined) break;
      remaining.delete(edgeKey(current, next));
      loop.push(next);
      previous = current;
      current = next;
    }

    if (loop.length >= 4 && loop[loop.length - 1] === start) loop.pop();
    const polygon = loop.map(id => getPoint(vertexById.get(id))).filter(point => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (polygon.length >= 3) loops.push(polygon);
  }

  return loops.sort((a, b) => polygonArea(b) - polygonArea(a)).slice(0, 6);
}

function buildConvexFallback(provinceCells, vertexById) {
  const points = [];
  provinceCells.forEach(cell => getVertexIds(cell).forEach(vertexId => {
    const point = getPoint(vertexById.get(Number(vertexId)));
    if (point && Number.isFinite(point[0]) && Number.isFinite(point[1])) points.push(point);
  }));
  const unique = [...new Map(points.map(point => [`${point[0]},${point[1]}`, point])).values()];
  const hull = convexHull(unique);
  return hull.length >= 3 ? [simplifyPolygon(hull, 240)] : [];
}

function convexHull(points) {
  if (points.length <= 3) return points;
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function simplifyPolygon(poly, maxPoints = 240) {
  if (poly.length <= maxPoints) return poly;
  const step = poly.length / maxPoints;
  const simplified = [];
  for (let i = 0; i < maxPoints; i++) simplified.push(poly[Math.floor(i * step)]);
  return simplified;
}

function polygonArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

function assignProvinceNeighbors(provinces, cellsRaw, cellById) {
  const provinceIdMap = new Map(provinces.map(p => [Number(p.sourceProvinceId), p.id]));
  const provinceBySourceId = new Map(provinces.map(p => [Number(p.sourceProvinceId), p]));
  cellsRaw.forEach(cell => {
    const sourceProvince = Number(cell.province);
    if (!sourceProvince || !provinceIdMap.has(sourceProvince)) return;
    const from = provinceBySourceId.get(sourceProvince);
    getNeighborCellIds(cell).forEach(neighborCellId => {
      const neighborCell = cellById.get(Number(neighborCellId));
      const neighborProvince = Number(neighborCell?.province);
      if (!neighborProvince || neighborProvince === sourceProvince) return;
      const toId = provinceIdMap.get(neighborProvince);
      if (from && toId && !from.neighbors.includes(toId)) from.neighbors.push(toId);
    });
  });
  provinces.forEach(p => delete p.sourceProvinceId);
}

function ensureFallbackNeighbors(provinces) {
  const lonely = provinces.filter(p => !p.neighbors?.length);
  if (!lonely.length) return;
  lonely.forEach(province => {
    province.neighbors = provinces
      .filter(other => other.id !== province.id)
      .map(other => ({ other, distance: distance(province, other) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map(item => item.other.id);
  });
}

function normalizeProvinceLayout(list, sourceWidth = 1875, sourceHeight = 973) {
  const scaleX = 820 / Math.max(1, Number(sourceWidth) || 1875);
  const scaleY = 520 / Math.max(1, Number(sourceHeight) || 973);
  return list.map(p => ({
    ...p,
    x: 40 + p.x * scaleX,
    y: 40 + p.y * scaleY,
    labelX: 40 + (p.labelX ?? p.x) * scaleX,
    labelY: 40 + (p.labelY ?? p.y) * scaleY,
    mountainIcons: Array.isArray(p.mountainIcons) ? p.mountainIcons.map(point => ({ x: 40 + point.x * scaleX, y: 40 + point.y * scaleY })) : [],
    w: Math.max(34, Math.min(85, p.w)),
    h: Math.max(28, Math.min(72, p.h)),
    polygons: Array.isArray(p.polygons) ? p.polygons.map(poly => poly.map(point => [40 + point[0] * scaleX, 40 + point[1] * scaleY])) : [],
    neighbors: p.neighbors || []
  }));
}

function getPoint(item) {
  if (!item) return null;
  if (Array.isArray(item.p) && item.p.length >= 2) return [Number(item.p[0]), Number(item.p[1])];
  if (Array.isArray(item.pole) && item.pole.length >= 2) return [Number(item.pole[0]), Number(item.pole[1])];
  if (Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y))) return [Number(item.x), Number(item.y)];
  return null;
}
function getVertexIds(cell) { if (Array.isArray(cell.v)) return cell.v; if (Array.isArray(cell.vertices)) return cell.vertices; return []; }
function getNeighborCellIds(cell) { if (Array.isArray(cell.c)) return cell.c; if (Array.isArray(cell.neighbors)) return cell.neighbors; return []; }
function normalizeColor(color, fallback) { return typeof color === 'string' && color.trim() ? color : fallback; }
function distance(a, b) { const dx = (a.x || 0) - (b.x || 0); const dy = (a.y || 0) - (b.y || 0); return Math.sqrt(dx * dx + dy * dy); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
