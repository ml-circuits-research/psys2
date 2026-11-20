// SPDX-License-Identifier: AGPL-3.0-only
// A tool whose state is a SOP instance world. Nothing here knows a tab or an operation:
//  1. a native command is told into a fork of the world as app.act.request (+ app.act.item per list element);
//  2. the tab's authored rules derive ordered app.act.call facts (make, change, remove) and app.act.view facts;
//  3. this interpreter runs the calls through the library's generic acts (World.act) and keeps the resulting
//     instance facts and the view keys as the tool state. Undo and redo belong to the application's journal.
// The objects a reader observes come from app.observe.object facts the same rules derive.
import {parse, quote, serialize, str} from '../lib/vendor/sopworld/sopworld.mjs?v=d7baa85342';
import {createNativeToolHost, nativeToken} from './native-tool-host.mjs?v=88ae92bf04';

const CALLS = 512;
const atom = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const token = (value) => typeof value === 'number' && Number.isFinite(value) ? String(value)
  : typeof value === 'boolean' ? String(value) : typeof value === 'string' && atom.test(value) ? value : quote(String(value));
const read = (fact, key) => { const raw = fact.attrs[key]?.[0]; return raw === undefined ? undefined : raw.startsWith('"') ? str(raw) : raw; };
// A fact value as a typed value: quoted text stays text; true/false and numbers keep their type.
const typed = (raw) => raw.startsWith('"') ? str(raw) : raw === 'true' ? true : raw === 'false' ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
const ref = (raw) => typeof raw === 'string' && raw.startsWith('$') ? raw.slice(1) : raw;

/** The instance facts of the world: every fact of a kind its schema declares for the instance world. */
function instanceFacts(world, kinds) {
  const rows = [];
  for (const kind of kinds) for (const fact of world.ofType(kind)) if (fact.type === kind) rows.push(fact);
  return serialize(rows);
}

/** The first state: the instance things made by the same generic acts as every later change. */
export function initialSopWorldState(base, { kinds, make = [] } = {}) {
  const world = base.fork();
  for (const args of make) { const made = world.act({ action: 'make', args }); if (!made.ok) throw Error('invalid-initial-thing'); }
  return { sop: instanceFacts(world, kinds), runtime: { view: {} } };
}

/** A world holding the current state, derived facts included (projection, observation). */
export function worldOf(base, state) {
  const world = base.fork();
  if (state.sop) { const told = world.tell(state.sop, { factsOnly: true }); if (!told.ok) throw Error('invalid-state'); }
  // The view keys (selection, ID display) are facts too, so rules can observe them.
  const view = Object.entries(state.runtime?.view ?? {}).filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value], n) => ({ id: 'area.view.' + n, type: 'app.area.view', attrs: { key: [token(key)], value: [token(value)] } }));
  if (view.length && !world.tell(serialize(view), { factsOnly: true }).ok) throw Error('invalid-view');
  return world;
}

function compile(base, state, operation, args) {
  const world = worldOf(base, state);
  const request = { id: 'act.request', type: 'app.act.request', attrs: { operation: [quote(operation)] } };
  const items = [];
  for (const [key, value] of Object.entries(args)) {
    if (Array.isArray(value)) value.forEach((element, index) => items.push({ id: 'act.item.' + items.length, type: 'app.act.item',
      attrs: { request: ['$act.request'], param: [quote(key)], n: [String(index)], value: [token(element)] } }));
    else if (value !== undefined && value !== null) request.attrs[key] = [token(value)];
  }
  const told = world.tell(serialize([request, ...items]), { factsOnly: true });
  if (!told.ok) return { world, calls: [], views: [], refusal: 'invalid-request' };
  // An optional argument arrives as app.act.arg call=<label> attr=<key> value=<v> and joins the call with that ref.
  const extra = new Map();
  for (const arg of world.ofType('app.act.arg')) (extra.get(read(arg, 'call')) ?? extra.set(read(arg, 'call'), []).get(read(arg, 'call'))).push(arg);
  const calls = world.ofType('app.act.call').map((fact) => {
    const args = extra.get(read(fact, 'ref')) ?? [];
    const attrs = { ...fact.attrs }, seen = new Set();
    for (const arg of args) { const key = read(arg, 'attr'); attrs[key] = [...(seen.has(key) ? attrs[key] : []), ...arg.attrs.value]; seen.add(key); }
    const merged = args.length ? { ...fact, attrs } : fact;
    return { fact: merged, order: Number(read(fact, 'order') ?? 0) };
  }).sort((a, b) => a.order - b.order || (a.fact.id < b.fact.id ? -1 : a.fact.id > b.fact.id ? 1 : 0)).map(({ fact }) => fact);
  const refusals = world.ofType('app.act.refuse').map((fact) => read(fact, 'reason'));
  return { calls, views: world.ofType('app.act.view'), refusal: refusals[0] };
}

function run(base, state, kinds, calls) {
  const world = worldOf(base, state);
  const made = new Map();
  if (calls.length > CALLS) return { refusal: 'call-budget' };
  for (const call of calls) {
    const act = read(call, 'act'), args = {};
    for (const [key, values] of Object.entries(call.attrs)) {
      if (['act', 'order', 'ref'].includes(key)) continue;
      const one = (raw) => raw.startsWith('$') ? (made.get(ref(raw)) ?? ref(raw)) : ['kind', 'attr'].includes(key) ? (raw.startsWith('"') ? str(raw) : raw) : raw;
      args[key] = values.length > 1 ? values.map(one) : one(values[0]);
    }
    if (act === 'make' && args.thing === undefined) {
      const before = new Set(world.ofType(args.kind).map((fact) => fact.id));
      const result = world.act({ action: 'make', args: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, k === 'kind' ? v : Array.isArray(v) ? v.map((x) => world.has(String(x)) ? '$' + x : x) : world.has(String(v)) ? '$' + v : v])) });
      if (!result.ok) return { refusal: result.violations?.[0]?.why ?? 'refused' };
      const created = world.ofType(args.kind).find((fact) => !before.has(fact.id));
      if (created && call.attrs.ref) made.set(read(call, 'ref'), created.id);
    } else {
      // A value naming a thing of the world is a reference, as in make.
      if (args.value !== undefined) args.value = Array.isArray(args.value) ? args.value.map((x) => world.has(String(x)) ? '$' + x : x) : world.has(String(args.value)) ? '$' + args.value : args.value;
      const result = world.act({ action: act, args });
      if (!result.ok) return { refusal: result.violations?.[0]?.why ?? 'refused' };
    }
  }
  return { sop: instanceFacts(world, kinds) };
}

/**
 * base: a World with the instance schema, knowledge, the tab's act rules and observation projection loaded.
 * kinds: the instance kinds kept as state. toolInterface/operations: the declared native interface.
 */
export function createSopWorldHost({ base, kinds, state, instanceId, scope, toolInterface, operations, spatialObservation = false, ...limits }) {
  const declared = toolInterface?.bindings ?? operations;
  const handler = (operation) => (ctx, args) => {
    const s = ctx.state, r = (s.runtime ??= { view: {} }), compiled = compile(base, s, operation, args);
    if (compiled.refusal) return { status: 'missing', code: compiled.refusal };
    for (const view of compiled.views) r.view = { ...r.view, [read(view, 'key')]: read(view, 'value') ?? null };
    if (!compiled.calls.length) return { status: 'supported', changed: compiled.views.length ? ['view'] : [] };
    const result = run(base, s, kinds, compiled.calls);
    if (result.refusal) return { status: 'missing', code: result.refusal };
    // What changed: the observed objects that appeared, went or differ (their ids, as tools and focus use them).
    const before = new Map(view(s).map((object) => [object.id, JSON.stringify(object)]));
    s.sop = result.sop;
    const after = new Map(view(s).map((object) => [object.id, JSON.stringify(object)]));
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id));
    return { status: 'supported', changed: changed.length ? changed : compiled.calls.map((call) => read(call, 'act')) };
  };
  const handlers = Object.fromEntries(declared.map((op) => [op.id, handler(op.id)]));
  // Observed objects: each app.observe.object, with the optional app.observe.input facts of the same id merged in.
  const view = (data) => {
    const world = worldOf(base, data), extra = new Map();
    for (const fact of world.ofType('app.observe.input')) (extra.get(read(fact, 'id')) ?? extra.set(read(fact, 'id'), []).get(read(fact, 'id'))).push(fact);
    return world.ofType('app.observe.object').map((fact) => {
      const binding = read(fact, 'binding'), input = (key, raw) => ({ binding: binding + '.' + key, key, values: [nativeToken(typed(raw))] });
      const inputs = Object.keys(fact.attrs).filter((key) => !['id', 'kind', 'sourceType', 'binding', 'in', 'role'].includes(key)).map((key) => input(key, fact.attrs[key][0]));
      // Several app.observe.input facts with one key are one input with several values.
      for (const row of extra.get(read(fact, 'id')) ?? []) {
        const key = read(row, 'key'), same = inputs.find((entry) => entry.key === key);
        if (same) same.values.push(nativeToken(typed(row.attrs.value[0]))); else inputs.push(input(key, row.attrs.value[0]));
      }
      // `in` and `role` place an observed part under its owner, as structure rather than an input.
      return { id: read(fact, 'id'), kind: read(fact, 'kind'), sourceType: read(fact, 'sourceType'), ...(fact.attrs.in ? { in: read(fact, 'in'), role: read(fact, 'role') ?? 'member' } : {}), inputs };
    });
  };
  // Geometry for placement, when the rules declare it: app.observe.frame, app.observe.box and app.observe.relation.
  const spatial = (data) => {
    const world = worldOf(base, data), [frame] = world.ofType('app.observe.frame');
    if (!frame) return null;
    const name = read(frame, 'id'), box = (fact) => ({ entity: read(fact, 'id'), scope: name, min_x: Number(read(fact, 'x0')), min_y: Number(read(fact, 'y0')),
      max_x: Number(read(fact, 'x1')), max_y: Number(read(fact, 'y1')), evidence: read(fact, 'evidence') ?? 'bounds' });
    const boxes = [box(frame), ...world.ofType('app.observe.box').map(box)];
    const relations = world.ofType('app.observe.relation').map((fact) => ({ subject: read(fact, 'subject'), object: read(fact, 'object'), kind: read(fact, 'kind'), scope: name }));
    const occupants = world.ofType('app.observe.box').filter((fact) => read(fact, 'occupant') === 'true').map((fact) => read(fact, 'id'));
    return { frame: name, scope: name, container: name, bounds: name, boxes, relations, occupants, unknown: [] };
  };
  // The extent a command would give a new object: the command run on an empty copy, measured by the declared box of
  // what it creates (null when it creates nothing or is refused).
  const measure = (operation, args) => {
    const empty = { sop: '', runtime: { view: {} } }, compiled = compile(base, empty, operation, args);
    if (compiled.refusal || !compiled.calls.length) return null;
    const result = run(base, empty, kinds, compiled.calls);
    if (result.refusal) return null;
    const [made] = worldOf(base, { sop: result.sop, runtime: empty.runtime }).ofType('app.observe.box');
    if (!made) return null;
    const width = Number(read(made, 'x1')) - Number(read(made, 'x0')), height = Number(read(made, 'y1')) - Number(read(made, 'y0'));
    return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
  };
  return createNativeToolHost({ state, instanceId, scope, toolInterface, operations, handlers, view, ...(spatialObservation ? { spatial, measure } : {}), ...limits });
}
