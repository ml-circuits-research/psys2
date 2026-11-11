#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Before/after check of the reasoner host layer: runs the sessions of the operational, dialogue, coherence and gold sets in ONE engine (default: matrix)
 * and writes one JSON line per turn (reply, statuses, state). Run it on two commits and compare the files; any difference is a change of behaviour.
 *
 *   node scripts/dump-turns.mjs --out <file.jsonl> [--sets operational,dialogues,coherence,gold] [--limit N] [--reasoner matrix|ops]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('limit', 0)) || 0;
const want = arg('sets', 'operational,dialogues,coherence,gold').split(',');
const jsonl = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const E = (f) => join(REPO, 'training/eval', f);
const step = (m) => (typeof m === 'string' ? m : m.message ?? m.text);
const cut = (rows) => (LIMIT ? rows.slice(0, LIMIT) : rows);
const ss = [];
if (want.includes('operational')) for (const c of cut(jsonl(E('operational.jsonl')))) ss.push({ set: 'operational', id: c.id, world: c.world, tab: c.tab, init: c.init, turns: [...(c.setup ?? []).map(step), c.message] });
if (want.includes('dialogues')) for (const d of cut(jsonl(E('dialogues.jsonl')))) ss.push({ set: 'dialogues', id: d.id, world: d.world, tab: d.tab, init: d.init, turns: d.turns.map((t) => ({ message: t.message, tab: t.tab, mode: t.mode })) });
if (want.includes('coherence')) for (const c of cut(jsonl(E('coherence-2026-11-10.jsonl')))) ss.push({ set: 'coherence', id: c.id, world: c.world, tab: c.tab, turns: c.turns.map(step) });
if (want.includes('gold')) for (const g of cut(jsonl(join(REPO, 'training/nx/gold/pilot-300.jsonl')))) ss.push({ set: 'gold', id: g.id, world: g.world, tab: g.tab && g.tab !== 'none' ? g.tab : null, turns: [...(g.context ?? []).map(step), step(g.text)] });

const settings = settingsForMode('rules');
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner: arg('reasoner', 'matrix') } });
const out = [];
for (const x of ss) {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  if (x.tab) s.setWorldState('ui.shell', { activeTab: x.tab });
  for (const [w, patch] of Object.entries(x.init ?? {})) s.setWorldState(w, patch);
  for (const t of x.turns) {
    const m = typeof t === 'string' ? { message: t } : t;
    if (m.tab) s.setWorldState('ui.shell', { activeTab: m.tab });
    let r, error = null;
    try { r = await s.send(m.message, m.mode ? { mode: m.mode } : undefined); } catch (e) { error = e.message; }
    const { 'ui.help': _h, ...state } = s.state();
    out.push(JSON.stringify({ set: x.set, id: x.id, world: x.world, message: m.message, reply: r ? r.text : `ERROR ${error}`, statuses: r?.statuses ?? [], state }));
  }
}
writeFileSync(resolve(arg('out')), out.join('\n') + '\n');
console.log(`${ss.length} sessions, ${out.length} turns -> ${arg('out')}`);
