// SPDX-License-Identifier: AGPL-3.0-only
// The system map (docs/system-map.html) is generated, not stale; the turn trace uses the same step vocabulary; the webchat About section links to the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { STEP_IDS, STEPS } from '../src/dialog/steps.mjs';
import { generate, MAP_FILE, MAP_COPY } from '../scripts/build-system-map.mjs';

test('the system map is generated, not stale (node scripts/build-system-map.mjs --write)', async () => {
  const originalDate = Date, originalRandom = Math.random;
  const html = await generate();
  assert.equal(Date, originalDate, 'the measurement restores the host clock');
  assert.equal(Math.random, originalRandom, 'the measurement restores the host random source');
  assert.equal(readFileSync(MAP_FILE, 'utf8'), html);
  assert.equal(readFileSync(MAP_COPY, 'utf8'), html, 'the webchat copy is the same page');
  for (const st of STEPS) assert.ok(html.includes(st.label), st.label);
  assert.ok(/<svg viewBox/.test(html) && /prefers-color-scheme: ?dark/.test(html) && /name="viewport"/.test(html));
}, { timeout: 180000 });

test('an unread new-engine turn reports its actual reading failure without old pipeline steps', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const before = structuredClone(s.isession.state);
  const r = await s.send('Draw a red house');
  assert.equal(r.trace.engine, 'new'); assert.equal(r.trace.legacy, false);
  assert.equal(r.trace.reason, 'reading'); assert.ok(r.trace.reading);
  assert.equal(r.trace.steps, undefined, 'retired route steps are not invented');
  assert.deepEqual(s.isession.state, before);
});

test('the About section of the webchat links to the system map', () => {
  assert.match(readFileSync(new URL('../docs/webchat/app.mjs', import.meta.url), 'utf8'), /href: 'system-map\.html'/);
});
