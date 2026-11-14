#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Builds training/eval/ro-en-meaning/rows.jsonl: the Romanian <-> English parallel set at the level of the app's requests and questions, each row with
 * the MEANING of its English side as the current rules reader reads it (scripts/lib/meaning.mjs), so that "meaning kept" can be judged by comparing readings.
 * Sources (see the README there): operational-ro (+ the English operational set), the canon paraphrases, hand glosses of real owner phrases, the Talk questions,
 * hand-curated templates, sentences generated from the schemas (coverage grid) with Romanian from the rules translator and from the on-device model, and the
 * round-trip English stories.
 *
 *   node scripts/build-ro-en-meaning.mjs [--bergamot <cacheDir>] [--limit N]
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openReader } from './lib/meaning.mjs';
import { templateRows } from './ro-en-templates.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { groupOf } from './lib/world-groups.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'training/eval/ro-en-meaning');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rules = createTranslator();

const rows = [];
const add = (r) => rows.push({ ...r, setup: r.setup ?? [], tab: r.tab ?? null });

// 1. operational-ro: the Romanian message of every English operational case (two variants: diacritics, casual)
const ops = new Map(jl(join(REPO, 'training/eval/operational.jsonl')).map((c) => [c.id, c]));
const tabOfWorld = {};
for (const c of ops.values()) { const t = (tabOfWorld[c.world] ??= {}); const k = c.tab ?? ''; t[k] = (t[k] ?? 0) + 1; }
const mainTab = (w) => { const t = tabOfWorld[w]; if (!t) return null; const best = Object.entries(t).sort((a, b) => b[1] - a[1])[0][0]; return best || null; };
for (const r of jl(join(REPO, 'training/eval/operational-ro.jsonl'))) {
  const en = ops.get(r.source_id);
  if (!en) continue;
  add({ id: `op:${r.id}`, source: 'operational', world: en.world, tab: en.tab, setup: en.setup, init: en.init, families: en.families ?? [], en: en.message, ro: r.message, ro_by: 'authored', ro_variant: r.variant });
}
// 2. the canon paraphrases: one English sentence, up to three Romanian renderings (the last of them casual)
const pdir = join(REPO, 'training/paraphrases/ro');
for (const f of readdirSync(pdir).filter((x) => x.endsWith('.canon.jsonl')).sort()) {
  const world = f.replace(/\.\d+\.canon\.jsonl$/, '');
  let i = 0;
  for (const r of jl(join(pdir, f))) { i++; (r.ro ?? []).forEach((ro, j) => add({ id: `canon:${f.replace('.canon.jsonl', '')}#${i}.${j}`, source: 'canon', world, tab: mainTab(world), en: r.en, ro, ro_by: 'authored', ro_variant: j === 2 ? 'casual' : 'diacritics' })); }
}
// 3. hand glosses of real owner phrases (the English is written by hand; the Romanian is what the owner typed)
const real = new Map(readFileSync(join(OUT, 'real-ro.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')).map((c) => [c[0], c]));
const gloss = new Map(readFileSync(join(OUT, 'gold-real.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')));
for (const [id, en] of gloss) { const r = real.get(`real#${id}`); if (r) add({ id: `real:${id}`, source: 'real', world: null, tab: r[1] === 'diagram' ? null : (r[1] || null), en, ro: r[3], ro_by: 'owner', en_by: 'hand-gloss', ro_variant: /[ăâîșț]/i.test(r[3]) ? 'diacritics' : 'casual' }); }
// 4. the Talk questions, English and hand-written Romanian
for (const l of readFileSync(join(OUT, 'gold-talk.tsv'), 'utf8').split('\n').filter(Boolean)) { const [en, ro] = l.split('\t'); add({ id: `talk:${rows.length}`, source: 'talk', world: 'talk', tab: 'talk', en, ro, ro_by: 'hand', ro_variant: 'diacritics' }); }
// 5. hand-curated templates
templateRows().forEach((t, i) => add({ id: `tpl:${i}`, source: 'template', family: t.family, world: null, tab: t.tab, en: t.en, ro: t.ro, ro_by: 'hand', ro_variant: 'diacritics' }));
// 6. sentences generated from the schemas (coverage grid) and 7. the round-trip stories: English given, Romanian by the rules translator (en->ro) and by the on-device model
const gen = [];
const grid = JSON.parse(readFileSync(join(REPO, 'docs/webchat/coverage-grid.json'), 'utf8'));
for (const w of grid.worlds) for (const c of w.cells) if (c.text) gen.push({ source: 'grid', family: `${w.id}:${c.act}`, world: w.id, tab: w.tab ?? null, setup: c.setup ?? [], en: c.text });
for (const r of jl(join(REPO, 'training/eval/paraphrases-rt-2026-11-12.jsonl'))) gen.push({ source: 'roundtrip', world: r.world, tab: null, setup: r.setup ?? [], en: r.original });
let mt = null;
if (arg('bergamot')) { const { createNodeMt } = await import('./lib/mt-node.mjs'); mt = await createNodeMt({ cacheDir: arg('bergamot') }); await mt.ensure('ro'); }
let gi = 0;
for (const g of gen) {
  gi++;
  const rr = await rules.translate(g.en, { from: 'en', to: 'ro' });
  if (rr.text && !rr.untranslatable?.length) add({ ...g, id: `${g.source}:${gi}.r`, ro: rr.text, ro_by: 'rules-en-ro', ro_variant: 'diacritics' });
  if (mt) { const m = await mt.translate(g.en, 'en', 'ro').catch(() => null); if (m) add({ ...g, id: `${g.source}:${gi}.m`, ro: m, ro_by: 'bergamot-en-ro', ro_variant: 'diacritics' }); }
}
mt?.reset?.();

// meaning of the English side
const limit = Number(arg('limit')) || rows.length;
const reader = await openReader();
const cache = new Map();
let done = 0;
for (const r of rows.slice(0, limit)) {
  const k = JSON.stringify([r.tab, r.init, r.setup, r.en]);
  if (!cache.has(k)) cache.set(k, await reader.read(r.en, r));
  const m = cache.get(k);
  r.ref = { complete: m.complete, key: m.key, world: m.world, action: m.action, question: m.question, segments: m.segments.length };
  const w = m.world ?? r.world;
  r.group = groupOf(r.world ?? w ?? 'unknown');
  r.kind = !m.complete ? 'unread' : m.segments.length > 1 ? 'multi' : m.question || /\.ask$|^talk\./.test(m.action ?? '') ? 'question' : r.setup.length && r.en.split(/\s+/).length <= 4 ? 'fragment' : 'command';
  if (++done % 500 === 0) console.error(done, '/', limit);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'rows.jsonl'), rows.slice(0, limit).map((r) => JSON.stringify(r)).join('\n') + '\n');
const by = {}; for (const r of rows.slice(0, limit)) { const t = (by[r.source] ??= { rows: 0, read: 0 }); t.rows++; if (r.ref.complete) t.read++; }
console.log(JSON.stringify(by, null, 1));
