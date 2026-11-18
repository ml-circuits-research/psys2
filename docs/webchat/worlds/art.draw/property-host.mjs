// SPDX-License-Identifier: AGPL-3.0-only
// Native Drawing property observation and mutation. No language or ontology lookup.
import { remember } from './board.mjs?v=ec3f721e87';
import { kindKey, kindName } from './scene.mjs?v=2f9fac19e3';

export const DRAWING_PROPERTY_BINDINGS = Object.freeze([
  Object.freeze({ id: 'art.draw.object.colour', concept: 'colour', key: 'color', sourceType: 'art.draw.object', format: 'rgb' }),
]);
const copy = (value) => structuredClone(value);
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const plain = (value) => value && Object.getPrototypeOf(value) === Object.prototype;
// Bound traversal before serialization; session data cannot carry executable getters,
// cycles, non-finite numbers or unbounded nesting into observations/undo snapshots.
function checkData(root, maxBytes) {
  const pending = [[root, 0]], seen = new Set();
  let nodes = 0, bytes = 0;
  for (let visit = 0; visit < 200001; visit++) {
    if (!pending.length) break;
    const [value, depth, leaving] = pending.pop();
    if (leaving) { seen.delete(value); continue; }
    if (++nodes > 100000 || depth > 48 || bytes > maxBytes) throw new RangeError('Drawing state exceeds observation budget');
    if (typeof value === 'string') { bytes += value.length; continue; }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Non-finite state value');
    if (value === null || value === undefined || ['string', 'boolean', 'number'].includes(typeof value)) continue;
    if ((!Array.isArray(value) && !plain(value)) || seen.has(value)) throw new TypeError('Non-tree Drawing state');
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Symbol Drawing state');
    seen.add(value);
    pending.push([value, depth, true]);
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) throw new TypeError('Executable Drawing state');
      if (!descriptor.enumerable && !(Array.isArray(value) && key === 'length')) throw new TypeError('Non-enumerable Drawing state');
      bytes += key.length;
      pending.push([descriptor.value, depth + 1]);
    }
  }
  if (pending.length || bytes > maxBytes) throw new RangeError('Drawing state exceeds observation budget');
}

/** instanceId is a fresh lifetime identity, never reused after restoring/replacing state. */
export function createDrawingPropertyHost({ state, instanceId, bindings = DRAWING_PROPERTY_BINDINGS, maxObjects = 10000, maxBytes = 4_000_000 } = {}) {
  if (!text(instanceId) || !plain(state)) throw new TypeError('Drawing state and fresh instanceId required');
  if (!Number.isSafeInteger(maxObjects) || maxObjects < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('Invalid observation budget');
  const declared = copy(bindings), concepts = new Set();
  for (const binding of declared) {
    if (!plain(binding) || !text(binding.id) || !text(binding.concept) || !text(binding.sourceType) || binding.format !== 'rgb'
      || !/^[A-Za-z][A-Za-z0-9_]*$/.test(binding.key) || ['id', 'kind', 'thing', 'tag', 'parts', 'shape', 'constructor', '__proto__'].includes(binding.key)
      || concepts.has(binding.concept)) throw new TypeError('Invalid or duplicate native property binding');
    concepts.add(binding.concept);
  }
  let fingerprint, revision = 0;
  const receipts = new Map();
  function read() {
    checkData(state, maxBytes);
    if (!Array.isArray(state.objects) || state.objects.length > maxObjects || !Array.isArray(state.history)
      || !Array.isArray(state.future) || !Array.isArray(state.last)) throw new TypeError('Invalid Drawing state');
    const ids = new Set(), objects = [];
    for (const object of state.objects) {
      if (!plain(object) || !['string', 'number'].includes(typeof object.id) || !text(String(object.id)) || !text(object.kind)
        || ids.has(String(object.id))) throw new TypeError('Invalid or duplicate Drawing object identity');
      ids.add(String(object.id));
      if (object.tag) continue;
      const inputs = declared.map(binding => {
        const value = object[binding.key];
        if (value !== undefined && value !== null && typeof value !== 'string') throw new TypeError('Unsupported stored native property');
        return { binding: binding.id, source: JSON.stringify([instanceId, 'object', object.id]), sourceType: binding.sourceType,
          key: binding.key, values: value === undefined || value === null ? [] : [JSON.stringify(value)] };
      });
      objects.push({ id: object.id, kind: kindName(kindKey(object)), inputs });
    }
    const current = JSON.stringify(state);
    if (current.length > maxBytes) throw new RangeError('Drawing state exceeds observation budget');
    if (fingerprint !== undefined && fingerprint !== current) revision++;
    fingerprint = current;
    const version = String(revision);
    for (const object of objects) for (const input of object.inputs) input.version = version;
    return { instanceId, version, complete: true, scope: 'selectable-objects', objects };
  }
  function observe() { return copy(read()); }
  function setProperty(args = {}) {
    const refuse = reason => ({ status: 'refused', reason });
    const { invocation, expectedVersion, target, concept, value } = args;
    if (!text(invocation)) return refuse('invalid-invocation');
    if (!text(expectedVersion) || !text(concept) || !text(value) || !['number', 'string'].includes(typeof target)
      || (typeof target === 'number' && !Number.isFinite(target))) return refuse('invalid-arguments');
    const payload = JSON.stringify([expectedVersion, target, concept, value]);
    const previous = receipts.get(invocation);
    if (previous) return previous.payload === payload ? { ...copy(previous.receipt), replayed: true } : refuse('invocation-reused');
    if (receipts.size >= 10000) return refuse('receipt-budget');
    const binding = declared.find(item => item.concept === concept);
    if (!binding) return refuse('unsupported-property');
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/.test(value)) return refuse('invalid-native-value');
    let before;
    try { before = read(); } catch { return refuse('invalid-state'); }
    if (typeof expectedVersion !== 'string' || before.version !== expectedVersion) return refuse('stale-observation');
    const observed = before.objects.find(object => object.id === target);
    if (!observed) return refuse('missing-target');
    const object = state.objects.find(object => object.id === target);
    let status = 'unchanged';
    if (object[binding.key] !== value) {
      // Prepare the whole undo record before the only mutation. Supported state is
      // plain session data; accessors/nonwritable root fields are refused.
      for (const key of ['objects', 'history', 'future', 'prev']) {
        const descriptor = Object.getOwnPropertyDescriptor(state, key);
        if (descriptor ? !descriptor.writable : !Object.isExtensible(state)) return refuse('immutable-state');
      }
      let staged;
      try {
        staged = copy(state);
        remember(staged, `Set ${binding.key}`);
        staged.objects.find(item => item.id === target)[binding.key] = value;
        checkData(staged, maxBytes);
        if (JSON.stringify(staged).length > maxBytes) return refuse('state-budget');
      } catch { return refuse('invalid-state'); }
      Object.assign(state, { objects: staged.objects, history: staged.history, future: staged.future, prev: staged.prev });
      status = 'changed';
    }
    const after = read();
    const receipt = { status, invocation, instanceId, target, binding: binding.id, beforeVersion: before.version, afterVersion: after.version };
    receipts.set(invocation, { payload, receipt });
    return copy(receipt);
  }
  read();
  return Object.freeze({ observe, setProperty, bindings: () => copy(declared) });
}
