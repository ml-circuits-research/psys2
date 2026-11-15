#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * FIRST DRAWING ON THE PHONE (owner export 2026-11-14 22:43, finding 3: "deseneaza ceva random" took 6.8 s, `knowledge` 6,002 ms in 3 calls). Chrome at 390x844, 4x CPU throttle
 * (as scripts/test-webchat-first-turn.mjs), the Drawing tab, a fresh page: the first message "draw something random". Reports the turn time (Enter to the reply), the engine's stages
 * from the phrase log record (detail.perf), the catalog requests made during the turn, and the boot steps of the page (the "step" events of the phrase log: page code, worlds,
 * reasoner, translator ...: the boot cost per page, finding 6). Budget: the first drawing under 2,000 ms.
 *
 *   node scripts/build-webchat.mjs && PUPPETEER_CORE=<scratch>/node_modules/puppeteer-core node scripts/measure-first-draw.mjs [--fixture] [--delay 300] [--text "draw something random"] [--tab draw] [--runs 3] [--json out.json]
 *   --fixture: the catalog is the repository fixture served with a per-request delay (no network); default: the real catalog (Pages copy).
 * Not part of `npm test` (needs Chrome).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const FIXTURE = args.includes('--fixture'), DELAY = Number(opt('delay', 300)), TEXT = opt('text', 'draw something random'), TAB = opt('tab', 'draw'), RUNS = Number(opt('runs', 3));
const CAT = 'https://ml-circuits-research.github.io/sop-knowledge-worlds/worlds/';
const BUDGET_MS = 2000;
const rows = [];
for (let k = 0; k < RUNS; k++) {
  const reqs = [];
  let turnAt = null;
  const c = await openChat({
    throttle: 4, settings: { formalizer: 'rules', normalizer: false, showTrace: false, logPhrases: true }, hash: `#${TAB}`,
    beforeGoto: async (pg) => {
      await pg.setRequestInterception(true);
      pg.on('request', async (r) => {
        const u = r.url();
        if (!u.startsWith(CAT)) return r.continue();
        reqs.push({ at: Date.now(), path: u.slice(CAT.length).split('?')[0], inTurn: turnAt != null });
        if (!FIXTURE) return r.continue();
        await new Promise((ok) => setTimeout(ok, DELAY));
        try {
          const body = await readFile(path.join(ROOT, 'tests/fixtures/catalog', u.slice(CAT.length).split('?')[0]));
          await r.respond({ status: 200, contentType: u.endsWith('.json') ? 'application/json' : 'text/plain', headers: { 'access-control-allow-origin': '*' }, body });
        } catch { await r.respond({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'nf' }); }
      });
    },
  });
  try {
    await new Promise((ok) => setTimeout(ok, 1500));   // the person reads the greeting
    turnAt = Date.now();
    const r = await c.say(TEXT, { timeout: 30000 });
    const rec = await c.lastPhrase();
    const boot = await c.pg.evaluate(() => { try { return (JSON.parse(localStorage.getItem('psys2.webchat.events') ?? '[]')).filter((e) => e.kind === 'step').map((e) => ({ step: e.stepId, ms: e.ms, bytes: e.bytes })); } catch { return []; } });
    const st = rec?.detail?.perf?.stages ?? {};
    rows.push({ run: k + 1, ms: r.ms, ok: r.ok, totalMs: rec?.detail?.perf?.totalMs ?? null, knowledge: st.knowledge ?? null, stages: Object.fromEntries(Object.entries(st).filter(([, v]) => v.ms >= 20).map(([n, v]) => [n, Math.round(v.ms)])), catalogInTurn: reqs.filter((x) => x.inTurn && x.at <= turnAt + r.ms).map((x) => x.path), boot, reply: r.reply.slice(0, 90) });
    const x = rows.at(-1);
    console.log(`run ${x.run}: ${x.ms} ms (engine total ${x.totalMs}), knowledge ${JSON.stringify(x.knowledge)}, ${x.catalogInTurn.length} catalog reads in the turn; stages ${JSON.stringify(x.stages)}; "${x.reply}"`);
  } finally { await c.close(); }
}
const med = [...rows.map((x) => x.ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log(`first drawing, median of ${rows.length}: ${med} ms (budget ${BUDGET_MS} ms) ${med <= BUDGET_MS ? 'WITHIN' : 'OVER'}`);
if (rows[0]?.boot?.length) console.log(`boot steps (run 1): ${rows[0].boot.map((b) => `${b.step} ${b.ms} ms${b.bytes ? ` ${(b.bytes / 1e6).toFixed(1)} MB` : ''}`).join(', ')}`);
const out = opt('json', null);
if (out) await writeFile(out, `${JSON.stringify({ text: TEXT, tab: TAB, fixture: FIXTURE, delay: FIXTURE ? DELAY : null, median: med, budget: BUDGET_MS, rows }, null, 1)}\n`);
process.exit(med <= BUDGET_MS ? 0 : 1);
