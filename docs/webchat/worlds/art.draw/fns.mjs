// SPDX-License-Identifier: AGPL-3.0-only
// art.draw on the matrix reasoner (spec 15). The drawing engine (ops.mjs: the vocabulary, noun phrases, placement and geometry, the shapes of scene.mjs, the
// pictures) is unchanged and keeps working on the session state; the scene is also wires of the library: one `art.draw.object` per thing on the canvas, the
// selection and what the last command touched (`art.draw.sel`, `art.draw.last`), and `art.draw.scene` (paper, sky, ground, mood, the counter of ids and the
// bookkeeping of the operations). The library takes the state over after every operation (`adopt`; `toState` is the way back), so its rules refuse a scene that
// cannot be (a selected thing that is not there, two things with one id, a kind the board cannot draw), derive what is in the picture (the number of things and of each kind) and refuse a request whose target is not there ("I can not find a green circle in your picture."). Undo and redo are the session timeline's, in the
// words of the board. Browser-safe; it imports its sibling ops.mjs for the tables (a world is plain files).
import {
  initialState, parseNP, splitDest, kindOfWord, describeWanted, colorFrom, isShade, isColorWord, pluralOfKind, a_, placePhrase, effectiveColor, sameColorName, drawingNP,
} from './ops.mjs?v=3625df955c';

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const tok = (w, k) => (w?.attrs?.[k] ?? []).map((t) => dec(t));
const num = (n) => String(Number(n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const atomOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_]+$/.test(v);
const wid = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
const TYPES = ['art.draw.object', 'art.draw.sel', 'art.draw.last', 'art.draw.scene'];
const HANDLED = new Set(['objects', 'selected', 'last', 'history', 'future', 'background', 'sky', 'ground', 'groundColor', 'mood', 'nextId', 'lastLabel']);   // the rest is in `art.draw.scene`'s `rest`

const objOf = (w) => JSON.parse(dec(w.attrs.obj[0]));
const byOrd = (ws) => ws.map((w) => ({ w, i: Number(w.attrs.ord?.[0] ?? w.attrs.i?.[0] ?? 0) })).sort((a, b) => a.i - b.i).map((x) => x.w);

/** The state ops.mjs keeps (the tab reads it), derived from the wires: the same keys in the same order (the undo history is the library's, so it has none). */
export function toState({ find }) {
  const sc = find('art.draw.scene')[0];
  if (!sc) return initialState();
  const s = initialState();
  s.objects = byOrd(find('art.draw.object')).map(objOf);
  s.background = tok(sc, 'background')[0];
  s.sky = tok(sc, 'sky')[0] ?? null; s.ground = tok(sc, 'ground')[0] ?? null; s.groundColor = tok(sc, 'gcolor')[0] ?? null; s.mood = tok(sc, 'mood')[0] ?? null;
  s.selected = tok(find('art.draw.sel')[0], 'oid')[0] ?? null;
  s.last = byOrd(find('art.draw.last')).map((w) => tok(w, 'oid')[0]);
  s.nextId = Number(tok(sc, 'nextid')[0]);
  Object.assign(s, JSON.parse(tok(sc, 'rest')[0]));
  if (tok(sc, 'label')[0]) s.lastLabel = tok(sc, 'label')[0];
  delete s.history; delete s.future;
  const ordered = {};
  for (const k of Object.keys(initialState())) if (k in s) ordered[k] = s[k];
  for (const k of Object.keys(s)) if (!(k in ordered)) ordered[k] = s[k];
  return ordered;
}

const canon = (attrs) => JSON.stringify(Object.keys(attrs ?? {}).filter((k) => !k.startsWith('core.')).sort().map((k) => [k, attrs[k]]));

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }. */
function wiresOf(s) {
  const out = {}, used = new Set();   // a wire is the thing's id; a second thing with the same id gets its place in the name (and the rules refuse the state)
  (s.objects ?? []).forEach((o, ord) => {
    const a = { oid: [str(o.id)], ord: [String(ord)], kind: [atomOk(o.kind) ? o.kind : 'unknown'], color: [str(effectiveColor(o) ?? 'none')], obj: [str(JSON.stringify(o))] };
    for (const k of ['x', 'y', 'size', 'rotation', 'z']) if (isNum(o[k])) a[k] = [num(o[k])];
    if (atomOk(o.fill)) a.fill = [o.fill];
    if (atomOk(o.tag)) a.tag = [o.tag];
    if (typeof o.flip === 'boolean') a.flip = [String(o.flip)];
    let id = `ad.o_${wid(o.id)}`;
    if (used.has(id)) id = `${id}_${ord}`;
    used.add(id);
    out[id] = { type: 'art.draw.object', attrs: a };
  });
  if (s.selected) out['ad.sel'] = { type: 'art.draw.sel', attrs: { oid: [str(s.selected)] } };
  (s.last ?? []).forEach((id, i) => { out[`ad.ls_${wid(id)}`] = { type: 'art.draw.last', attrs: { oid: [str(id)], i: [String(i)] } }; });
  const label = s.history?.length ? s.history.at(-1).label ?? '' : s.lastLabel ?? '';   // the words of the step the operations just took (what "undo" names)
  const rest = {};
  for (const k of Object.keys(s).filter((x) => !HANDLED.has(x))) rest[k] = s[k];
  const sc = { background: [str(s.background ?? 'white')], nextid: [String(s.nextId ?? 1)], rest: [str(JSON.stringify(rest))] };
  if (s.sky) sc.sky = [str(s.sky)];
  if (atomOk(s.ground)) sc.ground = [s.ground];
  if (s.groundColor) sc.gcolor = [str(s.groundColor)];
  if (atomOk(s.mood)) sc.mood = [s.mood];
  if (label) sc.label = [str(label)];
  out['ad.scene'] = { type: 'art.draw.scene', attrs: sc };
  return out;
}

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }] } (a wire that already says it is left alone).
 * A wire whose single values changed is set in place (a thing that moved: x and y); a wire that gained or lost a key is told under a new id and the old one retracted.
 */
export function adopt({ state, find, inPlace = true }) {
  const want = wiresOf(state);
  const have = new Map();
  for (const t of TYPES) for (const w of find(t)) {
    const m = /^(.+)\.(\d+)$/.exec(w.id);
    const base = m ? m[1] : w.id, rev = m ? Number(m[2]) : 0;
    if (!have.has(base) || have.get(base).rev < rev) have.set(base, { id: w.id, rev, wire: w });
  }
  const retract = [], tell = [], sets = [], same = new Set();
  const keys = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
  for (const [base, h] of have) {
    const w = want[base];
    if (!w || canon(h.wire.attrs) === canon(w.attrs)) { if (!w) retract.push(h.id); continue; }
    const single = inPlace && h.wire.type === w.type && keys(h.wire.attrs) === keys(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.wire.attrs[k] ?? []).length === 1);
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

/** A cheap text that changes when the picture does (the host compares it instead of stringifying the undo snapshots the operations keep). */
export function stateKey(s) {
  const { history, future, ...rest } = s;
  return JSON.stringify([rest, history?.length ?? 0, history?.at(-1)?.label ?? null]);
}

// ---- a request whose target is not on the board ---------------------------------------------------------------------------------------------------------
const TARGET = {   // the argument that says what the request is about
  'draw.recolor': (a) => a.t, 'draw.resize': (a) => a.t, 'draw.setSize': (a) => a.t, 'draw.fill': (a) => a.t, 'draw.duplicate': (a) => a.t, 'draw.select': (a) => a.t,
  'draw.near': (a) => a.t, 'draw.colorOf': (a) => a.t, 'draw.move': (a) => splitDest(a.phrase ?? '').target,
};
const noun = (np) => np.known && !np.pron && !np.special && !np.part && !np.partOf && !np.loc && !np.pos && !np.ordinal && np.kind && np.kind !== '*' && drawingNP(np);

/**
 * Refuses a request about a thing that is not in the picture, with the reason the rules give: { status: 'missing', note }, or null. Only a plain noun phrase
 * ("the green circle", "a big cat") is asked; everything else the request names ("it", "the one on the left", the roof of ...) the operations resolve as before, and
 * so does the hint they give when the kind is there in other colours.
 */
export function guard({ action, args, check }) {
  const text = TARGET[action]?.(args ?? {});
  if (text == null || text === '') return null;
  const np = parseNP(text);
  if (!noun(np)) return null;
  const r = check({ wires: `@dr.q art.draw.want kind=${np.kind} label=${str(describeWanted(np))}` });
  if (r.ok) return null;
  const vs = (r.violations ?? []).filter((x) => x.why);
  const v = vs.find((x) => /is empty/.test(x.why)) ?? vs[0];
  return v ? { status: 'missing', note: v.why, why: v.why } : null;
}

// ---- what is in the picture: counts from the derived wires ---------------------------------------------------------------------------------------------------
const mods = (args) => ['m1', 'm2'].map((k) => args[k]).filter(Boolean).map((x) => String(x).toLowerCase());
const numberOf = (w) => Number(tok(w, 'n')[0] ?? 0);
function need(ctx, raw) {
  const args = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, un(v)]));
  const k = kindOfWord(args.kt ?? args.kind);
  if (!k) return { err: { status: 'unsupported', note: `I do not know what "${args.kind}" is.` } };
  const color = colorFrom(mods(args).filter((m) => isShade(m) || isColorWord(m)));
  const all = ctx.find('art.draw.object');
  const mine = byOrd(all.filter((w) => (k.kind === '*' || tok(w, 'kind')[0] === k.kind) && (!color || sameColorName(tok(w, 'color')[0], color))));
  // the number is the library's (the tallies are aggregates of the rules); the object wires are what the answer rests on
  let n = 0;
  if (k.kind === '*' && !color) n = numberOf(ctx.find('art.draw.total')[0]);
  else if (color) n = mine.length;   // a colour is any of 260 names ("dark blue"): counted over the wires, not a group of its own (a group per colour is a rule per name)
  else n = numberOf(ctx.find('art.draw.tally').find((w) => tok(w, 'kind')[0] === k.kind));
  return { k, color, n, mine, all };
}
function drCount(ctx, raw) {
  const { err, k, color, n, mine, all } = need(ctx, raw);
  if (err) return err;
  const desc = `${color ? `${color} ` : ''}${k.kind === '*' ? 'things' : pluralOfKind(k.kind, 2)}`;
  const from = mine.map((w) => w.id);
  if (k.kind === '*') return { value: n === 0 ? (all.length ? `There is nothing ${color ?? ''} in your picture.`.replace('  ', ' ') : 'Your picture is empty. There is nothing in it yet.') : `There ${n === 1 ? `is 1 ${color ? `${color} ` : ''}thing` : `are ${n} ${desc}`} in your picture.`, from, openTab: 'draw' };
  return { value: n === 0 ? `There are no ${desc} in your picture.` : `There ${n === 1 ? `is 1 ${color ? `${color} ` : ''}${k.kind}` : `are ${n} ${desc}`} in your picture.`, from, openTab: 'draw' };
}
function drExists(ctx, raw) {
  const { err, k, color, n, mine } = need(ctx, raw);
  if (err) return err;
  const name = `${color ? `${color} ` : ''}${k.kind === '*' ? 'thing' : k.kind}`;
  if (!n) return { value: `No, there is no ${name} in your picture yet.`, from: [], openTab: 'draw' };
  return { value: `Yes! There ${n === 1 ? `is ${a_(name)} ${name}` : `are ${n} ${pluralOfKind(name.split(' ').at(-1), n)}`} ${n === 1 ? placePhrase(objOf(mine[0])) : 'in your picture'}.`.replace(/ here\./, '.'), from: mine.map((w) => w.id), openTab: 'draw' };
}
export const fns = { drCount, drExists };

// ---- undo and redo: the session timeline, in the words of the board -----------------------------------------------------------------------------------------------
/** What "undo" and "redo" say once the library went back (or forward). `before` is null when there was nothing to take back. */
export function undoWords({ before, redo, steps }) {
  if (!before) return { status: 'missing', note: redo ? 'There is nothing to redo.' : 'There is nothing to undo.' };
  if (redo) return { value: 'OK, I did it again.', openTab: 'draw' };
  const label = before.lastLabel;
  return { value: `OK, I undid it${steps > 1 ? ` (${steps} changes)` : label ? ` (${label})` : ''}.`, openTab: 'draw' };
}

const content = (s) => JSON.stringify([s?.objects, s?.background, s?.sky, s?.ground, s?.groundColor, s?.mood, s?.sunStash]);
/** Did the step only move what the user looks at (the selection, what "it" means)? Then "undo" does not count it: the board's history only ever held changes to the picture. */
export function isView({ before, after }) { return !!before && !!after && content(before) === content(after); }
