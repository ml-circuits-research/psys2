// SPDX-License-Identifier: AGPL-3.0-only
import { World, parse, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=b88e6c95e3';
import POLICY from '../../worlds/app.project/capability-policy.mjs?v=ca7d222029';
import { DRAWING_PROPERTY_BINDINGS } from '../../worlds/art.draw/property-host.mjs?v=45ec70afe7';
import { executionPolicyWorld } from './execution-policy.mjs?v=5900e84cec';
import { nativeKindCandidates } from './native-binding-candidates.mjs?v=de223646d6';
import { observedReaderContext } from './native-reader-context.mjs?v=6cf1d2e296';
import { budget } from './budget.mjs?v=00bce6e369';

const NS = 'std.capability.';
const take = (wire, key) => str(wire?.attrs[key]?.[0]);
const token = (value) => Object.is(value, -0) ? '-0' : JSON.stringify(value);
const ref = (wire) => '$' + wire;
const values = (wire, key) => (wire?.attrs[key] || []).map(str);
const own = (object, key) => Object.hasOwn(object, key);

function factWriter() {
  const wires = [];
  let values = 0;
  function write(type, fields, id = 'capability.input.' + wires.length) {
    const attrs = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, [].concat(value)]));
    wires.push({ id, type, attrs, pattern: false });
    return ref(id);
  }
  function value(data, depth = 0) {
    budget.tick('capability.encode');
    if (++values > 100000 || depth > 24) throw Error('capability-value-budget');
    if (data === null || typeof data !== 'object') return token(data);
    if (Array.isArray(data)) {
      return write(NS + 'list', { member: data.map((item, index) =>
        write(NS + 'item', { index: String(index), value: value(item, depth + 1) })) });
    }
    return write(NS + 'record', { entry: Object.entries(data).map(([name, datum]) =>
      write(NS + 'arg', { name: quote(name), value: value(datum, depth + 1) })) });
  }
  return { write, value, wires };
}

function interfaceFacts({ area, view, bindings, host, observation, focus, unapplied, readKnowledge }, concepts) {
  const { write, value, wires } = factWriter();
  const scope = write(NS + 'scope', {
    instance: quote(observation.instanceId), version: quote(observation.version), focus: focus === undefined ? undefined : quote(String(focus)),
    newId: quote(globalThis.crypto.randomUUID()), clock: String(Date.now()), unapplied: unapplied.map(quote),
  }, 'capability.scope');
  const operations = new Map(), sourceTypes = new Set();
  const seed = (operation, fields) => write(NS + 'seed', { operation: quote(operation), ...fields });
  for (const [order, operation] of host.bindings().entries()) {
    const id = write(NS + 'operation', {
      scope, name: quote(operation.id), act: operation.act, on: quote(operation.on), order: String(order),
      eligible: String(!operation.requires?.length),
    });
    operations.set(operation.id, id);
    sourceTypes.add(operation.on);
    for (const [name, param] of Object.entries(operation.params)) {
      write(NS + 'parameter', {
        operation: id, name: quote(name), kind: param.type, required: param.required === true ? 'true' : undefined,
        nullable: param.nullable === true ? 'true' : undefined, min: token(param.min), max: token(param.max),
        enum: param.enum?.map((item) => value(item)), enumClosed: param.enum ? 'true' : undefined,
        default: own(param, 'default') ? value(param.default) : undefined,
      });
    }
    for (const input of operation.knowledgeInputs || []) {
      seed(operation.id, { parameter: quote(input.argument), source: 'label', phase: 'initial', order: '20' });
    }
    for (const rule of operation.defaultsFrom || []) {
      if (rule.method === 'ordinal-labels') seed(operation.id, { parameter: quote(rule.parameter), source: 'ordinal.list',
        from: quote(rule.lengthOf), phase: 'missing', order: '200', notice: quote('I numbered the categories because no labels were supplied.') });
    }
  }

  const readerArea = bindings.readerAreaByView?.[view] ?? area.area;
  for (const row of nativeKindCandidates(bindings)) {
    const binding = row.nativeFamilyBinding;
    if (row.area !== readerArea || !binding || !operations.has(binding.operation)) continue;
    const args = Object.entries(binding.arguments || {}).map(([name, datum]) =>
      write(NS + 'arg', { name: quote(name), value: value(datum) }));
    write(NS + 'target', { scope, canonical: row.canonical, label: quote(row.lemma), operation: operations.get(binding.operation), argument: args });
  }

  const executionPolicy = executionPolicyWorld();
  const valueMappings = new Map(executionPolicy.ofType('app.execution.values').map((row) => [take(row, 'concept'), row]));
  const addProperty = (concept, { sourceType, parameter, id, codec }, order) => {
    const codecs = { 'number-list': 'number.list', 'string-list': 'string.list' };
    write(NS + 'property', { scope, concept, on: quote(sourceType), parameter: quote(parameter),
      binding: id ? quote(id) : undefined, codec: codecs[codec] || (valueMappings.has(concept) ? 'lookup' : undefined), order: String(order) });
  };
  let propertyOrder = 0;
  for (const row of bindings.properties || []) {
    if (row.area === readerArea && sourceTypes.has(row.hostBinding?.sourceType)) addProperty(row.canonical, row.hostBinding, propertyOrder++);
  }
  for (const row of DRAWING_PROPERTY_BINDINGS) {
    if (sourceTypes.has(row.sourceType)) addProperty(row.concept, { sourceType: row.sourceType, parameter: row.key, id: row.id }, propertyOrder++);
  }

  for (const [concept, mapping] of valueMappings) {
    if (!concepts.has(concept)) continue;
    for (const row of readKnowledge().ofType(take(mapping, 'valueType'))) {
      for (const label of values(row, take(mapping, 'nameKey'))) {
        for (const datum of values(row, take(mapping, 'valueKey'))) {
          // Retain literal values from the source world. The receiving tool validates its own declared parameter.
          write(NS + 'value', { concept, label: quote(label), value: value(datum.toLowerCase()) });
        }
      }
    }
  }

  for (const [index, row] of executionPolicy.ofType('app.execution.default').entries()) {
    const [literal] = row.attrs.value || [];
    const list = literal?.startsWith('$') && executionPolicy.get(literal.slice(1));
    const isClock = take(row, 'source') === 'clock.now';
    if (!operations.has(take(row, 'operation'))) continue;
    seed(take(row, 'operation'), {
      parameter: quote(take(row, 'parameter')), source: isClock ? 'clock' : 'value',
      value: list ? value((list.attrs.item || []).map(JSON.parse)) : literal,
      phase: 'missing', order: String(120 + index), notice: row.attrs.notice?.[0],
    });
  }

  const names = observedReaderContext(area.area, observation).context.existing;
  for (const [order, object] of observation.objects.entries()) {
    const id = write(NS + 'object', {
      scope, id: quote(String(object.id)), source: quote(object.source), version: quote(object.version),
      on: quote(object.sourceType), kind: quote(object.kind), name: names[order]?.name === undefined ? undefined : quote(names[order].name),
      order: String(order),
    });
    for (const field of object.inputs) {
      write(NS + 'field', { object: id, binding: quote(field.binding), key: quote(field.key), value: field.values });
    }
  }
  return { wires, scope };
}

function readPlan(sop) {
  const rows = parse(sop), byId = new Map(rows.map((wire) => [wire.id, wire]));
  const result = rows.find((wire) => wire.type === NS + 'result') ?? rows.find((wire) => wire.type === 'std.compile.result');
  const find = (id) => byId.get(id?.slice(1));
  let decoded = 0;
  const decode = (literal, depth = 0) => {
    budget.tick('capability.decode');
    if (++decoded > 100000 || depth > 24) throw Error('capability-value-budget');
    if (!literal.startsWith('$')) return JSON.parse(literal);
    const wire = find(literal);
    if (wire?.type === NS + 'list') {
      return (wire.attrs.member || []).map(find).sort((a, b) => Number(take(a, 'index')) - Number(take(b, 'index')))
        .map((item) => decode(item.attrs.value[0], depth + 1));
    }
    if (wire?.type === NS + 'record') {
      return Object.fromEntries((wire.attrs.entry || []).map(find).map((entry) => [take(entry, 'name'), decode(entry.attrs.value[0], depth + 1)]));
    }
    throw Error('invalid-capability-call-value');
  };
  const call = find(result?.attrs.call?.[0]);
  const args = Object.fromEntries((call?.attrs.argument || []).map((id) => {
    const argument = find(id);
    return [take(argument, 'name'), decode(argument.attrs.value[0])];
  }));
  const alternatives = (result?.attrs.alternative || []).map((id) => {
    const alternative = find(id);
    return { operation: take(alternative, 'operation'), status: take(alternative, 'status'), reason: take(alternative, 'reason') };
  });
  return {
    sop, status: take(result, 'status'), reason: take(result, 'reason'), message: take(result, 'message'),
    act: take(result, 'act'), kind: take(result, 'kind'), id: take(result, 'id'), source: take(result, 'source'),
    instance: take(result, 'instance'), version: take(result, 'version'), targets: values(result, 'target'),
    skipped: values(result, 'skipped'), notes: values(result, 'note'), support: values(result, 'support'),
    operation: take(call, 'operation'), args, alternatives,
  };
}

let declarations;

/** Compose live interface facts and compile the original SOP graph. */
export function compileNativeCapability(candidate, context) {
  if (!declarations) {
    const world = new World();
    if (!world.use('std.capability').ok) throw Error('capability-contract-unavailable');
    world.load(POLICY);
    declarations = world;
  }
  const nodes = parse(candidate.wires);
  const concepts = new Set(nodes.filter((wire) => wire.type === 'std.request.constraint').map((wire) => take(wire, 'concept')));
  const { wires, scope } = interfaceFacts(context, concepts);
  const world = declarations.fork();
  const admitted = world.tell(wires, { factsOnly: true });
  if (!admitted.ok) throw Error('invalid-capability-interface');
  const request = nodes.find((wire) => wire.type === 'std.request' && wire.id === candidate.request);
  if (!request) return readPlan('@compile.result std.compile.result status=not-applicable reason=request-root');
  const sop = candidate.wires + '\n' + serialize([
    { id: 'capability.context', type: NS + 'context', attrs: { request: [ref(request.id)], scope: [scope] }, pattern: false },
  ]);
  return readPlan(world.compileRequest(sop));
}
