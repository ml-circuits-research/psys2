// SPDX-License-Identifier: AGPL-3.0-only
// WORLDS-APART (user decision 2026-11-11, spec 15 "The conversation instance"): one conversation instance per session for the worlds that talk about the same
// people and things, one instance per game, undo across the instances naming what it took back, and the fixes found with it (UNDO-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { garbleCandidates } from '../src/formalizer/voice.mjs';
import { worldVocabulary, FUNCTION_WORDS } from '../src/formalizer/spell.mjs';

const load = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const matrix = await load('matrix');
const ops = await load('ops');
// the sessions of the webchat: rules formalizer with spelling, partial understanding and best effort on (the leniency stages are part of what is tested)
const open = (e) => e.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
const say = async (e, lines) => { const s = open(e); const out = []; for (const l of lines) out.push((await s.send(l, {})).text); return { s, out }; };

test('grouping: the conversation worlds share one instance, every other matrix world has its own, and the composite is declared in world.sop', async () => {
  const r = matrix.reasoner;
  const conv = ['kids.shop', 'kids.arith', 'kids.tasks', 'kids.time', 'kids.animals', 'kids.shapes'];
  assert.deepEqual(matrix.set.get('session.conversation').compose.sort(), [...conv].sort(), 'declared, not automatic');
  for (const id of conv) assert.equal(r.instKey(id), 'session.conversation', id);
  for (const id of ['ui.shell', 'ui.help']) assert.equal(r.instKey(id), id, id);
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  const rs = r.session();
  assert.equal(rs.of('kids.shop'), rs.of('kids.arith'));
  assert.notEqual(rs.of('ui.shell'), rs.of('ui.help'));
  assert.notEqual(rs.of('ui.shell'), rs.of('kids.shop'));
  assert.deepEqual([...rs.insts.keys()].sort(), ['session.conversation', 'ui.help', 'ui.shell']);
});

test('a session that uses the shop, arithmetic and time has one instance; the other worlds it never used have none', async () => {
  const { s } = await say(matrix, ['I have 20 lei', 'I buy a ball', 'Tom has 5 apples', 'Today is Friday.']);
  assert.deepEqual([...s.isession.rs.insts.keys()], ['session.conversation']);
});

test('facts of the conversation reach the other instances only as agents: a name told once is known in every tab, a pet is not', async () => {
  const { s, out } = await say(matrix, ['my name is Ana', 'I have a dog called Rex', 'speak faster', 'what is my name?']);
  assert.equal(out[3], 'Your name is Ana.');
  const sh = s.isession.rs.of('ui.shell');
  assert.ok(sh.ofType('core.agent').length >= 1, 'the agents are copied into the shell');
  assert.equal(sh.ofType('kids.animals.pet').length, 0, 'the pet of the conversation is not in the shell');
});

test('shared people: "Ana has 3 apples / she eats 1 / how many" is 2, with another tab world used in between', async () => {
  const { out } = await say(matrix, ['my name is Ana', 'speak faster', 'Ana has 3 apples', 'she eats 1', 'how many apples does she have?']);
  assert.match(out[4], /Ana has 2 apples/);
});

test('arith still counts what the user buys in the shop (the rule that read the shop world is in the one instance now)', async () => {
  const { s } = await say(matrix, ['I have 20 lei', 'I buy 2 balls']);
  assert.equal(s.isession.rs.of('kids.arith').ofType('kids.arith.buy').length, 1, 'the purchase is a buy of the user in the arithmetic rules');
});

// ---- undo across the instances (UNDO-1) -------------------------------------------------------------------------------------------------------

const named = (t) => /took back|took that back|forgot/.test(t);

test('undo does not age out while the user undoes: a run of undos is not cut off by the age of the history: the purchase before six additions is reached', async () => {
  const lines = ['I have 20 lei', 'I buy a ball'];
  for (const w of ['milk', 'bread', 'eggs', 'rice', 'salt', 'tea']) lines.push(`add ${w} to my shopping list`);
  for (let i = 0; i < 9; i++) lines.push('undo');
  const { out } = await say(matrix, lines);
  assert.match(out[14], /took that back: "I buy a ball"/, 'the seventh undo');
  assert.match(out.at(-1), /nothing more to undo/i);
});

// ---- a removed item leaves nothing that hijacks the next question (both reasoners) -----------------------------------------------------------

for (const [name, e] of [['matrix', matrix], ['ops', ops]]) {
  test(`${name}: after "remove milk from my shopping list", "what is on my shopping list?" is the question it is`, async () => {
    const { out } = await say(e, ['add milk to my shopping list', 'remove milk from my shopping list', 'what is on my shopping list?', 'add bread to my shopping list', 'what is on my shopping list?']);
    assert.match(out[2], /^Your shopping list is empty/);
    assert.doesNotMatch(out[2], /I understood only part|is is/);
    assert.match(out[4], /On your shopping list: bread/);
  });
}

// ---- determinism of the voice repair (the flaky "mcdavatara human") ---------------------------------------------------------------------------

test('garbleCandidates does not depend on the clock: a clock that runs fast gives the same candidates', () => {
  const vocab = worldVocabulary(matrix.set, 'ui.avatar');
  const plain = garbleCandidates('mcdavatara human', { vocab, functionWords: FUNCTION_WORDS });
  const real = Date.now;
  let t = 0;
  Date.now = () => (t += 1000);   // every call is a second later: a wall-clock budget would cut the search short
  let fast;
  try { fast = garbleCandidates('mcdavatara human', { vocab, functionWords: FUNCTION_WORDS }); } finally { Date.now = real; }
  assert.deepEqual(fast, plain);
  assert.match(plain[0].text, /make avatar a human/);
});
