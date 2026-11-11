// SPDX-License-Identifier: AGPL-3.0-only
// art.draw on the matrix reasoner (spec 15, "art.draw and diagram.sketch on the matrix"): the scene is wires of the library (derived back
// without loss), the rules refuse what cannot be and derive what is in the picture, a request about a thing that is not there is refused with the reason, undo and redo are
// the session timeline's in the world's words, and the replies are the operations' with the switch on and off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { toState as drawState, adopt as drawAdopt, guard as drawGuard } from '../worlds/art.draw/fns.mjs';
import { KINDS } from '../worlds/art.draw/ops.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const matrix = await engineWith('matrix');
const ops = await engineWith('ops');
const session = (e, tab) => { const s = e.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const run = async (e, tab, lines) => { const s = session(e, tab); const out = []; for (const l of lines) out.push((await s.send(l, {})).text); return { s, out }; };
const inst = (s, id) => s.isession.rs.insts.get(id).world;
const stateOf = (s, id) => JSON.parse(JSON.stringify(s.state()[id]));
const strip = ({ history, future, undo, redo, lastLabel, ...rest }) => rest;   // the undo history is the library's in matrix mode, a key of the state in ops
// after an undo the library has rewound the counters (the next id, the opener count, the revision), which the operations' own undo never did
const nocount = ({ nextId, seq, seed, rev, ...rest }) => rest;
const sameState = (a, b) => assert.deepEqual(nocount(strip(a)), nocount(strip(b)));
const refuse = (s, id, patch) => { Object.assign(s.isession.state[id], patch); return s.isession.rs.adoptState(s.isession); };

test('art.draw: the kinds of the matrix are the kinds of the board (a test keeps them in step)', () => {
  const sop = matrix.set.get('art.draw').raw.matrix;
  const enumKinds = [...sop.match(/@ad\.k\.o\.kind [^\n]+/)[0].matchAll(/enum=(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(enumKinds, Object.keys(KINDS).sort());
});

test('art.draw: the scene is wires, and toState derives the session state back without loss', async () => {
  const { s } = await run(matrix, 'draw', ['draw a red house', 'draw two green trees', 'put a big yellow sun in the top right corner', 'select the house', 'make it blue', 'make it night', 'undo', 'redo']);
  const w = inst(s, 'art.draw');
  const objs = stateOf(s, 'art.draw').objects;
  assert.equal(w.ofType('art.draw.object').length, objs.length);
  assert.ok(objs.length > 4);
  assert.equal(w.ofType('art.draw.scene').length, 1);
  assert.equal(JSON.stringify(drawState({ find: (t) => w.ofType(t) })), JSON.stringify(s.state()['art.draw']), 'library = session state, key by key and in order');
  assert.deepEqual(drawAdopt({ state: stateOf(s, 'art.draw'), find: (t) => w.ofType(t) }), { retract: [], tell: '', sets: [] }, 'nothing left to take over');
  assert.equal(stateOf(s, 'art.draw').history, undefined, 'the history is the library\'s, not a key of the state');
});

test('art.draw: a thing that moved is one set of its wire, not a new wire (the cost of churn)', async () => {
  const { s } = await run(matrix, 'draw', ['draw three trees', 'draw a house']);
  const w = inst(s, 'art.draw');
  const state = stateOf(s, 'art.draw');
  const before = w.ofType('art.draw.object').map((x) => x.id).sort();
  state.objects.forEach((o) => { o.x += 10; });
  const plan = drawAdopt({ state, find: (t) => w.ofType(t) });
  assert.deepEqual(plan.retract, []);
  assert.equal(plan.tell, '');
  assert.ok(plan.sets.every((x) => ['x', 'obj'].includes(x.key)), 'only the coordinate and the object text change');
  assert.equal(plan.sets.length, state.objects.length * 2);
  assert.deepEqual(w.ofType('art.draw.object').map((x) => x.id).sort(), before);
});

test('art.draw: what is in the picture is derived (the number of things and of each kind) and the questions are answered from it', async () => {
  const { s, out } = await run(matrix, 'draw', ['draw three red trees', 'draw a blue house', 'how many trees are there', 'how many red things are there', 'is there a house', 'is there a cat', 'how many blue houses are there', 'how many things are there']);
  const w = inst(s, 'art.draw');
  const tally = Object.fromEntries(w.ofType('art.draw.tally').map((x) => [x.attrs.kind[0], x.attrs.n[0]]));
  assert.equal(Object.keys(tally).length, Object.keys(KINDS).length, 'every kind has its count, an empty one has 0');
  assert.deepEqual(Object.fromEntries(Object.entries(tally).filter(([, n]) => n !== '0')), { tree: '3', house: '1' });
  assert.equal(tally.cat, '0');
  assert.equal(w.ofType('art.draw.total')[0].attrs.n[0], '4');
  const o = await run(ops, 'draw', ['draw three red trees', 'draw a blue house', 'how many trees are there', 'how many red things are there', 'is there a house', 'is there a cat', 'how many blue houses are there', 'how many things are there']);
  assert.deepEqual(out, o.out, 'the same words with the switch on and off');
  assert.equal(out[2], 'There are 3 trees in your picture.');
  assert.match(out[4], /^Yes! There is a house /);
  assert.equal(out[5], 'No, there is no cat in your picture yet.');
  // the wires the answer rests on are what "why" cites
  const why = await s.send('why', {});
  assert.match(why.text, /how many things|the picture|asked me/i);
});

test('art.draw: a request about a thing that is not there is refused by the rules, with the reason', async () => {
  const { s, out } = await run(matrix, 'draw', ['move the green circle to the left', 'draw a red circle', 'make the cat blue', 'move the green circle to the left', 'is the cat red']);
  assert.equal(out[0], 'I can not find a green circle in your picture. Your picture is empty. Try "draw a red house".');
  assert.equal(out[2], 'I can not find a cat in your picture.');
  assert.equal(out[3], 'I can not find a green circle in your picture. But there is a red circle, so you can say "the circle".', 'the operations give the hint when the kind is there in another colour');
  assert.equal(stateOf(s, 'art.draw').objects.length, 1, 'nothing was changed');
  const o = await run(ops, 'draw', ['move the green circle to the left', 'draw a red circle', 'make the cat blue', 'move the green circle to the left']);
  assert.deepEqual(out.slice(0, 4), o.out, 'the same words with the switch on and off');
  // the refusal is the deny's `why`
  const g = drawGuard({ action: 'draw.move', args: { phrase: 'the blue star to the left' }, check: ({ wires }) => inst(s, 'art.draw').check({ wires }) });
  assert.equal(g.note, 'I can not find a blue star in your picture.');
  assert.equal(drawGuard({ action: 'draw.move', args: { phrase: 'it to the left' }, check: () => ({ ok: true }) }), null, '"it" is left to the operations');
});

test('art.draw: a scene the rules cannot allow is refused with the reason, and the picture goes back', async () => {
  for (const [patch, why] of [
    [(st) => { st.selected = 'o99'; }, 'The selected thing o99 is not in the picture.'],
    [(st) => { st.last = ['o98']; }, 'O98, the thing the last command touched, is not in the picture.'],
    [(st) => { st.objects.push({ ...st.objects[0] }); }, 'Two things in the picture have the same name, o1.'],
    [(st) => { st.objects[0].size = 0; }, 'A house cannot have a size of 0.'],
    [(st) => { st.objects[0].kind = 'dragon'; }, null],
    [(st) => { st.ground = 'lava'; }, null],
  ]) {
    const { s } = await run(matrix, 'draw', ['draw a red house']);
    const before = JSON.stringify(s.state()['art.draw']);
    const st = s.isession.state['art.draw'];
    patch(st);
    const refused = s.isession.rs.adoptState(s.isession);
    assert.ok(refused, 'refused');
    if (why) assert.equal(refused.why, why);
    assert.equal(JSON.stringify(s.state()['art.draw']), before, 'the state is the library\'s again');
  }
});

test('art.draw: undo and redo go through the library (undo=, redo=) in the words of the board, and a selection is no step', async () => {
  const { s, out } = await run(matrix, 'draw', ['draw a red house', 'make it night', 'select the house', 'undo', 'redo', 'undo', 'undo', 'undo']);
  assert.equal(out[3], 'OK, I undid it (made it night).', 'the selection is a view, the undo takes back what changed the picture');
  assert.equal(out[4], 'OK, I did it again.');
  assert.equal(out[5], 'OK, I undid it (made it night).');
  assert.match(out[6], /^OK, I undid it \(drew a red house\)\.$|^OK, I undid it\.$/);
  assert.equal(out[7], 'There is nothing more to undo.');
  assert.equal(stateOf(s, 'art.draw').objects.length, 0);
  assert.equal(inst(s, 'art.draw').ofType('art.draw.object').length, 0);
  const o = await run(ops, 'draw', ['draw a red house', 'make it night', 'undo', 'redo']);
  assert.equal(o.out[2], 'OK, I undid it (made it night).');
});

test('art.draw: the same replies, statuses and state with the switch on and off (a scripted session)', async () => {
  const script = ['draw a red house', 'draw two green trees next to the house', 'put a big yellow sun in the top right corner', 'add grass', 'make the house blue', 'move the tree to the left', 'make the sun bigger', 'duplicate the house', 'turn the car around', 'remove the cloud', 'what is in the picture', 'make it night', 'undo', 'make it a sunset', 'clear everything', 'undo'];
  const m = await run(matrix, 'draw', script);
  const o = await run(ops, 'draw', script);
  // the openers ("Ta-da!", "Nice!") count turns in `seq`, which an undo takes back in matrix mode (the board never did): the one wording difference
  const bare = (x) => x.replace(/^(Ta-da!|Here you go!|There!|Done!|Look at that!|Nice!|Voila!) /, '');
  assert.deepEqual(m.out.map(bare), o.out.map(bare));
  sameState(stateOf(m.s, 'art.draw'), stateOf(o.s, 'art.draw'));
});
