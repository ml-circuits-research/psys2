// SPDX-License-Identifier: AGPL-3.0-only
// Avatar tab: draws the ui.avatar state with the vendored DiceBear core (docs/webchat/vendor, spec 07 sections 3 and 5).
// The world holds the state (character, parts, colors, seed); this module only maps it to DiceBear options and draws.
// If the vendor files fail to load, the hand-drawn robot of robot.mjs is used instead.
// AV: nine characters. Only the style definition of the character on screen is fetched (lazily, on first use); the gallery
// thumbnails are one small pre-rendered file (vendor/dicebear-styles/gallery.json, scripts/build-avatar-gallery.mjs) fetched
// when the browser is idle after the page is up. CC BY styles show their credit under the picture.
import { createRobot } from './robot.mjs';
// AVATAR-FROM-PARTS: a face drawn from the parts of k.faces (worlds/ui.avatar/face*.mjs, 30 KB) is the avatar at the start, also in the header; the DiceBear characters stay selectable for a few versions, marked "classic".
const FACE_FILES = ['facedraw.mjs', 'facedata.mjs', 'faceops.mjs'];
const SLOT_NOUN = { face: 'face', hair: 'hair', eyes: 'eyes', eyebrows: 'eyebrows', nose: 'nose', mouth: 'mouth', beard: 'beard', glasses: 'glasses', hat: 'hat', earrings: 'earrings' };
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
/** What a tap on a variant says (typed into the chat like any other command). */
export const faceOptionSay = (slot, id) => (id === 'none' ? (slot === 'glasses' ? 'no glasses' : `no ${SLOT_NOUN[slot] ?? slot}`) : slot === 'glasses' ? `swap the glasses for ${id}` : `make the ${SLOT_NOUN[slot] ?? slot} ${id}`);
export const FACE_EXPRESSIONS = [['happy', 'look happy'], ['sad', 'look sad'], ['angry', 'look angry'], ['surprised', 'look surprised'], ['sleepy', 'look sleepy'], ['wink', 'wink']];

const VENDOR = new URL('../vendor/', import.meta.url);
const STYLE_FILES = { robot: 'voxel-bot', person: 'open-peeps', emoji: 'moods', portrait: 'lorelei', cartoon: 'micah', kid: 'big-smile', pixel: 'pixel-art', pixelbot: 'pixelbot', funemoji: 'fun-emoji' };
/** The gallery order, the spoken name of each character (what a click says) and the credit of its drawings (checked against the vendored definitions by the tests). */
export const CHARACTER_LIST = ['robot', 'person', 'emoji', 'portrait', 'cartoon', 'kid', 'pixel', 'pixelbot', 'funemoji'];
export const CHARACTER_SAY = { robot: 'a robot', person: 'a person', emoji: 'an emoji', portrait: 'a portrait', cartoon: 'a cartoon', kid: 'a kid', pixel: 'a pixel person', pixelbot: 'a pixel robot', funemoji: 'a fun emoji' };
export const CREDITS = {
  robot: { style: 'Voxel Bot', creator: 'DiceBear', license: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', by: false },
  person: { style: 'Open Peeps', creator: 'Pablo Stanley', license: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', by: false },
  emoji: { style: 'Moods', creator: 'DiceBear', license: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', by: false },
  portrait: { style: 'Lorelei', creator: 'Lisa Wischofsky', license: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', by: false },
  cartoon: { style: 'Avatar Illustration System', creator: 'Micah Lanier', license: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', by: true },
  kid: { style: 'Custom Avatar', creator: 'Ashley Seo', license: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', by: true },
  pixel: { style: 'Pixel Art', creator: 'DiceBear', license: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', by: false },
  pixelbot: { style: 'Pixelbot', creator: 'DiceBear', license: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', by: false },
  funemoji: { style: 'Fun Emoji Set', creator: 'Davis Uche', license: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', by: true },
};
/** What a preset chip says (typed into the chat like any other command). */
export const KIND_SAY = { man: 'make the avatar a man', woman: 'make the avatar a woman', girl: 'make the avatar a girl', boy: 'make the avatar a boy', old_man: 'make the avatar an old man', old_woman: 'make the avatar an old woman' };
export const CHARACTER_LABEL = { robot: 'Robot', person: 'Person', emoji: 'Emoji', portrait: 'Portrait', cartoon: 'Cartoon', kid: 'Kid', pixel: 'Pixel person', pixelbot: 'Pixel robot', funemoji: 'Fun emoji' };
const KIND_LABEL = { man: 'Man', woman: 'Woman', girl: 'Girl', boy: 'Boy', old_man: 'Old man', old_woman: 'Old woman' };
const FADE_MS = 380;

// ---- state -> DiceBear options (pure; also used by the tests) ----------------------------------------------------
const DEFAULTS = {
  character: 'robot', name: 'PSys2', seed: 'psys2',
  robot: { eyes: 'round', mouth: 'smile', top: 'antenna', chest: 'buttons', colors: { body: '74c0fc', accent: '343a40', screen: '161a21', glow: '3bc9db', background: 'b6e3f4' } },
  person: { head: 'short1', expression: 'smile', accessories: 'none', facialHair: 'none', mask: 'none', colors: { skin: 'edb98a', clothing: '8fa7df', headContrast: '2c1b18' } },
  emoji: { face: 'circle', eyes: 'pupils', mouth: 'smile', cheeks: 'blush', colors: { face: 'fcd34d', background: '1d4ed8' } },
};
/** Components that can be absent: DiceBear takes `<component>Probability` (0 = hidden, 100 = always shown). */
const OPTIONAL = { robot: ['top', 'chest'], person: ['accessories', 'facialHair', 'mask'], emoji: ['cheeks'], portrait: ['beard', 'earrings', 'freckles', 'glasses', 'hairAccessories'], cartoon: ['earrings', 'facialHair', 'glasses', 'hair'], kid: ['accessories'], pixel: ['accessories', 'beard', 'glasses', 'hat'], pixelbot: [], funemoji: [] };
/** Styles with an idle animation of their own (the hand-chosen `slowest` variant). */
const ANIMATED = new Set(['robot', 'emoji', 'pixelbot']);
/** Short-lived expression from the status of a reply (not stored in the world). */
const EXPRESSIONS = {
  smile: { person: { expression: 'smile' }, emoji: { eyes: 'happy', mouth: 'smile' }, robot: { eyes: 'happy', mouth: 'smile' } },
  surprised: { person: { expression: 'awe' }, emoji: { eyes: 'bigPupils', mouth: 'gasp' }, robot: { eyes: 'round', mouth: 'speaker' } },
};
const LABEL = { eyes: 'eyes', mouth: 'mouth', top: 'top', chest: 'chest', head: 'hair', expression: 'expression', accessories: '', facialHair: 'facial hair', mask: '', face: 'face', cheeks: 'cheeks' };
const HEX = /^[0-9a-f]{6}$/i;
const words = (id) => id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').toLowerCase();

/** Merge a (possibly partial or missing) world state over the defaults. */
export function normalizeState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const character = STYLE_FILES[s.character] ? s.character : DEFAULTS.character;
  const out = { character, name: typeof s.name === 'string' && s.name ? s.name : DEFAULTS.name, seed: s.seed != null ? String(s.seed) : DEFAULTS.seed };
  for (const ch of Object.keys(STYLE_FILES)) {
    const d = DEFAULTS[ch] ?? { colors: {} }, v = s[ch] && typeof s[ch] === 'object' ? s[ch] : {};
    out[ch] = { ...d, ...v, colors: { ...d.colors, ...(v.colors && typeof v.colors === 'object' ? v.colors : {}) } };
  }
  return out;
}

/** DiceBear options of the active character. `override` replaces component values (a transient expression). */
export function avatarOptions(state, override = {}) {
  const s = normalizeState(state), ch = s.character, v = { ...s[ch], ...override };
  // the seed only drives what the state does not fix; keep it to safe characters because it ends up in the SVG
  const o = { seed: String(s.seed).replace(/[^\w .-]/g, '_').slice(0, 64) || 'psys2' };
  for (const [key, value] of Object.entries(v)) {
    if (key === 'colors') continue;
    if (OPTIONAL[ch]?.includes(key)) o[`${key}Probability`] = value === 'none' ? 0 : 100;
    if (value !== 'none') o[`${key}Variant`] = [String(value)];
  }
  for (const [key, hex] of Object.entries(v.colors)) if (HEX.test(hex)) o[`${key}Color`] = [hex.toLowerCase()];
  if (ANIMATED.has(ch)) o.animationVariant = ['slowest']; // the style's own quiet idle animation (blinking)
  return o;
}

/** Words listing the current parts, for the caption and the aria label. */
export function partsCaption(state) {
  const s = normalizeState(state), v = s[s.character], c = state?.caption;
  // the world's own spoken names ("short side-parted hair") when they still describe the current parts
  if (c && c.character === s.character && typeof c.text === 'string' && c.for === JSON.stringify(Object.entries(v).filter(([k]) => k !== 'colors').sort())) return c.text;
  const bits = Object.entries(v).filter(([k, x]) => k !== 'colors' && x !== 'none').map(([k, x]) => `${words(String(x))} ${LABEL[k] ?? k}`.trim());
  return bits.join(' · ');
}

// ---- library loading ---------------------------------------------------------------------------------------------
// The core is one module; a style definition is fetched the first time its character is drawn (never all at once).
let corePromise = null;
const stylePromises = new Map();
function loadCore() {
  corePromise ??= import(new URL('dicebear-core.mjs', VENDOR).href);
  corePromise.catch(() => { corePromise = null; });
  return corePromise;
}
/** The DiceBear Style of a character, loaded on first use. */
export function loadStyle(ch) {
  if (!stylePromises.has(ch)) {
    const p = (async () => {
      const core = await loadCore();
      const r = await fetch(new URL(`dicebear-styles/${STYLE_FILES[ch]}.json`, VENDOR));
      if (!r.ok) throw new Error(`${STYLE_FILES[ch]}.json: HTTP ${r.status}`);
      return new core.Style(await r.json());
    })();
    stylePromises.set(ch, p);
    p.catch(() => stylePromises.delete(ch));
  }
  return stylePromises.get(ch);
}
let galleryPromise = null;
/** { <character>: svg, '<character>:<kind>': svg }: thumbnails pre-rendered at build time. */
function loadGallery() {
  galleryPromise ??= fetch(new URL('dicebear-styles/gallery.json', VENDOR)).then((r) => { if (!r.ok) throw new Error(`gallery.json: HTTP ${r.status}`); return r.json(); });
  galleryPromise.catch(() => { galleryPromise = null; });
  return galleryPromise;
}
const svgUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const CSS = `
.p2-avatar-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.p2-avatar-stage { position: relative; width: min(100%, 460px); aspect-ratio: 1; max-height: 64vh; border-radius: 28px; overflow: hidden;
  background: radial-gradient(circle at 50% 35%, #fff, #e8edf5 80%); box-shadow: 0 10px 30px rgba(20, 30, 60, .18); transform-origin: 50% 80%; }
.p2-avatar-layer { position: absolute; inset: 0; opacity: 0; transition: opacity ${FADE_MS}ms ease; }
.p2-avatar-layer.is-in { opacity: 1; }
.p2-avatar-layer svg { display: block; width: 100%; height: 100%; }
.p2-avatar-stage.is-speaking { animation: p2-av-talk .62s ease-in-out infinite; }
.p2-avatar-stage.fx-dance { animation: p2-av-dance .9s ease-in-out 3; }
.p2-avatar-stage.fx-nod { animation: p2-av-nod .5s ease-in-out 3; }
.p2-avatar-stage.fx-shake { animation: p2-av-shake .45s ease-in-out 3; }
.p2-avatar-stage.fx-wave { animation: p2-av-wave .7s ease-in-out 3; }
.p2-avatar-stage.fx-spin { animation: p2-av-spin 1s ease-in-out 1; }
.p2-avatar-stage.fx-jump, .p2-avatar-stage.fx-bounce { animation: p2-av-jump .5s ease-out 3; }
.p2-avatar-stage.fx-wiggle, .p2-avatar-stage.fx-wink, .p2-avatar-stage.fx-blink { animation: p2-av-wiggle .35s ease-in-out 4; }
.p2-avatar-caption { text-align: center; max-width: 460px; }
.p2-avatar-gallery { display: flex; gap: 8px; width: min(100%, 460px); overflow-x: auto; padding: 4px 2px 8px; scroll-snap-type: x proximity; }
.p2-avatar-card { position: relative; flex: 0 0 auto; width: 72px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px 4px 6px; border: 2px solid transparent; border-radius: 14px;
  background: rgba(127, 140, 170, .12); color: inherit; font: inherit; cursor: pointer; scroll-snap-align: start; }
.p2-avatar-card:hover { background: rgba(127, 140, 170, .24); }
.p2-avatar-card.is-on { border-color: #3b82f6; background: rgba(59, 130, 246, .14); }
.p2-avatar-pic { display: block; width: 56px; height: 56px; border-radius: 12px; overflow: hidden; background: rgba(127, 140, 170, .2); }
.p2-avatar-pic img { display: block; width: 100%; height: 100%; }
.p2-avatar-num { position: absolute; top: 2px; left: 6px; font-size: 11px; opacity: .6; }
.p2-avatar-lbl { font-size: 11px; line-height: 1.1; text-align: center; }
.p2-avatar-presets { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; width: 100%; max-width: 460px; box-sizing: border-box; }
.p2-avatar-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 4px; border: 1px solid rgba(127, 140, 170, .45); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.p2-avatar-chip:hover { background: rgba(127, 140, 170, .2); }
.p2-avatar-chip img { width: 28px; height: 28px; border-radius: 50%; }
.p2-avatar-chip.is-mood { padding: 3px 10px; }
.p2-avatar-faces, .p2-avatar-opts, .p2-avatar-expr { display: flex; gap: 8px; width: min(100%, 460px); overflow-x: auto; padding: 4px 2px 6px; }
.p2-avatar-tag { font-size: 9px; line-height: 1; opacity: .7; text-transform: uppercase; letter-spacing: .04em; }
.p2-avatar-faces[hidden], .p2-avatar-opts[hidden], .p2-avatar-expr[hidden] { display: none; }
.p2-avatar-faces .p2-avatar-card, .p2-avatar-opts .p2-avatar-card { width: 64px; }
.p2-avatar-faces .p2-avatar-pic, .p2-avatar-opts .p2-avatar-pic { width: 52px; height: 52px; border-radius: 50%; overflow: hidden; background: #e8edf5; }
.p2-avatar-opts .p2-avatar-pic { border-radius: 12px; }
.p2-avatar-pic svg { display: block; width: 100%; height: 100%; }
.p2-head-face { display: inline-block; width: 34px; height: 34px; border-radius: 50%; overflow: hidden; vertical-align: middle; margin-right: 8px; background: #e8edf5; flex: none; }
.p2-head-face[hidden] { display: none; }
.p2-head-face svg { display: block; width: 100%; height: 100%; }
.p2-avatar-credit { margin: 0; font-size: 11px; opacity: .65; text-align: center; max-width: 460px; width: 100%; }
.p2-avatar-credit a { color: inherit; }
.p2-avatar-name { margin: 0; font-weight: 600; font-size: 18px; }
.p2-avatar-parts { margin: 2px 0 0; font-size: 13px; opacity: .72; }
@keyframes p2-av-talk { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.025); } }
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

// ---- the tab -----------------------------------------------------------------------------------------------------
/**
 * Tab renderer. Returns { update(state), express('smile'|'surprised'), setSpeaking(bool), animate({ name }), destroy() },
 * the same surface as the legacy robot.
 */
export function createAvatar(container, host = null) {
  ensureCss();
  container.classList.add('p2-avatar-wrap');
  const stage = document.createElement('div');
  stage.className = 'p2-avatar-stage';
  stage.setAttribute('role', 'img');
  const caption = document.createElement('div');
  caption.className = 'p2-avatar-caption';
  const nameEl = document.createElement('p');
  nameEl.className = 'p2-avatar-name';
  const partsEl = document.createElement('p');
  partsEl.className = 'p2-avatar-parts';
  caption.append(nameEl, partsEl);
  const strip = document.createElement('div');   // the gallery: one card per character
  strip.className = 'p2-avatar-gallery';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Characters');
  const presetsEl = document.createElement('div');   // presets of the character on screen
  presetsEl.className = 'p2-avatar-presets';
  presetsEl.setAttribute('role', 'group');
  presetsEl.setAttribute('aria-label', 'Presets');
  const creditEl = document.createElement('p');
  creditEl.className = 'p2-avatar-credit';
  const exprEl = document.createElement('div');   // expressions of the drawn face
  exprEl.className = 'p2-avatar-expr'; exprEl.setAttribute('role', 'group'); exprEl.setAttribute('aria-label', 'Expressions'); exprEl.hidden = true;
  const optsEl = document.createElement('div');   // "what noses are there?": the variants as small pictures to tap
  optsEl.className = 'p2-avatar-opts'; optsEl.setAttribute('role', 'group'); optsEl.setAttribute('aria-label', 'Choices'); optsEl.hidden = true;
  const facesEl = document.createElement('div');   // the faces of k.faces (presets) and the saved ones
  facesEl.className = 'p2-avatar-faces'; facesEl.setAttribute('role', 'group'); facesEl.setAttribute('aria-label', 'Drawn faces'); facesEl.hidden = true;
  container.append(stage, caption, exprEl, optsEl, facesEl, strip, presetsEl, creditEl);

  let state = null, transient = null, transientTimer = 0, fxTimer = 0, core = null, lastSvg = '', destroyed = false, fallback = null, speaking = false;
  let gallery = null, galleryTimer = 0, shownChar = '', shownChips = '';
  let fm = null, faceTimer = 0, talkTimer = 0, talkPhase = false, shownFaces = '', headEl = null;
  const styles = new Map(), pending = new Set();
  const say = (text) => { try { host?.send?.(text); } catch (e) { console.warn('avatar: could not send', e); } };

  /** Load the style of a character the first time it is drawn; draw again when it arrives. */
  function request(ch) {
    if (styles.has(ch) || pending.has(ch) || destroyed || fallback) return;
    pending.add(ch);
    Promise.all([loadCore(), loadStyle(ch)]).then(([c, style]) => { core = c; styles.set(ch, style); pending.delete(ch); draw(); }).catch((e) => {
      pending.delete(ch);
      if (destroyed) return;
      if (!styles.size) useFallback(e);
      else console.warn(`avatar: the ${ch} drawings could not be loaded`, e);
    });
  }
  function useFallback(e) {
    console.warn('avatar: the DiceBear files could not be loaded, using the hand-drawn robot', e);
    clearTimeout(galleryTimer);
    container.replaceChildren();
    container.classList.remove('p2-avatar-wrap');
    fallback = createRobot(container);
    fallback.update(state ?? undefined);
    fallback.setSpeaking?.(speaking);
  }

  function renderGallery(s) {
    const ch = s.character;
    for (const btn of strip.children) { const on = btn.dataset.ch === ch; btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('is-on', on); }
    const chips = state?.chips && typeof state.chips === 'object' ? state.chips : { kinds: [], moods: [] };
    const sig = `${ch}|${JSON.stringify(chips)}|${gallery ? 1 : 0}`;
    if (sig === shownChips) return;
    shownChips = sig;
    presetsEl.replaceChildren(
      ...(chips.kinds ?? []).filter((k) => KIND_SAY[k]).map((k) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'p2-avatar-chip'; b.title = `Say: ${KIND_SAY[k]}`;
        const thumb = gallery?.[`${ch}:${k}`];
        if (thumb) { const im = document.createElement('img'); im.alt = ''; im.src = svgUri(thumb); b.append(im); }
        b.append(document.createTextNode(KIND_LABEL[k] ?? k));
        b.addEventListener('click', () => say(KIND_SAY[k]));
        return b;
      }),
      ...(chips.moods ?? []).filter((m) => /^[a-z]+$/.test(m)).map((m) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'p2-avatar-chip is-mood'; b.title = `Say: look ${m}`;
        b.textContent = m[0].toUpperCase() + m.slice(1);
        b.addEventListener('click', () => say(`look ${m}`));
        return b;
      }),
    );
    presetsEl.hidden = !presetsEl.children.length;
  }
  function renderCredit(ch) {
    if (shownChar === ch) return;
    shownChar = ch;
    const c = CREDITS[ch];
    creditEl.replaceChildren(document.createTextNode(`${c.by ? 'Drawing by' : 'Art:'} ${c.creator} (${c.style}), `));
    const a = document.createElement('a');
    a.href = c.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = c.license;
    creditEl.append(a);
  }
  CHARACTER_LIST.forEach((ch, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'p2-avatar-card'; b.dataset.ch = ch; b.setAttribute('aria-pressed', 'false');
    b.title = `Say: become ${CHARACTER_SAY[ch]}`;
    const num = document.createElement('span'); num.className = 'p2-avatar-num'; num.textContent = String(i + 1);
    const pic = document.createElement('span'); pic.className = 'p2-avatar-pic';
    const lbl = document.createElement('span'); lbl.className = 'p2-avatar-lbl'; lbl.textContent = CHARACTER_LABEL[ch];
    const tag = document.createElement('span'); tag.className = 'p2-avatar-tag'; tag.textContent = 'classic';
    b.append(num, pic, lbl, tag);
    b.addEventListener('click', () => say(`become ${CHARACTER_SAY[ch]}`));
    strip.append(b);
  });
  // the thumbnails are one small file, fetched when the browser is idle (never in the way of the page becoming ready)
  const fetchGallery = () => loadGallery().then((g) => {
    if (destroyed) return;
    gallery = g;
    for (const btn of strip.children) {
      const svg = g[btn.dataset.ch];
      if (!svg) continue;
      const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.src = svgUri(svg);
      btn.querySelector('.p2-avatar-pic').replaceChildren(im);
    }
    shownChips = '';
    renderGallery(normalizeState(state));
    if (state?.face) { shownFaces = ''; renderFaceRows(state.face); }   // the classic cards of the face rows
  }).catch((e) => console.warn('avatar: the gallery thumbnails could not be loaded', e));
  galleryTimer = setTimeout(() => { galleryTimer = 0; if (typeof requestIdleCallback === 'function') requestIdleCallback(fetchGallery, { timeout: 4000 }); else fetchGallery(); }, 1500);

  // ---- the drawn face ----
  function loadFaceModules() {
    if (fm || destroyed) return;
    fm = 'loading';
    const url = (f) => (host?.asset ? host.asset(`worlds/ui.avatar/${f}`) : new URL(`../worlds/ui.avatar/${f}`, import.meta.url).href);
    Promise.all(FACE_FILES.map((f) => import(url(f)))).then(([drawMod, data, ops]) => { fm = { draw: drawMod, data, ops, d: data.getFaces() }; shownFaces = ''; draw(); }).catch((e) => { fm = null; console.warn('avatar: the face files could not be loaded', e); });
  }
  const exprOf = () => (transient === 'surprised' ? 'surprised' : transient === 'smile' ? 'happy' : null);
  function faceSvg(face, size) {
    const t = fm.d.expressions.talking, x = exprOf();
    const over = talkPhase && speaking ? { ...t.over, ...(talkPhase === 'alt' ? t.alt : {}) } : x ? fm.d.expressions[x].over : undefined;
    return fm.draw.renderFace(face, { size, over, bg: size ? undefined : '#e8edf5', label: `${state.name ?? 'Avatar'}, a drawn face with ${fm.ops.describeFace(face, fm.d)}` });
  }
  function renderFaceRows(face) {
    const sig = JSON.stringify([!!fm && fm !== 'loading', Object.keys(face?.saved ?? {}), face?.active, face?.options, face?.base, face?.name, !!gallery]);
    if (sig === shownFaces) return;
    shownFaces = sig;
    const card = (label, say_, svg, on) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `p2-avatar-card${on ? ' is-on' : ''}`; b.title = `Say: ${say_}`;
      const pic = document.createElement('span'); pic.className = 'p2-avatar-pic';
      if (svg) pic.innerHTML = svg;
      const lbl = document.createElement('span'); lbl.className = 'p2-avatar-lbl'; lbl.textContent = label;
      b.append(pic, lbl); b.addEventListener('click', () => say(say_));
      return b;
    };
    const cards = [];
    if (fm && fm !== 'loading') {
      const thumb = (f, label) => fm.draw.renderFace(f, { label, bg: '#e8edf5' });
      cards.push(card('Draw a face', 'draw a face', thumb(fm.ops.newFace('girl', fm.d), 'A drawn face'), false));
      for (const name of fm.ops.presetList(fm.d)) cards.push(card(name[0].toUpperCase() + name.slice(1), `load the ${name} face`, thumb(fm.ops.newFace(name, fm.d), name), !!face?.active && face.base === name && !face.name));
      for (const v of Object.values(face?.saved ?? {})) cards.push(card(v.name, `be ${v.name}`, thumb({ ...fm.ops.newFace('girl', fm.d), slots: v.slots, colours: v.colours, adj: v.adj }, v.name), !!face?.active && face.name === v.name));
    }
    if (cards.length && gallery) CHARACTER_LIST.forEach((ch, i) => { if (gallery[ch]) cards.push(card(`${CHARACTER_LABEL[ch]} (classic)`, `pick the ${ORDINAL[i]} character`, gallery[ch], !face?.active && state?.character === ch)); });   // the DiceBear characters, until they are removed
    facesEl.replaceChildren(...cards);
    facesEl.hidden = !cards.length;
    exprEl.replaceChildren(...FACE_EXPRESSIONS.map(([e, t]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'p2-avatar-chip is-mood'; b.title = `Say: ${t}`; b.textContent = e[0].toUpperCase() + e.slice(1); b.addEventListener('click', () => say(t)); return b; }));
    exprEl.hidden = !face?.active;
    const o = face?.options;
    if (o && fm && fm !== 'loading' && face.active) {
      optsEl.replaceChildren(...o.variants.map((id) => card(id === 'none' ? 'None' : id, faceOptionSay(o.slot, id), id === 'none' ? '' : fm.draw.variantSvg(face, o.slot, id, { size: 52 }, fm.d), face.slots[o.slot] === id)));
      optsEl.hidden = false;
    } else { optsEl.replaceChildren(); optsEl.hidden = true; }
  }
  function paintFace(svg, fade) {
    if (svg === lastSvg) return;
    lastSvg = svg;
    const top = stage.lastElementChild;
    if (!fade && top?.classList.contains('p2-avatar-layer')) { top.innerHTML = svg; return; }
    const layer = document.createElement('div');
    layer.className = 'p2-avatar-layer'; layer.innerHTML = svg;
    const old = [...stage.children];
    stage.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add('is-in'); old.forEach((o) => o.classList.remove('is-in')); }));
    setTimeout(() => old.forEach((o) => o.remove()), FADE_MS + 60);
  }
  /** Draws the drawn face; true when state.face is the avatar (also while its files are still loading), false for a DiceBear character. */
  function drawFace() {
    // no state yet (the world has not answered): the avatar starts as the default drawn face
    const face = state == null ? (fm && fm !== 'loading' ? (fm.start ??= fm.ops.newFace()) : { active: true }) : state.face;
    if (!face?.active) {
      if (headEl) headEl.hidden = true;
      if (strip.hidden) { strip.hidden = false; creditEl.hidden = false; exprEl.hidden = true; optsEl.hidden = true; lastSvg = ''; shownChips = ''; }
      renderFaceRows(face);
      return false;
    }
    loadFaceModules();
    const s = normalizeState(state);
    nameEl.textContent = s.name;
    strip.hidden = true; presetsEl.hidden = true; creditEl.hidden = true;
    if (!fm || fm === 'loading') return true;
    partsEl.textContent = fm.ops.describeFace(face, fm.d);
    stage.setAttribute('aria-label', `${s.name}, a drawn face with ${partsEl.textContent}`);
    renderFaceRows(face);
    paintFace(faceSvg(face), !(talkPhase && speaking));
    if (!headEl) {
      const title = document.querySelector('.p2-head .p2-title');
      if (title) { headEl = document.createElement('span'); headEl.className = 'p2-head-face'; headEl.setAttribute('aria-hidden', 'true'); title.prepend(headEl); }
    }
    if (headEl) { headEl.hidden = false; headEl.innerHTML = faceSvg(face, 34).replace(/ width="34" height="[\d.]+"/, ''); }
    return true;
  }

  function draw() {
    if (destroyed || fallback) return;
    if (drawFace()) return;
    const s = normalizeState(state);
    renderGallery(s);
    renderCredit(s.character);
    nameEl.textContent = s.name;
    partsEl.textContent = partsCaption(state);
    stage.setAttribute('aria-label', `${s.name}, ${CHARACTER_SAY[s.character]} with ${partsCaption(state).replace(/ · /g, ', ')}`);
    const style = styles.get(s.character);
    if (!style) { request(s.character); return; }   // the picture changes when the style has arrived
    const override = transient ? EXPRESSIONS[transient]?.[s.character] : undefined;
    let svg;
    try {
      svg = new core.Avatar(style, avatarOptions(s, override)).toString();
    } catch (e) {
      console.warn('avatar: DiceBear could not draw this state, using the defaults', e);
      svg = new core.Avatar(style, avatarOptions({ character: s.character })).toString();
    }
    if (svg === lastSvg) return;
    lastSvg = svg;
    const layer = document.createElement('div');
    layer.className = 'p2-avatar-layer';
    layer.innerHTML = svg;
    const old = [...stage.children];
    stage.append(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => { layer.classList.add('is-in'); old.forEach((o) => o.classList.remove('is-in')); }));
    setTimeout(() => old.forEach((o) => o.remove()), FADE_MS + 60);
  }

  // the drawn face is the start avatar: its files load at once; the DiceBear style of a classic character only when one is shown
  loadFaceModules();
  if (state?.face?.active === false) request(normalizeState(state).character);
  renderGallery(normalizeState(null));
  renderCredit('robot');

  return {
    update(next) { state = next ?? state; if (fallback) fallback.update(state); else draw(); },
    /** Short-lived mood from the status of a reply (not stored): 'smile' or 'surprised'. */
    express(kind, ms = 2200) {
      if (fallback) { fallback.express?.(kind, ms); return; }
      if (!EXPRESSIONS[kind]) return;
      clearTimeout(transientTimer);
      transient = kind; draw();
      transientTimer = setTimeout(() => { transient = null; draw(); }, ms);
    },
    setSpeaking(on) {
      speaking = !!on;
      if (fallback) { fallback.setSpeaking?.(on); return; }
      clearInterval(talkTimer); talkTimer = 0; talkPhase = false;
      if (state?.face?.active) {   // the mouth alternates the talking pair (k.faces expression "talking")
        stage.classList.remove('is-speaking');
        if (on) talkTimer = setInterval(() => { talkPhase = talkPhase === 'alt' ? 'open' : 'alt'; draw(); }, 170);
        draw();
      } else stage.classList.toggle('is-speaking', !!on);
    },
    /** Effect avatar.animate { name }. */
    animate({ name } = {}) {
      if (fallback || !/^[a-z]+$/.test(String(name ?? ''))) return;
      clearTimeout(fxTimer);
      stage.className = stage.className.replace(/\bfx-\w+/g, '').trim();
      void stage.offsetWidth;
      stage.classList.add(`fx-${name}`);
      fxTimer = setTimeout(() => stage.className = stage.className.replace(/\bfx-\w+/g, '').trim(), 2800);
    },
    destroy() { destroyed = true; clearInterval(talkTimer); clearTimeout(faceTimer); headEl?.remove(); clearTimeout(transientTimer); clearTimeout(fxTimer); clearTimeout(galleryTimer); fallback?.destroy?.(); },
  };
}
