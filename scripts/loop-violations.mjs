#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Lists the unguarded loops and recursions (same scan as tests/loop-guard.test.mjs): node scripts/loop-violations.mjs [--count]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scan } from './lib/loop-scan.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (d, o = []) => { for (const e of readdirSync(d)) { const f = path.join(d, e); if (statSync(f).isDirectory()) walk(f, o); else if (e.endsWith('.mjs')) o.push(f); } return o; };
const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'docs/webchat/ui'))];
for (const f of walk(path.join(ROOT, 'worlds'))) { const rel = path.relative(path.join(ROOT, 'worlds'), f).split(path.sep); if (rel.at(-1) === 'datagen.mjs' || rel.includes('vendor') || rel.includes('engine')) continue; files.push(f); }
let n = 0;
for (const f of files) for (const v of scan(readFileSync(f, 'utf8'))) { n++; if (!process.argv.includes('--count')) console.log(`${path.relative(ROOT, f)}:${v.line}\t${v.kind}\t${v.snippet}`); }
console.log(`${n} unguarded`);
