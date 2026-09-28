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

/* ============================================================
 * 色谱分析法（教材 ch15）
 * ============================================================ */

/**
 * 范第姆特方程：塔板高度 H 随线速度 u 的变化
 *   H = A + B/u + C·u
 * A 涡流扩散、B/u 分子扩散、C·u 传质阻力。
 * H 对 u 存在极小值，对应最佳线速度 u_opt = √(B/C)。
 */
export function vanDeemter(u, A = 0.005, B = 0.05, C = 0.005) {
  return A + B / u + C * u;
}

export const optimumVelocity = (B = 0.05, C = 0.005) => Math.sqrt(B / C);

/**
 * 色谱参数与峰形
 *
 * 由分配比 k、柱长 L、线速度 u 推出整套参数：
 *   死时间   t_M = L/u
 *   保留时间 t_R = t_M(1+k)
 *   塔板数   N  = L/H
 *   峰宽     W  = 4σ = 4t_R/√N      （高斯峰：N = (t_R/σ)²）
 *   分离度   R  = 2(t_R2−t_R1)/(W1+W2)
 *
 * @param {object} o  k1, k2, L(cm), u(cm/s), A, B, C
 */
export function chromMetrics({ k1, k2, L, u, A = 0.005, B = 0.05, C = 0.005 }) {
  const H = vanDeemter(u, A, B, C);
  const N = L / H;
  const tM = L / u;
  const tR1 = tM * (1 + k1);
  const tR2 = tM * (1 + k2);
  const sig1 = tR1 / Math.sqrt(N);
  const sig2 = tR2 / Math.sqrt(N);
  const W1 = 4 * sig1, W2 = 4 * sig2;
  const alpha = k1 > 0 ? k2 / k1 : Infinity;
  const R = (W1 + W2) > 0 ? (2 * (tR2 - tR1)) / (W1 + W2) : 0;
  return { H, N, tM, tR1, tR2, sig1, sig2, W1, W2, alpha, R };
}

/** 生成色谱图采样（两个高斯峰叠加） */
export function chromatogram(metrics, { n = 400, tMax } = {}) {
  const { tM, tR1, tR2, sig1, sig2 } = metrics;
  const end = tMax != null ? tMax : tR2 + 6 * sig2;
  const gauss = (t, mu, sg) => Math.exp(-((t - mu) ** 2) / (2 * sg * sg));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = (end * i) / n;
    out.push({ t, signal: gauss(t, tR1, sig1) + 0.85 * gauss(t, tR2, sig2) });
  }
  return { points: out, tEnd: end };
}

/** 分离度判据：R ≥ 1.5 视为完全分离 */
export const resolutionVerdict = R =>
  R >= 1.5 ? '完全分离' : R >= 1.0 ? '部分重叠' : '基本没分开';

/* ============================================================
 * 液液萃取（教材 ch10）
 * ============================================================ */

/**
 * 一次萃取的萃取率
 *   E = D·V有 / (D·V有 + V水)
 */
export function extractOnce(D, vOrg, vAq) {
  return (D * vOrg) / (D * vOrg + vAq);
}

/**
 * 多次萃取的累积萃取率
 *   E总 = 1 − [V水 / (D·V有 + V水)]^n
 *
 * 关键结论：有机相总量相同时，分多次萃取优于一次性萃取——
 * 因为每次都用新鲜有机相，维持最大的浓度梯度。
 */
export function extractTotal(D, vOrgEach, vAq, n) {
  return 1 - Math.pow(vAq / (D * vOrgEach + vAq), n);
}

/* ============================================================
 * 电位分析法（教材 ch12）
 * ============================================================ */

/**
 * 电位滴定曲线 + 微分曲线
 *
 * 用能斯特方程描述：计量点前由待测电对控制，计量点后由滴定剂电对控制。
 * 微分曲线 ΔE/ΔV 的峰顶即化学计量点——这是电位滴定定终点的标准方法，
 * 因为 E–V 曲线在计量点附近变化平缓，肉眼难以精确定位。
 *
 * @param {object} o  e1, e2, n1, n2, cAnalyte, vAnalyte, cTitrant,
 *                    slope（电极实际斜率 mV/pH，老化电极会低于理论 59.2）
 */
export function potentiometricCurve({ e1, e2, n1 = 1, n2 = 1, cAnalyte, vAnalyte, cTitrant, slope = 59.2, n = 240 }) {
  const veq = (cAnalyte * vAnalyte) / cTitrant;
  const vMax = veq * 1.6;
  const F = slope / 1000;                 // mV → V，并允许斜率偏离理论值
  const SPAN = 0.002;                     // 计量点过渡带（滴定分数）

  // f→0 时 [Ox]/[Red]→0，电位趋于 −∞。教材曲线不画这一段，
  // 这里把比值下限钳到 1e-4（与 redoxCurve 一致），避免起点成为人为的陡崖——
  // 否则微分曲线会在 v≈0 处出现比计量点还高的假峰，终点定位整个错掉。
  const branch = f => {
    if (f <= 1) return e2 + (F / n2) * Math.log10(Math.max(f / Math.max(1 - f, 1e-12), 1e-4));
    return e1 + (F / n1) * Math.log10(Math.max(f - 1, 1e-12));
  };
  const Eof = f => {
    if (f <= 1 - SPAN || f >= 1 + SPAN) return branch(f);
    const t = (f - (1 - SPAN)) / (2 * SPAN);
    const lo = branch(1 - SPAN), hi = branch(1 + SPAN);
    return lo + (hi - lo) * t;
  };

  // 采样：均匀点 + 计量点附近加密。计量点的跳变只有 0.4% 的滴定分数宽，
  // 均匀采样会整段跳过，微分曲线就抓不到那个峰。
  const vs = new Set();
  for (let i = 0; i <= n; i++) vs.add((vMax * i) / n);
  for (let i = -60; i <= 60; i++) {
    const v = veq * (1 + (i / 60) * SPAN * 6);
    if (v >= 0 && v <= vMax) vs.add(v);
  }
  const pts = [...vs].sort((a, b) => a - b).map(v => ({ v, E: Eof(v / veq) * 1000 }));

  // 微分曲线：ΔE/ΔV，峰顶即计量点
  const deriv = [];
  for (let i = 1; i < pts.length; i++) {
    const dv = pts[i].v - pts[i - 1].v;
    if (dv <= 0) continue;
    deriv.push({ v: (pts[i].v + pts[i - 1].v) / 2, d: (pts[i].E - pts[i - 1].E) / dv });
  }
  return { points: pts, deriv, veq };
}

/** 由微分曲线的峰顶定出终点体积 */
export function endpointFromDerivative(deriv) {
  let best = deriv[0];
  for (const d of deriv) if (Math.abs(d.d) > Math.abs(best.d)) best = d;
  return best ? best.v : null;
}

/** pH 电极的两点校正：斜率检查（mV/pH） */
export const electrodeSlope = (E1, E2, ph1, ph2) => (E2 - E1) / (ph2 - ph1);

/* ============================================================
 * 制备实验：硫酸亚铁铵（摩尔盐）
 *
 * 数据来源 —— 本课程《实验四十 硫酸亚铁铵的制备》课件：
 *   · 溶解度表（第 6 页原表）。注意莫尔盐一行 **0 ℃ 格为空白**，
 *     数值自 10 ℃ 起；硫酸铵一行 50 ℃ 格为空白。此处照原表录入。
 *   · 配料：2 g 铁粉 / 15 mL 3 mol·L⁻¹ H₂SO₄ / 4.5 g (NH₄)₂SO₄
 *   · 目视比色标准色阶：Ⅰ 0.050 mg、Ⅱ 0.10 mg、Ⅲ 0.20 mg
 *     （均为每 1.0 g 产品中 Fe³⁺ 的量）
 *
 * 本节的量热力学量（溶解度、摩尔质量）可脱离浏览器验算；
 * 氧化分数是**教学标定模型**，见该函数注释。
 * ============================================================ */

/** 相对原子质量（IUPAC 2021），供与教材附录核对 */
export const AR = { H: 1.008, N: 14.007, O: 15.999, S: 32.065, Fe: 55.845 };

const M_FESO4 = AR.Fe + AR.S + 4 * AR.O;                        // 151.906
const M_AS = 2 * AR.N + 8 * AR.H + AR.S + 4 * AR.O;             // 132.139
const M_H2O = 2 * AR.H + AR.O;                                  // 18.015

export const M_MOHR = M_FESO4 + M_AS + 6 * M_H2O;               // 392.14
export const M_FESO4_7H2O = M_FESO4 + 7 * M_H2O;                // 278.01
export const M_AMMONIUM_SULFATE = M_AS;                         // 132.14
export const M_FERROUS_SULFATE = M_FESO4;                       // 151.91

/** 溶解度 / (g 物质 · 100 g⁻¹ 水) —— 课件原表 */
export const SOLUBILITY = {
  mohr:  [[10, 12.5], [20, 21.6], [30, 28.1], [40, 33.0], [50, 40.0]],
  feso4: [[0, 15.65], [10, 20.51], [20, 26.5], [30, 32.9], [40, 40.2], [50, 48.6]],
  as:    [[0, 70.6], [10, 73.0], [20, 75.4], [30, 78.0], [40, 81.0], [60, 88.0]],
};

/**
 * 溶解度的分段线性插值。
 *
 * 表格只覆盖 10–60 ℃，而实验要在 90 ℃ 以上（趁热过滤）和 100 ℃（水浴蒸发）
 * 取值，因此默认**线性外推**。外推段是估计值，不是实测——但它决定的行为
 * （热的时候什么都溶得下、冷下来大量析出）是稳健的。
 */
export function solubilityAt(key, T, { extrapolate = true } = {}) {
  const tbl = SOLUBILITY[key];
  if (!tbl || !tbl.length) return NaN;
  const [t0, s0] = tbl[0];
  const [tN, sN] = tbl[tbl.length - 1];

  if (T < t0) {
    if (!extrapolate) return s0;
    const [a, b] = tbl[1];
    return Math.max(0, s0 + (b - s0) * (T - t0) / (a - t0));
  }
  if (T > tN) {
    if (!extrapolate) return sN;
    const [a, b] = tbl[tbl.length - 2];
    return sN + (sN - b) * (T - tN) / (tN - a);
  }
  for (let i = 1; i < tbl.length; i++) {
    if (T <= tbl[i][0]) {
      const [ta, sa] = tbl[i - 1], [tb, sb] = tbl[i];
      return sa + (sb - sa) * (T - ta) / (tb - ta);
    }
  }
  return sN;
}

/**
 * 趁热过滤时 FeSO₄ 的损失 / g。
 *
 * 不引经验系数，直接用课件溶解度表算：
 * 把溶液里的 FeSO₄ 折成 FeSO₄·7H₂O，比较它在过滤温度下的溶解能力，
 * 超出的部分就是结晶在滤纸上、随后被当作残渣弃去的量。
 *
 * 教材为什么再三强调「趁热」：这个函数一跑就明白了。
 */
export function feso4LossOnFilter({ mFeSO4, vWater, T }) {
  const asHeptahydrate = mFeSO4 * M_FESO4_7H2O / M_FESO4;
  const canHold = solubilityAt('feso4', Math.max(T, 0)) * vWater / 100;
  const crystallized = Math.max(0, asHeptahydrate - canHold);
  return crystallized * M_FESO4 / M_FESO4_7H2O;
}

/**
 * 蒸发浓缩后冷却结晶的物料衡算。
 *   留在母液里的 = min(待结晶总量, 溶解度 × 剩余水)
 *
 * 这一条同时给出两个方向的错误：蒸发不足 → 母液带走太多；
 * 蒸发过头 → 产率上去了，但杂质也被浓缩（见 mohrPrep 的 impurity 项）。
 */
export function crystallize({ mSolute, vWater, T }) {
  const s = solubilityAt('mohr', T);           // g / 100 g 水
  const dissolved = Math.min(mSolute, s * vWater / 100);
  return { dissolved, crystal: mSolute - dissolved, solubility: s };
}

/**
 * Fe²⁺ 被空气氧化的分数 —— **教学标定模型**。
 *
 *     4Fe²⁺ + O₂ + 4H⁺ → 4Fe³⁺ + 2H₂O
 *
 * 方向依据是课件里的注意事项：温度越高、暴露越久、酸度越低，氧化越严重
 * （「在制备过程中应使溶液保持较强的酸性，以免 Fe²⁺ 发生水解和氧化」）。
 *
 * ⚠️ 系数是标定出来的，**不是动力学实测值**。它只保证：
 *   ① 单调方向正确；② 量级落在课件标准色阶能分辨的范围内
 *   （Ⅰ/Ⅱ/Ⅲ 级的分界分别在 3.5×10⁻⁴、7.0×10⁻⁴、1.4×10⁻³）。
 * 按教材用量、规范操作时，这个模型给出 ~2×10⁻⁴，即Ⅰ级。
 */
export function fe2OxidizedFraction({ minutes = 10, T = 100, cH = 0.6, exposed = 1 }) {
  const kT = Math.exp((T - 100) / 45);           // 100 ℃ 归一
  const kAcid = 1 / (1 + Math.max(cH, 0));       // 游离酸越多，氧化越慢
  const kAir = 0.35 + 0.65 * Math.min(Math.max(exposed, 0), 1);
  return Math.min(0.05, 3.2e-5 * minutes * kT * kAcid * kAir);
}

/** 每 1.0 g 产品中 Fe³⁺ 的质量 / mg */
export const fe3MgPerGram = frac => frac * (1000 / M_MOHR) * AR.Fe;

/** 目视比色的标准色阶 —— 课件给定，单位 mg Fe³⁺ / 1.0 g 产品 */
export const FE3_GRADES = [
  { grade: 'Ⅰ', mg: 0.050 },
  { grade: 'Ⅱ', mg: 0.100 },
  { grade: 'Ⅲ', mg: 0.200 },
];

/** 由 Fe³⁺ 含量判定试剂级别；超过Ⅲ级色阶记为不合格 */
export function fe3Grade(mgPerG) {
  for (const g of FE3_GRADES) if (mgPerG <= g.mg) return g.grade;
  return '不合格';
}

/**
 * 硫酸亚铁铵制备的全流程物料衡算。
 *
 * 依次做五件事，每步的损失单独记下来，界面才能把
 * 「产量低是低在哪一步」摊开讲：
 *   ① 配料      —— 酸够不够、谁是限制试剂
 *   ② 氧化      —— Fe³⁺ 不参与成盐，直接扣掉，同时决定试剂级别
 *   ③ 趁热过滤  —— 温度低则 FeSO₄·7H₂O 析出在滤纸上
 *   ④ 蒸发结晶  —— 母液带走的那部分不算产量
 *   ⑤ 转移洗涤  —— 固定比例的机械损失
 */
export function mohrPrep({
  mFe = 2, vAcid = 15, cAcid = 3, mAS = 4.5,
  Tfilter = 90, vWaterFilter = 25,
  vWaterEnd = 10, Tcool = 20,
  boilMinutes = 10, Tboil = 100, exposed = 1,
  washes = 2, washLossPerWash = 0.02,
} = {}) {
  const inputs = { mFe, vAcid, cAcid, mAS, Tfilter, vWaterFilter,
    vWaterEnd, Tcool, boilMinutes, Tboil, exposed, washes, washLossPerWash };
  if (Object.values(inputs).some(v => !Number.isFinite(v)) ||
      [mFe, vAcid, cAcid, mAS, vWaterFilter, vWaterEnd].some(v => v <= 0) ||
      boilMinutes < 0 || washes < 0 || washLossPerWash < 0 ||
      Tcool < 0 || Tcool > 50 || Tfilter < 0 || Tfilter > 100 ||
      Tboil < 20 || Tboil > 160 || exposed < 0 || exposed > 1) {
    throw new RangeError('制备参数超出教学模型范围');
  }
  /* ① 配料 */
  const nFe = mFe / AR.Fe;
  const nAcid = (vAcid / 1000) * cAcid;
  const nAS = mAS / M_AMMONIUM_SULFATE;
  // Teaching calibration, NOT measured Fe dissolution kinetics.
  // At 100 C ten minutes completes the model reaction; cooler/shorter runs leave Fe.
  const reactionCompletion = Math.min(1, boilMinutes / (10 * Math.exp((100 - Math.min(Tboil, 100)) / 30)));
  const nFeDissolved = Math.min(nFe, nAcid) * reactionCompletion;
  // Acid excess concentration, not an exact [H+] solution of bisulfate equilibria.
  // The heating stage is held near 15 mL, before dilution for filtration (slide 13).
  const cH = Math.max(0, nAcid - nFeDissolved) / (vAcid / 1000);
  // 三件事都可能卡住产量，得说清是哪一件
  const limiting = nAcid < nFe ? '硫酸（不足，铁没溶完）'
    : nAS <= nFe ? '硫酸铵' : '铁粉';
  const mTheo = Math.min(nFe, nAcid, nAS) * M_MOHR;

  /* ② 氧化 —— 顺带定出试剂级别 */
  const oxidizedFrac = fe2OxidizedFraction({ minutes: boilMinutes, T: Tboil, cH, exposed });
  // Trace carryover is independently calibrated. Washing affects the retained
  // mother-liquor film; this is not a prediction of solid/liquid partitioning.
  const impurityRetention = Math.exp((2 - washes) * 0.55);
  const mgFe3Estimate = fe3MgPerGram(oxidizedFrac) * impurityRetention;
  const nAfterOxidation = nFeDissolved * (1 - oxidizedFrac);

  /* ③ 趁热过滤 */
  const mFeSO4 = nAfterOxidation * M_FESO4;
  const mFeSO4LostFilter = feso4LossOnFilter({ mFeSO4, vWater: vWaterFilter, T: Tfilter });
  const nFeSO4Left = Math.max(0, (mFeSO4 - mFeSO4LostFilter) / M_FESO4);
  const nProduct = Math.min(nFeSO4Left, nAS);
  const mProduct = nProduct * M_MOHR;

  /* ④ 蒸发结晶 */
  const crys = crystallize({ mSolute: mProduct, vWater: vWaterEnd, T: Tcool });

  /* ⑤ 转移与洗涤 */
  const transferLoss = 0.03;
  const washLoss = Math.min(1, Math.max(0, washes) * washLossPerWash);
  const keep = (1 - transferLoss) * (1 - washLoss);

  /**
   * 蒸发过头的代价是暴沸溅失。
   * 讲义要求「蒸发至出现固体薄膜」，再往下烧就贴近干涸，
   * 局部过热会暴沸把料液溅到皿壁上——溅上去的那部分收不回来。
   * 6 mL 以下开始计，越少越严重，到 1 mL 时约溅失三成。
   */
  const splashLoss = vWaterEnd >= 6 ? 0 : Math.min(0.32, 0.32 * (6 - vWaterEnd) / 5);
  const mYield = crys.crystal * keep * (1 - splashLoss);
  const mgFe3 = mYield > 1e-9 ? mgFe3Estimate : null;
  // All entries below use the SAME unit, grams of Mohr-salt equivalent.
  const afterReaction = Math.min(nFeDissolved, nAS) * M_MOHR;
  const afterOxidation = Math.min(nAfterOxidation, nAS) * M_MOHR;
  const lossProduct = {
    reaction: Math.max(0, mTheo - afterReaction),
    oxidation: Math.max(0, afterReaction - afterOxidation),
    filtration: Math.max(0, afterOxidation - mProduct),
    motherLiquor: crys.dissolved,
    handling: crys.crystal * (1 - keep),
    splash: crys.crystal * keep * splashLoss,
  };

  return {
    // 配料
    nFe, nAcid, nAS, nFeDissolved, nAfterOxidation, nFeSO4Left, nProduct,
    reactionCompletion, limiting, lossProduct,
    acidExcess: nAcid - nFe,
    cH,
    // 级别
    oxidizedFrac, mgFe3, grade: mgFe3 === null ? '无产品' : fe3Grade(mgFe3),
    // 产量
    mTheo, mProduct, mYield,
    yieldFrac: mTheo > 0 ? mYield / mTheo : 0,
    // 结晶
    crystallized: crys.crystal,
    motherLiquor: crys.dissolved,
    solubilityAtCool: crys.solubility,
    // 逐项损失 / g（按 FeSO₄ 或产物计，见各键注释）
    loss: {
      unreactedFe: Math.max(0, nFe - nFeDissolved) * M_MOHR,    // 以莫尔盐当量表示
      oxidation: Math.max(0, afterReaction - afterOxidation),
      filter: mFeSO4LostFilter * M_MOHR / M_FESO4,             // 换算为莫尔盐当量
      motherLiquor: crys.dissolved,                            // 留在母液
      handling: crys.crystal * (1 - keep),                     // 转移与洗涤
      splash: crys.crystal * keep * splashLoss,                // 暴沸溅失
    },
    splashLoss,
    /** 界面读数用：把 Fe³⁺ 折算成「比色时的颜色深浅」相对值 */
    colorIndex: mgFe3 === null ? 0 : mgFe3 / FE3_GRADES[2].mg,
  };
}

/**
 * 目视比色：硫氰酸铁配合物的溶液颜色。
 *
 *      Fe³⁺ + nSCN⁻ = [Fe(SCN)ₙ]³⁻ⁿ      （血红色）
 *
 * 用 Beer–Lambert 算，而不是拍一条渐变：
 * 血红色配合物主要吸收蓝绿光、让红光透过，三通道吸收系数不同，
 * 所以低浓度时是淡粉、高浓度才压成深红——这正好解释了
 * 「为什么必须拿标准色阶比，而不能靠眼睛估」。
 *
 * ⚠️ 比色必须在**白色背景**下观察。画布底色是深色时，
 * 浅色溶液会被衬成灰的，看上去完全不像红色。
 *
 * 返回不透明的 [r,g,b,1]。
 */
export function thiocyanateColor(mgFe3) {
  const A = Math.max(0, mgFe3) / 0.30;        // 以 0.30 mg 为 A = 1 的参照
  const k = [0.15, 0.90, 0.85];               // R / G / B 三通道吸收系数
  return [
    Math.round(Math.max(0, Math.min(255, 255 * Math.pow(10, -A * k[0])))),
    Math.round(Math.max(0, Math.min(255, 255 * Math.pow(10, -A * k[1])))),
    Math.round(Math.max(0, Math.min(255, 255 * Math.pow(10, -A * k[2])))),
    1,
  ];
}

/* ============================================================
 * 课程实验：气体、动力学与滴定操作
 *
 * 下列函数是过程型模拟器的纯计算内核。动力学计时和操作误差
 * 使用教学标定模型，明确不是实测数据；计量关系、状态方程、
 * 稀释和滴定化学计量则按课件原式计算。
 * ============================================================ */

export const R_GAS = 8.314462618;
export const M_MG = 24.305;

/** 置换法测 Mg 摩尔质量：湿氢气必须扣除饱和水蒸气分压。 */
export function magnesiumMolarMass({
  // 默认示例：0.0319 g、量气管净读数 33.10 mL；按 25 ℃、
  // 98.16 kPa 的湿氢气计算，结果约为 24.3 g/mol。
  mMg = 0.0319,
  vInitial = 2.00,
  vFinal = 35.10,
  temperatureC = 25.0,
  pressureKPa = 101.325,
  waterVaporKPa = 3.17,
  waterLevelDeltaCm = 0,
  useWaterVaporCorrection = true,
} = {}) {
  // 量气管读数以 mL 给出，状态方程必须换成 m³；mMg 保持 g，
  // 这样最后用 g / mol 返回摩尔质量。
  const vL = (vFinal - vInitial) / 1e6;
  const T = temperatureC + 273.15;
  const headCorrectionKPa = waterLevelDeltaCm * 0.0980665;
  const dryGasPressureKPa = pressureKPa - waterVaporKPa + headCorrectionKPa;
  const pH2KPa = useWaterVaporCorrection ? dryGasPressureKPa : pressureKPa + headCorrectionKPa;
  const pH2 = pH2KPa * 1000;
  if (![mMg, vInitial, vFinal, temperatureC, pressureKPa, waterVaporKPa]
    .every(Number.isFinite) || !Number.isFinite(waterLevelDeltaCm) ||
    vL <= 0 || T <= 0 || pH2 <= 0) {
    throw new RangeError('量气法参数无效');
  }
  const nH2 = pH2 * vL / (R_GAS * T);
  const nH2WithoutVaporCorrection =
    (pressureKPa + headCorrectionKPa) * 1000 * vL / (R_GAS * T);
  return {
    vH2: vL,
    T,
    pH2,
    pH2KPa,
    headCorrectionKPa,
    nH2,
    molarMass: mMg / nH2,
    errorPct: (mMg / nH2 - M_MG) / M_MG * 100,
    nH2WithoutVaporCorrection,
    directAtmosphereMass: mMg / nH2WithoutVaporCorrection,
    vaporCorrectionApplied: useWaterVaporCorrection,
  };
}

/** 两份镁带平行测定的平均值与相对偏差。 */
export function magnesiumDuplicate(runs) {
  if (!Array.isArray(runs) || runs.length < 2 ||
      runs.some(r => !r || !Number.isFinite(r.molarMass))) {
    throw new RangeError('至少需要两次有效的镁摩尔质量测定');
  }
  const values = runs.map(r => r.molarMass);
  const average = mean(values);
  return {
    values,
    average,
    range: Math.max(...values) - Math.min(...values),
    relativeRangePct: average ? (Math.max(...values) - Math.min(...values)) / average * 100 : Infinity,
  };
}

/**
 * 反应级数实验的教学标定模型。
 *
 * 课件给出 2.60 mL 总体积和 Na2S2O3 的 1:2 计量关系，
 * 但 Δt 表为空表。因此只用一个可解释的 Arrhenius/幂律模型
 * 生成方向正确、量级合理的教学读数。
 */
export function kineticRun({
  kiVolume = 1.00,
  persulfateVolume = 1.00,
  thioVolume = 0.40,
  totalVolume = 2.60,
  temperatureC = 25,
  ionicStrengthFixed = true,
  persulfateAddedLast = true,
  additionDelayS = 0,
  mixing = 1,
  calibrationTime = 82,
  activationEnergy = 50000,
} = {}) {
  const cKI = 0.20 * kiVolume / totalVolume;
  const cS2O8 = 0.20 * persulfateVolume / totalVolume;
  const cS2O3 = 0.010 * thioVolume / totalVolume;
  const deltaS2O8 = cS2O3 / 2;
  const T = temperatureC + 273.15;
  const refT = 298.15;
  const refC = 0.20 / 2.60;
  const orderFactor = Math.pow(Math.max(cS2O8, 1e-9) / refC, 1) *
    Math.pow(Math.max(cKI, 1e-9) / refC, 1);
  const ionicFactor = ionicStrengthFixed ? 1 : Math.max(0.35, 1 - 0.8 * Math.abs(
    (kiVolume + 2 * persulfateVolume) / totalVolume - 0.77));
  const arrhenius = Math.exp((activationEnergy / 8.314462618) * (1 / T - 1 / refT));
  const mixingFactor = Math.max(0.55, Number(mixing) || 1);
  const handlingFactor = (persulfateAddedLast ? 1 : 1.12) *
    (1 + Math.max(0, additionDelayS) / 20);
  const time = calibrationTime * arrhenius * handlingFactor /
    Math.max(orderFactor * ionicFactor * mixingFactor, 1e-6);
  const rate = deltaS2O8 / time;
  const rateConstant = rate / Math.max(cS2O8 * cKI, 1e-12);
  return {
    cKI, cS2O8, cS2O3, deltaS2O8, temperatureK: T,
    time, rate, rateConstant, ionicFactor, ionicStrengthFixed,
    persulfateAddedLast, additionDelayS, mixing,
    model: true,
  };
}

export function kineticOrderFromRuns(runs, key = 'cS2O8') {
  if (!Array.isArray(runs) || runs.length < 2) throw new RangeError('至少需要两组动力学数据');
  const xs = runs.map(r => Math.log10(r[key]));
  const ys = runs.map(r => Math.log10(r.rate));
  const mx = mean(xs), my = mean(ys);
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
    xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { order: slope, intercept: my - slope * mx };
}

export function arrheniusFit(runs) {
  if (!Array.isArray(runs) || runs.length < 2) throw new RangeError('至少需要两组温度数据');
  const xs = runs.map(r => 1 / r.temperatureK);
  const ys = runs.map(r => -Math.log10(r.rateConstant ?? r.rate));
  const mx = mean(xs), my = mean(ys);
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
    xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { slope, activationEnergy: slope * 2.303 * R_GAS };
}

/** KMnO4 标定：2 MnO4- : 5 C2O4^2-. */
export function permanganateStandardization({
  mNa2C2O4 = 0.165,
  oxalateVolume = 250.00,
  aliquot = 25.00,
  vKMnO4 = 24.65,
} = {}) {
  const M_NA2C2O4 = 134.00;
  const nOxTotal = mNa2C2O4 / M_NA2C2O4;
  const cOx = nOxTotal / (oxalateVolume / 1000);
  const nOxAliquot = cOx * aliquot / 1000;
  const nMn = (2 / 5) * nOxAliquot;
  const cKMnO4 = nMn / (vKMnO4 / 1000);
  return { M_NA2C2O4, nOxTotal, cOx, nOxAliquot, nMn, cKMnO4, vKMnO4 };
}

/** 莫尔盐中 Fe2+ 的 KMnO4 滴定：1 MnO4- : 5 Fe2+. */
export function permanganateFe2Assay({
  mSample = 0.375,
  purity = 1,
  sampleVolume = 100.00,
  aliquot = 25.00,
  cKMnO4 = 0.00200,
  vKMnO4 = 23.90,
} = {}) {
  const nMnAliquot = cKMnO4 * vKMnO4 / 1000;
  const nFeAliquot = 5 * nMnAliquot;
  const nFeTotal = nFeAliquot * sampleVolume / aliquot;
  const mFe = nFeTotal * AR.Fe;
  return {
    nMnAliquot, nFeAliquot, nFeTotal, mFe,
    massFraction: mFe / mSample,
    theoreticalFeFraction: AR.Fe / M_MOHR,
    purity,
    vTheoretical: (mSample / M_MOHR * purity * aliquot / sampleVolume / 5 / cKMnO4) * 1000,
  };
}

export function titrationRepeatability(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) throw new RangeError('没有有效滴定读数');
  const average = mean(clean);
  const range = Math.max(...clean) - Math.min(...clean);
  return { values: clean, average, range, acceptable: range <= 0.04 };
}

export function titrationRatio(vHCl, vNaOH) {
  if (!(vNaOH > 0)) throw new RangeError('NaOH 体积必须为正');
  return vHCl / vNaOH;
}

/**
 * 高锰酸钾标定/测定的“三度一点”教学修正。
 * 这是操作误差的方向性模型，不是反应动力学实测值。
 */
export function permanganateConditionFactor({
  temperatureC = 75,
  acidM = 0.75,
  speed = 1,
  endpointHoldS = 30,
} = {}) {
  const temp = temperatureC < 60 ? 0.90 : temperatureC > 80 ? 0.96 : 1;
  const acid = acidM < 0.5 ? 0.91 : acidM > 1 ? 0.96 : 1;
  const speedFactor = speed <= 0 ? 0.94 : speed >= 2 ? 0.97 : 1;
  const endpoint = endpointHoldS < 30 ? 0.985 : 1;
  return {
    factor: temp * acid * speedFactor * endpoint,
    lowTemperature: temperatureC < 60,
    highTemperature: temperatureC > 80,
    lowAcid: acidM < 0.5,
    highAcid: acidM > 1,
    fastStart: speed >= 2,
    endpointTooShort: endpointHoldS < 30,
  };
}

/**
 * 滴定基本操作的结果模型。核心计量关系仍是强酸强碱 1:1；
 * 润洗、排泡、视线和终点保持只改变读数或有效浓度。
 */
export function titrationOperation({
  hclVolume = 25.00,
  naohVolumes = [25.08, 25.05, 25.06],
  pipetteRinsed = true,
  buretteRinsed = true,
  bubblesPurged = true,
  eyeLevel = true,
  wallWashed = true,
  endpointHoldS = 30,
} = {}) {
  const dilution = pipetteRinsed ? 1 : 0.996;
  const buretteFactor = buretteRinsed ? 1 : 0.996;
  const eyeBias = eyeLevel ? 1 : 1.0015;
  const wallBias = wallWashed ? 0 : 0.001;
  const holdBias = endpointHoldS >= 30 ? 0 : 0.0008;
  const measured = naohVolumes.map((v, i) =>
    v * (1 + wallBias + holdBias) * eyeBias / buretteFactor +
    (bubblesPurged ? 0 : (i === 0 ? 0.12 : 0.04))
  );
  const rep = titrationRepeatability(measured);
  // 课件记录表按 0.01 mL 报告平均值；默认 25.00/25.06=0.9976。
  const reportedAverage = Number(rep.average.toFixed(2));
  const ratio = titrationRatio(hclVolume * dilution, reportedAverage);
  return {
    measured,
    repeatability: rep,
    reportedAverage,
    ratio,
    concentrationRatio: ratio,
    concentrationErrorPct: (ratio - 1) * 100,
    dilution,
    buretteFactor,
    eyeBias,
    wallBias,
    holdBias,
  };
}

/**
 * KMnO₄ 滴定 Fe²⁺（实验四十之二）的化学计量。
 *      MnO₄⁻ + 5Fe²⁺ + 8H⁺ → Mn²⁺ + 5Fe³⁺ + 4H₂O
 */
export function permanganateTitration({ mSample, purity = 1, cKMnO4, vKMnO4 }) {
  const nSample = (mSample / M_MOHR) * purity;          // 试样中莫尔盐的物质的量
  const nFe2 = nSample;                                 // 每摩尔莫尔盐含 1 mol Fe²⁺
  const nMnO4 = (vKMnO4 / 1000) * cKMnO4;
  const nFe2Titrated = 5 * nMnO4;
  return {
    nFe2, nMnO4, nFe2Titrated,
    vTheo: (nFe2 / 5) / cKMnO4 * 1000,                  // 理论消耗体积 / mL
    wFe2: nFe2 * AR.Fe / mSample,                       // 以质量分数表示的 Fe²⁺ 含量
  };
}

/* ============================================================
 * 课程实验：配位滴定法测定水硬度（实验 06 水质分析·水硬度的测定）
 *
 * 数据来源 —— 本课程课件（关键页已渲染原页核对）：
 *   · 摩尔质量（P33 记录表页眉原值）：CaCO₃ 100.09、CaO 56.08、MgO 40.30
 *   · EDTA 二钠盐 M = 372.24；配制 0.8 g → 400 mL（P22；旁注「书上 0.01 M，不同！」）
 *   · P34 范例记录表：基准物 0.0567 g；标定 25.04/25.10/25.12 mL；
 *     钙 25.36/25.31/25.32 mL；总 29.69/29.88/29.71 mL
 *     → c(EDTA) 0.00565 mol/L、钙 80.2、总 94.2、Mg 14.0（以 CaO 计）→ 10.1 mg/L（以 MgO 计）
 *   · 1 °d = 每升 10 mg CaO、饮用水 ≤ 25 °d、分级 4/8/16/30（P3）
 *   · 金属指示剂（P19/P21）：MgIn⁻ lgK 7.0 > CaIn 5.4；MgY 8.7 < CaY 10.7；
 *     铬黑 T pKa 6.3 / 11.6；钙指示剂最适 pH 10~13
 *
 * 本节全部是纯计量式，可脱离浏览器验算（教师可用计算器逐位核对）。
 * 操作不规范引起的方向性偏差**不在**这里——由 sims/water-hardness.js 的
 * model() 施加，并在那里逐项标注为教学标定模型。
 * ============================================================ */

/** 实验 06 的摩尔质量 / g·mol⁻¹ —— 课件 P33 页眉原值。不进 AR（AR 供与 IUPAC 表核对）。 */
export const M_WH = { CaCO3: 100.09, CaO: 56.08, MgO: 40.30, Na2EDTA_2H2O: 372.24 };

/**
 * 镁硬度的基准换算因数 M(MgO)/M(CaO) = 40.30/56.08 = 0.71862。
 *
 * 差减法得到的是「以 CaO 表示」的镁硬度，课件（P4/P27）要求再乘此因数
 * 报成「以 MgO 表示」——P34 范例 14.0 × 0.7186 = 10.1，逐位自洽。
 * 对应的三个典型错误：忘乘（直接报 14.0）、乘反（14.0 ÷ 0.7186 = 19.5）、
 * 用错对象（乘到钙硬度上 80.2 × 0.7186 = 57.6）。
 */
export const MG_FROM_CAO = M_WH.MgO / M_WH.CaO;

/** EDTA 配制名义浓度：0.8 g / 372.24 g·mol⁻¹ / 0.400 L = 0.0053729（标定前只有 3 位有效数字） */
export function edtaNominalConcentration({ m = 0.8, v = 400 } = {}) {
  const n = m / M_WH.Na2EDTA_2H2O;
  const c = n / (v / 1000);
  return { n, c, cRounded: Number(c.toFixed(5)), v };
}

/**
 * 平行测定的「相对偏差」列（课件 P34 口径）：
 *   相对偏差_i = (x_i − x̄)/x̄ × 100%（带符号、逐份）
 *   均值列     = 各相对偏差绝对值的平均（复现课件 0.12 / 0.08 / 0.27）
 * range / relativeRangePct 供平行性判据用（本模拟器取「相对极差 ≤ 1.0%」，
 * 课件未规定判据，见 sim 的 modelNote）。
 * 注意：这不是严格定义的「相对平均偏差」，但课件就是这么列、这样求均值的，照抄以对齐教师计算器。
 */
export function relativeMeanDeviation(values) {
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const deviationsPct = values.map(v => (v - average) / average * 100);
  const meanDeviationPct = deviationsPct.reduce((a, b) => a + Math.abs(b), 0) / deviationsPct.length;
  const range = Math.max(...values) - Math.min(...values);
  return { average, deviationsPct, meanDeviationPct, range, relativeRangePct: range / average * 100 };
}

/**
 * EDTA 标定（CaCO₃ 基准物）。
 *   n(每份 Ca²⁺) = m(CaCO₃)/M(CaCO₃) × aliquot/vFlask
 *   c_i = n / (V_i/1000)；c̄ = 三次 c_i 的算术平均
 * P34 验算：0.0567 g / 100 mL 定容 / 取 25.00 mL / V = 25.04、25.10、25.12
 *   → c = 0.00566、0.00564、0.00564；c̄ = 0.00564533；报告 0.00565。
 * ⚠️ 用 c̄ 继续算硬度时**不要先舍入**成 0.00565——课件 80.3/80.1/80.2
 *    是用 0.00564533 才复现得出来的（先舍入会得 80.4，对不上）。
 * ⚠️ 相对偏差列是对 c_i 算的（符号方向与课件 0.19/−0.05/−0.13 一致）；
 *    全距列给的是滴定体积（0.08 mL），供平行性判据。
 */
export function edtaStandardization({
  mCaCO3 = 0.0567, vFlask = 100.00, aliquot = 25.00,
  volumes = [25.04, 25.10, 25.12],
} = {}) {
  const nCaTotal = mCaCO3 / M_WH.CaCO3;
  const nAliquot = nCaTotal * (aliquot / vFlask);
  const c = volumes.map(v => nAliquot / (v / 1000));
  const cMean = c.reduce((a, b) => a + b, 0) / c.length;
  const stats = relativeMeanDeviation(c);
  const vStats = relativeMeanDeviation(volumes);
  return {
    nCaTotal, nAliquot, c, cMean, volumes,
    reportedC: Number(cMean.toFixed(5)),
    deviationsPct: stats.deviationsPct,
    meanDeviationPct: stats.meanDeviationPct,
    range: vStats.range,
    relativeRangePct: vStats.relativeRangePct,
  };
}

/**
 * 由 EDTA 消耗体积求硬度，以 basis（CaO / MgO）表示。
 *   ρ = V(mL)/1000 × c(mol/L) × M(g/mol) × 1000(mg/g) ÷ (V水样(mL)/1000 L)
 * 100.00 mL 水样时化简为 ρ = V × c × M × 10。
 * 舍入到 0.1 mg/L 发生在调用方（课件是先逐份舍入、再取平均）。
 */
export function hardnessFromEDTA({ vEDTA, cEDTA, vSample = 100.00, basis = 'CaO' }) {
  const M = M_WH[basis];
  if (!M) throw new Error(`未知硬度基准 ${basis}（可用 CaO / MgO）`);
  return (vEDTA / 1000) * cEDTA * M * 1000 / (vSample / 1000);
}

/** 德国度：1 °d = 每升 10 mg CaO（课件 P3）。 */
export const germanDegrees = mgPerLCaO => mgPerLCaO / 10;

/**
 * 水的硬度分级（课件 P3 原表）：
 *   0~4 极软水 / 4~8 软水 / 8~16 微硬水 / 16~30 硬水 / >30 极硬水；
 * 生活饮用水要求不超过 25 °d。恰好落在档界时归入较硬的一档。
 */
export function hardnessGrade(degrees) {
  const grade = degrees <= 4 ? '极软水' : degrees <= 8 ? '软水' : degrees <= 16 ? '微硬水'
    : degrees <= 30 ? '硬水' : '极硬水';
  return { grade, potable: degrees <= 25 };
}

/**
 * 一份水样中 Ca²⁺/Mg²⁺ 的分析浓度（mol/L），供符号层算 lg(c·K′)。
 * 硬度（以 CaO 计, mg/L）÷ M(CaO) ÷ 1000 即得金属离子浓度——
 * Ca²⁺、Mg²⁺ 与 EDTA 都是 1:1，镁的 CaO 当量摩尔数就是 n(Mg²⁺)。
 */
export function hardnessIonConcentrations({ mgPerLCaO_ca, mgPerLCaO_total }) {
  return {
    cCa: mgPerLCaO_ca / M_WH.CaO / 1000,
    cMg: (mgPerLCaO_total - mgPerLCaO_ca) / M_WH.CaO / 1000,
  };
}

/**
 * 顶层组装：三组读数一次算完（sim 的 model() 直接调用）。
 * 复现课件 P34 的两处口径：
 *   · 硬度的「平均值」= 逐份舍入到 0.1 mg/L 后再平均（80.2 / 94.2）
 *   · 「相对偏差」列 = 对未舍入的逐份值算（钙 0.12/−0.08/−0.04 均值 0.08）
 */
export function waterHardnessReport({ cEDTA, vSample = 100.00, vCa = [], vTotal = [] }) {
  const group = volumes => {
    const values = volumes.map(v => hardnessFromEDTA({ vEDTA: v, cEDTA, vSample }));
    const reported = values.map(v => Number(v.toFixed(1)));
    const mean = Number((reported.reduce((a, b) => a + b, 0) / reported.length).toFixed(1));
    const stats = relativeMeanDeviation(values);      // 相对偏差列（未舍入值）
    const vStats = relativeMeanDeviation(volumes);    // 全距与相对极差（体积口径）
    return {
      volumes, values, reported, mean,
      deviationsPct: stats.deviationsPct,
      meanDeviationPct: stats.meanDeviationPct,
      range: vStats.range,
      relativeRangePct: vStats.relativeRangePct,
      ok: vStats.relativeRangePct <= 1.0,             // 教学参照线（课件未规定）
    };
  };
  const ca = group(vCa);
  const tot = group(vTotal);
  const byCaO = Number((tot.mean - ca.mean).toFixed(1));      // 94.2 − 80.2 = 14.0
  const mgO = byCaO * MG_FROM_CAO;
  const degreesTotal = Number(germanDegrees(tot.mean).toFixed(2));
  const grade = hardnessGrade(degreesTotal);
  const cIon = hardnessIonConcentrations({ mgPerLCaO_ca: ca.mean, mgPerLCaO_total: tot.mean });
  const mgResidual = residualMagnesiumAtPH({ ph: 12 });
  const lgKCa = METALS.find(m => m.name === 'Ca²⁺').lgK;
  const lgKMg = METALS.find(m => m.name === 'Mg²⁺').lgK;
  return {
    ca, tot,
    mg: {
      byCaO,
      factor: MG_FROM_CAO,
      mgO,
      reportedMgO: Number(mgO.toFixed(1)),
      wrongNoConvert: byCaO,
      wrongInverted: Number((byCaO / MG_FROM_CAO).toFixed(1)),
      wrongOnCalcium: Number((ca.mean * MG_FROM_CAO).toFixed(1)),
    },
    degrees: { total: degreesTotal, calcium: Number(germanDegrees(ca.mean).toFixed(2)) },
    grade: grade.grade,
    potable: grade.potable,
    // 符号层「为什么这么滴」的判据（模拟器实算后显示，勿写死）
    window: {
      lgKpCa10: conditionalLgK(lgKCa, 10), lgKpMg10: conditionalLgK(lgKMg, 10),
      lgKpCa12: conditionalLgK(lgKCa, 12), lgKpMg12: conditionalLgK(lgKMg, 12),
      cCa: cIon.cCa, cMg: cIon.cMg,
      lgCKpCa10: conditionalLgK(lgKCa, 10) + Math.log10(cIon.cCa),
      lgCKpMg10: conditionalLgK(lgKMg, 10) + Math.log10(cIon.cMg),
      mgResidual: mgResidual.cMgResidual,
      lgCKpMg12: conditionalLgK(lgKMg, 12) + Math.log10(mgResidual.cMgResidual),
    },
  };
}

/**
 * Mg(OH)₂ 沉淀隐蔽后残余的 [Mg²⁺]（解释 pH 12 为什么能只测钙）。
 *   [Mg²⁺] = Ksp(Mg(OH)₂)/[OH⁻]²，[OH⁻] = 10^(pH−14)
 * Ksp = 5.61×10⁻¹²（常见教材附录/CRC 值；有版本记 1.8×10⁻¹¹——两种取值下
 * 「lg(c·K′) ≪ 6、Mg 彻底退出滴定」的结论都成立，只影响此处的量级显示）。
 */
export function residualMagnesiumAtPH({ ph, kspMgOH2 = 5.61e-12 }) {
  const oh = Math.pow(10, ph - 14);
  const cMgResidual = kspMgOH2 / (oh * oh);
  return { oh, cMgResidual, lgCMg: Math.log10(cMgResidual) };
}

/**
 * 金属指示剂（配位滴定用）——与上面的酸碱指示剂 INDICATORS **不是一类**：
 * 络合色 MIn 是「金属-指示剂络合物」的颜色，不是指示剂自身的酸式/碱式色，
 * 两型体模型表达不了（铬黑 T 在 pH 10 若按两型体算会得「橙色」，化学上错误）。
 * 故单列一张表，INDICATORS 保持原样（titration.js 用它铺酸碱指示剂下拉框）。
 * 数据出处：实验 06 课件 P19/P21 原值。
 */
export const METAL_INDICATORS = [
  {
    name: '铬黑T', abbr: 'EBT', pKa1: 6.3, pKa2: 11.6,
    acidColor: '紫色', midColor: '蓝色', baseColor: '橙色',
    optimal: '6.3~11.6',
    complex: { Mg: { lgK: 7.0, color: '紫红' }, Ca: { lgK: 5.4, color: '酒红' } },
    note: 'pH<6.3 呈紫红色、与 MIn 颜色相近，终点不易判断；pH>11.6 呈橙色。',
  },
  {
    name: '钙指示剂', abbr: 'NN', pKa1: 12.4, pKa2: null,
    acidColor: '暗红', midColor: '蓝色', baseColor: '酒红',
    optimal: '10~13',
    complex: { Ca: { lgK: 5.4, color: '酒红' } },
    note: 'pH>13.5 时指示剂自身呈酒红色、与 CaIn 同色，终点突变消失（实验 06 思考题 4 的口径）。',
  },
];

/* ============================================================
 * 课程实验：pH 法测定 HAc 的电离常数和电离度（实验 07）
 *
 * 数据来源 —— 本课程课件（关键页已渲染原页核对）：
 *   · 邻苯二甲酸氢钾 M = 204.22（P224；与 NaOH 1:1），标定剂
 *   · P29 示例表（原页）：c = 0.0102/0.02043/0.05110/0.1022、
 *     pH = 3.35/3.21/3.02/2.86；用它反算 Ka = 2.0/1.9/1.8/1.9×10⁻⁵，与该表自洽
 *   · P35「示例」表不自洽（Ka 列误印 ×10⁻⁴、第 3/4 行 [H⁺] 指数印错）——不采用；
 *     理论序列按 Ka = 1.78×10⁻⁵ 精确式反算为 3.38/3.23/3.02/2.87
 *   · 有效数字（报告要求）：NaOH 浓度 4 位；pH 两位（首数是幂次）；
 *     Ka、α 两位；相对偏差带正负、位数随差值
 *   · Q 检验 n=3 临界值 0.94（报告要求 (5)，与 chem.js 上方 Q_TABLE 一致）
 *   · E = K − 0.0591·pH（P17，25 ℃）
 *
 * 本节全部是纯计量式；pH 计的读数偏差（斜率、未校准、测量顺序、电极护理、
 * 实测偏差向量）是教学标定模型，不在这里——见 sims/ph-acetic.js 的 model()。
 * ============================================================ */

/** 邻苯二甲酸氢钾 M / g·mol⁻¹（课件 P224 与报告要求原值） */
export const M_KHP = 204.22;

/** 教材 20 ℃ 醋酸电离常数——报告要求 (8) 给区间 1.75~1.8×10⁻⁵，取中值作比较基准 */
export const KA_HAc = 1.78e-5;

/** NaOH 标定（邻苯二甲酸氢钾，1:1）：c_i = (m/204.22) ÷ (V_i/1000) */
export function naohStandardization({ mKHP = 0.5205, volumes = [24.90, 24.91, 24.93] } = {}) {
  const n = mKHP / M_KHP;
  const c = volumes.map(v => n / (v / 1000));
  const stats = relativeMeanDeviation(c);
  const vStats = relativeMeanDeviation(volumes);
  return {
    n, c, volumes,
    cMean: stats.average,
    reportedC: Number(stats.average.toFixed(4)),
    deviationsPct: stats.deviationsPct,
    meanDeviationPct: stats.meanDeviationPct,
    range: vStats.range,
    relativeRangePct: vStats.relativeRangePct,
    q: qTest(c),
  };
}

/** HAc 总浓度（NaOH 滴定，1:1）：c_i = c(NaOH)·V_i / V(HAc)；课件判据：三份极差 < 0.04 mL */
export function hacTotalConcentration({ cNaOH, volumes = [24.97, 24.98, 24.99], vHAc = 25.00 } = {}) {
  const c = volumes.map(v => cNaOH * v / vHAc);
  const stats = relativeMeanDeviation(c);
  const vStats = relativeMeanDeviation(volumes);
  return {
    c, volumes,
    cMean: stats.average,
    reportedC: Number(stats.average.toFixed(4)),
    deviationsPct: stats.deviationsPct,
    meanDeviationPct: stats.meanDeviationPct,
    range: vStats.range,
    repeatOk: vStats.range <= 0.04,
  };
}

/**
 * 一元弱酸的精确电离平衡（忽略水的电离——c ≥ 0.01 mol/L 时成立）：
 *   h = (−Ka + √(Ka² + 4Ka·c)) / 2；α = h/c
 */
export function weakAcidEquilibrium({ c, ka = KA_HAc }) {
  const h = (-ka + Math.sqrt(ka * ka + 4 * ka * c)) / 2;
  return { h, ph: -Math.log10(h), alpha: h / c };
}

/**
 * 由实测 pH 反算 Ka（课件公式）：[H⁺] = 10^(−pH)；Ka = [H⁺]²/(c − [H⁺])；α = [H⁺]/c。
 * approx=true 时用忽略电离消耗的近似式 Ka = h²/c——最稀的样品上偏低最多
 * （0.01 mol/L 处约低 4.4%），sim 里作为可选口径展示这个差别。
 */
export function kaFromPH({ c, ph, approx = false }) {
  const h = Math.pow(10, -ph);
  const ka = approx ? h * h / c : h * h / (c - h);
  return { h, ka, alpha: h / c };
}

/** 稀释系列浓度：c_k = c0·V_k/V(容量瓶)；默认 5.00/10.00/25.00 mL 稀释至 50 mL，加原液共 4 份 */
export function dilutionSeries({ c0, aliquots = [5.00, 10.00, 25.00], vFlask = 50.00 }) {
  return [...aliquots.map(v => c0 * v / vFlask), c0];
}

/**
 * pH 计读数（教学标定模型）。
 * 物理依据：E = K − S·pH（P17）。两点校准把低缓冲点（pH 4.00）钉在直线上，
 * 电极实际斜率 S = slopePct·S₀ 时，读数 ≈ 4.00 + (S/S₀)·(pH − 4.00)——
 * 偏离在测量点离锚点越远时越大（本实验样品在 pH 2.9~3.4，锚点下方 0.6~1.1 个单位）。
 * 未校准（K 未定）用一个方向性偏移 +0.20 表示（⚠️ 教学标定，非实测）。
 */
export function phMeterReading({ phTrue, slopePct = 100, calibrated = true, anchorPH = 4.00 }) {
  if (!calibrated) return { read: phTrue + 0.20, err: 0.20 };
  const k = Math.max(0.5, Math.min(1.5, slopePct / 100));
  const read = anchorPH + k * (phTrue - anchorPH);
  return { read, err: read - phTrue };
}

/**
 * 顶层组装：由 c(HAc) 与四个实测 pH 生成逐份 c / pH / [H⁺] / Ka / α，
 * 并给出 Ka 均值、与教材值（1.78×10⁻⁵）的相对误差。
 * phMeasured 传**记录到 0.01 的 pH**（课件就是从记录值算的）。
 */
export function hacReport({ cHAc, phMeasured, approx = false }) {
  const cs = dilutionSeries({ c0: cHAc });
  const rows = cs.map((c, k) => {
    const theory = weakAcidEquilibrium({ c });
    const m = kaFromPH({ c, ph: phMeasured[k], approx });
    return { c, ph: phMeasured[k], phTheory: theory.ph, h: m.h, ka: m.ka, alpha: m.alpha };
  });
  const kaMean = rows.reduce((a, r) => a + r.ka, 0) / rows.length;
  return { rows, kaMean, kaRef: KA_HAc, relErrPct: (kaMean - KA_HAc) / KA_HAc * 100 };
}
