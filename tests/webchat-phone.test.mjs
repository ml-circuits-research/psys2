// SPDX-License-Identifier: AGPL-3.0-only
// MT-SERIOUS phone mode in the real webchat (headless Chrome at 4x CPU, no Translator API, the on-device translation model loaded lazily and cached): runs when PUPPETEER_CORE points
// to a scratch puppeteer-core install, a Chrome exists and the model files are available (PSYS2_MT_CACHE = a directory with the bucket's gzip files, scripts/lib/mt-node.mjs naming;
// or PSYS2_MT_NETWORK=1 to download them from Mozilla's bucket).
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
const models = !!process.env.PSYS2_MT_CACHE || process.env.PSYS2_MT_NETWORK === '1';
const skip = !can ? 'set PUPPETEER_CORE (scratch puppeteer-core install) to run' : !models ? 'set PSYS2_MT_CACHE (directory of model files) or PSYS2_MT_NETWORK=1 to run' : false;

const run = (names, min = 3) => async () => {
  const { SCENARIOS } = await import('../scripts/test-webchat-phone.mjs');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try { for (const name of names) await SCENARIOS[name]({ throttle: 4, chrome: CHROME }); } finally { console.log = orig; }
  assert.deepEqual(logs.filter((l) => l.startsWith('FAIL')), [], logs.join('\n'));
  assert.ok(logs.filter((l) => l.startsWith('PASS')).length >= min, 'the scenarios ran');
};

test('webchat phone mode: the model is lazy (English: no request), Romanian turns are read and answered in Romanian, the model is cached', { skip, timeout: 600000 }, run(['lazy', 'ro-turns', 'cache']));
test('webchat phone mode: an unreachable model bucket gives a banner with Retry and the message is still answered', { skip, timeout: 300000 }, run(['failure'], 2));
