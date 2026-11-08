#!/usr/bin/env node
/**
 * Main metric of the simplification head (worker-tasks D1b): the share of paraphrase variants that the rules formalize to the target SOP
 * on the ORIGINAL text, on the REWRITTEN text (`simplified` from the edit head) and on either (the dispatcher validator tries the original
 * first and the simplified variant next, so `either` is what the chain achieves). Rules run restricted to the record's world, with the
 * record's setup messages and tab, exactly as scripts/eval-rules.mjs (same runner as scripts/build-edit-tags.mjs).
 *
 *   node scripts/eval-simplify.mjs --pred-dir training/runs/edit-tags/<name> [--splits dev,test,heldout] [--merge training/results/dispatcher-<name>.json]
 *
 * Inputs: training/dataset-edit/eval-<split>.jsonl (every paraphrase variant of the split) and <pred-dir>/pred-<split>.jsonl
 * ({id, simplified|null}) written by `python -m psys2_train.simplify_predict`. Output: JSON on stdout; with --merge the object is stored
 * under the key `rules_on_rewrite` of that results file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { makeRunner, sopKey, isOk } from './build-edit-tags.mjs';
import { groupOf } from './lib/world-groups.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const predDir = resolve(REPO, opt('--pred-dir', ''));
const splits = opt('--splits', 'dev,test,heldout').split(',');
const merge = opt('--merge', null);

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const run = makeRunner(engine);
const legends = engine.set.legends;
const pct = (a, n) => (n ? Number((a / n).toFixed(4)) : null);
const cell = () => ({ n: 0, orig_ok: 0, changed: 0, rewrite_ok: 0, either_ok: 0, recovered: 0, broken: 0, changed_ok: 0, misled: 0 });
const out = {};
for (const split of splits) {
  const recs = readJsonl(join(REPO, 'training/dataset-edit', `eval-${split}.jsonl`));
  const pred = new Map(readJsonl(join(predDir, `pred-${split}.jsonl`)).map((p) => [p.id, p.simplified]));
  if (!recs.length || !pred.size) continue;
  const all = cell(), byGroup = {}, byStatus = {}, examples = [];
  for (const r of recs) {
    if (!pred.has(r.id)) continue;
    const p = parse(r.target, { source: r.id });
    if (p.errors.length || !p.wires.length) continue;
    const tkey = sopKey(normalizedSop(p.wires, legends));
    const orig = isOk(run(r.world, r.tab, r.setup, r.text), tkey);
    const simp = pred.get(r.id);
    const changed = typeof simp === 'string' && simp.trim() !== '' && simp.trim() !== r.text.trim();
    const rr = changed ? run(r.world, r.tab, r.setup, simp) : null;
    const rew = rr ? isOk(rr, tkey) : false;
    const wrongParse = rr && rr.parsed > 0 && rr.unparsed === 0 && !rew;   // the rewrite is accepted by the rules but means something else
    for (const c of [all, (byGroup[groupOf(r.world)] ??= cell()), (byStatus[r.label_status] ??= cell())]) {
      c.n++; c.orig_ok += orig; c.changed += changed; c.rewrite_ok += rew; c.either_ok += orig || rew; c.recovered += !orig && rew; c.broken += orig && changed && !rew; c.misled += !orig && wrongParse; c.changed_ok += changed && rew;
    }
    if (examples.length < 400 && changed) examples.push({ id: r.id, world: r.world, text: r.text, simplified: simp, orig_ok: orig, rewrite_ok: rew });
  }
  const fin = (c) => ({ ...c, misled_share: pct(c.misled, c.n), rules_on_original: pct(c.orig_ok, c.n), rules_on_rewrite: pct(c.rewrite_ok, c.n), rules_original_or_rewrite: pct(c.either_ok, c.n), rewrite_precision_when_changed: pct(c.changed_ok, c.changed) });
  out[split] = { ...fin(all), by_group: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, fin(v)])), by_label_status: Object.fromEntries(Object.entries(byStatus).map(([k, v]) => [k, fin(v)])) };
  writeFileSync(join(predDir, `rewrites-${split}.json`), JSON.stringify(examples, null, 1));
}
const result = { command: `node scripts/eval-simplify.mjs ${args.join(' ')}`, ...out };
if (merge) {
  const f = resolve(REPO, merge);
  const base = JSON.parse(readFileSync(f, 'utf8'));
  base.rules_on_rewrite = result;
  writeFileSync(f, JSON.stringify(base, null, 1));
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([x]) => !x.startsWith('by_'))) : v])), null, 1));
