/**
 * 模拟器十四：分子与配合物的空间构型
 *
 * 补上「微观层」此前唯一缺失的形态——二维粒子图看得出多少，看不出「怎么排布」。
 * 配位数与空间构型的关系（4 配位可能是四面体也可能是平面正方形）是二维图示
 * 说不清、必须转到三维才能理解的内容。
 *
 * 教学指向：
 *   · 同样 4 配位，Zn²⁺ 是四面体、Cu²⁺ 是平面正方形——配位数不决定构型
 *   · 6 配位为八面体，是螯合物与多数金属-EDTA 配合物的基本骨架
 *   · 螯合物的稳定性来自成环，EDTA 与金属形成 1:1 配合物
 */

import { Molecule3D } from '../views.js';
import { h, panel, readouts, finding } from './common.js';

export const meta = {
  id: 'molecule3d',
  name: '空间构型',
  wave: '450 nm',
  accent: '--w-indigo',
  desc: '拖动旋转看分子的立体结构——同样 4 配位，为什么 Zn²⁺ 是四面体、Cu²⁺ 却是平面正方形？',
};

const T = 1 / Math.sqrt(3);
const tetra = (d) => [[T, T, T], [T, -T, -T], [-T, T, -T], [-T, -T, T]].map(v => v.map(c => c * d));

/** 生成正多边形顶点（xy 平面） */
const ring = (r, n, phase = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (Math.PI * 2 * i) / n;
    return [r * Math.cos(a), r * Math.sin(a), 0];
  });

const MOLECULES = [
  {
    name: '甲烷 CH₄',
    note: '碳的 4 个键指向正四面体的四个顶点，键角 109.5°。这是 sp³ 杂化的几何结果，也是理解一切四面体构型的起点。',
    center: 'C', cn: 4, geo: '正四面体', angle: '109.5°',
    build() {
      const atoms = [{ el: 'C', x: 0, y: 0, z: 0 }];
      const bonds = [];
      tetra(1.09).forEach(([x, y, z]) => {
        atoms.push({ el: 'H', x, y, z });
        bonds.push([0, atoms.length - 1]);
      });
      return { atoms, bonds };
    },
  },
  {
    name: '苯 C₆H₆',
    note: '六个碳共平面，键长完全均等——不是单双键交替，而是离域的大 π 键。芳环在红外上有 1600/1500 的骨架峰，在紫外区有特征吸收。',
    center: '—', cn: 6, geo: '平面正六边形', angle: '120°',
    build() {
      const atoms = [];
      const bonds = [];
      const C = ring(1.40, 6), Hh = ring(2.48, 6);
      C.forEach(([x, y, z]) => atoms.push({ el: 'C', x, y, z }));
      Hh.forEach(([x, y, z]) => atoms.push({ el: 'H', x, y, z }));
      for (let i = 0; i < 6; i++) {
        bonds.push([i, (i + 1) % 6]);
        bonds.push([i, i + 6]);
      }
      return { atoms, bonds };
    },
  },
  {
    name: '丙酮 (CH₃)₂CO',
    note: '羰基碳是 sp² 杂化，C=O 与两侧 C—C 共平面。羰基在红外 1715 cm⁻¹ 有强吸收——位置随共轭与氢键移动。',
    center: 'C', cn: 3, geo: '平面三角形（羰基碳）', angle: '120°',
    build() {
      const atoms = [
        { el: 'C', x: 0, y: 0, z: 0 },        // 羰基碳
        { el: 'O', x: 0, y: 1.22, z: 0 },
      ];
      const bonds = [[0, 1]];
      const c2 = [-1.30, -0.76, 0], c3 = [1.30, -0.76, 0];
      atoms.push({ el: 'C', x: c2[0], y: c2[1], z: c2[2] });
      bonds.push([0, 2]);
      atoms.push({ el: 'C', x: c3[0], y: c3[1], z: c3[2] });
      bonds.push([0, 3]);
      // 甲基上的氢（示意位置）
      [[2, c2], [3, c3]].forEach(([ci, c]) => {
        const dir = [c[0] < 0 ? -1 : 1, 0.55, 0];
        [[0, 1, 1], [0.87, -0.5, 0], [0, 0.5, 1.6]].forEach(off => {
          const x = c[0] + off[0] * 0.6, y = c[1] + off[1] * 0.6, z = off[2] * 0.6;
          atoms.push({ el: 'H', x, y, z });
          bonds.push([ci, atoms.length - 1]);
        });
      });
      return { atoms, bonds };
    },
  },
  {
    name: '[Zn(NH₃)₄]²⁺',
    note: '4 配位，正四面体。Zn²⁺ 的 d¹⁰ 全充满，配体场稳定化能为零，因此采取能量最低的四面体排布。',
    center: 'Zn²⁺', cn: 4, geo: '正四面体', angle: '109.5°',
    build() {
      const atoms = [{ el: 'Zn', x: 0, y: 0, z: 0 }];
      const bonds = [];
      tetra(2.05).forEach(([x, y, z]) => {
        atoms.push({ el: 'N', x, y, z });
        bonds.push([0, atoms.length - 1]);
      });
      return { atoms, bonds };
    },
  },
  {
    name: '[Cu(NH₃)₄]²⁺',
    note: '同样是 4 配位，却是平面正方形。Cu²⁺ 是 d⁹，四个配体在平面上的排布能获得更大的配体场稳定化能——**配位数相同，构型可以不同**。',
    center: 'Cu²⁺', cn: 4, geo: '平面正方形', angle: '90°',
    build() {
      const atoms = [{ el: 'Cu', x: 0, y: 0, z: 0 }];
      const bonds = [];
      [[2.05, 0, 0], [-2.05, 0, 0], [0, 2.05, 0], [0, -2.05, 0]].forEach(([x, y, z]) => {
        atoms.push({ el: 'N', x, y, z });
        bonds.push([0, atoms.length - 1]);
      });
      return { atoms, bonds };
    },
  },
  {
    name: '[Fe(CN)₆]³⁻',
    note: '6 配位，正八面体。这是多数金属-EDTA 配合物与螯合物的基本骨架；EDTA 的六个配位原子也是按八面体方向包围金属离子的。',
    center: 'Fe³⁺', cn: 6, geo: '正八面体', angle: '90°',
    build() {
      const atoms = [{ el: 'Fe', x: 0, y: 0, z: 0 }];
      const bonds = [];
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      dirs.forEach(([dx, dy, dz]) => {
        atoms.push({ el: 'C', x: dx * 1.92, y: dy * 1.92, z: dz * 1.92 });
        const ci = atoms.length - 1;
        bonds.push([0, ci]);
        atoms.push({ el: 'N', x: dx * 3.05, y: dy * 3.05, z: dz * 3.05 });
        bonds.push([ci, atoms.length - 1]);
      });
      return { atoms, bonds };
    },
  },
];

export function mount(root, params = {}) {
  const state = { idx: params.c != null ? +params.c : 3, showBonds: true };

  const cv = h('canvas');
  const mol = new Molecule3D(cv);

  const roHost = h('div');
  const findHost = h('div');

  const sel = h('select', {
    onchange: e => { state.idx = +e.target.value; render(); },
  }, ...MOLECULES.map((m, i) => h('option', { value: i }, m.name)));
  sel.value = String(state.idx);

  root.append(
    panel('分子',
      h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('span', { class: 'ctl-name' }, '选择分子或配合物')),
        sel)),
    panel('三维结构（拖动旋转）',
      h('div', { class: 'bench single' },
        h('div', { class: 'bench-cell', style: 'height:420px' },
          h('div', { class: 'bench-tag' }, '微观层', ' ', h('b', {}, '球棍模型')), cv))),
    panel('结构参数', roHost),
    findHost,
  );

  function render() {
    const m = MOLECULES[state.idx] || MOLECULES[0];   // URL 参数越界时回退，别让整页空白
    const built = m.build();
    mol.setMolecule(built);

    const counts = {};
    built.atoms.forEach(a => counts[a.el] = (counts[a.el] || 0) + 1);

    roHost.replaceChildren(readouts([
      { k: '中心原子', v: m.center, unit: '' },
      { k: '配位数', v: m.cn > 0 ? String(m.cn) : '—' },
      { k: '空间构型', v: m.geo },
      { k: '键角', v: m.angle },
      { k: '原子总数', v: String(built.atoms.length) },
    ]));

    findHost.replaceChildren(finding(
      `<b>${m.name}</b>　${m.note}` +
      `<br>原子组成：${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('　')}`
    ));
  }

  render();

  return {
    stop() { mol.stop(); },
    record() {
      const m = MOLECULES[state.idx] || MOLECULES[0];   // URL 参数越界时回退，别让整页空白
      const built = m.build();
      return {
        sim: '分子与配合物的空间构型',
        params: [`分子：${m.name}`],
        readings: [
          `中心原子 ${m.center}，配位数 ${m.cn}`,
          `空间构型：${m.geo}，键角 ${m.angle}`,
          `原子总数 ${built.atoms.length}`,
        ],
      };
    },
    params() { return { c: state.idx }; },
  };
}
