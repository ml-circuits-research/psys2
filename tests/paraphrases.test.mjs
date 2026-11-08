import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelVariant, gradeOf, checkBatch, summarize, normalizedSop } from '../scripts/collect-paraphrases.mjs';

const ok = { matched: true, unparsed: 0, sop: ['a x=1'], state: {}, effects: [] };
const partial = { ...ok, unparsed: 1 };
const fail = { matched: false, unparsed: 1, sop: [], state: {}, effects: [] };

test('grades', () => {
  assert.equal(gradeOf(ok), 'success');
  assert.equal(gradeOf(partial), 'partial');
  assert.equal(gradeOf(fail), 'fail');
});

test('same SOP agrees and keeps its own reading as target', () => {
  assert.deepEqual(labelVariant(ok, { ...ok }), { label_status: 'rules-agree', target_from: 'rules', needs_review: false });
});

test('different SOP differs, target from canonical', () => {
  assert.deepEqual(labelVariant(ok, { ...ok, sop: ['b'] }), { label_status: 'rules-differ', target_from: 'canonical', needs_review: false });
});

test('same state diff or effects agree even when the SOP differs', () => {
  const c = { ...ok, state: { w: { n: 1 } } };
  assert.equal(labelVariant(c, { ...ok, sop: ['b'], state: { w: { n: 1 } } }).label_status, 'rules-agree');
  const e = { ...ok, effects: [{ op: 'x' }] };
  assert.equal(labelVariant(e, { ...ok, sop: ['b'], effects: [{ op: 'x' }] }).label_status, 'rules-agree');
  assert.equal(labelVariant(ok, { ...ok, sop: ['b'] }).label_status, 'rules-differ'); // empty diffs never agree
});

test('unparsed variant: rules-fail with canonical target; partial canonical needs review', () => {
  assert.deepEqual(labelVariant(ok, fail), { label_status: 'rules-fail', target_from: 'canonical', needs_review: false });
  assert.equal(labelVariant(partial, fail).needs_review, true);
  assert.equal(labelVariant(partial, { ...ok, sop: ['b'] }).needs_review, true);
});

test('failed canonical: no trusted target', () => {
  assert.deepEqual(labelVariant(fail, ok), { label_status: 'rules-unverified', target_from: 'rules', needs_review: true });
  assert.deepEqual(labelVariant(fail, fail), { label_status: 'rules-fail', target_from: null, needs_review: true });
});

test('wire ids are normalized by position', () => {
  const w = (id, ref) => ({ id, type: 't.a', entries: ref ? [{ key: 'k', value: { kind: 'ref', v: ref } }] : [{ key: 'n', value: { kind: 'atom', v: '3' } }] });
  assert.deepEqual(normalizedSop([w('x1'), w('x2', 'x1')]), normalizedSop([w('q7'), w('q9', 'q7')]));
});

test('batch validation and summary', () => {
  assert.ok(checkBatch({}).length > 0);
  assert.deepEqual(checkBatch({ world: 'w', tab: 't', author: 'a', batch: 'b', tasks: [{ id: 'x', goal: 'g', canonical: 'c', variants: ['v'] }] }), []);
  const rec = (role, label, extra = {}) => ({ batch: 'b', task: 't1', goal: 'g', lineage: { role }, label_status: label, attempt: 1, text: 'x', reply: '', split: 'train', needs_review: false, target_from: 'rules', expected_circuit: 'c', ...extra });
  const s = summarize([rec('canonical', 'canonical-ok'), rec('variant', 'rules-agree'), rec('variant', 'rules-fail', { target_from: 'canonical' })]);
  assert.equal(s.canonical_success_rate, 1);
  assert.equal(s.variant_rules_coverage, 0.5);
  const f = summarize([rec('canonical', 'canonical-failed', { target_from: null, expected_circuit: '' })]);
  assert.equal(f.retry.length, 1);
});

// ---- review F2: order of actions is part of the meaning ----------------------------------------------------------
import { parse } from '../src/soplang/index.mjs';
const sopOf = (text) => normalizedSop(parse(text).wires);
const req = (id, seq, action, color) => `@${id} core.request\n    core.request.action=${action}\n    core.request.arg.color=${color}\n    core.seq=${seq}\n`;

test('F2: the same requests in another order are a different SOP', () => {
  const a = sopOf(req('w1', 1, 'avatar.setColor', 'red') + req('w2', 2, 'avatar.setColor', 'blue'));
  const b = sopOf(req('w1', 1, 'avatar.setColor', 'blue') + req('w2', 2, 'avatar.setColor', 'red'));
  assert.notDeepEqual(a, b);
  const create = `@w1 core.request\n    core.request.action=draw.add\n    core.request.arg.shape=circle\n`, del = `@w2 core.request\n    core.request.action=draw.delete\n    core.request.arg.target=$w1\n`;
  assert.notDeepEqual(sopOf(create + del), sopOf(del.replace('$w1', '$w2').replace('@w2', '@w1') + create.replace('@w1', '@w2')));
});

test('F2: renumbered ids and reordered independent facts still compare equal', () => {
  const f1 = `@a core.fact\n    k=1\n`, f2 = `@b core.fact\n    k=2\n`;
  const q = (ref) => `@q core.question\n    core.question.type=t\n    core.question.where.x=$${ref}\n`;
  assert.deepEqual(sopOf(f1 + f2 + q('a')), sopOf(f2.replace('@b', '@z') + f1.replace('@a', '@y') + q('y')));
  assert.deepEqual(sopOf(req('w7', 1, 'x.y', 'red')), sopOf(req('w1', 9, 'x.y', 'red')));
});
