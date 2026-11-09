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
import { precompile as precompileRules } from '../formalizer/rules/index.mjs';
import { loadWorlds } from '../worlds/index.mjs';
import { validateWorldSet } from '../worlds/validate.mjs';
import { defaultRouter } from '../formalizer/routing.mjs';
import { createInterpreter } from '../interpreter/index.mjs';
import { createRulesFormalizer, createEncoderFormalizer } from '../formalizer/strategy.mjs';
import { serialize, makeWire, atom, str } from '../soplang/index.mjs';
import { splitSentences } from '../formalizer/rules/normalize.mjs';
import { spellCorrect, spellAlternates, spellCandidates, protectedWordsOf, worldVocabulary, spellVocabulary, restrictedSet, ignorable, isKnownWord, sameWordForm, FUNCTION_WORDS } from '../formalizer/spell.mjs';
import { perf } from '../formalizer/perf.mjs';
import { guard, TurnAborted } from '../formalizer/guard.mjs';
import { findPartialWindow, changesIntoQuestion } from '../formalizer/partial.mjs';
import { looseCandidates, BEST_EFFORT_POLICY } from '../formalizer/best-effort.mjs';
import { checkValues } from './value-check.mjs';
import { Discourse } from './discourse.mjs';
import { correctMessage, splitAnswerList } from '../formalizer/rules/expand.mjs';

export { runWorldTests } from './test-runner.mjs';

const plainSegment = (s) => ({
  text: s.text, span: s.span, isQuestion: s.isQuestion, worlds: s.worlds, routing: s.routing, match: s.match,
  unparsed: s.unparsed, discourse: s.discourse ?? null, alternatives: s.alternatives, errors: s.errors, strategy: s.strategy, corrections: s.corrections ?? [], ignored: s.ignored ?? [], dispatch: s.dispatch ?? null,
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
    if (!flat[i].translate) { const { join, fallback, incomplete, ...rest } = flat[i]; if (incomplete) complete = false; out.push(rest); i++; continue; }
    let j = i;
    while (j < flat.length && flat[j].translate) j++;
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

/** Tabs of worlds that do not declare one in their manifest (the built-in tabs of the demo page). */
const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };

const langOf = (r) => (typeof r === 'string' ? r : r?.lang) ?? 'en';
const textOf = (r) => (typeof r === 'string' ? r : r?.text);

const QUESTION_WORD = /^(?:what|who|whom|whose|where|when|why|how|which)\b/i;

/** Time budget of the leniency stage (spelling variants and partial windows) of one message, in ms; past it the best reading so far stands (turn guard, spec 06). */
export const LENIENT_BUDGET_MS = 3000;

const FAST_SEGMENT_MARGIN = 0;   // nats of log-probability between the model's best segmentation and the runner-up for the multi-clause fast path

export class DialogSession {
  constructor(engine, { language = 'auto', formalizer = 'rules', spell = true, partial = false, fastPath = false, bestEffort = false } = {}) {
    this.engine = engine;
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
    s.engine = this.engine; s.isession = this.isession.clone(); s._recentWorlds = [...(this._recentWorlds ?? [])];
    return s;
  }

  /**
   * Dry-run reading for the voice end-of-turn detector (spec 06 "Spoken messages"): do the rules find a complete reading of the whole text?
   * Side-effect free: works on a fork of the session, never executes anything on the real session, never touches the session language,
   * the discourse memory or the message counter. Bounded by its own short turn guard (`deadlineMs`); while a real turn runs it declines.
   * Returns { complete, segments, reason }.
   */
  async dryRead(text, { language, deadlineMs = 400 } = {}) {
    const { set, formalizers, interp, translator } = this.engine;
    const token = guard.install({ hardMs: deadlineMs, softMs: deadlineMs * 0.7 });
    if (!token) return { complete: false, segments: 0, reason: 'busy' };   // a real turn owns the guard
    try {
      const f = this.forkForValidation();
      let english = String(text ?? '').trim();
      if (!english) return { complete: false, segments: 0, reason: 'empty' };
      const lang = language ?? this.language;
      const quick = translator?.rules ?? translator;   // the rules translator when there is one: the dry run never waits for a browser translator
      if (quick && lang === 'ro') english = textOf(await quick.translate(english, { from: 'ro', to: 'en' })) ?? english;
      english = splitAnswerList(interp.lang.stripFiller(english) || english);
      const res = await formalizers.rules.formalize(english, { worlds: set, session: f.isession, source: 'dry', context: f.context(), router: this.engine.router });
      const segs = res.segments ?? [];
      if (!segs.length || segs.some((x) => x.unparsed || x.partial || x.ignored?.length)) return { complete: false, segments: segs.length, reason: 'incomplete' };
      for (const seg of segs) {
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r && (r.status === 'unsupported' || r.status === 'error')) return { complete: false, segments: segs.length, reason: 'refused' }; }
      }
      return { complete: true, segments: segs.length, reason: 'ok' };
    } catch (e) {
      return { complete: false, segments: 0, reason: e instanceof TurnAborted ? 'deadline' : 'error' };
    } finally { guard.release(token); }
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
    const st = (this.isession.state[worldId] ??= {});
    Object.assign(st, structuredClone(patch));
    return structuredClone(st);
  }

  /**
   * Record the outcome of a host-executed effect as a core.observation wire (spec 07 §1, vision §8), then, when the
   * effect came from a world whose ops.mjs exports `onObservation(ctx, obs)`, let that world react (update its state,
   * queue further effects, answer). Returns `{ id, text, state, effects }`; `text` is null when the world says nothing.
   * The host renders a non-empty `text` as a new assistant message and applies `state` and `effects` like a reply.
   */
  observe({ effect, ok = true, detail = '', data = null, world = null } = {}) {
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
    const gameWorld = st['ui.shell']?.activeGame ?? null;
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

  _noteWorlds(segments) {
    const ids = segments.map((s) => s.match?.worldId).filter((w) => w && w !== 'ui.shell' && w !== 'kids.common');
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
    const late = () => guard.soft() || (o.until != null && performance.now() > o.until);   // out of time: no further guessing
    if (late()) return null;
    const { spell, partial } = o;
    const { set, formalizers } = this.engine;
    const rules = formalizers.rules;
    const ctx = this.context();
    const ids = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...ctx.recentWorlds, ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)]
      .filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length).slice(0, 5);
    ids.push('*');   // finally every world together (a clause of a longer message may belong to a world the whole message did not suggest)
    const setOf = (world) => (world === '*' ? set : restrictedSet(set, [world]));
    const vocabOf = (world) => (world === '*' ? spellVocabulary(set) : worldVocabulary(set, world));
    const protect = protectedWordsOf(set, ctx.tabWorld);   // words the open tab knows are never changed
    const parse = async (world, text) => {
      let res;
      try { res = await rules.formalize(text, { ...opts, worlds: setOf(world) }); } catch { return null; }
      return res.segments.length && res.segments.every((x) => !x.unparsed) ? res : null;
    };
    const wrap = (res, extra) => res.segments.map((x, k) => ({ ...x, span: seg.span, strategy: 'rules', ...extra, ...(extra.ignored && k > 0 ? { ignored: [] } : {}) }));
    if (depth > 0) { const direct = await parse('*', seg.text); if (direct) return wrap(direct, { corrections: [] }); }   // a clause on its own
    const spelled = new Map();
    if (spell) {
      for (const world of ids) {
        if (late()) return null;
        const sp = spellCorrect(seg.text, { vocab: vocabOf(world), protect });
        spelled.set(world, sp);
        if (!sp.corrections.length) continue;
        const res = await parse(world, sp.text);
        if (res) return wrap(res, { corrections: sp.corrections });
      }
      for (const world of ids) {
        for (const v of spellAlternates(seg.text, { vocab: vocabOf(world), protect })) {
          if (late()) return null;
          const res = await parse(world, v.text);
          if (res) return wrap(res, { corrections: v.corrections });
        }
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
    const { set, formalizers, interp } = this.engine;
    const P = BEST_EFFORT_POLICY;
    const ctx = this.context();
    const worlds = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...ctx.recentWorlds, ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)]
      .filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length);
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
    o = { ...o, until: performance.now() + LENIENT_BUDGET_MS };   // the whole leniency stage of this message (spelling variants, partial windows) shares one time budget
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
    const clauses = /[,;:\n]|\b(?:and|then|also|but|or|next|after|before|while|so|because|if)\b/i.test(english);   // several clauses: the model segments, the rules alone may cut wrongly
    const encoder = formalizers.encoder;
    if (clauses && !(typeof encoder?.quickSegmentation === 'function' && encoder.ready?.())) return null;
    let f;
    try { f = this.forkForValidation(); } catch { return null; }
    const probe = await perf.time('fast.probe', () => formalizers.rules.formalize(english, { ...opts, session: f.isession, context: f.context(), source: 'fast' }));
    if (probe.segments.length < 1 || probe.segments.length > (clauses ? 4 : 1) || probe.segments.some((s) => s.unparsed || s.corrections?.length || s.ignored?.length || s.partial)) return null;
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
   * Active world first (RD1, spec 03 section 7.9a): a message the rules read completely can still carry a typo that another world's free slot
   * swallowed ("bugger house pls" read as "where do buggers live") or that the active world's own free tail hides ("nect to a house").
   * The text is spell-corrected against the vocabulary of the OPEN TAB's world only. The corrected reading replaces the original when
   * (1) every corrected word is unknown to every world (a real word of any world is never "corrected"), (2) the corrected text is read
   * completely, with nothing ignored, by the active world's own rules, and (3) the original reading is weaker: it belongs to another world,
   * or the world refused it (unsupported). Returns the segments of the corrected reading, or null (keep the original).
   */
  async _activeSpell(english, res, opts, lenient) {
    if (!lenient.spell || !res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    const { set, formalizers, interp } = this.engine;
    const ctx = opts.context ?? this.context();
    const world = ctx.tabWorld;
    if (!world || !set.get(world)?.patterns?.length) return null;   // an open modal input that did not consume the message does not matter here
    const global = spellVocabulary(set);
    let words;
    try { words = spellCandidates(english, { vocab: worldVocabulary(set, world), protect: protectedWordsOf(set, world) }); } catch { return null; }
    // the dry run of a reading on a copy of the session: the interpreter's statuses (supported, missing, unsupported, error ...)
    const statusesOf = (segments) => {
      const out = [];
      try {
        const f = this.forkForValidation();
        for (const seg of segments) {
          f.isession.add(seg.wires);
          for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r?.status) out.push(r.status); }
        }
      } catch { /* no dry run: no statuses */ }
      return out;
    };
    const refused = (segments) => statusesOf(segments).some((x) => x === 'unsupported' || x === 'error');
    // is the original weaker? another world read it, or the interpreter refused it
    const origStatuses = statusesOf(res.segments);
    const wasRefused = origStatuses.some((x) => x === 'unsupported' || x === 'error');
    const unhappy = origStatuses.some((x) => x !== 'supported');   // missing, refused, failed: the reading did not do what it said
    const weak = wasRefused || res.segments.some((x) => x.match?.worldId && x.match.worldId !== world && x.match.worldId !== 'ui.shell');
    if (!weak) return null;
    // a word some world knows ("yes" for "eyes") is changed only when another world read the original and did not carry it out, or the interpreter refused it; a word nobody knows is a typo whenever the original is weak
    const otherWorld = res.segments.some((x) => x.match?.worldId && x.match.worldId !== world && x.match.worldId !== 'ui.shell');
    const knownToo = otherWorld && (wasRefused || unhappy);   // the wrong world read it and did not carry it out
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

  async _formalize(english, sid, preferred = this.formalizer, lenient = { spell: this.spell, partial: this.partial, fastPath: this.fastPath }) {
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
        const active = await this._activeSpell(english, { segments, wires: [] }, opts, lenient);
        if (active) return { segments: active.segments, wires: active.segments.flatMap((s) => s.wires), dispatch: res.dispatch ?? null };
        const done = await this._withLeniency({ segments, wires: [] }, opts, lenient);
        return { segments: done.segments, wires: done.segments.flatMap((s) => s.wires), dispatch: res.dispatch ?? null };
      } catch (e) { encoderError = e?.message ?? String(e); /* the encoder failed: fall through to the rules */ }
    }
    const res = await perf.time('rules', () => rules.formalize(english, opts));
    for (const s of res.segments) s.strategy = 'rules';
    if (encoderError) res.encoderError = encoderError;
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

  /** One message in, one reply out. Opens the stage-timing record (`reply.perf`, see formalizer/perf.mjs) unless this is a nested replay. */
  async send(text, opts = {}) {
    const own = perf.start();
    // Turn guard (spec 06 "Turn lifecycle"): the outermost send installs the abort signal and the deadlines; nested sends (validator replays) inherit them.
    const g = guard.install({ signal: opts.signal ?? null, hardMs: opts.hardMs ?? Infinity, softMs: opts.softMs ?? Infinity, force: !!opts.signal });
    const snap = g ? (opts.undo ?? this.snapshot()) : null;   // a host that passes `undo` (its own snapshot) restores the session itself
    try {
      const reply = await this._send(text, opts);
      if (g) guard.check('end');   // (checks the shared guard)   // a stage that swallowed the abort must not let a half-done turn through
      if (own && reply && typeof reply === 'object') reply.perf = perf.end();
      return reply;
    } catch (e) {
      if (g && (e instanceof TurnAborted || guard.tripped)) {   // aborted: the session goes back to exactly where it was before the message
        if (!opts.undo) this.restore(snap);
        throw e instanceof TurnAborted ? e : new TurnAborted(guard.tripped, guard.trippedStage);
      }
      throw e;
    } finally { if (own) perf.end(); guard.release(g); }
  }

  /** Undo snapshot of everything a turn can change (interpreter session, discourse memory, recent worlds, message counter). */
  snapshot() {
    const { dialog, ...dis } = this.discourse;
    return {
      isession: this.isession.clone(), msg: this._msg, recent: [...(this._recentWorlds ?? [])], lang: [this._sessionLang, this._weakRo],
      discourse: { ...dis, frames: [...dis.frames], actions: [...dis.actions], topics: [...dis.topics], lastByWorld: { ...dis.lastByWorld } },
      sources: new Set(this.sources.keys()),
    };
  }

  /** Puts the session back to a snapshot taken by `snapshot()`. */
  restore(snap) {
    if (!snap) return;
    this.isession = snap.isession; this._msg = snap.msg; this._recentWorlds = snap.recent; [this._sessionLang, this._weakRo] = snap.lang;
    Object.assign(this.discourse, snap.discourse);
    for (const k of [...this.sources.keys()]) if (!snap.sources.has(k)) this.sources.delete(k);
  }

  async _send(text, { language, formalizer, spell, partial, fastPath, bestEffort } = {}) {
    const { engine } = this;
    const { set, interp, translator } = engine;
    const sid = `msg${++this._msg}`;
    const wanted = language ?? this.language;
    let lang = 'en', translation = null, english = text, switchedLanguage = null;
    if (translator) {
      lang = wanted === 'auto' ? langOf(await perf.time('detect', () => guard.abortable(translator.detectLanguage(text), 'detect'))) : wanted;
      // RD5: the language comes from strong evidence. English with a typo ("eys express fear") is never read as Romanian, and a weak Romanian reading
      // (a browser guess, one ambiguous word) switches an automatic session only when it repeats; translators without `evidence` keep the plain rule.
      const ev = typeof translator.evidence === 'function' ? await guard.abortable(translator.evidence(text), 'detect') : null;
      if (ev?.strongEn && lang !== 'en') { lang = 'en'; if (wanted === 'auto') { this._sessionLang = 'en'; this._weakRo = 0; } }
      else if (wanted === 'auto') {   // a short or ambiguous input ("e", "ok") keeps the language of the session (default English); a confident detection becomes the session language
        if (lang === 'ro' && ev && !ev.strongRo && this._sessionLang !== 'ro') {
          this._weakRo = (this._weakRo ?? 0) + 1;
          lang = this._weakRo >= 2 ? 'ro' : (this._sessionLang ?? 'en');
          if (lang === 'ro') { this._sessionLang = 'ro'; this._weakRo = 0; }
        } else if (lang === 'unknown') lang = this._sessionLang ?? 'en';
        else { this._sessionLang = lang; this._weakRo = 0; }
      }
      // RD5: a host set to English still switches on strong Romanian evidence (clitics, diacritics, several Romanian content words); the host moves its dropdown
      if (wanted === 'en' && lang === 'en' && ev?.strongRo && !ev.strongEn) { lang = 'ro'; switchedLanguage = 'ro'; }
      if (lang !== 'en' && lang !== 'unknown') {
        translation = await perf.time('translate', () => guard.abortable(translator.translate(text, { from: lang, to: 'en' }), 'translate'));
        english = textOf(translation) ?? text;
      } else lang = 'en';
    }
    this.sources.set(sid, { original: text, english, lang, alignment: translation?.alignment });
    // Correction phase (spec 03 section 1c, review G2): "knight to f3, no, knight to c3" is resolved on the whole message, before the
    // modal interceptors, discourse, segmentation and routing, so the abandoned variant never has an effect.
    english = splitAnswerList(engine.interp.lang.stripFiller(english) || english);   // "lol ok and ...", "uhh and a pig?": leading hesitation never reaches a world
    const selfCorrections = await perf.time('correct', () => this._correct(english));
    if (selfCorrections.corrections.length) english = selfCorrections.text;

    const stateBefore = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
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
    let formal = icpt || meta?.reply != null ? { segments: [], wires: [] } : pre ? { ...pre.res, dispatch: null } : await perf.time('formalize', () => this._formalize(formalText, sid, formalizer ?? this.formalizer, { spell: spell ?? this.spell, partial: partial ?? this.partial, fastPath: fastPath ?? this.fastPath }));
    if (meta?.rewrite && !pre) for (const sg of formal.segments) sg.discourse = meta.info;
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      pre = await disc.ellipsis(english, sid, { bare: true });
      if (pre) formal = { ...pre.res, dispatch: null };
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
    if (meta?.reply != null) lines.push([T(meta.reply)]);
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
        if (r.status === 'supported') { const fr = disc.recordFrame(seg, this._msg); if (fr) { fr.reply = rendered; fr.value = r.envelope?.value ?? null; fr.opId = r.ops[0]?.op ?? null; } }
        else if (r.status === 'missing' && r.envelope?.pending) disc.openFill(seg, r.envelope, rendered, this._msg);
        answerWires.push(r.answer);
        answers.push({
          id: r.answer.id, to: w.id, kind: r.kind, status: r.status, value: r.envelope.value, values: r.envelope.values,
          text: rendered, via: r.envelope.via, envelope: r.envelope, sentence: seg.text,
        });
      }
      const facts = statements.filter((w) => !w.type.startsWith('core.'));
      if (facts.length) lines.push([T(interp.renderAck(this.isession, facts))]);
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
    if (icpt?.reply) { disc.icptTurn = { turn: this._msg, text: english, reply: icpt.reply, world: icpt.worldId }; disc.noteWorld(icpt.worldId, english, icpt.reply, this._msg); }
    if (!disc.pending) disc.openConfirm(englishReply, this._msg);
    disc.commitTurn({ turn: this._msg, text: english, before: stateBefore });
    disc.noteNavigation({ text: english, tabBefore: tabBefore, tabAfter: this.isession.state['ui.shell']?.activeTab, turn: this._msg });
    if (meta?.info?.kind !== 'repeat' && meta?.info?.kind !== 'explain') disc.lastAnswer = { text: englishReply, turn: this._msg };
    const feedback = meta?.feedback ?? null;
    const state = {};
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k]) state[k] = structuredClone(v);
    const effects = this.isession.effects;
    this.isession.effects = [];
    return {
      text: reply, parts, lang, ...(switchedLanguage ? { switchedLanguage } : {}), translation, segments, wires: [...wires, ...answerWires], answers, statuses, state, effects, ...(feedback ? { feedback } : {}),
      trace: {
        intercepted: icpt?.worldId ?? null, effects, formalizer: { preferred: formalizer ?? this.formalizer, used: [...new Set(segments.map((s) => s.strategy))], ...(encoderError ? { error: encoderError } : {}) },
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
  const set = await loadWorlds(loader);
  const interp = createInterpreter(set, options);
  const engine = {
    set, interp, translator, loader, router: options.router ?? defaultRouter,
    /** Formalizer strategies by id (spec 06); `formalizers` overrides them (tests, an encoder endpoint). */
    formalizers: { rules: createRulesFormalizer(), encoder: createEncoderFormalizer({ endpoint: options.encoderEndpoint ?? null }), ...formalizers },
    /** Problems found at load time and by static validation (empty when everything is consistent). */
    problems: () => validateWorldSet(set),
    worlds: () => set.list().map((w) => w.summary()),
    createSession: (opts) => new DialogSession(engine, opts),
    /** Compiles every pattern and builds the vocabularies in slices that yield to the host (the webchat warm-up, PERF round 2). */
    precompile: (opts) => precompileRules(set, opts),
  };
  return engine;
}
