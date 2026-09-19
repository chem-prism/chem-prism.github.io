/**
 * 模拟器：硫酸亚铁铵的制备（实验四十）
 *
 * 这是工作台上第一个「过程型」模拟器——前面 18 个都是参数型（调滑块看曲线），
 * 这一个还原的是一整条实验操作链：
 *
 *   称铁粉 → 加酸 → 加热溶解 → 趁热过滤 → 加硫酸铵
 *          → 水浴蒸发 → 冷却结晶 → 减压抽滤 → 醇洗 → 晾干 → 称重 → 目视比色
 *
 * 两种模式共用同一套物料衡算（chem.js 的 mohrPrep），只是交互外壳不同：
 *   教学模式（guide）   —— 逐步走一遍规范操作，每步讲清「为什么这么做」
 *   练习模式（practice）—— 每一项操作都由学生自己定，错了就真的出不来产量/纯度
 *
 * 三层表征照旧贯穿：
 *   宏观层 = 装置图里看得见的现象（冒泡、蓝绿色、晶体、红色深浅）
 *   微观层 = 粒子视图（Fe²⁺/H⁺/SO₄²⁻/H₂，以及结晶时的晶核）
 *   符号层 = 反应式、物料衡算，以及蒸发结晶那两步的溶解度曲线
 *
 * 数据来源与模型说明见 js/chem.js 的「制备实验：硫酸亚铁铵」一节。
 */

import { mohrPrep, solubilityAt, thiocyanateColor, FE3_GRADES } from '../chem.js';
import { Chart } from '../chart.js';
import { ParticleField } from '../views.js';
import { h, panel, readouts, finding } from './common.js';
import {
  Scene, fitAspect,
  conicalFlask, cylinder, funnel, evapDish, waterBath,
  buchner, suctionFlask, watchGlass, comparisonTube,
  hotplate, balance, stirringRod,
  bubbles, crystals, steam,
  ferrousSolutionColor, MOHR_CRYSTAL_COLOR, IRON_POWDER_COLOR, CLEAR_COLOR,
} from '../glassware.js';

export const meta = {
  id: 'mohr-salt',
  name: '硫酸亚铁铵的制备',
  wave: '实验四十',
  accent: '--w-green',
  desc: '从铁粉到摩尔盐要经过十二步。每一步都做得对，也只是「产量高、杂质少」而已——错一步，就看得见代价。',
};

/* ============================================================
 * 规范操作流程（教学模式）
 * ============================================================ */

const STEPS = [
  {
    name: '称取铁粉',
    op: '台秤称取 2 g 纯铁粉，置于锥形瓶中。',
    why: '本实验用纯铁粉，无需净化。铁粉与硫酸铵谁是限制试剂，称量误差会直接进产率。',
    macro: '灰黑色铁粉沉在瓶底。',
    micro: 'Fe 原子以金属键紧密堆积成晶体，表面被空气氧化层覆盖。',
    eq: 'm(Fe) = 2.00 g',
    calc: 'n(Fe) = 2.00 / 55.845 = 0.0358 mol',
  },
  {
    name: '加入硫酸',
    op: '量取 15 mL 3 mol·L⁻¹ H₂SO₄，加入锥形瓶。',
    why: '硫酸要过量：一是保证铁粉溶完，二是让溶液保持较强酸性，抑制 Fe²⁺ 水解与氧化。',
    macro: '酸液无色，铁粉仍沉在底部——常温下几乎不反应。',
    micro: 'H⁺ 与 SO₄²⁻ 进入溶液，包围铁粉表面。',
    eq: 'Fe + H₂SO₄ = FeSO₄ + H₂↑',
    calc: 'n(H₂SO₄) = 0.015 × 3 = 0.0450 mol ＞ n(Fe) = 0.0358 mol，酸过量 0.0092 mol',
  },
  {
    name: '加热溶解',
    op: '锥形瓶置于电热板，设约 150 ℃ 加热至反应完全，不断摇动，必要时补热水热酸。',
    why: '常温下反应很慢，必须加热。但加热时间不能长——Fe²⁺ 在热酸性溶液中会被空气氧化成 Fe³⁺，而 Fe³⁺ 不进产物。溶液要维持在 15 mL 左右：水太少 FeSO₄ 会析出，水太多则酸性不够。',
    macro: '剧烈冒气泡，铁粉逐渐消失，溶液转为蓝绿色。',
    micro: '铁表面给出电子：Fe − 2e⁻ → Fe²⁺；H⁺ 得到电子成 H₂ 逸出。',
    eq: 'Fe + 2H⁺ = Fe²⁺ + H₂↑',
    calc: 'n(H₂) = n(Fe) = 0.0358 mol，标况约 0.80 L',
  },
  {
    name: '趁热过滤',
    op: '加水至总体积约 25 mL，趁热用短颈漏斗常压过滤（减压更快）。',
    why: '「趁热」不是讲究，是必需的。FeSO₄·7H₂O 的溶解度随温度骤降——50 ℃ 时 48.6 g/100 g 水，20 ℃ 只剩 26.5。滤液一冷，FeSO₄·7H₂O 就结晶在滤纸上，随残渣一起被扔掉。',
    macro: '蓝绿色热滤液穿过纸，滤纸上截住少量不溶物。',
    micro: '高温下 Fe²⁺ 与 SO₄²⁻ 全部留在液相；一旦降温就开始成核析出。',
    eq: 'FeSO₄(aq) —过滤→ 除去不溶物',
    calc: '把「过滤温度」拉到室温试试，产率会掉一半以上',
    focus: 'Tfilter',
  },
  {
    name: '加入硫酸铵',
    op: '往滤液中加入 4.5 g (NH₄)₂SO₄，加热搅拌至完全溶解。',
    why: '复盐的溶解度比它的每一个组分都小，所以 FeSO₄ 与 (NH₄)₂SO₄ 的混合液里会析出 FeSO₄·(NH₄)₂SO₄·6H₂O。4.5 g 决定了理论产量的上限。',
    macro: '白色晶体溶解，溶液仍是蓝绿色。',
    micro: 'NH₄⁺ 与 SO₄²⁻ 进入溶液，与 Fe²⁺ 混在一起。',
    eq: 'FeSO₄ + (NH₄)₂SO₄ + 6H₂O = FeSO₄·(NH₄)₂SO₄·6H₂O',
    calc: 'n((NH₄)₂SO₄) = 4.5 / 132.14 = 0.0341 mol（限制试剂）',
    focus: 'mAS',
  },
  {
    name: '水浴蒸发',
    op: '混合液转入蒸发皿，水浴加热蒸发至出现固体薄膜。',
    why: '用水浴而不是直火：受热均匀、温度不超过 100 ℃，既避免暴沸溅失，也减少 Fe²⁺ 氧化。蒸到出现薄膜就该停——再烧下去会暴沸。',
    macro: '液面逐渐下降，皿壁开始出现一层固体薄膜。',
    micro: '水分子逸出液面，离子越来越挤，直至达到饱和。',
    eq: 'H₂O(l) → H₂O(g)',
    calc: '蒸发终点由「剩余水体积」决定，见溶解度曲线',
    chart: true,
  },
  {
    name: '冷却结晶',
    op: '停止加热，静置自然冷却至室温。',
    why: '莫尔盐的溶解度随温度下降得很快（40 ℃ 33.0 → 20 ℃ 21.6 g/100 g 水）。结晶这一步才是产率的主要来源，冷却不充分，产物就留在母液里。',
    macro: '大量浅蓝绿色晶体从溶液中析出。',
    micro: '离子在晶核上按单斜晶格规则排列，晶体逐渐长大。',
    eq: 'Fe²⁺ + 2NH₄⁺ + 2SO₄²⁻ + 6H₂O → 晶体',
    calc: '留在母液的量 = 溶解度 × 剩余水体积',
    chart: true,
  },
  {
    name: '减压抽滤',
    op: '用布氏漏斗减压抽滤，尽量抽干。',
    why: '减压比常压过滤快得多，能缩短母液与晶体的接触时间。母液里还溶着没结晶出来的产物——抽干就是把它分离掉。',
    macro: '母液被抽走，漏斗里留下浅蓝绿色滤饼。',
    micro: '母液中的 Fe²⁺、NH₄⁺、SO₄²⁻ 随液相离开。',
    eq: '固液分离',
    calc: '母液带走的产物，在读数里单独列出',
  },
  {
    name: '乙醇洗涤',
    op: '用少量乙醇洗涤晶体两次。',
    why: '莫尔盐难溶于乙醇。用乙醇洗，既冲掉表面的母液和杂质，又几乎不溶解产物；换成水洗，洗一次就亏一次。乙醇还易挥发，便于下一步晾干。',
    macro: '晶体颜色更干净明亮。',
    micro: '乙醇带走晶体表面的母液膜。',
    eq: '（物理洗涤，无化学反应）',
    calc: '每洗一次约损失 2%——洗得越多越干净，但产量越低',
  },
  {
    name: '晾干',
    op: '把晶体转移到表面皿上，自然晾干。',
    why: '不能加热烘干。莫尔盐含六个结晶水，受热会失水并氧化，产品就废了。',
    macro: '残余乙醇挥发，晶体表面变得干爽。',
    micro: '乙醇分子逸出，晶体表面不再有液膜。',
    eq: '（物理过程）',
    calc: '—',
  },
  {
    name: '称重',
    op: '台秤称重，记录数据。',
    why: '这一称就是实际产量。和理论产量一比，产率就出来了——产率低说明前面的某一步做亏了。',
    macro: '得到浅蓝绿色单斜晶体。',
    micro: '晶体内部是规则排列的复盐晶格。',
    eq: '产率 = 实际产量 / 理论产量 × 100%',
    calc: '理论产量由限制试剂 (NH₄)₂SO₄ 决定',
  },
  {
    name: '目视比色定级',
    op: '称 1.0 g 产品，加 15 mL 无氧去离子水溶解，再加 1.00 mL 6 mol·L⁻¹ HCl 与 1.00 mL 1 mol·L⁻¹ KSCN，定容摇匀，与标准色阶比色。',
    why: '产量和纯度是两回事。晶体看起来一样，Fe³⁺ 含量却可能差一个级别。加 HCl 是为了抑制 Fe³⁺ 水解，保证颜色只反映 Fe³⁺ 的浓度。',
    macro: '溶液呈血红色，颜色越深 Fe³⁺ 越多。',
    micro: 'Fe³⁺ 与 SCN⁻ 生成血红色配合物 [Fe(SCN)ₙ]³⁻ⁿ。',
    eq: 'Fe³⁺ + nSCN⁻ = [Fe(SCN)ₙ]³⁻ⁿ',
    calc: '色阶：Ⅰ 0.050 mg ｜ Ⅱ 0.10 mg ｜ Ⅲ 0.20 mg（每 1.0 g 产品）',
    compare: true,
  },
];

/* ============================================================
 * 练习模式：每一项都由学生自己定
 * ============================================================ */

const OPS = [
  { key: 'mFe', label: '称取铁粉', unit: 'g', min: 1, max: 4, step: 0.1, good: [1.8, 2.2], ref: '教材用量 2 g' },
  { key: 'vAcid', label: '量取 3 mol/L 硫酸', unit: 'mL', min: 5, max: 30, step: 0.5, good: [13, 17], ref: '教材用量 15 mL' },
  { key: 'Tboil', label: '加热时溶液温度', unit: '℃', min: 60, max: 160, step: 5, good: [90, 105], ref: '保持近沸即可（电热板设约 150 ℃ 只是为了让溶液维持在约 100 ℃）' },
  { key: 'boilMinutes', label: '加热时长', unit: 'min', min: 2, max: 60, step: 1, good: [4, 16], ref: '反应完全即止，约 5–15 min' },
  { key: 'exposed', label: '加热时敞口程度', unit: '', min: 0, max: 1, step: 0.25, good: [0, 1], ref: '敞口或加盖表面皿都可以，敞口氧化些' },
  { key: 'Tfilter', label: '过滤时溶液温度', unit: '℃', min: 20, max: 95, step: 1, good: [70, 95], ref: '必须趁热，越高越好' },
  { key: 'vWaterFilter', label: '过滤时溶液体积', unit: 'mL', min: 10, max: 60, step: 1, good: [20, 30], ref: '加水至约 25 mL' },
  { key: 'mAS', label: '加入硫酸铵', unit: 'g', min: 2, max: 8, step: 0.1, good: [4.2, 4.8], ref: '教材用量 4.5 g' },
  { key: 'vWaterEnd', label: '蒸发至剩余水', unit: 'mL', min: 2, max: 30, step: 0.5, good: [7, 15], ref: '蒸至出现固体薄膜，别烧干' },
  { key: 'Tcool', label: '结晶终了温度', unit: '℃', min: 0, max: 40, step: 1, good: [0, 25], ref: '自然冷却到室温或更低' },
  { key: 'washes', label: '乙醇洗涤次数', unit: '次', min: 0, max: 4, step: 1, good: [2, 3], ref: '两次即可，多了亏产量' },
];

/**
 * 教学模式用这一套「规范做法」——全流程都用它，读数才不会在步骤间跳来跳去。
 * 数值即教材用量 + 规范操作。
 */
const GUIDE_OPS = {
  mFe: 2, vAcid: 15, Tboil: 100, boilMinutes: 10, exposed: 1,
  Tfilter: 90, vWaterFilter: 15, mAS: 4.5,
  vWaterEnd: 10, Tcool: 20, washes: 2,
};

/**
 * 练习模式的初值故意留了几处不规范（过滤不趁热、加热偏久、蒸发略欠），
 * 学生一上来直接运行就会得到一个偏低的产量，然后得自己找出问题在哪。
 */
const DEFAULT_OPS = {
  mFe: 2, vAcid: 15, Tboil: 115, boilMinutes: 18, exposed: 1,
  Tfilter: 35, vWaterFilter: 25, mAS: 4.5,
  vWaterEnd: 16, Tcool: 20, washes: 2,
};

/** 练习模式的符号层：整条制备路线的两个反应，而不是某一步的 */
const PRACTICE_SIGN = {
  eq: 'Fe + H₂SO₄ = FeSO₄ + H₂↑　｜　FeSO₄ + (NH₄)₂SO₄ + 6H₂O = FeSO₄·(NH₄)₂SO₄·6H₂O',
  calc: '理论产量 = n(限制试剂) × M(莫尔盐)，M(FeSO₄·(NH₄)₂SO₄·6H₂O) = 392.14 g/mol',
};

/* ============================================================
 * 挂载
 * ============================================================ */

export function mount(root, params = {}) {
  const state = {
    mode: params.mode === 'practice' ? 'practice' : 'guide',
    step: Math.min(STEPS.length - 1, Math.max(0, +(params.step ?? 0))),
    ops: { ...DEFAULT_OPS, ...readOps(params) },
    // run=1 可以直接落到「已运行」状态。除了自测，也让智能体能派发这类任务：
    // 「把过滤温度改成 30 ℃ 再跑一遍，看看产率掉到多少」
    ran: params.run === '1',
  };

  const scene = new Scene(h('canvas'));
  const pcv = h('canvas');
  const particles = new ParticleField(pcv);

  const stepHost = h('div');
  const sceneWrap = h('div', { class: 'bench-cell' },
    h('div', { class: 'bench-tag' }, '宏观层 ', h('b', {}, '实验台')),
    scene.cv);
  const microWrap = h('div', { class: 'bench-cell' },
    h('div', { class: 'bench-tag' }, '微观层 ', h('b', {}, '溶液中的粒子')),
    pcv);

  const cw = h('div', { class: 'chart-wrap', style: 'height:230px' });
  const cvCh = h('canvas'); cw.append(cvCh);
  const signHost = h('div');
  const roHost = h('div');
  const findHost = h('div');

  const btnPrev = h('button', { class: 'btn', onclick: () => go(state.step - 1) }, '← 上一步');
  const btnNext = h('button', { class: 'btn primary', onclick: () => go(state.step + 1) }, '下一步 →');

  root.append(
    panel('模式', buildModeBar()),
    stepHost,
    panel('实验台', h('div', { class: 'bench bench-wide' }, sceneWrap, microWrap)),
    panel('符号层', signHost),
    panel('结果读数', roHost),
    findHost,
  );

  /* ---------- 模式切换 ---------- */
  function buildModeBar() {
    const mk = (id, name, note) => h('button', {
      class: 'mode-tab' + (state.mode === id ? ' on' : ''),
      onclick: () => { state.mode = id; state.ran = false; rebuild(); },
    }, h('b', {}, name), h('small', {}, note));

    return h('div', { class: 'mode-bar' },
      mk('guide', '教学模式', '跟着走一遍规范操作，每步讲清为什么'),
      mk('practice', '练习模式', '每一项自己定，做错就真的出不来产量'));
  }

  /* ---------- 教学模式：步骤条 ---------- */
  function buildStepBar() {
    const chips = STEPS.map((s, i) => h('button', {
      class: 'step-chip' + (i === state.step ? ' on' : '') + (i < state.step ? ' done' : ''),
      onclick: () => go(i),
      title: s.name,
    }, String(i + 1)));

    return h('div', {},
      h('div', { class: 'step-bar' }, ...chips),
      h('div', { class: 'step-head' },
        h('span', { class: 'step-idx' }, `第 ${state.step + 1} / ${STEPS.length} 步`),
        h('b', {}, STEPS[state.step].name)),
      h('div', { class: 'step-op' }, STEPS[state.step].op),
      h('div', { class: 'step-why' }, h('span', { class: 'step-why-tag' }, '为什么'), STEPS[state.step].why),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        btnPrev, btnNext,
        h('button', { class: 'btn', onclick: () => go(0) }, '回到第一步')),
    );
  }

  /* ---------- 练习模式：操作表 ---------- */
  function buildPracticeBar() {
    const rows = OPS.map(o => {
      const val = h('span', { class: 'ctl-val' });
      const fmt = v => (o.unit === '' ? v.toFixed(2) : `${v}${o.unit}`);
      val.textContent = fmt(state.ops[o.key]);
      const input = h('input', {
        type: 'range', min: o.min, max: o.max, step: o.step, value: state.ops[o.key],
        oninput: e => {
          state.ops[o.key] = parseFloat(e.target.value);
          val.textContent = fmt(state.ops[o.key]);
          state.ran = false;
          refresh();
        },
      });
      return h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' },
          h('span', { class: 'ctl-name', html: `${o.label} <em>${o.ref}</em>` }), val),
        input);
    });

    const btnRun = h('button', {
      class: 'btn primary',
      onclick: () => { state.ran = true; refresh(); },
    }, state.ran ? '重新运行' : '运行实验');

    return h('div', {},
      h('div', { class: 'step-head' },
        h('b', {}, '自己定每一项操作'),
        h('span', { class: 'step-idx' }, '按你的判断填，然后运行')),
      h('div', { class: 'controls', style: 'margin-top:12px' }, ...rows),
      h('div', { class: 'btn-row', style: 'margin-top:14px' },
        btnRun,
        h('button', { class: 'btn', onclick: () => { state.ops = { ...DEFAULT_OPS }; state.ran = false; rebuild(); } }, '恢复初始设置')));
  }

  /* ---------- 导航 ---------- */
  function go(i) {
    state.step = Math.min(STEPS.length - 1, Math.max(0, i));
    state.mode = 'guide';
    rebuild();
  }

  function rebuild() {
    stepHost.replaceChildren(
      panel(state.mode === 'guide' ? '操作流程' : '操作台',
        state.mode === 'guide' ? buildStepBar() : buildPracticeBar()));
    refresh();
  }

  /* ---------- 取当前这一步的模型 ---------- */
  /** 当前在起作用的那一套操作参数 */
  const activeOps = () => (state.mode === 'practice' ? state.ops : GUIDE_OPS);

  function model() {
    // 教学模式始终走同一套规范参数：读数稳定，代表「把流程做对能得到什么」。
    // 练习模式才用学生自己定的一套。
    return mohrPrep(activeOps());
  }

  /* ============================================================
   * 渲染
   * ============================================================ */
  function refresh() {
    const r = model();
    const step = state.mode === 'guide' ? STEPS[state.step] : PRACTICE_SIGN;

    /* —— 宏观层：装置图 —— */
    const sceneKey = state.mode === 'practice'
      ? (state.ran ? 'result' : 'bench')
      : ['weigh', 'pour', 'boil', 'filter', 'addAS', 'evap', 'cool', 'suction', 'wash', 'dry', 'weigh2', 'compare'][state.step];
    scene.set((ctx, W, H, t) => drawScene(ctx, W, H, t, sceneKey, r));

    /* —— 微观层：粒子 —— */
    particles.set(speciesFor(state, r), '粒子数只表示相对多少');
    requestAnimationFrame(() => particles.start());

    /* —— 符号层 —— */
    const showChart = state.mode === 'guide' ? !!step.chart : state.ran;
    if (showChart) {
      cw.style.display = '';
      drawSolubilityChart(cvCh);
      signHost.replaceChildren(
        cw,
        h('div', { class: 'eq-line', html: step.eq ? eqHtml(step.eq) : '' }),
        h('div', { class: 'calc-line' }, step.calc || ''));
    } else {
      cw.style.display = 'none';
      signHost.replaceChildren(
        h('div', { class: 'eq-line', html: step.eq ? eqHtml(step.eq) : '' }),
        h('div', { class: 'calc-line' }, step.calc || ''));
    }

    /* —— 读数 ——
     * 练习模式必须先运行才给读数。否则一边拖滑块一边看产量，
     * 就变成了「照着读数调参」，而不是「自己判断该怎么操作」。 */
    if (state.mode === 'practice' && !state.ran) {
      roHost.replaceChildren(h('div', { class: 'idle-note' },
        '读数会在运行后出现——先自己判断每一项该怎么定。'));
    } else {
      roHost.replaceChildren(readouts([
      { k: '理论产量', v: r.mTheo.toFixed(2), unit: 'g' },
      { k: '实际产量', v: r.mYield.toFixed(2), unit: 'g', tone: r.yieldFrac > 0.6 ? 'good' : r.yieldFrac > 0.35 ? 'warn' : 'bad' },
      { k: '产率', v: (r.yieldFrac * 100).toFixed(1), unit: '%', tone: r.yieldFrac > 0.6 ? 'good' : r.yieldFrac > 0.35 ? 'warn' : 'bad' },
      { k: '产品中 Fe³⁺', v: r.mgFe3.toFixed(3), unit: 'mg/g', tone: r.grade === 'Ⅰ' ? 'good' : r.grade === '不合格' ? 'bad' : 'warn' },
      { k: '试剂级别', v: r.grade, tone: r.grade === 'Ⅰ' ? 'good' : r.grade === '不合格' ? 'bad' : 'warn' },
        { k: '限制试剂', v: r.limiting },
      ]));
    }

    /* —— 结论 / 复盘 —— */
    findHost.replaceChildren(finding(
      state.mode === 'practice'
        ? (state.ran ? practiceVerdict(r) : '定好每一项操作，点「运行实验」。运行后会逐项告诉你哪一步做亏了。')
        : stepVerdict(state.step, r)));
  }

  /* ---------- 结论文案 ---------- */
  function stepVerdict(i, r) {
    switch (STEPS[i].name) {
      case '趁热过滤': {
        const cold = mohrPrep({ ...GUIDE_OPS, Tfilter: 25 });
        return `把过滤温度从 90 ℃ 降到 25 ℃，实际产量从 <b>${r.mYield.toFixed(1)} g</b> 掉到 <b>${cold.mYield.toFixed(1)} g</b>，` +
          `产率从 ${(r.yieldFrac * 100).toFixed(0)}% 掉到 ${(cold.yieldFrac * 100).toFixed(0)}%。` +
          `损失不是因为操作失误，是 <b>FeSO₄·7H₂O 的溶解度随温度下降</b>——结晶在滤纸上，随残渣一起被倒掉了。`;
      }
      case '加入硫酸铵':
        return `硫酸铵是<b>限制试剂</b>：n((NH₄)₂SO₄) = 0.0341 mol ＜ n(Fe) = 0.0358 mol。` +
          `所以理论产量由它决定，是 <b>${r.mTheo.toFixed(2)} g</b>——铁粉多加也不会多出产品。`;
      case '冷却结晶':
        return `结晶终了温度定在 ${activeOps().Tcool} ℃ 时，莫尔盐溶解度是 <b>${r.solubilityAtCool.toFixed(1)} g/100 g 水</b>，` +
          `母液里还溶着 <b>${r.motherLiquor.toFixed(2)} g</b> 没析出来。这就是「冷却要彻底」的原因。`;
      case '水浴蒸发':
        return `看下面这条曲线：莫尔盐的溶解度随温度<b>陡升</b>，而它的两个组分都比它大得多——` +
          `这正是复盐能析出来的原因。蒸发的任务是先把水赶走，让溶液在热态下达到饱和。`;
      case '乙醇洗涤':
        return `洗 ${activeOps().washes} 次约损失 ${(activeOps().washes * 2).toFixed(0)}%。次数是权衡：` +
          `洗得少，母液里的杂质留在晶体表面；洗得多，产物跟着走。乙醇之所以合适，是因为莫尔盐<b>难溶于乙醇</b>。`;
      case '目视比色定级':
        return `按规范操作，Fe³⁺ 约 <b>${r.mgFe3.toFixed(3)} mg/g</b>，落在 ${r.grade} 级。` +
          `注意一个反直觉的地方：只要 <b>0.035%</b> 的 Fe²⁺ 被氧化，产品就掉出Ⅰ级——` +
          `所以「加热别太久」不是保守，是硬要求。`;
      default:
        return `${STEPS[i].op} 点「下一步」继续。`;
    }
  }

  function practiceVerdict(r) {
    const bad = [];
    for (const o of OPS) {
      const v = state.ops[o.key];
      if (v < o.good[0] || v > o.good[1]) bad.push({ o, v });
    }
    const head = `实际产量 <b>${r.mYield.toFixed(2)} g</b>，产率 <b>${(r.yieldFrac * 100).toFixed(1)}%</b>，` +
      `Fe³⁺ <b>${r.mgFe3.toFixed(3)} mg/g</b>（${r.grade} 级）。`;
    if (!bad.length) {
      return `${head}<br>每一项操作都落在规范范围内。<b>产量与纯度都达标</b>——这就是把流程做对的样子。`;
    }
    const items = bad.map(({ o, v }) =>
      `<li><b>${o.label}</b> 设成了 ${o.unit === '' ? v.toFixed(2) : v + o.unit}，` +
      `规范是 ${o.good[0]}–${o.good[1]}${o.unit}（${o.ref}）</li>`).join('');
    return `${head}<br>有 ${bad.length} 项偏离了规范，逐项看：<ul class="review-list">${items}</ul>`;
  }

  /* ---------- 微观粒子 ---------- */
  function speciesFor(st, r) {
    const s = st.mode === 'guide' ? st.step : 5;
    const ox = r.oxidizedFrac;
    const out = [];
    const push = (label, n, color) => { if (n > 0) out.push({ label, n: Math.max(1, Math.round(n)), color }); };

    // 粒子数只表示相对多少：以 40 个为满量程
    const K = 40 / 0.05;
    if (s <= 0) {
      push('Fe', 0.0358 * K, '#8b939c');
      return out;
    }
    if (s === 1) {
      push('Fe', 0.0358 * K, '#8b939c');
      push('H⁺', 0.09 * K, '#e05a4f');
      push('SO₄²⁻', 0.045 * K, '#5c82d6');
      return out;
    }
    if (s === 2) {
      push('H₂↑', 0.0358 * K, '#c9d6e0');
      push('Fe²⁺', 0.0358 * K, '#2fb3a3');
      push('SO₄²⁻', 0.045 * K, '#5c82d6');
      push('H⁺', 0.0092 * K, '#e05a4f');
      return out;
    }
    if (s >= 3 && s <= 4) {
      push('Fe²⁺', 0.0358 * K, '#2fb3a3');
      push('NH₄⁺', s >= 4 ? 0.0682 * K : 0, '#e8a33d');
      push('SO₄²⁻', (s >= 4 ? 0.079 : 0.045) * K, '#5c82d6');
      return out;
    }
    if (s >= 5 && s <= 9) {
      // 结晶之后大部分 Fe²⁺ 已进晶格，液相里只剩母液溶得下的那点
      const inLiquid = Math.min(0.25, r.motherLiquor / Math.max(r.mProduct, 1e-6));
      push('Fe²⁺', 0.0341 * K * inLiquid, '#2fb3a3');
      push('Fe³⁺', Math.max(ox > 0 ? 1 : 0, ox * 0.0341 * K * 6), '#c8842a');
      push('NH₄⁺', 0.0682 * K, '#e8a33d');
      // SO₄²⁻ 是旁观离子，数量与 NH₄⁺ 同步增减，画出来只是让图例挤成一团
      return out;
    }
    // 称重 / 比色
    push('Fe²⁺', 34 * (1 - ox), '#2fb3a3');
    push('Fe³⁺', Math.max(ox > 0 ? 1 : 0, 34 * ox * 6), '#c8842a');
    push('NH₄⁺', 34, '#e8a33d');
    return out;
  }

  /* ---------- 溶解度曲线（符号层） ---------- */
  function drawSolubilityChart(canvas) {
    const chart = canvas._chart || (canvas._chart = new Chart(canvas, {
      xLabel: '温度 / ℃', yLabel: '溶解度 / (g · 100 g⁻¹ 水)',
      xRange: [0, 60], yRange: [0, 90],
      pad: { l: 46, r: 16, t: 14, b: 34 },
    }));
    const pts = key => {
      const out = [];
      for (let T = 0; T <= 60; T += 2) out.push({ x: T, y: solubilityAt(key, T) });
      return out;
    };
    chart.setMarkers([
      { x: activeOps().Tcool, color: 'var(--w-teal)', label: '结晶终了', dash: [5, 3] },
    ]);
    chart.setSeries([
      { name: '(NH₄)₂SO₄', points: pts('as'), color: 'var(--w-indigo)', width: 1.6 },
      { name: 'FeSO₄·7H₂O', points: pts('feso4'), color: 'var(--w-amber)', width: 1.6 },
      { name: '莫尔盐', points: pts('mohr'), color: 'var(--w-green)', width: 2.4, glow: true, yFormat: v => v.toFixed(1) },
    ]);
    chart.draw();
  }

  /* ============================================================
   * 装置图
   * ============================================================ */
  function drawScene(ctx, W, H, t, key, r) {
    const cx = W / 2;
    const cy = H / 2;
    const ox = r.oxidizedFrac;
    const solColor = ferrousSolutionColor(r.mgFe3);

    /*
     * 台面线。所有「放在台面上」的器皿都以它为底——
     * 之前每处各自写 H*0.xx，结果有的浮空、有的陷进加热台里。
     */
    const BENCH = H * 0.88;
    ctx.save();
    ctx.strokeStyle = 'rgba(160,180,196,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.06, BENCH);
    ctx.lineTo(W * 0.94, BENCH);
    ctx.stroke();
    ctx.restore();

    /** 底边落在 y 上、给定宽度与高度的器皿框 */
    const onBench = (w, hh, bottom = BENCH) => ({ x: cx - w / 2, y: bottom - hh, w, h: hh });

    if (key === 'weigh' || key === 'weigh2') {
      const bh = H * 0.50;
      const box = { x: cx - 110, y: BENCH - bh, w: 220, h: bh };
      const panY = box.y + bh * 0.16;                 // 与 balance() 里的秤盘同高
      balance(ctx, box, {
        item: key !== 'weigh2',
        itemColor: IRON_POWDER_COLOR,
        reading: key === 'weigh2' ? r.mYield.toFixed(2) : '2.00',
        tone: key === 'weigh2' ? (r.yieldFrac > 0.6 ? 'good' : 'warn') : '',
      });
      // 产品摊在秤盘上——不是画在天平读数面板上
      if (key === 'weigh2') {
        crystals(ctx, { x: cx - 74, y: panY - 15, w: 148, h: 13 }, t,
          Math.min(1, r.mYield / 13), { color: MOHR_CRYSTAL_COLOR, spin: false });
      }
      return;
    }

    if (key === 'pour') {
      /*
       * 量筒倾斜倒液。倾斜时液面在世界坐标里仍是**水平**的——
       * cylinder 的 tilt 参数会照此填充；否则会画出一个跟着管子歪掉的液面。
       */
      const flask = { x: cx - 20, y: BENCH - H * 0.56, w: 130, h: H * 0.56 };
      conicalFlask(ctx, flask, { liquid: CLEAR_COLOR, level: 0.2 });

      const cylW = 52, cylH = H * 0.40, tilt = 1.45;
      // 局部框的开口在顶边中点；旋转后它的世界位置决定框摆在哪
      const mouthX = cx - 32, mouthY = H * 0.22;
      const offX = (cylH / 2) * Math.sin(tilt);
      const offY = -(cylH / 2) * Math.cos(tilt);
      cylinder(ctx, {
        x: mouthX - offX - cylW / 2, y: mouthY - offY - cylH / 2, w: cylW, h: cylH,
      }, { liquid: CLEAR_COLOR, level: 0.55, tilt });

      // 从壶嘴落入锥形瓶口的液流
      const ex = flask.x + flask.w / 2, ey = flask.y + 5;
      ctx.save();
      ctx.strokeStyle = 'rgba(222,232,240,0.42)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mouthX + 3, mouthY + 2);
      ctx.quadraticCurveTo(mouthX + 26, (mouthY + ey) / 2, ex, ey);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (key === 'boil') {
      const plateH = H * 0.24;
      const plate = { x: cx - 105, y: BENCH - plateH, w: 210, h: plateH };
      hotplate(ctx, plate, { heat: 0.8, steam: 0.35, t });
      // 瓶底**落在**电热板上表面，不陷进去
      const flask = { x: cx - 20, y: plate.y - H * 0.46, w: 130, h: H * 0.46 };
      conicalFlask(ctx, flask, { liquid: solColor, level: 0.42 });
      bubbles(ctx, { x: flask.x + 26, y: flask.y + flask.h * 0.58, w: flask.w - 52, h: flask.h * 0.38 }, t, 0.9);
      return;
    }

    if (key === 'filter') {
      const hot = activeOps().Tfilter >= 70;
      const flask = { x: cx - 60, y: BENCH - H * 0.38, w: 130, h: H * 0.38 };
      conicalFlask(ctx, flask, { liquid: solColor, level: hot ? 0.3 : 0.12 });

      // 漏斗短颈插进瓶口：颈口以下约 4% 画布高
      const flH = H * 0.28;
      const fl = { x: cx - 28, y: flask.y + H * 0.04 - flH, w: 120, h: flH };
      funnel(ctx, fl, {
        liquid: hot ? solColor : ferrousSolutionColor(r.mgFe3 * 0.6),
        level: 0.42,
        paperDirty: !hot,
        stemLevel: 0.8,
      });
      if (hot) steam(ctx, { x: cx - 70, y: fl.y - 50, w: 150, h: 60 }, t, 0.6);
      if (!hot) {
        crystals(ctx, { x: fl.x + 26, y: fl.y + 20, w: fl.w - 52, h: 20 }, t, 0.8,
          { color: MOHR_CRYSTAL_COLOR, spin: false });
        label2(ctx, '冷过滤：FeSO₄·7H₂O 结晶在滤纸上', cx, H * 0.94, 'var(--w-red)');
      }
      return;
    }

    if (key === 'addAS') {
      const flask = { x: cx - 20, y: BENCH - H * 0.56, w: 130, h: H * 0.56 };
      conicalFlask(ctx, flask, { liquid: solColor, level: 0.5 });
      const mouthX = flask.x + flask.w / 2, mouthY = flask.y;

      // 白色固体自瓶口落入液面
      ctx.save();
      ctx.fillStyle = 'rgba(232,238,244,0.9)';
      for (let i = 0; i < 16; i++) {
        const ph = (t * 0.4 + i * 0.11) % 1;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath();
        ctx.arc(mouthX + Math.sin(i * 2.1) * 15, mouthY - 46 + ph * (H * 0.28), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // 玻璃棒插在瓶内搅拌
      stirringRod(ctx, { x: mouthX - 5, y: flask.y + H * 0.10, w: 20, h: H * 0.32 }, { angle: 12 });
      return;
    }

    if (key === 'evap') {
      const bathH = BENCH - H * 0.44;
      const bath = { x: cx - 150, y: H * 0.44, w: 300, h: bathH };
      const wallTop = bath.y + bathH * 0.26;        // 与 waterBath() 内部算法一致
      waterBath(ctx, bath, { steam: 0.7, t, ringW: 190 });

      // 蒸发皿**坐在**套圈上，皿底略嵌进环孔
      const dishH = H * 0.20, nest = H * 0.02;
      const lvl = Math.min(0.9, Math.max(0.10, activeOps().vWaterEnd / 30));
      evapDish(ctx, { x: cx - 95, y: wallTop + nest - dishH, w: 190, h: dishH },
        { liquid: solColor, level: lvl });
      steam(ctx, { x: cx - 80, y: wallTop - H * 0.30, w: 160, h: H * 0.26 }, t, 0.75);
      return;
    }

    if (key === 'cool') {
      const dishH = H * 0.22;
      const dbox = { x: cx - 105, y: BENCH - dishH, w: 210, h: dishH };
      const inner = fitAspect(dbox, 0.28, 'bottom');
      evapDish(ctx, dbox, { liquid: ferrousSolutionColor(r.mgFe3 * 0.4), level: 0.34 });

      // 晶体长在皿内。皿底是弧的，靠边处很浅——不约束就会掉到皿外面
      const dishDepth = u0 => {
        if (u0 <= 0.16 || u0 >= 0.84) return 0.12;
        if (u0 < 0.32) return (u0 - 0.16) / 0.16;
        if (u0 > 0.68) return (0.84 - u0) / 0.16;
        return 1;
      };
      crystals(ctx, {
        x: inner.x + inner.w * 0.10, y: inner.y + inner.h * 0.30,
        w: inner.w * 0.80, h: inner.h * 0.66,
      }, t, Math.min(1, r.crystallized / 12),
      { color: MOHR_CRYSTAL_COLOR, spin: false, depthFn: dishDepth });

      label2(ctx, '静置自然冷却', cx, BENCH + 10, 'var(--faint)');
      return;
    }

    if (key === 'suction' || key === 'wash') {
      const flH = H * 0.38;
      const flask = { x: cx - 72, y: BENCH - flH, w: 144, h: flH };
      suctionFlask(ctx, flask, {
        liquid: key === 'wash' ? [214, 226, 238, 0.16] : ferrousSolutionColor(r.mgFe3 * 0.4),
        level: 0.26,
      });

      // 布氏漏斗的短管插进瓶口
      const bH = H * 0.44;
      buchner(ctx, { x: cx - 65, y: flask.y + H * 0.04 - bH, w: 130, h: bH }, {
        liquid: ferrousSolutionColor(r.mgFe3 * 0.4),
        level: key === 'wash' ? 0.3 : 0.5,
        cake: Math.min(1, r.crystallized / 12),
        cakeColor: MOHR_CRYSTAL_COLOR,
        dropColor: ferrousSolutionColor(r.mgFe3 * 0.4),
        dripping: true,
      });
      if (key === 'wash') {
        label2(ctx, '乙醇洗：莫尔盐难溶于乙醇，洗得掉母液，洗不掉产物', cx, BENCH + 10, 'var(--w-teal)');
      }
      return;
    }

    if (key === 'dry') {
      const wH = H * 0.34;
      watchGlass(ctx, { x: cx - 130, y: BENCH - wH, w: 260, h: wH }, {
        crystal: Math.min(1, r.crystallized / 12),
        crystalColor: MOHR_CRYSTAL_COLOR,
        t,
      });
      steam(ctx, { x: cx - 60, y: BENCH - wH - 46, w: 120, h: 44 }, t, 0.28);
      return;
    }

    if (key === 'compare') {
      // 标准色阶 Ⅰ Ⅱ Ⅲ + 样品，共五支
      const mgs = [0, FE3_GRADES[0].mg, FE3_GRADES[1].mg, FE3_GRADES[2].mg, r.mgFe3];
      const names = ['空白', 'Ⅰ 级', 'Ⅱ 级', 'Ⅲ 级', '样品'];
      const isSample = i => i === 4;

      const tubeW = 48, gap = 24;
      const total = mgs.length * tubeW + (mgs.length + 1) * gap;
      const left = cx - total / 2;

      // 白背板坐在台面上——目视比色必须在白背景下看，
      // 深色底会把浅色溶液衬成灰的，那就不是比色了。
      const cardH = H * 0.66;
      const cardY = BENCH - H * 0.03 - cardH;
      const bx = left + gap * 0.35, bw = total - gap * 0.7;

      ctx.save();
      ctx.fillStyle = 'rgba(244,247,250,0.97)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, cardY, bw, cardH, 6); ctx.fill(); }
      else ctx.fillRect(bx, cardY, bw, cardH);
      ctx.restore();

      // 管身与标注都排在卡片内
      const tubeY = cardY + cardH * 0.13;
      const tubeH = cardH * 0.56;
      const labY = cardY + cardH * 0.76;

      for (let i = 0; i < mgs.length; i++) {
        const x = left + gap + i * (tubeW + gap);
        comparisonTube(ctx, { x, y: tubeY, w: tubeW, h: tubeH },
          { liquid: thiocyanateColor(mgs[i]), level: 0.60 });
        label2(ctx, names[i], x + tubeW / 2, labY,
          isSample(i) ? 'var(--w-green)' : 'var(--faint)');
        label2(ctx, mgs[i] === 0 ? '—' : `${mgs[i].toFixed(3)} mg`, x + tubeW / 2, labY + 15,
          isSample(i) ? 'var(--w-green)' : 'var(--dim)');
      }
      return;
    }

    if (key === 'result' || key === 'bench') {
      // 练习模式的定格画面：抽滤得到的晶体 + 称重
      if (state.ran) {
        const flH = H * 0.38;
        const flask = { x: cx - 78, y: BENCH - flH, w: 156, h: flH };
        suctionFlask(ctx, flask, { liquid: ferrousSolutionColor(r.mgFe3 * 0.4), level: 0.24 });
        const bH = H * 0.44;
        buchner(ctx, { x: cx - 70, y: flask.y + H * 0.04 - bH, w: 140, h: bH }, {
          cake: Math.min(1, r.crystallized / 12), cakeColor: MOHR_CRYSTAL_COLOR,
        });

        const bh = H * 0.44;
        const bbox = { x: cx + 96, y: BENCH - bh, w: 196, h: bh };
        balance(ctx, bbox, {
          reading: r.mYield.toFixed(2), tone: r.yieldFrac > 0.6 ? 'good' : 'warn',
        });
        const panY = bbox.y + bh * 0.16;
        crystals(ctx, { x: cx + 130, y: panY - 14, w: 128, h: 12 }, t,
          Math.min(1, r.mYield / 13), { color: MOHR_CRYSTAL_COLOR, spin: false });
        label2(ctx, '抽滤得到的晶体', cx - 78, BENCH + 10, 'var(--faint)');
        return;
      }
      // 未运行：空实验台
      conicalFlask(ctx, { x: cx - 190, y: BENCH - H * 0.52, w: 118, h: H * 0.52 },
        { liquid: CLEAR_COLOR, level: 0.1 });
      evapDish(ctx, { x: cx - 46, y: BENCH - H * 0.22, w: 150, h: H * 0.22 }, {});
      buchner(ctx, { x: cx + 92, y: BENCH - H * 0.42, w: 112, h: H * 0.42 }, {});
      label2(ctx, '定好每一项操作，然后运行实验', cx, BENCH + 12, 'var(--faint)');
      return;
    }
  }

  function label2(ctx, text, cx, y, color) {
    ctx.save();
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillStyle = color.startsWith('var(')
      ? getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim() || '#7b8c99'
      : color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, cx, y);
    ctx.restore();
  }

  /* ---------- 起手 ---------- */
  rebuild();
  scene.start();

  return {
    stop() { scene.stop(); scene.destroy(); particles.stop(); },
    record() {
      const r = model();
      const a = activeOps();
      return {
        sim: '硫酸亚铁铵的制备',
        params: [
          state.mode === 'guide'
            ? `教学模式 · 第 ${state.step + 1} 步「${STEPS[state.step].name}」`
            : '练习模式 · 自行设定全部操作',
          `铁粉 ${a.mFe} g，3 mol/L H₂SO₄ ${a.vAcid} mL，硫酸铵 ${a.mAS} g`,
        ],
        readings: [
          `理论产量 ${r.mTheo.toFixed(2)} g，实际产量 ${r.mYield.toFixed(2)} g，产率 ${(r.yieldFrac * 100).toFixed(1)}%`,
          `产品中 Fe³⁺ ${r.mgFe3.toFixed(3)} mg/g，判定 ${r.grade} 级`,
        ],
      };
    },
    params() {
      return { mode: state.mode, step: state.step, ...state.ops };
    },
  };
}

/* ---------- 工具 ---------- */
function readOps(params) {
  const out = {};
  for (const o of OPS) if (params[o.key] != null) out[o.key] = +params[o.key];
  return out;
}

function eqHtml(eq) {
  // 下标：把化学式里的数字转成 <sub>，让方程式读起来像方程式
  return String(eq).replace(/([A-Za-z\)\]])(\d+)/g, '$1<sub>$2</sub>')
    .replace(/([⁺⁻²³⁴]+)/g, '<sup>$1</sup>');
}
