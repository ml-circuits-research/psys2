// SPDX-License-Identifier: AGPL-3.0-only
// Fact namespaces (spec 15, "Namespaces"; user decision 2026-11-11 23:12): every library instance has a namespace, the ids made in a turn carry the turn, so two
// requests never merge facts by accident, what crosses instances is declared, and the library's warnings reach the debug trace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { FormSession } from '../src/formalizer/rules/session.mjs';
import { nsWorld, strip, qualify, inQuestion } from '../src/reasoner/ns.mjs';
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
  assert.equal(rs.of('docs.editor').ns, 'docs.editor', 'docs.editor is a namespace of its own too (N2: an aggregate is told in the namespace of the wires it counts)');
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
  assert.equal(s.state('art.draw').objects.length, 2);   // art.draw is a schema world now: the things are its state, not wires of an instance of its own
  const d = await say(['open the diagram tab', 'add a box called A', 'add a box called A']);
  assert.match(d.text[2], /already a shape named "A"/);
  assert.equal(d.s.state('diagram.sketch').shapes.filter((x) => x.name === 'A').length, 1);   // (the diagram is a schema world too)
});

test('the facade: ids go in qualified and come out bare, the default namespace is read (N5), replace keeps the namespace (N1)', () => {
  const raw = new lib.World({ ns: 'A' });
  raw.load('@agent core.type shared=true\n@t core.type\n@t.k core.slot of=t key=k kind=number\n@t.o core.slot of=t key=o type=agent');
  raw.tell('@e.user agent', { ns: '' });
  const w = nsWorld(raw, 'A');
  assert.equal(w.tell('@x t k=1 o=$e.user').ok, true, 'N5: a bare reference to a fact of a shared type in the default namespace resolves');
  assert.deepEqual([...raw.wires.keys()].sort(), ['A::x', 'e.user']);
  assert.equal(w.get('x').id, 'x');
  assert.equal(w.get('x').attrs.o[0], '$e.user');
  assert.equal(w.has('x'), true);
  assert.equal(w.has('e.user'), true, 'the user, in the default namespace, is found by its bare id');
  assert.equal(w.replace('x', '@x t k=2').ok, true);
  assert.ok(raw.has('A::x') && !raw.has('x'), 'N1: replace keeps the namespace of the wire it replaces');
  assert.deepEqual(w.ofType('t').map((x) => [x.id, x.attrs.k[0]]), [['x', '2']]);
  assert.equal(strip('A', { a: ['$A::x', 'A::y'], b: 3 }).a.join(), '$x,y');
  assert.equal(qualify('A', '$x'), '$A::x');
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

test('N3 (a type declared through core.schema.map reads shared), N4 (a replay keeps the default-namespace facts), N2 (an aggregate counts in its namespace), N6 (check asks in the patch namespace)', () => {
  const raw = new lib.World({ ns: 'A' });
  raw.load('@m core.schema.map from=mytype as=type name=id shared=shared'); raw.load('@agent mytype shared=true\n@t core.type\n@t.k core.slot of=t key=k kind=number');
  assert.ok(raw._compiled().shared.has('agent'), 'N3');
  raw.tell('@e.user agent', { ns: '' });
  raw.tell('@x t k=1');
  const w2 = new lib.World({ ns: 'A' });
  assert.equal(w2._replay(raw.log), null);
  assert.deepEqual([...w2.wires.keys()].filter((k) => !k.startsWith('_')).sort(), [...raw.wires.keys()].filter((k) => !k.startsWith('_')).sort(), 'N4: the replay is the same world');
  const f = nsWorld(w2, 'A');
  const r = f.check({ wires: [{ id: 'y', type: 't', attrs: { k: ['2'] } }] }, { query: { type: 't', seek: 'k', where: { k: '2' } } });
  assert.equal(r.ok, true, 'N6: the check sees the namespace of the patch');
  assert.ok(r.answer, 'N6: the query was answered');
});

test('what is left of N5: a reference to the user in a question is written for the default namespace, in a wire it is not', () => {
  assert.equal(inQuestion('owner=$e.user and $e.users'), 'owner=$::e.user and $e.users');
  assert.deepEqual(inQuestion({ where: { owner: '$e.user' }, n: 3 }), { where: { owner: '$::e.user' }, n: 3 });
});
