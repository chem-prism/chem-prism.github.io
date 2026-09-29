/**
 * 实验 06：水质分析 · 水硬度的测定（配位滴定法）。
 *
 * 课件核心：同一份水样分两份测——一份加 NaOH 把 Mg²⁺ 沉淀隐蔽、只测钙；
 * 另一份在 pH 10 测钙镁总量；差减求镁，再乘 M(MgO)/M(CaO) = 0.7186 报成 MgO。
 *
 * 计量关系全在 chem.js 的「配位滴定法测定水硬度」一节，可 node 验算；
 * 本文件里的操作偏差修正与平行离差放大是**教学标定模型**，逐项标注。
 */
import { h, noteAt, pourStream } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  edtaStandardization, waterHardnessReport, edtaNominalConcentration, stdev,
  residualMagnesiumAtPH, conditionalLgK, METALS,
} from '../chem.js';
import {
  balance, conicalFlask, burette, volumetricFlask, beaker, hotplate, watchGlass,
  reagentBottle, precipitateFlocs, bubbles, CLEAR_COLOR, drawBench,
} from '../glassware.js';
import { metalIndicatorColor } from '../views.js';

export const meta = {
  id: 'water-hardness',
  name: '水硬度的测定',
  wave: '实验 06',
  accent: '--w-indigo',
  desc: '同一份水样分两份测：NaOH 沉掉 Mg²⁺ 只测钙，氨性缓冲测钙镁总量——差减出来的镁硬度，还要再乘 0.7186 换成 MgO。',
};

const GUIDE = {
  mCaCO3: 0.0567, vStdMean: 25.09, preAddEDTA: 15, bufferStd: 10,
  samplePipette: 0,
  vNaOHCa: 2.5, vCaMean: 25.33,
  mgEDTA: 3, bufferTotal: 5, vTotalMean: 29.76,
  masking: 0,
  titrateSpeed: 0, endpointHoldS: 30,
  mgReport: 0,
};
// 练习模式初值：故意留 4 处不规范，方向各不相同（偏高 / 平行性差 / 报告口径错）
const DEFAULTS = {
  ...GUIDE,
  preAddEDTA: 0,    // 预加不足 → 加缓冲后析 Ca(OH)₂ → 标定读数偏大
  bufferStd: 5,     // 标定缓冲不足 → 终点拖后（测定加 5 mL 是对的，别混淆）
  titrateSpeed: 1,  // 一开始就快 → 平行性变差
  mgReport: 1,      // 忘换算，直接报 14.0 —— 本实验头号靶心
};
const CONTROLS = [
  { key: 'mCaCO3', label: '基准物 CaCO₃ 质量', unit: ' g', min: 0.05, max: 0.06, step: 0.0001 },
  { key: 'vStdMean', label: '标定平均耗 EDTA', unit: ' mL', min: 22, max: 28, step: 0.01 },
  { key: 'preAddEDTA', label: '标定前预加 EDTA（不记数）', unit: ' mL', min: 0, max: 20, step: 1 },
  { key: 'bufferStd', label: '标定氨性缓冲加入量', unit: ' mL', min: 0, max: 12, step: 1 },
  { key: 'samplePipette', label: '水样移取方式', options: ['公用 100.00 mL 移液管', '自己的 25.00 mL 取 4 次（错误）'] },
  { key: 'vNaOHCa', label: '钙硬度 NaOH 加入量', unit: ' mL', min: 0, max: 20, step: 0.5 },
  { key: 'vCaMean', label: '钙硬度平均耗 EDTA', unit: ' mL', min: 22, max: 28, step: 0.01 },
  { key: 'mgEDTA', label: '总硬度前加 Mg-EDTA', unit: ' mL', min: 0, max: 5, step: 0.5 },
  { key: 'bufferTotal', label: '测定氨性缓冲加入量', unit: ' mL', min: 0, max: 8, step: 1 },
  { key: 'vTotalMean', label: '总硬度平均耗 EDTA', unit: ' mL', min: 26, max: 33, step: 0.01 },
  { key: 'masking', label: '干扰离子与掩蔽', options: ['无显著干扰离子', '含 Fe³⁺/Al³⁺，已加三乙醇胺掩蔽', '含 Fe³⁺/Al³⁺，未掩蔽（错误）'] },
  { key: 'titrateSpeed', label: '滴定速度', options: ['先快后慢，近终点半滴', '一开始就快（错误）'] },
  { key: 'endpointHoldS', label: '终点颜色保持', unit: ' s', min: 10, max: 40, step: 1 },
  { key: 'mgReport', label: '镁硬度报告口径', options: ['按课件换算 ×0.7186', '忘换算，直接报 14.0 mg/L', '换算方向反（÷0.7186）', '0.7186 错用在钙硬度上'] },
];

const STEPS = [
  {
    name: '配制 EDTA 溶液',
    op: '台秤称取 0.8 g EDTA 二钠盐，加约 200 mL 水微热溶解，稀释至 400 mL 摇匀，转入塑料试剂瓶。',
    why: 'EDTA 二钠盐不是基准物（易吸湿、纯度不定），配好的只是近似浓度，必须用 CaCO₃ 标定；装塑料瓶是因为 EDTA 溶液会缓慢侵蚀玻璃、引入金属离子。',
    eq: 'Na₂H₂Y·2H₂O，M = 372.24 g·mol⁻¹',
    calc: '0.8 ÷ 372.24 ÷ 0.400 = 0.00537 mol·L⁻¹（名义值，待标定）',
  },
  {
    name: '称取并溶解基准物',
    op: '减量法称取 0.05～0.06 g CaCO₃（称准至 0.0001 g）于 100 mL 烧杯，加数滴纯水润湿，盖上表面皿，缓慢滴加 (1+1) HCl 至固体刚好完全溶解。',
    why: 'CaCO₃ 是基准物，它的质量直接决定 EDTA 的准确浓度；先润湿是防止加酸时粉末被 CO₂ 顶起溅失；HCl 逐滴加、每加一滴先看是否溶尽——酸过量太多会影响终点判断。',
    eq: 'CaCO₃ + 2HCl → CaCl₂ + CO₂↑ + H₂O',
    calc: '0.0567 g ÷ 100.09 g·mol⁻¹ = 5.665×10⁻⁴ mol',
  },
  {
    name: '煮沸除 CO₂ 并定容',
    op: '加纯水 20 mL，小火煮沸 2 min 赶走 CO₂，冷却后定量转移、定容至 100 mL。',
    why: '溶解产生的 CO₂ 若留在溶液里，碱性滴定时会额外消耗 EDTA、使标定结果偏高；表面皿上附着的水珠要冲洗回烧杯。',
    eq: 'CO₂(aq) ⇌ CO₂↑（煮沸驱除）',
    calc: '定容后 c(Ca²⁺) = 5.665×10⁻⁴ ÷ 0.1000 = 5.665×10⁻³ mol·L⁻¹',
  },
  {
    name: '标定装液（预加 EDTA）',
    op: '移取 25.00 mL CaCO₃ 溶液于锥形瓶，加 50 mL 纯水和 3 mL Mg-EDTA 溶液；先从滴定管加入约 15 mL EDTA 待标液——这 15 mL 不记录。',
    why: '★ 这 15 mL 不记数、但必须真加：它先把大部分 Ca²⁺ 络合掉，否则下一步加氨性缓冲到 pH 10 时，高浓度 Ca²⁺ 会析出 Ca(OH)₂ 使数据不准。3 mL Mg-EDTA 是让终点变色敏锐。',
    eq: 'Ca²⁺ + Y⁴⁻ ⇌ CaY²⁻，lg K = 10.69',
    calc: '每份含 n(Ca²⁺) = 5.665×10⁻³ × 0.02500 = 1.416×10⁻⁴ mol',
  },
  {
    name: '标定滴定至终点',
    op: '加 10 mL 氨性缓冲溶液、一平勺铬黑 T，立即用 EDTA 滴至紫红刚变纯蓝，读总共消耗的体积。平行三份。',
    why: '★ 标定加 10 mL 缓冲、测定只加 5 mL——量要加够，pH 不够时条件稳定常数下降、终点拖后读数偏大。加指示剂后要立即滴定；蓝色会慢慢褪回紫色，以 30 s 不褪为准。',
    eq: 'Ca²⁺ + Y⁴⁻ → CaY²⁺（主反应）；MgIn⁻（紫红）+ Y⁴⁻ → MgY²⁺ + HIn²⁻（纯蓝，终点）',
    calc: 'c(EDTA) = n(Ca²⁺) ÷ (V总共消耗/1000)；0.0567 g 范例 → 0.00565 mol·L⁻¹',
  },
  {
    name: '钙硬度：沉淀隐蔽 Mg²⁺',
    op: '移取 100.00 mL 水样（公共 100 mL 移液管）于锥形瓶，加 2～3 mL 2 mol·L⁻¹ NaOH、一满勺（约 30 mg）钙指示剂，滴至酒红刚变纯蓝。平行三份。',
    why: 'NaOH 把 pH 拉到约 12.7，Mg²⁺ 生成 Mg(OH)₂ 沉淀退出滴定（沉淀隐蔽法），测到的只是 Ca²⁺。钙指示剂最适 pH 10～13——NaOH 加过头到 pH>13.5，指示剂自身就呈酒红色，终点突变消失。',
    eq: 'Mg²⁺ + 2OH⁻ → Mg(OH)₂↓；CaIn（酒红）+ Y⁴⁻ → CaY²⁺ + In（纯蓝）',
    calc: 'pH 12 时残余 [Mg²⁺] = Ksp/[OH⁻]² ≈ 5.6×10⁻⁸ mol·L⁻¹，lg(c·K′) ≈ 1.4，彻底退出滴定',
  },
  {
    name: '总硬度：加 Mg-EDTA 后滴定',
    op: '另取 100.00 mL 水样，加 3 mL Mg-EDTA 溶液、5 mL pH≈10 氨性缓冲、一平勺铬黑 T，立即滴至紫红刚变纯蓝。平行三份。',
    why: '水样 Mg²⁺ 少时铬黑 T 直接指示 Ca²⁺ 不敏锐（CaIn lg K = 5.4 < MgIn 7.0）；加 Mg-EDTA 后终点由 MgIn⁻→HIn²⁻ 变色。滴定全程 Mg 守恒（Ca 消耗 x−y、Mg 消耗 y，合计仍是 x），不引入误差。',
    eq: 'MgY²⁻ + Ca²⁺ ⇌ CaY²⁺ + Mg²⁺；MgIn⁻（紫红）+ Y⁴⁻ → MgY²⁺ + HIn²⁻（纯蓝）',
    calc: '配位反应慢：滴速不宜快，近终点半滴加入并充分摇瓶',
  },
  {
    name: '计算 c(EDTA) 与两硬度',
    op: '由标定三份读数求 EDTA 平均浓度；由钙、总硬度各三份读数求 mg·L⁻¹（以 CaO 计）。',
    why: '三个浓度共用同一个 c(EDTA)——标定偏了，钙与总硬度会一起偏；注意看它们怎么偏、以及在差减里如何相消。',
    eq: 'ρ(CaO) = V(EDTA) × c(EDTA) × M(CaO) × 10 ÷ (V水样/100 mL)',
    calc: 'c(EDTA) = 0.00565 mol·L⁻¹；钙 80.2、总 94.2 mg·L⁻¹（CaO）',
  },
  {
    name: '差减求镁硬度并换算 MgO',
    op: '总硬度 − 钙硬度 = 镁硬度（以 CaO 计）；再乘 M(MgO)/M(CaO) = 0.7186 换算成 MgO。',
    why: '★ 差减出来的 14.0 是「以 CaO 表示」的镁硬度；课件要求报 MgO，必须再乘 0.7186。这一步换的是基准物质（钙硬度不用换）——忘乘、乘反、乘错对象都是典型错误。',
    eq: 'MgO 基准 = (总 − 钙) × M(MgO)/M(CaO) = 14.0 × 0.7186',
    calc: '94.2 − 80.2 = 14.0 mg·L⁻¹（CaO 计）→ × 0.7186 = 10.1 mg·L⁻¹（MgO）',
  },
  {
    name: '结果评价与分级',
    op: '把总硬度换算成德国度，对照分级表判断水质，并核对饮用水要求（≤25 °d）。',
    why: '德国度按「每升 10 mg CaO」定义；分级阈值 4/8/16/30 是课件原表。镁硬度由两个数相减而来，相对不确定度被放大——它是报告里最不可靠的一个数。',
    eq: '°d = ρ(CaO) ÷ 10；饮用水 ≤ 25 °d',
    calc: '94.2 ÷ 10 = 9.42 °d → 微硬水（8～16），符合饮用水要求',
  },
];

/**
 * 三份平行读数相对各自均值的固定离差 / mL —— **直接取自课件 P34 记录表本身**
 * （25.09±→25.04/25.10/25.12 等），不是随机数：每次重算、每次渲染都得到同一组数。
 */
const WH_OFFSET = {
  std: [-0.05, 0.01, 0.03],
  ca: [0.03, -0.02, -0.01],
  tot: [-0.07, 0.12, -0.05],
};

/** 水样中镁的分析浓度 / mol·L⁻¹（由课件范例的镁硬度 14.0 mg/L 以 CaO 计反算），
 *  只用于估算「NaOH 不足时 Mg(OH)₂ 隐蔽程度」这一处教学判断。 */
const SAMPLE_C_MG = 14.0 / 56.08 / 1000;

/** 符号层用：Mg²⁺ 的 lgK（chem.js 的 METALS 原值，避免两处数字漂移） */
const LGK_MG = METALS.find(m => m.name === 'Mg²⁺').lgK;

function model(ops) {
  // —— 教学标定模型：操作不规范 → 系统偏差 bias 与散度倍数 spread ——
  // ⚠️ 系数是标定出来的，不是实测误差：只保证偏差方向正确、量级合理。
  const holdDeficit = Math.max(0, 30 - ops.endpointHoldS) / 20;      // 终点未保持 → 提前读数 → 偏小
  const biasStd = 0.006 * (15 - ops.preAddEDTA) / 15                 // 预加不足 → 析 Ca(OH)₂ → 偏大
                + 0.004 * Math.max(0, 10 - ops.bufferStd) / 10       // 缓冲不足 → 终点拖后 → 偏大
                - 0.003 * holdDeficit;
  const biasCaOps = -0.003 * holdDeficit
                  + (ops.masking === 2 ? 0.010 : 0);                 // 指示剂被封闭 → 偏大
  const biasTot = 0.005 * (3 - ops.mgEDTA) / 3                       // Mg-EDTA 不足 → 终点不敏锐 → 偏大
                + 0.003 * Math.max(0, 5 - ops.bufferTotal) / 5
                - 0.003 * holdDeficit
                + (ops.masking === 2 ? 0.010 : 0);
  let spread = ops.titrateSpeed === 1 ? 4 : 1;                       // 一开始就快 → 平行性 ×4 变差
  if (ops.samplePipette === 1) spread *= 2;                          // 四次移取：只放大散度，不加系统偏差

  // 钙那份的 pH 与 Mg(OH)₂ 隐蔽程度（Ksp(Mg(OH)₂) = 5.61×10⁻¹²，与 chem.js 同值）
  const ohCa = ops.vNaOHCa > 0 ? (ops.vNaOHCa * 2) / (100 + ops.vNaOHCa) : 0;
  const phCa = ops.vNaOHCa > 0 ? 14 + Math.log10(ohCa) : null;
  const mgHidden = ohCa > 0
    ? Math.max(0, 1 - Math.min(1, (5.61e-12 / (ohCa * ohCa)) / SAMPLE_C_MG))
    : 0;
  // 隐蔽不完全时，没沉下去的 Mg²⁺ 会在钙那份里被一起滴掉 → 钙读数向总硬度靠拢
  const vCaEff = ops.vCaMean + (1 - mgHidden) * (ops.vTotalMean - ops.vCaMean);

  const spreadVolumes = (mean, offs) => offs.map(d => (mean + d * spread));
  const stdVolumes = spreadVolumes(ops.vStdMean, WH_OFFSET.std).map(v => v * (1 + biasStd));
  const caVolumes = spreadVolumes(vCaEff, WH_OFFSET.ca).map(v => v * (1 + biasCaOps));
  const totVolumes = spreadVolumes(ops.vTotalMean, WH_OFFSET.tot).map(v => v * (1 + biasTot));

  const std = edtaStandardization({ mCaCO3: ops.mCaCO3, volumes: stdVolumes });
  const report = waterHardnessReport({ cEDTA: std.cMean, vCa: caVolumes, vTotal: totVolumes });

  return {
    std, report, stdVolumes, caVolumes, totVolumes,
    bias: { std: biasStd, ca: biasCaOps, tot: biasTot }, spread,
    phCa, mgHidden,
    nominal: edtaNominalConcentration({}),
  };
}

/* ---------- 宏观层 ---------- */

// 课件 P23/P25 原页实拍色：紫红 →（蓝紫）→ 纯蓝；钙那份为 酒红 →（蓝紫）→ 纯蓝
const C_EDTA_SOL = [222, 232, 240, 0.20];
const C_BUFFER = [232, 228, 200, 0.22];
const C_MGEDTA = [222, 232, 240, 0.22];
const C_NAOH = [222, 232, 240, 0.20];
const C_EBT_DROP = [70, 60, 120, 0.55];
const C_CAL_SOLID = [168, 62, 84, 0.78];
const C_SAMPLE = [214, 224, 234, 0.22];

/** 终点色三连色标：白底衬 + 实色点 + 短标签（颜色必须衬浅底才看得准） */
function colorStrip(ctx, labels, colors) {
  const y0 = 16;
  let x = 14;
  ctx.textBaseline = 'top';
  labels.forEach((lb, k) => {
    ctx.beginPath();
    ctx.arc(x + 8, y0 + 8, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(238,242,245,0.92)';
    ctx.fill();
    const c = colors[k];
    ctx.beginPath();
    ctx.arc(x + 8, y0 + 8, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fill();
    ctx.font = '9px "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(160,180,196,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(lb, x + 8, y0 + 21);
    if (k < labels.length - 1) ctx.fillText('→', x + 34, y0 + 2);
    x += 56;
  });
}

function flaskLabel(ctx, box, text) {
  ctx.save();
  ctx.font = '10px "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(160,180,196,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, box.x + box.w / 2, box.y + box.h + 8);
  ctx.restore();
}


function draw(ctx, W, H, t, i, r, ops) {
  const B = drawBench(ctx, W, H);
  const cx = W / 2;
  const ebtColor = k => metalIndicatorColor('铬黑T', 10, { complexed: k });
  // 钙那份的指示剂颜色必须跟随**实际 pH**：pH>13.5 时游离指示剂自身就转酒红，
  // 与 CaIn 同色——终点突变消失，画面才与思考题 4 的结论一致（写死 pH 会画出蓝瓶）。
  const caColor = k => metalIndicatorColor('钙指示剂', r.phCa == null ? 12.7 : r.phCa, { complexed: k });

  if (i === -1) {
    balance(ctx, { x: cx - 158, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: [225, 232, 238, 0.6], reading: '0.8000' });
    reagentBottle(ctx, { x: cx + 52, y: B - 140, w: 50, h: 140 },
      { liquid: C_EDTA_SOL, level: 0.6, label: ['EDTA 标液'] });
    volumetricFlask(ctx, { x: cx + 128, y: B - 200, w: 86, h: 200 },
      { liquid: CLEAR_COLOR, level: 0.4 });
    return;
  }
  if (i === 0) {
    balance(ctx, { x: cx - 158, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: [225, 232, 238, 0.6], reading: '0.8000' });
    beaker(ctx, { x: cx - 28, y: B - 115, w: 92, h: 115 }, { liquid: [225, 232, 238, 0.24], level: 0.45 });
    reagentBottle(ctx, { x: cx + 84, y: B - 140, w: 50, h: 140 },
      { liquid: C_EDTA_SOL, level: 0.62, label: ['EDTA', '0.005 M'] });
    return;
  }
  if (i === 1) {
    balance(ctx, { x: cx - 158, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: [222, 222, 218, 0.85], reading: ops.mCaCO3.toFixed(4) });
    beaker(ctx, { x: cx - 22, y: B - 108, w: 90, h: 108 }, { liquid: [225, 232, 238, 0.22], level: 0.14 });
    // 表面皿扣在烧杯口上（皿沿坐在杯口、弧面略探入杯内）
    watchGlass(ctx, { x: cx - 30, y: B - 98, w: 106, h: 26 }, {});   // 当盖子用，没有晶体，故不传 crystal/t
    reagentBottle(ctx, { x: cx + 88, y: B - 122, w: 40, h: 122 },
      { shape: 'drop', liquid: [222, 232, 240, 0.25], level: 0.5, label: ['HCl'] });
    return;
  }
  if (i === 2) {
    hotplate(ctx, { x: cx - 158, y: B - 58, w: 200, h: 58 }, { heat: 0.8, steam: 0.30, t });
    beaker(ctx, { x: cx - 142, y: B - 168, w: 92, h: 110 }, { liquid: [228, 230, 224, 0.24], level: 0.42 });
    bubbles(ctx, { x: cx - 130, y: B - 152, w: 68, h: 82 }, t, 0.5);
    watchGlass(ctx, { x: cx - 146, y: B - 100, w: 100, h: 24 }, {});  // 同上：表面皿在这里是盖，不是盛晶体的皿
    volumetricFlask(ctx, { x: cx + 88, y: B - 205, w: 86, h: 205 },
      { liquid: CLEAR_COLOR, level: 0.55 });
    return;
  }

  const flaskBox = { x: cx - 54, y: B - 145, w: 108, h: 145 };
  if (i >= 3 && i <= 7) {
    const buretteBox = { x: cx - 28, y: H * 0.03, w: 56, h: H * 0.40 };
    const levels = { 3: 0.62, 4: 0.36, 5: 0.44, 6: 0.32, 7: 0.60 };
    burette(ctx, buretteBox, { level: levels[i] ?? 0.5, liquid: [160, 215, 205, 0.35] });
    pourStream(ctx, { x: cx, y: buretteBox.y + buretteBox.h }, { x: cx, y: flaskBox.y + 8 },
      { color: [160, 215, 205], alpha: 0.55, width: 3, t });
  }

  if (i === 3) {
    conicalFlask(ctx, flaskBox, { liquid: [225, 232, 238, 0.22], level: 0.42 });
    reagentBottle(ctx, { x: cx + 66, y: B - 130, w: 48, h: 130 },
      { liquid: C_MGEDTA, level: 0.5, label: ['Mg-EDTA'] });
    noteAt(ctx, cx + 64, B - 152, '已预加 15 mL（不记数）');
    return;
  }
  if (i === 4) {
    conicalFlask(ctx, flaskBox, { liquid: ebtColor(0), level: 0.42 });
    colorStrip(ctx, ['紫红', '蓝紫', '纯蓝'], [ebtColor(1), ebtColor(0.5), ebtColor(0)]);
    reagentBottle(ctx, { x: cx + 62, y: B - 132, w: 46, h: 132 },
      { liquid: C_BUFFER, level: 0.55, label: ['氨性缓冲'] });
    reagentBottle(ctx, { x: cx + 116, y: B - 112, w: 36, h: 112 },
      { shape: 'drop', liquid: C_EBT_DROP, level: 0.5, label: ['铬黑T'] });
    return;
  }
  if (i === 5) {
    const failBase = r.phCa != null && r.phCa > 13.5;
    const failAcid = r.phCa == null || r.phCa < 10;
    // pH>13.5 时「指示剂自身色」与「CaIn 络合色」是同一个酒红（显色模型里同色），
    // 所以终点前后都是酒红——终点突变消失，画面自己就把思考题 4 讲明白了。
    conicalFlask(ctx, flaskBox, {
      liquid: failAcid ? [225, 232, 238, 0.22] : caColor(0), level: 0.42,
    });
    // Mg(OH)₂ 白色浑浊（沉淀隐蔽法的可视化），浑浊量随隐蔽程度走
    if (r.mgHidden > 0.2) {
      precipitateFlocs(ctx,
        { x: flaskBox.x + flaskBox.w * 0.24, y: flaskBox.y + flaskBox.h * 0.40, w: flaskBox.w * 0.52, h: flaskBox.h * 0.54 },
        t, 0.8 * r.mgHidden);
    }
    if (failBase) {
      noteAt(ctx, 14, 54, '指示剂自身酒红，', '#e05a4f');
      noteAt(ctx, 14, 68, '「酒红→纯蓝」突变消失', '#e05a4f');
    } else if (failAcid) {
      noteAt(ctx, 14, 54, 'pH 太低，', '#e05a4f');
      noteAt(ctx, 14, 68, '钙指示剂无法显色', '#e05a4f');
    } else {
      colorStrip(ctx, ['酒红', '蓝紫', '纯蓝'], [caColor(1), caColor(0.5), caColor(0)]);
    }
    reagentBottle(ctx, { x: cx + 62, y: B - 128, w: 44, h: 128 },
      { liquid: C_NAOH, level: 0.55, label: ['2 M NaOH'] });
    reagentBottle(ctx, { x: cx + 114, y: B - 122, w: 46, h: 122 },
      { shape: 'wide', solid: C_CAL_SOLID, level: 0.45, label: ['钙指示剂'], labelTone: 'amber', cap: 'stopper', brown: true });
    return;
  }
  if (i === 6) {
    conicalFlask(ctx, flaskBox, { liquid: ebtColor(0), level: 0.42 });
    colorStrip(ctx, ['紫红', '蓝紫', '纯蓝'], [ebtColor(1), ebtColor(0.5), ebtColor(0)]);
    reagentBottle(ctx, { x: cx + 62, y: B - 130, w: 46, h: 130 },
      { liquid: C_MGEDTA, level: 0.5, label: ['Mg-EDTA'] });
    reagentBottle(ctx, { x: cx + 116, y: B - 112, w: 36, h: 112 },
      { shape: 'drop', liquid: C_EBT_DROP, level: 0.5, label: ['铬黑T'] });
    return;
  }
  if (i === 7) {
    conicalFlask(ctx, flaskBox, { liquid: ebtColor(0), level: 0.42 });
    reagentBottle(ctx, { x: cx + 64, y: B - 145, w: 54, h: 145 },
      { liquid: C_SAMPLE, level: 0.6, label: ['水样'] });
    return;
  }
  if (i === 8) {
    const a = { x: cx - 118, y: B - 132, w: 100, h: 132 };
    const b = { x: cx + 18, y: B - 132, w: 100, h: 132 };
    conicalFlask(ctx, a, { liquid: caColor(0), level: 0.42 });
    precipitateFlocs(ctx,
      { x: a.x + a.w * 0.26, y: a.y + a.h * 0.42, w: a.w * 0.48, h: a.h * 0.50 }, t, 0.8);
    conicalFlask(ctx, b, { liquid: ebtColor(0), level: 0.42 });
    flaskLabel(ctx, a, '钙硬度（Mg 已沉掉）');
    flaskLabel(ctx, b, '总硬度（Ca+Mg）');
    return;
  }
  // i === 9：三份滴定的终点是同一个纯蓝
  const boxes = [
    { x: cx - 158, y: B - 122, w: 92, h: 122 },
    { x: cx - 46, y: B - 122, w: 92, h: 122 },
    { x: cx + 66, y: B - 122, w: 92, h: 122 },
  ];
  const labels = ['EDTA 标定', '钙硬度', '总硬度'];
  boxes.forEach((bx, k) => {
    conicalFlask(ctx, bx, { liquid: ebtColor(0), level: 0.42 });
    flaskLabel(ctx, bx, labels[k]);
  });
}

/* ---------- 微观层 ---------- */

function species(i, r) {
  if (i === 0) return {
    title: '配制 EDTA 溶液',
    items: [
      { label: 'H₂O', n: 24, color: '#d6e0e7' },
      { label: 'EDTA', n: 6, color: '#e8a33d' },
    ],
    note: 'EDTA 二钠盐不是基准物——这就是它只能先配近似浓度、再标定的原因。',
  };
  if (i === 1) return {
    title: '溶解碳酸钙',
    items: [
      { label: 'H₂O', n: 20, color: '#d6e0e7' },
      { label: 'CaCO₃', n: 10, color: '#d9d9df', phase: 'solid' },
      { label: 'H⁺', n: 6, color: '#e05a4f' },
      { label: 'CO₂↑', n: 4, color: '#9aa7b6' },
    ],
    note: '看不见的：加酸冒出的 CO₂ 会把粉末顶起来——先润湿、逐滴加就是为了防溅。',
  };
  if (i === 2) return {
    title: '煮沸除 CO₂ 并定容',
    items: [
      { label: 'H₂O', n: 20, color: '#d6e0e7' },
      { label: 'Ca²⁺', n: 12, color: '#6bbc57' },
      { label: 'CO₂↑', n: 8, color: '#9aa7b6' },
    ],
    note: '看不见的：赶走的 CO₂ 如果在，碱性滴定时会额外消耗 EDTA——不煮沸，标定结果偏高。',
  };
  if (i === 3) return {
    title: '预加 EDTA 后的体系',
    items: [
      { label: 'Ca²⁺', n: 6, color: '#6bbc57' },
      { label: 'EDTA', n: 4, color: '#e8a33d' },
      { label: 'CaY²⁻', n: 20, color: '#3f9e8f' },
      { label: 'MgY²⁻', n: 6, color: '#2fb3a3' },
    ],
    note: '看不见的：那 15 mL EDTA 已把大部分 Ca²⁺ 络合掉，游离 [Ca²⁺] 压得很低，所以下一步加氨性缓冲不会析出 Ca(OH)₂。这 15 mL 不记数、但必须真加。',
  };
  if (i === 4) return {
    title: '铬黑 T 与终点',
    items: [
      { label: 'Ca²⁺', n: 4, color: '#6bbc57' },
      { label: 'CaY²⁻', n: 24, color: '#3f9e8f' },
      { label: 'HIn²⁻', n: 6, color: '#244eb0' },
      { label: 'CaIn⁻', n: 4, color: '#a02040' },
    ],
    note: '看不见的：终点前是蓝紫色——CaIn⁻ 与 HIn²⁻ 两种颜色共存（课件原话：「不是终点，但接近终点」）；纯蓝要等 EDTA 把 CaIn⁻ 里的 Ca²⁺ 也夺走。',
  };
  if (i === 5) {
    const hidden = r?.mgHidden ?? 1;
    return hidden > 0.5 ? {
      title: '沉淀隐蔽后的体系',
      items: [
        { label: 'Ca²⁺', n: 16, color: '#6bbc57' },
        { label: 'Mg(OH)₂', n: Math.max(2, Math.round(12 * hidden)), color: '#e6ecf2', phase: 'solid' },
        { label: 'CaIn', n: 5, color: '#a02040' },
        { label: 'In', n: 3, color: '#4a7fd6' },
      ],
      note: '看不见的：Mg²⁺ 没有消失，它变成了瓶底的 Mg(OH)₂——另一份（总硬度）会把它算进去，差减法就靠这一点。',
    } : {
      title: 'NaOH 不足（未隐蔽）',
      items: [
        { label: 'Ca²⁺', n: 12, color: '#6bbc57' },
        { label: 'Mg²⁺', n: 8, color: '#2fb3a3' },
        { label: 'CaIn', n: 5, color: '#a02040' },
        { label: 'In', n: 3, color: '#4a7fd6' },
      ],
      note: '看不见的：NaOH 不足，Mg²⁺ 大多还游离在溶液里——这一份会把它一起滴掉，钙硬度偏高、镁差减偏低，数据不可用。',
    };
  }
  if (i === 6) return {
    title: '总硬度的滴定体系',
    items: [
      { label: 'Ca²⁺', n: 5, color: '#6bbc57' },
      { label: 'Mg²⁺', n: 4, color: '#2fb3a3' },
      { label: 'MgIn⁻', n: 5, color: '#a02040' },
      { label: 'CaY²⁻', n: 18, color: '#3f9e8f' },
      { label: 'MgY²⁻', n: 5, color: '#2fb3a3' },
    ],
    note: '看不见的：Mg-EDTA 带来的 Mg²⁺ 先与铬黑 T 结合成 MgIn⁻；EDTA 先夺游离 Ca²⁺、最后才夺 MgIn⁻ 里的 Mg²⁺——全程 Mg 守恒，终点敏锐但读数不受影响。',
  };
  const tail = {
    title: i === 9 ? '水质评价' : '计算与差减',
    items: [
      { label: 'CaY²⁻', n: 22, color: '#3f9e8f' },
      { label: 'MgY²⁻', n: 6, color: '#2fb3a3' },
      { label: 'HIn²⁻', n: 6, color: '#244eb0' },
    ],
    note: i === 9
      ? '镁硬度由两个数相减而来，相对不确定度约为总硬度的 7 倍——它是这份报告里最不可靠的数字。'
      : '看不见的：三个浓度共用同一个 c(EDTA)——标定偏、钙与总一起偏；但在差减里 c(EDTA) 会约掉，镁硬度几乎不受影响。',
  };
  return tail;
}

/* ---------- 读数与文字 ---------- */

function readings(i, r, ops) {
  const pct = xs => xs.map(x => x.toFixed(2)).join(' / ');
  if (i === 0) return [
    { k: 'EDTA 名义浓度', v: r.nominal.cRounded.toFixed(5), unit: ' mol/L' },
    { k: 'M(EDTA·2Na)', v: '372.24', unit: ' g/mol' },
  ];
  if (i <= 2) return [
    { k: '基准物质量', v: ops.mCaCO3.toFixed(4), unit: ' g' },
    { k: '定容体积', v: '100.00', unit: ' mL' },
  ];
  if (i === 3) return [
    { k: '每份 n(Ca²⁺)', v: r.std.nAliquot.toExponential(3), unit: ' mol' },
    { k: '预加 EDTA', v: String(ops.preAddEDTA), unit: ' mL（不记数）',
      tone: ops.preAddEDTA < 15 ? 'warn' : undefined },
  ];
  if (i === 4) return [
    { k: 'c(EDTA)', v: r.std.reportedC.toFixed(5), unit: ' mol/L',
      tone: r.std.relativeRangePct <= 1 ? 'good' : 'bad' },
    { k: '三份相对偏差', v: pct(r.std.deviationsPct), unit: ' %' },
    { k: '全距', v: r.std.range.toFixed(2), unit: ' mL' },
    { k: '相对极差', v: r.std.relativeRangePct.toFixed(2), unit: ' %',
      tone: r.std.relativeRangePct <= 1 ? 'good' : 'bad' },
  ];
  if (i === 5) return [
    { k: '钙硬度三份', v: r.report.ca.reported.map(x => x.toFixed(1)).join(' / '), unit: ' mg/L' },
    { k: '平均', v: r.report.ca.mean.toFixed(1), unit: ' mg/L（CaO）', tone: r.report.ca.ok ? 'good' : 'bad' },
    { k: '相对极差', v: r.report.ca.relativeRangePct.toFixed(2), unit: ' %', tone: r.report.ca.ok ? 'good' : 'bad' },
  ];
  if (i === 6) return [
    { k: '总硬度三份', v: r.report.tot.reported.map(x => x.toFixed(1)).join(' / '), unit: ' mg/L' },
    { k: '平均', v: r.report.tot.mean.toFixed(1), unit: ' mg/L（CaO）', tone: r.report.tot.ok ? 'good' : 'bad' },
    { k: '相对极差', v: r.report.tot.relativeRangePct.toFixed(2), unit: ' %', tone: r.report.tot.ok ? 'good' : 'bad' },
  ];
  if (i === 7) return [
    { k: 'c(EDTA)', v: r.std.reportedC.toFixed(5), unit: ' mol/L' },
    { k: '钙硬度', v: r.report.ca.mean.toFixed(1), unit: ' mg/L（CaO）' },
    { k: '总硬度', v: r.report.tot.mean.toFixed(1), unit: ' mg/L（CaO）' },
  ];
  if (i === 8) {
    const mg = r.report.mg;
    const out = [{ k: '总 − 钙（以 CaO 计）', v: mg.byCaO.toFixed(1), unit: ' mg/L' }];
    if (ops.mgReport === 0) out.push({ k: '镁硬度（MgO）', v: mg.reportedMgO.toFixed(1), unit: ' mg/L', tone: 'good' });
    else if (ops.mgReport === 1) out.push({ k: '镁硬度（忘换算）', v: mg.wrongNoConvert.toFixed(1), unit: ' mg/L', tone: 'bad' });
    else if (ops.mgReport === 2) out.push({ k: '镁硬度（换算方向反）', v: mg.wrongInverted.toFixed(1), unit: ' mg/L', tone: 'bad' });
    else out.push({ k: '钙硬度（被错换算 ×0.7186）', v: mg.wrongOnCalcium.toFixed(1), unit: ' mg/L', tone: 'bad' });
    return out;
  }
  return [
    { k: '总硬度', v: r.report.tot.mean.toFixed(1), unit: ' mg/L（CaO）' },
    { k: '德国度', v: r.report.degrees.total.toFixed(2), unit: ' °d' },
    { k: '水质分级', v: r.report.grade, tone: 'good' },
    { k: '饮用水（≤25 °d）', v: r.report.potable ? '符合' : '不符合', tone: r.report.potable ? 'good' : 'bad' },
  ];
}

function observation(i, r, ops) {
  if (i === 3) return `已预加 ${ops.preAddEDTA} mL EDTA（不记数）；游离 [Ca²⁺] 被压低，再加缓冲不会析出 Ca(OH)₂。`;
  if (i === 4) return `标定得 c(EDTA) = ${r.std.reportedC.toFixed(5)} mol·L⁻¹；终点由紫红刚变纯蓝，30 s 不褪。`;
  if (i === 5) return `钙硬度三份：${r.report.ca.reported.map(x => x.toFixed(1)).join('、')} mg/L（CaO），平均 ${r.report.ca.mean.toFixed(1)}；瓶底有 Mg(OH)₂ 白色沉淀。`;
  if (i === 6) return `总硬度三份：${r.report.tot.reported.map(x => x.toFixed(1)).join('、')} mg/L（CaO），平均 ${r.report.tot.mean.toFixed(1)}。`;
  if (i === 7) return `c(EDTA) = ${r.std.reportedC.toFixed(5)} mol·L⁻¹；钙 ${r.report.ca.mean.toFixed(1)}、总 ${r.report.tot.mean.toFixed(1)} mg/L（CaO）。`;
  if (i === 8) return `总 − 钙 = ${r.report.mg.byCaO.toFixed(1)} mg/L（以 CaO 计）；× 0.7186 → ${r.report.mg.reportedMgO.toFixed(1)} mg/L（以 MgO 计）。`;
  if (i === 9) return `总硬度 ${r.report.tot.mean.toFixed(1)} mg/L（CaO）= ${r.report.degrees.total.toFixed(2)} °d，属${r.report.grade}${r.report.potable ? '，符合' : '，超出'}饮用水要求（≤25 °d）。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.preAddEDTA < 15) {
    out.push(`标定前只预加了 ${ops.preAddEDTA} mL EDTA（要求约 15 mL）：加氨性缓冲后游离 [Ca²⁺] 仍高，会析出 Ca(OH)₂，终点拖后、读数偏大 → c(EDTA) 偏高 → 两组硬度一起偏高。注意这 ${ops.preAddEDTA} mL 也要算进「总共消耗」，不能漏记。`);
  }
  if (ops.bufferStd < 10) {
    out.push(`标定只加了 ${ops.bufferStd} mL 氨性缓冲（要求 10 mL）：pH 达不到 10，lg α_Y(H) 变大、条件稳定常数下降，终点不敏锐、读数偏大。注意测定时只加 5 mL，两者用量不同。`);
  }
  if (ops.samplePipette === 1) {
    out.push('用 25.00 mL 移液管取 4 次代替公用的 100.00 mL 移液管：移取次数增加，累积误差按 √4 放大，平行性明显变差。');
  }
  if (r.phCa == null || r.phCa < 10) {
    out.push(`钙硬度只加了 ${ops.vNaOHCa} mL NaOH（要求 2～3 mL）：pH 达不到钙指示剂最适的 10～13，指示剂无法正常显色；而且 Mg²⁺ 没有沉淀隐蔽，这一组数据不可用。`);
  } else if (r.phCa > 13.5) {
    out.push(`钙硬度加了 ${ops.vNaOHCa} mL NaOH，pH ≈ ${r.phCa.toFixed(2)}，超过 13.5：钙指示剂自身就呈酒红色，与 CaIn 无法区分，「酒红→纯蓝」的突变消失，终点判不出来（课件思考题 4 的口径）。`);
  } else if (r.mgHidden < 0.98) {
    out.push(`NaOH 偏少（pH ≈ ${r.phCa.toFixed(2)}）：Mg(OH)₂ 只沉降了约 ${(r.mgHidden * 100).toFixed(0)}%，钙那一份里混进了没隐蔽掉的 Mg²⁺，钙硬度偏高、差减出来的镁偏低。`);
  }
  if (ops.mgEDTA < 3) {
    out.push(`总硬度前只加了 ${ops.mgEDTA} mL Mg-EDTA（要求 3 mL）：水样 Mg²⁺ 少时铬黑 T 直接指示 Ca²⁺ 不敏锐（CaIn lg K = 5.4 < MgIn 7.0），终点颜色变化不明显，容易滴过。`);
  }
  if (ops.bufferTotal < 5) {
    out.push(`总硬度只加了 ${ops.bufferTotal} mL 氨性缓冲（要求 5 mL）：pH 不足 10，条件稳定常数下降，终点拖后。`);
  }
  if (ops.masking === 2) {
    out.push('水样含 Fe³⁺/Al³⁺ 而未加三乙醇胺掩蔽：这些离子与铬黑 T 生成更稳定的有色络合物（指示剂封闭），终点拖后甚至看不到颜色变化 → 结果偏高。');
  }
  if (ops.titrateSpeed === 1) {
    out.push('一开始就滴得太快：配位反应本身较慢，局部过浓会越过终点，平行性变差。');
  }
  if (ops.endpointHoldS < 30) {
    out.push(`终点只保持 ${ops.endpointHoldS} s：铬黑 T 的蓝色会慢慢褪回紫色，以 30 s 不褪为准。过早读数会使结果偏低。`);
  }
  if (ops.mgReport === 1) {
    out.push('镁硬度直接报成了 14.0 mg/L——那是「以 CaO 表示」的镁硬度，不能当 MgO 报。课件要求以 mg·L⁻¹ MgO 表示，须再乘 M(MgO)/M(CaO) = 0.7186。');
  } else if (ops.mgReport === 2) {
    out.push(`换算方向反了：14.0 ÷ 0.7186 = ${r.report.mg.wrongInverted.toFixed(1)}。M(MgO) < M(CaO)，换成 MgO 基准数值只会变小，不会变大。`);
  } else if (ops.mgReport === 3) {
    out.push(`把 0.7186 用在了钙硬度上：${r.report.ca.mean.toFixed(1)} × 0.7186 = ${r.report.mg.wrongOnCalcium.toFixed(1)}。钙硬度本来就以 CaO 表示，不需要换算。`);
  }
  for (const [k, g] of [['标定', r.std], ['钙硬度', r.report.ca], ['总硬度', r.report.tot]]) {
    if (g.relativeRangePct > 1) {
      out.push(`${k}三次平行的相对极差 ${g.relativeRangePct.toFixed(2)}%（> 1.0%），这一组应重做，不能「挑最好的一次」。`);
    }
  }
  if (!out.length) {
    out.push(`9 份滴定全部落在规范内：c(EDTA) = ${r.std.reportedC.toFixed(5)} mol/L（三份相对偏差均值 ${r.std.meanDeviationPct.toFixed(2)}%）；总硬度 ${r.report.tot.mean.toFixed(1)}、钙硬度 ${r.report.ca.mean.toFixed(1)}、镁硬度 ${r.report.mg.reportedMgO.toFixed(1)} mg/L（MgO）；${r.report.degrees.total.toFixed(2)} °d 属${r.report.grade}，符合饮用水 ≤ 25 °d 的要求。`);
    if (Math.abs(r.std.reportedC - 0.00565) > 2e-5) {
      out.push('顺带想一想：标定偏了，钙硬度和总硬度会一起偏；但两者的差——镁硬度——几乎不受影响（c(EDTA) 在差减中约掉了）。');
    }
  }
  return out;
}

/* ---------- 附表与数轴 ---------- */

function addTable(host, r) {
  const wrap = h('div', { class: 'lab-table-wrap' });
  const meanOf = vs => (vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2);
  const row = (name, g) => h('tr', {},
    h('td', {}, name),
    ...g.volumes.map(v => h('td', {}, v.toFixed(2))),
    h('td', {}, meanOf(g.volumes)),
    h('td', {}, g.range.toFixed(2)),
    h('td', {}, `${g.relativeRangePct.toFixed(2)}%`));
  const table = h('table', { class: 'lab-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, '滴定组'), h('th', {}, '第 1 次'), h('th', {}, '第 2 次'), h('th', {}, '第 3 次'),
      h('th', {}, '平均 / mL'), h('th', {}, '全距 / mL'), h('th', {}, '相对极差'))),
    h('tbody', {},
      row('EDTA 标定', r.std),
      row('钙硬度（Ca）', r.report.ca),
      row('总硬度（Ca,Mg）', r.report.tot)));
  wrap.append(table);
  wrap.append(h('div', { class: 'lab-caption' },
    `c(EDTA) = ${r.std.reportedC.toFixed(5)} mol/L（相对偏差 ${r.std.deviationsPct.map(x => x.toFixed(2)).join(' / ')} %，均值 ${r.std.meanDeviationPct.toFixed(2)}%）`));
  wrap.append(h('div', { class: 'lab-caption' },
    `硬度（mg/L，以 CaO 计）：钙 ${r.report.ca.mean.toFixed(1)}、总 ${r.report.tot.mean.toFixed(1)}；` +
    `Mg = (${r.report.tot.mean.toFixed(1)} − ${r.report.ca.mean.toFixed(1)}) × ${r.report.mg.factor.toFixed(4)} = ${r.report.mg.reportedMgO.toFixed(1)}（MgO）`));
  host.append(wrap);
}

/* ---------- 挂载 ---------- */

/**
 * 差减法的不确定度放大：用文字讲清楚，不用数轴——
 * NumberLine 的棒长是「误差」而本处误差（0.1~0.3）相对数值（14~94）太小，
 * 画出来是三个看不见的点；何况镁硬度相对标准差 ~2.4% 是它的教学意义所在。
 */
function uncertaintyNote(host, r) {
  const pctOf = (sd, mean) => sd / mean * 100;
  const sdCa = stdev(r.report.ca.values);
  const sdTot = stdev(r.report.tot.values);
  const sdMg = Math.sqrt(sdCa * sdCa + sdTot * sdTot) * r.report.mg.factor;
  const relMg = pctOf(sdMg, r.report.mg.reportedMgO);
  const relTot = pctOf(sdTot, r.report.tot.mean);
  host.append(h('div', { class: 'lab-caption' },
    `差减法放大不确定度：平行测定的相对标准差——钙硬度约 ${pctOf(sdCa, r.report.ca.mean).toFixed(1)}%、` +
    `总硬度约 ${relTot.toFixed(1)}%，而两者之差镁硬度约 ${relMg.toFixed(1)}%（放大约 ${Math.round(relMg / relTot)} 倍）——` +
    '镁硬度是这份报告里最不可靠的数字。'));
}

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species,
    observation, verdict, readings,
    equation: 'Ca²⁺ + HIn²⁻ ⇌ CaIn⁻ + H⁺（酒红）；CaIn⁻ + Y⁴⁻ → CaY²⁺ + HIn²⁻（纯蓝）',
    calculation: (i, r) => {
      const g = r.report;
      if (i === 4) return `c(EDTA) = n(Ca²⁺) ÷ V̄ = ${r.std.reportedC.toFixed(5)} mol/L；相对偏差 ${r.std.deviationsPct.map(x => x.toFixed(2)).join(' / ')} %（均值 ${r.std.meanDeviationPct.toFixed(2)}%）`;
      if (i === 5) {
        if (r.phCa == null || r.phCa < 10) {
          return 'NaOH 不足：Mg²⁺ 没有沉淀隐蔽，这一份滴的实际上也是 Ca + Mg 总量——钙硬度无法单独测出。';
        }
        // 按**实际 pH** 算残余量与 lg(c·K′)，不写死 pH 12（NaOH 用量不同时数字要跟着变）
        const resid = residualMagnesiumAtPH({ ph: r.phCa });
        const lgCKp = conditionalLgK(LGK_MG, r.phCa) + Math.log10(resid.cMgResidual);
        return `pH ≈ ${r.phCa.toFixed(2)} 时 Mg²⁺ 被隐蔽到 ${resid.cMgResidual.toExponential(1)} mol/L，lg(c·K′) = ${lgCKp.toFixed(2)} ≪ 6：这一份滴的只有 Ca²⁺。`;
      }
      if (i === 6) return `pH 10：lg(c·K′) 钙 ${g.window.lgCKpCa10.toFixed(2)}（≥6，可准确滴定）；镁 ${g.window.lgCKpMg10.toFixed(2)}——镁是少量组分，不靠自身突跃，终点靠 MgIn⁻ 变色敏锐，读数不受影响。`;
      if (i === 7) return `c(EDTA) = ${r.std.reportedC.toFixed(5)} mol/L；钙 ${g.ca.mean.toFixed(1)}、总 ${g.tot.mean.toFixed(1)} mg/L（CaO）`;
      if (i === 8) return `MgO = (${g.tot.mean.toFixed(1)} − ${g.ca.mean.toFixed(1)}) × ${g.mg.factor.toFixed(4)} = ${g.mg.reportedMgO.toFixed(1)} mg/L`;
      if (i === 9) return `°d = ${g.tot.mean.toFixed(1)} ÷ 10 = ${g.degrees.total.toFixed(2)} °d → ${g.grade}`;
      return STEPS[i].calc;
    },
    modelNote: '说明：计量关系（EDTA 1:1、稀释倍数、德国度 1 °d = 10 mg CaO/L、MgO 换算因数 40.30/56.08 = 0.7186）按课件 P33–P34 原式计算，可用计算器逐位核对。'
      + '三份平行读数的离差取自课件 P34 记录表本身（标定 25.04/25.10/25.12 等），不是随机数；'
      + '操作不规范（预加 EDTA 不足、缓冲量不足、滴定过快、终点保持不足、Mg-EDTA 不足、指示剂封闭、水样移取方式、NaOH 用量）对读数的影响与平行离差的放大，是方向性教学标定模型——只保证方向与量级合理，不代表实测误差。'
      + '平行性判据「相对极差 ≤ 1.0%」是教学参照线（课件未规定判据）。'
      + '另：课件正文称「总硬度约十几 mL、钙硬度几 mL」，与 P34 范例表（29.7 / 25.3 mL）不一致，本模拟器以 P34 表为准。',
    extra: (host, i, r) => {
      if (i >= 3) addTable(host, r);
      if (i === 7 || i === 8) uncertaintyNote(host, r);
    },
  });
}

/**
 * 供自检页（`_scenes-all.html` / `_scenes-test.html`）读取的最小场景描述。
 * 有了它，自检页就不必**手抄**步骤名——sim 里改一步，自检页跟着变。
 * 引用的全是模块级标识符，不会与 mount 里那份漂移。
 */
export const sceneSpec = { id: meta.id, name: meta.name, steps: STEPS, guide: GUIDE, model, draw };
