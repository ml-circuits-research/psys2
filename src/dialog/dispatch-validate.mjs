// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Dispatcher validation layer (spec 03 section 7, ADR-005). Browser-safe: no `node:*` imports.
 *
 * A learned dispatcher proposes candidate segmentations of a message and, per piece, the top-k worlds (and optionally a
 * simplified text). This module checks every proposal with the rule formalizer and the interpreter and chooses the
 * segmentation whose pieces the rules can actually read. Nothing generative, fully deterministic, fully traced.
 *
 *   const v = createDispatchValidator({ engine, policy });
 *   const out = await v.validate(prediction, policyOverride?);
 *
 * Input `prediction` (see spec 03 section 7 for the exact contract; parsing is tolerant):
 *   { id, text, context: { tab, recent_worlds, session: [earlier messages] },
 *     segmentations: [ { score (log-prob), segments: [ { start, end, text, worlds: [{ world, score }], simplified? } ] } ] }
 *
 * Output: { id, text, status: 'understood' | 'not_understood', winner, produced, notUnderstood, why, trace }.
 */
import { perf } from '../formalizer/perf.mjs';
import { guard } from '../formalizer/guard.mjs';
import { formalize, FormSession } from '../formalizer/index.mjs';
import { youTarget } from '../formalizer/rules/index.mjs';
import { serialize } from '../soplang/index.mjs';
import { spellCorrect, spellAlternates, protectedWordsOf, worldVocabulary, spellVocabulary, ignorable } from '../formalizer/spell.mjs';
import { findPartialWindow, changesIntoQuestion } from '../formalizer/partial.mjs';
import { checkValues } from './value-check.mjs';
import { wildTokens } from '../formalizer/routing.mjs';
import { budget } from './budget.mjs';

/** Default policy; every weight is an option. */
export const DEFAULT_POLICY = {
  maxSegmentations: 4,        // beam size actually used (the first N, most likely first)
  maxWorlds: 3,               // candidate worlds tried per piece
  trySimplified: true,        // also try `simplified` text (when present)
  useInterpreter: true,       // a candidate must also not be unsupported/error in the interpreter
  segWeight: 1.0,             // weight of the dispatcher's segmentation log-prob
  worldWeight: 1.0,           // weight of the log of the world score of a piece
  acceptRefused: true,        // a piece the rules parse completely but the interpreter refuses (unsupported/error: a state reason, Q3) counts as valid
  interpreterPenalty: 3.0,    // log-units subtracted for such a piece (it is still better than an unparsed one)
  unknownArgPenalty: 4.5,     // F5: a reading whose argument the interpreter does not know ("unknown_argument") ranks below every reading with known arguments; used only when nothing else validates
  unparsedPenalty: 6.0,       // log-units subtracted for a piece that no candidate could validate (about x 0.0025)
  simplifiedPenalty: 0.05,    // log-units subtracted when the winning reading came from the simplified text
  scoreFloor: 1e-6,           // world scores are clamped to at least this probability before the log
  tieEps: 1e-6,               // piece scores closer than this are a tie, broken by the routing policy tiers
  trySpell: true,             // also try the spell-corrected text (per candidate world, spec 03 section 7.9); accepted only if the rules parse it
  spellPenalty: 0.1,          // log-units subtracted per correction used
  acceptPartial: false,       // when no candidate of a piece parses completely, accept the best partial parse (spec 03 section 7.10); the webchat turns it on
  partialPenalty: 1.5,        // log-units subtracted for any partial parse (always better than unparsedPenalty, so a full parse of any candidate wins)
  partialUncoveredPenalty: 3.0, // plus this times the fraction of the text that was not understood
  minCoverage: 0.25,          // a partial parse must understand at least this fraction of the characters
  tryNormalizer: true,        // when a normalizer provider is injected and no candidate of the piece validates, try its rewrites (spec 03 section 7.12)
  normalizerBeam: 3,          // rewrites asked from the provider per (world, piece)
  normalizerSegmentations: 1, // the normalizer is asked only for the pieces of the first N segmentations (latency: each call is about 75 ms in the browser)
  normalizerWorlds: 2,        // and only for the first N candidate worlds of a piece
  normalizerPenalty: 0.3,     // log-units subtracted when the winning reading came from a normalizer rewrite
  valueStrictness: 'strict',  // 'strict' adds opposite-word, grounded-word and kept-known-word checks to the basic value check (spec 03 section 7.12)
  normalizerMinScore: -0.3,   // rewrites whose provider score (length-normalized log-probability) is lower are not tried; null = no threshold (tuned on dev and the fresh batches, N1)
  valueLost: 'unknown',        // which unknown source words must survive a rewrite: 'unknown' (all words the world does not know: names, junk) or 'capitalized' (only capitalized ones)
  checkValues: true,          // a rewrite must also keep numbers, colours, negation, quoted text and the value words of the piece (src/dialog/value-check.mjs)
  validFirst: true,           // G7: a piece's best reading is a valid one even when an invalid reading of a more probable world scores higher ("new game" read by the shell, not by the game the model named)
  splitRepair: 3,             // G7: a piece nobody reads is cut into 2 (or 3, when 3) parts that the rules read, in one world; 0 = off
  mergeRepair: 2,             // G7: how many merges of two pieces cut apart inside a clause (no punctuation or connective between) are tried as extra segmentations; 0 = off
  tabTierLongWords: 8,        // ADR-004 tier T: above this many words, a message the dispatcher cuts into several pieces needs a signal pattern in every clause
  tabTier: true,              // ADR-004 tier T: the active tab's world wins whenever its rules read the whole message completely (no catch-all), whatever the dispatcher proposes
  intersegmentContext: true,  // pieces after the first run in a session where the earlier chosen pieces were committed
};

/** Connectives that end a clause without belonging to it ("remove pears and also", "mark Rome, then"). */
const TRAILING_CONNECTIVE = /[\s,;]+(?:and then|and also|and after that|and finally|then also|also then|after that|and|then|also|plus|afterwards|finally|but)[\s,;]*$/i;

/** Words that start a continuation of the previous clause, never a command. */
const CONTINUES_CLAUSE = /^(?:it|its|this|them|those|these|he|she|they|in|on|at|to|of|for|with|from|by|near|into|onto|than|as|that|which|who|about|after|before|under|over|between|inside|around)$/i;

const clip = (s, n = 80) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

/** Score of a world candidate as a probability: values in [0,1] are probabilities, negative values are natural-log probabilities. */
export function toProb(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? Math.exp(v) : Math.min(v, 1);
}

/**
 * Tolerant normalization of a prediction record to the documented shape. Accepts `worlds` entries as
 * `{world, score}`, `{id, score}`, `[world, score]` or a bare string (rank-based score), a segmentation given as a bare
 * list of segments, a missing `segmentations` (one segmentation with the whole text, using `worlds` of the record),
 * `p` or `prob` for `score`, `logprob` for the segmentation score.
 */
export function normalizePrediction(pred) {
  const text = String(pred?.text ?? '');
  const ctx = pred?.context ?? {};
  const context = { tab: ctx.tab ?? null, recent_worlds: [...(ctx.recent_worlds ?? [])], session: [...(ctx.session ?? [])] };
  const normWorlds = (list) => (list ?? []).map((w, i) => {
    if (typeof w === 'string') return { world: w, score: 1 / (i + 1) };
    if (Array.isArray(w)) return { world: String(w[0]), score: toProb(w[1]) };
    return { world: String(w.world ?? w.id), score: toProb(w.score ?? w.p ?? w.prob ?? 0) };
  }).filter((w) => w.world && w.world !== 'undefined').sort((a, b) => b.score - a.score);
  const normSeg = (s) => {
    let st = Number.isInteger(s.start) ? s.start : 0;
    let en = Number.isInteger(s.end) ? s.end : text.length;
    let ptext = typeof s.text === 'string' ? s.text : text.slice(st, en);
    // a connective glued to the end of a piece ("remove pears and also") joins it to the next piece; it is never part of this piece's words
    const tail = ptext.match(TRAILING_CONNECTIVE);
    if (tail && ptext.slice(0, tail.index).trim()) { ptext = ptext.slice(0, tail.index); if (en - st >= ptext.length) en = st + ptext.length; }
    const piece = { start: st, end: en, text: ptext, worlds: normWorlds(s.worlds ?? s.candidates) };
    if (typeof s.simplified === 'string' && s.simplified.trim() && s.simplified.trim() !== piece.text.trim()) piece.simplified = s.simplified.trim();
    return piece;
  };
  let raw = pred?.segmentations;
  if (!Array.isArray(raw) || !raw.length) raw = [{ score: 0, segments: [{ start: 0, end: text.length, text, worlds: pred?.worlds ?? [] }] }];
  const segmentations = raw.map((g, i) => {
    const segs = Array.isArray(g) ? g : (g.segments ?? []);
    const score = Array.isArray(g) ? 0 : (g.score ?? g.logprob ?? 0);
    return { index: i, score: Number.isFinite(Number(score)) ? Number(score) : 0, segments: segs.map(normSeg) };
  });
  return { id: pred?.id ?? null, text, context, segmentations, gold: pred?.gold };
}

/**
 * Create a validator bound to a dialog engine (`createEngine` result). The engine must hold all worlds the dispatcher can name.
 * Holds a cache of candidate checks (keyed by context, committed earlier pieces, world and text); `clearCache()` empties it.
 */
export function createDispatchValidator({ engine, policy = {}, normalizer = null } = {}) {
  const base = { ...DEFAULT_POLICY, ...policy };
  const restricted = new Map();
  let cache = new Map();
  const normCache = new Map();
  let normStamp;
  const toRewrites = (out, beam) => (Array.isArray(out) ? out : []).map((x) => (typeof x === 'string' ? { text: x.trim(), score: null } : { text: String(x?.text ?? '').trim(), score: Number.isFinite(x?.score) ? x.score : null })).filter((x) => x.text).slice(0, beam);
  /**
   * Rewrites of `text` for `world` from the injected provider (a bare function or `{ propose({ world, tab, text, beam }), stamp? }`).
   * The provider answers either an array of rewrites (status ready) or `{ status: 'not_ready' | 'error' | 'ready', rewrites }`.
   * Only `ready` answers are memoized: an empty list returned while the model loads, or after an error, must not stick. A provider may expose
   * `stamp` (a string or a function: model version and state); when it changes the memo is dropped, so a rewrite computed by an older model is never reused.
   * Returns { status, rewrites }.
   */
  const proposeRewrites = async (world, tab, text, beam) => {
    budget.tick('dispatch.rewrite');
    const stamp = typeof normalizer?.stamp === 'function' ? normalizer.stamp() : normalizer?.stamp;
    if (stamp !== normStamp) { normCache.clear(); normStamp = stamp; }
    const key = JSON.stringify([world, tab, text, beam]);
    if (normCache.has(key)) return { status: 'ready', rewrites: normCache.get(key) };
    let out;
    try { out = await perf.time('normalizer', () => guard.abortable((typeof normalizer === 'function' ? normalizer : normalizer.propose)({ world, tab, text, beam }), 'normalizer')); } catch (e) { guard.modelTimeout('normalizer', e); return { status: 'error', rewrites: [] }; }
    const status = Array.isArray(out) || out == null ? 'ready' : out.status === 'not_ready' || out.status === 'error' ? out.status : 'ready';
    if (status !== 'ready') return { status, rewrites: [] };
    const rewrites = toRewrites(Array.isArray(out) ? out : out?.rewrites, beam);
    normCache.set(key, rewrites);
    return { status: 'ready', rewrites };
  };

  /** A view of the world set with only the given worlds and their imports (own memo cache; legends shared). */
  const view = (worlds) => {
    const key = [...worlds].sort().join('|');
    if (!restricted.has(key)) {
      const set = engine.set;
      const ids = [...new Set(worlds.flatMap((w) => (set.get(w) ? set.available(w) : [])))];
      const sub = Object.create(set);
      sub._cache = new Map();
      sub.list = () => ids.map((i) => set.get(i));
      restricted.set(key, { set: sub, ids });
    }
    return restricted.get(key);
  };

  /** Fresh dialog session seeded as the dataset records are: tab, recent worlds, then the earlier messages. */
  // The seeded session of a context is built once (replaying the earlier messages is the expensive part) and every check works on a copy.
  let templates = new Map();
  const seed = (context) => perf.time('seed', async () => {
    const key = JSON.stringify(context);
    let t = templates.get(key);
    if (!t) {
      t = { s: await seedRun(context), fork: true };
      if (templates.size >= 8) templates.clear();
      templates.set(key, t);
    }
    if (t.fork) { try { return t.s.forkForValidation(); } catch { t.fork = false; } }
    return seedRun(context);   // the state cannot be cloned: replay as before
  });
  const seedRun = async (context) => {
    const s = engine.createSession({ language: 'en' });   // replayed messages are English already: no language detection (the browser detector is async and slow)
    if (context.tab) s.setWorldState('ui.shell', { activeTab: context.tab });
    if (context.recent_worlds.length) s._recentWorlds = [...context.recent_worlds];
    for (const m of context.session) { perf.count('seed.replay'); await s.send(m); }
    // RP5c: replaying earlier turns moves the tab (a drawing turn follows its tab, an open-tab command opens one); the message being
    // validated is read on the tab the user is on NOW, exactly as a tab click or command left it (routing tier T)
    if (context.tab && s.isession.state['ui.shell']?.activeTab !== context.tab) s.setWorldState('ui.shell', { activeTab: context.tab });
    return s;
  };

  /**
   * Formalize `text` in `session` with the rules of `worlds` only, commit the parsed wires and run the interpreter on them.
   * Mutates the session (that is the point: the next piece sees what this one said).
   */
  const apply = (session, worlds, text, source, useInterpreter) => {
    const { set, ids } = view(worlds);
    const res = perf.timeSync('check.formalize', () => formalize(text, { worlds: set, session: session.isession, source, context: session.context(), router: engine.router }));
    const parsed = res.segments.filter((x) => !x.unparsed);
    const unparsed = res.segments.length - parsed.length;
    const wires = parsed.flatMap((x) => x.wires);
    const rec = { unparsed, parsed: parsed.length, wires, matchedWorlds: [...new Set(parsed.map((x) => x.match?.worldId).filter(Boolean))], ids, statuses: [], notes: [], reasons: [] };
    if (parsed.length) {
      for (const seg of parsed) {
        session.isession.add(seg.wires);
        for (const w of seg.wires) {
          if (!useInterpreter) continue;
          try {
            const r = engine.interp.resolve(session.isession, w);
            if (r) { rec.statuses.push(r.status);
              // an operation that names a thing it does not know ("I do not see tempo in the chart", status missing) marks a weak reading too, whatever its status
              if (r.status === 'missing' && r.envelope?.reason === 'unknown_argument') { rec.notes.push(`missing: ${r.envelope?.note ?? ''}`.trim()); rec.reasons.push('unknown_argument'); }
              if (r.status === 'unsupported' || r.status === 'error') { rec.notes.push(`${r.status}: ${r.envelope?.note ?? ''}`.trim()); rec.reasons.push(r.envelope?.reason ?? (r.status === 'error' ? 'execution_error' : 'unsupported_operation')); } }
          } catch (e) { rec.statuses.push('error'); rec.reasons.push('execution_error'); rec.notes.push(`error: ${e.message}`); }
        }
      }
    }
    rec.parsedOk = unparsed === 0 && parsed.length > 0;
    // F5 reasons: execution_error is a bug (never a valid reading); unknown_argument is a weak reading (recovery first); the rest is a refusal of a right reading
    rec.execError = rec.reasons.includes('execution_error');
    rec.unknownArg = !rec.execError && rec.reasons.includes('unknown_argument');
    const refusedAny = rec.reasons.length > 0 && !rec.execError && !rec.unknownArg;
    rec.refused = rec.parsedOk && refusedAny;
    rec.partialRefused = refusedAny;
    rec.kinds = parsed.map((x) => x.match?.kind).filter(Boolean);
    const len = (x) => Math.max(0, x.span[1] - x.span[0]);
    const all = res.segments.reduce((n, x) => n + len(x), 0) || 1;
    rec.coverage = parsed.reduce((n, x) => n + len(x), 0) / all;
    rec.ignored = res.segments.filter((x) => x.unparsed).map((x) => ({ text: x.text, start: x.span[0], end: x.span[1] }));
    rec.valid = rec.parsedOk && !rec.refused && !rec.execError && !rec.unknownArg;
    // "your" addresses the avatar (spec 03, COMPUTE-BUDGET C): another world's reading of a "your ..." target is no valid candidate while ui.avatar exists
    if (rec.valid && engine.set.get('ui.avatar') && parsed.some((x) => x.match?.worldId !== 'ui.avatar' && youTarget(x.match))) { rec.valid = false; rec.avatarTarget = true; }
    rec.reason = rec.avatarTarget ? 'a "your ..." target belongs to the avatar' : rec.valid ? 'parsed completely, interpreter ok'
      : parsed.length === 0 ? 'no pattern of the world parses the text'
      : unparsed > 0 ? `${unparsed} of ${res.segments.length} segment(s) not parsed`
      : `interpreter (${rec.reasons[0] ?? 'unsupported'}): ${rec.notes[0] ?? 'unsupported'}`;
    return rec;
  };

  /** Check one (world, text) candidate after the committed prefix; cached. */
  const check = async (context, prefix, world, text, opts) => {
    const key = JSON.stringify([context, prefix, world, text, opts.useInterpreter]);
    if (cache.has(key)) return cache.get(key);
    perf.count('check');
    const s = await seed(context);
    prefix.forEach((p, i) => { try { apply(s, [p.world], p.text, `p${i}`, opts.useInterpreter); } catch { /* an earlier piece that threw is skipped */ } });
    let rec;
    try { rec = apply(s, [world], text, 'cand', opts.useInterpreter); }
    catch (e) { rec = { unparsed: 1, parsed: 0, wires: [], matchedWorlds: [], statuses: [], notes: [e.message], valid: false, reason: `exception: ${e.message}`, coverage: 0, ignored: [] }; }
    const out = { valid: rec.valid, refused: !!rec.refused, refusal: rec.reasons?.[0] ?? null, unknownArg: !!rec.unknownArg, execError: !!rec.execError, reason: rec.reason, unparsed: rec.unparsed, parsed: rec.parsed, wires: rec.wires, matchedWorlds: rec.matchedWorlds, statuses: rec.statuses,
      partialRefused: !!rec.partialRefused, coverage: rec.coverage ?? 0, ignored: rec.ignored ?? [], kinds: rec.kinds ?? [] };
    cache.set(key, out);
    return out;
  };

  /** Routing-policy tie-break: formalize `text` with the rules of the tied worlds together and see which world the router picks. */
  const tieBreak = async (context, prefix, worlds, text, useInterpreter) => {
    const s = await seed(context);
    prefix.forEach((p, i) => { try { apply(s, [p.world], p.text, `p${i}`, useInterpreter); } catch { /* skip */ } });
    const { set } = view(worlds);
    const res = formalize(text, { worlds: set, session: s.isession, source: 'tie', context: s.context(), router: engine.router });
    const seg = res.segments.find((x) => !x.unparsed && x.match);
    const mw = seg?.match.worldId;
    return seg ? { world: worlds.find((w) => w === mw) ?? worlds.find((w) => view([w]).ids.includes(mw)) ?? null, decision: seg.routing } : null;
  };

  /**
   * Validity class of a segmentation (spec 03 section 7.13): 0 = every piece read completely from the original or spell-corrected text;
   * 1 = complete, but some piece needed generated text (simplified or normalizer); 2 = complete only through partial understanding or a
   * weak fallback reading; 3 = some piece is not read at all, or two pieces are cut apart inside a clause (no punctuation or connective) and a neighbour is not a clean top-ranked original reading (weak cut). Selection is lexicographic: lower class first, scores only order within a class.
   */
  const DELIMITED = /[.,;:!?\n]|\b(and|then|also|but|or|next)\b/i;
  /** A cut inside a clause (no punctuation or connective between two pieces) is only believed when both neighbours are read cleanly: top-ranked world, original text. */
  const weakCut = (pieces, text) => pieces.some((p, i) => {
    if (i === 0) return false;
    const q = pieces[i - 1];
    if (DELIMITED.test(text.slice(q.end, p.start)) || DELIMITED.test(q.text.slice(-1)) || /^(and|then|also|but|or|next)\b/i.test(p.text)) return false;
    const clean = (x) => x.chosen.rank === 1 && x.chosen.variant === 'original';
    return !(clean(q) && clean(p));
  });
  const tierOf = (pieces, text = '') => {
    if (!pieces.length || pieces.some((p) => !p.valid) || weakCut(pieces, text)) return 3;
    if (pieces.some((p) => p.chosen.partial || p.chosen.variant === 'partial' || p.chosen.fallback)) return 2;
    if (pieces.some((p) => p.chosen.variant === 'simplified' || p.chosen.variant === 'normalized')) return 1;
    return 0;
  };

  /** Evaluate every piece of one segmentation (all candidates, no early exit) and pick each piece's best candidate. */
  const evalSegmentation = async (pred, seg, o, useNormalizer = true) => {
    budget.tick('dispatch.segmentation');
    const prefix = [];
    const pieces = [];
    let total = o.segWeight * seg.score;
    for (const [pi, piece] of seg.segments.entries()) {
      const attempts = [];
      let normalizerStatus = null;   // not_ready | error when the normalizer could not answer for this piece (trace only)
      const worlds = piece.worlds.slice(0, o.maxWorlds);
      const ctxPrefix = o.intersegmentContext ? prefix : [];
      const logpOf = (w) => Math.log(Math.max(w.score, o.scoreFloor));
      const accepts = (r) => r.valid || (o.acceptRefused && r.refused);   // unknown_argument / execution_error readings never count here (F5)
      const rpen = (r) => (r.valid ? 0 : r.unknownArg ? o.unknownArgPenalty : r.refused && o.acceptRefused ? o.interpreterPenalty : o.unparsedPenalty);
      const spelled = new Map();   // world -> { text, corrections } (spec 03 section 7.9)
      const refs = [];             // attempts with their check records, for the partial pass
      // full parses: per world, original -> spell-corrected -> simplified
      for (const [rank, w] of worlds.entries()) {
        if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
        const variants = [{ kind: 'original', text: piece.text, corrections: [] }];
        if (o.trySpell) {
          let sp = null;
          try { sp = spellCorrect(piece.text, { vocab: worldVocabulary(engine.set, w.world), protect: protectedWordsOf(engine.set, pred.context?.tab) }); } catch { sp = null; }
          spelled.set(w.world, sp);
          if (sp?.corrections.length) variants.push({ kind: 'spell', text: sp.text, corrections: sp.corrections });
        }
        for (const v of variants) {
          if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
          const r = await check(pred.context, ctxPrefix, w.world, v.text, o);
          const score = o.worldWeight * logpOf(w) - (v.kind === 'simplified' ? o.simplifiedPenalty : 0) - o.spellPenalty * v.corrections.length
            - rpen(r);
          const at = { world: w.world, rank: rank + 1, worldScore: w.score, variant: v.kind, text: v.text, valid: accepts(r), refused: r.refused, refusal: r.refusal, unknownArg: r.unknownArg, reason: r.reason, unparsed: r.unparsed, matchedWorlds: r.matchedWorlds, statuses: r.statuses, score, wires: r.wires, corrections: v.corrections, partial: null };
          attempts.push(at); refs.push([at, r, w]);
        }
      }
      // simplified text of the edit-tag head (spec 03 sections 7.8 and 7.12): lexicographic preference, tried only when no original or spell-corrected reading validates in any candidate world, and only if the values survive
      if (o.trySimplified && piece.simplified && !attempts.some((a) => a.valid)) {
        for (const [rank, w] of worlds.entries()) {
          if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
          const vocab = worldVocabulary(engine.set, w.world);
          const vc = o.checkValues ? checkValues(piece.text, piece.simplified, { vocab, lost: o.valueLost, ...(o.valueStrictness === 'strict' ? { polarity: true, grounded: true, keepKnown: true } : {}) }) : { ok: true };
          if (!vc.ok) {
            attempts.push({ world: w.world, rank: rank + 1, worldScore: w.score, variant: 'simplified', text: piece.simplified, valid: false, refused: false, reason: `value check: ${vc.reason}`, unparsed: 0, matchedWorlds: [], statuses: [], score: o.worldWeight * logpOf(w) - o.unparsedPenalty, wires: [], corrections: [], partial: null });
            continue;
          }
          const r = await check(pred.context, ctxPrefix, w.world, piece.simplified, o);
          const score = o.worldWeight * logpOf(w) - o.simplifiedPenalty - (r.valid ? 0 : r.refused && o.acceptRefused ? o.interpreterPenalty : o.unparsedPenalty);
          const at = { world: w.world, rank: rank + 1, worldScore: w.score, variant: 'simplified', text: piece.simplified, valid: accepts(r), refused: r.refused, reason: r.reason, unparsed: r.unparsed, matchedWorlds: r.matchedWorlds, statuses: r.statuses, score, wires: r.wires, corrections: [], partial: null };
          attempts.push(at); refs.push([at, r, w]);
        }
      }
      // normalizer (spec 03 section 7.12): only when nothing validates yet; the first rewrite that the rules read AND whose values are preserved wins
      if (useNormalizer && normalizer && o.tryNormalizer && seg.index < o.normalizerSegmentations && !attempts.some((a) => a.valid)) {
        for (const [rank, w] of worlds.entries()) {
          if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
          if (rank >= o.normalizerWorlds) break;
          const vocab = worldVocabulary(engine.set, w.world);
          const proposed = await proposeRewrites(w.world, pred.context.tab, piece.text, o.normalizerBeam);
          if (proposed.status !== 'ready') { normalizerStatus = proposed.status; break; }   // loading or failed: the rules answer, nothing is remembered
          for (const { text, score: nzScore } of proposed.rewrites) {
            if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
            if (text === piece.text.trim()) continue;
            if (o.normalizerMinScore != null && nzScore != null && nzScore < o.normalizerMinScore) continue;
            const vc = o.checkValues ? checkValues(piece.text, text, { vocab, lost: o.valueLost, ...(o.valueStrictness === 'strict' ? { polarity: true, grounded: true, keepKnown: true } : {}) }) : { ok: true };
            if (!vc.ok) {
              attempts.push({ world: w.world, rank: rank + 1, worldScore: w.score, variant: 'normalized', text, valid: false, refused: false, reason: `value check: ${vc.reason}`, unparsed: 0, matchedWorlds: [], statuses: [], score: o.worldWeight * logpOf(w) - o.unparsedPenalty, wires: [], corrections: [], partial: null });
              continue;
            }
            const r = await check(pred.context, ctxPrefix, w.world, text, o);
            const score = o.worldWeight * logpOf(w) - o.normalizerPenalty - (r.valid ? 0 : r.refused && o.acceptRefused ? o.interpreterPenalty : o.unparsedPenalty);
            const at = { world: w.world, rank: rank + 1, worldScore: w.score, variant: 'normalized', text, valid: accepts(r), refused: r.refused, reason: r.reason, unparsed: r.unparsed, matchedWorlds: r.matchedWorlds, statuses: r.statuses, score, wires: r.wires, corrections: [], partial: null };
            attempts.push(at);
            if (at.valid) break;
          }
        }
      }
      // second chance: one known word changed to a close neighbour ("yes" -> "eyes"); only when nothing parses yet, kept only if the rules parse it
      if (o.trySpell && !attempts.some((a) => a.valid)) {
        for (const [rank, w] of worlds.entries()) {
          if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
          let alts = [];
          try { alts = spellAlternates(piece.text, { vocab: worldVocabulary(engine.set, w.world), protect: protectedWordsOf(engine.set, pred.context?.tab) }); } catch { alts = []; }
          for (const v of alts) {
            if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
            const r = await check(pred.context, ctxPrefix, w.world, v.text, o);
            const score = o.worldWeight * logpOf(w) - o.spellPenalty * 2 - rpen(r);
            const at = { world: w.world, rank: rank + 1, worldScore: w.score, variant: 'spell', text: v.text, valid: accepts(r), refused: r.refused, refusal: r.refusal, unknownArg: r.unknownArg, reason: r.reason, unparsed: r.unparsed, matchedWorlds: r.matchedWorlds, statuses: r.statuses, score, wires: r.wires, corrections: v.corrections, partial: null };
            if (at.valid || (o.acceptPartial && r.parsed && r.unparsed)) { attempts.push(at); refs.push([at, r, w]); }
          }
        }
      }
      // partial parses (only when no candidate parses completely): first the clauses the rules read, then the longest run of words they read
      if (o.acceptPartial && !attempts.some((a) => a.valid)) {
        const partialScore = (w, corr, coverage) => o.worldWeight * logpOf(w) - o.spellPenalty * corr.length - o.partialPenalty - o.partialUncoveredPenalty * (1 - coverage);
        for (const [at, r, w] of refs) {
          if (at.variant === 'simplified' || at.variant === 'normalized' || !r.parsed || !r.unparsed || r.coverage < o.minCoverage || (r.partialRefused && !o.acceptRefused)) continue;
          attempts.push({ ...at, variant: 'partial', baseVariant: at.variant, valid: true, reason: `partial: ${Math.round(r.coverage * 100)}% understood`, score: partialScore(w, at.corrections, r.coverage), partial: { ignored: r.ignored, coverage: r.coverage, window: false } });
        }
        if (!attempts.some((a) => a.valid)) {
          for (const [rank, w] of worlds.entries()) {
            if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
            const sp = spelled.get(w.world);
            const bases = sp?.corrections.length ? [{ text: sp.text, corrections: sp.corrections }, { text: piece.text, corrections: [] }] : [{ text: piece.text, corrections: [] }];
            for (const base of bases) {
              if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
              const win = await findPartialWindow(base.text, async (slice) => { const r = await check(pred.context, ctxPrefix, w.world, slice, o); return accepts(r) && !changesIntoQuestion(base.text, slice, r.kinds) ? r : null; }, { minCoverage: o.minCoverage, canIgnore: ignorable(worldVocabulary(engine.set, w.world), spellVocabulary(engine.set)) });
              if (!win) continue;
              const r = win.result;
              attempts.push({ world: w.world, rank: rank + 1, worldScore: w.score, variant: 'partial', baseVariant: base.corrections.length ? 'spell' : 'original', text: win.text, valid: true, refused: r.refused, reason: `partial: ${Math.round(win.coverage * 100)}% understood`, unparsed: 0, matchedWorlds: r.matchedWorlds, statuses: r.statuses,
                score: partialScore(w, base.corrections, win.coverage) - (r.valid ? 0 : o.interpreterPenalty), wires: r.wires, corrections: base.corrections, partial: { ignored: win.ignored, coverage: win.coverage, window: true } });
              break;
            }
          }
        }
      }
      // F5: nothing validated, so an unknown_argument reading (already penalised) is better than no reading; it never blocked the stages above
      if (!attempts.some((a) => a.valid)) {
        for (const a of attempts) if (a.unknownArg && a.unparsed === 0) { a.valid = true; a.fallback = true; }
      }
      // best attempt: highest score; ties (within tieEps) between different worlds go to the routing policy
      let best = null;
      const order = [...attempts].sort((a, b) => (o.validFirst ? Number(!!b.valid) - Number(!!a.valid) : 0) || b.score - a.score || a.rank - b.rank || (a.variant === 'original' ? -1 : 1));
      best = order[0] ?? null;
      let tie = null;
      if (best?.valid) {
        const tied = order.filter((a) => a.valid && Math.abs(a.score - best.score) <= o.tieEps && a.text === best.text);
        const tw = [...new Set(tied.map((a) => a.world))];
        if (tw.length > 1) {
          const t = await tieBreak(pred.context, o.intersegmentContext ? prefix : [], tw, best.text, o.useInterpreter);
          tie = { worlds: tw, winner: t?.world ?? null, decision: t?.decision ? { tier: t.decision.tier, tierName: t.decision.tierName, reason: t.decision.reason } : null };
          if (t?.world) best = tied.find((a) => a.world === t.world) ?? best;
        }
      }
      const pieceScore = best ? best.score : -o.unparsedPenalty + Math.log(o.scoreFloor);
      total += pieceScore;
      if (best?.valid) prefix.push({ world: best.world, text: best.text });
      pieces.push({ index: pi, start: piece.start, end: piece.end, text: piece.text, simplified: piece.simplified ?? null, ...(normalizerStatus ? { normalizerStatus } : {}), attempts: attempts.map(({ wires, ...a }) => ({ ...a, wires: wires.length })),
        chosen: best ? { world: best.world, rank: best.rank, variant: best.variant, text: best.text, valid: best.valid, fallback: !!best.fallback, score: best.score, wires: best.wires, corrections: best.corrections, partial: best.partial } : null, valid: !!best?.valid, tie });
    }
    // a split repair was read part by part by the rules: the weak-cut class (3) does not apply to it
    const tier = seg.split && pieces.every((p) => p.valid) ? Math.min(2, tierOf(pieces, pred.text)) : tierOf(pieces, pred.text);
    return { index: seg.index, dispatcherScore: seg.score, score: total, tier, valid: pieces.length > 0 && pieces.every((p) => p.valid), nInvalid: pieces.filter((p) => !p.valid).length, pieces };
  };

  /**
   * ADR-004 tier T (tab first): when the active tab's world reads the whole message completely in the rule router's own order (every clause parsed, every
   * winning match of the tab world, none a catch-all, the interpreter accepts), the dispatcher's candidates are not consulted. Returns a one-piece
   * segmentation for the tab world, or null.
   */
  const tabFirst = async (pred, o) => {
    const text = pred.text.trim();
    if (!o.tabTier || !pred.context.tab || !text) return null;
    // TIER-T-LONG: when the dispatcher's best segmentation cuts the message into several pieces, it is a multi-command message; tier T then needs
    // an explicit signal of the world in every clause (below), otherwise a tab pattern that swallows the whole text would hide the segmentation.
    // Only for long messages that are not running text: a short message cut by the dispatcher by mistake ("delete the last word"), or sentences
    // dictated to the editor ("write It was cold. The fox ..."), stay with the tab's world.
    const dispatcherSplits = (pred.segmentations[0]?.segments.length ?? 0) > 1 && text.split(/\s+/).length > o.tabTierLongWords && !/[.!?]\s+\S/.test(text);
    const s = await seed(pred.context);
    const ctx = s.context();
    const tw = ctx.tabWorld;
    if (!tw || !engine.set.get(tw) || ctx.modalWorld) return null;
    const res = formalize(text, { worlds: engine.set, session: s.isession, source: 'tabtier', context: ctx, router: engine.router });
    if (res.segments.length < 1 || res.segments.some((x) => x.unparsed || !x.match)) return null;
    // several clauses: every clause must be read by the tab world itself (a clause of another world, or a catch-all, leaves the decision to the dispatcher)
    // and by a pattern that carries an explicit signal of the world (a named shape, an arrow between names, a diagram form): the catch-alls of a world (charts: 'how many ...') read half of any message
    if ((res.segments.length > 1 || dispatcherSplits) && res.segments.some((x) => x.match.worldId !== tw || !engine.set.get(tw).patterns.find((p) => p.id === x.match.patternId)?.signal)) return null;
    const ids = view([tw]).ids;
    if (res.segments.some((x) => !ids.includes(x.match.worldId) || x.match.worldId === 'ui.shell' || wildTokens(x.match) > x.match.literals)) return null;
    const r = await check(pred.context, [], tw, text, o);
    if (!r.valid) return null;
    const start = pred.text.indexOf(text);
    return { index: 0, score: 0, tabTier: true, segments: [{ start, end: start + text.length, text, worlds: [{ world: tw, score: 1 }] }] };
  };

  /**
   * `whole=true` patterns (COMPUTE-BUDGET C, spec 03 routing keys): when the dispatcher cuts the message into several pieces but the rules read the whole
   * message as ONE segment with such a pattern ("I like chess, music and maps" is one statement, not "I like chess", "music", "maps"), that reading stands.
   */
  const wholeFirst = async (pred, o) => {
    const text = pred.text.trim();
    if (!text || (pred.segmentations[0]?.segments.length ?? 0) < 2) return null;
    if (!engine.set.list().some((w) => w.patterns.some((p) => p.whole))) return null;
    const s = await seed(pred.context);
    const res = formalize(text, { worlds: engine.set, session: s.isession, source: 'whole', context: s.context(), router: engine.router });
    if (res.segments.length !== 1 || res.segments[0].unparsed || !res.segments[0].match) return null;
    const m = res.segments[0].match;
    if (!engine.set.get(m.worldId)?.patterns.find((p) => p.id === m.patternId)?.whole) return null;
    const r = await check(pred.context, [], m.worldId, text, o);
    if (!r.valid) return null;
    const start = pred.text.indexOf(text);
    return { index: 0, score: 0, whole: true, segments: [{ start, end: start + text.length, text, worlds: [{ world: m.worldId, score: 1 }] }] };
  };

  /** Validate one prediction. `override` replaces policy fields for this call only. */
  const validate = async (prediction, override = {}) => {
    const o = { ...base, ...override };
    const pred = normalizePrediction(prediction);
    let segs = pred.segmentations.slice(0, o.maxSegmentations);
    const evals = [];
    const tabSeg = (await tabFirst(pred, o)) ?? (await wholeFirst(pred, o));
    if (tabSeg) {
      const ev = await evalSegmentation(pred, tabSeg, o, false);
      if (ev.valid && ev.tier === 0) { ev.tabTier = true; segs = [tabSeg]; evals.push(ev); }
    }
    // phase 1: every segmentation without the normalizer; the normalizer only runs on residue that no segmentation reads completely (spec 03 section 7.13)
    if (!evals.length) for (const seg of segs) evals.push(await evalSegmentation(pred, seg, o, false));
    if (normalizer && o.tryNormalizer && evals.every((e) => e.tier > 1)) {
      for (const [i, seg] of segs.entries()) if (seg.index < o.normalizerSegmentations) evals[i] = await evalSegmentation(pred, seg, o, true);
    }
    // merge repair (G7): two pieces cut apart inside a clause ("play hangman word" | "lion") are also tried as one piece; the tier and the score then decide
    const lead = [...evals].sort((a, b) => a.tier - b.tier || b.score - a.score || a.index - b.index)[0];
    if (o.mergeRepair && lead && segs[lead.index]) {
      const top = segs[lead.index];
      let tried = 0;
      for (let i = 0; i + 1 < top.segments.length && tried < o.mergeRepair; i++) {
        if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
        const a = top.segments[i], b = top.segments[i + 1];
        const gap = pred.text.slice(a.end, b.start);
        if (DELIMITED.test(gap) || DELIMITED.test(a.text.slice(-1)) || /^(and|then|also|but|or|next)\b/i.test(b.text)) continue;
        if (b.text.trim().split(/\s+/).length > 2) continue;   // only a short fragment is an argument cut off its command; a longer piece is a command of its own ("add a paragraph hello world")
        const seen = new Map();
        for (const w of [...a.worlds, ...b.worlds]) if (!seen.has(w.world) || seen.get(w.world).score < w.score) seen.set(w.world, w);
        const merged = { start: a.start, end: b.end, text: pred.text.slice(a.start, b.end), worlds: [...seen.values()].sort((x, y) => y.score - x.score) };
        const variant = { index: evals.length, score: lead.dispatcherScore ?? top.score, segments: [...top.segments.slice(0, i), merged, ...top.segments.slice(i + 2)], merged: true };
        const ev = await evalSegmentation(pred, variant, o, false);
        if (ev.valid) evals.push(ev);   // a repair only counts when every piece is read
        tried++;
      }
    }
    // split repair (G7): a piece nobody reads that is a run of commands without separators ("new game center top left") is cut into the fewest parts
    // that the rules read, all in the same candidate world; the result competes as one more segmentation
    const lead2 = [...evals].sort((a, b) => a.tier - b.tier || b.score - a.score || a.index - b.index)[0];
    if (o.splitRepair && lead2 && lead2.tier >= 3 && lead2.pieces.some((p) => !p.valid) && segs[lead2.index > segs.length - 1 ? 0 : lead2.index]) {
      const baseSeg = lead2.index < segs.length ? segs[lead2.index] : { ...segs[0], segments: lead2.pieces.map((p) => ({ start: p.start, end: p.end, text: p.text, worlds: segs[0].segments.find((q) => q.start <= p.start && q.end >= p.end)?.worlds ?? [] })) };
      const bad = lead2.pieces.findIndex((p) => !p.valid);
      const piece0 = baseSeg.segments[bad];
      // candidate worlds of the parts: the piece's own, then those the model named for pieces of the other segmentations that overlap it (the shell reads "new game")
      const pool = new Map();
      for (const w of piece0?.worlds ?? []) pool.set(w.world, w);
      for (const g of segs) for (const q of g.segments) if (piece0 && q.start < piece0.end && q.end > piece0.start) for (const w of q.worlds) if (!pool.has(w.world)) pool.set(w.world, w);
      const piece = piece0 && { ...piece0, worlds: [...pool.values()] };
      const words = [...String(piece?.text ?? '').matchAll(/\S+/g)].map((m) => ({ s: m.index, e: m.index + m[0].length }));
      if (piece && words.length >= 2 && words.length <= 9 && !/[,;]/.test(piece.text)) {
        const okPart = async (w, text) => { const r = await check(pred.context, [], w, text, o); return r.valid || (o.acceptRefused && r.refused); };
        const partText = (a, b) => piece.text.slice(words[a].s, words[b].e);
        let found = null;
        const cutSets = [];
        for (let i = 1; i < words.length; i++) cutSets.push([i]);
        if (o.splitRepair >= 3) for (let i = 1; i < words.length; i++) for (let j = i + 1; j < words.length; j++) cutSets.push([i, j]);
        for (const cs of cutSets) {
          if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
          const bounds = [0, ...cs, words.length];
          const parts = bounds.slice(0, -1).map((b, k) => [b, bounds[k + 1] - 1]);
          // a part that starts with a preposition continues the clause before it ("what time is it" | "in London right now"), it is no command of its own
          if (parts.slice(1).some(([a]) => CONTINUES_CLAUSE.test(piece.text.slice(words[a].s, words[a].e)))) continue;
          const withWorld = [];
          for (const [a, b] of parts) {
            if (guard.soft()) break;   // turn guard: out of time, keep the best reading found so far
            let hit = null;
            for (const w of piece.worlds.slice(0, 6)) if (await okPart(w.world, partText(a, b))) { hit = w; break; }
            if (!hit) break;
            withWorld.push([a, b, hit]);
          }
          if (withWorld.length === parts.length) {
            // prefer the cut in which most parts are read by the world the model named for the piece (a fragment read by another world is the weaker reading)
            const own = withWorld.filter(([, , h]) => h.world === piece.worlds[0].world).length;
            if (!found || own > found.own) found = { parts: withWorld, own };
          }
        }
        if (found) {
          const pieces2 = found.parts.map(([a, b, hit]) => ({ start: piece.start + words[a].s, end: piece.start + words[b].e, text: partText(a, b), worlds: [hit, ...piece.worlds.filter((x) => x.world !== hit.world)] }));
          const variant = { index: evals.length, score: lead2.dispatcherScore ?? baseSeg.score, segments: [...baseSeg.segments.slice(0, bad), ...pieces2, ...baseSeg.segments.slice(bad + 1)], split: true };
          const ev = await evalSegmentation(pred, variant, o, false);
          if (ev.valid) evals.push(ev);
        }
      }
    }
    // winner: lowest validity class first (complete before partial, original/spell before generated); within a class the best total score; ties keep the dispatcher's order
    const ranked = [...evals].sort((a, b) => a.tier - b.tier || b.score - a.score || a.index - b.index);
    const winner = ranked[0] ?? null;
    const understood = !!winner?.valid;
    const produced = winner ? winner.pieces.filter((p) => p.valid).map((p) => ({ start: p.start, end: p.end, text: p.text, world: p.chosen.world, textUsed: p.chosen.variant, usedText: p.chosen.text, corrections: p.chosen.corrections ?? [], partial: p.chosen.partial ?? null, wires: p.chosen.wires })) : [];
    const top = evals[0];
    let why;
    if (!winner) why = 'no segmentation was proposed';
    else if (!understood) {
      why = `no segmentation validates; best candidate is segmentation ${winner.index + 1} (score ${winner.score.toFixed(3)}) with ${winner.nInvalid} piece(s) the rules cannot read`;
    } else {
      const parts = [`segmentation ${winner.index + 1} of ${evals.length} wins with score ${winner.score.toFixed(3)} (dispatcher ${winner.dispatcherScore.toFixed(3)}), all ${winner.pieces.length} piece(s) validate`];
      if (winner.index !== 0) parts.push(`it beats the dispatcher's top segmentation (score ${top.score.toFixed(3)}, ${top.nInvalid} piece(s) invalid)`);
      for (const p of winner.pieces) {
        const c = p.chosen;
        if (c.rank > 1) parts.push(`piece "${clip(p.text, 40)}": candidate world ${c.rank} (${c.world}) recovered after ${p.attempts.filter((a) => a.rank < c.rank && !a.valid).map((a) => a.world).filter((x, i, arr) => arr.indexOf(x) === i).join(', ')} failed`);
        if (c.variant === 'normalized') parts.push(`piece "${clip(p.text, 40)}": read as the normalizer's rewrite "${clip(c.text, 60)}"`);
        if (c.variant === 'simplified') parts.push(`piece "${clip(p.text, 40)}": only the simplified text validates`);
        if (c.corrections?.length) parts.push(`piece "${clip(p.text, 40)}": read after correcting ${c.corrections.map((x) => `"${x.from}" to "${x.to}"`).join(', ')}`);
        if (c.partial) parts.push(`piece "${clip(p.text, 40)}": partial understanding (${Math.round(c.partial.coverage * 100)}%), ignored ${c.partial.ignored.map((x) => `"${clip(x.text, 30)}"`).join(', ')}`);
        if (p.tie) parts.push(`piece "${clip(p.text, 40)}": tie between ${p.tie.worlds.join(', ')} broken by routing policy${p.tie.decision ? ` (tier ${p.tie.decision.tier} ${p.tie.decision.tierName}: ${p.tie.decision.reason})` : ''} -> ${p.tie.winner}`);
      }
      why = parts.join('; ');
    }
    // not understood: the closest worlds for ui.help ("Did you mean ...?"), best candidate per failing piece
    let notUnderstood = null;
    if (!understood && winner) {
      const bad = winner.pieces.filter((p) => !p.valid);
      notUnderstood = {
        pieces: bad.map((p) => ({ start: p.start, end: p.end, text: p.text, candidateWorlds: [...new Set(p.attempts.map((a) => a.world))] })),
        candidateWorlds: [...new Set(bad.flatMap((p) => p.attempts.map((a) => a.world)))],
      };
    }
    const sopOf = (wires) => serialize(wires.filter((w) => w.type !== 'core.agent'));
    return {
      id: pred.id, text: pred.text, status: understood ? 'understood' : 'not_understood', partial: produced.some((p) => p.partial),
      winner: winner ? { index: winner.index, score: winner.score } : null,
      produced: produced.map((p) => ({ ...p, sop: sopOf(p.wires) })),
      notUnderstood, why,
      trace: { policy: o, segmentations: evals.map(({ pieces, ...e }) => ({ ...e, pieces: pieces.map((p) => ({ ...p, chosen: p.chosen && { ...p.chosen, wires: p.chosen.wires.length } })) })), winnerIndex: winner?.index ?? null,
        formula: 'order: class(seg) (0 original/spell complete, 1 generated complete, 2 partial, 3 invalid), then score(seg) = segWeight*seg.score + sum over pieces [ worldWeight*ln(max(p_world,scoreFloor)) - unparsedPenalty*(piece invalid) - simplifiedPenalty*(simplified used) ]' },
    };
  };

  return { validate, clearCache: () => { cache = new Map(); templates = new Map(); normCache.clear(); normStamp = undefined; }, policy: base, engine };
}

/** One-shot helper: `validateDispatch({ prediction, engine, policy })`. */
export function validateDispatch({ prediction, engine, policy = {}, normalizer = null }) {
  return createDispatchValidator({ engine, policy, normalizer }).validate(prediction);
}

export { FormSession };
