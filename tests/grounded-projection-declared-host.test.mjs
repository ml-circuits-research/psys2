import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectExecutionWorlds } from '../src/dialog/execution-world-inspection.mjs';
import { parse, quote, SCHEMA_TYPES, str } from '../src/vendor/sopworld/sopworld.mjs';
import { inspectGroundedProjection, projectGroundedRequest } from '../src/dialog/grounded-projection.mjs';

const text = 'Make 😀 \\ "quoted"\nname';
const base = { profile: 'creation', act: 'make', mood: 'do', kind: 'fixture.kind', text, values: [] };

test('grounded SOP emits stable IDs and preserves exact names, source, typed results and references', () => {
  const name = '😀 "\\ one\nnext';
  const values = [
    { concept: 'length', token: '12cm', witness: 'previous.typed' },
    { concept: 'label', token: quote('😀'), range: [5, 6] },
    { concept: 'label', token: quote('😀'), range: [5, 6] },
  ];
  const graph = projectGroundedRequest({ ...base, name, values });
  const rows = parse(graph.wires), byId = new Map(rows.map((wire) => [wire.id, wire]));
  assert.equal(graph.request, 'creation.request');
  assert.equal(str(byId.get('creation.source').attrs.text[0]), text);
  assert.equal(str(byId.get('creation.target').attrs.name[0]), name);
  assert.equal(byId.get('creation.request').attrs.root, undefined);
  for (const [index, value] of values.entries()) {
    const result = byId.get('creation.result.' + index);
    assert.equal(result.attrs.value[0], value.token);
    assert.deepEqual(result.attrs.request, ['$creation.request']);
    assert.deepEqual(result.attrs.target, ['$creation.target']);
  }
  assert.deepEqual(byId.get('creation.result.2').attrs.source, ['$creation.source']);
  assert.deepEqual(byId.get('creation.result.2').attrs['source.start'], ['5']);
  assert.match(graph.projection.input, /witness="previous.typed"/);
  assert.ok(graph.projection.support.some((row) => row.rule === 'ground.constraints' && row.from.includes('ground.value.0')));
});

test('SOP emits a singleton result root and rejects ungrounded request relations', () => {
  const input = { ...base, profile: 'context', act: 'change', values: [{ concept: 'color', token: quote('blue') }] };
  const graph = projectGroundedRequest(input), rows = parse(graph.wires);
  assert.deepEqual(rows.find((wire) => wire.id === 'context.request').attrs.root, ['$context.result.0']);
  assert.equal(rows.find((wire) => wire.id === 'context.target').attrs.mode[0], 'existing');
  assert.equal(projectGroundedRequest({ ...input, kind: 'fixture.kind name=wrong' }), null);
  assert.equal(projectGroundedRequest({ ...input, values: [{ concept: 'other', token: '$missing' }] }), null);
});

test('browser transports carry separate schema and policy sources byte for byte', async () => {
  const source = (name) => readFile(new URL('../worlds/app.project/' + name + '.sop', import.meta.url), 'utf8');
  const [policy, schema] = await Promise.all([source('grounded-projection'), source('grounded-projection-schema')]);
  const inspected = inspectGroundedProjection();
  assert.equal(inspected.policy, policy);
  assert.equal(inspected.schema, schema);
  assert.ok(parse(schema).every((wire) => SCHEMA_TYPES.has(wire.type)));
  assert.equal(parse(policy)[0].attrs.world[0], 'app.grounded');
  assert.ok(parse(policy).slice(1).every((wire) => !['core.type', 'core.slot'].includes(wire.type)));
  const graph = await inspectExecutionWorlds({});
  const policyNode = graph.nodes.find((node) => node.id === 'execution:grounded-projection');
  const schemaNode = graph.nodes.find((node) => node.id === 'execution:grounded-projection-schema');
  assert.equal(policyNode.wires, policy);
  assert.equal(schemaNode.wires, schema);
  assert.ok(graph.edges.some((edge) => edge.from === policyNode.id && edge.to === schemaNode.id && edge.label === 'imports schema'));
});
