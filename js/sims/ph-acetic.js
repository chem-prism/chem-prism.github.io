/**
 * 实验 07：pH 法测定 HAc 的电离常数和电离度。
 *
 * 课件核心：c(HAc) 用 NaOH 滴定测准（4 位有效数字），四个稀释系列用 pH 计测 pH；
 * Ka 不随浓度变、α 随稀释增大；pH 是两位有效数字，Ka、α 也只保留两位。
 *
 * 计量式全在 chem.js 的「pH 法测定 HAc」一节，可 node 验算；
 * pH 计读数偏差（斜率、未校准、测量顺序、电极护理）与实测偏差向量
 * 是**教学标定模型**，在本文件 model() 中逐项标注。
 */
import { h, noteAt, pourStream } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  naohStandardization, hacTotalConcentration, weakAcidEquilibrium, dilutionSeries,
  hacReport, phMeterReading,
} from '../chem.js';
import {
  balance, conicalFlask, burette, volumetricFlask, beaker, cylinder,
  reagentBottle, pipette, phMeter, drawBench,
} from '../glassware.js';

export const meta = {
  id: 'ph-acetic',
  name: 'pH 法测醋酸电离常数',
  wave: '实验 07',
  accent: '--w-green',
  desc: 'NaOH 滴定测浓度、pH 计测四个稀释系列的 pH——Ka 应该不随浓度变，α 却要随稀释变大。',
};

const GUIDE = {
  mKHP: 0.5205, vStdMean: 24.91,
  stdOutlier: 0, dissolve: 0, endpointHold: 0,
  vHAcMean: 24.98, hacThird: 0, pipetteRinse: 0,
  calibrated: 0, slopePct: 100.0,
  measureOrder: 0, electrodeCare: 0, kaFormula: 0,
  tempC: 25.0,
};
// 练习模式初值：故意留 4 处不规范——设备（斜率）、操作（顺序、电极护理）、报告（公式）
const DEFAULTS = {
  ...GUIDE,
  slopePct: 93.0,      // 校准了但斜率不合格（<95%）
  measureOrder: 1,     // 由浓到稀测 pH
  electrodeCare: 1,    // 纯水洗后不吸干
  kaFormula: 1,        // 用近似式 Ka=[H⁺]²/c
};
const CONTROLS = [
  { key: 'mKHP', label: '基准物邻苯二甲酸氢钾质量', unit: ' g', min: 0.4, max: 0.6, step: 0.0001 },
  { key: 'vStdMean', label: '标定中间一份耗 NaOH', unit: ' mL', min: 23, max: 27, step: 0.01 },
  { key: 'dissolve', label: '基准物溶解情况', options: ['完全溶解后滴定', '未完全溶解（错误）'] },
  { key: 'endpointHold', label: '终点判读', options: ['保持半分钟不褪后读数', '见微红立即读数（错误）'] },
  { key: 'stdOutlier', label: '标定第三份', options: ['正常平行', '明显偏大 +0.20 mL（试做 Q 检验）'] },
  { key: 'vHAcMean', label: 'HAc 滴定中间一份耗 NaOH', unit: ' mL', min: 23, max: 27, step: 0.01 },
  { key: 'hacThird', label: 'HAc 第三份', options: ['正常平行', '偏大 +0.06 mL（极差超限）'] },
  { key: 'pipetteRinse', label: '移液管润洗', options: ['待吸液润洗 2~3 次', '未润洗（错误）'] },
  { key: 'calibrated', label: 'pH 计校准', options: ['已用 6.86 / 4.00 两点校准', '未校准（错误）'] },
  { key: 'slopePct', label: '电极斜率（校准显示）', unit: ' %', min: 90, max: 105, step: 0.1 },
  { key: 'measureOrder', label: 'pH 测量顺序', options: ['由稀到浓（正确）', '由浓到稀（错误）'] },
  { key: 'electrodeCare', label: '电极处理', options: ['纯水洗净、碎滤纸吸干', '纯水洗后不吸干（错误）', '不洗直接测（错误）'] },
  { key: 'kaFormula', label: 'Ka 计算口径', options: ['精确式 Ka=[H⁺]²/(c−[H⁺])', '近似式 Ka=[H⁺]²/c'] },
  { key: 'tempC', label: '室温（记录）', unit: ' °C', min: 18, max: 30, step: 0.5 },
];

const STEPS = [
  {
    name: '配制 NaOH 溶液',
    op: '用量筒量取 15 mL 2 mol·L⁻¹ NaOH，稀释至 300 mL，充分摇匀，配在塑料试剂瓶中。',
    why: '粗略配制即可——准确浓度靠邻苯二甲酸氢钾标定；装塑料瓶是因为碱液会缓慢侵蚀玻璃。',
    eq: 'c(NaOH) ≈ 0.1 mol·L⁻¹（名义值，待标定）',
    calc: '15 × 2 ÷ 300 = 0.10 mol·L⁻¹',
  },
  {
    name: '称取并溶解基准物',
    op: '减量法称取 0.4***～0.6000 g 邻苯二甲酸氢钾 ×3 份于 250 mL 锥形瓶，加 40～50 mL 水，振荡使之完全溶解，各加 2 滴酚酞。',
    why: '必须完全溶解再滴定——没溶完的固体在滴定中继续溶解，终点会反复回褪。邻苯二甲酸氢钾不含结晶水、不吸水、摩尔质量大，是标定碱的基准物。',
    eq: 'KHC₈H₄O₄ + NaOH → KNaC₈H₄O₄ + H₂O（1:1）',
    calc: '0.5205 g ÷ 204.22 g·mol⁻¹ = 2.549×10⁻³ mol',
  },
  {
    name: '标定滴定',
    op: '滴定管先润洗、排气泡、调零；用待标定 NaOH 滴至微红色并保持半分钟不褪。平行三份。',
    why: '★ 终点是「半分钟不褪」——久置褪色是溶液吸收了空气中的 CO₂，不是「刚才的终点不真」（课件思考题 3）。c(NaOH) 要保留 4 位有效数字。',
    eq: '酚酞：无色 → 微红（变色范围 pH 8.2～10）',
    calc: 'c(NaOH) = m(KHP)/M(204.22) ÷ (V/1000)；范例 0.5205 g、24.90~24.93 mL → 0.1023 mol·L⁻¹',
  },
  {
    name: '移取 HAc 试样',
    op: '用干燥烧杯取 200 mL 0.1 mol·L⁻¹ HAc；移液管（先润洗 2～3 次）移取 3 份 25.00 mL 于 250 mL 锥形瓶，各加 2 滴酚酞。',
    why: '移液管必须用待吸液润洗——残留的水会把 HAc 稀释，测出的总浓度偏低，后面所有浓度都跟着偏。',
    eq: 'HAc + NaOH → NaAc + H₂O（1:1）',
    calc: 'c(HAc) = c(NaOH) × V(NaOH) ÷ 25.00',
  },
  {
    name: '滴定 HAc 总浓度',
    op: '用 NaOH 标准溶液滴至微红色半分钟不褪，读数保留至 0.01 mL；三份极差应 < 0.04 mL。',
    why: '极差 <0.04 mL 是平行性判据；c(HAc) 保留 4 位有效数字，它是后面所有稀释浓度换算的基准。',
    eq: '酚酞：无色 → 微红',
    calc: '0.1023 × 24.98 ÷ 25.00 = 0.1022 mol·L⁻¹',
  },
  {
    name: '稀释系列',
    op: '吸量管分别移取 5.00、10.00、25.00 mL HAc 于三个 50 mL 容量瓶，纯水稀释至刻度、摇匀，得约 0.01、0.02、0.05 mol·L⁻¹ 三份；加原液共 4 份。',
    why: '容量瓶定容的稀释倍数（10/5/2 倍）是准确的；浓度按标定出的 c(HAc) 精确计算——「约 0.01」那个名义值不能用，要写成 0.01022 这样的 4 位有效数字。',
    eq: 'c = c(HAc) × V(移取) ÷ 50.00',
    calc: '5.00 × 0.1022 ÷ 50.00 = 0.01022 mol·L⁻¹',
  },
  {
    name: '两点校准 pH 计',
    op: '开机选 4.00 / 6.86 / 9.18 系列与自动终点方式；电极先测 pH 6.86 缓冲液、洗净后再测 pH 4.00，显示斜率 95%～105% 才算校准合格。',
    why: 'E = K − 0.0591pH 里的 K 每次测定都在漂，必须用标准缓冲液现场「两点定线」；斜率反映电极状态——超范围说明电极老化，读数不可信。',
    eq: 'E = K − 0.0591 pH（25 ℃；斜率合格区间 95%～105%）',
    calc: '斜率 = S实测 ÷ 59.2 mV/pH × 100%',
  },
  {
    name: '由稀到浓测 pH',
    op: '电极用纯水洗净、碎滤纸吸干（不可用力擦），按 0.01 → 0.02 → 0.05 → 0.1 依次测定，玻璃泡全部浸没，记录室温。',
    why: '★ 由稀到浓：电极上残留的稀溶液对下一份浓溶液影响小；反过来，一滴 0.1 mol·L⁻¹ 的残留进 0.01 mol·L⁻¹ 样品就是 1% 的污染。纯水洗后必须吸干——水膜会稀释样品，读数偏高。',
    eq: '[H⁺] = 10^(−pH)',
    calc: '记录到 0.01（课件示例：3.35、3.21、3.02、2.86）',
  },
  {
    name: '计算 Ka 与 α',
    op: '由各份 pH 算 [H⁺]；Ka = [H⁺]²/(c−[H⁺])，α = [H⁺]/c，逐份计算并求 Ka 均值。',
    why: '★ pH 是两位有效数字（首数 3 是 10 的方次，不是有效数字）——Ka 和 α 也只保留两位。近似式 Ka=[H⁺]²/c 忽略已电离的部分，越稀偏差越大（0.01 处约偏低 4%）。',
    eq: 'Ka = [H⁺]²/(c−[H⁺])；α = [H⁺]/c',
    calc: 'pH 3.35 → [H⁺]=4.5×10⁻⁴；Ka=2.0×10⁻⁵、α=0.044',
  },
  {
    name: '与教材值比较并讨论',
    op: 'Ka 均值与教材 20 ℃ 值（1.75~1.8×10⁻⁵）比较、算相对误差；讨论 α 随浓度的变化规律和 Ka 的准确度。',
    why: '★ 结论：α 随稀释增大（0.044 → 0.014），Ka 在四个浓度上基本一致——「Ka 是常数、α 不是」的证据。稀样品里 [H⁺] 的相对误差被放大，中间浓度往往测得更准。',
    eq: '相对误差 = (Ka均值 − 教材值) ÷ 教材值 × 100%',
    calc: 'Ka 均值 1.9×10⁻⁵ vs 1.78×10⁻⁵ → +7.7%',
  },
];

/** 三份平行读数相对中间一份的固定离差 / mL（标定与 HAc 滴定各一组） */
const STD_OFFSET = [-0.01, 0.00, 0.02];
const HAC_OFFSET = [-0.01, 0.00, 0.01];

/**
 * pH 实测 − 理论 的偏差向量（0.01 → 0.1 mol/L 四份）——
 * **取自课件 P29 示例表本身**：理论 3.38/3.23/3.02/2.87，表上实测 3.35/3.21/3.02/2.86。
 * 它让教学模式逐位复现 P29（再用 pH 反算 Ka = 2.0/1.9/1.8/1.9×10⁻⁵，与该表自洽）。
 */
const DEV_PH = [-0.03, -0.02, 0.00, -0.01];

function model(ops) {
  // —— 标定 ——
  let stdVolumes = STD_OFFSET.map(d => ops.vStdMean + d);
  if (ops.stdOutlier === 1) stdVolumes = stdVolumes.map((v, k) => (k === 2 ? v + 0.20 : v)); // 第三份多滴 0.20 mL
  if (ops.dissolve === 1) stdVolumes = stdVolumes.map(v => v * 0.995);      // 未溶完：第一次微红就读 → 偏小（教学模型）
  if (ops.endpointHold === 1) stdVolumes = stdVolumes.map(v => v * 0.997);  // 提前读数 → 偏小（教学模型）
  const std = naohStandardization({ mKHP: ops.mKHP, volumes: stdVolumes });
  // Q 值检验（课件报告要求：n=3 临界 0.94；对「测定数字」即浓度做检验）——
  // 达到舍弃标准时按保留值重算 c(NaOH)，并提示应补做一份。
  let cNaOH = std.cMean;
  const rejected = std.q ? std.q.shouldReject : false;
  if (rejected) {
    const kept = std.c.filter(v => v !== std.q.outlier);
    cNaOH = kept.reduce((a, b) => a + b, 0) / kept.length;
  }

  // —— HAc 总浓度 ——
  let hacBias = 1;
  if (ops.pipetteRinse === 1) hacBias *= 0.996;       // 未润洗：残留水稀释 → 滴定体积偏小（教学模型）
  if (ops.endpointHold === 1) hacBias *= 0.997;
  const hacVolumes = HAC_OFFSET.map(d => (ops.vHAcMean + d) * hacBias);
  if (ops.hacThird === 1) hacVolumes[2] += 0.06;      // 第三份滴过了半滴多 → 极差 ≥0.04 判据演示
  const hac = hacTotalConcentration({ cNaOH, volumes: hacVolumes });

  // —— 稀释系列 + 实测 pH ——
  const cs = dilutionSeries({ c0: hac.cMean });
  const phMeasured = cs.map((c, k) => {
    const theory = weakAcidEquilibrium({ c }).ph;
    let sig = theory + DEV_PH[k];
    // ⚠️ 以下偏差项都是方向性教学标定模型（依据见 STEPS[7].why 与课件注意事项）
    if (ops.measureOrder === 1) sig += [-0.09, -0.06, -0.03, 0][k];       // 由浓到稀：残留浓液污染稀样
    if (ops.electrodeCare === 1) sig += 0.04;                             // 水膜稀释样品 → 读数偏高
    if (ops.electrodeCare === 2) {
      sig += ops.measureOrder === 1 ? [-0.03, -0.02, -0.01, 0][k] : [0, 0.01, 0.01, 0.01][k];  // 不洗直接测
    }
    const meter = phMeterReading({ phTrue: sig, slopePct: ops.slopePct, calibrated: ops.calibrated === 0 });
    return Number(meter.read.toFixed(2));             // 记录到 0.01，后续运算用记录值（课件口径）
  });

  const report = hacReport({ cHAc: hac.cMean, phMeasured, approx: ops.kaFormula === 1 });
  const slopeOk = ops.slopePct >= 95 && ops.slopePct <= 105;
  return {
    std, hac, cNaOH, rejected, stdVolumes, hacVolumes,
    cs, phMeasured, report, slopeOk,
  };
}

/* ---------- 宏观层 ---------- */

const PINK_END = [232, 178, 198, 0.42];      // 酚酞微红（课件：半分钟不褪）
const CLEAR = [225, 232, 238, 0.20];

function flaskLabel(ctx, box, text, color) {
  ctx.save();
  ctx.font = '10px "PingFang SC", sans-serif';
  ctx.fillStyle = color || 'rgba(160,180,196,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, box.x + box.w / 2, box.y + box.h + 8);
  ctx.restore();
}


function draw(ctx, W, H, t, i, r, ops) {
  const B = drawBench(ctx, W, H);
  const cx = W / 2;

  if (i === -1) {
    phMeter(ctx, { x: cx - 195, y: B - 225, w: 165, h: 225 }, { reading: '——', bulbY: B - 60 });
    beaker(ctx, { x: cx - 90, y: B - 118, w: 88, h: 118 }, { liquid: CLEAR, level: 0.5 });
    volumetricFlask(ctx, { x: cx + 60, y: B - 200, w: 86, h: 200 }, { liquid: CLEAR, level: 0.45 });
    return;
  }
  if (i === 0) {
    cylinder(ctx, { x: cx - 96, y: B - 150, w: 54, h: 150 }, { liquid: [222, 232, 240, 0.25], level: 0.16 });
    reagentBottle(ctx, { x: cx + 20, y: B - 155, w: 56, h: 155 },
      { liquid: [222, 232, 240, 0.22], level: 0.72, label: ['NaOH', '≈0.1 M'] });
    noteAt(ctx, cx - 96, B - 168, '量取 15 mL 2 M NaOH');
    return;
  }
  if (i === 1) {
    balance(ctx, { x: cx - 150, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: [230, 230, 226, 0.85], reading: ops.mKHP.toFixed(4) });
    conicalFlask(ctx, { x: cx - 20, y: B - 140, w: 100, h: 140 }, { liquid: CLEAR, level: 0.36 });
    noteAt(ctx, cx + 94, B - 120, '×3 份');
    return;
  }
  if (i === 2) {
    const buretteBox = { x: cx - 28, y: H * 0.03, w: 56, h: H * 0.40 };
    burette(ctx, buretteBox, { level: 0.42, liquid: [200, 210, 220, 0.30] });
    const flask = { x: cx - 54, y: B - 145, w: 108, h: 145 };
    conicalFlask(ctx, flask, { liquid: PINK_END, level: 0.42 });
    pourStream(ctx, { x: cx, y: buretteBox.y + buretteBox.h }, { x: cx, y: flask.y + 8 },
      { color: [160, 180, 196], alpha: 0.5, width: 3, t });
    reagentBottle(ctx, { x: cx + 66, y: B - 112, w: 36, h: 112 },
      { shape: 'drop', liquid: [214, 90, 160, 0.5], level: 0.5, label: ['酚酞'] });
    noteAt(ctx, 14, 40, '微红 半分钟不褪', '#d16ba5');
    return;
  }
  if (i === 3) {
    beaker(ctx, { x: cx - 158, y: B - 132, w: 118, h: 132 }, { liquid: CLEAR, level: 0.62 });
    flaskLabel(ctx, { x: cx - 158, y: B - 132, w: 118, h: 132 }, 'HAc（200 mL）');
    pipette(ctx, { x: cx - 10, y: B - 150, w: 120, h: 26 }, { angle: -0.55 });
    conicalFlask(ctx, { x: cx + 40, y: B - 140, w: 96, h: 140 }, { liquid: CLEAR, level: 0.30 });
    noteAt(ctx, cx - 158, B - 152, '移液管润洗 2~3 次');
    return;
  }
  if (i === 4) {
    const buretteBox = { x: cx - 28, y: H * 0.03, w: 56, h: H * 0.40 };
    burette(ctx, buretteBox, { level: 0.46, liquid: [200, 210, 220, 0.30] });
    const flask = { x: cx - 54, y: B - 145, w: 108, h: 145 };
    conicalFlask(ctx, flask, { liquid: PINK_END, level: 0.42 });
    pourStream(ctx, { x: cx, y: buretteBox.y + buretteBox.h }, { x: cx, y: flask.y + 8 },
      { color: [160, 180, 196], alpha: 0.5, width: 3, t });
    reagentBottle(ctx, { x: cx + 66, y: B - 112, w: 36, h: 112 },
      { shape: 'drop', liquid: [214, 90, 160, 0.5], level: 0.5, label: ['酚酞'] });
    noteAt(ctx, 14, 40, '三份极差 < 0.04 mL', 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 5) {
    const boxes = [
      { x: cx - 150, y: B - 165, w: 76, h: 165 },
      { x: cx - 60, y: B - 165, w: 76, h: 165 },
      { x: cx + 30, y: B - 165, w: 76, h: 165 },
    ];
    boxes.forEach((bx, k) => {
      volumetricFlask(ctx, bx, { liquid: CLEAR, level: 0.55 });
      flaskLabel(ctx, bx, `${r.cs[k].toFixed(5)} M`);
    });
    noteAt(ctx, 14, 40, '5.00 / 10.00 / 25.00 mL → 50 mL 容量瓶（原液另计）');
    return;
  }
  if (i === 6) {
    const mBox = { x: cx - 200, y: B - 230, w: 165, h: 230 };
    phMeter(ctx, mBox, { reading: '6.86', slopePct: ops.slopePct, bulbY: B - 44 });
    reagentBottle(ctx, { x: cx - 92, y: B - 108, w: 46, h: 108 },
      { liquid: [222, 232, 240, 0.22], level: 0.6, label: ['pH 6.86'] });
    reagentBottle(ctx, { x: cx - 36, y: B - 108, w: 46, h: 108 },
      { liquid: [222, 232, 240, 0.22], level: 0.6, label: ['pH 4.00'] });
    if (!r.slopeOk) noteAt(ctx, 14, 40, `斜率 ${ops.slopePct.toFixed(1)}% 超出 95%~105%，校准不合格`, '#e05a4f');
    else noteAt(ctx, 14, 40, `两点校准：6.86 → 4.00，斜率 ${ops.slopePct.toFixed(1)}% 合格`, 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 7) {
    const mBox = { x: cx - 200, y: B - 230, w: 165, h: 230 };
    phMeter(ctx, mBox, { reading: r.phMeasured[0].toFixed(2), bulbY: B - 52 });
    beaker(ctx, { x: cx - 104, y: B - 118, w: 88, h: 118 }, { liquid: CLEAR, level: 0.52 });
    flaskLabel(ctx, { x: cx - 104, y: B - 118, w: 88, h: 118 }, `${r.cs[0].toFixed(5)} M HAc（第一份）`);
    noteAt(ctx, 14, 40, '由稀到浓：0.01 → 0.02 → 0.05 → 0.10');
    if (ops.electrodeCare !== 0) noteAt(ctx, 14, 58, '电极处理不规范', '#e05a4f');
    return;
  }
  // i === 8 / 9：四份样品的 pH「结果墙」
  const boxes = [
    { x: cx - 156, y: B - 92, w: 68, h: 92 },
    { x: cx - 80, y: B - 92, w: 68, h: 92 },
    { x: cx - 4, y: B - 92, w: 68, h: 92 },
    { x: cx + 72, y: B - 92, w: 68, h: 92 },
  ];
  boxes.forEach((bx, k) => {
    beaker(ctx, bx, { liquid: CLEAR, level: 0.5 });
    ctx.save();
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(160,180,196,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(r.phMeasured[k].toFixed(2), bx.x + bx.w / 2, bx.y - 6);
    ctx.restore();
    flaskLabel(ctx, bx, `${r.cs[k].toFixed(5)} M`);
  });
  if (i === 9) {
    noteAt(ctx, 14, 40, `Ka 均值 ${sup10(r.report.kaMean)} vs 教材 1.78×10⁻⁵（相对误差 ${r.report.relErrPct >= 0 ? '+' : ''}${r.report.relErrPct.toFixed(1)}%）`);
  } else {
    noteAt(ctx, 14, 40, 'pH 即测得值（记录到 0.01）——Ka、α 由它反算');
  }
}

/* ---------- 微观层 ---------- */

function species(i, r) {
  if (i === 0) return {
    title: '配制 NaOH 溶液',
    items: [
      { label: 'H₂O', n: 24, color: '#d6e0e7' },
      { label: 'Na⁺', n: 5, color: '#c8842a' },
      { label: 'OH⁻', n: 5, color: '#d16ba5' },
    ],
    note: 'NaOH 是强碱、完全电离——但「完全电离」不等于「浓度准确」：称量和稀释都只是粗略的，所以要标定。',
  };
  if (i === 1) return {
    title: '溶解基准物',
    items: [
      { label: 'H₂O', n: 20, color: '#d6e0e7' },
      { label: 'KHP', n: 10, color: '#d9d9df', phase: 'solid' },
      { label: 'K⁺', n: 3, color: '#c8842a' },
      { label: 'HP⁻', n: 4, color: '#6bbc57' },
    ],
    note: '看不见的：必须全部溶解再滴定——没溶完的固体在滴定中继续溶解，终点会一回褪一次、来回反复。',
  };
  if (i === 2) return {
    title: '标定终点',
    items: [
      { label: 'HP⁻', n: 6, color: '#6bbc57' },
      { label: 'P²⁻', n: 12, color: '#3f9e8f' },
      { label: '酚酞', n: 4, color: '#d16ba5' },
      { label: 'OH⁻', n: 1, color: '#e0574f' },
    ],
    note: '看不见的：微红＝极少量碱式酚酞；「半分钟不褪」才是终点——久置褪色是吸收了空气中的 CO₂，不是终点不真。',
  };
  if (i <= 4) {
    if (i === 3) return {
      title: '移取 HAc 试样',
      items: [
        { label: 'HAc', n: 20, color: '#e8a33d' },
        { label: 'H⁺', n: 4, color: '#e0574f' },
        { label: 'Ac⁻', n: 4, color: '#6bbc57' },
        { label: 'H₂O', n: 16, color: '#d6e0e7' },
      ],
      note: '看不见的：HAc 只电离了一小部分（0.1 mol/L 时约 1.3%），所以这杯里绝大多数还是 HAc 分子本身。',
    };
    return {
      title: 'HAc 滴定终点',
      items: [
        { label: 'Ac⁻', n: 18, color: '#6bbc57' },
        { label: 'Na⁺', n: 12, color: '#c8842a' },
        { label: 'HAc', n: 2, color: '#e8a33d' },
        { label: '酚酞', n: 4, color: '#d16ba5' },
      ],
      note: '看不见的：终点不是中性——产物 NaAc 水解显弱碱性（pH≈9），这正是用酚酞（变色 8.2~10）而不是甲基橙的原因。',
    };
  }
  if (i === 5) return {
    title: '稀释系列',
    items: [
      { label: 'HAc', n: 16, color: '#e8a33d' },
      { label: 'H₂O', n: 22, color: '#d6e0e7' },
    ],
    note: '看不见的：稀释只改变浓度，不改变 Ka——但 4 份样品里「电离了多少」的比例（α）会明显不同，这正是下一步要测的。',
  };
  if (i === 6) return {
    title: '两点校准',
    items: [
      { label: 'HPO₄²⁻', n: 8, color: '#6bbc57' },
      { label: 'H₂PO₄⁻', n: 8, color: '#3f9e8f' },
      { label: 'HP⁻（4.00）', n: 6, color: '#c8842a' },
    ],
    note: '看不见的：K 每次都在漂，所以两点定线——校准用的是溶液已知的 pH，不是电极「记住了」某个数。',
  };
  if (i === 7) return {
    title: '四个浓度的电离平衡',
    items: [
      { label: 'HAc（0.01）', n: 20, color: '#e8a33d' },
      { label: 'H⁺（0.01）', n: 3, color: '#e0574f' },
      { label: 'HAc（0.1）', n: 24, color: '#c8842a' },
      { label: 'H⁺（0.1）', n: 4, color: '#d05a83' },
    ],
    note: '看不见的：从 0.1 稀释到 0.01，α 从 1.3% 升到 4.4%——但 [H⁺] 反而小了（pH 从 2.86 升到 3.35）。「电离度大」和「离子多」是两回事。',
  };
  if (i === 8) return {
    title: 'Ka 的恒定性',
    items: [
      { label: 'HAc', n: 18, color: '#e8a33d' },
      { label: 'H⁺', n: 4, color: '#e0574f' },
      { label: 'Ac⁻', n: 4, color: '#6bbc57' },
    ],
    note: '看不见的：四个浓度算出的 Ka 基本一致（1.8~2.0×10⁻⁵），说明 Ka 不随浓度变——它是温度的函数，不是浓度的函数。',
  };
  return {
    title: '结论：α 变、Ka 不变',
    items: [
      { label: 'HAc', n: 18, color: '#e8a33d' },
      { label: 'H⁺', n: 4, color: '#e0574f' },
      { label: 'Ac⁻', n: 4, color: '#6bbc57' },
    ],
    note: '看不见的：稀释对平衡的推动（α 增大）与 Ka 的恒定性，是同位素式的两个事实——Ka 只由温度决定。',
  };
}

/* ---------- 读数与文字 ---------- */

function sup10(v, digits = 1) {
  const [m, e] = v.toExponential(digits).split('e');
  const sup = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return `${m}×10${String(+e).split('').map(ch => sup[ch] || ch).join('')}`;
}

function readings(i, r, ops) {
  const pct = xs => xs.map(x => x.toFixed(2)).join(' / ');
  if (i === 0) return [
    { k: 'NaOH 名义浓度', v: '0.10', unit: ' mol/L' },
    { k: 'M(KHC₈H₄O₄)', v: '204.22', unit: ' g/mol' },
  ];
  if (i === 1) return [
    { k: '基准物质量', v: ops.mKHP.toFixed(4), unit: ' g' },
    { k: 'n(KHP)', v: (ops.mKHP / 204.22).toExponential(3), unit: ' mol' },
  ];
  if (i === 2) {
    const out = [
      { k: 'c(NaOH)', v: r.std.reportedC.toFixed(4), unit: ' mol/L', tone: r.rejected ? 'warn' : 'good' },
      { k: '三份相对偏差', v: pct(r.std.deviationsPct), unit: ' %' },
      { k: '全距', v: r.std.range.toFixed(2), unit: ' mL' },
    ];
    if (r.std.q && r.std.q.shouldReject) out.push({ k: 'Q 检验', v: `Q=${r.std.q.q.toFixed(2)} > 0.94，已舍弃可疑值`, tone: 'warn' });
    if (ops.dissolve === 1) out.push({ k: '溶解', v: '未完全溶解', tone: 'bad' });
    return out;
  }
  if (i === 3) return [
    { k: '移取体积', v: '25.00 × 3', unit: ' mL' },
    { k: '移液管', v: ops.pipetteRinse === 0 ? '已润洗' : '未润洗', tone: ops.pipetteRinse === 0 ? 'good' : 'bad' },
  ];
  if (i === 4) return [
    { k: 'c(HAc)', v: r.hac.reportedC.toFixed(4), unit: ' mol/L', tone: 'good' },
    { k: '三份全距', v: r.hac.range.toFixed(2), unit: ' mL', tone: r.hac.repeatOk ? 'good' : 'bad' },
    { k: '极差判据', v: r.hac.repeatOk ? '< 0.04 ✓' : '≥ 0.04 应重做', tone: r.hac.repeatOk ? 'good' : 'bad' },
  ];
  if (i === 5) return r.cs.map((c, k) => ({
    k: `c${k + 1}（${['5.00', '10.00', '25.00', '原液'][k]} mL）`,
    v: c.toFixed(5), unit: ' mol/L',
  }));
  if (i === 6) return [
    { k: '斜率', v: ops.slopePct.toFixed(1), unit: ' %', tone: r.slopeOk ? 'good' : 'bad' },
    { k: '校准', v: ops.calibrated === 0 ? '已两点校准' : '未校准', tone: ops.calibrated === 0 ? 'good' : 'bad' },
    { k: '合格区间', v: '95 ~ 105', unit: ' %' },
  ];
  if (i === 7) return [
    ...r.phMeasured.map((ph, k) => ({ k: `pH（${['0.01', '0.02', '0.05', '0.10'][k]} M）`, v: ph.toFixed(2) })),
    { k: '室温', v: ops.tempC.toFixed(1), unit: ' °C' },
  ];
  if (i === 8) return [
    { k: 'Ka（0.01022 M）', v: sup10(r.report.rows[0].ka), tone: ops.kaFormula === 1 ? 'warn' : 'good' },
    { k: 'Ka 均值', v: sup10(r.report.kaMean), tone: ops.kaFormula === 1 ? 'warn' : 'good' },
    { k: '计算口径', v: ops.kaFormula === 1 ? '近似式 h²/c' : '精确式 h²/(c−h)', tone: ops.kaFormula === 1 ? 'warn' : undefined },
  ];
  return [
    { k: 'Ka 均值', v: sup10(r.report.kaMean) },
    { k: '教材 20 ℃ 值', v: '1.78×10⁻⁵' },
    { k: '相对误差', v: `${r.report.relErrPct >= 0 ? '+' : ''}${r.report.relErrPct.toFixed(1)}`, unit: ' %' },
    { k: 'α（0.01 → 0.10）', v: `${r.report.rows[0].alpha.toPrecision(2)} → ${r.report.rows[3].alpha.toPrecision(2)}` },
  ];
}

function observation(i, r, ops) {
  if (i === 2) return `标定得 c(NaOH) = ${r.std.reportedC.toFixed(4)} mol/L（三份相对偏差 ${pctStr(r.std.deviationsPct)}%，均值 ${r.std.meanDeviationPct.toFixed(2)}%）。`;
  if (i === 4) return `c(HAc) = ${r.hac.reportedC.toFixed(4)} mol/L；三份全距 ${r.hac.range.toFixed(2)} mL${r.hac.repeatOk ? '，平行性合格' : '，超过 0.04 mL 应重做'}。`;
  if (i === 6) return r.slopeOk
    ? `两点校准完成，斜率 ${ops.slopePct.toFixed(1)}% 在 95%~105% 内，可以开始测量。`
    : `斜率 ${ops.slopePct.toFixed(1)}% 超出 95%~105%——电极老化或校准不到位，读数不可信。`;
  if (i === 7) return `由稀到浓测得 pH：${r.phMeasured.map((p, k) => `${['0.01', '0.02', '0.05', '0.10'][k]} M → ${p.toFixed(2)}`).join('；')}。`;
  if (i === 8) return `逐份算出 Ka：${r.report.rows.map(x => sup10(x.ka)).join('、')}——四个浓度上基本一致。`;
  if (i === 9) return `Ka 均值 ${sup10(r.report.kaMean)}，与教材 1.78×10⁻⁵ 的相对误差 +${r.report.relErrPct.toFixed(1)}%；α 从 ${r.report.rows[0].alpha.toPrecision(2)}（稀）降到 ${r.report.rows[3].alpha.toPrecision(2)}（浓）。`;
  return STEPS[i].op;
}

const pctStr = xs => xs.map(x => x.toFixed(2)).join(' / ');

function verdict(r, ops) {
  const out = [];
  if (ops.calibrated === 1) {
    out.push('没有做两点校准就直接测 pH：K 每次测定都在漂（E = K − 0.0591pH），读数带约 +0.2 的系统偏移（教学模型）——测出的 pH 全体偏高，Ka 会被算得偏小。');
  } else if (!r.slopeOk) {
    out.push(`电极斜率 ${ops.slopePct.toFixed(1)}%，超出校准合格区间 95%~105%：电极老化，读数误差随测量点离校准缓冲越远越大——本实验样品在 pH 2.9~3.4，恰好在锚点（4.00）下方 0.6~1.1 个单位，受这个偏差影响明显。`);
  }
  if (ops.measureOrder === 1) {
    out.push('由浓到稀测量：电极和器壁上残留的浓溶液对稀样品是显著污染（一滴 0.1 mol/L 进 0.01 mol/L 就是约 1%），越稀的样品 pH 读得越低 → 反算的 Ka 偏大。规范是「由稀到浓」。');
  }
  if (ops.electrodeCare === 1) {
    out.push('纯水洗后没吸干：电极上的水膜把样品稀释了，pH 读数偏高——课件要求「碎滤纸轻轻吸干」（不能用力擦球泡）。');
  } else if (ops.electrodeCare === 2) {
    out.push('不洗直接换样：上一样品的残留被带进下一份——由稀到浓时影响较小，但反过来（或高浓度间切换）读数就不可信了。每换一份都要纯水洗净、吸干。');
  }
  if (ops.pipetteRinse === 1) {
    out.push('移液管未用待吸液润洗：残留的水把 HAc 稀释，滴定体积偏小、c(HAc) 偏低——它是后面所有稀释浓度的基准，一步错、四行都跟着错。');
  }
  if (ops.dissolve === 1) {
    out.push('基准物未完全溶解就滴定：没溶完的固体在滴定中继续溶解，终点反复回褪，在第一次微红就读数会偏小 → c(NaOH) 偏低。');
  }
  if (ops.endpointHold === 1) {
    out.push('见微红立即读数：半分钟内回褪说明还没到真正终点（久置褪色的另一层原因是吸收了 CO₂），读数偏小。');
  }
  if (r.std.q && r.std.q.shouldReject) {
    out.push(`标定第三份体积明显偏大：Q 计算 = ${r.std.q.q.toFixed(2)} > 0.94，按课件规则（n=3）应舍弃该可疑值——已按保留值重算 c(NaOH)，规范操作还应补做一份。`);
  } else if (ops.stdOutlier === 1) {
    out.push(`标定第三份偏大但 Q 计算 = ${r.std.q.q.toFixed(2)} < 0.94，够不上舍弃标准——按规则应保留它。数据取舍不能凭「看着不顺眼」。`);
  }
  if (ops.kaFormula === 1) {
    out.push(`用了近似式 Ka = [H⁺]²/c：它忽略了已电离的部分（精确式分母是 c − [H⁺]），最稀的 0.01 mol/L 样品上约偏低 4%，越稀偏差越大。浓度低、α 大时不能省这一项。`);
  }
  if (!r.hac.repeatOk) {
    out.push(`HAc 三份极差 ${r.hac.range.toFixed(2)} mL ≥ 0.04 mL，应重做平行测定。`);
  }
  if (!out.length) {
    out.push(`全流程规范：c(NaOH) = ${r.std.reportedC.toFixed(4)}、c(HAc) = ${r.hac.reportedC.toFixed(4)} mol/L；四个浓度的 Ka = ${r.report.rows.map(x => sup10(x.ka)).join('、')}，均值 ${sup10(r.report.kaMean)}（与教材 1.78×10⁻⁵ 相对误差 +${r.report.relErrPct.toFixed(1)}%）。`);
    const closest = r.report.rows.map((x, k) => ({ k, d: Math.abs(x.ka - 1.78e-5) })).sort((a, b) => a.d - b.d)[0].k;
    out.push(`讨论：α 随稀释显著增大（${r.report.rows[0].alpha.toPrecision(2)} → ${r.report.rows[3].alpha.toPrecision(2)}），而 Ka 基本不随浓度变——「Ka 是常数、α 不是」。四个浓度里 ${['0.01', '0.02', '0.05', '0.10'][closest]} mol/L 那份的 Ka 最接近教材值；最稀的样品里 [H⁺] 的相对误差被放大，往往偏离最大。`);
  }
  return out;
}

/* ---------- 附表 ---------- */

function addTables(host, i, r) {
  if (i >= 2) {
    const wrap = h('div', { class: 'lab-table-wrap' });
    const meanOf = vs => (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2);
    const row = (name, g) => h('tr', {},
      h('td', {}, name),
      ...g.volumes.map(v => h('td', {}, v.toFixed(2))),
      h('td', {}, meanOf(g.volumes)),
      h('td', {}, (Math.max(...g.volumes) - Math.min(...g.volumes)).toFixed(2)));
    const table = h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, '滴定组'), h('th', {}, '第 1 次'), h('th', {}, '第 2 次'), h('th', {}, '第 3 次'),
        h('th', {}, '平均 / mL'), h('th', {}, '全距 / mL'))),
      h('tbody', {}, row('NaOH 标定（KHP）', r.std), row('HAc 滴定', r.hac)));
    wrap.append(table);
    wrap.append(h('div', { class: 'lab-caption' },
      `c(NaOH) = ${r.std.reportedC.toFixed(4)} mol/L（相对偏差 ${pctStr(r.std.deviationsPct)}%，均值 ${r.std.meanDeviationPct.toFixed(2)}%）；` +
      `c(HAc) = ${r.hac.reportedC.toFixed(4)} mol/L（相对偏差 ${pctStr(r.hac.deviationsPct)}%）`));
    host.append(wrap);
  }
  if (i >= 8) {
    const wrap = h('div', { class: 'lab-table-wrap', style: 'margin-top:12px' });
    const table = h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'HAc 编号'), h('th', {}, 'c / mol·L⁻¹'), h('th', {}, 'pH'),
        h('th', {}, '[H⁺] / mol·L⁻¹'), h('th', {}, 'Ka'), h('th', {}, 'α'))),
      h('tbody', {}, ...r.report.rows.map((x, k) => h('tr', {},
        h('td', {}, String(k + 1)),
        h('td', {}, x.c.toFixed(5)),
        h('td', {}, x.ph.toFixed(2)),
        h('td', {}, sup10(x.h)),
        h('td', {}, sup10(x.ka)),
        h('td', {}, x.alpha.toPrecision(2))))));
    wrap.append(table);
    wrap.append(h('div', { class: 'lab-caption' },
      `Ka 均值 ${sup10(r.report.kaMean)}；教材 20 ℃ 值 1.78×10⁻⁵（区间 1.75~1.8×10⁻⁵）；` +
      `相对误差 +${r.report.relErrPct.toFixed(1)}%。pH 是两位有效数字，Ka 与 α 同取两位。`));
    host.append(wrap);
  }
}

/* ---------- 挂载 ---------- */

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species,
    observation, verdict, readings,
    equation: 'HAc ⇌ H⁺ + Ac⁻；Ka = [H⁺][Ac⁻]/[HAc] = cα²/(1−α)',
    calculation: (i, r, ops) => {
      if (i === 2) return `c(NaOH) = (${ops.mKHP.toFixed(4)}/204.22) ÷ (V̄/1000) = ${r.std.reportedC.toFixed(4)} mol/L`;
      if (i === 4) return `c(HAc) = c(NaOH) × V̄ ÷ 25.00 = ${r.hac.reportedC.toFixed(4)} mol/L`;
      if (i === 5) return `5.00 × ${r.hac.reportedC.toFixed(4)} ÷ 50.00 = ${r.cs[0].toFixed(5)} mol/L（要 4 位有效数字）`;
      if (i === 6) return `斜率 = S实测 ÷ 59.2 mV/pH × 100% = ${ops.slopePct.toFixed(1)}%（合格 95~105%）`;
      if (i === 7) return `pH ${r.phMeasured[0].toFixed(2)} → [H⁺] = 10^(−${r.phMeasured[0].toFixed(2)}) = ${sup10(r.report.rows[0].h)} mol/L（两位有效数字）`;
      if (i === 8) {
        const x = r.report.rows[0];
        return `Ka = [H⁺]²/(c−[H⁺]) = (${sup10(x.h)})² ÷ (${x.c.toFixed(5)} − ${sup10(x.h)}) = ${sup10(x.ka)}；α = ${x.alpha.toPrecision(2)}`;
      }
      if (i === 9) return `相对误差 = (${sup10(r.report.kaMean)} − 1.78×10⁻⁵) ÷ 1.78×10⁻⁵ × 100% = +${r.report.relErrPct.toFixed(1)}%`;
      return STEPS[i].calc;
    },
    modelNote: '说明：计量关系（KHP 与 NaOH 1:1、HAc 与 NaOH 1:1、稀释倍数、Ka=[H⁺]²/(c−[H⁺])、α=[H⁺]/c）按课件公式计算；'
      + '有效数字规则（pH 两位、Ka/α 两位、c 四位）与 Q 检验临界值 0.94 均按课件报告要求。'
      + '教学模式的 pH 序列逐位复现课件 P29 示例表（3.35/3.21/3.02/2.86 → Ka 2.0/1.9/1.8/1.9×10⁻⁵），'
      + '它由「理论值 + 实测偏差向量」构成，向量取自 P29 表本身，不是随机数。'
      + 'pH 计的读数偏差（斜率、未校准、测量顺序、电极护理）为方向性教学标定模型，只保证方向与量级合理，不代表实测误差。'
      + '另：课件 P35「示例」表不自洽（Ka 列误印 ×10⁻⁴、第 3/4 行 [H⁺] 指数印错），本模拟器不采用，理论序列按 Ka=1.78×10⁻⁵ 计（3.38/3.23/3.02/2.87）。',
    extra: (host, i, r) => addTables(host, i, r),
  });
}

/**
 * 供自检页（`_scenes-all.html` / `_scenes-test.html`）读取的最小场景描述。
 * 有了它，自检页就不必**手抄**步骤名——sim 里改一步，自检页跟着变。
 * 引用的全是模块级标识符，不会与 mount 里那份漂移。
 */
export const sceneSpec = { id: meta.id, name: meta.name, steps: STEPS, guide: GUIDE, model, draw };
