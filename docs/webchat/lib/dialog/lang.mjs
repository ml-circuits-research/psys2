/**
 * Shared dialogue vocabulary: yes/no, ordinals, colours, sizes, degree words. Browser-safe, no imports.
 *
 * One place for the small closed word classes that the discourse layer (spec 11) and the worlds both need. The reusable
 * symbolic library (worker-tasks.md, section L) absorbs this module into `worlds/lang.common` and exposes it as `ctx.lang`;
 * until then dialog code imports it from here and worlds never copy these lists.
 */

// ---- yes / no ---------------------------------------------------------------------------------------------------------
const YES = new Set(['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'please', 'do it', 'go ahead', 'of course', 'correct', 'right', 'yes please', 'sure thing', 'absolutely', 'definitely']);
const NO = new Set(['no', 'nope', 'nah', 'no thanks', 'no thank you', 'not now', 'dont', 'do not', 'never', 'leave it']);
const plain = (t) => String(t ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** 'yes' | 'no' | null for a short reply. */
export function yesNo(text) {
  const t = plain(text);
  return YES.has(t) ? 'yes' : NO.has(t) ? 'no' : null;
}

// ---- ordinals ---------------------------------------------------------------------------------------------------------
export const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ORDINALS = { ...Object.fromEntries(ORDINAL_WORDS.slice(1).map((w, i) => [w, i + 1])), last: -1, final: -1, latest: -1, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
/** 1..10 for first..tenth, -1 for last, null otherwise. */
export function ordinal(word) { const w = String(word ?? '').toLowerCase(); return Object.hasOwn(ORDINALS, w) ? ORDINALS[w] : null; }
export const ordinalWord = (n) => (n === -1 ? 'last' : ORDINAL_WORDS[n] ?? null);

// ---- colours ----------------------------------------------------------------------------------------------------------
export const COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'violet', 'pink', 'brown', 'black', 'white', 'grey', 'gray', 'gold', 'silver', 'cyan', 'turquoise', 'beige'];
export const SHADES = ['light', 'dark', 'pale', 'bright'];
/** The colour named by a list of words ("dark blue"), or null. */
export function colour(words) {
  const ws = [].concat(words).flatMap((w) => String(w).toLowerCase().split(/\s+/)).filter(Boolean);
  const c = ws.find((w) => COLOURS.includes(w));
  if (!c) return null;
  const sh = ws.find((w) => SHADES.includes(w));
  return sh ? `${sh} ${c}` : c;
}

// ---- sizes and positions ------------------------------------------------------------------------------------------------
const BIG = new Set(['big', 'bigger', 'biggest', 'large', 'larger', 'largest', 'huge', 'giant', 'tall', 'taller', 'tallest', 'great']);
const SMALL = new Set(['small', 'smaller', 'smallest', 'little', 'tiny', 'short', 'shorter', 'shortest', 'mini', 'teeny']);
/** 'big' | 'small' | null. */
export function size(word) { const w = String(word ?? '').toLowerCase(); return BIG.has(w) ? 'big' : SMALL.has(w) ? 'small' : null; }
export const POSITIONS = { left: 'left', leftmost: 'left', right: 'right', rightmost: 'right', top: 'top', upper: 'top', highest: 'top', bottom: 'bottom', lower: 'bottom', lowest: 'bottom' };
export const position = (word) => POSITIONS[String(word ?? '').toLowerCase()] ?? null;

// ---- degree -----------------------------------------------------------------------------------------------------------
/** Degree adverbs (a bit ... way) with a strength: 1 small, 2 normal, 3 strong. */
export const DEGREE_ADVERBS = {
  'a bit': 1, 'a little bit': 1, 'a little': 1, 'a tiny bit': 1, 'just a bit': 1, slightly: 1, 'a touch': 1, somewhat: 1,
  much: 3, 'a lot': 3, 'way': 3, 'far': 3, 'so much': 3, 'very much': 3, even: 2, 'a great deal': 3, hugely: 3, 'lots': 3,
};
export const COMPARATIVES = ['bigger', 'smaller', 'larger', 'taller', 'shorter', 'wider', 'narrower', 'longer', 'higher', 'lower', 'brighter', 'darker', 'lighter', 'faster', 'slower', 'louder', 'quieter', 'thicker', 'thinner', 'closer', 'farther', 'further', 'tinier', 'littler', 'greater'];
const ADVERBS_LONGEST_FIRST = Object.keys(DEGREE_ADVERBS).sort((a, b) => b.length - a.length);
/** Split a leading degree adverb off a phrase: { adv, strength, rest }. */
export function splitAdverb(text) {
  const t = plain(text);
  for (const a of ADVERBS_LONGEST_FIRST) if (t === a || t.startsWith(`${a} `)) return { adv: a, strength: DEGREE_ADVERBS[a], rest: t.slice(a.length).trim() };
  return { adv: null, strength: 2, rest: t };
}
/**
 * A degree fragment on the last frame: { type: 'more' | 'less' | 'comparative' | 'times' | 'same', adv, comparative?, factor?, ref? }, or null.
 *   "a bit more" / "much less"  -> more / less      "much bigger" / "even smaller" -> comparative
 *   "twice as big" / "half the size" -> times       "the same size as the house" -> same
 */
export function degree(text) {
  const t = plain(text);
  if (!t) return null;
  let m = t.match(/^(twice|double|triple|half|three times|four times|ten times) (?:as (\w+)(?: as (?:the )?(.+))?|the size|the size of (?:the )?(.+))$/);
  if (m) {
    const factor = { twice: 2, double: 2, triple: 3, half: 0.5, 'three times': 3, 'four times': 4, 'ten times': 10 }[m[1]];
    return { type: 'times', factor, adj: m[2] ?? 'size', ref: m[3] ?? m[4] ?? null, text: t };
  }
  m = t.match(/^(?:the )?same (size|colou?r|height|width|length) as (?:the )?(.+)$/) ?? t.match(/^as (big|large|small|tall|wide|long|short|high) as (?:the )?(.+)$/);
  if (m) return { type: 'same', what: /^colou?r$/.test(m[1]) ? 'colour' : 'size', ref: m[2], text: t };
  const { adv, strength, rest } = splitAdverb(t);
  if (rest === 'more' || rest === 'again' && adv) return { type: 'more', adv, strength };
  if (rest === 'less' || rest === 'fewer') return { type: 'less', adv, strength };
  if (COMPARATIVES.includes(rest)) return { type: 'comparative', adv, strength, comparative: rest };
  return null;
}

export const lang = { yesNo, ordinal, ordinalWord, colour, size, position, degree, splitAdverb };
export default lang;
