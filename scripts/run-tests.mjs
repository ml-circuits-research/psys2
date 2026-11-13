#!/usr/bin/env node
/**
 * Test runner: tests/*.test.mjs with node:test, one process per file, `--test-concurrency` = jobs.
 *
 *   npm run test:smoke     --smoke: the SMOKE list below (under 2 minutes on 4 cores; every commit): PSYS2_SUITE=smoke, sweeps sampled, no browser, no model
 *   npm test               --full (package.json): everything below, i.e. the full suite; before each webchat publish, after a sopworld re-vendor, daily
 *   npm run test:fast      fast suite (what `npm test` used to be; the default of this script): every unit/behaviour test; exhaustive sweeps on a deterministic ~10% sample
 *                          (seed PSYS2_SAMPLE_SEED, default today's date, printed); full-only tests (`*.full.test.mjs` files and
 *                          `fullOnly()` tests from tests/helpers.mjs) and browser tests are skipped; worlds touched by the diff against
 *                          origin/main run their sweeps in full (`--changed`, on by default in the fast suite, `--no-changed` turns it off)
 *   npm run test:full      --full: everything, all sweeps in full, `test-world all`, datagen agreement, Romanian sets, fuzz, and the browser tests
 *                          (needs PUPPETEER_CORE, a scratch puppeteer-core install; without it the browser tests report as skipped)
 *   npm run test:browser   --browser: the browser tests alone (headless Chrome through puppeteer-core), full mode
 *
 * Usage: node scripts/run-tests.mjs [--full | --browser] [--changed | --no-changed] [--jobs N] [--seed S] [extra node --test args]
 *   (default jobs = os.availableParallelism(); --jobs 1 = serial). Tests must not share fixed temp paths or ports (use mkdtemp and listen(0)).
 * A failure of a sampled sweep is reproduced with the printed seed: PSYS2_SAMPLE_SEED=<seed> node --test tests/<file>
 */
import { readdirSync, readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJobs } from './lib/shard.mjs';

const argv = process.argv.slice(2);
const jobs = parseJobs(argv);
const flags = new Set(['--full', '--browser', '--smoke', '--changed', '--no-changed']);
const rest = [];
let seedArg;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--jobs') i++;
  else if (argv[i] === '--seed') seedArg = argv[++i];
  else if (!flags.has(argv[i])) rest.push(argv[i]);
}
const browserOnly = argv.includes('--browser');
const smoke = argv.includes('--smoke');
const full = argv.includes('--full') || browserOnly;
const useChanged = !full && !smoke && !argv.includes('--no-changed');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const git = (args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : null; };
/** Worlds whose files differ from origin/main (committed, staged, unstaged or untracked): 'all' when a shared world changed or git cannot tell. */
function changedWorlds() {
  const a = git(['diff', '--name-only', 'origin/main']);
  if (!a) return 'all';
  const names = new Set([...a, ...(git(['ls-files', '-o', '--exclude-standard']) ?? [])]);
  const ids = new Set();
  for (const n of names) { const m = /^worlds\/([^/]+)\//.exec(n); if (m) ids.add(m[1]); }
  if (ids.has('core') || ids.has('lang.common')) return 'all';
  return [...ids];
}

const all = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();
const isBrowser = (f) => readFileSync(join(root, 'tests', f), 'utf8').includes('PUPPETEER_CORE');
/** SMOKE suite (specs/06 "Testing"): by regression kind, see worker-log.md. Keep the total under 2 minutes on 4 cores (`taskset -c 0-3 npm run test:smoke`). */
const SMOKE = [
  'smoke.test.mjs',
  'reasoner-restore.test.mjs',
  'reasoner-worlds-apart.test.mjs',
  'world-aware.test.mjs',
  'fragment-continuation.test.mjs',
  'scene-referents.test.mjs',
  'keep-list.test.mjs',
  'mt-layer.test.mjs',
  'knowledge-lookup.test.mjs',
  'network-never-changes-reading.test.mjs',
  'model-timeouts.test.mjs',
  'budget.test.mjs',
  'loop-guard.test.mjs',
  'turn-guard.test.mjs',
  'rd10-names-capability.test.mjs',
  'tab-short-names.test.mjs',
  'coherence-both.test.mjs',
  'regression-ab.test.mjs',
  'routing.test.mjs',
  'reader-route.test.mjs',
  'ab-gate.test.mjs',
  'perf-round2.test.mjs',
  'ellipsis-one.test.mjs',
  'self-correction.test.mjs',
  'translate-session.test.mjs',
  'reasoner-draw-diagram.test.mjs',
];
const files = all.filter((f) => {
  if (smoke) return SMOKE.includes(f);
  if (browserOnly) return isBrowser(f);
  if (full) return true;
  return !isBrowser(f) && !f.endsWith('.full.test.mjs');
}).map((f) => join('tests', f));

const suite = browserOnly ? 'browser' : full ? 'full' : smoke ? 'smoke' : 'fast';
const env = { ...process.env, PSYS2_SUITE: full ? 'full' : smoke ? 'smoke' : 'fast' };
const seed = seedArg || process.env.PSYS2_SAMPLE_SEED || new Date().toISOString().slice(0, 10);
env.PSYS2_SAMPLE_SEED = seed;
let changed = [];
if (useChanged) { const c = changedWorlds(); changed = c === 'all' ? ['all'] : c; env.PSYS2_CHANGED_WORLDS = changed.join(','); }
if ((full) && !env.PUPPETEER_CORE) console.log('note: PUPPETEER_CORE is not set; the browser tests will be skipped');

console.log(`== psys2 ${suite} suite: ${files.length} files, ${jobs} jobs` + (full ? ', all sweeps in full' : `, sweeps sampled at ~10%, seed ${seed}, changed worlds in full: ${changed.length ? changed.join(', ') : '(none)'}`));
const t0 = Date.now();
// Rule B (specs/06 "Testing"): no test touches the network. The preload makes fetch/http to a non-loopback host throw, and logs it so that a test that swallows the error still fails the run.
const netDir = mkdtempSync(join(tmpdir(), 'psys2-net-'));
env.PSYS2_NET_LOG = join(netDir, 'attempts.log');
const preload = join(root, 'scripts', 'lib', 'no-network.mjs');
const r = spawnSync(process.execPath, ['--import', preload, '--test', `--test-concurrency=${jobs}`, ...rest, ...files], { stdio: 'inherit', cwd: root, env });
const netViolations = existsSync(env.PSYS2_NET_LOG) ? readFileSync(env.PSYS2_NET_LOG, 'utf8').trim() : '';
rmSync(netDir, { recursive: true, force: true });
if (netViolations) console.log(`== NETWORK ACCESS IN TESTS (not allowed):\n${netViolations}`);
console.log(`== psys2 ${suite} suite finished in ${((Date.now() - t0) / 1000).toFixed(1)} s wall (seed ${seed}, exit ${r.status ?? 1})`);
process.exit(netViolations ? 1 : (r.status ?? 1));
