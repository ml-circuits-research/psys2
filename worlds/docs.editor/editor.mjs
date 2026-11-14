// Operations of docs.editor: talk with a document, format it by reference, dictate, edit, create documents from the conversation (spec 07).
//
// State (ctx.state): { title, titleMarks, titleAlign, titleSize, blocks: [block], cursor (index of the block last added or changed, -1 when none),
//   selection: null | { type: 'blocks', blocks: [ids] } | { type: 'range', block, at, from, to, item? }, focus: null | { id, n } (navigation),
//   doc (TipTap JSON, derived), stats (derived), inputMode: null|'dictation', history: [snapshots, max 50], future, nextId, dictBlock }
// Blocks and marks: see model.mjs. References ("the second paragraph", "the word milk", "it"): see target.mjs.
// Effects: speech.say { text }, clipboard.copy { text }, file.download { filename, mime, content }.
// Modal input: while inputMode is 'dictation' the engine offers every message to interceptInput(ctx, text) before formalization.
// Cross-world: ctx.request('ui.openTab', { tab: 'editor' }) after every change; ctx.find / ctx.ask read kids.tasks, kids.animals and kids.arith.
// Every created sentence comes from wires: created blocks keep the ids of the wires they were made from in `from`.
// Every exported operation is wrapped so that `doc` and `stats` are rebuilt after it (the tab renders `doc` with TipTap).

import {
  DEFAULT_TITLE, highlightHex, colorName, TITLE_SIZE_MIN, TITLE_SIZE_MAX, titleBlock, containers, getText, blockText, addMark, cutMark, covered, anyMark,
  sliceMarks, spliceText, remapMarks, hiddenTitle, normalizeMarks, sentencesOf, findAll, toDoc, toText, toHtml, stats as computeStats, documentWords, setText, wordsIn,
} from './model.mjs';
import { basicColourNames } from '../../src/knowledge/values.mjs';   // the one colour reader (k.values)
import { resolve, rangesOf, blocksOf, blockById, sectionBlocks, ORD } from './target.mjs';
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)

const MAX_HISTORY = 50;

export function initialState() {
  return {
    title: DEFAULT_TITLE, titleMarks: [], titleAlign: 'left', titleSize: 0, blocks: [], cursor: -1, selection: null, focus: null,
    doc: toDoc({ title: DEFAULT_TITLE, titleMarks: [], titleAlign: 'left', titleSize: 0, blocks: [] }), stats: computeStats({ title: DEFAULT_TITLE, blocks: [] }),
    inputMode: null, history: [], future: [], nextId: 1, dictBlock: null,
  };
}

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const plural = (n, word) => (n === 1 ? word : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`);
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${String(w).replace(/_/g, ' ')}`;
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const show = (ctx) => ctx.request('ui.openTab', { tab: 'editor' });
const sentencesCount = (t) => sentencesOf(t).length;

// ---- state hygiene ---------------------------------------------------------------------------------
function sync(s) {
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
/** The derived parts (TipTap JSON, statistics) and the clamped selection of a state: what the matrix's `toState` calls (fns.mjs). */
export const finish = sync;
/** Chat abbreviations of block kinds ("read para 1"). */
const KIND_ALIAS = { para: 'paragraph', paras: 'paragraph', graf: 'paragraph', hed: 'heading', head: 'heading', bullet: 'list' };
const W = (fn) => (ctx, args) => {
  args = args ?? {};
  if (args.kind && Object.hasOwn(KIND_ALIAS, args.kind)) args = { ...args, kind: KIND_ALIAS[args.kind] };
  const s = ctx.state;
  if (args.pos && args.ref) { const at = insertIndex(s, args); if (at.error) return no('missing', at.error); s._ins = at.index; }
  let r;
  try { r = fn(ctx, args); } finally { delete s._ins; }
  sync(s); return r;
};
/** Where a new block goes for "under / after / before <reference>": { index } or { error }. The title is above every block. */
function insertIndex(s, { pos, ref }) {
  const phrase = String(ref).trim().replace(/\s+(?:pls|plz|please|thanks|thx|now)$/i, '');
  const res = resolve(s, phrase);
  if (!res.ok) return { error: res.error };
  if (res.kind !== 'blocks' || !res.blocks.length) return { error: 'I can only put something before or after a whole block, such as a heading or a paragraph.' };
  if (res.blocks.some((b) => b.isTitle)) return { index: s.blocks[0] && hiddenTitle(s, s.blocks[0]) ? 1 : 0 };   // the title is above everything, also above the heading that is the title
  const first = res.blocks[0];
  const i = s.blocks.indexOf(first);
  if (/^(?:before|above)$/.test(pos)) return { index: i };
  if (pos === 'under' || res.section === undefined) return { index: i + 1 };
  return { index: i + sectionBlocks(s, first).length };   // "after chapter 2" is after everything in it
}
const POS_REF = '(?:the\\s+title|(?:the\\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\\d+(?:st|nd|rd|th))\\s+(?:paragraph|heading|chapter|section|list|quote|table)|(?:the\\s+)?(?:chapter|section|heading|paragraph|list|quote|table)\\s+\\d+|(?:the\\s+)?(?:last|first)\\s+(?:paragraph|heading|chapter|section|list|quote|table))';
const POS_TAIL = new RegExp(`\\s+(?:right\\s+)?(under|below|after|before|above|beneath|underneath)\\s+(${POS_REF})$`, 'i');
/** Politeness and position words that end a heading or paragraph text ("Plans pls", "Notes at the top"): { text, top }. */
function trimTail(text, polite = true) {
  let t = String(text).trim(), top = false, pos = null, ref = null;
  for (let again = true; again;) {
    budget.tick('ops.trimTail');
    again = false;
    const pm = pos ? null : t.match(POS_TAIL);
    if (pm) { pos = /^(?:below|beneath|underneath)$/i.test(pm[1]) ? 'under' : pm[1].toLowerCase().replace('above', 'before'); ref = pm[2]; t = t.slice(0, pm.index).trim(); again = true; }
    const at = t.match(/\s+(?:at|on|to)\s+(?:the\s+)?(?:(top|start|beginning)|bottom|end)(?:\s+of\s+(?:the\s+)?(?:page|document|doc|text|file))?$/i);
    if (at) { if (at[1]) top = true; t = t.slice(0, at.index).trim(); again = true; }
    const pol = t.match(polite ? /\s+(?:pls|plz|plss|thx|thanks|thank you|ty|please|for me|now|right now|asap)$/i : /\s+(?:pls|plz|plss|thx|ty)$/i);
    if (pol && t.length > pol[0].length) { t = t.slice(0, pol.index).trim(); again = true; }
  }
  return { text: t, top, pos, ref };
}

// ---- history ---------------------------------------------------------------------------------------
const snap = (s) => structuredClone({ title: s.title, titleMarks: s.titleMarks, titleAlign: s.titleAlign, titleSize: s.titleSize, blocks: s.blocks, cursor: s.cursor, nextId: s.nextId, selection: s.selection });
function commit(s) {
  s.history.push(snap(s));
  while (s.history.length > MAX_HISTORY) { budget.tick('ops.commit'); s.history.shift(); }
  s.future = [];
}
function restore(s, sn) {
  s.title = sn.title; s.titleMarks = sn.titleMarks ?? []; s.titleAlign = sn.titleAlign ?? 'left'; s.titleSize = sn.titleSize ?? 0;
  s.blocks = sn.blocks; s.cursor = sn.cursor; s.nextId = sn.nextId; s.selection = sn.selection ?? null; s.dictBlock = null;
}
function _undo(ctx, { n } = {}) {
  const s = ctx.state;
  if (!s.history.length) return no('missing', 'There is nothing to undo.');
  // "undo twice": n steps, as many as there are
  const steps = Math.min(Math.max(1, Math.floor(Number(n) || 1)), 20, s.history.length);
  for (let i = 0; i < steps; i++) { s.future.push(snap(s)); restore(s, s.history.pop()); }
  show(ctx);
  return ok(steps === 1 ? 'OK, I undid the last change.' : `OK, I undid the last ${steps} changes.`);
}
function _redo(ctx) {
  const s = ctx.state;
  if (!s.future.length) return no('missing', 'There is nothing to redo.');
  s.history.push(snap(s));
  restore(s, s.future.pop());
  show(ctx);
  return ok('OK, I did it again.');
}

// ---- helpers ---------------------------------------------------------------------------------------
const newId = (s) => `b${s.nextId++}`;
function addBlock(s, block, index = s._ins ?? s.blocks.length) {
  const b = { id: newId(s), ...block };
  s.blocks.splice(index, 0, b);
  s.cursor = index;
  return b;
}
const wordCount = (s) => documentWords(s);

/** Text for reading aloud. */
function spokenBlock(b) {
  if (b.kind === 'list') return `${b.style === 'task' ? 'A task list' : b.style === 'numbered' ? 'A numbered list' : 'A list'}: ${joinAnd(b.items)}.`;
  if (b.kind === 'table') return `A table with ${b.rows[0]?.length ?? 0} columns: ${joinAnd(b.rows[0] ?? [])}.` + b.rows.slice(1).map((r, i) => ` Row ${i + 1}: ${r.join(', ')}.`).join('');
  if (b.kind === 'quote') return `Quote: ${/[.!?:]$/.test(b.text) ? b.text : `${b.text}.`}`;
  if (b.kind === 'rule') return '';
  if (!b.text) return '';
  return /[.!?:]$/.test(b.text) ? b.text : `${b.text}.`;
}
function spoken(s) {
  const parts = [s.title === DEFAULT_TITLE && s.blocks.length ? '' : `${s.title}.`];
  for (const b of s.blocks) if (!hiddenTitle(s, b)) parts.push(spokenBlock(b));
  return parts.filter(Boolean).join(' ');
}

/** Resolve the {kind, ord, n} arguments of the older patterns (and phrases) through the reference resolver. */
function refFromArgs(s, { kind, ord, n, t }) {
  if (t) return resolve(s, t);
  if (kind === 'title') return resolve(s, 'the title');
  const phrase = n !== undefined ? `${kind} ${n}` : ord ? `the ${ord} ${kind}` : `the ${kind}`;
  return resolve(s, phrase);
}
const textOfRes = (res) => {
  if (res.kind === 'blocks') return res.blocks.map((b) => (b.isTitle ? b.text : spokenBlockPlain(b))).join('\n');
  return rangesOf(res).map((r) => getText(r.b, r.at).slice(r.from, r.to)).join(' ');
};
function spokenBlockPlain(b) { return b.kind === 'list' || b.kind === 'table' ? spokenBlock(b) : b.kind === 'rule' ? '' : b.text; }
const spokenOfRes = (res) => (res.kind === 'blocks' ? res.blocks.map((b) => (b.isTitle ? b.text : spokenBlock(b))).filter(Boolean).join(' ') : textOfRes(res));
const quoteText = (t) => (t.length > 40 ? `${t.slice(0, 37)}...` : t);

// ---- adding ----------------------------------------------------------------------------------------
/** Apply the position words found in a text ("... after the title"): sets s._ins, or returns a refusal. */
function placeTail(s, tt) {
  if (!tt.pos) return null;
  const at = insertIndex(s, tt);
  if (at.error) return no('missing', at.error);
  s._ins = at.index;
  return null;
}
const endsSentence = (t) => /[.!?]["”')]?$/.test(t);
const HEAD_ROLES = { chapter: { level: 1, word: 'Chapter' }, section: { level: 2, word: 'Section' }, subheading: { level: 3, word: 'Subheading' }, subsection: { level: 3, word: 'Subsection' } };
/** "chapter 3: The Forest", "Chapter 3 The Forest", "The Forest" -> { n, title } for a chapter-like heading text. */
function chapterText(text, word) {
  const m = String(text).trim().match(new RegExp(`^(?:${word}\\s+)?(\\d+)\\s*[:.\\-–—]?\\s*(.*)$`, 'i'));
  return m ? { n: Number(m[1]), title: m[2].trim() } : { n: null, title: String(text).trim() };
}
function _addHeading(ctx, { text, level, role }) {
  const s = ctx.state, tt = trimTail(text ?? ''), r = HEAD_ROLES[String(role ?? '').replace(/[\s_-]+/g, '').toLowerCase()];
  const refused = placeTail(s, tt);
  if (refused) return refused;
  let t = tt.text;
  const lvl = Math.min(3, Math.max(1, Number(level) || r?.level || 2));
  let said = null;
  if (r) {
    const { n: given, title } = chapterText(t, r.word);
    const same = s.blocks.filter((b) => b.kind === 'heading' && b.level === lvl);
    const n = given ?? (same.filter((b) => new RegExp(`^${r.word}\\s+\\d+`, 'i').test(b.text)).length + 1);
    if (r.level <= 2) { t = title ? `${r.word} ${n}: ${cap(title)}` : `${r.word} ${n}`; said = title ? `OK, I started ${r.word.toLowerCase()} ${n}, "${cap(title)}".` : `OK, I started ${r.word.toLowerCase()} ${n}.`; } else t = title ? cap(title) : r.word;
  } else if (!t) return no('unsupported', 'What should the heading say?');
  s._ins ??= tt.top ? 0 : undefined;
  commit(s);
  // the first heading of an untitled document is its title (the heading and the title never disagree)
  const first = !r && !tt.pos && !tt.top && s.title === DEFAULT_TITLE && !s.blocks.length && Number(level) === 1;   // a level 1 heading ("write a title X", "heading 1 X") that opens an untitled document is its title
  const b = addBlock(s, { kind: 'heading', level: lvl, text: cap(t), ...(first ? { asTitle: true } : {}) }); s.dictBlock = null;
  if (first) { s.title = b.text; s.titleMarks = []; }
  show(ctx);
  return ok(first ? `OK, I added the heading "${b.text}"; it is the title of the document.` : said ?? `OK, I added the heading "${cap(t)}".`);
}
function _addParagraph(ctx, { text }) {
  const s = ctx.state, tt = trimTail(text, false), t = tt.text;
  if (!t) return no('unsupported', 'What should the paragraph say?');
  const refused = placeTail(s, tt);
  if (refused) return refused;
  s._ins ??= tt.top ? 0 : undefined;
  commit(s);
  const body = endsSentence(t) ? cap(t) : `${cap(t)}.`;
  const blank = s.blocks[s.cursor];
  if (!tt.pos && !tt.top && blank?.kind === 'paragraph' && !blank.text) { blank.text = body; s.dictBlock = null; show(ctx); return ok(`OK, I wrote the paragraph (${words(t).length} words).`); }
  addBlock(s, { kind: 'paragraph', text: body }); s.dictBlock = null; show(ctx);
  return ok(`OK, I added a paragraph (${words(t).length} words).`);
}
/** "write ...", "type ...", "add the text ...", "continue with ...": free text into the document, whole. */
function _write(ctx, { text, mode } = {}) {
  const s = ctx.state, tt = trimTail(String(text ?? '').replace(/^\s*[:,-]\s*/, ''), false);
  const t = tt.text.replace(/^["“](.*)["”]$/s, '$1').trim();
  if (!t) return no('unsupported', 'What should I write?');
  const refused = placeTail(s, tt);
  if (refused) return refused;
  s._ins ??= tt.top ? 0 : undefined;
  commit(s);
  const cur = s.blocks[s.cursor];
  if (!tt.pos && !tt.top && cur?.kind === 'paragraph' && (mode === 'continue' || !cur.text)) {   // continue the last paragraph, or fill the empty one a new line made
    const punct = /^[,.;:!?]/.test(t);
    if (!cur.text) cur.text = endsSentence(t) ? cap(t) : `${cap(t)}.`;
    else { const piece = endsSentence(cur.text) && !punct ? cap(t) : t; cur.text = `${cur.text}${punct ? '' : ' '}${piece}${endsSentence(piece) || punct ? '' : '.'}`; }
    s.dictBlock = null; show(ctx);
    return ok(`OK, I ${mode === 'continue' ? 'continued the paragraph' : 'wrote it'} (${words(t).length} words).`);
  }
  addBlock(s, { kind: 'paragraph', text: endsSentence(t) ? cap(t) : `${cap(t)}.` }); s.dictBlock = null; show(ctx);
  return ok(`OK, I wrote a new paragraph (${words(t).length} words).`);
}
/** "new line", "new paragraph": an empty paragraph, ready for the next "write ..." or dictated text. */
function _newBlank(ctx, { kind } = {}) {
  const s = ctx.state;
  commit(s);
  addBlock(s, { kind: 'paragraph', text: '' }); s.dictBlock = null; show(ctx);
  return ok(kind === 'line' ? 'OK, new line. What goes on it?' : 'OK, new paragraph. What goes in it?');
}
/** One list item ("add a bullet: milk"): goes on the list being written, or starts one. */
function _addItem(ctx, { text, style } = {}) {
  const s = ctx.state, tt = trimTail(String(text ?? '').replace(/^\s*[:,-]\s*/, ''), false), t = tt.text;
  if (!t) return no('unsupported', 'What should the item say?');
  const asList = t.match(/^list\s+(?:of\s+|with\s+|containing\s+|including\s+)?(.+)$/i);   // "a bullet list of cats and dogs" is a list, not one item
  if (asList) return _addList(ctx, { text: asList[1], style });
  const refused = placeTail(s, tt);
  if (refused) return refused;
  const st = STYLE_OF[String(style ?? 'bullet').toLowerCase()] ?? 'bullet';
  commit(s);
  const cur = s.blocks[s.cursor];
  if (!tt.pos && cur?.kind === 'list' && (cur.style ?? 'bullet') === st) {
    cur.items.push(t); if (st === 'task') cur.checked = [...(cur.checked ?? []), false];
    show(ctx); return ok(`OK, I added "${t}" to the list (${cur.items.length} items).`);
  }
  addBlock(s, { kind: 'list', style: st, items: [t], ...(st === 'task' ? { checked: [false] } : {}) }); show(ctx);
  return ok(`OK, I started a ${st === 'task' ? 'task list' : st === 'numbered' ? 'numbered list' : 'list'} with "${t}".`);
}
function _pageBreak(ctx) {
  const s = ctx.state;
  commit(s); addBlock(s, { kind: 'rule', page: true }); s.dictBlock = null; show(ctx);
  return ok('OK, I added a page break.');
}
const splitItems = (text) => String(text).split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
const STYLE_OF = { bullet: 'bullet', bulleted: 'bullet', numbered: 'numbered', ordered: 'numbered', number: 'numbered', task: 'task', checklist: 'task', todo: 'task', 'to-do': 'task', checkbox: 'task' };
function _addList(ctx, { text, style, empty }) {
  const s = ctx.state;
  const tt = trimTail(text ?? '', false), items = splitItems(tt.text);
  if (!items.length && String(empty) !== 'true') return no('unsupported', 'What should be on the list?');
  const refused = placeTail(s, tt);
  if (refused) return refused;
  const st = STYLE_OF[String(style ?? 'bullet').toLowerCase()] ?? 'bullet';
  commit(s); addBlock(s, { kind: 'list', style: st, items, ...(st === 'task' ? { checked: items.map(() => false) } : {}) }); show(ctx);
  const noun = st === 'task' ? 'task list' : st === 'numbered' ? 'numbered list' : 'list';
  if (!items.length) return ok(`OK, I added an empty ${noun}. You can change its style or tell me what goes on it.`);
  return ok(`OK, I added a ${noun} with ${items.length} ${plural(items.length, 'item')}: ${joinAnd(items)}.`);
}
function _addQuote(ctx, { text }) {
  const s = ctx.state, t = String(text).trim();
  if (!t) return no('unsupported', 'What should the quote say?');
  commit(s); addBlock(s, { kind: 'quote', text: /[.!?]$/.test(t) ? cap(t) : `${cap(t)}.` }); show(ctx);
  return ok('OK, I added a quote.');
}
function _addRule(ctx) {
  const s = ctx.state;
  commit(s); addBlock(s, { kind: 'rule' }); show(ctx);
  return ok('OK, I inserted a horizontal line.');
}

// ---- tables ------------------------------------------------------------------------------------------
function parseTableSpec(spec) {
  let t = String(spec ?? '').trim();
  const num = (re) => { const m = t.match(re); if (m) t = t.replace(m[0], ' '); return m ? Number(m[1]) : null; };
  const cols = num(/(\d+)\s*(?:columns?|cols?)\b/i);
  const rows = num(/(\d+)\s*rows?\b/i);
  t = t.replace(/^[\s,:]*(?:and\s+)?/i, '').replace(/^(?:with|of|containing|that has|having)\s+/i, '').replace(/^(?:the\s+)?(?:columns?|headers?|headings?|column names|called|named|titled|for)\s*[:,]?\s*/i, '').replace(/^[\s,:]+/, '');
  let names = splitItems(t);
  // "table animal legs food": a single run of words without commas is a list of column names written without separators
  if (names.length === 1 && !/[,;]/.test(t) && !/\band\b/i.test(t)) {
    const ws = names[0].split(/\s+/).filter(Boolean);
    if (ws.length >= 2 && ws.length <= 8 && (cols === null || cols === ws.length)) names = ws;
  }
  return { cols, rows, names };
}
function _addTable(ctx, { spec } = {}) {
  const s = ctx.state;
  const { cols, rows, names } = parseTableSpec(spec);
  const n = names.length || cols || 3;
  if (n < 1 || n > 8) return no('unsupported', 'A table can have between 1 and 8 columns.');
  if (names.length && cols && cols !== names.length) return no('unsupported', `You asked for ${cols} columns but gave ${names.length} names (${joinAnd(names)}).`);
  const head = names.length ? names.map(cap) : Array.from({ length: n }, (_, i) => `Column ${i + 1}`);
  const bodyRows = rows ?? (names.length ? 0 : 2);
  if (bodyRows > 30) return no('unsupported', 'A table can have at most 30 rows.');
  commit(s);
  addBlock(s, { kind: 'table', header: true, rows: [head, ...Array.from({ length: bodyRows }, () => head.map(() => ''))] });
  show(ctx);
  return ok(`OK, I added a table with ${n} columns: ${joinAnd(head)}.${names.length && !bodyRows ? ' Say, for example, "add a row" followed by the values.' : ''}`);
}
function tableOf(s) {
  const sel = s.selection?.type === 'blocks' ? s.selection.blocks.map((id) => blockById(s, id)) : s.selection?.type === 'range' ? [blockById(s, s.selection.block)] : [];
  const cur = [...sel, s.blocks[s.cursor]].find((b) => b?.kind === 'table');
  return cur ?? [...s.blocks].reverse().find((b) => b.kind === 'table') ?? null;
}
const noTable = () => no('missing', 'There is no table in the document yet. Say, for example, "add a table with 3 columns: animal, legs, food".');
function _addRow(ctx, { t } = {}) {
  const s = ctx.state, tb = tableOf(s);
  if (!tb) return noTable();
  const cols = tb.rows[0].length;
  const vals = t ? splitItems(t) : [];
  if (vals.length > cols) return no('unsupported', `The table has ${cols} columns, but you gave ${vals.length} values.`);
  commit(s);
  tb.rows.push(Array.from({ length: cols }, (_, i) => vals[i] ?? ''));
  s.cursor = s.blocks.indexOf(tb);
  show(ctx);
  return ok(vals.length ? `OK, I added a row: ${joinAnd(vals)}.` : 'OK, I added an empty row.');
}
function _addColumn(ctx, { t } = {}) {
  const s = ctx.state, tb = tableOf(s);
  if (!tb) return noTable();
  if (tb.rows[0].length >= 8) return no('unsupported', 'A table can have at most 8 columns.');
  const name = cap(String(t ?? '').trim()) || `Column ${tb.rows[0].length + 1}`;
  commit(s);
  tb.rows.forEach((r, i) => r.push(i === 0 ? name : ''));
  s.cursor = s.blocks.indexOf(tb);
  show(ctx);
  return ok(`OK, I added the column "${name}".`);
}
function headerIndex(tb, name) {
  const n = String(name).trim().toLowerCase();
  return tb.rows[0].findIndex((h) => h.toLowerCase() === n || h.toLowerCase() === `${n}s` || `${h.toLowerCase()}s` === n);
}
function removeRow(tb, ri) {
  tb.rows.splice(ri, 1);
  remapMarks(tb, (at) => { const [r, c] = at.split(':').map(Number); return r === ri ? null : `${r > ri ? r - 1 : r}:${c}`; });
}
function removeColumn(tb, ci) {
  tb.rows.forEach((r) => r.splice(ci, 1));
  remapMarks(tb, (at) => { const [r, c] = at.split(':').map(Number); return c === ci ? null : `${r}:${c > ci ? c - 1 : c}`; });
}
function _deleteRow(ctx, { name, ord, n } = {}) {
  const s = ctx.state, tb = tableOf(s);
  if (!tb) return noTable();
  const body = tb.rows.length - 1;
  if (!body) return no('missing', 'The table has no rows below the header.');
  let ri;
  if (name) {
    ri = tb.rows.findIndex((r, i) => i > 0 && r.some((c) => c.toLowerCase() === String(name).trim().toLowerCase()));
    if (ri < 0) return no('missing', `I could not find a row with "${String(name).trim()}".`);
  } else {
    let pos = n !== undefined ? Number(n) : ORD[ord] ?? 1;
    if (pos === -1) pos = body;
    if (!Number.isInteger(pos) || pos < 1 || pos > body) return no('missing', body === 1 ? 'There is only one row.' : `There are only ${body} rows.`);
    ri = pos;
  }
  commit(s); removeRow(tb, ri); s.cursor = s.blocks.indexOf(tb); show(ctx);
  return ok(`OK, I deleted row ${ri}.`);
}
function _deleteColumn(ctx, { name, ord, n } = {}) {
  const s = ctx.state, tb = tableOf(s);
  if (!tb) return noTable();
  const cols = tb.rows[0].length;
  let ci;
  if (name) {
    ci = headerIndex(tb, name);
    if (ci < 0) return no('missing', `There is no column called "${String(name).trim()}". The columns are ${joinAnd(tb.rows[0])}.`);
  } else {
    let pos = n !== undefined ? Number(n) : ORD[ord] ?? 1;
    if (pos === -1) pos = cols;
    if (!Number.isInteger(pos) || pos < 1 || pos > cols) return no('missing', cols === 1 ? 'There is only one column.' : `There are only ${cols} columns.`);
    ci = pos - 1;
  }
  if (cols === 1) return no('unsupported', 'A table needs at least one column. Delete the table instead.');
  commit(s);
  const label = tb.rows[0][ci];
  removeColumn(tb, ci); s.cursor = s.blocks.indexOf(tb); show(ctx);
  return ok(`OK, I deleted the column "${label}".`);
}
function _setCell(ctx, { r, c, t } = {}) {
  const s = ctx.state, tb = tableOf(s);
  if (!tb) return noTable();
  const ri = Number(r), ci = Number(c);
  if (!Number.isInteger(ri) || ri < 1 || ri >= tb.rows.length) return no('missing', `The table has ${tb.rows.length - 1} ${plural(tb.rows.length - 1, 'row')} below the header.`);
  if (!Number.isInteger(ci) || ci < 1 || ci > tb.rows[0].length) return no('missing', `The table has ${tb.rows[0].length} columns.`);
  commit(s);
  tb.rows[ri][ci - 1] = String(t).trim();
  normalizeMarks(tb);
  s.cursor = s.blocks.indexOf(tb); show(ctx);
  return ok(`OK, row ${ri} column ${ci} now says "${String(t).trim()}".`);
}

// Animals: columns of a table map onto the keys of kids.animals.
const HEADER_KEYS = {
  animal: 'name', name: 'name', legs: 'legs', leg: 'legs', food: 'food', eats: 'food', diet: 'diet', habitat: 'habitat', home: 'habitat', lives: 'habitat',
  class: 'class', type: 'class', kind: 'class', sound: 'sound', noise: 'sound', covering: 'covering', cover: 'covering', baby: 'baby', young: 'baby',
};
const HABITATS = { sea: 'sea', ocean: 'sea', farm: 'farm', forest: 'forest', wood: 'forest', river: 'river', jungle: 'jungle', desert: 'desert', polar: 'polar', arctic: 'polar', home: 'home', pet: 'home', garden: 'garden', savanna: 'savanna', grassland: 'grassland', mountain: 'mountain' };
const CLASSES = { mammal: 'mammal', bird: 'bird', fish: 'fish', insect: 'insect', bug: 'insect', reptile: 'reptile', amphibian: 'amphibian', arachnid: 'arachnid' };
const TYPE = 'kids.animals.animal';
function animalFilter(topic) {
  const ws = (String(topic).toLowerCase().match(/[a-z]+/g) ?? []).map((x) => (x.endsWith('ies') ? `${x.slice(0, -3)}y` : x.replace(/s$/, '')));
  const where = {};
  for (const w of ws) {
    if (HABITATS[w]) where.habitat = HABITATS[w];
    else if (CLASSES[w]) where.class = CLASSES[w];
    else if (w === 'flying' || w === 'flier') where.can_fly = 'true';
    else if (w === 'swimming' || w === 'swimmer') where.can_swim = 'true';
  }
  return where;
}
const DEFAULT_TABLE = ['Animal', 'Legs', 'Food'];
function _fillTable(ctx, { topic } = {}) {
  const s = ctx.state;
  const where = animalFilter(topic);
  if (!Object.keys(where).length) return no('missing', `I do not know a group of animals called "${String(topic).trim()}". Try sea animals, farm animals, birds or insects.`);
  const found = ctx.ask({ type: TYPE, seek: 'matching', where, mode: 'list' });
  if (found.status !== 'supported' || !found.values?.length) return no('missing', `I do not know any ${String(topic).trim()} in my knowledge base yet.`);
  let tb = tableOf(s);
  const created = !tb;
  commit(s);
  if (!tb) tb = addBlock(s, { kind: 'table', header: true, rows: [[...DEFAULT_TABLE]] });
  const keys = tb.rows[0].map((h) => HEADER_KEYS[h.trim().toLowerCase()] ?? null);
  if (!keys.some(Boolean)) { s.history.pop(); return no('missing', `I do not know how to fill the columns ${joinAnd(tb.rows[0])} with animals. I know animal, legs, food, diet, habitat, class, sound, covering and baby.`); }
  const nameCol = keys.indexOf('name');
  const body = tb.rows.slice(1).filter((r) => r.some((c) => c.trim()));
  const have = new Set(nameCol >= 0 ? body.map((r) => r[nameCol].toLowerCase()) : []);
  const from = new Set(found.from ?? []);
  let added = 0;
  for (const name of found.values.slice(0, 12)) {
    const label = String(name).replace(/_/g, ' ');
    if (have.has(label.toLowerCase())) continue;
    const row = keys.map((k) => {
      if (!k) return '';
      if (k === 'name') return cap(label);
      const r = ctx.ask({ type: TYPE, seek: k, where: { name }, mode: 'list' });
      for (const w of r.from ?? []) from.add(w);
      const vals = r.values ?? (r.value !== undefined ? [r.value] : []);
      return r.status === 'supported' ? vals.map((v) => String(v).replace(/_/g, ' ')).join(', ') : '';
    });
    body.push(row); added++;
  }
  tb.rows = [tb.rows[0], ...body];
  tb.from = [...new Set([...(tb.from ?? []), ...from])];
  normalizeMarks(tb);
  s.cursor = s.blocks.indexOf(tb);
  show(ctx);
  const unknown = tb.rows[0].filter((h, i) => !keys[i]);
  return ok(`OK, I filled the table with ${added} ${String(topic).trim()}${created ? ' (I made a new table with the columns animal, legs and food)' : ''}.${unknown.length ? ` I could not fill ${joinAnd(unknown)}.` : ''}`, { from: [...from] });
}

// ---- tasks ------------------------------------------------------------------------------------------------
function _addTask(ctx, { t } = {}) {
  const s = ctx.state, text = cap(String(t ?? '').trim());
  if (!text) return no('unsupported', 'What should the task say?');
  commit(s);
  let tl = [s.blocks[s.cursor], ...[...s.blocks].reverse()].find((b) => b?.kind === 'list' && b.style === 'task');
  if (!tl) tl = addBlock(s, { kind: 'list', style: 'task', items: [], checked: [] });
  tl.items.push(text); tl.checked.push(false);
  s.cursor = s.blocks.indexOf(tl);
  show(ctx);
  return ok(`OK, I added the task "${text}".`);
}
function _checkTask(ctx, { ord, n, t, state, all } = {}) {
  const s = ctx.state;
  const want = state === 'uncheck' ? false : true;
  const phrase = all ? 'all tasks' : t ? `task ${t}` : n !== undefined ? `task ${n}` : `the ${ord} task`;
  const res = resolve(s, phrase);
  if (!res.ok) return no('missing', res.error);
  const items = res.items;
  const changing = items.filter(({ b, i }) => !!b.checked[i] !== want);
  if (!changing.length) return ok(all ? `All tasks are already ${want ? 'done' : 'open'}.` : `${cap(res.desc)} is already ${want ? 'checked' : 'unchecked'}.`);
  commit(s);
  for (const { b, i } of changing) b.checked[i] = want;
  s.cursor = s.blocks.indexOf(changing[0].b);
  show(ctx);
  return ok(all ? `OK, I ${want ? 'checked' : 'unchecked'} ${changing.length} ${plural(changing.length, 'task')}.` : `OK, I ${want ? 'checked' : 'unchecked'} ${res.desc}: ${changing[0].b.items[changing[0].i]}.`);
}
function taskList(s) {
  const out = [];
  for (const b of s.blocks) if (b.kind === 'list' && b.style === 'task') b.items.forEach((text, i) => out.push({ text, done: !!b.checked[i] }));
  return out;
}
function _countTasks(ctx, { state } = {}) {
  const ts = taskList(ctx.state);
  if (!ts.length) return no('missing', 'There are no tasks in the document.');
  const done = ts.filter((x) => x.done).length, left = ts.length - done;
  if (state === 'left') return ok(`${left} of ${ts.length} ${plural(ts.length, 'task')} ${left === 1 ? 'is' : 'are'} still open.`);
  return ok(`${done} of ${ts.length} ${plural(ts.length, 'task')} ${done === 1 ? 'is' : 'are'} done.`);
}
function _listTasks(ctx, { state } = {}) {
  const ts = taskList(ctx.state);
  if (!ts.length) return no('missing', 'There are no tasks in the document.');
  const want = state === 'done';
  const hits = ts.filter((x) => x.done === want);
  if (!hits.length) return ok(want ? 'No task is done yet.' : 'Every task is done.');
  return ok(`${want ? 'Done' : 'Still open'}: ${joinAnd(hits.map((x) => x.text))}.`);
}

// ---- formatting by reference ----------------------------------------------------------------------------------
const MARK_ALIAS = {
  bold: 'bold', bolder: 'bold', italic: 'italic', italics: 'italic', italicize: 'italic', italicise: 'italic', emphasize: 'italic', emphasise: 'italic',
  underline: 'underline', underlined: 'underline', underlining: 'underline', strike: 'strike', strikethrough: 'strike', strikethrough_: 'strike', struck: 'strike', struck_through: 'strike', crossed_out: 'strike', strike_through: 'strike',
  code: 'code', monospace: 'code', monospaced: 'code', highlight: 'highlight', highlighted: 'highlight', link: 'link',
  unbold: 'bold', unitalicize: 'italic', unitalicise: 'italic', ununderline: 'underline', unhighlight: 'highlight', unstrike: 'strike',
};
const MARK_WORD = { bold: 'bold', italic: 'italic', underline: 'underlined', strike: 'struck through', code: 'code', highlight: 'highlighted', link: 'a link' };
const markOf = (w) => MARK_ALIAS[String(w ?? '').toLowerCase().replace(/[\s-]+/g, '_')] ?? null;
const FORMAT_HINT = 'I can make text bold, italic, underlined, struck through, code or highlighted.';

function selectedFirst(s, ranges) {
  const b = ranges[0]?.b;
  if (b && !b.isTitle) { const i = s.blocks.findIndex((x) => x.id === b.id); if (i >= 0) s.cursor = i; }
}
function _format(ctx, { t, mark, color, off } = {}) {
  const s = ctx.state;
  const type = markOf(mark);
  if (type === 'link' && off) return _link(ctx, { t, off: true });
  if (!type || type === 'link') return no('unsupported', FORMAT_HINT);
  const res = resolve(s, t ?? 'it');
  if (!res.ok) return no('missing', res.error);
  let hex = null, cname = null;
  if (type === 'highlight' && !off) {
    cname = colorName(color ?? 'yellow');
    if (!cname) return no('unsupported', `I do not know the color "${color}". I can highlight in ${joinAnd(basicColourNames())} and many more colours.`);
    hex = highlightHex(cname);
  }
  const ranges = rangesOf(res).filter((r) => r.to > r.from);
  if (!ranges.length) return no('missing', 'There is no text there to format.');
  const all = ranges.every((r) => (hex ? covered(r.b, r.at, r.from, r.to, 'highlight') && (r.b.marks ?? []).some((m) => m.at === r.at && m.type === 'highlight' && m.attrs?.color === hex && m.from <= r.from && m.to >= r.to) : covered(r.b, r.at, r.from, r.to, type)));
  if (!off && all) return ok(`${cap(res.desc)} is already ${MARK_WORD[type]}${cname ? ` in ${cname}` : ''}.`);
  if (off && !ranges.some((r) => anyMark(r.b, r.at, r.from, r.to, type))) return ok(`There is no ${type === 'highlight' ? 'highlight' : MARK_WORD[type]} on ${res.desc}.`);
  commit(s);
  for (const r of ranges) {
    if (off) cutMark(r.b, r.at, r.from, r.to, type);
    else addMark(r.b, r.at, r.from, r.to, type, hex ? { color: hex, name: cname } : undefined);
  }
  selectedFirst(s, ranges);
  show(ctx);
  const where = res.kind === 'ranges' && ranges.length > 1 ? ` (${ranges.length} places)` : '';
  if (off) return ok(`OK, I removed the ${type === 'highlight' ? 'highlight' : MARK_WORD[type]} from ${res.desc}${where}.`);
  return ok(`OK, ${res.desc} ${res.desc.startsWith('the word') || res.desc.startsWith('the text') ? 'is' : 'is'} now ${MARK_WORD[type]}${cname ? ` in ${cname}` : ''}${where}.`);
}
function _clearFormat(ctx, { t } = {}) {
  const s = ctx.state;
  const res = resolve(s, t ?? 'it');
  if (!res.ok) return no('missing', res.error);
  const ranges = rangesOf(res);
  const blocks = blocksOf(res);
  if (!ranges.some((r) => anyMark(r.b, r.at, r.from, r.to, null))) return ok(`There is no formatting on ${res.desc}.`);
  commit(s);
  for (const r of ranges) cutMark(r.b, r.at, r.from, r.to, null);
  void blocks;
  show(ctx);
  return ok(`OK, I cleared the formatting of ${res.desc}.`);
}
export const normalizeUrl = (u) => {
  let x = String(u ?? '').trim().replace(/\s+dot\s+/gi, '.').replace(/\s+slash\s+/gi, '/').replace(/\s+/g, '');
  if (!x) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(x)) return x;
  if (/@/.test(x) && !/\//.test(x)) return `mailto:${x}`;
  return `https://${x}`;
};
function _link(ctx, { t, url, off } = {}) {
  const s = ctx.state;
  const res = resolve(s, t ?? 'it');
  if (!res.ok) return no('missing', res.error);
  const ranges = rangesOf(res).filter((r) => r.to > r.from);
  if (!ranges.length) return no('missing', 'There is no text there to link.');
  if (off) {
    if (!ranges.some((r) => anyMark(r.b, r.at, r.from, r.to, 'link'))) return ok(`There is no link on ${res.desc}.`);
    commit(s);
    for (const r of ranges) cutMark(r.b, r.at, r.from, r.to, 'link');
    show(ctx);
    return ok(`OK, I removed the link from ${res.desc}.`);
  }
  const href = normalizeUrl(url);
  if (!href || !/^(https?:\/\/[^\s/]+\.[^\s/]+|https?:\/\/localhost|mailto:[^\s@]+@[^\s@]+)/i.test(href)) return no('unsupported', `"${String(url ?? '').trim()}" does not look like a web address. Try "add a link to example dot com".`);
  commit(s);
  for (const r of ranges) addMark(r.b, r.at, r.from, r.to, 'link', { href });
  selectedFirst(s, ranges);
  show(ctx);
  return ok(`OK, ${res.desc} now links to ${href.replace(/^https?:\/\//, '')}.`);
}
const SIZE_STEPS = { bigger: 1, larger: 1, big: 1, enlarge: 1, increase: 1, huge: 3, giant: 3, enormous: 3, smaller: -1, small: -1, shrink: -1, decrease: -1, reduce: -1, tiny: -3, little: -1 };
function _size(ctx, { t, how } = {}) {
  const s = ctx.state;
  const step = SIZE_STEPS[String(how ?? 'bigger').toLowerCase()];
  if (!step) return no('unsupported', 'I can make a title or a heading bigger or smaller.');
  const res = resolve(s, t ?? 'it');
  if (!res.ok) return no('missing', res.error);
  const bs = blocksOf(res);
  const targets = bs.filter((b) => b.isTitle || b.kind === 'heading');
  if (!targets.length) return no('unsupported', `${cap(res.desc)} has one size. Say "turn it into a heading" to make it bigger.`);
  const before = snap(s);
  let changed = 0;
  for (const b of targets) {
    if (b.isTitle) { const v = Math.max(TITLE_SIZE_MIN, Math.min(TITLE_SIZE_MAX, (s.titleSize ?? 0) + step)); if (v !== s.titleSize) { s.titleSize = v; changed++; } }
    else { const v = Math.max(1, Math.min(3, (b.level ?? 2) - step)); if (v !== b.level) { b.level = v; changed++; } }
  }
  if (!changed) return ok(`${cap(res.desc)} is already as ${step > 0 ? 'big' : 'small'} as it gets.`);
  s.history.push(before); while (s.history.length > MAX_HISTORY) { budget.tick('ops._size'); s.history.shift(); } s.future = [];
  show(ctx);
  return ok(`OK, I made ${res.desc} ${step > 0 ? 'bigger' : 'smaller'}.`);
}
const ALIGN_ALIAS = { left: 'left', center: 'center', centre: 'center', centered: 'center', centred: 'center', middle: 'center', right: 'right', justify: 'justify', justified: 'justify' };
function _align(ctx, { t, how } = {}) {
  const s = ctx.state;
  const a = ALIGN_ALIAS[String(how ?? '').toLowerCase()];
  if (!a) return no('unsupported', 'I can align text to the left, to the center, to the right or justified.');
  const res = resolve(s, t ?? 'it');
  if (!res.ok) return no('missing', res.error);
  const bs = blocksOf(res).filter((b) => b.kind !== 'rule');
  if (!bs.length) return no('unsupported', 'There is no text there to align.');
  if (bs.every((b) => (b.align ?? 'left') === a)) return ok(`${cap(res.desc)} is already aligned ${a === 'center' ? 'to the center' : a === 'justify' ? 'justified' : `to the ${a}`}.`);
  commit(s);
  for (const b of bs) { if (a === 'left') { if (b.isTitle) b.align = 'left'; else delete b.align; } else b.align = a; }
  show(ctx);
  return ok(`OK, I ${a === 'center' ? 'centered' : a === 'justify' ? 'justified' : `aligned to the ${a}`} ${res.desc}.`.replace('aligned to the left', 'aligned to the left'));
}

// ---- conversion ----------------------------------------------------------------------------------------------
const TO_KIND = { paragraph: 'paragraph', text: 'paragraph', normal_text: 'paragraph', heading: 'heading', header: 'heading', title: 'heading', quote: 'quote', block_quote: 'quote', blockquote: 'quote', list: 'bullet', bullet_list: 'bullet', bulleted_list: 'bullet', bullets: 'bullet', numbered_list: 'numbered', ordered_list: 'numbered', number_list: 'numbered', task_list: 'task', checklist: 'task', todo_list: 'task', 'to-do_list': 'task', checkbox_list: 'task', numbered: 'numbered', bulleted: 'bullet', bullet: 'bullet', ordered: 'numbered', task: 'task' };
function _convert(ctx, { t, to, n } = {}) {
  const s = ctx.state;
  const target = TO_KIND[String(to ?? '').toLowerCase().replace(/[\s-]+/g, '_')] ?? TO_KIND[String(to ?? '').toLowerCase()];
  if (!target) return no('unsupported', 'I can turn blocks into paragraphs, headings, quotes, bullet lists, numbered lists or task lists.');
  const res = resolve(s, t ?? 'it');
  if (!res.ok) return no('missing', res.error);
  const bs = blocksOf(res);
  if (bs.some((b) => b.isTitle)) return no('unsupported', 'The title stays the title. You can make it bigger, center it or format it; to get a heading, add one.');
  const level = Math.min(3, Math.max(1, Number(n) || 0)) || undefined;
  const conv = [];
  for (const b of bs) {
    if (b.kind === 'table') return no('unsupported', 'I cannot turn a table into something else. Delete it and add what you need.');
    if (b.kind === 'rule') return no('unsupported', 'A horizontal line has no text to convert.');
    const cur = b.kind === 'list' ? (b.style ?? 'bullet') : b.kind;
    if (cur === target && (target !== 'heading' || !level || level === b.level)) { if (bs.length === 1) return ok(`${cap(res.desc)} already is ${target === 'bullet' ? 'a bullet list' : target === 'numbered' ? 'a numbered list' : target === 'task' ? 'a task list' : an(target)}.`); continue; }
    conv.push(b);
  }
  if (!conv.length) return ok('Nothing to change.');
  commit(s);
  for (const b of conv) {
    const idx = s.blocks.indexOf(b);
    const keep = { id: b.id, ...(b.from ? { from: b.from } : {}), ...(b.align ? { align: b.align } : {}) };
    if (b.kind === 'list') {
      if (target === 'bullet' || target === 'numbered' || target === 'task') {
        b.style = target;
        if (target === 'task') b.checked = b.items.map(() => false); else delete b.checked;
        continue;
      }
      // list -> one block per item
      const out = b.items.map((text, i) => ({ ...(i === 0 ? keep : { id: newId(s), ...(b.align ? { align: b.align } : {}) }), kind: target, ...(target === 'heading' ? { level: level ?? 2 } : {}), text, ...(sliceMarks(b, String(i), 0, text.length).length ? { marks: sliceMarks(b, String(i), 0, text.length) } : {}) }));
      s.blocks.splice(idx, 1, ...out);
      s.cursor = idx;
      continue;
    }
    // text block
    if (target === 'bullet' || target === 'numbered' || target === 'task') {
      const rs = sentencesRangesOf(b.text);
      const items = rs.map(([a, c]) => b.text.slice(a, c));
      const marks = rs.flatMap(([a, c], i) => sliceMarks(b, '0', a, c, String(i)));
      const nb = { ...keep, kind: 'list', style: target, items: items.length ? items : [b.text], ...(target === 'task' ? { checked: (items.length ? items : [b.text]).map(() => false) } : {}), ...(marks.length ? { marks } : {}) };
      s.blocks.splice(idx, 1, nb);
    } else {
      const nb = { ...keep, kind: target, ...(target === 'heading' ? { level: level ?? b.level ?? 2 } : {}), text: b.text, ...(b.marks ? { marks: b.marks } : {}) };
      s.blocks.splice(idx, 1, nb);
    }
    s.cursor = idx;
  }
  show(ctx);
  const word = target === 'bullet' ? 'a bullet list' : target === 'numbered' ? 'a numbered list' : target === 'task' ? 'a task list' : an(target);
  return ok(`OK, I turned ${res.desc} into ${word}.`);
}
function sentencesRangesOf(text) {
  const out = [];
  for (const m of String(text).matchAll(/[^.!?]*[.!?]+|[^.!?]+$/g)) {
    let a = m.index, c = m.index + m[0].length;
    while (a < c && /\s/.test(text[a])) { budget.tick('ops.sentencesRangesOf'); a++; }
    while (c > a && /\s/.test(text[c - 1])) { budget.tick('ops.sentencesRangesOf2'); c--; }
    if (c > a) out.push([a, c]);
  }
  return out;
}

// ---- selection and navigation --------------------------------------------------------------------------------------
function describeSelection(s) {
  const sel = s.selection;
  if (!sel) return null;
  if (sel.type === 'blocks') return `${sel.blocks.length} block${sel.blocks.length === 1 ? '' : 's'}`;
  const b = blockById(s, sel.block);
  return `"${quoteText(getText(b, sel.at).slice(sel.from, sel.to))}"`;
}
function _select(ctx, { t } = {}) {
  const s = ctx.state;
  const res = resolve(s, t ?? 'it', { first: true });
  if (!res.ok) return no('missing', res.error);
  if (res.kind === 'blocks') s.selection = { type: 'blocks', blocks: res.blocks.map((b) => b.id) };
  else if (res.kind === 'items') s.selection = { type: 'range', block: res.items[0].b.id, at: String(res.items[0].i), from: 0, to: res.items[0].b.items[res.items[0].i].length, item: true };
  else { const r = res.ranges[0]; s.selection = { type: 'range', block: r.b.id, at: r.at, from: r.from, to: r.to }; }
  const first = res.kind === 'blocks' ? res.blocks[0] : res.kind === 'items' ? res.items[0].b : res.ranges[0].b;
  const i = s.blocks.findIndex((b) => b.id === first.id);
  if (i >= 0) s.cursor = i;
  show(ctx);
  const of = res.found > 1 ? ` (the first of ${res.found})` : '';
  return ok(`OK, I selected ${res.desc}${of}. You can say "make it bold", "delete it" or "copy it".`);
}
function _unselect(ctx) {
  const s = ctx.state;
  if (!s.selection) return ok('Nothing was selected.');
  s.selection = null;
  return ok('OK, the selection is cleared.');
}
function _whatSelected(ctx) {
  const s = ctx.state;
  if (!s.selection) return ok('Nothing is selected.');
  const sel = s.selection;
  if (sel.type === 'blocks') { const bs = sel.blocks.map((id) => blockById(s, id)); return ok(`Selected: ${bs.map((b) => (b.isTitle ? 'the title' : `the ${b.kind === 'rule' ? 'line' : b.kind}`)).join(', ')}.`); }
  return ok(`Selected: ${describeSelection(s)}.`);
}
function _goto(ctx, { where, ord, kind, n, w, t } = {}) {
  const s = ctx.state;
  let id;
  if (where) {
    if (/^(end|bottom)$/.test(where)) id = s.blocks.at(-1)?.id ?? 'title';
    else id = 'title';
    if (id !== 'title') s.cursor = s.blocks.length - 1; else s.cursor = s.blocks.length ? 0 : -1;
    s.selection = null;
    s.focus = { id, n: (s.focus?.n ?? 0) + 1 };
    show(ctx);
    return ok(id === 'title' ? 'OK, I am at the top of the document.' : 'OK, I am at the end of the document.');
  }
  const res = t ? resolve(s, t, { first: true }) : w ? resolve(s, `the word ${w}`, { first: true }) : resolve(s, n !== undefined ? `${kind} ${n}` : ord ? `the ${ord} ${kind}` : `the ${kind}`, { first: true });
  if (!res.ok) return no('missing', res.error);
  const b = res.kind === 'blocks' ? res.blocks[0] : res.kind === 'items' ? res.items[0].b : res.ranges[0].b;
  const i = s.blocks.findIndex((x) => x.id === b.id);
  if (i >= 0) s.cursor = i;
  s.selection = null;
  s.focus = { id: b.id, n: (s.focus?.n ?? 0) + 1 };
  show(ctx);
  return ok(`OK, I went to ${res.desc}.`);
}

// ---- deleting -------------------------------------------------------------------------------------------------------
function trimGap(text, from, to) {
  if (text[to] === ' ' && (from === 0 || text[from - 1] === ' ')) to++;
  else if (/[,.;:!?]/.test(text[to] ?? '') && text[from - 1] === ' ') from--;
  else if (to >= text.length && text[from - 1] === ' ') from--;
  return [from, to];
}
function deleteRes(ctx, res) {
  const s = ctx.state;
  commit(s);
  if (res.kind === 'blocks') {
    let didTitle = false;
    for (const b of res.blocks) {
      if (b.isTitle) { s.title = DEFAULT_TITLE; s.titleMarks = []; s.titleAlign = 'left'; s.titleSize = 0; didTitle = true; continue; }
      const i = s.blocks.findIndex((x) => x.id === b.id);
      if (i >= 0) s.blocks.splice(i, 1);
      if (hiddenTitle(s, b)) { s.title = DEFAULT_TITLE; s.titleMarks = []; }
    }
    s.cursor = Math.min(s.cursor, s.blocks.length - 1);
    s.dictBlock = null; s.selection = null;
    show(ctx);
    if (res.section) return ok(`OK, I deleted ${res.desc} with everything in it.`);
    return ok(res.blocks.length === 1 ? (didTitle ? 'OK, I cleared the title.' : `OK, I deleted ${res.desc}.`) : `OK, I deleted ${res.blocks.length} blocks.`);
  }
  if (res.kind === 'items') {
    const byBlock = new Map();
    for (const { b, i } of res.items) byBlock.set(b, [...(byBlock.get(b) ?? []), i]);
    for (const [b, idx] of byBlock) {
      for (const i of [...idx].sort((a, c) => c - a)) {
        b.items.splice(i, 1); b.checked?.splice(i, 1);
        remapMarks(b, (at) => { const k = Number(at); return k === i ? null : String(k > i ? k - 1 : k); });
      }
      if (!b.items.length) s.blocks.splice(s.blocks.indexOf(b), 1);
    }
    s.cursor = Math.min(s.cursor, s.blocks.length - 1); s.selection = null;
    show(ctx);
    return ok(`OK, I deleted ${res.desc}.`);
  }
  // ranges: delete from the end so offsets stay valid
  const rs = [...res.ranges].sort((a, c) => (a.b.id === c.b.id && a.at === c.at ? c.from - a.from : 0));
  for (const r of rs) {
    const text = getText(r.b, r.at);
    const [f, t] = trimGap(text, r.from, r.to);
    spliceText(r.b, r.at, f, t, '');
  }
  for (const b of new Set(rs.map((r) => r.b))) {
    if (!b.isTitle && (b.kind === 'paragraph' || b.kind === 'heading' || b.kind === 'quote') && !b.text.trim()) { const i = s.blocks.indexOf(b); if (i >= 0) s.blocks.splice(i, 1); }
  }
  s.cursor = Math.min(s.cursor, s.blocks.length - 1); s.selection = null; s.dictBlock = null;
  show(ctx);
  return ok(`OK, I deleted ${res.desc}${rs.length > 1 ? ` (${rs.length} places)` : ''}.`);
}
function _deleteTarget(ctx, { t } = {}) {
  const res = resolve(ctx.state, t ?? 'it');
  if (!res.ok) return no('missing', res.error);
  return deleteRes(ctx, res);
}
function _delete(ctx, args) {
  const s = ctx.state;
  if (args.kind === 'row') return _deleteRow(ctx, args);
  if (args.kind === 'column') return _deleteColumn(ctx, args);
  const res = refFromArgs(s, args);
  if (!res.ok) return no('missing', res.error);
  if (res.section) res.blocks = sectionBlocks(s, res.blocks[0]);
  return deleteRes(ctx, res);
}
function _deleteSentence(ctx) {
  const s = ctx.state;
  const idx = s.blocks.map((b) => b.kind).lastIndexOf('paragraph');
  if (idx < 0) return no('missing', 'There is no paragraph to delete a sentence from.');
  commit(s);
  const b = s.blocks[idx];
  const rs = sentencesRangesOf(b.text);
  const last = rs.pop();
  if (rs.length) { const [f, t] = [rs.at(-1)[1], last[1]]; spliceText(b, '0', f, t, ''); } else { s.blocks.splice(idx, 1); s.dictBlock = null; }
  s.cursor = Math.min(idx, s.blocks.length - 1);
  show(ctx);
  return ok('OK, I deleted the last sentence.');
}
function _clear(ctx) {
  const s = ctx.state;
  if (!s.blocks.length && s.title === DEFAULT_TITLE) return ok('The document is already empty.');
  commit(s);
  s.title = DEFAULT_TITLE; s.titleMarks = []; s.titleAlign = 'left'; s.titleSize = 0; s.blocks = []; s.cursor = -1; s.dictBlock = null; s.selection = null;
  show(ctx);
  return ok('OK, I cleared the document. You can say "undo" to get it back.');
}

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function _replace(ctx, { from, to }) {
  const s = ctx.state;
  const a = String(from).trim(), b = String(to).trim();
  if (!a) return no('unsupported', 'What should I replace?');
  // a reference ("it", "the second paragraph", "the title") replaces that whole text
  if (/^(it|this|that|the selection|selection|the selected text|the title|(the )?(first|second|third|fourth|fifth|last) (paragraph|heading|sentence|quote))$/i.test(a)) {
    const res = resolve(s, a);
    if (!res.ok) return no('missing', res.error);
    commit(s);
    if (res.kind === 'blocks') {
      const bl = res.blocks[0];
      if (bl.kind === 'list' || bl.kind === 'table' || bl.kind === 'rule') { s.history.pop(); return no('unsupported', 'I can replace the text of a paragraph, heading, quote or the title. For a list or table, delete it and add a new one.'); }
      bl.text = bl.isTitle ? cap(b) : /[.!?]$/.test(b) || bl.kind === 'heading' ? cap(b) : `${cap(b)}.`;
      if (bl.isTitle) s.titleMarks = []; else delete bl.marks;
    } else { const r = rangesOf(res)[0]; spliceText(r.b, r.at, r.from, r.to, b); s.selection = null; }
    show(ctx);
    return ok(`OK, I replaced ${res.desc} with "${b}".`);
  }
  const re = new RegExp(`\\b${esc(a)}\\b`, 'gi');
  const before = snap(s);
  let n = 0;
  for (const t of [titleBlock(s), ...s.blocks]) {
    for (const c of containers(t)) {
      const ms = [...c.text.matchAll(re)];
      for (const m of ms.reverse()) { spliceText(t, c.at, m.index, m.index + m[0].length, b); n++; }
    }
  }
  if (!n) { restore(s, before); return no('missing', `I could not find "${a}" in the document.`); }
  s.history.push(before); while (s.history.length > MAX_HISTORY) { budget.tick('ops._replace'); s.history.shift(); } s.future = [];
  show(ctx);
  return ok(`OK, I replaced "${a}" with "${b}" ${n} ${n === 1 ? 'time' : 'times'}.`);
}

function _move(ctx, { where, ...ref }) {
  const s = ctx.state;
  const res = refFromArgs(s, ref);
  if (!res.ok) return no('missing', res.error);
  if (res.kind !== 'blocks' || res.blocks[0].isTitle) return no('unsupported', 'I can only move whole blocks: paragraphs, headings, lists, quotes and tables.');
  const idx = s.blocks.indexOf(res.blocks[0]);
  const label = ref.kind ?? res.blocks[0].kind;
  const to = where === 'top' ? 0 : where === 'bottom' ? s.blocks.length - 1 : idx + (where === 'up' ? -1 : 1);
  if (to < 0 || to >= s.blocks.length) return no('missing', `The ${label} cannot go any further ${where === 'down' ? 'down' : where === 'up' ? 'up' : ''}.`.replace(' .', '.'));
  if (to === idx) return ok(`The ${label} is already ${where === 'top' ? 'at the top' : 'at the end'}.`);
  commit(s);
  const [b] = s.blocks.splice(idx, 1);
  s.blocks.splice(to, 0, b);
  s.cursor = to;
  show(ctx);
  return ok(`OK, I moved the ${label} ${where === 'top' ? 'to the top' : where === 'bottom' ? 'to the end' : where}.`);
}

function _setTitle(ctx, { text }) {
  const s = ctx.state, t = String(text).trim();
  if (!t) return no('unsupported', 'What should the title be?');
  commit(s);
  for (const b of s.blocks) if (hiddenTitle(s, b)) delete b.asTitle;   // renamed: the first heading is an ordinary heading again
  s.title = cap(t); s.titleMarks = []; show(ctx);
  return ok(`OK, the title is now "${s.title}".`);
}

function _newDoc(ctx, { text } = {}) {
  const s = ctx.state;
  commit(s);
  s.title = text ? cap(String(text).trim()) : DEFAULT_TITLE; s.titleMarks = []; s.titleAlign = 'left'; s.titleSize = 0;
  s.blocks = []; s.cursor = -1; s.dictBlock = null; s.selection = null;
  show(ctx);
  return ok(text ? `OK, a new document called "${s.title}".` : 'OK, a new empty document.');
}

// ---- reading, copying, downloading -------------------------------------------------------------------------------------
function _read(ctx, args = {}) {
  const s = ctx.state;
  if (args.kind === 'title') { ctx.effect('speech.say', { text: s.title }); return ok(`OK, reading the title: ${s.title}.`); }
  if (args.kind || args.t) {
    const res = refFromArgs(s, args);
    if (!res.ok) return no('missing', res.error);
    const text = res.section ? sectionBlocks(s, res.blocks[0]).map(spokenBlock).filter(Boolean).join(' ') : spokenOfRes(res);
    if (!text) return no('missing', 'There is nothing to read there.');
    ctx.effect('speech.say', { text });
    const what = args.t ? res.desc.replace(/^the /, '') : args.kind === 'block' ? `block ${res.pos ?? ''}`.trim() : res.desc.replace(/^the /, '');
    return ok(text.length <= 400 ? `OK, reading ${what}: ${text}` : `OK, reading ${what}.`);
  }
  if (!s.blocks.length) return no('missing', 'The document is empty, so there is nothing to read.');
  const all = spoken(s);
  ctx.effect('speech.say', { text: all });
  return ok(all.length <= 400 ? `OK, reading the document: ${all}` : `OK, reading the document "${s.title}" (${wordCount(s)} words).`);
}

function _copy(ctx, args = {}) {
  const s = ctx.state;
  if (args.t || (args.kind && args.kind !== 'title')) {
    const res = refFromArgs(s, args);
    if (!res.ok) return no('missing', res.error);
    ctx.effect('clipboard.copy', { text: textOfRes(res).replace(/^A (task |numbered )?list: /, '') });
    return ok(`OK, I copied ${args.t ? res.desc : `the ${res.desc.replace(/^the /, '')}`} to the clipboard.`);
  }
  if (!s.blocks.length && s.title === DEFAULT_TITLE) return no('missing', 'The document is empty, so there is nothing to copy.');
  const f = String(args.format ?? '').toLowerCase();
  const md = f === 'markdown' || f === 'md', html = f === 'html' || f === 'htm';
  ctx.effect('clipboard.copy', { text: html ? toHtml(s) : toText(s, md) });
  return ok(`OK, I copied the document to the clipboard${md ? ' as markdown' : html ? ' as HTML' : ''}.`);
}

function _download(ctx, { format } = {}) {
  const s = ctx.state;
  if (!s.blocks.length) return no('missing', 'The document is empty, so there is nothing to download.');
  const f = String(format ?? '').toLowerCase();
  const kind = f === 'markdown' || f === 'md' ? 'md' : f === 'html' || f === 'htm' || f === 'web_page' ? 'html' : f === 'json' ? 'json' : 'txt';
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
  const mime = { md: 'text/markdown', html: 'text/html', json: 'application/json', txt: 'text/plain' }[kind];
  const content = kind === 'md' ? toText(s, true) : kind === 'html' ? toHtml(s) : kind === 'json' ? JSON.stringify(toDoc(s), null, 2) + '\n' : toText(s, false);
  ctx.effect('file.download', { filename: `${slug}.${kind}`, mime, content });
  return ok(`OK, I am downloading "${s.title}" as ${{ md: 'markdown', html: 'a web page (HTML)', json: 'editor JSON', txt: 'a text file' }[kind]}.`);
}

// ---- questions ------------------------------------------------------------------------------------------------------------
function _count(ctx, { kind }) {
  const s = ctx.state;
  const st = computeStats(s);
  const tb = tableOf(s);
  let n;
  if (kind === 'word') n = wordCount(s);
  else if (kind === 'character' || kind === 'letter') { n = st.characters; kind = 'character'; }
  else if (kind === 'item') n = s.blocks.filter((b) => b.kind === 'list').reduce((a, b) => a + b.items.length, 0);
  else if (kind === 'task') n = st.tasks;
  else if (kind === 'sentence') n = s.blocks.filter((b) => b.kind === 'paragraph' || b.kind === 'quote').reduce((a, b) => a + sentencesCount(b.text), 0);
  else if (kind === 'block') n = s.blocks.length;
  else if (kind === 'row') { if (!tb) return noTable(); n = tb.rows.length - 1; }
  else if (kind === 'column') { if (!tb) return noTable(); n = tb.rows[0].length; }
  else if (kind === 'link') n = st.links;
  else if (['paragraph', 'heading', 'list', 'quote', 'table'].includes(kind)) n = s.blocks.filter((b) => b.kind === kind).length;
  else return no('unsupported', 'I can count paragraphs, headings, lists, items, tasks, tables, rows, columns, quotes, links, sentences, words and characters.');
  return ok(`There ${n === 1 ? 'is' : 'are'} ${n} ${plural(n, kind)}.`);
}
function _stats(ctx) {
  const st = computeStats(ctx.state);
  if (!st.words && !st.blocks) return ok('The document is empty.');
  const bits = [`${st.words} ${plural(st.words, 'word')}`, `${st.characters} ${plural(st.characters, 'character')}`];
  if (st.sentences) bits.push(`${st.sentences} ${plural(st.sentences, 'sentence')}`);
  if (st.paragraphs) bits.push(`${st.paragraphs} ${plural(st.paragraphs, 'paragraph')}`);
  if (st.tasks) bits.push(`${st.tasksDone} of ${st.tasks} ${plural(st.tasks, 'task')} done`);
  return ok(`The document has ${joinAnd(bits)}. Reading time: about ${st.readingMinutes} ${plural(st.readingMinutes, 'minute')}.`);
}
function _askTitle(ctx) {
  const t = ctx.state.title;
  return ok(t === DEFAULT_TITLE ? 'The document has no title yet. It is called "Untitled document".' : `The title is "${t}".`);
}
function _whatIs(ctx, args) {
  if (args.kind === 'title') return _askTitle(ctx);
  const res = refFromArgs(ctx.state, args);
  if (!res.ok) return no('missing', res.error);
  const text = res.kind === 'blocks' ? res.blocks.map((b) => (b.kind === 'list' ? joinAnd(b.items) : b.kind === 'table' ? b.rows.map((r) => r.join(', ')).join('; ') : b.text)).join(' ') : textOfRes(res);
  return ok(`${cap(res.desc)} says: ${text}`.replace(/ says: (.*[^.!?])$/, ' says: $1.'));
}
function _say(ctx) {
  const s = ctx.state;
  if (!s.blocks.length) return no('missing', 'The document is empty.');
  return ok(`The document "${s.title}" says: ${spoken(s)}`);
}
function _mentions(ctx, { word }) {
  const s = ctx.state, w = String(word).trim().replace(/^the\s+(word\s+)?/i, '');
  const re = new RegExp(`\\b${esc(w)}`, 'i');
  const where = s.blocks.map((b, i) => (re.test(blockText(b)) ? `${b.kind} ${s.blocks.slice(0, i + 1).filter((x) => x.kind === b.kind).length}` : null)).filter(Boolean);
  if (re.test(s.title)) where.unshift('the title');
  if (!where.length) return ok(`No, the document does not mention ${w}.`);
  return ok(`Yes, the document mentions ${w}: in ${joinAnd(where)}.`);
}
function _isEmpty(ctx) {
  const s = ctx.state;
  return ok(s.blocks.length ? `No, the document has ${s.blocks.length} ${plural(s.blocks.length, 'block')}.` : 'Yes, the document is empty.');
}

// ---- dictation (modal input) -------------------------------------------------------------------
function _dictate(ctx) {
  const s = ctx.state;
  s.inputMode = 'dictation'; s.dictBlock = null;
  show(ctx);
  return ok('OK, dictation is on. Everything you say goes into the document. Say comma, period or question mark for punctuation, "new paragraph" for a new paragraph, "undo that" or "delete the last sentence" to correct, and "stop dictation" when you are done.');
}
function _dictateStop(ctx) {
  const s = ctx.state;
  if (!s.inputMode) return no('missing', 'Dictation is not on.');
  s.inputMode = null; s.dictBlock = null;
  return ok('OK, dictation is off.');
}

const PUNCT = [
  [/\s*\b(?:question mark)\b/gi, '?'], [/\s*\b(?:exclamation mark|exclamation point)\b/gi, '!'], [/\s*\b(?:full stop|period)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','], [/\s*\bsemicolon\b/gi, ';'], [/\s*\bcolon\b/gi, ':'],
];
function convertPunctuation(text) {
  let t = String(text).trim();
  for (const [re, p] of PUNCT) t = t.replace(re, p);
  t = t.replace(/\s*\bnew line\b\s*/gi, '\n').replace(/\s+([,.;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
  return t.replace(/([.!?]\s+|\n)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
}
const norm = (t) => String(t).toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const POLITE = '(?:ok|okay|alright|hey|so|well|and|now|please|pls|can you|could you|would you)';
const DICT = '(?:the |this |my |our )?(?:dictation|dictating)(?: mode)?';
const STOP = new RegExp(`^(?:${POLITE} )*(?:(?:stop|end|finish|quit|exit|cancel|close|leave|disable|kill|cut) ${DICT}|(?:turn|switch|shut|put|set) ${DICT} (?:off|stop)|(?:turn|switch|shut) off ${DICT}|${DICT} (?:off|stop|stopped|end|ended|over|done)|(?:i am|i m|im|we are|we re) (?:done|finished|through) (?:with )?${DICT.replace('(?:the |this |my |our )?', '(?:the |this |my |our )?')}|(?:done|finished) (?:with )?${DICT}|that is it for ${DICT}|no more dictating|that is enough dictating)(?: (?:${POLITE.slice(3, -1)}|thanks|thank you|again|for now|here|there))*$`);

/** Modal input hook (spec 07 section 2): called before formalization while inputMode is set. */
function _interceptInput(ctx, text) {
  const s = ctx.state;
  if (s.inputMode !== 'dictation') return { handled: false };
  const n = norm(text);
  const closeDict = () => { const b = s.blocks.find((x) => x.id === s.dictBlock); if (b?.text && !endsSentence(b.text)) b.text += '.'; s.dictBlock = null; };   // a dictated paragraph ends with a full stop
  if (STOP.test(n)) { closeDict(); s.inputMode = null; return { handled: true, reply: 'OK, dictation is off.' }; }
  if (/^(?:a |the )?(?:new|next) (?:paragraph|line)$|^(?:start|begin) (?:a |the )?(?:new|next) (?:paragraph|line)$|^line break$/.test(n)) { closeDict(); s.dictTitle = null; return { handled: true, reply: /line/.test(n) ? 'New line.' : 'New paragraph.' }; }
  if (/^(?:insert |add )?(?:a |the )?page break$|^(?:a |the )?(?:new|next) page$/.test(n)) { closeDict(); _pageBreak(ctx); return { handled: true, reply: 'Page break.' }; }
  const ch = String(text).trim().match(/^\W*(?:(?:start|begin|add) )?(?:a |the )?(?:new|next) (chapter|section|heading|subheading)\b[\s:,.\-]*(?:(?:called|named|titled|about|saying)\s+)?(.*?)[\s.!?]*$/i);
  if (ch) {
    closeDict();
    const role = ch[1].toLowerCase() === 'heading' ? null : ch[1].toLowerCase(), title = ch[2].trim();
    const r = _addHeading(ctx, { text: title, role, level: role ? undefined : 2 });
    if (!title && s.blocks.at(-1)?.kind === 'heading') s.dictTitle = s.blocks.at(-1).id; else s.dictTitle = null;
    return { handled: true, reply: r.value ? (title ? `New ${role ?? 'heading'}: ${s.blocks.at(-1)?.text ?? title}.` : `New ${role ?? 'heading'}. What is its title?`) : r.note };
  }
  if (s.dictTitle) {   // the words after "new chapter" are its title
    const h = s.blocks.find((b) => b.id === s.dictTitle);
    s.dictTitle = null;
    const t = String(text).trim().replace(/[\s.!?]+$/, '').replace(/^(?:called|named|titled)\s+/i, '');
    if (h && t) { commit(s); h.text = /^(?:chapter|section)\s+\d+$/i.test(h.text) ? `${h.text}: ${cap(t)}` : cap(t); return { handled: true, reply: `Title: ${h.text}.` }; }
  }
  if (n === 'undo that' || n === 'undo' || n === 'scratch that') { const r = _undo(ctx); return { handled: true, reply: r.value ?? r.note }; }
  if (/^(delete|remove|erase) (the )?(last|previous) sentence$/.test(n)) { const r = _deleteSentence(ctx); return { handled: true, reply: r.value ?? r.note }; }
  let raw = String(text).trim(), stopAfter = false;
  const tail = raw.match(/^(.*?)[\s,.]*\b(?:(?:and )?(?:please )?(?:stop|end|finish) (?:the |this )?(?:dictation|dictating)(?: mode)?(?: now| please)?)\s*[.!]?$/i);
  if (tail) { raw = tail[1]; stopAfter = true; }
  const added = convertPunctuation(raw);
  if (added) {
    commit(s);
    const cur = s.blocks.findIndex((b) => b.id === s.dictBlock);
    if (cur < 0) {
      const b = addBlock(s, { kind: 'paragraph', text: cap(added) });
      s.dictBlock = b.id;
    } else {
      const b = s.blocks[cur];
      const glue = /^[,.;:!?]/.test(added) ? '' : ' ';
      const piece = /[.!?]$/.test(b.text) && glue ? cap(added) : added;
      b.text += glue + piece;
      s.cursor = cur;
    }
  }
  if (stopAfter) { closeDict(); s.inputMode = null; return { handled: true, reply: added ? 'Added. Dictation is off.' : 'OK, dictation is off.' }; }
  return { handled: true, reply: added ? 'Added.' : '' };
}

function createDoc(ctx, title, blocks) {
  const s = ctx.state;
  commit(s);
  s.title = title; s.titleMarks = []; s.titleAlign = 'left'; s.titleSize = 0; s.blocks = []; s.dictBlock = null; s.selection = null;
  for (const b of blocks) addBlock(s, b);
  s.cursor = 0;
  show(ctx);
  ctx.effect('speech.say', { text: title });
}

const listKey = (raw) => {
  const n = String(raw).toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(my|the|a|an|our)\s+/, '').replace(/\s+list$/, '');
  if (/^(to do|todo|to-do|tasks?|things to do|chores?)$/.test(n)) return 'to-do';
  if (/^(shopping|shop|grocery|groceries)$/.test(n)) return 'shopping';
  if (/^reminders?$/.test(n)) return 'reminders';
  return n || 'to-do';
};

function _fromList(ctx, { list }) {
  const key = listKey(list);
  const entries = ctx.find('kids.tasks.entry').filter((w) => ctx.val(w, 'list') === key && ctx.val(w, 'progress') !== 'removed');
  if (!entries.length) return no('missing', `There is nothing on your ${key} list yet, so I cannot make a document from it.`);
  const todo = entries.filter((w) => ctx.val(w, 'progress') !== 'done');
  const done = entries.filter((w) => ctx.val(w, 'progress') === 'done');
  const title = `${cap(key)} list`;
  const blocks = [];
  if (todo.length) blocks.push({ kind: 'list', style: 'task', items: todo.map((w) => ctx.val(w, 'text')), from: todo.map((w) => w.id) });
  if (done.length) blocks.push({ kind: 'paragraph', text: `Already done: ${joinAnd(done.map((w) => ctx.val(w, 'text')))}.`, from: done.map((w) => w.id) });
  createDoc(ctx, title, blocks);
  return ok(`I made a document called "${title}" from your ${key} list: ${entries.length} ${plural(entries.length, 'item')}. It is open in the editor.`, { from: entries.map((w) => w.id) });
}


function _report(ctx, { topic }) {
  const where = animalFilter(topic);
  if (!Object.keys(where).length) return no('missing', `I do not know a group of animals called "${String(topic).trim()}". Try sea animals, farm animals, birds or insects.`);
  const found = ctx.ask({ type: TYPE, seek: 'matching', where, mode: 'list' });
  if (found.status !== 'supported' || !found.values?.length) return no('missing', `I do not know any ${String(topic).trim()} in my knowledge base yet.`);
  const names = found.values;
  const blocks = [];
  const group = String(found.note ?? 'animals').replace(/\s*\(.*\)\s*$/, '');
  blocks.push({ kind: 'paragraph', text: `Here are the ${group}.`, from: found.from ?? [] });
  blocks.push({ kind: 'list', items: names.map((n) => String(n).replace(/_/g, ' ')), from: found.from ?? [] });
  for (const name of names.slice(0, 8)) {
    const d = ctx.ask({ type: TYPE, seek: 'summary', where: { name } });
    if (d.status === 'supported' && d.value) blocks.push({ kind: 'paragraph', text: `${cap(an(name))} is ${d.value}`, from: d.from ?? [] });
  }
  const title = `Report: ${cap(String(topic).trim())}`;
  createDoc(ctx, title, blocks);
  return ok(`I made a report about ${String(topic).trim()} with ${names.length} ${plural(names.length, 'animal')}. It is open in the editor.`, { from: found.from });
}

function _holdings(ctx, { who }) {
  const spec = String(who).toLowerCase().trim();
  const everyone = /^(everyone|everybody|all|all of them|they|them|the children|the kids|each person|everything)$/.test(spec);
  let owners = null;
  if (!everyone) {
    const names = spec.split(/\s*,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
    owners = names.map((n) => `e.${n}`);
    const unknown = names.filter((n) => !ctx.get(`e.${n}`));
    if (unknown.length) return no('missing', `I do not know ${joinAnd(unknown.map(cap))} yet.`);
  }
  const pairs = new Map();
  for (const w of ctx.find('kids.arith.holding')) {
    const owner = ctx.val(w, 'owner'), item = ctx.val(w, 'item');
    if (owner && item && (!owners || owners.includes(owner))) pairs.set(`${owner}|${item}`, { owner, item });
  }
  const byOwner = new Map();
  for (const { owner, item } of pairs.values()) {
    const r = ctx.ask({ type: 'kids.arith.holding', seek: 'count', where: { owner, item } });
    if (r.status !== 'supported') continue;
    const e = byOwner.get(owner) ?? { parts: [], from: [] };
    e.parts.push(`${r.value} ${String(item).replace(/_/g, ' ').split(' ').map((x, i, a) => (i === a.length - 1 ? plural(Number(r.value), x) : x)).join(' ')}`);
    e.from.push(...(r.from ?? []));
    byOwner.set(owner, e);
  }
  if (!byOwner.size) return no('missing', 'I do not know what anyone has yet. Tell me, for example: Tom has 5 apples.');
  const blocks = [...byOwner].map(([owner, e]) => ({ kind: 'paragraph', text: `${cap(ctx.name(owner))} ${ctx.name(owner).toLowerCase() === 'you' ? 'have' : 'has'} ${joinAnd(e.parts)}.`, from: [...new Set(e.from)] }));
  createDoc(ctx, 'Who has what', blocks);
  return ok(`I made a document called "Who has what" with ${blocks.length} ${plural(blocks.length, 'paragraph')}. It is open in the editor.`);
}

// ---- exports (every operation rebuilds `doc` and `stats` after it) -------------------------------------------------------------
/** "a header, two chapters and a paragraph" (RP3): every part is created in order, empty; the user fills them with "write ...". */
function _addStructure(ctx, { spec } = {}) {
  const NUM = { a: 1, an: 1, another: 1, new: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const parts = String(spec ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).map((x) => {
    const m = /^(?:(\d+|a new|a|an|another|new|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(.+?)$/.exec(x);
    const n = m?.[1] ? (/^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1]] ?? 1) : 1;
    return { n, noun: (m?.[2] ?? x).replace(/^new\s+/, '').replace(/s$/, '').replace(/\s+/g, '_') };
  });
  const said = [];
  for (const { n, noun } of parts) {
    for (let k = 0; k < Math.min(n, 10); k++) {
      let r;
      if (noun === 'header' || noun === 'heading') r = _addHeading(ctx, { text: 'Heading', level: 2 });
      else if (noun === 'chapter' || noun === 'section') r = _addHeading(ctx, { text: '', role: noun });
      else if (noun === 'list') r = _addList(ctx, { text: '', empty: 'true' });
      else if (noun === 'page_break') r = _pageBreak(ctx);
      else r = _newBlank(ctx, { kind: noun === 'line' ? 'line' : 'paragraph' });
      if (r.status !== 'supported') return r;
    }
    const word = noun === 'header' ? 'heading' : noun.replace(/_/g, ' ');
    said.push(n === 1 ? `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}` : `${n} ${word}s`);
  }
  if (!said.length) return no('unsupported', 'What should I add?');
  return ok(`OK, I added ${joinAnd(said)}. Say "write ..." to fill them in.`);
}
export const addStructure = W(_addStructure);
export const addHeading = W(_addHeading);
export const addParagraph = W(_addParagraph);
export const addList = W(_addList);
export const write = W(_write);
export const newBlank = W(_newBlank);
export const pageBreak = W(_pageBreak);
export const addItem = W(_addItem);
export const addQuote = W(_addQuote);
export const addRule = W(_addRule);
export const addTable = W(_addTable);
export const addRow = W(_addRow);
export const addColumn = W(_addColumn);
export const deleteRow = W(_deleteRow);
export const deleteColumn = W(_deleteColumn);
export const setCell = W(_setCell);
export const fillTable = W(_fillTable);
export const addTask = W(_addTask);
export const checkTask = W(_checkTask);
export const countTasks = W(_countTasks);
export const listTasks = W(_listTasks);
export const format = W(_format);
export const clearFormat = W(_clearFormat);
export const link = W(_link);
export const size = W(_size);
export const align = W(_align);
export const convert = W(_convert);
export const select = W(_select);
export const unselect = W(_unselect);
export const whatSelected = W(_whatSelected);
export const goto = W(_goto);
export const deleteTarget = W(_deleteTarget);
const doDelete = W(_delete);
export { doDelete as delete };
export const deleteSentence = W(_deleteSentence);
export const clear = W(_clear);
export const replace = W(_replace);
export const move = W(_move);
export const setTitle = W(_setTitle);
export const newDoc = W(_newDoc);
export const undo = W(_undo);
export const redo = W(_redo);
export const read = W(_read);
export const copy = W(_copy);
export const download = W(_download);
export const count = W(_count);
export const stats = W(_stats);
export const askTitle = W(_askTitle);
export const whatIs = W(_whatIs);
export const say = W(_say);
export const mentions = W(_mentions);
export const isEmpty = W(_isEmpty);
export const dictate = W(_dictate);
export const dictateStop = W(_dictateStop);
export const fromList = W(_fromList);
export const report = W(_report);
export const holdings = W(_holdings);
/** Resolve a phrase against a document state (read only): the decline hook of the schema world asks whether the words name a part of the document. */
export const resolveIn = (state, phrase) => (state?.blocks ? resolve(state, phrase) : { ok: false });
export function interceptInput(ctx, text) { const r = _interceptInput(ctx, text); if (r.handled) sync(ctx.state); return r; }

// ---- discourse hooks (spec 11): read-only, called by the dialog layer through interp.hook ------------------------------------
/** Blocks a person can point at ("the second paragraph", "the last one"): [{ id, kind, noun, words, attrs, salient }]. */
export function referents(ctx) {
  const s = ctx.state;
  return (s.blocks ?? []).map((b, i) => ({
    id: b.id, kind: b.kind ?? 'paragraph', noun: b.kind ?? 'paragraph', words: [b.kind ?? 'paragraph'], attrs: { align: b.align ?? 'left' },
    salient: i === s.cursor, sig: JSON.stringify(b),
  }));
}
/** One sentence about the document, for "where were we?". */
export function summary(ctx) {
  const s = ctx.state;
  const n = (s.blocks ?? []).length;
  return n ? `The document "${s.title}" has ${n} ${n === 1 ? 'block' : 'blocks'}.` : `The document "${s.title}" is empty.`;
}

// ---- make a document with content in ONE request, and the document as a VIEW of the session things (spec 23) ----------------------------------------------
/** The blocks of `sections`: [{ heading?, paragraphs?: [text], items?: [text] }]. A plain `content` text is paragraphs (one per line, else one). */
function blocksOf_(sections) {
  const out = [];
  for (const sec of sections) {
    budget.tick('editor.sections');
    if (sec.heading) out.push({ kind: 'heading', level: 2, text: String(sec.heading) });
    for (const p of sec.paragraphs ?? []) if (String(p).trim()) out.push({ kind: 'paragraph', text: String(p).trim() });
    if (sec.items?.length) out.push({ kind: 'list', style: 'bullet', items: sec.items.map(String) });
  }
  return out;
}
/** The act make-document: a new document with a title and its content in one request (`content` text, and/or `sections`), one step to undo. */
function _make(ctx, { title, content, sections } = {}) {
  const text = String(content ?? '').trim().replace(/^["\u201c](.*)["\u201d]$/s, '$1');
  const secs = [...(sections ?? []), ...(text ? [{ paragraphs: text.split(/\n+/) }] : [])];
  if (!secs.length && !String(title ?? '').trim()) return no('unsupported', 'What should the document say? Give it a title or some text, for example: "make a document called Holiday with the text We go to the sea."');
  const t = String(title ?? '').trim();
  createDoc(ctx, t ? cap(t) : DEFAULT_TITLE, blocksOf_(secs));
  const n = ctx.state.blocks.length;
  return ok(`OK, I made a document${t ? ` called "${ctx.state.title}"` : ''} with ${n} ${plural(n, 'block')}. It is open in the editor.`);
}
export const make = W(_make);

export const view = () => ok({ id: 'docs.editor', noun: 'document', words: ['document', 'doc', 'page', 'editor', 'paragraph', 'summary', 'report', 'notes'], aspects: ['textual'], many: true, facts: true, kinds: null });
const describeThing = (t) => {
  const kind = String(t.kind).replace(/_/g, ' '), a = t.attrs ?? {};
  const colour = a.colour ?? a.color, rest = Object.entries(a).filter(([k, v]) => !['colour', 'color', 'owner', 'place', 'size', 'x', 'y'].includes(k) && v != null && v !== '' && typeof v !== 'object').map(([k, v]) => `${k} ${v}`);
  const head = t.name ? `${t.name}, ${an(`${colour ? `${colour} ` : ''}${kind}`)}` : `${colour ? `${colour} ` : ''}${kind}`;
  return `${cap(head)}${rest.length ? ` (${rest.join(', ')})` : ''}${a.place ? `, ${/^(?:on|in|at|under|near|next|behind|above|below|inside)\b/.test(a.place) ? '' : 'at '}${a.place}` : ''}`;
};
/** Things (one section for the view each came from) and the facts of the discussion (topics, games, places) as a new document, or, for things sent one by one, as sections of the open one. */
function _adopt(ctx, { things, thing, facts, about } = {}) {
  const list = things ?? (thing ? [thing] : []);
  const by = new Map();
  for (const t of list) { budget.tick('editor.adopt'); const k = t.originNoun ? `From the ${t.originNoun}` : 'Things'; (by.get(k) ?? by.set(k, []).get(k)).push(describeThing(t)); }
  const sections = [...by].map(([heading, items]) => ({ heading: cap(heading), items }));
  if (facts?.topics?.length) sections.push({ heading: 'Topics', paragraphs: [`We talked about ${joinAnd(facts.topics)}.`] });
  if (facts?.games?.length) sections.push({ heading: 'Games', items: facts.games.map((g) => `${g.title}${g.result ? `: ${g.result}` : g.status ? ` (${g.status})` : ''}`) });
  if (facts?.places?.length) sections.push({ heading: 'Places', paragraphs: [`We looked at ${joinAnd(facts.places)}.`] });
  if (!sections.length) return no('unsupported', 'I was given nothing to write.');
  const s = ctx.state;
  if (about || !s.blocks.length) {
    const title = about ? cap(about === 'the discussion' ? 'About the discussion' : `About the ${String(about).replace(/^the /, '')}`) : 'Things';
    createDoc(ctx, title, blocksOf_(sections));
    return ok(`OK, I made a document called "${title}" with ${sections.length} ${plural(sections.length, 'section')}. It is open in the editor.`);
  }
  commit(s);
  for (const sec of sections) {   // sent into the open document: its section for that view is found or made
    const at = s.blocks.findIndex((b) => b.kind === 'heading' && b.text === sec.heading);
    if (at >= 0) {
      const lst = s.blocks.slice(at + 1).findIndex((b) => b.kind === 'heading');
      const end = lst < 0 ? s.blocks.length : at + 1 + lst;
      const l = s.blocks.slice(at + 1, end).find((b) => b.kind === 'list');
      if (l && sec.items) { l.items.push(...sec.items); continue; }
    }
    for (const b of blocksOf_([sec])) addBlock(s, b);
  }
  show(ctx);
  return ok(`OK, I added ${list.length} ${plural(list.length, 'thing')} to the document.`);
}
export const adopt = W(_adopt);
