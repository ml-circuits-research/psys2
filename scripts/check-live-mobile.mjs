#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Mobile-layout screenshots and checks on the DEPLOYED page: waits until the live build equals the expected version, then
 * phone 390x844 (chat, menu open and what it lists, drawing page after a command with toast and reply chip, summary panel, avatar popup, a composition from the Documents page, dice)
 * and desktop 1280x800 (chat with a page beside it). Records page errors / console errors / failed requests.
 * `--owner` adds the owner's two phone turns (training/eval/owner-exports/phrase-log-2026-11-14T2243.json): a fresh phone session with Romanian selected,
 * "deseneaza ceva random" on the Drawing page (reply under 2 s) and "deseneaza o diagrama in forma de casa" on the Diagram page (nodes on a house outline);
 * both answer in the informal singular and the first person, offer no weapon chip and leave seating / timeline untouched; the house nodes do not overlap on the canvas.
 * With `--owner` / `--owner-only` it also runs three person turns in English in a FRESH session (its own browser context): "I have two kids",
 * "I like cats, dogs and horses", "what do you know about me" (the reply names the kids and the likes), then Settings › Privacy shows the facts and
 * "Forget what you know about me" clears them. `--owner-only` runs just those.
 *   PUPPETEER_CORE=... node scripts/check-live-mobile.mjs --expect <version> [--wait 600] [--out docs/landing/2026-11-15-mobile] [--owner | --owner-only]
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
async function open(viewport, tag, settings = null, ctx = browser) {
  const pg = await ctx.newPage();
  await pg.setViewport(viewport);
  if (settings) await pg.evaluateOnNewDocument((s) => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify(s)); } catch { /* ignore */ } }, settings);
  pg.on('pageerror', (e) => log.pageErrors.push(`${tag}: ${String(e).slice(0, 200)}`));
  pg.on('console', (m) => { if (m.type() === 'error') log.consoleErrors.push(`${tag}: ${m.text().slice(0, 200)}`); });
  pg.on('requestfailed', (r) => log.failed.push(`${tag}: ${r.url().slice(0, 140)} ${r.failure()?.errorText}`));
  pg.on('response', (r) => { if (r.status() >= 400) log.bad.push(`${tag}: ${r.status()} ${r.url().slice(0, 220)}`); });
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

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const toPage = async (pg, name) => {   // through the Pages menu, as the owner did
  await pg.tap('.p2-burger'); await sleep(300);
  await pg.evaluate((name) => [...document.querySelectorAll('.p2-menu-item')].find((b) => b.textContent.trim() === name)?.click(), name);
  await sleep(800);
};
// the owner's turn: wall time from Enter to the reply, the phrase-log record (perf, what happened), the chips offered
async function ownerTurn(pg, text) {
  const n = await pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
  await pg.type('input.p2-text', text, { delay: 0 });
  const t0 = Date.now();
  await pg.keyboard.press('Enter');
  await pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n, { timeout: 60000, polling: 20 }, n).catch(() => {});
  const wallMs = Date.now() - t0;
  await idle(pg); await sleep(600);
  return pg.evaluate((text, wallMs) => {
    const bot = [...document.querySelectorAll('.p2-msg.is-bot')].at(-1);
    const rec = JSON.parse(localStorage.getItem('psys2.webchat.phrases') ?? '[]').filter((r) => r.text === text).at(-1) ?? null;
    return { wallMs, reply: bot?.querySelector('.p2-bubble')?.innerText ?? '', chips: [...(bot?.querySelectorAll('.p2-example, .p2-pagechip') ?? [])].map((b) => b.textContent.trim()),
      bar: [...document.querySelectorAll('.p2-examples:not([hidden]) .p2-example, .p2-exbar:not([hidden]) .p2-example')].map((b) => b.textContent.trim()), replyVia: rec?.replyVia ?? rec?.detail?.replyVia ?? rec?.translation?.replyVia ?? null,
      english: rec?.english ?? null, perfMs: rec?.detail?.perf?.totalMs ?? null, knowledgeMs: rec?.detail?.perf?.stages?.knowledge?.ms ?? null, pattern: rec?.routing?.pieces?.map((p) => p.pattern) ?? [],
      changes: rec?.happened?.changes ?? [], viewEffects: rec?.happened?.viewEffects ?? [] };
  }, text, wallMs);
}
const PLURAL = /\b(pute[țţ]i|face[țţ]i|vre[țţ]i|dori[țţ]i|alege[țţ]i|spune[țţ]i|încerca[țţ]i|schimba[țţ]i|adăuga[țţ]i|ave[țţ]i|dumneavoastră|vă)\b/i;
function registerChecks(tag, r) {
  check(`${tag}: informal singular register (no plural / polite forms)`, !PLURAL.test(r.reply), (r.reply.match(PLURAL) ?? [''])[0]);
  check(`${tag}: first person`, /\b(am|eu|îmi|mi-am|mi)\b/i.test(r.reply), r.reply.slice(0, 60));
  check(`${tag}: no weapon chip`, !r.chips.some((c) => /weapon|arm[ăa]\b/i.test(c)), JSON.stringify(r.chips));
  const touched = [...r.changes.map((c) => c.world), ...r.viewEffects.map((v) => v.world ?? v.tab ?? '')].filter((w) => /seating|timeline/.test(w));
  check(`${tag}: seating / timeline untouched`, touched.length === 0, touched.join(', '));
}
async function ownerTurns() {
  const pg = await open(PHONE, 'owner', { settingsVersion: 3, language: 'ro' });
  await idle(pg); await sleep(4000);   // the owner typed about 10 s after the page loaded
  await toPage(pg, 'Drawing');
  const a = await ownerTurn(pg, 'deseneaza ceva random');
  console.log('OWNER1 ' + JSON.stringify(a));
  check('owner 1 "deseneaza ceva random": reply under 2 s', a.wallMs < 2000, `${a.wallMs} ms wall, ${a.perfMs} ms engine, knowledge ${a.knowledgeMs} ms`);
  check('owner 1: drew a scene', /desenat/i.test(a.reply) && a.changes.some((c) => c.world === 'art.draw'), a.reply.slice(0, 60));
  registerChecks('owner 1', a);
  const objs = await pg.evaluate(() => { try { return (window.psys2.session.state()['art.draw']?.objects ?? []).map((o) => o.kind); } catch { return null; } });
  const down = await pg.evaluate(() => /picture catalog could not be reached|Catalogul de imagini nu a putut fi atins/i.test(document.body.innerText));
  check('owner 1: the picture catalog is reachable (no "could not be reached" notice)', !down);
  console.log(`INFO  owner 1 objects in the state: ${JSON.stringify(objs)}`);
  await shot(pg, 'owner-1-random-drawing.png');
  await toPage(pg, 'Diagram');
  const b = await ownerTurn(pg, 'deseneaza o diagrama in forma de casa');
  console.log('OWNER2 ' + JSON.stringify(b));
  const st = await pg.evaluate(() => { try { return window.psys2.session.state()['diagram.sketch'] ?? null; } catch { return null; } });
  const nodes = st?.shapes?.length ?? null, edges = st?.edges?.length ?? null;
  console.log(`INFO  diagram state: ${nodes} nodes, ${edges} lines`);
  check('owner 2 "deseneaza o diagrama in forma de casa": nodes on a house outline', (nodes == null ? true : nodes >= 5 && edges >= nodes) && /contur|schi[țţ]|cas[ăae]\b/i.test(b.reply) && b.changes.some((c) => c.world === 'diagram.sketch'), `${nodes} nodes, ${edges} lines; ${b.reply.slice(0, 80)}`);
  check('owner 2: the Romanian reply says "noduri" and reads "joined in order" as such', /\bnoduri\b/.test(b.reply) && !/s-a alăturat/.test(b.reply), b.reply);
  // reviewer 2026-11-15 03:15 items 1-3: the silhouette (symmetric gable, unnamed nodes), the reply composed from the language world's template, the example bar of the Diagram page
  check('owner 2: the reply is composed from the template (not machine-translated)', /^Am desenat o diagramă în formă de casă: \d+ noduri pe contur, unite în ordine\.$/.test(b.reply.trim()), b.reply);
  const xs = (st?.shapes ?? []).map((x) => x.x), mid = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  check('owner 2: a symmetric gable and no part names on the nodes', st == null || ((st.shapes ?? []).every((x) => !x.label) && xs.filter((x) => x < mid - 1).length === xs.filter((x) => x > mid + 1).length), JSON.stringify((st?.shapes ?? []).map((x) => [x.name, x.label, x.x, x.y])));
  // the nodes as drawn on the canvas: no two node bodies overlap (1 px tolerance)
  const boxes = await pg.$$eval('.dg-svg .body', (e) => e.map((x) => { const r = x.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)); }));
  const over = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, b] = [boxes[i], boxes[j]]; if (a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1) over.push(`${i}/${j}`); }
  console.log(`INFO  owner 2 node boxes on the canvas: ${JSON.stringify(boxes)}`);
  check('owner 2: the house nodes do not overlap on the canvas', boxes.length >= 5 && over.length === 0, `${boxes.length} nodes; overlapping pairs ${over.join(', ') || 'none'}`);
  const bar = await pg.$$eval('.p2-example', (e) => e.filter((b) => b.offsetParent && !b.closest('.p2-msg')).map((b) => b.textContent.trim()));
  console.log(`INFO  owner 2 example bar: ${JSON.stringify(bar)}`);
  check('owner 2: the example bar has no English chips of other pages', !bar.some((c) => /^(Remove|Play|Add|Change|Make|Show|Draw|Move|Connect)\b/.test(c) || /bird|seventh|chord|sun\b/i.test(c)), JSON.stringify(bar));
  console.log(`INFO  owner 2 reply time: ${b.wallMs} ms wall, ${b.perfMs} ms engine`);
  // a world that had no state before the turn (loaded lazily) is not a change the turn made
  for (const [tag, r] of [['owner 1', a], ['owner 2', b]]) {
    const fresh = r.changes.filter((c) => c.changes.every((x) => /\(was none\)$/.test(x))).map((c) => c.world);
    check(`${tag}: the log names only worlds the turn changed (no "(was none)" first states)`, fresh.length === 0, fresh.join(', '));
  }
  registerChecks('owner 2', b);
  await shot(pg, 'owner-2-house-diagram.png');
  await pg.close();
}

// reviewer 2026-11-15 08:15 item 3: three person turns in English in a fresh session, the reply of the third names the kids and the likes,
// Settings › Privacy shows the facts and its "Forget what you know about me" button clears them
async function personTurns() {
  const ctx = await (browser.createBrowserContext ?? browser.createIncognitoBrowserContext).call(browser);
  const pg = await open(PHONE, 'person', { settingsVersion: 3, language: 'en' }, ctx);
  await idle(pg);
  const turns = [];
  for (const text of ['I have two kids', 'I like cats, dogs and horses', 'what do you know about me']) {
    const r = await ownerTurn(pg, text);
    turns.push(r);
    console.log('PERSON ' + JSON.stringify({ text, wallMs: r.wallMs, perfMs: r.perfMs, reply: r.reply, pattern: r.pattern }));
  }
  const [k, l, w] = turns;
  check('person 1 "I have two kids": acknowledged without an error reply', !!k.reply && !/did not understand|could not|cannot|error/i.test(k.reply), k.reply.slice(0, 100));
  check('person 2 "I like cats, dogs and horses": acknowledged without an error reply', !!l.reply && !/did not understand|could not|cannot|error/i.test(l.reply), l.reply.slice(0, 100));
  check('person 3 "what do you know about me": names the kids', /\b(two|2)\b.*\b(kids?|children|child)\b|\b(kids?|children)\b.*\b(two|2)\b/i.test(w.reply), w.reply);
  check('person 3: names the likes (cats, dogs, horses)', ['cat', 'dog', 'horse'].every((x) => new RegExp(`\\b${x}s?\\b`, 'i').test(w.reply)), w.reply);
  await shot(pg, 'person-1-chat.png');
  await pg.tap('.p2-burger'); await sleep(300);
  await pg.evaluate(() => document.querySelector('.p2-menu-item[data-page=settings]')?.click());
  await pg.waitForSelector('#p2-st-privacy', { visible: true, timeout: 10000 }).catch(() => {});
  await pg.tap('#p2-st-privacy').catch(() => pg.evaluate(() => document.querySelector('#p2-st-privacy')?.click()));
  await sleep(600);
  const view = () => pg.evaluate(() => {
    const sec = document.querySelector('[data-section=person]');
    const rows = [...(sec?.querySelectorAll('dt') ?? [])].map((dt) => [dt.textContent.trim(), dt.nextElementSibling?.textContent.trim() ?? '']);
    const btn = [...(sec?.querySelectorAll('button') ?? [])].find((b) => /Forget what you know about me/.test(b.textContent));
    return { shown: !!sec && !!sec.offsetParent, rows, button: !!btn, disabled: !!btn?.disabled, text: sec?.innerText ?? '' };
  });
  const before = await view();
  console.log('PRIVACY ' + JSON.stringify(before));
  const fam = before.rows.find(([kk]) => kk === 'Family')?.[1] ?? '', likes = before.rows.find(([kk]) => kk === 'Likes')?.[1] ?? '';
  check('Settings › Privacy shows the family fact (two kids)', before.shown && /2/.test(fam) && /kid|child/i.test(fam), fam);
  check('Settings › Privacy shows the likes (cats, dogs, horses)', ['cat', 'dog', 'horse'].every((x) => likes.toLowerCase().includes(x)), likes);
  check('Settings › Privacy has an enabled "Forget what you know about me" button', before.button && !before.disabled);
  await pg.evaluate(() => document.querySelector('.p2-modal-body, #p2-set-panel')?.scrollTo?.(0, 0));
  await pg.evaluate(() => document.querySelector('[data-section=person]')?.scrollIntoView({ block: 'start' }));
  await sleep(200);
  await shot(pg, 'person-2-privacy.png');
  await pg.evaluate(() => [...document.querySelectorAll('[data-section=person] button')].find((b) => /Forget what you know about me/.test(b.textContent))?.click());
  await sleep(800);
  const after = await view();
  console.log('PRIVACY-AFTER ' + JSON.stringify(after));
  check('"Forget what you know about me" clears the facts', after.rows.length === 0 && /Nothing yet/.test(after.text) && after.disabled, JSON.stringify(after.rows));
  await pg.evaluate(() => document.querySelector('[data-section=person]')?.scrollIntoView({ block: 'start' }));
  await shot(pg, 'person-3-forgotten.png');
  // and the conversation forgot too
  await pg.tap('.p2-modal-close').catch(() => pg.evaluate(() => document.querySelector('.p2-modal-close')?.click()));
  await sleep(400);
  const again = await ownerTurn(pg, 'what do you know about me');
  console.log('PERSON ' + JSON.stringify({ text: 'what do you know about me (after forget)', wallMs: again.wallMs, reply: again.reply }));
  check('after forgetting, "what do you know about me" no longer names the kids or the likes', !/\b(kids?|children|cats?|dogs?|horses?)\b/i.test(again.reply), again.reply);
  check('after forgetting, "what do you know about me" is still answered by the person profile ("nothing yet"), not by another world', /\b(nothing|do not know|don't know)\b/i.test(again.reply) && /\byou\b/i.test(again.reply), `${again.wallMs} ms: ${again.reply}`);
  await shot(pg, 'person-4-after-forget.png');
  await pg.close(); await ctx.close();
}

try {
  if (args.includes('--owner') || args.includes('--owner-only')) await ownerTurns();
  if (args.includes('--owner') || args.includes('--owner-only')) await personTurns();
  if (!args.includes('--owner-only')) {
  const pg = await open(PHONE, 'phone');
  await shot(pg, 'phone-1-chat.png');
  await pg.tap('.p2-burger'); await sleep(400);
  const items = await pg.$$eval('#p2-menu [role=menuitem]', (e) => e.map((x) => x.textContent.trim()));
  console.log('MENU ' + JSON.stringify(items));
  const want = ['Chat', 'Drawing', 'Diagram', 'Map', 'Charts', 'Documents', 'Music', 'Settings'];
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
  }

  check('no page errors', log.pageErrors.length === 0, log.pageErrors.slice(0, 3).join(' | '));
} finally { await browser.close(); }
const uniq = (a) => { const m = new Map(); for (const x of a) m.set(x, (m.get(x) ?? 0) + 1); return [...m].map(([k, c]) => `${c}x ${k}`); };
console.log('LOG ' + JSON.stringify({ pageErrors: uniq(log.pageErrors), consoleErrors: uniq(log.consoleErrors), failed: uniq(log.failed), http4xx5xx: uniq(log.bad) }, null, 1));
process.exit(bad ? 1 : 0);
