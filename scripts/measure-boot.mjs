#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * BOOT COST PER PAGE (owner export 2026-11-14 22:43, finding 6: the reasoner started at 6.3 s and a 29.7 MB translation model loaded on a drawing page). For each page (the tab opened by the
 * phone's #hash) and each selected language, a fresh Chrome at 390x844 with a 4x CPU throttle loads the page, waits until the boot steps settle, and records the steps the page reports
 * (the phrase log's "step" events: page code, worlds, reasoner, translator, faces, catalog ...: ms and bytes), the bytes of every request, and whether the translation model was fetched.
 * Rule checked: the translation model (docs/webchat/models-mt) is fetched only when a language other than English is selected.
 * Writes training/eval/boot-cost.json, which scripts/learning-curve.mjs --record puts in the curve (`boot`).
 *
 *   node scripts/build-webchat.mjs && PUPPETEER_CORE=<scratch>/node_modules/puppeteer-core node scripts/measure-boot.mjs [--pages draw,diagram,talk] [--langs en,ro] [--settle 9000] [--no-browser-apis] [--no-write]
 * Not part of `npm test` (needs Chrome). The real catalog (Pages copy) is fetched as on the phone.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { openChat } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const NO_APIS = args.includes('--no-browser-apis');   // a phone browser without the Translator API (Chrome on Android): the on-device model is the translator
const PAGES = opt('pages', 'draw,diagram,talk').split(','), LANGS = opt('langs', 'en,ro').split(','), SETTLE = Number(opt('settle', 9000));
const out = { generated: 'scripts/measure-boot.mjs', date: new Date().toISOString().slice(0, 10), build: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(), profile: `Chrome 390x844, 4x CPU throttle${NO_APIS ? ', no Translator API (the on-device model translates)' : ''}`, pages: {} };
let bad = 0;
for (const lang of LANGS) for (const page of PAGES) {
  const reqs = [];
  const c = await openChat({
    throttle: 4, hash: `#${page}`, ...(NO_APIS ? { browserApis: false } : {}), settings: { formalizer: 'rules', normalizer: false, showTrace: false, logPhrases: true, ...(lang !== 'en' ? { language: lang } : {}) },
    beforeGoto: async (pg) => {
      pg.on('requestfinished', async (r) => { let n = 0; try { n = Number(r.response()?.headers()['content-length'] ?? 0) || (await r.response()?.buffer())?.length || 0; } catch { n = 0; } reqs.push({ url: r.url(), bytes: n }); });
    },
  });
  try {
    await new Promise((ok) => setTimeout(ok, SETTLE));
    const steps = await c.pg.evaluate(() => { try { return (JSON.parse(localStorage.getItem('psys2.webchat.events') ?? '[]')).filter((e) => e.kind === 'step').map((e) => ({ step: e.stepId, ms: e.ms, bytes: e.bytes ?? null, ok: e.ok })); } catch { return []; } });
    const selected = await c.pg.evaluate(() => { try { return window.psys2?.language?.get?.() ?? document.documentElement.lang ?? null; } catch { return null; } });
    const mt = reqs.filter((r) => /models-mt\//.test(r.url));
    const bytes = reqs.reduce((s, r) => s + r.bytes, 0);
    const row = { lang, selected, steps, requests: reqs.length, mb: Math.round(bytes / 1e5) / 10, translationModelMb: Math.round(mt.reduce((s, r) => s + r.bytes, 0) / 1e5) / 10, reasonerMs: steps.find((s) => s.step === 'reasoner')?.ms ?? null };
    out.pages[`${page}/${lang}`] = row;
    const ok = lang === 'en' ? row.translationModelMb === 0 : true;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${page} (${lang}): ${row.mb} MB in ${row.requests} requests, translation model ${row.translationModelMb} MB, reasoner ${row.reasonerMs} ms; steps ${steps.map((s) => `${s.step} ${s.ms} ms${s.bytes ? ` ${(s.bytes / 1e6).toFixed(1)} MB` : ''}`).join(', ')}`);
  } finally { await c.close(); }
}
if (!args.includes('--no-write')) { await writeFile(path.join(ROOT, `training/eval/boot-cost${NO_APIS ? '-no-apis' : ''}.json`), `${JSON.stringify(out, null, 1)}\n`); console.log(`wrote training/eval/boot-cost${NO_APIS ? '-no-apis' : ''}.json`); }
process.exit(bad ? 1 : 0);
