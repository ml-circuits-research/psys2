#!/usr/bin/env node
/**
 * NX3b training sets: the protected-text filter applied to the generated records.
 *   node scripts/nx3b-filter.mjs
 * Reads dataset/nx/final/*.jsonl (NX3, 29,111 records) and dataset/nx/final2/*.jsonl (NX3b) and writes
 *   dataset/nx/final29-filtered/   NX3 without the records whose normalised text (or message) equals a protected evaluation text
 *   dataset/nx/final2-filtered/    NX3b, same filter
 * Dropped: every string of the protected sets (training/eval real-phrases, expectations, operational*, dialogues, loose words, ...)
 * plus the texts of the gold set (training/nx/gold/pilot-300.jsonl) and of the NX records of the dev/test splits (free-rules), so the
 * sets of the NX7 evaluation stay clean. Duplicate texts inside one world are kept once (the first record).
 * Counts go to training/results/nx3b-filter.json.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '');
const DATA = MAIN + 'training/dataset/nx/';
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const files = (d) => (existsSync(d) ? readdirSync(d).filter((x) => x.endsWith('.jsonl')) : []);

const prot = new Set();
for (const f of files(REPO + 'training/eval')) for (const r of jl(REPO + 'training/eval/' + f)) {
  for (const k of ['message', 'text', 'english']) if (r[k]) prot.add(norm(r[k]));
  for (const t of r.turns ?? []) prot.add(norm(t.message));
}
const evalSet = new Set();
for (const r of jl(REPO + 'training/nx/gold/pilot-300.jsonl')) evalSet.add(norm(r.text));
for (const r of jl(DATA + 'free-rules.jsonl')) if (r.split !== 'train') { evalSet.add(norm(r.text)); evalSet.add(norm(r.message)); }

const rep = {};
for (const [src, dst] of [['final', 'final29-filtered'], ['final2', 'final2-filtered']]) {
  mkdirSync(DATA + dst, { recursive: true });
  const seen = new Set(); // across rounds: NX3b never repeats an NX3 text (the second round is processed after the first)
  rep[dst] = { in: 0, out: 0, protected: 0, eval_texts: 0, duplicate: 0, per_world: {} };
  for (const f of files(DATA + src)) {
    const w = f.replace('.jsonl', ''); const keep = [];
    for (const r of jl(DATA + src + '/' + f)) {
      rep[dst].in++;
      const t = norm(r.text), m = norm(r.message);
      if (prot.has(t) || prot.has(m)) { rep[dst].protected++; continue; }
      if (evalSet.has(t) || evalSet.has(m)) { rep[dst].eval_texts++; continue; }
      const k = w + '|' + t + '|' + (r.context?.prev ?? []).join('/') + '|' + r.op;
      if (seen.has(k)) { rep[dst].duplicate++; continue; }
      seen.add(k); keep.push(r);
    }
    writeFileSync(`${DATA}${dst}/${w}.jsonl`, keep.map((x) => JSON.stringify(x)).join('\n') + (keep.length ? '\n' : ''));
    const sp = {}; for (const r of keep) sp[r.split] = (sp[r.split] ?? 0) + 1;
    rep[dst].out += keep.length; rep[dst].per_world[w] = { n: keep.length, ...sp };
  }
}
writeFileSync(REPO + 'training/results/nx3b-filter.json', JSON.stringify(rep, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, { in: v.in, out: v.out, protected: v.protected, eval_texts: v.eval_texts, duplicate: v.duplicate }]))));
