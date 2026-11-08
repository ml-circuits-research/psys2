#!/usr/bin/env node
/**
 * Collect paraphrase training data (spec 10).
 *
 * Small LLM agents write batches of human-like commands (training/paraphrases/inbox/<world>.<batch>.json); this script
 * runs them through the dialog system (rule formalizer, routing context of the world's tab) and turns every attempt into
 * a training record. No network, no LLM, deterministic.
 *
 * Usage: node scripts/collect-paraphrases.mjs <file|dir> [--report] [--root worlds] [--out-dir training/paraphrases]
 *                                              [--dev 0.1] [--no-write]
 *   <dir> processes every *.json of the directory; a single file replaces only the records of its own batch.
 *   --report prints the per-world table and every task with a failing canonical (the retry list).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { serialize } from '../src/soplang/index.mjs';
import { splitOf, IGNORED_KEYS } from './export-training.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const valueText = (v) => (v.kind === 'string' ? JSON.stringify(v.v) : v.kind === 'ref' ? '$' + v.v : /^-?\d+(\.\d+)?$/.test(v.v) ? String(Number(v.v)) : v.v);

/**
 * Canonical, id-normalized form of wires: core.agent wires and bookkeeping keys dropped, keys in full form, entries
 * sorted, references to wire ids renamed by position (#1, #2, ...; entity references such as $e.tom are kept), lines sorted.
 */
export function normalizedSop(wires, legends) {
  const ws = wires.filter((w) => w.type !== 'core.agent');
  const idx = new Map(ws.map((w, i) => [w.id, `#${i + 1}`]));
  const lines = ws.map((w) => {
    const n = legends ? legends.normalizeWire(w).wire : w;
    const entries = n.entries.filter((e) => !IGNORED_KEYS.has(e.key)).map((e) => {
      const v = e.value.kind === 'ref' && idx.has(e.value.v) ? `$${idx.get(e.value.v)}` : valueText(e.value);
      return `${e.key}=${v}`;
    }).sort();
    return `${n.type} ${entries.join(' ')}`;
  });
  return lines.sort();
}

/** Grade of a canonical outcome: success (everything parsed), partial (some segments unparsed), fail (nothing parsed). */
export function gradeOf(o) {
  if (!o || !o.matched) return 'fail';
  return o.unparsed > 0 ? 'partial' : 'success';
}

/**
 * Label of a variant against its canonical outcome (spec 10 section 3). Outcomes: { matched, unparsed, sop: string[], state, effects }.
 * Returns { label_status, target_from, needs_review }.
 *  - canonical failed: a parsed variant is `rules-unverified` (own reading, needs review); an unparsed one has no target.
 *  - variant unparsed: rules-fail, target = canonical (needs_review when the canonical is only partial).
 *  - same normalized SOP, or the same non-empty state diff or effects: rules-agree (target = own reading).
 *  - otherwise rules-differ, target = canonical.
 */
export function labelVariant(canonical, variant) {
  const grade = gradeOf(canonical);
  if (grade === 'fail') {
    return variant.matched
      ? { label_status: 'rules-unverified', target_from: 'rules', needs_review: true }
      : { label_status: 'rules-fail', target_from: null, needs_review: true };
  }
  const partial = grade === 'partial';
  if (!variant.matched) return { label_status: 'rules-fail', target_from: 'canonical', needs_review: partial };
  const sameSop = JSON.stringify(variant.sop) === JSON.stringify(canonical.sop);
  const sameState = Object.keys(canonical.state ?? {}).length > 0 && JSON.stringify(variant.state) === JSON.stringify(canonical.state);
  const sameEffects = (canonical.effects ?? []).length > 0 && JSON.stringify(variant.effects) === JSON.stringify(canonical.effects);
  if (sameSop || sameState || sameEffects) {
    return { label_status: 'rules-agree', target_from: 'rules', needs_review: partial && !sameSop };
  }
  return { label_status: 'rules-differ', target_from: 'canonical', needs_review: partial };
}

/** Run `text` in a fresh session (tab active, setup sentences first); returns the observed outcome. */
export async function runAttempt(engine, { tab, setup = [], text }) {
  const s = engine.createSession();
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  for (const m of setup) await s.send(m);
  const r = await s.send(text);
  const legends = engine.set.legends;
  const wires = r.segments.filter((x) => !x.unparsed).flatMap((x) => x.wires);
  return {
    reply: r.text,
    statuses: r.statuses,
    matched: r.segments.some((x) => !x.unparsed && x.match),
    unparsed: r.segments.filter((x) => x.unparsed).length,
    worlds: [...new Set(r.segments.map((x) => x.match?.worldId).filter(Boolean))],
    sop: normalizedSop(wires, legends),
    target: serialize(wires.filter((w) => w.type !== 'core.agent')),
    state: r.state, effects: r.effects,
  };
}

/** Validate a batch object; returns a list of problems. */
export function checkBatch(b) {
  const bad = [];
  for (const k of ['world', 'tab', 'author', 'batch']) if (typeof b?.[k] !== 'string' || !b[k]) bad.push(`missing ${k}`);
  if (!Array.isArray(b?.tasks)) return [...bad, 'tasks must be a list'];
  const ids = new Set();
  b.tasks.forEach((t, i) => {
    const w = `task ${t?.id ?? i}`;
    if (!t?.id || ids.has(t.id)) bad.push(`${w}: id missing or duplicated`);
    ids.add(t?.id);
    if (!t?.goal) bad.push(`${w}: goal missing`);
    if (!t?.canonical) bad.push(`${w}: canonical missing`);
    if (!Array.isArray(t?.variants) || t.variants.length === 0) bad.push(`${w}: variants missing`);
  });
  return bad;
}

/** Records of one batch. `canonical_retries` (optional list on a task) holds further canonical phrasings tried in order. */
export async function collectBatch(engine, batch, { devShare = 0.1 } = {}) {
  const records = [];
  for (const t of batch.tasks) {
    const setup = t.setup ?? [];
    const group = `${batch.world}/${slug(t.goal)}`;
    const split = splitOf(batch.world, group, devShare);
    const mk = (role, text, attempt, o, lab, extra = {}) => ({
      example_id: sha(`${batch.world}\n${group}\n${setup.join('\n')}\n${role}\n${text}`),
      lineage: { kind: 'paraphrase', world: batch.world, batch: batch.batch, task: t.id, author: batch.author, role },
      source_group: group, group, language: 'en',
      text, message: text, context: setup, segment_span: [0, text.length],
      mentions: [], keys: [], references: [], kind: 'request',
      expected_circuit: lab.target_from === 'canonical' ? (extra.canonicalTarget ?? '') : (lab.target_from === 'rules' ? o.target : ''),
      label_status: lab.label_status, phenomenon: role, split,
      goal: t.goal, mode: 'paraphrase', author: batch.author, attempt, target_from: lab.target_from, setup,
      needs_review: lab.needs_review, tab: batch.tab, world: batch.world, batch: batch.batch, task: t.id,
      reply: o.reply, status: o.statuses, wires: o.target, state_diff: o.state, effects: o.effects, routed_to: o.worlds,
    });
    // canonical attempts: stop at the first success (partial counts as the last resort)
    const phrasings = [t.canonical, ...(t.canonical_retries ?? [])];
    let best = null, bestAttempt = 0;
    for (let i = 0; i < phrasings.length; i++) {
      const o = await runAttempt(engine, { tab: batch.tab, setup, text: phrasings[i] });
      const g = gradeOf(o);
      const lab = { label_status: g === 'success' ? 'canonical-ok' : g === 'partial' ? 'canonical-partial' : 'canonical-failed', target_from: g === 'fail' ? null : 'rules', needs_review: g !== 'success' };
      records.push(mk('canonical', phrasings[i], i + 1, o, lab));
      if (g === 'success' || (g === 'partial' && !best)) { best = o; bestAttempt = i + 1; }
      if (g === 'success') break;
    }
    const canon = best ?? { matched: false };
    const canonicalTarget = best?.target ?? '';
    for (const v of t.variants ?? []) {
      const o = await runAttempt(engine, { tab: batch.tab, setup, text: v });
      records.push(mk('variant', v, bestAttempt || phrasings.length, o, labelVariant(canon, o), { canonicalTarget }));
    }
  }
  return records;
}

/** Per-world summary derived from records. */
export function summarize(records) {
  const byTask = new Map();
  for (const r of records) {
    const k = `${r.batch}/${r.task}`;
    if (!byTask.has(k)) byTask.set(k, { batch: r.batch, task: r.task, goal: r.goal, canon: [], variants: [] });
    byTask.get(k)[r.lineage.role === 'canonical' ? 'canon' : 'variants'].push(r);
  }
  const tasks = [...byTask.values()];
  const ok = tasks.filter((t) => t.canon.some((c) => c.label_status === 'canonical-ok'));
  const labels = {}, splits = {};
  let variants = 0, review = 0, trainable = 0;
  for (const t of tasks) for (const v of t.variants) {
    variants++; labels[v.label_status] = (labels[v.label_status] ?? 0) + 1;
    if (v.needs_review) review++;
    if (v.target_from && v.expected_circuit) trainable++;
  }
  for (const r of records) splits[r.split] = (splits[r.split] ?? 0) + 1;
  const retry = tasks.filter((t) => !t.canon.some((c) => c.label_status === 'canonical-ok')).map((t) => ({
    batch: t.batch, task: t.task, goal: t.goal,
    tried: t.canon.map((c) => ({ attempt: c.attempt, text: c.text, reply: c.reply, label: c.label_status })),
  }));
  return {
    tasks: tasks.length, attempts: records.length,
    canonical_success: ok.length, canonical_success_rate: tasks.length ? Number((ok.length / tasks.length).toFixed(4)) : null,
    variants, variant_labels: labels,
    variant_rules_coverage: variants ? Number(((labels['rules-agree'] ?? 0) / variants).toFixed(4)) : null,
    variants_needing_review: review, trainable_records: trainable + tasks.reduce((n, t) => n + t.canon.filter((c) => c.target_from && c.expected_circuit).length, 0),
    by_split: splits, retry,
  };
}

const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/** Collect inbox files; merges into the existing out files (records of the processed batches are replaced). */
export async function collect({ input, root = DEFAULT_ROOT, outDir = 'training/paraphrases', devShare = 0.1, write = true, engine = null } = {}) {
  const files = statSync(input).isDirectory() ? readdirSync(input).filter((f) => f.endsWith('.json')).sort().map((f) => join(input, f)) : [input];
  engine ??= await createEngine({ loader: createFsLoader({ roots: [root] }) });
  const fresh = new Map(), replaced = new Set(), errors = [];
  for (const f of files) {
    let batch;
    try { batch = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { errors.push(`${f}: ${e.message}`); continue; }
    const bad = checkBatch(batch);
    if (bad.length) { errors.push(`${f}: ${bad.join('; ')}`); continue; }
    if (!engine.set.get(batch.world)) { errors.push(`${f}: unknown world ${batch.world}`); continue; }
    const recs = await collectBatch(engine, batch, { devShare });
    replaced.add(`${batch.world}\n${batch.batch}`);
    fresh.set(batch.world, [...(fresh.get(batch.world) ?? []), ...recs]);
  }
  const outFiles = resolve(outDir, 'out');
  const all = new Map();
  for (const w of new Set([...fresh.keys()])) {
    const keep = readJsonl(join(outFiles, `${w}.jsonl`)).filter((r) => !replaced.has(`${r.world}\n${r.batch}`));
    all.set(w, [...keep, ...fresh.get(w)]);
  }
  const reportFile = join(resolve(outDir), 'report.json');
  const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : { worlds: {} };
  report.worlds ??= {};
  for (const [w, recs] of all) report.worlds[w] = summarize(recs);
  const tot = { tasks: 0, attempts: 0, canonical_success: 0, variants: 0, agree: 0 };
  for (const s of Object.values(report.worlds)) {
    tot.tasks += s.tasks; tot.attempts += s.attempts; tot.canonical_success += s.canonical_success;
    tot.variants += s.variants; tot.agree += s.variant_labels['rules-agree'] ?? 0;
  }
  report.totals = { ...tot, canonical_success_rate: tot.tasks ? Number((tot.canonical_success / tot.tasks).toFixed(4)) : null, variant_rules_coverage: tot.variants ? Number((tot.agree / tot.variants).toFixed(4)) : null };
  if (write && all.size) {
    mkdirSync(outFiles, { recursive: true });
    for (const [w, recs] of all) {
      writeFileSync(join(outFiles, `${w}.jsonl`), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
      const retry = report.worlds[w].retry;
      writeFileSync(join(outFiles, `${w}.retry.json`), JSON.stringify({ world: w, retry }, null, 2) + '\n');
    }
    writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  }
  return { records: all, report, errors, processed: [...fresh.keys()] };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const input = args.find((a, i) => !a.startsWith('--') && !['--root', '--out-dir', '--dev'].includes(args[i - 1]));
  if (!input || !existsSync(input)) { console.error('usage: node scripts/collect-paraphrases.mjs <file|dir> [--report] [--root worlds] [--out-dir training/paraphrases] [--dev 0.1] [--no-write]'); process.exit(2); }
  const { report, errors, processed } = await collect({ input, root: resolve(opt('--root', DEFAULT_ROOT)), outDir: opt('--out-dir', 'training/paraphrases'), devShare: Number(opt('--dev', '0.1')), write: !args.includes('--no-write') });
  for (const e of errors) console.error('error: ' + e);
  for (const w of processed) {
    const s = report.worlds[w];
    console.log(`${w}: ${s.tasks} tasks, canonical ${s.canonical_success}/${s.tasks} (${((s.canonical_success_rate ?? 0) * 100).toFixed(0)}%), variants ${s.variants}, rules coverage ${((s.variant_rules_coverage ?? 0) * 100).toFixed(0)}% ${JSON.stringify(s.variant_labels)}, review ${s.variants_needing_review}`);
    if (s.retry.length) {
      console.log(`  failing canonicals (add a new phrasing to "canonical_retries" and rerun):`);
      for (const r of s.retry) console.log(`  - ${r.batch}/${r.task}: ${r.goal}\n      tried: ${r.tried.map((t) => `"${t.text}" -> ${t.reply}`).join(' | ')}`);
    }
  }
  if (args.includes('--report')) console.log(JSON.stringify(report.totals));
  if (errors.length) process.exitCode = 1;
}
