/**
 * 实验四十：硫酸亚铁铵的制备。
 *
 * 课件流程：称量 -> 加酸 -> 加热溶解 -> 趁热过滤 -> 加硫酸铵
 * -> 水浴蒸发 -> 冷却结晶 -> 减压抽滤 -> 醇洗 -> 晾干 -> 称重 -> 比色。
 */
import { Chart } from '../chart.js';
import { mohrPrep, solubilityAt, thiocyanateColor, FE3_GRADES } from '../chem.js';
import { h, pourStream } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  balance, conicalFlask, cylinder, funnel, hotplate, waterBath,
  evapDish, buchner, suctionFlask, watchGlass, comparisonTube,
  stirringRod, bubbles, crystals, steam, powderPile,
  ferrousSolutionColor, MOHR_CRYSTAL_COLOR, IRON_POWDER_COLOR, CLEAR_COLOR,
  drawBench,
} from '../glassware.js';

// 稀硫酸近无色。原来给到 0.42，倾斜时一整块高亮色块贴在管里，
// 读起来像一片脱落的板——降到 0.24，够看出液面和液流，又不会盖住玻璃。
const ACID = [226, 234, 242, 0.24];

export const meta = {
  id: 'mohr-salt',
  name: '硫酸亚铁铵的制备',
  wave: '实验四十',
  accent: '--w-green',
  desc: '从纯铁粉制备浅蓝绿色莫尔盐，逐步观察产量、结晶和 Fe³⁺ 杂质如何受操作影响。',
};

const GUIDE = {
  mFe: 2, vAcid: 15, Tboil: 100, boilMinutes: 10, exposed: 1,
  Tfilter: 90, vWaterFilter: 25, mAS: 4.5, vWaterEnd: 10, Tcool: 20, washes: 2,
};

const DEFAULTS = {
  ...GUIDE, Tboil: 115, boilMinutes: 18, Tfilter: 35, vWaterEnd: 16,
};

const CONTROLS = [
  { key: 'mFe', label: '纯铁粉质量', unit: ' g', min: 1, max: 4, step: 0.1, ref: '教材 2.0 g' },
  { key: 'vAcid', label: '3 mol/L H₂SO₄', unit: ' mL', min: 5, max: 30, step: 0.5, ref: '教材 15 mL' },
  { key: 'Tboil', label: '加热时溶液温度', unit: ' °C', min: 60, max: 160, step: 5, ref: '溶液近沸' },
  { key: 'boilMinutes', label: '加热时长', unit: ' min', min: 2, max: 60, step: 1, ref: '反应完全即止' },
  { key: 'exposed', label: '敞口暴露程度', unit: '', min: 0, max: 1, step: 0.25, ref: '教学模型参数' },
  { key: 'Tfilter', label: '过滤温度', unit: ' °C', min: 20, max: 95, step: 1, ref: '必须趁热' },
  { key: 'vWaterFilter', label: '过滤总体积', unit: ' mL', min: 10, max: 60, step: 1, ref: '教材约 25 mL' },
  { key: 'mAS', label: '硫酸铵质量', unit: ' g', min: 2, max: 8, step: 0.1, ref: '教材 4.5 g' },
  { key: 'vWaterEnd', label: '蒸发后剩余水', unit: ' mL', min: 2, max: 30, step: 0.5, ref: '出现固体薄膜即停' },
  { key: 'Tcool', label: '结晶终了温度', unit: ' °C', min: 0, max: 40, step: 1, ref: '自然冷却' },
  { key: 'washes', label: '乙醇洗涤次数', unit: ' 次', min: 0, max: 4, step: 1, ref: '课件两次' },
];

const STEPS = [
  { name: '称取铁粉', op: '称取 2.00 g 纯铁粉，置于锥形瓶中。', why: '铁粉是 FeSO₄ 的来源；过量的铁不会由硫酸铵限制的理论产量继续增加。', eq: 'm(Fe)=2.00 g', calc: 'n(Fe)=2.00/55.845=0.0358 mol' },
  { name: '加入硫酸', op: '量取 15 mL 3 mol·L⁻¹ H₂SO₄，沿瓶壁加入并轻轻摇动。', why: '硫酸要过量，使铁能完全溶解并保持酸性，抑制 Fe²⁺ 水解和氧化。', eq: 'Fe + 2H⁺ → Fe²⁺ + H₂↑', calc: 'n(H₂SO₄)=0.015×3=0.0450 mol' },
  { name: '加热溶解', op: '锥形瓶直接置于电热板，加热至反应完全并不断摇动；必要时补热水热酸。', why: '加热提高反应速率，但过久、过热和空气暴露会增加 Fe²⁺ 氧化。', eq: 'Fe + H₂SO₄ → FeSO₄ + H₂↑', calc: '教学标定：100 °C、10 min 视为反应完成；模型不是实测动力学' },
  { name: '趁热过滤', op: '加水至总体积约 25 mL，趁热用短颈漏斗常压过滤。', why: '冷却会使 FeSO₄·7H₂O 在滤纸上析出并被弃去，所以必须趁热。', eq: 'FeSO₄(aq) —过滤→ 除去不溶物', calc: '过滤损失由 FeSO₄·7H₂O 溶解度估算' },
  { name: '加入硫酸铵', op: '往滤液中加入 4.5 g (NH₄)₂SO₄，加热并搅拌至完全溶解。', why: '复盐溶解度低于组分，且硫酸铵通常是本配方的限制试剂。', eq: 'FeSO₄+(NH₄)₂SO₄+6H₂O→莫尔盐晶体', calc: 'n((NH₄)₂SO₄)=4.5/132.14=0.0341 mol' },
  { name: '水浴蒸发', op: '混合液转入蒸发皿，置水浴中缓慢蒸发至出现固体薄膜。', why: '水浴受热均匀且不超过约 100 °C，减少暴沸、溅失和 Fe²⁺ 氧化。', eq: 'H₂O(l) → H₂O(g)', calc: '蒸发不足会使更多莫尔盐留在母液；烧干会增加溅失' },
  { name: '冷却结晶', op: '停止加热，静置自然冷却至室温。', why: '莫尔盐溶解度随温度降低而下降，冷却是晶体析出的主要步骤。', eq: 'Fe²⁺+2NH₄⁺+2SO₄²⁻+6H₂O→晶体', calc: '母液残留 = 溶解度 × 剩余水质量 / 100' },
  { name: '减压抽滤', op: '用布氏漏斗减压抽滤，分离母液并尽量抽干。', why: '抽滤缩短晶体与母液接触的时间；母液中仍溶有莫尔盐。', eq: '固液分离', calc: '母液带走的质量单独计入损失' },
  { name: '乙醇洗涤', op: '用少量乙醇洗涤晶体两次。', why: '莫尔盐难溶于乙醇；乙醇能带走晶体表面的母液且易挥发。', eq: '物理洗涤，无新物质生成', calc: '教学模型按每次洗涤约 2% 机械损失估算' },
  { name: '晾干', op: '将晶体转移到表面皿，自然晾干。', why: '不能加热烘干；莫尔盐含结晶水，受热会失水并增加氧化风险。', eq: '乙醇(l) → 乙醇(g)', calc: '晾干去除表面乙醇，不改变晶体的结晶水' },
  { name: '称重', op: '台秤称量干燥晶体，记录实际产量。', why: '实际产量要和限制试剂决定的理论产量比较，才能得到产率。', eq: '产率=m(实际)/m(理论)×100%', calc: '理论产量 = min(nFe,nH₂SO₄,n((NH₄)₂SO₄))×392.135' },
  { name: '目视比色定级', op: '取 1.0 g 产品，用无氧水、HCl 和 KSCN 配成比色液，与标准色阶比较。', why: 'Fe³⁺ 越多，硫氰酸铁配合物颜色越深；产量和纯度是两个不同指标。', eq: 'Fe³⁺+nSCN⁻ ⇌ [Fe(SCN)ₙ]³⁻ⁿ', calc: '标准色阶：Ⅰ 0.050 mg/g；Ⅱ 0.100 mg/g；Ⅲ 0.200 mg/g' },
];

function resultReadings(i, r, ops) {
  if (i === 0) return [
    { k: '铁粉质量', v: ops.mFe.toFixed(2), unit: ' g' },
    { k: '铁的物质的量', v: r.nFe.toFixed(4), unit: ' mol' },
  ];
  if (i === 1) return [
    { k: '硫酸体积', v: ops.vAcid.toFixed(1), unit: ' mL' },
    { k: '硫酸物质的量', v: r.nAcid.toFixed(4), unit: ' mol' },
  ];
  if (i === 2) return [
    { k: '反应完成度', v: (r.reactionCompletion * 100).toFixed(0), unit: '%' },
    { k: '已溶解铁', v: r.nFeDissolved.toFixed(4), unit: ' mol' },
    { k: 'Fe³⁺氧化分数', v: (r.oxidizedFrac * 100).toFixed(3), unit: '%' },
  ];
  if (i === 3) return [
    { k: '过滤总体积', v: ops.vWaterFilter.toFixed(0), unit: ' mL' },
    { k: '过滤损失', v: r.lossProduct.filtration.toFixed(2), unit: ' g', tone: r.lossProduct.filtration > 0.05 ? 'warn' : 'good' },
  ];
  if (i === 4) return [
    { k: '硫酸铵质量', v: ops.mAS.toFixed(1), unit: ' g' },
    { k: '硫酸铵物质的量', v: r.nAS.toFixed(4), unit: ' mol' },
  ];
  if (i === 5) return [
    { k: '蒸发后剩余水', v: ops.vWaterEnd.toFixed(1), unit: ' mL' },
    { k: '蒸发状态', v: ops.vWaterEnd < 6 ? '过度' : ops.vWaterEnd > 15 ? '不足' : '出现薄膜' },
  ];
  if (i === 6) return [
    { k: '结晶温度', v: ops.Tcool.toFixed(0), unit: ' °C' },
    { k: '母液带走', v: r.motherLiquor.toFixed(2), unit: ' g', tone: r.motherLiquor > 2 ? 'warn' : 'good' },
  ];
  if (i === 7) return [
    { k: '晶体质量（抽滤前）', v: r.crystallized.toFixed(2), unit: ' g' },
    { k: '母液带走', v: r.motherLiquor.toFixed(2), unit: ' g' },
  ];
  if (i === 8) return [
    { k: '乙醇洗涤次数', v: ops.washes.toFixed(0), unit: ' 次' },
    { k: '洗涤/转移损失', v: r.lossProduct.handling.toFixed(2), unit: ' g' },
  ];
  if (i === 9) return [
    { k: '晾干状态', v: '表面乙醇已除' },
    { k: '结晶水', v: '保留' },
  ];
  const out = [
    { k: '理论产量', v: r.mTheo.toFixed(2), unit: ' g' },
    { k: '限制试剂', v: r.limiting },
    { k: '实际产量', v: r.mYield.toFixed(2), unit: ' g', tone: r.yieldFrac > 0.6 ? 'good' : 'warn' },
    { k: '产率', v: (r.yieldFrac * 100).toFixed(1), unit: '%', tone: r.yieldFrac > 0.6 ? 'good' : 'warn' },
  ];
  if (i === 11) out.push(
    { k: 'Fe³⁺', v: r.mgFe3 == null ? '—' : r.mgFe3.toFixed(3), unit: ' mg/g' },
    { k: '试剂级别', v: r.grade, tone: r.grade === 'Ⅰ' ? 'good' : 'warn' },
  );
  return out;
}

function species(i, r) {
  const K = 34 / 0.04;
  const items = [];
  const push = (label, n, color, phase, cap = 70) => {
    if (n > 0) items.push({ label, n: Math.min(cap, Math.max(1, Math.round(n))), color, phase });
  };
  if (i === 0) push('Fe', 0.0358 * K, '#8b939c', 'solid');
  else if (i === 1) {
    push('Fe', 0.0358 * K, '#8b939c', 'solid');
    push('H⁺', 0.09 * K, '#e05a4f');
    push('SO₄²⁻', 0.045 * K, '#5c82d6');
  } else if (i === 2) {
    push('Fe²⁺', r.nFeDissolved * K, '#2fb3a3');
    push('H₂↑', r.nFeDissolved * K, '#c9d6e0');
    push('SO₄²⁻', r.nFeDissolved * K, '#5c82d6');
    push('Fe³⁺', r.oxidizedFrac * r.nFeDissolved * K * 5, '#c8842a');
  } else if (i <= 4) {
    push('Fe²⁺', r.nAfterOxidation * K, '#2fb3a3');
    push('NH₄⁺', r.nAS * K, '#e8a33d');
    push('SO₄²⁻', (r.nAfterOxidation + r.nAS) * K, '#5c82d6');
  } else if (i <= 9) {
    push('Fe²⁺', r.motherLiquor * 0.03 * K, '#2fb3a3');
    push('NH₄⁺', r.motherLiquor * 0.05 * K, '#e8a33d');
    push('莫尔盐晶体', r.crystallized * 0.07 * K, '#8fd2c5', 'solid', 80);
  } else {
    push('Fe²⁺', 24 * (1 - r.oxidizedFrac), '#2fb3a3');
    push('Fe³⁺', Math.max(1, 24 * r.oxidizedFrac * 5), '#c8842a');
    push('NH₄⁺', 24, '#e8a33d');
  }
  return {
    title: i === 11 ? '比色液中的物种' : '过程中的溶液/晶体',
    items,
    note: '粒子数量只表示相对多少；固体晶体固定在晶格位置',
  };
}

function draw(ctx, W, H, t, i, r, ops) {
  const B = drawBench(ctx, W, H);   // 台面线统一在 glassware.js 的 BENCH_Y
  const cx = W / 2;
  const solution = ferrousSolutionColor(r.mgFe3 || 0);
  if (i === -1) {
    conicalFlask(ctx, { x: cx - 190, y: B - H * 0.48, w: 110, h: H * 0.48 }, { liquid: CLEAR_COLOR, level: 0.1 });
    evapDish(ctx, { x: cx - 52, y: B - H * 0.22, w: 150, h: H * 0.22 }, {});
    buchner(ctx, { x: cx + 92, y: B - H * 0.40, w: 110, h: H * 0.40 }, {});
    return;
  }
  if (i === 0 || i === 10) {
    const box = { x: cx - 115, y: B - H * 0.50, w: 230, h: H * 0.50 };
    balance(ctx, box, { item: i === 0, itemColor: i === 0 ? IRON_POWDER_COLOR : MOHR_CRYSTAL_COLOR,
      reading: i === 0 ? '2.00' : r.mYield.toFixed(2), tone: i === 10 ? 'good' : '' });
    if (i === 10) crystals(ctx, { x: cx - 70, y: box.y + box.h * 0.16 - 14, w: 140, h: 12 }, t,
      Math.min(1, r.mYield / 13), { color: MOHR_CRYSTAL_COLOR, spin: false });
    return;
  }
  if (i === 1) {
    /* 课件第 8 页：锥形瓶里先盛 2 g 纯铁粉，再加 15 mL 3 mol·L⁻¹ H₂SO₄ 并轻摇。
       所以这一步瓶里是「铁粉 + 正在加入的酸」，不是一上来就有半瓶溶液。 */
    const flask = { x: cx - 55, y: B - H * 0.48, w: 110, h: H * 0.48 };
    const f = conicalFlask(ctx, flask, { level: 0 });
    powderPile(ctx, { x: flask.x + 24, y: B - 15, w: flask.w - 48, h: 13 }, 0.55);

    /* 量筒倾角必须**超过 90°**，壶嘴才低于筒心、液才倒得出来。
       原值 1.42 rad（81.4°）壶嘴比筒心还高 0.15h，液体往筒底聚——倒不出去，
       而且筒身几乎躺平，画出来像一块斜板。2.01 rad ≈ 115° 是正常倾倒姿势。 */
    // 细长筒身（30×109）：量筒本来就是细长的，粗筒一倾斜看着就是一坨
    const cz = cylinder(ctx, { x: cx - 95, y: H * 0.04, w: 30, h: H * 0.32 },
      { liquid: ACID, level: 0.50, tilt: 2.30 });

    // 液流从**壶嘴锚点**出发落到瓶口。起点不再手写——手写必然对不上（原来差了 48 px）
    pourStream(ctx, cz.spout, { x: f.mouth.x - 2, y: f.mouth.y + 9 }, { color: [222, 232, 240], t, width: 3.2 });
    return;
  }
  if (i === 2) {
    const plate = { x: cx - 110, y: B - H * 0.22, w: 220, h: H * 0.22 };
    hotplate(ctx, plate, { heat: 0.8, steam: 0.35, t });
    const flask = { x: cx - 58, y: plate.y - H * 0.46, w: 116, h: H * 0.46 };
    conicalFlask(ctx, flask, { liquid: solution, level: 0.44 });
    bubbles(ctx, { x: flask.x + 20, y: flask.y + flask.h * 0.46, w: flask.w - 40, h: flask.h * 0.42 }, t, 0.9);
    return;
  }
  if (i === 3) {
    const flask = { x: cx - 60, y: B - H * 0.34, w: 120, h: H * 0.34 };
    conicalFlask(ctx, flask, { liquid: solution, level: 0.28 });
    const fh = H * 0.30, fy = flask.y - fh + H * 0.025;
    funnel(ctx, { x: cx - 58, y: fy, w: 116, h: fh }, {
      liquid: solution, level: 0.42, stemLevel: 0.80, paperDirty: ops.Tfilter < 70,
    });
    if (ops.Tfilter < 70) crystals(ctx, { x: cx - 35, y: fy + 12, w: 70, h: 18 }, t, 0.85, { color: MOHR_CRYSTAL_COLOR, spin: false });
    else steam(ctx, { x: cx - 65, y: fy - 55, w: 130, h: 60 }, t, 0.55);
    return;
  }
  if (i === 4) {
    const flask = { x: cx - 58, y: B - H * 0.50, w: 116, h: H * 0.50 };
    conicalFlask(ctx, flask, { liquid: solution, level: 0.52 });
    stirringRod(ctx, { x: cx - 2, y: flask.y + 18, w: 18, h: H * 0.31 }, { angle: 12 });
    for (let n = 0; n < 12; n++) {
      const ph = (t * 0.4 + n * 0.11) % 1;
      ctx.fillStyle = `rgba(232,238,244,${1 - ph})`;
      ctx.beginPath(); ctx.arc(cx + Math.sin(n * 2.1) * 15, flask.y - 24 + ph * H * 0.28, 1.7, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (i === 5) {
    const bath = { x: cx - 150, y: H * 0.42, w: 300, h: B - H * 0.42 };
    waterBath(ctx, bath, { steam: 0.75, t, ringW: 190 });
    const wallTop = bath.y + bath.h * 0.26;
    evapDish(ctx, { x: cx - 95, y: wallTop - H * 0.18, w: 190, h: H * 0.18 }, {
      liquid: solution, level: Math.max(0.1, Math.min(0.9, ops.vWaterEnd / 30)),
    });
    return;
  }
  if (i === 6) {
    const box = { x: cx - 110, y: B - H * 0.24, w: 220, h: H * 0.24 };
    evapDish(ctx, box, { liquid: solution, level: 0.32 });
    crystals(ctx, { x: cx - 76, y: box.y + 10, w: 152, h: 44 }, t, Math.min(1, r.crystallized / 12),
      { color: MOHR_CRYSTAL_COLOR, spin: false });
    return;
  }
  if (i === 7 || i === 8) {
    const fh = H * 0.40, flask = { x: cx - 72, y: B - fh, w: 144, h: fh };
    suctionFlask(ctx, flask, { liquid: i === 8 ? [214, 226, 238, 0.16] : solution, level: 0.25 });
    const bh = H * 0.46;
    buchner(ctx, { x: cx - 66, y: flask.y - bh + 6, w: 132, h: bh }, {
      liquid: i === 8 ? [214, 226, 238, 0.16] : solution,
      level: i === 8 ? 0.25 : 0.45, cake: Math.min(1, r.crystallized / 12),
      cakeColor: MOHR_CRYSTAL_COLOR, dropColor: solution, dripping: true, t,
    });
    return;
  }
  if (i === 9) {
    watchGlass(ctx, { x: cx - 140, y: B - H * 0.30, w: 280, h: H * 0.30 }, {
      crystal: Math.min(1, r.crystallized / 12), crystalColor: MOHR_CRYSTAL_COLOR, t,
    });
    steam(ctx, { x: cx - 60, y: B - H * 0.31, w: 120, h: 45 }, t, 0.22);
    return;
  }
  if (i === 11) {
    const mgs = [0, FE3_GRADES[0].mg, FE3_GRADES[1].mg, FE3_GRADES[2].mg, r.mgFe3 || 0];
    const labels = ['空白', 'Ⅰ级', 'Ⅱ级', 'Ⅲ级', '样品'];
    const tubeW = 46, gap = 20, total = mgs.length * tubeW + (mgs.length + 1) * gap;
    const left = cx - total / 2, cardY = H * 0.16, cardH = B - cardY - 8;
    ctx.fillStyle = 'rgba(244,247,250,0.98)'; ctx.fillRect(left, cardY, total, cardH);
    for (let n = 0; n < mgs.length; n++) {
      const x = left + gap + n * (tubeW + gap);
      comparisonTube(ctx, { x, y: cardY + 20, w: tubeW, h: cardH * 0.62 }, { liquid: thiocyanateColor(mgs[n]), level: 0.60 });
      ctx.fillStyle = n === 4 ? '#3b8e38' : '#62717c'; ctx.font = '11px "PingFang SC", sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(labels[n], x + tubeW / 2, cardY + cardH * 0.76);
      ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.fillText(mgs[n] ? `${mgs[n].toFixed(3)} mg` : '—', x + tubeW / 2, cardY + cardH * 0.83);
    }
  }
}

function observation(i, r, ops) {
  if (i === 3) return ops.Tfilter < 70 ? `过滤温度偏低：滤纸上析出 FeSO₄·7H₂O，估算损失 ${r.lossProduct.filtration.toFixed(2)} g。` : '热滤液顺利通过滤纸，未把大量 FeSO₄·7H₂O 带走。';
  if (i === 6) return `冷却至 ${ops.Tcool} °C，生成浅蓝绿色晶体；仍有 ${r.motherLiquor.toFixed(2)} g 留在母液。`;
  if (i === 10) return `干燥晶体质量 ${r.mYield.toFixed(2)} g，产率 ${(r.yieldFrac * 100).toFixed(1)}%。`;
  if (i === 11) return `样品 Fe³⁺ ${r.mgFe3 == null ? '—' : r.mgFe3.toFixed(3)} mg/g，对应 ${r.grade} 级。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.Tfilter < 70) out.push(`趁热过滤偏离：过滤温度 ${ops.Tfilter} °C，滤纸上析出 FeSO₄·7H₂O，估算损失 ${r.lossProduct.filtration.toFixed(2)} g 莫尔盐当量。`);
  if (r.reactionCompletion < 0.99) out.push(`加热未充分：模型反应完成度 ${(r.reactionCompletion * 100).toFixed(0)}%，仍有铁未反应。`);
  if (ops.boilMinutes > 16 || ops.Tboil > 105 || ops.exposed > 0.75) out.push(`加热/暴露偏久：Fe²⁺ 氧化模型值 ${r.oxidizedFrac.toExponential(2)}，Fe³⁺ 估算 ${r.mgFe3?.toFixed(3) || '—'} mg/g。`);
  if (ops.vWaterEnd > 15) out.push(`蒸发不足：剩余水 ${ops.vWaterEnd} mL，母液带走 ${r.motherLiquor.toFixed(2)} g。`);
  if (ops.vWaterEnd < 6) out.push(`蒸发过度：模型计入暴沸溅失 ${(r.splashLoss * 100).toFixed(1)}%。`);
  if (ops.washes > 2) out.push(`乙醇洗涤 ${ops.washes} 次，额外机械损失已计入产量。`);
  if (!out.length) out.push('各项操作在本教学模型的规范范围内，产量与 Fe³⁺ 级别均达到预期。');
  return out;
}

function addSolubilityChart(host, ops) {
  const wrap = h('div', { class: 'chart-wrap', style: 'height:240px' });
  const canvas = h('canvas'); wrap.append(canvas); host.append(wrap);
  const chart = new Chart(canvas, { xLabel: '温度 / °C', yLabel: '溶解度 / g·100 g⁻¹水', xRange: [0, 60], yRange: [0, 90], pad: { l: 46, r: 16, t: 14, b: 34 } });
  const points = key => Array.from({ length: 31 }, (_, j) => {
    const T = j * 2; return { x: T, y: solubilityAt(key, T) };
  });
  chart.setMarkers([{ x: ops.Tcool, color: 'var(--w-teal)', label: '结晶温度' }]);
  chart.setSeries([
    { name: '(NH₄)₂SO₄', points: points('as'), color: 'var(--w-indigo)', width: 1.4 },
    { name: 'FeSO₄·7H₂O', points: points('feso4'), color: 'var(--w-amber)', width: 1.4 },
    { name: '莫尔盐', points: points('mohr'), color: 'var(--w-green)', width: 2.2, glow: true },
  ]);
  chart.draw();
}

/** 全流程物料衡算。提到模块级是为了让 sceneSpec 与 mount 引用同一个函数，不会漂移。 */
const model = ops => mohrPrep(ops);

/**
 * 供自检页（`_scenes-all.html` / `_scenes-test.html`）读取的最小场景描述。
 * 有了它，自检页就不必**手抄**步骤名——sim 里改一步，自检页跟着变。
 * 引用的全是模块级标识符，不会与 mount 里那份漂移。
 */
export const sceneSpec = { id: meta.id, name: meta.name, steps: STEPS, guide: GUIDE, model, draw };

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model,
    draw, species, observation, verdict,
    equation: 'Fe + H₂SO₄ → FeSO₄ + H₂↑ ｜ FeSO₄+(NH₄)₂SO₄+6H₂O→莫尔盐',
    calculation: (i, r) => i >= 10
      ? `理论 ${r.mTheo.toFixed(2)} g；实际 ${r.mYield.toFixed(2)} g；产率 ${(r.yieldFrac * 100).toFixed(1)}%`
      : STEPS[i].calc,
    readings: resultReadings,
    modelNote: '说明：产量、氧化分数和 Fe³⁺ 读数是用于方向性教学的标定模型，不是实测动力学数据；课件溶解度和计量关系按原表/原式计算。',
    extra: (host, i, r, ops) => { if (i === 5 || i === 6) addSolubilityChart(host, ops); },
  });
}
