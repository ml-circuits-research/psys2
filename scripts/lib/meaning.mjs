// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The MEANING of an English sentence as the current reader sees it: the segments the rules formalizer produces
 * (world, action, role arguments) in a session of a given tab and state, reduced to a canonical string. Two
 * sentences mean the same when the strings are equal. Used by the Romanian <-> English meaning set
 * (training/eval/ro-en-meaning) and its measures; nothing is executed (the reading is made on a fork of the session).
 *
 * The key drops what is surface only: the sentence text (`arg.text`), where it was read from (core.source, core.via,
 * core.in) and the sequence number.
 */
import { createFsLoader, DEFAULT_ROOT } from '../../src/loaders/fs-loader.mjs';
import { createEngine } from '../../src/dialog/index.mjs';
import { createTranslator } from '../../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../../src/dialog/runtime-config.mjs';
import { splitAnswerList } from '../../src/formalizer/rules/expand.mjs';

const SURFACE = /^(core\.in|core\.source|core\.seq|core\.via|core\.request\.arg\.text)$/;
const NUMBER_WORDS = Object.fromEntries('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ').map((w, i) => [w, String(i)]));
const canonString = (s) => { const l = s.toLowerCase().trim().replace(/^(a|an|the) /, ''); return NUMBER_WORDS[l] ?? l; };   // "two" = "2"; a leading article is not part of the thing
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : typeof v === 'string' ? canonString(v) : v);

export function wireMeaning(w) {
  const ents = (w.entries ?? []).filter((e) => !SURFACE.test(e.key)).map((e) => `${e.key.replace(/^core\.request\./, '')}=${JSON.stringify(canon(e.value?.v ?? e.value))}`).sort().join(' ');
  return `${w.type} ${ents}`;
}

export async function openReader({ engine = null, translator = createTranslator() } = {}) {
  engine ??= await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
  const sessions = new Map();
  async function sessionFor(c) {
    const key = JSON.stringify([c.tab ?? null, c.init ?? null, c.setup ?? []]);
    if (sessions.has(key)) { const s = sessions.get(key); sessions.delete(key); sessions.set(key, s); return s; }
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
    if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
    for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
    for (const m of c.setup ?? []) { try { await s.send(m); } catch { /* the reading below reports what it can */ } }
    sessions.set(key, s);
    if (sessions.size > 40) sessions.delete(sessions.keys().next().value);
    return s;
  }
  /** { key, complete, world, action, segments } ; key is '' when the reading is not complete. */
  async function read(english, c = {}) {
    const s = await sessionFor(c);
    const { set, formalizers, interp } = engine;
    const f = s.forkForValidation();
    let res;
    try {
      res = await formalizers.rules.formalize(splitAnswerList(interp.lang.stripFiller(english) || english), { worlds: set, session: f.isession, source: 'candidate', context: f.context(), router: s._router });
    } catch (e) { return { key: '', complete: false, segments: [], error: String(e.message ?? e) }; }
    const segs = (res.segments ?? []).map((x) => ({
      world: x.match?.worldId ?? null, pattern: x.match?.patternId ?? null, unparsed: !!x.unparsed, partial: !!x.partial, ignored: x.ignored ?? [],
      question: !!x.isQuestion,
      meaning: (x.wires ?? []).map(wireMeaning),
      action: (x.wires ?? []).map((w) => (w.entries ?? []).find((e) => e.key === 'core.request.action')?.value?.v).find(Boolean) ?? null,
    }));
    const complete = segs.length > 0 && segs.every((x) => !x.unparsed && !x.partial && !x.ignored.length);
    const key = complete ? segs.map((x) => `${x.world}|${x.meaning.join(' ; ')}`).join(' || ') : '';
    return { key, complete, world: segs[0]?.world ?? null, action: segs.map((x) => x.action).filter(Boolean).join('+') || null, question: segs.some((x) => x.question), segments: segs };
  }
  return { engine, read, session: sessionFor };
}
