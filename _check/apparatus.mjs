/**
 * 装置清单三方对账 —— 把「课件正文提到的」「代码里画了的」摆在一起，缺的自动标出来。
 *
 *   node _check/apparatus.mjs            全部 10 个实验
 *   node _check/apparatus.mjs magnesium-molar
 *
 * 为什么需要它：`magnesium-molar` 的整套装置里**没有漏斗**，而课件正文提了 6 次、
 * 装置图把它列为第 3 号部件。根因不是画漏，是上游那份器皿清单本身就漏了——
 * **这是一类缺陷，不是一次性 bug**，所以要用机器兜住：
 *
 *     正文提及 ≥ 3 次且装置图上有  ⇒  代码里至少得出现 1 次
 *
 * 唯一的非自动步骤是「装置图上有哪些部件」：装置图是位图，`pdftotext` 拿不到，
 * 只能人渲染原页读。读到的结果写在下面 SIMS 的 `figure` 字段里，一次写完长期复用。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');                       // T-Agent/
const TEXTS = join(ROOT, '智雅搭建', '重点实验', '_课件文本');
const SIMS_DIR = join(HERE, '..', 'js', 'sims');

/** 器皿词表：中文名（课件正文里的写法）→ glassware.js 的导出名。按名字长度降序匹配，避免「试管」吃掉「试管架」。 */
const VESSELS = [
  ['布氏漏斗', 'buchner'], ['抽滤瓶', 'suctionFlask'], ['量气管', 'gasMeasuringTube'],
  ['容量瓶', 'volumetricFlask'], ['试剂瓶', 'reagentBottle'], ['试管架', 'testTubeRack'],
  ['离心管', 'centrifugeTube'], ['蒸发皿', 'evapDish'], ['表面皿', 'watchGlass'],
  ['比色管', 'comparisonTube'], ['比色皿', 'cuvette'], ['锥形瓶', 'conicalFlask'],
  ['铁架台', 'retortStand'], ['滴定管', 'burette'], ['移液管', 'pipette'],
  ['量筒', 'cylinder'], ['温度计', 'thermometer'], ['水浴锅', 'waterBath'],
  ['洗耳球', 'washBulb'], ['玻璃棒', 'stirringRod'], ['洗瓶', 'washBulb'],
  ['离心机', 'centrifuge'], ['烧杯', 'beaker'], ['漏斗', 'funnel'],
  ['试管', 'testTube'], ['秒表', 'stopwatch'], ['滴管', 'reagentBottle'],
  ['电热板', 'hotplate'], ['磁力搅拌器', 'stirPlate'], ['pH 计', 'phMeter'], ['pH计', 'phMeter'],
  ['分光光度计', 'spectrophotometer'], ['紫外', 'uvExposureBox'], ['显影盘', 'developTray'],
  ['天平', 'balance'], ['台秤', 'balance'], ['导管', 'tubing'], ['橡皮管', 'tubing'],
];

/** 三个名称指同一个绘制函数时，报告中合并显示（避免「滴管/试剂瓶」各报一条） */
const MERGE = { reagentBottle: '试剂瓶/滴管', washBulb: '洗耳球/洗瓶', balance: '台秤/天平', tubing: '导管/橡皮管' };

const SIMS = [
  { id: 'mohr-salt',          text: '实验四十  硫酸亚铁铵的制备-20200209.txt',
    figure: ['锥形瓶', '烧杯', '短颈漏斗', '蒸发皿', '水浴锅', '布氏漏斗', '抽滤瓶', '表面皿', '台秤', '电热板', '玻璃棒', '量筒'] },
  { id: 'magnesium-molar',    text: '参考课件： 实验二十一 置换法测定镁的摩尔质量.txt',
    figure: ['铁架台', '量气管', '漏斗', '试管'] },
  { id: 'kinetics',           text: '参考课件：实验15 反应级数、速率及活化能的测定.txt',
    figure: ['试管', '量筒', '秒表', '水浴锅', '温度计'] },
  { id: 'fe2-assay',          text: '实验40-2  硫酸亚铁铵中Fe2+含量的测定-20191107.txt',
    figure: ['滴定管', '锥形瓶', '移液管', '电热板', '温度计'] },
  { id: 'titration-practice', text: '实验三十一  滴定分析基本操作练习-20200208.txt',
    figure: ['滴定管', '移液管', '锥形瓶', '洗耳球'] },
  { id: 'water-hardness',     text: '06_水质分析_水硬度的测定.txt',
    figure: ['滴定管', '锥形瓶', '移液管', '容量瓶', '烧杯', '表面皿', '电热板'] },
  { id: 'ph-acetic',          text: '07_pH法测定HAc电离常数和电离度.txt',
    figure: ['pH 计', '滴定管', '锥形瓶', '容量瓶', '移液管', '烧杯'] },
  { id: 'fe3-spec',           text: '09_硫酸亚铁铵中Fe3+含量测定分光光度法.txt',
    figure: ['分光光度计', '比色皿', '容量瓶', '移液管', '试管', '烧杯'] },
  { id: 'cyanotype',          text: '08_光敏剂与蓝晒古法印相.txt',
    figure: ['烧杯', '漏斗', '表面皿', '蒸发皿', '水浴锅', '台秤', '紫外'] },
  { id: 'complex-chem',       text: '10_配合物的生成与性质.txt',
    figure: ['试管', '试管架', '滴管', '离心机', '离心管', '烧杯', '锥形瓶', '表面皿'] },
];

/** 最长优先、不重叠地数词频 */
function countVessels(text) {
  const hits = {};
  const names = [...VESSELS].sort((a, b) => b[0].length - a[0].length);
  let rest = text;
  for (const [cn, fn] of names) {
    const key = MERGE[fn] || fn;
    let n = 0;
    rest = rest.replace(new RegExp(cn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => { n++; return '\u0000'; });
    if (n) hits[key] = (hits[key] || 0) + n;
  }
  return hits;
}

/** 扫 sim 源码：import 了什么、调用了什么 */
function scanCode(id) {
  const src = readFileSync(join(SIMS_DIR, id + '.js'), 'utf8');
  const imported = new Set();
  const imp = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\.\/glassware\.js'/);
  if (imp) imp[1].split(',').forEach(s => { const t = s.trim().split(/\s+as\s+/).pop(); if (t) imported.add(t); });
  const called = new Set();
  for (const [, fn] of VESSELS) {
    if (new RegExp(`(?<![\\w.])${fn}\\(`).test(src)) called.add(MERGE[fn] || fn);
  }
  return { imported, called };
}

const only = process.argv[2];
let gaps = 0;

for (const sim of SIMS) {
  if (only && sim.id !== only) continue;
  const txtPath = join(TEXTS, sim.text);
  if (!existsSync(txtPath)) { console.log(`!! 找不到课件文本：${sim.text}`); continue; }
  const mentions = countVessels(readFileSync(txtPath, 'utf8'));
  const { called } = scanCode(sim.id);
  const figureSet = new Set(sim.figure.map(n => {
    const m = VESSELS.find(v => v[0] === n || v[0].replace(/\s/g, '') === n.replace(/\s/g, ''));
    return m ? (MERGE[m[1]] || m[1]) : n;
  }));

  const all = [...new Set([...Object.keys(mentions), ...figureSet, ...called])].sort();
  const rows = [];
  for (const key of all) {
    const n = mentions[key] || 0;
    const hasFig = figureSet.has(key), hasCode = called.has(key);
    // 核心规则：正文说得多、装置图上也有，代码里却一次没画 ⇒ 疑漏画
    let flag = '';
    if (n >= 3 && hasFig && !hasCode) { flag = '★ 疑漏画'; gaps++; }
    else if (hasCode && !hasFig && n === 0) flag = '· 代码多画（可能合理）';
    if (flag || hasCode || hasFig) rows.push({ key, n, hasFig, hasCode, flag });
  }

  console.log(`\n=== ${sim.id}　（课件：${sim.text.replace(/\.txt$/, '')}）`);
  console.log('  器皿            正文提及  装置图  代码  ');
  for (const r of rows) {
    console.log(`  ${r.key.padEnd(14)} ${String(r.n).padStart(6)}   ${r.hasFig ? ' ✓ ' : ' · '}   ${r.hasCode ? ' ✓ ' : ' · '}   ${r.flag}`);
  }
}

console.log(`\n合计「疑漏画」${gaps} 处。`);
if (gaps) {
  console.log('说明：正文提及 ≥3 次 + 装置图上有 + 代码里 0 次。逐条人工确认——');
  console.log('     确属漏画就补；确属「不必画」就把理由写进本文件 SIMS 的 figure 里（去掉该项并注明）。');
}
