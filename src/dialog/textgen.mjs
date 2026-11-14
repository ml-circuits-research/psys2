// SPDX-License-Identifier: AGPL-3.0-only
// TEXT GENERATION adapters (specs/26-summary-and-composition.md): the host side of sopworld's `std.summarize` and `std.compose`. Until the library
// releases them, `available` is false, every call returns null and the UI hides what needs them: there is NO local generator and NO fallback text here.
// Browser-safe: no `node:*` imports; the library module is passed in.

const pick = (lib, name) => (typeof lib?.[name] === 'function' ? lib[name] : typeof lib?.std?.[name] === 'function' ? lib.std[name] : null);
const clip = (n, lo, hi, def) => { const v = Math.round(Number(n)); return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : def)); };

// ---- std.summarize (sopworld >= 0.61): `summarizeLog(entries, { parentOf, length })` returns FRAMES { act, kind, count, kinds?, failed?, salience }; `summarizeText(text, { n })`
// returns { sentences: [{ text, score, at }], picked: [text] } (extractive). The library does not write English: the frames are rendered here (TEMPORARY verb table, until the
// language world renders frames) into at most three sentences: what was done, which worlds were used, what was taught.
const IRREGULAR = { draw: 'drew', make: 'made', put: 'put', take: 'took', give: 'gave', build: 'built', write: 'wrote', buy: 'bought', sit: 'sat', tell: 'told', find: 'found', set: 'set', get: 'got', say: 'said', go: 'went', read: 'read', teach: 'taught', run: 'ran', see: 'saw', color: 'coloured', colour: 'coloured' };
const pastOf = (v) => IRREGULAR[v] ?? (/e$/.test(v) ? `${v}d` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ied` : `${v}ed`);
const pluralOf = (w) => (/(?:s|x|z|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const NUMW = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
const joinAnd = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const nounPhrase = (kind, n) => (n === 1 ? `a ${kind}` : `${NUMW[n] ?? n} ${pluralOf(kind)}`);
const SKIPWORDS = new Set(['the', 'a', 'an', 'my', 'this', 'that', 'it', 'please', 'some', 'of', 'to', 'in', 'on']);

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
/** The entries `summarizeLog` aggregates, from the turn records of `turnRecord` (each turn holds `acts`: [{ verb, kind }]). */
export function logEntries(turns) {
  const out = [];
  for (const t of turns) for (const a of t.acts ?? []) out.push({ act: a.verb, kind: a.kind ?? null, failed: isBad(t), changed: t.outcome === 'done' ? 1 : 0.5 });
  return out;
}

/** The verb and the kinds of a request, for the log entries: the first word of the segment and its noun phrases (one per "and"), a leading number repeating the kind. */
export function actsOfSegment(text, thingText) {
  const verb = String(text ?? '').trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, '') ?? '';
  if (verb.length < 3) return [];
  const out = [];
  for (const np of String(thingText ?? '').toLowerCase().split(/\s+and\s+|,/)) {
    const w = np.trim().split(/\s+/).filter((x) => x && !SKIPWORDS.has(x));
    if (!w.length) continue;
    const nw = w.find((x) => /^\d+$/.test(x) || Object.values(NUMW).includes(x));
    const n = nw === undefined ? 1 : /^\d+$/.test(nw) ? Number(nw) : Number(Object.keys(NUMW).find((k) => NUMW[k] === nw));
    let kind = w.at(-1).replace(/[^a-z]/g, '');
    if (kind.length < 3) continue;
    if (/ies$/.test(kind)) kind = `${kind.slice(0, -3)}y`; else if (/(?:ches|shes|xes|sses)$/.test(kind)) kind = kind.slice(0, -2); else if (/s$/.test(kind) && !/ss$/.test(kind)) kind = kind.slice(0, -1);
    for (let i = 0; i < Math.min(n, 20); i++) out.push({ verb, kind });
  }
  return out.length ? out : [{ verb, kind: null }];
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
      const failed = entries.length ? entries.filter((e) => e.failed).length : turns.filter(isBad).length;
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
  return { title: String(c.title).trim(), topic: c.topic ?? null, type: c.type ?? null, procedure: c.procedure, chapters: c.chapters.map((ch) => ({ title: String(ch.title).trim(),
    subchapters: ch.subchapters.map((sc) => ({ title: String(sc.title ?? '').trim(), sentences: sc.sentences.map((s) => ({ text: s.text.trim(), source: s.source, world: s.world ?? null })) })) })) };
}

/** Shape check against the request: exact chapter / subchapter counts, every sentence sourced and free of placeholders. Returns { ok, problems }. */
export function checkComposition(c, req) {
  const problems = [];
  if (!c || typeof c.title !== 'string' || !c.title.trim() || !Array.isArray(c.chapters)) return { ok: false, problems: ['no title or chapters'] };
  if (c.type !== undefined && c.type !== req.type) problems.push(`type ${c.type} != ${req.type}`);
  if (!c.procedure) problems.push('no procedure: the type\'s method must come from knowledge (k.genres / k.story / k.procedures)');
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
