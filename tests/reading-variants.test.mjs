import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { readingVariants, baseForms, dropStyleIn } from '../src/formalizer/rules/variants.mjs';

const tok = (text) => text.split(' ').map((w) => ({ kind: 'word', raw: w, lower: w.toLowerCase() }));
const known = (w) => ['draw', 'wear', 'add', 'comes', 'come', 'clear', 'make', 'zoe'].includes(w);
const texts = (text) => readingVariants(tok(text), known).map((v) => v.map((t) => t.lower).join(' '));

test('baseForms: gerund, past and third person', () => {
  assert.ok(baseForms('wearing').includes('wear'));
  assert.ok(baseForms('making').includes('make'));
  assert.ok(baseForms('putting').includes('put'));
  assert.ok(baseForms('draws').includes('draw'));
  assert.ok(baseForms('highlighted').includes('highlight'));
});

test('variants: gerund and pronoun leads become commands, "will come" becomes "comes", only for known words', () => {
  assert.ok(texts('Wearing a hat').includes('wear a hat'));
  assert.ok(texts('He draws two houses').includes('draw two houses'));
  assert.ok(texts('What day will come after Monday').includes('what day comes after monday'));
  assert.ok(texts('the color of the body should be red').includes('the body color should be red'));
  assert.ok(texts('Zoë has 3 pears').includes('zoe has 3 pears'));
  assert.deepEqual(texts('Flibbering a hat'), []);   // the base is not a known word
  assert.equal(dropStyleIn(tok('make the paragraph in italics')).map((t) => t.lower).join(' '), 'make the paragraph italic');
  assert.equal(dropStyleIn(tok('write it in bold')).map((t) => t.lower).join(' '), 'write it in bold');   // not a styling command
});

test('variants are read by the engine: round-trip English frames', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const say = async (tab, text) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return (await s.send(text)).text; };
  assert.match(await say('draw', 'Drawing a house'), /house/);
  assert.match(await say('draw', 'He draws two houses'), /2 .*houses/);
  assert.match(await say(null, 'What day will come after Thursday'), /Friday/);
  assert.match(await say(null, 'what sound makes a cow'), /moo/);
  assert.match(await say('draw', 'Add the sun'), /sun/);
});
