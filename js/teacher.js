/**
 * 教师端学情画像看板
 *
 * 数据来源：智雅平台导出的《历史会话详情》xlsx。
 * 不需要后端 —— 浏览器直接解析导出的表格，从中抽取智能体在每次对话结尾
 * 输出的【表征层次诊断】，聚合成班级画像。
 *
 * 这也意味着：诊断报告的格式就是数据 schema。改提示词的输出格式时，
 * 这里的解析规则要同步改。
 */

/* ============================================================
 * 一、解析
 * ============================================================ */

const TS_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(.+?)[：:]\s?([\s\S]*)$/;

/** 把一段会话详情文本拆成消息序列（智能体的长回复会跨多行，需合并） */
export function parseConversation(text) {
  const messages = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(TS_RE);
    if (m) {
      messages.push({ time: m[1], speaker: m[2].trim(), text: m[3] });
    } else if (messages.length && line.trim()) {
      messages[messages.length - 1].text += '\n' + line;
    }
  }
  return messages;
}

const MC_NAMES = {
  1: '宏观—微观错位', 2: '微观图像缺失', 3: '符号—意义脱节',
  4: '热力学—动力学混淆', 5: '强度量—容量量混淆', 6: '条件—标准混淆',
  7: '规则记忆—条件缺失', 8: '操作—原理割裂', 9: '平衡移动＝平衡常数改变',
  10: '统计概念混淆',
};
export const mcName = n => MC_NAMES[n] || `MC-${n}`;

/** 从智能体的消息中抽取诊断结论 */
export function extractDiagnosis(agentTexts) {
  const joined = agentTexts.join('\n');
  const layers = {};
  const re = /(宏观层|微观层|符号层)\s*[：:]\s*(已通|待通)/g;
  let m;
  while ((m = re.exec(joined)) !== null) {
    if (!(m[1] in layers)) layers[m[1]] = m[2] === '已通';
  }
  const pick = r => {
    const x = joined.match(r);
    if (!x) return null;
    // 只取到解释性破折号/句号为止，得到干净的名词短语
    return x[1].split(/[—–]{1,2}|[。；;]/)[0].replace(/[（(].*$/, '').trim() || null;
  };
  const mcRaw = joined.match(/MC[\s-]?(\d{1,2})/);
  const stuckRaw = pick(/卡在哪里\s*[：:]\s*([^\n·【]+)/);
  const stuck = stuckRaw && /宏观层|微观层|符号层/.test(stuckRaw)
    ? (stuckRaw.match(/宏观层|微观层|符号层/) || [])[0]
    : stuckRaw;
  return {
    hasDiagnosis: Object.keys(layers).length > 0,
    layers,
    mc: mcRaw ? parseInt(mcRaw[1], 10) : null,
    knowledge: pick(/涉及知识点\s*[：:]\s*([^\n·【]+)/),
    stuckAt: stuck,
  };
}

/** 从 SheetJS 读出的二维数组中定位列并解析全部会话 */
export function parseSheet(rows) {
  const headerIdx = rows.findIndex(r => r && r.some(c => String(c || '').includes('会话详情')));
  if (headerIdx < 0) throw new Error('未找到「会话详情」列，请确认导出的是智雅的《历史会话详情》表。');
  const header = rows[headerIdx].map(c => String(c || ''));
  const colDetail = header.findIndex(h => h.includes('会话详情'));
  const colVisitor = header.findIndex(h => h.includes('访客'));
  const colTime = header.findIndex(h => h.includes('创建时间'));

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[colDetail]) continue;
    const messages = parseConversation(r[colDetail]);
    if (!messages.length) continue;
    const agentTexts = messages.filter(x => x.speaker.includes('智能体')).map(x => x.text);
    const students = [...new Set(messages
      .map(x => x.speaker)
      .filter(s => !s.includes('智能体') && !s.includes('客户') && !s.includes('系统')))];
    out.push({
      rawVisitor: colVisitor >= 0 ? String(r[colVisitor] || '') : '',
      student: students[0] || '（未识别）',
      time: colTime >= 0 ? String(r[colTime] || '') : '',
      messages,
      agentTexts,
      rounds: Math.max(0, agentTexts.length - 1),   // 末条是总结，不计入追问轮次
      ...extractDiagnosis(agentTexts),
    });
  }
  return out;
}

/* ============================================================
 * 二、聚合
 * ============================================================ */

const LAYER_KEYS = ['宏观层', '微观层', '符号层'];

export function computeMetrics(convos) {
  const anon = new Map();
  let seq = 0;
  convos.forEach(c => {
    if (!anon.has(c.student)) anon.set(c.student, 'S' + String(++seq).padStart(2, '0'));
    c.sid = anon.get(c.student);
  });

  const done = convos.filter(c => c.hasDiagnosis);
  const layerStat = {};
  LAYER_KEYS.forEach(k => {
    const known = done.filter(c => k in c.layers);
    layerStat[k] = {
      total: known.length,
      pass: known.filter(c => c.layers[k]).length,
      rate: known.length ? known.filter(c => c.layers[k]).length / known.length : 0,
    };
  });

  const mcCount = {};
  done.forEach(c => { if (c.mc) mcCount[c.mc] = (mcCount[c.mc] || 0) + 1; });

  // 知识点 × 表征层：每格 = 该知识点下该层「待通」的对话数 / 总对话数
  const kpMap = new Map();
  done.forEach(c => {
    const kp = (c.knowledge || '未标注').replace(/[（(].*$/, '').trim().slice(0, 14);
    if (!kpMap.has(kp)) kpMap.set(kp, { kp, n: 0, weak: { 宏观层: 0, 微观层: 0, 符号层: 0 }, mc: {} });
    const e = kpMap.get(kp);
    e.n++;
    LAYER_KEYS.forEach(k => { if (k in c.layers && !c.layers[k]) e.weak[k]++; });
    if (c.mc) e.mc[c.mc] = (e.mc[c.mc] || 0) + 1;
  });

  const students = [...new Set(convos.map(c => c.sid))].map(sid => {
    const mine = convos.filter(c => c.sid === sid);
    const d = mine.filter(c => c.hasDiagnosis);
    const st = {};
    LAYER_KEYS.forEach(k => {
      const known = d.filter(c => k in c.layers);
      st[k] = known.length ? known.filter(c => c.layers[k]).length / known.length : null;
    });
    const mcs = d.map(c => c.mc).filter(Boolean);
    return {
      sid, n: mine.length, complete: d.length,
      layers: st,
      avgRounds: mine.length ? mine.reduce((a, c) => a + c.rounds, 0) / mine.length : 0,
      mc: mcs.length ? mode(mcs) : null,
    };
  }).sort((a, b) => a.sid.localeCompare(b.sid));

  const rounds = convos.map(c => c.rounds).filter(r => r > 0);
  return {
    convos, done, students,
    layerStat, mcCount, kpMap,
    nStudents: students.length,
    nConvos: convos.length,
    nComplete: done.length,
    avgRounds: rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : 0,
    selfSolved: done.filter(c => c.rounds <= 3 && LAYER_KEYS.every(k => c.layers[k] !== false)).length,
  };
}

function mode(arr) {
  const c = {};
  arr.forEach(v => c[v] = (c[v] || 0) + 1);
  return +Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

/* ============================================================
 * 三、渲染
 * ============================================================ */

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = v => (v * 100).toFixed(0) + '%';

const SECTIONS = [
  { id: 'sec-kpi', name: '总览' },
  { id: 'sec-layer', name: '表征层次' },
  { id: 'sec-mc', name: '迷思概念' },
  { id: 'sec-heat', name: '学情热力图' },
  { id: 'sec-stu', name: '学生明细' },
  { id: 'sec-advice', name: '教学建议' },
];

function buildRail() {
  const rail = document.getElementById('rail');
  rail.innerHTML = `<div class="rail-label">看板</div>` +
    SECTIONS.map(s => `<button class="nav-item" data-goto="${s.id}">
      <span class="nav-dot" style="--dot:var(--w-indigo)"></span><span>${s.name}</span></button>`).join('');
  rail.querySelectorAll('[data-goto]').forEach(b => {
    b.onclick = () => {
      const el = document.getElementById(b.dataset.goto);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      rail.querySelectorAll('.nav-item').forEach(x => x.setAttribute('aria-current', 'false'));
      b.setAttribute('aria-current', 'true');
    };
  });
  rail.querySelector('.nav-item').setAttribute('aria-current', 'true');
}

const section = (id, label, body) =>
  `<div class="panel" id="${id}"><div class="panel-label">${label}</div>${body}</div>`;

export function render(m, opts = {}) {
  const main = document.getElementById('main');
  buildRail();
  const heatColor = r => {
    // r = 待通比例，0 好 → 1 差
    if (r <= 0.001) return ['#1b2430', 'var(--faint)'];
    const stops = [[0.001, '#2a1d1d'], [0.34, '#6d3a2c'], [0.67, '#a8672f'], [1, '#d99a3a']];
    let bg = stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (r <= stops[i + 1][0]) {
        const t = (r - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        bg = mix(stops[i][1], stops[i + 1][1], t); break;
      }
    }
    return [bg, r > 0.5 ? '#12161b' : 'var(--text)'];
  };

  const weakLayer = LAYER_KEYS.reduce((a, b) => (m.layerStat[a].rate <= m.layerStat[b].rate ? a : b));
  const topMC = Object.entries(m.mcCount).sort((a, b) => b[1] - a[1]);
  const mcMax = topMC.length ? topMC[0][1] : 1;

  const html = [];

  /* ---------- 总览 ---------- */
  html.push(section('sec-kpi', '总览',
    `<div class="kpis">
      <div class="kpi"><div class="kpi-k">参与学生</div><div class="kpi-v">${m.nStudents}<small>人</small></div></div>
      <div class="kpi"><div class="kpi-k">对话总数</div><div class="kpi-v">${m.nConvos}<small>次</small></div>
        <div class="kpi-sub">完成诊断 ${m.nComplete} 次</div></div>
      <div class="kpi"><div class="kpi-k">人均对话</div>
        <div class="kpi-v">${m.nStudents ? (m.nConvos / m.nStudents).toFixed(1) : '—'}<small>次</small></div></div>
      <div class="kpi"><div class="kpi-k">平均追问轮次</div>
        <div class="kpi-v">${m.avgRounds.toFixed(1)}<small>轮</small></div>
        <div class="kpi-sub">上限 3 轮 + 讲解 + 验证</div></div>
      <div class="kpi"><div class="kpi-k">最薄弱表征层</div>
        <div class="kpi-v" style="font-size:19px;color:var(--w-amber)">${weakLayer}</div>
        <div class="kpi-sub">通过率 ${pct(m.layerStat[weakLayer].rate)}</div></div>
    </div>
    ${opts.isDemo ? '<div class="finding">当前显示的是<b>示例数据</b>，用于预览看板效果。导入真实会话记录后，所有图表会按实际数据重新计算。</div>' : ''}`));

  /* ---------- 表征层次 ---------- */
  const layerColor = { 宏观层: 'var(--w-amber)', 微观层: 'var(--w-teal)', 符号层: 'var(--w-indigo)' };
  html.push(section('sec-layer', '三重表征通过率',
    `<div class="layers">${LAYER_KEYS.map(k => {
      const s = m.layerStat[k];
      return `<div class="layer-card">
        <div class="layer-name"><span>${k}</span><span class="layer-pct" style="color:${layerColor[k]}">${pct(s.rate)}</span></div>
        <div class="layer-bar"><i style="width:${s.rate * 100}%;background:${layerColor[k]}"></i></div>
        <div class="layer-note">${s.pass} / ${s.total} 次对话中该层已通</div>
      </div>`;
    }).join('')}</div>
    <div class="finding">通过率最低的是 <b>${weakLayer}</b>。这说明学生的困难主要不在记不住结论，
      而在<b>现象、粒子、符号三层之间的转换</b>——这正是课堂讲解最难覆盖、也最需要个别化追问的地方。</div>`));

  /* ---------- 迷思概念 ---------- */
  html.push(section('sec-mc', '迷思概念排行（认知卡点分布）',
    topMC.length ? `<div class="bars">${topMC.map(([mc, n]) => `
      <div class="bar-row">
        <div class="bar-name"><b>MC-${mc}</b>${esc(mcName(+mc))}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(n / mcMax) * 100}%;background:linear-gradient(90deg,#a8672f,#e8a33d)"></div></div>
        <div class="bar-n">${n} 次</div>
      </div>`).join('')}</div>
      <div class="finding">排在前列的卡点应当在课堂上<b>集中处理</b>，而不是留给学生各自碰壁。
        注意：这些是<b>班级共性</b>，与个体差异无关——全班都卡的地方，说明讲法本身需要调整。</div>`
      : '<p style="color:var(--dim)">暂无带诊断结论的数据。</p>'));

  /* ---------- 热力图 ---------- */
  const kps = [...m.kpMap.values()].sort((a, b) => b.n - a.n);
  const heatBody = kps.length ? `
    <table class="heat">
      <thead><tr><th>知识点</th>${LAYER_KEYS.map(k => `<th class="col">${k}</th>`).join('')}<th class="col">对话数</th></tr></thead>
      <tbody>${kps.map(e => `<tr>
        <td class="kp" title="${esc(e.kp)}">${esc(e.kp)}</td>
        ${LAYER_KEYS.map(k => {
          const r = e.n ? e.weak[k] / e.n : 0;
          const [bg, fg] = heatColor(r);
          return `<td><div class="cell" style="background:${bg};color:${fg}" title="${e.weak[k]}/${e.n} 次该层待通">${e.n && e.weak[k] ? pct(r) : '—'}</div></td>`;
        }).join('')}
        <td class="n">${e.n}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="legend"><span>通过</span><span class="legend-bar"></span><span>待通比例高</span>
      <span style="margin-left:auto">格子内数字 = 该知识点下此层「待通」的对话占比</span></div>
    <div class="finding">一眼能看出<b>哪个知识点的哪一层</b>最成问题。例如某知识点符号层通红、微观层发暗，
      说明学生会算但不懂——讲课时就该补粒子图像，而不是再讲一遍公式。</div>`
    : '<p style="color:var(--dim)">暂无数据。需智能体在诊断结论中输出「涉及知识点」一行。</p>';
  html.push(section('sec-heat', '知识点 × 表征层 热力图', heatBody));

  /* ---------- 学生明细 ---------- */
  html.push(section('sec-stu', '学生明细',
    `<table class="stu-table">
      <thead><tr><th>编号</th><th>对话</th><th>完整诊断</th><th>平均轮次</th>
        <th>宏观层</th><th>微观层</th><th>符号层</th><th>主要卡点</th></tr></thead>
      <tbody>${m.students.map(s => `<tr>
        <td class="stu-id">${s.sid}</td>
        <td>${s.n}</td><td>${s.complete}</td><td>${s.avgRounds.toFixed(1)}</td>
        ${LAYER_KEYS.map(k => {
          const v = s.layers[k];
          if (v == null) return '<td><span class="pill">—</span></td>';
          return `<td><span class="pill ${v >= 0.5 ? 'on' : 'off'}">${v >= 0.5 ? '已通' : '待通'}</span></td>`;
        }).join('')}
        <td>${s.mc ? `<span class="pill mc">MC-${s.mc} ${esc(mcName(s.mc))}</span>` : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="finding">学生以<b>匿名编号</b>呈现，导出数据中不含姓名。编号可对照教师自留的名单使用。</div>`));

  /* ---------- 建议 ---------- */
  const advice = [];
  if (topMC.length) {
    advice.push(`<b>${mcName(+topMC[0][0])}</b>（MC-${topMC[0][0]}）是全班最高频的认知卡点，出现 ${topMC[0][1]} 次，建议用一整段时间集中处理。`);
  }
  const weakKp = kps.find(e => e.n >= 2);
  if (weakKp) {
    const worst = LAYER_KEYS.reduce((a, b) => (weakKp.weak[a] / weakKp.n >= weakKp.weak[b] / weakKp.n ? a : b));
    advice.push(`知识点「<b>${esc(weakKp.kp)}</b>」的<b>${worst}</b>问题最集中，讲评时建议从这一层切入。`);
  }
  advice.push(`班级整体最薄弱的是<b>${weakLayer}</b>，这与本智能体的诊断重点一致——建议把课堂时间更多放在「现象 → 粒子 → 符号」的转换训练上，而不是重复推导公式。`);
  if (m.avgRounds < 2) advice.push('平均追问轮次偏低，多数学生很快就答对了，可适当提高任务难度或增加变式题。');
  if (m.avgRounds > 3.5) advice.push('平均追问轮次偏高，说明多数学生需要完整讲解才能通过，建议课前先补充相关基础。');
  if (m.nConvos && m.nComplete / m.nConvos < 0.7) advice.push(`有 ${m.nConvos - m.nComplete} 次对话未完成诊断（学生中途退出），建议检查任务难度或提醒学生完成整个流程。`);

  html.push(section('sec-advice', '教学建议',
    `<div class="advice">${advice.map((a, i) => `<div class="advice-item"><span class="advice-n">0${i + 1}</span><span>${a}</span></div>`).join('')}</div>`));

  main.innerHTML = html.join('');
}

function mix(c1, c2, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/* ============================================================
 * 四、空状态与导入
 * ============================================================ */

function renderEmpty(msg) {
  buildRail();
  document.getElementById('main').innerHTML = `
    <div class="empty" id="drop">
      <div class="empty-icon"></div>
      <h2>导入智雅导出的会话记录</h2>
      <p>${msg || '把《历史会话详情》表格拖到这里，或点击右上角「导入会话记录」。<br>浏览器本地解析，数据不会上传到任何服务器。'}</p>
      <p style="margin-top:14px">
        <button class="btn primary" id="btn-demo2">查看示例数据</button>
      </p>
    </div>`;
  document.getElementById('btn-demo2').onclick = loadDemo;
  const drop = document.getElementById('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.remove('drag');
  }));
  drop.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
}

function setStatus(text, cls) {
  const el = document.getElementById('import-status');
  el.textContent = text;
  el.className = 'import-status' + (cls ? ' ' + cls : '');
}

async function handleFile(file) {
  setStatus('解析中…');
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    const convos = parseSheet(rows);
    if (!convos.length) throw new Error('表中没有可解析的会话记录。');
    setStatus(`已导入 ${convos.length} 条会话`, 'ok');
    render(computeMetrics(convos));
  } catch (e) {
    console.error(e);
    setStatus('解析失败', 'bad');
    renderEmpty(`解析失败：${esc(e.message)}<br>请确认导入的是智雅后台导出的《历史会话详情》表格。`);
  }
}

/* ============================================================
 * 五、示例数据（走同一条解析路径，便于预览）
 * ============================================================ */

function syntheticConvo(i) {
  const kps = ['缓冲溶液原理', '分步沉淀规律', '条件稳定常数', '溶度积与溶解度', '精密度与准确度', '有效数字', '酸碱指示剂选择', '能斯特方程'];
  const mcs = [7, 2, 6, 3, 10, 5, 1, 3, 7, 9];
  const names = ['孙', '李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周'];
  const kp = kps[i % kps.length];
  const mc = mcs[i % mcs.length];
  const rounds = 1 + (i % 4);
  const weak = ['微观层', '符号层', '宏观层'][i % 3];
  const L = k => (k === weak ? (i % 3 === 0 ? '待通' : '已通') : (i % 7 === 0 ? '待通' : '已通'));

  const lines = [`2026-09-17 1${i % 10}:0${i % 6}:00 客户155936059(${names[i % 10]}某)与机器人建立会话`];
  for (let r = 0; r < rounds; r++) {
    lines.push(`2026-09-17 10:${String(r * 2 + 1).padStart(2, '0')}:00 ${names[i % 10]}某：我想问一下${kp}的问题`);
    lines.push(`2026-09-17 10:${String(r * 2 + 1).padStart(2, '0')}:30 智能体：那你先说说看，这一步你是怎么想的？`);
  }
  lines.push(`2026-09-17 10:2${i % 10}:00 智能体：
【本次探讨回顾】
· 你的问题：关于${kp}的困惑
· 涉及知识点：${kp}
· 卡在哪里：${weak}
· 认知卡点类型：MC-${mc} ${mcName(mc)}
· 探讨过程：一开始没有意识到关键条件，经追问后修正。
【完整结论】
（此处为完整推理路径）
【表征层次诊断】
· 宏观层：${L('宏观层')} —— 能描述现象
· 微观层：${L('微观层')} —— 粒子过程理解情况
· 符号层：${L('符号层')} —— 符号表达情况
· 建议下一步：去工作台验证一次`);
  return lines;
}

function loadDemo() {
  const rows = [['会话ID', '访客', '智能体', '来源', '会话创建时间', '会话详情']];
  for (let i = 0; i < 26; i++) {
    rows.push(['id' + i, ['孙毅飞', '李同学', '王同学'][i % 3], 'bot', 'PC端', '2026-09-17 10:00:00',
      syntheticConvo(i).join('\n')]);
  }
  const convos = parseSheet(rows);
  setStatus('示例数据', 'ok');
  render(computeMetrics(convos), { isDemo: true });
}

/* ============================================================
 * 六、启动
 * ============================================================ */

// 浏览器环境才绑定事件与首屏渲染；这样本模块也能在 node 下被单独引用来验算解析逻辑
if (typeof document !== 'undefined') {
  document.getElementById('file-input').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) handleFile(f);
    e.target.value = '';
  });
  document.getElementById('btn-demo').onclick = loadDemo;

  // 整页拖放
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  // ?demo=1 直接载入示例数据，便于演示与截图
  if (new URLSearchParams(location.search).has('demo')) loadDemo();
  else renderEmpty();
}
