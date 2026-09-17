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
