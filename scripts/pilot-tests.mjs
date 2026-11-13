#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Pilot P1 (spec 21): the tests.sop of a world run with the world's tab OPEN (the way a user is in it), for the old world and for the pilot that shadows it, in both reasoners.
//   node scripts/pilot-tests.mjs <world id> [--tab <tab>] [--pilot] [--reasoner ops|matrix] [--list]
// --pilot puts worlds-pilot/ first (PSYS2_PILOT_ROOTS); without --tab the tests run as test-world runs them (no tab). Prints passed / total and, with --list, the failing ids.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
if (process.argv.includes('--pilot')) process.env.PSYS2_PILOT_ROOTS = path.join(REPO, 'worlds-pilot');
const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
const { createEngine, runWorldTests } = await import('../src/dialog/index.mjs');
const id = process.argv[2], tab = arg('tab', null), reasoner = arg('reasoner', 'matrix');
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
if (tab) { const cs = engine.createSession.bind(engine); engine.createSession = (o) => { const s = cs(o); s.setWorldState('ui.shell', { activeTab: tab }); return s; }; }
const r = await runWorldTests(engine, id);
console.log(JSON.stringify({ world: id, pilot: process.argv.includes('--pilot'), tab, reasoner, passed: r.passed, total: r.total, failed: r.failed.length }));
if (process.argv.includes('--list')) for (const f of r.failed) console.log(`${f.id}\t${f.message.slice(0, 200)}`);
