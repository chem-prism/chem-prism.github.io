/**
 * 模拟器五：精密度与准确度（打靶）
 *
 * 教学指向：
 *   · 精密度高 ≠ 准确度高（错题样本 No.2）
 *   · 系统误差不能靠增加测定次数消除
 *   · 有效数字应反映测量精度（No.1）
 */

import { gaussian, mean, stdev } from '../chem.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'precision',
  name: '精密度与准确度',
  wave: '650 nm',
  accent: '--w-red',
  desc: '子弹打得很集中，但整体偏离靶心——这算枪法好还是不好？',
};

const N_SHOTS = 10;

const PRESETS = [
  { key: 'good', label: '又准又稳', sigma: 0.045, bias: 0.02 },
  { key: 'precise', label: '稳但偏了', sigma: 0.04, bias: 0.30 },
  { key: 'accurate', label: '偏得少但散', sigma: 0.22, bias: 0.02 },
  { key: 'bad', label: '又散又偏', sigma: 0.24, bias: 0.30 },
];

export function mount(root, params = {}) {
  const state = {
    sigma: params.sigma != null ? +params.sigma : 0.30,
    bias: params.bias != null ? +params.bias : 0.04,
    shots: [],
  };

  const canvas = h('canvas', { class: 'target-canvas' });
  const statHost = h('div', { style: 'flex:1;min-width:210px' });
  const findHost = h('div');

  const sSigma = slider({
    name: '随机误差 σ', hint: '越小越集中',
    min: 0.02, max: 0.35, step: 0.005, value: state.sigma,
    format: v => v.toFixed(3),
    onInput: v => { state.sigma = v; shoot(); },
  });
  const sBias = slider({
    name: '系统误差', hint: '偏离靶心的程度',
    min: 0, max: 0.45, step: 0.005, value: state.bias,
    format: v => v.toFixed(3),
    onInput: v => { state.bias = v; shoot(); },
  });

  const presetRow = h('div', { class: 'btn-row' },
    ...PRESETS.map(p => h('button', {
      class: 'btn', onclick: () => {
        state.sigma = p.sigma; state.bias = p.bias;
        sSigma.set(p.sigma); sBias.set(p.bias);
        shoot();
      },
    }, p.label)),
    h('button', { class: 'btn primary', onclick: () => shoot() }, '重新射击'));

  root.append(
    panel('参数', h('div', { class: 'controls' }, sSigma.el, sBias.el), h('div', { style: 'margin-top:14px' }, presetRow)),
    panel('靶面', h('div', { class: 'target-wrap' }, canvas, statHost)),
    findHost,
  );

  /* ---------- 打靶 ---------- */
  function shoot() {
    const shots = [];
    const ang = -Math.PI / 5.5;                    // 系统误差方向固定，便于观察
    const ox = Math.cos(ang) * state.bias;
    const oy = Math.sin(ang) * state.bias;
    for (let i = 0; i < N_SHOTS; i++) {
      shots.push({
        x: ox + gaussian() * state.sigma,
        y: oy + gaussian() * state.sigma,
      });
    }
    state.shots = shots;
    drawTarget();
    updateStats();
  }

  function drawTarget() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 300, hh = rect.height || 300;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const cx = w / 2, cy = hh / 2;
    const R = Math.min(w, hh) / 2 - 8;

    // 靶环
    for (let i = 5; i >= 1; i--) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * i) / 5, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(224,90,79,0.055)' : 'rgba(255,255,255,0.018)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,140,155,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // 十字
    ctx.strokeStyle = 'rgba(120,140,155,0.3)';
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    // 靶心
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#7b8c99'; ctx.fill();

    // 弹着点
    const toPx = (p) => ({ X: cx + p.x * R, Y: cy + p.y * R });
    state.shots.forEach(s => {
      const { X, Y } = toPx(s);
      ctx.beginPath(); ctx.arc(X, Y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224,90,79,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // 弹着点重心
    if (state.shots.length) {
      const mx = mean(state.shots.map(s => s.x));
      const my = mean(state.shots.map(s => s.y));
      const { X, Y } = toPx({ x: mx, y: my });
      ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X - 8, Y); ctx.lineTo(X + 8, Y);
      ctx.moveTo(X, Y - 8); ctx.lineTo(X, Y + 8);
      ctx.stroke();
    }

    // 图例
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.fillStyle = '#4c5b67';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('● 单次测定　◎ 平均值', 10, 10);
  }

  function updateStats() {
    const xs = state.shots.map(s => s.x);
    const ys = state.shots.map(s => s.y);
    const mx = mean(xs), my = mean(ys);
    const dist = Math.hypot(mx, my);
    const spread = Math.sqrt((stdev(xs) ** 2 + stdev(ys) ** 2) / 2);

    const precise = spread < 0.10;
    const accurate = dist < 0.10;

    statHost.replaceChildren(readouts([
      { k: '平均值偏离靶心', v: dist.toFixed(3), tone: accurate ? 'good' : dist > 0.2 ? 'bad' : 'warn' },
      { k: '弹着点分散度', v: spread.toFixed(3), tone: precise ? 'good' : spread > 0.18 ? 'bad' : 'warn' },
      { k: '精密度', v: precise ? '高' : '低', tone: precise ? 'good' : 'bad' },
      { k: '准确度', v: accurate ? '高' : '低', tone: accurate ? 'good' : 'bad' },
    ]));

    let msg;
    if (precise && accurate) {
      msg = `又准又稳。系统误差和随机误差都很小，这是理想的分析结果。`;
    } else if (precise && !accurate) {
      msg = `<b>精密度高，准确度低。</b>每次测得都很接近，但整体偏离真值——` +
        `说明存在<b>系统误差</b>（仪器未校准、试剂含杂质、方法本身有缺陷）。` +
        `<br>关键问题：这种偏差<b>靠多测几次能消除吗？</b>再射一轮看看，平均值会不会移向靶心。`;
    } else if (!precise && accurate) {
      msg = `准确度尚可，但<b>精密度低</b>——随机误差大，单次测定不可靠。` +
        `这种情况可以通过增加测定次数、取平均值来改善。`;
    } else {
      msg = `随机误差和系统误差都比较大。实际工作中应先消除系统误差（校准、空白、对照），` +
        `再通过多次测定降低随机误差。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  // 首次渲染
  requestAnimationFrame(() => { drawTarget(); shoot(); });
  window.addEventListener('resize', () => { drawTarget(); });
  sSigma.el.querySelector('input').addEventListener('input', e => {
    state.sigma = parseFloat(e.target.value); shoot();
  });
  sBias.el.querySelector('input').addEventListener('input', e => {
    state.bias = parseFloat(e.target.value); shoot();
  });

  return {
    record() {
      const xs = state.shots.map(s => s.x);
      const ys = state.shots.map(s => s.y);
      const dist = Math.hypot(mean(xs), mean(ys));
      const spread = Math.sqrt((stdev(xs) ** 2 + stdev(ys) ** 2) / 2);
      return {
        sim: '精密度与准确度（打靶）',
        params: [`随机误差 σ = ${state.sigma.toFixed(3)}`, `系统误差 = ${state.bias.toFixed(3)}`],
        readings: [
          `${N_SHOTS} 次测定的平均值偏离靶心 ${dist.toFixed(3)}`,
          `弹着点分散度 ${spread.toFixed(3)}`,
          `结论：精密度${spread < 0.1 ? '高' : '低'}，准确度${dist < 0.1 ? '高' : '低'}`,
        ],
      };
    },
    params() { return { sigma: state.sigma, bias: state.bias }; },
  };
}
