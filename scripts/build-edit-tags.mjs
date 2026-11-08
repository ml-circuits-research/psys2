#!/usr/bin/env node
/**
 * Alignment data for the simplification head (edit tagging; worker-tasks D1b, spec 03 section 7.2).
 *
 * For every paraphrase variant (training/paraphrases/out and heldout/out; records with needs_review are skipped) the variant's words are
 * aligned with the closest VERIFIED reference phrasing of the same task (the canonical or another phrasing of the task that the rules
 * formalize to the variant's target SOP) and turned into per-word tags KEEP / DELETE / R:<text> / A:<text> (src/formalizer/edit-tags.mjs).
 * The tags are applied, the world's rules (restricted to the record's world, record context and tab, as in scripts/eval-rules.mjs) run on the
 * rewrite, and ONLY alignments whose rewrite formalizes to the target SOP are kept. Pass 1 builds the edit vocabulary (tags used in >= 2 tasks,
 * capped), pass 2 re-aligns with that vocabulary. Identity examples (canonical phrasings, generator and rule-derived texts: all KEEP) are added.
 *
 * Output (training/dataset-edit/, never wiped by build-dataset):
 *   edit-vocab.json   {tags: [...], word_regex, ...}   the edit vocabulary (R:/A: tags; KEEP and DELETE are implicit)
 *   {train,dev,test,heldout}.jsonl  examples {id, set, split, world, kind, text, context{tab,recent_worlds}, tags[], rewrite, ref, cost}
 *   eval-{dev,test,heldout}.jsonl   every paraphrase variant of the split (aligned or not): {id, world, split, tab, setup, text, target, role}
 *   report.json       survival per world, vocabulary size, tag counts
 *
 * Usage: node scripts/build-edit-tags.mjs [--vocab-cap 500] [--out training/dataset-edit] [--world <id>]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { formalize, FormSession } from '../src/formalizer/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { normalizedSop } from './collect-paraphrases.mjs';
import { wordsOf, applyEditTags, isPunctWord, WORD_RE } from '../src/formalizer/edit-tags.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJsonl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// ---- rules runner (as scripts/eval-rules.mjs runRestricted) ---------------------------------------------------------
export function makeRunner(engine) {
  const legends = engine.set.legends;
  const restricted = new Map();
  const cache = new Map();
  const sub = (world) => {
    if (!restricted.has(world)) {
      const set = engine.set, ids = set.available(world);
      const s = Object.create(set); s._cache = new Map(); s.list = () => ids.map((i) => set.get(i));
      restricted.set(world, s);
    }
    return restricted.get(world);
  };
  /** { sop: string[], parsed, unparsed } of `text` after the setup messages, in the record's tab, with only the world's rules. */
  return (world, tab, setup, text) => {
    const key = JSON.stringify([world, tab, setup, text]);
    if (cache.has(key)) return cache.get(key);
    let out;
    try {
      const form = new FormSession(); form.initDefaults();
      const ctx = { activeTab: tab ?? null, tabWorld: tab ? world : null, recentWorlds: [] };
      let res = null;
      [...setup, text].forEach((m, i) => { res = formalize(m, { worlds: sub(world), session: form, source: `msg${i + 1}`, context: ctx }); });
      const parsed = res.segments.filter((x) => !x.unparsed);
      out = { sop: normalizedSop(parsed.flatMap((x) => x.wires), legends), parsed: parsed.length, unparsed: res.segments.length - parsed.length };
    } catch (e) { out = { sop: ['ERROR'], parsed: 0, unparsed: 1 }; }
    cache.set(key, out);
    return out;
  };
}
export const sopKey = (sop) => JSON.stringify(sop);
export const isOk = (r, tkey) => r.parsed > 0 && r.unparsed === 0 && sopKey(r.sop) === tkey;

// ---- alignment -------------------------------------------------------------------------------------------------------
const norm = (w) => w.toLowerCase().replace(/\u2019/g, "'");
const MAX_TAG_WORDS = 3;

/**
 * Word-level edit alignment of variant words `a` to reference words `b` -> { tags, cost } (null when no valid tagging).
 * Substitutions are only allowed for pairs accepted by `pairOk(src, tgt)` (always allowed when `pairOk` is null: vocabulary discovery);
 * `insOk(word)` says whether inserting the word is cheap (a known A:/P: tag).
 */
export function alignTags(a, b, pairOk = null, insOk = () => false) {
  const n = a.length, m = b.length;
  const A = a.map((w) => norm(w.w)), B = b.map((w) => norm(w.w));
  const delC = (i) => (isPunctWord(a[i].w) ? 0.4 : 1.0);
  const insC = (j) => (isPunctWord(b[j].w) ? 0.4 : insOk(B[j]) ? 0.8 : pairOk ? 3.0 : 1.2);
  const subC = (i, j) => (A[i] === B[j] ? 0 : !pairOk ? (isPunctWord(a[i].w) !== isPunctWord(b[j].w) ? 9 : 1.3) : pairOk(A[i], B[j]) ? 0.5 : 9);
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) D[i][0] = D[i - 1][0] + delC(i - 1);
  for (let j = 1; j <= m; j++) D[0][j] = D[0][j - 1] + insC(j - 1);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    D[i][j] = Math.min(D[i - 1][j - 1] + subC(i - 1, j - 1), D[i - 1][j] + delC(i - 1), D[i][j - 1] + insC(j - 1));
  }
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + subC(i - 1, j - 1))) < 1e-9) { ops.push(['S', i - 1, j - 1]); i--; j--; }
    else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + delC(i - 1))) < 1e-9) { ops.push(['D', i - 1]); i--; }
    else { ops.push(['I', j - 1]); j--; }
  }
  ops.reverse();
  const tags = a.map(() => 'KEEP');
  let last = -1, pending = [];
  const room = (s) => s.split(' ').length < MAX_TAG_WORDS;
  for (const op of ops) {
    if (op[0] === 'S') {
      const [, x, y] = op;
      const tgt = B[y];
      if (pending.length) {
        if (!room([...pending, tgt].join(' ')) && pending.length >= MAX_TAG_WORDS) return null;
        tags[x] = A[x] === tgt ? `P:${pending.join(' ')}` : `R:${pending.join(' ')} ${tgt}`;
        pending = [];
      } else tags[x] = A[x] === tgt ? 'KEEP' : `R:${tgt}`;
      last = x;
    } else if (op[0] === 'D') tags[op[1]] = 'DELETE';
    else if (last < 0) { pending.push(B[op[1]]); if (pending.length > MAX_TAG_WORDS) return null; }
    else {
      const w = B[op[1]], t = tags[last];
      if (t === 'KEEP') tags[last] = `A:${w}`;
      else if ((t.startsWith('A:') || t.startsWith('R:')) && room(t.slice(2))) tags[last] = `${t} ${w}`;
      else return null;
    }
  }
  if (pending.length) return null;   // no surviving word to attach to
  return { tags, cost: D[n][m] };
}

// ---- synthetic data ----------------------------------------------------------------------------------------------------
const NOISE_STOP = new Set('a an the is are does do of to in on at it this that i you me my your many can could got has have'.split(' '));
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Noise phrases (deleted runs of 1-3 words that real variants contain, with where they sit) and noise pairs (source word -> target tag of the
 * real alignments) are mined from the best alignments of the real variants; clean routing texts are then corrupted with them. The tags that undo
 * the corruption are known exactly, so every synthetic example rewrites back to the clean text (a rule-derived or generator text).
 */
function makeSynthetic({ pairTasks, minPairTasks, routing, variants, candidates, W, vocab, goodPairs, bump, norm, count, seed }) {
  const runTasks = new Map(), runPos = new Map(), ngramTasks = new Map();
  for (const v of variants) {
    const c = candidates(v)[0];
    const ws = W(v.it.text);
    if (!c) continue;
    for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= ws.length; i++) bump(ngramTasks, ws.slice(i, i + n).map((x) => norm(x.w)).join(' '), v.task.key);
    let i = 0;
    while (i < ws.length) {
      if (c.tags[i] !== 'DELETE') { i++; continue; }
      let j = i;
      while (j < ws.length && c.tags[j] === 'DELETE') j++;
      const words = ws.slice(i, j).map((x) => norm(x.w));
      if (words.length <= 3 && !words.some(isPunctWord)) {
        const key = words.join(' ');
        bump(runTasks, key, v.task.key);
        const pos = i === 0 ? 'start' : j === ws.length ? 'end' : 'mid';
        const p = runPos.get(key) ?? { start: 0, end: 0, mid: 0 }; p[pos]++; runPos.set(key, p);
      }
      i = j;
    }
  }
  const phrases = [];
  for (const [key, t] of runTasks) {
    if (t.size < 3 || (t.size / (ngramTasks.get(key)?.size ?? 1)) < 0.5) continue;
    const p = runPos.get(key);
    const tot = p.start + p.end + p.mid;
    for (const pos of ['start', 'end', 'mid']) if (p[pos] / tot >= 0.2) phrases.push({ text: key, pos, weight: t.size * p[pos] / tot });
  }
  const pairs = [];
  for (const k of goodPairs) {
    const [src, tag] = k.split('\u0001');
    const nt = pairTasks.get(k)?.size ?? 0;
    if (nt < minPairTasks || nt / (ngramTasks.get(src)?.size ?? 1) < 0.5 || (src.length < 2 && !/\d/.test(src)) || NOISE_STOP.has(src) || NOISE_STOP.has(tag.slice(2))) continue;   // the source word must be (mostly) replaced by this target
    const tgt = tag.slice(2);
    if (!vocab.has(tag) || tgt.includes(' ') || !/^[a-z0-9]+$/.test(tgt) || !/^[a-z0-9']+$/.test(src)) continue;
    pairs.push({ src, tgt, tag, tasks: pairTasks.get(k).size });
  }
  const pairsByTgt = new Map();
  for (const p of pairs) { if (!pairsByTgt.has(p.tgt)) pairsByTgt.set(p.tgt, []); pairsByTgt.get(p.tgt).push(p); }
  const rnd = rng32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const wpick = (arr) => { let t = arr.reduce((a, x) => a + x.weight, 0) * rnd(); for (const x of arr) { t -= x.weight; if (t <= 0) return x; } return arr[arr.length - 1]; };
  const rows = routing.filter((r) => r.split === 'train' && (r.source === 'generator' || r.source === 'rule-derived') && !r.alt_worlds?.length);
  const examples = [];
  const seen = new Set();
  let attempts = 0;
  while (examples.length < count && attempts++ < count * 6) {
    const row = pick(rows);
    const clean = W(row.text);
    if (clean.length < 2 || clean.length > 18) continue;
    // work on units: { w (clean word text), tag }; build the noisy token list left to right
    const toks = clean.map((c) => ({ text: c.w, tag: 'KEEP', clean: c }));   // noisy words with the tag that restores the clean word
    const nOps = 1 + Math.floor(rnd() * 3);
    for (let o = 0; o < nOps; o++) {
      const r = rnd();
      if (r < 0.55 && phrases.length) {                  // insert a filler phrase
        const ph = wpick(phrases);
        const at = ph.pos === 'start' ? 0 : ph.pos === 'end' ? toks.length : 1 + Math.floor(rnd() * Math.max(toks.length - 1, 1));
        toks.splice(at, 0, ...ph.text.split(' ').map((w) => ({ text: w, tag: 'DELETE', clean: null })));
      } else if (r < 0.9) {                              // replace a word by a noisy source (reverse of a known pair)
        const cand = toks.map((t, i) => [t, i]).filter(([t]) => t.clean && t.tag === 'KEEP' && pairsByTgt.has(norm(t.text)));
        if (!cand.length) continue;
        const [t] = pick(cand); const p = pick(pairsByTgt.get(norm(t.text)));
        t.text = p.src; t.tag = p.tag;
      } else {                                           // drop the final question mark / full stop (restored by an append tag)
        const last = toks[toks.length - 1];
        if (last && last.clean && (last.text === '?' || last.text === '.') && toks.length > 1 && toks[toks.length - 2].tag === 'KEEP') {
          toks.pop(); toks[toks.length - 1].tag = `A:${last.text}`;
        }
      }
    }
    if (toks.every((t) => t.tag === 'KEEP')) continue;
    // noisy text: join with single spaces, glue punctuation words that were glued in the clean text
    let text = '';
    toks.forEach((t, i) => {
      const gluedBefore = t.clean && t.clean.start > 0 && !/\s/.test(row.text[t.clean.start - 1]) && isPunctWord(t.text);
      text += (i && !gluedBefore ? ' ' : '') + t.text;
    });
    const words = W(text);
    if (words.length !== toks.length || words.some((w, i) => w.w !== toks[i].text)) continue;   // the noisy text must tokenize as built
    const tags = toks.map((t) => t.tag);
    if (!/^[RAP]:/.test(tags.join(' ')) && !tags.includes('DELETE')) continue;
    if (tags.some((g) => /^[RAP]:/.test(g) && !vocab.has(g))) continue;
    const back = applyEditTags(text, words, tags).trim();
    if (norm(back) !== norm(row.text.trim()) && back.replace(/\s+/g, ' ') !== row.text.trim().replace(/\s+/g, ' ')) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    examples.push({ id: `syn-${row.id}-${examples.length}`, set: 'synthetic', split: 'train', world: row.world, kind: 'synthetic', text, context: { tab: row.context?.tab ?? null, recent_worlds: row.context?.recent_worlds ?? [] }, tags, rewrite: back, ref: row.text, cost: tags.filter((g) => g !== 'KEEP').length });
  }
  return { examples, phrases: phrases.sort((a, b) => b.weight - a.weight), pairs };
}

// ---- main ------------------------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const vocabCap = Number(opt('--vocab-cap', '500'));
  const outDir = resolve(REPO, opt('--out', 'training/dataset-edit'));
  const onlyWorld = opt('--world', null);
  mkdirSync(outDir, { recursive: true });
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  const run = makeRunner(engine);
  const legends = engine.set.legends;

  // routing: split and context of every dataset row (join by the paraphrase record's example_id)
  const routing = readJsonl(join(REPO, 'training/dataset/routing.jsonl'));
  const splitById = new Map(), ctxById = new Map(), splitByGroup = new Map();
  const recs = [];
  for (const [set, dir] of [['out', 'training/paraphrases/out'], ['heldout', 'training/paraphrases/heldout/out']]) {
    for (const f of readdirSync(join(REPO, dir)).filter((x) => x.endsWith('.jsonl')).sort()) {
      for (const r of readJsonl(join(REPO, dir, f))) if (!r.needs_review && (!onlyWorld || r.world === onlyWorld)) recs.push({ ...r, set });
    }
  }
  const idToGroup = new Map(recs.filter((r) => r.set === 'out').map((r) => [r.example_id, r.group]));
  for (const row of routing) {
    const id = row.provenance?.example_id;
    if (row.source === 'paraphrase' && id) {
      splitById.set(id, row.split); ctxById.set(id, row.context);
      if (idToGroup.has(id)) splitByGroup.set(idToGroup.get(id), row.split);
    }
  }
  const splitOfRec = (r) => (r.set === 'heldout' ? 'heldout' : splitById.get(r.example_id) ?? splitByGroup.get(r.group) ?? 'train');
  const ctxOfRec = (r) => {
    const c = ctxById.get(r.example_id);
    return { tab: c ? c.tab : r.tab ?? null, recent_worlds: c ? c.recent_worlds ?? [] : [] };
  };

  // tasks
  const tasks = new Map();
  for (const r of recs) {
    const k = `${r.set}|${r.world}|${r.batch}|${r.task}`;
    if (!tasks.has(k)) tasks.set(k, { key: k, world: r.world, items: [] });
    const t = tasks.get(k);
    let tkey = null;
    if (r.expected_circuit) { const p = parse(r.expected_circuit, { source: r.example_id }); if (!p.errors.length && p.wires.length) tkey = sopKey(normalizedSop(p.wires, legends)); }
    const res = run(r.world, r.tab, r.setup ?? [], r.text);
    t.items.push({ rec: r, text: r.text, role: r.lineage.role, tkey, res, ok: tkey ? isOk(res, tkey) : false, split: splitOfRec(r) });
  }
  console.log(`records ${recs.length}, tasks ${tasks.size}`);

  // candidate alignments per variant: [{ref, tags, cost}] sorted by cost, references verified to formalize to the variant's target
  const wordsCache = new Map();
  const W = (s) => { if (!wordsCache.has(s)) wordsCache.set(s, wordsOf(s)); return wordsCache.get(s); };
  const variants = [];
  for (const t of tasks.values()) for (const it of t.items) if (it.role === 'variant' && it.tkey) variants.push({ task: t, it });
  let fillers = null;
  const diag = { no_ref: 0, null_align: 0, vocab_miss: 0, all_keep: 0 };
  const candidates = (v, pairOk, insOk, vocab, count = false) => {
    const out = [];
    const seen = new Set();
    for (const o of v.task.items) {
      if (o === v.it || !o.ok && !isOk(o.res, v.it.tkey) || !isOk(o.res, v.it.tkey) || seen.has(norm(o.text))) continue;
      seen.add(norm(o.text));
      if (fillers && W(o.text).some((x) => fillers.has(norm(x.w)))) continue;
      if (count) diag.refs = (diag.refs ?? 0) + 1;
      const al = alignTags(W(v.it.text), W(o.text), pairOk, insOk);
      if (!al) { if (count) diag.null_align++; continue; }
      if (vocab && al.tags.some((g) => /^[RAP]:/.test(g) && !vocab.has(g))) { if (count) diag.vocab_miss++; continue; }
      if (al.tags.every((g) => g === 'KEEP')) { if (count) diag.all_keep++; continue; }
      out.push({ ref: o.text, ...al });
    }
    return out.sort((x, y) => x.cost - y.cost || x.ref.length - y.ref.length);
  };

  // pass 1: vocabulary (tags backed by >= 3 distinct tasks; R: tags per (source word, tag) pair)
  const MIN_TASKS = Number(opt('--min-tasks', '2'));
  const tagTasks = new Map(), pairTasks = new Map();
  const bump = (m, k, t) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(t); };
  const insAll = () => false;
  for (const v of variants) {
    for (const c of candidates(v, null, insAll, null).slice(0, 3)) {
      const ws = W(v.it.text);
      c.tags.forEach((g, i) => {
        if (!/^[RAP]:/.test(g)) return;
        if (g.startsWith('R:')) bump(pairTasks, `${norm(ws[i].w)}\u0001${g}`, v.task.key);
        else bump(tagTasks, g, v.task.key);
      });
    }
  }
  // filler words: deleted in many tasks and mostly deleted -> never produced by an insertion / used inside a reference
  const delTasks = new Map(), occTasks = new Map();
  for (const v of variants) {
    const c = candidates(v, null, insAll, null)[0];
    if (!c) continue;
    const ws = W(v.it.text);
    c.tags.forEach((g, i) => { const w = norm(ws[i].w); if (isPunctWord(w)) return; bump(occTasks, w, v.task.key); if (g === 'DELETE') bump(delTasks, w, v.task.key); });
  }
  fillers = new Set([...delTasks].filter(([w, t]) => t.size >= 6 && t.size / occTasks.get(w).size >= Number(opt('--filler-ratio', '0.8'))).map(([w]) => w));
  for (const w of 'please pls plz thanks thx lol um uh hm hmm hey ok okay yeah yo kinda gonna'.split(' ')) fillers.add(w);
  console.log('fillers', fillers.size, [...fillers].slice(0, 40).join(' '));
  const goodPairs = new Set([...pairTasks.entries()].filter(([, s]) => s.size >= MIN_TASKS).map(([k]) => k));
  for (const [k, s] of pairTasks) if (s.size >= MIN_TASKS) { const g = k.split('\u0001')[1]; const u = tagTasks.get(g) ?? new Set(); for (const x of s) u.add(x); tagTasks.set(g, u); }
  const vocabTags = [...tagTasks.entries()].filter(([g, s]) => s.size >= MIN_TASKS && (g[0] !== 'R' || [...goodPairs].some((k) => k.endsWith(`\u0001${g}`))))
    .sort((x, y) => y[1].size - x[1].size || (x[0] < y[0] ? -1 : 1)).slice(0, vocabCap).map(([g]) => g);
  const vocab = new Set(vocabTags);
  const pairOk = (src, tgt) => goodPairs.has(`${src}\u0001R:${tgt}`);
  const insertable = new Set(vocabTags.filter((g) => g[0] === 'A' || g[0] === 'P').map((g) => g.slice(2)));
  const insOk = (w) => insertable.has(w);
  console.log(`pass 1: ${tagTasks.size} candidate tags, vocabulary ${vocab.size}, good pairs ${goodPairs.size}`);

  // pass 2: aligned examples verified by the rules
  const examples = [];
  const rep = {};
  const wr = (w) => (rep[w] ??= { variants: 0, with_target: 0, orig_ok: 0, failing: 0, failing_aligned: 0, aligned: 0, identity_only: 0, no_alignment: 0, no_verified_ref: 0, rejected_by_rules: 0, canonical_identity: 0, generator_identity: 0 });
  for (const t of tasks.values()) wr(t.world);
  for (const v of variants) {
    const r = wr(v.task.world); r.variants++; r.with_target++;
    if (v.it.ok) r.orig_ok++; else r.failing++;
    const cands = candidates(v, pairOk, insOk, vocab, true);
    const ctx = ctxOfRec(v.it.rec);
    let done = null;
    for (const c of cands.slice(0, 8)) {
      const words = W(v.it.text);
      const rewrite = applyEditTags(v.it.text, words, c.tags).trim();
      if (!rewrite || rewrite === v.it.text.trim()) continue;
      if (isOk(run(v.task.world, v.it.rec.tab, v.it.rec.setup ?? [], rewrite), v.it.tkey)) { done = { kind: 'variant', ...c, rewrite }; break; }
    }
    if (!done && v.it.ok) done = { kind: 'variant-identity', tags: W(v.it.text).map(() => 'KEEP'), cost: 0, ref: null, rewrite: v.it.text };
    if (!done) { r.no_alignment++; if (!cands.length) r.no_verified_ref++; else r.rejected_by_rules++; continue; }
    if (done.kind === 'variant') { r.aligned++; if (!v.it.ok) r.failing_aligned++; } else r.identity_only++;
    examples.push({ id: v.it.rec.example_id, set: v.it.rec.set, split: v.it.split, world: v.task.world, kind: done.kind, text: v.it.text, context: ctx, tags: done.tags, rewrite: done.rewrite, ref: done.ref, cost: done.cost });
  }
  // identity: canonical phrasings (verified) and generator / rule-derived texts
  for (const t of tasks.values()) for (const it of t.items) {
    if (it.role !== 'canonical' || !it.ok) continue;
    wr(t.world).canonical_identity++;
    examples.push({ id: it.rec.example_id, set: it.rec.set, split: it.split, world: t.world, kind: 'canonical', text: it.text, context: ctxOfRec(it.rec), tags: W(it.text).map(() => 'KEEP'), rewrite: it.text, ref: null, cost: 0 });
  }
  for (const row of routing) {
    if (row.source === 'paraphrase' || row.source === 'phrase-log' || (onlyWorld && row.world !== onlyWorld)) continue;
    wr(row.world).generator_identity++;
    examples.push({ id: row.id, set: 'routing', split: row.split, world: row.world, kind: row.source === 'generator' ? 'generator' : 'rule-derived', text: row.text, context: { tab: row.context?.tab ?? null, recent_worlds: row.context?.recent_worlds ?? [] },
      tags: W(row.text).map(() => 'KEEP'), rewrite: row.text, ref: null, cost: 0 });
  }

  // synthetic noise (grammar-correction style): clean texts + noise mined from the real alignments; the tags undo the noise exactly
  const synth = makeSynthetic({ pairTasks, minPairTasks: Number(opt('--syn-pair-tasks', '5')), routing, variants, candidates: (v) => candidates(v, pairOk, insOk, vocab), W, vocab, goodPairs, fillers, bump, norm, count: Number(opt('--synthetic', '8000')), seed: 1337 });
  examples.push(...synth.examples);
  console.log(`synthetic: ${synth.examples.length} examples; filler phrases ${synth.phrases.length}: ${synth.phrases.slice(0, 30).map((p) => `${p.text}@${p.pos}`).join(', ')}; noise pairs ${synth.pairs.length}: ${synth.pairs.sort((a, b) => b.tasks - a.tasks).slice(0, 40).map((p) => `${p.src}>${p.tgt}(${p.tasks})`).join(' ')}`);

  // write
  const by = {};
  for (const e of examples) (by[e.split] ??= []).push(e);
  for (const [s, rows] of Object.entries(by)) writeFileSync(join(outDir, `${s}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const evalRows = {};
  for (const t of tasks.values()) for (const it of t.items) {
    if (it.role !== 'variant' || !it.tkey) continue;
    (evalRows[it.split] ??= []).push({ id: it.rec.example_id, world: t.world, split: it.split, tab: it.rec.tab ?? null, setup: it.rec.setup ?? [], text: it.text, target: it.rec.expected_circuit, role: 'variant', label_status: it.rec.label_status, context: ctxOfRec(it.rec) });
  }
  for (const [s, rows] of Object.entries(evalRows)) if (s !== 'train') writeFileSync(join(outDir, `eval-${s}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const tagHist = {};
  for (const e of examples) for (const g of e.tags) { const k = g === 'KEEP' || g === 'DELETE' ? g : g.slice(0, 1) + ':'; tagHist[k] = (tagHist[k] ?? 0) + 1; }
  const report = {
    generated_by: 'node scripts/build-edit-tags.mjs', vocabulary_size: vocab.size, vocab_cap: vocabCap, examples: examples.length,
    by_split: Object.fromEntries(Object.entries(by).map(([s, r]) => [s, { total: r.length, aligned: r.filter((x) => x.kind === 'variant').length, identity: r.filter((x) => x.kind !== 'variant').length }])),
    tag_counts: tagHist, worlds: rep,
    totals: Object.values(rep).reduce((a, r) => { for (const [k, v] of Object.entries(r)) a[k] = (a[k] ?? 0) + v; return a; }, {}),
    top_tags: vocabTags.slice(0, 60).map((g) => [g, tagTasks.get(g).size]),
  };
  writeFileSync(join(outDir, 'edit-vocab.json'), JSON.stringify({ tags: vocabTags, word_regex: WORD_RE.source, note: 'KEEP and DELETE are implicit; R:<text> replaces the word, A:<text> appends after it' }, null, 1));
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  console.log('diag (ref-level)', JSON.stringify(diag));
  console.log(JSON.stringify(report.totals), JSON.stringify(report.by_split), JSON.stringify(tagHist));
  for (const [w, r] of Object.entries(rep)) if (r.variants) console.log(w.padEnd(16), `variants ${r.variants} orig_ok ${r.orig_ok} aligned ${r.aligned} identity-only ${r.identity_only} failing ${r.failing_aligned}/${r.failing} dropped ${r.no_alignment} (no ref ${r.no_verified_ref}, rules-rejected ${r.rejected_by_rules})`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
