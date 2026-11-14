// SPDX-License-Identifier: AGPL-3.0-only
// The acts on a view's own attributes (zoom, centre, the layer shown), by the library (sopworld 0.40, `std.schema.view name= state=<kind>` + `change` / `ask` with no thing: "zoom in" names none).
// The state of the view is the HOST's (a map keeps `zoom`, `center`, `layer` in its session state, off the wires); this bridge declares the view kind of a schema to the library ONCE (the kind's attributes
// as slots: type, bounds, step, default, enum values), PROJECTS the host's current values to the view's wire for one act (a fork of the declaration: nothing is kept), lets the library check the value
// (bounds, enum) and compute it (`by=more|less`, `amount=`), and gives the new values back for the host to write. The words of the replies and the effects on the rest of the state (the bounds of
// the picture, the focus) stay the host's. Browser-safe: no `node:*`.
import { World } from '../../lib/vendor/sopworld/sopworld.mjs?v=8afa911bd6';

const slotOf = (a) => {
  const base = `@s.${a.name} core.slot of=VIEW key=${a.name}`;
  if (a.type === 'number') return `${base} kind=number${a.min != null ? ` min=${a.min}` : ''}${a.max != null ? ` max=${a.max}` : ''} step=${a.step ?? 1}${a.def != null ? ` default=${a.def}` : ''}`;
  if (a.type === 'enum') return `${base} ${a.values.map((v) => `enum=${v}`).join(' ')}${a.def != null ? ` default=${a.def}` : ''}`;
  if (a.type === 'bool') return `${base} kind=boolean`;
  return `${base} kind=any`;
};

/** viewOf(schema, kindName) -> { change(values, args), ask(values, args), attrs, by(word), reset(word) } for the kind of the schema that holds the view's own attributes. */
export function viewOf(schema, kindName = 'view') {
  const attrs = Object.values(schema.attrs).filter((a) => a.of.includes(kindName));
  if (!schema.kinds[kindName] || !attrs.length) return null;
  const ns = schema.id.replace(/[^a-z0-9]+/gi, '_');
  const type = `${ns}.view`;
  const base = new World();
  base.load([`@acts core.use world=std.acts`, `@w std.schema.world name=${ns}`, `@t core.type of=${type} extends=std.schema.thing closed=true`,
    ...attrs.map((a) => slotOf(a).replace('of=VIEW', `of=${type}`)),
    `@k std.schema.kind of=${type} world=${ns} acts=change acts=ask`, `@v std.schema.view name=${ns} shows=none state=${type}`].join('\n'));
  const wire = (values) => `@view_${ns} ${type} kind=${type} world=${ns} ${Object.entries(values).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${typeof v === 'string' ? v.replace(/[^A-Za-z0-9_.-]+/g, '_') : v}`).join(' ')}`;
  const act = (action, values, args) => {
    const w = base.fork();
    w.tell(wire(values));
    const r = w.act({ action, args });
    const now = w.get(`view_${ns}`)?.attrs ?? {};
    const out = Object.fromEntries(attrs.map((a) => [a.name, now[a.name]?.[0]]).map(([k, v]) => [k, v === undefined ? undefined : (schema.attrs[k].type === 'number' ? Number(v) : v)]));
    return { ok: !!r.ok, result: r.result, why: r.violations?.[0]?.why, values: out };
  };
  const words = (field) => new Map(attrs.flatMap((a) => (a[field] ?? []).map((w) => [w, a.name])));
  const more = words('stepMore'), less = words('stepLess'), reset = words('reset');
  return {
    attrs,
    /** a said word that steps an attribute ("back" lowers the zoom: `step_less`) or resets it ("normal": `reset`) */
    stepOf: (w) => (more.has(w) ? { attr: more.get(w), by: 'more' } : less.has(w) ? { attr: less.get(w), by: 'less' } : reset.has(w) ? { attr: reset.get(w), reset: true } : null),
    /** change one attribute: { attr, value } or { attr, by: 'more' | 'less', amount? }; a value out of its bounds is clamped to the bound (the library names it in `why`) */
    change(values, args) {
      let r = act('change', values, args);
      const m = /^must be at (least|most) (-?[\d.]+)/.exec(r.why ?? '');
      if (m && args.attr) { const to = Number(m[2]); r = { ...act('change', values, { attr: args.attr, value: to }), clamped: m[1] === 'least' ? 'min' : 'max' }; }
      return r;
    },
    ask: (values, args) => act('ask', values, args),
    /** the default of an attribute, as the schema declares it */
    defaultOf: (name) => schema.attrs[name]?.def,
  };
}
