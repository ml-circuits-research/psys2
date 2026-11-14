#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tables of the model ablation (scripts/eval-ablation.mjs): right / wrong / asked / not understood per configuration and set, the failure-ledger groups,
 * the rescue classes between two configurations, latency. Reads the per-configuration files of a results directory.
 *
 *   node scripts/ablation-report.mjs --dir <full results> [--lat <latency results>] [--out training/results/model-ablation-2026-11-13.json] [--md <tables.md>]
 *   node scripts/ablation-report.mjs --dir <dir> --rescue enc-C:enc-hybrid     rows right in the second and not right in the first, classified
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { spellVocabulary, FUNCTION_WORDS } from '../src/formalizer/spell.mjs';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const dirs = arg('dir').split(',').map((d) => resolve(d));
const load = (d, c, suffix = '') => { const f = join(d, `${c}${suffix}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const configs = [...new Set(dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.json') && !f.endsWith('.latency.json')).map((f) => f.replace(/\.json$/, ''))))];
// several directories merge: rows of the same set and id are taken once (the first directory wins)
const data = Object.fromEntries(configs.map((c) => {
  const parts = dirs.map((d) => load(d, c)).filter(Boolean), seen = new Set(), rows = [];
  for (const p of parts) for (const r of p.rows) { const k = `${r.set}|${r.id}`; if (!seen.has(k)) { seen.add(k); rows.push(r); } }
  return [c, { ...parts[0], rows }];
}));
const GOLD = ['operational', 'minimal-pairs', 'knowledge', 'dialogues', 'wrong-tab', 'owner-a', 'typos', 'loose-words', 'paraphrases-rt'];
const NOGOLD = ['owner-b', 'owner-c', 'ledger', 'paraphrases-rt-changed'];
const OUT = ['right', 'wrong', 'asked', 'nu', 'answered'];
const tally = (rows) => { rows = rows.filter((r) => r.outcome !== 'skip'); const t = { n: rows.length, right: 0, wrong: 0, asked: 0, nu: 0, answered: 0 }; for (const r of rows) t[r.outcome] = (t[r.outcome] ?? 0) + 1; return t; };
const pct = (a, n) => (n ? Math.round(1000 * a / n) / 10 : 0);
const sumTally = (rows, sets) => tally(rows.filter((r) => sets.includes(r.set)));

export function summary() {
  const res = {};
  for (const c of configs) {
    const rows = data[c].rows;
    res[c] = { note: data[c].note, wall_ms: data[c].wall_ms, sets: {}, gold_total: sumTally(rows, GOLD), nogold: {} };
    for (const s of [...GOLD, ...NOGOLD, 'operational-ro']) { const rs = rows.filter((r) => r.set === s); if (rs.length) res[c].sets[s] = tally(rs); }
    const lg = {}; for (const r of rows.filter((x) => x.set === 'ledger')) { (lg[r.group] ??= []).push(r); }
    res[c].ledger_groups = Object.fromEntries(Object.entries(lg).map(([g, rs]) => [g, tally(rs)]));
  }
  return res;
}

// ---- rescue classification -------------------------------------------------------------------------------------------------------
function editDistance(a, b, cap = 3) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
let vocab = null, vocabList = null;
async function getVocab() {
  if (vocab) return vocab;
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  vocab = spellVocabulary(engine.set);
  vocabList = [...vocab];
  return vocab;
}
/** typo (a word that is not known but one or two slips from a known word of the same length class), unknown word (not known, no near word), phrasing (every word known). */
export async function classifyText(text) {
  const v = await getVocab();
  const toks = (text.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 2 && !FUNCTION_WORDS.has(w));
  const unknown = toks.filter((w) => !v.has(w) && !v.has(w.replace(/(ing|ed|es|s)$/, '')));
  if (!unknown.length) return /\b(and|then|also|plus|but)\b|[,;]/i.test(text) && toks.length >= 6 ? 'multi-clause' : 'phrasing';
  const near = unknown.filter((w) => vocabList.some((k) => Math.abs(k.length - w.length) <= 2 && editDistance(w, k, w.length >= 7 ? 2 : 1) <= (w.length >= 7 ? 2 : 1)));
  return near.length === unknown.length ? 'typo' : near.length ? 'typo+unknown' : 'unknown word';
}
export async function rescue(a, b, sets = [...GOLD, ...NOGOLD]) {
  const A = new Map(data[a].rows.map((r) => [`${r.set}|${r.id}`, r])), out = [];
  for (const r of data[b].rows) {
    if (!sets.includes(r.set)) continue;
    const o = A.get(`${r.set}|${r.id}`);
    if (!o) continue;
    out.push({ set: r.set, id: r.id, text: r.text, from: o.outcome, to: r.outcome, reply_from: o.reply, reply_to: r.reply, reading: r.reading, world: r.world, group: r.group });
  }
  const good = (o) => o === 'right' || o === 'answered';
  const gained = out.filter((x) => good(x.to) && !good(x.from)), lost = out.filter((x) => good(x.from) && !good(x.to));
  for (const x of [...gained, ...lost]) x.cls = await classifyText(x.text);
  return { a, b, gained, lost };
}

// ---- markdown tables ------------------------------------------------------------------------------------------------------------
function mdTables(res, lat) {
  const cs = Object.keys(res);
  const lines = [];
  for (const s of [...GOLD, 'operational-ro']) {
    if (!cs.some((c) => res[c].sets[s])) continue;
    lines.push(`### ${s} (n=${Object.values(res).find((r) => r.sets[s]).sets[s].n})`, '', '| config | right | wrong | asked | not understood | right % |', '| --- | --- | --- | --- | --- | --- |');
    for (const c of cs) { const t = res[c].sets[s]; if (t) lines.push(`| ${c} | ${t.right} | ${t.wrong} | ${t.asked} | ${t.nu} | ${pct(t.right, t.n)} |`); }
    lines.push('');
  }
  lines.push('### no gold (answered = acted or answered and did not say it did not understand)', '', '| config | owner-b answered / asked / nu | owner-c answered / asked / nu | ledger answered / asked / nu |', '| --- | --- | --- | --- |');
  for (const c of cs) { const f = (s) => { const t = res[c].sets[s]; return t ? `${t.answered} / ${t.asked} / ${t.nu}` : '-'; }; lines.push(`| ${c} | ${f('owner-b')} | ${f('owner-c')} | ${f('ledger')} |`); }
  lines.push('');
  if (lat) {
    lines.push('### time per message (Node, 1 thread, same sample of the sets)', '', '| config | n | mean ms | p50 ms | p95 ms |', '| --- | --- | --- | --- | --- |');
    for (const [c, l] of Object.entries(lat)) lines.push(`| ${c} | ${l.n} | ${l.mean} | ${l.p50} | ${l.p95} |`);
    lines.push('');
  }
  return lines.join('\n');
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
function latencyOf(ld) {
  const out = {};
  if (!ld) return null;
  for (const c of readdirSync(ld).filter((f) => f.endsWith('.latency.json'))) {
    const d = JSON.parse(readFileSync(join(ld, c), 'utf8'));
    const ms = d.rows.map((r) => r.ms).filter((x) => x != null);
    out[d.config] = { n: ms.length, mean: Math.round(ms.reduce((a, b) => a + b, 0) / (ms.length || 1) * 10) / 10, p50: Math.round(q(ms, 0.5) * 10) / 10, p95: Math.round(q(ms, 0.95) * 10) / 10 };
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (arg('rescue')) {
    const [a, b] = arg('rescue').split(':');
    const r = await rescue(a, b);
    const by = {}; for (const x of r.gained) by[x.cls] = (by[x.cls] ?? 0) + 1;
    const byL = {}; for (const x of r.lost) byL[x.cls] = (byL[x.cls] ?? 0) + 1;
    console.log(`${b} vs ${a}: gained ${r.gained.length} ${JSON.stringify(by)}, lost ${r.lost.length} ${JSON.stringify(byL)}`);
    if (process.argv.includes('--list')) for (const x of [...r.gained.map((y) => ({ ...y, d: '+' })), ...r.lost.map((y) => ({ ...y, d: '-' }))]) console.log(`${x.d} [${x.cls}] ${x.set} ${JSON.stringify(x.text)}  ${x.from}->${x.to}  ${x.reading ?? ''}`);
  } else {
    const res = summary();
    const lat = latencyOf(arg('lat') && resolve(arg('lat')));
    const md = mdTables(res, lat);
    if (arg('md')) writeFileSync(resolve(arg('md')), md);
    if (arg('out')) writeFileSync(resolve(arg('out')), JSON.stringify({ summary: res, latency: lat }, null, 1));
    console.log(md);
  }
}
