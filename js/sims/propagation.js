/**
 * 模拟器九：误差传递
 *
 * 教学指向：
 *   · 加减法用绝对误差传递，乘除法用相对误差传递（错题样本 No.5）
 *   · 用错规则的后果不对称：加减法只是保守，乘除法会严重低估
 *   · 有效数字位数应与测量精度匹配（No.1）
 */

import { propagate } from '../chem.js';
import { Chart, sample } from '../chart.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'propagation',
  name: '误差传递',
  wave: '560 nm',
  accent: '--w-amber',
  desc: '把绝对误差直接相加——加减法下只是保守，乘除法下会把误差算成小数倍。',
};

const OPS = [
  { v: '+', label: 'a + b' },
  { v: '-', label: 'a − b' },
  { v: '×', label: 'a × b' },
  { v: '÷', label: 'a ÷ b' },
];

export function mount(root, params = {}) {
  const state = {
    a: params.a != null ? +params.a : 10.0,
    da: params.da != null ? +params.da : 0.1,
    b: params.b != null ? +params.b : 5.00,
    db: params.db != null ? +params.db : 0.01,
    op: params.op || '×',
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: 'b 的值', yLabel: '传递后的绝对误差',
    xRange: [0.2, 30], yRange: [0, 1],
    pad: { l: 52, r: 16, t: 14, b: 34 },
  });

  const roHost = h('div');
  const findHost = h('div');

  const selOp = h('select', {
    onchange: e => { state.op = e.target.value; render(); },
  }, ...OPS.map(o => h('option', { value: o.v }, o.label)));
  selOp.value = state.op;

  const sA = slider({
    name: 'a 的值', min: 1, max: 50, step: 0.1, value: state.a,
    format: v => v.toFixed(1), onInput: v => { state.a = v; render(); },
  });
  const sDa = slider({
    name: 'a 的绝对误差 Δa', min: 0.001, max: 2, step: 0.001, value: state.da,
    format: v => v.toFixed(3), onInput: v => { state.da = v; render(); },
  });
  const sB = slider({
    name: 'b 的值', min: 1, max: 30, step: 0.05, value: state.b,
    format: v => v.toFixed(2), onInput: v => { state.b = v; render(); },
  });
  const sDb = slider({
    name: 'b 的绝对误差 Δb', min: 0.001, max: 2, step: 0.001, value: state.db,
    format: v => v.toFixed(3), onInput: v => { state.db = v; render(); },
  });

  root.append(
    panel('运算',
      h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '两个量之间的关系')),
        selOp)),
    panel('参数', h('div', { class: 'controls' }, sA.el, sDa.el, sB.el, sDb.el)),
    panel('两种做法给出的误差', cw),
    panel('读数', roHost),
    findHost,
  );

  function render() {
    const res = propagate({ a: state.a, da: state.da, b: state.b, db: state.db, op: state.op });
    const isMulDiv = state.op === '×' || state.op === '÷';

    // 横轴扫过 b，比较两种做法
    const bMax = Math.max(30, state.a * 3);
    const correctCurve = sample(0.2, bMax, 160, b => {
      if (b < 0.2) return NaN;
      const r = propagate({ a: state.a, da: state.da, b, db: state.db, op: state.op });
      return Math.abs(r.correct);
    });
    const naiveCurve = sample(0.2, bMax, 160, () => state.da + state.db);

    const yTop = Math.max(
      ...correctCurve.map(p => p.y).filter(Number.isFinite),
      state.da + state.db
    ) * 1.15;

    chart.xRange = [0.2, bMax];
    chart.yRange = [0, yTop || 1];
    chart.setVRanges([]);
    chart.setBands([]);
    chart.setMarkers([{
      x: state.b, color: 'var(--w-amber)', label: '当前 b', dash: [5, 3],
    }]);
    chart.setSeries([
      {
        name: '按规则传递', points: correctCurve, color: 'var(--w-green)', width: 2.2, glow: true,
        yFormat: v => v.toFixed(3),
      },
      {
        name: '绝对误差直加（错）', points: naiveCurve, color: 'var(--w-red)', width: 1.8, dash: [6, 4],
        yFormat: v => v.toFixed(3),
      },
    ]);
    chart.draw();

    roHost.replaceChildren(readouts([
      { k: `a ${state.op} b`, v: Math.abs(res.value).toPrecision(4) },
      { k: '传递规则', v: isMulDiv ? '相对误差' : '绝对误差' },
      { k: '正确误差', v: res.correct.toPrecision(3), tone: 'good' },
      { k: '错误做法误差', v: res.naive.toPrecision(3), tone: isMulDiv ? 'bad' : 'warn' },
      { k: '两者之比', v: `${(res.ratioToCorrect * 100).toFixed(0)}%`, tone: isMulDiv ? 'bad' : 'warn' },
    ]));

    let msg;
    if (isMulDiv) {
      if (res.ratioToCorrect < 0.5) {
        msg = `<b>乘除法必须用相对误差传递。</b>直接相加绝对误差（红线）得到的 ` +
          `${res.naive.toPrecision(3)}，只有正确值 ${res.correct.toPrecision(3)} 的 ` +
          `<b>${(res.ratioToCorrect * 100).toFixed(0)}%</b>——严重低估了误差。<br>` +
          `红线在图上是平的，绿线随 b 升高——两数相差越大，低估越厉害。`;
      } else {
        msg = `此时两数大小相近，两种做法差别还不大。` +
          `<b>把 b 调大或调小，看两条线怎么分开。</b>`;
      }
    } else {
      msg = `<b>加减法用绝对误差传递</b>，两种做法结果接近——` +
        `此时直接相加（${res.naive.toPrecision(3)}）比按方和根（${res.correct.toPrecision(3)}）` +
        `略大一点，属于保守估计，<b>不会算错方向</b>。<br>` +
        `真正容易出错的是乘除法——切过去看看。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    record() {
      const r = propagate({ a: state.a, da: state.da, b: state.b, db: state.db, op: state.op });
      return {
        sim: '误差传递',
        params: [
          `a = ${state.a} ± ${state.da}`, `b = ${state.b} ± ${state.db}`,
          `运算：a ${state.op} b`,
        ],
        readings: [
          `结果 = ${Math.abs(r.value).toPrecision(4)}`,
          `传递规则：${r.rule}`,
          `正确误差 ± ${r.correct.toPrecision(3)}；错误做法 ± ${r.naive.toPrecision(3)}`,
        ],
      };
    },
    params() { return { a: state.a, da: state.da, b: state.b, db: state.db, op: state.op }; },
  };
}
