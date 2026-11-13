// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Referents are matched to the scene first (SCENE-NATURAL P3). Browser-safe: no `node:*` imports.
 *
 * "corcodiles", "corcodilii", "iraba": the picture had crocodiles, and the message names them with a slip. Before any dictionary repair (the spelling stage
 * that tries every neighbour of an unknown word in every world), an unknown noun of the message is compared with the names of the things of the open scene,
 * then with the things the open tab can make: the stem of the word (plural endings of English and of Romanian stripped), edit distance up to 2 with a swap of
 * two neighbours counting as one, the word as typed or as translated. A single closest thing wins; a tie, or no thing within reach, leaves the word to the
 * dictionary repair. Nothing here is a list of phrases: the things come from the state of the worlds and from the open tab's own vocabulary.
 *
 * Work is counted in steps (`budget.tick`), never in milliseconds.
 */
import { budget } from './budget.mjs?v=123c3e1329';
import { spellVocabulary, protectedWordsOf, isKnownWord } from '../formalizer/spell.mjs?v=5ee31b8394';
import { nameIndex } from '../formalizer/names.mjs?v=588f8f71a1';
import { lexIndex } from '../worlds/lexicon.mjs?v=e3316469a7';

const WORD = /[\p{L}]+/gu;
const QUOTE = /"[^"]*"|“[^”]*”/g;
const MIN_LENGTH = 4;
const MAX_STATE_NODES = 150;

const ENDINGS = ['ies', 'ilor', 'uri', 'ului', 'lor', 'ii', 'es', 'le', 'ul', 's', 'i', 'e', 'a'];

/** The word as it is and without each plural or case ending it has (English s/es/ies, Romanian i/ii/e/le/uri/lor/ilor and the article endings), lowercase. */
export function stemsOf(word) {
  const w = String(word).toLowerCase();
  return [w, ...ENDINGS.filter((e) => w.endsWith(e) && w.length - e.length >= 3).map((e) => w.slice(0, -e.length))];
}
/** The shortest stem: the word without its ending. */
export const stemOf = (word) => stemsOf(word).reduce((a, b) => (b.length < a.length ? b : a));

/** Optimal string alignment distance: insert, delete, substitute and swap of two neighbours each cost 1 (a slip of the fingers). `max` stops early. */
export function slipDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    budget.tick('scene.edit');
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

/**
 * The things of the worlds' states, per world: the `kind` / `thing` strings (and, with `keys`, other string fields such as `name`) of the objects of any list
 * in a world state, lowercase. `order` is the worlds to read, the open tab's first. Returns a Map world -> Set(noun).
 */
export function sceneThings(state, order, keys = ['thing', 'kind']) {
  const out = new Map();
  let nodes = 0;
  const walk = (v, world, depth) => {
    if (!v || typeof v !== 'object' || depth > 3 || nodes > MAX_STATE_NODES) return;
    budget.tick('scene.walk');
    nodes++;
    if (Array.isArray(v)) { for (const x of v) walk(x, world, depth + 1); return; }
    for (const k of keys) if (typeof v[k] === 'string' && /^[a-z][a-z _-]*$/i.test(v[k]) && v[k] !== 'composite') (out.get(world) ?? out.set(world, new Set()).get(world)).add(v[k].toLowerCase().replace(/^composite:/, '').replace(/[_-]/g, ' '));
    for (const [k, x] of Object.entries(v)) if (x && typeof x === 'object' && k !== 'history' && k !== 'future' && k !== 'undo' && k !== 'redo' && k !== 'sunStash') walk(x, world, depth + 1);
  };
  for (const w of order) walk(state[w], w, 0);
  return out;
}

/** The names of the things in the worlds' states: the `kind` / `thing` strings of the objects of any list in a world state, the open tab's world first (lowercase). */
export function sceneNouns(dialog) {
  const state = dialog.isession?.state ?? {};
  const ctx = dialog.context();
  const order = [ctx.tabWorld, ...Object.keys(state)].filter((w, i, a) => w && w !== 'ui.shell' && a.indexOf(w) === i);
  const out = new Map();   // noun -> world (a later world of the order overwrites an earlier one, as before)
  for (const [w, nouns] of sceneThings(state, order)) for (const n of nouns) out.set(n, w);
  return out;
}

const pluralOf = (n) => (/(?:s|x|ch|sh)$/.test(n) ? `${n}es` : /[^aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : `${n}s`);
const looksPlural = (w) => /(?:ii|i|s|le|uri)$/.test(w.toLowerCase());

/**
 * The closest of `names` (a Map or array of nouns) to `word`: { name, dist } when exactly one is closest and within reach, else null.
 * Reach: stems up to 2 edits apart (1 when the stem is shorter than 5 letters).
 */
function closest(word, names, maxReach = 2) {
  const ws = stemsOf(word);
  const reach = Math.min(maxReach, stemOf(word).length >= 5 ? 2 : 1);
  let best = null, tie = false;
  for (const n of names) {
    const last = n.split(' ').at(-1);
    let d = reach + 1;
    for (const a of ws) for (const b of stemsOf(last)) d = Math.min(d, slipDistance(a, b, reach));
    if (d > reach) continue;
    if (!best || d < best.dist) { best = { name: n, dist: d }; tie = false; }
    else if (d === best.dist && n !== best.name) tie = true;
  }
  return best && !tie ? best : null;
}

/**
 * The text with the unknown nouns that name a thing of the scene (then a thing of the open tab) replaced by that thing, and what was assumed:
 * `{ text, corrections: [{ from, to, kind: 'scene' }] }`, or null when no word needed it.
 */
export function repairFromScene(dialog, text, { extra = [] } = {}) {
  const set = dialog.engine?.set;
  if (!set) return null;
  const quoted = [...text.matchAll(QUOTE)].map((m) => [m.index, m.index + m[0].length]);
  const toks = [...text.matchAll(WORD)].map((m) => ({ raw: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length })).filter((t) => t.lower.length >= MIN_LENGTH && !quoted.some(([a, b]) => t.start >= a && t.end <= b));
  if (!toks.length) return null;
  const global = spellVocabulary(set);
  const scene = sceneNouns(dialog);
  const sceneKnown = new Set([...scene.keys()].flatMap((n) => { const l = n.split(' ').at(-1); return [n, l, pluralOf(l), pluralOf(n)]; }));
  const unknown = toks.filter((t) => !isKnownWord(t.lower, global) && !sceneKnown.has(t.lower));
  if (!unknown.length) return null;
  const tab = dialog.context().tabWorld;
  const tabNouns = tab && (dialog._waLang ?? 'en') === 'en' && set.get(tab)?.patterns?.length ? [...(protectedWordsOf(set, tab) ?? [])].filter((n) => n.length >= MIN_LENGTH && !n.includes(' ') && !nameIndex(set).exact.get(n)?.kinds.size && !lexIndex(set).names.has(n)) : [];
  const picks = [];
  for (const t of unknown.slice(0, 6)) {
    budget.tick('scene.word');
    let hit = closest(t.lower, [...scene.keys(), ...extra]);   // the scene first
    // (the things the open tab can make are left to the dictionary repair: guessing among them rewrote free words such as "bolt" into "boat")
    if (!hit) continue;
    const to = looksPlural(t.lower) && !/s$/.test(hit.name) ? pluralOf(hit.name) : hit.name;
    picks.push({ from: t.raw, to, span: [t.start, t.end], kind: 'scene' });
  }
  if (!picks.length) return null;
  let out = text;
  for (const p of [...picks].sort((a, b) => b.span[0] - a.span[0])) out = out.slice(0, p.span[0]) + p.to + out.slice(p.span[1]);
  return { text: out, corrections: picks };
}
