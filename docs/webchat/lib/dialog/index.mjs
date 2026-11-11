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
import { precompile as precompileRules } from '../formalizer/rules/index.mjs?v=46116712b1';
import { loadWorlds } from '../worlds/index.mjs?v=ccac8f6a6e';
import { validateWorldSet } from '../worlds/validate.mjs?v=1eb2f0538f';
import { defaultRouter, namedWorlds, namingTables } from '../formalizer/routing.mjs?v=91ded5d03a';
import { createInterpreter } from '../interpreter/index.mjs?v=199dace4ae';
import { createReasoner } from '../reasoner/index.mjs?v=53bf6e694d';
import { createRulesFormalizer, createEncoderFormalizer } from '../formalizer/strategy.mjs?v=14798d6e5b';
import { DEFAULT_NX_STRATEGY, normalizeNxStrategy } from '../formalizer/nx.mjs?v=13d688a978';
import { serialize, makeWire, atom, str } from '../soplang/index.mjs?v=26885599a7';
import { splitSentences } from '../formalizer/rules/normalize.mjs?v=5de885797a';
import { nameCandidates, nameIndex } from '../formalizer/names.mjs?v=0dff04aff9';
import { cleanVoice, garbleCandidates, weakSoundAlikes } from '../formalizer/voice.mjs?v=14e30cabba';
import { spellCorrect, spellAlternates, spellCandidates, protectedWordsOf, worldVocabulary, spellVocabulary, restrictedSet, ignorable, isKnownWord, sameWordForm, FUNCTION_WORDS } from '../formalizer/spell.mjs?v=a0880cdceb';
import { lexIndex } from '../worlds/lexicon.mjs?v=e3316469a7';
import { perf } from '../formalizer/perf.mjs?v=fd62b893eb';
import { guard, TurnAborted } from '../formalizer/guard.mjs?v=ded769d6bc';
import { createBudget, installBudget, releaseBudget, isBudgetExceeded, budget } from './budget.mjs?v=123c3e1329';
import { findPartialWindow, changesIntoQuestion } from '../formalizer/partial.mjs?v=e468d994f5';
import { looseCandidates, BEST_EFFORT_POLICY } from '../formalizer/best-effort.mjs?v=8ba02e1397';
import { checkValues } from './value-check.mjs?v=dbf4aad634';
import { Discourse } from './discourse.mjs?v=d4d450120b';
import { createSessionAstra, mirrorFrames } from '../astra/session.mjs?v=65217ad31a';
import { recognize } from '../astra/moves.mjs?v=69784e24c4';
import { panel } from '../astra/where.mjs?v=72e99182f4';
import { snapshot as astraSnapshot, restore as astraRestore } from '../astra/persist.mjs?v=fa5f16eb55';
import { correctMessage, splitAnswerList } from '../formalizer/rules/expand.mjs?v=03dfa399b9';

export { runWorldTests } from './test-runner.mjs?v=4483a1dec0';

const plainSegment = (s) => ({
  text: s.text, span: s.span, isQuestion: s.isQuestion, worlds: s.worlds, routing: s.routing, match: s.match,
  unparsed: s.unparsed, discourse: s.discourse ?? null, alternatives: s.alternatives, errors: s.errors, strategy: s.strategy, reading: s.strategy === 'model' ? 'model' : 'rules', corrections: s.corrections ?? [], ignored: s.ignored ?? [], dispatch: s.dispatch ?? null,
  ...(s.nx ? { nx: { op: s.nx.op, world: s.nx.world, pattern: s.nx.pattern, p: s.nx.p, spans: s.nx.spans } } : {}),
  wires: s.wires.map((w) => w.id),
});

/** Up to two example sentences from the closest world (or any world as a fallback). */
export function examplesFor(set, worldIds) {
  const pick = (patterns) => {
    const out = [];
    const kinds = new Set();
    for (const p of patterns) for (const ex of (p.canonical ?? []).slice(0, 1)) {   // canonical examples only (RD6)
      if (!kinds.has(p.kind) && out.length < 2) { kinds.add(p.kind); out.push(ex); }
    }
    for (const p of patterns) for (const ex of p.canonical ?? []) if (out.length < 2 && !out.includes(ex)) out.push(ex);
    return out;
  };
  for (const id of worldIds) {
    const ex = pick(set.get(id)?.patterns ?? []);
    if (ex.length) return ex;
  }
  for (const w of set.list()) { const ex = pick(w.patterns); if (ex.length) return ex; }
  return [];
}

/** The user's own words for the English segment `seg`: found through the translation alignment, else the original text. */
function originalSentence(original, seg, alignment) {
  const sentences = splitSentences(original);
  if (sentences.length <= 1) return (sentences[0]?.text ?? original).trim();
  const hits = (alignment ?? []).filter((a) => a.tgt[0] < seg.span[1] && a.tgt[1] > seg.span[0]);
  if (hits.length) {
    const lo = Math.min(...hits.map((a) => a.src[0])), hi = Math.max(...hits.map((a) => a.src[1]));
    const inside = sentences.filter((x) => x.start < hi && x.end > lo);
    if (inside.length) return original.slice(inside[0].start, inside.at(-1).end);
  }
  return original.trim();
}

/** Keep the surrounding whitespace of `src` and the initial letter case when translating a fragment. */
function fitFragment(src, out) {
  const lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
  let core = out.trim();
  if (/^[a-z]/.test(src.trim()) && core) core = core[0].toLowerCase() + core.slice(1);
  return lead + core + trail;
}

/**
 * Translate a reply given as parts [{ text, translate, quote? }] (spec 06): consecutive `translate: true` parts are
 * translated together, `translate: false` parts (quoted user text, already translated examples) are kept verbatim.
 * A part with `fallback` is replaced by the translation of the fallback text when the translator reports unknown words.
 */
export async function translateParts(parts, translator, lang) {
  const flat = parts.map((p) => ({ ...p }));
  let complete = true;   // RD5: a reply is either fully translated or left in English, never mixed
  for (let i = 0; i < flat.length; i++) if (flat[i].join) flat[i].translate = !!(flat[i - 1]?.translate && flat[i + 1]?.translate);
  const out = [];
  for (let i = 0; i < flat.length;) {
    budget.tick('index.translateParts');
    if (!flat[i].translate) { const { join, fallback, incomplete, ...rest } = flat[i]; if (incomplete) complete = false; out.push(rest); i++; continue; }
    let j = i;
    while (j < flat.length && flat[j].translate) { budget.tick('index.translateParts2'); j++; }
    const run = flat.slice(i, j);
    i = j;
    const src = run.map((p) => p.text).join('');
    if (!src.trim()) { out.push({ text: src, translate: false }); continue; }
    let res = null;
    try { res = await guard.abortable(translator.translate(src, { from: 'en', to: lang }), 'translate'); } catch { res = null; }
    if (res?.unknown?.length && run.length === 1 && run[0].fallback) {
      try { res = await guard.abortable(translator.translate(run[0].fallback, { from: 'en', to: lang }), 'translate'); } catch { res = null; }
    }
    const t = textOf(res);
    if (!t || res?.unknown?.length || res?.untranslatable?.length || (typeof translator.leftovers === 'function' && translator.leftovers(t, lang).length)) complete = false;
    out.push({ text: t ? fitFragment(src, t) : src, translate: true, src });
  }
  if (!complete) {   // keep the whole reply in English: translated runs and the examples (which carry their English text in `en`) revert; quoted user text stays as typed
    return flat.map(({ join, fallback, en, src, incomplete, ...p }) => (join ? { text: p.text, translate: false } : { ...p, text: en ?? p.text }));
  }
  return out.map(({ src, en, ...p }) => p);
}

/** Romanian words the speech recogniser confuses with a word of the open tab's world (RP5): "un sare" on the Drawing tab is "un soare". */
const SOUND_ALIKES = { 'art.draw': { sare: 'soare', soar: 'soare', soarele: 'soarele' } };
function soundAlikes(text, tabWorld) {
  text = text.replace(/\bx\s+(?:și|si|şi)\s+(?:zero|o|0)\b/gi, 'x și 0').replace(/\b(?:pornește|porneste|lansează|lanseaza|deschide)\s+(?=x și 0\b)/gi, 'începe ');   // the game's name: "x și zero" (the digit is how the world spells it)
  const map = SOUND_ALIKES[tabWorld];
  return map ? text.replace(/\p{L}+/gu, (w) => (Object.hasOwn(map, w.toLowerCase()) ? map[w.toLowerCase()] : w)) : text;
}

/** Tabs of worlds that do not declare one in their manifest (the built-in tabs of the demo page). */
const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };

const langOf = (r) => (typeof r === 'string' ? r : r?.lang) ?? 'en';
const textOf = (r) => (typeof r === 'string' ? r : r?.text);

const QUESTION_WORD = /^(?:what|who|whom|whose|where|when|why|how|which)\b/i;

/** Time budget of the leniency stage (spelling variants and partial windows) of one message, in ms; past it the best reading so far stands (turn guard, spec 06). */
import { LIMITS } from './time-limits.mjs?v=0212bba139';
import { languageCommand } from '../translate/language-command.mjs?v=af45c6bf2e';
/** A settled dry-run answer is reused for the same text and session state for this long (ms). */
export const DRY_CACHE_MS = 5000;
const stripDetail = (r) => { if (!r || !('detail' in r)) return r; const { detail: _d, ...rest } = r; return rest; };
/** A voice dry run is skipped for texts longer than this many words (room talk, not a command). */
const DRY_MAX_WORDS = 25;
export const LENIENT_BUDGET_MS = 3000;   // default only; the live value is LIMITS.lenientMs (time-limits.mjs)

const FAST_SEGMENT_MARGIN = 0;   // nats of log-probability between the model's best segmentation and the runner-up for the multi-clause fast path

/**
 * A game whose world state says it is still being played (a tic-tac-toe board with a free cell and no winner, chess or hangman with status "playing", the
 * guessing game while it asks), whichever world spoke last: a bare coordinate ("B1") is its move. The host's `activeGame` wins when it is set.
 */
function runningGame(st, last) {
  const g = last && st[last];
  if (!g || typeof g !== 'object') return null;
  const live = last === 'games.tictactoe' ? Array.isArray(g.board) && !g.winner && g.board.some((c) => !c)
    : last === 'games.chess' || last === 'games.hangman' ? g.status === 'playing'
    : last === 'games.guess' ? g.phase === 'asking' || g.phase === 'guessing' : false;
  return live ? last : null;
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

export class DialogSession {
  constructor(engine, { language = 'auto', formalizer = 'rules', spell = true, partial = false, fastPath = false, bestEffort = false, nx = DEFAULT_NX_STRATEGY } = {}) {
    this.engine = engine;
    /** NX reading strategy (ADR-009): 'hybrid' (default) | 'neural' | 'rules'. Only used with the encoder formalizer and when `engine.formalizers.nx` is ready; otherwise the rules path answers. */
    this.nx = normalizeNxStrategy(nx);
    /** Best effort with loose words (spec 03 section 7.15): after everything else failed, execute the most sensible reading of the content words (off in the library, on in the shipped settings). */
    this.bestEffort = bestEffort;
    /** Encoder fast path (PERF): when the rules read the whole message and the interpreter accepts every reading, skip the model. */
    this.fastPath = fastPath;
    /** Leniency (spec 03 sections 7.9 and 7.10): spell-correct unparsed text (on by default), accept the readable part of a message (off by default; the webchat turns it on). */
    this.spell = spell;
    this.partial = partial;
    this.language = language;
    /** Preferred formalizer strategy: 'rules' (default) or 'encoder'; per world it falls back to rules (spec 06). */
    this.formalizer = formalizer === 'encoder' ? 'encoder' : 'rules';
    this.isession = engine.interp.createSession();
    /** Discourse memory (spec 11, ADR-006): recent frames and the pending expectation. */
    this.discourse = new Discourse(this);
    /** Persistent discussions and world instances (spec 13, ADR-008): bookkeeping around the turn, never changes a reading. */
    this.astra = createSessionAstra(this);
    this.sources = new Map();
    this._msg = 0;
    this.isession.add(this.isession.form.initDefaults());
  }

  /**
   * A cheap stand-in for validation (spec 03 section 7): only what `context()`, the rule formalizer and the interpreter read
   * (the interpreter session, the recent worlds). No discourse, no sources. Throws when the state cannot be cloned.
   */
  forkForValidation() {
    const s = Object.create(DialogSession.prototype);
    s.engine = this.engine; s.isession = this.isession.clone(); s._recentWorlds = [...(this._recentWorlds ?? [])]; s._lastGame = this._lastGame;
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
  async dryRead(text, { language, deadlineMs = 400, detail = false, signal = null } = {}) {
    const prev = this._dry;
    if (prev) { prev.ctl.abort(); try { await prev.done; } catch { /* the older run reports for itself */ } }
    if (signal?.aborted) return { complete: false, segments: 0, reason: 'cancelled' };
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    // SOAK-BUSY: the end-of-turn check and the NOISE classifier read the same text a moment apart: a settled answer for the same text, language and session state is reused for DRY_CACHE_MS
    const key = `${language ?? this.language}|${this._msg}|${this._rev ?? 0}|${this.isession.state?.['ui.shell']?.activeTab ?? ''}|${String(text ?? '').trim()}`;
    const hit = this._dryCache;
    if (hit && hit.key === key && Date.now() - hit.at < DRY_CACHE_MS) { await Promise.resolve(); if (signal?.aborted) return { complete: false, segments: 0, reason: 'cancelled' }; return detail ? hit.res : stripDetail(hit.res); }
    const run = { ctl, done: null };
    run.done = this._dryRun(text, { language, deadlineMs, detail: true, signal: ctl.signal }).then((res) => {
      if (!['cancelled', 'deadline', 'busy', 'error'].includes(res.reason)) this._dryCache = { key, at: Date.now(), res };
      return detail ? res : stripDetail(res);
    });
    this._dry = run;
    try { return await run.done; } finally { signal?.removeEventListener?.('abort', onAbort); if (this._dry === run) this._dry = null; }
  }


  async _dryRun(text, { language, deadlineMs, detail, signal }) {
    const { set, formalizers, interp, translator } = this.engine;
    const raw = String(text ?? '').trim();
    if (!raw) return { complete: false, segments: 0, reason: 'empty' };
    if (raw.split(/\s+/).length > DRY_MAX_WORDS) return { complete: false, segments: 0, reason: 'too-long', ...(detail ? { detail: { english: raw, language: language ?? this.language, readings: [], skipped: 'more than ' + DRY_MAX_WORDS + ' words' } } : {}) };
    const token = guard.install({ signal, hardMs: deadlineMs, softMs: deadlineMs * 0.7 });
    if (!token) return { complete: false, segments: 0, reason: 'busy' };   // a real turn owns the guard
    const db = createBudget();
    const bt = installBudget(db);   // a dry run is a turn of its own: its own compute budget
    try {
      const f = this.forkForValidation();
      let english = raw;
      const lang = language ?? this.language;
      const quick = translator?.rules ?? translator;   // the rules translator when there is one: the dry run never waits for a browser translator
      if (quick && lang === 'ro') { guard.check('dry-translate'); english = textOf(await quick.translate(english, { from: 'ro', to: 'en' })) ?? english; }
      english = splitAnswerList(interp.lang.stripFiller(english) || english);
      guard.check('dry-vocabulary');
      const vocab = spellVocabulary(set);
      if (!(english.toLowerCase().match(/[a-z']+/g) ?? []).some((w) => vocab.has(w) && !FUNCTION_WORDS.has(w))) return { complete: false, segments: 0, reason: 'no-vocabulary', ...(detail ? { detail: { english, language: lang, readings: [], skipped: 'no word of any world' } } : {}) };
      const res = await formalizers.rules.formalize(english, { worlds: set, session: f.isession, source: 'dry', context: f.context(), router: this.engine.router });
      guard.check('dry-read');
      if (db.exceeded) throw db.exceeded;   // a stage that swallowed BudgetExceeded must not report a reading
      const segs = res.segments ?? [];
      // DBG: with `detail` the answer also says how the text was read (the readings, their wires, the candidate worlds), still without executing anything
      const det = () => (detail ? { detail: { english, language: lang, readings: segs.map((x) => ({ text: x.text ?? '', world: x.match?.worldId ?? null, pattern: x.match?.patternId ?? null, strategy: x.strategy ?? null, unparsed: !!x.unparsed, partial: !!x.partial, ignored: x.ignored ?? [], candidates: (x.worlds ?? []).slice(0, 4), wires: x.wires ?? [] })) } } : {});
      if (!segs.length || segs.some((x) => x.unparsed || x.partial || x.ignored?.length)) return { complete: false, segments: segs.length, reason: 'incomplete', ...det() };
      for (const seg of segs) {
        guard.check('dry-resolve');
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r && (r.status === 'unsupported' || r.status === 'error')) return { complete: false, segments: segs.length, reason: 'refused', ...det() };
          if (r && (r.status === 'missing' || r.status === 'ambiguous')) return { complete: false, segments: segs.length, reason: r.status, ...det() }; }   // EOT2: a reading that still needs an argument ("play" -> what?) is not a whole message
      }
      return { complete: true, segments: segs.length, reason: 'ok', ...det() };
    } catch (e) {
      return { complete: false, segments: 0, reason: e instanceof TurnAborted ? (e.reason === 'stopped' ? 'cancelled' : 'deadline') : isBudgetExceeded(e) || db.exceeded ? 'budget' : 'error', ...(db.exceeded ? { budget: budgetReport(db), budgetExceeded: budgetRecord(db.exceeded, db, { input: raw, tab: this.isession?.state?.['ui.shell']?.activeTab ?? null, stage: guard.stage }) } : {}) };
    } finally { guard.release(token); releaseBudget(bt); }
  }

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
  observe({ effect, ok = true, detail = '', data = null, world = null } = {}) {
    this._rev = (this._rev ?? 0) + 1;
    const id = this.isession.form.freshId('o');
    const pairs = [['core.observation.effect', atom(String(effect))], ['core.observation.ok', atom(ok ? 'true' : 'false')]];
    if (detail !== '' && detail != null) pairs.push(['core.observation.detail', str(String(detail))]);
    pairs.push(['core.seq', atom(this.isession.form.nextSeq())]);
    this.isession.add([makeWire(id, 'core.observation', pairs)]);
    const out = { id, text: null, state: {}, effects: [] };
    if (!world) return out;
    const stateBefore = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.effects = [];
    const res = this.engine.interp.observe(this.isession, world, { effect, ok, detail, data, id });
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k]) out.state[k] = structuredClone(v);
    out.effects = this.isession.effects;
    this.isession.effects = [];
    out.text = res?.reply ?? null;
    return out;
  }

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
   * Routing context (spec 03 section 4, ADR-004): what the application state says about where a command belongs.
   * `{ activeTab, tabWorld, modalWorld, gameWorld, recentWorlds, lastWorld }`. The tab owner comes from the `tab=` of a
   * world or the built-in tabs; `gameWorld` is `ui.shell` state `activeGame` (set by the host); `modalWorld` is the
   * world whose state has an open `inputMode`.
   */
  context() {
    const BUILTIN = { robot: 'ui.avatar', avatar: 'ui.avatar', editor: 'docs.editor', tictactoe: 'games.tictactoe', guess: 'games.guess', hangman: 'games.hangman' };
    const st = this.isession.state;
    const activeTab = st['ui.shell']?.activeTab ?? null;
    const tabWorld = activeTab ? (this.engine.set.list().find((w) => w.tab?.id === activeTab)?.id ?? BUILTIN[activeTab] ?? null) : null;
    const modalWorld = Object.keys(st).find((id) => st[id]?.inputMode) ?? null;
    if (tabWorld?.startsWith('games.')) this._lastGame = tabWorld;   // opening a game tab ("lets play tic tac toe") makes it the game this session plays
    const gameWorld = st['ui.shell']?.activeGame ?? runningGame(st, this._lastGame);
    const recentWorlds = [...(this._recentWorlds ?? [])];
    return { activeTab, tabWorld, modalWorld, gameWorld, recentWorlds, lastWorld: recentWorlds[0] ?? null, states: st };
  }

  /** Legacy focus map derived from the context: +3 for the tab world, +1 for each recent world. */
  focus() {
    const c = this.context();
    const focus = {};
    for (const w of c.recentWorlds) focus[w] = (focus[w] ?? 0) + 1;
    if (c.tabWorld) focus[c.tabWorld] = (focus[c.tabWorld] ?? 0) + 3;
    return focus;
  }

  /**
   * Ops reasoner: ask the world whether the facts just told still make a consistent world (hook `checkStatement(ctx, { ids })`, which
   * returns { problem } or nothing). A problem retracts the facts and is returned as the sentence to say; otherwise null.
   */
  _refuseFacts(worldId, facts) {
    if (!worldId) return null;
    const ids = facts.filter((w) => !w.type.startsWith('core.')).map((w) => w.id);
    const r = this.engine.interp.hook(this.isession, worldId, 'checkStatement', { ids });
    if (!r?.problem) return null;
    for (const id of ids) this.isession.memory.retract(id, 'refused: ' + r.problem);
    return `That does not add up. ${r.problem}`;
  }

  _noteWorlds(segments) {
    const ids = segments.map((s) => s.match?.worldId).filter((w) => w && w !== 'ui.shell' && w !== 'kids.common');
    const game = ids.find((w) => w.startsWith('games.'));
    if (game) this._lastGame = game;   // the last game this session played: while its state says it is running, bare coordinates are its moves (context().gameWorld)
    this._recentWorlds = [...new Set([...ids.reverse(), ...(this._recentWorlds ?? [])])].slice(0, 3);
  }

  /**
   * Last resort for a segment nobody parsed (spec 03 sections 7.9 and 7.10): the candidate worlds (open tab, modal, game, recent, router top 3)
   * are tried in turn with the text spell-corrected against the world's own vocabulary (abbreviations and typos, then one known word swapped
   * for a close neighbour), and, when `partial` is on, with the longest run of words the rules read. Accepted only when the rules of the
   * world parse the text completely. Returns the replacement segments, or null.
   */
  _lenient(seg, opts, o, depth = 0) { return perf.time('lenient', () => this._lenientRun(seg, opts, o, depth)); }

  async _lenientRun(seg, opts, o, depth = 0) {
    budget.tick('dialog.lenient');
    const late = () => guard.soft() || (o.until != null && performance.now() > o.until);   // out of time: no further guessing
    if (late()) return null;
    const { spell, partial } = o;
    const { set, formalizers } = this.engine;
    const rules = formalizers.rules;
    const ctx = this.context();
    const ids = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...ctx.recentWorlds, ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)]
      .filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length && !(opts.excluded ?? []).includes(w)).slice(0, 5);
    ids.push('*');   // finally every world together (a clause of a longer message may belong to a world the whole message did not suggest)
    const setOf = (world) => (world === '*' ? (opts.worlds ?? set) : restrictedSet(set, [world]));
    const vocabOf = (world) => (world === '*' ? spellVocabulary(set) : worldVocabulary(set, world));
    const protect = protectedWordsOf(set, ctx.tabWorld);   // words the open tab knows are never changed
    const parse = async (world, text) => {
      let res;
      try { res = await rules.formalize(text, { ...opts, worlds: setOf(world) }); } catch { return null; }
      return res.segments.length && res.segments.every((x) => !x.unparsed) ? res : null;
    };
    const crossTabOk = (res, corrections) => this._crossTabOk(res.segments, corrections, ctx, seg.text);
    const wrap = (res, extra) => res.segments.map((x, k) => ({ ...x, span: seg.span, strategy: 'rules', ...extra, ...(extra.ignored && k > 0 ? { ignored: [] } : {}) }));
    if (depth > 0) { const direct = await parse('*', seg.text); if (direct) return wrap(direct, { corrections: [] }); }   // a clause on its own
    const spelled = new Map();
    if (spell) {
      // proper names and their wrappers (RD10): whole-value matching against the lexicons, bounded in candidates and time
      try { nameIndex(set); } catch { /* none */ }   // built once per world set (not counted in the budget)
      const t0 = Date.now(), NAME_BUDGET_MS = 120;
      const order = [...new Set(ids.filter((w) => w !== '*').flatMap((w) => set.available(w)))];
      let named = [];
      try { named = perf.timeSync ? perf.timeSync('names', () => nameCandidates(seg.text, { set, vocab: spellVocabulary(set), worldOrder: order })) : nameCandidates(seg.text, { set, vocab: spellVocabulary(set), worldOrder: order }); } catch { named = []; }
      for (const cand of named.slice(0, 4)) {
        // the worlds that own the value first (and are candidates), then the usual order; every world together is tried before the rest
        const own = ids.filter((w) => w !== '*' && cand.worlds.some((cw) => set.available(w).includes(cw)));
        for (const world of [...new Set([...own.slice(0, 2), '*'])]) {
          if (Date.now() - t0 > NAME_BUDGET_MS) break;
          const res = await parse(world, cand.text);
          if (res) return wrap(res, { corrections: cand.corrections });
        }
      }
      for (const world of ids) {
        if (late()) return null;
        const sp = spellCorrect(seg.text, { vocab: vocabOf(world), protect, short: world === ctx.tabWorld });
        spelled.set(world, sp);
        if (!sp.corrections.length) continue;
        const res = await parse(world, sp.text);
        if (res && crossTabOk(res, sp.corrections)) return wrap(res, { corrections: sp.corrections });
        // several typos in the open tab's world ("the un si up not udner clouds"): after the sure corrections, one more word (also a two-letter one) swapped for a close
        // word of the tab's vocabulary; the rest of the sentence decides, the world must read all of it (at most 12 candidate texts, the stage's time budget)
        if (world === ctx.tabWorld) {
          for (const v of spellAlternates(sp.text, { vocab: vocabOf(world), protect, short: true, maxTexts: 12 })) {
            if (late()) return null;
            const r2 = await parse(world, v.text);
            if (r2 && crossTabOk(r2, [...sp.corrections, ...v.corrections])) return wrap(r2, { corrections: [...sp.corrections, ...v.corrections] });
          }
        }
      }
      // RD1b: a lone word that is valid somewhere ("next") is never swapped for a neighbour ("neat"): there is nothing around it to confirm the guess
      const lone = (seg.text.match(/[\p{L}\p{N}]+/gu) ?? []).length < 2;
      for (const world of lone ? [] : ids) {
        for (const v of spellAlternates(seg.text, { vocab: vocabOf(world), protect })) {
          if (late()) return null;
          const res = await parse(world, v.text);
          if (res && crossTabOk(res, v.corrections)) return wrap(res, { corrections: v.corrections });
        }
      }
    }
    if (spell && this._voice && ctx.tabWorld && set.get(ctx.tabWorld)?.patterns?.length && depth === 0) {
      // RP3: spoken garble ("mcdavatara human" for "make avatar a human"): split / merge / sound-alike words against the ACTIVE tab's vocabulary only
      // (never another world: RD1b). Cheap matches are executed, weak ones (two sound-alike pieces) are offered as "Did you mean".
      let cands = [];
      try { cands = garbleCandidates(seg.text, { vocab: worldVocabulary(set, ctx.tabWorld), known: (w) => !!protect?.has(w) || !!spellVocabulary(set).has(w), functionWords: FUNCTION_WORDS }); } catch { cands = []; }
      for (const c of cands) {
        if (late()) return null;
        const res = await parse(ctx.tabWorld, c.text);
        if (!res) continue;
        if (c.cost <= 1) return wrap(res, { corrections: c.corrections });
        return [{ ...seg, suggestions: [c.text.replace(/^./, (x) => x.toUpperCase()) + '.'] }];
      }
      // a weak sound-alike of one of the tab's own words ("Chester" for "chapter"): never executed, offered with the tab's examples that use the word
      let weak = [];
      try { weak = weakSoundAlikes(seg.text, { vocab: worldVocabulary(set, ctx.tabWorld), functionWords: FUNCTION_WORDS, protect }); } catch { weak = []; }
      for (const wk of weak) {
        const ex = (set.get(ctx.tabWorld)?.patterns ?? []).flatMap((p) => p.canonical ?? []).filter((e) => new RegExp(`\\b${wk.to}s?\\b`, 'i').test(e)).sort((a, b) => Number(new RegExp(`\\b${wk.to}\\b`, 'i').test(b)) - Number(new RegExp(`\\b${wk.to}\\b`, 'i').test(a)) || a.length - b.length).slice(0, 2);
        if (ex.length) return [{ ...seg, suggestions: ex }];
      }
    }
    if (partial) {
      // several clauses and none read: every clause on its own (spelling and partial), the unread ones stay "not understood"
      if (depth === 0) {
        const parts = [];
        let from = 0, any = false;
        const cuts = [...seg.text.matchAll(/,|\b(?:and then|and also|and|then|but|also)\b/gi)];
        const pieces = [];
        for (const m of [...cuts, { index: seg.text.length, 0: '' }]) {
          const text = seg.text.slice(from, m.index);
          if (/\p{L}/u.test(text)) pieces.push({ text: text.trim(), start: from + (text.length - text.trimStart().length) });
          from = m.index + m[0].length;
        }
        if (pieces.length > 1) {
          for (const pc of pieces) {
            const sub = { ...seg, text: pc.text, span: [seg.span[0] + pc.start, seg.span[0] + pc.start + pc.text.length] };
            const fixed = await this._lenient(sub, opts, o, 1);
            if (fixed) { any = true; parts.push(...fixed); } else parts.push({ ...sub, unparsed: true, wires: [], match: null, alternatives: [], errors: seg.errors ?? [], corrections: [], ignored: [] });
          }
          if (any) return parts;
        }
      }
      for (const world of ids) {
        if (late()) return null;
        const sp = spelled.get(world);
        const bases = sp?.corrections.length ? [sp, { text: seg.text, corrections: [] }] : [{ text: seg.text, corrections: [] }];
        for (const base of bases) {
          const win = await findPartialWindow(base.text, async (slice) => { const r = await parse(world, slice); return r && !changesIntoQuestion(base.text, slice, r.segments.map((x) => x.match?.kind)) ? r : null; },
            { stop: late, minCoverage: depth ? 0.5 : 0.25, canIgnore: ignorable(vocabOf(world), spellVocabulary(set)) });
          if (win) {
            const used = win.text.toLowerCase();
            return wrap(win.result, { corrections: base.corrections.filter((c) => used.includes(c.to.toLowerCase())), ignored: win.ignored.map((x) => x.text) });
          }
        }
      }
    }
    return null;
  }

  /**
   * Best effort with loose words (spec 03 section 7.15), the very last resort for a segment nobody read: candidate sentences are built from the
   * pattern examples of the candidate worlds with the input's own values, read by the rules and checked by the value checker (nothing invented,
   * nothing numeric or coloured dropped). Returns { segments } (executed) or { suggestions } (Did you mean) or null.
   */
  async _bestEffortSeg(seg, opts) {
    budget.tick('dialog.besteffort');
    const { set, formalizers, interp } = this.engine;
    const P = BEST_EFFORT_POLICY;
    const ctx = this.context();
    const worlds = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...ctx.recentWorlds, ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)]
      .filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length && !(opts.excluded ?? []).includes(w));
    const cands = looseCandidates(set, seg.text, { worlds, tabWorld: ctx.tabWorld });
    if (!cands.length) return null;
    const norm = (wires) => JSON.stringify(wires.map((w) => [w.type, w.entries.filter((e) => !/^core\.(?:via|source|seq|span|in)$/.test(e.key)).map((e) => [e.key, e.value])]));   // what is asked, not how it was phrased
    const verified = [];
    for (const c of cands.slice(0, P.maxVerify)) {
      if (guard.soft()) break;   // turn guard: score what was verified so far
      const vc = checkValues(seg.text, c.text);
      if (!vc.ok) continue;
      let res;
      try { res = await formalizers.rules.formalize(c.text, { ...opts, worlds: restrictedSet(set, [c.world]) }); } catch { continue; }
      if (!res.segments.length || res.segments.some((x) => x.unparsed)) continue;
      let refused = false;
      try {
        const f = this.forkForValidation();
        for (const sg of res.segments) { f.isession.add(sg.wires); for (const w of sg.wires) { const r = interp.resolve(f.isession, w); if (r && (r.status === 'unsupported' || r.status === 'error')) refused = true; } }
      } catch { /* cannot fork: accept */ }
      if (refused) continue;
      verified.push({ c, res, sop: norm(res.segments.flatMap((x) => x.wires)) });
      if (verified.length >= 3) break;
    }
    if (!verified.length) return null;   // nothing the rules read: the usual "Did you mean" of ui.help
    const best = verified[0];
    const rival = verified.find((v) => v.sop !== best.sop);
    if (rival && best.c.score - rival.c.score < P.margin) return { suggestions: [best.c.text, rival.c.text] };
    const real = await formalizers.rules.formalize(best.c.text, { ...opts, worlds: restrictedSet(set, [best.c.world]) });
    const segments = real.segments.map((x, k) => ({ ...x, span: seg.span, strategy: 'rules', corrections: [], ignored: [], ...(k === 0 ? { bestEffort: { took: best.c.text, ignored: best.c.ignored, world: best.c.world } } : {}) }));
    return { segments };
  }

  async _withBestEffort(formal, opts) {
    const segments = [];
    for (const seg of formal.segments) {
      const r = seg.unparsed ? await perf.time('bestEffort', () => this._bestEffortSeg(seg, opts)) : null;
      if (r?.segments) segments.push(...r.segments);
      else segments.push(r?.suggestions ? { ...seg, suggestions: r.suggestions } : seg);
    }
    return { ...formal, segments, wires: segments.flatMap((x) => x.wires) };
  }

  async _withLeniency(res, opts, o) {
    if (!res.segments.some((x) => x.unparsed) || !(o.spell || o.partial)) return res;
    const segments = [];
    o = { ...o, until: performance.now() + LIMITS.lenientMs };   // the whole leniency stage of this message (spelling variants, partial windows) shares one time budget
    for (const seg of res.segments) {
      const fixed = seg.unparsed ? await this._lenient(seg, opts, o) : null;
      if (fixed) segments.push(...fixed); else segments.push(seg);
    }
    return { ...res, segments, wires: segments.flatMap((x) => x.wires) };
  }

  /**
   * Formalize with the preferred strategy, per world falling back to the rule formalizer (spec 06).
   * Each returned segment carries `strategy`. Unparsed encoder segments are retried with the rules.
   */
  /**
   * Encoder fast path: the rules read every segment of `english` completely (no spelling correction, nothing ignored) and the interpreter
   * accepts every reading (nothing unsupported or failing). Tried on a copy of the session, so a refusal leaves no trace; returns the
   * segments read on the real session, or null.
   */
  async _quickRules(english, opts) {
    const { formalizers, interp } = this.engine;
    const clauses = /[,;:\n]|\b(?:and|then|also|but|or|next|after|before|while|so|because|if)\b/i.test(english) || (english.match(/\S+/g)?.length ?? 0) > 8;   // a long message without a connective ("draw a blue house what sound does a duck make ...") is several clauses too   // several clauses: the model segments, the rules alone may cut wrongly
    const encoder = formalizers.encoder;
    if (clauses && !(typeof encoder?.quickSegmentation === 'function' && encoder.ready?.())) return null;
    let f;
    try { f = this.forkForValidation(); } catch { return null; }
    const probe = await perf.time('fast.probe', () => formalizers.rules.formalize(english, { ...opts, session: f.isession, context: f.context(), source: 'fast' }));
    if (probe.segments.length < 1 || probe.segments.length > (clauses ? 4 : 1) || probe.segments.some((s) => s.unparsed || s.corrections?.length || s.ignored?.length || s.partial || (s.routing?.contested && s.routing.runnerUp?.worldId && s.routing.runnerUp.worldId !== s.routing.winner?.worldId))) return null;   // a contested routing (another world read it too: "put it in the top right corner" on the Drawing tab) is the model's to decide
    if (clauses) {   // multi-clause (PERF round 2): one model pass for the segmentation; the fast path holds only when the model cuts exactly where the rules cut and is clearly sure
      const top = await perf.time('fast.segment', () => encoder.quickSegmentation(english, { session: this.isession, context: this.context() }));
      const norm = (t) => t.toLowerCase().replace(/^[\s,;:.!?]*(?:(?:and|then|also|but|so|next|after that)\b[\s,;:]*)*/, '').replace(/[\s,;:.!?]+$/, '').trim();
      if (!top || top.margin < FAST_SEGMENT_MARGIN || top.pieces.length !== probe.segments.length || top.pieces.some((p, i) => norm(p.text) !== norm(probe.segments[i].text) || p.world !== probe.segments[i].routing?.winner?.worldId)) return null;
    }
    try {
      for (const seg of probe.segments) {
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r && (r.status === 'unsupported' || r.status === 'error')) return null; }
      }
    } catch { return null; }
    const res = await perf.time('fast.rules', () => formalizers.rules.formalize(english, opts));
    for (const s of res.segments) s.strategy = 'rules';
    perf.count('fast.path');
    return { segments: res.segments, wires: res.segments.flatMap((s) => s.wires), dispatch: null, fast: true };
  }

  /**
   * The interpreter's statuses (supported, missing, unsupported, error ...) of a reading on a copy of the session (a dry run: the actions run on the copy). The
   * spelling stage, the name repair and the capability check all ask this of the SAME reading of the SAME message (one `segments` array), and a dry run of an
   * action is a whole execution of it, so the answer is kept for the array within the turn (the session does not change before the real run).
   */
  _dryStatuses(segments) {
    const hit = this._dryMemo?.get(segments);
    if (hit && hit.msg === this._msg) return [...hit.out];
    const out = [];
    try {
      const f = this.forkForValidation();
      for (const seg of segments) {
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = this.engine.interp.resolve(f.isession, w); if (r?.status) out.push(r.status); }
      }
    } catch { return out; /* no dry run: no statuses (not kept) */ }
    (this._dryMemo ??= new WeakMap()).set(segments, { msg: this._msg, out: [...out] });
    return out;
  }

  /**
   * Active world first (RD1, spec 03 section 7.9a): a message the rules read completely can still carry a typo that another world's free slot
   * swallowed ("bugger house pls" read as "where do buggers live") or that the active world's own free tail hides ("nect to a house").
   * The text is spell-corrected against the vocabulary of the OPEN TAB's world only. The corrected reading replaces the original when
   * (1) every corrected word is unknown to every world (a real word of any world is never "corrected"), (2) the corrected text is read
   * completely, with nothing ignored, by the active world's own rules, and (3) the original reading is weaker: it belongs to another world,
   * or the world refused it (unsupported). Returns the segments of the corrected reading, or null (keep the original).
   */
  async _activeSpell(english, res, opts, lenient) {
    budget.tick('dialog.spell');
    if (!lenient.spell || !res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    const { set, formalizers, interp } = this.engine;
    const ctx = opts.context ?? this.context();
    const world = ctx.tabWorld;
    if (!world || !set.get(world)?.patterns?.length) return null;   // an open modal input that did not consume the message does not matter here
    // the dry run of a reading on a copy of the session: the interpreter's statuses (supported, missing, unsupported, error ...)
    const statusesOf = (segments) => this._dryStatuses(segments);
    const refused = (segments) => statusesOf(segments).some((x) => x === 'unsupported' || x === 'error');
    // is the original weaker? another world read it, or the interpreter refused it
    const origStatuses = statusesOf(res.segments);
    const wasRefused = origStatuses.some((x) => x === 'unsupported' || x === 'error');
    const unhappy = origStatuses.some((x) => x !== 'supported');   // missing, refused, failed: the reading did not do what it said
    const weak = wasRefused || res.segments.some((x) => x.match?.worldId && x.match.worldId !== world && x.match.worldId !== 'ui.shell');
    if (!weak) return null;   // (PERF round 3: the vocabularies below are only built for a weak reading, not for every message)
    // a word some world knows ("yes" for "eyes") is changed only when another world read the original and did not carry it out, or the interpreter refused it; a word nobody knows is a typo whenever the original is weak
    const otherWorld = res.segments.some((x) => x.match?.worldId && x.match.worldId !== world && x.match.worldId !== 'ui.shell');
    const knownToo = otherWorld && (wasRefused || unhappy);   // the wrong world read it and did not carry it out
    // a typo can only hide in a free-text slot (noun, word, words, rest, agent, recent), in a corrected or an ignored word: a reading whose words all matched literals
    // or lexicon entries has no unknown word to repair (PERF round 3: "hello" no longer builds the spelling vocabularies of the first message)
    const FREE = new Set(['noun', 'word', 'words', 'rest', 'agent', 'recent']);
    if (!knownToo && !res.segments.some((x) => x.corrections?.length || x.ignored?.length || x.partial || !x.match || Object.values(x.match.slots ?? {}).some((sl) => FREE.has(sl?.class)))) return null;
    const global = spellVocabulary(set);
    let words;
    try { words = spellCandidates(english, { vocab: worldVocabulary(set, world), protect: protectedWordsOf(set, world) }); } catch { return null; }
    if (!knownToo) words = words.filter((c) => !isKnownWord(c.from.toLowerCase(), global));
    else if (!(otherWorld && wasRefused)) words = words.filter((c) => c.from.length < 4 || !isKnownWord(c.from.toLowerCase(), global));   // a content word some world knows ("shape") is never swapped; only short ones ("yes")
    // candidate texts: the best neighbour of every unknown word, then each word's other neighbours one at a time
    const replace = (text, picks) => { let out = text; for (const [c, w] of [...picks].sort((x, y) => y[0].span[0] - x[0].span[0])) out = out.slice(0, c.span[0]) + w + out.slice(c.span[1]); return out; };
    const texts = [];
    if (words.length) texts.push({ text: replace(english, words.map((c) => [c, c.options[0]])), picks: words.map((c) => ({ from: c.from, to: c.options[0], span: c.span })) });
    for (const c of words) for (const w of c.options.slice(1)) texts.push({ text: replace(english, [[c, w]]), picks: [{ from: c.from, to: w, span: c.span }] });
    // a refused reading may hide a typo that spells another word of the active world ("yes" for "eyes"): one known word swapped for a neighbour
    if (knownToo) for (const v of spellAlternates(english, { vocab: worldVocabulary(set, world), protect: protectedWordsOf(set, world) })) { if (!v.corrections.some((c) => sameWordForm(c.from.toLowerCase(), c.to.toLowerCase()) || (!(otherWorld && wasRefused) && c.from.length >= 4 && isKnownWord(c.from.toLowerCase(), global)))) texts.push({ text: v.text, picks: v.corrections }); };
    if (!texts.length) return null;
    for (const t of texts.slice(0, 12)) {
      let fixed;
      try { fixed = await formalizers.rules.formalize(t.text, { ...opts, worlds: set, session: this.isession, source: opts.source, context: ctx, router: this.engine.router }); } catch { continue; }
      if (!fixed.segments.length || fixed.segments.some((x) => x.unparsed || x.partial || x.ignored?.length)) continue;
      if (!fixed.segments.some((x) => x.match?.worldId === world) || refused(fixed.segments)) continue;
      const segments = fixed.segments.map((x) => ({ ...x, strategy: 'rules', corrections: [...(x.corrections ?? []), ...t.picks.map((p) => ({ ...p, kind: 'spell' }))], activeSpell: true }));
      return { segments, wires: segments.flatMap((x) => x.wires) };
    }
    return null;
  }


  /**
   * RD1b: a spelling correction never opens another world's tab on its own. A reading of a world other than the open tab's that owns a tab is
   * rejected when a free-text slot of that world (a catch-all) swallows most of the sentence, unless the message names the world.
   */
  /** Worlds whose name (tab or object: avatar, chart, map ...) occurs anywhere in `text` (no determiner needed, unlike routing's `namedWorlds`). */
  _worldsNamedIn(text) {
    const padded = ` ${text.toLowerCase().match(/[a-z0-9]+/g)?.join(' ') ?? ''} `;
    return new Set([...namingTables(this.engine.set).names].filter(([, list]) => list.some((n) => padded.includes(` ${n} `))).map(([w]) => w));
  }

  _crossTabOk(segments, corrections, ctx, text) {
    if (!ctx.tabWorld || !corrections?.length) return true;
    const { set } = this.engine;
    const fixedText = corrections.reduce((t, c) => t.replace(c.from, c.to), text);   // a world named through the correction ("vatar" -> avatar) is named
    const namedNow = this._worldsNamedIn(`${text} ${fixedText}`);
    return segments.every((x) => {
      const w = x.match?.worldId;
      if (!w || w === ctx.tabWorld || w === 'ui.shell' || w === 'ui.help' || namedNow.has(w) || !(set.get(w)?.tab || BUILTIN_TAB[w])) return true;
      // the world "read" the sentence only if a catch-all does not swallow most of it (a search query, a name sink taking a typo for text)
      const free = Object.values(x.match?.slots ?? {}).filter((sl) => sl.class === 'rest' || sl.class === 'words').reduce((n, sl) => n + (String(sl.text ?? sl.value ?? '').match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0);
      const total = (x.text ?? text).match(/[\p{L}\p{N}]+/gu)?.length ?? 1;
      return !(corrections.some((c) => (c.kind ?? 'spell') === 'spell') && free * 2 > total);
    });
  }

  /**
   * Make the lazily loaded engines (ops `prepare()`, spec 04) of the segments' worlds ready before a dry run: the real run awaits them
   * (see _send), a dry run on a fork would otherwise get "the engine is still loading" (`missing`) and wrongly reject a good reading (RP5c).
   */
  async _prepareWorldsOf(segments) {
    for (const w of new Set(segments.map((x) => x.match?.worldId).filter(Boolean))) {
      const prep = this.engine.set.get(w)?.ops?.prepare;
      if (typeof prep === 'function') { try { await prep(); } catch { /* the operation then says it is not ready */ } }
    }
  }

  /**
   * Capability check (RD10, spec 03 section 7.9c): a world claims a sentence only if it can do it. A reading of a world other than the open
   * tab's (or, when the message names another world, of the tab's world too) whose dry run on a copy of the session is refused or finds nothing
   * to act on ("change avatar to a man" read by the editor when "avatar" is not in the document) drops, and the message is read again without
   * that world: exactly, then with the spelling stage (so "change vatar to a man" reaches the avatar). When nothing else reads it, the original
   * reading stays (its answer explains what is missing). Returns the segments of the new reading, or null.
   */
  /**
   * Name repair (RD10): a free-text slot read a misspelt proper name as an unknown value ("Play Little Almb": "I do not know a song called ...").
   * When a reading found nothing to act on (`missing`) and a lexicon value is close to a window of the message, the message is read again with the
   * value; the new reading must be read completely and carried out (no `missing`, no refusal). Returns the segments, or null.
   */
  async _nameRepair(english, res, opts, lenient) {
    budget.tick('dialog.names');
    if (!lenient.spell || !res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    await this._prepareWorldsOf(res.segments);
    const { set, formalizers, interp } = this.engine;
    const ctx = opts.context ?? this.context();
    const dry = (segments) => this._dryStatuses(segments);
    if (!dry(res.segments).includes('missing')) return null;   // (PERF round 3: the cheap test first; the name vocabulary is built only when something is missing)
    let cands;
    try { cands = nameCandidates(english, { set, vocab: spellVocabulary(set), worldOrder: [...new Set([ctx.tabWorld, ...(ctx.recentWorlds ?? [])].filter(Boolean).flatMap((w) => set.available(w)))] }); } catch { return null; }
    if (!cands.length) return null;
    const t0 = Date.now();
    for (const cand of cands.slice(0, 3)) {
      if (Date.now() - t0 > 300) break;
      let fixed;
      try { fixed = await formalizers.rules.formalize(cand.text, { ...opts, worlds: set, session: this.isession, source: opts.source, context: ctx, router: this.engine.router }); } catch { continue; }
      if (!fixed.segments.length || fixed.segments.some((x) => x.unparsed || x.partial || x.ignored?.length)) continue;
      if (dry(fixed.segments).some((x) => x !== 'supported')) continue;
      const segments = fixed.segments.map((x) => ({ ...x, strategy: 'rules', corrections: [...(x.corrections ?? []), ...cand.corrections] }));
      return { segments, wires: segments.flatMap((x) => x.wires) };
    }
    return null;
  }

  async _capability(english, res, opts, lenient) {
    const rep = await this._nameRepair(english, res, opts, lenient);
    if (rep) return rep;
    const r = await this._capabilityRead(english, res, opts, lenient);
    if (r || !res.segments.length) return r;
    // nothing else read the message and the only reading rests on a correction that would open another world's tab: it is not understood
    const ctx = opts.context ?? this.context();
    const cross = res.segments.filter((x) => !x.unparsed && x.corrections?.length && !this._crossTabOk([x], x.corrections, ctx, english));
    if (!cross.length) return null;
    const segments = res.segments.map((x) => (cross.includes(x) ? { ...x, unparsed: true, wires: [], match: null, alternatives: [], errors: [], corrections: [], ignored: [] } : x));
    return { segments, wires: segments.flatMap((x) => x.wires) };
  }

  async _capabilityRead(english, res, opts, lenient) {
    budget.tick('dialog.capability');
    if (!res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    const { set, formalizers, interp } = this.engine;
    const ctx = opts.context ?? this.context();
    const named = namedWorlds((english.toLowerCase().match(/[a-z0-9]+/g) ?? []).map((w) => ({ kind: 'word', lower: w, raw: w })), namingTables(set).names);
    const SKIP = new Set(['ui.shell', 'ui.help', 'core', 'lang.common']);
    await this._prepareWorldsOf(res.segments);
    const suspect = res.segments.filter((x) => { const w = x.match?.worldId; return w && !SKIP.has(w) && (w !== ctx.tabWorld || (named.size > 0 && !named.has(w)) || (!!ctx.lastWorld && ctx.lastWorld !== w && !SKIP.has(ctx.lastWorld))); });
    const crossBad = res.segments.filter((x) => x.corrections?.length && !this._crossTabOk([x], x.corrections, ctx, english)).map((x) => x.match.worldId);
    if (!suspect.length && !crossBad.length) return null;
    const bad = new Set(crossBad);
    try {
      const f = this.forkForValidation();
      for (const seg of res.segments) {
        f.isession.add(seg.wires);
        if (!suspect.includes(seg)) continue;
        for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r?.status === 'missing') bad.add(seg.match.worldId); }
      }
    } catch { return null; }
    if (!bad.size) return null;
    const excluded = [...bad];
    const all = set.list().filter((w) => !excluded.includes(w.id));
    const view = Object.create(set);
    view._cache = new Map();
    view.parent = set.parent ?? set;
    view.list = () => all;
    const o2 = { ...opts, worlds: view, excluded };
    let r2;
    try { r2 = await formalizers.rules.formalize(english, o2); } catch { return null; }
    r2.segments.forEach((s) => { s.strategy = 'rules'; });
    if (r2.segments.some((x) => x.unparsed) && (lenient.spell || lenient.partial)) {
      try { r2 = await this._withLeniency(r2, o2, lenient); } catch { return null; }
    }
    if (r2.segments.length === 1 && r2.segments[0].unparsed && this._beNow) { try { r2 = await this._withBestEffort(r2, o2); } catch { return null; } }
    if (!r2.segments.length || r2.segments.some((x) => x.unparsed)) return null;
    // a word some world knows, or an inflection of its correction ("move" -> "moves"), is never a typo here
    const gv = spellVocabulary(set);
    if (r2.segments.some((x) => (x.corrections ?? []).some((c) => c.kind !== 'abbreviation' && (sameWordForm(c.from.toLowerCase(), c.to.toLowerCase()) || isKnownWord(c.from.toLowerCase(), gv))))) return null;
    // the new reading must be the one the user meant: its world is named in the message (also after the corrections: "vatar" -> avatar), owns the open tab, or answered recently
    let fixedText = english;
    for (const sg of r2.segments) for (const c of sg.corrections ?? []) fixedText = fixedText.replace(c.from, c.to);
    const meant = new Set([...named, ...this._worldsNamedIn(`${fixedText} ${r2.segments.map((x) => x.bestEffort?.took ?? '').join(' ')}`), ctx.tabWorld, ...(ctx.recentWorlds ?? [])]);
    if (!r2.segments.every((x) => !x.match?.worldId || x.match.worldId === 'ui.shell' || x.match.worldId === 'ui.help' || meant.has(x.match.worldId))) return null;
    try {
      const f = this.forkForValidation();
      for (const seg of r2.segments) { f.isession.add(seg.wires); for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r?.status === 'unsupported' || r?.status === 'error') return null; } }
    } catch { return null; }
    r2.segments.forEach((s) => { s.strategy ??= 'rules'; });
    return { segments: r2.segments, wires: r2.segments.flatMap((s) => s.wires) };
  }

  /**
   * Formalize one message (spec 03 section 7.16). The NX strategy picks who reads first:
   *   rules   the shipped path (`_formalizeShipped`)
   *   hybrid  the shipped path, then the model reads the segments it left unparsed (gate and validator)
   *   neural  the model reads the whole message first; any segment it does not read sends the message to the shipped path
   * The model is only asked when the encoder formalizer is preferred, the model is ready and ORT is not paused; a model failure keeps the rules' answer.
   */
  async _formalize(english, sid, preferred = this.formalizer, lenient = { spell: this.spell, partial: this.partial, fastPath: this.fastPath }) {
    budget.tick('dialog.formalize');
    const want = preferred === 'encoder' ? normalizeNxStrategy(lenient.nx ?? this.nx) : 'rules';
    const nx = want !== 'rules' ? this.engine.formalizers.nx : null;
    let on = false;
    try { on = !!nx && nx.available(); } catch { on = false; }
    const tag = (r, by) => { r.nx = { strategy: want, model: on, by }; return r; };
    if (!on) return tag(await this._formalizeShipped(english, sid, preferred, lenient), 'rules');
    const { set } = this.engine;
    const opts = { worlds: set, session: this.isession, source: sid, context: this.context(), router: this.engine.router };
    if (want === 'neural') {
      try {
        if (!nx.untrainedReads(english, opts)) {
          const r = await perf.time('nx', () => guard.abortable(nx.formalize(english, opts), 'nx'));
          if (r.complete) return tag({ segments: r.segments, wires: r.wires, dispatch: null }, 'model');
        }
      } catch (e) { if (e instanceof TurnAborted) throw e; /* the model failed: the rules path answers */ }
    }
    const res = await this._formalizeShipped(english, sid, preferred, lenient);
    if (want === 'hybrid' && res.segments.some((x) => x.unparsed)) {
      try {
        const o2 = { ...opts, context: this.context() };
        const refined = await perf.time('nx', () => guard.abortable(nx.refine(res, o2), 'nx'));
        return tag(refined, refined === res ? 'rules' : 'model');
      } catch (e) { if (e instanceof TurnAborted) throw e; }
    }
    return tag(res, 'rules');
  }

  async _formalizeShipped(english, sid, preferred = this.formalizer, lenient = { spell: this.spell, partial: this.partial, fastPath: this.fastPath }) {
    const { set, formalizers } = this.engine;
    const opts = { worlds: set, session: this.isession, source: sid, context: this.context(), router: this.engine.router };
    const rules = formalizers.rules;
    const enc = preferred === 'encoder' ? formalizers.encoder : null;
    let usable = false, encoderError = null;
    try { usable = !!enc && !!(await perf.time('encoder.available', () => guard.abortable(enc.available(), 'encoder.available'))) && set.list().some((w) => enc.supports(w)); } catch { usable = false; }
    if (usable && lenient.fastPath) { const quick = await this._quickRules(english, opts); if (quick) return quick; }
    if (usable) {
      try {
        const res = await perf.time('encoder', () => guard.abortable(enc.formalize(english, opts), 'encoder'));
        const segments = [];
        for (const seg of res.segments) {
          if (!seg.unparsed) { segments.push({ ...seg, strategy: 'encoder' }); continue; }
          const sub = await perf.time('rules.retry', () => rules.formalize(seg.text, { ...opts, source: sid }));
          const shift = seg.span[0];
          for (const s of sub.segments) segments.push({ ...s, span: [s.span[0] + shift, s.span[1] + shift], strategy: 'rules' });
        }
        const cap = await this._capability(english, { segments, wires: [] }, opts, lenient);
        if (cap) return { ...cap, dispatch: res.dispatch ?? null };
        const active = await this._activeSpell(english, { segments, wires: [] }, opts, lenient);
        if (active) return { segments: active.segments, wires: active.segments.flatMap((s) => s.wires), dispatch: res.dispatch ?? null };
        const done = await this._withLeniency({ segments, wires: [] }, opts, lenient);
        return { segments: done.segments, wires: done.segments.flatMap((s) => s.wires), dispatch: res.dispatch ?? null };
      } catch (e) { encoderError = e?.message ?? String(e); /* the encoder failed: fall through to the rules */ }
    }
    const res = await perf.time('rules', () => rules.formalize(english, opts));
    for (const s of res.segments) s.strategy = 'rules';
    if (encoderError) res.encoderError = encoderError;
    const cap = await this._capability(english, res, opts, lenient);
    if (cap) { if (encoderError) cap.encoderError = encoderError; return cap; }
    const active = await this._activeSpell(english, res, opts, lenient);
    if (active) { active.segments.forEach((s) => { s.strategy ??= 'rules'; }); if (encoderError) active.encoderError = encoderError; return active; }
    const done = await this._withLeniency(res, opts, lenient);
    done.segments.forEach((s) => { s.strategy ??= 'rules'; });
    if (encoderError) done.encoderError = encoderError;
    return done;
  }

  /** The message-level correction phase; `probe` reads a text with the rules, side-effect free with the rules (only used for ambiguous short clauses). */
  async _correct(english) {
    const { set, formalizers } = this.engine;
    const probe = async (t) => {
      try {
        const r = await formalizers.rules.formalize(t, { worlds: set, session: this.isession, source: 'probe', context: this.context(), router: this.engine.router });
        return r.segments.length > 0 && r.segments.every((x) => !x.unparsed) ? r.segments.map((x) => x.match?.patternId).join('+') : null;
      } catch { return null; }
    };
    return correctMessage(english, { probe });
  }

  /** ASTRA bookkeeping at the end of a turn (spec 13): typed moves, attribution to a discussion, tab resume. Never throws, never reads. */
  _astraTurn({ sid, english, meta, pre, pend, segments, state, stateBefore, tabBefore }) {
    const a = this.astra;
    if (!a) return;
    try {
      const moves = recognize({ text: english, meta: meta?.info, pre: pre?.info, consumed: pend, yesNo: pend?.type === 'confirm' ? this.engine.interp.lang.yesNo(english) : null, segments });
      const open = this.discourse.pending;
      if (open?.question) moves.push({ type: 'ask', text: open.question, world: open.world ?? null, source: 'system' });
      const tabAfter = this.isession.state['ui.shell']?.activeTab ?? null;
      a.afterTurn({ msgId: sid, text: english, changed: Object.keys(state), before: stateBefore, tab: tabAfter, moves });
      mirrorFrames(this, { consumed: pend, open, turn: this._msg });
      if (tabAfter && tabAfter !== tabBefore) a.onTabChange(tabAfter);
    } catch { /* bookkeeping must never break a turn */ }
  }

  /** Discussions of this chat as panel data (spec 13 section 8): `{ tab, status, world }` filters. */
  discussions(filter = {}) { return panel(this.astra, filter); }

  /** Persist / restore the discussions through a localStorage-like backend (`new Storage(backend)` from src/astra). Restoring runs no effect. */
  saveDiscussions(storage) { return storage.save(this.astra); }
  loadDiscussions(storage) { return storage.load(this.astra); }

  /** One message in, one reply out. Opens the stage-timing record (`reply.perf`, see formalizer/perf.mjs) unless this is a nested replay. */
  async send(text, opts = {}) {
    const own = perf.start();
    // Turn guard (spec 06 "Turn lifecycle"): the outermost send installs the abort signal and the deadlines; nested sends (validator replays) inherit them.
    const g = guard.install({ signal: opts.signal ?? null, hardMs: opts.hardMs ?? Infinity, softMs: opts.softMs ?? Infinity, force: !!opts.signal });
    // Compute budget (spec 06 "Compute budgets"): one per turn, passed down through the shared `budget` handle; nested sends join the outer turn's budget.
    const tb = opts.budget ?? createBudget();
    const bt = installBudget(tb, { force: !!opts.budget });
    const snap = g || bt ? (opts.undo ?? this.snapshot()) : null;   // a host that passes `undo` (its own snapshot) restores the session itself
    try {
      const reply = await this._send(text, opts);
      if (g) guard.check('end');   // (checks the shared guard)   // a stage that swallowed the abort must not let a half-done turn through
      if (bt && tb.exceeded) throw tb.exceeded;   // a stage that swallowed BudgetExceeded must not let a half-done turn through
      if (own && reply && typeof reply === 'object') reply.perf = perf.end();
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
    } finally { if (own) perf.end(); guard.release(g); releaseBudget(bt); }
  }

  /**
   * The conversation memory as plain JSON: discourse (frames, pending question, actions, topics ...), the ASTRA discussions and instances, the recent worlds
   * and the last game. A host that has to replace the engine (the page restarts its worker after a runaway turn) keeps it next to the world states and gives
   * it back with `restoreMemory`. It survives `JSON.stringify` and `structuredClone`.
   */
  memoryJSON() {
    let astra = null;
    try { astra = this.astra ? astraSnapshot(this.astra) : null; } catch { astra = null; }
    return { v: 1, discourse: this.discourse.toJSON(), astra, recent: [...(this._recentWorlds ?? [])], lastGame: this._lastGame ?? null };
  }

  /** Puts a `memoryJSON()` record back (a bad record changes nothing it cannot read). Runs no effect. */
  restoreMemory(mem) {
    if (!mem || typeof mem !== 'object' || mem.v !== 1) return false;
    this.discourse.load(mem.discourse);
    if (mem.astra && this.astra) { try { astraRestore(this.astra, mem.astra); } catch { /* the discussions start empty */ } }
    if (Array.isArray(mem.recent)) this._recentWorlds = [...mem.recent];
    if (mem.lastGame !== undefined) this._lastGame = mem.lastGame;
    return true;
  }

  /** Undo snapshot of everything a turn can change (interpreter session, discourse memory, recent worlds, message counter). */
  snapshot() {
    const { dialog, ...dis } = this.discourse;
    return {
      isession: this.isession.clone(), msg: this._msg, recent: [...(this._recentWorlds ?? [])], lang: [this._sessionLang, this._weakRo],
      discourse: { ...dis, frames: [...dis.frames], actions: [...dis.actions], topics: [...dis.topics], lastByWorld: { ...dis.lastByWorld } },
      sources: new Set(this.sources.keys()), astra: this.astra?.capture(),
    };
  }

  /** Puts the session back to a snapshot taken by `snapshot()`. */
  restore(snap) {
    if (!snap) return;
    this.isession = snap.isession; this._msg = snap.msg; this._recentWorlds = snap.recent; [this._sessionLang, this._weakRo] = snap.lang;
    Object.assign(this.discourse, snap.discourse);
    this.astra?.rollback(snap.astra);
    for (const k of [...this.sources.keys()]) if (!snap.sources.has(k)) this.sources.delete(k);
  }

  async _send(text, { language, formalizer, spell, partial, fastPath, bestEffort, mode, nx } = {}) {
    const { engine } = this;
    this._voice = mode === 'voice';   // spoken input: stutter and send words are cleaned, garbled words repaired against the active tab's world (voice.mjs)
    { const v = cleanVoice(text, { voice: this._voice }); if (v.corrections.length && v.text.trim()) text = v.text; }
    const { set, interp, translator } = engine;
    const sid = `msg${++this._msg}`;
    this._beNow = bestEffort ?? this.bestEffort;
    const wanted = language ?? this.language;
    let lang = 'en', translation = null, english = text;
    if (translator) {
      lang = wanted === 'auto' ? langOf(await perf.time('detect', () => guard.abortable(translator.detectLanguage(text), 'detect'))) : (wanted === 'ro' ? 'ro' : 'en');
      // LANG-FIXED: an explicit language ('en' or 'ro', what the webchat always passes) is the language of every message: no detection, no override by evidence,
      // no switch of the host's selector. English words in a Romanian message (names, "ok", "stop") go through the Romanian pipeline. Only the CLI/server mode
      // 'auto' detects: RD5 there: the language comes from strong evidence. English with a typo ("eys express fear") is never read as Romanian, and a weak
      // Romanian reading (a browser guess, one ambiguous word) switches an automatic session only when it repeats.
      if (wanted === 'auto') {
        const ev = typeof translator.evidence === 'function' ? await guard.abortable(translator.evidence(text), 'detect') : null;
        if (ev?.strongEn && lang !== 'en') { lang = 'en'; this._sessionLang = 'en'; this._weakRo = 0; }
        else if (lang === 'ro' && ev && !ev.strongRo && this._sessionLang !== 'ro') {   // a short or ambiguous input ("e", "ok") keeps the language of the session (default English)
          this._weakRo = (this._weakRo ?? 0) + 1;
          lang = this._weakRo >= 2 ? 'ro' : (this._sessionLang ?? 'en');
          if (lang === 'ro') { this._sessionLang = 'ro'; this._weakRo = 0; }
        } else if (lang === 'unknown') lang = this._sessionLang ?? 'en';
        else { this._sessionLang = lang; this._weakRo = 0; }
      }
      if (lang !== 'en' && lang !== 'unknown') {
        const heard = lang === 'ro' ? soundAlikes(text, this.context().tabWorld) : text;
        translation = await perf.time('translate', () => guard.abortable(translator.translate(heard, { from: lang, to: 'en' }), 'translate'));
        english = textOf(translation) ?? text;
        // an engine that returns the Romanian text unchanged ("șterge peștii", "Fă o gură mare") is retried through the rules translator, which covers the app's own verbs and nouns
        const rules = translator.rules;
        if (rules && rules !== translator && lang === 'ro' && english.trim().toLowerCase() === text.trim().toLowerCase()) {
          try { const again = await guard.abortable(rules.translate(heard, { from: lang, to: 'en' }), 'translate'); if (textOf(again) && textOf(again).trim().toLowerCase() !== text.trim().toLowerCase()) { translation = again; english = textOf(again); } } catch { /* keep the first reading */ }
        }
      } else lang = 'en';
    }
    // LANG-FIXED: an explicit "switch the language" command is read as such in either language, whatever language is selected ("treci pe engleză" while English is selected)
    { const switchTo = languageCommand(text); if (switchTo) english = switchTo; }
    this.sources.set(sid, { original: text, english, lang, alignment: translation?.alignment });
    // Correction phase (spec 03 section 1c, review G2): "knight to f3, no, knight to c3" is resolved on the whole message, before the
    // modal interceptors, discourse, segmentation and routing, so the abandoned variant never has an effect.
    english = splitAnswerList(engine.interp.lang.stripFiller(english) || english);   // "lol ok and ...", "uhh and a pig?": leading hesitation never reaches a world
    const selfCorrections = await perf.time('correct', () => this._correct(english));
    if (selfCorrections.corrections.length) english = selfCorrections.text;

    const stateBefore = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.rs?.beginTurn(this._msg);   // the library as it is now is what this turn can be taken back to (spec 15)
    this.isession.effects = [];
    const disc = this.discourse;
    const tabBefore = this.isession.state['ui.shell']?.activeTab;
    const pend = disc.takePending();   // an expectation lives for one turn (spec 11)
    const icpt = interp.intercept(this.isession, english);   // modal input (spec 07 section 2)
    let pre = null;   // discourse resolution (spec 11): the reply fills a pending argument, or a fragment is an ellipsis of an earlier frame
    let meta = null;  // meta-dialogue (spec 11 sections 6-14): cancel, repeat, explain, feedback, topic, list mode, repair, degree, references
    let formalText = english;
    if (!icpt) {
      meta = await perf.time('discourse', () => disc.meta(english, pend, sid));
      if (meta?.rewrite) formalText = meta.rewrite;
      if (meta?.pre) pre = meta.pre;
      if (!pre && !meta) {
        if (pend?.type === 'fill') pre = await disc.fill(pend, english, sid);
        if (!pre) pre = await perf.time('discourse', () => disc.ellipsis(english, sid));
        if (!pre) pre = await disc.pronoun(english, sid);
        // "and how many days are in a week?" with nothing to continue: the connective joins nothing, the question stands on its own
        // "and a heading Dairy too": a fragment nothing could continue loses its trailing "too" (it must not become part of the text)
        if (!pre && english !== engine.interp.lang.stripConnective(english)) formalText = engine.interp.lang.stripTrailing(english);
        if (!pre) { const bare = engine.interp.lang.stripConnective(english); if (bare !== english && QUESTION_WORD.test(bare)) formalText = bare; }
      }
    }
    let formal = icpt || meta?.reply != null ? { segments: [], wires: [] } : pre ? { ...pre.res, dispatch: null } : await perf.time('formalize', () => this._formalize(formalText, sid, formalizer ?? this.formalizer, { spell: spell ?? this.spell, partial: partial ?? this.partial, fastPath: fastPath ?? this.fastPath, nx: nx ?? this.nx }));
    if (meta?.rewrite && !pre) for (const sg of formal.segments) sg.discourse = meta.info;
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      pre = await disc.ellipsis(english, sid, { bare: true });
      if (pre) formal = { ...pre.res, dispatch: null };
    }
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      // RD10: a bare coordinate ("B1") with no game running and no game tab open is a game move without a game: offer to start one
      const cm = /^\s*(?:play\s+)?([a-h])\s*([1-8])\s*[.!]?\s*$/i.exec(english);
      const gctx = this.context();
      if (cm && !gctx.gameWorld && !String(gctx.tabWorld ?? '').startsWith('games.')) {
        const sq = `${cm[1]}${cm[2]}`, label = sq.toUpperCase();
        const ttt = /^[a-c][1-3]$/i.test(sq);
        const question = ttt ? 'Do you want to play tic-tac-toe or chess?' : 'Do you want to play chess?';
        disc.pending = { type: 'offer', accept: 'rewrite', rewrite: ttt ? `play tic tac toe and ${sq}` : `play chess and play ${sq}`, world: ttt ? 'games.tictactoe' : 'games.chess', expected: 'yes/no', question, turn: this._msg };
        formal = { segments: [], wires: [] };
        meta = { reply: `${label} looks like a game move. ${question}`, status: 'unparsed', info: { kind: 'offer', offer: 'game', coordinate: label } };
      }
    }
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      // "open the music tab instead": a trailing softener the command does not need
      const bare = engine.interp.lang.stripTrailing(formalText);
      if (bare && bare !== formalText) { const f2 = await this._formalize(bare, sid, formalizer ?? this.formalizer, { spell: spell ?? this.spell, partial: partial ?? this.partial }); if (f2.segments.length && f2.segments.every((x) => !x.unparsed)) formal = f2; }
    }
    if (!icpt && !pre && !meta && (bestEffort ?? this.bestEffort) && formal.segments.length === 1 && formal.segments[0].unparsed) {   // one unparsed clause: a fragment of a longer message is never guessed
      formal = await this._withBestEffort(formal, { worlds: set, session: this.isession, source: sid, context: this.context(), router: this.engine.router });
    }
    const { segments, wires, dispatch, encoderError } = formal;
    this._noteWorlds(segments);
    const tInterp = perf.active ? performance.now() : 0;
    const T = (text, extra = {}) => ({ text, translate: true, ...extra });
    const lines = icpt?.reply ? [[T(icpt.reply)]] : [];   // each line is an array of parts [{ text, translate, quote? }]
    if (meta?.reply != null) lines.push(meta.parts ?? [T(meta.reply)]);
    else if (meta?.prefix) lines.push([T(meta.prefix)]);
    const answers = [];
    const statuses = icpt || meta?.reply != null ? [meta?.status ?? 'supported'] : [];
    const ops = [];
    const answerWires = [];
    let followTab = null;   // tab of the last world that gave a supported answer (tab follow, spec 07 section 6)
    const fillerOnly = (t) => { const w = t.toLowerCase().match(/[\p{L}']+/gu) ?? []; return w.length > 0 && w.every((x) => FUNCTION_WORDS.has(x)); };
    let segNo = 0;
    for (const seg of segments) {
      // a leftover made only of filler words ("also", "and", "please") next to something that was understood is not worth an error
      if (seg.unparsed && (partial ?? this.partial) && fillerOnly(seg.text) && segments.some((x) => !x.unparsed)) continue;
      if (seg.bestEffort) {
        const line = [T('I took that as: '), { text: `"${seg.bestEffort.took}"`, translate: false, quote: true }];
        if (seg.bestEffort.ignored?.length) { line.push(T(' (I did not use ')); seg.bestEffort.ignored.forEach((x, k) => { if (k) line.push(T(' and ')); line.push({ text: `"${x}"`, translate: false, quote: true }); }); line.push(T(')')); }
        lines.push(line);
      }
      if (seg.unparsed) {
        // examples from the world of the open tab first: the router's word-overlap guess can point anywhere
        const routed = seg.worlds.map((w) => w.id), here = Object.entries(this.focus()).find(([, n]) => n >= 3)?.[0];
        let ex = examplesFor(set, here ? [here, ...routed.filter((w) => w !== here)] : routed);
        // ui.help: "Did you mean ...?" (closest examples of all worlds) and a note of what failed for "why not?"
        const helpW = set.get('ui.help');
        const dym = [...(helpW?.ops?.didYouMean?.({ text: seg.text, worlds: set.list(), tabWorld: here, recentWorlds: this._recentWorlds ?? [] }) ?? [])];
        if (helpW) (this.isession.state['ui.help'] ??= {}).lastUnparsed = { text: seg.text, world: here ?? routed[0] ?? null, suggestions: dym };
        if (seg.suggestions?.length) dym.splice(0, dym.length, ...seg.suggestions);   // best effort: the two best readings of the loose words
        if (dym.length) { ex = dym; this.isession.effects.push({ name: 'chat.suggest', args: { items: dym }, world: 'ui.help' }); }
        // the user's own words are quoted verbatim and never back-translated
        const quoted = lang === 'en' ? seg.text : originalSentence(text, seg, translation?.alignment);
        const line = [T('I did not understand '), { text: `"${quoted}"`, translate: false, quote: true }, { text: '.', translate: false }];
        const exEn = ex;
        let exShown = ex;
        if (lang !== 'en' && translator) {
          // every example is a simple English sentence: translate each one separately; all or none (a half translated list would mix the languages)
          const done = [];
          for (const e of ex) {
            try {
              const r = await guard.abortable(translator.translate(e, { from: 'en', to: lang }), 'translate');
              if (textOf(r) && !r.unknown?.length && !r.untranslatable?.length && !(translator.leftovers?.(textOf(r), lang) ?? []).length) done.push(textOf(r).trim());
            } catch { /* this example stays untranslated */ }
          }
          exShown = done.length === ex.length ? done : ex;
        }
        if (exShown.length) {
          line.push(dym.length ? T(' Did you mean ', { fallback: ' You can say: ' }) : T(' For example: ', { fallback: ' You can say: ' }));
          exShown.forEach((e, k) => {
            if (k) line.push(T(' or '));
            line.push({ text: `"${e}"`, translate: false, quote: true, example: true, en: `"${exEn[k]}"`, ...(lang !== 'en' && translator && exShown === exEn ? { incomplete: true } : {}) });
          });
          if (dym.length) line.push({ text: '?', translate: false });
        }
        lines.push(line);
        statuses.push('unparsed');
        continue;
      }
      // a world with a lazily loaded engine (ops `prepare()`, async, idempotent: spec 04) is made ready before its operations run
      { const prep = this.engine.set.get(seg.match?.worldId)?.ops?.prepare; if (typeof prep === 'function') { try { await prep(); } catch { /* the operation then says it is not ready */ } } }
      this.isession.add(seg.wires);
      this.isession.batch = { index: segNo++, count: segments.length };   // ops see their place in the message (a game's host cannot answer between two commands of one message)
      const statements = [];
      for (const w of seg.wires) {
        const r = interp.resolve(this.isession, w);
        if (!r) { statements.push(w); continue; }
        const rendered = interp.render(this.isession, r);
        // RD9: a loose word that reads as "open this tab" ("robot" in "square eyes robot pls") must not add "You are already on the Avatar tab." to the real answer
        const idleTab = seg.match?.worldId === 'ui.shell' && /\.bare/.test(seg.match.patternId ?? '') && /^You are already on the .+ tab\.$/.test(rendered) && segments.some((x) => x !== seg && !x.unparsed && x.match?.worldId && x.match.worldId !== 'ui.shell');
        if (!idleTab) lines.push([T(rendered)]);
        statuses.push(r.status);
        if (r.status === 'supported') { const wid = seg.match?.worldId; const t = set.get(wid)?.tab?.id ?? BUILTIN_TAB[wid]; if (wid === 'ui.shell') followTab = null; else if (t) followTab = t; }   // an explicit navigation later in the message wins over the tab of an earlier segment
        ops.push(...r.ops);
        disc.noteTurn(seg, rendered, this._msg);
        if (r.status === 'supported') { const fr = disc.recordFrame(seg, this._msg); if (fr) { fr.reply = rendered; fr.value = r.envelope?.value ?? null; fr.opId = r.ops[0]?.op ?? null; if (r.envelope?.from?.length) fr.from = r.envelope.from; else if (r.envelope?.fromLater) fr.fromLater = r.envelope.fromLater; } }
        else if (r.status === 'missing' && r.envelope?.pending) disc.openFill(seg, r.envelope, rendered, this._msg);
        answerWires.push(r.answer);
        answers.push({
          id: r.answer.id, to: w.id, kind: r.kind, status: r.status, value: r.envelope.value, values: r.envelope.values,
          text: rendered, via: r.envelope.via, envelope: r.envelope, sentence: seg.text,
        });
      }
      const facts = statements.filter((w) => !w.type.startsWith('core.'));
      if (facts.length) {
        // a statement that cannot be true next to what is already known ("Tom has 3 apples" then "Tom ate 5") is said to the user and taken back (ops
        // reasoner; the matrix keeps it and flags it, spec 15): the world's `checkStatement` hook names the problem
        const rsWhy = this.isession.rs?.refuseFacts(facts, this.isession);
        const bad = this.isession.rs ? (rsWhy ? `That does not add up. ${rsWhy}` : null) : this._refuseFacts(seg.match?.worldId, facts);
        if (bad) { lines.push([T(bad)]); statuses.push('conflicting'); }
        else {
          const ex = this.isession.rs?.ackExtras(facts);   // matrix reasoner: a default the library filled is told with the acknowledgement
          lines.push([T(interp.renderAck(this.isession, ex?.facts ?? facts) + (ex?.assumed ? ' ' + ex.assumed : ''))]);
        }
        if (!bad) disc.noteFacts(facts, this._msg, seg.text, seg.match?.worldId);
      }
      if (seg.alternatives.length) {
        const titles = seg.alternatives.map((a) => set.get(a.worldId)?.title ?? a.worldId);
        const used = set.get(seg.match.worldId)?.title ?? seg.match.worldId;
        lines.push([T(`This could also be read in another way (${titles.join(', ')}); I used the `), { text: `"${used}"`, translate: false, quote: true }, T(' reading.')]);
      }
    }
    this.isession.batch = null;
    for (const seg of segments) {
      if (!seg.corrections?.length || seg.unparsed) continue;
      const line = [T('(I read ')];
      seg.corrections.forEach((c, k) => {
        if (k) line.push(T(k === seg.corrections.length - 1 ? ' and ' : ', '));
        line.push({ text: `"${c.from.toLowerCase()}"`, translate: false, quote: true }, T(' as '), { text: `"${c.to}"`, translate: false, quote: true });
      });
      line.push(T(')'));
      lines.push(line);
    }
    for (const seg of segments) {
      if (!seg.ignored?.length || seg.unparsed) continue;
      const line = [T('I understood only part of that: I did not use ')];
      seg.ignored.forEach((x, k) => { if (k) line.push(T(' and ')); line.push({ text: `"${x}"`, translate: false, quote: true }); });
      line.push({ text: '.', translate: false });
      lines.push(line);
    }
    // Tab follow: a world with a tab answered, but its tab is hidden: bring it forward (the existing ui.openTab action).
    const shown = this.isession.state['ui.shell']?.activeTab;
    if (followTab && shown && shown !== followTab && !this.isession.effects.some((e) => e.name === 'ui.openTab')) {
      try { interp.runAction(this.isession, 'ui.openTab', { tab: followTab }); } catch { /* the shell may be absent */ }
    }
    if (translation?.unknown?.length && segments.some((s) => s.unparsed)) {
      lines.push([T(`I did not know the word${translation.unknown.length > 1 ? 's' : ''}: `), { text: translation.unknown.map((u) => u.word).join(', '), translate: false, quote: true }, { text: '.', translate: false }]);
    }
    if (tInterp) perf.add('interpret', performance.now() - tInterp);
    let englishParts = [];
    lines.forEach((ln, i) => { if (i) englishParts.push({ text: ' ', translate: true, join: true }); englishParts.push(...ln); });
    const englishReply = englishParts.map((p) => p.text).join('');
    let parts = englishParts.map(({ join, fallback, ...p }) => (join ? { text: p.text, translate: false } : p));
    let reply = englishReply;
    if (lang !== 'en' && translator) {
      try {
        parts = await translateParts(englishParts, translator, lang);
        reply = parts.map((p) => p.text).join('');
      } catch { parts = englishParts.map(({ join, fallback, ...p }) => p); reply = englishReply; }
    }
    disc.noteShown(this._msg, reply);
    if (icpt?.reply) { disc.icptTurn = { turn: this._msg, text: english, reply: icpt.reply, world: icpt.worldId }; disc.noteWorld(icpt.worldId, english, icpt.reply, this._msg); }
    if (!disc.pending) disc.openConfirm(englishReply, this._msg);
    this.isession.rs?.adoptState(this.isession);   // whatever else changed the state of a world with `adopt` in this turn (another world's request) is taken over before the turn is kept
    this.isession.rs?.commitTurn(this._msg);   // a turn that changed the library keeps its mark: what "undo that" and the undo of the dialogue layer rewind to (spec 15)
    disc.commitTurn({ turn: this._msg, text: english, before: stateBefore });
    disc.noteNavigation({ text: english, tabBefore: tabBefore, tabAfter: this.isession.state['ui.shell']?.activeTab, turn: this._msg });
    if (meta?.info?.kind !== 'repeat' && meta?.info?.kind !== 'explain') disc.lastAnswer = { text: englishReply, turn: this._msg };
    const feedback = meta?.feedback ?? null;
    const state = {};
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k]) state[k] = structuredClone(v);
    this._astraTurn({ sid, english, meta, pre, pend, segments, state, stateBefore, tabBefore });
    const effects = this.isession.effects;
    this.isession.effects = [];
    const assumptions = answers.flatMap((a) => a.envelope?.assumptions ?? []);   // the default / guessed values the answers rest on (matrix reasoner; absent otherwise)
    return {
      text: reply, parts, lang, translation, segments, wires: [...wires, ...answerWires], answers, statuses, state, effects, ...(feedback ? { feedback } : {}), ...(assumptions.length ? { assumptions } : {}),
      trace: {
        intercepted: icpt?.worldId ?? null, effects, formalizer: { preferred: formalizer ?? this.formalizer, used: [...new Set(segments.map((s) => s.strategy))], nx: formal.nx ?? null, ...(encoderError ? { error: encoderError } : {}) },
        dispatch: dispatch ?? null,
        discourse: { resolved: pre?.info ?? null, meta: meta?.info ?? null, ...(feedback ? { feedback } : {}), pending: disc.pending ? { type: disc.pending.type, world: disc.pending.world, key: disc.pending.key, expected: disc.pending.expected, question: disc.pending.question } : null, consumed: pend ? { type: pend.type, world: pend.world, question: pend.question } : null, frames: disc.frames.length },
        ...(feedback ? { feedback } : {}),
        source: sid, language: lang, original: text, english, ...(selfCorrections.corrections.length ? { selfCorrections: selfCorrections.corrections } : {}), replyEnglish: englishReply,
        segments: segments.map(plainSegment), router: segments.map((s) => s.worlds),
        routing: icpt ? [{ router: 'policy', tier: 1, tierName: 'modal', reason: `modal input of ${icpt.worldId}`, contested: false, winner: { worldId: icpt.worldId }, runnerUp: null }] : segments.map((s) => s.routing ?? null),
        patterns: segments.filter((s) => s.match).map((s) => s.match.patternId),
        operations: icpt ? [...ops, ...icpt.ops] : ops, statuses, wires: [...wires, ...answerWires].map((w) => w.id),
      },
    };
  }
}

/** Create the dialog engine: loads and checks all worlds. */
export async function createEngine({ loader, translator = null, options = {}, formalizers = {} }) {
  // Reasoner switch (spec 15): 'matrix' (default) or 'ops' (the fallback; the worlds that say reasoner=matrix answer through the sopworld library). The option wins over PSYS2_REASONER.
  const mode = (options.reasoner ?? globalThis.process?.env?.PSYS2_REASONER) === 'ops' ? 'ops' : 'matrix';
  const set = await loadWorlds(loader, { reasoner: mode });
  const reasoner = mode === 'matrix' ? await createReasoner(set) : null;
  const interp = createInterpreter(set, { ...options, reasoner });
  const engine = {
    set, interp, translator, loader, reasonerMode: mode, reasoner, router: options.router ?? defaultRouter,
    /** Formalizer strategies by id (spec 06); `formalizers` overrides them (tests, an encoder endpoint). */
    formalizers: { rules: createRulesFormalizer(), encoder: createEncoderFormalizer({ endpoint: options.encoderEndpoint ?? null }), ...formalizers },
    /** Problems found at load time and by static validation (empty when everything is consistent). */
    problems: () => validateWorldSet(set),
    worlds: () => set.list().map((w) => w.summary()),
    createSession: (opts) => new DialogSession(engine, opts),
    /** Compiles every pattern and builds the vocabularies in slices that yield to the host (the webchat warm-up, PERF round 2). */
    precompile: async (opts) => {
      const r = await precompileRules(set, opts);
      try { nameIndex(set); } catch { /* built lazily */ }
      // the spelling vocabularies (global and one per world) are built here, in slices, not by the first message that needs a correction (COMPUTE-BUDGET C)
      try {
        const clock = () => globalThis.performance?.now?.() ?? Date.now();
        const yieldFn = opts?.yieldFn ?? (() => new Promise((res) => setTimeout(res, 0)));
        spellVocabulary(set);
        let t = clock();
        for (const w of set.list()) {
          if (!w.patterns?.length) continue;
          worldVocabulary(set, w.id);
          if (clock() - t > (opts?.budgetMs ?? 10)) { await yieldFn(); t = clock(); }
        }
      } catch { /* built lazily */ }
      return r;
    },
  };
  return engine;
}
