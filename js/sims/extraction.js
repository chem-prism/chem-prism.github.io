/**
 * 模拟器十二：液液萃取（教材 ch10）
 *
 * 教学指向：
 *   · 分配比 D 而不是分配系数 K_D 才反映实际分离效果（D 随 pH 等条件变）
 *   · 等体积一次萃取时 E = D/(D+1)：D=10 只有 90.9%
 *   · **有机相总量相同，分多次萃取优于一次性萃取**——每次都用新鲜有机相维持浓度梯度
 */

import { extractOnce, extractTotal } from '../chem.js';
import { Chart, sample } from '../chart.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'extraction',
  name: '液液萃取',
  wave: '590 nm',
  accent: '--w-teal',
  desc: '同样多的有机溶剂，一次用完还是分三次用？差的那几个百分点，就在这里。',
};

export function mount(root, params = {}) {
  const state = {
    D: params.D != null ? +params.D : 10,
    vAq: params.vaq != null ? +params.vaq : 60,
    vTotal: params.vtotal != null ? +params.vtotal : 60,
    n: params.n != null ? +params.n : 3,
  };

  /* ---------- 宏观层：分液漏斗 ---------- */
  const fcv = h('canvas');

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: '萃取次数 n', yLabel: '累积萃取率 E总 / %',
    xRange: [1, 8], yRange: [0, 100],
    pad: { l: 52, r: 16, t: 14, b: 34 },
  });
  chart.xFormat = v => v.toFixed(0);

  const roHost = h('div');
  const findHost = h('div');

  const sD = slider({
    name: '分配比 D', hint: '有机相/水相总浓度之比',
    min: 1, max: 200, step: 1, value: state.D,
    format: v => v.toFixed(0), onInput: v => { state.D = v; render(); },
  });
  const sVAq = slider({
    name: '水相体积', hint: 'mL', min: 10, max: 200, step: 5, value: state.vAq,
    format: v => v.toFixed(0), onInput: v => { state.vAq = v; render(); },
  });
  const sVTot = slider({
    name: '有机相总量', hint: 'mL', min: 5, max: 200, step: 5, value: state.vTotal,
    format: v => v.toFixed(0), onInput: v => { state.vTotal = v; render(); },
  });
  const sN = slider({
    name: '分批次数 n', min: 1, max: 8, step: 1, value: state.n,
    format: v => String(v), onInput: v => { state.n = v; render(); },
  });

  root.append(
    panel('参数',
      h('div', { class: 'controls' }, sD.el, sVAq.el, sVTot.el, sN.el)),
    panel('分液漏斗', h('div', { class: 'bench single' },
      h('div', { class: 'bench-cell' }, h('div', { class: 'bench-tag' }, '宏观层', ' ', h('b', {}, '两相分层')), fcv))),
    panel('分批萃取能提升多少', cw),
    panel('读数', roHost),
    findHost,
  );

  /* ---------- 分液漏斗绘制 ---------- */
  function drawFunnel(eOnce, eBatch) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = fcv.clientWidth, hh = fcv.clientHeight;
    if (!w || !hh) return;
    if (fcv.width !== Math.round(w * dpr) || fcv.height !== Math.round(hh * dpr)) {
      fcv.width = Math.round(w * dpr); fcv.height = Math.round(hh * dpr);
    }
    const ctx = fcv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);

    const fw = Math.min(w * 0.34, 130);
    const fx = (w - fw) / 2;
    const top = 18, bot = hh * 0.62;
    const neckY = bot, neckH = hh * 0.16;
    const halfW = fw / 2;

    // 漏斗轮廓（梯形 + 颈 + 旋塞）
    ctx.beginPath();
    ctx.moveTo(fx, top);
    ctx.lineTo(fx + fw, top);
    ctx.lineTo(fx + halfW + 7, neckY);
    ctx.lineTo(fx + halfW + 7, neckY + neckH);
    ctx.lineTo(fx + halfW - 7, neckY + neckH);
    ctx.lineTo(fx + halfW - 7, neckY);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(160,180,196,0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 旋塞
    ctx.beginPath();
    ctx.arc(fx + halfW, neckY + neckH * 0.45, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160,180,196,0.5)';
    ctx.stroke();

    // 两相：上有机相、下水相。宽度随高度线性插值（梯形）
    const midY = top + (neckY - top) * 0.55;
    const widthAt = y => fw * (1 - (y - top) / (neckY - top) * 0.72);

    // 水相（下）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fx + halfW - widthAt(midY) / 2, midY);
    ctx.lineTo(fx + halfW + widthAt(midY) / 2, midY);
    ctx.lineTo(fx + halfW + widthAt(neckY) / 2, neckY);
    ctx.lineTo(fx + halfW - widthAt(neckY) / 2, neckY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(120,170,210,0.30)';
    ctx.fill();
    ctx.restore();

    // 有机相（上）—— 颜色深浅表示萃取了多少
    const alpha = Math.min(0.85, 0.12 + eOnce * 0.8);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fx + halfW - widthAt(top) / 2, top);
    ctx.lineTo(fx + halfW + widthAt(top) / 2, top);
    ctx.lineTo(fx + halfW + widthAt(midY) / 2, midY);
    ctx.lineTo(fx + halfW - widthAt(midY) / 2, midY);
    ctx.closePath();
    ctx.fillStyle = `rgba(232,163,61,${alpha})`;
    ctx.fill();
    ctx.restore();

    // 标注
    ctx.font = '11px "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(232,163,61,0.95)';
    ctx.fillText(`有机相　溶质 ${(eOnce * 100).toFixed(1)}%`, fx + fw + 14, top + (midY - top) * 0.5);
    ctx.fillStyle = 'rgba(120,170,210,0.95)';
    ctx.fillText(`水相　　残留 ${((1 - eOnce) * 100).toFixed(1)}%`, fx + fw + 14, (midY + neckY) / 2);

    // 底部结论
    ctx.font = '600 12px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(223,230,236,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      state.n > 1
        ? `${state.n} 次累积萃取率 ${(eBatch * 100).toFixed(1)}%`
        : `一次萃取率 ${(eOnce * 100).toFixed(1)}%`,
      w / 2, hh - 20
    );
  }

  function render() {
    const vEach = state.vTotal / state.n;                   // 每次用的有机相体积
    const eOnce = extractOnce(state.D, state.vTotal, state.vAq);      // 一次全量
    const eBatch = extractTotal(state.D, vEach, state.vAq, state.n);  // n 次分批

    // 曲线：不同次数下的累积效率（每次用 vTotal/n）
    const curve = sample(1, 8, 8, n => extractTotal(state.D, state.vTotal / n, state.vAq, n) * 100);

    chart.xRange = [1, 8];
    chart.yRange = [Math.max(0, Math.floor(Math.min(eOnce, eBatch) * 100 / 10) * 10 - 5), 100];
    chart.setBands([]);
    chart.setVRanges([]);
    chart.setMarkers([
      { x: state.n, color: 'var(--w-amber)', label: `当前 n=${state.n}`, dash: [5, 3] },
    ]);
    chart.setSeries([
      {
        name: '分批萃取', points: curve, color: 'var(--w-teal)', width: 2.2, glow: true,
        yFormat: v => v.toFixed(1),
      },
      {
        // 一次全量的水平参考线
        name: '一次全量', points: [{ x: 1, y: eOnce * 100 }, { x: 8, y: eOnce * 100 }],
        color: 'var(--w-red)', width: 1.6, dash: [6, 4], yFormat: v => v.toFixed(1),
      },
    ]);
    chart.draw();
    drawFunnel(eBatch, eBatch);

    const gain = (eBatch - eOnce) * 100;
    const r = state.vAq / vEach;   // 体积比

    roHost.replaceChildren(readouts([
      { k: '分配比 D', v: state.D.toFixed(0) },
      { k: '一次全量萃取率', v: (eOnce * 100).toFixed(1), unit: '%' },
      { k: `${state.n} 次分批萃取率`, v: (eBatch * 100).toFixed(1), unit: '%', tone: 'good' },
      { k: '提升了', v: gain.toFixed(1), unit: '个百分点', tone: gain > 5 ? 'good' : '' },
      { k: '水相/有机相体积比', v: r.toFixed(2) },
    ]));

    let msg;
    if (state.n === 1) {
      msg = `一次萃取：E = D·V有 / (D·V有 + V水) = ${(eOnce * 100).toFixed(1)}%。` +
        `<br>把「分批次数」调到 2 或 3——<b>有机相总量不变</b>，看萃取率怎么变。`;
    } else if (gain < 1) {
      msg = `此时分批几乎没带来提升——因为 D 很大（${state.D}），一次就已经接近完全萃取。` +
        `<br>分批的价值在 <b>D 不太大</b>的时候最明显。把 D 调小试试。`;
    } else {
      msg = `<b>同样 ${state.vTotal} mL 有机相：一次用完萃取 ${(eOnce * 100).toFixed(1)}%，` +
        `分 ${state.n} 次每次 ${vEach.toFixed(1)} mL 则达 ${(eBatch * 100).toFixed(1)}%，高了 ${gain.toFixed(1)} 个百分点。</b>` +
        `<br>原因：每次都用<b>新鲜有机相</b>，水相溶质始终面对最大的浓度梯度；` +
        `一次性萃取时有机相里溶质越积越多，后半程的推动力就弱了。` +
        `<br>这就是「少量多次」的定量依据。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    stop() {},
    record() {
      const vEach = state.vTotal / state.n;
      const eOnce = extractOnce(state.D, state.vTotal, state.vAq);
      const eBatch = extractTotal(state.D, vEach, state.vAq, state.n);
      return {
        sim: '液液萃取',
        params: [
          `分配比 D = ${state.D}`,
          `水相 ${state.vAq} mL，有机相总量 ${state.vTotal} mL`,
          `分 ${state.n} 次，每次 ${vEach.toFixed(1)} mL`,
        ],
        readings: [
          `一次全量萃取率 = ${(eOnce * 100).toFixed(1)}%`,
          `${state.n} 次分批萃取率 = ${(eBatch * 100).toFixed(1)}%`,
        ],
      };
    },
    params() { return { D: state.D, vaq: state.vAq, vtotal: state.vTotal, n: state.n }; },
  };
}
