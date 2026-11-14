// SPDX-License-Identifier: AGPL-3.0-only
// TEXT GENERATION adapters (specs/26-summary-and-composition.md): the host side of sopworld's `std.summarize` and `std.compose`. Until the library
// releases them, `available` is false, every call returns null and the UI hides what needs them: there is NO local generator and NO fallback text here.
// Browser-safe: no `node:*` imports; the library module is passed in.

import { knowledgeWorld, languageWorld, genreOf, randomTopics, topicIndex } from './compose-world.mjs?v=7e48e1d104';
import { englishOf, joinList as list } from '../lang/en-generate.mjs?v=735b7ec142';

const pick = (lib, name) => (typeof lib?.[name] === 'function' ? lib[name] : typeof lib?.std?.[name] === 'function' ? lib.std[name] : null);
const clip = (n, lo, hi, def) => { const v = Math.round(Number(n)); return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : def)); };

// ---- std.summarize (sopworld >= 0.61): `summarizeLog(entries, { parentOf, length })` returns FRAMES { act, kind, count, kinds?, failed?, salience }; `summarizeText(text, { n })`
// returns { sentences: [{ text, score, at }], picked: [text] } (extractive). The library does not write English: a frame is said through the language world's generation templates
// (w.lang.en.template: "add {number} {kind:num=pl}.", filled by the library, plurals and articles by src/lang/en-generate.mjs). There is no verb table here. What a frame says is what
// the person asked ("You asked me to add 3 trees and remove a house"); a frame of an act with no template that fits (a place with no spot named) is counted, not worded.
const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);

/** Frames -> one sentence; `failed` counts requests that were not understood or could not be done; `en` is `englishOf(lib, languageWorld(lib))`. */
export function renderFrames(frames, failed = 0, en = null) {
  const said = [];
  let other = 0;
  for (const f of frames.filter((x) => !x.failed)) {
    const roles = f.kind ? (f.count > 1 ? { number: f.count, kind: f.kind } : { kind: f.kind }) : null;
    const t = roles && en ? en.actSentence(f.act, roles) : null;
    if (t) said.push(`${lower(t.replace(/\.$/, ''))}${f.kinds ? ` (${en.list(f.kinds)})` : ''}`); else other += f.count ?? 1;
  }
  const parts = [];
  if (said.length) parts.push(`You asked me to ${en.list(said)}`);
  if (other) parts.push(`${said.length ? ', plus ' : 'You asked for '}${other} other ${other === 1 ? 'change' : 'changes'}`);
  const bad = failed ? `${failed} ${failed === 1 ? 'request was' : 'requests were'} not understood or could not be done` : '';
  const head = parts.join('').replace(/^, plus/, ', plus');
  if (head) return `${head}${bad ? `; ${bad}` : ''}.`;
  return bad ? `${bad.charAt(0).toUpperCase()}${bad.slice(1)}.` : '';
}

const isBad = (t) => ['refused', 'not-understood', 'question-back'].includes(t.outcome);
/** The entries `summarizeLog` aggregates, from the turn records of `turnRecord`: the acts the worlds executed (`acts`: [{ world, act, kind }], from the formalized reading). Failed turns have none and are only counted. */
export function logEntries(turns) {
  const out = [];
  for (const t of turns) if (!isBad(t)) for (const a of t.acts ?? []) out.push({ act: a.act, kind: a.kind ?? null, changed: 1 });
  return out;
}

export function createSummarizer(lib, world) {
  let en0 = null;
  const english = () => (en0 ??= (typeof lib?.World === 'function' ? englishOf(lib, languageWorld(lib)) : null));
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
      const did = renderFrames(Array.isArray(frames) ? frames : [], failed, lib ? english() : null);
      if (did) sentences.push({ text: did, source: 'std.summarizeLog' });
      if (used.length) sentences.push({ text: `I worked in ${list(used.map((id) => { const l = labelOf(id); return l && l !== id ? `${l} (${id})` : id; }))}.`, source: 'turn log' });
      if (taught.length) sentences.push({ text: `You taught me that ${list(taught)}.`, source: 'session.things' });
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
  const generators = new WeakMap(), english = (kw) => (generators.has(kw) ? generators.get(kw) : generators.set(kw, englishOf(lib, kw)).get(kw));
  const memo = new Map();   // a composition is deterministic by its request and seed: a dry run and the real run (and a repeated press with the same seed) give the same document
  const TYPE_RE = /\b(scientific[ _-]article|research[ _-]article|scientific[ _-]paper|presentation|slideshow|essay|composition|article|story|tale|report|piece|text)\b/i;
  return {
    available: Boolean(fn),
    /** Can a request in these words be executed (the composer exists and the knowledge holds the genre of its type)? A world that cannot act does not claim the reading. */
    supports(text) {
      if (!fn) return false;
      return Boolean(genreOf(world ?? knowledgeWorld(lib), docTypeOf(TYPE_RE.exec(String(text ?? ''))?.[1]?.replace(/[ -]/g, '_'))));
    },
    compose(input = {}) {
      if (!fn) return { why: 'the library has no composer' };
      const req = composeRequest(input);
      const key = req.seed == null ? null : JSON.stringify([req.type, req.topic, req.chapters, req.subchapters, req.words, req.seed]);
      if (key && memo.has(key)) return memo.get(key);
      const out = this.composeNow(req);
      if (key) { memo.set(key, out); if (memo.size > 40) memo.delete(memo.keys().next().value); }
      return out;
    },
    composeNow(req) {
      const kw = world ?? knowledgeWorld(lib);
      const genre = genreOf(kw, req.type);
      if (!genre) return { why: `the knowledge has no genre for a ${DOC_TYPES[req.type].label.toLowerCase()} (no k.genres.genre ${req.type})` };
      const known = req.topic ? topicIndex(kw).get(req.topic.toLowerCase().replace(/^the\s+/, ''))?.name : null;
      const topics = req.topic ? [known ?? req.topic] : randomTopics(lib, kw, req.seed ?? Date.now() % 100000);
      if (!topics.length) return { why: 'the knowledge has no subject to write about' };
      // the genre decides the parts and their repeats; the host gives the budget: the sentences that fit the words asked (the register's middle length)
      const sentences = clip(req.words / 16, 1, 60, 12);
      let c = null, topic = null;
      for (const t of topics) {   // a random topic is the best by interest that the knowledge can fill
        topic = t;
        c = fn(kw, t, { genre, size: { sentences }, seed: Number(req.seed) || 1, realise: english(kw).realiser(Number(req.seed) || 1) });
        if (c?.why || (c?.parts && (req.topic || checkComposition(c, req).ok))) break;
      }
      if (c?.why) return { why: c.why };
      const chk = checkComposition(c, req);
      if (!chk.ok) return { why: /no claim|nothing said/.test(chk.problems[0]) ? `I know nothing about ${topic} in my knowledge yet` : `I could not write that so that every sentence reads and traces to what I know (${chk.problems[0]})` };
      return { composition: normalise(c, req, topic, kw) };
    },
  };
}

// A story sentence states an element of the plan (a setting, a hero, an attempt): its source is the wire of the catalog that element's value names.
const STORY_TYPES = ['k.scenes.scene', 'k.people.role', 'k.people.kind', 'k.animals.animal', 'k.actions.action', 'k.objects.object', 'k.story.goal'];
const storyIndex = new WeakMap();
function storyWire(kw, value) {
  if (!storyIndex.has(kw)) { const m = new Map(); for (const t of STORY_TYPES) for (const w of kw.ofType(t)) { const n = String(w.attrs.name?.[0] ?? '').replace(/^"|"$/g, ''); if (n && !m.has(n)) m.set(n, w.id); } storyIndex.set(kw, m); }
  return storyIndex.get(kw).get(String(value ?? '').split('|')[0]) ?? null;
}
const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1);
/** The frames of the library (`parts: [{ part, heading?, moves: [frame] }]`) as the document the host writes: a chapter (a slide) per part that says something; a frame with no text is not written (the library lists it in `short`). */
function normalise(c, req, topic, kw) {
  const said = c.parts.map((p) => ({ p, moves: p.moves.filter((m) => m.text) })).filter((x) => x.moves.length);
  return { title: `All about ${topicIndex(kw).get(String(topic).toLowerCase())?.type === 'k.animals.animal' ? 'the ' : ''}${topic}`, topic, type: req.type, genre: c.genre, register: c.register?.name ?? null, seed: c.seed, short: c.short ?? [],
    chapters: said.map(({ p, moves }) => ({ title: cap(p.heading ?? p.part), part: p.part, relation: p.relation ?? null,
      subchapters: [{ title: '', sentences: moves.map((m) => ({ text: m.text.trim(), source: m.cites ?? m.recalls ?? (m.element ? storyWire(kw, m.value) : null), move: m.move, takes: m.takes, element: m.element ?? null, template: m.template ?? null })) }] })) };
}

/** Shape check of the library's frames: at least one part that says something, every sentence written (no placeholder), every claim (a move that takes a fact) citing a wire, no wire twice. */
export function checkComposition(c, req) {
  const problems = [];
  const parts = c?.parts;
  if (!Array.isArray(parts) || !parts.length) return { ok: false, problems: ['no parts'] };
  const seen = new Set();
  for (const p of parts) for (const m of p.moves ?? []) {
    if (!m.text) continue;
    if (!m.text.trim() || /[<{}]|\bundefined\b/.test(m.text)) problems.push('empty or placeholder sentence');
    const id = m.cites ?? m.recalls;
    if (['fact', 'facts', 'question'].includes(m.takes) && !id) problems.push(`uncited claim: "${m.text.slice(0, 40)}"`);
    else if (id && m.takes === 'fact' && seen.has(id)) problems.push(`fact said twice: ${id}`); else if (id) seen.add(id);
  }
  if (!parts.some((p) => (p.moves ?? []).some((m) => m.text))) problems.push('nothing said');
  else if (!parts.some((p) => (p.moves ?? []).some((m) => m.text && (m.cites || m.recalls || m.element) && m.takes !== 'topic'))) problems.push('no claim: nothing is known about the topic');
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
