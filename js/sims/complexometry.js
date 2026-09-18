/**
 * 模拟器八：配位滴定曲线
 *
 * 与「EDTA 酸效应」互补：那个讲条件稳定常数怎么随 pH 变，
 * 这个讲条件稳定常数怎么决定滴定曲线与突跃。
 *
 * 教学指向：
 *   · lgK′ 决定突跃大小，判据 lg(c·K′) ≥ 6（错题样本 No.19）
 *   · 金属指示剂必须选在突跃范围内
 *   · 突跃随 lgK′ 减小而变浅直至消失
 */

import { complexCurve, minLgKforTitration, conditionalLgK, METALS, lgAlphaY } from '../chem.js';
import { Chart } from '../chart.js';
import { ParticleField } from '../views.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'complexometry',
  name: '配位滴定',
  wave: '470 nm',
  accent: '--w-teal',
  desc: '条件稳定常数小到一定程度，pM 的突跃就没了——这就是配位滴定能不能做的分界线。',
};

export function mount(root, params = {}) {
  const state = {
    metal: params.metal || 'Ca²⁺',
    ph: params.ph != null ? +params.ph : 12.0,
    c: params.c != null ? +params.c : 0.010,
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: 'V(EDTA) / mL', yLabel: 'pM',
    xRange: [0, 40], yRange: [0, 14],
    pad: { l: 46, r: 16, t: 14, b: 34 },
  });

  // 微观层：三种型体此消彼长
  const pcv = h('canvas');
  const field = new ParticleField(pcv);
  const bench = h('div', { class: 'bench single' },
    h('div', { class: 'bench-cell bench-particles' },
      h('div', { class: 'bench-tag' }, '微观层', ' ', h('b', {}, '金属离子与 EDTA')), pcv));

  const roHost = h('div');
  const findHost = h('div');

  const selMetal = h('select', {
    onchange: e => { state.metal = e.target.value; render(); },
  }, ...METALS.map(m => h('option', { value: m.name }, `${m.name}　lgK = ${m.lgK.toFixed(2)}`)));
  selMetal.value = state.metal;

  const sPh = slider({
    name: '溶液 pH', min: 0, max: 14, step: 0.1, value: state.ph,
    format: v => v.toFixed(1), onInput: v => { state.ph = v; render(); },
  });
  const sC = slider({
    name: '金属离子浓度', hint: 'mol/L', min: -4, max: -0.7, step: 0.02,
    value: Math.log10(state.c),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.c = Math.pow(10, v); render(); },
  });

  root.append(
    panel('参数',
      h('div', { class: 'controls' },
        h('div', { class: 'ctl' },
          h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '金属离子')),
          selMetal),
        sC.el, sPh.el)),
    panel('配位滴定曲线', cw),
    panel('三种型体此消彼长', bench),
    panel('读数', roHost),
    findHost,
  );

  function render() {
    const m = METALS.find(x => x.name === state.metal) || METALS[0];
    const lga = lgAlphaY(state.ph);
    const lgKc = conditionalLgK(m.lgK, state.ph);       // 条件稳定常数
    const need = minLgKforTitration(state.c);           // 判据要求的最低 lgK′
    const ok = lgKc >= need;

    const { points, veq } = complexCurve({
      lgK: lgKc, cMetal: state.c, vMetal: 20, cEDTA: state.c,
    });

    // 突跃：计量点前后 0.1% 的 pM 差
    const at = f => {
      const v = veq * f;
      const vt = 20 + v;
      const CM = (state.c * 20) / vt, CY = (state.c * v) / vt;
      const K = Math.pow(10, lgKc);
      const bb = -(K * (CM + CY) + 1), cc = K * CM * CY;
      const y = (-bb - Math.sqrt(Math.max(bb * bb - 4 * K * cc, 0))) / (2 * K);
      return -Math.log10(Math.max(CM - y, 1e-14));
    };
    const jumpLo = at(0.999), jumpHi = at(1.001);
    const jump = jumpHi - jumpLo;

    chart.xRange = [0, veq * 2];
    chart.yRange = [0, Math.max(14, Math.ceil(jumpHi + 1))];
    chart.setBands(jump > 1 ? [{
      lo: jumpLo, hi: jumpHi, color: 'var(--w-green)', alpha: 0.10, label: '突跃范围',
    }] : []);
    chart.setMarkers([{ x: veq, color: 'var(--w-amber)', label: '化学计量点', dash: [5, 3] }]);
    chart.setSeries([{
      name: 'pM', points: points.map(p => ({ x: p.v, y: p.pM })),
      color: 'var(--w-teal)', width: 2.2, glow: true,
      yFormat: v => v.toFixed(2),
    }]);
    chart.draw();

    // 取计量点处的型体分布作为代表
    const CM = state.c / 2, CY = state.c / 2;
    const K = Math.pow(10, lgKc);
    const bb2 = -(K * (CM + CY) + 1), cc2 = K * CM * CY;
    const my = (-bb2 - Math.sqrt(Math.max(bb2 * bb2 - 4 * K * cc2, 0))) / (2 * K);
    const freeM = Math.max(CM - my, 0), freeY = Math.max(CY - my, 0);
    const toN = c => Math.max(0, Math.round(40 * (c / Math.max(CM, CY))));
    field.set([
      { label: 'M', n: toN(freeM), color: 'var(--w-amber)', r: 4.6 },
      { label: 'Y', n: toN(freeY), color: 'var(--w-green)', r: 4.6 },
      { label: 'MY', n: toN(my), color: 'var(--w-teal)', r: 4.6 },
    ], `计量点附近：已生成 ${toN(my)} 个配合物`);

    roHost.replaceChildren(readouts([
      { k: 'lg α_Y(H)', v: lga.toFixed(2), tone: lga > 6 ? 'bad' : lga > 2 ? 'warn' : 'good' },
      { k: 'lg K′', v: lgKc.toFixed(2), tone: ok ? 'good' : 'bad' },
      { k: '判据要求 lg K′ ≥', v: need.toFixed(2) },
      { k: '能否准确滴定', v: ok ? '能' : '不能', tone: ok ? 'good' : 'bad' },
      { k: '突跃宽度', v: jump > 0 ? jump.toFixed(2) : '—', unit: jump > 1 ? 'pM' : '', tone: jump > 2 ? 'good' : jump > 1 ? 'warn' : 'bad' },
    ]));

    let msg;
    if (!ok) {
      msg = `pH ${state.ph.toFixed(1)} 时 lg K′ 只有 <b>${lgKc.toFixed(2)}</b>，达不到判据要求的 ${need.toFixed(2)}。` +
        `<br>曲线在计量点附近<b>几乎是平的</b>——没有突跃，指示剂无法指示终点。` +
        `<br>原因：pH 偏低，EDTA 被质子化（酸效应），游离 Y⁴⁻ 太少。` +
        `<br>${m.note}，常用条件为 ${m.practical}。`;
    } else if (jump > 2) {
      msg = `lg K′ = <b>${lgKc.toFixed(2)}</b>，突跃宽达 ${jump.toFixed(2)} 个 pM 单位，终点判断很可靠。` +
        `<br>金属指示剂应选<b>变色点落在突跃范围内</b>的——判据是突跃范围，不是随便挑一个。`;
    } else {
      msg = `lg K′ = ${lgKc.toFixed(2)}，刚好达到判据，但突跃只有 ${jump.toFixed(2)} 个 pM 单位，` +
        `<b>终点判断会比较勉强</b>。调高 pH 试试——注意别高到金属离子水解。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();
  requestAnimationFrame(() => field.start());

  return {
    stop() { field.stop(); },
    record() {
      const m = METALS.find(x => x.name === state.metal) || METALS[0];
      const lgKc = conditionalLgK(m.lgK, state.ph);
      return {
        sim: '配位滴定曲线',
        params: [`金属离子：${m.name}`, `pH = ${state.ph.toFixed(1)}`, `c(M) = ${state.c.toPrecision(2)} mol/L`],
        readings: [
          `lg α_Y(H) = ${lgAlphaY(state.ph).toFixed(2)}`,
          `lg K′ = ${lgKc.toFixed(2)}，判据要求 ≥ ${minLgKforTitration(state.c).toFixed(2)}`,
          `能否准确滴定：${lgKc >= minLgKforTitration(state.c) ? '能' : '不能'}`,
        ],
      };
    },
    params() { return { metal: state.metal, ph: state.ph, c: state.c }; },
  };
}
