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
import { loadWorlds } from '../worlds/index.mjs';
import { validateWorldSet } from '../worlds/validate.mjs';
import { defaultRouter } from '../formalizer/routing.mjs';
import { createInterpreter } from '../interpreter/index.mjs';
import { createRulesFormalizer, createEncoderFormalizer } from '../formalizer/strategy.mjs';
import { serialize, makeWire, atom, str } from '../soplang/index.mjs';
import { splitSentences } from '../formalizer/rules/normalize.mjs';
import { spellCorrect, spellAlternates, protectedWordsOf, worldVocabulary, spellVocabulary, restrictedSet, ignorable, FUNCTION_WORDS } from '../formalizer/spell.mjs';
import { perf } from '../formalizer/perf.mjs';
import { findPartialWindow, changesIntoQuestion } from '../formalizer/partial.mjs';
import { Discourse } from './discourse.mjs';
import { correctMessage } from '../formalizer/rules/expand.mjs';

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
    for (const p of patterns) for (const ex of p.examples.slice(0, 1)) {
      if (!kinds.has(p.kind) && out.length < 2) { kinds.add(p.kind); out.push(ex); }
    }
    for (const p of patterns) for (const ex of p.examples) if (out.length < 2 && !out.includes(ex)) out.push(ex);
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
  for (let i = 0; i < flat.length; i++) if (flat[i].join) flat[i].translate = !!(flat[i - 1]?.translate && flat[i + 1]?.translate);
  const out = [];
  for (let i = 0; i < flat.length;) {
    if (!flat[i].translate) { const { join, fallback, ...rest } = flat[i]; out.push(rest); i++; continue; }
    let j = i;
    while (j < flat.length && flat[j].translate) j++;
    const run = flat.slice(i, j);
    i = j;
    const src = run.map((p) => p.text).join('');
    if (!src.trim()) { out.push({ text: src, translate: false }); continue; }
    let res = null;
    try { res = await translator.translate(src, { from: 'en', to: lang }); } catch { res = null; }
    if (res?.unknown?.length && run.length === 1 && run[0].fallback) {
      try { res = await translator.translate(run[0].fallback, { from: 'en', to: lang }); } catch { res = null; }
    }
    const t = textOf(res);
    out.push({ text: t ? fitFragment(src, t) : src, translate: true });
  }
  return out;
}

/** Tabs of worlds that do not declare one in their manifest (the built-in tabs of the demo page). */
const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };

const langOf = (r) => (typeof r === 'string' ? r : r?.lang) ?? 'en';
const textOf = (r) => (typeof r === 'string' ? r : r?.text);

export class DialogSession {
  constructor(engine, { language = 'auto', formalizer = 'rules', spell = true, partial = false } = {}) {
    this.engine = engine;
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
        const sp = spellCorrect(seg.text, { vocab: vocabOf(world), protect });
        spelled.set(world, sp);
        if (!sp.corrections.length) continue;
        const res = await parse(world, sp.text);
        if (res) return wrap(res, { corrections: sp.corrections });
      }
      for (const world of ids) {
        for (const v of spellAlternates(seg.text, { vocab: vocabOf(world), protect })) {
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
        const sp = spelled.get(world);
        const bases = sp?.corrections.length ? [sp, { text: seg.text, corrections: [] }] : [{ text: seg.text, corrections: [] }];
        for (const base of bases) {
          const win = await findPartialWindow(base.text, async (slice) => { const r = await parse(world, slice); return r && !changesIntoQuestion(base.text, slice, r.segments.map((x) => x.match?.kind)) ? r : null; },
            { minCoverage: depth ? 0.5 : 0.25, canIgnore: ignorable(vocabOf(world), spellVocabulary(set)) });
          if (win) {
            const used = win.text.toLowerCase();
            return wrap(win.result, { corrections: base.corrections.filter((c) => used.includes(c.to.toLowerCase())), ignored: win.ignored.map((x) => x.text) });
          }
        }
      }
    }
    return null;
  }

  async _withLeniency(res, opts, o) {
    if (!res.segments.some((x) => x.unparsed) || !(o.spell || o.partial)) return res;
    const segments = [];
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
  async _formalize(english, sid, preferred = this.formalizer, lenient = { spell: this.spell, partial: this.partial }) {
    const { set, formalizers } = this.engine;
    const opts = { worlds: set, session: this.isession, source: sid, context: this.context(), router: this.engine.router };
    const rules = formalizers.rules;
    const enc = preferred === 'encoder' ? formalizers.encoder : null;
    let usable = false, encoderError = null;
    try { usable = !!enc && !!(await perf.time('encoder.available', () => enc.available())) && set.list().some((w) => enc.supports(w)); } catch { usable = false; }
    if (usable) {
      try {
        const res = await perf.time('encoder', () => enc.formalize(english, opts));
        const segments = [];
        for (const seg of res.segments) {
          if (!seg.unparsed) { segments.push({ ...seg, strategy: 'encoder' }); continue; }
          const sub = await perf.time('rules.retry', () => rules.formalize(seg.text, { ...opts, source: sid }));
          const shift = seg.span[0];
          for (const s of sub.segments) segments.push({ ...s, span: [s.span[0] + shift, s.span[1] + shift], strategy: 'rules' });
        }
        const done = await this._withLeniency({ segments, wires: [] }, opts, lenient);
        return { segments: done.segments, wires: done.segments.flatMap((s) => s.wires), dispatch: res.dispatch ?? null };
      } catch (e) { encoderError = e?.message ?? String(e); /* the encoder failed: fall through to the rules */ }
    }
    const res = await perf.time('rules', () => rules.formalize(english, opts));
    for (const s of res.segments) s.strategy = 'rules';
    if (encoderError) res.encoderError = encoderError;
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
    try {
      const reply = await this._send(text, opts);
      if (own && reply && typeof reply === 'object') reply.perf = perf.end();
      return reply;
    } finally { if (own) perf.end(); }
  }

  async _send(text, { language, formalizer, spell, partial } = {}) {
    const { engine } = this;
    const { set, interp, translator } = engine;
    const sid = `msg${++this._msg}`;
    const wanted = language ?? this.language;
    let lang = 'en', translation = null, english = text;
    if (translator) {
      lang = wanted === 'auto' ? langOf(await perf.time('detect', () => translator.detectLanguage(text))) : wanted;
      if (wanted === 'auto') {   // a short or ambiguous input ("e", "ok") keeps the language of the session (default English); a confident detection becomes the session language
        if (lang === 'unknown') lang = this._sessionLang ?? 'en';
        else this._sessionLang = lang;
      }
      if (lang !== 'en' && lang !== 'unknown') {
        translation = await perf.time('translate', () => translator.translate(text, { from: lang, to: 'en' }));
        english = textOf(translation) ?? text;
      } else lang = 'en';
    }
    this.sources.set(sid, { original: text, english, lang, alignment: translation?.alignment });
    // Correction phase (spec 03 section 1c, review G2): "knight to f3, no, knight to c3" is resolved on the whole message, before the
    // modal interceptors, discourse, segmentation and routing, so the abandoned variant never has an effect.
    const selfCorrections = await perf.time('correct', () => this._correct(english));
    if (selfCorrections.corrections.length) english = selfCorrections.text;

    const stateBefore = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.effects = [];
    const disc = this.discourse;
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
      }
    }
    let formal = icpt || meta?.reply != null ? { segments: [], wires: [] } : pre ? { ...pre.res, dispatch: null } : await perf.time('formalize', () => this._formalize(formalText, sid, formalizer ?? this.formalizer, { spell: spell ?? this.spell, partial: partial ?? this.partial }));
    if (meta?.rewrite && !pre) for (const sg of formal.segments) sg.discourse = meta.info;
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      pre = await disc.ellipsis(english, sid, { bare: true });
      if (pre) formal = { ...pre.res, dispatch: null };
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
    for (const seg of segments) {
      // a leftover made only of filler words ("also", "and", "please") next to something that was understood is not worth an error
      if (seg.unparsed && (partial ?? this.partial) && fillerOnly(seg.text) && segments.some((x) => !x.unparsed)) continue;
      if (seg.unparsed) {
        // examples from the world of the open tab first: the router's word-overlap guess can point anywhere
        const routed = seg.worlds.map((w) => w.id), here = Object.entries(this.focus()).find(([, n]) => n >= 3)?.[0];
        let ex = examplesFor(set, here ? [here, ...routed.filter((w) => w !== here)] : routed);
        // ui.help: "Did you mean ...?" (closest examples of all worlds) and a note of what failed for "why not?"
        const helpW = set.get('ui.help');
        const dym = helpW?.ops?.didYouMean?.({ text: seg.text, worlds: set.list(), tabWorld: here, recentWorlds: this._recentWorlds ?? [] }) ?? [];
        if (helpW) (this.isession.state['ui.help'] ??= {}).lastUnparsed = { text: seg.text, world: here ?? routed[0] ?? null, suggestions: dym };
        if (dym.length) { ex = dym; this.isession.effects.push({ name: 'chat.suggest', args: { items: dym }, world: 'ui.help' }); }
        // the user's own words are quoted verbatim and never back-translated
        const quoted = lang === 'en' ? seg.text : originalSentence(text, seg, translation?.alignment);
        const line = [T('I did not understand '), { text: `"${quoted}"`, translate: false, quote: true }, { text: '.', translate: false }];
        if (lang !== 'en' && translator) {
          // every example is a simple English sentence: translate each one separately, drop those with unknown words
          const done = [];
          for (const e of ex) {
            try {
              const r = await translator.translate(e, { from: 'en', to: lang });
              if (textOf(r) && !r.unknown?.length && !r.untranslatable?.length) done.push(textOf(r).trim());
            } catch { /* omit this example */ }
          }
          ex = done;
        }
        if (ex.length) {
          line.push(dym.length ? T(' Did you mean ', { fallback: ' You can say: ' }) : T(' For example: ', { fallback: ' You can say: ' }));
          ex.forEach((e, k) => {
            if (k) line.push(T(' or '));
            line.push({ text: `"${e}"`, translate: false, quote: true, example: true });
          });
          if (dym.length) line.push({ text: '?', translate: false });
        }
        lines.push(line);
        statuses.push('unparsed');
        continue;
      }
      this.isession.add(seg.wires);
      const statements = [];
      for (const w of seg.wires) {
        const r = interp.resolve(this.isession, w);
        if (!r) { statements.push(w); continue; }
        const rendered = interp.render(this.isession, r);
        lines.push([T(rendered)]);
        statuses.push(r.status);
        if (r.status === 'supported') { const wid = seg.match?.worldId; const t = set.get(wid)?.tab?.id ?? BUILTIN_TAB[wid]; if (t) followTab = t; }
        ops.push(...r.ops);
        disc.noteTurn(seg, rendered, this._msg);
        if (r.status === 'supported') { const fr = disc.recordFrame(seg, this._msg); if (fr) { fr.reply = rendered; fr.opId = r.ops[0]?.op ?? null; } }
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
    if (!disc.pending) disc.openConfirm(englishReply, this._msg);
    disc.commitTurn({ turn: this._msg, text: english, before: stateBefore });
    if (meta?.info?.kind !== 'repeat' && meta?.info?.kind !== 'explain') disc.lastAnswer = { text: englishReply, turn: this._msg };
    const feedback = meta?.feedback ?? null;
    const state = {};
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k]) state[k] = structuredClone(v);
    const effects = this.isession.effects;
    this.isession.effects = [];
    return {
      text: reply, parts, lang, translation, segments, wires: [...wires, ...answerWires], answers, statuses, state, effects, ...(feedback ? { feedback } : {}),
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
  };
  return engine;
}
