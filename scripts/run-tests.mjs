#!/usr/bin/env node
/**
 * Test runner: tests/*.test.mjs with node:test, one process per file, `--test-concurrency` = jobs.
 *
 *   npm run test:smoke     --smoke: the SMOKE list below = invariants only (under 1 minute on 4 cores; once per landing): PSYS2_SUITE=smoke, sweeps sampled, no browser, no model
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
/**
 * SMOKE suite = INVARIANTS only (worker-tasks "NO POINT FIXES", item 2): every turn gets a reply, nothing destructive runs on a partly understood sentence,
 * no tab change without a named tab, no network effect on a reading, undo/redo, the build loads and is fresh, no Romanian in worlds, the loop guard and the
 * turn guard. Language-case tests (a phrase, a paraphrase, a dialogue) are not in smoke: they run in the full suite, and a failing one goes to the failure ledger
 * (training/eval/failures.jsonl) and to tests/known-failures.json, not to a patch. Target: under 60 s on 4 cores (`taskset -c 0-3 npm run test:smoke`).
 */
const SMOKE = [
  'invariants.test.mjs',               // every turn gets a reply; nothing destructive on a partly understood sentence; no tab change without a named tab (both reasoners)
  'smoke.test.mjs',                    // every world loads in both reasoners; the built webchat is fresh
  'build-versioning.test.mjs',         // the build loads: module versions and import maps agree
  'lazy-loading.test.mjs',             // the routing index, a start without other tabs' worlds or vendor assets, worlds on demand by their words, the second reading, a failed lazy fetch changes no reading
  'catalog-vocab-buckets.test.mjs',    // the catalog vocabulary read by buckets gives the finds of the whole file
  'webchat-assets.test.mjs',         // the build manifest covers every asset; cache reset keeps user data; stale page reloads once; start-up steps all end
  'network-never-changes-reading.test.mjs',   // no network effect on a reading
  'undo-redo.test.mjs',                // undo / redo
  'no-romanian-in-worlds.test.mjs',    // nothing but English in worlds/
  'loop-guard.test.mjs',               // a loop never runs away
  'turn-guard.test.mjs',               // a turn always settles (deadline, stop): the reply comes
  'failure-feedback.test.mjs',         // learn from use: failure rules, failures-only download, nothing is sent while the setting is off, ingest freezes first
  'live-state.test.mjs',               // the live-state invariant: round trips A-B-A-B of every attribute of the world schemas never meet a stale "already"; undo / redo; the view draws the state
];
const files = all.filter((f) => {
  if (smoke) return SMOKE.includes(f);
  if (browserOnly) return isBrowser(f);
  if (full) return true;
  return !isBrowser(f) && !f.endsWith('.full.test.mjs');
}).map((f) => join('tests', f));

/**
 * known-failures (worker-tasks "NO POINT FIXES"): tests/known-failures.json lists failing tests that are language cases on their way to the failure ledger:
 * { "known": [ { "file": "x.test.mjs", "name": "exact test name" | "pattern": "regex", "class": "translation residue", "ledger": "source id" } ] }.
 * They are reported as a count per class and do not fail the run; any other failure does. The smoke suite has no known failures (invariants only).
 */
const knownList = (() => { try { return JSON.parse(readFileSync(process.env.PSYS2_KNOWN_FAILURES || join(root, 'tests', 'known-failures.json'), 'utf8')).known ?? []; } catch { return []; } })();
const isKnown = (f) => knownList.find((k) => (!k.file || k.file === f.file) && (k.name ? k.name === f.name : k.pattern ? new RegExp(k.pattern).test(f.name) : false));

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
env.PSYS2_FAILURES_OUT = join(netDir, 'failures.jsonl');
const reporter = join(root, 'scripts', 'lib', 'known-failures-reporter.mjs');
const r = spawnSync(process.execPath, ['--import', preload, '--test', `--test-reporter=${reporter}`, '--test-reporter-destination=stdout', `--test-concurrency=${jobs}`, ...rest, ...files], { stdio: 'inherit', cwd: root, env });
const failed = existsSync(env.PSYS2_FAILURES_OUT) ? readFileSync(env.PSYS2_FAILURES_OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const known = failed.filter((f) => isKnown(f)), fresh = failed.filter((f) => !isKnown(f));
if (known.length) {
  const byClass = {}; for (const f of known) { const c = isKnown(f).class ?? 'unclassified'; byClass[c] = (byClass[c] ?? 0) + 1; }
  console.log(`== KNOWN FAILURES (do not fail the run): ${known.length}  ${Object.entries(byClass).map(([c, n]) => `${c}: ${n}`).join(', ')}`);
}
if (fresh.length) console.log(`== NEW FAILURES: ${fresh.length}\n${fresh.map((f) => `   ${f.file}: ${f.name}`).join('\n')}`);
// the exit code of node --test is 1 when any test failed; it is forgiven only when every recorded failure is known (a crash without a recorded failure still fails)
const runOk = r.status === 0 || (failed.length > 0 && fresh.length === 0);
const netViolations = existsSync(env.PSYS2_NET_LOG) ? readFileSync(env.PSYS2_NET_LOG, 'utf8').trim() : '';

if (netViolations) console.log(`== NETWORK ACCESS IN TESTS (not allowed):\n${netViolations}`);
console.log(`== psys2 ${suite} suite finished in ${((Date.now() - t0) / 1000).toFixed(1)} s wall (seed ${seed}, exit ${r.status ?? 1})`);
rmSync(netDir, { recursive: true, force: true });
process.exit(netViolations ? 1 : (runOk ? 0 : (r.status ?? 1)));
