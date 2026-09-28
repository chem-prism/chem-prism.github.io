/**
 * 实验四十之二：硫酸亚铁铵中 Fe²⁺ 含量的测定。
 *
 * 课件核心：“三度一点”——温度、酸度、滴定速度和自身指示剂终点。
 * 计量关系按课件反应式计算；操作偏差只用方向性教学模型表达。
 */
import { permanganateStandardization, permanganateFe2Assay, permanganateConditionFactor } from '../chem.js';
import { h } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  balance, conicalFlask, burette, volumetricFlask, pipette, beaker,
  hotplate, thermometer, bubbles, CLEAR_COLOR, MOHR_CRYSTAL_COLOR,
  drawBench,
} from '../glassware.js';

export const meta = {
  id: 'fe2-assay',
  name: '硫酸亚铁铵中 Fe²⁺ 含量',
  wave: '实验四十之二',
  accent: '--w-red',
  desc: '用 KMnO₄ 自身指示终点测定 Fe²⁺，把“三度一点”与计量关系同时做实。',
};

const GUIDE = {
  mNa2C2O4: 0.165, vKMnO4Std: 24.65, Tstd: 75, acidStd: 0.75,
  speedStd: 0, holdStd: 30, mSample: 0.375, speedFe: 0,
  vFe1: 23.90, vFe2: 23.88, vFe3: 23.92,
  acidFe: 0.75, holdFe: 30,
};
const DEFAULTS = {
  ...GUIDE, Tstd: 55, acidStd: 0.35, speedStd: 2, holdStd: 20,
  vFe1: 24.18, vFe2: 24.10, vFe3: 24.25, acidFe: 0.35, holdFe: 20, speedFe: 2,
};
const CONTROLS = [
  { key: 'mNa2C2O4', label: 'Na₂C₂O₄ 质量', unit: ' g', min: 0.16, max: 0.17, step: 0.0001 },
  { key: 'vKMnO4Std', label: '标定消耗 KMnO₄', unit: ' mL', min: 20, max: 30, step: 0.01 },
  { key: 'Tstd', label: '标定温度', unit: ' °C', min: 40, max: 95, step: 1 },
  { key: 'acidStd', label: '标定酸度', unit: ' mol/L', min: 0.2, max: 1.5, step: 0.05 },
  { key: 'speedStd', label: '标定滴定速度', options: ['先慢后快', '一开始过快'] },
  { key: 'holdStd', label: '标定终点保持', unit: ' s', min: 10, max: 40, step: 1 },
  { key: 'mSample', label: '试样质量', unit: ' g', min: 0.35, max: 0.40, step: 0.0001 },
  { key: 'vFe1', label: 'Fe²⁺滴定 1', unit: ' mL', min: 20, max: 28, step: 0.01 },
  { key: 'vFe2', label: 'Fe²⁺滴定 2', unit: ' mL', min: 20, max: 28, step: 0.01 },
  { key: 'vFe3', label: 'Fe²⁺滴定 3', unit: ' mL', min: 20, max: 28, step: 0.01 },
  { key: 'acidFe', label: '测定酸度', unit: ' mol/L', min: 0.2, max: 1.5, step: 0.05 },
  { key: 'speedFe', label: '测定滴定速度', options: ['先慢后快', '一开始过快'] },
  { key: 'holdFe', label: '测定终点保持', unit: ' s', min: 10, max: 40, step: 1 },
];

const STEPS = [
  { name: '配制 KMnO₄', op: '取 0.02 mol·L⁻¹ KMnO₄ 约 30 mL，稀释至约 300 mL。', why: 'KMnO₄ 不是基准物，配好后必须用 Na₂C₂O₄ 标定。', eq: 'c(KMnO₄)≈0.002 mol·L⁻¹', calc: '先配近似浓度，再用基准物求准确浓度' },
  { name: '配制草酸钠标准液', op: '准确称取 0.16～0.17 g Na₂C₂O₄，溶解并定容至 250.00 mL。', why: 'Na₂C₂O₄ 作为基准物，质量和容量瓶体积决定其准确浓度。', eq: 'M(Na₂C₂O₄)=134.00 g·mol⁻¹', calc: '0.165 g / 134.00 / 0.250 L = 0.004925 mol·L⁻¹' },
  { name: '加酸加热', op: '移取 25.00 mL 草酸钠，加硫酸和水，加热至 70～80 ℃。', why: '草酸根与高锰酸根在室温反应太慢；超过 80 ℃又会增加草酸分解风险。', eq: '2MnO₄⁻+5C₂O₄²⁻+16H⁺→2Mn²⁺+10CO₂↑+8H₂O', calc: '适宜温度：70～80 ℃；适宜酸度：0.5～1 mol·L⁻¹' },
  { name: '标定终点', op: '先慢后快滴定，出现微红色并保持 30 s 不褪。', why: 'Mn²⁺生成后会自身催化；KMnO₄ 自身就是指示剂，不另加指示剂。', eq: '2 MnO₄⁻ : 5 C₂O₄²⁻', calc: 'c(KMnO₄)=2n(C₂O₄²⁻)/(5V(KMnO₄))' },
  { name: '配制试样', op: '称取 0.35～0.40 g 莫尔盐，溶解并定容至 100 mL。', why: 'Fe²⁺ 易被空气氧化，溶解后应立即移取并滴定。', eq: 'n(Fe²⁺)=n(莫尔盐)', calc: '每份 25.00 mL 是 100 mL 试样的四分之一' },
  { name: '平行滴定', op: '平行移取三份 25.00 mL，加酸后立即滴定至微红色。', why: '三份读数用来检查重复性；终点保持 30 s 才能避免读数偏小。', eq: 'MnO₄⁻+5Fe²⁺+8H⁺→Mn²⁺+5Fe³⁺+4H₂O', calc: '1 mol MnO₄⁻ 对应 5 mol Fe²⁺' },
  { name: '计算含量', op: '由 KMnO₄ 准确浓度和平均消耗体积计算 Fe²⁺ 质量分数。', why: '含量不是简单看滴定体积，而是要经过稀释倍数和 1:5 化学计量换算。', eq: 'w(Fe²⁺)=m(Fe²⁺)/m(试样)', calc: '纯莫尔盐理论 Fe 质量分数 = 55.845/392.135 = 14.241%' },
  { name: '复核纯度', op: '比较实测 Fe²⁺ 含量与莫尔盐理论值，判断样品是否接近纯品。', why: 'Fe²⁺ 含量、产率和 Fe³⁺ 杂质是不同指标，不能互相替代。', eq: 'w实测 / w理论 × 100%', calc: '默认范例约 14.24%，与理论值一致' },
];

function model(ops) {
  const condition = permanganateConditionFactor({
    temperatureC: ops.Tstd, acidM: ops.acidStd,
    speed: ops.speedStd === 1 ? 2 : 1, endpointHoldS: ops.holdStd,
  });
  const standard = permanganateStandardization({
    mNa2C2O4: ops.mNa2C2O4, vKMnO4: ops.vKMnO4Std,
  });
  const cKMnO4 = standard.cKMnO4 * condition.factor;
  const volumes = [ops.vFe1, ops.vFe2, ops.vFe3];
  const conditionFe = permanganateConditionFactor({
    temperatureC: 75, acidM: ops.acidFe,
    speed: ops.speedFe === 1 ? 2 : 1, endpointHoldS: ops.holdFe,
  });
  const effectiveVolumes = volumes.map(v => v * conditionFe.factor);
  const assays = effectiveVolumes.map(v => permanganateFe2Assay({
    mSample: ops.mSample, cKMnO4, vKMnO4: v,
  }));
  const averageV = effectiveVolumes.reduce((a, b) => a + b, 0) / effectiveVolumes.length;
  const assay = permanganateFe2Assay({
    mSample: ops.mSample, cKMnO4, vKMnO4: averageV,
  });
  const range = Math.max(...effectiveVolumes) - Math.min(...effectiveVolumes);
  return { condition, conditionFe, standard, cKMnO4, assays, assay, volumes,
    effectiveVolumes, averageV, range };
}

function draw(ctx, W, H, t, i, r, ops) {
  const B = drawBench(ctx, W, H);   // 台面线统一在 glassware.js 的 BENCH_Y
  const cx = W / 2;
  if (i === -1) {
    balance(ctx, { x: cx - 130, y: B - 160, w: 120, h: 160 }, { item: true, itemColor: MOHR_CRYSTAL_COLOR, reading: '0.375' });
    volumetricFlask(ctx, { x: cx + 20, y: B - 220, w: 100, h: 220 }, { liquid: CLEAR_COLOR, level: 0.42 });
    return;
  }
  if (i === 0 || i === 1 || i === 4) {
    balance(ctx, { x: cx - 125, y: B - 170, w: 110, h: 170 }, {
      item: true, itemColor: i === 4 ? MOHR_CRYSTAL_COLOR : [220, 220, 220, 0.85],
      reading: i === 4 ? ops.mSample.toFixed(4) : ops.mNa2C2O4.toFixed(4),
    });
    volumetricFlask(ctx, { x: cx + 25, y: B - 225, w: 100, h: 225 }, { liquid: i === 4 ? [110, 196, 188, 0.32] : CLEAR_COLOR, level: 0.48 });
    return;
  }
  if (i === 2) {
    hotplate(ctx, { x: cx - 135, y: B - 65, w: 270, h: 65 }, { heat: 0.8, steam: 0.35, t });
    conicalFlask(ctx, { x: cx - 58, y: B - 220, w: 116, h: 220 }, { liquid: [235, 230, 210, 0.22], level: 0.45 });
    thermometer(ctx, { x: cx + 75, y: B - 205, w: 18, h: 170 }, {});
    return;
  }
  const buretteBox = { x: cx - 66, y: H * 0.04, w: 55, h: H * 0.42 };
  burette(ctx, buretteBox, {
    level: i >= 5 ? 0.42 : 0.18, liquid: [150, 64, 90, 0.40],
  });
  const flask = { x: cx - 52, y: B - 140, w: 104, h: 140 };
  conicalFlask(ctx, flask, { liquid: i >= 5 ? [190, 90, 110, 0.32] : [235, 230, 210, 0.24], level: 0.38 });
  ctx.strokeStyle = 'rgba(150,64,90,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, buretteBox.y + buretteBox.h);
  ctx.lineTo(cx, flask.y + 8);
  ctx.stroke();
  if (i === 3 || i === 5) bubbles(ctx, { x: flask.x + 20, y: flask.y + 35, w: 64, h: 100 }, t, 0.25);
  if (i >= 3) {
    ctx.fillStyle = '#e05a4f'; ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.fillText('微红 30 s', cx + 105, H * 0.20);
  }
}

function species(i, r) {
  if (i < 4) return {
    title: '草酸根标定体系',
    items: [
      { label: 'MnO₄⁻', n: i === 3 ? 3 : 8, color: '#d05a83' },
      { label: 'C₂O₄²⁻', n: i === 3 ? 2 : 14, color: '#d9d9df' },
      { label: 'Mn²⁺', n: i === 3 ? 12 : 1, color: '#2fb3a3' },
    ],
    note: 'Mn²⁺生成后自身催化；微过量 MnO₄⁻ 留下粉红色',
  };
  return {
    title: 'Fe²⁺测定体系',
    items: [
      { label: 'Fe²⁺', n: i >= 6 ? 9 : 22, color: '#2fb3a3' },
      { label: 'Fe³⁺', n: i >= 6 ? 18 : 2, color: '#c8842a' },
      { label: 'MnO₄⁻', n: i >= 6 ? 1 : 4, color: '#d05a83' },
      { label: 'Mn²⁺', n: i >= 6 ? 14 : 2, color: '#9aa7b6' },
    ],
    note: '1 mol MnO₄⁻ 氧化 5 mol Fe²⁺；KMnO₄ 自身指示终点',
  };
}

function readings(i, r) {
  if (i < 3) return [
    { k: 'Na₂C₂O₄', v: r.standard.cOx.toFixed(5), unit: ' mol/L' },
    { k: 'KMnO₄初始浓度', v: '约 0.002', unit: ' mol/L' },
  ];
  if (i < 6) return [
    { k: 'KMnO₄准确浓度', v: r.cKMnO4.toFixed(6), unit: ' mol/L', tone: r.condition.factor > 0.99 ? 'good' : 'warn' },
    { k: '平均体积', v: r.averageV.toFixed(2), unit: ' mL' },
    { k: '平行全距', v: r.range.toFixed(2), unit: ' mL' },
  ];
  return [
    { k: 'Fe²⁺含量', v: (r.assay.massFraction * 100).toFixed(3), unit: '%', tone: Math.abs(r.assay.massFraction - r.assay.theoreticalFeFraction) < 0.001 ? 'good' : 'warn' },
    { k: '理论值', v: (r.assay.theoreticalFeFraction * 100).toFixed(3), unit: '%' },
    { k: '平均体积', v: r.averageV.toFixed(2), unit: ' mL' },
    { k: '平行全距', v: r.range.toFixed(2), unit: ' mL' },
  ];
}

function observation(i, r) {
  if (i === 3) return `标定得到 c(KMnO₄)=${r.cKMnO4.toFixed(6)} mol·L⁻¹；终点由 KMnO₄ 自身的微红色指示。`;
  if (i === 5) return `三次 Fe²⁺滴定平均消耗 ${r.averageV.toFixed(2)} mL，全距 ${r.range.toFixed(2)} mL。`;
  if (i >= 6) return `样品 Fe²⁺ 含量 ${(r.assay.massFraction * 100).toFixed(3)}%，理论值 ${(r.assay.theoreticalFeFraction * 100).toFixed(3)}%。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (r.condition.lowTemperature || r.condition.highTemperature) out.push(`标定温度 ${ops.Tstd} ℃偏离 70～80 ℃，草酸根反应动力学条件不合适。`);
  if (r.condition.lowAcid || r.condition.highAcid) out.push(`标定酸度 ${ops.acidStd} mol/L 偏离 0.5～1 mol/L，可能生成 MnO₂ 或促进草酸分解。`);
  if (r.condition.fastStart) out.push('标定开始滴定过快；起始阶段反应慢，应先慢后快。');
  if (r.condition.endpointTooShort || r.conditionFe.endpointTooShort || ops.holdFe < 30) {
    out.push('终点颜色保持不足 30 s，读数可能偏小。');
  }
  if (r.conditionFe.lowAcid || r.conditionFe.highAcid) {
    out.push(`测定酸度 ${ops.acidFe} mol/L 偏离 0.5～1 mol/L，Fe²⁺滴定条件不合适。`);
  }
  if (r.conditionFe.fastStart) out.push('测定开始滴定过快；接近终点前应先慢后快。');
  if (r.range > 0.04) out.push(`三次平行滴定全距 ${r.range.toFixed(2)} mL > 0.04 mL，应重做平行测定。`);
  if (!out.length) out.push('标定和测定均满足“三度一点”；平行全距合格，Fe²⁺含量与理论值一致。');
  return out;
}

function addTable(host, r) {
  const wrap = h('div', { class: 'lab-table-wrap' });
  const table = h('table', { class: 'lab-table' },
    h('thead', {}, h('tr', {}, h('th', {}, '平行测定'), h('th', {}, 'KMnO₄ / mL'), h('th', {}, 'Fe²⁺质量分数'))),
    h('tbody', {}, ...r.assays.map((a, i) => h('tr', {},
      h('td', {}, `第 ${i + 1} 次`), h('td', {}, r.volumes[i].toFixed(2)),
      h('td', {}, `${(a.massFraction * 100).toFixed(3)}%`)))));
  wrap.append(table); host.append(wrap);
}

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species, observation, verdict,
    equation: 'MnO₄⁻+5Fe²⁺+8H⁺→Mn²⁺+5Fe³⁺+4H₂O',
    calculation: (i, r) => i >= 6
      ? `w(Fe²⁺)=${(r.assay.massFraction * 100).toFixed(3)}%；理论 ${(r.assay.theoreticalFeFraction * 100).toFixed(3)}%`
      : STEPS[i].calc,
    readings, modelNote: '说明：计量关系按课件反应式计算；温度、酸度、速度和终点保持的偏差为方向性教学模型，不代表实测误差。',
    extra: (host, i, r) => { if (i >= 5) addTable(host, r); },
  });
}
