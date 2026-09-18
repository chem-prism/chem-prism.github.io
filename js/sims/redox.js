/**
 * 模拟器六：氧化还原滴定
 *
 * 教学指向：
 *   · ΔE°′ 决定突跃大小；ΔE°′ < 0.35 V 时无法定量滴定（错题样本 No.26）
 *   · 热力学上「能反应」不等于「能滴定完全」（No.24、No.26）
 *   · 计量点电位不等于任一电对的标准电位
 */

import { redoxCurve, redoxEquivalence, redoxJump, canTitrateRedox } from '../chem.js';
import { Chart } from '../chart.js';
import { ParticleField } from '../views.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'redox',
  name: '氧化还原滴定',
  wave: '620 nm',
  accent: '--w-red',
  desc: '把两个电对的电位差一路调小，看滴定突跃怎么消失——这就是「能反应」和「能滴定」的分界线。',
};

const PRESETS = [
  { label: 'Ce⁴⁺ 滴定 Fe²⁺', e1: 1.44, e2: 0.68, n1: 1, n2: 1 },
  { label: 'KMnO₄ 滴定 Fe²⁺', e1: 1.51, e2: 0.68, n1: 5, n2: 1 },
  { label: 'K₂Cr₂O₇ 滴定 Fe²⁺', e1: 1.33, e2: 0.68, n1: 6, n2: 1 },
  { label: '电位差很小的一对', e1: 1.00, e2: 0.70, n1: 1, n2: 1 },
];

export function mount(root, params = {}) {
  const state = {
    e1: params.e1 != null ? +params.e1 : 1.44,
    e2: params.e2 != null ? +params.e2 : 0.68,
    n1: params.n1 != null ? +params.n1 : 1,
    n2: params.n2 != null ? +params.n2 : 1,
    c: params.c != null ? +params.c : 0.10,
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: 'V(滴定剂) / mL', yLabel: 'E / mV',
    xRange: [0, 40], yRange: [-100, 1600],
    pad: { l: 52, r: 16, t: 14, b: 34 },
  });

  // 微观层：滴定过程中四种型体的此消彼长
  const pcv = h('canvas');
  const field = new ParticleField(pcv);
  const bench = h('div', { class: 'bench single' },
    h('div', { class: 'bench-cell bench-particles' },
      h('div', { class: 'bench-tag' }, '微观层', ' ', h('b', {}, '两种电对的型体')), pcv));

  const roHost = h('div');
  const findHost = h('div');

  const selPreset = h('select', {
    onchange: e => {
      const p = PRESETS[+e.target.value];
      Object.assign(state, { e1: p.e1, e2: p.e2, n1: p.n1, n2: p.n2 });
      sE1.set(p.e1); sE2.set(p.e2); sN1.set(p.n1); sN2.set(p.n2);
      render();
    },
  }, ...PRESETS.map((p, i) => h('option', { value: i }, p.label)));

  const sE1 = slider({
    name: '滴定剂电对 E₁°′', hint: 'V', min: 0.4, max: 1.8, step: 0.01, value: state.e1,
    format: v => v.toFixed(2), onInput: v => { state.e1 = v; selPreset.value = ''; render(); },
  });
  const sE2 = slider({
    name: '待测物电对 E₂°′', hint: 'V', min: 0.1, max: 1.2, step: 0.01, value: state.e2,
    format: v => v.toFixed(2), onInput: v => { state.e2 = v; selPreset.value = ''; render(); },
  });
  const sN1 = slider({
    name: '滴定剂电子数 n₁', min: 1, max: 6, step: 1, value: state.n1,
    format: v => String(v), onInput: v => { state.n1 = v; selPreset.value = ''; render(); },
  });
  const sN2 = slider({
    name: '待测物电子数 n₂', min: 1, max: 6, step: 1, value: state.n2,
    format: v => String(v), onInput: v => { state.n2 = v; selPreset.value = ''; render(); },
  });
  const sC = slider({
    name: '待测物浓度', hint: 'mol/L', min: -3, max: -0.3, step: 0.02,
    value: Math.log10(state.c),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.c = Math.pow(10, v); render(); },
  });

  root.append(
    panel('体系',
      h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '常见滴定体系')),
        selPreset)),
    panel('参数', h('div', { class: 'controls' }, sE1.el, sE2.el, sN1.el, sN2.el, sC.el)),
    panel('滴定曲线', cw),
    panel('型体此消彼长', bench),
    panel('读数', roHost),
    findHost,
  );

  function render() {
    const { e1, e2, n1, n2, c } = state;
    const { points, veq } = redoxCurve({
      e1, e2, n1, n2, cAnalyte: c, vAnalyte: 20, cTitrant: c,
    });
    const eq = redoxEquivalence(e1, e2, n1, n2);
    const jr = redoxJump({ e1, e2, n1, n2 });
    const ok = canTitrateRedox(e1, e2);
    const dE = e1 - e2;

    // y 轴范围随数据自适应，但留出余量
    const ys = points.map(p => p.E);
    const yLo = Math.min(...ys), yHi = Math.max(...ys);
    chart.yRange = [Math.floor((yLo - 60) / 100) * 100, Math.ceil((yHi + 60) / 100) * 100];
    chart.xRange = [0, veq * 2];

    chart.setBands(ok && jr.hasJump ? [{
      lo: jr.lo, hi: jr.hi, color: 'var(--w-green)', alpha: 0.10, label: '突跃范围',
    }] : []);
    chart.setMarkers([{
      x: veq, color: 'var(--w-teal)', label: '化学计量点', dash: [5, 3],
    }]);
    chart.setSeries([{
      name: 'E', points: points.map(p => ({ x: p.v, y: p.E })),
      color: 'var(--w-red)', width: 2.2, glow: true,
      yFormat: v => v.toFixed(0),
    }]);
    chart.draw();

    // 微观层：待测物被氧化、滴定剂被还原，两侧同步变化
    const fMid = 0.5;   // 展示计量点处的代表状态
    const N = 40;
    const nRed2 = Math.round(N * (1 - fMid)), nOx2 = N - nRed2;
    field.set([
      { label: '待测物·还原态', n: nRed2, color: 'var(--w-amber)', r: 4.6 },
      { label: '待测物·氧化态', n: nOx2, color: 'var(--w-teal)', r: 4.6 },
      { label: '滴定剂·还原态', n: nOx2, color: 'var(--w-indigo)', r: 4.6 },
      { label: '滴定剂·氧化态', n: nRed2, color: 'var(--w-red)', r: 4.6 },
    ], '计量点：待测物一半被氧化，滴定剂一半被还原');

    roHost.replaceChildren(readouts([
      { k: 'ΔE°′', v: dE.toFixed(2), unit: 'V', tone: ok ? 'good' : 'bad' },
      { k: '化学计量点电位', v: (eq * 1000).toFixed(0), unit: 'mV' },
      { k: '突跃宽度', v: jr.hasJump ? jr.width.toFixed(0) : '—', unit: jr.hasJump ? 'mV' : '', tone: !jr.hasJump ? 'bad' : (jr.width > 200 ? 'good' : 'warn') },
      { k: '能否定量滴定', v: ok ? '能' : '不能', tone: ok ? 'good' : 'bad' },
    ]));

    let msg;
    if (ok && jr.width > 200) {
      msg = `ΔE°′ = <b>${dE.toFixed(2)} V</b>，两电对相差悬殊，反应完全，突跃宽达 ${jr.width.toFixed(0)} mV。` +
        `化学计量点电位 ${(eq * 1000).toFixed(0)} mV，落在突跃正中——注意它<b>既不等于 E₁°′ 也不等于 E₂°′</b>。`;
    } else if (ok) {
      msg = `ΔE°′ = <b>${dE.toFixed(2)} V</b>，刚好够用（判据是 ≥ 0.35~0.40 V），突跃只有 ${jr.width.toFixed(0)} mV，` +
        `指示剂或电位法的判断要更小心。`;
    } else {
      msg = `ΔE°′ 只有 <b>${dE.toFixed(2)} V</b>，<b>两支曲线根本交叉不上——没有突跃。</b>` +
        `<br>这说明反应虽然热力学上能进行，但进行得不完全（达不到 99.9%），` +
        `终点时仍有可观的反应物剩余，<b>无法用于定量滴定</b>。` +
        `<br>「能反应」和「能滴定完全」是两回事。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();
  requestAnimationFrame(() => field.start());

  return {
    stop() { field.stop(); },
    record() {
      const jr = redoxJump(state);
      const eq = redoxEquivalence(state.e1, state.e2, state.n1, state.n2);
      return {
        sim: '氧化还原滴定',
        params: [
          `E₁°′ = ${state.e1.toFixed(2)} V，E₂°′ = ${state.e2.toFixed(2)} V`,
          `n₁ = ${state.n1}，n₂ = ${state.n2}`,
        ],
        readings: [
          `ΔE°′ = ${(state.e1 - state.e2).toFixed(2)} V`,
          `化学计量点电位 = ${(eq * 1000).toFixed(0)} mV`,
          `突跃宽度 = ${jr.hasJump ? jr.width.toFixed(0) + ' mV' : '无突跃'}`,
          `能否定量滴定：${canTitrateRedox(state.e1, state.e2) ? '能' : '不能'}`,
        ],
      };
    },
    params() { return { e1: state.e1, e2: state.e2, n1: state.n1, n2: state.n2, c: state.c }; },
  };
}
