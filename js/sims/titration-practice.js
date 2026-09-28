/**
 * 实验三十一：滴定分析基本操作练习。
 *
 * 重点不是新增理论，而是把润洗、排气泡、视线、半滴和终点保持
 * 与最终读数的关系连起来。课件范例中的比值按表内数据重算为 0.9976。
 */
import { titrationOperation } from '../chem.js';
import { h } from './common.js';
import { mountLab } from './lab-shell.js';
import {
  burette, conicalFlask, pipette, volumetricFlask, balance,
  testTube, tubing, CLEAR_COLOR,
  drawBench,
} from '../glassware.js';

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
  if (i === 1 || i === 2) {
    pipette(ctx, { x: cx - 18, y: H * 0.15, w: 230, h: 35 }, { angle: Math.PI / 2 });
    conicalFlask(ctx, { x: cx + 30, y: B - 155, w: 100, h: 155 }, { liquid: [225, 232, 238, 0.24], level: 0.25 });
    return;
  }
  const buretteBox = { x: cx - 35, y: H * 0.04, w: 58, h: H * 0.42 };
  burette(ctx, buretteBox, {
    level: i >= 6 ? 0.46 : 0.18, liquid: [110, 200, 190, 0.42],
  });
  const flask = { x: cx - 20, y: B - 140, w: 110, h: 140 };
  conicalFlask(ctx, flask, { liquid: i >= 6 ? [214, 102, 160, 0.38] : CLEAR_COLOR, level: 0.30 });
  ctx.strokeStyle = 'rgba(110,200,190,0.78)';
  ctx.lineWidth = 2;
  const mouthX = flask.x + flask.w / 2;
  ctx.beginPath();
  ctx.moveTo(mouthX, buretteBox.y + buretteBox.h);
  ctx.lineTo(mouthX, flask.y + 8);
  ctx.stroke();
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
