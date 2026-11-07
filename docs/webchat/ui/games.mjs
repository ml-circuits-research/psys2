// Game tabs: render the state of games.tictactoe, games.guess and games.hangman. Own code, no library.
import { h, pick, toArray } from './util.mjs';

const CELL_NAMES = ['top left', 'top middle', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const COLS = ['A', 'B', 'C'];

export function createTicTacToe(container) {
  container.classList.add('p2-game');
  const status = h('p', { class: 'p2-game-status', role: 'status' });
  const grid = h('div', { class: 'p2-ttt', role: 'grid', 'aria-label': 'Tic-tac-toe board' });
  const hint = h('p', { class: 'p2-game-hint' }, 'Say a cell by name (“top left”, “center”) or by coordinates (“B2”). Columns A–C, rows 1–3.');
  container.append(status, grid, hint);
  return {
    update(state) {
      const st = state ?? {};
      const board = Array.from({ length: 9 }, (_, i) => (toArray(st.board)[i] ?? '') || '');
      const user = st.user ?? 'X';
      const winner = st.winner && st.winner !== 'none' ? st.winner : null;
      const line = LINES.find((l) => board[l[0]] && board[l[0]] === board[l[1]] && board[l[1]] === board[l[2]]);
      const over = !!winner || board.every(Boolean);
      status.textContent = winner === 'draw' || (!winner && over) ? 'It is a draw.'
        : winner ? (winner === user ? `You won as ${winner}.` : `I won as ${winner}.`)
          : `You are ${user}. ${st.turn ? (st.turn === user ? 'Your turn.' : 'My turn.') : ''}${st.level ? ` Level: ${st.level}.` : ''}`;
      grid.replaceChildren(h('span', { class: 'p2-ttt-corner', 'aria-hidden': 'true' }),
        ...COLS.map((c) => h('span', { class: 'p2-ttt-head', 'aria-hidden': 'true' }, c)));
      for (let r = 0; r < 3; r++) {
        grid.append(h('span', { class: 'p2-ttt-head', 'aria-hidden': 'true' }, String(r + 1)));
        for (let c = 0; c < 3; c++) {
          const i = r * 3 + c, v = board[i];
          grid.append(h('div', {
            class: `p2-ttt-cell${v ? ` is-${v.toLowerCase()}` : ''}${line?.includes(i) ? ' is-win' : ''}`, role: 'gridcell',
            'aria-label': `${COLS[c]}${r + 1}, ${CELL_NAMES[i]}: ${v || 'empty'}`,
          }, v ? h('span', { class: 'p2-ttt-mark' }, v) : null,
          h('span', { class: 'p2-ttt-name', 'aria-hidden': 'true' }, v ? '' : `${COLS[c]}${r + 1}`, v ? '' : h('br'), v ? '' : CELL_NAMES[i])));
        }
      }
    },
  };
}

const PARTS = [
  '<circle cx="150" cy="75" r="20" />',
  '<line x1="150" y1="95" x2="150" y2="150" />',
  '<line x1="150" y1="110" x2="125" y2="135" />',
  '<line x1="150" y1="110" x2="175" y2="135" />',
  '<line x1="150" y1="150" x2="128" y2="190" />',
  '<line x1="150" y1="150" x2="172" y2="190" />',
];

export function createHangman(container) {
  container.classList.add('p2-game');
  const status = h('p', { class: 'p2-game-status', role: 'status' });
  const gallows = h('div', { class: 'p2-gallows' });
  const word = h('p', { class: 'p2-hang-word', 'aria-live': 'polite' });
  const letters = h('div', { class: 'p2-letters', 'aria-label': 'Letters' });
  const hint = h('p', { class: 'p2-game-hint' });
  container.append(status, gallows, word, letters, hint);
  return {
    update(state) {
      const st = state ?? {};
      const guessed = toArray(pick(st, 'guessed', 'letters', 'guesses', 'used')).map((c) => String(c).toLowerCase());
      let masked = pick(st, 'masked', 'display', 'pattern', 'shown');
      const secret = typeof st.word === 'string' ? st.word.toLowerCase() : null;
      if (Array.isArray(masked)) masked = masked.map((c) => c || '_').join('');
      if (!masked && secret) masked = [...secret].map((c) => (guessed.includes(c) || !/[a-z]/.test(c) ? c : '_')).join('');
      const max = pick(st, 'maxMisses', 'maxWrong', 'maxMistakes', 'lives') ?? 6;
      let wrongList = pick(st, 'wrong', 'misses', 'wrongLetters', 'mistakes');
      let misses = typeof wrongList === 'number' ? wrongList : Array.isArray(wrongList) ? wrongList.length : typeof wrongList === 'string' ? wrongList.length
        : secret ? guessed.filter((c) => !secret.includes(c)).length : 0;
      const wrongSet = new Set(typeof wrongList === 'number' || !wrongList ? (secret ? guessed.filter((c) => !secret.includes(c)) : []) : toArray(wrongList).map((c) => String(c).toLowerCase()));
      const shownParts = Math.min(PARTS.length, Math.round((misses / max) * PARTS.length));
      gallows.innerHTML = `<svg viewBox="0 0 220 220" role="img" aria-label="Hangman: ${misses} of ${max} mistakes"><g class="p2-gal-frame"><line x1="30" y1="205" x2="140" y2="205"/><line x1="60" y1="205" x2="60" y2="30"/><line x1="60" y1="30" x2="150" y2="30"/><line x1="150" y1="30" x2="150" y2="55"/></g>`
        + `<g class="p2-gal-body">${PARTS.slice(0, shownParts).join('')}</g></svg>`;
      const state_ = pick(st, 'status', 'result', 'outcome');
      const won = state_ === 'won' || (masked && !String(masked).includes('_') && String(masked).length > 0);
      const lost = state_ === 'lost' || misses >= max;
      status.textContent = !masked ? 'No game yet. Say “let’s play hangman”.' : won ? 'You found it!' : lost ? 'Game over.' : `${Math.max(0, max - misses)} mistakes left.`;
      word.textContent = masked ? [...String(masked).toUpperCase()].join(' ') : '';
      word.setAttribute('aria-label', masked ? `Word: ${[...String(masked)].map((c) => (c === '_' ? 'blank' : c)).join(' ')}` : '');
      letters.replaceChildren(...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => h('span', {
        class: `p2-letter${guessed.includes(c) ? (wrongSet.has(c) ? ' is-wrong' : ' is-right') : ''}`,
      }, c.toUpperCase())));
      const hintText = pick(st, 'hint');
      hint.textContent = hintText ? `Hint: ${hintText}` : 'Say “is there an E?”, “the letter R”, “is it elephant?” or “give me a hint”.';
    },
  };
}

export function createGuess(container) {
  container.classList.add('p2-game');
  const status = h('p', { class: 'p2-game-status', role: 'status' });
  const question = h('div', { class: 'p2-guess-q' });
  const meter = h('div', { class: 'p2-meter', role: 'img' }, h('span'));
  const count = h('p', { class: 'p2-guess-count' });
  const chips = h('div', { class: 'p2-chips' });
  const history = h('ol', { class: 'p2-guess-history', 'aria-label': 'Questions asked so far' });
  const hint = h('p', { class: 'p2-game-hint' }, 'Think of an animal. I will ask yes/no questions. Answer “yes”, “no” or “I don’t know”.');
  container.append(status, question, meter, count, chips, h('h3', { class: 'p2-sub' }, 'Questions so far'), history, hint);
  let maxSeen = 0;
  const qText = (q) => (typeof q === 'string' ? q : pick(q, 'text', 'question', 'sentence') ?? '');
  return {
    update(state) {
      const st = state ?? {};
      const cur = qText(pick(st, 'question', 'current', 'currentQuestion'));
      const asked = toArray(Array.isArray(pick(st, 'asked', 'questions', 'history')) ? pick(st, 'asked', 'questions', 'history') : []);
      const cand = pick(st, 'candidates', 'remaining');
      const n = Array.isArray(cand) ? cand.length : typeof cand === 'number' ? cand : pick(st, 'candidateCount', 'remainingCount');
      if (typeof n === 'number') maxSeen = Math.max(maxSeen, n);
      const phase = pick(st, 'phase', 'status', 'state');
      const guess = pick(st, 'guess', 'finalGuess', 'answer');
      status.textContent = guess ? `I think it is: ${typeof guess === 'string' ? guess : guess.name ?? ''}.` : phase === 'lost' || phase === 'gave_up' ? 'I give up. Teach me: “it was a zebra”.'
        : cur ? 'My question:' : 'No game yet. Say “let’s play guess the animal”.';
      question.textContent = cur;
      question.hidden = !cur || !!guess;
      const pct = typeof n === 'number' && maxSeen ? Math.round((n / maxSeen) * 100) : 100;
      meter.firstChild.style.width = `${pct}%`;
      meter.setAttribute('aria-label', typeof n === 'number' ? `${n} candidates remain` : 'candidates unknown');
      meter.hidden = typeof n !== 'number';
      count.textContent = typeof n === 'number' ? `${n} ${n === 1 ? 'candidate remains' : 'candidates remain'}` : '';
      chips.replaceChildren(...(Array.isArray(cand) && cand.length <= 8 ? cand.map((c) => h('span', { class: 'p2-chip' }, typeof c === 'string' ? c : c?.name ?? '')) : []));
      history.replaceChildren(...asked.map((a) => h('li', {}, qText(a), (a && typeof a === 'object' && (a.answer ?? a.reply)) != null ? h('strong', {}, ` ${a.answer ?? a.reply}`) : null)));
      history.previousSibling.hidden = history.hidden = !asked.length;
    },
  };
}
