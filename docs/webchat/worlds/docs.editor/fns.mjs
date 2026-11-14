// SPDX-License-Identifier: AGPL-3.0-only
// docs.editor on the matrix reasoner (spec 15). The text engine (editing operations, reference resolution, marks, rendering, search, statistics: ops.mjs, model.mjs,
// target.mjs) is unchanged and keeps working on the session state; the document is also wires of the library (matrix.sop): one docs.editor.doc, one
// docs.editor.block for each block, one docs.editor.sel for a selection, one docs.editor.gone for each block that was taken out. The library is the record:
// `toState` derives the state the engine keeps (and the tab renders) from the wires, `adopt` says which wires to retract, tell and set for a state the operations
// changed (so undo, the rules and the refusals read what was done), `guard` asks the rules whether the target of a request exists, `isView` says which undo steps
// only moved the cursor or the selection, `undoWords` says what an undo or a redo did in the world's words. Browser-safe; it imports its sibling files.
import { initialState, finish } from './ops.mjs?v=eba6c6d10f';

const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const first = (w, k) => w?.attrs?.[k]?.[0];
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const KINDS = new Set(['heading', 'paragraph', 'quote', 'list', 'table', 'rule']);
const OWN = new Set(['title', 'blocks', 'cursor', 'selection', 'doc', 'stats', 'history', 'future']);   // kept in wires of their own (or derived, or the library's); everything else the engine keeps (marks of the title, the next block number, dictation, navigation focus ...) is one JSON on the document wire
const restOf = (s) => ({ ...Object.fromEntries(Object.entries(s).filter(([k, v]) => !OWN.has(k) && v !== undefined)), ...(s.history?.length ? { histN: s.history.length } : {}) });   // how many undo steps there are (the tab shows it; the steps themselves are the library's)
const VIEW = new Set(['cursor', 'selection', 'focus', 'dictBlock', 'inputMode', 'doc', 'stats', 'history', 'future']);   // not the content of the document
const tokens = (o) => JSON.stringify(o);
/** Do two wires say the same? (the keys the library adds itself, core.*, are not compared) */
const same = (a, b) => {
  const ka = Object.keys(a ?? {}).filter((k) => !k.startsWith('core.')), kb = Object.keys(b ?? {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) { const x = a[k], y = b[k]; if (!y || x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; }
  return true;
};

/** The state ops.mjs keeps (the tab renders it), derived from the wires. History and future are not kept: undo and redo are the library's. */
export function toState({ find, redo = 0 }) {
  const doc = find('docs.editor.doc')[0], sel = find('docs.editor.sel')[0];
  const blocks = find('docs.editor.block').map((w) => ({ w, n: Number(first(w, 'n') ?? 0) })).sort((a, b) => a.n - b.n);
  const s = { ...initialState() };
  if (!doc && !sel && !blocks.length) return s;
  if (doc) {
    const { histN = 0, ...rest } = JSON.parse(dec(first(doc, 'rest')));
    Object.assign(s, rest);
    s.history = Array.from({ length: histN }, () => null);   // placeholders: undo and redo are the library's, the tab only counts the steps
    s.title = dec(first(doc, 'title'));
    s.cursor = Number(first(doc, 'cursor'));
  }
  s.blocks = blocks.map(({ w }) => { budget.tick('docs.editor.toState'); return JSON.parse(dec(first(w, 'json'))); });
  s.selection = sel ? JSON.parse(dec(first(sel, 'json'))) : null;
  s.future = Array.from({ length: redo }, () => null);
  finish(s);
  return s;
}

const isInitial = (s) => {
  const i = initialState();
  return !s.blocks.length && s.title === i.title && s.cursor === i.cursor && !s.selection && tokens(restOf(s)) === tokens(restOf(i));
};

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }. */
function wiresOf(state) {
  const out = {};
  if (isInitial(state)) return out;
  const blocks = state.blocks ?? [];
  const rest = restOf(state);
  out['ed.doc'] = { type: 'docs.editor.doc', attrs: { title: [str(state.title)], cursor: [String(Math.min(state.cursor ?? -1, blocks.length - 1))], count: [String(blocks.length)], rest: [str(tokens(rest))] } };
  blocks.forEach((b, n) => {
    budget.tick('docs.editor.wires');
    const attrs = { bid: [b.id], n: [String(n)], kind: [KINDS.has(b.kind) ? b.kind : 'paragraph'], json: [str(tokens(b))] };
    if (b.kind === 'heading') { attrs.level = [String(b.level ?? 2)]; if (chapter(state, b)) { attrs.chap = ['true']; attrs.sec = [String(chapterNo(state, b))]; } }
    if (b.kind === 'table') { const w = (b.rows ?? []).map((r) => r.length); attrs.cols = [String(Math.max(0, ...w))]; attrs.minc = [String(w.length ? Math.min(...w) : 0)]; }
    out[`ed.b.${b.id}`] = { type: 'docs.editor.block', attrs };
  });
  const sel = state.selection;
  if (sel) {
    const attrs = { type: [sel.type], json: [str(tokens(sel))] };
    const ids = sel.type === 'blocks' ? sel.blocks : [sel.block];
    const real = ids.filter((id) => id !== 'title');
    if (real.length) attrs.block = real;
    out['ed.sel'] = { type: 'docs.editor.sel', attrs };
  }
  return out;
}

/** Does the heading start a chapter? Level 1 and 2 do; when there is none of those, every heading does (as target.mjs reads them). */
const chapter = (s, b) => { const h = s.blocks.filter((x) => x.kind === 'heading'); return h.some((x) => (x.level ?? 2) <= 2) ? (b.level ?? 2) <= 2 : true; };
const chapterNo = (s, b) => s.blocks.filter((x) => x.kind === 'heading' && chapter(s, x)).indexOf(b) + 1;
const line = (id, w) => `@${id} ${w.type} ${Object.entries(w.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`;
const keysOf = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }], replace: [{ id, type, attrs }] } (a wire that already says it is left alone).
 * A wire whose single values changed (a block that moved or was edited, the cursor) gets the new values set in place; a wire that is no longer wanted is retracted
 * and, for a block, a docs.editor.gone wire is told (the section that was deleted is remembered, so that a second "delete it" is refused with the reason).
 */
export function adopt({ state, find }) {
  const want = wiresOf(state);
  const have = newest(['docs.editor.doc', 'docs.editor.block', 'docs.editor.sel'], find);
  const gone = new Set(find('docs.editor.gone').map((w) => first(w, 'bid')));
  const retract = [], tell = [], sets = [], replace = [], kept = new Set();
  for (const [base, h] of have) {
    budget.tick('docs.editor.adopt');
    const w = want[base];
    if (!w) {
      retract.push(h.id);
      if (h.w.type === 'docs.editor.block' && !gone.has(first(h.w, 'bid'))) {
        const sec = first(h.w, 'sec');
        tell.push(`@ed.g.${first(h.w, 'bid')} docs.editor.gone bid=${first(h.w, 'bid')} kind=${first(h.w, 'kind')}${sec ? ` sec=${sec}` : ''}`);
      }
      continue;
    }
    kept.add(base);
    if (same(h.w.attrs, w.attrs)) continue;
    const single = keysOf(h.w.attrs) === keysOf(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.w.attrs[k] ?? []).length === 1);
    if (!single) { replace.push({ id: h.id, type: w.type, attrs: w.attrs }); continue; }   // the wire keeps its id (library R6.9)
    for (const [k, vs] of Object.entries(w.attrs)) if (h.w.attrs[k][0] !== vs[0]) sets.push({ id: h.id, key: k, value: vs[0] });
  }
  for (const [base, w] of Object.entries(want)) if (!kept.has(base)) tell.push(line(base, w));
  return { retract, tell: tell.join('\n'), sets, replace };
}
/** The wires of the types by id: Map(id -> { id, w }). */
function newest(types, find) {
  const have = new Map();
  for (const t of types) for (const w of find(t)) {
    budget.tick('docs.editor.newest');
    have.set(w.id, { id: w.id, w });
  }
  return have;
}

// ---- guard: does the target exist? (asked to the rules) -------------------------------------------------------------------------------------------------------
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const BLOCK = { paragraph: 'paragraph', heading: 'heading', list: 'list', quote: 'quote', table: 'table' };
const GUARDED = new Set(['doc.delete', 'doc.deleteTarget', 'doc.goto', 'doc.read', 'doc.select', 'doc.whatIs', 'doc.copy', 'doc.move']);
const lc = (a) => String(a ?? '').trim().toLowerCase();

/** What the request names: { kind, n } for "the third paragraph" or "chapter 2" (kind section), or null (anything else is the engine's to resolve). */
function targetOf(args) {
  const kind = lc(args.kind) === 'chapter' ? 'section' : BLOCK[lc(args.kind)] ?? (lc(args.kind) === 'section' ? 'section' : null);
  if (kind && (args.n !== undefined || args.ord !== undefined) && !args.t) {
    const n = args.n !== undefined ? Number(args.n) : ORD[lc(args.ord)];
    return Number.isInteger(n) && n >= 1 ? { kind, n } : null;
  }
  const t = lc(args.t).replace(/\s+/g, ' ');
  let m = /^(?:the )?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)) (paragraph|heading|list|quote|table|chapter|section)$/.exec(t);
  if (m) return { kind: /chapter|section/.test(m[2]) ? 'section' : m[2], n: ORD[m[1]] ?? parseInt(m[1], 10) };
  m = /^(?:the )?(paragraph|heading|list|quote|table|chapter|section) (\d+)$/.exec(t);
  if (m) return { kind: /chapter|section/.test(m[1]) ? 'section' : m[1], n: parseInt(m[2], 10) };
  return null;
}

/** Refuses a request whose target is not there, with the reason the rules give: { status: 'missing', note }, or null. */
export function guard({ action, args, state, check }) {
  if (!GUARDED.has(action)) return null;
  const tg = targetOf(args ?? {});
  if (!tg || !Number.isInteger(tg.n)) return null;
  if (tg.kind === 'section' && (state?.blocks ?? []).some((b) => b.kind === 'heading' && new RegExp(`^(?:chapter|section|part)\\s+${tg.n}(?!\\d)`, 'i').test(b.text ?? ''))) return null;   // a heading that says "Chapter 3" is chapter 3
  const r = check({ wires: `@ed.q docs.editor.want kind=${tg.kind} n=${tg.n}` });
  if (r.ok) return null;
  const vs = (r.violations ?? []).filter((x) => x.why);
  const v = vs.find((x) => /already deleted/.test(x.why)) ?? vs[0];
  if (!v) return null;
  return { status: 'missing', note: v.why, why: v.why };
}

// ---- undo, redo, words -----------------------------------------------------------------------------------------------------------------------------------------
const content = (s) => tokens(Object.fromEntries(Object.entries(s ?? {}).filter(([k]) => !VIEW.has(k))));
/** Did the step only move the cursor, the selection or the dictation mode (what the user looks at)? Then "undo" does not count it. */
export function isView({ before, after }) { return !!before && !!after && content(before) === content(after); }

const KIND_WORD = { heading: 'heading', paragraph: 'paragraph', quote: 'quote', list: 'list', table: 'table', rule: 'line' };
const label = (b) => KIND_WORD[b.kind] ?? 'block';
const an = (w) => `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
const snippet = (t) => { const x = String(t ?? '').replace(/\s+/g, ' ').trim(); return x.length > 40 ? `${x.slice(0, 39)}...` : x; };
const named = (b) => (b.kind === 'heading' && b.text ? `${label(b)} "${snippet(b.text)}"` : label(b));
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

/** What "undo" or "redo" says, from the states before and after the library went back (or forward). `before` is null when there was nothing to take back. */
export function undoWords({ before, after, steps, redo }) {
  if (!before) return { status: 'missing', note: redo ? 'There is nothing to redo.' : 'There is nothing to undo.' };
  const ids = (s) => new Map((s.blocks ?? []).map((b) => [b.id, b]));
  const was = ids(before), now = ids(after);
  const added = [...now.values()].filter((b) => !was.has(b.id)), removed = [...was.values()].filter((b) => !now.has(b.id));
  const edited = [...now.values()].filter((b) => was.has(b.id) && tokens(was.get(b.id)) !== tokens(b));
  const group = (bs) => { const c = {}; for (const b of bs) c[b.kind] = (c[b.kind] ?? 0) + 1; return Object.entries(c).map(([k, n]) => (n === 1 ? an(KIND_WORD[k]) : `${n} ${KIND_WORD[k]}s`)); };
  const many = (bs) => (bs.length === 1 ? `the ${named(bs[0])}` : joinAnd(group(bs)));
  const parts = [];
  if (added.length) parts.push(redo ? `I added ${many(added)} again` : `I put back ${many(added)} you deleted`);
  if (removed.length) parts.push(redo ? `I deleted ${many(removed)} again` : `I undid it: ${many(removed)} you added is gone`);
  if (!added.length && !removed.length && edited.length) parts.push(redo ? `I made your change to ${edited.length === 1 ? `the ${label(edited[0])}` : `${edited.length} blocks`} again` : `I took back your change to ${edited.length === 1 ? `the ${label(edited[0])}` : `${edited.length} blocks`}`);
  if (before.title !== after.title) parts.push(`the title is "${snippet(after.title)}" again`);
  if (!parts.length) return { value: redo ? 'OK, I did it again.' : steps > 1 ? `OK, I undid the last ${steps} changes.` : 'OK, I undid the last change.' };
  const text = `OK, ${parts.join(', and ')}.`;
  return { value: !redo && steps > 1 ? `${text.slice(0, -1)} (${steps} changes).` : text };
}

/** Whether the state changed: the host compares this instead of stringifying the whole state (`doc` and `stats` follow from the blocks, the undo steps are only counted). */
export function stateKey(s) {
  const { doc, stats, history, future, ...rest } = s;
  return JSON.stringify([rest, history?.length ?? 0, future?.length ?? 0]);
}
