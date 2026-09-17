/**
 * 绘图内核 —— Canvas 折线图
 *
 * 视觉基调：仪器面板。细网格、等宽刻度字、克制的发光。
 * 支持：多曲线、水平色带（指示剂变色范围）、竖直标记（化学计量点）、
 *       悬停十字线与读数、对数坐标。
 */

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

/**
 * Canvas 不解析 CSS 变量，必须先把 var(--x) 换成实际色值，
 * 否则赋值会被静默忽略、沿用上一次的 strokeStyle。
 */
const _colorCache = new Map();
function resolveColor(c) {
  if (typeof c !== 'string') return c;
  if (_colorCache.has(c)) return _colorCache.get(c);
  const m = c.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!m) { _colorCache.set(c, c); return c; }
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  const out = v || '#7d8d99';
  _colorCache.set(c, out);
  return out;
}
export function clearColorCache() { _colorCache.clear(); }

function niceStep(range, targetTicks) {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function fmtTick(v, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return v.toFixed(Math.min(decimals, 4));
}

export class Chart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   *   xLabel, yLabel    轴标题
   *   xRange=[0,1]      [min,max]
   *   yRange=[0,14]
   *   pad              内边距
   */
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.xLabel = opts.xLabel || '';
    this.yLabel = opts.yLabel || '';
    this.xRange = opts.xRange || [0, 1];
    this.yRange = opts.yRange || [0, 14];
    this.pad = Object.assign({ l: 46, r: 14, t: 14, b: 30 }, opts.pad || {});
    this.series = [];
    this.bands = [];
    this.markers = [];
    this.hover = null;
    this._onMove = this._onMove.bind(this);
    this._onLeave = () => { this.hover = null; this.draw(); };
    canvas.addEventListener('mousemove', this._onMove);
    canvas.addEventListener('mouseleave', this._onLeave);
    canvas.addEventListener('touchmove', e => {
      if (e.touches[0]) this._onMove(e.touches[0]);
    }, { passive: true });
    window.addEventListener('resize', () => this.draw());
  }

  setSeries(series) { this.series = series; return this; }
  setBands(bands) { this.bands = bands; return this; }
  setMarkers(markers) { this.markers = markers; return this; }

  /* ---------- 坐标变换 ---------- */
  _plot() {
    const { l, r, t, b } = this.pad;
    return {
      x: l, y: t,
      w: this.cv.clientWidth - l - r,
      h: this.cv.clientHeight - t - b,
    };
  }

  _px(v) {
    const p = this._plot();
    const [x0, x1] = this.xRange;
    return p.x + ((v - x0) / (x1 - x0)) * p.w;
  }

  _py(v) {
    const p = this._plot();
    const [y0, y1] = this.yRange;
    return p.y + p.h - ((v - y0) / (y1 - y0)) * p.h;
  }

  _invX(px) {
    const p = this._plot();
    const [x0, x1] = this.xRange;
    return x0 + ((px - p.x) / p.w) * (x1 - x0);
  }

  /* ---------- 绘制 ---------- */
  draw() {
    const cv = this.cv, ctx = this.ctx;
    const dpr = DPR();
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const p = this._plot();
    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue('--line').trim() || '#263038';
    const faint = css.getPropertyValue('--faint').trim() || '#4a5863';
    const dim = css.getPropertyValue('--dim').trim() || '#7d8d99';

    // 绘图区底色
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    ctx.fillRect(p.x, p.y, p.w, p.h);

    /* --- 水平色带（指示剂变色范围等） --- */
    this.bands.forEach(b => {
      const yTop = this._py(Math.min(b.hi, this.yRange[1]));
      const yBot = this._py(Math.max(b.lo, this.yRange[0]));
      ctx.fillStyle = resolveColor(b.color);
      ctx.globalAlpha = b.alpha == null ? 0.14 : b.alpha;
      ctx.fillRect(p.x, yTop, p.w, yBot - yTop);
      ctx.globalAlpha = 1;
      if (b.label) {
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillStyle = resolveColor(b.color);
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label, p.x + p.w - 4, (yTop + yBot) / 2);
        ctx.globalAlpha = 1;
      }
    });

    /* --- 网格 --- */
    const xStep = niceStep(this.xRange[1] - this.xRange[0], 6);
    const yStep = niceStep(this.yRange[1] - this.yRange[0], 6);

    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';

    ctx.strokeStyle = line;
    ctx.beginPath();
    for (let v = Math.ceil(this.xRange[0] / xStep) * xStep; v <= this.xRange[1] + 1e-9; v += xStep) {
      const x = Math.round(this._px(v)) + 0.5;
      ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h);
    }
    for (let v = Math.ceil(this.yRange[0] / yStep) * yStep; v <= this.yRange[1] + 1e-9; v += yStep) {
      const y = Math.round(this._py(v)) + 0.5;
      ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y);
    }
    ctx.stroke();

    // 刻度文字
    ctx.fillStyle = dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = Math.ceil(this.xRange[0] / xStep) * xStep; v <= this.xRange[1] + 1e-9; v += xStep) {
      ctx.fillText(fmtTick(v, xStep), this._px(v), p.y + p.h + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(this.yRange[0] / yStep) * yStep; v <= this.yRange[1] + 1e-9; v += yStep) {
      ctx.fillText(fmtTick(v, yStep), p.x - 8, this._py(v));
    }

    // 轴线
    ctx.strokeStyle = faint;
    ctx.beginPath();
    ctx.moveTo(p.x + 0.5, p.y); ctx.lineTo(p.x + 0.5, p.y + p.h); ctx.lineTo(p.x + p.w, p.y + p.h);
    ctx.stroke();

    // 轴标题
    ctx.fillStyle = dim;
    ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    if (this.xLabel) ctx.fillText(this.xLabel, p.x + p.w, p.y + p.h + 26);
    if (this.yLabel) {
      ctx.save();
      ctx.translate(11, p.y + p.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.yLabel, 0, 0);
      ctx.restore();
    }

    /* --- 竖直标记（化学计量点等） --- */
    this.markers.forEach(m => {
      const x = Math.round(this._px(m.x)) + 0.5;
      if (x < p.x || x > p.x + p.w) return;
      ctx.save();
      ctx.setLineDash(m.dash || [4, 3]);
      ctx.strokeStyle = resolveColor(m.color || '#7d8d99');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
      ctx.restore();
      if (m.label) {
        ctx.font = '10px "PingFang SC", sans-serif';
        ctx.fillStyle = resolveColor(m.color || '#7d8d99');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(m.label, x + 5, p.y + 5);
      }
    });

    /* --- 曲线 --- */
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    this.series.forEach(s => {
      if (!s.points || s.points.length < 2) return;
      if (s.fill) {
        ctx.beginPath();
        s.points.forEach((pt, i) => {
          const X = this._px(pt.x), Y = this._py(pt.y);
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        });
        ctx.lineTo(this._px(s.points[s.points.length - 1].x), p.y + p.h);
        ctx.lineTo(this._px(s.points[0].x), p.y + p.h);
        ctx.closePath();
        ctx.fillStyle = resolveColor(s.fill);
        ctx.fill();
      }
      ctx.beginPath();
      s.points.forEach((pt, i) => {
        const X = this._px(pt.x), Y = this._py(pt.y);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.strokeStyle = resolveColor(s.color || '#7d8d99');
      ctx.lineWidth = s.width || 1.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (s.dash) ctx.setLineDash(s.dash); else ctx.setLineDash([]);
      if (s.glow) {
        ctx.shadowColor = resolveColor(s.color);
        ctx.shadowBlur = 8;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    });
    ctx.restore();

    /* --- 悬停十字线 --- */
    if (this.hover != null) {
      const x = Math.round(this._px(this.hover)) + 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(223,230,236,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + p.h); ctx.stroke();
      ctx.restore();
      this._drawHoverReadout(this.hover);
    }
  }

  _drawHoverReadout(xVal) {
    const ctx = this.ctx, p = this._plot();
    const rows = this.series
      .map(s => ({ s, pt: nearest(s.points, xVal) }))
      .filter(o => o.pt)
      .map(o => ({
        label: o.s.name || '',
        value: o.s.yFormat ? o.s.yFormat(o.pt.y) : o.pt.y.toFixed(2),
        color: resolveColor(o.s.color),
      }));
    if (!rows.length) return;

    const xValStr = (this.xFormat ? this.xFormat(xVal) : xVal.toFixed(1));
    ctx.font = '11px ui-monospace, Menlo, monospace';
    const wMax = Math.max(...rows.map(r => ctx.measureText(`${r.label} ${r.value}`).width));
    const boxW = Math.max(wMax + 22, 78);
    const boxH = 18 + rows.length * 15;
    let bx = this._px(xVal) + 10;
    if (bx + boxW > p.x + p.w) bx = this._px(xVal) - boxW - 10;
    const by = p.y + 8;

    ctx.fillStyle = 'rgba(10,14,18,0.92)';
    ctx.strokeStyle = 'rgba(120,140,155,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, boxW, boxH, 4);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#7d8d99';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.fillText(this.xLabel ? `${xValStr}` : xValStr, bx + 8, by + 5);

    rows.forEach((r, i) => {
      const y = by + 20 + i * 15;
      ctx.fillStyle = resolveColor(r.color);
      ctx.beginPath(); ctx.arc(bx + 10, y + 5, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dfe6ec';
      ctx.fillText(`${r.label} ${r.value}`, bx + 18, y - 1);
    });
  }

  _onMove(e) {
    const rect = this.cv.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const p = this._plot();
    if (px < p.x || px > p.x + p.w) { if (this.hover != null) { this.hover = null; this.draw(); } return; }
    const v = this._invX(px);
    this.hover = v;
    this.draw();
    if (this.onHover) this.onHover(v);
  }
}

/**
 * 在采样序列上取 x 处的值。
 * 直接取最近点会带来可见的读数误差（例如 δ 在陡变区），故做线性插值。
 */
function nearest(points, x) {
  if (!points || !points.length) return null;
  if (points.length === 1) return points[0];
  const asc = points[points.length - 1].x >= points[0].x;
  // 二分定位
  let lo = 0, hi = points.length - 1;
  if (asc ? (x <= points[0].x) : (x >= points[0].x)) return points[0];
  if (asc ? (x >= points[hi].x) : (x <= points[hi].x)) return points[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const goRight = asc ? points[mid].x < x : points[mid].x > x;
    if (goRight) lo = mid; else hi = mid;
  }
  const a = points[lo], b = points[hi];
  const dx = b.x - a.x;
  if (dx === 0) return a;
  const t = (x - a.x) / dx;
  return { x, y: a.y + (b.y - a.y) * t };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 生成 [x0,x1] 上的等距采样 */
export function sample(x0, x1, n, fn) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = fn(x);
    if (Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}
