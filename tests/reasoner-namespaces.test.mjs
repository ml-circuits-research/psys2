// SPDX-License-Identifier: AGPL-3.0-only
// Fact namespaces (spec 15, "Namespaces"; user decision 2026-11-11 23:12): every library instance has a namespace, the ids made in a turn carry the turn, so two
// requests never merge facts by accident, what crosses instances is declared, and the library's warnings reach the debug trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { FormSession } from '../src/formalizer/rules/session.mjs';
import { nsWorld, strip, qualify, toLib, SHARED_TYPES, NO_NAMESPACE } from '../src/reasoner/ns.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';

const matrix = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
const open = () => matrix.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
const say = async (lines) => { const s = open(); const out = []; for (const l of lines) out.push(await s.send(l, {})); return { s, out, text: out.map((r) => r.text) }; };

test('every instance has a namespace: the conversation, each game, each tab; the library holds qualified ids, the host sees bare ones', async () => {
  const { s } = await say(['I have 20 lei', 'I buy a ball', "Let's play tic tac toe", 'center', 'open the drawing tab', 'draw a house']);
  const rs = s.isession.rs;
  for (const id of ['session.conversation', 'games.tictactoe', 'art.draw']) {
    const inst = rs.of(id);
    assert.equal(inst.ns, id, `${id} is its own namespace`);
    const facts = [...inst.raw.wires.keys()];
    assert.ok(facts.some((k) => k.startsWith(`${id}::`)), `${id}: the library's ids are qualified`);
    assert.ok(facts.filter((k) => k.includes('::')).every((k) => k.startsWith(`${id}::`)), `${id}: no id of another namespace`);
    assert.ok(inst.ofType('core.thing').every((w) => !w.id.includes('::')), `${id}: the host reads bare ids`);
  }
  assert.equal(rs.of('docs.editor').ns, '', 'docs.editor stays in the default namespace (library item: an aggregate is told there)');
  assert.ok(NO_NAMESPACE.has('docs.editor'));
  assert.ok(SHARED_TYPES.has('core.agent'));
  // the facts the user told are found by their bare id, and a reference to them is bare too
  const buy = rs.of('kids.shop').ofType('kids.shop.purchase')[0];
  assert.ok(buy && /^t2_w\d+$/.test(buy.id), `the purchase carries its turn: ${buy?.id}`);
  assert.ok(rs.of('kids.shop').has(buy.id));
  assert.equal(rs.of('kids.shop').get(buy.id).attrs.item[0], 'ball');
});

test('ids made in a turn carry the turn: two requests never make the same id, even when the counter goes back', () => {
  const f = new FormSession();
  assert.equal(f.freshId('w'), 'w1', 'outside a dialogue the ids are as they were');
  f.turn = 4;
  const snap = f.snapshot();
  const a = f.freshId('w');
  f.restore(snap);   // a trial reading is thrown away: the counter goes back
  f.turn = 5;
  const b = f.freshId('w');
  assert.equal(a, 't4_w2');
  assert.equal(b, 't5_w2');
  assert.notEqual(a, b);
  assert.equal(f.clone().turn, 5);
});

test('"I buy a ball" in two turns is two purchases, never one merged fact', async () => {
  const { s, text } = await say(['I have 20 lei', 'I buy a ball', 'I buy a ball', 'how much money do I have?']);
  const buys = s.isession.rs.of('kids.shop').ofType('kids.shop.purchase');
  assert.equal(buys.length, 2, 'two purchases');
  assert.notEqual(buys[0].id, buys[1].id);
  assert.deepEqual(buys.map((w) => w.id.replace(/_w\d+$/, '')), ['t2', 't3'], 'each carries the turn that made it');
  assert.match(text[3], /10 lei left/);
});

test('the same facts told in two namespaces are never one fact; inside one namespace the identity merges (what the turn prefix guards against)', () => {
  const w = new lib.World({});
  w.load('@item core.type\n@item.name core.slot of=item key=name kind=atom id=true\n@item.n core.slot of=item key=n kind=number');
  assert.equal(w.tell('@a item name=ball n=1', { ns: 'one' }).ok, true);
  assert.equal(w.tell('@b item name=ball n=1', { ns: 'two' }).ok, true);
  assert.equal(w.ofType('item').length, 2, 'two namespaces, two facts');
  assert.equal(w.tell('@c item name=ball n=1', { ns: 'one' }).ok, true);
  assert.equal(w.ofType('item').length, 2, 'inside one namespace the same thing is one fact');
});

test('draw objects made in different turns with the same name are two things; the diagram refuses a second shape of the same name', async () => {
  const { s, text } = await say(['open the drawing tab', 'draw a house', 'draw a house', 'how many houses are there?']);
  assert.match(text[3], /2 houses/);
  assert.equal(s.isession.rs.of('art.draw').ofType('art.draw.object').length, 2);
  const d = await say(['open the diagram tab', 'add a box called A', 'add a box called A']);
  assert.match(d.text[2], /already a shape named "A"/);
  assert.equal(d.s.isession.rs.of('diagram.sketch').ofType('diagram.sketch.shape').length, 1);
});

test('the facade: ids go in qualified and come out bare, the default namespace is read, replace keeps the namespace', () => {
  const raw = new lib.World({ ns: 'A' });
  raw.load('@agent core.type\n@t core.type\n@t.k core.slot of=t key=k kind=number\n@t.o core.slot of=t key=o type=agent');
  raw.tell('@e.user agent', { ns: '' });
  const w = nsWorld(raw, 'A');
  assert.equal(w.tell('@x t k=1 o=$e.user').ok, true, 'a reference to the user is written out for the library');
  assert.deepEqual([...raw.wires.keys()].sort(), ['A::x', 'e.user']);
  assert.equal(w.get('x').id, 'x');
  assert.equal(w.get('x').attrs.o[0], '$e.user');
  assert.equal(w.has('x'), true);
  assert.equal(w.has('e.user'), true, 'the user, in the default namespace, is found by its bare id');
  assert.equal(w.replace('x', '@x t k=2').ok, true);
  assert.ok(raw.has('A::x') && !raw.has('x'), 'replace puts the wire back in the namespace (library 0.9.0 drops it into the default one)');
  assert.deepEqual(w.ofType('t').map((x) => [x.id, x.attrs.k[0]]), [['x', '2']]);
  assert.equal(strip('A', { a: ['$A::x', 'A::y'], b: 3 }).a.join(), '$x,y');
  assert.equal(qualify('A', '$x'), '$A::x');
  assert.equal(toLib('@x t o=$e.user p=$e.users'), '@x t o=$::e.user p=$e.users');
  assert.ok(nsWorld(w, 'A') === w, 'a facade is not wrapped twice');
  assert.equal(w.fork().ns, 'A');
});

test('the library warnings are in the reply (debug trace), once, and not in the answer text', async () => {
  const { out } = await say(['I have 20 lei', 'I buy a ball']);
  const w = out[0].warnings;
  assert.ok(Array.isArray(w) && w.length >= 1, 'the first turn reports what the library warned about while it compiled the matrices');
  assert.ok(w.every((x) => x.kind && x.world), 'each has a kind and the instance');
  assert.equal(out[1].warnings, undefined, 'a warning is reported once per session');
  assert.doesNotMatch(out[0].text, /warn|template\.item/i);
});
