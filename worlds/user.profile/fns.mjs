// SPDX-License-Identifier: AGPL-3.0-only
// user.profile on the matrix reasoner (spec 15). The operations (ops.mjs: the interview, the reading of answers, the CV) are unchanged and keep working on the
// session state; what the user told about themselves is also wires of the library: one `user.profile.fact` per field, and one `user.profile.dialog` for the
// bookkeeping of the interview (skipped fields, how often a field was asked, the question waiting, ...) and one `user.profile.plan` (the plan the operations read
// from the knowledge base; its presence also says that the profile was used). The library is the record: `toState` derives the state
// from the wires, `adopt` says which wires to retract and tell for a state the operations changed (the inverse), so undo, the rules of matrix.sop (an age that
// cannot be, an experience longer than a life) and the sources read what was said. Browser-safe; it imports its sibling files.
import { initialState, derive } from './ops.mjs';

const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const DERIVED = new Set(['fields', 'plan', 'counts', 'inputMode']);   // not kept in `user.profile.dialog`: the facts are wires and the others follow from the rest
const NUMERIC = new Set(['age', 'years', 'children']);

/** The state ops.mjs keeps (the tab and the interview read it), derived from the wires. */
export function toState({ find }) {
  const dlg = find('user.profile.dialog')[0];
  const rest = dlg?.attrs?.rest?.[0] ? JSON.parse(dec(dlg.attrs.rest[0])) : {};
  const fields = {};
  const facts = find('user.profile.fact').map((w) => ({ w, at: Number(w.attrs?.at?.[0] ?? 0) })).sort((a, b) => a.at - b.at);
  for (const { w } of facts) {
    const f = dec(w.attrs.field[0]);
    const vals = (w.attrs.value ?? []).map(dec);
    const e = { v: dec(w.attrs.arr?.[0]) === 'true' ? vals : vals[0], src: dec(w.attrs.src?.[0] ?? 'said'), at: Number(w.attrs.at?.[0] ?? 0) };
    if (w.attrs.note) e.note = dec(w.attrs.note[0]);
    fields[f] = e;
  }
  const pp = find('user.profile.plan')[0];
  if (!facts.length && !dlg && !pp) return initialState();   // nobody used the profile: the state is the initial one (no plan yet), as in ops
  const s = { ...initialState(), ...rest, fields };
  if (pp) derive(s, JSON.parse(dec(pp.attrs.json[0])));   // the plan the operations read from the knowledge base, with the counts and the input mode that follow
  return s;
}

const tokens = (o) => JSON.stringify(o);
const canon = (attrs) => JSON.stringify(Object.keys(attrs ?? {}).filter((k) => !k.startsWith('core.')).sort().map((k) => [k, attrs[k]]));   // the same wire, whatever the order of its keys and the bookkeeping keys the library adds

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }. */
function wiresOf(state) {
  const out = {};
  for (const [f, e] of Object.entries(state.fields ?? {})) {
    const vals = list(e.v).map(String);
    const attrs = { field: [f], arr: [Array.isArray(e.v) ? 'true' : 'false'], src: [e.src ?? 'said'], at: [String(e.at ?? 0)] };
    if (vals.length) attrs.value = vals.map(str);
    if (e.note) attrs.note = [str(e.note)];
    if (NUMERIC.has(f) && vals.length === 1 && /^\d+$/.test(vals[0])) attrs.num = [vals[0]];
    out[`pf.${f}`] = { type: 'user.profile.fact', attrs };
  }
  if (state.plan) out.pp = { type: 'user.profile.plan', attrs: { json: [str(tokens(state.plan))] } };
  const rest = Object.fromEntries(Object.entries(state).filter(([k]) => !DERIVED.has(k)));
  const base = Object.fromEntries(Object.entries(initialState()).filter(([k]) => !DERIVED.has(k)));
  if (tokens(rest) !== tokens(base)) out.pd = { type: 'user.profile.dialog', attrs: { rest: [str(tokens(rest))] } };
  return out;
}

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }] } (a wire that already says it is left alone).
 * A wire whose single values changed (the bookkeeping, a field with one value) gets the new values set in place (cheaper than a retract and a tell); a wire
 * that gained or lost a key or whose values are several is told under a new id (`pf.name.2` after `pf.name.1`) and the old one retracted, all in one transaction.
 */
export function adopt({ state, find }) {
  const want = wiresOf(state);
  const have = new Map();   // base id -> { id, rev, wire } of the newest wire of that base
  for (const w of [...find('user.profile.fact'), ...find('user.profile.dialog'), ...find('user.profile.plan')]) {
    const m = /^(.+)\.(\d+)$/.exec(w.id);
    const base = m ? m[1] : w.id, rev = m ? Number(m[2]) : 0;
    if (!have.has(base) || have.get(base).rev < rev) have.set(base, { id: w.id, rev, wire: w });
  }
  const retract = [], tell = [], sets = [], same = new Set();
  for (const [base, h] of have) {
    const w = want[base];
    if (!w || canon(h.wire.attrs) === canon(w.attrs)) { if (!w) retract.push(h.id); continue; }
    const keys = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
    const single = keys(h.wire.attrs) === keys(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.wire.attrs[k] ?? []).length === 1);
    if (!single) { retract.push(h.id); continue; }
    for (const [k, vs] of Object.entries(w.attrs)) if (h.wire.attrs[k][0] !== vs[0]) sets.push({ id: h.id, key: k, value: vs[0] });
    same.add(base);
  }
  for (const [base, w] of Object.entries(want)) {
    const h = have.get(base);
    if (h && (same.has(base) || !retract.includes(h.id))) continue;
    tell.push(`@${base}.${(h?.rev ?? 0) + 1} ${w.type} ${Object.entries(w.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`);
  }
  return { retract, tell: tell.join('\n'), sets };
}

const pretty = (v) => list(v).join(', ');
/** What "undo that" says once the library went back (the facts that changed between the two states). */
export function undoWords({ before, after, said }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet.' };
  const label = (k) => String((after.plan ?? before.plan ?? []).find((p) => p.id === k)?.label ?? k).toLowerCase();
  const keys = [...new Set([...Object.keys(before.fields ?? {}), ...Object.keys(after.fields ?? {})])].filter((k) => JSON.stringify(before.fields?.[k]?.v) !== JSON.stringify(after.fields?.[k]?.v));
  const gone = keys.filter((k) => !list(after.fields?.[k]?.v).length), back = keys.filter((k) => list(after.fields?.[k]?.v).length);
  const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const parts = [];
  if (gone.length) parts.push(`I forgot your ${joinAnd(gone.map((k) => `${label(k)} (${pretty(before.fields[k].v)})`))}`);
  if (back.length) parts.push(`your ${joinAnd(back.map((k) => label(k)))} ${back.length > 1 ? 'are' : 'is'} ${joinAnd(back.map((k) => pretty(after.fields[k].v)))} again`);
  if (parts.length) return { value: `OK, ${parts.join(', and ')}.` };
  if ((before.sensitive?.length ?? 0) > (after.sensitive?.length ?? 0)) return { value: 'OK, I forgot what you asked me to remember.' };
  return { value: `OK, I took that back${said ? `: "${said}"` : ''}.` };
}
