/**
 * 实验二十一：置换法测定镁的摩尔质量。
 *
 * 课件关键页：实验原理与实验步骤（P179-P180）。
 * 量气管中收集的是被水蒸气饱和的湿氢气，必须使用
 * P(H2)=P-P(H2O)；漏斗与量气管水面不同高时还会有静压差。
 */
import { magnesiumMolarMass, magnesiumDuplicate, M_MG } from '../chem.js';
import { h } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  balance, testTube, gasMeasuringTube, retortStand, tubing, thermometer,
  bubbles, CLEAR_COLOR, IRON_POWDER_COLOR,
} from '../glassware.js';

export const meta = {
  id: 'magnesium-molar',
  name: '置换法测定镁的摩尔质量',
  wave: '实验二十一',
  accent: '--w-amber',
  desc: '用湿氢气的体积反推镁的物质的量，专门检验水蒸气分压与水面校平是否真正理解。',
};

const GUIDE = {
  mMg1: 0.0319, vInitial1: 2.00, vFinal1: 35.10,
  mMg2: 0.0321, vInitial2: 1.80, vFinal2: 35.10,
  temperatureC: 25, pressureKPa: 101.325, waterVaporKPa: 3.17,
  waterLevelDeltaCm: 0, vaporCorrection: 0,
};

const DEFAULTS = { ...GUIDE, waterLevelDeltaCm: 0.8, vaporCorrection: 0 };

const CONTROLS = [
  { key: 'mMg1', label: '第 1 份镁带质量', unit: ' g', min: 0.025, max: 0.035, step: 0.0001 },
  { key: 'vInitial1', label: '第 1 份初读数', unit: ' mL', min: 0, max: 5, step: 0.01 },
  { key: 'vFinal1', label: '第 1 份终读数', unit: ' mL', min: 25, max: 40, step: 0.01 },
  { key: 'mMg2', label: '第 2 份镁带质量', unit: ' g', min: 0.025, max: 0.035, step: 0.0001 },
  { key: 'vInitial2', label: '第 2 份初读数', unit: ' mL', min: 0, max: 5, step: 0.01 },
  { key: 'vFinal2', label: '第 2 份终读数', unit: ' mL', min: 25, max: 40, step: 0.01 },
  { key: 'temperatureC', label: '室温', unit: ' °C', min: 15, max: 35, step: 0.1 },
  { key: 'pressureKPa', label: '大气压', unit: ' kPa', min: 95, max: 105, step: 0.001 },
  { key: 'waterVaporKPa', label: '饱和水蒸气压', unit: ' kPa', min: 1, max: 6, step: 0.01 },
  { key: 'waterLevelDeltaCm', label: '水面高度差', unit: ' cm', min: -5, max: 5, step: 0.1 },
  { key: 'vaporCorrection', label: '氢气分压处理', options: ['扣除水蒸气压', '直接用大气压（错误）'] },
];

const STEPS = [
  { name: '称量镁带', op: '称取两份 0.025～0.035 g 镁带，分别记录至 0.0001 g。', why: '质量误差会直接进入摩尔质量；两份平行测定可以检查重复性。', eq: 'm(Mg) = 0.0319 g', calc: '质量范围：0.025～0.035 g；称准至 0.0001 g' },
  { name: '组装并查漏', op: '把反应试管、导管和量气管接好，先检查整套装置气密性。', why: '漏气会让收集到的氢气体积偏小，计算出的摩尔质量偏大。', eq: 'Mg + H₂SO₄ → MgSO₄ + H₂↑', calc: '气密性检查依据：封闭体系受压后液面变化应能保持' },
  { name: '加酸并固定镁带', op: '试管底部加入 5 mL 1 mol·L⁻¹ H₂SO₄，将镁带贴在试管上部内壁，不能提前接触酸。', why: '避免反应在装置尚未密闭时开始，也避免镁带掉入酸中造成操作失控。', eq: 'n(H₂)=n(Mg)', calc: '镁带贴在酸液液面以上，接好导管后再让其落入酸中' },
  { name: '校平并记初读数', op: '调节漏斗，使漏斗与量气管水面同高，记下初始刻度。', why: '水面同高时量气管内气体压强才等于外界大气压；初读数应尽量小于 5.00 mL。', eq: 'P(气体)=P(大气)', calc: 'V(H₂)=V₂−V₁；本模型的初读数精度为 0.01 mL' },
  { name: '反应放氢', op: '轻弹试管使镁带落入酸中，氢气经导管进入量气管。', why: '气泡数量表示宏观产气现象；镁和氢离子按 1:1 计量反应。', eq: 'Mg + 2H⁺ → Mg²⁺ + H₂↑', calc: 'n(H₂)=P(H₂)V(H₂)/(RT)' },
  { name: '冷却至室温', op: '反应完成后静置 4～5 min，待气体温度回到室温再读终读数。', why: '热气体会膨胀，未冷却就读数会使体积偏大，摩尔质量偏小。', eq: 'T = t + 273.15', calc: '温度必须使用热力学温度 K 代入状态方程' },
  { name: '记录终读数', op: '再次校平水面，视线与刻度线同高，读取终刻度。', why: '水面高度差会带来静压差；直接把不平衡的体积代入会产生系统误差。', eq: 'P(H₂)=P−P(H₂O)+ΔP水柱', calc: 'ΔP水柱 = ρgΔh；1 cm 水柱约 0.0981 kPa' },
  { name: '平行测定与验算', op: '重复第二份镁带，比较两次结果并与 Mg 理论摩尔质量 24.305 g·mol⁻¹ 对照。', why: '两次结果接近才能说明装置和读数操作具有重复性。', eq: 'M(Mg)=m(Mg)/n(H₂)', calc: 'n(H₂)=(P−P(H₂O))V/(RT)，理论值 24.305 g·mol⁻¹' },
];

function draw(ctx, W, H, t, i, r, ops) {
  const B = H * 0.88;
  const cx = W / 2;
  ctx.strokeStyle = 'rgba(160,180,196,0.16)';
  ctx.beginPath(); ctx.moveTo(W * 0.06, B); ctx.lineTo(W * 0.94, B); ctx.stroke();
  if (i === -1) {
    retortStand(ctx, { x: cx - 170, y: H * 0.14, w: 120, h: H * 0.70 });
    testTube(ctx, { x: cx - 80, y: B - 125, w: 40, h: 125 }, { liquid: CLEAR_COLOR, level: 0.25 });
    gasMeasuringTube(ctx, { x: cx + 60, y: H * 0.15, w: 64, h: H * 0.67 }, { liquid: [150, 190, 215, 0.25], level: 0.55 });
    return;
  }
  if (i === 0) {
    balance(ctx, { x: cx - 120, y: B - 210, w: 240, h: 210 }, {
      item: true, itemColor: IRON_POWDER_COLOR, itemSize: 0.42, reading: ops.mMg1.toFixed(4), tone: 'good',
    });
    return;
  }
  if (i === 7) {
    balance(ctx, { x: cx - 130, y: B - 170, w: 260, h: 170 }, {
      item: true, itemColor: IRON_POWDER_COLOR, itemSize: 0.25, reading: r.average.toFixed(2), tone: Math.abs(r.average - M_MG) < 0.5 ? 'good' : 'warn',
    });
    return;
  }
  const tube = { x: cx + 50, y: H * 0.13, w: 72, h: H * 0.67 };
  const reaction = i === 4;
  const cooled = i >= 5;
  retortStand(ctx, { x: cx - 205, y: H * 0.14, w: 135, h: H * 0.70 }, {
    clamp: { x: cx - 70, y: H * 0.32, radius: 34 },
  });
  testTube(ctx, { x: cx - 105, y: B - 155, w: 48, h: 155 }, {
    liquid: [150, 205, 214, 0.32], level: i >= 2 ? 0.30 : 0.08,
  });
  if (i >= 2 && i < 5) {
    ctx.save();
    ctx.strokeStyle = IRON_POWDER_COLOR ? 'rgba(150,160,168,0.95)' : 'rgba(150,160,168,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 82, B - 132); ctx.lineTo(cx - 82, B - 112); ctx.stroke();
    ctx.restore();
  }
  tubing(ctx, [[cx - 57, B - 145], [cx + 2, B - 145], [cx + 2, H * 0.20], [cx + 50, H * 0.20]], { width: 5 });
  gasMeasuringTube(ctx, tube, {
    liquid: [150, 190, 215, 0.28], level: i >= 6 ? 0.28 : i >= 3 ? 0.48 : 0.63,
  });
  if (i === 3 || i === 6) {
    ctx.strokeStyle = 'rgba(107,188,87,0.70)';
    ctx.lineWidth = 1.5;
    const y = tube.y + tube.h * (1 - (i === 3 ? 0.48 : 0.28));
    ctx.beginPath(); ctx.moveTo(tube.x - 18, y); ctx.lineTo(tube.x + tube.w + 26, y); ctx.stroke();
  }
  if (reaction) bubbles(ctx, { x: cx - 98, y: B - 145, w: 32, h: 100 }, t, 0.9);
  if (cooled) thermometer(ctx, { x: cx - 10, y: B - 145, w: 20, h: 125 }, {});
}

function readings(i, r, ops) {
  if (i < 3) return [
    { k: '第 1 份质量', v: ops.mMg1.toFixed(4), unit: ' g' },
    { k: '第 2 份质量', v: ops.mMg2.toFixed(4), unit: ' g' },
  ];
  if (i < 7) return [
    { k: '净氢气体积', v: (r.r1.vH2 * 1e6).toFixed(2), unit: ' mL' },
    { k: '氢气分压', v: r.r1.pH2KPa.toFixed(3), unit: ' kPa' },
    { k: '第 1 份 M', v: r.r1.molarMass.toFixed(2), unit: ' g/mol', tone: Math.abs(r.r1.errorPct) < 2 ? 'good' : 'warn' },
  ];
  return [
    { k: '第 1 份 M', v: r.r1.molarMass.toFixed(2), unit: ' g/mol' },
    { k: '第 2 份 M', v: r.r2.molarMass.toFixed(2), unit: ' g/mol' },
    { k: '平均 M', v: r.average.toFixed(2), unit: ' g/mol', tone: Math.abs(r.average - M_MG) < 0.5 ? 'good' : 'warn' },
    { k: '相对误差', v: (((r.average - M_MG) / M_MG) * 100).toFixed(2), unit: '%' },
  ];
}

function species(i, r) {
  if (i < 2) return { title: '反应前的装置', items: [{ label: 'Mg', n: 8, color: '#a0aab2', phase: 'solid' }], note: '镁带先固定在酸液上方' };
  if (i < 5) return {
    title: '气体生成中的粒子',
    items: [
      { label: 'Mg', n: i === 4 ? 3 : 8, color: '#a0aab2', phase: 'solid' },
      { label: 'H⁺', n: 28, color: '#e05a4f' },
      { label: 'Mg²⁺', n: i === 4 ? 9 : 2, color: '#2fb3a3' },
      { label: 'H₂', n: i === 4 ? 16 : 3, color: '#d6e0e7', phase: i === 4 ? '' : 'solid' },
    ],
    note: 'Mg 与 H⁺ 按 1:2 反应，H₂ 以气泡逸出',
  };
  return {
    title: '量气与计算',
    items: [
      { label: 'H₂', n: 24, color: '#d6e0e7' },
      { label: 'H₂O(g)', n: 6, color: '#8bb8d1' },
    ],
    note: '湿氢气 = H₂ + 水蒸气；计算时只取 H₂ 分压',
  };
}

function observation(i, r, ops) {
  if (i === 3) return Math.abs(ops.waterLevelDeltaCm) < 0.05
    ? '漏斗与量气管水面同高，量气管内压强可按大气压处理。'
    : `水面高度差 ${ops.waterLevelDeltaCm.toFixed(1)} cm，已产生 ${r.r1.headCorrectionKPa.toFixed(3)} kPa 静压修正。`;
  if (i === 5) return '气体已冷却到记录温度后再读终刻度，避免热胀造成体积偏大。';
  if (i === 7) return `两次平均摩尔质量 ${r.average.toFixed(2)} g/mol；理论值 ${M_MG.toFixed(3)} g/mol。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.vaporCorrection === 1) out.push(`未扣除水蒸气压：把 ${ops.pressureKPa.toFixed(3)} kPa 直接代入，结果会系统性偏低（第 1 份为 ${r.r1.directAtmosphereMass.toFixed(2)} g/mol）。`);
  if (Math.abs(ops.waterLevelDeltaCm) > 0.2) out.push(`水面未校平：高度差 ${ops.waterLevelDeltaCm.toFixed(1)} cm，量气管内压强不等于大气压。`);
  if (ops.vInitial1 >= 5 || ops.vInitial2 >= 5) out.push('初读数没有控制在 5.00 mL 以下，净体积的相对读数误差会增大。');
  if (Math.abs(r.average - M_MG) > 0.5) out.push(`平均值偏离理论值 ${(r.average - M_MG).toFixed(2)} g/mol，请检查校平、冷却和分压修正。`);
  if (!out.length) out.push('两次测定与 24.305 g/mol 理论值相符；湿气分压、水面校平和冷却读数均处理正确。');
  return out;
}

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE,
    model: ops => {
      const base = p => magnesiumMolarMass({
        mMg: p.mMg, vInitial: p.vInitial, vFinal: p.vFinal,
        temperatureC: p.temperatureC, pressureKPa: p.pressureKPa,
        waterVaporKPa: p.waterVaporKPa, waterLevelDeltaCm: p.waterLevelDeltaCm,
        useWaterVaporCorrection: p.vaporCorrection === 0,
      });
      const r1 = base({ ...ops, mMg: ops.mMg1, vInitial: ops.vInitial1, vFinal: ops.vFinal1 });
      const r2 = base({ ...ops, mMg: ops.mMg2, vInitial: ops.vInitial2, vFinal: ops.vFinal2 });
      const dup = magnesiumDuplicate([r1, r2]);
      return { ...dup, r1, r2 };
    },
    draw, species, observation, verdict, readings,
    equation: 'Mg + H₂SO₄ → MgSO₄ + H₂↑',
    calculation: (i, r) => i >= 7
      ? `n(H₂)=(P−P(H₂O))V/(RT)；平均 M=${r.average.toFixed(2)} g·mol⁻¹`
      : STEPS[i].calc,
    modelNote: '说明：状态方程、分压和水柱静压按物理公式计算；“直接用大气压”与“水面不等高”是故意保留的错误分支，用来显示系统误差方向。',
  });
}
