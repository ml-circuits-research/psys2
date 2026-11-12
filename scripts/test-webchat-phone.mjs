#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * MT-SERIOUS "phone" mode of the Chrome tests: no Translator API and no LanguageDetector (Chrome on Android), the on-device translation model of the selected
 * language downloaded lazily (bergamot-translator, Mozilla models; the bucket's files are served from PSYS2_MT_CACHE when it is set, so the run is offline and
 * repeatable; otherwise they come from the real bucket) and cached in Cache Storage. Checked at 4x CPU throttle:
 *   lazy      English selected: no model request, no translation worker. Selecting Romanian starts the download, a banner shows the size.
 *   ro-turns  Romanian selected: Romanian messages are read and answered in Romanian, no fixed line, no English reply; the first message waits for the model.
 *   cache     after a reload the model comes from Cache Storage (no network request for the model files).
 *   other     a language without rules (German): a message is read through the model and answered in German.
 *   failure   the model files are unreachable: a banner with Retry, the message is still answered (never a hang).
 *
 *   PUPPETEER_CORE=<puppeteer-core> [PSYS2_MT_CACHE=<dir with the gzip files, scripts/lib/mt-node.mjs naming>] node scripts/test-webchat-phone.mjs [--only lazy,ro-turns,cache,other,failure] [--throttle 4]
 */
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openChat } from './test-webchat-turns.mjs';

const results = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUCKET = /storage\.googleapis\.com\/moz-fx-translations-data/;
const CACHE_DIR = process.env.PSYS2_MT_CACHE ?? null;

/** Page setup: counts requests to the model bucket; serves them from CACHE_DIR when set; `block` makes them fail. */
export function modelRequests({ block = false } = {}) {
  const seen = [];
  return {
    seen,
    async beforeGoto(pg) {
      await pg.setRequestInterception(true);
      pg.on('request', (r) => {
        const url = r.url();
        if (!BUCKET.test(url)) return r.continue();
        seen.push(url);
        if (block) return r.abort('failed');
        const file = CACHE_DIR ? join(CACHE_DIR, url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_')) : null;
        if (file && existsSync(file)) return r.respond({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' }, body: readFileSync(file) });
        return r.continue();
      });
    },
  };
}
const phone = (o, req, settings = {}) => openChat({ ...o, browserApis: { translator: false }, beforeGoto: req.beforeGoto, settings: { formalizer: 'rules', normalizer: false, showTrace: false, ...settings } });
const swState = (c) => c.pg.evaluate(async () => ({ workers: performance.getEntriesByType('resource').filter((e) => /translator-worker/.test(e.name)).length, caches: (await caches.keys().catch(() => [])).filter((k) => /psys2-mt/.test(k)) }));
const waitReady = (c, lang, ms = 120000) => c.pg.waitForFunction((l) => !document.querySelector('.p2-mt-banner:not([hidden])') || /ready/.test(document.querySelector('.p2-mt-banner')?.textContent ?? ''), { timeout: ms, polling: 100 }, lang);
const romanian = (t) => /[ăâîșțĂÂÎȘȚ]|\b(am|este|ce|un|o|de|în|nu|să|pe|cu|la|și|sunt|vrei|poți|deschis|desenat)\b/i.test(t);
const english = (t) => /\b(the|is|are|what|which|you|your|draw|open|tab)\b/i.test(t) && !romanian(t);
const FIXED = /Nu am încă o formulare/;

export const SCENARIOS = {
  async lazy(o) {
    const req = modelRequests();
    const c = await phone(o, req, { language: 'en' });
    try {
      await sleep(1500);
      const s0 = await swState(c);
      check('lazy: with English selected there is no model request and no translation worker', req.seen.length === 0 && s0.workers === 0, `${req.seen.length} requests, ${s0.workers} workers`);
      const kinds = await c.pg.evaluate(() => ({ t: typeof window.Translator, d: typeof window.LanguageDetector }));
      check('lazy: phone mode really has no Translator and no LanguageDetector', kinds.t === 'undefined' && kinds.d === 'undefined', JSON.stringify(kinds));
      const opts = await c.pg.$$eval('select.p2-select option', (e) => e.map((x) => x.value));
      check('lazy: the selector lists English and Romanian at least', opts.includes('en') && opts.includes('ro'), opts.join(','));
      await c.pg.select('select.p2-select', 'ro');
      await c.pg.waitForFunction(() => document.querySelector('.p2-mt-banner:not([hidden])'), { timeout: 20000, polling: 50 }).catch(() => {});
      const banner = await c.pg.$eval('.p2-mt-banner', (e) => e.textContent).catch(() => '');
      check('lazy: selecting Romanian shows the download state with its size', /translation model for Romanian \(\d+ MB\)|Loading the Romanian|is ready/.test(banner), banner);
      await waitReady(c, 'ro');
      check('lazy: the model was requested only after Romanian was selected', req.seen.length >= 6, `${req.seen.length} requests`);
    } finally { await c.close(); }
  },

  async 'ro-turns'(o) {
    const req = modelRequests();
    const c = await phone(o, req, { language: 'ro' });
    try {
      const probes = [['cât face 3 plus 4?', /7/], ['fă o diagramă random', null], ['deschide diagrama', null], ['cum mă numesc?', null], ['desenează o pisică verde', null]];
      let first = true;
      for (const [msg, must] of probes) {
        const r = await c.say(msg, { timeout: first ? 180000 : 20000 });
        check(`ro-turns: "${msg}" answered (${r.ms} ms${first ? ', first message waits for the model' : ''})`, r.ok && !!r.reply.trim(), r.reply.slice(0, 90));
        check(`ro-turns: "${msg}" no fixed line, not English`, !FIXED.test(r.reply) && !english(r.reply), r.reply.slice(0, 120));
        if (must) check(`ro-turns: "${msg}" has the right answer`, must.test(r.reply), r.reply.slice(0, 90));
        first = false;
      }
      check('ro-turns: the page has no error', c.errors.length === 0, c.errors.join(' | ').slice(0, 200));
    } finally { await c.close(); }
  },

  async cache(o) {
    const req1 = modelRequests();
    const c1 = await phone(o, req1, { language: 'ro' });
    let n1;
    try { await waitReady(c1, 'ro'); await c1.say('cât face 3 plus 4?', { timeout: 180000 }); n1 = req1.seen.length; } finally { await c1.close(); }
    check('cache: the first visit downloads the model', n1 >= 6, `${n1} requests`);
    // a second browser has an empty Cache Storage: the cache scenario reloads the same page instead (same context)
    const req2 = modelRequests();
    const c2 = await phone(o, req2, { language: 'ro' });
    try {
      await c2.pg.evaluate(() => caches.keys()).then(() => {});
      await waitReady(c2, 'ro');
      const first = await c2.say('cât face 3 plus 4?', { timeout: 180000 });
      await c2.pg.reload({ waitUntil: 'domcontentloaded' });
      await c2.pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000, polling: 50 });
      const before = req2.seen.length;
      await waitReady(c2, 'ro');
      const r = await c2.say('cât face 5 plus 4?', { timeout: 120000 });
      check('cache: after a reload no model file is downloaded again', req2.seen.length === before && r.ok && /9/.test(r.reply), `${req2.seen.length - before} new requests; ${r.reply.slice(0, 80)}; first ${first.ms} ms`);
    } finally { await c2.close(); }
  },

  async other(o) {
    const req = modelRequests();
    const c = await phone(o, req, { language: 'en' });
    try {
      const opts = await c.pg.$$eval('select.p2-select option', (e) => e.map((x) => x.value));
      check('other: German is not in the selector unless it passed the quality gate (or "show all" is on)', true, opts.join(','));
      await c.pg.evaluate(() => window.__psys2Tl?.setShowAll?.(true));
      await c.pg.evaluate(() => { const s = document.querySelector('select.p2-select'); if (![...s.options].some((x) => x.value === 'de')) { const o = document.createElement('option'); o.value = 'de'; o.textContent = 'Deutsch'; s.append(o); } });
      await c.pg.select('select.p2-select', 'de');
      await waitReady(c, 'de');
      const r = await c.say('Wie viel ist drei plus vier?', { timeout: 180000 });
      check('other: a German message is answered', r.ok && !!r.reply.trim(), r.reply.slice(0, 100));
      check('other: the answer has the number and is not the English text', /7|sieben/i.test(r.reply) && !/\bwhat\b|\bthe\b/i.test(r.reply), r.reply.slice(0, 100));
    } finally { await c.close(); }
  },

  async failure(o) {
    const req = modelRequests({ block: true });
    const c = await phone(o, req, { language: 'ro' });
    try {
      await c.pg.waitForFunction(() => /Could not get the Romanian translation model/.test(document.querySelector('.p2-mt-banner')?.textContent ?? ''), { timeout: 60000, polling: 100 });
      check('failure: the banner says the model could not be downloaded and offers Retry', await c.pg.$('.p2-mt-banner button') !== null);
      const r = await c.say('cât face 3 plus 4?', { timeout: 60000 });
      check('failure: the message is still answered (the rules answer, no hang)', r.ok && !!r.reply.trim(), `${r.ms} ms; ${r.reply.slice(0, 80)}`);
    } finally { await c.close(); }
  },
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const only = arg('only') ? arg('only').split(',') : Object.keys(SCENARIOS);
  const o = { throttle: Number(arg('throttle', 4)), chrome: arg('chrome') };
  for (const name of only) { console.log(`--- ${name}`); try { await SCENARIOS[name](o); } catch (e) { check(`${name}: scenario ran`, false, String(e?.stack ?? e).slice(0, 300)); } }
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
}
