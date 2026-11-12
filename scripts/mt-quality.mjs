#!/usr/bin/env node
/**
 * MT-SERIOUS item 5: the quality gate of the language list. For every language of the on-device model registry (both directions with English) a sample of the
 * English operational set (training/eval/operational.jsonl) is translated English -> X and back X -> English by the on-device engine, and the back-translation is
 * READ by the English dialog engine with the same judge as every operational run (right / partly / wrong / not understood). A language is listed in the selector
 * only when at least GATE (80 %) of the sample is read right; the number is shown in Settings > About. The English originals are the reference (the same sample
 * read directly), so the table also shows how much the round trip loses. Also records the checker's verdict (numbers, names, negation, question form) per
 * translated sentence and the time per sentence.
 *
 *   node scripts/mt-quality.mjs --cache <dir> [--lang ro,de] [--every 6] [--shard i/n] [--out file.json] [--reasoner matrix|ops]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode } from '../src/dialog/runtime-config.mjs';
import { checkTranslation } from '../docs/webchat/ui/translation.mjs';
import { createNodeMt, loadRegistry } from './lib/mt-node.mjs';
import { runCase, loadCases } from './eval-operational.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';

const reasoner = applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
export const GATE = 0.8;
const every = Number(arg('every', 6));
const registry = loadRegistry();
let langs = arg('lang') ? arg('lang').split(',') : Object.keys(registry.langs);
if (arg('shard')) { const [i, n] = arg('shard').split('/').map(Number); langs = langs.filter((_, k) => k % n === i); }
const all = loadCases(join(REPO, 'training/eval/operational.jsonl'));
const sample = all.filter((_, k) => k % every === 0);
const settings = settingsForMode('rules');
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

const baseline = [];
for (const c of sample) baseline.push((await runCase(engine, settings, c)).outcome);
const baseRight = baseline.filter((o) => o === 'right').length;
console.error(`sample ${sample.length} cases, English originals read right ${baseRight} (${pct(baseRight, sample.length)} %)`);

const mt = await createNodeMt({ cacheDir: arg('cache') });
const out = { reasoner, gate: GATE, every, sample: sample.length, englishRight: pct(baseRight, sample.length), languages: {} };
for (const lang of langs) {
  const t0 = Date.now();
  try {
    await mt.ensure(lang);
    const tLoad = Date.now() - t0;
    const rows = [], examples = [];
    let msTotal = 0, calls = 0, checkerFail = 0;
    for (const [k, c] of sample.entries()) {
      const t = Date.now();
      const foreign = await mt.translate(c.message, 'en', lang);
      const back = await mt.translate(foreign, lang, 'en');
      msTotal += Date.now() - t; calls += 2;
      if (checkTranslation(foreign, back, { from: lang === 'ro' ? 'ro' : lang, to: 'en' })) checkerFail++;
      const r = await runCase(engine, settings, { ...c, message: back });
      rows.push(r.outcome);
      if (k % 25 === 0) examples.push({ id: c.id, en: c.message, [lang]: foreign, back, outcome: r.outcome });
    }
    const right = rows.filter((o) => o === 'right').length;
    out.languages[lang] = { right: pct(right, rows.length), wrong: pct(rows.filter((o) => o === 'wrong').length, rows.length), notUnderstood: pct(rows.filter((o) => o === 'not_understood').length, rows.length),
      passes: right / rows.length >= GATE, checkerRejects: pct(checkerFail, rows.length), msPerSentence: Math.round(msTotal / calls), loadMs: tLoad, downloadMB: +(registry.langs[lang].bytes / 1e6).toFixed(1), examples };
    console.error(`${lang}: right ${pct(right, rows.length)} %  ${Math.round(msTotal / calls)} ms/sentence  load ${tLoad} ms`);
  } catch (e) { out.languages[lang] = { error: String(e?.message ?? e), passes: false }; console.error(`${lang}: ERROR ${e?.message ?? e}`); }
  mt.reset();
}
if (arg('out')) writeFileSync(arg('out'), JSON.stringify(out));
else console.log(JSON.stringify(out));
process.exit(0);
