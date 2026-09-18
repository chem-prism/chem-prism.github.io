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

/**
 * 统计真正的「追问」条数（只算追问阶段的提问）。
 * 排除四类智能体消息，它们不是追问：
 *   · 空消息 —— 嵌入节点（工作台）的内容不写入导出，会留下空行
 *   · 讲解消息 —— 含「最后一步你来」或【完整结论】
 *   · 总结消息 —— 含【本次探讨回顾】或【表征层次诊断】
 *   · 验证题 —— 属于验证阶段，含「变式题」
 */
const NON_QUESTION = /【本次探讨回顾】|【表征层次诊断】|【完整结论】|最后一步你来|变式题/;
function countRounds(agentTexts) {
  return agentTexts.filter(t => {
    const s = String(t).trim();
    return s.length > 0 && !NON_QUESTION.test(s);
  }).length;
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
  const LAYER_ALT = /(宏观层|微观层|符号层)/;
  const stuckRaw = pick(/卡在哪里\s*[：:]\s*([^\n·【]+)/);
  // 提示词要求只写层名，但模型偶尔会写成句子。若一句话里出现多个层名，
  // 取紧跟在「卡在」后面的那个——那才是真正卡住的一层。
  let stuck = stuckRaw;
  if (stuckRaw) {
    const after = stuckRaw.match(new RegExp('卡在\\s*' + LAYER_ALT.source));
    const m = after || stuckRaw.match(LAYER_ALT);
    stuck = m ? m[1] : stuckRaw;
  }
  return {
    hasDiagnosis: Object.keys(layers).length > 0,
    layers,
    mc: mcRaw ? parseInt(mcRaw[1], 10) : null,
    knowledge: pick(/涉及知识点\s*[：:]\s*([^\n·【]+)/),
    stuckAt: stuck,
  };
}

/**
 * 抽取批改技能输出的结构化块。
 *
 * 批改类技能（作业批改 / 实验报告批改）在班级汇总之后会输出：
 *   【批改数据】
 *   张三｜作业｜分步沉淀规律｜符号层｜MC-7｜错
 * 一行一名学生。这段是给程序读的，与诊断对话产出的是同一张画像的不同来源。
 */
const GRADING_MARK = '【批改数据】';
export function parseGradingBlock(text) {
  const i = String(text).indexOf(GRADING_MARK);
  if (i < 0) return null;
  const out = [];
  for (const raw of String(text).slice(i + GRADING_MARK.length).split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('【')) break;                       // 到下一个块为止
    const parts = t.split(/[｜|]/).map(s => s.trim());
    if (parts.length < 3) continue;
    const [student, source, topic, layer, mc, result] = parts;
    if (!student || /^[-—\s]*$/.test(student)) continue;  // 跳过分隔行
    const mcNum = (mc || '').match(/MC[\s-]?(\d{1,2})/);
    out.push({
      student,
      source: source || '作业',
      topic: topic || '未标注',
      layer: layer && /层/.test(layer) ? layer : null,
      mc: mcNum ? parseInt(mcNum[1], 10) : null,
      result: result || '',
    });
  }
  return out.length ? out : null;
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
    // 批改类会话：正文里带【批改数据】块。这类会话的「访客」是教师，不是学生，
    // 真正的主体是块里那一行行学生，所以单独抽出来、不要把教师当学生统计。
    const gradings = agentTexts
      .map(parseGradingBlock)
      .find(Boolean) || null;

    out.push({
      rawVisitor: colVisitor >= 0 ? String(r[colVisitor] || '') : '',
      student: students[0] || '（未识别）',
      time: colTime >= 0 ? String(r[colTime] || '') : '',
      messages,
      agentTexts,
      gradings,
      isGrading: Boolean(gradings),
      rounds: countRounds(agentTexts),
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
  const anonId = name => {
    if (!anon.has(name)) anon.set(name, 'S' + String(++seq).padStart(2, '0'));
    return anon.get(name);
  };

  // 批改类会话的「访客」是教师。若把它当学生统计，教师会混进学生名单里——
  // 真正的主体是【批改数据】块里那一行行学生。
  const dialogConvos = convos.filter(c => !c.isGrading);
  dialogConvos.forEach(c => { c.sid = anonId(c.student); });

  // 把批改块里的每一行抽成独立记录，并匿名化
  const gradings = [];
  convos.forEach(c => {
    if (!c.gradings) return;
    c.gradings.forEach(g => gradings.push({ ...g, sid: anonId(g.student) }));
  });

  const done = dialogConvos.filter(c => c.hasDiagnosis);
  const layerStat = {};
  LAYER_KEYS.forEach(k => {
    const known = done.filter(c => k in c.layers);
    layerStat[k] = {
      total: known.length,
      pass: known.filter(c => c.layers[k]).length,
      rate: known.length ? known.filter(c => c.layers[k]).length / known.length : 0,
    };
  });

  // —— 以下四组统计都同时吃两类数据：诊断对话 + 批改记录 ——

  const mcCount = {};
  done.forEach(c => { if (c.mc) mcCount[c.mc] = (mcCount[c.mc] || 0) + 1; });
  gradings.forEach(g => { if (g.mc) mcCount[g.mc] = (mcCount[g.mc] || 0) + 1; });

  // 「初始卡点」分布 —— 比结束状态有教学价值得多。
  // 结束状态几乎总是三层全通（诊断报告写的是结论），用它做统计等于一片绿。
  const stuckCount = { 宏观层: 0, 微观层: 0, 符号层: 0, 未定位: 0 };
  done.forEach(c => { if (c.stuckAt) stuckCount[c.stuckAt] = (stuckCount[c.stuckAt] || 0) + 1; });
  gradings.forEach(g => {
    const k = g.layer && g.layer in stuckCount ? g.layer : '未定位';
    stuckCount[k]++;
  });

  // 知识点 × 卡点层
  const kpMap = new Map();
  const addKp = (kpRaw, layer, mc) => {
    const kp = String(kpRaw || '未标注').replace(/[（(].*$/, '').trim().slice(0, 14) || '未标注';
    if (!kpMap.has(kp)) kpMap.set(kp, { kp, n: 0, stuck: { 宏观层: 0, 微观层: 0, 符号层: 0 }, mc: {} });
    const e = kpMap.get(kp);
    e.n++;
    if (layer && layer in e.stuck) e.stuck[layer]++;
    if (mc) e.mc[mc] = (e.mc[mc] || 0) + 1;
  };
  done.forEach(c => addKp(c.knowledge, c.stuckAt, c.mc));
  gradings.forEach(g => addKp(g.topic, g.layer, g.mc));

  // 学生明细：诊断对话与批改记录都算这个学生的学习痕迹
  const allSids = new Set([...dialogConvos.map(c => c.sid), ...gradings.map(g => g.sid)]);
  const students = [...allSids].map(sid => {
    const mine = dialogConvos.filter(c => c.sid === sid);
    const d = mine.filter(c => c.hasDiagnosis);
    const gs = gradings.filter(g => g.sid === sid);
    const st = {};
    LAYER_KEYS.forEach(k => {
      const known = d.filter(c => k in c.layers);
      st[k] = known.length ? known.filter(c => c.layers[k]).length / known.length : null;
    });
    const mcs = [...d.map(c => c.mc), ...gs.map(g => g.mc)].filter(Boolean);
    const stucks = [...d.map(c => c.stuckAt), ...gs.map(g => g.layer)]
      .filter(x => x && x !== '未定位');
    return {
      sid, n: mine.length, complete: d.length, graded: gs.length,
      layers: st,
      stuck: stucks.length ? mode(stucks) : null,
      avgRounds: mine.length ? mine.reduce((a, c) => a + c.rounds, 0) / mine.length : 0,
      mc: mcs.length ? +mode(mcs) : null,   // MC 编码需要数字，层名保持字符串
    };
  }).sort((a, b) => a.sid.localeCompare(b.sid));

  const rounds = dialogConvos.map(c => c.rounds).filter(r => r > 0);
  return {
    convos, done, students, gradings,
    layerStat, mcCount, kpMap, stuckCount,
    nStudents: students.length,
    nConvos: dialogConvos.length,
    nGradings: gradings.length,
    nGradingSessions: convos.filter(c => c.isGrading).length,
    nComplete: done.length,
    avgRounds: rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : 0,
    selfSolved: done.filter(c => c.rounds <= 3 && LAYER_KEYS.every(k => c.layers[k] !== false)).length,
  };
}

/** 众数。返回原始值，不做类型转换——调用方按需转换（层名是字符串，MC 编码是数字）。 */
function mode(arr) {
  const c = {};
  arr.forEach(v => c[v] = (c[v] || 0) + 1);
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

/* ============================================================
 * 三、渲染
 * ============================================================ */

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = v => (v * 100).toFixed(0) + '%';

const SECTIONS = [
  { id: 'sec-kpi', name: '总览' },
  { id: 'sec-layer', name: '初始卡点' },
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

  const stuckList = LAYER_KEYS.map(k => [k, m.stuckCount[k] || 0]);
  const topStuck = stuckList.reduce((a, b) => (b[1] > a[1] ? b : a));
  const totalStuck = stuckList.reduce((s, e) => s + e[1], 0);
  const topMC = Object.entries(m.mcCount).sort((a, b) => b[1] - a[1]);
  const mcMax = topMC.length ? topMC[0][1] : 1;

  const html = [];

  /* ---------- 总览 ---------- */
  html.push(section('sec-kpi', '总览',
    `<div class="kpis">
      <div class="kpi"><div class="kpi-k">参与学生</div><div class="kpi-v">${m.nStudents}<small>人</small></div>
        <div class="kpi-sub">含批改记录中的学生</div></div>
      <div class="kpi"><div class="kpi-k">诊断对话</div><div class="kpi-v">${m.nConvos}<small>次</small></div>
        <div class="kpi-sub">完成诊断 ${m.nComplete} 次</div></div>
      <div class="kpi"><div class="kpi-k">批改记录</div><div class="kpi-v">${m.nGradings}<small>条</small></div>
        <div class="kpi-sub">${m.nGradingSessions ? `来自 ${m.nGradingSessions} 次批改` : '尚未导入批改数据'}</div></div>
      <div class="kpi"><div class="kpi-k">平均追问轮次</div>
        <div class="kpi-v">${m.avgRounds.toFixed(1)}<small>轮</small></div>
        <div class="kpi-sub">上限 3 轮 + 讲解 + 验证</div></div>
      <div class="kpi"><div class="kpi-k">最高频卡点层次</div>
        <div class="kpi-v" style="font-size:19px;color:var(--w-amber)">${topStuck[1] ? topStuck[0] : '—'}</div>
        <div class="kpi-sub">${topStuck[1]} 次记录卡在这一层</div></div>
    </div>
    ${m.nGradings ? '<div class="finding">下方统计<b>同时包含诊断对话与批改记录</b>——两类数据来自同一条教学链路，本就是同一批学生的两种表现。</div>' : ''}
    ${opts.isDemo ? '<div class="finding">当前显示的是<b>示例数据</b>，用于预览看板效果。导入真实会话记录后，所有图表会按实际数据重新计算。</div>' : ''}`));

  /* ---------- 初始卡点分布 ---------- */
  const layerColor = { 宏观层: 'var(--w-amber)', 微观层: 'var(--w-teal)', 符号层: 'var(--w-indigo)' };
  const unlocated = m.stuckCount['未定位'] || 0;
  html.push(section('sec-layer', '初始卡点分布（学生一开始卡在哪一层）',
    `<div class="layers">${LAYER_KEYS.map(k => {
      const n = m.stuckCount[k] || 0;
      const rate = totalStuck ? n / totalStuck : 0;
      return `<div class="layer-card">
        <div class="layer-name"><span>${k}</span>
          <span class="layer-pct" style="color:${layerColor[k]}">${n}<small style="font-size:11px;color:var(--faint)"> 次</small></span></div>
        <div class="layer-bar"><i style="width:${rate * 100}%;background:${layerColor[k]}"></i></div>
        <div class="layer-note">占全部卡点的 ${(rate * 100).toFixed(0)}%</div>
      </div>`;
    }).join('')}</div>
    ${unlocated ? `<div class="finding">另有 <b>${unlocated}</b> 次对话未能定位卡点层（对话过短或学生中途离开），未计入上方统计。</div>` : ''}
    <div class="finding">这里统计的是<b>学生一开始卡住的那一层</b>，不是对话结束时的状态——
      结束状态几乎总是三层全通，用它做统计看不出任何差异。<br>
      卡点层次集中在哪里，课堂时间就该往哪里投。若「微观层」占比最高，说明学生会算但脑中无粒子图像，
      补图像比再讲一遍公式有用。</div>`));

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
          const r = e.n ? e.stuck[k] / e.n : 0;
          const [bg, fg] = heatColor(r);
          return `<td><div class="cell" style="background:${bg};color:${fg}" title="${e.stuck[k]}/${e.n} 次卡在这一层">${e.n && e.stuck[k] ? pct(r) : '—'}</div></td>`;
        }).join('')}
        <td class="n">${e.n}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="legend"><span>没人卡</span><span class="legend-bar"></span><span>卡的人多</span>
      <span style="margin-left:auto">格子内数字 = 该知识点下「一开始卡在这一层」的对话占比</span></div>
    <div class="finding">一眼能看出<b>哪个知识点的哪一层</b>最成问题。例如某知识点符号层发亮、微观层很暗，
      说明学生卡在「写不出式子」而非「不懂粒子」——讲评时就该练符号表达，而不是重讲微观机理。</div>`
    : '<p style="color:var(--dim)">暂无数据。需智能体在诊断结论中输出「涉及知识点」一行。</p>';
  html.push(section('sec-heat', '知识点 × 初始卡点层 热力图', heatBody));

  /* ---------- 学生明细 ---------- */
  html.push(section('sec-stu', '学生明细',
    `<table class="stu-table">
      <thead><tr><th>编号</th><th>对话</th><th>批改</th><th>完整诊断</th><th>平均轮次</th>
        <th>卡点层</th><th>主要卡点类型</th><th>结束状态</th></tr></thead>
      <tbody>${m.students.map(s => {
        const allPass = s.layers != null && LAYER_KEYS.every(k => s.layers[k] == null || s.layers[k] >= 0.5);
        return `<tr>
        <td class="stu-id">${s.sid}</td>
        <td>${s.n}</td><td>${s.graded || '—'}</td><td>${s.complete}</td>
        <td>${s.n ? s.avgRounds.toFixed(1) : '—'}</td>
        <td>${s.stuck ? `<span class="pill off">${s.stuck}</span>` : '<span class="pill">—</span>'}</td>
        <td>${s.mc ? `<span class="pill mc">MC-${s.mc} ${esc(mcName(s.mc))}</span>` : '—'}</td>
        <td><span class="pill ${allPass ? 'on' : 'off'}">${allPass ? '三层已通' : '仍有待通'}</span></td>
      </tr>`;
      }).join('')}</tbody>
    </table>
    <div class="finding">学生以<b>匿名编号</b>呈现，导出数据中不含姓名。编号可对照教师自留的名单使用。<br>
      「初始卡点」是诊断结论，「结束状态」是对话结束时的结果——两者不矛盾，是同一段对话的两端。</div>`));

  /* ---------- 建议 ---------- */
  const advice = [];
  if (topMC.length) {
    advice.push(`<b>${mcName(+topMC[0][0])}</b>（MC-${topMC[0][0]}）是全班最高频的认知卡点，出现 ${topMC[0][1]} 次，建议用一整段时间集中处理。`);
  }
  const weakKp = kps.find(e => e.n >= 2);
  if (weakKp) {
    const worst = LAYER_KEYS.reduce((a, b) => (weakKp.stuck[a] / weakKp.n >= weakKp.stuck[b] / weakKp.n ? a : b));
    if (weakKp.stuck[worst] > 0) {
      advice.push(`知识点「<b>${esc(weakKp.kp)}</b>」的<b>${worst}</b>卡点最集中，讲评时建议从这一层切入。`);
    }
  }
  if (totalStuck) {
    advice.push(`学生的卡点最集中在<b>${topStuck[0]}</b>（${topStuck[1]} 次，占 ${pct(topStuck[1] / totalStuck)}）。` +
      `这说明困难主要不在记不住结论，而在<b>现象、粒子、符号三层之间的转换</b>——` +
      `这正是课堂讲授最难覆盖、也最需要个别化追问的地方。`);
  }
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
    safeRender(computeMetrics(convos));
  } catch (e) {
    console.error(e);
    setStatus('解析失败', 'bad');
    renderEmpty(`解析失败：${esc(e.message)}<br>请确认导入的是智雅后台导出的《历史会话详情》表格。`);
  }
}

/** 渲染失败的兜底——宁可显示一段错误说明，也不要留一片白屏 */
function safeRender(m, opts) {
  try {
    render(m, opts);
  } catch (e) {
    console.error(e);
    document.getElementById('main').innerHTML =
      `<div class="empty"><h2>看板渲染出错</h2>
       <p>${esc(e.message)}</p>
       <p style="margin-top:10px;font-family:var(--mono);font-size:12px">${esc(String(e.stack || '').split('\n')[1] || '')}</p>
       <p style="margin-top:14px"><button class="btn" onclick="location.reload()">重新加载</button></p></div>`;
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

/** 示例用的批改会话 —— 让看板演示能展示"诊断 + 批改"两类数据合并后的效果 */
function syntheticGrading() {
  const names = ['孙毅飞', '李同学', '王同学', '张同学', '刘同学', '陈同学', '杨同学', '赵同学'];
  const kps = ['分步沉淀规律', '溶度积与溶解度', '缓冲溶液原理', '条件稳定常数', '有效数字', '酸碱指示剂选择'];
  const layers = ['微观层', '符号层', '宏观层'];
  const mcs = [7, 1, 3, 2, 10, 5];
  const lines = ['2026-09-18 15:00:00 李老师：帮我批改这次收上来的作业'];
  const data = names.map((n, i) =>
    `${n}｜作业｜${kps[i % kps.length]}｜${layers[i % layers.length]}｜MC-${mcs[i % mcs.length]}｜${i % 5 === 0 ? '对' : '错'}`);
  lines.push('2026-09-18 15:06:00 智能体：【班级学情分析】共 8 份\n\n各题错误率…\n\n【批改数据】\n' + data.join('\n'));
  return lines;
}

function loadDemo() {
  const rows = [['会话ID', '访客', '智能体', '来源', '会话创建时间', '会话详情']];
  for (let i = 0; i < 26; i++) {
    rows.push(['id' + i, ['孙毅飞', '李同学', '王同学'][i % 3], 'bot', 'PC端', '2026-09-17 10:00:00',
      syntheticConvo(i).join('\n')]);
  }
  // 再加一条批改会话，演示两类数据合并
  rows.push(['grade-1', '李老师', 'bot', 'PC端', '2026-09-18 15:00:00', syntheticGrading().join('\n')]);
  const convos = parseSheet(rows);
  setStatus('示例数据', 'ok');
  safeRender(computeMetrics(convos), { isDemo: true });
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
