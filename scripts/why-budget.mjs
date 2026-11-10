#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Lists the turns of an operational set that run out of compute budget, with the site and ticks:
//   node scripts/why-budget.mjs --mode encoder+n1 --ort <onnxruntime-node index.js> [--set training/eval/operational-long.jsonl] [--ids a,b]
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions } from '../src/dialog/runtime-config.mjs';
import { openNodeRuntime } from './lib/runtime-node.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const cases = readFileSync(resolve(REPO, arg('set', 'training/eval/operational-long.jsonl')), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const ids = arg('ids') ? new Set(arg('ids').split(',')) : null;
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const rt = await openNodeRuntime({ engine, mode: arg('mode', 'rules'), ortPath: arg('ort'), dispatcherDir: join(REPO, 'docs/webchat/models/dispatcher'), normalizerDir: join(REPO, 'docs/webchat/models/normalizer'), ortThreads: 0, overrides: {} });
for (const c of cases) {
  if (ids && !ids.has(c.id)) continue;
  const s = engine.createSession(sessionOptions(rt.settings, { language: 'en' }));
  if (c.tab) s.setWorldState('ui.shell', { activeTab: c.tab });
  for (const [w, patch] of Object.entries(c.init ?? {})) s.setWorldState(w, patch);
  for (const m of c.setup ?? []) await s.send(m);
  const r = await s.send(c.message, c.lang === 'ro' ? { language: 'auto' } : undefined);
  if (r.tooComplex) console.log(`${c.id}\t${r.budget.exceeded.site}\t${r.budget.exceeded.ticks} (${r.budget.exceeded.limit})\t${JSON.stringify(r.budget.top)}\t${c.message.slice(0, 80)}`);
}
