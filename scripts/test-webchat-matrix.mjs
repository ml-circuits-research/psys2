#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Matrix reasoner in the real webchat (SOPWORLD-1, spec 15): headless Chrome, 390x844, CPU throttling (default 4x), rules formalizer.
 *
 *   default   the Reasoner setting is `ops`: "add to my list" still reads as before and nothing of the matrix shows.
 *   ask       matrix: "add to my list" asks "What shall I put on the list?" and "bread" completes it.
 *   revise    matrix: "I buy a ball" then "three of them" revises the purchase; the money follows.
 *   undo      matrix: "undo that" takes the purchase back and the money is back.
 *   why       matrix: "why?" after a shop answer says what the answer rests on (the library's `explain`).
 *   abduce    matrix: "I got 5 lei back for a book, what did I pay?" answers 17.
 *   setting   Settings > Developer > Reasoner switches the engine (a restart) and the gains appear.
 *   assume    matrix: "I buy the ball" then "how much money do I have?" says "I assumed 1 ball." once; the phrase log record carries the assumption.
 *   tictactoe matrix: an illegal move is refused with the reason and the tab board does not change, "undo" takes the move back (the board on the tab follows),
 *             "why did you play there?" explains, a finished game refuses moves.
 *
 *   node scripts/test-webchat-matrix.mjs [--only default,ask,revise,undo,why,abduce,setting,assume,tictactoe] [--throttle 4] [--chrome /usr/bin/chromium]
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const MATRIX = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const say = async (c, text) => { const r = await c.say(text); return r.reply; };

export const SCENARIOS = {
  async default(o) {
    const c = await openChat({ ...o, settings: { formalizer: 'rules', normalizer: false, showTrace: false } });
    try {
      const a = await say(c, 'add to my list');
      check('default: the setting is ops, "add to my list" is read as it always was (no question asked)', !/What shall I put on the list/.test(a), a.slice(0, 80));
      await say(c, 'I have 20 lei'); await say(c, 'I buy a ball');
      // Since SOPWORLD-1b item 2 the ops rules also revise the last purchase (shop.reviseLast), so both strategies read it.
      const t = await say(c, 'three of them');
      check('default: "three of them" revises the purchase in ops too (shop.reviseLast)', /3 balls|that makes 3/i.test(t), t.slice(0, 80));
      check('default: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async ask(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'add to my list');
      check('ask: "add to my list" asks what to put on the list', /What shall I put on the list\?/.test(a), a.slice(0, 80));
      const b = await say(c, 'bread');
      check('ask: the answer completes the command', /added bread/i.test(b), b.slice(0, 80));
      check('ask: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async revise(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy a ball');
      const a = await say(c, 'three of them');
      check('revise: "three of them" revises the purchase', /3 balls/.test(a), a.slice(0, 80));
      const m = await say(c, 'how much money do I have?');
      check('revise: the money follows (20 - 3 x 5 = 5)', /5 lei/.test(m), m.slice(0, 80));
    } finally { await c.close(); }
  },
  async undo(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy a ball');
      check('undo: the purchase spent money', /15 lei/.test(await say(c, 'how much money do I have?')));
      const u = await say(c, 'undo that');
      check('undo: "undo that" takes the purchase back', /took that back/.test(u), u.slice(0, 80));
      const m = await say(c, 'how much money do I have?');
      check('undo: the money is back', /20 lei/.test(m), m.slice(0, 80));
    } finally { await c.close(); }
  },
  async why(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy a ball');
      await say(c, 'how much money do I have?');
      const w = await say(c, 'why?');
      check('why: "why?" says what the answer rests on', /worked that out from/.test(w) && /I have 20 lei/.test(w) && /I buy a ball/.test(w), w.slice(0, 200));
    } finally { await c.close(); }
  },
  async abduce(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'I got 5 lei back for a book, what did I pay?');
      check('abduce: "I got 5 lei back for a book, what did I pay?" answers 17', /17/.test(a), a.slice(0, 120));
    } finally { await c.close(); }
  },
  async setting(o) {
    const c = await openChat({ ...o, settings: { formalizer: 'rules', normalizer: false, showTrace: false } });
    try {
      const pg = c.pg;
      await pg.click('button[aria-label="Settings"]');
      await pg.waitForSelector('#p2-st-developer', { timeout: 5000 });
      await pg.click('#p2-st-developer');
      await pg.waitForSelector('#p2-f-reasoner', { timeout: 5000 });
      check('setting: Settings > Developer has a Reasoner select, default ops', (await pg.$eval('#p2-f-reasoner', (s) => s.value)) === 'ops');
      const opts = await pg.$$eval('#p2-f-reasoner option', (os) => os.map((x) => x.value));
      check('setting: the options are ops and matrix', JSON.stringify(opts) === JSON.stringify(['ops', 'matrix']), opts.join(','));
      await pg.select('#p2-f-reasoner', 'matrix');
      const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}').reasoner);
      check('setting: the choice is saved', saved === 'matrix', String(saved));
      await pg.keyboard.press('Escape');
      await pg.waitForFunction(() => !document.querySelector('.p2-modal'), { timeout: 5000 }).catch(() => {});
      // the engine restarts: wait until it answers again
      await new Promise((r) => setTimeout(r, 500));
      let a = '';
      for (let i = 0; i < 3 && !/What shall I put on the list\?/.test(a); i++) a = await say(c, 'add to my list');
      check('setting: after the switch the matrix reasoner answers ("add to my list" asks)', /What shall I put on the list\?/.test(a), a.slice(0, 80));
      check('setting: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async assume(o) {
    const c = await openChat({ ...o, settings: { ...MATRIX, logPhrases: true } });
    try {
      await say(c, 'I have 20 lei');
      await say(c, 'I buy the ball');
      const a = await say(c, 'how much money do I have?');
      check('assume: the answer says what it assumed, once', /You have 15 lei left\. I assumed 1 ball\./.test(a) && (a.match(/I assumed/g) ?? []).length === 1, a.slice(0, 120));
      const rec = await c.lastPhrase();
      check('assume: the phrase log record carries the assumption', JSON.stringify(rec?.detail?.assumptions ?? rec?.assumptions ?? '').includes('count=1 (default)'), JSON.stringify(rec?.detail?.assumptions ?? null));
      const b = await say(c, 'how much money do I have?');
      check('assume: asked again, it does not repeat itself', !/I assumed/.test(b), b.slice(0, 80));
      check('assume: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async tictactoe(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      // the board of the tab, row by row, as a 9-character string: X, O or .
      const board = () => c.pg.$$eval('.p2-ttt-cell', (cs) => cs.map((x) => (x.classList.contains('is-x') ? 'X' : x.classList.contains('is-o') ? 'O' : '.')).join(''));
      const marks = (b) => b.replace(/\./g, '').length;
      const a = await say(c, "Let's play tic tac toe");
      check('tictactoe: the game starts and its tab is open', /You are X and you go first/.test(a) && (await board()).length === 9, a.slice(0, 80));
      const m = await say(c, 'center');
      const b1 = await board();
      check('tictactoe: my move and the answer are on the tab board', /You took the center\. I took/.test(m) && b1[4] === 'X' && marks(b1) === 2, `${m.slice(0, 60)} | ${b1}`);
      const r = await say(c, 'center');
      const b2 = await board();
      check('tictactoe: a taken square is refused with the reason, and the tab board does not change', r === 'The center is already taken by you. Please pick another place.' && b2 === b1, `${r.slice(0, 80)} | ${b2}`);
      const w = await say(c, 'why did you play there?');
      check('tictactoe: "why did you play there?" explains the computer\'s move', /^I played .+ because /.test(w), w.slice(0, 120));
      const u = await say(c, 'undo');
      const b3 = await board();
      check('tictactoe: "undo" takes the move and the answer back, the tab board follows', /took back your last move and my answer/.test(u) && marks(b3) === 0, `${u.slice(0, 60)} | ${b3}`);
      await say(c, 'top left');
      const u2 = await say(c, 'oops, take that back');
      const b4 = await board();
      check('tictactoe: "oops, take that back" says what it took back and the board is empty again', /took back your last move and my answer/.test(u2) && marks(b4) === 0, `${u2.slice(0, 80)} | ${b4}`);
      await say(c, 'I give up');
      const o2 = await say(c, 'bottom right');
      check('tictactoe: a move after the game is over is refused', o2 === 'The game is over. Say "new game" to play again.' && marks(await board()) === 0, o2.slice(0, 80));
      await say(c, 'undo');
      const g = await say(c, 'center');
      check('tictactoe: undo of the resignation reopens the game', /You took the center\./.test(g) && marks(await board()) === 2, g.slice(0, 80));
      check('tictactoe: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const only = (arg('only', Object.keys(SCENARIOS).join(','))).split(',');
  const o = { throttle: Number(arg('throttle', 4)), chrome: arg('chrome') };
  for (const name of only) await SCENARIOS[name](o);
  const bad = results.filter((r) => !r.ok);
  console.log(`${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
}
