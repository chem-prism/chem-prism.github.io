/**
 * 模拟器十一：电位滴定（教材 ch12）
 *
 * 教学指向：
 *   · E–V 曲线在计量点附近变化平缓，肉眼难以精确定位终点
 *   · 微分曲线 ΔE/ΔV 的峰顶才是终点——这是电位滴定的标准做法
 *   · 电极斜率会随老化下降，低于理论 59.2 mV/pH 时结果失真
 */

import { potentiometricCurve, endpointFromDerivative } from '../chem.js';
import { Chart } from '../chart.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'potentiometry',
  name: '电位滴定',
  wave: '600 nm',
  accent: '--w-green',
  desc: 'E–V 曲线在终点附近几乎是平的——微分一下，峰顶就把终点指出来了。',
};

const PRESETS = [
  { label: 'Ce⁴⁺ 滴定 Fe²⁺', e1: 1.44, e2: 0.68 },
  { label: 'KMnO₄ 滴定 Fe²⁺', e1: 1.51, e2: 0.68 },
  { label: '电位差较小的一对', e1: 1.00, e2: 0.75 },
];

export function mount(root, params = {}) {
  const state = {
    e1: params.e1 != null ? +params.e1 : 1.44,
    e2: params.e2 != null ? +params.e2 : 0.68,
    c: params.c != null ? +params.c : 0.10,
    slope: params.slope != null ? +params.slope : 59.2,
  };

  const mkChart = (xLabel, yLabel, yRange) => {
    const wrap = h('div', { class: 'chart-wrap' });
    const cv = h('canvas'); wrap.append(cv);
    return { wrap, chart: new Chart(cv, { xLabel, yLabel, xRange: [0, 32], yRange, pad: { l: 54, r: 16, t: 14, b: 34 } }) };
  };
  const A = mkChart('V(滴定剂) / mL', 'E / mV', [0, 1600]);
  const B = mkChart('V(滴定剂) / mL', 'ΔE/ΔV / mV·mL⁻¹', [0, 6000]);

  const roHost = h('div');
  const findHost = h('div');

  const selPreset = h('select', {
    onchange: e => {
      const p = PRESETS[+e.target.value];
      state.e1 = p.e1; state.e2 = p.e2;
      sE1.set(p.e1); sE2.set(p.e2);
      render();
    },
  }, ...PRESETS.map((p, i) => h('option', { value: i }, p.label)));

  const sE1 = slider({
    name: '滴定剂电对 E₁°′', hint: 'V', min: 0.5, max: 1.8, step: 0.01, value: state.e1,
    format: v => v.toFixed(2), onInput: v => { state.e1 = v; render(); },
  });
  const sE2 = slider({
    name: '待测物电对 E₂°′', hint: 'V', min: 0.2, max: 1.3, step: 0.01, value: state.e2,
    format: v => v.toFixed(2), onInput: v => { state.e2 = v; render(); },
  });
  const sC = slider({
    name: '待测物浓度', hint: 'mol/L', min: -3, max: -0.5, step: 0.02,
    value: Math.log10(state.c),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.c = Math.pow(10, v); render(); },
  });
  const sSlope = slider({
    name: '电极斜率', hint: 'mV/pH，理论值 59.2',
    min: 40, max: 62, step: 0.1, value: state.slope,
    format: v => `${v.toFixed(1)}（${v >= 58 ? '正常' : v >= 54 ? '偏低' : '老化'}）`,
    onInput: v => { state.slope = v; render(); },
  });

  root.append(
    panel('体系',
      h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '常见滴定体系')),
        selPreset)),
    panel('参数', h('div', { class: 'controls' }, sE1.el, sE2.el, sC.el, sSlope.el)),
    panel('E–V 曲线（终点在那里？看不清）', A.wrap),
    panel('微分曲线（峰顶就是终点）', B.wrap),
    panel('读数', roHost),
    findHost,
  );

  function render() {
    const { points, deriv, veq } = potentiometricCurve({
      e1: state.e1, e2: state.e2,
      cAnalyte: state.c, vAnalyte: 20, cTitrant: state.c,
      slope: state.slope,
    });
    const vend = endpointFromDerivative(deriv);
    const bias = vend - veq;

    A.chart.xRange = [0, veq * 1.6];
    A.chart.setBands([]);
    A.chart.setVRanges([]);
    A.chart.setMarkers([{ x: veq, color: 'var(--w-teal)', label: '计量点', dash: [5, 3] }]);
    A.chart.setSeries([{
      name: 'E', points: points.map(p => ({ x: p.v, y: p.E })),
      color: 'var(--w-green)', width: 2.2, glow: true, yFormat: v => v.toFixed(0),
    }]);
    A.chart.draw();

    const dMax = Math.max(...deriv.map(d => Math.abs(d.d)), 1);
    B.chart.xRange = [0, veq * 1.6];
    B.chart.yRange = [0, dMax * 1.1];
    B.chart.setBands([]);
    B.chart.setVRanges([]);
    B.chart.setMarkers([{ x: veq, color: 'var(--w-teal)', label: '计量点', dash: [5, 3] }]);
    B.chart.setSeries([{
      name: 'ΔE/ΔV', points: deriv.map(d => ({ x: d.v, y: Math.abs(d.d) })),
      color: 'var(--w-amber)', width: 2, glow: true, yFormat: v => v.toFixed(0),
    }]);
    B.chart.draw();

    const slopePenalty = Math.abs(state.slope - 59.2) / 59.2 * 100;
    roHost.replaceChildren(readouts([
      { k: '真实计量点', v: veq.toFixed(2), unit: 'mL' },
      { k: '微分峰定出终点', v: vend != null ? vend.toFixed(2) : '—', unit: 'mL' },
      { k: '两者之差', v: bias != null ? (bias >= 0 ? '+' : '') + bias.toFixed(2) : '—', unit: 'mL', tone: Math.abs(bias) < 0.05 ? 'good' : 'warn' },
      { k: '电极斜率', v: state.slope.toFixed(1), unit: 'mV/pH', tone: state.slope >= 58 ? 'good' : state.slope >= 54 ? 'warn' : 'bad' },
    ]));

    let msg;
    if (state.slope < 54) {
      msg = `<b>电极斜率只有 ${state.slope.toFixed(1)} mV/pH</b>（理论 59.2）——电极已经老化。` +
        `<br>斜率下降不会让滴定曲线变形，但会让<b>终点判断的灵敏度变差</b>：` +
        `微分峰变矮、变宽，定出的终点容易偏。实际工作中斜率低于 55 就该换电极了。`;
    } else if (Math.abs(bias) < 0.05) {
      msg = `注意看上面那张图——<b>E–V 曲线在计量点附近几乎是平的</b>，靠肉眼根本定不出终点在哪。` +
        `<br>微分之后，ΔE/ΔV 在终点处出现一个<b>尖锐的峰</b>，峰顶位置 ${vend.toFixed(2)} mL 与真实计量点 ` +
        `${veq.toFixed(2)} mL 几乎重合。<br>这就是电位滴定为什么一定要做微分曲线。`;
    } else {
      msg = `微分峰定出的终点 ${vend != null ? vend.toFixed(2) : '—'} mL 与真实计量点 ${veq.toFixed(2)} mL ` +
        `相差 ${Math.abs(bias).toFixed(2)} mL，偏大。可把采样点加密或减小滴定步长。`;
    }
    if (slopePenalty > 1.7 && state.slope >= 54) {
      msg += `<br>另外，电极斜率 ${state.slope.toFixed(1)} mV/pH 略低于理论值 59.2，灵敏度有轻微损失。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    stop() {},
    record() {
      const { deriv, veq } = potentiometricCurve({
        e1: state.e1, e2: state.e2, cAnalyte: state.c, vAnalyte: 20, cTitrant: state.c, slope: state.slope,
      });
      const vend = endpointFromDerivative(deriv);
      return {
        sim: '电位滴定',
        params: [
          `E₁°′ = ${state.e1.toFixed(2)} V，E₂°′ = ${state.e2.toFixed(2)} V`,
          `待测物浓度 ${state.c.toPrecision(2)} mol/L，电极斜率 ${state.slope.toFixed(1)} mV/pH`,
        ],
        readings: [
          `真实计量点 = ${veq.toFixed(2)} mL`,
          `微分峰定出终点 = ${vend != null ? vend.toFixed(2) : '—'} mL`,
        ],
      };
    },
    params() { return { e1: state.e1, e2: state.e2, c: state.c, slope: state.slope }; },
  };
}
