import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelVariant, gradeOf, checkBatch, summarize, normalizedSop, collectBatch, numbersIn } from '../scripts/collect-paraphrases.mjs';

const ok = { matched: true, unparsed: 0, sop: ['a x=1'], state: {}, effects: [] };
const partial = { ...ok, unparsed: 1 };
const fail = { matched: false, unparsed: 1, sop: [], state: {}, effects: [] };
const pick = ({ label_status, target_from, needs_review }) => ({ label_status, target_from, needs_review });

test('grades', () => {
  assert.equal(gradeOf(ok), 'success');
  assert.equal(gradeOf(partial), 'partial');
  assert.equal(gradeOf(fail), 'fail');
});


test('failed canonical: no trusted target', () => {
  assert.deepEqual(pick(labelVariant(fail, ok)), { label_status: 'rules-unverified', target_from: 'rules', needs_review: true });
  assert.deepEqual(pick(labelVariant(fail, fail)), { label_status: 'rules-fail', target_from: null, needs_review: true });
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

// ---- review F1: labels keep each variant's own parameters --------------------------------------------------------------
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const slot = (key, value) => ({ key, value });
const canon = { matched: true, unparsed: 0, sop: ['q n=3 acc=flat'], slots: [slot('arg.n', '3'), slot('arg.acc', 'flat')], text: 'What key has 3 flats?', state: {}, effects: [] };
const parsedVariant = (text, n, acc, extra = {}) => ({ matched: true, unparsed: 0, sop: [`q n=${n} acc=${acc}`], slots: [slot('arg.n', n), slot('arg.acc', acc)], text, state: {}, effects: [], ...extra });

test('F1: same SOP agrees; a different reading whose values are in the text is rules-own with its own target', () => {
  assert.equal(labelVariant(canon, parsedVariant('which key has three flats', '3', 'flat')).label_status, 'rules-agree');
  const l = labelVariant(canon, parsedVariant('a key with 4 sharps?', '4', 'sharp'));
  assert.deepEqual(pick(l), { label_status: 'rules-own', target_from: 'rules', needs_review: false });
});

test('F1: a parsed variant whose values are not in the text and whose canonical values do not match needs review', () => {
  // the rules read "a key with 4 sharps?" as n=3 flat: a parser error, and the canonical (n=3) does not match the text either
  const l = labelVariant(canon, parsedVariant('a key with 4 sharps?', '3', 'flat', { sop: ['q parsed-as-3-flat'] }));
  assert.deepEqual(pick(l), { label_status: 'needs_review', target_from: null, needs_review: true });
});

test('F1: an unparsed variant inherits the canonical target only when its values match', () => {
  const unparsed = (text) => ({ matched: false, unparsed: 1, sop: [], text, state: {}, effects: [] });
  assert.deepEqual(pick(labelVariant(canon, unparsed('hmm which key got 3 flats'))), { label_status: 'rules-fail', target_from: 'canonical', needs_review: false });
  assert.equal(labelVariant(canon, unparsed('hmm which key got 4 flats')).label_status, 'needs_review'); // another number
  assert.equal(labelVariant(canon, unparsed('hmm which key got 3 sharps')).label_status, 'needs_review'); // another value
  assert.equal(labelVariant({ ...canon, unparsed: 1 }, unparsed('which key got 3 flats')).needs_review, true); // partial canonical
});

test('F1: same state diff agrees even when the SOP differs; the own reading does not depend on a partial canonical', () => {
  const c = { ...canon, state: { w: { n: 1 } } };
  assert.equal(labelVariant(c, { ...parsedVariant('x 3', '3', 'flat'), sop: ['b'], state: { w: { n: 1 } } }).label_status, 'rules-agree');
  assert.equal(labelVariant({ ...canon, unparsed: 1 }, parsedVariant('a key with 4 sharps?', '4', 'sharp')).needs_review, false);
});

test('numbersIn reads digits and number words', () => {
  assert.deepEqual([...numbersIn('three flats, 4 sharps, no keys')].sort(), [0, 3, 4]);
});

// the engine-level acceptance: real rules, real worlds
const engine = await createEngine({ loader: createFsLoader({ roots: ['worlds'] }) });
const collect1 = async (world, tab, setup, canonical, variants) => (await collectBatch(engine, { world, tab, author: 't', batch: 'x', tasks: [{ id: 't1', goal: 'g', setup, canonical, variants }] })).filter((r) => r.phenomenon === 'variant');
const has = (r, ...needles) => needles.every((n) => r.expected_circuit.includes(n));

test('F1 acceptance: the music examples keep their own values', async () => {
  const rs = await collect1('media.music', 'music', [], 'What key has 3 flats?', ['which key has three flats', 'a key with 4 sharps?', 'key with 5 sharps pls', 'which key has seven sharps']);
  assert.ok(has(rs[0], 'arg.n=3', 'arg.acc=flat'));
  assert.ok(has(rs[1], 'arg.n=4', 'arg.acc=sharp') && !has(rs[1], 'arg.n=3'));
  assert.ok(has(rs[2], 'arg.n=5', 'arg.acc=sharp'));
  assert.ok(has(rs[3], 'arg.n=7', 'arg.acc=sharp'));
  for (const r of rs) assert.equal(r.needs_review, false);
});

// minimal pairs: one argument changed; the variant must carry its own value, never the canonical's
const pairs = [
  ['kids.time', 'time', 'What day is 3 days after Monday?', 'What day is 5 days after Monday?', 'where.by=5', 'where.by=3'],
  ['kids.time', 'time', 'What time is 2 hours after 5 o clock?', 'What time is 4 hours after 5 o clock?', 'where.shift=4', 'where.shift=2'],
  ['kids.shapes', 'shapes', 'Which shape has 3 sides?', 'Which shape has 4 sides?', 'where.sides=4', 'where.sides=3'],
  ['kids.shop', 'shop', 'How much are 2 pencils?', 'How much are 5 pencils?', 'where.count=5', 'where.count=2'],
  ['geo.map', 'map', 'top 3 biggest cities in japan', 'top 5 biggest cities in japan', 'arg.n=5', 'arg.n=3'],
  ['kids.arith', 'arith', 'What is 3 plus 4?', 'What is 3 plus 5?', 'where.b=5', 'where.b=4'],
  ['kids.arith', 'arith', 'what is 6 times 7', 'what is 6 times 8', 'where.b=8', 'where.b=7'],
  ['media.music', 'music', 'What key has 3 flats?', 'What key has 2 flats?', 'arg.n=2', 'arg.n=3'],
];
for (const [world, tab, c, v, want, notWant] of pairs) {
  test(`F1 minimal pair (${world}): "${c}" / "${v}"`, async () => {
    const [r] = await collect1(world, tab, [], c, [v]);
    assert.notEqual(r.label_status, 'rules-differ');
    assert.ok(r.expected_circuit.includes(want), `${v}: ${r.label_status} ${r.expected_circuit}`);
    assert.ok(!r.expected_circuit.includes(notWant), `${v} got the canonical value ${notWant}`);
  });
}
