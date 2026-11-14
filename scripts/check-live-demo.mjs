#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Live demo check against the deployed page (headless Chrome, no local server): build hash vs origin/main, boot time, the five composition types of the Documents form,
 * the dice with the catalog route on the Drawing tab, the avatar popup on a phone viewport, and every page error / console error / failed request.
 *   PUPPETEER_CORE=... node scripts/check-live-demo.mjs [--url https://.../webchat/] [--chrome /usr/bin/google-chrome] [--out docs/landing/2026-11-15-demo] [--presses 10]
 */
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const URL_ = opt('url', 'https://ml-circuits-research.github.io/psys2/webchat/');
const out = path.resolve(ROOT, opt('out', 'docs/landing/2026-11-15-demo'));
const presses = Number(opt('presses', 10));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); };
await mkdir(out, { recursive: true });

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
  const t0 = Date.now();
  await pg.goto(URL_, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000, polling: 50 });
  const boot = Date.now() - t0;
  return { pg, boot };
}
async function say(pg, text, timeout = 60000) {
  const n = await pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
  await pg.type('input.p2-text', text, { delay: 0 });
  await pg.keyboard.press('Enter');
  await pg.waitForFunction((n) => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n, { timeout, polling: 50 }, n).catch(() => {});
  return pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.querySelector('.p2-bubble')?.innerText ?? '');
}
const shot = (pg, name) => pg.screenshot({ path: path.join(out, name), type: 'png' });

try {
  // 0. build
  const live = await (await fetch(new URL('build-info.json', URL_))).json();
  let main = null;
  try { main = JSON.parse(execSync('git show origin/main:docs/webchat/build-info.json', { cwd: ROOT, encoding: 'utf8' })).version; } catch { /* no origin */ }
  check('deployed build matches origin/main', live.version === main, `live ${live.version}, main ${main}`);

  // 1. desktop: boot, composition, dice
  const d = await open({ width: 1100, height: 900, deviceScaleFactor: 1 }, 'desktop');
  console.log(`INFO  boot to first hint (desktop, cold): ${d.boot} ms`);
  await shot(d.pg, 'boot-desktop.png');
  await d.pg.click('#p2-tab-documents');
  await d.pg.waitForSelector('.dr-title', { timeout: 30000 });
  await d.pg.waitForFunction(() => [...document.querySelectorAll('.dr-btn')].some((b) => /Compose/.test(b.textContent)), { timeout: 30000 }).catch(() => {});
  for (const v of ['essay', 'scientific article', 'presentation', 'story', 'report']) {
    const before = await d.pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
    const opened = await d.pg.evaluate(() => { const f = document.querySelector('.dr-compose'); if (!f) return false; if (f.hidden) [...document.querySelectorAll('.dr-btn')].find((b) => /Compose/.test(b.textContent))?.click(); return !f.hidden; });
    if (!opened) { check(`compose ${v}: form available`, false); continue; }
    await d.pg.select('.dr-compose select[name=type]', v);
    await d.pg.$eval('.dr-compose input[name=topic]', (e) => { e.value = 'penguin'; });
    const t = Date.now();
    await d.pg.click('.dr-compose button[type=submit]');
    await d.pg.waitForFunction((n) => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n, { timeout: 60000, polling: 100 }, before).catch(() => {});
    const r = await d.pg.evaluate(() => ({ docs: document.querySelectorAll('.dr-doc').length, title: document.querySelector('.dr-title')?.innerText ?? '', text: (document.querySelector('.dr-text')?.innerText ?? '').length, reply: [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.innerText.slice(0, 80) ?? '' }));
    check(`compose ${v}: writes a document`, r.reply.startsWith(`I wrote the ${v} `) && r.text > 100, `${Date.now() - t} ms, "${r.title}", ${r.text} chars, ${r.docs} docs, reply "${r.reply}"`);
    await shot(d.pg, `compose-${v.replace(/ /g, '-')}.png`);
  }
  // dice on the Drawing tab
  await d.pg.click('#p2-tab-draw');
  await sleep(1500);
  const rolls = [];
  for (let i = 0; i < presses; i++) {
    await d.pg.evaluate(() => document.querySelector('.p2-tabdice')?.click());
    await sleep(300);
    await d.pg.waitForFunction(() => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing'), { timeout: 60000, polling: 50 }).catch(() => {});
    rolls.push(await d.pg.evaluate(() => ({ user: [...document.querySelectorAll('.p2-msg.is-user')].at(-1)?.innerText.slice(0, 80) ?? '', bot: [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.innerText.slice(0, 100) ?? '' })));
  }
  rolls.forEach((r, i) => console.log(`  die ${i + 1}: "${r.user}" -> "${r.bot}"`));
  const errs = rolls.filter((r) => !r.user || /could not|cannot|can't|error|failed|took too long/i.test(r.bot));
  check(`dice on the Drawing tab: ${presses} presses each send a command, no error reply`, errs.length === 0, `${errs.length} suspect`);
  await shot(d.pg, 'dice-draw.png');
  await d.pg.close();

  // 2. phone: avatar popup
  const p = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'phone');
  console.log(`INFO  boot to first hint (phone viewport, cold): ${p.boot} ms`);
  const pg = p.pg;
  await shot(pg, 'phone-boot.png');
  check('phone: avatar icon in the input bar', !!(await pg.$('.p2-avicon')));
  await pg.tap('.p2-avicon');
  await pg.waitForFunction(() => { const e = document.querySelector('#p2-avpop'); return e && !e.hidden; }, { timeout: 10000 }).catch(() => {});
  const open1 = await pg.evaluate(() => { const e = document.querySelector('#p2-avpop'); const r = e?.getBoundingClientRect(); return { shown: !!e && !e.hidden, face: !!e?.querySelector('svg'), w: r?.width, h: r?.height, inView: !!r && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 }; });
  check('phone: popup opens with a face, inside the viewport', open1.shown && open1.face && open1.inView, JSON.stringify(open1));
  await shot(pg, 'phone-avatar-open.png');
  const reply = await say(pg, 'put on a hat');
  const slots = await pg.evaluate(() => window.psys2.session.state()['ui.avatar']?.face?.slots ?? null);
  check('phone: avatar command works with the popup open', slots?.hat != null || /hat/i.test(reply), `${reply.slice(0, 60)} | hat=${JSON.stringify(slots?.hat)}`);
  await shot(pg, 'phone-avatar-hat.png');
  await pg.tap('.p2-avpop-close');
  await sleep(300);
  check('phone: popup closes', await pg.evaluate(() => document.querySelector('#p2-avpop')?.hidden === true));
  await pg.tap('.p2-avicon'); await sleep(300);
  await pg.tap('.p2-avicon'); await sleep(300);
  check('phone: icon toggles it closed again', await pg.evaluate(() => document.querySelector('#p2-avpop')?.hidden === true));
  const r2 = await say(pg, 'open the avatar');
  check('phone: "open the avatar" shows the popup', await pg.evaluate(() => document.querySelector('#p2-avpop')?.hidden === false), r2.slice(0, 60));
  await shot(pg, 'phone-avatar-command.png');
  await pg.close();

  // 3. errors
  check('no page errors', log.pageErrors.length === 0, log.pageErrors.slice(0, 3).join(' | '));
  check('no console errors', log.consoleErrors.length === 0, log.consoleErrors.slice(0, 3).join(' | '));
  check('no failed requests', log.failed.length === 0 && log.bad.length === 0, [...log.failed, ...log.bad].slice(0, 3).join(' | '));
} finally { await browser.close(); }
const uniq = (a) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([k, n]) => `${n}x ${k}`); };
console.log('LOG ' + JSON.stringify({ pageErrors: uniq(log.pageErrors), consoleErrors: uniq(log.consoleErrors), failed: uniq(log.failed), http4xx5xx: uniq(log.bad) }, null, 1));
process.exit(bad ? 1 : 0);
