import {mountInspectorSplitter} from './pane-splitter.mjs';
// SPDX-License-Identifier: AGPL-3.0-only
// The avatar editor. It READS only the SOP area projection of ui.avatar (worlds/sop-area.mjs projectSopArea over
// worlds/ui.avatar/area.sop): the drawn SVG (each part's shapes carry data-select="<slot>"), the observed objects
// (the face with its name, base and character kind; each part with its variant, size and place), the observed inputs
// (expression, colours, the id display mode, ...), the options of each key (variants per slot, presets, sizes, places,
// colours) and the view keys (selected, ids, scale). Every action SENDS one of the tab's declared native commands
// through host.tool(operation, args, {view:'avatar'}), the same route as chat; host.tools() gives the enums and limits.
// The look and the interactions are those of the earlier editor: a canvas with click-to-select, a selection box with
// resize handles, keyboard moves and delete, object id labels, and an inspector with the composition, emotion,
// selection, scale, colour, size, move, delete, features, words and variant cards. Nothing here knows a face part,
// a colour or a size: those come from the projection.
const FADE_MS = 380;
const VIEW = 'avatar';
const plain = (t) => String(t ?? '').replace(/_/g, ' ');
const ARROWS = { left: '←', up: '↑', down: '↓', right: '→' };   // icons of the move buttons (presentation only)
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

const STYLE = `
.p2-avatar-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.p2-avatar-stage { position: relative; width: min(100%, 460px); aspect-ratio: 1; max-height: 64vh; border-radius: 28px; overflow: hidden;
  background: radial-gradient(circle at 50% 35%, #fff, #e8edf5 80%); box-shadow: 0 10px 30px rgba(20, 30, 60, .18); transform-origin: 50% 80%; }
.p2-avatar-layer { position: absolute; inset: 0; opacity: 0; transition: opacity ${FADE_MS}ms ease; }
.p2-avatar-layer.is-in { opacity: 1; }
.p2-avatar-layer svg { display: block; width: 100%; height: 100%; }
.p2-avatar-layer [data-select] { cursor: pointer; }
.p2-avatar-selection{position:absolute;inset:0;width:100%;height:100%;z-index:5;pointer-events:none;overflow:visible}
.p2-avatar-selection [data-resize-handle]{pointer-events:all;cursor:nwse-resize;touch-action:none;fill:#fff;stroke:#1765d1;stroke-width:1.5;vector-effect:non-scaling-stroke}
.p2-avatar-selection [data-resize-handle=ne],.p2-avatar-selection [data-resize-handle=sw]{cursor:nesw-resize}
.p2-avatar-selection-box{fill:#1765d10a;stroke:#1765d1;stroke-width:1.8;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.p2-avatar-object-id{font:3px ui-monospace,monospace;fill:#122851;stroke:#fff;stroke-width:.8;paint-order:stroke;pointer-events:none}
.p2-avatar-object-identity{flex:1 1 100%;font-size:12px;overflow-wrap:anywhere}.p2-avatar-object-identity code{font-weight:600;user-select:all}
.p2-avatar-stage.fx-dance { animation: p2-av-dance .9s ease-in-out 3; }
.p2-avatar-stage.fx-nod { animation: p2-av-nod .5s ease-in-out 3; }
.p2-avatar-stage.fx-shake { animation: p2-av-shake .45s ease-in-out 3; }
.p2-avatar-stage.fx-wave { animation: p2-av-wave .7s ease-in-out 3; }
.p2-avatar-stage.fx-spin { animation: p2-av-spin 1s ease-in-out 1; }
.p2-avatar-stage.fx-jump, .p2-avatar-stage.fx-bounce { animation: p2-av-jump .5s ease-out 3; }
.p2-avatar-stage.fx-wiggle { animation: p2-av-wiggle .35s ease-in-out 4; }
.p2-avatar-caption { text-align: center; max-width: 460px; }
.p2-avatar-name { margin: 0; font-weight: 600; font-size: 18px; }
.p2-avatar-parts { margin: 2px 0 0; font-size: 13px; opacity: .72; }
.p2-avatar-row { display: flex; gap: 8px; width: min(100%, 460px); overflow-x: auto; padding: 4px 2px 6px; }
.p2-avatar-row[hidden] { display: none; }
.p2-avatar-card { flex: 0 0 auto; width: 64px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 4px 6px; border: 2px solid transparent; border-radius: 12px;
  background: rgba(127, 140, 170, .12); color: inherit; font: inherit; cursor: pointer; }
.p2-avatar-card:hover { background: rgba(127, 140, 170, .24); }
.p2-avatar-card.is-on { border-color: #3b82f6; background: rgba(59, 130, 246, .14); }
.p2-avatar-pic { display: grid; place-content: center; width: 52px; height: 52px; border-radius: 12px; overflow: hidden; background: #e8edf5; font-size: 20px; color: #5d6b84; }
.p2-avatar-pic svg { display: block; width: 52px; height: 52px; }
.p2-avatar-lbl { font-size: 11px; line-height: 1.1; text-align: center; }
.p2-avatar-chip { display: inline-flex; align-items: center; padding: 3px 10px; border: 1px solid rgba(127, 140, 170, .45); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.p2-avatar-chip:hover { background: rgba(127, 140, 170, .2); }
.p2-avatar-chip.is-on { border-color: #3b82f6; background: rgba(59, 130, 246, .14); }
.p2-avatar-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: 100%; max-width: 460px; }
.p2-avatar-chips[hidden] { display: none; }
.p2-avatar-note { margin: 0; font-size: 11px; opacity: .65; text-align: center; max-width: 460px; }
.p2-avatar-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;width:min(100%,460px)}.p2-avatar-tools label{display:flex;align-items:center;gap:5px;font-size:12px}.p2-avatar-tools select,.p2-avatar-tools input[type=number]{font:inherit;max-width:155px;background:var(--surface,#fff);color:inherit;border:1px solid #9aa4ba77;border-radius:6px;padding:5px}.p2-avatar-tools button{font:inherit;border:1px solid #9aa4ba77;border-radius:6px;background:transparent;color:inherit;padding:5px 8px;cursor:pointer}.p2-avatar-tools button:disabled{opacity:.4;cursor:default}.p2-avatar-stage:focus-visible{outline:3px solid #4478d8;outline-offset:3px}.p2-avatar-status{font-size:12px;min-height:18px;margin:0;text-align:center;max-width:460px}
.p2-avatar-stage.is-empty::after{content:"Empty avatar — choose a composition base and Recompose";position:absolute;inset:0;display:grid;place-content:center;padding:24px;text-align:center;font:16px system-ui;color:var(--muted,#687489);pointer-events:none}.p2-avatar-editor{display:grid;grid-template-columns:minmax(0,1fr) 280px;align-items:stretch;gap:0;height:100%;min-height:0;overflow:hidden}.p2-avatar-editor .p2-avatar-canvas{min-width:0;min-height:0;display:flex;position:relative}.p2-avatar-editor .p2-avatar-stage{width:100%;height:100%;aspect-ratio:auto;max-height:none;border-radius:0;box-shadow:none;background:var(--surface-2,#edf1f8)}.p2-avatar-editor .p2-avatar-inspector{min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;border-left:1px solid var(--line,#b4bfd255);padding:12px;box-sizing:border-box}.p2-avatar-editor .p2-avatar-caption,.p2-avatar-editor .p2-avatar-tools,.p2-avatar-editor .p2-avatar-chips,.p2-avatar-editor .p2-avatar-note,.p2-avatar-editor .p2-avatar-row,.p2-avatar-editor .p2-avatar-status{width:100%;max-width:none}.p2-avatar-editor .p2-avatar-row{display:flex;flex-wrap:wrap;overflow:visible;box-sizing:border-box}.p2-avatar-editor .p2-avatar-caption{text-align:left}.p2-avatar-editor .p2-avatar-name{font-size:18px}.p2-avatar-editor .p2-avatar-parts{font-size:12px}.p2-avatar-editor .p2-avatar-tools{justify-content:flex-start}.p2-avatar-editor .p2-avatar-tools label{flex:1 1 100%;justify-content:space-between}.p2-avatar-editor .p2-avatar-tools select{min-width:0;max-width:170px}.p2-avatar-editor .p2-avatar-chips{justify-content:flex-start}.p2-avatar-wordlist{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.p2-avatar-wordlist summary{cursor:pointer;font-weight:600}.p2-avatar-scope{flex:1 1 100%;font-size:11px;line-height:1.5;opacity:.75}.p2-avatar-editor .p2-avatar-card{width:60px;min-width:0}.p2-avatar-editor .p2-avatar-note{text-align:left}@media(max-width:780px){.p2-avatar-editor{grid-template-columns:minmax(0,1fr) 235px}.p2-avatar-editor .p2-avatar-inspector{padding:8px;gap:8px}}@media(max-width:560px){.p2-avatar-editor{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(220px,50%) minmax(0,1fr)}.p2-avatar-editor .p2-avatar-inspector{border-left:0;border-top:1px solid var(--line,#b4bfd255)}}

@keyframes p2-av-dance { 0%, 100% { transform: rotate(0) translateY(0); } 25% { transform: rotate(-5deg) translateY(-8px); } 75% { transform: rotate(5deg) translateY(-8px); } }
@keyframes p2-av-nod { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(12px); } }
@keyframes p2-av-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-14px); } 75% { transform: translateX(14px); } }
@keyframes p2-av-wave { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(7deg); } }
@keyframes p2-av-spin { to { transform: rotate(360deg); } }
@keyframes p2-av-jump { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-26px); } }
@keyframes p2-av-wiggle { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@media (prefers-reduced-motion: reduce) { .p2-avatar-stage, .p2-avatar-layer { animation: none !important; transition: none; } }
`;
function ensureCss() {
  if (document.getElementById('p2-avatar-css')) return;
  const st = document.createElement('style');
  st.id = 'p2-avatar-css';
  st.textContent = STYLE;
  document.head.append(st);
}
const list = (value) => value === undefined || value === null ? [] : [].concat(value);
const unique = (values) => [...new Set(values)];

/**
 * The avatar view. Returns { update(state), emit(type, payload), setSpeaking(bool, text), setVisible(bool), show(), hide(),
 * mirror(el, px), frame(), animate({ name }), destroy() }. `state` is the projection of the ui.avatar area.
 */
export function createAvatar(container, host = null, { editor = false } = {}) {
  ensureCss();
  container.classList.add('p2-avatar-wrap');
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svgNode = (tag, attrs = {}) => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node; };
  const stage = el('div', 'p2-avatar-stage', { role: 'img', tabindex: '0' });
  const selectionLayer = svgNode('svg', { class: 'p2-avatar-selection', 'aria-label': 'Avatar selection bounds' }); stage.append(selectionLayer);
  const caption = el('div', 'p2-avatar-caption'), nameEl = el('p', 'p2-avatar-name'), partsEl = el('p', 'p2-avatar-parts');
  caption.append(nameEl, partsEl);
  const chipsEl = el('div', 'p2-avatar-chips', { role: 'group', 'aria-label': 'Expressions' });
  const optsEl = el('div', 'p2-avatar-row', { role: 'group', 'aria-label': 'Choices' });
  const noteEl = el('p', 'p2-avatar-note');
  const toolsEl = el('div', 'p2-avatar-tools', { 'aria-label': 'Edit avatar parts' }), statusEl = el('p', 'p2-avatar-status', { role: 'status', 'aria-live': 'polite' });
  let closeInspectorSplitter = () => {};
  if (editor) {
    container.classList.add('p2-avatar-editor');
    const canvas = el('div', 'p2-avatar-canvas'), inspector = el('aside', 'p2-avatar-inspector', { 'aria-label': 'Avatar inspector' });
    canvas.append(stage); inspector.append(caption, toolsEl, chipsEl, optsEl, noteEl, statusEl); container.append(canvas, inspector);
    closeInspectorSplitter = mountInspectorSplitter(container, inspector, { id: 'avatar', persist: host?.persistent !== false });
  } else container.append(stage, caption, chipsEl, toolsEl, optsEl, noteEl, statusEl);
  optsEl.hidden = true;

  let state = null, tools = null, toolsAsked = false, destroyed = false, visible = false, lastSvg = '', shown = '', controlBusy = false;
  let resizeGesture = null, identifyTimer = 0, idsUntil = 0, idsMode = null, geometryFrame = 0, suppressSelectionClick = 0, fxTimer = 0;
  const mirrors = [];   // { el, px, svg }: the small copies of the face (the icon in the input bar)

  // ---- what the projection says ---------------------------------------------------------------------------------
  const params = (operation) => tools?.find((op) => op.id === operation)?.params ?? {};
  const enumOf = (operation, name) => list(params(operation)[name]?.enum).filter((v) => v !== null);
  const faceId = () => params('avatar.face.select').id?.default ?? enumOf('avatar.face.select', 'id')[0] ?? 'face';
  const objects = () => state?.objects ?? [];
  const faceObject = () => objects().find((o) => o.id === faceId()) ?? null;
  const parts = () => objects().filter((o) => o.id !== faceId() && o.variant !== undefined);
  const part = (id) => parts().find((o) => o.id === id) ?? null;
  const inputs = (id) => state?.inputs?.[id] ?? {};
  const options = (key) => state?.options?.[key] ?? [];
  const selected = () => state?.selected ?? state?.runtime?.view?.selected ?? null;
  const scaleLimits = () => { const p = params('avatar.part.resize').scale ?? params('avatar.face.resize').scale ?? {}; return { min: Number(p.min ?? 0.1), max: Number(p.max ?? 10) }; };
  const clampScale = (value) => { const { min, max } = scaleLimits(); return Math.max(min, Math.min(max, value)); };
  const currentScale = (id) => { const value = Number(id === faceId() ? state?.runtime?.view?.scale ?? 1 : part(id)?.size ?? 1); return Number.isFinite(value) ? value : 1; };
  /** The slots a person can pick: the observed slot list, those that have variants in this face's style. */
  const slots = () => options('object').filter((slot) => options(slot).length);

  async function loadTools() {
    if (toolsAsked || !host?.tools) return;
    toolsAsked = true;
    try { tools = (await host.tools({ view: VIEW }))?.operations ?? []; shown = ''; draw_(); }
    catch (error) { toolsAsked = false; console.warn('avatar: the declared tools could not be read', error); }
  }
  async function control(operation, args) {
    if (controlBusy || host?.isBusy?.()) return null;
    if (!host?.tool) { statusEl.textContent = 'Face controls are unavailable.'; return null; }
    controlBusy = true; toolsEl.setAttribute('aria-busy', 'true');
    try { const result = await host.tool(operation, args, { view: VIEW }); statusEl.textContent = result?.message ?? (result?.ok ? 'Updated the face.' : 'Could not update the face.'); return result; }
    catch (error) { statusEl.textContent = error.message; return null; }
    finally { controlBusy = false; toolsEl.removeAttribute('aria-busy'); }
  }
  const resize = (id, scale) => control(id === faceId() ? 'avatar.face.resize' : 'avatar.part.resize', id === faceId() ? { id, scale } : { ids: [id], scale });
  const select = (id) => control(id === faceId() ? 'avatar.face.select' : 'avatar.part.select', { id: id || null });

  // ---- the picture ----------------------------------------------------------------------------------------------
  /** The projection's SVG for the stage: padded so a part grown to the largest scale stays inside, the view's scale applied. */
  function stageSvg() {
    const svg = state?.svg ?? '';
    if (!svg) return '';
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
    if (root.nodeName !== 'svg') return svg;
    const frame = state?.frame ?? { w: 100, h: 100 }, pad = editor ? Math.max(frame.w, frame.h) * Math.max(0, scaleLimits().max - 1) / 2 : 0;
    root.setAttribute('viewBox', `${-pad} ${-pad} ${frame.w + pad * 2} ${frame.h + pad * 2}`);
    root.removeAttribute('width'); root.removeAttribute('height');
    const zoom = currentScale(faceId());
    if (zoom !== 1) {
      const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${frame.w / 2} ${frame.h / 2}) scale(${zoom}) translate(${-frame.w / 2} ${-frame.h / 2})`);
      g.setAttribute('data-avatar-zoom', String(zoom));
      g.append(...root.childNodes);
      root.append(g);
    }
    // The face's frame on a light card, as the earlier editor drew it (presentation only; a click on it picks the whole avatar).
    if (editor) { const card = doc.createElementNS('http://www.w3.org/2000/svg', 'rect'); for (const [k, v] of Object.entries({ x: 0, y: 0, width: frame.w, height: frame.h, fill: '#e8edf5', 'data-avatar-frame': 'true' })) card.setAttribute(k, String(v)); root.prepend(card); }
    const label = svgNode('title'); label.textContent = stage.getAttribute('aria-label') ?? ''; root.prepend(doc.importNode(label, true));
    return new XMLSerializer().serializeToString(root);
  }
  function paint(svg, fade) {
    if (svg === lastSvg) return;
    lastSvg = svg;
    const layers = () => [...stage.children].filter((node) => node.classList.contains('p2-avatar-layer'));
    const top = layers().at(-1);
    if (!fade && top) { top.innerHTML = svg; return; }
    const layer = el('div', 'p2-avatar-layer');
    layer.innerHTML = svg;
    const old = layers();
    stage.insertBefore(layer, selectionLayer);
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add('is-in'); old.forEach((o) => o.classList.remove('is-in')); }));
    setTimeout(() => old.forEach((o) => o.remove()), FADE_MS + 60);
  }
  const rendererSvg = () => [...stage.querySelectorAll('.p2-avatar-layer > svg')].at(-1);
  /** The box a part occupies in the drawn picture (all of them for the whole avatar), in the SVG's own units. */
  function renderedBounds(id, svg = rendererSvg()) {
    if (!svg || !id) return null;
    const nodes = [...svg.querySelectorAll('[data-select]')].filter((node) => id === faceId() || node.getAttribute('data-select') === id);
    const inverse = svg.getScreenCTM()?.inverse(); if (!inverse) return null;
    const points = [];
    for (const node of nodes) { const matrix = inverse.multiply(node.getScreenCTM()), box = node.getBBox(); for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) points.push(new DOMPoint(x, y).matrixTransform(matrix)); }
    if (!points.length) return null;
    const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y)), w = Math.max(...points.map((p) => p.x)) - x, h = Math.max(...points.map((p) => p.y)) - y;
    return w || h ? { x, y, w, h } : null;
  }
  function paintSelection(box) {
    selectionLayer.querySelector('[data-selection-geometry]')?.remove();
    const id = selected(); if (!box || !id) return;
    const group = svgNode('g', { 'data-selection-geometry': 'true' }), pad = 1;
    group.append(svgNode('rect', { class: 'p2-avatar-selection-box', x: box.x - pad, y: box.y - pad, width: Math.max(box.w, 0) + pad * 2, height: Math.max(box.h, 0) + pad * 2, 'data-selected-object-id': id }));
    const label = svgNode('text', { class: 'p2-avatar-object-id', x: box.x, y: box.y - 2 }); label.textContent = id; group.append(label);
    for (const [corner, x, y] of [['nw', box.x, box.y], ['ne', box.x + box.w, box.y], ['sw', box.x, box.y + box.h], ['se', box.x + box.w, box.y + box.h]])
      group.append(svgNode('circle', { 'data-resize-handle': corner, cx: x, cy: y, r: 1.8, role: 'button', tabindex: 0, 'aria-label': 'Resize ' + plain(id) + ' from ' + corner }));
    selectionLayer.append(group);
  }
  const idsShown = () => idsMode === 'always' || (idsMode === 'temporary' && Date.now() < idsUntil);
  function geometry() {
    if (destroyed || !visible) return;
    const svg = rendererSvg();
    selectionLayer.setAttribute('viewBox', svg?.getAttribute('viewBox') ?? '0 0 100 100'); selectionLayer.replaceChildren();
    if (idsShown()) {
      const ids = unique([...svg?.querySelectorAll('[data-select]') ?? []].map((node) => node.getAttribute('data-select')));
      for (const id of [faceId(), ...ids]) { if (id === selected()) continue; const box = renderedBounds(id, svg); if (!box) continue; const label = svgNode('text', { class: 'p2-avatar-object-id', x: box.x, y: box.y - 1, 'data-object-id': id }); label.textContent = id; selectionLayer.append(label); }
    }
    paintSelection(renderedBounds(selected(), svg));
  }
  function scheduleGeometry() { cancelAnimationFrame(geometryFrame); geometryFrame = requestAnimationFrame(() => { geometryFrame = 0; if (!resizeGesture) geometry(); }); }
  const geometryObserver = new ResizeObserver(scheduleGeometry); geometryObserver.observe(stage);

  // ---- resize by dragging a handle (one resize command when the drag ends) or by the arrow keys on a handle ---------
  function cursorPoint(event) { const matrix = selectionLayer.getScreenCTM(); return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null; }
  function resizeValue(event) {
    const point = cursorPoint(event); if (!point || !resizeGesture) return null;
    const { center, initialDistance, scale } = resizeGesture;
    return clampScale(scale * Math.hypot(point.x - center.x, point.y - center.y) / initialDistance);
  }
  selectionLayer.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest?.('[data-resize-handle]'); if (!handle || event.button !== 0 || controlBusy || host?.isBusy?.()) return;
    const id = selected(), box = renderedBounds(id), point = cursorPoint(event); if (!box || !point) return;
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 }, initialDistance = Math.hypot(point.x - center.x, point.y - center.y); if (initialDistance === 0) return;
    event.preventDefault(); event.stopPropagation();
    resizeGesture = { pointer: event.pointerId, id, box, center, initialDistance, scale: currentScale(id) };
    stage.setPointerCapture?.(event.pointerId);
  });
  const resizeMove = (event) => {
    if (resizeGesture?.pointer !== event.pointerId) return;
    const scale = resizeValue(event); if (scale === null) return;
    const { box, center } = resizeGesture, ratio = scale / resizeGesture.scale;
    paintSelection({ x: center.x - box.w * ratio / 2, y: center.y - box.h * ratio / 2, w: box.w * ratio, h: box.h * ratio });
  };
  const resizeEnd = (event) => {
    if (resizeGesture?.pointer !== event.pointerId) return;
    const gesture = resizeGesture, scale = event.type === 'pointerup' ? resizeValue(event) : null; resizeGesture = null; suppressSelectionClick = performance.now() + 250;
    if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    geometry();
    if (scale !== null && Math.abs(scale - gesture.scale) > 1e-3) resize(gesture.id, scale);
  };
  window.addEventListener('pointermove', resizeMove, true); window.addEventListener('pointerup', resizeEnd, true); window.addEventListener('pointercancel', resizeEnd, true);
  selectionLayer.addEventListener('keydown', (event) => {
    if (!event.target.closest?.('[data-resize-handle]') || !KEYS[event.key]) return;
    event.preventDefault(); event.stopPropagation();
    const id = selected(), step = (['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1) * (event.shiftKey ? 0.1 : 0.01);
    resize(id, clampScale(Math.round((currentScale(id) + step) * 1000) / 1000));
  });

  // ---- the inspector ---------------------------------------------------------------------------------------------
  const card = (label, action, pic, on) => {
    const b = el('button', `p2-avatar-card${on ? ' is-on' : ''}`, { type: 'button', title: label, 'aria-pressed': String(!!on) });
    const picture = el('span', 'p2-avatar-pic', { 'aria-hidden': 'true' });
    if (pic instanceof Node) picture.append(pic); else picture.textContent = pic ?? '';
    const lbl = el('span', 'p2-avatar-lbl'); lbl.textContent = label;
    b.append(picture, lbl); b.addEventListener('click', action);
    return b;
  };
  /** A small picture of a part as it is drawn now: its own shapes from the stage, framed by their box. */
  function partPicture(id) {
    const svg = rendererSvg(), box = renderedBounds(id, svg); if (!svg || !box) return null;
    const pic = svgNode('svg', { viewBox: `${box.x - 2} ${box.y - 2} ${box.w + 4} ${box.h + 4}`, 'aria-hidden': 'true' });
    const inverse = svg.getScreenCTM()?.inverse();
    for (const node of svg.querySelectorAll(`[data-select="${CSS.escape(id)}"]`)) {
      const copy = node.cloneNode(true), m = inverse?.multiply(node.parentNode.getScreenCTM());
      if (m) { const g = svgNode('g', { transform: `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})` }); g.append(copy); pic.append(g); } else pic.append(copy);
    }
    return pic;
  }
  function describe() {
    const shownParts = parts();
    return shownParts.length ? shownParts.map((p) => `${plain(p.variant)} ${plain(p.id)}`).join(', ') : 'Empty avatar — choose a composition base and Recompose.';
  }
  function rows() {
    const sel = selected(), face = faceObject(), slot = sel && sel !== faceId() && options('object').includes(sel) ? sel : null;
    const sig = JSON.stringify([state?.objects, state?.inputs, state?.options, state?.runtime?.view, !!tools, idsMode]);
    if (sig === shown) return;
    shown = sig;
    toolsEl.replaceChildren();
    const selectBox = (label, values, value, change) => {
      const wrap = el('label', ''), input = el('select', '', { 'aria-label': label });
      wrap.append(document.createTextNode(label + ' '), input);
      for (const [id, name] of values) { const option = el('option', '', { value: id }); option.textContent = name; input.append(option); }
      input.value = value ?? ''; input.addEventListener('change', () => change(input.value)); toolsEl.append(wrap); return input;
    };
    const button = (label, action, attrs = {}) => { const b = el('button', '', { type: 'button', ...attrs }); b.textContent = label; b.addEventListener('click', action); toolsEl.append(b); return b; };
    const scope = (text) => { const node = el('div', 'p2-avatar-scope'); node.textContent = text; toolsEl.append(node); return node; };

    // Character kind and composition base: the declared enums of the compose command; the face's observed base and kind.
    const kind = face?.characterKind ?? '';
    const kinds = unique([...enumOf('avatar.face.compose', 'characterKind'), ...(kind ? [kind] : [])]);
    selectBox('Character kind', [...(kind ? [] : [['', 'Choose a kind']]), ...kinds.map((k) => [k, plain(k)])], kind, (value) => { if (value) control('avatar.face.compose', { characterKind: value }); });
    // When the projection observes each preset's kind (inputs.preset: name -> kind), the bases follow the chosen kind.
    const presetKind = inputs('preset'), bases = unique([...enumOf('avatar.face.compose', 'base'), ...options('preset')])
      .filter((name) => !kind || presetKind[name] === undefined || presetKind[name] === kind);
    selectBox('Composition base', [...(face?.base ? [] : [['', 'Choose a base']]), ...bases.map((name) => [name, plain(name)])], face?.base ?? '', (base) => { if (base) control('avatar.face.compose', { base }); });
    // Emotion: neutral is the empty expression the command declares.
    const expression = inputs(faceId()).expression ?? '';
    const expressions = unique([...enumOf('avatar.face.expression', 'expression'), ...options('expression')]).filter((name) => name !== '');
    const emotions = [['', 'Neutral'], ...expressions.map((name) => [name, plain(name)])];
    if (expression && !expressions.includes(expression)) emotions.push([expression, plain(expression)]);
    selectBox('Emotion', emotions, expression, (value) => control('avatar.face.expression', { expression: value }));
    // Selection: the whole avatar or a slot.
    selectBox('Selection', [['', 'Choose an object'], [faceId(), 'Whole avatar'], ...slots().map((s) => [s, plain(s)])], sel ?? '', (id) => select(id));
    const identity = el('p', 'p2-avatar-object-identity', { 'data-selected-native-id': sel ?? '' }), identityValue = el('code', '');
    identity.append(document.createTextNode('Object ID: '), identityValue); identityValue.textContent = sel ?? 'none'; toolsEl.append(identity);
    button('Identify IDs', async () => { const result = await control('avatar.ids.show', { mode: 'temporary' }); if (result?.ok) showIdsFor(); }, { 'aria-label': 'Identify avatar object IDs' });
    const alwaysWrap = el('label', ''), always = el('input', '', { type: 'checkbox', 'aria-label': 'Always show avatar object IDs' });
    always.checked = idsMode === 'always'; alwaysWrap.append(always, document.createTextNode('Always show IDs'));
    always.addEventListener('change', () => control('avatar.ids.show', { mode: always.checked ? 'always' : 'off' })); toolsEl.append(alwaysWrap);
    if (sel) {
      const { min, max } = scaleLimits(), scaleWrap = el('label', ''), scale = el('input', '', { type: 'number', min, max, step: 'any', 'aria-label': 'Selection scale' });
      scale.value = String(currentScale(sel)); scaleWrap.append(document.createTextNode('Scale '), scale);
      scale.addEventListener('change', () => {
        const value = Number(scale.value);
        if (!Number.isFinite(value) || value < min || value > max) { statusEl.textContent = `Scale must be between ${min} and ${max}.`; scale.value = String(currentScale(sel)); return; }
        resize(sel, value);
      });
      toolsEl.append(scaleWrap);
    }
    const present = parts().map((p) => p.id);
    button('Clear avatar', () => control('avatar.clear', { ids: present })).disabled = !present.length;
    button('Recompose', () => control('avatar.face.preset', { preset: face?.base })).disabled = !face?.base;
    button('Undo', () => control('avatar.undo', {}));

    // Expression chips: the same command as the Emotion list, one tap each.
    chipsEl.replaceChildren(...[['', 'Neutral'], ...expressions.map((name) => [name, plain(name)])].map(([value, label]) => {
      const chip = el('button', `p2-avatar-chip${value === expression ? ' is-on' : ''}`, { type: 'button', 'aria-pressed': String(value === expression) });
      chip.textContent = label; chip.addEventListener('click', () => control('avatar.face.expression', { expression: value })); return chip;
    }));
    chipsEl.hidden = !expressions.length;

    if (!slot) { optsEl.replaceChildren(); optsEl.hidden = true; return; }
    const current = part(slot), here = !!current, own = inputs(slot);
    // Features: the projection's offered values per property (inputs[slot]['features.<property>']) and the shown
    // variant's values (inputs[slot]['feature.<property>']).
    const offered = Object.keys(own).filter((key) => key.startsWith('features.'));
    for (const key of offered) {
      const property = key.slice('features.'.length), values = list(own[key]);
      const input = selectBox('Feature ' + plain(property), [['', 'Set ' + plain(property)], ...values.map((value) => [value, plain(value)])], '', (value) => { if (value) control('avatar.part.feature', { id: slot, property, value }); });
      input.disabled = !here;
    }
    const features = Object.keys(own).filter((key) => key.startsWith('feature.')).map((key) => plain(key.slice('feature.'.length)) + ': ' + list(own[key]).map(plain).join(', '));
    scope((features.length ? 'Current features: ' + features.join(' · ') : 'Current look: ' + (here ? plain(current.variant) : 'none')));
    // Colour: the colours the projection offers for this part (inputs[slot].colours), else every observed colour; a
    // tinted part names the face colour it sets (inputs[slot].colourRole) and every part that colour affects (colourScope).
    const colours = list(own.colours).length ? list(own.colours) : options('colour'), colourNow = own.colour ?? '';
    const role = list(own.colourRole)[0];
    const colour = selectBox(role ? plain(role).replace(/^./, (c) => c.toUpperCase()) + ' colour' : 'Part colour', [['', 'Choose'], ...unique([...(colourNow ? [colourNow] : []), ...colours]).map((c) => [c, plain(c)])], colourNow, (c) => { if (c) control('avatar.part.change', { ids: [slot], colour: c }); });
    colour.disabled = !here || !colours.length;
    scope('Colour affects: ' + (list(own.colourScope).length ? list(own.colourScope) : [slot]).map(plain).join(', '));
    const size = selectBox('Size preset', [['', 'Choose a preset'], ...options('size').map((s) => [s, plain(s)])], '', (value) => { if (value) control('avatar.part.change', { ids: [slot], size: value }); });
    size.disabled = !here;
    // Any further choice the change command declares (a length step, ...): one list per declared enum parameter.
    for (const [name, param] of Object.entries(params('avatar.part.change'))) {
      if (['ids', 'variant', 'colour', 'size'].includes(name) || !list(param.enum).length) continue;
      const input = selectBox(plain(name).replace(/^./, (c) => c.toUpperCase()), [['', 'Choose'], ...list(param.enum).filter((v) => v !== null).map((v) => [v, plain(v)])], '', (value) => { if (value) control('avatar.part.change', { ids: [slot], [name]: value }); });
      input.disabled = !here;
    }
    if (list(own.resizeRelated).length) scope('Resizing also adjusts the attached parts: ' + list(own.resizeRelated).map(plain).join(', '));
    for (const place of options('place')) {
      const b = button(ARROWS[place] ?? plain(place), () => control('avatar.part.move', { ids: [slot], place }), { title: 'Move ' + plain(slot) + ' ' + plain(place), 'aria-label': 'Move ' + plain(slot) + ' ' + plain(place) });
      b.disabled = !here;
    }
    button('Delete selected part', () => control('avatar.parts.remove', { ids: [slot] })).disabled = !here;
    const wordlist = el('details', 'p2-avatar-wordlist'), wordTitle = el('summary', ''), wordBody = el('div', '');
    wordTitle.textContent = 'Words for ' + plain(slot); wordBody.textContent = unique([plain(slot), ...list(own.word).map(plain)]).join(' · ');
    wordlist.append(wordTitle, wordBody); toolsEl.append(wordlist);
    // Variant cards: Remove (on a slot the face may leave empty), then every variant the slot offers; the shown one
    // carries its picture from the stage.
    const removable = own.optional === true;   // the slot may be left empty (inputs[slot].optional)
    const choices = [...(here && removable ? ['\u0000remove'] : []), ...options(slot)];
    optsEl.replaceChildren(...choices.map((variant) => variant === '\u0000remove'
      ? card('Remove', () => control('avatar.parts.remove', { ids: [slot] }), '×', false)
      : card(plain(variant), () => here ? control('avatar.part.change', { ids: [slot], variant }) : control('avatar.part.add', { id: slot, variant }),
        here && current.variant === variant ? partPicture(slot) ?? plain(variant).slice(0, 1).toUpperCase() : plain(variant).slice(0, 1).toUpperCase(), here && current.variant === variant)));
    optsEl.hidden = false;
  }
  function showIdsFor() {
    const duration = Number(params('avatar.ids.show').duration?.default ?? 4000);
    idsUntil = Date.now() + duration; clearTimeout(identifyTimer); identifyTimer = setTimeout(scheduleGeometry, duration + 1); scheduleGeometry();
  }

  stage.addEventListener('click', (event) => {
    if (performance.now() < suppressSelectionClick || event.target.closest?.('[data-resize-handle]')) return;
    const id = event.target.closest?.('[data-select]')?.getAttribute('data-select');
    select(id ?? faceId()); stage.focus();
  });
  stage.addEventListener('keydown', (event) => {
    const sel = selected(); if (!sel || sel === faceId() || event.target.closest?.('[data-resize-handle]')) return;
    const place = KEYS[event.key];
    if (place && options('place').includes(place)) { event.preventDefault(); control('avatar.part.move', { ids: [sel], place }); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); control('avatar.parts.remove', { ids: [sel] }); }
  });

  function draw_() {
    if (destroyed) return;
    loadTools();
    // The id display follows the observed mode; a temporary display lasts the command's declared duration.
    const mode = inputs(faceId()).ids ?? state?.runtime?.view?.ids ?? null;
    if (mode !== idsMode) { idsMode = mode; if (mode === 'temporary') showIdsFor(); }
    const inspector = container.querySelector(':scope > .p2-avatar-inspector'); if (inspector) inspector.dataset.selectedNativeIds = JSON.stringify(selected() ? [selected()] : []);
    const face = faceObject();
    nameEl.textContent = face?.name ?? 'Avatar';
    if (!state?.svg) { partsEl.textContent = state?.pending || !state ? 'Drawing my face…' : describe(); if (visible && editor) rows(); return; }
    const small = state.svg.replace(/ width="[\d.]+" height="[\d.]+"/, '');
    for (const m of mirrors) if (small !== m.svg) { m.svg = small; m.el.innerHTML = small; }
    if (!visible) return;   // the big face and its rows are drawn while the view is shown
    const empty = !parts().length; stage.classList.toggle('is-empty', empty);
    partsEl.textContent = describe();
    noteEl.textContent = 'Parts and looks from the face knowledge catalog. Choose a part or click it in the preview. Arrow keys move it; Delete removes the selected part.';
    stage.setAttribute('aria-label', `${nameEl.textContent}, a drawn face with ${partsEl.textContent}`);
    paint(stageSvg(), !resizeGesture);
    rows();
    scheduleGeometry();
  }

  draw_();
  const setVisible = (on) => { visible = !!on; if (visible) { shown = ''; lastSvg = ''; } draw_(); };
  return {
    update(next) { state = next ?? state; draw_(); },
    /** Host events (reply, thinking, typing). The motion rules of the earlier face are not part of the area yet: nothing moves. */
    emit() {},
    setSpeaking() {},
    setVisible, show: () => setVisible(true), hide: () => setVisible(false),
    /** Keeps a small copy of the face in `target` (the icon in the input bar). */
    mirror(target, px = 36) { mirrors.push({ el: target, px, svg: '' }); draw_(); },
    frame: () => null,
    /** Effect avatar.animate { name }. */
    animate({ name } = {}) {
      if (!/^[a-z]+$/.test(String(name ?? ''))) return;
      clearTimeout(fxTimer);
      stage.className = stage.className.replace(/\bfx-\w+/g, '').trim();
      void stage.offsetWidth;
      stage.classList.add(`fx-${name}`);
      fxTimer = setTimeout(() => { stage.className = stage.className.replace(/\bfx-\w+/g, '').trim(); }, 2800);
    },
    destroy() {
      destroyed = true; closeInspectorSplitter(); geometryObserver.disconnect(); clearTimeout(fxTimer); clearTimeout(identifyTimer); cancelAnimationFrame(geometryFrame);
      window.removeEventListener('pointermove', resizeMove, true); window.removeEventListener('pointerup', resizeEnd, true); window.removeEventListener('pointercancel', resizeEnd, true); resizeGesture = null;
    },
  };
}
