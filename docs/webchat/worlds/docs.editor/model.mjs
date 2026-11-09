// Document model of docs.editor: blocks with inline mark ranges, mapped onto ProseMirror / TipTap JSON (spec 07 §3).
// Browser-safe, pure functions, no imports. The world state keeps `blocks` (the language layer works on them) and a derived
// `doc` (TipTap JSON, rebuilt by toDoc after every change), so the tab can render it with TipTap without any conversion logic.
//
// Block kinds: heading { text, level 1..3 }, paragraph { text }, quote { text }, list { items, style: bullet|numbered|task, checked? },
//   table { rows: [[string]], header }, rule {}. Every block may have `align` (left|center|right|justify), `from` (source wire ids)
//   and `marks`: [{ at, from, to, type, attrs? }] where `at` addresses a text container of the block: '0' for the text of
//   a paragraph/heading/quote, the item index for lists ('2'), 'row:col' for table cells ('1:0'). `from`/`to` are string offsets.
// The title is a pseudo block (id 'title') kept in state.title, titleMarks, titleAlign, titleSize.

export const DEFAULT_TITLE = 'Untitled document';
export const MARK_TYPES = ['link', 'bold', 'italic', 'underline', 'strike', 'code', 'highlight'];
export const COLORS = {
  yellow: '#fff176', green: '#b9f6ca', blue: '#a7d8ff', pink: '#ffc1e3', orange: '#ffd180', red: '#ff9e9e',
  purple: '#d9bfff', gray: '#d9dee5', cyan: '#a5f3fc', brown: '#e0c3a3',
};
const COLOR_ALIAS = { grey: 'gray', violet: 'purple', lilac: 'purple', turquoise: 'cyan', aqua: 'cyan', magenta: 'pink', rose: 'pink', lime: 'green', gold: 'yellow' };
export const colorName = (w) => { const k = String(w ?? '').toLowerCase().trim(); const n = COLOR_ALIAS[k] ?? k; return COLORS[n] ? n : null; };
export const TITLE_SIZE_MIN = -2, TITLE_SIZE_MAX = 4;
export const ALIGNS = ['left', 'center', 'right', 'justify'];

// ---- text containers --------------------------------------------------------------------------
/** The title as a pseudo block, writing through to the state. */
export function titleBlock(s) {
  return {
    id: 'title', kind: 'title', isTitle: true,
    get text() { return s.title; }, set text(v) { s.title = v; },
    get marks() { return s.titleMarks; }, set marks(v) { s.titleMarks = v; },
    get align() { return s.titleAlign; }, set align(v) { s.titleAlign = v; },
  };
}
/** The first heading of an untitled document sets the title and stays a block flagged `asTitle`; while its text equals the title it is not shown twice. */
export const hiddenTitle = (s, b) => !!b.asTitle && b.kind === 'heading' && b.text === s.title;
export const isTextKind = (k) => k === 'paragraph' || k === 'heading' || k === 'quote' || k === 'title';

/** Text containers of a block: [{ at, text }]. */
export function containers(b) {
  if (b.kind === 'list') return (b.items ?? []).map((text, i) => ({ at: String(i), text }));
  if (b.kind === 'table') return (b.rows ?? []).flatMap((r, ri) => r.map((text, ci) => ({ at: `${ri}:${ci}`, text })));
  if (b.kind === 'rule') return [];
  return [{ at: '0', text: b.text ?? '' }];
}
export function getText(b, at) {
  if (b.kind === 'list') return b.items[Number(at)];
  if (b.kind === 'table') { const [r, c] = String(at).split(':').map(Number); return b.rows[r]?.[c]; }
  return at === '0' ? b.text : undefined;
}
export function setText(b, at, v) {
  if (b.kind === 'list') b.items[Number(at)] = v;
  else if (b.kind === 'table') { const [r, c] = String(at).split(':').map(Number); b.rows[r][c] = v; } else b.text = v;
}
/** All text of a block as one string (items joined with ', ', table cells with ', '). */
export function blockText(b) {
  if (b.kind === 'list') return b.items.join(', ');
  if (b.kind === 'table') return b.rows.map((r) => r.join(', ')).join('; ');
  if (b.kind === 'rule') return '';
  return b.text ?? '';
}

// ---- marks --------------------------------------------------------------------------------------
const key = (m) => `${m.at}|${m.type}|${m.attrs ? JSON.stringify(m.attrs) : ''}`;
function setMarks(b, arr) {
  if (b.isTitle) b.marks = arr;
  else if (arr.length) b.marks = arr; else delete b.marks;
}
/** Sort, clamp to the text, merge overlapping or touching marks of the same kind. */
export function normalizeMarks(b) {
  const lens = new Map(containers(b).map((c) => [c.at, c.text.length]));
  const groups = new Map();
  for (const m of b.marks ?? []) {
    const len = lens.get(m.at);
    if (len === undefined) continue;
    const from = Math.max(0, m.from), to = Math.min(len, m.to);
    if (to <= from) continue;
    const k = key(m);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ ...m, from, to });
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, c) => a.from - c.from);
    let cur = null;
    for (const m of list) {
      if (cur && m.from <= cur.to) cur.to = Math.max(cur.to, m.to);
      else { if (cur) out.push(cur); cur = { ...m }; }
    }
    if (cur) out.push(cur);
  }
  out.sort((a, c) => (a.at < c.at ? -1 : a.at > c.at ? 1 : a.from - c.from || MARK_TYPES.indexOf(a.type) - MARK_TYPES.indexOf(c.type)));
  setMarks(b, out);
}
/** Remove the part [from, to) of marks of `type` (null: every type) in container `at`. */
export function cutMark(b, at, from, to, type = null) {
  const out = [];
  for (const m of b.marks ?? []) {
    if (m.at !== at || (type && m.type !== type) || m.to <= from || m.from >= to) { out.push(m); continue; }
    if (m.from < from) out.push({ ...m, to: from });
    if (m.to > to) out.push({ ...m, from: to });
  }
  setMarks(b, out);
  normalizeMarks(b);
}
export function addMark(b, at, from, to, type, attrs) {
  if (to <= from) return;
  if (type === 'highlight' || type === 'link') cutMark(b, at, from, to, type);
  const arr = [...(b.marks ?? []), { at, from, to, type, ...(attrs ? { attrs } : {}) }];
  setMarks(b, arr);
  normalizeMarks(b);
}
/** Is [from, to) fully covered by marks of `type` in container `at`? */
export function covered(b, at, from, to, type) {
  const rs = (b.marks ?? []).filter((m) => m.at === at && m.type === type).sort((a, c) => a.from - c.from);
  let pos = from;
  for (const m of rs) { if (m.from <= pos && m.to > pos) pos = m.to; if (pos >= to) return true; }
  return pos >= to;
}
export const anyMark = (b, at, from, to, type) => (b.marks ?? []).some((m) => m.at === at && (!type || m.type === type) && m.from < to && m.to > from);
/** Marks that overlap [from, to) of a container, shifted so `from` becomes 0 (used when a text is split). */
export function sliceMarks(b, at, from, to, newAt = '0') {
  const out = [];
  for (const m of b.marks ?? []) if (m.at === at && m.from < to && m.to > from) out.push({ ...m, at: newAt, from: Math.max(m.from, from) - from, to: Math.min(m.to, to) - from });
  return out;
}
/** Replace [from, to) of a container's text by `insert`, moving the marks with it (an insert inside a marked range stays marked). */
export function spliceText(b, at, from, to, insert = '') {
  const text = getText(b, at) ?? '';
  const delta = insert.length - (to - from);
  setText(b, at, text.slice(0, from) + insert + text.slice(to));
  const out = [];
  for (const m of b.marks ?? []) {
    if (m.at !== at || m.to <= from) { out.push(m); continue; }
    if (m.from >= to && !(m.from === to && from === to)) { out.push({ ...m, from: m.from + delta, to: m.to + delta }); continue; }
    if (m.from >= to) { out.push({ ...m, from: m.from + delta, to: m.to + delta }); continue; }
    if (m.from <= from && m.to >= to) { out.push({ ...m, to: m.to + delta }); continue; } // covers the region
    if (m.from < from) { out.push({ ...m, to: from }); continue; }                           // overlaps from the left
    if (m.to > to) { out.push({ ...m, from: from + insert.length, to: m.to + delta }); continue; } // overlaps from the right
    // inside the removed region: dropped
  }
  setMarks(b, out);
  normalizeMarks(b);
}
/** Re-address marks when containers disappear or move: map(at) -> new at, or null to drop. */
export function remapMarks(b, map) {
  const out = [];
  for (const m of b.marks ?? []) { const at = map(m.at); if (at !== null && at !== undefined) out.push({ ...m, at }); }
  setMarks(b, out);
}

// ---- text helpers ------------------------------------------------------------------------------------
/** Sentence ranges [from, to) of a text (terminator included, surrounding spaces excluded). */
export function sentenceRanges(text) {
  const out = [];
  const re = /[^.!?]*[.!?]+|[^.!?]+$/g;
  for (const m of String(text).matchAll(re)) {
    let from = m.index, to = m.index + m[0].length;
    while (from < to && /\s/.test(text[from])) from++;
    while (to > from && /\s/.test(text[to - 1])) to--;
    if (to > from) out.push([from, to]);
  }
  return out;
}
export const sentencesOf = (t) => sentenceRanges(t).map(([a, b]) => String(t).slice(a, b));
export function wordRanges(text) {
  return [...String(text).matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)].map((m) => [m.index, m.index + m[0].length]);
}
export const wordsIn = (s) => (String(s ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** All occurrences of `needle` (case-insensitive) in a text: [[from, to]]. `whole` requires word boundaries. */
export function findAll(text, needle, whole = true) {
  const n = String(needle).trim();
  if (!n) return [];
  const re = whole ? new RegExp(`(?<![\\p{L}\\p{N}])${escRe(n)}(?![\\p{L}\\p{N}])`, 'giu') : new RegExp(escRe(n), 'giu');
  return [...String(text).matchAll(re)].map((m) => [m.index, m.index + m[0].length]);
}
/** Every text of the document, title first: [{ b, at, text }]. */
export function allTexts(s, { title = true } = {}) {
  const out = [];
  if (title) out.push({ b: titleBlock(s), at: '0', text: s.title });
  for (const b of s.blocks) for (const c of containers(b)) out.push({ b, at: c.at, text: c.text });
  return out;
}
export function documentWords(s) {
  const parts = [s.title === DEFAULT_TITLE ? '' : s.title];
  for (const b of s.blocks) if (!hiddenTitle(s, b)) for (const c of containers(b)) parts.push(c.text);
  return wordsIn(parts.join(' '));
}
export function stats(s) {
  const words = documentWords(s);
  let characters = s.title === DEFAULT_TITLE ? 0 : s.title.length, sentences = 0, tasks = 0, done = 0, links = 0;
  const count = {};
  for (const b of s.blocks) {
    if (hiddenTitle(s, b)) continue;
    count[b.kind] = (count[b.kind] ?? 0) + 1;
    for (const c of containers(b)) characters += c.text.length;
    if (b.kind === 'paragraph' || b.kind === 'quote') sentences += sentencesOf(b.text).length;
    if (b.kind === 'list' && b.style === 'task') { tasks += b.items.length; done += (b.checked ?? []).filter(Boolean).length; }
    links += (b.marks ?? []).filter((m) => m.type === 'link').length;
  }
  return { words, characters, sentences, tasks, tasksDone: done, links, blocks: s.blocks.length, paragraphs: count.paragraph ?? 0, headings: count.heading ?? 0, lists: count.list ?? 0, tables: count.table ?? 0, quotes: count.quote ?? 0, readingMinutes: Math.max(words ? 1 : 0, Math.round(words / 200)) };
}

// ---- TipTap / ProseMirror JSON ---------------------------------------------------------------------
function inline(text, marks) {
  if (!text) return undefined;
  const cuts = new Set([0, text.length]);
  for (const m of marks) { cuts.add(Math.max(0, m.from)); cuts.add(Math.min(text.length, m.to)); }
  const pts = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const active = marks.filter((m) => m.from <= a && m.to >= b).sort((x, y) => MARK_TYPES.indexOf(x.type) - MARK_TYPES.indexOf(y.type));
    const node = { type: 'text', text: text.slice(a, b) };
    if (active.length) node.marks = active.map((m) => (m.type === 'link' ? { type: 'link', attrs: { href: m.attrs?.href ?? '' } } : m.type === 'highlight' ? { type: 'highlight', attrs: { color: m.attrs?.color ?? COLORS.yellow } } : { type: m.type }));
    out.push(node);
  }
  return out;
}
const withAlign = (align, attrs = {}) => ({ ...attrs, textAlign: align && align !== 'left' ? align : null });
function paragraph(b, at, text) {
  const node = { type: 'paragraph', attrs: withAlign(b.align) };
  const c = inline(text, (b.marks ?? []).filter((m) => m.at === at));
  if (c) node.content = c;
  return node;
}
function blockNode(b) {
  const id = { blockId: b.id };
  switch (b.kind) {
    case 'heading': {
      const node = { type: 'heading', attrs: withAlign(b.align, { level: b.level ?? 2, ...id }) };
      const c = inline(b.text, b.marks ?? []);
      if (c) node.content = c;
      return node;
    }
    case 'quote': { const p = paragraph(b, '0', b.text); return { type: 'blockquote', attrs: { ...id }, content: [p] }; }
    case 'list': {
      const style = b.style ?? 'bullet';
      const item = (t, i) => (style === 'task'
        ? { type: 'taskItem', attrs: { checked: !!b.checked?.[i] }, content: [paragraph(b, String(i), t)] }
        : { type: 'listItem', content: [paragraph(b, String(i), t)] });
      return { type: style === 'task' ? 'taskList' : style === 'numbered' ? 'orderedList' : 'bulletList', attrs: style === 'numbered' ? { start: 1, ...id } : { ...id }, content: b.items.map(item) };
    }
    case 'table':
      return {
        type: 'table', attrs: { ...id },
        content: b.rows.map((r, ri) => ({
          type: 'tableRow',
          content: r.map((t, ci) => ({ type: ri === 0 && b.header !== false ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [paragraph(b, `${ri}:${ci}`, t)] })),
        })),
      };
    case 'rule': return { type: 'horizontalRule', attrs: { ...id } };
    default: { const node = { type: 'paragraph', attrs: withAlign(b.align, { ...id }) }; const c = inline(b.text, b.marks ?? []); if (c) node.content = c; return node; }
  }
}
/** The whole document as TipTap JSON: a title heading (attrs.title) followed by the blocks. */
export function toDoc(s) {
  const t = { type: 'heading', attrs: withAlign(s.titleAlign, { level: 1, blockId: 'title', title: true, size: s.titleSize ?? 0, untitled: s.title === DEFAULT_TITLE }) };
  const c = inline(s.title, s.titleMarks ?? []);
  if (c) t.content = c;
  return { type: 'doc', content: [t, ...s.blocks.filter((b) => !hiddenTitle(s, b)).map(blockNode)] };
}

// ---- export --------------------------------------------------------------------------------------------
function md(b, at, text) {
  const ms = (b.marks ?? []).filter((m) => m.at === at);
  if (!ms.length) return text;
  const cuts = [...new Set([0, text.length, ...ms.flatMap((m) => [m.from, m.to])])].sort((a, c) => a - c);
  let out = '';
  for (let i = 0; i + 1 < cuts.length; i++) {
    let seg = text.slice(cuts[i], cuts[i + 1]);
    const act = ms.filter((m) => m.from <= cuts[i] && m.to >= cuts[i + 1]);
    const lead = seg.match(/^\s*/)[0], trail = seg.match(/\s*$/)[0];
    const core = seg.trim();
    if (!core) { out += seg; continue; }
    let r = core;
    for (const m of act) {
      if (m.type === 'code') r = `\`${r}\``;
      else if (m.type === 'bold') r = `**${r}**`;
      else if (m.type === 'italic') r = `*${r}*`;
      else if (m.type === 'strike') r = `~~${r}~~`;
      else if (m.type === 'underline') r = `<u>${r}</u>`;
      else if (m.type === 'highlight') r = `==${r}==`;
      else if (m.type === 'link') r = `[${r}](${m.attrs?.href ?? ''})`;
    }
    out += lead + r + trail;
  }
  return out;
}
const mdCell = (t) => String(t).replace(/\|/g, '\\|');
/** Plain text or Markdown of the document. */
export function toText(s, markdown) {
  const out = [];
  const titleTxt = markdown ? md(titleBlock(s), '0', s.title) : s.title;
  out.push(markdown ? `# ${titleTxt}` : titleTxt);
  for (const b of s.blocks) {
    if (hiddenTitle(s, b)) continue;
    const t = (at, text) => (markdown ? md(b, at, text) : text);
    if (b.kind === 'heading') out.push(markdown ? `${'#'.repeat(Math.min(6, (b.level ?? 2) + 1))} ${t('0', b.text)}` : b.text);
    else if (b.kind === 'paragraph') out.push(t('0', b.text));
    else if (b.kind === 'quote') out.push(markdown ? `> ${t('0', b.text)}` : `"${b.text}"`);
    else if (b.kind === 'rule') out.push(markdown ? '---' : '----------');
    else if (b.kind === 'list') {
      const style = b.style ?? 'bullet';
      out.push(b.items.map((i, n) => `${style === 'numbered' ? `${n + 1}.` : style === 'task' ? (b.checked?.[n] ? '- [x]' : '- [ ]') : '-'} ${t(String(n), i)}`).join('\n'));
    } else if (b.kind === 'table') {
      if (markdown) {
        const rows = b.rows.map((r, ri) => `| ${r.map((c, ci) => mdCell(md(b, `${ri}:${ci}`, c))).join(' | ')} |`);
        rows.splice(1, 0, `| ${b.rows[0].map(() => '---').join(' | ')} |`);
        out.push(rows.join('\n'));
      } else out.push(b.rows.map((r) => r.join('\t')).join('\n'));
    }
  }
  return out.join('\n\n') + '\n';
}
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function html(b, at, text) {
  const n = inline(text, (b.marks ?? []).filter((m) => m.at === at));
  if (!n) return '';
  return n.map((x) => {
    let r = esc(x.text);
    for (const m of (x.marks ?? []).slice().reverse()) {
      if (m.type === 'bold') r = `<strong>${r}</strong>`;
      else if (m.type === 'italic') r = `<em>${r}</em>`;
      else if (m.type === 'underline') r = `<u>${r}</u>`;
      else if (m.type === 'strike') r = `<s>${r}</s>`;
      else if (m.type === 'code') r = `<code>${r}</code>`;
      else if (m.type === 'highlight') r = `<mark style="background:${esc(m.attrs.color)}">${r}</mark>`;
      else if (m.type === 'link') r = `<a href="${esc(m.attrs.href)}">${r}</a>`;
    }
    return r;
  }).join('');
}
/** A standalone HTML page of the document. */
export function toHtml(s) {
  const al = (b) => (b.align && b.align !== 'left' ? ` style="text-align:${b.align}"` : '');
  const body = [`<h1${al({ align: s.titleAlign })}>${html(titleBlock(s), '0', s.title)}</h1>`];
  for (const b of s.blocks) {
    if (hiddenTitle(s, b)) continue;
    if (b.kind === 'heading') body.push(`<h${(b.level ?? 2) + 1}${al(b)}>${html(b, '0', b.text)}</h${(b.level ?? 2) + 1}>`);
    else if (b.kind === 'paragraph') body.push(`<p${al(b)}>${html(b, '0', b.text)}</p>`);
    else if (b.kind === 'quote') body.push(`<blockquote${al(b)}><p>${html(b, '0', b.text)}</p></blockquote>`);
    else if (b.kind === 'rule') body.push('<hr>');
    else if (b.kind === 'list') {
      const style = b.style ?? 'bullet', tag = style === 'numbered' ? 'ol' : 'ul';
      body.push(`<${tag}${style === 'task' ? ' style="list-style:none;padding-left:0"' : ''}>${b.items.map((i, n) => `<li${al(b)}>${style === 'task' ? `<input type="checkbox" disabled${b.checked?.[n] ? ' checked' : ''}> ` : ''}${html(b, String(n), i)}</li>`).join('')}</${tag}>`);
    } else if (b.kind === 'table') {
      body.push(`<table>${b.rows.map((r, ri) => `<tr>${r.map((c, ci) => `<${ri === 0 && b.header !== false ? 'th' : 'td'}>${html(b, `${ri}:${ci}`, c)}</${ri === 0 && b.header !== false ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`);
    }
  }
  const css = 'body{font:16px/1.6 Georgia,serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.35rem .6rem;text-align:left}th{background:#f1f3f4}blockquote{border-left:4px solid #ccc;margin-left:0;padding-left:1rem;color:#555}code{background:#f1f3f4;padding:0 .25em;border-radius:3px}';
  return `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>${esc(s.title)}</title><style>${css}</style></head><body>\n${body.join('\n')}\n</body></html>\n`;
}
