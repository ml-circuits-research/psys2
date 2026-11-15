// SPDX-License-Identifier: AGPL-3.0-only
// TEXT GENERATION adapters (specs/26-summary-and-composition.md): the host side of sopworld's `std.summarize` and `std.compose`. Until the library
// releases them, `available` is false, every call returns null and the UI hides what needs them: there is NO local generator and NO fallback text here.
// Browser-safe: no `node:*` imports; the library module is passed in.

import { knowledgeWorld, languageWorld, randomTopics, topicIndex } from './compose-world.mjs';
import { englishOf } from '../lang/en-generate.mjs';
import { relatedTopics, readLongTopic, isLongTopic, knownName, wordCount, nameIndex, PRIMARY } from './compose-plan.mjs';

const pick = (lib, name) => (typeof lib?.[name] === 'function' ? lib[name] : typeof lib?.std?.[name] === 'function' ? lib.std[name] : null);
const clip = (n, lo, hi, def) => { const v = Math.round(Number(n)); return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : def)); };

// ---- std.summarize (sopworld >= 0.61): `summarizeLog(entries, { parentOf, length })` returns FRAMES { act, kind, count, kinds?, failed?, salience }; `summarizeText(text, { n })`
// returns { sentences: [{ text, score, at }], picked: [text] } (extractive). The library does not write English: a frame is said through the language world's generation templates
// (w.lang.en.template: "add {number} {kind:num=pl}.", filled by the library, plurals and articles by src/lang/en-generate.mjs). There is no verb table here. What a frame says is what
// the person asked ("You asked me to add 3 trees and remove a house"); a frame of an act with no template that fits (a place with no spot named) is counted, not worded.

const isBad = (t) => ['refused', 'not-understood', 'question-back'].includes(t.outcome);
/** The entries `summarizeLog` aggregates, from the turn records of `turnRecord`: the acts the worlds executed (`acts`: [{ world, act, kind }], from the formalized reading). Failed turns have none and are only counted. */
export function logEntries(turns) {
  const out = [];
  for (const t of turns) if (!isBad(t)) for (const a of t.acts ?? []) out.push({ act: a.act, kind: a.kind ?? null, changed: 1 });
  return out;
}

export function createSummarizer(lib, world) {
  let en0 = null;
  const list = (a) => lib.joinList(a);   // the library's (0.102)
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
      const did = lib.renderFrames(Array.isArray(frames) ? frames : [], { world: languageWorld(lib), failed });   // the library's (0.102)
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
  const t = String(topic ?? '').trim().replace(/^["“”']+|["“”']+$/g, '').trim();   // a long topic comes quoted from the form
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
      return Boolean(lib.genreOf(world ?? knowledgeWorld(lib), docTypeOf(TYPE_RE.exec(String(text ?? ''))?.[1]?.replace(/[ -]/g, '_'))));
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
      const genre = lib.genreOf(kw, req.type);
      if (!genre) return { why: `the knowledge has no genre for a ${DOC_TYPES[req.type].label.toLowerCase()} (no k.genres.genre ${req.type})` };
      const index = topicIndex(kw);
      // a topic written as a paragraph: the names the knowledge knows in it (the subject, the subtopics) and the keys of facts it names; the rest is said back as not used
      const long = req.topic && isLongTopic(req.topic) ? readLongTopic(kw, req.topic, { subjects: new Set(index.keys()) }) : null;
      if (long && !long.topic) return { why: `I found nothing I know in what you wrote ("${clipText(req.topic, 80)}"), so I have nothing to write from` };
      const asked = long ? long.topic : req.topic;
      // a short topic is a subject of the knowledge as written, or in another spelling the knowledge lists ("penguins"); a topic read from a paragraph is a known name already
      const spelled = asked && !long ? knownName(kw, asked) : null;
      const known = asked ? index.get(asked.toLowerCase().replace(/^the\s+/, ''))?.name ?? (long ? asked : spelled && index.has(spelled.toLowerCase()) ? spelled : null) : null;
      const topics = asked ? [known ?? asked] : randomTopics(lib, kw, req.seed ?? Date.now() % 100000);
      if (!topics.length) return { why: 'the knowledge has no subject to write about' };
      // the genre decides the parts and their repeats; the host gives the budget: the sentences that fit the words asked (the register's middle length)
      const sentences = clip(req.words / 16, 1, 60, 12);
      const seed = Number(req.seed) || 1;
      let c = null, topic = null;
      for (const t of topics) {   // a random topic is the best by interest that the knowledge can fill
        topic = t;
        c = fn(kw, t, { genre, size: { sentences }, seed, quiet: [...QUIET_KEYS], realise: english(kw).realiser(seed) });
        if (c?.why || (c?.parts && (req.topic || checkComposition(c, req).ok))) break;
      }
      if (c?.why) return { why: c.why };
      const chk = checkComposition(c, req);
      if (!chk.ok) return { why: /no claim|nothing said/.test(chk.problems[0]) ? `I know nothing about ${topic} in my knowledge yet` : `I could not write that so that every sentence reads and traces to what I know (${chk.problems[0]})` };
      if (long) {   // the words of fact keys the person wrote count only when the topic's facts or its relations have that key ("what they eat": eats; not "know")
        const own = new Set((nameIndex(kw).names.get(String(topic).toLowerCase())?.facts ?? []).flatMap((w) => Object.keys(w.attrs)));
        const rel = new Set(relatedTopics(kw, topic).map((r) => r.key));
        long.keys = long.keys.filter((k) => own.has(k) || rel.has(k));
        for (const p of long.phrases) p.used = p.used.filter((u) => !nameIndex(kw).keys.has(u) || long.keys.includes(u) || nameIndex(kw).names.has(u.toLowerCase()));
        long.unused = long.phrases.filter((p) => !p.used.length).map((p) => p.text);
      }
      const composition = normalise(c, req, topic, kw);
      if (req.type !== 'story') widen(composition, { kw, genre, seed, topic, prefer: long?.subtopics ?? [], keys: long?.keys ?? [], words: req.words });
      composition.words = compositionWords(composition);
      composition.asked = req.words;
      if (long) {
        const written = new Set((composition.related?.topics ?? []).map((n) => n.toLowerCase()));
        // a name of the paragraph that a fact of the topic gives (penguin: habitat ice, class bird) is used even when it has no section of its own (it chose the siblings, the facts)
        const own = (nameIndex(kw).names.get(String(topic).toLowerCase())?.facts ?? []);
        const linked = (n) => own.some((w) => Object.values(w.attrs).some((vs) => vs.some((v) => String(v).replace(/^"|"$/g, '').toLowerCase() === n.toLowerCase())))
          || (nameIndex(kw).names.get(n.toLowerCase())?.facts ?? []).some((w) => Object.values(w.attrs).some((vs) => vs.some((v) => String(v).replace(/^"|"$/g, '') === topic)));
        const rest = long.subtopics.filter((s) => !written.has(s.toLowerCase()));
        composition.read = { topic: long.topic, subtopics: long.subtopics.filter((s) => written.has(s.toLowerCase())), linked: rest.filter(linked), unlinked: rest.filter((s) => !linked(s)), keys: long.keys, unused: long.unused, phrases: long.phrases.length };
      }
      delete composition.unlinked;
      return { composition };
    },
  };

  /**
   * THE SIZE ASKED (owner request 2026-11-15): `std.compose` writes about one topic from the facts that name it; when that is shorter than the words asked, the document grows by
   * the topics the knowledge relates to it (compose-plan.mjs `relatedTopics`: what its facts name, what names it, its siblings), each a section composed by the library about that
   * topic and opened by the linking fact (`clauseOf`, cited), grouped in chapters by relation, before the closing part. No fact and no sentence twice; it stops at the words asked
   * or when the knowledge has no more related topics, and then the composition is the smaller one (the reply says how many words the knowledge gave).
   */
  function widen(composition, { kw, genre, seed, topic, prefer, keys, words }) {
    const en = english(kw);
    const said = new Set(), cited = new Set();
    for (const ch of composition.chapters) for (const sc of ch.subchapters) for (const s of sc.sentences) { said.add(s.text.toLowerCase()); if (s.source && s.takes === 'fact') cited.add(s.source); }
    let total = compositionWords(composition);
    if (total >= words * 0.9) return;
    const closing = composition.chapters.length > 1 ? composition.chapters.pop() : null;   // the closing part (conclusion, summary, next steps, questions) stays last
    const groups = new Map();
    let tried = 0;
    const cands = relatedTopics(kw, topic, { prefer, keys });
    // a subtopic the person named that no fact links to the topic is not written (a section about "school" in an essay about France would not follow from anything): said instead
    composition.unlinked = prefer.filter((p) => !cands.some((x) => x.name.toLowerCase() === String(p).toLowerCase()));
    for (const r of cands) {
      if (total >= words * 0.95 || tried >= 60) break;
      tried++;
      const need = clip((words - total) / 14, 3, 14, 8);
      const claims = [], told = new Set(r.link ? Object.entries(r.link.attrs).filter(([k]) => k !== 'name').flatMap(([k, vs]) => vs.map((v) => `${k}=${v}`)) : []);
      // the facts of a section: the related topic's own facts (its subject wires; a fact that only names it among its values is about something else), the most interesting first
      // by the library's k.interest (`interestOf`), at most the sentences the size still needs. (Composing each section with `std.compose` and keeping only its claims took
      // 40-160 ms a section and chose among the same facts.)
      const frames = (nameIndex(kw).names.get(r.name.toLowerCase())?.facts ?? []).filter((w) => !/^k\.actions\./.test(w.type) && (!r.type || !PRIMARY.test(w.type) || w.type === r.type))   // an act of the same name (to water) is not a fact about the thing (the water)
        .map((w, i) => ({ w, i, score: lib.interestOf(kw, w, { topic: r.name }).score ?? 0 })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, need)
        .map(({ w }) => ({ text: '', cites: w.id, takes: 'fact', move: 'state', fact: { type: w.type, attrs: Object.fromEntries(Object.entries(w.attrs).filter(([k]) => !k.startsWith('core.')).map(([k, vs]) => [k, vs.map((v) => String(v).replace(/^"|"$/g, ''))])) } }));
      for (const m of frames) {
        if (!m.cites || cited.has(m.cites)) continue;
        if (r.type && m.fact && PRIMARY.test(m.fact.type) && m.fact.type !== r.type) continue;   // one thing per section: Luxembourg the country, not also the city
        // a section about a related topic is background, not an argument: its claims are said as the language's plain clauses of the facts the library chose (no "This is shown
        // by the fact that" before each, which repeated across sections reads as filler); what the section already said of the topic is not said again ("can fly" in two facts);
        // the discourse sentence is kept when the fact has no clause
        // a fact with many keys is said in sentences of two keys each (one run-on clause of six "has a ..." is not readable); a value that is the subject itself says nothing
        const texts = [];
        if (m.fact) {
          const subj = m.fact.attrs.name ?? m.fact.attrs.about;
          const keep = Object.entries(m.fact.attrs).filter(([k]) => k !== 'name' && k !== 'about' && !QUIET_KEYS.has(k)).map(([k, vs]) => [k, vs.filter((v) => !told.has(`${k}=${v}`) && v !== subj?.[0])]).filter(([, vs]) => vs.length);
          for (let i = 0; i < keep.length; i += 2) {
            const part = { type: m.fact.type, attrs: { [m.fact.attrs.name ? 'name' : 'about']: subj, ...Object.fromEntries(keep.slice(i, i + 2)) } };
            const cl = lib.clauseOf(kw, part, { names: placeNames(kw), parts: 2, quiet: [...QUIET_KEYS] });
            if (cl) texts.push(`${cap(cl)}.`);
          }
          for (const [k, vs] of keep) for (const v of vs) told.add(`${k}=${v}`);
          if (!keep.length) continue;
        }
        if (!texts.length && m.text) texts.push(m.text.trim());
        let any = false;
        for (const text of texts) {
          const k = text.toLowerCase();
          if (said.has(k) || /[<{}]|\bundefined\b/.test(text)) continue;
          claims.push({ text, source: m.cites, move: m.move, takes: m.takes, element: null, template: m.template ?? null });
          said.add(k); any = true;
        }
        if (any) cited.add(m.cites);
      }
      if (claims.length < (r.link ? 1 : 2)) { for (const x of claims) { said.delete(x.text.toLowerCase()); cited.delete(x.source); } continue; }
      const lead = [];
      if (r.link) {
        const cl = lib.clauseOf(kw, r.link, { names: placeNames(kw) }), text = cl ? `${cap(cl)}.` : null;
        if (text && !said.has(text.toLowerCase())) { lead.push({ text, source: r.cites, move: 'link', takes: 'link', element: null, template: null }); said.add(text.toLowerCase()); }
      }
      const g = `${r.dir}:${r.key}`;
      if (!groups.has(g)) groups.set(g, { dir: r.dir, key: r.key, names: [], sections: [] });
      const grp = groups.get(g);
      grp.names.push(r.name);
      grp.sections.push({ title: cap(en.np(r.name)), topic: r.name, relation: r.key, sentences: [...lead, ...claims] });
      total += wordCount([...lead, ...claims].map((x) => x.text).join(' '));
    }
    for (const grp of groups.values()) {
      const head = grp.dir === 'out' ? lib.clauseOf(kw, { type: 'compose.heading', attrs: { name: [topic], [grp.key]: grp.names.slice(0, 6) } }, { names: placeNames(kw) }) : null;
      composition.chapters.push({ title: cap(head ?? lib.joinList(grp.names.slice(0, 6).map((n) => en.np(n)))), part: 'related', relation: grp.key, subchapters: grp.sections });
    }
    if (closing) composition.chapters.push(closing);
    composition.related = { tried, topics: [...groups.values()].flatMap((g) => g.names) };
  }
}

/** Keys the host does not narrate (the library's `quiet`): codes and coordinates are identifiers, not things to say ("France has a code2 of FR", "Spain has a west of -18.16"). */
const QUIET_KEYS = new Set(['code', 'code2', 'lat', 'lon', 'west', 'east', 'north', 'south']);
const places = new WeakMap();
const placeNames = (kw) => (places.has(kw) ? places.get(kw) : places.set(kw, new Set(kw.ofType('k.geo.country').concat(kw.ofType('k.geo.city')).map((w) => String(w.attrs.name?.[0] ?? '').replace(/^"|"$/g, '')))).get(kw));
const clipText = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
/** The words a composition holds (its sentences; headings are not counted). */
export const compositionWords = (c) => wordCount(c.chapters.flatMap((ch) => ch.subchapters.flatMap((sc) => sc.sentences.map((s) => s.text))).join(' '));

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
