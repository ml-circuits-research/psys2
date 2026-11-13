// Reference resolution of docs.editor: turns a phrase ("the second paragraph", "the word milk", "it") into blocks, text ranges
// or list items of the current document. Browser-safe.
import { titleBlock, containers, sentenceRanges, wordRanges, findAll, allTexts, DEFAULT_TITLE } from './model.mjs?v=f8d5904d54';
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)

export const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };
const ORD_RE = '(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\\d+(?:st|nd|rd|th))';
const BLOCK_KINDS = { paragraph: 'paragraph', heading: 'heading', list: 'list', quote: 'quote', table: 'table', block: null, rule: 'rule', line: 'rule', divider: 'rule' };
const KIND_LABEL = { paragraph: 'paragraph', heading: 'heading', list: 'list', quote: 'quote', table: 'table', block: 'block', rule: 'line' };
const CHAPTER_RE = new RegExp(`^(?:the |my |a )?(?:${ORD_RE} )?(chapter|section)s?(?: (\\d+))?$`);
const ordNum = (w) => (w in ORD ? ORD[w] : Number.parseInt(w, 10));
const plural = (n, w) => (n === 1 ? w : `${w}s`);
const fail = (error) => ({ ok: false, error });
const ok = (r) => ({ ok: true, ...r });

const PRONOUN = /^(it|this|that|this one|that one|them|these|those|the selection|my selection|selection|the selected (?:text|part|paragraph|word|sentence|heading|block|item|words)|selected text|selected part|what i selected|what is selected)$/;
const THIS_KIND = /^(?:this|that|the current|the selected|my) (paragraph|heading|list|quote|table|block|title|task|item|sentence|word|text|part|line)$/;
const ALL = /^(everything|all|all of it|all text|all the text|the whole document|the entire document|the whole text|the whole page|the document|the page|the text|the whole thing|whole document)$/;
const TITLE = /^(?:the |my )?(?:document |doc )?(?:title|name)(?: of the document)?$/;

/** Block with the given id, or the title pseudo block. */
export function blockById(s, id) { return id === 'title' ? titleBlock(s) : s.blocks.find((b) => b.id === id) ?? null; }

function fromSelection(s, hint) {
  const sel = s.selection;
  if (sel?.type === 'blocks') {
    const blocks = sel.blocks.map((id) => blockById(s, id)).filter(Boolean);
    if (blocks.length) return ok({ kind: 'blocks', blocks, desc: blocks.length === 1 ? 'the selection' : 'the selected blocks' });
  } else if (sel?.type === 'range') {
    const b = blockById(s, sel.block);
    if (b) {
      if (sel.item) return ok({ kind: 'items', items: [{ b, i: Number(sel.at) }], desc: 'the selected item' });
      return ok({ kind: 'ranges', ranges: [{ b, at: sel.at, from: sel.from, to: sel.to }], desc: 'the selection' });
    }
  }
  let cur = s.blocks[s.cursor];
  const want = hint && BLOCK_KINDS[hint];
  if (want && cur?.kind !== want) cur = [...s.blocks].reverse().find((b) => b.kind === want) ?? cur;
  if (cur) return ok({ kind: 'blocks', blocks: [cur], desc: `the ${KIND_LABEL[cur.kind] ?? 'block'} you were working on`, implicit: true });
  return fail('Nothing is selected yet. Say, for example, "select the second paragraph" first.');
}

function blockPick(s, kind, ord, n, scopeBlocks) {
  const want = BLOCK_KINDS[kind];
  const pool = scopeBlocks ?? s.blocks;
  const idxs = pool.filter((b) => !want || b.kind === want);
  const label = KIND_LABEL[kind] ?? kind;
  if (!idxs.length) return fail(`There is no ${label} in the document.`);
  let pos = n !== undefined ? n : ord !== undefined ? ord : 1;
  if (pos === -1) pos = idxs.length;
  if (!Number.isInteger(pos) || pos < 1 || pos > idxs.length) return fail(idxs.length === 1 ? `There is only one ${label}.` : `There are only ${idxs.length} ${plural(2, label)}.`);
  return ok({ kind: 'blocks', blocks: [idxs[pos - 1]], desc: ord !== undefined || n !== undefined ? `the ${ord === -1 ? 'last' : n !== undefined ? '' : Object.keys(ORD).find((k) => ORD[k] === pos) ?? `${pos}th`} ${label}`.replace('  ', ' ') : `the ${label}`, pos, total: idxs.length });
}

/** Headings that start chapters: level 1 and 2 (level 3 are subheadings), or all headings when there is no such heading. */
const chapterHeads = (pool) => { const h = pool.filter((b) => b.kind === 'heading'); const c = h.filter((b) => (b.level ?? 2) <= 2); return c.length ? c : h; };
/** The blocks of the section that starts at `head`: up to the next heading of the same or a higher level. */
export function sectionBlocks(s, head) {
  const i = s.blocks.indexOf(head);
  if (i < 0) return [head];
  const out = [head];
  for (let k = i + 1; k < s.blocks.length; k++) { const b = s.blocks[k]; if (b.kind === 'heading' && (b.level ?? 2) <= (head.level ?? 2)) break; out.push(b); }
  return out;
}
function chapterPick(s, word, ord, n, scope) {
  const heads = chapterHeads(scope ?? s.blocks);
  if (!heads.length) return fail(`There is no ${word} in the document.`);
  let head;
  if (n !== undefined) {
    head = heads.find((b) => new RegExp(`^(?:chapter|section|part)\\s+${n}(?![\\d])`, 'i').test(b.text)) ?? heads[n - 1];
    if (!head) return fail(heads.length === 1 ? `There is only one ${word}.` : `There are only ${heads.length} ${word}s.`);
  } else {
    const pos = ord === -1 ? heads.length : ord ?? 1;
    head = heads[pos - 1];
    if (!head) return fail(heads.length === 1 ? `There is only one ${word}.` : `There are only ${heads.length} ${word}s.`);
  }
  const num = n ?? (ord === undefined ? undefined : ord === -1 ? 'last' : heads.indexOf(head) + 1);
  return ok({ kind: 'blocks', blocks: [head], desc: ord === -1 ? `the last ${word}` : `${word} ${num ?? heads.indexOf(head) + 1}`, section: true });
}

function itemsOf(s, onlyTasks, scopeBlocks) {
  const out = [];
  for (const b of scopeBlocks ?? s.blocks) if (b.kind === 'list' && (!onlyTasks || b.style === 'task')) b.items.forEach((_, i) => out.push({ b, i }));
  return out;
}

function literal(s, needle, whole, scopeBlocks, first) {
  const ranges = [];
  const pool = scopeBlocks ? allTextsIn(s, scopeBlocks) : allTexts(s);
  for (const t of pool) for (const [from, to] of findAll(t.text, needle, whole)) ranges.push({ b: t.b, at: t.at, from, to });
  if (!ranges.length) return fail(`I could not find "${needle}" in ${scopeBlocks ? 'there' : 'the document'}.`);
  return ok({ kind: 'ranges', ranges: first ? [ranges[0]] : ranges, desc: `${whole ? 'the word' : 'the text'} "${needle}"`, found: ranges.length });
}
function allTextsIn(s, blocks) {
  const out = [];
  for (const b of blocks) for (const c of containers(b)) out.push({ b, at: c.at, text: c.text });
  return out;
}

function sentences(s, ord, scopeBlocks) {
  const all = [];
  for (const b of scopeBlocks ?? s.blocks) if (b.kind === 'paragraph' || b.kind === 'quote') for (const [from, to] of sentenceRanges(b.text)) all.push({ b, at: '0', from, to });
  if (scopeBlocks?.some((b) => b.isTitle)) for (const [from, to] of sentenceRanges(s.title)) all.push({ b: titleBlock(s), at: '0', from, to });
  if (!all.length) return fail('There is no sentence there.');
  const pos = ord === -1 ? all.length : ord;
  if (pos < 1 || pos > all.length) return fail(all.length === 1 ? 'There is only one sentence.' : `There are only ${all.length} sentences.`);
  return ok({ kind: 'ranges', ranges: [all[pos - 1]], desc: `the ${ord === -1 ? 'last' : Object.keys(ORD).find((k) => ORD[k] === pos) ?? `${pos}th`} sentence` });
}
function nthWord(s, ord, scopeBlocks) {
  const all = [];
  for (const t of scopeBlocks ? allTextsIn(s, scopeBlocks.filter((b) => !b.isTitle)) : allTexts(s, { title: false })) for (const [from, to] of wordRanges(t.text)) all.push({ b: t.b, at: t.at, from, to });
  if (!all.length) return fail('There is no word there.');
  const pos = ord === -1 ? all.length : ord;
  if (pos < 1 || pos > all.length) return fail(`There are only ${all.length} words.`);
  return ok({ kind: 'ranges', ranges: [all[pos - 1]], desc: `the ${ord === -1 ? 'last' : Object.keys(ORD).find((k) => ORD[k] === pos) ?? `${pos}th`} word` });
}

/**
 * Resolve a phrase to a target of the document.
 * Result: { ok: true, kind: 'blocks'|'ranges'|'items', blocks | ranges | items, desc } or { ok: false, error }.
 * opts.first: for a text search, only the first match. opts.scope: restrict to these blocks (internal).
 */
export function resolve(s, phrase, opts = {}) {
  budget.tick('target.resolve');
  const raw = String(phrase ?? '').trim().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  let p = raw.toLowerCase();
  if (!p) return fail('What do you mean?');
  if (PRONOUN.test(p)) return fromSelection(s);
  const tk = p.match(THIS_KIND);
  if (tk) return fromSelection(s, tk[1]);
  if (ALL.test(p)) {
    const blocks = [titleBlock(s), ...s.blocks];
    return ok({ kind: 'blocks', blocks, desc: 'the whole document' });
  }
  if (TITLE.test(p)) return ok({ kind: 'blocks', blocks: [titleBlock(s)], desc: 'the title' });

  // "<sub> of/in <scope>"
  const sc = p.match(/^(.+?)\s+(?:in|of|from|inside|within)\s+(?:the\s+|my\s+)?(.+)$/);
  if (sc && !opts.scope && /^(?:the\s+)?(?:(?:\w+\s+)?(?:sentence|word|words|item|task|text|phrase|letters?)\b)/.test(sc[1])) {
    const scope = resolve(s, sc[2]);
    if (scope.ok) {
      const blocks = scope.kind === 'blocks' ? scope.blocks : [...new Set((scope.ranges ?? scope.items).map((r) => r.b))];
      const r = resolve(s, raw.slice(0, raw.length - sc[2].length).replace(/\s+(?:in|of|from|inside|within)\s+(?:the\s+|my\s+)?$/i, ''), { ...opts, scope: blocks });
      if (r.ok) return { ...r, desc: `${r.desc} of ${scope.desc}` };
      if (/^I could not find/.test(r.error)) return r;
    }
  }
  const scope = opts.scope;

  // all <kind>s
  let m = p.match(/^(?:all|every|each)(?: of)?(?: the)? (paragraph|heading|list|quote|table|task|item|sentence|word)s?$/);
  if (m) {
    const k = m[1];
    if (k in BLOCK_KINDS) {
      const blocks = (scope ?? s.blocks).filter((b) => b.kind === BLOCK_KINDS[k]);
      return blocks.length ? ok({ kind: 'blocks', blocks, desc: `all ${KIND_LABEL[k]}s` }) : fail(`There is no ${KIND_LABEL[k]} in the document.`);
    }
    if (k === 'task' || k === 'item') {
      const items = itemsOf(s, k === 'task', scope);
      return items.length ? ok({ kind: 'items', items, desc: `all ${k}s` }) : fail(k === 'task' ? 'There are no tasks in the document.' : 'There are no list items in the document.');
    }
    if (k === 'sentence') {
      const ranges = [];
      for (const b of scope ?? s.blocks) if (b.kind === 'paragraph' || b.kind === 'quote') for (const [from, to] of sentenceRanges(b.text)) ranges.push({ b, at: '0', from, to });
      return ranges.length ? ok({ kind: 'ranges', ranges, desc: 'all sentences' }) : fail('There is no sentence there.');
    }
    return fail('Say which words, for example "the word milk".');
  }
  // list styles: "the numbered list", "the second task list"
  m = p.match(new RegExp(`^(?:the |my |a )?(?:${ORD_RE} )?(task|numbered|bullet|bulleted|ordered|to-do|todo|check)\\s*list$`));
  if (m) {
    const style = /^(task|to-do|todo|check)$/.test(m[2]) ? 'task' : /^(numbered|ordered)$/.test(m[2]) ? 'numbered' : 'bullet';
    const lists = (scope ?? s.blocks).filter((b) => b.kind === 'list' && (b.style ?? 'bullet') === style);
    if (!lists.length) return fail(`There is no ${style === 'task' ? 'task' : style} list in the document.`);
    const pos = m[1] ? ordNum(m[1]) : 1;
    const at = pos === -1 ? lists.length : pos;
    if (at < 1 || at > lists.length) return fail(`There are only ${lists.length} such lists.`);
    return ok({ kind: 'blocks', blocks: [lists[at - 1]], desc: `the ${style === 'task' ? 'task' : style} list` });
  }
  m = p.match(CHAPTER_RE);
  if (m) return chapterPick(s, m[2], m[1] ? ordNum(m[1]) : undefined, m[3] ? Number(m[3]) : undefined, scope);
  // [ord] kind [n]
  m = p.match(new RegExp(`^(?:the |my |a |an )?(?:${ORD_RE} )?(paragraph|heading|list|quote|table|block|rule|line|divider|task|item|sentence|word)s?(?: (\\d+))?$`));
  if (m) {
    const [, o, k, num] = m;
    const ord = o ? ordNum(o) : undefined, n = num ? Number(num) : undefined;
    if (k in BLOCK_KINDS) return blockPick(s, k, ord, n, scope);
    if (k === 'task' || k === 'item') {
      const items = itemsOf(s, k === 'task', scope);
      if (!items.length) return fail(k === 'task' ? 'There are no tasks in the document. Say "turn the list into a task list" or "add a task buy bread".' : 'There are no list items in the document.');
      let pos = n ?? ord ?? 1;
      if (pos === -1) pos = items.length;
      if (pos < 1 || pos > items.length) return fail(items.length === 1 ? `There is only one ${k}.` : `There are only ${items.length} ${plural(2, k)}.`);
      return ok({ kind: 'items', items: [items[pos - 1]], desc: n !== undefined ? `${k} ${n}` : `the ${ord === -1 ? 'last' : Object.keys(ORD).find((x) => ORD[x] === pos)} ${k}` });
    }
    if (k === 'sentence') return sentences(s, n ?? ord ?? 1, scope);
    if (k === 'word') return nthWord(s, n ?? ord ?? 1, scope);
  }
  // task <text> / item <text>
  m = raw.match(/^(?:the )?(task|item|to-do|todo)\s+(.+)$/i);
  if (m) {
    const needle = m[2].replace(/^["“'](.*)["”']$/, '$1').toLowerCase();
    const items = itemsOf(s, /^(task|to-do|todo)$/i.test(m[1]), scope).filter(({ b, i }) => b.items[i].toLowerCase().includes(needle));
    if (!items.length) return fail(`I could not find a ${m[1].toLowerCase()} called "${m[2]}".`);
    return ok({ kind: 'items', items: [items[0]], desc: `the ${m[1].toLowerCase()} "${items[0].b.items[items[0].i]}"` });
  }
  // the word X / the text X / "X"
  m = raw.match(/^(?:the )?(word|words|phrase|text|letters?)\s+["“']?(.+?)["”']?$/i);
  if (m) return literal(s, m[2], /^words?$/i.test(m[1]) && !/\s/.test(m[2].trim()) ? true : /^words?$/i.test(m[1]), scope, opts.first);
  m = raw.match(/^["“'](.+)["”']$/);
  if (m) return literal(s, m[1], false, scope, opts.first);
  // fallback: the text itself
  return literal(s, raw.replace(/^the\s+/i, ''), !/\s/.test(raw.trim()), scope, opts.first);
}

/** Text ranges of a result: blocks and items expand to all their text. */
export function rangesOf(res) {
  if (res.kind === 'ranges') return res.ranges;
  const out = [];
  if (res.kind === 'items') {
    for (const { b, i } of res.items) out.push({ b, at: String(i), from: 0, to: b.items[i].length });
    return out;
  }
  for (const b of res.blocks) for (const c of containers(b)) out.push({ b, at: c.at, from: 0, to: c.text.length });
  return out;
}
/** Distinct blocks touched by a result. */
export function blocksOf(res) {
  const list = res.kind === 'blocks' ? res.blocks : res.kind === 'items' ? res.items.map((x) => x.b) : res.ranges.map((r) => r.b);
  const seen = new Set();
  return list.filter((b) => (seen.has(b.id) ? false : seen.add(b.id)));
}
export const isDefaultTitle = (s) => s.title === DEFAULT_TITLE;
