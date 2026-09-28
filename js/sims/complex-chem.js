/**
 * 实验 10：配合物的生成与性质（P175-179）。
 *
 * 这不是一条单线流程，而是一张**现象树**：每一步都有一到两个分支
 * （滴到什么程度、加什么试剂、先调酸碱性还是直接加），
 * 用 options 型控件表达分支，各回调按 ops 取对应现象。
 *
 * 全部现象由 chem.js 的常数（K稳 / Ksp / K=Ksp×K稳）推出，可 node 验算；
 * ⚠️ 课件 P9 只有八条内容条目与试剂清单、没有逐步操作细节——
 * 本模拟器的子实验顺序按条目与试剂清单还原，与课上具体做法不同处请反馈调整。
 */
import { h } from './common.js';
import {
  silverHalideDissolution, cuAmmoniaState,
} from '../chem.js';
import { mountLab } from './lab-shell.js';
import {
  reagentBottle, testTube, testTubeRack, centrifuge, centrifugeTube,
  drawBench, CLEAR_COLOR,
} from '../glassware.js';

export const meta = {
  id: 'complex-chem',
  name: '配合物的生成与性质',
  wave: '实验 10',
  accent: '--w-red',
  desc: '一张现象树：滴几滴、加什么、先酸还是先碱——配位平衡被沉淀、酸碱、氧化还原和竞争配体推着走。',
};

const GUIDE = {
  cuDrops: 10, cuMode: 0, cuParts: 0, cuAcid: 0, edtaAdd: 0,
  feMask: 0,
  agDissolver: 0, pptChain: 0,
  s2o3Check: 0,
  centrifugeRpm: 3000, tubeBalance: 0,
  niBase: 0, kTest: 0,
  amylAdd: 0,
};
// 练习模式初值：4 处典型分支错误（滴不到位、加错试剂、离心不平衡、鉴定条件错）
const DEFAULTS = {
  ...GUIDE,
  cuDrops: 3,
  cuAcid: 1,
  tubeBalance: 1,
  niBase: 1,
};
const CONTROLS = [
  { key: 'cuDrops', label: '向 CuSO₄ 中滴加 6 mol/L 氨水', unit: ' 滴', min: 0, max: 30, step: 1 },
  { key: 'cuMode', label: '加氨水方式', options: ['逐滴加入、边加边摇', '一次全部倒入（错误）'] },
  { key: 'cuParts', label: '深蓝溶液分份检验', options: ['分两份：+BaCl₂ / +NaOH', '只做 +BaCl₂（少做一份）'] },
  { key: 'cuAcid', label: '破坏配位平衡先加', options: ['2 mol/L H₂SO₄', '2 mol/L NaOH（错误）'] },
  { key: 'edtaAdd', label: '再加竞争配体', options: ['0.1 mol/L EDTA（强配体）', '不加（留作对照）'] },
  { key: 'feMask', label: 'Fe-SCN 血红中加', options: ['2 mol/L NH₄F（掩蔽）', '等量蒸馏水（对照）'] },
  { key: 'agDissolver', label: '溶解卤化银用', options: ['2 mol/L 氨水', '0.5 mol/L Na₂S₂O₃'] },
  { key: 'pptChain', label: '沉淀转化链', options: ['做全链：AgI → Ag₂S', '只做到 AgI'] },
  { key: 's2o3Check', label: 'CuI/碘 体系', options: ['上清液加 Na₂S₂O₃ 检验 I₂', '不加（对照）'] },
  { key: 'centrifugeRpm', label: '离心机转速', unit: ' r/min', min: 1000, max: 4000, step: 500 },
  { key: 'tubeBalance', label: '离心管放置', options: ['对称两支、体积相当（正确）', '只放一支（错误）'] },
  { key: 'niBase', label: 'Ni²⁺ 鉴定条件', options: ['先加氨水调碱性、再加丁二肟', '直接加丁二肟（酸性）'] },
  { key: 'kTest', label: 'K⁺ 鉴定加', options: ['Na₃[Co(NO₂)₆] 溶液', '0.1 mol/L NaCl（对照）'] },
  { key: 'amylAdd', label: 'Co-SCN 体系', options: ['加 1 mL 戊醇、振荡、静置分层', '不加戊醇'] },
];

const STEPS = [
  {
    name: '准备与取液',
    op: '从试剂架按编号取液（钾盐、钠盐 A–Z 排位；常用酸碱在架中间、其余在通风橱）；用滴瓶加液时滴瓶口朝左或右、与自己身体平行。1 mL 溶液约 20 滴。',
    why: '滴瓶口不朝自己——防止失控喷出大量溶液；滴定式实验的「滴数」就是体量单位，心里要有一滴多大的概念。',
    eq: '1 mL ≈ 20 滴（0.05 mL/滴）',
    calc: '本实验用量都在「几滴到 1 mL」量级',
  },
  {
    name: 'CuSO₄ + 氨水：逐滴与过量',
    op: '取 1 mL 0.1 mol/L CuSO₄ 溶液，逐滴加入 6 mol/L 氨水至过量（边加边摇）。',
    why: '★ 逐滴加才能看到两步现象：先析出浅蓝色沉淀，继续加、沉淀溶解成深蓝色 [Cu(NH₃)₄]²⁺。一次全倒就把第一步现象跳过去了。',
    eq: '2Cu²⁺ + SO₄²⁻ + 2NH₃·H₂O = Cu₂(OH)₂SO₄↓ + 2NH₄⁺；Cu₂(OH)₂SO₄ + 8NH₃ = 2[Cu(NH₃)₄]²⁺ + SO₄²⁻ + 2OH⁻',
    calc: '沉淀出现在 2~5 滴；约 6 滴后开始溶解；10 滴（0.5 mL）为过量',
  },
  {
    name: '内界与外界的检验',
    op: '把深蓝溶液分成两份：一份加几滴 0.1 mol/L BaCl₂，另一份加几滴 0.1 mol/L NaOH，观察。',
    why: '★ BaCl₂ 检出的是 SO₄²⁻（外界），NaOH 检不出 Cu²⁺（被 nh₃ 锁在内界）——「简单离子被配体包住之后，检验不出」。',
    eq: 'Ba²⁺ + SO₄²⁻ = BaSO₄↓（外界）；Cu²⁺ + 2OH⁻ = Cu(OH)₂↓（若在内界，不发生）',
    calc: '[Cu(NH₃)₄]SO₄：内界 [Cu(NH₃)₄]²⁺、外界 SO₄²⁻',
  },
  {
    name: '配位平衡的移动：酸与竞争配体',
    op: '向深蓝溶液先加 2 mol/L H₂SO₄（或 NaOH 作对比），观察颜色；再加 0.1 mol/L EDTA，观察。',
    why: '★ 加酸使 NH₃ 变成 NH₄⁺、[NH₃] 下降，配位平衡左移、深蓝褪去；加碱没有这个效果。EDTA 的 K稳（10¹⁸·⁸）远大于 [Cu(NH₃)₄]²⁺（10¹³·³），直接把 Cu²⁺ 夺走。',
    eq: 'NH₃ + H⁺ = NH₄⁺（消耗配体）；[Cu(NH₃)₄]²⁺ + Y⁴⁻ = CuY²⁻ + 4NH₃（强配体置换）',
    calc: 'K稳：CuY²⁻ 6.3×10¹⁸ ＞ [Cu(NH₃)₄]²⁺ 2.1×10¹³ —— 差 5 个数量级',
  },
  {
    name: 'Fe-SCN 血红与掩蔽',
    op: '取 1 mL 0.1 mol/L FeCl₃，加 1 滴 0.5 mol/L KSCN（血红）；分成两份，一份加 2 mol/L NH₄F，一份加等量水作对照。',
    why: '★ F⁻ 与 Fe³⁺ 的配位能力远强于 SCN⁻（K稳 10¹⁶ vs 约 10² 量级），血红色褪去——这就是「掩蔽」：把干扰离子锁住，让它不再显色。加水只稀释、不褪色。',
    eq: 'Fe³⁺ + nSCN⁻ ⇌ [Fe(SCN)ₙ]³⁻ⁿ（血红）；Fe³⁺ + 6F⁻ = [FeF₆]³⁻（无色）',
    calc: 'K稳([FeF₆]³⁻) ≈ 1×10¹⁶ ≫ K稳(硫氰酸铁)',
  },
  {
    name: 'AgX 三兄弟：溶解度与配位溶解',
    op: '三支试管各取 0.1 mol/L AgNO₃ 数滴，分别加 NaCl、KBr、KI 溶液（白 / 淡黄 / 黄沉淀）；再向三支各加所选试剂，比较溶解情况。',
    why: '★ Ksp：AgCl 1.8×10⁻¹⁰ ＞ AgBr 5.0×10⁻¹³ ＞ AgI 8.3×10⁻¹⁷。能否被配体溶解看复合常数 K = Ksp×K稳——氨水只溶得动 AgCl；硫代硫酸钠把 AgBr 也溶了。',
    eq: 'AgCl(s) + 2NH₃ ⇌ [Ag(NH₃)₂]⁺ + Cl⁻，K = Ksp×K稳 = 2.0×10⁻³',
    calc: 'K(氨水)：AgCl 2.0×10⁻³ / AgBr 5.5×10⁻⁶ / AgI 9.1×10⁻¹⁰',
  },
  {
    name: '沉淀转化链 AgCl → AgI → Ag₂S',
    op: '向 AgCl 沉淀加 KI 溶液（白 → 黄）；再向 AgI 沉淀加 0.5 mol/L Na₂S（黄 → 黑，在通风橱中做）。',
    why: '★ 沉淀转化的方向永远朝 Ksp 更小的跑：AgCl(10⁻¹⁰) → AgI(10⁻¹⁷) → Ag₂S(10⁻⁵⁰)。这一步不用配体，只考察溶解度本身。',
    eq: 'AgCl + I⁻ → AgI + Cl⁻；2AgI + S²⁻ → Ag₂S + 2I⁻',
    calc: 'Ksp 递降：1.8×10⁻¹⁰ → 8.3×10⁻¹⁷ → 6.3×10⁻⁵⁰',
  },
  {
    name: 'Cu²⁺ + KI：沉淀促氧化还原',
    op: '取 0.2 mol/L CuSO₄ 溶液，加数滴 0.5 mol/L KI：出现白色沉淀与棕黄色（I₂）；静置后取上清液，加 Na₂S₂O₃ 观察褪色。',
    why: '★ 单独的 Cu²⁺ 氧化不了 I⁻（E° = 0.16 V ＜ 0.54 V）——但生成 CuI 沉淀（Ksp 1.27×10⁻¹²）把 [Cu⁺] 压到很低，Cu²⁺/Cu⁺ 的电极电位升到约 0.87 V，反应就发生了。沉淀、配位、氧化还原三个平衡是联动的。',
    eq: '2Cu²⁺ + 4I⁻ = 2CuI↓ + I₂；I₂ + 2S₂O₃²⁻ = 2I⁻ + S₄O₆²⁻',
    calc: 'E(Cu²⁺/Cu⁺) 由 0.16 V 升到 ≈0.87 V（生成 CuI 后）＞ 0.54 V',
  },
  {
    name: '离心机的使用：分离与洗涤',
    op: '把 CuI 悬浊液分装两支离心管（各不超过 2/3），对称放入角转子；设转速与时间，离心后取出，用滴管吸走上清液，加蒸馏水洗涤沉淀一次、再离心。',
    why: '★ 离心管必须对称放置、质量相当——不平衡时转子剧烈振动，轻则分离失败、重则损坏机器。上清液要用滴管吸走（不能倒，沉淀会扬起）。',
    eq: '离心分离：r = 4000 r/min、RCF = 2200×g（TDZ4-WS 参数）',
    calc: '转速不足（＜2000 r/min）上清液仍浑浊——分离不完全',
  },
  {
    name: 'Ni²⁺ 鉴定：丁二肟',
    op: '取 0.1 mol/L NiSO₄ 数滴，先加 2 mol/L 氨水调至碱性，再加 1% 二乙酰二肟溶液，观察鲜红色沉淀。',
    why: '★ 丁二肟镍的生成需要氨性条件——酸性下试剂本身不电离、也形不成螯合环。鉴定反应必须交代「条件」，这正是配位平衡受酸碱平衡控制的例子。',
    eq: 'Ni²⁺ + 2H₂Dm + 2NH₃ = Ni(HDm)₂↓（鲜红，螯合环） + 2NH₄⁺',
    calc: '丁二肟是二齿螯合剂——五元螯合环',
  },
  {
    name: 'K⁺ 鉴定：钴亚硝酸钠',
    op: '取明矾（含 K⁺）溶液数滴，加 Na₃[Co(NO₂)₆] 溶液，观察黄色沉淀；另取一份加 NaCl 作对照。',
    why: '★ K⁺ 的鉴定靠生成难溶配合物 K₂Na[Co(NO₂)₆]（黄）——这是「配合物用于鉴定」的第二个例子。NaCl 对照说明沉淀不是随便加个钠盐就出。',
    eq: '2K⁺ + Na⁺ + [Co(NO₂)₆]³⁻ = K₂Na[Co(NO₂)₆]↓（黄）',
    calc: '配位化合物也能用在定性鉴定里',
  },
  {
    name: 'Co-SCN 的萃取显色与回收',
    op: '取 0.1 mol/L CoCl₂ 数滴，加饱和 NH₄SCN 数滴（水相几乎看不出的淡蓝）；加 1 mL 戊醇、振荡、静置分层，上层戊醇显蓝。实验后的戊醇层用滴管收入回收瓶。',
    why: '★ [Co(SCN)₄]²⁻ 在水里又浅又不稳，但易溶于戊醇——萃取后「浓缩」了颜色，鉴定才看得见。戊醇味大，在通风橱做、必须回收。',
    eq: 'Co²⁺ + 4SCN⁻ ⇌ [Co(SCN)₄]²⁻（戊醇中显蓝）',
    calc: '萃取 = 用溶解度把「看不见」变成「看得见」',
  },
];

/* ---------- 现象树（每个分支的观察结果，供读数/解说/三栏表共用） ---------- */

function phenomena(ops) {
  const cu = cuAmmoniaState({ drops: ops.cuDrops });
  const deep = cu.state === 'deepblue';
  const agLig = ops.agDissolver === 0 ? 'NH3' : 'S2O3';
  const ag = {
    AgCl: silverHalideDissolution({ halide: 'AgCl', ligand: agLig }),
    AgBr: silverHalideDissolution({ halide: 'AgBr', ligand: agLig }),
    AgI: silverHalideDissolution({ halide: 'AgI', ligand: agLig }),
  };
  return {
    cu, deep, ag, agLig,
    rows: [
      {
        op: '试剂架取液（1 mL ≈ 20 滴）',
        phen: '——',
        why: '滴瓶口朝向、A–Z 排位是操作规范，不产生现象但决定实验顺不顺。',
      },
      {
        op: `${ops.cuMode === 0 ? '逐滴' : '一次倒入'}加 6 M 氨水 ${ops.cuDrops} 滴`,
        phen: cu.note,
        why: cu.state === 'deepblue'
          ? 'Cu₂(OH)₂SO₄ 沉淀被过量 NH₃ 溶解，生成 [Cu(NH₃)₄]²⁺。'
          : cu.state === 'precipitate'
            ? '氨水不够，沉淀还没溶解——继续滴加会看到它溶掉。'
            : '氨水太少了，还没到沉淀出现。',
      },
      {
        op: ops.cuParts === 0 ? '深蓝溶液分两份：+BaCl₂ / +NaOH' : '只做 +BaCl₂（少做一份）',
        phen: ops.cuParts === 0
          ? '+BaCl₂ → 白色沉淀；+NaOH → 无变化'
          : '+BaCl₂ → 白色沉淀（没做 NaOH 对照）',
        why: 'BaSO₄ 沉淀检出外界 SO₄²⁻；NaOH 检不出内界的 Cu²⁺——配离子把 Cu²⁺ 锁住了。',
      },
      {
        op: `加 ${ops.cuAcid === 0 ? 'H₂SO₄' : 'NaOH'}${ops.edtaAdd === 0 ? '，再加 EDTA' : ''}`,
        phen: [
          ops.cuAcid === 0 ? '深蓝褪成浅蓝（NH₃ 被 H⁺ 抢走）' : '仍为深蓝（碱不消耗 NH₃）',
          ops.edtaAdd === 0 ? '加 EDTA 后蓝色进一步变淡（Cu²⁺ 被 EDTA 夺走）' : '',
        ].filter(Boolean).join('；'),
        why: '配位平衡的移动无非两条路：消耗配体（酸）或换更强的配体（EDTA）。',
      },
      {
        op: `血红 [Fe(SCN)]²⁺ + ${ops.feMask === 0 ? 'NH₄F' : '水（对照）'}`,
        phen: ops.feMask === 0 ? '血红色褪去至无色' : '颜色只是变浅（稀释），仍红',
        why: 'F⁻ 是更强的配体，把 Fe³⁺ 从 SCN⁻ 手里夺走——掩蔽的本质就是配位竞争。',
      },
      {
        op: `AgCl / AgBr / AgI + ${agLig === 'NH3' ? '2 M 氨水' : '0.5 M Na₂S₂O₃'}`,
        phen: `AgCl：${ag.AgCl.verdict}；AgBr：${ag.AgBr.verdict}；AgI：${ag.AgI.verdict}`,
        why: `K = Ksp×K稳 决定溶解：${ag.AgCl.k.toExponential(1)} / ${ag.AgBr.k.toExponential(1)} / ${ag.AgI.k.toExponential(1)}。`,
      },
      {
        op: ops.pptChain === 0 ? 'AgCl +KI→ AgI +Na₂S→ Ag₂S' : 'AgCl +KI→ AgI（停）',
        phen: ops.pptChain === 0 ? '白 → 黄 → 黑' : '白 → 黄',
        why: '沉淀转化朝 Ksp 更小方向：10⁻¹⁰ → 10⁻¹⁷ → 10⁻⁵⁰。',
      },
      {
        op: `CuSO₄ + KI 生成 CuI↓ + I₂${ops.s2o3Check === 0 ? '；上清液 +Na₂S₂O₃' : '（未做 I₂ 检验）'}`,
        phen: ops.s2o3Check === 0 ? '白色 CuI 沉淀 + 棕黄色 I₂；加 Na₂S₂O₃ 后棕黄色褪去' : '白色沉淀 + 棕黄色（未验证 I₂）',
        why: 'CuI 沉淀把 [Cu⁺] 压低，Cu²⁺ 才能氧化 I⁻——沉淀平衡把「不能反应」变成「能反应」。',
      },
      {
        op: `离心 ${ops.centrifugeRpm} r/min、${ops.tubeBalance === 0 ? '对称两支' : '只放一支'}`,
        phen: ops.tubeBalance === 0
          ? (ops.centrifugeRpm >= 2500 ? 'CuI 沉淀压实于管底、上清液澄清' : '上清液仍略浑（转速不足）')
          : '转子剧烈振动——严禁！必须对称放置',
        why: '对称放置是离心机的第一规矩；转速决定分离是否完全。',
      },
      {
        op: `Ni²⁺ + ${ops.niBase === 0 ? '先氨水后丁二肟' : '直接在酸性下加丁二肟'}`,
        phen: ops.niBase === 0 ? '鲜红色螯合沉淀' : '不出现鲜红色——鉴定失败',
        why: '丁二肟镍需要在氨性条件下生成——鉴定反应永远附带条件。',
      },
      {
        op: `明矾 + ${ops.kTest === 0 ? 'Na₃[Co(NO₂)₆]' : 'NaCl（对照）'}`,
        phen: ops.kTest === 0 ? '黄色沉淀 K₂Na[Co(NO₂)₆]' : '不产生沉淀',
        why: '配合物用于鉴定：K⁺ 靠钴亚硝酸钠，不是随便一个钠盐都行。',
      },
      {
        op: ops.amylAdd === 0 ? 'CoCl₂ + SCN⁻，加戊醇振荡分层' : 'CoCl₂ + SCN⁻（不加戊醇）',
        phen: ops.amylAdd === 0 ? '上层戊醇显蓝（[Co(SCN)₄]²⁻ 被萃出）' : '水相淡蓝、几乎看不出',
        why: '萃取是用溶解度把「看不见」变「看得见」；戊醇要回收。',
      },
    ],
  };
}

function model(ops) {
  const p = phenomena(ops);
  const tubeOk = ops.tubeBalance === 0;
  const cuClean = p.cu.state === 'deepblue';
  return { ...p, tubeOk, cuClean };
}

/* ---------- 宏观层 ---------- */

const C_CU_DILUTE = [130, 190, 220, 0.5];     // Cu²⁺ 浅蓝
const C_CU_PPT = [150, 205, 232, 0.9];        // Cu₂(OH)₂SO₄ 浅蓝沉淀
const C_CU_DEEP = [20, 60, 150, 0.72];        // [Cu(NH₃)₄]²⁺ 深蓝
const C_BLOOD = [170, 40, 50, 0.85];          // Fe-SCN 血红
const C_FADE = [235, 240, 244, 0.30];         // 褪至无色
const C_AGCL = [242, 244, 246, 1];
const C_AGBR = [236, 232, 208, 1];
const C_AGI = [224, 210, 90, 1];
const C_AG2S = [42, 44, 48, 1];
const C_CUI = [240, 242, 244, 1];
const C_I2 = [186, 140, 60, 0.55];
const C_NIDMG = [214, 60, 70, 1];
const C_KCO = [232, 210, 80, 1];
const C_CO_AMYL = [40, 80, 190, 0.75];        // 戊醇层蓝
const C_CO_AQ = [228, 190, 195, 0.4];         // 水相淡粉（Co²⁺）

function note(ctx, x, y, text, color = 'rgba(160,180,196,0.9)') {
  ctx.save();
  ctx.font = '600 11px "PingFang SC", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function draw(ctx, W, H, t, i, r, ops) {
  const B = drawBench(ctx, W, H);
  const cx = W / 2;

  if (i === -1) {
    testTubeRack(ctx, { x: cx - 170, y: B - 170, w: 190, h: 170 }, {
      tubes: [{ liquid: CLEAR_COLOR, level: 0.4 }, { liquid: CLEAR_COLOR, level: 0.4 }],
    });
    reagentBottle(ctx, { x: cx + 60, y: B - 120, w: 42, h: 120 },
      { shape: 'drop', liquid: CLEAR_COLOR, level: 0.5, label: ['NH₃·H₂O'] });
    return;
  }
  if (i === 0) {
    reagentBottle(ctx, { x: cx - 165, y: B - 130, w: 46, h: 130 },
      { liquid: [232, 228, 200, 0.25], level: 0.6, label: ['6 M 氨水'] });
    reagentBottle(ctx, { x: cx - 100, y: B - 130, w: 46, h: 130 },
      { liquid: C_CU_DILUTE, level: 0.6, label: ['CuSO₄'] });
    reagentBottle(ctx, { x: cx - 35, y: B - 130, w: 46, h: 130 },
      { liquid: [216, 220, 140, 0.4], level: 0.6, label: ['KI'] });
    testTubeRack(ctx, { x: cx + 40, y: B - 160, w: 160, h: 160 }, {
      tubes: [{ liquid: CLEAR_COLOR, level: 0.4 }, { liquid: CLEAR_COLOR, level: 0.4 }, { liquid: CLEAR_COLOR, level: 0.4 }],
    });
    note(ctx, 14, 40, '1 mL ≈ 20 滴；滴瓶口朝左或右、不朝自己');
    return;
  }
  if (i === 1) {
    const tube = { x: cx - 26, y: B - 210, w: 52, h: 210 };
    testTube(ctx, tube, {
      liquid: r.cu.state === 'precipitate' ? C_CU_PPT : C_CU_DEEP,
      level: 0.52,
    });
    reagentBottle(ctx, { x: cx + 70, y: B - 120, w: 44, h: 120 },
      { shape: 'drop', liquid: CLEAR_COLOR, level: 0.5, label: ['NH₃·H₂O'] });
    note(ctx, 14, 40, r.cu.state === 'deepblue' ? '逐滴→沉淀→过量溶解：深蓝 [Cu(NH₃)₄]²⁺' : r.cu.state === 'precipitate' ? '浅蓝沉淀——继续滴加会溶解' : '氨水还不够（先出现浅蓝沉淀）',
      r.cu.state === 'deepblue' ? 'rgba(160,180,196,0.9)' : '#e8a33d');
    if (ops.cuMode === 1) note(ctx, 14, 58, '一次全倒：看不到中间沉淀步骤', '#e05a4f');
    return;
  }
  if (i === 2 || i === 3) {
    // 深蓝/褪色状态
    let liq = C_CU_DEEP, label = '深蓝';
    if (i === 3) {
      const acid = ops.cuAcid === 0;
      const edta = ops.edtaAdd === 0;
      liq = (acid || edta) ? C_CU_DILUTE : C_CU_DEEP;
      label = (acid || edta) ? '变淡' : '仍深蓝';
    }
    testTubeRack(ctx, { x: cx - 150, y: B - 190, w: 200, h: 190 }, {
      tubes: [
        { liquid: liq, level: 0.5, label },
        ...(i === 2 && ops.cuParts === 0
          ? [{ liquid: [236, 240, 244, 0.3], level: 0.5, solid: C_AGCL, solidLevel: 0.9, label: '+BaCl₂ 白↓' },
            { liquid: liq, level: 0.5, label: '+NaOH 无变化' }]
          : []),
      ],
    });
    if (i === 2 && ops.cuParts === 1) note(ctx, cx + 60, B - 120, '对照（NaOH）没做', '#e8a33d');
    if (i === 3) note(ctx, 14, 40, ops.cuAcid === 0 ? 'H₂SO₄ 抢走 NH₃ → 褪色' : 'NaOH 不消耗 NH₃ → 不褪色', ops.cuAcid === 0 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    return;
  }
  if (i === 4) {
    const faded = ops.feMask === 0;
    testTubeRack(ctx, { x: cx - 150, y: B - 190, w: 240, h: 190 }, {
      tubes: [
        { liquid: C_BLOOD, level: 0.5, label: '原血红' },
        { liquid: faded ? C_FADE : [200, 70, 78, 0.5], level: 0.5, label: faded ? '+NH₄F 无色' : '+水 仍红' },
      ],
    });
    note(ctx, 14, 40, faded ? 'F⁻ 抢走 Fe³⁺，血红褪去——掩蔽' : '加水只稀释不褪色（对照）', faded ? 'rgba(160,180,196,0.9)' : '#e8a33d');
    return;
  }
  if (i === 5) {
    const lig = ops.agDissolver === 0 ? '氨水' : 'Na₂S₂O₃';
    const state = h => r.ag[h];
    const tubeFor = (key, solid, label) => {
      const undissolved = state(key).verdict.includes('不溶');
      return {
        liquid: undissolved ? [218, 226, 232, 0.35] : [232, 238, 242, 0.25],
        level: 0.5,
        solid,
        solidLevel: undissolved ? 0.9 : 0.15,   // 溶掉的管只留一点残渣
        label: `${label}·${state(key).verdict.split('（')[0]}`,
      };
    };
    testTubeRack(ctx, { x: cx - 160, y: B - 200, w: 280, h: 200 }, {
      tubes: [tubeFor('AgCl', C_AGCL, 'AgCl'), tubeFor('AgBr', C_AGBR, 'AgBr'), tubeFor('AgI', C_AGI, 'AgI')],
    });
    note(ctx, 14, 40, `溶解剂：${lig}——判据 K = Ksp×K稳`, 'rgba(160,180,196,0.9)');
    return;
  }
  if (i === 6) {
    const full = ops.pptChain === 0;
    testTubeRack(ctx, { x: cx - 150, y: B - 190, w: 260, h: 190 }, {
      tubes: [
        { liquid: [226, 232, 238, 0.3], level: 0.5, solid: C_AGCL, solidLevel: 0.9, label: 'AgCl 白' },
        { liquid: [226, 232, 238, 0.3], level: 0.5, solid: C_AGI, solidLevel: 0.9, label: '+KI → AgI 黄' },
        ...(full ? [{ liquid: [220, 226, 232, 0.3], level: 0.5, solid: C_AG2S, solidLevel: 0.95, label: '+Na₂S → Ag₂S 黑' }]
          : [{ dashed: true, label: 'Ag₂S 未做' }]),
      ],
    });
    note(ctx, 14, 40, full ? 'Ksp 递降：10⁻¹⁰ → 10⁻¹⁷ → 10⁻⁵⁰（Na₂S 在通风橱做）' : '少做了 Ag₂S 一步（Ksp 最小、转化最彻底）', full ? 'rgba(160,180,196,0.9)' : '#e8a33d');
    return;
  }
  if (i === 7) {
    testTubeRack(ctx, { x: cx - 150, y: B - 190, w: 230, h: 190 }, {
      tubes: [
        { liquid: C_I2, level: 0.5, solid: C_CUI, solidLevel: 0.9, label: 'CuI↓ + I₂' },
        ...(ops.s2o3Check === 0
          ? [{ liquid: [228, 234, 238, 0.28], level: 0.5, solid: C_CUI, solidLevel: 0.9, label: '+Na₂S₂O₃ 褪色' }]
          : []),
      ],
    });
    note(ctx, 14, 40, ops.s2o3Check === 0 ? '棕黄色褪去 = I₂ 被还原（氧化还原的证据）' : '没做 I₂ 检验——少一个证据', ops.s2o3Check === 0 ? 'rgba(160,180,196,0.9)' : '#e8a33d');
    return;
  }
  if (i === 8) {
    centrifuge(ctx, { x: cx - 170, y: B - 220, w: 200, h: 220 }, {
      open: true, rpm: ops.centrifugeRpm, minutes: 5,
      spinning: true, unbalanced: ops.tubeBalance === 1, t,
    });
    centrifugeTube(ctx, { x: cx + 55, y: B - 150, w: 34, h: 150 }, {
      liquid: [228, 234, 238, 0.3], level: 0.6, pellet: 0.9, pelletColor: C_CUI,
    });
    centrifugeTube(ctx, { x: cx + 105, y: B - 150, w: 34, h: 150 }, {
      liquid: [228, 234, 238, 0.25], level: 0.6, pellet: ops.tubeBalance === 0 ? 0.9 : 0,
      pelletColor: C_CUI,
    });
    note(ctx, 14, 40, ops.tubeBalance === 0
      ? (ops.centrifugeRpm >= 2500 ? '对称放置，沉淀压实、上清液澄清' : '转速偏低：上清液仍浑')
      : '只放一支：不平衡、剧烈振动——严禁', ops.tubeBalance === 0 ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    return;
  }
  if (i === 9) {
    const red = ops.niBase === 0;
    testTubeRack(ctx, { x: cx - 130, y: B - 190, w: 200, h: 190 }, {
      tubes: [{
        liquid: red ? [236, 226, 230, 0.35] : [206, 224, 214, 0.45], level: 0.5,
        solid: red ? C_NIDMG : undefined, solidLevel: 0.9,
        label: red ? '丁二肟镍 鲜红↓' : '酸性：不显红',
      }],
    });
    note(ctx, 14, 40, red ? '先氨性、再加丁二肟——条件对了才有鲜红' : '酸性下形不成螯合环：鉴定失败', red ? 'rgba(160,180,196,0.9)' : '#e05a4f');
    return;
  }
  if (i === 10) {
    const kYes = ops.kTest === 0;
    testTubeRack(ctx, { x: cx - 140, y: B - 190, w: 220, h: 190 }, {
      tubes: [
        { liquid: [234, 238, 242, 0.3], level: 0.5, solid: kYes ? C_KCO : undefined, solidLevel: 0.9, label: kYes ? 'K₂Na[Co(NO₂)₆] 黄↓' : '无沉淀' },
        ...(kYes ? [{ liquid: [234, 238, 242, 0.25], level: 0.5, label: '+NaCl 对照：无' }] : []),
      ],
    });
    note(ctx, 14, 40, kYes ? 'K⁺ 的黄色沉淀——配合物用于鉴定' : 'NaCl 加进去什么都没有（对照）', kYes ? 'rgba(160,180,196,0.9)' : '#e8a33d');
    return;
  }
  // i === 11：Co-SCN 萃取
  const amyl = ops.amylAdd === 0;
  testTubeRack(ctx, { x: cx - 150, y: B - 200, w: 260, h: 200 }, {
    tubes: [
      { liquid: C_CO_AQ, level: 0.5, label: '水相：几乎看不出' },
      ...(amyl
        ? [{ liquid: C_CO_AMYL, level: 0.5, label: '戊醇层：显蓝' }]
        : []),
    ],
  });
  if (amyl) {
    // 在第二支管上叠一层戊醇（上层蓝）
    note(ctx, 14, 40, '振荡后静置分层：上层戊醇蓝、下层水相淡粉——萃取把颜色「浓缩」出来');
    note(ctx, 14, 58, '戊醇实验在通风橱做、废液回收', 'rgba(160,180,196,0.75)');
  } else {
    note(ctx, 14, 40, '不加戊醇：水相蓝色太浅，看不出来', '#e8a33d');
  }
}

/* ---------- 微观层 ---------- */

function species(i, r, ops) {
  if (i <= 1) return {
    title: i === 0 ? '取液与滴数' : 'Cu²⁺ 与 NH₃ 的配位平衡',
    items: i === 0
      ? [{ label: 'H₂O', n: 20, color: '#d6e0e7' }, { label: 'Cu²⁺', n: 5, color: '#7fb4d8' }]
      : [
        { label: 'Cu²⁺（游离）', n: r.cu.state === 'deepblue' ? 2 : 10, color: '#7fb4d8' },
        { label: 'NH₃', n: r.cu.state === 'deepblue' ? 4 : 12, color: '#b8a8d8' },
        { label: '[Cu(NH₃)₄]²⁺', n: r.cu.state === 'deepblue' ? 14 : 2, color: '#1e4fa0' },
      ],
    note: i === 0
      ? '看不见的：滴数就是体量——1 mL ≈ 20 滴，滴瓶口朝侧不朝自己。'
      : '看不见的：沉淀溶解不是「沉淀没了」，是 Cu²⁺ 被 NH₃ 包进了 [Cu(NH₃)₄]²⁺——配位平衡在位。',
  };
  if (i === 2) return {
    title: '内界与外界',
    items: [
      { label: '[Cu(NH₃)₄]²⁺', n: 12, color: '#1e4fa0' },
      { label: 'SO₄²⁻（外界）', n: 8, color: '#d9d9df' },
      { label: 'BaSO₄', n: ops.cuParts === 0 ? 5 : 0, color: '#eceff2', phase: 'solid' },
    ],
    note: '看不见的：SO₄²⁻ 自由、能被 Ba²⁺ 抓走；Cu²⁺ 被四个 NH₃ 包住，NaOH 也碰不到它——「内外界」就是这么分出来的。',
  };
  if (i === 3) return {
    title: '配位平衡的两条移动路径',
    items: [
      { label: '[Cu(NH₃)₄]²⁺', n: (ops.cuAcid === 0 || ops.edtaAdd === 0) ? 4 : 14, color: '#1e4fa0' },
      { label: 'NH₄⁺（被酸抢走的 NH₃）', n: ops.cuAcid === 0 ? 8 : 0, color: '#9aa7b6' },
      { label: 'CuY²⁻（EDTA 夺走）', n: ops.edtaAdd === 0 ? 8 : 0, color: '#3f9e8f' },
      { label: 'NH₃', n: (ops.cuAcid === 0 || ops.edtaAdd === 0) ? 10 : 4, color: '#b8a8d8' },
    ],
    note: '看不见的：酸把配体「变没了」（NH₃→NH₄⁺），EDTA 把金属「抢走了」——平衡分别向左和向右被推。',
  };
  if (i === 4) return {
    title: '配位竞争与掩蔽',
    items: [
      { label: 'Fe³⁺', n: ops.feMask === 0 ? 3 : 8, color: '#c8842a' },
      { label: '[Fe(SCN)]²⁺', n: ops.feMask === 0 ? 2 : 12, color: '#b03040' },
      { label: '[FeF₆]³⁻（无色）', n: ops.feMask === 0 ? 10 : 0, color: '#c8d2da' },
      { label: 'F⁻', n: ops.feMask === 0 ? 4 : 0, color: '#8fd0b0' },
    ],
    note: '看不见的：血红色消失是因为 Fe³⁺ 换了个更强的「搭档」——掩蔽不是把干扰离子除掉，是把它锁起来。',
  };
  if (i === 5) return {
    title: 'K = Ksp × K稳',
    items: [
      { label: 'Ag⁺', n: 4, color: '#c8ccd0' },
      { label: r.agLig === 'NH3' ? '[Ag(NH₃)₂]⁺' : '[Ag(S₂O₃)₂]³⁻', n: 10, color: '#8fa8c8' },
      { label: 'X⁻（Cl/Br/I）', n: 6, color: '#d9d9df' },
    ],
    note: `看不见的：溶解的本质是配体把 Ag⁺ 拉进溶液，难度由 Ksp（多难拉出来）× K稳（拉住有多紧）共同决定——本次三种卤化银的 K 分别是 ${r.ag.AgCl.k.toExponential(1)} / ${r.ag.AgBr.k.toExponential(1)} / ${r.ag.AgI.k.toExponential(1)}。`,
  };
  if (i === 6) return {
    title: '沉淀转化',
    items: [
      { label: 'AgI', n: 10, color: '#d8c65a', phase: 'solid' },
      { label: 'Ag₂S', n: ops.pptChain === 0 ? 10 : 0, color: '#2a2c30', phase: 'solid' },
      { label: 'I⁻', n: ops.pptChain === 0 ? 8 : 0, color: '#c8b84a' },
    ],
    note: '看不见的：转化方向朝 Ksp 更小跑——S²⁻ 一来，I⁻ 就被「顶」出去了。',
  };
  if (i === 7) return {
    title: '沉淀把「不能」变「能」',
    items: [
      { label: 'CuI', n: 10, color: '#eceff2', phase: 'solid' },
      { label: 'I₂/I₃⁻', n: ops.s2o3Check === 0 ? 3 : 8, color: '#b08a3c' },
      { label: 'S₂O₃²⁻', n: ops.s2o3Check === 0 ? 6 : 0, color: '#9aa7b6' },
    ],
    note: '看不见的：Cu²⁺ 本来氧化不动 I⁻；生成 CuI 把 [Cu⁺] 压到 10⁻¹² 量级后，Cu²⁺ 的电极电位升到 0.87 V——沉淀平衡直接改写了氧化还原的可行性。',
  };
  if (i === 8) return {
    title: '离心分离',
    items: [
      { label: 'CuI（压实）', n: r.tubeOk ? 10 : 8, color: '#eceff2', phase: 'solid' },
      { label: '上清液', n: r.tubeOk ? 6 : 10, color: '#bcd0da' },
    ],
    note: r.tubeOk
      ? '看不见的：离心让沉淀「压实」——颗粒被按到管底，上清液才澄得出来；对称放置是前提。'
      : '看不见的：单管离心时转子的离心力全偏在一侧——机器蹭蹭乱跳，这是会坏仪器的操作。',
  };
  if (i === 9) return {
    title: 'Ni²⁺ 的螯合鉴定',
    items: [
      { label: 'Ni(HDm)₂（鲜红）', n: ops.niBase === 0 ? 10 : 0, color: '#c83c4c', phase: 'solid' },
      { label: 'Ni²⁺', n: ops.niBase === 0 ? 3 : 9, color: '#7fc8a8' },
      { label: 'NH₃（碱性条件）', n: ops.niBase === 0 ? 8 : 0, color: '#b8a8d8' },
    ],
    note: '看不见的：丁二肟要「两只手」才抓得住 Ni²⁺——缺了氨性条件，螯合环就闭不上。',
  };
  if (i === 10) return {
    title: 'K⁺ 的配合物鉴定',
    items: [
      { label: 'K₂Na[Co(NO₂)₆]', n: ops.kTest === 0 ? 10 : 0, color: '#e0c84a', phase: 'solid' },
      { label: 'K⁺', n: ops.kTest === 0 ? 3 : 9, color: '#c8a24a' },
      { label: '[Co(NO₂)₆]³⁻', n: 5, color: '#c8842a' },
    ],
    note: '看不见的：难溶的「配合物盐」也能当鉴定试剂——沉淀的颜色就是 K⁺ 的身份证。',
  };
  return {
    title: '萃取显色',
    items: [
      { label: '[Co(SCN)₄]²⁻（戊醇层）', n: ops.amylAdd === 0 ? 10 : 1, color: '#2850bE' },
      { label: 'Co²⁺（水相）', n: ops.amylAdd === 0 ? 4 : 10, color: '#e4bec4' },
      { label: '戊醇', n: ops.amylAdd === 0 ? 6 : 0, color: '#d6e0e7' },
    ],
    note: '看不见的：配合物没变多——只是它更「喜欢」戊醇，被搬过去浓缩了，眼睛才看得见。',
  };
}

/* ---------- 读数与文字 ---------- */

function readings(i, r, ops) {
  if (i === 0) return [
    { k: '取液单位', v: '1 mL ≈ 20 滴' },
    { k: '试剂架', v: '钾盐/钠盐 A–Z、酸碱居中、戊醇在通风橱' },
  ];
  if (i === 1) return [
    { k: '氨水滴数', v: String(ops.cuDrops), unit: ' 滴' },
    { k: '现象', v: r.cu.note, tone: r.cu.state === 'deepblue' ? 'good' : 'warn' },
  ];
  if (i === 2) return [
    { k: '+BaCl₂', v: '白色沉淀 BaSO₄（外界 SO₄²⁻）', tone: 'good' },
    { k: '+NaOH', v: ops.cuParts === 0 ? '无变化（内界 Cu²⁺ 被锁）' : '（未做）', tone: ops.cuParts === 0 ? 'good' : 'warn' },
  ];
  if (i === 3) return [
    { k: ops.cuAcid === 0 ? '加 H₂SO₄' : '加 NaOH', v: ops.cuAcid === 0 ? '深蓝褪至浅蓝' : '仍深蓝（未破坏平衡）', tone: ops.cuAcid === 0 ? 'good' : 'bad' },
    { k: '再加 EDTA', v: ops.edtaAdd === 0 ? '蓝色进一步变淡（CuY²⁻）' : '（未做）', tone: ops.edtaAdd === 0 ? 'good' : 'warn' },
    { k: 'K稳对比', v: 'CuY²⁻ 6.3×10¹⁸ ≫ [Cu(NH₃)₄]²⁺ 2.1×10¹³' },
  ];
  if (i === 4) return [
    { k: '掩蔽剂', v: ops.feMask === 0 ? '2 M NH₄F' : '水（对照）', tone: ops.feMask === 0 ? 'good' : 'warn' },
    { k: '现象', v: ops.feMask === 0 ? '血红褪去至无色' : '仍红（只是稀释）', tone: ops.feMask === 0 ? 'good' : 'warn' },
    { k: 'K稳', v: '[FeF₆]³⁻ ≈1×10¹⁶ ≫ 硫氰酸铁' },
  ];
  if (i === 5) {
    const out = [{ k: '溶解剂', v: ops.agDissolver === 0 ? '2 M 氨水' : '0.5 M Na₂S₂O₃' }];
    for (const hName of ['AgCl', 'AgBr', 'AgI']) {
      const g = r.ag[hName];
      out.push({ k: `${hName}（K=${g.k.toExponential(1)}）`, v: g.verdict, tone: g.verdict.includes('不溶') ? 'warn' : 'good' });
    }
    return out;
  }
  if (i === 6) return [
    { k: '转化链', v: ops.pptChain === 0 ? '白 → 黄 → 黑' : '白 → 黄（未做 Ag₂S）' },
    { k: 'Ksp', v: '1.8×10⁻¹⁰ → 8.3×10⁻¹⁷ → 6.3×10⁻⁵⁰' },
  ];
  if (i === 7) return [
    { k: '现象', v: '白色 CuI + 棕黄 I₂' },
    { k: 'I₂ 检验', v: ops.s2o3Check === 0 ? '加 Na₂S₂O₃ 后褪色 ✓' : '未做（对照）', tone: ops.s2o3Check === 0 ? 'good' : 'warn' },
    { k: '电位', v: 'E(Cu²⁺/Cu⁺)：0.16 V → ≈0.87 V（生成 CuI）' },
  ];
  if (i === 8) return [
    { k: '转速', v: String(ops.centrifugeRpm), unit: ' r/min', tone: ops.centrifugeRpm >= 2500 ? 'good' : 'warn' },
    { k: '放置', v: ops.tubeBalance === 0 ? '对称两支 ✓' : '只放一支 ✗', tone: ops.tubeBalance === 0 ? 'good' : 'bad' },
    { k: '分离', v: ops.tubeBalance === 0 && ops.centrifugeRpm >= 2500 ? '沉淀压实、上清澄清' : ops.tubeBalance === 1 ? '振动、危险' : '上清仍浑', tone: ops.tubeBalance === 0 && ops.centrifugeRpm >= 2500 ? 'good' : 'bad' },
  ];
  if (i === 9) return [
    { k: '条件', v: ops.niBase === 0 ? '氨性' : '酸性（错误）', tone: ops.niBase === 0 ? 'good' : 'bad' },
    { k: '现象', v: ops.niBase === 0 ? '鲜红色螯合沉淀 Ni(HDm)₂' : '不显红，鉴定失败', tone: ops.niBase === 0 ? 'good' : 'bad' },
  ];
  if (i === 10) return [
    { k: '试剂', v: ops.kTest === 0 ? 'Na₃[Co(NO₂)₆]' : 'NaCl（对照）', tone: ops.kTest === 0 ? 'good' : 'warn' },
    { k: '现象', v: ops.kTest === 0 ? '黄色沉淀 K₂Na[Co(NO₂)₆]' : '无沉淀', tone: ops.kTest === 0 ? 'good' : 'warn' },
  ];
  return [
    { k: '戊醇', v: ops.amylAdd === 0 ? '加、振荡、分层' : '未加（对照）', tone: ops.amylAdd === 0 ? 'good' : 'warn' },
    { k: '现象', v: ops.amylAdd === 0 ? '上层戊醇显蓝' : '水相太浅、看不出', tone: ops.amylAdd === 0 ? 'good' : 'warn' },
  ];
}

function observation(i, r, ops) {
  if (i === 1) return `滴入 ${ops.cuDrops} 滴氨水：${r.cu.note}。`;
  if (i === 5) {
    const lig = ops.agDissolver === 0 ? '氨水' : 'Na₂S₂O₃';
    return `${lig}中：AgCl ${r.ag.AgCl.verdict}；AgBr ${r.ag.AgBr.verdict}；AgI ${r.ag.AgI.verdict}。`;
  }
  if (i === 8) return ops.tubeBalance === 0
    ? (ops.centrifugeRpm >= 2500 ? `离心 ${ops.centrifugeRpm} r/min：沉淀压实、上清澄清，可以吸走上清液、加水洗涤。` : '转速不足：上清液仍浑——分离不完全。')
    : '只放一支离心管：转子剧烈振动（危险操作），根本谈不上分离。';
  return STEPS[i].op;
}

function verdict(r, ops) {
  const out = [];
  if (ops.cuMode === 1) {
    out.push('氨水一次全部倒入：浅蓝色沉淀生成又溶解的两步现象被跳过了——这个实验的一半价值就在「逐滴看变化」里。');
  }
  if (r.cu.state !== 'deepblue') {
    out.push(`氨水只滴了 ${ops.cuDrops} 滴（约 6 滴后沉淀才开始溶解、10 滴为过量）：现在只看到${r.cu.state === 'none' ? '还没成沉淀' : '浅蓝色沉淀'}——继续滴加到深蓝才算做到「过量」。`);
  }
  if (ops.cuParts === 1) {
    out.push('少做了 +NaOH 那一份：没有这个对照，就证明不了 Cu²⁺ 被锁在内界（这正是「配离子≠简单离子」的关键证据）。');
  }
  if (ops.cuAcid === 1) {
    out.push('加了 NaOH 想破坏 [Cu(NH₃)₄]²⁺：碱不消耗 NH₃（反而抑制 NH₃ 挥发），深蓝不变——破坏这个配位平衡要用酸（H⁺ 把 NH₃ 变成 NH₄⁺）。');
  }
  if (ops.edtaAdd === 1) {
    out.push('没有做 EDTA 那一步：K稳(CuY²⁻) = 6.3×10¹⁸ 比 [Cu(NH₃)₄]²⁺（2.1×10¹³）强 5 个数量级——「强配体夺走金属」是配位平衡移动的另一条路径。');
  }
  if (ops.feMask === 1) {
    out.push('对照加的是水：血色只是被稀释变浅、并没有消失——真正让 [Fe(SCN)]²⁺ 解体的是配位能力更强的 F⁻。');
  }
  if (ops.pptChain === 1) {
    out.push('沉淀链只做到 AgI：Ag₂S 那一步（Ksp 6.3×10⁻⁵⁰，转化最彻底）没做——少了一个「Ksp 递降决定方向」的最强证据。');
  }
  if (ops.s2o3Check === 1) {
    out.push('没有用 Na₂S₂O₃ 验证棕黄色是 I₂：这个体系说服力的落点就是「I₂ 确实生成了」——Cu²⁺ 与 I⁻ 本来并不能反应。');
  }
  if (ops.tubeBalance === 1) {
    out.push('离心只放了一支管：转子严重不平衡、剧烈振动——这是会损坏仪器甚至出事的操作。必须对称放置、两支体积相当（或配平管补水配平）。');
  } else if (ops.centrifugeRpm < 2500) {
    out.push(`转速只设了 ${ops.centrifugeRpm} r/min：转速不足时细颗粒沉不下来，上清液仍浑、分离失败（TDZ4-WS 最高 4000 r/min，一般用 3000 以上）。`);
  }
  if (ops.niBase === 1) {
    out.push('直接在酸性条件下加丁二肟：形不成螯合环、没有鲜红色——鉴定反应必须交代条件，这一条也写进了你的报告要求里。');
  }
  if (ops.kTest === 1) {
    out.push('K⁺ 那份加的是 NaCl：对照组说明「随便加个钠盐」不会有黄色沉淀——K₂Na[Co(NO₂)₆] 才是识别 K⁺ 的钥匙。');
  }
  if (ops.amylAdd === 1) {
    out.push('没加戊醇：[Co(SCN)₄]²⁻ 在水相里又浅又不稳，肉眼几乎看不出——萃取是把这个「看不见」搬到戊醇里浓缩出来。');
  }
  if (!out.length) {
    out.push('全流程规范：现象齐全，配位平衡移动的四条路径都摸到了——① 酸碱（H⁺ 夺配体）；② 配位竞争（EDTA、F⁻）；③ 沉淀（AgX 溶解/转化、CuI）；④ 氧化还原（I₂/S₂O₃²⁻）。');
    out.push('收尾想一想：这四个「外力」都改的是中心离子或配体的浓度——谁能把浓度拉得更低，平衡就朝谁的方向走。K 值（Ksp、K稳、K=Ksp×K稳）就是这场拉锯战的比分牌。');
  }
  return out;
}

/* ---------- 三栏式现象表（课件报告纸的格式） ---------- */

function addReportTable(host, i, r) {
  const wrap = h('div', { class: 'lab-table-wrap' });
  const rows = r.rows.slice(0, i + 1);
  wrap.append(h('table', { class: 'lab-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, '步骤与反应试剂'), h('th', {}, '实验现象'), h('th', {}, '解释'))),
    h('tbody', {}, ...rows.map(row => h('tr', {},
      h('td', {}, row.op), h('td', {}, row.phen), h('td', {}, row.why))))));
  wrap.append(h('div', { class: 'lab-caption' },
    '按课件报告纸的三栏式组织：现象与解释一一对应；解释要落到「哪种平衡让对方离子浓度变了、原平衡往哪儿移」。'));
  host.append(wrap);
}

/* ---------- 挂载 ---------- */

export function mount(root, params = {}) {
  return mountLab(root, params, {
    id: meta.id, name: meta.name, steps: STEPS, controls: CONTROLS,
    defaults: DEFAULTS, guide: GUIDE, model, draw, species,
    observation, verdict, readings,
    equation: '[Cu(NH₃)₄]²⁺ ⇌ Cu²⁺ + 4NH₃；配位平衡被 酸碱 / 沉淀 / 氧化还原 / 配位竞争 四类外力推动',
    calculation: (i, r, ops) => {
      const p = r;
      if (i === 1) return `逐滴现象分两段：2~5 滴出 Cu₂(OH)₂SO₄↓；约 6 滴起溶解；${ops.cuDrops} 滴 → ${p.cu.state === 'deepblue' ? '深蓝（过量）' : '未过量'}`;
      if (i === 3) return 'K稳：CuY²⁻ 6.3×10¹⁸ ＞ [Cu(NH₃)₄]²⁺ 2.1×10¹³；酸效应：NH₃ + H⁺ = NH₄⁺';
      if (i === 4) return 'K稳([FeF₆]³⁻) ≈ 1×10¹⁶ ≫ K稳(硫氰酸铁) ⇒ F⁻ 获胜、血红褪去';
      if (i === 5) return `K = Ksp×K稳：AgCl ${p.ag.AgCl.k.toExponential(2)}；AgBr ${p.ag.AgBr.k.toExponential(2)}；AgI ${p.ag.AgI.k.toExponential(2)}`;
      if (i === 6) return 'Ksp(AgCl) 1.8×10⁻¹⁰ ＞ Ksp(AgBr) 5.0×10⁻¹³ ＞ Ksp(AgI) 8.3×10⁻¹⁷ ＞ Ksp(Ag₂S) 6.3×10⁻⁵⁰——转化朝更小';
      if (i === 7) return '2Cu²⁺+4I⁻ = 2CuI↓+I₂（Ksp(CuI)=1.27×10⁻¹²  把 E(Cu²⁺/Cu⁺) 抬到 ≈0.87 V）';
      if (i === 8) return `离心：${ops.centrifugeRpm} r/min（TDZ4-WS 最高 4000、RCF 2200×g、角转子 18×10 mL）`;
      if (i === 9) return 'Ni²⁺ + 2H₂Dm + 2NH₃ = Ni(HDm)₂↓ + 2NH₄⁺（氨性条件）';
      if (i === 10) return '2K⁺ + Na⁺ + [Co(NO₂)₆]³⁻ = K₂Na[Co(NO₂)₆]↓（黄）';
      if (i === 11) return 'Co²⁺ + 4SCN⁻ ⇌ [Co(SCN)₄]²⁻（萃取入戊醇显蓝）';
      return STEPS[i].calc;
    },
    modelNote: '说明：K稳、Ksp 与「K = Ksp×K稳」判据写在 chem.js 的「配合物」一节，可 node 验算；'
      + 'AgI + 0.5 mol/L Na₂S₂O₃ 的 K 只有 2.4×10⁻³（溶解度约 0.02 mol/L）——教材常直接写「不溶」，本模拟器按常数显示为「微溶」并保留这个出入，供你按教学口径取舍。'
      + '⚠️ 课件 P9 只有八条内容条目与试剂清单、没有逐步操作细节：本模拟器的子实验顺序按条目与试剂清单还原（5(3) Hg(NO₃)₂、8(3) 硬水软化按要求不做；Na₂S 代替饱和 H₂S、戊醇在通风橱并回收），与课上实际做法不同处请反馈调整。',
    extra: (host, i, r) => { if (i >= 1) addReportTable(host, i, r); },
  });
}
