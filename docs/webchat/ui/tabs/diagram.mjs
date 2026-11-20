// SPDX-License-Identifier: AGPL-3.0-only
// Diagram tab (world diagram.sketch). What it shows is the SOP area projection of the w.diagram instance
// (worlds/diagram.sketch/area.sop): the picture is the projection's SVG (layout and routed edges derived in
// render-projection.sop), the geometry is the observed objects and boxes, the properties are the observed inputs.
// Every change is a declared native command sent through host.tool (the same route as chat: undo, journal,
// verification). The tab adds only presentation: toolbar, inspector, selection halos and handles, pan and zoom
// (buttons, ctrl + wheel, pinch, + - 0 keys), drag previews, the empty-state hint and the SVG/PNG export.
// Multi-selection lives here (the area's view keeps one selected id); it is sent with the declared select commands.
import { mountInspectorSplitter } from '../pane-splitter.mjs';
import { makeInspector } from './diagram/inspector.mjs';
import { makePageBar, makeStylePanels, TOOLS_STYLE } from './diagram/tools.mjs';

const VIEW = 'diagram', WORLD = 'diagram.sketch';
const NS = 'http://www.w3.org/2000/svg';
const HINTS = ['draw a rectangle called Api', 'draw a red circle called Db', 'connect Api to Db', 'make Db huge', 'arrange them in a row', 'draw a flowchart with Start, Check and Done', 'how many connections are there?', 'undo'];
const ZMIN = 0.25, ZMAX = 8, ZSTEP = 1.25, FIT_MIN = { w: 560, h: 350 }, FIT_PAD = 24;

const STYLE = `
.dg-root [hidden]{display:none!important}
.dg-root { position:relative;container-type:inline-size;display:flex;flex-direction:column;width:100%;height:100%;min-height:480px;gap:6px;
 --dg-bg:#f7f8fa;--dg-ink:#1f2329;--dg-faint:#6a7480;--dg-accent:#356ac3;--dg-card:#fff;--dg-line:#d5dae0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .dg-root { --dg-bg:#111b21;--dg-ink:#e6ebef;--dg-faint:#98a4ae;--dg-accent:#5b8ad7;--dg-card:#1c2830;--dg-line:#33424d; } }
:root[data-theme="dark"] .dg-root { --dg-bg:#111b21;--dg-ink:#e6ebef;--dg-faint:#98a4ae;--dg-accent:#5b8ad7;--dg-card:#1c2830;--dg-line:#33424d; }
.dg-workspace { display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,300px);gap:8px;flex:1;min-height:350px; }
.dg-board { position:relative;border:1px solid var(--dg-line);border-radius:8px;background:var(--dg-bg);overflow:hidden;width:100%;min-height:350px;height:100%;touch-action:none; }
.dg-svg { position:absolute;inset:0;width:100%;height:100%;display:block;cursor:default;outline:none;user-select:none;-webkit-user-select:none; }
.dg-svg.panning { cursor:grabbing; }
.dg-svg:focus-visible { box-shadow:inset 0 0 0 2px var(--dg-accent); }
.dg-svg [data-select] { cursor:pointer; }
.dg-svg [data-select]:focus { outline:none; }
.dg-svg [data-select]:focus-visible { filter:drop-shadow(0 0 2px var(--dg-accent)); }
.dg-svg .dg-hit { fill:none;stroke:transparent;stroke-width:14;pointer-events:stroke; }
.dg-svg .selhalo { fill:none;stroke:var(--dg-accent);stroke-width:8;opacity:.35;stroke-linecap:round;stroke-linejoin:round;pointer-events:none; }
.dg-svg .halo { fill:none;stroke:var(--dg-accent);stroke-width:3;opacity:.55;pointer-events:none; }
.dg-svg .dg-resize { fill:var(--dg-accent);stroke:#fff;cursor:nwse-resize;pointer-events:all; }
.dg-svg .dg-connect { fill:#fff;stroke:var(--dg-accent);stroke-width:2;cursor:crosshair;pointer-events:all; }
.dg-svg .dg-wire { stroke:var(--dg-accent);stroke-width:2;stroke-dasharray:6 4;fill:none;pointer-events:none; }
.dg-marquee { fill:rgba(53,106,195,.08);stroke:#356ac3;stroke-width:1;pointer-events:none; }
.dg-tools { display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px; }
.dg-btn { all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:32px;padding:0 10px;box-sizing:border-box;border-radius:8px;background:var(--dg-card);color:var(--dg-ink);font:600 13px system-ui,sans-serif;box-shadow:inset 0 0 0 1px var(--dg-line); }
.dg-btn:hover,.dg-btn:focus-visible { box-shadow:inset 0 0 0 2px var(--dg-accent); }
.dg-btn[disabled] { opacity:.4;cursor:default; }
.dg-btn[aria-pressed="true"] { background:var(--dg-accent);color:#fff; }
.dg-zoom { display:inline-flex;align-items:center;gap:4px; }
.dg-pct { min-width:44px;text-align:center;font:600 12px system-ui,sans-serif;color:var(--dg-faint);cursor:pointer; }
.dg-spacer { flex:1 1 auto; }
.dg-caption { margin:0;min-height:20px;font-size:14px;opacity:.85; }
.dg-hint { position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:8%;pointer-events:none;color:var(--dg-faint);font-family:system-ui,sans-serif; }
.dg-hint b { display:block;font-size:clamp(18px,3vw,28px);color:var(--dg-ink);margin-bottom:6px; }
.dg-hint q { color:var(--dg-accent);font-weight:700; }
.dg-node-chooser { position:absolute;top:48px;left:8px;z-index:30;display:flex;flex-wrap:wrap;gap:6px;width:280px;max-width:calc(100% - 16px);max-height:60dvh;overflow:auto;padding:12px;box-sizing:border-box;background:var(--dg-card);border:1px solid var(--dg-line);border-radius:8px;box-shadow:0 8px 24px #0003; }
.dg-node-chooser input { max-width:100%;width:100%;box-sizing:border-box;padding:7px;border:1px solid var(--dg-line);border-radius:5px;background:var(--dg-bg);color:var(--dg-ink); }
.dg-inspector { min-width:0;overflow:auto;max-height:100%;padding:12px;box-sizing:border-box;background:var(--dg-card);border:1px solid var(--dg-line);border-radius:6px;color:var(--dg-ink); }
.dg-inspector .dg-chart-tools { border:0;padding:0;margin-bottom:16px; }
.dg-chart-form { display:grid;gap:8px;min-width:0;margin-bottom:12px; }
.dg-chart-form label { display:grid;gap:4px;font-size:12px;color:var(--dg-faint);min-width:0; }
.dg-chart-form input,.dg-chart-form select,.dg-chart-form textarea { box-sizing:border-box;width:100%;max-width:100%;min-width:0;border:1px solid var(--dg-line);border-radius:5px;padding:7px;background:var(--dg-bg);color:var(--dg-ink);font:13px system-ui; }
.dg-chart-form textarea { min-height:72px;resize:vertical; }
.dg-group-members { display:flex;flex-wrap:wrap;gap:6px; }
.dg-empty-selection { font-size:13px;line-height:1.6;color:var(--dg-faint); }
@media(max-width:700px){.dg-root{height:auto;min-height:0}.dg-workspace{display:flex;flex-direction:column;flex:none;min-height:0}.dg-board{height:340px;min-height:260px}.dg-inspector{overflow:visible}.dg-btn{min-height:44px;height:auto;padding:10px}.dg-root input,.dg-root select,.dg-root textarea{font-size:16px}}
@container (max-width:700px) { .dg-workspace { grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(350px,55vh) auto; } .dg-inspector { max-height:none;overflow:visible; } }
`;
function ensureCss() {
  if (document.getElementById('p2-diagram-css')) return;
  const style = document.createElement('style'); style.id = 'p2-diagram-css'; style.textContent = STYLE + TOOLS_STYLE; document.head.append(style);
}

/** The tab's model of a projection: nodes, links and groups by id with their observed geometry and inputs. */
function modelOf(state) {
  const node = new Map(), link = new Map(), group = new Map(), inputs = state?.inputs ?? {}, boxes = state?.boxes ?? {};
  for (const object of state?.objects ?? []) {
    const input = inputs[object.id] ?? {}, id = object.id, selected = object.selected === 'true' || object.selected === true;
    if (object.binding === 'diagram.node') node.set(id, { id, kind: object.kind, x: Number(object.x), y: Number(object.y), w: Number(object.width), h: Number(object.height), box: boxes[id] ?? null, label: input.label, colour: input.colour, size: input.size, value: input.value, group: input.group, outline: input.outline, textColour: input.textColour, fontSize: input.fontSize, fontWeight: input.fontWeight, effect: input.effect, opacity: input.opacity, corner: input.corner, rotation: input.rotation, role: input.role, selected });
    else if (object.binding === 'diagram.link') link.set(id, { id, from: object.from, to: object.to, label: input.label, colour: input.colour, style: input.style, arrow: input.arrow, width: input.width, route: input.route, way: input.way, selected });
    else if (object.binding === 'diagram.group') group.set(id, { id, label: object.label ?? input.label, layout: input.layout, scale: input.scale, members: [].concat(input.members ?? []), box: boxes[id] ?? null, xLabel: input.xLabel, yLabel: input.yLabel, valueLabels: input.valueLabels, gridlines: input.gridlines, legend: input.legend, yMax: input.yMax, inputs: input, selected });
  }
  return { node, link, group, inputs, options: state?.options ?? {}, view: state?.runtime?.view ?? {}, frame: state?.frame ?? { w: 1000, h: 700 }, pending: !!state?.pending };
}
const innerOf = (svg) => String(svg ?? '').replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

function make(holder, host) {
  ensureCss();
  holder.style.maxWidth = 'none'; holder.style.height = '100%';
  holder.classList.add('dg-root');
  const html = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, title, onclick, cls = '') => { const b = html('button', 'dg-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', onclick); return b; };
  const sv = (tag, attrs = {}, parent = null) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };

  let state = null, m = modelOf(null), destroyed = false, hintIndex = 0, visible = !holder.hidden, shownSvg = null;
  let sel = { nodes: [], links: [], group: null };
  let mode = 'select', multiSelect = false, connectionFrom = null, chooserPoint = null, suppressClick = false;
  const zv = { k: 1, dx: 0, dy: 0 };
  let vbBase = { x: 0, y: 0, w: 1000, h: 700 }, vbNow = vbBase;

  // ---- layout: toolbar, board (svg + hint), inspector, caption ----
  const board = html('div', 'dg-board'), hint = html('div', 'dg-hint');
  const svg = sv('svg', { class: 'dg-svg', role: 'img', tabindex: '0', preserveAspectRatio: 'xMidYMid meet' });
  const layer = sv('g', { class: 'dg-layer' }, svg), overlay = sv('g', { class: 'dg-overlay' }, svg);
  board.append(svg, hint);
  const pagebar = html('div', 'dg-pagebar'); pagebar.setAttribute('aria-label', 'Page layout and style');
  const tools = html('div', 'dg-tools'), caption = html('p', 'dg-caption'); caption.setAttribute('aria-live', 'polite');

  const toolCall = async (operation, args = {}) => {
    try {
      if (typeof host?.tool !== 'function') throw Error('The editing tools are not available.');
      const reply = await host.tool(operation, args, { view: VIEW });
      const text = reply?.message ?? reply?.text; if (text) caption.textContent = text;
      return reply;
    } catch (error) { caption.textContent = String(error?.message ?? error); return null; }
  };

  const setMode = (next) => {
    mode = next; addMode.setAttribute('aria-pressed', String(mode === 'add')); connectMode.setAttribute('aria-pressed', String(mode === 'connect'));
    if (mode !== 'connect') connectionFrom = null;
    svg.style.cursor = mode === 'add' ? 'crosshair' : '';
  };
  // Add node: a chooser of the shapes diagram.node.make declares, an optional label, then a tap on the canvas.
  let newKind = null;
  const nodeChooser = html('div', 'dg-node-chooser'); nodeChooser.hidden = true; nodeChooser.setAttribute('role', 'dialog'); nodeChooser.setAttribute('aria-label', 'Choose a node shape');
  const nodeText = html('input'); nodeText.placeholder = 'Optional label or text'; nodeText.setAttribute('aria-label', 'New node text');
  const shapeButtons = html('div', 'dg-tools');
  nodeChooser.append(nodeText, shapeButtons, btn('Cancel', 'Cancel adding a node', () => { nodeChooser.hidden = true; setMode('select'); }));
  const makeNode = (kind, point) => toolCall('diagram.node.make', { kind, x: Math.round(point.x), y: Math.round(point.y), ...(nodeText.value.trim() ? { label: nodeText.value.trim() } : {}) });
  function chooserShapes(kinds) {
    shapeButtons.replaceChildren();
    for (const kind of kinds) shapeButtons.append(btn(kind, 'Place ' + kind, () => {
      newKind = kind; nodeChooser.hidden = true;
      if (chooserPoint) { const point = chooserPoint; chooserPoint = null; setMode('select'); makeNode(kind, point); return; }
      setMode('add'); caption.textContent = 'Tap or click the canvas to place ' + kind + '.';
    }));
  }
  const addMode = btn('Add node', 'Choose a node to place', () => { chooserPoint = null; nodeChooser.hidden = !nodeChooser.hidden; });
  const multiButton = btn('Select multiple', 'Select multiple objects by tapping', () => { multiSelect = !multiSelect; multiButton.setAttribute('aria-pressed', String(multiSelect)); });
  multiButton.setAttribute('aria-pressed', 'false');
  const connectMode = btn('Connect', 'Tap two nodes to connect', () => { setMode(mode === 'connect' ? 'select' : 'connect'); caption.textContent = mode === 'connect' ? 'Tap the source node, then the destination node.' : ''; });
  const zoomOut = btn('−', 'Zoom out', () => zoomBy(1 / ZSTEP)), zoomIn = btn('+', 'Zoom in', () => zoomBy(ZSTEP)), pct = html('span', 'dg-pct', '100%');
  pct.title = 'Fit the diagram'; pct.addEventListener('click', () => zoomFit());
  const zoomBox = html('span', 'dg-zoom'); zoomBox.append(zoomOut, pct, zoomIn);
  const idsShown = () => !!m.view.ids && m.view.ids !== 'off';
  const idsBtn = btn('Object ID', 'Show or hide object IDs', () => toolCall('diagram.ids.show', { mode: idsShown() ? 'off' : 'always' }));
  tools.append(addMode, nodeChooser, multiButton, connectMode,
    btn('Clear diagram', 'Clear diagram', () => toolCall('diagram.page.clear', {})),
    btn('Chart', 'Create a chart', () => inspectorUi.openChart()),
    zoomBox, idsBtn, html('span', 'dg-spacer'),
    btn('Undo', 'Undo the last change', () => toolCall('diagram.undo', {})),
    btn('Redo', 'Do the last undone change again', () => toolCall('diagram.redo', {})),
    btn('Save SVG', 'Save the diagram as an SVG file', () => api.download({ format: 'svg' })),
    btn('Save PNG', 'Save the diagram as a PNG file', () => api.download({ format: 'png' })));
  setMode('select');

  const workspace = html('div', 'dg-workspace'), inspector = html('aside', 'dg-inspector'); inspector.setAttribute('aria-label', 'Inspector');
  workspace.append(board, inspector);
  holder.replaceChildren(tools, pagebar, workspace, caption);
  const closeInspectorSplitter = mountInspectorSplitter(workspace, inspector, { id: 'diagram', width: 300, persist: host?.persistent !== false });

  // ---- selection: kept here, sent with the declared select commands ----
  const select = (next) => {
    sel = { nodes: [...new Set(next.nodes ?? [])], links: [...new Set(next.links ?? [])], group: next.group ?? null };
    paintOverlay(); inspectorUi.sync();
    if (sel.group) return toolCall('diagram.group.select', { id: sel.group });
    if (sel.nodes.length) return toolCall('diagram.node.select', { ids: sel.nodes, ...(sel.links.length ? { edges: sel.links } : {}) });
    if (sel.links.length) return toolCall('diagram.link.select', { ids: sel.links });
    return toolCall('diagram.node.select', { ids: [] });
  };
  const baseInspector = makeInspector(inspector, { tool: toolCall, model: () => m, selection: () => sel, select, html, btn, focusBoard: () => svg.focus() });
  const panels = html('div'); inspector.append(panels);
  const stylePanels = makeStylePanels(panels, { tool: toolCall, model: () => m, selection: () => sel, html, btn });
  const pageBar = makePageBar(pagebar, { tool: toolCall, model: () => m, html, btn });
  const inspectorUi = { ...baseInspector, sync() { baseInspector.sync(); stylePanels.sync(); pageBar.sync(() => [...sel.nodes]); }, declare(ops) { baseInspector.declare(ops); stylePanels.declare(ops); pageBar.declare(ops); } };
  // The projection is the authority: what it observes as selected (the area keeps a key per selected node and
  // connection) is the selection, also when it changes elsewhere (chat, undo). The order of picking is kept.
  function reconcile() {
    const picked = (map) => [...map.values()].filter((item) => item.selected).map((item) => item.id);
    const keep = (mine, theirs) => (mine.length === theirs.length && mine.every((id) => theirs.includes(id)) ? mine : theirs.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    const group = picked(m.group)[0] ?? null;
    sel = group ? { nodes: [], links: [], group } : { nodes: keep(sel.nodes, picked(m.node)), links: keep(sel.links, picked(m.link)), group: null };
  }
  const extendSelection = (event) => multiSelect || event.shiftKey || event.ctrlKey || event.metaKey;
  const toggle = (list, id) => (list.includes(id) ? list.filter((value) => value !== id) : [...list, id]);
  const idAt = (target) => target?.closest?.('[data-select]')?.getAttribute('data-select') ?? null;
  function selectTarget(event) {
    const id = idAt(event.target), extend = extendSelection(event);
    if (id && m.group.has(id)) return select({ group: id });
    if (id && m.node.has(id)) return select(extend ? { nodes: toggle(sel.nodes, id), links: sel.links } : { nodes: [id] });
    if (id && m.link.has(id)) return select(extend ? { nodes: sel.nodes, links: toggle(sel.links, id) } : { links: [id] });
    if (extend) return null;
    return sel.nodes.length || sel.links.length || sel.group ? select({}) : null;
  }

  // ---- drawing: the projection's SVG, halos and handles over it ----
  function showHint() {
    const empty = !m.pending && !m.node.size;
    hint.hidden = !empty;
    if (empty) { hint.replaceChildren(html('b', '', 'What shall we draw?'), html('span', '', 'Say or type: ')); hint.lastChild.append(html('q', '', HINTS[hintIndex % HINTS.length])); }
  }
  const hintTimer = setInterval(() => { hintIndex++; if (!hint.hidden) showHint(); }, 4200);
  function describe() {
    if (m.pending) return 'Loading the diagram…';
    const n = m.node.size, e = m.link.size, g = m.group.size;
    return n ? `${n} shape${n === 1 ? '' : 's'}, ${e} connection${e === 1 ? '' : 's'}${g ? `, ${g} group${g === 1 ? '' : 's'}` : ''}` : 'An empty canvas. Say what to draw!';
  }
  const elementsOf = (id) => [...layer.querySelectorAll(`[data-select="${CSS.escape(id)}"]`)];
  function paintLayer() {
    const text = state?.svg ?? '';
    if (text === shownSvg) return false;
    shownSvg = text; layer.innerHTML = innerOf(text);
    // Thin connection lines get a wider invisible stroke to hit; each object's first element is focusable.
    const seen = new Set();
    for (const element of layer.querySelectorAll('[data-select]')) {
      const id = element.getAttribute('data-select');
      if (m.link.has(id)) for (const line of element.querySelectorAll('polyline')) { const hit = line.cloneNode(); hit.setAttribute('class', 'dg-hit'); hit.removeAttribute('stroke-dasharray'); element.append(hit); }
      if (seen.has(id)) continue;
      seen.add(id);
      const item = m.node.get(id) ?? m.group.get(id) ?? m.link.get(id);
      element.setAttribute('tabindex', '0'); element.setAttribute('role', 'button');
      if (m.node.has(id)) { element.classList.add('shp'); element.setAttribute('data-name', id); }
      element.setAttribute('aria-label', m.link.has(id) ? 'Connection ' + id + (item.label ? ' · ' + item.label : '') : (item?.label ? item.label + ' · ' : '') + id);
    }
    return true;
  }
  const unitsPerPixel = () => { const matrix = svg.getScreenCTM?.(); return matrix?.a ? 1 / matrix.a : 1; };
  function paintOverlay() {
    overlay.replaceChildren();
    for (const element of layer.querySelectorAll('[data-select]')) element.removeAttribute('data-selected');
    const upp = unitsPerPixel(), chosen = [...sel.nodes, ...sel.links, ...(sel.group ? [sel.group] : [])];
    for (const id of chosen) for (const element of elementsOf(id)) element.setAttribute('data-selected', 'true');
    for (const id of sel.links) for (const line of layer.querySelectorAll(`[data-select="${CSS.escape(id)}"] polyline:not(.dg-hit)`)) sv('polyline', { class: 'selhalo', points: line.getAttribute('points') }, overlay);
    const halo = (box, pad) => sv('rect', { class: 'halo', x: box.x0 - pad, y: box.y0 - pad, width: box.x1 - box.x0 + 2 * pad, height: box.y1 - box.y0 + 2 * pad, rx: 10 }, overlay);
    if (sel.group && m.group.get(sel.group)?.box) halo(m.group.get(sel.group).box, 4);
    for (const id of sel.nodes) { const node = m.node.get(id); if (node?.box) halo(node.box, 7); }
    // Handles of the selected nodes: resize (bottom right) and connect (right middle), sized in screen pixels.
    if (sel.group) return;
    const side = 14 * upp, radius = 8 * upp;
    for (const id of sel.nodes) {
      const node = m.node.get(id); if (!node?.box) continue;
      sv('rect', { class: 'dg-resize', 'data-resize-node': id, x: node.box.x1 - side / 2, y: node.box.y1 - side / 2, width: side, height: side, 'aria-label': 'Resize ' + id }, overlay);
      sv('circle', { class: 'dg-connect', 'data-connect-node': id, cx: node.box.x1 + radius * 1.5, cy: node.y, r: radius, 'aria-label': 'Connect ' + id }, overlay);
    }
  }
  function fitBase() {
    let box = null;
    try {
      // The objects' extent (a themed page's background rectangle is not an object).
      for (const element of layer.querySelectorAll('[data-select]')) { const b = element.getBBox(); if (!(b.width > 0 || b.height > 0)) continue;
        box = box ? { x1: Math.min(box.x1, b.x), y1: Math.min(box.y1, b.y), x2: Math.max(box.x2, b.x + b.width), y2: Math.max(box.y2, b.y + b.height) } : { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height }; }
      if (!box) { const b = layer.getBBox(); if (b.width > 0 && b.height > 0) box = { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height }; }
    } catch { /* not rendered */ }
    if (!box) return { x: 0, y: 0, w: m.frame.w, h: m.frame.h };
    let { x1, y1, x2, y2 } = box; x1 -= FIT_PAD; y1 -= FIT_PAD; x2 += FIT_PAD; y2 += FIT_PAD;
    if (x2 - x1 < FIT_MIN.w) { const c = (x1 + x2) / 2; x1 = c - FIT_MIN.w / 2; x2 = c + FIT_MIN.w / 2; }
    if (y2 - y1 < FIT_MIN.h) { const c = (y1 + y2) / 2; y1 = c - FIT_MIN.h / 2; y2 = c + FIT_MIN.h / 2; }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function redraw({ refit = false } = {}) {
    if (destroyed) return;
    showHint();
    svg.setAttribute('aria-label', 'Diagram: ' + describe());
    const changed = paintLayer();
    if ((changed || refit) && visible) {
      const empty = !m.node.size;
      vbBase = fitBase(); if (empty) { zv.k = 1; zv.dx = 0; zv.dy = 0; }
    }
    applyZoom(); paintOverlay();
    idsBtn.setAttribute('aria-pressed', String(idsShown()));
  }

  // ---- view: pan, zoom, fit ----
  function applyZoom() {
    const b = vbBase, w = b.w / zv.k, h = b.h / zv.k, cx = b.x + b.w / 2 + zv.dx, cy = b.y + b.h / 2 + zv.dy;
    vbNow = { x: cx - w / 2, y: cy - h / 2, w, h };
    svg.setAttribute('viewBox', `${+vbNow.x.toFixed(2)} ${+vbNow.y.toFixed(2)} ${+vbNow.w.toFixed(2)} ${+vbNow.h.toFixed(2)}`);
    pct.textContent = `${Math.round(zv.k * 100)}%`;
    zoomIn.disabled = zv.k >= ZMAX - 1e-9; zoomOut.disabled = zv.k <= ZMIN + 1e-9;
  }
  function zoomFit() { zv.k = 1; zv.dx = 0; zv.dy = 0; vbBase = fitBase(); applyZoom(); paintOverlay(); }
  function zoomBy(f, p) {
    const k2 = Math.min(ZMAX, Math.max(ZMIN, zv.k * f)), r = k2 / zv.k;
    if (r === 1) return;
    const c = { x: vbNow.x + vbNow.w / 2, y: vbNow.y + vbNow.h / 2 };
    p = p || c;
    const nc = { x: p.x - (p.x - c.x) / r, y: p.y - (p.y - c.y) / r };
    zv.k = Math.abs(k2 - 1) < 1e-9 ? 1 : k2; zv.dx = nc.x - (vbBase.x + vbBase.w / 2); zv.dy = nc.y - (vbBase.y + vbBase.h / 2);
    applyZoom(); paintOverlay();
  }
  const svgPt = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; const matrix = svg.getScreenCTM(); return matrix ? p.matrixTransform(matrix.inverse()) : { x: ev.clientX, y: ev.clientY }; };
  const nodeAt = (ev) => { const id = idAt(document.elementFromPoint(ev.clientX, ev.clientY)); return m.node.has(id) ? id : null; };

  // ---- gestures: tap to select, drag to move, handles to resize and connect, a rectangle to select several ----
  const ptrs = new Map(); let pan = null, pinch = null;
  const cancelDrag = () => { pan?.preview?.remove(); pan?.marquee?.remove(); pan?.wire?.remove(); if (pan?.moved) { shownSvg = null; redraw(); } pan = null; svg.classList.remove('panning'); };
  svg.addEventListener('pointerdown', (event) => {
    ptrs.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (ptrs.size === 1) suppressClick = false;   // a new gesture: the click a drag or pinch left behind is gone
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: zv.k }; cancelDrag(); suppressClick = true; return; }
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (mode !== 'select') return;
    const resize = event.target.closest?.('[data-resize-node]'), wire = event.target.closest?.('[data-connect-node]'), id = idAt(event.target);
    let object = null;
    if (resize) { const node = m.node.get(resize.getAttribute('data-resize-node')); if (node) object = { kind: 'resize', id: node.id, x: node.x, y: node.y, width: node.w, height: node.h, square: node.w === node.h }; }
    else if (wire) { const node = m.node.get(wire.getAttribute('data-connect-node')); if (node) object = { kind: 'connect', id: node.id, x: node.x, y: node.y }; }
    else if (id && (m.group.has(id) || m.node.get(id)?.group)) {
      // A group moves as one, also when it is taken by one of its members (the rules place a member with its group).
      const group = m.group.get(m.group.has(id) ? id : m.node.get(id).group);
      if (group?.box) object = { kind: 'group', id: group.id, x: (group.box.x0 + group.box.x1) / 2, y: (group.box.y0 + group.box.y1) / 2, move: [group.id, ...group.members] };
    } else if (id && m.node.has(id)) {
      const ids = sel.nodes.includes(id) ? sel.nodes.filter((n) => m.node.has(n) && !m.node.get(n).group) : [id], nodes = ids.map((n) => m.node.get(n));
      object = { kind: 'node', id, ids, x: nodes.reduce((s, n) => s + n.x / nodes.length, 0), y: nodes.reduce((s, n) => s + n.y / nodes.length, 0), move: ids };
    }
    if (id && m.link.has(id) && !object) return;   // a connection is selected by the click
    pan = { id: event.pointerId, x0: event.clientX, y0: event.clientY, upp: unitsPerPixel(), moved: false, start: svgPt(event), extend: extendSelection(event), object };
  });
  svg.addEventListener('pointermove', (event) => {
    if (!ptrs.has(event.pointerId)) return;
    ptrs.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], distance = Math.hypot(a.x - b.x, a.y - b.y); zoomBy(pinch.k0 * distance / pinch.d0 / zv.k, svgPt({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })); return; }
    if (pan?.id !== event.pointerId) return;
    const dx = (event.clientX - pan.x0) * pan.upp, dy = (event.clientY - pan.y0) * pan.upp;
    if (!pan.moved && Math.hypot(event.clientX - pan.x0, event.clientY - pan.y0) < (event.pointerType === 'touch' ? 8 : 4)) return;
    if (!pan.moved) { pan.moved = true; try { svg.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ } svg.classList.add('panning'); }
    const object = pan.object;
    if (object?.kind === 'resize') {
      let width = Math.max(8, object.width + 2 * dx), height = Math.max(8, object.height + 2 * dy);
      if (object.square || event.shiftKey) { const k = Math.max(width / object.width, height / object.height); width = object.width * k; height = object.height * k; }
      object.next = { width: Math.round(width), height: Math.round(height) };
      pan.preview ??= sv('rect', { class: 'dg-marquee' }, svg);
      for (const [key, value] of Object.entries({ x: object.x - width / 2, y: object.y - height / 2, width, height })) pan.preview.setAttribute(key, value);
      return;
    }
    if (object?.kind === 'connect') {
      const point = svgPt(event); pan.wire ??= sv('line', { class: 'dg-wire', x1: object.x, y1: object.y }, svg);
      pan.wire.setAttribute('x2', point.x); pan.wire.setAttribute('y2', point.y); return;
    }
    if (object) {
      for (const id of object.move) for (const element of elementsOf(id)) { element.dataset.base ??= element.getAttribute('transform') ?? ''; element.setAttribute('transform', `translate(${dx} ${dy}) ${element.dataset.base}`); }
      overlay.setAttribute('transform', `translate(${dx} ${dy})`);
      return;
    }
    const point = svgPt(event); pan.marquee ??= sv('rect', { class: 'dg-marquee' }, svg);
    for (const [key, value] of Object.entries({ x: Math.min(point.x, pan.start.x), y: Math.min(point.y, pan.start.y), width: Math.abs(point.x - pan.start.x), height: Math.abs(point.y - pan.start.y) })) pan.marquee.setAttribute(key, value);
  });
  const endPan = (event) => {
    ptrs.delete(event.pointerId);
    if (ptrs.size < 2 && pinch) pinch = null;
    if (pan?.id !== event.pointerId) return;
    const drag = pan; pan = null; svg.classList.remove('panning'); overlay.removeAttribute('transform');
    drag.preview?.remove(); drag.wire?.remove(); drag.marquee?.remove();
    if (!drag.moved) return;
    suppressClick = true;   // the click that ends a drag selects nothing
    if (event.type === 'pointercancel') { shownSvg = null; redraw(); return; }
    const object = drag.object;
    if (!object) {
      const point = svgPt(event), x0 = Math.min(point.x, drag.start.x), x1 = Math.max(point.x, drag.start.x), y0 = Math.min(point.y, drag.start.y), y1 = Math.max(point.y, drag.start.y);
      const inside = [...m.node.values()].filter((n) => n.box && n.box.x0 >= x0 && n.box.x1 <= x1 && n.box.y0 >= y0 && n.box.y1 <= y1).map((n) => n.id);
      const links = [...m.link.values()].filter((l) => inside.includes(l.from) && inside.includes(l.to)).map((l) => l.id);
      select({ nodes: [...(drag.extend ? sel.nodes : []), ...inside], links: [...(drag.extend ? sel.links : []), ...links] });
      return;
    }
    if (object.kind === 'resize') { if (object.next) toolCall('diagram.node.resize', { ids: [object.id], ...object.next }); return; }
    if (object.kind === 'connect') { const to = nodeAt(event); if (to && to !== object.id) toolCall('diagram.link.make', { from: object.id, to }); return; }
    const x = Math.round(object.x + (event.clientX - drag.x0) * drag.upp), y = Math.round(object.y + (event.clientY - drag.y0) * drag.upp);
    shownSvg = null;   // the previews go; the new state redraws
    if (object.kind === 'group') toolCall('diagram.group.place', { id: object.id, x, y }).then(() => redraw());
    else toolCall('diagram.node.place', { ids: object.ids, x, y }).then(() => redraw());
  };
  svg.addEventListener('pointerup', endPan); svg.addEventListener('pointercancel', endPan);
  svg.addEventListener('click', (event) => {
    if (suppressClick) { suppressClick = false; return; }
    if (mode === 'add') { const point = svgPt(event); setMode('select'); if (newKind) makeNode(newKind, point); return; }
    if (mode === 'connect') {
      const id = idAt(event.target); if (!m.node.has(id)) return;
      if (!connectionFrom) { connectionFrom = id; select({ nodes: [id] }); caption.textContent = 'Now tap the destination node.'; }
      else if (id !== connectionFrom) { const from = connectionFrom; setMode('select'); toolCall('diagram.link.make', { from, to: id }); }
      return;
    }
    selectTarget(event);
  });
  svg.addEventListener('dblclick', (event) => {
    const id = idAt(event.target);
    if (!id) { chooserPoint = svgPt(event); nodeChooser.hidden = false; nodeText.focus(); return; }
    if (m.node.has(id)) { if (!(sel.nodes.length === 1 && sel.nodes[0] === id)) select({ nodes: [id] }); inspectorUi.focusLabel(); }
  });
  svg.addEventListener('wheel', (ev) => { if (!ev.ctrlKey && !ev.metaKey) return; ev.preventDefault(); zoomBy(Math.exp(-ev.deltaY * 0.0025), svgPt(ev)); }, { passive: false });
  svg.addEventListener('keydown', (ev) => {
    if (['Enter', ' '].includes(ev.key) && idAt(ev.target)) { ev.preventDefault(); selectTarget(ev); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); nodeChooser.hidden = true; setMode('select'); if (sel.nodes.length || sel.links.length || sel.group) select({}); return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); inspectorUi.removeSelection(); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key];
    if (d) {
      ev.preventDefault();
      const amount = ev.shiftKey ? 1 : 10, group = m.group.get(sel.group), nodes = sel.nodes.map((id) => m.node.get(id)).filter((n) => n && !n.group);
      if (group?.box) toolCall('diagram.group.place', { id: group.id, x: Math.round((group.box.x0 + group.box.x1) / 2 + d[0] * amount), y: Math.round((group.box.y0 + group.box.y1) / 2 + d[1] * amount) });
      else if (nodes.length) toolCall('diagram.node.place', { ids: nodes.map((n) => n.id), x: Math.round(nodes.reduce((s, n) => s + n.x / nodes.length, 0) + d[0] * amount), y: Math.round(nodes.reduce((s, n) => s + n.y / nodes.length, 0) + d[1] * amount) });
      else { zv.dx += d[0] * 0.1 * vbNow.w; zv.dy += d[1] * 0.1 * vbNow.h; applyZoom(); paintOverlay(); }
    } else if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); zoomBy(ZSTEP); }
    else if (ev.key === '-' || ev.key === '_') { ev.preventDefault(); zoomBy(1 / ZSTEP); }
    else if (ev.key === '0') { ev.preventDefault(); zoomFit(); }
  });

  // The declared interface: the shapes to add and every inspector choice.
  (async () => {
    const declared = typeof host?.tools === 'function' ? await host.tools({ view: VIEW }) : null;
    if (destroyed) return;
    const ops = Array.isArray(declared) ? declared : declared?.operations ?? [];
    chooserShapes(ops.find((op) => op.id === 'diagram.node.make')?.params?.kind?.enum ?? []);
    inspectorUi.declare(ops);
  })().catch((error) => { caption.textContent = 'The editing tools could not be read: ' + (error?.message ?? error); });

  // ---- export: the projection's picture, cropped to the drawing, on white ----
  function standalone() {
    const base = fitBase(), [x, y, w, h] = [base.x, base.y, base.w, base.h].map((v) => +v.toFixed(2));
    return { text: `<svg xmlns="${NS}" viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>${innerOf(state?.svg)}</svg>`, w, h };
  }
  const save = (blob, name) => {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.hidden = true; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const api = {
    update(next) {
      state = next && typeof next === 'object' ? next : null; m = modelOf(state);
      reconcile();
      caption.textContent = describe();
      redraw(); inspectorUi.sync();
    },
    show() { visible = true; redraw({ refit: true }); },
    hide() { visible = false; ptrs.clear(); pan = null; pinch = null; },
    setVisible(on) { if (on) api.show(); else api.hide(); },
    /** Download the diagram as SVG or PNG; returns { ok, detail }. */
    async download({ format = 'svg', filename = 'my-diagram' } = {}) {
      if (!m.node.size || !state?.svg) return { ok: false, detail: 'the diagram is empty' };
      const name = String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'my-diagram';
      const { text, w, h } = standalone();
      if (format !== 'png') { save(new Blob([text], { type: 'image/svg+xml' }), `${name}.svg`); return { ok: true, detail: `${name}.svg` }; }
      const img = new Image(), url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      try {
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('the diagram could not be rendered')); img.src = url; });
        const canvas = document.createElement('canvas'), scale = Math.min(3, 2400 / Math.max(w, h));
        canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
        const g = canvas.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        save(blob, `${name}.png`);
        return { ok: true, detail: `${name}.png` };
      } catch (error) { return { ok: false, detail: String(error?.message ?? error) }; } finally { URL.revokeObjectURL(url); }
    },
    destroy() { destroyed = true; clearInterval(hintTimer); closeInspectorSplitter(); inspectorUi.destroy(); holder.replaceChildren(); holder.classList.remove('dg-root'); },
  };
  api.update(host?.state?.(WORLD));
  return api;
}

export default {
  id: 'diagram',
  label: 'Diagram',
  world: WORLD,
  order: 85,
  make,
  effects: {
    'diagram.download': async (args, { ui }) => (ui?.download ? ui.download(args ?? {}) : { ok: false, detail: 'the Diagram tab is not open' }),
  },
};
