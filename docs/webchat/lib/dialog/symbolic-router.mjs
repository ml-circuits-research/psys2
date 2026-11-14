// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The routing setting `routing` (WORLD-OF-WORLDS, spec 20), browser-safe.
 *
 *   dispatcher         (router A; selectable under Settings > Developer) the encoder proposes worlds, the rules validate; the tiers of ADR-004 order the readings of the rules
 *   symbolic           (router B) meta.worlds picks the world: cards, live facts, rules with reasons; the encoder's world head is not read
 *   symbolic+encoder   (router C, the default) as B with the encoder's world probabilities as one prior (confidence-aware weight, `DEFAULT_PRIOR` in meta-worlds.mjs)
 *
 * Two seams, both small: `createSymbolicRouter` orders the candidate readings of the rule formalizer by the world ranking of meta.worlds (the router interface of
 * src/formalizer/routing.mjs), and `rerankPrediction` replaces the world proposals of the dispatcher's prediction by the ranking (the validator then checks them
 * as before). Neither changes what a world reads: they change which world is tried first and which cannot take the message.
 */
import { liveFromContext } from './meta-worlds.mjs?v=6cd5eed84f';

export const ROUTINGS = Object.freeze(['dispatcher', 'symbolic', 'symbolic+encoder']);
export const DEFAULT_ROUTING = 'symbolic+encoder';   // reviewer decision 2026-11-13 18:05: C is the default; A stays selectable (Settings > Developer)
export const normalizeRouting = (v) => (ROUTINGS.includes(v) ? v : DEFAULT_ROUTING);
export const isSymbolic = (v) => normalizeRouting(v) !== 'dispatcher';

const plainTop = (ranked, n = 3) => { const top = ranked.slice(0, n); const sum = top.reduce((a, r) => a + r.score, 0) || 1; return top.map((r) => ({ world: r.world, score: Number((r.score / sum).toFixed(4)) })); };
const reasonOf = (r) => (r ? r.reasons.slice(0, 2).map((x) => x.say).join('; ') : '');

/** The first policy tier that meta.worlds may reorder (spec 20): below it the policy's reasons are rules of the application. */
const META_FROM_TIER = 5;

const MIN_EVIDENCE = 15, MIN_MARGIN = 4;

/** A router that orders the matches of `base` (the policy router) by meta.worlds. `getMeta()` returns the loaded module or null (then `base` answers alone). */
export function createSymbolicRouter(base, getMeta) {
  return {
    id: 'meta.worlds',
    route(args = {}) {
      const r = base.route(args);
      const mw = getMeta();
      if (!mw || !r.matches.length || r.decision?.tier <= META_FROM_TIER - 1) return r;   // tiers 1 to 4 are system rules the policy keeps (modal input, tab navigation and settings, a named world, a signal, the open tab's own reading that covers the sentence, a running game, the worlds used lately); meta.worlds orders what the policy has no reason for (tier 5)
      const text = (args.tokens ?? []).map((t) => t.raw ?? t.text ?? t).join(' ');
      let res;
      try { res = mw.route({ text, live: liveFromContext(args.context ?? {}, { sceneKeys: ['thing', 'kind', 'name'] }) }); } catch { return r; }
      const candidates = new Set(r.matches.map((m) => m.pattern.worldId));
      const [first, second] = res.ranked.filter((x) => candidates.has(x.world));   // only the worlds that read the clause count: the best world of the message that cannot read it is no opinion about the ones that can
      if (!first || first.score < MIN_EVIDENCE || (second && first.score - second.score < MIN_MARGIN)) return r;   // meta.worlds has no opinion (the same bar as `decide`): the policy order stands (a clause of a longer message, "play B1" after "play tic tac toe")
      const index = new Map(res.ranked.map((x, i) => [x.world, i]));
      const rank = (m) => (res.blocked[m.pattern.worldId] ? 1e6 : index.has(m.pattern.worldId) ? index.get(m.pattern.worldId) : 1e3);
      // the policy's order inside a tier is priority, literal words, fewer wildcard tokens (how well a pattern covers the sentence): meta.worlds never overrides that,
      // it breaks the ties the policy leaves to the word-overlap score and the pattern order (a world's own, more specific reading is not moved away)
      const w0 = r.matches[0], tied = (m) => m.tier === w0.tier && m.sub === w0.sub && (m.rank ?? m.pattern.priority) === (w0.rank ?? w0.pattern.priority) && m.literals === w0.literals && m.skips === w0.skips;
      const group = r.matches.filter(tied);
      const matches = [...group.map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map((x) => x.m), ...r.matches.filter((m) => !tied(m))];
      const win = matches[0], world = win.pattern.worldId, top = res.ranked.find((x) => x.world === world);
      const runner = matches.find((m) => m.pattern.worldId !== world) ?? null;
      const decision = { ...(r.decision ?? {}), router: 'meta.worlds', tier: r.decision?.tier ?? 5, tierName: 'meta.worlds', reason: top ? `because ${reasonOf(top)}` : 'no reason of meta.worlds; the policy order', contested: !!runner,
        winner: { patternId: win.pattern.id, worldId: world, score: top?.score ?? 0 }, runnerUp: runner ? { patternId: runner.pattern.id, worldId: runner.pattern.worldId, score: res.ranked.find((x) => x.world === runner.pattern.worldId)?.score ?? 0 } : null,
        reasons: top?.reasons ?? [], blocked: res.blocked, fragment: res.fragment };
      return { matches, decision };
    },
  };
}

/**
 * The dispatcher's prediction with the world proposals of every piece replaced by the ranking of meta.worlds (top 3, as probabilities). With `useEncoder` the
 * encoder's own probabilities of the piece enter as the prior. Returns the same object, changed in place. `context` is the dialog context of the turn.
 */
export function rerankPrediction(prediction, mw, context, { useEncoder = false } = {}) {
  const live = liveFromContext(context ?? {}, { sceneKeys: ['thing', 'kind', 'name'] });
  for (const seg of prediction.segmentations ?? []) {
    for (const piece of seg.segments ?? []) {
      const prior = useEncoder ? Object.fromEntries((piece.worlds ?? []).map((w) => [w.world, w.score])) : null;
      let res;
      try { res = mw.route({ text: piece.text, live, prior }); } catch { continue; }
      piece.encoder = piece.worlds;
      if (res.ranked.length) piece.worlds = plainTop(res.ranked);
      piece.routing = { router: 'meta.worlds', reason: res.ranked[0] ? `because ${reasonOf(res.ranked[0])}` : 'no reason', blocked: Object.keys(res.blocked) };
    }
  }
  return prediction;
}
