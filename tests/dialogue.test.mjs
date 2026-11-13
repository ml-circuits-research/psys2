// SPDX-License-Identifier: AGPL-3.0-only
// WORLDS-AS-MODULES M1, session.dialogue (spec 22): the kind of every turn is read before any tab world; a fragment is completed from the focus (sopworld std.focus +
// std.fill) or not at all; a complaint or a why-question is answered from the trace of the last turn and never acts; a correction amends the last request; the
// session is offered as facts. Both reasoners. Mechanisms only: no test is about one phrase of one world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { verbOf, placeOf } from '../src/dialog/dialogue.mjs';

for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
  const open = (tab = 'draw') => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
  const kinds = (s) => s.state('art.draw').objects.map((o) => o.kind);
  const saying = async (s, ...ms) => { let r; for (const m of ms) r = await s.send(m); return r; };

  test(`${reasoner}: a fragment with no verb inherits the verb of the focus; the tab gets a complete request`, async () => {
    const s = open();
    await saying(s, 'draw a lake', 'draw a fish');
    const r = await s.send('a sun');
    assert.ok(kinds(s).includes('sun'), r.text);
    assert.equal(r.trace.discourse.resolved?.dialogue ?? r.trace.discourse.meta?.dialogue, 'continuation');
    assert.equal(r.trace.discourse.resolved.rewritten, 'draw a sun');
    const more = await s.send('and a cat');
    assert.ok(kinds(s).includes('cat'), more.text);
  });

  test(`${reasoner}: a fragment with a place and no thing inherits the thing of the focus (std.fill: tier focus, source named)`, async () => {
    const s = open();
    await saying(s, 'draw a lake', 'draw a cat');
    const r = await s.send('on the lake');
    assert.match(r.text, /cat/i, r.text);
    assert.equal(r.trace.discourse.resolved?.dialogue, 'continuation');
    assert.equal(r.trace.discourse.resolved.rewritten, 'move the cat on the lake');
    const f = s.dialogue.fill(['thing', 'action'], { world: 'art.draw' });
    assert.equal(f.thing.tier, 'focus');
    assert.equal(f.thing.source, 'focus');
    assert.ok(f.action.value);
  });

  test(`${reasoner}: the thread ends with another world, a cancellation or a bare answer: the tab then gets nothing it cannot read`, async () => {
    const s = open();
    await saying(s, 'draw a dog', 'how are you');
    await s.send('a cat');
    assert.ok(!kinds(s).includes('cat'), 'an unrelated turn ended the thread');
    const t = open();
    await saying(t, 'draw a dog', 'draw', 'never mind');
    await t.send('a cat');
    assert.ok(!kinds(t).includes('cat'), 'a cancellation ended the thread');
  });

  test(`${reasoner}: a complaint never acts; it offers to undo the last action and "yes" does`, async () => {
    const s = open();
    await saying(s, 'draw a house');
    const before = JSON.stringify(s.state('art.draw'));
    const r = await s.send('that is wrong');
    assert.equal(JSON.stringify(s.state('art.draw')), before);
    assert.match(r.text, /undo/i);
    await s.send('yes');
    assert.deepEqual(kinds(s), []);
  });

  test(`${reasoner}: "nah" right after an action is a rejection of it (an offer to undo), a bare "yes please" with nothing pending answers nothing`, async () => {
    const s = open();
    await saying(s, 'draw a house');
    const r = await s.send('nah');
    assert.match(r.text, /undo/i);
    assert.deepEqual(kinds(s), ['house']);
    const t = open();
    const y = await t.send('yes please');
    assert.match(y.text, /yes to what/i);
  });

  test(`${reasoner}: a why-question is answered from the LAST turn in plain words, with an offer to undo, and never runs an action`, async () => {
    const s = open();
    await saying(s, 'draw a house', 'draw a tree');
    const before = JSON.stringify(s.state('art.draw'));
    for (const q of ['why did you do that', 'why is it so low', 'how did you get to chess']) {
      const r = await s.send(q);
      assert.match(r.text, /You said "draw a tree"/, `${q}: ${r.text}`);
      assert.match(r.text, /I read it as a request/);
      assert.match(r.text, /undo/i);
      assert.equal(JSON.stringify(s.state('art.draw')), before, q);
    }
    s.discourse.takePending();
  });

  test(`${reasoner}: a why-question about a turn nobody understood says so (the last turn, not an older one)`, async () => {
    const s = open();
    await saying(s, 'draw a house', 'qwxz plorb');
    const r = await s.send('why did you not answer');
    assert.match(r.text, /qwxz plorb/);
    assert.match(r.text, /could not read/i);
  });

  test(`${reasoner}: a question about the scene and the history is answered from them`, async () => {
    const s = open();
    await saying(s, 'draw 2 cats', 'draw a house');
    assert.match((await s.send('did you draw a cat before?')).text, /^Yes\./);
    assert.match((await s.send('did you draw a dragon?')).text, /^No/);
  });

  test(`${reasoner}: the INPUT-HISTORY flag amends the last request: it is taken back and the edited one is read as a request of its own`, async () => {
    const s = open();
    await s.send('draw a cat');
    const r = await s.send('draw a dog', { correction: { of: 'draw a cat' } });
    assert.deepEqual(kinds(s), ['dog'], r.text);
    assert.match(r.text, /took that back/i);
  });

  test(`${reasoner}: "thats wrong, I asked X": what he says he asked is the request`, async () => {
    const s = open();
    await saying(s, 'draw a house');
    const r = await s.send('thats wrong, i asked how many houses');
    assert.match(r.text, /houses/i, r.text);
    assert.doesNotMatch(r.text, /did not understand/);
  });

  test(`${reasoner}: "X, not Y" does not hand the negated clause to the tab`, async () => {
    const s = open();
    await saying(s, 'draw a house');
    const r = await s.send('make the house red, not blue');
    assert.match(r.text, /red/i, r.text);
    assert.doesNotMatch(r.text, /could not read|not understood|did not act/i);
    assert.equal(s.state('art.draw').objects[0].color, 'red');
  });

  test(`${reasoner}: the session as facts is the content of any request about "the current discussion" (one implementation: a chart, a paragraph)`, async () => {
    const s = open();
    await saying(s, 'draw 3 cars', 'draw a house');
    const f = s.dialogue.facts();
    assert.deepEqual(f.things.map((x) => [x.noun, x.count]).sort(), [['car', 3], ['house', 1]]);
    const chart = await s.send('create a chart about the current discussion');
    assert.equal(chart.segments[0].world ?? chart.segments[0].match?.worldId, 'data.charts', chart.text);
    assert.match(chart.text, /cars 3/);
    const doc = await open('editor').send('write a paragraph about the current discussion');
    assert.ok(doc.text.length > 0);
  });

  test(`${reasoner}: the dialogue memory is plain data and goes back with the undo snapshot`, async () => {
    const s = open();
    await saying(s, 'draw a house', 'a tree');
    const mem = s.memoryJSON();
    assert.deepEqual(JSON.parse(JSON.stringify(mem.dialogue)), mem.dialogue);
    const snap = s.snapshot();
    await s.send('draw a sun');
    s.restore(snap);
    assert.equal(s.dialogue.log.length, mem.dialogue.log.length);
  });
}

test('verbOf and placeOf are read from closed classes only', () => {
  assert.equal(verbOf('move the fish on the lake'), 'move');
  assert.equal(verbOf('please draw 3 cars'), 'draw');
  assert.equal(verbOf('a sun'), null);
  assert.equal(placeOf('move the fish on the lake'), 'on the lake');
  assert.equal(placeOf('draw a sun'), null);
});
