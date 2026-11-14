// SPDX-License-Identifier: AGPL-3.0-only
// games.chess on the matrix reasoner (spec 15). The rules (whose turn it is, check, checkmate, stalemate, draws, resignation, material, captured pieces, and what a
// move may not be: the refusals with their reasons) are in matrix.sop; this file is what the library cannot say: the move generator and the search (chess.js and the
// engine of ops.mjs), reading "knight to f3", the questions about the position, and the words of the replies (the same sentences ops.mjs says).
// The game is wires (matrix.sop): one chess.game, one chess.piece per piece, one chess.move per ply, chess.legal, chess.drawn, chess.resign, chess.agreed.
// `toState` derives the state ops.mjs keeps (and the board reads) from them; `adopt` is the inverse (the operations that stay in ops.mjs change the state, the
// library takes it over as wires), so the rules, the undo and the explanation always read the game on the screen.
// Browser-safe. It imports its sibling ops.mjs (a world is plain files) and the vendored chess.js.
import { Chess } from './vendor/chess.mjs?v=9a44601d41';
import { initialState, load, refresh, intent, resolve, move as opsMove, can as opsCan, NAME, VAL, colorName, other, fi, ri, ucol, plainMove } from './ops.mjs?v=2596a44639';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const un = (v) => { const s = String(v ?? ''); if (s.startsWith('"')) { try { return JSON.parse(s); } catch { /* not JSON */ } } return s; };
const val = (w, k) => un(w?.attrs?.[k]?.[0]);
const TYPES = ['chess.game', 'chess.piece', 'chess.move', 'chess.legal', 'chess.drawn', 'chess.resign', 'chess.agreed'];
const DEFAULT_REST = { pendingEngine: false, pendingTries: 0, pendingHint: false, pending: null, highlights: [], hint: null };
/** How often the rules and the move generator were compared and how often they disagreed on a move chess.js plays (the tests read it; it must stay 0). */
export const agreement = { checked: 0, drift: 0 };

// ------------------------------------------------------------------ the state, derived from the wires

/** Why the computer chose a move, from what the move does (the engine only says which move; Stockfish gives no reason). */
function whyOf(mv, after) {
  if (after.isCheckmate()) return 'mate';
  if (mv.flags.includes('k') || mv.flags.includes('q')) return 'castle';
  if (mv.promotion) return 'promote';
  if (mv.captured) return 'capture';
  if (after.isCheck()) return 'check';
  if ((mv.piece === 'n' || mv.piece === 'b') && (mv.from[1] === '1' || mv.from[1] === '8')) return 'develop';
  if ((mv.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(mv.to)) || (mv.piece === 'n' && ['c3', 'f3', 'c6', 'f6', 'e4', 'e5', 'd4', 'd5'].includes(mv.to))) return 'center';
  return 'best';
}

// What chess.js says of a position is the dearest thing in a turn (the move generator, the draw rules, the history replayed for repetition): it is remembered by
// (user, history, fen), so a position is analysed once whoever asks (the state, the plan of wires, the action), and a move wire is made from the position before it.
const CACHE = new Map(), RECS = new Map();
const BASE = initialState();
const keyOf = (user, history, fen) => `${user}|${fen}|${history.join(' ')}`;
const remember = (map, key, v) => { if (map.size > 600) map.clear(); map.set(key, v); return v; };

/** The wire attributes of the moves of a game (the position before each is the previous entry's fen). */
function recordsOf(user, history) {
  const key = `${user}|${history.join(' ')}`;
  let rec = RECS.get(key);
  if (rec) return rec;
  const prev = history.length > 1 ? recordsOf(user, history.slice(0, -1)) : { list: [], fen: new Chess().fen() };
  budget.tick('chess.project');
  const r = new Chess(prev.fen);
  const mv = r.move(history.at(-1));
  const by = colorName(mv.color);
  const one = { n: history.length - 1, by, fs: mv.from, ts: mv.to, piece: mv.piece, san: mv.san, cap: mv.captured, promo: mv.promotion, flags: mv.flags, why: by === user ? undefined : whyOf(mv, r), f1: fi(mv.from), r1: ri(mv.from), f2: fi(mv.to), r2: ri(mv.to) };
  rec = { list: [...prev.list, one], fen: r.fen() };
  return remember(RECS, key, rec);
}

/** The position as chess.js says it: the fields `refresh` of ops.mjs derives, the pieces, how many moves are legal and which draw (if any) it is. */
function analyze(user, history, fen) {
  const key = keyOf(user, history, fen);
  let a = CACHE.get(key);
  if (a) return a;
  const t = { ...structuredClone(BASE), user, history: [...history], fen };
  const c = load(t);
  refresh(t, c);
  a = {
    state: t,
    pieces: c.board().flat().filter(Boolean).map((p) => ({ sq: p.square, type: p.type, color: colorName(p.color) })),
    legal: c.moves().length,
    draw: c.isDraw() && !c.isStalemate() && !c.isCheckmate() ? (c.isInsufficientMaterial() ? 'insufficient material' : c.isThreefoldRepetition() ? 'threefold repetition' : 'the fifty-move rule') : null,
  };
  return remember(CACHE, key, a);
}

/** The state ops.mjs keeps, derived from the wires. The status, the check, the material and the captured pieces are what the rules concluded. */
export function toState({ find }) {
  const g = find('chess.game')[0];
  if (!g) return structuredClone(BASE);
  const moves = find('chess.move').map((w) => ({ n: Number(val(w, 'n')), san: val(w, 'san') })).sort((a, b) => a.n - b.n);
  const rest = { ...DEFAULT_REST, ...(val(g, 'rest') ? JSON.parse(val(g, 'rest')) : {}) };
  const history = moves.map((m) => m.san), fen = val(g, 'fen'), user = val(g, 'user');
  const a = analyze(user, history, fen).state;   // turn, lastMove, dests ... as the move generator has them
  const s = { ...structuredClone(BASE), user, level: Number(val(g, 'level')), seed: Number(val(g, 'seed')), orientation: val(g, 'orient'), engine: val(g, 'engine'), ...structuredClone(rest), history, fen, turn: a.turn, lastMove: structuredClone(a.lastMove) };
  const res = find('chess.resign')[0], agreed = find('chess.agreed')[0];
  // what the rules concluded (chess.js agrees: the tests compare the two)
  const over = find('chess.over')[0];
  if (res) Object.assign(s, { status: 'resigned', winner: other(val(res, 'by')), result: other(val(res, 'by')) === 'white' ? '1-0' : '0-1', reason: 'resignation' });
  else if (agreed) Object.assign(s, { status: 'draw', reason: 'agreement', winner: null, result: '1/2-1/2' });
  else if (!over) Object.assign(s, { status: 'playing', winner: null, result: '*', reason: null });
  else {
    const how = val(over, 'how'), winner = val(over, 'winner') || null;
    Object.assign(s, { status: how, winner, result: winner ? (winner === 'white' ? '1-0' : '0-1') : '1/2-1/2', reason: val(over, 'reason') });
  }
  s.dests = s.status === 'playing' && s.turn === s.user && !s.pendingEngine ? structuredClone(a.dests) : {};
  const mats = find('chess.material');
  s.material = mats.length === 2 ? (() => { const pts = Object.fromEntries(mats.map((w) => [val(w, 'color'), Number(val(w, 'points'))])); return { white: pts.white, black: pts.black }; })() : structuredClone(a.material);
  const taken = find('chess.taken').map((w) => ({ n: Number(val(w, 'n')), by: val(w, 'by'), piece: val(w, 'piece') })).sort((x, y) => x.n - y.n);
  s.captured = { white: taken.filter((t) => t.by === 'white').map((t) => t.piece), black: taken.filter((t) => t.by === 'black').map((t) => t.piece) };
  const side = val(find('chess.side')[0], 'by');
  const king = find('chess.piece').find((p) => val(p, 'type') === 'k' && val(p, 'color') === side);
  s.check = find('chess.incheck')[0] && king ? val(king, 'sq') : null;
  return s;
}

// ------------------------------------------------------------------ the wires, derived from the state (the inverse of toState)

const bare = (v) => (/^[\w.-]+$/.test(String(v)) ? String(v) : JSON.stringify(String(v)));
const line = (id, type, attrs) => `@${id} ${type} ${Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${bare(v)}`).join(' ')}`;

/** The wires a state asks for: Map(id -> { type, attrs }). */
function wiresOf(s) {
  const want = new Map();
  const rest = {};
  for (const [k, d] of Object.entries(DEFAULT_REST)) if (JSON.stringify(s[k]) !== JSON.stringify(d)) rest[k] = s[k];
  want.set('chess.g', { type: 'chess.game', attrs: { user: s.user, level: s.level, seed: s.seed, orient: s.orientation, engine: s.engine, fen: s.fen, rest: Object.keys(rest).length ? JSON.stringify(rest) : undefined } });
  const a = analyze(s.user, s.history, s.fen);
  for (const p of a.pieces) want.set(`chess.p.${p.sq}`, { type: 'chess.piece', attrs: { sq: p.sq, type: p.type, color: p.color, f: fi(p.sq), r: ri(p.sq) } });
  for (const m of s.history.length ? recordsOf(s.user, s.history).list : []) want.set(`chess.m.${m.n}`, { type: 'chess.move', attrs: m });
  want.set('chess.lg', { type: 'chess.legal', attrs: { count: a.legal } });
  if (a.draw) want.set('chess.dr', { type: 'chess.drawn', attrs: { reason: a.draw } });
  if (s.status === 'resigned') want.set('chess.rs', { type: 'chess.resign', attrs: { by: s.user } });
  if (s.status === 'draw' && s.reason === 'agreement') want.set('chess.ag', { type: 'chess.agreed', attrs: {} });
  return want;
}

/** What to retract, replace in place and tell so that the library holds the state: only what differs (a move played adds one move wire and moves a piece or two). */
function planOf(s, find) {
  const want = wiresOf(s);
  const retract = [], replace = [], tell = [];
  const kept = new Set();
  for (const type of TYPES) {
    for (const w of find(type)) {
      budget.tick('chess.plan');
      const d = want.get(w.id);
      if (!d) { retract.push(w.id); continue; }
      const same = d.type === type && Object.entries(d.attrs).every(([k, v]) => v === undefined || v === null || String(v) === val(w, k)) && !d.attrs.rest === !w.attrs?.rest;
      kept.add(w.id);
      if (!same) replace.push({ id: w.id, type: d.type, attrs: Object.fromEntries(Object.entries(d.attrs).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, [bare(v)]])) });   // the wire keeps its id (library R6.9)
    }
  }
  for (const [key, d] of want) if (!kept.has(key)) tell.push(line(key, d.type, d.attrs));
  return { retract, replace, tell: tell.join('\n') };
}

/** The operations of ops.mjs changed the state: the wires that say the same (host: `ReasonerSession.adoptState`). */
export function adopt({ state, find }) {
  const p = planOf(state, find);
  if (!(p.retract.length || p.replace.length || p.tell)) return null;
  // only the transient rest of the game moved (the wait counter of an engine move, a shown hint): no move, no new position. `quiet`: the host does not count it as a step to undo.
  const game = find('chess.game')[0];
  const quiet = !p.retract.length && !p.tell && p.replace.length === 1 && p.replace[0].type === 'chess.game' && game && un(String(p.replace[0].attrs.fen?.[0])) === val(game, 'fen');
  return quiet ? { ...p, quiet: true } : p;
}

// ------------------------------------------------------------------ the actions

const stateOf = (ctx) => toState({ find: ctx.find });
class Checkpoint { constructor(text) { this.text = text; } }
const SCRATCH = (ctx, st, effects) => ({
  checkpoint: ctx.live?.checkpoint ? (text) => { throw new Checkpoint(text); } : undefined,   // a late engine reply is its own change, not the user's step: the action stops, the host marks the timeline and runs it again
  state: st,
  effect: (name, args = {}) => effects.push({ name: String(name), args: structuredClone(args) }),
  request: () => ({ status: 'unsupported' }),   // the tab routing of ops.mjs: the actions that need it are declined below
  batch: ctx.live?.batch ?? null,
  find: ctx.find,
});
/** Puts the state ops.mjs left on the scratch context into the library (retract and tell what changed). */
function commit(ctx, st) {
  const p = planOf(st, ctx.find);
  if (!p.retract.length && !p.replace.length && !p.tell) return;
  const r = ctx.world.applyPatch({ retract: p.retract, replace: p.replace, wires: p.tell });   // one transaction: the rules settle once
  if (!r.ok) throw new Error(`the position was refused: ${r.violations?.[0]?.why ?? r.violations?.[0]?.kind}`);
}

/** A move that is only being thought of, as the wire the rules check (the piece on the square is read from the wires). */
function tryOf(ctx, st, from, to, it, extra = {}) {
  const mover = ctx.find('chess.piece').find((p) => val(p, 'sq') === from);
  const n = ctx.find('chess.move').length;
  return `@chess.try chess.try tid=t${n} by=${st.user} piece=${mover ? val(mover, 'type') : 'none'} pc=${mover ? val(mover, 'color') : 'none'} want=${it.pt ?? 'none'} fs=${from} ts=${to} f1=${fi(from)} r1=${ri(from)} f2=${fi(to)} r2=${ri(to)} ep=${extra.ep ? 'true' : 'false'}`;
}
/** The rule that matters most when several are broken (the squares and the game before the way a piece moves, that before what is in the way, that before check). */
const RANK = [/\.over/, /\.turn$/, /\.(nopiece|theirs|want|same|own)$/, /\.(geo|pawn)/, /\.blocked/, /\.(kingAttacked|mustStop|pinned)$/];
const rankOf = (v) => { const i = RANK.findIndex((re) => re.test(String(v.rule))); return i < 0 ? RANK.length : i; };
const reasonOf = (violations) => [...violations].filter((v) => v.why).sort((a, b) => rankOf(a) - rankOf(b))[0]?.why ?? null;

/** The squares a move that no legal move matches is about: from the origin square, or the one piece of that kind (as ops.mjs explains it); null when it cannot be told. */
function candidate(ctx, st, it) {
  if (it.from && it.to) return { from: it.from, to: it.to };
  if (!it.from && it.to && !it.castle) {
    const type = it.pt ?? it.wp;
    if (type) { const mine = ctx.find('chess.piece').filter((p) => val(p, 'color') === st.user && val(p, 'type') === type); if (mine.length === 1) return { from: val(mine[0], 'sq'), to: it.to }; }
  }
  return null;
}

/** The envelope of an ops.mjs answer ({ status, value | note }) with what the operations queued. */
const envelope = (r, effects) => ({ ...(r.status && r.status !== 'supported' ? { status: r.status, note: r.note } : { value: r.value }), ...(effects.length ? { effects } : {}), openTab: 'chess' });

/** A bare square ("a3") or a bare "undo" may belong to another tab (tic-tac-toe, the editor, the drawing): ops.mjs asks the tab, so the library hands the request back then. */
const bareSquare = (a) => !a.piece && !a.ff && !a.cap && !a.castle && !a.san && !a.promo && !a.tp && !a.wp && a.tf;
const OTHER_TABS = ['Tic-tac-toe', 'Editor', 'Drawing'];
function elsewhere(ctx) {
  let r;
  try { r = ctx.live?.request?.('ui.whichTab'); } catch { return false; }
  const m = r?.status === 'supported' ? /You are on the (.+) tab/.exec(String(r.value ?? '')) : null;
  return !!m && OTHER_TABS.includes(m[1]);
}

/**
 * "Knight to f3" / "Can I play knight to f3?": ops.mjs reads it and plays it on a scratch copy of the state (the move generator, the notation and the choice of the
 * reply stay there). The rules decide what a refusal says; the move that was played must pass the rules (the position before it is what the library still holds);
 * then the state ops.mjs left is taken over as wires.
 */
function validated(ctx, args0, name) {
  const args = Object.fromEntries(Object.entries(args0 ?? {}).map(([k, v]) => [k, typeof v === 'string' ? un(v) : v]));   // the library hands string arguments over quoted
  const st = stateOf(ctx);
  if (!ctx.find('chess.game')[0]) commit(ctx, st);   // the first use of the world: the starting position becomes wires
  // the game is over, or it is not the user's turn: the rules say so (and why), before anything is read
  const probe = ctx.world.check({ wires: `@chess.try chess.try tid=probe by=${st.user} piece=none pc=none want=none fs=a1 ts=a1 f1=0 r1=0 f2=0 r2=0 ep=false` });
  const violations = probe.ok ? [] : probe.violations ?? [];
  const overWhy = violations.find((v) => /\.over/.test(String(v.rule)))?.why;
  if (overWhy) return { status: 'unsupported', note: overWhy, openTab: 'chess' };
  const turnWhy = violations.find((v) => /\.turn$/.test(String(v.rule)))?.why;
  const it = intent(args);
  const before = st.history.length, pending = st.pending;
  const effects = [];
  let r;
  try { r = (name === 'move' ? opsMove : opsCan)(SCRATCH(ctx, st, effects), args); }
  catch (e) {
    if (!(e instanceof Checkpoint)) throw e;
    commit(ctx, st);   // the engine's reply that was waiting is told now; the user's move is read again on the position it left
    ctx.live.checkpoint(e.text);
    return { value: e.text, openTab: 'chess' };
  }
  const refused = name === 'move' ? r.status === 'unsupported' : typeof r.value === 'string' && r.value.startsWith('No. ');
  if (!turnWhy && !it.error && !pending && refused) {
    // a move that no legal move matches: the rules explain it when the squares can be told
    const cand = candidate(ctx, st, it);
    const check = cand ? ctx.world.check({ wires: tryOf(ctx, st, cand.from, cand.to, it) }) : null;
    const why = check && !check.ok ? reasonOf(check.violations ?? []) : null;
    if (why) { commit(ctx, st); return name === 'can' ? { value: `No. ${why}`, openTab: 'chess' } : { status: 'unsupported', note: why, openTab: 'chess' }; }
  } else if (name === 'move' && !turnWhy && !refused && st.history.length === before + 1 && st.lastMove && !/^O-O/.test(st.lastMove.san)) {
    // a move chess.js played must pass the rules too (castling and en passant are not shapes the rules know: chess.js alone decides them)
    const { from, to } = st.lastMove;
    const at = (sq) => ctx.find('chess.piece').find((p) => val(p, 'sq') === sq);
    const ep = val(at(from), 'type') === 'p' && from[0] !== to[0] && !at(to);
    if (!ep) {
      const check = ctx.world.check({ wires: tryOf(ctx, st, from, to, it) });
      agreement.checked++;
      if (!check.ok) agreement.drift++;
    }
  }
  commit(ctx, st);
  const out = envelope(r, effects);
  const carried = ctx.live?.carry;   // what the engine said when its late reply was told in the run before this one
  if (carried) { if (typeof out.value === 'string') out.value = `${carried} ${out.value}`; else if (typeof out.note === 'string') out.note = `${carried} ${out.note}`; }
  if (turnWhy && out.note && out.status === 'missing') out.note = `${turnWhy} ${out.note}`;
  return out;
}

export const fns = {
  chessMove(ctx, args) {
    if (bareSquare(args) && elsewhere(ctx)) return { decline: true };
    return validated(ctx, args, 'move');
  },
  chessCan(ctx, args) { return validated(ctx, args, 'can'); },

  /** "Why did you play that?": the reason the computer's last move left on its wire. */
  chessWhy(ctx) {
    const st = stateOf(ctx);
    const mine = ctx.find('chess.move').filter((w) => val(w, 'by') !== st.user).sort((a, b) => Number(val(b, 'n')) - Number(val(a, 'n')))[0];
    if (!mine) return { status: 'missing', note: 'I have not played yet.' };
    const piece = val(mine, 'piece'), captured = val(mine, 'cap') || undefined, san = val(mine, 'san');
    const mv = { piece, captured, to: val(mine, 'ts'), from: val(mine, 'fs'), promotion: val(mine, 'promo') || undefined, flags: val(mine, 'flags') };
    const because = {
      mate: 'it checkmates you, so it wins the game',
      castle: 'castling puts my king in safety and brings my rook into the game',
      promote: 'my pawn reached the last rank, so I turned it into a stronger piece',
      capture: `it wins ${captured ? `your ${NAME[captured]}` : 'a piece'}${captured && VAL[captured] >= VAL[piece] ? '' : ', and I looked at what you could take back'}`,
      check: 'it gives check, so you have to answer it',
      develop: `it brings my ${NAME[piece]} out into the game`,
      center: 'it takes space in the center',
      best: st.engine === 'stockfish' ? 'my engine, Stockfish, found it the best move after looking ahead' : 'it was the best move I found in this position',
    }[val(mine, 'why')] ?? `it was the move I chose (${san})`;
    return { value: `I played ${plainMove(mv)} because ${because}.`, from: [mine.id], openTab: 'chess' };
  },
};

/** What "undo" says in the world's words: the moves that went (the host calls it with the states before and after the rewind). */
export function undoWords({ before, after }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet: no move has been played.' };
  const gone = before.history.length - after.history.length;
  if (gone <= 0) return { value: 'OK, I took that back.', openTab: 'chess' };
  const byUser = Array.from({ length: gone }, (_, i) => (after.history.length + i) % 2 === (before.user === 'white' ? 0 : 1)).filter(Boolean).length;
  const what = byUser === 0 ? 'my last move' : byUser === gone ? (gone === 1 ? 'your last move' : `your last ${gone} moves`) : byUser === 1 && gone === 2 ? 'your last move and my reply' : `the last ${gone} moves`;
  return { value: `OK, I took back ${what}. ${after.history.length === 0 ? 'We are back at the start. ' : ''}${after.turn === after.user ? 'It is your move.' : 'It is my move.'}`, openTab: 'chess' };
}
