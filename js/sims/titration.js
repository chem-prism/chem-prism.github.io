/**
 * 模拟器一：酸碱滴定曲线
 *
 * 可调：酸的浓度、强弱；实时显示滴定曲线、化学计量点、突跃范围、指示剂变色带。
 * 教学指向：
 *   · 突跃范围随浓度降低而变窄（错题样本 No.14）
 *   · 指示剂必须选在突跃范围内（No.15）
 *   · 化学计量点 ≠ 滴定终点（No.13）
 */

import {
  titrationCurve, equivalencePH, jumpRange,
  INDICATORS, recommendIndicators,
} from '../chem.js';
import { Chart } from '../chart.js';
import { h, panel, readouts, slider, finding, sig } from './common.js';

export const meta = {
  id: 'titration',
  name: '滴定曲线',
  wave: '580 nm',
  accent: '--w-amber',
  desc: '改变酸的浓度与强弱，看滴定突跃如何变化——以及指示剂为什么必须选在突跃范围内。',
};

export function mount(root, params = {}) {
  const state = {
    pka: params.pka != null ? +params.pka : 4.74,
    strong: params.strong === '1',
    ca: params.c != null ? +params.c : 0.1,
    va: 20,
    showInd: params.ind !== '0',
  };

  const chartWrap = h('div', { class: 'chart-wrap' });
  const canvas = h('canvas');
  chartWrap.append(canvas);

  const roHost = h('div');
  const findHost = h('div');

  const sConC = slider({
    name: '酸的浓度', hint: 'mol/L',
    min: -3, max: -0.3, step: 0.02, value: Math.log10(state.ca),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.ca = Math.pow(10, v); render(); },
  });

  const sPka = slider({
    name: 'pKₐ', hint: '越小酸性越强',
    min: 0, max: 12, step: 0.02, value: state.pka,
    format: v => v.toFixed(2),
    onInput: v => { state.pka = v; render(); },
  });

  const pkaCtl = h('div', {}, sPka.el);

  const selAcid = h('select', {
    onchange: e => {
      state.strong = e.target.value === 'strong';
      pkaCtl.style.display = state.strong ? 'none' : '';
      render();
    },
  },
    h('option', { value: 'weak' }, '弱酸 HA（pKₐ 可调）'),
    h('option', { value: 'strong' }, '强酸（HCl 等）'),
  );
  selAcid.value = state.strong ? 'strong' : 'weak';
  if (state.strong) pkaCtl.style.display = 'none';

  const chkInd = h('input', {
    type: 'checkbox', id: 'chk-ind',
    onchange: e => { state.showInd = e.target.checked; render(); },
  });
  chkInd.checked = state.showInd;

  const chart = new Chart(canvas, {
    xLabel: 'V(NaOH) / mL', yLabel: 'pH',
    xRange: [0, 40], yRange: [0, 14],
    pad: { l: 40, r: 16, t: 14, b: 34 },
  });

  root.append(
    panel('参数',
      h('div', { class: 'controls' },
        h('div', { class: 'ctl' },
          h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '酸的种类')),
          selAcid),
        sConC.el,
        pkaCtl,
        h('div', { class: 'ctl' },
          h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '显示指示剂变色带')),
          h('label', { class: 'btn-row', style: 'cursor:pointer' },
            chkInd, h('span', { style: 'font-size:12.5px;color:var(--dim)' }, '叠加常用指示剂范围'))),
      )),
    panel('滴定曲线', chartWrap),
    panel('读数', roHost),
    findHost,
  );

  function render() {
    const ka = state.strong ? 1e3 : Math.pow(10, -state.pka);
    const { points, veq } = titrationCurve({
      ca: state.ca, va: state.va, cb: state.ca, ka, n: 420,
    });
    const eqPH = equivalencePH(state.ca, state.va, state.ca, ka);
    const jr = jumpRange(state.ca, state.va, state.ca, ka);
    const rec = recommendIndicators(jr);

    chart.setBands(state.showInd
      ? INDICATORS.map(i => ({
        lo: i.lo, hi: i.hi, color: i.color, alpha: 0.11, label: i.name,
      }))
      : []);
    chart.setMarkers([
      { x: veq, color: 'var(--w-teal)', label: '化学计量点', dash: [5, 3] },
    ]);
    chart.setSeries([{
      name: 'pH',
      points: points.map(p => ({ x: p.v, y: p.ph })),
      color: 'var(--accent)',
      width: 2,
      glow: true,
      yFormat: v => v.toFixed(2),
    }]);
    chart.draw();

    const width = jr.hi - jr.lo;
    roHost.replaceChildren(readouts([
      { k: '化学计量点体积', v: veq.toFixed(2), unit: 'mL' },
      { k: '化学计量点 pH', v: eqPH.toFixed(2), tone: Math.abs(eqPH - 7) < 0.3 ? '' : 'warn' },
      { k: '突跃范围', v: `${jr.lo.toFixed(2)} ~ ${jr.hi.toFixed(2)}` },
      { k: '突跃宽度', v: width.toFixed(2), unit: 'pH', tone: width < 1 ? 'bad' : width < 3 ? 'warn' : 'good' },
      { k: '可用的指示剂', v: rec.length ? rec.map(i => i.name).join('、') : '无', tone: rec.length ? 'good' : 'bad' },
    ]));

    // 动态结论
    let msg;
    if (rec.length === 0) {
      msg = `突跃只有 <b>${width.toFixed(2)}</b> 个 pH 单位，比常用指示剂的变色范围还窄，` +
        `没有一种指示剂能可靠地指示终点。<b>把浓度调大，看突跃怎么变。</b>`;
    } else if (state.strong) {
      msg = `强酸强碱滴定，化学计量点 pH = ${eqPH.toFixed(2)}，突跃跨越 ${jr.lo.toFixed(2)} ~ ${jr.hi.toFixed(2)}，` +
        `范围很宽，${rec.map(i => i.name).join('、')}都能用。`;
    } else {
      msg = `弱酸被滴定后生成共轭碱，化学计量点落在<b>碱性区</b>（pH ${eqPH.toFixed(2)}），` +
        `所以突跃也偏向碱性。此时应选 ${rec.map(i => i.name).join('、')}——` +
        `注意：依据是<b>化学计量点附近的突跃范围</b>，不是酸的 pKₐ。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    record() {
      const ka = state.strong ? 1e3 : Math.pow(10, -state.pka);
      const jr = jumpRange(state.ca, state.va, state.ca, ka);
      const eqPH = equivalencePH(state.ca, state.va, state.ca, ka);
      return {
        sim: '酸碱滴定曲线',
        params: [
          `酸：${state.strong ? '强酸' : `弱酸 pKₐ=${state.pka.toFixed(2)}`}`,
          `浓度：${state.ca.toPrecision(2)} mol/L`,
        ],
        readings: [
          `化学计量点 pH = ${eqPH.toFixed(2)}`,
          `突跃范围 = pH ${jr.lo.toFixed(2)} ~ ${jr.hi.toFixed(2)}（宽度 ${(jr.hi - jr.lo).toFixed(2)}）`,
        ],
      };
    },
    params() {
      return {
        c: state.ca, pka: state.pka,
        strong: state.strong ? '1' : '0',
        ind: state.showInd ? '1' : '0',
      };
    },
  };
}
