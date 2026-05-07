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
    this.minZoom = 0.75;
    this.maxZoom = 5;
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

  selectProvince(id) {
    this.selectedProvinceId = id;
    this.queueDraw();
  }

  startConquestAnimation(id, fromColor, toColor) {
    this.conquestAnimations.set(id, { fromColor, toColor, startedAt: performance.now(), duration: 1600 });
    this.queueDraw(true);
  }

  startFrontPulse(front) {
    if (!front) return;
    this.queueDraw(true);
  }

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
    const m = 80;
    const minX = r.width - this.worldBounds.maxX * this.zoom - m;
    const maxX = -this.worldBounds.minX * this.zoom + m;
    const minY = r.height - this.worldBounds.maxY * this.zoom - m;
    const maxY = -this.worldBounds.minY * this.zoom + m;
    this.offsetX = this.worldWidth * this.zoom <= r.width ? (r.width - this.worldWidth * this.zoom) / 2 - this.worldBounds.minX * this.zoom : Math.min(maxX, Math.max(minX, this.offsetX));
    this.offsetY = this.worldHeight * this.zoom <= r.height ? (r.height - this.worldHeight * this.zoom) / 2 - this.worldBounds.minY * this.zoom : Math.min(maxY, Math.max(minY, this.offsetY));
  }

  screenToWorld(x, y) { return [(x - this.offsetX) / this.zoom, (y - this.offsetY) / this.zoom]; }

  getWorldPointFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    return this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = this.screenToWorld(mx, my);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    this.offsetX = mx - before[0] * this.zoom;
    this.offsetY = my - before[1] * this.zoom;
    this.clampCamera();
    this.queueDraw();
  }

  handlePointerDown(e) {
    this.isPanning = true;
    this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
    this.pointerDownAt = { x: e.clientX, y: e.clientY };
  }

  handlePointerMove(e) {
    const [wx, wy] = this.getWorldPointFromEvent(e);
    const hover = this.pickProvince(wx, wy)?.id || null;
    if (hover !== this.hoverProvinceId) {
      this.hoverProvinceId = hover;
      this.queueDraw();
    }
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
      p.polygons.forEach(poly => {
        this.tracePolygon(ctx, poly);
        ctx.fill();
        ctx.stroke();
      });
    } else {
      ctx.beginPath();
      ctx.rect(p.x, p.y, p.w, p.h);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (p.disputed) this.drawDisputedOverlay(ctx, p);
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
      const mid = { x: a.x + (b.x - a.x) * border, y: a.y + (b.y - a.y) * border };
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.78)';
      ctx.lineWidth = (2.6 + pulse) / this.zoom;
      ctx.setLineDash([8 / this.zoom, 5 / this.zoom]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      this.drawPixelArmy(ctx, a.x + (mid.x - a.x) * 0.72, a.y + (mid.y - a.y) * 0.72, this.nations[front.attackerOwner]?.color || '#facc15', pulse, true);
      this.drawPixelArmy(ctx, b.x + (mid.x - b.x) * 0.72, b.y + (mid.y - b.y) * 0.72, this.nations[front.defenderOwner]?.color || '#93c5fd', pulse, false);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.2 / this.zoom;
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, (4 + pulse * 2) / this.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPixelArmy(ctx, x, y, color, pulse, facingRight) {
    const s = 4 / this.zoom;
    const dir = facingRight ? 1 : -1;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
    ctx.lineWidth = 0.8 / this.zoom;
    for (let i = 0; i < 4; i++) {
      const px = x + dir * (i * s * 1.8 + pulse * s * 0.6);
      const py = y + ((i % 2) ? s * 1.3 : -s * 1.3);
      ctx.fillRect(px - s, py - s, s * 2, s * 2);
      ctx.strokeRect(px - s, py - s, s * 2, s * 2);
    }
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x + dir * s * 6, y - s * 0.45, dir * s * 4, s * 0.9);
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
        } else if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
          return p;
        }
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

function mixHex(a, b, t) {
  const ca = parseHex(a), cb = parseHex(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)}, ${Math.round(ca.g + (cb.g - ca.g) * t)}, ${Math.round(ca.b + (cb.b - ca.b) * t)})`;
}

function parseHex(hex) {
  const clean = typeof hex === 'string' ? hex.replace('#', '').trim() : '';
  if (clean.length !== 6) return { r: 107, g: 114, b: 128 };
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}
