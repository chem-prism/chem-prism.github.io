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

// 顺序 = 左栏显示顺序，按分析化学的知识脉络编排：
//   四大滴定 → 电化学 → 光谱 → 色谱与分离 → 数据处理
const SIMS = [
  titration, distribution, edta, complexometry, redox, precipitate,
  potentiometry, spectrophotometry, ir, aas, ms,
  chromatography, extraction, gravimetry, molecule3d,
  qcchart, precision, propagation,
];
const byId = id => SIMS.find(s => s.meta.id === id) || SIMS[0];

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

/* ---------- 导航 ---------- */
function buildNav(activeId) {
  // 注意：必须用 className，Object.assign 设的 `class` 只是 JS 属性，不会写到 DOM 上
  const label = document.createElement('div');
  label.className = 'rail-label';
  label.textContent = '模拟器';
  rail.replaceChildren(
    label,
    ...SIMS.map(s => {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.setAttribute('aria-current', String(s.meta.id === activeId));
      btn.style.setProperty('--dot', `var(${s.meta.accent})`);
      btn.innerHTML = `<span class="nav-dot"></span><span>${s.meta.name}</span>`;
      btn.onclick = () => navigate(s.meta.id, {});
      return btn;
    })
  );
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
    opts = saved.opts;
    currentUrlOpts = opts;
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
    <h1 class="sim-title">${sim.meta.name}<span class="wave">${sim.meta.wave}</span></h1>
    <p class="sim-desc">${sim.meta.desc}</p>`;
  main.append(heads);

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
btnReset.onclick = () => {
  clearSaved(currentMeta.id);
  navigate(currentMeta.id, {}, taskText);
};

/* ---------- 启动 ---------- */
const { sim, task, opts } = readParams();
navigate(sim, opts, task);
