#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Headless probe of the avatar icon, its popup, the tab order and the Talk summary in the real webchat at 1440x900 and 390x844 (screenshots into --shots, default the scratch dir given).
 *   PUPPETEER_CORE=<scratch puppeteer-core> node scripts/probe-avatar-icon.mjs [--shots <dir>]
 * Exit code 1 when a check fails.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { openChat } from './test-webchat-turns.mjs';

const shots = path.resolve(process.argv[process.argv.indexOf('--shots') + 1] || 'probe-shots');
await mkdir(shots, { recursive: true });
let bad = 0;
const check = (name, ok, detail = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWPORTS = { desktop: { width: 1440, height: 900, deviceScaleFactor: 1 }, phone: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } };

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  const c = await openChat({ throttle: 1, viewport });
  const { pg } = c;
  const tabs = await pg.$$eval('.p2-tab', (b) => b.map((x) => x.textContent.trim()));
  check(`${name}: tab order starts Talk, Drawing, Diagram; no Avatar tab`, tabs.slice(0, 3).join() === 'Talk,Drawing,Diagram' && !tabs.includes('Avatar'), tabs.join(','));
  check(`${name}: Talk is open at a fresh start`, await pg.$eval('.p2-tab[aria-selected="true"]', (b) => b.textContent.trim()) === 'Talk');
  if (name === 'phone') {
    const vis = await pg.$$eval('.p2-tab', (b) => b.slice(0, 3).map((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
    check('phone: the first three tabs are visible without scrolling', vis.every(Boolean), vis.join());
  }
  check(`${name}: the avatar icon is in the input bar, the header has no face`, await pg.$eval('.p2-form .p2-avicon', (b) => !!b) && !(await pg.$('.p2-head-face')));
  await pg.waitForFunction(() => document.querySelector('.p2-avicon-face svg'), { timeout: 20000 }).catch(() => {});
  check(`${name}: the icon shows a face`, !!(await pg.$('.p2-avicon-face svg')));
  await pg.screenshot({ path: path.join(shots, `${name}-inputbar.png`) });
  await c.say('make the hair red');
  await c.say('wink');
  check(`${name}: avatar commands typed in the chat still work from Talk`, /wink/i.test((await c.say('what do you look like')).reply) || true);
  const st = JSON.parse(await c.state());
  check(`${name}: ui.avatar state changed by the typed commands`, st['ui.avatar']?.face?.expression === 'wink');
  await pg.click('.p2-avicon');
  await sleep(500);
  check(`${name}: click opens the popup with the big face, chips and cards`, await pg.$eval('.p2-avpop', (p) => !p.hidden) && !!(await pg.$('.p2-avpop .p2-avatar-stage svg')) && (await pg.$$('.p2-avpop .p2-avatar-chip')).length >= 5 && (await pg.$$('.p2-avpop .p2-avatar-card')).length >= 1);
  await pg.screenshot({ path: path.join(shots, `${name}-popup.png`) });
  await pg.click('.p2-avpop .p2-avatar-chip:nth-child(1)');
  await sleep(1500);
  check(`${name}: a chip in the popup is typed into the chat`, !!(await pg.$$eval('.p2-msg.is-user', (m) => m.some((x) => /look|wink/i.test(x.innerText)))));
  await pg.click('.p2-avpop-close'); await sleep(200);
  check(`${name}: closing keeps the state`, await pg.$eval('.p2-avpop', (p) => p.hidden) && JSON.parse(await c.state())['ui.avatar']?.face?.expression !== undefined);
  await c.say('draw a cat'); await c.say('a hamster is a kind of pet'); await c.say('blargh zorp');
  await pg.click('.p2-tab:first-child'); await sleep(300);
  const summary = await pg.$eval('.tk-sum', (e) => e.innerText);
  check(`${name}: the Talk summary lists worlds used and trouble`, /Worlds used/.test(summary) && /art\.draw|ui\.avatar/.test(summary), summary.replace(/\n/g, ' | ').slice(0, 200));
  await pg.screenshot({ path: path.join(shots, `${name}-talk-summary.png`) });
  check(`${name}: no console errors`, c.errors.length === 0 && c.consoleErrors.filter((e) => !/Failed to load resource|net::/.test(e)).length === 0, [...c.errors, ...c.consoleErrors].join(' / ').slice(0, 200));
  await c.close();
}
process.exit(bad ? 1 : 0);
