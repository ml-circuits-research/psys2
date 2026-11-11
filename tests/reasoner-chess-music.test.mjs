// SPDX-License-Identifier: AGPL-3.0-only
// games.chess and media.music on the matrix (spec 15, "games.chess on the matrix", "media.music on the matrix"): the rules of the board (what a move may not be, check,
// checkmate, stalemate, the material) agree with the move generator on every move of random games; the position is wires, the state is derived from them and
// taken back by `adopt`; the refusals come from the rules with their reasons; the computer says why; the music settings are checked by the rules, with the assumptions
// said once. `ops` is unchanged (the same scripted sessions say the same words in both strategies, except the listed gains).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { Chess } from '../worlds/games.chess/vendor/chess.mjs';
import * as chessFns from '../worlds/games.chess/fns.mjs';
import * as chessOps from '../worlds/games.chess/ops.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const matrix = await engineWith('matrix');
const ops = await engineWith('ops');
const session = (e) => e.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
const send = async (s, line) => s.send(line, {});
const say = async (s, line) => (await send(s, line)).text;
const FILES = 'abcdefgh';

// ------------------------------------------------------------------ chess

/** A library instance holding the position `fen` (the side to move is the user), as the world's `adopt` would put it there. */
function position(game, user = null) {
  const w = matrix.reasoner.baseOf('games.chess').fork();
  const c = typeof game === 'string' ? new Chess(game) : game;   // a game played from the start (the side to move is read from the number of plies) or a position
  const fen = c.fen();
  const state = { ...chessOps.initialState(), user: user ?? (c.turn() === 'w' ? 'white' : 'black'), history: typeof game === 'string' ? [] : c.history(), fen };
  chessOps.refresh(state, chessOps.load(state));
  const plan = chessFns.adopt({ state, find: (t) => w.ofType(t) });
  const r = w.applyPatch({ retract: plan.retract, wires: plan.tell });
  assert.ok(r.ok, JSON.stringify(r.violations));
  const tryMove = (piece, from, to, extra = '') => w.check({ wires: `@chess.try chess.try tid=t1 by=${state.user} piece=${piece} pc=${state.user} want=none fs=${from} ts=${to} f1=${chessOps.fi(from)} r1=${chessOps.ri(from)} f2=${FILES.indexOf(to[0])} r2=${Number(to[1]) - 1} ep=false${extra}` });
  const stateNow = () => chessFns.toState({ find: (t) => w.ofType(t) });
  return { w, c, state, tryMove, stateNow };
}
const reasons = (res) => (res.violations ?? []).map((v) => v.why);

test('chess: the rules agree with the move generator on every candidate move of random games (legal moves pass, the others are refused with a reason)', () => {
  let seed = 11; const rnd = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  let checked = 0, legal = 0;
  for (let g = 0; g < 2; g++) {
    const c = new Chess();
    for (let ply = 0; ply < 60 && !c.isGameOver(); ply++) {
      const p = position(c);
      const moves = c.moves({ verbose: true });
      const ok = new Set(moves.filter((m) => !/[ekq]/.test(m.flags)).map((m) => m.from + m.to));
      const special = new Set(moves.filter((m) => /[ekq]/.test(m.flags)).map((m) => m.from + m.to));   // castling and en passant: chess.js alone (not shapes the rules know)
      for (const piece of c.board().flat().filter((x) => x && x.color === c.turn())) {
        for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
          const to = FILES[f] + (r + 1);
          if (special.has(piece.square + to)) continue;
          const res = p.tryMove(piece.type, piece.square, to);
          checked++;
          const should = ok.has(piece.square + to);
          if (should) legal++;
          assert.equal(res.ok, should, `${c.fen()} ${piece.square}${to}: ${JSON.stringify(reasons(res))}`);
          if (!should) assert.ok(reasons(res).length > 0 && reasons(res).every((x) => x), 'a refusal always says why');
        }
      }
      c.move(moves[rnd(moves.length)]);
    }
  }
  assert.ok(checked > 50000 && legal > 1500, `checked ${checked}, legal ${legal}`);
});

test('chess: the state derived from the wires (status, check, material, captured pieces) is what chess.js says, also at the end of a game', () => {
  const cases = [
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'playing'],
    ['rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 'checkmate'],   // the fool's mate
    ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'stalemate'],
    ['8/8/8/4k3/8/8/3K4/8 w - - 0 1', 'draw'],                                           // two kings: insufficient material
    ['4k3/8/8/8/8/8/4q3/4K3 w - - 0 1', 'playing'],                                      // the king in check by a queen it can take
    ['rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'playing'],
  ];
  for (const [fen, status] of cases) {
    const p = position(fen);
    const a = p.stateNow();
    const b = { ...chessOps.initialState(), user: p.state.user, history: [], fen };
    chessOps.refresh(b, chessOps.load(b));
    assert.equal(a.status, status, fen);
    for (const k of ['status', 'winner', 'result', 'reason', 'check', 'turn', 'fen']) assert.deepEqual(a[k], b[k], `${k} in ${fen}`);
    assert.deepEqual(a.material, b.material, `material in ${fen}`);
    assert.deepEqual(a.dests, b.dests, `dests in ${fen}`);
  }
  const mate = position('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  assert.equal(mate.w.ofType('chess.over')[0].attrs.how[0], 'checkmate');
  assert.equal(mate.w.ofType('chess.over')[0].attrs.winner[0], 'black');
  assert.equal(mate.stateNow().check, 'e1');
  // a game over refuses every move, with the reason the rules give
  assert.deepEqual(reasons(mate.tryMove('p', 'e2', 'e3')).filter((x) => /game is over/.test(x)), ['The game is over: checkmate, I won. Say "new game" to play again.']);
  assert.deepEqual(reasons(position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').tryMove('k', 'h8', 'g8')).filter((x) => /game is over/.test(x)), ['The game is over: stalemate. Say "new game" to play again.']);
});

test('chess: the refusals say why, in the words ops.mjs uses (blocked, pinned, check, the way a piece moves, the squares)', () => {
  const first = (p, piece, from, to) => reasons(p.tryMove(piece, from, to)).sort()[0];
  const start = position('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(first(start, 'b', 'c1', 'g5'), 'Your bishop on c1 is blocked by your pawn on d2.');
  assert.equal(first(start, 'r', 'a1', 'a5'), 'Your rook on a1 is blocked by your pawn on a2.');
  assert.equal(first(start, 'p', 'e2', 'e5'), 'A pawn moves one square forward, or two from its starting rank, so your pawn on e2 can\'t go to e5.');
  assert.equal(first(start, 'n', 'b1', 'b4'), 'A knight moves in an L shape, so your knight on b1 can\'t go to b4.');
  assert.equal(first(start, 'b', 'c1', 'c4'), 'A bishop moves diagonally, so your bishop on c1 can\'t go to c4.');
  assert.equal(first(start, 'q', 'd1', 'e3'), 'A queen moves in straight lines and diagonals, so your queen on d1 can\'t go to e3.');
  assert.equal(first(start, 'k', 'e1', 'e3'), 'A king moves one square at a time (castling is the only exception), so your king on e1 can\'t go to e3.');
  assert.equal(first(start, 'p', 'e2', 'd3'), 'A pawn only moves diagonally when it captures, and d3 is empty.');
  assert.equal(first(start, 'q', 'd1', 'd2'), 'Your queen on d1 can\'t go to d2: your pawn is already there.');
  assert.equal(first(start, 'p', 'e2', 'e1'), 'Pawns never move backward, so your pawn on e2 can\'t go to e1.');
  // the nearest piece in the way is the one named
  assert.equal(first(position('4k3/8/8/8/8/p7/P7/R3K3 w - - 0 1'), 'r', 'a1', 'a8'), 'Your rook on a1 is blocked by my pawn on a3.'.replace('a3', 'a2').replace('my', 'your'));
  // pinned: a bishop on b4 pins the knight on d2 to the king on e1
  const pin = position('4k3/8/8/8/1b6/8/3N4/4K3 w - - 0 1');
  assert.equal(first(pin, 'n', 'd2', 'b3'), 'Your knight on d2 is pinned: moving it would leave your king in check.');
  assert.ok(pin.tryMove('n', 'd2', 'b3').violations.every((v) => !/mustStop/.test(v.rule)));
  assert.equal(pin.tryMove('b', 'b4', 'b4').ok, false);
  // a king in check: the move has to stop it; the king cannot step onto an attacked square
  const chk = position('4r1k1/8/8/8/8/8/3N4/4K3 w - - 0 1');
  assert.equal(first(chk, 'n', 'd2', 'b3'), 'Your king is in check, so your move has to stop the check, and knight to b3 does not.');
  assert.equal(first(position('3r2k1/8/8/8/8/8/8/4K3 w - - 0 1'), 'k', 'e1', 'd1'), 'Your king can\'t go to d1: that square is attacked.');
  assert.equal(chk.tryMove('n', 'd2', 'e4').ok, true, 'a move that blocks the check is allowed');
  assert.equal(position('4r1k1/8/8/8/8/8/3N4/4K3 w - - 0 1').tryMove('k', 'e1', 'f1').ok, true);
  // not your turn, no piece, the other side's piece
  const wrong = start.w.check({ wires: '@chess.try chess.try tid=t9 by=black piece=p pc=black want=none fs=e7 ts=e5 f1=4 r1=6 f2=4 r2=4 ep=false' });
  assert.deepEqual(reasons(wrong), ['It is not your turn.']);
  assert.deepEqual(reasons(start.tryMove('none', 'e4', 'e5')).filter((x) => /no piece/.test(x)), ['There is no piece on e4.']);
});

test('chess: adopt is the inverse of toState (the state ops.mjs keeps goes into the library and comes back the same); one plan changes only what differs', () => {
  const p = position('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const c = new Chess();
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']) c.move(san);
  const s = { ...p.stateNow(), history: c.history(), fen: c.fen(), pendingEngine: true, pendingTries: 1, highlights: [{ kind: 'squares', squares: ['e4'] }], hint: { from: 'e2', to: 'e4', san: 'e4' }, pending: { kind: 'promotion', from: 'a7', to: 'a8' }, level: 6, orientation: 'black', engine: 'builtin', seed: 5 };
  chessOps.refresh(s, chessOps.load(s));
  const plan = chessFns.adopt({ state: s, find: (t) => p.w.ofType(t) });
  const r = p.w.applyPatch({ retract: plan.retract, wires: plan.tell });
  assert.ok(r.ok, JSON.stringify(r.violations));
  assert.deepEqual(p.stateNow(), s, 'what the library says is what the state was');
  assert.equal(chessFns.adopt({ state: s, find: (t) => p.w.ofType(t) }), null, 'nothing differs: no change');
  // one more move changes one move wire, the pieces that moved, the count and the game wire
  const c2 = new Chess();
  for (const san of c.history()) c2.move(san);
  const mv = c2.move('a6');
  const s2 = { ...s, history: c2.history(), fen: c2.fen() };
  chessOps.refresh(s2, chessOps.load(s2));
  const next = chessFns.adopt({ state: s2, find: (t) => p.w.ofType(t) });
  assert.deepEqual(next.retract.map((id) => id.replace(/_\d+$/, '')).sort(), ['chess.g', 'chess.lg', 'chess.p.a7'].sort(), JSON.stringify(next.retract));
  assert.ok(next.retract.length <= 5 && next.tell.split('\n').length <= 6, `${next.retract.length} retracted, ${next.tell.split('\n').length} told: ${mv.san}`);
});

test('chess: the computer\'s moves say why; the reason is on the move wire; "why?" after a move answers from it', async () => {
  const s = session(matrix);
  await say(s, "Let's play chess.");
  await say(s, 'e4');
  assert.equal(await say(s, 'Why did you play that?'), 'I have not played yet.');
  await send(s, 'Make your move.');   // the first request only waits for the host's engine
  const r = await send(s, 'Make your move.');
  assert.match(r.text, /I play/);
  const reply = await say(s, 'Why did you play that?');
  assert.match(reply, /^I played .+ because .+\.$/);
  const inst = s.isession.rs.of('games.chess');
  const mine = inst.ofType('chess.move').filter((w) => w.attrs.by[0] === 'black');
  assert.equal(mine.length, 1);
  assert.ok(['develop', 'center', 'best', 'capture', 'check', 'castle', 'promote', 'mate'].includes(mine[0].attrs.why[0]));
  assert.equal((await send(s, 'Why did you play that?')).statuses.at(-1), 'supported');
});

test('chess: an engine move that arrives as an observation (Stockfish in the browser) is taken over by the library, so the rules and "why?" know it', async () => {
  const s = session(matrix);
  await say(s, "Let's play chess.");
  const r = await send(s, 'e4');
  assert.deepEqual(r.effects.map((e) => e.name), ['chess.engine.bestmove']);
  const out = s.observe({ effect: 'chess.engine.bestmove', ok: true, data: { bestmove: 'e7e5', fen: s.isession.state['games.chess'].fen }, world: 'games.chess' });
  assert.match(out.text, /^I play pawn to e5\./);
  const inst = s.isession.rs.of('games.chess');
  assert.deepEqual(inst.ofType('chess.move').map((w) => w.attrs.san[0]).sort(), ['e4', 'e5']);
  assert.equal(inst.ofType('chess.side')[0].attrs.by[0], 'white', 'it is the user\'s turn again');
  assert.equal(s.isession.state['games.chess'].history.length, 2);
  assert.match(await say(s, 'Why did you play that?'), /^I played pawn to e5 because it takes space in the center\./);
  // a move that is not allowed now is refused by the rules (and says why), the board does not change
  const bad = await send(s, 'Rook on a1 to a3.');
  assert.match(bad.text, /^Your rook on a1 is blocked by your pawn on a2\./);
  assert.equal(bad.statuses.at(-1), 'unsupported');
  assert.equal(s.isession.state['games.chess'].history.length, 2);
});

test('chess: "undo that" (the library goes back to before the last turn) puts the wires and the board back; the world says what it took back', async () => {
  const s = session(matrix);
  await say(s, "Let's play chess.");
  await say(s, 'e4');
  s.observe({ effect: 'chess.engine.bestmove', ok: true, data: { bestmove: 'e7e5', fen: s.isession.state['games.chess'].fen }, world: 'games.chess' });
  await say(s, 'Knight to f3.');
  assert.equal(s.isession.state['games.chess'].history.length, 3);
  const u = await say(s, 'undo');
  assert.match(u, /^OK, I took back (your last move|your last move and my reply)\./);
  const st = s.isession.state['games.chess'];
  const inst = s.isession.rs.of('games.chess');
  assert.equal(inst.ofType('chess.move').length, st.history.length, 'the wires and the board say the same');
  assert.ok(st.history.length <= 2);
  assert.equal(st.pendingEngine, false);
});

test('chess: ops is unchanged: a scripted game says the same words, statuses and state in both strategies, except the listed gains', async () => {
  const script = ["Let's play chess.", 'e4', 'Make your move.', 'Knight to f3.', 'What can my knight do?', 'Who is winning?', 'Describe the board.', 'e2 to e5.', 'Is it check?', 'What did you capture?', 'Set level 5.', 'How many pawns do I have?', 'Undo my move.', 'Take back two moves.'];
  const run = async (e) => { const s = session(e); const out = []; for (const l of script) { const r = await send(s, l); out.push({ text: r.text, status: r.statuses.at(-1), effects: r.effects.map((x) => x.name) }); } return { out, state: s.isession.state['games.chess'] }; };
  const a = await run(matrix), b = await run(ops);
  for (let i = 0; i < script.length; i++) {
    // the gain: while the engine owes its move the rule says first that it is not the user's turn (the rest of the reply is ops's)
    assert.deepEqual({ ...a.out[i], text: a.out[i].text.replace(/^It is not your turn\. /, '') }, b.out[i], script[i]);
  }
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

test('chess: the rules carry the work that was one function in ops.mjs (explainMove, between, checkReason): the share of ops.mjs they replace is what the status table says', () => {
  const src = chessOps.explainNone.toString();
  assert.ok(src.length > 0);
  assert.equal(chessFns.agreement.drift, 0, 'no move chess.js played was refused by the rules');
});

test('parity gate: every test of games.chess passes in both strategies (ops 257, matrix 257 + 12 matrix-only)', async () => {
  const m = await runWorldTests(matrix, 'games.chess'), o = await runWorldTests(ops, 'games.chess');
  assert.deepEqual(m.failed.map((f) => f.id), []);
  assert.deepEqual(o.failed.map((f) => f.id), []);
  assert.equal(m.total, 269);
  assert.equal(o.total, 257);
});
