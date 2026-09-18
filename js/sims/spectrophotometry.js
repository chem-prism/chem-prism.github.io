/**
 * 模拟器七：分光光度法
 *
 * 教学指向：
 *   · A–c 只在稀溶液、单色光下成正比（错题样本 No.34）
 *   · 高浓度弯曲的原因是化学因素与仪器因素，不是「仪器坏了」（No.35）
 *   · 用弯曲段的标准曲线去反算浓度，会得到偏低的错误结果
 */

import { calibrationCurve, absorbance, concFromAbs } from '../chem.js';
import { Chart } from '../chart.js';
import { h, panel, readouts, slider, finding, sig } from './common.js';

export const meta = {
  id: 'spectrophotometry',
  name: '分光光度法',
  wave: '420 nm',
  accent: '--w-indigo',
  desc: '把浓度一路调高，看 A–c 曲线在哪里开始弯——以及用弯曲的那一段算浓度会错多少。',
};

export function mount(root, params = {}) {
  const state = {
    eps: params.eps != null ? +params.eps : 1.0e4,
    b: params.b != null ? +params.b : 1.0,
    cMax: params.cmax != null ? +params.cmax : 1.2e-3,
    k: params.k != null ? +params.k : 0,
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: 'c / mmol·L⁻¹', yLabel: 'A',
    xRange: [0, 1.2], yRange: [0, 1.6],
    pad: { l: 46, r: 16, t: 14, b: 34 },
  });
  chart.xFormat = v => v.toFixed(2);

  const roHost = h('div');
  const findHost = h('div');

  const sEps = slider({
    name: '摩尔吸光系数 ε', hint: 'L·mol⁻¹·cm⁻¹', min: 1000, max: 50000, step: 500,
    value: state.eps, format: v => v.toExponential(1),
    onInput: v => { state.eps = v; render(); },
  });
  const sB = slider({
    name: '光程 b', hint: 'cm', min: 0.5, max: 5, step: 0.5, value: state.b,
    format: v => v.toFixed(1), onInput: v => { state.b = v; render(); },
  });
  const sCmax = slider({
    name: '浓度上限', hint: 'mmol/L', min: 0.2, max: 3, step: 0.1, value: state.cMax * 1000,
    format: v => v.toFixed(1), onInput: v => { state.cMax = v / 1000; render(); },
  });
  const sK = slider({
    name: '偏离系数', hint: '0 = 完全符合比尔定律',
    min: 0, max: 1500, step: 25, value: state.k,
    format: v => v === 0 ? '0（无偏离）' : String(v),
    onInput: v => { state.k = v; render(); },
  });

  root.append(
    panel('参数',
      h('div', { class: 'controls' }, sEps.el, sB.el, sCmax.el, sK.el),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { class: 'btn', onclick: () => { state.k = 0; sK.set(0); render(); } }, '无偏离'),
        h('button', { class: 'btn', onclick: () => { state.k = 500; sK.set(500); render(); } }, '轻度偏离'),
        h('button', { class: 'btn', onclick: () => { state.k = 1200; sK.set(1200); render(); } }, '严重偏离'))),
    panel('标准曲线 A–c', cw),
    panel('读数', roHost),
    findHost,
  );

  /** 找出偏离达到 5% 的浓度 —— 线性范围的上限 */
  function linearLimit() {
    for (let i = 1; i <= 200; i++) {
      const c = (state.cMax * i) / 200;
      const ideal = state.eps * state.b * c;
      const real = absorbance(state.eps, state.b, c, state.k);
      if (ideal > 0 && (ideal - real) / ideal > 0.05) return c;
    }
    return null;
  }

  function render() {
    const curve = calibrationCurve({ eps: state.eps, b: state.b, cMax: state.cMax, k: state.k });
    const linear = curve.map(p => ({ x: p.c * 1000, y: state.eps * state.b * p.c }));
    const actual = curve.map(p => ({ x: p.c * 1000, y: p.A }));
    const lim = linearLimit();

    // 自动 y 轴：以理想直线的最高点为准
    const yTop = Math.max(state.eps * state.b * state.cMax, 0.2) * 1.1;
    chart.xRange = [0, state.cMax * 1000];
    chart.yRange = [0, yTop];

    chart.setBands(lim != null ? [{
      lo: 0, hi: yTop, color: 'var(--w-green)', alpha: 0.001,
    }] : []);
    chart.setVRanges(lim != null ? [{
      x0: lim * 1000, x1: state.cMax * 1000, color: 'var(--w-red)', alpha: 0.07,
      label: '偏离区（误差 > 5%）',
    }] : []);
    chart.setMarkers([]);
    chart.setSeries([
      {
        name: '理想直线', points: linear, color: 'var(--faint)', width: 1.4, dash: [5, 4],
        yFormat: v => v.toFixed(3),
      },
      {
        name: '实测', points: actual, color: 'var(--w-indigo)', width: 2.2, glow: true,
        yFormat: v => v.toFixed(3),
      },
    ]);
    chart.draw();

    // 用曲线末端反算浓度会错多少
    const cTop = state.cMax;
    const aTop = absorbance(state.eps, state.b, cTop, state.k);
    const cBack = concFromAbs(aTop, state.eps, state.b);
    const errPct = ((cTop - cBack) / cTop) * 100;

    roHost.replaceChildren(readouts([
      { k: '线性范围上限', v: lim != null ? (lim * 1000).toFixed(2) : '全程线性', unit: lim != null ? 'mmol/L' : '' },
      { k: '最高点吸光度', v: aTop.toFixed(3) },
      { k: '按比尔定律反算', v: (cBack * 1000).toFixed(2), unit: 'mmol/L' },
      { k: '浓度被低估', v: state.k === 0 ? '0' : errPct.toFixed(1), unit: '%', tone: state.k === 0 ? '' : (errPct > 10 ? 'bad' : 'warn') },
    ]));

    let msg;
    if (state.k === 0) {
      msg = `当前 A 与 c 完全成正比，标准曲线是一条直线。<b>但这是理想情况。</b>` +
        `<br>把「偏离系数」调大试试——真实实验里，浓度升高后曲线会向浓度轴弯曲。`;
    } else if (errPct > 10) {
      msg = `<b>曲线在高浓度段明显向下弯。</b>此时若仍按 A = εbc 反算，` +
        `最高点的浓度会被低估 ${errPct.toFixed(1)}%。` +
        `<br>弯的原因<b>不是仪器坏了</b>，主要是化学因素：溶液中发生了<b>解离、缔合或配位</b>，` +
        `使吸光型体的浓度不再等于总浓度。` +
        `<br>做法：把样品稀释到线性范围内再测。`;
    } else {
      msg = `曲线开始有轻微弯曲，偏离接近 5%——这通常就是<b>线性范围的上限</b>。` +
        `<br>继续把浓度调高，看弯曲怎么加剧。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    record() {
      const lim = linearLimit();
      const cTop = state.cMax;
      const aTop = absorbance(state.eps, state.b, cTop, state.k);
      const cBack = concFromAbs(aTop, state.eps, state.b);
      return {
        sim: '分光光度法',
        params: [
          `ε = ${state.eps.toExponential(1)} L·mol⁻¹·cm⁻¹，b = ${state.b.toFixed(1)} cm`,
          `偏离系数 k = ${state.k}`,
        ],
        readings: [
          `线性范围上限 = ${lim != null ? (lim * 1000).toFixed(2) + ' mmol/L' : '全程线性'}`,
          `最高点 A = ${aTop.toFixed(3)}，按比尔定律反算得 ${(cBack * 1000).toFixed(2)} mmol/L`,
          `浓度被低估 ${(((cTop - cBack) / cTop) * 100).toFixed(1)}%`,
        ],
      };
    },
    params() { return { eps: state.eps, b: state.b, cmax: state.cMax, k: state.k }; },
  };
}
