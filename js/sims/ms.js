/**
 * 模拟器十八：质谱分析法（教材 ch16）
 *
 * 教学指向：
 *   · 分子离子峰 M⁺ 给出分子量，但常常很弱
 *   · 基峰是最强的碎片峰，反映最稳定的碎片离子
 *   · **同位素峰是卤素的指纹**：Cl 贡献 M+2 约 1/3，Br 贡献 M+2 约等强度
 *   · 碎片峰反映结构——苄基、苯甲酰基这类稳定碎片会出现特征峰
 */

import { Chart } from '../chart.js';
import { h, panel, readouts, finding } from './common.js';

export const meta = {
  id: 'ms',
  name: '质谱分析法',
  wave: '410 nm',
  accent: '--w-green',
  desc: '分子离子峰告诉你分子有多重，碎片峰和同位素峰告诉你它长什么样。',
};

/**
 * 化合物质谱数据
 * peaks: [m/z, 相对丰度 %]
 * M 为分子离子峰的 m/z（可能有多个，如含 Cl/Br 时出现 M+2）
 */
const COMPOUNDS = [
  {
    name: '乙醇 C₂H₅OH',
    M: 46,
    note: '分子离子峰很弱（脂肪醇的典型特征，M⁺ 容易继续碎裂），基峰是 m/z 31 的 CH₂OH⁺。',
    peaks: [[15, 8], [27, 12], [29, 22], [31, 100], [45, 25], [46, 18]],
  },
  {
    name: '甲苯 C₆H₅CH₃',
    M: 92,
    note: '基峰 91 是苄基离子 C₇H₇⁺——苄基正离子特别稳定，会强烈抢占电荷。分子离子峰 92 也较强。',
    peaks: [[39, 18], [51, 14], [65, 22], [77, 12], [91, 100], [92, 62]],
  },
  {
    name: '苯乙酮 C₆H₅COCH₃',
    M: 120,
    note: '基峰 105 是苯甲酰基离子 C₆H₅CO⁺。羰基化合物优先在羰基两侧断裂，生成酰基正离子。',
    peaks: [[43, 20], [51, 12], [77, 28], [105, 100], [120, 38]],
  },
  {
    name: '氯苯 C₆H₅Cl',
    M: 112,
    note: '因为有 ³⁷Cl（天然丰度约为 ³⁵Cl 的 1/3），分子离子区出现 112 与 114 一对峰，强度比约 3:1。**含氯与否，一眼可辨。**',
    peaks: [[38, 10], [50, 14], [51, 22], [75, 12], [77, 100], [112, 32], [114, 11]],
  },
  {
    name: '溴苯 C₆H₅Br',
    M: 156,
    note: '⁷⁹Br 与 ⁸¹Br 的天然丰度几乎相等，所以 156 与 158 是一对**近乎等高**的峰。这是判断含溴的决定性证据。',
    peaks: [[50, 16], [51, 22], [75, 10], [76, 12], [77, 100], [155, 14], [156, 30], [157, 16], [158, 29]],
  },
];

export function mount(root, params = {}) {
  const state = { idx: params.c != null ? +params.c : 1, showLabels: true };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: '质荷比 m/z', yLabel: '相对丰度 / %',
    xRange: [0, 180], yRange: [0, 110],
    pad: { l: 46, r: 16, t: 14, b: 34 },
  });
  chart.xFormat = v => v.toFixed(0);

  const roHost = h('div');
  const findHost = h('div');

  const sel = h('select', {
    onchange: e => { state.idx = +e.target.value; render(); },
  }, ...COMPOUNDS.map((c, i) => h('option', { value: i }, c.name)));
  sel.value = String(state.idx);

  root.append(
    panel('样品',
      h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '选择化合物')),
        sel)),
    panel('质谱图', cw),
    panel('读数', roHost),
    findHost,
  );

  function render() {
    const c = COMPOUNDS[state.idx] || COMPOUNDS[0];

    // 只画有峰的位置，按 m/z 排序
    const peaks = [...c.peaks].sort((a, b) => a[0] - b[0]);
    const maxMz = Math.max(...peaks.map(p => p[0]));
    chart.xRange = [0, Math.ceil(maxMz / 20) * 20 + 10];

    // 分子离子峰与同位素峰用不同颜色标出
    const isM = p => p >= c.M - 0.5;
    const base = peaks.reduce((a, b) => (b[1] > a[1] ? b : a));

    chart.setBands([]);
    chart.setVRanges([]);
    chart.setMarkers([]);
    // 峰位标注：只标够强的峰，且相邻太近的错开上下，否则 156/158 这类
    // 同位素峰会挤成一团看不清。
    const labeled = peaks.filter(p => p[1] >= 20);
    let lastLabelX = -Infinity, labelLevel = 0;
    chart.setLabels(labeled.map(p => {
      if (p[0] - lastLabelX < 14) labelLevel = (labelLevel + 1) % 2; else labelLevel = 0;
      lastLabelX = p[0];
      return {
        x: p[0], y: p[1] + 4 + labelLevel * 9, text: String(p[0]),
        color: isM(p[0]) ? 'var(--w-amber)' : 'var(--dim)', align: 'center', baseline: 'bottom',
      };
    }));
    chart.setSeries([
      {
        name: '碎片峰',
        points: peaks.filter(p => !isM(p[0])).map(p => ({ x: p[0], y: p[1] })),
        color: 'var(--faint)', bars: true, barWidth: 3,
      },
      {
        name: '分子离子区',
        points: peaks.filter(p => isM(p[0])).map(p => ({ x: p[0], y: p[1] })),
        color: 'var(--w-amber)', bars: true, barWidth: 3,
      },
    ]);
    chart.draw();

    // 判断同位素模式
    const mPlus2 = peaks.find(p => Math.abs(p[0] - (c.M + 2)) < 0.5);
    const mPeak = peaks.find(p => Math.abs(p[0] - c.M) < 0.5) || [c.M, 0];
    const hasCl = c.name.includes('Cl');
    const hasBr = c.name.includes('Br');
    let isoText = '无特征同位素';
    if (hasCl && mPlus2) isoText = `M 与 M+2 强度比约 ${(mPeak[1] / mPlus2[1]).toFixed(1)} : 1（含氯）`;
    else if (hasBr && mPlus2) isoText = `M 与 M+2 强度比约 ${(mPeak[1] / mPlus2[1]).toFixed(1)} : 1（含溴）`;

    roHost.replaceChildren(readouts([
      { k: '分子离子峰 M⁺', v: `${c.M}`, unit: '' },
      { k: '分子离子峰强度', v: mPeak[1].toFixed(0), unit: '%', tone: mPeak[1] > 30 ? 'good' : 'warn' },
      { k: '基峰 m/z', v: String(base[0]), unit: '' },
      { k: '基峰丰度', v: '100', unit: '%' },
      { k: '同位素特征', v: isoText, tone: (hasCl || hasBr) ? 'good' : '' },
    ]));

    let msg = `<b>${c.name}</b>：${c.note}` +
      `<br>分子量由<b>分子离子峰</b>给出：M⁺ = ${c.M}。基峰是 m/z ${base[0]}，代表最稳定的碎片离子。`;

    if (hasCl) {
      msg += `<br><b>看 112 与 114 这一对峰</b>——强度比约 3:1，这是含<b>一个氯</b>的判断依据（³⁵Cl : ³⁷Cl ≈ 3:1）。`;
    } else if (hasBr) {
      msg += `<br><b>看 156 与 158 这一对峰</b>——几乎等高，这是含<b>一个溴</b>的判断依据（⁷⁹Br : ⁸¹Br ≈ 1:1）。`;
    } else {
      msg += `<br>这张图没有明显的 M+2 同位素峰，说明分子中不含氯或溴。`;
    }
    msg += `<br>碎片峰的位置反映结构：分子越容易断成某个稳定正离子，那个峰就越强。`;
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    stop() {},
    record() {
      const c = COMPOUNDS[state.idx] || COMPOUNDS[0];
      const base = c.peaks.reduce((a, b) => (b[1] > a[1] ? b : a));
      return {
        sim: '质谱分析法',
        params: [`样品：${c.name}`],
        readings: [
          `分子离子峰 M⁺ = ${c.M}`,
          `基峰 m/z = ${base[0]}`,
          `主要碎片：${[...c.peaks].sort((a, b) => b[1] - a[1]).slice(0, 4).map(p => `${p[0]}(${p[1]}%)`).join('、')}`,
        ],
      };
    },
    params() { return { c: state.idx }; },
  };
}
