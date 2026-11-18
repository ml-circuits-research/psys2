// Encode grounded evidence and detach the standard graph derived by the SOP rules.
import { World, inspectRequest, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=ac74fb4d82';
import SCHEMA from '../../worlds/app.project/grounded-projection-schema-source.mjs?v=bab6710607';
import POLICY from '../../worlds/app.project/grounded-projection-source.mjs?v=37b8fb59d7';

let base;
const first = (wire, key) => wire.attrs[key]?.[0];
const record = (id, type, fields) => ({
  id, type: 'app.grounded.' + type,
  attrs: Object.fromEntries(Object.entries(fields).filter(([, token]) => token !== undefined).map(([key, token]) => [key, [token]])),
});

function groundingWorld() {
  if (!base) {
    const world = new World({ library: { 'app.grounded': SCHEMA } });
    world.load(POLICY);
    base = world;
  }
  return base;
}

export function inspectGroundedProjection() {
  return { policy: POLICY, schema: SCHEMA, loaded: !!base };
}

export function projectGroundedRequest({ profile, act, mood, kind, text, name, values, witness }) {
  if (typeof text !== 'string' || text.length > 65536 || values.length > 256) return null;
  const atom = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
  if (![profile, act, mood, kind, ...values.map(({ concept }) => concept)].every((value) => typeof value === 'string' && atom.test(value))) return null;
  const world = groundingWorld().fork();
  const input = serialize([
    record('ground.input', 'input', {
      profile, act, mood, kind, text: quote(text), name: name === undefined ? undefined : quote(name),
      count: String(values.length), witness: witness === undefined ? undefined : quote(witness),
    }),
    ...values.map(({ concept, token, range, witness: origin }, index) => record('ground.value.' + index, 'value', {
      input: '$ground.input', index: String(index), concept, value: token,
      start: range ? String(range[0]) : undefined, end: range ? String(range[1]) : undefined, witness: origin === undefined ? undefined : quote(origin),
    })),
  ]);
  if (!world.tell(input, { factsOnly: true }).ok) return null;
  const aliases = world.ofType('app.grounded.alias');
  const names = new Map(aliases.map((row) => [first(row, 'wire'), str(first(row, 'id'))]));
  if (aliases.length !== values.length + 3 || names.size !== aliases.length || new Set(names.values()).size !== names.size) return null;
  const nodes = aliases.map((row) => {
    const source = world.get(first(row, 'wire').slice(1)), type = first(row, 'output'), keys = world.schema(type).keys;
    const attrs = Object.fromEntries(Object.entries(source.attrs).filter(([key]) => Object.hasOwn(keys, key))
      .map(([key, tokens]) => [key, tokens.map((token) => names.has(token) ? '$' + names.get(token) : token)]));
    return { id: names.get(first(row, 'wire')), type, attrs };
  });
  const root = nodes.find((node) => node.type === 'std.request');
  if (!root) return null;
  const wires = serialize(nodes);
  const checked = new World();
  checked.use('std.request');
  if (!checked.tell(wires, { factsOnly: true }).ok || !inspectRequest(checked, root.id).ok) return null;
  const support = aliases.map((row) => ({ wire: str(first(row, 'id')), rule: row.meta.via, from: [...row.meta.from] }));
  return { request: root.id, wires, projection: { input, output: wires, support } };
}

export function observeGroundedProjection(session, projection) {
  try {
    session.engine?.onWorldActivity?.({
      nodeIds: ['component:library', 'execution:grounded-projection'], phase: 'stage',
      operation: 'app.grounded.project', label: 'Project grounded request evidence',
      wires: projection.input + '\n' + projection.output, support: projection.support,
    });
  } catch {
    // Inspection cannot change the request.
  }
}
