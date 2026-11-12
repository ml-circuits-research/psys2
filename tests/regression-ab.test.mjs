// SPDX-License-Identifier: AGPL-3.0-only
// REGRESSION-AB (spec 15, "The session timeline: late replies"): in matrix mode the engine's late reply ("Meanwhile I play knight to c6.") is no step of the
// user's next turn, so "undo" takes back exactly what the world's own undo takes back, and "What did you do?" names the undo. The three chess dialogues of the
// A/B (dlg.gms#002, dlg.gms#006, dlg.doc#035), and the engine reply that arrives as an observation (Stockfish in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const engines = { ops: await engineWith('ops'), matrix: await engineWith('matrix') };
const play = async (mode, lines) => {
  const s = engines[mode].createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'chess' });
  const out = [];
  for (const l of lines) out.push((await s.send(l, {})).text);
  return { s, out, chess: () => s.state()['games.chess'] };
};

for (const mode of ['ops', 'matrix']) {
  test(`dlg.gms#006 (${mode}): undo after a late engine reply takes back the user's move only`, async () => {
    const { out, chess } = await play(mode, ["Let's play chess.", 'e4', 'Make your move.', 'now the knight to f3', 'undo']);
    assert.match(out[3], /Meanwhile I play .*You play knight to f3/);
    assert.match(out[4], /took back your last move\. It is your move\./);
    assert.equal(chess().history.length, 2);
    assert.equal(chess().history[0], 'e4');
    assert.equal(chess().turn, 'white');
    assert.equal(chess().pendingEngine, false);
  });

  test(`dlg.gms#002 (${mode}): undo after "hurry up" takes back the move and the reply, and the next move is playable`, async () => {
    const { out, chess } = await play(mode, ["Let's play chess.", 'd4', 'Make your move.', 'Hurry up.', 'Undo.', 'Knight to c3.']);
    assert.match(out[3], /I play/);
    assert.match(out[4], /took back your last move and my reply\. We are back at the start\. It is your move\./);
    assert.match(out[5], /^You play knight to c3\.$/);
    assert.deepEqual(chess().history, ['Nc3']);
  });

  test(`dlg.doc#035 (${mode}): "What did you do?" after an undo names the undo`, async () => {
    const { out } = await play(mode, ["Let's play chess.", 'e4', 'What is on the board?', 'Undo that.', 'What did you do?']);
    assert.match(out[3], /took back your last move/);
    assert.match(out[4], /You said "Undo that"/);
  });
}

test('a second undo goes on to the move before (matrix = ops)', async () => {
  const lines = ["Let's play chess.", 'e4', 'Make your move.', 'now the knight to f3', 'undo', 'undo'];
  const a = await play('ops', lines), b = await play('matrix', lines);
  assert.deepEqual(b.chess().history, a.chess().history);
  assert.equal(b.out[5], a.out[5]);
});

test('the engine reply that arrives as an observation is no step of the next turn', async () => {
  const { s, chess } = await play('matrix', ["Let's play chess.", 'e4']);
  const obs = s.observe({ effect: 'chess.engine.bestmove', ok: true, data: { bestmove: 'b8c6', fen: chess().fen }, world: 'games.chess' });
  assert.match(obs.text, /I play knight to c6/);
  assert.deepEqual(chess().history, ['e4', 'Nc6']);
  assert.match((await s.send('Knight to f3', {})).text, /You play knight to f3/);
  assert.deepEqual(chess().history, ['e4', 'Nc6', 'Nf3']);
  assert.match((await s.send('undo', {})).text, /took back your last move\. It is your move\./);
  assert.deepEqual(chess().history, ['e4', 'Nc6']);
  assert.equal(chess().pendingEngine, false);
});
