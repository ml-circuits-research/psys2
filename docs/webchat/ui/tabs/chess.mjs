// Chess tab plugin (spec 07 section 6). Renders the state of games.chess with Chessground (GPL-3.0) and runs Stockfish
// (GPL-3.0, Web Worker) for the effects chess.engine.bestmove and chess.engine.hint. Rules live in the world: the board only
// draws, and a click or drag becomes a typed command ("e2 to e4") so mouse and voice share one language layer.
import { h } from '../util.mjs';
import { createStockfish } from './chess/engine.mjs';

const LEVEL_NAME = ['', 'beginner', 'easy', 'casual', 'intermediate', 'club player', 'strong', 'expert', 'master'];
const SAY = ['knight to f3', 'e2 to e4', 'bishop takes c6', 'castle kingside', 'what can my knight do?', 'who is winning?', 'undo my move', 'play harder'];
const PROMOS = [['queen', 'a queen'], ['rook', 'a rook'], ['bishop', 'a bishop'], ['knight', 'a knight']];
const STARTING = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ORDER = 'qrbnp';
const ONCE = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const piece = (type, color, cls = 'cx-cap') => h('span', { class: `cg-wrap ${cls}`, 'aria-hidden': 'true' }, h('piece', { class: `${type} ${color}` }));
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function loadCss(host, path) {
  const href = host.asset(path);
  if (ONCE.has(href) || document.querySelector(`link[href="${href}"]`)) return;
  ONCE.add(href);
  document.head.append(h('link', { rel: 'stylesheet', href }));
}

function make(holder, host) {
  loadCss(host, 'vendor/chess/chessground.css');
  loadCss(host, 'ui/tabs/chess/chess.css');
  const engine = createStockfish(host.asset('vendor/chess/stockfish-19-lite-single.js'));
  let cg = null, last = null, destroyed = false, onResize = null;

  // ---- DOM
  const boardEl = h('div', { class: 'cx-board', role: 'application', 'aria-label': 'Chess board. Use the chat to move: for example, say knight to f3.' });
  const overlay = h('div', { class: 'cx-over', hidden: true });
  const promo = h('div', { class: 'cx-promo', hidden: true });
  const wrap = h('div', { class: 'cx-boardwrap' }, boardEl, overlay, promo);
  const mkStrip = () => {
    const badge = h('div', { class: 'cx-badge' }), name = h('b'), sub = h('span'), taken = h('div', { class: 'cx-taken' }), adv = h('span', { class: 'cx-adv' });
    const think = h('span', { class: 'cx-think', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
    return { el: h('div', { class: 'cx-strip' }, h('div', { class: 'cx-who' }, badge, h('div', { class: 'cx-names' }, name, sub)), taken, adv, think), badge, name, sub, taken, adv, think };
  };
  const top = mkStrip(), bottom = mkStrip();
  const status = h('div', { class: 'cx-status', role: 'status', 'aria-live': 'polite' });
  const levelBtns = Array.from({ length: 8 }, (_, i) => h('button', { class: 'cx-lvl', type: 'button', 'aria-pressed': 'false', title: `Level ${i + 1}: ${LEVEL_NAME[i + 1]}`, onclick: () => host.send(`set level ${i + 1}`) }, String(i + 1)));
  const lvlName = h('p', { class: 'cx-lvlname' });
  const engineInfo = h('p', { class: 'cx-engine' });
  const moves = h('ol', { class: 'cx-moves', 'aria-label': 'Moves' });
  const empty = h('p', { class: 'cx-empty' }, 'No moves yet. You can also drag a piece, or click it and then its destination.');
  const btn = (label, cmd, title) => h('button', { class: 'cx-btn', type: 'button', title: title ?? cmd, onclick: () => host.send(cmd) }, label);
  const hintBtn = btn('Hint', 'give me a hint', 'Show the best move');
  const undoBtn = btn('Undo', 'undo my move', 'Take back my last move and the reply');
  const resignBtn = btn('Resign', 'I resign the game');
  const drawBtn = btn('Offer draw', 'offer a draw');
  const say = h('p', { class: 'cx-say' }, 'Try saying ', SAY.slice(0, 5).flatMap((t, i) => [i ? ', ' : '', h('q', {}, t)]), '.');
  const root = h('div', { class: 'cx' },
    h('div', { class: 'cx-main' }, top.el, wrap, bottom.el),
    h('aside', { class: 'cx-side', 'aria-label': 'Game information' },
      status,
      h('div', { class: 'cx-panel' }, h('h4', {}, 'Strength'), h('div', { class: 'cx-levels' }, levelBtns), lvlName, engineInfo),
      h('div', { class: 'cx-panel' }, h('h4', {}, 'Moves'), moves, empty),
      h('div', { class: 'cx-actions' }, btn('New game', 'new chess game'), undoBtn, hintBtn, btn('Flip board', 'flip the board'), drawBtn, resignBtn),
      say));
  holder.style.maxWidth = '1040px';
  holder.append(root);

  // ---- board
  const ground = import(host.asset('vendor/chess/chessground.mjs')).then((m) => {
    if (destroyed) return;
    cg = m.Chessground(boardEl, {
      fen: STARTING, coordinates: true, animation: { enabled: true, duration: 280 },
      highlight: { lastMove: true, check: true },
      draggable: { enabled: true, showGhost: true, distance: 3 }, selectable: { enabled: true },
      premovable: { enabled: false }, drawable: { enabled: true, visible: true, autoShapes: [] },
      movable: { free: false, showDests: true, events: { after: (from, to) => onUserMove(from, to) } },
    });
    if (typeof ResizeObserver === 'function') { onResize = new ResizeObserver(() => { cg?.redrawAll(); if (last && boardEl.offsetWidth) cg?.set({ drawable: { autoShapes: shapes(last) } }); }); onResize.observe(boardEl); }
    if (last) render(last);
  }).catch((e) => { boardEl.replaceChildren(h('p', { class: 'cx-empty', style: 'padding:24px' }, `The board could not be loaded (${e?.message ?? e}). You can still play by typing moves.`)); });
  // Stockfish compiles in the background so the first reply is quick.
  setTimeout(() => { if (!destroyed) engine.warm().then(refreshEngineInfo); }, 400);

  function onUserMove(from, to) {
    Promise.resolve(host.send(`${from} to ${to}`)).finally(() => { if (!destroyed && last) render(last); });   // snap back when the world refused the move
  }

  function shapes(st) {
    const out = [];
    for (const hl of st.highlights ?? []) {
      if (hl.kind === 'hint') out.push({ orig: hl.from, dest: hl.to, brush: 'green' });
      else if (hl.kind === 'moves') { if (hl.from) out.push({ orig: hl.from, brush: 'green' }); for (const t of hl.to ?? []) out.push({ orig: t, brush: 'paleGreen' }); }
      else if (hl.kind === 'squares') for (const q of hl.squares ?? []) out.push({ orig: q, brush: 'yellow' });
    }
    return out;
  }

  function render(st) {
    if (!cg) return;
    const dests = new Map(Object.entries(st.dests ?? {}));
    const myTurn = st.status === 'playing' && st.turn === st.user && !st.pendingEngine && !st.pending?.kind?.startsWith?.('promotion');
    cg.set({
      fen: st.fen, orientation: st.orientation ?? 'white', turnColor: st.turn, check: st.check || false,
      lastMove: st.lastMove ? [st.lastMove.from, st.lastMove.to] : undefined,
      movable: { color: myTurn ? st.user : undefined, dests, free: false, showDests: true },
      // Arrows need the board's real size: while the tab is hidden draw none (the resize observer redraws on show).
      drawable: { autoShapes: boardEl.offsetWidth ? shapes(st) : [] },
    });
  }

  function strip(s, st, color) {
    const mine = color === st.user;
    const bsq = piece('king', color, 'cx-cap');
    s.badge.replaceChildren(bsq);
    s.name.textContent = mine ? 'You' : 'PSys2';
    s.sub.textContent = mine ? `${color === 'white' ? 'White' : 'Black'}` : `${color === 'white' ? 'White' : 'Black'} · level ${st.level} (${LEVEL_NAME[st.level]})`;
    const took = (st.captured?.[color] ?? []).slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    s.taken.replaceChildren(...took.map((t) => piece(NAMES[t], color === 'white' ? 'black' : 'white')));
    const diff = (st.material?.[color] ?? 0) - (st.material?.[color === 'white' ? 'black' : 'white'] ?? 0);
    s.adv.textContent = diff > 0 ? `+${diff}` : '';
    s.think.classList.toggle('is-on', !mine && !!st.pendingEngine && st.status === 'playing');
  }

  function refreshEngineInfo() {
    const i = engine.info;
    engineInfo.textContent = i.status === 'ready' ? 'Engine: Stockfish 19 (lite WASM), running in your browser.'
      : i.status === 'loading' ? 'Engine: Stockfish is loading…'
        : i.status === 'unavailable' ? 'Engine: Stockfish is unavailable here; a simple built-in player is used.' : 'Engine: Stockfish loads on first use.';
  }

  function banner(st) {
    const mine = st.turn === st.user;
    const you = st.user, who = (c) => (c === you ? 'You' : 'I');
    if (st.status === 'checkmate') return ['over', `Checkmate`, st.winner === you ? 'You win. Well played!' : 'I win this time. Good game!'];
    if (st.status === 'stalemate') return ['over', 'Stalemate', 'The game is a draw.'];
    if (st.status === 'draw') return ['over', 'Draw', `Drawn by ${st.reason}.`];
    if (st.status === 'resigned') return ['over', 'You resigned', 'I win this one. Good game!'];
    if (st.pending?.kind === 'promotion') return ['', 'Promote your pawn', 'Choose a piece.'];
    if (st.pending?.kind === 'ambiguous') return ['', 'Which piece?', 'Say, for example, “the one on g1”.'];
    if (st.pendingEngine) return ['wait', 'Thinking…', `I am choosing a reply at level ${st.level}.`];
    if (st.check) return ['check', mine ? 'Your king is in check!' : 'Check!', mine ? 'Get your king out of check.' : ''];
    return ['', mine ? 'Your move' : 'My move', `You play ${st.user}. ${st.history?.length ? '' : 'Drag a piece or say a move.'}`];
  }

  function update(state) {
    const st = state ?? { fen: STARTING, history: [], user: 'white', turn: 'white', status: 'playing', level: 3, orientation: 'white', dests: {}, captured: { white: [], black: [] }, material: { white: 39, black: 39 }, highlights: [] };
    last = st;
    const bottomColor = st.orientation ?? 'white', topColor = bottomColor === 'white' ? 'black' : 'white';
    strip(top, st, topColor); strip(bottom, st, bottomColor);
    const [kind, title, sub] = banner(st);
    status.className = `cx-status${kind ? ` is-${kind}` : ''}`;
    status.replaceChildren(h('strong', {}, title), h('span', {}, sub));
    levelBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(st.level === i + 1)));
    lvlName.textContent = `Level ${st.level}: ${LEVEL_NAME[st.level]}. Say “play harder” or “set level 6”.`;
    // move list
    const h2 = st.history ?? [];
    moves.replaceChildren(...Array.from({ length: Math.ceil(h2.length / 2) }, (_, i) => h('li', {},
      h('span', { class: 'n' }, `${i + 1}.`),
      h('span', { class: `m${h2.length === i * 2 + 1 ? ' is-last' : ''}` }, h2[i * 2]),
      h('span', { class: `m${h2.length === i * 2 + 2 ? ' is-last' : ''}` }, h2[i * 2 + 1] ?? ''))));
    empty.hidden = h2.length > 0; moves.hidden = h2.length === 0;
    moves.scrollTop = moves.scrollHeight;
    const over = st.status !== 'playing';
    undoBtn.disabled = !h2.length; hintBtn.disabled = over || !!st.pendingEngine; resignBtn.disabled = over; drawBtn.disabled = over;
    // overlays
    overlay.hidden = !over;
    if (over) overlay.replaceChildren(h('h3', {}, title), h('p', {}, sub), h('button', { type: 'button', onclick: () => host.send('new chess game') }, 'New game'));
    const promoting = st.pending?.kind === 'promotion' && !over;
    promo.hidden = !promoting;
    if (promoting) {
      promo.replaceChildren(h('div', {}, ...PROMOS.map(([name, phrase]) => h('button', { type: 'button', 'aria-label': `Promote to ${phrase}`, title: name, onclick: () => host.send(`promote to ${phrase}`) }, piece(name, st.user, 'cx-pp')))));
    }
    refreshEngineInfo();
    ground.then(() => render(st));
  }

  return { update, engine, destroy() { destroyed = true; onResize?.disconnect(); cg?.destroy?.(); engine.destroy(); } };
}

/** Runs the engine for an effect; the world plays the move (or its built-in fallback when ok is false). */
async function search({ fen, level, movetime }, { ui }) {
  const started = Date.now();
  try {
    const best = await ui.engine.bestmove(fen, level, movetime);
    const wait = 450 - (Date.now() - started);        // a short pause so the reply reads as thinking and the animation is not instant
    if (wait > 0) await sleep(wait);
    return { ok: true, detail: `stockfish ${best}`, data: { bestmove: best, fen } };
  } catch (e) {
    return { ok: false, detail: e?.message ?? String(e) };
  }
}

export default {
  id: 'chess', label: 'Chess', world: 'games.chess', order: 40, make,
  effects: { 'chess.engine.bestmove': search, 'chess.engine.hint': search },
};
