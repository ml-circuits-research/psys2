// Gaps found by the dialogue set (training/eval/dialogues.jsonl, worker-log "Dialogue audit and system gaps"): repairs after questions,
// ellipsis with a whole new expression, feedback and topic return inside games, pronouns, backchannel, explain without a frame,
// the needsState routing key, lead-only "wait, I meant X" and the guessing game's answer correction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { selfCorrect } from '../src/formalizer/rules/expand.mjs';
import { tokenize } from '../src/formalizer/rules/normalize.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = (tab = null) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const say = async (s, ...texts) => { const out = []; for (const t of texts) out.push(await s.send(t)); return out; };

test('repair after an arithmetic question does not throw and redoes the sentence (state of a lazily created world)', async () => {
  const s = session();
  const [, r] = await say(s, 'What is 7 plus 5?', 'No, I meant 7 times 5');
  assert.match(r.text, /7 times 5 is 35/);
  assert.equal(r.trace.discourse.resolved.kind, 'repair');
  const [, r2] = await say(session(), 'what is 6 times 8', 'no, I meant 7 times 5');   // a second question changes no state at all
  assert.match(r2.text, /35/);
});

test('arithmetic ellipsis with a whole new expression replaces the old one', async () => {
  const s = session();
  const rs = await say(s, 'what is 6 times 8', 'and 7 times 8?', 'and 9 minus 2?', 'and double 14', 'and 20 divided by 4?');
  assert.match(rs[1].text, /56/); assert.doesNotMatch(rs[1].text, /336/);
  assert.match(rs[2].text, /9 minus 2 is 7/);
  assert.match(rs[3].text, /28/);
  assert.match(rs[4].text, /is 5/);
});

test('ellipsis replaces a whole noun phrase (number and item) when the fragment has its own quantity', async () => {
  const s = session();
  const rs = await say(s, 'A ball costs 5 lei.', 'A kite costs 4 lei.', 'how much do 3 balls cost?', 'and a kite?', 'what about 5 kites?');
  assert.match(rs[3].text, /4 lei/);
  assert.match(rs[4].text, /20 lei/);
});

test('a question is nothing to undo: feedback apologises without an undo offer, a "no" answers it', async () => {
  const s = session();
  const rs = await say(s, 'what is 2 plus 2', "that's wrong", 'not now');
  assert.match(rs[1].text, /sorry/i); assert.doesNotMatch(rs[1].text, /undo/i);
  assert.equal(rs[1].feedback, 'negative');
  assert.match(rs[2].text, /leave it/);
});

test('negative feedback inside chess and tic-tac-toe offers to take the last move back, "yes" undoes it', async () => {
  for (const [tab, start, move, field] of [['chess', "let's play chess", 'e4', 'history'], ['tictactoe', "let's play tic tac toe", 'center', null]]) {
    const s = session(tab);
    const rs = await say(s, start, move, "that's wrong");
    assert.match(rs[2].text, /take back the last move/); assert.match(rs[2].text, /undo/);
    assert.equal(rs[2].feedback, 'negative');
    const world = tab === 'chess' ? 'games.chess' : 'games.tictactoe';
    await s.send('yes');
    if (field) assert.equal(s.state(world).history.length, 0); else assert.ok(s.state(world).board.every((c) => !c));
  }
});

test('guessing game: "that\'s wrong" is no answer, "no, that\'s wrong" is', async () => {
  const s = session('guess');
  const rs = await say(s, 'I am thinking of an animal', 'yes', "that's wrong");
  assert.match(rs[2].text, /sorry/i);
  assert.equal(s.state('games.guess').asked.length, 1);
  await s.send('no, thats wrong');
  assert.equal(s.state('games.guess').asked.length, 2);
});

test('guessing game: "wait, I meant yes" corrects the previous answer (no self-correction of a lead word)', async () => {
  const s = session('guess');
  const rs = await say(s, 'I am thinking of an animal', 'yes', 'no', 'wait, I meant yes');
  assert.equal(rs[3].trace.selfCorrections, undefined);
  assert.equal(s.state('games.guess').asked[1].answer, 'yes');
  assert.match(rs[3].text, /changed my note/);
  assert.equal(s.state('games.guess').count, 2);
  assert.equal(selfCorrect(tokenize('wait, I meant yes', 0, { keepFillers: true })), null);
});

test('"wait, I meant blue" after a drawing is a repair of the last command', async () => {
  const s = session('draw');
  const rs = await say(s, 'draw a red house', 'wait, I meant blue');
  assert.equal(rs[1].trace.discourse.resolved.kind, 'repair');
  assert.equal(s.state('art.draw').objects[0].color, 'blue');
});

test('topic return: "back to the animal game" is the guessing game, "where were we" skips the current tab', async () => {
  const s = session('guess');
  await say(s, 'I am thinking of an animal', 'yes', "let's play tic tac toe");
  const r = await s.send('back to the animal game');
  assert.match(r.text, /Guess the animal/);
  assert.equal(s.state('ui.shell').activeTab, 'guess');
  const t = session('draw');
  await say(t, 'Draw a red house.', 'Open the fairy tale story.');
  const w = await t.send('Where were we?');
  assert.equal(t.state('ui.shell').activeTab, 'draw');
  assert.match(w.text, /house/i);
});

test('a pronoun in a sentence nobody reads is replaced by the noun of the last question', async () => {
  const s = session();
  const rs = await say(s, 'what sound does a duck make?', 'how many legs does it have?', 'how many legs does that one have?');
  assert.match(rs[1].text, /duck has 2 legs/i);
  assert.equal(rs[1].trace.discourse.resolved.how, 'pronoun');
  assert.match(rs[2].text, /duck has 2 legs/i);
});

test('a lone "lol" / "hmm" / "ok" is neither a command nor a list item nor a name', async () => {
  const s = session();
  await say(s, 'add bread to my shopping list', 'add jam to my shopping list');
  const before = JSON.stringify(s.state('kids.tasks'));
  for (const w of ['lol', 'hmm', 'ok']) { const r = await s.send(w); assert.ok(!r.statuses.includes('supported'), w); assert.equal(JSON.stringify(s.state('kids.tasks')), before); }
});

test('"what did you do?" after chat or a game explains from the last thing said', async () => {
  const s = session();
  const rs = await say(s, 'hi im Eva', 'what did you do?');
  assert.match(rs[1].text, /hi im Eva/); assert.match(rs[1].text, /Eva/);
  assert.doesNotMatch(rs[1].text, /Nobody has moved/);
});

test('needsState: contents phrasings of the charts world do not take other worlds\' questions while there is no chart', async () => {
  const s = session();
  const rs = await say(s, 'how many legs does a spider have', 'how much does a ball cost?', 'cross the eggs off');
  for (const r of rs) assert.doesNotMatch(r.text, /There is no chart yet/);
  const c = session('charts');   // on the charts tab the helpful message stays
  assert.match((await c.send('how many apples?')).text, /no chart yet/i);
  const d = session();
  await say(d, 'make a chart: apples 5, pears 3');
  assert.match((await d.send('how many apples?')).text, /5/);
});

test('docs.reader: ellipsis and ordinal references resolve against the open document and the last thing shown', async () => {
  const s = session('documents');
  const rs = await say(s, 'Open the fairy tale story.', 'Summarize section 2.', 'And section 4?', 'And the last section?', 'And the first section?', 'And the one before that?', 'Summarize that section.');
  assert.match(rs[2].text, /Home Again/); assert.match(rs[3].text, /Home Again/); assert.match(rs[4].text, /Poor Woodcutter/);
  assert.match(rs[5].text, /Section 0|only|first one/);   // before section 1 there is nothing
  const t = session('documents');
  const ts = await say(t, 'Open the fairy tale story.', 'Search for bread.', 'and the one after that?', 'the last one', 'Summarize section 3.', 'the last one', 'and the one before that?');
  assert.match(ts[2].text, /Result 2 of/); assert.match(ts[3].text, /Result 4 of 4/);
  assert.match(ts[5].text, /Home Again/); assert.match(ts[6].text, /Witch/);
});
