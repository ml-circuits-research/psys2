// SPDX-License-Identifier: AGPL-3.0-only
// THE EXAMPLE BAR OF A PAGE (reviewer 2026-11-15 03:15 item 3; live owner check row 4): on the Diagram page with Română selected the bar showed English chips of other pages ("Remove the
// bird.", "Play an A major seventh chord"). The chips come from the open page's world (the worker's `onlyTab`: the sampler asked for that world only) and are in the selected language
// (src/dialog/sampler.mjs `chipsInLanguage`: the rules translator, a chip it cannot say completely is left out).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { engineSampler, chipsInLanguage } from '../src/dialog/sampler.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';

test('the chips of a page are sampled from its own world only', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const session = engine.createSession({ language: 'en' });
  const sampler = engineSampler(lib, engine, () => session);
  if (!sampler.available) return;
  const items = [];
  for (let seed = 1; seed <= 6; seed++) items.push(...sampler.sample('one', { worldId: 'diagram.sketch', seed }));
  assert.ok(items.length > 0, 'the diagram world has examples');
  assert.ok(items.every((r) => r.world === 'diagram.sketch'), `only diagram examples: ${items.map((r) => `${r.world}: ${r.text}`).join(' | ')}`);
  // the worker restricts the order of worlds to the tab's world for the page's bar, and the page asks it so (no fallback to the conversation's examples of every world)
  const worker = readFileSync(new URL('../docs/webchat/ui/engine-worker.mjs', import.meta.url), 'utf8'), app = readFileSync(new URL('../docs/webchat/app.mjs', import.meta.url), 'utf8');
  assert.match(worker, /m\.onlyTab \? \(tabWorld && loaded\(\)\.includes\(tabWorld\) \? \[tabWorld\] : \[\]\)/);
  assert.match(app, /sampleItems\('few', \{ tab, count: 4, onlyTab: true, language: lang \}\)/);
  assert.doesNotMatch(app, /sampleItems\('few', \{ tab: 'talk', count: 4 \}\); \} catch/, 'no fallback to the examples of other pages');
});

test('the chips are in the selected language: translated by the rules, a chip they cannot say is left out, never English', async () => {
  const tr = createTranslator();
  const items = [{ text: 'Remove the sun.', world: 'art.draw' }, { text: 'Add a circle.', world: 'diagram.sketch' }, { text: 'Change the colour of the sun to black.', world: 'art.draw' }, { text: 'Play an A major seventh chord.', world: 'media.music' }];
  const ro = await chipsInLanguage(items, 'ro', tr);
  assert.deepEqual(ro.map((x) => x.text), ['Scoate soarele.', 'Adaugă un cerc.']);
  assert.deepEqual(ro.map((x) => x.en), ['Remove the sun.', 'Add a circle.'], 'the English text is kept');
  assert.deepEqual(await chipsInLanguage(items, 'en', tr), items, 'English: unchanged');
  assert.deepEqual(await chipsInLanguage(items, 'ro', null), [], 'no translator: no chip rather than an English one');
});
