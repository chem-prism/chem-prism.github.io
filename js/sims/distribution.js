/**
 * 模拟器二：分布分数与缓冲容量
 *
 * 左右两张图对照：
 *   左：分布分数 δ–pH 曲线  —— 只由 pKₐ 决定，与总浓度无关
 *   右：缓冲容量 β–pH 曲线  —— 形状不变，高度正比于总浓度
 *
 * 教学指向：
 *   · 稀释后 δ 不变、β 变小（错题样本 No.7、No.8）
 *   · 缓冲范围由 pKₐ 决定，与浓度无关（No.7）
 *   · 缓冲溶液是「抵抗」变化，不是「消除」变化（No.6）
 */

import { distribution, bufferCapacity } from '../chem.js';
import { Chart, sample } from '../chart.js';
import { ParticleField } from '../views.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'distribution',
  name: '分布分数与缓冲',
  wave: '500 nm',
  accent: '--w-teal',
  desc: '同一物质稀释十倍，分布分数会变吗？缓冲容量呢？两张图并排放在一起看。',
};

export function mount(root, params = {}) {
  const state = {
    pka: params.pka != null ? +params.pka : 4.74,
    c: params.c != null ? +params.c : 0.1,
    ph: params.ph != null ? +params.ph : 5.0,
  };

  const cw1 = h('div', { class: 'chart-wrap' });
  const cv1 = h('canvas'); cw1.append(cv1);
  const cw2 = h('div', { class: 'chart-wrap' });
  const cv2 = h('canvas'); cw2.append(cv2);

  const ch1 = new Chart(cv1, {
    xLabel: 'pH', yLabel: 'δ', xRange: [0, 14], yRange: [0, 1],
    pad: { l: 40, r: 14, t: 12, b: 32 },
  });
  const ch2 = new Chart(cv2, {
    xLabel: 'pH', yLabel: 'β / mol·L⁻¹', xRange: [0, 14], yRange: [0, 0.2],
    pad: { l: 52, r: 14, t: 12, b: 32 },
  });
  ch2.xFormat = v => v.toFixed(1);

  // —— 微观层：两组粒子并排对照 ——
  // 左：当前浓度；右：稀释十倍。两边比例相同、粒子数不同，
  // 这正是「δ 是比例，与总量无关」的直观证明。
  const pcvA = h('canvas');
  const pcvB = h('canvas');
  const fieldA = new ParticleField(pcvA);
  const fieldB = new ParticleField(pcvB);
  const bench = h('div', { class: 'bench' },
    h('div', { class: 'bench-cell bench-particles' },
      h('div', { class: 'bench-tag' }, '微观层', ' ', h('b', {}, '当前浓度')), pcvA),
    h('div', { class: 'bench-cell bench-particles' },
      h('div', { class: 'bench-tag' }, '微观层', ' ', h('b', {}, '稀释 10 倍')), pcvB));

  const roHost = h('div');
  const findHost = h('div');

  const sPka = slider({
    name: 'pKₐ', min: 1, max: 12, step: 0.02, value: state.pka,
    format: v => v.toFixed(2),
    onInput: v => { state.pka = v; render(); },
  });
  const sC = slider({
    name: '总浓度 C', hint: 'mol/L', min: -4, max: 0, step: 0.02,
    value: Math.log10(state.c),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.c = Math.pow(10, v); render(); },
  });
  const sPh = slider({
    name: '溶液 pH', min: 0, max: 14, step: 0.02, value: state.ph,
    format: v => v.toFixed(2),
    onInput: v => { state.ph = v; render(); },
  });

  // 拖动 pH 时同步图上的十字线
  sPh.el.querySelector('input').addEventListener('input', e => {
    ch1.hover = parseFloat(e.target.value); ch1.draw();
    ch2.hover = parseFloat(e.target.value); ch2.draw();
  });

  // 在图上悬停时反向同步滑块
  const syncFromChart = v => {
    state.ph = Math.max(0, Math.min(14, v));
    const inp = sPh.el.querySelector('input');
    inp.value = state.ph;
    sPh.el.querySelector('.ctl-val').textContent = state.ph.toFixed(2);
    updateReadouts();
  };
  ch1.onHover = syncFromChart;
  ch2.onHover = syncFromChart;

  root.append(
    panel('参数',
      h('div', { class: 'controls' }, sPka.el, sC.el, sPh.el)),
    panel('分布分数 δ–pH　（只由 pKₐ 决定）', cw1),
    panel('同一比例，不同总量', bench),
    panel('缓冲容量 β–pH　（高度正比于总浓度）', cw2),
    panel('读数', roHost),
    findHost,
  );

  function updateReadouts() {
    const { dHA, dA } = distribution(state.ph, state.pka);
    const beta = bufferCapacity(state.ph, state.pka, state.c);
    const inRange = Math.abs(state.ph - state.pka) <= 1;
    const maxBeta = bufferCapacity(state.pka, state.pka, state.c);

    // 微观层：左边是当前浓度，右边是稀释 10 倍。
    // δ 完全相同 —— 比例不变，只是分子的总数变少了。
    const N = 36;
    const build = (cVal) => {
      const nHA = Math.round(N * dHA);
      const nA = N - nHA;
      return [
        { label: 'HA', n: nHA, color: 'var(--w-amber)', r: 5 },
        { label: 'A⁻', n: nA, color: 'var(--w-teal)', r: 5 },
      ];
    };
    fieldA.set(build(state.c), `δ(HA)=${dHA.toFixed(2)}`);
    fieldB.set(build(state.c / 10), `δ(HA)=${dHA.toFixed(2)}　← 一模一样`);

    roHost.replaceChildren(readouts([
      { k: 'δ(HA)', v: dHA.toFixed(3) },
      { k: 'δ(A⁻)', v: dA.toFixed(3) },
      { k: '缓冲容量 β', v: beta.toFixed(4), unit: 'mol·L⁻¹' },
      { k: '是否在缓冲范围内', v: inRange ? '是' : '否', tone: inRange ? 'good' : 'bad' },
      { k: '当前缓冲能力', v: `${((beta / maxBeta) * 100).toFixed(0)}%`, tone: beta / maxBeta > 0.6 ? 'good' : 'warn', unit: '（相对最大值）' },
    ]));

    const near = Math.abs(state.ph - state.pka);
    let msg;
    if (near <= 0.35) {
      msg = `pH ≈ pKₐ，此时 δ(HA) ≈ δ(A⁻)，缓冲容量达到<b>最大值</b>。`;
    } else if (inRange) {
      msg = `在缓冲范围内（pKₐ ± 1），缓冲容量为最大值的 ${((beta / maxBeta) * 100).toFixed(0)}%。`;
    } else {
      msg = `已经超出缓冲范围（pKₐ ± 1），缓冲能力很弱。` +
        `注意：缓冲范围由 <b>pKₐ</b> 决定，与浓度无关——调浓度滑块看，这个范围会不会变？`;
    }
    findHost.replaceChildren(finding(msg));
  }

  function render() {
    // 左图：δ 曲线（与浓度无关）
    const d1 = sample(0, 14, 240, ph => distribution(ph, state.pka).dHA);
    const d2 = sample(0, 14, 240, ph => distribution(ph, state.pka).dA);
    ch1.setBands([{ lo: state.pka - 1, hi: state.pka + 1, color: 'var(--w-teal)', alpha: 0.09, label: '缓冲范围 pKₐ±1' }]);
    ch1.setMarkers([{ x: state.pka, color: 'var(--w-teal)', label: 'pKₐ', dash: [4, 3] }]);
    ch1.setSeries([
      { name: 'δ(HA)', points: d1, color: 'var(--w-amber)', width: 2, glow: true, yFormat: v => v.toFixed(3) },
      { name: 'δ(A⁻)', points: d2, color: 'var(--w-teal)', width: 2, glow: true, yFormat: v => v.toFixed(3) },
    ]);
    ch1.hover = state.ph;
    ch1.draw();

    // 右图：β 曲线（高度随浓度变，形状不变）
    const bmax = bufferCapacity(state.pka, state.pka, Math.max(state.c, 0.1));
    ch2.yRange = [0, Math.max(bmax * 1.15, 1e-4)];
    const b1 = sample(0, 14, 240, ph => bufferCapacity(ph, state.pka, state.c));
    ch2.setBands([]);
    ch2.setMarkers([{ x: state.pka, color: 'var(--w-teal)', label: 'pKₐ', dash: [4, 3] }]);
    ch2.setSeries([{
      name: 'β', points: b1, color: 'var(--w-green)', width: 2, glow: true,
      yFormat: v => v.toFixed(4),
    }]);
    ch2.hover = state.ph;
    ch2.draw();

    updateReadouts();
  }

  render();

  requestAnimationFrame(() => { fieldA.start(); fieldB.start(); });

  return {
    stop() { fieldA.stop(); fieldB.stop(); },
    record() {
      const { dHA, dA } = distribution(state.ph, state.pka);
      const beta = bufferCapacity(state.ph, state.pka, state.c);
      return {
        sim: '分布分数与缓冲容量',
        params: [`pKₐ = ${state.pka.toFixed(2)}`, `总浓度 C = ${state.c.toPrecision(2)} mol/L`, `pH = ${state.ph.toFixed(2)}`],
        readings: [
          `δ(HA) = ${dHA.toFixed(3)}，δ(A⁻) = ${dA.toFixed(3)}`,
          `缓冲容量 β = ${beta.toFixed(4)} mol/L`,
        ],
      };
    },
    params() { return { pka: state.pka, c: state.c, ph: state.ph }; },
  };
}
