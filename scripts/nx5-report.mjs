#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX5 report: merges training/results/nx5/<system>.json (scripts/eval-nx.mjs) into correct / wrong / abstain tables per set and per world.
//   node scripts/nx5-report.mjs [--systems rules,A-only,...] [--md out.md] [--json training/results/nx5-summary.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SYSTEMS = (arg('systems', 'rules,A-only,Aplus-only,A-first,Aplus-first,A-hybrid,Aplus-hybrid')).split(',').filter((s) => existsSync(join(REPO, 'training/results/nx5', `${s}.json`)));
const data = Object.fromEntries(SYSTEMS.map((s) => [s, JSON.parse(readFileSync(join(REPO, 'training/results/nx5', `${s}.json`), 'utf8'))]));

/** Outcome class of a row: c(orrect), w(rong), a(bstain), p(artly), u (answered, not judged). */
const cls = (r) => {
  if (r.kind === 'dlg') return null;
  const o = r.outcome;
  if (o === 'right' || o === 'correct') return 'c';
  if (o === 'partly') return 'p';
  if (o === 'abstain' || o === 'not_understood') return 'a';
  if (o === 'answered-unjudged' || o === 'answered') return 'u';
  return 'w';   // wrong, act-right-args-wrong
};
const tally = (rows) => { const t = { n: rows.length, c: 0, w: 0, a: 0, p: 0, u: 0 }; for (const r of rows) { const k = cls(r); if (k) t[k]++; } return t; };
const pct = (a, n) => (n ? `${(100 * a / n).toFixed(1)}` : '-');
const cell = (t) => `${t.c} / ${t.w + t.p} / ${t.a}${t.u ? ` (+${t.u} unjudged)` : ''} (${pct(t.c, t.n)}%)`;

const sets = [...new Set(Object.values(data).flatMap((d) => d.rows.map((r) => r.set)))];
const group = (s) => (s.startsWith('diagram/') ? 'diagram bench' : s);
const bench = (rows) => rows;
const out = { systems: SYSTEMS, sets: {}, dialogues: {}, perWorld: {}, nxStats: {} };
const md = [];
const header = (cols) => `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |`;

// ---- per set -------------------------------------------------------------------------------------------------------------------------
const groups = [...new Set(sets.map(group))];
md.push('Cells are `correct / wrong (partly counted as wrong) / abstain (correct %)`. n = items of the set.');
md.push('');
md.push(header(['set', 'n', ...SYSTEMS]));
for (const g of groups.filter((x) => x !== 'dialogues' && x !== 'mobile')) {
  const row = [g];
  let n = 0;
  for (const s of SYSTEMS) {
    const rows = data[s].rows.filter((r) => group(r.set) === g);
    n = rows.length; const t = tally(rows);
    (out.sets[g] ??= {})[s] = t;
    row.push(cell(t));
  }
  md.push(`| ${g} | ${n} | ${row.slice(1).join(' | ')} |`);
}
md.push('');
// ---- partly (operational: omissions) ---------------------------------------------------------------------------------------------------
md.push('Operational sets: `partly` = the answer executed some but not all expected items (omission). Counted as wrong above; split here.');
md.push('');
md.push(header(['set', ...SYSTEMS]));
for (const g of ['operational', 'operational-long']) md.push(`| ${g} | ${SYSTEMS.map((s) => { const t = tally(data[s].rows.filter((r) => r.set === g)); return `R ${t.c} / P ${t.p} / W ${t.w} / NU ${t.a}`; }).join(' | ')} |`);
md.push('');
// ---- dialogues ---------------------------------------------------------------------------------------------------------------------------
md.push('Dialogues (449 dialogues): turns right / turns wrong / turns not understood, dialogues right.');
md.push('');
md.push(header(['', ...SYSTEMS]));
const dl = (s) => { const rows = data[s].rows.filter((r) => r.kind === 'dlg'); const turns = rows.flatMap((r) => r.turns); const c = (o) => turns.filter((t) => t.outcome === o).length; return { dialogues: rows.length, dialoguesRight: rows.filter((r) => r.right).length, turns: turns.length, right: c('right'), partly: c('partly'), wrong: c('wrong'), nu: c('not_understood') }; };
for (const s of SYSTEMS) out.dialogues[s] = dl(s);
md.push(`| turns | ${SYSTEMS.map((s) => { const d = out.dialogues[s]; return `${d.right} / ${d.wrong + d.partly} / ${d.nu} (${pct(d.right, d.turns)}%)`; }).join(' | ')} |`);
md.push(`| dialogues right | ${SYSTEMS.map((s) => { const d = out.dialogues[s]; return `${d.dialoguesRight}/${d.dialogues} (${pct(d.dialoguesRight, d.dialogues)}%)`; }).join(' | ')} |`);
md.push('');
// ---- mobile ------------------------------------------------------------------------------------------------------------------------------
md.push('Mobile export (108 Romanian voice fragments, English as logged): answered / abstained, and world agreement with the logged rules reading where that was supported (18).');
md.push('');
md.push(header(['', ...SYSTEMS]));
md.push(`| answered / abstained | ${SYSTEMS.map((s) => { const r = data[s].rows.filter((x) => x.set === 'mobile'); return `${r.filter((x) => x.outcome === 'answered').length} / ${r.filter((x) => x.outcome === 'abstain').length}`; }).join(' | ')} |`);
md.push(`| world agrees on the 18 supported | ${SYSTEMS.map((s) => { const r = data[s].rows.filter((x) => x.set === 'mobile' && x.agrees !== null && x.agrees !== undefined); return `${r.filter((x) => x.agrees).length}/${r.length}`; }).join(' | ')} |`);
md.push('');
// ---- per world (operational + long + dialogues turns) -----------------------------------------------------------------------------------
const worlds = [...new Set(Object.values(data)[0].rows.filter((r) => r.set === 'operational').map((r) => r.world))].sort();
md.push('Operational set (1,296) by world: right % (n).');
md.push('');
md.push(header(['world', 'n', ...SYSTEMS]));
for (const w of worlds) {
  const base = data[SYSTEMS[0]].rows.filter((r) => r.set === 'operational' && r.world === w);
  const cells = SYSTEMS.map((s) => { const t = tally(data[s].rows.filter((r) => r.set === 'operational' && r.world === w)); (out.perWorld[w] ??= {})[s] = t; return pct(t.c, t.n); });
  md.push(`| ${w} | ${base.length} | ${cells.join(' | ')} |`);
}
md.push('');
// ---- per world, record level sets ------------------------------------------------------------------------------------------------------
const recSets = ['gold-rules', 'gold-para', 'gold-real', 'nxtest-rules-fail', 'nxtest-gen-disagrees', 'nxtest-sample'];
const recWorlds = [...new Set(Object.values(data)[0].rows.filter((r) => recSets.includes(r.set)).map((r) => r.world))].sort();
md.push('All record-level sets together (gold-300, nxtest) by world: correct % (n).');
md.push('');
md.push(header(['world', 'n', ...SYSTEMS]));
for (const w of recWorlds) {
  const base = data[SYSTEMS[0]].rows.filter((r) => recSets.includes(r.set) && r.world === w);
  md.push(`| ${w} | ${base.length} | ${SYSTEMS.map((s) => { const t = tally(data[s].rows.filter((r) => recSets.includes(r.set) && r.world === w)); return pct(t.c, t.n); }).join(' | ')} |`);
}
md.push('');
// ---- how the model readings were obtained ------------------------------------------------------------------------------------------------
md.push('How readings were obtained (counters summed over workers is not available: maximum of one worker\'s cumulative counters, scaled relative between systems): see json `nxStats`.');
for (const s of SYSTEMS) out.nxStats[s] = data[s].nxStatsMaxPerWorker;

writeFileSync(resolve(arg('json', join(REPO, 'training/results/nx5-summary.json'))), JSON.stringify(out, null, 1));
if (arg('md')) writeFileSync(resolve(arg('md')), md.join('\n') + '\n');
console.log(md.join('\n'));
