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
 *
 *   node scripts/test-webchat-matrix.mjs [--only default,ask,revise,undo,why,abduce,setting] [--throttle 4] [--chrome /usr/bin/chromium]
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
      check('default: "three of them" is not a matrix command', !/that makes 3/.test(await say(c, 'three of them')));
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
