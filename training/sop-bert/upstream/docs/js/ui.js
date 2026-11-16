(function () {
'use strict';
const K = SOPKit;
const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const svg = $('#canvas'), layer = $('#layer'), framesG = $('#frames'), msgs = $('#msgs');
const escH = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Three readers turn each message into SOP wires. Each has its own system (world, engine, undo/redo), changed only by its own readings;
// the canvas shows the active tab's world. Every message goes to every reader that is loaded.
const READERS = [['rules', 'Rules'], ['vss', 'VSS'], ['neural', 'Neural']].map(([id, label]) => Object.assign({ id, label, last: [], pending: null, focusCell: null, reads: 0, lastRead: null }, K.createSystem()));
const RD = Object.fromEntries(READERS.map(r => [r.id, r]));
const sys = RD.rules, engine = sys.engine;          // the legend, plugins and SOP rendering are the same in every reader; the Rules system serves them
let cur = RD.rules, world = cur.world;               // the active tab
const neural = NeuralKit.create(RD.neural.engine, RD.neural.formalize);
let models = null, queue = Promise.resolve();
// the VSS formalizer reads through the composer (docs/model/micro/registry.json: 7 micro-worlds, CandidateRouter, event hint;
// training/sketch/COMBINED.md).
const VSS_OPTS = { composer: true };
let view = 'auto';
let hl = { shapes: new Set(), edges: new Set() }, hlTimer = null, drag = null;
const history = []; let turnSeq = 0;               // every message with what each reader made of it; a bubble's "details" shows one
let sub = 'drawing';                                // the active reader's subtab: 'drawing' | 'sop' | 'settings' (the same for every reader)
// browser storage is a convenience only: every access is guarded and the page works without it
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } } };
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
// spelling (docs/js/spell.js): a VSA spell checker corrects typed messages before the readers read them; every reader reads the same
// corrected text. Its vocabulary: docs/model/spell/vocab.json (the VSS worlds' words), the legend's values and cue words, and the names
// on the active reader's canvas. The switch is in ⋮ › Settings (Spelling); it is kept in this browser when storage works.
const SPELL_OFF = 'sop.spell.off';
let spellEnabled = store.get(SPELL_OFF) !== '1', speller = null;
const spellP = (window.SpellKit ? SpellKit.load(new URL('model/', document.baseURI).href, engine.legend) : Promise.resolve(null)).then(s => { speller = s; return s; });
const canvasNames = rd => rd.world.state.shapes.map(s => s.name).concat((rd.world.state.groups || []).map(g => g.name));
// cutting (owner's decision 2026-11-02): the three readers read the SAME requests. Each message is cut once, by the strategy chosen in
// ⋮ › Settings › Cutting (Rules segmenter, VSS cutter, BERT cutter; vss-composer.js CUT_STRATEGIES, cutUnits), and every reader reads those
// units; the tabs differ only in how each reads a request. The default is vss-composer.js DEFAULT_CUT (the best measured, training/sketch/
// cut_bench.mjs); the choice is kept in this browser when storage works. A strategy that is not available yet (VSS not loaded, no neural
// span head) is replaced by the Rules segmenter for that message, and the details say so. The cut reads the canvas of the reader it
// comes from (Rules, VSS or Neural), as that reader did when it cut for itself.
const CUT_KEY = 'sop.cut';
let cutPick = store.get(CUT_KEY), VF = null;
const vfP = import(new URL('js/vss-formalizer.js', document.baseURI).href).then(m => { VF = m; return m; }).catch(e => { console.error(e); return null; });
const CUT_OWNER = { rules: 'rules', vss: 'vss', bert: 'neural' };
const cutStrategies = () => VF ? VF.CUT_STRATEGIES : [{ id: 'rules', label: 'Rules segmenter' }, { id: 'vss', label: 'VSS cutter' }, { id: 'bert', label: 'BERT cutter' }];
const cutLabel = id => (cutStrategies().find(x => x.id === id) || { label: id }).label;
const cutWanted = () => cutPick || (VF ? VF.DEFAULT_CUT : 'vss');
const bertCut = () => nState === 'ready' && !!models && NeuralKit.canCut();
/** why a strategy cannot cut now (null: it can) */
function cutWhyNot(id) {
  if (id === 'rules') return null;
  if (id === 'vss') return vssState === 'ready' && VF ? null : vssState === 'failed' ? 'the VSS reader could not be loaded' : 'the VSS reader is still loading';
  if (id === 'bert') return bertCut() ? null : nState === 'ready' || nState === 'unpublished' ? 'the neural model with a span head (the BERT cutter) is not published yet' : 'the neural reader is not loaded';
  return 'unknown strategy';
}
/** cut one message once: -> {strategy, wanted, why (the wanted one could not cut), units [{c0, c1, src}], ms} */
async function cutMessage(text) {
  await vfP;
  const wanted = cutWanted(); let why = cutWhyNot(wanted), strategy = why ? 'rules' : wanted;
  const go = st => { const rd = RD[CUT_OWNER[st]]; return VF ? VF.cut(text, { names: canvasNames(rd), last: rd.last }, st, { rules: RD.rules, neural: NeuralKit }) : RD.rules.cut(text, { names: canvasNames(rd), last: rd.last }); };
  const t0 = performance.now(); let units;
  try { units = await go(strategy); } catch (e) { why = e.message; strategy = 'rules'; units = await go('rules'); }
  return { strategy, wanted, why, units, ms: performance.now() - t0 };
}

/* ---------------- canvas ---------------- */
/* ---------------- canvas ---------------- */
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function lum(hex) { const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function outlinePts(s) {
  const { w, h } = K.dims(s), hw = w / 2, hh = h / 2;
  if (s.shape === 'triangle') return [[0, -hh], [hw, hh], [-hw, hh]];
  if (s.shape === 'diamond') return [[0, -hh], [hw, 0], [0, hh], [-hw, 0]];
  if (s.shape === 'hexagon') return [0, 1, 2, 3, 4, 5].map(i => [Math.cos(i * Math.PI / 3) * hw, Math.sin(i * Math.PI / 3) * hh * 1.0]);
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
function drawShape(g, s) {
  const grp = el('g', { class: 'shp' + (hl.shapes.has(s.name) ? ' hl' : ''), 'data-name': s.name, transform: `translate(${s.x} ${s.y})` }, g);
  const { w, h } = K.dims(s), fill = K.COLOR_HEX[s.color] || '#ffffff';
  const attrs = { class: 'body' + (s.outline ? ' outlined' : ''), fill };
  if (s.outline) attrs.style = `stroke: ${K.COLOR_HEX[s.outline]}`;
  const pts = outlinePts(s);
  if (s.shape === 'circle') el('circle', Object.assign({ r: w / 2 }, attrs), grp);
  else if (s.shape === 'ellipse') el('ellipse', Object.assign({ rx: w / 2, ry: h / 2 }, attrs), grp);
  else if (pts) el('polygon', Object.assign({ points: pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' '), 'stroke-linejoin': 'round' }, attrs), grp);
  else el('rect', Object.assign({ x: -w / 2, y: -h / 2, width: w, height: h, rx: 6 }, attrs), grp);
  if (hl.shapes.has(s.name)) el('rect', { class: 'halo', x: -w / 2 - 7, y: -h / 2 - 7, width: w + 14, height: h + 14, rx: 10 }, grp);
  const tag = el('text', { class: 'tag', x: 0, y: -h / 2 - (hl.shapes.has(s.name) ? 12 : 7), 'text-anchor': 'middle' }, grp); tag.textContent = s.name;
  if (s.label) {
    const room = s.shape === 'rectangle' || s.shape === 'square' || s.shape === 'ellipse' || s.shape === 'circle' ? w * 0.84 : w * 0.56;
    let fs = Math.max(9, Math.min(14, s.size / 4.4)), txt = s.label;
    while (txt.length * fs * 0.56 > room && fs > 9) fs -= 0.5;
    const maxc = Math.max(3, Math.floor(room / (fs * 0.56))); if (txt.length > maxc) txt = txt.slice(0, maxc - 1) + '…';
    const t = el('text', { class: 'lbl', x: 0, y: s.shape === 'triangle' ? h * 0.18 : 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs.toFixed(1), fill: lum(fill) > 0.62 ? '#17202B' : '#FFFFFF' }, grp);
    t.textContent = txt;
  }
}
function drawEdge(g, e, a, b, offset) {
  let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; const ux = dx / L, uy = dy / L;
  const ox = -uy * offset, oy = ux * offset;
  const ra = rayDist(a, ux, uy) + 3, rb = rayDist(b, -ux, -uy) + 3;
  if (ra + rb >= L - 4) return;
  const x1 = a.x + ux * ra + ox, y1 = a.y + uy * ra + oy, x2 = b.x - ux * rb + ox, y2 = b.y - uy * rb + oy;
  const grp = el('g', { class: 'edge' + (hl.edges.has(e.id) ? ' hl' : '') }, g);
  const col = e.color ? K.COLOR_HEX[e.color] : null;
  const head = (tx, ty, vx, vy) => { const bx = tx - vx * 11, by = ty - vy * 11; el('polygon', { class: 'hd', points: `${tx},${ty} ${bx - vy * 5},${by + vx * 5} ${bx + vy * 5},${by - vx * 5}`, style: col ? `fill:${col}` : '' }, grp); };
  const sx = e.arrow === 'both' ? x1 + ux * 9 : x1, sy = e.arrow === 'both' ? y1 + uy * 9 : y1;
  const ex = e.arrow === 'none' ? x2 : x2 - ux * 9, ey = e.arrow === 'none' ? y2 : y2 - uy * 9;
  const ln = el('line', { class: 'ln', x1: sx, y1: sy, x2: ex, y2: ey, style: col ? `stroke:${col}` : '' }, grp);
  if (e.style === 'dashed') ln.setAttribute('stroke-dasharray', '8 6');
  if (e.style === 'dotted') { ln.setAttribute('stroke-dasharray', '0.5 6'); ln.setAttribute('stroke-linecap', 'round'); ln.setAttribute('stroke-width', '2.6'); }
  if (e.arrow !== 'none') head(x2, y2, ux, uy);
  if (e.arrow === 'both') head(x1, y1, -ux, -uy);
  if (e.label) { const t = el('text', { class: 'elbl', x: (x1 + x2) / 2 - uy * 12, y: (y1 + y2) / 2 + ux * 12, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, grp); t.textContent = e.label; }
}

/* a group: a light dashed frame around its members with its name, drawn behind them and recomputed from the members on every render */
function drawGroups(g, S) {
  for (const gr of S.groups || []) {
    const b = K.groupBox(S, gr); if (!b) continue;
    const pad = 12, x = b.x1 - pad, y = b.y1 - pad - 14, w = b.w + 2 * pad, h = b.h + 2 * pad + 14;
    const grp = el('g', { class: 'grp', 'data-group': gr.name }, g);
    el('rect', { x, y, width: w, height: h, rx: 12, style: 'fill: var(--accent); fill-opacity: .045; stroke: var(--faint); stroke-width: 1.25; stroke-dasharray: 6 5; pointer-events: none' }, grp);
    const t = el('text', { x: x + 10, y: y - 6, style: 'font-family: var(--font); font-size: 12px; font-weight: 600; fill: var(--faint); pointer-events: none' }, grp);
    t.textContent = gr.name;
  }
}
function cellsInUse() {
  const S = world.state, cells = new Map(), add = c => cells.set(c.x + ',' + c.y, c);
  S.shapes.forEach(s => add(K.cellOf(s.x, s.y)));
  add(S.frame || { x: 0, y: 0 });
  return [...cells.values()];
}
function renderCanvas() {
  layer.textContent = ''; framesG.textContent = '';
  const S = world.state, by = new Map(S.shapes.map(s => [s.name, s])), cells = cellsInUse();
  const narrow = svg.clientWidth > 0 && svg.clientWidth < 640;
  const focus = view === 'focus' || (view === 'auto' && narrow);
  if (focus) {
    const fc = cur.focusCell || S.frame || { x: 0, y: 0 };
    const inside = S.shapes.filter(s => { const c = K.cellOf(s.x, s.y); return c.x === fc.x && c.y === fc.y; });
    let bx1 = fc.x, by1 = fc.y, bx2 = fc.x + 800, by2 = fc.y + 500;
    if (inside.length) {
      bx1 = Math.min(...inside.map(s => s.x - K.dims(s).w / 2)) - 40; bx2 = Math.max(...inside.map(s => s.x + K.dims(s).w / 2)) + 40;
      by1 = Math.min(...inside.map(s => s.y - K.dims(s).h / 2)) - 44; by2 = Math.max(...inside.map(s => s.y + K.dims(s).h / 2)) + 30;
      const minW = 380, minH = 240;
      if (bx2 - bx1 < minW) { const m = (bx1 + bx2) / 2; bx1 = m - minW / 2; bx2 = m + minW / 2; }
      if (by2 - by1 < minH) { const m = (by1 + by2) / 2; by1 = m - minH / 2; by2 = m + minH / 2; }
    }
    svg.setAttribute('viewBox', `${bx1} ${by1} ${bx2 - bx1} ${by2 - by1}`);
  } else {
    const x1 = Math.min(...cells.map(c => c.x)), y1 = Math.min(...cells.map(c => c.y));
    const x2 = Math.max(...cells.map(c => c.x + 800)), y2 = Math.max(...cells.map(c => c.y + 500));
    svg.setAttribute('viewBox', `${x1 - 14} ${y1 - (cells.length > 1 ? 30 : 8)} ${x2 - x1 + 28} ${y2 - y1 + (cells.length > 1 ? 44 : 16)}`);
  }
  const vb = $('#view-btn'); if (vb) { vb.setAttribute('aria-pressed', String(!focus)); vb.title = focus ? 'Show the whole canvas' : 'Zoom to the current drawing'; vb.setAttribute('aria-label', vb.title); }
  if (cells.length > 1) for (const c of cells) {
    el('rect', { class: 'frame', x: c.x, y: c.y, width: 800, height: 500, rx: 14 }, framesG);
    const f = (S.frames || []).find(f => f.x === c.x && f.y === c.y);
    if (f && f.title) { const t = el('text', { class: 'ftitle', x: c.x + 14, y: c.y - 9 }, framesG); t.textContent = f.title; }
  }
  if (!S.shapes.length) { const f = S.frame || { x: 0, y: 0 }, t = el('text', { class: 'empty-note', x: f.x + 400, y: f.y + 250, 'text-anchor': 'middle' }, layer); t.textContent = 'Nothing here yet. Write what to draw.'; }
  const gg = el('g', {}, layer), eg = el('g', {}, layer), sg = el('g', {}, layer);
  drawGroups(gg, S);
  for (const e of S.edges) {
    const a = by.get(e.from), b = by.get(e.to); if (!a || !b) continue;
    drawEdge(eg, e, a, b, S.edges.some(o => o !== e && o.from === e.to && o.to === e.from) ? 6 : 0);
  }
  for (const s of S.shapes) drawShape(sg, s);
  const n = S.shapes.length, m = S.edges.length;
  $('#readout').textContent = `${n} shape${n === 1 ? '' : 's'} · ${m} link${m === 1 ? '' : 's'}`;
}
function flash(h) {
  hl = { shapes: new Set((h && h.shapes) || []), edges: new Set((h && h.edges) || []) };
  renderCanvas(); clearTimeout(hlTimer);
  if (hl.shapes.size || hl.edges.size) hlTimer = setTimeout(() => { hl = { shapes: new Set(), edges: new Set() }; renderCanvas(); }, 4200);
}

/* drag shapes by hand */
function svgPt(ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
svg.addEventListener('pointerdown', ev => {
  const g = ev.target.closest && ev.target.closest('.shp'); if (!g) return;
  const s = world.find(g.dataset.name); if (!s) return;
  const p = svgPt(ev); drag = { name: s.name, before: world.snapshot(), dx: s.x - p.x, dy: s.y - p.y, cell: K.cellOf(s.x, s.y), moved: false };
  svg.setPointerCapture(ev.pointerId); ev.preventDefault();
});
svg.addEventListener('pointermove', ev => {
  if (!drag) return; const s = world.find(drag.name); if (!s) return;
  const p = svgPt(ev), { w, h } = K.dims(s), c = drag.cell;
  const x = Math.round(Math.min(c.x + 800 - w / 2 - 10, Math.max(c.x + w / 2 + 10, p.x + drag.dx))), y = Math.round(Math.min(c.y + 500 - h / 2 - 10, Math.max(c.y + h / 2 + 24, p.y + drag.dy)));
  if (x !== s.x || y !== s.y) { s.x = x; s.y = y; drag.moved = true; renderCanvas(); }
});
const endDrag = () => {
  if (!drag) return; const d = drag; drag = null;
  if (d.moved) { world.commit(d.before); cur.last = [d.name]; updateTabs(); }
};
svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);

/* ---------------- chat ---------------- */
const scrollDown = () => { msgs.scrollTop = msgs.scrollHeight; };
function meBubble(text, sp) {
  const d = document.createElement('div'); d.className = 'b me';
  const fix = sp && sp.fixes.length ? `<div class="fix" title="${escH('Every reader read: ' + sp.text)}">spelling: ${sp.fixes.map(f => `<s>${escH(f.from)}</s> → ${escH(f.to)}`).join(', ')}</div>` : '';
  d.innerHTML = `<div class="txt">${escH(text)}</div>${fix}<div class="meta"><time>${clock()}</time></div>`;
  msgs.appendChild(d); scrollDown();
}
function botBubble(o) {
  const d = document.createElement('div'); d.className = 'b bot' + (o.err ? ' err' : '');
  let h = o.lines ? o.lines.map(p => `<div class="rl${p.err ? ' err' : ''}${p.off ? ' off' : ''}"><b>${escH(p.rd.label)}${p.ms != null ? ` · ${fmtMs(p.ms)}` : ''}:</b> <span class="t">${escH(p.off || p.text)}</span>${p.sub ? `<div class="sub">${escH(p.sub)}</div>` : ''}</div>`).join('')
    : `<div class="txt">${escH(o.text)}</div>`;
  if (o.sub) h += `<div class="sub">${escH(o.sub)}</div>`;
  if (o.chips && o.chips.length) h += `<div class="chips">${o.chips.map(c => `<button type="button" data-pick="${escH(c)}">${escH(c)}</button>`).join('')}</div>`;
  h += `<div class="meta">${o.tag ? `<span class="tag2">${escH(o.tag)}</span>` : ''}${o.turn ? `<button type="button" data-turn="${o.turn}">details</button>` : ''}<time>${clock()}</time></div>`;
  d.innerHTML = h;
  if (o.replace) o.replace.replaceWith(d); else msgs.appendChild(d);
  scrollDown(); return d;
}
function sysNote(text) { const d = document.createElement('div'); d.className = 'sys'; d.textContent = text; msgs.appendChild(d); scrollDown(); }
function typing() { const d = document.createElement('div'); d.className = 'b bot'; d.innerHTML = '<div class="typing" aria-label="Thinking"><i></i><i></i><i></i></div>'; msgs.appendChild(d); scrollDown(); return d; }
function setStatus(t) { $('#status').textContent = t; }
const fmtMs = ms => ms < 10 ? ms.toFixed(1) + ' ms' : Math.round(ms) + ' ms';
const isReady = rd => rd.id === 'rules' || (rd.id === 'vss' ? vssState === 'ready' : !!models && nState === 'ready');
/** what a reader that is not loaded says instead of an answer */
function offText(rd) {
  if (rd.id === 'vss') return vssState === 'failed' ? 'not available (it could not be loaded)' : 'still loading, did not read this';
  return { unpublished: 'not available (the neural model is not published yet)', failed: 'not available (loading failed; see Neural › Settings)' }[nState] || 'still loading, did not read this';
}
const idleStatus = () => 'reads with ' + listing(READERS.filter(isReady).map(r => r.label));
msgs.addEventListener('click', ev => {
  const p = ev.target.closest('[data-pick]'); if (p) { submit(p.dataset.pick); return; }
  const t = ev.target.closest('[data-turn]'); if (t) openSheet('turn', null, +t.dataset.turn);
});

/* Turn effects into one or two plain sentences. */
const listing = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const few = (a, n) => a.length > n ? listing(a.slice(0, n).concat(`${a.length - n} more`)) : listing(a);
function summarize(result) {
  const adds = [], links = [], unlinks = [], dels = [], moved = [], changed = [], renames = [], rules = [], said = [], answers = [];
  for (const st of result.steps) {
    if (st.node.type === 'mention' || st.error || st.skipped) continue;
    for (const p of st.patches) {
      if (p.op === 'add') adds.push(`${p.shape.name}`);
      else if (p.op === 'link') links.push(K.edgeText(p.edge).replace(/ \(.*$|\s+".*"$/, ''));
      else if (p.op === 'unlink') unlinks.push(p.edge ? `${p.edge.from}–${p.edge.to}` : p.id);
      else if (p.op === 'remove') dels.push(p.name);
      else if (p.op === 'rename') renames.push(`${p.from} to ${p.to}`);
      else if (p.op === 'rule') rules.push(p.rule);
      else if (p.op === 'forget') said.push('Forgot all default rules.');
      else if (p.op === 'reorder') said.push(p.to === 'front' ? `Brought ${p.name} to the front.` : `Sent ${p.name} to the back.`);
      else if (p.op === 'set') {
        if ('x' in p.props && !moved.includes(p.name)) moved.push(p.name);
        const ch = Object.entries(p.props).filter(([k]) => k !== 'x' && k !== 'y').map(([k, v]) => k === 'size' ? K.sizeName(v) : k === 'label' ? `labeled “${v}”` : k === 'outline' ? (v ? `${v} outline` : 'no outline') : k === 'shape' ? `a ${v}` : String(v));
        if (ch.length) changed.push(`${p.name} is now ${listing(ch)}`);
      }
    }
    if (st.answer) answers.push(st.answer);
    for (const n of st.notes || []) if (/^(reverted|re-applied|there was nothing)|already/.test(n)) said.push(n.charAt(0).toUpperCase() + n.slice(1) + '.');
  }
  const out = [];
  if (adds.length) out.push(`Drew ${few(adds, 6)}.`);
  if (links.length) out.push(`Connected ${few(links, 4)}.`);
  if (renames.length) out.push(`Renamed ${listing(renames)}.`);
  if (changed.length) out.push(changed.slice(0, 4).join('; ') + (changed.length > 4 ? `; and ${changed.length - 4} more.` : '.'));
  if (moved.length) out.push(`Moved ${few(moved, 5)}.`);
  if (unlinks.length) out.push(`Removed the link${unlinks.length > 1 ? 's' : ''} ${few(unlinks, 4)}.`);
  if (dels.length) out.push(`Deleted ${few(dels, 6)}.`);
  for (const r of rules) out.push(`From now on, new ${r.shape ? r.shape + 's' : 'shapes'} will be ${['size', 'color'].filter(k => r[k]).map(k => r[k]).join(' ')}${r.outline ? ' with a ' + r.outline + ' outline' : ''}.`);
  out.push(...said.map(s => s.replace(/^Reverted 1 turn\.$/, 'Undid the last change.').replace(/^Re-applied 1 turn\.$/, 'Redid it.')));
  out.push(...answers);
  return out.join(' ') || 'Done.';
}

/* ---------------- running a turn ---------------- */
function submit(text, sop) { if (typeof sop !== 'string') sop = undefined; queue = queue.then(() => run(text, sop)).catch(e => { console.error(e); botBubble({ text: 'Something went wrong: ' + e.message, err: true }); }); return queue; }
async function run(text, sop) {
  text = String(text).trim(); if (!text) return;
  // the spell checker runs before every reader (not on SOP and toolbar buttons): they all read the corrected text
  const typed = text, raw = !!sop || text.startsWith('@');
  let sp = null;
  if (!raw && spellEnabled) { const sc = await spellP; if (sc) { sp = sc.check(text, { names: canvasNames(cur) }); text = sp.text; } }
  meBubble(typed, sp);
  const id = ++turnSeq, rec = { id, time: clock(), text, typed, spell: sp, spellOff: !raw && !spellEnabled, raw, sop: sop || text, button: !!sop, readers: {}, off: {}, ran: [] }; history.push(rec);
  if (rec.raw) { try { K.parse(rec.sop); } catch (e) { rec.error = e; botBubble({ text: e.message, err: true, turn: id, tag: 'SOP Lang' }); return; } }
  // the readers that read this message are fixed now: one that finishes loading meanwhile starts from the Rules drawing instead
  const live = READERS.filter(isReady);
  // a reply to a question ("which Hub?") goes to the readers that asked it; the others have nothing to choose
  const want = text.toLowerCase().replace(/^(?:i\s+mean|use|the\s+one\s+(?:named|called))\s+/, '').replace(/[.!]+$/, '').trim();
  const picks = new Map(live.map(rd => [rd, rd.pending && rd.pending.candidates.find(c => c.toLowerCase() === want)]));
  const anyPick = [...picks.values()].some(Boolean);
  const wait = live.length > 1 ? typing() : null; if (wait) setStatus('typing…');
  if (!rec.raw && !anyPick && live.length) rec.cut = await cutMessage(text);   // one cut, read by every reader
  const parts = [];
  for (const rd of READERS) {
    if (!live.includes(rd)) { rec.off[rd.id] = offText(rd); parts.push({ rd, off: rec.off[rd.id] }); continue; }
    const pend = rd.pending; rd.pending = null;
    const p = anyPick && !picks.get(rd) ? { text: 'No question was open here; nothing to choose.' } : await readWith(rd, text, rec, picks.get(rd) ? { pend, pick: picks.get(rd) } : null);
    rec.ran.push(rd.id); parts.push(Object.assign(p, { rd }));
  }
  setStatus(idleStatus());
  botBubble({ lines: parts, chips: [...new Set(parts.flatMap(p => p.chips || []))], turn: id, tag: rec.button ? 'button' : rec.raw ? 'SOP Lang' : null, replace: wait });
  const mine = parts.find(p => p.rd === cur);
  if (mine && mine.highlight) flash(mine.highlight); else renderCanvas();
  updateTabs(); renderSopBar();
}
/** one reader reads one message into its own world; returns its line of the reply ({text, sub, err, chips, ms, highlight}) */
async function readWith(rd, text, rec, pk) {
  const r = { nodes: [], notes: [] }; rec.readers[rd.id] = r;
  let overrides = {};
  const ctx = { names: rd.world.state.shapes.map(s => s.name).concat((rd.world.state.groups || []).map(g => g.name)), last: rd.last };   // group names are names too (VSS reads a name only if it is listed)
  // the time is the formalizing only (text -> SOP wires), not the engine or the drawing; VSS and Neural are loaded before they read
  const t0 = performance.now();
  try {
    if (pk) { r.nodes = pk.pend.nodes; overrides = Object.assign({}, pk.pend.overrides, { [pk.pend.wire]: [pk.pick] }); }
    else if (rec.raw) r.nodes = K.parse(rec.sop);   // SOP: nothing to formalize, no time
    else if (rd.id === 'rules') { const f = rec.cut && rec.cut.strategy !== 'rules' ? rd.formalize(text, ctx, { units: rec.cut.units }) : rd.formalize(text, ctx); r.ms = performance.now() - t0; r.nodes = f.nodes; r.notes = f.notes; }
    else if (rd.id === 'vss') { const v = await window.VSSFormalizer.formalize(text, ctx, rd.formalize, Object.assign({}, VSS_OPTS, rec.cut ? { units: rec.cut.units } : {})); r.ms = performance.now() - t0; r.vss = v; r.nodes = v.nodes; r.notes = v.notes; }
    else { const n = await neural.formalize(text, ctx, rec.cut ? { units: rec.cut.units } : undefined); r.ms = performance.now() - t0; r.neural = n; r.nodes = n.nodes; r.notes = n.notes.filter(x => !/couldn't find an action/.test(x)); }
    if (rec.cut && !pk && !rec.raw) r.cutBy = rec.cut.strategy;
  } catch (e) { r.error = e; r.ms = performance.now() - t0; return { text: `The ${rd.label} reader failed: ${e.message}`, err: true, ms: r.ms }; }
  const ms = r.ms, nodes = r.nodes, notes = r.notes, world = rd.world, engine = rd.engine;
  rd.reads++; rd.lastRead = { turn: rec.id, nodes };
  // the parts no reading took: the Rules reader's "couldn't find an action in …" and the VSS reader's "Ignored (not understood): “…”, “…”"
  const unread = notes.filter(n => /couldn't find an action/.test(n)).map(n => (n.match(/in "(.*)"\.?$/) || [])[1]).filter(Boolean)
    .concat(notes.filter(n => /^Ignored \(not understood\):/.test(n)).flatMap(n => [...n.matchAll(/“([^”]*)”/g)].map(m => m[1])).filter(u => u.trim().split(/\s+/).length > 1));   // a one-word unit ("and") stays in the details only
  if (!nodes.length) {
    r.error = new K.SOPError('No wires.');
    return { text: unread.length ? 'I didn’t get what to do there. Try something like “draw a red circle next to Start” or “what is connected to Start?”.' : 'I couldn’t turn that into anything I can do.', err: true, ms };
  }
  const result = engine.run(nodes, { overrides }); r.result = result;
  // do what was understood; ask about the rest (a question never blocks the other wires of the message)
  const asks = [], problems = [];
  let clar = null;
  for (const er of result.errors || []) {
    const e = er.error;
    if (e instanceof K.Clarify && !clar) {
      clar = e;
      const keep = new Set([e.wire, ...er.dependents.map(n => n.id)]);
      const need = new Set(); const refsOf = v => K.isRef(v) ? [v.ref] : Array.isArray(v) ? v.flatMap(refsOf) : [];
      for (const n of nodes) if (keep.has(n.id)) Object.values(n.args).flatMap(refsOf).forEach(x => need.add(x));
      const ov = Object.assign({}, overrides); for (const st of result.steps) if (need.has(st.node.id) && !keep.has(st.node.id) && st.value !== undefined) ov[st.node.id] = st.value;
      rd.pending = { nodes: nodes.filter(n => keep.has(n.id) || need.has(n.id)), wire: e.wire, candidates: e.candidates, overrides: ov };
    } else if (!(e instanceof K.Clarify)) problems.push(e.message + (er.dependents.length ? ` (so I also skipped ${er.dependents.length} step${er.dependents.length > 1 ? 's' : ''} that needed it)` : ''));
  }
  for (const u of unread) asks.push(`I didn’t understand “${u}”. Could you say it another way?`);
  const anyDone = result.steps.some(st => !st.error && !st.skipped && st.node.type !== 'mention');
  if (!anyDone && !clar && !problems.length && !asks.length) return { text: 'Done.', ms };
  const highlight = { shapes: [], edges: [] }, touched = [];
  result.steps.forEach(s => {
    s.patches.forEach(p => { if (p.op === 'add') touched.push(p.shape.name); else if (p.op === 'set') touched.push(p.name); else if (p.op === 'rename') touched.push(p.to); });
    if (s.highlight) { highlight.shapes.push(...(s.highlight.shapes || [])); highlight.edges.push(...(s.highlight.edges || [])); }
  });
  const alive = [...new Set(touched)].filter(n => world.find(n));
  if (alive.length) rd.last = alive; else if (highlight.shapes.length) rd.last = [...new Set(highlight.shapes)].filter(n => world.find(n));
  if (!highlight.shapes.length) highlight.shapes = alive;
  { const f = world.find(highlight.shapes[0] || alive[0]); if (f) rd.focusCell = K.cellOf(f.x, f.y); }
  const odd = notes.filter(n => /is not a shape I know|couldn't tell|^I read /.test(n));
  const did = anyDone ? summarize(result) : '';
  const tail = problems.concat(asks).join(' ');
  if (clar) return { text: (did && did !== 'Done.' ? did + ' ' : '') + clar.message.replace(/ Reply with a name\.$/, ''), sub: [tail, odd.join(' ')].filter(Boolean).join(' ') || null, chips: clar.candidates, ms, highlight };
  if (problems.length && !anyDone) return { text: problems.join(' '), sub: [asks.join(' '), odd.join(' ')].filter(Boolean).join(' ') || null, err: true, ms, highlight };
  return { text: did || 'Done.', sub: [tail, odd.join(' ')].filter(Boolean).join(' ') || null, ms, highlight };
}

/* ---------------- technical history ---------------- */
function turnHTML(r) {
  if (r.error) return `<pre class="sop"><span class="cm"># typed as SOP Lang</span>\n${escH(r.sop)}</pre><div class="errt">${escH(r.error.message)}</div>`;
  return READERS.map(rd => {
    const x = r.readers[rd.id];
    if (!x) return `<section class="rdsec"><div class="minihead">${escH(rd.label)} <span>${escH(r.off[rd.id] || 'did not read this')}</span></div></section>`;
    let h = `<div class="minihead">${escH(rd.label)} <span>${x.ms != null ? 'formalized in ' + fmtMs(x.ms) : r.raw ? 'SOP Lang, nothing to formalize' : 'your choice from the question'}${x.neural ? ` · ${x.neural.calls} model calls` : ''}${x.cutBy ? ` · cut by: ${escH(cutLabel(x.cutBy))}` : ''}</span></div>`;
    if (x.nodes && x.nodes.length) h += `<pre class="sop">${r.raw ? `<span class="cm"># ${r.button ? 'toolbar button, sent as SOP Lang' : 'typed as SOP Lang'}</span>\n` : ''}${x.nodes.map(hlNode).join('\n')}</pre>`;
    (x.notes || []).forEach(n => { h += `<div class="note">${escH(n)}</div>`; });
    if (x.vss) h += vssHTML(x.vss);
    if (x.neural) h += neuralHTML(x.neural);
    if (x.result) h += x.result.steps.map(stepHTML).join('');
    const err = x.error && x.error.message !== 'No wires.' ? x.error : x.result && !x.result.ok ? x.result.error : null;
    if (err) h += `<div class="errt">${escH(err.message)}</div>`;
    if (!x.nodes || !x.nodes.length) h += '<div class="note">No wires were produced.</div>';
    return `<section class="rdsec">${h}</section>`;
  }).join('');
}
const ranLabel = r => (r.button ? 'button · ' : r.raw ? 'SOP Lang · ' : '') + (r.ran.length ? r.ran.map(id => RD[id].label).join(' · ') : 'none');
/** the details of one message: what each reader wrote (SOP wires), how long that took, and what it did to that reader's drawing */
function renderTurn(id) {
  const r = history.find(x => x.id === id);
  if (!r) return '<p class="intro">This message is no longer here.</p>';
  const sp = r.spell, fixes = sp && sp.fixes.length ? sp.fixes.map(f => `${f.from} → ${f.to} (similarity ${f.sim.toFixed(2)}, next ${f.second.toFixed(2)})`).join(', ') : '';
  const spell = fixes ? `<div class="note">Spelling, in ${fmtMs(sp.ms)}: ${escH(fixes)}. Every reader read the corrected text:</div><div class="q">${escH(r.text)}</div>`
    : sp ? `<div class="note">Spelling: nothing corrected (${fmtMs(sp.ms)}).</div>` : r.spellOff ? '<div class="note">Spelling check was off (⋮ › Settings).</div>' : '';
  const c = r.cut, cut = c ? `<div class="note">Cut into ${c.units.length} request${c.units.length === 1 ? '' : 's'} by the ${escH(cutLabel(c.strategy))} in ${fmtMs(c.ms)}${c.why ? ` (the ${escH(cutLabel(c.wanted))} was chosen, but ${escH(c.why)})` : ''}; every reader read these:</div><ul class="units">${c.units.map(u => `<li><span class="src">“${escH(u.src)}”</span></li>`).join('')}</ul>` : '';
  return `<div class="msghead"><div class="q">${escH(r.typed || r.text)}</div>${spell}${cut}<div class="note">${escH(r.time)} · read by ${escH(ranLabel(r))}</div></div>
  <p class="intro">What each reader wrote for this message in SOP Lang and how long writing it took, the plugin that ran each wire and the changes it made to that reader’s drawing, the requests each VSS world read and the neural model’s evidence.</p>${turnHTML(r)}`;
}

/* ---------------- SOP highlighting ---------------- */
function hlValue(raw) {
  return K.fmtValue(raw).split(/(,)/).map(part => {
    if (part === ',') return '<span class="cm">,</span>';
    if (part.startsWith('$')) return `<span class="rf">${escH(part)}</span>`;
    if (part.startsWith('"')) return `<span class="str">${escH(part)}</span>`;
    return `<span class="v">${escH(part)}</span>`;
  }).join('');
}
function hlNode(n) {
  const line = K.serialize(n); const head = `<span class="wid">@${escH(n.id)}</span> <span class="wt">${escH(n.type)}</span>`;
  const keys = line.split(' ').slice(2).map(t => t.split('=')[0]);
  const body = keys.map(k => { const q = engine.legend.get(k); return ` <span class="k"${q && q.ask ? ` title="${escH(q.ask)}"` : ''}>${escH(k)}</span><span class="cm">=</span>${hlValue(n.args[k])}`; }).join('');
  return `<span class="${n.type === 'mention' ? 'ln-mention' : ''}">${head}${body}</span>`;
}

/* ---------------- conversation ---------------- */
function patchLine(p) {
  const sz = v => K.sizeName(v);
  switch (p.op) {
    case 'add': return ['add', '+', `${p.shape.name}  ${sz(p.shape.size)} ${p.shape.color} ${p.shape.shape}${p.shape.label ? ` "${p.shape.label}"` : ''}`];
    case 'remove': return ['del', '−', p.name];
    case 'set': { const pr = p.props, parts = []; if ('x' in pr) parts.push(`moved to (${pr.x}, ${pr.y})`); for (const [k, v] of Object.entries(pr)) { if (k === 'x' || k === 'y') continue; parts.push(k === 'size' ? `size ${sz(v)}` : `${k} ${v == null ? 'none' : v}`); } return ['chg', '~', `${p.name}  ${parts.join(', ')}`]; }
    case 'rename': return ['chg', '~', `${p.from} is now ${p.to}`];
    case 'link': return ['add', '+', K.edgeText(p.edge)];
    case 'unlink': return ['del', '−', p.edge ? K.edgeText(p.edge) : p.id];
    case 'rule': return ['add', '+', `rule ${p.rule.id}`];
    case 'forget': return ['del', '−', 'all rules'];
  }
  return ['chg', '?', p.op];
}
function stepHTML(st) {
  const bits = [];
  if (st.patches.length) bits.push(`<ul class="fx">${st.patches.map(p => { const [c, o, t] = patchLine(p); return `<li><span class="op ${c}">${o}</span>${escH(t)}</li>`; }).join('')}</ul>`);
  if (st.answer) bits.push(`<div class="answer">${escH(st.answer)}</div>`);
  if (st.notes && st.notes.length) bits.push(`<div class="note">${escH(st.notes.join('; '))}</div>`);
  (st.issues || []).filter(i => i.level === 'warn').forEach(i => bits.push(`<div class="note">${escH(i.msg)}</div>`));
  if (st.lowering) bits.push(`<details class="lower"><summary>Lowered to Datalog and evaluated</summary><pre>${escH(st.lowering)}</pre></details>`);
  if (!bits.length) return '';
  const plug = st.plugin ? engine.plugin(st.plugin) : null;
  return `<div class="row"><span class="chip">@${escH(st.node.id)} <span class="p">${escH(plug ? plug.name : st.plugin || '')}</span></span><div class="res">${bits.join('')}</div></div>`;
}
const fmtV = v => v == null ? '' : K.fmtValue(v);
function vssHTML(v) {
  let h = '';
  if (v.units) h += `<div class="note">The requests and the world that read each:</div><ul class="units">${v.units.map(u => `<li><span class="src">“${escH(u.src || '')}”</span> → ${u.zone === 'ignored' ? 'not read' + (u.reason ? ' (' + escH(u.reason) + ')' : '') : `world <code>${escH(((vssInfo && vssInfo.worlds || []).find(w => w.world === u.world) || { model: u.world || '' }).model)}</code>, ${escH(u.event || '?')}${u.zone === 'ask' ? ', asked which shape' : ''}${u.tie > 1 ? `, ${u.tie} worlds read it, decided by ${escH(u.decidedBy || '?')}` : ''}${u.reread ? ', action from the event hint' : ''}`}${u.noWorldSignal ? ' (the VSS cutter named no world here: every world read it)' : ''}</li>`).join('')}</ul>`;
  for (const c of v.clauses) {
    if (!c.vss) continue;
    const m = c.vss.margins || {}, ms = Object.entries(m).filter(([, x]) => typeof x === 'number').map(([k, x]) => `${k} ${x.toFixed(2)}`).slice(0, 8).join(' · ');
    h += `<details class="cmp"><summary>clause <span class="src">${escH(c.src)}</span></summary><div class="tb" style="padding:6px 0 0">
      <div class="note">normalized: <code>${escH(c.normalized)}</code> · status <b>${escH(c.vss.status)}</b> · residual ${(+c.vss.residual).toFixed(3)}${c.vss.unplaced && c.vss.unplaced.length ? ' · unplaced: ' + escH(c.vss.unplaced.join(' ')) : ''}</div>
      ${ms ? `<div class="note">margins: ${escH(ms)}</div>` : ''}<pre class="sop">${escH(c.vss.sop)}</pre></div></details>`;
  }
  return h;
}
function neuralHTML(n) {
  const pct = x => (x * 100).toFixed(0) + '%';
  let h = '';
  for (const a of n.analyses) {
    const r = a.rules, rows = [];
    const actKey = a.kind.value === 'command' ? 'action' : a.kind.value === 'question' ? 'ask' : null;
    rows.push(['wire type', r ? r.type : '', a.kind.value, a.kind.top.map(t => `${t[0]} ${pct(t[1])}`).join(' · '), true]);
    if (actKey || (r && (r.args.action || r.args.ask))) { const rk = r ? (r.args.action || r.args.ask || '') : ''; rows.push([actKey || 'action/ask', rk, a.act ? a.act.value : '', a.act ? a.act.top.map(t => `${t[0]} ${pct(t[1])}`).join(' · ') : '', true]); }
    const keys = new Set(Object.keys(a.keys).concat(r ? Object.keys(r.args).filter(k => k !== 'action' && k !== 'ask') : []));
    for (const k of keys) {
      const q = a.keys[k];
      const why = q ? (q.span ? `“${q.span}” ${pct(q.score)}${q.source !== 'neural' ? ' · from ' + q.source : ''}` : 'no span') : 'not in frame';
      rows.push([k, r ? fmtV(r.args[k]) : '', q ? fmtV(q.value) : '', why, false]);
    }
    const body = rows.filter(x => x[1] !== '' || x[2] !== '' || x[4]).map(([k, rv, nv, why]) => r ? `<tr class="${rv === nv ? 'same' : 'diff'}"><th>${escH(k)}</th><td>${escH(rv || '–')}</td><td>${escH(nv || '–')}</td><td class="why">${escH(why)}</td></tr>` : `<tr><th>${escH(k)}</th><td>${escH(nv || '–')}</td><td class="why">${escH(why)}</td></tr>`).join('');
    h += `<details class="cmp"><summary>@${escH(a.id)} <span class="src">${escH(a.src)}</span></summary><div class="tbl"><table><thead><tr><th>question</th>${r ? '<th>rules</th>' : ''}<th>neural</th><th>model evidence</th></tr></thead><tbody>${body}</tbody></table></div></details>`;
  }
  return h;
}

/* ---------------- sheets ---------------- */
const sheet = $('#sheet'), scrim = $('#scrim'), sbody = $('#sbody'), stabs = $('#stabs');
let sheetKind = null, sheetTab = null, sheetTurn = null;
// the readers' own settings and their drawing as SOP are subtabs of each reader tab; the sheet keeps what is shared by every reader
// Help is not here: it is the full-screen overlay (docs/js/docs.js), opened by the ? button above the drawing
const TABS = { settings: [['settings', 'Settings'], ['plugins', 'Capabilities'], ['benchmark', 'Benchmark']], examples: [], turn: [] };
function openSheet(kind, tab, focus) {
  sheetKind = kind; sheetTab = tab || (TABS[kind][0] || [])[0] || null;
  $('#sheet-title').textContent = kind === 'examples' ? 'Examples' : kind === 'turn' ? 'Message details' : 'Settings';
  stabs.hidden = !TABS[kind].length;
  stabs.innerHTML = TABS[kind].map(([k, l]) => `<button class="stab" role="tab" type="button" data-stab="${k}" aria-selected="${k === sheetTab}">${l}</button>`).join('');
  sheet.hidden = false; scrim.hidden = false; renderSheet(focus); sbody.scrollTop = 0;
}
function closeSheet() { sheet.hidden = true; scrim.hidden = true; sheetKind = null; }
$('#close-sheet').addEventListener('click', closeSheet); scrim.addEventListener('click', closeSheet);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !sheet.hidden) closeSheet(); });
stabs.addEventListener('click', ev => { const b = ev.target.closest('[data-stab]'); if (!b) return; sheetTab = b.dataset.stab; stabs.querySelectorAll('.stab').forEach(x => x.setAttribute('aria-selected', String(x === b))); renderSheet(); sbody.scrollTop = 0; });
$('#open-settings').addEventListener('click', () => openSheet('settings', 'settings'));
$('#help-btn').addEventListener('click', () => { closeSheet(); DocsKit.open('start'); });
/** open a help page from anywhere in the app (a button with data-help="<page>") */
function openHelp(id) { if (!sheet.hidden) closeSheet(); DocsKit.open(id); }
$('#open-examples').addEventListener('click', () => openSheet('examples'));
function renderSheet(focus) {
  if (sheetKind === 'examples') sbody.innerHTML = renderExamples();
  else if (sheetKind === 'turn') { if (focus) sheetTurn = focus; sbody.innerHTML = renderTurn(sheetTurn); }
  else if (sheetTab === 'settings') sbody.innerHTML = renderSettings();
  else if (sheetTab === 'benchmark') { sbody.innerHTML = renderBench(); if (!benchSets) benchIndex().then(() => { if (sheetTab === 'benchmark' && !sheet.hidden) sbody.innerHTML = renderBench(); }).catch(e => { sbody.innerHTML = `<p class="intro">The test sets could not be loaded: ${escH(e.message)}</p>`; }); }
  else if (sheetTab === 'plugins') sbody.innerHTML = renderPlugins();
}

/* ---------------- examples ---------------- */
const QUICK = [
  'Draw a small pink star next to Done',
  'Make the green circle bigger',
  'Connect Done to Start with a dotted line',
  'Is there a path from Start to Done?',
  'What is connected to Check?',
  'Add three tiny red circles in a row below Process',
  'Which shape has the most connections?',
  'From now on, circles are orange',
  'Check is above Process',
  'Rename Done to End',
  'Arrange everything in a circle',
  'Describe the diagram',
  '@g1 command action=create shape=star color=gold name=Gem position=center'
];
function renderExamples() {
  return `<h3 class="sub">Send one sentence</h3>
  <div class="quick">${QUICK.map(q => `<button type="button" data-quick="${escH(q)}">${escH(q.startsWith('@') ? 'SOP Lang: ' + q : q)}</button>`).join('')}</div>
  <h3 class="sub">Play a scenario</h3>
  <p class="intro">A scenario is a script of messages. It is drawn in a new area next to what is already on the canvas; nothing is erased.</p>
  <div class="opts"><label for="sc-delay">Pause between messages</label><select id="sc-delay"><option value="0">none</option><option value="400" selected>0.4 s</option><option value="1000">1 s</option><option value="2000">2 s</option></select></div>
  <div class="sc-list">${SCENARIOS.map(sc => `<article class="sc"><header><h4>${escH(sc.title)}</h4><span class="len">${sc.size} · ${sc.turns.length} message${sc.turns.length === 1 ? '' : 's'}</span></header><p>${escH(sc.blurb)}</p><div class="row2"><button type="button" class="btn solid" data-sc="${sc.id}" data-how="play">Play</button><button type="button" class="btn" data-sc="${sc.id}" data-how="step">Step through</button><button type="button" class="btn" data-sc="${sc.id}" data-how="edit">Edit a copy</button></div></article>`).join('')}</div>
  <h3 class="sub">Your own script</h3>
  <p class="intro">One message per line. Lines starting with <code>#</code> are comments; lines starting with <code>@</code> are SOP Lang, sent to the engine as they are.</p>
  <textarea id="sc-text" rows="7" spellcheck="false" placeholder="# My diagram&#10;Draw a blue circle named Hub in the center.&#10;Add a red square named Node1 left of Hub and connect Hub to it.&#10;What is connected to Hub?"></textarea>
  <div class="row2" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px"><button type="button" class="btn solid" data-own="play">Play</button><button type="button" class="btn" data-own="step">Step through</button><label class="btn file">Load .txt<input type="file" id="sc-file" accept=".txt,.md,.sop,text/plain"></label><span class="status" id="sc-status"></span></div>`;
}
const player = { name: '', turns: [], i: 0, playing: false, stop: false, delay: 400 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const parseScript = txt => txt.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
function renamedForCanvas(turns) {
  const declared = new Set(); turns.forEach(t => (t.match(/\b(?:named|called)\s+([A-Za-z_][\w-]*)/g) || []).forEach(m => declared.add(m.split(/\s+/).pop())));
  const map = {};
  const taken = n => READERS.some(rd => rd.world.find(n));
  for (const n of declared) if (taken(n)) { let k = 2; while (taken(n + k) || declared.has(n + k)) k++; map[n] = n + k; }
  const keys = Object.keys(map); if (!keys.length) return { turns, map };
  const re = new RegExp(`\\b(${keys.join('|')})\\b`, 'g');
  return { turns: turns.map(t => t.replace(re, m => map[m])), map };
}
function renderPlayer() {
  const bar = $('#player');
  if (!player.turns.length) { bar.hidden = true; return; }
  bar.hidden = false;
  const done = player.i >= player.turns.length;
  bar.innerHTML = `<div class="pl-t"><b>${escH(player.name)}</b> · ${done ? 'finished' : `${player.i + 1} of ${player.turns.length}`}${done ? '' : `<span>Next: ${escH(player.turns[player.i])}</span>`}</div>
    ${done ? '' : player.playing ? '<button type="button" class="pbtn ghost" data-pl="pause">Pause</button>' : '<button type="button" class="pbtn ghost" data-pl="play">Play</button><button type="button" class="pbtn" data-pl="next">Next</button>'}
    <button type="button" class="ib" data-pl="close" aria-label="Close player"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
}
async function playRest() {
  if (player.playing) return; player.playing = true; player.stop = false; renderPlayer();
  while (player.i < player.turns.length && !player.stop) { const t = player.turns[player.i++]; renderPlayer(); await submit(t); await sleep(player.delay); }
  player.playing = false; renderPlayer();
}
async function startScript(name, turns, how) {
  if (!turns.length) return;
  player.delay = +(($('#sc-delay') || {}).value || 400);
  player.stop = true; await queue; player.playing = false;
  closeSheet();
  const fixed = renamedForCanvas(turns);
  for (const rd of READERS) {   // every reader's drawing gets the new area
    const w = rd.world;
    if (w.state.shapes.length) { const before = w.snapshot(); w.newFrame(name); w.commit(before); }
    else { w.state.frame = { x: 0, y: 0 }; w.state.frames = [{ x: 0, y: 0, title: name }]; }
    rd.focusCell = Object.assign({}, w.state.frame);
  }
  const ren = Object.entries(fixed.map).map(([a, b]) => `${a} → ${b}`);
  sysNote(`Scenario: ${name}` + (ren.length ? ` · renamed ${ren.join(', ')} to avoid clashes` : ''));
  renderCanvas();
  Object.assign(player, { name, turns: fixed.turns, i: 0 });
  renderPlayer();
  if (how === 'play') playRest();
}
$('#player').addEventListener('click', async ev => {
  const b = ev.target.closest('[data-pl]'); if (!b) return;
  const a = b.dataset.pl;
  if (a === 'next' && player.i < player.turns.length && !player.playing) { const t = player.turns[player.i++]; renderPlayer(); await submit(t); renderPlayer(); }
  if (a === 'play') playRest();
  if (a === 'pause') player.stop = true;
  if (a === 'close') { player.stop = true; player.turns = []; renderPlayer(); }
});

/* ---------------- formalizers: rules, VSS, neural ---------------- */
let vssState = 'idle', vssInfo = null, vssError = null, neuralBytes = 0, neuralLoadMs = 0;
// neural: 'checking' (is it published? in the cache?), 'loading', 'ready', 'unpublished' (our model is not on this site), 'failed'
let nState = 'checking', nError = null, nProg = { L: 0, T: 0 }, nFromCache = false, nToken = 0;
const VSS_HINT = 38.0e6;   // the composer's files (7 worlds, cutters), measured 2026-11-02; the loaded size is measured again in the page
const RULES_BYTES_INLINE = (() => { try { return [...document.scripts].filter(s => !s.src && /SOPKit/.test(s.textContent.slice(0, 400))).reduce((a, s) => a + s.textContent.length, 0); } catch (e) { return 0; } })();
const rulesBytes = () => { try { const e = performance.getEntriesByType('resource').find(r => /\/js\/logic\.js$/.test(r.name)); return e && e.decodedBodySize ? e.decodedBodySize : RULES_BYTES_INLINE; } catch (e) { return RULES_BYTES_INLINE; } };
const mb = b => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : (b / 1e3).toFixed(0) + ' KB';
const mb0 = b => Math.round(b / 1e6) + ' MB';

/* a reader that finishes loading before it has read anything starts from the Rules drawing */
function copyDrawing(src, dst) {
  const c = x => JSON.parse(JSON.stringify(x));
  dst.world.restore(src.world.state); dst.world.undoStack = c(src.world.undoStack); dst.world.redoStack = c(src.world.redoStack);
  dst.last = src.last.slice(); dst.focusCell = src.focusCell && Object.assign({}, src.focusCell); dst.pending = null;
}
function adoptRules(rd) { queue = queue.then(() => { if (!rd.reads) { copyDrawing(RD.rules, rd); if (rd === cur) renderCanvas(); } updateTabs(); renderSopBar(); }); return queue; }
function alignDrawings() {
  queue = queue.then(() => {
    const src = cur, to = READERS.filter(rd => rd !== src && isReady(rd));
    for (const rd of to) copyDrawing(src, rd);
    sysNote(`Drawings aligned: ${to.map(rd => rd.label).join(' and ') || 'no other reader'} now ${to.length > 1 ? 'have' : 'has'} the ${src.label} drawing and its undo history.`);
    renderCanvas(); updateTabs(); renderSopBar();
  });
}
/* what a drawing shows (shapes, links, rules), independent of ids and counters */
function sig(w) {
  const S = w.state;
  return JSON.stringify([S.shapes.map(s => [s.name, s.shape, s.color, s.size, s.x, s.y, s.label || '', s.outline || ''].join('|')).sort(),
    S.edges.map(e => [e.from, e.to, e.style, e.arrow, e.label || '', e.color || ''].join('|')).sort(), S.rules.map(r => [r.shape, r.size, r.color, r.outline].join('|')).sort()]);
}
const differs = rd => rd !== cur && isReady(rd) && isReady(cur) && sig(rd.world) !== sig(cur.world);

/* ---------------- reader tabs, SOP bar, loading card ---------------- */
const rtabs = $('#rtabs');
function tabTitle(rd) {
  if (!isReady(rd)) return `${rd.label}: ${offText(rd).replace(/, did not read this$/, '')}`;
  return differs(rd) ? `${rd.label}: this drawing differs from the ${cur.label} drawing` : `${rd.label}: show this reader’s drawing`;
}
function updateTabs() {
  renderSub();
  rtabs.innerHTML = READERS.map(rd => `<button type="button" role="tab" class="rtab${isReady(rd) ? '' : ' off'}" data-rtab="${rd.id}" aria-selected="${rd === cur}" title="${escH(tabTitle(rd))}">${escH(rd.label)}${differs(rd) ? `<i class="dot" aria-label="differs from ${escH(cur.label)}"></i>` : ''}${!isReady(rd) && (rd.id === 'vss' ? vssState === 'loading' : nState === 'loading' || nState === 'checking') ? '<i class="spin" aria-hidden="true"></i>' : ''}</button>`).join('');
}
function setActive(id) {
  if (!RD[id] || drag) return;
  cur = RD[id]; world = cur.world; hl = { shapes: new Set(), edges: new Set() }; clearTimeout(hlTimer);
  renderCanvas(); updateTabs(); renderCard(); renderSopBar();
}
rtabs.addEventListener('click', ev => { const b = ev.target.closest('[data-rtab]'); if (b) setActive(b.dataset.rtab); });
rtabs.addEventListener('keydown', ev => {
  if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
  const i = READERS.indexOf(cur), n = READERS[(i + (ev.key === 'ArrowRight' ? 1 : READERS.length - 1)) % READERS.length];
  setActive(n.id); const b = rtabs.querySelector(`[data-rtab="${n.id}"]`); if (b) b.focus();
});
/* the align tool: shown when another loaded reader's drawing differs from the one on screen; copies this drawing to them */
function renderSopBar() {
  const b = $('#align-btn'); if (!b) return;
  b.hidden = !READERS.some(differs);
  b.title = b.ariaLabel = `Copy this ${cur.label} drawing and its undo history to the other tabs`;
}
$('#align-btn').addEventListener('click', alignDrawings);
function renderCard() {
  const c = $('#rcard');
  if (cur.id === 'rules' || isReady(cur) || sub !== 'drawing') { c.hidden = true; return; }
  c.hidden = false;
  c.className = 'rcard' + (cur.id === 'neural' && nState === 'unpublished' ? ' small' : '');
  c.innerHTML = cur.id === 'vss' ? `<b>VSS reader</b>${vssState === 'failed' ? errHTML(vssError) : `<p>Loading the 7 micro-worlds from this site (about ${mb0(VSS_HINT)})…</p>`}`
    : `<b>Neural reader</b>${neuralBoxHTML()}`;
}

/* ---------------- VSS: loads by itself when the page opens (same site) ---------------- */
async function ensureVSS(announce) {
  if (vssState === 'ready') return true;
  if (vssState === 'loading') { while (vssState === 'loading') await sleep(100); return vssState === 'ready'; }
  vssState = 'loading'; refreshReaders();
  try {
    if (!window.VSSFormalizer) await import(new URL('js/vss-formalizer.js', document.baseURI).href);
    await window.VSSFormalizer.loadComposerAt(); vssInfo = window.VSSFormalizer.composerInfo();
    vssState = 'ready'; vssError = null;
    const fresh = !RD.vss.reads;
    if (announce !== false) sysNote((vssInfo.composer ? `VSS ready: ${vssInfo.worlds.length} micro-worlds, ${mb(vssInfo.bytes)}, loaded in ${(vssInfo.loadMs / 1000).toFixed(1)} s.`
      : `VSS model ready: ${mb(vssInfo.bytes)}, D ${vssInfo.D}, loaded in ${(vssInfo.loadMs / 1000).toFixed(1)} s.`) + (fresh ? ' It starts from the Rules drawing.' : ''));
    adoptRules(RD.vss);
  } catch (e) { vssState = 'failed'; vssError = e; sysNote('The VSS reader could not be loaded: ' + (e && e.message || e)); }
  refreshReaders(); return vssState === 'ready';
}

/* ---------------- Neural: our model (SOP-BERT, NeuralKit.modelsFor) loads by itself when the page opens, like VSS ---------------- */
let nStatus = null;   // NeuralKit.status(): is our model published on this site
/** the neural model(s) this page loads, by name: "SOP-BERT" (one model; the earlier pair joined with +) */
const neuralNames = () => { try { return NeuralKit.modelsFor().map(id => NeuralKit.NAMES[id] || id); } catch (e) { return []; } };
const nBytesHint = () => NeuralKit.modelsFor().reduce((a, id) => a + (NeuralKit.bytesOf(id) || 0), 0);
function errHTML(e) {
  if (!e) return '';
  const msg = String(e.message || e);
  return `<div class="errt">${escH(msg)}</div>${e.files && e.files.length ? `<div class="note">Files still loading when it failed: ${e.files.map(u => `<code>${escH(u)}</code>`).join(', ')}</div>` : e.url && !msg.includes(e.url) ? `<div class="note">File: <code>${escH(e.url)}</code></div>` : ''}${e.network ? '<div class="note">This looks like a network failure (this site or the transformers.js library on cdn.jsdelivr.net could not be reached).</div>' : ''}`;
}
function progText() { return nFromCache ? 'Loading from this browser’s cache…' : nProg.T ? `Downloading ${(nProg.L / 1e6).toFixed(0)} of ${(nProg.T / 1e6).toFixed(0)} MB…` : 'Starting the download…'; }
function unpublishedHTML() { return `<p>The neural model is not published yet.</p>${nStatus && nStatus.missing.length ? `<div class="note">Not on this site: ${nStatus.missing.map(m => `<code>${escH(m)}</code>`).join(', ')}</div>` : ''}`; }
function neuralBoxHTML() {
  if (nState === 'checking') return '<p>Checking whether the neural model is published and in this browser’s cache…</p>';
  if (nState === 'unpublished') return unpublishedHTML();
  if (nState === 'loading') return `<p class="nprog-t">${escH(progText())}</p><div class="prog"><div style="width:${nProg.T ? (nProg.L / nProg.T * 100).toFixed(1) : 0}%"></div></div>`;
  if (nState === 'failed') return `<p>The neural model could not be loaded:</p>${errHTML(nError)}<div class="acts"><button type="button" class="btn solid" data-nact="retry">Try again</button></div>`;
  return `<p>Ready: ${escH(neuralNames().join(' + '))} on the CPU (WASM, ${escH(models.dtypeText || '8-bit files')}), ${mb(neuralBytes)}, loaded in ${(neuralLoadMs / 1000).toFixed(1)} s${nFromCache ? ' from the browser cache' : ''}.</p>`;
}
let nRaf = 0;
function refreshReaders() {   // every place that shows a reader's state
  updateTabs(); renderCard(); setStatus(idleStatus());
  const box = $('#nm-box'); if (box) box.innerHTML = neuralBoxHTML();
}
/** when the page opens: is our model published? then it loads (from the browser cache when it is there) */
async function checkNeural() {
  const tok = ++nToken; models = null; neural.setModels(null); nState = 'checking'; nError = null; refreshReaders();
  nStatus = await NeuralKit.status();
  if (tok !== nToken) return;
  if (sub === 'settings' && cur.id === 'neural') renderSub();   // the sizes and the model facts are known now
  if (nStatus.error) { nState = 'failed'; nError = Object.assign(new Error(nStatus.error), { network: true }); refreshReaders(); return; }
  if (!nStatus.published) { nState = 'unpublished'; refreshReaders(); return; }
  loadModels(await NeuralKit.cached());
}
async function loadModels(fromCache) {
  const tok = ++nToken, files = {}, t0 = performance.now(); neuralBytes = 0;
  models = null; neural.setModels(null); nState = 'loading'; nError = null; nFromCache = !!fromCache; nProg = { L: 0, T: 0 }; refreshReaders();
  try {
    const m = await NeuralKit.load(e => {
      if (tok !== nToken || e.status !== 'progress' || !e.file) return;
      files[e.name + '/' + e.file] = [e.loaded || 0, e.total || 0]; const v = Object.values(files);
      nProg = { L: v.reduce((a, x) => a + x[0], 0), T: v.reduce((a, x) => a + x[1], 0) }; neuralBytes = nProg.T;
      if (!nRaf) nRaf = requestAnimationFrame(() => { nRaf = 0; if (nState !== 'loading') return; document.querySelectorAll('.nprog-t').forEach(x => { x.textContent = progText(); }); document.querySelectorAll('.rcard .prog > div, #nm-box .prog > div').forEach(x => { x.style.width = (nProg.T ? nProg.L / nProg.T * 100 : 0).toFixed(1) + '%'; }); setStatus(`loading the neural reader ${(nProg.T ? nProg.L / nProg.T * 100 : 0).toFixed(0)}%`); });
    });
    if (tok !== nToken) return;
    neural.setStrategy('finetuned'); neural.setModels(m); models = m; nState = 'ready'; neuralLoadMs = performance.now() - t0;
    if (!neuralBytes) neuralBytes = nBytesHint();
    const fresh = !RD.neural.reads;
    sysNote(`Neural reader ready: ${neuralNames().join(' + ')} on the CPU, ${mb(neuralBytes)}${fromCache ? ' from the browser cache' : ''}, ${(neuralLoadMs / 1000).toFixed(1)} s.` + (fresh ? ' It starts from the Rules drawing.' : ''));
    adoptRules(RD.neural);
  } catch (e) {
    if (tok !== nToken) return;
    console.error(e); nState = e && e.unpublished ? 'unpublished' : 'failed'; nError = e;
    if (nState === 'failed') sysNote('The neural model could not be loaded: ' + (e && e.message || e) + (e && e.files && e.files.length ? ` (while loading ${e.files.length === 1 ? e.files[0] : e.files.length + ' files; Neural › Settings lists them'})` : ''));
  }
  refreshReaders();
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-nact]'); if (!b) return;
  if (b.dataset.nact === 'retry') loadModels(false);
});

/* ---------------- reader subtabs: Drawing | SOP | Settings ---------------- */
const SUBS = [['drawing', 'Drawing'], ['sop', 'SOP Lang'], ['settings', 'Settings']];
const subbar = $('#subtabs'), rpanel = $('#rpanel');
function renderSub() {
  subbar.innerHTML = SUBS.map(([k, l]) => `<button type="button" role="tab" class="subtab" data-sub="${k}" aria-selected="${k === sub}">${l}</button>`).join('') + `<span class="of">${escH(cur.label)} reader</span>`;
  const draw = sub === 'drawing';
  $('#view-btn').hidden = !draw; $('#readout').hidden = !draw;
  if (draw) { rpanel.hidden = true; rpanel.innerHTML = ''; return; }
  const top = rpanel.hidden ? 0 : rpanel.scrollTop;
  rpanel.hidden = false;
  rpanel.innerHTML = sub === 'sop' ? renderWorld(cur) : renderReaderSettings(cur);
  rpanel.scrollTop = top;
}
function setSub(k) { if (k === sub || !SUBS.some(x => x[0] === k)) return; sub = k; renderSub(); renderCard(); if (k === 'drawing') renderCanvas(); }
subbar.addEventListener('click', ev => { const b = ev.target.closest('[data-sub]'); if (b) setSub(b.dataset.sub); });
rpanel.addEventListener('click', ev => { const h = ev.target.closest('[data-help]'); if (h) { openHelp(h.dataset.help); return; } const b = ev.target.closest('[data-open]'); if (b) openSheet('settings', b.dataset.open); });
function vssStatusHTML() {
  return escH(vssState === 'ready' ? (vssInfo.composer ? `Ready: ${vssInfo.worlds.length} micro-worlds, ${mb(vssInfo.bytes)}, loaded in ${(vssInfo.loadMs / 1000).toFixed(1)} s.`
    : `Ready: D ${vssInfo.D}, ${vssInfo.bits || 8}-bit route book, ${mb(vssInfo.bytes)}, loaded in ${(vssInfo.loadMs / 1000).toFixed(1)} s.`) : vssState === 'failed' ? 'Failed: ' + (vssError && vssError.message || vssError) : `Loading (about ${mb0(VSS_HINT)} from this site)…`);
}
/** what every reader's Settings subtab starts with: its drawing and what it has read */
function readerFacts(rd) {
  const S = rd.world.state, n = S.shapes.length, m = S.edges.length, u = rd.world.undoStack.length;
  return `<table class="kv"><tr><td>State</td><td>${escH(isReady(rd) ? 'ready' : offText(rd).replace(/, did not read this$/, '').replace(/ \(see Neural › Settings\)$/, '').replace(/; see Neural › Settings\)$/, ')'))}</td></tr><tr><td>Messages read</td><td>${rd.reads}</td></tr><tr><td>Its drawing</td><td>${n} shape${n === 1 ? '' : 's'} · ${m} link${m === 1 ? '' : 's'} · ${u} step${u === 1 ? '' : 's'} to undo</td></tr><tr><td>Requests cut by</td><td>${escH(cutLabel(cutWanted()))} (the same for every reader; ⋮ › Settings)</td></tr></table>`;
}
const sharedNote = `<p class="intro">SOP Lang (the commands every reader writes) and the engine’s capabilities are the same for all three readers. Help explains both: <button type="button" class="btn" data-help="sop-lang">SOP Lang</button> <button type="button" class="btn" data-help="capabilities">Capabilities</button> <button type="button" class="btn" data-help="architecture">How it works inside</button></p>`;
function renderReaderSettings(rd) {
  if (rd.id === 'rules') return `<h3 class="sub">Rules reader</h3>${readerFacts(rd)}
  <p class="intro">Hand-written code (<code>docs/js/logic.js</code>, ${mb(rulesBytes())}): it cuts the message into requests, finds the action by its cue words and answers the SOP Lang questions from the words around it. Nothing to download and nothing to choose; it reads every message at once.</p>${sharedNote}`;
  if (rd.id === 'vss') {
    const vrows = vssState === 'ready' && vssInfo.composer ? `<table class="kv">${vssInfo.worlds.map(w => `<tr><td><code>${escH(w.model)}</code></td><td>${escH(w.events.join(', '))}</td><td>${mb(w.bytes)}</td></tr>`).join('')}<tr><td>cutters, registry</td><td>which world reads which request</td><td>${mb(vssInfo.cutterBytes)}</td></tr></table>` : '';
    return `<h3 class="sub">VSS reader</h3>${readerFacts(rd)}<div class="actions"><span class="status" id="vss-st">${vssStatusHTML()}</span></div>
    <p class="intro">Seven small VSS readers (micro-worlds), each trained on a few actions of SOP Lang (VSA route books, no transformer). The world cutter names the worlds that could read each request (and cuts the message when the VSS cutter is the chosen cut); each of those worlds reads it, and the reading that leaves the fewest words not understood is kept (no drawing is passed to a world). A tie, and a reference such as “it” or a role left empty, go to the context filler, which fills it from the conversation and the names on the canvas when one candidate ranks first, and asks otherwise (the rule of 2026-11-01; a confidence threshold below which VSS asks instead of acting is in progress). In a world with several actions, a request without a verb (“Hub teal”) gets its action from a second cutter (the event hint). The files come from this site and load when the page opens.</p>
    <p class="intro"><button type="button" class="btn" data-help="vss-reader">How the VSS reader works</button> <button type="button" class="btn" data-help="vss-worlds">What a VSS world is</button></p>
    ${vssState === 'ready' ? '<h3 class="sub">Worlds: actions and sizes</h3>' + vrows : ''}`;
  }
  const N = NeuralKit.NAMES, A = NeuralKit.ABOUT, info = nStatus ? nStatus.info : {}, ids = NeuralKit.modelsFor();
  const size = id => { const b = NeuralKit.bytesOf(id); return b ? mb(b) : 'size not known yet'; };
  const facts = id => { const f = info[id] && info[id].facts; if (!f) return ''; const p = [f.base && `base model <code>${escH(f.base)}</code>`, f.spans && `${escH(f.spans)} annotated requests`, f.heldout && `held-out act accuracy ${(+f.heldout * 100).toFixed(1)}%`].filter(Boolean); return p.length ? ` (${p.join(', ')})` : ''; };
  const row = (label, id) => `<label>${label}</label><div>${escH(N[id] || id)} · ${size(id)}<div class="note">${escH(A[id] || '')}${facts(id)}.${info[id] ? `${info[id].readme ? ` <a href="${escH(info[id].readme)}" target="_blank" rel="noopener">README</a> ·` : ''} version <code>${escH(info[id].version)}</code>` : ''}</div></div>`;
  return `<h3 class="sub">Neural reader</h3>${readerFacts(rd)}
  <p class="intro">SOP-BERT: one DistilBERT model of ours, fine-tuned on the same annotated requests as the VSS worlds, run in this browser. In two calls per message (the cut, then all its requests at once) it reads, for every request, the action, the value of each SOP Lang key, who fills each role (a name written in the request, “it”, or a description such as “the red circle”) and the words that are names, labels and numbers; the SOP Lang wires are then assembled by the legend. It does not use the Rules reader. It carries out everything it reads; a threshold on its probabilities, below which it asks instead of acting, is in progress. Its cut head is the BERT cutter (⋮ › Settings). The files come from this site, load by themselves when the page opens, and stay in this browser’s cache.</p>
  <p class="intro"><button type="button" class="btn" data-help="neural-reader">How SOP-BERT works</button> <button type="button" class="btn" data-help="bert">What we do with BERT</button></p>
  <div class="form">
    ${ids.map((id, i) => row(ids.length > 1 ? ['Act', 'Answers'][i] || 'Model' : 'Model', id)).join('')}
    <label>Device</label><div>CPU (WASM), ${escH(NeuralKit.dtypeText())}</div>
  </div>
  <div class="nbox" id="nm-box">${neuralBoxHTML()}</div>`;
}
sbody.addEventListener('click', async ev => {
  const q = ev.target.closest('[data-quick]'); if (q) { closeSheet(); submit(q.dataset.quick); return; }
  const op = ev.target.closest('[data-open]'); if (op) { openSheet('settings', op.dataset.open); return; }
  const hp = ev.target.closest('[data-help]'); if (hp) { openHelp(hp.dataset.help); return; }
  const b = ev.target.closest('[data-sc]');
  if (b) {
    const sc = SCENARIOS.find(x => x.id === b.dataset.sc);
    if (b.dataset.how === 'edit') { const t = $('#sc-text'); t.value = `# ${sc.title}\n` + sc.turns.join('\n'); t.focus(); t.scrollIntoView({ block: 'center' }); return; }
    startScript(sc.title, sc.turns.slice(), b.dataset.how); return;
  }
  const o = ev.target.closest('[data-own]');
  if (o) { const v = $('#sc-text').value, turns = parseScript(v); if (!turns.length) { $('#sc-status').textContent = 'Write at least one line first.'; return; } startScript((v.match(/^\s*#\s*(.+)$/m) || [])[1] || 'Your script', turns, o.dataset.own); return; }
  if (ev.target.id === 'bm-run') runBench(ev.target);
  if (ev.target.id === 'bm-stop') benchStop = true;
  const fx = ev.target.closest('[data-fails]'); if (fx) { const d = document.getElementById('fails-' + fx.dataset.fails); if (d) d.hidden = !d.hidden; }
});
sbody.addEventListener('change', ev => {
  if (ev.target.name === 'cut-strategy') { const id = ev.target.value, def = VF ? VF.DEFAULT_CUT : null; cutPick = id === def ? null : id; store.set(CUT_KEY, cutPick); sysNote(`Requests are now cut by the ${cutLabel(id)}${cutWhyNot(id) ? ` (until it is available, by the Rules segmenter: ${cutWhyNot(id)})` : ''}; every reader reads them.`); if (sub === 'settings') renderSub(); return; }
  if (ev.target.id === 'spell-on') { spellEnabled = ev.target.checked; store.set(SPELL_OFF, spellEnabled ? null : '1'); sysNote(`Spelling check ${spellEnabled ? 'on' : 'off'}.`); return; }
  if (ev.target.id === 'sc-file' && ev.target.files[0]) {
    const f = ev.target.files[0], rd = new FileReader();
    rd.onload = () => { $('#sc-text').value = String(rd.result); $('#sc-status').textContent = `Loaded ${f.name}: ${parseScript(String(rd.result)).length} messages.`; };
    rd.onerror = () => { $('#sc-status').textContent = `Couldn't read ${f.name}.`; };
    rd.readAsText(f); ev.target.value = '';
  }
  const pl = ev.target.closest('[data-plug]');
  if (pl) { setPlug(pl.dataset.plug, pl.checked); sbody.innerHTML = renderPlugins(); }
});

/* ---------------- benchmark: every reader on the same labelled sentences ---------------- */
let benchStop = false, benchSets = null, benchLast = null, benchCut = null;
async function benchIndex() { if (!benchSets) { const r = await fetch(new URL('bench/index.json', document.baseURI)); benchSets = (await r.json()).sets; } return benchSets; }
function renderBench() {
  const sets = benchSets || [];
  const fz = [['rules', 'Rules', true], ['vss', 'VSS', vssState !== 'failed'], ['neural', 'Neural', !!models]];
  return `<p class="intro">Every reader reads the same labelled sentences against the same gold wires, cut into requests by the ${escH(cutLabel(cutWanted()))} (⋮ › Settings). A message counts when its wire type and every labelled answer match (descriptions are compared by what they describe). Speed is measured here, in this browser, per message, after the model has loaded.</p>
  <h3 class="sub">Test sets</h3>
  ${sets.length ? sets.map(s => `<label class="ck" style="display:flex;margin:4px 0"><input type="checkbox" data-bset="${s.id}" ${['blind', 'broad', 'new_identities'].includes(s.id) ? 'checked' : ''}> ${escH(s.title)} <span class="status">&nbsp;· ${s.n}</span></label>`).join('') : '<p class="intro">Loading the test sets…</p>'}
  <div class="opts" style="margin-top:8px"><label for="bm-limit">Sentences per generated set</label><select id="bm-limit"><option value="50">50</option><option value="100" selected>100</option><option value="300">300</option></select></div>
  <h3 class="sub">Readers</h3>
  ${fz.map(([k, l, ok]) => `<label class="ck" style="display:flex;margin:4px 0"><input type="checkbox" data-bfz="${k}" ${ok ? 'checked' : ''}> ${l}${k === 'neural' && !models ? ' <span class="status">&nbsp;(not loaded yet: see Neural › Settings)</span>' : ''}</label>`).join('')}
  <div class="actions" style="margin-top:10px"><button type="button" class="btn solid" id="bm-run">Run benchmark</button><button type="button" class="btn" id="bm-stop">Stop</button><span class="status" id="bm-status"></span></div>
  <div id="bm-out">${benchLast || ''}</div>`;
}
const pctl = (xs, p) => { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function runBench(btn) {
  benchStop = false; btn.disabled = true;
  const stat = () => $('#bm-status'), say = t => { const s = stat(); if (s) s.textContent = t; };
  const setIds = [...document.querySelectorAll('[data-bset]')].filter(x => x.checked).map(x => x.dataset.bset);
  const fzs = [...document.querySelectorAll('[data-bfz]')].filter(x => x.checked).map(x => x.dataset.bfz);
  const limit = +($('#bm-limit') || { value: 100 }).value;
  if (fzs.includes('vss') && !(await ensureVSS(false))) fzs.splice(fzs.indexOf('vss'), 1);
  if (fzs.includes('neural') && !models) fzs.splice(fzs.indexOf('neural'), 1);
  const res = {}; for (const f of fzs) res[f] = { sets: {}, times: [], fails: [] };
  await vfP; const cst = cutWhyNot(cutWanted()) ? 'rules' : cutWanted();   // every reader reads the units of one cut per sentence (the setting)
  benchCut = cst;
  for (const id of setIds) {
    const meta = benchSets.find(s => s.id === id);
    let rows = await (await fetch(new URL(`bench/${id}.json`, document.baseURI))).json();
    if (!['hand', 'blind', 'broad'].includes(id)) rows = rows.slice(0, limit);
    for (const f of fzs) res[f].sets[id] = { ok: 0, n: 0, keys: 0, kok: 0 };
    for (let i = 0; i < rows.length && !benchStop; i++) {
      const r = rows[i], ctx = { names: r.names, last: [] };
      let units = null; try { units = VF ? await VF.cut(r.text, ctx, cst, { rules: sys, neural: NeuralKit }) : sys.cut(r.text, ctx); } catch (e) { units = sys.cut(r.text, ctx); }
      for (const f of fzs) {
        const t0 = performance.now(); let nodes = [];
        try {
          if (f === 'rules') nodes = (cst === 'rules' ? sys.formalize(r.text, ctx) : sys.formalize(r.text, ctx, { units })).nodes;
          else if (f === 'vss') nodes = (await window.VSSFormalizer.formalize(r.text, ctx, sys.formalize, Object.assign({}, VSS_OPTS, { units }))).nodes;
          else nodes = (await neural.formalize(r.text, ctx, { units })).nodes;
        } catch (e) { nodes = []; }
        const dt = performance.now() - t0; res[f].times.push(dt);
        const sc = BenchCanon.score(nodes, r), S = res[f].sets[id]; S.n++; if (sc.ok) S.ok++;
        for (const [k, p] of Object.entries(sc.per)) { if (k === '_type') continue; S.keys++; if (p.ok) S.kok++; }
        if (!sc.ok && res[f].fails.length < 400) res[f].fails.push({ set: id, text: r.text, miss: Object.entries(sc.per).filter(([, p]) => !p.ok).map(([k, p]) => `${k === '_type' ? 'type' : k}: ${p.got} (want ${p.want})`).join('; ') });
      }
      if (i % 5 === 0) { say(`${meta.title}: ${i + 1} of ${rows.length}`); await sleep(0); }
    }
    if (benchStop) break;
  }
  const size = { rules: rulesBytes(), vss: vssInfo ? vssInfo.bytes : 0, neural: neuralBytes };
  const load = { rules: 0, vss: vssInfo ? vssInfo.loadMs : 0, neural: neuralLoadMs };
  const label = { rules: 'Rules', vss: vssInfo && vssInfo.composer ? `VSS (${vssInfo.worlds.length} micro-worlds)` : `VSS (D ${vssInfo ? vssInfo.D : '?'})`, neural: models ? `Neural (${neuralNames().join(' + ')})` : 'Neural' };
  const sets = setIds.filter(id => fzs.some(f => res[f].sets[id] && res[f].sets[id].n));
  const cell = S => S && S.n ? `<b>${(S.ok / S.n * 100).toFixed(0)}%</b> <span class="why">${S.ok}/${S.n} · answers ${(S.kok / Math.max(1, S.keys) * 100).toFixed(0)}%</span>` : '–';
  const html = `<h3 class="sub">Results</h3><p class="intro">Every reader read the requests cut by the ${escH(cutLabel(benchCut))} (⋮ › Settings); the times are the reading only.</p><div class="tbl"><table class="bench"><thead><tr><th>reader</th>${sets.map(id => `<th>${escH(benchSets.find(s => s.id === id).title.split(' (')[0])}</th>`).join('')}<th>model size</th><th>load</th><th>ms / message (median · p95)</th></tr></thead><tbody>
    ${fzs.map(f => `<tr><td><b>${escH(label[f])}</b></td>${sets.map(id => `<td>${cell(res[f].sets[id])}</td>`).join('')}<td>${f === 'rules' ? mb(size[f]) + ' <span class="why">code</span>' : mb(size[f])}</td><td>${f === 'rules' ? '–' : (load[f] / 1000).toFixed(1) + ' s'}</td><td>${pctl(res[f].times, 0.5).toFixed(1)} · ${pctl(res[f].times, 0.95).toFixed(1)}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="intro" style="margin-top:8px">The generated sets (seen, new identities, held-out formulations) come from templates written by the author of the rules, with the rules’ own words, so they favour the rules; the VSS worlds and the neural model are trained on messages written by LLM agents, not on these templates. The blind paraphrases and the broad set were written before any reader was run on them and no reader was tuned on them afterwards; their author also wrote the rules, which favours the rules.</p>
  ${fzs.map(f => `<div class="actions"><button type="button" class="btn" data-fails="${f}">${escH(label[f])}: ${res[f].fails.length} misread message${res[f].fails.length === 1 ? '' : 's'}</button></div><div id="fails-${f}" hidden><div class="tbl"><table class="bench"><tbody>${res[f].fails.map(x => `<tr><td>${escH(x.text)}<div class="why">${escH(x.set)} · ${escH(x.miss)}</div></td></tr>`).join('')}</tbody></table></div></div>`).join('')}`;
  benchLast = html; btn.disabled = false;
  const out = $('#bm-out'); if (out) out.innerHTML = html;
  say(benchStop ? 'Stopped.' : `Done: ${fzs.length} reader${fzs.length > 1 ? 's' : ''} on ${sets.length} set${sets.length > 1 ? 's' : ''}.`);
}
/* ---------------- Help overlay and settings (docs/js/help.js, docs.js; their lists are read from the legend) ---------------- */
/** what the help pages need: the engine (legend, plugins), the canvas drawing code for their small drawings, and facts to quote */
function helpEnv() {
  let nb = neuralBytes; try { if (!nb) nb = nBytesHint(); } catch (e) { }
  const def = VF ? VF.DEFAULT_CUT : 'vss';
  return { K, engine, drawShape, drawEdge, drawGroups, startMessages: START, vssBytes: vssInfo && vssInfo.bytes ? vssInfo.bytes : VSS_HINT, neuralBytes: nb,
    neuralModels: neuralNames(), cut: { current: cutLabel(cutWanted()), def: cutLabel(def) } };
}
/** a capability switch (Settings › Capabilities or Help › Capabilities): the same for every reader */
function setPlug(name, on) {
  for (const rd of READERS) rd.engine.plugin(name).enabled = on;
  const p = engine.plugin(name); sysNote(`${(HelpKit.CAPS[p.name] || p).t || p.title} switched ${p.enabled ? 'on' : 'off'} for every reader`);
}
/** ⋮ › Settings: the two steps that act before every reader */
const renderSettings = () => `<p class="intro">These act before every reader: the spell checker, then the cut into requests. What each one is: <button type="button" class="btn" data-help="spelling">Spell checker</button> <button type="button" class="btn" data-help="cutting">One cut for all readers</button></p>` + cutHelpHTML() + spellHelpHTML()
  + `<div class="help"><h3 class="sub">Help</h3><p class="note">How to use the editor, SOP Lang, the concepts and the architecture are in Help: the <b>?</b> button above the drawing. <button type="button" class="btn" data-help="start">Open Help</button></p></div>`;
/** the cut setting, in ⋮ › Settings (it acts before every reader, so it is not one reader's setting) */
function cutHelpHTML() {
  const want = cutWanted(), def = VF ? VF.DEFAULT_CUT : null;
  const opt = s => { const why = cutWhyNot(s.id), off = s.id === 'bert' && why;   // VSS can be chosen while it loads (the Rules segmenter cuts until then)
    return `<label style="display:flex;gap:8px;align-items:flex-start;margin:0 0 6px;cursor:${off ? 'default' : 'pointer'}${off ? ';opacity:.6' : ''}"><input type="radio" name="cut-strategy" value="${escH(s.id)}" ${s.id === want ? 'checked' : ''} ${off ? 'disabled' : ''}> <span><b>${escH(s.label)}</b>${s.id === def ? ' (default)' : ''}${s.about ? `: ${escH(s.about)}` : ''}${why ? `<br><span class="note">Not available now: ${escH(why)}.</span>` : ''}</span></label>`; };
  return `<div class="help"><h3 class="sub">Cutting into requests</h3>
  <p class="note">A message is cut into requests once, and Rules, VSS and Neural all read the same requests; the tabs differ only in how each reader reads a request. <b>details</b> under a reply lists the requests and the time the cut took.</p>
  ${cutStrategies().map(opt).join('')}</div>`;
}
/** the spell checker's switch, in ⋮ › Settings (it acts before every reader, so it is not one reader's setting) */
function spellHelpHTML() {
  const P = speller && speller.params;
  const about = P ? `A word that no reader knows is replaced by the most similar known word when the similarity of their letter groups (VSA character n-grams, D ${P.D}) is at least ${P.threshold} and ${P.margin} above the next word. Known words: ${speller.size()} (the VSS worlds’ words, the legend’s values and cue words) and the names on the canvas; ${speller.keepSize()} more words of the training messages are left alone. Never changed: quoted text, numbers, words of one or two letters, the word after “named” or “called”, and capitalised names that are not on the canvas.`
    : 'The spell checker’s vocabulary is not loaded (yet).';
  return `<div class="help"><h3 class="sub">Spelling</h3>
  <label style="display:flex;gap:8px;align-items:flex-start;margin:0 0 6px;cursor:pointer"><input type="checkbox" id="spell-on" ${spellEnabled ? 'checked' : ''}> <span>Correct typos before the readers read a message (“gree circle” → “green circle”). Every reader reads the corrected text; your message shows what was changed, and <b>details</b> shows the typed and the corrected text.</span></label>
  <p class="note">${escH(about)}</p></div>`;
}
const renderPlugins = () => HelpKit.capSwitches(helpEnv());
function renderWorld(rd) {
  const w = rd.world, S = w.state, lines = [];
  for (const s of S.shapes) lines.push(hlNode({ id: s.name, type: 'shape', args: Object.assign({ shape: s.shape, size: K.sizeName(s.size), color: s.color }, s.outline ? { outline: s.outline } : {}, s.label ? { label: s.label } : {}, { at: [s.x, s.y] }) }));
  for (const e of S.edges) lines.push(hlNode({ id: e.id, type: 'edge', args: Object.assign({ from: { ref: e.from }, to: { ref: e.to }, style: e.style, arrow: e.arrow }, e.color ? { color: e.color } : {}, e.label ? { label: e.label } : {}) }));
  for (const r of S.rules) { const a = {}; ['shape', 'size', 'color', 'outline'].forEach(k => { if (r[k]) a[k] = r[k]; }); lines.push(hlNode({ id: r.id, type: 'rule', args: a })); }
  for (const g of S.groups || []) lines.push(hlNode({ id: g.name, type: 'group', args: { members: g.members.map(m => ({ ref: m })) } }));
  if (!lines.length) lines.push('<span class="cm"># empty</span>');
  return `${isReady(rd) ? '' : `<p class="intro">This reader is ${escH(offText(rd).replace(/, did not read this$/, '').replace(/ \(see Neural › Settings\)$/, ''))}; its Settings subtab shows how to load it.</p>`}<p class="intro">The ${escH(rd.label)} reader’s drawing, written back as SOP Lang wires. This is what a backend such as Datalog, Prolog or Z3 would receive after lowering. ${w.undoStack.length} step${w.undoStack.length === 1 ? '' : 's'} can be undone.</p><pre class="sop">${lines.join('\n')}</pre>`;
}

/* ---------------- composer ---------------- */
const ta = $('#say');
const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(128, ta.scrollHeight) + 'px'; };
ta.addEventListener('input', grow);
// the messages typed in this box, oldest first (this page only, like a shell's history). ArrowUp on the first line of the box goes to the
// previous one, ArrowDown on the last line to the next one and, after the newest, back to the draft that was being typed. A recalled
// message can be edited; the edit is kept while walking the history, until a message is sent.
const sent = [], edits = new Map();
let histPos = 0, draft = '';
function sendTyped() {
  const v = ta.value; if (!v.trim()) return;
  if (sent[sent.length - 1] !== v) sent.push(v);
  histPos = sent.length; draft = ''; edits.clear();
  ta.value = ''; grow(); submit(v);
}
function recall(to) {
  if (to < 0 || to > sent.length || to === histPos) return false;
  if (histPos === sent.length) draft = ta.value; else if (ta.value !== sent[histPos]) edits.set(histPos, ta.value); else edits.delete(histPos);
  histPos = to;
  ta.value = to === sent.length ? draft : (edits.has(to) ? edits.get(to) : sent[to]);
  grow(); const n = ta.value.length; ta.setSelectionRange(n, n);
  return true;
}
const touchFirst = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
ta.addEventListener('keydown', ev => {
  if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.isComposing && ta.selectionStart === ta.selectionEnd) {
    const v = ta.value, at = ta.selectionStart;
    const firstLine = v.lastIndexOf('\n', at - 1) === -1, lastLine = v.indexOf('\n', at) === -1;
    if (ev.key === 'ArrowUp' && firstLine && recall(histPos - 1)) ev.preventDefault();
    else if (ev.key === 'ArrowDown' && lastLine && recall(histPos + 1)) ev.preventDefault();
    return;
  }
  if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing || ev.keyCode === 229) return;
  if (touchFirst && !ev.ctrlKey && !ev.metaKey) return; // phone keyboards: Enter adds a line, the button sends
  ev.preventDefault(); sendTyped();
});
const sendBtn = $('#send-btn');
sendBtn.addEventListener('pointerdown', ev => ev.preventDefault()); // keep the keyboard open
sendBtn.addEventListener('click', () => { sendTyped(); ta.focus({ preventScroll: true }); });

/* Fit the app to the visible area, so the composer stays above the on-screen keyboard. */
const appEl = document.querySelector('.app');
function fitViewport() {
  const vv = window.visualViewport; if (!vv) return;
  const full = window.innerHeight, h = Math.round(vv.height);
  appEl.style.setProperty('--app-h', h + 'px');
  appEl.classList.toggle('kb', full - h > 120 && window.matchMedia('(max-width: 860px)').matches);
  if (vv.offsetTop) window.scrollTo(0, 0);
  msgs.scrollTop = msgs.scrollHeight;
}
if (window.visualViewport) { visualViewport.addEventListener('resize', fitViewport); visualViewport.addEventListener('scroll', fitViewport); fitViewport(); }
// the toolbar buttons are not language: their SOP wires go straight to every loaded reader (each undoes or clears its own drawing)
document.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => submit(b.dataset.say, b.dataset.sop)));
$('#view-btn').addEventListener('click', () => { const narrow = svg.clientWidth < 640, focused = view === 'focus' || (view === 'auto' && narrow); view = focused ? 'all' : 'focus'; renderCanvas(); });
window.addEventListener('resize', () => { if (!drag) renderCanvas(); });

/* ---------------- start ---------------- */
updateTabs(); renderCanvas(); setStatus(idleStatus());
botBubble({ text: 'Hi! Tell me what to draw, change or connect, or ask me about the drawing. Three readers (Rules, VSS, Neural) read every message, each into its own drawing; the tabs above the canvas switch between them. Tap + for examples and whole scenarios, ? for help, ⋮ for settings.' });
const START = [
  'Draw a large blue circle named Start in the top left, then add a rectangle named Process to the right of it labeled "Validate". Connect Start to Process.',
  'Add a yellow diamond named Check right of Process labeled "ok?" and connect Process to it. Put a green circle named Done below Check and link Check to Done with a dashed arrow labeled "yes".',
  'Is there a path from Start to Done?'
];
START.forEach(t => submit(t));
queue.then(() => { READERS.forEach(rd => { rd.world.undoStack = []; }); renderSopBar(); });
// the Help overlay: opened by the ? button, by a data-help button, or by a link #help/<page> (also on reload)
DocsKit.init({ env: helpEnv, say: t => submit(t), onPlug: (name, on) => { setPlug(name, on); if (!sheet.hidden && sheetTab === 'plugins') sbody.innerHTML = renderPlugins(); } });
ensureVSS();              // same site: no button, no question
checkNeural();            // our neural model loads by itself (from the browser cache when it is there)
})();
