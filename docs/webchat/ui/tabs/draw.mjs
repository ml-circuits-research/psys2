import {mountInspectorSplitter} from '../pane-splitter.mjs';
// Drawing tab (world art.draw, spec 07 sections 6-7): a children's drawing board. What it shows is the SOP area
// projection of the w.drawing instance (worlds/art.draw/area.sop: host.state / update give projectSopArea): the drawn
// primitives (state.svg), the observed objects, their inputs and boxes, the options and the view keys. This module
// only draws those primitives with rough.js (vendored in ../../vendor/draw/) so they look hand-drawn, pops new things
// in, and sends every editing gesture as a declared native command (host.tool, view 'draw') - the same route as chat.
// Effects: draw.download { format: 'png' | 'svg', filename }.
import { createRenderer, readProjection, itemBox, PAPER } from './draw/render.mjs';

const VENDOR = new URL('../../vendor/draw/rough.mjs', import.meta.url);
const VIEW = 'draw';

const CSS = `
.dr-root{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:380px;gap:6px;color:#263646;font:13px system-ui;container-type:inline-size}
.dr-add-chooser{position:absolute;max-width:calc(100% - 16px);z-index:20;width:280px;max-height:65%;overflow:auto;padding:12px;box-sizing:border-box;background:#fff;border:1px solid #bbc7d5;border-radius:7px;box-shadow:0 7px 24px #24344733;display:grid;gap:8px}.dr-add-chooser label{display:grid;gap:5px}.dr-shape-choices{display:flex;gap:5px;flex-wrap:wrap}.dr-toolbar,.dr-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.dr-toolbar{padding:4px 0}.dr-toolbar label{display:flex;align-items:center;gap:6px}
.dr-workspace{display:grid;grid-template-columns:minmax(0,1fr) 264px;gap:8px;flex:1;min-height:0}.dr-board{position:relative;width:100%;height:100%;min-width:0;border:1px solid #d5dae0;background:#f7f8fa;border-radius:6px;box-sizing:border-box;overflow:hidden}.dr-paper{position:relative;width:100%;height:100%;min-height:320px;touch-action:none}.dr-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}.dr-canvas:focus-visible{box-shadow:inset 0 0 0 2px #356ac3}.dr-inspector{overflow:auto;min-width:0;background:#fff;border:1px solid #d5dae0;border-radius:6px;padding:12px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}.dr-inspector h3{font-size:13px;margin:0 0 8px}.dr-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dr-editor label{display:grid;gap:4px;min-width:0;font-size:12px;color:#536171}.dr-editor label:has(select[multiple]),.dr-editor label:has(input[type=search]),.dr-editor label:has(input[aria-label="Label"]){grid-column:1/-1}
.dr-root input,.dr-root select{font:13px system-ui;border:1px solid #d5dae0;background:#fff;color:#263646;border-radius:5px;padding:7px;min-width:0;max-width:100%;box-sizing:border-box}.dr-editor input,.dr-editor select{width:100%}.dr-act{font:600 12px system-ui;border:1px solid #d5dae0;border-radius:5px;background:#fff;color:#263646;min-height:32px;padding:6px 10px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}.dr-act:hover{background:#f0f4fa}.dr-act[aria-pressed=true]{background:#e9f0fd;border-color:#356ac3;color:#2359a9}.dr-act:disabled{opacity:.45;cursor:default}.dr-act svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2}
.dr-pose,.dr-textbar{grid-column:1/-1}.dr-pose .dr-act,.dr-textbar .dr-act{min-height:28px;padding:4px 8px}.dr-hint{position:absolute;inset:0;display:grid;place-content:center;pointer-events:none;text-align:center;padding:30px;color:#788491;font:14px system-ui}.dr-hint b{font-size:19px;font-weight:500;display:block;margin-bottom:8px}.dr-caption{margin:0;font-size:12px;color:#66717e;min-height:18px}.dr-root [hidden]{display:none!important}.dr-empty-selection{color:#788491;line-height:1.6}.dr-selection-heading{grid-column:1/-1;margin:0;font-size:13px}
@media(max-width:700px){.dr-root{height:auto;min-height:0}.dr-workspace{display:flex;flex-direction:column;flex:none}.dr-board{height:360px;min-height:280px}.dr-paper{min-height:280px}.dr-inspector{overflow:visible}.dr-act{min-height:44px}.dr-root input,.dr-root select{font-size:16px}.dr-add-chooser{max-height:min(65dvh,420px)}}
@container(max-width:640px){.dr-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(320px,55vh) auto}.dr-inspector{overflow:visible}.dr-editor{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}}
`;

function ensureCss() {
  if (document.getElementById('p2-draw-css')) return;
  const st = document.createElement('style');
  st.id = 'p2-draw-css';
  st.textContent = CSS;
  document.head.append(st);
}

const ICON = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
  fresh: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M12 11v6M9 14h6"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></svg>',
};

const plural = (kind, n) => (n === 1 ? kind : kind === 'person' ? 'people' : kind === 'fish' ? 'fish' : /s$/.test(kind) ? `${kind}es` : `${kind}s`);
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const first = (v) => (Array.isArray(v) ? v[0] : v);
const num = (v) => Number(first(v));
const isHex = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ''));

/** "2 trees, a house and a sun" for the caption: the observed objects of the page (not their parts or groups). */
export function captionOf(state) {
  const objs = (state?.objects ?? []).filter((o) => o.binding === 'drawing.object');
  if (!objs.length) return 'An empty page. Say what to draw!';
  const counts = new Map();
  for (const o of objs) { const name = first(state.inputs?.[o.id]?.name) ?? o.kind; counts.set(name, (counts.get(name) ?? 0) + 1); }
  const bits = [...counts].map(([k, n]) => (n === 1 ? `a ${k}` : `${n} ${plural(k, n)}`));
  return bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0];
}

function make(holder, host) {
  let api;
  ensureCss();
  holder.style.maxWidth = 'none'; holder.style.height = '100%';
  holder.classList.add('dr-root');
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const board = el('div', 'dr-board'), paper = el('div', 'dr-paper'), canvas = el('canvas', 'dr-canvas'), hint = el('div', 'dr-hint');
  canvas.width = 2000; canvas.height = 1400;
  canvas.setAttribute('role', 'img'); canvas.tabIndex = 0; canvas.title = 'Click to select; Ctrl or Command-click selects several. Drag handles to resize. Double-click empty space to add. Delete removes.';
  paper.append(canvas, hint); board.append(paper);
  const actions = el('div', 'dr-actions'), caption = el('p', 'dr-caption');
  caption.setAttribute('aria-live', 'polite');

  let renderer = null, rough = null, rc = null, ctx = null, parser = null, operations = [];
  let drag = null, settling = null, marquee = null, chooserPoint = null, multiSelect = false, longPress = 0, idsUntil = 0, idsTimer = 0, idsDuration = 4000;
  const activePointers = new Set(); let multiTouch = false;
  let state = { objects: [], inputs: {}, boxes: {}, options: {}, runtime: { view: {} }, frame: { w: 1000, h: 700 } };
  let items = [], frame = { w: 1000, h: 700 }, lastIds = undefined, destroyed = false, raf = 0, last = 0;
  let sel = [], lastViewSelected, pendingSel = null;
  const shown = new Map();   // object id -> { box, cur: {dx, dy, kx, ky}, born, dying, items }

  // ---- reading the projection ----------------------------------------------------------------------------------
  const view = () => state.runtime?.view ?? {};
  const objs = () => state.objects ?? [];
  const byId = (id) => objs().find((o) => o.id === id) ?? null;
  const input = (id, key) => first(state.inputs?.[id]?.[key]);
  const membersOf = (g) => [].concat(state.inputs?.[g]?.member ?? []).map(String);
  const boxOf = (id) => { const b = state.boxes?.[id]; return b ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : null; };
  const expand = (ids) => [...new Set(ids.flatMap((id) => (byId(id)?.binding === 'drawing.group' ? membersOf(id) : [id])))].filter((id) => boxOf(id));
  const selectedIds = () => expand(sel);
  const focus = () => (sel.length === 1 ? byId(sel[0]) : null);
  const unitOf = (id) => { const o = byId(id); return o?.role === 'member' && o.in && focus()?.id !== id ? o.in : id; };
  const partsOf = (id) => objs().filter((p) => p.binding === 'drawing.part' && p.in === id).sort((a, b) => num(a.index) - num(b.index));
  function currentPart() {
    const o = focus(), index = view().part;
    if (!o || o.binding !== 'drawing.object' || index === undefined || index === null) return null;
    const p = partsOf(o.id).find((q) => String(q.index) === String(index));
    if (!p) return null;
    const x = num(input(p.id, 'x')), y = num(input(p.id, 'y')), w = num(input(p.id, 'width')), h = num(input(p.id, 'height'));
    return { id: p.id, object: o.id, index: num(p.index), name: p.name ?? p.kind, x, y, width: w, height: h, color: input(p.id, 'color'), variant: p.variant, look: p.look, bounds: { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 } };
  }
  function selectionBounds(ids = selectedIds()) {
    const boxes = ids.map(boxOf).filter(Boolean);
    if (!boxes.length) return null;
    const x0 = Math.min(...boxes.map((b) => b.x0)), x1 = Math.max(...boxes.map((b) => b.x1)), y0 = Math.min(...boxes.map((b) => b.y0)), y1 = Math.max(...boxes.map((b) => b.y1));
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }
  // the layer order of the page: the order the projection draws the objects in (the last drawn is on top)
  const drawOrder = () => { const seen = []; for (const it of items) if (!seen.includes(it.id)) seen.push(it.id); for (const o of objs()) if (o.binding === 'drawing.object' && !seen.includes(o.id)) seen.push(o.id); return seen; };
  const scaleOf = (id) => { const b = boxOf(id) ?? shown.get(id)?.box; return b ? Math.max(b.x1 - b.x0, b.y1 - b.y0) : 120; };

  // ---- commands ------------------------------------------------------------------------------------------------
  // Every gesture is a declared native command; what it changed comes back through update().
  const tool = async (operation, args = {}) => {
    try {
      if (typeof host.tool !== 'function') throw Error('The drawing tools are not available.');
      const result = await host.tool(operation, args, { view: VIEW });
      // what the command said when it says something of its own, or why it did nothing (a refusal)
      const text = result?.text ?? (result?.ok === false ? result?.message ?? result?.reason : null);
      if (text) caption.textContent = text;
      return result;
    } catch (e) { caption.textContent = String(e.message ?? e); return null; }
  };
  const canvasTool = (operation, args) => tool(operation, args).finally(() => { if (document.activeElement === document.body) canvas.focus({ preventScroll: true }); });
  async function select(units) {
    units = [...new Set(units)];
    pendingSel = units;
    const result = await canvasTool(units.length > 1 ? 'drawing.objects.select' : 'drawing.object.select', units.length > 1 ? { ids: units } : { id: units[0] ?? null });
    if (result?.ok !== false) sel = units.filter((id) => byId(id));
    pendingSel = null; syncControls(); schedule();
    return result;
  }
  // Move the selection by dx, dy: one object goes to its new centre; several (or a group) move together in one step.
  function moveArgs(ids, dx, dy) {
    if (ids.length === 1) { const o = byId(ids[0]); return ['drawing.object.place', { ids, x: num(o.x) + dx, y: num(o.y) + dy }]; }
    const b = selectionBounds(ids);
    return ['drawing.objects.transform', { ids, x: b.x0 + dx, y: b.y0 + dy, width: b.w, height: b.h }];
  }

  // ---- inspector -----------------------------------------------------------------------------------------------
  const editor = el('div', 'dr-editor');
  const control = (label, type = 'text') => { const box = el('label'); box.append(document.createTextNode(label)); const inputEl = el(type === 'select' ? 'select' : 'input'); if (type !== 'select') inputEl.type = type; inputEl.setAttribute('aria-label', label); box.append(inputEl); editor.append(box); return inputEl; };
  const idInput = control('ObjectID'); idInput.readOnly = true;
  const nameInput = control('Label'), sizeInput = control('Size', 'number'), widthInput = control('Width', 'number'), heightInput = control('Height', 'number'), colourInput = control('Colour', 'color'), colourChoice = control('Named colour', 'select');
  sizeInput.min = widthInput.min = heightInput.min = '.01'; sizeInput.step = widthInput.step = heightInput.step = '1';
  nameInput.addEventListener('change', () => { const o = focus(); if (o?.binding === 'drawing.object') tool('drawing.object.change', { ids: [o.id], label: nameInput.value }); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); canvas.focus(); } });
  sizeInput.addEventListener('change', () => { const o = focus(), value = Number(sizeInput.value); if (o?.binding === 'drawing.object' && Number.isFinite(value) && value > 0) tool('drawing.object.change', { ids: [o.id], size: value }); });
  for (const [inputEl, key] of [[widthInput, 'width'], [heightInput, 'height']]) inputEl.addEventListener('change', () => {
    const ids = selectedIds(), value = Number(inputEl.value);
    if (!ids.length || !Number.isFinite(value) || value <= 0) return;
    if (ids.length > 1) { const b = selectionBounds(ids); if (b) tool('drawing.objects.transform', { ids, x: b.x0, y: b.y0, width: key === 'width' ? value : b.w, height: key === 'height' ? value : b.h }); }
    else tool('drawing.object.change', { ids, [key]: value });
  });
  colourInput.addEventListener('change', () => { const ids = selectedIds(); if (ids.length) tool('drawing.object.change', { ids, color: colourInput.value }); });
  colourChoice.addEventListener('change', () => { const ids = selectedIds(); if (ids.length && colourChoice.value !== '__custom') tool('drawing.object.change', { ids, color: colourChoice.value || null }); });
  // Poses and styles (worlds/art.draw/style-rules.sop; names from the area's options, k.styles): a turn to an angle or by
  // one, a mirror, a lean, an opacity, an effect, a fill (a gradient's second colour), an outline; for writing its words,
  // typeface, bold, italic, alignment and frame. A group turns and mirrors as a whole (its own id); the other styles go
  // to the selected objects.
  const poseIds = () => { const o = focus(); return o?.binding === 'drawing.group' ? [o.id] : selectedIds(); };
  const styleTool = (args) => { const ids = selectedIds(); if (ids.length) tool('drawing.object.change', { ids, ...args }); };
  const poseTool = (args) => { const ids = poseIds(); if (ids.length) tool('drawing.object.change', { ids, ...args }); };
  const rotationInput = control('Turn (degrees)', 'number'); rotationInput.step = '1'; rotationInput.min = '-360'; rotationInput.max = '360';
  rotationInput.addEventListener('change', () => { const v = Number(rotationInput.value); if (Number.isFinite(v)) poseTool({ rotation: ((v % 360) + 360) % 360 }); });
  const poseBar = el('div', 'dr-actions dr-pose'); editor.append(poseBar);
  const poseButton = (label, title, args) => { const b = el('button', 'dr-act', label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', () => poseTool(args)); poseBar.append(b); return b; };
  poseButton('↺ 15°', 'Turn a bit anticlockwise', { turn: 'tilt_left' }); poseButton('↻ 15°', 'Turn a bit clockwise', { turn: 'tilt' }); poseButton('↻ 90°', 'Quarter turn clockwise', { turn: 'rotate_right' });
  poseButton('Upside down', 'Turn upside down', { turn: 'upside_down' }); poseButton('Flip ⇆', 'Mirror left to right', { mirror: 'horizontal' }); poseButton('Flip ⇅', 'Mirror top to bottom', { mirror: 'vertical' });
  const skewInput = control('Lean (degrees)', 'number'); skewInput.step = '1'; skewInput.min = '-75'; skewInput.max = '75';
  skewInput.addEventListener('change', () => { const v = Number(skewInput.value); if (Number.isFinite(v)) styleTool({ skew: Math.max(-75, Math.min(75, v)) }); });
  const opacityInput = control('Opacity', 'range'); opacityInput.min = '0.05'; opacityInput.max = '1'; opacityInput.step = '0.05';
  opacityInput.addEventListener('change', () => styleTool({ opacity: Number(opacityInput.value) }));
  const effectChoice = control('Effect', 'select'); effectChoice.addEventListener('change', () => { if (effectChoice.value) styleTool({ effect: effectChoice.value }); });
  const fillChoice = control('Fill', 'select'); fillChoice.addEventListener('change', () => { if (fillChoice.value) styleTool({ fill: fillChoice.value }); });
  const gradientInput = control('Gradient to', 'color'); gradientInput.addEventListener('change', () => styleTool({ gradient: gradientInput.value }));
  const outlineInput = control('Outline colour', 'color'); outlineInput.addEventListener('change', () => styleTool({ outline: outlineInput.value }));
  const strokeInput = control('Outline width', 'number'); strokeInput.min = '0'; strokeInput.max = '40'; strokeInput.step = '0.5';
  strokeInput.addEventListener('change', () => { const v = Number(strokeInput.value); if (Number.isFinite(v) && v >= 0) styleTool({ stroke: v }); });
  const textInput = control('Text'); textInput.addEventListener('change', () => { const o = focus(); if (o?.binding === 'drawing.object' && textInput.value.trim()) tool('drawing.object.change', { ids: [o.id], text: textInput.value }); });
  textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); textInput.blur(); canvas.focus(); } });
  const fontChoice = control('Font', 'select'); fontChoice.addEventListener('change', () => { if (fontChoice.value) styleTool({ font: fontChoice.value }); });
  const textBar = el('div', 'dr-actions dr-textbar'); editor.append(textBar);
  const toggleButton = (label, key, on, off) => { const b = el('button', 'dr-act', label); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => styleTool({ [key]: b.getAttribute('aria-pressed') === 'true' ? off : on })); textBar.append(b); return b; };
  const boldButton = toggleButton('Bold', 'weight', 'bold', 'normal'), italicButton = toggleButton('Italic', 'slant', 'italic', 'normal');
  const alignChoice = control('Align', 'select'); for (const [v, t] of [['start', 'Start'], ['middle', 'Centre'], ['end', 'End']]) { const o = el('option'); o.value = v; o.textContent = t; alignChoice.append(o); }
  alignChoice.addEventListener('change', () => styleTool({ align: alignChoice.value }));
  const frameChoice = control('Frame', 'select'); frameChoice.addEventListener('change', () => { if (frameChoice.value) styleTool({ frame: frameChoice.value }); });
  const act = (label, icon, callback) => { const b = el('button', 'dr-act', `${ICON[icon] ?? ''}<span>${label}</span>`); b.type = 'button'; b.addEventListener('click', callback); actions.append(b); return b; };
  const removeButton = act('Delete selection', '', () => { const ids = selectedIds(); if (ids.length) tool('drawing.object.remove', { ids }); }); editor.append(removeButton);
  const undoButton = act('Undo', 'undo', () => tool('drawing.undo'));
  const redoButton = act('Redo', 'redo', () => tool('drawing.redo')); redoButton.disabled = true;
  act('Clear drawing', 'fresh', () => tool('drawing.page.clear'));
  act('Save PNG', 'save', () => api.download({ format: 'png' })); act('Save SVG', 'save', () => api.download({ format: 'svg' }));
  act('Identify IDs', '', async () => { const r = await tool('drawing.ids.show', { mode: 'temporary' }); if (r?.ok !== false) showIdsFor(idsDuration); });
  const showIdsLabel = el('label'), showIdsInput = el('input'); showIdsInput.type = 'checkbox'; showIdsInput.setAttribute('aria-label', 'Show IDs'); showIdsLabel.append(showIdsInput, document.createTextNode('Show IDs')); actions.append(showIdsLabel);
  showIdsInput.addEventListener('change', () => tool('drawing.ids.show', { mode: showIdsInput.checked ? 'always' : 'off' }));
  const chooser = el('div', 'dr-add-chooser'); chooser.hidden = true; chooser.setAttribute('role', 'dialog'); chooser.setAttribute('aria-label', 'Add drawing object');
  const shapeChoices = el('div', 'dr-shape-choices'), knowledgeInput = control('Find a word in knowledge', 'search'), dictionary = el('datalist'); dictionary.id = 'drawing-words-' + crypto.randomUUID(); knowledgeInput.setAttribute('list', dictionary.id);
  let dictionaryWords = null, dictionaryPromise = null;
  // The words the knowledge catalog draws (k.objects): the drawings drawing.catalog.make can make.
  const loadDictionary = () => dictionaryPromise ??= Promise.all([import(host.asset('lib/loaders/knowledge-source.mjs')), import(host.asset('lib/knowledge/catalog-pin.mjs'))]).then(async ([k, pin]) => {
    const source = k.createKnowledgeSource(pin.KNOWLEDGE_URLS), raw = await source.text('vocab.json');
    if (!raw) throw Error('Knowledge dictionary is unavailable.');
    const vocab = JSON.parse(raw);
    dictionaryWords = Object.entries(vocab).filter(([, shards]) => Array.isArray(shards) && shards.some((id) => /^k\.objects\//.test(id))).map(([word]) => word).sort();
    return dictionaryWords;
  }).catch((e) => { dictionaryPromise = null; caption.textContent = e.message; return []; });
  const suggestWords = async () => { await loadDictionary(); dictionary.textContent = ''; const query = knowledgeInput.value.trim().toLowerCase(); for (const word of (dictionaryWords ?? []).filter((w) => w.startsWith(query)).slice(0, 80)) { const option = el('option'); option.value = word; dictionary.append(option); } };
  knowledgeInput.addEventListener('focus', suggestWords); knowledgeInput.addEventListener('input', suggestWords);
  const closeChooser = () => { chooser.hidden = true; addButton.setAttribute('aria-expanded', 'false'); };
  const createObject = async (operation, args) => { await tool(operation, { ...args, ...chooserPoint }); closeChooser(); canvas.focus(); };
  const addKnowledge = el('button', 'dr-act', 'Add from knowledge'); addKnowledge.type = 'button'; addKnowledge.addEventListener('click', () => { const name = knowledgeInput.value.trim(); if (name) createObject('drawing.catalog.make', { name }); });
  knowledgeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addKnowledge.click(); } });
  const cancelAdd = el('button', 'dr-act', 'Cancel'); cancelAdd.type = 'button'; cancelAdd.addEventListener('click', closeChooser); chooser.append(shapeChoices, knowledgeInput.parentElement, addKnowledge, dictionary, cancelAdd);
  const toolbar = el('div', 'dr-toolbar'), addButton = el('button', 'dr-act', 'Add'); addButton.type = 'button'; addButton.disabled = true; addButton.setAttribute('aria-haspopup', 'dialog'); addButton.setAttribute('aria-expanded', 'false');
  // A new object goes where the chooser was opened (double-click), else where the area's placement puts it.
  function openChooser(point = null, event = null) {
    chooserPoint = point ?? {}; chooser.hidden = false; addButton.setAttribute('aria-expanded', 'true');
    if (event) { const rect = holder.getBoundingClientRect(); chooser.style.left = Math.max(4, Math.min(rect.width - 290, event.clientX - rect.left)) + 'px'; chooser.style.top = Math.max(40, Math.min(rect.height - 250, event.clientY - rect.top)) + 'px'; }
    else { chooser.style.left = '4px'; chooser.style.top = '40px'; }
    shapeChoices.querySelector('button')?.focus();
  }
  addButton.addEventListener('click', () => (chooser.hidden ? openChooser() : closeChooser()));
  chooser.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeChooser(); canvas.focus(); } });
  const multiButton = el('button', 'dr-act', 'Select multiple'); multiButton.type = 'button'; multiButton.setAttribute('aria-pressed', 'false');
  multiButton.addEventListener('click', () => { multiSelect = !multiSelect; multiButton.setAttribute('aria-pressed', String(multiSelect)); caption.textContent = multiSelect ? 'Tap objects to add or remove them from the selection.' : 'Tap an object to select or move it.'; });
  // Writing on the page (a text object) and the filter the whole picture is shown through (k.styles.filter).
  const addTextButton = el('button', 'dr-act', 'Add text'); addTextButton.type = 'button';
  addTextButton.addEventListener('click', async () => { const r = await tool('drawing.object.make', { kind: 'text', text: 'Text' }); if (r?.ok !== false) setTimeout(() => { textInput.focus(); textInput.select(); }, 60); });
  const filterLabel = el('label'), filterChoice = el('select'); filterChoice.setAttribute('aria-label', 'Picture filter'); filterLabel.append(document.createTextNode('Filter'), filterChoice);
  filterChoice.addEventListener('change', () => { if (filterChoice.value) tool('drawing.page.change', { filter: filterChoice.value }); });
  toolbar.append(addButton, addTextButton, multiButton, filterLabel, actions);
  const memberChoice = control('Group member', 'select'); memberChoice.addEventListener('change', () => { if (memberChoice.value) select([memberChoice.value]); });
  const partChoice = control('Object part', 'select'), partX = control('Part X', 'number'), partY = control('Part Y', 'number'), partWidth = control('Part width', 'number'), partHeight = control('Part height', 'number'), partColour = control('Part colour', 'color');
  partChoice.addEventListener('change', () => { const o = focus(); if (o) tool(partChoice.value === '' ? 'drawing.object.select' : 'drawing.part.select', partChoice.value === '' ? { id: o.id } : { id: o.id, index: Number(partChoice.value) }); });
  const movePart = () => { const p = currentPart(), x = Number(partX.value), y = Number(partY.value); if (p && Number.isFinite(x) && Number.isFinite(y)) tool('drawing.part.place', { id: p.object, index: p.index, x, y }); };
  partX.addEventListener('change', movePart); partY.addEventListener('change', movePart);
  for (const [inputEl, key] of [[partWidth, 'width'], [partHeight, 'height']]) { inputEl.min = '.01'; inputEl.step = '1'; inputEl.addEventListener('change', () => { const p = currentPart(), value = Number(inputEl.value); if (p && Number.isFinite(value) && value > 0) tool('drawing.part.change', { id: p.object, index: p.index, [key]: value }); }); }
  partColour.addEventListener('change', () => { const p = currentPart(); if (p) tool('drawing.part.change', { id: p.object, index: p.index, color: partColour.value }); });
  // A part turned, mirrored, faded or given an effect about its own centre.
  const partRotation = control('Part turn (degrees)', 'number'); partRotation.step = '1';
  partRotation.addEventListener('change', () => { const p = currentPart(), v = Number(partRotation.value); if (p && Number.isFinite(v)) tool('drawing.part.change', { id: p.object, index: p.index, rotation: ((v % 360) + 360) % 360 }); });
  const partOpacity = control('Part opacity', 'range'); partOpacity.min = '0.05'; partOpacity.max = '1'; partOpacity.step = '0.05';
  partOpacity.addEventListener('change', () => { const p = currentPart(); if (p) tool('drawing.part.change', { id: p.object, index: p.index, opacity: Number(partOpacity.value) }); });
  const partEffect = control('Part effect', 'select'); partEffect.addEventListener('change', () => { const p = currentPart(); if (p && partEffect.value) tool('drawing.part.change', { id: p.object, index: p.index, effect: partEffect.value }); });
  const partAction = (label, operation) => { const b = el('button', 'dr-act', label); b.type = 'button'; b.addEventListener('click', () => { const p = currentPart(); if (p) tool(operation, { id: p.object, index: p.index }); }); editor.append(b); return b; };
  const flipPart = el('button', 'dr-act', 'Flip part ⇆'); flipPart.type = 'button'; flipPart.addEventListener('click', () => { const p = currentPart(); if (p) tool('drawing.part.change', { id: p.object, index: p.index, mirror: 'horizontal' }); }); editor.append(flipPart);
  const extractPart = partAction('Extract part', 'drawing.part.extract'), deletePart = partAction('Delete part', 'drawing.part.remove');
  // People and parts (worlds/art.draw/act-rules.sop): a look part (a person's hair, hat, clothes; eyes put on the sun)
  // takes another variant of its slot; a part of the drawing takes another outline; a part is added to the object by
  // the word for it; a person gets a different look. The options are the area's observed options.
  const partLook = control('Part look', 'select'), partShape = control('Part shape', 'select');
  partLook.addEventListener('change', () => { const p = currentPart(); if (p && partLook.value) tool('drawing.part.change', { id: p.object, index: p.index, variant: partLook.value }); });
  partShape.addEventListener('change', () => { const p = currentPart(); if (p && partShape.value) tool('drawing.part.change', { id: p.object, index: p.index, shape: partShape.value }); });
  const addPartName = control('Add part'), addPartButton = el('button', 'dr-act', 'Add part'); addPartButton.type = 'button'; editor.append(addPartButton);
  const addPart = () => { const o = focus(), word = addPartName.value.trim(); if (o && word) { tool('drawing.part.add', { id: o.id, kind: word }); addPartName.value = ''; } };
  addPartButton.addEventListener('click', addPart); addPartName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPart(); } });
  const varyButton = el('button', 'dr-act', 'Different look'); varyButton.type = 'button'; editor.append(varyButton);
  varyButton.addEventListener('click', () => { const o = focus(); if (o) tool('drawing.person.vary', { id: o.id }); });
  const emotion = control('Emotion', 'select'); emotion.addEventListener('change', () => { const o = focus(); if (o && emotion.value) tool('drawing.person.expression', { id: o.id, expression: emotion.value }); });
  // The person model (worlds/art.draw/figure-rules.sop): a pose, a trait, a thing to wear, a thing to hold; the options
  // are the knowledge's (k.faces poses and traits, k.wearables), observed as options.pose, .trait and .garment.
  const poseChoice = control('Pose', 'select'); poseChoice.addEventListener('change', () => { const o = focus(); if (o && poseChoice.value) tool('drawing.person.pose', { id: o.id, pose: poseChoice.value }); });
  const traitChoice = control('Trait', 'select'); traitChoice.addEventListener('change', () => { const o = focus(); if (o && traitChoice.value) tool('drawing.object.change', { ids: [o.id], trait: traitChoice.value }); });
  const wearChoice = control('Wear', 'select'); wearChoice.addEventListener('change', () => { const o = focus(); if (o && wearChoice.value) tool('drawing.part.add', { id: o.id, kind: wearChoice.value }); });
  const holdName = control('Hold'), holdButton = el('button', 'dr-act', 'Hold'); holdButton.type = 'button'; editor.append(holdButton);
  const hold = () => { const o = focus(), word = holdName.value.trim(); if (o && word) { tool('drawing.person.hold', { id: o.id, kind: word }); holdName.value = ''; } };
  holdButton.addEventListener('click', hold); holdName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hold(); } });
  const traits = el('p', 'dr-traits', ''); editor.append(traits);
  const groupName = control('Group label'); groupName.value = '';
  const groupButton = el('button', 'dr-act', 'Group objects'); groupButton.type = 'button'; groupButton.addEventListener('click', () => { const ids = selectedIds(); if (ids.length > 1) tool('drawing.object.group', { ids, name: groupName.value.trim() || 'Group', ...(groupName.value.trim() ? { label: groupName.value.trim() } : {}) }); }); editor.append(groupButton);
  const ungroup = el('button', 'dr-act', 'Ungroup'); ungroup.type = 'button'; ungroup.addEventListener('click', () => { const o = focus(), group = o?.binding === 'drawing.group' ? o.id : o?.in; if (group) tool('drawing.object.ungroup', { id: group }); }); editor.append(ungroup);
  const selectionHeading = el('h3', 'dr-selection-heading', 'Selection'), emptySelection = el('p', 'dr-empty-selection', 'Click an object to edit it. Ctrl or Command-click adds to selection. Drag empty space to select several.'); selectionHeading.setAttribute('data-selected-native-id', ''); editor.prepend(selectionHeading);
  const workspace = el('div', 'dr-workspace'), inspector = el('aside', 'dr-inspector'); workspace.append(board, inspector); inspector.append(emptySelection, editor);
  holder.replaceChildren(toolbar, chooser, workspace, caption);
  const closeInspectorSplitter = mountInspectorSplitter(workspace, inspector, { id: 'draw', width: 264, persist: host.persistent !== false });

  const option = (value, text, disabled = false) => { const o = el('option'); o.value = value; o.textContent = text; o.disabled = disabled; return o; };
  let colourNames = '';
  function syncControls() {
    const v = view();
    showIdsInput.checked = v.ids === 'always';
    const o = focus(), ids = selectedIds(), multi = sel.length > 1, group = o?.binding === 'drawing.group', object = o?.binding === 'drawing.object' ? o : null, part = currentPart();
    inspector.dataset.selectedNativeIds = JSON.stringify(part ? [part.id] : sel);
    selectionHeading.textContent = multi ? `${ids.length} objects` : group ? 'Group ' + o.id : object ? 'Object ' + object.id : 'Selection';
    selectionHeading.dataset.selectedNativeId = o?.id ?? '';
    emptySelection.hidden = !!sel.length; editor.hidden = !sel.length;
    const visible = (inputEl, show) => { (inputEl.closest('label') ?? inputEl).hidden = !show; };
    // a group shows its members; a member can go back to its group
    const members = group ? membersOf(o.id) : [], parent = object?.role === 'member' ? object.in : null;
    visible(memberChoice, !multi && !!(members.length || parent));
    memberChoice.textContent = ''; memberChoice.append(option('', parent ? 'Member ' + object.id : 'Choose a member'));
    if (parent) memberChoice.append(option(parent, 'Group ' + parent));
    for (const id of members) memberChoice.append(option(id, id + ' · ' + (input(id, 'label') ?? input(id, 'name') ?? byId(id)?.kind ?? '')));
    for (const inputEl of [idInput, nameInput, sizeInput, partChoice]) visible(inputEl, !!object && !multi);
    for (const inputEl of [widthInput, heightInput, colourInput, colourChoice, removeButton]) { visible(inputEl, !!ids.length); inputEl.disabled = !ids.length; }
    for (const inputEl of [groupName, groupButton]) visible(inputEl, multi);
    visible(ungroup, !multi && !!(group || parent));
    for (const inputEl of [partX, partY, partWidth, partHeight, partColour, extractPart, deletePart]) { visible(inputEl, !!part && !multi); inputEl.disabled = !part; }
    const looks = part ? (state.options?.[part.id] ?? []).map(String) : [], person = object ? partsOf(object.id).some((p) => p.look !== undefined) : false;
    visible(partLook, !!part && !multi && looks.length > 0); partLook.textContent = ''; partLook.append(option('', 'Look…')); for (const v of looks) partLook.append(option(v, v)); partLook.value = part?.variant ?? '';
    visible(partShape, !!part && !multi && !looks.length); partShape.textContent = ''; partShape.append(option('', 'Shape…')); for (const v of [...(state.options?.shape ?? [])].map(String).sort()) partShape.append(option(v, v));
    for (const inputEl of [addPartName, addPartButton]) visible(inputEl, !!object && !multi);
    visible(varyButton, person && !multi);
    visible(emotion, !!object && !multi && (person || input(object.id, 'faceable') === true)); emotion.textContent = ''; emotion.append(option('', 'Emotion…')); for (const v of [...(state.options?.expression ?? [])].map(String).sort()) emotion.append(option(v, v));
    const fill = (select, key, label, now) => { select.textContent = ''; select.append(option('', label)); for (const v of [...(state.options?.[key] ?? [])].map(String).sort()) select.append(option(v, v)); select.value = now ?? ''; };
    const posed = object ? input(object.id, 'pose') : null;
    visible(poseChoice, !!object && !multi && posed !== undefined && posed !== null); fill(poseChoice, 'pose', 'Pose…', posed);
    for (const [select, key, label] of [[traitChoice, 'trait', 'Trait…'], [wearChoice, 'garment', 'Wear…']]) { visible(select, person && !multi); fill(select, key, label); }
    for (const inputEl of [holdName, holdButton]) visible(inputEl, person && !multi);
    const age = object ? input(object.id, 'age') : null, sex = object ? input(object.id, 'sex') : null, mood = object ? input(object.id, 'expression') : null;
    traits.textContent = object && (age || sex || posed || mood) ? 'Traits: ' + [age, sex, posed, mood].filter(Boolean).join(', ') : ''; visible(traits, !!traits.textContent);
    partChoice.textContent = ''; partChoice.append(option('', 'Whole object'));
    for (const p of object ? partsOf(object.id) : []) partChoice.append(option(String(p.index), `${num(p.index) + 1}. ${String(p.name ?? p.kind).replace(/_/g, ' ')}`));
    partChoice.value = part ? String(part.index) : '';
    if (part) { partX.value = part.x.toFixed(1); partY.value = part.y.toFixed(1); partWidth.value = part.width.toFixed(1); partHeight.value = part.height.toFixed(1); partColour.value = isHex(part.color) ? part.color.toLowerCase() : '#9aa5b1'; }
    idInput.value = object?.id ?? ''; if (document.activeElement !== nameInput) nameInput.value = object ? input(object.id, 'label') ?? input(object.id, 'name') ?? '' : ''; sizeInput.value = object?.size ?? '';
    const b = selectionBounds(ids); widthInput.value = b ? Number(b.w.toFixed(2)) : ''; heightInput.value = b ? Number(b.h.toFixed(2)) : '';
    // poses and styles: shown for a selection (a group turns and mirrors as a whole); writing controls for a text object
    const fillOptions = (select, key, placeholder, current) => { const names = [...(state.options?.[key] ?? [])].map(String).sort(); if (select.dataset.names !== names.join('|')) { select.dataset.names = names.join('|'); select.textContent = ''; select.append(option('', placeholder)); for (const n of names) select.append(option(n, n.replace(/_/g, ' '))); } select.value = current && names.includes(String(current)) ? String(current) : ''; };
    const one = object ?? (ids.length === 1 ? byId(ids[0]) : null), isText = !!object && (object.kind === 'text' || input(object.id, 'text') !== undefined);
    for (const inputEl of [rotationInput, poseBar]) visible(inputEl, !!ids.length && !part);
    for (const inputEl of [skewInput, opacityInput, effectChoice, fillChoice, outlineInput, strokeInput]) visible(inputEl, !!ids.length && !part);
    const poseOf = group ? o.id : one?.id;
    if (document.activeElement !== rotationInput) rotationInput.value = poseOf ? Number(input(poseOf, 'rotation') ?? 0) : '';
    if (document.activeElement !== skewInput) skewInput.value = one ? Number(input(one.id, 'skew') ?? 0) : '';
    opacityInput.value = one ? Number(input(one.id, 'opacity') ?? 1) : 1;
    fillOptions(effectChoice, 'effect', 'Effect…', one && input(one.id, 'effect')); fillOptions(fillChoice, 'pattern', 'Fill…', one && input(one.id, 'pattern'));
    visible(gradientInput, !!ids.length && !part && (one ? input(one.id, 'pattern') === 'gradient' : false)); gradientInput.value = isHex(one && input(one.id, 'gradient')) ? input(one.id, 'gradient').toLowerCase() : '#ffffff';
    outlineInput.value = isHex(one && input(one.id, 'outline')) ? input(one.id, 'outline').toLowerCase() : '#3a3040'; if (document.activeElement !== strokeInput) strokeInput.value = one && input(one.id, 'stroke') !== undefined ? Number(input(one.id, 'stroke')) : '';
    for (const inputEl of [textInput, fontChoice, textBar, alignChoice, frameChoice]) visible(inputEl, isText && !multi);
    if (isText) {
      if (document.activeElement !== textInput) textInput.value = String(input(object.id, 'text') ?? '');
      fillOptions(fontChoice, 'font', 'Font…', input(object.id, 'font')); fillOptions(frameChoice, 'frame', 'Frame…', input(object.id, 'frame'));
      boldButton.setAttribute('aria-pressed', String(input(object.id, 'weight') === 'bold')); italicButton.setAttribute('aria-pressed', String(input(object.id, 'slant') === 'italic'));
      alignChoice.value = String(input(object.id, 'align') ?? 'middle');
    }
    for (const inputEl of [partRotation, partOpacity, partEffect, flipPart]) { visible(inputEl, !!part && !multi); inputEl.disabled = !part; }
    if (part) { if (document.activeElement !== partRotation) partRotation.value = Number(input(part.id, 'rotation') ?? 0); partOpacity.value = Number(input(part.id, 'opacity') ?? 1); fillOptions(partEffect, 'effect', 'Effect…', input(part.id, 'effect')); }
    fillOptions(filterChoice, 'filter', 'Filter…', input('page', 'filter')); filterLabel.hidden = !(state.options?.filter ?? []).length;
    // the colour the object is painted with: its stored colour's RGB, else the colour of its largest part as drawn
    const target = object ?? (ids.length === 1 ? byId(ids[0]) : null), stored = target ? input(target.id, 'color') : null;
    const largest = target ? partsOf(target.id).map((p) => ({ c: input(p.id, 'color'), a: num(input(p.id, 'width')) * num(input(p.id, 'height')) })).filter((p) => isHex(p.c)).sort((a, b) => b.a - a.a)[0]?.c : null;
    const hex = target ? input(target.id, 'fill') ?? largest : null;
    colourInput.value = isHex(hex) ? String(hex).toLowerCase() : '#356ac3';
    const names = [...(state.options?.colour ?? [])].map(String).sort();
    if (names.join('|') !== colourNames) { colourNames = names.join('|'); colourChoice.textContent = ''; colourChoice.append(option('', 'Original colours'), option('__custom', 'Custom colour', true)); for (const name of names) colourChoice.append(option(name, name)); }
    colourChoice.value = stored ? (names.includes(String(stored)) ? String(stored) : '__custom') : '';
  }

  // ---- hint for the empty page ---------------------------------------------------------------------------------
  function showHint() {
    const empty = !objs().some((o) => o.binding === 'drawing.object');
    hint.hidden = !empty;
    if (empty) hint.innerHTML = '<b>Create your drawing</b><span>Use Add or double-click empty space.<br>Click to select, drag to move or resize.</span>';
  }
  function showIdsFor(ms) { idsUntil = Date.now() + ms; clearTimeout(idsTimer); idsTimer = setTimeout(schedule, ms + 1); schedule(); }

  // ---- animation -----------------------------------------------------------------------------------------------
  // New objects pop in, moved or resized ones glide to their new box, removed ones shrink away.
  function sync() {
    const now = performance.now(), present = new Set(), landed = new Set(); let batch = 0;
    const itemsOf = new Map(); for (const it of items) (itemsOf.get(it.id) ?? itemsOf.set(it.id, []).get(it.id)).push(it);
    for (const [id, own] of itemsOf) {
      const box = boxOf(id); if (!box) continue;
      present.add(id);
      const s = shown.get(id);
      if (!s || s.dying) shown.set(id, { box, cur: { dx: 0, dy: 0, kx: 1, ky: 1 }, born: now + batch++ * 140, dying: 0, items: own });
      else {
        // a settling drop whose object got a new box: it glides on from where it was dropped
        const p = previewOf(id), moved = p && ['x0', 'y0', 'x1', 'y1'].some((k) => Math.abs(box[k] - s.box[k]) > 0.01);
        if (p && !moved) { s.items = own; continue; }
        const was = p ? previewBox(s.box, p) : displayed(s);
        s.box = box; s.items = own; glideFrom(s, was);
        if (p) landed.add(id);
      }
    }
    if (settling && settling.ids.some((id) => landed.has(id))) settling.applied = true;
    for (const [id, s] of shown) if (!present.has(id) && !s.dying) s.dying = now;
  }
  const displayed = ({ box, cur }) => { const cx = (box.x0 + box.x1) / 2 + cur.dx, cy = (box.y0 + box.y1) / 2 + cur.dy, w = (box.x1 - box.x0) * cur.kx, h = (box.y1 - box.y0) * cur.ky; return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 }; };
  // The backing store follows the displayed size (x device pixel ratio, at most 2000 px wide); a hidden tab paints nothing.
  let shownW = 0, shownH = 0;
  function fit() {
    const w = shownW; if (!w) return false;
    const height = shownH || w * frame.h / frame.w, ratio = Math.min(2, globalThis.devicePixelRatio || 1, 2000 / w, 1400 / height), pw = Math.max(1, Math.round(w * ratio)), ph = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    return true;
  }
  const visibleNow = () => canvas.isConnected && shownW > 0;
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => { shownW = Math.round(es.at(-1)?.contentRect?.width ?? 0); shownH = Math.round(es.at(-1)?.contentRect?.height ?? 0); if (!destroyed && visibleNow()) { fit(); schedule(); } }) : null;
  if (resizeObserver) resizeObserver.observe(canvas); else shownW = 400;
  function frameStep(t) {
    raf = 0;
    if (destroyed || !renderer) return;
    if (!visibleNow()) { last = 0; return; }
    fit();
    const dt = Math.min(0.05, (t - (last || t)) / 1000 || 0.016); last = t;
    const k = 1 - Math.exp(-dt * 11);
    let busy = false;
    for (const [id, s] of [...shown]) {
      const c = s.cur;
      c.dx -= c.dx * k; c.dy -= c.dy * k; c.kx += (1 - c.kx) * k; c.ky += (1 - c.ky) * k;
      if (Math.abs(c.dx) > 0.3 || Math.abs(c.dy) > 0.3 || Math.abs(c.kx - 1) > 0.003 || Math.abs(c.ky - 1) > 0.003) busy = true; else s.cur = { dx: 0, dy: 0, kx: 1, ky: 1 };
      s.pop = 1; s.alpha = 1;
      if (s.dying) { const u = clamp01((t - s.dying) / 280); s.pop = 1 - u * 0.6; s.alpha = 1 - u; busy = true; if (u >= 1) { shown.delete(id); continue; } }
      else if (t < s.born + 560) { const u = clamp01((t - s.born) / 560); s.pop = t < s.born ? 0 : easeOutBack(u); s.alpha = t < s.born ? 0 : Math.min(1, u * 3); busy = true; }
    }
    paintFrame();
    if (busy) raf = requestAnimationFrame(frameStep);
  }
  function schedule() { if (!raf && renderer && !destroyed) raf = requestAnimationFrame(frameStep); }
  // A drag shows where it will put the objects: the same mapping of their joint box the command will send.
  // A dropped drag keeps showing where it put the objects (settling) until the world's new boxes arrive: the objects
  // stay where they were dropped instead of jumping back while the command is saved.
  function previewOf(id) {
    const d = drag?.moved && drag.kind !== 'part' ? drag : settling && !settling.applied ? settling : null;
    if (!d || !d.ids.includes(id)) return null;
    const a = transformArgs(d), b = d.bounds;
    return { x0: b.x0, y0: b.y0, kx: a.width / b.w, ky: a.height / b.h, x: a.x, y: a.y };
  }
  const previewBox = (box, p) => ({ x0: p.x + (box.x0 - p.x0) * p.kx, y0: p.y + (box.y0 - p.y0) * p.ky, x1: p.x + (box.x1 - p.x0) * p.kx, y1: p.y + (box.y1 - p.y0) * p.ky });
  const glideFrom = (s, was) => { const w = Math.max(1, s.box.x1 - s.box.x0), h = Math.max(1, s.box.y1 - s.box.y0); s.cur = { dx: (was.x0 + was.x1 - s.box.x0 - s.box.x1) / 2, dy: (was.y0 + was.y1 - s.box.y0 - s.box.y1) / 2, kx: (was.x1 - was.x0) / w, ky: (was.y1 - was.y0) / h }; };
  // The command ended: a refused or unchanged drop glides back from where it was dropped.
  function endSettling(d) {
    if (settling !== d) return;
    if (!d.applied) for (const id of d.ids) { const s = shown.get(id), p = previewOf(id); if (s && p) glideFrom(s, previewBox(s.box, p)); }
    settling = null; schedule();
  }
  function paintFrame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / frame.w, canvas.height / frame.h), ox = (canvas.width - frame.w * scale) / 2, oy = (canvas.height - frame.h * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, frame.w, frame.h);
    renderer.beginFrame(ctx, frame);
    const order = [...new Set([...items.map((it) => it.id), ...shown.keys()])];
    for (const id of order) {
      const s = shown.get(id), own = s?.dying ? s.items : items.filter((it) => it.id === id);
      if (!own?.length) continue;
      ctx.save();
      const p = previewOf(id);
      if (p) ctx.transform(p.kx, 0, 0, p.ky, p.x - p.x0 * p.kx, p.y - p.y0 * p.ky);
      else if (s) {
        const cx = (s.box.x0 + s.box.x1) / 2, cy = (s.box.y0 + s.box.y1) / 2, kx = s.cur.kx * (s.pop ?? 1), ky = s.cur.ky * (s.pop ?? 1);
        ctx.transform(kx, 0, 0, ky, cx + s.cur.dx - cx * kx, cy + s.cur.dy - cy * ky);
      }
      const scaleBox = s?.box ? Math.max(s.box.x1 - s.box.x0, s.box.y1 - s.box.y0) : scaleOf(id);
      for (const it of own) renderer.drawItem(ctx, rc, it, scaleBox, s?.alpha ?? 1);
      ctx.restore();
    }
    renderer.endFrame(ctx, frame);
    const part = currentPart();
    let b = selectionBounds();
    const shownDrag = drag?.moved && drag.kind !== 'part' ? drag : settling && !settling.applied ? settling : null;
    if (b && shownDrag) { const a = transformArgs(shownDrag); b = { x0: a.x, y0: a.y, x1: a.x + a.width, y1: a.y + a.height, w: a.width, h: a.height }; }
    if (b && !part) { ctx.save(); ctx.strokeStyle = '#356ac3'; ctx.lineWidth = 2; ctx.strokeRect(b.x0, b.y0, b.w, b.h); for (const h of handlesOf(b)) { ctx.fillStyle = '#fff'; ctx.fillRect(h.x - 5, h.y - 5, 10, 10); ctx.strokeRect(h.x - 5, h.y - 5, 10, 10); } ctx.restore(); }
    const ids = view().ids;
    if (ids === 'always' || (ids === 'temporary' && Date.now() < idsUntil)) {
      ctx.save(); ctx.font = '600 16px system-ui'; ctx.textBaseline = 'top';
      const labelled = objs().filter((o) => (o.binding === 'drawing.object' && o.role !== 'member') || o.binding === 'drawing.group');
      for (const o of labelled) { const box = o.binding === 'drawing.group' ? selectionBounds(membersOf(o.id)) : boxOf(o.id); if (!box) continue; const text = o.id, w = ctx.measureText(text).width + 10, x = Math.max(2, box.x0), y = Math.max(2, box.y0 - 24); ctx.fillStyle = '#183b63'; ctx.fillRect(x, y, w, 22); ctx.fillStyle = '#fff'; ctx.fillText(text, x + 5, y + 2); }
      ctx.restore();
    }
    if (marquee) { ctx.save(); ctx.fillStyle = 'rgba(53,106,195,.08)'; ctx.strokeStyle = '#356ac3'; ctx.lineWidth = 1; ctx.fillRect(marquee.x0, marquee.y0, marquee.x - marquee.x0, marquee.y - marquee.y0); ctx.strokeRect(marquee.x0, marquee.y0, marquee.x - marquee.x0, marquee.y - marquee.y0); ctx.restore(); }
    if (part) { const pb = part.bounds, dx = drag?.kind === 'part' && drag.moved ? drag.x - part.x : 0, dy = drag?.kind === 'part' && drag.moved ? drag.y - part.y : 0; ctx.save(); ctx.strokeStyle = '#356ac3'; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.strokeRect(pb.x0 + dx - 3, pb.y0 + dy - 3, pb.x1 - pb.x0 + 6, pb.y1 - pb.y0 + 6); ctx.restore(); }
  }

  // ---- pointer, touch and keyboard -----------------------------------------------------------------------------
  const inside = (b, x, y, pad = 6) => b && x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
  /** The object under a point (topmost first; a member being edited before its group), or null. */
  function objectAt(x, y) {
    const f = focus();
    if (f?.binding === 'drawing.object' && f.role === 'member' && inside(boxOf(f.id), x, y)) return f;
    for (const id of drawOrder().reverse()) {
      const o = byId(id); if (o?.binding !== 'drawing.object') continue;
      if (inside(boxOf(id), x, y) || partsOf(id).some((p) => { const px = num(input(p.id, 'x')), py = num(input(p.id, 'y')), w = num(input(p.id, 'width')), h = num(input(p.id, 'height')); return inside({ x0: px - w / 2, y0: py - h / 2, x1: px + w / 2, y1: py + h / 2 }, x, y); })) return o;
    }
    return null;
  }
  const toLogical = (e) => { const r = canvas.getBoundingClientRect(), scale = Math.min(r.width / frame.w, r.height / frame.h); return [(e.clientX - r.left - (r.width - frame.w * scale) / 2) / scale, (e.clientY - r.top - (r.height - frame.h * scale) / 2) / scale]; };
  const handlesOf = (b) => [{ key: 'nw', x: b.x0, y: b.y0 }, { key: 'n', x: (b.x0 + b.x1) / 2, y: b.y0 }, { key: 'ne', x: b.x1, y: b.y0 }, { key: 'e', x: b.x1, y: (b.y0 + b.y1) / 2 }, { key: 'se', x: b.x1, y: b.y1 }, { key: 's', x: (b.x0 + b.x1) / 2, y: b.y1 }, { key: 'sw', x: b.x0, y: b.y1 }, { key: 'w', x: b.x0, y: (b.y0 + b.y1) / 2 }];
  function transformArgs(d) {
    const b = d.bounds;
    if (d.kind === 'resize') { let x0 = b.x0, y0 = b.y0, x1 = b.x1, y1 = b.y1; if (d.handle.includes('w')) x0 = Math.min(x1 - 1, d.x); if (d.handle.includes('e')) x1 = Math.max(x0 + 1, d.x); if (d.handle.includes('n')) y0 = Math.min(y1 - 1, d.y); if (d.handle.includes('s')) y1 = Math.max(y0 + 1, d.y); return { ids: d.ids, x: x0, y: y0, width: x1 - x0, height: y1 - y0 }; }
    return { ids: d.ids, x: b.x0 + d.x - d.x0, y: b.y0 + d.y - d.y0, width: b.w, height: b.h };
  }
  const handleAt = (x, y) => { const b = selectionBounds(); return b && !currentPart() ? handlesOf(b).find((h) => Math.hypot(h.x - x, h.y - y) < 10) : null; };
  const toggle = (unit) => select(sel.includes(unit) ? sel.filter((id) => id !== unit) : [...sel, unit]);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activePointers.add(e.pointerId);
    if (activePointers.size > 1) { multiTouch = true; drag = null; marquee = null; clearTimeout(longPress); schedule(); return; }
    e.preventDefault(); canvas.focus({ preventScroll: true }); closeChooser();
    const [x, y] = toLogical(e), handle = handleAt(x, y), add = multiSelect || e.ctrlKey || e.metaKey || e.shiftKey;
    if (handle) drag = { pointer: e.pointerId, kind: 'resize', handle: handle.key, ids: selectedIds(), bounds: selectionBounds(), x0: x, y0: y, x, y, moved: false };
    else {
      const o = objectAt(x, y), part = currentPart(), p = part && o && part.object === o.id && inside(part.bounds, x, y, 0) ? part : null;
      if (!o) { marquee = { pointer: e.pointerId, x0: x, y0: y, x, y, shift: add }; drag = null; }
      else {
        const unit = unitOf(o.id), targets = sel.includes(unit) ? selectedIds() : expand([unit]);
        drag = { pointer: e.pointerId, unit, shift: add, kind: p ? 'part' : 'object', ids: targets, bounds: selectionBounds(targets), index: p?.index, part: p, x0: x, y0: y, x, y, moved: false };
        // A long press on a touch screen adds the object to the selection (or takes it out), as Select multiple does.
        if (e.pointerType === 'touch') { clearTimeout(longPress); const pressed = drag; longPress = setTimeout(() => { if (drag === pressed && !pressed.moved) { drag = null; pressed.done = true; toggle(unit); } }, 550); }
      }
    }
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (multiTouch) return;
    const [x, y] = toLogical(e);
    if (marquee?.pointer === e.pointerId) { marquee.x = x; marquee.y = y; schedule(); return; }
    if (drag && drag.pointer === e.pointerId) {
      if (Math.hypot(x - drag.x0, y - drag.y0) > (e.pointerType === 'touch' ? 8 / Math.min(canvas.clientWidth / frame.w, canvas.clientHeight / frame.h) : 3)) { drag.moved = true; clearTimeout(longPress); }
      if (drag.kind === 'part') { drag.x = drag.part.x + x - drag.x0; drag.y = drag.part.y + y - drag.y0; } else { drag.x = x; drag.y = y; }
      schedule(); return;
    }
    const h = handleAt(x, y); canvas.style.cursor = h ? `${h.key}-resize` : objectAt(x, y) ? 'move' : 'default';
  });
  canvas.addEventListener('pointerup', (e) => {
    activePointers.delete(e.pointerId); clearTimeout(longPress);
    if (multiTouch) { if (!activePointers.size) multiTouch = false; drag = null; marquee = null; schedule(); return; }
    if (marquee?.pointer === e.pointerId) {
      const m = marquee; marquee = null;
      const x0 = Math.min(m.x0, m.x), x1 = Math.max(m.x0, m.x), y0 = Math.min(m.y0, m.y), y1 = Math.max(m.y0, m.y);
      const hit = objs().filter((o) => o.binding === 'drawing.object').filter((o) => { const b = boxOf(o.id); return b && b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1; }).map((o) => (o.role === 'member' && o.in ? o.in : o.id));
      const next = [...new Set([...(m.shift ? sel : []), ...hit])];
      if (next.length || sel.length) select(next);
      schedule(); return;
    }
    const current = drag; drag = null;
    if (current && current.pointer === e.pointerId && !current.done) {
      if (current.moved) {
        if (current.kind === 'part') canvasTool('drawing.part.place', { id: current.part.object, index: current.part.index, x: current.x, y: current.y });
        else {
          const [operation, args] = current.kind === 'resize' || current.ids.length > 1 ? ['drawing.objects.transform', transformArgs(current)] : moveArgs(current.ids, current.x - current.x0, current.y - current.y0);
          settling = current; canvasTool(operation, args).finally(() => endSettling(current));
        }
      } else if (current.kind !== 'resize') {
        if (current.shift) toggle(current.unit);
        else if (current.kind === 'part') canvasTool('drawing.part.select', { id: current.part.object, index: current.part.index });
        else select([current.unit]);
      }
    }
    schedule();
  });
  // A cancelled touch (the browser took it over, a pinch began) changes nothing.
  canvas.addEventListener('pointercancel', (e) => { activePointers.delete(e.pointerId); clearTimeout(longPress); if (!activePointers.size) multiTouch = false; drag = null; marquee = null; schedule(); });
  canvas.addEventListener('dblclick', (e) => { const [x, y] = toLogical(e), o = objectAt(x, y); if (o) select([unitOf(o.id)]).then(() => { nameInput.focus(); nameInput.select(); }); else openChooser({ x: Math.round(x), y: Math.round(y) }, e); });
  canvas.addEventListener('keydown', (e) => {
    const ids = selectedIds(), part = currentPart(), moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, move = moves[e.key];
    if (move && ids.length) {
      e.preventDefault(); const step = e.shiftKey ? 20 : 2;
      if (part) canvasTool('drawing.part.place', { id: part.object, index: part.index, x: part.x + move[0] * step, y: part.y + move[1] * step });
      else { const [operation, args] = moveArgs(ids, move[0] * step, move[1] * step); canvasTool(operation, args); }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) { e.preventDefault(); canvasTool(part ? 'drawing.part.remove' : 'drawing.object.remove', part ? { id: part.object, index: part.index } : { ids }); }
    else if (e.key === 'Enter' && focus()?.binding === 'drawing.object') { e.preventDefault(); nameInput.focus(); nameInput.select(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeChooser(); if (sel.length) select([]); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); canvasTool(e.shiftKey ? 'drawing.redo' : 'drawing.undo'); }
  });

  // ---- library and declarations --------------------------------------------------------------------------------
  // The shapes the Add chooser offers are the declared kinds of drawing.object.make (host.tools), else the kinds the
  // area observes as options.
  const kindsOf = () => operations.find((op) => op.id === 'drawing.object.make')?.params?.kind?.enum ?? state.options?.kind ?? [];
  function fillChooser() {
    shapeChoices.textContent = '';
    for (const kind of kindsOf()) { const button = el('button', 'dr-act'); button.type = 'button'; button.textContent = String(kind); button.addEventListener('click', () => createObject('drawing.object.make', { kind })); shapeChoices.append(button); }
  }
  Promise.all([import(VENDOR.href), Promise.resolve(typeof host.tools === 'function' ? host.tools({ view: VIEW }) : null).catch(() => null)]).then(([r, declared]) => {
    if (destroyed) return;
    rough = r.default ?? r.rough;
    // the declarations of this tab's view (a host that answers for another view is not read)
    const declaredOps = Array.isArray(declared?.operations) ? declared.operations : [];
    operations = declaredOps.some((op) => op.id === 'drawing.object.make') ? declaredOps : [];
    const has = (id) => !operations.length || operations.some((op) => op.id === id);
    redoButton.disabled = !has('drawing.redo'); undoButton.disabled = !has('drawing.undo');
    idsDuration = operations.find((op) => op.id === 'drawing.ids.show')?.params?.duration?.default ?? idsDuration;
    fillChooser(); addButton.disabled = false; syncControls();
    renderer = createRenderer(rough); ctx = canvas.getContext('2d'); rc = rough.canvas(canvas);
    sync(); schedule();
  }).catch((e) => {
    console.warn('drawing tab: libraries failed to load', e);
    caption.textContent = 'The drawing libraries could not be loaded. The commands still work.';
  });

  api = {
    update(next) {
      if (!next || typeof next !== 'object' || next.pending) return;
      state = { objects: [], inputs: {}, boxes: {}, options: {}, ...next, runtime: next.runtime ?? { view: {} } };
      parser ??= new DOMParser();
      ({ items, frame } = readProjection(state.svg ?? '', parser));
      if (state.frame?.w > 0 && state.frame?.h > 0) frame = { ...state.frame, ...(frame.filter ? { filter: frame.filter } : {}), ...(frame.tint ? { tint: frame.tint } : {}) };
      // The selection: the view's selected id, or the several the UI selected together (the view keeps the last).
      const vs = view().selected ?? null;
      if (vs !== lastViewSelected) sel = pendingSel?.includes(vs) ? pendingSel : vs ? [vs] : [];
      lastViewSelected = vs;
      sel = sel.filter((id) => byId(id));
      const ids = view().ids; if (ids === 'temporary' && lastIds !== undefined && lastIds !== 'temporary') showIdsFor(idsDuration); lastIds = ids ?? null;
      if (!operations.length && kindsOf().length && !shapeChoices.childElementCount) fillChooser();
      caption.textContent = captionOf(state);
      canvas.setAttribute('aria-label', `Drawing: ${captionOf(state)}`);
      showHint(); syncControls();
      if (renderer) { sync(); schedule(); }
    },
    show() { schedule(); }, hide() {}, setVisible(visible) { if (visible) schedule(); },
    /** Download the picture as PNG (2x) or SVG; returns { ok, detail }. */
    async download({ format = 'png', filename = 'my-drawing' } = {}) {
      if (!renderer) return { ok: false, detail: 'the drawing is not ready yet' };
      const name = `${String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'my-drawing'}.${format === 'svg' ? 'svg' : 'png'}`;
      let blob;
      if (format === 'svg') blob = new Blob([renderer.toSVG(items, frame, scaleOf)], { type: 'image/svg+xml' });
      else {
        const off = document.createElement('canvas'); off.width = frame.w * 2; off.height = frame.h * 2;
        const octx = off.getContext('2d'), orc = rough.canvas(off); octx.setTransform(2, 0, 0, 2, 0, 0); octx.fillStyle = PAPER; octx.fillRect(0, 0, frame.w, frame.h);
        renderer.beginFrame(octx, frame); for (const it of items) renderer.drawItem(octx, orc, it, scaleOf(it.id)); renderer.endFrame(octx, frame);
        blob = await new Promise((res) => off.toBlob(res, 'image/png'));
      }
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; a.hidden = true;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true, detail: name };
    },
    destroy() { destroyed = true; clearTimeout(idsTimer); clearTimeout(longPress); resizeObserver?.disconnect(); closeInspectorSplitter(); if (raf) cancelAnimationFrame(raf); },
  };
  api.update(host.state?.('art.draw'));
  return api;
}

export default {
  id: 'draw',
  label: 'Drawing',
  world: 'art.draw',
  order: 80,
  make,
  effects: {
    'draw.download': async (args, { ui }) => (ui?.download ? ui.download(args ?? {}) : { ok: false, detail: 'the Drawing tab is not open' }),
  },
};
