#!/usr/bin/env node
/**
 * D5 learning loop (training/README.md "Learning loop"): phrase-log exports + failure traces of the evaluation scripts -> self-labelled training rows,
 * a review queue, and (with --retrain) a rebuilt dataset and a retrained dispatcher in one command.
 *
 * Every message is replayed through the shipped pipeline (src/dialog/runtime-config.mjs factory via scripts/lib/runtime-node.mjs, sessions sharded with
 * scripts/lib/shard.mjs; the tab, earlier turns and initial state of the log are replayed). The validator trace decides (scripts/lib/learn-logs.mjs):
 *   SELF-LABEL  only when the dispatcher + validation layer resolved EVERY piece validly and clearly: the winning segmentation is class 0 (complete reading
 *               of the original text; no generated, normalizer, simplified, spelling-corrected, partial or best-effort reading), the dispatcher's own top
 *               world with probability >= 0.8, no other world reads the piece within 2.0 log units, no other segmentation with other cuts within 1.0, every
 *               status supported, an observable effect (state change, answer or effect), and the user did not correct it afterwards (negative feedback or
 *               "no / wrong / I meant ..." within the next two turns). The message after such a correction is kept (`corrects`).
 *   QUEUE       everything else, with the reasons, grouped by world candidate and nearest pattern example (canonical marks preferred on ties).
 *
 *   node scripts/learn-from-logs.mjs --ort <onnxruntime-node entry> [--jobs N] [--mode encoder|encoder+n1|rules]
 *       [--logs training/phrase-logs] [--out-root training/phrase-logs]
 *       [--from-gold <heldout out dir | jsonl>] [--from-eval <eval-operational report.json>=<cases.jsonl>]...   fake logs (simulation; gold is scored)
 *       [--dispatcher-dir <export dir>] [--min-world-score .8] [--min-piece-margin 2] [--min-seg-gap 1] [--allow-spell]
 *       [--dry-run]   analyse and print, write nothing, only PRINT the --retrain commands
 *       [--retrain [--version vN]]   after labelling: relabel + build-dataset (labelled rows included) + multicmd + check_splits + dispatcher training + export
 *       [--report <file.json>] [--no-write]
 *
 * Outputs (under --out-root): labelled/<log name>.jsonl (dataset-format rows, label_status self-validated, one per segment), review.jsonl (merged with the
 * earlier queue by id), and a JSON report. scripts/build-dataset.mjs reads labelled/ and ignores review.jsonl.
 * English only: labelled and queued text is the English reading; the original-language text stays in the source record (`source_ref`).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { DEFAULT_MODE, MODES, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { openNodeRuntime } from './lib/runtime-node.mjs';
import { parseJobs, runSharded, serveShard } from './lib/shard.mjs';
import { serialize, parse } from '../src/soplang/index.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { visibleState } from './lib/visible-state.mjs';
import {
  isComplaintRecord, thumbsOf, listLogFiles, loadLogRecords, recordsFromGold, recordsFromEval, sessionsOf, correctionSignals, summarizeReply, decideSelfLabel, labelledRows, queueRow,
  candidateWorlds, buildPatternIndex, nearestExample, SELF_LABEL_RULES,
} from './lib/learn-logs.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SELF), '..');
const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > 0 && !argv[i + 1]?.startsWith('--') ? argv[i + 1] : d; };
const args = (k) => argv.flatMap((a, i) => (a === `--${k}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []));
const flag = (k) => argv.includes(`--${k}`);
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

// ---- the replay (runs in shard workers) ----------------------------------------------------------------------------------------------
const strip = (st) => JSON.stringify(visibleState(st));

/** Replays one session (records in time order) through the pipeline; one result per record. */
export async function replaySession(env, session) {
  const { engine, settings } = env;
  const lang0 = session.some((r) => (r.lang ?? 'en') !== 'en') ? 'auto' : 'en';
  const s = engine.createSession(sessionOptions(settings, { language: lang0 }));
  const first = session[0];
  for (const [w, patch] of Object.entries(first?.init ?? {})) s.setWorldState(w, patch);
  const legends = engine.set.legends;
  const out = [];
  for (const r of session) {
    if (r.tab) s.setWorldState('ui.shell', { activeTab: r.tab });
    const before = s.state();
    let reply = null, error = null;
    try { reply = await s.send(r.text, { language: (r.lang ?? 'en') === 'en' ? 'en' : 'auto' }); } catch (e) { error = e.message; }
    if (!reply) { out.push({ id: r._id, error, sum: null }); continue; }
    const sum = summarizeReply(reply, { stateChanged: strip(before) !== strip(s.state()) });
    const sops = reply.segments.map((sg) => serialize((sg.wires ?? []).filter((w) => w.type !== 'core.agent')));
    let goldCircuitOk = null;
    const allWires = reply.segments.flatMap((sg) => sg.wires ?? []);
    if (r.gold?.circuit) {
      try {
        const g = parse(r.gold.circuit, { source: r._id });
        goldCircuitOk = !g.errors.length && JSON.stringify(normalizedSop(allWires, legends)) === JSON.stringify(normalizedSop(g.wires, legends));
      } catch { goldCircuitOk = false; }
    }
    out.push({ id: r._id, sum, sops, candidates: candidateWorlds(reply, sum), englishText: reply.trace?.english ?? r.text, goldCircuitOk });
  }
  return out;
}

async function buildEnv(wd) {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const rt = await openNodeRuntime({ engine, mode: wd.mode, ortPath: wd.ort, dispatcherDir: wd.dispatcherDir, normalizerDir: wd.normalizerDir, ortThreads: wd.ortThreads });
  return { engine, ...rt };
}

// ---- retraining commands (the exact R3 commands, worker-log "R3 combined rebuild + retrain + publish") ---------------------------------
export function retrainCommands({ version }) {
  const run = `dispatcher-distilbert-${version}`;
  return [
    { cwd: '.', cmd: ['node', 'scripts/relabel-training.mjs', '--in-place'], note: 'repair labels of training/data + training/paraphrases/out (R3 step 1)' },
    { cwd: '.', cmd: ['node', 'scripts/build-dataset.mjs'], note: 'rebuild training/dataset; reads training/phrase-logs/labelled/*.jsonl (self-validated rows -> per-world train/dev/test and routing)' },
    { cwd: 'training', cmd: ['python', '-m', 'psys2_train.multicmd'], note: 'multi-command messages from the rebuilt per-world records' },
    { cwd: 'training', cmd: ['python', '-m', 'psys2_train.check_splits'], note: 'group-leak check (exit 1 on a leak)' },
    { cwd: 'training', cmd: ['python', '-m', 'psys2_train.dispatcher', '--model', 'distilbert-base-uncased', '--no-lora', '--lr', '5e-5', '--epochs', '6', '--no-select', '--keep-ckpts', '3', '--out', `runs/${run}`], note: 'needs the GPU (require_cuda); R3 settings, 3 checkpoints kept' },
    { cwd: 'training', cmd: ['python', '-m', 'psys2_train.export_onnx', '--ckpt', `runs/${run}`], note: 'export + int8; then choose checkpoint / tau with scripts/eval-operational.mjs --model-dir <export> and publish with scripts/build-webchat.mjs --models (reviewer decision)' },
  ];
}

function runRetrain({ version, dry }) {
  for (const { cwd, cmd, note } of retrainCommands({ version })) {
    const shown = `(cd ${cwd} && ${cmd.join(' ')})`;
    console.log(`${dry ? '[dry-run] ' : ''}${shown}   # ${note}`);
    if (dry) continue;
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: join(REPO, cwd), stdio: 'inherit' });
    if (r.status !== 0) { console.error(`retrain step failed (exit ${r.status}): ${shown}`); process.exit(r.status ?? 1); }
  }
}

// ---- main ------------------------------------------------------------------------------------------------------------------------------
async function main() {
  const dry = flag('dry-run');
  const version = arg('version', `learn-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  const logsPath = resolve(REPO, arg('logs', 'training/phrase-logs'));
  const outRoot = resolve(REPO, arg('out-root', 'training/phrase-logs'));
  const mode = arg('mode', DEFAULT_MODE);
  if (!MODES[mode]) throw new Error(`--mode must be one of ${Object.keys(MODES).join(' | ')}`);
  const rules = { ...SELF_LABEL_RULES };
  if (arg('min-world-score')) rules.minWorldScore = Number(arg('min-world-score'));
  if (arg('min-piece-margin')) rules.minPieceMargin = Number(arg('min-piece-margin'));
  if (arg('min-seg-gap')) rules.minSegGap = Number(arg('min-seg-gap'));
  if (flag('allow-spell')) rules.allowSpell = true;

  // records: real exports + fake logs (gold, eval failures)
  let records = [];
  for (const f of listLogFiles(logsPath)) records.push(...loadLogRecords(f));
  for (const g of args('from-gold')) {
    const files = g.endsWith('.jsonl') ? [g] : readdirSync(g).filter((x) => x.endsWith('.jsonl')).sort().map((x) => join(g, x));
    for (const f of files) records.push(...recordsFromGold(readJsonl(f).map((r) => ({ ...r, world: r.world ?? basename(f, '.jsonl') })), { file: `gold-${basename(f, '.jsonl')}` }));
  }
  for (const spec of args('from-eval')) {
    const [rep, cases] = spec.split('=');
    records.push(...recordsFromEval(JSON.parse(readFileSync(rep, 'utf8')), readJsonl(cases), { file: `eval-${basename(rep, '.json')}` }));
  }
  const live = records.filter((r) => !r.replayOnly);
  console.log(`${live.length} messages from ${new Set(live.map((r) => r._file)).size} source file(s)${records.length - live.length ? ` (+ ${records.length - live.length} replayed setup turns)` : ''}`);

  const report = { date: new Date().toISOString().slice(0, 10), mode, rules, inputs: { messages: live.length }, labelled: null, queued: null };
  if (live.length) {
    const sessions = sessionsOf(records).map((s) => s.sort((a, b) => (a.replayOnly ? 0 : 1) - (b.replayOnly ? 0 : 1) || String(a.time ?? '').localeCompare(String(b.time ?? ''))));
    const jobs = Math.max(1, Math.min(parseJobs(), sessions.length));
    const wd = { mode, ort: arg('ort'), dispatcherDir: arg('dispatcher-dir') && resolve(arg('dispatcher-dir')), normalizerDir: arg('normalizer-dir') && resolve(arg('normalizer-dir')), ortThreads: mode === 'rules' ? 0 : 1 };
    const t0 = performance.now();
    const replayed = await runSharded({ file: SELF, items: sessions, jobs, workerData: wd });
    console.log(`replayed ${sessions.length} session(s) with ${jobs} job(s) in ${Math.round((performance.now() - t0) / 1000)} s`);
    const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
    const index = buildPatternIndex(engine.set.list());

    const labelled = new Map(), queue = [], reasons = {}, gold = { world_n: 0, world_ok: 0, circuit_n: 0, circuit_ok: 0, queued_world_n: 0, queued_world_ok: 0, queued_circuit_n: 0, queued_circuit_ok: 0, wrong: [] };
    const byWorld = {}, bySource = {}, skipped = { feedback: 0, errors: 0 };
    const fbCounts = { up: 0, down: 0, down_with_wanted: 0, down_with_correction: 0, up_labelled: 0, down_queued: 0 };   // FB: thumbs in the logs
    const textOfLogId = new Map(live.filter((r) => r.id).map((r) => [r.id, r.text]));
    sessions.forEach((session, si) => {
      const sig = correctionSignals(session);
      session.forEach((rec, i) => {
        if (rec.replayOnly) return;
        const res = replayed[si][i];
        if (!res?.sum) { skipped.errors++; return; }
        const thumbs = thumbsOf(rec);
        if (thumbs.vote === 'up') fbCounts.up++;
        if (thumbs.vote === 'down') { fbCounts.down++; if (thumbs.wanted) fbCounts.down_with_wanted++; if (thumbs.correction) fbCounts.down_with_correction++; }
        const signals = { feedback: isComplaintRecord(rec), corrected: sig[i].correctedBy >= 0, vote: thumbs.vote };   // a message that is merely worded like a correction ("undo") may still be a clean command
        const dec = decideSelfLabel(res.sum, signals, rules);
        const src = rec._file.startsWith('gold-') ? 'gold' : rec._file.startsWith('eval-') ? rec._file.replace(/^eval-/, '').replace(/^encoder\+n1-[0-9a-f]+-[\d-]+-/, '') : 'phrase-log';
        const bs = (bySource[src] ??= { messages: 0, labelled: 0, queued: 0 });
        bs.messages++;
        // gold scoring (fake logs only): world of a single-piece message, circuit of a held-out message
        const single = res.sum.pieces.length === 1 && !rec.gold?.multi;
        const worldOk = rec.gold?.world && single ? res.sum.pieces[0].world === rec.gold.world : null;
        const circuitOk = res.goldCircuitOk;
        const score = (key, ok) => { if (ok == null) return; gold[`${key}_n`]++; if (ok) gold[`${key}_ok`]++; };
        if (dec.ok) {
          bs.labelled++; if (thumbs.vote === 'up') fbCounts.up_labelled++;
          score('world', worldOk); score('circuit', circuitOk);
          if (worldOk === false || circuitOk === false) gold.wrong.push({ text: res.englishText, world: res.sum.pieces.map((p) => p.world).join(','), gold_world: rec.gold?.world, circuit_ok: circuitOk, world_ok: worldOk });
          const ctx = session.slice(Math.max(0, i - 3), i).map((x) => x.text).filter(Boolean);   // the turns the session had seen (the dataset's `context`)
          const rows = labelledRows({ rec, sum: res.sum, sops: res.sops, context: ctx, correctsId: sig[i].corrects >= 0 ? session[sig[i].corrects]._id : null });
          const key = basename(rec._file, '.jsonl');
          if (!labelled.has(key)) labelled.set(key, []);
          labelled.get(key).push(...rows);
          for (const r of rows) byWorld[r.world] = (byWorld[r.world] ?? 0) + 1;
        } else if (sig[i].feedback && !res.sum.dispatch) {
          skipped.feedback++;   // "that is wrong": a meta message, not a phrase to learn
        } else {
          bs.queued++;
          score('queued_world', worldOk); score('queued_circuit', circuitOk);
          for (const r of dec.reasons) reasons[r] = (reasons[r] ?? 0) + 1;
          const candidates = res.candidates;
          const nearest = nearestExample(res.englishText, index, candidates.slice(0, 3).map((c) => c.world)) ?? nearestExample(res.englishText, index);
          if (thumbs.vote === 'down') fbCounts.down_queued++;
          queue.push(queueRow({ rec, text: res.englishText, reasons: dec.reasons, sum: res.sum, candidates, nearest, correctionText: thumbs.correction ? textOfLogId.get(thumbs.correction) ?? null : null }));
        }
      });
    });
    const nLab = [...labelled.values()].reduce((a, r) => a + r.length, 0);
    const nMsgLab = new Set([...labelled.values()].flat().map((r) => r.source_ref.id)).size;
    const queuedByWorld = {};
    for (const q of queue) queuedByWorld[q.world_candidate] = (queuedByWorld[q.world_candidate] ?? 0) + 1;
    const groups = {};
    for (const q of queue) groups[q.group] = (groups[q.group] ?? 0) + 1;
    report.labelled = { messages: nMsgLab, rows: nLab, by_world: Object.fromEntries(Object.entries(byWorld).sort()), precision: { world: { n: gold.world_n, ok: gold.world_ok, pct: pct(gold.world_ok, gold.world_n) }, circuit: { n: gold.circuit_n, ok: gold.circuit_ok, pct: pct(gold.circuit_ok, gold.circuit_n) }, wrong: gold.wrong.slice(0, 40) } };
    report.queued = { messages: queue.length, by_world_candidate: Object.fromEntries(Object.entries(queuedByWorld).sort((a, b) => b[1] - a[1])), top_groups: Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 30), reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])),
      gold_in_queue: { world: { n: gold.queued_world_n, ok: gold.queued_world_ok }, circuit: { n: gold.queued_circuit_n, ok: gold.queued_circuit_ok } } };
    report.skipped = skipped;
    report.feedback = fbCounts;
    if (fbCounts.up || fbCounts.down) console.log(`thumbs: ${fbCounts.up} up (${fbCounts.up_labelled} self-validated), ${fbCounts.down} down (${fbCounts.down_with_wanted} with a wanted text, ${fbCounts.down_with_correction} with a correction, ${fbCounts.down_queued} queued first)`);
    report.by_source = bySource;
    console.log(`self-labelled ${nMsgLab} of ${live.length} messages (${nLab} segment rows)  queued ${queue.length}  skipped ${skipped.feedback} feedback + ${skipped.errors} errors`);
    if (gold.world_n || gold.circuit_n) console.log(`precision of self-labelling vs gold: world ${gold.world_ok}/${gold.world_n} (${pct(gold.world_ok, gold.world_n)}%)  circuit ${gold.circuit_ok}/${gold.circuit_n} (${pct(gold.circuit_ok, gold.circuit_n)}%)`);
    console.log(`by source: ${JSON.stringify(bySource)}`);
    console.log(`self-labelled by world: ${JSON.stringify(report.labelled.by_world)}`);
    console.log(`queued by world candidate: ${JSON.stringify(report.queued.by_world_candidate)}`);
    console.log(`queue reasons: ${JSON.stringify(report.queued.reasons)}`);

    if (!dry && !flag('no-write')) {
      mkdirSync(join(outRoot, 'labelled'), { recursive: true });
      for (const [name, rows] of labelled) writeFileSync(join(outRoot, 'labelled', `${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      const rf = join(outRoot, 'review.jsonl');
      const old = existsSync(rf) ? readJsonl(rf) : [];
      const fresh = new Set(queue.map((q) => q.id)), nowLabelled = new Set([...labelled.values()].flat().map((r) => r.source_ref.id));
      const merged = [...old.filter((q) => !fresh.has(q.id) && !nowLabelled.has(q.id)), ...queue].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || a.group.localeCompare(b.group) || a.text.localeCompare(b.text));
      writeFileSync(rf, merged.map((q) => JSON.stringify(q)).join('\n') + (merged.length ? '\n' : ''));
      console.log(`wrote ${[...labelled.keys()].length} labelled file(s) and ${rf.replace(`${REPO}/`, '')} (${merged.length} rows)`);
    } else console.log('dry run: nothing written');
  } else console.log('no messages to learn from');

  if (arg('report') && !dry) { mkdirSync(dirname(resolve(arg('report'))), { recursive: true }); writeFileSync(resolve(arg('report')), `${JSON.stringify(report, null, 1)}\n`); }
  if (flag('retrain')) runRetrain({ version, dry });
}

if (!isMainThread) {
  serveShard(async (wd) => {
    const env = await buildEnv(wd);
    return (session) => replaySession(env, session);
  });
} else if (process.argv[1] && resolve(process.argv[1]) === SELF) await main();
