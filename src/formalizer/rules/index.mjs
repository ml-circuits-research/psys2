/**
 * Rule-based formalizer (spec 03). Browser-safe.
 *
 * formalize(text, { worlds, session, source }) -> { segments, wires }
 * `worlds` is a WorldSet; `session` is a FormSession or any object with a `.form` FormSession.
 */
import { lexIndex } from '../../worlds/lexicon.mjs';
import { analyze, QUESTION_WORDS } from './normalize.mjs';
import { compilePattern, matchTokens, BUILTIN_CLASSES, PatternError } from './matcher.mjs';
import { buildWires, substituteEmit, dummySlots } from './emit.mjs';
import { routeScores } from './router.mjs';
import { FormSession, STOP_WORDS, isPronoun } from './session.mjs';
import { parse, serialize } from '../../soplang/index.mjs';

export { FormSession } from './session.mjs';
export { analyze, splitSentences, tokenize } from './normalize.mjs';
export { compilePattern, matchTokens } from './matcher.mjs';
export { singularLemma, pluralize } from './lemma.mjs';

const compiledCache = new WeakMap();
/** Compile (memoized) a pattern object; returns { compiled } or { error }. */
function compiled(p) {
  if (!compiledCache.has(p)) {
    try { compiledCache.set(p, { compiled: compilePattern(p.match) }); } catch (e) { compiledCache.set(p, { error: e.message }); }
  }
  return compiledCache.get(p);
}

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
  try { c = compilePattern(p.match); } catch (e) { return [`${p.id}: ${e.message}`]; }
  for (const [name, def] of c.slots) {
    if (!BUILTIN_CLASSES.has(def.cls) && !lex.lexicons.has(def.cls)) problems.push(`${p.id}: slot '${name}' has unknown class '${def.cls}'`);
    if (def.cls === 'recent' && !lex.lexicons.has(def.args[0])) problems.push(`${p.id}: slot '${name}' refers to unknown lexicon '${def.args[0]}'`);
  }
  for (const [, name] of p.emit.matchAll(/\{([A-Za-z_]\w*)\}/g)) {
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

function allPatterns(set) {
  return set.memo('patterns', () => set.list().flatMap((w) => w.patterns).map((p, order) => ({ p, order })));
}

/** Split a token list into clauses at `,`, `and`, `then`, `but` (one level). */
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
  return clauses.filter((c) => c.length);
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

/** Ranked full matches of every pattern against `tokens` (commas removed). */
function rankMatches(tokens, isQuestion, set, env, lex) {
  const toks = tokens.filter((t) => t.kind !== 'punct');
  const matches = [];
  for (const { p, order } of allPatterns(set)) {
    if (isQuestion && p.kind === 'statement') continue;
    const c = compiled(p);
    if (!c.compiled) continue;
    const m = matchTokens(c.compiled, toks, env);
    if (m) matches.push({ pattern: p, order, ...m });
  }
  const worlds = routeScores(toks, set, lex, new Set(matches.map((m) => m.pattern.worldId)));
  const score = (id) => worlds.find((w) => w.id === id)?.score ?? 0;
  for (const m of matches) m.score = score(m.pattern.worldId);
  matches.sort((a, b) => b.pattern.priority - a.pattern.priority || b.literals - a.literals || a.skips - b.skips
    || b.score - a.score || a.order - b.order);
  return { matches, worlds };
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
export function formalize(text, { worlds, session, source = 'input' } = {}) {
  const set = worlds;
  const form = session instanceof FormSession ? session : session.form;
  const lex = lexIndex(set);
  const env = makeEnv(text, set, form, lex);
  const segments = [];
  const wires = [];

  /** Try to turn one token group into a segment. */
  const readGroup = (tokens, isQuestion) => {
    const first = tokens[0], last = tokens[tokens.length - 1];
    const span = [first.start, last.end];
    const segText = text.slice(span[0], span[1]);
    const { matches, worlds: scores } = rankMatches(tokens, isQuestion, set, env, lex);
    const seg = { text: segText, span, isQuestion, worlds: scores, match: null, wires: [], unparsed: true, alternatives: [], errors: [] };
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
        seg.match = { patternId: m.pattern.id, worldId: m.pattern.worldId, kind: m.pattern.kind, slots: plainSlots(m.slots) };
        const bestSig = signature(m);
        for (const o of matches) {
          if (o === m || o.pattern.worldId === m.pattern.worldId) continue;
          if (o.pattern.priority === m.pattern.priority && o.literals === m.literals && o.skips === m.skips && o.score === m.score
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

  for (const s of analyze(text)) {
    let seg = readGroup(s.tokens, s.isQuestion);
    if (!seg.unparsed) { segments.push({ ...seg, span: s.span, text: s.text }); continue; }
    const clauses = splitClauses(s.tokens);
    if (clauses.length > 1) {
      const parts = clauses.map((c, idx) => {
        const q = QUESTION_WORDS.has(c[0].lower) || (s.isQuestion && idx === clauses.length - 1 && /\?/.test(text.slice(s.span[1], s.span[1] + 3)));
        return readGroup(c, q);
      });
      if (parts.some((p) => !p.unparsed)) { segments.push(...parts); continue; }
    }
    seg = { ...seg, span: s.span, text: s.text };
    segments.push(seg);
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
