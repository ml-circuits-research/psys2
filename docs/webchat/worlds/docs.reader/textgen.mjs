// docs.reader: the two operations that need the library's text generators (spec 26): `digest` (a summary of the open document or of pasted text, from `std.summarize`) and
// `compose` (an essay in a new document, from `std.compose`). The adapters (src/dialog/textgen.mjs) are installed by the engine in a well-known global once the library is
// loaded; without them these operations decline plainly. There is no local generator and no fallback text. Browser-safe.
import { makeDocument, withDocument, docOfState } from './read.mjs?v=a8a79efab0';

const textGen = () => globalThis[Symbol.for('psys2.textgen')] ?? null;
const no = (status, note) => ({ status, note });
const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const num = (x, d) => { const v = NUM[String(x ?? '').toLowerCase()] ?? Number(x); return Number.isFinite(v) && v > 0 ? v : d; };

const UNAVAILABLE_SUM = 'I cannot write summaries yet: the library has no summariser (std.summarize) in this build.';
const UNAVAILABLE_COMPOSE = 'I cannot write compositions yet: the library has no composer (std.compose) in this build.';

/** Summarise the open document (no `t`) or the pasted text `t` in `k` sentences. */
export function digest(ctx, { t, k } = {}) {
  const g = textGen()?.summarizer;
  if (!g?.available) return no('unsupported', UNAVAILABLE_SUM);
  const pasted = String(t ?? '').trim();
  const d = pasted ? null : docOfState(ctx.state);
  if (!pasted && !d) return no('missing', 'There is no document open and no text to summarise. Paste the text after "summarize this:" or open a document.');
  const text = pasted || d.sentences.map((s) => s.text).join(' ');
  const r = g.text({ text, doc: d?.id ?? null, maxSentences: num(k, 3) });
  if (!r) return no('unsupported', 'I could not make a summary of that.');
  const from = d ? r.sentences.map((s) => d.sentences[s.at]).filter(Boolean).map((x) => `${d.id}.s${x.i + 1}`).slice(0, 12) : [];   // the picked sentences are the document's own: cite them
  return ok(`In short: ${r.text}`, { from, data: { digest: true, doc: d?.id ?? null, cite: d ? r.sentences.map((s) => s.at) : [] } });
}

/** The seed of a composition the person did not choose: a function of the session (how many documents it holds) and the request, so the engine's dry run and its real run write the same document, and the next request writes another. */
const composeSeed = (ctx, type, topic) => { let h = (ctx.state?.docs?.length ?? 0) + 1; for (const ch of `${type ?? ''}|${topic ?? ''}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return h % 100000 + 1; };

/** Compose an essay into a new document: topic (empty = random), chapters, subchapters, words. */
export function compose(ctx, { type, topic, chapters, subchapters, words, seed } = {}) {
  const g = textGen()?.composer;
  if (!g?.available) return no('unsupported', UNAVAILABLE_COMPOSE);
  const r = g.compose({ type, topic, chapters: chapters === undefined || chapters === '' ? undefined : num(chapters, 3), subchapters: subchapters === undefined || subchapters === '' ? undefined : Number(NUM[String(subchapters).toLowerCase()] ?? subchapters), words: words === undefined || words === '' ? undefined : num(words, 600), seed: seed ?? composeSeed(ctx, type, topic) });
  if (!r?.composition) return no('unsupported', `I cannot write that: ${r?.why ?? 'the composer gave nothing'}.`);
  const c = r.composition;
  const out = c.chapters.map((ch) => `## ${ch.title}\n\n${ch.subchapters.map((sc) => `${sc.title ? `### ${sc.title}\n\n` : ''}${sc.sentences.map((s) => s.text).join(' ')}`).join('\n\n')}`);
  const flat = c.chapters.flatMap((ch) => ch.subchapters.flatMap((sc) => sc.sentences));
  const doc = makeDocument(`# ${c.title}\n\n${out.join('\n\n')}`, { name: `${c.title}.md`, title: c.title, format: 'md', origin: 'composed' });
  // the per-sentence source (the wire of each claim), kept for "why": sentence i of the analysed text is the i-th composed sentence that it contains
  doc.provenance = {};
  let j = 0;
  for (const s of doc.sentences) { const f = flat[j]; if (f && s.text.replace(/\s+/g, ' ').includes(f.text.replace(/\s+/g, ' ').slice(0, 30))) doc.provenance[s.i] = f.source, j++; }
  Object.assign(ctx.state, withDocument(ctx.state, doc));
  const d = ctx.state.docs.find((x) => x.id === ctx.state.active);
  return ok(`I wrote the ${String(c.type ?? 'essay').replace(/-/g, ' ')} "${c.title}": ${doc.words} words in ${c.chapters.length} ${c.chapters.length === 1 ? 'chapter' : 'chapters'}. ${c.short?.length ? `My knowledge was short of what you asked (${c.short[0]}), so it is smaller and not padded. ` : ''}It is open in the Documents tab; ask "why" about any sentence to see where it comes from.`, { data: { doc: d?.id, composed: true } });
}
