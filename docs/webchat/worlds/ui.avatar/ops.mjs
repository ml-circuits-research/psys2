// SPDX-License-Identifier: AGPL-3.0-only
// Operations of ui.avatar: a DiceBear avatar changed by words (spec 07 section 3). Browser-safe: no imports.
//
// The world reasons about the avatar without the library: the variants, palettes and color names it needs are
// read from generated "data" lexicons (scripts/legend-from-dicebear.mjs) through ctx.lexicon(). Only the host draws.
//
// State (ctx.state):
//   { character: 'robot'|'person'|'emoji', name, seed,
//     robot:  { eyes, mouth, top, chest, colors: { body, accent, screen, glow, background } },
//     person: { head, expression, accessories, facialHair, mask, colors: { skin, clothing, headContrast } },
//     emoji:  { face, eyes, mouth, cheeks, colors: { face, background } } }
//   AV characters (generated, same shape): portrait (lorelei), cartoon (micah), kid (big-smile), pixel (pixel-art), pixelbot, funemoji (fun-emoji);
//   their objects are filled by ensure() from the generated data lexicons (DEFAULT_LOOK below, else the first variant, `none` when optional).
//   Component values are DiceBear variant ids (`none` = component hidden); colors are 6-digit hex entries of the style palette.
// Effects: avatar.animate { name: wink|nod|dance|wave|spin|jump|bounce|wiggle|blink|shake } (a moment, not stored state).
// Every command that changes the avatar brings its tab forward: ctx.request('ui.openTab', { tab: 'robot' }).

/** The three original characters: only they are reached from another character ("only the person has glasses: say yes to become one"). */
const CORE = ['robot', 'person', 'emoji'];
/** Every character, in the order of the gallery. The others (AV) are reached by becoming them and then answer for their own parts. */
const CHARACTERS = [...CORE, 'portrait', 'cartoon', 'kid', 'pixel', 'pixelbot', 'funemoji'];
const DATA = 'lex.ui.avatar.data.';

export function initialState() {
  return {
    character: 'robot', name: 'PSys2', seed: 'psys2',
    robot: { eyes: 'round', mouth: 'smile', top: 'antenna', chest: 'buttons', colors: { body: '74c0fc', accent: '343a40', screen: '161a21', glow: '3bc9db', background: 'b6e3f4' } },
    person: { head: 'short1', expression: 'smile', accessories: 'none', facialHair: 'none', mask: 'none', colors: { skin: 'edb98a', clothing: '8fa7df', headContrast: '2c1b18' } },
    emoji: { face: 'circle', eyes: 'pupils', mouth: 'smile', cheeks: 'blush', colors: { face: 'fcd34d', background: '1d4ed8' } },
    chips: chips('robot'),
  };
}

/** Looks of the AV characters at the start (anything not listed: `none` when the component can be absent, else its first variant, and the first palette entry). */
const DEFAULT_LOOK = {
  portrait: { hair: 'variant13', mouth: 'happy01', colors: { skin: 'edb98a' } },
  cartoon: { hair: 'fonze', mouth: 'smile', eyes: 'round', colors: { hair: '000000' } },
  kid: { hair: 'bangs', eyes: 'cheery', mouth: 'teethSmile' },
  pixel: { hair: 'short01', mouth: 'happy01', colors: { hair: '28150a' } },
  pixelbot: { eyes: 'round', mouth: 'smile' },
  funemoji: { eyes: 'cute', mouth: 'lilSmile' },
};

// ---- hand-written language knowledge ---------------------------------------------------------------------------
/** Spoken part (lemma) -> component keys it can mean, in order of preference. */
export const PART_KEYS = {
  eye: ['eyes'], mouth: ['mouth'], lip: ['mouth'], antenna: ['top'], top: ['top'], head_piece: ['top'], chest: ['chest'],
  hair: ['hair', 'head'], hairstyle: ['hair', 'head'], hair_style: ['hair', 'head'], haircut: ['hair', 'head'], head: ['head', 'top'], expression: ['expression'],
  face: ['expression', 'face'], face_shape: ['face'], accessory: ['accessories'], beard: ['facialHair', 'beard'], facial_hair: ['facialHair', 'beard'],
  mask: ['mask'], cheek: ['cheeks'], eyebrow: ['eyebrows'], brow: ['eyebrows'], nose: ['nose'],
};
/** Spoken colored part (lemma) -> color key per character. */
const COLOR_KEYS = {
  body: { robot: 'body', person: 'clothing', emoji: 'face' }, shell: { robot: 'body' }, metal: { robot: 'body' },
  head: { robot: 'body', person: 'skin', emoji: 'face' }, face: { robot: 'screen', person: 'skin', emoji: 'face' },
  skin: { robot: 'body', person: 'skin', emoji: 'face' }, complexion: { person: 'skin' },
  accent: { robot: 'accent' }, trim: { robot: 'accent' }, limb: { robot: 'accent' }, arm: { robot: 'accent' }, leg: { robot: 'accent' }, joint: { robot: 'accent' },
  screen: { robot: 'screen' }, display: { robot: 'screen' }, glow: { robot: 'glow' }, light: { robot: 'glow' }, eye: { robot: 'glow' },
  background: { robot: 'background', emoji: 'background' }, backdrop: { robot: 'background', emoji: 'background' },
  clothing: { person: 'clothing' }, clothe: { person: 'clothing' }, shirt: { person: 'clothing' }, sweater: { person: 'clothing' }, jacket: { person: 'clothing' },
  hair: { person: 'headContrast' },
  lip: {}, mouth: {},   // no character has a lip or mouth color: the refusal says so (colorSlot)
  main: { robot: 'body', person: 'clothing', emoji: 'face' },
};
// AV characters: their own color keys (the DiceBear color names of each style)
Object.assign(COLOR_KEYS.skin, { portrait: 'skin', cartoon: 'base', kid: 'skin', pixel: 'skin' });
Object.assign(COLOR_KEYS.head, { portrait: 'skin', cartoon: 'base', kid: 'skin', pixel: 'skin' });
Object.assign(COLOR_KEYS.face, { portrait: 'skin', cartoon: 'base', kid: 'skin', pixel: 'skin' });
Object.assign(COLOR_KEYS.complexion, { portrait: 'skin', cartoon: 'base', kid: 'skin', pixel: 'skin' });
Object.assign(COLOR_KEYS.hair, { portrait: 'hair', cartoon: 'hair', kid: 'hair', pixel: 'hair' });
for (const k of ['clothing', 'clothe', 'shirt', 'sweater', 'jacket', 'body', 'main']) Object.assign(COLOR_KEYS[k], { cartoon: 'shirt', pixel: 'clothing' });
for (const k of ['background', 'backdrop']) Object.assign(COLOR_KEYS[k], { pixelbot: 'background', funemoji: 'background' });
for (const k of ['glow', 'light', 'eye']) Object.assign(COLOR_KEYS[k], { pixelbot: 'glow' });
const COLOR_SAY = { base: ['skin', 'is'], hair: ['hair', 'is'], shirt: ['shirt', 'is'], earring: ['earrings', 'are'], eyeShadow: ['eye shadow', 'is'], glasses: ['glasses', 'are'], hat: ['hat', 'is'], body: ['body', 'is'], accent: ['accent color', 'is'], screen: ['screen', 'is'], glow: ['glow', 'is'], background: ['background', 'is'], skin: ['skin', 'is'], clothing: ['clothes', 'are'], headContrast: ['hair', 'is'], face: ['face', 'is'] };
/** A glow must not equal the body color (style definition: notEqualTo). */
const NOT_EQUAL = { glow: 'body', body: 'glow' };
const LABEL = { hair: 'hairstyle', eyebrows: 'eyebrows', nose: 'nose', beard: 'beard', glasses: 'glasses', earrings: 'earrings', clothes: 'clothes', hat: 'hat', freckles: 'freckles', ears: 'ears', hairAccessories: 'hair accessory', details: 'details', sideburns: 'sideburns', eyes: 'eyes', mouth: 'mouth', top: 'top piece', chest: 'chest', head: 'hairstyle', expression: 'expression', accessories: 'accessories', facialHair: 'facial hair', mask: 'mask', face: 'face shape', cheeks: 'cheeks' };
/** Hairstyle names that read without an article ("short curly hair", "twin buns", "cornrows in a ponytail"). */
const NO_ARTICLE_HAIR = /^(?:.*\bhair(?: with .*)?|.*\b(?:knots|buns|braids|dreadlocks|twists)|cornrows.*|shoulder-length.*)$/;
const EYES_PHRASE = { pupils: 'round eyes with pupils', 'big pupils': 'big pupils', 'tall pupils': 'tall pupils', sparkle: 'sparkling eyes', 'look side': 'eyes looking sideways', 'look down': 'eyes looking down', 'look up': 'eyes looking up', wink: 'a winking eye' };
/** Numbered variants ("style 13") are spoken with the part: "hair style 13", "eyes style 5". */
const STYLE_NOUN = { eyes: 'eyes', mouth: 'mouth', head: 'face shape', hair: 'hair', eyebrows: 'eyebrow', nose: 'nose', beard: 'beard', facialHair: 'beard', glasses: 'glasses', earrings: 'earring', freckles: 'freckles', hat: 'hat', clothes: 'clothes', accessories: 'accessory', hairAccessories: 'hair accessory', ears: 'ear', details: 'detail' };
const hairPhrase = (d) => (NO_ARTICLE_HAIR.test(d) ? d : /^(?:long|short) \d+$/.test(d) ? `${d} hair` : `${/^[a-z]+s$/.test(d) && !/ss$/.test(d) ? '' : /^[aeiou]/i.test(d) ? 'an' : 'a'} ${d}`);
const PHRASE = {
  hair: hairPhrase, eyebrows: (d) => `${d} eyebrows`, nose: (d) => `${a(d)} ${d} nose`, beard: (d) => `${a(d)} ${d}`, hat: (d) => `${a(d)} ${d}`, glasses: (d) => `${d} glasses`, earrings: (d) => `${d} earrings`, freckles: (d) => `${d} freckles`, clothes: (d) => `${d} clothes`, hairAccessories: (d) => `${a(d)} ${d}`,
  eyes: (d) => EYES_PHRASE[d] ?? `${d} eyes`, mouth: (d) => `${a(d)} ${d} mouth`, top: (d) => `${a(d)} ${d} on top`, chest: (d) => `${a(d)} ${d} on my chest`,
  head: hairPhrase, expression: (d) => `${a(d)} ${d} expression`, accessories: (d) => `${a(d)} ${d}`, facialHair: (d) => `${a(d)} ${d}`,
  mask: (d) => `${a(d)} ${d}`, face: (d) => `${a(d)} ${d} face`, cheeks: (d) => `${d} cheeks`,
};
const NONE_PHRASE = { hair: 'no hair', beard: 'no beard', glasses: 'no glasses', earrings: 'no earrings', freckles: 'no freckles', hat: 'no hat', hairAccessories: 'no hair accessory', top: 'nothing on top', chest: 'nothing on my chest', accessories: 'no accessories', facialHair: 'no facial hair', mask: 'no mask', cheeks: 'no cheeks' };
const NONE_PROBABILITY = { accessories: 0.6, facialHair: 0.6, mask: 0.8, top: 0.15, chest: 0.15, cheeks: 0.4 };
const SPOKEN_CHARACTER = { robot: 'a robot', person: 'a person', emoji: 'an emoji', portrait: 'a portrait', cartoon: 'a cartoon', kid: 'a kid', pixel: 'a pixel person', pixelbot: 'a pixel robot', funemoji: 'a fun emoji' };
/** mood -> expression of each character (ids of the style definitions). */
export const MOODS = {
  happy: { person: 'smile', emoji: { eyes: 'happy', mouth: 'smile' }, robot: { eyes: 'happy', mouth: 'smile' } },
  cheerful: { person: 'smileBig', emoji: { eyes: 'sparkle', mouth: 'bigSmile' }, robot: { eyes: 'happy', mouth: 'smile' } },
  laughing: { person: 'smileLOL', emoji: { eyes: 'happy', mouth: 'laugh' }, robot: { eyes: 'happy', mouth: 'speaker' } },
  sad: { person: 'solemn', emoji: { eyes: 'lookDown', mouth: 'frown' }, robot: { eyes: 'sleepy', mouth: 'line' } },
  worried: { person: 'concerned', emoji: { eyes: 'uneven', mouth: 'wavy' }, robot: { eyes: 'round', mouth: 'zigzag' } },
  surprised: { person: 'awe', emoji: { eyes: 'bigPupils', mouth: 'gasp' }, robot: { eyes: 'round', mouth: 'speaker' } },
  scared: { person: 'fear', emoji: { eyes: 'tallPupils', mouth: 'wavy' }, robot: { eyes: 'plus', mouth: 'zigzag' } },
  angry: { person: 'veryAngry', emoji: { eyes: 'angry', mouth: 'frown' }, robot: { eyes: 'square', mouth: 'zigzag' } },
  furious: { person: 'rage', emoji: { eyes: 'angry', mouth: 'teeth' }, robot: { eyes: 'square', mouth: 'zigzag' } },
  calm: { person: 'calm', emoji: { eyes: 'calm', mouth: 'smile' }, robot: { eyes: 'round', mouth: 'line' } },
  serious: { person: 'serious', emoji: { eyes: 'pupils', mouth: 'line' }, robot: { eyes: 'square', mouth: 'line' } },
  cute: { person: 'cute', emoji: { eyes: 'sparkle', mouth: 'cat' }, robot: { eyes: 'happy', mouth: 'smile' } },
  sleepy: { person: 'tired', emoji: { eyes: 'sleepy', mouth: 'line' }, robot: { eyes: 'sleepy', mouth: 'line' } },
  suspicious: { person: 'suspicious', emoji: { eyes: 'squint', mouth: 'smirk' }, robot: { eyes: 'square', mouth: 'line' } },
  cheeky: { person: 'cheeky', emoji: { eyes: 'wink', mouth: 'tongue' }, robot: { eyes: 'happy', mouth: 'zigzag' } },
  bored: { person: 'blank', emoji: { eyes: 'pupils', mouth: 'line' }, robot: { eyes: 'sleepy', mouth: 'line' } },
  smug: { person: 'contempt', emoji: { eyes: 'squint', mouth: 'smirk' }, robot: { eyes: 'happy', mouth: 'line' } },
  stressed: { person: 'hectic', emoji: { eyes: 'bigPupils', mouth: 'teeth' }, robot: { eyes: 'plus', mouth: 'zigzag' } },
  cool: { person: 'smileTeethGap', emoji: { eyes: 'squint', mouth: 'smile' }, robot: { eyes: 'square', mouth: 'smile' } },
  loving: { person: 'lovingGrin1', emoji: { eyes: 'sparkle', mouth: 'bigSmile' }, robot: { eyes: 'happy', mouth: 'smile' } },
};
const MOOD_OF = {
  happy: 'happy', glad: 'happy', smiling: 'happy', smiley: 'happy', cheerful: 'cheerful', joyful: 'cheerful', excited: 'cheerful', delighted: 'cheerful', laughing: 'laughing',
  sad: 'sad', unhappy: 'sad', upset: 'sad', worried: 'worried', concerned: 'worried', surprised: 'surprised', shocked: 'surprised', amazed: 'surprised', astonished: 'surprised',
  scared: 'scared', afraid: 'scared', frightened: 'scared', fear: 'scared', fearful: 'scared', terrified: 'scared', angry: 'angry', mad: 'angry', annoyed: 'angry', furious: 'furious', calm: 'calm', relaxed: 'calm', peaceful: 'calm',
  serious: 'serious', neutral: 'serious', cute: 'cute', sleepy: 'sleepy', tired: 'sleepy', suspicious: 'suspicious', cheeky: 'cheeky', bored: 'bored', blank: 'bored',
  smug: 'smug', cool: 'cool', stressed: 'stressed', in_love: 'loving', loving: 'loving',
};
/** Mood words that are nouns in the lexicon, with the adjective that goes after "look" ("express fear" -> "look scared"). */
const MOOD_ADJ = { fear: 'scared' };
const moodWord = (mood) => { const w = String(mood).replace(/_/g, ' '); return MOOD_ADJ[w] ?? w; };
const ANIM_OF = { wink: 'wink', nod: 'nod', dance: 'dance', wave: 'wave', spin: 'spin', jump: 'jump', bounce: 'bounce', wiggle: 'wiggle', blink: 'blink', shake: 'shake' };
const ANIM_SAY = { wink: 'Wink wink!', nod: 'Yes, yes! I am nodding.', dance: 'Watch me dance!', wave: 'Hello there! I am waving at you.', spin: 'Wheee, here I spin!', jump: 'Up I go!', bounce: 'Boing, boing!', wiggle: 'Wiggle wiggle!', blink: 'Blink blink!', shake: 'No, no! I am shaking my head.' };
const OPENERS = ['Done!', 'Okay!', 'Sure!', 'Ta-da!', 'There you go!'];

// ---- small helpers ----------------------------------------------------------------------------------------------
const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (note) => ({ status: 'unsupported', note });
const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const rng = (seed) => { let t = hash(seed) + 0x6d2b79f5; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return (((r ^ (r >>> 14)) >>> 0) / 4294967296); }; };
const opener = (key) => OPENERS[hash(key) % OPENERS.length];
const a = (word) => ((w) => (/s$/.test(w) && !/ss$/.test(w) ? '' : /^[aeiou]/i.test(w) ? 'an' : 'a'))(String(word).replace(/\s*\d+$/, ''));
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const orList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);
const idsOf = (list) => [...new Set(list.map((e) => e.id))];
// The host caption shows the spoken part names; `for` lets the host ignore it once the parts change elsewhere.
const partsSig = (v) => JSON.stringify(Object.entries(v).filter(([k]) => k !== 'colors').sort());
/** What the gallery of the host offers for a character: kinds of person it can be made into and moods it can show (the host turns them into chips). */
const GALLERY_MOODS = ['happy', 'sad', 'cool', 'surprised', 'angry', 'cheerful'];
function chips(ch) {
  const kinds = Object.keys(PRESETS[ch] ?? {});
  if (PRESETS[ch]?.man && HAIR_COLOR[ch]) kinds.push('old_man');
  if (PRESETS[ch]?.woman && HAIR_COLOR[ch]) kinds.push('old_woman');
  return { kinds, moods: GALLERY_MOODS.filter((m) => moodSpecOf(ch, m)) };
}
function caption(ctx) {
  const s = ctx.state, ch = s.character, v = s[ch];
  s.chips = chips(ch);
  s.caption = { character: ch, for: partsSig(v), text: components(ctx, ch).filter((k) => v[k] !== 'none').map((k) => phraseOf(ctx, ch, k, v[k]).replace(/\bmy\b/g, 'its')).join(' · ') };
}
const done = (ctx, key, sentence) => { ensure(ctx); caption(ctx); ctx.request('ui.openTab', { tab: 'robot' }); return ok(`${opener(key)} ${sentence}`); };
const clean = (s) => String(s ?? '').replace(/ {2,}/g, ' ').trim();
const say = (key, display) => (/^style \d+$/.test(display) ? `${STYLE_NOUN[key] ?? LABEL[key] ?? key} ${display}` : clean(PHRASE[key] ? PHRASE[key](display) : `${display} ${LABEL[key] ?? key}`));

/** The start look of an AV character, from the generated data (DEFAULT_LOOK first). */
function defaultLook(ctx, ch) {
  const want = DEFAULT_LOOK[ch] ?? {}, v = { colors: {} };
  for (const key of components(ctx, ch)) {
    const ids = idsOf(entries(ctx, ch, key));
    v[key] = ids.includes(want[key]) ? want[key] : optional(ctx, ch).includes(key) ? 'none' : ids[0];
  }
  for (const key of colorKeys(ctx, ch)) {
    const pal = palette(ctx, ch, key);
    v.colors[key] = pal.includes(want.colors?.[key]) ? want.colors[key] : pal[0];
  }
  return v;
}
/** What a component goes back to ("reset my hair"): the start look of the character. */
const defaultOf = (ctx, ch, key) => initialState()[ch]?.[key] ?? defaultLook(ctx, ch)[key];

function ensure(ctx) {
  const s = ctx.state, d = initialState();
  for (const ch of CHARACTERS) if (!d[ch] && !s[ch]) s[ch] = defaultLook(ctx, ch);
  for (const k of Object.keys(d)) {
    if (s[k] === undefined) s[k] = d[k];
    else if (d[k] && typeof d[k] === 'object') {
      for (const j of Object.keys(d[k])) if (s[k][j] === undefined) s[k][j] = d[k][j];
      if (d[k].colors) for (const c of Object.keys(d[k].colors)) if (s[k].colors?.[c] === undefined) s[k].colors = { ...d[k].colors, ...s[k].colors };
    }
  }
  return s;
}
const entries = (ctx, ch, key) => ctx.lexicon(`${DATA}${ch}.${key}`).map((w) => { const [word, id, display] = w.split(':'); return { word, id, display: (display ?? id).replace(/_/g, ' ') }; });
const components = (ctx, ch) => ctx.lexicon(`${DATA}${ch}.components`);
const optional = (ctx, ch) => ctx.lexicon(`${DATA}${ch}.optional`);
const colorKeys = (ctx, ch) => ctx.lexicon(`${DATA}${ch}.colors`);
const palette = (ctx, ch, key) => ctx.lexicon(`lex.ui.avatar.palette.${ch}.${key}`);
const displayOf = (ctx, ch, key, id) => (id === 'none' ? 'none' : entries(ctx, ch, key).find((e) => e.id === id)?.display ?? id);
const order = (s) => [s.character, ...CORE.filter((c) => c !== s.character)];
const suffix = (id) => { const m = id.match(/(\d+)$/)?.[1]; return m === undefined ? undefined : String(Number(m)); };
const phraseOf = (ctx, ch, key, id) => (id === 'none' ? NONE_PHRASE[key] ?? `no ${LABEL[key] ?? key}` : say(key, displayOf(ctx, ch, key, id)));

// ---- colors -----------------------------------------------------------------------------------------------------
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const dist = (x, y) => { const p = rgb(x), q = rgb(y), r = (p[0] + q[0]) / 2; const dr = p[0] - q[0], dg = p[1] - q[1], db = p[2] - q[2]; return (2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db; };
const luma = (hex) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const colorTable = (ctx) => ctx.lexicon('lex.ui.avatar.data.colornames').map((w) => w.split(':')).filter(([n]) => n !== 'grey');
const HAIR_ONLY = new Set(['blonde', 'ginger', 'auburn']);
const norm = (hex) => { const c = rgb(hex), m = Math.max(...c, 1); return c.map((v) => Math.round((v * 255) / m)).map((v) => v.toString(16).padStart(2, '0')).join(''); };
const sat = (hex) => { const c = rgb(hex); return (Math.max(...c) - Math.min(...c)) / Math.max(...c, 1); };
/** Names of very dark tinted colors go by their hue (a near-black green is a dark green, not black). */
const huey = (hex) => luma(hex) < 45 && sat(hex) > 0.25;
function nameOfHex(ctx, hex, key) {
  let best = null, bd = Infinity;
  for (const [n, h] of colorTable(ctx)) {
    if (HAIR_ONLY.has(n) && key !== 'headContrast') continue;
    if (huey(hex) && !n.startsWith('dark_') && n !== 'black') continue;
    const d = huey(hex) ? dist(norm(hex), norm(h)) : dist(hex, h);
    if (d < bd) { bd = d; best = n; }
  }
  return (best ?? hex).replace(/_/g, ' ');
}
function hexOfName(ctx, name) {
  const n = String(name).toLowerCase();
  const hit = ctx.lexicon('lex.ui.avatar.data.colornames').map((w) => w.split(':')).find(([x]) => x === n);
  return hit?.[1];
}
/** Nearest palette entry: by color distance; when nothing is close (a light color for an all-dark palette), by hue. */
function nearest(ctx, ch, key, target, avoid) {
  const pal = palette(ctx, ch, key).filter((h) => h !== avoid);
  const grayish = sat(target) < 0.2 && luma(target) > 60; // gray, silver, white: keep the result unsaturated too
  const raw = pal.map((h) => ({ h, d: dist(h, target) + (grayish ? 2e6 * sat(h) ** 2 : 0) })).sort((x, y) => x.d - y.d);
  if (!raw.length || raw[0].d < 12000 || Math.max(...pal.map(luma)) > 110) return raw[0]?.h;
  return pal.map((h) => ({ h, d: dist(norm(h), norm(target)) })).sort((x, y) => x.d - y.d)[0].h;
}

// ---- component resolution ---------------------------------------------------------------------------------------
/** Characters (active first) that have a component among `keys`, as [{ ch, key }]. */
function slots(ctx, s, keys) {
  const out = [];
  for (const ch of order(s)) for (const key of components(ctx, ch)) if (!keys || keys.includes(key)) out.push({ ch, key });
  return out;
}
const spoken = (ch) => SPOKEN_CHARACTER[ch];
function switchNote(from, to) { return from === to ? '' : ` (I turned into ${spoken(to)} for that.)`; }
/** The operation being run by the wrapper (name and arguments), so that an offer can repeat it after "yes". */
let CURRENT = null;
const cap = (x) => x.replace(/^./, (c) => c.toUpperCase());
const the = (ch) => spoken(ch).replace(/^an? /, 'the ');
/**
 * Offer another character instead of switching silently: remember it as pending (inputMode 'confirm', answered by
 * interceptInput) and say what is missing and how to get it.
 */
function offer(s, ch, what, verb = 'has') {
  s.pending = { character: ch, replay: CURRENT ? { fn: CURRENT.fn, args: structuredClone(CURRENT.args ?? {}) } : null };
  s.inputMode = 'confirm';
  return `${cap(spoken(s.character))} ${verb === 'has' ? 'has no' : 'does not have'} ${what}, but ${the(ch)} does. Say "yes" to become ${the(ch)}${s.pending.replay ? ' and do that' : ''}.`;
}
/** Pick the target of a command: the active character first; another character only when asked (never silently). */
function pickSlot(s, candidates, whatForError) {
  const mine = candidates.filter((c) => c.ch === s.character);
  if (mine.length) return { slot: mine[0] };
  const chars = [...new Set(candidates.map((c) => c.ch))];
  if (chars.length === 1) return { error: offer(s, chars[0], whatForError) };
  return { error: `${cap(spoken(s.character))} has no ${whatForError}. I could do that as ${orList(chars.map(spoken))}; tell me to become one of them first.` };
}

function chooseEntry(list, { n, text }) {
  let l = list;
  if (n !== undefined) {
    const hit = l.filter((e) => (suffix(e.id) ?? '1') === String(Number(n)));
    if (!hit.length) return { error: `I only have ${l.map((e) => e.display).join(', ')}.` };
    l = hit;
  } else {
    const t = String(text ?? '').toLowerCase().trim();
    const exact = l.filter((e) => e.display === t);
    if (exact.length) l = exact;
    else { const plain = l.filter((e) => !suffix(e.id)); if (plain.length) l = plain; }
  }
  return { entry: l[0] };
}

function listOptionsText(ctx, ch, key, limit = 30) {
  const seen = new Set(), names = [];
  for (const e of entries(ctx, ch, key)) if (!seen.has(e.id)) { seen.add(e.id); names.push(e.display); }
  const more = names.length > limit ? ` and ${names.length - limit} more` : '';
  const shown = names.slice(0, limit);
  return `${shown.join(', ')}${more}`;
}

/** Find the (character, component, variant) a command means. */
function resolveVariant(ctx, s, { part, value, n, text }) {
  const keys = part ? PART_KEYS[part] : null;
  if (part && !keys) return { error: `I do not know what my ${String(part).replace(/_/g, ' ')} is.` };
  const found = [];
  for (const sl of slots(ctx, s, keys)) {
    const list = entries(ctx, sl.ch, sl.key).filter((e) => e.word === value);
    if (list.length) found.push({ ...sl, list });
  }
  if (!found.length) return { error: null, none: true };
  const { slot, error } = pickSlot(s, found, `${(() => { const d = String(found[0].list[0].display ?? ''); const v = String(value).replace(/_/g, ' '); return d.replace(/s$/, '') === v ? d : v === 'had' ? 'hat' : v; })()}${part ? ` ${part === 'eye' ? 'eyes' : String(part).replace(/_/g, ' ')}` : ''}`);
  if (error) return { error };
  const pick = chooseEntry(slot.list, { n, text });
  if (pick.error) return { error: pick.error };
  return { ch: slot.ch, key: slot.key, id: pick.entry.id, display: pick.entry.display };
}

function apply(ctx, s, r) {
  const from = s.character;
  s.character = r.ch;
  s[r.ch][r.key] = r.id;
  return switchNote(from, r.ch);
}

// ---- capability map (spec 07): what a character can do instead of what it lacks -------------------------------------
/** Person: eye and mouth words -> the expression id that looks like it (the person has no eyes or mouth component). */
const EYE_EXPRESSION = {
  wide: 'awe', big: 'awe', bigger: 'awe', large: 'awe', huge: 'awe', open: 'awe', awake: 'awe', surprised: 'awe', amazed: 'awe', giant: 'awe',
  sleepy: 'tired', tired: 'tired', droopy: 'tired', narrow: 'tired', small: 'tired', smaller: 'tired', heavy: 'tired',
  happy: 'smile', smiling: 'smile', glad: 'smile', cheerful: 'smileBig', joyful: 'smileBig',
  sad: 'solemn', unhappy: 'solemn', down: 'solemn', gloomy: 'solemn',
  dreamy: 'calm', dreamlike: 'calm', calm: 'calm', peaceful: 'calm', relaxed: 'calm', gentle: 'calm',
  closed: 'eyesClosed', shut: 'eyesClosed', asleep: 'eyesClosed',
  angry: 'veryAngry', mad: 'veryAngry', furious: 'rage', cross: 'veryAngry',
  scared: 'fear', afraid: 'fear', frightened: 'fear', worried: 'concerned',
  wink: 'cheeky', winking: 'cheeky', cheeky: 'cheeky',
  sparkling: 'lovingGrin1', sparkle: 'lovingGrin1', sparkly: 'lovingGrin1', shiny: 'lovingGrin1', loving: 'lovingGrin1', cute: 'cute',
  suspicious: 'suspicious', squint: 'suspicious', squinting: 'suspicious', sharp: 'suspicious',
  crazy: 'hectic', wild: 'hectic', stressed: 'hectic', blank: 'blank', serious: 'serious',
};
const MOUTH_EXPRESSION = {
  smile: 'smile', smiling: 'smile', happy: 'smile', big: 'smileBig', grin: 'smileBig', bigger: 'smileBig', wide: 'smileBig', laugh: 'smileLOL', laughing: 'smileLOL',
  sad: 'solemn', frown: 'solemn', frowning: 'solemn', down: 'solemn', line: 'serious', flat: 'serious', straight: 'serious', closed: 'serious', serious: 'serious',
  teeth: 'smileTeethGap', open: 'awe', gasp: 'awe', surprised: 'awe', zigzag: 'concerned', wavy: 'concerned', tongue: 'cheeky',
};
/** What an expression is called when it describes the eyes or the mouth. */
const EXPRESSION_SAY = { awe: 'wide-eyed', tired: 'sleepy-eyed', smile: 'smiling', smileBig: 'beaming', smileLOL: 'laughing', solemn: 'sad', calm: 'calm and dreamy', eyesClosed: 'closed-eyed', veryAngry: 'angry', rage: 'furious', fear: 'scared', concerned: 'worried', cheeky: 'cheeky', lovingGrin1: 'sparkling', suspicious: 'suspicious', hectic: 'wild-eyed', serious: 'serious', blank: 'blank', cute: 'cute', smileTeethGap: 'grinning' };
/** The characters' capability map: character -> spoken part it lacks -> { note, find(value) -> what to set } (the closest thing it has). */
const MOOD_RULE = (who) => ({ note: `${who} shows its expression with its eyes and mouth`, find: (v) => MOOD_OF[v] && { mood: MOOD_OF[v] } });
const CAPABILITY = {
  person: {
    eye: { note: "A person's eyes follow the expression", find: (v) => EYE_EXPRESSION[v] && { expression: EYE_EXPRESSION[v] } },
    expression: { note: 'A person shows a mood with the expression', find: (v) => MOOD_OF[v] && { expression: MOODS[MOOD_OF[v]].person } },
    face: { note: 'A person shows a mood with the expression', find: (v) => MOOD_OF[v] && { expression: MOODS[MOOD_OF[v]].person } },
    mouth: { note: "A person's mouth follows the expression", find: (v) => MOUTH_EXPRESSION[v] && { expression: MOUTH_EXPRESSION[v] } },
    lip: { note: "A person's mouth follows the expression", find: (v) => MOUTH_EXPRESSION[v] && { expression: MOUTH_EXPRESSION[v] } },
  },
  robot: { expression: MOOD_RULE('A robot'), face: MOOD_RULE('A robot') },
  emoji: { expression: MOOD_RULE('An emoji'), face: MOOD_RULE('An emoji') },
};
/** Apply a capability mapping when the character lacks the part (or lacks that variant of it); null when nothing close exists. */
function viaCapability(ctx, s, part, value) {
  const rule = CAPABILITY[s.character]?.[part];
  const what = rule?.find(String(value ?? ''));
  if (!what) return null;
  if (what.expression) {
    s.person.expression = what.expression;
    return done(ctx, 'cap' + what.expression, `${rule.note}, so I made it ${EXPRESSION_SAY[what.expression] ?? displayOf(ctx, 'person', 'expression', what.expression)}.`);
  }
  Object.assign(s[s.character], MOODS[what.mood][s.character]);
  return done(ctx, 'cap' + what.mood, `${rule.note}, so I set both to look ${what.mood}.`);
}
/** Gender words (with common misspellings) -> man | woman | girl | boy, optionally old_ or little_ ("old man", "little girl"). */
const GENDER_OF = { man: 'man', men: 'man', mans: 'man', guy: 'man', gentleman: 'man', male: 'man', dude: 'man', woman: 'woman', women: 'woman', womans: 'woman', womens: 'woman', lady: 'woman', female: 'woman', wmoan: 'woman', girl: 'girl', girls: 'girl', gal: 'girl', boy: 'boy', boys: 'boy', lad: 'boy',
  little_girl: 'little_girl', small_girl: 'little_girl', little_boy: 'little_boy', small_boy: 'little_boy',
  old_man: 'old_man', elderly_man: 'old_man', grandfather: 'old_man', grandpa: 'old_man', old_woman: 'old_woman', elderly_woman: 'old_woman', grandmother: 'old_woman', grandma: 'old_woman', granny: 'old_woman' };
/** Presets per character: what hair and facial hair a man, woman, girl or boy gets (a character has no gender setting; the capability map). Ids are the style definitions'. */
const PRESETS = {
  person: {
    man: { set: { head: 'short2', facialHair: 'full' }, say: 'short neat hair and a short beard' },
    woman: { set: { head: 'long', facialHair: 'none' }, say: 'long hair and no beard' },
    girl: { set: { head: 'buns', facialHair: 'none' }, say: 'twin buns and no beard' },
    boy: { set: { head: 'short5', facialHair: 'none' }, say: 'short spiky hair and no beard' },
  },
  portrait: { man: { set: { hair: 'variant02', beard: 'none' } }, woman: { set: { hair: 'variant35', beard: 'none' } }, girl: { set: { hair: 'variant26', beard: 'none' } }, boy: { set: { hair: 'variant04', beard: 'none' } } },
  cartoon: { man: { set: { hair: 'dannyPhantom', facialHair: 'none', earrings: 'none' } }, woman: { set: { hair: 'full', facialHair: 'none', earrings: 'hoop' } }, girl: { set: { hair: 'pixie', facialHair: 'none', earrings: 'none' } }, boy: { set: { hair: 'dougFunny', facialHair: 'none', earrings: 'none' } } },
  kid: { girl: { set: { hair: 'bunHair' } }, boy: { set: { hair: 'shortHair' } } },
  pixel: { man: { set: { hair: 'short03', beard: 'none' } }, woman: { set: { hair: 'long03', beard: 'none' } }, girl: { set: { hair: 'long14', beard: 'none' } }, boy: { set: { hair: 'short06', beard: 'none' } } },
};
/** Colour key of the hair, per character (for "old": grey hair). */
const HAIR_COLOR = { person: 'headContrast', portrait: 'hair', cartoon: 'hair', kid: 'hair', pixel: 'hair' };
/** Moods the AV characters can show, as { mood: { component: variant id } } (the named ids of the style definitions; the numbered styles only have happy and sad mouths). */
const MOODS_X = {
  portrait: { happy: { mouth: 'happy01' }, sad: { mouth: 'sad01' } },
  cartoon: { happy: { eyes: 'smiling', mouth: 'smile' }, cheerful: { eyes: 'smiling', mouth: 'laughing' }, laughing: { eyes: 'smiling', mouth: 'laughing' }, sad: { eyes: 'round', mouth: 'sad' }, worried: { eyes: 'round', mouth: 'nervous' },
    surprised: { eyes: 'round', mouth: 'surprised' }, angry: { eyes: 'round', mouth: 'frown' }, cute: { eyes: 'smiling', mouth: 'pucker' }, smug: { eyes: 'round', mouth: 'smirk' }, suspicious: { eyes: 'round', mouth: 'smirk' }, cool: { eyes: 'smiling', mouth: 'smirk' } },
  kid: { happy: { eyes: 'cheery', mouth: 'teethSmile' }, cheerful: { eyes: 'starstruck', mouth: 'openedSmile' }, laughing: { eyes: 'cheery', mouth: 'openedSmile' }, sad: { eyes: 'sad', mouth: 'openSad' }, worried: { eyes: 'confused', mouth: 'awkwardSmile' },
    surprised: { eyes: 'starstruck', mouth: 'openedSmile' }, angry: { eyes: 'angry', mouth: 'unimpressed' }, cute: { eyes: 'starstruck', mouth: 'kawaii' }, sleepy: { eyes: 'sleepy', mouth: 'unimpressed' }, cheeky: { eyes: 'winking', mouth: 'gapSmile' }, serious: { eyes: 'normal', mouth: 'unimpressed' }, cool: { eyes: 'normal', mouth: 'gapSmile' } },
  pixel: { happy: { mouth: 'happy01' }, sad: { mouth: 'sad01' } },
  pixelbot: { happy: { eyes: 'happy', mouth: 'smile' }, cheerful: { eyes: 'happy', mouth: 'bigSmile' }, laughing: { eyes: 'happy', mouth: 'open' }, sad: { eyes: 'soft', mouth: 'flat' }, surprised: { eyes: 'wide', mouth: 'open' }, calm: { eyes: 'soft', mouth: 'smile' },
    serious: { eyes: 'slim', mouth: 'flat' }, sleepy: { eyes: 'slim', mouth: 'tiny' }, cool: { eyes: 'slim', mouth: 'smile' } },
  funemoji: { happy: { eyes: 'cute', mouth: 'lilSmile' }, cheerful: { eyes: 'stars', mouth: 'wideSmile' }, laughing: { eyes: 'closed2', mouth: 'smileLol' }, sad: { eyes: 'sad', mouth: 'sad' }, worried: { eyes: 'tearDrop', mouth: 'sad' },
    surprised: { eyes: 'plain', mouth: 'shout' }, scared: { eyes: 'crying', mouth: 'shout' }, angry: { eyes: 'pissed', mouth: 'pissed' }, furious: { eyes: 'pissed', mouth: 'shout' }, calm: { eyes: 'closed', mouth: 'lilSmile' }, serious: { eyes: 'plain', mouth: 'plain' },
    cute: { eyes: 'cute', mouth: 'cute' }, sleepy: { eyes: 'sleepClose', mouth: 'plain' }, cheeky: { eyes: 'wink', mouth: 'tongueOut' }, bored: { eyes: 'plain', mouth: 'plain' }, smug: { eyes: 'shades', mouth: 'lilSmile' }, loving: { eyes: 'love', mouth: 'kissHeart' }, cool: { eyes: 'shades', mouth: 'lilSmile' } },
};
/** What a character shows for a mood: a person expression id (string) or { eyes, mouth } style ids; undefined when the character cannot show it. */
const moodSpecOf = (ch, mood) => MOODS[mood]?.[ch] ?? MOODS_X[ch]?.[mood];
const moodIs = (now, spec) => (typeof spec === 'string' ? now.expression === spec : !!spec && Object.entries(spec).every(([k, v]) => now[k] === v));
const moodsOf = (s) => Object.keys(MOODS).filter((m) => moodIs(s[s.character], moodSpecOf(s.character, m)));
const applyMood = (s, ch, spec) => (typeof spec === 'string' ? (s[ch].expression = spec) : Object.assign(s[ch], spec));

// ---- operations: setting parts ----------------------------------------------------------------------------------
function _setPart(ctx, { part, value, n, text }) {
  const s = ensure(ctx);
  if (!value && part && n !== undefined && n !== '') return setPartByNumber(ctx, s, part, n);
  const lacks = PART_KEYS[part] && !PART_KEYS[part].some((k) => components(ctx, s.character).includes(k));
  if (lacks) { const via = viaCapability(ctx, s, part, value); if (via) return via; }
  const r = resolveVariant(ctx, s, { part, value, n, text });
  if (r.error) return no(r.error);
  if (r.none) {
    const via = viaCapability(ctx, s, part, value); if (via) return via;
    const label = String(part ?? value).replace(/_/g, ' ');
    return no(part ? `I do not know ${label} like "${String(value).replace(/_/g, ' ')}". Ask me what ${label} I can have.` : `I do not know how to look like that.`);
  }
  if (s[r.ch][r.key] === r.id && r.ch === s.character) return ok(`I already have ${phraseOf(ctx, r.ch, r.key, r.id)}.`);
  const note = apply(ctx, s, r);
  return done(ctx, r.key + r.id, `I have ${phraseOf(ctx, r.ch, r.key, r.id)} now.${note}`);
}

/** "Hair 13", "eyes 5": the variant of the part with that number (numbered styles) or at that place in the list. */
function setPartByNumber(ctx, s, part, n) {
  const { slot, error } = partSlot(ctx, s, part);
  if (error) return no(error);
  const ids = idsOf(entries(ctx, slot.ch, slot.key)).filter((x) => x !== 'none');
  const k = String(Number(n));
  const id = ids.find((x) => suffix(x) === k) ?? ids[Number(n) - 1];
  if (!id) return no(`My ${LABEL[slot.key]} goes from 1 to ${ids.length}.`);
  if (s[slot.ch][slot.key] === id) return ok(`I already have ${phraseOf(ctx, slot.ch, slot.key, id)}.`);
  const note = apply(ctx, s, { ch: slot.ch, key: slot.key, id });
  return done(ctx, slot.key + id, `I have ${phraseOf(ctx, slot.ch, slot.key, id)} now.${note}`);
}

/** A part named with words that are not a known variant: tell what is possible. */
function _setPartUnknown(ctx, { part, words }) {
  const s = ensure(ctx);
  const keys = PART_KEYS[part];
  if (!keys) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} is.`);
  const via = viaCapability(ctx, s, part, String(words ?? '').trim().replace(/ +/g, '_')); if (via) return via;
  const cand = slots(ctx, s, keys);
  if (!cand.length) return no(`I do not have that part.`);
  const sl = cand[0];
  return no(`I do not know ${LABEL[sl.key]} like "${String(words).trim()}". My ${LABEL[sl.key]} can be ${orList(listOptionsText(ctx, sl.ch, sl.key, 12).split(', '))}.`);
}

function partSlot(ctx, s, part) {
  const keys = PART_KEYS[part];
  if (!keys) return { error: `I do not know what my ${String(part).replace(/_/g, ' ')} is.` };
  const cand = slots(ctx, s, keys);
  if (!cand.length) return { error: 'I do not have that part.' };
  const { slot, error } = pickSlot(s, cand, `${part === 'eye' ? 'eyes of that kind' : String(part).replace(/_/g, ' ')}`);
  return error ? { error } : { slot };
}

function _step(ctx, { part, dir }) {
  const s = ensure(ctx);
  const { slot, error } = partSlot(ctx, s, part);
  if (error) return no(error);
  const list = entries(ctx, slot.ch, slot.key);
  const ids = idsOf(list);
  const cur = s[slot.ch][slot.key];
  const i = ids.indexOf(cur);
  let next;
  if (dir === 'next') next = ids[(i + 1) % ids.length];
  else if (dir === 'previous') next = ids[(i - 1 + ids.length) % ids.length];
  else {
    const others = ids.filter((x) => x !== cur);
    next = others[Math.floor(rng(`${s.seed}|${slot.ch}|${slot.key}|${cur}`)() * others.length)];
  }
  const note = apply(ctx, s, { ch: slot.ch, key: slot.key, id: next });
  return done(ctx, slot.key + next, `I have ${phraseOf(ctx, slot.ch, slot.key, next)} now.${note}`);
}

// ---- size words ("make your eyes bigger") -----------------------------------------------------------------------
/** Emoji eyes that really differ in size (checked on the drawings): small < pupils (and sparkle) < bigPupils. */
const BIGGER = new Set(['bigger', 'larger', 'wider', 'huger', 'rounder', 'big', 'large', 'huge', 'giant']);
const EMOJI_EYE_SIZE = ['small', 'pupils', 'bigPupils'];
/** Robot eyes: styles, not sizes. Square, visor and cyclops fill more of the screen than round and plus. */
const ROBOT_EYES_BIGGER = ['square', 'visor', 'cyclops'], ROBOT_EYES_SMALLER = ['round', 'plus'];
function _resizePart(ctx, { part, dir, assumed }) {
  const s = ensure(ctx);
  if (assumed) {
    const r = _resizePart(ctx, { part: 'eye', dir });
    const lead = 'I took that to mean my eyes. ';
    return { ...r, ...(r.value ? { value: lead + r.value } : {}), ...(r.note ? { note: lead + r.note } : {}) };
  }
  const grow = BIGGER.has(String(dir));
  const word = grow ? 'bigger' : 'smaller';
  const keys = PART_KEYS[part];
  if (!keys) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} is.`);
  const ch = s.character;
  if (keys.includes('eyes') && ch === 'emoji') {
    const cur = s.emoji.eyes;
    const rung = EMOJI_EYE_SIZE.includes(cur) ? EMOJI_EYE_SIZE.indexOf(cur) : cur === 'sparkle' ? 1 : -1;
    if (rung === -1) { // another look (closed, wink, angry ...): go to the plain pair that is bigger or smaller than the usual one
      s.emoji.eyes = grow ? 'bigPupils' : 'small';
      return done(ctx, 'eyes' + word, `My eyes are ${word} now: ${phraseOf(ctx, ch, 'eyes', s.emoji.eyes)}.`);
    }
    const next = EMOJI_EYE_SIZE[rung + (grow ? 1 : -1)];
    if (!next) return ok(`My eyes are already as ${grow ? 'big' : 'small'} as I can make them. I can change their style instead: say "what eyes can you have?"`);
    s.emoji.eyes = next;
    return done(ctx, 'eyes' + word, `My eyes are ${word} now: ${phraseOf(ctx, ch, 'eyes', next)}.`);
  }
  if (keys.includes('eyes') && ch === 'robot') {
    const pick = (grow ? ROBOT_EYES_BIGGER : ROBOT_EYES_SMALLER).filter((x) => x !== s.robot.eyes);
    return ok(`I cannot scale my eyes, but I can change their style. My eyes can be ${orList(listOptionsText(ctx, 'robot', 'eyes').split(', '))}. For ${word} eyes try ${orList(pick)}; say "make your eyes ${pick[0]}".`);
  }
  if (keys.includes('eyes') && ch === 'person') {
    const via = viaCapability(ctx, s, 'eye', grow ? 'bigger' : 'smaller');
    if (via) return via;
    return ok(`My eyes come with my expression. For ${grow ? 'wider eyes try awe, hectic or fear' : 'narrower eyes try tired, contempt or eyes closed'}; say "make your expression ${grow ? 'awe' : 'tired'}".`);
  }
  const key = keys.find((k) => components(ctx, ch).includes(k));
  if (!key) return no(`I am ${spoken(ch)}, so I have no ${String(part).replace(/_/g, ' ')} to resize.`);
  return ok(`I cannot change the size of my ${LABEL[key]}, but I can change its style. My ${LABEL[key]} can be ${orList(listOptionsText(ctx, ch, key, 12).split(', '))}.`);
}

function _resetPart(ctx, { part }) {
  const s = ensure(ctx);
  const { slot, error } = partSlot(ctx, s, part);
  if (error) return no(error);
  const note = apply(ctx, s, { ch: slot.ch, key: slot.key, id: defaultOf(ctx, slot.ch, slot.key) });
  return done(ctx, 'reset' + slot.key, `I have ${phraseOf(ctx, slot.ch, slot.key, s[slot.ch][slot.key])} again.${note}`);
}

// ---- take off ---------------------------------------------------------------------------------------------------
function takeOff(ctx, s, ch, key) {
  const cur = s[ch][key];
  if (cur === 'none') return { already: true };
  if (optional(ctx, ch).includes(key)) { s[ch][key] = 'none'; return { taken: cur, result: 'none' }; }
  if (key === 'head' && entries(ctx, ch, key).some((e) => e.id === cur && e.word.startsWith('hat'))) {
    const dflt = defaultOf(ctx, ch, key);
    s[ch][key] = dflt;
    return { taken: cur, result: dflt };
  }
  return { cannot: true };
}
function _removePart(ctx, { part, value, text }) {
  const s = ensure(ctx);
  let ch, key, id;
  if (value) {
    const r = resolveVariant(ctx, s, { part, value, text });
    if (r.error) return no(r.error);
    if (r.none) return no(`I am not wearing ${String(value).replace(/_/g, ' ')}.`);
    ({ ch, key, id } = r);
    const cur = ch === s.character ? s[ch][key] : null;
    const word = String(value);
    const has = entries(ctx, ch, key).some((e) => e.id === cur && e.word === word);
    if (!has) {
      if (!cur || cur === 'none') return ok(`I am not wearing ${String(value).replace(/_/g, ' ')} right now.`);
      return ok(`I am not wearing ${String(value).replace(/_/g, ' ')}. I have ${phraseOf(ctx, ch, key, cur)}.`);
    }
  } else {
    const { slot, error } = partSlot(ctx, s, part);
    if (error) return no(error);
    ({ ch, key } = slot);
    if (ch !== s.character) return no(`I am ${spoken(s.character)}; ${spoken(ch)} could do that.`);
  }
  const t = takeOff(ctx, s, ch, key);
  if (t.already) return ok(`I have ${phraseOf(ctx, ch, key, 'none')} already.`);
  if (t.cannot) return no(`I cannot take off my ${LABEL[key]}, but I can change it. Ask me for a different one.`);
  return done(ctx, 'off' + key, t.result === 'none' ? `I took off ${phraseOf(ctx, ch, key, t.taken)}.` : `I took off ${phraseOf(ctx, ch, key, t.taken)}. Now I have ${phraseOf(ctx, ch, key, t.result)}.`);
}
function _removeAll(ctx) {
  const s = ensure(ctx), ch = s.character;
  let n = 0;
  for (const key of components(ctx, ch)) if (s[ch][key] !== 'none' && (optional(ctx, ch).includes(key) ? (s[ch][key] = 'none', true) : takeOff(ctx, s, ch, key).taken)) n++;
  return n ? done(ctx, 'alloff', 'I took off everything I could.') : ok('There is nothing to take off.');
}

// ---- colors -----------------------------------------------------------------------------------------------------
function colorSlot(s, ctx, part) {
  const map = COLOR_KEYS[part];
  if (!map) return { error: `I do not know what my ${String(part).replace(/_/g, ' ')} color is.` };
  if (map[s.character]) return { ch: s.character, key: map[s.character] };
  const chars = CORE.filter((c) => map[c]);
  if (chars.length === 1) {
    const what = part === 'eye' ? 'eye color' : `${String(part).replace(/_/g, ' ')} color`;
    return { error: offer(s, chars[0], what).replace(/ does\./, part === 'eye' ? ' does: its eyes glow in any color.' : ' does.') };
  }
  return { error: `${spoken(s.character).replace(/^an? /, 'A ')} has no ${String(part).replace(/_/g, ' ')} color. ${chars.length ? `${orList(chars.map(spoken)).replace(/^./, (c) => c.toUpperCase())} does.` : ''}`.trim() };
}
const colorSentence = (ctx, key, part, name) => {
  const [label, verb] = COLOR_SAY[key] ?? [key, 'is'];
  return part === 'eye' ? `My eyes glow ${name} now.` : `My ${label} ${verb} ${name} now.`;
};
function _setColor(ctx, { part, color }) {
  const s = ensure(ctx);
  const target = hexOfName(ctx, color);
  if (!target) return no(`I do not know the color ${String(color).replace(/_/g, ' ')}.`);
  const cs = colorSlot(s, ctx, part);
  if (cs.error) return no(cs.error);
  const { ch, key } = cs;
  const avoid = NOT_EQUAL[key] ? s[ch].colors[NOT_EQUAL[key]] : undefined;
  const hex = nearest(ctx, ch, key, target, avoid);
  if (!hex) return no('I have no colors to choose from.');
  const from = s.character;
  const was = s[ch].colors[key];
  s.character = ch;
  s[ch].colors[key] = hex;
  const want = String(color).replace(/_/g, ' ');
  const near = dist(hex, target) < 4000;
  const name = near ? want : nameOfHex(ctx, hex, key);
  const close = !near && name !== want ? ` I do not have ${want} for that; ${name} is the closest.` : '';
  if (was === hex && from === ch && !close) return ok(`That color is already my ${COLOR_SAY[key]?.[0] ?? key} color.`);
  return done(ctx, key + hex, `${colorSentence(ctx, key, part, name)}${close}${switchNote(from, ch)}`);
}
function _shiftColor(ctx, { part, dir }) {
  const s = ensure(ctx);
  const cs = colorSlot(s, ctx, part);
  if (cs.error) return no(cs.error);
  const { ch, key } = cs;
  const avoid = NOT_EQUAL[key] ? s[ch].colors[NOT_EQUAL[key]] : undefined;
  const pal = palette(ctx, ch, key).filter((h) => h !== avoid).sort((x, y) => luma(x) - luma(y));
  const cur = s[ch].colors[key];
  const up = dir === 'lighter' || dir === 'brighter' || dir === 'paler';
  const candidates = pal.filter((h) => (up ? luma(h) > luma(cur) : luma(h) < luma(cur)));
  if (!candidates.length) return ok(`My ${COLOR_SAY[key]?.[0] ?? key} is already as ${up ? 'light' : 'dark'} as I can make it.`);
  const hex = up ? candidates[0] : candidates.at(-1);
  const from = s.character;
  s.character = ch; s[ch].colors[key] = hex;
  return done(ctx, key + hex, `${colorSentence(ctx, key, part, nameOfHex(ctx, hex, key))}${switchNote(from, ch)}`);
}
function _askColor(ctx, { part }) {
  const s = ensure(ctx);
  const map = COLOR_KEYS[part];
  if (!map) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} color is.`);
  const key = map[s.character];
  if (!key) return no(`${spoken(s.character).replace(/^an? /, 'A ')} has no ${String(part).replace(/_/g, ' ')} color.`);
  const name = nameOfHex(ctx, s[s.character].colors[key], key);
  const [label, verb] = COLOR_SAY[key] ?? [key, 'is'];
  return ok(part === 'eye' ? `My eyes glow ${name}.` : `My ${label} ${verb} ${name}.`);
}
function _listColors(ctx, { part }) {
  const s = ensure(ctx);
  if (!part) {
    const keys = colorKeys(ctx, s.character);
    return ok(`I can change my ${andList(keys.map((k) => COLOR_SAY[k]?.[0] ?? k))}. Ask what colors a part can be, for example my ${COLOR_SAY[keys[0]]?.[0] ?? keys[0]}.`);
  }
  const map = COLOR_KEYS[part];
  const key = map?.[s.character];
  if (!key) return no(`${spoken(s.character).replace(/^an? /, 'A ')} has no ${String(part).replace(/_/g, ' ')} color.`);
  const names = [...new Set(palette(ctx, s.character, key).map((h) => nameOfHex(ctx, h, key)))];
  return ok(`My ${COLOR_SAY[key]?.[0] ?? key} can be ${orList(names)}. Other color names get the closest of these.`);
}

// ---- random and seeds -------------------------------------------------------------------------------------------
function randomize(ctx, s, ch, seed, differ) {
  const r = rng(`${seed}:${ch}`);
  for (const key of components(ctx, ch)) {
    const ids = idsOf(entries(ctx, ch, key)).filter((x) => x !== 'none');
    const old = s[ch][key];
    let pick;
    if (optional(ctx, ch).includes(key) && r() < (NONE_PROBABILITY[key] ?? 0.3)) pick = 'none';
    else pick = ids[Math.floor(r() * ids.length)];
    if (differ && pick === old) { const rest = [...ids, ...(optional(ctx, ch).includes(key) ? ['none'] : [])].filter((x) => x !== old); pick = rest[Math.floor(r() * rest.length)]; }
    s[ch][key] = pick;
  }
  for (const key of colorKeys(ctx, ch)) {
    const avoid = NOT_EQUAL[key] ? s[ch].colors[NOT_EQUAL[key]] : undefined;
    let pal = palette(ctx, ch, key).filter((h) => h !== avoid);
    if (differ && pal.length > 1) pal = pal.filter((h) => h !== s[ch].colors[key]);
    s[ch].colors[key] = pal[Math.floor(r() * pal.length)];
  }
}
const newSeed = () => Math.random().toString(36).slice(2, 8);
function _surprise(ctx, { mode }) {
  const s = ensure(ctx);
  const seed = newSeed();
  s.seed = seed;
  randomize(ctx, s, s.character, seed, mode === 'everything');
  return done(ctx, 'surprise' + seed, mode === 'everything' ? `I changed everything. My seed is ${seed}.` : `Surprise! My new look has the seed ${seed}.`);
}
function _setSeed(ctx, { seed }) {
  const s = ensure(ctx);
  const text = String(seed ?? '').trim().replace(/[.!?]+$/, '');
  if (!text) return no('Which seed should I use?');
  s.seed = text;
  randomize(ctx, s, s.character, text, false);
  return done(ctx, 'seed' + text, `I used the seed ${text} to draw myself. The same seed always gives the same look.`);
}
function _askSeed(ctx) { return ok(`My seed is ${ensure(ctx).seed}.`); }

// ---- characters, mood, name, reset, animation -------------------------------------------------------------------
const charOf = (ctx, who) => ctx.lexicon(`${DATA}characters`).map((w) => w.split(':')).find(([w]) => w === who)?.[1];
const GALLERY = (s) => CHARACTERS.map((c, i) => `${i + 1} ${spoken(c).replace(/^an? /, '')}${c === s.character ? ' (now)' : ''}`);
function _setCharacter(ctx, { who, kind, mood, with: add, without }) {
  const s = ensure(ctx);
  const gender = kind && GENDER_OF[String(kind)];
  const ch0 = who ? charOf(ctx, who) : null;
  if (gender) return setLook(ctx, s, gender, mood, ch0 && ch0 !== 'person' ? ch0 : null, { add, without });
  if (!ch0) return no(`I can be ${orList(CHARACTERS.map(spoken))}, but not ${String(who).replace(/_/g, ' ')}.`);
  const ch = ch0;
  if (s.character === ch) return ok(`I am ${spoken(ch)} already.`);
  s.character = ch;
  const m = mood && MOOD_OF[mood];
  if (m && moodSpecOf(ch, m)) applyMood(s, ch, moodSpecOf(ch, m));
  return done(ctx, 'become' + ch, `Now I am ${spoken(ch)}. ${describeShort(ctx, s)}`);
}
/** Set or take off the thing named by an option word ("with glasses", "without a beard") on the active character. */
function accessory(ctx, s, word, on) {
  const ch = s.character;
  for (const key of components(ctx, ch)) {
    const hit = entries(ctx, ch, key).filter((e) => e.word === word);
    if (!hit.length) continue;
    if (on) { s[ch][key] = hit.find((e) => !suffix(e.id))?.id ?? hit[0].id; return phraseOf(ctx, ch, key, s[ch][key]); }
    if (optional(ctx, ch).includes(key)) { s[ch][key] = 'none'; return phraseOf(ctx, ch, key, 'none'); }
  }
  return null;
}
/** "Make the avatar a woman" / "become a little girl" / "a pixel woman": the hair and facial hair of that kind of person on a character that can show it, optionally with a mood. */
function setLook(ctx, s, kind, mood, wanted, { add, without } = {}) {
  const [, age, base] = /^(?:(old|little)_)?(.+)$/.exec(kind);
  const has = (c) => !!PRESETS[c]?.[base];
  const ch = wanted ?? (age === 'little' && has('kid') ? 'kid' : has(s.character) ? s.character : 'person');
  const preset = PRESETS[ch]?.[base];
  if (!preset) return no(`${cap(spoken(ch))} does not come as ${a(base)} ${base}. ${cap(orList(CHARACTERS.filter(has).map(spoken)))} can.`);
  const was = s.character;
  s.character = ch;
  Object.assign(s[ch], preset.set);
  const m = mood && MOOD_OF[mood];
  const spec = m && moodSpecOf(ch, m);
  if (spec) applyMood(s, ch, spec);
  const hairKey = HAIR_COLOR[ch];
  if (age === 'old' && hairKey) s[ch].colors[hairKey] = nearest(ctx, ch, hairKey, hexOfName(ctx, 'gray'));
  const extra = [];
  const wantAdd = add && accessory(ctx, s, String(add), true);
  if (wantAdd) extra.push(wantAdd);
  const wantNot = without && accessory(ctx, s, String(without), false);
  if (wantNot) extra.push(wantNot);
  const missed = [add && !wantAdd && `give ${spoken(ch)} ${String(add).replace(/_/g, ' ')}`, without && !wantNot && `take ${String(without).replace(/_/g, ' ')} off ${the(ch)}`].filter(Boolean);
  const face = spec ? ` and look ${moodWord(mood)}` : '';
  const oldHair = age === 'old' && hairKey ? ' and gray hair' : '';
  const turned = was === ch ? '' : `Now I am ${spoken(ch)}. `;
  const look = preset.say ?? andList(Object.entries(preset.set).map(([k, v]) => phraseOf(ctx, ch, k, v)).filter((x) => !/^no /.test(x)));
  const kindWord = age ? `${age === 'old' ? 'an old' : 'a little'} ${base}` : `${a(base)} ${base}`;
  const more = extra.length ? ` and ${andList(extra)}` : '';
  const spokenLook = `${look}${more}${oldHair}${face}${missed.length ? ` (I could not ${andList(missed)}.)` : ''}`;
  if (ch === 'person' && !age) return done(ctx, 'look' + kind + (m ?? ''), `${turned}A person shows being ${kindWord} through hair, so I gave myself ${spokenLook}.`);
  return done(ctx, 'look' + kind + ch + (m ?? ''), `${turned}Here is ${kindWord}: I have ${spokenLook}.`);
}
/** "The third one", "next character": pick a character of the gallery by its number (1 = robot ... see GALLERY) or step through it. */
function _pickCharacter(ctx, { n, dir }) {
  const s = ensure(ctx);
  const i = CHARACTERS.indexOf(s.character);
  let to;
  if (dir) to = CHARACTERS[(i + (/^(prev|back|last|before)/.test(String(dir)) ? -1 : 1) + CHARACTERS.length) % CHARACTERS.length];
  else {
    const k = Number(n);
    to = k < 0 ? CHARACTERS.at(k) : CHARACTERS[k - 1];
    if (!to) return no(`I have ${CHARACTERS.length} characters: ${GALLERY(s).join(', ')}.`);
  }
  if (to === s.character) return ok(`I am ${spoken(to)} already.`);
  s.character = to;
  return done(ctx, 'pick' + to, `Now I am ${spoken(to)}. ${describeShort(ctx, s)}`);
}
function _askCharacter(ctx, { who } = {}) {
  const s = ensure(ctx);
  if (who) {
    const hit = charOf(ctx, who);
    if (hit) return ok(hit === s.character ? `Yes, I am ${spoken(hit)}.` : `No, I am ${spoken(s.character)}; I can become ${spoken(hit)} if you like.`);
  }
  const others = CHARACTERS.filter((c) => c !== s.character).map(spoken);
  return ok(`I am ${spoken(s.character)}, drawn by the DiceBear library. I can also become ${orList(others)}.`);
}
function _listCharacters(ctx) {
  const s = ensure(ctx);
  return ok(`I can be ${andList(CHARACTERS.map(spoken))}. Right now I am ${spoken(s.character)}. Pick one in the gallery, say "become a person" or "the third one", or ask for a woman, a man, a girl or a boy.`);
}
function _setMood(ctx, { mood }) {
  const s = ensure(ctx);
  const m = MOOD_OF[mood];
  if (!m) return no(`I do not know how to look ${String(mood).replace(/_/g, ' ')}.`);
  const ch = s.character, spec = moodSpecOf(ch, m);
  if (!spec) return no(`${cap(spoken(ch))} cannot look ${moodWord(mood)}. It can look ${orList(Object.keys(MOODS_X[ch] ?? {}))}.`);
  applyMood(s, ch, spec);
  return done(ctx, 'mood' + m, `Now I look ${moodWord(mood)}.`);
}
function _checkMood(ctx, { mood }) {
  const s = ensure(ctx);
  const m = MOOD_OF[mood];
  if (!m) return no(`I do not know what ${String(mood).replace(/_/g, ' ')} looks like.`);
  const spec = moodSpecOf(s.character, m), now = s[s.character];
  const word = moodWord(mood);
  if (moodIs(now, spec)) return ok(`Yes, I look ${word}.`);
  const mine = moodsOf(s);
  return ok(`No, I do not look ${word}${mine.length ? `; I look ${mine[0]}` : ''}.`);
}
function _askMood(ctx) {
  const s = ensure(ctx), ch = s.character;
  const mine = moodsOf(s);
  if (mine.length) return ok(`I feel ${mine[0]}.`);
  const bits = ['expression', 'eyes', 'mouth'].filter((k) => components(ctx, ch).includes(k)).map((k) => phraseOf(ctx, ch, k, s[ch][k]));
  return ok(`I have ${andList(bits)}.`);
}
function _setName(ctx, { name }) {
  const n = String(name ?? '').trim().replace(/[.!?]+$/, '');
  // "call me Andy" names the user, not the avatar; only "call yourself X" / "your name is X" name the avatar
  const me = /^me\s+(?:as\s+|by\s+|the name\s+)?(\S.*)$/i.exec(n);
  if (me) { const r = ctx.request('chat.meet', { name: me[1] }); if (r?.status === 'supported') return ok(r.value); }
  if (!n) return no('What should my name be?');
  if (n.length > 40) return no('That name is too long for me.');
  ensure(ctx).name = n;
  return ok(`Nice! From now on my name is ${n}.`);
}
function _askName(ctx) { return ok(`My name is ${ensure(ctx).name}.`); }
/** The bare name: the assistant and the avatar are one character, so kids.common reads it through ctx.request('avatar.nameOf'). */
export function nameOf(ctx) { return ok(ensure(ctx).name); }
function _reset(ctx, { scope }) {
  const s = ensure(ctx), keep = s.name, d = initialState(), undo = s.undo;
  if (scope === 'all') {
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, d, { name: keep });
    if (undo) s.undo = undo;
    return done(ctx, 'resetall', 'I started over as the robot.');
  }
  const ch = s.character;
  s[ch] = d[ch] ?? defaultLook(ctx, ch);
  s.seed = d.seed;
  return done(ctx, 'reset' + ch, `I am back to my normal look as ${spoken(ch)}.`);
}
function _animate(ctx, { anim }) {
  const name = ANIM_OF[anim];
  if (!name) return no(`I do not know how to ${String(anim).replace(/_/g, ' ')}.`);
  ctx.effect('avatar.animate', { name });
  ctx.request('ui.openTab', { tab: 'robot' });
  return ok(ANIM_SAY[name]);
}

// ---- questions ---------------------------------------------------------------------------------------------------
function _askParts(ctx) {
  const s = ensure(ctx), ch = s.character;
  const comps = components(ctx, ch).map((k) => LABEL[k] ?? k);
  const cols = colorKeys(ctx, ch).map((k) => COLOR_SAY[k]?.[0] ?? k);
  return ok(`I am ${spoken(ch)}. You can change my ${andList(comps)}, and my colors: ${andList(cols)}. `
    + `Ask "what eyes can you have?" for the choices, say "next ${PART_EXAMPLE[ch]}" or "surprise me", or tell me to become ${orList(CHARACTERS.filter((c) => c !== ch).map(spoken))}.`);
}
const PART_EXAMPLE = { robot: 'eyes', person: 'hair', emoji: 'mouth', portrait: 'hair', cartoon: 'hair', kid: 'hair', pixel: 'hair', pixelbot: 'eyes', funemoji: 'mouth' };
function _listOptions(ctx, { part }) {
  const s = ensure(ctx);
  const keys = PART_KEYS[part];
  if (!keys) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} is.`);
  const cand = slots(ctx, s, keys);
  if (!cand.length) return no('I do not have that part.');
  const mine = cand.filter((c) => c.ch === s.character);
  if (mine.length) {
    const sl = mine[0];
    const names = listOptionsText(ctx, sl.ch, sl.key).split(', ');
    return ok(`My ${LABEL[sl.key]} can be ${orList(names)}.${optional(ctx, sl.ch).includes(sl.key) ? ' I can also have none.' : ''}`);
  }
  const first = cand[0];
  const who = [...new Set(cand.map((c) => spoken(c.ch)))].map((x) => `${x}'s`);
  return ok(`${orList(who).replace(/^./, (c) => c.toUpperCase())} ${LABEL[first.key]} can be ${orList(listOptionsText(ctx, first.ch, first.key).split(', '))}. I am ${spoken(s.character)}, so tell me to become ${spoken(first.ch)} first.`);
}
function _askPart(ctx, { part }) {
  const s = ensure(ctx);
  const keys = PART_KEYS[part];
  if (!keys) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} is.`);
  const key = keys.find((k) => components(ctx, s.character).includes(k));
  if (!key) {
    const other = slots(ctx, s, keys).find((c) => c.ch !== s.character);
    return ok(`I am ${spoken(s.character)}, so I have no ${String(part).replace(/_/g, ' ')} to show.${other ? ` ${spoken(other.ch).replace(/^./, (c) => c.toUpperCase())} does.` : ''}`);
  }
  const id = s[s.character][key];
  return ok(`I have ${phraseOf(ctx, s.character, key, id)}.`);
}
function _hasThing(ctx, { part, value, text }) {
  const s = ensure(ctx), ch = s.character;
  if (value) {
    const word = String(value).replace(/_/g, ' ');
    for (const key of components(ctx, ch)) {
      const cur = s[ch][key];
      if (cur !== 'none' && entries(ctx, ch, key).some((e) => e.id === cur && e.word === value)) return ok(`Yes, I have ${phraseOf(ctx, ch, key, cur)}.`);
    }
    const exists = slots(ctx, s, null).some((sl) => entries(ctx, sl.ch, sl.key).some((e) => e.word === value));
    return ok(exists ? `No, I do not have ${a(word) ? `${a(word)} ` : ''}${word} right now.` : `No, I do not know what ${word} is.`);
  }
  const keys = PART_KEYS[part];
  if (!keys) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} is.`);
  const key = keys.find((k) => components(ctx, ch).includes(k));
  if (!key) return ok(`No, ${spoken(ch)} does not have ${String(part).replace(/_/g, ' ')}.`);
  const cur = s[ch][key];
  return cur === 'none' ? ok(`No, I have ${phraseOf(ctx, ch, key, 'none')}.`) : ok(`Yes, I have ${phraseOf(ctx, ch, key, cur)}.`);
}
function _askWearing(ctx) {
  const s = ensure(ctx), ch = s.character;
  if (ch === 'person') {
    const p = s.person, bits = [];
    if (p.accessories !== 'none') bits.push(phraseOf(ctx, ch, 'accessories', p.accessories));
    if (p.mask !== 'none') bits.push(phraseOf(ctx, ch, 'mask', p.mask));
    if (entries(ctx, ch, 'head').some((e) => e.id === p.head && e.word.startsWith('hat'))) bits.push(`${a(displayOf(ctx, ch, 'head', p.head))} ${displayOf(ctx, ch, 'head', p.head)}`);
    return ok(bits.length ? `I am wearing ${andList(bits)}.` : 'I am not wearing anything special.');
  }
  if (ch === 'robot') {
    const r = s.robot, bits = [];
    if (r.top !== 'none') bits.push(phraseOf(ctx, ch, 'top', r.top));
    if (r.chest !== 'none') bits.push(phraseOf(ctx, ch, 'chest', r.chest));
    return ok(`I am a robot, so I do not wear clothes. ${bits.length ? `I have ${andList(bits)}.` : 'I have nothing extra on me.'}`);
  }
  if (!CORE.includes(ch)) {
    const bits = components(ctx, ch).filter((k) => optional(ctx, ch).includes(k) && s[ch][k] !== 'none').map((k) => phraseOf(ctx, ch, k, s[ch][k]));
    return ok(bits.length ? `I am wearing ${andList(bits)}.` : 'I am not wearing anything special.');
  }
  return ok('I am an emoji. I only have a face, eyes, a mouth and cheeks, so I do not wear anything.');
}
function describeShort(ctx, s) {
  const ch = s.character, v = s[ch];
  const bits = components(ctx, ch).filter((k) => v[k] !== 'none').map((k) => phraseOf(ctx, ch, k, v[k]));
  return `I have ${andList(bits)}.`;
}
function _describe(ctx) {
  const s = ensure(ctx), ch = s.character, v = s[ch];
  const name = (hex, k) => nameOfHex(ctx, hex, k);
  const bits = components(ctx, ch).filter((k) => v[k] !== 'none').map((k) => phraseOf(ctx, ch, k, v[k]));
  const nones = components(ctx, ch).filter((k) => v[k] === 'none' && NONE_PHRASE[k]).map((k) => NONE_PHRASE[k]);
  const colors = colorKeys(ctx, ch).map((k) => { const [label, verb] = COLOR_SAY[k] ?? [k, 'is']; return `my ${label} ${verb} ${name(v.colors[k], k)}`; });
  const first = `I am ${s.name}, ${spoken(ch)}. I have ${andList(bits)}${nones.length ? `, and ${andList(nones)}` : ''}.`;
  return ok(`${first} ${colors.join(', ').replace(/^./, (c) => c.toUpperCase())}.`);
}

// ---- undo, confirmation and history -----------------------------------------------------------------------------
// Every operation below is wrapped: when it changes the avatar, the state before it is pushed on `undo` (max 20).
// An operation that cannot do something for the active character but another character can does not switch silently:
// it sets `pending` + inputMode 'confirm' and tells the user to say yes; interceptInput then switches (and repeats the command).
const snap = (s) => structuredClone(Object.fromEntries(['character', 'seed', ...CHARACTERS].filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));
const record = (s, pre) => {
  if (JSON.stringify(pre) === JSON.stringify(snap(s))) return;
  (s.undo ??= []).push(pre);
  if (s.undo.length > 20) s.undo.shift();
};
const W = (fn, name) => (ctx, args = {}) => {
  const s = ensure(ctx), pre = snap(s), prev = CURRENT;
  CURRENT = { fn: name, args };
  try { return fn(ctx, args); } finally { CURRENT = prev; record(s, pre); }
};

/** Go back to the look before the last change (also when that change was a switch of character). */
export function undo(ctx) {
  const s = ensure(ctx);
  const before = s.undo?.pop();
  if (!before) return { status: 'missing', note: 'There is nothing to undo.' };
  const was = s.character;
  Object.assign(s, structuredClone(before));
  return done(ctx, 'undo', `I went back to how I was before${was !== s.character ? `: I am ${spoken(s.character)} again` : ''}.`);
}

/** "Why did you turn into a robot?": apologise, say why, and offer the way back. */
export function explainSwitch(ctx, { who } = {}) {
  const s = ensure(ctx);
  const before = [...(s.undo ?? [])].reverse().find((x) => x.character !== s.character);
  const hit = who ? ctx.lexicon(`${DATA}characters`).map((w) => w.split(':')).find(([w]) => w === who) : null;
  if (hit && hit[1] !== s.character) return ok(`I am ${spoken(s.character)} now, not ${spoken(hit[1])}.`);
  if (!before) {
    const last = s.undo?.at(-1);
    const keys = last ? Object.keys(s[s.character] ?? {}).filter((k) => k !== 'colors' && JSON.stringify(last[s.character]?.[k]) !== JSON.stringify(s[s.character][k])) : [];
    const colors = last ? Object.keys(s[s.character]?.colors ?? {}).filter((k) => last[s.character]?.colors?.[k] !== s[s.character].colors[k]) : [];
    const what = [...keys.map((k) => `my ${LABEL[k] ?? k}`), ...colors.map((k) => `my ${(COLOR_SAY[k] ?? [k])[0]}`)];
    if (what.length) return ok(`I am sorry about that! I changed ${andList(what)}, because I understood that is what you asked for. Say "undo" to go back.`);
    return ok(`I am sorry if something looks wrong. I did not change my character: I am ${spoken(s.character)}, and I have not changed anything yet. Tell me what you would like different, or say "undo" after a change to go back.`);
  }
  return ok(`I am sorry about that! I turned into ${spoken(s.character)} because I thought you wanted something only ${the(s.character)} has, and I should have asked first. `
    + `To go back, say "undo", or say "become ${spoken(before.character)}". From now on I will ask before I change my character.`);
}

/** Color key a colored variant ("a red hat") can take, per character and component: [spoken part, color key]. */
const PAINT = { person: { head: ['hair', 'headContrast'] }, robot: { eyes: ['eye', 'glow'] } };
function _setPartColored(ctx, { part, value, color, n, text }) {
  const s = ensure(ctx);
  const target = hexOfName(ctx, color);
  if (!target) return no(`I do not know the color ${String(color).replace(/_/g, ' ')}.`);
  const r = resolveVariant(ctx, s, { part, value, n, text });
  if (r.error) return no(r.error);
  if (r.none) return no(`I do not know ${String(value).replace(/_/g, ' ')} like that. Ask me what I can have.`);
  const before = JSON.stringify([s[r.ch][r.key], s[r.ch].colors, s.character]);
  const note = apply(ctx, s, r);
  const paint = PAINT[r.ch]?.[r.key];
  const want = String(color).replace(/_/g, ' ');
  if (!paint) return done(ctx, r.key + r.id, `I have ${phraseOf(ctx, r.ch, r.key, r.id)} now, but I cannot color it ${want} on its own.${note}`);
  const ckey = paint[1];
  const avoid = NOT_EQUAL[ckey] ? s[r.ch].colors[NOT_EQUAL[ckey]] : undefined;
  const hex = nearest(ctx, r.ch, ckey, target, avoid);
  s[r.ch].colors[ckey] = hex;
  const near = dist(hex, target) < 4000;
  const shown = near ? want : nameOfHex(ctx, hex, ckey);
  const close = near ? '' : ` I do not have ${want} for that; ${shown} is the closest.`;
  if (before === JSON.stringify([s[r.ch][r.key], s[r.ch].colors, s.character])) return ok(`I already have ${say(r.key, `${shown} ${displayOf(ctx, r.ch, r.key, r.id)}`)}.`);
  return done(ctx, r.key + r.id + hex, `I have ${say(r.key, `${shown} ${displayOf(ctx, r.ch, r.key, r.id)}`)} now.${close}${note}`);
}

const REPLAY = { setCharacter: _setCharacter, pickCharacter: _pickCharacter, setPart: _setPart, step: _step, resetPart: _resetPart, removePart: _removePart, setColor: _setColor, shiftColor: _shiftColor, setPartColored: _setPartColored, resizePart: _resizePart };

/** Modal input (spec 07 section 2): answers "yes" or "no" to an offer to become another character. */
export function interceptInput(ctx, text) {
  const s = ctx.state;
  if (s.inputMode !== 'confirm') return { handled: false };
  const p = s.pending;
  s.pending = null; s.inputMode = null;
  const t = String(text).trim();
  if (!p) return { handled: false };
  // yes/no/cancel words are the shared ones of lang.common (ctx.lang.yesNo: "sure thing" yes; "nah", "stay", "never mind" no)
  const yn = ctx.lang.yesNo(t);
  if (yn === 'no') return { handled: true, reply: `OK, I stay ${spoken(s.character)}.` };
  if (yn !== 'yes') return { handled: false };
  ensure(ctx);
  const pre = snap(s);
  s.character = p.character;
  const fn = p.replay && REPLAY[p.replay.fn];
  const strip = (x) => String(x ?? '').replace(/^(Done|Okay|Sure|Ta-da|There you go)! /, '');
  const reply = fn
    ? `Now I am ${spoken(p.character)}. ${strip((r => r.value ?? r.note)(fn(ctx, p.replay.args)))}`
    : `Now I am ${spoken(p.character)}. ${describeShort(ctx, s)}`;
  if (!fn) { ensure(ctx); caption(ctx); ctx.request('ui.openTab', { tab: 'robot' }); }
  record(s, pre);
  return { handled: true, reply: reply.trim() };
}

export const setPart = W(_setPart, 'setPart');
export const setPartUnknown = W(_setPartUnknown, 'setPartUnknown');
export const step = W(_step, 'step');
export const resizePart = W(_resizePart, 'resizePart');
export const resetPart = W(_resetPart, 'resetPart');
export const removePart = W(_removePart, 'removePart');
export const removeAll = W(_removeAll, 'removeAll');
export const setColor = W(_setColor, 'setColor');
export const shiftColor = W(_shiftColor, 'shiftColor');
export const surprise = W(_surprise, 'surprise');
export const setSeed = W(_setSeed, 'setSeed');
export const setCharacter = W(_setCharacter, 'setCharacter');
export const pickCharacter = W(_pickCharacter, 'pickCharacter');
export const setMood = W(_setMood, 'setMood');
export const reset = W(_reset, 'reset');
export const askColor = _askColor;
export const listColors = _listColors;
export const askSeed = _askSeed;
export const askCharacter = _askCharacter;
export const listCharacters = _listCharacters;
export const checkMood = _checkMood;
export const askMood = _askMood;
export const setName = _setName;
export const askName = _askName;
export const animate = _animate;
export const askParts = _askParts;
export const listOptions = _listOptions;
export const askPart = _askPart;
export const hasThing = _hasThing;
export const askWearing = _askWearing;
export const describe = _describe;
export const setPartColored = W(_setPartColored, 'setPartColored');
