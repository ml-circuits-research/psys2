// SPDX-License-Identifier: AGPL-3.0-only
// A tool whose state is a SOP instance world. Nothing here knows a tab or an operation:
//  1. a native command is told into a fork of the world as app.act.request (+ app.act.item per list element);
//  2. the tab's authored rules derive ordered app.act.call facts (make, change, remove) and app.act.view facts;
//  3. this interpreter runs the calls through the library's generic acts (World.act) and keeps the resulting
//     instance facts and the view keys as the tool state. Undo and redo belong to the application's journal.
// The objects a reader observes come from app.observe.object facts the same rules derive.
import {parse, quote, serialize, str} from '../lib/vendor/sopworld/sopworld.mjs?v=a37e1846b3';
import {createNativeToolHost, nativeToken} from './native-tool-host.mjs?v=d7b8bd54d9';
import {budget} from '../lib/dialog/budget.mjs?v=00bce6e369';

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

// Derived state worlds by base and state: one command reads the same state several times (observation, compile,
// run, the changed objects), so each later read forks the world already derived instead of deriving it again.
const derived = new WeakMap(), DERIVED = 8;

/** A world holding the current state, derived facts included (projection, observation). Callers may change it. */
export function worldOf(base, state) {
  const key = (state.sop ?? '') + '\u0000' + JSON.stringify(state.runtime?.view ?? {});
  const memo = derived.get(base) ?? derived.set(base, new Map()).get(base);
  if (memo.has(key)) { const world = memo.get(key); memo.delete(key); memo.set(key, world); return world.fork(); }
  const world = deriveState(base, state);
  memo.set(key, world);
  if (memo.size > DERIVED) memo.delete(memo.keys().next().value);
  return world.fork();
}

/** Forget the derived worlds of a base whose own facts changed (knowledge told into it later). */
export function forgetDerived(base) { derived.delete(base); }

function deriveState(base, state) {
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
  const item = (attrs) => items.push({ id: 'act.item.' + items.length, type: 'app.act.item', attrs: { request: ['$act.request'], ...attrs } });
  // Structured values as items: an array element by its place (n), an object member by its key (key), an element
  // of an array inside either by its place there (m); an array element that is itself an array also says its length
  // (count), so an empty one is seen. Deeper values are not taken.
  const nested = (attrs, value) => {
    if (Array.isArray(value)) { value.forEach((element, m) => { if (element !== null && typeof element === 'object') throw Error('nested'); item({ ...attrs, m: [String(m)], value: [token(element)] }); }); return; }
    if (value !== null && typeof value === 'object') throw Error('nested');
    item({ ...attrs, value: [token(value)] });
  };
  try {
    for (const [key, value] of Object.entries(args)) {
      const param = [quote(key)];
      if (Array.isArray(value)) value.forEach((element, index) => {
        const at = { param, n: [String(index)] };
        if (Array.isArray(element)) { item({ ...at, count: [String(element.length)] }); nested(at, element); }
        else if (element !== null && typeof element === 'object') for (const [k, v] of Object.entries(element)) nested({ ...at, key: [quote(k)] }, v);
        else item({ ...at, value: [token(element)] });
      });
      else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) nested({ param, key: [quote(k)] }, v);
      else if (value !== undefined && value !== null) request.attrs[key] = [token(value)];
    }
  } catch { return { world, calls: [], views: [], refusal: 'invalid-request' }; }
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
  // Commands the rules ask to run next, on the state the calls leave (app.act.next operation=...).
  const next = [...new Set(world.ofType('app.act.next').map((fact) => read(fact, 'operation')).filter(Boolean))].sort();
  return { world, calls, views: world.ofType('app.act.view'), refusal: refusals[0], next };
}

function run(base, state, kinds, calls) {
  const world = worldOf(base, state);
  const made = new Map();
  if (calls.length > CALLS) return { refusal: 'call-budget' };
  for (const call of calls) {
    const act = read(call, 'act'), args = {};
    for (const [key, values] of Object.entries(call.attrs)) {
      if (['act', 'order', 'ref'].includes(key)) continue;
      // A value naming the ref of a thing made earlier in this command (written bare, as a rule computes it) is that thing.
      const one = (raw) => raw.startsWith('$') ? (made.get(ref(raw)) ?? ref(raw)) : made.has(raw.startsWith('"') ? str(raw) : raw) ? made.get(raw.startsWith('"') ? str(raw) : raw) : ['kind', 'attr'].includes(key) ? (raw.startsWith('"') ? str(raw) : raw) : raw;
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
export function createSopWorldHost({ base, callBase = null, kinds, state, instanceId, scope, toolInterface, operations, spatialObservation = false, ...limits }) {
  // callBase: where compiled calls run when the area declares one (its instance schema without the area's rules).
  const callWorld = callBase ?? base;
  const declared = toolInterface?.bindings ?? operations;
  // A command, then the commands its rules ask to run next (app.act.next), each on the state the one before left, a
  // few levels deep at most; a refusal anywhere refuses the whole command and leaves the state as it was.
  const NEXT = 4;
  const handler = (operation) => (ctx, args) => {
    const s = ctx.state, r = (s.runtime ??= { view: {} });
    const start = { sop: s.sop, view: r.view }, acts = [];
    let views = 0, sop = s.sop, pending = [[operation, args]];
    for (let depth = 0; pending.length; depth++) {
      budget.tick('sop-world-host.next');
      if (depth > NEXT) { s.sop = start.sop; r.view = start.view; return { status: 'missing', code: 'next-budget' }; }
      const following = [];
      for (const [op, opArgs] of pending) {
        const compiled = compile(base, { sop, runtime: r }, op, opArgs);
        if (compiled.refusal) { s.sop = start.sop; r.view = start.view; return { status: 'missing', code: compiled.refusal }; }
        for (const fact of compiled.views) r.view = { ...r.view, [read(fact, 'key')]: read(fact, 'value') ?? null };
        views += compiled.views.length;
        if (compiled.calls.length) {
          const result = run(callWorld, { sop, runtime: r }, kinds, compiled.calls);
          if (result.refusal) { s.sop = start.sop; r.view = start.view; return { status: 'missing', code: result.refusal }; }
          sop = result.sop;
          acts.push(...compiled.calls.map((call) => read(call, 'act')));
        }
        for (const name of compiled.next) following.push([name, {}]);
      }
      pending = following;
    }
    if (!acts.length) return { status: 'supported', changed: views ? ['view'] : [] };
    // What changed: the observed objects that appeared, went or differ (their ids, as tools and focus use them).
    const before = new Map(view({ sop: start.sop, runtime: r }).map((object) => [object.id, JSON.stringify(object)]));
    s.sop = sop;
    const after = new Map(view(s).map((object) => [object.id, JSON.stringify(object)]));
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id));
    return { status: 'supported', changed: changed.length ? changed : acts };
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
    const relations = world.ofType('app.observe.relation').map((fact) => ({ subject: read(fact, 'subject'), object: read(fact, 'object'), kind: read(fact, 'kind'), scope: name,
      ...(read(fact, 'evidence') ? { evidence: read(fact, 'evidence') } : {}) }));
    const occupants = world.ofType('app.observe.box').filter((fact) => read(fact, 'occupant') === 'true').map((fact) => read(fact, 'id'));
    // Points the rules declare (app.observe.point: an end of a link, an anchor), each by its own entity name.
    const points = world.ofType('app.observe.point').map((fact) => ({ entity: read(fact, 'id'), scope: name, x: Number(read(fact, 'x')), y: Number(read(fact, 'y')) }));
    // app.observe.region: a part of an observed thing where others go (of, kind, its box, the kinds it holds).
    const regions = world.ofType('app.observe.region').map((fact) => ({ entity: read(fact, 'of'), kind: read(fact, 'kind'),
      holds: (fact.attrs.holds ?? []).map((raw) => (raw.startsWith('"') ? str(raw) : raw)), min_x: Number(read(fact, 'x0')), min_y: Number(read(fact, 'y0')),
      max_x: Number(read(fact, 'x1')), max_y: Number(read(fact, 'y1')) }));
    return { frame: name, scope: name, container: name, bounds: name, viewport: name, boxes, points, relations, occupants, regions, unknown: [] };
  };
  // The extent a command would give a new object: the command run on an empty copy, measured by the declared box of
  // what it creates (null when it creates nothing or is refused).
  const measure = (operation, args) => {
    const empty = { sop: '', runtime: { view: {} } }, compiled = compile(base, empty, operation, args);
    if (compiled.refusal || !compiled.calls.length) return null;
    const result = run(callWorld, empty, kinds, compiled.calls);
    if (result.refusal) return null;
    const [made] = worldOf(base, { sop: result.sop, runtime: empty.runtime }).ofType('app.observe.box');
    if (!made) return null;
    const width = Number(read(made, 'x1')) - Number(read(made, 'x0')), height = Number(read(made, 'y1')) - Number(read(made, 'y0'));
    // The surfaces what it makes keeps out of (app.place.avoid), for the relation placement (std.placement.kind avoids,
    // a hard keep-out). A soft avoid (strength=soft: the columns above and below standing things) is a preference for a
    // default place only; a relation the user states ("a ball under the tree") puts the thing where it says.
    const avoids = [...new Set(compiled.world.ofType('app.place.avoid').filter((fact) => read(fact, 'strength') !== 'soft').map((fact) => read(fact, 'surface')).filter(Boolean))];
    return Number.isFinite(width) && Number.isFinite(height) ? { width, height, ...(avoids.length ? { avoids } : {}) } : null;
  };
  // Where a command would place a new object, as the rules declare it for a placement problem: the candidate regions
  // (app.place.region, in the order the rules rank them, with the size the object has there) and the objective
  // (app.place.objective). The application solves that problem (std.problem) and gives the command its place.
  const num = (fact, key) => Number(read(fact, key));
  const placement = (data, operation, args) => {
    const compiled = compile(base, data, operation, args);
    if (compiled.refusal) return null;
    const regions = compiled.world.ofType('app.place.region').map((fact) => ({ key: read(fact, 'key'), tier: num(fact, 'tier'), order: num(fact, 'order'),
      host: read(fact, 'host') ?? null, size: num(fact, 'size'), fy: fact.attrs.fy ? num(fact, 'fy') : undefined, min_x: num(fact, 'x0'), min_y: num(fact, 'y0'), max_x: num(fact, 'x1'), max_y: num(fact, 'y1') }))
      .filter((r) => [r.tier, r.order, r.size, r.min_x, r.min_y, r.max_x, r.max_y].every(Number.isFinite))
      .sort((a, b) => a.tier - b.tier || a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const [objective] = compiled.world.ofType('app.place.objective');
    if (!regions.length || !objective) return null;
    // The surfaces the new object keeps out of (app.place.avoid: the water of a river for a house).
    // (strength=soft weight=: a preference, e.g. the columns above and below standing things.)
    const avoid = [...new Set(compiled.world.ofType('app.place.avoid').filter((fact) => read(fact, 'strength') !== 'soft').map((fact) => read(fact, 'surface')).filter(Boolean))];
    const prefer = compiled.world.ofType('app.place.avoid').filter((fact) => read(fact, 'strength') === 'soft').map((fact) => ({ surface: read(fact, 'surface'), weight: num(fact, 'weight') }));
    // The share of its size a new object occupies across and down, where its rules say (a band, an outline).
    const [foot] = compiled.world.ofType('app.place.footprint');
    const footprint = foot ? { w: num(foot, 'w'), h: num(foot, 'h') } : undefined;
    // How firmly it keeps clear of observed objects (app.place.peers strength=hard: a thing that lies in the land).
    const [peers] = compiled.world.ofType('app.place.peers');
    return { regions, avoid, ...(prefer.length ? { prefer } : {}), ...(footprint ? { footprint } : {}), ...(peers ? { peers: read(peers, 'strength') } : {}), objective: Object.fromEntries(Object.keys(objective.attrs).map((key) => [key, typed(objective.attrs[key][0])])) };
  };
  return createNativeToolHost({ state, instanceId, scope, toolInterface, operations, handlers, view, ...(spatialObservation ? { spatial, measure, placement } : {}), ...limits });
}
