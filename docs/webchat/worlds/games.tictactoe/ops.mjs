// Operations of games.tictactoe (spec 07 section 3). Browser-safe: no imports.
//
// State (ctx.state): { board: 9 cells 'X'|'O'|'' (row-major, top left first), user: 'X'|'O', turn: 'X'|'O'|null,
//   winner: null|'X'|'O'|'draw', level: 'easy'|'perfect', seed, last: { user, system } }
// X always moves first. Coordinates: column letter A-C (left to right), row number 1-3 (top to bottom).
// Level easy: win if possible, block the opponent, take the center, otherwise a seeded pseudo-random empty cell
// (the seed lives in the state, so games are reproducible). Level perfect: minimax.
// Every command brings the tic-tac-toe tab forward: ctx.request('ui.openTab', { tab: 'tictactoe' }).

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
export function initialState() {
  return { board: Array(9).fill(''), user: 'X', turn: 'X', winner: null, level: 'easy', seed: 20240607, last: { user: null, system: null } };
}

export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const NAMES = ['top left', 'top middle', 'top right', 'middle left', 'the center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
const ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];
const POS = {
  top_left: 0, upper_left: 0, top_middle: 1, top_center: 1, top_centre: 1, top_right: 2, upper_right: 2,
  middle_left: 3, center_left: 3, left_middle: 3, center: 4, centre: 4, middle: 4, middle_right: 5, center_right: 5, right_middle: 5,
  bottom_left: 6, lower_left: 6, bottom_middle: 7, bottom_center: 7, bottom_centre: 7, bottom_right: 8, lower_right: 8,
};
Object.assign(POS, { tl: 0, tr: 2, bl: 6, br: 8, mid_left: 3, mid_right: 5, mid_middle: 4, middle_middle: 4, dead_center: 4, the_middle: 4, upper_middle: 1, lower_middle: 7, mid_top: 1, mid_bottom: 7, down_left: 6, down_right: 8, up_left: 0, up_right: 2, left_top: 0, right_top: 2, left_bottom: 6, right_bottom: 8, top_mid: 1, bottom_mid: 7, middle_top: 1, middle_bottom: 7, left_center: 3, right_center: 5, left_centre: 3, right_centre: 5, center_top: 1, center_bottom: 7, center_middle: 4, centre_middle: 4, middle_center: 4, middle_centre: 4, mid_center: 4 });
const RC = { top: 0, middle: 1, bottom: 2 };
const CC = { left: 0, middle: 1, center: 1, right: 2 };
for (const r of Object.keys(RC)) for (const c of Object.keys(CC)) {
  POS[`${r}_row_${c}`] = RC[r] * 3 + CC[c];
  POS[`${c}_column_${r}`] = RC[r] * 3 + CC[c];
}
export const LEVEL_OF = { easy: 'easy', easier: 'easy', simple: 'easy', beginner: 'easy', perfect: 'perfect', perfectly: 'perfect', hard: 'perfect', harder: 'perfect', hardest: 'perfect', unbeatable: 'perfect', expert: 'perfect', difficult: 'perfect', lighter: 'easy', light: 'easy', easiest: 'easy', lowest: 'easy', weak: 'easy', max: 'perfect', maximum: 'perfect', highest: 'perfect', toughest: 'perfect', tough: 'perfect', impossible: 'perfect', strong: 'perfect', smart: 'perfect', maxed: 'perfect' };

const ok = (value) => ({ status: 'supported', value });
const no = (status, note) => ({ status, note });
export const other = (m) => (m === 'X' ? 'O' : 'X');
export const winnerOf = (b) => { for (const [x, y, z] of LINES) if (b[x] && b[x] === b[y] && b[x] === b[z]) return b[x]; return b.every(Boolean) ? 'draw' : null; };
const empties = (b) => b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
const moves = (b) => b.filter(Boolean).length;
const show = (ctx) => ctx.request('ui.openTab', { tab: 'tictactoe' });

/** Minimax value for `me` with `mark` to move: +1 win, 0 draw, -1 loss (shorter wins and longer losses preferred). */
function minimax(b, mark, me, depth = 0) {
  budget.tick('ops.minimax');
  const w = winnerOf(b);
  if (w) return w === 'draw' ? 0 : w === me ? 10 - depth : depth - 10;
  let best = mark === me ? -Infinity : Infinity;
  for (const i of empties(b)) {
    b[i] = mark;
    const v = minimax(b, other(mark), me, depth + 1);
    b[i] = '';
    best = mark === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}
export function bestMove(b, mark) {
  let best = null, bestV = -Infinity;
  for (const i of ORDER) {
    if (b[i]) continue;
    b[i] = mark;
    const v = minimax(b, other(mark), mark, 1);
    b[i] = '';
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}
export function findWin(b, mark) {
  for (const i of empties(b)) { b[i] = mark; const w = winnerOf(b); b[i] = ''; if (w === mark) return i; }
  return null;
}
export function chooseEasy(s, mark) {
  const b = s.board;
  const win = findWin(b, mark); if (win !== null) return win;
  const block = findWin(b, other(mark)); if (block !== null) return block;
  if (!b[4]) return 4;
  const free = empties(b);
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return free[s.seed % free.length];
}

function finish(s) {
  s.winner = winnerOf(s.board);
  s.turn = s.winner ? null : s.turn;
  return s.winner;
}
function systemMove(s) {
  const mark = other(s.user);
  const i = s.level === 'perfect' ? bestMove(s.board, mark) : chooseEasy(s, mark);
  s.board[i] = mark;
  s.last.system = i;
  s.turn = s.user;
  finish(s);
  return i;
}
export function ending(s) {
  if (s.winner === 'draw') return ' It is a draw!';
  if (s.winner === s.user) return ' You win! Well done.';
  if (s.winner) return ' I win this time! Say "new game" to play again.';
  return '';
}
const mine = (s) => other(s.user);

function startGame(s, user) {
  s.board = Array(9).fill(''); s.history = [];
  s.user = user; s.turn = 'X'; s.winner = null; s.last = { user: null, system: null };
  if (user === 'O') return systemMove(s);
  return null;
}
export function intro(s, first) {
  const lvl = s.level === 'perfect' ? 'I play perfectly.' : 'I play at the easy level.';
  const who = s.user === 'X' ? 'You are X and you go first.' : `You are O and I go first: I took ${NAMES[first]}.`;
  return `${who} ${lvl} Say a place like "center" or "top left", or a coordinate like B2 (letter for the column, number for the row).`;
}

export function newGame(ctx, { keep } = {}) {
  const s = ctx.state;
  show(ctx);
  if (keep === 'true' && moves(s.board) > 0 && !s.winner) return ok('We are already playing tic-tac-toe. It is your move.');
  if (keep === 'true' && moves(s.board) === 0 && !s.winner) return ok(intro(s, s.last.system));
  const first = startGame(s, s.user);
  return ok(`New game of tic-tac-toe. ${intro(s, first)}`);
}

export function first(ctx, { who }) {
  const s = ctx.state;
  show(ctx);
  const f = startGame(s, who === 'system' ? 'O' : 'X');
  return ok(who === 'system' ? `OK, I go first. ${intro(s, f)}` : `OK, you go first. ${intro(s, f)}`);
}

export function whoFirst(ctx) {
  const s = ctx.state;
  return ok(s.user === 'X' ? 'X goes first. You are X, so you go first, and I am O.' : 'X goes first. I am X, so I go first, and you are O.');
}

// Spoken forms: letters said as words ("bee two"), ordinals ("second row third column"), row and column words.
const PHON = { ay: 'a', eh: 'a', bee: 'b', be: 'b', cee: 'c', see: 'c', sea: 'c' };
const ORD = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, last: 3, left: 1, leftmost: 1, left_most: 1, lefthand: 1, middle: 2, mid: 2, center: 2, centre: 2, right: 3, rightmost: 3, right_most: 3, righthand: 3 };
const ROWW = { top: 0, upper: 0, up: 0, high: 0, highest: 0, first: 0, middle: 1, mid: 1, center: 1, centre: 1, second: 1, bottom: 2, lower: 2, down: 2, low: 2, lowest: 2, third: 2, last: 2 };
const COLW = { left: 0, first: 0, middle: 1, mid: 1, center: 1, centre: 1, second: 1, right: 2, third: 2, last: 2 };

/** The square a move names (index 0-8, row-major), or `{ fail }` with the answer for a place that is not on the board. Shared with the matrix actions (fns.mjs). */
export function placeIndex({ pos, col, row, numeric, rname, cname }) {
  let idx;
  if (rname !== undefined && cname !== undefined) {
    const r = ROWW[rname], c = COLW[cname];
    if (r === undefined || c === undefined) return { fail: no('unsupported', `I do not know the place ${rname} ${cname}.`) };
    idx = r * 3 + c;
  } else if (pos !== undefined) idx = POS[pos] ?? POS[String(pos).replace(/-/g, '_')];
  else {
    const colL = PHON[String(col).toLowerCase()] ?? String(col).toLowerCase();
    const c = numeric === 'true' ? (ORD[colL] ?? Number(col)) - 1 : 'abc'.indexOf(colL);
    const r = (ORD[String(row).toLowerCase()] ?? Number(row)) - 1;
    if (!(c >= 0 && c <= 2 && r >= 0 && r <= 2)) return { fail: no('unsupported', 'The board has columns A to C and rows 1 to 3, for example B2.') };
    idx = r * 3 + c;
  }
  if (idx === undefined) return { fail: no('unsupported', `I do not know the place ${pos}.`) };
  return { idx };
}

function _move(ctx, args) {
  const s = ctx.state;
  const p = placeIndex(args);
  if (p.fail) return p.fail;
  const idx = p.idx;
  show(ctx);
  if (s.winner) return no('unsupported', 'The game is over. Say "new game" to play again.');
  if (s.board[idx]) return no('unsupported', `${NAMES[idx][0].toUpperCase()}${NAMES[idx].slice(1)} is already taken by ${s.board[idx] === s.user ? 'you' : 'me'}. Please pick another place.`);
  s.board[idx] = s.user;
  s.last.user = idx;
  s.turn = mine(s);
  if (finish(s)) return ok(`You took ${NAMES[idx]}.${ending(s)}`);
  const j = systemMove(s);
  return ok(`You took ${NAMES[idx]}. I took ${NAMES[j]}.${ending(s) || ' Your move.'}`);
}

export function status(ctx) {
  const s = ctx.state;
  if (s.winner === 'draw') return ok('The game ended in a draw.');
  if (s.winner) return ok(s.winner === s.user ? 'You won this game.' : 'I won this game.');
  if (moves(s.board) === 0) return ok('Nobody is ahead yet: the board is empty.');
  const v = minimax(s.board.slice(), s.turn, s.user, 0);
  if (v > 0) return ok('You are winning: with best play you can force a win.');
  if (v < 0) return ok('I am winning: with best play I can force a win.');
  return ok('It is even: with best play this ends in a draw.');
}

export function describe(ctx) {
  const b = ctx.state.board;
  if (moves(b) === 0) return ok('The board is empty.');
  const row = (name, i) => `${name} row: ${[b[i], b[i + 1], b[i + 2]].map((c) => c || 'empty').join(', ')}.`;
  return ok(`${row('Top', 0)} ${row('Middle', 3)} ${row('Bottom', 6)}`);
}

export function level(ctx, { level: l } = {}) {
  const s = ctx.state;
  if (l === undefined) return ok(`I am playing at the ${s.level} level.`);
  const next = LEVEL_OF[l];
  if (!next) return no('unsupported', `I do not know the level ${l}. I can play easy or perfect.`);
  s.level = next;
  return ok(next === 'perfect' ? 'OK, now I play perfectly. Good luck!' : 'OK, I play at the easy level.');
}

export function hint(ctx) {
  const s = ctx.state;
  if (s.winner) return ok('The game is over. Say "new game" to play again.');
  if (moves(s.board) === 0 && s.user === 'X') return ok('How about the center?');
  const i = bestMove(s.board.slice(), s.user);
  return ok(`How about ${NAMES[i]}?`);
}

export function giveUp(ctx) {
  const s = ctx.state;
  if (s.winner) return ok('The game is already over. Say "new game" to play again.');
  s.winner = mine(s); s.turn = null;
  return ok('OK, you give up, so I win this one. Say "new game" to play again.');
}

export function last(ctx) {
  const i = ctx.state.last.system;
  return i === null ? ok('I have not played yet.') : ok(`My last move was ${NAMES[i]}.`);
}

/** How many moves (marks on the board) so far, and how many of them are the user's. */
export function count(ctx) {
  const s = ctx.state;
  const total = moves(s.board);
  if (total === 0) return ok('Nobody has played yet: the board is empty.');
  const mine = s.board.filter((c) => c === s.user).length, theirs = total - mine;
  const plural = (n) => `${n} ${n === 1 ? 'move' : 'moves'}`;
  return ok(`${total === 1 ? 'There is 1 move' : `There are ${total} moves`} on the board so far: you made ${plural(mine)} and I made ${plural(theirs)}.${s.winner ? '' : ' There are ' + (9 - total) + ' places left.'}`.replace('There are 1 places left', 'There is 1 place left'));
}

// ---- undo of the last move (yours and my answer to it) ---------------------------------------------------------
const snap = (st) => JSON.stringify({ board: st.board, turn: st.turn, winner: st.winner, last: st.last });
/** A move is kept for "undo" only when it was played. */
export function move(ctx, args) {
  const s = ctx.state;
  const before = snap(s);
  const r = _move(ctx, args);
  if (r?.status === 'supported' && snap(s) !== before) {
    (s.history ??= []).push(before);
    if (s.history.length > 10) s.history.shift();
  }
  return r;
}
export function undo(ctx) {
  const s = ctx.state;
  const prev = s.history?.pop();
  if (!prev) return no('missing', 'There is nothing to undo yet: no move has been played.');
  Object.assign(s, JSON.parse(prev));
  show(ctx);
  return ok('OK, I took back your last move and my answer. It is your move again.');
}

// ---- the declared schema (schema.sop, declare=yes): the dice, the example chips and the action buttons read the moves that are legal now, from the board
import { declaredExecutor } from '../acts/acts.mjs?v=48543cb2a7';
import { SCHEMA } from './schema.declared.mjs?v=ac4a32aa44';
export const executor = declaredExecutor(SCHEMA, {
  sampleKnowledge: ({ state }) => {
    const b = state?.board ?? Array(9).fill('');
    if (state?.winner || (state?.turn && state.turn !== (state.user ?? 'X'))) return { moves: [] };
    return { moves: NAMES.map((n, i) => (b[i] ? null : `Play ${n}.`)).filter(Boolean) };
  },
});
