import { captureHistory, initializeHistory, restoreHistory } from './history-journal.mjs?v=0d3803bc7e';
import {isAuthoredRequest} from './authored-request-tool.mjs?v=0c4b78f098';
import { interpretationPolicy } from './interpretation-policy.mjs?v=79c1776d10';
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

import { loadWorlds } from '../worlds/index.mjs?v=cadeb0ee91';
import { validateWorldSet } from '../worlds/validate.mjs?v=af0869a8e0';


import { perf } from './stage-perf.mjs?v=8b73796daa';
import { guard, TurnAborted } from './turn-guard.mjs?v=34ed257fec';
import { createBudget, installBudget, releaseBudget, isBudgetExceeded, budget } from './budget.mjs?v=00bce6e369';

import { attachValues } from '../knowledge/values.mjs?v=75ef016e50';
import { attachArrangement } from '../knowledge/arrangement.mjs?v=547d8c6296';

/**
 * The world states of a session: one entry per world, seeded from the world's native initializer (`initialState` of its ops module).
 * The turn route (routeNewEngine) and the native controls read and write `state`; a snapshot is a deep copy.
 */
class SessionState {
  constructor(set = null) {
    this.state = {};
    for (const w of set?.list?.() ?? []) if (typeof w.ops?.initialState === 'function') this.state[w.id] = structuredClone(w.ops.initialState());
  }
  clone() { const s = new SessionState(); s.state = structuredClone(this.state); return s; }
}

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
    this.isession = new SessionState(engine.set);
    this.sources = new Map();
    this.newEngineJournal = [];
    initializeHistory(this);
    this.newEngineFocus = {};
    this.newEngineLastAction = {};
    this._msg = 0;
  }

  /** Dry-run reading for the voice end-of-turn detector: no declared dry reading exists, so it answers `unsupported` and nothing runs. */
  async dryRead() { return { complete: false, segments: 0, reason: 'unsupported', missing: ['declared dry reading'] }; }

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
    return structuredClone(st);
  }

  /** Observation of a host-executed effect: no declared observation reaction is bound. */
  observe() { return { text: null, state: {}, effects: [], unsupported: 'No declared observation reaction is bound.' }; }

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
    return { v: 1, history: captureHistory(this), newEngineFocus: structuredClone(this.newEngineFocus), newEngineLastAction: structuredClone(this.newEngineLastAction), ...(this.newEngineJournal.length ? { newEngineJournal: structuredClone(this.newEngineJournal) } : {}), recent: [...(this._recentWorlds ?? [])] };
  }

  /** Puts a `memoryJSON()` record back (a bad record changes nothing it cannot read). Runs no effect. */
  restoreMemory(mem) {
    if (!mem || typeof mem !== 'object' || mem.v !== 1) return false;
    if (!restoreHistory(this,mem.history,mem)) return false;
    if (Array.isArray(mem.newEngineJournal)) this.newEngineJournal = structuredClone(mem.newEngineJournal.slice(-128));
    this.newEngineFocus = structuredClone(mem.newEngineFocus ?? {});
    this.newEngineLastAction = structuredClone(mem.newEngineLastAction ?? {});
    if (Array.isArray(mem.recent)) this._recentWorlds = [...mem.recent];
    return true;
  }

  /** Undo snapshot of everything a turn can change (world states, history, focus, recent worlds, message counter). */
  snapshot() {
    return {
      isession: this.isession.clone(), msg: this._msg, recent: [...(this._recentWorlds ?? [])], lang: [this._sessionLang, this._weakRo],
      newEngineJournal: structuredClone(this.newEngineJournal),
      history: captureHistory(this), newEngineFocus: structuredClone(this.newEngineFocus), newEngineLastAction: structuredClone(this.newEngineLastAction),
      sources: new Set(this.sources.keys()),
    };
  }

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
    const reply = await (await import('./reader-routing.mjs?v=0b2ccdf1aa')).routeNewEngine(this, english, { ...opts, language: 'en' });
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

/** Create the dialog engine: loads and checks the worlds of the application composition. */
export async function createEngine({ loader, translator = null, options = {} }) {
  // `set` is replaced by `engine.reload(loader)` (LAZY LOADING: the worlds a message needs are added to a running engine).
  let set = await loadWorlds(loader, { patterns: options.patterns ?? null });
  const engine = {
    applicationAreas: structuredClone(options.applicationAreas ?? []),
    knowledge: options.knowledge ?? null,
    /** Attach or detach the knowledge catalog after creation (the webchat once the catalog is reachable): the colour and number readers (k.values) and the arrangement supports take the catalog's facts. */
    setKnowledge(cat) { engine.knowledge = cat ?? null; attachValues(cat); attachArrangement(cat); },
    set, translator, loader,
    /** Problems found at load time and by static validation (empty when everything is consistent). */
    problems: () => validateWorldSet(set, options.patterns ?? {}),
    worlds: () => set.list().map((w) => w.summary()),
    /** LAZY LOADING: replaces the world set with the one `newLoader` lists, keeping this engine object; the host makes a new session and gives it the state and memory back (`restoreMemory`). */
    reload: async (newLoader) => {
      set = await loadWorlds(newLoader, { patterns: options.patterns ?? null });
      engine.set = set; engine.loader = newLoader;
      return engine;
    },
    createSession: (opts) => new DialogSession(engine, opts),
  };
  return engine;
}
