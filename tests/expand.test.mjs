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

test('expand: shared argument (review probe "Make your eyes and body blue")', () => {
  for (const [text, a, b] of [['Make your eyes and body blue', 'eyes', 'body'], ['make the eyes and mouth red', 'eyes', 'mouth']]) {
    const r = read(text);
    assert.equal(r.length, 2, text);
    assert.ok(r.every((x) => x[1] === 'pat.ui.avatar.colour.imp' && x[3] === 'shared-argument'), text);
    assert.deepEqual(r.map((x) => x[2].p), [a, b]);
    assert.deepEqual(r.map((x) => x[2].c), [text.split(' ').pop(), text.split(' ').pop()]);
  }
  const bare = read('eyes and body blue');
  assert.deepEqual(bare.map((x) => [x[2].p, x[2].c, x[3]]), [['eyes', 'blue', 'shared-argument'], ['body', 'blue', 'shared-argument']]);
  const three = read('eyes, body and mouth blue');
  assert.deepEqual(three.map((x) => x[2].p), ['eyes', 'body', 'mouth']);
  const draw = read('make the tree and the house blue');
  assert.deepEqual(draw.map((x) => [x[1], x[2].t, x[2].c]), [['pat.art.draw.recolor', 'the tree', 'blue'], ['pat.art.draw.recolor', 'the house', 'blue']]);
  // provenance: the span of a clause is its own head in the input
  const segs = run('Make your eyes and body blue');
  assert.deepEqual(segs.map((s) => s.span), [[10, 14], [19, 23]]);
  assert.equal(segs[0].expanded.of, 2);
  assert.deepEqual(segs[1].expanded.source, [0, 28]);
  assert.ok(segs.every((s) => /^src#\d+-\d+$/.test(s.wires.at(-1).entries.find((e) => e.key === 'core.source').value.v)));
});

test('expand: verb ellipsis', () => {
  const r = read('make the tree blue and house red');
  assert.deepEqual(r.map((x) => [x[2].t, x[2].c]), [['the tree', 'blue'], ['house', 'red']]);
  const av = read('make the eyes blue and the body red');
  assert.deepEqual(av.map((x) => x[2].c), ['blue', 'red']);
  const bare = read('eyes blue and body red');
  assert.deepEqual(bare.map((x) => [x[2].p, x[2].c]), [['eyes', 'blue'], ['body', 'red']]);
});

test('expand: self-correction keeps only the corrected value', () => {
  const a = read('make your eyes blue, no, green');
  assert.equal(a.length, 1);
  assert.deepEqual([a[0][2].p, a[0][2].c, a[0][3]], ['eyes', 'green', 'self-correction']);
  const b = read('draw a cat, no wait, a dog');
  assert.deepEqual([b[0][1], b[0][2].k, b[0][3]], ['pat.art.draw.x.add.clean', 'dog', 'self-correction']);
  const c = read('make eyes red, I mean blue');
  assert.deepEqual([c[0][2].p, c[0][2].c], ['eyes', 'blue']);
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
  for (const text of ['Draw a dog between the house and the tree.', 'Make a chart: Tom 3, Ana 5', 'make your eyes blue', 'draw a cat and a dog', 'what time is it', 'make the sky dark blue']) {
    assert.ok(run(text).every((s) => !s.expanded), text);
  }
  // an expansion that does not parse completely is not applied
  assert.ok(run('make your eyes and zzz blue').every((s) => !s.expanded));
});

test('expand: full dialog, state after the review probe and the other families', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('Make your eyes and body blue');
  assert.equal(s.state('ui.avatar').robot.colors.body, '74c0fc');
  const t = engine.createSession({ language: 'en' });
  const r = await t.send('make your eyes and body red');
  assert.equal(t.state('ui.avatar').robot.colors.body, 'ff9d9d');
  assert.equal(t.state('ui.avatar').robot.colors.glow, 'ff6b6b');
  assert.ok(!/do not know/.test(r.text), r.text);
  const u = engine.createSession({ language: 'en' });
  await u.send('draw a cat, no wait, a dog');
  assert.deepEqual(u.state('art.draw').objects.map((o) => o.kind), ['dog']);
});
