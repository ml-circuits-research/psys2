import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { formalize, FormSession } from '../src/formalizer/index.mjs';
import { selfCorrect, sharedArgument, repetition } from '../src/formalizer/rules/expand.mjs';
import { analyze } from '../src/formalizer/rules/normalize.mjs';

// Spec 03 section 1c: conservative pre-parse expansion (review F4 rules side, R2).
const loader = createFsLoader({ roots: [DEFAULT_ROOT] });
const set = await loadWorlds(loader);
const engine = await createEngine({ loader });

const run = (text) => {
  const form = new FormSession();
  form.initDefaults();
  return formalize(text, { worlds: set, session: form, source: 'src' }).segments;
};
const read = (text) => run(text).map((s) => [s.text, s.unparsed ? null : s.match.patternId, s.unparsed ? null : Object.fromEntries(Object.entries(s.match.slots).map(([k, v]) => [k, v.text])), s.expanded?.kind ?? null]);
const toks = (text) => analyze(text)[0].tokens;

test('expand: proposals are pure token lists with provenance', () => {
  const sc = selfCorrect(toks('make your eyes blue, no, green'));
  assert.equal(sc.tokens.map((t) => t.raw).join(' '), 'make your eyes green');
  assert.deepEqual(sc.dropped, [[15, 23]]);
  assert.equal(selfCorrect(toks('make your eyes blue')), null);
  const cands = [...sharedArgument(toks('make your eyes and body blue'))];
  assert.equal(cands[0].clauses.map((c) => c.tokens.map((t) => t.raw).join(' ')).join(' | '), 'make your eyes blue | make your body blue');
  assert.deepEqual(cands[0].clauses[1].own, [19, 23]);
  assert.equal(repetition(toks('move left three times')).n, 3);
  assert.equal(repetition(toks('move left twice')).n, 2);
  assert.equal(repetition(toks('what time is it')), null);
});

test('expand: shared argument ("make the tree and the house blue": one verb and one colour for two things)', () => {
  const draw = read('make the tree and the house blue');
  assert.deepEqual(draw.map((x) => [x[1], x[2].t, x[2].c, x[3]]), [['pat.art.draw.recolor', 'the tree', 'blue', 'shared-argument'], ['pat.art.draw.recolor', 'the house', 'blue', 'shared-argument']]);
  const segs = run('make the tree and the house blue');
  assert.equal(segs.length, 2);
  assert.equal(segs[0].expanded.of, 2);
  assert.ok(segs.every((s) => /^src#\d+-\d+$/.test(s.wires.at(-1).entries.find((e) => e.key === 'core.source').value.v)));
});

test('expand: verb ellipsis', () => {
  const r = read('make the tree blue and house red');
  assert.deepEqual(r.map((x) => [x[2].t, x[2].c]), [['the tree', 'blue'], ['house', 'red']]);
});

test('expand: self-correction keeps only the corrected value', () => {
  const b = read('draw a cat, no wait, a dog');
  assert.deepEqual([b[0][1], b[0][2].k, b[0][3]], ['pat.art.draw.x.add.clean', 'dog', 'self-correction']);
  const seg = run('draw a cat, no wait, a dog')[0];
  assert.deepEqual(seg.expanded.dropped, [[5, 19]]);
});

test('expand: repetition; "then undo" stays a separate clause', () => {
  const a = read('move left three times');
  assert.equal(a.length, 3);
  assert.ok(a.every((x) => x[1] === 'pat.geo.map.w.pan1' && x[3] === 'repetition'));
  const b = read('draw a circle twice then undo');
  assert.deepEqual(b.map((x) => x[1]), ['pat.art.draw.x.add.clean', 'pat.art.draw.x.add.clean', 'pat.art.draw.undo']);
  const c = read('move left 3 times, then undo');
  assert.deepEqual(c.map((x) => x[3]), ['repetition', 'repetition', 'repetition', null]);
  // a clause that already parses with its own repetition slot is untouched
  const d = read('move left twice, then undo');
  assert.deepEqual(d.map((x) => [x[1], x[3]]), [['pat.geo.map.w.pan1', null], ['pat.art.draw.undo', null]]);
  assert.equal(run('move left 3 times')[2].expanded.of, 3);
});

test('expand: never changes sentences that already parse', () => {
  for (const text of ['Draw a dog between the house and the tree.', 'Make a chart: Tom 3, Ana 5', 'draw a cat and a dog', 'what time is it', 'make the sky dark blue']) {
    assert.ok(run(text).every((s) => !s.expanded), text);
  }
});

test('expand: full dialog, state after a self-correction', async () => {
  const u = engine.createSession({ language: 'en' });
  await u.send('draw a cat, no wait, a dog');
  assert.deepEqual(u.state('art.draw').objects.map((o) => o.kind), ['dog']);
});
