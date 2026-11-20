// SPDX-License-Identifier: AGPL-3.0-only
// One authored SOP interface supplies both native parameter admission and compiler facts.
import { World, parse, quote, str } from '../lib/vendor/sopworld/sopworld.mjs?v=22a3f6e48e';
import { budget } from '../lib/dialog/budget.mjs?v=00bce6e369';

const NS = 'std.capability.';
const ABI = 'app.native.';
const schema = `
@app.native.metadata core.type closed=true
@app.native.metadata.operation core.slot of=app.native.metadata key=operation kind=ref to=std.capability.operation present=true
@app.native.metadata.field core.slot of=app.native.metadata key=field kind=ref to=std.capability.arg many=true
@app.native.input core.type closed=true
@app.native.input.name core.slot of=app.native.input key=name kind=string present=true
@app.native.input.fallback core.slot of=app.native.input key=fallback kind=any
@app.native.input.required core.slot of=app.native.input key=required kind=boolean
@app.native.parameter core.type closed=true
@app.native.parameter.parameter core.slot of=app.native.parameter key=parameter kind=ref to=std.capability.parameter present=true
@app.native.parameter.field core.slot of=app.native.parameter key=field kind=atom enum=enum enum=min enum=max present=true
@app.native.parameter.input core.slot of=app.native.parameter key=input kind=ref to=app.native.input present=true
@app.native.parameter.append core.slot of=app.native.parameter key=append kind=boolean
@app.native.compose core.type closed=true
@app.native.compose.module core.slot of=app.native.compose key=module kind=atom present=true
@app.native.compose.state core.slot of=app.native.compose key=state kind=string present=true
@app.native.compose.exclude core.slot of=app.native.compose key=exclude kind=string many=true
@app.native.compose.omit core.slot of=app.native.compose key=omit kind=string many=true
`;
const field = (wire, name) => wire?.attrs[name]?.[0];
const first = (wire, name) => str(field(wire, name));
const own = (object, key) => Object.hasOwn(object, key);
const defined = (object, key) => object && own(object, key);
const reference = (token) => token?.startsWith('$') ? token.slice(1) : undefined;
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const parameterFields = ['kind', 'required', 'nullable', 'min', 'max', 'enum', 'default'];
const inheritedFields = new Set(['id', 'act', 'on', 'params']);
const interfaceTypes = new Set([
  ...['scope', 'operation', 'parameter', 'seed', 'arg', 'record', 'list', 'item'].map(type => NS + type),
  ...['metadata', 'input', 'parameter', 'compose'].map(type => ABI + type),
]);
let validators;

function validate(source) {
  if (!validators) {
    const world = new World();
    world.use('std.capability');
    world.load(schema);
    validators = world;
  }
  const fork = validators.fork();
  if (!fork.tell(source, { factsOnly: true }).ok) throw Error('invalid-native-interface');
}

function readTyped(token, byId, inputs, depth = 0) {
  budget.tick('native.interface.read');
  if (depth > 24 || typeof token !== 'string') throw Error('invalid-native-interface-value');
  if (!token.startsWith('$')) {
    const literal = JSON.parse(token);
    if (literal !== null && !['string', 'boolean'].includes(typeof literal) && !Number.isFinite(literal)) {
      throw Error('invalid-native-interface-literal');
    }
    return literal;
  }
  const wire = byId.get(reference(token));
  if (wire?.type === ABI + 'input') {
    const name = first(wire, 'name');
    if (defined(inputs, name)) return inputs[name];
    if (field(wire, 'required') === 'true' && field(wire, 'fallback') === undefined) throw Error('missing-native-interface-input:' + name);
    return field(wire, 'fallback') === undefined ? undefined : readTyped(field(wire, 'fallback'), byId, inputs, depth + 1);
  }
  if (wire?.type === NS + 'list') {
    const items = (wire.attrs.member || []).map((item) => byId.get(reference(item)))
      .sort((left, right) => Number(field(left, 'index')) - Number(field(right, 'index')));
    if (items.some((item, index) => item?.type !== NS + 'item' || Number(field(item, 'index')) !== index)) {
      throw Error('invalid-native-interface-list');
    }
    return items.map((item) => readTyped(field(item, 'value'), byId, inputs, depth + 1));
  }
  if (wire?.type === NS + 'record') {
    return Object.fromEntries(readArguments(wire.attrs.entry, byId, inputs, depth + 1));
  }
  throw Error('invalid-native-interface-reference');
}

function readArguments(references, byId, inputs, depth = 0) {
  const seen = new Set();
  return (references || []).map((token) => {
    const wire = byId.get(reference(token)), name = first(wire, 'name');
    if (wire?.type !== NS + 'arg' || forbidden.has(name) || seen.has(name)) throw Error('invalid-native-interface-field');
    seen.add(name);
    return [name, readTyped(field(wire, 'value'), byId, inputs, depth)];
  });
}

function parameterOf(row, overrides, byId, inputs) {
  const result = {};
  for (const key of parameterFields) {
    const tokens = row.attrs[key];
    if (key === 'enum') {
      if (tokens || field(row, 'enumClosed') === 'true') result.enum = (tokens || []).map((token) => readTyped(token, byId, inputs));
    } else if (tokens) {
      result[key === 'kind' ? 'type' : key] = key === 'kind' ? str(tokens[0]) : readTyped(tokens[0], byId, inputs);
    }
  }
  for (const override of overrides) {
    const key = first(override, 'field'), value = readTyped(field(override, 'input'), byId, inputs);
    if (value === undefined) continue;
    result[key] = field(override, 'append') === 'true' ? [...(result[key] || []), ...value] : value;
  }
  return result;
}

const ownOperation = (row, params, metadata, byId, inputs) => {
  const fields = readArguments(metadata?.attrs.field, byId, inputs);
  if (fields.some(([name]) => inheritedFields.has(name))) throw Error('invalid-native-interface-metadata');
  const operation = {
    id: first(row, 'name'), act: first(row, 'act'), on: first(row, 'on'), ...Object.fromEntries(fields), params,
  };
  if ((field(row, 'eligible') === 'true') === !!operation.requires?.length) throw Error('inconsistent-native-interface-eligibility');
  return operation;
};

function lookupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const link = reference(field(row, key));
    if (!map.has(link)) map.set(link, []);
    map.get(link).push(row);
  }
  return map;
}

function recordParameter(row, dynamic) {
  const attrs = { ...row.attrs };
  for (const key of ['enum', 'min', 'max']) {
    if (dynamic[key] === undefined) continue;
    if (key === 'enum') {
      attrs.enum = dynamic[key].map((value) => quoteScalar(value));
      attrs.enumClosed = ['true'];
    } else attrs[key] = [quoteScalar(dynamic[key])];
  }
  return { ...row, attrs };
}

function quoteScalar(value) {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'boolean' || value === null || Number.isFinite(value)) return Object.is(value, -0) ? '-0' : String(value);
  throw Error('invalid-native-interface-scalar');
}

function valuesOf(parameters, seeds, byId) {
  const values = new Map();
  const visit = (token, depth = 0) => {
    budget.tick('native.interface.references');
    if (depth > 24) throw Error('invalid-native-interface-value');
    const key = reference(token);
    if (!key || values.has(key)) return;
    const row = byId.get(key);
    if (!row || !['list', 'item', 'record', 'arg'].some(type => row.type === NS + type)) {
      throw Error('invalid-native-interface-parameter-value');
    }
    values.set(key, row);
    for (const name of ['member', 'entry', 'value']) for (const value of row.attrs[name] || []) visit(value, depth + 1);
  };
  for (const row of parameters) for (const key of ['enum', 'default']) for (const token of row.attrs[key] || []) visit(token);
  for (const row of seeds) visit(field(row, 'value'));
  return [...values.values()];
}

/** Parse trusted interface source once. Each host can fill the named live catalog inputs. */
export function readNativeToolInterface(source, { imports = {} } = {}) {
  if (typeof source !== 'string' || source.length > 1000000) throw Error('native-interface-source-budget');
  const wires = parse(source), byId = new Map(wires.map((wire) => [wire.id, wire]));
  if (wires.length > 10000 || wires.some((wire) => wire.pattern || !interfaceTypes.has(wire.type))) {
    throw Error('invalid-native-interface-record');
  }
  validate(wires);
  const of = (type) => wires.filter((wire) => wire.type === type);
  const rows = of(NS + 'operation').sort((left, right) => Number(field(left, 'order')) - Number(field(right, 'order')));
  const parameters = lookupBy(of(NS + 'parameter'), 'operation');
  const metadata = lookupBy(of(ABI + 'metadata'), 'operation');
  const overrides = lookupBy(of(ABI + 'parameter'), 'parameter');
  const uses = of(ABI + 'compose');
  const operationNames = new Set(rows.map(row => first(row, 'name')));
  const seeds = new Map();
  for (const seed of of(NS + 'seed')) {
    const operation = first(seed, 'operation');
    if (!operationNames.has(operation)) throw Error('unknown-native-interface-seed-operation');
    if (!seeds.has(operation)) seeds.set(operation, []);
    seeds.get(operation).push(seed);
  }

  return {
    realize(inputs = {}) {
      const declarations = rows.map((operation) => {
        const native = new Map(), facts = [];
        for (const row of parameters.get(operation.id) || []) {
          const name = first(row, 'name');
          if (forbidden.has(name) || native.has(name)) throw Error('duplicate-native-interface-parameter');
          const runtime = parameterOf(row, overrides.get(row.id) || [], byId, inputs);
          native.set(name, runtime);
          facts.push(recordParameter(row, runtime));
        }
        const supplements = metadata.get(operation.id) || [];
        if (supplements.length > 1) throw Error('duplicate-native-interface-metadata');
        const ownedSeeds = seeds.get(first(operation, 'name')) || [];
        if (ownedSeeds.some(seed => !native.has(first(seed, 'parameter')))) throw Error('unknown-native-interface-seed-parameter');
        return { operation, parameters: facts, seeds: ownedSeeds, values: valuesOf(facts, ownedSeeds, byId),
          binding: ownOperation(operation, Object.fromEntries(native), supplements[0], byId, inputs) };
      });
      const components = [];
      for (const use of uses) {
        const module = first(use, 'module'), owner = imports[module];
        if (!owner) throw Error('unknown-native-interface-module');
        const exclude = (use.attrs.exclude || []).map(str), omit = (use.attrs.omit || []).map(str);
        const added = owner.realize(inputs).declarations.filter((block) => !exclude.includes(block.binding.id));
        components.push({ world: module, stateKey: first(use, 'state'), operations: added.map((block) => block.binding) });
        for (const block of added) {
          const binding = Object.fromEntries(Object.entries(block.binding).filter(([key]) => !omit.includes(key)));
          declarations.push({ ...block, binding });
        }
      }
      if (new Set(declarations.map((item) => item.binding.id)).size !== declarations.length) {
        throw Error('duplicate-native-interface-operation');
      }
      return {
        declarations,
        components,
        bindings: declarations.map((item) => item.binding),
        capabilityFacts(scope) {
          const facts = new Map();
          for (const [order, entry] of declarations.entries()) {
            facts.set(entry.operation.id, { ...entry.operation, attrs: { ...entry.operation.attrs, scope: [scope], order: [String(order)] } });
            for (const wire of [...entry.parameters, ...entry.seeds, ...entry.values]) facts.set(wire.id, wire);
          }
          return [...facts.values()];
        },
      };
    },
  };
}
