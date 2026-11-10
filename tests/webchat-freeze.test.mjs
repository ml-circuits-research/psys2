// SPDX-License-Identifier: AGPL-3.0-only
// URGENT-FREEZE regression: a Chrome profile populated by an OLDER build of the webchat (HTTP cache, Cache API model of the old sha, old settings, phrase log)
// is reopened against the current build, served with GitHub-Pages caching (max-age=600, ETag). Typed and spoken commands must stay responsive:
// input echo < 100 ms, no two main-thread tasks > 500 ms back to back, no page errors, no ORT restart, and the model cache holds only the current model.
// The old build is `git archive` of OLD_COMMIT when git has it, else the current build is used (the stale entries are planted either way).
// Runs when PUPPETEER_CORE points to a scratch puppeteer-core install (see scripts/perf-webchat.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = process.env.PUPPETEER_CORE;
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const OLD_COMMIT = '1e667bb';   // the build before the NX A3 model (op/tag outputs) became the dispatcher
const ok = async (p) => { try { await access(p); return true; } catch { return false; } };
const can = !!CORE && await ok(path.join(CORE, 'lib/puppeteer/puppeteer-core.js')) && await ok(CHROME) && await ok(path.join(ROOT, 'docs/webchat/lib/dialog/index.mjs'));

test('webchat: a profile populated by an older build stays responsive on the current build (typed and spoken commands)', { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run', timeout: 900000 }, async () => {
  const { runFreeze, longRuns, backToBackLong } = await import('../scripts/freeze-profile.mjs');
  const tmp = await mkdtemp(path.join(tmpdir(), 'psys2-oldbuild-'));
  let oldRoot = path.join(ROOT, 'docs'), old = 'current build';
  try {
    execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${OLD_COMMIT}^{commit}`], { stdio: 'ignore' });
    execFileSync('sh', ['-c', `git -C "${ROOT}" archive ${OLD_COMMIT} docs | tar -x -C "${tmp}"`], { stdio: 'ignore' });
    oldRoot = path.join(tmp, 'docs'); old = OLD_COMMIT;
  } catch { /* no history (shallow clone): the planted stale entries still exercise the cache eviction */ }
  try {
    const r = await runFreeze({ oldRoot, newRoot: path.join(ROOT, 'docs'), throttle: 4, chrome: CHROME });
    const why = `old=${old} ${JSON.stringify({ typed: r.typed.map((t) => `${t.ms}ms`), voice: r.voice.map((t) => `${t.ms}ms`), echo: r.echoMs.map(Math.round), long: r.longRuns, max: r.maxLongMs, ort: r.ort.stats, errors: r.errors })}`;
    assert.ok(r.typed.every((t) => t.ok) && r.voice.every((t) => t.ok), `every typed and spoken command was answered (${why})`);
    const echo = [...r.echoMs].sort((a, b) => a - b)[Math.floor(r.echoMs.length / 2)];
    assert.ok(echo < 100, `input echo ${Math.round(echo)} ms (${why})`);
    assert.ok(!backToBackLong(r.longTasks, 500), `no two main-thread tasks over 500 ms back to back (${why})`);
    assert.ok(longRuns(r.longTasks).spanMs < 4000, `no long-task chain over 4 s (${why})`);
    assert.ok(r.modules.total > 20 && r.modules.versioned === r.modules.total, `every module URL carries the build hash (${JSON.stringify(r.modules)})`);
    assert.deepEqual(r.unversionedModules, [], `no module request without a build version, in the page or in the workers (${why})`);
    assert.equal(r.ort.stats?.restarts ?? 0, 0, `no ORT worker restart (${why})`);
    assert.equal(r.ort.paused, false, 'the models were not paused');
    assert.deepEqual(r.errors, [], `no page errors (${why})`);
    const keys = r.newCaches['psys2-dispatcher-model'] ?? [];
    assert.ok(!keys.some((k) => k.includes('sha256=' + '0'.repeat(64))), `the stale model entries were evicted (${keys.join(' ')})`);
    assert.ok(keys.filter((k) => /model\.int8\.onnx/.test(k)).length === 1, `exactly one cached model (${keys.join(' ')})`);
  } finally { await rm(tmp, { recursive: true, force: true }).catch(() => {}); }
});
