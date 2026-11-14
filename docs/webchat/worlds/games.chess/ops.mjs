// Operations of games.chess (spec 07 sections 6 and 7). Browser-safe: the only import is the vendored chess.js (BSD-2)
// inside this world, so every answer is deterministic and testable in Node.
//
// State (ctx.state), all plain JSON:
//   fen, history (SAN list), user ('white'|'black'), turn ('white'|'black' = side to move),
//   status ('playing'|'checkmate'|'stalemate'|'draw'|'resigned'), level (1..8, Stockfish skill in the host),
//   lastMove { from, to, san } | null, pendingEngine (the host owes us an engine move), orientation ('white'|'black'),
//   check (square of the king in check | null), result ('*'|'1-0'|'0-1'|'1/2-1/2'), winner ('white'|'black'|null), reason,
//   captured { white: [piece letters captured by white], black: [...] }, material { white, black } (points),
//   dests { from: [to, ...] } (legal destinations of the user, empty when it is not the user's move; the board uses them),
//   highlights [{ kind: 'moves'|'hint'|'squares', ... }], hint { from, to, san } | null, pending (a question waiting for
//   an answer: { kind: 'ambiguous', options } or { kind: 'promotion', from, to }), pendingHint, pendingTries, engine
//   ('unknown'|'stockfish'|'builtin'), seed (for the built-in chooser).
// Effects: chess.engine.bestmove { fen, level, movetime } and chess.engine.hint { fen, level, movetime }. The host runs
// the engine and reports { ok, data: { bestmove, fen } } through the observation loop; onObservation() plays the move.
// When the engine is unavailable (ok=false) a deterministic built-in chooser (captures > checks > centre, seeded) plays.
import { Chess } from './vendor/chess.mjs?v=9a44601d41';
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const PLURAL = { p: 'pawns', n: 'knights', b: 'bishops', r: 'rooks', q: 'queens', k: 'kings' };
export const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const ORDER = 'kqrbnp';
export const PIECE_WORD = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k', horse: 'n', night: 'n', rock: 'r', kngt: 'n', knite: 'n', nite: 'n', horsey: 'n', bish: 'b', pown: 'p', rok: 'r', p: 'p', n: 'n', b: 'b', r: 'r', q: 'q', k: 'k' };
const FILE_WORD = { alpha: 'a', bravo: 'b', charlie: 'c', delta: 'd', echo: 'e', foxtrot: 'f', golf: 'g', hotel: 'h', bee: 'b', dee: 'd', eff: 'f', gee: 'g', aitch: 'h' };
const LEVEL_NAME = ['', 'beginner', 'easy', 'casual', 'intermediate', 'club player', 'strong', 'expert', 'master'];
const MOVETIME = [0, 150, 200, 300, 450, 650, 900, 1200, 1800];
const ABS_LEVEL = {
  beginner: 1, novice: 1, weakest: 1, easy: 2, simple: 2, gentle: 2, weak: 2, casual: 3, medium: 3, normal: 3, average: 3, intermediate: 4, club: 5,
  hard: 6, tough: 6, difficult: 6, strong: 6, advanced: 6, expert: 7,
  master: 8, grandmaster: 8, maximum: 8, max: 8, best: 8, full: 8, unbeatable: 8, perfect: 8, professional: 8, pro: 8, champion: 8, strongest: 8, hardest: 8,
};
const REL_LEVEL = { easier: -1, weaker: -1, gentler: -1, softer: -1, lower: -1, harder: 1, stronger: 1, tougher: 1, higher: 1 };
const ORD_WORD = { first: 0, second: 1, third: 2, fourth: 3 };

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (note, status = 'unsupported') => ({ status, note });
export const cap1 = (t) => t[0].toUpperCase() + t.slice(1);
export const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const joinOr = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} or ${a.at(-1)}`);
export const article = (t) => `${/^[aeiou]/.test(t) ? 'an' : 'a'} ${t}`;
export const fi = (sq) => sq.charCodeAt(0) - 97;
export const ri = (sq) => Number(sq[1]) - 1;
const sqName = (f, r) => String.fromCharCode(97 + f) + (r + 1);
export const colorName = (l) => (l === 'w' ? 'white' : 'black');
const letter = (name) => (name === 'white' ? 'w' : 'b');
export const ucol = (s) => letter(s.user);
export const ecol = (s) => (s.user === 'white' ? 'b' : 'w');
export const other = (name) => (name === 'white' ? 'black' : 'white');

// ------------------------------------------------------------------ state

export function initialState() {
  const s = {
    fen: START_FEN, history: [], user: 'white', turn: 'white', status: 'playing', level: 3, lastMove: null, pendingEngine: false,
    orientation: 'white', check: null, result: '*', winner: null, reason: null, captured: { white: [], black: [] }, material: { white: 39, black: 39 },
    dests: {}, highlights: [], hint: null, pending: null, pendingHint: false, pendingTries: 0, engine: 'unknown', seed: 20260607,
  };
  refresh(s, new Chess());
  return s;
}

/** The game as a chess.js instance: the SAN history is replayed (so repetition and the fifty-move rule are right). */
export function load(s) {
  const c = new Chess();
  try {
    for (const san of s.history) c.move(san);
    if (c.fen() === s.fen) return c;
  } catch { /* fall through */ }
  return new Chess(s.fen);
}

export function board(c) {
  const out = [];
  for (const row of c.board()) for (const p of row) if (p) out.push(p);
  return out;
}
const piecesOf = (c, color, type) => board(c).filter((p) => p.color === color && (!type || p.type === type));
const kingSquare = (c, color) => board(c).find((p) => p.type === 'k' && p.color === color)?.square ?? null;

/** Recomputes every derived field of the state from the game `c`. */
export function refresh(s, c) {
  const hv = c.history({ verbose: true });
  s.fen = c.fen();
  s.history = hv.map((m) => m.san);
  s.turn = colorName(c.turn());
  const last = hv.at(-1);
  s.lastMove = last ? { from: last.from, to: last.to, san: last.san } : null;
  s.captured = { white: [], black: [] };
  for (const m of hv) if (m.captured) s.captured[colorName(m.color)].push(m.captured);
  s.material = { white: 0, black: 0 };
  for (const p of board(c)) s.material[colorName(p.color)] += VAL[p.type];
  s.check = c.isCheck() ? kingSquare(c, c.turn()) : null;
  const agreed = s.status === 'draw' && s.reason === 'agreement';
  if (s.status !== 'resigned' && !agreed) {
    if (c.isCheckmate()) {
      s.status = 'checkmate'; s.winner = other(colorName(c.turn())); s.result = s.winner === 'white' ? '1-0' : '0-1'; s.reason = 'checkmate';
    } else if (c.isStalemate()) {
      s.status = 'stalemate'; s.winner = null; s.result = '1/2-1/2'; s.reason = 'stalemate';
    } else if (c.isDraw()) {
      s.status = 'draw'; s.winner = null; s.result = '1/2-1/2';
      s.reason = c.isInsufficientMaterial() ? 'insufficient material' : c.isThreefoldRepetition() ? 'threefold repetition' : 'the fifty-move rule';
    } else { s.status = 'playing'; s.winner = null; s.result = '*'; s.reason = null; }
  }
  s.dests = {};
  if (s.status === 'playing' && s.turn === s.user && !s.pendingEngine) {
    for (const m of c.moves({ verbose: true })) (s.dests[m.from] ??= []).includes(m.to) || s.dests[m.from].push(m.to);
  }
}

export function clearTransient(s) { s.pending = null; s.highlights = []; s.hint = null; s.pendingHint = false; }

// ------------------------------------------------------------------ cross-world routing
// Some of our phrases are also phrases of other tabs ("a3", "who is winning?", "describe the board", "undo"). They are
// recognised here (higher priority), and handed to the owner of the active tab when it is not the chess tab.

const FOREIGN = {
  'Tic-tac-toe': { move: 'ttt.move', hint: 'ttt.hint', level: 'ttt.level', last: 'ttt.last', describe: 'ttt.describe', status: 'ttt.status' },
  Editor: { undo: 'doc.undo' },
  Drawing: { undo: 'draw.undo' },
};
function activeTab(ctx) {
  let r;
  try { r = ctx.request('ui.whichTab'); } catch { return null; }
  const m = r?.status === 'supported' ? /You are on the (.+) tab/.exec(String(r.value ?? '')) : null;
  return m ? m[1] : null;
}
function foreign(ctx, what, args = {}) {
  const action = FOREIGN[activeTab(ctx)]?.[what];
  if (!action) return null;
  const r = ctx.request(action, args);
  return r.status === 'supported' ? ok(r.value) : no(r.note ?? r.value ?? 'That does not work here.', r.status);
}
const show = (ctx) => { try { ctx.request('ui.openTab', { tab: 'chess' }); } catch { /* no shell loaded */ } };

// ------------------------------------------------------------------ speech

export function sayMove(m) {
  if (m.flags.includes('k')) return 'castle kingside';
  if (m.flags.includes('q')) return 'castle queenside';
  let t = m.captured ? `play ${NAME[m.piece]} takes ${NAME[m.captured]} on ${m.to}${m.flags.includes('e') ? ' en passant' : ''}` : `play ${NAME[m.piece]} to ${m.to}`;
  if (m.promotion) t += `, promoting to ${article(NAME[m.promotion])}`;
  return t;
}
/** "knight to f3" without the leading verb, for hints and reports. */
export const plainMove = (m) => sayMove(m).replace(/^play /, '').replace(/^castle /, 'castling ');
export function endText(s, mover) {
  if (s.status === 'checkmate') return mover === 'user' ? 'Checkmate! You win. Well played!' : 'Checkmate! I win this time. Good game! Say "new game" to play again.';
  if (s.status === 'stalemate') return 'Stalemate: nobody can move, so the game is a draw.';
  if (s.status === 'draw') return `The game is a draw by ${s.reason}.`;
  return '';
}
const toMove = (s) => (s.turn === s.user ? 'It is your move.' : 'It is my move.');

// ------------------------------------------------------------------ engine

function queueEngine(ctx, s) {
  s.pendingEngine = true; s.pendingTries = 0; s.dests = {};
  ctx.effect('chess.engine.bestmove', { fen: s.fen, level: s.level, movetime: MOVETIME[s.level] });
}

/** Deterministic built-in chooser: mate > captures (by value, losing trades discounted) > checks > centre, seeded jitter. */
function scoreMove(c, m) {
  let sc = 0;
  if (m.captured) sc += 100 * VAL[m.captured] - VAL[m.piece];
  if (m.promotion) sc += 80 * VAL[m.promotion] / 3;
  if (m.flags.includes('k') || m.flags.includes('q')) sc += 30;
  const df = Math.abs(fi(m.to) - 3.5), dr = Math.abs(ri(m.to) - 3.5);
  sc += (4 - Math.max(df, dr)) * 3;
  if ((m.piece === 'n' || m.piece === 'b') && (m.from[1] === '1' || m.from[1] === '8')) sc += 12;
  if (m.piece === 'k' && !m.flags.includes('k') && !m.flags.includes('q')) sc -= 15;
  if (m.piece === 'q' && c.history().length < 8) sc -= 8;
  c.move(m);
  if (c.isCheckmate()) sc += 100000;
  else if (c.isDraw() || c.isStalemate()) sc -= 50;
  else {
    if (c.isCheck()) sc += 40;
    const me = m.color, them = me === 'w' ? 'b' : 'w';
    const attackers = c.attackers(m.to, them);
    if (attackers.length) {
      const least = Math.min(...attackers.map((q) => VAL[c.get(q).type] || 100));
      const defended = c.attackers(m.to, me).length > 0;
      sc -= defended ? Math.max(0, 100 * (VAL[m.piece] - least)) : 100 * VAL[m.piece];
    }
  }
  c.undo();
  return sc;
}
export function choose(c, s, noise) {
  let best = null, bestScore = -Infinity;
  for (const m of c.moves({ verbose: true })) {
    const sc = scoreMove(c, m);
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    const v = sc + ((s.seed % 1000) / 1000) * noise;
    if (v > bestScore) { bestScore = v; best = m; }
  }
  return best;
}

/** Plays the engine move (host move `uci` when legal, else the built-in one); returns the chess.js move. */
function playEngine(s, c, uci) {
  let mv = null;
  if (typeof uci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    try { mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { mv = null; }
  }
  if (!mv) { const m = choose(c, s, (9 - s.level) * 3); mv = c.move({ from: m.from, to: m.to, promotion: m.promotion }); }
  s.pendingEngine = false; s.pendingTries = 0;
  clearTransient(s);
  refresh(s, c);
  return mv;
}
export function engineText(s, c, mv) {
  let t = `I ${sayMove(mv).replace(/^play /, 'play ')}.`;
  if (s.status !== 'playing') return `${t} ${endText(s, 'engine')}`;
  if (c.isCheck()) t += ' Check!';
  return `${t} Your move.`;
}

export function onObservation(ctx, obs) {
  const s = ctx.state;
  if (obs.effect === 'chess.engine.bestmove') {
    if (!s.pendingEngine) return null;                      // stale: new game, undo or resignation in the meantime
    const c = load(s);
    const sameFen = (a, b) => String(a).split(' ').slice(0, 4).join(' ') === String(b).split(' ').slice(0, 4).join(' ');
    if (obs.ok && obs.data?.fen && !sameFen(obs.data.fen, s.fen)) return null;   // a late answer for another position
    if (s.status !== 'playing' || c.turn() !== ecol(s)) { s.pendingEngine = false; refresh(s, c); return null; }
    const uci = obs.ok ? obs.data?.bestmove : null;
    const mv = playEngine(s, c, uci);
    s.engine = obs.ok && uci ? 'stockfish' : 'builtin';
    return { reply: engineText(s, c, mv) };
  }
  if (obs.effect === 'chess.engine.hint') {
    if (!s.pendingHint) return null;
    s.pendingHint = false;
    const c = load(s);
    if (s.status !== 'playing' || c.turn() !== ucol(s)) return null;
    let mv = null;
    const uci = obs.ok ? obs.data?.bestmove : null;
    if (typeof uci === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) mv = c.moves({ verbose: true }).find((m) => m.from === uci.slice(0, 2) && m.to === uci.slice(2, 4) && (!m.promotion || m.promotion === (uci[4] ?? 'q')));
    if (!mv) mv = choose(c, s, 0);
    s.hint = { from: mv.from, to: mv.to, san: mv.san };
    s.highlights = [{ kind: 'hint', from: mv.from, to: mv.to }];
    return { reply: `How about ${plainMove(mv)}? I drew an arrow on the board.` };
  }
  return null;
}

// ------------------------------------------------------------------ explanations

const own = (s, p) => (p.color === ucol(s) ? 'your' : 'my');
const pieceOn = (c, s, sq) => { const p = c.get(sq); return `${own(s, p)} ${NAME[p.type]} on ${sq}`; };
function between(a, b) {
  const df = fi(b) - fi(a), dr = ri(b) - ri(a);
  if ((df === 0 && dr === 0) || !(df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr))) return null;
  const sf = Math.sign(df), sr = Math.sign(dr);
  const out = [];
  let f = fi(a) + sf, r = ri(a) + sr;
  while (f !== fi(b) || r !== ri(b)) { budget.tick('ops.between'); out.push(sqName(f, r)); f += sf; r += sr; }
  return out;
}
function checkReason(c, s, from, to, pc) {
  const c2 = new Chess(c.fen());
  c2.remove(from); c2.remove(to); c2.put({ type: pc.type, color: pc.color }, to);
  const k = pc.type === 'k' ? to : kingSquare(c2, pc.color);
  const enemy = pc.color === 'w' ? 'b' : 'w';
  if (k && c2.isAttacked(k, enemy)) {
    if (pc.type === 'k') return `Your king can't go to ${to}: that square is attacked.`;
    if (c.isCheck()) return `Your king is in check, so your move has to stop the check, and ${plainMove({ flags: '', piece: pc.type, to })} does not.`;
    return `Your ${NAME[pc.type]} on ${from} is pinned: moving it would leave your king in check.`;
  }
  return 'That move is not legal.';
}
function explainMove(c, s, from, to) {
  const pc = c.get(from), dest = c.get(to);
  const name = NAME[pc.type];
  const mine = `your ${name} on ${from}`;
  if (from === to) return `Your ${name} is already on ${to}.`;
  if (dest && dest.color === pc.color) return `${cap1(mine)} can't go to ${to}: ${own(s, dest)} ${NAME[dest.type]} is already there.`;
  const df = fi(to) - fi(from), dr = ri(to) - ri(from);
  const adf = Math.abs(df), adr = Math.abs(dr);
  if (pc.type === 'n' && !((adf === 1 && adr === 2) || (adf === 2 && adr === 1))) return `A knight moves in an L shape, so ${mine} can't go to ${to}.`;
  if (pc.type === 'b' && adf !== adr) return `A bishop moves diagonally, so ${mine} can't go to ${to}.`;
  if (pc.type === 'r' && df !== 0 && dr !== 0) return `A rook moves in straight lines, so ${mine} can't go to ${to}.`;
  if (pc.type === 'q' && !(df === 0 || dr === 0 || adf === adr)) return `A queen moves in straight lines and diagonals, so ${mine} can't go to ${to}.`;
  if (pc.type === 'k' && Math.max(adf, adr) > 1) return `A king moves one square at a time (castling is the only exception), so ${mine} can't go to ${to}.`;
  if (pc.type === 'p') {
    const dir = pc.color === 'w' ? 1 : -1, startRank = pc.color === 'w' ? 1 : 6;
    if (df === 0) {
      if (dr * dir < 0) return `Pawns never move backward, so ${mine} can't go to ${to}.`;
      if (!(dr === dir || (dr === 2 * dir && ri(from) === startRank))) return `A pawn moves one square forward, or two from its starting rank, so ${mine} can't go to ${to}.`;
      const blocker = between(from, to).concat([to]).find((q) => c.get(q));
      if (blocker) return `${cap1(mine)} is blocked by ${pieceOn(c, s, blocker)}.`;
    } else if (adf === 1 && dr === dir) {
      if (!dest) return `A pawn only moves diagonally when it captures, and ${to} is empty.`;
    } else return `A pawn moves straight ahead and captures one square diagonally, so ${mine} can't go to ${to}.`;
  } else if ('bqr'.includes(pc.type)) {
    const blocker = between(from, to).find((q) => c.get(q));
    if (blocker) return `${cap1(mine)} is blocked by ${pieceOn(c, s, blocker)}.`;
  }
  return checkReason(c, s, from, to, pc);
}
function explainCastle(c, s, side) {
  const col = ucol(s), rank = col === 'w' ? '1' : '8', label = side === 'k' ? 'kingside' : 'queenside';
  const kSq = `e${rank}`, rSq = `${side === 'k' ? 'h' : 'a'}${rank}`;
  const king = c.get(kSq), rook = c.get(rSq);
  const rights = c.getCastlingRights(col);
  if (!king || king.type !== 'k' || king.color !== col || !rook || rook.type !== 'r' || rook.color !== col || !rights[side]) return `You can't castle ${label}: your king or your ${rSq} rook has already moved.`;
  const mid = (side === 'k' ? ['f', 'g'] : ['b', 'c', 'd']).map((f) => f + rank).filter((q) => c.get(q));
  if (mid.length) return `You can't castle ${label} yet: ${joinAnd(mid.map((q) => pieceOn(c, s, q)))} still stand${mid.length === 1 ? 's' : ''} between your king and your rook.`;
  if (c.isCheck()) return `You can't castle while your king is in check.`;
  const bad = (side === 'k' ? ['f', 'g'] : ['d', 'c']).map((f) => f + rank).find((q) => c.isAttacked(q, col === 'w' ? 'b' : 'w'));
  if (bad) return `You can't castle ${label}: your king would pass through or land on ${bad}, which is attacked.`;
  return `Castling ${label} is not possible right now.`;
}
const checkPrefix = (c) => (c.isCheck() ? 'Your king is in check, so every move has to get out of check. ' : '');
export function explainNone(c, s, it) {
  const user = ucol(s);
  if (it.castle === 'k' || it.castle === 'q') return explainCastle(c, s, it.castle);
  if (it.castle === 'any') return explainCastle(c, s, 'k').replace('kingside', 'on either side').replace('Castling on either side', 'Castling');
  if (it.from) {
    const pc = c.get(it.from);
    if (!pc) return `There is no piece on ${it.from}.`;
    if (pc.color !== user) return `The ${NAME[pc.type]} on ${it.from} is mine, not yours.`;
    if (it.pt && pc.type !== it.pt) return `The piece on ${it.from} is your ${NAME[pc.type]}, not a ${NAME[it.pt]}.`;
    if (it.to) return explainMove(c, s, it.from, it.to);
    return `Your ${NAME[pc.type]} on ${it.from} has nowhere to go with that.`;
  }
  const type = it.pt ?? it.wp;
  if (it.to) {
    const dest = c.get(it.to);
    if (it.cap) {
      if (!dest) return `There is nothing to capture on ${it.to}.`;
      if (dest.color === user) return `The ${NAME[dest.type]} on ${it.to} is your own piece.`;
      if (it.tp && dest.type !== it.tp) return `The piece on ${it.to} is ${article(NAME[dest.type])}, not ${article(NAME[it.tp])}.`;
    }
    if (type) {
      const mine = piecesOf(c, user, type);
      if (!mine.length) return `You have no ${PLURAL[type]} left.`;
      if (dest && dest.color === user && !it.cap) return `Your ${NAME[dest.type]} is already on ${it.to}.`;
      if (mine.length === 1) return explainMove(c, s, mine[0].square, it.to);
      const hints = mine.map((p) => ({ p, to: c.moves({ square: p.square, verbose: true }).map((m) => m.to) })).filter((x) => x.to.length).slice(0, 2)
        .map((x) => `the ${NAME[type]} on ${x.p.square} can go to ${joinAnd([...new Set(x.to)])}`);
      return `${checkPrefix(c)}None of your ${PLURAL[type]} can ${it.cap ? 'capture on' : 'reach'} ${it.to}.${hints.length ? ` For example, ${joinAnd(hints)}.` : ''}`;
    }
    if (dest && dest.color === user && !it.cap) return `You already have ${article(NAME[dest.type])} on ${it.to}.`;
    return `${checkPrefix(c)}None of your pieces can ${it.cap ? 'capture on' : 'move to'} ${it.to}.`;
  }
  if (it.tp || it.wp) {
    return `${checkPrefix(c)}I cannot see a way to capture ${it.tp ? article(NAME[it.tp]) : 'anything'}${it.wp ? ` with ${article(NAME[it.wp])}` : ''} right now.`;
  }
  return `${checkPrefix(c)}${type ? `Your ${NAME[type]} cannot capture anything right now.` : 'That is not a legal move.'}`;
}

// ------------------------------------------------------------------ move language

const isSq = (f, r) => f !== undefined && r !== undefined;
export function sqOf(f, r) {
  const file = FILE_WORD[String(f).toLowerCase()] ?? String(f).toLowerCase();
  const rank = Number(r);
  if (!/^[a-h]$/.test(file) || !Number.isInteger(rank) || rank < 1 || rank > 8) return { error: `There is no square ${String(f)[0]}${r}. The board has the files a to h and the ranks 1 to 8.` };
  return { sq: `${file}${rank}` };
}
function sanIntent(raw, rank) {
  const r = String(raw);
  const file = (x) => FILE_WORD[x] ?? x;
  let m = /^([a-h])x([a-h])$/.exec(r);
  if (m) return { pt: 'p', fromFile: m[1], cap: true, fileOnly: m[2], rank };
  m = /^([NBRQK])(x?)([a-h])$/.exec(r);
  if (m) return { pt: m[1].toLowerCase(), cap: !!m[2], fileOnly: m[3], rank };
  m = /^b(x?)([a-h])$/.exec(r);
  if (m) {
    if (m[1] && Math.abs(fi(m[2]) - 1) === 1) return { pt: 'p', fromFile: 'b', cap: true, fileOnly: m[2], rank };
    return { pt: 'b', cap: !!m[1], fileOnly: m[2], rank };
  }
  m = /^([nrqk])(x?)([a-h])$/.exec(r.toLowerCase());
  if (m) return { pt: m[1], cap: !!m[2], fileOnly: file(m[3]), rank };
  return null;
}
/** Turns the request arguments into an intent { pt, from, fromFile, to, cap, tp, wp, promo, castle } or { error }. */
export function intent(a) {
  const it = {};
  if (a.piece && PIECE_WORD[String(a.piece).toLowerCase()]) it.pt = PIECE_WORD[String(a.piece).toLowerCase()];
  if (a.tp && PIECE_WORD[String(a.tp).toLowerCase()]) it.tp = PIECE_WORD[String(a.tp).toLowerCase()];
  if (a.wp && PIECE_WORD[String(a.wp).toLowerCase()]) it.wp = PIECE_WORD[String(a.wp).toLowerCase()];
  if (a.cap === 'true') it.cap = true;
  if (a.castle) it.castle = a.castle;
  if (a.promo) { const p = PIECE_WORD[String(a.promo).toLowerCase()]; if (p && 'qrbn'.includes(p)) it.promo = p; }
  if (isSq(a.ff, a.fr)) { const r = sqOf(a.ff, a.fr); if (r.error) return r; it.from = r.sq; }
  if (isSq(a.tf, a.tr)) { const r = sqOf(a.tf, a.tr); if (r.error) return r; it.to = r.sq; }
  if (a.san !== undefined) {
    const si = sanIntent(a.san, Number(a.tr));
    if (!si) return { error: `I did not understand the notation ${a.san}${a.tr}.` };
    const file = FILE_WORD[si.fileOnly] ?? si.fileOnly;
    const r = sqOf(file, si.rank);
    if (r.error) return r;
    Object.assign(it, { pt: si.pt, cap: si.cap || it.cap, to: r.sq });
    if (si.fromFile) it.fromFile = si.fromFile;
    it.san = true;
  }
  return it;
}
const isCastle = (m) => m.flags.includes('k') || m.flags.includes('q');
function filterLegal(legal, it) {
  return legal.filter((m) => (!it.pt || m.piece === it.pt) && (!it.from || m.from === it.from) && (!it.fromFile || m.from[0] === it.fromFile)
    && (!it.to || m.to === it.to) && (it.cap !== true || !!m.captured) && (!it.tp || m.captured === it.tp) && (!it.wp || m.piece === it.wp)
    && (!it.castle || (it.castle === 'any' ? isCastle(m) : m.flags.includes(it.castle))));
}
/** @returns {{kind:'move',move}|{kind:'ambiguous',options}|{kind:'promotion',from,to}|{kind:'none'}} */
export function resolve(c, it) {
  let cand = filterLegal(c.moves({ verbose: true }), it);
  if (it.promo) { const withPromo = cand.filter((m) => m.promotion === it.promo); if (withPromo.length || cand.every((m) => m.promotion)) cand = withPromo; }
  if (!cand.length) return { kind: 'none' };
  const keys = [...new Set(cand.map((m) => m.from + m.to))];
  let list = keys.map((k) => cand.find((m) => m.from + m.to === k));
  if (list.length > 1 && !it.pt) { const pawns = list.filter((m) => m.piece === 'p'); if (pawns.length === 1) list = pawns; }
  if (list.length > 1) {
    if (it.castle === 'any') return { kind: 'ambiguous', options: list.map((m) => ({ from: m.from, to: m.to, piece: m.piece, castle: m.flags.includes('k') ? 'k' : 'q' })) };
    return { kind: 'ambiguous', options: list.map((m) => ({ from: m.from, to: m.to, piece: m.piece })) };
  }
  const m = list[0];
  if (m.promotion) {
    const variants = cand.filter((x) => x.from === m.from && x.to === m.to);
    if (variants.length > 1) return { kind: 'promotion', from: m.from, to: m.to };
    return { kind: 'move', move: variants[0] };
  }
  return { kind: 'move', move: m };
}
const optionText = (o) => (o.castle ? (o.castle === 'k' ? 'castle kingside' : 'castle queenside') : `the ${NAME[o.piece]} on ${o.from}`);
function askWhich(s, options) {
  s.pending = { kind: 'ambiguous', options };
  if (options[0].castle) return no('Castle kingside or queenside? Say "kingside" or "queenside".', 'ambiguous');
  const types = new Set(options.map((o) => o.piece));
  const sorted = [...options].sort((x, y) => x.from.localeCompare(y.from));
  const example = `the one on ${sorted.at(-1).from}`;
  if (types.size === 1) return no(`Which ${NAME[options[0].piece]}? ${cap1(joinOr(sorted.map((o) => `the one on ${o.from}`)))}? Say, for example, "${example}".`, 'ambiguous');
  return no(`Which piece do you mean: ${joinOr(sorted.map(optionText))}? Say, for example, "${example}".`, 'ambiguous');
}
function playUser(ctx, s, c, m) {
  const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion });
  clearTransient(s);
  s.pendingTries = 0;
  refresh(s, c);
  let text = `You ${sayMove(mv)}.`;
  if (s.status !== 'playing') return ok(`${text} ${endText(s, 'user')}`);
  if (c.isCheck()) text += ' Check!';
  queueEngine(ctx, s);
  return ok(text);
}
/** When the host has not answered an engine request, a second user command settles it with the built-in chooser. */
function settle(ctx, s) {
  if (!s.pendingEngine) return null;
  s.pendingTries = (s.pendingTries ?? 0) + 1;
  if (s.pendingTries < 2 && !(ctx.batch?.index > 0)) return { wait: 'I am still thinking about my move. One moment, please.' };
  const c = load(s);
  if (s.status !== 'playing' || c.turn() !== ecol(s)) { s.pendingEngine = false; refresh(s, c); return {}; }
  const mv = playEngine(s, c, null);
  s.engine = 'builtin';
  ctx.checkpoint?.(`Meanwhile ${engineText(s, c, mv).replace(' Your move.', '')}`);   // the engine's late reply is not a step of the user's turn: the matrix reasoner marks its timeline after it and says it first
  return { text: `Meanwhile ${engineText(s, c, mv).replace(' Your move.', '')}` };
}
const overText = (s) => (s.status === 'resigned' ? 'You resigned this game.' : `The game is over: ${s.status === 'checkmate' ? `checkmate, ${s.winner === s.user ? 'you won' : 'I won'}` : s.reason}.`) + ' Say "new game" to play again.';
/** Common guard of the commands that need the user to be on move. Returns an envelope to stop with, or { prefix }. */
function guard(ctx, s, { allowPending } = {}) {
  if (s.status !== 'playing') return { stop: no(overText(s)) };
  const st = settle(ctx, s);
  if (st?.wait && !allowPending) return { stop: no(st.wait, 'missing') };
  if (s.turn !== s.user) { queueEngine(ctx, s); return { stop: no('It is my move. I am thinking.', 'missing') }; }
  return { prefix: st?.text ? `${st.text} ` : '' };
}

export function move(ctx, args) {
  const s = ctx.state;
  const bare = !args.piece && !args.ff && !args.cap && !args.castle && !args.san && !args.promo && !args.tp && !args.wp && args.tf;
  if (bare) { const f = foreign(ctx, 'move', { col: args.tf, row: args.tr }); if (f) return f; }
  show(ctx);
  const g = guard(ctx, s);
  if (g.stop) return g.stop;
  const it = intent(args);
  if (it.error) return no(it.error);
  const c = load(s);
  // a bare square (or piece + square) that is the origin of one of the pending options answers the question
  const pend = s.pending;
  if (pend?.kind === 'ambiguous' && it.to && !it.from && !pend.options[0].castle) {
    const asPick = pend.options.filter((o) => o.from === it.to && (!it.pt || o.piece === it.pt));
    if (asPick.length === 1 && !c.moves({ verbose: true }).some((m) => m.to === it.to && (!it.pt || m.piece === it.pt))) {
      return finishPick(ctx, s, c, asPick[0], g.prefix);
    }
  }
  s.pending = null;
  const r = resolve(c, it);
  if (r.kind === 'move') { const out = playUser(ctx, s, c, r.move); return ok(g.prefix + out.value); }
  if (r.kind === 'ambiguous') return askWhich(s, r.options);
  if (r.kind === 'promotion') {
    s.pending = { kind: 'promotion', from: r.from, to: r.to };
    return no('Which piece should the pawn become: queen, rook, bishop or knight? Say, for example, "promote to a queen".', 'missing');
  }
  return no(explainNone(c, s, it));
}

export function can(ctx, args) {
  const s = ctx.state;
  if (s.status !== 'playing') return no(overText(s));
  const it = intent(args);
  if (it.error) return no(it.error);
  const c = load(s);
  if (c.turn() !== ucol(s)) return no('It is my move right now, so nothing is playable for you yet.', 'missing');
  const r = resolve(c, it);
  if (r.kind === 'move') return ok(`Yes, you can ${sayMove(r.move)}. Say it to play it.`);
  if (r.kind === 'promotion') return ok('Yes, that pawn can go there and become a queen, rook, bishop or knight.');
  if (r.kind === 'ambiguous') {
    if (r.options[0].castle) return ok('Yes, you can castle on either side.');
    return ok(`Yes, more than one piece can do that: ${joinAnd(r.options.map(optionText))}.`);
  }
  return ok(`No. ${explainNone(c, s, it)}`);
}

function finishPick(ctx, s, c, opt, prefix = '') {
  s.pending = null;
  if (opt.castle) { const out = playUser(ctx, s, c, c.moves({ verbose: true }).find((m) => m.flags.includes(opt.castle))); return ok(prefix + out.value); }
  const variants = c.moves({ verbose: true }).filter((m) => m.from === opt.from && m.to === opt.to);
  if (variants.length > 1 && variants[0].promotion) {
    s.pending = { kind: 'promotion', from: opt.from, to: opt.to };
    return no('Which piece should the pawn become: queen, rook, bishop or knight?', 'missing');
  }
  const out = playUser(ctx, s, c, variants[0]);
  return ok(prefix + out.value);
}

export function pick(ctx, { piece, ff, fr, ord }) {
  const s = ctx.state;
  const pend = s.pending;
  if (!pend || pend.kind !== 'ambiguous') return no('There is nothing to choose between right now. Tell me a move, for example "knight to f3".', 'missing');
  const g = guard(ctx, s);
  if (g.stop) return g.stop;
  let opts = pend.options;
  if (isSq(ff, fr)) {
    const r = sqOf(ff, fr);
    if (r.error) return no(r.error);
    opts = opts.filter((o) => o.from === r.sq);
    const pt = piece && PIECE_WORD[String(piece).toLowerCase()];
    if (pt) opts = opts.filter((o) => o.piece === pt);
  } else if (ord) {
    const sorted = [...opts].sort((x, y) => fi(x.from) - fi(y.from) || ri(x.from) - ri(y.from));
    const w = String(ord);
    let chosen;
    if (w in ORD_WORD) chosen = sorted[ORD_WORD[w]];
    else if (w === 'last' || w === 'right') chosen = sorted.at(-1);
    else if (w === 'left') chosen = sorted[0];
    else if (w === 'upper') chosen = [...opts].sort((x, y) => ri(y.from) - ri(x.from))[0];
    else if (w === 'lower') chosen = [...opts].sort((x, y) => ri(x.from) - ri(y.from))[0];
    else if (w === 'other') chosen = sorted.at(-1);
    opts = chosen ? [chosen] : [];
  }
  if (opts.length !== 1) return no(`That does not pick one of the options. ${cap1(joinOr([...pend.options].sort((x, y) => x.from.localeCompare(y.from)).map(optionText)))}?`, 'ambiguous');
  return finishPick(ctx, s, load(s), opts[0], g.prefix);
}

export function promote(ctx, { piece }) {
  const s = ctx.state;
  const pend = s.pending;
  if (!pend || pend.kind !== 'promotion') return no('Nothing is being promoted right now. A pawn is promoted when it reaches the last rank.', 'missing');
  const g = guard(ctx, s);
  if (g.stop) return g.stop;
  const p = PIECE_WORD[String(piece).toLowerCase()];
  if (!p || !'qrbn'.includes(p)) return no('A pawn can become a queen, rook, bishop or knight.');
  const c = load(s);
  const m = c.moves({ verbose: true }).find((x) => x.from === pend.from && x.to === pend.to && x.promotion === p);
  if (!m) return no('That promotion is not possible.');
  s.pending = null;
  const out = playUser(ctx, s, c, m);
  return ok(g.prefix + out.value);
}

// ------------------------------------------------------------------ questions

function listSquares(c, s, type, from) {
  const mine = piecesOf(c, ucol(s), type).filter((p) => !from || p.square === from);
  return mine;
}
export function moves(ctx, { piece, ff, fr, all, count }) {
  const s = ctx.state;
  if (s.status !== 'playing') return no(overText(s));
  const c = load(s);
  if (c.turn() !== ucol(s)) return no(s.pendingEngine ? 'It is my move and I am still thinking. Ask again in a moment.' : 'It is my move right now.', 'missing');
  show(ctx);
  const legal = c.moves({ verbose: true });
  if (all === 'true' || (!piece && !(ff && fr))) {
    if (count === 'true') return ok(`You have ${legal.length} legal moves.`);
    const by = {};
    for (const m of legal) by[m.piece] = (by[m.piece] ?? 0) + 1;
    const parts = ORDER.split('').filter((t) => by[t]).map((t) => `${by[t]} ${by[t] === 1 ? NAME[t] : 'of the ' + PLURAL[t]}`.replace(/^(\d+) of the (\w+)$/, '$1 with $2'));
    s.highlights = [{ kind: 'moves', from: null, to: [...new Set(legal.map((m) => m.to))] }];
    return ok(`You have ${legal.length} legal moves: ${joinAnd(parts)}. Ask about a piece, for example "what can my knight do?"`);
  }
  let from = null;
  if (ff && fr) { const r = sqOf(ff, fr); if (r.error) return no(r.error); from = r.sq; }
  const type = piece && PIECE_WORD[String(piece).toLowerCase()];
  if (from) {
    const pc = c.get(from);
    if (!pc) return no(`There is no piece on ${from}.`);
    if (pc.color !== ucol(s)) return no(`The ${NAME[pc.type]} on ${from} is mine, not yours.`);
    if (type && pc.type !== type) return no(`The piece on ${from} is your ${NAME[pc.type]}, not a ${NAME[type]}.`);
  }
  const owners = listSquares(c, s, type, from);
  if (!owners.length) return no(type ? `You have no ${PLURAL[type]} left.` : 'You have nothing there to move.');
  const lines = [];
  const hl = [];
  for (const p of owners) {
    const mv = legal.filter((m) => m.from === p.square);
    const dests = [...new Set(mv.map((m) => m.to))];
    const caps = mv.filter((m) => m.captured && !m.promotion || (m.captured && m.promotion === 'q'));
    if (!dests.length) { lines.push(`Your ${NAME[p.type]} on ${p.square} has no legal moves right now.`); continue; }
    const quiet = dests.filter((d) => !mv.find((m) => m.to === d).captured);
    const takes = caps.map((m) => `${m.to} (taking ${article(NAME[m.captured])})`);
    const parts = [];
    if (quiet.length) parts.push(`go to ${joinAnd(quiet)}`);
    if (takes.length) parts.push(`${quiet.length ? 'or ' : ''}capture on ${joinAnd(takes)}`);
    lines.push(`Your ${NAME[p.type]} on ${p.square} can ${parts.join(' ')}.`);
    hl.push({ kind: 'moves', from: p.square, to: dests });
  }
  s.highlights = hl;
  return ok(lines.join(' '));
}

export function hint(ctx) {
  const f = foreign(ctx, 'hint');
  if (f) return f;
  const s = ctx.state;
  show(ctx);
  if (s.status !== 'playing') return no(overText(s));
  if (s.turn !== s.user || s.pendingEngine) return no('It is my move, so I cannot suggest yours yet. One moment.', 'missing');
  s.pendingHint = true;
  ctx.effect('chess.engine.hint', { fen: s.fen, level: 8, movetime: 800 });
  return ok('Let me think about your best move.');
}

function pointsText(n) {
  const a = Math.abs(n);
  return a === 1 ? 'a pawn' : a === 2 ? 'two pawns' : a === 3 ? 'a knight or a bishop' : a === 5 ? 'a rook' : a === 9 ? 'a queen' : `${a} points`;
}
export function status(ctx) {
  const f = foreign(ctx, 'status');
  if (f) return f;
  const s = ctx.state;
  if (s.status !== 'playing') {
    if (s.status === 'checkmate') return ok(`The game is over: checkmate, ${s.winner === s.user ? 'you won' : 'I won'}.`);
    if (s.status === 'resigned') return ok('The game is over: you resigned, so I won.');
    return ok(`The game ended in a draw by ${s.reason}.`);
  }
  const diff = s.material[s.user] - s.material[other(s.user)];
  const lead = diff === 0 ? 'Material is level.' : diff > 0 ? `You are ahead: you have ${pointsText(diff)} more than I do (${diff} ${diff === 1 ? 'point' : 'points'}).` : `I am ahead: I have ${pointsText(diff)} more than you do (${-diff} ${diff === -1 ? 'point' : 'points'}).`;
  const count = s.history.length === 0 ? ' The game has not started yet.' : '';
  return ok(`${lead}${count} That is only a count of the material, not an evaluation of the position. ${toMove(s)}${s.check ? ` ${s.turn === s.user ? 'Your' : 'My'} king is in check.` : ''}`);
}

export function check(ctx, { k } = {}) {
  const s = ctx.state;
  const word = String(k ?? 'check');
  if (s.status === 'checkmate') return ok(`${word === 'stalemate' ? 'No, it is not stalemate, it is checkmate.' : 'Yes, it is checkmate.'} ${s.winner === s.user ? 'You win.' : 'I win.'}`);
  if (s.status === 'stalemate') return ok(word === 'stalemate' ? 'Yes, it is stalemate: the game is a draw.' : 'No check, but it is stalemate: the game is a draw.');
  if (s.check) {
    const who = s.turn === s.user ? 'your king' : 'my king';
    if (word === 'checkmate' || word === 'mate') return ok(`No, it is not checkmate, but ${who} is in check.`);
    return ok(`Yes, ${who} is in check.`);
  }
  if (word === 'checkmate' || word === 'mate') return ok('No, it is not checkmate.');
  if (word === 'stalemate') return ok('No, it is not stalemate.');
  return ok('No, neither king is in check.');
}

export function last(ctx, { who } = {}) {
  const f = foreign(ctx, 'last');
  if (f) return f;
  const s = ctx.state;
  const hv = load(s).history({ verbose: true });
  if (!hv.length) return ok('Nobody has moved yet.');
  const want = who === 'me' ? ucol(s) : who === undefined ? null : ecol(s);
  const m = want ? [...hv].reverse().find((x) => x.color === want) : hv.at(-1);
  if (!m) return ok(who === 'me' ? 'You have not moved yet.' : 'I have not moved yet.');
  const byUser = m.color === ucol(s);
  const sel = who === undefined ? (byUser ? 'Your' : 'My') : who === 'me' ? 'Your' : 'My';
  return ok(`${sel} last move was ${plainMove(m)}, from ${m.from} to ${m.to}.`);
}

function inventory(c, color) {
  const groups = {};
  for (const p of piecesOf(c, color)) (groups[p.type] ??= []).push(p.square);
  const parts = [];
  for (const t of ORDER) {
    const sq = (groups[t] ?? []).sort((x, y) => fi(x) - fi(y) || ri(x) - ri(y));
    if (!sq.length) continue;
    if (t === 'p' && sq.length === 8 && sq.every((q) => q[1] === sq[0][1])) parts.push(`eight pawns on the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][ri(sq[0])]} rank`);
    else parts.push(`${sq.length > 1 ? PLURAL[t] : NAME[t]} on ${joinAnd(sq)}`);
  }
  return parts.join(', ');
}
function ownerLetter(s, w) {
  const x = String(w ?? '').toLowerCase();
  if (['my', 'our', 'mine', 'i', 'we'].includes(x)) return ucol(s);
  if (['your', 'yours', 'their', 'his', 'her', 'enemy', 'opponent', 'opposing', 'the_enemy', 'the_opposing', 'you', 'u', 'ur'].includes(x)) return ecol(s);
  if (x === 'white' || x === 'the_white') return 'w';
  if (x === 'black' || x === 'the_black') return 'b';
  return null;
}
export function describe(ctx, { o, who } = {}) {
  const f = foreign(ctx, 'describe');
  if (f) return f;
  const s = ctx.state;
  const c = load(s);
  const side = ownerLetter(s, o ?? who);
  const mineT = `You are ${s.user}. You have ${inventory(c, ucol(s))}.`;
  const theirsT = `I have ${inventory(c, ecol(s))}.`;
  if (side === ucol(s)) return ok(`You have ${inventory(c, ucol(s))}.`);
  if (side) return ok(`I have ${inventory(c, ecol(s))}.`);
  s.highlights = [];
  return ok(`${mineT} ${theirsT}${s.check ? ` ${s.turn === s.user ? 'Your' : 'My'} king is in check.` : ''}`);
}

export function where(ctx, { o, piece } = {}) {
  const s = ctx.state;
  const c = load(s);
  const t = piece && PIECE_WORD[String(piece).toLowerCase()];
  if (!t) return describe(ctx, { o });
  const side = ownerLetter(s, o);
  const sides = side ? [side] : [ucol(s), ecol(s)];
  const sentences = [];
  const hl = [];
  for (const col of sides) {
    const sq = piecesOf(c, col, t).map((p) => p.square).sort((x, y) => fi(x) - fi(y) || ri(x) - ri(y));
    const subj = col === ucol(s) ? 'Your' : 'My';
    if (!sq.length) sentences.push(col === ucol(s) ? `You have no ${PLURAL[t]} left.` : `I have no ${PLURAL[t]} left.`);
    else sentences.push(`${subj} ${sq.length === 1 ? NAME[t] + ' is' : PLURAL[t] + ' are'} on ${joinAnd(sq)}.`);
    hl.push(...sq);
  }
  s.highlights = hl.length ? [{ kind: 'squares', squares: hl }] : [];
  return ok(sentences.join(' '));
}

function counts(c, color, type) {
  const by = {};
  for (const p of piecesOf(c, color, type)) by[p.type] = (by[p.type] ?? 0) + 1;
  return by;
}
const numText = (n, t) => (n === 1 ? article(NAME[t]) : `${n} ${PLURAL[t]}`);
export function count(ctx, { piece, who, o } = {}) {
  const s = ctx.state;
  const c = load(s);
  const t = piece && PIECE_WORD[String(piece).toLowerCase()];
  const side = ownerLetter(s, who ?? o);
  const one = (col) => {
    const by = counts(c, col, t);
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    const subj = col === ucol(s) ? 'You have' : 'I have';
    if (t) return total ? `${subj} ${numText(total, t)}` : `${subj} no ${PLURAL[t]}`;
    return `${subj} ${total} pieces (${joinAnd(ORDER.split('').filter((x) => by[x]).map((x) => numText(by[x], x)))})`;
  };
  if (side) return ok(`${one(side)}.`);
  const total = piecesOf(c, 'w', t).length + piecesOf(c, 'b', t).length;
  return ok(`${one(ucol(s))} and ${one(ecol(s)).replace(/^I have/, 'I have')}. That makes ${total} ${t ? PLURAL[t] : 'pieces'} on the board.`.replace('. That', '. That'));
}

export function lost(ctx, { who, verb } = {}) {
  const s = ctx.state;
  const subj = String(who ?? 'we');
  const side = ownerLetter(s, subj);
  const taken = (col) => s.captured[colorName(col === 'w' ? 'b' : 'w')];   // pieces of colour col that the other side captured
  const text = (list) => joinAnd(ORDER.split('').filter((t) => list.includes(t)).map((t) => numText(list.filter((x) => x === t).length, t)));
  const mineLost = taken(ucol(s)), theirLost = taken(ecol(s));
  const mine = (l) => (l.length ? `You have lost ${text(l)}.` : 'You have not lost any pieces yet.');
  const theirs = (l) => (l.length ? `I have lost ${text(l)}.` : 'I have not lost any pieces yet.');
  if (!side) {
    if (!mineLost.length && !theirLost.length) return ok('No piece has been captured yet.');
    return ok(`${mine(mineLost)} ${theirs(theirLost)}`);
  }
  // "what did I capture" asks for the opponent's losses
  const target = verb === 'capture' ? (side === ucol(s) ? ecol(s) : ucol(s)) : side;
  if (verb === 'capture') {
    const l = taken(target);
    return ok(side === ucol(s) ? (l.length ? `You have captured ${text(l)}.` : 'You have not captured anything yet.') : (l.length ? `I have captured ${text(l)}.` : 'I have not captured anything yet.'));
  }
  return ok(target === ucol(s) ? mine(mineLost) : theirs(theirLost));
}

export function turn(ctx, { q } = {}) {
  const s = ctx.state;
  if (q === 'color') return ok(`You are playing ${s.user}, and I play ${other(s.user)}.`);
  if (s.status !== 'playing') return ok(overText(s));
  return ok(s.turn === s.user ? `It is your move, you play ${s.user}.` : `It is my move${s.pendingEngine ? ', I am thinking' : ''}.`);
}

export function history(ctx, { count: cnt } = {}) {
  const s = ctx.state;
  if (!s.history.length) return ok('No moves have been played yet.');
  if (cnt === 'true') {
    const n = s.history.length;
    return ok(`${n} ${n === 1 ? 'move has' : 'moves have'} been played so far, counting each side's turn separately.`);
  }
  const parts = [];
  s.history.forEach((san, i) => parts.push(i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san));
  return ok(`The moves so far: ${parts.join(' ')}.`);
}

export function fen(ctx) { return ok(`The position in FEN notation is ${ctx.state.fen}.`); }

export function square(ctx, { ff, fr, q }) {
  const s = ctx.state;
  const r = sqOf(ff, fr);
  if (r.error) return no(r.error);
  const p = load(s).get(r.sq);
  s.highlights = [{ kind: 'squares', squares: [r.sq] }];
  if (!p) return ok(q === 'piece' ? `No, ${r.sq} is empty.` : `${r.sq} is empty.`);
  const who = p.color === ucol(s) ? 'your' : 'my';
  return ok(q === 'piece' ? `Yes, ${who} ${NAME[p.type]} is on ${r.sq}.` : `On ${r.sq} there is ${who} ${NAME[p.type]}.`);
}

export function level(ctx, { n, name } = {}) {
  const s = ctx.state;
  if (n !== undefined || name !== undefined) { const f = foreign(ctx, 'level', name !== undefined ? { level: name } : { level: String(n) }); if (f) return f; }
  const say = (l) => `level ${l} (${LEVEL_NAME[l]})`;
  if (n === undefined && name === undefined) return ok(`I am playing at ${say(s.level)}, out of 8${s.engine === 'builtin' ? ', with my built-in player' : s.engine === 'stockfish' ? ', powered by Stockfish' : ''}.`);
  let next;
  if (n !== undefined) {
    next = Number(n);
    if (!Number.isInteger(next) || next < 1 || next > 8) return no('The levels go from 1 (beginner) to 8 (master). For example, say "set level 5".');
  } else {
    const w = String(name).toLowerCase();
    if (w in REL_LEVEL) {
      next = Math.min(8, Math.max(1, s.level + REL_LEVEL[w]));
      if (next === s.level) return ok(w in { easier: 1, weaker: 1, gentler: 1, softer: 1, lower: 1 } ? `I am already at the lowest level, ${say(1)}.` : `I am already at the highest level, ${say(8)}.`);
    } else if (w in ABS_LEVEL) next = ABS_LEVEL[w];
    else return no(`I do not know the level "${name}". Say a number from 1 to 8, or easier or harder.`);
  }
  const was = s.level;
  s.level = next;
  if (next === was) return ok(`I am already playing at ${say(next)}.`);
  return ok(`OK, I now play at ${say(next)}${next > was ? '. Good luck!' : '. I will go easier on you.'}`);
}

export function engineMove(ctx) {
  const s = ctx.state;
  if (s.status !== 'playing') return no(overText(s));
  if (s.turn === s.user) return ok('It is your move, not mine. Go ahead!');
  if (!s.pendingEngine) { queueEngine(ctx, s); return ok('OK, let me think.'); }
  const st = settle(ctx, s);
  if (st?.wait) return ok('I am still thinking, one moment.');
  return ok((st?.text ?? 'I have moved.').replace(/^Meanwhile /, '').replace(/^I /, 'OK, I '));
}

// ------------------------------------------------------------------ control

function intro(s) {
  const lvl = `I play at level ${s.level} (${LEVEL_NAME[s.level]}).`;
  const hint = 'Say a move such as "knight to f3" or "e2 to e4", or ask "what can my knight do?".';
  return s.user === 'white' ? `You are white and you move first. ${lvl} ${hint}` : `You are black, so I move first. ${lvl} I am thinking about my opening move. ${hint}`;
}
function start(ctx, s, user) {
  s.status = 'playing'; s.reason = null; s.user = user; s.orientation = user; s.pendingEngine = false;
  clearTransient(s);
  const c = new Chess();
  refresh(s, c);
  if (user === 'black') queueEngine(ctx, s);
}
export function newGame(ctx, { keep } = {}) {
  const s = ctx.state;
  show(ctx);
  if (keep === 'true' && s.history.length > 0 && s.status === 'playing') return ok(`We are already playing chess. ${toMove(s)}`);
  if (keep === 'true' && s.history.length === 0 && s.status === 'playing') {
    if (s.user === 'black' && !s.pendingEngine) queueEngine(ctx, s);
    return ok(`Let us play chess! ${intro(s)}`);
  }
  start(ctx, s, s.user);
  return ok(`New game of chess. ${intro(s)}`);
}
export function side(ctx, { color, swap, fresh } = {}) {
  const s = ctx.state;
  show(ctx);
  const want = swap === 'true' ? other(s.user) : String(color).toLowerCase();
  if (want !== 'white' && want !== 'black') return no('You can play white or black.');
  if (want === s.user && s.history.length > 0 && s.status === 'playing' && fresh !== 'true') return ok(`You are already playing ${want}. Say "new game" to start over.`);
  if (want === s.user && s.history.length === 0 && s.status === 'playing' && !s.pendingEngine) return ok(`You are already ${want}. ${intro(s)}`);
  start(ctx, s, want);
  return ok(`OK, new game: you play ${want}. ${intro(s)}`);
}
export function flip(ctx, { color } = {}) {
  const s = ctx.state;
  show(ctx);
  s.orientation = color ? String(color).toLowerCase() : other(s.orientation);
  return ok(`OK, you now see the board from ${s.orientation}'s side.`);
}
export function undo(ctx, { n, bare } = {}) {
  if (bare === 'true') { const f = foreign(ctx, 'undo'); if (f) return f; const tab = activeTab(ctx); if (tab && tab !== 'Chess') { const r = ctx.request('doc.undo'); return r.status === 'supported' ? ok(r.value) : no(r.note ?? 'There is nothing to undo here.', r.status); } }
  const s = ctx.state;
  show(ctx);
  const c = load(s);
  const hv = c.history({ verbose: true });
  const u = ucol(s);
  if (!hv.some((m) => m.color === u)) return no('There is nothing to take back yet.', 'missing');
  const want = Math.max(1, Number(n) || 1);
  let removed = 0, plies = 0;
  while (hv.length && removed < want) { budget.tick('ops.undo'); const m = hv.pop(); plies++; if (m.color === u) removed++; }
  const c2 = new Chess();
  for (const m of hv) c2.move(m.san);
  s.status = 'playing'; s.reason = null; s.pendingEngine = false;
  clearTransient(s);
  refresh(s, c2);
  const what = removed === 1 ? 'your last move' : `your last ${removed} moves`;
  const reply = plies > removed ? ' and my reply' : '';
  if (!hv.length) return ok(`OK, I took back ${what}${reply}. We are back at the start. ${toMove(s)}`);
  return ok(`OK, I took back ${what}${reply}. ${toMove(s)}`);
}
export function resign(ctx) {
  const s = ctx.state;
  if (s.status !== 'playing') return ok('The game is already over. Say "new game" to play again.');
  s.status = 'resigned'; s.winner = other(s.user); s.result = s.winner === 'white' ? '1-0' : '0-1'; s.reason = 'resignation';
  s.pendingEngine = false; s.pendingHint = false; s.dests = {}; s.pending = null; s.highlights = []; s.hint = null;
  return ok('OK, you resign, so I win this one. Good game! Say "new game" to play again.');
}
export function draw(ctx) {
  const s = ctx.state;
  if (s.status !== 'playing') return ok('The game is already over.');
  if (s.history.length < 20) return ok('It is a little early for a draw. Let us play on for a while.');
  const mine = s.material[other(s.user)], yours = s.material[s.user];
  if (mine > yours) return ok('No, thank you. I am ahead, so I would like to play on.');
  s.status = 'draw'; s.reason = 'agreement'; s.winner = null; s.result = '1/2-1/2';
  s.pendingEngine = false; s.pendingHint = false; s.dests = {}; s.pending = null; s.highlights = []; s.hint = null;
  return ok('OK, I accept the draw. Good game!');
}

/** One sentence about the game, for "where were we?" (read-only hook of the dialog layer, spec 11). */
export function summary(ctx) {
  const s = ctx.state;
  const n = (s.history ?? []).length;
  if (!n) return 'The game has not started yet: it is white to move.';
  return `The chess game has ${n} ${n === 1 ? 'move' : 'moves'} so far${s.status === 'playing' ? `, and it is ${s.turn} to move` : `, and it is over (${s.reason ?? s.result})`}.`;
}

// ---- the declared schema (schema.sop, declare=yes): the legal moves of the user, said as `sayMove` says them (the words the world reads)
import { declaredExecutor } from '../acts/acts.mjs?v=48543cb2a7';
import { SCHEMA } from './schema.declared.mjs?v=f9d8365892';
export const executor = declaredExecutor(SCHEMA, {
  sampleKnowledge: ({ state }) => {
    const s = state?.fen ? state : initialState();
    if (s.status !== 'playing' || s.turn !== s.user || s.pendingEngine) return { moves: [] };
    const say = (m) => cap1(sayMove(m)) + '.';
    return { moves: [...new Set(new Chess(s.fen).moves({ verbose: true }).map(say))] };
  },
});
