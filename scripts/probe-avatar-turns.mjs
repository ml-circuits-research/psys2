#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The reviewer's 14 turns on the Avatar tab, in Chrome, with the face catalog reachable (the fixture catalog served locally and given to the page as `knowledgeUrl`, as
 * scripts/test-webchat-avatar.mjs does) or unreachable (`--offline`: the bundled default face only). Prints one line per turn: what was said, what the avatar answered, the
 * world that read it, and the avatar's slots that changed. No assertions: the two columns are read side by side (worker-log).
 *
 *   PUPPETEER_CORE=... node scripts/probe-avatar-turns.mjs [--offline] [--chrome /usr/bin/chromium]
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), offline = args.includes('--offline');
const CATALOG = path.join(ROOT, 'tests/fixtures/catalog');
const srv = http.createServer(async (q, r) => {
  r.setHeader('access-control-allow-origin', '*');
  try { r.end(await readFile(path.join(CATALOG, decodeURIComponent(q.url.split('?')[0])))); } catch { r.statusCode = 404; r.end(); }
}).listen(0);
const knowledgeUrl = offline ? 'http://localhost:1' : `http://localhost:${srv.address().port}`;
const TURNS = ['make the avatar an angry boy', 'add eyeglasses', 'remove eyeglasses', 'eyeglasses', 'put a hat', 'remove the hat', 'put on earrings', 'make green eyes', 'what hats are there?', 'undo', 'redo', 'give him a beard', 'without the beard'];

const c = await openChat({ throttle: 1, viewport: { width: 1000, height: 900, deviceScaleFactor: 1 }, settings: { formalizer: 'rules', normalizer: false, showTrace: false, knowledgeUrl } });
const { pg } = c;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await pg.click('#p2-tab-robot');
  await pg.waitForSelector('.p2-avatar-stage svg', { timeout: 20000 });
  await sleep(offline ? 2500 : 4000);   // the catalog (or its failure) settles
  const face = () => pg.evaluate(() => { const f = window.psys2.session.state()['ui.avatar']?.face; return f ? { slots: f.slots, expression: f.expression ?? null, colours: f.colours ?? null } : null; });
  let prev = await face();
  console.log(`mode: ${offline ? 'catalog unreachable (bundled face)' : 'catalog reachable (fixture catalog)'}; progress: ${JSON.stringify(await pg.evaluate(() => document.querySelector('.p2-progress')?.innerText?.slice(0, 160) ?? null))}`);
  for (const t of TURNS) {
    const r = await c.say(t);
    const now = await face();
    const diff = [];
    for (const k of Object.keys(now?.slots ?? {})) if (now.slots[k] !== prev?.slots?.[k]) diff.push(`${k}: ${prev?.slots?.[k] ?? '-'} -> ${now.slots[k]}`);
    if (now?.expression !== prev?.expression) diff.push(`expression: ${prev?.expression} -> ${now?.expression}`);
    if (JSON.stringify(now?.colours) !== JSON.stringify(prev?.colours)) diff.push(`colours: ${JSON.stringify(now?.colours)}`);
    console.log(`${t} | ${r.reply.replace(/\s+/g, ' ').slice(0, 140)} | ${diff.join('; ') || 'no change'}`);
    prev = now;
  }
  console.log(`page errors: ${c.errors.length}${c.errors.length ? ` (${c.errors.join(' | ')})` : ''}`);
} catch (e) { console.log('the probe failed:', String(e).slice(0, 300)); }
await c.close();
srv.close();
