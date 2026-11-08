/**
 * The learned-dispatcher formalizer strategy (spec 06 "Formalizer strategies", spec 03 section 7). Browser-safe: no `node:*` imports.
 *
 * `createDispatcherFormalizer({ load })` returns a strategy `{ id: 'encoder', ... }` (same interface as the rules formalizer) that
 *   1. runs the dispatcher model (segmentation + top-3 worlds per piece; src/formalizer/dispatcher-runtime.mjs) on the message,
 *   2. checks every proposal with the rules and the interpreter (src/dialog/dispatch-validate.mjs, spec 03 section 7) and picks
 *      the best segmentation,
 *   3. formalizes each winning piece with the rules of its chosen world, in the real session, so the wires are ordinary rule wires.
 * Pieces nobody could validate come back as `unparsed` segments; the dialog engine retries those with the rule formalizer over all
 * worlds (the rules stay the fallback). The result carries `dispatch` (candidates, validation outcome, why the winner won) for the trace.
 *
 * The model is loaded lazily, by the host-supplied `load()` -> `{ ort, session, tokenizer, worlds }`, the first time the strategy is
 * prepared or used. The core never imports onnxruntime. Loading failures make `available()` false (rules fallback) until `retry()`.
 *
 *   const enc = createDispatcherFormalizer({ load, getPolicy: () => ({ acceptRefused: true }) });
 *   enc.attach(engine); engine.formalizers.encoder = enc;
 *   enc.onStatus((s) => ...);   // { state: 'idle' | 'loading' | 'ready' | 'error', message, ms? }
 */
import { formalize } from '../formalizer/rules/index.mjs';
import { createDispatcherRuntime } from '../formalizer/dispatcher-runtime.mjs';
import { createDispatchValidator } from './dispatch-validate.mjs';

/** Demo policy: a parse the interpreter refuses for a state reason (spec 03 section 7, questions Q3) still counts as understood. */
export const ENCODER_DEFAULT_POLICY = { acceptRefused: true };

/** A view of the world set with only `ids` (and their imports); the legends are shared. Same trick as the validator's. */
function restrictedSet(set, ids) {
  const all = [...new Set(ids.flatMap((w) => (set.get(w) ? set.available(w) : [])))];
  const sub = Object.create(set);
  sub._cache = new Map();
  sub.list = () => all.map((i) => set.get(i));
  return sub;
}

export function createDispatcherFormalizer({ load, getPolicy = () => ENCODER_DEFAULT_POLICY, historyLimit = 6, now = () => Date.now(), waitForModel = true } = {}) {
  let engine = null;
  let validator = null;
  let runtime = null;
  let loading = null;
  let status = { state: 'idle', message: '' };
  const listeners = new Set();
  const history = new WeakMap();   // isession -> the earlier messages this strategy formalized (seeds the validator's sessions)
  const setStatus = (s) => { status = s; for (const f of listeners) try { f(status); } catch { /* a listener must not break loading */ } };

  const prepare = () => {
    if (runtime) return Promise.resolve(runtime);
    if (!loading) {
      const t0 = now();
      setStatus({ state: 'loading', message: 'loading the dispatcher model' });
      loading = Promise.resolve().then(load).then((parts) => {
        runtime = typeof parts?.predict === 'function' ? parts : createDispatcherRuntime(parts);   // a ready runtime is accepted too (tests)
        setStatus({ state: 'ready', message: 'dispatcher ready', ms: now() - t0 });
        return runtime;
      }).catch((e) => {
        loading = null;
        setStatus({ state: 'error', message: e?.message ?? String(e) });
        throw e;
      });
    }
    return loading;
  };

  return {
    id: 'encoder',
    attach(e) { engine = e; validator = null; },
    get status() { return status; },
    onStatus(f) { listeners.add(f); f(status); return () => listeners.delete(f); },
    prepare,
    retry() { if (status.state === 'error') { loading = null; setStatus({ state: 'idle', message: '' }); } },
    ready: () => status.state === 'ready',
    /** With `waitForModel: false` (the webchat loads the model in the background) the strategy is unavailable, so the rules answer, until the model is ready. */
    available: () => typeof load === 'function' && status.state !== 'error' && (waitForModel || status.state === 'ready'),
    supports: (world) => (runtime ? runtime.worlds.includes(world?.id) : true),

    async formalize(text, { worlds: set, session, source = 'input', context } = {}) {
      if (!engine) throw new Error('the dispatcher formalizer is not attached to an engine');
      const rt = await prepare();
      validator ??= createDispatchValidator({ engine, policy: getPolicy() });
      const past = history.get(session) ?? [];
      const ctx = { tab: context?.activeTab ?? null, recent_worlds: context?.recentWorlds ?? [], session: past.slice(-historyLimit) };
      const t0 = now();
      const prediction = await rt.predict(text, ctx);
      const tModel = now() - t0;
      prediction.id = source;
      const out = await validator.validate(prediction, getPolicy());
      const tTotal = now() - t0;

      const winner = out.trace.segmentations[out.trace.winnerIndex ?? 0];
      const segments = [];
      for (const piece of winner?.pieces ?? []) {
        const cands = piece.attempts.filter((a, i, arr) => arr.findIndex((b) => b.world === a.world) === i).map((a) => ({ id: a.world, score: Number(a.worldScore.toFixed(4)) }));
        const chosen = piece.valid ? piece.chosen : null;
        const info = chosen ? { world: chosen.world, rank: chosen.rank, variant: chosen.variant, corrections: chosen.corrections ?? [], partial: chosen.partial ?? null, worldScore: piece.attempts.find((a) => a.world === chosen.world)?.worldScore ?? null } : null;
        let parts = [];
        if (chosen) {
          const res = formalize(chosen.text, { worlds: restrictedSet(set, [chosen.world]), session, source, context, router: engine.router });
          const shift = chosen.text === piece.text ? piece.start : null;
          const win = chosen.partial?.window ? chosen.partial.ignored : null;
          parts = res.segments.map((s, k) => ({
            ...s,
            corrections: chosen.corrections?.length ? chosen.corrections : (s.corrections ?? []),
            ...(win && k === 0 ? { ignored: win.map((x) => x.text) } : {}),
            span: shift === null ? [piece.start, piece.end] : [s.span[0] + shift, s.span[1] + shift],
            worlds: cands,
            routing: { router: 'dispatcher', tier: null, tierName: 'dispatcher', reason: `dispatcher candidate ${chosen.rank} of ${cands.length}, validated by the rules`, contested: false,
              winner: { worldId: chosen.world, score: info.worldScore }, runnerUp: cands.find((c) => c.id !== chosen.world) ? { worldId: cands.find((c) => c.id !== chosen.world).id } : null },
            dispatch: info,
          }));
        }
        if (!parts.length) {
          parts = [{ text: piece.text, span: [piece.start, piece.end], isQuestion: /\?\s*$/.test(piece.text), worlds: cands, routing: null, match: null, wires: [], unparsed: true, alternatives: [], errors: [piece.attempts[0]?.reason ?? 'not validated'], dispatch: info }];
        }
        segments.push(...parts);
      }
      const hist = history.get(session) ?? [];
      hist.push(text); history.set(session, hist.slice(-historyLimit * 2));
      const dispatch = {
        text, context: ctx, status: out.status, partial: !!out.partial, why: out.why, policy: out.trace.policy, winnerIndex: out.trace.winnerIndex, formula: out.trace.formula,
        modelMs: Math.round(tModel), totalMs: Math.round(tTotal),
        boundaries: prediction.boundaries,
        segmentations: out.trace.segmentations.map((g) => ({
          index: g.index, dispatcherScore: g.dispatcherScore, score: g.score, valid: g.valid, nInvalid: g.nInvalid,
          pieces: g.pieces.map((p) => ({ start: p.start, end: p.end, text: p.text, simplified: p.simplified ?? null, valid: p.valid, tie: p.tie,
            chosen: p.chosen ? { world: p.chosen.world, rank: p.chosen.rank, variant: p.chosen.variant, score: p.chosen.score, text: p.chosen.text, corrections: p.chosen.corrections ?? [], partial: p.chosen.partial ?? null } : null,
            attempts: p.attempts.map((a) => ({ world: a.world, rank: a.rank, worldScore: a.worldScore, variant: a.variant, text: a.text, valid: a.valid, refused: a.refused, reason: a.reason, score: a.score, corrections: a.corrections ?? [], partial: a.partial ?? null })) })),
        })),
      };
      return { segments, wires: segments.flatMap((s) => s.wires ?? []), dispatch };
    },
  };
}
