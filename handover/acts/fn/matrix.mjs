// SPDX-License-Identifier: AGPL-3.0-only
// A schema world on the matrix reasoner, natively (spec 21 section 9; spec 15). The acts are still applied by the executor (ops.mjs: the generic executor over `state.items`), and the library
// takes the state over after every operation, like the drawing board does (worlds/art.draw/fns.mjs): one `<ns>.item` wire per item (kind, number, name, place, one slot per attribute and
// the item itself as a blob, so the state is derived back without loss), one `<ns>.state` wire for the rest of the state (counters, focus, saved states, the log), and the rules of
// the schema as library rules: a number outside its range, two items with one id, an item of a kind that is not in the schema are refused with the reason; the number of items and the
// number of each kind are derived. Undo and redo are the session timeline's. Generated files (`matrix.sop`, `fns.mjs`, `matrix.templates.sop`) are written by
// scripts/build-schema-world.mjs from schema.sop; nothing here names a world. Browser-safe, no imports.

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const tok = (w, k) => (w?.attrs?.[k] ?? []).map((t) => dec(t));
const wid = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
const atomOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_]+$/.test(v);
const canon = (attrs) => JSON.stringify(Object.keys(attrs ?? {}).filter((k) => !k.startsWith('core.')).sort().map((k) => [k, attrs[k]]));
const REST_KEYS = ['counter', 'history', 'future', 'saved', 'log', 'links', 'groups', 'focus', 'outbox', 'lastAct', 'pending', 'inputMode', 'stepGroup'];

/** Generated `matrix.sop` of a schema: the slots, the refusals (a number outside its range, an id used twice, a kind the schema does not have) and the tallies. `ns` is the world's namespace, `pre` a short unique prefix for the wire ids. */
export function matrixSop(schema, ns, pre = ns.replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'w') {
  const kinds = Object.values(schema.kinds), attrs = Object.values(schema.attrs);
  const L = [];
  L.push(`# ${ns} as a matrix (GENERATED from schema.sop by scripts/build-schema-world.mjs, spec 21 section 9; never edited by hand): the items are wires, the rules of the schema refuse what cannot be.`);
  L.push('', `@${pre}.seq core.sequence key=core.seq`, '');
  const slot = (id, type, key, extra) => `@${pre}.k.${id} core.slot of=${ns}.${type} key=${key} ${extra}`;
  L.push(slot('i.iid', 'item', 'iid', 'kind=string required=true'), slot('i.ord', 'item', 'ord', 'kind=integer required=true'), slot('i.kind', 'item', 'kind', `kind=atom enum=${kinds.map((k) => k.name).join(' enum=')} required=true`));
  L.push(slot('i.n', 'item', 'n', 'kind=integer'), slot('i.name', 'item', 'name', 'kind=string'), slot('i.place', 'item', 'place', 'kind=string'), slot('i.obj', 'item', 'obj', 'kind=blob required=true'));
  for (const a of attrs) {
    const kind = a.type === 'number' ? 'kind=number' : a.type === 'bool' ? 'kind=boolean' : 'kind=string';
    L.push(slot(`a.${wid(a.name)}`, 'item', a.name, kind));
  }
  L.push(slot('s.rest', 'state', 'rest', 'kind=blob required=true'), slot('s.ver', 'state', 'ver', 'kind=integer'));
  L.push('', '# ---- what cannot be');
  L.push(`@${pre}.o1 ${ns}.item iid=?i`, `@${pre}.o2 ${ns}.item iid=?i`, `@${pre}.t.diff core.check fn=neq args=$${pre}.o1 args=$${pre}.o2`, `@${pre}.d.twice core.deny when=$${pre}.o1 when=$${pre}.o2 if=$${pre}.t.diff why="Two things in the ${schema.noun} have the same id, ?i."`);
  for (const a of attrs.filter((x) => x.type === 'number')) {
    const w = wid(a.name);
    if (a.min != null) L.push(`@${pre}.lo.${w} ${ns}.item ${a.name}=?v kind=?k`, `@${pre}.t.lo.${w} core.check fn=lt args=?v args=${a.min}`, `@${pre}.d.lo.${w} core.deny when=$${pre}.lo.${w} if=$${pre}.t.lo.${w} why="A ?k cannot have ${a.name} below ${a.min}."`);
    if (a.max != null) L.push(`@${pre}.hi.${w} ${ns}.item ${a.name}=?v kind=?k`, `@${pre}.t.hi.${w} core.check fn=gt args=?v args=${a.max}`, `@${pre}.d.hi.${w} core.deny when=$${pre}.hi.${w} if=$${pre}.t.hi.${w} why="A ?k cannot have ${a.name} above ${a.max}."`);
  }
  L.push('', '# ---- what is there: the number of items and of each kind');
  L.push(slot('tt.n', 'total', 'n', 'kind=integer'), slot('t.kind', 'tally', 'kind', 'kind=atom'), slot('t.n', 'tally', 'n', 'kind=integer'));
  L.push(`@${pre}.sc ${ns}.state`, `@${pre}.oo ${ns}.item`, `@${pre}.c.all core.calc out=?na fn=count over=$${pre}.oo`, `@${pre}.tt ${ns}.total n=?na`, `@${pre}.r.tt core.rule when=$${pre}.sc with=$${pre}.c.all then=$${pre}.tt`);
  L.push(`@${pre}.ok ${ns}.item kind=?k`, `@${pre}.tk ${ns}.tally kind=?k n=?nk`, `@${pre}.ag.k core.aggregate over=$${pre}.ok by=?k groups=${kinds.map((k) => k.name).join(' groups=')} count=?nk then=$${pre}.tk`);
  return `${L.join('\n')}\n`;
}

/** Generated `matrix.templates.sop`: a refusal of the library is said as its reason. */
export function matrixTemplates(schema, ns) {
  const acts = [...schema.acts].filter((a) => !['undo', 'redo', 'ask', 'save', 'send'].includes(a));
  return `${acts.map((a) => `@tpl.${ns}.${a}.m.refused core.template\n    for=op.${ns}.${a}\n    status=conflicting\n    text="{note}"\n`).join('\n')}`;
}

/** { toState, adopt, stateKey } for a schema world whose state is `state.items`. */
export function createMatrixFns(schema, ns) {
  const TYPES = [`${ns}.item`, `${ns}.state`];
  const attrNames = Object.keys(schema.attrs);
  const wiresOf = (state) => {
    const out = {};
    if (state.items === undefined) return out;   // the world was never used in this session: no wires, so a turn of another world is never a step of this one
    const items = state.items;
    items.forEach((it, i) => {
      const a = { iid: [str(it.id)], ord: [String(i)], kind: [atomOk(it.kind) ? it.kind : str(it.kind)], obj: [str(JSON.stringify(it))] };
      if (it.n != null) a.n = [String(Number(it.n))];
      if (it.name != null) a.name = [str(it.name)];
      if (it.place != null) a.place = [str(typeof it.place === 'string' ? it.place : JSON.stringify(it.place))];
      for (const k of attrNames) {
        const v = it.attrs?.[k];
        if (v === undefined || v === null) continue;
        const t = schema.attrs[k].type;
        a[k] = [t === 'number' ? (Number.isFinite(Number(v)) ? String(Number(v)) : str(v)) : t === 'bool' ? (v ? 'true' : 'false') : str(v)];
      }
      out[`${ns.replace(/[^A-Za-z0-9]/g, '_')}_i_${wid(it.id)}`] = { type: `${ns}.item`, attrs: a };
    });
    const rest = {}; for (const k of REST_KEYS) if (state[k] !== undefined && !['history', 'future'].includes(k)) rest[k] = state[k];
    for (const k of Object.keys(state)) if (k !== 'items' && !REST_KEYS.includes(k) && !['history', 'future'].includes(k)) rest[k] = state[k];
    out[`${ns.replace(/[^A-Za-z0-9]/g, '_')}_state`] = { type: `${ns}.state`, attrs: { rest: [str(JSON.stringify(rest))], ver: ['1'] } };
    return out;
  };
  /** The state the executor keeps, derived from the wires (the undo history is the library's, so it has none). */
  function toState({ find }) {
    const items = find(`${ns}.item`).map((w) => ({ w, i: Number(w.attrs.ord?.[0] ?? 0) })).sort((a, b) => a.i - b.i).map((x) => JSON.parse(dec(x.w.attrs.obj[0])));
    const sc = find(`${ns}.state`)[0];
    const rest = sc ? JSON.parse(tok(sc, 'rest')[0]) : {};
    return { items, ...rest, history: [], future: [] };
  }
  function adopt({ state, find, inPlace = true }) {
    const want = wiresOf(state);
    const have = new Map();
    for (const t of TYPES) for (const w of find(t)) have.set(w.id, { id: w.id, wire: w });
    const retract = [], tell = [], sets = [], replace = [];
    const keys = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
    for (const [base, h] of have) {
      const w = want[base];
      if (!w || canon(h.wire.attrs) === canon(w.attrs)) { if (!w) retract.push(h.id); continue; }
      const single = inPlace && h.wire.type === w.type && keys(h.wire.attrs) === keys(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.wire.attrs[k] ?? []).length === 1);
      if (!single) { replace.push({ id: h.id, type: w.type, attrs: w.attrs }); continue; }
      for (const [k, vs] of Object.entries(w.attrs)) if (h.wire.attrs[k][0] !== vs[0]) sets.push({ id: h.id, key: k, value: vs[0] });
    }
    for (const [base, w] of Object.entries(want)) if (!have.has(base)) tell.push(`@${base} ${w.type} ${Object.entries(w.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`);
    return { retract, tell: tell.join('\n'), sets, replace };
  }
  const stateKey = (s) => { const { history, future, ...rest } = s; return JSON.stringify([rest, history?.length ?? 0, history?.at(-1)?.reply ?? null]); };
  // a step that changed no item (a refusal, a question, a selection) is not counted by "undo": the executor's history only ever held changes to the items
  const content = (st) => JSON.stringify([st?.items, st?.links, st?.groups]);
  const isView = ({ before, after }) => !!before && !!after && content(before) === content(after);
  return { toState, adopt, stateKey, isView };
}
export { un };
