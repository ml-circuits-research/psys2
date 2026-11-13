#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Merges the shards of scripts/mt-roundtrip-m4.mjs: prints the table per language (old round trip, M4, difference), and with the flags
 *   --quality   rewrites docs/webchat/vendor/bergamot/quality.json (`right` = the M4 number, `roundTripRight` = the old one, gate 80: the "beta" mark follows `right`)
 *   --ledger L1,L2,..   appends the M4 failures of those languages to training/eval/failures.jsonl, one class per cause (scripts/mt-roundtrip-classify.mjs), append-only
 *   --cases file        keeps all rows of all languages in one jsonl file (training/results)
 *
 *   node scripts/mt-roundtrip-m4-report.mjs <dir with s*.jsonl and s*.json> [--quality] [--ledger fr,it,...] [--cases out.jsonl]
 */
import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { classify } from './mt-roundtrip-classify.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : null; };
const files = readdirSync(dir);
const summary = { languages: {} };
for (const f of files.filter((x) => /^s\d+\.json$/.test(x))) { const d = JSON.parse(readFileSync(join(dir, f), 'utf8')); Object.assign(summary, { reasoner: d.reasoner, sample: d.sample, englishRight: d.englishRight }); Object.assign(summary.languages, d.languages); }
const rows = files.filter((x) => /^s\d+\.jsonl$/.test(x)).flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const prev = JSON.parse(readFileSync(join(REPO, 'docs/webchat/vendor/bergamot/quality.json'), 'utf8'));
const GATE = 80;

console.log(`English reference ${summary.englishRight}% right on ${summary.sample} cases (reasoner ${summary.reasoner})`);
console.log('lang      before(quality.json)  old(same run)  M4    change   beta(before -> now)');
const table = Object.entries(summary.languages).filter(([, v]) => !v.error).sort((a, b) => b[1].m4.right - a[1].m4.right);
for (const [l, v] of table) {
  const before = prev.languages[l]?.right;
  console.log(`${l.padEnd(8)}  ${String(before ?? '-').padStart(6)}               ${String(v.old.right).padStart(6)}       ${String(v.m4.right).padStart(5)}  ${(v.m4.right - v.old.right >= 0 ? '+' : '') + (v.m4.right - v.old.right).toFixed(1).padStart(5)}   ${before != null && before >= GATE ? 'normal' : 'beta  '} -> ${v.m4.right >= GATE ? 'normal' : 'beta'}`);
}
const err = Object.entries(summary.languages).filter(([, v]) => v.error);
console.log(`${table.filter(([, v]) => v.m4.right >= GATE).length} of ${table.length} reach ${GATE}% with M4 (before: ${table.filter(([l]) => (prev.languages[l]?.right ?? 0) >= GATE).length}); errors: ${err.map(([l, v]) => `${l} ${v.error}`).join('; ') || 'none'}`);

if (arg('cases')) writeFileSync(resolve(REPO, arg('cases')), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

if (process.argv.includes('--quality')) {
  const slim = { ...prev, gate: GATE, sample: summary.sample, englishRight: summary.englishRight, reasoner: summary.reasoner,
    measured: 'scripts/mt-roundtrip-m4.mjs (2026-11-13): English operational sample translated en>X by the on-device model, then SENT in language X to a session (M4: the candidates, the model, the language pack\'s rules where one exists, one repaired, chosen by understanding; no browser Translator in Node); right = share judged right. roundTripRight = the old measure (the model\'s X>en alone read as English)',
    languages: { ...prev.languages } };
  for (const [l, v] of table) slim.languages[l] = { ...prev.languages[l], right: v.m4.right, wrong: v.m4.wrong, notUnderstood: v.m4.notUnderstood, roundTripRight: v.old.right };
  writeFileSync(join(REPO, 'docs/webchat/vendor/bergamot/quality.json'), JSON.stringify(slim) + '\n');
  console.log('quality.json updated');
}

if (arg('ledger')) {
  const langs = new Set(arg('ledger').split(','));
  const LEDGER = join(REPO, 'training/eval/failures.jsonl');
  const have = new Set(existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.source}\t${r.text}\t${r.tab}`; }) : []);
  const build = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const out = [], by = {};
  for (const r of rows) {
    if (!langs.has(r.lang) || r.m4.verdict === 'right') continue;
    // the English the reader got (M4's choice) is what the classes look at; the old back-translation only when the turn gave none
    const cls = classify({ verdict: r.m4.verdict, original_verdict: r.original_verdict, original: r.original, back_translation: r.m4.english ?? r.back_translation, expect: r.expect, reading: { reply: r.m4.reply, failing: r.m4.failing } }) ?? r.m4.verdict;
    const row = { text: r.foreign, tab: r.tab ?? null, language: r.lang, happened: `${r.m4.reply ?? r.m4.error ?? ''} [English read: ${r.m4.english ?? '(none)'}]`.slice(0, 300), expected: `${r.original} -> ${JSON.stringify(r.expect?.answer ?? r.expect?.state ?? null)}`,
      class: `roundtrip-m4:${cls}`, source: `round-trip-m4-2026-11-13#${r.id}/${r.lang}`, first_seen: new Date().toISOString().slice(0, 10), build, was_passing: r.old.verdict === 'right' };
    if (have.has(`${row.source}\t${row.text}\t${row.tab}`)) continue;
    out.push(row); by[row.class] = (by[row.class] ?? 0) + 1;
  }
  if (out.length) appendFileSync(LEDGER, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`ledger: ${out.length} rows appended`, JSON.stringify(by), `was_passing ${out.filter((r) => r.was_passing).length}`);
}
