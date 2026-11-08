#!/usr/bin/env node
/**
 * Audit and repair of the training labels over the FULL source data (every record of training/data and training/paraphrases/out,
 * plus the multi-command casing). Fixes the causes found by scripts/eval-phases.mjs (training/results/phase-analysis-train.md):
 *
 *   1 gold_target_from_another_world   2 label_says_rules_differ   3 gold_value_not_in_text   6 needs_review promotion
 *   4 conflicting duplicates           (a text in several worlds with different targets: report, true ambiguity vs generator bug)
 *   5 casing mismatch                  (multicmd "plain" variant lower-cases the text; gold keeps the original casing)
 * See scripts/lib/relabel.mjs for the judgement (the rules of the LABELLED world, restricted session, value checker) and the repairs.
 * Text and world label are never changed or dropped; only the circuit/label status of a record is repaired.
 *
 *   node scripts/relabel-training.mjs [--data-root <training dir>] [--out-root <dir>] [--in-place] [--jobs N] [--limit N]
 *        [--results training/results/relabel-training.json]
 *   --out-root   where the repaired copies go: <out-root>/data/*.jsonl and <out-root>/paraphrases/out/*.jsonl (default: nothing written, audit only)
 *   --in-place   rewrite <data-root>/data and <data-root>/paraphrases/out (the rebuild path; the files are generated and not tracked)
 * Idempotent: a second run over repaired data reports zero remaining causes. The repaired records keep `label_status_orig` and
 * `circuit_orig`. Then: node scripts/build-dataset.mjs [--src-root <dir>].
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { normalizedSop, slotsOf, valuesMatch } from './collect-paraphrases.mjs';
import { makeReader, judge, sameSop, textKey, lowerStrings, foreignActions } from './lib/relabel.mjs';
import { runSharded, serveShard, parseJobs } from './lib/shard.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_CHECKOUT = '/home/salboaie/work/psys2/training';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const listJsonl = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.jsonl')).sort() : []);

// ---------------------------------------------------------------- worker side
if (!isMainThread) {
  serveShard(async () => {
    const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
    const env = { engine, read: makeReader(engine) };
    return async (item) => {
      const j = await judge(env, item);
      return { ok: j.ok, kind: j.kind ?? null, cause: j.cause ?? null, detail: j.detail ?? null, fix: j.fix ?? null,
        read: j.reading ? { complete: j.reading.complete, sop: j.reading.sop } : null };
    };
  });
}

/** Normalized record view used by the judge. */
function view(r, world, src) {
  const kind = r.lineage?.kind ?? r.mode ?? 'unknown';
  const negative = !!r.negative || r.label_status === 'negative';
  const para = kind === 'paraphrase' || r.mode === 'paraphrase';
  return {
    id: r.example_id, world, text: r.text, context: (para ? r.setup : r.context) ?? r.context ?? [], tab: r.tab ?? null,
    target: r.expected_circuit ?? '', label_status: r.label_status, negative,
    review: !!r.needs_review && !negative && (!para || r.phenomenon === 'variant'), src, para,
  };
}

/** Apply a verdict to a source record; returns the (possibly new) record. */
function repaired(r, v, j) {
  const f = j.fix;
  if (!f || f.kind === 'keep') return r;
  const base = { ...r, label_status_orig: r.label_status, circuit_orig: r.expected_circuit ?? '' };
  if (f.kind === 'relabel' || f.kind === 'promote') {
    return { ...base, expected_circuit: f.target, label_status: 'relabelled', label_reason: `relabel:${j.cause}`, target_from: 'rules', needs_review: false, negative: false };
  }
  return { ...base, expected_circuit: '', label_status: 'needs_review', label_reason: `relabel:${j.cause}:unreadable`, target_from: null, needs_review: true };
}

const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});

async function pass(items, jobs) {
  return runSharded({ file: fileURLToPath(import.meta.url), items, jobs, workerData: {}, chunk: 64 });
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const jobs = parseJobs();
  let root = resolve(arg('data-root', join(REPO, 'training')));
  if (!existsSync(join(root, 'data')) || !listJsonl(join(root, 'data')).length) root = MAIN_CHECKOUT;
  const outRoot = arg('out-root') ? resolve(arg('out-root')) : null;
  const inPlace = process.argv.includes('--in-place');
  const limit = Number(arg('limit', 0));
  const resultsFile = resolve(arg('results', join(REPO, 'training/results/relabel-training.json')));
  const t0 = Date.now();

  // ---- load source records
  const files = [];   // {dir, name, recs[]}
  for (const dir of ['data', join('paraphrases', 'out')]) {
    for (const f of listJsonl(join(root, dir))) {
      const world = f.replace(/\.jsonl$/, '');
      let recs = readJsonl(join(root, dir, f));
      if (limit) recs = recs.slice(0, limit);
      files.push({ dir, name: f, world, recs });
    }
  }
  const items = [];
  for (const F of files) F.recs.forEach((r, i) => { const w = r.world ?? r.lineage?.world ?? F.world; items.push({ ...view(r, w, F.dir), _f: F, _i: i }); });
  console.log(`${items.length} source records from ${root}; ${jobs} workers`);

  // dataset train ids (population the phase analysis weighted over), when the dataset exists
  const trainIds = new Set();
  const dsRoot = join(root, 'dataset');
  if (existsSync(dsRoot)) for (const d of readdirSync(dsRoot, { withFileTypes: true })) if (d.isDirectory() && d.name !== 'multicmd' && existsSync(join(dsRoot, d.name, 'train.jsonl'))) for (const x of readJsonl(join(dsRoot, d.name, 'train.jsonl'))) trainIds.add(x.id);
  const inTrain = (v) => trainIds.has(v.id);

  // ---- pass 1: judge every record
  const plain = items.map(({ _f, _i, ...v }) => v);
  const res1 = await pass(plain, jobs);
  console.log(`pass 1 done in ${Math.round((Date.now() - t0) / 1000)}s`);

  const before = { records: items.length, by_cause: {}, by_cause_in_dataset_train: {}, by_cause_x_label_status: {}, promotable_needs_review: 0, needs_review_total: 0, needs_review_variants_read_completely: 0 };
  const fixes = { relabelled: {}, needs_review: {}, kept: {}, promoted: 0 };
  const examples = {};
  const outRecs = new Map(files.map((F) => [F, F.recs.slice()]));
  items.forEach((v, k) => {
    const j = res1[k];
    if (v.review) { before.needs_review_total++; if (v.para && j.cause === 'needs_review_readable') before.promotable_needs_review++; }
    if (j.ok) return;
    const c = j.cause;
    before.by_cause[c] = (before.by_cause[c] ?? 0) + 1;
    if (inTrain(v)) before.by_cause_in_dataset_train[c] = (before.by_cause_in_dataset_train[c] ?? 0) + 1;
    (before.by_cause_x_label_status[c] ??= {})[v.label_status] = (before.by_cause_x_label_status[c]?.[v.label_status] ?? 0) + 1;
    const fk = j.fix?.kind ?? 'none';
    if (fk === 'relabel') fixes.relabelled[c] = (fixes.relabelled[c] ?? 0) + 1;
    else if (fk === 'needs_review') fixes.needs_review[c] = (fixes.needs_review[c] ?? 0) + 1;
    else if (fk === 'promote') fixes.promoted++;
    else fixes.kept[c] = (fixes.kept[c] ?? 0) + 1;
    (examples[c] ??= []).length < 12 && examples[c].push({ world: v.world, status: v.label_status, text: v.text, old: v.target.split('\n').filter((l) => /action=|arg\./.test(l)).map((l) => l.trim()).join(' ').slice(0, 160), fix: fk, new: (j.fix?.target ?? '').split('\n').filter((l) => /action=|arg\./.test(l)).map((l) => l.trim()).join(' ').slice(0, 160), detail: j.detail });
    outRecs.get(v._f)[v._i] = repaired(v._f.recs[v._i], v, j);
  });

  // ---- a paraphrase variant the labelled world cannot read inherits its canonical's circuit when the canonical's values match the
  // variant's text (the F1 rule of collect-paraphrases: rules-fail); otherwise it stays needs_review (text and world are kept)
  const legendsEngine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const legends = legendsEngine.set.legends;
  const canonOf = new Map();
  for (const F of files) for (const r of outRecs.get(F)) if (r.phenomenon === 'canonical' && r.label_status === 'canonical-ok' && r.expected_circuit && !r.needs_review) canonOf.set(`${r.world}|${r.batch}|${r.task}`, r);
  const inherited = {};
  items.forEach((v, k) => {
    const j = res1[k];
    const cur = outRecs.get(v._f)[v._i];
    if (j.ok || j.fix?.kind !== 'needs_review' || !v.para || v.review || cur.phenomenon !== 'variant') return;
    const c = canonOf.get(`${cur.world}|${cur.batch}|${cur.task}`);
    if (!c) return;
    let slots = null;
    try { const p = parse(c.expected_circuit, { source: 'c' }); slots = p.errors.length || foreignActions(legendsEngine, cur.world, p.wires).length ? null : slotsOf(p.wires, legends); } catch { slots = null; }
    if (!valuesMatch({ slots }, cur.text)) return;
    outRecs.get(v._f)[v._i] = { ...cur, expected_circuit: c.expected_circuit, label_status: 'rules-fail', label_reason: `relabel:${j.cause}:inherited-canonical`, target_from: 'canonical', needs_review: false };
    inherited[j.cause] = (inherited[j.cause] ?? 0) + 1;
    fixes.needs_review[j.cause]--;
  });
  fixes.inherited_from_canonical = inherited;

  // ---- pass 2: judge the repaired records (must be clean) -> "after"
  const items2 = [];
  files.forEach((F) => outRecs.get(F).forEach((r, i) => { const w = r.world ?? r.lineage?.world ?? F.world; items2.push({ ...view(r, w, F.dir), _f: F, _i: i }); }));
  // only repaired records need a new verdict; the others keep their pass-1 verdict
  const changedIdx = items2.map((v, k) => (outRecs.get(v._f)[v._i] !== v._f.recs[v._i] ? k : -1)).filter((k) => k >= 0);
  const res2 = res1.slice();
  (await pass(changedIdx.map((k) => { const { _f, _i, ...v } = items2[k]; return v; }), jobs)).forEach((j, n) => { res2[changedIdx[n]] = j; });
  const after = { records: items2.length, by_cause: {}, needs_review_total: items2.filter((v) => v.review).length, quarantined_to_needs_review: Object.values(fixes.needs_review).reduce((a, b) => a + b, 0) };
  after.examples = [];
  items2.forEach((v, k) => { const j = res2[k]; if (!j.ok) { after.by_cause[j.cause] = (after.by_cause[j.cause] ?? 0) + 1; if (after.examples.length < 60 && (j.cause !== 'label_says_rules_differ' || after.examples.length < 8)) after.examples.push({ cause: j.cause, world: v.world, status: v.label_status, text: v.text, detail: j.detail ?? null, fix: j.fix?.kind ?? null }); } });
  // after: causes still open on non-review records (a `keep` verdict stays open by design)
  console.log(`pass 2 done in ${Math.round((Date.now() - t0) / 1000)}s`);

  // ---- cause 4: texts in several worlds with different targets (on the repaired records, positive, non-review)
  const sopOf = (t) => { try { const p = parse(t, { source: 'x' }); return p.errors.length ? null : normalizedSop(p.wires, legends); } catch { return null; } };
  const groups = new Map();
  items2.forEach((v, k) => {
    if (v.negative || v.review || !v.target || v.para === undefined) return;
    const sop = sopOf(v.target); if (!sop) return;
    const g = groups.get(textKey(v.text) + '\u0000' + v.context.map(textKey).join('|')) ?? new Map();
    const e = g.get(v.world) ?? { sops: new Map(), recs: [] };
    e.sops.set(JSON.stringify(sop.map((s) => s.toLowerCase())), sop); e.recs.push({ id: v.id, k });
    g.set(v.world, e); groups.set(textKey(v.text) + '\u0000' + v.context.map(textKey).join('|'), g);
  });
  const conflicts = { texts: 0, records: 0, true_ambiguity: 0, generator_or_label_bug: 0, examples_ambiguous: [], examples_bug: [], bug_by_world_pair: {} };
  for (const [key, g] of groups) {
    const targets = new Set([...g.values()].flatMap((e) => [...e.sops.keys()]));
    if (g.size < 2 || targets.size < 2) continue;
    conflicts.texts++;
    const nrec = [...g.values()].reduce((a, e) => a + e.recs.length, 0);
    conflicts.records += nrec;
    // a world "owns" the text when its restricted rules read it exactly like its record(s) do
    const owns = [...g.entries()].map(([w, e]) => ({ w, ok: e.recs.every((r) => res2[r.k].kind === 'agrees' || res2[r.k].kind === 'system_difference' ? res2[r.k].kind === 'agrees' : false) || e.recs.some((r) => res2[r.k].read?.complete && e.sops.has(JSON.stringify((res2[r.k].read.sop).map((s) => s.toLowerCase())))) }));
    const bad = owns.filter((o) => !o.ok).map((o) => o.w);
    const sample = { text: items2[[...g.values()][0].recs[0].k].text, worlds: [...g.keys()], bad_worlds: bad };
    if (bad.length === 0) { conflicts.true_ambiguity += 1; if (conflicts.examples_ambiguous.length < 15) conflicts.examples_ambiguous.push(sample); }
    else { conflicts.generator_or_label_bug += 1; for (const w of bad) conflicts.bug_by_world_pair[w] = (conflicts.bug_by_world_pair[w] ?? 0) + 1; if (conflicts.examples_bug.length < 25) conflicts.examples_bug.push(sample); }
  }

  // ---- cause 5: multicmd casing (plain variant)
  const casing = { context_dependent_segments: 0, segments: 0, messages_with_context_dependent_segment: 0, plain_segments: 0, mismatching_before: 0, mismatching_after: 0, examples: [] };
  const mcFile = join(root, 'dataset', 'multicmd', 'train.jsonl');
  if (existsSync(mcFile)) {
    const byId = new Map();
    for (const x of readJsonl(mcFile)) { /* segments only */ for (const s of x.segments) byId.set(s.source_id, s); }
    const recById = new Map();
    for (const F of files) for (const r of outRecs.get(F)) recById.set(r.example_id, r);
    const bad = (target, text) => [...target.matchAll(/"((?:[^"\\]|\\.)*)"/g)].some((m) => m[1] !== m[1].toLowerCase() && text.includes(m[1].toLowerCase()) && !text.includes(m[1]));
    for (const m of readJsonl(mcFile)) {
      let dep = 0;
      for (const sg of m.segments) { casing.segments++; if ((recById.get(sg.source_id)?.context ?? []).length) { casing.context_dependent_segments++; dep++; } }
      if (dep) casing.messages_with_context_dependent_segment++;
      if (m.variant !== 'plain') continue;
      for (const s of m.segments) {
        const r = recById.get(s.source_id); const tgt = r?.expected_circuit; if (!tgt) continue;
        casing.plain_segments++;
        if (bad(tgt, s.text)) { casing.mismatching_before++; if (casing.examples.length < 6) casing.examples.push({ text: s.text, value: (tgt.match(/"[^"]*"/g) ?? []).join(' ') }); }
        if (bad(lowerStrings(tgt), s.text)) casing.mismatching_after++;
      }
    }
  }

  // ---- write
  const writeOut = (base) => {
    for (const F of files) { const d = join(base, F.dir); mkdirSync(d, { recursive: true }); writeFileSync(join(d, F.name), outRecs.get(F).map((r) => JSON.stringify(r)).join('\n') + '\n'); }
  };
  if (limit && (inPlace || outRoot)) console.log('--limit given: nothing written'); else {
    if (outRoot) writeOut(outRoot);
    if (inPlace) writeOut(root);
  }

  const report = { generated_by: 'scripts/relabel-training.mjs', data_root: root.replace(REPO + '/', ''), seconds: Math.round((Date.now() - t0) / 1000), before, fixes, after, conflicting_duplicates: conflicts, casing, examples,
    notes: 'before = causes found in the source records; after = causes found when the repaired records are judged again (kept = verdict `keep`, rules-differ records the value checker does not accept, left unchanged). Records quarantined to needs_review keep text and world label.' };
  mkdirSync(dirname(resultsFile), { recursive: true });
  if (!limit || arg('results')) writeFileSync(resultsFile, JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify({ before: before.by_cause, in_dataset_train: before.by_cause_in_dataset_train, fixes, after: after.by_cause, needs_review: { before: before.needs_review_total, promotable: before.promotable_needs_review, after: after.needs_review_total }, conflicts: { texts: conflicts.texts, ambiguity: conflicts.true_ambiguity, bug: conflicts.generator_or_label_bug }, casing: { n: casing.plain_segments, before: casing.mismatching_before, after: casing.mismatching_after } }, null, 1));
}
