/**
 * 实验台视图组件
 *
 * 现有模拟器只有曲线图——那是「符号层」。这两个组件补上另外两层：
 *   Beaker        宏观层：烧杯、液面、颜色、滴液
 *   ParticleField 微观层：粒子分布
 *
 * 三层同时在屏幕上，正是本作品「三重表征」主张的可视化本身。
 */

import { resolveColor } from './chart.js';

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

function fit(canvas) {
  const dpr = DPR();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

const varColor = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/* ============================================================
 * 酸碱指示剂的两型体颜色模型
 *
 * 指示剂本身是弱酸 HIn，酸式与碱式颜色不同：
 *   碱式占比 = 1 / (1 + 10^(pKa − pH))
 * 这解释了为什么变色发生在一个区间而不是某一点——
 * 而这正是学生最容易误解的地方。
 * ============================================================ */

export const INDICATOR_MODEL = {
  '酚酞': { pKa: 9.1, acid: [255, 255, 255, 0], base: [214, 90, 160, 0.85] },
  '甲基橙': { pKa: 3.7, acid: [214, 60, 50, 0.85], base: [240, 190, 60, 0.85] },
  '甲基红': { pKa: 5.1, acid: [200, 80, 60, 0.85], base: [232, 196, 70, 0.85] },
  '溴百里酚蓝': { pKa: 6.8, acid: [210, 180, 50, 0.7], base: [60, 140, 190, 0.8] },
};

/** 由 pH 求指示剂颜色（rgba 数组） */
export function indicatorColor(name, ph) {
  const m = INDICATOR_MODEL[name];
  if (!m) return [200, 220, 235, 0.35];
  const f = 1 / (1 + Math.pow(10, m.pKa - ph));      // 碱式占比
  return [0, 1, 2, 3].map(i =>
    i === 3 ? m.acid[3] + (m.base[3] - m.acid[3]) * f
            : Math.round(m.acid[i] + (m.base[i] - m.acid[i]) * f)
  );
}

/** 由 pH 求溶液色（未加指示剂时的近无色，强酸强碱下略有色） */
export function solutionColor(ph) {
  if (ph < 2) return [230, 200, 190, 0.25];
  if (ph > 12) return [190, 200, 225, 0.25];
  return [225, 232, 238, 0.18];
}

/* ============================================================
 * 烧杯视图
 * ============================================================ */

export class Beaker {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.fill = 0;                 // 液面 0~1
    this.color = [225, 232, 238, 0.2];
    this.caption = '';
    this.sub = '';
    this.drops = [];
    this.stir = 0;
    this.showStir = opts.stir !== false;
    this._raf = null;
    this._t0 = 0;
    this._loop = this._loop.bind(this);
    window.addEventListener('resize', () => this.draw());
  }

  set({ fill, color, caption, sub }) {
    if (fill != null) this.fill = Math.max(0, Math.min(1, fill));
    if (color) this.color = color;
    if (caption !== undefined) this.caption = caption;
    if (sub !== undefined) this.sub = sub;
    this.draw();
  }

  /** 滴一滴液（视觉反馈，不改变状态） */
  drop() {
    this.drops.push({ y: 0.08, vy: 0.012 });
    this.start();
  }

  start() {
    if (this._raf) return;
    this._t0 = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  _loop(t) {
    const dt = Math.min((t - this._t0) / 16.7, 3);
    this._t0 = t;
    this.stir += 0.06 * dt;
    this.drops = this.drops.filter(d => {
      d.y += d.vy * dt;
      return d.y < 0.62;
    });
    this.draw();
    if (this.drops.length) this._raf = requestAnimationFrame(this._loop);
    else this._raf = null;
  }

  draw() {
    const c = fit(this.cv);
    if (!c) return;
    const { ctx, w, h } = c;

    const bw = Math.min(w * 0.62, 168);
    const bh = h * 0.64;
    const bx = (w - bw) / 2;
    const by = h * 0.14;
    const r = 8;

    // 烧杯轮廓
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by + bh - r);
    ctx.quadraticCurveTo(bx, by + bh, bx + r, by + bh);
    ctx.lineTo(bx + bw - r, by + bh);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw, by + bh - r);
    ctx.lineTo(bx + bw, by);
    ctx.strokeStyle = 'rgba(160,180,196,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 刻度线
    ctx.strokeStyle = 'rgba(160,180,196,0.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = by + (bh * i) / 5;
      ctx.beginPath();
      ctx.moveTo(bx + bw - 14, y);
      ctx.lineTo(bx + bw - 2, y);
      ctx.stroke();
    }
    ctx.restore();

    // 液体
    const innerTop = by + bh * (1 - this.fill);
    if (this.fill > 0.001) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bx + 1.5, innerTop);
      ctx.lineTo(bx + 1.5, by + bh - r);
      ctx.quadraticCurveTo(bx + 1.5, by + bh - 1.5, bx + r, by + bh - 1.5);
      ctx.lineTo(bx + bw - r, by + bh - 1.5);
      ctx.quadraticCurveTo(bx + bw - 1.5, by + bh - 1.5, bx + bw - 1.5, by + bh - r);
      ctx.lineTo(bx + bw - 1.5, innerTop);
      ctx.closePath();
      const [rr, gg, bb, aa] = this.color;
      ctx.fillStyle = `rgba(${rr},${gg},${bb},${Math.min(aa, 0.95)})`;
      ctx.fill();
      // 液面高光
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx + 1.5, innerTop);
      ctx.lineTo(bx + bw - 1.5, innerTop);
      ctx.stroke();
      ctx.restore();
    }

    // 搅拌子
    if (this.showStir && this.fill > 0.05) {
      const cy = by + bh - 12;
      const cx = bx + bw / 2;
      const wob = Math.sin(this.stir) * 6;
      ctx.save();
      ctx.fillStyle = 'rgba(210,220,230,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx + wob, cy, 13, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 液滴
    this.drops.forEach(d => {
      const y = by + bh * d.y;
      ctx.beginPath();
      ctx.ellipse(bx + bw / 2, y, 2.6, 4, 0, 0, Math.PI * 2);
      const [rr, gg, bb] = this.color;
      ctx.fillStyle = `rgba(${rr},${gg},${bb},0.9)`;
      ctx.fill();
    });

    // 文字
    if (this.caption) {
      ctx.font = '600 13px ui-monospace, Menlo, monospace';
      ctx.fillStyle = varColor('--text', '#dde5ec');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this.caption, w / 2, h * 0.83);
    }
    if (this.sub) {
      ctx.font = '11px "PingFang SC", sans-serif';
      ctx.fillStyle = varColor('--faint', '#4c5b67');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this.sub, w / 2, h * 0.83 + 17);
    }
  }
}

/* ============================================================
 * 粒子视图
 * ============================================================ */

export class ParticleField {
  constructor(canvas) {
    this.cv = canvas;
    this.species = [];      // [{ label, n, color, r }]
    this.note = '';
    this._parts = [];
    this._raf = null;
    this._t0 = 0;
    this._loop = this._loop.bind(this);
    window.addEventListener('resize', () => this.draw());
  }

  /** species: [{ label, n, color }]，n 为要显示的粒子个数 */
  set(species, note = '') {
    const key = species.map(s => `${s.label}:${s.n}`).join(',');
    if (key === this._key) { this.note = note; this.draw(); return; }
    this._key = key;
    this.species = species.filter(s => s.n > 0);
    this.note = note;
    this._reseed();
    this.start();
  }

  _reseed() {
    const c = fit(this.cv);
    if (!c) { this._parts = []; return; }
    const { w, h } = c;
    const parts = [];
    const slots = [];
    this.species.forEach((sp, si) => {
      for (let i = 0; i < sp.n; i++) slots.push({ sp, si });
    });
    // 打散位置：网格 + 抖动，避免重叠
    const cols = Math.ceil(Math.sqrt(slots.length * (w / h)));
    const rows = Math.ceil(slots.length / cols);
    slots.forEach((s, i) => {
      const cx = (i % cols + 0.5) * (w / cols);
      const cy = (Math.floor(i / cols) + 0.5) * (h / rows);
      parts.push({
        x: cx + (Math.random() - 0.5) * (w / cols) * 0.55,
        y: cy + (Math.random() - 0.5) * (h / rows) * 0.55,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: s.sp.r || 4.6,
        color: s.sp.color,
        label: s.sp.label,
      });
    });
    this._parts = parts;
  }

  start() {
    if (this._raf) return;
    this._t0 = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }

  _loop(t) {
    const dt = Math.min((t - this._t0) / 16.7, 3);
    this._t0 = t;
    const c = { w: this.cv.clientWidth, h: this.cv.clientHeight };
    this._parts.forEach(p => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < p.r || p.x > c.w - p.r) p.vx *= -1;
      if (p.y < p.r || p.y > c.h - p.r) p.vy *= -1;
      p.x = Math.max(p.r, Math.min(c.w - p.r, p.x));
      p.y = Math.max(p.r, Math.min(c.h - p.r, p.y));
    });
    this.draw();
    this._raf = requestAnimationFrame(this._loop);
  }

  draw() {
    const c = fit(this.cv);
    if (!c) return;
    const { ctx, w, h } = c;

    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    ctx.fillRect(0, 0, w, h);

    this._parts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = resolveColor(p.color);   // Canvas 不认 CSS 变量，先解析
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // 图例
    let lx = 8;
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    this.species.forEach(sp => {
      ctx.beginPath();
      ctx.arc(lx + 4, 11, 4, 0, Math.PI * 2);
      ctx.fillStyle = resolveColor(sp.color); ctx.fill();
      ctx.fillStyle = varColor('--dim', '#7b8c99');
      const txt = `${sp.label} ×${sp.n}`;
      ctx.fillText(txt, lx + 11, 11.5);
      lx += 11 + ctx.measureText(txt).width + 12;
      if (lx > w - 60) lx = 8;
    });

    if (this.note) {
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillStyle = varColor('--faint', '#4c5b67');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.note, w - 6, h - 5);
    }
  }
}

/* ============================================================
 * 数量映射：把浓度换算成"画几个"
 *
 * 浓度跨度可达十几个数量级，直接按比例画没有意义。用对数压缩，
 * 保证「多的明显多、少的也看得见一个」——只表达相对多少，是示意的。
 * ============================================================ */

export function visualCount(c, { min = 0, cRef = 1, cMin } = {}) {
  if (!(c > 0)) return min;
  const lo = cMin != null ? cMin : cRef * 1e-6;
  if (c <= lo) return min;
  const t = Math.log10(c / lo) / Math.log10(cRef / lo);   // 0~1
  return Math.max(min, Math.round(1 + t * 35));
}

/* ============================================================
 * 比色皿与光路视图（分光光度法）
 *
 * 把仪器的工作过程画出来：光源 → 单色器 → 比色皿 → 检测器。
 * 入射光强 I₀ 与透射光强 I 的差别就是被吸收的部分，
 * 学生看到"光变暗了"，就理解了 A = lg(I₀/I) 在测什么。
 * ============================================================ */

export class Cuvette {
  constructor(canvas) {
    this.cv = canvas;
    this.color = [200, 120, 80, 0.5];   // 溶液颜色
    this.abs = 0;                        // 吸光度
    this.caption = '';
    this.sub = '';
    window.addEventListener('resize', () => this.draw());
  }

  set({ color, abs, caption, sub }) {
    if (color) this.color = color;
    if (abs != null) this.abs = abs;
    if (caption !== undefined) this.caption = caption;
    if (sub !== undefined) this.sub = sub;
    this.draw();
  }

  draw() {
    const c = fit(this.cv);
    if (!c) return;
    const { ctx, w, h } = c;

    const cy = h * 0.42;
    const cw = Math.min(w * 0.22, 62);      // 比色皿宽
    const chh = Math.min(h * 0.42, 74);     // 比色皿高
    const cx = (w - cw) / 2;

    // 光源
    ctx.beginPath();
    ctx.arc(22, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#e8c15a';
    ctx.fill();
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillStyle = varColor('--faint', '#4c5b67');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('光源', 22, cy + 12);

    // 入射光（粗、亮）
    const beamY = cy;
    ctx.strokeStyle = 'rgba(232,193,90,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, beamY);
    ctx.lineTo(cx, beamY);
    ctx.stroke();
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(232,193,90,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('I₀', (30 + cx) / 2, beamY - 4);

    // 比色皿
    const ctop = cy - chh / 2, cbot = cy + chh / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, ctop, cw, chh);
    ctx.strokeStyle = 'rgba(160,180,196,0.6)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 溶液（只有光路经过的那一段有颜色，符合实际观察）
    // 颜色可能只给三元组，alpha 需兜底——否则 rgba(...) 非法、fillStyle 被静默忽略
    const [rr, gg, bb, aa0] = this.color;
    const aa = Math.min(aa0 == null ? 0.8 : aa0, 0.92);
    ctx.fillStyle = `rgba(${rr},${gg},${bb},${aa})`;
    ctx.fillRect(cx + 1, ctop + 1, cw - 2, chh - 2);
    ctx.restore();

    // 透射光（粗细与亮度随吸光度衰减）
    const T = Math.pow(10, -this.abs);           // 透光率
    const tw = Math.max(0.8, 3 * Math.sqrt(T));
    const alpha = 0.15 + 0.8 * Math.min(1, Math.sqrt(T));
    ctx.strokeStyle = `rgba(232,193,90,${alpha})`;
    ctx.lineWidth = tw;
    ctx.beginPath();
    ctx.moveTo(cx + cw, beamY);
    ctx.lineTo(w - 30, beamY);
    ctx.stroke();

    // 检测器
    ctx.beginPath();
    ctx.rect(w - 28, cy - 8, 12, 16);
    ctx.fillStyle = 'rgba(160,180,196,0.5)';
    ctx.fill();
    ctx.fillStyle = varColor('--faint', '#4c5b67');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('检测器', w - 22, cy + 12);

    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(232,193,90,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('I', (cx + cw + w - 30) / 2, beamY - 4);

    // 吸光度
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    ctx.fillStyle = varColor('--text', '#dde5ec');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`A = ${this.abs.toFixed(3)}`, w / 2, h * 0.76);
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillStyle = varColor('--faint', '#4c5b67');
    ctx.fillText(this.caption || '', w / 2, h * 0.76 + 20);
    if (this.sub) ctx.fillText(this.sub, w / 2, h * 0.76 + 36);
  }
}

/* ============================================================
 * 数轴误差棒视图（误差传递、精密度）
 *
 * 把「量 ± 误差」画成数轴上的一根棒。误差传递的规则对不对，
 * 看棒有多长就一目了然——比看公式直观得多。
 * ============================================================ */

export class NumberLine {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.bars = [];     // [{ label, value, err, color, dash }]
    this.dots = [];     // [{ value, color }]
    this.xLabel = opts.xLabel || '';
    this.window = opts.window || null;   // 强制 x 范围 [lo,hi]
    window.addEventListener('resize', () => this.draw());
  }

  setBars(bars) { this.bars = bars || []; this.draw(); }
  setDots(dots) { this.dots = dots || []; this.draw(); }

  _range() {
    let lo = Infinity, hi = -Infinity;
    this.bars.forEach(b => {
      lo = Math.min(lo, b.value - b.err);
      hi = Math.max(hi, b.value + b.err);
    });
    this.dots.forEach(d => { lo = Math.min(lo, d.value); hi = Math.max(hi, d.value); });
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    const pad = Math.max((hi - lo) * 0.18, Math.abs(hi) * 0.02, 1e-9);
    return [lo - pad, hi + pad];
  }

  draw() {
    const c = fit(this.cv);
    if (!c) return;
    const { ctx, w, h } = c;
    const [lo, hi] = this.window || this._range();
    const PAD = 34;
    const X = v => PAD + ((v - lo) / (hi - lo)) * (w - PAD * 2);

    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    ctx.fillRect(0, 0, w, h);

    const axisY = h * 0.62;

    // 轴线
    ctx.strokeStyle = varColor('--line', '#212b34');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, axisY); ctx.lineTo(w - PAD, axisY);
    ctx.stroke();

    // 刻度
    const range = hi - lo;
    const step = niceStepLocal(range, 5);
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.fillStyle = varColor('--dim', '#7b8c99');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) {
      const x = Math.round(X(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY + 4);
      ctx.strokeStyle = 'rgba(160,180,196,0.28)';
      ctx.stroke();
      const dec = Math.max(0, -Math.floor(Math.log10(step)));
      ctx.fillText(v.toFixed(Math.min(dec, 4)), x, axisY + 7);
    }

    // 误差棒
    this.bars.forEach((b, i) => {
      const y = axisY - 30 - i * 26;
      const x1 = X(b.value - b.err), x2 = X(b.value + b.err), xm = X(b.value);
      const col = resolveColor(b.color || '--w-amber');
      ctx.strokeStyle = col;
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, y - 6); ctx.lineTo(x1, y + 6);
      ctx.moveTo(x2, y - 6); ctx.lineTo(x2, y + 6);
      ctx.moveTo(xm, y - 9); ctx.lineTo(xm, y + 9);
      ctx.stroke();
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillStyle = varColor('--dim', '#7b8c99');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, PAD - 6, y);
    });

    // 散点（精密度用）
    if (this.dots.length) {
      const y = axisY - 22;
      ctx.globalAlpha = 0.9;
      this.dots.forEach(d => {
        ctx.beginPath();
        ctx.arc(X(d.value), y, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = resolveColor(d.color || '--w-red');
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    if (this.xLabel) {
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillStyle = varColor('--faint', '#4c5b67');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.xLabel, w - PAD, h - 6);
    }
  }
}

function niceStepLocal(range, target) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/* ============================================================
 * 分子三维视图（球棍模型）
 *
 * 不引入 Three.js —— 球棍模型只是「球 + 线」，用 Canvas 2D 加
 * 画家算法（按深度排序后从远到近绘制）就足够，且保持零依赖。
 * 支持鼠标拖拽旋转，松开后缓慢自转。
 * ============================================================ */

// CPK 配色（按深色背景调整过明度）
const ATOM_STYLE = {
  H:  { color: '#e6ecf2', r: 0.34, name: '氢' },
  C:  { color: '#98a4ae', r: 0.60, name: '碳' },
  N:  { color: '#5c82d6', r: 0.58, name: '氮' },
  O:  { color: '#e05a4f', r: 0.56, name: '氧' },
  S:  { color: '#e8c15a', r: 0.70, name: '硫' },
  Cl: { color: '#6bbc57', r: 0.68, name: '氯' },
  Fe: { color: '#d9773d', r: 0.92, name: '铁' },
  Cu: { color: '#c8794a', r: 0.92, name: '铜' },
  Zn: { color: '#8f93a8', r: 0.90, name: '锌' },
  Ca: { color: '#6bbc57', r: 1.00, name: '钙' },
  Mg: { color: '#2fb3a3', r: 0.88, name: '镁' },
  Co: { color: '#d16ba5', r: 0.92, name: '钴' },
};

export class Molecule3D {
  constructor(canvas) {
    this.cv = canvas;
    this.atoms = [];
    this.bonds = [];
    this.rotX = -0.35;
    this.rotY = 0.6;
    this.autoSpin = 0.0035;
    this.dragging = false;
    this._last = null;
    this._raf = null;
    this._spin = 0;

    this._down = e => {
      this.dragging = true;
      this._last = this._pt(e);
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId ?? 1);
    };
    this._move = e => {
      if (!this.dragging) return;
      const p = this._pt(e);
      if (this._last) {
        this.rotY += (p.x - this._last.x) * 0.01;
        this.rotX += (p.y - this._last.y) * 0.01;
        this.rotX = Math.max(-1.5, Math.min(1.5, this.rotX));
      }
      this._last = p;
      e.preventDefault && e.preventDefault();
      this.draw();
    };
    this._up = () => { this.dragging = false; this._last = null; };

    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._up);
    canvas.addEventListener('pointercancel', this._up);
    canvas.addEventListener('pointerleave', this._up);
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    window.addEventListener('resize', () => this.draw());
    this.start();
  }

  _pt(e) {
    const r = this.cv.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  /** molecule: { atoms:[{el,x,y,z}], bonds:[[i,j]|[i,j,order]] } */
  setMolecule(mol) {
    this.atoms = mol.atoms.map(a => ({ ...a, style: ATOM_STYLE[a.el] || ATOM_STYLE.C }));
    this.bonds = (mol.bonds || []).map(b => ({ a: b[0], b: b[1], order: b[2] || 1 }));
    // 居中并缩放到合适大小
    const n = this.atoms.length || 1;
    const cx = this.atoms.reduce((s, a) => s + a.x, 0) / n;
    const cy = this.atoms.reduce((s, a) => s + a.y, 0) / n;
    const cz = this.atoms.reduce((s, a) => s + a.z, 0) / n;
    let maxR = 0;
    this.atoms.forEach(a => {
      a.x -= cx; a.y -= cy; a.z -= cz;
      maxR = Math.max(maxR, Math.hypot(a.x, a.y, a.z) + a.style.r);
    });
    this.scaleHint = maxR || 1;
    this.draw();
    this.start();
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      if (!this.dragging) { this.rotY += this.autoSpin; }
      this.draw();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }

  _project(a, w, h) {
    const cy = Math.cos(this.rotY), sy = Math.sin(this.rotY);
    const x1 = a.x * cy + a.z * sy;
    const z1 = -a.x * sy + a.z * cy;
    const cx = Math.cos(this.rotX), sx = Math.sin(this.rotX);
    const y1 = a.y * cx - z1 * sx;
    const z2 = a.y * sx + z1 * cx;

    // 相机拉远一些（6 倍分子半径），透视强度就温和，旋转时尺寸不至于忽大忽小；
    // 缩放系数留足余量（3.4 而非 2.7），否则带氢的分子转到侧面会被裁掉。
    const CAM = this.scaleHint * 6.0;
    const persp = CAM / (CAM + z2);
    const scale = Math.min(w, h) / (this.scaleHint * 3.4);
    return {
      X: w / 2 + x1 * scale * persp,
      Y: h / 2 - y1 * scale * persp,
      z: z2,
      r: a.style.r * scale * persp,
      persp,
    };
  }

  draw() {
    const c = fit(this.cv);
    if (!c) return;
    const { ctx, w, h } = c;

    const P = this.atoms.map(a => this._project(a, w, h));

    // 键与原子一起按深度排序，保证前景挡住背景
    const items = [];
    this.bonds.forEach(b => items.push({ kind: 'bond', z: (P[b.a].z + P[b.b].z) / 2, b }));
    P.forEach((p, i) => items.push({ kind: 'atom', z: p.z, i }));
    items.sort((m, n) => m.z - n.z);          // 远的（z 大）先画

    items.forEach(it => {
      if (it.kind === 'bond') {
        const A = P[it.b.a], B = P[it.b.b];
        // 键被端点原子遮挡，画到球心即可，球会盖住多余部分
        ctx.beginPath();
        ctx.moveTo(A.X, A.Y);
        ctx.lineTo(B.X, B.Y);
        const depth = Math.min(A.persp, B.persp);
        ctx.strokeStyle = `rgba(190,204,216,${0.30 + 0.45 * depth})`;
        ctx.lineWidth = Math.max(1.2, 9 * depth * (this.scaleHint > 3 ? 0.7 : 1));
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        const p = P[it.i];
        const a = this.atoms[it.i];
        // 球体：径向渐变模拟光照
        const g = ctx.createRadialGradient(
          p.X - p.r * 0.35, p.Y - p.r * 0.35, p.r * 0.15,
          p.X, p.Y, p.r
        );
        g.addColorStop(0, lighten(a.style.color, 0.45));
        g.addColorStop(0.6, a.style.color);
        g.addColorStop(1, darken(a.style.color, 0.45));
        ctx.beginPath();
        ctx.arc(p.X, p.Y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    });

    // 图例（按元素去重）
    const seen = new Set();
    let lx = 8;
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    this.atoms.forEach(a => {
      if (seen.has(a.el)) return;
      seen.add(a.el);
      ctx.beginPath();
      ctx.arc(lx + 4, 12, 4, 0, Math.PI * 2);
      ctx.fillStyle = a.style.color; ctx.fill();
      ctx.fillStyle = varColor('--dim', '#7b8c99');
      const txt = a.el;
      ctx.fillText(txt, lx + 11, 12.5);
      lx += 11 + ctx.measureText(txt).width + 12;
    });

    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillStyle = varColor('--faint', '#4c5b67');
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('拖动可旋转', w - 8, h - 6);
  }
}

function hexToRgb(hex) {
  const t = hex.replace('#', '');
  return [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)];
}
function lighten(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  const f = v => Math.round(v + (255 - v) * k);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function darken(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  const f = v => Math.round(v * (1 - k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
