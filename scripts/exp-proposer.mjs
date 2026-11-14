#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * PROPOSER EXPERIMENT (2026-11-14, MEASUREMENT ONLY, nothing here is shipped, no src/ change).
 * Question (Q14 item 4): of the failing meaning-kept paraphrases, how much is a WORDING gap (a known phrasing of the world reads it right) and how much a KNOWLEDGE gap?
 * A small encoder (training/psys2_train/proposer_experiment.py) proposes the nearest accepted sentences of the SAME world; the value checker (src/dialog/value-check.mjs, the
 * normalizer's) must accept the proposal against the paraphrase; the rules (the only formalizer) read it; judged exactly as the paraphrase set (scripts/eval-ablation.mjs).
 *
 * Phases (see training/eval/proposer/README.md for the whole recipe):
 *   prepare --base <rules-C.json> --dir <dir>       pool.jsonl (accepted sentences per world) + queries.jsonl (the failing paraphrases)
 *   cases   --dir <dir> --scores <scores.json>      fills slots, runs the checker, writes cases.jsonl for eval-ablation (set paraphrases-proposals)
 *   report  --dir <dir> --run <rules-C.json of the proposals> --out <json>
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { worldVocabulary } from '../src/formalizer/spell.mjs';
import { checkValues } from '../src/dialog/value-check.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const phase = process.argv[2];
const dir = arg('dir');
const J = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const W = (f, rows) => writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const PARA = J(join(REPO, 'training/eval/paraphrases-rt-2026-11-12.jsonl')).filter((x) => x.meaning !== 'changed');
const K = 5;

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const vocabs = new Map();
const vocabOf = (w) => vocabs.get(w) ?? (vocabs.set(w, worldVocabulary(engine.set, w)), vocabs.get(w));

/** Names = words written capitalised in the middle of a sentence anywhere in the corpora used here ("Ana", "Egypt", "Monday"). The world's vocabulary cannot tell them (it knows
 *  ana / mia / tom as words) and neither can the value checker (it lets known names swap), so every case of such a word is a name slot. */
const NAMES = new Set();
const learn = (texts) => { for (const t of texts) for (const m of t.matchAll(/(?<=[a-z,;]\s)\p{Lu}[\p{L}-]+/gu)) NAMES.add(m[0].toLowerCase()); };
learn([...J(join(REPO, 'training/eval/operational.jsonl')).map((r) => r.message), ...PARA.flatMap((p) => [p.message, p.original])]);
for (const w of readdirSync(join(REPO, 'worlds'))) { const f = join(REPO, 'worlds', w, 'tests.sop'); if (existsSync(f)) learn([...readFileSync(f, 'utf8').matchAll(/^\s*input="((?:[^"\\]|\\.)*)"/gm)].map((m) => m[1])); }
const isName = (w) => NAMES.has(w.toLowerCase());
const TOK = /\d+(?:[.,]\d+)?|\p{L}[\p{L}-]*/gu;
/** Delexicalise: numbers -> [n], names -> [p]. Returns the template and the distinct values in order of appearance. */
function delex(text) {
  const nums = [], names = [];
  const dx = text.replace(TOK, (m) => {
    if (/^\d/.test(m)) { if (!nums.includes(m)) nums.push(m); return '[n]'; }
    if (!isName(m)) return m;
    if (!names.some((x) => x.toLowerCase() === m.toLowerCase())) names.push(m);
    return '[p]';
  });
  return { dx, nums, names };
}
/** Re-fill the slots of a pool sentence with the values of the query (by order of first appearance). null when the query has fewer distinct values. */
function refill(poolText, pool, q) {
  if (q.nums.length < pool.nums.length || q.names.length < pool.names.length) return null;
  const mapN = new Map(pool.nums.map((v, i) => [v, q.nums[i]])), mapP = new Map(pool.names.map((v, i) => [v.toLowerCase(), q.names[i]]));
  return poolText.replace(TOK, (m) => (/^\d/.test(m) ? mapN.get(m) ?? m : isName(m) ? mapP.get(m.toLowerCase()) ?? m : m));
}
const namesOf = (t) => [...t.matchAll(TOK)].map((m) => m[0].toLowerCase()).filter(isName).sort().join(' ');

if (phase === 'prepare') {
  const base = JSON.parse(readFileSync(arg('base'), 'utf8')).rows;
  const right = new Set(base.filter((r) => r.set === 'operational' && r.outcome === 'right').map((r) => r.id));
  const seen = new Set(), pool = [];
  const add = (world, text, source) => {
    text = text.trim();
    if (!text || text.length > 200 || !world) return;
    const key = `${world}\t${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ pid: pool.length, world, text, source, ...delex(text) });
  };
  // clean accepted sentences only: the noisy and the context-dependent families (messy, typos, abbreviations, self-corrections, several clauses, probes, references, ellipsis, undo) are not offered as proposals
  const NOISY = new Set(['messy', 'typo', 'abbrev', 'self-correction', 'multi', 'triple', 'world-switch', 'probe', 'reference', 'ellipsis', 'repeat-undo']);
  for (const r of J(join(REPO, 'training/eval/operational.jsonl'))) if (right.has(r.id) && !(r.families ?? []).some((f) => NOISY.has(f))) add(r.world, r.message, 'operational');
  for (const w of readdirSync(join(REPO, 'worlds'))) {
    const f = join(REPO, 'worlds', w, 'tests.sop');
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*input="((?:[^"\\]|\\.)*)"/gm)) add(w, m[1].replace(/\\"/g, '"'), 'tests.sop');
  }
  const grid = JSON.parse(readFileSync(join(REPO, 'docs/webchat/coverage-grid.json'), 'utf8'));
  for (const w of grid.worlds) for (const c of w.cells) if (['state', 'answer', 'reply'].includes(c.ops) && !c.opsCapture) add(w.id, c.text, 'grid-v3');
  W(join(dir, 'pool.jsonl'), pool);
  const failing = new Set(base.filter((r) => r.set === 'paraphrases-rt' && r.outcome !== 'right').map((r) => r.id));
  const fails = J(join(REPO, 'training/eval/failures.jsonl')).filter((r) => (r.class ?? '').startsWith('paraphrase'));
  const classOf = new Map(fails.map((r) => [r.text, r.class.replace(/^paraphrase: /, '')]));
  const queries = PARA.filter((p) => failing.has(p.id)).map((p) => ({ id: p.id, world: p.world, text: p.message, original: p.original, odx: delex(p.original).dx, cls: classOf.get(p.message) ?? '?', ...delex(p.message) }));
  W(join(dir, 'queries.jsonl'), queries);
  const byW = {}; for (const p of pool) byW[p.world] = (byW[p.world] ?? 0) + 1;
  console.log(`pool ${pool.length} sentences in ${Object.keys(byW).length} worlds; ${queries.length} failing queries`);
}

if (phase === 'cases') {
  const pool = J(join(dir, 'pool.jsonl')), byId = new Map(pool.map((p) => [p.pid, p]));
  const queries = J(join(dir, 'queries.jsonl'));
  const scores = JSON.parse(readFileSync(arg('scores'), 'utf8'));   // { arm: { variant: { queryId: [pid, ...] } } }
  const para = new Map(PARA.map((p) => [p.id, p]));
  const cases = [], meta = [];
  const mk = (q, label, message) => { const p = para.get(q.id); return { id: `${q.id}|${label}`, world: p.world, tab: p.tab, setup: p.setup ?? [], message, expect: p.expect, families: ['proposer'] }; };
  for (const q of queries) {
    cases.push(mk(q, 'orig', q.original));   // diagnostic: does the ORIGINAL (the sentence the paraphrase was made from) read right? the wording-gap bound
    for (const [arm, variants] of Object.entries(scores)) for (const [variant, perQ] of Object.entries(variants)) {
      (perQ[q.id] ?? []).slice(0, K).forEach((pid, rank) => {
        const pe = byId.get(pid);
        const cand = refill(pe.text, pe, q);
        if (cand == null) { meta.push({ qid: q.id, arm, variant, rank, pid, pool: pe.text, cand: null, checker: { ok: false, reason: 'slots cannot be filled' } }); return; }
        const same = cand.trim().toLowerCase() === q.text.trim().toLowerCase();
        const base = same ? { ok: false, reason: 'same as the paraphrase' } : checkValues(q.text, cand, { vocab: vocabOf(q.world) });
        const checker = base.ok && namesOf(q.text) !== namesOf(cand) ? { ok: false, reason: 'names differ (extra guard: the checker lets known names swap)' } : base;
        const label = `${arm}.${variant}.${rank}`;
        meta.push({ qid: q.id, arm, variant, rank, pid, pool: pe.text, source: pe.source, cand, checker });
        if (!same) cases.push(mk(q, label, cand));
      });
    }
  }
  W(join(dir, 'cases.jsonl'), cases);
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
  console.log(`${cases.length} cases (${queries.length} originals + proposals)`);
}

if (phase === 'report') {
  const queries = J(join(dir, 'queries.jsonl')), meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const run = new Map(JSON.parse(readFileSync(arg('run'), 'utf8')).rows.filter((r) => r.set === 'paraphrases-proposals').map((r) => [r.id, r]));
  const out = { generated: new Date().toISOString(), n: queries.length, k: K, classes: {}, arms: {}, original_reads_right: {} };
  const byClass = (q) => q.cls;
  for (const q of queries) {
    out.classes[q.cls] ??= { n: 0, original_right: 0 };
    out.classes[q.cls].n++;
    const o = run.get(`${q.id}|orig`);
    if (o?.outcome === 'right') { out.classes[q.cls].original_right++; }
  }
  const arms = [...new Set(meta.map((m) => `${m.arm}.${m.variant}`))];
  const detail = [];
  for (const a of arms) {
    const rows = [];
    for (const q of queries) {
      const ms = meta.filter((m) => `${m.arm}.${m.variant}` === a && m.qid === q.id).sort((x, y) => x.rank - y.rank);
      const outcomeOf = (m) => (m.cand == null ? 'unfilled' : run.get(`${q.id}|${m.arm}.${m.variant}.${m.rank}`)?.outcome ?? 'same');
      const accepted = ms.filter((m) => m.checker.ok);
      const first = accepted[0];   // the shipped rule would take the first proposal the checker accepts
      let verdict, chosen = null;
      const origRight = run.get(`${q.id}|orig`)?.outcome === 'right';
      if (first) { chosen = first; const o = outcomeOf(first); verdict = o === 'right' ? 'rescued' : o === 'wrong' ? 'wrong meaning (accepted, read as something else)' : 'accepted but not read (nu/asked)'; }
      else verdict = ms.some((m) => m.cand != null) ? 'all proposals rejected by the checker' : 'no proposal';
      const anyRight = accepted.some((m) => outcomeOf(m) === 'right');
      const rejectedRight = ms.filter((m) => !m.checker.ok && m.cand != null && outcomeOf(m) === 'right').length;
      rows.push({ id: q.id, cls: q.cls, world: q.world, text: q.text, verdict, rescued_at_k: anyRight, checker_rejected_would_be_right: rejectedRight, original_right: origRight, chosen: chosen ? { text: chosen.cand, from: chosen.pool, source: chosen.source, rank: chosen.rank, outcome: outcomeOf(chosen) } : null });
    }
    const tally = {}; for (const r of rows) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
    const perClass = {};
    for (const r of rows) { const c = (perClass[r.cls] ??= { n: 0, rescued: 0, rescued_at_k: 0, original_right: 0 }); c.n++; if (r.verdict === 'rescued') c.rescued++; if (r.rescued_at_k) c.rescued_at_k++; if (r.original_right) c.original_right++; }
    out.arms[a] = { tally, rescued_first_accepted: tally.rescued ?? 0, rescued_any_of_k: rows.filter((r) => r.rescued_at_k).length, checker_rejected_a_right_one: rows.filter((r) => r.checker_rejected_would_be_right).length, perClass };
    detail.push([a, rows]);
  }
  out.original_reads_right_total = Object.values(out.classes).reduce((a, c) => a + c.original_right, 0);
  out.detail = Object.fromEntries(detail);
  writeFileSync(arg('out'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ n: out.n, original_reads_right: out.original_reads_right_total, arms: Object.fromEntries(Object.entries(out.arms).map(([k, v]) => [k, { tally: v.tally, any_of_k: v.rescued_any_of_k, rejected_right: v.checker_rejected_a_right_one }])) }, null, 1));
}
process.exit(0);
