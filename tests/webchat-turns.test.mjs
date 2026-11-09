// SPDX-License-Identifier: AGPL-3.0-only
// Turn lifecycle in the real webchat (headless Chrome, 4x CPU throttle): runs when PUPPETEER_CORE points to a scratch puppeteer-core install and a Chrome exists.
// The long scenario (200 random messages) is scripts/test-webchat-turns.mjs; here a short one (20 messages).
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

test('webchat turn lifecycle at 4x throttle: repro, Stop, Enter during a turn, watchdog, random messages', { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run', timeout: 600000 }, async () => {
  const { SCENARIOS } = await import('../scripts/test-webchat-turns.mjs');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try { for (const name of ['repro', 'stop', 'enter', 'watchdog', 'random']) await SCENARIOS[name]({ throttle: 4, random: 20, seed: 3, chrome: CHROME }); } finally { console.log = orig; }
  const failed = logs.filter((l) => l.startsWith('FAIL'));
  assert.deepEqual(failed, [], logs.join('\n'));
});
