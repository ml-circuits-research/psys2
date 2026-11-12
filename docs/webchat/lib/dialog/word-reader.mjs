// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The library's reader core over a world's `core.word` facts (sopworld >= 0.9, spec 16 section 4): a message becomes frames (one per clause, a clause without a verb
 * takes the verb of the clause before it: the library does that), `interpret` reads them into candidate splits, `score` judges them on the instance and `veto` says
 * whether the top reading may be answered. Read-only: nothing is told to the world. Browser-safe: no `node:*` imports; the world is the library's.
 *
 * Measurement only for now (`scripts/e2-splits.mjs`): the readings are not turned into dialogue wires, so nothing is acted on.
 */

const CLAUSE_SPLIT = /\s*(?:[.;?!]+|,|\band then\b|\bthen\b|\band also\b|\balso\b|\band\b)\s*/i;
const tokens = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+(?:\.\d+)?/gu) ?? [];

/** Function words: not content, so a reading that leaves them out is no worse (the host's own filler list is longer; these are the ones a clause needs not mention). */
const FUNCTION = new Set(['a', 'an', 'the', 'please', 'pls', 'can', 'could', 'would', 'will', 'i', 'you', 'me', 'my', 'it', 'of', 'to', 'for', 'do', 'does', 'is', 'are', 'am', 'that', 'this', 'those', 'these', 'just', 'now', 'hey', 'ok', 'okay', 'so', 'and']);
const WH = new Set(['how', 'what', 'which', 'who', 'where', 'when', 'why']);

/** The clauses of a message as lists of tokens (empty ones dropped). */
export const clausesOf = (text) => String(text ?? '').split(CLAUSE_SPLIT).map(tokens).filter((c) => c.length);

/** The tokens of a clause as a frame: the first word that means an action or a type is the verb, digits are numbers, the rest are arguments; no verb word: loose words. */
export function frameOf(clause, words, lang = 'en', { first = true } = {}) {
  const numbers = clause.filter((t) => /^\d+(\.\d+)?$/.test(t)).map(Number);
  const question = clause.some((t) => WH.has(t));
  const rest = clause.filter((t) => !/^\d+(\.\d+)?$/.test(t) && !FUNCTION.has(t));
  const isVerb = (t) => (words.get(t) ?? []).some((e) => e.meanings?.some((m) => m.kind === 'action' || m.kind === 'type'));
  const v = rest.findIndex(isVerb);
  if (v < 0) return first ? { lang, words: rest, numbers, ...(question ? { question } : {}) } : { lang, args: rest, numbers, ...(question ? { question } : {}) };
  return { lang, verb: rest[v], args: rest.filter((_, i) => i !== v), numbers, ...(question ? { question } : {}) };
}

/**
 * Reads `text` on `world` (a library World that holds the `core.word` facts of `lang`): returns `{ frames, candidates, results, order, top, veto }`.
 * Alternative splits: the message split at every clause break, and as one clause.
 */
export function readText(world, text, { lang = 'en', limit = 12 } = {}) {
  const words = world.words(lang);
  const cl = clausesOf(text);
  if (!cl.length) return { frames: [], candidates: [], results: [], order: [], top: null, veto: null };
  const split = cl.map((c, i) => frameOf(c, words, lang, { first: i === 0 }));
  const whole = cl.length > 1 ? [frameOf(cl.flat(), words, lang)] : null;
  const r = world.interpret(whole ? [split, whole] : split, { limit });
  if (!r.candidates?.length) return { frames: split, candidates: [], results: [], order: [], top: null, veto: null };
  const s = world.score(r.candidates);
  const top = r.candidates[s.order[0]];
  return { frames: split, candidates: r.candidates, results: s.candidates, order: s.order, top, veto: world.veto(s), unresolved: r.unresolved ?? [] };
}

/** The words for the values of a slot (`core.word` wires, English, the singular and the plural), for a world whose lexicon lists them. */
export function valueWords(values, slot, lang = 'en') {
  return values.map((v) => `@w.${lang}.${v}.v core.word lang=${lang} text=${v} text=${v}s means=${v} of=${slot}`).join('\n');
}
