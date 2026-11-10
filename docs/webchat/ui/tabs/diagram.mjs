// SPDX-License-Identifier: AGPL-3.0-only
// Diagram tab (world diagram.sketch): the diagram as SVG. The world holds the state (the engine's DiagramWorld: shapes, edges, groups, rules);
// this module only draws it. The drawing code (shapes, arrows with their routes, labels, groups, zones and backgrounds, the palette) is a port of
// the renderer of diagram-vss-demo (https://github.com/ml-circuits-research/diagram-vss-demo, commit 9900d34, docs/js/ui.js, AGPL-3.0; see
// imports/diagram-vss-demo/PROVENANCE.md); the geometry helpers (dims, group boxes, arrow routes, palette) come from the engine module of the world.
// The engine (470 KB) is loaded lazily: when this tab is first shown, or when the first state with shapes arrives (PERF).
// Pan (drag), zoom (buttons, ctrl + wheel, pinch, + - 0 keys), fit, SVG and PNG export (effect diagram.download).
const ENGINE_ASSET = 'worlds/diagram.sketch/engine/logic.mjs';
const ARROWS_ASSET = 'worlds/diagram.sketch/arrows.mjs';   // arrow geometry (DIAG3): sides, entry angles, spread, detours
const NS = 'http://www.w3.org/2000/svg';
const HINTS = ['draw a rectangle called Api', 'draw a red circle called Db', 'connect Api to Db', 'make Db huge', 'arrange them in a row', 'draw a flowchart with Start, Check and Done', 'how many connections are there?', 'undo'];
const EMPTY = { shapes: [], edges: [], groups: [], frame: { x: 0, y: 0 } };
const ZMIN = 0.25, ZMAX = 8, ZSTEP = 1.25, FIT_MIN = { w: 560, h: 350 }, FIT_PAD = 24;

const CSS = `
.dg-root { display: flex; flex-direction: column; gap: 8px; width: 100%; --dg-bg: #f7f8fa; --dg-ink: #1f2329; --dg-faint: #6a7480; --dg-accent: #356ac3; --dg-card: #fff; --dg-line: #d5dae0; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .dg-root { --dg-bg: #111b21; --dg-ink: #e6ebef; --dg-faint: #98a4ae; --dg-accent: #5b8ad7; --dg-card: #1c2830; --dg-line: #33424d; } }
:root[data-theme="dark"] .dg-root { --dg-bg: #111b21; --dg-ink: #e6ebef; --dg-faint: #98a4ae; --dg-accent: #5b8ad7; --dg-card: #1c2830; --dg-line: #33424d; }
.dg-board { position: relative; border: 1px solid var(--dg-line); border-radius: 14px; background: var(--dg-bg); overflow: hidden; width: 100%; aspect-ratio: 800 / 500; max-height: calc(100vh - 300px); min-height: 260px; touch-action: none; }
.dg-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; outline: none; user-select: none; }
.dg-svg.panning { cursor: grabbing; }
.dg-svg:focus-visible { box-shadow: inset 0 0 0 2px var(--dg-accent); }
.dg-svg .body { stroke-width: 2; }
.dg-svg .body.outlined { stroke-width: 3; }
.dg-svg .tag { font: 600 11px system-ui, sans-serif; fill: var(--dg-faint); pointer-events: none; }
.dg-svg .lbl, .dg-svg .ftext { font-family: system-ui, sans-serif; font-weight: 600; pointer-events: none; }
.dg-svg .ln { stroke: var(--pc-arrow); stroke-width: 2; fill: none; }
.dg-svg .hd { fill: var(--pc-arrow); }
.dg-svg .elbl { font: 600 12px system-ui, sans-serif; fill: var(--dg-ink); paint-order: stroke; stroke: var(--dg-bg); stroke-width: 4px; stroke-linejoin: round; }
.dg-svg .idtag { font: 600 9px ui-monospace, monospace; fill: var(--dg-faint); opacity: .75; pointer-events: none; }
.dg-svg .etag { font: 600 9px ui-monospace, monospace; fill: var(--dg-faint); opacity: .85; paint-order: stroke; stroke: var(--dg-bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
.dg-svg .selhalo { fill: none; stroke: var(--dg-accent); stroke-width: 8; opacity: .35; stroke-linecap: round; }
.dg-svg .frame { fill: none; stroke: var(--dg-line); stroke-width: 1.5; stroke-dasharray: 3 5; }
.dg-svg .ftitle { font: 600 13px system-ui, sans-serif; fill: var(--dg-faint); }
.dg-svg .halo { fill: none; stroke: var(--dg-accent); stroke-width: 3; opacity: .55; }
.dg-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.dg-btn { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 32px; padding: 0 10px; box-sizing: border-box; border-radius: 8px; background: var(--dg-card); color: var(--dg-ink); font: 600 13px system-ui, sans-serif; box-shadow: inset 0 0 0 1px var(--dg-line); }
.dg-btn:hover, .dg-btn:focus-visible { box-shadow: inset 0 0 0 2px var(--dg-accent); }
.dg-btn[disabled] { opacity: .4; cursor: default; }
.dg-btn.hint { box-shadow: inset 0 0 0 2px #e8a317; }
.dg-zoom { display: inline-flex; align-items: center; gap: 4px; }
.dg-pct { min-width: 44px; text-align: center; font: 600 12px system-ui, sans-serif; color: var(--dg-faint); }
.dg-spacer { flex: 1 1 auto; }
.dg-caption { margin: 0; min-height: 20px; font-size: 14px; opacity: .85; }
.dg-hint { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; padding: 8%; pointer-events: none; color: var(--dg-faint); font-family: system-ui, sans-serif; }
.dg-hint[hidden] { display: none; }
.dg-hint b { display: block; font-size: clamp(18px, 3vw, 28px); color: var(--dg-ink); margin-bottom: 6px; }
.dg-hint q { color: var(--dg-accent); font-weight: 700; }
`;
function ensureCss(K) {
  if (!document.getElementById('p2-diagram-css')) {
    const st = document.createElement('style');
    st.id = 'p2-diagram-css';
    st.textContent = CSS;
    document.head.append(st);
  }
  if (K && !document.getElementById('p2-diagram-palette')) {
    const st = document.createElement('style');
    st.id = 'p2-diagram-palette';
    st.textContent = paletteCss(K);
    document.head.append(st);
  }
}
/** The palette of the engine as CSS variables --pc-<name>-<fill|edge|ink|line|wash> and --pc-arrow (dark values under the dark theme). */
function paletteCss(K, scope = ':root') {
  const val = (p, r, dark) => (dark && p.dark && p.dark[r]) || p[r];
  const wash = (p, dark) => (dark ? val(p, 'line', true) : p.ink !== '#FFFFFF' ? p.ink : p.edge);
  const vars = (dark) => `${Object.entries(K.PALETTE).map(([n, p]) => `${['fill', 'edge', 'ink', 'line'].map((r) => `--pc-${n}-${r}: ${val(p, r, dark)};`).join(' ')} --pc-${n}-wash: ${wash(p, dark)};`).join('\n  ')}\n  --pc-arrow: ${dark ? K.PALETTE_ARROW.dark : K.PALETTE_ARROW.light};`;
  return `${scope} {\n  ${vars(false)}\n}\n@media (prefers-color-scheme: dark) {\n${scope}:not([data-theme="light"]) {\n  ${vars(true)}\n}\n}\n${scope}[data-theme="dark"] {\n  ${vars(true)}\n}\n`;
}

function make(holder, host) {
  holder.style.maxWidth = '1000px';
  holder.classList.add('dg-root');
  const html = (tag, cls, inner) => { const e = document.createElement(tag); if (cls) e.className = cls; if (inner != null) e.innerHTML = inner; return e; };
  const board = html('div', 'dg-board'), hint = html('div', 'dg-hint');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'dg-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('tabindex', '0'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const layer = document.createElementNS(NS, 'g'), framesG = document.createElementNS(NS, 'g');
  svg.append(framesG, layer);
  board.append(svg, hint);
  const tools = html('div', 'dg-tools'), caption = html('p', 'dg-caption');
  caption.setAttribute('aria-live', 'polite');
  holder.append(board, tools, caption);
  const btn = (label, title, onclick, cls = '') => { const b = html('button', `dg-btn ${cls}`, label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', onclick); return b; };
  const zoomOut = btn('−', 'Zoom out', () => zoomBy(1 / ZSTEP)), zoomIn = btn('+', 'Zoom in', () => zoomBy(ZSTEP)), pct = html('span', 'dg-pct', '100%');
  const fit = btn('Fit', 'Fit the diagram to the view', () => zoomFit());
  const zoomBox = html('span', 'dg-zoom'); zoomBox.append(zoomOut, pct, zoomIn, fit);
  const namesBtn = btn('Names', 'Hide the names above the shapes', () => { showNames = !showNames; namesBtn.setAttribute('aria-pressed', String(showNames)); redraw(); });
  namesBtn.setAttribute('aria-pressed', 'true');
  const idsBtn = btn('Ids', 'Hide the short ids of the shapes and arrows (c1, r1, a1)', () => { showIds = !showIds; idsBtn.setAttribute('aria-pressed', String(showIds)); try { localStorage.setItem('p2-diagram-ids', showIds ? '1' : '0'); } catch { /* storage may be off */ } redraw(); });
  tools.append(zoomBox, namesBtn, idsBtn, html('span', 'dg-spacer'), btn('Undo', 'Undo the last change', () => host.send('undo')), btn('Save SVG', 'Save the diagram as an SVG file', () => host.send('save the diagram as an SVG')), btn('Save PNG', 'Save the diagram as a PNG file', () => host.send('save the diagram as a PNG')));

  let K = null, AR = null, loading = null, state = EMPTY, destroyed = false, hintIndex = 0, showNames = true, showIds = true, tucked = new Set(), loadError = null, stagePanel = null;
  const zv = { k: 1, dx: 0, dy: 0 };
  let vbBase = { x: 0, y: 0, w: 800, h: 500 }, vbNow = vbBase, fitKey = '';
  try { showIds = localStorage.getItem('p2-diagram-ids') !== '0'; } catch { /* default on */ }
  idsBtn.setAttribute('aria-pressed', String(showIds));
  const hintTimer = setInterval(() => { hintIndex++; if (!hint.hidden) showHint(); }, 4200);

  /** Loads the engine once (lazy: PERF). */
  function load() {
    loading ??= Promise.all([import(host.asset(ENGINE_ASSET)), import(host.asset(ARROWS_ASSET))]).then(([m, a]) => { K = m.default; AR = a; ensureCss(K); if (!destroyed) redraw(); }).catch((e) => { loadError = e; console.warn('diagram tab: engine failed to load', e); caption.textContent = 'The diagram engine could not be loaded. The commands still work.'; });
    return loading;
  }
  ensureCss(null);
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } });
    io.observe(board);
  }

  function showHint() {
    const empty = !(state.shapes?.length);
    hint.hidden = !empty;
    if (empty) hint.innerHTML = `<b>What shall we draw?</b><span>Say or type: <q>${HINTS[hintIndex % HINTS.length]}</q></span>`;
  }

  // ---- drawing (port of ui.js) -------------------------------------------------------------------------------------------
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const pc = (name, role) => `var(--pc-${K.PALETTE[name] ? name : 'white'}-${role})`;
  const tuckedNames = (shapes) => {
    const box = (s) => { const d = K.dims(s); return { x1: s.x - d.w / 2, x2: s.x + d.w / 2, y1: s.y - d.h / 2, y2: s.y + d.h / 2, a: d.w * d.h }; };
    const solid = shapes.filter((s) => !s.layer && s.shape !== 'text' && Number.isFinite(s.x) && Number.isFinite(s.y)).map((s) => [s, box(s)]), out = new Set();
    for (const [s, b] of solid) if (solid.some(([o, c]) => o !== s && b.a * 2 <= c.a && b.x1 >= c.x1 - 1 && b.x2 <= c.x2 + 1 && b.y1 >= c.y1 - 1 && b.y2 <= c.y2 + 1)) out.add(s.name);
    return out;
  };
  const tagShown = (s) => !s.layer && s.shape !== 'text' && !s.quiet && showNames && !tucked.has(s.name) && !(showIds && s.id && s.id === s.name);   // an unnamed shape shows its id instead (idShown)
  const idShown = (s) => !s.layer && showIds && !!s.id && !s.quiet && !tucked.has(s.name);
  function outlinePts(s) {
    const { w, h } = K.dims(s), hw = w / 2, hh = h / 2;
    if (s.shape === 'triangle') return [[0, -hh], [hw, hh], [-hw, hh]];
    if (s.shape === 'diamond') return [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
    if (s.shape === 'hexagon') return [0, 1, 2, 3, 4, 5].map((i) => [Math.cos(i * Math.PI / 3) * hw, Math.sin(i * Math.PI / 3) * hh]);
    if (s.shape === 'star') return [...Array(10)].map((_, i) => { const r = i % 2 ? 0.44 : 1, a = -Math.PI / 2 + i * Math.PI / 5; return [Math.cos(a) * hw * r, Math.sin(a) * hh * r + hh * 0.08]; });
    return null;
  }
  function rayDist(s, ux, uy) {
    const { w, h } = K.dims(s), hw = w / 2, hh = h / 2, c = Math.abs(ux) || 1e-6, sn = Math.abs(uy) || 1e-6;
    switch (s.shape) {
      case 'circle': return hw;
      case 'ellipse': return 1 / Math.sqrt((c / hw) ** 2 + (sn / hh) ** 2);
      case 'square': case 'rectangle': return Math.min(hw / c, hh / sn);
      case 'diamond': return 1 / (c / hw + sn / hh);
      case 'hexagon': return Math.min(hw / c, (hh * 0.87) / sn, 1 / Math.sqrt((c / hw) ** 2 + (sn / hh) ** 2) * 1.02);
      case 'triangle': return Math.min(hw, hh) * 0.72;
      default: return hw * 0.62;
    }
  }
  function drawShape(g, s, hl) {
    const grp = el('g', { class: `shp${s.layer ? ` ${s.layer}` : ''}${s.shape === 'text' ? ' txt' : ''}`, 'data-name': s.name, transform: `translate(${s.x} ${s.y})` }, g);
    const { w, h } = K.dims(s), tint = K.PALETTE_TINT[s.fill];
    if (s.shape === 'text') {
      const t = el('text', { class: 'ftext', x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': K.fontOf(s), style: `fill: ${pc(s.color || 'black', 'line')}` }, grp);
      t.textContent = s.label || '';
      if (idShown(s)) el('text', { class: 'idtag', x: -w / 2, y: -h / 2 - 2, 'text-anchor': 'start' }, grp).textContent = s.id;
      return;
    }
    const attrs = { class: `body${s.outline ? ' outlined' : ''}`, style: `fill: ${pc(s.color, 'fill')}; stroke: ${s.outline ? pc(s.outline, 'line') : pc(s.color, 'edge')}` };
    if (tint != null) attrs['fill-opacity'] = tint;
    const pts = outlinePts(s);
    if (s.shape === 'circle') el('circle', { r: w / 2, ...attrs }, grp);
    else if (s.shape === 'ellipse') el('ellipse', { rx: w / 2, ry: h / 2, ...attrs }, grp);
    else if (pts) el('polygon', { points: pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), 'stroke-linejoin': 'round', ...attrs }, grp);
    else el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 6, ...attrs }, grp);
    if (hl?.has(s.name)) el('rect', { class: 'halo', x: -w / 2 - 7, y: -h / 2 - 7, width: w + 14, height: h + 14, rx: 10 }, grp);
    if (s.layer === 'background' || s.layer === 'zone' || !tagShown(s)) el('title', {}, grp).textContent = s.name;
    if (tagShown(s)) el('text', { class: 'tag', x: 0, y: -h / 2 - 7, 'text-anchor': 'middle' }, grp).textContent = s.name;
    if (idShown(s)) el('text', { class: 'idtag', x: -w / 2, y: -h / 2 - 3, 'text-anchor': 'start' }, grp).textContent = s.id;
    if (s.label) {
      const room = ['rectangle', 'square', 'ellipse', 'circle'].includes(s.shape) ? w * 0.84 : w * 0.56;
      let fs = s.w ? Math.max(10, Math.min(15, s.h / 2.8)) : Math.max(9, Math.min(14, s.size / 4.4)), txt = s.label;
      for (let i = 0; i < 40 && txt.length * fs * 0.56 > room && fs > 9; i++) fs -= 0.5;   // fs starts at 15 or less and stops at 9: at most 12 steps
      const maxc = Math.max(3, Math.floor(room / (fs * 0.56)));
      if (txt.length > maxc) txt = `${txt.slice(0, maxc - 1)}…`;
      el('text', { class: 'lbl', x: 0, y: s.shape === 'triangle' ? h * 0.18 : 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs.toFixed(1), style: `fill: ${pc(s.color, tint != null ? 'wash' : 'ink')}` }, grp).textContent = txt;
    }
  }
  /** Draws one arrow along the route of arrows.mjs: sides, entry angles, spread, detours; the id on the line, the label off it with a halo. */
  function drawArrow(g, e, r, selected) {
    const pts = r.pts.map((p) => [...p]), n = pts.length;
    const col = e.color ? pc(e.color, 'line') : null;
    const grp = el('g', { class: `edge${selected ? ' sel' : ''}`, 'data-edge': e.id }, g);
    const [hx, hy] = r.headDir, [tx, ty] = r.tailDir, head0 = pts[n - 1], tail0 = pts[0];
    const head = (px, py, vx, vy) => { const bx = px - vx * 11, by = py - vy * 11; el('polygon', { class: 'hd', points: `${px},${py} ${bx - vy * 5},${by + vx * 5} ${bx + vy * 5},${by - vx * 5}`, style: col ? `fill:${col}` : '' }, grp); };
    if (e.arrow !== 'none') { pts[n - 1] = [head0[0] - hx * 9, head0[1] - hy * 9]; }
    if (e.arrow === 'both') { pts[0] = [tail0[0] - tx * 9, tail0[1] - ty * 9]; }
    const d = pts.map((p) => p.map((v) => (+v).toFixed(1)).join(',')).join(' ');
    if (selected) el('polyline', { class: 'selhalo', points: d, 'stroke-linejoin': 'round' }, grp);
    const ln = el('polyline', { class: 'ln', points: d, 'stroke-linejoin': 'round', style: col ? `stroke:${col}` : '' }, grp);
    if (e.style === 'dashed') ln.setAttribute('stroke-dasharray', '8 6');
    if (e.style === 'dotted') { ln.setAttribute('stroke-dasharray', '0.5 6'); ln.setAttribute('stroke-linecap', 'round'); ln.setAttribute('stroke-width', '2.6'); }
    if (e.width) ln.setAttribute('stroke-width', String(e.style === 'dotted' ? Math.max(2.6, e.width + 0.6) : e.width));
    if (e.arrow !== 'none') head(head0[0], head0[1], hx, hy);
    if (e.arrow === 'both') head(tail0[0], tail0[1], tx, ty);
    if (e.label) el('text', { class: 'elbl', x: (r.label ?? r.mid).x, y: (r.label ?? r.mid).y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, grp).textContent = e.label;
    if (showIds && e.id) el('text', { class: 'etag', x: r.mid.x, y: r.mid.y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, grp).textContent = e.id;
  }
  function drawGroups(g, S) {
    const spots = new Map(K.groupLabels(S).map((q) => [q.name, q]));
    for (const gr of S.groups || []) {
      const b = K.groupBox(S, gr);
      if (!b) continue;
      const pad = 12, x = b.x1 - pad, y = b.y1 - pad - 14, w = b.w + 2 * pad, h = b.h + 2 * pad + 14, at = spots.get(gr.name) || { x: x + 10, y: y - 6 };
      const grp = el('g', { class: 'grp', 'data-group': gr.name }, g);
      el('rect', { x, y, width: w, height: h, rx: 12, style: 'fill: var(--dg-accent); fill-opacity: .045; stroke: var(--dg-faint); stroke-width: 1.25; stroke-dasharray: 6 5; pointer-events: none' }, grp);
      el('text', { x: at.x, y: at.y, style: 'font: 600 12px system-ui, sans-serif; fill: var(--dg-faint); pointer-events: none' }, grp).textContent = gr.name;
    }
  }
  const boxOf = (s) => { const d = K.dims(s); return { x1: s.x - d.w / 2, x2: s.x + d.w / 2, y1: s.y - d.h / 2, y2: s.y + d.h / 2 }; };
  const cellsInUse = (S) => { const cells = new Map(); const add = (c) => cells.set(`${c.x},${c.y}`, c); S.shapes.forEach((s) => add(K.cellOf(s.x, s.y))); add(S.frame || { x: 0, y: 0 }); return [...cells.values()]; };
  function contentExtent(shapes) {
    shapes = shapes.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
    if (!shapes.length) return null;
    const boxes = shapes.map(boxOf).concat(shapes.filter(tagShown).map((s) => K.tagBox(s)));
    let x1 = Math.min(...boxes.map((b) => b.x1)) - FIT_PAD, x2 = Math.max(...boxes.map((b) => b.x2)) + FIT_PAD, y1 = Math.min(...boxes.map((b) => b.y1)) - FIT_PAD, y2 = Math.max(...boxes.map((b) => b.y2)) + FIT_PAD;
    if (x2 - x1 < FIT_MIN.w) { const m = (x1 + x2) / 2; x1 = m - FIT_MIN.w / 2; x2 = m + FIT_MIN.w / 2; }
    if (y2 - y1 < FIT_MIN.h) { const m = (y1 + y2) / 2; y1 = m - FIT_MIN.h / 2; y2 = m + FIT_MIN.h / 2; }
    return { x1, y1, x2, y2 };
  }
  function stageExtent(shapes) {
    const panels = shapes.filter((s) => s.layer === 'background' && (s.shape === 'rectangle' || s.shape === 'square'));
    if (!panels.length) return null;
    const panel = panels.reduce((a, b) => (K.dims(b).w * K.dims(b).h > K.dims(a).w * K.dims(a).h ? b : a));
    const boxes = shapes.map(boxOf).concat(shapes.filter(tagShown).map((s) => K.tagBox(s)));
    return { x1: Math.min(...boxes.map((b) => b.x1)), y1: Math.min(...boxes.map((b) => b.y1)), x2: Math.max(...boxes.map((b) => b.x2)), y2: Math.max(...boxes.map((b) => b.y2)), panel };
  }
  function washOutside(p) {
    const d = K.dims(p), x = p.x - d.w / 2, y = p.y - d.h / 2, w = d.w, h = d.h, r = 6, tint = K.PALETTE_TINT[p.fill];
    const hole = `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    el('path', { class: 'wash', d: `M-5000 -5000H15000V15000H-5000Z${hole}`, 'fill-rule': 'evenodd', style: `fill: ${pc(p.color, 'fill')}; pointer-events: none`, 'fill-opacity': tint != null ? tint : 1 }, framesG);
  }

  /** Draws `S` into the svg groups; also used by the export (a detached svg). */
  function paint(S, target = { layer, framesG }) {
    tucked = tuckedNames(S.shapes);
    target.layer.textContent = ''; target.framesG.textContent = '';
    const by = new Map(S.shapes.map((s) => [s.name, s])), cells = cellsInUse(S);
    const x1 = Math.min(...cells.map((c) => c.x)), y1 = Math.min(...cells.map((c) => c.y)), x2 = Math.max(...cells.map((c) => c.x + 800)), y2 = Math.max(...cells.map((c) => c.y + 500));
    const st = cells.length === 1 ? stageExtent(S.shapes) : null, ce = cells.length === 1 && !st ? contentExtent(S.shapes) : null;
    let base;
    if (st) base = [st.x1, st.y1, st.x2 - st.x1, st.y2 - st.y1];
    else if (ce) base = [ce.x1, ce.y1, ce.x2 - ce.x1, ce.y2 - ce.y1];
    else if (cells.length === 1) base = [x1, y1, 800, 500];
    else base = [x1 - 14, y1 - 30, x2 - x1 + 28, y2 - y1 + 44];
    stagePanel = st?.panel ?? null;
    if (stagePanel) washOutside(stagePanel);
    if (cells.length > 1) for (const c of cells) {
      el('rect', { class: 'frame', x: c.x, y: c.y, width: 800, height: 500, rx: 14 }, target.framesG);
      const f = (S.frames || []).find((q) => q.x === c.x && q.y === c.y);
      if (f?.title) el('text', { class: 'ftitle', x: c.x + 14, y: c.y - 9 }, target.framesG).textContent = f.title;
    }
    const gg = el('g', {}, target.layer), pg = el('g', {}, target.layer), eg = el('g', {}, target.layer), sg = el('g', {}, target.layer);
    drawGroups(gg, S);
    const tags = [];
    for (const s of S.shapes) { if (s.layer) continue; if (tagShown(s)) tags.push(K.tagBox(s)); if (idShown(s)) { const d = K.dims(s); tags.push({ x1: s.x - d.w / 2, x2: s.x - d.w / 2 + 16, y1: s.y - d.h / 2 - 14, y2: s.y - d.h / 2 }); } }
    const routes = AR.routeEdges(S.shapes, S.edges, (s) => K.dims(s), { tags });
    const selE = new Set(S.selected?.edges ?? []), selS = new Set(S.selected?.shapes ?? []);
    for (const e of S.edges) { const r = routes.get(e.id); if (r) drawArrow(eg, e, r, selE.has(e.id)); }
    for (const s of S.shapes) drawShape(s.layer === 'background' || s.layer === 'zone' ? pg : sg, s, selS);
    return base;
  }

  // ---- view: pan, zoom, fit -------------------------------------------------------------------------------------------------
  const zoomed = () => zv.k !== 1 || zv.dx !== 0 || zv.dy !== 0;
  function applyZoom() {
    const b = vbBase, w = b.w / zv.k, h = b.h / zv.k, cx = b.x + b.w / 2 + zv.dx, cy = b.y + b.h / 2 + zv.dy;
    vbNow = { x: cx - w / 2, y: cy - h / 2, w, h };
    svg.setAttribute('viewBox', `${+vbNow.x.toFixed(2)} ${+vbNow.y.toFixed(2)} ${+vbNow.w.toFixed(2)} ${+vbNow.h.toFixed(2)}`);
    pct.textContent = `${Math.round(zv.k * 100)}%`;
    fit.setAttribute('aria-pressed', String(!zoomed())); if (!zoomed()) fit.classList.remove('hint');
    zoomIn.disabled = zv.k >= ZMAX - 1e-9; zoomOut.disabled = zv.k <= ZMIN + 1e-9;
  }
  function zoomFit() { zv.k = 1; zv.dx = 0; zv.dy = 0; applyZoom(); }
  function zoomBy(f, p) {
    const k2 = Math.min(ZMAX, Math.max(ZMIN, zv.k * f)), r = k2 / zv.k;
    if (r === 1) return;
    const c = { x: vbNow.x + vbNow.w / 2, y: vbNow.y + vbNow.h / 2 };
    p = p || c;
    const nc = { x: p.x - (p.x - c.x) / r, y: p.y - (p.y - c.y) / r };
    zv.k = k2; zv.dx = nc.x - (vbBase.x + vbBase.w / 2); zv.dy = nc.y - (vbBase.y + vbBase.h / 2);
    if (Math.abs(zv.k - 1) < 1e-9) zv.k = 1;
    applyZoom();
  }
  const svgPt = (ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const ptrs = new Map(); let pan = null, pinch = null;
  svg.addEventListener('pointerdown', (ev) => {
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: zv.k }; pan = null; return; }
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    const m = svg.getScreenCTM();
    pan = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, dx0: zv.dx, dy0: zv.dy, upp: m?.a ? 1 / m.a : 1, moved: false };
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!ptrs.has(ev.pointerId)) return;
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomBy(pinch.k0 * d / pinch.d0 / zv.k, svgPt({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })); return; }
    if (!pan || pan.id !== ev.pointerId) return;
    const mx = ev.clientX - pan.x0, my = ev.clientY - pan.y0;
    if (!pan.moved && Math.hypot(mx, my) < 4) return;
    if (!pan.moved) { pan.moved = true; try { svg.setPointerCapture(ev.pointerId); } catch { /* gone */ } svg.classList.add('panning'); }
    zv.dx = pan.dx0 - mx * pan.upp; zv.dy = pan.dy0 - my * pan.upp; applyZoom();
  });
  const endPan = (ev) => { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; if (pan?.id === ev.pointerId) { pan = null; svg.classList.remove('panning'); } };
  svg.addEventListener('pointerup', endPan); svg.addEventListener('pointercancel', endPan);
  svg.addEventListener('wheel', (ev) => { if (!ev.ctrlKey && !ev.metaKey) return; ev.preventDefault(); zoomBy(Math.exp(-ev.deltaY * 0.0025), svgPt(ev)); }, { passive: false });
  svg.addEventListener('keydown', (ev) => {
    const step = 0.1, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
    if (d) { ev.preventDefault(); zv.dx += d[0] * vbNow.w; zv.dy += d[1] * vbNow.h; applyZoom(); } else if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); zoomBy(ZSTEP); } else if (ev.key === '-' || ev.key === '_') { ev.preventDefault(); zoomBy(1 / ZSTEP); } else if (ev.key === '0') { ev.preventDefault(); zoomFit(); }
  });

  function describe(S) {
    const n = S.shapes.length, m = S.edges.length;
    return n ? `${n} shape${n === 1 ? '' : 's'}, ${m} connection${m === 1 ? '' : 's'}${(S.groups || []).length ? `, ${S.groups.length} group${S.groups.length === 1 ? '' : 's'}` : ''}` : 'An empty canvas. Say what to draw!';
  }
  function redraw() {
    showHint();
    caption.textContent = loadError ? caption.textContent : describe(state);
    svg.setAttribute('aria-label', `Diagram: ${describe(state)}`);
    if (!K) return;
    const key = `${state.frame?.x ?? 0},${state.frame?.y ?? 0},${state.shapes.length ? 1 : 0}`;
    if (fitKey && fitKey !== key && zoomed()) { zv.k = 1; zv.dx = 0; zv.dy = 0; }
    fitKey = key;
    const base = paint(state);
    vbBase = { x: base[0], y: base[1], w: base[2], h: base[3] };
    applyZoom();
    const out = zoomed() && state.shapes.some((s) => { if (s.layer === 'background') return false; const d = K.dims(s); return s.x + d.w / 2 < vbNow.x || s.x - d.w / 2 > vbNow.x + vbNow.w || s.y + d.h / 2 < vbNow.y || s.y - d.h / 2 > vbNow.y + vbNow.h; });
    fit.classList.toggle('hint', out); fit.title = out ? 'Some shapes are outside the view: fit the diagram to the view' : 'Fit the diagram to the view';
  }

  /** A standalone SVG text of the diagram (colours resolved, light theme). */
  function toSVG() {
    const tmp = document.createElementNS(NS, 'svg');
    const l = document.createElementNS(NS, 'g'), f = document.createElementNS(NS, 'g');
    tmp.append(f, l);
    const keepTucked = tucked;
    const base = paint(state, { layer: l, framesG: f });
    tucked = keepTucked;
    paint(state);
    const css = `${paletteCss(K, 'svg')}svg { --dg-bg: #ffffff; --dg-ink: #1f2329; --dg-faint: #6a7480; --dg-accent: #356ac3; }
.body { stroke-width: 2; } .body.outlined { stroke-width: 3; } .tag { font: 600 11px sans-serif; fill: #6a7480; } .idtag { font: 600 9px monospace; fill: #6a7480; opacity: .75; } .etag { font: 600 9px monospace; fill: #6a7480; paint-order: stroke; stroke: #fff; stroke-width: 3px; } .selhalo { fill: none; stroke: #356ac3; stroke-width: 8; opacity: .35; } .lbl, .ftext { font-family: sans-serif; font-weight: 600; }
.ln { stroke: var(--pc-arrow); stroke-width: 2; fill: none; } .hd { fill: var(--pc-arrow); } .elbl { font: 600 12px sans-serif; fill: #1f2329; paint-order: stroke; stroke: #fff; stroke-width: 4px; } .frame { fill: none; stroke: #d5dae0; stroke-width: 1.5; stroke-dasharray: 3 5; } .ftitle { font: 600 13px sans-serif; fill: #6a7480; }`;
    const [x, y, w, h] = base;
    return { svg: `<svg xmlns="${NS}" viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}"><style>${css.replace(/:root/g, 'svg').replace(/svg:not\(\[data-theme="light"\]\)/g, 'svg.never').replace(/svg\[data-theme="dark"\]/g, 'svg.never')}</style><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>${f.innerHTML}${l.innerHTML}</svg>`, w, h };
  }
  const save = (blob, name) => {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return {
    update(next) {
      state = { ...EMPTY, ...(next && typeof next === 'object' ? next : {}) };
      state.shapes ??= []; state.edges ??= []; state.groups ??= [];
      if (state.shapes.length && !K) load();
      redraw();
    },
    hide() { ptrs.clear(); pan = null; pinch = null; },
    /** Download the diagram as SVG or PNG; returns { ok, detail }. */
    async download({ format = 'svg', filename = 'my-diagram' } = {}) {
      await load();
      if (!K || !state.shapes.length) return { ok: false, detail: 'the diagram is empty' };
      const base = String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'my-diagram';
      const { svg: text, w, h } = toSVG();
      if (format !== 'png') { save(new Blob([text], { type: 'image/svg+xml' }), `${base}.svg`); return { ok: true, detail: `${base}.svg` }; }
      const img = new Image();
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
      try {
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('the diagram could not be rendered')); img.src = url; });
        const c = document.createElement('canvas'), scale = Math.min(3, 2400 / Math.max(w, h));
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        const g2 = c.getContext('2d');
        g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, c.width, c.height); g2.drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        save(blob, `${base}.png`);
        return { ok: true, detail: `${base}.png` };
      } catch (e) { return { ok: false, detail: String(e?.message ?? e) }; } finally { URL.revokeObjectURL(url); }
    },
    destroy() { destroyed = true; clearInterval(hintTimer); },
  };
}

export default {
  id: 'diagram',
  label: 'Diagram',
  world: 'diagram.sketch',
  order: 85,
  make,
  effects: {
    'diagram.download': async (args, { ui }) => (ui?.download ? ui.download(args ?? {}) : { ok: false, detail: 'the Diagram tab is not open' }),
  },
};
