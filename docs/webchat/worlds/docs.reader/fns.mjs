// SPDX-License-Identifier: AGPL-3.0-only
// docs.reader on the matrix reasoner (spec 15). The text engine (parsing, entities, events, co-reference, TF-IDF, BM25, search, summaries, the answers: analyze.mjs,
// text.mjs, lang.mjs, ops.mjs) is unchanged and keeps working on the session state; which documents are open, which one is read and where the reader is are also
// wires of the library (matrix.sop): one docs.reader.shelf, one docs.reader.open for each document, one docs.reader.focus, one docs.reader.search while a search is
// on. The library is the record: `toState` derives the state the engine keeps (and the tab renders) from the wires, `adopt` says which wires to retract, tell and
// set for a state the operations changed, `guard` asks the rules whether the sentence, paragraph or section a request names exists, `undoWords` says what an undo
// took back in the world's words. Browser-safe; it imports its sibling files.
import { initialState } from './ops.mjs?v=20aadd5c96';

const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const first = (w, k) => w?.attrs?.[k]?.[0];
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const OWN = new Set(['docs', 'active', 'search', 'focus']);   // kept in wires of their own; everything else the engine keeps (the last answer, the section being read, the tab's flags ...) is one JSON on the shelf wire
const restOf = (s) => Object.fromEntries(Object.entries(s).filter(([k, v]) => !OWN.has(k) && v !== undefined));
const tokens = (o) => JSON.stringify(o);
/** Do two wires say the same? (the keys the library adds itself, core.*, are not compared; the long values are compared as the strings they are) */
const same = (a, b) => {
  const ka = Object.keys(a ?? {}).filter((k) => !k.startsWith('core.')), kb = Object.keys(b ?? {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) { const x = a[k], y = b[k]; if (!y || x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; }
  return true;
};
const docToken = new WeakMap();   // a document (the analysis of a text, only ever added, replaced or closed) -> its wire value: it is not written out again every turn
const keysOf = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
const atom = (id) => String(id).replace(/[^\w.-]/g, '_');   // a document id as the wires write it

/** The state ops.mjs keeps (the tab renders it), derived from the wires. */
export function toState({ find }) {
  const shelf = find('docs.reader.shelf')[0];
  if (!shelf) return initialState();   // nobody changed anything: the sample is open, as at the start
  const s = { docs: [], active: null, search: null, focus: null, last: null, wired: [], visible: null, inputMode: null };
  Object.assign(s, JSON.parse(dec(first(shelf, 'rest'))));
  const opens = find('docs.reader.open').map((w) => ({ w, n: Number(first(w, 'n') ?? 0) })).sort((a, b) => a.n - b.n);
  s.docs = opens.map(({ w }) => { budget.tick('docs.reader.toState'); return JSON.parse(dec(first(w, 'json'))); });
  const act = first(shelf, 'active');
  s.active = act === undefined ? null : s.docs.find((d) => atom(d.id) === act)?.id ?? act;
  const f = find('docs.reader.focus')[0], q = find('docs.reader.search')[0];
  s.focus = f ? JSON.parse(dec(first(f, 'json'))) : null;
  s.search = q ? JSON.parse(dec(first(q, 'json'))) : null;
  return s;
}

const isInitial = (s) => {
  const i = initialState();
  const d = s.docs?.[0];
  return s.docs?.length === 1 && d.id === i.docs[0].id && d.origin === 'sample' && s.active === d.id && !s.search && tokens(s.focus) === tokens(i.focus) && tokens(restOf(s)) === tokens(restOf(i));
};

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }; `force`: also for the initial state (the guard asks the rules about it). */
function wiresOf(state, force = false) {
  const out = {};
  if (!force && isInitial(state)) return out;
  const docs = state.docs ?? [];
  const active = state.active === null || state.active === undefined ? null : atom(state.active);
  const shelf = { open: [String(docs.length)], rest: [str(tokens(restOf(state)))] };
  if (active !== null) shelf.active = [active];
  out['dr.shelf'] = { type: 'docs.reader.shelf', attrs: shelf };
  docs.forEach((d, n) => {
    budget.tick('docs.reader.wires');
    out[`dr.d.${atom(d.id)}`] = { type: 'docs.reader.open', attrs: { did: [atom(d.id)], n: [String(n)], title: [str(d.title ?? '')], words: [String(d.words ?? 0)], sentences: [String(d.sentences?.length ?? 0)], paras: [String(d.paras?.length ?? 0)], sections: [String(d.sections?.length ?? 0)], json: [docToken.get(d) ?? (docToken.set(d, str(tokens(d))), docToken.get(d))] } };
  });
  const f = state.focus;
  if (f) {
    const cited = (f.sentences ?? []).filter((i) => Number.isInteger(i));
    const attrs = { upto: [String(cited.length ? Math.max(...cited) + 1 : 0)], cites: [String(cited.length)], json: [str(tokens(f))] };
    if (f.doc !== null && f.doc !== undefined) attrs.doc = [atom(f.doc)];
    out['dr.focus'] = { type: 'docs.reader.focus', attrs };
  }
  const q = state.search;
  if (q) out['dr.search'] = { type: 'docs.reader.search', attrs: { doc: [atom(q.doc)], pos: [String(q.pos ?? 0)], hits: [String((q.hits ?? []).length)], json: [str(tokens(q))] } };
  return out;
}

const line = (id, w) => `@${id} ${w.type} ${Object.entries(w.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`;
/** The newest wire of each base id (`dr.d.x`, then `dr.d.x.r1` ... when a wire had to be replaced rather than set in place): Map(base -> { id, rev, w }). */
function newest(types, find) {
  const have = new Map();
  for (const t of types) for (const w of find(t)) {
    budget.tick('docs.reader.newest');
    const m = /^(.+)\.r(\d+)$/.exec(w.id);
    const base = m ? m[1] : w.id, rev = m ? Number(m[2]) : 0;
    if (!have.has(base) || have.get(base).rev < rev) have.set(base, { id: w.id, rev, w });
  }
  return have;
}

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }] } (a wire that already says it is left alone).
 * A wire whose single values changed (the focus, the search position, the shelf's rest) gets the new values set in place; a wire that gained or lost a key (the
 * shelf with no document open) or is no longer wanted (a document that was closed) is retracted and, if wanted, told again under a new id.
 */
export function adopt({ state, find }) {
  const want = wiresOf(state, true);
  const have = newest(['docs.reader.shelf', 'docs.reader.open', 'docs.reader.focus', 'docs.reader.search'], find);
  const retract = [], tell = [], sets = [], kept = new Set();
  for (const [base, h] of have) {
    budget.tick('docs.reader.adopt');
    const w = want[base];
    if (!w) { retract.push(h.id); continue; }
    kept.add(base);
    if (same(h.w.attrs, w.attrs)) continue;
    const single = keysOf(h.w.attrs) === keysOf(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.w.attrs[k] ?? []).length === 1);
    if (!single) { retract.push(h.id); tell.push(line(`${base}.r${h.rev + 1}`, w)); continue; }
    for (const [k, vs] of Object.entries(w.attrs)) if (h.w.attrs[k][0] !== vs[0]) sets.push({ id: h.id, key: k, value: vs[0] });
  }
  for (const [base, w] of Object.entries(want)) if (!kept.has(base)) tell.push(line(base, w));
  return { retract, tell: tell.join('\n'), sets };
}

// ---- guard: do the document, the sentence, the paragraph, the section exist? (asked to the rules) ----------------------------------------------------------------
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const ORD_WORD = Object.fromEntries(Object.entries(ORD).map(([k, v]) => [v, k]));
const NUM_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const NO_DOC_OK = new Set(['docr.loadSample', 'docr.more', 'docr.clearSearch']);   // these work with no document open
const lc = (a) => String(a ?? '').trim().toLowerCase();

/** What the request names: { kind, n, ord } for a sentence, a paragraph or a section; { kind: 'any' } for a document-wide request; null for "the last one" and the like. */
function targetOf(action, args) {
  const num = (n, ord) => (n !== undefined && n !== '' ? Number(n) : ord !== undefined ? ORD[lc(ord)] ?? (lc(ord) === 'last' || lc(ord) === 'final' ? -1 : undefined) : undefined);
  const item = (kind, n, ord) => { const v = num(n, ord); return v === undefined ? { kind: 'any' } : Number.isInteger(v) && v >= 1 ? { kind, n: v, ord: ORD_WORD[v] ?? `${v}th` } : null; };
  if (action === 'docr.sentence') return item('sentence', args.n);
  if (action === 'docr.part') return args.n !== undefined || args.ord ? item('section', args.n, args.ord) : { kind: 'any' };
  if (action === 'docr.read') {
    const u = lc(args.u).replace(/s$/, '');
    if (args.all === 'true' || args.rel) return { kind: 'any' };
    if (u === 'section' || u === 'chapter' || u === 'heading') return item('section', args.n, args.ord);
    if (u === 'paragraph') return item('paragraph', args.n, args.ord);
    if (u === 'sentence' || u === 'line') return item('sentence', args.n, args.ord);
  }
  return { kind: 'any' };
}

/** Refuses a request whose document, sentence, paragraph or section is not there, with the reason the rules give: { status: 'missing', note }, or null. */
export function guard({ action, args, state, check, find }) {
  if (!String(action).startsWith('docr.') || NO_DOC_OK.has(action)) return null;
  const tg = targetOf(action, args ?? {});
  if (!tg) return null;
  const facts = find('docs.reader.shelf').length ? '' : Object.entries(wiresOf(state, true)).map(([id, w]) => line(id, w)).join('\n');   // a reader nobody changed has no wires yet: the rules are asked about the state it has
  const want = `@dr.q docs.reader.want kind=${tg.kind}${tg.n ? ` n=${tg.n} ord=${tg.ord}` : ''}`;
  const r = check({ wires: facts ? `${facts}\n${want}` : want });
  if (r.ok) return null;
  const v = (r.violations ?? []).find((x) => x.why);
  if (!v) return null;
  const why = String(v.why).replace(/has (\d+)\.$/, (_, d) => `has ${NUM_WORD[Number(d)] ?? d}.`);
  return { status: 'missing', note: why, why };
}

// ---- undo words ----------------------------------------------------------------------------------------------------------------------------------------------------
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const snippet = (t) => { const x = String(t ?? '').replace(/\s+/g, ' ').trim(); return x.length > 40 ? `${x.slice(0, 39)}...` : x; };

/** What "undo that" says, from the states before and after the library went back: the document opened or closed, the one that is open, the search, the answer. */
export function undoWords({ before, after }) {
  if (!before || !after) return { status: 'missing', note: 'There is nothing to undo yet.' };
  const ids = (s) => new Map((s.docs ?? []).map((d) => [d.id, d]));
  const was = ids(before), now = ids(after);
  const parts = [];
  const opened = [...was.values()].filter((d) => !now.has(d.id)), closed = [...now.values()].filter((d) => !was.has(d.id));
  if (opened.length) parts.push(`I closed ${joinAnd(opened.map((d) => `"${snippet(d.title)}"`))} again`);
  if (closed.length) parts.push(`I put ${joinAnd(closed.map((d) => `"${snippet(d.title)}"`))} back on the shelf`);
  if (!opened.length && !closed.length && before.active !== after.active && after.active) parts.push(`"${snippet(now.get(after.active)?.title)}" is open again`);
  if (before.search && !after.search) parts.push(`I cleared the search for "${snippet(before.search.query)}"`);
  else if (!before.search && after.search) parts.push(`the search for "${snippet(after.search.query)}" is back`);
  if (parts.length) return { value: `OK, ${parts.join(', and ')}.` };
  if (tokens(before.focus) !== tokens(after.focus)) return { value: 'OK, I took that answer back. The highlights are as they were.' };
  return { value: 'OK, I took that back.' };
}

/**
 * Whether the state changed: the host compares this instead of stringifying the whole state (a document is the analysis of a text and is only ever added, replaced or closed).
 * `visible` and `inputMode` are what the Documents tab sets when it is shown: not the reader's record, so setting them is not a change another turn has to take over.
 */
export function stateKey(s) {
  const { docs, visible, inputMode, ...rest } = s;
  return JSON.stringify([rest, (docs ?? []).map((d) => [d.id, d.title, d.words, d.chars, d.sentences?.length, d.sections?.length, d.origin])]);
}
