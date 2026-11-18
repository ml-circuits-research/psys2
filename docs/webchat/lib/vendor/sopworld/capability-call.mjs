// Private mechanical reader for the standard capability call. The caller supplies
// parsed SOP wires and owns authority over the operation, instance and arguments.
const family = 'std.capability.';

class InvalidCapabilityCall extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
const fail = (reason) => { throw new InvalidCapabilityCall(reason); };
const fields = (wire, key) => wire?.attrs[key] ?? [];
const single = (wire, key) => {
  const values = fields(wire, key);
  if (values.length !== 1) fail('invalid-call-field');
  return values[0];
};
function literal(token) {
  let value;
  try { value = JSON.parse(token); } catch { fail('invalid-call-value'); }
  if (value !== null && !['string', 'boolean'].includes(typeof value) && !Number.isFinite(value)) {
    fail('invalid-call-value');
  }
  return value;
}
function string(wire, key) {
  const value = literal(single(wire, key));
  if (typeof value !== 'string') fail('invalid-call-field');
  return value;
}

export function decodeCapabilityCall(nodes) {
  try { return read(nodes); } catch (error) {
    if (error instanceof InvalidCapabilityCall) return { reason: error.reason };
    throw error;
  }
}

function read(nodes) {
  if (nodes.length > 10_000) fail('call-budget');
  const byId = new Map(nodes.map((wire) => [wire.id, wire]));
  if (byId.size !== nodes.length || nodes.some((wire) => wire.pattern)) fail('call-identity');
  const ref = (token, type) => {
    const wire = token.startsWith('$') && byId.get(token.slice(1));
    if (!wire || (type && wire.type !== type)) fail('invalid-call-reference');
    return wire;
  };
  const calls = nodes.filter((wire) => wire.type === family + 'call');
  const results = nodes.filter((wire) => wire.type === family + 'result');
  const readings = nodes.filter((wire) => wire.type === 'std.interpret.result');
  if (calls.length !== 1 || results.length > 1 || readings.length > 1) fail('call-root');
  const [call] = calls, [result] = results, [reading] = readings;
  if (result && (single(result, 'status') !== 'compiled' ||
      ref(single(result, 'call'), family + 'call') !== call)) fail('call-root');
  if (reading && (single(reading, 'status') !== 'compiled' ||
      ref(single(reading, 'plan'), family + 'result') !== result)) fail('call-root');

  const used = new Set();
  let steps = 0;
  const tick = (characters = 0) => {
    steps += 1 + Math.floor(characters / 64);
    if (steps > 100_000) fail('call-budget');
  };
  const visit = (wire, keys) => {
    tick();
    if (Object.keys(wire.attrs).some((key) => !keys.includes(key))) fail('invalid-call-field');
    used.add(wire);
  };
  function record(tokens, depth) {
    tick();
    const entries = new Map();
    for (const token of tokens) {
      tick();
      const entry = ref(token, family + 'arg');
      visit(entry, ['name', 'value']);
      tick(single(entry, 'name').length);
      const key = string(entry, 'name');
      if (['__proto__', 'constructor', 'prototype'].includes(key) || entries.has(key)) fail('invalid-call-key');
      entries.set(key, value(single(entry, 'value'), depth));
    }
    return Object.fromEntries(entries);
  }
  function value(token, depth) {
    tick(token.length);
    if (depth > 24) fail('call-budget');
    if (!token.startsWith('$')) return literal(token);
    const wire = ref(token);
    if (wire.type === family + 'record') {
      visit(wire, ['entry']);
      return record(fields(wire, 'entry'), depth + 1);
    }
    if (wire.type !== family + 'list') fail('invalid-call-value');
    visit(wire, ['member']);
    const items = fields(wire, 'member').map((member) => {
      const item = ref(member, family + 'item');
      visit(item, ['index', 'value']);
      const index = single(item, 'index');
      if (!/^(?:0|[1-9][0-9]*)$/.test(index)) fail('invalid-call-index');
      return { item, index: Number(index) };
    }).sort((left, right) => left.index - right.index);
    return items.map(({item, index}, order) => {
      if (index !== order) fail('invalid-call-index');
      return value(single(item, 'value'), depth + 1);
    });
  }

  visit(call, ['operation', 'argument']);
  const operation = string(call, 'operation');
  if (!operation) fail('invalid-call-field');
  const args = record(fields(call, 'argument'), 0);
  if (!result && used.size !== nodes.length) fail('unowned-call-wire');
  return { operation, args, wires: [...used] };
}
