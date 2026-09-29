/**
 * 实验分组表（Phase 3 架构重排）
 *
 * 工作台的一级导航是《无机及分析化学实验》的 10 个重点实验（过程型模拟器，
 * 按课件逐步还原），18 个参数型模拟器降为各实验下的「拓展模块」。
 *
 * 三条硬约束：
 *   · 本表只放 id 字符串，**不 import 任何 sim 模块**——lab-shell 要 import 本表，
 *     本表若 import sims 就会成环（sims → lab-shell → groups → sims）。
 *   · **`meta.id` 一律不改**：`?sim=` 仍是唯一的 URL 键，智雅派发的任务链接全部继续有效。
 *     分组只影响左栏怎么摆，不影响任何 URL。
 *   · 一个参数型模拟器可以出现在多个实验下——同一个原理确实服务多个实验
 *     （如 redox 既是制备也是 Fe²⁺ 测定的底座）。「当前在哪一组」只按第一个命中判定。
 *
 * 想改分组：只改这张表。改完跑 `node --input-type=module -e "import('./js/sims/groups.js').then(m=>m.selfCheck())"`
 * （在 作品站点/ 下），它会核对 28 个模拟器是否一个不漏、一个不重地归了位。
 */

/**
 * @typedef {{ core: string|null, title?: string, ext: string[], note: string }} Group
 * core —— 该组的课程实验（过程型模拟器 id）；null 表示这一组没有对应实验，只有拓展模块
 * ext  —— 拓展模块（参数型模拟器 id），顺序即左栏显示顺序
 * note —— 一句话说明「这些拓展模块和这个实验是什么关系」，显示在实验页的拓展标签页上
 */

export const GROUPS = [
  {
    core: 'mohr-salt',
    ext: ['redox', 'precipitate', 'gravimetry'],
    note: '制备全程都在跟平衡打交道：Fe²⁺ 会不会被空气氧化、莫尔盐靠什么从溶液里析出来、最后产率算得准不准。',
  },
  {
    core: 'magnesium-molar',
    ext: ['propagation', 'precision'],
    note: '读数是湿氢气的体积——水蒸气分压忘了扣是系统误差，读数抖动是随机误差，两者传进 M(Mg) 的分量不一样。',
  },
  {
    core: 'kinetics',
    ext: ['propagation', 'qcchart'],
    note: 'k 和 Ea 都是作图求出来的，每一步读数的误差会按什么比例传到结果上；批次之间的波动又该怎么判断是不是失控。',
  },
  {
    core: 'fe2-assay',
    ext: ['redox', 'potentiometry'],
    note: 'KMnO₄ 靠自身指示剂定终点，电位法靠突跃定终点——两条路看的是同一件事，可以互相印证。',
  },
  {
    core: 'titration-practice',
    ext: ['titration', 'distribution'],
    note: '先看清 V̄ 为什么是常量、突跃在什么地方，再回到操作台上把每一次读数做准。',
  },
  {
    core: 'water-hardness',
    ext: ['edta', 'complexometry', 'precipitate'],
    note: '两条滴定线为什么必须用不同的 pH：一个把 Mg²⁺ 沉掉只留钙，一个把钙镁一起测。',
  },
  {
    core: 'ph-acetic',
    ext: ['titration', 'distribution'],
    note: 'Ka 要从 pH 反推，中间经过分布分数的换算；滴定那条曲线给出浓度，这条给出常数。',
  },
  {
    core: 'fe3-spec',
    ext: ['spectrophotometry', 'aas'],
    note: '同一个铁含量，分光光度法和原子吸收法各自怕什么干扰——基体效应在两处长得不一样。',
  },
  {
    core: 'cyanotype',
    ext: ['molecule3d'],
    note: '光敏剂是草酸铁配离子，八面体螯合结构决定了它为什么能吸收紫外光；产物普鲁士蓝里同样有 [Fe(CN)₆] 单元。',
  },
  {
    core: 'complex-chem',
    ext: ['molecule3d', 'precipitate', 'complexometry', 'extraction'],
    note: '配合物的四类性质各有一块能单独拨弄的原理底座：空间构型、沉淀的配位溶解、配位平衡的移动、萃取显色。',
  },
  {
    // 这一组没有对应的课程实验：这两个是仪器分析的独立方法，10 个实验里没有逐步对应的操作。
    core: null,
    title: '其他仪器方法',
    ext: ['ir', 'chromatography', 'ms'],
    note: '红外、色谱、质谱是仪器分析的独立方法，与上面 10 个课程实验没有逐步对应的操作，单独列在这里。',
  },
];

/** 找出某个模拟器所属的组：先按 core 命中，再按 ext 命中，都没有则 null。 */
export function groupOf(id) {
  return GROUPS.find(g => g.core === id) || GROUPS.find(g => g.ext.includes(id)) || null;
}

/**
 * 这个 id 是不是某个课程实验本身（过程型）。
 * 页内标题旁的标签靠它决定：课程实验不显示「实验 XX」，参数型仍显示波长。
 * 不用 `meta.wave` 是否以「实验」开头来判断——那是字符串匹配，改个名就悄悄失效。
 */
export function isCore(id) {
  return GROUPS.some(g => g.core === id);
}

/** 某个过程型实验的拓展模块（顺序即显示顺序）。不是实验核心时返回空数组。 */
export function extsOf(id) {
  const g = GROUPS.find(x => x.core === id);
  return g ? g.ext.slice() : [];
}

/**
 * 反过来问：一个参数型模拟器挂在哪些实验下？
 * 一个模块可以同时服务多个实验（precipitate 挂 3 个），所以返回数组。
 * 用在工作台顶部那条「这也是【XX 实验】的拓展模块」提示上。
 */
export function hostsOf(id) {
  return GROUPS.filter(g => g.core && g.ext.includes(id)).map(g => g.core);
}

/** 没有挂在任何实验下的参数型模拟器（红外/色谱/质谱），左栏单独列在「其他仪器方法」下。 */
export function looseExts() {
  return GROUPS.filter(g => !g.core).flatMap(g => g.ext);
}

/**
 * 自检：核对全部模拟器是否一个不漏、一个不重地归了位。
 * 只在开发时手动调用（见文件头注释），不参与运行时。
 * @param {string[]} allIds 全部 28 个模拟器 id
 */
export function selfCheck(allIds) {
  const cores = GROUPS.filter(g => g.core).map(g => g.core);
  const exts = GROUPS.flatMap(g => g.ext);
  const problems = [];
  const dup = a => [...new Set(a.filter((x, i) => a.indexOf(x) !== i))];

  const dupCore = dup(cores);
  if (dupCore.length) problems.push(`核心实验重复挂载：${dupCore.join(', ')}`);
  if (cores.length !== 10) problems.push(`核心实验应有 10 个，实为 ${cores.length} 个`);

  const covered = new Set([...cores, ...exts]);
  const missing = allIds.filter(id => !covered.has(id));
  const unknown = [...covered].filter(id => !allIds.includes(id));
  if (missing.length) problems.push(`没有归入任何一组的模拟器：${missing.join(', ')}`);
  if (unknown.length) problems.push(`分组表里存在但模拟器不存在的 id：${unknown.join(', ')}`);

  // 重复挂到多个实验下是允许的，但要看得见——打印出来供人工判断
  const multi = dup(exts);
  const report = {
    groups: GROUPS.length,
    cores: cores.length,
    extEntries: exts.length,
    multiHomed: multi,
    problems,
  };
  if (typeof console !== 'undefined') {
    if (problems.length) console.error('【分组自检未通过】', problems);
    else console.log('【分组自检通过】', JSON.stringify(report));
  }
  return report;
}
