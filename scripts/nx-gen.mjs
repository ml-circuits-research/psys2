#!/usr/bin/env node
/**
 * NX3 bulk generation: generate AND label in one call.
 * The model gets a shard of seeds (a labelled sentence of one world each) and writes K varied phrasings per seed. A phrasing keeps the
 * seed's operation and parameter values (so the label values are inherited, deterministic) and only says where each slot value appears
 * (the verbatim words). 20% of the phrasings are Romanian: they go through the ro-en translator and the spans are found again in the
 * English text, so the formalizer sees English as in the app.
 *
 *   node scripts/nx-gen.mjs prepare [--per-world 150] [--shard-seeds 15] [--k 20] [--worlds a,b]   writes gen/prompts, gen/shards/<id>.json
 *        (a shard is finished when gen/out/<id>.json exists; run again to add shards; existing ones are kept)
 *   node scripts/nx-gen.mjs collect                      reads gen/out/*.json -> gen/candidates/<world>.jsonl (content-hash ids)
 * Data dir: training/dataset/nx/gen (outside git).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadSet, findSpan } from './lib/nx-read.mjs';
import { worldPrompt } from './lib/nx-prompt.mjs';
import { worldPromptB } from './lib/nx3b-prompt.mjs';
import { createTranslator } from '../src/translate/index.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const MAIN = REPO.replace(/\.claude\/worktrees\/[^/]+\/$/, '');
// NX_GEN selects the data dir under training/dataset/nx (default gen = NX3; gen2 = NX3b). NX_SEEDS: seeds dir (default seeds; seeds2 for NX3b)
export const GEN = MAIN + 'training/dataset/nx/' + (process.env.NX_GEN ?? 'gen');
const SEEDS_DIR = MAIN + 'training/dataset/nx/' + (process.env.NX_SEEDS ?? 'seeds');
const ROUND_B = process.env.NX_GEN === 'gen2';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 14);
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const wj = (f, o) => { mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); writeFileSync(f, JSON.stringify(o)); };

const GEN_RULES = (k, nRo) => `GENERATION TASK. For each SEED below (a sentence of this world with its label) write exactly ${k} different phrasings that a real user could type or say to ask for the SAME thing: same operation, same parameter values (same numbers, names, colours, items, places), same context. Only the wording changes.
Vary widely: casual and short, polite, indirect requests ("could you maybe..."), voice-recognition style (no punctuation, filler words, small garbles), typos, missing words, different word order, slang, longer chatty versions. Exactly ${nRo} of the ${k} phrasings are in Romanian (diacritics optional), natural spoken Romanian, still with the same parameters; the other ${k - nRo} are English. One command per phrasing (no multi-command messages). Never change a parameter; never copy the seed verbatim.
For every ENGLISH phrasing also give "x": an object that maps each slot key of the seed to the exact words of YOUR phrasing that express it (a verbatim substring of your phrasing), or null when the phrasing does not say it (implied or default). For Romanian phrasings give "x": {}.
OUTPUT: a JSON array with one object per seed: [{"seed": "<seed_id>", "p": [{"t": "<phrasing>", "l": "en"|"ro", "x": {"<slot key>": "<words>"|null, ...}}, ... ${k} entries]}]. Nothing else (no prose, no markdown fence).`;

function prepare() {
  const perWorld = Number(arg('per-world', 150)); const shardSeeds = Number(arg('shard-seeds', 15)); const k = Number(arg('k', 20));
  const only = arg('worlds', null)?.split(',');
  const nRo = Math.round(k * 0.2);
  const SEEDS = SEEDS_DIR;
  return loadSet().then((set) => {
    let made = 0; const info = {};
    for (const f of readdirSync(SEEDS).filter((x) => x.endsWith('.jsonl'))) {
      const world = f.replace('.jsonl', ''); if (only && !only.includes(world)) continue;
      const all = jl(`${SEEDS}/${f}`);
      // hard (rules-fail) seeds first, then patterns/canonicals, deterministic order by hash
      const rank = (s) => (s.source === 'hardfail' ? 0 : 1) + parseInt(sha(s.seed_id).slice(0, 6), 16) / 1e8;
      const pick = ROUND_B ? all : all.sort((a, b) => rank(a) - rank(b)).slice(0, perWorld);
      const pf = `${GEN}/prompts/${world}.md`;
      if (ROUND_B) { mkdirSync(`${GEN}/prompts`, { recursive: true }); writeFileSync(pf, worldPromptB(set, world, GEN_RULES(k, nRo), pick)); } else if (!existsSync(pf)) { mkdirSync(`${GEN}/prompts`, { recursive: true }); writeFileSync(pf, 'You write training phrasings for a conversational system.\n\n' + worldPrompt(set, world).replace(/^[\s\S]*?(?=WORLD:)/, '').replace(/SOLVED EXAMPLES:[\s\S]*$/, '') + '\n' + GEN_RULES(k, nRo) + '\n'); }
      for (let i = 0; i * shardSeeds < pick.length; i++) {
        const part = pick.slice(i * shardSeeds, (i + 1) * shardSeeds);
        const id = `${world}.${ROUND_B ? 'b' : ''}${String(i).padStart(3, '0')}`;
        const sf = `${GEN}/shards/${id}.json`;
        if (existsSync(sf)) continue;
        wj(sf, { shard_id: id, world, prompt_file: pf, k, seeds: part.map((s) => ({ seed_id: s.seed_id, context: s.context, text: s.text, op: s.op, slots: s.slots.map((x) => ({ key: x.key, text: x.text, value: x.value })) })) });
        made++;
      }
      info[world] = pick.length;
    }
    console.log(JSON.stringify({ shards_written: made, seeds: info }));
  });
}

async function collect() {
  const set = await loadSet();
  const tr = createTranslator();
  const SEEDS = SEEDS_DIR;
  const seedMap = new Map();
  for (const f of readdirSync(SEEDS).filter((x) => x.endsWith('.jsonl'))) for (const s of jl(`${SEEDS}/${f}`)) seedMap.set(s.seed_id, s);
  const out = {}; let nSh = 0, bad = 0, items = 0, dupPrev = 0;
  // NX3b: texts already in NX3 (candidates of round a) are not added again
  const prevIds = new Set(); const prevText = new Set();
  const nt = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (ROUND_B) { const A = MAIN + 'training/dataset/nx/gen/candidates'; for (const f of readdirSync(A).filter((x) => x.endsWith('.jsonl'))) for (const r of jl(`${A}/${f}`)) { prevIds.add(r.id); prevText.add(r.world + '|' + nt(r.text)); } }
  mkdirSync(`${GEN}/candidates`, { recursive: true });
  const byWorld = new Map();
  for (const f of existsSync(`${GEN}/out`) ? readdirSync(`${GEN}/out`).filter((x) => x.endsWith('.json')) : []) {
    let arr; try { arr = JSON.parse(readFileSync(`${GEN}/out/${f}`, 'utf8').replace(/^```(?:json)?\s*|\s*```\s*$/g, '')); } catch { bad++; continue; }
    if (!Array.isArray(arr)) { bad++; continue; }
    nSh++;
    for (const e of arr) {
      const seed = seedMap.get(e?.seed); if (!seed || !Array.isArray(e.p)) continue;
      for (const p of e.p) {
        if (!p || typeof p.t !== 'string' || !p.t.trim()) continue;
        let text = p.t.trim(); let lang = p.l === 'ro' ? 'ro' : 'en'; let orig = null;
        const slots = seed.slots.map((s) => ({ key: s.key, text: null, value: s.value }));
        if (lang === 'ro') {
          orig = text;
          try { text = tr.translate(orig, { from: 'ro', to: 'en' }).text; } catch { continue; }
          if (!text || text === orig) continue;
          seed.slots.forEach((s, i) => { if (s.span && s.key !== 'seek') { const sp = findSpan(text, s.value); if (sp) slots[i].text = text.slice(sp[0], sp[1]); } });
        } else {
          seed.slots.forEach((s, i) => { const w = p.x?.[s.key] ?? p.x?.[s.key.replace(/^arg\./, '')]; if (typeof w === 'string' && w) slots[i].text = w; });
        }
        const rec = { id: sha(seed.world + '\n' + seed.context.join('\n') + '\n' + text), group: seed.group, world: seed.world, tab: seed.tab, context: seed.context, text, lang, op: seed.op, slots, label_source: 'seed-inherited', labeler: null, seed_id: seed.seed_id, ...(orig ? { orig } : {}) };
        const list = byWorld.get(seed.world) ?? byWorld.set(seed.world, new Map()).get(seed.world);
        if (ROUND_B && (prevIds.has(rec.id) || prevText.has(rec.world + '|' + nt(rec.text)))) { dupPrev++; continue; }
        if (!list.has(rec.id)) { list.set(rec.id, rec); items++; }
      }
    }
  }
  for (const [w, m] of byWorld) { writeFileSync(`${GEN}/candidates/${w}.jsonl`, [...m.values()].map((x) => JSON.stringify(x)).join('\n') + '\n'); out[w] = m.size; }
  console.log(JSON.stringify({ shards_read: nSh, bad_shards: bad, candidates: items, duplicates_of_nx3: dupPrev, per_world: out }));
}

const cmd = process.argv[2];
if (cmd === 'prepare') await prepare();
if (cmd === 'collect') await collect();
