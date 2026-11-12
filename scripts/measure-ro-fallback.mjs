#!/usr/bin/env node
/**
 * RO-TRANSLATE-FALLBACK measurement (worker-tasks, item 5): the Romanian operational set (training/eval/operational-ro.jsonl, rules mode) run twice per reasoner,
 *   before  the plain rules translator (what the CLI and the tests use): English replies are kept in English as a whole
 *   after   the webchat's switch translator with a fake on-device Translator behind it (scripts/lib/fake-browser-apis.mjs, createFakeTranslation)
 * The fake's Romanian to English table is an ORACLE here: for every case of the set it returns the English message of the source case (the set is built from
 * English cases), i.e. a perfect translator, so the "after" understanding is an upper bound of what the route can win. English to Romanian answers from the small table
 * of the harness and the rules; whatever neither can say becomes the fixed Romanian line (route `ro-generic`). Reports per reasoner: right / wrong / not understood,
 * replies shown in English (target 0), the routes used and the added time (p50 / p95) of the turns that used the Translator, against the same cases without it.
 *
 *   node scripts/measure-ro-fallback.mjs [--reasoner matrix|ops] [--limit N] [--json]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { createFakeTranslation } from './lib/fake-browser-apis.mjs';
import { checkReply } from './lib/ro-reply-quality.mjs';
import { runCase, loadCases } from './eval-operational.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';

const reasoner = applyReasonerFlag();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : 0; };

let cases = loadCases(join(REPO, 'training/eval/operational-ro.jsonl'));
if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));
const english = new Map(loadCases(join(REPO, 'training/eval/operational.jsonl')).map((c) => [c.id, c.message]));
const oracle = new Map(cases.filter((c) => english.has(c.source_id)).map((c) => [c.message, english.get(c.source_id)]));
const settings = settingsForMode('rules');

async function run(label, translator) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator });
  const rows = [];
  for (const c of cases) {
    const r = await runCase(engine, settings, c);
    const q = checkReply({ shown: r.reply_shown, english: r.reply, lang: r.lang });
    rows.push({ id: c.id, outcome: r.outcome, ms: r.ms, via: r.via ?? [], kind: q.kind, shown: r.reply_shown });
  }
  return { label, rows };
}

const plain = await run('before: rules only', createTranslator());
const fake = createFakeTranslation({ extra: oracle });
const backend = { translatorKind: () => 'translator', detectorKind: () => null, translate: async (t, f, to) => fake.translate(t, f, to), detect: async () => [], prepare: async () => {}, state: () => 'ready' };
const switchTr = createSwitchTranslator({ rules: createTranslator(), backend, getStrategy: () => 'auto' });
const after = await run('after: rules, then the on-device Translator', switchTr);

const tally = (rows) => { const t = { n: rows.length, right: 0, partly: 0, wrong: 0, not_understood: 0, english: 0, mixed: 0, brokenQuote: 0 }; for (const r of rows) { t[r.outcome]++; if (r.kind === 'english') t.english++; if (r.kind === 'mixed') t.mixed++; if (r.kind === 'broken-quote') t.brokenQuote++; } return t; };
const routes = {};
for (const r of after.rows) for (const v of r.via) routes[v] = (routes[v] ?? 0) + 1;
const beforeById = new Map(plain.rows.map((r) => [r.id, r]));
const used = after.rows.filter((r) => r.via.length);
const usedIn = after.rows.filter((r) => r.via.includes('translator-in') || r.via.includes('translator-out'));
const out = {
  reasoner, cases: cases.length, oracleEntries: oracle.size, before: tally(plain.rows), after: tally(after.rows), routes,
  turnsUsingFallback: used.length, turnsUsingTranslator: usedIn.length,
  ms: {
    all: { before: { p50: quant(plain.rows.map((r) => r.ms), 0.5), p95: quant(plain.rows.map((r) => r.ms), 0.95) }, after: { p50: quant(after.rows.map((r) => r.ms), 0.5), p95: quant(after.rows.map((r) => r.ms), 0.95) } },
    translatorTurns: { before: { p50: quant(used.map((r) => beforeById.get(r.id).ms), 0.5), p95: quant(used.map((r) => beforeById.get(r.id).ms), 0.95) }, after: { p50: quant(used.map((r) => r.ms), 0.5), p95: quant(used.map((r) => r.ms), 0.95) } },
  },
  stillEnglish: after.rows.filter((r) => r.kind === 'english').slice(0, 10).map((r) => ({ id: r.id, shown: r.shown })),
  newlyWrong: after.rows.filter((r) => r.outcome === 'wrong' && beforeById.get(r.id).outcome !== 'wrong').map((r) => r.id),
};
if (flag('json')) console.log(JSON.stringify(out));
else {
  const f = (t) => `right ${t.right} (${(100 * t.right / t.n).toFixed(1)}%)  partly ${t.partly}  wrong ${t.wrong}  not understood ${t.not_understood}  | replies shown in English ${t.english}, mixed ${t.mixed}, broken quotes ${t.brokenQuote}`;
  console.log(`[${reasoner}] ${cases.length} Romanian messages (${oracle.size} with an oracle translation)`);
  console.log(`  before  ${f(out.before)}`);
  console.log(`  after   ${f(out.after)}`);
  console.log(`  routes  ${JSON.stringify(routes)}  (turns that used a fallback: ${used.length}, of which the Translator answered: ${usedIn.length})`);
  console.log(`  time    all turns p50 ${out.ms.all.before.p50} -> ${out.ms.all.after.p50} ms, p95 ${out.ms.all.before.p95} -> ${out.ms.all.after.p95} ms; turns that used a fallback: p50 ${out.ms.translatorTurns.before.p50} -> ${out.ms.translatorTurns.after.p50} ms, p95 ${out.ms.translatorTurns.before.p95} -> ${out.ms.translatorTurns.after.p95} ms (the fake answers at once; add the Translator's own latency, up to 400 ms per call)`);
  if (out.newlyWrong.length) console.log(`  newly wrong: ${out.newlyWrong.length}: ${out.newlyWrong.slice(0, 8).join(', ')}`);
  for (const e of out.stillEnglish) console.log(`  still English: ${e.id}  ${e.shown}`);
}
