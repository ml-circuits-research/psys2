// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Rule-based formalizer (spec 03). Browser-safe.
 *
 * formalize(text, { worlds, session, source }) -> { segments, wires }
 * `worlds` is a WorldSet; `session` is a FormSession or any object with a `.form` FormSession.
 */
import { guard } from '../guard.mjs?v=eb1a66f556';
import { perf } from '../perf.mjs?v=b75de4ae38';
import { lexIndex } from '../../worlds/lexicon.mjs?v=e3316469a7';
import { analyze, tokenize, QUESTION_WORDS, correctTokens, isOldFiller, editDistance } from './normalize.mjs?v=f77a3f29d4';
import { compilePattern, matchTokens, wordBag, prefilterPasses, prefilterNeeds, BUILTIN_CLASSES, PatternError } from './matcher.mjs?v=5d08e7cc46';
import { buildWires, substituteEmit, dummySlots, SEGMENT_SLOT } from './emit.mjs?v=07dd1fe4f2';
import { routeScores } from './router.mjs?v=1627316289';
import { createRouter, wildTokens, contextFromFocus, normalizeContext, defaultRouter, isGameControl, gameControlAction, namingTables } from '../routing.mjs?v=34ef60e7bf';
import { FormSession, STOP_WORDS, isPronoun } from './session.mjs?v=e445741b59';
import { selfCorrect, sharedArgument, repetition, ellipsisPrefixes, oneAnaphora, joinText, MARKER_RE, SEP_RE } from './expand.mjs?v=f95c81083f';
import { parse, serialize } from '../../soplang/index.mjs?v=26885599a7';
import { budget } from '../../dialog/budget.mjs?v=123c3e1329';
import { readingVariants, dropStyleIn } from './variants.mjs?v=058ecdb0c1';

export { FormSession } from './session.mjs?v=e445741b59';
export { createRouter, createPriorityRouter, emptyContext } from '../routing.mjs?v=34ef60e7bf';
export { analyze, splitSentences, tokenize, editDistance, correctTokens, SHORT_TYPOS } from './normalize.mjs?v=f77a3f29d4';
export { compilePattern, matchTokens } from './matcher.mjs?v=5d08e7cc46';
export { singularLemma, pluralize } from './lemma.mjs?v=3f5920ed63';

const compiledCache = new WeakMap();
/** Compile (memoized) a pattern object; returns { compiled } or { error }. */
function compiled(p, set) {
  if (!compiledCache.has(p)) {
    try { compiledCache.set(p, { compiled: perf.timeSync('init.compilePattern', () => compilePattern(p.match, lexIndex(set).phrases)) }); } catch (e) { compiledCache.set(p, { error: e.message }); }
  }
  return compiledCache.get(p);
}

const macroIdsOf = (c) => [...new Set(c.elements.flatMap((e) => e.macros ?? []))];

/**
 * Static check of one pattern: syntax, slot classes, emit placeholders, emit parses.
 * @returns {string[]} problems
 */
export function checkPattern(p, set) {
  const lex = lexIndex(set);
  const problems = [];
  if (!p.match) return [`${p.id}: no match string`];
  if (!p.emit) return [`${p.id}: no emit template`];
  let c;
  try { c = compilePattern(p.match, lex.phrases); } catch (e) { return [`${p.id}: ${e.message}`]; }
  for (const id of macroIdsOf(c)) {
    const ph = lex.phrases.get(id);
    if (ph && p.worldId && set.get(p.worldId) && !set.available(p.worldId).includes(ph.worldId)) problems.push(`${p.id}: phrase '$${id}' belongs to world '${ph.worldId}', which '${p.worldId}' does not import`);
  }
  for (const [name, def] of c.slots) {
    if (!BUILTIN_CLASSES.has(def.cls) && !lex.lexicons.has(def.cls)) problems.push(`${p.id}: slot '${name}' has unknown class '${def.cls}'`);
    if (def.cls === 'recent' && !lex.lexicons.has(def.args[0])) problems.push(`${p.id}: slot '${name}' refers to unknown lexicon '${def.args[0]}'`);
  }
  for (const [, name] of p.emit.matchAll(/\{([A-Za-z_]\w*)(?:\|\w+)?\}/g)) {
    if (!c.slots.has(name) && !/^_\d*$/.test(name) && name !== SEGMENT_SLOT) problems.push(`${p.id}: emit uses '{${name}}' but the match has no such slot`);
  }
  if (!['statement', 'question', 'request', 'chat'].includes(p.kind)) problems.push(`${p.id}: unknown kind '${p.kind}'`);
  try {
    const slots = { ...dummySlots(c.slots), [SEGMENT_SLOT]: { value: 'x', text: 'x' } };
    let n = 0;
    const sop = substituteEmit(p.emit, slots, () => 'x' + ++n);
    const { errors } = parse(sop, { source: p.id });
    for (const e of errors) problems.push(`${p.id}: emit is not valid SOP Lang: ${e.message}`);
  } catch (e) { problems.push(`${p.id}: ${e.message}`); }
  return problems;
}

const patternById = (set) => set.memo('patternById', () => new Map(allPatterns(set).map(({ p }) => [p.id, p])));
function allPatterns(set) {
  return set.memo('patterns', () => set.list().flatMap((w) => w.patterns).map((p, order) => ({ p, order })));
}

/**
 * Inverted index of the compiled patterns by the words of their smallest mandatory-literal set (COMPUTE-BUDGET C): a pattern can only match a
 * sentence whose bag holds one of those words, so only the postings of the bag's words (plus the patterns without any mandatory literal) are
 * candidates, in pattern order. The same result as running the prefilter on every pattern, without visiting thousands of them per sentence.
 */
function patternIndex(set) {
  return set.memo('patternIndex', () => {
    const always = [], byWord = new Map();
    const recs = [];
    const freq = new Map();   // in how many patterns' mandatory sets a word occurs: a pattern is indexed under its rarest set
    for (const { p, order } of allPatterns(set)) {
      const cc = compiled(p, set).compiled;
      if (!cc) continue;
      const needs = prefilterNeeds(cc);
      recs.push({ p, order, c: cc, needs });
      const seen = new Set();
      for (const n of needs) for (const w of n) if (!seen.has(w)) { seen.add(w); freq.set(w, (freq.get(w) ?? 0) + 1); }
    }
    for (const rec of recs) {
      if (!rec.needs.length) { always.push(rec); continue; }
      let best = null, bestCost = Infinity;
      for (const n of rec.needs) { let cost = 0; for (const w of n) cost += freq.get(w) ?? 0; if (cost < bestCost) { bestCost = cost; best = n; } }
      for (const w of best) { let l = byWord.get(w); if (!l) byWord.set(w, (l = [])); l.push(rec); }
    }
    return {
      candidates(bag) {
        const seen = new Set(always), out = [...always];
        for (const w of bag) { const l = byWord.get(w); if (l) for (const r of l) if (!seen.has(r)) { seen.add(r); out.push(r); } }
        return out.sort((a, b) => a.order - b.order);
      },
    };
  });
}

/**
 * Compiles every pattern and builds the typo vocabulary ahead of the first message, in slices: after `budgetMs` of work it awaits `yieldFn`
 * (default a macrotask), so a page stays responsive while this runs (PERF round 2). The same memoized state the first `formalize` would
 * build lazily, so readings do not change. Returns the number of patterns compiled.
 */
export async function precompile(set, { budgetMs = 10, yieldFn = () => new Promise((r) => setTimeout(r, 0)) } = {}) {
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  lexIndex(set);
  let t = clock(), n = 0;
  for (const { p } of allPatterns(set)) {
    const c = compiled(p, set).compiled; if (c) prefilterNeeds(c); n++;   // the prefilter sets are built now too, not by the first message
    if (clock() - t > budgetMs) { await yieldFn(); t = clock(); }
  }
  await yieldFn();
  patternIndex(set);
  await yieldFn();
  vocabularyOf(set);
  return n;
}

/**
 * Every word the loaded worlds know: literals of all patterns (and alternatives) and the words of all lexicons
 * (multi-word entries split into words), with plural forms. Used for typo correction (spec 03 section 1b).
 */
export function vocabularyOf(set) {
  return set.memo('vocabulary', () => {
    const vocab = new Set();
    const freq = new Map();   // how often each word occurs in the patterns and lexicons: the last tie-break of typo correction
    vocab.freq = freq;
    const add = (w) => { if (w) { const l = w.toLowerCase(); freq.set(l, (freq.get(l) ?? 0) + 1); } };   // the vocabulary Set is filled from `freq` at the end (same words, same insertion order, one Set operation per distinct word instead of per occurrence)
    const lex = lexIndex(set);
    const usedPhrases = new Set();
    // PERF round 2: the joined keys of a macro's alternatives are built once per macro (not once per pattern that uses it: 350 alternatives x 300 patterns)
    const EMPTY_SET = new Set(), altKeys = new WeakMap(), macroKeyCache = new Map(); let unioned = false;
    const altKey = (a) => { let k = altKeys.get(a); if (k === undefined) { k = a.join('_'); altKeys.set(a, k); } return k; };
    const macroKeys = (id) => { let k = macroKeyCache.get(id); if (!k) { k = new Set((lex.phrases.get(id)?.alts ?? []).map(altKey)); macroKeyCache.set(id, k); } return k; };
    for (const { p } of allPatterns(set)) {
      const c = compiled(p, set).compiled;
      if (!c) continue;
      for (const el of c.elements) {
        if (el.t === 'lit') el.words.forEach(add);
        else if (el.t === 'alt') {
          // the words of a phrase macro count ONCE per phrase (below), not once per pattern that uses it: a 350-alternative lead-in used by 300
          // patterns would otherwise make every word in it (try, sry ...) look 300 times as frequent as the world's own nouns (typo tie-breaks)
          let inMacro = EMPTY_SET;
          for (const id of el.macros ?? []) {
            usedPhrases.add(id);
            const keys = macroKeys(id);
            if (inMacro === EMPTY_SET) inMacro = keys; else { if (inMacro === keys) continue; if (!unioned) { inMacro = new Set(inMacro); unioned = true; } for (const k of keys) inMacro.add(k); }
          }
          unioned = false;
          let fromMacros = 0;
          for (const id of el.macros ?? []) fromMacros += lex.phrases.get(id)?.alts.length ?? 0;
          if (el.alts.length === fromMacros && fromMacros > 0) continue;   // every alternative came from a macro (counted once below): no inline literals to add (PERF round 3: skips 1.2M key lookups)
          if (inMacro === EMPTY_SET) { for (const alt of el.alts) alt.forEach(add); continue; }
          for (const alt of el.alts) if (!inMacro.has(altKey(alt))) alt.forEach(add);
        }
      }
    }
    for (const id of usedPhrases) for (const alt of lex.phrases.get(id)?.alts ?? []) alt.forEach(add);
    for (const l of lex.lexicons.values()) for (const w of l.words) for (const part of w.split('_')) add(part);
    for (const [s, pl] of lex.plurals) { add(s); add(pl); }
    for (const w of freq.keys()) vocab.add(w);
    return vocab;
  });
}

/** Every word of every lexicon of `set` (entries split into words, plurals included): the content nouns that spelling must not turn into another world's word. Memoized. */
export function lexiconWordsOf(set) {
  return set.memo('lexicon-words', () => {
    const out = new Set(), lex = lexIndex(set);
    for (const l of lex.lexicons.values()) for (const w of l.words) for (const part of w.split('_')) out.add(part.toLowerCase());
    for (const [sg, pl] of lex.plurals) { out.add(sg); out.add(pl); }
    return out;
  });
}

/** Vocabulary of one world with its imports (memoized): the preferred typo targets of a context that already has an active world. */
export function worldVocabularyOf(set, id) {
  return set.memo(`rules-vocabulary:${id}`, () => {
    if (!set.get(id)) return new Set();
    const ids = set.available(id);
    const sub = Object.create(set);
    sub._cache = new Map();
    sub.list = () => ids.map((i) => set.get(i));
    return vocabularyOf(sub);
  });
}

/** Indirect-question lead-ins ("tell me", "I wonder", "do you know" ...), longest first; stripped before a wh or yes/no question. */
const LEAD_INS = [
  'can you tell me', 'could you tell me', 'would you tell me', 'will you tell me', 'can you let me know', 'could you let me know',
  'i would like to know', 'i want to know', 'i need to know', 'i wanna know', 'id like to know', 'i am wondering', 'i was wondering',
  'i wonder', 'do you know', 'let me know', 'tell me', 'you know',
].map((x) => x.split(' ')).sort((a, b) => b.length - a.length);
const WH_WORDS = ['how', 'what', 'who', 'where', 'when', 'which', 'why', 'whose', 'whom'];

/**
 * When `tokens` start with an indirect-question lead-in ("tell me", "can you tell me", "I want to know", "do you know" ...) followed by a
 * wh-question or a yes/no question, the tokens of the bare question (an optional `if`/`whether` skipped), else null (spec 03 section 4.2a).
 */
export function stripLeadIn(tokens) {
  const nf = tokens.filter((t) => !t.filler && t.kind !== 'punct');
  const words = nf.map((t) => t.lower);
  for (const lead of LEAD_INS) {
    if (lead.some((w, i) => words[i] !== w)) continue;
    let k = lead.length;
    if (words[k] === 'if' || words[k] === 'whether') k++;
    const rest = nf.slice(k);
    const w = rest[0]?.lower;
    if (!w || rest.filter((t) => t.kind !== 'qmark').length < 2) continue;
    if (QUESTION_WORDS.has(w) || WH_WORDS.includes(w) || (w.length >= 4 && WH_WORDS.some((x) => editDistance(w, x, 1) <= 1))) return rest;
  }
  return null;
}

/** Split `leos marbles` into `leo 's marbles` when the stem is a known name and the word itself is not (possessive without apostrophe). */
export function splitPossessives(tokens, lex) {
  const out = [];
  tokens.forEach((t, i) => {
    const next = tokens[i + 1];
    if (t.kind === 'word' && /^[a-z]{3,}s$/.test(t.lower) && next && (next.kind === 'word' || next.kind === 'number') && !next.filler
      && !lex.names.has(t.lower) && lex.names.has(t.lower.slice(0, -1))) {
      out.push({ ...t, raw: t.raw.slice(0, -1), lower: t.lower.slice(0, -1), end: t.end - 1 }, { raw: "'s", lower: "'s", start: t.end - 1, end: t.end, kind: 'word' });
    } else out.push(t);
  });
  return out;
}

/** A connective followed by a question word inside swallowed free text. */
const QUESTION_TAIL_RE = /(?:,|\b(?:and|then|but))\s+(?:also\s+)?(?:what|how|who|where|when|which|why|can|could|does|do|is|are|will)\b/i;

const isContent = (t) => t.kind !== 'punct' && t.kind !== 'qmark' && !t.filler;

/** Split a token list into clauses at `,`, `and`, `then`, `but` (one level). Clauses with only fillers are dropped. */
export function splitClauses(tokens) {
  const clauses = [[]];
  for (let i = 0; i < tokens.length; i++) {
    budget.tick('index.splitClauses');
    const t = tokens[i];
    const sep = t.lower === ',' || t.lower === 'and' || t.lower === 'then' || t.lower === 'but';
    if (!sep) { clauses[clauses.length - 1].push(t); continue; }
    if (t.lower === 'and' && tokens[i + 1]?.lower === 'then') i++;
    if (t.lower === ',' && ['and', 'but', 'then'].includes(tokens[i + 1]?.lower)) i++;
    clauses.push([]);
  }
  return clauses.filter((c) => c.some(isContent));
}

/** Build the match environment for one text. */
export function makeEnv(text, set, form, lex) {
  const env = { text, lex, touched: 0, matchMemo: { keys: new WeakMap(), byPattern: new Map() } };
  const resolveAgent = (tokens, i) => {
    env.touched++;
    const t = tokens[i];
    if (t.kind !== 'word') return null;
    if (isPronoun(t.lower)) return form.resolvePronoun(t.lower);
    if (t.lower === "'s") return null;
    if (lex.names.has(t.lower)) return form.candidateForName(t.raw, lex.names.get(t.lower));
    const cap = /^[A-ZÀ-Þ]/.test(t.raw);
    if (!cap || STOP_WORDS.has(t.lower) || QUESTION_WORDS.has(t.lower)) return null;
    for (const l of lex.lexicons.values()) {
      if (l.class !== 'name' && (l.words.has(t.lower) || l.words.has(lex.lemma(t.lower)))) return null;
    }
    return form.candidateForName(t.raw, undefined);
  };
  return Object.assign(env, { resolveAgent, lastAgent: () => { env.touched++; return form.resolvePronoun('they'); }, recentItem: (lexId, agentId) => { env.touched++; return form.recentItem(lexId, agentId); } });
}

/**
 * GAPS-1b: policy for a complete pattern read that covers only a small share of a long input. A free-text slot (`words`, `rest`)
 * swallows what it does not understand: "I want a ball and a pencil and pay with 20 lei. What is the change" is a drawing request
 * whose `{w:rest}` took the payment and the question. From `minWords` tokens on, a match whose fixed part (everything outside the
 * free-text slots) is below `minCoverage` of the tokens loses to a match of ANOTHER world whose fixed part covers at least `betterCoverage` (a competitor that is itself mostly free text, as in "Move the balloon to the bottom left corner", never overrules the context); with
 * `dropWhenAlone` it is dropped even when nothing else reads the input (default off: long legitimate drawing requests have a
 * long `with a red roof and ...` tail).
 */
export const PATTERN_COVERAGE_POLICY = { minWords: 8, minCoverage: 0.35, betterCoverage: 0.6, dropWhenAlone: false };

const fixedCoverage = (m, total) => {
  if (!total) return 1;
  let free = 0;
  for (const sl of Object.values(m.slots)) if ((sl.class === 'words' || sl.class === 'rest') && sl.tokens) free += sl.tokens[1] - sl.tokens[0];
  return Math.max(0, 1 - free / total);
};

/** Drop the low-coverage matches of a long input (see PATTERN_COVERAGE_POLICY); returns the kept matches. */
export function applyCoveragePolicy(matches, total, policy = PATTERN_COVERAGE_POLICY) {
  if (!policy || total < policy.minWords || !matches.length) return matches;
  const cov = new Map(matches.map((m) => [m, fixedCoverage(m, total)]));
  const low = matches.filter((m) => cov.get(m) < policy.minCoverage);
  if (!low.length) return matches;
  const good = matches.filter((m) => cov.get(m) >= (policy.betterCoverage ?? policy.minCoverage));
  if (!good.length) return policy.dropWhenAlone ? [] : matches;
  // the low readings lose only to a better-covering reading of another world
  return matches.filter((m) => !low.includes(m) || good.every((g) => g.pattern.worldId === m.pattern.worldId));
}

/** True when a match (a ranked match or a segment's `match`) has a free-text target that starts with your / yours / ur / yourself: it addresses the avatar. */
export const youTarget = (m) => Object.values(m.slots ?? {}).some((s) => (s.class === 'words' || s.class === 'word') && /^(?:your|yours|ur|yourself)$/i.test(String(s.text).split(/\s+/)[0]) && !/\b(?:and|then|but|plus)\b|,/i.test(String(s.text)));   // a coordination ("your eyes and body") is left to the expansion

/** Ranked full matches of every pattern against `tokens` (commas removed), ordered by the routing policy. */
function rankMatches(tokens, isQuestion, set, env, lex, context, router) {
  // Views of the tokens, tried in order until one of them is matched by some pattern (spec 03 section 1.5):
  //  1. compat: the original fillers (ok, please, well, um) and a leading so/and/then dropped, the newer ones (hey, pls, thx ...) kept as words;
  //  2. every filler dropped;
  //  3. every filler in place, for the patterns that list a filler themselves (`then E F`, `ok`).
  // A sentence an older reading understood is therefore read exactly as before.
  const all = tokens.filter((t) => t.kind !== 'punct');
  // in the compat view the newer fillers are ordinary words again (a slot may capture them, as before)
  const compat = all.filter((t) => !(t.filler && (t.lead || isOldFiller(t.lower)))).map((t) => (t.filler ? { ...t, filler: false } : t));
  const noFill = all.filter((t) => !t.filler);
  const hasContent = (v) => v.some((t) => t.kind !== 'qmark');
  const views = [compat];
  if (noFill.length !== compat.length && hasContent(noFill)) views.push(noFill);
  const matches = [];
  let toks = compat.filter((t) => t.kind !== 'qmark');
  for (let v = 0; v <= views.length && !matches.length; v++) {
    const last = v === views.length;
    if (last && all.length === noFill.length) break;
    const view = last ? all : views[v];
    if (!hasContent(view)) continue;
    const noPct = view.some((t) => t.pct) ? view.filter((t) => !t.pct) : null;
    toks = view.filter((t) => t.kind !== 'qmark');
    const bag = wordBag(view), bagNoPct = noPct ? wordBag(noPct) : null;
    const index = patternIndex(set);
    for (const { p, order, c } of index.candidates(noPct ? new Set([...bag, ...bagNoPct]) : bag)) {
      budget.tick('rules.pattern');
      if (isQuestion && p.kind === 'statement') continue;
      if (p.tabOnly && p.worldId !== context?.tabWorld) continue;   // the router drops it anyway; a match of it must not stop the later views ("can you" dropped) from being tried
      if (last && !c.usesFiller) continue;
      let m = prefilterPasses(c, bag) ? matchTokens(c, view, env) : null;
      if (!m && noPct && prefilterPasses(c, bagNoPct)) m = matchTokens(c, noPct, env);
      if (m) matches.push({ pattern: p, order, ...m });
    }
  }
  // "Your" addresses the avatar (COMPUTE-BUDGET C): a free-text target that starts with your / yours / ur / yourself ("make your eyes blue") is the avatar's, never a drawing
  // object's, whenever ui.avatar reads the sentence too; the other worlds' readings of that target are dropped before routing.
  if (matches.length > 1 && matches.some((m) => m.pattern.worldId === 'ui.avatar')) {
    if (matches.some((m) => m.pattern.worldId !== 'ui.avatar' && youTarget(m))) {
      const keep = matches.filter((m) => m.pattern.worldId === 'ui.avatar' || !youTarget(m));
      matches.splice(0, matches.length, ...keep);
    }
  }
  // DECLINE (spec 21): a world may export `accepts({ action, roles, text, state })`; when it returns false the world does not own this reading ("draw a house" is not a face part),
  // so its match is dropped before routing and the next world reads the message. Pure, and every pass ticks the budget; it only looks at the words of the roles.
  for (let k = matches.length - 1; k >= 0; k--) {
    budget.tick('rules.accepts');
    const m = matches[k], acc = set.get(m.pattern.worldId)?.ops?.accepts;
    if (typeof acc !== 'function') continue;
    const roles = Object.fromEntries(Object.entries(m.slots ?? {}).map(([n, sl]) => [n, sl.text]));
    for (const lit of String(m.pattern.emit ?? '').matchAll(/ arg\.(\w+)=\\?"([^"{}\\]*)\\?"/g)) if (!(lit[1] in roles) && lit[1] !== 'mode') roles[lit[1]] = lit[2];   // the literal roles of a form (arg.attribute="name")
    let ok = true, strong = false;
    try { const verdict = acc({ action: /action=([\w.]+)/.exec(m.pattern.emit ?? '')?.[1] ?? null, mode: /arg\.mode=(\w+)/.exec(m.pattern.emit ?? '')?.[1] ?? null, claim: !!m.pattern.tabClaim, tab: context?.tabWorld ?? null, roles, text: roles[SEGMENT_SLOT] ?? toks.map((t) => t.lower ?? t.text ?? '').join(' '), state: context?.states?.[m.pattern.worldId] ?? null }); ok = verdict !== false; strong = verdict === 'focus'; } catch { ok = true; }   // 'focus': the world holds the focus of the dialogue ("make it red"), so it does not yield
    // a world with a decline hook is a schema world whose forms keep free slots: its catch-all reading yields to a reading of another world that has no free text at all
    // ("Is a square a rectangle?" is the shapes world's, even while the avatar tab is open)
    if (ok && !strong && context?.lastWorld !== m.pattern.worldId && wildTokens(m) > 0 && matches.some((o) => o.pattern.worldId !== m.pattern.worldId && wildTokens(o) === 0 && !m.pattern.tabClaim)) ok = false;
    if (!ok) matches.splice(k, 1);
  }
  // ACT VERB SWALLOWED (TRANSFER, spec 23): a free-text reading whose wildcard slot starts with the verb of an act that another world's act pattern reads in this very sentence ("send table 1
  // to the chart": the chart's data pattern took "send table" as its data) yields to the act. The act pattern names its verb group (`$acts.verb.<act>`) and its action ends with the act, so
  // no phrase is listed here; naming a view ("the chart") does not make the view's own data reading win over a send.
  if (matches.length > 1) {
    const actOf = (o) => { const a = /action=[\w.]*\.(\w+)/.exec(o.pattern.emit ?? '')?.[1]; return a && String(o.pattern.match ?? '').includes(`$acts.verb.${a}]`) ? a : null; };
    const acts = matches.map((o) => [o, actOf(o)]).filter(([, a]) => a);
    if (acts.length) {
      for (let k = matches.length - 1; k >= 0; k--) {
        budget.tick('rules.actverb');
        const m = matches[k];
        if (m.pattern.tabClaim || actOf(m)) continue;
        const starts = Object.values(m.slots ?? {}).filter((s) => (s.class === 'rest' || s.class === 'words') && s.tokens && s.tokens[1] > s.tokens[0]).map((s) => s.tokens[0]);
        const swallowed = starts.some((i) => acts.some(([o, a]) => o.pattern.worldId !== m.pattern.worldId && (lex.phrases.get(`acts.verb.${a}`)?.alts ?? []).some((alt) => alt.every((w, j) => String(toks[i + j]?.lower ?? '') === String(w).toLowerCase()))));
        if (swallowed) matches.splice(k, 1);
      }
    }
  }
  const kept = applyCoveragePolicy(matches, toks.filter((t) => !t.filler).length);
  if (kept.length !== matches.length) matches.splice(0, matches.length, ...kept);
  const worlds = routeScores(toks, set, lex, new Set(matches.map((m) => m.pattern.worldId)));
  const score = (id) => worlds.find((w) => w.id === id)?.score ?? 0;
  for (const m of matches) { m.score = score(m.pattern.worldId); m.rank = m.pattern.priority; }
  // The router (src/formalizer/routing.mjs, spec 03 section 4) orders the candidates using the application context.
  const tables = namingTables(set);
  const routed = router.route({ matches, context: { ...(context ?? {}), names: tables.names, tabWorlds: [...tables.tabWorlds] }, scores: worlds, tokens: toks });
  // Game controls of ui.shell on a game tab emit the active game's own action (spec 03 section 4, Q5): one meaning, one label.
  const gameTab = context?.tabWorld && String(context.tabWorld).startsWith('games.') ? set.list().find((w) => w.id === context.tabWorld) : null;
  if (gameTab?.gameControls) {
    for (const m of routed.matches) {
      if (!isGameControl(m)) continue;
      const own = gameControlAction(m.pattern, gameTab.gameControls);
      if (own) m.pattern = { ...m.pattern, emit: m.pattern.emit.replace(/action=[\w.]+/, `action=${own}`) };
    }
  }
  return { matches: routed.matches, worlds, decision: routed.decision };
}

const plainSlots = (slots) => Object.fromEntries(Object.entries(slots).map(([k, s]) => [k, { class: s.class, value: s.value, text: s.text, span: s.span }]));

/** Signature of what a match would emit, ids anonymized (to detect equal readings). */
function signature(m) {
  let n = 0;
  try {
    const sop = substituteEmit(m.pattern.emit, m.slots, () => '_' + ++n);
    return sop.replace(/\s+/g, ' ');
  } catch { return m.pattern.id; }
}

/**
 * Formalize `text` (English) into wires.
 * @returns {{ segments: object[], wires: object[] }}
 */
export function formalize(text, { worlds, session, source = 'input', focus = null, context = null, router = defaultRouter, pick = null } = {}) {
  guard.check('rules');   // cancellation point (turn guard)
  const ctx = normalizeContext(context ?? (focus ? contextFromFocus(focus) : null));
  const set = worlds;
  const form = session instanceof FormSession ? session : session.form;
  const lex = lexIndex(set);
  const env = makeEnv(text, set, form, lex);
  const segments = [];
  const wires = [];

  /** Try to turn one token group into a segment. */
  const readGroup = (tokens, isQuestion, expanded = null) => {
    guard.check('rules');
    budget.tick('rules.readgroup');
    const body = tokens.filter(isContent);
    const ends = body.length ? body : tokens.filter((t) => t.kind !== 'qmark');
    const first = ends[0] ?? tokens[0], last = ends[ends.length - 1] ?? tokens[tokens.length - 1];
    const span = expanded ? expanded.span : [first.start, last.end];
    const segText = expanded ? joinText(tokens) : text.slice(span[0], span[1]);
    const ranked = rankMatches(tokens, isQuestion, set, env, lex, ctx, router);
    const { worlds: scores, decision } = ranked;
    let matches = ranked.matches, pickNote = null;
    if (pick && matches.length > 1) {   // world-aware choice (spec 16): the host may reorder the readings the rules found, judging each against the world instances
      const wiresOf = (m) => {   // the dialogue wires a reading would emit, without committing anything (ids are scratch)
        let n = 0;
        try {
          const out = buildWires(m.pattern, { ...m.slots, [SEGMENT_SLOT]: { value: segText, text: segText } }, { fresh: () => `pick${++n}`, nextSeq: () => 0, sourceRef: 'pick', worldId: m.pattern.worldId });
          return out.map((w) => set.legends.normalizeWire(w)).filter((r) => !r.errors.length).map((r) => r.wire);
        } catch { return null; }
      };
      try { const r = pick(matches, { text: segText, wiresOf }); if (r?.matches?.length) { matches = r.matches; pickNote = r.note ?? null; } } catch { matches = ranked.matches; }
    }
    const seg = { text: segText, span, isQuestion, worlds: scores, routing: decision, match: null, wires: [], unparsed: true, alternatives: [], errors: [] };
    if (pickNote) seg.pick = pickNote;
    if (expanded) seg.expanded = expanded.info;
    const sourceRef = `${source}#${span[0]}-${span[1]}`;
    for (const m of matches) {
      try {
        const agents = Object.values(m.slots).filter((s) => s.agent).sort((a, b) => a.tokens[0] - b.tokens[0]);
        const slotsForEmit = { ...m.slots, [SEGMENT_SLOT]: { value: segText, text: segText } };   // {segment}: the sentence itself (spec 03 section 2)
        const emitted = buildWires(m.pattern, slotsForEmit, {
          fresh: () => form.freshId('w'), nextSeq: () => form.nextSeq(), sourceRef, worldId: m.pattern.worldId,
        });
        const normalized = [];
        const errors = [];
        for (const w of emitted) {
          const r = set.legends.normalizeWire(w);
          errors.push(...r.errors);
          normalized.push(r.wire);
        }
        const local = new Map(normalized.map((w) => [w.id, w]));
        for (const w of normalized) errors.push(...set.legends.validateWire(w, { lookup: (id) => local.get(id) }));
        if (errors.length) { seg.errors.push(`${m.pattern.id}: ${errors[0].message}`); continue; }
        // commit: entities first, in order of appearance
        const entityWires = [];
        const via = m.pattern.id;
        // remember the mentioned items per agent, for elliptic sentences ("Ana eats 1.")
        const agentIds = agents.map((a) => a.agent.id);
        for (const it of Object.values(m.slots)) {
          if (it.class === 'recent') form.noteItem(it.args[0], it.value, agentIds);
          else if (it.class.startsWith('lex.')) form.noteItem(it.class, it.value, agentIds);
        }
        for (const a of agents) {
          const w = form.commit(a.agent);
          if (w) {
            const withCore = addEntityCore(w, { via, sourceRef, seq: form.nextSeq(), worldId: m.pattern.worldId });
            entityWires.push(withCore);
          }
        }
        // renumber so that entity wires precede the wires that mention them
        const renumbered = normalized.map((w) => ({
          ...w, entries: w.entries.map((e) => (e.key === 'core.seq' ? { key: e.key, value: { kind: 'atom', v: String(form.nextSeq()) } } : e)),
        }));
        seg.wires = [...entityWires, ...renumbered];
        seg.unparsed = false;
        seg.match = { patternId: m.pattern.id, worldId: m.pattern.worldId, kind: m.pattern.kind, priority: m.pattern.priority, slots: plainSlots(m.slots) };
        const bestSig = signature(m);
        for (const o of matches) {
          if (o === m || o.pattern.worldId === m.pattern.worldId) continue;
          if (o.tier === m.tier && o.sub === m.sub && o.rank === m.rank && o.literals === m.literals && o.skips === m.skips && o.score === m.score
            && signature(o) !== bestSig) {
            seg.alternatives.push({ patternId: o.pattern.id, worldId: o.pattern.worldId, kind: o.pattern.kind, slots: plainSlots(o.slots) });
          }
        }
        break;
      } catch (e) {
        seg.errors.push(`${m.pattern.id}: ${e.message}`);
      }
    }
    return seg;
  };

  /** Read a sentence as a whole, else clause by clause; then try the conservative expansion (spec 03 section 1c). */
  const readSentence = (s, tokens) => {
    budget.tick('rules.sentence');
    const before = form.snapshot();
    const base = readSentencePlain(s, tokens);
    const after = form.snapshot();
    const whole = base.done?.length === 1 && base.done[0].span === s.span ? base.done[0] : null;
    const weak = !!whole && isWeak(whole);
    const cl = base.done && base.done.length > 1 ? splitClauses(tokens) : null;
    const clean = base.done && base.done.every((p) => !p.unparsed && !isWeak(p)) && !weak && !(cl && base.done.some((_, i) => isStray(base.done, cl, i)));
    if (clean) return base;
    // 1. self-correction ("blue, no, green")
    form.restore(before);
    const bar = weak ? { priority: whole.match.priority, worldId: whole.match.worldId } : null;
    const corrected = expandSentence(s, tokens, 'correct', bar);
    if (corrected) return { done: corrected, fallback: null };
    // 2. clause level: repetition, verb ellipsis (only the clauses that were not understood)
    if (!weak) form.restore(after);
    const clauseLevel = expandClauses(s, tokens, weak ? null : base, whole, bar);
    if (clauseLevel) return clauseLevel;
    // 3. shared argument ("eyes and body blue")
    form.restore(before);
    const shared = expandSentence(s, tokens, 'shared', bar);
    if (shared) return { done: shared, fallback: null };
    form.restore(after);
    return base;
  };

  /** The last coordinated piece of a swallowed text is an elliptic noun phrase ("and a yellow one"). */
  const swallowsAnaphora = (txt) => {
    const ana = oneAnaphoraEnv();
    if (!ana) return false;
    const last = txt.split(/\s*,\s*|\s+and\s+/i).pop();
    const ts = tokenize(last).filter((t) => t.kind === 'word' || t.kind === 'number');
    return ts.length >= 2 && !!oneAnaphora(ts, ts.length > 1 ? [{ kind: 'word', lower: 'x' }, { kind: 'word', lower: 'y' }] : [], ana.opts);
  };

  /** A parsed segment whose free-text slot swallowed a separator, a correction marker or a repetition. */
  const isWeak = (seg) => {
    if (seg.unparsed || !seg.match) return false;
    const pat = patternById(set).get(seg.match.patternId);
    const els = pat ? compiled(pat, set).compiled?.elements ?? [] : [];
    // an explicit "unknown argument" catch-all (emit action ...Unknown) that swallowed a coordination is never a reading to keep
    const unknownArg = !!pat && /action=\S*unknown/i.test(pat.emit);
    return Object.entries(seg.match.slots).some(([name, sl]) => {
      if (!(sl.class === 'words' || sl.class === 'rest')) return false;
      const txt = sl.text ?? '';
      if (MARKER_RE.test(txt)) return true;
      if (!SEP_RE.test(txt)) return false;
      if (QUESTION_TAIL_RE.test(txt)) return true;   // "... and what sound does a cow make": a question after a connective is not part of the text
      if (swallowsAnaphora(txt)) return true;   // "... and a yellow one" belongs to the one-anaphora expansion
      if (unknownArg) return true;
      const at = els.findIndex((e) => e.t === 'slot' && e.name === name);
      return at >= 0 && els.slice(at + 1).some((e) => e.t === 'slot' && !e.optional && e.cls.startsWith('lex.'));
    });
  };

  /**
   * Trial: read the proposed clauses; keep them (and their effects) only when all are understood by one world (`world`
   * when given) and no free-text slot reaches outside the clause's own words (`c.span`, set for coordination and ellipsis).
   */
  /** Against a swallowing whole reading `bar` ({ priority, worldId }): a reading in another world must be more specific, in the same world at least as specific. */
  const beats = (g, bar) => !bar || g.match.priority > bar.priority || (g.match.worldId === bar.worldId && g.match.priority >= bar.priority);

  const tryClauses = (clauses, world = null, bar = null) => {
    const snap = form.snapshot();
    const segs = [];
    for (const c of clauses) segs.push(readGroup(c.tokens, QUESTION_WORDS.has(c.tokens[0].lower), c));
    const inside = (g, c) => !c.guard || Object.values(g.match.slots).every((sl) => !(sl.class === 'words' || sl.class === 'rest') || (sl.span[0] >= c.span[0] && sl.span[1] <= c.span[1]));
    if (segs.every((g, i) => !g.unparsed && !isWeak(g) && g.match.worldId === (world ?? segs[0].match.worldId) && inside(g, clauses[i]) && beats(g, bar))) return segs;
    form.restore(snap);
    return null;
  };

  const expandSentence = (s, tokens, phase, bar) => {
    const src = [s.span[0], s.span[1]];
    const sc = selfCorrect(tokens);
    const toks = sc ? sc.tokens : tokens;
    if (phase === 'correct') {
      if (!sc) return null;
      const one = tryClauses([{ tokens: toks.filter((t) => t.kind !== 'punct'), span: sc.region, info: { kind: 'self-correction', source: sc.region, dropped: sc.dropped, copied: [] } }], null, bar);
      if (one || !sc.ambiguous) return one;
      // a short clause where the correction may answer instead of patching ("top left, no, center"): the whole clause is replaced
      const w = selfCorrect(tokens, { whole: true });
      return w ? tryClauses([{ tokens: w.tokens.filter((t) => t.kind !== 'punct'), span: w.region, info: { kind: 'self-correction', source: w.region, dropped: w.dropped, copied: [] } }], null, bar) : null;
    }
    for (const cand of sharedArgument(toks)) {
      const clauses = cand.clauses.map((c, i) => ({ tokens: c.tokens, span: c.own, guard: true, info: { kind: 'shared-argument', source: src, copied: c.copied, ...(sc ? { dropped: sc.dropped } : {}), index: i, of: cand.clauses.length } }));
      const segs = tryClauses(clauses, null, bar);
      if (segs) return segs;
    }
    return null;
  };

  /** Clause `i` is a verbless noun phrase that another world read as a command of its own, after a clause of a different world. */
  const isStray = (parts, clauses, i) => {
    const part = parts[i], ct = clauses[i];
    if (!part || part.unparsed || isWeak(part) || !ct || parts.length !== clauses.length) return false;
    const firstOk = parts.findIndex((p) => !p.unparsed && !isWeak(p));
    return firstOk >= 0 && firstOk < i && part.match.worldId !== parts[firstOk].match.worldId
      && (ct[0].kind === 'number' || ['a', 'an', 'the', 'some', 'another', 'more'].includes(ct[0].lower));
  };

  /** Phrase groups `lang.elide.lead` / `lang.elide.noun` of lang.common and the lexicon-class test of the one-anaphora expansion (null when the worlds do not import them). */
  const oneAnaphoraEnv = () => set.memo('oneAnaphoraEnv', () => {   // COMPUTE-BUDGET C: built once per world set (it scanned every lexicon on each turn)
    const words = (id) => (lex.phrases.get(id)?.alts ?? []).map((a) => a.join(' ').toLowerCase());
    const leads = new Set(words('lang.elide.lead')), nouns = new Set(words('lang.elide.noun'));
    if (!leads.size || !nouns.size) return null;
    // the class of a word is the smallest lexicon that holds it (a catch-all "mods" lexicon holds sizes and colours together)
    const classes = new Map(), sizeOf = new Map();
    for (const [id, l] of lex.lexicons) for (const w of l.words) if (!w.includes('_')) { const k = w.toLowerCase(); if (!classes.has(k) || l.words.size < sizeOf.get(k)) { classes.set(k, id); sizeOf.set(k, l.words.size); } }
    const sameClass = (a, b) => classes.has(a) && classes.get(a) === classes.get(b);
    const isModifier = (w) => classes.has(w);
    const isElliptic = (c) => { const w = c.filter((t) => t.kind === 'word' || t.kind === 'number'); const l = w[w.length - 1]; return w.length >= 2 && nouns.has(l.alt ?? l.lower); };
    return { opts: { leads, nouns, sameClass, isModifier, singular: (w) => lex.lemma(w) }, isElliptic };
  });

  const expandClauses = (s, tokens, base, whole = null, bar = null) => {
    const clauses = splitClauses(tokens);
    const parts = base?.done ?? (base?.fallback && clauses.length === 1 ? [base.fallback] : clauses.map((c, idx) => readGroup(c, QUESTION_WORDS.has(c[0].lower) || (s.isQuestion && idx === clauses.length - 1 && /\?/.test(text.slice(s.span[1], s.span[1] + 3))))));
    if (parts.length !== clauses.length) return null;
    const out = [];
    let changed = false;
    parts.forEach((part, i) => {
      const ct = clauses[i];
      // one-anaphora (spec 03 section 1c): "and a yellow one" repeats the previous command with its noun and the new modifiers
      const ana = oneAnaphoraEnv();
      if (ana && i > 0) {
        let ai = i - 1;
        while (ai > 0 && ana.isElliptic(clauses[ai])) { budget.tick('index.expandClauses'); ai--; }
        if (!ana.isElliptic(clauses[ai]) && !parts[ai].unparsed && !isWeak(parts[ai])) {
          const res = oneAnaphora(ct, clauses[ai], ana.opts);
          if (res) {
            const sp = [ct[0].start, ct[ct.length - 1].end];
            for (const cand of res.candidates) {
              const segs = tryClauses([{ tokens: cand, span: sp, guard: true, info: { kind: 'one-anaphora', source: sp, copied: [[clauses[ai][0].start, clauses[ai][clauses[ai].length - 1].end]] } }], parts[ai].match?.worldId ?? null, bar);
              if (segs) { out.push(...segs); changed = true; return; }
            }
          }
        }
      }
      // distribution of the verb (spec 03 section 1c): a verbless noun phrase clause ("... and a beard") that another world read as a
      // command of its own ("a beard" as a hangman guess) is still tried as an elliptic clause of the first clause's world
      const stray = isStray(parts, clauses, i);
      if (!part.unparsed && !isWeak(part) && !stray) { out.push(part); return; }
      const rep = repetition(ct);
      if (rep) {
        const sp = [ct[0].start, ct[ct.length - 1].end];
        const snap = form.snapshot();
        const segs = [];
        for (let k = 0; k < rep.n; k++) segs.push(readGroup(rep.tokens, QUESTION_WORDS.has(rep.tokens[0].lower), { span: sp, info: { kind: 'repetition', source: sp, dropped: [rep.dropped], copied: [], index: k, of: rep.n } }));
        if (segs.every((g) => !g.unparsed && beats(g, bar))) { out.push(...segs); changed = true; return; }
        form.restore(snap);
      }
      const anchorIdx = parts.findIndex((p) => !p.unparsed && !isWeak(p));
      if ((part.unparsed || stray) && anchorIdx >= 0 && anchorIdx < i) {
        for (const pre of ellipsisPrefixes(clauses[anchorIdx])) {
          const sp = [ct[0].start, ct[ct.length - 1].end];
          const segs = tryClauses([{ tokens: [...pre, ...ct.filter((t) => t.kind !== 'punct')], span: sp, guard: true, info: { kind: 'verb-ellipsis', source: sp, copied: [[pre[0].start, pre[pre.length - 1].end]] } }], parts[anchorIdx].match.worldId, bar);
          if (segs) { out.push(...segs); changed = true; return; }
        }
      }
      out.push(part);
    });
    if (changed) return out.some((p) => !p.unparsed) ? { done: out, fallback: null } : null;
    // a catch-all whole reading that swallowed "then ..." while every clause is understood on its own (any worlds), each by a
    // pattern at least as specific: "then" is an explicit sequence, so keep the clauses ("move left twice, then undo")
    const swallowedThen = whole && clauses.length > 1 && Object.values(whole.match.slots).some((sl) => (sl.class === 'words' || sl.class === 'rest') && /(^|[\s,])then([\s,]|$)/i.test(sl.text ?? ''));
    // a clause that opens with a question word is never the continuation of a command's free text: it needs no priority bar
    const specific = (p, i) => (p.match?.priority ?? 0) >= (whole.match?.priority ?? 0) || (i > 0 && QUESTION_WORDS.has(clauses[i][0]?.lower));
    if (swallowedThen && parts.every((p, i) => !p.unparsed && !isWeak(p) && specific(p, i))) return { done: parts, fallback: null };
    // the same, with and/comma, when all clauses are understood in one world whatever their priority (the clauses are complete sentences)
    const swallowedSep = whole && clauses.length > 1 && Object.values(whole.match.slots).some((sl) => (sl.class === 'words' || sl.class === 'rest') && /(^|[\s,])(and|but)([\s,]|$)|,/i.test(sl.text ?? ''));
    if (swallowedSep && parts.every((p, i) => !p.unparsed && !isWeak(p) && ((p.match.worldId === parts[0].match.worldId && (p.match.worldId === whole.match.worldId || beats(p, bar))) || (i > 0 && QUESTION_WORDS.has(clauses[i][0]?.lower))))) return { done: parts, fallback: null };
    return null;
  };

  /**
   * A free-text slot (rest, words) that swallowed "and a list: milk, eggs" / "and add a list ...": when the words after the connective are
   * a command of another kind of the SAME world (read with its own verb, or with the verb of the head: verb ellipsis), the sentence is
   * two commands (spec 03 section 1c, "A swallowing free-text slot"). The head must also parse without the tail. Same kind of command
   * ("add a paragraph salt and a pinch of pepper": a second paragraph pattern) stays one text. Recursive for the rest of the sentence.
   */
  const splitSwallowedCommand = (tokens, whole) => {
    if (!whole?.match) return null;
    const worldId = whole.match.worldId;
    const slots = Object.values(whole.match.slots ?? {}).filter((sl) => sl.class === 'words' || sl.class === 'rest');
    const inSlot = (t) => slots.some((sl) => t.start >= sl.span[0] && t.end <= sl.span[1]);
    const cuts = [];
    tokens.forEach((t, i) => { if ((t.lower === 'and' || t.lower === 'then') && i > 0 && i < tokens.length - 1 && inSlot(t) && !(i > 0 && tokens[i - 1].lower === 'and' && t.lower === 'then')) cuts.push(i); });
    if (!cuts.length) return null;
    const trim = (ts) => { let a = ts; while (a.length > 1 && (a[0].lower === 'then' || a[0].lower === 'and' || a[0].lower === ',')) { budget.tick('index.trim'); a = a.slice(1); } while (a.length && a[a.length - 1].lower === ',') { budget.tick('index.trim'); a = a.slice(0, -1); } return a; };
    const spanOf = (ts) => [ts[0].start, ts[ts.length - 1].end];
    // each command must be read by a pattern at least as specific as the one that swallowed the connective (a typed "between X and Y" reading is never cut)
    const read = (ts, copied) => {
      const r = tryClauses([{ tokens: ts.filter((t) => t.kind !== 'punct' || t.lower === ':' || t.lower === ','), span: spanOf(ts), guard: true, info: { kind: 'swallowed-command', source: spanOf(tokens), copied } }], worldId);
      return r && r.every((g) => g.match.priority >= whole.match.priority) ? r : null;
    };
    // clauses between the accepted cuts; a cut is accepted when the words after it are a command of this world
    const actionOf = (id) => /action=(\S+)/.exec(patternById(set).get(id)?.emit ?? '')?.[1] ?? id;
    const parts = [];   // { toks, seg }
    let start = 0, prevPattern = null;
    const snap0 = form.snapshot();
    const fail = () => { form.restore(snap0); return null; };
    const cutList = [...cuts, tokens.length];
    for (let k = 0; k < cutList.length; k++) {
      const end = cutList[k];
      const here = trim(tokens.slice(start, end));
      if (!here.some(isContent)) { start = end + 1; continue; }
      let seg = null, snapHere = form.snapshot();
      if (parts.length === 0) { seg = read(here, []); if (!seg) return fail(); }
      else {
        const snap = snapHere;
        const variants = [{ ts: here, copied: [], own: true }, ...[...ellipsisPrefixes(parts[0].toks)].map((pre) => ({ ts: [...pre, ...here], copied: [[pre[0].start, pre[pre.length - 1].end]], own: false }))];
        for (const v of variants) {
          const r = read(v.ts, v.copied);
          if (!r) { form.restore(snap); continue; }
          if (!v.own && actionOf(r[0].match.patternId) === prevPattern) { form.restore(snap); continue; }   // the same kind of command by ellipsis: still one text ("salt and a pinch of pepper")
          seg = r; break;
        }
        if (!seg) {   // this connective is part of the text: the words belong to the previous command, which is read again with them
          const last = parts.pop();
          form.restore(last.snap);
          const merged = trim(tokens.slice(parts.length ? last.from : 0, end));
          const again = read(merged, []);
          if (!again) return fail();
          parts.push({ toks: parts.length ? last.toks : merged, from: last.from, seg: again, snap: last.snap });
          prevPattern = actionOf(again[0].match.patternId);
          start = end + 1;
          continue;
        }
      }
      parts.push({ toks: here, from: start, seg, snap: snapHere });
      prevPattern = actionOf(seg[0].match.patternId);
      start = end + 1;
    }
    return parts.length > 1 ? parts.flatMap((p) => p.seg) : fail();
  };

  const readSentencePlain = (s, tokens) => {
    const whole = readGroup(tokens, s.isQuestion);
    const clauses = splitClauses(tokens);
    const firstWord = (c) => c.find(isContent)?.lower;
    if (!whole.unparsed) {
      // A free-text slot (words, rest) that swallowed a clause separator ("make eyes bigger AND lips red") means the whole-sentence
      // reading is a catch-all: prefer the clause-by-clause reading when every clause is understood on its own by a pattern
      // of at least the same priority, all of the same world (so a list "a, b and c" of one world is never split across worlds).
      const swallowed = clauses.length > 1 && Object.values(whole.match?.slots ?? {}).some((sl) => (sl.class === 'words' || sl.class === 'rest') && /(^|[\s,])(and|then|but)([\s,]|$)|,/i.test(sl.text ?? ''));
      if (swallowed) {
        const parts = clauses.map((c, idx) => readGroup(c, QUESTION_WORDS.has(firstWord(c)) || (s.isQuestion && idx === clauses.length - 1 && /\?/.test(text.slice(s.span[1], s.span[1] + 3)))));
        // clauses of one world, or a command followed by a question of another world ("add a heading Shopping and what is 2 plus 2"), or a
        // command of another world that is read almost entirely by fixed words ("play twinkle twinkle and draw a house"); a question clause needs no priority bar
        const sameWorld = (p) => p.match?.worldId === parts[0].match?.worldId;
        const isQ = (i) => i > 0 && QUESTION_WORDS.has(firstWord(clauses[i]));
        const ownCommand = (p, i) => i > 0 && clauses[i].filter(isContent).length >= 3 && fixedCoverage(p.match, clauses[i].filter(isContent).length) >= 0.5;
        if (parts.every((p, i) => !p.unparsed && ((p.match?.priority ?? 0) >= (whole.match?.priority ?? 0) || isQ(i)) && (i === 0 || sameWorld(p) || isQ(i) || ownCommand(p, i)))) return { done: parts, fallback: null };
      }
      const cut = splitSwallowedCommand(tokens, whole);
      if (cut) return { done: cut, fallback: null };
      return { done: [{ ...whole, span: s.span, text: s.text }], fallback: null };
    }
    // an indirect question ("tell me what is 3 plus 4"): read the bare question (the original was tried first)
    const lead = stripLeadIn(tokens);
    if (lead) {
      const sub = readSentence({ ...s, isQuestion: true }, lead);
      if (sub.done) return sub.done.length === 1 ? { done: [{ ...sub.done[0], span: s.span, text: s.text }], fallback: null } : sub;
    }
    if (clauses.length > 1) {
      const parts = clauses.map((c, idx) => {
        const q = QUESTION_WORDS.has(firstWord(c)) || (s.isQuestion && idx === clauses.length - 1 && /\?/.test(text.slice(s.span[1], s.span[1] + 3)));
        return readGroup(c, q);
      });
      // a connective inside one clause ("what do red AND yellow make") cut it in two unreadable halves: read the neighbours again as one
      for (let i = 0; i + 1 < parts.length; i++) {
        budget.tick('index.rejoin');
        if (!parts[i].unparsed || !parts[i + 1].unparsed) continue;
        const a = clauses[i], b = clauses[i + 1];
        const merged = tokens.filter((t) => t.start >= a[0].start && t.end <= b[b.length - 1].end);
        const q = QUESTION_WORDS.has(firstWord(a)) || (s.isQuestion && i + 1 === clauses.length - 1 && /\?/.test(text.slice(s.span[1], s.span[1] + 3)));
        const again = readGroup(merged, q);
        if (again.unparsed || isWeak(again)) continue;
        parts.splice(i, 2, again); clauses.splice(i, 2, merged); i--;
      }
      if (parts.some((p) => !p.unparsed)) return { done: parts, fallback: null };
    }
    return { done: null, fallback: { ...whole, span: s.span, text: s.text } };
  };

  const vocab = () => vocabularyOf(set);
  // Context anchoring (spec 03 section 1b): a word known in the open tab / game / modal world is never changed, and a content word (4+ letters)
  // that some other world's lexicon knows is not "fixed" into a word of this (restricted) world: that changes both the world and the noun ("boat" -> "coat").
  const whole = set.parent ?? set;
  const anchored = () => {
    const ids = [ctx.tabWorld, ctx.gameWorld, ctx.modalWorld].filter(Boolean);
    const out = new Set();
    for (const id of ids) for (const w of worldVocabularyOf(whole, id)) out.add(w);
    return out;
  };
  let anchor = null;
  const known = (w) => vocab().has(w) || vocab().has(lex.lemma(w)) || lex.names.has(w)
    || (anchor ??= anchored()).has(w) || (w.length >= 4 && whole !== set && lexiconWordsOf(whole).has(w));
  const preferredVocab = () => {
    const ids = [ctx.tabWorld, ctx.gameWorld, ctx.modalWorld, ...(ctx.recentWorlds ?? []).slice(0, 2)].filter(Boolean);
    const out = new Set();
    for (const id of ids) for (const w of worldVocabularyOf(set, id)) out.add(w);
    return out;
  };
  for (const s of analyze(text)) {
    s.tokens = dropStyleIn(splitPossessives(s.tokens, lex));
    const first = readSentence(s, s.tokens);
    if (first.done) { segments.push(...first.done); continue; }
    // nothing matched: retry once with unknown words corrected to the closest known word (typo tolerance)
    // chat spelling `u` is read as `you` in this retry only (a literal `u` of a pattern still matches through `alt`)
    const retryTokens = s.tokens.map((t) => (t.kind === 'word' && t.lower === 'u' ? { ...t, lower: 'you', alt: 'u' } : t));
    const fix = correctTokens(retryTokens, text, vocab(), known, { preferred: preferredVocab });
    const swapped = retryTokens.some((t, i) => t !== s.tokens[i]);
    if (fix.corrections.length || swapped) {
      const second = readSentence(s, fix.tokens);
      if (second.done) {
        for (const seg of second.done) {
          const mine = fix.corrections.filter((c) => c.span[0] >= seg.span[0] && c.span[1] <= seg.span[1]);
          if (!seg.unparsed && mine.length) seg.corrections = mine;
        }
        segments.push(...second.done);
        continue;
      }
    }
    // ROUND-TRIP-MINING: the same meaning in another grammatical frame ("Wearing a hat", "He draws two houses", "in italics"): token rewrites, tried only now
    let third = null;
    for (const variant of readingVariants(retryTokens, known)) {
      const r = readSentence(s, variant);
      if (r.done && !r.done.some((x) => x.unparsed) && !(variant.command && r.done.some((x) => x.match?.kind === 'statement'))
          && !(variant.personal && !r.done.every((x) => x.match?.worldId === ctx.tabWorld))) { third = r; break; }
    }
    if (third) { segments.push(...third.done); continue; }
    segments.push(first.fallback);
  }
  for (const seg of segments) wires.push(...seg.wires);
  return { segments, wires };
}

function addEntityCore(w, { via, sourceRef, seq, worldId }) {
  return {
    ...w,
    entries: [...w.entries,
      { key: 'core.via', value: { kind: 'ref', v: via } },
      { key: 'core.source', value: { kind: 'string', v: sourceRef } },
      { key: 'core.seq', value: { kind: 'atom', v: String(seq) } },
      { key: 'core.in', value: { kind: 'ref', v: worldId } }],
  };
}

/** SOP text of formalized wires (helper for the CLI and tests). */
export const wiresToSop = (wires) => serialize(wires);
export { PatternError };
