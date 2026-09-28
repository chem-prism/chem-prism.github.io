/**
 * 实验 08：光敏剂与蓝晒古法印相。
 *
 * 两段一条链：先合成三草酸合铁(Ⅲ)酸钾（翠绿色光敏剂），
 * 再涂布、曝光、水洗——蓝不是涂上去的，是显影之后被空气氧化「长」出来的。
 *
 * 计量式与光解/颜色模型在 chem.js 的「光敏剂与蓝晒」（可 node 验算）；
 * 产率各环节的损失因子是**教学标定模型**，在本文件 model() 中逐项标注。
 */
import { h } from './common.js';
import {
  cyanotypeYield, photolysisFraction, prussianBlueColor,
} from '../chem.js';
import { mountLab } from './lab-shell.js';
import {
  balance, beaker, hotplate, waterBath, reagentBottle, funnel, testTube,
  watchGlass, crystals, drawBench, CLEAR_COLOR,
  uvExposureBox, developTray, cyanotypePrint,
} from '../glassware.js';
import { Chart, sample } from '../chart.js';

export const meta = {
  id: 'cyanotype',
  name: '蓝晒印相（光敏剂合成）',
  wave: '实验 08',
  accent: '--w-teal',
  desc: '先合成翠绿色的光敏剂，再涂布、曝光、水洗——蓝不是涂上去的，是显影之后被空气氧化「长」出来的。',
};

const GUIDE = {
  mMohr: 5.0,
  waterVol: 15, h2o2Fresh: 0, oxidMinutes: 5, Tfilter: 95, ethanolVol: 15, dryPlace: 0,
  brushTechnique: 0, sheetDry: 0,
  exposureSource: 0, uvSeconds: 40, sunMinutes: 30,
  washMethod: 0, oxidize: 0,
};
// 练习模式初值：合成段故意留 4 处不规范（水量、H₂O₂、氧化时间、趁热过滤）
const DEFAULTS = {
  ...GUIDE,
  waterVol: 30,
  oxidMinutes: 3,
  Tfilter: 60,
  dryPlace: 1,
};
const CONTROLS = [
  { key: 'mMohr', label: '莫尔盐质量', unit: ' g', min: 4.5, max: 5.5, step: 0.01 },
  { key: 'waterVol', label: '溶解用蒸馏水', unit: ' mL', min: 10, max: 40, step: 1 },
  { key: 'h2o2Fresh', label: '3% H₂O₂', options: ['新配', '放置多日（错误）'] },
  { key: 'oxidMinutes', label: '40 ℃ 氧化时间', unit: ' min', min: 0, max: 10, step: 1 },
  { key: 'Tfilter', label: '趁热过滤温度', unit: ' °C', min: 40, max: 100, step: 5 },
  { key: 'ethanolVol', label: '95% 乙醇加入量', unit: ' mL', min: 0, max: 20, step: 1 },
  { key: 'dryPlace', label: '产物晾干', options: ['表面皿摊开、避光晾干', '阳光直晒晾干（错误）'] },
  { key: 'brushTechnique', label: '涂布手法', options: ['毛刷先纵后横、均匀且薄', '随意涂布（错误）'] },
  { key: 'sheetDry', label: '曝光前', options: ['晾干/吹干后再曝光', '未干就压板曝光（错误）'] },
  { key: 'exposureSource', label: '曝光光源', options: ['紫外灯', '阳光'] },
  { key: 'uvSeconds', label: '紫外灯曝光时间', unit: ' s', min: 0, max: 90, step: 5 },
  { key: 'sunMinutes', label: '阳光暴晒时间', unit: ' min', min: 5, max: 60, step: 5 },
  { key: 'washMethod', label: '显影方式', options: ['盘洗、换水 3~4 次', '流水冲洗（错误）'] },
  { key: 'oxidize', label: '显影后', options: ['悬挂晾干（空气中自然氧化）', '滴 3% H₂O₂ 加速氧化'] },
];

const STEPS = [
  {
    name: '溶解莫尔盐',
    op: '称取 5.0 g Fe(NH₄)₂(SO₄)₂·6H₂O 于 100 mL 烧杯，加 15 mL 蒸馏水和 5 滴 3 mol·L⁻¹ H₂SO₄，加热使其溶解。',
    why: '加酸抑制 Fe²⁺ 水解；蒸馏水不宜过多——草酸亚铁在水中有一定溶解度，水多会吃掉产率（注意事项 2）。',
    eq: '(NH₄)₂Fe(SO₄)₂·6H₂O，M = 392.14 g·mol⁻¹',
    calc: 'n(莫尔盐) = 5.0 ÷ 392.14 = 12.75 mmol',
  },
  {
    name: '沉淀草酸亚铁',
    op: '加入 25 mL 饱和 H₂C₂O₄ 溶液，电热板加热至沸并不断搅拌；静置，使黄色 FeC₂O₄·2H₂O 沉淀沉降完全。',
    why: '不断搅拌是防爆沸；沉淀必须「沉降完全」才好倾析——絮状沉淀需要时间，急着倾会把产物一起倒掉。',
    eq: '(NH₄)₂Fe(SO₄)₂ + H₂C₂O₄ = FeC₂O₄·2H₂O↓ + (NH₄)₂SO₄ + H₂SO₄',
    calc: '黄色沉淀 FeC₂O₄·2H₂O（1:1 计量）',
  },
  {
    name: '倾析弃去清液',
    op: '用倾析法弃去上层清液，尽可能把清液倾干净。',
    why: '倾析靠重力沉降、不用滤纸——此时沉淀很细，过滤既堵又损失；但倾不干净会把副产物 (NH₄)₂SO₄ 和过量酸带进下一步。',
    eq: '倾析：烧杯 + 玻璃棒引流',
    calc: '清液含 (NH₄)₂SO₄ 与 H₂SO₄——弃去',
  },
  {
    name: '40 ℃ 氧化',
    op: '加入 10 mL 饱和 K₂C₂O₄ 溶液，水浴加热至 40 ℃；不断搅拌下用滴管慢慢加入 20 mL 3% H₂O₂，40 ℃ 下搅拌 5 min。',
    why: '★ H₂O₂ 必须新配（放置会分解、氧化力不足）；慢加是防剧烈放气；此时出现 Fe(OH)₃ 棕色沉淀是正常的——下一步用草酸把它「拉回」配合物。',
    eq: '6FeC₂O₄·2H₂O + 3H₂O₂ + 6K₂C₂O₄ = K₃[Fe(C₂O₄)₃] + 2Fe(OH)₃↓ + 12H₂O',
    calc: '水浴 40 ℃；氧化 5 min——Fe(Ⅱ) 要充分氧化为 Fe(Ⅲ)',
  },
  {
    name: '加草酸配位',
    op: '将溶液加热至沸，再加入 8 mL 饱和 H₂C₂O₄（先一次加入 5 mL，再慢慢加入 3 mL），保持温度接近沸腾，得到透明的翠绿色溶液。',
    why: '★ 先 5 后 3：先大批量把 Fe(OH)₃ 溶解掉，再逐滴调到恰好澄清——一次全加、或加过头，都会影响后续结晶。',
    eq: '2Fe(OH)₃ + 3H₂C₂O₄ + 3K₂C₂O₄ = 2K₃[Fe(C₂O₄)₃]·3H₂O',
    calc: '翠绿色 = 产物 [Fe(C₂O₄)₃]³⁻ 的颜色',
  },
  {
    name: '趁热过滤',
    op: '趁热把溶液过滤到干净的 100 mL 烧杯中（热抽滤或常压热过滤）。',
    why: '★ 产物在热水里溶解度大得多（100 ℃ 117.7 g/100 g 水，0 ℃ 只有 4.7）——冷了再过滤，产物就结晶在滤纸上了，产率直接掉。',
    eq: '溶解度：100 ℃ 117.7 vs 0 ℃ 4.7 g/100 g 水',
    calc: '滤液 = 翠绿色产物溶液；滤纸上留下的是杂质',
  },
  {
    name: '平均分三份',
    op: '把翠绿色溶液平均分成三份：1/3 用于结晶称量产率，1/3 静置长单晶，1/3 用于蓝晒。',
    why: '一份实验做三件事；要准确知道总体积和 1/3 体积——之后产率计算需要它。单晶那份要避光静置 1~2 周（不能扰动）。',
    eq: '——',
    calc: '三份各 1/3；结晶那份才用于称量产率',
  },
  {
    name: '乙醇结晶',
    op: '取 1/3 溶液于小烧杯，加约 15 mL 95% 乙醇至晶体完全析出（课件旁注：经验上 ~10 mL 效果更好）；抽滤，用少量乙醇淋洗晶体，抽干。',
    why: '产物难溶于乙醇——加乙醇是把水「挤走」、逼它结晶；乙醇淋洗既去可溶杂质、又干得快。',
    eq: 'K₃[Fe(C₂O₄)₃]·3H₂O 难溶于乙醇',
    calc: '乙醇 ≥10 mL 可保证晶体析出完全（教学模型）',
  },
  {
    name: '避光晾干、称量产率',
    op: '把粗产物转到表面皿中摊开、避光晾干；观察颜色与晶态、称量并计算产率，装入自封袋避光保存。',
    why: '★ 产物见光分解（受光逐渐变黄）——晾干也必须避光；产率 = m实际 ÷ m理论 ×100%，m理论 = 5.0×491/392 = 6.3 g。',
    eq: '2K₃[Fe(C₂O₄)₃]·3H₂O --光--> 3K₂C₂O₄ + 2FeC₂O₄ + 2CO₂↑',
    calc: 'm理论 = 6.26 g（课件 6.3 g）；guide 产率 78% → 约 4.9 g',
  },
  {
    name: '配感光剂并涂布',
    op: '取 0.5 mol·L⁻¹ K₃[Fe(CN)₆] 溶液 2 mL + 留存的 K₃[Fe(C₂O₄)₃] 溶液 6 mL 于烧杯混匀；用洗净甩干的毛刷先纵后横、均匀且薄地涂在相纸上，避光/弱光晾干（或风扇吹干）。',
    why: '★ 先纵后横才能涂得均匀且薄；一定要晾干再曝光——没干就压板，花纹会在湿涂层里洇开糊掉。涂布量决定最终背景能有多深。',
    eq: 'A 液（光敏剂，翠绿）6 mL + B 液（铁氰化钾，淡黄）2 mL',
    calc: '混合后是黄绿色感光剂',
  },
  {
    name: '紫外曝光',
    op: '把素材（树叶、剪纸、负片）放在涂布区，两块透明亚克力板压紧、夹子固定；紫外灯下照射 30~45 s（阳光下则暴晒约 30 min）。',
    why: '★ 光是反应物：被照到的地方 [Fe(C₂O₄)₃]³⁻ 光解出 Fe²⁺，被树叶挡住的地方「什么都没发生」。欠曝 → 花纹淡；过曝 → 背景全满、层次丢掉。',
    eq: '2[Fe(C₂O₄)₃]³⁻ --hv--> 2Fe²⁺ + 2CO₂↑ + 5C₂O₄²⁻',
    calc: '紫外 30~45 s ≈ 阳光 30 min（课件换算，本模型 1 min ≈ 1.5 UV-s）',
  },
  {
    name: '水洗显影、晾干',
    op: '用盘洗、换水 3~4 次，洗去多余感光剂，直到高亮区变白、不再有黄绿色液体流出（不能流水冲洗）；可滴 3% H₂O₂ 加速氧化；悬挂晾干。',
    why: '★ 刚洗出来画面几乎是白的——显出来的是「普鲁士白」；空气中的氧把它慢慢氧化成普鲁士蓝。蓝不是涂上去的，是显影之后才「长」出来的（H₂O₂ 只是把这一过程按快进键）。',
    eq: '3Fe²⁺ + 2[Fe(CN)₆]³⁻ = Feᴵᴵ₃[Feᴵᴵᴵ(CN)₆]₂↓（滕氏蓝）→ KFeᴵᴵᴵ[Feᴵᴵ(CN)₆]（普鲁士蓝）',
    calc: '水洗至无黄绿色流出；流水冲洗会冲花涂层（不能流水显影）',
  },
];

const CRYSTAL_GREEN = [110, 205, 150, 0.9];   // 产物翠绿色

function model(ops) {
  const { n, mTheory } = cyanotypeYield({ mMohr: ops.mMohr });
  // —— 合成各环节的损失因子（⚠️ 全部是教学标定模型，方向依据课件注意事项）——
  const fWater = 1 - 0.30 * Math.max(0, ops.waterVol - 15) / 25;   // 水多 → 草酸亚铁溶解损失
  const fH2O2 = ops.h2o2Fresh === 1 ? 0.72 : 1;                    // H₂O₂ 分解 → 氧化不完全
  const fOxid = Math.min(1, 0.5 + 0.1 * ops.oxidMinutes);          // 氧化时间不足
  const fTfilter = 1 - 0.35 * Math.max(0, 95 - ops.Tfilter) / 55;  // 不趁热 → 产物结晶在滤纸上
  const fEthanol = ops.ethanolVol >= 10 ? 1 : 0.6 + 0.04 * ops.ethanolVol;  // 乙醇不足 → 析出不全
  const fDry = ops.dryPlace === 1 ? 0.92 : 1;                      // 日光直晒 → 光解损失
  const base = 0.78;                                               // 转移/洗涤/抽滤的基准损失（教学标定）
  const yieldPct = base * fWater * fH2O2 * fOxid * fTfilter * fEthanol * fDry * 100;
  const mActual = mTheory * yieldPct / 100;

  // —— 蓝晒 ——
  const expo = photolysisFraction({
    source: ops.exposureSource === 0 ? 'uv' : 'sun',
    uvSeconds: ops.uvSeconds,
    sunMinutes: ops.sunMinutes,
  });
  const density = expo.f;                                          // 背景蓝深浅 ∝ 光解分数
  const mottleRaw = (ops.washMethod === 1 ? 0.8 : 0) + (ops.brushTechnique === 1 ? 0.35 : 0);
  const mottle = Math.min(1, mottleRaw);                           // 流水/涂布不均 → 画面花
  const blur = ops.sheetDry === 1 ? 1 : 0;                         // 未干曝光 → 花纹洇开
  return {
    n, mTheory, mActual, yieldPct,
    factors: { fWater, fH2O2, fOxid, fTfilter, fEthanol, fDry, base },
    expo, density, mottle, blur,
  };
}

/* ---------- 宏观层 ---------- */

function note(ctx, x, y, text, color = 'rgba(160,180,196,0.9)') {
  ctx.save();
  ctx.font = '600 11px "PingFang SC", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
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

/** 小毛刷（涂布用）：柄 + 金属箍 + 刷毛 */
function brushGlyph(ctx, box, o = {}) {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(o.angle || -0.6);
  const bw = Math.max(5, w * 0.18), bh = h * 0.86;
  // 柄
  ctx.strokeStyle = 'rgba(150,166,180,0.8)';
  ctx.lineWidth = bw * 0.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -bh / 2);
  ctx.lineTo(0, bh * 0.10);
  ctx.stroke();
  // 箍
  ctx.fillStyle = 'rgba(120,132,142,0.9)';
  ctx.fillRect(-bw * 0.55, bh * 0.10, bw * 1.10, h * 0.08);
  // 刷毛
  ctx.fillStyle = 'rgba(60,70,80,0.95)';
  ctx.beginPath();
  ctx.moveTo(-bw * 0.5, bh * 0.18);
  ctx.lineTo(bw * 0.5, bh * 0.18);
  ctx.lineTo(bw * 0.34, bh * 0.5);
  ctx.lineTo(-bw * 0.34, bh * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw(ctx, W, H, t, i, r, ops) {
  const B = drawBench(ctx, W, H);
  const cx = W / 2;

  if (i === -1) {
    balance(ctx, { x: cx - 150, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: CRYSTAL_GREEN, reading: '5.0000' });
    beaker(ctx, { x: cx - 10, y: B - 120, w: 92, h: 120 }, { liquid: [206, 216, 158, 0.40], level: 0.45 });
    cyanotypePrint(ctx, { x: cx + 110, y: B - 120, w: 110, h: 79 }, { state: 'washed', density: 0.96, oxidized: 1 });
    return;
  }
  if (i === 0) {
    balance(ctx, { x: cx - 150, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: [150, 214, 204, 0.85], reading: ops.mMohr.toFixed(4) });
    beaker(ctx, { x: cx - 10, y: B - 118, w: 92, h: 118 }, { liquid: [172, 208, 196, 0.45], level: 0.5 });
    reagentBottle(ctx, { x: cx + 88, y: B - 112, w: 38, h: 112 },
      { shape: 'drop', liquid: CLEAR_COLOR, level: 0.5, label: ['3M H₂SO₄'] });
    return;
  }
  if (i === 1) {
    hotplate(ctx, { x: cx - 150, y: B - 56, w: 190, h: 56 }, { heat: 0.85, steam: 0.35, t });
    beaker(ctx, { x: cx - 135, y: B - 162, w: 92, h: 106 }, { liquid: [232, 216, 120, 0.55], level: 0.52 });
    note(ctx, cx - 135, B - 184, '煮沸、不断搅拌（防爆沸）', 'rgba(160,180,196,0.9)');
    note(ctx, cx + 20, B - 120, '黄色 FeC₂O₄·2H₂O ↓', '#e8c23d');
    return;
  }
  if (i === 2) {
    beaker(ctx, { x: cx - 120, y: B - 130, w: 104, h: 130 }, { liquid: [226, 222, 168, 0.30], level: 0.62 });
    // 沉降在底的黄色沉淀
    crystals(ctx, { x: cx - 108, y: B - 32, w: 80, h: 24 }, t, 0.75,
      { color: [226, 196, 90, 0.85], spin: false });
    note(ctx, cx + 10, B - 96, '倾析：清液沿玻璃棒倒出', 'rgba(160,180,196,0.9)');
    note(ctx, cx + 10, B - 76, '沉淀留在杯底', 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 3) {
    waterBath(ctx, { x: cx - 150, y: B - 96, w: 220, h: 96 }, { steam: 0.5, t, ringW: 100 });
    beaker(ctx, { x: cx - 128, y: B - 176, w: 84, h: 96 }, { liquid: [196, 170, 120, 0.5], level: 0.52 });
    note(ctx, cx - 150, B - 198, '水浴 40 ℃、慢滴 20 mL 3% H₂O₂、搅拌 5 min', 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 4) {
    hotplate(ctx, { x: cx - 150, y: B - 56, w: 190, h: 56 }, { heat: 0.8, steam: 0.30, t });
    beaker(ctx, { x: cx - 135, y: B - 162, w: 92, h: 106 }, { liquid: [96, 196, 150, 0.60], level: 0.55 });
    note(ctx, cx - 135, B - 184, '近沸腾：先加 5 mL、再慢慢加 3 mL 饱和草酸', 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 5) {
    funnel(ctx, { x: cx - 130, y: B - 200, w: 78, h: 88 }, { liquid: [96, 196, 150, 0.55], level: 0.5, stemLevel: 0.7 });
    beaker(ctx, { x: cx - 138, y: B - 108, w: 96, h: 108 }, { liquid: [96, 196, 150, 0.55], level: 0.36 });
    note(ctx, cx + 10, B - 170, `趁热过滤（${ops.Tfilter} ℃）`, ops.Tfilter >= 85 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    note(ctx, cx + 10, B - 150, '冷了 → 产物结晶在滤纸上', 'rgba(160,180,196,0.75)');
    return;
  }
  if (i === 6) {
    const boxes = [
      { x: cx - 150, y: B - 116, w: 82, h: 116 },
      { x: cx - 52, y: B - 116, w: 82, h: 116 },
      { x: cx + 46, y: B - 116, w: 82, h: 116 },
    ];
    beaker(ctx, boxes[0], { liquid: [96, 196, 150, 0.55], level: 0.5 });
    flaskLabel(ctx, boxes[0], '1/3 结晶');
    testTube(ctx, { x: boxes[1].x + 24, y: B - 150, w: 34, h: 150 }, { liquid: [96, 196, 150, 0.55], level: 0.55 });
    flaskLabel(ctx, boxes[1], '1/3 单晶');
    beaker(ctx, boxes[2], { liquid: [96, 196, 150, 0.55], level: 0.5 });
    flaskLabel(ctx, boxes[2], '1/3 蓝晒');
    note(ctx, 14, 40, '准确知道总体积与 1/3 体积——产率计算要用');
    return;
  }
  if (i === 7) {
    beaker(ctx, { x: cx - 150, y: B - 118, w: 90, h: 118 }, { liquid: [110, 200, 160, 0.55], level: 0.5 });
    crystals(ctx, { x: cx - 140, y: B - 44, w: 70, h: 34 }, t, 0.7, { color: CRYSTAL_GREEN, spin: false });
    reagentBottle(ctx, { x: cx - 30, y: B - 118, w: 48, h: 118 },
      { liquid: CLEAR_COLOR, level: 0.6, label: ['95% 乙醇'] });
    note(ctx, cx + 40, B - 96, `乙醇 ${ops.ethanolVol} mL——把水「挤走」逼它结晶`, ops.ethanolVol >= 10 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    note(ctx, cx + 40, B - 76, '再用少量乙醇淋洗、抽干', 'rgba(160,180,196,0.75)');
    return;
  }
  if (i === 8) {
    balance(ctx, { x: cx - 150, y: B - 150, w: 110, h: 150 },
      { item: true, itemColor: CRYSTAL_GREEN, reading: r.mActual.toFixed(3), tone: r.yieldPct >= 65 ? 'good' : r.yieldPct >= 40 ? 'warn' : 'bad' });
    watchGlass(ctx, { x: cx - 10, y: B - 118, w: 118, h: 34 }, { crystal: 0.8, crystalColor: CRYSTAL_GREEN, t });
    note(ctx, cx + 120, B - 100, '避光晾干（见光会变黄）', ops.dryPlace === 0 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    return;
  }
  if (i === 9) {
    beaker(ctx, { x: cx - 158, y: B - 110, w: 86, h: 110 }, { liquid: [188, 204, 120, 0.55], level: 0.48 });
    flaskLabel(ctx, { x: cx - 158, y: B - 110, w: 86, h: 110 }, '感光剂（2+6 mL）');
    cyanotypePrint(ctx, { x: cx - 42, y: B - 108, w: 100, h: 72 }, { state: 'washed', density: 0, oxidized: 0 });
    flaskLabel(ctx, { x: cx - 42, y: B - 108, w: 100, h: 72 }, '涂布相纸');
    brushGlyph(ctx, { x: cx + 78, y: B - 130, w: 54, h: 130 }, {});
    note(ctx, 14, 40, '先纵后横、均匀且薄；晾干后再曝光', ops.brushTechnique === 0 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    return;
  }
  if (i === 10) {
    uvExposureBox(ctx, { x: cx - 165, y: B - 225, w: 210, h: 225 }, {
      on: ops.exposureSource === 0,
      seconds: ops.exposureSource === 0 ? ops.uvSeconds : ops.sunMinutes * 60,
      density: r.density,
    });
    if (ops.exposureSource === 1) {
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(232,163,61,0.9)';
      ctx.arc(cx + 95, B - 200, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,163,61,0.7)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + 95 + Math.cos(a) * 17, B - 200 + Math.sin(a) * 17);
        ctx.lineTo(cx + 95 + Math.cos(a) * 24, B - 200 + Math.sin(a) * 24);
        ctx.stroke();
      }
      ctx.restore();
    }
    note(ctx, 14, 40, ops.exposureSource === 0 ? `紫外灯 ${ops.uvSeconds} s（光解分数 ${(r.expo.f * 100).toFixed(0)}%）` : `阳光 ${ops.sunMinutes} min（≈ ${Math.round(r.expo.dose)} UV-s）`,
      r.expo.f >= 0.85 ? 'rgba(160,180,196,0.9)' : '#e8a33d');
    if (r.blur > 0) note(ctx, 14, 58, '未干就曝光——花纹会洇开', '#e05a4f');
    return;
  }
  // i === 11：显影盘 + 成品
  developTray(ctx, { x: cx - 165, y: B - 150, w: 190, h: 150 }, {
    density: r.density, oxidized: 0.35, mottle: r.mottle, t,
  });
  cyanotypePrint(ctx, { x: cx + 70, y: B - 150, w: 130, h: 94 }, {
    state: 'washed', density: r.density, oxidized: 1, mottle: r.mottle, blur: r.blur,
  });
  flaskLabel(ctx, { x: cx + 70, y: B - 150, w: 130, h: 94 }, '晾干后的成品');
  if (r.mottle > 0.1) note(ctx, 14, 40, '流水冲洗/涂布不均——画面有洇痕', '#e05a4f');
}

/* ---------- 微观层 ---------- */

function species(i, r, ops) {
  if (i === 0) return {
    title: '溶解莫尔盐',
    items: [
      { label: 'Fe²⁺', n: 10, color: '#2fb3a3' },
      { label: 'NH₄⁺', n: 8, color: '#9aa7b6' },
      { label: 'SO₄²⁻', n: 8, color: '#d9d9df' },
      { label: 'H₂O', n: 14, color: '#d6e0e7' },
    ],
    note: '看不见的：Fe 在这里还是 +2 价——整条合成线的第一步是「把它抓成草酸盐」，而不是改变它的价态。',
  };
  if (i === 1) return {
    title: '草酸亚铁沉淀',
    items: [
      { label: 'FeC₂O₄·2H₂O', n: 14, color: '#e8c23d', phase: 'solid' },
      { label: 'H⁺', n: 6, color: '#e0574f' },
      { label: 'C₂O₄²⁻（过量）', n: 8, color: '#6bbc57' },
    ],
    note: '看不见的：草酸过量没关系——下一步氧化还要靠草酸根把 Fe(Ⅲ) 拉住。',
  };
  if (i === 2) return {
    title: '倾析后的体系',
    items: [
      { label: 'FeC₂O₄·2H₂O', n: 16, color: '#e8c23d', phase: 'solid' },
      { label: 'H₂O（润湿）', n: 10, color: '#d6e0e7' },
    ],
    note: '看不见的：清液里是被倒掉的副产物；沉淀留在杯里——「尽可能倾干净」是为下一步的配位反应腾出干净的舞台。',
  };
  if (i === 3) return {
    title: '氧化：Fe(Ⅱ) → Fe(Ⅲ)',
    items: [
      { label: 'Fe³⁺', n: 8, color: '#c8842a' },
      { label: 'Fe(OH)₃', n: r && ops.oxidMinutes >= 4 ? 8 : 3, color: '#b98a52', phase: 'solid' },
      { label: 'H₂O₂（残余）', n: r && ops.h2o2Fresh === 1 ? 8 : 2, color: '#9aa7b6' },
      { label: 'C₂O₄²⁻', n: 8, color: '#6bbc57' },
    ],
    note: r && ops.h2o2Fresh === 1
      ? '看不见的：放置多日的 H₂O₂ 已部分分解——真正参与氧化的分子比看起来少，Fe(Ⅱ) 氧化不完全。'
      : '看不见的：H₂O₂ 把 Fe(Ⅱ) 氧化成 Fe(Ⅲ)，先生成 Fe(OH)₃ 棕色沉淀是必经之路——下一步草酸把它「拉」回溶液。',
  };
  if (i === 4) return {
    title: '配位：翠绿色出现',
    items: [
      { label: '[Fe(C₂O₄)₃]³⁻', n: 14, color: '#3fbe8f' },
      { label: 'K⁺', n: 10, color: '#c8842a' },
      { label: 'C₂O₄²⁻（过量）', n: 6, color: '#6bbc57' },
    ],
    note: '看不见的：翠绿色不是 Fe³⁺ 的颜色——是三个草酸根把铁「包」进配离子之后才出现的；颜色本身就是「配位发生了」的证据。',
  };
  if (i === 5) return {
    title: '趁热过滤',
    items: [
      { label: '[Fe(C₂O₄)₃]³⁻', n: 12, color: '#3fbe8f' },
      { label: '杂质（滤纸截留）', n: 4, color: '#9aa7b6', phase: 'solid' },
    ],
    note: '看不见的：热的时候产物都在水里；一旦冷下来，它就会在滤纸上结晶成损失——「趁热」是在跟溶解度赛跑。',
  };
  if (i <= 8) return {
    title: '三份去向',
    items: [
      { label: '[Fe(C₂O₄)₃]³⁻', n: 12, color: '#3fbe8f' },
      { label: 'K₃[Fe(C₂O₄)₃]·3H₂O', n: i >= 7 ? 10 : 0, color: '#6ecf96', phase: 'solid' },
      { label: '乙醇（挤水）', n: i >= 7 ? 6 : 0, color: '#d6e0e7' },
    ],
    note: i >= 7
      ? '看不见的：乙醇一进去，水被「稀释」、溶解度塌下来，晶体才析得出来；因此产物要用乙醇淋洗而不是水。'
      : '看不见的：一份溶液要干三件事——结晶称量、静置长单晶、蓝晒；只有结晶那份影响产率读数。',
  };
  if (i === 9) return {
    title: '涂布后的纸面',
    items: [
      { label: '[Fe(C₂O₄)₃]³⁻', n: 10, color: '#3fbe8f' },
      { label: '[Fe(CN)₆]³⁻', n: 6, color: '#c8842a' },
      { label: 'H₂O（待干）', n: 6, color: '#d6e0e7' },
    ],
    note: '看不见的：此刻两位主角——光敏剂和三价铁氰化物——还互不相干；等光照把 Fe²⁺ 造出来，它们才会碰面。',
  };
  if (i === 10) return {
    title: '光解：造出 Fe²⁺',
    items: [
      { label: 'Fe²⁺（光解产物）', n: r ? Math.max(1, Math.round(12 * r.expo.f)) : 8, color: '#2fb3a3' },
      { label: '[Fe(C₂O₄)₃]³⁻（未反应）', n: r ? Math.max(1, Math.round(12 * (1 - r.expo.f))) : 2, color: '#3fbe8f' },
      { label: 'CO₂↑', n: 4, color: '#9aa7b6' },
    ],
    note: r && r.expo.f < 0.6
      ? '看不见的：这次光解明显不够——Fe²⁺ 太少，显影出来图案会淡、层次会丢。'
      : '看不见的：光是反应物——受光处 Fe³⁺ 逐个被还原，叶片挡住的阴影里「什么都没发生」。',
  };
  return {
    title: '显影：白转蓝',
    items: [
      { label: 'Feᴵᴵ₃[Feᴵᴵᴵ(CN)₆]₂', n: 8, color: '#27375f', phase: 'solid' },
      { label: 'KFeᴵᴵᴵ[Feᴵᴵ(CN)₆]', n: 6, color: '#16294f', phase: 'solid' },
      { label: '黄绿感光剂（洗去）', n: 4, color: '#ccd68a' },
    ],
    note: '看不见的：刚洗完时是近白的「普鲁士白」；空气中的氧把它慢慢氧化成普鲁士蓝——深蓝是显影之后才「长」出来的（H₂O₂ 只是按快进键）。',
  };
}

/* ---------- 读数与文字 ---------- */

function readings(i, r, ops) {
  if (i === 0) return [
    { k: 'n(莫尔盐)', v: (r.n * 1000).toFixed(2), unit: ' mmol' },
    { k: '溶解用水', v: String(ops.waterVol), unit: ' mL', tone: ops.waterVol <= 20 ? 'good' : 'warn' },
  ];
  if (i === 1) return [
    { k: '沉淀', v: 'FeC₂O₄·2H₂O 黄色' },
    { k: '蒸馏水', v: String(ops.waterVol), unit: ' mL' },
  ];
  if (i === 2) return [
    { k: '操作', v: '倾析弃清液' },
    { k: '沉淀', v: '留在杯底' },
  ];
  if (i === 3) return [
    { k: '水浴温度', v: '40', unit: ' ℃' },
    { k: '氧化时间', v: String(ops.oxidMinutes), unit: ' min', tone: ops.oxidMinutes >= 5 ? 'good' : 'bad' },
    { k: 'H₂O₂', v: ops.h2o2Fresh === 0 ? '新配' : '放置多日', tone: ops.h2o2Fresh === 0 ? 'good' : 'bad' },
  ];
  if (i === 4) return [
    { k: '溶液颜色', v: '翠绿色（透明）' },
    { k: '加草酸', v: '先 5 mL → 再 3 mL' },
  ];
  if (i === 5) return [
    { k: '过滤温度', v: String(ops.Tfilter), unit: ' ℃', tone: ops.Tfilter >= 85 ? 'good' : 'bad' },
    { k: '溶解度对比', v: '100 ℃ 117.7 / 0 ℃ 4.7', unit: ' g/100g 水' },
  ];
  if (i === 6) return [
    { k: '三份', v: '结晶 / 单晶 / 蓝晒' },
    { k: '单晶', v: '避光静置 1~2 周' },
  ];
  if (i === 7) return [
    { k: '乙醇加入量', v: String(ops.ethanolVol), unit: ' mL', tone: ops.ethanolVol >= 10 ? 'good' : 'bad' },
    { k: '析晶', v: ops.ethanolVol >= 10 ? '完全' : '不完全', tone: ops.ethanolVol >= 10 ? 'good' : 'bad' },
  ];
  if (i === 8) {
    const out = [
      { k: 'm理论', v: r.mTheory.toFixed(2), unit: ' g' },
      { k: 'm实际', v: r.mActual.toFixed(2), unit: ' g', tone: r.yieldPct >= 65 ? 'good' : r.yieldPct >= 40 ? 'warn' : 'bad' },
      { k: '产率', v: r.yieldPct.toFixed(1), unit: ' %', tone: r.yieldPct >= 65 ? 'good' : r.yieldPct >= 40 ? 'warn' : 'bad' },
    ];
    if (ops.dryPlace === 1) out.push({ k: '晾干方式', v: '阳光直晒（产物光解）', tone: 'bad' });
    return out;
  }
  if (i === 9) return [
    { k: '感光剂', v: 'A 液 6 mL + B 液 2 mL' },
    { k: '涂布', v: ops.brushTechnique === 0 ? '先纵后横、均匀且薄' : '随意涂（不均）', tone: ops.brushTechnique === 0 ? 'good' : 'bad' },
    { k: '干燥', v: ops.sheetDry === 0 ? '吹干后曝光' : '未干就曝光', tone: ops.sheetDry === 0 ? 'good' : 'bad' },
  ];
  if (i === 10) return [
    { k: '曝光剂量', v: r.expo.dose.toFixed(0), unit: ' UV-s（当量）' },
    { k: '光解分数', v: (r.expo.f * 100).toFixed(1), unit: ' %',
      tone: r.expo.f >= 0.85 ? 'good' : r.expo.f >= 0.6 ? 'warn' : 'bad' },
    { k: '背景色深', v: `rgb(${prussianBlueColor(r.density).slice(0, 3).join(',')})` },
  ];
  return [
    { k: '显影方式', v: ops.washMethod === 0 ? '盘洗、换水 3~4 次' : '流水冲洗', tone: ops.washMethod === 0 ? 'good' : 'bad' },
    { k: '画面密度 D', v: r.density.toFixed(2) },
    { k: '洇痕', v: (r.mottle * 100).toFixed(0), unit: ' %', tone: r.mottle < 0.1 ? 'good' : 'bad' },
    { k: '成品背景', v: `rgb(${prussianBlueColor(r.density).slice(0, 3).join(',')})` },
  ];
}

function observation(i, r, ops) {
  if (i === 8) return `得翠绿色晶体 ${r.mActual.toFixed(2)} g（理论 ${r.mTheory.toFixed(2)} g），产率 ${r.yieldPct.toFixed(1)}%。`;
  if (i === 10) return ops.exposureSource === 0
    ? `紫外灯 ${ops.uvSeconds} s：光解分数 ${(r.expo.f * 100).toFixed(0)}%${r.expo.f < 0.6 ? '——欠曝，图案会淡' : r.expo.f >= 0.9 ? '——充分曝光' : '——略有不足'}。`
    : `阳光 ${ops.sunMinutes} min（≈${Math.round(r.expo.dose)} UV-s）：光解分数 ${(r.expo.f * 100).toFixed(0)}%。`;
  if (i === 11) return `水洗后高亮区变白、无黄绿色流出；晾干过程中普鲁士白被空气氧化，画面从近白慢慢「长出」普鲁士蓝。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.waterVol > 20) {
    out.push(`溶解用了 ${ops.waterVol} mL 蒸馏水（建议 15 mL）：草酸亚铁在水中仍有溶解度，水越多、沉淀损失越大——这是产率的第一刀（课件注意事项 2）。`);
  }
  if (ops.h2o2Fresh === 1) {
    out.push('3% H₂O₂ 放置多日已部分分解：氧化力不够，Fe(Ⅱ) 氧化不完全——后面 Fe(OH)₃ 与配位都不充分，产率与产品颜色都受影响。课件要求 H₂O₂ 必须新配。');
  }
  if (ops.oxidMinutes < 5) {
    out.push(`40 ℃ 只氧化了 ${ops.oxidMinutes} min（要求 5 min）：Fe(Ⅱ) 没充分氧化成 Fe(Ⅲ)，配位不完全。`);
  }
  if (ops.Tfilter < 85) {
    out.push(`过滤温度只有 ${ops.Tfilter} ℃：产物在冷溶液里溶解度急剧下降（100 ℃ 117.7 → 0 ℃ 4.7 g/100 g 水），结晶在滤纸上的那部分就是白丢的产率——「趁热」不是讲究，是硬指标。`);
  }
  if (ops.ethanolVol < 10) {
    out.push(`只加了 ${ops.ethanolVol} mL 乙醇：晶体析出不完全，留在母液里的产物没收回来。`);
  }
  if (ops.dryPlace === 1) {
    out.push('产物在阳光下晾干：它本来就见光分解（受光变黄），直晒等于一边晾一边毁——必须摊在表面皿上避光晾。');
  }
  if (ops.brushTechnique === 1) {
    out.push('随意涂布：涂层厚薄不均，显影后背景深浅不匀（画面花）。毛刷要先洗净甩干、先纵后横。');
  }
  if (ops.sheetDry === 1) {
    out.push('未干就压板曝光：湿涂层里的花纹会洇开糊掉——务必避光晾干/吹干后再曝光。');
  }
  if (r.expo.f < 0.6) {
    out.push(`曝光不足（光解分数仅 ${(r.expo.f * 100).toFixed(0)}%）：Fe²⁺ 造得太少，显影出来的图案淡、层次丢。紫外 30~45 s 或阳光约 30 min。`);
  }
  if (ops.washMethod === 1) {
    out.push('流水冲洗：水流会把涂层冲花、高亮区冲出条痕——课件明确「不能采用流水显影」。正确做法是盘洗、换水 3~4 次。');
  }
  if (!out.length) {
    out.push(`全流程规范：产率 ${r.yieldPct.toFixed(1)}%（${r.mActual.toFixed(2)} g / 理论 ${r.mTheory.toFixed(2)} g）；蓝晒光解分数 ${(r.expo.f * 100).toFixed(0)}%，成品背景 rgb(${prussianBlueColor(r.density).slice(0, 3).join(',')})。`);
    out.push(`收尾想一想：显影出来的「蓝」是晾干时空气中的氧把普鲁士白氧化出来的——如果水洗后立刻拍照，画面几乎是白的。这也是为什么 H₂O₂ 能「加速」：它只是把这个氧化按了快进键。`);
  }
  return out;
}

/* ---------- 附表与曝光曲线 ---------- */

function addYieldTable(host, r) {
  const wrap = h('div', { class: 'lab-table-wrap' });
  const f = r.factors;
  const rows = [
    ['溶解水量', f.fWater], ['H₂O₂ 新旧', f.fH2O2], ['氧化时间', f.fOxid],
    ['趁热过滤', f.fTfilter], ['乙醇用量', f.fEthanol], ['避光晾干', f.fDry],
  ];
  const table = h('table', { class: 'lab-table' },
    h('thead', {}, h('tr', {}, h('th', {}, '环节'), h('th', {}, '保留因子'), h('th', {}, '损耗'))),
    h('tbody', {},
      ...rows.map(([name, v]) => h('tr', {},
        h('td', {}, name),
        h('td', {}, v.toFixed(3)),
        h('td', {}, `${((1 - v) * 100).toFixed(0)}%`))),
      h('tr', {}, h('td', {}, '基准（转移/洗涤/抽滤）'), h('td', {}, f.base.toFixed(2)), h('td', {}, '22%')),
      h('tr', {}, h('td', {}, '总产率'), h('td', {}, `${r.yieldPct.toFixed(1)}%`), h('td', {}, `${(100 - r.yieldPct).toFixed(1)}%`))));
  wrap.append(table);
  wrap.append(h('div', { class: 'lab-caption' },
    `各环节损耗为方向性教学标定模型（依据课件注意事项）；m理论 = ${r.mTheory.toFixed(2)} g，m实际 = ${r.mActual.toFixed(2)} g。`));
  host.append(wrap);
}

/* ---------- 挂载 ---------- */

export function mount(root, params = {}) {
  let doseChart = null;
  let doseWrap = null;
  function drawDoseChart(host, r) {
    if (!doseChart) {
      const canvas = h('canvas', { 'aria-label': '曝光剂量与光解分数' });
      doseWrap = h('div', { class: 'chart-wrap', style: 'height:230px;margin-top:12px' }, canvas);
      doseChart = new Chart(canvas, {
        xLabel: '曝光剂量 / UV-s 当量', yLabel: '光解分数', xRange: [0, 90], yRange: [0, 1.05],
        pad: { l: 46, r: 16, t: 14, b: 30 },
      });
      doseChart.setSeries([{
        points: sample(0, 90, 60, d => 1 - Math.exp(-d / 12)),
        color: '--w-teal', width: 2,
      }]);
    }
    host.append(doseWrap);
    doseChart.setMarkers([{
      x: r.expo.dose, color: '--w-amber',
      label: `本次 ${Math.round(r.expo.dose)} UV-s → ${(r.expo.f * 100).toFixed(0)}%`,
    }]);
    doseChart.draw();
    host.append(h('div', { class: 'lab-caption' },
      '光解分数 = 1 − exp(−剂量/12)（教学标定）：30~45 s 紫外接近完全，10 s 明显欠曝；阳光按 1 min ≈ 1.5 UV-s 换算。'));
  }

  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species,
    observation, verdict, readings,
    equation: '2[Fe(C₂O₄)₃]³⁻ --hv--> 2Fe²⁺ + 2CO₂↑ + 5C₂O₄²⁻；3Fe²⁺ + 2[Fe(CN)₆]³⁻ = Feᴵᴵ₃[Feᴵᴵᴵ(CN)₆]₂↓',
    calculation: (i, r, ops) => {
      if (i === 0) return `n = ${ops.mMohr.toFixed(2)} g ÷ 392.14 g/mol = ${(r.n * 1000).toFixed(2)} mmol`;
      if (i === 4) return '2Fe(OH)₃ + 3H₂C₂O₄ + 3K₂C₂O₄ = 2K₃[Fe(C₂O₄)₃]·3H₂O（翠绿）';
      if (i === 8) return `产率 = m实际 ÷ ${r.mTheory.toFixed(2)} g × 100% = ${r.yieldPct.toFixed(1)}%（含各环节损耗，见表）`;
      if (i === 10) return `剂量 ${ops.exposureSource === 0 ? ops.uvSeconds + ' s（紫外）' : ops.sunMinutes + ' min（阳光）×1.5'} = ${Math.round(r.expo.dose)} UV-s → f = ${(r.expo.f * 100).toFixed(1)}%`;
      if (i === 11) return `背景色 = 255×10^(−D·k)，D = ${r.density.toFixed(2)} → rgb(${prussianBlueColor(r.density).slice(0, 3).join(',')})`;
      return STEPS[i].calc;
    },
    modelNote: '说明：产率计量按 1:1（莫尔盐 392.14 → 产物 491.25，课件按 392/491 计、同为 6.3 g）；'
      + '各环节损耗因子（水量、H₂O₂、氧化时间、趁热过滤、乙醇、避光）、光解分数（1−exp(−剂量/12)）与普鲁士蓝色深都是**方向性教学标定模型**——只保证方向与量级合理，不代表实测。'
      + '课件两处不自洽已按正文步骤处理：正文写 3% H₂O₂ 与 1:1 草酸，原理页与注意事项写 1%——本模拟器取 3%/1:1；乙醇 15 mL 而旁注「经验 ~10 mL 更好」——≥10 mL 即视为析出完全。',
    extra: (host, i, r) => {
      if (i === 8) addYieldTable(host, r);
      if (i === 10) drawDoseChart(host, r);
    },
    cleanup: () => { if (doseChart) doseChart.destroy(); },
  });
}
