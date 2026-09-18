/**
 * 模拟器十五：原子吸收光谱法（教材 ch14）
 *
 * 教学指向：
 *   · 空心阴极灯发出待测元素的特征谱线，原子化器把样品变成基态原子
 *   · 基体效应会抑制/增强信号，此时标准曲线法给出错误结果
 *   · **标准加入法**能抵消基体效应——外推至 A=0，截距的绝对值就是样品浓度
 *   · 石墨炉法比火焰法灵敏度高 2~3 个数量级，但基体干扰更大
 */

import { Chart, sample } from '../chart.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'aas',
  name: '原子吸收',
  wave: '425 nm',
  accent: '--w-red',
  desc: '基体把信号压下去了——标准曲线法算出的浓度是错的，标准加入法却能把它纠回来。',
};

export function mount(root, params = {}) {
  const state = {
    c0: params.c0 != null ? +params.c0 : 2.0,        // 样品真实浓度
    k: params.k != null ? +params.k : 0.65,          // 基体效应因子（<1 抑制）
    nAdd: params.nadd != null ? +params.nadd : 4,    // 标准加入的点数
  };

  /* ---------- 宏观层：光路 ---------- */
  const L = h('canvas');

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: '加入的标准浓度 c / μg·mL⁻¹', yLabel: '吸光度 A',
    xRange: [-4, 8], yRange: [0, 0.8],
    pad: { l: 50, r: 16, t: 14, b: 34 },
  });

  const roHost = h('div');
  const findHost = h('div');

  const sC0 = slider({
    name: '样品真实浓度', hint: 'μg/mL', min: 0.5, max: 5, step: 0.1, value: state.c0,
    format: v => v.toFixed(1), onInput: v => { state.c0 = v; render(); },
  });
  const sK = slider({
    name: '基体效应因子 k', hint: '1 = 无干扰；<1 抑制',
    min: 0.3, max: 1.4, step: 0.05, value: state.k,
    format: v => v.toFixed(2) + (v < 0.95 ? '（抑制）' : v > 1.05 ? '（增强）' : ''),
    onInput: v => { state.k = v; render(); },
  });
  const sN = slider({
    name: '标准加入点数', min: 3, max: 6, step: 1, value: state.nAdd,
    format: v => String(v), onInput: v => { state.nAdd = v; render(); },
  });

  root.append(
    panel('参数', h('div', { class: 'controls' }, sC0.el, sK.el, sN.el)),
    panel('仪器里发生了什么', h('div', { class: 'bench single' },
      h('div', { class: 'bench-cell', style: 'height:200px' },
        h('div', { class: 'bench-tag' }, '宏观层', ' ', h('b', {}, '光路')), L))),
    panel('标准加入法：把直线外推到 A = 0', cw),
    panel('读数', roHost),
    findHost,
  );

  /* 灵敏度：纯标准中每单位浓度的吸光度 */
  const SENS = 0.12;

  /* ---------- 光路绘制 ---------- */
  function drawPath() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = L.clientWidth, hh = L.clientHeight;
    if (!w || !hh) return;
    if (L.width !== Math.round(w * dpr) || L.height !== Math.round(hh * dpr)) {
      L.width = Math.round(w * dpr); L.height = Math.round(hh * dpr);
    }
    const ctx = L.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const cy = hh * 0.42;
    const label = (txt, x, y, col) => {
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillStyle = col || 'rgba(160,180,196,0.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(txt, x, y);
    };

    // 1 空心阴极灯
    ctx.fillStyle = '#e8c15a';
    ctx.beginPath(); ctx.arc(26, cy, 8, 0, Math.PI * 2); ctx.fill();
    label('空心阴极灯', 30, cy + 14);
    label('（待测元素特征谱线）', 60, cy + 28, 'rgba(120,140,155,0.6)');

    // 2 原子化器（火焰）
    const fx = w * 0.34, fw = 54;
    const flameTop = cy - 26, flameBot = cy + 26;
    const g = ctx.createLinearGradient(0, flameBot, 0, flameTop);
    g.addColorStop(0, 'rgba(92,130,214,0.75)');
    g.addColorStop(0.5, 'rgba(232,163,61,0.75)');
    g.addColorStop(1, 'rgba(224,90,79,0.15)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(fx - fw / 2, flameBot);
    ctx.quadraticCurveTo(fx, flameTop - 10, fx + fw / 2, flameBot);
    ctx.closePath();
    ctx.fill();
    label('原子化器（火焰）', fx, flameBot + 12);

    // 3 单色器
    const mx = w * 0.62;
    ctx.save();
    ctx.translate(mx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = 'rgba(160,180,196,0.6)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
    label('单色器', mx, cy + 22);

    // 4 检测器
    ctx.fillStyle = 'rgba(160,180,196,0.55)';
    ctx.fillRect(w - 34, cy - 10, 14, 20);
    label('检测器', w - 27, cy + 14);

    // 光路
    const beam = (x1, x2, alpha, width) => {
      ctx.strokeStyle = `rgba(232,193,90,${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke();
    };
    beam(34, fx - fw / 2, 0.9, 3);
    // 穿过火焰后按基体效应衰减
    beam(fx + fw / 2, mx - 12, 0.35 + 0.5 * Math.min(1, state.k), 1.2 + 2 * Math.min(1, state.k));
    beam(mx + 12, w - 34, 0.3 + 0.5 * Math.min(1, state.k), 1 + 2 * Math.min(1, state.k));

    label('I₀', (34 + fx - fw / 2) / 2, cy - 16, 'rgba(232,193,90,0.85)');
    label('I', (fx + fw / 2 + mx - 12) / 2, cy - 16, 'rgba(232,193,90,0.7)');

    // 基体效应提示
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillStyle = state.k < 0.95 ? 'rgba(224,90,79,0.9)' : state.k > 1.05 ? 'rgba(107,188,87,0.9)' : 'rgba(120,140,155,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      state.k < 0.95 ? `基体抑制：原子化效率只有纯标准的 ${(state.k * 100).toFixed(0)}%`
        : state.k > 1.05 ? `基体增强：信号放大到 ${(state.k * 100).toFixed(0)}%`
          : '无基体效应，标准曲线法即可',
      w / 2, hh - 6);
  }

  function render() {
    const addLevels = Array.from({ length: state.nAdd }, (_, i) => (i * 8) / state.nAdd);

    // 标准加入法：每个点 = 样品本底 + 加入量，再乘基体因子
    const pts = addLevels.map(c => ({ x: c, y: SENS * state.k * (state.c0 + c) }));
    // 线性回归
    const n = pts.length;
    const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
    const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    const xIntercept = -intercept / slope;                       // 外推得到的样品浓度

    // 标准曲线法：用纯标准做曲线，再测样品
    const pureCurve = sample(0, 8, 60, c => SENS * c);
    const aSample = SENS * state.k * state.c0;                   // 实测吸光度
    const cByCurve = aSample / SENS;                             // 标准曲线法给出的浓度

    chart.xRange = [-Math.max(2, state.c0 * 1.6), 8];
    chart.yRange = [0, Math.max(0.3, SENS * state.k * (state.c0 + 8) * 1.15)];
    chart.setBands([]);
    chart.setVRanges([]);
    chart.setMarkers([
      { x: 0, color: 'var(--faint)', label: '样品本底', dash: [3, 3] },
      { x: xIntercept, color: 'var(--w-green)', label: `外推得 ${xIntercept.toFixed(2)}`, dash: [4, 3] },
    ]);
    chart.setLabels([]);
    chart.setSeries([
      {
        name: '标准曲线（纯标准）', points: pureCurve, color: 'var(--faint)', width: 1.4, dash: [5, 4],
        yFormat: v => v.toFixed(3),
      },
      {
        name: '标准加入法', points: pts, color: 'var(--w-red)', width: 2.2, glow: true,
        yFormat: v => v.toFixed(3),
      },
      {
        // 外推段：从最低点延伸到 A=0
        name: '外推', points: [{ x: pts[0].x, y: SENS * state.k * (state.c0 + pts[0].x) }, { x: xIntercept, y: 0 }],
        color: 'var(--w-green)', width: 1.6, dash: [4, 3], yFormat: v => v.toFixed(3),
      },
    ]);
    chart.draw();
    drawPath();

    const err = cByCurve - state.c0;
    const errPct = (err / state.c0) * 100;

    roHost.replaceChildren(readouts([
      { k: '样品真实浓度', v: state.c0.toFixed(2), unit: 'μg/mL' },
      { k: '标准曲线法给出', v: cByCurve.toFixed(2), unit: 'μg/mL', tone: Math.abs(errPct) > 10 ? 'bad' : 'good' },
      { k: '相对误差', v: (errPct >= 0 ? '+' : '') + errPct.toFixed(1), unit: '%', tone: Math.abs(errPct) > 10 ? 'bad' : 'good' },
      { k: '标准加入法给出', v: xIntercept.toFixed(2), unit: 'μg/mL', tone: 'good' },
      { k: '加入法误差', v: ((xIntercept - state.c0) / state.c0 * 100 >= 0 ? '+' : '') + ((xIntercept - state.c0) / state.c0 * 100).toFixed(1), unit: '%', tone: 'good' },
    ]));

    let msg;
    if (Math.abs(state.k - 1) < 0.05) {
      msg = `当前没有基体效应，A 与浓度严格成正比——两条线重合，标准曲线法就够用了。` +
        `<br>把「基体效应因子」调离 1，看会发生什么。`;
    } else if (state.k < 1) {
      msg = `基体把原子化效率压到了纯标准的 <b>${(state.k * 100).toFixed(0)}%</b>。` +
        `<br>此时用<b>标准曲线法</b>（灰虚线）测样品，会算出 <b>${cByCurve.toFixed(2)} μg/mL</b>，` +
        `而真值是 ${state.c0.toFixed(2)}——<b>偏低 ${Math.abs(errPct).toFixed(1)}%</b>。` +
        `<br>换成<b>标准加入法</b>：把标准加进样品本身，让标准与样品处在同一个基体里，` +
        `斜率的下降对两者影响相同。把直线<b>外推到 A = 0</b>，横轴截距的绝对值就是样品浓度 ` +
        `<b>${xIntercept.toFixed(2)} μg/mL</b>——基体效应被抵消了。`;
    } else {
      msg = `基体增强了信号（${(state.k * 100).toFixed(0)}%）。标准曲线法会<b>偏高 ${errPct.toFixed(1)}%</b>；` +
        `<br>标准加入法外推得 ${xIntercept.toFixed(2)} μg/mL，仍然接近真值。` +
        `<br>这说明标准加入法不只处理抑制，对增强同样有效。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    stop() {},
    record() {
      const pts = Array.from({ length: state.nAdd }, (_, i) => (i * 8) / state.nAdd)
        .map(c => ({ x: c, y: SENS * state.k * (state.c0 + c) }));
      const n = pts.length;
      const sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
      const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const intercept = (sy - slope * sx) / n;
      return {
        sim: '原子吸收光谱法',
        params: [`样品真实浓度 ${state.c0.toFixed(2)} μg/mL`, `基体效应因子 k = ${state.k.toFixed(2)}`],
        readings: [
          `标准曲线法给出 ${(SENS * state.k * state.c0 / SENS).toFixed(2)} μg/mL`,
          `标准加入法外推得 ${(-intercept / slope).toFixed(2)} μg/mL`,
        ],
      };
    },
    params() { return { c0: state.c0, k: state.k, nadd: state.nAdd }; },
  };
}
