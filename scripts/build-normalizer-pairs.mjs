#!/usr/bin/env node
/**
 * Training pairs of the seq2seq normalizer (worker-tasks N1, spec 03 section 7.11).
 *
 * The normalizer rewrites one piece of a message into the SIMPLEST phrasing the world's rules understand. A pair (src -> tgt) is kept only
 * when the rules VERIFY it: tgt formalizes completely, in the record's world / tab / setup, to the SOP that src is labelled with (variants:
 * the record's target; clean sentences: their own reading). Sources of pairs:
 *   variant            Haiku paraphrase variant -> the SHORTEST verified phrasing of its task or world: the canonical, another variant that the
 *                      rules read to the variant's target SOP, or a pattern `example=` of the world that reads to the same SOP
 *   variant-canonical  the same variant -> its canonical (when the canonical is not already the chosen target)
 *   variant-identity   a variant the rules already read and that is the shortest phrasing
 *   canonical          canonical sentence -> shortest equivalent (itself when it is the shortest)
 *   generator / rule-derived   generated sentences of training/dataset/routing.jsonl -> shortest equivalent (itself when shortest)
 *   example            pattern example= texts -> shortest equivalent
 *   synthetic          noise (typos, abbreviations, fillers, politeness, run-ons, lower case, dropped punctuation) applied to a clean sentence ->
 *                      that sentence's shortest equivalent (labels are known by construction, the number is unlimited)
 * "Shortest equivalent": the shortest text (fewest characters) of the same world, tab and setup whose normalized SOP equals the sentence's.
 * Only the train split is written to train.jsonl; dev variants go to dev.jsonl. The evaluation records are the D1b eval files
 * (training/dataset-edit/eval-{dev,test,heldout}.jsonl) plus eval-fresh.jsonl built here from freshly collected batches (--fresh-dir).
 *
 * Output (training/dataset-normalizer/, jsonl ignored by git; report.json committed):
 *   train.jsonl dev.jsonl   {id, src, tgt, world, tab, source}
 *   eval-fresh.jsonl        eval records in the format of training/dataset-edit/eval-*.jsonl
 *   report.json             pair counts per source
 *
 * Usage: node scripts/build-normalizer-pairs.mjs [--synthetic 150000] [--fresh-dir <collect-paraphrases out dir>] [--out training/dataset-normalizer] [--seed 7]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { makeRunner, sopKey, isOk } from './build-edit-tags.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

// ---- noise ------------------------------------------------------------------------------------------------------------------
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KEYS = { q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol', a: 'qsz', s: 'awdx', d: 'serf', f: 'drgc', g: 'fthv', h: 'gyjb', j: 'hukn', k: 'jilm', l: 'kop', z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk' };
const ABBREV = { you: ['u'], your: ['ur'], are: ['r'], please: ['pls', 'plz'], thanks: ['thx'], because: ['bc', 'cuz'], people: ['ppl'], though: ['tho'], want: ['wanna'], going: ['gonna'], what: ['wat', 'wht'], the: ['da'], with: ['w/'], and: ['n', '&'], how: ['hw'], want_to: ['wanna'], tell: ['tel'], give: ['giv'], show: ['shw'], make: ['mke'], draw: ['drw'], number: ['num', 'no.'], picture: ['pic'], message: ['msg'], minutes: ['mins'], seconds: ['secs'], okay: ['ok', 'k'] };
const PRE = ['please', 'pls', 'hey', 'hey,', 'hi', 'yo', 'ok', 'ok so', 'okay so', 'um', 'uh', 'so', 'well', 'hmm', 'like', 'could you', 'can you', 'could you please', 'can you please', 'would you', 'will you', 'i want you to', 'i would like you to', "i'd like to", 'i want to', 'go ahead and', 'let us', "let's", 'you should', 'now', 'ok now', 'and then', 'then', 'quick,', 'hey could you', 'hey can you', 'hey, can you', 'um, can you', 'please could you', 'i need you to', 'just', 'now please', 'kindly', 'listen,', 'oh and', 'also', 'and', 'ah', 'right,', 'alright,'];
const SUF = ['please', 'pls', 'plz', 'thanks', 'thx', 'thank you', 'lol', 'now', 'for me', 'if you can', 'ok', 'okay', 'right now', 'quickly', 'real quick', 'asap', 'again', 'too', 'for us', ':)', 'haha', 'ok?', 'thanks!', 'right', 'then', 'ok thanks', 'for now', 'if possible', 'when you can', 'would you', 'will you', 'alright'];
const MID = ['actually', 'just', 'really', 'kind of', 'basically', 'like', 'um', 'uh', 'maybe', 'please', 'simply'];
const PROTECT = /\d|["“”]/;

function makeNoiser(rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const typo = (w) => {
    if (w.length < 4 || PROTECT.test(w) || !/^[a-z']+$/i.test(w)) return w;
    const i = 1 + Math.floor(rnd() * (w.length - 2));
    const r = rnd();
    if (r < 0.3) return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);                 // swap
    if (r < 0.5) return w.slice(0, i) + w.slice(i + 1);                                   // drop
    if (r < 0.7) return w.slice(0, i) + w[i] + w.slice(i);                                // double
    const k = KEYS[w[i].toLowerCase()];
    return k ? w.slice(0, i) + pick(k.split('')) + w.slice(i + 1) : w;                    // neighbour key
  };
  return (clean) => {
    let t = clean.trim();
    const ops = 1 + Math.floor(rnd() * 3);
    for (let o = 0; o < ops; o++) {
      const r = rnd();
      if (r < 0.28) {                                                                      // typos in 1-2 words
        const ws = t.split(' ');
        const idx = ws.map((w, i) => [w, i]).filter(([w]) => w.length >= 4 && !PROTECT.test(w));
        for (let k = 0; k < 1 + (rnd() < 0.3); k++) { if (!idx.length) break; const [w, i] = pick(idx); ws[i] = typo(w.replace(/[?.!,]$/, '')) + (/[?.!,]$/.test(w) ? w.slice(-1) : ''); }
        t = ws.join(' ');
      } else if (r < 0.40) {                                                               // abbreviations
        const ws = t.split(' ');
        const idx = ws.map((w, i) => [w.toLowerCase().replace(/[?.!,]$/, ''), i]).filter(([w]) => ABBREV[w]);
        if (idx.length) { const [w, i] = pick(idx); ws[i] = pick(ABBREV[w]) + (/[?.!,]$/.test(ws[i]) ? ws[i].slice(-1) : ''); t = ws.join(' '); }
      } else if (r < 0.62) {                                                               // filler / politeness prefix
        const body = rnd() < 0.7 ? t.replace(/^([A-Z])/, (m) => m.toLowerCase()) : t;
        t = `${pick(PRE)} ${body}`;
      } else if (r < 0.80) {                                                               // suffix
        t = t.replace(/[.!]$/, '').replace(/\?$/, rnd() < 0.5 ? '' : '?');
        t = `${t}${rnd() < 0.3 ? ',' : ''} ${pick(SUF)}`;
      } else if (r < 0.86) {                                                               // mid filler
        const ws = t.split(' '); if (ws.length > 2) { ws.splice(1 + Math.floor(rnd() * (ws.length - 1)), 0, pick(MID)); t = ws.join(' '); }
      } else if (r < 0.91) t = t.toLowerCase();
      else if (r < 0.95) t = t.replace(/[.!?,]/g, '');
      else if (r < 0.97) { const ws = t.split(' '); const i = Math.floor(rnd() * ws.length); ws.splice(i, 0, ws[i]); t = ws.join(' '); }    // repetition
      else t = t.toUpperCase().slice(0, 1) + t.slice(1);
    }
    return t.replace(/\s+/g, ' ').trim();
  };
}

// ---- main ---------------------------------------------------------------------------------------------------------------------
async function main() {
  const outDir = resolve(REPO, opt('--out', 'training/dataset-normalizer'));
  const synthCount = Number(opt('--synthetic', '150000'));
  const freshDir = opt('--fresh-dir', null);
  const seed = Number(opt('--seed', '7'));
  mkdirSync(outDir, { recursive: true });
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const run = makeRunner(engine);
  const legends = engine.set.legends;
  const routing = readJsonl(join(REPO, 'training/dataset/routing.jsonl'));

  // splits (as scripts/build-edit-tags.mjs)
  const splitById = new Map(), splitByGroup = new Map();
  const recs = [];
  for (const [set, dir] of [['out', 'training/paraphrases/out'], ['heldout', 'training/paraphrases/heldout/out']]) {
    for (const f of readdirSync(join(REPO, dir)).filter((x) => x.endsWith('.jsonl')).sort()) {
      for (const r of readJsonl(join(REPO, dir, f))) if (!r.needs_review) recs.push({ ...r, set });
    }
  }
  const idToGroup = new Map(recs.filter((r) => r.set === 'out').map((r) => [r.example_id, r.group]));
  for (const row of routing) {
    const id = row.provenance?.example_id;
    if (row.source === 'paraphrase' && id) { splitById.set(id, row.split); if (idToGroup.has(id)) splitByGroup.set(idToGroup.get(id), row.split); }
  }
  const splitOfRec = (r) => (r.set === 'heldout' ? 'heldout' : splitById.get(r.example_id) ?? splitByGroup.get(r.group) ?? 'train');

  // pattern examples per world (every example="..." of the world's .sop files)
  const examplesByWorld = new Map();
  const worldsRoot = resolve(REPO, 'worlds');
  for (const w of readdirSync(worldsRoot)) {
    const dir = join(worldsRoot, w);
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith('.sop') && f !== 'tests.sop'); } catch { continue; }
    const set = new Set();
    for (const f of files) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/^\s*example="((?:[^"\\]|\\.)*)"\s*$/gm)) set.add(m[1].replace(/\\"/g, '"'));
    if (set.size) examplesByWorld.set(w, [...set]);
  }
  const nEx = [...examplesByWorld.values()].reduce((a, x) => a + x.length, 0);
  console.log(`pattern examples: ${nEx} in ${examplesByWorld.size} worlds`);
  // index of examples by their SOP in (world, tab) with no setup
  const exIndex = new Map();
  const examplesOf = (world, tab) => {
    const k = `${world}|${tab ?? ''}`;
    if (!exIndex.has(k)) {
      const m = new Map();
      for (const t of examplesByWorld.get(world) ?? []) {
        const r = run(world, tab, [], t);
        if (r.parsed > 0 && r.unparsed === 0) { const key = sopKey(r.sop); if (!m.has(key)) m.set(key, []); m.get(key).push(t); }
      }
      exIndex.set(k, m);
    }
    return exIndex.get(k);
  };

  // tasks
  const tasks = new Map();
  for (const r of recs) {
    const k = `${r.set}|${r.world}|${r.batch}|${r.task}`;
    if (!tasks.has(k)) tasks.set(k, { key: k, world: r.world, items: [] });
    let tkey = null;
    if (r.expected_circuit) { const p = parse(r.expected_circuit, { source: r.example_id }); if (!p.errors.length && p.wires.length) tkey = sopKey(normalizedSop(p.wires, legends)); }
    tasks.get(k).items.push({ rec: r, text: r.text, role: r.lineage.role, tkey, res: run(r.world, r.tab, r.setup ?? [], r.text), split: splitOfRec(r) });
  }
  console.log(`records ${recs.length}, tasks ${tasks.size}`);

  const pairs = { train: [], dev: [] };
  const seen = new Set();
  const counts = {};
  const add = (split, p) => {
    if (!p.tgt || !p.src.trim()) return;
    const key = `${split}\u0001${p.world}\u0001${p.tab ?? ''}\u0001${p.src}\u0001${p.tgt}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!pairs[split]) return;
    pairs[split].push(p);
    counts[`${split}/${p.source}`] = (counts[`${split}/${p.source}`] ?? 0) + 1;
  };
  const FILL = /\b(pls|plz|please|thanks|thx|lol|hey|okay|ok)\b/i;   // a target with a filler word ranks after every clean one
  const shorter = (a, b) => (FILL.test(a) !== FILL.test(b) ? (FILL.test(a) ? 1 : -1) : a.length !== b.length ? a.length - b.length : a < b ? -1 : 1);

  // 1. variants
  for (const t of tasks.values()) {
    for (const it of t.items) {
      if (it.role !== 'variant' || !it.tkey || (it.split !== 'train' && it.split !== 'dev')) continue;
      const rec = it.rec, ctx = [rec.world, rec.tab, rec.setup ?? []];
      const cands = new Set();
      for (const o of t.items) if (o !== it && isOk(o.res, it.tkey)) cands.add(o.text.trim());
      for (const x of examplesOf(rec.world, rec.tab).get(it.tkey) ?? []) cands.add(x);
      if (isOk(it.res, it.tkey)) cands.add(it.text.trim());
      const verified = [...cands].filter((c) => c === it.text.trim() || isOk(run(...ctx, c), it.tkey)).sort(shorter);
      if (!verified.length) continue;
      const best = verified[0];
      const base = { world: rec.world, tab: rec.tab ?? null };
      if (best === it.text.trim()) add(it.split, { ...base, id: rec.example_id, src: it.text.trim(), tgt: best, source: 'variant-identity' });
      else add(it.split, { ...base, id: rec.example_id, src: it.text.trim(), tgt: best, source: isOk(it.res, it.tkey) ? 'variant-shorter' : 'variant' });
      const canon = t.items.find((o) => o.role === 'canonical' && isOk(o.res, it.tkey));
      if (canon && canon.text.trim() !== best && canon.text.trim() !== it.text.trim()) add(it.split, { ...base, id: rec.example_id, src: it.text.trim(), tgt: canon.text.trim(), source: 'variant-canonical' });
    }
  }
  // 2. clean sentences -> shortest equivalent (equivalence classes per (world, tab, session))
  const clean = [];   // { world, tab, setup, text, sop, source, split }
  for (const t of tasks.values()) for (const it of t.items) {
    if (it.role === 'canonical' && it.res.parsed > 0 && it.res.unparsed === 0 && (it.split === 'train' || it.split === 'dev')) clean.push({ world: t.world, tab: it.rec.tab ?? null, setup: it.rec.setup ?? [], text: it.text.trim(), sop: sopKey(it.res.sop), source: 'canonical', split: it.split, id: it.rec.example_id });
  }
  for (const row of routing) {
    if (row.source === 'paraphrase' || row.source === 'phrase-log' || (row.split !== 'train' && row.split !== 'dev')) continue;
    if (row.alt_worlds?.length) continue;
    const tab = row.context?.tab ?? null, setup = row.context?.session ?? [];
    const r = run(row.world, tab, setup, row.text);
    if (r.parsed > 0 && r.unparsed === 0) clean.push({ world: row.world, tab, setup, text: row.text.trim(), sop: sopKey(r.sop), source: row.source, split: row.split, id: row.id });
  }
  for (const [w, list] of examplesByWorld) for (const text of list) {
    const r = run(w, null, [], text);
    if (r.parsed > 0 && r.unparsed === 0) clean.push({ world: w, tab: null, setup: [], text, sop: sopKey(r.sop), source: 'example', split: 'train', id: `ex-${w}-${text}` });
  }
  // classes: key (world, setup, sop); tab is ignored (the rules of a world read the same text in any tab for these sentences; verified below)
  const classes = new Map();
  for (const c of clean) { const k = JSON.stringify([c.world, c.setup, c.sop]); if (!classes.has(k)) classes.set(k, []); classes.get(k).push(c); }
  const shortestOf = new Map();
  for (const [k, list] of classes) {
    const sorted = [...new Set(list.map((c) => c.text))].sort(shorter);
    shortestOf.set(k, sorted[0]);
  }
  const cleanWithTarget = [];
  for (const c of clean) {
    const k = JSON.stringify([c.world, c.setup, c.sop]);
    let tgt = shortestOf.get(k);
    if (tgt !== c.text && !isOk(run(c.world, c.tab, c.setup, tgt), c.sop)) tgt = c.text;   // verified in this tab, else keep itself
    cleanWithTarget.push({ ...c, tgt });
    add(c.split, { id: c.id, world: c.world, tab: c.tab, src: c.text, tgt, source: tgt === c.text ? c.source : `${c.source}-shorter` });
  }
  console.log(`clean sentences ${clean.length}, equivalence classes ${classes.size}`);

  // 3. synthetic noise on clean training sentences
  const rnd = rng32(seed);
  const noiser = makeNoiser(rnd);
  const pool = cleanWithTarget.filter((c) => c.split === 'train' && c.text.split(' ').length <= 14);
  // weight canonicals and examples like generator rows (uniform over the pool; each class contributes up to its size)
  let made = 0, tries = 0;
  while (made < synthCount && tries++ < synthCount * 5) {
    const c = pool[Math.floor(rnd() * pool.length)];
    const noisy = noiser(c.text);
    if (!noisy || noisy === c.text || noisy.length > 160) continue;
    const before = counts['train/synthetic'] ?? 0;
    add('train', { id: `syn-${made}`, world: c.world, tab: c.tab, src: noisy, tgt: c.tgt, source: 'synthetic' });
    if ((counts['train/synthetic'] ?? 0) > before) made++;
  }

  // 4. fresh eval records
  let fresh = 0;
  if (freshDir) {
    const rows = [];
    for (const f of readdirSync(resolve(freshDir)).filter((x) => x.endsWith('.jsonl'))) {
      for (const r of readJsonl(join(resolve(freshDir), f))) {
        if (r.needs_review || r.lineage.role !== 'variant' || !r.expected_circuit) continue;
        rows.push({ id: r.example_id, world: r.world, split: 'fresh', tab: r.tab ?? null, setup: r.setup ?? [], text: r.text, target: r.expected_circuit, role: 'variant', label_status: r.label_status, context: { tab: r.tab ?? null, recent_worlds: [] } });
      }
    }
    fresh = rows.length;
    writeFileSync(join(outDir, 'eval-fresh.jsonl'), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  }

  for (const [s, rows] of Object.entries(pairs)) writeFileSync(join(outDir, `${s}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const report = { generated_by: `node scripts/build-normalizer-pairs.mjs ${args.join(' ')}`, pairs: counts, totals: Object.fromEntries(Object.entries(pairs).map(([s, r]) => [s, r.length])), pattern_examples: nEx, clean_sentences: clean.length, equivalence_classes: classes.size, fresh_eval_records: fresh };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
}
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
