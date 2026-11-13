// KNOWLEDGE-OUT 4a: one colour and number-word reader (src/knowledge/values.mjs) for every world, seeded from the bundled subset generated from the catalog, replaced by the catalog when reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { colourName, colourHex, basicColour, colourNames, isColourWord, numberValue, numberWordOf, valuesFrom, loadValues } from '../src/knowledge/values.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { createLayeredSource } from '../src/knowledge/bundled-source.mjs';
import { build } from '../scripts/build-colour-lexicon.mjs';
import * as scene from '../worlds/art.draw/scene.mjs';

const CAT = path.join(import.meta.dirname, 'fixtures/catalog');

test('colours beyond the old twelve are read, with spelling and shorthand', () => {
  assert.ok(colourNames().length > 150);
  assert.equal(colourName(['Light-Blue']), 'light blue');
  assert.equal(colourName('gray'), 'grey');
  assert.equal(colourName('blk'), 'black');
  assert.match(colourHex('turquoise'), /^#[0-9a-f]{6}$/i);
  assert.equal(colourHex('alice blue').toLowerCase(), '#f0f8ff');
  assert.equal(basicColour('light blue'), 'blue');
  assert.equal(isColourWord('crimson'), true);
  assert.equal(isColourWord('house'), false);
});

test('number words come from k.values: cardinals, ordinals, groups, fractions', () => {
  assert.equal(numberValue('twelve', 'cardinal'), 12);
  assert.equal(numberValue('twenty-one'), 21);
  assert.equal(numberValue('third', 'ordinal'), 3);
  assert.equal(numberValue('dozen'), 12);
  assert.equal(numberValue('half'), 0.5);
  assert.equal(numberWordOf(7, 'ordinal'), 'seventh');
  assert.equal(numberValue('banana'), null);
});

test('the catalog replaces the bundled subset when it is reachable; an unreachable catalog leaves the subset, and says so', async () => {
  const facts = createFacts({ source: createKnowledgeSource(CAT) });
  await loadValues(facts);
  assert.equal(valuesFrom(), 'catalog');
  assert.equal(colourHex('red').toLowerCase(), '#ff0000');
  const down = createFacts({ source: createLayeredSource({ text: async () => null }) });
  assert.equal((await down.wires('k.values.colour')).length > 150, true, 'the bundled subset answers through the same reading path');
  assert.equal(down.unreachable(), true, 'a read served by the subset is still "I cannot reach the catalog"');
  assert.equal((await down.thing('house'))?.objects.length > 0, true, 'a built-in drawing is there with no network');
});

test('the shared colour lexicon is generated from the reader and not stale', () => {
  for (const [file, text] of build()) assert.equal(readFileSync(file, 'utf8'), text, `${file} is stale: run node scripts/build-colour-lexicon.mjs`);
});

test('the drawing board takes its colours from the reader: a catalog colour draws, shades work on any colour', () => {
  assert.equal(scene.canonColor(['dark', 'turquoise']), 'dark turquoise');
  assert.equal(scene.colorHex('teal').toLowerCase(), '#008080');
  assert.notEqual(scene.colorHex('dark turquoise'), scene.colorHex('turquoise'));
  assert.equal(scene.canonColor(['blorp']), null);
});
