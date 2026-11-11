// SPDX-License-Identifier: AGPL-3.0-only
// The matrix reasoner in the real webchat (SOPWORLD-1, spec 15): runs when PUPPETEER_CORE points to a scratch puppeteer-core install and a Chrome exists.
// Scenarios: scripts/test-webchat-matrix.mjs (default matrix, explicit ops, the five gains, the Settings > Developer > Reasoner switch).
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

test('webchat matrix reasoner: matrix is the default, explicit ops is respected, the setting restarts the engine', { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run', timeout: 600000 }, async () => {
  const { SCENARIOS } = await import('../scripts/test-webchat-matrix.mjs');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try { for (const name of Object.keys(SCENARIOS)) await SCENARIOS[name]({ throttle: 4, chrome: CHROME }); } finally { console.log = orig; }
  const failed = logs.filter((l) => l.startsWith('FAIL'));
  assert.deepEqual(failed, [], logs.join('\n'));
  assert.ok(logs.filter((l) => l.startsWith('PASS')).length >= 15, 'the rows ran');
});
