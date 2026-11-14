/**
 * Best effort with loose words (spec 03 section 7.15). Browser-safe, no dependencies beyond the formalizer helpers.
 *
 * When a piece of text ("square eyes robot pls", "paris map", "red house big") was read by nobody, candidate sentences are built from the
 * pattern examples of the candidate worlds: the example's slot values (lexicon words, numbers, free text) are replaced by the values the
 * input contains, and the candidate is scored by how much of the input it uses. The candidate is only a TEXT: the host runs it through the
 * rules (the only formalizer) and the value checker. No value is ever invented: an example value that the input does not supply makes the
 * candidate invalid.
 *
 *   const cands = looseCandidates(set, 'square eyes robot pls', { worlds: ['ui.avatar'], tabWorld: 'ui.avatar' });
 *   // [{ world: 'ui.avatar', patternId, text: 'make your eyes square', score, coverage, used, ignored: ['robot'] }, ...]
 */
import { lexIndex } from '../worlds/lexicon.mjs?v=600b265b94';
import { isNumberWord } from './rules/numbers.mjs?v=e4898df942';
import { FUNCTION_WORDS, ABBREVIATIONS, worldVocabulary } from './spell.mjs?v=1be0fa53f9';
import { budget } from '../dialog/budget.mjs?v=00bce6e369';

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const SLOT_RE = /\{[A-Za-z_0-9]+:([A-Za-z_.0-9]+)\}/g;
const FILLERS = new Set([...Object.keys(ABBREVIATIONS), ...'pls plz please thanks thx lol haha yo hmm um uh ok okay yeah so well like just'.split(' ')]);
/** Function words minus the ones that carry meaning in loose words (big, small, left, not, make, show ...): those count as content. */
const KEEP = new Set(('now new old big small good bad out off down up left right one two more most less much many few not no never always all any some each every other another again still '
  + 'over under after before make get show tell give take put set see let like want need can what where who how which when why whose').split(' '));
const STOP = new Set([...FUNCTION_WORDS].filter((w) => !KEEP.has(w)));
const isStop = (w) => STOP.has(w) || FILLERS.has(w);
const isNum = (w) => /^\d+(?:[.,]\d+)?$/.test(w) || isNumberWord(w);

export const BEST_EFFORT_POLICY = Object.freeze({
  minUsed: 2,            // at least this many content words of the input must be used by the candidate
  minCoverage: 0.6,      // share of the input's content words the candidate uses
  maxFrameMissing: 1,    // content words of the example's frame that the input does not contain (borrowed from the example)
  margin: 0.25,          // the best verified candidate must beat a different verified one by this much, else "Did you mean"
  maxVerify: 6,          // candidates run through the rules
  frameMissingPenalty: 0.8,
  worldBonus: 0.4,       // active tab world
  minWordCoverage: 0.5,  // GAPS-1: from this many words on (minWordsForCoverage) the candidate must contain this share of ALL the input's words (stop words too): "would you say you are happy" is not "happy say"
  minWordsForCoverage: 5,
});

/** Words of a text with their surface form and offsets; multi-word lexicon entries ("polar bear") are merged. */
function tokenize(text, multi) {
  const raw = [...String(text).matchAll(WORD_RE)].map((m) => ({ surface: m[0], w: m[0].toLowerCase().replace(/’/g, "'"), start: m.index }));
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    budget.tick('best-effort.tokenize');
    let merged = false;
    for (let n = 3; n >= 2 && !merged; n--) {
      if (i + n > raw.length || !multi) continue;
      const joined = raw.slice(i, i + n).map((x) => x.w).join('_');
      if (multi.has(joined)) { out.push({ surface: raw.slice(i, i + n).map((x) => x.surface).join(' '), w: joined, start: raw[i].start }); i += n - 1; merged = true; }
    }
    if (!merged) out.push(raw[i]);
  }
  return out;
}

/** Per world (with its imports), memoized: word -> lexicon ids, the set of multi-word entries. */
function worldLex(set, worldId) {
  return set.memo(`best-effort:lex:${worldId}`, () => {
    const lx = lexIndex(set);
    const ids = new Set(set.available ? set.available(worldId) : [worldId]);
    const byWord = new Map(), multi = new Set();
    for (const l of lx.lexicons.values()) {
      if (!ids.has(l.worldId)) continue;
      for (const w of l.words) {
        const add = (x) => { (byWord.get(x) ?? byWord.set(x, new Set()).get(x)).add(l.id); };
        add(w); if (w.includes('_')) multi.add(w);
        const pl = lx.plurals.get(w); if (pl) add(pl);
      }
    }
    for (const [sg, pl] of lx.plurals) if (byWord.has(sg)) { (byWord.get(pl) ?? byWord.set(pl, new Set()).get(pl)); for (const id of byWord.get(sg)) byWord.get(pl).add(id); }
    return { byWord, multi, lemma: lx.lemma };
  });
}

/** The lexicon ids a word belongs to (plurals and lemma tried). */
function lexIdsOf(wl, w) {
  return wl.byWord.get(w) ?? wl.byWord.get(wl.lemma(w)) ?? null;
}

/** Classified example tokens of one pattern example (memoized per example). */
function exampleOf(set, world, p, example) {
  return set.memo(`best-effort:ex:${p.id}:${example}`, () => {
    const wl = worldLex(set, world.id);
    const lx = lexIndex(set);
    const slotLex = new Set(), freeSlot = /\{[A-Za-z_0-9]+:(?:noun|agent|words|rest|word)\}/.test(p.match ?? '');
    const hasNumber = /\{[A-Za-z_0-9]+:number\}/.test(p.match ?? '');
    for (const m of (p.match ?? '').matchAll(SLOT_RE)) if (m[1].startsWith('lex.')) slotLex.add(m[1]);
    const lits = new Set();
    for (const w of (p.match ?? '').replace(/\{[^}]*\}/g, ' ').toLowerCase().match(/[a-z0-9'_]+/g) ?? []) {
      for (const part of w.split('_')) lits.add(part);
      const ph = lx.phrases.get(w);
      if (ph) for (const alt of ph.alts) for (const a of alt) lits.add(a);
    }
    const toks = tokenize(example, wl.multi).map((t) => {
      const ids = lexIdsOf(wl, t.w);
      const mine = ids ? [...ids].filter((id) => slotLex.has(id)) : [];
      if (mine.length) return { w: t.w, k: 'lex', ids: mine };
      if (hasNumber && isNum(t.w)) return { w: t.w, k: 'num' };
      if (lits.has(t.w) || STOP.has(t.w)) return { w: t.w, k: 'frame' };
      if (freeSlot) return { w: t.w, k: 'free' };
      return { w: t.w, k: 'frame' };
    });
    return { toks, frameContent: toks.filter((t) => t.k === 'frame' && !isStop(t.w)).map((t) => t.w) };
  });
}

/**
 * Candidate sentences for `text`, best first. `worlds` are the candidate world ids in priority order (the active tab's world first);
 * `tabWorld` gets a bonus. Returns [] when the input has fewer than `minUsed` content words.
 */
export function looseCandidates(set, text, { worlds, tabWorld = null, policy = {} } = {}) {
  const P = { ...BEST_EFFORT_POLICY, ...policy };
  const out = [];
  const seen = new Set();
  worlds.forEach((worldId, rank) => {
    const world = set.get(worldId);
    if (!world || seen.has(worldId)) return;
    seen.add(worldId);
    const wl = worldLex(set, worldId);
    const input = tokenize(text, wl.multi);
    const content = input.filter((t) => !isStop(t.w));
    if (content.length < P.minUsed) return;
    // words that name the place of the request (the tab or the world itself) may be ignored: "square eyes robot", "paris map"
    const topic = new Set([...worldId.split('.'), world.tab?.id, ...String(world.title ?? '').toLowerCase().split(/\W+/), 'robot', 'avatar']);
    const sentenceish = input.filter((t) => FUNCTION_WORDS.has(t.w) && !FILLERS.has(t.w)).length >= 2;
    for (const p of world.patterns ?? []) {
      if (!p.examples?.length) continue;
      for (const example of p.examples.slice(0, 3)) {
        const ex = exampleOf(set, world, p, example);
        const used = new Set();
        const subst = new Array(ex.toks.length).fill(null);
        let ok = true;
        // pass 1: values the input has verbatim (or as the same lemma), then frame words the input contains
        const claim = (pred) => { for (let i = 0; i < input.length; i++) if (!used.has(i) && pred(input[i])) return i; return -1; };
        ex.toks.forEach((t, k) => {
          if (t.k === 'frame') { const i = claim((x) => x.w === t.w); if (i >= 0) used.add(i); return; }
          if (t.k === 'free') return;
          const i = claim((x) => x.w === t.w || wl.lemma(x.w) === wl.lemma(t.w));
          if (i >= 0) { used.add(i); subst[k] = input[i].surface; }
        });
        // pass 2: values of the same lexicon (or numbers) the input has instead; free slots take unclaimed unknown words
        ex.toks.forEach((t, k) => {
          if (!ok || subst[k] != null || t.k === 'frame') return;
          let i = -1;
          if (t.k === 'lex') i = claim((x) => { const ids = lexIdsOf(wl, x.w); return !!ids && t.ids.some((id) => ids.has(id)); });
          else if (t.k === 'num') i = claim((x) => isNum(x.w));
          else if (t.k === 'free') i = claim((x) => !FUNCTION_WORDS.has(x.w) && !isStop(x.w) && !lexIdsOf(wl, x.w) && !isNum(x.w));
          if (i < 0) { ok = false; return; }
          used.add(i); subst[k] = input[i].surface;
        });
        if (!ok) continue;
        const usedContent = [...used].filter((i) => !isStop(input[i].w)).length;
        const coverage = usedContent / content.length;
        const missing = ex.frameContent.filter((w) => !input.some((x) => x.w === w)).length;
        const known = [...used].filter((i) => !isStop(input[i].w) && (isNum(input[i].w) || lexIdsOf(wl, input[i].w) || ex.toks.some((t) => t.k === 'frame' && t.w === input[i].w))).length;
        if (known < 1) continue;   // free text alone is no evidence: a word of the world (or a number) must anchor the candidate
        if (usedContent < P.minUsed || coverage < P.minCoverage || missing > P.maxFrameMissing) continue;
        if (missing && usedContent < content.length) continue;   // borrowing a word from the example AND ignoring one of the user's is a guess too far
        const ignoredAny = usedContent < content.length;
        const vocab = worldVocabulary(set, worldId);
        const lost = input.filter((t, i) => !used.has(i) && !isStop(t.w) && !topic.has(t.w) && (isNum(t.w) || lexIdsOf(wl, t.w) || vocab.has(t.w) || vocab.has(wl.lemma(t.w))));
        if (lost.length) continue;   // a word the world knows is never dropped: ignoring it would change the meaning
        if (ignoredAny && sentenceish) continue;   // a sentence that merely contains an unknown word is not loose words: do not guess around it
        const candText = ex.toks.map((t, k) => (subst[k] ?? t.w).replace(/_/g, ' ')).join(' ');
        if (input.length >= P.minWordsForCoverage) {   // GAPS-1 guard: a reading that ignores most of the sentence is worse than "not understood"
          const candWords = new Set(candText.toLowerCase().split(/\s+/));
          if (input.filter((t) => candWords.has(t.w)).length / input.length < P.minWordCoverage) continue;
        }
        const ignored = input.filter((t, i) => !used.has(i) && !isStop(t.w)).map((t) => t.surface);
        const score = coverage * 10 + usedContent * 0.5 - missing * P.frameMissingPenalty + (worldId === tabWorld ? P.worldBonus : 0) - rank * 0.05 + (p.priority ?? 0) * 0.005;
        out.push({ world: worldId, patternId: p.id, kind: p.kind, example, text: candText, score, coverage, used: usedContent, ignored, missing });
      }
    }
  });
  const best = new Map();   // one candidate per distinct text
  for (const c of out.sort((a, b) => b.score - a.score)) if (!best.has(c.text.toLowerCase())) best.set(c.text.toLowerCase(), c);
  return [...best.values()];
}
