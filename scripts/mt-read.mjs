#!/usr/bin/env node
/**
 * MT-SERIOUS item 2/4: Romanian reading through an on-device MT engine, judged like every operational run (right / partly / wrong / not understood) on
 * training/eval/operational-ro.jsonl. The ro -> en translations come from a map file ({ map: { "<romanian>": "<english>" } }) or, with `--bergamot <cacheDir>`, from the
 * on-device engine itself (the vendored bergamot-translator in a worker, scripts/lib/mt-node.mjs). Three readings:
 *   rules    the current rules translator (Romanian lexicon, phrase tables, pre-pass)
 *   mt       the MT output only, the rules translator replaced by an identity stub (what the system reads once the rules are removed)
 *   hybrid   the rules first; the MT only for a reading the rules found poor (the route of RO-TRANSLATE-FALLBACK, `translator-in`)
 * Every MT output passes the checker (numbers, names, negation, question form), as in the app.
 *
 *   node scripts/mt-read.mjs (--map file.json | --bergamot <cacheDir> [--save-map file.json]) [--limit N] [--reasoner matrix|ops] [--json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { runCase, loadCases } from './eval-operational.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';

const reasoner = applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);

let cases = loadCases(join(REPO, 'training/eval/operational-ro.jsonl'));
if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));
const settings = settingsForMode('rules');

let map = {}, label = 'map';
if (arg('map')) { const m = JSON.parse(readFileSync(arg('map'), 'utf8')); map = m.map ?? m; label = m.engine ?? arg('map'); }
else if (arg('bergamot')) {
  const { createNodeMt } = await import('./lib/mt-node.mjs');
  const mt = await createNodeMt({ cacheDir: arg('bergamot') });
  await mt.ensure('ro');
  const t0 = Date.now(), times = [];
  for (const m of [...new Set(cases.map((c) => c.message))]) { const t = Date.now(); map[m] = await mt.translate(m, 'ro', 'en'); times.push(Date.now() - t); }
  times.sort((a, b) => a - b);
  label = `bergamot-translator 0.4.9, Mozilla tiny roen (p50 ${times[times.length >> 1]} ms, p95 ${times[Math.floor(times.length * 0.95)]} ms per sentence, Node)`;
  mt.reset();
  if (arg('save-map')) writeFileSync(arg('save-map'), JSON.stringify({ engine: label, map }));
}
const lookup = (t) => map[t] ?? map[String(t).trim()] ?? null;
const backend = {
  translatorKind: () => 'translator', detectorKind: () => null, prepare: async () => {}, state: () => 'ready', supports: () => true, detect: async () => [],
  translate: async (text, from, to) => { if (from === 'ro' && to === 'en') { const r = lookup(text); if (r) return r; } throw new Error('no translation'); },
};
const stub = {   // the rules translator removed: nothing is translated, nothing is known
  translate: (t) => ({ text: t, alignment: [], unknown: [t], notes: [], confidence: 0 }), detectLanguage: () => ({ lang: 'ro', confidence: 1 }),
  evidence: () => ({ strongRo: true, strongEn: false }), supports: () => true, leftovers: () => [],
};

async function run(name, translator) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
  const t = { n: 0, right: 0, partly: 0, wrong: 0, not_understood: 0 };
  const times = [];
  for (const c of cases) { const r = await runCase(engine, settings, c); t.n++; t[r.outcome]++; times.push(r.ms); }
  times.sort((a, b) => a - b);
  return { name, ...t, right_pct: +(100 * t.right / t.n).toFixed(1), p50: Math.round(times[times.length >> 1]), p95: Math.round(times[Math.floor(times.length * 0.95)]) };
}
const rows = [];
rows.push(await run('rules', createTranslator()));
rows.push(await run('mt', createSwitchTranslator({ rules: stub, backend, getStrategy: () => 'browser-api' })));
rows.push(await run('hybrid', createSwitchTranslator({ rules: createTranslator(), backend, getStrategy: () => 'auto' })));
const out = { reasoner, engine: label, cases: cases.length, rows };
if (flag('json')) console.log(JSON.stringify(out));
else { console.log(`[${reasoner}] ${label}: ${cases.length} Romanian messages`); for (const r of rows) console.log(`  ${r.name.padEnd(7)} right ${r.right} (${r.right_pct}%)  partly ${r.partly}  wrong ${r.wrong}  not understood ${r.not_understood}   p50 ${r.p50} ms p95 ${r.p95} ms`); }
process.exit(0);
