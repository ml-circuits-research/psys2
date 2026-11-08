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
import { formalize, FormSession } from '../formalizer/index.mjs';
import { serialize } from '../soplang/index.mjs';

/** Default policy; every weight is an option. */
export const DEFAULT_POLICY = {
  maxSegmentations: 4,        // beam size actually used (the first N, most likely first)
  maxWorlds: 3,               // candidate worlds tried per piece
  trySimplified: true,        // also try `simplified` text (when present)
  useInterpreter: true,       // a candidate must also not be unsupported/error in the interpreter
  segWeight: 1.0,             // weight of the dispatcher's segmentation log-prob
  worldWeight: 1.0,           // weight of the log of the world score of a piece
  acceptRefused: false,       // a piece the rules parse completely but the interpreter refuses (unsupported/error) counts as valid
  interpreterPenalty: 3.0,    // log-units subtracted for such a piece (it is still better than an unparsed one)
  unparsedPenalty: 6.0,       // log-units subtracted for a piece that no candidate could validate (about x 0.0025)
  simplifiedPenalty: 0.05,    // log-units subtracted when the winning reading came from the simplified text
  scoreFloor: 1e-6,           // world scores are clamped to at least this probability before the log
  tieEps: 1e-6,               // piece scores closer than this are a tie, broken by the routing policy tiers
  intersegmentContext: true,  // pieces after the first run in a session where the earlier chosen pieces were committed
};

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
    const st = Number.isInteger(s.start) ? s.start : 0;
    const en = Number.isInteger(s.end) ? s.end : text.length;
    const piece = { start: st, end: en, text: typeof s.text === 'string' ? s.text : text.slice(st, en), worlds: normWorlds(s.worlds ?? s.candidates) };
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
export function createDispatchValidator({ engine, policy = {} } = {}) {
  const base = { ...DEFAULT_POLICY, ...policy };
  const restricted = new Map();
  let cache = new Map();

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
  const seed = async (context) => {
    const s = engine.createSession();
    if (context.tab) s.setWorldState('ui.shell', { activeTab: context.tab });
    if (context.recent_worlds.length) s._recentWorlds = [...context.recent_worlds];
    for (const m of context.session) await s.send(m);
    return s;
  };

  /**
   * Formalize `text` in `session` with the rules of `worlds` only, commit the parsed wires and run the interpreter on them.
   * Mutates the session (that is the point: the next piece sees what this one said).
   */
  const apply = (session, worlds, text, source, useInterpreter) => {
    const { set, ids } = view(worlds);
    const res = formalize(text, { worlds: set, session: session.isession, source, context: session.context(), router: engine.router });
    const parsed = res.segments.filter((x) => !x.unparsed);
    const unparsed = res.segments.length - parsed.length;
    const wires = parsed.flatMap((x) => x.wires);
    const rec = { unparsed, parsed: parsed.length, wires, matchedWorlds: [...new Set(parsed.map((x) => x.match?.worldId).filter(Boolean))], ids, statuses: [], notes: [] };
    if (unparsed === 0 && parsed.length) {
      for (const seg of parsed) {
        session.isession.add(seg.wires);
        for (const w of seg.wires) {
          if (!useInterpreter) continue;
          try {
            const r = engine.interp.resolve(session.isession, w);
            if (r) { rec.statuses.push(r.status); if (r.status === 'unsupported' || r.status === 'error') rec.notes.push(`${r.status}: ${r.envelope?.note ?? ''}`.trim()); }
          } catch (e) { rec.statuses.push('error'); rec.notes.push(`error: ${e.message}`); }
        }
      }
    }
    rec.parsedOk = unparsed === 0 && parsed.length > 0;
    rec.refused = rec.parsedOk && rec.statuses.some((s) => s === 'unsupported' || s === 'error');
    rec.valid = rec.parsedOk && !rec.refused;
    rec.reason = rec.valid ? 'parsed completely, interpreter ok'
      : parsed.length === 0 ? 'no pattern of the world parses the text'
      : unparsed > 0 ? `${unparsed} of ${res.segments.length} segment(s) not parsed`
      : `interpreter: ${rec.notes[0] ?? 'unsupported'}`;
    return rec;
  };

  /** Check one (world, text) candidate after the committed prefix; cached. */
  const check = async (context, prefix, world, text, opts) => {
    const key = JSON.stringify([context, prefix, world, text, opts.useInterpreter]);
    if (cache.has(key)) return cache.get(key);
    const s = await seed(context);
    prefix.forEach((p, i) => { try { apply(s, [p.world], p.text, `p${i}`, opts.useInterpreter); } catch { /* an earlier piece that threw is skipped */ } });
    let rec;
    try { rec = apply(s, [world], text, 'cand', opts.useInterpreter); }
    catch (e) { rec = { unparsed: 1, parsed: 0, wires: [], matchedWorlds: [], statuses: [], notes: [e.message], valid: false, reason: `exception: ${e.message}` }; }
    const out = { valid: rec.valid, refused: !!rec.refused, reason: rec.reason, unparsed: rec.unparsed, parsed: rec.parsed, wires: rec.wires, matchedWorlds: rec.matchedWorlds, statuses: rec.statuses };
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

  /** Evaluate every piece of one segmentation (all candidates, no early exit) and pick each piece's best candidate. */
  const evalSegmentation = async (pred, seg, o) => {
    const prefix = [];
    const pieces = [];
    let total = o.segWeight * seg.score;
    for (const [pi, piece] of seg.segments.entries()) {
      const attempts = [];
      const worlds = piece.worlds.slice(0, o.maxWorlds);
      const variants = [{ kind: 'original', text: piece.text }];
      if (o.trySimplified && piece.simplified) variants.push({ kind: 'simplified', text: piece.simplified });
      for (const [rank, w] of worlds.entries()) {
        for (const v of variants) {
          const ctxPrefix = o.intersegmentContext ? prefix : [];
          const r = await check(pred.context, ctxPrefix, w.world, v.text, o);
          const logp = Math.log(Math.max(w.score, o.scoreFloor));
          const accepted = r.valid || (o.acceptRefused && r.refused);
          const score = o.worldWeight * logp - (v.kind === 'simplified' ? o.simplifiedPenalty : 0) - (r.valid ? 0 : r.refused && o.acceptRefused ? o.interpreterPenalty : o.unparsedPenalty);
          attempts.push({ world: w.world, rank: rank + 1, worldScore: w.score, variant: v.kind, text: v.text, valid: accepted, refused: r.refused, reason: r.reason, unparsed: r.unparsed, matchedWorlds: r.matchedWorlds, statuses: r.statuses, score, wires: r.wires });
        }
      }
      // best attempt: highest score; ties (within tieEps) between different worlds go to the routing policy
      let best = null;
      const order = [...attempts].sort((a, b) => b.score - a.score || a.rank - b.rank || (a.variant === 'original' ? -1 : 1));
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
      pieces.push({ index: pi, start: piece.start, end: piece.end, text: piece.text, simplified: piece.simplified ?? null, attempts: attempts.map(({ wires, ...a }) => ({ ...a, wires: wires.length })),
        chosen: best ? { world: best.world, rank: best.rank, variant: best.variant, text: best.text, valid: best.valid, score: best.score, wires: best.wires } : null, valid: !!best?.valid, tie });
    }
    return { index: seg.index, dispatcherScore: seg.score, score: total, valid: pieces.length > 0 && pieces.every((p) => p.valid), nInvalid: pieces.filter((p) => !p.valid).length, pieces };
  };

  /** Validate one prediction. `override` replaces policy fields for this call only. */
  const validate = async (prediction, override = {}) => {
    const o = { ...base, ...override };
    const pred = normalizePrediction(prediction);
    const segs = pred.segmentations.slice(0, o.maxSegmentations);
    const evals = [];
    for (const seg of segs) evals.push(await evalSegmentation(pred, seg, o));
    // winner: best total score; ties (within tieEps) keep the dispatcher's order (most likely first)
    const ranked = [...evals].sort((a, b) => b.score - a.score || a.index - b.index);
    const winner = ranked[0] ?? null;
    const understood = !!winner?.valid;
    const produced = winner ? winner.pieces.filter((p) => p.valid).map((p) => ({ start: p.start, end: p.end, text: p.text, world: p.chosen.world, textUsed: p.chosen.variant, usedText: p.chosen.text, wires: p.chosen.wires })) : [];
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
        if (c.variant === 'simplified') parts.push(`piece "${clip(p.text, 40)}": only the simplified text validates`);
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
      id: pred.id, text: pred.text, status: understood ? 'understood' : 'not_understood',
      winner: winner ? { index: winner.index, score: winner.score } : null,
      produced: produced.map((p) => ({ ...p, sop: sopOf(p.wires) })),
      notUnderstood, why,
      trace: { policy: o, segmentations: evals.map(({ pieces, ...e }) => ({ ...e, pieces: pieces.map((p) => ({ ...p, chosen: p.chosen && { ...p.chosen, wires: p.chosen.wires.length } })) })), winnerIndex: winner?.index ?? null,
        formula: 'score(seg) = segWeight*seg.score + sum over pieces [ worldWeight*ln(max(p_world,scoreFloor)) - unparsedPenalty*(piece invalid) - simplifiedPenalty*(simplified used) ]' },
    };
  };

  return { validate, clearCache: () => { cache = new Map(); }, policy: base, engine };
}

/** One-shot helper: `validateDispatch({ prediction, engine, policy })`. */
export function validateDispatch({ prediction, engine, policy = {} }) {
  return createDispatchValidator({ engine, policy }).validate(prediction);
}

export { FormSession };
