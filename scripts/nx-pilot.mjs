#!/usr/bin/env node
/**
 * NX2 pilot driver (labelers and judges are Claude subagents or vLLM; this script prepares their inputs and scores their outputs).
 *   node scripts/nx-pilot.mjs prepare            writes <dir>/prompts/<world>.md, <dir>/shards/shard-N/{batches.json,INSTRUCTIONS.md}
 *   node scripts/nx-pilot.mjs score <labeler>    reads <dir>/out/<labeler>/*.json, scores against the gold, writes <dir>/scores/<labeler>.json
 *   node scripts/nx-pilot.mjs judge-prepare <labeler> <judge>    50 labeled items per call for a judge
 *   node scripts/nx-pilot.mjs judge-score <labeler> <judge>
 * <dir> = training/dataset/nx/pilot (outside git).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { loadSet } from './lib/nx-read.mjs';
import { worldPrompt, batchText } from './lib/nx-prompt.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.includes('.claude/worktrees') ? REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '') : REPO;
export const DIR = MAIN + 'training/dataset/nx/pilot';
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const wj = (f, o) => { mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 1)); };

export const normVal = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : String(v).replace(/^\$(e\.)?/, '').toLowerCase().replace(/_/g, ' ').trim().replace(/^(-?\d+)\.0+$/, '$1'));

/** Items to label: gold (rules + para) and the real-phrase candidates; sentence text only. */
export function pilotItems() {
  const gold = jl(REPO + 'training/nx/gold/pilot-300.jsonl').filter((x) => x.subset !== 'real');
  const real = JSON.parse(readFileSync(REPO + 'training/nx/gold/real-50-candidates.json', 'utf8'));
  return [...gold.map((x) => ({ id: x.id, world: x.world, context: x.context, text: x.text })), ...real.map((x) => ({ id: x.id, world: x.world, context: x.context, text: x.text }))];
}

const INSTR = (labeler) => `You are a labeler (${labeler}) in a measured pilot. Work ONLY with the files named here; do not read or search any other file in the repository (the evaluation data is elsewhere and reading it would invalidate the measurement).

Directory: SHARD (given in your task). It holds batches.json: a list of batches {batch_id, world, prompt_file, items: [{i, context, text}]}.
For EVERY batch, in order:
1. Read the world prompt file (once per world; it holds the rules, the operations, the lexicons and solved examples).
2. Label the batch's sentences exactly as that prompt says, using your own judgment only (no scripts that guess labels, no tools beyond reading the prompt and writing the output).
3. Write the JSON array (and nothing else) to OUT/<batch_id>.json (create the file with the Write tool). OUT is given in your task.
Never ask questions; if a sentence fits no operation give op null. Finish all batches, then reply with one line: the number of batches written.`;

async function prepare() {
  const set = await loadSet();
  const items = pilotItems();
  const byWorld = {};
  for (const it of items) (byWorld[it.world] ??= []).push(it);
  const batches = [];
  for (const [w, list] of Object.entries(byWorld)) {
    mkdirSync(DIR + '/prompts', { recursive: true });
    const pf = `${DIR}/prompts/${w}.md`;
    writeFileSync(pf, worldPrompt(set, w));
    for (let k = 0; k * 25 < list.length; k++) {
      const part = list.slice(k * 25, k * 25 + 25);
      batches.push({ batch_id: `${w}.${k}`, world: w, prompt_file: pf, prompt_chars: readFileSync(pf, 'utf8').length, items: part.map((x, j) => ({ i: j + 1, context: x.context, text: x.text })), ids: part.map((x) => x.id) });
    }
  }
  // 3 shards balanced by items
  const shards = [[], [], []]; const load = [0, 0, 0];
  for (const b of batches.sort((a, c) => c.items.length - a.items.length)) { const k = load.indexOf(Math.min(...load)); shards[k].push(b); load[k] += b.items.length + 10; }
  wj(DIR + '/batches-all.json', batches);
  shards.forEach((s, k) => {
    // sort so the same world is contiguous
    s.sort((a, c) => a.world.localeCompare(c.world));
    wj(`${DIR}/shards/shard-${k}/batches.json`, s.map(({ ids, prompt_chars, ...r }) => r));
    writeFileSync(`${DIR}/shards/shard-${k}/INSTRUCTIONS.md`, INSTR('labeler'));
  });
  console.log(JSON.stringify({ items: items.length, batches: batches.length, shards: shards.map((s) => s.reduce((a, b) => a + b.items.length, 0)), prompt_chars: batches.reduce((a, b) => a + b.prompt_chars, 0) }));
}

const keyNorm = (k) => String(k).replace(/^core\.request\./, '');

export function loadGold() {
  const g = jl(REPO + 'training/nx/gold/pilot-300.jsonl');
  return new Map(g.map((x) => [x.id, x]));
}

/** Read a labeler's outputs: Map(itemId -> { pred|null, batch, valid }) and batch-level validity. */
export function readOutputs(labeler, batches) {
  const items = new Map(); const bv = []; let outChars = 0;
  for (const b of batches) {
    const f = `${DIR}/out/${labeler}/${b.batch_id}.json`;
    let arr = null; let ok = false;
    if (existsSync(f)) {
      const raw = readFileSync(f, 'utf8'); outChars += raw.length;
      try { arr = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```\s*$/g, '')); ok = Array.isArray(arr); } catch { ok = false; }
    }
    bv.push({ batch: b.batch_id, present: existsSync(f), valid: ok && arr.length === b.items.length && arr.every((o, k) => o && typeof o === 'object' && o.i === k + 1 && (o.op === null || typeof o.op === 'string') && Array.isArray(o.slots ?? []) )});
    b.ids.forEach((id, k) => {
      const o = ok ? arr.find((x) => x && x.i === k + 1) : null;
      items.set(id, { pred: o ?? null, batch: b.batch_id, sentence: b.items[k].text });
    });
  }
  return { items, bv, outChars };
}

export function scoreItems(items, gold) {
  let n = 0, opOk = 0, abst = 0, bad = 0, tp = 0, fp = 0, fn = 0, spanTot = 0, spanOk = 0, invalidItems = 0;
  const per = {};
  for (const [id, g] of gold) {
    const it = items.get(id); if (!it) continue;
    n++;
    const p = it.pred; const sub = (per[g.subset] ??= { n: 0, opOk: 0, tp: 0, fp: 0, fn: 0 });
    sub.n++;
    if (!p || typeof p !== 'object') { invalidItems++; fn += g.slots.length; sub.fn += g.slots.length; continue; }
    if (p.op == null) abst++;
    if (p.op === g.op) { opOk++; sub.opOk++; }
    const gs = new Set(g.slots.map((s) => keyNorm(s.key) + '=' + normVal(s.value)));
    const ps = new Set((p.slots ?? []).filter((s) => s && s.key != null).map((s) => keyNorm(s.key) + '=' + normVal(s.value)));
    for (const x of ps) if (gs.has(x)) { tp++; sub.tp++; } else { fp++; sub.fp++; }
    for (const x of gs) if (!ps.has(x)) { fn++; sub.fn++; }
    for (const s of p.slots ?? []) if (s && s.text != null) { spanTot++; if (typeof s.text === 'string' && it.sentence.includes(s.text)) spanOk++; }
  }
  const f1 = (tp, fp, fn) => (tp ? (2 * tp) / (2 * tp + fp + fn) : 0);
  const r4 = (x) => Math.round(x * 10000) / 10000;
  return {
    n, op_accuracy: r4(opOk / n), slot_f1: r4(f1(tp, fp, fn)), slot_precision: r4(tp / Math.max(1, tp + fp)), slot_recall: r4(tp / Math.max(1, tp + fn)),
    span_validity: r4(spanTot ? spanOk / spanTot : 1), abstain_rate: r4(abst / n), invalid_items: invalidItems,
    by_subset: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { n: v.n, op_accuracy: r4(v.opOk / v.n), slot_f1: r4(f1(v.tp, v.fp, v.fn)) }])),
  };
}

async function score(labeler) {
  const batches = JSON.parse(readFileSync(DIR + '/batches-all.json', 'utf8'));
  const gold = loadGold();
  const { items, bv, outChars } = readOutputs(labeler, batches);
  const sc = scoreItems(items, gold);
  sc.json_validity = Math.round((bv.filter((x) => x.valid).length / bv.length) * 10000) / 10000;
  sc.batches = { total: bv.length, missing: bv.filter((x) => !x.present).map((x) => x.batch), invalid: bv.filter((x) => x.present && !x.valid).map((x) => x.batch) };
  sc.output_chars = outChars;
  sc.input_chars = batches.reduce((a, b) => a + b.prompt_chars + JSON.stringify(b.items).length, 0);
  wj(`${DIR}/scores/${labeler}.json`, sc);
  console.log(JSON.stringify(sc));
}

const JUDGE_INSTR = `You are a judge in a measured pilot. Work ONLY with the files named here; do not read or search any other file in the repository.
SHARD (in your task) holds batches.json: a list of judge calls {call_id, world, prompt_file, items: [{k, context, text, proposed: {op, slots}}]}.
For EVERY call, in order:
1. Read the world prompt file (once per world): it defines the operations, the keys and how labels must look.
2. For each item decide whether the proposed label (op and slots) is a correct reading of the LAST sentence for this world, using only your own judgment (no scripts):
   accept = op and all slot keys and values are right; reject = wrong or missing op, wrong slot value, or a key that is not determined by the sentence; fix = nearly right, you can give the corrected label.
3. Write a JSON array to OUT/<call_id>.json: [{"k": <item number>, "verdict": "accept"|"reject"|"fix", "reason": "<short>", "fixed": <only for fix: {"op":..., "slots":[...]}>}], one entry per item. Nothing else in the file.
Never ask questions. Finish all calls, then reply with one line: the number of calls written.`;

function judgePrepare(labelers) {
  const batches = JSON.parse(readFileSync(DIR + '/batches-all.json', 'utf8'));
  const calls = []; const key = {};
  for (const b of batches) {
    const pool = [];
    for (const L of labelers) {
      const { items } = readOutputs(L, [b]);
      for (const id of b.ids) { const it = items.get(id); if (!it?.pred) continue; const ix = b.ids.indexOf(id); pool.push({ labeler: L, id, context: b.items[ix].context, text: b.items[ix].text, proposed: { op: it.pred.op ?? null, slots: (it.pred.slots ?? []).map((x) => ({ key: x.key, text: x.text, value: x.value })) } }); }
    }
    // deterministic shuffle so that the labeler is not identifiable by position
    pool.sort((a, c) => (a.id + a.labeler < c.id + c.labeler ? 1 : -1));
    for (let k = 0; k * 50 < pool.length; k++) {
      const part = pool.slice(k * 50, k * 50 + 50); let call_id = `${b.world}.${k}`; if (key[call_id]) call_id = `${b.batch_id}.c${k}`;
      calls.push({ call_id, world: b.world, prompt_file: b.prompt_file, items: part.map((x, j) => ({ k: j + 1, context: x.context, text: x.text, proposed: x.proposed })) });
      key[call_id] = part.map((x) => ({ labeler: x.labeler, id: x.id }));
    }
  }
  const J = DIR + '/judge'; const shards = [[], []]; const load = [0, 0];
  for (const c of calls.sort((a, c2) => c2.items.length - a.items.length)) { const i = load[0] <= load[1] ? 0 : 1; shards[i].push(c); load[i] += c.items.length + 10; }
  shards.forEach((sh, i) => { sh.sort((a, c) => a.world.localeCompare(c.world)); wj(`${J}/shards/shard-${i}/batches.json`, sh); writeFileSync(`${J}/shards/shard-${i}/INSTRUCTIONS.md`, JUDGE_INSTR); });
  wj(J + '/key.json', key);
  console.log(JSON.stringify({ calls: calls.length, items: calls.reduce((a, c) => a + c.items.length, 0) }));
}

function judgeScore(judge) {
  const batches = JSON.parse(readFileSync(DIR + '/batches-all.json', 'utf8'));
  const key = JSON.parse(readFileSync(DIR + '/judge/key.json', 'utf8'));
  const gold = loadGold();
  const preds = {}; for (const L of ['sonnet', 'haiku', 'qwen30', 'qwen-big']) { preds[L] = readOutputs(L, batches).items; }
  const wrongOf = (L, id) => {
    const g = gold.get(id); const p = preds[L].get(id)?.pred; if (!p) return true;
    if (p.op !== g.op) return true;
    const gs = new Set(g.slots.map((s) => keyNorm(s.key) + '=' + normVal(s.value)));
    const ps = new Set((p.slots ?? []).map((s) => keyNorm(s.key) + '=' + normVal(s.value)));
    return gs.size !== ps.size || [...gs].some((x) => !ps.has(x));
  };
  let tp = 0, fp = 0, fn = 0, tn = 0, n = 0, missing = 0, bad = 0; const per = {};
  for (const [call, rows] of Object.entries(key)) {
    const f = `${DIR}/judge/out/${judge}/${call}.json`;
    if (!existsSync(f)) { missing++; continue; }
    let arr; try { arr = JSON.parse(readFileSync(f, 'utf8')); } catch { bad++; continue; }
    rows.forEach((r, k) => {
      const v = arr.find((x) => x.k === k + 1)?.verdict; if (!v) { bad++; return; }
      const wrong = wrongOf(r.labeler, r.id); const flagged = v !== 'accept';
      const L = (per[r.labeler] ??= { n: 0, wrong: 0, caught: 0, flagged: 0 }); L.n++; L.wrong += wrong; L.flagged += flagged; L.caught += wrong && flagged;
      n++; if (wrong && flagged) tp++; else if (!wrong && flagged) fp++; else if (wrong) fn++; else tn++;
    });
  }
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const res = { judge, n, wrong_labels: tp + fn, recall_of_wrong: r4(tp / Math.max(1, tp + fn)), precision: r4(tp / Math.max(1, tp + fp)), false_alarms: fp, missed: fn, missing_calls: missing, bad_items: bad, per_labeler: per };
  wj(`${DIR}/scores/judge-${judge}.json`, res); console.log(JSON.stringify(res));
}

const cmd = process.argv[2];
if (cmd === 'judge-prepare') judgePrepare(process.argv.slice(3));
if (cmd === 'judge-score') judgeScore(process.argv[3]);
if (cmd === 'score') await score(process.argv[3]);
if (cmd === 'prepare') await prepare();

// ---- report: the NX2 table (nx2-pilot.json) ----
const PRICE = { sonnet: [3, 15], haiku: [1, 5], qwen30: [0, 0] };   // USD per million tokens (input, output): assumed list prices of Claude Sonnet / Haiku; local = 0
const RUNS = JSON.parse(existsSync(DIR + '/runs.json') ? readFileSync(DIR + '/runs.json', 'utf8') : '{}');   // { labeler: { seconds, agent_tokens } } measured by the driver
if (cmd === 'report') {
  const res = { labelers: {}, judges: {}, selection: {} };
  for (const L of ['sonnet', 'haiku', 'qwen30']) {
    const f = `${DIR}/scores/${L}.json`; if (!existsSync(f)) continue;
    const sc = JSON.parse(readFileSync(f, 'utf8')); const run = RUNS[L] ?? {};
    const tin = sc.input_chars / 4, tout = sc.output_chars / 4; const p = PRICE[L] ?? [0, 0];
    const usd = (tin * p[0] + tout * p[1]) / 1e6;
    res.labelers[L] = { ...sc, seconds: run.seconds ?? null, items_per_minute: run.seconds ? Math.round((sc.n / run.seconds) * 600) / 10 : null, est_input_tokens: Math.round(tin), est_output_tokens: Math.round(tout), usd_per_1000_items: Math.round((usd / sc.n) * 1e5) / 100, agent_tokens_measured: run.agent_tokens ?? null };
  }
  for (const J of ['sonnet', 'haiku']) { const f = `${DIR}/scores/judge-${J}.json`; if (existsSync(f)) res.judges[J] = { ...JSON.parse(readFileSync(f, 'utf8')), seconds: RUNS['judge-' + J]?.seconds ?? null }; }
  const ok = (s) => s.op_accuracy >= 0.95 && s.slot_f1 >= 0.92 && (1 - s.json_validity) <= 0.02 && s.invalid_items / s.n <= 0.02;
  const order = ['qwen30', 'haiku', 'sonnet'];   // cheapest first: local models cost no API money, then Haiku, then Sonnet
  res.selection.labeler = order.find((L) => res.labelers[L] && ok(res.labelers[L])) ?? null;
  const jok = (j) => j.recall_of_wrong >= 0.9 && j.precision >= 0.8;
  res.selection.judge = ['haiku', 'sonnet'].find((J) => res.judges[J] && jok(res.judges[J])) ?? 'sonnet (none qualifies)';
  wj(REPO + 'training/results/nx2-pilot.json', res);
  console.log(JSON.stringify(res.selection));
}
