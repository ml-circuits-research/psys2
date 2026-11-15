// docs.editor: the two operations that need the library's text generators (spec 26): `digest` (a summary of the open document or of pasted text, from `std.summarize`) and
// `compose` (a document written from knowledge, from `std.compose`, into the editor). The adapters (src/dialog/textgen.mjs) are installed by the engine in a well-known
// global once the library is loaded; without them these operations decline plainly. There is no local generator and no fallback text. Browser-safe.
// (Moved here from docs.reader when the document-analysis tab was removed: one Documents tab, the editor with the composition and the summary.)
import { allTexts } from './model.mjs?v=2f37cc47a6';
import { createDoc, finish } from './editor.mjs?v=eb3053781e';

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
  // the size asked is honoured as far as the knowledge goes, and said when it does not (owner request 2026-11-15): never padded
  const written = c.words ?? ctx.state.stats?.words ?? 0, asked = c.asked ?? null, topicNp = c.title.replace(/^All about /, '');
  const sections = c.chapters.reduce((n, ch) => n + ch.subchapters.length, 0);
  const size = asked && written < asked * 0.8
    ? `I could write about ${fmt(written)} words about ${topicNp} from what I know (you asked for ${fmt(asked)}); I did not pad it with repetition. `
    : c.short?.length && !asked ? `My knowledge was short of what you asked (${c.short[0]}), so it is smaller and not padded. ` : '';
  const read = c.read ? usedNote(c.read) : '';
  return ok(`I wrote the ${String(c.type ?? 'essay').replace(/-/g, ' ')} "${c.title}": ${fmt(written)} words in ${c.chapters.length} ${c.chapters.length === 1 ? 'chapter' : 'chapters'}${sections > c.chapters.length ? ` and ${sections} sections` : ''}. ${read}${size}It is open in the Documents tab.`, { data: { composed: true } });
}

const fmt = (n) => Number(n).toLocaleString('en-US');
const quoteList = (xs) => xs.map((x) => `"${x.length > 60 ? `${x.slice(0, 59)}…` : x}"`).join(', ');
/** What was taken from a topic written as a paragraph: the subject, the subtopics and the words that chose the facts; the phrases nothing was taken from. */
function usedNote(r) {
  const used = [`${r.topic} (the subject)`, ...r.subtopics.slice(0, 8), ...(r.linked ?? []).slice(0, 6), ...r.keys.slice(0, 6).map((k) => `"${k.replace(/_/g, ' ')}"`)];
  const unused = r.unused.slice(0, 4), unlinked = (r.unlinked ?? []).slice(0, 4);
  const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  return `From your topic I used ${and(used)}. ${unlinked.length ? `I know ${and(unlinked)}, but nothing that links ${unlinked.length > 1 ? 'them' : 'it'} to ${r.topic}, so I left ${unlinked.length > 1 ? 'them' : 'it'} out. ` : ''}${unused.length ? `I found nothing I know in ${quoteList(unused)}${r.unused.length > unused.length ? ` and ${r.unused.length - unused.length} more` : ''}. ` : ''}`;
}

// ---- spec 28: a text as the goal of a request (w.request) ---------------------------------------------------------------------------------------------------
/** What the turn wrote, for the check of a request (spec 28 section 4): the chapters (headings that start chapters) and the words of the document. Read-only. */
export function requestResult(ctx) {
  const bl = ctx.state?.blocks ?? [];
  const words = bl.reduce((a, b) => a + String(b.text ?? '').split(/\s+/).filter(Boolean).length, 0);
  const chapters = bl.filter((b) => b.kind === 'heading' && (b.level ?? 2) <= 2).length;
  return { parts: chapters, chapters, words, kinds: {} };
}

/**
 * PLAN A TEXT FOR A REQUEST (spec 28 section 4, step 5): the kind (story, essay, report), the topic, the chapters and the length said, the rest from the expectation of the kind
 * (request.sop w.expect until k.expect is read from the pin): "short" and "long" are factors on its usual words. The composer is the library's std.compose (textgen.mjs).
 */
export function planRequest(ctx, goal = {}) {
  const f = goal.request?.facts ?? [];
  const exp = goal.expect ?? {};
  const ch = f.find((x) => x.key === 'length' && x.unit === 'chapter')?.n;
  const said = f.find((x) => x.key === 'length' && x.unit === 'word')?.n;
  const [lo, hi] = exp.words ?? [150, 300];
  const words = said ?? (goal.size === 'small' ? Math.max(30, Math.round(lo * (exp.small ?? 0.4))) : goal.size === 'big' ? Math.round(hi * (exp.big ?? 3)) : undefined);
  const r = compose(ctx, { type: goal.target ?? undefined, topic: goal.topic ?? undefined, chapters: ch, words, seed: goal.seed });
  if (r?.status !== 'supported') return r;
  const st = ctx.state, cannot = [];
  // the chapters said: the composer's parts are put together into that many (the later parts go under the last heading kept); more than the knowledge has is said, not padded
  const heads = () => st.blocks.filter((b) => b.kind === 'heading' && (b.level ?? 2) <= 2);
  if (ch && heads().length > ch) { const drop = new Set(heads().slice(ch).map((b) => b.id ?? b)); st.blocks = st.blocks.filter((b) => !drop.has(b.id ?? b)); }
  else if (ch && heads().length < ch) cannot.push({ key: 'length', words: `${ch} chapters` });
  // a short text: the sections keep their first sentences until the length fits (never below one sentence per section)
  if (words && !said && goal.size === 'small') {
    const count = () => st.blocks.reduce((a, b) => a + String(b.text ?? '').split(/\s+/).filter(Boolean).length, 0);
    for (let guard = 0; count() > words && guard < 50; guard++) {
      const p = st.blocks.filter((b) => b.kind === 'paragraph').map((b) => ({ b, ss: String(b.text).match(/[^.!?]+[.!?]+/g) ?? [b.text] })).filter((x) => x.ss.length > 1).sort((a, c) => c.ss.length - a.ss.length)[0];
      if (!p) break;
      p.b.text = p.ss.slice(0, -1).join('').trim();
    }
  }
  finish(st);
  const n = heads().length, w = st.stats?.words ?? 0;
  r.value = `I wrote the ${goal.target ?? 'text'} "${st.title}". It has ${w} words in ${n} ${n === 1 ? 'chapter' : 'chapters'}.${w < (said ?? 0) * 0.8 ? ` I know only enough for ${w} words about this; I did not pad it.` : ''} It is open in the Documents tab.`;
  r.cannot = cannot;
  return r;
}
