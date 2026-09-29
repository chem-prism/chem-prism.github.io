import { h, panel, readouts } from './common.js';
import { Scene } from '../glassware.js';
import { ParticleField } from '../views.js';
import { extsOf } from './groups.js';

/**
 * 本文件的能力版本号，由 app.js 读了打到控制台。
 *
 * 为什么要这个东西：静态站点没有构建步骤，模块是浏览器各存各的缓存
 * （`python3 -m http.server` 不发 Cache-Control，GitHub Pages 是 max-age=600），
 * 于是浏览器里可能**新旧模块混着跑**——app.js 是新的、lab-shell.js 是旧的，
 * 症状是「导航是新的，但实验页少了某个标签」，而且普通刷新不解决。
 * 2026-09-29 在 Edge 上真踩过一次。
 * 控制台那行会写明 lab-shell 的版本；对不上就是缓存，硬刷新即可。
 */
export const SHELL_BUILD = '2026-09-29b';

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
  // 本实验挂哪些参数型模拟器作「拓展模块」，由分组表给出（顺序即显示顺序）
  const exts = extsOf(spec.id);
  const boundedExt = id => (exts.includes(id) ? id : (exts[0] || ''));
  const state = {
    // mode=ext 只在本实验确实有拓展模块时才认；否则回落，避免 URL 手改出一个空页面
    mode: params.mode === 'ext' && exts.length ? 'ext'
      : params.mode === 'practice' ? 'practice' : 'guide',
    ext: boundedExt(params.ext),
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
  const extHost = h('div');
  const layout = h('div', { class: 'lab-representations' },
    h('section', { class: 'lab-macro' },
      h('div', { class: 'panel-label' }, '宏观层 · 实验装置'),
      h('div', { class: 'lab-canvas' }, macro.cv), macroNote),
    h('section', { class: 'lab-micro' },
      h('div', { class: 'panel-label' }, '微观层 · ', microTitle),
      h('div', { class: 'lab-particles' }, micro.cv), microNote),
    h('section', { class: 'lab-symbols' },
      h('div', { class: 'panel-label' }, '符号层 · 反应与衡算'), signHost));
  const readPanel = panel('本步读数', readHost);
  const modelNoteEl = h('p', { class: 'lab-model-note' }, spec.modelNote);
  // 拓展模式下要让位的实验区（本步读数面板与模型说明也在内）
  const labOnly = [controlsHost, stepHost, layout, extraHost, readPanel, reviewHost, modelNoteEl];
  root.append(modeHost, controlsHost, stepHost, layout,
    extraHost, readPanel, reviewHost, extHost, modelNoteEl);

  const activeOps = () => state.mode === 'guide' ? spec.guide : state.ops;
  const activeStep = () => state.mode === 'guide' ? state.step : state.review;
  // 首帧不过渡：初值设成当前该画的那一步
  let lastStep = (state.mode === 'practice' && !state.run) ? -1 : activeStep();
  const notify = () => root.dispatchEvent(new CustomEvent('sim-state-change', { bubbles: true }));
  function update() {
    rebuild();
    notify();
  }
  function buildModes() {
    const defs = [['guide', '教学模式'], ['practice', '练习模式']];
    if (exts.length) defs.push(['ext', '拓展模块']);
    const tabs = defs.map(([id, text]) =>
      h('button', {
        class: 'mode-tab' + (state.mode === id ? ' on' : ''),
        'aria-pressed': String(state.mode === id),
        onclick: () => { if (state.mode !== id) { switchMode(id); } },
      }, h('b', {}, text)));
    modeHost.replaceChildren(h('div', {
      class: 'mode-bar', role: 'group', 'aria-label': '实验模式',
    }, ...tabs));
  }

  /* ---------- 拓展模块（参数型模拟器就地运行） ----------
   * 每个课程实验挂 2–4 个参数型模拟器作原理底座，学生不必离开实验页。
   * 三条注意：
   *   ① 一次只挂一个：每个模拟器都自带 rAF 循环，同时跑两个画面会互相抢帧。
   *   ② id 只认分组表白名单 —— ?ext= 是 URL 参数，不能直接拼进 import 路径。
   *   ③ 模块按需 import('./<id>.js')，浏览器会命中 app.js 已加载的那份，不会重复下载。
   */
  let extMods = null;         // Map<id, module>，首次进入拓展模式时一次性载入
  let extLoading = false;
  let extInstance = null;     // 当前挂在页内的拓展模拟器实例
  const EXT_STORE = 'cp:ext:';   // 拓展模块自己的滑块值，按 cp: 前缀另存，不污染实验的 URL 参数

  function unmountExt() {
    if (!extInstance) return;
    // stop 是标准出口，destroy 只有部分视图组件有；两个都试，别让异常打断切换
    try { extInstance.stop?.(); } catch { /* 忽略 */ }
    try { extInstance.destroy?.(); } catch { /* 忽略 */ }
    extInstance = null;
  }
  function saveExtOpts() {
    if (!extInstance || !extInstance.params) return;
    try {
      localStorage.setItem(EXT_STORE + spec.id + ':' + state.ext, JSON.stringify(extInstance.params()));
    } catch { /* 隐私模式等，忽略 */ }
  }
  function readExtOpts(id) {
    try { return JSON.parse(localStorage.getItem(EXT_STORE + spec.id + ':' + id) || '{}') || {}; } catch { return {}; }
  }
  function loadExtMods() {
    if (extMods || extLoading) return;
    extLoading = true;
    Promise.all(exts.map(async id => [id, await import(`./${id}.js`)]))
      // refresh 之后再 notify：app.js 的「实验记录」是在挂载时取一次，
      // 异步载入这条路上若不发事件，记录区会一直停在「拓展模块载入中」。
      .then(pairs => { extMods = new Map(pairs); extLoading = false; refresh(); notify(); })
      .catch(err => {
        extLoading = false;
        console.error('拓展模块载入失败：', err);
        extHost.replaceChildren(h('div', { class: 'idle-note' }, '拓展模块载入失败，请刷新页面重试。'));
      });
  }

  function buildExt() {
    if (!extMods) { loadExtMods(); return; }
    const mod = extMods.get(state.ext);
    // 切换模块前先把上一个的滑块值收好
    const tabs = h('div', { class: 'mode-bar', role: 'group', 'aria-label': '拓展模块' },
      ...exts.map(id => h('button', {
        class: 'mode-tab' + (id === state.ext ? ' on' : ''),
        'aria-pressed': String(id === state.ext),
        onclick: () => {
          if (id === state.ext) return;
          saveExtOpts();
          state.ext = id;
          update();
        },
      }, h('b', {}, extMods.get(id)?.meta?.name || id))));
    const body = h('div', { class: 'ext-body' });
    extHost.replaceChildren(panel('拓展模块',
      tabs,
      h('p', { class: 'ext-note' }, mod?.meta?.desc || ''),
      body));
    unmountExt();
    if (!mod) return;
    try {
      extInstance = mod.mount(body, readExtOpts(state.ext));
    } catch (err) {
      console.error('拓展模块挂载失败：', state.ext, err);
      body.replaceChildren(h('div', { class: 'idle-note' }, '该拓展模块未能载入。'));
    }
  }

  /** 切换模式：离开实验区时停掉它自己的动画，回来时再启动，别让两套 rAF 同时跑。 */
  function switchMode(id) {
    const wasExt = state.mode === 'ext';
    state.mode = id;
    if (id === 'ext') { macro.stop(); micro.stop(); }
    else if (wasExt) { macro.start(); micro.start(); }
    // 模式切换会让「当前是哪一步」整个换掉，但那不是「走进下一步」，
    // 做交叉淡入只会让人以为动画错乱。把基准对齐后刷新即可。
    lastStep = (state.mode === 'practice' && !state.run) ? -1 : activeStep();
    update();
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
    // 拓展模式：实验区整块让位给参数型模拟器，本实验的读数与衡算不参与
    const inExt = state.mode === 'ext';
    labOnly.forEach(el => { el.hidden = inExt; });
    extHost.hidden = !inExt;
    if (inExt) { buildExt(); return; }
    unmountExt();
    currentResult = spec.model(activeOps());
    const r = currentResult, i = activeStep(), step = spec.steps[i];
    const idle = state.mode === 'practice' && !state.run;
    buildSteps();
    /* 只有**步号真的变了**才做交叉淡入并重置本步时间轴。
       refresh() 在每次拖滑块时都会被调用（见 buildControls 的 oninput），
       无条件过渡会把拖滑块变成频闪；无条件重置 ts 会让入场动画反复从头开始。 */
    const stepIdx = idle ? -1 : i;
    const stepChanged = stepIdx !== lastStep;
    lastStep = stepIdx;
    macro.set((ctx, w, height, t, ts) => spec.draw(ctx, w, height, t, stepIdx, r, activeOps(), ts),
      { transition: stepChanged, resetClock: stepChanged });
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
    stop() {
      destroyed = true;
      unmountExt();
      macro.destroy(); micro.destroy(); spec.cleanup?.();
    },
    params() {
      // 学生每动一次滑块 app.js 都会调这里存档，顺手把拓展模块的值也收进 localStorage
      saveExtOpts();
      return { mode: state.mode, step: state.step, review: state.review,
        run: state.run ? '1' : '0',
        ...(exts.length ? { ext: state.ext } : {}),
        ...state.ops };
    },
    record() {
      // 拓展模式下，实验记录给的应当是学生当下正在看的那个模拟器的数据
      if (state.mode === 'ext') {
        if (extInstance && extInstance.record) return extInstance.record();
        return { sim: `${spec.name} · 拓展模块`, params: ['拓展模块载入中'], readings: [] };
      }
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
