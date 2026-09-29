/**
 * 实验三十一：滴定分析基本操作练习。
 *
 * 重点不是新增理论，而是把润洗、排气泡、视线、半滴和终点保持
 * 与最终读数的关系连起来。课件范例中的比值按表内数据重算为 0.9976。
 */
import { titrationOperation } from '../chem.js';
import { h, noteAt, pourStream } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  burette, conicalFlask, pipette, volumetricFlask, balance,
  testTube, tubing, CLEAR_COLOR, beaker, washBulb, reagentBottle,
  drawBench } from '../glassware.js';

const C_NAOH = [110, 200, 190, 0.42];   // 0.1000 mol·L⁻¹ NaOH 近无色，给一点色相便于分辨

export const meta = {
  id: 'titration-practice',
  name: '滴定分析基本操作练习',
  wave: '实验三十一',
  accent: '--w-teal',
  desc: '把“会背滴定步骤”变成“每个动作都会影响读数”的操作训练。',
};

const GUIDE = {
  pipetteRinse: 0, buretteRinse: 0, bubblesPurged: 0, eyeLevel: 0,
  wallWashed: 0, endpointHoldS: 30,
};
const DEFAULTS = {
  pipetteRinse: 1, buretteRinse: 1, bubblesPurged: 1, eyeLevel: 1,
  wallWashed: 1, endpointHoldS: 20,
};
const CONTROLS = [
  { key: 'pipetteRinse', label: '移液管待测液润洗', options: ['已润洗', '未润洗（错误）'] },
  { key: 'buretteRinse', label: '滴定管标准液润洗', options: ['已润洗', '未润洗（错误）'] },
  { key: 'bubblesPurged', label: '排除旋塞下气泡', options: ['已排尽', '有气泡（错误）'] },
  { key: 'eyeLevel', label: '视线与弯液面同高', options: ['同高', '俯视/仰视（错误）'] },
  { key: 'wallWashed', label: '终点前冲洗瓶壁', options: ['已冲洗', '未冲洗（错误）'] },
  { key: 'endpointHoldS', label: '终点颜色保持', unit: ' s', min: 10, max: 40, step: 1 },
];

const STEPS = [
  { name: '配制操作溶液', op: '25 mL 2 mol·L⁻¹ NaOH 稀释至 500 mL，装入塑料试剂瓶；HCl 装玻璃瓶。', why: 'NaOH 会吸收 CO₂，不能长期装在普通玻璃瓶中；两者浓度目标均为 0.1000 mol·L⁻¹。', eq: 'c₁V₁=c₂V₂', calc: '2.00×25.00/500.00=0.1000 mol·L⁻¹' },
  { name: '移液管洗涤润洗', op: '洗涤、擦干尖嘴，再用待吸液润洗移液管 2～3 次。', why: '未用待吸液润洗，管壁残留水会稀释待测液，结果会系统偏离。', eq: 'n=cV', calc: '移液管只能放在架上或拿在手中，不得随意放在桌面' },
  { name: '定量移取', op: '用洗耳球吸取 25.00 mL NaOH，垂直转移至锥形瓶并用水冲洗瓶壁。', why: '移液管只负责准确转移固定体积；洗耳球不能用嘴吸。', eq: 'V(NaOH)=25.00 mL', calc: '读数与转移体积按容量管标称值记录' },
  { name: '滴定管润洗装液', op: '用 NaOH 溶液润洗滴定管 2～3 次，直接装液，不借助漏斗或烧杯。', why: '滴定管残留水会稀释标准液，使消耗体积偏大。', eq: 'c(NaOH)≈0.1000 mol·L⁻¹', calc: '酸式/碱式滴定管都要先润洗再装液' },
  { name: '排气泡并调零', op: '打开旋塞排尽下端气泡，垂直挂在滴定台上静置 30 s，再调至 0.00 mL。', why: '气泡占据刻度体积，初始读数与实际送出的液体体积不一致。', eq: 'V消耗=V终−V初', calc: '调零点看弯液面最低点，读数精确到 0.01 mL' },
  { name: '控制滴定速度', op: '先见滴成线，再逐滴，最后半滴半滴；边滴边摇。', why: '接近终点时反应颜色变化需要时间，快滴会越过终点。', eq: 'H⁺+OH⁻→H₂O', calc: '半滴用锥形瓶壁碰下，再用去离子水冲洗瓶壁' },
  { name: '判断终点并读数', op: '酚酞浅红色保持 30 s 不褪，视线与弯液面最低点同高后读至 0.01 mL。', why: '终点颜色和读数姿势分别决定化学终点误差与视差误差。', eq: 'pH 8.2～9.8：酚酞变色范围', calc: '强酸强碱突跃约 pH 4.3～9.7' },
  { name: '平行测定与比值', op: '三次读数全距不超过 0.04 mL 才取平均，计算 V̄(HCl)/V̄(NaOH)。', why: '全距过大说明操作重复性不够，应重做而不能“挑最好的一次”。', eq: 'V̄(HCl)/V̄(NaOH)=25.00/25.06=0.9976', calc: '课件表中 0.9970 与表内 25.00、25.06 不一致，按重算值 0.9976' },
];

function model(ops) {
  return titrationOperation({
    pipetteRinsed: ops.pipetteRinse === 0,
    buretteRinsed: ops.buretteRinse === 0,
    bubblesPurged: ops.bubblesPurged === 0,
    eyeLevel: ops.eyeLevel === 0,
    wallWashed: ops.wallWashed === 0,
    endpointHoldS: ops.endpointHoldS,
  });
}

function draw(ctx, W, H, t, i, r) {
  const B = drawBench(ctx, W, H);   // 台面线统一在 glassware.js 的 BENCH_Y
  const cx = W / 2;
  if (i === -1) {
    burette(ctx, { x: cx - 90, y: H * 0.10, w: 54, h: H * 0.68 }, { level: 0.22, liquid: [110, 200, 190, 0.36] });
    conicalFlask(ctx, { x: cx + 35, y: B - 155, w: 100, h: 155 }, { liquid: CLEAR_COLOR, level: 0.24 });
    return;
  }
  if (i === 0) {
    volumetricFlask(ctx, { x: cx - 120, y: B - 210, w: 90, h: 210 }, { liquid: [110, 200, 190, 0.32], level: 0.42 });
    volumetricFlask(ctx, { x: cx + 35, y: B - 210, w: 90, h: 210 }, { liquid: CLEAR_COLOR, level: 0.42 });
    return;
  }
  if (i === 1) {
    /* 移液管洗涤润洗：管尖浸在待吸液里，管壁挂着一层液膜。
       这一格与下一步（定量移取）原本画得一模一样，看不出是两件事。 */
    const bk = { x: cx - 200, y: B - 132, w: 112, h: 132 };
    beaker(ctx, bk, { liquid: C_NAOH, level: 0.55 });
    const liquidY = bk.y + bk.h * (1 - 0.55);        // 液面高度，管尖要**浸到它下面**
    const pp = { x: cx - 230, y: 175, w: 168, h: 20 };
    const ang = -0.90;                                // 取负，左端（管尖）才朝下
    pipette(ctx, pp, { angle: ang });
    // 用与 pipette() 同一套「绕框心旋转」的公式算出管轴两端，液膜点就永远贴在管身上
    const pc = { x: pp.x + pp.w / 2, y: pp.y + pp.h / 2 };
    const along = k => ({ x: pc.x + k * Math.cos(ang), y: pc.y + k * Math.sin(ang) });
    const tip = along(-pp.w * 0.38), top = along(pp.w * 0.47);
    // 屏幕坐标 y 越大越低：管尖必须**大于**液面 y 才算浸进去
    if (tip.y < liquidY + 6) {
      console.warn(`titration-practice 第2步：管尖 y=${tip.y.toFixed(0)} 没浸到液面 y=${liquidY.toFixed(0)} 以下`);
    }
    // 管内液膜随 t 沿管轴下滑——润洗这个动作本身就是液体在管内壁上走一遍
    const slide = (t * 0.17) % 1;
    ctx.save();
    for (let k = 0; k < 4; k++) {
      const u = (slide + k / 4) % 1;                  // 0 在管尖端、1 在管顶端
      const px = tip.x + (top.x - tip.x) * u;
      const py = tip.y + (top.y - tip.y) * u;
      ctx.beginPath();
      ctx.arc(px, py, 4.0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(110,200,190,${0.75 * (0.35 + 0.65 * u)})`;
      ctx.fill();
    }
    ctx.restore();
    noteAt(ctx, cx + 30, 70, '润洗 2～3 次', 'rgba(160,180,196,0.9)');
    noteAt(ctx, cx + 30, 88, '管壁残留水会稀释待测液', 'rgba(160,180,196,0.6)');
    return;
  }
  if (i === 2) {
    /* 定量移取：课件第 3 步原文「用洗耳球吸取 25.00 mL NaOH，垂直转移至锥形瓶」。
       洗耳球是本步的核心器具（正文提 4 次、课件装置图上有），此前代码里一次都没画。 */
    reagentBottle(ctx, { x: cx - 232, y: B - 148, w: 56, h: 148 },
      { liquid: C_NAOH, level: 0.62, label: ['NaOH'] });
    const flask = { x: cx + 8, y: B - 130, w: 100, h: 130 };
    const f = conicalFlask(ctx, flask, { liquid: [225, 232, 238, 0.24], level: 0.22 });
    const mx = f.mouth.x;
    // 竖直放置：angle = -π/2 时管尖（局部 -0.38w 那端）朝下、胖肚（+0.28~0.47w）朝上
    pipette(ctx, { x: mx - 70, y: 111, w: 140, h: 22 }, { angle: -Math.PI / 2 });
    // 管中已吸起的液柱
    ctx.save();
    ctx.strokeStyle = 'rgba(110,200,190,0.85)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx, 92); ctx.lineTo(mx, 168); ctx.stroke();
    ctx.restore();
    // 洗耳球套在管顶，捏动幅度随 t 起伏——这是本步唯一该动的地方
    washBulb(ctx, { x: mx - 22, y: 4, w: 44, h: 56 },
      { squeeze: 0.42 + 0.24 * Math.sin(t * 1.7) });
    noteAt(ctx, cx - 232, 74, '洗耳球吸取 25.00 mL', 'rgba(160,180,196,0.9)');
    noteAt(ctx, cx - 232, 92, '绝不能用嘴吸', 'rgba(224,90,79,0.85)');
    return;
  }
  const buretteBox = { x: cx - 35, y: H * 0.04, w: 58, h: H * 0.42 };
  burette(ctx, buretteBox, {
    level: i >= 6 ? 0.46 : 0.18, liquid: [110, 200, 190, 0.42],
  });
  const flask = { x: cx - 20, y: B - 140, w: 110, h: 140 };
  conicalFlask(ctx, flask, { liquid: i >= 6 ? [214, 102, 160, 0.38] : CLEAR_COLOR, level: 0.30 });
  const mouthX = flask.x + flask.w / 2;
  pourStream(ctx, { x: mouthX, y: buretteBox.y + buretteBox.h }, { x: mouthX, y: flask.y + 8 },
    { color: [110, 200, 190], alpha: 0.72, width: 3, t });
  if (i === 5) {
    ctx.fillStyle = '#e8a33d'; ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.fillText('半滴 + 冲洗瓶壁', cx + 100, H * 0.22);
  }
  if (i >= 6) {
    ctx.fillStyle = '#d16ba5'; ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.fillText('浅红保持 30 s', cx + 100, H * 0.22);
  }
}

function species(i) {
  if (i < 5) return {
    title: '器皿操作中的溶液',
    items: [
      { label: 'H⁺', n: 22, color: '#e05a4f' },
      { label: 'OH⁻', n: 22, color: '#2fb3a3' },
      { label: 'H₂O', n: 16, color: '#d6e0e7' },
    ],
    note: '微观图强调溶液被定量转移与混合',
  };
  return {
    title: '终点附近的粒子',
    items: [
      { label: 'H⁺', n: i >= 6 ? 2 : 8, color: '#e05a4f' },
      { label: 'OH⁻', n: i >= 6 ? 2 : 8, color: '#2fb3a3' },
      { label: 'In⁻', n: i >= 6 ? 5 : 1, color: '#d16ba5', phase: 'solid' },
      { label: 'H₂O', n: 24, color: '#d6e0e7' },
    ],
    note: i >= 6 ? '微量指示剂颜色保持，表示达到操作终点' : '接近终点要放慢滴定并冲洗瓶壁',
  };
}

function readings(i, r) {
  if (i < 6) return [
    { k: '第 1 次读数', v: r.measured[0].toFixed(2), unit: ' mL' },
    { k: '第 2 次读数', v: r.measured[1].toFixed(2), unit: ' mL' },
    { k: '第 3 次读数', v: r.measured[2].toFixed(2), unit: ' mL' },
  ];
  return [
    { k: '报告平均体积', v: r.reportedAverage.toFixed(2), unit: ' mL' },
    { k: '全距', v: r.repeatability.range.toFixed(2), unit: ' mL', tone: r.repeatability.acceptable ? 'good' : 'warn' },
    { k: 'V̄(HCl)/V̄(NaOH)', v: r.ratio.toFixed(4), tone: Math.abs(r.ratio - 0.9976) < 0.0002 ? 'good' : 'warn' },
  ];
}

function observation(i, r) {
  if (i === 7) return `报告平均 NaOH 体积 ${r.reportedAverage.toFixed(2)} mL；比值按表内数据重算为 ${r.ratio.toFixed(4)}。`;
  if (i === 6) return `终点读数集中在 ${r.reportedAverage.toFixed(2)} mL，全距 ${r.repeatability.range.toFixed(2)} mL。`;
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.pipetteRinse !== 0) out.push('移液管未用待吸液润洗：残留水会稀释待测液，结果发生系统偏差。');
  if (ops.buretteRinse !== 0) out.push('滴定管未用标准液润洗：标准液被残留水稀释，消耗体积偏大。');
  if (ops.bubblesPurged !== 0) out.push('旋塞下有气泡：读数差包含填充气泡的体积，重复性变差。');
  if (ops.eyeLevel !== 0) out.push('视线未与弯液面同高：产生视差，读数有系统偏差。');
  if (ops.wallWashed !== 0) out.push('终点前未冲洗瓶壁：附着液滴未进入反应体系，终点判断偏早。');
  if (ops.endpointHoldS < 30) out.push(`终点只保持 ${ops.endpointHoldS} s，未达到课件要求的 30 s。`);
  if (r.repeatability.range > 0.04) out.push(`平行测定全距 ${r.repeatability.range.toFixed(2)} mL > 0.04 mL，应重做。`);
  if (!out.length) out.push('润洗、排泡、视线、冲洗瓶壁和终点保持均符合规范。');
  return out;
}

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species, observation, verdict,
    equation: 'H₃O⁺ + OH⁻ → 2H₂O',
    calculation: (i, r) => i === 7
      ? `V̄(NaOH)=${r.reportedAverage.toFixed(2)} mL；V̄(HCl)/V̄(NaOH)=${r.ratio.toFixed(4)}`
      : STEPS[i].calc,
    readings, modelNote: '说明：0.1000 mol·L⁻¹ 强酸强碱理论等当体积为 25.00 mL；操作错误通过方向性读数模型体现，最终应以规范平行测定为准。',
  });
}

/**
 * 供自检页（`_scenes-all.html` / `_scenes-test.html`）读取的最小场景描述。
 * 有了它，自检页就不必**手抄**步骤名——sim 里改一步，自检页跟着变。
 * 引用的全是模块级标识符，不会与 mount 里那份漂移。
 */
export const sceneSpec = { id: meta.id, name: meta.name, steps: STEPS, guide: GUIDE, model, draw };
