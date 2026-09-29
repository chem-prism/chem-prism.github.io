/**
 * 工作台主程序
 *
 * 职责：模拟器注册与切换、URL 参数解析（任务模式）、实验记录生成与复制。
 *
 * 任务模式 URL 约定（供智雅智能体在对话中派发）：
 *   https://<站点>/?sim=titration&c=0.001&pka=4.74&task=把浓度调到0.001，看突跃怎么变
 *   —— sim 指定模拟器，其余键值作为该模拟器的初始参数，task 为任务说明。
 */

import { clearColorCache } from './chart.js';
import * as titration from './sims/titration.js';
import * as distribution from './sims/distribution.js';
import * as precipitate from './sims/precipitate.js';
import * as edta from './sims/edta.js';
import * as precision from './sims/precision.js';
import * as redox from './sims/redox.js';
import * as spectrophotometry from './sims/spectrophotometry.js';
import * as complexometry from './sims/complexometry.js';
import * as propagation from './sims/propagation.js';
import * as potentiometry from './sims/potentiometry.js';
import * as chromatography from './sims/chromatography.js';
import * as extraction from './sims/extraction.js';
import * as ir from './sims/ir.js';
import * as molecule3d from './sims/molecule3d.js';
import * as aas from './sims/aas.js';
import * as gravimetry from './sims/gravimetry.js';
import * as qcchart from './sims/qcchart.js';
import * as ms from './sims/ms.js';
import * as mohrSalt from './sims/mohr-salt.js';
import * as magnesiumMolar from './sims/magnesium-molar.js';
import * as kinetics from './sims/kinetics.js';
import * as fe2Assay from './sims/fe2-assay.js';
import * as titrationPractice from './sims/titration-practice.js';
import * as waterHardness from './sims/water-hardness.js';
import * as phAcetic from './sims/ph-acetic.js';
import * as fe3Spec from './sims/fe3-spec.js';
import * as cyanotype from './sims/cyanotype.js';
import * as complexChem from './sims/complex-chem.js';
import { GROUPS, hostsOf, isCore } from './sims/groups.js';
// 命名空间导入，**不要写成具名导入**：浏览器若拿着旧版 lab-shell.js（没有这个导出），
// `import { SHELL_BUILD }` 会在链接阶段抛「does not provide an export named」，
// 整页白屏——那比「少一个标签」严重得多。命名空间导入拿不到就是 undefined，不会炸。
import * as labShell from './sims/lab-shell.js';

/* 建站版本。静态站点没有构建步骤，浏览器里可能新旧模块混着跑；
   这行把 app.js 与 lab-shell.js 各自的版本一起打到控制台，
   对不上就说明浏览器拿着旧缓存——硬刷新（⌘⇧R）即可。
   2026-09-29 在 Edge 上真踩过一次：导航是新的，实验页却少了「拓展模块」标签。 */
const BUILD = '2026-09-29b';

// 顺序 = 左栏分组内、以及「其他仪器方法」组内的显示顺序。
// 左栏一级导航由 groups.js 的 GROUPS 给出（10 个课程实验），本数组只管模块注册。
const SIMS = [
  titration, distribution, edta, complexometry, redox, precipitate,
  potentiometry, spectrophotometry, ir, aas, ms,
  chromatography, extraction, gravimetry, molecule3d,
  qcchart, precision, propagation, mohrSalt,
  magnesiumMolar, kinetics, fe2Assay, titrationPractice, waterHardness, phAcetic, fe3Spec,
  cyanotype, complexChem,
];
const byId = id => SIMS.find(s => s.meta.id === id) || SIMS[0];

/* --- 分组自检（只在控制台，不打断页面） ---
 * byId 找不到时会静默回落到 titration，分组表里若写错一个 id，
 * 左栏就会悄悄多出一个「酸碱滴定曲线」而没人发现。所以导航走严格查找。 */
function navSim(id) {
  const s = SIMS.find(x => x.meta.id === id);
  if (!s) console.error(`分组表里的 id 不存在：${id}（该分组项已跳过）`);
  return s;
}
function checkGroups() {
  const covered = new Set(GROUPS.flatMap(g => [...(g.core ? [g.core] : []), ...g.ext]));
  const orphan = SIMS.map(s => s.meta.id).filter(id => !covered.has(id));
  if (orphan.length) console.error('这些模拟器没有出现在任何分组里，学生点不到：', orphan);
  // 左栏的可点条目 = 10 个实验 + 「其他仪器方法」那 3 个。
  // 注意别把 .nav-group-label（那是个 div，不是 .nav-item）也算进来——算错过一次，
  // 结果是每个页面都往控制台吐一条假的「实为 14 项」。
  const railItems = GROUPS.reduce((n, g) => n + (g.core ? 1 : g.ext.length), 0);
  if (railItems !== 13) console.error(`左栏应有 10 个实验 + 3 个其他仪器方法 = 13 项，实为 ${railItems} 项`);
}
checkGroups();
{
  const shell = labShell.SHELL_BUILD;   // 旧版 lab-shell 里没有这个导出，会是 undefined
  const stale = shell == null;
  console.log(`化学三棱镜 · 工作台 build ${BUILD}｜lab-shell ${shell ?? '缺失（旧版缓存）'}`
    + (stale ? '　⚠️ 浏览器拿着旧版 lab-shell.js：实验页会少「拓展模块」标签，请硬刷新（⌘⇧R）' : ''));
}

const rail = document.getElementById('rail');
const main = document.getElementById('main');
const btnReset = document.getElementById('btn-reset');

let current = null;      // 当前模拟器实例
let currentMeta = null;
let taskText = '';
let lastQuery = '';      // 记录初始参数，用于「重置」

/* ---------- URL 参数 ---------- */
function readParams() {
  const q = new URLSearchParams(location.search);
  const sim = q.get('sim') || SIMS[0].meta.id;
  const task = q.get('task') || '';
  const opts = {};
  q.forEach((v, k) => { if (k !== 'sim' && k !== 'task') opts[k] = v; });
  return { sim, task, opts };
}

/* ---------- 导航 ----------
 * 左栏只有 10 个课程实验的名字（外加「其他仪器方法」下 3 个不属于任何实验的模块）。
 * 拓展模块**不进左栏**——它们只在实验页的第三个标签里，和教学模式、练习模式并列。
 * 所以左栏不显示实验编号、不显示拓展模块，点一个实验就是进那一个实验。
 */
function navButton(sim, activeId, sub) {
  // 注意：必须用 className，Object.assign 设的 `class` 只是 JS 属性，不会写到 DOM 上
  const btn = document.createElement('button');
  btn.className = sub ? 'nav-item nav-sub' : 'nav-item';
  btn.setAttribute('aria-current', String(sim.meta.id === activeId));
  btn.style.setProperty('--dot', `var(${sim.meta.accent})`);
  btn.innerHTML = `<span class="nav-dot"></span><span>${sim.meta.name}</span>`;
  btn.onclick = () => navigate(sim.meta.id, {});
  return btn;
}

function buildNav(activeId) {
  const label = document.createElement('div');
  label.className = 'rail-label';
  label.textContent = '课程实验';

  const nodes = [];
  for (const g of GROUPS) {
    if (g.core) {
      const s = navSim(g.core);
      if (s) nodes.push(navButton(s, activeId));
      continue;
    }
    // 没有对应实验的一组（其他仪器方法）：小标题 + 它的模块，缩进列在最后
    const t = document.createElement('div');
    t.className = 'nav-group-label';
    t.textContent = g.title;
    nodes.push(t,
      ...g.ext.map(navSim).filter(Boolean).map(s => navButton(s, activeId, true)));
  }
  rail.replaceChildren(label, ...nodes);
}

/* ---------- 归属提示 ----------
 * 智能体派的是参数型链接（?sim=titration）时，左栏 10 个实验都不会高亮——
 * 学生不知道这个页面从哪来。顶部给一条提示，说明它是哪个（哪几个）实验的拓展模块。
 * 课程实验自己的页面不需要这条。
 */
function hostHint(activeId) {
  const hosts = hostsOf(activeId);
  if (!hosts.length) return null;
  const box = document.createElement('div');
  box.className = 'host-hint rise rise-1';
  const names = hosts.map(id => byId(id).meta.name);
  box.innerHTML = `<span class="host-tag">拓展模块</span>`
    + `<span>这个模拟器挂在 ${names.map(n => `<b>${n}</b>`).join('、')} 下</span>`;
  const row = document.createElement('span');
  row.className = 'host-actions';
  hosts.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = 'host-link';
    b.textContent = `去「${names[i]}」`;
    b.onclick = () => navigate(id, {});
    row.append(b);
  });
  box.append(row);
  return box;
}

/* ---------- 参数持久化 ----------
 * 智雅的历史消息会反复重载 iframe（平台手册明确提到），若不保存，
 * 学生滚动一下对话就会丢掉刚调好的参数。
 *
 * 难点在于区分两种情况：
 *   · 重载        —— URL 参数没变，应恢复学生调过的设置
 *   · 派新任务    —— URL 参数变了，应以 URL 为准
 * 因此存档里一并记下「当时 URL 上的参数」，重载时比对即可分辨。
 */
const STORE = 'cp:params:';
const optsKey = o => JSON.stringify(Object.entries(o || {}).sort());

function readSaved(simId) {
  try { return JSON.parse(localStorage.getItem(STORE + simId) || 'null'); } catch { return null; }
}
function saveParams(simId, urlOpts, opts) {
  try {
    localStorage.setItem(STORE + simId, JSON.stringify({ url: optsKey(urlOpts), opts }));
  } catch { /* 隐私模式等，忽略 */ }
}
function clearSaved(simId) {
  try { localStorage.removeItem(STORE + simId); } catch { /* 忽略 */ }
}
let currentUrlOpts = {};
function persist() {
  if (current && current.params) saveParams(currentMeta.id, currentUrlOpts, current.params());
}

/* ---------- 切换模拟器 ---------- */
function navigate(id, opts, task) {
  // 上一个模拟器若开了动画循环（粒子、滴定台），切走时先停掉
  if (current && current.stop) { try { current.stop(); } catch { /* 忽略 */ } }

  const sim = byId(id);
  currentMeta = sim.meta;
  taskText = task !== undefined ? task : '';

  const hasUrlOpts = opts && Object.keys(opts).length > 0;
  const saved = readSaved(sim.meta.id);

  if (!hasUrlOpts) {
    // 无 URL 参数：直接用存档（学生自己在导航里切来切去的情况）
    if (saved && saved.opts && Object.keys(saved.opts).length) opts = saved.opts;
    currentUrlOpts = {};
  } else if (saved && saved.opts && saved.url === optsKey(opts)) {
    // 有 URL 参数且与存档记录的一致 —— 说明是同一次任务的 iframe 重载，恢复学生调过的值
    currentUrlOpts = { ...opts };
    opts = saved.opts;
  } else {
    // URL 参数与存档不同 —— 是智能体派来的新任务，以 URL 为准
    currentUrlOpts = opts;
  }

  document.documentElement.style.setProperty('--accent', `var(${sim.meta.accent})`);
  clearColorCache();   // --accent 变了，缓存的色值必须失效
  document.title = `${sim.meta.name} · 化学三棱镜`;
  buildNav(sim.meta.id);

  main.replaceChildren();
  const heads = document.createElement('div');
  heads.className = 'sim-head rise';
  heads.innerHTML = `
    <h1 class="sim-title">${sim.meta.name}${isCore(sim.meta.id) ? '' : `<span class="wave">${sim.meta.wave}</span>`}</h1>
    <p class="sim-desc">${sim.meta.desc}</p>`;
  main.append(heads);
  const hint = hostHint(sim.meta.id);
  if (hint) main.append(hint);

  if (taskText) {
    const t = document.createElement('div');
    t.className = 'task rise rise-1';
    t.innerHTML = `<span class="task-tag">任务</span><span class="task-text">${escapeHtml(taskText)}</span>`;
    main.append(t);
  }

  const host = document.createElement('div');
  host.className = 'rise rise-2';
  main.append(host);

  current = sim.mount(host, opts || {});

  main.append(buildRecordPanel());
  refreshRecord();     // 挂载时先填一次，否则记录区是空的
  persist();           // 记录初始状态，使 iframe 重载时能判断该恢复还是该用新任务

  lastQuery = new URLSearchParams({ sim: sim.meta.id, ...(opts || {}) }).toString();
  const url = new URL(location.href);
  url.search = lastQuery + (taskText ? `&task=${encodeURIComponent(taskText)}` : '');
  history.replaceState(null, '', url);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 实验记录 ---------- */
function buildRecordPanel() {
  const p = document.createElement('div');
  p.className = 'panel rise rise-3';
  p.style.marginTop = '18px';
  p.innerHTML = `
    <div class="panel-label">实验记录</div>
    <div class="record-text" id="rec-text"></div>
    <div style="margin-top:12px">
      <div class="ctl-name" style="margin-bottom:5px">我的结论（填完后复制，粘回对话）</div>
      <textarea id="rec-note" placeholder="写下你观察到的变化和结论。例如：某个量随着另一个量如何变化、在什么位置出现了转折、和原来的预想是否一致。"></textarea>
    </div>
    <div class="btn-row" style="margin-top:11px">
      <button class="btn primary" id="rec-copy">复制实验记录</button>
      <span id="rec-hint" style="font-size:12px;color:var(--faint)"></span>
    </div>`;
  return p;
}

function recordBody() {
  if (!current || !current.record) return '';
  const r = current.record();
  return [
    `【实验记录】${r.sim}`,
    `参数：${r.params.join('；')}`,
    `读数：${r.readings.join('；')}`,
  ].join('\n');
}

function refreshRecord() {
  const el = document.getElementById('rec-text');
  if (!el) return;
  const note = document.getElementById('rec-note');
  const saved = note ? note.value : '';
  el.innerHTML = highlight(recordBody() + (saved ? `\n我的结论：${saved}` : ''));
}

function highlight(t) {
  return escapeHtml(t)
    .replace(/【(.+?)】/g, '<span class="hl">【$1】</span>')
    .replace(/^(参数：|读数：|我的结论：)/gm, '<span class="hl">$1</span>');
}

async function copyRecord() {
  const note = document.getElementById('rec-note');
  const text = recordBody() + (note && note.value.trim() ? `\n我的结论：${note.value.trim()}` : '');
  const hint = document.getElementById('rec-hint');
  try {
    await navigator.clipboard.writeText(text);
    hint.textContent = '已复制，回到对话粘贴即可';
    hint.style.color = 'var(--w-green)';
  } catch {
    // 剪贴板不可用时的兜底：选中文本
    const r = document.createRange();
    const el = document.getElementById('rec-text');
    r.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges(); sel.addRange(r);
    hint.textContent = '请按 ⌘C / Ctrl+C 复制';
    hint.style.color = 'var(--w-amber)';
  }
  setTimeout(() => { hint.textContent = ''; }, 4000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- 事件（只绑定一次，避免切换模拟器时重复叠加） ---------- */
main.addEventListener('click', e => {
  if (e.target.id === 'rec-copy') copyRecord();
});
main.addEventListener('input', () => {
  persist();          // 参数变动即时存档，抵御 iframe 重载
  refreshRecord();
});
main.addEventListener('change', () => { persist(); refreshRecord(); });
// Process simulators also change state through buttons, not only form inputs.
main.addEventListener('sim-state-change', () => {
  if (!current) return;
  const opts = current.params();
  const url = new URL(location.href);
  url.search = new URLSearchParams({
    sim: currentMeta.id, ...opts, ...(taskText ? { task: taskText } : {}),
  }).toString();
  currentUrlOpts = opts;
  history.replaceState(null, '', url);
  persist();
  refreshRecord();
});
btnReset.onclick = () => {
  clearSaved(currentMeta.id);
  navigate(currentMeta.id, {}, taskText);
};

/* ---------- 启动 ---------- */
const { sim, task, opts } = readParams();
navigate(sim, opts, task);
