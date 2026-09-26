import { h, panel, readouts } from './common.js';
import { Scene } from '../glassware.js';
import { ParticleField } from '../views.js';

export function normalizeControls(controls, values, defaults) {
  const out = {};
  for (const c of controls) {
    if (c.options) {
      const raw = Number(values[c.key] ?? defaults[c.key] ?? 0);
      out[c.key] = Number.isInteger(raw)
        ? Math.max(0, Math.min(c.options.length - 1, raw))
        : 0;
      continue;
    }
    const n = Number(values[c.key] ?? defaults[c.key]);
    const value = Number.isFinite(n) ? n : defaults[c.key];
    out[c.key] = Number(Math.min(c.max, Math.max(c.min,
      c.min + Math.round((value - c.min) / c.step) * c.step)).toFixed(8));
  }
  return out;
}

/** Shared lifecycle only; chemistry and step content remain in each experiment. */
export function mountLab(root, params, spec) {
  root.classList.add('process-lab');
  const boundedStep = n => Math.min(spec.steps.length - 1, Math.max(0, Number.isFinite(+n) ? Math.floor(+n) : 0));
  const state = {
    mode: params.mode === 'practice' ? 'practice' : 'guide',
    step: boundedStep(params.step),
    review: boundedStep(params.review ?? spec.steps.length - 1),
    run: String(params.run) === '1',
    ops: normalizeControls(spec.controls, params, spec.defaults),
  };
  let destroyed = false;
  let currentResult;
  let visibleReadings = [];
  const macro = new Scene(h('canvas', { 'aria-label': '实验装置示意图', role: 'img' }));
  const micro = new ParticleField(h('canvas', { 'aria-label': '微观物种示意图', role: 'img' }));
  const modeHost = h('div');
  const controlsHost = h('div');
  const stepHost = h('div');
  const macroNote = h('div', { class: 'lab-caption' });
  const microNote = h('div', { class: 'lab-caption' });
  const microTitle = h('b');
  const signHost = h('div');
  const readHost = h('div');
  const reviewHost = h('div');
  const extraHost = h('div');
  const layout = h('div', { class: 'lab-representations' },
    h('section', { class: 'lab-macro' },
      h('div', { class: 'panel-label' }, '宏观层 · 实验装置'),
      h('div', { class: 'lab-canvas' }, macro.cv), macroNote),
    h('section', { class: 'lab-micro' },
      h('div', { class: 'panel-label' }, '微观层 · ', microTitle),
      h('div', { class: 'lab-particles' }, micro.cv), microNote),
    h('section', { class: 'lab-symbols' },
      h('div', { class: 'panel-label' }, '符号层 · 反应与衡算'), signHost));
  root.append(modeHost, controlsHost, stepHost, layout,
    extraHost, panel('本步读数', readHost), reviewHost,
    h('p', { class: 'lab-model-note' }, spec.modelNote));

  const activeOps = () => state.mode === 'guide' ? spec.guide : state.ops;
  const activeStep = () => state.mode === 'guide' ? state.step : state.review;
  const notify = () => root.dispatchEvent(new CustomEvent('sim-state-change', { bubbles: true }));
  function update() {
    rebuild();
    notify();
  }
  function buildModes() {
    const tabs = [['guide', '教学模式'], ['practice', '练习模式']].map(([id, text]) =>
      h('button', {
        class: 'mode-tab' + (state.mode === id ? ' on' : ''),
        'aria-pressed': String(state.mode === id),
        onclick: () => { if (state.mode !== id) { state.mode = id; update(); } },
      }, h('b', {}, text)));
    modeHost.replaceChildren(h('div', {
      class: 'mode-bar', role: 'group', 'aria-label': '实验模式',
    }, ...tabs));
  }
  function buildControls() {
    controlsHost.replaceChildren();
    if (state.mode !== 'practice') return;
    const runButton = h('button', { class: 'btn primary', 'data-action': 'run',
      onclick: () => { state.run = true; update(); } }, state.run ? '重新运行' : '运行实验');
    const rows = spec.controls.map(c => {
      const fmt = v => c.options ? c.options[v] : `${v}${c.unit || ''}`;
      const value = h('output', { class: 'ctl-val', for: `${spec.id}-${c.key}` }, fmt(state.ops[c.key]));
      const attrs = { id: `${spec.id}-${c.key}`, 'aria-label': c.label, 'data-param': c.key,
        onchange: e => {
          if (!c.options) return;
          state.ops[c.key] = +e.target.value; state.run = false; update();
        } };
      const input = c.options
        ? h('select', attrs, ...c.options.map((label, i) => h('option', {
          value: i, selected: i === state.ops[c.key] ? '' : null,
        }, label)))
        : h('input', { ...attrs, type: 'range', min: c.min, max: c.max, step: c.step,
          value: state.ops[c.key],
          oninput: e => {
            state.ops[c.key] = +e.target.value;
            value.textContent = fmt(state.ops[c.key]);
            state.run = false;
            runButton.textContent = '运行实验';
            refresh();
            notify();
          } });
      return h('div', { class: 'ctl' },
        h('div', { class: 'ctl-head' }, h('label', { for: attrs.id }, c.label), value), input);
    });
    controlsHost.append(panel('操作参数', h('div', { class: 'controls' }, ...rows),
      h('div', { class: 'btn-row' }, runButton,
        h('button', { class: 'btn', onclick: () => {
          state.ops = { ...spec.defaults }; state.run = false; update();
        } }, '恢复初始设置'))));
  }
  function buildSteps() {
    stepHost.replaceChildren();
    if (state.mode === 'practice' && !state.run) return;
    const index = activeStep(), step = spec.steps[index];
    const go = i => {
      if (state.mode === 'guide') state.step = boundedStep(i);
      else state.review = boundedStep(i);
      update();
    };
    stepHost.append(h('section', { class: 'lab-step' },
      h('div', { class: 'step-bar', 'aria-label': state.mode === 'guide' ? '实验步骤' : '运行复盘' },
        ...spec.steps.map((s, i) => h('button', {
          class: 'step-chip' + (i === index ? ' on' : ''),
          'aria-current': i === index ? 'step' : 'false',
          'aria-label': `第${i + 1}步 ${s.name}`, title: s.name, onclick: () => go(i),
        }, String(i + 1)))),
      h('div', { class: 'step-head' }, h('span', { class: 'step-idx' }, `${index + 1} / ${spec.steps.length}`),
        h('b', {}, step.name), state.mode === 'practice' ? h('span', {}, '本次运行复盘') : null),
      h('div', { class: 'step-op' }, step.op),
      h('div', { class: 'step-why' }, step.why),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', disabled: index === 0 ? '' : null, onclick: () => go(index - 1) }, '← 上一步'),
        h('button', { class: 'btn', disabled: index === spec.steps.length - 1 ? '' : null,
          onclick: () => go(index + 1) }, '下一步 →'))));
  }
  function refresh() {
    if (destroyed) return;
    currentResult = spec.model(activeOps());
    const r = currentResult, i = activeStep(), step = spec.steps[i];
    const idle = state.mode === 'practice' && !state.run;
    buildSteps();
    macro.set((ctx, w, height, t) => spec.draw(ctx, w, height, t, idle ? -1 : i, r, activeOps()));
    macro.cv.setAttribute('aria-label', idle ? '尚未运行' : `${step.name}：${step.op}`);
    const species = idle ? { title: '尚未反应', items: [], note: '' } : spec.species(i, r, activeOps());
    microTitle.textContent = species.title;
    micro.set(species.items, '');
    macroNote.textContent = idle ? '尚未运行' : spec.observation(i, r, activeOps());
    microNote.textContent = species.note || '';
    signHost.replaceChildren(h('div', { class: 'eq-line' }, idle ? spec.equation : step.eq),
      h('div', { class: 'calc-line' }, idle ? '' : spec.calculation(i, r, activeOps())));
    visibleReadings = idle ? [] : spec.readings(i, r, activeOps());
    readHost.replaceChildren(idle ? h('div', { class: 'idle-note' }, '尚未运行，无实验结果。') : readouts(visibleReadings));
    reviewHost.replaceChildren();
    if (state.mode === 'practice' && state.run) {
      reviewHost.append(panel('本次运行诊断',
        h('ul', { class: 'review-list' }, ...spec.verdict(r, activeOps()).map(text => h('li', {}, text)))));
    }
    extraHost.replaceChildren();
    if (!idle && spec.extra) spec.extra(extraHost, i, r, activeOps());
  }
  function rebuild() {
    buildModes();
    buildControls();
    refresh();
  }
  rebuild();
  macro.start();
  return {
    stop() { destroyed = true; macro.destroy(); micro.destroy(); spec.cleanup?.(); },
    params() { return { mode: state.mode, step: state.step, review: state.review,
      run: state.run ? '1' : '0', ...state.ops }; },
    record() {
      const idle = state.mode === 'practice' && !state.run;
      return {
        sim: spec.name,
        params: [
          `${state.mode === 'guide' ? '教学模式' : '练习模式'} · ${idle ? '尚未运行' : spec.steps[activeStep()].name}`,
          ...spec.controls.map(c => `${c.label} ${c.options ? c.options[activeOps()[c.key]] : activeOps()[c.key] + (c.unit || '')}`),
        ],
        readings: idle ? ['尚未运行，无实验结果'] : [
          ...visibleReadings.map(x => `${x.k} ${x.v}${x.unit || ''}`),
          '教学模拟值，非实测数据',
        ],
      };
    },
  };
}
