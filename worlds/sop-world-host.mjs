// SPDX-License-Identifier: AGPL-3.0-only
// A tool whose state is a SOP instance world. Nothing here knows a tab or an operation:
//  1. a native command is told into a fork of the world as app.act.request (+ app.act.item per list element);
//  2. the tab's authored rules derive ordered app.act.call facts (make, change, remove) and app.act.view facts;
//  3. this interpreter runs the calls through the library's generic acts (World.act) and keeps the resulting
//     instance facts, a bounded history for undo/redo and the view keys, as the tool state.
// The objects a reader observes come from app.observe.object facts the same rules derive.
import {parse, quote, serialize, str} from '../src/vendor/sopworld/sopworld.mjs';
import {createNativeToolHost} from './native-tool-host.mjs';

const HISTORY = 50, CALLS = 512;
const atom = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const token = (value) => typeof value === 'number' && Number.isFinite(value) ? String(value)
  : typeof value === 'boolean' ? String(value) : typeof value === 'string' && atom.test(value) ? value : quote(String(value));
const read = (fact, key) => { const raw = fact.attrs[key]?.[0]; return raw === undefined ? undefined : raw.startsWith('"') ? str(raw) : raw; };
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
  return { sop: instanceFacts(world, kinds), past: [], future: [], view: {} };
}

/** A world holding the current state, derived facts included (projection, observation). */
export function worldOf(base, state) {
  const world = base.fork();
  if (state.sop) { const told = world.tell(state.sop, { factsOnly: true }); if (!told.ok) throw Error('invalid-state'); }
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
  const calls = world.ofType('app.act.call').map((fact) => ({ fact, order: Number(read(fact, 'order') ?? 0) }))
    .sort((a, b) => a.order - b.order || a.fact.id.localeCompare(b.fact.id)).map(({ fact }) => fact);
  const refusals = world.ofType('app.act.refuse').map((fact) => read(fact, 'reason'));
  return { calls, views: world.ofType('app.act.view'), history: world.ofType('app.act.history')[0], refusal: refusals[0] };
}

function run(base, state, kinds, calls) {
  const world = worldOf(base, state);
  const made = new Map();
  if (calls.length > CALLS) return { refusal: 'call-budget' };
  for (const call of calls) {
    const act = read(call, 'act'), args = {};
    for (const [key, values] of Object.entries(call.attrs)) {
      if (['act', 'order', 'label'].includes(key)) continue;
      const raw = values[0];
      args[key] = raw.startsWith('$') ? (made.get(ref(raw)) ?? ref(raw)) : ['kind', 'attr'].includes(key) ? read(call, key) : raw;
    }
    if (act === 'make' && args.thing === undefined) {
      const before = new Set(world.ofType(args.kind).map((fact) => fact.id));
      const result = world.act({ action: 'make', args: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, k !== 'kind' && world.has(String(v)) ? '$' + v : v])) });
      if (!result.ok) return { refusal: result.violations?.[0]?.why ?? 'refused' };
      const created = world.ofType(args.kind).find((fact) => !before.has(fact.id));
      if (created && call.attrs.label) made.set(read(call, 'label'), created.id);
    } else {
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
export function createSopWorldHost({ base, kinds, state, instanceId, scope, toolInterface, operations, ...limits }) {
  const declared = toolInterface?.bindings ?? operations;
  const handler = (operation) => (ctx, args) => {
    const s = ctx.state, compiled = compile(base, s, operation, args);
    if (compiled.refusal) return { status: 'missing', code: compiled.refusal };
    for (const view of compiled.views) s.view = { ...s.view, [read(view, 'key')]: read(view, 'value') ?? null };
    if (compiled.history) {
      const back = read(compiled.history, 'direction') === 'back', from = back ? s.past : s.future, to = back ? s.future : s.past;
      if (!from.length) return { status: 'missing', code: back ? 'nothing-to-undo' : 'nothing-to-redo' };
      to.push(s.sop); s.sop = from.pop();
      return { status: 'supported', changed: ['history'] };
    }
    if (!compiled.calls.length) return { status: 'supported', changed: compiled.views.length ? ['view'] : [] };
    const result = run(base, s, kinds, compiled.calls);
    if (result.refusal) return { status: 'missing', code: result.refusal };
    if (result.sop !== s.sop) { s.past.push(s.sop); if (s.past.length > HISTORY) s.past.shift(); s.future = []; s.sop = result.sop; }
    return { status: 'supported', changed: compiled.calls.map((call) => read(call, 'act')) };
  };
  const handlers = Object.fromEntries(declared.map((op) => [op.id, handler(op.id)]));
  const view = (data) => worldOf(base, data).ofType('app.observe.object').map((fact) => ({
    id: read(fact, 'id'), kind: read(fact, 'kind'), sourceType: read(fact, 'sourceType'),
    inputs: Object.entries(fact.attrs).filter(([key]) => !['id', 'kind', 'sourceType'].includes(key)).map(([key]) => ({ name: key, value: read(fact, key) })),
  }));
  return createNativeToolHost({ state, instanceId, scope, toolInterface, operations, handlers, view, ...limits });
}
