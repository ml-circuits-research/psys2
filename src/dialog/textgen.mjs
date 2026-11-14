// SPDX-License-Identifier: AGPL-3.0-only
// TEXT GENERATION adapters (specs/26-summary-and-composition.md): the host side of sopworld's `std.summarize` and `std.compose`. Until the library
// releases them, `available` is false, every call returns null and the UI hides what needs them: there is NO local generator and NO fallback text here.
// Browser-safe: no `node:*` imports; the library module is passed in.

const pick = (lib, name) => (typeof lib?.[name] === 'function' ? lib[name] : typeof lib?.std?.[name] === 'function' ? lib.std[name] : null);
const clip = (n, lo, hi, def) => Math.min(hi, Math.max(lo, Math.round(Number(n)) || def));

/** @returns {{ available: boolean, turns(input): ?{text, sentences}, text(input): ?{text, sentences} }} */
export function createSummarizer(lib, world) {
  const fn = pick(lib, 'summarize');
  const clean = (r) => {
    const sentences = (Array.isArray(r?.sentences) ? r.sentences : []).filter((s) => s && typeof s.text === 'string' && s.text.trim()).map((s) => ({ text: s.text.trim(), source: s.source ?? null }));
    const text = typeof r?.text === 'string' && r.text.trim() ? r.text.trim() : sentences.map((s) => s.text).join(' ');
    return text && !/[<{}]|\bundefined\b/.test(text) ? { text, sentences } : null;
  };
  return {
    available: Boolean(fn),
    /** "What you did": a short paragraph from the turn log (records of `turnRecord`) and what was taught. */
    turns({ turns = [], taught = [], maxSentences = 3 } = {}) { return fn && turns.length ? clean(fn(world, { kind: 'turns', turns, taught, maxSentences: clip(maxSentences, 1, 6, 3) })) : null; },
    /** A summary of a text (the open document or pasted text). */
    text({ text = '', maxSentences = 3, doc = null } = {}) { return fn && String(text).trim() ? clean(fn(world, { kind: 'text', text: String(text), doc, maxSentences: clip(maxSentences, 1, 12, 3) })) : null; },
  };
}

/** The composition form / command roles, clamped to what a document can hold. topic empty = random. */
export function composeRequest({ topic = '', chapters = 3, subchapters = 2, words = 600, seed } = {}) {
  const t = String(topic ?? '').trim();
  return { topic: /^(?:anything|something|whatever|random|a random thing)?$/i.test(t) ? null : t, random: !t || /^(?:anything|something|whatever|random|a random thing)$/i.test(t),
    chapters: clip(chapters, 1, 12, 3), subchapters: clip(subchapters, 0, 6, 2), words: clip(words, 50, 5000, 600), seed };
}

/**
 * @returns {{ available: boolean, compose(req): ?{ title, topic, chapters: [{ title, subchapters: [{ title, sentences: [{ text, source }] }] }] } }}
 * Every sentence must carry its `source` (the wire of the claim it renders); a composition with an unsourced sentence is refused (no invented claims).
 */
export function createComposer(lib, world) {
  const fn = pick(lib, 'compose');
  return {
    available: Boolean(fn),
    compose(input = {}) {
      if (!fn) return null;
      const req = composeRequest(input);
      const c = fn(world, req);
      return checkComposition(c, req).ok ? normalise(c) : null;
    },
  };
}

function normalise(c) {
  return { title: String(c.title).trim(), topic: c.topic ?? null, chapters: c.chapters.map((ch) => ({ title: String(ch.title).trim(),
    subchapters: ch.subchapters.map((sc) => ({ title: String(sc.title ?? '').trim(), sentences: sc.sentences.map((s) => ({ text: s.text.trim(), source: s.source, world: s.world ?? null })) })) })) };
}

/** Shape check against the request: exact chapter / subchapter counts, every sentence sourced and free of placeholders. Returns { ok, problems }. */
export function checkComposition(c, req) {
  const problems = [];
  if (!c || typeof c.title !== 'string' || !c.title.trim() || !Array.isArray(c.chapters)) return { ok: false, problems: ['no title or chapters'] };
  if (c.chapters.length !== req.chapters) problems.push(`chapters ${c.chapters.length} != ${req.chapters}`);
  for (const [i, ch] of c.chapters.entries()) {
    if (typeof ch?.title !== 'string' || !ch.title.trim() || !Array.isArray(ch.subchapters)) { problems.push(`chapter ${i + 1} malformed`); continue; }
    if (ch.subchapters.length !== req.subchapters && !(req.subchapters === 0 && ch.subchapters.length === 1)) problems.push(`chapter ${i + 1}: subchapters ${ch.subchapters.length} != ${req.subchapters}`);
    for (const sc of ch.subchapters) for (const s of Array.isArray(sc?.sentences) ? sc.sentences : []) {
      if (typeof s?.text !== 'string' || !s.text.trim() || /[<{}]|\bundefined\b/.test(s.text)) problems.push('empty or placeholder sentence');
      else if (!s.source) problems.push(`unsourced sentence: "${s.text.slice(0, 40)}"`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** The Markdown of a composition and, in the same order, the source of each sentence: [{ text, source }]. */
export function compositionToDocument(c) {
  const lines = [`# ${c.title}`, ''], sentences = [];
  for (const ch of c.chapters) {
    lines.push(`## ${ch.title}`, '');
    for (const sc of ch.subchapters) {
      if (sc.title) lines.push(`### ${sc.title}`, '');
      lines.push(sc.sentences.map((s) => s.text).join(' '), '');
      sentences.push(...sc.sentences.map((s) => ({ text: s.text, source: s.source })));
    }
  }
  return { text: lines.join('\n').trim(), sentences };
}

/** The registry the worlds' operations reach (like the budget): the engine installs the adapters once the library is loaded. */
export const TEXTGEN_GLOBAL = Symbol.for('psys2.textgen');
export function installTextGen(lib, world = null) {
  const tg = { summarizer: createSummarizer(lib, world), composer: createComposer(lib, world) };
  globalThis[TEXTGEN_GLOBAL] = tg;
  return tg;
}
export const textGen = () => globalThis[TEXTGEN_GLOBAL] ?? null;
