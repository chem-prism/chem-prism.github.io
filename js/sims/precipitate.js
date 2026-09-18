/**
 * 模拟器三：沉淀平衡与分步沉淀
 *
 * 主图展示「使离子开始沉淀所需 Ag⁺ 浓度」随 I⁻ 浓度的变化，
 * 两条曲线的交点即结论反转的位置。
 *
 * 教学指向：
 *   · 「Ksp 小的先沉淀」只在浓度相近时成立（错题样本 No.33）
 *   · 难溶盐类型不同时不能直接比较 Ksp（No.41）
 *   · 沉淀完全不等于浓度为零（No.30）
 */

import { solubility, requiredTitrant } from '../chem.js';
import { Chart, sample } from '../chart.js';
import { ParticleField } from '../views.js';
import { h, panel, readouts, slider, finding, sig } from './common.js';

export const meta = {
  id: 'precipitate',
  name: '沉淀平衡',
  wave: '460 nm',
  accent: '--w-indigo',
  desc: '把 I⁻ 的浓度一路调小，看「Ksp 小的先沉淀」这条规则在什么地方失效。',
};

const KSP_AGCL = 1.8e-10;
const KSP_AGI = 8.5e-17;

export function mount(root, params = {}) {
  const state = {
    cCl: params.ccl != null ? +params.ccl : 0.010,
    cI: params.ci != null ? +params.ci : 0.010,
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: 'lg c(I⁻)', yLabel: 'lg c(Ag⁺) 所需',
    xRange: [-9, -1], yRange: [-18, -4],
    pad: { l: 56, r: 16, t: 14, b: 34 },
  });
  chart.xFormat = v => v.toFixed(1);

  // 微观层：两种阴离子的相对多少 —— 这正是结论反转的原因
  const pcv = h('canvas');
  const field = new ParticleField(pcv);
  const bench = h('div', { class: 'bench single' },
    h('div', { class: 'bench-cell bench-particles' },
      h('div', { class: 'bench-tag' }, '微观层', ' ', h('b', {}, '溶液中的阴离子')), pcv));

  const roHost = h('div');
  const findHost = h('div');

  const sCl = slider({
    name: 'c(Cl⁻)', hint: 'mol/L', min: -4, max: -0.5, step: 0.02,
    value: Math.log10(state.cCl),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.cCl = Math.pow(10, v); render(); },
  });
  const sI = slider({
    name: 'c(I⁻)', hint: 'mol/L', min: -9, max: -0.5, step: 0.02,
    value: Math.log10(state.cI),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.cI = Math.pow(10, v); render(); },
  });

  root.append(
    panel('参数',
      h('div', { class: 'controls' }, sCl.el, sI.el)),
    panel('分步沉淀：谁先开始沉淀？', cw),
    panel('两种阴离子谁多谁少', bench),
    panel('读数', roHost),
    findHost,
  );

  function render() {
    const needCl = requiredTitrant(KSP_AGCL, state.cCl, 1, 1);   // 与 c(I⁻) 无关
    const needI = requiredTitrant(KSP_AGI, state.cI, 1, 1);
    const iFirst = needI < needCl;

    // AgCl 是一条水平线；AgI 随 c(I⁻) 下降而上升
    const lineCl = [{ x: -9, y: Math.log10(needCl) }, { x: -1, y: Math.log10(needCl) }];
    const lineI = sample(-9, -1, 2, lgI => Math.log10(KSP_AGI) - lgI);

    // 交点：lgKsp(AgI) − lg c(I⁻) = lg(needCl)
    const crossX = Math.log10(KSP_AGI) - Math.log10(needCl);

    const markers = [];
    markers.push({ x: Math.log10(state.cI), color: 'var(--w-amber)', label: '当前 I⁻ 浓度', dash: [5, 3] });
    if (crossX > -9 && crossX < -1) {
      markers.push({ x: crossX, color: 'var(--w-red)', label: '结论反转点', dash: [3, 3] });
    }

    // 若学生还没越过反转点，把未探索的那一段轻轻标出来——只提示「那边没试过」，
    // 不说明那边会发生什么，探索仍由学生完成。
    const lgI = Math.log10(state.cI);
    chart.setVRanges(
      (crossX > -9 && crossX < -1 && lgI > crossX)
        ? [{ x0: -9, x1: crossX, color: 'var(--w-red)', alpha: 0.07, label: '← 这一段还没试过' }]
        : []
    );

    chart.setMarkers(markers);
    chart.setSeries([
      {
        name: 'AgCl 所需', points: lineCl, color: 'var(--w-teal)', width: 2, glow: true,
        yFormat: v => v.toFixed(2),
      },
      {
        name: 'AgI 所需', points: lineI, color: 'var(--w-amber)', width: 2, glow: true,
        yFormat: v => v.toFixed(2),
      },
    ]);
    chart.draw();

    // 粒子数按浓度的对数压缩；两者相对多少由各自在图上的位置体现
    const cRef = Math.max(state.cCl, state.cI, 1e-3);
    const nOf = c => c <= 0 ? 0 : Math.max(1, Math.round(2 + (Math.log10(c) - Math.log10(cRef * 1e-6)) / 6 * 46));
    const nCl = Math.min(nOf(state.cCl), 48), nI = Math.min(nOf(state.cI), 48);
    field.set([
      { label: 'Cl⁻', n: nCl, color: 'var(--w-teal)', r: 4.2 },
      { label: 'I⁻', n: nI, color: 'var(--w-amber)', r: 4.2 },
    ], iFirst ? `Cl⁻×${nCl}　I⁻×${nI}` : `I⁻ 只有 ${nI} 个 → 反而需要更高的 Ag⁺`);

    const sAgCl = solubility(KSP_AGCL, 'AB');
    const sAg2CrO4 = solubility(1.1e-12, 'A2B');

    roHost.replaceChildren(readouts([
      { k: '沉淀 Cl⁻ 需 c(Ag⁺)', v: sig(needCl, 2) },
      { k: '沉淀 I⁻ 需 c(Ag⁺)', v: sig(needI, 2) },
      { k: '先沉淀的是', v: iFirst ? 'AgI' : 'AgCl', tone: iFirst ? '' : 'warn' },
      { k: 'AgCl 溶解度', v: sig(sAgCl, 3), unit: 'mol/L' },
      { k: 'Ag₂CrO₄ 溶解度', v: sig(sAg2CrO4, 3), unit: 'mol/L' },
    ]));

    let msg;
    if (iFirst) {
      msg = `此刻 I⁻ 先沉淀，符合「Ksp 小的先沉淀」。但请注意——` +
        `<b>这只是在两种离子浓度相当时的结论。</b>` +
        `<br>把 c(I⁻) 的滑块一路拉到最左端试试：图上标出的那一段，你还没走过。`;
    } else {
      msg = `<b>结论反转了。</b>虽然 Ksp(AgI) 比 Ksp(AgCl) 小 7 个数量级，` +
        `但由于 I⁻ 太稀，让它沉淀反而需要更高的 Ag⁺ 浓度，所以 <b>Cl⁻ 先沉淀</b>。` +
        `<br>正确的判据不是「谁 Ksp 小」，而是<b>「使谁开始沉淀所需的沉淀剂浓度更低」</b>。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  requestAnimationFrame(() => field.start());

  return {
    stop() { field.stop(); },
    record() {
      const needCl = requiredTitrant(KSP_AGCL, state.cCl, 1, 1);
      const needI = requiredTitrant(KSP_AGI, state.cI, 1, 1);
      return {
        sim: '沉淀平衡与分步沉淀',
        params: [`c(Cl⁻) = ${state.cCl.toPrecision(2)} mol/L`, `c(I⁻) = ${state.cI.toPrecision(2)} mol/L`],
        readings: [
          `沉淀 Cl⁻ 需 c(Ag⁺) ≥ ${needCl.toExponential(2)} mol/L`,
          `沉淀 I⁻ 需 c(Ag⁺) ≥ ${needI.toExponential(2)} mol/L`,
          `结论：${needI < needCl ? 'AgI' : 'AgCl'} 先沉淀`,
        ],
      };
    },
    params() { return { ccl: state.cCl, ci: state.cI }; },
  };
}
