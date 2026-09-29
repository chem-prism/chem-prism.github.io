/** 模拟器共用工具 */

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  kids.flat(9).forEach(k => {
    if (k == null || k === false) return;
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  });
  return e;
}

/** 面板 */
export const panel = (label, ...kids) =>
  h('div', { class: 'panel' }, label && h('div', { class: 'panel-label' }, label), ...kids);

/** 读数格 */
export function readouts(items) {
  return h('div', { class: 'readouts' },
    ...items.map(it => h('div', { class: `ro ${it.tone || ''}` },
      h('div', { class: 'ro-k' }, it.k),
      h('div', { class: 'ro-v', html: it.v + (it.unit ? `<small>${it.unit}</small>` : '') })
    ))
  );
}

/** 滑块控件 */
export function slider({ name, hint, min, max, step, value, format, onInput }) {
  const val = h('span', { class: 'ctl-val' });
  const input = h('input', {
    type: 'range', min, max, step, value,
    oninput: e => { const v = parseFloat(e.target.value); val.textContent = format(v); onInput(v); },
  });
  const fmt = format || (v => v);
  val.textContent = fmt(value);
  return {
    el: h('div', { class: 'ctl' },
      h('div', { class: 'ctl-head' },
        h('span', { class: 'ctl-name', html: hint ? `${name} <em>${hint}</em>` : name }),
        val),
      input),
    set(v) { input.value = v; val.textContent = fmt(v); },
  };
}

/** 结论提示条 */
export const finding = html => h('div', { class: 'finding', html });

/**
 * 装置示意图上的说明文字。
 *
 * 原本在 water-hardness / ph-acetic / fe3-spec / cyanotype / complex-chem
 * 五个文件里**逐字抄了五份**（共 63 处调用）。提到这里，改字号只改一处。
 */
export function noteAt(ctx, x, y, text, color = 'rgba(160,180,196,0.9)') {
  ctx.save();
  ctx.font = '600 11px "PingFang SC", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * 倾倒的液流：从**壶嘴锚点**落到目标点。
 *
 * 别再手画这条线了。壶嘴的世界坐标随倾角变，手写起点必然对不上——
 * `mohr-salt` 第 2 步就是这么错的：液流从量筒**筒身中段**冒出来，
 * 离真正的壶嘴 48 px（见 `_glassware-test.html` 的「实际尺寸复刻」格）。
 * 现在起手位置由 `cylinder()/conicalFlask()` 回传的 `spout` 给出。
 *
 * @param from {{x,y}} 壶嘴（世界坐标）
 * @param to   {{x,y}} 落点（世界坐标）
 * @param o    { color, alpha, width, t, bow, flow }
 *             t 给非 0 会叠一道沿流向移动的亮段，表示「在流」；不给就是一条静止的液柱
 */
export function pourStream(ctx, from, to, o = {}) {
  const { color = [222, 232, 240], alpha = 0.55, width = 3, t = 0, bow = 0.18 } = o;
  const [r, g, b] = color;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // 控制点沿法线偏一点，让液流有个自然的鼓肚；完全笔直像一根棍
  const mx = from.x + dx * 0.5 - dy / len * len * bow;
  const my = from.y + dy * 0.5 + dx / len * len * bow;

  // 液流是「上粗下细」的一整条，所以按左右两条边各走一条二次曲线再合起来填充，
  // 而不是描一条等宽的线（等宽线在落差大时看着像塑料管）
  const at = u => ({
    x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * mx + u * u * to.x,
    y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * my + u * u * to.y,
  });
  const wAt = u => width * (1 - 0.45 * u);   // 出口略收

  ctx.save();
  ctx.beginPath();
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = at(u);
    const q = at(Math.min(1, u + 0.02));
    const ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
    const hw = wAt(u) / 2;
    const x = p.x + Math.cos(ang) * hw, y = p.y + Math.sin(ang) * hw;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const u = i / N, p = at(u);
    const q = at(Math.min(1, u + 0.02));
    const ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
    const hw = wAt(u) / 2;
    ctx.lineTo(p.x - Math.cos(ang) * hw, p.y - Math.sin(ang) * hw);
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.fill();

  // 流动感：沿中心线走一段虚线，靠 lineDashOffset 推进相位。
  // 比在曲线上手算若干个亮点的位置便宜得多，也不引入随机数。
  if (t > 0) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(mx, my, to.x, to.y);
    ctx.setLineDash([5, 11]);
    ctx.lineDashOffset = -((t * 46) % 16);
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.5, alpha * 0.85)})`;
    ctx.lineWidth = Math.max(1, width * 0.42);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/** 数字格式化 */
export const sig = (v, n = 3) => {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = v.toExponential(Math.max(0, n - 1)).split('e');
    return `${m}×10<sup>${parseInt(e, 10)}</sup>`;
  }
  return Number(v.toPrecision(n)).toString();
};

export const lg = v => (Number.isFinite(v) ? v.toFixed(2) : '—');

/** 浓度格式化：0.10 mol/L */
export const conc = v => {
  const a = Math.abs(v);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1).replace('e-', '×10⁻');
};
