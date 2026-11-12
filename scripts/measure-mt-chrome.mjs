#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * MT-SERIOUS item 2: first-load and per-sentence time of the on-device model in Chrome with a CPU throttle (default 4x, a mid phone), phone mode.
 * The model files come from PSYS2_MT_CACHE (so the network is not measured: the download is size / bandwidth; the time here is gunzip + checksum + WASM start + model load).
 *   PUPPETEER_CORE=... PSYS2_MT_CACHE=<dir> node scripts/measure-mt-chrome.mjs [--lang ro] [--throttle 4] [--json]
 */
import { openChat } from './test-webchat-turns.mjs';
import { modelRequests } from './test-webchat-phone.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const lang = arg('lang', 'ro'), throttle = Number(arg('throttle', 4));
const RO = ['Cât face 3 plus 4?', 'Desenează o pisică verde.', 'Deschide diagrama.', 'Cum mă numesc?', 'Fă o diagramă random', 'Adună 4 cu 8.', 'Care este capitala Japoniei și cât face 3 ori 3?', 'Oprește microfonul.', 'Arată-mi o hartă a Europei.', 'Șterge tot ce am desenat.'];
const EN = ['Your shopping list is empty.', 'I do not know your age yet.', 'Drew a green cat.', 'What do you want to draw? For example "a tree".', 'Opened the diagram tab. Tell me what to draw, for example "a tree".', '3 plus 4 is 7.', 'The capital of Japan is Tokyo, and 3 times 3 is 9.', 'I did not understand "blue sky". Did you mean "draw a blue sky"?', 'There are 30 days in June.', 'Done. Everything on the canvas was erased.'];
const req = modelRequests();
const c = await openChat({ throttle, browserApis: { translator: false }, beforeGoto: req.beforeGoto, settings: { formalizer: 'rules', normalizer: false, showTrace: false, language: 'en' } });
try {
  const out = await c.pg.evaluate(async (lang, RO, EN) => {
    const tl = window.__psys2Tl; await tl.init();
    const t0 = performance.now(); await tl.host.ensure(lang); const loadMs = performance.now() - t0;
    const time = async (list, from, to) => { const ts = []; for (const s of list) { const t = performance.now(); await tl.host.translate(s, from, to); ts.push(performance.now() - t); } ts.sort((a, b) => a - b); return { p50: Math.round(ts[ts.length >> 1]), p95: Math.round(ts[Math.floor(ts.length * 0.95)]), max: Math.round(ts.at(-1)) }; };
    await tl.host.translate('warm up', 'en', lang);
    return { loadMs: Math.round(loadMs), toEn: await time(RO, lang, 'en'), fromEn: await time(EN, 'en', lang), mb: (tl.registry.langs[lang].bytes / 1e6).toFixed(1) };
  }, lang, RO, EN);
  const res = { lang, throttle, ...out };
  if (process.argv.includes('--json')) console.log(JSON.stringify(res));
  else console.log(`${lang} at ${throttle}x CPU: first load (gunzip + checksum + WASM start + both models, files from disk) ${out.loadMs} ms; ${lang}->en p50 ${out.toEn.p50} ms p95 ${out.toEn.p95} ms; en->${lang} p50 ${out.fromEn.p50} ms p95 ${out.fromEn.p95} ms; download ${out.mb} MB`);
} finally { await c.close(); }
process.exit(0);
