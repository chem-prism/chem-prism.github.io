/**
 * 模拟器十：色谱分析法（教材 ch15）
 *
 * 三层呈现：
 *   宏观层 —— 柱内色带：两个组分随流动相下移，逐渐拉开
 *   符号层 —— 色谱图 + 范第姆特曲线
 *
 * 教学指向：
 *   · α = 1 时无论柱效多高都分不开——选择性是前提，柱效是程度
 *   · 分离度 R ≥ 1.5 才算完全分离
 *   · 范第姆特方程：H 对流速存在极小值，过快过慢都降低柱效
 *   · 容量因子 k 常用 2~10，太小分不开、太大耗时
 */

import { chromMetrics, chromatogram, vanDeemter, optimumVelocity, resolutionVerdict } from '../chem.js';
import { Chart, sample } from '../chart.js';
import { resolveColor } from '../chart.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'chromatography',
  name: '色谱分析法',
  wave: '610 nm',
  accent: '--w-indigo',
  desc: '调流速、调柱长、调分配比——看两个峰怎么从重叠变到分开，以及为什么流速有个最优值。',
};

const VAN_A = 0.005, VAN_B = 0.05, VAN_C = 0.005;

export function mount(root, params = {}) {
  const state = {
    k1: params.k1 != null ? +params.k1 : 5,
    k2: params.k2 != null ? +params.k2 : 6,
    L: params.L != null ? +params.L : 30,
    u: params.u != null ? +params.u : 1.0,
  };

  /* ---------- 宏观层：柱内色带 ---------- */
  const colCv = h('canvas');
  let colPhase = 0;

  /* ---------- 符号层：色谱图 ---------- */
  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: '时间 / s', yLabel: '检测器信号',
    xRange: [0, 300], yRange: [0, 1.1],
    pad: { l: 46, r: 16, t: 14, b: 34 },
  });

  /* ---------- 符号层二：范第姆特曲线 ---------- */
  const cw2 = h('div', { class: 'chart-wrap' });
  const cv2 = h('canvas'); cw2.append(cv2);
  const chart2 = new Chart(cv2, {
    xLabel: '线速度 u / cm·s⁻¹', yLabel: '塔板高度 H / cm',
    xRange: [0.1, 8], yRange: [0, 0.2],
    pad: { l: 52, r: 16, t: 14, b: 34 },
  });

  const roHost = h('div');
  const findHost = h('div');

  const sK1 = slider({
    name: '组分 1 的容量因子 k₁', min: 0.5, max: 12, step: 0.1, value: state.k1,
    format: v => v.toFixed(1), onInput: v => { state.k1 = v; render(); },
  });
  const sK2 = slider({
    name: '组分 2 的容量因子 k₂', min: 0.5, max: 15, step: 0.1, value: state.k2,
    format: v => v.toFixed(1), onInput: v => { state.k2 = v; render(); },
  });
  const sL = slider({
    name: '柱长 L', hint: 'cm', min: 10, max: 100, step: 1, value: state.L,
    format: v => v.toFixed(0), onInput: v => { state.L = v; render(); },
  });
  const sU = slider({
    name: '线速度 u', hint: 'cm/s', min: 0.2, max: 8, step: 0.05, value: state.u,
    format: v => v.toFixed(2), onInput: v => { state.u = v; render(); },
  });

  root.append(
    panel('参数',
      h('div', { class: 'controls' }, sK1.el, sK2.el, sL.el, sU.el)),
    panel('柱内发生了什么', h('div', { class: 'bench single' },
      h('div', { class: 'bench-cell' }, h('div', { class: 'bench-tag' }, '宏观层', ' ', h('b', {}, '柱内色带')), colCv))),
    panel('色谱图', cw),
    panel('范第姆特曲线：柱效与流速的关系', cw2),
    panel('读数', roHost),
    findHost,
  );

  /* ---------- 柱内色带动画 ---------- */
  function drawColumn(metrics) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = colCv.clientWidth, hh = colCv.clientHeight;
    if (!w || !hh) return;
    if (colCv.width !== Math.round(w * dpr) || colCv.height !== Math.round(hh * dpr)) {
      colCv.width = Math.round(w * dpr); colCv.height = Math.round(hh * dpr);
    }
    const ctx = colCv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const colW = 46;
    const colX = w * 0.42;
    const top = 12, bot = hh - 26;
    const colH = bot - top;

    // 柱体
    ctx.fillStyle = 'rgba(120,140,155,0.10)';
    ctx.fillRect(colX, top, colW, colH);
    ctx.strokeStyle = 'rgba(160,180,196,0.45)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(colX, top, colW, colH);

    // 流动相方向箭头
    ctx.strokeStyle = 'rgba(160,180,196,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colX + colW + 14, top + 6);
    ctx.lineTo(colX + colW + 14, bot - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(colX + colW + 10, bot - 12);
    ctx.lineTo(colX + colW + 14, bot - 6);
    ctx.lineTo(colX + colW + 18, bot - 12);
    ctx.stroke();
    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(160,180,196,0.55)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('流动相', colX + colW + 22, (top + bot) / 2);

    // 两个色带：位置由「已迁移比例」决定，迁移速度正比于 1/(1+k)
    // 这正是容量因子的物理含义 —— 在固定相待得越久，走得越慢
    const travel = colPhase % 1;                 // 0~1 循环
    const kRef = Math.max(state.k1, state.k2);
    // 迁移距离正比于 1/(1+k)：在固定相待得越久走得越慢。
    // 以最大 k 为基准归一，两条带都留在柱内，间距随进程拉开。
    const bandPos = k => travel * ((1 + kRef) / (1 + k)) * 0.75;
    const p1 = top + colH * bandPos(state.k1);
    const p2 = top + colH * bandPos(state.k2);
    const sig1 = 16 + 26 / Math.sqrt(1 + state.k1);
    const sig2 = 16 + 26 / Math.sqrt(1 + state.k2);

    const band = (y, sigma, rgb, label) => {
      const g = ctx.createLinearGradient(0, y - sigma, 0, y + sigma);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(0.5, `rgba(${rgb},0.65)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(colX + 2, y - sigma, colW - 4, sigma * 2);
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, colX - 10, y);
    };
    band(p1, sig1, '232,163,61', '组分 1');
    band(p2, sig2, '47,179,163', '组分 2');

    ctx.font = '10px "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(160,180,196,0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('k 越大，在固定相停留越久，走得越慢', w / 2, hh - 6);
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    const m = chromMetrics({ k1: state.k1, k2: state.k2, L: state.L, u: state.u, A: VAN_A, B: VAN_B, C: VAN_C });
    const { points, tEnd } = chromatogram(m);

    // 色谱图
    chart.xRange = [0, Math.ceil(tEnd)];
    chart.yRange = [0, 1.15];
    chart.setBands([]);
    chart.setVRanges([]);
    chart.setMarkers([
      { x: m.tM, color: 'var(--faint)', label: '死时间', dash: [3, 3] },
      { x: m.tR1, color: 'var(--w-amber)', label: '', dash: [2, 4] },
      { x: m.tR2, color: 'var(--w-teal)', label: '', dash: [2, 4] },
    ]);
    chart.setSeries([{
      name: '信号', points: points.map(p => ({ x: p.t, y: p.signal })),
      color: 'var(--accent)', width: 1.8, glow: true,
      yFormat: v => v.toFixed(3),
    }]);
    chart.draw();

    // 范第姆特曲线
    const uOpt = optimumVelocity(VAN_B, VAN_C);
    const vd = sample(0.2, 8, 200, u => vanDeemter(u, VAN_A, VAN_B, VAN_C));
    chart2.yRange = [0, Math.max(0.16, vanDeemter(0.2, VAN_A, VAN_B, VAN_C) * 1.1)];
    chart2.setBands([]);
    chart2.setVRanges([{
      x0: Math.max(0.2, uOpt - 0.35), x1: uOpt + 0.35,
      color: 'var(--w-green)', alpha: 0.10, label: '最佳流速附近',
    }]);
    chart2.setMarkers([{
      x: state.u, color: 'var(--w-amber)', label: `当前 u=${state.u.toFixed(2)}`, dash: [5, 3],
    }]);
    chart2.setSeries([{
      name: 'H', points: vd, color: 'var(--w-green)', width: 2, glow: true,
      yFormat: v => v.toFixed(4),
    }]);
    chart2.draw();

    // 读数
    const verdict = resolutionVerdict(m.R);
    roHost.replaceChildren(readouts([
      { k: '塔板数 N', v: m.N.toFixed(0) },
      { k: '塔板高度 H', v: m.H.toFixed(4), unit: 'cm', tone: m.H < 0.05 ? 'good' : 'warn' },
      { k: '分离因数 α', v: m.alpha.toFixed(2), tone: m.alpha > 1.2 ? 'good' : m.alpha > 1.05 ? 'warn' : 'bad' },
      { k: '分离度 R', v: m.R.toFixed(2), tone: m.R >= 1.5 ? 'good' : m.R >= 1 ? 'warn' : 'bad' },
      { k: '是否分开', v: verdict },
    ]));

    // 结论
    const alpha = m.alpha;
    const kAvg = (state.k1 + state.k2) / 2;
    let msg;
    if (alpha <= 1.02) {
      msg = `<b>α ≈ 1——两组分在固定相里待的时间几乎一样，无论柱效多高都分不开。</b>` +
        `<br>分离的前提是<b>选择性</b>（α 偏离 1），柱效只能在这个前提下把已经分开的趋势变成看得见的峰。` +
        `<br>调大 k₂ 试试。`;
    } else if (m.R < 1.0) {
      msg = `α = ${alpha.toFixed(2)}，有分离趋势，但峰太宽——<b>R 只有 ${m.R.toFixed(2)}，两组分基本糊在一起</b>。` +
        `<br>两个办法：加长柱子（N 增大）、或把流速调到最佳值附近（H 减小）。`;
    } else if (m.R < 1.5) {
      msg = `R = ${m.R.toFixed(2)}，<b>部分重叠</b>。定量分析一般要求 R ≥ 1.5。` +
        `<br>注意范第姆特曲线：当前 u = ${state.u.toFixed(2)}，最佳值是 ${uOpt.toFixed(2)} cm/s。` +
        `把流速调过去看看 R 怎么变。`;
    } else {
      msg = `R = ${m.R.toFixed(2)}，<b>完全分离</b>。`;
      if (kAvg > 10) msg += `<br>不过 k 平均值 ${kAvg.toFixed(1)} 偏大——分离是够了，但保留时间太长。常用范围是 k = 2~10。`;
      else if (kAvg < 2) msg += `<br>但 k 平均值 ${kAvg.toFixed(1)} 偏小，组分出峰太早，容易受死体积干扰。常用范围是 k = 2~10。`;
      else msg += `<br>k 平均值 ${kAvg.toFixed(1)} 落在常用区间 2~10 内，柱长与流速的搭配是合理的。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  /* ---------- 动画循环 ---------- */
  let raf = null, last = 0;
  function loop(t) {
    if (!last) last = t;
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    // 色带迁移速度随线速度加快
    colPhase += dt * 0.06 * state.u;
    drawColumn();
    raf = requestAnimationFrame(loop);
  }

  render();
  raf = requestAnimationFrame(loop);

  return {
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
    record() {
      const m = chromMetrics({ k1: state.k1, k2: state.k2, L: state.L, u: state.u, A: VAN_A, B: VAN_B, C: VAN_C });
      return {
        sim: '色谱分析法',
        params: [
          `k₁ = ${state.k1.toFixed(1)}，k₂ = ${state.k2.toFixed(1)}（α = ${m.alpha.toFixed(2)}）`,
          `柱长 L = ${state.L} cm，线速度 u = ${state.u.toFixed(2)} cm/s`,
        ],
        readings: [
          `塔板数 N = ${m.N.toFixed(0)}，塔板高度 H = ${m.H.toFixed(4)} cm`,
          `分离度 R = ${m.R.toFixed(2)}（${resolutionVerdict(m.R)}）`,
        ],
      };
    },
    params() { return { k1: state.k1, k2: state.k2, L: state.L, u: state.u }; },
  };
}
