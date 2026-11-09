// SPDX-License-Identifier: AGPL-3.0-only
// Voice end of turn in the real webchat (headless Chrome, fake SpeechRecognition): runs when PUPPETEER_CORE points to a scratch puppeteer-core install and a Chrome exists.
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

test('webchat voice: pauses, final, mic stop, cancel, one at a time, language switch', { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run', timeout: 300000 }, async () => {
  const { SCENARIOS } = await import('../scripts/test-webchat-voice.mjs');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try { for (const name of Object.keys(SCENARIOS)) await SCENARIOS[name]({ throttle: 1, chrome: CHROME }); } finally { console.log = orig; }
  assert.deepEqual(logs.filter((l) => l.startsWith('FAIL')), [], logs.join('\n'));
});
