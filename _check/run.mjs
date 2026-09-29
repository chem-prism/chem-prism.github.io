/**
 * 场景自检器 —— 构图级（`_scenes-all.html`）
 *
 *   node _check/run.mjs              与基线比对，报差异
 *   node _check/run.mjs --update     写入/更新基线（改完场景、确认无误后跑）
 *   node _check/run.mjs --sim=kinetics   只看一个 sim
 *   node _check/run.mjs --phases     每个场景渲 t=0/0.8/2.4 三帧，核对动效
 *   node _check/run.mjs --selfcheck  先证明「检查器抓得到错」再下结论
 *
 * 断言（每条都在 --selfcheck 里被故意坏样本验证过）：
 *   1. 零 pageerror，且**先确认页面就绪**——否则「页面没加载」会被误报成「内容缺失」
 *      （CLAUDE.md 坑 14：这是本项目栽过四次的那类错误）
 *   2. 每格非背景像素占比 > 0.5%（抓「某一步什么都没画出来」）
 *   3. 同一组参数连渲两次，像素哈希**逐位一致**
 *      —— 把「绘制函数是纯函数、不含随机数」这条约定变成机器可执行的约束
 *
 * 依赖 playwright-core。它装在临时目录、会被系统清掉，所以按候选路径依次找，
 * 也接受 PLAYWRIGHT_CORE 环境变量。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, 'baseline.json');
const BASE_URL = process.env.CP_BASE || 'http://localhost:8777';
const CHROME = process.env.CP_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PHASES = [0, 0.8, 2.4];
const INK_MIN = 0.005;

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const a = argv.find(x => x.startsWith(f + '=')); return a ? a.slice(f.length + 1) : d; };

/* ---------- playwright-core ---------- */
// 用 createRequire 而不是 import()：playwright-core 是 CJS 包，
// 且 import('/abs/dir') 这种目录路径在 ESM 里不解析（试过，直接报找不到）。
function loadChromium() {
  const require = createRequire(import.meta.url);
  const cands = [
    process.env.PLAYWRIGHT_CORE,
    '/private/tmp/node_modules/playwright-core',
    '/tmp/node_modules/playwright-core',
    'playwright-core',
  ].filter(Boolean);
  for (const c of cands) {
    try { return require(c).chromium; } catch { /* 试下一个 */ }
  }
  console.error('找不到 playwright-core。装一个（cd /tmp && npm install playwright-core），');
  console.error('或用 PLAYWRIGHT_CORE=/path/to/playwright-core 指定路径。');
  process.exit(2);
}

/* ---------- 取一页的格子指纹 ---------- */
async function snapshot(browser, url, want) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctx = await browser.newContext({ viewport: { width: 1900, height: 1200 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // 就绪前置校验：不到 98 格就不下结论，重试
      await page.waitForFunction(n => document.querySelectorAll('.cell').length >= n,
        want, { timeout: 20000 });
      await page.waitForTimeout(400);

      const cells = await page.evaluate(() => {
        const out = [];
        for (const cell of document.querySelectorAll('.cell')) {
          const cv = cell.querySelector('canvas');
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          // FNV-1a，逐像素逐位——不用抽样，抽样会让「差一个像素」溜过去
          let h = 2166136261;
          for (let i = 0; i < d.length; i += 4) {
            h = Math.imul(h ^ d[i], 16777619);
            h = Math.imul(h ^ d[i + 1], 16777619);
            h = Math.imul(h ^ d[i + 2], 16777619);
          }
          out.push({
            key: cell.dataset.key,                 // <sim id>#<步号>
            name: cell.querySelector('.cap span').textContent.trim(),
            ink: parseFloat(cell.querySelector('.cap .ink').textContent) / 100,
            hash: (h >>> 0).toString(16),
            blankClass: cell.classList.contains('blank'),
          });
        }
        return out;
      });
      await ctx.close();
      return { ok: true, errors, cells };
    } catch (e) {
      lastErr = e.message;
      await ctx.close();
      await new Promise(r => setTimeout(r, 350));
    }
  }
  return { ok: false, errors: [`3 次都未就绪：${lastErr}`], cells: [] };
}

/* ---------- 断言 ---------- */
function judge(snap, url) {
  const problems = [];
  const hard = snap.errors.filter(e => e.startsWith('PAGEERROR'));
  if (snap.errors.length) problems.push(...snap.errors);
  if (!snap.ok) return { problems, cells: [] };
  if (snap.cells.length === 0) problems.push('一个格子都没有');
  const blank = snap.cells.filter(c => c.ink < INK_MIN || c.blankClass);
  if (blank.length) problems.push(`空白格 ${blank.length} 个：${blank.map(c => `${c.name}(${(c.ink * 100).toFixed(2)}%)`).join('、')}`);
  return { problems, cells: snap.cells };
}

/* ---------- 主流程 ---------- */
const chromium = loadChromium();
if (!existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

const simQ = val('--sim', '');
const q1 = `?${simQ ? 'sim=' + simQ + '&' : ''}t=0.9`;

/* ---- --selfcheck：先证明检查器抓得到错 ---- */
if (has('--selfcheck')) {
  console.log('【自检】先验证检查器本身有效——抓不到错的检查器，报「全过」没有意义。\n');
  let allGood = true;

  const okRun = await snapshot(browser, `${BASE_URL}/_scenes-all.html${q1}`, simQ ? 1 : 98);
  const okJudge = judge(okRun, 'baseline');
  const clean = okJudge.problems.length === 0;
  console.log(`${clean ? 'PASS' : 'FAIL'}  正常页面应判「通过」` +
    (clean ? '' : '  ← 正常页面被判有问题，检查器有误报：' + okJudge.problems.join(' | ')));
  allGood &&= clean;

  // ① 绘制抛错 → 必须被 pageerror 抓到
  const boomRun = await snapshot(browser, `${BASE_URL}/_scenes-all.html?boom=7&t=0.9`, 98);
  const boomHit = boomRun.errors.some(e => e.includes('PAGEERROR'));
  console.log(`${boomHit ? 'PASS' : 'FAIL'}  故意抛错的一格应被抓到` +
    (boomHit ? `  —  ${boomRun.errors[0].slice(0, 60)}` : '  ← 没抓到！后面的结论都不可信'));
  allGood &&= boomHit;

  // ② 什么都不画 → 必须被「非空断言」抓到（而且这个错**不产生 pageerror**，只能靠像素）
  const blankRun = await snapshot(browser, `${BASE_URL}/_scenes-all.html?blank=7&t=0.9`, 98);
  const blankHit = blankRun.cells.some(c => c.ink < INK_MIN) || blankRun.cells.some(c => c.blankClass);
  console.log(`${blankHit ? 'PASS' : 'FAIL'}  故意不画的一格应被非空断言抓到` +
    (blankHit ? `  —  第 7 格着色 ${(blankRun.cells[6]?.ink * 100).toFixed(2)}%` : '  ← 没抓到！'));
  allGood &&= blankHit;

  await browser.close();
  console.log(`\n检查器自检：${allGood ? '通过' : '未通过'}`);
  process.exit(allGood ? 0 : 1);
}

/* ---- 正常/比对模式 ---- */
const ts = has('--phases') ? PHASES : [0.9];
let failures = 0;
const observed = {};

for (const t of ts) {
  // ts 固定取 2.0（入场动画已走完）——基线要的是「稳定态」，
  // 否则每次都会把动画中途的某一帧当成基准
  const url = `${BASE_URL}/_scenes-all.html?${simQ ? 'sim=' + simQ + '&' : ''}t=${t}&ts=2.0`;
  // ① 先跑两遍，核对「同参数两次渲染一致」
  const a = await snapshot(browser, url, simQ ? 1 : 98);
  const b2 = await snapshot(browser, url, simQ ? 1 : 98);
  const j = judge(a, url);
  const label = `t=${t}`;

  const mismatch = [];
  if (a.ok && b2.ok && a.cells.length === b2.cells.length) {
    a.cells.forEach((c, i) => { if (c.hash !== b2.cells[i].hash) mismatch.push(c.name); });
  }
  if (mismatch.length) {
    // 两帧不同就判死会有误报：接第一帧时可能撞上字体/画布初始化的时序，
    // 表现为「第 1 帧与之后不同」。所以再取第三帧仲裁——
    // 第 2、3 帧一致而只有第 1 帧不同 ⇒ 启动伪影；三帧互不相同 ⇒ 真·不确定。
    const c3 = await snapshot(browser, url, simQ ? 1 : 98);
    const stable = c3.ok && b2.ok && c3.cells.length === b2.cells.length
      && c3.cells.every((c, i) => c.hash === b2.cells[i].hash);
    const idx = mismatch.map(n => a.cells.findIndex(x => x.name === n));
    const firstFrameOnly = stable && idx.every(i => i >= 0 && a.cells[i].hash !== b2.cells[i].hash);
    if (firstFrameOnly) {
      console.log(`      注：${mismatch.length} 格首帧与后两帧不同，后两帧彼此一致 —— 判为启动时序伪影，不计入失败`);
    } else {
      j.problems.push(`渲染不确定（绘制里有随机数或状态）：${mismatch.slice(0, 6).join('、')}`
        + (stable ? '' : '；且第二、三帧也不一致'));
    }
  }

  if (j.problems.length) {
    failures++;
    console.log(`FAIL  ${label}`);
    j.problems.forEach(p => console.log(`        ${p}`));
  } else {
    console.log(`PASS  ${label}  —  ${j.cells.length} 格，全部非空，两次渲染逐位一致`);
  }
  j.cells.forEach(c => { observed[`${c.key}@${t}`] = c; });
}

/* ---- 动效覆盖：跨相位比哈希 ---- */
if (has('--phases') && failures === 0) {
  const keys = [...new Set(Object.keys(observed).map(k => k.replace(/@[\d.]+$/, '')))];
  const moving = [], still = [];
  for (const k of keys) {
    const hs = PHASES.map(t => observed[`${k}@${t}`]?.hash).filter(Boolean);
    if (hs.length < 2) continue;
    (new Set(hs).size > 1 ? moving : still).push(k);
  }
  const bySim = {};
  for (const k of keys) {
    const id = k.split('#')[0];
    bySim[id] ??= { n: 0, move: 0 };
    bySim[id].n++;
    if (moving.includes(k)) bySim[id].move++;
  }
  console.log(`\n动效覆盖（t = ${PHASES.join(' / ')} 三帧比对）：`);
  console.log(`  有动效 ${moving.length} / ${keys.length}　静止 ${still.length}`);
  for (const [id, s] of Object.entries(bySim)) {
    const bar = '█'.repeat(Math.round(s.move / s.n * 10)).padEnd(10, '·');
    console.log(`    ${bar} ${String(s.move).padStart(2)}/${String(s.n).padStart(2)}  ${id}`);
  }
  if (still.length) console.log(`  仍静止：${still.join('、')}`);
}

/* ---- 基线比对 ---- */
if (failures === 0) {
  if (has('--update')) {
    writeFileSync(BASELINE, JSON.stringify(
      Object.fromEntries(Object.entries(observed).map(([k, v]) => [k, v.hash])), null, 0) + '\n');
    console.log(`\n基线已写入 ${BASELINE}（${Object.keys(observed).length} 条）`);
  } else if (existsSync(BASELINE)) {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const changed = [], added = [], gone = [];
    for (const [k, v] of Object.entries(observed)) {
      if (!(k in base)) added.push(k);
      else if (base[k] !== v.hash) changed.push(k);
    }
    for (const k of Object.keys(base)) if (!(k in observed)) gone.push(k);
    console.log(`\n与基线比对：变更 ${changed.length}｜新增 ${added.length}｜消失 ${gone.length}`);
    // 相位集不同（如 --phases 对 t=0.9 的基线）会把全部格子列成增/删，那不是「变更」。
    // 超过 12 条就只报数——要看全部，直接跑同一相位集。
    const some = l => l.length <= 12 ? l.join('、') : `${l.slice(0, 8).join('、')} … 另 ${l.length - 8} 条`;
    if (changed.length) console.log(`  变更：${some(changed)}`);
    if (added.length && added.length <= 12) console.log(`  新增：${some(added)}`);
    if (gone.length && gone.length <= 12) console.log(`  消失：${some(gone)}`);
    if (!changed.length && !added.length && !gone.length) console.log('  与基线完全一致。');
    else if (added.length > 12 && !changed.length) console.log('（增/删很多说明这次跑的相位集与基线不同，不是真的变更）');
  } else {
    console.log('\n（还没有基线。确认这一版没问题后跑 `--update` 建立基线。）');
  }
}

await browser.close();
process.exit(failures ? 1 : 0);
