// SPDX-License-Identifier: AGPL-3.0-only
// LANG-FIXED in the real webchat (headless Chrome, fake SpeechRecognition, spy LanguageDetector): runs when PUPPETEER_CORE points to a scratch puppeteer-core install and a Chrome exists.
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
const skip = can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run';

const run = (names) => async () => {
  const { SCENARIOS } = await import('../scripts/test-webchat-language.mjs');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try { for (const name of names) await SCENARIOS[name]({ throttle: 1, chrome: CHROME }); } finally { console.log = orig; }
  assert.deepEqual(logs.filter((l) => l.startsWith('FAIL')), [], logs.join('\n'));
  assert.ok(logs.filter((l) => l.startsWith('PASS')).length >= 5, 'the scenarios ran');
};

test('webchat language: Română selected, 30 voice turns, worker restart, reload: ro-RO on every recognizer start; symmetric English', { skip, timeout: 420000 }, run(['ro30', 'en10']));
test('webchat language: switch commands, typed-message hint, reply voice note, replay of the 09e Romanian voice session', { skip, timeout: 420000 }, run(['command', 'voice', 'replay09e']));
