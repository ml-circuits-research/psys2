// SPDX-License-Identifier: AGPL-3.0-only
// The headless UI scenarios of scripts/test-webchat-ui.mjs (SET, UI1, DOC) in the real webchat: runs when PUPPETEER_CORE points to a scratch
// puppeteer-core install and a Chrome exists (like tests/webchat-turns.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = process.env.PUPPETEER_CORE;
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const ok = async (p) => { try { await access(p); return true; } catch { return false; } };
const can = !!CORE && await ok(path.join(CORE, 'lib/puppeteer/puppeteer-core.js')) && await ok(CHROME) && await ok(path.join(ROOT, 'docs/webchat/lib/dialog/index.mjs'));

test('webchat UI at 390x844 and 1280x800: settings modal, one microphone, tooltips, About and help wording', { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run', timeout: 900000 }, async () => {
  const { SCENARIOS } = await import('../scripts/test-webchat-ui.mjs');
  const shots = await mkdtemp(path.join(tmpdir(), 'psys2-shots-'));
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try { for (const name of Object.keys(SCENARIOS)) await SCENARIOS[name]({ chrome: CHROME, shots }); } finally { console.log = orig; }
  assert.deepEqual(logs.filter((l) => l.startsWith('FAIL')), [], logs.join('\n'));
});
