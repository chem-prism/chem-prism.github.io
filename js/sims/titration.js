/**
 * 模拟器一：酸碱滴定
 *
 * 三层同时呈现：
 *   宏观层 —— 烧杯：液面、指示剂颜色随 pH 渐变、滴液
 *   微观层 —— 粒子视图：HAc / Ac⁻ / Na⁺ / H⁺ / OH⁻ 的相对多少
 *   符号层 —— 滴定曲线：突跃范围、化学计量点、指示剂变色带
 *
 * 教学指向：
 *   · 突跃范围随浓度降低而变窄（错题样本 No.14）
 *   · 指示剂必须选在突跃范围内（No.15）
 *   · 化学计量点 ≠ 滴定终点（No.13）
 *   · 指示剂变色发生在「区间」而非某点，因为两型体比例是连续变化的（No.13）
 */

import {
  titrationCurve, equivalencePH, jumpRange, speciation,
  INDICATORS, recommendIndicators, phFromH,
} from '../chem.js';
import { Chart } from '../chart.js';
import { Beaker, ParticleField, indicatorColor, solutionColor, visualCount } from '../views.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'titration',
  name: '酸碱滴定曲线',
  wave: '580 nm',
  accent: '--w-amber',
  desc: '烧杯里的颜色、溶液里的粒子、纸上的曲线——同一场滴定的三个层面，同时看。',
};

const IND_OPTIONS = ['（不加指示剂）', ...INDICATORS.map(i => i.name)];

export function mount(root, params = {}) {
  const state = {
    pka: params.pka != null ? +params.pka : 4.74,
    strong: params.strong === '1',
    ca: params.c != null ? +params.c : 0.1,
    va: 20,
    showInd: params.ind !== '0',
    ind: params.indname || '酚酞',
    v: params.v != null ? +params.v : 0,      // 已加入的滴定剂体积
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: 'V(NaOH) / mL', yLabel: 'pH',
    xRange: [0, 40], yRange: [0, 14],
    pad: { l: 40, r: 16, t: 14, b: 34 },
  });

  // —— 实验台：宏观 + 微观 ——
  const bcv = h('canvas');
  const pcv = h('canvas');
  const beaker = new Beaker(bcv);
  const particles = new ParticleField(pcv);
  const bench = h('div', { class: 'bench' },
    h('div', { class: 'bench-cell bench-beaker' },
      h('div', { class: 'bench-tag' }, '宏观层', ' ', h('b', {}, '烧杯')),
      bcv),
    h('div', { class: 'bench-cell bench-particles' },
      h('div', { class: 'bench-tag' }, '微观层', ' ', h('b', {}, '溶液中的粒子')),
      pcv));

  const roHost = h('div');
  const findHost = h('div');

  const sConC = slider({
    name: '酸的浓度', hint: 'mol/L',
    min: -3, max: -0.3, step: 0.02, value: Math.log10(state.ca),
    format: v => Math.pow(10, v).toPrecision(2),
    onInput: v => { state.ca = Math.pow(10, v); render(); },
  });
  const sPka = slider({
    name: 'pKₐ', hint: '越小酸性越强',
    min: 0, max: 12, step: 0.02, value: state.pka,
    format: v => v.toFixed(2),
    onInput: v => { state.pka = v; render(); },
  });
  const pkaCtl = h('div', {}, sPka.el);

  const selAcid = h('select', {
    onchange: e => {
      state.strong = e.target.value === 'strong';
      pkaCtl.style.display = state.strong ? 'none' : '';
      render();
    },
  },
    h('option', { value: 'weak' }, '弱酸 HA（pKₐ 可调）'),
    h('option', { value: 'strong' }, '强酸（HCl 等）'));
  selAcid.value = state.strong ? 'strong' : 'weak';
  if (state.strong) pkaCtl.style.display = 'none';

  const selInd = h('select', {
    onchange: e => { state.ind = e.target.value; render(); },
  }, ...IND_OPTIONS.map(n => h('option', { value: n.replace('（不加指示剂）', ''), }, n)));
  selInd.value = state.ind;

  const chkInd = h('input', {
    type: 'checkbox', id: 'chk-ind',
    onchange: e => { state.showInd = e.target.checked; render(); },
  });
  chkInd.checked = state.showInd;

  // 滴定体积滑块 —— 这是驱动三个视图的主控
  const sV = slider({
    name: '已加入 NaOH', hint: 'mL',
    min: 0, max: 40, step: 0.02, value: state.v,
    format: v => v.toFixed(2),
    onInput: v => { state.v = v; render(); },
  });

  const btnAuto = h('button', {
    class: 'btn primary',
    onclick: () => autoTitrate(),
  }, '自动滴定');

  root.append(
    panel('参数',
      h('div', { class: 'controls' },
        h('div', { class: 'ctl' },
          h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '酸的种类')),
          selAcid),
        h('div', { class: 'ctl' },
          h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '指示剂')),
          selInd),
        sConC.el,
        pkaCtl),
      h('div', { class: 'controls', style: 'margin-top:14px' }, sV.el),
      h('div', { class: 'btn-row', style: 'margin-top:10px' },
        btnAuto,
        h('label', { style: 'cursor:pointer;display:flex;align-items:center;gap:6px' },
          chkInd, h('span', { style: 'font-size:12.5px;color:var(--dim)' }, '曲线上叠加指示剂变色带')))),
    panel('实验台', bench),
    panel('滴定曲线', cw),
    panel('读数', roHost),
    findHost,
  );

  /* ---------- 自动滴定动画 ---------- */
  let autoRaf = null;
  function autoTitrate() {
    if (autoRaf) { cancelAnimationFrame(autoRaf); autoRaf = null; btnAuto.textContent = '自动滴定'; return; }
    const ka = state.strong ? 1e3 : Math.pow(10, -state.pka);
    const veq = (state.ca * state.va) / state.ca;
    state.v = 0;
    btnAuto.textContent = '停止';
    let last = performance.now();
    const step = t => {
      const dt = Math.min((t - last) / 1000, 0.05); last = t;
      // 接近计量点时放慢，模拟"半滴加入"的操作
      const near = Math.abs(state.v - veq) / veq < 0.02;
      state.v = Math.min(state.v + (near ? 0.06 : 0.7) * dt * (veq / 20), veq * 1.6);
      sV.set(state.v);
      beaker.drop();
      render();
      if (state.v >= veq * 1.55) {
        autoRaf = null; btnAuto.textContent = '自动滴定'; return;
      }
      autoRaf = requestAnimationFrame(step);
    };
    autoRaf = requestAnimationFrame(step);
  }

  function render() {
    const ka = state.strong ? 1e3 : Math.pow(10, -state.pka);
    const ca = state.ca, va = state.va, cb = state.ca;
    const { points, veq } = titrationCurve({ ca, va, cb, ka, n: 420 });
    const eqPH = equivalencePH(ca, va, cb, ka);
    const jr = jumpRange(ca, va, cb, ka);
    const rec = recommendIndicators(jr);

    // 当前状态
    const v = Math.min(state.v, veq * 2);
    const vt = va + v;
    const Ca = (ca * va) / vt, Cb = (cb * v) / vt;
    const sp = speciation(Ca, Cb, ka);
    const ph = phFromH(sp.h);

    /* —— 符号层：曲线 —— */
    chart.setBands(state.showInd
      ? INDICATORS.map(i => ({ lo: i.lo, hi: i.hi, color: i.color, alpha: 0.11, label: i.name }))
      : []);
    chart.setMarkers([
      { x: veq, color: 'var(--w-teal)', label: '化学计量点', dash: [5, 3] },
      { x: v, color: 'var(--w-amber)', label: '', dash: [2, 4] },
    ]);
    chart.setSeries([{
      name: 'pH', points: points.map(p => ({ x: p.v, y: p.ph })),
      color: 'var(--accent)', width: 2, glow: true, yFormat: x => x.toFixed(2),
    }]);
    chart.draw();

    /* —— 宏观层：烧杯 —— */
    const indName = state.ind;
    const hasInd = indName && indName !== '';
    const color = hasInd ? indicatorColor(indName, ph) : solutionColor(ph);
    beaker.set({
      fill: Math.min(1, vt / (va + veq * 2)),
      color,
      caption: `pH ${ph.toFixed(2)}`,
      sub: hasInd ? `${indName}` : '未加指示剂',
    });

    /* —— 微观层：粒子 —— */
    const cRef = Math.max(Ca, Cb, 1e-3);
    const species = [];
    const push = (label, c, col) => {
      const n = visualCount(c, { cRef, cMin: cRef * 1e-6 });
      if (n > 0) species.push({ label, n, color: col });
    };
    if (Cb > 0) push('Na⁺', Cb, '#7b8c99');
    push('HA', sp.HA, '#e8a33d');
    push('A⁻', sp.A, '#2fb3a3');
    push('H⁺', sp.h, '#e05a4f');
    push('OH⁻', sp.oh, '#5c82d6');

    // 去掉数量为 0 的，并对总量做个上限，避免画面糊掉
    const shown = species.filter(s => s.n > 0);
    const total = shown.reduce((a, s) => a + s.n, 0);
    if (total > 60) {
      const k = 60 / total;
      shown.forEach(s => { s.n = Math.max(1, Math.round(s.n * k)); });
    }
    particles.set(shown, '粒子数只表示相对多少');

    /* —— 读数 —— */
    const width = jr.hi - jr.lo;
    roHost.replaceChildren(readouts([
      { k: '当前 pH', v: ph.toFixed(2) },
      { k: '化学计量点 pH', v: eqPH.toFixed(2), tone: Math.abs(eqPH - 7) < 0.3 ? '' : 'warn' },
      { k: '突跃范围', v: `${jr.lo.toFixed(2)} ~ ${jr.hi.toFixed(2)}` },
      { k: '突跃宽度', v: width.toFixed(2), unit: 'pH', tone: width < 1 ? 'bad' : width < 3 ? 'warn' : 'good' },
      { k: '可用的指示剂', v: rec.length ? rec.map(i => i.name).join('、') : '无', tone: rec.length ? 'good' : 'bad' },
    ]));

    /* —— 结论 —— */
    let msg;
    if (!hasInd) {
      msg = `烧杯里没加指示剂，所以看不到颜色变化。选一个指示剂，再看曲线上的变色带——会出现在哪里？`;
    } else {
      const [rr, gg, bb, aa] = color;
      const inJump = jr.lo <= ph && ph <= jr.hi;
      const ind = INDICATORS.find(i => i.name === indName);
      const inRange = ind && ph >= ind.lo && ph <= ind.hi;
      if (inRange) {
        msg = `<b>指示剂正在变色。</b>${indName}的变色范围是 pH ${ind.lo}~${ind.hi}，当前 pH ${ph.toFixed(2)} 落在里面——` +
          `注意颜色是<b>渐变</b>的：因为指示剂本身是弱酸，酸式与碱式的比例随 pH 连续变化，` +
          `所以变色发生在一个<b>区间</b>而不是某一个点。`;
      } else if (inJump && ind && ph > ind.hi) {
        msg = `已经越过${indName}的变色范围（pH ${ind.lo}~${ind.hi}），颜色不会再变了。` +
          `突跃范围是 ${jr.lo.toFixed(2)}~${jr.hi.toFixed(2)}，${indName}落在其中，所以它能指示终点。`;
      } else if (rec.length === 0) {
        msg = `突跃只有 <b>${width.toFixed(2)}</b> 个 pH 单位，比常用指示剂的变色范围还窄——` +
          `<b>把浓度调大</b>，看突跃怎么变宽。`;
      } else {
        msg = `继续滴加，注意烧杯颜色会在突跃范围内突变——` +
          `那一段正是${rec.map(i => i.name).join('、')}的变色区间。`;
      }
    }
    findHost.replaceChildren(finding(msg));
  }

  render();
  requestAnimationFrame(() => { beaker.draw(); particles.start(); });

  return {
    stop() { beaker.stop(); particles.stop(); if (autoRaf) cancelAnimationFrame(autoRaf); },
    record() {
      const ka = state.strong ? 1e3 : Math.pow(10, -state.pka);
      const jr = jumpRange(state.ca, state.va, state.ca, ka);
      const eqPH = equivalencePH(state.ca, state.va, state.ca, ka);
      return {
        sim: '酸碱滴定',
        params: [
          `酸：${state.strong ? '强酸' : `弱酸 pKₐ=${state.pka.toFixed(2)}`}`,
          `浓度：${state.ca.toPrecision(2)} mol/L`,
          `指示剂：${state.ind || '未加'}`,
        ],
        readings: [
          `化学计量点 pH = ${eqPH.toFixed(2)}`,
          `突跃范围 = pH ${jr.lo.toFixed(2)} ~ ${jr.hi.toFixed(2)}（宽度 ${(jr.hi - jr.lo).toFixed(2)}）`,
        ],
      };
    },
    params() {
      return {
        c: state.ca, pka: state.pka, strong: state.strong ? '1' : '0',
        ind: state.showInd ? '1' : '0', indname: state.ind, v: state.v,
      };
    },
  };
}
