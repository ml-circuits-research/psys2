#!/usr/bin/env node
/**
 * Evaluation of the dispatcher + rule-validation layer on prediction JSONL files (worker-tasks D3; spec 03 section 7).
 * Deterministic, standard library only, parallel over worker threads (the engine is loaded once per thread).
 *
 * Input: dispatcher prediction JSONL (contract in spec 03 section 7). Default: training/runs/dispatch-pred/*.jsonl; `--pred <file>` (repeatable).
 * Gold is joined by `id` (scripts/lib/dispatch-gold.mjs): the producer must write the dataset record id as `id` (per-world test record id,
 * routing row id, or multi-command message id mc......). Records without gold are counted and skipped.
 *
 * Per record, four modes (all through validateDispatch):
 *   A  top1+rules          beam 1, top-1 world per piece, original text, rules only (no interpreter): the dispatcher alone with the rules
 *   B  top3+validation     beam 4, top-3 worlds, original text, rules + interpreter
 *   C  top3+simplify+val   as B plus the simplified text of each piece (equals B when no piece has `simplified`)
 *   Bni                    as B without the interpreter check (shows what the interpreter check costs or gains)
 *   Br                     as B, but a piece the rules parse completely and the interpreter refuses (unsupported/error, e.g. an illegal chess move) still counts as understood, with a smaller penalty (policy acceptRefused)
 * Exact SOP: the concatenation, in message order, of the id-normalized SOP of every produced piece (normalizedSop) equals the concatenation of
 * the id-normalized SOP of each gold segment's target (single records: the one target; multi-command: the targets of the segments' source
 * records). A negative record is correct when the result is `not_understood`. Records without a target (routing-only rows) are not scored end to end.
 * Segmentation match: same number of pieces and every piece overlaps its gold segment with character IoU >= --seg-iou (default 0.6).
 *
 * Usage: node scripts/eval-dispatch.mjs [--pred <file>]... [--name <n>] [--jobs N] [--policy '<json>'] [--seg-iou 0.6] [--limit N] [--no-write]
 * Writes training/results/dispatch-<name>.json and training/runs/dispatch-<name>-traces.jsonl (per-record traces).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatchValidator, normalizePrediction } from '../src/dialog/dispatch-validate.mjs';
import { parse } from '../src/soplang/index.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { groupOf, GROUP_ORDER } from './lib/world-groups.mjs';
import { loadGold, segmentationMatches, segmentCounts } from './lib/dispatch-gold.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATASET = join(REPO, 'training/dataset');
const CHUNK = 40;

export const MODES = {
  A: { maxSegmentations: 1, maxWorlds: 1, trySimplified: false, useInterpreter: false },
  B: { trySimplified: false },
  C: {},
  Bni: { trySimplified: false, useInterpreter: false },
  Br: { trySimplified: false, acceptRefused: true },
};

// ---- worker side ---------------------------------------------------------------------------------------------------
const circuits = (pieces, legends) => pieces.flatMap((p) => normalizedSop(p.wires, legends));

function goldCircuits(gold, legends) {
  const out = [];
  for (const s of gold.segments) {
    if (!s.target) continue;
    const p = parse(s.target, { source: gold.id });
    if (p.errors.length) return null;
    out.push(...normalizedSop(p.wires, legends));
  }
  return out;
}

const worldOk = (gseg, w) => w === gseg.world || (gseg.alt_worlds ?? []).includes(w);

function evalRecord(env, pred, gold, o) {
  const { validator, legends } = env;
  validator.clearCache();
  const np = normalizePrediction(pred);
  const gsegs = gold.segments;
  const pos = !gold.negative;
  const target = pos && gold.hasTarget ? goldCircuits(gold, legends) : null;
  const scored = gold.negative || (gold.hasTarget && target != null);
  const outs = {};
  for (const [m, ov] of Object.entries(MODES)) {
    const hasSimp = np.segmentations.some((s) => s.segments.some((p) => p.simplified));
    outs[m] = m === 'C' && !hasSimp && outs.B ? outs.B : validator.validate(np, { ...o.policy, ...ov });
  }
  return Promise.all(Object.values(outs)).then((res) => {
    const out = Object.fromEntries(Object.keys(outs).map((m, i) => [m, res[i]]));
    const ok = {};
    for (const m of Object.keys(out)) {
      if (!scored) { ok[m] = null; continue; }
      ok[m] = gold.negative ? out[m].status === 'not_understood'
        : out[m].status === 'understood' && JSON.stringify(circuits(out[m].produced, legends)) === JSON.stringify(target);
    }
    // coverage and segmentation
    const beam = np.segmentations.slice(0, 4);
    const mi = beam.findIndex((s) => segmentationMatches(s.segments, gsegs, o.segIou));
    const top1Match = beam[0] ? segmentationMatches(beam[0].segments, gsegs, o.segIou) : false;
    const segc = beam[0] ? segmentCounts(beam[0].segments, gsegs, o.segIou) : { tp: 0, pred: 0, gold: gsegs.length };
    let wTop1 = false, wTop3 = false;
    if (mi >= 0) {
      const ps = beam[mi].segments;
      wTop1 = ps.every((p, i) => p.worlds[0] && worldOk(gsegs[i], p.worlds[0].world));
      wTop3 = ps.every((p, i) => p.worlds.slice(0, 3).some((w) => worldOk(gsegs[i], w.world)));
    }
    // rejection and recovery (mode B): dispatcher top-1 has a wrong world but the right one is in the top 3
    let recoverable = false, rejected = false, recovered = false, wrongAccepted = false;
    if (pos && top1Match && !wTop1 && wTop3) {
      recoverable = true;
      const tb = out.B.trace.segmentations[0];
      const wrongPieces = beam[0].segments.map((p, i) => ({ p, i })).filter(({ p, i }) => !(p.worlds[0] && worldOk(gsegs[i], p.worlds[0].world)));
      rejected = wrongPieces.every(({ i }) => { const a = tb?.pieces[i]?.attempts.find((x) => x.rank === 1 && x.variant === 'original'); return a && !a.valid; });
      recovered = ok.B === true;
      wrongAccepted = !rejected;
    }
    // failure class of mode C
    let cls = null;
    if (pos && scored && ok.C === false) {
      if (mi < 0) cls = 'segmentation wrong';
      else if (!wTop3) cls = 'world not in candidates';
      else {
        const tc = out.C.trace.segmentations.find((s) => s.index === mi);
        let bad = null;
        for (const [i, gp] of gsegs.entries()) {
          const atts = (tc?.pieces[i]?.attempts ?? []).filter((a) => worldOk(gp, a.world));
          if (!atts.some((a) => a.valid)) { bad = atts.some((a) => a.refused) ? 'interpreter rejects correct parse' : 'rule gap'; break; }
        }
        if (bad) cls = bad;
        else if (out.C.winner?.index !== mi || tc.pieces.some((p, i) => !worldOk(gsegs[i], p.chosen?.world))) cls = 'wrong reading chosen';
        else cls = 'sop differs';
      }
    }
    const worlds = [...new Set(gsegs.map((s) => s.world))];
    const group = gold.kind === 'multi' ? 'multi-command' : groupOf(gsegs[0].world);
    const row = {
      id: gold.id, kind: gold.kind, group, source: gold.source, world: gold.kind === 'multi' ? null : gsegs[0].world, negative: gold.negative, scored,
      ok, seg_beam: mi >= 0, seg_top1: top1Match, seg_tp: segc.tp, seg_pred: segc.pred, seg_gold: segc.gold, w_top1: wTop1, w_top3: wTop3,
      with_simplified: np.segmentations.some((s) => s.segments.some((p) => p.simplified)),
      recoverable, rejected, recovered, wrong_accepted: wrongAccepted, cls,
    };
    const trace = {
      id: gold.id, source: gold.source, group, text: gold.text, gold_worlds: worlds, gold_segments: gsegs.map((s) => ({ start: s.start, end: s.end, text: s.text, world: s.world })),
      negative: gold.negative, ok, class: cls, status: out.C.status, why: out.C.why, produced: out.C.produced.map(({ wires, ...p }) => p),
      not_understood: out.C.notUnderstood, trace: out.C.trace,
    };
    return { row, trace };
  });
}

if (!isMainThread) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const validator = createDispatchValidator({ engine });
  const env = { validator, legends: engine.set.legends };
  parentPort.on('message', async (t) => {
    try {
      const results = [];
      for (const { pred, gold } of t.items) {
        try { results.push(await evalRecord(env, pred, gold, t.opts)); }
        catch (e) { results.push({ error: `${gold.id}: ${e.stack}` }); }
      }
      parentPort.postMessage({ idx: t.idx, results });
    } catch (e) { parentPort.postMessage({ idx: t.idx, error: e.stack }); }
  });
  parentPort.postMessage({ ready: true });
}

// ---- main side -----------------------------------------------------------------------------------------------------
async function runPool(tasks, jobs) {
  const results = new Array(tasks.length);
  let next = 0, done = 0;
  await new Promise((res, rej) => {
    if (!tasks.length) return res();
    const workers = [];
    const feed = (w) => { if (next < tasks.length) { const idx = next++; w.postMessage({ ...tasks[idx], idx }); } };
    for (let i = 0; i < Math.min(jobs, tasks.length); i++) {
      const w = new Worker(fileURLToPath(import.meta.url));
      workers.push(w);
      w.on('message', (m) => {
        if (m.ready) return feed(w);
        if (m.error) { workers.forEach((x) => x.terminate()); return rej(new Error(m.error)); }
        results[m.idx] = m.results;
        if (++done === tasks.length) { workers.forEach((x) => x.terminate()); res(); } else feed(w);
      });
      w.on('error', rej);
    }
  });
  return results;
}

const pct = (a, n) => (n ? Number((a / n).toFixed(4)) : null);
const MODE_KEYS = Object.keys(MODES);

function cellOf(rows) {
  const c = { n: rows.length, pos: 0, neg: 0, scored_pos: 0, seg_beam: 0, seg_top1: 0, w_top1: 0, w_top3: 0, with_simplified: 0, recoverable: 0, rejected: 0, recovered: 0, wrong_accepted: 0, seg_tp: 0, seg_pred: 0, seg_gold: 0, neg_ok: Object.fromEntries(MODE_KEYS.map((m) => [m, 0])), ok: Object.fromEntries(MODE_KEYS.map((m) => [m, 0])), failure_classes: {} };
  for (const r of rows) {
    if (r.negative) {
      c.neg++;
      for (const m of MODE_KEYS) if (r.ok[m]) c.neg_ok[m]++;
      continue;
    }
    c.pos++;
    for (const k of ['seg_beam', 'seg_top1', 'w_top1', 'w_top3', 'with_simplified', 'recoverable', 'rejected', 'recovered', 'wrong_accepted']) if (r[k]) c[k]++;
    c.seg_tp += r.seg_tp; c.seg_pred += r.seg_pred; c.seg_gold += r.seg_gold;
    if (r.scored) { c.scored_pos++; for (const m of MODE_KEYS) if (r.ok[m]) c.ok[m]++; }
    if (r.cls) c.failure_classes[r.cls] = (c.failure_classes[r.cls] ?? 0) + 1;
  }
  const P = c.pos, S = c.scored_pos;
  const prec = pct(c.seg_tp, c.seg_pred), rec = pct(c.seg_tp, c.seg_gold);
  return {
    ...c,
    oracle: { segmentation_in_beam: pct(c.seg_beam, P), segmentation_top1: pct(c.seg_top1, P), world_top1: pct(c.w_top1, P), world_top3: pct(c.w_top3, P) },
    segmentation_f1_top1: prec != null && rec != null && prec + rec > 0 ? Number((2 * prec * rec / (prec + rec)).toFixed(4)) : null,
    exact_sop: Object.fromEntries(MODE_KEYS.map((m) => [m, pct(c.ok[m], S)])),
    negatives_rejected: c.neg ? Object.fromEntries(MODE_KEYS.map((m) => [m, pct(c.neg_ok[m], c.neg)])) : null,
    recovery: { recoverable: c.recoverable, wrong_top1_rejected: c.rejected, recovered_exact: c.recovered, wrong_top1_accepted: c.wrong_accepted },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const opts = (n) => args.reduce((a, x, i) => (x === n ? [...a, args[i + 1]] : a), []);
  const opt = (n, d) => { const v = opts(n); return v.length ? v[0] : d; };
  let preds = opts('--pred').map((f) => resolve(f));
  if (!preds.length) {
    const dir = join(REPO, 'training/runs/dispatch-pred');
    preds = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().map((f) => join(dir, f)) : [];
  }
  if (!preds.length) { console.error('no prediction files (training/runs/dispatch-pred/*.jsonl or --pred <file>)'); process.exit(2); }
  const name = opt('--name', preds.length === 1 ? basename(preds[0]).replace(/\.jsonl$/, '') : 'all');
  const jobs = Number(opt('--jobs', Math.min(cpus().length, 20)));
  const policy = JSON.parse(opt('--policy', '{}'));
  const segIou = Number(opt('--seg-iou', 0.6));
  const limit = Number(opt('--limit', Infinity));
  const t0 = Date.now();

  const gold = loadGold(DATASET);
  const seen = new Set();
  const items = [];
  let bad = 0, noGold = 0, dup = 0;
  for (const f of preds) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let p;
      try { p = JSON.parse(line); } catch { bad++; continue; }
      if (seen.has(p.id)) { dup++; continue; }
      seen.add(p.id);
      const g = gold.get(p.id);
      if (!g) { noGold++; continue; }
      if (items.length < limit) items.push({ pred: p, gold: g });
    }
  }
  const tasks = [];
  for (let i = 0; i < items.length; i += CHUNK) tasks.push({ items: items.slice(i, i + CHUNK), opts: { policy, segIou } });
  const results = (await runPool(tasks, jobs)).flat();
  const errors = results.filter((r) => r.error).map((r) => r.error);
  const ok = results.filter((r) => !r.error);
  const rows = ok.map((r) => r.row);

  const by = (keyf) => { const m = new Map(); for (const r of rows) { const k = keyf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  const toObj = (m, order) => Object.fromEntries([...m.keys()].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : 0) || String(a).localeCompare(String(b))).map((k) => [k, cellOf(m.get(k))]));
  const byGroup = toObj(by((r) => r.group), [...GROUP_ORDER, 'multi-command']);
  for (const [g, rs] of by((r) => r.group)) {
    byGroup[g].by_source = Object.fromEntries([...new Set(rs.map((r) => r.source))].sort().map((s) => [s, cellOf(rs.filter((r) => r.source === s))]));
  }
  const bySource = toObj(by((r) => r.source));
  const byWorld = toObj(new Map([...by((r) => r.world)].filter(([k]) => k)));

  // 30 failures, spread over the failure classes (round-robin, ids in file order)
  const failures = ok.filter((r) => r.row.cls).map((r) => r.trace);
  const classes = [...new Set(failures.map((f) => f.class))].sort();
  const lists = classes.map((c) => failures.filter((f) => f.class === c));
  const sample = [];
  for (let i = 0; sample.length < 30 && lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length && sample.length < 30) sample.push(l[i]);
  const brief = (f) => ({ id: f.id, class: f.class, source: f.source, text: f.text, gold: f.gold_segments.map((s) => `${s.world}: ${s.text}`), status: f.status, produced: f.produced.map((p) => `${p.world}: ${p.usedText}`), why: f.why });

  const report = {
    task: 'D3', name, command: `node scripts/eval-dispatch.mjs ${preds.map((p) => '--pred ' + p.replace(REPO + '/', '')).join(' ')}`,
    inputs: { files: preds.map((p) => p.replace(REPO + '/', '')), records: items.length, skipped_no_gold: noGold, skipped_duplicate: dup, unparsable_lines: bad, evaluation_errors: errors.length },
    policy: { ...policy, seg_iou: segIou },
    definitions: {
      modes: { A: 'dispatcher top-1 segmentation, top-1 world per piece, original text, rules only (no interpreter)', B: 'beam 4, top-3 worlds, original text, rules + interpreter validation', C: 'B plus simplified text (equal to B when no piece has simplified)', Bni: 'B without the interpreter check' },
      exact_sop: 'concatenation (message order) of id-normalized SOP of produced pieces equals the concatenation of id-normalized SOP of each gold segment target; negative: result is not_understood',
      segmentation_match: `same number of pieces, every piece overlaps its gold segment with character IoU >= ${segIou}`,
      recovery: 'recoverable = top-1 segmentation right, some piece has the gold world not first but within top 3; wrong_top1_rejected = every such piece top-1 candidate fails validation in B; recovered_exact = B exact',
      failure_classes: 'for mode C failures: segmentation wrong (no beam entry matches) > world not in candidates (gold world of a piece not in top 3) > rule gap (rules of the gold world do not parse the piece, original or simplified) > interpreter rejects correct parse > wrong reading chosen (gold reading valid but another won) > sop differs (gold world and segmentation chosen, circuits differ)',
    },
    totals: cellOf(rows), by_group: byGroup, by_source: bySource, by_world: byWorld,
    failure_classes: Object.fromEntries(classes.map((c, i) => [c, lists[i].length])), failure_sample: sample.map(brief),
  };
  if (!args.includes('--no-write')) {
    const out = join(REPO, `training/results/dispatch-${name}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    const tf = join(REPO, `training/runs/dispatch-${name}-traces.jsonl`);
    mkdirSync(dirname(tf), { recursive: true });
    writeFileSync(tf, ok.map((r) => JSON.stringify(r.trace)).join('\n') + '\n');
    console.log(`wrote ${out}\nwrote ${tf}`);
  }
  const f = (x) => (x == null ? '   -  ' : (100 * x).toFixed(1).padStart(5) + '%');
  console.log(`records ${items.length} (no gold ${noGold}, duplicates ${dup}, bad lines ${bad}, errors ${errors.length})`);
  console.log(`${'group'.padEnd(24)} ${'n'.padStart(5)}  seg-beam w-top1 w-top3 |    A      B      C     Bni    Br  | recov rej recd`);
  const line = (k, c) => console.log(`${k.padEnd(24)} ${String(c.n).padStart(5)}  ${f(c.oracle.segmentation_in_beam)} ${f(c.oracle.world_top1)} ${f(c.oracle.world_top3)} | ${MODE_KEYS.map((m) => f(c.exact_sop[m])).join(' ')} | ${String(c.recoverable).padStart(4)} ${String(c.rejected).padStart(3)} ${String(c.recovered).padStart(4)}`);
  line('ALL', report.totals);
  for (const [g, c] of Object.entries(byGroup)) line(g, c);
  console.log('by source:'); for (const [s, c] of Object.entries(bySource)) line(s, c);
  console.log('failure classes:', JSON.stringify(report.failure_classes));
  for (const e of errors.slice(0, 3)) console.error(e);
  console.error(`wall time ${((Date.now() - t0) / 1000).toFixed(1)} s, ${jobs} workers`);
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
