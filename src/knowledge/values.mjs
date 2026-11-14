// SPDX-License-Identifier: AGPL-3.0-only
/**
 * One reader of colours and number words for every world and the dialog tier (KNOWLEDGE-OUT step 4a): the colour names with their RGB and the number words come from the
 * knowledge world `k.values` (and `k.colours` for the families of colours), read through the generic catalog access of facts.mjs. No world keeps a colour table or a number lexicon.
 * Browser-safe: no `node:*`; synchronous reads (an operation must not wait), seeded from the bundled subset (bundled-values.mjs, generated from the catalog) so a first visit with no network
 * has the same names; `loadValues(facts)` replaces the seed with the catalog when it is reachable (the host calls it when the knowledge is attached: `engine.setKnowledge`).
 *
 *   colourName(words)       "Light-Blue" -> "light blue"; the catalog's name for a colour phrase (a string, a list of words, "light_blue"), or null when it is not a colour
 *   isColourWord(word)      a single word that is (the last word of) a colour name: used where a colour word has to be told from a noun
 *   colourHex(name)         "#RRGGBB" of a colour name (exact for a CSS name, the usual value for a common name), or null
 *   basicColour(name)       the basic colour ("red", "green" ...) a colour is a kind of, or null
 *   colourNames()           every colour name, the order of the catalog
 *   numberInfo(word, kind?) { value, kind } of "twelve", "twenty-one", "third", "dozen", "half" (kinds: cardinal, ordinal, group, fraction, multiple, times), or null
 *   numberValue(word, kind?) "twelve" -> 12, "dozen" -> 12, "third" -> 3, "half" -> 0.5; null when it is not a number word
 *   numberWords(kind)       the number words of a kind, or every one
 *   numberWordOf(n, kind)   12 -> "twelve", 3 -> "third" (ordinal)
 */
import { parseLine } from './catalog.mjs';
import { BUNDLED_VALUES } from './bundled-values.mjs';

const lc = (s) => String(s ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const state = { colours: new Map(), numbers: new Map(), from: 'none', loading: null };

function absorb(wires) {
  const colours = new Map(), numbers = new Map();
  for (const w of wires) {
    if (w.type === 'k.values.colour' && w.f.name?.[0]) {
      const name = lc(w.f.name[0]);
      colours.set(name, { name, rgb: w.f.rgb?.[0] ?? w.f.rgb_about?.[0] ?? null, exact: !!w.f.rgb, basic: w.f.basic?.[0] ?? null, thing: w.f.thing?.[0] === 'true', core: w.f.core?.[0] === 'true' });
    } else if (w.type === 'k.values.number' && w.f.text?.[0]) { const t = lc(w.f.text[0]); (numbers.get(t) ?? numbers.set(t, []).get(t)).push({ value: Number(w.f.value?.[0] ?? w.f.value_about?.[0]), kind: w.f.kind?.[0] ?? 'cardinal' }); }   // one text can be two kinds (third: ordinal and fraction)
  }
  return { colours, numbers };
}

/** Seeds the readers from the bundled subset (idempotent). */
export function seedValues() {
  if (state.from !== 'none') return;
  const wires = [];
  for (const text of Object.values(BUNDLED_VALUES)) for (const line of text.split('\n')) { const w = line.charCodeAt(0) === 64 ? parseLine(line) : null; if (w) wires.push({ type: w.type, f: w.attrs }); }
  Object.assign(state, absorb(wires), { from: 'bundled' });
}
seedValues();

let attached = null;
/** The host attaches the knowledge of the session; the catalog's words are fetched on the first read that needs them (nothing is requested at start-up), and replace the seed once they arrive. */
export function attachValues(facts) { attached = facts ?? null; state.loading = null; }
const wake = () => { if (attached && !state.loading) loadValues(attached); };

/** Replaces the seed with the catalog's `k.values` (and `k.colours` families) when the catalog has them; keeps the seed otherwise. Never throws; the settled answer is remembered per `facts`. */
export function loadValues(facts) {
  if (!facts?.wires) return Promise.resolve(state.from);
  if (state.loading?.facts === facts) return state.loading.promise;
  const promise = (async () => {
    try {
      const wires = [...await facts.wires('k.values.colour'), ...await facts.wires('k.values.number')];
      if (wires.length) {
        const got = absorb(wires);
        if (got.colours.size) { for (const [n, c] of got.colours) { const old = state.colours.get(n); if (old) { c.thing = old.thing; c.core = old.core; } } state.colours = got.colours; }   // thing and core are derived once, at build time: the catalog's own colour wires do not carry them
        if (got.numbers.size) state.numbers = got.numbers;
        state.from = 'catalog';
      }
    } catch { /* the seed stays */ }
    return state.from;
  })();
  state.loading = { facts, promise };
  return promise;
}

/** Where the colours came from now: "bundled" (the subset generated from the catalog) or "catalog". */
export const valuesFrom = () => state.from;

/**
 * Spellings and chat shorthand the catalog does not list (reported to the knowledge repository as `core.word` wants, questions.md): the US spelling and the short forms people type.
 * One table for every world; it names no colour and has no value of its own.
 */
const SPELLING = { gray: 'grey', grn: 'green', blu: 'blue', bloo: 'blue', blk: 'black', org: 'orange', pnk: 'pink', gry: 'grey', prp: 'purple', ylw: 'yellow', wht: 'white', brn: 'brown' };

/** The catalog's name of a colour phrase ("Light-Blue", ["light", "blue"], "grn"), or null. A phrase is looked up whole ("light blue" is a colour of the catalog); shades before a colour are the tool's own business. */
export function colourName(words) {
  wake();
  const t = lc(Array.isArray(words) ? words.join(' ') : words).split(' ').map((w) => SPELLING[w] ?? w).join(' ');
  return t && state.colours.has(t) ? t : null;
}
export const colourHex = (name) => state.colours.get(colourName(name))?.rgb ?? null;
export const basicColour = (name) => state.colours.get(colourName(name))?.basic ?? null;
export const colourNames = () => [...state.colours.keys()];
/**
 * COLOUR_FIRST: names that are also drawable things (violet, rose, coral, lemon) but that people mean as colours first; they stay colour words of the lexicon as they were before the colour
 * words came from the catalog. Transitional: the catalog needs a marker for the colour sense of such a name (questions.md), then this list goes.
 */
const COLOUR_FIRST = new Set(['violet', 'rose', 'coral', 'lemon']);
/** The colour words a formalizer lexicon may hold: every phrase of the reader except a name that is also a drawable thing and that no basic colour, k.colours entry or colour-first rule vouches for (tomato, plum, salmon, wheat). */
export const colourLexiconWords = () => colourPhrases().filter((p) => { const c = state.colours.get(p); return !c || !c.thing || c.core || c.basic === c.name || COLOUR_FIRST.has(p); });
/** Is `word` one of the colours people mean first: a basic or core colour of the catalog or a colour-first name (red, orange, violet)? A colour name that is only a shade of a basic colour ("peru" is brown) stays free for a name of the catalog's geography. */
export function isCoreColour(word) { const p = colourName(word); if (!p) return false; const c = state.colours.get(p); return !c || !!c.core || c.basic === c.name || COLOUR_FIRST.has(p); }
/** Every phrase that reads as a colour: the names and the spellings (for building a recogniser), longest first. */
export const colourPhrases = () => [...state.colours.keys(), ...Object.keys(SPELLING)].sort((a, b) => b.length - a.length || a.localeCompare(b));
/** The basic colours (the catalog's `basic` values: a name that is its own basic colour), in the catalog's order. */
export const basicColourNames = () => [...state.colours.values()].filter((c) => c.basic === c.name).map((c) => c.name);
/** Is `word` a colour name (spelling and shorthand included)? */
export const isColourWord = (word) => !!colourName(word);
/** The single-word colour names, as a Set (a fast test for tokenisers). */
export const colourWordSet = () => new Set([...state.colours.keys()].filter((n) => !n.includes(' ')));

/** `{ value, kind }` of a number word ("twelve", "twenty-one", "third", "dozen"), kind one of cardinal, ordinal, group, fraction, multiple, times; null for any other word. */
export const numberInfo = (word, kind = null) => { wake(); const l = state.numbers.get(word) ?? state.numbers.get(lc(word)); return (kind ? l?.find((x) => x.kind === kind) : l?.[0]) ?? null; };
export const numberValue = (word, kind = null) => numberInfo(word, kind)?.value ?? null;
export const numberWords = (kind = null) => [...state.numbers].filter(([, l]) => !kind || l.some((v) => v.kind === kind)).map(([k]) => k);
/** The word of a whole number of a kind ("cardinal": 12 -> "twelve", "ordinal": 3 -> "third"), or null. */
export const numberWordOf = (n, kind = 'cardinal') => { for (const [w, l] of state.numbers) if (l.some((v) => v.kind === kind && v.value === n)) return w; return null; };
