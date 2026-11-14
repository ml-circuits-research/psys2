// SPDX-License-Identifier: AGPL-3.0-only
// The avatar: the one avatar, a face drawn by one renderer (worlds/ui.avatar/facedraw.mjs) from the data of the knowledge world `k.faces` (read from the catalog like any other
// knowledge, cached by the browser). The first paint uses a small bundled fallback (worlds/ui.avatar/default-face.mjs: the drawings of the default preset, the expressions and the
// motion only, generated from the catalog); the full set replaces it when it arrives. The world holds the state (state.face: a variant for each slot, colours, size and place,
// expression); this module only draws it: the big face (in the popup of the icon in the input bar), the small face of the icon, the expression chips, the faces of the catalog and
// the saved ones, and the variants of a part as small pictures to tap (a tap is typed into the chat like any other command).
// The face MOVES by rules: the host emits events (reply with its text and outcome, thinking, the voice speaking) and worlds/ui.avatar/motion.mjs (a thin call of the library's std.motion over the
// knowledge world `k.motion`, read from the catalog; the bundled subset worlds/ui.avatar/default-motion.mjs, generated from it, moves the face before the catalog arrives and offline) answers which
// eyes, brows and mouth to lay over the face now. Nothing moves while the page is hidden, and prefers-reduced-motion is honoured.
const KNOWLEDGE_URL = 'https://ml-circuits-research.github.io/sop-knowledge-worlds/worlds';
const FADE_MS = 380;
const plain = (t) => String(t).replace(/_/g, ' ');
const nounOf = (slot) => plain(slot.split('_')[0]);

const CSS = `
.p2-avatar-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.p2-avatar-stage { position: relative; width: min(100%, 460px); aspect-ratio: 1; max-height: 64vh; border-radius: 28px; overflow: hidden;
  background: radial-gradient(circle at 50% 35%, #fff, #e8edf5 80%); box-shadow: 0 10px 30px rgba(20, 30, 60, .18); transform-origin: 50% 80%; }
.p2-avatar-layer { position: absolute; inset: 0; opacity: 0; transition: opacity ${FADE_MS}ms ease; }
.p2-avatar-layer.is-in { opacity: 1; }
.p2-avatar-layer svg { display: block; width: 100%; height: 100%; }
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
.p2-avatar-pic { display: block; width: 52px; height: 52px; border-radius: 12px; overflow: hidden; background: #e8edf5; }
.p2-avatar-pic svg { display: block; width: 100%; height: 100%; }
.p2-avatar-lbl { font-size: 11px; line-height: 1.1; text-align: center; }
.p2-avatar-chip { display: inline-flex; align-items: center; padding: 3px 10px; border: 1px solid rgba(127, 140, 170, .45); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.p2-avatar-chip:hover { background: rgba(127, 140, 170, .2); }
.p2-avatar-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: 100%; max-width: 460px; }
.p2-avatar-chips[hidden] { display: none; }
.p2-avatar-note { margin: 0; font-size: 11px; opacity: .65; text-align: center; max-width: 460px; }
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
  st.textContent = CSS;
  document.head.append(st);
}

/** What a tap on a variant says (typed into the chat like any other command): the same words as a person would use. */
export const variantSay = (slot, name) => (name === 'none' ? `remove the ${nounOf(slot)}` : `swap the ${nounOf(slot)} for ${plain(name)}`);

/**
 * Renderer. Returns { update(state), emit(type, payload), setSpeaking(bool, text), setVisible(bool), mirror(el, px), animate({ name }), destroy() }.
 * `host.asset(path)` locates the modules of the page (the renderer, the motion rules, the catalog reader). `mirror(el, px)` keeps a small copy of the face in `el` (the icon).
 * `host.motionSeed` fixes the blink generator (tests); `host.now()` is the clock.
 */
export function createAvatar(container, host = null) {
  ensureCss();
  container.classList.add('p2-avatar-wrap');
  const el = (tag, cls, attrs = {}) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const stage = el('div', 'p2-avatar-stage', { role: 'img' });
  const caption = el('div', 'p2-avatar-caption'), nameEl = el('p', 'p2-avatar-name'), partsEl = el('p', 'p2-avatar-parts');
  caption.append(nameEl, partsEl);
  const chipsEl = el('div', 'p2-avatar-chips', { role: 'group', 'aria-label': 'Expressions' });
  const optsEl = el('div', 'p2-avatar-row', { role: 'group', 'aria-label': 'Choices' });
  const facesEl = el('div', 'p2-avatar-row', { role: 'group', 'aria-label': 'Faces' });
  const noteEl = el('p', 'p2-avatar-note');
  container.append(stage, caption, chipsEl, optsEl, facesEl, noteEl);
  optsEl.hidden = true; facesEl.hidden = true;

  let full = false, state = null, data = null, mods = null, loading = null, retry = 0, destroyed = false, lastSvg = '', shown = '';
  let catalogFacts = null, defaultMotion = '', motionAsked = false;
  let fxTimer = 0, visible = false, motion = null, motionRules = null, motionTimer = 0, frame = { over: null, talking: false }, frameKey = '';
  const mirrors = [];   // { el, px, svg }: the small copies of the face (the icon)
  const now = () => (host?.now ? host.now() : performance.now());
  const reducedQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const say = (text) => { try { host?.send?.(text); } catch (e) { console.warn('avatar: could not send', e); } };
  const asset = (p) => (host?.asset ? host.asset(p) : new URL(`../${p}`, import.meta.url).href);

  /** The renderer, the motion rules and the faces of the catalog, loaded once; a catalog that cannot be reached is asked again later (the avatar then says so). */
  function load() {
    if (loading || destroyed || full) return;
    loading = (async () => {
      try {
        const [draw, logic, { DEFAULT_FACE }, motionMod, { DEFAULT_MOTION }, { createFacts }, { createKnowledgeSource }, { createCachedSource }, lib] = await Promise.all(['worlds/ui.avatar/facedraw.mjs', 'worlds/ui.avatar/facelogic.mjs', 'worlds/ui.avatar/default-face.mjs', 'worlds/ui.avatar/motion.mjs', 'worlds/ui.avatar/default-motion.mjs', 'lib/knowledge/facts.mjs', 'lib/loaders/knowledge-source.mjs', 'lib/loaders/knowledge-cache.mjs', 'lib/vendor/sopworld/sopworld.mjs'].map((p) => import(asset(p))));
        const src = createCachedSource({ source: createKnowledgeSource(host?.knowledgeUrl?.() || KNOWLEDGE_URL), caches: globalThis.caches });
        const facts = createFacts({ source: { text: (p) => Promise.race([src.text(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), 6000))]) } });
        mods = { draw, logic, motionMod, lib }; data = DEFAULT_FACE; shown = ''; motionRules = mods.motionMod.parseMotion(lib, DEFAULT_MOTION); startMotion(); draw_();   // the bundled fallback face first: the avatar never waits for the network
        host?.progress?.start?.('faces', 'Loading the face set', { quiet: true });   // PROGRESS: recorded, never shown while it loads (the fallback face is already drawn: this is an upgrade); said only when it cannot be had
        catalogFacts = facts; defaultMotion = DEFAULT_MOTION;   // the catalog's k.motion is read when the face is first looked at or first replies (adoptCatalogMotion): the bundled copy is the same text and has moved the face since the first paint
        const d = await facts.faces();
        if (!d) throw new Error('no faces in the catalog');
        data = d; full = true; shown = '';
        host?.progress?.end?.('faces', { label: 'Face set loaded' });
      } catch (e) {
        console.warn('avatar: the faces of the catalog could not be loaded; the fallback face stays', e);
        host?.progress?.fail?.('faces', 'The face set could not be loaded', 'the fallback face works: its parts can be added, removed and coloured, with fewer variants');
        if (!destroyed) retry = setTimeout(() => { loading = null; load(); }, 30000);
        loading = null;
        if (mods) { draw_(); return; }
        data = null; draw_();
        return;
      }
      loading = null;
      draw_();
    })();
  }

  // ---- motion: events in, a frame of variants over the face out; one timer, none while hidden --------------------------------------------------------------------
  const has = (slot, name) => !!data?.slots.find((s) => s.name === slot)?.variants.some((v) => v.name === name && v.parts?.length !== 0);
  /** Once, when the face is first opened or first replies: the rules of the catalog's k.motion replace the bundled ones (same text unless the catalog moved on). Offline or unreadable: the bundled rules stay. */
  function adoptCatalogMotion() {
    if (motionAsked || !catalogFacts || !mods) return;
    motionAsked = true;
    catalogFacts.worldText('k.motion').then((text) => { if (!text || text === defaultMotion || destroyed) return; motionRules = mods.motionMod.parseMotion(mods.lib, text); motion = null; frameKey = ''; startMotion(); })
      .catch((e) => console.warn('avatar: the k.motion of the catalog was not used; the bundled rules stay', e));
  }
  const features = (slot, name) => data?.slots.find((s) => s.name === slot)?.variants.find((v) => v.name === name)?.features ?? {};
  function startMotion() {
    if (!mods?.motionMod || !motionRules || motion) return;
    motion = mods.motionMod.createMotion({ lib: mods.lib, motion: motionRules, features, seed: host?.motionSeed ?? (Math.floor(Math.random() * 1e9) | 1), has, reduced: !!reducedQuery?.matches, t0: now() });
    tick();
  }
  reducedQuery?.addEventListener?.('change', () => { motion = null; frameKey = ''; startMotion(); });   // the preference changed: a new scheduler
  const awake = () => !destroyed && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
  function tick() {
    clearTimeout(motionTimer); motionTimer = 0;
    if (!motion || !data || !awake()) return;
    const t = now();
    frame = motion.frame(t);
    const key = JSON.stringify(frame);
    if (key !== frameKey) { frameKey = key; draw_(); }
    const ms = motion.nextChange(t);
    if (Number.isFinite(ms)) motionTimer = setTimeout(tick, ms);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); else clearTimeout(motionTimer); });

  const faceOf = () => (state?.face?.v === 2 ? state.face : mods.logic.newFace(data));
  const svgOf = (face, size) => mods.draw.renderFace(data, face, { size, over: mods.draw.shownOver(face, frame), bg: size ? undefined : '#e8edf5', label: `${state?.name ?? 'Avatar'}, a drawn face with ${mods.logic.describeFace(data, face)}` });

  function paint(svg, fade) {
    if (svg === lastSvg) return;
    lastSvg = svg;
    const top = stage.lastElementChild;
    if (!fade && top?.classList.contains('p2-avatar-layer')) { top.innerHTML = svg; return; }
    const layer = el('div', 'p2-avatar-layer');
    layer.innerHTML = svg;
    const old = [...stage.children];
    stage.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add('is-in'); old.forEach((o) => o.classList.remove('is-in')); }));
    setTimeout(() => old.forEach((o) => o.remove()), FADE_MS + 60);
  }
  const card = (label, text, svg, on) => {
    const b = el('button', `p2-avatar-card${on ? ' is-on' : ''}`, { type: 'button', title: `Say: ${text}` });
    const pic = el('span', 'p2-avatar-pic'); if (svg) pic.innerHTML = svg;
    const lbl = el('span', 'p2-avatar-lbl'); lbl.textContent = label;
    b.append(pic, lbl); b.addEventListener('click', () => say(text));
    return b;
  };
  function rows(face) {
    const sig = JSON.stringify([face.options, face.base, face.name, Object.keys(face.saved ?? {}), full]);
    if (sig === shown) return;
    shown = sig;
    const thumb = (f, label) => mods.draw.renderFace(data, f, { label, bg: '#e8edf5' });
    // the fallback draws only the default preset: the catalog's other faces are cards once it has arrived
    const names = Object.keys(data.presets).filter((n) => full || n === 'girl');
    const cards = names.map((n) => card(plain(n)[0].toUpperCase() + plain(n).slice(1), `become ${/^[aeiou]/.test(n) ? 'an' : 'a'} ${plain(n)}`, thumb(mods.logic.newFace(data, n), n), face.base === n && !face.name));
    for (const v of Object.values(face.saved ?? {})) cards.push(card(v.name, `be ${v.name}`, thumb({ ...mods.logic.newFace(data, v.base), slots: v.slots, colours: v.colours, paint: v.paint, adj: v.adj }, v.name), face.name === v.name));
    facesEl.replaceChildren(...cards); facesEl.hidden = !cards.length;
    chipsEl.replaceChildren(...Object.keys(data.expressions).filter((e) => e !== 'talking').map((e) => { const b = el('button', 'p2-avatar-chip', { type: 'button', title: `Say: look ${e}` }); b.textContent = e[0].toUpperCase() + e.slice(1); b.addEventListener('click', () => say(e === 'wink' ? 'wink' : `look ${e}`)); return b; }));
    const o = face.options;
    if (o) { optsEl.replaceChildren(...o.variants.map((n) => card(n === 'none' ? 'None' : plain(n), variantSay(o.slot, n), n === 'none' ? '' : mods.draw.variantSvg(data, face, o.slot, n, { size: 52 }), face.slots[o.slot] === n))); optsEl.hidden = false; } else { optsEl.replaceChildren(); optsEl.hidden = true; }
  }

  function draw_() {
    if (destroyed) return;
    nameEl.textContent = state?.name ?? 'PSys2';
    if (!data) {
      load();
      partsEl.textContent = 'Drawing my face…';
      return;
    }
    const face = faceOf();
    for (const m of mirrors) { const svg = svgOf(face, m.px).replace(/ width="[\d.]+" height="[\d.]+"/, ''); if (svg !== m.svg) { m.svg = svg; m.el.innerHTML = svg; } }
    if (!visible) return;   // the big face and its rows are drawn while the popup is open
    partsEl.textContent = mods.logic.describeFace(data, face);
    noteEl.textContent = full ? 'Faces: parts of the k.faces knowledge world (hand-written, CC0 1.0).' : 'Showing the small built-in face; the full set of faces is loading.';
    stage.setAttribute('aria-label', `${nameEl.textContent}, a drawn face with ${partsEl.textContent}`);
    rows(face);
    paint(svgOf(face), !frame.talking);
  }

  load();
  draw_();
  return {
    update(next) { state = next ?? state; draw_(); },
    /** An event of the host: 'reply' { text, outcome }, 'thinking' { on }, 'reset' (a 'typing' or a 'mood' has no rule in k.motion and changes nothing). Moves the face by the motion rules. */
    emit(type, payload = {}) { if (type === 'reply') adoptCatalogMotion(); if (!motion) return; motion.emit(type, payload, now()); tick(); },
    setSpeaking(on, text) { if (!motion) return; motion.emit('speaking', { on: !!on, text }, now()); tick(); },
    /** The popup opens or closes: the big face is drawn only while it is open; closing keeps the state. */
    setVisible(on) { visible = !!on; if (visible) { shown = ''; lastSvg = ''; adoptCatalogMotion(); } draw_(); },
    /** Keeps a small copy of the face in `target` (the icon in the input bar). */
    mirror(target, px = 36) { mirrors.push({ el: target, px, svg: '' }); draw_(); },
    /** The motion's current frame (tests and the debug view). */
    frame: () => frame,
    /** Effect avatar.animate { name }. */
    animate({ name } = {}) {
      if (!/^[a-z]+$/.test(String(name ?? ''))) return;
      clearTimeout(fxTimer);
      stage.className = stage.className.replace(/\bfx-\w+/g, '').trim();
      void stage.offsetWidth;
      stage.classList.add(`fx-${name}`);
      fxTimer = setTimeout(() => { stage.className = stage.className.replace(/\bfx-\w+/g, '').trim(); }, 2800);
    },
    destroy() { destroyed = true; clearTimeout(retry); clearTimeout(motionTimer); clearTimeout(fxTimer); },
  };
}
