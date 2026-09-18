/**
 * 化学计算内核
 *
 * 所有模拟器的数值都由此模块产生。设计原则：
 *   1. 用精确解而非教材近似式 —— 滴定曲线在化学计量点附近必须真实
 *   2. 纯函数，不依赖 DOM —— 便于单独验算
 */

export const KW = 1.0e-14;

/* ============================================================
 * 酸碱滴定
 * ============================================================ */

/**
 * 给定 h=[H+]，返回电荷平衡的残差
 *   Cb + h = Kw/h + Ca·Ka/(Ka+h)
 * 该函数对 h 严格单调递增，可用二分法求根。
 */
function residual(h, Ca, Cb, Ka) {
  return Cb + h - KW / h - (Ca * Ka) / (Ka + h);
}

/**
 * 求滴定体系中 [H+]
 * @param {number} Ca 酸的 analytical 浓度（已计入稀释）
 * @param {number} Cb 碱的 analytical 浓度（已计入稀释）
 * @param {number} Ka 酸的解离常数（强酸取 1e3）
 */
export function hydrogenIon(Ca, Cb, Ka) {
  let lo = 1e-15, hi = 1.0;
  // residual 单调递增：lo 处为负，hi 处为正
  if (residual(lo, Ca, Cb, Ka) > 0) return lo;
  if (residual(hi, Ca, Cb, Ka) < 0) return hi;
  for (let i = 0; i < 120; i++) {
    const mid = Math.sqrt(lo * hi);          // 对数区间二分，收敛更均匀
    if (residual(mid, Ca, Cb, Ka) > 0) hi = mid; else lo = mid;
  }
  return Math.sqrt(lo * hi);
}

export const phFromH = h => -Math.log10(h);

/**
 * 生成滴定曲线
 * @param {object} o
 *   o.ca  酸的初始浓度 mol/L
 *   o.va  酸的初始体积 mL
 *   o.cb  滴定剂(NaOH)浓度 mol/L
 *   o.ka  酸的 Ka（强酸传 1e3）
 *   o.n   采样点数
 * @returns {{points: {v:number, ph:number}[], veq:number}}
 */
export function titrationCurve({ ca, va, cb, ka, n = 240 }) {
  const veq = (ca * va) / cb;
  const vMax = veq * 2;
  const points = [];
  for (let i = 0; i <= n; i++) {
    const v = (vMax * i) / n;
    const vt = va + v;
    const Ca = (ca * va) / vt;
    const Cb = (cb * v) / vt;
    points.push({ v, ph: phFromH(hydrogenIon(Ca, Cb, ka)) });
  }
  return { points, veq };
}

/**
 * 化学计量点的 pH
 * 计量点时溶液为 NaA，其分析浓度等于此时酸的浓度：
 * 电荷平衡中 [Na+] = 盐浓度 = Ca，故调用 hydrogenIon(Ca, Ca, ka)。
 * （若传 Cb = 0 则得到的是纯酸溶液的 pH，是常见的写错点。）
 */
export function equivalencePH(ca, va, cb, ka) {
  const vt = va + (ca * va) / cb;
  const Csalt = (ca * va) / vt;
  return phFromH(hydrogenIon(Csalt, Csalt, ka));
}

/**
 * 突跃范围：化学计量点前后各 0.1% 之间的 pH 区间
 * 这是判断指示剂能否使用的依据。
 */
export function jumpRange(ca, va, cb, ka) {
  const veq = (ca * va) / cb;
  const at = f => {
    const v = veq * f;
    const vt = va + v;
    return phFromH(hydrogenIon((ca * va) / vt, (cb * v) / vt, ka));
  };
  const lo = at(0.999);
  const hi = at(1.001);
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
}

/**
 * 滴定体系中各型体的平衡浓度 —— 供宏观/微观视图使用
 * @returns {{h, oh, HA, A, Na, Ca, Cb}}
 */
export function speciation(Ca, Cb, Ka) {
  const h = hydrogenIon(Ca, Cb, Ka);
  const A = (Ca * Ka) / (Ka + h);     // 共轭碱
  const HA = Math.max(Ca - A, 0);     // 未解离的酸
  return { h, oh: KW / h, HA, A, Na: Cb, Ca, Cb };
}

/** 常用指示剂 */
export const INDICATORS = [
  { name: '甲基橙', lo: 3.1, hi: 4.4, color: '#e0574f' },
  { name: '甲基红', lo: 4.4, hi: 6.2, color: '#d4735a' },
  { name: '溴百里酚蓝', lo: 6.0, hi: 7.6, color: '#3f9e8f' },
  { name: '酚酞', lo: 8.0, hi: 10.0, color: '#d16ba5' },
];

/** 选出变色范围落在突跃内的指示剂 */
export function recommendIndicators(range) {
  return INDICATORS.filter(ind => ind.lo >= range.lo - 0.35 && ind.hi <= range.hi + 0.35);
}

/* ============================================================
 * 分布分数与缓冲容量
 * ============================================================ */

/** 一元弱酸的分布分数 */
export function distribution(ph, pka) {
  const ka = Math.pow(10, -pka);
  const h = Math.pow(10, -ph);
  const dHA = h / (h + ka);
  return { dHA, dA: 1 - dHA };
}

/**
 * 缓冲容量 β = 2.303·C·δ(HA)·δ(A−)
 * 关键教学点：δ 与总浓度无关，β 与总浓度成正比。
 */
export function bufferCapacity(ph, pka, c) {
  const { dHA, dA } = distribution(ph, pka);
  return 2.303 * c * dHA * dA;
}

/* ============================================================
 * 沉淀平衡
 * ============================================================ */

/**
 * AB 型难溶盐：s = √Ksp
 * A₂B / AB₂ 型：s = ∛(Ksp/4)
 */
export function solubility(ksp, type) {
  if (type === 'AB') return Math.sqrt(ksp);
  if (type === 'A2B' || type === 'AB2') return Math.cbrt(ksp / 4);
  throw new Error('未知的盐类型：' + type);
}

/**
 * 使某离子开始沉淀所需的沉淀剂浓度
 * 用于 M_xA_y 型难溶盐：Ksp = [M]^x · [A]^y，已知 [A] 求 [M]
 *   例：AgCl（x=1,y=1）→ [Ag+] = Ksp/[Cl−]
 *       Ag₂CrO₄（x=2,y=1）→ [Ag+] = √(Ksp/[CrO₄²−])
 * @param {number} ksp
 * @param {number} anionConc 被沉淀离子的浓度
 * @param {number} x 沉淀剂在化学式中的下标
 * @param {number} y 被沉淀离子在化学式中的下标
 */
export function requiredTitrant(ksp, anionConc, x = 1, y = 1) {
  return Math.pow(ksp / Math.pow(anionConc, y), 1 / x);
}

/** 离子积 Q = [M]^x · [A]^y */
export const ionProduct = (m, a, x = 1, y = 1) => Math.pow(m, x) * Math.pow(a, y);

/** 判断给定条件下是否生成沉淀 */
export function willPrecipitate(m, a, ksp, x = 1, y = 1) {
  return ionProduct(m, a, x, y) > ksp;
}

/* ============================================================
 * EDTA 酸效应
 * ============================================================ */

/** lgα_Y(H) 标准数据表（pH 0~14，0.5 步长由插值补齐） */
const LG_ALPHA_Y = {
  0: 23.64, 1: 18.30, 2: 13.51, 3: 10.60, 4: 8.44, 5: 6.45,
  6: 4.65, 7: 3.32, 8: 2.27, 9: 1.22, 10: 0.45, 11: 0.07,
  12: 0.01, 13: 0.00, 14: 0.00,
};

/** 线性插值取 lgα_Y(H)，pH 超出表范围时取端点值 */
export function lgAlphaY(ph) {
  if (ph <= 0) return LG_ALPHA_Y[0];
  if (ph >= 14) return 0;
  const lo = Math.floor(ph);
  const hi = lo + 1;
  const t = ph - lo;
  return LG_ALPHA_Y[lo] * (1 - t) + LG_ALPHA_Y[hi] * t;
}

/** 常见金属离子与 EDTA 的 lgK */
// note 中的「常用条件」与「理论最低 pH」是两回事，模拟器中会分别显示。
export const METALS = [
  { name: 'Mg²⁺', lgK: 8.70, practical: 'pH 10（氨性缓冲）', note: '与 Ca²⁺ 共存时可用 pH 12 分离' },
  { name: 'Ca²⁺', lgK: 10.69, practical: 'pH 10 或 pH 12', note: 'pH 12 是为沉淀 Mg²⁺ 以单独测定 Ca²⁺' },
  { name: 'Mn²⁺', lgK: 13.87, practical: 'pH 10', note: '需加还原剂防止氧化' },
  { name: 'Fe³⁺', lgK: 25.10, practical: 'pH 1~3', note: '可在强酸中直接滴定' },
  { name: 'Al³⁺', lgK: 16.10, practical: 'pH 4~6（返滴定）', note: '易水解，需加入过量 EDTA 后返滴' },
  { name: 'Zn²⁺', lgK: 16.50, practical: 'pH 4~6', note: '弱酸性中即可滴定' },
  { name: 'Pb²⁺', lgK: 18.04, practical: 'pH 4~6', note: '注意防止水解' },
  { name: 'Ni²⁺', lgK: 18.60, practical: 'pH 3~5', note: '可用紫脲酸铵作指示剂' },
  { name: 'Cu²⁺', lgK: 18.80, practical: 'pH 3~5', note: '指示剂易被封闭，可用 PAN' },
];

/** 条件稳定常数 lgK′ = lgK − lgα_Y(H) */
export function conditionalLgK(lgK, ph) {
  return lgK - lgAlphaY(ph);
}

/** 准确滴定判据：lg(c·K′) ≥ 6 */
export function canTitrate(lgKCond, cMetal) {
  return Math.log10(cMetal) + lgKCond >= 6;
}

/** 求某一金属离子可准确滴定的最低 pH */
export function minPHfor(metal, cMetal) {
  for (let ph = 0; ph <= 14; ph += 0.05) {
    if (canTitrate(conditionalLgK(metal.lgK, ph), cMetal)) return ph;
  }
  return null;
}

/* ============================================================
 * 氧化还原滴定
 * ============================================================ */

/**
 * 氧化还原滴定曲线
 *
 * 滴定剂 Ox₁ 滴定待测还原剂 Red₂。三段式（教材标准处理）：
 *   计量点前：由待测物电对控制   E = E₂°′ + (0.0592/n₂)·lg(Ox₂/Red₂)
 *   计量点：                   E = (n₁E₁°′ + n₂E₂°′)/(n₁+n₂)
 *   计量点后：由滴定剂电对控制   E = E₁°′ + (0.0592/n₁)·lg(Ox₁/Red₁)
 *
 * @param {object} o
 *   o.e1 滴定剂电对的条件电位 V
 *   o.e2 待测物电对的条件电位 V
 *   o.n1 滴定剂电对的电子数
 *   o.n2 待测物电对的电子数
 *   o.cAnalyte 待测物浓度 mol/L
 *   o.vAnalyte 待测物体积 mL
 *   o.cTitrant 滴定剂浓度 mol/L
 */
export function redoxCurve({ e1, e2, n1 = 1, n2 = 1, cAnalyte, vAnalyte, cTitrant, n = 300 }) {
  const veq = (cAnalyte * vAnalyte) / cTitrant;
  const vMax = veq * 2;
  const F = 0.0592;
  const SPAN = 0.005;                        // 计量点两侧的过渡带宽（滴定分数）

  // 两支曲线（各自在远离计量点处成立）
  // f→0 时 [Ox]/[Red]→0，电位理论上趋于 −∞。教材的曲线也不画这一段，
  // 这里把比值下限钳到 1e-4（约 4 个 pH 单位），起点落在物理合理的区间。
  const branch = f => {
    if (f <= 1) return e2 + (F / n2) * Math.log10(Math.max(f / Math.max(1 - f, 1e-12), 1e-4));
    return e1 + (F / n1) * Math.log10(Math.max(f - 1, 1e-12));
  };

  const Eof = f => {
    if (f <= 1 - SPAN) return branch(f);
    if (f >= 1 + SPAN) return branch(f);
    // 过渡带内线性衔接。这样 ΔE° 很小、两支曲线本会交叉时，
    // 曲线仍然单调——那种情形本来就没有可用突跃，不该画出跳变。
    const t = (f - (1 - SPAN)) / (2 * SPAN);
    const lo = branch(1 - SPAN), hi = branch(1 + SPAN);
    return lo + (hi - lo) * t;
  };

  // 采样：均匀点 + 计量点附近的加密点（过渡带很窄，均匀采样会漏掉）
  const vs = new Set();
  for (let i = 0; i <= n; i++) vs.add((vMax * i) / n);
  for (let i = -40; i <= 40; i++) {
    const v = veq * (1 + (i / 40) * SPAN * 4);
    if (v >= 0 && v <= vMax) vs.add(v);
  }
  const points = [...vs].sort((a, b) => a - b)
    .map(v => ({ v, E: Eof(v / veq) * 1000 }));   // 转成 mV，便于作图

  return { points, veq };
}

/** 计量点电位 */
export const redoxEquivalence = (e1, e2, n1 = 1, n2 = 1) =>
  (n1 * e1 + n2 * e2) / (n1 + n2);

/**
 * 突跃范围：计量点前后各 0.1% 之间的电位区间（mV）
 * 判据：ΔE°′ ≥ 0.35~0.40 V 才能定量滴定
 */
export function redoxJump({ e1, e2, n1 = 1, n2 = 1 }) {
  const F = 0.0592;
  const lo = e2 + (F / n2) * Math.log10(0.999 / 0.001);
  const hi = e1 + (F / n1) * Math.log10(0.001);
  // ΔE° 太小时两支曲线会交叉，宽度算出来是负数。
  // 这不是算错，而是「本就没有可用突跃」——钳到 0，并如实报告。
  const width = (hi - lo) * 1000;
  return {
    lo: lo * 1000, hi: hi * 1000,
    width: Math.max(0, width),
    hasJump: width > 0,
  };
}

/** 能否用于定量滴定 */
export const canTitrateRedox = (e1, e2) => (e1 - e2) >= 0.35;

/* ============================================================
 * 分光光度法
 * ============================================================ */

/**
 * 朗伯-比尔定律的实测吸光度（含偏离）
 *
 * 稀溶液下 A = εbc 成立；浓度升高后由于分子间相互作用、折射率变化、
 * 以及解离缔合等化学因素，A–c 曲线会向浓度轴弯曲。
 * 这里用一个经验式模拟负偏离：A = εbc·(1 − k·c)
 *
 * @param {number} eps 摩尔吸光系数 L·mol⁻¹·cm⁻¹
 * @param {number} b   光程 cm
 * @param {number} c   浓度 mol/L
 * @param {number} k   偏离系数，0 = 完全符合比尔定律
 */
export function absorbance(eps, b, c, k = 0) {
  const ideal = eps * b * c;
  // 用饱和型 A = εbc / (1 + kc)，而不是线性的 (1 − kc)：
  // 后者在 kc > 1 时会变成负数，物理上说不通，曲线也会塌掉。
  // 饱和型在小浓度下近似 (1 − kc)，大浓度下趋于平台——与实测的负偏离一致。
  return ideal / (1 + k * c);
}

/** 生成 A–c 标准曲线 */
export function calibrationCurve({ eps, b, cMax, k = 0, n = 120 }) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const c = (cMax * i) / n;
    out.push({ c, A: absorbance(eps, b, c, k) });
  }
  return out;
}

/** 由吸光度反算浓度（学生实际做的工作） */
export const concFromAbs = (A, eps, b) => A / (eps * b);

/* ============================================================
 * 配位滴定
 * ============================================================ */

/**
 * 配位滴定曲线：pM 随 EDTA 加入量的变化
 *
 * 按 M + Y ⇌ MY 的精确解求 [M]：
 *   设 [MY] = y，则 [M] = C_M − y，[Y] = C_Y − y
 *   K′(C_M − y)(C_Y − y) = y
 *   整理成 K′y² − (K′(C_M+C_Y)+1)y + K′C_M C_Y = 0，取小根
 *
 * @param {object} o
 *   o.lgK  条件稳定常数 lgK′
 *   o.cMetal 金属离子浓度、o.vMetal 体积
 *   o.cEDTA EDTA 浓度
 */
export function complexCurve({ lgK, cMetal, vMetal, cEDTA, n = 300 }) {
  const K = Math.pow(10, lgK);
  const veq = (cMetal * vMetal) / cEDTA;
  const vMax = veq * 2;
  const points = [];

  for (let i = 0; i <= n; i++) {
    const v = (vMax * i) / n;
    const vt = vMetal + v;
    const CM = (cMetal * vMetal) / vt;
    const CY = (cEDTA * v) / vt;

    let pM;
    if (CY === 0) {
      pM = CM > 0 ? -Math.log10(CM) : 14;
    } else {
      const a = K, bb = -(K * (CM + CY) + 1), cc = K * CM * CY;
      const disc = Math.max(bb * bb - 4 * a * cc, 0);
      const y = (-bb - Math.sqrt(disc)) / (2 * a);   // 取小根
      const freeM = Math.max(CM - y, 1e-14);
      pM = -Math.log10(freeM);
    }
    points.push({ v, pM });
  }
  return { points, veq };
}

/** 配位滴定可行性的最低 lgK′（按 lg(c·K′) ≥ 6） */
export const minLgKforTitration = cMetal => 6 - Math.log10(cMetal);

/* ============================================================
 * 误差传递
 * ============================================================ */

/**
 * 随机误差的传递
 *
 * 教材规则：加减法用绝对误差，乘除法用相对误差。
 * 这是分析化学里最常被搞错的一条——常见错误是不论什么运算
 * 都把绝对误差直接相加。
 *
 * @param {object} o
 *   o.a, o.da 第一个量的值与其绝对误差
 *   o.b, o.db 第二个量
 *   o.op '+' | '-' | '×' | '÷'
 */
export function propagate({ a, da, b, db, op }) {
  let value, rule, correct, naive;

  const sumAbs = da + db;                        // 常见错误做法

  if (op === '+' || op === '-') {
    value = op === '+' ? a + b : a - b;
    rule = '加减法 → 绝对误差传递';
    correct = Math.sqrt(da * da + db * db);      // 方和根
    naive = sumAbs;                              // 直接相加（保守，不算错，只是偏大）
  } else if (op === '×' || op === '÷') {
    value = op === '×' ? a * b : a / b;
    rule = '乘除法 → 相对误差传递';
    const ra = da / Math.abs(a), rb = db / Math.abs(b);
    correct = Math.abs(value) * Math.sqrt(ra * ra + rb * rb);
    naive = sumAbs;                              // ← 这才是真正的错误：拿绝对误差相加
  } else {
    throw new Error('未知的运算符：' + op);
  }

  return {
    value, rule, correct, naive,
    correctRel: Math.abs(correct / value),
    naiveRel: Math.abs(naive / value),
    // 用错规则会把误差算成正确值的几成。multiplication 时通常 << 1（严重低估），
    // addition 时 ≈ 1（影响不大）——这本身就是个值得讲的对比。
    ratioToCorrect: correct > 0 ? naive / correct : Infinity,
  };
}

/* ============================================================
 * 统计
 * ============================================================ */

export function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

/** 正态分布随机数（Box–Muller） */
export function gaussian(rng = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Q 检验临界值（90% 置信度） */
const Q_TABLE = { 3: 0.94, 4: 0.76, 5: 0.64, 6: 0.56, 7: 0.51, 8: 0.47, 9: 0.44, 10: 0.41 };

export function qTest(values) {
  const n = values.length;
  if (n < 3 || n > 10) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const range = sorted[n - 1] - sorted[0];
  if (range === 0) return null;
  const gapLow = sorted[1] - sorted[0];
  const gapHigh = sorted[n - 1] - sorted[n - 2];
  const isHigh = gapHigh >= gapLow;
  const q = (isHigh ? gapHigh : gapLow) / range;
  return {
    q,
    critical: Q_TABLE[n],
    outlier: isHigh ? sorted[n - 1] : sorted[0],
    shouldReject: q > Q_TABLE[n],
    n,
  };
}
