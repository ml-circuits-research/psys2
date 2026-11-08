#!/usr/bin/env node
/**
 * Verify compositional multi-command records against the rule formalizer (review F4; training/psys2_train/compositional.py).
 *
 * Per record (family != concat/single/long, with `program: {setup, steps}`): a fresh session says the setup messages, then each
 * atomic step in order; a second fresh session says the setup and the composite text. Reported per family:
 *   steps_ok      every atomic step was parsed by the rules (the program itself is expressible),
 *   composite_ok  every segment of the composite text was parsed,
 *   agree         steps_ok and composite_ok and the order-preserving normalized SOP of the composite equals that of the steps.
 * The labels (segments and worlds) always come from the program; this script only tells how much of it the rules already cover
 * (the rest is the target of the R2 expansion, never dropped from training).
 *
 * Usage: node scripts/verify-compositional.mjs <records.jsonl> [--out report.json] [--annotate annotated.jsonl] [--limit N]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const file = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
if (!file) { console.error('usage: node scripts/verify-compositional.mjs <records.jsonl> [--out f] [--annotate f] [--limit N]'); process.exit(2); }
const limit = Number(opt('--limit') || 0);
let recs = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.program);
if (limit) recs = recs.slice(0, limit);

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const legends = engine.set.legends;

async function fresh(rec) {
  const s = engine.createSession();
  const tab = rec.context?.tab;
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  for (const m of rec.program.setup) await s.send(m);
  return s;
}
const run = async (s, msgs) => {
  const wires = []; let unparsed = 0, parsed = 0;
  for (const m of msgs) {
    const r = await s.send(m);
    for (const x of r.segments) { if (x.unparsed) unparsed++; else { parsed++; wires.push(...x.wires); } }
  }
  return { ok: unparsed === 0 && parsed > 0, sop: normalizedSop(wires, legends) };
};

const fam = {};
const annotated = [];
for (const rec of recs) {
  const f = (fam[rec.family] ??= { n: 0, steps_ok: 0, composite_ok: 0, agree: 0 });
  f.n++;
  let st, co;
  try { st = await run(await fresh(rec), rec.program.steps); } catch (e) { st = { ok: false, sop: [] }; }
  try { co = await run(await fresh(rec), [rec.text]); } catch (e) { co = { ok: false, sop: [] }; }
  const agree = st.ok && co.ok && JSON.stringify(st.sop) === JSON.stringify(co.sop);
  if (st.ok) f.steps_ok++; if (co.ok) f.composite_ok++; if (agree) f.agree++;
  annotated.push({ ...rec, rules: { steps_ok: st.ok, composite_ok: co.ok, agree } });
}
const report = { file, n: recs.length, families: fam, total: Object.values(fam).reduce((a, f) => ({ n: a.n + f.n, steps_ok: a.steps_ok + f.steps_ok, composite_ok: a.composite_ok + f.composite_ok, agree: a.agree + f.agree }), { n: 0, steps_ok: 0, composite_ok: 0, agree: 0 }) };
console.log(JSON.stringify(report, null, 1));
if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify(report, null, 1));
if (opt('--annotate')) writeFileSync(opt('--annotate'), annotated.map((r) => JSON.stringify(r)).join('\n') + '\n');
