#!/usr/bin/env node
/**
 * Error analysis of the normalizer's "misled" cases (N1): the original piece is not read, the first rewrite the rules read completely
 * (and, with --strict, that passes the value checker) is read to a SOP that is not the gold SOP.
 *   node scripts/analyze-normalizer.mjs --pred <outputs.jsonl> [--splits dev,heldout] [--strict] [--list 3]
 * Classes (automatic, in this order):
 *   b  value changed      numbers, colours, or value words differ between piece and rewrite (what a stricter checker must catch)
 *   c  negation/polarity  negation or an opposite-capable word dropped or introduced
 *   a  label noise        the rewrite keeps every value (strict checker passes) and the rules read it to the SAME action as the gold SOP: only
 *                         arguments differ, because the gold carries the group canonical's arguments (variant-specific words are in the rewrite)
 *   d  other action       the rewrite is read to another action/question type of the same world
 *   f  other
 *   e  different world    not applicable here (the rules are restricted to the gold world); counted 0
 * Label noise is an estimate by rule, not by hand: the examples are printed so they can be read.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { worldVocabulary } from '../src/formalizer/spell.mjs';
import { checkValues, numbersOf } from '../src/dialog/value-check.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { makeRunner, sopKey } from './build-edit-tags.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const splits = opt('--splits', 'dev,heldout').split(',');
const strict = args.includes('--strict');
const nList = Number(opt('--list', 3));
const minScore = opt('--min-score', null) != null ? Number(opt('--min-score')) : null;
const evalFile = (s) => (s === 'fresh' ? join(REPO, 'training/dataset-normalizer/eval-fresh.jsonl') : join(REPO, 'training/dataset-edit', `eval-${s}.jsonl`));
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const run = makeRunner(engine);
const legends = engine.set.legends;
const full = (r) => r.parsed > 0 && r.unparsed === 0;
const pred = new Map(readJsonl(resolve(REPO, opt('--pred'))).map((p) => [p.id, p]));
const copts = strict ? { polarity: true, grounded: true, keepKnown: true } : {};
const actionOf = (sop) => sop.map((l) => { const t = l.split(' ')[0]; const m = /(?:core\.request\.action|core\.question\.type|core\.command\.action)=(\S+)/.exec(l); return `${t}:${m ? m[1] : ''}`; }).sort().join('|');
const classes = { a: [], b: [], c: [], d: [], e: [], f: [] };
let recovered = 0, attempted = 0;
for (const s of splits) {
  for (const r of readJsonl(evalFile(s))) {
    const p = parse(r.target, { source: r.id });
    if (p.errors.length || !p.wires.length) continue;
    const gold = normalizedSop(p.wires, legends), tkey = sopKey(gold);
    if (full(run(r.world, r.tab, r.setup, r.text))) continue;
    const pr = pred.get(`${s}:${r.id}`);
    if (!pr) continue;
    attempted++;
    const vocab = worldVocabulary(engine.set, r.world);
    for (const [i, c] of pr.outputs.entries()) {
      if (!c || c.trim() === r.text.trim()) continue;
      if (minScore != null && (pr.scores?.[i] ?? 0) < minScore) continue;
      const rr = run(r.world, r.tab, r.setup, c);
      if (!full(rr)) continue;
      const vc = checkValues(r.text, c, { vocab, ...copts });
      if (strict && !vc.ok) continue;
      if (sopKey(rr.sop) === tkey) { recovered++; break; }
      // misled: classify
      const basic = checkValues(r.text, c, { vocab });
      const strictRes = checkValues(r.text, c, { vocab, polarity: true, grounded: true, keepKnown: true });
      let cls;
      if (!basic.ok && /numbers|colours|value word/.test(basic.reason)) cls = 'b';
      else if (!basic.ok && /negation/.test(basic.reason)) cls = 'c';
      else if (!strictRes.ok && /opposite/.test(strictRes.reason)) cls = 'c';
      else if (strictRes.ok && actionOf(rr.sop) === actionOf(gold)) cls = 'a';
      else if (actionOf(rr.sop) !== actionOf(gold)) cls = 'd';
      else cls = 'f';
      classes[cls].push({ split: s, world: r.world, text: r.text, rewrite: c, score: pr.scores?.[i] ?? null, reason: (cls === 'a' ? 'same action' : basic.ok ? strictRes.reason : basic.reason), gold: actionOf(gold), got: actionOf(rr.sop) });
      break;
    }
  }
}
const total = Object.values(classes).reduce((a, x) => a + x.length, 0);
const labelNoise = classes.a.length;
const out = { pred: opt('--pred'), splits, strict, attempted, recovered, misled: total, misled_by_class: Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, v.length])),
  misled_excluding_label_noise: total - labelNoise, ratio_all: recovered ? +(total / recovered).toFixed(3) : null, ratio_excl_label_noise: recovered ? +((total - labelNoise) / recovered).toFixed(3) : null,
  examples: Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, v.filter((_, i) => i % Math.max(1, Math.floor(v.length / nList)) === 0).slice(0, nList)])) };
writeFileSync(join(REPO, 'training/runs/n1', `analysis-${opt('--name', 'x')}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, examples: undefined }, null, 1));
for (const [k, v] of Object.entries(out.examples)) for (const e of v) console.log(k, e.split, e.world, JSON.stringify(e.text), '=>', JSON.stringify(e.rewrite), `[${e.reason}] gold ${e.gold} got ${e.got}`);
