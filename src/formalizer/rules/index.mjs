/**
 * Rule-based formalizer (spec 03). Browser-safe.
 *
 * formalize(text, { worlds, session, source }) -> { segments, wires }
 * `worlds` is a WorldSet; `session` is a FormSession or any object with a `.form` FormSession.
 */
import { lexIndex } from '../../worlds/lexicon.mjs';
import { analyze, QUESTION_WORDS, correctTokens, isOldFiller, editDistance } from './normalize.mjs';
import { compilePattern, matchTokens, wordBag, prefilterPasses, BUILTIN_CLASSES, PatternError } from './matcher.mjs';
import { buildWires, substituteEmit, dummySlots } from './emit.mjs';
import { routeScores } from './router.mjs';
import { createRouter, contextFromFocus, normalizeContext, defaultRouter, isGameControl, gameControlAction } from '../routing.mjs';
import { FormSession, STOP_WORDS, isPronoun } from './session.mjs';
import { selfCorrect, sharedArgument, repetition, ellipsisPrefixes, joinText, MARKER_RE, SEP_RE } from './expand.mjs';
import { parse, serialize } from '../../soplang/index.mjs';

export { FormSession } from './session.mjs';
export { createRouter, createPriorityRouter, emptyContext } from '../routing.mjs';
export { analyze, splitSentences, tokenize, editDistance, correctTokens } from './normalize.mjs';
export { compilePattern, matchTokens } from './matcher.mjs';
export { singularLemma, pluralize } from './lemma.mjs';

const compiledCache = new WeakMap();
/** Compile (memoized) a pattern object; returns { compiled } or { error }. */
function compiled(p, set) {
  if (!compiledCache.has(p)) {
    try { compiledCache.set(p, { compiled: compilePattern(p.match, lexIndex(set).phrases) }); } catch (e) { compiledCache.set(p, { error: e.message }); }
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
    if (!c.slots.has(name) && !/^_\d*$/.test(name)) problems.push(`${p.id}: emit uses '{${name}}' but the match has no such slot`);
  }
  if (!['statement', 'question', 'request', 'chat'].includes(p.kind)) problems.push(`${p.id}: unknown kind '${p.kind}'`);
  try {
    const slots = dummySlots(c.slots);
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
 * Every word the loaded worlds know: literals of all patterns (and alternatives) and the words of all lexicons
 * (multi-word entries split into words), with plural forms. Used for typo correction (spec 03 section 1b).
 */
export function vocabularyOf(set) {
  return set.memo('vocabulary', () => {
    const vocab = new Set();
    const freq = new Map();   // how often each word occurs in the patterns and lexicons: the last tie-break of typo correction
    vocab.freq = freq;
    const add = (w) => { if (w) { const l = w.toLowerCase(); vocab.add(l); freq.set(l, (freq.get(l) ?? 0) + 1); } };
    for (const { p } of allPatterns(set)) {
      const c = compiled(p, set).compiled;
      if (!c) continue;
      for (const el of c.elements) {
        if (el.t === 'lit') el.words.forEach(add);
        else if (el.t === 'alt') el.alts.forEach((alt) => alt.forEach(add));
      }
    }
    const lex = lexIndex(set);
    for (const l of lex.lexicons.values()) for (const w of l.words) for (const part of w.split('_')) add(part);
    for (const [s, pl] of lex.plurals) { add(s); add(pl); }
    return vocab;
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

const isContent = (t) => t.kind !== 'punct' && t.kind !== 'qmark' && !t.filler;

/** Split a token list into clauses at `,`, `and`, `then`, `but` (one level). Clauses with only fillers are dropped. */
export function splitClauses(tokens) {
  const clauses = [[]];
  for (let i = 0; i < tokens.length; i++) {
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
  const resolveAgent = (tokens, i) => {
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
  return { text, lex, resolveAgent, recentItem: (lexId, agentId) => form.recentItem(lexId, agentId) };
}

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
    for (const { p, order } of allPatterns(set)) {
      if (isQuestion && p.kind === 'statement') continue;
      const c = compiled(p, set);
      if (!c.compiled || (last && !c.compiled.usesFiller)) continue;
      let m = prefilterPasses(c.compiled, bag) ? matchTokens(c.compiled, view, env) : null;
      if (!m && noPct && prefilterPasses(c.compiled, bagNoPct)) m = matchTokens(c.compiled, noPct, env);
      if (m) matches.push({ pattern: p, order, ...m });
    }
  }
  const worlds = routeScores(toks, set, lex, new Set(matches.map((m) => m.pattern.worldId)));
  const score = (id) => worlds.find((w) => w.id === id)?.score ?? 0;
  for (const m of matches) { m.score = score(m.pattern.worldId); m.rank = m.pattern.priority; }
  // The router (src/formalizer/routing.mjs, spec 03 section 4) orders the candidates using the application context.
  const routed = router.route({ matches, context, scores: worlds, tokens: toks });
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
export function formalize(text, { worlds, session, source = 'input', focus = null, context = null, router = defaultRouter } = {}) {
  const ctx = normalizeContext(context ?? (focus ? contextFromFocus(focus) : null));
  const set = worlds;
  const form = session instanceof FormSession ? session : session.form;
  const lex = lexIndex(set);
  const env = makeEnv(text, set, form, lex);
  const segments = [];
  const wires = [];

  /** Try to turn one token group into a segment. */
  const readGroup = (tokens, isQuestion, expanded = null) => {
    const body = tokens.filter(isContent);
    const ends = body.length ? body : tokens.filter((t) => t.kind !== 'qmark');
    const first = ends[0] ?? tokens[0], last = ends[ends.length - 1] ?? tokens[tokens.length - 1];
    const span = expanded ? expanded.span : [first.start, last.end];
    const segText = expanded ? joinText(tokens) : text.slice(span[0], span[1]);
    const { matches, worlds: scores, decision } = rankMatches(tokens, isQuestion, set, env, lex, ctx, router);
    const seg = { text: segText, span, isQuestion, worlds: scores, routing: decision, match: null, wires: [], unparsed: true, alternatives: [], errors: [] };
    if (expanded) seg.expanded = expanded.info;
    const sourceRef = `${source}#${span[0]}-${span[1]}`;
    for (const m of matches) {
      try {
        const agents = Object.values(m.slots).filter((s) => s.agent).sort((a, b) => a.tokens[0] - b.tokens[0]);
        const slotsForEmit = m.slots;
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

  const expandClauses = (s, tokens, base, whole = null, bar = null) => {
    const clauses = splitClauses(tokens);
    const parts = base?.done ?? (base?.fallback && clauses.length === 1 ? [base.fallback] : clauses.map((c, idx) => readGroup(c, QUESTION_WORDS.has(c[0].lower) || (s.isQuestion && idx === clauses.length - 1 && /\?/.test(text.slice(s.span[1], s.span[1] + 3))))));
    if (parts.length !== clauses.length) return null;
    const out = [];
    let changed = false;
    parts.forEach((part, i) => {
      const ct = clauses[i];
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
    if (swallowedThen && parts.every((p) => !p.unparsed && !isWeak(p) && (p.match?.priority ?? 0) >= (whole.match?.priority ?? 0))) return { done: parts, fallback: null };
    // the same, with and/comma, when all clauses are understood in one world whatever their priority (the clauses are complete sentences)
    const swallowedSep = whole && clauses.length > 1 && Object.values(whole.match.slots).some((sl) => (sl.class === 'words' || sl.class === 'rest') && /(^|[\s,])(and|but)([\s,]|$)|,/i.test(sl.text ?? ''));
    if (swallowedSep && parts.every((p) => !p.unparsed && !isWeak(p) && p.match.worldId === parts[0].match.worldId && (p.match.worldId === whole.match.worldId || beats(p, bar)))) return { done: parts, fallback: null };
    return null;
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
        if (parts.every((p) => !p.unparsed && (p.match?.priority ?? 0) >= (whole.match?.priority ?? 0) && p.match?.worldId === parts[0].match?.worldId)) return { done: parts, fallback: null };
      }
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
      if (parts.some((p) => !p.unparsed)) return { done: parts, fallback: null };
    }
    return { done: null, fallback: { ...whole, span: s.span, text: s.text } };
  };

  const vocab = () => vocabularyOf(set);
  const known = (w) => vocab().has(w) || vocab().has(lex.lemma(w)) || lex.names.has(w);
  const preferredVocab = () => {
    const ids = [ctx.tabWorld, ctx.gameWorld, ctx.modalWorld, ...(ctx.recentWorlds ?? []).slice(0, 2)].filter(Boolean);
    const out = new Set();
    for (const id of ids) for (const w of worldVocabularyOf(set, id)) out.add(w);
    return out;
  };
  for (const s of analyze(text)) {
    s.tokens = splitPossessives(s.tokens, lex);
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
