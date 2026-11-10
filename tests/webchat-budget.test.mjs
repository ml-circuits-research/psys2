// SPDX-License-Identifier: AGPL-3.0-only
// COMPUTE-BUDGET fault injection in the real webchat (headless Chrome, 4x CPU throttle): an infinite loop in a world operation, in the matcher and in the translator
// ends at the watchdog, the page stays responsive, the next message works and the same input is not run again; also with hands-free voice on.
// Runs when PUPPETEER_CORE points to a scratch puppeteer-core install and a Chrome exists. The scenarios live in scripts/test-webchat-budget.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = process.env.PUPPETEER_CORE;
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const ok = async (p) => { try { await access(p); return true; } catch { return false; } };
const can = !!CORE && await ok(path.join(CORE, 'lib/puppeteer/puppeteer-core.js')) && await ok(CHROME) && await ok(path.join(ROOT, 'docs/webchat/ui/engine-worker.mjs'));

test('webchat compute budget: loops in an operation, the matcher and the translator, Stop, hands-free voice, evidence', { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run', timeout: 600000 }, async () => {
  const { SCENARIOS } = await import('../scripts/test-webchat-budget.mjs');
  const logs = [];
  const orig = console.log;
  console.log = (...a) => { logs.push(a.join(' ')); };
  try { for (const name of ['op', 'matcher', 'translator', 'stop', 'voice', 'evidence']) await SCENARIOS[name]({ throttle: 4, chrome: CHROME }); } finally { console.log = orig; }
  const failed = logs.filter((l) => l.startsWith('FAIL'));
  assert.deepEqual(failed, [], logs.join('\n'));
});
