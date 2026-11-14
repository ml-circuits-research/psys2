// SPDX-License-Identifier: AGPL-3.0-only
// Questions over the attributes and relations of things, answered by the library (sopworld 0.38+, `ask thing= attr=` / `ask thing= rel= of=` / `ask kind= rel= of=`; the answer has a `shape`: number with
// a unit, list, value, yes/no, none). The things are the HOST's (a map's index of places built from the catalog, a thing of Talk read from the knowledge records, the items of a seating plan): this bridge
// declares the kind of a schema to the library ONCE (its attributes as slots: type, many), PROJECTS the host's things to `std.schema.thing` wires (once per list of things: the projection is kept on the list
// that was given, so a new catalog index is a new projection), and asks. The words of the answer stay the host's: the library says WHAT is true (a list, a number, yes or no), the host says it in a sentence.
// Browser-safe: no `node:*`.
import { World } from '../../lib/vendor/sopworld/sopworld.mjs?v=900699a034';

const q = (v) => `"${String(v).replace(/"/g, "'").replace(/\s+/g, ' ')}"`;
const slotOf = (type, a) => `@s.${a.name} core.slot of=${type} key=${a.name} ${a.type === 'number' ? 'kind=number' : a.type === 'bool' ? 'kind=boolean' : 'kind=any'}${a.many ? ' many=true' : ''}`;

/**
 * askBridge(kind, attrs) -> { ask(things, args) }
 *   kind    the library type of the things ('place')
 *   attrs   [{ name, type: 'number' | 'bool' | 'text', many? }]: the attributes a thing may have; null: the keys of each thing are its own (the records of a knowledge base: no schema, every value a word)
 *   things  [{ id, name?, attrs: { key: value | [values] } }]: the host's things; a value that is undefined or empty is left out (the thing does not have it)
 *   args    { thing, attr } | { thing, rel, of } | { kind, rel, of } | { kind, count: true }, as the library's act `ask`
 * -> { ok, shape, number?, values, answer?, things?, why? } (`values`: the list, or the one value unquoted)
 */
export function askBridge(kind, attrs) {
  const base = new World();
  base.load(['@acts core.use world=std.acts', `@w std.schema.world name=${kind}`, `@t core.type of=${kind} extends=std.schema.thing${attrs ? ' closed=true' : ''}`, ...(attrs ?? []).map((a) => slotOf(kind, a)),
    `@k std.schema.kind of=${kind} world=${kind} acts=ask`].join('\n'));
  const projected = new WeakMap();
  const worldOf = (things) => {
    let w = projected.get(things);
    if (w) return w;
    w = base.fork();
    const lines = [];
    for (const t of things) {
      let line = `@${t.id} std.schema.thing kind=${kind}`;
      if (t.name) line += ` name=${q(t.name)}`;
      for (const a of attrs ?? Object.keys(t.attrs ?? {}).filter((k) => /^[a-z][a-z0-9_]*$/i.test(k)).map((k) => ({ name: k, type: 'text' }))) {
        const v = t.attrs?.[a.name];
        for (const x of [].concat(v ?? [])) if (x !== undefined && x !== null && x !== '') line += ` ${a.name}=${a.type === 'number' || a.type === 'bool' ? x : q(x)}`;
      }
      lines.push(line);
    }
    w.tell(lines.join('\n'));
    projected.set(things, w);
    return w;
  };
  const unq = (s) => String(s).replace(/^"|"$/g, '');
  return {
    ask(things, args) {
      const r = worldOf(things).act({ action: 'ask', args });
      if (!r.ok) return { ok: false, shape: 'none', values: [], why: r.violations?.[0]?.why };
      const x = r.result;
      return { ok: true, shape: x.shape, number: x.number, unit: x.unit, answer: x.answer, things: x.things, names: x.names, count: x.count,
        values: x.values ? x.values.map(unq) : x.value != null ? [unq(x.value)] : [] };
    },
  };
}
