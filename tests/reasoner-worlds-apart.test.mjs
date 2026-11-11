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

test('grouping: the conversation worlds share one instance, every game has its own, and the composite is declared in world.sop', async () => {
  const r = matrix.reasoner;
  const conv = ['kids.shop', 'kids.arith', 'kids.tasks', 'kids.time', 'kids.animals', 'kids.shapes', 'user.profile'];
  assert.deepEqual(matrix.set.get('session.conversation').compose.sort(), [...conv].sort(), 'declared, not automatic');
  for (const id of conv) assert.equal(r.instKey(id), 'session.conversation', id);
  for (const id of ['games.tictactoe', 'games.hangman', 'games.guess']) assert.equal(r.instKey(id), id, id);
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  const rs = r.session();
  assert.equal(rs.of('kids.shop'), rs.of('kids.arith'));
  assert.equal(rs.of('kids.shop'), rs.of('user.profile'));
  assert.notEqual(rs.of('games.hangman'), rs.of('games.tictactoe'));
  assert.notEqual(rs.of('games.hangman'), rs.of('kids.shop'));
  assert.deepEqual([...rs.insts.keys()].sort(), ['games.hangman', 'games.tictactoe', 'session.conversation']);
});

test('a session that uses the shop, arithmetic and time has one instance; the games it never opened have none', async () => {
  const { s } = await say(matrix, ['I have 20 lei', 'I buy a ball', 'Tom has 5 apples', 'Today is Friday.']);
  assert.deepEqual([...s.isession.rs.insts.keys()], ['session.conversation']);
});

test('facts of the conversation reach the games only as agents: a name told once is known in every tab, a pet is not', async () => {
  const { s, out } = await say(matrix, ['my name is Ana', 'I have a dog called Rex', 'Let\'s play tic tac toe', 'what is my name?']);
  assert.equal(out[3], 'Your name is Ana.');
  const ttt = s.isession.rs.of('games.tictactoe');
  assert.ok(ttt.ofType('core.agent').length >= 1, 'the agents are copied into the game');
  assert.equal(ttt.ofType('kids.animals.pet').length, 0, 'the pet of the conversation is not in the game');
  const hm = s.isession.rs.of('games.hangman');
  assert.equal(hm.ofType('kids.animals.pet').length, 0, 'nor in the other game');
});

test('shared people: "Ana has 3 apples / she eats 1 / how many" is 2, with a game open in between', async () => {
  const { out } = await say(matrix, ['my name is Ana', 'Let\'s play tic tac toe', 'Ana has 3 apples', 'she eats 1', 'how many apples does she have?']);
  assert.match(out[4], /Ana has 2 apples/);
});

test('arith still counts what the user buys in the shop (the rule that read the shop world is in the one instance now)', async () => {
  const { s } = await say(matrix, ['I have 20 lei', 'I buy 2 balls']);
  assert.equal(s.isession.rs.of('kids.arith').ofType('kids.arith.buy').length, 1, 'the purchase is a buy of the user in the arithmetic rules');
});

test('a game does not write into another game: each instance keeps its own wires', async () => {
  const { s } = await say(matrix, ['Play hangman with the word zebra', 'Let\'s play tic tac toe', 'center']);
  const rs = s.isession.rs;
  assert.equal(rs.of('games.hangman').ofType('ttt.move').length, 0);
  assert.equal(rs.of('games.tictactoe').ofType('hm.game').length, 0);
});

// ---- undo across the instances (UNDO-1) -------------------------------------------------------------------------------------------------------

const named = (t) => /took back|took that back|forgot/.test(t);

test('undo, hangman: every undo names what it took back, newest first across the instances, and the purchase is back at the end', async () => {
  const { s, out } = await say(matrix, ['I have 20 lei', 'I buy a ball', 'add milk to my shopping list', 'Play hangman with the word zebra', 'new game', 'Is there a Z?', 'undo', 'undo', 'undo', 'undo', 'undo', 'how much money do I have?']);
  assert.match(out[6], /took back your last guess/);
  assert.match(out[7], /took back the new game/);
  assert.match(out[8], /took back the new game/, 'the first game of the session');
  assert.match(out[9], /took that back: "add milk to my shopping list"/);
  assert.match(out[10], /took that back: "I buy a ball"/);
  assert.match(out[11], /20 lei/);
  assert.equal(s.isession.rs.turns.length, 1, 'only "I have 20 lei" is left to take back');
  assert.equal(out.slice(6, 11).filter((t) => !named(t)).length, 0, 'no undo says it took something back without saying what');
});

test('undo, hangman: after one guess two undos do not both say "your last guess"; when nothing is left it says so', async () => {
  const { out } = await say(matrix, ['Play hangman with the word zebra', 'Is there an E?', 'undo', 'undo', 'undo', 'undo']);
  assert.match(out[2], /took back your last guess/);
  assert.match(out[3], /took back the new game/);
  assert.match(out[4], /nothing more to undo/i);
  assert.match(out[5], /nothing more to undo/i);
});

test('undo, tic-tac-toe: the move, then what came before it in any world, each named, and money changes back', async () => {
  const { s, out } = await say(matrix, ['I have 20 lei', 'I buy a ball', 'add milk to my shopping list', 'Let\'s play tic tac toe', 'center', 'undo', 'undo', 'undo', 'how much money do I have?']);
  assert.match(out[5], /took back your last move and my answer/);
  assert.match(out[6], /took that back: "add milk to my shopping list"/);
  assert.match(out[7], /took that back: "I buy a ball"/);
  assert.match(out[8], /20 lei/);
  assert.equal(s.isession.state['games.tictactoe']?.board.filter(Boolean).length ?? 0, 0);
});

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
