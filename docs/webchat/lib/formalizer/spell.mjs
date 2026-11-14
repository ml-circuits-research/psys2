// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Spell corrector and chat-abbreviation normalizer (spec 03 section 1b and 7.9). Browser-safe, no dependencies.
 *
 * The vocabulary comes from the worlds themselves (pattern literals, lexicons, legend names, knowledge-base names) plus a small list of
 * common English function words. A correction is only a *candidate text*: the validation layer (and the dialog's fallback) accepts it
 * when the rules of the world then parse it, so a wrong guess costs nothing.
 *
 *   const { text, corrections } = spellCorrect('make bigger yes and red lips', { vocab: worldVocabulary(set, 'ui.avatar') });
 *   // text = 'make bigger eyes and red lips', corrections = [{ from: 'yes', to: 'eyes', span: [12, 15], kind: 'spell' }]
 */
import { vocabularyOf, openVocab, lexiconWordsOf, editDistance, SHORT_TYPOS } from './rules/index.mjs?v=25b6e7df5f';
import { isNumberWord } from './rules/numbers.mjs?v=bceb69c353';
import { guard } from './guard.mjs?v=eb1a66f556';
import { namingTables } from './routing.mjs?v=c87e066ce6';
import { lexIndex } from '../worlds/lexicon.mjs?v=5b26d53b3c';

/** Common English function words: never corrected, and valid correction targets (typos of "the", "and", "with" ...). */
export const FUNCTION_WORDS = new Set((
  'a an the and or but if then than so as at by for from in into of on onto to up with without about after before over under again '
  + 'is am are was were be been being do does did done have has had having will would shall should can could may might must '
  + 'i me my mine we us our you your he him his she her it its they them their this that these those there here '
  + 'what which who whom whose when where why how not no all any some each every other another more most less much many few one two '
  + 'also just only very too please thanks thank hello hi hey okay ok let lets get got make made want need like see show tell give take put set '
  + 'should shall ought cannot cant dont doesnt isnt um uh er hmm well oh ah so anyway actually basically really kindly sweetie dear buddy mate '
  + 'now new old big small good bad out off down left right again still even ever never always').split(/\s+/));

/** Chat abbreviations and informal forms, replaced whole-word (case-insensitive). The result is accepted only if the rules then parse it. */
export const ABBREVIATIONS = {
  u: 'you', ur: 'your', r: 'are', pls: 'please', plz: 'please', plss: 'please', thx: 'thanks', ty: 'thank you', whats: 'what is', "what's": 'what is',
  hows: 'how is', "how's": 'how is', wheres: 'where is', "where's": 'where is', whos: 'who is', "who's": 'who is', wanna: 'want to', gonna: 'going to', gotta: 'got to',
  lemme: 'let me', gimme: 'give me', lets: 'let us', dunno: 'do not know', cuz: 'because', coz: 'because', bc: 'because', abt: 'about', sth: 'something',
  '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth', '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth', '10th': 'tenth',
  colour: 'color', colours: 'colors', grey: 'gray',
  ...SHORT_TYPOS,
};


/** Allowed edit distance for a word: none below 3 letters, 1 for 3 to 6 letters, 2 for 7 and more. */
export const spellBudget = (word) => (word.length >= 7 ? 2 : word.length >= 3 ? 1 : 0);

const QUOTE_RE = /"[^"]*"|“[^”]*”/g;
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly', 'ies'];

/** True when `w` (lowercase) is a word of `keep` or an inflection of one (plural, past, -ing, comparative ...). */
function isKnown(w, keep) {
  if (keep.has(w) || isNumberWord(w)) return true;
  for (const s of SUFFIXES) {
    if (!w.endsWith(s) || w.length - s.length < 3) continue;
    const stem = w.slice(0, -s.length);
    if (s === 's' && stem.endsWith('s')) continue;   // "pluss" is not the plural of "plus"
    if (keep.has(stem) || keep.has(`${stem}e`) || (s === 'ies' && keep.has(`${stem}y`)) || keep.has(stem.slice(0, -1) /* doubled consonant */)) return true;
  }
  return false;
}

/** True when the lowercase word `w` is known anywhere: a function word, a number word, a word of `vocab` (any world), a lexicon noun, or an inflection of one. */
export const isKnownWord = (w, vocab) => FUNCTION_WORDS.has(w) || !!vocab.nouns?.has(w) || isKnown(w, vocab);

/** True when one word is an inflection of the other (move/moves, color/colors): not a typo of it. */
export const sameWordForm = (a, b) => isKnown(a, new Set([b])) || isKnown(b, new Set([a]));

/** Words (letters only) of a free-text name, lowercase. */
const wordsOf = (s) => String(s).toLowerCase().match(/[a-z]{3,}/g) ?? [];

/**
 * Predicate for partial understanding: a word may be ignored only when it is a function word or no world knows it. Ignoring a word some
 * world knows ("color", "red") would drop meaning, and digits are never ignored.
 */
export const ignorable = (vocab, global = vocab) => (w) => !!w && !/\d/.test(w) && (FUNCTION_WORDS.has(w) || !global.has(w));

/**
 * Spelling vocabulary of the whole `set` (memoized): the rule vocabulary (pattern literals, lexicons with plurals) plus the words of
 * legend names (type and key ids) and of the knowledge base (ids and short string values).
 */
export function spellVocabulary(set) {
  return set.memo('spell-vocabulary', () => {
    const rv = vocabularyOf(set);
    const vocab = openVocab(new Set(rv), lexIndex(set));
    vocab.freq = new Map(rv.freq ?? []);
    // world and tab names (avatar, chart, map, drawing, document, chess ...) are the words a user names a world with; they are in every world vocabulary, so they rank as own-world words ("vatar" -> avatar)
    for (const phrases of namingTables(set).names.values()) for (const ph of phrases) for (const x of ph.split(' ')) if (/^[a-z]{3,}$/.test(x)) { vocab.add(x); }
    vocab.nouns = lexiconWordsOf(set);   // content nouns of all worlds
    for (const w of set.list()) {
      for (const lw of w.legendWires ?? []) for (const part of String(lw.id ?? '').split(/[.\s]/)) for (const x of wordsOf(part.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '))) vocab.add(x);
      for (const kw of w.kb ?? []) {
        for (const x of wordsOf(String(kw.id ?? '').replace(/_/g, ' '))) vocab.add(x);
        for (const e of kw.entries ?? []) if (e.value?.kind === 'string' && String(e.value.v).length <= 40) for (const x of wordsOf(e.value.v)) vocab.add(x);
      }
    }
    return vocab;
  });
}

/** Spelling vocabulary of one world with its imports (memoized per world). */
export function worldVocabulary(set, worldId) {
  return set.memo(`spell-vocabulary:${worldId}`, () => {
    const all = spellVocabulary(set);
    const own = vocabularyOf(restrictedSet(set, [worldId]));
    const vocab = openVocab(new Set(own), lexIndex(restrictedSet(set, [worldId])));
    vocab.freq = new Map(own.freq ?? []);
    for (const phrases of namingTables(set).names.values()) for (const ph of phrases) for (const x of ph.split(' ')) if (/^[a-z]{3,}$/.test(x)) { vocab.add(x); }
    vocab.nouns = all.nouns;   // content nouns of every world: one known only elsewhere is not "fixed" into this world
    vocab.world = true;
    const personal = lexIndex(set).names;   // first names are words too, but a lowercase "liv" for "live" is a typo, not a person
    vocab.global = { has: (w) => all.has(w) && !personal.has(w) && !Object.hasOwn(SHORT_TYPOS, w) };   // RD1b: a word of any world's vocabulary is never "corrected" into this world's word
    // legend and kb words of this world only: keep the ones that are also in the global vocabulary and appear in this world's files
    for (const id of set.available(worldId)) {
      const w = set.get(id);
      for (const lw of w?.legendWires ?? []) for (const part of String(lw.id ?? '').split(/[.\s]/)) for (const x of wordsOf(part.replace(/_/g, ' '))) if (all.has(x)) vocab.add(x);
      for (const kw of w?.kb ?? []) {
        for (const x of wordsOf(String(kw.id ?? '').replace(/_/g, ' '))) vocab.add(x);
        for (const e of kw.entries ?? []) if (e.value?.kind === 'string' && String(e.value.v).length <= 40) for (const x of wordsOf(e.value.v)) vocab.add(x);
      }
    }
    return vocab;
  });
}

/** Lexicon words (with plurals) of one world and its imports, memoized: the `protect` set for the open tab (never pattern literals: that broke `stat` -> `start`). */
export function protectedWordsOf(set, worldOrTab) {
  const worldId = worldOrTab && !set.get(worldOrTab) ? set.list().find((w) => w.tab?.id === worldOrTab)?.id : worldOrTab;   // a tab id also works
  if (!worldId || !set.get(worldId)) return null;
  return set.memo(`spell-protect:${worldId}`, () => lexiconWordsOf(restrictedSet(set, [worldId])));
}

/** A view of the world set with only `ids` (and their imports); the legends are shared. Own memo cache. */
const RESTRICTED = new WeakMap();   // set -> Map(ids key -> restricted view)
export function restrictedSet(set, ids) {
  const all = [...new Set(ids.flatMap((w) => (set.get(w) ? set.available(w) : [])))];
  // Memoized per (set, worlds): every restricted view has its own memo cache (vocabulary, lexicon index ...), so a fresh view per call rebuilt
  // them for every candidate text of the leniency stage (HANG task: 3 s for a one-typo message, most of it vocabularyOf).
  const key = [...all].sort().join('|');
  let views = RESTRICTED.get(set);
  if (!views) RESTRICTED.set(set, views = new Map());
  if (views.has(key)) return views.get(key);
  const sub = Object.create(set);
  views.set(key, sub);
  sub._cache = new Map();
  sub.parent = set.parent ?? set;   // the full set, for context-anchored spelling (a word another world knows is not corrected)
  sub.list = () => all.map((i) => set.get(i));
  return sub;
}

const matchCase = (src, out) => (/^[A-Z]/.test(src) ? out[0].toUpperCase() + out.slice(1) : out);

/**
 * Correct `text` to the vocabulary. Order: abbreviation map first, then spelling.
 * Left alone: quoted text, numbers, words with digits, capitalized names (not at the start), words shorter than 3 letters, words that are
 * known (in `vocab`, `FUNCTION_WORDS`, or an inflection of one) and ambiguous words (two candidates at the same distance and rank).
 * Candidates: words of `vocab` (the candidate world's) rank before function words; smaller distance first.
 * @param {string} text
 * `protect`: optional set of words of the active world (tab) that are never changed.
 * `short`: also correct unknown two-letter words (distance 1); only for the open tab's own vocabulary.
 * @param {{ vocab: Set<string>, maxCorrections?: number, abbreviations?: boolean, spelling?: boolean, protect?: Set<string> }} opts
 * @returns {{ text: string, corrections: { from: string, to: string, span: [number, number], kind: 'abbreviation'|'spell' }[] }}
 */
export function spellCorrect(text, { vocab, maxCorrections = 6, abbreviations = true, spelling = true, protect = null, short = false } = {}) {
  const quoted = [...text.matchAll(QUOTE_RE)].map((m) => [m.index, m.index + m[0].length]);
  const keep = new Set([...FUNCTION_WORDS, ...vocab]);
  // Context anchoring: a word the active world (`protect`, the open tab's vocabulary) knows is never changed, and a content word (4+ letters)
  // that another world knows is not "corrected" into a word of this world: that would change both the world and the noun ("boat" -> "coat").
  const known = (w) => !!protect?.has(w) || (w.length >= 3 && !!vocab.global?.has(w)) || (w.length >= 4 && !!vocab.world && !vocab.has(w) && !!vocab.nouns?.has(w));
  const cands = [...vocab].filter((w) => w.length >= 2 && /^[a-z]+$/.test(w) && !Object.hasOwn(ABBREVIATIONS, w));
  for (const w of FUNCTION_WORDS) if (w.length >= 2 && !vocab.has(w)) cands.push(w);
  const corrections = [];
  let out = '', last = 0, first = true;
  for (const m of text.matchAll(WORD_RE)) {
    guard.check('spell');   // a long message times vocabulary size: a cancellation point per word
    const raw = m[0], start = m.index, end = start + raw.length, lower = raw.toLowerCase();
    const isFirst = first; first = false;
    if (corrections.length >= maxCorrections || quoted.some(([a, b]) => start >= a && end <= b)) continue;
    let to = null, kind = null;
    if (abbreviations && Object.hasOwn(ABBREVIATIONS, lower)) { to = ABBREVIATIONS[lower]; kind = 'abbreviation'; }
    else if (spelling && /^[a-z]+$/.test(lower) && (isFirst || !/^[A-Z]/.test(raw)) && !isKnown(lower, keep) && !known(lower)) {
      // `short` (the open tab's world only, RP3): a two-letter word that nothing knows is one edit from a word of this world ("un" -> "sun") or a function word ("si" -> "is")
      const maxEdits = short && lower.length === 2 ? 1 : spellBudget(lower);
      if (maxEdits) {
        // rank: smaller distance, then a word of the world's own vocabulary, then the same letters (a swap such as "eyse")
        const letters = [...lower].sort().join('');
        let best = null, bestRank = Infinity, tied = [];
        for (const w of cands) {
          if (Math.abs(w.length - lower.length) > maxEdits) continue;
          const d = editDistance(lower, w, maxEdits);
          if (d > maxEdits) continue;
          const rank = d * 4 + (vocab.has(w) ? 0 : 2) + ([...w].sort().join('') === letters ? 0 : 1);
          if (rank < bestRank) { best = w; bestRank = rank; tied = [w]; }
          else if (rank === bestRank && w !== best) tied.push(w);
        }
        // equally ranked (distance, own vocabulary, same letters): the most frequent word in the patterns and lexicons; still tied: no guess
        if (tied.length > 1 && vocab.freq) {
          const top = Math.max(...tied.map((w) => vocab.freq.get(w) ?? 0));
          tied = tied.filter((w) => (vocab.freq.get(w) ?? 0) === top);
        }
        if (best && tied.length === 1) { to = tied[0]; kind = 'spell'; }
      }
    }
    if (!to || to === lower) continue;
    out += text.slice(last, start) + matchCase(raw, to);
    last = end;
    corrections.push({ from: raw, to, span: [start, end], kind });
  }
  out += text.slice(last);
  return { text: corrections.length ? out : text, corrections };
}

/**
 * Every typo candidate of the words of `text` that `vocab` does not know, ranked as `spellCorrect` ranks them (distance, own vocabulary, same
 * letters, then frequency), not only the single best: the caller tries them against the rules and the interpreter ("nect to a house" is
 * "next" and "neat" at the same distance; only one of them is a position). `protect`, quoted text, numbers, names and function words stay.
 * @returns {{ from: string, span: [number, number], options: string[] }[]}
 */
export function spellCandidates(text, { vocab, protect = null, maxPerWord = 5 } = {}) {
  const quoted = [...text.matchAll(QUOTE_RE)].map((m) => [m.index, m.index + m[0].length]);
  const keep = new Set([...FUNCTION_WORDS, ...vocab]);
  const cands = [...vocab].filter((w) => w.length >= 2 && /^[a-z]+$/.test(w) && !Object.hasOwn(ABBREVIATIONS, w));
  for (const w of FUNCTION_WORDS) if (w.length >= 2 && !vocab.has(w)) cands.push(w);
  const out = [];
  let first = true;
  for (const m of text.matchAll(WORD_RE)) {
    guard.check('spell');   // a long message times vocabulary size: a cancellation point per word
    const raw = m[0], start = m.index, end = start + raw.length, lower = raw.toLowerCase();
    const isFirst = first; first = false;
    if (quoted.some(([a, b]) => start >= a && end <= b) || !/^[a-z]+$/.test(lower) || (!isFirst && /^[A-Z]/.test(raw))) continue;
    if (isKnown(lower, keep) || protect?.has(lower) || (lower.length >= 3 && vocab.global?.has(lower)) || (lower.length >= 4 && vocab.world && !vocab.has(lower) && vocab.nouns?.has(lower))) continue;
    const maxEdits = spellBudget(lower);
    if (!maxEdits) continue;
    const letters = [...lower].sort().join('');
    const ranked = [];
    for (const w of cands) {
      if (Math.abs(w.length - lower.length) > maxEdits) continue;
      const d = editDistance(lower, w, maxEdits);
      if (d > maxEdits) continue;
      ranked.push({ w, rank: d * 4 + (vocab.has(w) ? 0 : 2) + ([...w].sort().join('') === letters ? 0 : 1), f: vocab.freq?.get(w) ?? 0 });
    }
    ranked.sort((a, b) => a.rank - b.rank || b.f - a.f || a.w.localeCompare(b.w));
    if (ranked.length) out.push({ from: raw, span: [start, end], options: ranked.slice(0, maxPerWord).map((x) => matchCase(raw, x.w)) });
  }
  return out;
}

/**
 * Second chance for a text no candidate parses: change ONE word that the vocabulary already knows to a close neighbour (edit distance 1,
 * the neighbour not a function word), because a typo can spell another real word ("yes" for "eyes"). Returns up to `maxTexts` candidate
 * texts, each with its single correction; the caller keeps only those the rules parse. Numbers, names, quoted text and function words stay.
 * @returns {{ text: string, corrections: { from: string, to: string, span: [number, number], kind: 'spell' }[] }[]}
 */
export function spellAlternates(text, { vocab, maxPerWord = 4, maxTexts = 12, protect = null, short = false } = {}) {
  const quoted = [...text.matchAll(QUOTE_RE)].map((m) => [m.index, m.index + m[0].length]);
  const cands = [...vocab].filter((w) => w.length >= 3 && /^[a-z]+$/.test(w) && !FUNCTION_WORDS.has(w) && !Object.hasOwn(ABBREVIATIONS, w));
  const out = [];
  let first = true;
  for (const m of text.matchAll(WORD_RE)) {
    guard.check('spell');   // a long message times vocabulary size: a cancellation point per word
    const raw = m[0], start = m.index, end = start + raw.length, lower = raw.toLowerCase();
    const isFirst = first; first = false;
    if (protect?.has(lower) || (lower.length >= 4 && vocab.nouns?.has(lower) && (!vocab.world || !vocab.has(lower)))) continue;   // known in the active tab / a content noun of another world
    if (!(short ? /^[a-z]{2,}$/ : /^[a-z]{3,}$/).test(lower) || FUNCTION_WORDS.has(lower) || isNumberWord(lower) || (!isFirst && /^[A-Z]/.test(raw)) || quoted.some(([a, b]) => start >= a && end <= b)) continue;
    let n = 0;
    for (const w of cands) {
      if (w === lower || Math.abs(w.length - lower.length) > 1 || editDistance(lower, w, 1) > 1) continue;
      if (isKnown(lower, new Set([w]))) continue;   // an inflection of the same word (plural, -ing ...) is not a typo
      out.push({ text: text.slice(0, start) + matchCase(raw, w) + text.slice(end), corrections: [{ from: raw, to: w, span: [start, end], kind: 'spell' }] });
      if (++n >= maxPerWord) break;
    }
    if (out.length >= maxTexts) break;
  }
  return out.slice(0, maxTexts);
}
