/**
 * 模拟器十七：质量控制图（教材 ch04）
 *
 * 教学指向：
 *   · 控制图把「这次数据正常吗」变成一条可判断的规则：
 *     落在 ±2s 内正常，越过 2s 警告，越过 3s 判失控
 *   · 连续 7 点落在中心线同侧、或持续单向漂移，即使没越限也说明有系统性问题
 *   · 加标回收率评估准确度，平行测定评估精密度——两者要分开看
 */

import { gaussian, mean, stdev } from '../chem.js';
import { Chart } from '../chart.js';
import { h, panel, readouts, slider, finding } from './common.js';

export const meta = {
  id: 'qcchart',
  name: '质量控制图',
  wave: '570 nm',
  accent: '--w-green',
  desc: '一批质控数据摆在图上，哪些点只是波动、哪些说明方法已经失控——用规则判断，不靠感觉。',
};

export function mount(root, params = {}) {
  const state = {
    drift: params.drift != null ? +params.drift : 0,        // 系统漂移（以 s 为单位）
    seed: params.seed != null ? +params.seed : 7,           // 数据集编号
    n: params.n != null ? +params.n : 20,
  };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: '测定序号', yLabel: '测定值',
    xRange: [1, 20], yRange: [0, 10],
    pad: { l: 50, r: 16, t: 14, b: 34 },
  });
  chart.xFormat = v => v.toFixed(0);

  const roHost = h('div');
  const findHost = h('div');

  const sDrift = slider({
    name: '系统漂移', hint: '以标准差 s 为单位',
    min: -3, max: 3, step: 0.1, value: state.drift,
    format: v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' s',
    onInput: v => { state.drift = v; render(); },
  });
  const sSeed = slider({
    name: '数据集', hint: '换一批随机数据',
    min: 1, max: 30, step: 1, value: state.seed,
    format: v => '#' + v, onInput: v => { state.seed = v; render(); },
  });
  const sN = slider({
    name: '测定次数', min: 8, max: 30, step: 1, value: state.n,
    format: v => String(v), onInput: v => { state.n = v; render(); },
  });

  root.append(
    panel('参数', h('div', { class: 'controls' }, sDrift.el, sSeed.el, sN.el),
      h('div', { class: 'btn-row', style: 'margin-top:12px' },
        h('button', { class: 'btn', onclick: () => { state.drift = 0; sDrift.set(0); render(); } }, '受控状态'),
        h('button', { class: 'btn', onclick: () => { state.drift = 1.2; sDrift.set(1.2); render(); } }, '轻微漂移'),
        h('button', { class: 'btn', onclick: () => { state.drift = 2.5; sDrift.set(2.5); render(); } }, '明显失控'))),
    panel('控制图', cw),
    panel('读数', roHost),
    findHost,
  );

  /** 用固定种子生成可复现的伪随机序列 */
  function makeRng(seed) {
    let s = seed * 9301 + 49297;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function render() {
    const rng = makeRng(state.seed);
    // 目标值 5.00，方法标准差 0.30（这两项通常来自历史数据）
    const MU = 5.00, SIGMA = 0.30;
    const vals = [];
    for (let i = 0; i < state.n; i++) {
      // 漂移随序号累积，模拟仪器逐渐失准
      const driftAmt = state.drift * SIGMA * (i / (state.n - 1));
      vals.push(MU + driftAmt + gaussian(rng) * SIGMA);
    }

    const UCL = MU + 3 * SIGMA, LCL = MU - 3 * SIGMA;
    const UWL = MU + 2 * SIGMA, LWL = MU - 2 * SIGMA;

    chart.xRange = [1, state.n];
    chart.yRange = [MU - 4 * SIGMA, MU + 4 * SIGMA];
    chart.setVRanges([]);
    // 用色带表示三个区：中心区、警告区、控制区
    chart.setBands([
      { lo: UWL, hi: UCL, color: 'var(--w-amber)', alpha: 0.07, label: '' },
      { lo: LCL, hi: LWL, color: 'var(--w-amber)', alpha: 0.07, label: '' },
      { lo: UCL, hi: MU + 4.2 * SIGMA, color: 'var(--w-red)', alpha: 0.09, label: '失控区' },
      { lo: MU - 4.2 * SIGMA, hi: LCL, color: 'var(--w-red)', alpha: 0.09, label: '失控区' },
    ]);
    // 上下控制限用水平参考线画（Chart 的 marker 只支持竖线）
    chart.setMarkers([]);
    const line = y => [{ x: 1, y }, { x: state.n, y }];
    chart.setSeries([
      { name: 'UCL', points: line(UCL), color: 'var(--w-red)', width: 1.4, dash: [6, 4], yFormat: v => v.toFixed(2) },
      { name: 'UWL', points: line(UWL), color: 'var(--w-amber)', width: 1.2, dash: [4, 4], yFormat: v => v.toFixed(2) },
      { name: '中心线', points: line(MU), color: 'var(--w-teal)', width: 1.4, yFormat: v => v.toFixed(2) },
      { name: 'LWL', points: line(LWL), color: 'var(--w-amber)', width: 1.2, dash: [4, 4], yFormat: v => v.toFixed(2) },
      { name: 'LCL', points: line(LCL), color: 'var(--w-red)', width: 1.4, dash: [6, 4], yFormat: v => v.toFixed(2) },
      {
        name: '测定值',
        points: vals.map((v, i) => ({
          x: i + 1, y: v,
          tone: v > UCL || v < LCL ? '--w-red' : (v > UWL || v < LWL ? '--w-amber' : '--w-green'),
        })),
        color: 'var(--faint)', width: 1.2, dots: true, dotR: 3.6,
        yFormat: v => v.toFixed(3),
      },
    ]);
    chart.draw();

    // 判异
    const over3 = vals.filter(v => v > UCL || v < LCL).length;
    const over2 = vals.filter(v => (v > UWL && v <= UCL) || (v < LWL && v >= LCL)).length;
    // 连续 7 点在中心线同侧
    let run = 1, maxRun = 1;
    for (let i = 1; i < vals.length; i++) {
      if ((vals[i] > MU) === (vals[i - 1] > MU)) { run++; maxRun = Math.max(maxRun, run); }
      else run = 1;
    }
    const m = mean(vals), sd = stdev(vals);

    roHost.replaceChildren(readouts([
      { k: '中心线 CL', v: MU.toFixed(2) },
      { k: '实测均值', v: m.toFixed(3), tone: Math.abs(m - MU) < SIGMA ? 'good' : 'warn' },
      { k: '实测标准差 s', v: sd.toFixed(3), tone: Math.abs(sd - SIGMA) < 0.1 ? 'good' : 'warn' },
      { k: '越过 3s 的点', v: String(over3), tone: over3 ? 'bad' : 'good' },
      { k: '落在 2s~3s 的点', v: String(over2), tone: over2 > 1 ? 'warn' : '' },
      { k: '最长同侧连续', v: String(maxRun), tone: maxRun >= 7 ? 'bad' : 'good' },
    ]));

    // 结论
    let msg;
    if (over3 > 0) {
      msg = `<b>判定失控。</b>有 ${over3} 个点越过了 3s 控制限——按休哈特规则，只要出现一个这样的点，` +
        `就要停止测定、查找原因（试剂、仪器、操作）。` +
        `<br>注意图上红色区域：那是<b>统计上不可能出现</b>的区间（概率约 0.3%）。出现就说明确实有问题。`;
    } else if (maxRun >= 7) {
      msg = `<b>判定异常。</b>没有任何点越过 3s，但出现了 <b>${maxRun} 个连续点落在中心线同侧</b>。` +
        `<br>这条规则很多人都不知道——单看每个点都"正常"，但连续同侧意味着存在<b>系统性偏移</b>，` +
        `只是幅度还不够大。此时查原因比等它越限更划算。`;
    } else if (over2 > 1) {
      msg = `有 ${over2} 个点落在 2s~3s 的<b>警告区</b>。单个点落在警告区属正常波动（概率约 5%），` +
        `但连续出现就值得警惕。再观察几组数据。`;
    } else {
      msg = `<b>过程受控。</b>所有点都在 2s 以内，也没有连续同侧的异常模式。` +
        `<br>注意：受控不等于准确——控制图只能告诉你<b>精密度</b>稳定，` +
        `是否准确要靠<b>加标回收率</b>或标准物质来验证。两者必须分开评估。`;
    }
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    stop() {},
    record() {
      const rng = makeRng(state.seed);
      const MU = 5.00, SIGMA = 0.30;
      const vals = [];
      for (let i = 0; i < state.n; i++) {
        vals.push(MU + state.drift * SIGMA * (i / (state.n - 1)) + gaussian(rng) * SIGMA);
      }
      const over3 = vals.filter(v => Math.abs(v - MU) > 3 * SIGMA).length;
      return {
        sim: '质量控制图',
        params: [`共 ${state.n} 次测定`, `系统漂移 ${state.drift.toFixed(1)} s`],
        readings: [
          `实测均值 ${mean(vals).toFixed(3)}，标准差 ${stdev(vals).toFixed(3)}`,
          `越过 3s 的点：${over3} 个`,
          `判定：${over3 ? '失控' : '受控'}`,
        ],
      };
    },
    params() { return { drift: state.drift, seed: state.seed, n: state.n }; },
  };
}
