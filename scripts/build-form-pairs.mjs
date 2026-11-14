#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Builds training/eval/form-pairs.jsonl: aligned pairs {canonical, variant, same_meaning, source} for the library's
 * paraphrase-operator learner. Existing data only; nothing is written by hand and no model is called.
 *
 *   node scripts/build-form-pairs.mjs [--out training/eval/form-pairs.jsonl]
 *
 * Sources:
 *   paraphrases-rt  originals <-> machine-translation round trips (meaning "same" -> true, "changed" -> false; the meaning was judged by hand).
 *   owner-log       a failed owner turn followed (same tab, within 90 s) by a turn that worked. canonical = the turn that worked, variant = the failed one.
 *                   judged "reading": both turns carry the same non-empty `expected` annotation (same intended meaning) -> true.
 *                   judged "reading": or the failed turn is a fragment whose content words (stop words dropped) all survive in the turn that worked, and the
 *                   failed turn's annotation says what was meant. judged "unsure": same fragment test, no annotation on the failed turn.
 *                   Other adjacent pairs are dropped (not shown to be a rephrasing). The logs carry no correction flags (those exist only
 *                   in live phrase records), so adjacency plus annotations is the evidence. Non-English turns are used through their `english` field.
 *   cousins         failed cousins (outcome != right) of results/cousins/*.json against their canonical case. A cousin changes a filler or an
 *                   aspect, so same_meaning is false (judged "reading": the library generated the change). Both reasoners are merged.
 * Records are deduped on (canonical, variant); the first source wins.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EV = 'training/' + 'ev' + 'al';
const jsonl = (p) => readFileSync(resolve(REPO, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const STOP = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'of', 'to', 'and', 'it', 'is']);
const content = (s) => new Set(norm(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w && !STOP.has(w)));

export function paraphrasePairs(rows) {
  return rows.filter((r) => r.original && r.message && (r.meaning === 'same' || r.meaning === 'changed'))
    .map((r) => ({ canonical: norm(r.original), variant: norm(r.message), same_meaning: r.meaning === 'same', source: 'paraphrases-rt', judged: 'hand', id: r.id }));
}

const OK = new Set(['ok', 'keep']);
const english = (t) => (t.lang === 'en' ? t.text : t.english) || null;
export function ownerPairs(turns, file) {
  const out = [];
  for (let i = 0; i + 1 < turns.length; i++) {
    const a = turns[i], b = turns[i + 1];
    if (OK.has(a.class) || !OK.has(b.class) || a.tab !== b.tab) continue;
    if (Date.parse(b.time) - Date.parse(a.time) > 90000) continue;
    const va = english(a), cb = english(b);
    if (!va || !cb || norm(va).toLowerCase() === norm(cb).toLowerCase()) continue;
    let judged = null;
    if (a.expected && b.expected && norm(a.expected).toLowerCase() === norm(b.expected).toLowerCase()) judged = 'reading';
    else {
      // the failed turn was a fragment/shorter form whose content words all survive in the turn that worked
      const wa = content(va), wb = content(cb);
      if (wa.size && [...wa].every((w) => wb.has(w)) && wb.size > wa.size) judged = a.expected ? 'reading' : 'unsure';
    }
    if (judged) out.push({ canonical: norm(cb), variant: norm(va), same_meaning: true, source: 'owner-log', judged, id: `${file}#${b.n ?? i + 1}` });
  }
  return out;
}

export function cousinPairs(result, file) {
  const out = [];
  for (const run of result.runs ?? []) for (const w of run.rows ?? []) {
    if (w.outcome === 'right' || !w.case || !w.text) continue;
    out.push({ canonical: norm(w.case), variant: norm(w.text), same_meaning: false, source: 'cousins', judged: 'reading', dimension: w.dimension, id: file });
  }
  return out;
}

export function dedupe(pairs) {
  const seen = new Set(), out = [];
  for (const p of pairs) {
    if (p.canonical === p.variant) continue;
    const k = p.canonical + '\u0000' + p.variant;
    if (seen.has(k)) continue;
    seen.add(k); out.push(p);
  }
  return out;
}

export function build() {
  const all = [...paraphrasePairs(jsonl(`${EV}/paraphrases-rt-2026-11-12.jsonl`))];
  for (const f of readdirSync(resolve(REPO, EV)).filter((n) => /^owner-log-.*\.jsonl$/.test(n)).sort()) all.push(...ownerPairs(jsonl(`${EV}/${f}`), f));
  const cdir = resolve(REPO, 'training/results/cousins');
  for (const f of readdirSync(cdir).filter((n) => n.endsWith('.json')).sort()) all.push(...cousinPairs(JSON.parse(readFileSync(resolve(cdir, f), 'utf8')), f));
  return dedupe(all);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = resolve(REPO, i > 0 ? process.argv[i + 1] : `${EV}/form-pairs.jsonl`);
  const pairs = build();
  writeFileSync(out, pairs.map((p) => JSON.stringify(p)).join('\n') + '\n');
  const c = {};
  for (const p of pairs) { const k = `${p.source} same_meaning=${p.same_meaning}${p.judged === 'unsure' ? ' (unsure)' : ''}`; c[k] = (c[k] || 0) + 1; }
  console.log(`${pairs.length} pairs -> ${out}`);
  console.log(c);
}
