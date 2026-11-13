#!/usr/bin/env node
/**
 * ROUND-TRIP-MINING step 1: the cases behind the round-trip quality number (scripts/mt-quality.mjs). For every language the English operational sample
 * (every 6th case of training/eval/operational.jsonl) is translated English -> X -> English by the on-device model and the back-translation is read by the
 * English engine; one JSON line per (case, language) with the original, the back-translation, what we read (reply, failing expectations, strategy) and the verdict.
 *
 *   node scripts/mt-roundtrip-cases.mjs --cache <dir> --lang fr,de [--every 6] [--reasoner matrix|ops] --out file.jsonl [--translations earlier.jsonl]
 *   --translations: reuse the foreign text and back-translation of an earlier run (same model output, only the reading is redone: the "after" measurement).
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createNodeMt } from './lib/mt-node.mjs';
import { runCase, loadCases } from './eval-operational.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';

applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const step = Number(arg('every', 6));
const langs = arg('lang', 'fr').split(',');
const sample = loadCases(join(REPO, 'training/eval/operational.jsonl')).filter((_, k) => k % step === 0);
const settings = settingsForMode('rules');
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const earlier = new Map();
const earlierFile = arg('translations');
if (earlierFile && existsSync(earlierFile)) {
  for (const l of readFileSync(earlierFile, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); earlier.set(`${r.id}|${r.lang}`, r); }
}
const mt = earlier.size ? null : await createNodeMt({ cacheDir: arg('cache') });
const lines = [];
const base = new Map();   // verdict of the ORIGINAL English message (a failing original is not a round-trip loss)
for (const c of sample) base.set(c.id, (await runCase(engine, settings, c)).outcome);
for (const lang of langs) {
  if (mt) await mt.ensure(lang);
  for (const c of sample) {
    const old = earlier.get(`${c.id}|${lang}`);
    const foreign = old ? old.foreign : await mt.translate(c.message, 'en', lang);
    const back = old ? old.back_translation : await mt.translate(foreign, lang, 'en');
    const r = await runCase(engine, settings, { ...c, message: back });
    lines.push(JSON.stringify({ id: c.id, world: c.world, lang, original: c.message, foreign, back_translation: back,
      reading: { reply: r.reply, strategy: r.strategy, failing: r.failing }, verdict: r.outcome, original_verdict: base.get(c.id), expect: c.expect,
      ...(c.setup?.length ? { setup: c.setup } : {}), ...(c.tab ? { tab: c.tab } : {}), ...(c.init ? { init: c.init } : {}) }));
  }
  console.error(`${lang}: ${sample.length} cases`);
  if (mt) mt.reset();
}
writeFileSync(arg('out'), lines.join('\n') + '\n');
