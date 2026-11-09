#!/usr/bin/env node
/**
 * Build the training dataset (training/README.md "Dataset", specs 08 and 10).
 *
 * Merges three sources into training/dataset/:
 *   - training/data/*.jsonl              generators + rule-derived (run `node scripts/export-training.mjs` first; done
 *                                        automatically when the directory has no jsonl)
 *   - training/paraphrases/out/*.jsonl   paraphrase records (spec 10)
 *   - training/phrase-logs/labelled/*.jsonl  self-validated rows of the learning loop (D5, scripts/learn-from-logs.mjs): dataset-format records
 *                                        (label_status self-validated, weight 0.8), one per segment, with a circuit; they also feed routing.jsonl
 *   - training/phrase-logs/*.jsonl       optional phrase-log exports of the webchat (docs/webchat/ui/phrase-log.mjs):
 *                                        they carry no circuit, so they go to unlabelled.jsonl; records routed to exactly one
 *                                        world also feed routing.jsonl
 * Output:
 *   dataset/<world>/{train,dev,test}.jsonl   one record per line; weight, label_status, source and provenance kept
 *   dataset/<world>/review.jsonl             needs_review rows and flagged rows that landed in a test group (not trainable/testable)
 *   dataset/routing.jsonl                    text + context {tab, recent_worlds} -> world, with split
 *   dataset/unlabelled.jsonl                 rows without a trusted target, for review
 *   dataset/stats.json                       counts per world / split / source / label
 * Splits are by group (world + task goal / generator group): paraphrases of one goal never cross splits.
 * Deterministic: --seed (default 1337) is hashed with world and group. Dedupe by normalized text (+ context) per world.
 *
 * Usage: node scripts/build-dataset.mjs [--out-dir training/dataset] [--seed 1337] [--dev 0.1] [--test 0.1]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(ROOT, opt('out-dir', 'training/dataset'));
// generators / collector outputs; scripts/relabel-training.mjs --out-root <dir> writes repaired copies there (data/ and paraphrases/out/)
const SRC = resolve(ROOT, opt('src-root', 'training'));
const SEED = String(opt('seed', '1337'));
const DEV = Number(opt('dev', '0.1'));
const TEST = Number(opt('test', '0.1'));

const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const listJsonl = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.jsonl')).sort().map((f) => join(d, f)) : []);
const sha = (s) => createHash('sha256').update(s).digest();
const unit = (s) => sha(s).readUInt32BE(0) / 0x100000000;
export const normText = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const worldOfFile = (f) => f.split('/').pop().replace(/\.jsonl$/, '');

if (listJsonl(join(SRC, 'data')).length === 0) {
  console.log('training/data is empty: running export-training first');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/export-training.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/** Weight and flags of a source record (spec 08 and 10). */
function classify(r) {
  const kind = r.lineage?.kind ?? r.mode ?? 'unknown';
  const status = r.label_status;
  const circuit = (r.expected_circuit ?? '').trim();
  const out = { source: kind === 'paraphrase' || r.mode === 'paraphrase' ? 'paraphrase' : kind, status, weight: 1, target: circuit, negative: !!r.negative || status === 'negative', review: false, unlabelled: null, flagged: false };
  if (out.negative) { out.target = ''; return out; }
  if (r.needs_review) { out.review = true; out.weight = 0; return out; }
  if (!circuit || (out.source === 'paraphrase' && r.target_from == null)) { out.unlabelled = 'no_target'; return out; }
  if (status === 'generator-disagrees') { out.weight = 0.5; out.flagged = true; }
  else if (out.source === 'paraphrase' && r.target_from === 'canonical') out.weight = 0.8;
  else if (status === 'self-validated') out.weight = 0.8;   // D5: the validation layer's own reading of a real phrase (scripts/learn-from-logs.mjs)
  return out;
}

// ---- load -----------------------------------------------------------------------------------------------------------
const worldTab = new Map();
const rows = []; // {world, text, context, ...}
const unlabelled = [];
const dupStats = { duplicates: 0, conflicting_targets: 0 };
let totalRead = 0;
function ingest(file, requireWorld) {
  for (const r of readJsonl(file)) {
    totalRead++;
    const world = r.world ?? r.lineage?.world ?? worldOfFile(file);
    if (requireWorld && !world) continue;
    if (r.tab && r.mode === 'paraphrase' && !worldTab.has(world)) worldTab.set(world, r.tab);
    const c = classify(r);
    const group = String(r.group ?? r.source_group ?? r.example_id);
    const rec = {
      id: r.example_id, world, text: r.text, context: r.context ?? [], target: c.target, negative: c.negative,
      label_status: c.status, source: c.source, weight: c.weight, group: group.startsWith(world + '/') ? group : `${world}/${group}`,
      label_reason: r.label_reason ?? null, phenomenon: r.phenomenon ?? null, tab: r.tab ?? null, target_from: r.target_from ?? null,
      provenance: { file: file.replace(ROOT + '/', ''), example_id: r.example_id, lineage: r.lineage ?? null, author: r.author ?? null, batch: r.batch ?? null, attempt: r.attempt ?? null, seed: r.seed ?? null, generator_version: r.generator_version ?? null },
      _review: c.review, _flagged: c.flagged,
    };
    if (c.unlabelled) { unlabelled.push({ ...rec, reason: c.unlabelled }); continue; }
    rows.push(rec);
  }
}
for (const f of listJsonl(join(SRC, 'data'))) ingest(f);
for (const f of listJsonl(join(SRC, 'paraphrases/out'))) ingest(f);
for (const f of listJsonl(join(ROOT, 'training/phrase-logs/labelled'))) ingest(f);   // D5 self-validated rows (dataset-record format, one per segment)

// ---- dedupe by normalized text (+ context) per world; keep the most trustworthy ----------------------------------------
const rank = (r) => (r._review ? -1 : r.weight) * 10 + (r.source === 'paraphrase' ? 2 : r.source === 'generator' ? 1 : 0) + (r.negative ? -0.5 : 0);
const byKey = new Map();
for (const r of rows) {
  const k = `${r.world}\u0000${normText(r.text)}\u0000${r.context.map(normText).join('|')}`;
  const prev = byKey.get(k);
  if (!prev) { byKey.set(k, r); continue; }
  dupStats.duplicates++;
  if (prev.target !== r.target) dupStats.conflicting_targets++;
  if (rank(r) > rank(prev)) byKey.set(k, r);
}
const kept = [...byKey.values()];

// ---- splits by group -----------------------------------------------------------------------------------------------------
const splitOfGroup = new Map();
const byWorld = new Map();
for (const r of kept) { if (!byWorld.has(r.world)) byWorld.set(r.world, []); byWorld.get(r.world).push(r); }
for (const [world, rs] of byWorld) {
  const sizes = new Map();
  for (const r of rs) sizes.set(r.group, (sizes.get(r.group) ?? 0) + 1);
  const groups = [...sizes.keys()].sort((a, b) => unit(`${SEED}\n${world}\n${a}`) - unit(`${SEED}\n${world}\n${b}`) || (a < b ? -1 : 1));
  const total = rs.length, tT = total * TEST, tD = total * DEV;
  let nT = 0, nD = 0;
  for (const g of groups) {
    const s = sizes.get(g);
    let sp = 'train';
    if (groups.length >= 3 && (nT < tT) && (nT + s <= tT * 1.5 || (nT === 0 && s <= tT * 3))) { sp = 'test'; nT += s; }
    else if (groups.length >= 3 && (nD < tD) && (nD + s <= tD * 1.5 || (nD === 0 && s <= tD * 3))) { sp = 'dev'; nD += s; }
    splitOfGroup.set(`${world}\u0000${g}`, sp);
  }
}

// ---- write per-world files ----------------------------------------------------------------------------------------------------
// remove only the per-world directories this script writes (they hold train.jsonl); other generated data under OUT is kept
mkdirSync(OUT, { recursive: true });
for (const d of readdirSync(OUT, { withFileTypes: true })) {
  if (d.isDirectory() && existsSync(join(OUT, d.name, 'train.jsonl')) && !d.name.startsWith('multicmd')) rmSync(join(OUT, d.name), { recursive: true, force: true });
}
const stats = { seed: SEED, shares: { dev: DEV, test: TEST }, source_records_read: totalRead, dedupe: dupStats, worlds: {}, routing: {}, unlabelled: {}, totals: {} };
const inc = (o, ...path) => { let c = o; for (const p of path.slice(0, -1)) c = c[p] ??= {}; const l = path.at(-1); c[l] = (c[l] ?? 0) + 1; };
const clean = ({ _review, _flagged, ...r }) => r;
const out = { train: [], dev: [], test: [], review: [] };
const files = new Map();
const put = (world, name, rec) => { const f = join(OUT, world, name + '.jsonl'); if (!files.has(f)) { mkdirSync(dirname(f), { recursive: true }); files.set(f, []); } files.get(f).push(JSON.stringify(rec)); };
const final = []; // records with their split, for routing
const routeOnly = []; // relabel-quarantined records: no circuit, but the text and world label are right (dispatcher routing data)
for (const r of kept) {
  let split = splitOfGroup.get(`${r.world}\u0000${r.group}`);
  const w = stats.worlds[r.world] ??= { total: 0, splits: {}, by_source: {}, by_label: {}, by_split_source: {}, by_split_label: {}, negatives: 0, review: 0 };
  if (r._review || (split === 'test' && r._flagged)) {
    put(r.world, 'review', { ...clean(r), split, reason: r._review ? 'needs_review' : 'flagged_in_test_group' });
    w.review++; inc(w, 'by_label', r.label_status); inc(w, 'by_source', r.source);
    if (r._review && /^relabel:/.test(r.label_reason ?? '')) routeOnly.push({ ...r, split, weight: 0.8 });
    continue;
  }
  put(r.world, split, { ...clean(r), split });
  final.push({ ...r, split });
  w.total++; if (r.negative) w.negatives++;
  inc(w, 'splits', split); inc(w, 'by_source', r.source); inc(w, 'by_label', r.label_status);
  inc(w, 'by_split_source', split, r.source); inc(w, 'by_split_label', split, r.label_status);
}
for (const [f, lines] of files) writeFileSync(f, lines.join('\n') + '\n');

// ---- phrase logs ----------------------------------------------------------------------------------------------------------------
const phraseRouted = [];
for (const f of listJsonl(join(ROOT, 'training/phrase-logs')).filter((x) => !x.endsWith('/review.jsonl'))) {   // review.jsonl is the D5 queue, not a log
  const recs = readJsonl(f).filter((r) => r && typeof r.text === 'string' && r.source !== 'chip' && r.mode !== 'chip')
    .sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));
  const recent = [];
  for (const r of recs) {
    totalRead++;
    const worlds = (r.worlds ?? []).filter(Boolean);
    const text = r.english ?? r.text;
    const routed = worlds.length === 1 && r.status === 'supported' ? worlds[0] : null;
    const base = { id: 'pl' + sha(`${f}\n${r.time}\n${r.text}`).toString('hex').slice(0, 14), text, orig_text: r.text, lang: r.lang ?? 'en', tab: r.tab ?? null, mode: r.mode ?? null, status: r.status ?? null, worlds, time: r.time ?? null, provenance: { file: f.replace(ROOT + '/', ''), source: 'phrase-log' } };
    unlabelled.push({ ...base, source: 'phrase-log', label_status: 'phrase-log', reason: 'no_circuit', routed_world: routed });
    if (routed) phraseRouted.push({ ...base, world: routed, recent_worlds: recent.slice(-3).reverse() });
    if (routed) recent.push(routed);
  }
}

// ---- routing --------------------------------------------------------------------------------------------------------------------------
// Real context where known (paraphrase tab, phrase-log tab and history). Generator and rule-derived rows have no session context:
// synthetic one is attached deterministically (tab: own 60%, another world's 20%, none 20%; recent worlds 0-2) and flagged.
const worldNames = [...byWorld.keys()].sort();
const tabOf = (w) => worldTab.get(w) ?? null;
const tabs = [...new Set(worldNames.map(tabOf).filter(Boolean))].sort();
const routing = [];
const seenRoute = new Map();
const pick = (arr, s) => arr[Math.floor(unit(s) * arr.length) % arr.length];
for (const r of [...final, ...routeOnly]) {
  if (r.negative) continue;
  const key = `${normText(r.text)}\u0000${r.context.map(normText).join('|')}\u0000${r.tab ?? ''}`;
  let tab = r.tab, recent = [], synthetic = false;
  if (!tab) {
    synthetic = true;
    const u = unit(`${SEED}\ntab\n${r.id}`);
    tab = u < 0.6 ? tabOf(r.world) : u < 0.8 ? pick(tabs, `${SEED}\ntab2\n${r.id}`) : null;
  }
  const nRecent = Math.floor(unit(`${SEED}\nnr\n${r.id}`) * 3);
  for (let i = 0; i < nRecent; i++) recent.push(unit(`${SEED}\nrw${i}\n${r.id}`) < 0.5 ? r.world : pick(worldNames, `${SEED}\nrw2${i}\n${r.id}`));
  recent = recent.filter((w, i) => w !== recent[i - 1]);
  const rec = { id: r.id, text: r.text, context: { tab, recent_worlds: recent, session: r.context, synthetic }, world: r.world, alt_worlds: [], split: r.split, weight: r.weight, source: r.source, label_status: r.label_status, provenance: r.provenance };
  const prev = seenRoute.get(key);
  if (prev) { if (prev.world !== r.world && !prev.alt_worlds.includes(r.world)) prev.alt_worlds.push(r.world); continue; }
  seenRoute.set(key, rec); routing.push(rec);
}
// phrase-log routed rows: split by hash of normalized text (no group); never mixed into generator groups.
for (const p of phraseRouted) {
  const key = `${normText(p.text)}\u0000\u0000${p.tab ?? ''}`;
  if (seenRoute.has(key)) continue;
  const u = unit(`${SEED}\nplsplit\n${normText(p.text)}`);
  const rec = { id: p.id, text: p.text, context: { tab: p.tab, recent_worlds: p.recent_worlds, session: [], synthetic: false }, world: p.world, alt_worlds: [], split: u < TEST ? 'test' : u < TEST + DEV ? 'dev' : 'train', weight: 0.8, source: 'phrase-log', label_status: 'phrase-log-routed', provenance: p.provenance };
  seenRoute.set(key, rec); routing.push(rec);
}
writeFileSync(join(OUT, 'routing.jsonl'), routing.map((r) => JSON.stringify(r)).join('\n') + '\n');
for (const r of routing) { inc(stats.routing, 'by_split', r.split); inc(stats.routing, 'by_world', r.world); inc(stats.routing, 'by_source', r.source); if (r.alt_worlds.length) inc(stats.routing, 'ambiguous_texts', 'n'); }
stats.routing.total = routing.length;

writeFileSync(join(OUT, 'unlabelled.jsonl'), unlabelled.map((r) => JSON.stringify(clean(r))).join('\n') + (unlabelled.length ? '\n' : ''));
for (const u of unlabelled) inc(stats.unlabelled, 'by_reason', u.reason);
stats.unlabelled.total = unlabelled.length;

const T = stats.totals;
T.records = final.length;
for (const w of Object.values(stats.worlds)) for (const [k, v] of Object.entries(w.splits)) T[k] = (T[k] ?? 0) + v;
T.worlds = worldNames.length;
writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
console.log(`worlds ${T.worlds}  records ${T.records} (train ${T.train ?? 0} / dev ${T.dev ?? 0} / test ${T.test ?? 0})  routing ${routing.length}  unlabelled ${unlabelled.length}  duplicates dropped ${dupStats.duplicates}`);
