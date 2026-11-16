// SPDX-License-Identifier: AGPL-3.0-only
// docs.editor document: the document itself, as a tool (spec 28 sections 12, 14). Its state hygiene (the derived TipTap JSON and statistics), its history (one step per request),
// a new document from blocks, and the TOOL PRIMITIVES the request door runs through request.sop's std.tool wires, with the document's view as facts. No request, no words of a
// person, no reply sentences, no defaults: values come in as the tool takes them (the library planned and translated them) and a call answers with a status, the ids it changed,
// or a refusal code / a reply fact's name. The editor's word operations (editor.mjs) build on this module; this module never imports them. Browser-safe.
import { titleBlock, getText, normalizeMarks, toDoc, stats as computeStats } from './model.mjs';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const MAX_HISTORY = 50;

// ---- state hygiene ---------------------------------------------------------------------------------
const blockById = (s, id) => (id === 'title' ? titleBlock(s) : s.blocks.find((b) => b.id === id) ?? null);
/** The derived parts (TipTap JSON, statistics) and the clamped selection of a state. */
export function sync(s) {
  s.titleMarks ??= []; s.titleAlign ??= 'left'; s.titleSize ??= 0; s.selection ??= null; s.focus ??= null;
  for (const b of s.blocks) {
    if (b.kind === 'list') { b.style ??= 'bullet'; if (b.style === 'task') { b.checked ??= []; while (b.checked.length < b.items.length) { budget.tick('ops.sync'); b.checked.push(false); } b.checked.length = b.items.length; } else delete b.checked; }
    if (b.kind === 'heading') b.level ??= 2;
    if (b.kind !== 'rule') normalizeMarks(b);
  }
  normalizeMarks(titleBlock(s));
  const sel = s.selection;
  if (sel?.type === 'blocks') {
    const ids = sel.blocks.filter((id) => id === 'title' || s.blocks.some((b) => b.id === id));
    s.selection = ids.length ? { type: 'blocks', blocks: ids } : null;
  } else if (sel?.type === 'range') {
    const b = blockById(s, sel.block);
    const len = b ? getText(b, sel.at)?.length : undefined;
    if (len === undefined) s.selection = b && b.kind !== 'rule' ? { type: 'blocks', blocks: [b.id] } : null;
    else { const from = Math.max(0, Math.min(sel.from, len)), to = Math.max(0, Math.min(sel.to, len)); s.selection = to > from || sel.item ? { ...sel, from, to } : null; }
  } else if (sel) s.selection = null;
  s.doc = toDoc(s);
  s.stats = computeStats(s);
}

// ---- history ---------------------------------------------------------------------------------------
export const snap = (s) => structuredClone({ title: s.title, titleMarks: s.titleMarks, titleAlign: s.titleAlign, titleSize: s.titleSize, blocks: s.blocks, cursor: s.cursor, nextId: s.nextId, selection: s.selection, kind: s.kind ?? null, about: s.about ?? null, textId: s.textId ?? null });
export function commit(s) {
  s.history.push(snap(s));
  while (s.history.length > MAX_HISTORY) { budget.tick('ops.commit'); s.history.shift(); }
  s.future = [];
}
export function restore(s, sn) {
  s.title = sn.title; s.titleMarks = sn.titleMarks ?? []; s.titleAlign = sn.titleAlign ?? 'left'; s.titleSize = sn.titleSize ?? 0;
  s.blocks = sn.blocks; s.cursor = sn.cursor; s.nextId = sn.nextId; s.selection = sn.selection ?? null; s.dictBlock = null; s.kind = sn.kind ?? null; s.about = sn.about ?? null; s.textId = sn.textId ?? null;
}
export const newId = (s) => `b${s.nextId++}`;
export function addBlock(s, block, index = s._ins ?? s.blocks.length) {
  const b = { id: newId(s), ...block };
  s.blocks.splice(index, 0, b);
  s.cursor = index;
  return b;
}
export const show = (ctx) => { try { ctx.request('ui.openTab', { tab: 'editor' }); } catch { /* the shell may not know the tab */ } };
/** A new document of blocks (the old one is one undo away). */
export function createDoc(ctx, title, blocks) {
  const s = ctx.state;
  commit(s);
  s.title = title; s.titleMarks = []; s.titleAlign = 'left'; s.titleSize = 0; s.blocks = []; s.dictBlock = null; s.selection = null; s.kind = null; s.about = null;
  for (const b of blocks) addBlock(s, b);
  s.cursor = 0;
  show(ctx);
  ctx.effect('speech.say', { text: title });
}

/**
 * TOOL PRIMITIVES OF THE DOCUMENT (spec 28 section 12; reviewer 2026-11-16 01:25: Documents on the binding). Named arguments only:
 *   kind      the kind of text (story, essay, report, poem: what the composer writes)       about   the topic (none: the composer picks one)
 *   words     how many words (a number; the library filled it from what was said or the k.expect rows of request.sop)
 *   chapters  how many chapters the composer is asked for (the plan's count)                n / whole   keepChapters: the text has at most n chapters
 * The composer is the library's std.compose (installed by the engine in a well-known global); it never pads: a text shorter than asked is what the knowledge holds.
 * Result: { status: 'supported', changed } or { status: 'missing', code } (no_composer, nothing_known, no_text; nothing_known names the reply fact refused.nothing_known with the topic).
 */
const textGen = () => globalThis[Symbol.for('psys2.textgen')] ?? null;
const done = (changed = []) => ({ status: 'supported', value: '', changed });
const refuse = (code) => ({ status: 'missing', value: '', code });
const count = (x) => { const v = Number(x); return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined; };
/** The seed of a composition: a function of the session (how many blocks the document holds) and the request, so a dry run and the real run write the same text, and the next request another. */
const composeSeed = (s, type, topic) => { let h = (s?.blocks?.length ?? 0) + 1; for (const ch of `${type ?? ''}|${topic ?? ''}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; return h % 100000 + 1; };
const chapterHeads = (s) => s.blocks.filter((b) => b.kind === 'heading' && (b.level ?? 2) <= 2);

/** A text of a kind about a topic, written by the composer into a new document: its chapters as level-2 headings, its sections as level-3 headings, each paragraph with its sources. */
export function writeText(ctx, { kind, about = null, words = null, chapters = null } = {}) {
  const g = textGen()?.composer, s = ctx.state;
  if (!g?.available) return { ...refuse('no_composer'), reply: 'refused.no_composer' };   // said by the reply fact: this build has no composer
  const r = g.compose({ type: kind ?? undefined, topic: about ?? undefined, chapters: count(chapters), words: count(words), seed: composeSeed(s, kind, about) });
  if (!r?.composition) return { ...refuse('nothing_known'), ...(about ? { reply: 'refused.nothing_known', roles: { about: String(about) } } : {}) };   // said by the reply fact: what the knowledge has nothing of
  const c = r.composition, blocks = [];
  for (const ch of c.chapters) {
    budget.tick('docs.tool');
    if (ch.title) blocks.push({ kind: 'heading', level: 2, text: ch.title });
    for (const sc of ch.subchapters) {
      if (sc.title) blocks.push({ kind: 'heading', level: 3, text: sc.title });
      blocks.push({ kind: 'paragraph', text: sc.sentences.map((x) => x.text).join(' '), from: [...new Set(sc.sentences.map((x) => x.source).filter(Boolean))] });
    }
  }
  createDoc(ctx, c.title, blocks);
  s.kind = kind ?? c.type ?? 'text'; s.about = about ?? null; s.textSeq = (s.textSeq ?? 0) + 1; s.textId = `text${s.textSeq}`;   // a new text is a new thing of the view (the old one is gone with its chapters)
  sync(s);
  return done([s.textId, ...chapterHeads(s).map((b) => b.id)]);
}
/** The text has at most n chapters: the later ones go (their sections with them). Fewer chapters than n are what the knowledge holds: nothing is padded. */
export function keepChapters(ctx, { n } = {}) {
  const s = ctx.state, k = count(n);
  if (!s.kind) return refuse('no_text');
  const heads = chapterHeads(s);
  if (k && heads.length > k) { const from = s.blocks.indexOf(heads[k]); s.blocks = s.blocks.slice(0, from); sync(s); show(ctx); }
  return done(chapterHeads(s).map((b) => b.id));
}
/** The document's own undo / redo, said by the reply facts done.undo / nothing.undo (done.redo / nothing.redo). */
export function undoStep(ctx) {
  const s = ctx.state;
  if (!s.history?.length) return { status: 'missing', value: '', reply: 'nothing.undo' };
  s.future.push(snap(s)); restore(s, s.history.pop()); sync(s); show(ctx);
  return { status: 'supported', value: '', reply: 'done.undo' };
}
export function redoStep(ctx) {
  const s = ctx.state;
  if (!s.future?.length) return { status: 'missing', value: '', reply: 'nothing.redo' };
  s.history.push(snap(s)); restore(s, s.future.pop()); sync(s); show(ctx);
  return { status: 'supported', value: '', reply: 'done.redo' };
}
/** The document as facts (the library's view): the text a request wrote (its kind and topic) and its chapters. A document not written by a request is not a thing of the view. */
export function toolView(ctx) {
  const s = ctx.state;
  if (!s?.kind) return [];
  return [{ id: s.textId ?? 'text', kind: s.kind, ...(s.about ? { about: s.about } : {}) }, ...chapterHeads(s).map((b) => ({ id: b.id, kind: 'chapter', in: s.textId ?? 'text' }))];
}
