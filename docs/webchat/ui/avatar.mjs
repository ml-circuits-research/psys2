// Avatar tab: draws the ui.avatar state with the vendored DiceBear core (docs/webchat/vendor, spec 07 sections 3 and 5).
// The world holds the state (character, parts, colors, seed); this module only maps it to DiceBear options and draws.
// If the vendor files fail to load, the hand-drawn robot of robot.mjs is used instead.
import { createRobot } from './robot.mjs';

const VENDOR = new URL('../vendor/', import.meta.url);
const STYLE_FILES = { robot: 'voxel-bot', person: 'open-peeps', emoji: 'moods' };
const FADE_MS = 380;

// ---- state -> DiceBear options (pure; also used by the tests) ----------------------------------------------------
const DEFAULTS = {
  character: 'robot', name: 'PSys2', seed: 'psys2',
  robot: { eyes: 'round', mouth: 'smile', top: 'antenna', chest: 'buttons', colors: { body: '74c0fc', accent: '343a40', screen: '161a21', glow: '3bc9db', background: 'b6e3f4' } },
  person: { head: 'short1', expression: 'smile', accessories: 'none', facialHair: 'none', mask: 'none', colors: { skin: 'edb98a', clothing: '8fa7df', headContrast: '2c1b18' } },
  emoji: { face: 'circle', eyes: 'pupils', mouth: 'smile', cheeks: 'blush', colors: { face: 'fcd34d', background: '1d4ed8' } },
};
/** Components that can be absent: DiceBear takes `<component>Probability` (0 = hidden, 100 = always shown). */
const OPTIONAL = { robot: ['top', 'chest'], person: ['accessories', 'facialHair', 'mask'], emoji: ['cheeks'] };
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
    const d = DEFAULTS[ch], v = s[ch] && typeof s[ch] === 'object' ? s[ch] : {};
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
    if (OPTIONAL[ch].includes(key)) o[`${key}Probability`] = value === 'none' ? 0 : 100;
    if (value !== 'none') o[`${key}Variant`] = [String(value)];
  }
  for (const [key, hex] of Object.entries(v.colors)) if (HEX.test(hex)) o[`${key}Color`] = [hex.toLowerCase()];
  if (ch !== 'person') o.animationVariant = ['slowest']; // the style's own quiet idle animation (blinking)
  return o;
}

/** Words listing the current parts, for the caption and the aria label. */
export function partsCaption(state) {
  const s = normalizeState(state), v = s[s.character];
  const bits = Object.entries(v).filter(([k, x]) => k !== 'colors' && x !== 'none').map(([k, x]) => `${words(String(x))} ${LABEL[k] ?? k}`.trim());
  return bits.join(' · ');
}

// ---- library loading ---------------------------------------------------------------------------------------------
let libPromise = null;
function loadLib() {
  libPromise ??= (async () => {
    const core = await import(new URL('dicebear-core.mjs', VENDOR).href);
    const styles = {};
    await Promise.all(Object.entries(STYLE_FILES).map(async ([ch, file]) => {
      const r = await fetch(new URL(`dicebear-styles/${file}.json`, VENDOR));
      if (!r.ok) throw new Error(`${file}.json: HTTP ${r.status}`);
      styles[ch] = new core.Style(await r.json());
    }));
    return { Avatar: core.Avatar, styles };
  })();
  libPromise.catch(() => { libPromise = null; });
  return libPromise;
}

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
export function createAvatar(container) {
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
  container.append(stage, caption);

  let state = null, transient = null, transientTimer = 0, fxTimer = 0, lib = null, lastSvg = '', destroyed = false, fallback = null, speaking = false;

  function draw() {
    if (!lib || destroyed) return;
    const s = normalizeState(state);
    const override = transient ? EXPRESSIONS[transient]?.[s.character] : undefined;
    let svg;
    try {
      svg = new lib.Avatar(lib.styles[s.character], avatarOptions(s, override)).toString();
    } catch (e) {
      console.warn('avatar: DiceBear could not draw this state, using the defaults', e);
      svg = new lib.Avatar(lib.styles[s.character], avatarOptions({ character: s.character })).toString();
    }
    nameEl.textContent = s.name;
    partsEl.textContent = partsCaption(s);
    stage.setAttribute('aria-label', `${s.name}, ${s.character === 'emoji' ? 'an emoji' : `a ${s.character}`} with ${partsCaption(s).replace(/ · /g, ', ')}`);
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

  loadLib().then((l) => { lib = l; draw(); }).catch((e) => {
    if (destroyed) return;
    console.warn('avatar: the DiceBear files could not be loaded, using the hand-drawn robot', e);
    container.replaceChildren();
    container.classList.remove('p2-avatar-wrap');
    fallback = createRobot(container);
    fallback.update(state ?? undefined);
    fallback.setSpeaking?.(speaking);
  });

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
    setSpeaking(on) { speaking = !!on; if (fallback) fallback.setSpeaking?.(on); else stage.classList.toggle('is-speaking', !!on); },
    /** Effect avatar.animate { name }. */
    animate({ name } = {}) {
      if (fallback || !/^[a-z]+$/.test(String(name ?? ''))) return;
      clearTimeout(fxTimer);
      stage.className = stage.className.replace(/\bfx-\w+/g, '').trim();
      void stage.offsetWidth;
      stage.classList.add(`fx-${name}`);
      fxTimer = setTimeout(() => stage.className = stage.className.replace(/\bfx-\w+/g, '').trim(), 2800);
    },
    destroy() { destroyed = true; clearTimeout(transientTimer); clearTimeout(fxTimer); fallback?.destroy?.(); },
  };
}
