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
//   Component values are DiceBear variant ids (`none` = component hidden); colors are 6-digit hex entries of the style palette.
// Effects: avatar.animate { name: wink|nod|dance|wave|spin|jump|bounce|wiggle|blink|shake } (a moment, not stored state).
// Every command that changes the avatar brings its tab forward: ctx.request('ui.openTab', { tab: 'robot' }).

const CHARACTERS = ['robot', 'person', 'emoji'];
const DATA = 'lex.ui.avatar.data.';

export function initialState() {
  return {
    character: 'robot', name: 'PSys2', seed: 'psys2',
    robot: { eyes: 'round', mouth: 'smile', top: 'antenna', chest: 'buttons', colors: { body: '74c0fc', accent: '343a40', screen: '161a21', glow: '3bc9db', background: 'b6e3f4' } },
    person: { head: 'short1', expression: 'smile', accessories: 'none', facialHair: 'none', mask: 'none', colors: { skin: 'edb98a', clothing: '8fa7df', headContrast: '2c1b18' } },
    emoji: { face: 'circle', eyes: 'pupils', mouth: 'smile', cheeks: 'blush', colors: { face: 'fcd34d', background: '1d4ed8' } },
  };
}

// ---- hand-written language knowledge ---------------------------------------------------------------------------
/** Spoken part (lemma) -> component keys it can mean, in order of preference. */
export const PART_KEYS = {
  eye: ['eyes'], mouth: ['mouth'], lip: ['mouth'], antenna: ['top'], top: ['top'], head_piece: ['top'], chest: ['chest'],
  hair: ['head'], hairstyle: ['head'], hair_style: ['head'], haircut: ['head'], head: ['head'], expression: ['expression'],
  face: ['expression', 'face'], face_shape: ['face'], accessory: ['accessories'], beard: ['facialHair'], facial_hair: ['facialHair'],
  mask: ['mask'], cheek: ['cheeks'],
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
  main: { robot: 'body', person: 'clothing', emoji: 'face' },
};
const COLOR_SAY = { body: ['body', 'is'], accent: ['accent color', 'is'], screen: ['screen', 'is'], glow: ['glow', 'is'], background: ['background', 'is'], skin: ['skin', 'is'], clothing: ['clothes', 'are'], headContrast: ['hair', 'is'], face: ['face', 'is'] };
/** A glow must not equal the body color (style definition: notEqualTo). */
const NOT_EQUAL = { glow: 'body', body: 'glow' };
const LABEL = { eyes: 'eyes', mouth: 'mouth', top: 'top piece', chest: 'chest', head: 'hairstyle', expression: 'expression', accessories: 'accessories', facialHair: 'facial hair', mask: 'mask', face: 'face shape', cheeks: 'cheeks' };
/** Hairstyle names that read without an article ("short curly hair", "twin buns", "cornrows in a ponytail"). */
const NO_ARTICLE_HAIR = /^(?:.*\bhair(?: with .*)?|.*\b(?:knots|buns|braids|dreadlocks|twists)|cornrows.*|shoulder-length.*)$/;
const EYES_PHRASE = { pupils: 'round eyes with pupils', 'big pupils': 'big pupils', 'tall pupils': 'tall pupils', sparkle: 'sparkling eyes', 'look side': 'eyes looking sideways', 'look down': 'eyes looking down', 'look up': 'eyes looking up', wink: 'a winking eye' };
const PHRASE = {
  eyes: (d) => EYES_PHRASE[d] ?? `${d} eyes`, mouth: (d) => `${a(d)} ${d} mouth`, top: (d) => `${a(d)} ${d} on top`, chest: (d) => `${a(d)} ${d} on my chest`,
  head: (d) => (NO_ARTICLE_HAIR.test(d) ? d : `${/^[aeiou]/i.test(d) ? 'an' : 'a'} ${d}`), expression: (d) => `${a(d)} ${d} expression`, accessories: (d) => `${a(d)} ${d}`, facialHair: (d) => `${a(d)} ${d}`,
  mask: (d) => `${a(d)} ${d}`, face: (d) => `${a(d)} ${d} face`, cheeks: (d) => `${d} cheeks`,
};
const NONE_PHRASE = { top: 'nothing on top', chest: 'nothing on my chest', accessories: 'no accessories', facialHair: 'no facial hair', mask: 'no mask', cheeks: 'no cheeks' };
const NONE_PROBABILITY = { accessories: 0.6, facialHair: 0.6, mask: 0.8, top: 0.15, chest: 0.15, cheeks: 0.4 };
const SPOKEN_CHARACTER = { robot: 'a robot', person: 'a person', emoji: 'an emoji' };
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
  loving: { person: 'lovingGrin1', emoji: { eyes: 'sparkle', mouth: 'bigSmile' }, robot: { eyes: 'happy', mouth: 'smile' } },
};
const MOOD_OF = {
  happy: 'happy', glad: 'happy', smiling: 'happy', smiley: 'happy', cheerful: 'cheerful', joyful: 'cheerful', excited: 'cheerful', delighted: 'cheerful', laughing: 'laughing',
  sad: 'sad', unhappy: 'sad', upset: 'sad', worried: 'worried', concerned: 'worried', surprised: 'surprised', shocked: 'surprised', amazed: 'surprised', astonished: 'surprised',
  scared: 'scared', afraid: 'scared', frightened: 'scared', angry: 'angry', mad: 'angry', annoyed: 'angry', furious: 'furious', calm: 'calm', relaxed: 'calm', peaceful: 'calm',
  serious: 'serious', neutral: 'serious', cute: 'cute', sleepy: 'sleepy', tired: 'sleepy', suspicious: 'suspicious', cheeky: 'cheeky', bored: 'bored', blank: 'bored',
  smug: 'smug', stressed: 'stressed', in_love: 'loving', loving: 'loving',
};
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
function caption(ctx) {
  const s = ctx.state, ch = s.character, v = s[ch];
  s.caption = { character: ch, for: partsSig(v), text: components(ctx, ch).filter((k) => v[k] !== 'none').map((k) => phraseOf(ctx, ch, k, v[k]).replace(/\bmy\b/g, 'its')).join(' · ') };
}
const done = (ctx, key, sentence) => { ensure(ctx); caption(ctx); ctx.request('ui.openTab', { tab: 'robot' }); return ok(`${opener(key)} ${sentence}`); };
const clean = (s) => String(s ?? '').replace(/ {2,}/g, ' ').trim();
const say = (key, display) => clean(PHRASE[key] ? PHRASE[key](display) : `${display} ${LABEL[key] ?? key}`);

function ensure(ctx) {
  const s = ctx.state, d = initialState();
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
const order = (s) => [s.character, ...CHARACTERS.filter((c) => c !== s.character)];
const suffix = (id) => id.match(/(\d+)$/)?.[1];
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
/** Pick the target of a command: the active character first; one other character only when it is the only one that can do it. */
function pickSlot(s, candidates, whatForError) {
  const mine = candidates.filter((c) => c.ch === s.character);
  if (mine.length) return { slot: mine[0] };
  const chars = [...new Set(candidates.map((c) => c.ch))];
  if (chars.length === 1) return { slot: candidates[0] };
  return { error: `${whatForError} I could do that as ${orList(chars.map(spoken))}; tell me to become one of them first.` };
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
  const { slot, error } = pickSlot(s, found, `Only other characters know "${String(value).replace(/_/g, ' ')}".`);
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

// ---- operations: setting parts ----------------------------------------------------------------------------------
export function setPart(ctx, { part, value, n, text }) {
  const s = ensure(ctx);
  const r = resolveVariant(ctx, s, { part, value, n, text });
  if (r.error) return no(r.error);
  if (r.none) {
    const label = String(part ?? value).replace(/_/g, ' ');
    return no(part ? `I do not know ${label} like "${String(value).replace(/_/g, ' ')}". Ask me what ${label} I can have.` : `I do not know how to look like that.`);
  }
  if (s[r.ch][r.key] === r.id && r.ch === s.character) return ok(`I already have ${phraseOf(ctx, r.ch, r.key, r.id)}.`);
  const note = apply(ctx, s, r);
  return done(ctx, r.key + r.id, `I have ${phraseOf(ctx, r.ch, r.key, r.id)} now.${note}`);
}

/** A part named with words that are not a known variant: tell what is possible. */
export function setPartUnknown(ctx, { part, words }) {
  const s = ensure(ctx);
  const keys = PART_KEYS[part];
  if (!keys) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} is.`);
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
  const { slot, error } = pickSlot(s, cand, `That part belongs to other characters.`);
  return error ? { error } : { slot };
}

export function step(ctx, { part, dir }) {
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
const BIGGER = new Set(['bigger', 'larger', 'wider', 'huger', 'rounder']);
const EMOJI_EYE_SIZE = ['small', 'pupils', 'bigPupils'];
/** Robot eyes: styles, not sizes. Square, visor and cyclops fill more of the screen than round and plus. */
const ROBOT_EYES_BIGGER = ['square', 'visor', 'cyclops'], ROBOT_EYES_SMALLER = ['round', 'plus'];
export function resizePart(ctx, { part, dir }) {
  const s = ensure(ctx);
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
    return ok(`My eyes come with my expression. For ${grow ? 'wider eyes try awe, hectic or fear' : 'narrower eyes try tired, contempt or eyes closed'}; say "make your expression ${grow ? 'awe' : 'tired'}".`);
  }
  const key = keys.find((k) => components(ctx, ch).includes(k));
  if (!key) return no(`I am ${spoken(ch)}, so I have no ${String(part).replace(/_/g, ' ')} to resize.`);
  return ok(`I cannot change the size of my ${LABEL[key]}, but I can change its style. My ${LABEL[key]} can be ${orList(listOptionsText(ctx, ch, key, 12).split(', '))}.`);
}

export function resetPart(ctx, { part }) {
  const s = ensure(ctx);
  const { slot, error } = partSlot(ctx, s, part);
  if (error) return no(error);
  const note = apply(ctx, s, { ch: slot.ch, key: slot.key, id: initialState()[slot.ch][slot.key] });
  return done(ctx, 'reset' + slot.key, `I have ${phraseOf(ctx, slot.ch, slot.key, s[slot.ch][slot.key])} again.${note}`);
}

// ---- take off ---------------------------------------------------------------------------------------------------
function takeOff(ctx, s, ch, key) {
  const cur = s[ch][key];
  if (cur === 'none') return { already: true };
  if (optional(ctx, ch).includes(key)) { s[ch][key] = 'none'; return { taken: cur, result: 'none' }; }
  if (key === 'head' && entries(ctx, ch, key).some((e) => e.id === cur && e.word.startsWith('hat'))) {
    const dflt = initialState()[ch][key];
    s[ch][key] = dflt;
    return { taken: cur, result: dflt };
  }
  return { cannot: true };
}
export function removePart(ctx, { part, value, text }) {
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
export function removeAll(ctx) {
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
  const chars = CHARACTERS.filter((c) => map[c]);
  if (chars.length === 1) return { ch: chars[0], key: map[chars[0]] };
  return { error: `${spoken(s.character).replace(/^an? /, 'A ')} has no ${String(part).replace(/_/g, ' ')} color. ${chars.length ? `${orList(chars.map(spoken)).replace(/^./, (c) => c.toUpperCase())} does.` : ''}`.trim() };
}
const colorSentence = (ctx, key, part, name) => {
  const [label, verb] = COLOR_SAY[key] ?? [key, 'is'];
  return part === 'eye' ? `My eyes glow ${name} now.` : `My ${label} ${verb} ${name} now.`;
};
export function setColor(ctx, { part, color }) {
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
export function shiftColor(ctx, { part, dir }) {
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
export function askColor(ctx, { part }) {
  const s = ensure(ctx);
  const map = COLOR_KEYS[part];
  if (!map) return no(`I do not know what my ${String(part).replace(/_/g, ' ')} color is.`);
  const key = map[s.character];
  if (!key) return no(`${spoken(s.character).replace(/^an? /, 'A ')} has no ${String(part).replace(/_/g, ' ')} color.`);
  const name = nameOfHex(ctx, s[s.character].colors[key], key);
  const [label, verb] = COLOR_SAY[key] ?? [key, 'is'];
  return ok(part === 'eye' ? `My eyes glow ${name}.` : `My ${label} ${verb} ${name}.`);
}
export function listColors(ctx, { part }) {
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
export function surprise(ctx, { mode }) {
  const s = ensure(ctx);
  const seed = newSeed();
  s.seed = seed;
  randomize(ctx, s, s.character, seed, mode === 'everything');
  return done(ctx, 'surprise' + seed, mode === 'everything' ? `I changed everything. My seed is ${seed}.` : `Surprise! My new look has the seed ${seed}.`);
}
export function setSeed(ctx, { seed }) {
  const s = ensure(ctx);
  const text = String(seed ?? '').trim().replace(/[.!?]+$/, '');
  if (!text) return no('Which seed should I use?');
  s.seed = text;
  randomize(ctx, s, s.character, text, false);
  return done(ctx, 'seed' + text, `I used the seed ${text} to draw myself. The same seed always gives the same look.`);
}
export function askSeed(ctx) { return ok(`My seed is ${ensure(ctx).seed}.`); }

// ---- characters, mood, name, reset, animation -------------------------------------------------------------------
export function setCharacter(ctx, { who }) {
  const s = ensure(ctx);
  const hit = ctx.lexicon(`${DATA}characters`).map((w) => w.split(':')).find(([w]) => w === who);
  if (!hit) return no(`I can become a robot, a person or an emoji, but not ${String(who).replace(/_/g, ' ')}.`);
  const ch = hit[1];
  if (s.character === ch) return ok(`I am ${spoken(ch)} already.`);
  s.character = ch;
  return done(ctx, 'become' + ch, `Now I am ${spoken(ch)}. ${describeShort(ctx, s)}`);
}
export function askCharacter(ctx, { who } = {}) {
  const s = ensure(ctx);
  if (who) {
    const hit = ctx.lexicon(`${DATA}characters`).map((w) => w.split(':')).find(([w]) => w === who);
    if (hit) return ok(hit[1] === s.character ? `Yes, I am ${spoken(hit[1])}.` : `No, I am ${spoken(s.character)}; I can become ${spoken(hit[1])} if you like.`);
  }
  const others = CHARACTERS.filter((c) => c !== s.character).map(spoken);
  return ok(`I am ${spoken(s.character)}, drawn by the DiceBear library. I can also become ${orList(others)}.`);
}
export function listCharacters(ctx) {
  const s = ensure(ctx);
  return ok(`I can be ${andList(CHARACTERS.map(spoken))}. Right now I am ${spoken(s.character)}. Say "become a person" to change.`);
}
function moodSpec(s, mood) { return MOODS[MOOD_OF[mood]]?.[s.character]; }
export function setMood(ctx, { mood }) {
  const s = ensure(ctx);
  const m = MOOD_OF[mood];
  if (!m) return no(`I do not know how to look ${String(mood).replace(/_/g, ' ')}.`);
  const spec = MOODS[m][s.character], ch = s.character;
  if (ch === 'person') s.person.expression = spec; else Object.assign(s[ch], spec);
  return done(ctx, 'mood' + m, `Now I look ${String(mood).replace(/_/g, ' ')}.`);
}
export function checkMood(ctx, { mood }) {
  const s = ensure(ctx);
  const m = MOOD_OF[mood];
  if (!m) return no(`I do not know what ${String(mood).replace(/_/g, ' ')} looks like.`);
  const spec = MOODS[m][s.character], now = s[s.character];
  const same = s.character === 'person' ? now.expression === spec : now.eyes === spec.eyes && now.mouth === spec.mouth;
  const word = String(mood).replace(/_/g, ' ');
  if (same) return ok(`Yes, I look ${word}.`);
  const mine = Object.keys(MOODS).filter((k) => { const sp = MOODS[k][s.character]; return s.character === 'person' ? now.expression === sp : now.eyes === sp.eyes && now.mouth === sp.mouth; });
  return ok(`No, I do not look ${word}${mine.length ? `; I look ${mine[0]}` : ''}.`);
}
export function askMood(ctx) {
  const s = ensure(ctx), now = s[s.character];
  const mine = Object.keys(MOODS).filter((k) => { const sp = MOODS[k][s.character]; return s.character === 'person' ? now.expression === sp : now.eyes === sp.eyes && now.mouth === sp.mouth; });
  if (mine.length) return ok(`I feel ${mine[0]}.`);
  return ok(`I have ${s.character === 'person' ? phraseOf(ctx, 'person', 'expression', now.expression) : `${phraseOf(ctx, s.character, 'eyes', now.eyes)} and ${phraseOf(ctx, s.character, 'mouth', now.mouth)}`}.`);
}
export function setName(ctx, { name }) {
  const n = String(name ?? '').trim().replace(/[.!?]+$/, '');
  if (!n) return no('What should my name be?');
  if (n.length > 40) return no('That name is too long for me.');
  ensure(ctx).name = n;
  return ok(`Nice! From now on my name is ${n}.`);
}
export function askName(ctx) { return ok(`My name is ${ensure(ctx).name}.`); }
/** The bare name: the assistant and the avatar are one character, so kids.common reads it through ctx.request('avatar.nameOf'). */
export function nameOf(ctx) { return ok(ensure(ctx).name); }
export function reset(ctx, { scope }) {
  const s = ensure(ctx), keep = s.name, d = initialState();
  if (scope === 'all') {
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, d, { name: keep });
    return done(ctx, 'resetall', 'I started over as the robot.');
  }
  const ch = s.character;
  s[ch] = d[ch];
  s.seed = d.seed;
  return done(ctx, 'reset' + ch, `I am back to my normal look as ${spoken(ch)}.`);
}
export function animate(ctx, { anim }) {
  const name = ANIM_OF[anim];
  if (!name) return no(`I do not know how to ${String(anim).replace(/_/g, ' ')}.`);
  ctx.effect('avatar.animate', { name });
  ctx.request('ui.openTab', { tab: 'robot' });
  return ok(ANIM_SAY[name]);
}

// ---- questions ---------------------------------------------------------------------------------------------------
export function askParts(ctx) {
  const s = ensure(ctx), ch = s.character;
  const comps = components(ctx, ch).map((k) => LABEL[k] ?? k);
  const cols = colorKeys(ctx, ch).map((k) => COLOR_SAY[k]?.[0] ?? k);
  return ok(`I am ${spoken(ch)}. You can change my ${andList(comps)}, and my colors: ${andList(cols)}. `
    + `Ask "what eyes can you have?" for the choices, say "next ${PART_EXAMPLE[ch]}" or "surprise me", or tell me to become ${orList(CHARACTERS.filter((c) => c !== ch).map(spoken))}.`);
}
const PART_EXAMPLE = { robot: 'eyes', person: 'hair', emoji: 'mouth' };
export function listOptions(ctx, { part }) {
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
export function askPart(ctx, { part }) {
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
export function hasThing(ctx, { part, value, text }) {
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
export function askWearing(ctx) {
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
  return ok('I am an emoji. I only have a face, eyes, a mouth and cheeks, so I do not wear anything.');
}
function describeShort(ctx, s) {
  const ch = s.character, v = s[ch];
  const bits = components(ctx, ch).filter((k) => v[k] !== 'none').map((k) => phraseOf(ctx, ch, k, v[k]));
  return `I have ${andList(bits)}.`;
}
export function describe(ctx) {
  const s = ensure(ctx), ch = s.character, v = s[ch];
  const name = (hex, k) => nameOfHex(ctx, hex, k);
  const bits = components(ctx, ch).filter((k) => v[k] !== 'none').map((k) => phraseOf(ctx, ch, k, v[k]));
  const nones = components(ctx, ch).filter((k) => v[k] === 'none' && NONE_PHRASE[k]).map((k) => NONE_PHRASE[k]);
  const colors = colorKeys(ctx, ch).map((k) => { const [label, verb] = COLOR_SAY[k] ?? [k, 'is']; return `my ${label} ${verb} ${name(v.colors[k], k)}`; });
  const first = `I am ${s.name}, ${spoken(ch)}. I have ${andList(bits)}${nones.length ? `, and ${andList(nones)}` : ''}.`;
  return ok(`${first} ${colors.join(', ').replace(/^./, (c) => c.toUpperCase())}.`);
}
