#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Mobile-layout screenshots and checks on the DEPLOYED page: waits until the live build equals the expected version, then
 * phone 390x844 (chat, menu open and what it lists, drawing page after a command with toast and reply chip, summary panel, avatar popup, a composition from the Documents page, dice)
 * and desktop 1280x800 (chat with a page beside it). Records page errors / console errors / failed requests.
 *   PUPPETEER_CORE=... node scripts/check-live-mobile.mjs --expect <version> [--wait 600] [--out docs/landing/2026-11-15-mobile]
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const URL_ = opt('url', 'https://ml-circuits-research.github.io/psys2/webchat/');
const out = path.resolve(ROOT, opt('out', 'docs/landing/2026-11-15-mobile'));
const expect = opt('expect');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); };
await mkdir(out, { recursive: true });

let live = null;
for (let t = 0; t <= Number(opt('wait', 600)); t += 20) {
  live = (await (await fetch(new URL(`build-info.json?x=${Date.now()}`, URL_))).json()).version;
  if (!expect || live === expect) break;
  await sleep(20000);
}
check('deployed build equals main', !expect || live === expect, `live ${live}, expected ${expect}`);

const pp = await loadPuppeteer();
const browser = await pp.launch({ executablePath: opt('chrome', '/usr/bin/google-chrome'), headless: true, args: ['--no-sandbox'] });
const log = { pageErrors: [], consoleErrors: [], failed: [], bad: [] };
async function open(viewport, tag) {
  const pg = await browser.newPage();
  await pg.setViewport(viewport);
  pg.on('pageerror', (e) => log.pageErrors.push(`${tag}: ${String(e).slice(0, 200)}`));
  pg.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); });
  pg.on('requestfailed', (r) => log.failed.push(`${tag}: ${r.url().slice(0, 140)} ${r.failure()?.errorText}`));
  pg.on('response', (r) => { if (r.status() >= 400) log.bad.push(`${tag}: ${r.status()} ${r.url().slice(0, 140)}`); });
  await pg.goto(URL_, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000, polling: 50 });
  return pg;
}
async function say(pg, text, timeout = 60000) {
  const n = await pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
  await pg.type('input.p2-text', text, { delay: 0 });
  await pg.keyboard.press('Enter');
  await pg.waitForFunction((n) => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n, { timeout, polling: 50 }, n).catch(() => {});
  return pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.querySelector('.p2-bubble')?.innerText ?? '');
}
const shot = (pg, name) => pg.screenshot({ path: path.join(out, name), type: 'png' });
const idle = (pg) => pg.waitForFunction(() => !window.psys2.busy, { timeout: 60000, polling: 50 }).catch(() => {});

try {
  const pg = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'phone');
  await shot(pg, 'phone-1-chat.png');
  await pg.tap('.p2-burger'); await sleep(400);
  const items = await pg.$$eval('#p2-menu [role=menuitem]', (e) => e.map((x) => x.textContent.trim()));
  console.log('MENU ' + JSON.stringify(items));
  const want = ['Chat', 'Drawing', 'Diagram', 'Map', 'Charts', 'Seating', 'Timeline', 'Documents', 'Music', 'Settings'];
  check('menu lists exactly the ten pages', JSON.stringify([...items].sort()) === JSON.stringify([...want].sort()), items.join(', '));
  await shot(pg, 'phone-2-menu.png');
  await pg.keyboard.press('Escape'); await sleep(200);
  await pg.evaluate(() => document.body.click()); await sleep(200);
  // drawing page after a command
  await pg.evaluate(() => [...document.querySelectorAll('.p2-menu-item')].find((b) => b.textContent.trim() === 'Drawing')?.click()).catch(() => {});
  if (await pg.$eval('#p2-menu', (m) => m.hidden)) { /* menu closed */ } else { await pg.tap('.p2-burger'); await sleep(300); await pg.evaluate(() => [...document.querySelectorAll('.p2-menu-item')].find((b) => b.textContent.trim() === 'Drawing')?.click()); }
  await sleep(1200);
  await pg.type('input.p2-text', 'draw a house and a sun', { delay: 0 });
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => document.querySelector('.p2-toast:not([hidden])')?.textContent?.trim(), { timeout: 30000, polling: 50 }).catch(() => {});
  await sleep(600);
  const toast = await pg.evaluate(() => [...document.querySelectorAll('.p2-toast')].filter((t) => !t.hidden).map((t) => t.textContent.trim().slice(0, 80)));
  const chips = await pg.$$eval('.p2-pagechip', (e) => e.length);
  check('drawing page after a command: toast shown', toast.length > 0, JSON.stringify(toast));
  console.log(`INFO  page chips in the chat: ${chips}`);
  await shot(pg, 'phone-3-drawing-command.png');
  await idle(pg);
  // summary panel
  await pg.evaluate(() => [...document.querySelectorAll('.p2-menu-item')].find((b) => b.textContent.trim() === 'Chat')?.click()).catch(() => {});
  await pg.tap('.p2-burger').catch(() => {}); await sleep(200);
  await pg.evaluate(() => { document.querySelector('.p2-sum')?.removeAttribute('hidden'); const d = document.querySelector('.p2-sum'); if (d) d.open = true; });
  await pg.evaluate(() => [...document.querySelectorAll('.p2-menu-item')].find((b) => b.textContent.trim() === 'Chat')?.click()).catch(() => {});
  await sleep(500);
  const sumShown = await pg.evaluate(() => { const d = document.querySelector('.p2-sum'); return !!d && !d.hidden; });
  console.log(`INFO  summary panel visible: ${sumShown}`);
  await shot(pg, 'phone-4-summary.png');
  // avatar popup
  await pg.tap('.p2-avicon'); await sleep(500);
  const av = await pg.evaluate(() => { const e = document.querySelector('#p2-avpop'); const r = e?.getBoundingClientRect(); return { shown: !!e && !e.hidden, face: !!e?.querySelector('svg'), inView: !!r && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; });
  check('phone: avatar popup opens with a face inside the viewport', av.shown && av.face && av.inView, JSON.stringify(av));
  await shot(pg, 'phone-5-avatar.png');
  const hat = await say(pg, 'put on a hat');
  check('phone: avatar command works', /hat/i.test(hat), hat.slice(0, 50));
  await pg.tap('.p2-avpop-close'); await sleep(300);
  check('phone: popup closes', await pg.evaluate(() => document.querySelector('#p2-avpop')?.hidden === true));
  // composition from the Documents page
  await pg.tap('.p2-burger'); await sleep(300);
  await pg.evaluate(() => [...document.querySelectorAll('.p2-menu-item')].find((b) => b.textContent.trim() === 'Documents')?.click());
  await pg.waitForSelector('.pe-editor', { timeout: 30000 });
  await pg.waitForFunction(() => [...document.querySelectorAll('.pe-gen-btn')].some((b) => /Compose/.test(b.textContent)), { timeout: 30000 }).catch(() => {});
  const n = await pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
  await pg.evaluate(() => { const f = document.querySelector('.pe-compose'); if (f?.hidden) [...document.querySelectorAll('.pe-gen-btn')].find((b) => /Compose/.test(b.textContent))?.click(); });
  await pg.select('.pe-compose select[name=type]', 'story');
  await pg.$eval('.pe-compose input[name=topic]', (e) => { e.value = 'penguin'; });
  await pg.evaluate(() => document.querySelector('.pe-compose button[type=submit]').click());
  await pg.waitForFunction((n) => !window.psys2.busy && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n, { timeout: 60000, polling: 100 }, n).catch(() => {});
  const wrote = await pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.innerText.slice(0, 70) ?? '');
  check('phone: composition from the Documents page writes a document', /^I wrote the story/.test(wrote), wrote);
  await shot(pg, 'phone-6-documents.png');
  // dice on the drawing page
  await pg.tap('.p2-burger'); await sleep(300);
  await pg.evaluate(() => [...document.querySelectorAll('.p2-menu-item')].find((b) => b.textContent.trim() === 'Drawing')?.click());
  await sleep(1000);
  const rolls = [];
  for (let i = 0; i < 5; i++) {
    await pg.evaluate(() => document.querySelector('.p2-die, .p2-tabdice, [aria-label*="andom"]')?.click());
    await sleep(300); await idle(pg);
    rolls.push(await pg.evaluate(() => ({ u: [...document.querySelectorAll('.p2-msg.is-user')].at(-1)?.innerText.split('\n')[0] ?? '', b: [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.innerText.split('\n')[0].slice(0, 80) ?? '' })));
  }
  rolls.forEach((r, i) => console.log(`  die ${i + 1}: "${r.u}" -> "${r.b}"`));
  check('phone: dice send commands without error replies', rolls.every((r) => r.u && !/could not|cannot|error|took too long/i.test(r.b)));
  await pg.close();

  const dk = await open({ width: 1280, height: 800, deviceScaleFactor: 1 }, 'desktop');
  await dk.type('input.p2-text', 'draw a house and a sun', { delay: 0 });
  await dk.keyboard.press('Enter'); await idle(dk); await sleep(800);
  await shot(dk, 'desktop-1-chat.png');
  await dk.close();

  check('no page errors', log.pageErrors.length === 0, log.pageErrors.slice(0, 3).join(' | '));
} finally { await browser.close(); }
const uniq = (a) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([k, c]) => `${c}x ${k}`); };
console.log('LOG ' + JSON.stringify({ pageErrors: uniq(log.pageErrors), consoleErrors: uniq(log.consoleErrors), failed: uniq(log.failed), http4xx5xx: uniq(log.bad) }, null, 1));
process.exit(bad ? 1 : 0);
