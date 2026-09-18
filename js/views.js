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
