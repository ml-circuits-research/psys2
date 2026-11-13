#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * NX integration in the real webchat (ADR-009): headless Chrome with the published dispatcher model (the A3 heads), default settings.
 *   1. default   the default strategy is hybrid, the control exists in Settings > Understanding, the model loads, an ordinary message is answered and
 *                the trace says who read it; no page errors.
 *   2. setting   choosing "neural" persists and reaches the session; the model reads an ordinary message first and the trace says "model";
 *                "rules" never asks the model.
 *   3. paused    ORT paused (three worker restarts inside the budget): the rules answer and the trace says the model was not used.
 *
 *   node scripts/test-webchat-nx.mjs [--only default,setting,paused] [--throttle 1] [--chrome /usr/bin/chromium]
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE (see scripts/perf-webchat.mjs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openChat } from './test-webchat-turns.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saved = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('psys2.webchat.settings') ?? '{}'));
const MSG = 'add milk to my list';

/** The last trace panel's text (the trace is shown for every answer: showTrace). */
const lastTrace = (pg) => pg.evaluate(() => [...document.querySelectorAll('.p2-trace')].at(-1)?.innerText ?? '');
const modelReady = (pg) => pg.waitForFunction(() => /model v/.test(document.querySelector('.p2-status')?.textContent ?? ''), { timeout: 240000, polling: 200 });
const open = (o) => openChat({ ...o, throttle: o.throttle ?? 1, settings: { formalizer: 'encoder', normalizer: false, showTrace: true } });   // no nxStrategy saved: the default applies

export const SCENARIOS = {
  async default(o) {
    const c = await open(o);
    try {
      await modelReady(c.pg);
      check('default: the strategy is hybrid', (await c.pg.evaluate(() => window.psys2.settings.nxStrategy)) === 'hybrid');
      await c.pg.click('button[aria-label="Settings"]');
      await c.pg.waitForSelector('.p2-modal', { timeout: 5000 });
      await c.pg.click('#p2-st-reading');
      check('default: Settings has the one reading control (SETTINGS-COHERENT)', (await c.pg.$eval('#p2-f-reading', (s) => [s.value, [...s.options].map((x) => x.value).join(',')].join('|'))) === 'hybrid|hybrid,model,rules');
      await c.pg.keyboard.press('Escape');
      const r = await c.say(MSG);
      check('default: an ordinary message is answered', r.ok && /milk/i.test(r.reply), r.reply.slice(0, 60));
      check('default: the trace says who read it', /Read by\s*rules/.test(await lastTrace(c.pg)) && /Reading strategy\s*hybrid/.test(await lastTrace(c.pg)));
      check('default: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async setting(o) {
    const c = await open(o);
    try {
      await modelReady(c.pg);
      await c.pg.click('button[aria-label="Settings"]');
      await c.pg.waitForSelector('.p2-modal', { timeout: 5000 });
      await c.pg.click('#p2-st-reading');
      await c.pg.select('#p2-f-reading', 'model'); await sleep(80);
      check('setting: neural persists and reaches the session', (await saved(c.pg)).nxStrategy === 'neural' && (await c.pg.evaluate(() => window.psys2.session.nx)) === 'neural');
      await c.pg.keyboard.press('Escape');
      const r = await c.say(MSG);
      const t = await lastTrace(c.pg);
      check('setting: neural: the answer is right and the trace says the model read it', r.ok && /milk/i.test(r.reply) && /Read by\s*model/.test(t) && /Reading strategy\s*neural/.test(t), `${r.reply.slice(0, 40)} | ${(t.match(/Read by[^\n]*/) ?? [''])[0].slice(0, 60)}`);
      await c.pg.click('button[aria-label="Settings"]');
      await c.pg.waitForSelector('.p2-modal', { timeout: 5000 });
      await c.pg.click('#p2-st-reading');
      await c.pg.select('#p2-f-reading', 'rules'); await sleep(80);
      await c.pg.keyboard.press('Escape');
      const r2 = await c.say('add bread to my list');
      check('setting: rules: the rules read it', r2.ok && /Read by\s*rules/.test(await lastTrace(c.pg)) && (await saved(c.pg)).nxStrategy === 'rules');
      check('setting: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async paused(o) {
    const c = await open(o);
    try {
      await modelReady(c.pg);
      await c.pg.evaluate(() => { window.psys2.settings.nxStrategy = 'neural'; window.psys2.session.nx = 'neural'; });
      await c.pg.evaluate(async () => { const k = window.__psys2Ort; await k.restart('dispatcher', 'test'); await k.restart('dispatcher', 'test'); await k.restart('dispatcher', 'test'); });   // the ORT client lives in the engine worker; the page holds a mirror
      check('paused: the ORT client is paused', await c.pg.evaluate(() => !!window.__psys2Ort.paused));
      const r = await c.say(MSG);
      const t = await lastTrace(c.pg);
      check('paused: the rules answer', r.ok && /milk/i.test(r.reply), r.reply.slice(0, 60));
      check('paused: the trace says the model was not used', /model not used/.test(t) && /Read by\s*rules/.test(t));
    } finally { await c.close(); }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const o = { throttle: Number(opt('throttle', 1)), chrome: opt('chrome') };
  for (const name of opt('only', 'default,setting,paused').split(',')) { console.log(`\n== ${name}`); try { await SCENARIOS[name](o); } catch (e) { check(`${name}: scenario ran`, false, e.message); } }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
void path;
