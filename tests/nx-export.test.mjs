import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { alignValue, candidatesOf, findSpan, validateRecord, statusOf, opOfWire, segmentsOf, normText } from '../scripts/lib/nx-format.mjs';
import { loadProtected } from '../scripts/export-nx.mjs';

const wire = (type, kv) => ({ type, entries: Object.entries(kv).map(([key, v]) => ({ key, value: { kind: 'atom', v } })) });

test('opOfWire names requests, questions and domain wires', () => {
  assert.equal(opOfWire(wire('core.request', { 'core.request.action': 'tasks.add' })), 'request:tasks.add');
  assert.equal(opOfWire(wire('core.question', { 'core.question.type': 'kids.arith.holding', 'core.question.seek': 'count' })), 'question:kids.arith.holding:count');
  assert.equal(opOfWire(wire('kids.arith.eat', {})), 'kids.arith.eat');
  assert.equal(opOfWire(wire('core.agent', {})), null);
});

test('alignValue finds plurals, number words, camelCase and lists; refs have no candidates', () => {
  assert.deepEqual(alignValue('Tom has five apples', 'apple'), [13, 19]);
  assert.deepEqual(alignValue('buy three pencils', '3'), [4, 9]);
  assert.deepEqual(alignValue('put it in the bottom right corner', 'bottomRight'), [14, 26]);
  assert.deepEqual(alignValue('line up Switch, Modem and Proxy now', 'Switch,Modem,Proxy'), [8, 31]);
  assert.equal(alignValue('hello there', '$new'), null);
  assert.equal(alignValue('hello there', 'mention(shape=circle)'), null);
  assert.equal(alignValue('an apple', 'app'), null, 'whole words only');
  assert.ok(candidatesOf('$e.tom').includes('tom'));
});

test('findSpan skips used spans', () => {
  assert.deepEqual(findSpan('a b a', 'a', [[0, 1]]), [4, 5]);
});

test('validateRecord checks spans against the text and the status', () => {
  const rec = { id: 'x', group: 'g', split: 'train', world: 'w', text: 'draw a red cat', op: 'request:art.draw', ops: ['request:art.draw'], label_source: 'rules-own', labeler: 'rules', status: 'complete',
    slots: [{ key: 'core.request.arg.color', tag: 'w|core.request.arg.color', span: [7, 10], text: 'red', value: 'red' }] };
  assert.deepEqual(validateRecord(rec), []);
  assert.match(validateRecord({ ...rec, slots: [{ ...rec.slots[0], text: 'blue' }] }).join(), /mismatch/);
  assert.match(validateRecord({ ...rec, slots: [{ ...rec.slots[0], span: [7, 99] }] }).join(), /bad span/);
  assert.match(validateRecord({ ...rec, slots: [{ ...rec.slots[0], span: null, text: null }] }).join(), /does not match slots/);
  assert.equal(statusOf({ op: 'none', slots: [] }), 'filler');
  assert.equal(statusOf({ op: 'x', slots: [{ key: 'k', value: '$e.tom', span: null }] }), 'complete', 'a referent may have no span');
});

test('segmentsOf merges overlapping wire spans', () => {
  const t = 'make a box. then connect it';
  const s = segmentsOf(t, [{ span: 'make a box' }, { span: 'then connect it' }]);
  assert.deepEqual(s.map((x) => [x.start, x.end]), [[0, 10], [12, 27]]);
});

test('protected texts are loaded from the eval files', () => {
  const p = loadProtected();
  assert.ok(p.files.length > 3);
  assert.ok(p.set.size > 100);
  assert.ok([...p.set].every((x) => x === normText(x)));
});

test('end to end on 40 dataset rows: records validate', { skip: !existsSync('/home/salboaie/work/psys2/training/dataset/routing.jsonl') }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'nx-'));
  execFileSync('node', ['scripts/export-nx.mjs', '--limit', '40', '--jobs', '1', '--out', dir, '--report', join(dir, 'r.json')], { stdio: 'pipe' });
  for (const f of ['free-rules.jsonl', 'free-diagram.jsonl']) {
    const rows = readFileSync(join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(rows.length > 10, f);
    for (const r of rows) assert.deepEqual(validateRecord(r), [], r.id);
  }
});
