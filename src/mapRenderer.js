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
    this.devicePixelRatio = window.devicePixelRatio || 1;

    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.lastPointer = { x: 0, y: 0 };
    this.conquestAnimations = new Map();

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleClick = this.handleClick.bind(this);

    this.attachEvents();
    this.resize();
  }

  attachEvents() {
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('click', this.handleClick);
  }

  destroy() {
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('click', this.handleClick);
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

  selectProvince(provinceId) {
    this.selectedProvinceId = provinceId;
    this.draw();
  }

  startConquestAnimation(provinceId, fromColor, toColor) {
    this.conquestAnimations.set(provinceId, {
      fromColor,
      toColor,
      startedAt: performance.now(),
      duration: 1600
    });
    requestAnimationFrame(this.draw);
  }

  calculateWorldBounds() {
    const points = [];
    for (const province of this.provinces) {
      if (Array.isArray(province.polygons) && province.polygons.length) {
        for (const poly of province.polygons) {
          for (const point of poly) points.push(point);
        }
      } else {
        points.push([province.x, province.y], [province.x + province.w, province.y + province.h]);
      }
    }

    if (!points.length) {
      this.worldBounds = { minX: 0, minY: 0, maxX: 900, maxY: 600 };
      this.worldWidth = 900;
      this.worldHeight = 600;
      return;
    }

    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    this.worldBounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
    this.worldWidth = Math.max(1, this.worldBounds.maxX - this.worldBounds.minX);
    this.worldHeight = Math.max(1, this.worldBounds.maxY - this.worldBounds.minY);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.devicePixelRatio));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.devicePixelRatio));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    this.clampCamera();
    this.draw();
  }

  fitToView() {
    const rect = this.container.getBoundingClientRect();
    const padding = 36;
    const scaleX = (rect.width - padding * 2) / this.worldWidth;
    const scaleY = (rect.height - padding * 2) / this.worldHeight;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, Math.min(scaleX, scaleY)));
    this.offsetX = padding - this.worldBounds.minX * this.zoom;
    this.offsetY = padding - this.worldBounds.minY * this.zoom;
    this.clampCamera();
  }

  screenToWorld(x, y) {
    return [(x - this.offsetX) / this.zoom, (y - this.offsetY) / this.zoom];
  }

  handleWheel(event) {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const before = this.screenToWorld(mouseX, mouseY);
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));
    this.offsetX = mouseX - before[0] * this.zoom;
    this.offsetY = mouseY - before[1] * this.zoom;
    this.clampCamera();
    this.draw();
  }

  handlePointerDown(event) {
    this.isPanning = true;
    this.panStart = { x: event.clientX - this.offsetX, y: event.clientY - this.offsetY };
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const worldPoint = this.screenToWorld(localX, localY);
    const hovered = this.pickProvince(worldPoint[0], worldPoint[1]);
    const newHoverId = hovered?.id || null;

    if (newHoverId !== this.hoverProvinceId) {
      this.hoverProvinceId = newHoverId;
      this.draw();
    }

    if (!this.isPanning) return;
    const dx = Math.abs(event.clientX - this.lastPointer.x);
    const dy = Math.abs(event.clientY - this.lastPointer.y);
    if (dx + dy > 1) {
      this.offsetX = event.clientX - this.panStart.x;
      this.offsetY = event.clientY - this.panStart.y;
      this.clampCamera();
      this.draw();
    }
  }

  handlePointerUp(event) {
    this.isPanning = false;
    this.canvas.releasePointerCapture?.(event.pointerId);
  }

  handleClick(event) {
    const moved = Math.abs(event.clientX - this.lastPointer.x) + Math.abs(event.clientY - this.lastPointer.y);
    if (moved > 5) return;
    const rect = this.canvas.getBoundingClientRect();
    const [x, y] = this.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const province = this.pickProvince(x, y);
    if (!province) return;
    this.selectedProvinceId = province.id;
    this.onProvinceSelected?.(province);
    this.draw();
  }

  clampCamera() {
    const rect = this.container.getBoundingClientRect();
    const margin = 80;
    const minX = rect.width - this.worldBounds.maxX * this.zoom - margin;
    const maxX = -this.worldBounds.minX * this.zoom + margin;
    const minY = rect.height - this.worldBounds.maxY * this.zoom - margin;
    const maxY = -this.worldBounds.minY * this.zoom + margin;

    if (this.worldWidth * this.zoom <= rect.width) {
      this.offsetX = (rect.width - this.worldWidth * this.zoom) / 2 - this.worldBounds.minX * this.zoom;
    } else {
      this.offsetX = Math.min(maxX, Math.max(minX, this.offsetX));
    }

    if (this.worldHeight * this.zoom <= rect.height) {
      this.offsetY = (rect.height - this.worldHeight * this.zoom) / 2 - this.worldBounds.minY * this.zoom;
    } else {
      this.offsetY = Math.min(maxY, Math.max(minY, this.offsetY));
    }
  }

  draw() {
    const ctx = this.ctx;
    const rect = this.container.getBoundingClientRect();
    ctx.save();
    ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    this.drawBackground(ctx, rect);
    ctx.restore();

    const now = performance.now();
    let hasActiveAnimation = false;

    ctx.save();
    ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);

    for (const province of this.provinces) {
      const animation = this.conquestAnimations.get(province.id);
      let fillColor = this.nations[province.owner]?.color || province.color || '#6b7280';
      if (animation) {
        const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
        fillColor = mixHex(animation.fromColor, animation.toColor, progress);
        if (progress < 1) hasActiveAnimation = true;
        else this.conquestAnimations.delete(province.id);
      }
      this.drawProvince(ctx, province, fillColor);
    }

    ctx.restore();

    if (hasActiveAnimation) requestAnimationFrame(this.draw);
  }

  drawBackground(ctx, rect) {
    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, '#0b1b33');
    gradient.addColorStop(0.55, '#12243d');
    gradient.addColorStop(1, '#07111f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  drawProvince(ctx, province, fillColor) {
    const isSelected = province.id === this.selectedProvinceId;
    const isHovered = province.id === this.hoverProvinceId;
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = isHovered ? 0.86 : 0.68;
    ctx.strokeStyle = isSelected ? '#facc15' : isHovered ? 'rgba(250, 204, 21, 0.6)' : 'rgba(226, 232, 240, 0.38)';
    ctx.lineWidth = isSelected ? 2.8 / this.zoom : isHovered ? 1.4 / this.zoom : 0.65 / this.zoom;

    if (Array.isArray(province.polygons) && province.polygons.length) {
      for (const polygon of province.polygons) {
        this.tracePolygon(ctx, polygon);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(province.x, province.y, province.w, province.h, 18);
      else ctx.rect(province.x, province.y, province.w, province.h);
      ctx.fill();
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  tracePolygon(ctx, polygon) {
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
    ctx.closePath();
  }

  pickProvince(x, y) {
    const ctx = this.ctx;
    for (let i = this.provinces.length - 1; i >= 0; i--) {
      const province = this.provinces[i];
      if (Array.isArray(province.polygons) && province.polygons.length) {
        for (const polygon of province.polygons) {
          this.tracePolygon(ctx, polygon);
          if (ctx.isPointInPath(x, y)) return province;
        }
      } else if (x >= province.x && x <= province.x + province.w && y >= province.y && y <= province.y + province.h) {
        return province;
      }
    }
    return null;
  }
}

function mixHex(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return { r: 107, g: 114, b: 128 };
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return { r: 107, g: 114, b: 128 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}
