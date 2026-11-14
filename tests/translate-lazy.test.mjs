// SPDX-License-Identifier: AGPL-3.0-only
// The Romanian -> English rules (ro-en.mjs and its phrase tables, 140 KB) load with the Romanian path only: a browser host sets `__psys2LazyRoEn` before importing the translator, an English
// session never fetches them, a Romanian turn (or `loadRoEn`) does. Node keeps the eager load (the CLI, the server and every other test call `translate` synchronously).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.__psys2LazyRoEn = true;   // this file runs in its own process
const tr = await import('../src/translate/index.mjs');

test('English-only use does not load the Romanian rules, and the English -> Romanian rules stay synchronous', () => {
  assert.equal(tr.roEnLoaded(), false);
  assert.equal(typeof tr.translate('how are you', { from: 'en', to: 'ro' }).text, 'string');
  assert.equal(tr.detectLanguage('what is 3 plus 4').lang, 'en');
  assert.equal(tr.roEnLoaded(), false, 'detection and the English path never need them');
});

test('a Romanian message waits for the rules and is then translated; later calls are synchronous', async () => {
  const first = tr.translate('cât face 3 plus 4', { from: 'ro', to: 'en' });
  assert.ok(first instanceof Promise);
  assert.match((await first).text, /3 plus 4/);
  assert.equal(tr.roEnLoaded(), true);
  const again = tr.translate('cât face 3 plus 4', { from: 'ro', to: 'en' });
  assert.ok(!(again instanceof Promise));
});

test('the engine worker asks for the lazy load and loads the rules for a Romanian turn; the warm-up does not load them for English', () => {
  const w = readFileSync(new URL('../docs/webchat/ui/engine-worker.mjs', import.meta.url), 'utf8');
  assert.match(w, /globalThis\.__psys2LazyRoEn = true/);
  assert.match(w, /await mods\.translate\.loadRoEn/);
  assert.match(w, /if \(mods\.lang\.normalize\(settings\.language\) !== 'en'\) await tr\.translate\('repede/);
});
