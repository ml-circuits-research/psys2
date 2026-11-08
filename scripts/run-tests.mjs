#!/usr/bin/env node
/**
 * npm test: runs tests/*.test.mjs with node:test, one process per file, `--test-concurrency` = all cores.
 * Usage: node scripts/run-tests.mjs [--jobs N] [extra node --test args]   (default N = os.availableParallelism(); --jobs 1 = serial)
 * Tests must not share fixed temp paths or ports (use mkdtemp and listen(0)).
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJobs } from './lib/shard.mjs';

const argv = process.argv.slice(2);
const jobs = parseJobs(argv);
const rest = [];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--jobs') i++; else rest.push(argv[i]); }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join('tests', f));
const r = spawnSync(process.execPath, ['--test', `--test-concurrency=${jobs}`, ...rest, ...files], { stdio: 'inherit', cwd: root });
process.exit(r.status ?? 1);
