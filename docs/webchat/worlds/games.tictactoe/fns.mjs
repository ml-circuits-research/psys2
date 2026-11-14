// SPDX-License-Identifier: AGPL-3.0-only
// games.tictactoe on the matrix reasoner (spec 15). The rules (whose turn it is, which squares are free, the three refusals, win / draw) are in matrix.sop;
// this file is what the library cannot say: reading a place the user names, choosing the computer's move (win, block, center, seeded random; minimax at the
// perfect level, shared with ops.mjs), the words of the replies (the same sentences ops.mjs says) and the state the board on the screen reads.
// The game is a set of wires: one `ttt.game` (user, level, seed) and one `ttt.move` per mark on the board. Everything else is derived by the matrix.
// The registered names are prefixed (ttt*): the library keeps one function registry for all worlds.
// Browser-safe. It imports its sibling ops.mjs for the shared tables and the minimax (a world is plain files).
import { NAMES, LEVEL_OF, other, bestMove, findWin, chooseEasy, intro, ending, placeIndex } from './ops.mjs?v=d27ab37dfa';

const GAME = 'ttt.g';
const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const val = (w, k) => un(w?.attrs?.[k]?.[0]);
const q = JSON.stringify;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The moves told so far, oldest first: [{ id, at, by, n, why, line }]. */
const movesOf = (find) => find('ttt.move')
  .map((w) => ({ id: w.id, at: Number(val(w, 'at')), by: val(w, 'by'), n: Number(val(w, 'n')), why: val(w, 'why') || null, line: val(w, 'line') || null }))
  .sort((a, b) => a.n - b.n);

/**
 * The state ops.mjs keeps (and the board on the screen reads), derived from the wires: { board, user, turn, winner, level, seed, last }.
 * The host layer calls it after every change of the library, so the screen cannot show another game than the one the rules know.
 */
export function toState({ find }) {
  const g = find('ttt.game')[0];
  const board = Array(9).fill('');
  const moves = movesOf(find);
  for (const m of moves) board[m.at] = m.by;
  const user = val(g, 'user') || 'X';
  const won = find('ttt.won')[0];
  const winner = won ? val(won, 'winner') : find('ttt.drawn').length ? 'draw' : null;
  const turn = winner ? null : val(find('ttt.turn')[0], 'by') || 'X';
  const lastOf = (by) => moves.filter((m) => m.by === by).at(-1)?.at ?? null;
  return { board, user, turn, winner, level: val(g, 'level') || 'easy', seed: Number(val(g, 'seed') || 20240607), last: { user: lastOf(user), system: lastOf(other(user)) } };
}

const stateOf = (ctx) => toState({ find: ctx.find });
const ok = (value) => ({ value, openTab: 'tictactoe' });
const lineName = (ctx, at, marks, board) => {
  // the line through `at` whose two other squares hold `marks` (the one the system completed or stopped)
  for (const l of ctx.find('ttt.line')) {
    const sq = [val(l, 'a'), val(l, 'b'), val(l, 'c')].map(Number);
    if (sq.includes(at) && sq.filter((i) => i !== at).every((i) => board[i] === marks)) return val(l, 'name');
  }
  return null;
};

/** Replaces the game wire with some values changed (user, level, seed). */
function setGame(ctx, patch) {
  const g = ctx.find('ttt.game')[0];
  const a = { user: val(g, 'user'), level: val(g, 'level'), seed: val(g, 'seed'), ...patch };
  ctx.replace(GAME, `@${GAME} ttt.game user=${a.user} level=${a.level} seed=${a.seed}`);
}

/** The computer plays: chooses a square the way ops.mjs does, tells the move with the reason (and the line it completes or stops). Returns the index. */
function systemMove(ctx, st) {
  const mark = other(st.user), b = st.board.slice();
  const win = findWin(b, mark), block = findWin(b, other(mark));
  let at, why, seed = st.seed;
  if (st.level === 'perfect') { at = bestMove(b, mark); why = at === win ? 'win' : at === block ? 'block' : 'best'; }
  else { const s = { board: b, seed }; at = chooseEasy(s, mark); seed = s.seed; why = win !== null ? 'win' : block !== null ? 'block' : !b[4] ? 'center' : 'random'; }
  const n = st.board.filter(Boolean).length;
  const line = why === 'win' ? lineName(ctx, at, mark, st.board) : why === 'block' ? lineName(ctx, at, other(mark), st.board) : null;
  ctx.tell(`@mv${n} ttt.move by=${mark} at=${at} n=${n} why=${why}${line ? ` line=${q(line)}` : ''}`);
  if (seed !== st.seed) setGame(ctx, { seed });
  return at;
}

/** Back to an empty board with `user` as the user's mark; the computer opens when the user is O. Returns the computer's first square or null. */
function startGame(ctx, user) {
  for (const m of ctx.find('ttt.move')) ctx.retract(m.id);
  for (const r of ctx.find('ttt.resign')) ctx.retract(r.id);
  setGame(ctx, { user });
  return user === 'O' ? systemMove(ctx, stateOf(ctx)) : null;
}

/** The refusal the rules gave, as the answer: the deny's own words (a game that is over comes before a square that is taken). */
function refusal(violations) {
  const v = violations.find((x) => /\.over$/.test(String(x.rule))) ?? violations.find((x) => x.why) ?? violations[0];
  return { status: 'unsupported', note: String(v?.why ?? 'That move is not allowed.'), why: v?.why, openTab: 'tictactoe' };
}

export const fns = {
  tttMove(ctx, args) {
    const p = placeIndex(args);
    if (p.fail) return p.fail;
    const st = stateOf(ctx), at = p.idx, n = st.board.filter(Boolean).length;
    const text = `@mv${n} ttt.move by=${st.user} at=${at} n=${n}`;
    const check = ctx.world.check({ wires: text });
    if (!check.ok) return refusal(check.violations ?? []);
    ctx.tell(text);
    let now = stateOf(ctx);
    if (now.winner) return ok(`You took ${NAMES[at]}.${ending(now)}`);
    const j = systemMove(ctx, now);
    now = stateOf(ctx);
    return ok(`You took ${NAMES[at]}. I took ${NAMES[j]}.${ending(now) || ' Your move.'}`);
  },

  tttNew(ctx, { keep } = {}) {
    const st = stateOf(ctx), played = st.board.filter(Boolean).length;
    if (keep === 'true' && played > 0 && !st.winner) return ok('We are already playing tic-tac-toe. It is your move.');
    if (keep === 'true' && played === 0 && !st.winner) return ok(intro(st, st.last.system));
    const first = startGame(ctx, st.user);
    return ok(`New game of tic-tac-toe. ${intro(stateOf(ctx), first)}`);
  },

  tttFirst(ctx, { who }) {
    const f = startGame(ctx, who === 'system' ? 'O' : 'X');
    return ok(`${who === 'system' ? 'OK, I go first.' : 'OK, you go first.'} ${intro(stateOf(ctx), f)}`);
  },

  tttLevel(ctx, { level } = {}) {
    const st = stateOf(ctx);
    if (level === undefined) return { value: `I am playing at the ${st.level} level.` };
    const next = LEVEL_OF[level];
    if (!next) return { status: 'unsupported', note: `I do not know the level ${level}. I can play easy or perfect.` };
    setGame(ctx, { level: next });
    return { value: next === 'perfect' ? 'OK, now I play perfectly. Good luck!' : 'OK, I play at the easy level.' };
  },

  tttGiveUp(ctx) {
    const st = stateOf(ctx);
    if (st.winner) return { value: 'The game is already over. Say "new game" to play again.' };
    ctx.tell(`@rs ttt.resign by=${st.user}`);
    return { value: 'OK, you give up, so I win this one. Say "new game" to play again.' };
  },

  /** "Why did you play there?": the reason the rules and the chooser left on the computer's last move. */
  tttWhy(ctx) {
    const st = stateOf(ctx), mark = other(st.user);
    const m = movesOf(ctx.find).filter((x) => x.by === mark).at(-1);
    if (!m) return { status: 'missing', note: 'I have not played yet.' };
    const sq = NAMES[m.at];
    const because = {
      win: `it completes ${m.line ?? 'a line'}, so it wins the game`,
      block: `you were about to complete ${m.line ?? 'a line'} there, so I stopped you`,
      center: 'the center is the strongest square when it is free',
      random: 'I could not win and did not have to block, so I took any free square',
      best: 'it is the best move: I looked at every way the game can go from here',
    }[m.why] ?? 'it was the move I chose';
    return { value: `I played ${sq} because ${because}.`, from: [m.id] };
  },
};

/**
 * What "undo" says (the host layer rewound the library to before the last turn that changed it): `before` and `after` are states of toState,
 * `before` is null when there was nothing to take back.
 */
export function undoWords({ before, after }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet: no move has been played.' };
  const n = (x) => x.board.filter(Boolean).length;
  const value = n(after) < n(before) ? 'OK, I took back your last move and my answer. It is your move again.'
    : before.winner && !after.winner ? 'OK, I took back the end of the game. The game goes on.'
    : null;   // a change the board cannot tell (a new game, a level): the host's generic words quote what the user said
  return { value, openTab: 'tictactoe' };
}
