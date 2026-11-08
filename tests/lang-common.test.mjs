import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { validateWorldSet } from '../src/worlds/validate.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';
import { compilePattern, checkPattern } from '../src/formalizer/rules/index.mjs';
import { isOldFiller } from '../src/formalizer/rules/normalize.mjs';

const set = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
const lex = lexIndex(set);
const world = set.get('lang.common');

test('lang.common is a fixture that kids.common imports and that claims nothing', () => {
  assert.equal(world.status, 'fixture');
  assert.equal(world.summaryPhrase, '');
  assert.equal(world.patterns.length, 0);
  assert.equal(world.operations.length, 0);
  assert.ok(set.available('kids.common').includes('lang.common'));
  assert.ok(set.available('ui.avatar').includes('lang.common'));
  assert.equal(lex.byWorld.has('lang.common'), false, 'never a routing target');
  assert.deepEqual(validateWorldSet(set).filter((m) => m.startsWith('lang.common')), []);
});

test('phrase groups: all macros resolve, are non-empty, longest alternatives first and hold no unreachable alternative', () => {
  for (const id of ['lead.polite', 'lead.question', 'lead.filler', 'tail.filler']) {
    const ph = lex.phrases.get('lang.' + id);
    assert.ok(ph && ph.alts.length >= 20, id);
    assert.ok(ph.alts.every((a, i) => i === 0 || a.length <= ph.alts[i - 1].length || a.join('_').length > 0));
    const lens = ph.alts.map((a) => a.length);
    assert.deepEqual(lens, [...lens].sort((x, y) => y - x), `${id} sorted by length`);
    for (const alt of ph.alts) assert.ok(!alt.some((w) => isOldFiller(w)), `${id}: ${alt.join('_')} can never match`);
    const c = compilePattern(`[$lang.${id}]? x`, lex.phrases);
    assert.equal(c.elements[0].alts, ph.alts);
  }
});

test('shared lexicons exist and unknown ids are reported', () => {
  for (const n of ['colour', 'ordinal', 'size', 'degree', 'direction', 'position', 'unit']) assert.ok(lex.lexicons.get('lex.lang.' + n)?.words.size > 3, n);
  assert.ok(lex.lexicons.get('lex.lang.colour').words.has('turquoise'));
  assert.ok(lex.lexicons.get('lex.lang.ordinal').words.has('third'));
  const p = { id: 'x', worldId: 'kids.common', match: '[$lang.nope]? hello', emit: '@{_} core.agent name=x', kind: 'request' };
  assert.match(checkPattern(p, set)[0], /unknown phrase/);
  assert.deepEqual(checkPattern({ ...p, match: '[$lang.lead.polite]? hello' }, set), []);
});

test('ui.avatar pilot (L4): patterns use the macros, colours extend lang.common, phrases are imported', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../worlds/ui.avatar/patterns.sop', import.meta.url), 'utf8');
  assert.ok((text.match(/\[\$lang\.(lead|tail)\./g) ?? []).length > 200);
  assert.ok(text.length < 80000, `patterns.sop is ${text.length} bytes`);
  for (const p of set.get('ui.avatar').patterns) assert.deepEqual(checkPattern(p, set), [], p.id);
  const colours = lex.lexicons.get('lex.ui.avatar.colors').words;
  for (const w of lex.lexicons.get('lex.lang.colour').words) assert.ok(colours.has(w), w);
  assert.ok(colours.has('light_blue'));
});
