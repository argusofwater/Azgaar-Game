export class CanvasMapRenderer {
  constructor({ canvas, container, onProvinceSelected }) {
    if (!canvas) throw new Error('CanvasMapRenderer requires a canvas element.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container = container || canvas.parentElement;
    this.onProvinceSelected = onProvinceSelected;
    this.nations = {};
    this.provinces = [];
    this.fronts = [];
    this.selectedProvinceId = null;
    this.hoverProvinceId = null;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.minZoom = 0.45;
    this.maxZoom = 18;
    this.worldWidth = 900;
    this.worldHeight = 600;
    this.worldBounds = { minX: 0, minY: 0, maxX: 900, maxY: 600 };
    this.dpr = window.devicePixelRatio || 1;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.pointerDownAt = { x: 0, y: 0 };
    this.conquestAnimations = new Map();
    this.drawQueued = false;
    this.animationFrame = null;

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.queueDraw = this.queueDraw.bind(this);
    this.canvas.addEventListener('wheel', e => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('pointerdown', e => this.handlePointerDown(e));
    window.addEventListener('pointermove', e => this.handlePointerMove(e));
    window.addEventListener('pointerup', () => this.handlePointerUp());
    this.canvas.addEventListener('click', e => this.handleClick(e));
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  setWorld({ nations, provinces, fronts }) {
    this.nations = nations || {};
    this.provinces = provinces || [];
    this.fronts = fronts || [];
    this.selectedProvinceId = null;
    this.hoverProvinceId = null;
    this.calculateWorldBounds();
    this.fitToView();
    this.queueDraw();
  }

  updateWorld({ nations, provinces, selectedProvinceId, fronts }) {
    this.nations = nations || this.nations;
    this.provinces = provinces || this.provinces;
    this.fronts = fronts || this.fronts;
    this.selectedProvinceId = selectedProvinceId ?? this.selectedProvinceId;
    this.queueDraw();
  }

  selectProvince(id) { this.selectedProvinceId = id; this.queueDraw(); }
  startConquestAnimation(id, fromColor, toColor) { this.conquestAnimations.set(id, { fromColor, toColor, startedAt: performance.now(), duration: 1600 }); this.queueDraw(true); }
  startFrontPulse(front) { if (front) this.queueDraw(true); }

  queueDraw(forceAnimation = false) {
    if (this.drawQueued && !forceAnimation) return;
    this.drawQueued = true;
    if (!this.animationFrame) this.animationFrame = requestAnimationFrame(this.draw);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.clampCamera();
    this.queueDraw();
  }

  calculateWorldBounds() {
    const pts = [];
    for (const p of this.provinces) {
      if (p.polygons?.length) p.polygons.forEach(poly => poly.forEach(pt => pts.push(pt)));
      else pts.push([p.x, p.y], [p.x + p.w, p.y + p.h]);
    }
    if (!pts.length) {
      this.worldBounds = { minX: 0, minY: 0, maxX: 900, maxY: 600 };
      this.worldWidth = 900;
      this.worldHeight = 600;
      return;
    }
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    this.worldBounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    this.worldWidth = Math.max(1, this.worldBounds.maxX - this.worldBounds.minX);
    this.worldHeight = Math.max(1, this.worldBounds.maxY - this.worldBounds.minY);
  }

  fitToView() {
    const r = this.container.getBoundingClientRect();
    const pad = 36;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min((r.width - pad * 2) / this.worldWidth, (r.height - pad * 2) / this.worldHeight)));
    this.offsetX = pad - this.worldBounds.minX * this.zoom;
    this.offsetY = pad - this.worldBounds.minY * this.zoom;
    this.clampCamera();
  }

  clampCamera() {
    if (!this.worldBounds) this.worldBounds = { minX: 0, minY: 0, maxX: 900, maxY: 600 };
    const r = this.container.getBoundingClientRect();
    const m = 180;
    const minX = r.width - this.worldBounds.maxX * this.zoom - m;
    const maxX = -this.worldBounds.minX * this.zoom + m;
    const minY = r.height - this.worldBounds.maxY * this.zoom - m;
    const maxY = -this.worldBounds.minY * this.zoom + m;
    this.offsetX = this.worldWidth * this.zoom <= r.width ? (r.width - this.worldWidth * this.zoom) / 2 - this.worldBounds.minX * this.zoom : Math.min(maxX, Math.max(minX, this.offsetX));
    this.offsetY = this.worldHeight * this.zoom <= r.height ? (r.height - this.worldHeight * this.zoom) / 2 - this.worldBounds.minY * this.zoom : Math.min(maxY, Math.max(minY, this.offsetY));
  }

  screenToWorld(x, y) { return [(x - this.offsetX) / this.zoom, (y - this.offsetY) / this.zoom]; }
  getWorldPointFromEvent(e) { const rect = this.canvas.getBoundingClientRect(); return this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top); }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = this.screenToWorld(mx, my);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * (e.deltaY > 0 ? 0.84 : 1.19)));
    this.offsetX = mx - before[0] * this.zoom;
    this.offsetY = my - before[1] * this.zoom;
    this.clampCamera();
    this.queueDraw();
  }

  handlePointerDown(e) { this.isPanning = true; this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY }; this.pointerDownAt = { x: e.clientX, y: e.clientY }; }

  handlePointerMove(e) {
    const [wx, wy] = this.getWorldPointFromEvent(e);
    const hover = this.pickProvince(wx, wy)?.id || null;
    if (hover !== this.hoverProvinceId) { this.hoverProvinceId = hover; this.queueDraw(); }
    if (!this.isPanning) return;
    this.offsetX = e.clientX - this.panStart.x;
    this.offsetY = e.clientY - this.panStart.y;
    this.clampCamera();
    this.queueDraw();
  }

  handlePointerUp() { this.isPanning = false; }

  handleClick(e) {
    const moved = Math.abs(e.clientX - this.pointerDownAt.x) + Math.abs(e.clientY - this.pointerDownAt.y);
    if (moved > 5) return;
    const [wx, wy] = this.getWorldPointFromEvent(e);
    const province = this.pickProvince(wx, wy);
    if (!province) return;
    this.selectedProvinceId = province.id;
    this.onProvinceSelected?.(province);
    this.queueDraw();
  }

  draw() {
    this.drawQueued = false;
    this.animationFrame = null;
    const ctx = this.ctx;
    const rect = this.container.getBoundingClientRect();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const bg = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    bg.addColorStop(0, '#0b1b33');
    bg.addColorStop(0.55, '#12243d');
    bg.addColorStop(1, '#07111f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const now = performance.now();
    let animating = false;
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);
    for (const p of this.provinces) {
      const anim = this.conquestAnimations.get(p.id);
      let fill = this.nations[p.owner]?.color || p.color || '#6b7280';
      if (anim) {
        const progress = Math.min(1, (now - anim.startedAt) / anim.duration);
        fill = mixHex(anim.fromColor, anim.toColor, progress);
        if (progress < 1) animating = true;
        else this.conquestAnimations.delete(p.id);
      }
      this.drawProvince(ctx, p, fill);
    }
    this.drawTerrainIcons(ctx);
    this.drawProvinceLabels(ctx);
    this.drawFronts(ctx, now);
    ctx.restore();
    if (animating || this.fronts.length) this.queueDraw(true);
  }

  drawProvince(ctx, p, fill) {
    const selected = p.id === this.selectedProvinceId;
    const hovered = p.id === this.hoverProvinceId;
    ctx.fillStyle = fill;
    ctx.globalAlpha = hovered ? 0.86 : 0.68;
    ctx.strokeStyle = selected ? '#facc15' : hovered ? 'rgba(250,204,21,0.6)' : 'rgba(226,232,240,0.38)';
    ctx.lineWidth = selected ? 2.8 / this.zoom : hovered ? 1.4 / this.zoom : 0.65 / this.zoom;
    if (p.polygons?.length) {
      p.polygons.forEach(poly => { this.tracePolygon(ctx, poly); ctx.fill(); ctx.stroke(); });
    } else {
      ctx.beginPath(); ctx.rect(p.x, p.y, p.w, p.h); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (p.disputed) this.drawDisputedOverlay(ctx, p);
  }

  drawTerrainIcons(ctx) {
    for (const p of this.provinces) {
      if (!p.mountainIcons?.length || (p.defenseBonus || 0) <= 0) continue;
      p.mountainIcons.slice(0, 3).forEach((point, index) => this.drawMountainIcon(ctx, point.x, point.y, p.defenseBonus, index));
    }
  }

  getLabelScreenSize() {
    return Math.max(13, Math.min(34, 11 + this.zoom * 1.35));
  }

  drawProvinceLabels(ctx) {
    const showStats = this.zoom >= 3.2;
    const showNames = this.zoom >= 6.25;
    for (const p of this.provinces) {
      const important = p.id === this.selectedProvinceId || p.id === this.hoverProvinceId;
      if (!showStats && !important) continue;
      const center = getProvinceCenter(p);
      const owner = this.nations[p.owner];
      const title = showNames || important ? `${p.name}` : '';
      const stats = `A ${p.army ?? 0}  I ${p.industry ?? 0}${p.defenseBonus ? `  D +${p.defenseBonus}` : ''}`;
      this.drawMapLabel(ctx, center.x, center.y, title, stats, owner?.color || '#facc15', important);
    }
  }

  drawMapLabel(ctx, x, y, title, stats, color, important = false) {
    const base = this.getLabelScreenSize();
    const titlePx = (important ? base + 4 : base + 1) / this.zoom;
    const statPx = (important ? base + 2 : base) / this.zoom;
    const padX = (important ? 18 : 15) / this.zoom;
    const padY = (important ? 8 : 7) / this.zoom;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${statPx}px system-ui, sans-serif`;
    const statWidth = ctx.measureText(stats).width;
    let titleWidth = 0;
    if (title) {
      ctx.font = `950 ${titlePx}px system-ui, sans-serif`;
      titleWidth = ctx.measureText(title).width;
    }
    const w = Math.max(statWidth, titleWidth) + padX;
    const h = (title ? base * 2.8 : base * 1.65) / this.zoom;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.84)';
    ctx.strokeStyle = important ? '#facc15' : color;
    ctx.lineWidth = (important ? 2.4 : 1.6) / this.zoom;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 7 / this.zoom);
    ctx.fill();
    ctx.stroke();
    if (title) {
      ctx.font = `950 ${titlePx}px system-ui, sans-serif`;
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(title, x, y - (base * 0.55) / this.zoom);
      ctx.font = `900 ${statPx}px system-ui, sans-serif`;
      ctx.fillStyle = '#fde68a';
      ctx.fillText(stats, x, y + (base * 0.62) / this.zoom);
    } else {
      ctx.font = `900 ${statPx}px system-ui, sans-serif`;
      ctx.fillStyle = '#fde68a';
      ctx.fillText(stats, x, y + 0.5 / this.zoom);
    }
    ctx.restore();
  }

  drawMountainIcon(ctx, x, y, defenseBonus, index = 0) {
    const screenSize = Math.max(13, Math.min(26, 11 + this.zoom * 0.7));
    const size = (defenseBonus >= 2 ? screenSize + 3 : screenSize) / this.zoom;
    const ox = (index % 2) * size * 0.8;
    const oy = Math.floor(index / 2) * size * 0.65;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.90)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.lineWidth = 1.25 / this.zoom;
    ctx.beginPath();
    ctx.moveTo(x + ox, y + oy - size);
    ctx.lineTo(x + ox - size, y + oy + size * 0.8);
    ctx.lineTo(x + ox + size, y + oy + size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (defenseBonus >= 2) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.92)';
      ctx.beginPath();
      ctx.moveTo(x + ox + size * 0.22, y + oy - size * 0.34);
      ctx.lineTo(x + ox - size * 0.18, y + oy + size * 0.8);
      ctx.lineTo(x + ox + size, y + oy + size * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawDisputedOverlay(ctx, p) {
    const center = getProvinceCenter(p);
    const radius = Math.max(8, Math.min(22, Math.sqrt(getProvinceArea(p)) * 0.12));
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2.2 / this.zoom;
    ctx.setLineDash([5 / this.zoom, 4 / this.zoom]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawFronts(ctx, now) {
    for (const front of this.fronts || []) {
      const from = this.provinces.find(p => p.id === front.fromProvinceId);
      const to = this.provinces.find(p => p.id === front.toProvinceId);
      if (!from || !to) continue;
      const a = getProvinceCenter(from);
      const b = getProvinceCenter(to);
      const pulse = 0.5 + Math.sin(now / 130 + front.tick) * 0.5;
      const border = typeof front.border === 'number' ? front.border : 0.5;
      const wiggle = Math.sin(now / 95 + front.momentum * 0.3) * 0.035;
      const animatedBorder = Math.max(0.06, Math.min(0.94, border + wiggle));
      const mid = { x: a.x + (b.x - a.x) * animatedBorder, y: a.y + (b.y - a.y) * animatedBorder };
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
      const attackerColor = this.nations[front.attackerOwner]?.color || '#facc15';
      const defenderColor = this.nations[front.defenderOwner]?.color || '#93c5fd';
      ctx.save();
      ctx.globalAlpha = 0.96;
      this.drawPixelBorder(ctx, mid, angle, normal, attackerColor, defenderColor, pulse, now);
      this.drawFrontStrength(ctx, mid.x + normal.x * 30 / this.zoom, mid.y + normal.y * 30 / this.zoom, front.attackerStrength ?? from.army, attackerColor);
      this.drawFrontStrength(ctx, mid.x - normal.x * 30 / this.zoom, mid.y - normal.y * 30 / this.zoom, front.defenderStrength ?? to.army, defenderColor, front.terrainDefense || to.defenseBonus || 0);
      ctx.restore();
    }
  }

  drawPixelBorder(ctx, mid, angle, normal, attackerColor, defenderColor, pulse, now) {
    const segmentCount = Math.max(11, Math.min(25, Math.floor(this.zoom * 1.75)));
    const spacing = 7.2 / this.zoom;
    const pixel = Math.max(4.3, Math.min(7.5, 3.8 + this.zoom * 0.22)) / this.zoom;
    const tangent = { x: Math.cos(angle), y: Math.sin(angle) };
    for (let i = 0; i < segmentCount; i++) {
      const centered = i - (segmentCount - 1) / 2;
      const wave = Math.sin(now / 80 + i * 0.85) * 3.2 / this.zoom;
      const side = i % 2 === 0 ? 1 : -1;
      const x = mid.x + tangent.x * centered * spacing + normal.x * wave;
      const y = mid.y + tangent.y * centered * spacing + normal.y * wave;
      ctx.fillStyle = side > 0 ? attackerColor : defenderColor;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)';
      ctx.lineWidth = 0.9 / this.zoom;
      ctx.fillRect(x - pixel / 2, y - pixel / 2, pixel, pixel);
      ctx.strokeRect(x - pixel / 2, y - pixel / 2, pixel, pixel);
    }
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.78)';
    ctx.lineWidth = (2.0 + pulse) / this.zoom;
    ctx.setLineDash([9 / this.zoom, 5 / this.zoom]);
    ctx.beginPath();
    ctx.moveTo(mid.x - tangent.x * 58 / this.zoom, mid.y - tangent.y * 58 / this.zoom);
    ctx.lineTo(mid.x + tangent.x * 58 / this.zoom, mid.y + tangent.y * 58 / this.zoom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawFrontStrength(ctx, x, y, strength, color, defenseBonus = 0) {
    const label = defenseBonus > 0 ? `${strength}+${defenseBonus}` : `${strength}`;
    const screenFont = Math.max(18, Math.min(34, 16 + this.zoom * 1.0));
    const fontSize = screenFont / this.zoom;
    ctx.save();
    ctx.font = `950 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(label);
    const w = metrics.width + 16 / this.zoom;
    const h = (screenFont + 10) / this.zoom;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / this.zoom;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 6 / this.zoom);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5 / this.zoom);
    ctx.restore();
  }

  tracePolygon(ctx, poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }

  pickProvince(x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    try {
      for (let i = this.provinces.length - 1; i >= 0; i--) {
        const p = this.provinces[i];
        if (p.polygons?.length) {
          for (const poly of p.polygons) {
            this.tracePolygon(ctx, poly);
            if (ctx.isPointInPath(x, y)) return p;
          }
        } else if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
      }
      return null;
    } finally {
      ctx.restore();
    }
  }
}

function getProvinceCenter(p) {
  if (p.polygons?.length) {
    const pts = p.polygons.flat();
    return { x: pts.reduce((sum, point) => sum + point[0], 0) / pts.length, y: pts.reduce((sum, point) => sum + point[1], 0) / pts.length };
  }
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

function getProvinceArea(p) {
  if (!p.polygons?.length) return (p.w || 20) * (p.h || 20);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  p.polygons.flat().forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
  return Math.max(1, (maxX - minX) * (maxY - minY));
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function mixHex(a, b, t) {
  const ca = parseHex(a), cb = parseHex(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)}, ${Math.round(ca.g + (cb.g - ca.g) * t)}, ${Math.round(ca.b + (cb.b - ca.b) * t)})`;
}

function parseHex(hex) {
  const clean = typeof hex === 'string' ? hex.replace('#', '').trim() : '';
  if (clean.length !== 6) return { r: 107, g: 114, b: 128 };
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}
