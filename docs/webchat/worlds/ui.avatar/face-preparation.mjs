// SPDX-License-Identifier: AGPL-3.0-only
// Resolved host preparation, not a new-path binding. Owns a copied state for one lifetime.
import { newFace, toolView, NONE } from './face.mjs?v=29240b25c0';
import { DEFAULT_FACE } from './default-face.mjs?v=9a9dc8d5bf';
const copy = (x) => structuredClone(x);
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const textId = (x) => typeof x === 'string' && x.length > 0;

export function createFacePreparation({ instanceId, state = {}, catalog = DEFAULT_FACE } = {}) {
  if (!textId(instanceId) || !record(state)) throw new TypeError('Face preparation needs instance identity and a state record');
  if (!record(catalog) || !record(catalog.presets) || !Array.isArray(catalog.slots)) throw new TypeError('Invalid face catalog');
  JSON.stringify(state); // Reject cycles/BigInt before owning state: receipts compare JSON snapshots.
  let current = copy(state), version = 0;
  const data = copy(catalog), receipts = new Map();
  const observe = () => ({ instanceId, version,
    status: !Object.hasOwn(current, 'face') ? 'uninitialized' : current.face?.v !== 2 ? 'migration_required' : 'ready',
    state: copy(current), facts: copy(toolView({ state: current, knowledge: { peekFaces: () => data } })),
  });
  const failure = (code) => ({ status: 'refused', code, observation: observe() });
  function apply(command = {}) {
    if (!record(command) || !textId(command.operationId) || command.instanceId !== instanceId || !Number.isSafeInteger(command.expectedVersion)
      || !['initialize', 'migrate', 'undo'].includes(command.kind)
      || Object.keys(command).some((k) => !['operationId', 'instanceId', 'expectedVersion', 'kind', 'preset', 'target'].includes(k))
      || (command.kind === 'undo' ? command.preset !== undefined || !textId(command.target) : command.target !== undefined)
      || (command.preset !== undefined && !textId(command.preset)) || (command.target !== undefined && !textId(command.target))) return failure('invalid_command');
    const key = JSON.stringify([command.instanceId, command.expectedVersion, command.kind, command.preset ?? null, command.target ?? null]);
    const prior = receipts.get(command.operationId);
    if (prior) return prior.key === key ? { ...copy(prior.result), replayed: true, currentVersion: version } : failure('operation_identity_reused');
    if (command.expectedVersion !== version) return failure('stale_version');
    const before = copy(current);
    if (command.kind === 'initialize') {
      if (Object.hasOwn(current, 'face')) return failure('already_initialized');
      if (!Object.hasOwn(data.presets, command.preset ?? '')) return failure('unknown_preset');
      current.face = newFace(data, command.preset);
    } else if (command.kind === 'migrate') {
      const face = current.face;
      if (!record(face) || face.v !== 2) return failure('unsupported_version');
      if (command.preset !== undefined && face.base !== undefined && command.preset !== face.base) return failure('conflicting_preset');
      const preset = command.preset ?? face.base;
      if (!Object.hasOwn(data.presets, preset ?? '')) return failure('unknown_preset');
      for (const k of ['slots', 'colours', 'paint', 'adj', 'grade', 'saved']) if (face[k] !== undefined && !record(face[k])) return failure('malformed_face');
      for (const k of ['history', 'future', 'refs']) if (face[k] !== undefined && !Array.isArray(face[k])) return failure('malformed_face');
      const candidate = copy(face), defaults = newFace(data, preset);
      for (const [k, value] of Object.entries(defaults)) if (!Object.hasOwn(candidate, k)) candidate[k] = copy(value);
      // A new catalog slot is absent, not an invented worn part. Keep all existing values.
      candidate.slots = copy(face.slots ?? {});
      for (const slot of data.slots) if (!Object.hasOwn(candidate.slots, slot.name)) candidate.slots[slot.name] = NONE;
      candidate.colours = copy(face.colours ?? {});
      for (const [key, value] of Object.entries(defaults.colours)) if (!Object.hasOwn(candidate.colours, key)) candidate.colours[key] = value;
      current.face = candidate;
    } else {
      const target = receipts.get(command.target);
      if (!target || target.kind === 'undo') return failure('unknown_operation');
      if (target.afterVersion !== version) return failure('intervening_change');
      current = copy(target.before);
    }
    const changed = !same(before, current);
    if (changed) version++;
    const result = { status: 'supported', changed, operationId: command.operationId, observation: observe() };
    receipts.set(command.operationId, { key, kind: command.kind, before, afterVersion: version, result: copy(result) });
    return result;
  }
  return Object.freeze({ observe, apply });
}
