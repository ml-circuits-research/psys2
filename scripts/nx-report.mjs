#!/usr/bin/env node
/**
 * NX3 report: training/results/nx3-generation.json from the data dir's reports and ledger, and a 200-item sample
 * (training/nx/sample-200.jsonl, round-robin over worlds from the final records).
 *   node scripts/nx-report.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '');
const G = MAIN + 'training/dataset/nx/gen';
const rj = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const ledger = existsSync(G + '/ledger.jsonl') ? jl(G + '/ledger.jsonl') : [];
const stages = {};
for (const l of ledger) { const s = (stages[l.stage] ??= { usd: 0, tokens: 0, seconds: 0, items: 0, sessions: 0 }); s.usd += l.est_usd ?? 0; s.tokens += l.tokens ?? 0; s.seconds += (l.ms ?? 0) / 1000; s.items += l.items ?? 0; s.sessions++; }
const gate = rj(G + '/gate-report.json', {}); const agree = rj(G + '/agree-report.json', {}); const fin = rj(G + '/finalize-report.json', {});
const finalDir = MAIN + 'training/dataset/nx/final';
const final = existsSync(finalDir) ? readdirSync(finalDir).filter((f) => f.endsWith('.jsonl')).map((f) => [f.replace('.jsonl', ''), jl(`${finalDir}/${f}`)]) : [];
const totalUsd = Object.values(stages).reduce((a, s) => a + s.usd, 0);
const per_world = {};
for (const [w, recs] of final) { const sp = {}; for (const r of recs) sp[r.split] = (sp[r.split] ?? 0) + 1; per_world[w] = { final: recs.length, splits: sp, gate: gate.worlds?.[w] ?? null, agree: agree.worlds?.[w] ?? null, judged: fin.worlds?.[w] ?? null }; }
const rep = {
  budget_usd_cap: 60, est_total_usd: Math.round(totalUsd * 100) / 100, pricing_note: 'estimated from subagent session tokens at a blended $5 per million tokens (Sonnet 5.5); the real bill is not visible without an API key',
  stages, gate_drops_by_reason: gate.reasons ?? {}, rules_agreement: { agreed: agree.agreed, disagreed: agree.disagreed, why: agree.why },
  judge: fin.judge ?? null, judge_accept_rate: fin.judge_accept_rate ?? null, audit_error_rate: fin.audit_error_rate ?? null,
  totals: fin.totals ?? null, per_world,
};
writeFileSync(REPO + 'training/results/nx3-generation.json', JSON.stringify(rep, null, 1));
// 200-item sample, round-robin over worlds, deterministic
const lists = final.map(([, r]) => r.slice().sort((a, b) => (createHash('sha256').update(a.id).digest('hex') < createHash('sha256').update(b.id).digest('hex') ? -1 : 1)));
const sample = [];
for (let i = 0; sample.length < 200 && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && sample.length < 200) sample.push(l[i]);
writeFileSync(REPO + 'training/nx/sample-200.jsonl', sample.map((x) => JSON.stringify(x)).join('\n') + '\n');
console.log(JSON.stringify({ est_total_usd: rep.est_total_usd, totals: rep.totals, sample: sample.length }));
