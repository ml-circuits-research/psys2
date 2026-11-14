#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * First-turn regression (worker-log 2026-11-15 "first-turn runaway"): on a fresh session the first message "put on a hat" loads the avatar's faces from the catalog inside the turn.
 * Live, 81 shards were fetched one after another and the turn ended "Stopped a runaway computation in stage end after 8.0 s". Here the catalog is the local fixture served through request
 * interception with a per-request delay (the real catalog's latency), the phone viewport and 4x CPU throttling: the first turn must be answered, with no runaway notice and no
 * "took too long", and the shards of the world must have been requested together (not one after another).
 *
 *   PUPPETEER_CORE=... node scripts/test-webchat-first-turn.mjs [--delay 2500] [--throttle 4] [--chrome /usr/bin/chromium]
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const DELAY = Number(opt('delay', 2500));
const CAT = 'https://ml-circuits-research.github.io/sop-knowledge-worlds/worlds/';
let bad = 0;
const check = (n, ok, d = '') => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); };

const seen = [];
const c = await openChat({
  throttle: Number(opt('throttle', 4)), chrome: opt('chrome'), settings: { __raw: {} },
  beforeGoto: async (pg) => {
    await pg.setRequestInterception(true);
    pg.on('request', async (r) => {
      const u = r.url();
      if (!u.startsWith(CAT)) return r.continue();
      seen.push({ at: Date.now(), path: u.slice(CAT.length) });
      await new Promise((ok) => setTimeout(ok, DELAY));
      try {
        const body = await readFile(path.join(ROOT, 'tests/fixtures/catalog', u.slice(CAT.length).split('?')[0]));
        await r.respond({ status: 200, contentType: u.endsWith('.json') ? 'application/json' : 'text/plain', headers: { 'access-control-allow-origin': '*' }, body });
      } catch { await r.respond({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'nf' }); }
    });
  },
});
try {
  const r = await c.say('put on a hat', { timeout: 40000 });
  const notice = await c.pg.$eval('.p2-msg[data-runaway]', (e) => e.innerText).catch(() => '');
  check('the first turn is answered', r.ok && r.reply.length > 0, `${r.ms} ms, ${JSON.stringify(r.reply.slice(0, 60))}`);
  check('no runaway notice', !notice, notice.slice(0, 80));
  check('not "took too long"', !/took too long/.test(r.reply), r.reply.slice(0, 60));
  const shards = seen.filter((x) => /\/shards\//.test(x.path) && /^k\.faces/.test(x.path));
  const span = shards.length ? Math.max(...shards.map((x) => x.at)) - Math.min(...shards.map((x) => x.at)) : null;
  check('the faces shards were requested together', shards.length > 3 && span < DELAY, `${shards.length} shards requested within ${span} ms (delay ${DELAY} ms each)`);
} finally { await c.close(); }
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
