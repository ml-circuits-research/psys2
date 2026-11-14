// SPDX-License-Identifier: AGPL-3.0-only
// user.profile on the matrix reasoner (spec 15). The operations (ops.mjs: the interview, the reading of answers, the CV) are unchanged and keep working on the
// session state; what the user told about themselves is also wires of the library: one `user.profile.fact` per field, and one `user.profile.dialog` for the
// bookkeeping of the interview (skipped fields, how often a field was asked, the question waiting, ...) and one `user.profile.plan` (the plan the operations read
// from the knowledge base; its presence also says that the profile was used). The library is the record: `toState` derives the state
// from the wires, `adopt` says which wires to retract and tell for a state the operations changed (the inverse), so undo, the rules of matrix.sop (an age that
// cannot be, an experience longer than a life) and the sources read what was said. Browser-safe; it imports its sibling files.
import { initialState, derive, provOf } from './ops.mjs?v=c863e95902';

const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const DERIVED = new Set(['fields', 'plan', 'counts', 'inputMode']);   // not kept in `user.profile.dialog`: the facts are wires and the others follow from the rest
const NUMERIC = new Set(['age', 'years', 'children']);

/** The state ops.mjs keeps (the tab and the interview read it), derived from the wires. */
export function toState({ find }) {
  const dlg = find('user.profile.dialog')[0];
  const rest = dlg?.attrs?.rest?.[0] ? JSON.parse(dec(dlg.attrs.rest[0])) : {};
  const fields = {}, prov = {};
  const facts = find('user.profile.fact').map((w) => ({ w, at: Number(w.attrs?.at?.[0] ?? 0) })).sort((a, b) => a.at - b.at);
  for (const { w } of facts) {
    const f = dec(w.attrs.field[0]);
    const vals = (w.attrs.value ?? []).map(dec);
    const e = { v: dec(w.attrs.arr?.[0]) === 'true' ? vals : vals[0], src: dec(w.attrs.src?.[0] ?? 'said'), at: Number(w.attrs.at?.[0] ?? 0) };
    if (w.attrs.note) e.note = dec(w.attrs.note[0]);
    fields[f] = e;
    if (w.attrs.said || w.attrs.asked || w.attrs.req) prov[f] = { said: dec(w.attrs.said?.[0] ?? '""'), asked: dec(w.attrs.asked?.[0] ?? '""'), req: dec(w.attrs.req?.[0] ?? '""') };
  }
  const pp = find('user.profile.plan')[0];
  if (!facts.length && !dlg && !pp) return initialState();   // nobody used the profile: the state is the initial one (no plan yet), as in ops
  const s = { ...initialState(), ...rest, fields };
  if (pp) derive(s, JSON.parse(dec(pp.attrs.json[0])));   // the plan the operations read from the knowledge base, with the counts and the input mode that follow
  Object.assign(provOf(s), prov);   // where each fact came from (not enumerable: not part of the state the operations and the tab see)
  return s;
}

const tokens = (o) => JSON.stringify(o);
const canon = (attrs) => JSON.stringify(Object.keys(attrs ?? {}).filter((k) => !k.startsWith('core.')).sort().map((k) => [k, attrs[k]]));   // the same wire, whatever the order of its keys and the bookkeeping keys the library adds

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }. */
function wiresOf(state, wasProv = () => null) {
  const out = {};
  for (const [f, e] of Object.entries(state.fields ?? {})) {
    const vals = list(e.v).map(String);
    const attrs = { field: [f], arr: [Array.isArray(e.v) ? 'true' : 'false'], src: [e.src ?? 'said'], at: [String(e.at ?? 0)] };
    if (vals.length) attrs.value = vals.map(str);
    if (e.note) attrs.note = [str(e.note)];
    if (NUMERIC.has(f) && vals.length === 1 && /^\d+$/.test(vals[0])) attrs.num = [vals[0]];
    const pv = state._prov?.[f] ?? wasProv(f, attrs.value);   // where it came from: the user's words, the question they answered, the dialogue wire of the statement
    if (pv?.said) attrs.said = [str(pv.said)];
    if (pv?.asked) attrs.asked = [str(pv.asked)];
    if (pv?.req) attrs.req = [str(pv.req)];
    out[`pf.${f}`] = { type: 'user.profile.fact', attrs };
  }
  if (state.plan) out.pp = { type: 'user.profile.plan', attrs: { json: [str(tokens(state.plan))] } };
  const rest = Object.fromEntries(Object.entries(state).filter(([k]) => !DERIVED.has(k)));
  const base = Object.fromEntries(Object.entries(initialState()).filter(([k]) => !DERIVED.has(k)));
  if (tokens(rest) !== tokens(base)) out.pd = { type: 'user.profile.dialog', attrs: { rest: [str(tokens(rest))] } };
  return out;
}

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }], replace: [{ id, type, attrs }] } (a wire that already says it is left alone).
 * A wire whose single values changed (the bookkeeping, a field with one value) gets the new values set in place (cheaper than a retract and a tell); a wire
 * that gained or lost a key or whose values are several is told under a new id (`pf.name.2` after `pf.name.1`) and the old one retracted, all in one transaction.
 */
export function adopt({ state, find }) {
  const old = new Map(find('user.profile.fact').map((w) => [dec(w.attrs.field?.[0]), w]));
  const want = wiresOf(state, (f, value) => {   // a state that lost its record (rebuilt, restored) keeps what the wire of the same value says
    const w = old.get(f);
    if (!w || JSON.stringify(w.attrs.value ?? []) !== JSON.stringify(value ?? [])) return null;
    return { said: dec(w.attrs.said?.[0] ?? '""'), asked: dec(w.attrs.asked?.[0] ?? '""'), req: dec(w.attrs.req?.[0] ?? '""') };
  });
  const have = new Map();   // id -> { id, wire }
  for (const w of [...find('user.profile.fact'), ...find('user.profile.dialog'), ...find('user.profile.plan')]) {
    have.set(w.id, { id: w.id, wire: w });
  }
  const retract = [], tell = [], sets = [], replace = [], same = new Set();
  for (const [base, h] of have) {
    const w = want[base];
    if (!w || canon(h.wire.attrs) === canon(w.attrs)) { if (!w) retract.push(h.id); continue; }
    const keys = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
    const single = keys(h.wire.attrs) === keys(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.wire.attrs[k] ?? []).length === 1);
    if (!single) { replace.push({ id: h.id, type: w.type, attrs: w.attrs }); continue; }   // the wire keeps its id (library R6.9)
    for (const [k, vs] of Object.entries(w.attrs)) if (h.wire.attrs[k][0] !== vs[0]) sets.push({ id: h.id, key: k, value: vs[0] });
    same.add(base);
  }
  for (const [base, w] of Object.entries(want)) {
    const h = have.get(base);
    if (h) continue;
    tell.push(`@${base} ${w.type} ${Object.entries(w.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`);
  }
  return { retract, tell: tell.join('\n'), sets, replace };
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

// ---- "why?" about what the user told ---------------------------------------------------------------------------------------------------------------
const FIELD_HINTS = [['age', /\b(?:age|old|born)\b/], ['location', /\b(?:live|city|town|from|location)\b/], ['name', /\b(?:name|call)\b/], ['role', /\b(?:job|role|work|profession)\b/],
  ['years', /\b(?:experience|years)\b/], ['children', /\b(?:kids|children|child)\b/], ['hobbies', /\b(?:hobby|hobbies|like|love)\b/]];
const parts = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * `why({ text, state, find, explain })`: the words of "why do you think I am 34?" / "why?" about a fact of the profile, from the library instance that holds the fact
 * wires (`explain` is that instance's explanation of a wire): who said it (the user, or a guess of ours), the question of the interview it answered and, as `from`,
 * the dialogue wire of the user's own statement (the host quotes it as typed, in the user's language). Returns { text, from }, or undefined when the sentence is
 * not about a profile fact.
 */
export function why({ text, state, find, explain }) {
  const t = String(text ?? '').toLowerCase().replace(/[?!.]+$/, '').trim();
  const facts = find('user.profile.fact').map((w) => ({ w, f: dec(w.attrs.field[0]), at: Number(w.attrs.at?.[0] ?? 0), vals: (w.attrs.value ?? []).map((v) => String(dec(v))) })).filter((x) => x.vals.length);
  if (!facts.length) return undefined;
  const words = new Set(parts(t));
  let hit = facts.filter((x) => x.vals.some((v) => parts(v).length && parts(v).every((p) => words.has(p))));
  if (!hit.length) hit = facts.filter((x) => FIELD_HINTS.some(([k, re]) => k === x.f && re.test(t)));
  if (!hit.length && t !== 'why') return undefined;   // "why is milk done?" is not about the profile
  const x = [...(hit.length ? hit : facts)].sort((a, b) => b.at - a.at)[0];
  const label = String((state?.plan ?? []).find((p) => p.id === x.f)?.label ?? x.f).toLowerCase();
  const value = pretty(x.vals);
  const said = dec(x.w.attrs.said?.[0] ?? '""'), asked = dec(x.w.attrs.asked?.[0] ?? '""'), req = dec(x.w.attrs.req?.[0] ?? '""');
  const guessed = dec(x.w.attrs.src?.[0] ?? 'said') === 'guessed';
  const quote = said.replace(/[.!?\s]+$/, ''), q = (z) => ({ text: `"${z}"`, translate: true, quote: true });
  const own = `I think your ${label} is ${value} because`;
  let out;
  if (guessed) out = [{ text: `I only guessed that your ${label} is ${value}, from what you told me about your role. Tell me if that is wrong.`, translate: true }];
  else if (asked && quote) out = [{ text: `${own} I asked you `, translate: true }, q(asked), { text: ' and you answered ', translate: true }, q(quote), { text: '.', translate: false }];
  else if (quote) out = [{ text: `${own} you answered `, translate: true }, q(quote), { text: '.', translate: false }];
  else out = [{ text: `${own} you told me so.`, translate: true }];
  let told = true;
  try { const tree = explain?.(x.w.id); told = !tree || !!tree.told || !tree.from?.length; } catch { /* the fact itself is the leaf */ }
  return { text: out.map((p) => p.text).join(""), parts: out, from: req && told ? [req] : [] };
}
