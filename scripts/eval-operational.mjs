#!/usr/bin/env node
/**
 * The single measure of success (worker-tasks, "The single measure of success (user): the result is correct"):
 * every message of training/eval/operational.jsonl goes through the full pipeline in the webchat configuration and the final
 * state / answer / effects are checked against the expectation written for it. Deterministic (no sampling, fixed order).
 *
 * Configurations come from ONE factory shared with the webchat (src/dialog/runtime-config.mjs, spec 03 section 7.14); `--mode`:
 *   rules       the rule formalizer with the same spellcheck / partial settings (what the webchat answers with while the model loads)
 *   encoder     dispatcher model through onnxruntime-node, rule validation, no normalizer
 *   encoder+n1  the shipped default: encoder plus the seq2seq normalizer as a fallback (default mode)
 *
 *   node scripts/eval-operational.mjs --mode rules
 *   node scripts/eval-operational.mjs --mode encoder+n1 --ort <scratch>/node_modules/onnxruntime-node/dist/index.js
 *   parallelism: --jobs N (default all cores): the cases are sharded over N worker threads (scripts/lib/shard.mjs), each builds its own pipeline through the shared factory, onnxruntime one thread per worker; results merge in the original order, totals identical to --jobs 1. Latency with N > 1 includes CPU contention; cold start / model load are per worker (mean in the report, all in latency.per_worker); warm_cache only with --jobs 1.
 *   options: --model-dir <dir> (dispatcher export: model.int8.onnx, vocab.txt, meta.json) --normalizer-dir <dir> --edit-tau <float> (simplifier threshold) --json (last stdout line = one JSON object {n,right,partly_right,wrong,not_understood,latency_ms}; combine with --no-write)  --limit N  --world <id>  --family <name>  --set <file>  --no-write  --verbose (print non-right cases)  --replies (print every case's outcome and reply, for diffing runs)  --rules-only (alias of --mode rules)  --name <label> (extra label in the file name)
 *
 * onnxruntime-node is NOT a dependency of the repository: install it in a scratch directory and pass the path (like verify-dispatcher-js.mjs).
 *
 * Outcomes per message: right | partly | wrong (it acted or answered, and the result is wrong or contradicts: worse than not understood)
 * | not_understood. Headline = right / all messages, per world and per world group (scripts/lib/world-groups.mjs); latency per message.
 * Writes training/results/operational/<mode>-<dispatcher sha8>-<date>[-label].json (summary + one row per case; each report carries the model
 * hashes, the policy (settings) and cold-start / ready / warm timings) and updates training/results/operational/published.json when the run is the
 * shipped configuration (mode encoder+n1, full set, published models).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { DEFAULT_MODE, MODES, sessionOptions, settingsForMode, runtimeSettings } from '../src/dialog/runtime-config.mjs';
import { openNodeRuntime, modelHashes } from './lib/runtime-node.mjs';
import { isMainThread } from 'node:worker_threads';
import { parseJobs, runSharded, serveShard } from './lib/shard.mjs';
import { groupOf, GROUP_ORDER } from './lib/world-groups.mjs';
import { evaluateCase, classify } from './lib/operational-check.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
const OUTCOMES = ['right', 'partly', 'wrong', 'not_understood'];

export function loadCases(file) {
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// ---- pipeline construction (the one place that differs per mode; the settings come from src/dialog/runtime-config.mjs) -------------
async function buildPipeline({ mode, ortPath, modelDir, normalizerDir, editTau, ortThreads, overrides }) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });   // the translator only acts on Romanian cases (English cases pass language 'en')
  const rt = await openNodeRuntime({ engine, mode, ortPath, dispatcherDir: modelDir, normalizerDir, editTau, ortThreads, overrides });
  return { engine, ...rt };
}

function newSession(engine, settings, c) {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
  return s;
}

export async function runCase(engine, settings, c) {
  const s = newSession(engine, settings, c);
  for (const m of c.setup ?? []) await s.send(m);
  const before = s.state();
  const t0 = performance.now();
  let reply, error = null;
  const ro = c.lang === 'ro';   // Romanian cases (training/eval/operational-ro.jsonl): language auto, the expectations are checked on the English reply
  try { reply = await s.send(c.message, ro ? { language: 'auto' } : undefined); } catch (e) { error = e.message; }
  const ms = performance.now() - t0;
  if (!reply) return { id: c.id, world: c.world, outcome: 'wrong', error, ms };
  const after = s.state();
  const strip = (s) => { const { 'ui.help': _h, ...rest } = s; return JSON.stringify(rest); };   // ui.help only remembers the last unparsed text
  const stateChanged = strip(before) !== strip(after);
  const last = reply.answers.at(-1);
  const replyText = ro ? (reply.trace?.replyEnglish ?? reply.text) : reply.text;
  const unparsedAll = reply.segments.length === 0 || reply.segments.every((x) => x.unparsed);
  const items = evaluateCase(c, { before, after, replyText, effects: reply.effects, statuses: reply.statuses, unparsedAll, values: reply.answers.map((a) => a.value) });
  const outcome = classify(c, items, { statuses: reply.statuses, unparsedAll, stateChanged, effects: reply.effects.filter((e) => e.name !== 'chat.suggest') });
  return {
    id: c.id, world: c.world, outcome, ms,
    reply: replyText.slice(0, 240), ...(ro ? { reply_shown: reply.text.slice(0, 240), lang: reply.lang } : {}), statuses: reply.statuses,
    failing: items.filter((x) => !x.ok && !(x.trivial && items.some((y) => !y.trivial))).map((x) => `${x.kind}:${x.spec}${x.actual !== undefined ? ` (got ${String(x.actual).slice(0, 60)})` : ''}`),
    trivial: items.filter((x) => x.trivial).length,
    n_items: items.filter((x) => !(x.trivial && items.some((y) => !y.trivial))).length,
    strategy: [...new Set(reply.segments.map((x) => x.strategy))].join(','),
    ...(last ? {} : {}),
  };
}

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
function tally(rows) {
  const t = { n: rows.length, right: 0, partly: 0, wrong: 0, not_understood: 0 };
  for (const r of rows) t[r.outcome]++;
  return { ...t, right_pct: pct(t.right, t.n), partly_pct: pct(t.partly, t.n), wrong_pct: pct(t.wrong, t.n), not_understood_pct: pct(t.not_understood, t.n) };
}
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : 0; };

/** Bucket tally for the length tags (mid = 4-8 commands, long = 9-15): the outcome counts plus the expectation items kept/missed (omissions: an item of the gold that did not hold). */
function tagTally(rows) {
  const t = tally(rows);
  const items = rows.reduce((a, r) => a + (r.n_items ?? 0), 0), missed = rows.reduce((a, r) => a + (r.failing?.length ?? 0), 0);
  return { ...t, items, items_missed: missed, items_missed_pct: pct(missed, items) };
}

export function summarize(cases, rows) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const joined = rows.map((r) => ({ ...r, c: byId.get(r.id) }));
  const group = (keyFn, order) => {
    const keys = [...new Set(joined.map(keyFn))];
    keys.sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b)));
    return Object.fromEntries(keys.map((k) => [k, tally(joined.filter((r) => keyFn(r) === k))]));
  };
  const families = {};
  for (const r of joined) for (const f of r.c.families ?? []) (families[f] ??= []).push(r);
  const ms = rows.map((r) => r.ms);
  return {
    headline: tally(joined),
    excluding_known_gaps: tally(joined.filter((r) => !r.c.known_gap)),
    known_gap_only: tally(joined.filter((r) => r.c.known_gap)),
    by_tag: Object.fromEntries(['mid', 'long'].filter((t) => joined.some((r) => (r.c.tags ?? []).includes(t))).map((t) => [t, tagTally(joined.filter((r) => (r.c.tags ?? []).includes(t)))])),
    by_group: group((r) => groupOf(r.world), GROUP_ORDER),
    by_world: group((r) => r.world),
    by_family: Object.fromEntries(Object.entries(families).sort().map(([k, v]) => [k, tally(v)])),
    latency_ms: { mean: Math.round(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)), p50: quant(ms, 0.5), p95: quant(ms, 0.95), max: Math.round(Math.max(0, ...ms)) },
  };
}

const sha8 = (h) => (h ? h.slice(0, 8) : 'nomodel');

async function main() {
  const file = resolve(arg('set', join(REPO, 'training/eval/operational.jsonl')));
  let cases = loadCases(file);
  const fullSet = !arg('world') && !arg('family') && !arg('limit');
  if (arg('world')) cases = cases.filter((c) => c.world === arg('world'));
  if (arg('family')) cases = cases.filter((c) => (c.families ?? []).includes(arg('family')));
  if (arg('limit')) cases = cases.slice(0, Number(arg('limit')));
  const mode = flag('rules-only') ? 'rules' : arg('mode', DEFAULT_MODE);
  if (!MODES[mode]) throw new Error(`--mode must be one of ${Object.keys(MODES).join(' | ')}`);
  const modelDir = arg('model-dir', arg('model', join(REPO, 'docs/webchat/models/dispatcher')));
  const normalizerDir = arg('normalizer-dir', join(REPO, 'docs/webchat/models/normalizer'));
  const popts = { mode, ortPath: arg('ort'), modelDir, normalizerDir, editTau: arg('edit-tau') !== undefined ? Number(arg('edit-tau')) : undefined, overrides: arg('best-effort') ? { bestEffort: arg('best-effort') !== 'off' } : {} };   // --best-effort on|off: A/B of spec 03 7.15
  const jobs = Math.max(1, Math.min(parseJobs(), cases.length || 1));
  const note = (c, r) => {
    if (flag('replies') && !flag('json')) console.log(`${c.id}\t${r.outcome}\t${JSON.stringify(r.reply ?? r.error ?? null)}`);
    if (flag('verbose') && !flag('json') && r.outcome !== 'right') console.log(`${r.outcome.padEnd(14)} ${c.world.padEnd(15)} ${c.id}  "${c.message}"  -> ${r.reply ?? r.error}  [${(r.failing ?? []).join('; ')}]`);
  };
  const lat = (a) => ({ n: a.length, mean: Math.round(a.reduce((x, y) => x + y, 0) / (a.length || 1)), p50: quant(a, 0.5), p95: quant(a, 0.95), max: Math.round(Math.max(0, ...a)) });
  // Latency regimes (G5): cold start = start of the pipeline to ready models (per worker); first message = the first answer after loading (runtime warm-up,
  // nothing memoized); steady state = the later messages; warm cache = a second pass over the first cases with the validator's memo filled (single job only).
  let rows, info, latency;
  if (jobs === 1) {
    const tStart = performance.now();
    const pipe = await buildPipeline(popts);
    info = pipe.info;
    const coldStartMs = Math.round(performance.now() - tStart);
    rows = [];
    for (const c of cases) { const r = await runCase(pipe.engine, pipe.settings, c); rows.push(r); note(c, r); }
    const ms = rows.map((r) => r.ms);
    const warm = [];
    for (const c of cases.slice(0, Math.min(20, cases.length))) warm.push((await runCase(pipe.engine, pipe.settings, c)).ms);
    latency = { jobs, cold_start_ms: coldStartMs, model_load_ms: info.load_ms, first_message_ms: Math.round(ms[0] ?? 0), steady_state: lat(ms.slice(1)), warm_cache: lat(warm), normalizer_propose: pipe.normalizerHost ? lat(pipe.normalizerHost.timings) : null };
  } else {
    rows = await runSharded({ file: SELF, items: cases, jobs, workerData: { ...popts, ortThreads: mode === 'rules' ? 0 : 1 } });
    cases.forEach((c, i) => note(c, rows[i]));
    const loads = rows.filter((r) => r._load).map((r) => ({ ...r._load, first_message_ms: Math.round(r.ms) }));
    const firstIds = new Set(rows.filter((r) => r._load).map((r) => r.id));
    for (const r of rows) delete r._load;
    const dDir = resolve(modelDir);
    info = { mode, settings: runtimeSettings({ ...settingsForMode(mode), ...popts.overrides }), hashes: mode === 'rules' ? null : modelHashes({ dispatcherDir: dDir, normalizerDir: resolve(normalizerDir), withNormalizer: settingsForMode(mode).normalizer !== false }) };
    const mean = (k) => Math.round(loads.reduce((x, l) => x + l[k], 0) / (loads.length || 1));
    latency = { jobs, workers: loads.length, cold_start_ms: mean('cold_start_ms'), cold_start_ms_max: Math.max(0, ...loads.map((l) => l.cold_start_ms)), model_load_ms: { dispatcher: loads[0]?.load_ms.dispatcher ?? null, normalizer: loads[0]?.load_ms.normalizer ?? null, note: 'first worker; per worker in per_worker' }, first_message_ms: mean('first_message_ms'), steady_state: lat(rows.filter((r) => !firstIds.has(r.id)).map((r) => r.ms)), warm_cache: null, normalizer_propose: null, contention: 'per-message latency includes CPU contention of the other workers; use --jobs 1 for single-thread latency', per_worker: loads };
  }
  const summary = summarize(cases, rows);
  const dsha = info.hashes?.dispatcher?.sha256 ?? null;
  const config = { mode, jobs, formalizer: settingsForMode(mode).formalizer, policy: info.settings, hashes: info.hashes, set: file.replace(`${REPO}/`, ''), cases: cases.length, full_set: fullSet, date: new Date().toISOString().slice(0, 10) };
  const out = { config, ...summary, latency, cases: rows.map(({ ms, ...r }) => ({ ...r, ms: Math.round(ms) })) };
  const h = summary.headline;
  if (!flag('json')) {
    console.log(`mode ${mode}: ${h.n} messages  right ${h.right_pct}%  partly ${h.partly_pct}%  wrong ${h.wrong_pct}%  not understood ${h.not_understood_pct}%`);
    console.log(`  latency: cold start ${latency.cold_start_ms} ms${jobs > 1 ? ` (mean of ${latency.workers} workers)` : ''} (dispatcher load ${latency.model_load_ms.dispatcher ?? '-'} ms, normalizer load ${latency.model_load_ms.normalizer ?? '-'} ms)  first message ${latency.first_message_ms} ms  steady p50 ${latency.steady_state.p50} / p95 ${latency.steady_state.p95} ms  warm cache ${latency.warm_cache ? `p50 ${latency.warm_cache.p50} / p95 ${latency.warm_cache.p95} ms` : 'n/a (sharded)'}`);
    for (const [g, t] of Object.entries(summary.by_tag ?? {})) console.log(`  [${g}] n=${t.n}  right ${t.right_pct}%  partly(omissions) ${t.partly_pct}%  wrong ${t.wrong_pct}%  nu ${t.not_understood_pct}%  gold items missed ${t.items_missed}/${t.items} (${t.items_missed_pct}%)`);
    for (const [g, t] of Object.entries(summary.by_group)) console.log(`  ${g.padEnd(24)} n=${String(t.n).padStart(4)}  right ${String(t.right_pct).padStart(5)}%  partly ${String(t.partly_pct).padStart(5)}%  wrong ${String(t.wrong_pct).padStart(5)}%  nu ${String(t.not_understood_pct).padStart(5)}%`);
  }
  if (!flag('no-write')) {
    const dir = join(REPO, 'training/results/operational');
    mkdirSync(dir, { recursive: true });
    const label = arg('name') ? `-${arg('name')}` : '';
    const rel = `training/results/operational/${mode}-${sha8(dsha)}-${config.date}${label}${fullSet ? '' : `-limit${cases.length}`}.json`;
    writeFileSync(join(REPO, rel), `${JSON.stringify(out, null, 1)}\n`);
    if (!flag('json')) console.log(`wrote ${rel}`);
    // the manifest records the published (shipped) configuration: mode encoder+n1, the whole set, the published model files
    if (fullSet && mode === DEFAULT_MODE && info.hashes?.dispatcher?.match && info.hashes?.normalizer?.match) {
      writeFileSync(join(dir, 'published.json'), `${JSON.stringify({ file: rel, mode, date: config.date, dispatcher_sha256: dsha, normalizer_sha256: info.hashes.normalizer.meta_sha256, policy: info.settings, headline: { n: h.n, right_pct: h.right_pct, wrong_pct: h.wrong_pct, not_understood_pct: h.not_understood_pct } }, null, 1)}\n`);
    }
  }
  if (flag('ro') && !flag('json')) {   // Romanian column: the same evaluator over training/eval/operational-ro.jsonl (build it with scripts/build-ro-eval.mjs)
    const roFile = join(REPO, 'training/eval/operational-ro.jsonl');
    if (existsSync(roFile)) {
      const pipe = await buildPipeline(popts);
      const roCases = loadCases(roFile);
      const roRows = [];
      for (const c of roCases) roRows.push(await runCase(pipe.engine, pipe.settings, c));
      const bd = (rows, v) => tally(rows.filter((r, i) => roCases[i].variant === v));
      const all = tally(roRows), dia = bd(roRows, 'diacritics'), cas = bd(roRows, 'casual');
      const line = (n, t) => console.log(`  ${n.padEnd(24)} n=${String(t.n).padStart(4)}  right ${String(t.right_pct).padStart(5)}%  partly ${String(t.partly_pct).padStart(5)}%  wrong ${String(t.wrong_pct).padStart(5)}%  nu ${String(t.not_understood_pct).padStart(5)}%`);
      console.log(`Romanian (language auto, English reply checked): ${all.n} messages  right ${all.right_pct}%  wrong ${all.wrong_pct}%`);
      line('with diacritics', dia); line('casual, no diacritics', cas);
      for (const [g, t] of Object.entries(summarize(roCases, roRows).by_group)) line(`ro ${g}`, t);
      const unq = (t) => String(t).replace(/"[^"]*"/g, '');   // the user's own quoted words stay as typed
      const mixed = roRows.filter((r) => r.reply_shown && unq(r.reply_shown) !== unq(r.reply) && /\b(the|you|your|is|my|I|did|could|can|what|how|and|with|have|has)\b/.test(unq(r.reply_shown)));
      const keptEnglish = roRows.filter((r) => r.lang === 'ro' && r.reply_shown && unq(r.reply_shown) === unq(r.reply)).length;
      console.log(`  replies: ${roRows.length - keptEnglish - mixed.length} in Romanian, ${keptEnglish} kept in English (could not be translated fully), ${mixed.length} mixed`);
      if (!flag('no-write')) writeFileSync(join(REPO, `training/results/operational/ro-${mode}-${config.date}.json`), `${JSON.stringify({ config, all, diacritics: dia, casual: cas, by_world: summarize(roCases, roRows).by_world, cases: roRows.map(({ ms, ...r }) => r) }, null, 1)}\n`);
    } else console.log('no Romanian set: run scripts/build-ro-eval.mjs');
  }
  // checkpoint-selection contract: exactly one JSON object on the last stdout line
  if (flag('json')) console.log(JSON.stringify({ n: h.n, right: h.right, partly_right: h.partly, wrong: h.wrong, not_understood: h.not_understood, latency_ms: summary.latency_ms.mean }));
}

if (!isMainThread) {
  // shard worker: builds its own pipeline through the shared factory (runtime-config via openNodeRuntime); the first row it returns carries its load info
  serveShard(async (wd) => {
    const t0 = performance.now();
    const env = await buildPipeline(wd);
    const load = { cold_start_ms: Math.round(performance.now() - t0), load_ms: env.info.load_ms };
    let sent = false;
    return async (c) => { const r = await runCase(env.engine, env.settings, c); if (!sent) { sent = true; r._load = load; } return r; };
  });
} else if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
