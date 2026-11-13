// Drawing tab (world art.draw, spec 07 sections 6-7): a children's drawing board. The world holds the scene graph
// (objects, sky, ground, selection); this module only draws it with rough.js (vendored in ../../vendor/draw/) so it
// looks hand-drawn, pops new things in, and turns clicks into typed commands ("select the tree") through host.send.
// Effects: draw.download { format: 'png' | 'svg', filename }.
import { createRenderer, PAPER } from './draw/render.mjs';

const VENDOR = new URL('../../vendor/draw/rough.mjs', import.meta.url);
const SCENE_ASSET = 'worlds/art.draw/scene.mjs';
const W = 1000, H = 700;

const CRAYONS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const HINTS = [
  'draw a red house', 'draw three trees', 'put a big yellow sun in the top right corner', 'add a cloud next to the sun',
  'draw a cat under the tree', 'make the sky dark blue', 'make it night', 'add grass', 'draw a rainbow',
];
const EMPTY = { objects: [], background: 'white', sky: null, ground: null, selected: null };

const CSS = `
.dr-root { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.dr-board { position: relative; width: min(100%, calc((100vh - 300px) * 1.4286 + 28px)); min-width: 260px; padding: 12px; border-radius: 22px;
  background: linear-gradient(135deg, #d9a766, #b9803f 55%, #cf9a58); box-shadow: 0 14px 34px rgba(60, 35, 10, .28), inset 0 2px 0 rgba(255, 255, 255, .35), inset 0 -3px 0 rgba(70, 40, 10, .25); }
.dr-paper { position: relative; width: 100%; aspect-ratio: 1000 / 700; border-radius: 10px; overflow: hidden; background: ${PAPER}; box-shadow: inset 0 0 22px rgba(120, 90, 40, .35), inset 0 0 0 2px rgba(90, 60, 20, .25); touch-action: manipulation; }
.dr-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: default; }
.dr-canvas.is-hover { cursor: pointer; }
.dr-grain { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply; opacity: .55; background-size: 220px 220px; }
.dr-vignette { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 45%, rgba(255, 255, 255, 0) 60%, rgba(120, 85, 30, .20) 100%); }
.dr-hint { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; padding: 8%; pointer-events: none; color: #7a6a58; font-family: "Comic Sans MS", "Chalkboard SE", "Bradley Hand", "Segoe Print", "Marker Felt", cursive; transition: opacity .5s; }
.dr-hint[hidden] { display: none; }
.dr-hint b { display: block; font-size: clamp(20px, 3.4vw, 34px); font-weight: 700; color: #5e4c3a; margin-bottom: 6px; }
.dr-hint span { display: block; font-size: clamp(15px, 2.2vw, 22px); }
.dr-hint q { color: #d6336c; font-weight: 700; quotes: "\\201c" "\\201d"; }
.dr-pencil { width: 74px; height: 74px; margin: 0 auto 8px; animation: dr-wobble 2.4s ease-in-out infinite; transform-origin: 20% 80%; }
@keyframes dr-wobble { 0%, 100% { transform: rotate(-8deg) translateY(0); } 50% { transform: rotate(6deg) translateY(-6px); } }
.dr-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 14px; width: min(100%, calc((100vh - 300px) * 1.4286 + 28px)); min-width: 260px; }
.dr-crayons { display: flex; gap: 5px; padding: 6px 10px; border-radius: 14px; background: #fff8e7; box-shadow: 0 2px 0 rgba(120, 90, 40, .25), inset 0 0 0 2px #efd9a8; }
.dr-crayon { all: unset; cursor: pointer; width: 20px; height: 44px; position: relative; transition: transform .15s; border-radius: 3px 3px 2px 2px; box-shadow: inset -3px 0 0 rgba(0, 0, 0, .12), inset 2px 0 0 rgba(255, 255, 255, .35), 0 1px 0 rgba(0, 0, 0, .25); }
.dr-crayon::before { content: ""; position: absolute; left: 0; right: 0; top: -9px; height: 11px; background: inherit; clip-path: polygon(0 100%, 50% 0, 100% 100%); filter: brightness(.92); }
.dr-crayon::after { content: ""; position: absolute; left: 0; right: 0; top: 14px; height: 9px; background: rgba(255, 255, 255, .55); }
.dr-crayon:hover, .dr-crayon:focus-visible { transform: translateY(-6px) rotate(-5deg); }
.dr-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.dr-act { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; background: #fff; color: #3d3350; font-weight: 700; font-size: 14px; box-shadow: 0 2px 0 rgba(0, 0, 0, .18), inset 0 0 0 2px #e6dcc8; transition: transform .12s; }
.dr-act:hover, .dr-act:focus-visible { transform: translateY(-2px); background: #fff4c9; }
.dr-act svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.dr-caption { margin: 0; min-height: 22px; font-size: 14px; opacity: .8; text-align: center; max-width: 720px; }
@media (prefers-color-scheme: dark) { .dr-caption { opacity: .9; } .dr-act { background: #2a3640; color: #f1ead8; box-shadow: 0 2px 0 rgba(0, 0, 0, .5), inset 0 0 0 2px #3b4954; } .dr-act:hover { background: #3a4a56; } }
@media (prefers-reduced-motion: reduce) { .dr-pencil { animation: none; } .dr-crayon { transition: none; } }
`;
function ensureCss() {
  if (document.getElementById('p2-draw-css')) return;
  const st = document.createElement('style');
  st.id = 'p2-draw-css';
  st.textContent = CSS;
  document.head.append(st);
}

/** A soft paper-grain tile as a data URL (generated once). */
let grainUrl = null;
function paperGrain() {
  if (grainUrl) return grainUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 220;
  const g = c.getContext('2d');
  let t = 12345;
  const rnd = () => { t = (Math.imul(t, 1664525) + 1013904223) >>> 0; return t / 4294967296; };
  g.fillStyle = '#fff'; g.fillRect(0, 0, 220, 220);
  for (let i = 0; i < 2600; i++) { const v = 215 + Math.floor(rnd() * 40); g.fillStyle = `rgba(${v - 12},${v - 22},${v - 40},${0.05 + rnd() * 0.16})`; g.fillRect(rnd() * 220, rnd() * 220, 1 + rnd() * 1.6, 1 + rnd() * 1.6); }
  for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(170,140,90,${0.04 + rnd() * 0.07})`; g.beginPath(); const x = rnd() * 220, y = rnd() * 220; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26); g.stroke(); }
  grainUrl = `url(${c.toDataURL()})`;
  return grainUrl;
}

const ICON = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  fresh: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M12 11v6M9 14h6"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></svg>',
};
const PENCIL = '<svg class="dr-pencil" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 56l4-14L42 12a6 6 0 0 1 8.5 0l1.5 1.5a6 6 0 0 1 0 8.5L22 52z" fill="#ffd43b" stroke="#3a3040" stroke-width="3" stroke-linejoin="round"/><path d="M8 56l4-14 10 10z" fill="#f3c69b" stroke="#3a3040" stroke-width="3" stroke-linejoin="round"/><path d="M8 56l1.7-6 4.3 4.3z" fill="#3a3040"/><path d="M44 10l10 10" stroke="#3a3040" stroke-width="3"/><path d="M46 8l10 10-4 4-10-10z" fill="#ff7eb6" stroke="#3a3040" stroke-width="3" stroke-linejoin="round"/></svg>';

const plural = (kind, n) => (n === 1 ? kind : kind === 'person' ? 'people' : kind === 'fish' ? 'fish' : /s$/.test(kind) ? `${kind}es` : `${kind}s`);
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

/** "2 trees, a house and the sun" for the caption. */
export function captionOf(state) {
  const objs = state?.objects ?? [];
  if (!objs.length && !state?.sky && !state?.ground) return 'An empty page. Say what to draw!';
  const counts = new Map();
  for (const o of objs) counts.set(o.thing ?? o.kind, (counts.get(o.thing ?? o.kind) ?? 0) + 1);
  const bits = [...counts].map(([k, n]) => (n === 1 ? `a ${k}` : `${n} ${plural(k, n)}`));
  if (state?.sky) bits.push(`${state.sky} sky`);
  if (state?.ground) bits.push(state.ground);
  return bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0];
}

function make(holder, host) {
  ensureCss();
  holder.style.maxWidth = '1000px';
  holder.classList.add('dr-root');
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const board = el('div', 'dr-board'), paper = el('div', 'dr-paper'), canvas = el('canvas', 'dr-canvas');
  canvas.width = W * 2; canvas.height = H * 2;
  canvas.setAttribute('role', 'img');
  const grain = el('div', 'dr-grain'), vignette = el('div', 'dr-vignette'), hint = el('div', 'dr-hint');
  paper.append(canvas, grain, vignette, hint);
  board.append(paper);
  const tools = el('div', 'dr-tools'), crayons = el('div', 'dr-crayons'), actions = el('div', 'dr-actions'), caption = el('p', 'dr-caption');
  caption.setAttribute('aria-live', 'polite');
  holder.append(board, tools, caption);
  tools.append(crayons, actions);

  let scene = null, renderer = null, rough = null, rc = null, ctx = null;
  let state = EMPTY, loadError = null, destroyed = false, raf = 0, hintTimer = 0, hintIndex = 0, last = 0, hover = null;
  const shown = new Map();   // id -> { obj, cur: pose, born, dying }

  // ---- toolbar -------------------------------------------------------------------------------------------------
  const send = (text) => host.send(text);
  const COLORS = { red: '#e63946', orange: '#f68b1e', yellow: '#ffd43b', green: '#43b04a', blue: '#3a86e8', purple: '#9b51e0', pink: '#ff7eb6', brown: '#8d5a2e', black: '#2d2d34', white: '#ffffff', grey: '#9aa1a9' };
  for (const c of CRAYONS) {
    const b = el('button', 'dr-crayon');
    b.type = 'button'; b.title = `Color it ${c}`; b.setAttribute('aria-label', `Color it ${c}`);
    b.style.background = COLORS[c];
    if (c === 'white') b.style.boxShadow = 'inset 0 0 0 2px #d8d2c4, 0 1px 0 rgba(0,0,0,.25)';
    b.addEventListener('click', () => send(`color it ${c}`));
    crayons.append(b);
  }
  const act = (label, icon, text) => { const b = el('button', 'dr-act', `${ICON[icon]}<span>${label}</span>`); b.type = 'button'; b.addEventListener('click', () => send(text)); actions.append(b); return b; };
  act('Undo', 'undo', 'undo');
  act('New', 'fresh', 'start a new drawing');
  act('Save PNG', 'save', 'save my drawing as a PNG');
  act('Save SVG', 'save', 'save my drawing as an SVG');

  // ---- hint for the empty page ---------------------------------------------------------------------------------
  function showHint() {
    const empty = !(state.objects?.length) && !state.sky && !state.ground;
    hint.hidden = !empty;
    if (!empty) return;
    hint.innerHTML = `${PENCIL}<b>What shall we draw?</b><span>Say or type: <q>${HINTS[hintIndex % HINTS.length]}</q></span>`;
  }
  hintTimer = setInterval(() => { hintIndex++; if (!hint.hidden) showHint(); }, 4200);

  // ---- animation -----------------------------------------------------------------------------------------------
  function sync(next) {
    const now = performance.now();
    const ids = new Set();
    let batch = 0;
    for (const o of next.objects ?? []) {
      ids.add(o.id);
      const s = shown.get(o.id);
      if (!s) shown.set(o.id, { obj: o, cur: { x: o.x, y: o.y, size: o.size, rotation: o.rotation ?? 0, flipX: o.flip ? -1 : 1 }, born: now + batch++ * 140, dying: 0 });
      else { s.obj = o; s.dying = 0; }
    }
    for (const [id, s] of shown) if (!ids.has(id) && !s.dying) s.dying = now;
  }
  // The backing store follows the displayed size (x device pixel ratio, at most 2000 px wide): a 2000x1400 canvas redrawn and committed every animation frame
  // cost ~20 ms of main-thread time per frame on a phone. A hidden tab paints nothing; it paints again when it is shown (the resize observer fires).
  let shownW = 0;   // displayed width, from the resize observer (no layout read per frame)
  function fit() {
    const w = shownW;
    if (!w) return false;
    const pw = Math.min(W * 2, Math.max(320, Math.round(w * Math.min(2, globalThis.devicePixelRatio || 1)))), ph = Math.round((pw * H) / W);
    if (canvas.width === pw && canvas.height === ph) return true;
    canvas.width = pw; canvas.height = ph;
    return true;
  }
  const visible = () => canvas.isConnected && shownW > 0;
  if (typeof ResizeObserver === 'function') new ResizeObserver((es) => { shownW = Math.round(es.at(-1)?.contentRect?.width ?? 0); if (!destroyed && visible()) { fit(); schedule(); } }).observe(canvas);
  else shownW = 400;
  function frame(t) {
    raf = 0;
    if (destroyed || !renderer) return;
    if (!visible()) { last = 0; return; }   // hidden tab: no painting; the resize observer schedules a frame when it is shown
    fit();
    const dt = Math.min(0.05, (t - (last || t)) / 1000 || 0.016); last = t;
    const k = 1 - Math.exp(-dt * 11);
    let busy = false;
    const poses = new Map();
    for (const [id, s] of [...shown]) {
      const o = s.obj, c = s.cur, tgtFlip = o.flip ? -1 : 1;
      c.x += (o.x - c.x) * k; c.y += (o.y - c.y) * k; c.size += (o.size - c.size) * k;
      c.rotation += ((o.rotation ?? 0) - c.rotation) * k; c.flipX += (tgtFlip - c.flipX) * k;
      if (Math.abs(o.x - c.x) > 0.3 || Math.abs(o.y - c.y) > 0.3 || Math.abs(o.size - c.size) > 0.3 || Math.abs((o.rotation ?? 0) - c.rotation) > 0.2 || Math.abs(tgtFlip - c.flipX) > 0.01) busy = true;
      else { c.x = o.x; c.y = o.y; c.size = o.size; c.rotation = o.rotation ?? 0; c.flipX = tgtFlip; }
      let scale = 1, alpha = 1;
      if (s.dying) {
        const u = clamp01((t - s.dying) / 280);
        scale = 1 - u * 0.6; alpha = 1 - u; busy = true;
        if (u >= 1) { shown.delete(id); continue; }
      } else if (t < s.born + 560) {
        const u = clamp01((t - s.born) / 560);
        scale = t < s.born ? 0 : easeOutBack(u); alpha = t < s.born ? 0 : Math.min(1, u * 3); busy = true;
      }
      poses.set(id, { x: c.x, y: c.y, size: c.size, rotation: c.rotation, flipX: c.flipX, scale, alpha });
    }
    paintFrame(poses);
    if (busy) raf = requestAnimationFrame(frame);
  }
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  function paintFrame(poses) {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // dying objects are no longer in the state: draw them from their last known data
    const objs = [...shown.values()].map((s) => s.obj);
    const scn = { ...state, objects: objs };
    renderer.drawScene(ctx, rc, scn, { selected: state.selected ?? null, poses, labelOf });
  }
  const labelOf = (o) => {
    const name = o.thing ?? o.kind, same = (state.objects ?? []).filter((x) => (x.thing ?? x.kind) === name);
    return same.length > 1 ? `${ordinal(same.findIndex((x) => x.id === o.id) + 1)} ${name}` : `the ${name}`;
  };
  const ordinal = (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] ?? `${n}th`;
  function schedule() { if (!raf && renderer && !destroyed) raf = requestAnimationFrame(frame); }

  // ---- clicks ---------------------------------------------------------------------------------------------------
  function objectAt(x, y) {
    if (!scene) return null;
    const objs = [...(state.objects ?? [])].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));
    for (const o of objs) {
      const b = scene.bbox(o), pad = 6;
      if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return o;
    }
    return null;
  }
  const toLogical = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  canvas.addEventListener('pointermove', (e) => {
    const o = objectAt(...toLogical(e));
    if ((o?.id ?? null) !== hover) { hover = o?.id ?? null; canvas.classList.toggle('is-hover', !!o); }
  });
  canvas.addEventListener('click', (e) => {
    const o = objectAt(...toLogical(e));
    if (o) {
      const name = o.thing ?? o.kind, same = (state.objects ?? []).filter((x) => (x.thing ?? x.kind) === name);
      send(same.length > 1 ? `select the ${ordinal(same.findIndex((x) => x.id === o.id) + 1)} ${name}` : `select the ${name}`);
    } else if (state.selected) send('deselect everything');
  });

  // ---- library loading ------------------------------------------------------------------------------------------
  Promise.all([import(VENDOR.href), import(host.asset(SCENE_ASSET))]).then(([r, s]) => {
    if (destroyed) return;
    rough = r.default ?? r.rough; scene = s;
    renderer = createRenderer(rough, scene);
    ctx = canvas.getContext('2d');
    rc = rough.canvas(canvas);
    grain.style.backgroundImage = paperGrain();
    sync(state); schedule();
  }).catch((e) => {
    loadError = e;
    console.warn('drawing tab: libraries failed to load', e);
    caption.textContent = 'The drawing libraries could not be loaded. The commands still work.';
  });

  return {
    update(next) {
      state = { ...EMPTY, ...(next && typeof next === 'object' ? next : {}) };
      caption.textContent = loadError ? caption.textContent : captionOf(state);
      canvas.setAttribute('aria-label', `Drawing: ${captionOf(state)}`);
      showHint();
      if (renderer) { sync(state); schedule(); }
    },
    /** Download the picture as PNG (2x) or SVG; returns { ok, detail }. */
    async download({ format = 'png', filename = 'my-drawing' } = {}) {
      if (!renderer) return { ok: false, detail: 'the drawing is not ready yet' };
      const name = `${String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'my-drawing'}.${format === 'svg' ? 'svg' : 'png'}`;
      let blob;
      if (format === 'svg') blob = new Blob([renderer.toSVG(state)], { type: 'image/svg+xml' });
      else {
        const off = document.createElement('canvas');
        off.width = W * 2; off.height = H * 2;
        const octx = off.getContext('2d');
        octx.setTransform(2, 0, 0, 2, 0, 0);
        renderer.drawScene(octx, rough.canvas(off), state, { selected: null });
        blob = await new Promise((res) => off.toBlob(res, 'image/png'));
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.hidden = true;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true, detail: name };
    },
    destroy() { destroyed = true; clearInterval(hintTimer); if (raf) cancelAnimationFrame(raf); },
  };
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
