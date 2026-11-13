// SPDX-License-Identifier: AGPL-3.0-only
// ACTS x SCHEMAS (spec 21): the module `acts`, the schema format, the generators, the generic executor and the graded fallback, proved on a seating plan
// that is a schema and nothing else (tests/fixtures/worlds/test.seating), in BOTH reasoners. No per-phrase patterns anywhere: the cells below are acts and roles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/soplang/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import * as A from '../worlds/acts/acts.mjs';
import { build as buildLexicon } from '../scripts/build-acts-lexicon.mjs';
import { build as buildSchemaWorld } from '../scripts/build-schema-world.mjs';

const FIX = fileURLToPath(new URL('./fixtures/worlds', import.meta.url));
const SEAT = path.join(FIX, 'test.seating');
const IDS = ['core', 'lang.common', 'kids.common', 'ui.help', 'acts', 'test.seating'];
const engineWith = async (reasoner) => {
  const loader = createFsLoader({ roots: [DEFAULT_ROOT, FIX] });
  const list = loader.listWorlds.bind(loader);
  loader.listWorlds = async () => (await list()).filter((id) => IDS.includes(id));
  return createEngine({ loader, options: { reasoner } });
};
const engines = { ops: await engineWith('ops'), matrix: await engineWith('matrix') };
const say = async (e, lines) => { const s = e.createSession({ language: 'en' }); const out = []; for (const l of lines) out.push((await s.send(l)).text); return { s, out }; };
const seatSchema = () => A.parseSchema(parse(readFileSync(path.join(SEAT, 'schema.sop'), 'utf8')).wires);
const S = seatSchema();

// ---- A1 / A2: the module and the generated files ----------------------------------------------------------------------------------------------------
test('the act words of worlds/acts are generated from the seed table, and the schema world files are not stale', async () => {
  assert.equal(readFileSync(new URL('../worlds/acts/lexicon.sop', import.meta.url), 'utf8'), buildLexicon());
  const { files } = await buildSchemaWorld(SEAT);
  for (const [name, text] of Object.entries(files)) assert.equal(readFileSync(path.join(SEAT, name), 'utf8'), text, `${name} is stale: run node scripts/build-schema-world.mjs tests/fixtures/worlds/test.seating`);
});

test('the twelve acts and the six roles are declared; every form belongs to a declared act and role', () => {
  assert.equal(Object.keys(A.ACTS).length, 14);   // twelve acts, undo / redo and save / load counted as two each
  assert.deepEqual(A.ROLES, ['thing', 'set', 'attribute', 'value', 'place', 'amount']);
  for (const f of A.FORMS) { assert.ok(A.ACTS[f.act], f.id); for (const a of f.args) assert.ok([...A.ROLES, 'rel', 'rest'].includes(a), `${f.id}: ${a}`); }
});

test('the schema world has no pattern of its own: a schema of under 60 lines, everything else generated', () => {
  const lines = readFileSync(path.join(SEAT, 'schema.sop'), 'utf8').split('\n').length;
  assert.ok(lines < 60, `schema.sop has ${lines} lines`);
  const pats = readFileSync(path.join(SEAT, 'patterns.sop'), 'utf8');
  assert.match(pats, /^@gen\.test\.seating\.note/);
  assert.ok((pats.match(/core\.pattern/g) ?? []).length <= 45, 'about 40 patterns, independent of the number of kinds');
});

test('a wrong schema is reported with the reason', () => {
  const bad = (txt) => () => A.parseSchema(parse(txt).wires);
  assert.throws(bad('@s acts.schema\n    acts=juggle\n'), /unknown act/);
  assert.throws(bad('@s acts.schema\n    acts=make\n@s.a acts.attr\n    of=ghost\n'), /unknown kind/);
  assert.throws(bad('@s acts.schema\n    acts=make\n@s.k acts.kind\n@s.a acts.attr\n    of=k\n    type=enum\n'), /needs values/);
  assert.throws(bad('@s acts.kind\n'), /no acts.schema/);
});

test('generators: card words, help examples and coverage sentences come from the schema', () => {
  const c = A.card(S);
  assert.ok(c.thing.includes('table') && c.thing.includes('seats') && c.thing.includes('guest'));
  assert.ok(c.acts.includes('place') && c.act.includes('remove'));
  const ex = A.examples(S);
  assert.ok(ex.length >= 25 && ex.includes('Make table 2 blue.') && ex.includes('Who is at table 1?'));
  const sent = A.sentences(S);
  assert.ok(sent.some((x) => x.act === 'remove' && x.kind === 'guest') && sent.some((x) => x.act === 'change' && x.kind === 'table'));
});

// ---- A3: the executor, on state alone (no engine) ----------------------------------------------------------------------------------------------------
const run = (X, st, act, args = {}) => X.run(st, { act, ...args });
test('executor: make, change, place, remove with the state difference, undo one step per request, redo', () => {
  const X = A.createExecutor(S), st = {};
  assert.match(run(X, st, 'make', { thing: 'tables', amount: '2' }).note, /I added table 1 and table 2/);
  const r = run(X, st, 'make', { thing: 'guest', value: 'ann', place: 'table 1', rel: 'at' });
  assert.deepEqual(r.diff.added, ['guest-1']);
  assert.equal(st.items.find((i) => i.name === 'Ann').place.ref, 'table-1');
  const c = run(X, st, 'change', { thing: 'table 2', value: 'blue' });
  assert.deepEqual(c.diff.changed, [{ id: 'table-2', attr: 'colour', from: 'white', to: 'blue' }]);
  assert.match(c.note, /I made table 2 blue \(it was white\)/);
  const m = run(X, st, 'change', { mode: 'more', thing: 'table 1', attribute: 'seats', amount: '2' });
  assert.equal(st.items[0].attrs.seats, 6); assert.match(m.note, /6 seats, 2 more than before/);
  const hist = st.history.length;
  run(X, st, 'remove', { thing: 'all the tables' });
  assert.equal(st.items.length, 1, 'removing the tables leaves the guest');
  assert.equal(st.history.length, hist + 1, 'one undo step per request, however many things it touched');
  assert.match(run(X, st, 'undo').note, /I undid that: I had removed table 1 and table 2/);
  assert.equal(st.items.length, 3);
  assert.match(run(X, st, 'undo').note, /I had .*6 seats|table 1 now has 6 seats/);
  assert.equal(st.items[0].attrs.seats, 4);
  assert.match(run(X, st, 'redo').note, /I did it again/);
  assert.equal(st.items[0].attrs.seats, 6);
  assert.match(run(X, st, 'make', { thing: 'table' }).note, /I added table 3/);
  assert.match(run(X, st, 'redo').note, /nothing to redo/, 'a new act ends the redo');
});

test('executor: limits are said and change nothing (capacity, maximum, range, a table with guests)', () => {
  const X = A.createExecutor(S), st = {};
  run(X, st, 'make', { thing: 'table' });
  run(X, st, 'change', { thing: 'table 1', attribute: 'seats', value: '2' });
  for (const n of ['A', 'B']) run(X, st, 'make', { thing: 'guest', value: n, place: 'table 1' });
  const before = JSON.stringify(st.items);
  assert.match(run(X, st, 'make', { thing: 'guest', value: 'C', place: 'table 1' }).note, /room for 0 more guests|room for 0/);
  assert.match(run(X, st, 'make', { thing: 'tables', amount: '20' }).note, /at most 8 tables; there is 1 now, so I can add 7 more/);
  assert.match(run(X, st, 'change', { thing: 'table 1', attribute: 'seats', value: '99' }).note, /can only be from 1 to 12/);
  assert.match(run(X, st, 'change', { thing: 'table 1', attribute: 'seats', value: '1' }).note, /has 2 guests now/);
  assert.equal(JSON.stringify(st.items.filter((i) => i.kind !== 'guest' || i.name !== 'C')), before.length ? JSON.stringify(st.items) : '');
  assert.equal(st.items.length, 3, 'nothing half-done');
});

test('executor: the why-answer comes from the act log and the schema defaults', () => {
  const X = A.createExecutor(S), st = {};
  run(X, st, 'make', { thing: 'table', text: 'add a table' });
  run(X, st, 'change', { thing: 'table 1', value: 'blue', text: 'make table 1 blue' });
  assert.match(run(X, st, 'ask', { mode: 'why', rest: 'table 1 blue' }).note, /Because you said "make table 1 blue": I made table 1 blue/);
  assert.match(run(X, st, 'ask', { mode: 'why', rest: 'table 1 red' }).note, /Table 1 is not red: its colour is blue/);
  run(X, st, 'make', { thing: 'table' });
  assert.match(run(X, st, 'ask', { mode: 'why', rest: 'table 2 white' }).note, /Nothing I did changed that: table 2 has colour white because that is the default of a table/);
  assert.match(run(X, st, 'ask', { mode: 'last' }).note, /I added table 2/);
});

// ---- A4: delegation and the graded fallback -----------------------------------------------------------------------------------------------------------
test('fallback tier 2: a missing role is filled (focus, scene) and the guess is said', () => {
  const X = A.createExecutor(S), st = {};
  run(X, st, 'make', { thing: 'table' });
  st.focus = { ids: [], place: null, act: null };
  const a = run(X, st, 'change', { value: 'green' });   // no thing and no focus: the only thing in the scene
  assert.match(a.note, /I made table 1 green.*the only thing here/);
  run(X, st, 'make', { thing: 'table' }); run(X, st, 'pick', { thing: 'table 2' });
  const b = run(X, st, 'change', { thing: 'it', value: 'red' });   // focus
  assert.match(b.note, /I made table 2 red.*"it" to mean table 2, the thing we just talked about/);
  const c = run(X, st, 'make', { thing: 'guest', value: 'Zed' });   // place: the scene has two tables with room, so nothing is guessed
  assert.equal(st.items.find((i) => i.name === 'Zed').place, null);
  run(X, st, 'remove', { thing: 'table 1' });
  assert.match(run(X, st, 'make', { thing: 'guest', value: 'Yan' }).note, /at table 2.*the only table with room/);
  assert.deepEqual(a.guesses.length, 1);
});

test('fallback tier 3: an act or a thing that is not here says what is, and where it is (hooks)', () => {
  const X = A.createExecutor(S, { whereKind: (w) => (w === 'hat' ? [{ world: 'avatar' }] : []), whereAct: (a) => (a === 'connect' ? [{ world: 'diagram' }] : []) });
  const st = {};
  assert.match(run(X, st, 'remove', { thing: 'the hat' }).note, /There is no hat in the seating plan\. The avatar has hat\. I can work with tables and guests/);
  assert.match(run(X, st, 'remove', { thing: 'the lamp' }).note, /There is no lamp in the seating plan\. I can work with tables and guests; they have seats and colour/);
  run(X, st, 'make', { thing: 'table' }); run(X, st, 'make', { thing: 'guest', value: 'Ann' });
  assert.match(run(X, st, 'change', { thing: 'Ann', attribute: 'seats', value: '3' }).note, /A table has seats; I have nothing like that here|has no seats; a table has/);
  const small = A.createExecutor({ ...S, acts: new Set(['make', 'undo']) }, { whereAct: (a) => (a === 'connect' ? [{ world: 'diagram' }] : []) });
  assert.match(run(small, {}, 'connect', { thing: 'table 1', place: 'table 2' }).note, /cannot connect things in the seating plan\. The diagram can/);
});

test('fallback tier 4: one question naming the guessed act and thing; the answer is the missing role; a new request cancels it', () => {
  const X = A.createExecutor(S);
  const ctx = { state: {}, lang: { yesNo: (t) => (/^yes$/i.test(t) ? 'yes' : /^no$/i.test(t) ? 'no' : null) } };
  X.operation(ctx, 'make', { thing: 'tables', amount: '2' }); X.operation(ctx, 'make', { thing: 'guest', value: 'Ann' });
  const q = X.operation(ctx, 'place', { thing: 'Ann' });
  assert.match(q.note, /Where should I put guest Ann\?/); assert.equal(ctx.state.inputMode, 'confirm');
  const ans = X.interceptInput(ctx, 'table 2');
  assert.equal(ans.handled, true); assert.match(ans.reply, /I put guest Ann at table 2/); assert.equal(ctx.state.inputMode, null);
  const q2 = X.operation(ctx, 'change', { thing: 'table 1' });
  assert.match(q2.note, /Change what of table 1\? It has seats and colour/);
  assert.deepEqual(X.interceptInput(ctx, 'remove table 2'), { handled: false }, 'a command is not an answer');
  assert.equal(ctx.state.inputMode, null);
  ctx.state.focus.place = null;
  X.operation(ctx, 'place', { thing: 'Ann' });
  ctx.state.items.find((i) => i.name === 'Ann').place = null;
  assert.match(X.interceptInput(ctx, 'no').reply, /I did nothing/);
  const r = X.lastResort({}, 'blorp the table');
  assert.match(r.say, /I did not catch what to do with table/); assert.equal(r.guess.thing, 'table');
  assert.match(X.lastResort({}, 'move the plimp').say, /Do you want me to move|did not catch/);
  assert.ok(!/did not understand/.test(X.lastResort({}, 'asdf qwer').say));
});

test('knowledge hooks: a synonym of a kind, a kind taken from knowledge with a stand-in, defaults from knowledge', () => {
  const DRAW = A.parseSchema(parse('@d acts.schema\n    acts=make\n    acts=remove\n    acts=change\n@d.thing acts.kind\n    plural=things\n    any=knowledge\n@d.colour acts.attr\n    of=thing\n    type=colour\n    default=white\n').wires);
  const know = { kind: (w) => (w === 'villa' ? { standIn: 'house' } : w === 'cat' || w === 'cats' ? { kind: 'thing' } : null), attrDefault: (k, a) => (a === 'colour' ? 'grey' : undefined) };
  const X = A.createExecutor(DRAW, { know }), st = {};
  assert.match(run(X, st, 'make', { thing: 'villa' }).note, /I added the thing.*I have no villa, so I used a house/);
  assert.equal(run(X, st, 'make', { thing: 'cat' }).status, 'supported');
  assert.equal(st.items[1].attrs.colour, 'grey');
  assert.match(run(X, st, 'make', { thing: 'zork' }).note, /There is no zork/);
});

test('send is an effect: it says when the other world cannot be reached and sends when it can', () => {
  const sent = [];
  const X = A.createExecutor(S, { send: (items, to) => { sent.push([items.map((i) => i.id), to]); return to === 'diagram'; } }), st = {};
  run(X, st, 'make', { thing: 'table' });
  assert.match(run(X, st, 'send', { thing: 'table 1', place: 'the avatar' }).note, /cannot reach the avatar/);
  assert.match(run(X, st, 'send', { thing: 'table 1', place: 'the diagram' }).note, /I sent table 1 to the diagram/);
  assert.deepEqual(sent.at(-1), [['table-1'], 'diagram']);
});

test('copy, group, connect, save and load', () => {
  const X = A.createExecutor(S), st = {};
  run(X, st, 'make', { thing: 'tables', amount: '2' });
  assert.match(run(X, st, 'copy', { thing: 'table 1' }).note, /the copy is table 3/);
  assert.match(run(X, st, 'group', { thing: 'the tables' }).note, /I grouped table 1, table 2 and table 3/);
  assert.match(run(X, st, 'group', { mode: 'apart', thing: 'the tables' }).note, /took the group apart/);
  assert.match(run(X, st, 'connect', { thing: 'table 1', place: 'table 2' }).note, /I connected table 1 to table 2/);
  assert.match(run(X, st, 'connect', { thing: 'table 1', place: 'table 2' }).note, /already connected/);
  run(X, st, 'save', { value: 'lunch' }); run(X, st, 'remove', { thing: 'all the tables' });
  assert.equal(st.items.length, 0);
  assert.match(run(X, st, 'load', { value: 'lunch' }).note, /I loaded "lunch"/);
  assert.equal(st.items.length, 3);
  assert.match(run(X, st, 'load', { value: 'dinner' }).note, /nothing saved as "dinner"; I have "lunch"/);
});

test('executor is bounded: history and item limits, and a malformed request never throws', () => {
  const X = A.createExecutor({ ...S, limits: { items: 5, history: 3 } }), st = {};
  for (let i = 0; i < 6; i++) run(X, st, 'make', { thing: 'guest', value: `G${i}` });
  assert.equal(st.items.length, 5);
  assert.ok(st.history.length <= 3);
  for (const bad of [{ act: 'make' }, { act: 'change', thing: '' }, { act: 'ask', mode: 'why' }, { act: 'place', thing: '??' }, { act: 'nonsense' }]) assert.doesNotThrow(() => X.run(st, bad));
});

// ---- through the engine, both reasoners ---------------------------------------------------------------------------------------------------------------
for (const [mode, e] of Object.entries(engines)) {
  test(`${mode}: the generated world loads without problems and its tests.sop pass`, async () => {
    assert.deepEqual(e.problems().filter((p) => p.startsWith('test.seating') || p.startsWith('acts')), []);
    const r = await runWorldTests(e, 'test.seating');
    assert.deepEqual(r.failed, []);
    assert.ok(r.total >= 6);
  });

  test(`${mode}: a conversation on a schema world (focus, why, undo, limits, not-here)`, async () => {
    const { out } = await say(e, ['add 2 tables', 'add a guest called Ann at table 1', 'make table 2 blue', 'why is table 2 blue', 'put Ann at table 2', 'where is Ann', 'remove the hat', 'undo', 'where is Ann', 'select table 2', 'make it red', 'add 3 seats to table 1', 'how many tables are there']);
    assert.equal(out[0], 'I added table 1 and table 2.');
    assert.equal(out[1], 'I added guest Ann at table 1.');
    assert.match(out[2], /I made table 2 blue/);
    assert.match(out[3], /Because you said "make table 2 blue"/);
    assert.match(out[4], /I put guest Ann at table 2/);
    assert.match(out[5], /Guest Ann is at table 2/);
    assert.match(out[6], /There is no hat in the seating plan/);
    assert.match(out[7], /I undid that: I had put guest Ann at table 2/);
    assert.match(out[8], /Guest Ann is at table 1/);
    assert.match(out[10], /I made table 2 red/);
    assert.match(out[11], /Table 1 now has 7 seats, 3 more than before/);
    assert.match(out[12], /There are 2 tables/);
  });

  test(`${mode}: no sentence of the grammar ends in a bare "did not understand"; each reads as its act`, async () => {
    const s = e.createSession({ language: 'en' });
    await s.send('add 2 tables'); await s.send('add a guest called Ann at table 1');
    for (const ex of A.examples(S)) {
      const r = await s.send(ex);
      assert.ok(!/did not understand/i.test(r.text), `"${ex}" -> ${r.text}`);
      assert.ok(r.text.trim().length > 0, ex);
    }
  });

  test(`${mode}: the coverage sentences (every act x kind) are read and answered`, async () => {
    const s = e.createSession({ language: 'en' });
    await s.send('add 3 tables');
    for (const { text, act, kind } of A.sentences(S)) {
      const r = await s.send(text);
      assert.ok(!/did not understand/i.test(r.text), `${act} x ${kind}: "${text}" -> ${r.text}`);
    }
  });

  test(`${mode}: a request while a question is open cancels the question and is read normally`, async () => {
    const { out } = await say(e, ['add 2 tables', 'add a guest called Ann', 'move Ann', 'add a table', 'how many tables are there']);
    assert.match(out[2], /Where should I put guest Ann\?/);
    assert.match(out[3], /I added table 3/);
    assert.match(out[4], /There are 3 tables/);
    const t = await say(e, ['add 2 tables', 'add a guest called Ann', 'move Ann', 'table 2', 'where is Ann']);
    assert.match(t.out[3], /I put guest Ann at table 2/);
    assert.match(t.out[4], /Guest Ann is at table 2/);
  });
}

// ---- found by the 40 natural requests of P2 (cells, not phrases): coordination, names, leftovers, relations -----------------------------------------------
test('executor: coordinated things, unique names, unread leftovers asked not guessed, relations read as the world has them', () => {
  const X = A.createExecutor(S), st = {};
  run(X, st, 'make', { thing: 'tables', amount: '3' });
  assert.match(run(X, st, 'change', { thing: 'tables 1 and 3', value: 'red' }).note, /I made table 1 and table 3 red/);
  assert.match(run(X, st, 'group', { thing: 'table 1 and table 2' }).note, /I grouped table 1 and table 2/);
  run(X, st, 'make', { thing: 'guest', value: 'ann', place: 'table 1' });
  assert.match(run(X, st, 'make', { thing: 'guest', value: 'Ann' }).note, /already a guest Ann/);
  assert.match(run(X, st, 'place', { thing: 'Ann', rel: 'next_to', place: 'table 2' }).note, /I put guest Ann at table 2\. \(I read "next to" as "at": guests go at a table\.\)/);
  const q = run(X, st, 'make', { thing: 'table 4 to have wings' });
  assert.match(q.note, /I did not catch "have wings"/); assert.equal(st.items.filter((i) => i.kind === 'table').length, 3, 'nothing was added on a partly read request');
  assert.match(run(X, st, 'ask', { mode: 'what', attribute: 'seats', thing: 'table 1' }).note, /Table 1 has 4 seats/);
  assert.match(run(X, st, 'ask', { mode: 'what', place: 'table 2' }).note, /At table 2: guest Ann/);
});
