#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * READERS AS VOICES, step 1 (worker-tasks 2026-11-15 02:30 item 1): every reading path ALONE on the same sets, then what an ensemble could give before the library's pooling exists.
 * Measurement only: no classifier, no runtime behaviour change.
 *
 * Paths (English sets, `scripts/eval-ablation.mjs` configs `v-*`, each with every other symbolic reading step off):
 *   v-rules    rules-C alone                       v-typed   + the typed step (proposeByTypes)       v-formops + the typed form operators (PSYS2_FORMOPS=on)
 *   v-alt      + the catalog's alternation rules   v-canon   + readCanonical (0.91; fillers + the alternation rules, PSYS2_CANON=on)
 *   v-enc-n1   the neural dispatcher + the T5 normaliser fallback, the rules read             v-neural  the NX neural reader first + dispatcher + normaliser
 * Romanian (`scripts/measure-ro-en-meaning.mjs --rows`): the MT paths rules, model (Bergamot), m4+model (the shipped chain), grammar, on training/eval/ro-en-meaning/rows.jsonl.
 *
 * A path ANSWERS when its outcome is right or wrong (asked / not understood / skipped is silence); precision = right / answers; coverage = answers / n. Two paths AGREE when the
 * signatures of what they did are equal (English sets: visible state afterwards + answer values + effects; Romanian: the reading key of the English the path made).
 *   union            any path right (the bound an oracle choosing among the paths gets)
 *   agreement-only   answer only when at least two paths agree on the same signature (a tie between two agreed signatures is silence); right when the agreed answer is right
 *   families         the symbolic paths count as ONE voice (the first of rules, typed, formops, alt, canon that answers) and the neural ones as one (enc-n1, then neural): the agreement is then between independent readers
 *
 *   node scripts/measure-voices.mjs --run [--dir <rows dir>] [--knowledge <catalog dir>] [--ort <onnxruntime-node entry>] [--heavy <heavy.sh>] [--configs a,b]   run the English paths (one eval-ablation process each)
 *   node scripts/measure-voices.mjs --report [--dir <rows dir>] [--ro-rows <file from measure-ro-en-meaning --rows>] --out training/eval/voices-2026-11-15.json
 * The catalog (`--knowledge`) is the live sop-knowledge-worlds mirror (it publishes `w.lang.en.alternation`); every path reads the same one.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(`--${k}`);
export const EN_PATHS = ['v-rules', 'v-typed', 'v-formops', 'v-alt', 'v-canon', 'v-enc-n1', 'v-neural'];
export const SYMBOLIC = ['v-rules', 'v-typed', 'v-formops', 'v-alt', 'v-canon'], NEURAL = ['v-enc-n1', 'v-neural'];
export const EN_SETS = ['paraphrases-rt', 'paraphrases-rt-changed', 'typos', 'loose-words', 'operational'];
const DIR = resolve(arg('dir', join(REPO, 'training/runs/voices-2026-11-15')));

// ------------------------------------------------------------------------------------------------ running
if (flag('run')) {
  mkdirSync(DIR, { recursive: true });
  const heavy = arg('heavy'), configs = (arg('configs') ?? EN_PATHS.join(',')).split(',');
  for (const c of configs) {
    const args = ['scripts/eval-ablation.mjs', '--configs', c, '--sets', EN_SETS.join(','), '--out', DIR];
    if (arg('knowledge')) args.push('--knowledge', arg('knowledge'));
    if (arg('ort')) args.push('--ort', arg('ort'));
    if (arg('jobs')) args.push('--jobs', arg('jobs'));
    console.log(heavy ? `${heavy} node ${args.join(' ')}` : `node ${args.join(' ')}`);
    execFileSync(heavy ?? 'node', heavy ? ['node', ...args] : args, { cwd: REPO, stdio: 'inherit' });
  }
}

// ------------------------------------------------------------------------------------------------ the analysis (pure; exported for the test)
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
/**
 * voices: { name: Map(id -> { ans: 'right' | 'wrong' | null, sig: string | null }) }; ids: the items of the group (rows to count). Returns the per-path table and the ensemble numbers.
 * `families`: { family: [voice names in priority order] } (optional).
 */
export function analyse(voices, ids, { families = null, baseline = null } = {}) {
  const names = Object.keys(voices), n = ids.length;
  const stat = (get) => { let ans = 0, right = 0; for (const id of ids) { const a = get(id); if (a) { ans++; if (a === 'right') right++; } } return { n, answers: ans, right, wrong: ans - right, coverage: pct(ans, n), precision: pct(right, ans), right_of_n: pct(right, n) }; };
  const paths = {};
  for (const v of names) {
    paths[v] = stat((id) => voices[v].get(id)?.ans ?? null);
    if (baseline && v !== baseline) {
      let gain = 0, lost = 0;
      for (const id of ids) { const a = voices[v].get(id)?.ans === 'right', b = voices[baseline].get(id)?.ans === 'right'; if (a && !b) gain++; if (!a && b) lost++; }
      paths[v].gain_over_baseline = gain; paths[v].lost_vs_baseline = lost;
    }
  }
  const union = { right: ids.filter((id) => names.some((v) => voices[v].get(id)?.ans === 'right')).length };
  union.right_of_n = pct(union.right, n);
  union.answered_by_any = ids.filter((id) => names.some((v) => voices[v].get(id)?.ans)).length;
  // agreement: the signature with the most votes (at least `min`), a tie between two such signatures is silence
  const agree = (vs, min = 2) => (id) => {
    const votes = new Map();
    for (const v of vs) { const x = voices[v].get(id); if (x?.ans && x.sig) { const e = votes.get(x.sig) ?? { k: 0, right: 0 }; e.k++; if (x.ans === 'right') e.right++; votes.set(x.sig, e); } }
    const top = [...votes.values()].sort((a, b) => b.k - a.k);
    if (!top.length || top[0].k < min || (top[1] && top[1].k === top[0].k)) return null;
    return top[0].right * 2 > top[0].k ? 'right' : 'wrong';
  };
  const agreement = stat(agree(names));
  const out = { n, paths, union, agreement_all: agreement };
  // pairwise agreement (a matrix of the paths' agreement coverage and precision)
  out.pairs = {};
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const s = stat(agree([names[i], names[j]])); out.pairs[`${names[i]} x ${names[j]}`] = { answers: s.answers, coverage: s.coverage, precision: s.precision }; }
  if (families) {
    const fam = {};
    for (const [f, members] of Object.entries(families)) {
      const ms = members.filter((m) => voices[m]);
      fam[f] = new Map(ids.map((id) => { const first = ms.map((m) => voices[m].get(id)).find((x) => x?.ans); return [id, first ? { ans: first.ans, sig: first.sig } : { ans: null, sig: null }]; }));
    }
    const fv = Object.fromEntries(Object.entries(fam));
    const fnames = Object.keys(fv);
    const famAgree = (id) => { const vs = fnames.map((f) => fv[f].get(id)).filter((x) => x?.ans && x.sig); if (vs.length < 2 || !vs.every((x) => x.sig === vs[0].sig)) return null; return vs.every((x) => x.ans === 'right') ? 'right' : 'wrong'; };
    const stF = (get) => { let ans = 0, right = 0; for (const id of ids) { const a = get(id); if (a) { ans++; if (a === 'right') right++; } } return { answers: ans, right, coverage: pct(ans, n), precision: pct(right, ans) }; };
    out.families = Object.fromEntries(fnames.map((f) => [f, stF((id) => fv[f].get(id)?.ans ?? null)]));
    out.agreement_families = stF(famAgree);
    out.union_families = { right: ids.filter((id) => fnames.some((f) => fv[f].get(id)?.ans === 'right')).length };
    out.union_families.right_of_n = pct(out.union_families.right, n);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ loading
function loadEnglish(dir) {
  const voices = {}, meta = {};
  for (const v of EN_PATHS) {
    const f = join(dir, `${v}.json`);
    if (!existsSync(f)) continue;
    const d = JSON.parse(readFileSync(f, 'utf8'));
    meta[v] = { note: d.note, rows: d.rows.length, wall_ms: d.wall_ms };
    voices[v] = new Map(d.rows.map((r) => [`${r.set}|${r.id}`, { set: r.set, group: r.group, ans: r.outcome === 'right' || r.outcome === 'wrong' ? r.outcome : null, outcome: r.outcome, sig: r.sig ?? null }]));
  }
  return { voices, meta };
}

function englishReport(dir) {
  const { voices, meta } = loadEnglish(dir);
  if (!voices['v-rules']) throw new Error(`no v-rules.json in ${dir}`);
  const base = voices['v-rules'];
  const rows = [...base.entries()].map(([id, r]) => ({ id, ...r }));
  const families = { symbolic: SYMBOLIC.filter((v) => voices[v]), neural: NEURAL.filter((v) => voices[v]) };
  const report = { meta, sets: {} };
  const groups = { ...Object.fromEntries(EN_SETS.map((s) => [s, rows.filter((r) => r.set === s)])) };
  // junk rows of loose-words (no intent: silence is right) are counted apart: the false-answer rate of each path on them
  const junk = rows.filter((r) => r.set === 'loose-words' && r.group === 'junk').map((r) => r.id);
  groups['loose-words'] = groups['loose-words'].filter((r) => r.group !== 'junk');
  // the typos and loose-words rows whose original / reference is itself not understood are 'skip' in every path: leave them out of n
  for (const [set, rs] of Object.entries(groups)) groups[set] = rs.filter((r) => Object.values(voices).some((m) => m.get(r.id)?.outcome !== 'skip'));
  groups['paraphrases (rt + changed)'] = [...groups['paraphrases-rt'], ...groups['paraphrases-rt-changed']];
  groups['all'] = EN_SETS.flatMap((s) => groups[s]);
  for (const [set, rs] of Object.entries(groups)) {
    const ids = rs.map((r) => r.id);
    const sub = Object.fromEntries(Object.keys(voices).map((v) => [v, voices[v]]));
    report.sets[set] = analyse(sub, ids, { families, baseline: 'v-rules' });
  }
  report.junk = { n: junk.length, false_answers: Object.fromEntries(Object.keys(voices).map((v) => [v, junk.filter((id) => voices[v].get(id)?.outcome === 'wrong').length])) };
  return report;
}

function romanianReport(file) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const paths = Object.keys(rows[0]).filter((k) => typeof rows[0][k] === 'object' && rows[0][k] && 'res' in rows[0][k]);
  const voices = {};
  for (const p of paths) voices[p] = new Map(rows.map((r) => [r.id, { ans: r[p].res === 'kept' ? 'right' : r[p].res === 'act' || r[p].res === 'other' ? 'wrong' : null, sig: r[p].key || null, res: r[p].res }]));
  const HAND = new Set(['operational', 'canon', 'real', 'talk']);
  const bySrc = (pred) => rows.filter(pred).map((r) => r.id);
  const groups = { all: rows.map((r) => r.id), 'hand Romanian (operational, canon, real, talk)': bySrc((r) => HAND.has(r.source)), 'machine / template Romanian (template, grid, roundtrip)': bySrc((r) => !HAND.has(r.source)) };
  for (const s of new Set(rows.map((r) => r.source))) groups[`source ${s}`] = bySrc((r) => r.source === s);
  const fam = { 'rules translator': ['rules'], 'grammar': ['grammar'], 'model chain': ['m4+model', 'model'] };
  const out = { paths, sets: {} };
  for (const [g, ids] of Object.entries(groups)) {
    out.sets[g] = analyse(voices, ids, { baseline: paths.includes('rules') ? 'rules' : null, families: Object.fromEntries(Object.entries(fam).filter(([, ms]) => ms.some((m) => voices[m]))) });
    // "unread" = the path made English the rules reader cannot read completely (silence); "act" = right act, a role differs (counted wrong, strict)
    out.sets[g].res = Object.fromEntries(paths.map((p) => [p, ids.reduce((t, id) => { const k = voices[p].get(id)?.res ?? 'abstain'; t[k] = (t[k] ?? 0) + 1; return t; }, {})]));
  }
  return out;
}

if (flag('report')) {
  const report = { date: new Date().toISOString().slice(0, 10), method: 'see the header of scripts/measure-voices.mjs', english: englishReport(DIR) };
  if (arg('ro-rows') && existsSync(arg('ro-rows'))) report.romanian = romanianReport(arg('ro-rows'));
  const out = resolve(arg('out', join(REPO, 'training/eval/voices-2026-11-15.json')));
  writeFileSync(out, JSON.stringify(report, null, 1));
  const line = (name, s) => `${name.padEnd(44)} n=${String(s.n).padStart(5)} answers ${String(s.answers).padStart(5)} cov ${String(s.coverage).padStart(5)} prec ${String(s.precision).padStart(5)}`;
  for (const [lang, rep] of [['EN', report.english], ['RO', report.romanian]].filter(([, r]) => r)) {
    for (const [set, a] of Object.entries(rep.sets)) {
      console.log(`\n== ${lang} ${set} (n=${a.n})`);
      for (const [v, s] of Object.entries(a.paths)) console.log(line(v, s) + (s.gain_over_baseline != null ? `  +${s.gain_over_baseline}/-${s.lost_vs_baseline} vs base` : ''));
      console.log(`union (any right): ${a.union.right} = ${a.union.right_of_n}%   agreement-only (>=2 paths): answers ${a.agreement_all.answers}, cov ${a.agreement_all.coverage}%, prec ${a.agreement_all.precision}%` + (a.agreement_families ? `   families: answers ${a.agreement_families.answers}, cov ${a.agreement_families.coverage}%, prec ${a.agreement_families.precision}%` : ''));
    }
  }
  console.log('\nwrote', out);
}
