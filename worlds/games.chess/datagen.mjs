// Training-data generator of games.chess (spec 08). Browser-safe: no imports.
// Every example is built from a symbolic move description together with its text, so the expected request is known
// independently of the formalizer. Square spellings: typed (e4), spoken (e four) and NATO (echo four).
export const version = '1';

const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const PIECE_SYN = { knight: ['knight', 'horse', 'night'], rook: ['rook', 'rock'] };
const FILES = 'abcdefgh'.split('');
const NATO = { a: 'alpha', b: 'bravo', c: 'charlie', d: 'delta', e: 'echo', f: 'foxtrot', g: 'golf', h: 'hotel' };
const RANK_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const NEGATIVES = [
  'Tom has 5 apples.', 'How many legs does a spider have?', 'Make your body blue.', 'Add a heading Shopping.', 'What is 7 plus 5?',
  'Is there an E in the word?', 'Where is Paris?', 'Hello there.', 'Thank you very much.', 'Tell me a fact about the elephant.',
  'Open the editor.', 'Play tic tac toe.', 'Center.', 'Top left.', 'A square has four sides.', 'What time is it?',
  'The knight in shining armor rode away.', 'My king is a lion.', 'I like pawns.', 'Bishops wear tall hats.',
];

const pick = (rng, a) => a[Math.floor(rng() * a.length)];

function sq(rng) {
  const f = pick(rng, FILES), r = 1 + Math.floor(rng() * 8);
  const style = pick(rng, ['typed', 'typed', 'spoken', 'nato']);
  if (style === 'typed') return { text: `${f}${r}`, tf: f, tr: r };
  if (style === 'spoken') return { text: `${f} ${RANK_WORDS[r]}`, tf: f, tr: r };
  return { text: `${NATO[f]} ${RANK_WORDS[r]}`, tf: NATO[f], tr: r };
}
const pieceWord = (rng, p) => pick(rng, PIECE_SYN[p] ?? [p]);
const args = (o) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `arg.${k}=${v}`).join(' ');
const req = (action, o = {}) => `@x1 core.request action=${action}${Object.keys(o).length ? ' ' + args(o) : ''}`;
const cap1 = (t) => t[0].toUpperCase() + t.slice(1);
const ex = (text, expect, group, phenomenon, more = {}) => ({ text, expect, group, phenomenon, negative: false, ...more });

const families = [
  // ---- moves
  (rng) => { const p = pick(rng, PIECES), w = pieceWord(rng, p), t = sq(rng), v = pick(rng, ['', '', 'Move my ', 'Move the ', 'I play the ', 'Let me move the ']);
    return ex(`${v ? v + w : cap1(w)} ${pick(rng, ['to', 'to', 'on'])} ${t.text}.`, req('chess.move', { piece: w, tf: t.tf, tr: t.tr }), 'chess.move.piece', 'request'); },
  (rng) => { const p = pick(rng, PIECES.slice(1)), w = pieceWord(rng, p), t = sq(rng);
    return ex(`${cap1(w)} ${t.text}.`, req('chess.move', { piece: w, tf: t.tf, tr: t.tr }), 'chess.move.piece.short', 'request'); },
  (rng) => { const t = sq(rng), v = pick(rng, ['', 'Play ', 'Move to ', 'Go to ', 'Let me play ', 'I play ']);
    return ex(`${v}${v ? t.text : cap1(t.text)}.`, req('chess.move', { tf: t.tf, tr: t.tr }), 'chess.move.bare', 'request'); },
  (rng) => { const a = sq(rng), b = sq(rng), j = pick(rng, [' to ', ' ', ' to ']);
    return ex(`${cap1(a.text)}${j}${b.text}.`, req('chess.move', { ff: a.tf, fr: a.tr, tf: b.tf, tr: b.tr }), 'chess.move.fromto', 'request'); },
  (rng) => { const p = pick(rng, PIECES), a = sq(rng), b = sq(rng), w = pieceWord(rng, p);
    return ex(`Move the ${w} on ${a.text} to ${b.text}.`, req('chess.move', { piece: w, ff: a.tf, fr: a.tr, tf: b.tf, tr: b.tr }), 'chess.move.fromto.piece', 'request'); },
  (rng) => { const p = pick(rng, 'nbrqk'.split('')), f = pick(rng, FILES), r = 1 + Math.floor(rng() * 8), cap = rng() < 0.4;
    const raw = `${p.toUpperCase()}${cap ? 'x' : ''}${f}`;
    return ex(`${raw}${r}.`, req('chess.move', { san: `"${raw}"`, tr: r }), 'chess.move.san', 'request'); },
  // ---- captures
  (rng) => { const p = pick(rng, PIECES), w = pieceWord(rng, p), t = sq(rng), v = pick(rng, ['takes', 'captures', 'takes']);
    return ex(`${cap1(w)} ${v} ${t.text}.`, req('chess.move', { piece: w, cap: 'true', tf: t.tf, tr: t.tr }), 'chess.cap.square', 'request'); },
  (rng) => { const t = sq(rng), tp = pick(rng, PIECES.slice(0, 5));
    return ex(`Take the ${tp} on ${t.text}.`, req('chess.move', { cap: 'true', tp, tf: t.tf, tr: t.tr }), 'chess.cap.target', 'request'); },
  (rng) => { const p = pick(rng, PIECES), tp = pick(rng, PIECES.slice(0, 5));
    return ex(`${cap1(p)} takes ${tp}.`, req('chess.move', { piece: p, cap: 'true', tp }), 'chess.cap.pieces', 'request'); },
  (rng) => { const tp = pick(rng, PIECES.slice(0, 5)), wp = pick(rng, PIECES);
    return ex(`Take the ${tp} with the ${wp}.`, req('chess.move', { cap: 'true', tp, wp }), 'chess.cap.with', 'request'); },
  (rng) => { const t = sq(rng), wp = pick(rng, PIECES);
    return ex(`Capture ${t.text} with the ${wp}.`, req('chess.move', { cap: 'true', tf: t.tf, tr: t.tr, wp }), 'chess.cap.square.with', 'request'); },
  // ---- castling and promotion
  (rng) => { const side = pick(rng, ['k', 'q']), text = side === 'k' ? pick(rng, ['Castle kingside.', 'Castle king side.', 'Short castle.', 'I castle short.', 'O-O.', 'Castle on the kingside.']) : pick(rng, ['Castle queenside.', 'Castle queen side.', 'Long castle.', 'I castle long.', 'O-O-O.', 'Castle on the queenside.']);
    return ex(text, req('chess.move', { castle: side }), 'chess.castle', 'request'); },
  () => ex('Castle.', req('chess.move', { castle: 'any' }), 'chess.castle.any', 'request'),
  (rng) => { const pr = pick(rng, ['queen', 'rook', 'bishop', 'knight']), v = pick(rng, ['Promote to a ', 'Promote to ', 'Make it a ', 'Promote the pawn to a ']);
    return ex(`${v}${pr}.`, req('chess.promote', { piece: pr }), 'chess.promote.reply', 'request'); },
  (rng) => { const f = pick(rng, FILES), pr = pick(rng, ['queen', 'knight']);
    return ex(`Pawn to ${f}8 promoting to a ${pr}.`, req('chess.move', { piece: 'pawn', tf: f, tr: 8, promo: pr }), 'chess.move.promotion', 'request'); },
  // ---- answers to a question of the system
  (rng) => { const a = sq(rng);
    return ex(`The one on ${a.text}.`, req('chess.pick', { ff: a.tf, fr: a.tr }), 'chess.pick.square', 'ellipsis', { context: ['Knight to d2.'] }); },
  (rng) => { const o = pick(rng, ['first', 'second', 'left', 'right', 'last']);
    return ex(`The ${o} one.`, req('chess.pick', { ord: o }), 'chess.pick.ordinal', 'ellipsis', { context: ['Knight to d2.'] }); },
  // ---- questions
  (rng) => { const p = pick(rng, PIECES), w = pieceWord(rng, p), v = pick(rng, ['What can my %s do?', 'Where can the %s go?', 'What moves does the %s have?']);
    return ex(v.replace('%s', w), req('chess.moves', { piece: w }), 'chess.q.moves', 'question'); },
  (rng) => ex(pick(rng, ['What are my legal moves?', 'What moves do I have?', 'List all legal moves.']), req('chess.moves', { all: 'true' }), 'chess.q.moves.all', 'question'),
  (rng) => { const w = pick(rng, ['castle', 'castle kingside']), t = sq(rng), p = pieceWord(rng, pick(rng, PIECES));
    return rng() < 0.5 ? ex(`Can I move my ${p} to ${t.text}?`, req('chess.can', { piece: p, tf: t.tf, tr: t.tr }), 'chess.q.can', 'question')
      : ex(`Can I ${w}?`, req('chess.can', { castle: w === 'castle' ? 'any' : 'k' }), 'chess.q.can.castle', 'question'); },
  (rng) => { const [text, k] = pick(rng, [['Is it check?', 'check'], ['Am I in check?', 'check'], ['Is that checkmate?', 'checkmate']]);
    return ex(text, req('chess.check', { k }), 'chess.q.check', 'question'); },
  (rng) => ex(pick(rng, ['Who is winning?', 'Am I winning?', 'Who is ahead?', 'How am I doing?']), req('chess.status'), 'chess.q.status', 'question'),
  (rng) => ex(pick(rng, ['What was your last move?', 'What did you play?', 'What was the last move?']), req('chess.last'), 'chess.q.last', 'question'),
  (rng) => ex(pick(rng, ['Read the board.', 'Describe the position.', 'What is on the board?', 'Describe the board.']), req('chess.describe'), 'chess.q.describe', 'question'),
  (rng) => { const p = pick(rng, PIECES), o = pick(rng, ['my', 'your']);
    return ex(`Where ${p === 'pawn' || p === 'rook' || p === 'bishop' || p === 'knight' || p === 'queen' ? 'are' : 'is'} ${o} ${p === 'king' || p === 'queen' ? p : p + 's'}?`, req('chess.where', { o, piece: p }), 'chess.q.where', 'question'); },
  (rng) => { const w = pick(rng, ['do I', 'do you']);
    return ex(`How many pieces ${w} have?`, req('chess.count', { piece: 'piece', who: w.endsWith('I') ? 'i' : 'you' }), 'chess.q.count', 'question'); },
  (rng) => ex(pick(rng, ['Which pieces did I lose?', 'What did I lose?']), req('chess.lost', { who: 'i' }), 'chess.q.lost', 'question'),
  (rng) => ex(pick(rng, ['Whose turn is it?', 'Who is to move?']), req('chess.turn'), 'chess.q.turn', 'question'),
  (rng) => { const t = sq(rng);
    return ex(`What is on ${t.text}?`, req('chess.square', { ff: t.tf, fr: t.tr }), 'chess.q.square', 'question'); },
  (rng) => ex(pick(rng, ['What should I play?', 'Suggest a move.', 'What is the best move?']), req('chess.hint'), 'chess.q.hint', 'question'),
  // ---- control
  (rng) => { const c = pick(rng, ['white', 'black']);
    return ex(pick(rng, [`I play ${c}.`, `Let me play as ${c}.`, `Give me ${c}.`]), req('chess.side', { color: c }), 'chess.control.side', 'request'); },
  (rng) => ex(pick(rng, ['Flip the board.', 'Turn the board around.', 'Rotate the board.']), req('chess.flip'), 'chess.control.flip', 'request'),
  (rng) => ex(pick(rng, ['Undo my move.', 'Take back my last move.', 'Undo the last move.']), req('chess.undo', { n: 1 }), 'chess.control.undo', 'request'),
  (rng) => { const n = 5 + Math.floor(rng() * 3);
    return ex(pick(rng, [`Set level ${n}.`, `Set the level to ${n}.`]), req('chess.level', { n }), 'chess.control.level', 'request'); },
  (rng) => { const w = pick(rng, ['easier', 'harder']);
    return ex(pick(rng, [`Play ${w}.`, `Make it ${w}.`]), req('chess.level', { name: w }), 'chess.control.level.rel', 'request'); },
  (rng) => ex(pick(rng, ['Offer a draw.', 'I offer a draw.']), req('chess.draw'), 'chess.control.draw', 'request'),
  (rng) => ex(pick(rng, ['I resign the game.', 'I concede.', 'You win.']), req('chess.resign'), 'chess.control.resign', 'request'),
  (rng) => ex(pick(rng, ['New chess game.', 'Start a new chess game.']), req('chess.new'), 'chess.control.new', 'request'),
];

/** rng(): seeded uniform in [0,1). Returns at most `count` examples. */
export function generate({ rng, count }) {
  const out = [];
  const seen = new Set();
  const negatives = Math.min(NEGATIVES.length, Math.max(2, Math.floor(count / 12)));
  for (let i = 0; i < negatives; i++) out.push({ text: NEGATIVES[i], expect: null, group: 'chess.negative', phenomenon: 'out-of-domain', negative: true });
  for (let guard = 0; out.length < count && guard < count * 30; guard++) {
    const e = pick(rng, families)(rng);
    if (seen.has(e.text)) continue;
    seen.add(e.text);
    out.push(e);
  }
  return out;
}
