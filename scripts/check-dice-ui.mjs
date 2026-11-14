#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// RANDOM as a world, one small browser check (specs/25): the welcome examples, the dice in the input bar, the small dice of a tab, the suggestion strip.
//   PUPPETEER_CORE=<scratch install> node scripts/check-dice-ui.mjs [--throttle 1] [--chrome /usr/bin/chromium]
import { openChat } from './test-webchat-turns.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`); if (!ok) failed++; };

const c = await openChat({ throttle: Number(arg('throttle', 1)), chrome: arg('chrome', undefined) });
const { pg } = c;
const idle = (n) => pg.waitForFunction((k) => !window.psys2?.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-user').length >= k, { timeout: 30000, polling: 50 }, n).then(() => true).catch(() => false);
const users = () => pg.$$eval('.p2-msg.is-user', (e) => e.length);
try {
  await pg.waitForSelector('.p2-die', { timeout: 15000 });
  await sleep(1500);
  // 1. the dice from Talk: a command is sent as an example and answered
  const n0 = await users();
  await pg.click('.p2-die');
  check('the dice on Talk sends one command', await idle(n0 + 1));
  const p1 = await c.lastPhrase();
  check('it is logged as an example, not as human phrasing', p1?.source === 'chip' && p1?.example === true, JSON.stringify(p1 && { s: p1.source, e: p1.example, t: p1.text }));
  check('it was understood', !p1?.unparsed && p1?.segments?.length > 0 && p1.segments.every((s) => s.status === 'supported'), JSON.stringify(p1?.segments?.map((s) => s.status)));
  // 2. the drawing tab has its own small dice and a strip with the acts that fit the thing
  await pg.click('#p2-tab-draw');
  await sleep(1500);
  const small = await pg.$('#p2-panel-draw .p2-tabdice');
  check('the drawing tab has a small dice', !!small);
  const n1 = await users();
  await small?.click();
  check('the small dice sends a command', await idle(n1 + 1));
  await pg.evaluate(() => window.psys2.send('Add a house.'));
  await idle(n1 + 2);
  await sleep(1500);
  const strip = await pg.$$eval('.p2-exbar .p2-example', (e) => e.map((b) => b.textContent));
  check('the strip offers acts for the thing on the board', strip.length >= 1, JSON.stringify(strip));
  if (strip.length) {
    const n2 = await users();
    await pg.click('.p2-exbar .p2-example');
    check('a button of the strip sends its command', await idle(n2 + 1));
  }
  check('0 console errors', c.errors.length === 0 && c.consoleErrors.length === 0, [...c.errors, ...c.consoleErrors].slice(0, 3).join(' | '));
} finally { await c.close(); }
process.exit(failed ? 1 : 0);
