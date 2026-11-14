// docs.editor: the two operations that need the library's text generators (spec 26): `digest` (a summary of the open document or of pasted text, from `std.summarize`) and
// `compose` (a document written from knowledge, from `std.compose`, into the editor). The adapters (src/dialog/textgen.mjs) are installed by the engine in a well-known
// global once the library is loaded; without them these operations decline plainly. There is no local generator and no fallback text. Browser-safe.
// (Moved here from docs.reader when the document-analysis tab was removed: one Documents tab, the editor with the composition and the summary.)
import { allTexts } from './model.mjs?v=25e2bbdf20';
import { createDoc, finish } from './editor.mjs?v=56824fea28';

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
  const open = pasted ? '' : allTexts(ctx.state).map((x) => x.text).filter(Boolean).join(' ').trim();
  if (!pasted && (!open || open === ctx.state.title)) return no('missing', 'There is no document open and no text to summarise. Paste the text after "summarize this:" or write the document first.');
  const r = g.text({ text: pasted || open, doc: null, maxSentences: num(k, 3) });
  if (!r) return no('unsupported', 'I could not make a summary of that.');
  return ok(`In short: ${r.text}`, { data: { digest: true } });
}

/** The seed of a composition the person did not choose: a function of the session (how many blocks the document holds) and the request, so the engine's dry run and its real run write the same document, and the next request writes another. */
const composeSeed = (ctx, type, topic) => { let h = (ctx.state?.blocks?.length ?? 0) + 1; for (const ch of `${type ?? ''}|${topic ?? ''}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return h % 100000 + 1; };

/** Compose a document into the editor: topic (empty = random), chapters, subchapters, words. The blocks keep the wire each claim came from (`from`). */
export function compose(ctx, { type, topic, chapters, subchapters, words, seed } = {}) {
  const g = textGen()?.composer;
  if (!g?.available) return no('unsupported', UNAVAILABLE_COMPOSE);
  const r = g.compose({ type, topic, chapters: chapters === undefined || chapters === '' ? undefined : num(chapters, 3), subchapters: subchapters === undefined || subchapters === '' ? undefined : Number(NUM[String(subchapters).toLowerCase()] ?? subchapters), words: words === undefined || words === '' ? undefined : num(words, 600), seed: seed ?? composeSeed(ctx, type, topic) });
  if (!r?.composition) return no('unsupported', `I cannot write that: ${r?.why ?? 'the composer gave nothing'}.`);
  const c = r.composition;
  const blocks = [];
  for (const ch of c.chapters) {
    if (ch.title) blocks.push({ kind: 'heading', level: 2, text: ch.title });
    for (const sc of ch.subchapters) {
      if (sc.title) blocks.push({ kind: 'heading', level: 3, text: sc.title });
      blocks.push({ kind: 'paragraph', text: sc.sentences.map((s) => s.text).join(' '), from: [...new Set(sc.sentences.map((s) => s.source).filter(Boolean))] });
    }
  }
  createDoc(ctx, c.title, blocks);
  finish(ctx.state);
  return ok(`I wrote the ${String(c.type ?? 'essay').replace(/-/g, ' ')} "${c.title}": ${ctx.state.stats?.words ?? 0} words in ${c.chapters.length} ${c.chapters.length === 1 ? 'chapter' : 'chapters'}. ${c.short?.length ? `My knowledge was short of what you asked (${c.short[0]}), so it is smaller and not padded. ` : ''}It is open in the Documents tab.`, { data: { composed: true } });
}
