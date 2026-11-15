// SPDX-License-Identifier: AGPL-3.0-only
/**
 * CONTEXTUAL REPAIR OF A SOURCE-LANGUAGE MESSAGE (Q39 S3, reviewer 2026-11-15 16:50; spec 05 "Contextual repair of the source", spec 28 section 10).
 *
 * One candidate source of the door's reading, not a stage in front of the translation: the vendored library's `repairWords` (sopworld >= 0.151) runs over the Romanian message with
 *   - the open tab's live world (its English words told in Romanian: the forms the language world's dictionary and morphology give them, plus the names of the things on the screen),
 *   - the other live worlds' words (same way),
 *   - the dialogue's recent words (what the person typed before, the dictionary knows),
 *   - then the language's dictionary (every surface form of the language pack, folded and with diacritics).
 * A word the language knows (the dictionary, the morphology: an inflection, diacritics typed away), an English word, a name and quoted text are never repaired; a repair needs a unique best,
 * else the word stays and an ask is recorded. No Romanian word is written here: the words come from `ro` (w.lang.ro, src/lang/ro.mjs) and the translator's vocabulary.
 * Browser-safe (no node:*).
 */

const WORD = /"[^"]*"|„[^”]*”|«[^»]*»|\d+(?:[.,]\d+)?|[\p{L}][\p{L}'_-]*|\s+|\S/gu;
const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The edit cost a dictionary-only repair may have (the library's costs: a neighbouring key 0.4, a swap 0.6, an accent 0.1, any other edit 1). */
const DICTIONARY_MAX_COST = 0.6;
const dictionaries = new WeakMap();
/** Every surface form of the language pack, folded and as written (a word typed without its diacritics is the language's too). Built once per vocabulary. */
function dictionaryOf(vocab) {
  let d = dictionaries.get(vocab);
  if (!d) { d = new Set(); for (const [k, forms] of vocab) { d.add(k); for (const f of forms) d.add(String(f).toLowerCase()); } dictionaries.set(vocab, d); }
  return d;
}

const surfaces = new WeakMap();
/** The language pack's surface forms as written (with their diacritics), without the folded keys. */
function surfaceOf(vocab, dict) {
  let d = surfaces.get(vocab);
  if (!d) { d = new Set(); for (const forms of vocab.values()) for (const f of forms) d.add(String(f).toLowerCase()); surfaces.set(vocab, d); }
  return d;
}

const pools = new WeakMap();
/** The other live worlds' Romanian forms as a small World of `core.word` facts, which the library reads as the source "worlds" (built once per word set). */
function poolWorld(lib, words) {
  let w = pools.get(words);
  if (!w) {
    w = new lib.World();
    const lines = [...words].filter((x) => /^[\p{L}]+$/u.test(x)).map((x, i) => `@spell.w${i} core.word text="${x}"`);
    if (lines.length) w.tell(lines.join('\n'));
    pools.set(words, w);
  }
  return w;
}

/**
 * @param text    the message as typed
 * @param ctx     { ro: the opened w.lang.ro (src/lang/ro.mjs), vocab: Map<folded, forms[]> of the translator's pack (`rules.sourceVocabulary`), isEnglish(word) -> bool,
 *                  open: Set of English words of the open tab's live world, others: [Set of English words] of the other live worlds, names: [strings] the things on the screen are called,
 *                  recent: [strings] the person's recent source-language messages, protect: [words never changed] }
 * @returns { text, changes: [{ from, to, source, cost }], asks: [{ from, candidates }] }
 */
export function repairInContext(text, ctx) {
  const src = String(text ?? '');
  const { ro, vocab } = ctx;
  const lib = ro?.lib;
  if (!lib?.repairWords || !vocab?.size) return { text: src, changes: [], asks: [] };
  const parts = src.match(WORD) ?? [];
  const words = parts.filter((p) => /^[\p{L}]/u.test(p) && !/^[„«"]/.test(p));
  const isEnglish = ctx.isEnglish ?? (() => false);
  // never repaired: what the language knows (dictionary, morphology), what is English, the names of the things on the screen, the host's own protected words
  const protect = new Set((ctx.protect ?? []).map((w) => String(w).toLowerCase()));
  for (const n of ctx.names ?? []) for (const w of String(n).toLowerCase().match(/[\p{L}]+/gu) ?? []) protect.add(w);
  const dict = dictionaryOf(vocab);
  for (const w of words) {
    const l = w.toLowerCase(), k = fold(l);
    if (dict.has(l) || dict.has(k) || ro.knows(l) || isEnglish(k)) protect.add(l);
  }
  // the words of the dialogue: what the person typed lately that the language knows (a typo typed twice is not a word of the dialogue)
  const recent = [];
  for (const t of ctx.recent ?? []) for (const w of String(t).toLowerCase().match(/[\p{L}]+/gu) ?? []) if (w.length >= 3 && (dict.has(w) || ro.knows(w))) recent.push(w);
  const open = new Set([...ro.formsOfEnglish(ctx.open ?? new Set())]);
  for (const n of ctx.names ?? []) for (const w of String(n).toLowerCase().match(/[\p{L}]+/gu) ?? []) open.add(w);
  const others = new Set();
  for (const s of ctx.others ?? []) for (const f of ro.formsOfEnglish(s)) others.add(f);
  const worlds = others.size ? [poolWorld(lib, others)] : [];
  // the dictionary pool is the surface forms as written (the folded spelling of a form is the same word, not a second candidate)
  const surface = surfaceOf(vocab, dict);
  const r = lib.repairWords(words, { lang: 'w.lang.ro', worlds, lexicon: open, dialogue: { words: recent }, dictionary: surface, protect });
  // candidates that are forms of one lemma are one word (iarba / iarbă, the same noun in two cases): the nearest of them is the unique best
  const asks = [];
  for (const a of r.asks) {
    const near = a.candidates.filter((c) => c.cost <= a.candidates[0].cost + (lib.SPELL?.margin ?? 0.25) + 0.3);   // the ones that tied with the best (the ask lists up to three)
    const sets = near.map((c) => ro.lemmasOf(c.word));
    const common = sets[0] ? [...sets[0]].filter((l) => sets.every((x) => x.has(l))) : [];
    if (common.length) { const c = a.candidates[0]; r.repairs.push({ from: a.from, to: c.word, source: c.source, cost: c.cost, at: a.at }); r.tokens[a.at] = c.word; } else asks.push(a);
  }
  r.asks = asks;
  // a word only the dictionary offers (no word of the live worlds, nothing said before) is repaired only for a slip as small as one neighbouring key, a swap or an accent: a loanword or a
  // name typed in lower case is not a typo of a dictionary word two edits away ("voila"); what is kept is recorded as an ask
  const farDictionary = r.repairs.filter((x) => x.source === 'dictionary' && x.cost > DICTIONARY_MAX_COST);
  if (farDictionary.length) {
    r.repairs = r.repairs.filter((x) => !farDictionary.includes(x));
    for (const x of farDictionary) { r.tokens[x.at] = x.from; r.asks.push({ from: x.from, at: x.at, candidates: [{ word: x.to, source: x.source, cost: x.cost }] }); }
  }
  const byAt = new Map(r.repairs.map((x) => [x.at, x]));
  let at = -1;
  const out = parts.map((p) => {
    if (!/^[\p{L}]/u.test(p) || /^[„«"]/.test(p)) return p;
    at++;
    const x = byAt.get(at);
    return x ? r.tokens[at] : p;
  }).join('');
  return { text: out, changes: r.repairs.map((x) => ({ from: x.from, to: x.to, source: x.source, cost: x.cost, kind: 'context' })), asks: r.asks.map((a) => ({ from: a.from, candidates: a.candidates })) };
}
