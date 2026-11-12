#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * READER-ROUTE (spec 16 section 7): report of the measurement. Reads the files `scripts/e1-collect.mjs` wrote for the reader off and on and compares them case by case.
 *
 *   node scripts/e1-collect.mjs --mode rules --out <dir>/r-off.json                      (rules, reader off)
 *   node scripts/e1-collect.mjs --mode rules --reader fill   --out <dir>/r-fill.json
 *   node scripts/e1-collect.mjs --mode rules --reader choose --out <dir>/r-choose.json
 *   (encoder+n1: --mode encoder+n1 --ort <onnxruntime-node entry>, files e-off.json, e-fill.json, e-choose.json)
 *   node scripts/reader-route-report.mjs --dir <dir> --out training/results/reader-route-2026-11-12 [--e2 <e2 json>]
 *
 * Writes <out>.json and <out>.md: the coverage of `means` per world (0.12 behaviour against the reader worlds), right / wrong / not understood per set for every run,
 * the transitions against off, and every case that changed with what the reader read.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { readerCoverage } from '../src/dialog/reader-route.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const DIR = arg('dir', '.');
const OUT = arg('out', 'training/results/reader-route-2026-11-12');
const cap = (s, n = 110) => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, n);
const NOTES = '## Reading of the results (written by hand; the numbers are above and in the JSON)\n\n- **Gate.** No right or not-understood case became a wrong answer through a reader reading, except one label mismatch: gold-real `on the new chapter` (docs.editor, voice garble of "add a new chapter"). The reader reads it as the description `addRoleBare` ("new" is a verb word of it), emits `doc.addHeading arg.role=chapter` and the reply is "OK, I started chapter 1.", the same reply the rules give to "add a new chapter"; the gold label says op `doc.newBlank`, so the checker counts it wrong. Listed as a new wrong answer, as the gate asks.\n- **Gains** (rules / encoder+n1): `fill` 4 / 2 not understood to right (typos of geo.map `show` and the word `show` itself: "shw me Pariss", "Snow me Bucharest", "Show me Hyderabadd", "Show me Mins"); `choose` one more in rules (a kids.shop typo). gold-para (class b): the reader has candidates for all 14 messages of described worlds and accepts none (the paraphrases use words the descriptions do not have); loose-words (class e): it accepts none of the 105 and finds 8 ambiguous (the best-effort reader stays the source for loose words); the Romanian operational set: no change (160 of 2,480 clauses reach the reader\'s `choose`, none is taken: the rules\' reading is as good or the library ties).\n- **Why so little.** Only three worlds have a `describe.sop` (kids.shop, geo.map, docs.editor: 1,500 of about 8,400 messages) and the reader reads only the world the user is in. It is the descriptions that limit it, not the reader: the coverage of `means` is complete (table above). More descriptions (DESCRIBE-ALL) widen it without code.\n- **What the first measurements taught** (section 7.4): reading every world gave 56 new wrong answers (38 not understood and 18 right turned wrong; `choose` 28 more right ones) (free-text arguments such as `doc.setTitle`, readings of a world nobody was in, "moved" read as "money"); each rule of the policy removed a named group; the policy is the result, not a tuning to the sets.\n- **E2 on top.** The reader\'s readings add exactly the same changes with the world-aware `choose` on (rules 4 right, 1 label mismatch; encoder+n1 2 right, 1 label mismatch). The library\'s split candidates are read (the \'split\' column of `reader-route-2026-11-12-splits.json`: 2 + 6 + 3 readings of compound messages in the operational sets and typos are splits), and a split is taken only when every frame reads; none of the changed cases above is a split.\n- **Library item** (for `worker-log.md`): `interpret` of a split drops a frame it has no reading for ("mark Paris then undo": the part for "undo" is missing, `unresolved` and `words` are empty), so `rank` and `veto` cannot see the word left out; the host counts frames against parts.\n';
const RUNS = [['r', 'rules'], ['e', 'encoder+n1']];
const VARIANTS = ['fill', 'choose'];

const load = (f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return new Map(d.rows.map((r) => [`${r.set}|${r.id}|${r.message}`, r])); };
const tally = (rows) => { const t = {}; for (const r of rows) { const b = (t[r.set] ??= { n: 0 }); b.n++; b[r.outcome] = (b[r.outcome] ?? 0) + 1; } return t; };
const readerOf = (r) => (r.segments ?? []).map((s) => s.reader).filter(Boolean);

process.env.PSYS2_READER = 'choose';   // the coverage needs the descriptions read
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const probe = engine.createSession({ language: 'en' });
const coverage = readerCoverage(probe.isession.rs.reasoner.lib, engine.set, (id) => probe.isession.rs.peek(id));

const report = { date: new Date().toISOString(), coverage, sets: {}, transitions: {}, changed: {}, usage: {} };
for (const [tag, mode] of RUNS) {
  const base = join(DIR, `${tag}-off.json`);
  if (!existsSync(base)) continue;
  const A = load(base);
  report.sets[`${mode}|off`] = tally([...A.values()]);
  for (const v of VARIANTS) {
    const f = join(DIR, `${tag}-${v}.json`);
    if (!existsSync(f)) continue;
    const B = load(f);
    const key = `${mode}|${v}`;
    report.sets[key] = tally([...B.values()]);
    const trans = {}, list = [], use = {};
    for (const [k, b] of B) {
      const rd = readerOf(b);
      const u = (use[b.set] ??= { offered: 0, used: 0, ambiguous: 0 });
      if (rd.length) { u.offered++; if (rd.some((x) => x.used)) u.used++; else if (rd.some((x) => x.ambiguous || x.why)) u.ambiguous++; }
      const a = A.get(k);
      if (!a || a.outcome === b.outcome) { if (a && rd.some((x) => x.used)) list.push({ set: b.set, world: b.world ?? null, message: b.message, transition: `${a.outcome}->${b.outcome} (same outcome)`, how: rd.filter((x) => x.used).map((x) => `${x.from}:${x.op}`).join('+'), off: cap(a.reply), now: cap(b.reply) }); continue; }
      const t = `${a.outcome}->${b.outcome}`;
      trans[t] = (trans[t] ?? 0) + 1;
      list.push({ set: b.set, world: b.world ?? null, message: b.message, english: b.english ?? null, transition: t, how: rd.filter((x) => x.used).map((x) => `${x.from}:${x.op}`).join('+') || 'knock-on', off: cap(a.reply), now: cap(b.reply) });
    }
    report.transitions[key] = trans;
    report.changed[key] = list;
    report.usage[key] = use;
  }
}
// E2 on top: world-aware `choose` (judgedBy, the library's rank) without and with the reader (w-r-off / w-r-on, w-e-off / w-e-on)
report.e2 = {};
for (const [tag, mode] of [['w-r', 'rules'], ['w-e', 'encoder+n1']]) {
  const fa = join(DIR, `${tag}-off.json`), fb = join(DIR, `${tag}-on.json`);
  if (!existsSync(fa) || !existsSync(fb)) continue;
  const A = load(fa), B = load(fb), trans = {}, list = [];
  for (const [k, b] of B) {
    const a = A.get(k); if (!a || a.outcome === b.outcome) continue;
    const t = `${a.outcome}->${b.outcome}`; trans[t] = (trans[t] ?? 0) + 1;
    list.push({ set: b.set, world: b.world ?? null, message: b.message, transition: t, how: readerOf(b).filter((x) => x.used).map((x) => `${x.from}:${x.op}`).join('+') || 'knock-on', off: cap(a.reply), now: cap(b.reply) });
  }
  report.e2[mode] = { off: tally([...A.values()]), on: tally([...B.values()]), transitions: trans, changed: list };
}
writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 1));

const L = ['# READER-ROUTE: the library\'s reader as a third source of readings (2026-11-12)', '',
  'Generated by `scripts/reader-route-report.mjs` from `scripts/e1-collect.mjs` runs. Spec: `specs/16-world-aware-reading.md` section 7. The option `reader` is **off by default**; nothing here changes a default. `fill`: the reader reads a clause nobody read; `choose`: and a clause that was read but leaves words out or is refused takes the reader\'s reading when the library\'s `rank` puts it first. Romanian rows are read through the rules translator first and then the same English route.', '',
  '## Coverage of `means` per world', '',
  'The 0.12 behaviour: the English `core.word` facts told to the world\'s matrix instance (`unknown` = the library\'s `unknown-word` warnings: a `means` that is an emit key, not a name of the matrix). Mapped: the reader world (every description a type, every argument a slot of it, every lexicon class a type of entities).', '',
  '| world | descriptions | words | 0.12: unknown-word | mapped words | reader types | entity classes | unknown-word after |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
for (const [w, c] of Object.entries(coverage)) L.push(`| ${w} | ${c.descriptions} | ${c.words} | ${c.asIs?.unknown ?? c.asIs?.error} | ${c.mapped?.mapped ?? '-'} | ${c.mapped?.types ?? '-'} | ${c.mapped?.entityClasses ?? '-'} | ${c.mapped?.warnings ?? '-'} |`);
L.push('');
for (const [, mode] of RUNS) {
  if (!report.sets[`${mode}|off`]) continue;
  L.push(`## ${mode}: right / wrong / not understood per set`, '', '| set | n | off | fill | choose |', '| --- | ---: | --- | --- | --- |');
  const cell = (k, s) => { const b = report.sets[k]?.[s]; return b ? `${b.right ?? 0} / ${b.wrong ?? 0} / ${b.not_understood ?? 0}${b.partly ? ` (+${b.partly} partly)` : ''}` : '-'; };
  for (const s of Object.keys(report.sets[`${mode}|off`])) L.push(`| ${s} | ${report.sets[`${mode}|off`][s].n} | ${['off', ...VARIANTS].map((v) => cell(`${mode}|${v}`, s)).join(' | ')} |`);
  L.push('', `### ${mode}: what changed against off (case counts)`, '', '| option | not understood to right | not understood to wrong | wrong to right | wrong to not understood | right to wrong | right to not understood | other |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const v of VARIANTS) {
    const t = report.transitions[`${mode}|${v}`]; if (!t) continue;
    const g = (x) => t[x] ?? 0;
    const known = new Set(['not_understood->right', 'not_understood->wrong', 'wrong->right', 'wrong->not_understood', 'right->wrong', 'right->not_understood']);
    L.push(`| ${v} | ${g('not_understood->right')} | ${g('not_understood->wrong')} | ${g('wrong->right')} | ${g('wrong->not_understood')} | ${g('right->wrong')} | ${g('right->not_understood')} | ${Object.entries(t).filter(([k]) => !known.has(k)).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`).join(', ') || '-'} |`);
  }
  L.push('', `### ${mode}: the reader's work per set (clauses it was asked about)`, '', '| option | set | clauses with a reading | taken | not taken (ambiguous, same reading, library keeps current) |', '| --- | --- | ---: | ---: | ---: |');
  for (const v of VARIANTS) for (const [s, u] of Object.entries(report.usage[`${mode}|${v}`] ?? {})) if (u.offered) L.push(`| ${v} | ${s} | ${u.offered} | ${u.used} | ${u.ambiguous} |`);
  L.push('');
}
L.push('## E2 rerun with the reader on top', '', 'World-aware `choose` (spec 16 sections 2 to 5; the library\'s `judgedBy` and `rank` pass through) without and with the reader (`choose`). The reader\'s readings go through the same world-aware review as any other (veto, choose).', '');
for (const [mode, e] of Object.entries(report.e2)) {
  L.push(`### ${mode}`, '', '| set | n | E2 choose | E2 choose + reader |', '| --- | ---: | --- | --- |');
  const cell = (b) => (b ? `${b.right ?? 0} / ${b.wrong ?? 0} / ${b.not_understood ?? 0}${b.partly ? ` (+${b.partly} partly)` : ''}` : '-');
  for (const sname of Object.keys(e.off)) L.push(`| ${sname} | ${e.off[sname].n} | ${cell(e.off[sname])} | ${cell(e.on[sname])} |`);
  L.push('', `Changes: ${Object.entries(e.transitions).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`).join(', ') || 'none'}.`, '');
  if (e.changed.length) { L.push('| set | world | transition | reader | message | E2 | E2 + reader |', '| --- | --- | --- | --- | --- | --- | --- |'); for (const c of e.changed) L.push(`| ${c.set} | ${c.world ?? ''} | ${c.transition.replace(/_/g, ' ')} | ${c.how} | ${cap(c.message, 70)} | ${cap(c.off, 60)} | ${cap(c.now, 60)} |`); L.push(''); }
}
L.push('## Every case that changed or that the reader read', '');
for (const [key, list] of Object.entries(report.changed)) {
  L.push(`### ${key} (${list.length})`, '');
  if (!list.length) { L.push('none', ''); continue; }
  L.push('| set | world | transition | reader | message | off | now |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const c of list) L.push(`| ${c.set} | ${c.world ?? ''} | ${c.transition.replace(/_/g, ' ')} | ${c.how} | ${cap(c.english && c.english !== c.message ? `${c.message} (${c.english})` : c.message, 80)} | ${cap(c.off, 70)} | ${cap(c.now, 70)} |`);
  L.push('');
}
L.push(NOTES);
writeFileSync(`${OUT}.md`, L.join('\n') + '\n');
console.log('wrote', `${OUT}.json`, `${OUT}.md`);
