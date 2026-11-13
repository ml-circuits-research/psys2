// Operations of art.draw: a children's drawing board controlled by words (spec 07 sections 3, 6 and 7).
// Browser-safe. The only import is the world's own scene.mjs (geometry, colors, regions); the Drawing tab imports the
// same file, so what is said and what is drawn always agree.
//
// State (ctx.state) - a scene graph on a fixed logical canvas of 1000 x 700 (y grows downwards):
//   { canvas: { w, h },
//     objects: [{ id, kind, x, y, size, color, fill, rotation, flip, z, parts: { <partName>: <color> }, tag? }],
//       x, y = center; size = width in logical pixels (height = size * aspect of the kind); color = the main color
//       (null = the kind's own default); fill = 'crayon' | 'solid' | 'outline'; flip = mirrored; z = drawing order;
//       tag = 'night' for the moon and stars of "make it night"
//     background (paper color), sky (color name | null), ground ('grass'|'sand'|'snow'|'sea'|null), groundColor,
//     mood (null | 'night' | 'day' | 'sunset'), selected (object id | null; set by "select the tree" or a click),
//     last [ids] (what the last command made or changed: "it", "them"), history [undo snapshots, max 50], future [redo],
//     nextId, seq, seed }
// Effects: draw.download { format: 'png' | 'svg', filename }. Every command that changes the picture brings the
// Drawing tab forward: ctx.request('ui.openTab', { tab: 'draw' }).
import {
  W, H, HORIZON, GROUND_BASE, KINDS, KIND_ORDER, PLURALS, REGIONS, BASE_COLORS, SHADES, COLOR_ALIASES,
  canonColor, defaultColor, partOfWord, partNames, partLabel, bbox, placeInRegion, regionOf, starField, isKind,
} from './scene.mjs';

export { KINDS, REGIONS, canonColor, colorHex, partsOf, bbox, regionOf, W, H, HORIZON } from './scene.mjs';

// The turn's step budget (a no-op outside a turn): placement and name resolution are searches whose cost grows with the picture.
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const MAX_HISTORY = 50;
const TAB = 'draw';

export function initialState() {
  return {
    canvas: { w: W, h: H }, objects: [], background: 'white', sky: null, ground: null, groundColor: null, mood: null, sunStash: [], sunPose: null,
    selected: null, last: [], history: [], future: [], nextId: 1, seq: 0, seed: 20240611,
  };
}

// ---- vocabulary -----------------------------------------------------------------------------------------------------
/** Spoken singular word -> kind. The lexicon lex.art.draw.things lists exactly these words (a test keeps them in step). */
export const KIND_WORDS = {
  house: 'house', home: 'house', cottage: 'house', hut: 'house', tree: 'tree', pine: 'tree', palm: 'tree', sun: 'sun', cloud: 'cloud',
  car: 'car', automobile: 'car', truck: 'car', flower: 'flower', rose: 'flower', daisy: 'flower', tulip: 'flower', sunflower: 'flower',
  cat: 'cat', kitten: 'cat', kitty: 'cat', dog: 'dog', puppy: 'dog', fish: 'fish', goldfish: 'fish', bird: 'bird', birdie: 'bird',
  boat: 'boat', ship: 'boat', sailboat: 'boat', yacht: 'boat', mountain: 'mountain', hill: 'mountain', rainbow: 'rainbow',
  person: 'person', man: 'person', woman: 'person', boy: 'person', girl: 'person', child: 'person', kid: 'person', balloon: 'balloon',
  rocket: 'rocket', spaceship: 'rocket', moon: 'moon', crescent: 'moon',
  circle: 'circle', ball: 'circle', dot: 'circle', square: 'square', box: 'square', rectangle: 'rectangle', triangle: 'triangle',
  star: 'star', heart: 'heart', line: 'line', dash: 'line', hyphen: 'line', arrow: 'arrow', oval: 'oval', ellipse: 'oval',
  thing: '*', object: '*', item: '*', shape: '*', bit: '*', piece: '*',
};
/** Animals people ask for that the canvas cannot draw (yet): the reply names what it can draw. */
const UNDRAWABLE = new Set(['monkey', 'lion', 'tiger', 'elephant', 'horse', 'cow', 'pig', 'rabbit', 'bear', 'duck', 'frog', 'snake', 'giraffe', 'zebra', 'sheep', 'turtle', 'butterfly', 'mouse']);
const IRREGULAR = { people: 'person', men: 'person', women: 'person', children: 'person', kids: 'person', mice: null, leaves: null, fishes: 'fish' };
/** Ground cover words -> ground kind. */
export const GROUND_WORDS = { grass: 'grass', lawn: 'grass', meadow: 'grass', sand: 'sand', beach: 'sand', snow: 'snow', water: 'sea', sea: 'sea', ocean: 'sea', lake: 'sea', sandy: 'sand', snowy: 'snow', grassy: 'grass', watery: 'sea', icy: 'snow', wet: 'sea', beachy: 'sand' };
const GROUND_COLOR = { grass: 'green', sand: 'yellow', snow: 'white', sea: 'blue' };
const GROUND_NAME = { grass: 'grass', sand: 'sand', snow: 'snow', sea: 'water' };

export const SIZE_WORDS = {
  tiny: 0.45, teeny: 0.4, mini: 0.5, itsy: 0.4, little: 0.6, small: 0.65, medium: 1, normal: 1, regular: 1, middle: 1,
  big: 1.5, large: 1.5, huge: 2.1, giant: 2.3, gigantic: 2.5, enormous: 2.4, massive: 2.3, great: 1.6,
};
/** Comparatives that size a new thing relative to the existing one of its kind (+1 bigger, -1 smaller). */
export const COMPARATIVES = { bigger: 1, larger: 1, taller: 1, huger: 1, wider: 1, longer: 1, greater: 1, smaller: -1, tinier: -1, littler: -1, shorter: -1, narrower: -1, lesser: -1 };
const COMPARATIVE_STEP = 1.4;
/** People: the spoken kind of person -> preset (size factor, hair, dress or shirt and pants colors); plural forms. */
export const WHO_PRESET = {
  man: { factor: 1.15, hair: 'black', shirt: 'blue', pants: 'navy', plural: 'men' },
  woman: { factor: 1.05, hair: 'brown', shirt: 'red', pants: 'red', plural: 'women' },
  girl: { factor: 0.8, hair: 'yellow', shirt: 'pink', pants: 'pink', plural: 'girls' },
  boy: { factor: 0.8, hair: 'brown', shirt: 'green', pants: 'navy', plural: 'boys' },
};
const WHO_OF_WORD = { man: 'man', men: 'man', woman: 'woman', women: 'woman', girl: 'girl', girls: 'girl', boy: 'boy', boys: 'boy' };
/** Moods a drawn person can have: the smile curve turns up (happy) or down (sad). */
export const MOOD_WORDS = { happy: 'happy', glad: 'happy', smiling: 'happy', cheerful: 'happy', sad: 'sad', unhappy: 'sad', crying: 'sad', upset: 'sad' };
const SUPERLATIVE = { biggest: 'big', largest: 'big', hugest: 'big', tallest: 'big', smallest: 'small', tiniest: 'small', littlest: 'small' };
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1, final: -1 };
const ORDINAL_WORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const NUMBERS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
const QUANTITY = { more: 3, some: 3, few: 3, several: 4, couple: 2, many: 6, lots: 7, loads: 7, bunch: 5, plenty: 6 };
const PLURAL_DEFAULT = { star: 8, flower: 4, fish: 4, balloon: 4, bird: 3, cloud: 3, tree: 3, person: 3 };
const MAX_COUNT = 12, MAX_STARS = 30;
const OPENERS = ['Ta-da!', 'Here you go!', 'There!', 'Done!', 'Look at that!', 'Nice!', 'Voila!'];
const PRONOUN_ONE = new Set(['it', 'this', 'that', 'itself', 'him', 'her']);
const PRONOUN_MANY = new Set(['them', 'they', 'these', 'those', 'themselves']);

// ---- text helpers ---------------------------------------------------------------------------------------------------
const clean = (s) => String(s ?? '').toLowerCase().replace(/[’']s\b/g, ' ').replace(/['’]/g, '').replace(/[-_/]/g, ' ')
  .replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => clean(s).split(' ').filter(Boolean);
const numberOf = (t) => (/^\d+(\.\d+)?$/.test(t) ? Number(t) : Object.hasOwn(NUMBERS, t) ? NUMBERS[t] : null);
const a_ = (w) => (/^(hour|honest|heir)/.test(w) ? 'an' : /^(unicorn|university|european|one|use)/.test(w) ? 'a' : /^[aeiou]/i.test(w) ? 'an' : 'a');
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (note, status = 'unsupported') => ({ status, note });
const lastOf = (a) => a[a.length - 1];
const pluralOfKind = (kind, n = 2) => (n === 1 ? kind : PLURALS[kind] ?? (/(s|x|ch|sh)$/.test(kind) ? `${kind}es` : `${kind}s`));

/** Kind of a spoken word ("trees" -> { kind: 'tree', plural: true }); null if it is not a kind word. */
export function kindOfWord(word) {
  const w = String(word ?? '').toLowerCase();
  const tryOne = (x) => (Object.hasOwn(KIND_WORDS, x) ? KIND_WORDS[x] : undefined);
  const hit = (kind, plural) => ({ kind, plural });
  let k = tryOne(w); if (k) return hit(k, false);
  if (Object.hasOwn(IRREGULAR, w) && IRREGULAR[w]) return hit(IRREGULAR[w], true);
  if (w.endsWith('ies') && (k = tryOne(`${w.slice(0, -3)}y`))) return hit(k, true);
  if (w.endsWith('es') && (k = tryOne(w.slice(0, -2)))) return hit(k, true);
  if (w.endsWith('s') && (k = tryOne(w.slice(0, -1)))) return hit(k, true);
  if (w === 'fish') return hit('fish', false);
  return null;
}
const isColorWord = (w) => !!canonColor([w]);
const isShade = (w) => Object.hasOwn(SHADES, w);

/** Color named by a list of words, ["dark", "blue"] -> "dark blue"; a lone shade darkens/lightens `fallback`. */
function colorFrom(words, fallback = null) {
  let shade = null, color = null;
  for (const w of words) { if (isShade(w)) shade = w; else if (isColorWord(w)) color = COLOR_ALIASES[w] ?? w; }
  if (!color && shade && fallback) color = fallback.split(' ').at(-1);
  return color ? canonColor([shade, color].filter(Boolean)) : null;
}

// ---- state access -----------------------------------------------------------------------------------------------------
function ensure(ctx) {
  const s = ctx.state, d = initialState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  loadUsualPlaces(ctx);
  placeNote = null;
  curScene = s;
  return s;
}

// ---- where things usually are: the facts of common.sense (worlds/common.sense/kb.sop), read from the session through the world's imports; no table of kinds here
let USUAL = new Map();
const NEEDS = new Set();   // kinds that cannot be anywhere else than their place (a fish): the place is made when the picture has none   // kind -> 'sky' | 'ground' | 'water' | 'horizon' (the far edge of the ground); a kind with no row is placed anywhere ('any')
let curScene = null;        // the picture the running operation works on (for the words that depend on whether there is water)
let placeNote = null;    // what the last placing did that the user did not ask for ("I put the fish in the pond."), said once after the drawing
function loadUsualPlaces(ctx) {
  let rows = [];
  try { rows = ctx.find('common.sense.livesin'); } catch { rows = []; }
  const m = new Map();
  for (const w of rows) {
    if (ctx.val(w, 'usual') !== 'yes') continue;
    m.set(ctx.val(w, 'kind'), ctx.val(w, 'where') === 'horizon' ? 'horizon' : ctx.val(w, 'place'));
    if (ctx.val(w, 'must') === 'yes') NEEDS.add(ctx.val(w, 'kind'));
  }
  if (m.size) USUAL = m;
}
const anchorOf = (kind) => USUAL.get(kind) ?? 'any';
const onGround = (kind) => ['ground', 'horizon'].includes(anchorOf(kind));
const byId = (s, id) => s.objects.find((o) => o.id === id);
const effectiveColor = (o) => o.color ?? defaultColor(o.kind);
const sameKind = (s, kind) => s.objects.filter((o) => o.kind === kind);

/** Compact copy of the picture for undo. */
function snapshot(s, label) {
  return {
    label, objects: s.objects.map((o) => ({ ...o, parts: { ...(o.parts ?? {}) } })), background: s.background, sky: s.sky, ground: s.ground,
    groundColor: s.groundColor, mood: s.mood, sunStash: structuredClone(s.sunStash ?? []), selected: s.selected, last: [...s.last],
  };
}
function restore(s, snap) {
  s.objects = snap.objects.map((o) => ({ ...o, parts: { ...(o.parts ?? {}) } }));
  Object.assign(s, { background: snap.background, sky: snap.sky, ground: snap.ground, groundColor: snap.groundColor, mood: snap.mood, sunStash: snap.sunStash, selected: snap.selected && byId(s, snap.selected) ? snap.selected : null, last: snap.last.filter((id) => byId(s, id)) });
}
/** Call before changing the picture. */
function remember(s, label) {
  s.history.push(snapshot(s, label));
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
  s.future = [];
}
const open = (ctx) => { try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may not know the tab */ } };
const activeTabText = (ctx) => { try { return String(ctx.request('ui.whichTab', {})?.value ?? ''); } catch { return ''; } };
/** True when the document editor is the tab in front (undo, clear, size, delete and select are shared words). */
const editorActive = (ctx) => /\bEditor\b/.test(activeTabText(ctx));
/** Is this noun phrase something on the drawing board (a kind, part, the sky ...)? Pronouns depend on the open tab. */
const drawingNP = (np) => !!(np.kind && np.kind !== '*') || ['sky', 'ground', 'background'].includes(np.special) || !!np.partKinds || !!np.partOf;
/** Words the document editor shares with the drawing board: a target that is not a drawing thing goes to the editor. */
function toEditor(ctx, np, action, args) {
  const pronoun = !!np.pron || np.special === 'everything';
  if (drawingNP(np)) return null;
  if (pronoun && !editorActive(ctx)) return null;
  const r = ctx.request(action, args);
  return r && !/no operation for action/.test(r.note ?? '') ? r : null;
}
const activeTabName = (ctx) => (/on the (.+?) tab/.exec(activeTabText(ctx))?.[1] ?? '').toLowerCase();
/**
 * Words that several tabs understand (undo, redo, clear, deselect, delete it, flip). The rule formalizer does not know
 * which tab is open, so these patterns outrank the others and hand the command to the world of the tab in front
 * (ui.whichTab); on the Drawing tab, and on any tab not listed here, the drawing board answers.
 */
const SHARED = {
  undo: { editor: ['doc.undo', {}], chess: ['chess.undo', { n: '1', bare: 'true' }], music: ['music.melodyUndo', {}] },
  redo: { editor: ['doc.redo', {}] },
  clear: { editor: ['doc.clear', {}] },
  deselect: { editor: ['doc.unselect', {}] },
  removeIt: { editor: ['doc.deleteTarget', { t: 'it' }] },
  flip: { chess: ['chess.flip', {}] },
};
function shared(ctx, what) {
  const entry = SHARED[what]?.[activeTabName(ctx)];
  if (!entry) return null;
  const r = ctx.request(entry[0], entry[1]);
  return r && !/no operation for action/.test(r.note ?? '') ? r : null;
}
const opener = (s) => OPENERS[(s.seq++) % OPENERS.length];
/** Seeded pseudo-random number in [0, 1), advancing the seed kept in the state (pictures are reproducible). */
const rnd = (s) => { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; };

/** Run an operation body; any exception restores the picture and becomes a friendly error. */
const guard = (fn) => (ctx, args = {}) => {
  const s = ensure(ctx);
  const backup = structuredClone(s);
  try { return fn(ctx, args, s); } catch (e) {
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, backup);
    return no(`Oops, I could not do that (${e?.message ?? e}).`, 'error');
  }
};

// ---- describing things ------------------------------------------------------------------------------------------------
const sizeWord = (o) => {
  const f = o.size / (KINDS[o.kind]?.size ?? o.size);
  return f >= 2 ? 'huge' : f >= 1.35 ? 'big' : f <= 0.45 ? 'tiny' : f <= 0.78 ? 'small' : '';
};
/** "a big red house" (or "the red house" with article 'the'). */
export function describeObject(o, { article = 'a', size = true, color = true } = {}) {
  const words = [];
  if (size && sizeWord(o)) words.push(sizeWord(o));
  const c = effectiveColor(o);
  if (o.mood) words.push(o.mood);
  if (color && c && !(o.kind === 'cloud' && c === 'white' && !o.color) && !(o.kind === 'moon' && !o.color) && !(o.who && !o.color)) words.push(o.color ?? c);
  words.push(o.who ?? o.kind);
  const text = words.join(' ');
  return article === 'the' ? `the ${text}` : article === 'none' ? text : `${a_(text)} ${text}`;
}
const REGION_PHRASE = {
  'top left': 'in the top left corner', top: 'at the top', 'top right': 'in the top right corner', left: 'on the left', center: 'in the middle', right: 'on the right',
  'bottom left': 'in the bottom left corner', bottom: 'at the bottom', 'bottom right': 'in the bottom right corner',
};
const placePhrase = (o) => {
  const anchor = anchorOf(o.kind);
  if (anchor === 'ground' || anchor === 'horizon') {
    const col = o.x < W / 3 ? 'on the left' : o.x > (2 * W) / 3 ? 'on the right' : 'in the middle';
    return `on the ground ${col}`;
  }
  if (anchor === 'water') {
    const wet = curScene?.ground === 'sea' || (curScene?.objects ?? []).some((p) => p.tag === 'pond' && Math.abs(p.x - o.x) < p.size / 2 && Math.abs(p.y - o.y) < p.size * 0.3);
    const col = o.x < W / 3 ? 'on the left' : o.x > (2 * W) / 3 ? 'on the right' : 'in the middle';
    if (wet) return `${o.kind === 'boat' ? 'on' : 'in'} the water ${col}`;
    if (bbox(o).y1 > HORIZON) return `on the ground ${col}`;
  }
  return REGION_PHRASE[regionOf(o.x, o.y)] ?? 'here';
};
/** Groups objects by kind and color: "2 green trees". */
function groupPhrase(objs, { positions = false } = {}) {
  const groups = new Map();
  for (const o of objs) {
    const key = `${o.kind}|${o.who ?? ''}|${o.mood ?? ''}|${effectiveColor(o) ?? ''}|${sizeWord(o)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return `${describeObject(g[0])}${positions ? ` ${placePhrase(g[0])}` : ''}`;
    const o = g[0], words = [];
    if (sizeWord(o)) words.push(sizeWord(o));
    const c = effectiveColor(o);
    if (o.mood) words.push(o.mood);
    if (c && !(o.kind === 'cloud' && !o.color) && !(o.who && !o.color)) words.push(o.color ?? c);
    words.push(o.who ? WHO_PRESET[o.who].plural : pluralOfKind(o.kind, g.length));
    return `${g.length} ${words.join(' ')}`;
  });
}

// ---- noun phrases: who is meant ---------------------------------------------------------------------------------------
const LOC_START = new Set(['on', 'in', 'at', 'near', 'next', 'beside', 'by', 'under', 'above', 'below', 'over', 'behind', 'between', 'inside', 'underneath', 'beneath', 'close']);
const POS_WORDS = { left: 'left', leftmost: 'left', right: 'right', rightmost: 'right', top: 'top', upper: 'top', highest: 'top', topmost: 'top', bottom: 'bottom', lower: 'bottom', lowest: 'bottom', bottommost: 'bottom' };
const DET_ALL = new Set(['all', 'every', 'each', 'both']);
const DET_SKIP = new Set(['the', 'a', 'an', 'my', 'your', 'this', 'that', 'these', 'those', 'any', 'some', 'another', 'of', 'in', 'picture', 'drawing', 'painting']);

/** Parses words like "the big red tree on the left" into a description of the thing meant. */
export function parseNP(text) {
  budget.tick('art.np');   // recurses on the words after "of"
  const all = toks(text);
  const np = { text: String(text ?? ''), pron: null, all: false, ordinal: null, size: null, superlative: false, color: null, kind: null, plural: false, part: null, partOf: null, loc: null, pos: null, special: null, one: false, known: true };
  if (!all.length) return { ...np, known: false };
  // a location tail: "the tree on the left", "the cat next to the house"
  let words = all, loc = null;
  for (let i = 1; i < all.length; i++) {
    if (LOC_START.has(all[i]) && !(all[i] === 'in' && all[i - 1] === 'front') && !(all[i] === 'on' && all[i - 1] === 'top') && !(all[i] === 'close' && all[i + 1] !== 'to')) {
      words = all.slice(0, i); loc = all.slice(i); break;
    }
  }
  np.loc = loc;
  // "the roof of the house"
  const ofAt = words.indexOf('of');
  if (ofAt > 0) { np.partOf = parseNP(words.slice(ofAt + 1).join(' ')); words = words.slice(0, ofAt); }
  const colorWords = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (DET_ALL.has(w)) { np.all = true; continue; }
    if (w === 'everything' || w === 'all') { np.special = 'everything'; continue; }
    if (PRONOUN_ONE.has(w) && words.length <= 2) { np.pron = 'one'; continue; }
    if (PRONOUN_MANY.has(w) && words.length <= 2) { np.pron = 'many'; continue; }
    if (DET_SKIP.has(w) || w === 'other') continue;
    if (Object.hasOwn(ORDINALS, w)) { np.ordinal = ORDINALS[w]; continue; }
    if (Object.hasOwn(SUPERLATIVE, w)) { np.size = SUPERLATIVE[w]; np.superlative = true; continue; }
    if (Object.hasOwn(SIZE_WORDS, w)) { np.size = SIZE_WORDS[w] > 1 ? 'big' : SIZE_WORDS[w] < 1 ? 'small' : 'medium'; continue; }
    if (Object.hasOwn(POS_WORDS, w) && !(w === 'top' && np.kind) && words[i + 1] !== 'of') { np.pos = POS_WORDS[w]; continue; }
    if (w === 'one' || w === 'ones' || w === '1') { np.one = true; continue; }
    if (isShade(w) || isColorWord(w)) { colorWords.push(w); continue; }
    if (w === 'sky') { np.special = 'sky'; continue; }
    if (w === 'background' || w === 'paper' || w === 'page' || w === 'canvas') { np.special = 'background'; continue; }
    if (Object.hasOwn(GROUND_WORDS, w) || w === 'ground' || w === 'floor') { np.special = 'ground'; np.groundWord = GROUND_WORDS[w] ?? null; continue; }
    if (w === 'picture' || w === 'drawing' || w === 'painting' || w === 'everything') { np.special = 'everything'; continue; }
    const k = kindOfWord(w);
    if (k && !(np.kind && partOfWord(np.kind, w))) { if (k.kind === '*') { np.kind = '*'; } else if (!np.kind) np.kind = k.kind; np.plural ||= k.plural; continue; }
    // part words: "the roof", "the car wheels"
    const pk = np.kind && np.kind !== '*' ? partOfWord(np.kind, w) ?? partOfWord(np.kind, w.replace(/s$/, '')) : null;
    if (pk) { np.part = pk; continue; }
    const loose = findPartWord(w);
    if (loose && !np.part) { np.part = loose.word; np.partKinds = loose.kinds; continue; }
    np.known = false; np.unknownWord = w;
  }
  np.color = colorFrom(colorWords);
  if (!np.kind && np.one && np.pron === null) np.kind = null;
  return np;
}
/** A spoken part word without a kind ("roof"): { word, kinds } over every kind that has such a part. */
function findPartWord(w) {
  const base = w.replace(/s$/, '');
  const kinds = Object.keys(KINDS).filter((k) => KINDS[k].names && (partOfWord(k, w) || partOfWord(k, base)));
  return kinds.length ? { word: w, kinds } : null;
}

/** Objects that match a parsed noun phrase, with what to do about several matches. */
function matches(s, np) {
  let list = s.objects.slice();
  if (np.kind && np.kind !== '*') list = list.filter((o) => o.kind === np.kind);
  if (np.part && np.partKinds) list = list.filter((o) => np.partKinds.includes(o.kind));
  if (np.color) list = list.filter((o) => sameColorName(effectiveColor(o), np.color) || sameColorName(partColor(o, np.part), np.color));
  return list;
}
const sameColorName = (a, b) => !!a && !!b && canonColor(a) === canonColor(b);
const partColor = (o, part) => (part ? o.parts?.[part] ?? null : null);

/**
 * Resolve a noun phrase to objects: { objs, specials, note?, error? }. `partOf` is resolved recursively.
 * Rules (no guessing without saying so): "it" is the selected thing or what was just drawn; several matches are
 * narrowed by ordinal, size, side, selection and recency, and the reply says which one was taken.
 */
export function resolveNP(s, np, { many = false } = {}) {
  budget.tick('art.np', 1 + s.objects.length);   // recurses through np.partOf; each level scans the picture
  const out = { objs: [], special: np.special && np.special !== 'everything' ? np.special : null, np };
  if (np.special === 'everything') { out.objs = s.objects.slice(); out.everything = true; return out; }
  if (out.special) return out;
  if (np.pron === 'one') {
    const sel = s.selected && byId(s, s.selected);
    const id = sel?.id ?? s.last[0];
    const o = id && byId(s, id);
    if (!o) return { ...out, error: 'I do not know what you mean by "it" yet. Draw something first, or say which thing you mean.' };
    out.objs = [o]; return out;
  }
  if (np.pron === 'many') {
    out.objs = s.last.map((id) => byId(s, id)).filter(Boolean);
    if (!out.objs.length) return { ...out, error: 'I do not know which things you mean. Say what you mean, for example "the trees".' };
    return out;
  }
  if (np.partOf) {
    const base = resolveNP(s, np.partOf, { many });
    if (base.error || base.special) return base;
    return { ...base, part: np.part };
  }
  // "the one" / "the red one" without a kind
  let list = matches(s, np);
  const label = describeWanted(np);
  if (!list.length) {
    let hint = s.objects.length ? '' : ' Your picture is empty. Try "draw a red house".';
    if (np.color && np.kind && np.kind !== '*') {
      const other = s.objects.filter((o) => o.kind === np.kind);
      if (other.length) hint = ` But there ${other.length === 1 ? 'is' : 'are'} ${andList(groupPhrase(other))}, so you can say "the ${np.kind}".`;
    }
    return { ...out, error: `I can not find ${label} in your picture.${hint}`, missing: true };
  }
  if (np.loc) list = narrowByLocation(s, list, np.loc);
  if (np.pos) list = pickExtreme(list, np.pos);
  if (np.ordinal) {
    const pool = np.kind && np.kind !== '*' && !np.color ? list.slice() : list;
    pool.sort((a, b) => idNum(a) - idNum(b));
    const idx = np.ordinal === -1 ? pool.length - 1 : np.ordinal - 1;
    if (!pool[idx]) return { ...out, error: `There ${pool.length === 1 ? 'is only 1' : `are only ${pool.length}`} ${pool.length === 1 ? np.kind ?? 'one' : pluralOfKind(np.kind ?? 'thing')} in your picture, so there is no ${ORDINAL_WORD[np.ordinal] ?? 'last'} one.`, missing: true };
    out.objs = [pool[idx]]; return out;
  }
  if (np.size && list.length > 1) {
    const sorted = list.slice().sort((a, b) => (np.size === 'big' ? b.size - a.size : a.size - b.size));
    if (np.superlative || !many) { out.objs = [sorted[0]]; return out; }
  }
  if (list.length === 1) { out.objs = list; return out; }
  if (np.all || (np.plural && many) || (many && np.kind === '*')) { out.objs = list; return out; }
  // several matches for a single thing: the selected one, else the newest of what was just handled, else the newest
  const sel = list.find((o) => o.id === s.selected);
  const recent = list.filter((o) => s.last.includes(o.id)).sort((a, b) => idNum(b) - idNum(a))[0];
  const newest = list.slice().sort((a, b) => idNum(b) - idNum(a))[0];
  const pick = sel ?? recent ?? newest;
  const order = sameKindOrder(s, pick);
  out.objs = [pick];
  out.note = `There are ${list.length} ${pluralOfKind(pick.kind, list.length)}, so I took the ${order} one. You can say "the first ${pick.kind}" or "all the ${pluralOfKind(pick.kind)}".`;
  out.ambiguous = list.length;
  return out;
}
const idNum = (o) => Number(String(o.id).replace(/\D/g, '')) || 0;
const sameKindOrder = (s, o) => {
  const list = sameKind(s, o.kind).sort((a, b) => idNum(a) - idNum(b));
  const i = list.findIndex((x) => x.id === o.id);
  return i === list.length - 1 && list.length > 1 ? 'last' : ORDINAL_WORD[i + 1] ?? `${i + 1}th`;
};
function describeWanted(np) {
  const bits = [];
  if (np.size) bits.push(np.size === 'big' ? 'big' : 'small');
  if (np.color) bits.push(np.color);
  const many = np.plural || np.all;
  if (np.kind && np.kind !== '*') bits.push(many ? pluralOfKind(np.kind) : np.kind); else if (np.part) bits.push(np.part.replace(/s$/, '')); else bits.push('thing');
  const t = bits.join(' ');
  return many ? t : `${a_(t)} ${t}`;   // RP5c: "red circles" (plural, no "any"), so the Romanian reply agrees
}
function pickExtreme(list, pos) {
  if (list.length < 2) return list;
  const key = { left: (o) => o.x, right: (o) => -o.x, top: (o) => o.y, bottom: (o) => -o.y }[pos];
  return [list.slice().sort((a, b) => key(a) - key(b))[0]];
}
/** Narrow candidates with a location tail ("on the left", "next to the sun", "in the top right"). */
function narrowByLocation(s, list, loc) {
  if (list.length < 2) return list;
  const rel = parseRelation(loc);
  if (rel?.refs?.length) {
    const refs = rel.refs.flatMap((r) => resolveNP(s, parseNP(r)).objs ?? []);
    if (refs.length) {
      const d = (o) => Math.min(...refs.map((r) => Math.hypot(o.x - r.x, o.y - r.y)));
      return [list.slice().sort((a, b) => d(a) - d(b))[0]];
    }
  }
  const region = regionIn(loc);
  if (region) {
    const inside = list.filter((o) => regionOf(o.x, o.y) === region || regionOf(o.x, o.y).includes(region));
    if (inside.length) return inside.length > 1 && ['left', 'right', 'top', 'bottom'].includes(region) ? pickExtreme(inside, region) : inside;
    if (['left', 'right', 'top', 'bottom'].includes(region)) return pickExtreme(list, region);
  }
  return list;
}

// ---- places and relations -----------------------------------------------------------------------------------------------
/** Region name from words: ["in", "the", "top", "right", "corner"] -> "top right"; null when none is named. */
export function regionIn(words) {
  const w = Array.isArray(words) ? words : toks(words);
  const has = (x) => w.includes(x);
  const top = has('top') || has('upper') || has('up') && has('corner'), bottom = has('bottom') || has('lower') || has('down') && has('corner');
  const left = has('left'), right = has('right');
  if (top && left) return 'top left';
  if (top && right) return 'top right';
  if (bottom && left) return 'bottom left';
  if (bottom && right) return 'bottom right';
  if (has('sky') && !has('under') && !has('below')) return 'sky';
  if (has('ground') || has('grass') || has('floor') || has('earth')) return 'ground';
  if (has('middle') || has('center') || has('centre') || has('centered')) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  if (top) return 'top';
  if (bottom) return 'bottom';
  return null;
}
const REL_PATTERNS = [
  ['between', /\bbetween\b/], ['front', /\b(?:in front of|before)\b/], ['behind', /\b(?:behind|at the back of)\b/],
  ['on', /\b(?:on top of|on)\b/], ['above', /\b(?:above|over|higher than)\b/], ['below', /\b(?:below|under|underneath|beneath|lower than)\b/],
  ['leftof', /\b(?:to the left of|on the left of|left of|on the left hand side of|at the left of)\b/], ['rightof', /\b(?:to the right of|on the right of|right of|on the right hand side of|at the right of)\b/],
  ['next', /\b(?:next to|beside|near|by|close to|closer to|alongside|besides|nearby|near to)\b/],
];
/** A relation to other things: { rel, refs: [noun phrase texts] } or null. Order of the patterns matters (longest first). */
export function parseRelation(words) {
  const text = Array.isArray(words) ? words.join(' ') : clean(words);
  const order = ['between', 'front', 'behind', 'leftof', 'rightof', 'next', 'above', 'below', 'on'];
  for (const rel of order) {
    const re = REL_PATTERNS.find((p) => p[0] === rel)[1];
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length).trim();
    // "on the left" / "on the ground" are places, not relations to a thing
    if (rel === 'on' && (regionIn(rest.split(' ')) || /^(?:the )?(?:left|right|top|bottom|ground|grass|floor)/.test(rest))) continue;
    if (!rest) continue;
    const refs = (rel === 'between' ? rest.split(/\band\b/) : [rest]).map((x) => x.trim()).filter(Boolean);
    return { rel, refs, text: m[0] };
  }
  return null;
}

/** Pick a center for a new object so it does not sit on top of its neighbours. */
function overlapRatio(a, b) {
  const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return (x * y) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}
const sameLayer = (a, b) => {
  const la = anchorOf(a.kind), lb = anchorOf(b.kind);
  if (la === 'any' || lb === 'any') return true;
  const g = (x) => (x === 'horizon' || x === 'water' ? 'ground' : x);
  return g(la) === g(lb);
};
const crowd = (s, o, ignore) => (budget.tick('art.place', s.objects.length + 1), s.objects).filter((x) => x !== o && x.id !== ignore && sameLayer(x, o)).reduce((m, x) => Math.max(m, overlapRatio(bbox(o), bbox(x))), 0);

function clampIn(o, margin = 4) {
  const b = bbox(o);
  if (b.w <= W - 2 * margin) o.x = Math.min(W - margin - b.w / 2, Math.max(margin + b.w / 2, o.x));
  if (b.h <= H - 2 * margin) o.y = Math.min(H - margin - b.h / 2, Math.max(margin + b.h / 2, o.y));
  o.x = Math.round(o.x); o.y = Math.round(o.y);
}

const GROUND_X = [500, 250, 750, 130, 870, 375, 625, 60, 940];
const SKY_X = [850, 150, 500, 330, 690, 60, 940, 230, 780];
/**
 * Where a thing of the water goes when nobody said where: into a pond that is in the picture, else into the sea when the ground is the sea (the ground band), else
 * the water is made: the sea when there is no ground yet, a pond on the ground otherwise. Returns the spot in a pond, or null for the ground band.
 */
function waterSpot(s, o) {
  const pond = s.objects.find((x) => x.tag === 'pond');
  if (!pond && s.ground !== 'sea' && !NEEDS.has(o.kind)) return null;   // no water and the thing can do without: it stands where things of the ground stand
  if (pond) { placeNote = `I put the ${o.kind} in the pond.`; return { x: pond.x, y: pond.y }; }
  if (s.ground === 'sea') { placeNote = `I put the ${o.kind} in the water.`; return null; }
  if (!s.ground && !s.objects.some((x) => onGround(x.kind))) { s.ground = 'sea'; s.groundColor = 'blue'; placeNote = `I added some water for the ${o.kind}.`; return null; }
  const p = makeObject(s, 'oval', { color: 'blue', tag: 'pond' });
  p.size = 260; p.z = o.z - 1;
  defaultSpotOn(s, p, 'ground');
  s.objects.push(p);
  placeNote = `I made a pond for the ${o.kind}.`;
  return { x: p.x, y: p.y };
}

/** Free spot for a new object by the default rules of its kind. */
function defaultSpot(s, o) {
  const b0 = bbox(o);
  let anchor = anchorOf(o.kind);
  if (anchor === 'water') {   // a thing of the water goes into the water that is in the picture, else the water is made first (common.sense: fish live in water)
    const spot = waterSpot(s, o);
    if (spot) { o.x = spot.x; o.y = spot.y; clampIn(o); return; }
    anchor = 'ground';
  }
  const cand = [];
  if (anchor === 'ground') {
    for (const x of GROUND_X) for (const dy of [0, 36, -20]) cand.push([x, GROUND_BASE + dy - b0.h / 2]);
  } else if (anchor === 'horizon') {
    for (const x of [680, 300, 500, 130, 880]) cand.push([x, HORIZON + 28 - b0.h / 2]);
  } else if (anchor === 'sky') {
    const pref = o.kind === 'sun' || o.kind === 'moon' ? [[850, 120], [150, 120], [500, 100]] : o.kind === 'rainbow' ? [[500, 240], [380, 250], [620, 250]] : [];
    cand.push(...pref);
    for (const y of [120, 230, 330, 70, 400]) for (const x of SKY_X) cand.push([x, y]);
    for (const c of cand) c[1] = Math.min(c[1], HORIZON - 30 - b0.h / 2 + (o.kind === 'rainbow' ? 120 : 0));
  } else {
    for (const [x, y] of [[500, 330], [250, 250], [750, 250], [250, 450], [750, 450], [500, 150], [500, 520], [120, 330], [880, 330]]) cand.push([x, y]);
  }
  let best = null, bestScore = Infinity;
  for (const [x, y] of cand) {
    o.x = x; o.y = y; clampIn(o);
    const c = crowd(s, o);
    if (c < 0.1) return;
    if (c < bestScore) { bestScore = c; best = [o.x, o.y]; }
  }
  [o.x, o.y] = best;
}

/** Place `o` by a named region. */
function placeRegion(s, o, region) {
  const b = bbox(o);
  const spot = placeInRegion(region, b.w, b.h, anchorOf(o.kind));
  o.x = spot.x; o.y = spot.y;
  if (region === 'sky' || region === 'ground') o.zone = region;   // the user named the sky or the ground: common.sense may say it when that is not where such a thing usually is
  if (region === 'ground') { // a free spot on the ground band
    const keep = o.y; defaultSpotOn(s, o, 'ground'); if (!Number.isFinite(o.y)) o.y = keep;
  }
  clampIn(o);
  // make room: slide towards the middle while something big sits there
  for (let i = 0; i < 6 && crowd(s, o) > 0.45; i++) { o.x += (o.x < W / 2 ? 1 : -1) * Math.max(40, b.w * 0.8); clampIn(o); }
}
function defaultSpotOn(s, o, anchor) {
  const saved = anchorOf(o.kind);
  const b0 = bbox(o);
  let best = null, bestScore = Infinity;
  for (const x of GROUND_X) {
    o.x = x; o.y = GROUND_BASE + 10 - b0.h / 2; clampIn(o);
    const c = crowd(s, o);
    if (c < bestScore) { bestScore = c; best = [o.x, o.y]; }
    if (c < 0.1) break;
  }
  [o.x, o.y] = best;
  void saved; void anchor;
}

/** Place `o` relative to other objects (already resolved). `side` is used only by next/leftof/rightof. */
function placeRelative(s, o, rel, refs) {
  const gap = 24, b = bbox(o), k = KINDS[o.kind];
  const R0 = bbox(refs[0]);
  const ground = onGround(o.kind) || anchorOf(o.kind) === 'water';
  const alignY = (r) => (ground && (anchorOf(refs[0].kind) === 'ground') ? r.y1 - b.h / 2 : r.cy);
  const place = { x: o.x, y: o.y };
  const sideX = (dir, r) => (dir > 0 ? r.x1 + gap + b.w / 2 : r.x0 - gap - b.w / 2);
  switch (rel) {
    case 'rightof': place.x = sideX(1, R0); place.y = alignY(R0); break;
    case 'leftof': place.x = sideX(-1, R0); place.y = alignY(R0); break;
    case 'next': {
      const dir = R0.x1 + gap + b.w > W - 6 ? -1 : (R0.x0 - gap - b.w < 6 ? 1 : (R0.cx < W / 2 ? 1 : -1));
      place.x = sideX(dir, R0); place.y = alignY(R0);
      // a neighbour already stands there: try the other side
      o.x = place.x; o.y = place.y;
      if (crowd(s, o) > 0.3) { place.x = sideX(-dir, R0); o.x = place.x; if (crowd(s, o) > 0.3) { place.x = sideX(dir, R0) + dir * (b.w + gap); } }
      break;
    }
    case 'above': place.x = R0.cx; place.y = R0.y0 - gap - b.h / 2; break;
    case 'on': place.x = R0.cx; place.y = R0.y0 - b.h / 2 + Math.min(10, b.h * 0.1); break;
    case 'below': {
      place.x = R0.cx; place.y = R0.y1 + gap + b.h / 2;
      if (place.y + b.h / 2 > H - 4) { // no room underneath: stand in front, at the foot of it
        place.y = Math.min(H - 6 - b.h / 2, R0.y1 + 26 - b.h / 2 + b.h * 0.15);
      }
      break;
    }
    case 'front': place.x = R0.cx + R0.w * 0.12; place.y = Math.min(H - 6 - b.h / 2, R0.y1 + 22 - b.h / 2); break;
    case 'behind': place.x = R0.cx + R0.w * 0.28; place.y = R0.y1 - b.h / 2 - 6; break;
    case 'between': {
      const R1 = bbox(refs[1] ?? refs[0]);
      place.x = (R0.cx + R1.cx) / 2; place.y = ground ? Math.max(R0.y1, R1.y1) - b.h / 2 : (R0.cy + R1.cy) / 2; break;
    }
    default: break;
  }
  o.x = place.x; o.y = place.y;
  clampIn(o);
  const z = s.objects.reduce((m, x) => Math.max(m, x.z), -Infinity);
  if (rel === 'behind') o.z = refs[0].z - 1;
  else if (['below', 'front', 'on', 'above', 'next', 'leftof', 'rightof', 'between'].includes(rel)) o.z = Math.max(o.z, refs[0].z + 1, Number.isFinite(z) ? o.z : 0);
}

// ---- making objects -------------------------------------------------------------------------------------------------------
const Z_LAYER = { mountain: -3000, rainbow: -2000, sun: -1000, moon: -1000, cloud: -900 };
function makeObject(s, kind, { color = null, factor = 1, fill = null, tag = null } = {}) {
  const k = KINDS[kind];
  const o = {
    id: `o${s.nextId++}`, kind, x: W / 2, y: H / 2, size: Math.round(k.size * factor), color: color ? canonColor(color) : null,
    fill: fill ?? k.fill ?? 'crayon', rotation: 0, flip: false, z: (Z_LAYER[kind] ?? 0) + s.nextId, parts: {},
  };
  if (tag) o.tag = tag;
  return o;
}

// ---- operations -------------------------------------------------------------------------------------------------------------
/** Splits "a house and a tree" style tails: returns { first, more } texts. */
function splitMore(words) {
  // "a sun, a cloud and a bird": the commas are gone, so a tail that starts like a new thing is one
  if (words.length && (['a', 'an', 'another'].includes(words[0]) || numberOf(words[0]) !== null) && parseMoreSpec(words)) return { first: [], more: words };
  // "... and a tree", ", a cloud", "and 2 birds": a new thing starts at and/comma + (a|an|another|some|number)
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'and' || w === 'plus' || w === 'also') {
      const nx = words[i + 1];
      if (nx && (['a', 'an', 'another', 'some', 'two'].includes(nx) || numberOf(nx) !== null || QUANTITY[nx] || (kindOfWord(nx) && !isPlaceWord(words, i)))) {
        if (words[0] === 'between' || /\bbetween\b/.test(words.slice(0, i).join(' ')) && !words.slice(0, i).some((x) => x === 'a' || x === 'an')) continue;
        return { first: words.slice(0, i), more: words.slice(i + 1) };
      }
    }
  }
  return { first: words, more: [] };
}
const isPlaceWord = (words, i) => LOC_START.has(words[i - 1]);

/** "with a red roof and a blue door" -> { parts: { roof: 'red', door: 'blue' }, rest } for a kind. */
function parseWith(kind, words) {
  const at = words.indexOf('with');
  if (at < 0) return { parts: {}, rest: words };
  const parts = {}, taken = [];
  let i = at + 1;
  while (i < words.length) {
    budget.tick('ops.parseWith');
    const start = i;
    while (i < words.length && ['a', 'an', 'the', 'and', 'some', 'its', 'his', 'her', 'their'].includes(words[i])) { budget.tick('ops.parseWith2'); i++; }
    const colorWords = [];
    while (i < words.length && (isShade(words[i]) || isColorWord(words[i]))) { budget.tick('ops.parseWith3'); colorWords.push(words[i++]); }
    const pw = words[i];
    const part = pw && kind ? partOfWord(kind, pw) ?? partOfWord(kind, pw.replace(/s$/, '')) : null;
    if (part && colorWords.length) { parts[part] = colorFrom(colorWords); taken.push([start, i + 1]); i += 1; continue; }
    // "with a red color" / "with red windows" without article handled above; stop at the first thing that is not a part
    i = start; break;
  }
  const end = taken.length ? taken.at(-1)[1] : at;
  const rest = taken.length ? [...words.slice(0, at), ...words.slice(end)] : words;
  return { parts, rest };
}

/** The place described by the tail words of a command: { region?, rel?, refs?, color?, step? }. */
function parsePlace(words) {
  const text = words.join(' ');
  const out = { region: null, rel: null, refs: [], text };
  const rel = parseRelation(words);
  if (rel) { out.rel = rel.rel; out.refs = rel.refs; return out; }
  out.region = regionIn(words);
  return out;
}

/** Ensure the referenced things exist; "a tree" (indefinite) is drawn when missing. Returns { refs, drawn, error }. */
function resolveRefs(s, refTexts) {
  const refs = [], drawn = [];
  for (const text of refTexts) {
    const w = toks(text);
    const indefinite = ['a', 'an'].includes(w[0]);
    const np = parseNP(text);
    const r = resolveNP(s, np);
    if (r.objs.length) { refs.push(r.objs[0]); continue; }
    if (indefinite && np.kind && np.kind !== '*' && isKind(np.kind)) {
      const o = makeObject(s, np.kind, { color: np.color });
      defaultSpot(s, o); s.objects.push(o); refs.push(o); drawn.push(o);
      continue;
    }
    return { refs, drawn, error: r.error ?? `I can not find "${text}" in your picture.`, missing: true, missingKind: np.kind && np.kind !== '*' ? np.kind : null };
  }
  return { refs, drawn };
}

function addThing(s, spec, ctxInfo) {
  // spec: { kind, count, color, factor, parts, place, plural }
  const made = [];
  const kind = spec.kind;
  const count = spec.count;
  const group = [];
  for (let i = 0; i < count; i++) {
    const factor = i === 0 ? spec.factor : spec.factor * (0.88 + rnd(s) * 0.28);
    const o = makeObject(s, kind, { color: spec.color, factor: spec.who && !spec.sized ? factor * WHO_PRESET[spec.who].factor : factor });
    if (spec.who && kind === 'person') {
      const pr = WHO_PRESET[spec.who];
      o.who = spec.who;
      Object.assign(o.parts, { hair: pr.hair, shirt: spec.dress ?? pr.shirt, pants: spec.dress ?? pr.pants });
    }
    if (spec.mood && kind === 'person') o.mood = spec.mood;
    Object.assign(o.parts, spec.parts);
    group.push(o);
  }
  // several things at once: even spread, drawn left to right
  const place = spec.place ?? {};
  if (place.rel && spec.refs?.length) {
    group.forEach((o, i) => {
      placeRelative(s, o, place.rel, spec.refs);
      if (i > 0) { const prev = group[i - 1], pb = bbox(prev), ob = bbox(o); o.x = prev.x + pb.w / 2 + ob.w / 2 + 14; o.y = prev.y + (ob.h - pb.h) / 2 * 0; clampIn(o); }
      s.objects.push(o);
    });
  } else if (place.region) {
    group.forEach((o, i) => {
      placeRegion(s, o, place.region);
      if (i > 0) { const prev = group[i - 1], pb = bbox(prev), ob = bbox(o); o.x = prev.x + (pb.w + ob.w) / 2 + 16; clampIn(o); if (o.x - ob.w / 2 < prev.x + pb.w / 2) o.y += ob.h * 0.35; clampIn(o); }
      s.objects.push(o);
    });
  } else if (group.length > 1 && anchorOf(kind) !== 'any') {
    const anchor = anchorOf(kind) === 'water' ? 'ground' : anchorOf(kind);
    const n = group.length, lo = 90, hi = W - 90;
    const rows = anchor === 'sky' && n > 5 ? 2 : 1;
    group.forEach((o, i) => {
      const row = rows === 2 ? i % 2 : 0, col = rows === 2 ? Math.floor(i / 2) : i;
      const perRow = rows === 2 ? Math.ceil(n / 2) : n;
      const b = bbox(o);
      o.x = lo + ((col + 0.5 + (row ? 0.25 : 0)) / (perRow + (rows === 2 ? 0.25 : 0))) * (hi - lo);
      if (anchor === 'ground') o.y = GROUND_BASE + (i % 2 ? 26 : 0) + Math.round(rnd(s) * 24) - b.h / 2;
      else if (anchor === 'horizon') o.y = HORIZON + 28 - b.h / 2;
      else o.y = 90 + row * 120 + Math.round(rnd(s) * 70) + (n > 5 ? 0 : 20) + b.h / 2 * 0.2;
      clampIn(o); s.objects.push(o);
    });
  } else if (group.length > 1) {
    const n = group.length;
    group.forEach((o, i) => {
      o.x = 120 + ((i + 0.5) / n) * (W - 240); o.y = 150 + (i % 3) * 140 + Math.round(rnd(s) * 60);
      clampIn(o); s.objects.push(o);
    });
  } else {
    for (const o of group) { defaultSpot(s, o); s.objects.push(o); }
  }
  // drawing order: left to right gets the older ids, so "the first tree" is the left one
  if (group.length > 1) {
    const ids = group.map((o) => o.id), zs = group.map((o) => o.z);
    const sorted = group.slice().sort((a, b) => a.x - b.x);
    sorted.forEach((o, i) => { o.id = ids[i]; o.z = zs[i]; });
    s.objects.sort((a, b) => idNum(a) - idNum(b));
  }
  made.push(...group);
  void ctxInfo;
  return made;
}

/** Everything about a kind that a command can say: kind, count, color, size factor. */
function readSpec(args, tailWords) {
  const mods = ['m1', 'm2', 'm3'].map((k) => args[k]).filter(Boolean).map((x) => String(x).toLowerCase());
  const k = kindOfWord(args.kind);
  const sizeWords = mods.filter((m) => Object.hasOwn(SIZE_WORDS, m));
  const comp = mods.filter((m) => Object.hasOwn(COMPARATIVES, m)).map((m) => COMPARATIVES[m]).at(-1) ?? 0;
  const who = WHO_OF_WORD[String(args.kind ?? '').toLowerCase()] ?? null;
  const mood = mods.map((m) => MOOD_WORDS[m]).filter(Boolean).at(-1) ?? null;
  const colorWords = mods.filter((m) => !Object.hasOwn(MOOD_WORDS, m) && (isShade(m) || isColorWord(m)));
  const kind = k?.kind;
  let color = colorFrom(colorWords, kind ? defaultColor(kind) : null);
  const explicitN = args.n !== undefined ? numberOf(String(args.n)) : null;
  const q = args.q ? String(args.q).toLowerCase().split('_').find((x) => QUANTITY[x]) ?? null : null;
  const plural = /s$|ple$|ish$|ren$/.test(String(args.kindText ?? '').toLowerCase()) && k?.plural === true || k?.plural === true || kindOfWord(args.kt)?.plural === true;
  // "more clouds" adds a few (2 or 3, alternating with what is already there); "more cloud" adds one
  let count = explicitN ?? (q === 'more' ? (plural ? 2 + (args.have ?? 0) % 2 : 1) : q ? QUANTITY[q] : plural ? PLURAL_DEFAULT[kind] ?? 3 : 1);
  const factor = sizeWords.length ? SIZE_WORDS[sizeWords.at(-1)] : 1;
  return { kind, count, color, factor, comp, who, mood, tail: tailWords, mods, plural, explicit: explicitN !== null };
}

export const add = guard((ctx, args, s) => {
  const words0 = toks(args.where ?? '');
  const spec0 = readSpec({ ...args, have: sameKind(s, kindOfWord(args.kind)?.kind).length });
  const askedFor = String(args.kt ?? args.kind ?? '').toLowerCase().replace(/s$/, '');
  // spec 17: a thing the board has no picture for is looked up in the knowledge catalog (the host looked it up before the operation ran). A hit is drawn from its parts when
  // the board can (the composite renderer of DRAW-FROM-FACTS), otherwise the reply says what is known; a miss is the plain "I don't know how to draw a X yet", never a random shape.
  if (!spec0.kind && askedFor && ctx.knowledge) {
    const th = ctx.knowledge.peek(askedFor);
    if (th === null) return no(`I don't know how to draw ${/^[aeiou]/.test(askedFor) ? 'an' : 'a'} ${askedFor} yet.`);
    if (th?.objects?.length) {
      if (typeof addComposite === 'function') return addComposite(ctx, args, s, th);
      const parts = [...new Set(th.objects[0].parts.map((p) => p.name).filter((n) => !/^part\d*$/.test(n)))].slice(0, 6);
      return no(`I know what ${/^[aeiou]/.test(th.name) ? 'an' : 'a'} ${th.name} looks like${parts.length ? ` (${parts.join(', ')})` : ''}, but my drawing board cannot draw it yet.`);
    }
  }
  if (!spec0.kind && UNDRAWABLE.has(askedFor)) return no(`I cannot draw ${/^[aeiou]/.test(askedFor) ? 'an' : 'a'} ${askedFor} yet. I can draw a cat, a dog, a fish or a bird. What would you like?`);
  if (!spec0.kind || spec0.kind === '*') return no('I can draw a house, a tree, a sun, a cloud, a car, a flower, a cat, a dog, a fish, a bird, a boat, a mountain, a rainbow, a person, a balloon, a rocket, a moon and shapes like a circle, a square, a star or a heart. What would you like?');
  // a tail with more things: "... and a tree"
  const withParts0 = parseWith(spec0.kind, words0);
  const { first, more } = splitMore(withParts0.rest);
  const withParts = { parts: withParts0.parts, rest: first };
  const WATER = /^(?:on|in|at|over|across|by|near|beside)\s+(?:the\s+|a\s+)?(?:water|sea|lake|river|ocean|pond|waves|harbou?r|bay)$/;
  const waterTail = WATER.test(withParts.rest.join(' '));
  const place = waterTail ? parsePlace(['at', 'the', 'bottom']) : parsePlace(withParts.rest);
  if (waterTail) withParts.rest = [];
  // a color in the tail: "in blue", "in red" (a house in red) when no color was named before
  let color = spec0.color;
  const colorish = withParts.rest.filter((w) => !['in', 'using', 'with', 'colored', 'coloured', 'color', 'colour', 'a', 'an', 'the', 'crayon', 'please'].includes(w));
  const tailColor = colorish.length && colorish.every((w) => isShade(w) || isColorWord(w)) ? colorFrom(colorish) : null;
  if (!color && tailColor) color = tailColor;
  const unknownTail = withParts.rest.length && !place.region && !place.rel && !tailColor ? withParts.rest : null;
  if (unknownTail && unknownTail.some((w) => !['please', 'now', 'there', 'here', 'too', 'also', 'for', 'me', 'us', 'again', 'picture', 'drawing', 'my', 'the', 'in', 'on', 'to', 'page', 'paper'].includes(w))) {
    return no(`I did not understand where to put it ("${unknownTail.join(' ')}"). You can say, for example, "in the top right corner", "next to the sun" or "under the tree".`);
  }
  remember(s, `drew ${describeObject({ kind: spec0.kind, size: KINDS[spec0.kind].size, color })}`);
  let drawnRefs = [];
  let refs = [];
  if (place.rel) {
    const r = resolveRefs(s, place.refs);
    if (r.error) { s.history.pop(); return no(`${r.error}${r.missingKind && !/But there/.test(r.error) ? ` Draw ${a_(r.missingKind)} ${r.missingKind} first, or say "draw ... next to ${a_(r.missingKind)} ${r.missingKind}".` : ''}`, 'missing'); }
    refs = r.refs; drawnRefs = r.drawn;
    if (place.rel === 'between' && refs.length < 2) { s.history.pop(); return no('I need two things to put it between, for example "between the house and the tree".', 'missing'); }
  }
  let count = spec0.count, capped = false, fracNote = '';
  // "draw 1.5 houses": things are whole; never round silently
  if (spec0.explicit && !Number.isInteger(count)) {
    if (count < 1) { s.history.pop(); return no('I can only draw whole things. How many would you like, for example "draw 2 houses"?'); }
    fracNote = ` (I can only draw whole things, so ${count} became ${Math.floor(count)})`;
    count = Math.floor(count);
  }
  const cap = spec0.kind === 'star' ? MAX_STARS : MAX_COUNT;
  if (count > cap) { count = cap; capped = true; }
  if (count < 1) count = 1;
  let factor = spec0.factor, sized = false, compNote = '';
  if (spec0.comp) {
    // "a bigger house": relative to the existing house (the newest one); without one, a plain big or small one
    const ref = sameKind(s, spec0.kind).at(-1);
    const base = KINDS[spec0.kind].size * (spec0.who ? WHO_PRESET[spec0.who].factor : 1);
    if (ref) { factor = (ref.size / base) * (spec0.comp > 0 ? COMPARATIVE_STEP : 1 / COMPARATIVE_STEP); sized = true; compNote = ` (${spec0.comp > 0 ? 'bigger' : 'smaller'} than the ${ref.who ?? ref.kind} I had)`; }
    else { factor = spec0.comp > 0 ? 1.5 : 0.65; compNote = ` (there was no ${spec0.kind} to compare with, so I made it ${spec0.comp > 0 ? 'big' : 'small'})`; }
  }
  const made = addThing(s, { kind: spec0.kind, who: spec0.who, mood: spec0.mood, sized, count, color: spec0.who ? null : color, dress: color, factor, parts: withParts.parts, place: place.rel ? { rel: place.rel } : place.region ? { region: place.region } : null, refs }, null);
  const all = [...drawnRefs, ...made];
  let extra = [];
  if (more.length) {
    // the rest of the sentence is another thing: "and a tree"
    const sub = parseMoreSpec(more);
    if (sub) { const r = add(ctx, sub); if (r.status === 'supported') { extra = r.data?.made ?? []; s.history.splice(-2, 1); } else if (r.status !== 'supported') { s.last = made.map((o) => o.id); return ok(`${opener(s)} I drew ${groupPhrase(made).join(' and ')}. But ${r.note.charAt(0).toLowerCase()}${r.note.slice(1)}`, { data: { made: all.map((o) => o.id) } }); } }
  }
  s.last = [...made, ...extra.map((id) => byId(s, id)).filter(Boolean)].map((o) => o.id);
  s.mood = s.mood === 'night' && made.some((o) => o.kind === 'sun') ? s.mood : s.mood;
  open(ctx);
  const extras = extra.map((id) => byId(s, id)).filter(Boolean);
  const unique = [...new Set([...all, ...extras])];
  const partNote0 = Object.keys(withParts.parts).length ? ` with ${andList(Object.entries(withParts.parts).map(([k, c]) => (/s$/.test(partLabel(k)) ? `${c} ${partLabel(k)}` : `${a_(c)} ${c} ${partLabel(k)}`)))}` : '';
  const firstGroup = groupPhrase([...drawnRefs, ...made]);
  if (partNote0 && firstGroup.length) firstGroup[firstGroup.length - 1] += partNote0;
  const phrase = andList([...firstGroup, ...groupPhrase(extras)]);
  const where = made.length && extras.length === 0 ? describePlacing(made[0], place, refs) : '';
  const capNote = (capped ? ` (${cap} is plenty!)` : '') + fracNote + compNote;
  const partNote = '';
  const placed = placeNote ? ` ${placeNote}` : '';
  placeNote = null;
  return ok(`${opener(s)} I drew ${phrase}${partNote}${where}${capNote}.${placed}`, { data: { made: s.last.slice() } });
});
const describePlacing = (o, place, refs) => {
  if (!o && !place.region) return '';
  if (place.rel && refs[0]) {
    const label = describeObject(refs[0], { article: 'the', size: false });
    return { rightof: ` to the right of ${label}`, leftof: ` to the left of ${label}`, next: ` next to ${label}`, above: ` above ${label}`, on: ` on top of ${label}`, below: ` under ${label}`, front: ` in front of ${label}`, behind: ` behind ${label}`, between: ` between ${label} and ${describeObject(refs[1] ?? refs[0], { article: 'the', size: false })}` }[place.rel] ?? '';
  }
  if (place.region) return { sky: ' in the sky', ground: ' on the ground' }[place.region] ?? ` ${REGION_PHRASE[place.region]}`;
  return '';
};
/** "a tree" / "two red birds under the sun" from the tail words of an add command. */
function parseMoreSpec(words) {
  let i = 0;
  const args = {};
  while (['a', 'an', 'another', 'some', 'the'].includes(words[i])) { budget.tick('ops.parseMoreSpec'); i++; }
  const n = numberOf(words[i] ?? '');
  if (n !== null) { args.n = String(n); i++; }
  else if (words[i] && QUANTITY[words[i]]) { args.q = words[i]; i++; }
  const mods = [];
  while (i < words.length && (isShade(words[i]) || isColorWord(words[i]) || Object.hasOwn(SIZE_WORDS, words[i])) && mods.length < 3) { budget.tick('ops.parseMoreSpec2'); mods.push(words[i++]); }
  mods.forEach((m, j) => { args[`m${j + 1}`] = m; });
  if (!words[i] || !kindOfWord(words[i])) return null;
  args.kind = words[i]; args.kindText = words[i]; i++;
  args.where = words.slice(i).join(' ');
  return args;
}

/** "add grass", "add some sand": the ground cover. */
export const ground = guard((ctx, args, s) => {
  // the sky and the ground are backgrounds, not objects: a band behind everything (a small list here; drawable things should later come from a knowledge world)
  const bg = String(args.g ?? '').toLowerCase();
  if (bg === 'sky') {
    remember(s, 'added the sky');
    const had = !!s.sky;
    if (!s.sky) { s.sky = 'light blue'; s.mood = null; }
    open(ctx);
    return ok(had ? `${opener(s)} The sky is already there: it is ${s.sky}. You can change its color.` : `${opener(s)} I drew a light blue sky behind everything.`);
  }
  const g = GROUND_WORDS[String(args.g ?? '').toLowerCase()] ?? 'grass';
  remember(s, `added ${GROUND_NAME[g]}`);
  s.ground = g; s.groundColor = GROUND_COLOR[g];
  open(ctx);
  return ok(`${opener(s)} I added ${GROUND_NAME[g]} to the ground.`);
});

/** Who is meant by a noun phrase text, or an error envelope. */
function target(s, text, opts) {
  const np = parseNP(text);
  if (!np.known && !np.kind && !np.special && !np.pron && !np.part) return { error: no(`I do not know what "${text}" is. You can say the house, the tree, the sun, it, or everything.`) };
  const r = resolveNP(s, np, opts);
  if (r.error) return { error: no(r.error, 'missing') };
  return { r, np };
}
const sayObj = (o) => describeObject(o, { article: 'the', size: false, color: false });
const withNote = (text, r) => (r.note ? `${text} ${r.note}` : text);

function recolorSpecial(s, special, color, np) {
  if (special === 'sky') { s.sky = color; s.mood = null; return `the sky`; }
  if (special === 'background') { s.background = color; return 'the background'; }
  if (special === 'ground') { if (!s.ground) { s.ground = np.groundWord ?? 'grass'; } s.groundColor = color; return `the ${GROUND_NAME[s.ground]}`; }
  return null;
}

export const recolor = guard((ctx, args, s) => {
  const color = colorFrom([args.shade, args.color].filter(Boolean).map((x) => String(x).toLowerCase()));
  if (!color) return no(`I do not know the color "${args.color ?? ''}". I know red, orange, yellow, green, blue, purple, pink, brown, black, white, grey and more, with light and dark shades.`);
  { // the charts tab also colors things: "color it blue" with a chart in front, "make the bars red"
    const np0 = parseNP(args.t ?? 'it');
    const onCharts = activeTabName(ctx) === 'charts';
    if (!drawingNP(np0) && (onCharts || !np0.pron && np0.special !== 'everything' && !np0.known)) {
      const label = np0.pron ? null : toks(args.t).filter((w) => !DET_SKIP.has(w)).join(' ');
      const r0 = ctx.request('chart.setColor', { c: String(args.color), shade: args.shade, ...(label ? { label } : {}) });
      if (r0 && !/no operation for action/.test(r0.note ?? '')) return r0;
    }
  }
  const t = target(s, args.t ?? 'it');
  if (t.error) return t.error;
  const { r, np } = t;
  remember(s, `colored it ${color}`);
  if (r.special) {
    const what = recolorSpecial(s, r.special, color, np);
    open(ctx);
    return ok(`${opener(s)} ${what.charAt(0).toUpperCase()}${what.slice(1)} is ${color} now.`);
  }
  const part = r.part ?? np.part;
  const objs = r.objs;
  if (part) {
    const done = [];
    for (const o of objs) {
      const key = partOfWord(o.kind, part) ?? partOfWord(o.kind, part.replace(/s$/, ''));
      if (key) { o.parts[key] = color; done.push(o); }
    }
    if (!done.length) { s.history.pop(); const k = objs[0]?.kind; return no(`${k ? `A ${k} has no ${part.replace(/s$/, '')}. ` : ''}${k ? `You can color its ${andList(partNames(k).map(partLabel))}.` : 'I can not find that part.'}`, 'unsupported'); }
    s.last = done.map((o) => o.id);
    open(ctx);
    const key0 = partOfWord(done[0].kind, part) ?? part;
    return ok(withNote(`${opener(s)} The ${partLabel(key0)} of ${done.length > 1 ? 'the ' + pluralOfKind(done[0].kind) : sayObj(done[0])} ${/s$/.test(partLabel(key0)) && key0 !== 'crown' ? 'are' : 'is'} ${color} now.`, r));
  }
  for (const o of objs) {
    o.color = color;
    // part colors that the user chose before stay; the rainbow and the like simply follow the new color
  }
  s.last = objs.map((o) => o.id);
  open(ctx);
  const name = objs.length === 1 ? sayObj(objs[0]) : `the ${pluralOfKind(objs[0].kind, objs.length)}`;
  const sameKinds = new Set(objs.map((o) => o.kind)).size === 1;
  return ok(withNote(`${opener(s)} ${cap1(sameKinds || objs.length === 1 ? name : `${objs.length} things`)} ${objs.length > 1 ? 'are' : 'is'} ${color} now.`, r));
});
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** "give the house a blue door". */
export const givePart = guard((ctx, args, s) => {
  return recolor(ctx, { t: `${args.part} of ${args.t}`, shade: args.shade, color: args.color });
});

const GROW = { bigger: 1, larger: 1, greater: 1, taller: 1, wider: 1, longer: 1, smaller: -1, tinier: -1, littler: -1, shorter: -1, narrower: -1 };
const AMOUNT = { a_bit: 1.15, a_little: 1.15, a_little_bit: 1.15, a_tiny_bit: 1.08, slightly: 1.12, just_a_bit: 1.12, much: 1.7, a_lot: 1.9, way: 2, very_much: 1.9, so_much: 1.9, even: 1.3, super: 2, twice: 2, hugely: 2.2 };
export const resize = guard((ctx, args, s) => {
  const dirWord = String(args.d ?? 'bigger').toLowerCase();
  let up = (GROW[dirWord.replace(/^(twice|half)_as_/, '').replace(/_the_size$/, '')] ?? 1) > 0;
  if (/^(half_as|half_the)/.test(dirWord)) up = false;
  if (/^your\s/i.test(String(args.t ?? ''))) {
    const part = String(args.t).trim().split(/\s+/).pop().replace(/s$/, '');
    try { const r = ctx.request('avatar.setPartUnknown', { part, words: dirWord }); if (r) return r; } catch { /* no avatar */ }
  }
  const fwd = toEditor(ctx, parseNP(args.t ?? 'it'), 'doc.size', { t: args.t ?? 'it', how: up ? 'bigger' : 'smaller' });
  if (fwd) return fwd;
  const t = target(s, args.t ?? 'it', { many: true });
  if (t.error) return t.error;
  const { r } = t;
  if (r.special) return no(`I can not change the size of ${r.special === 'sky' ? 'the sky' : r.special === 'ground' ? 'the ground' : 'the background'}. You can change its color instead.`);
  let f = AMOUNT[String(args.amt ?? '').toLowerCase()] ?? 1.3;
  if (/^twice/.test(dirWord)) f = 2; else if (/^half/.test(dirWord)) f = 2;
  const factor = up ? f : 1 / f;
  remember(s, up ? 'made it bigger' : 'made it smaller');
  let capped = false;
  for (const o of r.objs) {
    const k = KINDS[o.kind], min = Math.max(24, k.size * 0.2), max = Math.min(1100, k.size * 6);
    const next = Math.round(o.size * factor);
    if (next > max || next < min) capped = true;
    o.size = Math.min(max, Math.max(min, next));
    // a thing standing on the ground keeps its feet where they were
    clampIn(o);
  }
  s.last = r.objs.map((o) => o.id);
  open(ctx);
  const name = r.objs.length === 1 ? sayObj(r.objs[0]) : `the ${pluralOfKind(r.objs[0].kind, r.objs.length)}`;
  return ok(withNote(`${opener(s)} I made ${r.everything ? 'everything' : name} ${up ? 'bigger' : 'smaller'}${capped ? ' (that is as far as it goes!)' : ''}.`, r));
});

/** "make the tree the same size as the house": the target gets the width of the reference thing. */
export const matchSize = guard((ctx, args, s) => {
  const ref = target(s, args.o ?? '', { many: false });
  if (ref.error) return ref.error;
  const r0 = ref.r.objs?.[0];
  if (!r0 || ref.r.special) return no('I can only compare the size of things you drew.');
  const t = target(s, args.t ?? 'it', { many: true });
  if (t.error) return t.error;
  const { r } = t;
  if (r.special) return no('The sky and the ground fill the whole page, so their size can not change.');
  remember(s, 'matched a size');
  for (const o of r.objs) {
    if (o.id === r0.id) continue;
    const k = KINDS[o.kind];
    o.size = Math.min(1100, Math.max(Math.max(24, k.size * 0.2), r0.size));
    clampIn(o);
  }
  s.last = r.objs.map((o) => o.id);
  open(ctx);
  const name = r.objs.length === 1 ? sayObj(r.objs[0]) : `the ${pluralOfKind(r.objs[0].kind, r.objs.length)}`;
  return ok(`${opener(s)} ${cap1(name)} ${r.objs.length > 1 ? 'are' : 'is'} now the same size as ${sayObj(r0)}.`);
});

export const setSize = guard((ctx, args, s) => {
  const word = String(args.s ?? '').toLowerCase();
  const factor = SIZE_WORDS[word];
  if (!factor) return no(`I do not know the size "${word}". Try tiny, small, big or huge.`);
  const fwd = toEditor(ctx, parseNP(args.t ?? 'it'), 'doc.size', { t: args.t ?? 'it', how: word });
  if (fwd) return fwd;
  const t = target(s, args.t ?? 'it', { many: true });
  if (t.error) return t.error;
  const { r } = t;
  if (r.special) return no('I can only change the size of things you drew. The sky and the ground fill the whole page.');
  remember(s, `made it ${word}`);
  for (const o of r.objs) {
    const k = KINDS[o.kind];
    o.size = Math.round(k.size * factor);
    if (onGround(o.kind)) clampIn(o);
  }
  s.last = r.objs.map((o) => o.id);
  open(ctx);
  const name = r.objs.length === 1 ? sayObj(r.objs[0]) : `the ${pluralOfKind(r.objs[0].kind, r.objs.length)}`;
  return ok(withNote(`${opener(s)} ${cap1(name)} ${r.objs.length > 1 ? 'are' : 'is'} ${word} now.`, r));
});

// ---- moving ------------------------------------------------------------------------------------------------------------
const STEP = 110;
const STEP_AMOUNT = { a_bit: 0.5, a_little: 0.5, a_little_bit: 0.5, a_tiny_bit: 0.3, slightly: 0.4, just_a_bit: 0.5, much: 2.2, a_lot: 2.5, way: 3, far: 3, very_much: 2.5, so_much: 2.5, all_the_way: 20 };
const DIR_VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1], higher: [0, -1], lower: [0, 1], upward: [0, -1], downward: [0, 1], upwards: [0, -1], downwards: [0, 1], leftwards: [-1, 0], rightwards: [1, 0], forward: [0, 0], back: [0, 0] };
const REL_STRONG = new Set(['to', 'towards', 'toward', 'into', 'onto', 'next', 'beside', 'near', 'by', 'under', 'underneath', 'beneath', 'below', 'above', 'over', 'behind', 'between']);
const DIR_WORDS = new Set(['up', 'down', 'left', 'right', 'higher', 'lower', 'closer', 'further', 'farther', 'back', 'forward', 'away', 'upwards', 'downwards', 'upward', 'downward', 'leftwards', 'rightwards']);
const DET = new Set(['the', 'a', 'an', 'my', 'that', 'this', 'its', 'every', 'each', 'all', 'both', 'first', 'second', 'third', 'last']);
const WEAK = new Set(['on', 'in', 'at']);

/** Splits "the tree to the left" into { target: "the tree", dest: "to the left" }. */
export function splitDest(text) {
  const w = toks(text);
  const isStart = (i) => {
    const t = w[i];
    if (REL_STRONG.has(t)) return 'strong';
    if (t === 'a' && /^(bit|little|lot|tiny|way)$/.test(w[i + 1] ?? '')) return 'dir';
    if (DIR_WORDS.has(t)) {
      if (['left', 'right', 'up', 'down', 'back'].includes(t) && (DET.has(w[i - 1]) || kindOfWord(w[i + 1] ?? '') || w[i + 1] === '1' || w[i + 1] === 'one')) return null;
      return 'dir';
    }
    if (WEAK.has(t)) return 'weak';
    return null;
  };
  let at = -1;
  for (let i = 1; i < w.length; i++) {
    const kind = isStart(i);
    if (!kind) continue;
    at = i;
    if (kind === 'weak') {
      // "the tree on the left to the right": the first group describes the target when a stronger one follows
      for (let j = i + 2; j < w.length; j++) if (isStart(j) === 'strong' || isStart(j) === 'dir') { at = j; break; }
    }
    break;
  }
  if (at <= 0) return { target: w.join(' '), dest: '' };
  return { target: w.slice(0, at).join(' '), dest: w.slice(at).join(' ') };
}

/** What a destination text means: { kind: 'region'|'rel'|'step'|'z'|..., ... }. */
export function parseDest(text) {
  let w = toks(text);
  if (!w.length) return null;
  // absolute coordinates on the 1000 x 700 canvas: "at 200, 300", "to x 200 y 300", "to 200 by 300"
  const abs = w.join(' ').match(/^(?:at|to|on|onto|into)?\s*(?:the\s+)?(?:position|point|spot|coordinates)?\s*(?:x\s*)?(\d+(?:\.\d+)?)\s*(?:,|and|by|x|comma)?\s*(?:y\s*)?(\d+(?:\.\d+)?)$/);
  if (abs) return { kind: 'abs', x: Number(abs[1]), y: Number(abs[2]) };
  // amount words
  let amount = 1;
  const joined = w.join(' ');
  for (const [k, v] of Object.entries(STEP_AMOUNT)) {
    const phrase = k.replace(/_/g, ' ');
    if (new RegExp(`\\b${phrase}\\b`).test(joined)) { amount = v; w = toks(joined.replace(new RegExp(`\\b${phrase}\\b`), ' ')); break; }
  }
  const j = w.join(' ');
  if (/\b(to the front|forward|to the top of everything|in front of everything)\b/.test(j)) return { kind: 'z', dir: 'front' };
  if (/\b(to the back|backward|backwards|to the bottom of everything|behind everything)\b/.test(j)) return { kind: 'z', dir: 'back' };
  // "in the water", "into the sea": the ground band (the water, sand, grass or snow the picture has)
  if (/^(?:in|into|inside|on|onto|to)\s+(?:the\s+)?(?:water|sea|ocean|lake|sand|beach|snow)$/.test(j)) return { kind: 'region', region: 'ground' };
  const rel = parseRelation(w);
  if (rel) return { kind: 'rel', rel: rel.rel, refs: rel.refs, closer: /\bcloser\b/.test(j) };
  if (/\b(edge|far)\b/.test(j) || amount >= 20) {
    const r = regionIn(w);
    if (r) return { kind: 'region', region: r };
  }
  const side = /\b(side|corner|edge|half|part|middle|center|centre|sky|ground|grass|floor)\b/.test(j);
  const region = regionIn(w);
  if (region && (side || /^(on|at|in|into|onto)\b/.test(j) || region === 'top left' || region === 'top right' || region === 'bottom left' || region === 'bottom right')) return { kind: 'region', region };
  if (/\b(down|up|left|right|higher|lower)\b/.test(j) || region) {
    const dirs = w.filter((x) => Object.hasOwn(DIR_VEC, x) && !['forward', 'back'].includes(x));
    let dx = 0, dy = 0;
    for (const d of dirs) { dx += DIR_VEC[d][0]; dy += DIR_VEC[d][1]; }
    if (!dirs.length && region) { const v = DIR_VEC[region] ?? [0, 0]; dx = v[0]; dy = v[1]; }
    if (dx || dy) return { kind: 'step', dx: dx * STEP * amount, dy: dy * STEP * amount, label: dirs.join(' and ') || region };
  }
  if (/\b(closer|nearer)\b/.test(j)) return { kind: 'closer' };
  if (/\b(centre|center|middle)\b/.test(j)) return { kind: 'region', region: 'center' };
  return null;
}

function applyDest(s, objs, dest) {
  const done = [];
  for (const o of objs) {
    const b = bbox(o);
    if (dest.kind === 'step') { o.x += dest.dx; o.y += dest.dy; clampIn(o); }
    else if (dest.kind === 'abs') { o.x = dest.x; o.y = dest.y; clampIn(o); }
    else if (dest.kind === 'region') { placeRegion(s, o, dest.region); }
    else if (dest.kind === 'rel') {
      const refs = [];
      for (const text of dest.refs) { const r = resolveNP(s, parseNP(text)); if (!r.objs.length) return { error: r.error ?? `I can not find "${text}".` }; refs.push(r.objs.find((x) => x !== o) ?? r.objs[0]); }
      if (refs[0] === o) return { error: 'A thing can not be next to itself!' };
      placeRelative(s, o, dest.rel, refs);
    } else if (dest.kind === 'z') {
      const zs = s.objects.map((x) => x.z);
      o.z = dest.dir === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    }
    void b;
    done.push(o);
  }
  return { done };
}

export const move = guard((ctx, args, s) => {
  let phrase = args.phrase ?? '';
  const adj = [args.m1, args.m2].filter(Boolean).join(' ');
  if (adj) phrase = /^the /i.test(phrase) ? phrase.replace(/^the /i, `the ${adj} `) : `${adj} ${phrase}`;
  // "slide the house over to the right": "over to" is a direction, not the relation "over"
  phrase = phrase.replace(/\b(?:over|across|along) (to|towards|toward)\b/gi, '$1');
  const { target: tt, dest } = splitDest(phrase);
  if (!dest) return no('Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or "move it to the top right corner".', 'missing');
  const t = target(s, tt || 'it', { many: true });
  if (t.error) return t.error;
  const { r } = t;
  if (r.special) return no('The sky and the ground stay where they are. You can move the things you drew.');
  const d = parseDest(dest);
  if (!d) return no(`I did not understand where to move it ("${dest}"). Try "to the left", "a bit higher", "next to the sun" or "to the top right corner".`);
  remember(s, 'moved something');
  // RP5b: "move the fish into the water": say "in the water" (not "on the ground") and add the water when the picture has none
  const target_ = /^(?:in|into|inside|on|onto|to)\s+(?:the\s+)?(water|sea|ocean|lake|sand|beach|snow)$/.exec(toks(dest).join(' '))?.[1];
  const wantGround = target_ ? GROUND_WORDS[target_] : null;
  const addedGround = wantGround && s.ground !== wantGround ? wantGround : null;
  if (addedGround) { s.ground = addedGround; s.groundColor = GROUND_COLOR[addedGround]; }
  const res = applyDest(s, r.objs, d);
  if (res.error) { s.history.pop(); return no(res.error, 'missing'); }
  s.last = r.objs.map((o) => o.id);
  open(ctx);
  const name = r.objs.length === 1 ? sayObj(r.objs[0]) : `the ${pluralOfKind(r.objs[0].kind, r.objs.length)}`;
  const where = d.kind === 'abs' ? ` to ${d.x}, ${d.y}` : d.kind === 'step' ? ` ${d.label}` : d.kind === 'region' ? ` ${describePlacing(null, { region: d.region }, [])}`.replace(/\s+/g, ' ') : d.kind === 'z' ? ` to the ${d.dir}` : '';
  const relText = d.kind === 'rel' ? describePlacing(r.objs[0], { rel: d.rel }, d.refs.map((x) => resolveNP(s, parseNP(x)).objs[0] ?? r.objs[0])) : '';
  const regionText = d.kind === 'region' ? describePlacing(null, { region: d.region }, []) : '';
  if (wantGround) return ok(withNote(`${opener(s)} I moved ${name} ${wantGround === 'sea' ? 'into the water' : wantGround === 'snow' ? 'onto the snow' : `onto the ${GROUND_NAME[wantGround]}`}.${addedGround ? ` There was no ${GROUND_NAME[wantGround]}, so I added it to the ground.` : ''}`, r));
  return ok(withNote(`${opener(s)} I moved ${name}${d.kind === 'abs' ? ` to ${d.x}, ${d.y}` : d.kind === 'step' ? ` ${d.label}` : d.kind === 'rel' ? relText : d.kind === 'region' ? regionText : d.kind === 'z' ? ` to the ${d.dir}` : ''}.`, r));
});
void 0;

export const nudge = guard((ctx, args, s) => {
  const dir = String(args.d ?? '').toLowerCase().replace(/^further_/, '');
  const amt = String(args.amt ?? '').toLowerCase();
  return move(ctx, { phrase: `${args.t ?? 'it'} ${amt.replace(/_/g, ' ')} ${dir.replace(/_/g, ' ')}`.replace(/\s+/g, ' ') });
});

// ---- turning ---------------------------------------------------------------------------------------------------------------
export const turn = guard((ctx, args, s) => {
  const words = toks(args.phrase ?? '');
  const text = words.join(' ');
  // find the action words, what is left is the target
  let action = null, dirWord = null, deg = null;
  const rest = [];
  for (let i = 0; i < words.length; i++) {
    budget.tick('ops.applyDest');
    const w = words[i];
    if (['around', 'over', 'round', 'back', 'backwards', 'backward', 'flipped', 'mirrored', 'reversed'].includes(w) && !action) { action = 'flip'; continue; }
    if ((w === 'other' || w === 'wrong') && words[i + 1] === 'way') { action = 'flip'; i += 2; continue; }
    if (w === 'upside' && words[i + 1] === 'down') { action = 'upside'; i++; continue; }
    if (['face', 'look', 'looking', 'facing', 'point', 'pointing', 'towards', 'toward', 'to'].includes(w) && (words[i + 1] === 'left' || words[i + 1] === 'right' || words[i + 2] === 'left' || words[i + 2] === 'right')) { action = 'face'; continue; }
    if ((w === 'left' || w === 'right') && (action === 'face' || /\b(face|facing|look|looking|point|pointing)\b/.test(text)) && !dirWord) { dirWord = w; continue; }
    if (['upright', 'straight', 'straighten', 'level'].includes(w)) { action = 'upright'; continue; }
    if (['mirror', 'flip', 'reverse'].includes(w)) { action ??= 'flip'; continue; }
    const n = numberOf(w);
    if (n !== null && words[i + 1] === 'degrees' || n !== null && words[i + 1] === 'degree') { deg = n; action = 'degrees'; i++; continue; }
    if (['degrees', 'degree', 'clockwise', 'anticlockwise', 'counterclockwise'].includes(w)) { if (/anti|counter/.test(w)) dirWord = 'left'; continue; }
    if (['quarter', 'half', 'full'].includes(w) && words[i + 1] === 'turn') { deg = w === 'quarter' ? 90 : w === 'half' ? 180 : 360; action = 'degrees'; i++; continue; }
    if (['a', 'bit', 'little', 'slightly', 'please', 'the', 'my'].includes(w) && !rest.length && false) continue;
    rest.push(w);
  }
  if (!action) { const verb = words.includes('tilt') ? 'tilt' : null; if (verb) action = 'tilt'; }
  if (!action && !rest.length) return no('Turn what? You can say "turn the car around", "rotate the house 45 degrees" or "turn it upside down".');
  if (!action) action = /^(tilt|lean)/.test(args.verb ?? '') ? 'tilt' : 'flip';
  const targetText = rest.filter((w) => !['tilt', 'lean', 'a', 'bit', 'little', 'slightly', 'to', 'the'].includes(w) || rest.length === 1 && false).join(' ') || rest.join(' ') || 'it';
  { const np0 = parseNP(rest.join(' ') || 'it'); if (!drawingNP(np0) && (np0.pron || /board/.test(text))) { const r0 = shared(ctx, 'flip'); if (r0) return r0; } }
  const t = target(s, rest.join(' ') || 'it', { many: true });
  void targetText;
  if (t.error) return t.error;
  const { r } = t;
  if (r.special) return no('The sky and the ground can not turn around. You can turn the things you drew.');
  remember(s, 'turned something');
  let say = 'around';
  for (const o of r.objs) {
    const k = KINDS[o.kind];
    if (action === 'flip') { o.flip = !o.flip; }
    else if (action === 'face') {
      const want = dirWord ?? 'right';
      const defaultFaces = k.faces ?? 'right';
      o.flip = want !== defaultFaces; say = `to face ${want}`;
    } else if (action === 'upside') { o.rotation = (o.rotation ?? 0) % 360 === 180 ? 0 : 180; say = 'upside down'; }
    else if (action === 'upright') { o.rotation = 0; say = 'upright'; }
    else if (action === 'degrees') { o.rotation = (((o.rotation ?? 0) + (dirWord === 'left' ? -deg : deg)) % 360 + 360) % 360; say = `${deg} degrees`; }
    else if (action === 'tilt') { o.rotation = (o.rotation ?? 0) + 15; say = 'a little'; }
    clampIn(o);
  }
  s.last = r.objs.map((o) => o.id);
  open(ctx);
  const name = r.objs.length === 1 ? sayObj(r.objs[0]) : `the ${pluralOfKind(r.objs[0].kind, r.objs.length)}`;
  return ok(withNote(`${opener(s)} I turned ${name} ${say}.`, r));
});

// ---- removing ---------------------------------------------------------------------------------------------------------------
function splitList(text) {
  return String(text).split(/,|\band\b|\bplus\b|\bas well as\b/).map((x) => x.trim()).filter(Boolean);
}
export const remove = guard((ctx, args, s) => {
  const words = toks(args.phrase ?? '');
  if (!words.length) return no('What should I take away? You can say, for example, "delete the car" or "remove everything except the house".');
  const joined = words.join(' ');
  const except = /\b(everything|all|all the rest|the rest|every thing|everything else|all else)\b (?:except|but|apart from|besides|other than|except for)\b(.*)$/.exec(joined);
  if (except) {
    const keepTexts = splitList(except[2]);
    const keep = new Set();
    for (const text of keepTexts) {
      const np = parseNP(text);
      const r = resolveNP(s, np, { many: true });
      if (r.error) return no(r.error, 'missing');
      if (r.objs.length > 1 || np.plural || np.all) r.objs.forEach((o) => keep.add(o.id)); else r.objs.forEach((o) => keep.add(o.id));
    }
    const gone = s.objects.filter((o) => !keep.has(o.id));
    if (!gone.length) return ok('There is nothing else to remove.');
    remember(s, 'removed everything but a few things');
    s.objects = s.objects.filter((o) => keep.has(o.id));
    s.last = [...keep]; if (s.selected && !byId(s, s.selected)) s.selected = null;
    open(ctx);
    return ok(`${opener(s)} I took away ${gone.length === 1 ? describeObject(gone[0], { article: 'the', size: false }) : `${gone.length} things`}. I kept ${andList(groupPhrase(s.objects.filter((o) => keep.has(o.id))))}.`);
  }
  if (/^(everything|all|all of it|all things|every thing|the whole picture|everything in my picture)$/.test(joined) || /^(everything|all) (in|on|from) /.test(joined)) return clear(ctx, {});
  const removed = [], notes = [];
  const specials = [];
  const texts = splitList(args.phrase);
  const plan = [];
  for (const text of texts) {
    const np = parseNP(text);
    if (!np.known && !np.kind && !np.special && !np.pron) return no(`I do not know what "${text}" is. You can say the car, the tree, the sky, the grass, or everything.`);
    const r = resolveNP(s, np, { many: true });
    if (r.error) return no(r.error, 'missing');
    plan.push(r);
  }
  remember(s, 'removed something');
  for (const r of plan) {
    if (r.special === 'sky') { if (s.sky) specials.push('the sky color'); s.sky = null; s.mood = null; continue; }
    if (r.special === 'ground') { if (s.ground) specials.push(`the ${GROUND_NAME[s.ground]}`); s.ground = null; s.groundColor = null; continue; }
    if (r.special === 'background') { s.background = 'white'; specials.push('the background color'); continue; }
    if (r.note) notes.push(r.note);
    for (const o of r.objs) if (!removed.includes(o)) removed.push(o);
  }
  if (!removed.length && !specials.length) { s.history.pop(); return no('There was nothing to take away.', 'missing'); }
  s.objects = s.objects.filter((o) => !removed.includes(o));
  s.last = []; if (s.selected && !byId(s, s.selected)) s.selected = null;
  open(ctx);
  const parts = [...(removed.length ? [andList(groupPhrase(removed).map((x) => x.replace(/^an? /, 'the ')))] : []), ...specials];
  return ok(`${opener(s)} I took away ${andList(parts)}.${notes.length ? ` ${notes[0]}` : ''}`);
});

/** "delete it": the selected thing, or what was just drawn (with the editor open, its selection). */
export const removeIt = guard((ctx, args, s) => {
  { const r = shared(ctx, 'removeIt'); if (r) return r; }
  return remove(ctx, { phrase: 'it' });
});

export const clear = guard((ctx, args, s) => {
  if (!s.objects.length && !s.sky && !s.ground) return ok('The page is already empty. What shall we draw?');
  remember(s, 'cleared the picture');
  const n = s.objects.length;
  s.objects = []; s.sky = null; s.ground = null; s.groundColor = null; s.mood = null; s.background = 'white'; s.selected = null; s.last = []; s.sunStash = [];
  open(ctx);
  return ok(`OK, I cleared the picture${n ? ` (${n} thing${n > 1 ? 's' : ''})` : ''}. You can say "undo" to get it back.`);
});

export const newDrawing = guard((ctx, args, s) => {
  const had = s.objects.length || s.sky || s.ground;
  remember(s, 'started a new drawing');
  s.objects = []; s.sky = null; s.ground = null; s.groundColor = null; s.mood = null; s.background = 'white'; s.selected = null; s.last = []; s.sunStash = [];
  open(ctx);
  return ok(had ? 'Here is a fresh sheet of paper! Your old picture is still there if you say "undo".' : 'Here is a fresh sheet of paper. What shall we draw?');
});

// ---- selecting ---------------------------------------------------------------------------------------------------------------
export const select = guard((ctx, args, s) => {
  const parts = [args.o, args.m1, args.m2, args.kt ?? args.kind].filter(Boolean).join(' ');
  const t = target(s, args.t ?? parts);
  if (t.error) return t.error;
  const { r } = t;
  if (r.special || !r.objs.length) return no('You can select a thing you drew, for example "select the tree".');
  const o = r.objs[0];
  s.selected = o.id; s.last = [o.id];
  open(ctx);
  return ok(withNote(`OK, I selected ${sayObj(o)}. Now you can say "make it bigger", "color it blue" or "move it to the left".`, r));
});
export const deselect = guard((ctx, args, s) => {
  { const r = shared(ctx, 'deselect'); if (r) return r; }
  if (!s.selected) return ok('Nothing is selected.');
  s.selected = null;
  return ok('OK, nothing is selected now.');
});

// ---- fill, copies ------------------------------------------------------------------------------------------------------------
export const fillMode = guard((ctx, args, s) => {
  const mode = { solid: 'solid', filled: 'solid', full: 'solid', crayon: 'crayon', scribbled: 'crayon', colored: 'crayon', empty: 'outline', hollow: 'outline', outline: 'outline', outlined: 'outline', unfilled: 'outline', transparent: 'outline' }[String(args.mode ?? 'crayon').toLowerCase()] ?? 'crayon';
  const t = target(s, args.t ?? 'it', { many: true });
  if (t.error) return t.error;
  const { r } = t;
  if (r.special) return no('I can only fill or empty the things you drew.');
  remember(s, `made it ${mode}`);
  for (const o of r.objs) o.fill = mode;
  s.last = r.objs.map((o) => o.id);
  open(ctx);
  const name = r.objs.length === 1 ? sayObj(r.objs[0]) : `the ${pluralOfKind(r.objs[0].kind, r.objs.length)}`;
  return ok(withNote(`${opener(s)} ${cap1(name)} ${r.objs.length > 1 ? 'are' : 'is'} ${mode === 'outline' ? 'just an outline' : mode === 'solid' ? 'filled in' : 'colored in with crayon'} now.`, r));
});

export const duplicate = guard((ctx, args, s) => {
  const t = target(s, args.t ?? 'it');
  if (t.error) return t.error;
  const { r } = t;
  if (r.special || !r.objs.length) return no('I can copy the things you drew, for example "copy the house".');
  const n = Math.max(1, Math.min(8, numberOf(String(args.n ?? '1')) ?? 1));
  remember(s, 'made a copy');
  const copies = [];
  for (const src of r.objs.slice(0, 1)) {
    for (let i = 0; i < n; i++) {
      const o = makeObject(s, src.kind, { color: src.color, factor: src.size / KINDS[src.kind].size, fill: src.fill });
      o.parts = { ...src.parts }; o.flip = src.flip; o.rotation = src.rotation;
      defaultSpot(s, o);
      if (crowd(s, o) > 0.3) { const b = bbox(o); o.x = Math.min(W - b.w / 2 - 10, src.x + b.w + 20); o.y = src.y; clampIn(o); }
      s.objects.push(o); copies.push(o);
    }
  }
  s.last = copies.map((o) => o.id);
  open(ctx);
  return ok(withNote(`${opener(s)} I made ${n === 1 ? 'a copy' : `${n} copies`} of ${sayObj(r.objs[0])}.`, r));
});

// ---- moods: night, day, sunset --------------------------------------------------------------------------------------------
function clearNightThings(s) {
  s.objects = s.objects.filter((o) => o.tag !== 'night');
}
export const setMood = guard((ctx, args, s) => {
  const w = String(args.w ?? 'night').toLowerCase();
  const mood = { nite: 'night', twilight: 'sunset', night: 'night', nighttime: 'night', night_time: 'night', dark: 'night', evening: 'night', midnight: 'night', day: 'day', daytime: 'day', morning: 'day', daylight: 'day', bright: 'day', sunny: 'day', light: 'day', noon: 'day', sunset: 'sunset', sunrise: 'sunset', dusk: 'sunset', dawn: 'sunset' }[w];
  if (!mood) return no(`I do not know the time "${w}". Try night, day or sunset.`);
  if (s.mood === mood) return ok(`It is already ${mood === 'night' ? 'night' : mood === 'day' ? 'day' : 'sunset'}.`);
  remember(s, `made it ${mood}`);
  clearNightThings(s);
  let line;
  if (mood === 'night') {
    // the sun goes to sleep (kept, so that "make it day" can bring it back)
    const suns = s.objects.filter((o) => o.kind === 'sun');
    if (suns.length) { s.sunStash = suns.map((o) => ({ ...o, parts: { ...o.parts } })); s.objects = s.objects.filter((o) => o.kind !== 'sun'); }
    s.sky = 'navy'; s.mood = 'night';
    const moon = makeObject(s, 'moon', { tag: 'night' });
    moon.x = 830; moon.y = 120; moon.z = Z_LAYER.moon + s.nextId;
    s.objects.push(moon);
    const stars = [];
    for (const [x, y, size] of starField(14, 11)) {
      const st = makeObject(s, 'star', { tag: 'night', factor: size / KINDS.star.size });
      st.x = x; st.y = y; st.rotation = Math.round((x * 7) % 30) - 15;
      if (Math.hypot(x - moon.x, y - moon.y) < 110) continue;
      s.objects.push(st); stars.push(st);
    }
    s.last = [moon.id];
    line = 'It is night now: a dark sky, a moon and lots of stars.';
  } else if (mood === 'day') {
    s.sky = 'light blue'; s.mood = 'day';
    const hasSun = s.objects.some((o) => o.kind === 'sun');
    if (!hasSun) {
      const stash = s.sunStash?.[0];
      const sun = stash ? { ...stash, id: `o${s.nextId++}`, parts: { ...stash.parts } } : makeObject(s, 'sun');
      if (!stash) { sun.x = 850; sun.y = 120; }
      s.objects.push(sun);
    }
    s.sunStash = [];
    const sunNow = s.objects.find((o) => o.kind === 'sun');
    if (sunNow && s.sunPose) { Object.assign(sunNow, s.sunPose); s.sunPose = null; }
    s.last = [];
    line = 'It is a bright sunny day!';
  } else {
    s.sky = 'orange'; s.mood = 'sunset';
    const sun = s.objects.find((o) => o.kind === 'sun') ?? (() => { const o = makeObject(s, 'sun'); defaultSpot(s, o); s.objects.push(o); return o; })();
    s.sunPose = { x: sun.x, y: sun.y, size: sun.size, color: sun.color };
    sun.x = 500; sun.y = HORIZON - 40; sun.color = 'orange'; sun.size = Math.round(KINDS.sun.size * 1.8);
    s.last = [sun.id];
    line = 'The sun is going down and the sky is orange.';
  }
  open(ctx);
  return ok(`${opener(s)} ${line}`);
});

// ---- history -------------------------------------------------------------------------------------------------------------------
/** The tab that is open, from the shell ("You are on the Drawing tab."); undo and clear are shared with the editor. */
export const undo = guard((ctx, args, s) => {
  { const r = shared(ctx, 'undo'); if (r) return r; }
  if (!s.history.length) return no('There is nothing to undo.', 'missing');
  const snap = s.history.pop();
  s.future.push(snapshot(s, snap.label));
  restore(s, snap);
  open(ctx);
  return ok(`OK, I undid it${snap.label ? ` (${snap.label})` : ''}.`);
});
export const redo = guard((ctx, args, s) => {
  { const r = shared(ctx, 'redo'); if (r) return r; }
  if (!s.future.length) return no('There is nothing to redo.', 'missing');
  const snap = s.future.pop();
  s.history.push(snapshot(s, snap.label));
  restore(s, snap);
  open(ctx);
  return ok('OK, I did it again.');
});
export const clearEverything = guard((ctx, args, s) => {
  { const r = shared(ctx, 'clear'); if (r) return r; }
  return clear(ctx, args);
});

// ---- questions ----------------------------------------------------------------------------------------------------------------
export const describe = guard((ctx, args, s) => {
  if (!s.objects.length && !s.sky && !s.ground) return ok('Your picture is empty. Try saying "draw a red house".');
  const bits = [];
  if (s.objects.length) {
    const sorted = s.objects.slice().sort((a, b) => a.z - b.z);
    // things that appear once are placed; groups are counted
    const singles = [], groups = new Map();
    for (const o of sorted) {
      const key = `${o.kind}|${effectiveColor(o)}|${sizeWord(o)}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }
    for (const g of groups.values()) singles.push(g.length === 1 ? `${describeObject(g[0])} ${placePhrase(g[0])}` : groupPhrase(g)[0] + (new Set(g.map((o) => regionOf(o.x, o.y))).size === 1 ? ` ${placePhrase(g[0])}` : ''));
    bits.push(`In your picture I can see ${andList(singles)}.`);
  }
  const env = [];
  if (s.sky) env.push(`The sky is ${s.sky}`);
  if (s.ground) env.push(`${s.ground === 'sea' ? 'there is water' : `there is ${GROUND_NAME[s.ground]}`} on the ground`);
  if (env.length) bits.push(`${cap1(env.join(' and '))}.`);
  if (s.selected && byId(s, s.selected)) bits.push(`${cap1(sayObj(byId(s, s.selected)))} is selected.`);
  return ok(bits.join(' '));
});

export const count = guard((ctx, args, s) => {
  const mods = ['m1', 'm2'].map((k) => args[k]).filter(Boolean).map((x) => String(x).toLowerCase());
  const k = kindOfWord(args.kt ?? args.kind);
  if (!k) return no(`I do not know what "${args.kind}" is.`);
  const color = colorFrom(mods.filter((m) => isShade(m) || isColorWord(m)));
  let list = s.objects;
  if (k.kind !== '*') list = list.filter((o) => o.kind === k.kind);
  if (color) list = list.filter((o) => sameColorName(effectiveColor(o), color));
  const label = k.kind === '*' ? 'things' : pluralOfKind(k.kind, 2);
  const desc = `${color ? `${color} ` : ''}${label}`;
  const n = list.length;
  if (k.kind === '*') return ok(n === 0 ? (s.objects.length ? `There is nothing ${color ?? ''} in your picture.`.replace('  ', ' ') : 'Your picture is empty. There is nothing in it yet.') : `There ${n === 1 ? `is 1 ${color ? `${color} ` : ''}thing` : `are ${n} ${desc}`} in your picture.`);
  return ok(n === 0 ? `There are no ${desc} in your picture.` : `There ${n === 1 ? `is 1 ${color ? `${color} ` : ''}${k.kind}` : `are ${n} ${desc}`} in your picture.`);
});

export const exists = guard((ctx, args, s) => {
  const mods = ['m1', 'm2'].map((k) => args[k]).filter(Boolean).map((x) => String(x).toLowerCase());
  const k = kindOfWord(args.kind);
  if (!k) return no(`I do not know what "${args.kind}" is.`);
  const color = colorFrom(mods.filter((m) => isShade(m) || isColorWord(m)));
  let list = s.objects.filter((o) => k.kind === '*' || o.kind === k.kind);
  if (color) list = list.filter((o) => sameColorName(effectiveColor(o), color));
  const name = `${color ? `${color} ` : ''}${k.kind === '*' ? 'thing' : k.kind}`;
  if (!list.length) return ok(`No, there is no ${name} in your picture yet.`);
  return ok(`Yes! There ${list.length === 1 ? `is ${a_(name)} ${name}` : `are ${list.length} ${pluralOfKind(name.split(' ').at(-1), list.length).replace(/^/, '')}`} ${list.length === 1 ? placePhrase(list[0]) : 'in your picture'}.`.replace(/ here\./, '.'));
});

export const whereIs = guard((ctx, args, s) => {
  const text = [args.o, args.m1, args.m2, args.kt ?? args.kind].filter(Boolean).join(' ');
  const np = parseNP(text);
  const k = kindOfWord(args.kt ?? args.kind);
  if (k?.plural) np.all = true;
  const r = resolveNP(s, np, { many: true });
  if (r.error) return no(r.error, 'missing');
  if (r.special) return no('I can only tell you where the things you drew are.');
  const objs = r.objs;
  if (objs.length === 1) {
    const o = objs[0];
    const near = s.objects.filter((x) => x !== o).map((x) => ({ x, d: Math.hypot(x.x - o.x, x.y - o.y) })).sort((a, b) => a.d - b.d)[0];
    const nearText = near && near.d < 330 ? ` It is close to ${describeObject(near.x, { article: 'the', size: false, color: false })}.` : '';
    return ok(withNote(`${cap1(sayObj(o))} is ${placePhrase(o)}.${nearText}`, r));
  }
  const places = objs.map((o) => placePhrase(o));
  return ok(`There are ${objs.length} ${pluralOfKind(objs[0].kind, objs.length)}: ${andList(places)}.`);
});

export const whatsNear = guard((ctx, args, s) => {
  const t = target(s, args.t ?? 'it');
  if (t.error) return t.error;
  const { r } = t;
  if (!r.objs.length) return no('I can only say what is near the things you drew.');
  const o = r.objs[0];
  const near = s.objects.filter((x) => x !== o).map((x) => ({ x, d: Math.hypot(x.x - o.x, x.y - o.y) })).sort((a, b) => a.d - b.d).filter((e) => e.d < 380).slice(0, 3);
  if (!near.length) return ok(`There is nothing near ${sayObj(o)}.`);
  const side = (x) => (x.x < o.x - bbox(o).w * 0.4 ? 'on the left' : x.x > o.x + bbox(o).w * 0.4 ? 'on the right' : x.y < o.y ? 'above it' : 'below it');
  return ok(`Near ${sayObj(o)} I can see ${andList(near.map((e) => `${describeObject(e.x)} ${side(e.x)}`))}.`);
});

export const colorOfThing = guard((ctx, args, s) => {
  const t = target(s, args.t ?? 'it');
  if (t.error) return t.error;
  const { r, np } = t;
  if (r.special === 'sky') return ok(s.sky ? `The sky is ${s.sky}.` : 'The sky has no color yet. You can say "make the sky blue".');
  if (r.special === 'ground') return ok(s.ground ? `The ${GROUND_NAME[s.ground]} is ${s.groundColor}.` : 'There is no ground yet. You can say "add grass".');
  if (r.special === 'background') return ok(`The paper is ${s.background === 'white' ? 'white' : s.background}.`);
  const o = r.objs[0];
  const part = np.part ? partOfWord(o.kind, np.part) : null;
  if (part) { const c = o.parts?.[part] ?? KINDS[o.kind].build?.().find((p) => p.n === part)?.c; return ok(`The ${partLabel(part)} of ${sayObj(o)} ${/s$/.test(partLabel(part)) ? 'are' : 'is'} ${c}.`); }
  const c = effectiveColor(o);
  return ok(withNote(c ? `${cap1(sayObj(o))} is ${c}.` : `${cap1(sayObj(o))} has many colors.`, r));
});

export const help = guard(() => ok('I can draw a house, a tree, a sun, a cloud, a car, a flower, a cat, a dog, a fish, a bird, a boat, a mountain, a rainbow, a person, a balloon, a rocket, a moon, and shapes like a circle, a square, a triangle, a star, a heart, a line or an arrow. Say "draw a red house", "put a big yellow sun in the top right corner" or "make it night".'));
export const colors = guard(() => ok(`I know ${andList(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'turquoise', 'gold', 'silver'])}, and you can say light or dark, like "dark blue" or "light green".`));

// ---- saving ----------------------------------------------------------------------------------------------------------------------
export const save = guard((ctx, args, s) => {
  const f = String(args.f ?? 'png').toLowerCase();
  const format = f === 'svg' || f === 'vector' ? 'svg' : 'png';
  if (!s.objects.length && !s.sky && !s.ground) return no('Your picture is empty, so there is nothing to save yet. Draw something first!', 'missing');
  ctx.effect('draw.download', { format, filename: 'my-drawing' });
  return ok(`OK, I am saving your drawing as a ${format.toUpperCase()} picture. Look in your downloads!`);
});

// ---- a surprise scene ---------------------------------------------------------------------------------------------------------------
export const scene = guard((ctx, args, s) => {
  remember(s, 'drew a scene');
  const make = (kind, o = {}) => {
    const obj = makeObject(s, kind, { color: o.color, factor: o.factor ?? 1 });
    if (o.x !== undefined) { obj.x = o.x; obj.y = o.y; } else defaultSpot(s, obj);
    clampIn(obj); s.objects.push(obj); return obj;
  };
  s.sky = 'light blue'; s.ground = 'grass'; s.groundColor = 'green'; s.mood = 'day';
  const palette = ['red', 'orange', 'yellow', 'pink', 'purple', 'blue'];
  const pick = () => palette[Math.floor(rnd(s) * palette.length)];
  const made = [];
  if (!s.objects.some((o) => o.kind === 'sun')) made.push(make('sun'));
  made.push(make('cloud'), make('cloud', { factor: 0.8 }));
  if (rnd(s) < 0.6) made.push(make('mountain'));
  made.push(make('house', { color: pick() }), make('tree'), make('tree', { factor: 0.8 }));
  for (let i = 0; i < 2; i++) made.push(make('flower', { color: pick() }));
  made.push(make(['cat', 'dog'][Math.floor(rnd(s) * 2)]), make('bird'));
  s.last = made.map((o) => o.id);
  open(ctx);
  return ok(`${opener(s)} I drew a sunny scene for you: ${andList(groupPhrase(made))}. You can change anything, for example "make the house blue".`);
});

export const openTab = guard((ctx) => {
  const r = ctx.request('ui.openTab', { tab: TAB });
  const said = String(r?.value ?? r?.note ?? '');
  if (/^You are already on /.test(said)) return ok(said);   // RP5c: already on Drawing -> the shared "already on the {tab} tab" phrase
  return r?.status === 'supported' ? ok('OK, here is the drawing board.') : ok('The drawing board is right here. What shall we draw?');
});

/** "Draw" alone: ask what to draw; the dialog layer keeps the question pending for the next utterance (spec 11). */
export const askKind = guard((ctx, args, s) => ({ status: 'missing', note: 'What should I draw?', pending: { key: 'kind', type: 'lex.art.draw.things' } }));


// ---- discourse hooks (spec 11): read-only, called by the dialog layer through interp.hook -----------------------------------
/** Everything a person can point at ("the red one", "the second one", "both"): [{ id, kind, noun, words, attrs: { color, size, x, y }, salient }]. */
export function referents(ctx) {
  const s = ensure(ctx);
  const salient = new Set([...(s.last ?? []), ...(s.selected ? [s.selected] : [])]);
  const wordsOfKind = (k) => Object.entries(KIND_WORDS).filter(([, v]) => v === k).map(([w]) => w);
  return s.objects.filter((o) => !o.tag).map((o) => ({
    id: o.id, kind: o.kind, noun: o.kind, words: wordsOfKind(o.kind), attrs: { color: effectiveColor(o), size: o.size, x: o.x, y: o.y },
    salient: salient.has(o.id), sig: JSON.stringify([o.kind, o.x, o.y, o.size, o.color, o.fill, o.rotation, o.flip, o.parts]),
  }));
}
/**
 * World-aware hook (spec 16), read-only: the things a request names that the picture cannot have ("delete the dragon": no such kind of thing), with what
 * IS in the picture, so that the reply says what the world holds instead of listing what could be drawn. `undefined` when every noun phrase is one the
 * world knows (an object that is merely absent is answered by the operation itself).
 */
export function checkReferents(ctx, { action, args = {} } = {}) {
  const s = ensure(ctx);
  const texts = action === 'draw.remove' ? splitList(args.phrase ?? '') : [args.t, args.o].filter((x) => typeof x === 'string' && x);
  const missing = [];
  for (const text of texts) {
    const np = parseNP(text);
    if (!np.known && !np.kind && !np.special && !np.pron && !np.part) missing.push({ name: String(text).replace(/^(?:the|a|an|my)\s+/i, '').trim(), kind: 'thing' });
  }
  if (!missing.length) return undefined;
  return { missing, here: andList(groupPhrase(s.objects.filter((o) => !o.tag))) || null, where: 'picture' };
}
/** One sentence about the picture, for "where were we?". */
export function summary(ctx) {
  const r = describe(ctx, {});
  return r?.value ?? null;
}

// What the matrix reasoner's functions (fns.mjs) share with the operations: the words, so that a refusal or a count says the same in both modes.
export { describeWanted, colorFrom, isShade, isColorWord, pluralOfKind, a_, placePhrase, effectiveColor, sameColorName, drawingNP };
