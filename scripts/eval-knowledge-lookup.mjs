#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Measures KNOWLEDGE-BY-LOOKUP (spec 17) on training/eval/knowledge-lookup-2026-11-13.jsonl: three passes over the set (catalog off, catalog on and cold, catalog on and warm),
 * one fresh session per message. Per group: right world, knowledge loaded (which shards), answer right, controls unchanged, added latency per message.
 *   node scripts/eval-knowledge-lookup.mjs --knowledge <dir-or-URL of sop-knowledge-worlds docs/worlds> [--out <results.json>] [--reasoner ops|matrix]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const loc = arg('knowledge', process.env.PSYS2_KNOWLEDGE);
if (!loc) { console.error('--knowledge <dir|URL> (or PSYS2_KNOWLEDGE) is required'); process.exit(1); }
const rows = readFileSync(join(REPO, 'training/eval/knowledge-lookup-2026-11-13.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const CONV = /^(?:kids\.|session\.conversation|common\.sense|user\.profile)/;
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner: arg('reasoner', 'matrix') } });
const settings = settingsForMode('rules');

const touched = [];
async function pass(label, facts) {
  engine.setKnowledge(facts);
  const out = [];
  for (const row of rows) {
    const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
    if (row.tab) s.setWorldState('ui.shell', { activeTab: row.tab });
    touched.length = 0;
    const t = performance.now();
    let r, error = null;
    try { r = await s.send(row.message); } catch (e) { error = e.message; }
    const ms = performance.now() - t;
    const worlds = (r?.segments ?? []).map((x) => x.world ?? x.match?.worldId).filter(Boolean);
    const m = r?.trace?.discourse?.meta;
    const kn = m?.kind === 'knowledge' ? m : r?.segments?.find((x) => x.knowledge)?.knowledge ?? null;   // the reply came from the catalog (before or after the world ran)
    const world = m?.kind === 'knowledge' ? 'conversation' : worlds[0] ?? null;
    const shards = [...new Set(touched)];   // the shards of every thing looked up for this message, also when an earlier message had loaded them
    out.push({ id: row.id, world, reply: r ? r.text : `ERROR ${error}`, statuses: r?.statuses ?? [], ms, shards, kn: kn ? { frame: kn.frame, hit: kn.hit } : null });
  }
  console.log(`${label}: ${out.length} messages, ${out.reduce((a, x) => a + x.ms, 0).toFixed(0)} ms`);
  return out;
}

const off = await pass('off', null);   // behaviour reference (also warms the engine)
const facts = createFacts({ source: createKnowledgeSource(loc) });
const thing0 = facts.thing;
facts.thing = async (w) => { const t = await thing0(w); if (t) touched.push(...t.loaded); return t; };
const cold = await pass('on-cold', facts);
const warm = await pass('on-warm', facts);
const off2 = await pass('off-again', null);   // timing reference: the same engine after the other passes

const rightWorld = (row, x) => (row.world === 'conversation' ? x.kn || (x.world && CONV.test(x.world)) : row.world ? x.world === row.world : true);
const pct = (a, n) => (n ? `${a}/${n} (${Math.round(100 * a / n)}%)` : '-');
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const p95 = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(0.95 * (s.length - 1))] ?? 0; };
const result = { groups: {}, catalog: { vocabMs: facts.stats.vocabMs, vocabBytes: facts.stats.vocabBytes, shardMs: facts.stats.shardMs, shardBytes: facts.stats.shardBytes, shardsLoaded: facts.stats.shardsLoaded.length, lookups: facts.stats.lookups, hits: facts.stats.hits }, cases: [] };
for (const g of ['draw', 'know', 'control']) for (const inv of g === 'control' ? [false] : [false, true]) {
  const idx = rows.map((r, i) => i).filter((i) => rows[i].group === g && !!rows[i].invented === inv);
  let world = 0, loaded = 0, answer = 0, unchanged = 0, noHit = 0;
  for (const i of idx) {
    const row = rows[i], x = cold[i];
    if (rightWorld(row, x)) world++;
    if (x.shards.length || x.kn?.hit) loaded++;
    if (new RegExp(row.answer ?? '.', 'i').test(x.reply)) answer++;
    if (x.reply === off[i].reply && x.world === off[i].world && JSON.stringify(x.statuses) === JSON.stringify(off[i].statuses)) unchanged++;
    if (!x.shards.length && !x.kn?.hit) noHit++;
    result.cases.push({ id: row.id, group: g, invented: inv, message: row.message, world: x.world, rightWorld: !!rightWorld(row, x), shards: x.shards, offReply: off[i].reply, reply: x.reply, answerRight: new RegExp(row.answer ?? '.', 'i').test(x.reply), unchanged: x.reply === off[i].reply, msOff: off2[i].ms, msCold: x.ms, msWarm: warm[i].ms });
  }
  const d = idx.map((i) => warm[i].ms - off2[i].ms), dc = idx.map((i) => cold[i].ms - off2[i].ms);
  result.groups[`${g}${inv ? '-invented' : ''}`] = { n: idx.length, rightWorld: pct(world, idx.length), knowledgeLoaded: pct(loaded, idx.length), noHit: pct(noHit, idx.length), answerRight: pct(answer, idx.length), unchanged: pct(unchanged, idx.length), addedMsWarm: { mean: +mean(d).toFixed(1), p95: +p95(d).toFixed(1) }, addedMsCold: { mean: +mean(dc).toFixed(1), p95: +p95(dc).toFixed(1) }, msOffMean: +mean(idx.map((i) => off2[i].ms)).toFixed(1) };
}
const o = arg('out');
if (o) writeFileSync(resolve(o), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.groups, null, 1));
console.log(JSON.stringify(result.catalog));
