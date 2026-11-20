import { captureHistory, initializeHistory, restoreHistory } from './history-journal.mjs?v=625ab5126c';
import {isAuthoredRequest} from './authored-request-tool.mjs?v=58e7ed30fe';
import { interpretationPolicy } from './interpretation-policy.mjs?v=79e47ac3e4';
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * C2 dialog pipeline (spec 06). Browser-safe.
 *
 *   const engine = await createEngine({ loader, translator })
 *   const session = engine.createSession({ language: 'auto' })
 *   const reply = await session.send('Tom has 5 apples. How many apples does Tom have?')
 *
 * `translator` is optional: { detectLanguage(text), translate(text, { from, to }) } (spec 05).
 * Without it all input is treated as English.
 */

import { loadWorlds } from '../worlds/index.mjs?v=e3787ec7fe';
import { validateWorldSet } from '../worlds/validate.mjs?v=af0869a8e0';

import { createInterpreter } from '../interpreter/index.mjs?v=6ac609c033';
import { createReasoner } from '../reasoner/index.mjs?v=dd8ac9004b';

import { serialize } from '../soplang/index.mjs?v=c57881f705';

import { perf } from './stage-perf.mjs?v=8b73796daa';
import { guard, TurnAborted } from './turn-guard.mjs?v=34ed257fec';
import { createBudget, installBudget, releaseBudget, isBudgetExceeded, budget } from './budget.mjs?v=00bce6e369';

import { attachValues } from '../knowledge/values.mjs?v=f83cb28715';
import { attachOpenWords } from '../knowledge/open-words.mjs?v=0e59e1a445';
import { attachArrangement } from '../knowledge/arrangement.mjs?v=4cbd87ecb5';

import { createSessionAstra } from '../astra/session.mjs?v=cab0b7ddb9';

import { panel } from '../astra/where.mjs?v=09b4059350';
import { snapshot as astraSnapshot, restore as astraRestore } from '../astra/persist.mjs?v=3e29fd91c2';

export { runWorldTests } from './test-runner.mjs?v=635e001b3e';

/** Time budget of the leniency stage (spelling variants and partial windows) of one message, in ms; past it the best reading so far stands (turn guard, spec 06). */

/** A voice dry run is skipped for texts longer than this many words (room talk, not a command). */
const DRY_MAX_WORDS = 25;

/** What the trace and the phrase log keep of a turn's compute budget: total ticks, the five busiest sites, and the site that ran out (if any). */
export function budgetReport(b, e = b.exceeded) {
  const top = Object.entries(b.bySite).sort((x, y) => y[1] - x[1]).slice(0, 5);
  return { ticks: b.ticks, top: Object.fromEntries(top), ...(e ? { exceeded: { site: e.site, ticks: e.ticks, limit: e.limit } } : {}) };
}

/**
 * The record of a budget excess, for the trace, the debug view and the phrase log (field `budgetExceeded`): where the loop is.
 * { site, ticks, limit: 'site' | 'turn', bySite: full per-site tick table, input, tab, stage (turn guard stage), stack: short caller id }.
 */
export function budgetRecord(e, b, { input = null, tab = null, stage = null } = {}) {
  return { site: e.site, ticks: e.ticks, limit: e.limit, bySite: e.bySite ?? { ...b.bySite }, input, tab, stage, stack: e.stack_ ?? [] };
}

export const TOO_COMPLEX = 'That was too complex for me \u2014 try a shorter sentence.';

/** The reply of a turn that ran out of compute budget (the session was restored by the caller). Same shape as a normal reply, nothing executed. */
function tooComplexReply(session, text, e, b) {
  const rep = budgetReport(b, e);
  const record = budgetRecord(e, b, { input: text, tab: session.isession?.state?.['ui.shell']?.activeTab ?? null, stage: guard.stage });
  return {
    budgetExceeded: record,
    text: TOO_COMPLEX, parts: [{ text: TOO_COMPLEX }], lang: session._sessionLang ?? 'en', translation: null, segments: [], wires: [], answers: [], statuses: [], state: {}, effects: [],
    tooComplex: true, budget: rep,
    trace: { intercepted: null, effects: [], formalizer: { preferred: session.formalizer, used: [] }, source: null, original: text, english: text, replyEnglish: TOO_COMPLEX, segments: [], router: [], routing: [], patterns: [], operations: [], statuses: [], wires: [], budget: rep, budgetExceeded: record },
  };
}

/** A model call that hit its deadline: an ORT lane timeout (`OrtTimeout`), an aborted encoder fetch (`AbortError`, `TimeoutError`) or a message that says so. */
export const isModelTimeout = (e) => !!e && e.name !== 'TurnAborted' && (['OrtTimeout', 'AbortError', 'TimeoutError'].includes(e.name) || /timed out|timeout|aborted/i.test(String(e.message ?? e)));

export class DialogSession {
  constructor(engine, { language = 'auto', formalizer = 'rules', routing } = {}) {
    this.engine = engine;
    /** Settings the host still passes (runtime-config sessionOptions); the only turn route is `routeNewEngine`, which does not read them. */
    this.routing = routing;
    this.language = language;
    this.formalizer = formalizer;
    this.isession = engine.interp.createSession();
    /** Persistent discussions and world instances (spec 13, ADR-008): bookkeeping around the turn, never changes a reading. */
    this.astra = createSessionAstra(this);
    this.sources = new Map();
    this.newEngineJournal = [];
    initializeHistory(this);
    this.newEngineFocus = {};
    this.newEngineLastAction = {};
    this._msg = 0;
    this.isession.add(this.isession.form.initDefaults());
  }

  /**
   * A cheap stand-in for validation (spec 03 section 7): only what `context()`, the rule formalizer and the interpreter read
   * (the interpreter session, the recent worlds). No discourse, no sources. Throws when the state cannot be cloned.
   */
  forkForValidation() {
    const s = Object.create(DialogSession.prototype);
    s.engine = this.engine; s.isession = this.isession.clone(); s.isession.sessionFacts = this.isession.sessionFacts; s._recentWorlds = [...(this._recentWorlds ?? [])];
    return s;
  }

  /**
   * Dry-run reading for the voice end-of-turn detector (spec 06 "Spoken messages"): do the rules find a complete reading of the whole text?
   * Side-effect free: works on a fork of the session, never executes anything on the real session, never touches the session language,
   * the discourse memory or the message counter. Bounded and cancellable (FREEZE 4):
   *   - its own turn guard with `deadlineMs` and the caller's `signal` (honoured at every cancellation point inside the rules);
   *   - at most one in flight per session: a newer call cancels the older (which answers `cancelled`) and waits for it to unwind;
   *   - no leniency (spelling variants, partial windows, best effort), no browser-API translation (the rules translator only);
   *   - skipped without any work for more than DRY_MAX_WORDS words, and for text with no word of any world's vocabulary.
   * While a real turn runs it declines (`busy`). Returns { complete, segments, reason }; `reason` is one of
   * ok, incomplete, refused, missing, ambiguous, empty, busy, cancelled, deadline, too-long, no-vocabulary, error.
   */
  async dryRead() { return { complete: false, segments: 0, reason: 'unsupported', missing: ['declared dry reading'] }; }

  /** Session wires as SOP Lang (short keys where unambiguous). */
  memory() {
    const L = this.engine.set.legends;
    const wires = this.isession.memory.sessionWires().map((w) => ({
      ...w, entries: w.entries.map((e) => ({ key: L.shortKey(w.type, e.key), value: e.value })),
    }));
    return serialize(wires);
  }

  /** Current state of one world (a copy), or of every world keyed by world id (spec 07). */
  state(worldId) {
    const all = this.isession.state;
    return structuredClone(worldId ? (all[worldId] ?? null) : all);
  }

  /** Host-initiated state change (a click on a tab, a toggle): shallow-merges `patch` into the world's state. No reply, no effects. */
  setWorldState(worldId, patch = {}) {
    this._rev = (this._rev ?? 0) + 1;
    const st = (this.isession.state[worldId] ??= {});
    Object.assign(st, structuredClone(patch));
    if (worldId === 'ui.shell' && patch.activeTab) this.astra?.onTabChange(patch.activeTab);   // the tab resumes its discussion (spec 13 section 1)
    return structuredClone(st);
  }

  /**
   * Record the outcome of a host-executed effect as a core.observation wire (spec 07 §1, vision §8), then, when the
   * effect came from a world whose ops.mjs exports `onObservation(ctx, obs)`, let that world react (update its state,
   * queue further effects, answer). Returns `{ id, text, state, effects }`; `text` is null when the world says nothing.
   * The host renders a non-empty `text` as a new assistant message and applies `state` and `effects` like a reply.
   */
  observe() { return { text: null, state: {}, effects: [], unsupported: 'No declared observation reaction is bound.' }; }

  /**
   * Headless host (RD8): in the CLI and in scripts no browser executes the effects of a reply, so a world that waits for an observation
   * (the chess engine move) would wait for ever and answer "I am still thinking" to the next command. This reports every effect of `reply`
   * that a world observes as failed ("no host"); the world then uses its own fallback (the built-in chess player). Returns the texts the
   * worlds answer, in order. A browser host does not call it: it runs the effects and calls `observe` with the real outcome.
   */
  settleHeadless(reply) {
    const out = [];
    const run = (effects, depth) => {
      for (const e of effects ?? []) {
        budget.tick('dialog.settle');
        const world = e.world;
        if (!world || typeof this.engine.set.get(world)?.ops?.onObservation !== 'function') continue;
        const f = this.observe({ effect: e.name, ok: false, detail: 'no host', world });
        if (f.text) out.push(f.text);
        if (f.effects.length && depth < 5) run(f.effects, depth + 1);
      }
    };
    run(reply?.effects, 0);
    return out;
  }

  /**
   * MODEL-TIMEOUTS (spec 06 "Model timeouts are visible"): a model call that timed out (encoder 1500 ms, dispatcher / normalizer lane deadlines) and was answered by the rules
   * instead is recorded, never silent: counted per session and per engine (`engine.modelStats`), listed in the turn's `trace.formalizer.modelTimeouts`, and announced to the host
   * through `engine.onModelTimeout({ stage, message, count, first })` (`first` once per session; the webchat debug panel says it once and keeps the count). Deadlines are unchanged.
   */
  _noteModelTimeout(stage, e) {
    if (!isModelTimeout(e)) return;
    const st = (this.engine.modelStats ??= { timeouts: 0, byStage: {} });
    st.timeouts++; st.byStage[stage] = (st.byStage[stage] ?? 0) + 1;
    this.modelTimeouts = (this.modelTimeouts ?? 0) + 1;
    const message = e?.message ?? String(e);
    (this._turnModelTimeouts ??= []).push({ stage, message });
    const first = this.modelTimeouts === 1;
    try { this.engine.onModelTimeout?.({ stage, message, count: this.modelTimeouts, total: st.timeouts, first }); } catch { /* a listener must not break the turn */ }
  }

  /** Discussions of this chat as panel data (spec 13 section 8): `{ tab, status, world }` filters. */
  discussions(filter = {}) { return panel(this.astra, filter); }

  /** One message in, one reply out. Opens the stage-timing record (`reply.perf`, see formalizer/perf.mjs) unless this is a nested replay. */
  async send(text, opts = {}) {
    const own = perf.start();
    // Turn guard (spec 06 "Turn lifecycle"): the outermost send installs the abort signal and the deadlines; nested sends (validator replays) inherit them.
    const g = guard.install({ signal: opts.signal ?? null, hardMs: opts.hardMs ?? Infinity, softMs: opts.softMs ?? Infinity, ...(opts.clock ? { clock: opts.clock } : {}), force: !!opts.signal });
    if (g) guard.onModelTimeout((stage, e) => this._noteModelTimeout(stage, e));
    // Compute budget (spec 06 "Compute budgets"): one per turn, passed down through the shared `budget` handle; nested sends join the outer turn's budget.
    const tb = opts.budget ?? createBudget();
    const bt = installBudget(tb, { force: !!opts.budget });
    const snap = g || bt ? (opts.undo ?? this.snapshot()) : null;   // a host that passes `undo` (its own snapshot) restores the session itself
    const outerView = this._view; this._view = outerView ?? (typeof opts.view === 'string' && opts.view ? opts.view : null);   // the view the host tells for this turn (spec 28 section 21): read in it, the shell's tab untouched
    try {
      const reply = await this._send(text, opts);
      // INVARIANT (every turn gets a reply): a message that produced no words at all (bare punctuation, an empty reading) is answered, quoting what was typed
      if (reply && typeof reply === 'object' && !String(reply.text ?? '').trim() && String(text ?? '').trim() && !opts.silent) {
        const said = `I did not understand "${String(text).trim().slice(0, 80)}".`;
        reply.text = said; reply.parts = [{ text: said, translate: false }]; if (reply.trace) reply.trace.replyEnglish = said; if (Array.isArray(reply.statuses) && !reply.statuses.length) reply.statuses.push('unparsed');
      }
      if (g) guard.check('end');   // (checks the shared guard)   // a stage that swallowed the abort must not let a half-done turn through
      if (bt && tb.exceeded) throw tb.exceeded;   // a stage that swallowed BudgetExceeded must not let a half-done turn through
      if (own && reply && typeof reply === 'object') { reply.perf = perf.end(); if (bt && reply.perf) reply.perf.ticks = { total: tb.ticks, sites: { ...tb.bySite } }; }   // the turn's ticks per site next to its stage times (SCAN-PROFILE)
      if (bt && reply && typeof reply === 'object') reply.budget = budgetReport(tb);
      return reply;
    } catch (e) {
      if (bt && isBudgetExceeded(e)) {   // out of budget: the session goes back to where it was, the turn answers "too complex" and says where
        if (!opts.undo) this.restore(snap);
        return tooComplexReply(this, text, e, tb);
      }
      if (g && (e instanceof TurnAborted || guard.tripped)) {   // aborted: the session goes back to exactly where it was before the message
        if (!opts.undo) this.restore(snap);
        throw e instanceof TurnAborted ? e : new TurnAborted(guard.tripped, guard.trippedStage);
      }
      throw e;
    } finally { this._view = outerView; if (own) perf.end(); guard.release(g); releaseBudget(bt); }
  }

  /**
   * The conversation memory as plain JSON: discourse (frames, pending question, actions, topics ...), the ASTRA discussions and instances, the recent worlds
   * and the last game. A host that has to replace the engine (the page restarts its worker after a runaway turn) keeps it next to the world states and gives
   * it back with `restoreMemory`. It survives `JSON.stringify` and `structuredClone`.
   */
  memoryJSON() {
    let astra = null;
    try { astra = this.astra ? astraSnapshot(this.astra) : null; } catch { astra = null; }
    let rs = null;
    try { rs = this.isession.rs?.timelineJSON() ?? null; } catch { rs = null; }   // the library instances and the undo timeline (spec 15); absent on the ops reasoner
    return { v: 1, history: captureHistory(this), newEngineFocus: structuredClone(this.newEngineFocus), newEngineLastAction: structuredClone(this.newEngineLastAction), ...(this.newEngineJournal.length ? { newEngineJournal: structuredClone(this.newEngineJournal) } : {}), astra, recent: [...(this._recentWorlds ?? [])], ...(rs ? { rs } : {}) };
  }

  /** Puts a `memoryJSON()` record back (a bad record changes nothing it cannot read). Runs no effect. */
  restoreMemory(mem) {
    if (!mem || typeof mem !== 'object' || mem.v !== 1) return false;
    if (!restoreHistory(this,mem.history,mem)) return false;
    if (Array.isArray(mem.newEngineJournal)) this.newEngineJournal = structuredClone(mem.newEngineJournal.slice(-128));
    this.newEngineFocus = structuredClone(mem.newEngineFocus ?? {});
    this.newEngineLastAction = structuredClone(mem.newEngineLastAction ?? {});
    if (mem.astra && this.astra) { try { astraRestore(this.astra, mem.astra); } catch { /* the discussions start empty */ } }
    if (Array.isArray(mem.recent)) this._recentWorlds = [...mem.recent];
    if (mem.rs && this.isession.rs) {   // after the world states: the timeline of the matrix reasoner
      // the world states the host put in place are the truth: the library derives a matrix world's state from its instances, which never heard of what the host set (the open tab, a toggle), so replaying the timeline would put the older state back
      const keep = structuredClone(this.isession.state);
      this.isession.rs.restoreJSON(mem.rs, this.isession);
      for (const [id, v] of Object.entries(keep)) {
        const cur = this.isession.state[id];
        if (!cur) { this.isession.state[id] = v; continue; }
        if (JSON.stringify(cur) !== JSON.stringify(v)) { for (const k of Object.keys(cur)) delete cur[k]; Object.assign(cur, v); }
      }
    }
    return true;
  }

  /** Undo snapshot of everything a turn can change (interpreter session, discourse memory, recent worlds, message counter). */
  snapshot() {
    return {
      isession: this.isession.clone(), msg: this._msg, recent: [...(this._recentWorlds ?? [])], lang: [this._sessionLang, this._weakRo],
      newEngineJournal: structuredClone(this.newEngineJournal),
      history: captureHistory(this), newEngineFocus: structuredClone(this.newEngineFocus), newEngineLastAction: structuredClone(this.newEngineLastAction),
      sources: new Set(this.sources.keys()), astra: this.astra?.capture(),
    };
  }

  /** LAZY LOADING: the actions a turn asked for that no loaded world has (the names), once; the host loads the worlds that have them and reads the turn again. Call it before `restore`. */
  takeMissed() { const m = this.isession.missed; this.isession.missed = null; return m ? [...m] : []; }

  /**
   * UNDO ACROSS A RELOAD: a snapshot of this session as plain data ({ state, meta }, what a host keeps next to the world states), so that a session made by a reloaded engine
   * (`engine.reload`, lazy loading) can take it over with `adoptSnapshot`. The session is put back to what it was.
   */
  portableSnapshot(snap) {
    const now = this.snapshot();
    try {
      this.restore(snap);
      return { state: structuredClone(this.isession.state), meta: { msg: this._msg, lang: this._sessionLang, weakRo: this._weakRo, memory: this.memoryJSON() } };
    } finally { this.restore(now); }
  }

  /** Makes an undo snapshot of this session out of a `portableSnapshot()` record; the session itself is unchanged. */
  adoptSnapshot(rec) {
    const now = this.snapshot();
    try {
      this.isession.state = { ...this.isession.state, ...structuredClone(rec.state) };   // a world loaded since has its initial state
      this._msg = rec.meta.msg ?? this._msg; this._sessionLang = rec.meta.lang ?? this._sessionLang; this._weakRo = rec.meta.weakRo ?? 0;
      if (rec.meta.memory) this.restoreMemory(rec.meta.memory);
      return this.snapshot();
    } finally { this.restore(now); }
  }

  /** Puts the session back to a snapshot taken by `snapshot()`. */
  restore(snap) {
    if (!snap) return;
    if (!restoreHistory(this,snap.history,snap)) throw Error('invalid-session-history-snapshot');
    this.isession = snap.isession; this._msg = snap.msg; this._recentWorlds = snap.recent; [this._sessionLang, this._weakRo] = snap.lang;
    this.newEngineJournal = structuredClone(snap.newEngineJournal ?? []);
    this.newEngineFocus = structuredClone(snap.newEngineFocus ?? {});
    this.newEngineLastAction = structuredClone(snap.newEngineLastAction ?? {});
    this.astra?.rollback(snap.astra);
    for (const k of [...this.sources.keys()]) if (!snap.sources.has(k)) this.sources.delete(k);
  }

  /** Sole public turn route. Retired options cannot select another reader. */
  async _send(text, opts = {}) {
    const language = opts.language ?? (this.language === 'auto' ? 'en' : this.language);
    const translator = this.engine.translator;
    let english = text, sourceLanguage = language, translation = null, detection = null;
    if (language !== 'en' && !isAuthoredRequest(text)) {
      // UI language is a reply preference; a browser-detected input language may differ.
      // The confidence at which a detected language replaces the selected one is declared (interpretation-policy.sop app.interpret.language); the decision is traced.
      try {
        const top = (await translator?.detectInput?.(text))?.[0], rule = interpretationPolicy().language;
        detection = { detected: top?.detectedLanguage ?? null, confidence: top?.confidence ?? null, minConfidence: rule.minConfidence, rule: rule.id, selected: language };
        if (top?.confidence >= rule.minConfidence) sourceLanguage = top.detectedLanguage.split('-')[0];
        detection.used = sourceLanguage;
      } catch (error) { detection = { error: String(error?.message ?? error), selected: language, used: language }; }
      if (sourceLanguage !== 'en') {
        try {
          english = await translator?.machineTranslate?.(text, { from: sourceLanguage, to: 'en' });
          if (typeof english !== 'string' || !english.trim()) throw new Error('translation unavailable');
          translation = { from: sourceLanguage, to: 'en', original: text, english };
        } catch {
          const said = 'The translation service is not ready for this language. Nothing changed. You can select English and send an English request, or retry when translation is ready.';
          return { text: said, parts: [{ text: said, translate: false }], statuses: ['unsupported'], answers: [], segments: [], effects: [], state: {}, trace: { legacy: false, engine: 'new', reason: 'translation-unavailable', sourceLanguage } };
        }
      }
    }
    const reply = await (await import('./reader-routing.mjs?v=7afc19ac86')).routeNewEngine(this, english, { ...opts, language: 'en' });
    reply.trace = { ...reply.trace, english, ...(translation ? { translation } : {}), ...(detection ? { languageDetection: detection } : {}) };
    if (language !== 'en') {
      try {
        const said = await translator?.machineTranslate?.(reply.text, { from: 'en', to: language });
        if (typeof said !== 'string' || !said.trim()) throw new Error('translation unavailable');
        reply.trace.replyEnglish = reply.text;
        reply.text = said; reply.parts = [{ text: said, translate: false }];
      } catch { reply.trace.replyTranslation = 'unavailable'; } // Keep the actual effect reply; never retry execution.
    }
    return reply;
  }

}

/** Create the dialog engine: loads and checks all worlds. */
export async function createEngine({ loader, translator = null, options = {} }) {
  // Reasoner (spec 15): 'matrix' is the product (the worlds that say reasoner=matrix answer through the sopworld library); 'ops' is the named test oracle, selected only by code that compares the two. The option wins over PSYS2_REASONER.
  const mode = (options.reasoner ?? globalThis.process?.env?.PSYS2_REASONER) === 'ops' ? 'ops' : 'matrix';
  // `set`, `reasoner` and `interp` are replaced by `engine.reload(loader)` (LAZY LOADING: the worlds a message needs are added to a running engine); everything below reads them through these bindings.
  let set = await loadWorlds(loader, { reasoner: mode, patterns: options.patterns ?? null });
  let reasoner = mode === 'matrix' ? await createReasoner(set) : null;
  let interp = createInterpreter(set, { ...options, reasoner });
  attachOpenWords(options.knowledge ?? null);
  interp.knowledge = options.knowledge ?? null;   // the knowledge catalog (spec 17): operations read `ctx.knowledge.peek(name)`
  const engine = {
    applicationAreas: structuredClone(options.applicationAreas ?? []),
    knowledge: options.knowledge ?? null,
    /** Attach or detach the knowledge catalog after creation (an experiment, the webchat once the catalog is reachable). */
    setKnowledge(cat) { engine.knowledge = cat ?? null; interp.knowledge = cat ?? null; attachValues(cat); attachOpenWords(cat); attachArrangement(cat); },   // the colour and number readers (k.values) take the catalog's words in place of the bundled subset
    set, interp, translator, loader, reasonerMode: mode, reasoner,
    /** Problems found at load time and by static validation (empty when everything is consistent). */
    problems: () => validateWorldSet(set, options.patterns ?? {}),
    worlds: () => set.list().map((w) => w.summary()),
    /**
     * LAZY LOADING: replaces the world set with the one `newLoader` lists (the loaded worlds plus the ones a message needs), keeping this engine object (translator, knowledge, the
     * reader attached to it). Sessions made before keep their old interpreter session: the host makes a new session and gives it the state and memory back (`restoreMemory`).
     */
    reload: async (newLoader) => {
      const nset = await loadWorlds(newLoader, { reasoner: mode, patterns: options.patterns ?? null });
      const nreasoner = mode === 'matrix' ? await createReasoner(nset) : null;
      const ninterp = createInterpreter(nset, { ...options, reasoner: nreasoner });
      ninterp.knowledge = engine.knowledge;
      set = nset; reasoner = nreasoner; interp = ninterp;
      engine.set = nset; engine.reasoner = nreasoner; engine.interp = ninterp; engine.loader = newLoader;
      attachOpenWords(engine.knowledge);
      return engine;
    },
    createSession: (opts) => new DialogSession(engine, opts),
  };
  return engine;
}
