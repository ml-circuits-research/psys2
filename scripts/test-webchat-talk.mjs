#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Talk tab in the real webchat (spec 18): headless Chrome at 1440x900 and 390x844, rules formalizer, no network use (the basic things and the built-in tables answer).
 *   node scripts/test-webchat-talk.mjs [--shots <dir>] [--chrome <path>]
 * Checks: the tab opens by voice, an answer carries a card inside the chat (drawing, parts, icons, bars, line), "what is a blorp" has no card, the topic board has a node
 * per thing and a tap scrolls the chat to its card, "how do you know" adds a how card, a message outside the scope is refused with two chips, the phone shows the board
 * behind a button, and the page has no errors. puppeteer-core is not a dependency: set PUPPETEER_CORE (see scripts/perf-webchat.mjs).
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { openChat } from './test-webchat-turns.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const shots = arg('--shots');
if (shots) mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const SETTINGS = { formalizer: 'rules', normalizer: false, showTrace: false, reasoner: 'matrix' };

async function run(label, viewport) {
  const c = await openChat({ chrome: arg('--chrome'), throttle: 1, settings: SETTINGS, viewport });
  const pg = c.pg;
  const shot = async (name) => { if (shots) await pg.screenshot({ path: path.join(shots, `talk-${label}-${name}.png`) }); };
  try {
    await c.say('open the talk tab');
    check(`${label}: the Talk tab opens by voice`, (await pg.evaluate(() => window.psys2.session.state()['ui.shell']?.activeTab)) === 'talk');
    check(`${label}: opening line and chips`, await pg.evaluate(() => !!document.querySelector('.tk-open') && document.querySelectorAll('.tk-chip').length >= 5));
    await shot('0-open');
    const cardCount = () => pg.evaluate(() => document.querySelectorAll('.p2-bubble .tk-inchat').length);
    for (const [q, sel, what] of [
      ['What does a bicycle look like?', '.tk-drawing ellipse', 'a drawing'],
      ['What are the parts of a bicycle?', '.tk-partsdiagram .tk-partbox', 'a parts diagram'],
      ['How many wheels does a bicycle have?', '.tk-icons circle', 'counted icons'],
      ['Which is bigger, Jupiter or Mars?', '.tk-bars rect', 'bars'],
      ['What are the planets in order?', '.tk-line .tk-pt', 'a line'],
    ]) {
      const before = await cardCount();
      const r = await c.say(q);
      const ok = r.ok && (await cardCount()) === before + 1 && await pg.evaluate((s) => !!document.querySelector(`.p2-bubble .tk-inchat ${s}`), sel);
      check(`${label}: "${q}" -> ${what} inside the answer`, ok, r.reply.slice(0, 70));
    }
    await shot('1-cards');
    const n = await cardCount();
    const r = await c.say('What is a blorp?');
    check(`${label}: no fact, no card`, r.reply.includes("I don't know that yet.") && (await cardCount()) === n);
    // the topic board
    const nodes = await pg.evaluate(() => [...document.querySelectorAll('.tk-node')].map((g) => g.getAttribute('data-topic')));
    check(`${label}: the board has a node per thing and the root`, nodes.length === 5, nodes.join());
    if (label === 'phone') {
      const hidden = await pg.evaluate(() => getComputedStyle(document.querySelector('.tk-boardsec')).display === 'none');
      check('phone: the board is behind a button', hidden && await pg.evaluate(() => !!document.querySelector('.tk-toggle') && getComputedStyle(document.querySelector('.tk-toggle')).display !== 'none'));
      await pg.evaluate(() => document.querySelector('.tk-toggle').click());
    }
    await c.say('What did we talk about?');
    await shot('2-board');
    const tapped = await pg.evaluate(async () => {
      const log = document.querySelector('.p2-log');
      log.scrollTop = 0;
      const g = document.querySelector('.tk-node[data-topic="t1"]');
      g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 900));
      const card = document.querySelector('.tk-inchat');
      const a = card.getBoundingClientRect(), b = log.getBoundingClientRect();
      return card.classList.contains('is-flash') && a.top >= b.top - 2 && a.bottom <= b.bottom + 2;
    });
    check(`${label}: a tap on a node scrolls the chat to its card`, tapped);
    await c.say('How do you know?');
    check(`${label}: how do you know adds a plain-words card`, await pg.evaluate(() => { const h = [...document.querySelectorAll('.tk-how')].at(-1); return !!h && h.textContent.includes('You asked') && !/k\.objects|shards/.test(h.textContent); }));
    const scope = await c.say('tell me a joke about pirates');
    check(`${label}: outside the scope is refused with two suggestions`, scope.reply.startsWith('I cannot talk about that here') && (await pg.evaluate(() => [...document.querySelectorAll('.p2-bot, .p2-msg.is-bot')].at(-1)?.querySelectorAll('.p2-example').length)) === 2);
    await shot('3-end');
    const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${label}: no horizontal page scroll`, overflow <= 1, `${overflow}px`);
    check(`${label}: no page errors`, c.errors.length === 0 && c.consoleErrors.filter((e) => !/Failed to load resource|net::/.test(e)).length === 0, [...c.errors, ...c.consoleErrors][0] ?? '');
  } finally { await c.close(); }
}

await run('desktop', { width: 1440, height: 900, deviceScaleFactor: 1 });
await run('phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
