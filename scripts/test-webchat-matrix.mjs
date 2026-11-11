#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Matrix reasoner in the real webchat (SOPWORLD-1, spec 15): headless Chrome, 390x844, CPU throttling (default 4x), rules formalizer.
 *
 *   default   no saved Reasoner: the default is `matrix` (user decision 2026-11-11): "add to my list" asks, and a saved `ops` of an older settings version is migrated once.
 *   ops       the explicit `ops` fallback: "add to my list" still reads as before and nothing of the matrix shows.
 *   ask       matrix: "add to my list" asks "What shall I put on the list?" and "bread" completes it.
 *   revise    matrix: "I buy a ball" then "three of them" revises the purchase; the money follows.
 *   undo      matrix: "undo that" takes the purchase back and the money is back.
 *   why       matrix: "why?" after a shop answer says what the answer rests on (the library's `explain`).
 *   abduce    matrix: "I got 5 lei back for a book, what did I pay?" answers 17.
 *   setting   Settings > Developer > Reasoner (default matrix) switches the engine to ops (a restart) and the matrix gains disappear.
 *   assume    matrix: "I buy the ball" then "how much money do I have?" says "I assumed 1 ball." once; the phrase log record carries the assumption.
 *   tictactoe matrix: an illegal move is refused with the reason and the tab board does not change, "undo" takes the move back (the board on the tab follows),
 *             "why did you play there?" explains, a finished game refuses moves.
 *   hangman   matrix (stage 2): a repeated letter is answered by the rules and the tab does not change, "undo" takes the last guess back (the letter on the tab is
 *             free again), a finished game refuses guesses and undo reopens it.
 *   guess     matrix (stage 2): the animals still possible follow the answers on the tab, "undo" asks the last question again, a reply that does not fit is refused.
 *   time      matrix (stage 2): the day, the days until a day and the hours between come from the library, an hour the clock does not have is refused with the reason
 *             and the clock keeps its hour, "undo that" says it in the world's words.
 *   animals   matrix (stage 2): a taught fact is answered from the library and "undo that" forgets it in the world's words.
 *   profile   matrix (stage 2): two facts that cannot both be right are refused with the reason (and the tab keeps the first), "undo that" says what was forgotten.
 *   romanian  matrix (RO-MATRIX): a Romanian session: undo quotes the user's own words, a bare yes, a refusal, the shop tab name and the profile answer in Romanian.
 *
 *   node scripts/test-webchat-matrix.mjs [--only default,ops,ask,revise,undo,why,abduce,setting,assume,tictactoe,hangman,guess,time,animals,profile,romanian] [--throttle 4] [--chrome /usr/bin/chromium]
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';
import { docScenarios } from './test-webchat-docs.mjs';

const MATRIX = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' };
const OPS = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'ops', settingsVersion: 4 };   // an explicit choice of the current settings version
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const say = async (c, text) => { const r = await c.say(text); return r.reply; };

export const SCENARIOS = {
  async default(o) {
    // no `reasoner` saved; and a saved `ops` from settings version 3 (the old default, not a choice) is migrated to matrix once
    for (const [label, settings] of [['nothing saved', { formalizer: 'rules', normalizer: false, showTrace: false }], ['old saved ops (v3)', { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'ops', settingsVersion: 3 }]]) {
      const c = await openChat({ ...o, settings });
      try {
        const a = await say(c, 'add to my list');
        check(`default (${label}): the reasoner is matrix, "add to my list" asks what to put on the list`, /What shall I put on the list\?/.test(a), a.slice(0, 80));
        const saved = await c.pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}').reasoner);
        check(`default (${label}): the saved setting is matrix or absent`, saved === 'matrix' || saved === undefined, String(saved));
        check(`default (${label}): no page errors`, c.errors.length === 0, c.errors[0] ?? '');
      } finally { await c.close(); }
    }
  },
  async ops(o) {
    const c = await openChat({ ...o, settings: OPS });
    try {
      const a = await say(c, 'add to my list');
      check('ops: the explicit ops setting is respected, "add to my list" is read as it always was (no question asked)', !/What shall I put on the list/.test(a), a.slice(0, 80));
      await say(c, 'I have 20 lei'); await say(c, 'I buy a ball');
      // Since SOPWORLD-1b item 2 the ops rules also revise the last purchase (shop.reviseLast), so both strategies read it.
      const t = await say(c, 'three of them');
      check('ops: "three of them" revises the purchase in ops too (shop.reviseLast)', /3 balls|that makes 3/i.test(t), t.slice(0, 80));
      check('ops: no page errors', c.errors.length === 0, c.errors[0] ?? '');
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
      check('setting: Settings > Developer has a Reasoner select, default matrix', (await pg.$eval('#p2-f-reasoner', (s) => s.value)) === 'matrix');
      const opts = await pg.$$eval('#p2-f-reasoner option', (os) => os.map((x) => x.value));
      check('setting: the options are matrix and ops', JSON.stringify(opts) === JSON.stringify(['matrix', 'ops']), opts.join(','));
      await pg.select('#p2-f-reasoner', 'ops');
      const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}').reasoner);
      check('setting: the choice is saved', saved === 'ops', String(saved));
      await pg.keyboard.press('Escape');
      await pg.waitForFunction(() => !document.querySelector('.p2-modal'), { timeout: 5000 }).catch(() => {});
      // the engine restarts: wait until it answers again
      await new Promise((r) => setTimeout(r, 500));
      let a = '';
      for (let i = 0; i < 3 && !a; i++) a = await say(c, 'add to my list');
      check('setting: after the switch to ops "add to my list" no longer asks', a !== '' && !/What shall I put on the list\?/.test(a), a.slice(0, 80));
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
  async hangman(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const word = () => c.pg.$eval('.p2-hang-word', (e) => e.textContent.replace(/\s+/g, ''));
      const letters = () => c.pg.$$eval('.p2-letter', (cs) => cs.map((x) => (x.classList.contains('is-right') ? 'r' : x.classList.contains('is-wrong') ? 'w' : '.')).join(''));
      const a = await say(c, 'Play hangman with the word zebra');
      check('hangman: the game starts and its tab shows a blank word', /Hangman! I have chosen a word of 5 letters/.test(a) && (await word()) === '_____', `${a.slice(0, 60)} | ${await word()}`);
      const z = await say(c, 'Is there a Z?');
      check('hangman: a hit is on the tab', /Yes, there is one Z!/.test(z) && (await word()) === 'Z____' && (await letters())[25] === 'r', `${z.slice(0, 50)} | ${await word()}`);
      const l1 = await letters();
      const d = await say(c, 'Is there a Z?');
      check('hangman: a repeated letter is answered and the tab does not change', /^You already tried Z\./.test(d) && (await letters()) === l1 && (await word()) === 'Z____', d.slice(0, 60));
      await say(c, 'Is there an X?');
      check('hangman: a miss is marked wrong on the tab', (await letters())[23] === 'w', await letters());
      const u = await say(c, 'undo');
      check('hangman: "undo" takes the last guess back, the letter on the tab is free again', /took back your last guess/.test(u) && (await letters())[23] === '.' && (await word()) === 'Z____', `${u.slice(0, 60)} | ${await letters()}`);
      await say(c, 'I give up');
      const o2 = await say(c, 'Is there an E?');
      check('hangman: a guess after the game is refused', /^We are not playing hangman\./.test(o2) && (await word()) === 'ZEBRA', `${o2.slice(0, 60)} | ${await word()}`);
      await say(c, 'undo');
      const g = await say(c, 'Is there an E?');
      check('hangman: undo of the give-up reopens the game', /Yes, there is one E!/.test(g) && (await word()) === 'ZE___', `${g.slice(0, 50)} | ${await word()}`);
      check('hangman: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async guess(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const asked = () => c.pg.$$eval('.p2-guess-history li', (l) => l.length);
      const a = await say(c, 'Guess my animal');
      check('guess: the game starts and asks the first question', /Question 1: Does it have 4 legs\?/.test(a), a.slice(0, 100));
      const y = await say(c, 'yes');
      check('guess: an answer is on the tab and the next question is asked', /^Good\. Question 2:/.test(y) && (await asked()) === 1, `${y.slice(0, 60)} | ${await asked()}`);
      const u = await say(c, 'undo');
      check('guess: "undo" takes the answer back and asks that question again', /took back your last answer\. I am asking that question again: Does it have 4 legs\?/.test(u) && (await asked()) === 0, `${u.slice(0, 80)} | ${await asked()}`);
      await say(c, 'I give up');
      const r = await say(c, 'yes');
      check('guess: an answer that does not fit the game is refused with the reason', r === 'I am waiting to learn the animal. Tell me, for example: "it was a zebra".', r.slice(0, 80));
      check('guess: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async time(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'What day is tomorrow?');
      check('time: without a told day the answer asks for it', /^I need to know what day it is today\./.test(a), a.slice(0, 80));
      await say(c, 'Today is Friday.');
      const t = await say(c, 'What day is tomorrow?');
      check('time: tomorrow is worked out by the library from the day told', t === 'Tomorrow is Saturday.', t);
      const g = await say(c, 'How many days until Tuesday?');
      check('time: the days until a day', g === 'From today to Tuesday is 4 days.', g);
      const h = await say(c, 'How many hours from 9 to 3?');
      check('time: the hours between two o\'clock times', h === "It is 6 hours from 9 o'clock to 3 o'clock.", h);
      await say(c, "It is 3 o'clock.");
      const r = await say(c, "It is 30 o'clock.");
      check('time: an hour the clock does not have is refused with the reason', r === "That does not add up. That is not an hour on a clock: 30 o'clock.", r);
      const k = await say(c, 'What time is it?');
      check('time: the clock keeps its hour', k === "It is 3 o'clock.", k);
      const u = await say(c, 'undo that');
      check('time: "undo that" says what it took back in the world\'s words', u === 'OK, I forgot what time it is.', u);
      check('time: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async animals(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      const a = await say(c, 'A zebra can swim.');
      const q = await say(c, 'Can a zebra swim?');
      check('animals: a taught fact is answered from the library', /remember/.test(a) && q === 'Yes, a zebra can swim.', `${a.slice(0, 50)} | ${q}`);
      const u = await say(c, 'undo that');
      check('animals: "undo that" forgets it in the world\'s words', u === 'OK, I forgot what you taught me about zebras.', u);
      const m = await say(c, 'Can a zebra swim?');
      check('animals: after the undo the question is open again', /^I don't know whether a zebra can swim\./.test(m), m.slice(0, 80));
      const l = await say(c, 'How many legs does a spider have?');
      check('animals: a knowledge base fact comes from the library', l === 'A spider has 8 legs.', l);
      check('animals: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async profile(o) {
    const c = await openChat({ ...o, settings: MATRIX });
    try {
      await say(c, 'I am 12 years old.');
      const r = await say(c, "I've been teaching for 20 years.");
      check('profile: two facts that cannot both be right are refused with the reason, and the user is asked which is right', r === 'That does not add up. You said you are 12 years old, but also that you have been working for 20 years. Which one is right?', r.slice(0, 160));
      const k = await say(c, 'What do you know about me?');
      check('profile: the first fact is kept and the second is not', /age: 12/.test(k) && !/teacher|years of experience/.test(k), k.slice(0, 120));
      await say(c, 'I am 30 years old.');
      const t = await say(c, "I've been teaching for 20 years.");
      check('profile: after the user says which one is right the statement is taken', /teacher/i.test(t), t.slice(0, 80));
      const u = await say(c, 'undo that');
      check('profile: "undo that" says what was forgotten', /^OK, I forgot your current role \(teacher\)/.test(u), u.slice(0, 120));
      check('profile: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async romanian(o) {
    // RO-MATRIX: a Romanian session on the matrix answers in Romanian, also what the dialogue layer writes itself, and quotes the user's own words
    const c = await openChat({ ...o, settings: { ...MATRIX, language: 'ro' } });
    try {
      await say(c, 'am 20 de lei'); await say(c, 'cumpăr o minge');
      const u = await say(c, 'anulează');
      check('romanian: undo says what it took back in Romanian, with the user\'s own words', /^Am anulat: .cumpăr o minge.\.$/.test(u), u);
      const n = await say(c, 'da');
      check('romanian: a bare "da" is answered in Romanian', /^Da, la ce\?/.test(n), n.slice(0, 60));
      const t = await say(c, 'e ora 25');
      check('romanian: a refusal comes with its reason in Romanian', /^Nu se potrivește\. .*25/.test(t), t);
      const s = await say(c, 'deschide magazinul');
      check('romanian: "deschide magazinul" is understood', /cumpărături/.test(s), s.slice(0, 80));
      const a = await say(c, 'am 8 ani'); const b = await say(c, 'câți ani am?');
      check('romanian: the profile age is noted and read back in Romanian', /^8 ani, notat/.test(a) && /^Ai 8 ani\./.test(b), `${a} | ${b}`);
      const w = await say(c, 'de ce?');
      check('romanian: "de ce?" quotes the user\'s own words', /"câți ani am"/.test(w) && !/[A-Z][a-z]+ [a-z]+ [a-z]+ [a-z]+ (the|you|your)\b/.test(w), w.slice(0, 120));
      check('romanian: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
};

// the document worlds' scenarios (scripts/test-webchat-docs.mjs)
Object.assign(SCENARIOS, docScenarios({ openChat, MATRIX, check, say }));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const only = (arg('only', Object.keys(SCENARIOS).join(','))).split(',');
  const o = { throttle: Number(arg('throttle', 4)), chrome: arg('chrome') };
  for (const name of only) await SCENARIOS[name](o);
  const bad = results.filter((r) => !r.ok);
  console.log(`${results.length - bad.length}/${results.length} passed`);
  process.exitCode = bad.length ? 1 : 0;
}
