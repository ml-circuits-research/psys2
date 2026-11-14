// The REAL Romanian turns under four chains (rules only; rules + grammar voice; Bergamot MT; MT + voice), from the result files of `scripts/real-set.mjs run --tag -<name>`.
//   node scripts/real-ro-compare.mjs [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { tableOf, failureRows, realCause } from './real-set.mjs';
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const set = jl('training/eval/real-2026-11-15.jsonl');
const ro = set.filter((r) => r.lang === 'ro'), en = set.filter((r) => r.lang !== 'ro');
const variants = ['rules', 'voice', 'mt', 'mtvoice'];
const res = Object.fromEntries(variants.map((v) => [v, JSON.parse(readFileSync(`training/results/real-2026-11-15-matrix-${v}.json`, 'utf8'))]));
const out = {};
for (const v of variants) {
  const t = tableOf(ro, res[v]), te = tableOf(en, res[v]);
  const fails = failureRows(ro, res[v], v);
  const causes = {}; for (const f of fails) { const c = realCause(f); causes[c] = (causes[c] ?? 0) + 1; }
  out[v] = { ro: { turns: t.turns, judged: t.judged, right: t.right, partly: t.partly, wrong: t.wrong, open: t.open, outcome: t.outcome, failing: fails.length }, en: { turns: te.turns, judged: te.judged, right: te.right, failing: failureRows(en, res[v], v).length }, ro_causes: causes };
  console.log(`${v.padEnd(8)} RO turns ${t.turns}: judged ${t.judged} (right ${t.right}, partly ${t.partly}, wrong ${t.wrong}); outcomes ${JSON.stringify(t.outcome)}; failing ${fails.length}   | EN judged ${te.judged} right ${te.right} failing ${out[v].en.failing}`);
}
// per turn: what changed between the chains on the Romanian turns
const by = (v) => new Map(res[v].rows.map((x) => [x.id, x]));
const m = Object.fromEntries(variants.map((v) => [v, by(v)]));
const flips = (a, b) => { let better = 0, worse = 0; const ex = []; for (const r of ro) { const x = m[a].get(r.id), y = m[b].get(r.id); if (!x || !y) continue; const sc = (z) => (z.verdict === 'right' ? 2 : z.verdict === 'partly' ? 1 : z.verdict === 'wrong' ? 0 : z.outcome === 'executed' ? 1.5 : z.outcome === 'asked' ? 0.7 : z.outcome === 'refused' ? 0.5 : 0); const d = sc(y) - sc(x); if (d > 0) { better++; if (ex.length < 4) ex.push(`${r.text} -> ${y.outcome}/${y.verdict ?? ''}`); } else if (d < 0) worse++; } return { better, worse, ex }; };
for (const [a, b] of [['rules', 'mt'], ['rules', 'voice'], ['mt', 'mtvoice']]) { const f = flips(a, b); console.log(`${a} -> ${b}: better ${f.better}, worse ${f.worse}`, f.ex.join(' | ')); out[`${a}->${b}`] = f; }
if (process.argv.includes('--json')) writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(out, null, 1));
