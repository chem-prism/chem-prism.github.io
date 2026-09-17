/**
 * 模拟器四：EDTA 酸效应与条件稳定常数
 *
 * 教学指向：
 *   · 判断能否滴定要用条件稳定常数 K′，不是绝对稳定常数 K（错题样本 No.19）
 *   · pH 降低使 EDTA 质子化，配位能力下降（No.20）
 *   · 「标准值」与「实际条件下的值」是两回事（No.25）
 */

import { lgAlphaY, conditionalLgK, canTitrate, minPHfor, METALS } from '../chem.js';
import { Chart, sample } from '../chart.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'edta',
  name: 'EDTA 酸效应',
  wave: '530 nm',
  accent: '--w-green',
  desc: '同一个配合物，为什么换个 pH 就滴不准了？条件稳定常数与 pH 的关系。',
};

export function mount(root, params = {}) {
  const state = {
    metal: params.metal || 'Ca²⁺',
    ph: params.ph != null ? +params.ph : 5.0,
    c: params.c != null ? +params.c : 0.010,
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: 'pH', yLabel: 'lg K′', xRange: [0, 14], yRange: [0, 26],
    pad: { l: 44, r: 16, t: 14, b: 34 },
  });
  chart.xFormat = v => v.toFixed(1);

  const roHost = h('div');
  const findHost = h('div');

  const selMetal = h('select', {
    onchange: e => { state.metal = e.target.value; render(); },
  }, ...METALS.map(m => h('option', { value: m.name }, `${m.name}　lgK = ${m.lgK.toFixed(2)}`)));
  selMetal.value = state.metal;

  const sPh = slider({
    name: '溶液 pH', min: 0, max: 14, step: 0.05, value: state.ph,
    format: v => v.toFixed(2),
    onInput: v => { state.ph = v; render(); },
  });
  const sC = slider({
    name: '金属离子浓度', hint: 'mol/L', min: -4, max: -0.7, step: 0.02,
    value: Math.log10(state.c),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.c = Math.pow(10, v); render(); },
  });
  sPh.el.querySelector('input').addEventListener('input', e => {
    chart.hover = parseFloat(e.target.value); chart.draw();
  });
  chart.onHover = v => {
    state.ph = Math.max(0, Math.min(14, v));
    const inp = sPh.el.querySelector('input');
    inp.value = state.ph;
    sPh.el.querySelector('.ctl-val').textContent = state.ph.toFixed(2);
    updateReadouts();
  };

  root.append(
    panel('参数',
      h('div', { class: 'controls' },
        h('div', { class: 'ctl' },
          h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '金属离子')),
          selMetal),
        sC.el,
        sPh.el)),
    panel('条件稳定常数随 pH 的变化', cw),
    panel('读数', roHost),
    findHost,
  );

  function updateReadouts() {
    const m = METALS.find(x => x.name === state.metal);
    const lga = lgAlphaY(state.ph);
    const lgk = m.lgK;
    const lgc = conditionalLgK(lgk, state.ph);
    const crit = 6 - Math.log10(state.c);
    const ok = canTitrate(lgc, state.c);
    const minPH = minPHfor(m, state.c);

    roHost.replaceChildren(readouts([
      { k: 'lg α_Y(H)　酸效应', v: lga.toFixed(2), tone: lga > 6 ? 'bad' : lga > 2 ? 'warn' : 'good' },
      { k: 'lg K　绝对稳定常数', v: lgk.toFixed(2) },
      { k: 'lg K′　条件稳定常数', v: lgc.toFixed(2), tone: ok ? 'good' : 'bad' },
      { k: '判据 lg(c·K′) ≥ 6', v: (Math.log10(state.c) + lgc).toFixed(2), tone: ok ? 'good' : 'bad' },
      { k: '能否准确滴定', v: ok ? '能' : '不能', tone: ok ? 'good' : 'bad' },
      { k: '理论最低 pH', v: minPH == null ? '—' : minPH.toFixed(2) },
    ]));

    let msg;
    if (ok) {
      msg = `此时 lg K′ = <b>${lgc.toFixed(2)}</b>，满足 lg(c·K′) ≥ 6，${m.name} 可以准确滴定。` +
        `常用条件为 ${m.practical}。${m.note}。`;
    } else {
      msg = `此时 lg K′ 只有 <b>${lgc.toFixed(2)}</b>，远小于查表得到的 lg K = ${lgk.toFixed(2)}。` +
        `差值来自酸效应（lg α_Y(H) = ${lga.toFixed(2)}）——pH 越低，EDTA 被质子化得越厉害，` +
        `游离 Y⁴⁻ 越少。<b>把 pH 调高试试。</b>`;
    }
    findHost.replaceChildren(finding(msg));
  }

  function render() {
    const m = METALS.find(x => x.name === state.metal);
    const crit = 6 - Math.log10(state.c);

    chart.yRange = [0, Math.max(Math.ceil(m.lgK / 4) * 4, crit + 4)];
    const curve = sample(0, 14, 280, ph => conditionalLgK(m.lgK, ph));

    chart.setBands([{
      lo: crit, hi: chart.yRange[1], color: 'var(--w-green)', alpha: 0.07,
      label: `可准确滴定区 lg K′ ≥ ${crit.toFixed(1)}`,
    }]);
    chart.setMarkers([{
      x: state.ph, color: 'var(--w-amber)', label: `当前 pH ${state.ph.toFixed(2)}`, dash: [5, 3],
    }]);
    chart.setSeries([{
      name: 'lg K′', points: curve, color: 'var(--w-green)', width: 2.2,
      glow: true, yFormat: v => v.toFixed(2),
    }]);
    chart.hover = state.ph;
    chart.draw();
    updateReadouts();
  }

  render();

  return {
    record() {
      const m = METALS.find(x => x.name === state.metal);
      const lgc = conditionalLgK(m.lgK, state.ph);
      return {
        sim: 'EDTA 酸效应与条件稳定常数',
        params: [`金属离子：${m.name}`, `pH = ${state.ph.toFixed(2)}`, `c(M) = ${state.c.toPrecision(2)} mol/L`],
        readings: [
          `lg α_Y(H) = ${lgAlphaY(state.ph).toFixed(2)}`,
          `lg K = ${m.lgK.toFixed(2)}　→　lg K′ = ${lgc.toFixed(2)}`,
          `lg(c·K′) = ${(Math.log10(state.c) + lgc).toFixed(2)}，${canTitrate(lgc, state.c) ? '可以' : '不能'}准确滴定`,
        ],
      };
    },
    params() { return { metal: state.metal, ph: state.ph, c: state.c }; },
  };
}
