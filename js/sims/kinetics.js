/**
 * 实验十五：反应级数、速率及活化能的测定。
 *
 * 课件关键点：总体系体积 2.60 mL、Na2S2O3 与 S2O8^2- 的 1:2
 * 计量关系、KNO3/(NH4)2SO4 补足离子强度、过二硫酸铵最后加入。
 * 时间读数是教学标定模型，不是实测动力学数据。
 */
import { Chart } from '../chart.js';
import { kineticRun, kineticOrderFromRuns, arrheniusFit } from '../chem.js';
import { h } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  testTube, beaker, stirPlate, waterBath, thermometer, stopwatch,
  bubbles, CLEAR_COLOR,
} from '../glassware.js';

export const meta = {
  id: 'kinetics',
  name: '反应级数、速率及活化能',
  wave: '实验十五',
  accent: '--w-indigo',
  desc: '用淀粉显蓝的瞬间作计时终点，把浓度、离子强度和温度的影响拆开来看。',
};

const GUIDE = {
  kiVolume: 1.00, persulfateVolume: 1.00, thioVolume: 0.40,
  temperatureC: 25, ionicStrengthFixed: 0, persulfateLast: 0,
  additionDelayS: 0, mixing: 0,
};
const DEFAULTS = {
  ...GUIDE, ionicStrengthFixed: 1, persulfateLast: 1,
  additionDelayS: 4, mixing: 1,
};
const CONTROLS = [
  { key: 'kiVolume', label: 'KI 体积', unit: ' mL', min: 0.25, max: 1, step: 0.25 },
  { key: 'persulfateVolume', label: '(NH₄)₂S₂O₈ 体积', unit: ' mL', min: 0.25, max: 1, step: 0.25 },
  { key: 'thioVolume', label: 'Na₂S₂O₃ 体积', unit: ' mL', min: 0.40, max: 0.40, step: 0.01 },
  { key: 'temperatureC', label: '实测水浴温度', unit: ' °C', min: 20, max: 60, step: 1 },
  { key: 'ionicStrengthFixed', label: '补足总离子强度', options: ['已补足', '未补足（错误）'] },
  { key: 'persulfateLast', label: '过二硫酸铵加入顺序', options: ['最后加入', '未最后加入（错误）'] },
  { key: 'additionDelayS', label: '开始计时延迟', unit: ' s', min: 0, max: 10, step: 1 },
  { key: 'mixing', label: '磁力搅拌', options: ['正常', '偏弱（错误）'] },
];

const STEPS = [
  { name: '准备储备试剂', op: '分别标记 KI、淀粉、Na₂S₂O₃、KNO₃、(NH₄)₂SO₄ 和过二硫酸铵。', why: '分开储备可避免移液枪和试管之间的交叉污染；过二硫酸铵要最后加入。', eq: 'S₂O₈²⁻ + 3I⁻ → 2SO₄²⁻ + I₃⁻', calc: '所有反应体系最后补足到 2.60 mL' },
  { name: '配制预混合液', op: '先把 KI、淀粉、Na₂S₂O₃ 和补盐溶液配好，过二硫酸铵暂不加入。', why: '补盐保持离子强度近似恒定，否则测到的可能是离子强度效应而不是反应级数。', eq: '[S₂O₈²⁻]₀ = 0.20×1.00/2.60', calc: '第 1 组：[S₂O₈²⁻]₀=[I⁻]₀=0.0769 mol·L⁻¹' },
  { name: '快速启动并计时', op: '快速加入过二硫酸铵，同时启动秒表，立即放到垫白纸的磁力搅拌器上。', why: '过二硫酸铵最后加入才能把反应起点定义清楚；白纸提高蓝色终点的可见性。', eq: 'v̄=Δ[S₂O₈²⁻]/Δt', calc: '搅拌必须一致，延迟会让 Δt 产生系统偏差' },
  { name: '蓝色终点', op: 'Na₂S₂O₃ 耗尽的一瞬间，微量 I₃⁻ 使淀粉溶液突然变蓝，停止秒表。', why: '蓝色不是反应开始，而是计时反应中 Na₂S₂O₃ 已耗尽的指示信号。', eq: 'Δ[S₂O₈²⁻]=Δ[S₂O₃²⁻]/2', calc: '第 1 组 Δ[S₂O₃²⁻]=1.538×10⁻³ mol·L⁻¹；Δ[S₂O₈²⁻]=7.69×10⁻⁴ mol·L⁻¹' },
  { name: '浓度系列', op: '固定一方浓度，改变另一方浓度，比较各组 Δt 和平均速率。', why: '固定变量才能把 lg v 对 lg c 的斜率解释为对应反应级数。', eq: 'lg v=m lg[S₂O₈²⁻]+n lg[I⁻]+lg k', calc: '先固定 I⁻ 求 m，再固定 S₂O₈²⁻ 求 n' },
  { name: '拟合反应级数', op: '根据浓度系列的 lg v—lg c 斜率，得到 m、n 和总反应级数。', why: '这是把宏观计时读数转换成符号层速率方程的关键一步。', eq: 'v=k[S₂O₈²⁻]^m[I⁻]^n', calc: '本教学模型标定 m≈1、n≈1' },
  { name: '温度系列', op: '在比室温高 10、20、30 ℃的水浴中分别测定 Δt，温度用温度计校正。', why: '水浴温度必须记录实测值；设定值不等于反应体系的真实温度。', eq: 'k=Ae^(−Eₐ/RT)', calc: '温度一律换成热力学温度 K' },
  { name: '求活化能', op: '以 −lg k 对 1/T 作图，由直线斜率求 Eₐ。', why: '阿仑尼乌斯图把温度对速率常数的影响转成线性关系。', eq: '斜率=Eₐ/(2.303R)', calc: '本教学模型标定 Eₐ≈50 kJ·mol⁻¹' },
];

function model(ops) {
  const run = kineticRun({
    kiVolume: ops.kiVolume, persulfateVolume: ops.persulfateVolume,
    thioVolume: ops.thioVolume, temperatureC: ops.temperatureC,
    ionicStrengthFixed: ops.ionicStrengthFixed === 0,
    persulfateAddedLast: ops.persulfateLast === 0,
    additionDelayS: ops.additionDelayS, mixing: ops.mixing === 0 ? 1 : 0.72,
  });
  const mRuns = [1, 0.5, 0.25].map(v => kineticRun({
    kiVolume: 1, persulfateVolume: v, thioVolume: 0.4,
    ionicStrengthFixed: ops.ionicStrengthFixed === 0,
  }));
  const nRuns = [1, 0.5, 0.25].map(v => kineticRun({
    kiVolume: v, persulfateVolume: 1, thioVolume: 0.4,
    ionicStrengthFixed: ops.ionicStrengthFixed === 0,
  }));
  const tRuns = [25, 35, 45, 55].map(temperatureC => kineticRun({
    kiVolume: 0.5, persulfateVolume: 1, thioVolume: 0.4,
    temperatureC, ionicStrengthFixed: ops.ionicStrengthFixed === 0,
  }));
  const mFit = kineticOrderFromRuns(mRuns);
  const nFit = kineticOrderFromRuns(nRuns, 'cKI');
  const ea = arrheniusFit(tRuns);
  return { run, mRuns, nRuns, tRuns, mFit, nFit, ea, totalOrder: mFit.order + nFit.order };
}

function draw(ctx, W, H, t, i, r) {
  const B = H * 0.88, cx = W / 2;
  ctx.strokeStyle = 'rgba(160,180,196,0.16)';
  ctx.beginPath(); ctx.moveTo(W * 0.06, B); ctx.lineTo(W * 0.94, B); ctx.stroke();
  if (i === -1) {
    for (let n = 0; n < 4; n++) {
      testTube(ctx, { x: cx - 150 + n * 88, y: B - 145, w: 42, h: 145 }, { liquid: CLEAR_COLOR, level: 0.45 });
    }
    return;
  }
  if (i === 0 || i === 1) {
    for (let n = 0; n < 5; n++) {
      testTube(ctx, { x: cx - 180 + n * 90, y: B - 145, w: 42, h: 145 }, {
        liquid: n === 4 ? [160, 110, 200, 0.35] : [150, 190, 215, 0.25], level: 0.34 + n * 0.03,
      });
    }
    return;
  }
  if (i === 6) {
    waterBath(ctx, { x: cx - 160, y: H * 0.42, w: 320, h: B - H * 0.42 }, { steam: 0.45, t, ringW: 190 });
    testTube(ctx, { x: cx - 34, y: H * 0.18, w: 68, h: H * 0.47 }, { liquid: [170, 120, 210, 0.38], level: 0.40 });
    thermometer(ctx, { x: cx + 60, y: H * 0.18, w: 20, h: H * 0.43 }, {});
    return;
  }
  if (i === 7) {
    stopwatch(ctx, { x: cx - 42, y: H * 0.18, w: 84, h: 150 }, {
      text: `${(r.ea.activationEnergy / 1000).toFixed(1)} kJ`,
    });
    return;
  }
  const plate = { x: cx - 120, y: B - 72, w: 240, h: 72 };
  stirPlate(ctx, plate, {});
  testTube(ctx, { x: cx - 34, y: plate.y - 150, w: 68, h: 150 }, {
    liquid: i === 3 ? [88, 126, 208, 0.72] : [150, 190, 215, 0.28],
    level: 0.42,
  });
  if (i === 2) bubbles(ctx, { x: cx - 24, y: B - 188, w: 48, h: 130 }, t, 0.35);
  if (i === 3) {
    ctx.fillStyle = 'rgba(92,130,214,0.75)';
    ctx.font = '600 14px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.fillText('蓝色终点', cx, H * 0.18);
    stopwatch(ctx, { x: cx + 92, y: H * 0.25, w: 80, h: 120 }, { text: `${r.run.time.toFixed(1)} s` });
  }
}

function species(i, r) {
  if (i < 2) return {
    title: '预混合液中的粒子',
    items: [
      { label: 'I⁻', n: 34, color: '#e8a33d' },
      { label: 'S₂O₃²⁻', n: 12, color: '#5c82d6' },
      { label: '淀粉', n: 4, color: '#9c80c7' },
    ],
    note: '过二硫酸根尚未加入，体系还没有启动',
  };
  if (i < 4) return {
    title: i === 3 ? '蓝色终点的粒子' : '反应进行中的粒子',
    items: [
      { label: 'S₂O₈²⁻', n: 12, color: '#d06bca' },
      { label: 'I⁻', n: 28, color: '#e8a33d' },
      { label: 'I₃⁻', n: i === 3 ? 8 : 2, color: '#7b5bc1' },
      { label: 'S₂O₃²⁻', n: i === 3 ? 1 : 10, color: '#5c82d6' },
      { label: '淀粉-I₃⁻', n: i === 3 ? 5 : 1, color: '#5c82d6', phase: 'solid' },
    ],
    note: i === 3 ? 'Na₂S₂O₃ 耗尽，I₃⁻ 与淀粉显蓝' : 'I₃⁻ 被 Na₂S₂O₃ 快速还原，尚未显蓝',
  };
  return {
    title: '数据处理中的粒子',
    items: [
      { label: '反应物浓度', n: 20, color: '#d06bca' },
      { label: '生成 I₃⁻', n: 8, color: '#7b5bc1' },
      { label: '恒定离子强度', n: 16, color: '#6bbc57' },
    ],
    note: '粒子图只表达相对变化；级数和 Eₐ 由符号层拟合',
  };
}

function readings(i, r) {
  if (i < 3) return [
    { k: '[S₂O₈²⁻]₀', v: r.run.cS2O8.toFixed(4), unit: ' mol/L' },
    { k: '[I⁻]₀', v: r.run.cKI.toFixed(4), unit: ' mol/L' },
    { k: '总量', v: '2.60', unit: ' mL' },
  ];
  if (i === 3) return [
    { k: 'Δt', v: r.run.time.toFixed(1), unit: ' s' },
    { k: 'Δ[S₂O₈²⁻]', v: r.run.deltaS2O8.toExponential(3), unit: ' mol/L' },
    { k: '平均速率', v: r.run.rate.toExponential(3), unit: ' mol·L⁻¹·s⁻¹' },
  ];
  if (i < 6) return [
    { k: 'm', v: r.mFit.order.toFixed(2) },
    { k: 'n', v: r.nFit.order.toFixed(2) },
    { k: '总反应级数', v: r.totalOrder.toFixed(2) },
  ];
  return [
    { k: 'Eₐ', v: (r.ea.activationEnergy / 1000).toFixed(1), unit: ' kJ/mol', tone: Math.abs(r.ea.activationEnergy - 50000) < 1000 ? 'good' : 'warn' },
    { k: '参考温度 Δt', v: r.tRuns[0].time.toFixed(1), unit: ' s' },
    { k: '高温 Δt', v: r.tRuns[3].time.toFixed(1), unit: ' s' },
  ];
}

function observation(i, r, ops) {
  if (i === 3) return `淀粉在 ${r.run.time.toFixed(1)} s 时突然变蓝；Δt 只表示 Na₂S₂O₃ 耗尽的计时终点。`;
  if (i === 5) return `拟合得到 m=${r.mFit.order.toFixed(2)}、n=${r.nFit.order.toFixed(2)}；总级数 ${r.totalOrder.toFixed(2)}。`;
  if (i === 7) return `−lg k 对 1/T 的斜率给出 Eₐ=${(r.ea.activationEnergy / 1000).toFixed(1)} kJ·mol⁻¹。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.ionicStrengthFixed !== 0) out.push('没有用 KNO₃/(NH₄)₂SO₄ 补足总离子强度，浓度系列的斜率会混入离子强度影响。');
  if (ops.persulfateLast !== 0) out.push('过二硫酸铵没有最后加入，反应起点不清楚，Δt 不能严格比较。');
  if (ops.additionDelayS > 0) out.push(`启动计时延迟 ${ops.additionDelayS} s，已使教学模型的 Δt 增大。`);
  if (ops.mixing !== 0) out.push('磁力搅拌偏弱，混合不充分会使显蓝终点变宽、重复性变差。');
  if (!out.length) out.push('总离子强度、加料顺序、计时和温度校正均符合要求。');
  return out;
}

function addChart(host, i, r) {
  const wrap = h('div', { class: 'chart-wrap', style: 'height:240px' });
  const canvas = h('canvas'); wrap.append(canvas); host.append(wrap);
  const chart = new Chart(canvas, i < 6 ? {
    xLabel: '浓度 / mol·L⁻¹', yLabel: '平均速率 / mol·L⁻¹·s⁻¹',
    xRange: [0, 0.09], yRange: [0, Math.max(...r.mRuns.concat(r.nRuns).map(x => x.rate)) * 1.15],
  } : {
    xLabel: '1/T / K⁻¹', yLabel: '−lg k',
    xRange: [0.0030, 0.0034], yRange: [0, 6],
  });
  if (i < 6) {
    chart.setSeries([
      { name: '改变 S₂O₈²⁻', points: r.mRuns.map(x => ({ x: x.cS2O8, y: x.rate })), color: 'var(--w-indigo)', width: 2 },
      { name: '改变 I⁻', points: r.nRuns.map(x => ({ x: x.cKI, y: x.rate })), color: 'var(--w-amber)', width: 2 },
    ]);
  } else {
    chart.setSeries([{ name: '阿仑尼乌斯拟合', points: r.tRuns.map(x => ({ x: 1 / x.temperatureK, y: -Math.log10(x.rateConstant) })), color: 'var(--w-green)', width: 2 }]);
  }
  chart.draw();
}

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species, observation, verdict,
    equation: 'S₂O₈²⁻ + 3I⁻ → 2SO₄²⁻ + I₃⁻ ｜ v=k[S₂O₈²⁻]^m[I⁻]^n',
    calculation: (i, r) => i >= 5
      ? `m=${r.mFit.order.toFixed(2)}；n=${r.nFit.order.toFixed(2)}；Eₐ=${(r.ea.activationEnergy / 1000).toFixed(1)} kJ·mol⁻¹`
      : STEPS[i].calc,
    readings, modelNote: '说明：Δt、级数和 Eₐ 的数值由教学标定模型生成，用于练习方向和计算；总体系体积、1:2 计量关系和 Arrhenius 线性化按课件公式。',
    extra: (host, i, r) => { if (i >= 4) addChart(host, i, r); },
  });
}
