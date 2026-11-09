/* Layout templates (SmartArt-like): a list of texts -> the shapes, free texts and links of a diagram form, with positions.
   Pure functions, no dependency on the engine (docs/js/logic.js) or the page: the engine (a later phase, design in
   training/sketch/legend_ext/LEGEND_EXT.md) calls place() / layout(), names the elements (nameElements), emits them as one wire (one undo
   step) in layer order, and groups them. Tests: training/sketch/test_templates.mjs.

   Coordinates: a box {x, y, w, h} (top-left, pixels; the canvas cell is 800 x 500). Every element is
     { id, kind: 'shape' | 'text', role, layer, shape, x, y, w, h, color, fill, label, text, index, fontSize }
   with x, y its centre. `layer` is the z-band the engine inserts it in: 0 background, 1 zone (panels, rings, tracks: may overlap and
   contain other elements), 2 item, 3 text. `role`: item (the i-th text of `items`, index i), item2 (the j-th of `items2`), title, hub
   (a centre: the title of a hub, burst, tree, sun), goal, label (a free text that shows an item's text when the item is a ring or a set),
   decor (dots, bars, hooks: no text), background, zone. `text` is the item text the element stands for (used for its name), `label` the
   text written inside the shape ('' when a separate label element shows it). `fill`: solid | light | faint (the renderer's opacity).
   Links: { from, to, style, arrow, color } between element ids.

   Guarantees (tested for every template): elements of layer >= 2 never overlap (a 2 px gap), everything lies inside the box, one element
   per item, the template's link count, and the same input gives the same output (no randomness). When the items do not fit, the sizes
   shrink step by step (factor k from 1 down to 0.5); still not fitting -> result.crowded = true (the engine then says so). */
(function (root) {
'use strict';

const FONT_PX = { tiny: 12, small: 14, medium: 18, large: 26, huge: 36 };   /* free text: font size of each size value */
const LABEL_FS = 13, CHAR = 0.56;                                             /* a label's width estimate, as the renderer's */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const textW = (s, fs) => Math.ceil(String(s == null ? '' : s).length * fs * CHAR);
/** the box of a free text of font size fs (one line) */
const textBox = (s, fs) => ({ w: textW(s, fs) + 10, h: Math.round(fs * 1.4) });
/** an item's natural width: its longest label plus padding, within [lo, hi] */
const natW = (labels, lo, hi) => clamp(Math.max(0, ...labels.map(l => textW(l, LABEL_FS))) + 26, lo, hi);

/* colour schemes: colour NAMES of the engine's palette only (logic.js COLOR_HEX) */
const SCHEMES = {
  classic: { items: ['blue', 'teal', 'green', 'gold', 'orange', 'red', 'purple'], decor: 'gray', text: 'navy', zone: 'blue' },
  warm: { items: ['red', 'orange', 'gold', 'yellow', 'pink'], decor: 'brown', text: 'brown', zone: 'orange' },
  cool: { items: ['blue', 'teal', 'cyan', 'indigo', 'navy'], decor: 'gray', text: 'navy', zone: 'cyan' },
  ocean: { items: ['navy', 'blue', 'cyan', 'teal'], decor: 'cyan', text: 'navy', zone: 'blue' },
  forest: { items: ['green', 'lime', 'teal', 'green'], decor: 'brown', text: 'green', zone: 'green' },
  earth: { items: ['brown', 'gold', 'orange', 'green', 'gray'], decor: 'brown', text: 'brown', zone: 'gold' },
  sunset: { items: ['purple', 'magenta', 'red', 'orange', 'yellow'], decor: 'orange', text: 'purple', zone: 'orange' },
  love: { items: ['red', 'pink', 'magenta', 'purple'], decor: 'pink', text: 'red', zone: 'pink' },
  calm: { items: ['teal', 'cyan', 'lime', 'blue'], decor: 'gray', text: 'teal', zone: 'cyan' },
  mono: { items: ['gray', 'black', 'navy', 'gray'], decor: 'gray', text: 'black', zone: 'gray' },
  rainbow: { items: ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'purple'], decor: 'gray', text: 'black', zone: 'gray' },
  bold: { items: ['black', 'red', 'gold', 'blue'], decor: 'black', text: 'black', zone: 'gold' }
};
/* the Rules' cue words of each scheme (legend values; the learned readers learn their own from the annotation) */
const SCHEME_CUES = {
  classic: ['default colours', 'standard colours'], warm: ['warm', 'warm colours', 'fiery'], cool: ['cool', 'cool colours', 'cold'],
  ocean: ['ocean', 'sea', 'marine', 'nautical'], forest: ['forest', 'nature', 'natural', 'leafy'], earth: ['earth', 'earthy', 'earth tones'],
  sunset: ['sunset', 'dusk'], love: ['love', 'romantic', 'valentine'], calm: ['calm', 'soft', 'pastel', 'soothing'],
  mono: ['mono', 'monochrome', 'grayscale', 'greyscale', 'black and white'], rainbow: ['rainbow', 'colourful', 'colorful', 'multicolour'],
  bold: ['bold', 'strong', 'high contrast']
};

/* ---------------------------------------------------------------- the building context ---------------------------------------------------------------- */
class Build {
  constructor(T, P, k) {
    this.T = T; this.P = P; this.k = k; this.els = []; this.links = [];
    this.pal = SCHEMES[P.scheme] || SCHEMES[T.scheme] || SCHEMES.classic;
  }
  color(i) { return this.P.color || this.pal.items[i % this.pal.items.length]; }
  add(o) { this.els.push(Object.assign({ kind: 'shape', fill: 'solid', label: '', text: '' }, o)); return o.id; }
  item(i, o) { const t = this.P.items[i]; return this.add(Object.assign({ id: 'item' + (i + 1), role: 'item', layer: 2, index: i, shape: 'rectangle', color: this.color(i), label: t, text: t }, o)); }
  item2(j, o) { const t = this.P.items2[j]; return this.add(Object.assign({ id: 'itemB' + (j + 1), role: 'item2', layer: 2, index: j, shape: 'rectangle', color: this.color(j + 3), label: t, text: t }, o)); }
  text(id, role, label, fs, x, y, o) { const b = textBox(label, fs); return this.add(Object.assign({ id, kind: 'text', role, layer: 3, shape: 'text', x, y, w: b.w, h: b.h, fontSize: fs, color: this.pal.text, label, text: label }, o)); }
  link(from, to, o) { this.links.push(Object.assign({ from, to, style: 'solid', arrow: 'forward', color: null }, o)); }
  /** a heading text at the top of the box (when there is a title and the template puts it on top); -> the box left below it */
  heading(B) {
    if (!this.P.title || this.T.title !== 'top') return B;
    const fs = Math.round(clamp(22 * Math.min(1, B.h / 300), 15, 22)), tb = textBox(this.P.title, fs);
    this.text('title', 'title', this.P.title, fs, B.x + B.w / 2, B.y + tb.h / 2);
    return { x: B.x, y: B.y + tb.h + 10, w: B.w, h: B.h - tb.h - 10 };
  }
}
const ring = (cx, cy, rx, ry, a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];

/* ---------------------------------------------------------------- the catalogue ----------------------------------------------------------------
   Each template: family (structure | emotion), what it is good for, the parameters it reads, its default colour scheme, where the title
   goes (top: a heading; centre/hub: inside the form; header: a header bar), the item count it accepts, the placeholder word of a missing
   item, the number of links it draws for n items (and m second items), its Rules cue words and one example sentence. */
const TEMPLATES = {};
const def = (name, spec) => { TEMPLATES[name] = Object.assign({ name, title: 'top', min: 1, max: 10, def: 4, uses2: false, scheme: 'classic', links: () => 0 }, spec); };

/* ======================= structure ======================= */
def('process', {
  family: 'structure', t: 'Process', good: 'steps that follow each other: a workflow, a recipe, a procedure, an onboarding flow',
  how: 'one box per item, left to right (or top to bottom with axis=vertical), joined by arrows; more items than fit on a line continue on the next line, coming back (a snake)',
  params: ['items', 'title', 'axis', 'scheme', 'color', 'size', 'place'], min: 2, max: 12, def: 4, word: 'Step', links: n => n - 1,
  cues: ['process', 'flow', 'workflow', 'procedure', 'sequence of steps', 'pipeline'], ex: 'Make a process of Plan, Build, Test and Ship',
  build(c, B) {
    const n = c.P.items.length, vert = c.P.axis === 'vertical', k = c.k, gap = 34 * k;
    const along = vert ? B.h : B.w, across = vert ? B.w : B.h;
    const w0 = natW(c.P.items, 80, 160) * k, h0 = 52 * k, len = vert ? h0 : w0;
    let per = n; while (per > 1 && per * len + (per - 1) * gap > along) per--;
    const lines = Math.ceil(n / per), cell = (along - (per - 1) * gap) / per;
    const thick = Math.min(vert ? w0 : h0, (across - (lines - 1) * gap * 1.4) / lines);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / per), q = r % 2 ? per - 1 - (i % per) : i % per;
      const a = (vert ? B.y : B.x) + q * (cell + gap) + cell / 2, b = (vert ? B.x : B.y) + across / 2 + (r - (lines - 1) / 2) * (thick + gap * 1.4);
      const w = vert ? thick : Math.min(w0, cell), h = vert ? Math.min(h0, cell) : thick;
      c.item(i, { x: vert ? b : a, y: vert ? a : b, w, h });
      if (i) c.link('item' + i, 'item' + (i + 1));
    }
  }
});
def('cycle', {
  family: 'structure', t: 'Cycle', good: 'something that repeats: a life cycle, a feedback loop, the seasons, plan-do-check-act',
  how: 'the items on a ring, clockwise from the top, each joined by an arrow to the next and the last back to the first; the title in the middle',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], title: 'centre', min: 3, max: 10, def: 4, word: 'Stage', links: n => n,
  cues: ['cycle', 'loop', 'circular process', 'lifecycle', 'life cycle', 'wheel'], ex: 'Draw a cycle of Plan, Do, Check and Act titled "PDCA"',
  build(c, B) {
    const n = c.P.items.length, k = c.k, w = natW(c.P.items, 70, 150) * k, h = 44 * k;
    const cx = B.x + B.w / 2, cy = B.y + B.h / 2, ry = B.h / 2 - h / 2, rx = Math.min(B.w / 2 - w / 2, ry * 1.6);
    for (let i = 0; i < n; i++) { const [x, y] = ring(cx, cy, rx, ry, -Math.PI / 2 + 2 * Math.PI * i / n); c.item(i, { shape: 'ellipse', x, y, w, h }); }
    for (let i = 0; i < n; i++) c.link('item' + (i + 1), 'item' + ((i + 1) % n + 1));
    if (c.P.title) c.text('title', 'title', c.P.title, 18, cx, cy);
  }
});
def('hierarchy', {
  family: 'structure', t: 'Hierarchy', good: 'who reports to whom, a family tree, a breakdown of a goal into parts, a site map',
  how: 'the first item at the top; the others below it, level by level, each under its parent (parents=, or filled level by level), joined by lines',
  params: ['items', 'parents', 'title', 'scheme', 'color', 'size', 'place'], min: 1, max: 15, def: 7, word: 'Role', links: n => n - 1,
  cues: ['hierarchy', 'org chart', 'organization chart', 'organisation chart', 'organigram', 'org tree', 'family tree', 'tree chart', 'reporting structure', 'breakdown'],
  ex: 'Draw an org chart of CEO, CTO, CFO, Dev and QA',
  build(c, B) {
    const items = c.P.items, n = items.length, k = c.k, par = parentsOf(items, c.P.parents), kids = items.map(() => []);
    par.forEach((p, i) => { if (p >= 0) kids[p].push(i); });
    const depth = items.map(() => 0); for (let i = 1; i < n; i++) depth[i] = depth[par[i]] + 1;
    const L = Math.max(...depth) + 1, slot = items.map(() => 0); let leaf = 0;
    (function walk(i) { if (!kids[i].length) { slot[i] = leaf++; return; } kids[i].forEach(walk); slot[i] = (slot[kids[i][0]] + slot[kids[i][kids[i].length - 1]]) / 2; })(0);
    const sw = B.w / leaf, h = Math.min(46 * k, (B.h - (L - 1) * 30 * k) / L), gy = L > 1 ? (B.h - L * h) / (L - 1) : 0;
    const w = Math.min(natW(items, 64, 150) * k, sw - 10);
    for (let i = 0; i < n; i++) {
      c.item(i, { x: B.x + (slot[i] + 0.5) * sw, y: B.y + h / 2 + depth[i] * (h + gy) + (L === 1 ? B.h / 2 - h / 2 : 0), w, h, color: c.color(depth[i]) });
      if (i) c.link('item' + (par[i] + 1), 'item' + (i + 1), { arrow: 'none' });
    }
  }
});
/** the parent index of each item: from parents= (the parent's text, one per item after the first), else filled level by level (the
 *  smallest branching b with 1 + b + b^2 >= n, so the tree has at most three levels) */
function parentsOf(items, parents) {
  const n = items.length, par = [-1];
  if (parents && parents.length) { for (let i = 1; i < n; i++) { const p = items.indexOf(parents[i - 1]); par.push(p >= 0 && p < i ? p : 0); } return par; }
  let b = 2; while (1 + b + b * b < n) b++;
  for (let i = 1; i < n; i++) par.push(i <= b ? 0 : 1 + Math.floor((i - b - 1) / b));
  return par;
}
def('pyramid', {
  family: 'structure', t: 'Pyramid', good: 'levels that build on each other: needs, priorities, a foundation that carries the top',
  how: 'one band per item, the first at the narrow top, each band wider than the one above',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 8, def: 4, word: 'Level', scheme: 'warm',
  cues: ['pyramid', 'layered pyramid', 'levels', 'hierarchy of needs', 'maslow'], ex: 'Make a pyramid of Vision, Strategy, Tactics and Tasks',
  build(c, B) {
    const n = c.P.items.length, gap = 6 * c.k, h = (B.h - (n - 1) * gap) / n, top = Math.max(natW(c.P.items.slice(0, 1), 60, 200), B.w * 0.26);
    for (let i = 0; i < n; i++) c.item(i, { x: B.x + B.w / 2, y: B.y + h / 2 + i * (h + gap), w: top + (B.w - top) * (n === 1 ? 1 : i / (n - 1)), h });
  }
});
def('funnel', {
  family: 'structure', t: 'Funnel', good: 'something that narrows down: a sales funnel, a hiring pipeline, filtering ideas to a decision',
  how: 'one band per item, the first at the wide top, each band narrower than the one above',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 8, def: 4, word: 'Stage', scheme: 'cool',
  cues: ['funnel', 'sales funnel', 'narrowing'], ex: 'Draw a funnel of Visitors, Leads, Trials and Customers',
  build(c, B) {
    const n = c.P.items.length, gap = 6 * c.k, h = (B.h - (n - 1) * gap) / n, low = Math.max(natW(c.P.items.slice(-1), 60, 200), B.w * 0.26);
    for (let i = 0; i < n; i++) c.item(i, { x: B.x + B.w / 2, y: B.y + h / 2 + i * (h + gap), w: B.w - (B.w - low) * (n === 1 ? 0 : i / (n - 1)), h });
  }
});
def('timeline', {
  family: 'structure', t: 'Timeline', good: 'events in time: a roadmap, a project plan, a history, milestones',
  how: 'a track with one dot per item; the items alternate above and below the track (left and right with axis=vertical), each joined to its dot',
  params: ['items', 'title', 'axis', 'scheme', 'color', 'size', 'place'], min: 2, max: 12, def: 5, word: 'Milestone', links: n => n,
  cues: ['timeline', 'time line', 'roadmap', 'milestones', 'chronology', 'schedule'], ex: 'Draw a timeline of Kickoff, Design, Build and Launch titled "2027"',
  build(c, B) {
    const n = c.P.items.length, vert = c.P.axis === 'vertical', k = c.k, d = 14 * k;
    const cx = B.x + B.w / 2, cy = B.y + B.h / 2, sp = (vert ? B.h : B.w) / n;
    c.add({ id: 'track', role: 'decor', layer: 1, shape: 'rectangle', x: cx, y: cy, w: vert ? 6 : B.w, h: vert ? B.h : 6, color: c.pal.decor });
    /* items on one side are two dots apart, so an item may be wider than the gap between dots; the first and last are pulled inside */
    const w = vert ? Math.min(natW(c.P.items, 70, 170) * k, B.w / 2 - d - 20) : Math.min(natW(c.P.items, 70, 170) * k, 1.5 * sp - 8);
    const h = vert ? Math.min(42 * k, 1.5 * sp - 8) : 42 * k, off = vert ? Math.min(B.w / 2 - w / 2, d + 30 + w / 2) : Math.min(B.h / 2 - h / 2, d + 40 * k + h / 2);
    for (let i = 0; i < n; i++) {
      const a = (vert ? B.y : B.x) + (i + 0.5) * sp, s = i % 2 ? 1 : -1, ia = vert ? clamp(a, B.y + h / 2, B.y + B.h - h / 2) : clamp(a, B.x + w / 2, B.x + B.w - w / 2);
      c.add({ id: 'dot' + (i + 1), role: 'decor', layer: 2, shape: 'circle', x: vert ? cx : a, y: vert ? a : cy, w: d, h: d, color: c.color(i) });
      c.item(i, { x: vert ? cx + s * off : ia, y: vert ? ia : cy + s * off, w, h });
      c.link('dot' + (i + 1), 'item' + (i + 1), { arrow: 'none' });
    }
  }
});
def('list', {
  family: 'structure', t: 'Titled list', good: 'a checklist, an agenda, key points under a heading',
  how: 'a header bar with the title, the items as rows below it (two columns when they do not fit in one)',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], title: 'header', min: 1, max: 14, def: 4, word: 'Point',
  cues: ['list', 'bullet list', 'checklist', 'titled list', 'agenda', 'key points'], ex: 'Make a list titled "Agenda" with Welcome, Results, Plans and Questions',
  build(c, B) {
    const n = c.P.items.length, k = c.k, gap = 8 * k, hh = c.P.title ? 46 * k : 0;
    const cols = n > 7 ? 2 : 1, rows = Math.ceil(n / cols), W = Math.min(B.w, Math.max(natW(c.P.items.concat(c.P.title || ''), 120, 360) * cols * 1.2, B.w * 0.6));
    const top = B.y + (hh ? hh + gap : 0), h = Math.min(40 * k, (B.y + B.h - top - (rows - 1) * gap) / rows), cw = (W - (cols - 1) * gap) / cols;
    if (hh) c.add({ id: 'header', role: 'title', layer: 2, shape: 'rectangle', x: B.x + B.w / 2, y: B.y + hh / 2, w: W, h: hh, color: c.pal.text, label: c.P.title, text: c.P.title });
    for (let i = 0; i < n; i++) { const col = Math.floor(i / rows), r = i % rows; c.item(i, { x: B.x + (B.w - W) / 2 + col * (cw + gap) + cw / 2, y: top + h / 2 + r * (h + gap), w: cw, h, color: c.P.color || 'white' }); }
  }
});
def('matrix', {
  family: 'structure', t: '2x2 matrix', good: 'sorting things on two axes: urgent / important, effort / impact, a SWOT',
  how: 'four quadrants, the items in reading order (top left, top right, bottom left, bottom right); items2 gives the axis names (across, then up)',
  params: ['items', 'items2', 'title', 'scheme', 'color', 'size', 'place'], min: 4, max: 4, def: 4, uses2: true, max2: 2, word: 'Quadrant',
  cues: ['matrix', '2x2', '2 by 2', 'two by two', 'quadrant', 'quadrants', 'four boxes', 'swot'], ex: 'Draw a 2x2 matrix of Strengths, Weaknesses, Opportunities and Threats titled "SWOT"',
  build(c, B) {
    const ax = c.P.items2, gap = 10 * c.k, fs = 13, lw = ax[1] ? textBox(ax[1], fs).w + 10 : 0, bh = ax[0] ? textBox(ax[0], fs).h + 8 : 0;
    const X = B.x + lw, W = B.w - lw, H = B.h - bh, w = (W - gap) / 2, h = (H - gap) / 2;
    for (let i = 0; i < 4; i++) c.item(i, { x: X + (i % 2) * (w + gap) + w / 2, y: B.y + Math.floor(i / 2) * (h + gap) + h / 2, w, h });
    if (ax[0]) c.add({ id: 'itemB1', role: 'item2', layer: 3, index: 0, kind: 'text', shape: 'text', x: X + W / 2, y: B.y + B.h - (bh - 8) / 2, w: textBox(ax[0], fs).w, h: textBox(ax[0], fs).h, fontSize: fs, color: c.pal.text, label: ax[0], text: ax[0] });
    if (ax[1]) c.add({ id: 'itemB2', role: 'item2', layer: 3, index: 1, kind: 'text', shape: 'text', x: B.x + (lw - 10) / 2, y: B.y + H / 2, w: lw - 10, h: textBox(ax[1], fs).h, fontSize: fs, color: c.pal.text, label: ax[1], text: ax[1] });
  }
});
def('target', {
  family: 'structure', t: 'Target', good: 'what matters most at the centre: a bullseye goal, circles of influence, core and periphery',
  how: 'one ring per item, the first item is the centre, each next item a wider ring around it; each ring\'s text at its top',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 6, def: 3, word: 'Ring', scheme: 'sunset',
  cues: ['target', 'bullseye', "bull's eye", 'concentric circles', 'concentric', 'rings'], ex: 'Draw a target of Core, Team, Company and Market',
  build(c, B) {
    const n = c.P.items.length, R = Math.min(B.w, B.h) / 2, cx = B.x + B.w / 2, cy = B.y + B.h / 2, band = R / n, fs = Math.round(clamp(band * 0.42, 10, 16));
    for (let i = n - 1; i >= 0; i--) { const r = R * (i + 1) / n; c.add({ id: 'item' + (i + 1), role: 'item', layer: 1, index: i, shape: 'circle', x: cx, y: cy, w: 2 * r, h: 2 * r, color: c.color(i), fill: 'light', label: '', text: c.P.items[i] }); }
    for (let i = 0; i < n; i++) { const y = i ? cy - R * (i + 0.5) / n : cy; c.text('label' + (i + 1), 'label', c.P.items[i], fs, cx, y, { index: i }); }
  }
});
def('venn', {
  family: 'structure', t: 'Venn', good: 'what two or three groups share: overlapping skills, common ground, where interests meet',
  how: 'one see-through circle per item (two or three), overlapping; each name in its own part; items2 is the text of the shared middle',
  params: ['items', 'items2', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 3, def: 2, uses2: true, max2: 1, word: 'Set', scheme: 'cool',
  cues: ['venn', 'venn diagram', 'overlapping circles', 'overlap', 'intersection'], ex: 'Draw a venn of Design, Code and Business with "Product" in the middle',
  build(c, B) {
    const m = c.P.items.length, cx = B.x + B.w / 2, fs = 14; let cs, r;
    if (m === 2) { r = Math.min(B.h / 2, B.w / 3.3); const d = r * 0.62; cs = [[cx - d, B.y + B.h / 2], [cx + d, B.y + B.h / 2]]; }
    else { r = Math.min(B.h / 2.93, B.w / 3.08); const d = r * 0.62, cy = B.y + (B.h - (1.5 * d + 2 * r)) / 2 + d + r; cs = [[cx, cy - d], [cx - d * 0.87, cy + d / 2], [cx + d * 0.87, cy + d / 2]]; }
    const gx = cs.reduce((t, p) => t + p[0], 0) / m, gy = cs.reduce((t, p) => t + p[1], 0) / m;
    cs.forEach(([x, y], i) => c.add({ id: 'item' + (i + 1), role: 'item', layer: 1, index: i, shape: 'circle', x, y, w: 2 * r, h: 2 * r, color: c.color(i), fill: 'light', label: '', text: c.P.items[i] }));
    cs.forEach(([x, y], i) => { const dx = x - gx, dy = y - gy, L = Math.hypot(dx, dy) || 1; c.text('label' + (i + 1), 'label', c.P.items[i], fs, x + dx / L * r * 0.5, y + dy / L * r * 0.5, { index: i }); });
    if (c.P.items2[0]) c.text('itemB1', 'item2', c.P.items2[0], 13, gx, gy, { index: 0 });
  }
});
def('hub', {
  family: 'structure', t: 'Hub and spokes', good: 'one centre and what surrounds it: a mind map, a team around a lead, a product and its features',
  how: 'the title in a circle at the centre, the items around it, each joined to the centre by a line',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], title: 'hub', min: 2, max: 12, def: 5, word: 'Idea', links: n => n,
  cues: ['hub', 'hub and spoke', 'hub and spokes', 'spokes', 'radial', 'mind map', 'mindmap'], ex: 'Make a mind map of Budget, Team, Risks and Scope around "Launch"',
  build(c, B) {
    const n = c.P.items.length, k = c.k, w = natW(c.P.items, 70, 140) * k, h = 40 * k, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
    const d = clamp(textW(c.P.title || '', LABEL_FS) + 30, 70, 120) * k;
    c.add({ id: 'hub', role: 'hub', layer: 2, shape: 'circle', x: cx, y: cy, w: d, h: d, color: c.pal.text, label: c.P.title || '', text: c.P.title || '' });
    const ry = B.h / 2 - h / 2, rx = Math.min(B.w / 2 - w / 2, ry * 1.7);
    for (let i = 0; i < n; i++) { const [x, y] = ring(cx, cy, rx, ry, -Math.PI / 2 + 2 * Math.PI * i / n); c.item(i, { shape: 'ellipse', x, y, w, h }); c.link('hub', 'item' + (i + 1), { arrow: 'none' }); }
  }
});

/* ======================= emotion: forms that recall something felt ======================= */
def('heart', {
  family: 'emotion', t: 'Heart', good: 'what we care about, values, thanks to people, a team\'s heart, a wedding or a farewell',
  how: 'the items on the outline of a heart, joined by lines that draw the outline (small dots complete it when there are few items); the title inside',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], title: 'centre', min: 1, max: 14, def: 6, word: 'Value', scheme: 'love', links: n => Math.max(n, 12),
  cues: ['heart', 'heart shape', 'love heart'], ex: 'Draw a heart of Trust, Care, Respect, Joy and Courage titled "Our values"',
  build(c, B) {
    const n = c.P.items.length, M = Math.max(n, 12), k = c.k, w = natW(c.P.items, 56, 120) * k, h = 32 * k;
    const hx = t => 16 * Math.sin(t) ** 3, hy = t => -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const s = Math.min((B.w - w) / 32, (B.h - h) / 29), cx = B.x + B.w / 2, oy = B.y + h / 2 + 12 * s;   /* hy in [-12, 17] */
    const pts = arcSample(hx, hy, 0, 2 * Math.PI, M), slots = new Map(); for (let i = 0; i < n; i++) slots.set(Math.round(i * M / n), i);
    const ids = pts.map(([px, py], j) => {
      const x = cx + px * s, y = oy + py * s;
      if (slots.has(j)) { const i = slots.get(j); c.item(i, { shape: 'ellipse', x, y, w, h }); return 'item' + (i + 1); }
      c.add({ id: 'dot' + (j + 1), role: 'decor', layer: 2, shape: 'circle', x, y, w: 12 * k, h: 12 * k, color: c.pal.decor }); return 'dot' + (j + 1);
    });
    ids.forEach((id, j) => c.link(id, ids[(j + 1) % M], { arrow: 'none', color: c.pal.decor }));
    if (c.P.title) c.text('title', 'title', c.P.title, 18, cx, oy + 1 * s);
  }
});
/** M points evenly spaced along a closed parametric curve (t0..t1), by arc length */
function arcSample(fx, fy, t0, t1, M) {
  const N = 2000, acc = [0]; let prev = [fx(t0), fy(t0)];
  for (let i = 1; i <= N; i++) { const t = t0 + (t1 - t0) * i / N, p = [fx(t), fy(t)]; acc.push(acc[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
  const out = []; let j = 0;
  for (let m = 0; m < M; m++) { const want = acc[N] * m / M; while (j < N && acc[j + 1] < want) j++; const t = t0 + (t1 - t0) * j / N; out.push([fx(t), fy(t)]); }
  return out;
}
def('burst', {
  family: 'emotion', t: 'Star burst', good: 'energy and celebration: a launch, wins of the year, ideas bursting out of one theme',
  how: 'a star with the title at the centre, the items around it at alternating distances like rays, each joined to the star',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], title: 'hub', min: 3, max: 12, def: 6, word: 'Spark', scheme: 'sunset', links: n => n,
  cues: ['burst', 'starburst', 'star burst', 'explosion', 'fireworks', 'sparks'], ex: 'Make a starburst of Speed, Joy, Reach, Ideas, Growth and Pride around "Launch day"',
  build(c, B) {
    const n = c.P.items.length, k = c.k, w = natW(c.P.items, 64, 130) * k, h = 36 * k, cx = B.x + B.w / 2, cy = B.y + B.h / 2, d = 110 * k;
    c.add({ id: 'hub', role: 'hub', layer: 2, shape: 'star', x: cx, y: cy, w: d, h: d, color: 'gold', label: c.P.title || '', text: c.P.title || '' });
    const ry = B.h / 2 - h / 2, rx = Math.min(B.w / 2 - w / 2, ry * 1.8);
    for (let i = 0; i < n; i++) { const f = n >= 6 && i % 2 ? 0.7 : 1, [x, y] = ring(cx, cy, rx * f, ry * f, -Math.PI / 2 + 2 * Math.PI * i / n); c.item(i, { shape: 'ellipse', x, y, w, h }); c.link('hub', 'item' + (i + 1), { arrow: 'none', color: c.pal.decor }); }
  }
});
def('steps', {
  family: 'emotion', t: 'Rising steps', good: 'growth and progress: levels of maturity, a career path, results that climb year after year',
  how: 'one block per item, standing on one line and each taller than the one before (a staircase); a rising arrow runs over their tops',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 8, def: 4, word: 'Step', scheme: 'forest', links: n => n - 1,
  cues: ['rising steps', 'staircase', 'stairs', 'steps up', 'growth steps', 'ladder', 'growth chart'], ex: 'Draw rising steps of Start, Learn, Grow and Lead',
  build(c, B) {
    const n = c.P.items.length, k = c.k, gap = 12 * k, cw = (B.w - (n - 1) * gap) / n, md = 14 * k, top = md + 16 * k, minH = 40 * k, maxH = B.h - top;
    for (let i = 0; i < n; i++) {
      const h = minH + (maxH - minH) * (n === 1 ? 1 : i / (n - 1)), x = B.x + i * (cw + gap) + cw / 2, y = B.y + B.h - h / 2;
      c.item(i, { x, y, w: cw, h });
      c.add({ id: 'mark' + (i + 1), role: 'decor', layer: 2, shape: 'circle', x, y: y - h / 2 - 8 * k - md / 2, w: md, h: md, color: c.pal.decor });
      if (i) c.link('mark' + i, 'mark' + (i + 1), { color: c.pal.decor });
    }
  }
});
def('bridge', {
  family: 'emotion', t: 'Bridge', good: 'bringing two sides together: two teams, before and after, problem and solution, two cultures',
  how: 'two pillars, the items on the left and items2 on the right, under a deck that carries the title; each left item is joined to the right item facing it',
  params: ['items', 'items2', 'title', 'scheme', 'color', 'size', 'place'], title: 'deck', min: 1, max: 6, def: 3, uses2: true, word: 'Side', links: (n, m) => m ? Math.min(n, m) : Math.floor(n / 2),
  cues: ['bridge', 'bridging', 'bridge between'], ex: 'Draw a bridge between Sales, Support and Marketing and Design, Code and Data titled "One team"',
  build(c, B) {
    const [L, Rr] = twoSides(c), k = c.k, rows = Math.max(L.length, Rr.length, 1), dh = 40 * k, gap = 10 * k;
    const pw = Math.min(natW(c.P.items.concat(c.P.items2), 80, 170) * k, B.w * 0.3), lx = B.x + pw / 2, rx = B.x + B.w - pw / 2;
    c.add({ id: 'deck', role: 'title', layer: 2, shape: 'rectangle', x: B.x + B.w / 2, y: B.y + dh / 2, w: B.w, h: dh, color: c.pal.text, label: c.P.title || '', text: c.P.title || '' });
    const top = B.y + dh + 2 * gap, h = Math.min(44 * k, (B.y + B.h - top - (rows - 1) * gap) / rows);
    L.forEach((s, i) => put(c, s, { x: lx, y: top + h / 2 + i * (h + gap), w: pw, h }));
    Rr.forEach((s, j) => put(c, s, { x: rx, y: top + h / 2 + j * (h + gap), w: pw, h, color: c.color(s.i + 3) }));
    for (let i = 0; i < Math.min(L.length, Rr.length); i++) c.link(idOf(L[i]), idOf(Rr[i]), { arrow: 'both', style: 'dashed', color: c.pal.decor });
  }
});
/** the two sides of a two-sided form: items and items2; without items2 the items are split in two (first half left) */
function twoSides(c) {
  const A = c.P.items, Z = c.P.items2;
  if (Z.length) return [A.map((t, i) => ({ i, role: 'item' })), Z.map((t, i) => ({ i, role: 'item2' }))];
  const h = Math.ceil(A.length / 2); return [A.slice(0, h).map((t, i) => ({ i, role: 'item' })), A.slice(h).map((t, j) => ({ i: h + j, role: 'item' }))];
}
const put = (c, s, o) => s.role === 'item' ? c.item(s.i, o) : c.item2(s.i, o);
const idOf = s => (s.role === 'item' ? 'item' : 'itemB') + (s.i + 1);
def('mountain', {
  family: 'emotion', t: 'Mountain', good: 'a hard climb to a high goal: a launch, a degree, a transformation, base camps on the way',
  how: 'a mountain behind; the items as camps along a winding trail up its slope, the last item at the summit as a star; dashed arrows lead up',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 8, def: 4, word: 'Camp', scheme: 'earth', links: n => n - 1,
  cues: ['mountain', 'peak', 'summit', 'climb', 'hill'], ex: 'Draw a mountain of Idea, Prototype, Beta and Launch',
  build(c, B) {
    const n = c.P.items.length, k = c.k, w = natW(c.P.items, 64, 130) * k, h = 30 * k, sd = 60 * k;
    c.add({ id: 'mountain', role: 'background', layer: 0, shape: 'triangle', x: B.x + B.w / 2, y: B.y + B.h / 2, w: B.w, h: B.h, color: c.pal.decor, fill: 'light' });
    const x0 = B.x + B.w * 0.2, y0 = B.y + B.h - h / 2, x1 = B.x + B.w / 2, y1 = B.y + sd / 2;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1, t = n === 1 ? 1 : i / (n - 1), zig = last || i === 0 ? 0 : (i % 2 ? 1 : -0.4) * B.w * 0.09;
      c.item(i, last ? { shape: 'star', x: x1, y: y1, w: sd, h: sd, color: 'gold' } : { x: x0 + (x1 - x0) * t + zig, y: y0 + (y1 - y0) * t, w, h });
      if (i) c.link('item' + i, 'item' + (i + 1), { style: 'dashed', color: c.pal.text });
    }
  }
});
def('spiral', {
  family: 'emotion', t: 'Spiral', good: 'growth that widens: learning, a movement that spreads, iterations that build on each other',
  how: 'the items on a spiral from the centre outwards, each joined by an arrow to the next',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], min: 3, max: 12, def: 6, word: 'Turn', scheme: 'calm', links: n => n - 1,
  cues: ['spiral', 'swirl', 'vortex', 'coil'], ex: 'Make a spiral of Try, Learn, Share, Teach, Lead and Inspire',
  build(c, B) {
    const n = c.P.items.length, k = c.k, w = natW(c.P.items, 60, 120) * k, h = 30 * k, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
    const Ry = B.h / 2 - h / 2, Rx = Math.min(B.w / 2 - w / 2, Ry * 1.5), sx = Rx / Ry;
    const b = (Math.max(w / sx, h) + 16) / (2 * Math.PI), th0 = Math.PI, th1 = th0 + (Ry - b * th0 * 0.35) / b;
    const r = th => b * th0 * 0.35 + b * (th - th0);
    const pts = arcSample(t => r(t) * Math.cos(t) * sx, t => r(t) * Math.sin(t), th0, th1, 400);
    for (let i = 0; i < n; i++) { const p = pts[Math.round(i * (pts.length - 1) / (n - 1 || 1) * 0.98)]; c.item(i, { shape: 'ellipse', x: cx + p[0], y: cy + p[1], w, h }); if (i) c.link('item' + i, 'item' + (i + 1), { color: c.pal.decor }); }
  }
});
def('wave', {
  family: 'emotion', t: 'Wave', good: 'ups and downs: a journey with highs and lows, seasons of a year, momentum',
  how: 'the items alternate on the crests and troughs of a wave, joined through small dots that draw the curve',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 10, def: 5, word: 'Moment', scheme: 'ocean', links: n => 2 * n - 2,
  cues: ['wave', 'waves', 'ripple', 'ups and downs', 'highs and lows'], ex: 'Draw a wave of Launch, Dip, Recovery, Peak and Calm',
  build(c, B) {
    const n = c.P.items.length, k = c.k, sp = B.w / n, w = Math.min(natW(c.P.items, 60, 140) * k, sp - 8), h = 34 * k, A = B.h / 2 - h / 2, cy = B.y + B.h / 2;
    const ids = [];
    for (let j = 0; j < 2 * n - 1; j++) {
      const x = B.x + sp / 2 + j * sp / 2, y = cy - A * Math.cos(Math.PI * j / 2) * (j % 2 ? 0 : 1);
      if (j % 2 === 0) { c.item(j / 2, { shape: 'ellipse', x, y: cy - A * (j / 2 % 2 ? -1 : 1), w, h }); ids.push('item' + (j / 2 + 1)); }
      else { c.add({ id: 'dot' + ((j + 1) / 2), role: 'decor', layer: 2, shape: 'circle', x, y, w: 8 * k, h: 8 * k, color: c.pal.decor }); ids.push('dot' + ((j + 1) / 2)); }
    }
    for (let j = 1; j < ids.length; j++) c.link(ids[j - 1], ids[j], { arrow: 'none', color: c.pal.decor });
  }
});
def('tree', {
  family: 'emotion', t: 'Tree with roots', good: 'what grows from what: results above, the roots that feed them below (values, causes, foundations)',
  how: 'a trunk with the title; the items as a crown above it, items2 as roots below it (three short roots when there are none), all joined to the trunk',
  params: ['items', 'items2', 'title', 'scheme', 'color', 'size', 'place'], title: 'hub', min: 1, max: 10, def: 5, uses2: true, word: 'Branch', scheme: 'forest',
  links: (n, m) => n + Math.max(m, m ? 0 : 3),
  cues: ['tree', 'tree with roots', 'roots', 'growing tree'], ex: 'Draw a tree of Products, Revenue and Fans with roots Values, People and Craft',
  build(c, B) {
    const n = c.P.items.length, roots = c.P.items2, k = c.k, w = natW(c.P.items.concat(roots), 60, 130) * k, h = 32 * k;
    const cx = B.x + B.w / 2, tw = clamp(textW(c.P.title || '', LABEL_FS) + 20, 40, 110) * k, th = B.h * 0.2, ty = B.y + B.h * 0.56;
    c.add({ id: 'trunk', role: 'hub', layer: 2, shape: 'rectangle', x: cx, y: ty, w: tw, h: th, color: 'brown', label: c.P.title || '', text: c.P.title || '' });
    const crownY = ty - th / 2 - 14 * k, rows = n > 5 ? 2 : 1, perRow = Math.ceil(n / rows);
    for (let i = 0; i < n; i++) {
      const r = rows === 2 && i >= perRow ? 1 : 0, cnt = r ? n - perRow : perRow, j = r ? i - perRow : i;
      const ry = (crownY - B.y - h / 2) * (r ? 0.5 : 1), rx = (B.w / 2 - w / 2) * (r ? 0.6 : 1);
      const a = Math.PI + Math.PI * (j + 0.5) / cnt, [x, y] = ring(cx, crownY, rx, ry, a);
      c.item(i, { shape: 'ellipse', x, y: Math.min(y, crownY - h / 2), w, h, color: c.P.color || c.pal.items[i % 2] });
      c.link('trunk', 'item' + (i + 1), { arrow: 'none', color: 'brown' });
    }
    const m = roots.length || 3, rootY = ty + th / 2 + 10 * k, rh = roots.length ? h : 12 * k, rw = roots.length ? w : 12 * k;
    for (let j = 0; j < m; j++) {
      const a = Math.PI * (j + 0.5) / m, [x, y] = ring(cx, rootY, B.w * 0.36 - rw / 2, B.y + B.h - rootY - rh / 2, a);
      const o = { x, y: Math.max(y, rootY + rh / 2 + 6 * k), w: rw, h: rh, shape: 'ellipse', color: 'brown' };
      if (roots.length) c.item2(j, o); else c.add(Object.assign({ id: 'root' + (j + 1), role: 'decor', layer: 2 }, o));
      c.link('trunk', roots.length ? 'itemB' + (j + 1) : 'root' + (j + 1), { arrow: 'none', color: 'brown' });
    }
  }
});
def('road', {
  family: 'emotion', t: 'Road to a goal', good: 'a journey with a destination: a plan towards a launch, steps to a dream, a customer journey',
  how: 'the items as milestones along a winding road rising from the bottom left; the road ends at a star with the title (the goal); dashed arrows follow the road',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], title: 'goal', min: 1, max: 8, def: 4, word: 'Milestone', links: n => n,
  cues: ['road', 'road to', 'journey', 'path to the goal', 'path to a goal', 'way to', 'winding road'], ex: 'Draw a road of Save, Plan, Book and Pack to "Japan trip"',
  build(c, B) {
    const n = c.P.items.length, k = c.k, w = natW(c.P.items, 64, 130) * k, h = 32 * k, gd = 70 * k, A = B.h * 0.14;
    const X = t => B.x + w / 2 + t * (B.w - w - gd - 16), Y = t => B.y + B.h - h / 2 - t * (B.h - h / 2 - gd / 2) + A * Math.sin(Math.PI * 2 * t) * (1 - t);
    for (let i = 0; i < n; i++) { const t = i / n; c.item(i, { shape: 'ellipse', x: X(t), y: clamp(Y(t), B.y + h / 2, B.y + B.h - h / 2), w, h }); if (i) c.link('item' + i, 'item' + (i + 1), { style: 'dashed', color: c.pal.decor }); }
    c.add({ id: 'goal', role: 'goal', layer: 2, shape: 'star', x: B.x + B.w - gd / 2, y: B.y + gd / 2, w: gd, h: gd, color: 'gold', label: c.P.title || '', text: c.P.title || 'Goal' });
    c.link('item' + n, 'goal', { style: 'dashed', color: c.pal.decor });
  }
});
def('balance', {
  family: 'emotion', t: 'Balance', good: 'weighing two sides: pros and cons, costs and benefits, work and life',
  how: 'a beam on a post; the items hang on the left pan and items2 on the right pan; the side with more items hangs lower',
  params: ['items', 'items2', 'title', 'scheme', 'color', 'size', 'place'], min: 1, max: 6, def: 3, uses2: true, word: 'Weight', links: (n, m) => (n ? 1 : 0) + (m || n > 1 ? 1 : 0),
  cues: ['balance', 'scales', 'balance scale', 'seesaw', 'pros and cons', 'trade-off', 'tradeoff', 'weigh'], ex: 'Draw a balance of Cost, Risk and Time against Speed and Quality titled "Build or buy"',
  build(c, B) {
    const [L, Rr] = twoSides(c), k = c.k, cx = B.x + B.w / 2, beamY = B.y + 14 * k, fw = 80 * k, fh = 60 * k;
    const tilt = Math.sign(L.length - Rr.length) * 22 * k, pw = Math.min(natW(c.P.items.concat(c.P.items2), 70, 150) * k, B.w * 0.3), px = B.w * 0.34;
    c.add({ id: 'beam', role: 'decor', layer: 1, shape: 'rectangle', x: cx, y: beamY, w: 2 * px + 24, h: 10 * k, color: c.pal.decor });
    c.add({ id: 'post', role: 'decor', layer: 1, shape: 'rectangle', x: cx, y: (beamY + B.y + B.h - fh) / 2, w: 10 * k, h: B.y + B.h - fh - beamY, color: c.pal.decor });
    c.add({ id: 'base', role: 'decor', layer: 2, shape: 'triangle', x: cx, y: B.y + B.h - fh / 2, w: fw, h: fh, color: c.pal.decor });
    const rows = Math.max(L.length, Rr.length, 1), top = beamY + 34 * k + Math.abs(tilt), h = Math.min(40 * k, (B.y + B.h - top - (rows - 1) * 8 * k) / rows);
    /* the heavier side (more items) hangs lower: the lighter side is raised by the tilt */
    [[L, -1, 'hookL', tilt < 0], [Rr, 1, 'hookR', tilt > 0]].forEach(([list, s, hook, raised]) => {
      const x = cx + s * px, dy = raised ? -Math.abs(tilt) : 0;
      c.add({ id: hook, role: 'decor', layer: 2, shape: 'circle', x, y: beamY + 12 * k, w: 12 * k, h: 12 * k, color: c.pal.decor });
      list.forEach((it, i) => put(c, it, { x, y: top + dy + h / 2 + i * (h + 8 * k), w: pw, h, color: c.color(s < 0 ? i : i + 3) }));
      if (list.length) c.link(hook, idOf(list[0]), { arrow: 'none', color: c.pal.decor });
    });
  }
});
def('hourglass', {
  family: 'emotion', t: 'Hourglass', good: 'time running out, many becoming one, a bottleneck: deadlines, focus, before and after a turning point',
  how: 'the outline of an hourglass; the items fill the upper glass, items2 the lower glass (the items are split in two when there are no items2)',
  params: ['items', 'items2', 'title', 'scheme', 'color', 'size', 'place'], min: 2, max: 12, def: 6, uses2: true, word: 'Grain', scheme: 'earth', links: () => 4,
  cues: ['hourglass', 'sand timer', 'sandglass', 'egg timer'], ex: 'Draw an hourglass of Ideas, Options, Drafts and Choice titled "Deadline"',
  build(c, B) {
    let top = c.P.items, low = c.P.items2;
    const split = !low.length, n0 = split ? Math.ceil(top.length / 2) : top.length;
    const k = c.k, cx = B.x + B.w / 2, cy = B.y + B.h / 2, HW = Math.min(B.w / 2, B.h * 0.55), w = natW(c.P.items.concat(low), 56, 120) * k, h = 28 * k, g = 8 * k;
    ['capT', 'capB'].forEach((id, i) => c.add({ id, role: 'decor', layer: 1, shape: 'rectangle', x: cx, y: i ? B.y + B.h - 4 : B.y + 4, w: 2 * HW, h: 8, color: c.pal.decor }));
    c.add({ id: 'neck', role: 'hub', layer: 2, shape: 'circle', x: cx, y: cy, w: 14 * k, h: 14 * k, color: c.pal.decor });
    [['tl', -1, -1], ['tr', 1, -1], ['bl', -1, 1], ['br', 1, 1]].forEach(([id, sx, sy]) => c.add({ id, role: 'decor', layer: 2, shape: 'circle', x: cx + sx * (HW - 5), y: cy + sy * (B.h / 2 - 14), w: 8, h: 8, color: c.pal.decor }));
    c.link('tl', 'neck', { arrow: 'none', color: c.pal.decor }); c.link('tr', 'neck', { arrow: 'none', color: c.pal.decor }); c.link('neck', 'bl', { arrow: 'none', color: c.pal.decor }); c.link('neck', 'br', { arrow: 'none', color: c.pal.decor });
    /* rows inside a glass: from its wide end towards the neck; a row holds what its width there allows */
    const fill = (count, dir, put) => {
      let i = 0, y = dir < 0 ? B.y + 18 + h / 2 : B.y + B.h - 18 - h / 2;
      while (i < count) {
        const half = (HW - 12) * Math.abs(y - cy) / (B.h / 2) - 6, cap = Math.max(0, Math.floor((2 * half + g) / (w + g)));
        if (cap < 1 || Math.abs(y - cy) < h / 2 + 12) { i = count + 1; break; }
        const r = Math.min(cap, count - i), x0 = cx - (r * w + (r - 1) * g) / 2 + w / 2;
        for (let q = 0; q < r; q++) put(i + q, x0 + q * (w + g), y);
        i += r; y -= dir * (h + g);
      }
      return i <= count;
    };
    const ok1 = fill(n0, -1, (i, x, y) => c.item(i, { x, y, w, h }));
    const ok2 = split ? fill(top.length - n0, 1, (i, x, y) => c.item(n0 + i, { x, y, w, h, color: c.color(n0 + i) })) : fill(low.length, 1, (j, x, y) => c.item2(j, { x, y, w, h }));
    if (!ok1 || !ok2) c.overflow = true;
    if (c.P.title) c.text('title', 'title', c.P.title, 15, cx + HW * 0.25 + textBox(c.P.title, 15).w / 2 + 12, cy);
  }
});
def('sunrise', {
  family: 'emotion', t: 'Sunrise', good: 'a new beginning and hope: a vision, a fresh start, what a new day brings',
  how: 'a sun with the title rising on the horizon; the items on an arc above it like rays, each joined to the sun',
  params: ['items', 'title', 'scheme', 'color', 'size', 'place'], title: 'hub', min: 2, max: 10, def: 5, word: 'Ray', scheme: 'sunset', links: n => n,
  cues: ['sunrise', 'rising sun', 'dawn', 'new dawn', 'horizon', 'sunset arc'], ex: 'Draw a sunrise of Hope, Growth, Health and Friends around "2027"',
  build(c, B) {
    const n = c.P.items.length, k = c.k, w = natW(c.P.items, 60, 130) * k, h = 32 * k, cx = B.x + B.w / 2, hy = B.y + B.h * 0.8;
    c.add({ id: 'horizon', role: 'decor', layer: 1, shape: 'rectangle', x: cx, y: hy, w: B.w, h: 6, color: c.pal.decor });
    const ry = hy - B.y - h / 2, rx = B.w / 2 - w / 2, d = Math.min(ry * 0.9, 120 * k);
    c.add({ id: 'hub', role: 'hub', layer: 2, shape: 'circle', x: cx, y: hy, w: d, h: d, color: 'gold', label: c.P.title || '', text: c.P.title || '' });
    for (let i = 0; i < n; i++) { const [x, y] = ring(cx, hy, rx, ry, Math.PI + Math.PI * (i + 0.5) / n); c.item(i, { shape: 'ellipse', x, y, w, h }); c.link('hub', 'item' + (i + 1), { arrow: 'none', color: c.pal.decor }); }
  }
});
def('pillars', {
  family: 'emotion', t: 'Pillars', good: 'what holds something up: the pillars of a strategy, a house of values on a foundation',
  how: 'a roof with the title, one column per item under it, standing on a base (items2 names the base)',
  params: ['items', 'items2', 'title', 'scheme', 'color', 'size', 'place'], title: 'roof', min: 1, max: 7, def: 3, uses2: true, max2: 1, word: 'Pillar', scheme: 'mono',
  cues: ['pillars', 'temple', 'house of', 'columns of', 'foundation'], ex: 'Draw pillars of Quality, Speed and Care titled "Our promise" on "People"',
  build(c, B) {
    const n = c.P.items.length, k = c.k, rh = B.h * 0.24, bh = Math.max(30, B.h * 0.1), gap = 10 * k;
    c.add({ id: 'roof', role: 'title', layer: 2, shape: 'triangle', x: B.x + B.w / 2, y: B.y + rh / 2, w: B.w * 0.96, h: rh, color: c.pal.text, label: c.P.title || '', text: c.P.title || '' });
    const base = c.P.items2[0];
    c.add(Object.assign({ id: base ? 'itemB1' : 'base', role: base ? 'item2' : 'decor', layer: 2, index: 0, shape: 'rectangle', x: B.x + B.w / 2, y: B.y + B.h - bh / 2, w: B.w, h: bh, color: c.pal.decor }, base ? { label: base, text: base } : {}));
    const top = B.y + rh + gap, bot = B.y + B.h - bh - gap, inner = B.w * 0.8, cw = Math.min(natW(c.P.items, 50, 120) * k, (inner - (n - 1) * 3 * gap) / n), step = n > 1 ? (inner - cw) / (n - 1) : 0;
    for (let i = 0; i < n; i++) c.item(i, { x: B.x + (B.w - inner) / 2 + cw / 2 + i * step + (n === 1 ? (inner - cw) / 2 : 0), y: (top + bot) / 2, w: cw, h: bot - top });
  }
});

/* ---------------------------------------------------------------- running a template ---------------------------------------------------------------- */
/** the parameters a template reads, with defaults: missing items become placeholders ("Step 1", ...); counts are kept inside the template's range */
function normalize(T, p) {
  const list = v => v == null ? [] : [].concat(v).flat(Infinity).filter(x => x != null && String(x).trim() !== '').map(x => String(x).trim());
  let items = list(p.items); const items2 = T.uses2 ? list(p.items2) : [];
  if (!items.length) { const n = clamp(Math.round(+p.count || T.def), T.min, T.max); items = Array.from({ length: n }, (_, i) => `${T.word} ${i + 1}`); }
  if (T.name === 'matrix') while (items.length < 4) items.push(`${T.word} ${items.length + 1}`);
  const notes = [];
  if (items.length > T.max) { notes.push(`a ${T.t.toLowerCase()} takes at most ${T.max} item${T.max === 1 ? '' : 's'}; I used the first ${T.max}`); items = items.slice(0, T.max); }
  if (items.length < T.min) { notes.push(`a ${T.t.toLowerCase()} needs at least ${T.min} item${T.min === 1 ? '' : 's'}; I added placeholders`); while (items.length < T.min) items.push(`${T.word} ${items.length + 1}`); }
  return { P: { items, items2: items2.slice(0, T.uses2 ? (T.max2 || T.max) : 0), title: p.title != null && String(p.title).trim() ? String(p.title).trim() : null, parents: list(p.parents), scheme: SCHEMES[p.scheme] ? p.scheme : null, color: p.color || null, axis: p.axis === 'vertical' ? 'vertical' : 'horizontal' }, notes };
}
const boxOf = e => ({ x1: e.x - e.w / 2, y1: e.y - e.h / 2, x2: e.x + e.w / 2, y2: e.y + e.h / 2 });
const overlap = (a, b, pad) => a.x1 < b.x2 + pad && a.x2 > b.x1 - pad && a.y1 < b.y2 + pad && a.y2 > b.y1 - pad;
/** problems of a layout inside its box: elements of layer >= 2 overlapping (2 px gap), anything outside the box, links to unknown ids */
function check(res, box) {
  const out = [], els = res.elements, ids = new Set(els.map(e => e.id)), tol = 1;
  for (const e of els) { const b = boxOf(e); if (b.x1 < box.x - tol || b.y1 < box.y - tol || b.x2 > box.x + box.w + tol || b.y2 > box.y + box.h + tol) out.push(`${e.id} is outside the box`); if (!(e.w > 0 && e.h > 0)) out.push(`${e.id} has no size`); }
  const top = els.filter(e => e.layer >= 2);
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) if (overlap(boxOf(top[i]), boxOf(top[j]), 2)) out.push(`${top[i].id} overlaps ${top[j].id}`);
  for (const l of res.links) { if (!ids.has(l.from) || !ids.has(l.to)) out.push(`link ${l.from} -> ${l.to} names an unknown element`); if (l.from === l.to) out.push(`link ${l.from} loops on itself`); }
  if (res.overflow) out.push('not every item found room');
  return out;
}
const roundEl = e => { e.w = Math.max(1, Math.round(e.w)); e.h = Math.max(1, Math.round(e.h)); e.x = Math.round(e.x); e.y = Math.round(e.y); if (e.fontSize) e.fontSize = Math.round(e.fontSize); return e; };
/** layout(template, params, box) -> { template, box, elements, links, notes, crowded, k }. params: items, items2, title, parents, scheme,
 *  color, axis, count. The sizes shrink (k = 1 -> 0.5) until check() finds no problem; crowded = true when even k = 0.5 has problems. */
function layout(name, params, box) {
  const T = TEMPLATES[name]; if (!T) throw new Error(`There is no template "${name}". Templates: ${Object.keys(TEMPLATES).join(', ')}.`);
  const { P, notes } = normalize(T, params || {});
  let last = null;
  for (let k = 1; k >= 0.499; k = Math.round((k - 0.05) * 100) / 100) {
    const c = new Build(T, P, k); T.build(c, c.heading(box));
    const res = { template: name, box: Object.assign({}, box), elements: c.els.map(roundEl), links: c.links, notes: notes.slice(), overflow: !!c.overflow, k };
    const probs = check(res, box); last = Object.assign(res, { problems: probs });
    if (!probs.length) break;
  }
  last.crowded = last.problems.length > 0; delete last.overflow;
  return last;
}

/* ---------------------------------------------------------------- where it goes ---------------------------------------------------------------- */
/* the parts of a canvas cell a template can fill (fractions x, y, w, h); a template needs more room than a shape, so a corner is a quarter */
const REGIONS = { whole: [0, 0, 1, 1], center: [0.15, 0.1, 0.7, 0.8], top: [0, 0, 1, 0.5], bottom: [0, 0.5, 1, 0.5], left: [0, 0, 0.5, 1], right: [0.5, 0, 0.5, 1], topLeft: [0, 0, 0.5, 0.5], topRight: [0.5, 0, 0.5, 0.5], bottomLeft: [0, 0.5, 0.5, 0.5], bottomRight: [0.5, 0.5, 0.5, 0.5] };
const FILL = { tiny: 0.4, small: 0.55, medium: 0.75, large: 0.92, huge: 1 };
/** the box a template gets in `region` of `canvas` ({x, y, w, h}), filled to the fraction of `size` (default large), with a margin */
function boxFor(canvas, region, size, margin) {
  const r = REGIONS[region] || REGIONS.whole, f = FILL[size] || FILL.large, m = margin == null ? 16 : margin;
  const ax = canvas.x + r[0] * canvas.w + m, ay = canvas.y + r[1] * canvas.h + m, aw = r[2] * canvas.w - 2 * m, ah = r[3] * canvas.h - 2 * m;
  return { x: Math.round(ax + aw * (1 - f) / 2), y: Math.round(ay + ah * (1 - f) / 2), w: Math.round(aw * f), h: Math.round(ah * f) };
}
/** the box on one side of an anchor box {x1, y1, x2, y2} inside the canvas (leftOf, rightOf, above, below), filled to `size` */
function sideBox(canvas, rel, a, size) {
  const m = 16, f = FILL[size] || FILL.large, C = { x1: canvas.x + m, y1: canvas.y + m, x2: canvas.x + canvas.w - m, y2: canvas.y + canvas.h - m };
  const r = { leftOf: [C.x1, C.y1, a.x1 - 24, C.y2], rightOf: [a.x2 + 24, C.y1, C.x2, C.y2], above: [C.x1, C.y1, C.x2, a.y1 - 24], below: [C.x1, a.y2 + 24, C.x2, C.y2] }[rel];
  if (!r || r[2] - r[0] < 120 || r[3] - r[1] < 100) return null;
  const w = (r[2] - r[0]) * f, h = (r[3] - r[1]) * f;
  return { x: Math.round(r[0] + (r[2] - r[0] - w) / 2), y: Math.round(r[1] + (r[3] - r[1] - h) / 2), w: Math.round(w), h: Math.round(h) };
}
/** place(template, params, canvas, obstacles, prefer) -> { fits, region, box, layout, moved }.
 *  obstacles: boxes {x1, y1, x2, y2} of what is already on the canvas and must not be covered (the engine leaves out background and zone
 *  items). prefer: { region } (a canvas part), { at: [x, y] } (the centre), or { rel, anchor: {x1, y1, x2, y2} } (a side of a shape or
 *  group), and { size }. The preferred box is tried first, then the whole canvas, its halves and its quarters; the first whose layout
 *  covers no obstacle wins (moved = true when it is not the preferred one). None -> fits = false and the layout of the whole canvas: the
 *  engine then opens a new frame (an empty cell) and lays the template out there. A box where the items do not fit (crowded) is skipped. */
function place(name, params, canvas, obstacles, prefer) {
  prefer = prefer || {}; obstacles = obstacles || [];
  const size = prefer.size, tries = [];
  if (prefer.at) { const b = boxFor(canvas, 'center', size), [x, y] = prefer.at; tries.push({ region: 'at', box: { x: Math.round(clamp(x - b.w / 2, canvas.x, canvas.x + canvas.w - b.w)), y: Math.round(clamp(y - b.h / 2, canvas.y, canvas.y + canvas.h - b.h)), w: b.w, h: b.h } }); }
  if (prefer.rel && prefer.anchor) { const b = sideBox(canvas, prefer.rel, prefer.anchor, size); if (b) tries.push({ region: prefer.rel, box: b }); }
  if (prefer.region && REGIONS[prefer.region]) tries.push({ region: prefer.region, box: boxFor(canvas, prefer.region, size) });
  for (const r of ['whole', 'left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']) if (!tries.some(t => t.region === r)) tries.push({ region: r, box: boxFor(canvas, r, r === 'whole' ? size : 'huge') });
  for (let i = 0; i < tries.length; i++) {
    const L = layout(name, params, tries[i].box);
    if (L.crowded) continue;
    const hit = L.elements.some(e => obstacles.some(o => overlap(boxOf(e), o, 8)));
    if (!hit) return { fits: true, region: tries[i].region, box: tries[i].box, layout: L, moved: i > 0 && (prefer.region || prefer.at || prefer.rel) ? true : false };
  }
  const box = boxFor(canvas, 'whole', size);
  return { fits: false, region: 'newFrame', box, layout: layout(name, params, box), moved: true };
}

/* ---------------------------------------------------------------- names ---------------------------------------------------------------- */
/** a name from an item's text: its words joined in CamelCase, letters, digits, - and _ only ("Build MVP" -> BuildMVP); null when nothing usable */
function nameFromText(t) {
  const w = String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9_-]+/).filter(Boolean).map(x => x[0].toUpperCase() + x.slice(1));
  let n = w.join('').slice(0, 24); if (!n) return null; if (!/^[A-Za-z_]/.test(n)) n = 'N' + n; return n;
}
/** nameElements(layout, base, taken) -> Map id -> name. Items, hubs and goals are named after their text when it gives a free name; the
 *  rest (and clashes) are <base>-<id> (Timeline1-dot3). taken: names already on the canvas (any case); the result never repeats one. */
function nameElements(res, base, taken) {
  const used = new Set([...(taken || [])].map(x => String(x).toLowerCase())), out = new Map();
  const free = n => { let m = n, i = 1; while (used.has(m.toLowerCase())) m = n + (++i); used.add(m.toLowerCase()); return m; };
  for (const e of res.elements) {
    const own = ['item', 'item2', 'hub', 'goal'].includes(e.role) && e.text ? nameFromText(e.text) : null;
    out.set(e.id, free(own && !used.has(own.toLowerCase()) ? own : `${base}-${e.id}`));
  }
  return out;
}
/** the group name of a new template: its title in CamelCase when free, else <Template>1, <Template>2, ... */
function groupName(name, title, taken) {
  const used = new Set([...(taken || [])].map(x => String(x).toLowerCase())), b = name[0].toUpperCase() + name.slice(1);
  let t = title && nameFromText(title); if (t && /^[0-9]/.test(String(title).trim())) t = b + t.slice(1);   /* "2027" -> Timeline2027 */
  if (t && !used.has(t.toLowerCase())) return t;
  let i = 1; while (used.has((b + i).toLowerCase())) i++; return b + i;
}

/* ---------------------------------------------------------------- the legend these templates add ---------------------------------------------------------------- */
/** the legend questions of the templates (the template plugin's `legend`, design LEGEND_EXT.md): template values with their Rules cues */
function legend() {
  return {
    template: { ask: 'Which diagram form?', kind: 'enum', values: Object.fromEntries(Object.values(TEMPLATES).map(T => [T.name, T.cues.filter(c => c !== T.name)])) },
    items: { ask: 'Which texts does it lay out, in order?', kind: 'texts' },
    items2: { ask: 'Which texts go on the other side (second list)?', kind: 'texts' },
    title: { ask: 'What is its title?', kind: 'text' },
    parents: { ask: 'Under which item does each item go (hierarchy)?', kind: 'texts' },
    scheme: { ask: 'Which colour scheme?', kind: 'enum', values: Object.fromEntries(Object.keys(SCHEMES).map(s => [s, SCHEME_CUES[s].filter(c => c !== s)])) }
  };
}
/** the catalogue for help pages and help answers: one plain entry per template */
function catalogue() {
  return Object.values(TEMPLATES).map(T => ({ name: T.name, t: T.t, family: T.family, good: T.good, how: T.how, params: T.params.slice(), min: T.min, max: T.max, max2: T.uses2 ? (T.max2 || T.max) : 0, def: T.def, uses2: T.uses2, scheme: T.scheme, cues: T.cues.slice(), ex: T.ex }));
}

const TemplateKit = { TEMPLATES, SCHEMES, SCHEME_CUES, FONT_PX, REGIONS, FILL, layout, place, check, boxFor, sideBox, nameElements, nameFromText, groupName, textBox, legend, catalogue, normalize: (n, p) => normalize(TEMPLATES[n], p) };
if (typeof module !== 'undefined') module.exports = TemplateKit; else root.TemplateKit = TemplateKit;
})(typeof window !== 'undefined' ? window : this);
