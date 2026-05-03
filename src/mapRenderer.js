export class CanvasMapRenderer {
  constructor({ canvas, container, onProvinceSelected }) {
    if (!canvas) throw new Error('CanvasMapRenderer requires a canvas element.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container = container || canvas.parentElement;
    this.onProvinceSelected = onProvinceSelected;
    this.nations = {};
    this.provinces = [];
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

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.canvas.addEventListener('wheel', e => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('pointerdown', e => this.handlePointerDown(e));
    window.addEventListener('pointermove', e => this.handlePointerMove(e));
    window.addEventListener('pointerup', () => this.handlePointerUp());
    this.canvas.addEventListener('click', e => this.handleClick(e));
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  setWorld({ nations, provinces }) {
    this.nations = nations || {};
    this.provinces = provinces || [];
    this.selectedProvinceId = null;
    this.hoverProvinceId = null;
    this.calculateWorldBounds();
    this.fitToView();
    this.draw();
  }

  updateWorld({ nations, provinces, selectedProvinceId }) {
    this.nations = nations || this.nations;
    this.provinces = provinces || this.provinces;
    this.selectedProvinceId = selectedProvinceId ?? this.selectedProvinceId;
    this.draw();
  }

  selectProvince(id) {
    this.selectedProvinceId = id;
    this.draw();
  }

  startConquestAnimation(id, fromColor, toColor) {
    this.conquestAnimations.set(id, { fromColor, toColor, startedAt: performance.now(), duration: 1600 });
    requestAnimationFrame(this.draw);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.clampCamera();
    this.draw();
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

  screenToWorld(x, y) {
    return [(x - this.offsetX) / this.zoom, (y - this.offsetY) / this.zoom];
  }

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
    this.draw();
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
      this.draw();
    }
    if (!this.isPanning) return;
    this.offsetX = e.clientX - this.panStart.x;
    this.offsetY = e.clientY - this.panStart.y;
    this.clampCamera();
    this.draw();
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
    this.draw();
  }

  draw() {
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
    ctx.restore();
    if (animating) requestAnimationFrame(this.draw);
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

function mixHex(a, b, t) {
  const ca = parseHex(a), cb = parseHex(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)}, ${Math.round(ca.g + (cb.g - ca.g) * t)}, ${Math.round(ca.b + (cb.b - ca.b) * t)})`;
}

function parseHex(hex) {
  const clean = typeof hex === 'string' ? hex.replace('#', '').trim() : '';
  if (clean.length !== 6) return { r: 107, g: 114, b: 128 };
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}
