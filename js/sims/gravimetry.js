/**
 * 模拟器十六：重量分析法（教材 ch09）
 *
 * 教学指向：
 *   · 沉淀形式 ≠ 称量形式：测 Fe 时沉淀是 Fe(OH)₃，灼烧后称量的是 Fe₂O₃
 *   · 换算因数 F 把称量形式的质量换算成待测组分的质量
 *   · 沉淀必须满足：溶解度小、易过滤洗涤、纯度可保证、有确定组成
 *   · 摩尔质量越大，称量相对误差越小——这是选择称量形式的依据之一
 */

import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'gravimetry',
  name: '重量分析法',
  wave: '430 nm',
  accent: '--w-teal',
  desc: '沉淀出来的东西，和最后称的东西，往往不是同一个化合物——换算因数就是这两者之间的桥。',
};

/** 常见测定对象：待测组分、沉淀形式、称量形式、化学计量数 */
const CASES = [
  { analyte: 'Fe', sample: 'Fe(OH)₃', weigh: 'Fe₂O₃', a: 2, b: 1, Ma: 55.85, Mb: 159.69 },
  { analyte: 'Ba', sample: 'BaSO₄', weigh: 'BaSO₄', a: 1, b: 1, Ma: 137.33, Mb: 233.39 },
  { analyte: 'S', sample: 'BaSO₄', weigh: 'BaSO₄', a: 1, b: 1, Ma: 32.06, Mb: 233.39 },
  { analyte: 'Ca', sample: 'CaC₂O₄', weigh: 'CaO', a: 1, b: 1, Ma: 40.08, Mb: 56.08 },
  { analyte: 'Al', sample: 'Al(OH)₃', weigh: 'Al₂O₃', a: 2, b: 1, Ma: 26.98, Mb: 101.96 },
  { analyte: 'Mg', sample: 'MgNH₄PO₄', weigh: 'Mg₂P₂O₇', a: 2, b: 1, Ma: 24.31, Mb: 222.55 },
  { analyte: 'Si', sample: 'SiO₂·xH₂O', weigh: 'SiO₂', a: 1, b: 1, Ma: 28.09, Mb: 60.08 },
  { analyte: 'Cl', sample: 'AgCl', weigh: 'AgCl', a: 1, b: 1, Ma: 35.45, Mb: 143.32 },
  { analyte: 'Ni', sample: 'Ni(C₄H₇N₂O₂)₂', weigh: 'Ni(C₄H₇N₂O₂)₂', a: 1, b: 1, Ma: 58.69, Mb: 288.91 },
];

const STEPS = ['沉淀', '陈化', '过滤', '洗涤', '灼烧', '称量'];

export function mount(root, params = {}) {
  const state = {
    idx: params.c != null ? +params.c : 0,
    mWeigh: params.m != null ? +params.m : 0.5000,
  };

  const flowCv = h('canvas');
  const roHost = h('div');
  const findHost = h('div');

  const sel = h('select', {
    onchange: e => { state.idx = +e.target.value; render(); },
  }, ...CASES.map((c, i) => h('option', { value: i }, `测 ${c.analyte}（称量形式 ${c.weigh}）`)));
  sel.value = String(state.idx);

  const sM = slider({
    name: '称量形式的质量', hint: 'g', min: 0.1, max: 2, step: 0.0001,
    value: state.mWeigh,
    format: v => v.toFixed(4),
    onInput: v => { state.mWeigh = v; render(); },
  });

  root.append(
    panel('测定对象',
      h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '选择待测组分')),
        sel),
      h('div', { style: 'margin-top:14px' }, sM.el)),
    panel('重量分析流程', h('div', { class: 'bench single' },
      h('div', { class: 'bench-cell', style: 'height:150px' },
        h('div', { class: 'bench-tag' }, '宏观层', ' ', h('b', {}, '从沉淀到称量')), flowCv))),
    panel('读数', roHost),
    findHost,
  );

  function drawFlow(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = flowCv.clientWidth, hh = flowCv.clientHeight;
    if (!w || !hh) return;
    if (flowCv.width !== Math.round(w * dpr) || flowCv.height !== Math.round(hh * dpr)) {
      flowCv.width = Math.round(w * dpr); flowCv.height = Math.round(hh * dpr);
    }
    const ctx = flowCv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const pad = 26;
    const stepW = (w - pad * 2) / STEPS.length;
    const cy = hh * 0.42;

    // 流程线
    ctx.strokeStyle = 'rgba(160,180,196,0.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pad, cy); ctx.lineTo(w - pad, cy);
    ctx.stroke();

    STEPS.forEach((s, i) => {
      const x = pad + stepW * (i + 0.5);
      // 第 1 步与第 5 步（沉淀 / 灼烧）用强调色 —— 这两步涉及化学变化
      const key = i === 0 || i === 4;
      ctx.beginPath();
      ctx.arc(x, cy, key ? 11 : 7, 0, Math.PI * 2);
      ctx.fillStyle = key ? 'rgba(47,179,163,0.9)' : 'rgba(160,180,196,0.35)';
      ctx.fill();
      ctx.font = key ? '600 11px "PingFang SC", sans-serif' : '11px "PingFang SC", sans-serif';
      ctx.fillStyle = key ? 'rgba(47,179,163,1)' : 'rgba(160,180,196,0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(s, x, cy + 16);
      if (i < STEPS.length - 1) {
        ctx.strokeStyle = 'rgba(160,180,196,0.3)';
        ctx.beginPath();
        ctx.moveTo(x + (key ? 13 : 9), cy);
        ctx.lineTo(x + stepW - (key ? 13 : 9), cy);
        ctx.stroke();
      }
    });

    // 关键提示：沉淀形式 → 称量形式
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(232,163,61,0.95)';
    ctx.fillText(`沉淀形式 ${c.sample}`, pad + stepW * 0.5, cy - 22);
    ctx.fillStyle = 'rgba(47,179,163,0.95)';
    ctx.fillText(`称量形式 ${c.weigh}`, pad + stepW * 5.5, cy - 22);
    if (c.sample !== c.weigh) {
      ctx.fillStyle = 'rgba(224,90,79,0.9)';
      ctx.fillText('灼烧后组成改变', w / 2, hh - 6);
    } else {
      ctx.fillStyle = 'rgba(120,140,155,0.75)';
      ctx.fillText('沉淀形式与称量形式一致', w / 2, hh - 6);
    }
  }

  function render() {
    const c = CASES[state.idx] || CASES[0];
    // 换算因数 F = (a · M待测) / (b · M称量形式)
    const F = (c.a * c.Ma) / (c.b * c.Mb);
    const mAnalyte = state.mWeigh * F;

    drawFlow(c);

    // 相对误差：称量误差 0.1 mg 带来的相对误差
    const dRel = 0.0001 / state.mWeigh * 100;

    roHost.replaceChildren(readouts([
      { k: '沉淀形式', v: c.sample },
      { k: '称量形式', v: c.weigh, tone: c.sample !== c.weigh ? 'warn' : '' },
      { k: '换算因数 F', v: F.toFixed(4) },
      { k: '称量形式质量', v: state.mWeigh.toFixed(4), unit: 'g' },
      { k: `待测组分 m(${c.analyte})`, v: (mAnalyte * 1000).toFixed(2), unit: 'mg', tone: 'good' },
      { k: '称量相对误差', v: dRel.toFixed(3), unit: '%', tone: dRel < 0.1 ? 'good' : 'warn' },
    ]));

    let msg = `<b>F = ${c.a} × M(${c.analyte}) / （${c.b} × M(${c.weigh})）= ${F.toFixed(4)}</b>` +
      `<br>也就是说，称得 1 g ${c.weigh}，对应 ${F.toFixed(4)} g 的 ${c.analyte}。` +
      `<br>本次称得 ${state.mWeigh.toFixed(4)} g，故 m(${c.analyte}) = ${(mAnalyte * 1000).toFixed(2)} mg。`;

    if (c.sample !== c.weigh) {
      msg += `<br><b>注意：沉淀形式 ${c.sample} 和称量形式 ${c.weigh} 不是同一个化合物。</b>` +
        `灼烧这一步改变了组成——这也是为什么换算因数必须按<b>称量形式</b>来算，而不是沉淀形式。`;
    }
    msg += `<br>称量形式的摩尔质量越大，同样的称量绝对误差带来的相对误差越小。` +
      `这也是为什么测 Mg 时选择称量 Mg₂P₂O₇（M = ${c.Mb}）而不是 MgO（M = 40.30）——大摩尔质量能压低称量误差。`;

    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    stop() {},
    record() {
      const c = CASES[state.idx] || CASES[0];
      const F = (c.a * c.Ma) / (c.b * c.Mb);
      return {
        sim: '重量分析法',
        params: [`待测组分 ${c.analyte}`, `沉淀形式 ${c.sample}，称量形式 ${c.weigh}`, `称得 ${state.mWeigh.toFixed(4)} g`],
        readings: [
          `换算因数 F = ${F.toFixed(4)}`,
          `m(${c.analyte}) = ${(state.mWeigh * F * 1000).toFixed(2)} mg`,
        ],
      };
    },
    params() { return { c: state.idx, m: state.mWeigh }; },
  };
}
