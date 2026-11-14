// SPDX-License-Identifier: AGPL-3.0-only
// Boot, caches and versions in a real Chrome (scripts/test-webchat-boot.mjs): no step stays open, no file twice per start, every request hashed, a warm start transfers
// almost nothing and shows no popup, an update leaves exactly the new build in the cache, the release reset keeps user data. Runs when PUPPETEER_CORE points to a
// scratch puppeteer-core install and a Chrome exists (like tests/webchat-ui.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = process.env.PUPPETEER_CORE;
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const ok = async (p) => { try { await access(p); return true; } catch { return false; } };
const can = !!CORE && await ok(path.join(CORE, 'lib/puppeteer/puppeteer-core.js')) && await ok(CHROME) && await ok(path.join(ROOT, 'docs/webchat/lib/dialog/index.mjs'));

for (const name of ['cold', 'warm', 'update', 'reset']) {
  test(`webchat boot (${name})`, { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run', timeout: 300000 }, async () => {
    const { SCENARIOS } = await import('../scripts/test-webchat-boot.mjs');
    const logs = [];
    const orig = console.log;
    console.log = (...a) => { logs.push(a.join(' ')); };
    try { await SCENARIOS[name]({ chrome: CHROME }); } finally { console.log = orig; }
    assert.ok(logs.some((l) => l.startsWith('PASS')), 'the scenario ran');
    assert.deepEqual(logs.filter((l) => l.startsWith('FAIL')), [], logs.join('\n'));
  });
}
