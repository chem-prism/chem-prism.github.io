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
