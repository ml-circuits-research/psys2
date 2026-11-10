#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX7 report: the four NX6 conditions for gated D (over encoder+n1) against the shipped mode and the rules, from training/results/nx5/<file>.json.
//   node scripts/nx7-report.mjs --rules rules-full --base enc-n1-full --d A3-d-full [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const load = (n) => JSON.parse(readFileSync(join(REPO, 'training/results/nx5', n + '.json'), 'utf8')).rows;
const R = load(arg('rules', 'rules-full')), B = load(arg('base', 'enc-n1-full')), D = load(arg('d', 'A3-d-full'));
const key = (r, i) => `${r.set}|${r.id ?? i}`;
const idx = (rows) => new Map(rows.map((r, i) => [key(r, i), r]));
const Ri = idx(R), Bi = idx(B), Di = idx(D);
const ok = (r) => r.outcome === 'right' || r.outcome === 'correct';
const bad = (r) => r.outcome === 'wrong' || r.outcome === 'partly' || r.outcome === 'act-right-args-wrong';
const pct = (a, n) => (n ? 100 * a / n : 0);
const f1 = (x) => x.toFixed(1);
const rowsOf = (sets, rows) => rows.filter((r) => sets.includes(r.set) && r.kind !== 'dlg');
const out = { conditions: {} };
const md = [];
// condition 2 and Romanian: right / partly / wrong counts
const cnt = (rows) => ({ n: rows.length, right: rows.filter(ok).length, partly: rows.filter((r) => r.outcome === 'partly').length, wrong: rows.filter((r) => r.outcome === 'wrong').length, nu: rows.filter((r) => r.outcome === 'not_understood').length });
const line = (name, sets) => {
  const c = ['rules', 'base', 'D'].map((s) => cnt(rowsOf(sets, { rules: R, base: B, D }[s])));
  out.conditions[name] = { rules: c[0], base: c[1], D: c[2] };
  md.push(`| ${name} | ${c[0].n} | ${c.map((x) => `${x.right} / ${x.partly} / ${x.wrong} / ${x.nu} (${f1(pct(x.right, x.n))}% right, ${f1(pct(x.wrong, x.n))}% wrong)`).join(' | ')} |`);
  return c;
};
md.push('Outcomes of the operational sets and Romanian: right / partly / wrong / not understood.\n');
md.push('| set | n | rules | encoder+n1 (shipped) | D (gated) |\n| --- | --- | --- | --- | --- |');
const op = line('operational', ['operational']);
const lg = line('operational-long', ['operational-long']);
const both = line('operational + long', ['operational', 'operational-long']);
const ro = line('operational-ro', ['operational-ro']);
md.push('');
// dialogues
const dl = (rows) => { const d = rows.filter((r) => r.kind === 'dlg'); const t = d.flatMap((r) => r.turns); const c = (o) => t.filter((x) => x.outcome === o).length; return { dialogues: d.length, dialoguesRight: d.filter((r) => r.right).length, turns: t.length, right: c('right'), partly: c('partly'), wrong: c('wrong'), nu: c('not_understood') }; };
const dls = { rules: dl(R), base: dl(B), D: dl(D) };
out.conditions.dialogues = dls;
md.push('Dialogues (turns): right / partly / wrong / not understood.\n');
md.push('| | rules | encoder+n1 | D |\n| --- | --- | --- | --- |');
md.push(`| turns (${dls.base.turns}) | ${['rules', 'base', 'D'].map((s) => { const x = dls[s]; return `${x.right} / ${x.partly} / ${x.wrong} / ${x.nu} (${f1(pct(x.right, x.turns))}% right, ${f1(pct(x.wrong, x.turns))}% wrong)`; }).join(' | ')} |`);
md.push(`| dialogues right (${dls.base.dialogues}) | ${['rules', 'base', 'D'].map((s) => `${dls[s].dialoguesRight} (${f1(pct(dls[s].dialoguesRight, dls[s].dialogues))}%)`).join(' | ')} |`);
md.push('');
// condition 1: sets where the rules fail
md.push('Condition 1, the sets where the rules fail: right under rules / shipped / D (and points of D over rules and over the shipped mode).\n');
md.push('| subset | n | rules | shipped | D | D - rules | D - shipped |\n| --- | --- | --- | --- | --- | --- | --- |');
const subset = (name, pick) => {
  const keys = pick();
  const c = (m) => keys.filter((k) => m.get(k) && ok(m.get(k))).length;
  const r = c(Ri), b = c(Bi), d = c(Di), n = keys.length;
  out.conditions[name] = { n, rules: r, base: b, D: d };
  md.push(`| ${name} | ${n} | ${r} (${f1(pct(r, n))}%) | ${b} (${f1(pct(b, n))}%) | ${d} (${f1(pct(d, n))}%) | ${f1(pct(d - r, n))} | ${f1(pct(d - b, n))} |`);
};
const keysOf = (pred) => [...Ri.keys()].filter((k) => pred(Ri.get(k)));
subset('operational + long cases not right with the rules', () => keysOf((r) => (r.set === 'operational' || r.set === 'operational-long') && !ok(r)));
subset('operational + long cases not right with the shipped mode', () => [...Bi.keys()].filter((k) => (Bi.get(k).set === 'operational' || Bi.get(k).set === 'operational-long') && !ok(Bi.get(k))));
subset('operational-ro cases not right with the rules', () => keysOf((r) => r.set === 'operational-ro' && !ok(r)));
subset('gold-para (rules-fail / rules-differ paraphrases)', () => keysOf((r) => r.set === 'gold-para'));
subset('nxtest-rules-fail (dev + test)', () => keysOf((r) => r.set === 'nxtest-rules-fail'));
subset('nxtest-rules-fail, test split only', () => keysOf((r) => r.set === 'nxtest-rules-fail' && r.split === 'test'));
subset('gold-para + nxtest-rules-fail (test split)', () => keysOf((r) => r.set === 'gold-para' || (r.set === 'nxtest-rules-fail' && r.split === 'test')));
for (const s of ['real-09c', 'real-09d', 'real-09e']) subset(`${s}, world judged (world-correct)`, () => keysOf((r) => r.set === s && r.outcome !== 'answered-unjudged'));
const mob = (rows) => ({ answered: rows.filter((r) => r.set === 'mobile' && r.outcome === 'answered').length, agree: rows.filter((r) => r.set === 'mobile' && r.agrees).length, of: rows.filter((r) => r.set === 'mobile' && r.agrees !== null && r.agrees !== undefined).length });
out.conditions.mobile = { rules: mob(R), base: mob(B), D: mob(D) };
md.push(`| mobile export: answered of 108 (world agrees with the logged reading) | 108 | ${['rules', 'base', 'D'].map((s) => { const m = out.conditions.mobile[s]; return `${m.answered} (${m.agree}/${m.of})`; }).join(' | ')} | | |`);
md.push('');
// transitions on operational + long, D against shipped
const trans = {};
for (const [k, b] of Bi) { const d = Di.get(k); if (!d || b.kind === 'dlg') continue; const t = `${ok(b) ? 'right' : b.outcome === 'partly' ? 'partly' : b.outcome === 'wrong' ? 'wrong' : 'nu'}->${ok(d) ? 'right' : d.outcome === 'partly' ? 'partly' : d.outcome === 'wrong' ? 'wrong' : 'nu'}`; if (!t.split('->').every((x, i, a) => a[0] === a[1])) { (trans[b.set] ??= {})[t] = (trans[b.set][t] ?? 0) + 1; } }
out.transitions = trans;
md.push('Items whose outcome differs between the shipped mode and D (counts per set and transition):\n');
for (const [s, t] of Object.entries(trans)) md.push(`- ${s}: ${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(', ')}`);
md.push('');
// verdict on the four conditions
const pp = (a, b, n) => pct(a - b, n);
const c2 = pp(both[2].wrong, both[1].wrong, both[1].n);
const c3d = { right: pp(dls.D.right, dls.base.right, dls.base.turns), wrong: pp(dls.D.wrong, dls.base.wrong, dls.base.turns) };
const c3r = { right: pp(ro[2].right, ro[1].right, ro[1].n), wrong: pp(ro[2].wrong, ro[1].wrong, ro[1].n) };
out.verdict = { c2WrongPoints: c2, c3Dialogues: c3d, c3Romanian: c3r };
md.push(`Condition 2 (operational + long, wrong points of D over the shipped mode, limit +0.2): ${c2 >= 0 ? '+' : ''}${c2.toFixed(2)}.`);
md.push(`Condition 3 dialogues turns (limit right -0.5, wrong +0.2): right ${c3d.right.toFixed(2)}, wrong ${c3d.wrong >= 0 ? '+' : ''}${c3d.wrong.toFixed(2)}. Romanian: right ${c3r.right.toFixed(2)}, wrong ${c3r.wrong >= 0 ? '+' : ''}${c3r.wrong.toFixed(2)}.`);
if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify(out, null, 1));
console.log(md.join('\n'));
