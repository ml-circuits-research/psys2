#!/usr/bin/env node
/**
 * NX3b report: training/results/nx3b-generation.json (per world counts before/after, gate, agreement, judge rates per world, audit, $ per stage).
 *   node scripts/nx3b-report.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '');
const D = MAIN + 'training/dataset/nx/';
const G = D + 'gen2/';
const rj = (f, d = null) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

const ledger = jl(G + 'ledger.jsonl'); const stages = {};
for (const l of ledger) { const s = (stages[l.stage] ??= { usd: 0, tokens: 0, seconds: 0, items: 0, sessions: 0 }); s.usd += l.est_usd ?? 0; s.tokens += l.tokens ?? 0; s.seconds += (l.ms ?? 0) / 1000; s.items += l.items ?? 0; s.sessions += l.sessions ?? 1; }
const total = Object.values(stages).reduce((a, s) => a + s.usd, 0);

// per-item verdicts: per world rates for the disagreed items and the audit sample
const key = rj(G + 'judge/key.json', {}); const rec = new Map();
for (const f of readdirSync(G + 'disagreed').filter((x) => x.endsWith('.jsonl'))) for (const r of jl(G + 'disagreed/' + f)) rec.set(r.id, r);
for (const f of readdirSync(G + 'agreed').filter((x) => x.endsWith('.jsonl'))) for (const r of jl(G + 'agreed/' + f)) rec.set(r.id, r);
const jw = {}; const reasons = new Set(); let n = 0;
for (const [call, rows] of Object.entries(key)) {
  const arr = rj(`${G}judge/out/${call}.json`); if (!Array.isArray(arr)) continue;
  rows.forEach((r, i) => {
    const a = arr.find((x) => x.k === i + 1); const w = rec.get(r.id)?.world; if (!a || !w) return;
    const c = ((jw[w] ??= {})[r.kind] ??= { n: 0, accept: 0, fix: 0, reject: 0 }); c.n++; c[a.verdict]++; reasons.add(a.reason); n++;
  });
}
for (const w of Object.keys(jw)) for (const k of Object.keys(jw[w])) { const c = jw[w][k]; c.fix_rate = +(c.fix / c.n).toFixed(4); c.reject_rate = +(c.reject / c.n).toFixed(4); }

const nx3 = rj(REPO + 'training/results/nx3-generation.json').per_world; const fin = rj(G + 'finalize-report.json'); const gate = rj(G + 'gate-report.json'); const agree = rj(G + 'agree-report.json');
const filt = rj(REPO + 'training/results/nx3b-filter.json');
const per_world = {};
for (const w of Object.keys(nx3)) {
  per_world[w] = {
    nx3_final: nx3[w].final, nx3b_final: fin.worlds[w]?.final ?? 0, nx3_plus_nx3b: nx3[w].final + (fin.worlds[w]?.final ?? 0),
    after_filter: (filt['final29-filtered'].per_world[w]?.n ?? 0) + (filt['final2-filtered'].per_world[w]?.n ?? 0),
    gate: gate.worlds[w], agree: agree.worlds[w], finalize: fin.worlds[w], judge: jw[w] ?? null,
  };
}
const rep = {
  budget_usd: '17-20', est_total_usd: Math.round(total * 100) / 100, pricing_note: 'estimated from subagent session tokens at a blended $5 per million tokens (Sonnet 5.5); the real bill is not visible without an API key',
  stages, gate_drops_by_reason: gate.reasons ?? {}, rules_agreement: { agreed: agree.agreed, disagreed: agree.disagreed, why: agree.why },
  judge: fin.judge, judge_accept_rate: fin.judge_accept_rate, audit_error_rate: fin.audit_error_rate, invalid_verdicts: fin.invalid_verdicts,
  distinct_reasons: reasons.size, judged_items: n, protected_dropped: fin.protected_dropped, totals: { nx3: Object.values(nx3).reduce((a, x) => a + x.final, 0), nx3b: fin.totals.final, training_after_filter: { nx3: filt['final29-filtered'].out, nx3b: filt['final2-filtered'].out } }, per_world,
};
writeFileSync(REPO + 'training/results/nx3b-generation.json', JSON.stringify(rep, null, 1));
console.log(JSON.stringify({ est_total_usd: rep.est_total_usd, totals: rep.totals, distinct_reasons: reasons.size }));
