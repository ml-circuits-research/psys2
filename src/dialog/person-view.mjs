// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The view of the person of the session (spec 23 "The person of the session"): what a host shows in Settings › Privacy, computed from the state of
 * session.things (`person`: the user's own keys `me` and the told lines) by the declared rows of worlds/app.project/person-view.sop. This module names
 * no type or slot: each row says which facts fill it. Only the small SOP parser of src/soplang: the page's main thread reads it without the engine.
 *
 *   personView(state) -> [{ label, values: [text] }]   (state: a session.things state or its `person`; rows with no value are left out)
 */
import { parse } from '../soplang/index.mjs';
import ROWS from '../../worlds/app.project/person-view-source.mjs';

const valueOf = (v) => (v?.kind === 'string' || v?.kind === 'atom' ? v.v : v?.v != null ? String(v.v) : undefined);
const facts = (text) => parse(String(text ?? '')).wires.map((w) => {
  const attrs = {};
  for (const e of w.entries ?? []) (attrs[e.key] ??= []).push(valueOf(e.value));
  return { type: w.type, attrs };
});
let rows = null;
const declared = () => rows ??= facts(ROWS).filter((f) => f.type === 'app.person.row').map(({ attrs: a }) => ({ label: a.label[0], of: a.of[0], key: a.key[0], with: a.with?.[0], where: a.where?.[0], is: a.is?.[0], many: a.many?.[0] === 'true', order: Number(a.order[0]) })).sort((x, y) => x.order - y.order);

/** The declared rows filled from the told facts, in order. */
export function personView(state) {
  const p = state?.person ?? state;
  // The user's own keys (`me`) are the first fact of each type that declares those slots.
  const me = Object.entries(p?.me ?? {}).filter(([, v]) => v != null);
  const told = facts((p?.lines ?? []).join('\n'));
  const out = [];
  for (const row of declared()) {
    const own = me.length ? [{ type: row.of, attrs: Object.fromEntries(me.map(([k, v]) => [k, (Array.isArray(v) ? v : [v]).map(String)])) }] : [];
    const lines = [...own, ...told].filter((f) => f.type === row.of && f.attrs[row.key]?.length);
    // The latest fact for a value decides whether it holds (a count said again, a taste said with the other stance).
    const latest = new Map();
    for (const f of lines) for (const v of f.attrs[row.key]) { latest.delete(v); latest.set(v, f); }
    const values = [...latest].filter(([, f]) => !row.where || f.attrs[row.where]?.[0] === row.is).map(([v, f]) => (row.with ? `${f.attrs[row.with]?.[0] ?? 1} × ${v}` : v));
    const shown = row.many ? values : values.slice(-1);
    if (shown.length) out.push({ label: row.label, values: shown });
  }
  Object.defineProperty(out, 'said', { value: p?.said ?? {}, enumerable: false });   // the user's words for the things (replies only; not part of the view)
  return out;
}
