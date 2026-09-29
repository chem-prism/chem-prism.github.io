/**
 * 实验 09：硫酸亚铁铵中 Fe³⁺ 含量的测定（分光光度法）。
 *
 * 课件核心：KSCN 显色（血红色硫氰酸铁配合物）、λmax 处测标准系列、
 * 由标准曲线求试样里那一点点 Fe³⁺ 杂质——Fe²⁺ 是主体、不显色；
 * 除氧水、酸度、比色皿配对、同批同波长测量，每一步都有代价。
 *
 * 计量式全在 chem.js 的「硫酸亚铁铵中 Fe³⁺ 含量（分光光度法）」一节，
 * 可 node 验算；显色/仪器操作偏差是**教学标定模型**，在本文件 model() 中逐项标注。
 */
import { h, noteAt } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  FE_SPEC, fe3StandardSeries, fe3Molarity, fe3Spectrum, fe3MinPH,
  fe3ContentFromCurve, linearFit, molarAbsorptivity, absorbance,
  thiocyanateColor, fe3Grade,
} from '../chem.js';
import {
  balance, hotplate, volumetricFlask, beaker, reagentBottle, pipette,
  cuvette, spectrophotometer, stopwatch, drawBench, CLEAR_COLOR,
} from '../glassware.js';
import { Chart, sample } from '../chart.js';

export const meta = {
  id: 'fe3-spec',
  name: 'Fe³⁺ 含量测定（分光光度法）',
  wave: '实验 09',
  accent: '--w-amber',
  desc: 'KSCN 显色、λmax 处拉一条标准曲线——量的是产品里那一点点 Fe³⁺ 杂质，而 Fe²⁺ 主体根本不显色。',
};

const GUIDE = {
  mSample: 0.3750,
  developMinutes: 10,
  cuvettePaired: 0,
  deaerated: 0,
  transfer: 0,
  sampleWavelength: 0,
  acidVolume: 5.0,
  reagentBatch: 0,
  cellHandling: 0,
};
// 练习模式初值：故意留 4 处不规范——显色、器皿、试样制备、波长
const DEFAULTS = {
  ...GUIDE,
  developMinutes: 6,   // 显色未完全（标准与试样同批，误差部分相消——诊断里会讲清）
  cuvettePaired: 1,    // 比色皿未配对 → 试样读数直接偏高
  deaerated: 1,        // 试样用未除氧的水 → 溶解氧再氧化 Fe²⁺
  sampleWavelength: 1, // 样品错用 500 nm，与标准曲线不同波长
};
const CONTROLS = [
  { key: 'mSample', label: '试样质量', unit: ' g', min: 0.30, max: 0.40, step: 0.0001 },
  { key: 'deaerated', label: '试样用水', options: ['纯水已煮沸冷却除氧', '直接用未除氧纯水（错误）'] },
  { key: 'transfer', label: '试样转移', options: ['完全转移（烧杯冲洗 3 次）', '有残留未转移（错误）'] },
  { key: 'acidVolume', label: '1:4 H₂SO₄ 加入量', unit: ' mL', min: 0, max: 5, step: 0.5 },
  { key: 'developMinutes', label: '显色静置时间', unit: ' min', min: 0, max: 20, step: 1 },
  { key: 'reagentBatch', label: '测量批次', options: ['样品与标准同批显色、同仪器测量', '样品滞后一批单独测（错误）'] },
  { key: 'cuvettePaired', label: '比色皿配对', options: ['已配对（差值 ≤ 0.005）', '未配对（错误）'] },
  { key: 'cellHandling', label: '比色皿取放', options: ['持毛面、V 标记朝同一方向', '手摸光面、方向随意（错误）'] },
  { key: 'sampleWavelength', label: '样品测量波长', options: ['与标准曲线相同（480 nm）', '改用 500 nm（错误）'] },
];

const STEPS = [
  {
    name: '准备工作（除氧水与试剂）',
    op: '烧杯中取纯水 60 mL 煮沸后冷却（去除溶解 O₂）；另用烧杯分别取 50 mL 1:4 H₂SO₄ 与 50 mL 20% KSCN 待用（用多少取多少，多取不能倒回）。',
    why: '溶解氧会把试样里的 Fe²⁺ 继续氧化成 Fe³⁺——这一实验测的就是 Fe³⁺，水不除氧，测出的「杂质」里就混进了实验过程中新生成的部分（课前小测考点）。',
    eq: 'O₂(aq) ⇌ O₂↑（煮沸驱除）',
    calc: '60 mL 除氧水足够配 6 份标准 + 1 份试样（每份约 15~30 mL）',
  },
  {
    name: '配制实验用铁标准溶液',
    op: '移取 20.00 mL 100.0 µg·mL⁻¹ 铁标准溶液于 100 mL 容量瓶，加 8 mL 1 mol·L⁻¹ H₂SO₄，用水稀释至刻度、摇匀，得 20.00 µg·mL⁻¹ 铁标液。',
    why: '稀释倍数要精确（移液管 + 容量瓶）；加酸是为了让标液保持酸性、Fe³⁺ 不水解。',
    eq: 'c = 100.0 × 20.00 ÷ 100.0',
    calc: '100.0 × 20.00 ÷ 100.0 = 20.00 µg·mL⁻¹',
  },
  {
    name: '配制标准系列',
    op: '6 只 50 mL 容量瓶，用吸量管分别加入 20.00 µg·mL⁻¹ 铁标液 0.00、2.00、4.00、6.00、8.00、10.00 mL，再各加 5.00 mL 1:4 H₂SO₄、5.00 mL 20% KSCN，去离子水稀释至刻度、摇匀。',
    why: '每份含铁量 = 体积 × 20.00 µg/mL，从 0 到 200 µg——这是标准曲线的横坐标。0.00 mL 那份是「试剂空白」，测样时它就是参比。',
    eq: '[Fe³⁺] + nSCN⁻ ⇌ [Fe(SCN)ₙ]³⁻ⁿ（血红色）',
    calc: '2.00 × 20.00 = 40 µg……10.00 × 20.00 = 200 µg',
  },
  {
    name: '配制试样溶液',
    op: '分析天平准确称取 0.3～0.4 g 硫酸亚铁铵试样于 50 mL 烧杯，用 15 mL 不含 O₂ 的蒸馏水溶解后完全转移至 50 mL 容量瓶，加 5.00 mL 1:4 H₂SO₄、5.00 mL 20% KSCN，用无氧水稀释至刻度、摇匀。',
    why: '★ 两处关键：溶解和定容都必须用无氧水（否则 Fe²⁺ 被氧化、Fe³⁺ 读数虚高）；烧杯要冲洗 3 次确保完全转移。颜色比标准深很多时要减量重配。',
    eq: 'Fe²⁺ 不显色——这一步只测试样里原有的 Fe³⁺',
    calc: '0.3750 g × 0.17 mg/g ≈ 0.064 mg = 64 µg（教学场景试样真值）',
  },
  {
    name: '比色皿配对',
    op: '在固定波长下先测空皿基线（A₁ = 0.000），再依次测其余几只（A₂、A₃、A₄），挑差值 ≤0.005 的一对使用；拿放持毛面，V 标记面始终朝同一方向。',
    why: '两只比色皿的玻璃厚度、透光不可能完全一样，不配对就带着系统偏差测样；V 面朝同一方向，每次光路经过的总是同样的两面。',
    eq: 'ΔA = |Aᵢ − A₁| ≤ 0.005',
    calc: '配对读数例：0.000 / 0.003 / 0.001 / 0.004——选 0.000 与 0.001 这一对',
  },
  {
    name: '绘制吸收曲线、确定 λmax',
    op: '标准溶液放置 10 min 后，用 1 cm 比色皿、以试剂空白为参比，以最浓标准（10.00 mL 那份）为待测，测 400～600 nm 的吸收曲线（先每 10 nm 一点，峰附近每 5 或 2 nm）。每换一次波长，参比都要重新调零。',
    why: '★ 在 λmax 处测灵敏度最高、误差最小；「每换波长重新调零」是因为检测器的基准随波长变化。溶液吸收的是绿光，所以呈现补色——红色。',
    eq: 'A(λ) = ε(λ)·b·c；A = −lg T',
    calc: 'λmax ≈ 480 nm（课件示意值；溶液吸绿光 → 呈红色）',
  },
  {
    name: '显色静置 10 min',
    op: '所有溶液配好后避光放置 10 min，让显色反应平衡；标准与试样要在同一批、同一台仪器上测量。',
    why: '硫氰酸铁配合物的显色需要时间达到稳定；标准与试样同批显色、同仪器同波长测量，系统误差才会相互抵消（课件：溶液全部配好后再一同测量）。',
    eq: '显色平衡：Fe³⁺ + SCN⁻ 的配位平衡建立需要数分钟',
    calc: '课件要求：避光静置 10 min；仪器预热 30 min 以上',
  },
  {
    name: '测标准系列、作标准曲线',
    op: '在 λmax 处、以试剂空白为参比，用 1 cm 比色皿依次测 6 份标准溶液的吸光度；以含铁量（µg）为横坐标、A 为纵坐标作图（或线性回归）。',
    why: '吸光度与含铁量成正比（A = εbc）——曲线通过原点、r² 应接近 1；斜率越大灵敏度越高，本实验中斜率对应 ε ≈ 1.0×10⁴ L·mol⁻¹·cm⁻¹（思考题 4）。',
    eq: 'A = εbc（朗伯-比尔定律，仅适用于稀溶液与单色光）',
    calc: '教学场景的六点：0 / 40 / 80 / 120 / 160 / 200 µg → A = 0.000 / 0.143 / 0.287 / 0.430 / 0.573 / 0.716',
  },
  {
    name: '测试样、由曲线求含量',
    op: '试样溶液放置 10 min 后，在 λmax 处、同参比、同 1 cm 比色皿测吸光度；从标准曲线求出这一份里的 Fe³⁺ 量（µg），再折算成试样中的质量分数与 mg·g⁻¹。',
    why: '★ 读数必须落在标准曲线范围内；结果报 mg Fe³⁺/g 产品（或百分含量），并对照莫尔盐的 Fe³⁺ 级别：Ⅰ ≤0.05、Ⅱ ≤0.10、Ⅲ ≤0.20 mg/g。',
    eq: 'ug = A ÷ 斜率；w(Fe³⁺) = ug ÷ 1000 ÷ m样品 × 100%',
    calc: 'A = 0.229 → 64.0 µg → 0.171 mg/g → Ⅲ 级（教学场景值）',
  },
  {
    name: '计算 ε 与讨论',
    op: '由标准曲线斜率求摩尔吸光系数 ε（思考题 4）；讨论：文献中硫氰酸铁的 λmax 是多少？第一份标准溶液 A 不是 0.000 可能因为什么？',
    why: '★ ε = 斜率 ÷ 每 µg·mL⁻¹ 的摩尔浓度 ÷ b——它是「灵敏度」的定量说法。第一份 A≠0.000 说明比色皿或试剂有污染，要先查清原因再测量（思考题 3）。',
    eq: 'ε = slope ÷ (1 µg·mL⁻¹ 的 mol·L⁻¹ 数) ÷ b',
    calc: 'ε = 0.179 ÷ 1.791×10⁻⁵ ÷ 1.0 ≈ 1.0×10⁴ L·mol⁻¹·cm⁻¹（教学设定值）',
  },
];

/**
 * 试样真值（教学场景）：Fe³⁺ 0.1707 mg/g 的莫尔盐产品（Ⅲ 级）。
 * 0.3750 g 试样→ 50 mL 容量瓶中含 64.0 µg Fe³⁺（0.1707 mg/g × 0.375 g ≈ 0.0640 mg = 64.0 µg）。
 */
const SAMPLE_UG_AT_0375 = 64.0;

function model(ops) {
  const spec = fe3StandardSeries();                       // 6 份：0~200 µg
  // 显色完成度（⚠️ 教学标定：<10 min 未完全；标准与试样同批显色 → 同步偏低）
  const fDev = ops.developMinutes >= 10 ? 1 : 0.5 + 0.05 * ops.developMinutes;
  const aStd = spec.map(s => absorbance(FE_SPEC.eps, FE_SPEC.b, fe3Molarity(s.ugPerMl)) * fDev);
  const fit = linearFit({ xs: spec.map(s => s.ug), ys: aStd });

  // —— 试样 ——
  let ugTrue = SAMPLE_UG_AT_0375 * (ops.mSample / 0.3750);       // 真值随称样量线性
  if (ops.deaerated === 1) ugTrue += 12;                          // 溶解氧再氧化 Fe²⁺（⚠️ 教学估计：+12 µg/份）
  if (ops.transfer === 1) ugTrue *= 0.97;                         // 残留未转移（⚠️ 教学模型 −3%）
  let aSample = absorbance(FE_SPEC.eps, FE_SPEC.b, fe3Molarity(ugTrue / FE_SPEC.vFlask)) * fDev;
  if (ops.sampleWavelength === 1) aSample *= fe3Spectrum({ lambda: 500, aMax: 1 });   // 错用 500 nm
  if (ops.cuvettePaired === 1) aSample += 0.012;                  // 未配对：器皿差直接加在读数上
  if (ops.reagentBatch === 1) aSample *= 0.98;                    // 滞后一批（⚠️ 教学模型）
  if (ops.cellHandling === 1) aSample *= 1.04;                    // 光面指纹散射（⚠️ 教学模型）

  // —— 酸度（⚠️ 教学模型）：pH 随加酸量下降；超过临界 pH 则 Fe³⁺ 水解、溶液发浑 ——
  const cFeSample = fe3Molarity(ugTrue / FE_SPEC.vFlask);
  const phCrit = fe3MinPH({ cFe: cFeSample });
  const phAcid = Math.min(4.2, 0.5 + 0.7 * (5 - ops.acidVolume));
  const hydrolyzed = phAcid > phCrit;
  if (hydrolyzed) aSample *= 1.10;

  const res = fe3ContentFromCurve({ aSample, slope: fit.slope, intercept: fit.intercept, mSample: ops.mSample });
  const grade = fe3Grade(res.mgPerG);
  const eps = molarAbsorptivity({ slopePerUg: fit.slope });
  // 吸收曲线：峰高取最浓标准（教学标定谱形，峰位 480 nm）
  const aMax = aStd[5];
  return { spec, aStd, fit, aSample, res, grade, eps, phAcid, phCrit, hydrolyzed, fDev, aMax, ugTrue };
}

/* ---------- 宏观层 ---------- */

/** 标准/试样溶液的颜色（血红色，按含铁量走三通道吸收模型） */
function feColor(ug, alpha = 0.8) {
  if (ug <= 1e-6) return CLEAR_COLOR;
  const c = thiocyanateColor(ug / 1000);          // 输入 mg
  return [c[0], c[1], c[2], alpha];
}


function flaskRow(ctx, B, cx, items, w = 46) {
  // items: [{ug, label}]，从左到右排在台面上
  const gap = 6;
  const total = items.length * w + (items.length - 1) * gap;
  let x = cx - total / 2;
  items.forEach(it => {
    const box = { x, y: B - 118, w, h: 118 };
    volumetricFlask(ctx, box, { liquid: feColor(it.ug), level: 0.55 });
    ctx.save();
    ctx.font = '9px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(160,180,196,0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(it.label, x + w / 2, B + 6);
    ctx.restore();
    x += w + gap;
  });
}

function draw(ctx, W, H, t, i, r, ops) {
  const B = drawBench(ctx, W, H);
  const cx = W / 2;

  if (i === -1) {
    spectrophotometer(ctx, { x: cx - 170, y: B - 190, w: 210, h: 190 }, { wavelength: 480, reading: '——', cell: CLEAR_COLOR });
    flaskRow(ctx, B, cx + 90, [
      { ug: 0, label: '0' }, { ug: 80, label: '80' }, { ug: 200, label: '200' },
    ], 34);
    return;
  }
  if (i === 0) {
    hotplate(ctx, { x: cx - 150, y: B - 58, w: 190, h: 58 }, { heat: 0.8, steam: 0.35, t });
    beaker(ctx, { x: cx - 135, y: B - 165, w: 92, h: 107 }, { liquid: [225, 232, 238, 0.24], level: 0.5 });
    reagentBottle(ctx, { x: cx + 20, y: B - 130, w: 50, h: 130 },
      { liquid: CLEAR_COLOR, level: 0.6, label: ['1:4 H₂SO₄'] });
    reagentBottle(ctx, { x: cx + 82, y: B - 130, w: 50, h: 130 },
      { liquid: CLEAR_COLOR, level: 0.6, label: ['20% KSCN'] });
    noteAt(ctx, cx - 135, B - 186, '煮沸除 O₂，冷却后使用', '#e8a33d');
    return;
  }
  if (i === 1) {
    reagentBottle(ctx, { x: cx - 150, y: B - 140, w: 54, h: 140 },
      { liquid: feColor(200, 0.5), level: 0.6, label: ['铁标液', '100 µg/mL'] });
    pipette(ctx, { x: cx - 60, y: B - 170, w: 120, h: 26 }, { angle: -0.5 });
    volumetricFlask(ctx, { x: cx + 20, y: B - 210, w: 96, h: 210 }, { liquid: feColor(200, 0.5), level: 0.6 });
    noteAt(ctx, cx + 74, B - 232, '8 mL 1 M H₂SO₄ → 100 mL', 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 2) {
    flaskRow(ctx, B, cx, r.spec.map((s, k) => ({ ug: s.ug, label: String(s.ug) })));
    noteAt(ctx, 14, 40, '0 / 2 / 4 / 6 / 8 / 10 mL 铁标液 + 各 5.00 mL 酸与 KSCN → 50 mL', 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 3) {
    balance(ctx, { x: cx - 155, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: [150, 214, 204, 0.8], reading: ops.mSample.toFixed(4) });
    volumetricFlask(ctx, { x: cx + 30, y: B - 210, w: 96, h: 210 }, { liquid: feColor(r.ugTrue), level: 0.6 });
    noteAt(ctx, cx - 155, B - 168, '无氧水溶解、完全转移', '#e8a33d');
    return;
  }
  if (i === 4) {
    spectrophotometer(ctx, { x: cx - 170, y: B - 190, w: 210, h: 190 },
      { wavelength: 480, reading: '0.000', cell: CLEAR_COLOR });
    const diffs = ops.cuvettePaired === 0 ? [0.000, 0.003, 0.001, 0.004] : [0.000, 0.014, 0.006, 0.011];
    diffs.forEach((d, k) => {
      const bx = cx + 56 + k * 30;
      cuvette(ctx, { x: bx, y: B - 74, w: 20, h: 68 }, { liquid: CLEAR_COLOR });
      ctx.save();
      ctx.font = '9px ui-monospace, Menlo, monospace';
      ctx.fillStyle = k === 0 ? 'rgba(160,180,196,0.9)' : (d > 0.005 ? '#e05a4f' : 'rgba(160,180,196,0.9)');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(d.toFixed(3), bx + 10, B + 6);
      ctx.restore();
    });
    noteAt(ctx, 14, 40, ops.cuvettePaired === 0 ? '配对差值 ≤ 0.005 ✓' : '配对差值超 0.005 ✗', ops.cuvettePaired === 0 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    return;
  }
  if (i === 5) {
    spectrophotometer(ctx, { x: cx - 170, y: B - 190, w: 210, h: 190 },
      { wavelength: 480, reading: r.aMax.toFixed(3), cell: feColor(200) });
    noteAt(ctx, 14, 40, '试剂空白参比 · 最浓标准扫描 · 每换波长重新调零', 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 6) {
    flaskRow(ctx, B, cx - 40, r.spec.map((s, k) => ({ ug: s.ug, label: String(s.ug) })), 40);
    stopwatch(ctx, { x: cx + 160, y: B - 130, w: 58, h: 80 }, { text: `${ops.developMinutes}:00` });
    noteAt(ctx, 14, 40, ops.developMinutes >= 10 ? '避光静置 10 min（同批一起测）' : `只静置了 ${ops.developMinutes} min——显色未完全`, ops.developMinutes >= 10 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    return;
  }
  if (i === 7) {
    spectrophotometer(ctx, { x: cx - 170, y: B - 190, w: 210, h: 190 },
      { wavelength: 480, reading: r.aStd[5].toFixed(3), cell: feColor(200) });
    // 台面放不下 6 瓶 + 整机，这里只摆代表点（0 / 120 / 200 µg）
    flaskRow(ctx, B, cx + 125, [r.spec[0], r.spec[3], r.spec[5]].map(s => ({ ug: s.ug, label: String(s.ug) })), 38);
    return;
  }
  if (i === 8) {
    spectrophotometer(ctx, { x: cx - 170, y: B - 190, w: 210, h: 190 },
      { wavelength: ops.sampleWavelength === 1 ? 500 : 480, reading: r.aSample.toFixed(3), cell: feColor(r.ugTrue) });
    volumetricFlask(ctx, { x: cx + 70, y: B - 200, w: 92, h: 200 }, { liquid: feColor(r.ugTrue), level: 0.6 });
    noteAt(ctx, 14, 40, ops.sampleWavelength === 1 ? '样品用了 500 nm——标准曲线是 480 nm 的' : '同波长、同参比、同批测量', ops.sampleWavelength === 1 ? '#e05a4f' : 'rgba(160,180,196,0.9)');
    return;
  }
  // i === 9：计算与讨论
  spectrophotometer(ctx, { x: cx - 170, y: B - 190, w: 210, h: 190 },
    { wavelength: 480, reading: r.aSample.toFixed(3), cell: feColor(r.ugTrue) });
  noteAt(ctx, 14, 40, `ε ≈ ${r.eps.toExponential(1)} L·mol⁻¹·cm⁻¹（由标准曲线斜率求得）`);
  noteAt(ctx, 14, 58, `试样 Fe³⁺ ${r.res.mgPerG.toFixed(3)} mg/g → ${r.grade} 级`, 'rgba(160,180,196,0.9)');
}

/* ---------- 微观层 ---------- */

function species(i, r, ops) {
  if (i === 0) return {
    title: '除氧水',
    items: [
      { label: 'H₂O', n: 22, color: '#d6e0e7' },
      { label: 'O₂', n: 8, color: '#9aa7b6' },
    ],
    note: '看不见的：煮沸赶走的是溶解氧——它会把 Fe²⁺ 氧化成 Fe³⁺，让测出的「杂质」虚高。',
  };
  if (i === 1) return {
    title: '铁标准溶液',
    items: [
      { label: 'Fe³⁺', n: 10, color: '#c8842a' },
      { label: 'H⁺', n: 8, color: '#e0574f' },
      { label: 'SO₄²⁻', n: 6, color: '#d9d9df' },
      { label: 'H₂O', n: 16, color: '#d6e0e7' },
    ],
    note: '加酸不只是「调 pH」——它让 Fe³⁺ 以离子态稳定存在，不发生水解。',
  };
  if (i === 2) return {
    title: '显色体系（标准系列）',
    items: [
      { label: '[Fe(SCN)]²⁺', n: r ? Math.min(14, 2 + Math.round(r.spec[2].ug / 40)) : 6, color: '#d05a83' },
      { label: 'SCN⁻（过量）', n: 12, color: '#e8a33d' },
      { label: 'Fe³⁺（游离）', n: 2, color: '#c8842a' },
    ],
    note: '看不见的：SCN⁻ 大大过量，显色平衡被推向配合物一侧——这是「同一实验条件下显色程度一致」的前提。',
  };
  if (i === 3) return {
    title: '试样溶液（Fe²⁺ 才是主体）',
    items: [
      { label: 'Fe²⁺', n: 22, color: '#2fb3a3' },
      { label: 'Fe³⁺（杂质）', n: 3, color: '#c8842a' },
      { label: 'NH₄⁺', n: 8, color: '#9aa7b6' },
      { label: 'SO₄²⁻', n: 8, color: '#d9d9df' },
    ],
    note: '看不见的：这杯里绝大多数是 Fe²⁺——它不显色；这一实验测的就是旁边那一点点 Fe³⁺。除氧水的作用就是不让这个「一点点」变多。',
  };
  if (i === 4) return {
    title: '比色皿与配对',
    items: [
      { label: '[Fe(SCN)]²⁺', n: 6, color: '#d05a83' },
      { label: '光', n: 4, color: '#e8a33d' },
    ],
    note: '看不见的：两只皿的玻璃厚度、透光本就不同——配对就是让两只皿的「差」小于 0.005 A，别把这部分算进溶液。',
  };
  if (i === 5) return {
    title: '选择性吸收',
    items: [
      { label: '[Fe(SCN)]²⁺', n: 8, color: '#d05a83' },
      { label: '绿光（被吸收）', n: 6, color: '#6bbc57' },
      { label: '红光（透过）', n: 6, color: '#e0574f' },
    ],
    note: '看不见的：溶液吸收的是 480 nm 附近的绿光，剩下的红光照进眼睛——所以配合物是红色。λmax 在 480 nm，灵敏度最高。',
  };
  if (i === 6) return {
    title: '显色平衡',
    items: [
      { label: '[Fe(SCN)]²⁺', n: r && r.fDev < 1 ? Math.round(4 + 8 * r.fDev) : 10, color: '#d05a83' },
      { label: 'Fe³⁺（未配位）', n: r && r.fDev < 1 ? 6 : 1, color: '#c8842a' },
      { label: 'SCN⁻', n: 8, color: '#e8a33d' },
    ],
    note: r && r.fDev < 1
      ? '看不见的：显色还没到平衡——配合物偏少、A 偏低；标准与试样同批，比值看似影响不大，但这不是可以指望的。'
      : '看不见的：10 min 后显色达到平衡；标准与试样同批显色、同仪器测量，系统误差才能对消。',
  };
  if (i === 7) return {
    title: '标准系列的梯度',
    items: [
      { label: '[Fe(SCN)]²⁺（0.01 M 档）', n: 2, color: '#d05a83' },
      { label: '[Fe(SCN)]²⁺（0.1 档）', n: 10, color: '#a02040' },
      { label: 'SCN⁻', n: 8, color: '#e8a33d' },
    ],
    note: '看不见的：浓度越大配合物越多、A 越大——正比关系就是标准曲线的全部内容（A = εbc 只对稀溶液、单色光成立）。',
  };
  if (i === 8) return {
    title: '试样的读数',
    items: [
      { label: '[Fe(SCN)]²⁺', n: 5, color: '#d05a83' },
      { label: 'Fe²⁺（不显色）', n: 18, color: '#2fb3a3' },
      { label: 'SO₄²⁻', n: 6, color: '#d9d9df' },
    ],
    note: '看不见的：A 越小数值越不稳——试样那条读数落在曲线低段（≈0.23），仍是有效读数；颜色深到出曲线范围就该减量重配。',
  };
  return {
    title: '从曲线到结果',
    items: [
      { label: '[Fe(SCN)]²⁺', n: 5, color: '#d05a83' },
      { label: 'Fe²⁺（不显色）', n: 18, color: '#2fb3a3' },
    ],
    note: r ? `看不见的：ε ≈ ${sup10s(r.eps)}（灵敏度）不是曲线的「陡不陡」，而是每 mol·L⁻¹ 配合物吸收多少光——它只与物质和波长有关。` : '',
  };
}

/* ---------- 读数与文字 ---------- */

function sup10s(v, digits = 1) {
  const [m, e] = v.toExponential(digits).split('e');
  const sup = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return `${m}×10${String(+e).split('').map(ch => sup[ch] || ch).join('')}`;
}

function readings(i, r, ops) {
  if (i === 0) return [
    { k: '除氧水', v: '60', unit: ' mL' },
    { k: '1:4 H₂SO₄ / 20% KSCN', v: '各 50', unit: ' mL' },
  ];
  if (i === 1) return [
    { k: '铁标液', v: '20.00', unit: ' µg/mL' },
    { k: '稀释倍数', v: '5', unit: ' 倍' },
  ];
  if (i === 2) return r.spec.map((s, k) => ({
    k: `第 ${k + 1} 份（${s.v.toFixed(2)} mL）`, v: String(s.ug), unit: ' µg Fe³⁺',
  }));
  if (i === 3) return [
    { k: '试样质量', v: ops.mSample.toFixed(4), unit: ' g' },
    { k: '溶解用水', v: ops.deaerated === 0 ? '无氧水' : '未除氧（错误）', tone: ops.deaerated === 0 ? 'good' : 'bad' },
    { k: '转移', v: ops.transfer === 0 ? '完全转移' : '有残留', tone: ops.transfer === 0 ? 'good' : 'bad' },
  ];
  if (i === 4) {
    if (ops.cuvettePaired === 0) return [
      { k: 'A₁ / A₂ / A₃ / A₄', v: '0.000 / 0.003 / 0.001 / 0.004', tone: 'good' },
      { k: '最大差值', v: '0.004', unit: '（≤0.005 ✓）', tone: 'good' },
    ];
    return [
      { k: 'A₁ / A₂ / A₃ / A₄', v: '0.000 / 0.014 / 0.006 / 0.011', tone: 'bad' },
      { k: '最大差值', v: '0.014', unit: '（>0.005 ✗）', tone: 'bad' },
    ];
  }
  if (i === 5) return [
    { k: 'λmax', v: '480', unit: ' nm' },
    { k: '峰处 A（最浓标准）', v: r.aMax.toFixed(3) },
  ];
  if (i === 6) return [
    { k: '静置时间', v: String(ops.developMinutes), unit: ' min', tone: ops.developMinutes >= 10 ? 'good' : 'bad' },
    { k: '显色完成度', v: (r.fDev * 100).toFixed(0), unit: ' %', tone: r.fDev >= 1 ? 'good' : 'warn' },
  ];
  if (i === 7) return [
    ...r.spec.map((s, k) => ({ k: `A（${s.ug} µg）`, v: r.aStd[k].toFixed(3) })),
    { k: '线性拟合 r²', v: r.fit.r2.toFixed(5), tone: r.fit.r2 > 0.999 ? 'good' : 'warn' },
  ];
  if (i === 8) return [
    { k: '试样 A', v: r.aSample.toFixed(3) },
    { k: 'Fe³⁺（每份）', v: r.res.ug.toFixed(1), unit: ' µg' },
    { k: 'Fe³⁺ 含量', v: r.res.mgPerG.toFixed(3), unit: ' mg/g',
      tone: r.grade === 'Ⅰ' || r.grade === 'Ⅱ' ? 'good' : r.grade === 'Ⅲ' ? 'warn' : 'bad' },
    { k: '级别（Ⅰ≤0.05 / Ⅱ≤0.10 / Ⅲ≤0.20）', v: r.grade,
      tone: r.grade === 'Ⅰ' || r.grade === 'Ⅱ' ? 'good' : r.grade === 'Ⅲ' ? 'warn' : 'bad' },
  ];
  return [
    { k: '摩尔吸光系数 ε', v: sup10s(r.eps) , unit: ' L·mol⁻¹·cm⁻¹' },
    { k: '百分含量 w(Fe³⁺)', v: r.res.w.toFixed(4), unit: ' %' },
  ];
}

function observation(i, r, ops) {
  if (i === 2) return `六份标准系列的含铁量：${r.spec.map(s => s.ug).join('、')} µg；0.00 mL 那份是试剂空白。`;
  if (i === 4) return ops.cuvettePaired === 0
    ? '四只比色皿配对完成（最大差值 0.004 ≤ 0.005），选前两只使用。'
    : '比色皿最大差值 0.014 > 0.005，这一对不该用——差值会直接加在试样读数上。';
  if (i === 5) return `吸收曲线峰值在 480 nm 附近（A = ${r.aMax.toFixed(3)}）；溶液吸绿光，呈红色。`;
  if (i === 7) return `六点标准曲线：A = ${r.aStd.map(a => a.toFixed(3)).join('、')}，线性 r² = ${r.fit.r2.toFixed(5)}。`;
  if (i === 8) return `试样 A = ${r.aSample.toFixed(3)} → 每份 ${r.res.ug.toFixed(1)} µg → ${r.res.mgPerG.toFixed(3)} mg Fe³⁺/g → ${r.grade} 级${r.hydrolyzed ? '（注意：溶液已水解发浑）' : ''}。`;
  if (i === 9) return `ε ≈ ${sup10s(r.eps)} L·mol⁻¹·cm⁻¹（思考题 4 的答案就来自标准曲线的斜率）。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.developMinutes < 10) {
    out.push(`显色只静置了 ${ops.developMinutes} min（要求 10 min）：配合物还没到平衡、A 整体偏低。标准与试样同批显色时，曲线斜率与试样读数同步变小、含量结果受影响较小——但这不是可以指望的：一旦分批测量或补时加测，偏差就会全数暴露。`);
  }
  if (ops.cuvettePaired === 1) {
    out.push('比色皿未配对（差值 0.014 > 0.005）：器皿差直接加在试样读数上（+0.012 A），结果偏高约 6%。规范是先配对、再选差值最小的一对。');
  }
  if (ops.deaerated === 1) {
    out.push('试样用未除氧的水：溶解氧把部分 Fe²⁺ 继续氧化成 Fe³⁺（教学估计每份 +12 µg），测出的「杂质」里混进了实验过程中新生成的 Fe³⁺——含量偏高。这是课前小测的考点。');
  }
  if (ops.transfer === 1) {
    out.push('试样未完全转移（烧杯没冲洗干净）：Fe³⁺ 丢在洗杯里，结果偏低。容量瓶操作规程要求冲洗烧杯 3～4 次。');
  }
  if (ops.sampleWavelength === 1) {
    out.push(`样品错用 500 nm 测量：该处灵敏度只有 480 nm 的 88%，而含量是按 480 nm 的标准曲线反算的——结果偏低约 12%。标准与样品必须同一波长。`);
  }
  if (r.hydrolyzed) {
    out.push(`酸度不足（pH ≈ ${r.phAcid.toFixed(1)} 高于临界值 ${r.phCrit.toFixed(2)}）：Fe³⁺ 开始水解、溶液发浑，散射使读数偏高。临界 pH 由 Ksp(Fe(OH)₃) 与 [Fe³⁺] 算出（课件原文写 3.85，按 Ksp 反算对不上，以公式为准）。`);
  }
  if (ops.reagentBatch === 1) {
    out.push('样品滞后一批、单独测量（教学模型 ×0.98）：仪器状态、显色条件与标准曲线那一批已经不同——课件强调「溶液全部配好后再一同测量」。');
  }
  if (ops.cellHandling === 1) {
    out.push('手摸光面、方向随意：指纹与划痕散射光，A 偏高（教学模型 +4%）；V 标记面必须每次朝同一方向。');
  }
  if (Math.abs(ops.mSample - 0.375) > 0.02 && ops.mSample > 0.39) {
    out.push('试样量偏大：颜色可能超出标准曲线范围——课件提示「颜色比标准深很多时减少试样量重配」。');
  }
  if (!out.length) {
    out.push(`全流程规范：六点标准曲线 r² = ${r.fit.r2.toFixed(5)}；试样 A = ${r.aSample.toFixed(3)} → Fe³⁺ ${r.res.mgPerG.toFixed(3)} mg/g（${r.grade} 级），w = ${r.res.w.toFixed(4)}%；ε ≈ ${sup10s(r.eps)} L·mol⁻¹·cm⁻¹。`);
    out.push('讨论：A = εbc 里的 ε 只与物质和波长有关——换浓度、换光程都不变；这就是「标准曲线可以量未知样」的底气。第一份标准溶液 A 若不是 0.000，说明比色皿或试剂有污染，要先查原因（思考题 3）。');
  }
  return out;
}

/* ---------- 图表与附表 ---------- */

function addTables(host, i, r) {
  if (i >= 7) {
    const wrap = h('div', { class: 'lab-table-wrap' });
    const rows = r.spec.map((s, k) => h('tr', {},
      h('td', {}, String(k + 1)),
      h('td', {}, s.v.toFixed(2)),
      h('td', {}, String(s.ug)),
      h('td', {}, r.aStd[k].toFixed(3))));
    rows.push(h('tr', {},
      h('td', {}, '未知样'),
      h('td', {}, '0.3~0.4 g 试样'),
      h('td', {}, r.res.ug.toFixed(1)),
      h('td', {}, r.aSample.toFixed(3))));
    wrap.append(h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, '编号'), h('th', {}, '20.00 µg/mL 铁标液 / mL'),
        h('th', {}, '含铁量 / µg'), h('th', {}, '吸光度 A'))),
      h('tbody', {}, ...rows)));
    wrap.append(h('div', { class: 'lab-caption' },
      `标准曲线：A = ${r.fit.slope.toExponential(4)} × 含铁量(µg) + ${r.fit.intercept.toExponential(2)}，r² = ${r.fit.r2.toFixed(5)}；` +
      `试样 → ${r.res.mgPerG.toFixed(3)} mg Fe³⁺/g（${r.grade} 级），w = ${r.res.w.toFixed(4)}%`));
    host.append(wrap);
  }
}

/* ---------- 挂载 ---------- */

export function mount(root, params = {}) {
  const charts = { spec: null, curve: null };
  const wraps = { spec: null, curve: null };
  function ensureChart(kind) {
    if (charts[kind]) return;
    const canvas = h('canvas', { 'aria-label': kind === 'spec' ? '吸收曲线' : '标准曲线' });
    wraps[kind] = h('div', { class: 'chart-wrap', style: 'height:250px;margin-top:12px' }, canvas);
    charts[kind] = kind === 'spec'
      ? new Chart(canvas, {
        xLabel: 'λ / nm', yLabel: 'A', xRange: [400, 600], yRange: [0, 0.82],
        pad: { l: 46, r: 16, t: 14, b: 30 },
      })
      : new Chart(canvas, {
        xLabel: '含铁量 / µg', yLabel: 'A', xRange: [-8, 215], yRange: [0, 0.82],
        pad: { l: 46, r: 16, t: 14, b: 30 },
      });
  }
  function drawSpectrum(host, r) {
    ensureChart('spec');
    host.append(wraps.spec);
    const smooth = sample(400, 600, 80, lambda => fe3Spectrum({ lambda, aMax: r.aMax }));
    const lams = [];
    for (let l = 400; l <= 470; l += 10) lams.push(l);
    lams.push(475, 478, 480, 482, 485);
    for (let l = 490; l <= 600; l += 10) lams.push(l);
    const dots = lams.map(l => ({ x: l, y: fe3Spectrum({ lambda: l, aMax: r.aMax }) }));
    charts.spec.setSeries([
      { points: smooth, color: '--w-red', width: 2, name: 'A(λ)' },
      { points: dots, color: '--w-red', dots: true, dotR: 2.6, width: 0 },
    ]).setMarkers([{ x: 480, color: '--w-amber', label: `λmax = 480 nm（A = ${r.aMax.toFixed(3)}）` }]);
    charts.spec.draw();
    host.append(h('div', { class: 'lab-caption' },
      '吸收曲线（教学标定谱形，峰位取课件示意的 480 nm）：溶液吸收绿光、呈其补色红色；每换一次波长，参比需重新调零。'));
  }
  function drawCurve(host, r, withSample) {
    ensureChart('curve');
    host.append(wraps.curve);
    const xs = r.spec.map(s => s.ug);
    const line = [{ x: 0, y: r.fit.intercept }, { x: 200, y: r.fit.intercept + r.fit.slope * 200 }];
    charts.curve.setSeries([
      { points: line, color: '--w-amber', width: 1.6 },
      { points: xs.map((x, k) => ({ x, y: r.aStd[k] })), color: '--w-amber', dots: true, dotR: 3.2, width: 0 },
      ...(withSample ? [{ points: [{ x: r.res.ug, y: r.aSample }], color: '--w-red', dots: true, dotR: 4.6, width: 0 }] : []),
    ]).setMarkers(withSample ? [{ x: r.res.ug, color: '--w-red', label: `试样 ${r.res.ug.toFixed(1)} µg` }] : []);
    charts.curve.draw();
    host.append(h('div', { class: 'lab-caption' },
      `A = ${r.fit.slope.toExponential(4)} × 含铁量(µg) + ${r.fit.intercept.toExponential(2)}（r² = ${r.fit.r2.toFixed(5)}）`));
  }

  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species,
    observation, verdict, readings,
    equation: 'A = εbc（朗伯-比尔定律）；Fe³⁺ + nSCN⁻ ⇌ [Fe(SCN)ₙ]³⁻ⁿ（血红色）',
    calculation: (i, r, ops) => {
      if (i === 1) return 'c = 100.0 µg/mL × 20.00 mL ÷ 100.0 mL = 20.00 µg/mL';
      if (i === 2) return `含铁量 = 体积 × 20.00：2.00 mL → 40 µg … 10.00 mL → 200 µg`;
      if (i === 3) return `pH ≈ ${r.phAcid.toFixed(1)} 对照临界 pH = 14 + ⅓·lg(Ksp/[Fe³⁺]) = ${r.phCrit.toFixed(2)}（[Fe³⁺] ≈ ${fe3Molarity(r.ugTrue / 50).toExponential(1)} mol/L）`;
      if (i === 6) return `显色完成度 ≈ ${(r.fDev * 100).toFixed(0)}%（教学标定：10 min 达到平衡）`;
      if (i === 7) return `线性拟合：斜率 ${r.fit.slope.toExponential(4)} A/µg，截距 ${r.fit.intercept.toExponential(2)}，r² = ${r.fit.r2.toFixed(5)}`;
      if (i === 8) return `w(Fe³⁺) = ${r.res.ug.toFixed(1)} µg ÷ 1000 ÷ ${ops.mSample.toFixed(4)} g × 100% = ${r.res.w.toFixed(4)}%`;
      if (i === 9) return `ε = 斜率(${r.fit.slope.toExponential(3)} A/µg) × 50 mL ÷ (1 µg/mL 的 mol/L 数 ${fe3Molarity(1).toExponential(3)}) = ${sup10s(r.eps)} L·mol⁻¹·cm⁻¹`;
      return STEPS[i].calc;
    },
    modelNote: '说明：计量关系（铁标液稀释、标准系列含铁量 = 体积×20 µg/mL、A=εbc、ε 由曲线斜率反算）按课件公式；'
      + 'ε = 1.0×10⁴ L·mol⁻¹·cm⁻¹ 是教学设定值——课件只留空白记录表、没有范例数字，该值使六份标准的 A 落在 0~0.72（与硫氰酸铁配合物量级相符），也是思考题 4 的答案。'
      + 'λmax = 480 nm 与吸收曲线形状为教学标定（课件示意值）；试样真值（0.1707 mg/g）为教学场景。'
      + '显色时间、比色皿配对/取放、溶解氧再氧化、转移损失、波长不符、测量批次与酸度的偏差，是方向性教学标定模型——只保证方向与量级合理，不代表实测误差。'
      + '酸度临界值按 pH = 14 + ⅓·lg(Ksp/[Fe³⁺]) 计算（Ksp(Fe(OH)₃) = 3.5×10⁻³⁸）；课件原文写「pH<3.85」按此反算对不上（[Fe³⁺]=0.001 时为 2.51），本模拟器以公式为准。',
    extra: (host, i, r, ops) => {
      if (i === 5) drawSpectrum(host, r);
      if (i === 7) drawCurve(host, r, false);
      if (i === 8 || i === 9) drawCurve(host, r, true);
      if (i >= 7) addTables(host, i, r);
    },
    cleanup: () => {
      Object.values(charts).forEach(c => c && c.destroy());
    },
  });
}

/**
 * 供自检页（`_scenes-all.html` / `_scenes-test.html`）读取的最小场景描述。
 * 有了它，自检页就不必**手抄**步骤名——sim 里改一步，自检页跟着变。
 * 引用的全是模块级标识符，不会与 mount 里那份漂移。
 */
export const sceneSpec = { id: meta.id, name: meta.name, steps: STEPS, guide: GUIDE, model, draw };
