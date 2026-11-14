// SPDX-License-Identifier: AGPL-3.0-only
// TEXT GENERATION adapters (specs/26-summary-and-composition.md): the host side of sopworld's `std.summarize` and `std.compose`. Until the library
// releases them, `available` is false, every call returns null and the UI hides what needs them: there is NO local generator and NO fallback text here.
// Browser-safe: no `node:*` imports; the library module is passed in.

import { knowledgeWorld, genreOf, randomTopics, realiseFrame, chapterTitle } from './compose-world.mjs?v=a0b5480d5f';

const pick = (lib, name) => (typeof lib?.[name] === 'function' ? lib[name] : typeof lib?.std?.[name] === 'function' ? lib.std[name] : null);
const clip = (n, lo, hi, def) => { const v = Math.round(Number(n)); return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : def)); };

// ---- std.summarize (sopworld >= 0.61): `summarizeLog(entries, { parentOf, length })` returns FRAMES { act, kind, count, kinds?, failed?, salience }; `summarizeText(text, { n })`
// returns { sentences: [{ text, score, at }], picked: [text] } (extractive). The library does not write English: the frames are rendered here (TEMPORARY verb table, until the
// language world renders frames) into at most three sentences: what was done, which worlds were used, what was taught.
const IRREGULAR = { make: 'made', draw: 'drew', put: 'put', take: 'took', give: 'gave', build: 'built', write: 'wrote', buy: 'bought', sit: 'sat', tell: 'told', find: 'found', set: 'set', get: 'got', say: 'said', go: 'went', read: 'read', teach: 'taught', run: 'ran', see: 'saw', color: 'coloured', colour: 'coloured' };
const pastOf = (v) => IRREGULAR[v] ?? (/e$/.test(v) ? `${v}d` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ied` : `${v}ed`);
const PLURAL = { fish: 'fish', sheep: 'sheep', mouse: 'mice', man: 'men', woman: 'women', child: 'children', person: 'people', goose: 'geese', foot: 'feet', tooth: 'teeth' };
const pluralOf = (w) => PLURAL[w] ?? (/(?:s|x|z|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const NUMW = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
const joinAnd = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const nounPhrase = (kind, n) => (n === 1 ? `a ${kind}` : `${NUMW[n] ?? n} ${pluralOf(kind)}`);

/** Frames -> one sentence ("You drew two trees and a house"); `failed` counts requests that were not understood or could not be done. */
export function renderFrames(frames, failed = 0) {
  const done = frames.filter((f) => !f.failed).map((f) => {
    const what = f.kinds ? `${NUMW[f.count] ?? f.count} ${pluralOf(f.kind)} (${joinAnd(f.kinds)})` : f.kind ? nounPhrase(f.kind, f.count) : f.count > 1 ? `${NUMW[f.count] ?? f.count} times` : '';
    return `${pastOf(f.act)}${what ? ` ${what}` : ''}`;
  });
  const bad = failed ? (failed === 1 ? 'one request was not understood or could not be done' : `${NUMW[failed] ?? failed} requests were not understood or could not be done`) : '';
  if (done.length) return `You ${joinAnd(done)}${bad ? `; ${bad}` : ''}.`;
  return bad ? `${bad[0].toUpperCase()}${bad.slice(1)}.` : '';
}

const isBad = (t) => ['refused', 'not-understood', 'question-back'].includes(t.outcome);
/** The entries `summarizeLog` aggregates, from the turn records of `turnRecord`: the acts the worlds executed (`acts`: [{ world, act, kind }], from the formalized reading). Failed turns have none and are only counted. */
export function logEntries(turns) {
  const out = [];
  for (const t of turns) if (!isBad(t)) for (const a of t.acts ?? []) out.push({ act: a.act, kind: a.kind ?? null, changed: 1 });
  return out;
}

export function createSummarizer(lib, world) {
  const log = pick(lib, 'summarizeLog'), txt = pick(lib, 'summarizeText');
  return {
    available: Boolean(log && txt),
    /**
     * "What you did", at most `maxSentences` (3): the acts aggregated by `summarizeLog` and rendered as one sentence, the worlds used (every one, by id), what was taught.
     * `labelOf(id)`: a readable world name (optional); `parentOf(kind)`: the kind above a kind (optional, generalises siblings).
     */
    turns({ turns = [], taught = [], labelOf = (id) => id, parentOf = () => null, maxSentences = 3 } = {}) {
      if (!log || !turns.length) return null;
      const entries = logEntries(turns);
      const all = entries.length ? log(entries, { parentOf, length: 'bullets' }) : [];   // failed frames carry a salience bonus and would fill the top three: the failures are counted in the sentence, the frames shown are the best three that worked
      const frames = (Array.isArray(all) ? all : []).filter((f) => !f.failed).slice(0, 3);
      const failed = turns.filter(isBad).length;
      const used = [...new Set(turns.flatMap((t) => t.worlds ?? []))];
      const sentences = [];
      const did = renderFrames(Array.isArray(frames) ? frames : [], failed);
      if (did) sentences.push({ text: did, source: 'std.summarizeLog' });
      if (used.length) sentences.push({ text: `I worked in ${joinAnd(used.map((id) => { const l = labelOf(id); return l && l !== id ? `${l} (${id})` : id; }))}.`, source: 'turn log' });
      if (taught.length) sentences.push({ text: `You taught me that ${joinAnd(taught)}.`, source: 'session.things' });
      const kept = sentences.slice(0, clip(maxSentences, 1, 6, 3));
      return kept.length ? { text: kept.map((x) => x.text).join(' '), sentences: kept } : null;
    },
    /** An extractive summary of a text (the open document or pasted text): `maxSentences` sentences in the text's order; `sentences[i].at` is the position in the text. */
    text({ text = '', maxSentences = 3, doc = null } = {}) {
      if (!txt || !String(text).trim()) return null;
      const r = txt(String(text), { n: clip(maxSentences, 1, 12, 3) });
      const picked = new Set(r?.picked ?? []);
      const sentences = (r?.sentences ?? []).filter((s) => picked.has(s.text)).sort((x, y) => x.at - y.at).map((s) => ({ text: s.text, at: s.at, source: doc ? `${doc}.s${s.at + 1}` : null }));
      const out = sentences.map((s) => s.text).join(' ');
      return out ? { text: out, sentences } : null;
    },
  };
}

/** The document types of std.compose; their procedure and style come from knowledge (k.genres, k.story, k.procedures composition methods), never from the host. */
export const DOC_TYPES = {
  essay: { label: 'Essay', chapters: 3, subchapters: 2, words: 600 },
  'scientific-article': { label: 'Scientific article', chapters: 4, subchapters: 2, words: 1200 },
  presentation: { label: 'Presentation', chapters: 5, subchapters: 0, words: 300 },
  story: { label: 'Story', chapters: 3, subchapters: 0, words: 500 },
  report: { label: 'Report', chapters: 3, subchapters: 2, words: 800 },
};
const TYPE_WORDS = { essay: 'essay', composition: 'essay', text: 'essay', piece: 'essay', article: 'scientific-article', scientific_article: 'scientific-article', research_article: 'scientific-article', scientific_paper: 'scientific-article', presentation: 'presentation', slideshow: 'presentation', slides: 'presentation', story: 'story', tale: 'story', report: 'report' };
/** A word the person used for a kind of document -> a type of DOC_TYPES (essay when unknown). */
export const docTypeOf = (w) => (DOC_TYPES[String(w ?? '')] ? String(w) : TYPE_WORDS[String(w ?? '').toLowerCase().replace(/[\s-]+/g, '_')] ?? 'essay');

/** The composition form / command roles, clamped to what a document can hold. topic empty = random; type defaults fill what is not said. */
export function composeRequest({ type, topic = '', chapters, subchapters, words, seed } = {}) {
  const ty = docTypeOf(type), d = DOC_TYPES[ty];
  const t = String(topic ?? '').trim();
  return { type: ty, topic: /^(?:anything|something|whatever|random|a random thing)?$/i.test(t) ? null : t, random: !t || /^(?:anything|something|whatever|random|a random thing)$/i.test(t),
    chapters: clip(chapters ?? d.chapters, 1, 12, d.chapters), subchapters: clip(subchapters ?? d.subchapters, 0, 6, d.subchapters), words: clip(words ?? d.words, 50, 5000, d.words), seed };
}

/**
 * The composer over the real `std.compose` (sopworld >= 0.64): `compose(world, topic, { genre, size: { chapters, sections, sentences }, seed, realise })` returns frames
 * `{ genre, topic, chapters: [{ title, interest, sections: [{ interest, sentences: [{ move, fact, about, cites, text? }] }] }], short? }`; it is language-free and cites the wire of every claim.
 * The host maps the request onto it (type -> genre only when the knowledge holds that genre; sections = subchapters, sentences from the words asked), realises each frame in English
 * (src/dialog/compose-world.mjs) and returns `{ composition }` or `{ why }` (nothing is written when it cannot be done). When the knowledge is short of what was asked, the library says so
 * (`short`) and the composition is the smaller one it could write, never padded.
 */
export function createComposer(lib, world = null) {
  const fn = pick(lib, 'compose');
  const TYPE_RE = /\b(scientific[ _-]article|research[ _-]article|scientific[ _-]paper|presentation|slideshow|essay|composition|article|story|tale|report|piece|text)\b/i;
  return {
    available: Boolean(fn),
    /** Can a request in these words be executed (the composer exists and the knowledge holds the genre of its type, the essay needing none)? A world that cannot act does not claim the reading. */
    supports(text) {
      if (!fn) return false;
      const t = docTypeOf(TYPE_RE.exec(String(text ?? ''))?.[1]?.replace(/[ -]/g, '_'));
      return t === 'essay' || !!genreOf(world ?? knowledgeWorld(lib), t);
    },
    compose(input = {}) {
      if (!fn) return { why: 'the library has no composer' };
      const req = composeRequest(input);
      const kw = world ?? knowledgeWorld(lib);
      const genre = genreOf(kw, req.type);
      if (!genre && req.type !== 'essay') return { why: `the knowledge has no genre for a ${DOC_TYPES[req.type].label.toLowerCase()} yet (no k.genres.genre ${req.type}), so I cannot write one by the book` };
      const topics = req.topic ? [req.topic] : randomTopics(lib, kw, req.seed ?? Date.now() % 100000);
      if (!topics.length) return { why: 'the knowledge has no subject to write about' };
      const sections = Math.max(1, req.subchapters);
      const sentences = clip(req.words / (req.chapters * sections * 16), 1, 8, 3);
      let c = null, topic = null;
      for (const t of topics) {   // a random topic is the best by interest that the knowledge can fill
        topic = t;
        c = fn(kw, t, { ...(genre ? { genre } : {}), size: { chapters: req.chapters, sections, sentences }, seed: Number(req.seed) || 1, realise: realiseFrame });
        if (c?.why || c?.chapters?.length) break;
      }
      if (c?.why) return { why: c.why };
      const chk = checkComposition(c, req);
      if (!chk.ok) return { why: c?.chapters?.length ? `I could not write that so that every sentence reads and traces to what I know (${chk.problems[0]})` : `I know nothing about ${topic} in my knowledge yet` };
      return { composition: normalise(c, req, topic) };
    },
  };
}

function normalise(c, req, topic) {
  return { title: `All about the ${topic}`, topic, type: req.type, genre: c.genre ?? null, short: c.short ?? [], chapters: c.chapters.map((ch) => ({ title: chapterTitle(ch.title),
    subchapters: ch.sections.map((sc, i) => ({ title: req.subchapters ? `Part ${i + 1}` : '', sentences: sc.sentences.map((s) => ({ text: s.text.trim(), source: s.cites, move: s.move })) })) })) };
}

/** Shape check of the library's frames: at least one chapter, no more than asked, every frame realised (a sentence) and citing a wire; a shorter result is allowed only when the library says `short`. */
export function checkComposition(c, req) {
  const problems = [];
  if (!c || !Array.isArray(c.chapters) || !c.chapters.length) return { ok: false, problems: ['no chapters'] };
  if (c.chapters.length > req.chapters) problems.push(`chapters ${c.chapters.length} > ${req.chapters}`);
  if (c.chapters.length < req.chapters && !c.short?.length) problems.push(`chapters ${c.chapters.length} < ${req.chapters} and not said to be short`);
  const seen = new Set();
  for (const [i, ch] of c.chapters.entries()) {
    if (!Array.isArray(ch?.sections) || !ch.sections.length) { problems.push(`chapter ${i + 1} malformed`); continue; }
    for (const sc of ch.sections) for (const s of Array.isArray(sc?.sentences) ? sc.sentences : []) {
      if (typeof s?.text !== 'string' || !s.text.trim() || /[<{}]|\bundefined\b/.test(s.text)) problems.push('empty or placeholder sentence');
      else if (!s.cites) problems.push(`uncited sentence: "${s.text.slice(0, 40)}"`);
      else if (seen.has(s.cites)) problems.push(`fact said twice: ${s.cites}`); else seen.add(s.cites);
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
