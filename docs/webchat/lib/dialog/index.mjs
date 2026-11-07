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
import { createInterpreter } from '../interpreter/index.mjs';
import { createRulesFormalizer, createEncoderFormalizer } from '../formalizer/strategy.mjs';
import { serialize, makeWire, atom, str } from '../soplang/index.mjs';
import { splitSentences } from '../formalizer/rules/normalize.mjs';

export { runWorldTests } from './test-runner.mjs';

const plainSegment = (s) => ({
  text: s.text, span: s.span, isQuestion: s.isQuestion, worlds: s.worlds, match: s.match,
  unparsed: s.unparsed, alternatives: s.alternatives, errors: s.errors, strategy: s.strategy,
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

const langOf = (r) => (typeof r === 'string' ? r : r?.lang) ?? 'en';
const textOf = (r) => (typeof r === 'string' ? r : r?.text);

export class DialogSession {
  constructor(engine, { language = 'auto', formalizer = 'rules' } = {}) {
    this.engine = engine;
    this.language = language;
    /** Preferred formalizer strategy: 'rules' (default) or 'encoder'; per world it falls back to rules (spec 06). */
    this.formalizer = formalizer === 'encoder' ? 'encoder' : 'rules';
    this.isession = engine.interp.createSession();
    this.sources = new Map();
    this._msg = 0;
    this.isession.add(this.isession.form.initDefaults());
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

  /** Record the outcome of a host-executed effect as a core.observation wire (spec 07). Returns the wire id. */
  observe({ effect, ok = true, detail = '' } = {}) {
    const id = this.isession.form.freshId('o');
    const pairs = [['core.observation.effect', atom(String(effect))], ['core.observation.ok', atom(ok ? 'true' : 'false')]];
    if (detail !== '' && detail != null) pairs.push(['core.observation.detail', str(String(detail))]);
    pairs.push(['core.seq', atom(this.isession.form.nextSeq())]);
    this.isession.add([makeWire(id, 'core.observation', pairs)]);
    return id;
  }

  /**
   * Formalize with the preferred strategy, per world falling back to the rule formalizer (spec 06).
   * Each returned segment carries `strategy`. Unparsed encoder segments are retried with the rules.
   */
  async _formalize(english, sid, preferred = this.formalizer) {
    const { set, formalizers } = this.engine;
    const opts = { worlds: set, session: this.isession, source: sid };
    const rules = formalizers.rules;
    const enc = preferred === 'encoder' ? formalizers.encoder : null;
    let usable = false;
    try { usable = !!enc && !!(await enc.available()) && set.list().some((w) => enc.supports(w)); } catch { usable = false; }
    if (usable) {
      try {
        const res = await enc.formalize(english, opts);
        const segments = [];
        for (const seg of res.segments) {
          if (!seg.unparsed) { segments.push({ ...seg, strategy: 'encoder' }); continue; }
          const sub = await rules.formalize(seg.text, { ...opts, source: sid });
          const shift = seg.span[0];
          for (const s of sub.segments) segments.push({ ...s, span: [s.span[0] + shift, s.span[1] + shift], strategy: 'rules' });
        }
        return { segments, wires: segments.flatMap((s) => s.wires) };
      } catch { /* the worker failed: fall through to the rules */ }
    }
    const res = await rules.formalize(english, opts);
    for (const s of res.segments) s.strategy = 'rules';
    return res;
  }

  async send(text, { language, formalizer } = {}) {
    const { engine } = this;
    const { set, interp, translator } = engine;
    const sid = `msg${++this._msg}`;
    const wanted = language ?? this.language;
    let lang = 'en', translation = null, english = text;
    if (translator) {
      lang = wanted === 'auto' ? langOf(await translator.detectLanguage(text)) : wanted;
      if (lang !== 'en' && lang !== 'unknown') {
        translation = await translator.translate(text, { from: lang, to: 'en' });
        english = textOf(translation) ?? text;
      } else lang = 'en';
    }
    this.sources.set(sid, { original: text, english, lang, alignment: translation?.alignment });

    const stateBefore = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.effects = [];
    const icpt = interp.intercept(this.isession, english);   // modal input (spec 07 section 2)
    const { segments, wires } = icpt ? { segments: [], wires: [] } : await this._formalize(english, sid, formalizer ?? this.formalizer);
    const T = (text, extra = {}) => ({ text, translate: true, ...extra });
    const lines = icpt?.reply ? [[T(icpt.reply)]] : [];   // each line is an array of parts [{ text, translate, quote? }]
    const answers = [];
    const statuses = icpt ? ['supported'] : [];
    const ops = [];
    const answerWires = [];
    for (const seg of segments) {
      if (seg.unparsed) {
        let ex = examplesFor(set, seg.worlds.map((w) => w.id));
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
          line.push(T(' For example: ', { fallback: ' You can say: ' }));
          ex.forEach((e, k) => {
            if (k) line.push(T(' or '));
            line.push({ text: `"${e}"`, translate: false, quote: true, example: true });
          });
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
        ops.push(...r.ops);
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
    if (translation?.unknown?.length && segments.some((s) => s.unparsed)) {
      lines.push([T(`I did not know the word${translation.unknown.length > 1 ? 's' : ''}: `), { text: translation.unknown.map((u) => u.word).join(', '), translate: false, quote: true }, { text: '.', translate: false }]);
    }
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
    const state = {};
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k]) state[k] = structuredClone(v);
    const effects = this.isession.effects;
    this.isession.effects = [];
    return {
      text: reply, parts, lang, translation, segments, wires: [...wires, ...answerWires], answers, statuses, state, effects,
      trace: {
        intercepted: icpt?.worldId ?? null, effects, formalizer: { preferred: formalizer ?? this.formalizer, used: [...new Set(segments.map((s) => s.strategy))] },
        source: sid, language: lang, original: text, english, replyEnglish: englishReply,
        segments: segments.map(plainSegment), router: segments.map((s) => s.worlds),
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
    set, interp, translator, loader,
    /** Formalizer strategies by id (spec 06); `formalizers` overrides them (tests, an encoder endpoint). */
    formalizers: { rules: createRulesFormalizer(), encoder: createEncoderFormalizer({ endpoint: options.encoderEndpoint ?? null }), ...formalizers },
    /** Problems found at load time and by static validation (empty when everything is consistent). */
    problems: () => validateWorldSet(set),
    worlds: () => set.list().map((w) => w.summary()),
    createSession: (opts) => new DialogSession(engine, opts),
  };
  return engine;
}
