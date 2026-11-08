/**
 * Value checker of the seq2seq normalizer (spec 03 section 7.11, ADR-002 idea: a translation must not change the values of the text).
 * Browser-safe, no dependencies beyond the formalizer helpers.
 *
 * A normalized phrasing `cand` of the piece `src` is accepted only when it keeps what the user said:
 *   - numbers: the multiset of numeric values (digits, number words, ordinals) is equal;
 *   - colours: the set of colour words is equal;
 *   - negation: both or neither carry a negation (not, no, never, without, n't forms, nothing, none, stop/undo/cancel are NOT negations here);
 *   - quoted strings: every quoted string of the source is in the candidate and the candidate adds none;
 *   - names and other content words that the world does not know (so they are values, not rule words: a name, a title, a typo of one):
 *     every such word of the source has a counterpart in the candidate (equal or within the spelling budget), and every such word
 *     of the candidate has a counterpart in the source. A word the world knows may be dropped or added (that is the point of simplifying).
 * `{ ok, reason }`; with `vocab` absent only the first four checks run.
 */
import { isNumberWord, parseNumberRun } from '../formalizer/rules/numbers.mjs';
import { editDistance } from '../formalizer/rules/normalize.mjs';
import { FUNCTION_WORDS, ABBREVIATIONS, spellBudget } from '../formalizer/spell.mjs';

export const COLORS = new Set('red orange yellow green blue purple violet pink brown black white gray grey gold golden silver cyan magenta turquoise beige navy teal maroon lime lilac indigo tan rose peach crimson scarlet azure'.split(' '));
const NEG = new Set("not no never without nothing none nobody nowhere neither nor cannot cant dont doesnt didnt isnt arent wasnt werent wont wouldnt shouldnt couldnt hasnt havent hadnt aint don't doesn't didn't isn't aren't wasn't weren't won't wouldn't shouldn't couldn't hasn't haven't hadn't can't ain't".split(/\s+/));
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const QUOTE_RE = /"([^"]*)"|“([^”]*)”/g;
const ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: 'last', next: 'next' };

/** Chat fillers and abbreviations: never values. */
const FILLERS = new Set([...Object.keys(ABBREVIATIONS), ...'lol haha hehe lmao yo yep yup nope hmm hm um uh er ah oh ok okay yeah so well like kinda sorta stuff thing things maybe actually basically really simply just kindly asap'.split(' ')]);
const NOT_A_NUMBER_BEFORE = new Set('the which this that each every another any my your his her their our a an no new old next last first big small little red green blue yellow pink black white one'.split(' '));

const lc = (s) => s.toLowerCase().replace(/’/g, "'");
const stripQuotes = (t) => t.replace(QUOTE_RE, ' ');

/** Sorted list of the numeric values of a text (digits, number words, ordinals as `1st`..). */
export function numbersOf(text) {
  const words = [...stripQuotes(text).matchAll(WORD_RE)].map((m) => lc(m[0]));
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d+(?:[.,]\d+)*$/.test(w)) { out.push(String(Number(w.replace(/,/g, '')))); continue; }
    const o = /^(\d+)(?:st|nd|rd|th)$/.exec(w);
    if (o) { out.push(`o${Number(o[1])}`); continue; }
    if (w in ORDINAL && typeof ORDINAL[w] === 'number') { out.push(`o${ORDINAL[w]}`); continue; }
    if (w === 'one' && (i > 0 && NOT_A_NUMBER_BEFORE.has(words[i - 1]))) continue;   // the pronoun ("the red one", "which one")
    if (isNumberWord(w)) {
      const run = parseNumberRun(words, i);
      if (run) { out.push(String(run.value)); i += run.length - 1; continue; }
    }
    if (/\d/.test(w)) out.push(w);   // mixed tokens such as g1, a4: kept verbatim
  }
  return out.sort();
}

const coloursOf = (text) => new Set([...stripQuotes(text).matchAll(WORD_RE)].map((m) => lc(m[0])).filter((w) => COLORS.has(w)));
const hasNegation = (text) => [...stripQuotes(text).matchAll(WORD_RE)].some((m) => NEG.has(lc(m[0])) || /n't$/.test(lc(m[0])));
const quotesOf = (text) => [...text.matchAll(QUOTE_RE)].map((m) => lc((m[1] ?? m[2] ?? '').trim())).sort();
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Words that are values: unknown to the world vocabulary, not function words, not numbers/colours (those are checked separately). */
function valueWords(text, vocab) {
  return [...stripQuotes(text).matchAll(WORD_RE)].map((m) => lc(m[0])).filter((w) => w.length >= 2 && !/\d/.test(w) && !FUNCTION_WORDS.has(w) && !FILLERS.has(w) && !COLORS.has(w) && !isNumberWord(w) && !vocab.has(w) && !vocab.has(w.replace(/(?:'s|s|es)$/, '')));
}
const close = (a, b) => a === b || editDistance(a, b, spellBudget(a.length >= b.length ? a : b)) <= spellBudget(a.length >= b.length ? a : b);

/** Pairs of opposite words (a rewrite may not introduce one that the user did not say: "make it small" is not "make it big"). */
const OPPOSITES = [['big', 'small'], ['bigger', 'smaller'], ['large', 'little'], ['up', 'down'], ['left', 'right'], ['top', 'bottom'], ['on', 'off'], ['open', 'close'], ['start', 'stop'], ['yes', 'no'], ['next', 'previous'],
  ['first', 'last'], ['more', 'less'], ['add', 'remove'], ['add', 'delete'], ['show', 'hide'], ['increase', 'decrease'], ['faster', 'slower'], ['fast', 'slow'], ['louder', 'quieter'], ['before', 'after'], ['north', 'south'], ['east', 'west'],
  ['in', 'out'], ['forward', 'back'], ['full', 'empty'], ['win', 'lose'], ['black', 'white'], ['long', 'short'], ['high', 'low'], ['higher', 'lower'], ['plus', 'minus'], ['times', 'divided'], ['multiply', 'divide'], ['biggest', 'smallest'], ['highest', 'lowest'], ['best', 'worst']];
const OPPOSITE = new Map();
for (const [a, b] of OPPOSITES) { (OPPOSITE.get(a) ?? OPPOSITE.set(a, new Set()).get(a)).add(b); (OPPOSITE.get(b) ?? OPPOSITE.set(b, new Set()).get(b)).add(a); }
/** Words a rewrite may add without a counterpart in the piece (generic request frames). */
const ADDABLE = new Set('add show list make tell give get what how who which where when why name count do is are does has have want let me please can could would the a an it'.split(' '));
const stem = (w) => w.replace(/(?:ies|es|s|ed|ing|er|est)$/, '');
const contentWords = (text) => [...stripQuotes(text).matchAll(WORD_RE)].map((m) => lc(m[0])).filter((w) => w.length >= 2 && !FUNCTION_WORDS.has(w) && !FILLERS.has(w) && !isNumberWord(w) && !/\d/.test(w));

/** Check `cand` against the original `src`. `vocab`: the candidate world's vocabulary (worldVocabulary); optional. */
export function checkValues(src, cand, { vocab = null, lost = 'unknown', grounded = false, keepKnown = false, polarity = false } = {}) {
  const ns = numbersOf(src), nc = numbersOf(cand);
  if (!sameList(ns, nc)) return { ok: false, reason: `numbers differ (${ns.join(' ') || 'none'} vs ${nc.join(' ') || 'none'})` };
  const cs = coloursOf(src), cc = coloursOf(cand);
  if (cs.size !== cc.size || [...cs].some((c) => !cc.has(c))) return { ok: false, reason: `colours differ (${[...cs].join(' ') || 'none'} vs ${[...cc].join(' ') || 'none'})` };
  if (hasNegation(src) !== hasNegation(cand)) return { ok: false, reason: 'negation differs' };
  const qs = quotesOf(src), qc = quotesOf(cand);
  if (!sameList(qs, qc)) return { ok: false, reason: 'quoted text differs' };
  if (vocab) {
    const vs = valueWords(src, vocab), vc = valueWords(cand, vocab);
    const allS = [...stripQuotes(src).matchAll(WORD_RE)].map((m) => lc(m[0])), allC = [...stripQuotes(cand).matchAll(WORD_RE)].map((m) => lc(m[0]));   // a typo of a known word has its counterpart among ALL words
    const caps = lost === 'capitalized' ? new Set([...stripQuotes(src).matchAll(WORD_RE)].filter((m) => m.index > 0 && /^\p{Lu}/u.test(m[0])).map((m) => lc(m[0]))) : null;
    const gone = vs.find((w) => (!caps || caps.has(w)) && !allC.some((x) => close(w, x)));
    if (gone) return { ok: false, reason: `value word "${gone}" is not in the rewrite` };
    const added = vc.find((x) => !allS.some((w) => close(w, x)));
    if (added) return { ok: false, reason: `value word "${added}" was not in the original` };
  }
  if (polarity) {
    const ws = new Set([...stripQuotes(src).matchAll(WORD_RE)].map((m) => lc(m[0]))), wc = [...stripQuotes(cand).matchAll(WORD_RE)].map((m) => lc(m[0]));
    for (const w of wc) if (!ws.has(w) && [...(OPPOSITE.get(w) ?? [])].some((o) => ws.has(o))) return { ok: false, reason: `opposite word "${w}" introduced` };
    const wcs = new Set(wc);
    for (const w of ws) if (OPPOSITE.has(w) && !wcs.has(w)) return { ok: false, reason: `opposite-capable word "${w}" was dropped` };
  }
  if (grounded || keepKnown) {
    const cs2 = contentWords(src), cc2 = contentWords(cand);
    const allSrc = [...stripQuotes(src).matchAll(WORD_RE)].map((m) => lc(m[0])), allCand = [...stripQuotes(cand).matchAll(WORD_RE)].map((m) => lc(m[0]));   // counterparts are searched among ALL words (a typo of a function word counts)
    const has = (list, w) => list.some((x) => x === w || stem(x) === stem(w) || close(x, w));
    const expansions = new Set([...stripQuotes(src).matchAll(WORD_RE)].flatMap((m) => String(ABBREVIATIONS[lc(m[0])] ?? '').split(' ')));   // normalization whitelist: abbreviation expansions (u -> you, whats -> what is)
    if (grounded) { const g = cc2.find((w) => !ADDABLE.has(w) && !expansions.has(w) && !has(allSrc, w)); if (g) return { ok: false, reason: `word "${g}" is not grounded in the original` }; }
    if (keepKnown && vocab) { const k = cs2.find((w) => (vocab.has(w) || vocab.has(stem(w))) && !ADDABLE.has(w) && !has(allCand, w)); if (k) return { ok: false, reason: `known word "${k}" was dropped` }; }
  }
  return { ok: true, reason: 'values preserved' };
}
