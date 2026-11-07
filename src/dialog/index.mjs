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
import { formalize } from '../formalizer/rules/index.mjs';
import { serialize } from '../soplang/index.mjs';

export { runWorldTests } from './test-runner.mjs';

const plainSegment = (s) => ({
  text: s.text, span: s.span, isQuestion: s.isQuestion, worlds: s.worlds, match: s.match,
  unparsed: s.unparsed, alternatives: s.alternatives, errors: s.errors,
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

const langOf = (r) => (typeof r === 'string' ? r : r?.lang) ?? 'en';
const textOf = (r) => (typeof r === 'string' ? r : r?.text);

export class DialogSession {
  constructor(engine, { language = 'auto' } = {}) {
    this.engine = engine;
    this.language = language;
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

  async send(text, { language } = {}) {
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

    const { segments, wires } = formalize(english, { worlds: set, session: this.isession, source: sid });
    const lines = [];
    const answers = [];
    const statuses = [];
    const ops = [];
    const answerWires = [];
    for (const seg of segments) {
      if (seg.unparsed) {
        const ex = examplesFor(set, seg.worlds.map((w) => w.id));
        lines.push(`I did not understand "${seg.text}".` + (ex.length ? ` For example: ${ex.map((e) => `"${e}"`).join(' or ')}` : ''));
        statuses.push('unparsed');
        continue;
      }
      this.isession.add(seg.wires);
      const statements = [];
      for (const w of seg.wires) {
        const r = interp.resolve(this.isession, w);
        if (!r) { statements.push(w); continue; }
        const rendered = interp.render(this.isession, r);
        lines.push(rendered);
        statuses.push(r.status);
        ops.push(...r.ops);
        answerWires.push(r.answer);
        answers.push({
          id: r.answer.id, to: w.id, kind: r.kind, status: r.status, value: r.envelope.value, values: r.envelope.values,
          text: rendered, via: r.envelope.via, envelope: r.envelope, sentence: seg.text,
        });
      }
      const facts = statements.filter((w) => !w.type.startsWith('core.'));
      if (facts.length) lines.push(interp.renderAck(this.isession, facts));
      if (seg.alternatives.length) {
        const titles = seg.alternatives.map((a) => set.get(a.worldId)?.title ?? a.worldId);
        lines.push(`This could also be read in another way (${titles.join(', ')}); I used the "${set.get(seg.match.worldId)?.title ?? seg.match.worldId}" reading.`);
      }
    }
    if (translation?.unknown?.length && segments.some((s) => s.unparsed)) {
      lines.push(`I did not know the word${translation.unknown.length > 1 ? 's' : ''}: ${translation.unknown.map((u) => u.word).join(', ')}.`);
    }
    let reply = lines.join(' ');
    const englishReply = reply;
    if (lang !== 'en' && translator) {
      try { reply = textOf(await translator.translate(englishReply, { from: 'en', to: lang })) ?? englishReply; } catch { reply = englishReply; }
    }
    return {
      text: reply, lang, translation, segments, wires: [...wires, ...answerWires], answers, statuses,
      trace: {
        source: sid, language: lang, original: text, english, replyEnglish: englishReply,
        segments: segments.map(plainSegment), router: segments.map((s) => s.worlds),
        patterns: segments.filter((s) => s.match).map((s) => s.match.patternId),
        operations: ops, statuses, wires: [...wires, ...answerWires].map((w) => w.id),
      },
    };
  }
}

/** Create the dialog engine: loads and checks all worlds. */
export async function createEngine({ loader, translator = null, options = {} }) {
  const set = await loadWorlds(loader);
  const interp = createInterpreter(set, options);
  const engine = {
    set, interp, translator, loader,
    /** Problems found at load time and by static validation (empty when everything is consistent). */
    problems: () => validateWorldSet(set),
    worlds: () => set.list().map((w) => w.summary()),
    createSession: (opts) => new DialogSession(engine, opts),
  };
  return engine;
}
