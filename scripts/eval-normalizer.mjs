#!/usr/bin/env node
/**
 * Offline evaluation of the seq2seq normalizer (worker-tasks N1, spec 03 section 7.12), same messages and same runner as scripts/eval-simplify.mjs.
 *
 *   node scripts/eval-normalizer.mjs list  --out <requests.jsonl> [--splits dev,test,heldout,fresh]
 *   (python -m psys2_train.normalizer predict --ckpt <run> --requests <requests.jsonl> --out <outputs.jsonl>)
 *   node scripts/eval-normalizer.mjs score --pred <outputs.jsonl> --name <model> [--d1b <edit-tags pred dir>] [--lost unknown|capitalized]
 *
 * Every paraphrase variant is one piece, read in its gold world with the record's tab and setup (the world head is not part of this metric).
 * Outcome per record: `right` (the rules read it to the target SOP), `wrong` (they read it completely but to another SOP) or `fallback` (not read completely:
 * the user sees "not understood"). The pipeline reads the ORIGINAL first; only a piece that does not parse completely is sent to the normalizer; the first beam
 * candidate that parses completely and passes the value checker is accepted. Metrics per split:
 *   before / after     share of right (the headline of this experiment), wrong and fallback
 *   recovered          fallback -> right        misled   fallback -> wrong       misled_share = misled / recovered
 *   attempted          pieces sent to the normalizer; accepted = a candidate passed; rejected_by_values = candidates rejected by the value checker that the rules read
 *                      (and, among them, how many were right: the recoverable cost of the checker)
 * `--d1b <dir>` evaluates the edit-tag head's rewrites (pred-<split>.jsonl of scripts/eval-simplify.mjs) with the same definitions.
 * Writes training/results/normalizer-<name>.json.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { worldVocabulary } from '../src/formalizer/spell.mjs';
import { checkValues } from '../src/dialog/value-check.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { makeRunner, sopKey } from './build-edit-tags.mjs';
import { groupOf } from './lib/world-groups.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const [cmd, ...args] = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const splits = opt('--splits', 'dev,test,heldout,fresh').split(',');
const evalFile = (s) => (s === 'fresh' ? join(REPO, 'training/dataset-normalizer/eval-fresh.jsonl') : join(REPO, 'training/dataset-edit', `eval-${s}.jsonl`));

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const run = makeRunner(engine);
const legends = engine.set.legends;
const full = (r) => r.parsed > 0 && r.unparsed === 0;

if (cmd === 'list') {
  const rows = [];
  for (const s of splits) {
    for (const r of readJsonl(evalFile(s))) {
      if (full(run(r.world, r.tab, r.setup, r.text))) continue;
      rows.push({ id: `${s}:${r.id}`, world: r.world, tab: r.tab ?? null, text: r.text });
    }
  }
  writeFileSync(resolve(REPO, opt('--out')), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  console.log(`${rows.length} pieces do not parse completely -> ${opt('--out')}`);
} else if (cmd === 'score') {
  const name = opt('--name', 'model');
  const lost = opt('--lost', 'unknown');
  const predRows = new Map(readJsonl(resolve(REPO, opt('--pred'))).map((p) => [p.id, p]));
  const pred2 = opt('--pred2', null) ? new Map(readJsonl(resolve(REPO, opt('--pred2'))).map((p) => [p.id, p])) : null;
  const pred = new Map([...predRows].map(([k, p]) => [k, p.outputs]));
  const d1bDir = opt('--d1b', null);
  const pct = (a, n) => (n ? Number((a / n).toFixed(4)) : null);
  const mk = () => ({ n: 0, before_right: 0, before_wrong: 0, before_fallback: 0, after_right: 0, after_wrong: 0, after_fallback: 0, recovered: 0, misled: 0, broken: 0, attempted: 0, accepted: 0, rejected_by_values: 0, rejected_by_values_right: 0, rules_read_wrong_rejected: 0 });
  const fin = (c) => ({ ...c, headline_before: pct(c.before_right, c.n), headline_after: pct(c.after_right, c.n), fallback_before: pct(c.before_fallback, c.n), fallback_after: pct(c.after_fallback, c.n), wrong_before: pct(c.before_wrong, c.n), wrong_after: pct(c.after_wrong, c.n), misled_share_of_recovered: c.recovered ? Number((c.misled / c.recovered).toFixed(3)) : null });
  const evaluate = (r, tkey, getCands, valueOn, copts = {}, extra = {}) => {
    const o = run(r.world, r.tab, r.setup, r.text);
    const before = full(o) ? (sopKey(o.sop) === tkey ? 'right' : 'wrong') : 'fallback';
    let after = before, attempted = false, accepted = false, rej = 0, rejRight = 0, wrongRej = 0, text = null;
    if (before === 'fallback') {
      const cands = getCands();
      attempted = cands !== null;
      const vocab = worldVocabulary(engine.set, r.world);
      const sc = extra.scores ?? [];
      const sopOf = (c) => { const q = run(r.world, r.tab, r.setup, c); return full(q) ? sopKey(q.sop) : null; };
      for (const [ci, c] of (cands ?? []).entries()) {
        if (!c || c.trim() === r.text.trim()) continue;
        if (extra.minScore != null && (sc[ci] ?? 0) < extra.minScore) continue;
        const rr = run(r.world, r.tab, r.setup, c);
        if (!full(rr)) continue;
        const ok = sopKey(rr.sop) === tkey;
        if (valueOn && !checkValues(r.text, c, { vocab, lost, ...copts }).ok) { rej++; if (ok) rejRight++; else wrongRej++; continue; }
        if (extra.consensus > 1) {
          const mine = sopKey(rr.sop);
          const agree = cands.filter((o, oi) => o && o.trim() !== r.text.trim() && (extra.minScore == null || (sc[oi] ?? 0) >= extra.minScore) && sopOf(o) === mine && (!valueOn || checkValues(r.text, o, { vocab, lost, ...copts }).ok)).length;
          if (agree < extra.consensus) continue;
        }
        if (extra.ens2) {   // second model: some candidate of it that passes the checks must read to the same SOP
          const mine = sopKey(rr.sop);
          if (!extra.ens2.some((o) => o && o.trim() !== r.text.trim() && sopOf(o) === mine && (!valueOn || checkValues(r.text, o, { vocab, lost, ...copts }).ok))) continue;
        }
        after = ok ? 'right' : 'wrong'; accepted = true; text = c; break;
      }
    }
    return { before, after, attempted, accepted, rej, rejRight, wrongRej, text };
  };
  const result = { name, command: `node scripts/eval-normalizer.mjs ${[cmd, ...args].join(' ')}`, value_lost_mode: lost, splits: {} };
  const examples = [];
  for (const s of splits) {
    const recs = readJsonl(evalFile(s));
    if (!recs.length) continue;
    const variants = { normalizer: { valueOn: true }, normalizer_no_value_check: { valueOn: false }, normalizer_beam1: { valueOn: true, beam1: true },
      ...Object.fromEntries([['', {}], ['_p', { polarity: true }], ['_strict', { polarity: true, grounded: true, keepKnown: true }]].flatMap(([nm, copts]) => [[null, undefined], [-0.3, -0.3], [-0.15, -0.15], [-0.08, -0.08]].flatMap(([a, ms]) => [1, 2].map((cn) => [`v${nm}${ms != null ? '_min' + ms : ''}${cn > 1 ? '_cons2' : ''}`, { valueOn: true, copts, extra: { minScore: ms, consensus: cn } }])))),
      ...(pred2 ? Object.fromEntries([['', {}], ['_p', { polarity: true }], ['_strict', { polarity: true, grounded: true, keepKnown: true }]].flatMap(([nm, copts]) => [[null, null], [-0.3, -0.3]].map(([a, ms]) => [`ens${nm}${ms != null ? '_min' + ms : ''}`, { valueOn: true, copts, extra: { minScore: ms, ens: true } }]))) : {}),
      normalizer_polarity: { valueOn: true, copts: { polarity: true } }, normalizer_grounded: { valueOn: true, copts: { polarity: true, grounded: true } },
      normalizer_keep_known: { valueOn: true, copts: { polarity: true, keepKnown: true } }, normalizer_strict: { valueOn: true, copts: { polarity: true, grounded: true, keepKnown: true } } };
    const d1b = d1bDir ? new Map(readJsonl(join(resolve(REPO, d1bDir), `pred-${s}.jsonl`)).map((p) => [p.id, p.simplified])) : null;
    if (d1b) { variants.d1b = { valueOn: false, d1b: true }; variants.d1b_with_value_check = { valueOn: true, d1b: true }; }
    const cells = Object.fromEntries(Object.keys(variants).map((v) => [v, { all: mk(), by_group: {} }]));
    for (const r of recs) {
      const p = parse(r.target, { source: r.id });
      if (p.errors.length || !p.wires.length) continue;
      const tkey = sopKey(normalizedSop(p.wires, legends));
      for (const [vname, v] of Object.entries(variants)) {
        const outs = pred.get(`${s}:${r.id}`);
        const getCands = () => (v.d1b ? (d1b.has(r.id) ? [d1b.get(r.id)].filter(Boolean) : null) : outs ? (v.beam1 ? outs.slice(0, 1) : outs) : null);
        const e = evaluate(r, tkey, getCands, v.valueOn, v.copts, { ...(v.extra ?? {}), scores: predRows.get(`${s}:${r.id}`)?.scores, ens2: v.extra?.ens ? pred2.get(`${s}:${r.id}`)?.outputs ?? [] : null });
        for (const c of [cells[vname].all, (cells[vname].by_group[groupOf(r.world)] ??= mk())]) {
          c.n++; c[`before_${e.before}`]++; c[`after_${e.after}`]++;
          c.recovered += e.before === 'fallback' && e.after === 'right'; c.misled += e.before === 'fallback' && e.after === 'wrong';
          c.attempted += e.attempted; c.accepted += e.accepted; c.rejected_by_values += e.rej; c.rejected_by_values_right += e.rejRight; c.rules_read_wrong_rejected += e.wrongRej;
        }
        if (vname === opt('--examples-variant', 'normalizer') && e.accepted && examples.length < 3000) examples.push({ split: s, id: r.id, world: r.world, text: r.text, normalized: e.text, right: e.after === 'right' });
      }
    }
    result.splits[s] = Object.fromEntries(Object.entries(cells).map(([v, c]) => [v, { ...fin(c.all), by_group: Object.fromEntries(Object.entries(c.by_group).map(([g, x]) => [g, fin(x)])) }]));
  }
  mkdirSync(join(REPO, 'training/results'), { recursive: true }); mkdirSync(join(REPO, 'training/runs/n1'), { recursive: true });
  writeFileSync(join(REPO, 'training/results', `normalizer-${name}.json`), JSON.stringify(result, null, 1));
  writeFileSync(join(REPO, 'training/runs/n1', `examples-${name}.json`), JSON.stringify(examples, null, 1));
  const show = (c) => `before ${c.headline_before} -> after ${c.headline_after}  recovered ${c.recovered} misled ${c.misled} (${c.misled_share_of_recovered ?? '-'})  attempted ${c.attempted} accepted ${c.accepted}  n ${c.n}`;
  const showRe = new RegExp(opt('--show', '^(normalizer|d1b)$'));
  for (const [s, v] of Object.entries(result.splits)) for (const [vn, c] of Object.entries(v)) if (showRe.test(vn)) console.log(s.padEnd(8), vn.padEnd(28), show(c));
} else {
  console.error('usage: eval-normalizer.mjs list|score ...');
  process.exit(2);
}
