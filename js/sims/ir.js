/**
 * 模拟器十三：红外光谱（教材 ch16）
 *
 * 教学指向：
 *   · 波数与波长互为倒数 ν̃(cm⁻¹) = 10⁴/λ(μm)，不是正比
 *   · 吸收位置由 ν̃ ∝ √(k/μ) 决定：键越强、原子越轻，波数越高
 *   · 官能团区 4000~1300 识别官能团；指纹区 1300~400 整体比对
 *   · 同一官能团在不同化合物中的位置会移动（氢键、共轭）
 */

import { Chart } from '../chart.js';
import { h, panel, readouts, finding } from './common.js';

export const meta = {
  id: 'ir',
  name: '红外光谱',
  wave: '640 nm',
  accent: '--w-amber',
  desc: '官能团区认基团，指纹区辨身份——同一张谱图上，这两件事发生在不同的区间。',
};

/**
 * 化合物谱图数据
 * peaks: [波数 cm⁻¹, 吸收深度 %, 峰宽 σ cm⁻¹, 归属]
 * 峰宽小的多为尖锐的特征峰，O—H 因氢键缔合而宽。
 */
const COMPOUNDS = [
  {
    name: '乙醇 CH₃CH₂OH',
    note: 'O—H 又宽又强，是醇的典型特征',
    peaks: [
      [3350, 78, 150, 'O—H', 'O—H 伸缩（缔合，峰形宽）'],
      [2970, 42, 25, 'C—H', 'C—H 伸缩'],
      [2880, 34, 25, 'C—H', 'C—H 伸缩'],
      [1050, 62, 20, 'C—O', 'C—O 伸缩'],
    ],
  },
  {
    name: '丙酮 CH₃COCH₃',
    note: 'C=O 在 1715，酮的典型位置',
    peaks: [
      [3000, 18, 30, 'C—H', 'C—H 伸缩'],
      [1715, 82, 22, 'C=O', 'C=O 伸缩（酮）'],
      [1360, 40, 18, 'CH₃', 'CH₃ 弯曲'],
      [1220, 48, 22, 'C—C', 'C—C 伸缩'],
    ],
  },
  {
    name: '乙酸 CH₃COOH',
    note: 'O—H 宽峰 + C=O 双峰区，羧酸的标志',
    peaks: [
      [3000, 72, 220, 'O—H', 'O—H 伸缩（缔合，很宽）'],
      [1710, 80, 22, 'C=O', 'C=O 伸缩'],
      [1410, 32, 20, 'CH₃', 'CH₃ 弯曲'],
      [1290, 56, 26, 'C—O', 'C—O 伸缩'],
      [920, 46, 45, 'O—H', 'O—H 面外弯曲'],
    ],
  },
  {
    name: '苯甲酸 C₆H₅COOH',
    note: '芳环骨架 1600/1500 成对出现',
    peaks: [
      [3000, 66, 200, 'O—H', 'O—H 伸缩（缔合）'],
      [1690, 78, 22, 'C=O', 'C=O 伸缩（与芳环共轭，位置偏低）'],
      [1600, 38, 16, '芳环', '芳环 C=C 骨架'],
      [1500, 34, 16, '芳环', '芳环 C=C 骨架'],
      [710, 68, 25, '面外弯曲', '芳环 C—H 面外弯曲'],
    ],
  },
  {
    name: '苯乙酮 C₆H₅COCH₃',
    note: '与丙酮比：C=O 从 1715 降到 1685，共轭所致',
    peaks: [
      [3060, 16, 22, '芳环 C—H', '芳环 C—H 伸缩'],
      [1685, 80, 22, 'C=O', 'C=O 伸缩（与芳环共轭，偏低）'],
      [1600, 36, 16, '芳环', '芳环 C=C 骨架'],
      [1500, 32, 16, '芳环', '芳环 C=C 骨架'],
      [760, 62, 24, '面外弯曲', '芳环 C—H 面外弯曲'],
    ],
  },
  {
    name: '正己烷 CH₃(CH₂)₄CH₃',
    note: '只有 C—H，没有官能团——烷烃的“干净”谱图',
    peaks: [
      [2960, 60, 24, 'C—H', 'C—H 伸缩'],
      [2930, 72, 24, 'C—H', 'C—H 伸缩'],
      [2860, 56, 24, 'C—H', 'C—H 伸缩'],
      [1465, 44, 18, 'CH₂', 'CH₂ 弯曲'],
      [1380, 30, 18, 'CH₃', 'CH₃ 弯曲'],
    ],
  },
];

export function mount(root, params = {}) {
  const state = { idx: params.c != null ? +params.c : 0, showLabels: true };

  const cw = h('div', { class: 'chart-wrap' });
  const cv = h('canvas'); cw.append(cv);
  const chart = new Chart(cv, {
    xLabel: '波数 ν̃ / cm⁻¹', yLabel: '透射率 T / %',
    xRange: [4000, 400],            // 红外谱图按惯例：高波数在左
    yRange: [0, 100],
    pad: { l: 46, r: 16, t: 14, b: 34 },
  });

  const roHost = h('div');
  const findHost = h('div');

  const sel = h('select', {
    onchange: e => { state.idx = +e.target.value; render(); },
  }, ...COMPOUNDS.map((c, i) => h('option', { value: i }, c.name)));
  sel.value = String(state.idx);

  const chk = h('input', {
    type: 'checkbox',
    onchange: e => { state.showLabels = e.target.checked; render(); },
  });
  chk.checked = state.showLabels;

  root.append(
    panel('样品',
      h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '选择化合物')),
        sel),
      h('label', { class: 'btn-row', style: 'margin-top:12px;cursor:pointer' },
        chk, h('span', { style: 'font-size:12.5px;color:var(--dim)' }, '显示峰位归属'))),
    panel('红外光谱图', cw),
    panel('读数', roHost),
    findHost,
  );

  /** 由峰位数据合成透射率谱 */
  function spectrum(peaks, n = 900) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const v = 4000 - (3600 * i) / n;
      let T = 100;
      peaks.forEach(([c, d, s]) => {
        T -= d * Math.exp(-((v - c) ** 2) / (2 * s * s));
      });
      pts.push({ x: v, y: Math.max(2, T) });
    }
    return pts;
  }

  function render() {
    const comp = COMPOUNDS[state.idx] || COMPOUNDS[0];   // URL 参数越界时回退
    const pts = spectrum(comp.peaks);

    chart.setBands([]);
    chart.setVRanges([
      { x0: 4000, x1: 1300, color: 'var(--w-green)', alpha: 0.05, label: '' },
      { x0: 1300, x1: 400, color: 'var(--w-indigo)', alpha: 0.06, label: '' },
    ]);
    chart.setMarkers([]);
    // 峰位标注：用短标签（完整归属放到下方读数里）。波数相近的标签上下错开，
    // 否则竖排文字会叠在一起看不清。
    const sorted = [...comp.peaks].sort((a, b) => b[0] - a[0]);
    let lastX = Infinity, level = 0;
    const labels = sorted.map(([c, d, , short]) => {
      if (lastX - c < 240) level = (level + 1) % 3; else level = 0;
      lastX = c;
      return {
        x: c, y: 6 + level * 13, text: short,
        color: 'var(--w-amber)', rotate: -Math.PI / 2, align: 'left', baseline: 'middle',
      };
    });
    chart.setLabels(state.showLabels ? labels : []);
    chart.setSeries([{
      name: 'T', points: pts, color: 'var(--accent)', width: 1.6,
      yFormat: v => v.toFixed(1),
    }]);
    chart.draw();

    const strongest = [...comp.peaks].sort((a, b) => b[1] - a[1])[0];
    const inFingerprint = comp.peaks.filter(p => p[0] < 1300).length;

    roHost.replaceChildren(
      readouts([
        { k: '最强吸收峰', v: strongest[0].toString(), unit: 'cm⁻¹' },
        { k: '对应波长', v: (1e4 / strongest[0]).toFixed(2), unit: 'μm' },
        { k: '官能团区峰数', v: String(comp.peaks.length - inFingerprint), unit: '个' },
        { k: '指纹区峰数', v: String(inFingerprint), unit: '个' },
      ]),
      h('div', { style: 'margin-top:12px' },
        h('div', { class: 'panel-label', style: 'margin-bottom:8px' }, '峰位归属'),
        h('table', { class: 'stu-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, '波数 / cm⁻¹'), h('th', {}, '波长 / μm'), h('th', {}, '归属'))),
          h('tbody', {}, ...[...comp.peaks].sort((a, b) => b[0] - a[0]).map(([c, d, , , full]) =>
            h('tr', {},
              h('td', { class: 'stu-id' }, String(c)),
              h('td', {}, (1e4 / c).toFixed(2)),
              h('td', {}, full))))))
    );

    const msg = `<b>${comp.name}</b>：${comp.note}。` +
      `<br>最强峰在 <b>${strongest[0]} cm⁻¹</b>，对应波长 ${(1e4 / strongest[0]).toFixed(2)} μm —— ` +
      `注意两者是<b>倒数关系</b>，不是正比：波数越大，波长越短。` +
      `<br>绿色区间是<b>官能团区</b>（4000~1300），用来认基团；` +
      `蓝色区间是<b>指纹区</b>（1300~400），峰多而杂，用来整体比对、区分结构相似的化合物。`;
    findHost.replaceChildren(finding(msg));
  }

  render();

  return {
    stop() {},
    record() {
      const comp = COMPOUNDS[state.idx] || COMPOUNDS[0];   // URL 参数越界时回退
      const strongest = [...comp.peaks].sort((a, b) => b[1] - a[1])[0];
      return {
        sim: '红外光谱',
        params: [`样品：${comp.name}`],
        readings: [
          `最强吸收峰 = ${strongest[0]} cm⁻¹，对应波长 ${(1e4 / strongest[0]).toFixed(2)} μm`,
          `峰归属：${comp.peaks.map(p => `${p[0]}（${p[3]}）`).join('；')}`,
        ],
      };
    },
    params() { return { c: state.idx }; },
  };
}
