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
 *   Bs, Bp                 Br plus the spell-corrected candidate; plus partial understanding (the library defaults of acceptRefused and trySpell are on, A..Br pin them off)
 *   Br                     as B, but a piece the rules parse completely and the interpreter refuses (unsupported/error, e.g. an illegal chess move) still counts as understood, with a smaller penalty (policy acceptRefused)
 *   R  rules only          the current router: the whole message goes to a dialog session over all worlds (no dispatcher), same tab/context; the comparison column of the headline
 * Headline (user-perceived understanding): for every positive scored message, one of three outcomes per mode: `right` (exact SOP), `fallback` (the pipeline says
 * "not understood": the validator returns not_understood, or the rules leave a segment unparsed / parse nothing) or `wrong` (it claims to understand, SOP differs). Reported for
 * paraphrase, held-out and multi-command messages (the realistic ones), per world group, for R, B (strict) and Br (acceptRefused).
 * Held-out gold: ids = example_id of training/paraphrases/heldout/out/*.jsonl (needs_review excluded), see scripts/lib/dispatch-gold.mjs.
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
const REALISTIC = ['paraphrase', 'heldout', 'multi-command'];

// The policy defaults are now lenient (acceptRefused on, spelling candidates on); A, B, C and Bni keep the strict, spelling-free definitions so earlier results stay comparable.
const STRICT = { acceptRefused: false, trySpell: false };
export const MODES = {
  A: { ...STRICT, maxSegmentations: 1, maxWorlds: 1, trySimplified: false, useInterpreter: false },
  B: { ...STRICT, trySimplified: false },
  C: { ...STRICT },
  Bni: { ...STRICT, trySimplified: false, useInterpreter: false },
  Br: { ...STRICT, trySimplified: false, acceptRefused: true },
  Bs: { trySimplified: false, acceptRefused: true, trySpell: true },                          // Br plus the spell-corrected candidate (spec 03 section 7.9)
  Bp: { trySimplified: false, acceptRefused: true, trySpell: true, acceptPartial: true },    // Bs plus partial understanding (spec 03 section 7.10)
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

/** Rules only: the dialog session over all worlds (the current router) reads the whole message; same tab and context as the record. */
async function rulesOnly(env, gold) {
  const c = gold.context ?? {};
  const s = env.engine.createSession();
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  if (c.recent_worlds?.length) s._recentWorlds = [...c.recent_worlds];
  try {
    for (const m of c.session ?? []) await s.send(m);
    const r = await s.send(gold.text);
    const parsed = r.segments.filter((x) => !x.unparsed);
    return { parsed: parsed.length, unparsed: r.segments.length - parsed.length, sop: normalizedSop(parsed.flatMap((x) => x.wires), env.legends), worlds: parsed.map((x) => x.match?.worldId).filter(Boolean) };
  } catch (e) { return { parsed: 0, unparsed: 1, sop: [], worlds: [], error: e.message }; }
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
  return Promise.all([...Object.values(outs), rulesOnly(env, gold)]).then((all) => {
    const res = all.slice(0, -1);
    const rules = all[all.length - 1];
    const out = Object.fromEntries(Object.keys(outs).map((m, i) => [m, res[i]]));
    const ok = {}, cat = {};
    for (const m of Object.keys(out)) {
      if (!scored) { ok[m] = null; cat[m] = null; continue; }
      ok[m] = gold.negative ? out[m].status === 'not_understood'
        : out[m].status === 'understood' && JSON.stringify(circuits(out[m].produced, legends)) === JSON.stringify(target);
      cat[m] = ok[m] ? 'right' : out[m].status === 'understood' ? 'wrong' : 'fallback';
    }
    if (!scored) { ok.R = null; cat.R = null; for (const f of ['Bf', 'Brf', 'Bsf', 'Bpf']) { ok[f] = null; cat[f] = null; } }
    else {
      const understood = rules.unparsed === 0 && rules.parsed > 0;
      ok.R = gold.negative ? !understood : understood && JSON.stringify(rules.sop) === JSON.stringify(target);
      cat.R = ok.R ? 'right' : understood ? 'wrong' : 'fallback';
      // full pipeline: when the validator does not understand the message, the dialog engine retries with the rules over all worlds (spec 03 section 7.7); approximated on the whole message
      for (const [f, m] of [['Bf', 'B'], ['Brf', 'Br'], ['Bsf', 'Bs'], ['Bpf', 'Bp']]) {
        if (out[m].status === 'understood') { ok[f] = ok[m]; cat[f] = cat[m]; } else { ok[f] = ok.R; cat[f] = cat.R; }
      }
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
    // rejection and recovery (policies B strict and Br acceptRefused): the dispatcher's top-1 segmentation is right but some piece has a wrong
    // top-1 world while the right one is in the top 3. rejected = the validator refuses every wrong top-1 candidate; recovered = exact SOP.
    const rec = {};
    for (const m of ['B', 'Br']) {
      const r = { recoverable: false, rejected: false, recovered: false, wrong_accepted: false };
      if (pos && top1Match && !wTop1 && wTop3) {
        r.recoverable = true;
        const tb = out[m].trace.segmentations[0];
        const wrongPieces = beam[0].segments.map((p, i) => ({ p, i })).filter(({ p, i }) => !(p.worlds[0] && worldOk(gsegs[i], p.worlds[0].world)));
        r.rejected = wrongPieces.every(({ i }) => { const a = tb?.pieces[i]?.attempts.find((x) => x.rank === 1 && x.variant === 'original'); return a && !a.valid; });
        r.recovered = ok[m] === true;
        r.wrong_accepted = !r.rejected;
      }
      rec[m] = r;
    }
    // failure class of the lead policy Br (acceptRefused)
    let cls = null, gap = null;
    const lead = out.Br;
    if (pos && scored && ok.Br === false) {
      if (mi < 0) cls = 'segmentation wrong';
      else if (!wTop3) cls = 'world not in candidates';
      else {
        const tc = lead.trace.segmentations.find((s) => s.index === mi);
        let bad = null;
        for (const [i, gp] of gsegs.entries()) {
          const atts = (tc?.pieces[i]?.attempts ?? []).filter((a) => worldOk(gp, a.world));
          if (!atts.some((a) => a.valid)) { bad = atts.some((a) => a.refused) ? 'interpreter rejects correct parse' : 'rule gap'; if (bad === 'rule gap') gap = { world: gp.world, text: gp.text, rules_only_parsed: rules.parsed }; break; }
        }
        if (bad) cls = bad;
        else if (lead.winner?.index !== mi || tc.pieces.some((p, i) => !worldOk(gsegs[i], p.chosen?.world))) cls = 'wrong reading chosen';
        else cls = 'sop differs';
      }
    }
    const worlds = [...new Set(gsegs.map((s) => s.world))];
    const group = gold.kind === 'multi' ? 'multi-command' : groupOf(gsegs[0].world);
    const row = {
      id: gold.id, kind: gold.kind, group, source: gold.source, world: gold.kind === 'multi' ? null : gsegs[0].world, negative: gold.negative, scored,
      ok, cat, seg_beam: mi >= 0, seg_top1: top1Match, seg_tp: segc.tp, seg_pred: segc.pred, seg_gold: segc.gold, w_top1: wTop1, w_top3: wTop3,
      with_simplified: np.segmentations.some((s) => s.segments.some((p) => p.simplified)),
      rec, cls, gap,
    };
    const trace = {
      id: gold.id, source: gold.source, group, text: gold.text, tab: gold.context?.tab ?? null, session: gold.context?.session ?? [], gold_worlds: worlds,
      gold_segments: gsegs.map((s) => ({ start: s.start, end: s.end, text: s.text, world: s.world, target: s.target })),
      negative: gold.negative, ok, cat, class: cls, status: lead.status, why: lead.why, produced: lead.produced.map(({ wires, ...p }) => p),
      rules_only: { ok: ok.R, cat: cat.R, worlds: rules.worlds, sop: rules.sop }, dispatcher_top1: beam[0]?.segments.map((p) => ({ text: p.text, worlds: p.worlds.slice(0, 3).map((w) => w.world) })) ?? [],
      not_understood: lead.notUnderstood, trace: lead.trace,
    };
    return { row, trace };
  });
}

if (!isMainThread) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const validator = createDispatchValidator({ engine });
  const env = { validator, legends: engine.set.legends, engine };
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
const MODE_KEYS = [...Object.keys(MODES), 'R', 'Bf', 'Brf', 'Bsf', 'Bpf'];
const CATS = ['right', 'fallback', 'wrong'];

function cellOf(rows) {
  const zero = () => Object.fromEntries(MODE_KEYS.map((m) => [m, 0]));
  const c = { n: rows.length, pos: 0, neg: 0, scored_pos: 0, seg_beam: 0, seg_top1: 0, w_top1: 0, w_top3: 0, with_simplified: 0, seg_tp: 0, seg_pred: 0, seg_gold: 0, neg_ok: zero(), ok: zero(),
    cat: Object.fromEntries(MODE_KEYS.map((m) => [m, { right: 0, fallback: 0, wrong: 0 }])),
    rec: { B: { recoverable: 0, rejected: 0, recovered: 0, wrong_accepted: 0 }, Br: { recoverable: 0, rejected: 0, recovered: 0, wrong_accepted: 0 } }, failure_classes: {} };
  for (const r of rows) {
    if (r.negative) {
      c.neg++;
      for (const m of MODE_KEYS) if (r.ok[m]) c.neg_ok[m]++;
      continue;
    }
    c.pos++;
    for (const k of ['seg_beam', 'seg_top1', 'w_top1', 'w_top3', 'with_simplified']) if (r[k]) c[k]++;
    c.seg_tp += r.seg_tp; c.seg_pred += r.seg_pred; c.seg_gold += r.seg_gold;
    for (const m of ['B', 'Br']) for (const k of Object.keys(c.rec[m])) if (r.rec[m][k]) c.rec[m][k]++;
    if (r.scored) { c.scored_pos++; for (const m of MODE_KEYS) { if (r.ok[m]) c.ok[m]++; c.cat[m][r.cat[m]]++; } }
    if (r.cls) c.failure_classes[r.cls] = (c.failure_classes[r.cls] ?? 0) + 1;
  }
  const P = c.pos, S = c.scored_pos;
  const prec = pct(c.seg_tp, c.seg_pred), rec = pct(c.seg_tp, c.seg_gold);
  return {
    ...c,
    oracle: { segmentation_in_beam: pct(c.seg_beam, P), segmentation_top1: pct(c.seg_top1, P), world_top1: pct(c.w_top1, P), world_top3: pct(c.w_top3, P) },
    segmentation_f1_top1: prec != null && rec != null && prec + rec > 0 ? Number((2 * prec * rec / (prec + rec)).toFixed(4)) : null,
    exact_sop: Object.fromEntries(MODE_KEYS.map((m) => [m, pct(c.ok[m], S)])),
    understanding: Object.fromEntries(MODE_KEYS.map((m) => [m, Object.fromEntries(CATS.map((k) => [k, pct(c.cat[m][k], S)]))])),
    negatives_rejected: c.neg ? Object.fromEntries(MODE_KEYS.map((m) => [m, pct(c.neg_ok[m], c.neg)])) : null,
    recovery: Object.fromEntries(['B', 'Br'].map((m) => [m, { recoverable: c.rec[m].recoverable, wrong_top1_rejected: c.rec[m].rejected, recovered_exact: c.rec[m].recovered, wrong_top1_accepted: c.rec[m].wrong_accepted }])),
  };
}

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'i', 'it', 'is', 'me', 'my', 'and', 'for', 'in', 'on', 'please', 'you', 'can', 'could', 'would', 'what', 'do', 'be']);
const toks = (t) => String(t).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

/** Rule gaps per world: how many records, the most frequent content words and bigrams of the phrasings the rules of the right world cannot parse, examples. */
function ruleGaps(failures) {
  const by = new Map();
  for (const f of failures) if (f.gap) { if (!by.has(f.gap.world)) by.set(f.gap.world, []); by.get(f.gap.world).push(f); }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, v]) => `${k} (${v})`);
  return Object.fromEntries([...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([w, fs]) => {
    const words = new Map(), bigrams = new Map();
    for (const f of fs) {
      const t = toks(f.gap.text);
      for (const x of new Set(t.filter((x) => !STOP.has(x) && !/^\d+$/.test(x)))) words.set(x, (words.get(x) ?? 0) + 1);
      for (const x of new Set(t.slice(1).map((y, i) => `${t[i]} ${y}`).filter((g) => g.split(' ').some((x) => !STOP.has(x))))) bigrams.set(x, (bigrams.get(x) ?? 0) + 1);
    }
    return [w, { n: fs.length, top_words: top(words, 8), top_bigrams: top(bigrams, 6), examples: fs.filter((f, i) => i % Math.max(1, Math.floor(fs.length / 5)) === 0).slice(0, 5).map((f) => f.gap.text) }];
  }));
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

  // failures of the lead policy Br on the realistic sources (paraphrase, held-out, multi-command), all classes
  const failuresAll = ok.filter((r) => r.row.cls).map((r) => ({ ...r.trace, gap: r.row.gap }));
  const classes = [...new Set(failuresAll.map((f) => f.class))].sort();
  const failure_classes = Object.fromEntries(classes.map((c) => [c, failuresAll.filter((f) => f.class === c).length]));
  const realistic = failuresAll.filter((f) => REALISTIC.includes(f.source));
  const failure_classes_realistic = Object.fromEntries([...new Set(realistic.map((f) => f.class))].sort().map((c) => [c, realistic.filter((f) => f.class === c).length]));
  // 30 examples, deterministic: round-robin over the world groups; inside a group, round-robin over the failure classes, each in file order
  const groupsF = [...GROUP_ORDER, 'multi-command'].filter((g) => realistic.some((f) => f.group === g));
  const perGroup = groupsF.map((g) => {
    const fs = realistic.filter((f) => f.group === g);
    const cl = [...new Set(fs.map((f) => f.class))].sort().map((c) => fs.filter((f) => f.class === c));
    const out = [];
    for (let i = 0; cl.some((l) => i < l.length); i++) for (const l of cl) if (i < l.length) out.push(l[i]);
    return out;
  });
  const sample = [];
  for (let i = 0; sample.length < 30 && perGroup.some((l) => i < l.length); i++) for (const l of perGroup) if (i < l.length && sample.length < 30) sample.push(l[i]);
  const compact = (sop) => String(sop ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !/^core\.(source|seq|in|via)=/.test(l)).map((l) => l.replace(/^@\w+ /, '')).join(' ; ');
  const brief = (f) => ({
    id: f.id, class: f.class, group: f.group, source: f.source, text: f.text, tab: f.tab, session: f.session,
    expected: f.gold_segments.map((g) => `${g.world}: ${g.text} => ${compact(g.target)}`),
    dispatcher_top1: f.dispatcher_top1.map((p) => `${p.worlds.join('/')}: ${p.text}`),
    status: f.status, produced: f.produced.map((p) => `${p.world} [${p.textUsed}]: ${p.text} => ${compact(p.sop)}`), rules_only: f.rules_only.cat, why: f.why,
  });
  // headline: user-perceived understanding of the realistic messages (right / fallback / wrong), rules only vs the pipeline
  const hl = (rs) => { const c = cellOf(rs); return { n: c.scored_pos, ...Object.fromEntries(['R', 'B', 'Br', 'Bs', 'Bp', 'Bf', 'Brf', 'Bsf', 'Bpf'].map((m) => [m, c.understanding[m]])) }; };
  const realRows = rows.filter((r) => REALISTIC.includes(r.source) && !r.negative);
  const headline = {
    definition: 'share of realistic positive messages (paraphrase test, held-out, multi-command) whose final result is: right = exact SOP, fallback = "not understood / Did you mean ...?", wrong = understood with another SOP. R = rules only (current router), B = dispatcher top-3 + validation (strict), Br = same with acceptRefused (lead policy); Bf / Brf = B / Br followed by the engine fallback (a not-understood message is retried with the rules over all worlds = R; whole-message approximation of the per-piece retry of spec 03 section 7.7)',
    realistic_all: hl(realRows),
    by_group: Object.fromEntries([...GROUP_ORDER, 'multi-command'].filter((g) => realRows.some((r) => r.group === g)).map((g) => [g, hl(realRows.filter((r) => r.group === g))])),
    by_source: Object.fromEntries(REALISTIC.filter((x) => realRows.some((r) => r.source === x)).map((x) => [x, hl(realRows.filter((r) => r.source === x))])),
    by_source_group: Object.fromEntries(REALISTIC.flatMap((x) => [...GROUP_ORDER, 'multi-command'].filter((g) => realRows.some((r) => r.source === x && r.group === g)).map((g) => [`${x} | ${g}`, hl(realRows.filter((r) => r.source === x && r.group === g))]))),
  };

  const report = {
    task: 'D3', name, command: `node scripts/eval-dispatch.mjs ${preds.map((p) => '--pred ' + p.replace(REPO + '/', '')).join(' ')}`,
    inputs: { files: preds.map((p) => p.replace(REPO + '/', '')), records: items.length, skipped_no_gold: noGold, skipped_duplicate: dup, unparsable_lines: bad, evaluation_errors: errors.length },
    policy: { ...policy, seg_iou: segIou },
    definitions: {
      modes: { A: 'dispatcher top-1 segmentation, top-1 world per piece, original text, rules only (no interpreter)', B: 'beam 4, top-3 worlds, original text, rules + interpreter validation (strict)', C: 'B plus simplified text (equal to B when no piece has simplified)', Bni: 'B without the interpreter check', Br: 'B with acceptRefused (a complete parse the interpreter refuses counts as understood)', Bf: 'B, then the rules-over-all-worlds result (R) when B says not_understood', Brf: 'Br, then R when Br says not_understood', R: 'rules only: the whole message through the dialog session over all worlds (current router), no dispatcher' },
      exact_sop: 'concatenation (message order) of id-normalized SOP of produced pieces equals the concatenation of id-normalized SOP of each gold segment target; negative: result is not_understood',
      understanding: 'right = exact SOP; fallback = not_understood (R: a segment unparsed or nothing parsed); wrong = understood but another SOP',
      segmentation_match: `same number of pieces, every piece overlaps its gold segment with character IoU >= ${segIou}`,
      recovery: 'recoverable = top-1 segmentation right, some piece has the gold world not first but within top 3; wrong_top1_rejected = every such piece top-1 candidate fails validation; recovered_exact = exact SOP (per policy B and Br)',
      failure_classes: 'failures of Br: segmentation wrong (no beam entry matches) > world not in candidates (gold world of a piece not in top 3) > rule gap (rules of the gold world do not parse the piece) > interpreter rejects correct parse > wrong reading chosen (gold reading valid but another won) > sop differs (gold world and segmentation chosen, circuits differ)',
    },
    headline, totals: cellOf(rows), by_group: byGroup, by_source: bySource, by_world: byWorld,
    failure_classes, failure_classes_realistic, rule_gaps: ruleGaps(realistic), failure_sample: sample.map(brief),
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
  console.log(`${'group'.padEnd(24)} ${'n'.padStart(5)}  seg-beam w-top1 w-top3 |    A      B      C     Bni    Br     Bs     Bp     R     Bf    Brf    Bsf    Bpf | Br: recov rej recd`);
  const line = (k, c) => console.log(`${k.padEnd(24)} ${String(c.n).padStart(5)}  ${f(c.oracle.segmentation_in_beam)} ${f(c.oracle.world_top1)} ${f(c.oracle.world_top3)} | ${MODE_KEYS.map((m) => f(c.exact_sop[m])).join(' ')} | ${String(c.recovery.Br.recoverable).padStart(4)} ${String(c.recovery.Br.wrong_top1_rejected).padStart(3)} ${String(c.recovery.Br.recovered_exact).padStart(4)}`);
  line('ALL', report.totals);
  for (const [g, c] of Object.entries(byGroup)) line(g, c);
  console.log('by source:'); for (const [s, c] of Object.entries(bySource)) line(s, c);
  console.log('failure classes (Br):', JSON.stringify(report.failure_classes));
  console.log('headline (realistic, right/fallback/wrong): ' + ['R', 'B', 'Br', 'Bs', 'Bp', 'Bf', 'Brf', 'Bsf', 'Bpf'].map((m) => `${m} ${['right', 'fallback', 'wrong'].map((k) => f(headline.realistic_all[m][k]).trim()).join('/')}`).join('  '));
  for (const [g, c] of Object.entries(headline.by_group)) console.log(`  ${g.padEnd(24)} n=${String(c.n).padStart(5)} ` + ['R', 'B', 'Br', 'Bs', 'Bp', 'Bf', 'Brf', 'Bsf', 'Bpf'].map((m) => `${m} ${['right', 'fallback', 'wrong'].map((k) => f(c[m][k]).trim()).join('/')}`).join('  '));
  for (const e of errors.slice(0, 3)) console.error(e);
  console.error(`wall time ${((Date.now() - t0) / 1000).toFixed(1)} s, ${jobs} workers`);
}

if (isMainThread && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
