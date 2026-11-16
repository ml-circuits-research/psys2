import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requestGraphFromSop as graph, encodeRequestGraph as encode, decodeRequestLabels as decode, requestLabelsToSop as toSop, LabelCodecError, LABEL_LIMITS } from '../training/sop-bert/request-label-codec.mjs';
import { World, inspectRequest } from '../src/vendor/sopworld/sopworld.mjs';
const base = '@s std.request.source text="select 😀 item and change it"\n@r std.request act=declared.custom mood=do source=$s';
const target = '@t std.request.target request=$r mode=existing kind=declared.item name=""';
const leaf = (id, targetId, value, extra = '') => `@${id} std.request.constraint request=$r target=$${targetId} concept=declared.property operator=eq value=${value} polarity=positive character=requirement ${extra}`;
const roundtrip = (text) => {
  const input = graph(text, 'r'), labels = encode(input);
  assert.deepEqual(decode(labels), input);
  assert.deepEqual(graph(toSop(labels), 'r'), input);
  const w = new World(); w.load('@use core.use world=std.request'); w.load(toSop(labels));
  assert.equal(inspectRequest(w, 'r').ok, true);
  return { input, labels };
};
const rejects = (fn, code) => assert.throws(fn, (e) => e instanceof LabelCodecError && (!code || e.code === code));

test('training validator shares the exact application library pin', () => {
  const root = new URL('../src/vendor/sopworld/', import.meta.url), manifest = JSON.parse(readFileSync(new URL('provenance.json', root)));
  assert.equal(manifest.release, '0.194.0');
  assert.equal(createHash('sha256').update(readFileSync(new URL('sopworld.mjs', root))).digest('hex'), manifest.sha256);
});

test('open identities, absent roots and explicit empty strings survive without a sentinel', () => {
  roundtrip(base);
  roundtrip(base.replace('text="select 😀 item and change it"', 'text=""'));
  for (const value of ['none', 'false', '0', '-0.00', '01', '""', '"$t"', '"line\\nquoted \\"word\\""']) {
    const { input, labels } = roundtrip(base + '\n' + target + '\n' + leaf('c', 't', value));
    assert.deepEqual(decode(labels).wires.find((w) => w.id === 'c').attrs.value, [value]);
    assert.equal(Object.hasOwn(input.wires[1].attrs, 'root'), false);
  }
});

test('selector and desired-state closures retain different pointers and repeated members', () => {
  const { labels } = roundtrip(base.replace('source=$s', 'source=$s root=$desired') + '\n' + target + ' selector=$choices\n'
    + leaf('selected', 't', 'before.value', 'source=$s source.start=7 source.end=8') + '\n'
    + leaf('other', 't', 'other.value') + '\n@choices std.request.group request=$r operator=or member=$selected member=$other member=$selected\n'
    + leaf('desired', 't', 'after.value'));
  const output = decode(labels);
  assert.deepEqual(output.wires.find((w) => w.id === 'choices').attrs.member, ['$selected', '$other', '$selected']);
  const sourceField = labels.nodes.find((n) => n.type === 'std.request.constraint').fields.find((f) => f.key === 'source.start');
  assert.equal(labels.tokens[sourceField.values[0].token], '7');
});

test('logical scope and same-name target identities are retained', () => {
  roundtrip(base.replace('source=$s', 'source=$s root=$q') + '\n' + target + '\n@bound std.request.target request=$r mode=bound\n'
    + leaf('inner', 'bound', 'none') + '\n@n std.request.not request=$r of=$inner\n@q std.request.quant request=$r kind=all target=$t bind=$bound body=$n');
  const { labels } = roundtrip(base + '\n' + target + '\n@other std.request.target request=$r mode=existing kind=declared.item name=""\n'
    + '@rel std.request.constraint request=$r target=$t concept=declared.position operator=relation relation=declared.near goal=$other character=requirement polarity=positive');
  assert.notEqual(labels.ids.indexOf('t'), labels.ids.indexOf('other'));
});

test('unresolved diagnostics preserve provenance without becoming absent or executable', () => {
  const input = graph(base + '\n' + target, 'r'); delete input.wires[2].attrs.kind;
  input.unresolved = [{ wire: 't', field: 'kind', source: 's', start: 7, end: 8, reason: 'unresolved symbol', candidates: ['declared.a', 'none'] }];
  const labels = encode(input);
  assert.equal(labels.state, 'unresolved'); assert.deepEqual(decode(labels), input);
  rejects(() => toSop(labels), 'unresolved_labels_are_not_public_requests');
  rejects(() => decode({ ...labels, state: 'complete' }), 'unresolved_state_mismatch');
  const missing = structuredClone(input); missing.unresolved = [];
  rejects(() => encode(missing), 'invalid_request_graph');
  const badSpan = structuredClone(input); badSpan.unresolved[0].end = 999;
  rejects(() => encode(badSpan), 'invalid_unresolved_span');
  const conflicting = structuredClone(input); conflicting.wires[2].attrs.kind = ['none'];
  rejects(() => encode(conflicting), 'unresolved_and_present_field');
});

test('published validator rejects invalid scope, selector reuse and out-of-range Unicode spans', () => {
  const selected = base.replace('source=$s', 'source=$s root=$c') + '\n' + target + ' selector=$c\n' + leaf('c', 't', 'v');
  rejects(() => encode(graph(selected, 'r')), 'invalid_request_graph');
  rejects(() => encode(graph(base + '\n' + target + '\n' + leaf('c', 't', 'v', 'source=$s source.start=0 source.end=99'), 'r')), 'invalid_request_graph');
  const escape = base + '\n' + target + '\n@bound std.request.target request=$r mode=bound\n' + leaf('c', 'bound', 'v');
  rejects(() => encode(graph(escape, 'r')), 'invalid_request_graph');
  rejects(() => encode(graph(base.replace('mood=do', 'mood=ask'), 'r')), 'unsupported_request_profile');
  rejects(() => encode(graph(base + '\n@second std.request act=other mood=do source=$s', 'r')), 'expected_single_request');
});

test('malformed tables, pointers and silent extra payloads fail closed', () => {
  const labels = encode(graph(base, 'r'));
  for (const value of [-1, 99, 1.5, NaN, '0']) rejects(() => decode({ ...labels, request: value }), 'invalid_table_index');
  const badRef = structuredClone(labels); badRef.nodes[1].fields.find((f) => f.key === 'source').values[0].ref = 999;
  rejects(() => decode(badRef), 'invalid_table_index');
  const badToken = structuredClone(labels); badToken.nodes[0].fields[0].values[0].token = labels.tokens.length;
  rejects(() => decode(badToken), 'invalid_table_index');
  rejects(() => decode({ ...labels, tokens: [...labels.tokens, 'unused'] }), 'unused_token_table_entry');
  rejects(() => decode({ ...labels, ids: ['same', 'same'] }), 'invalid_identity_or_token_table');
  const duplicateField = structuredClone(labels); duplicateField.nodes[1].fields.push(duplicateField.nodes[1].fields[0]);
  rejects(() => decode(duplicateField), 'invalid_or_duplicate_field');
  const input = graph(base, 'r'); input.wires[1].attrs.root = [];
  rejects(() => encode(input), 'empty_occurrence_list');
  rejects(() => encode(graph(base.replace('$s', '$external'), 'r')), 'external_or_dangling_reference');
});

test('table and expansion limits reject oversized input instead of truncating', () => {
  const labels = encode(graph(base, 'r'));
  rejects(() => decode({ ...labels, nodes: new Array(LABEL_LIMITS.nodes + 1).fill(labels.nodes[0]) }), 'invalid_or_oversized_array');
  const repeated = structuredClone(labels);
  repeated.nodes[0].fields[0].values = new Array(LABEL_LIMITS.values).fill({ token: 0 });
  rejects(() => decode(repeated), 'label_budget_exceeded');
  const huge = graph(base, 'r'); huge.wires[0].attrs.text = ['"' + 'x'.repeat(LABEL_LIMITS.characters) + '"'];
  rejects(() => encode(huge), 'label_budget_exceeded');
});


test('record key insertion order is immaterial while index zero is an explicit token', () => {
  const input = graph(base + '\n' + target + '\n' + leaf('c', 't', 'none'), 'r');
  const c = input.wires.pop();
  c.attrs = { value: c.attrs.value, ...c.attrs };
  input.wires.unshift(c);
  input.wires = input.wires.map((w) => ({ type: w.type, attrs: w.attrs, id: w.id }));
  const labels = encode(input);
  assert.equal(labels.tokens[0], 'none');
  assert.deepEqual(decode(labels), input);
  assert.deepEqual(graph(toSop(labels), 'r'), input);
  roundtrip(base.replace('mood=do', 'mood=propose'));
});

test('unresolved graphs cannot bypass full logical validation after a field is filled', () => {
  const bad = graph(base.replace('source=$s', 'source=$s root=$cycle') + '\n' + target + '\n@cycle std.request.not request=$r of=$cycle', 'r');
  delete bad.wires[2].attrs.kind;
  bad.unresolved = [{ wire: 't', field: 'kind', source: 's', start: 0, end: 6, reason: 'unknown', candidates: [] }];
  const diagnostic = encode(bad);
  assert.equal(diagnostic.state, 'unresolved');
  rejects(() => toSop(diagnostic), 'unresolved_labels_are_not_public_requests');
  const completed = decode(diagnostic); completed.unresolved = []; completed.wires[2].attrs.kind = ['declared.item'];
  rejects(() => encode(completed), 'invalid_request_graph');
});

test('source intervals count Unicode scalars and cannot use a UTF-16 end offset', () => {
  const short = base.replace('select 😀 item and change it', '😀x');
  roundtrip(short + '\n' + target + '\n' + leaf('c', 't', 'false', 'source=$s source.start=1 source.end=2'));
  rejects(() => encode(graph(short + '\n' + target + '\n' + leaf('c', 't', 'false', 'source=$s source.start=1 source.end=3'), 'r')), 'invalid_request_graph');
});
