// The thin lang.en module (src/lang/en.mjs) reads the English facts of handover/lang.en: the generated bundle is fresh, every wire parses, and the module answers the questions its callers ask.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { render } from '../scripts/build-lang-en.mjs';
import { en, createLangEn } from '../src/lang/en.mjs';
import { LANG_EN_FACTS } from '../src/lang/en.facts.generated.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the generated facts module is fresh (node scripts/build-lang-en.mjs)', () => {
  assert.equal(readFileSync(join(REPO, 'src/lang/en.facts.generated.mjs'), 'utf8'), render());
});

test('every shard of handover/lang.en parses with no error and carries only lang.en wires', () => {
  const dir = join(REPO, 'handover/lang.en');
  for (const f of [...readdirSync(join(dir, 'shards')).map((x) => `shards/${x}`), 'schema.sop']) {
    const r = parse(readFileSync(join(dir, f), 'utf8'));
    assert.deepEqual(r.errors, [], f);
    for (const w of r.wires) assert.ok(/^(lang\.en\.|core\.|w\.lang\.en)/.test(`${w.id} ${w.type}`) || /^core\./.test(w.type), `${f}: ${w.id}`);
  }
});

test('words by view: the lists the modules used to write again', () => {
  assert.deepEqual([...en.words('det', 'acts')].sort(), 'a an another my this that these those one some our your the'.split(' ').sort());
  assert.ok(en.words('det', 'dialogue').has('several') && !en.words('det', 'discourse').has('several'));
  assert.ok(en.words('pron', 'acts').has('there') && !en.words('pron', 'continuation').has('there'));
  assert.equal(en.ordinals('acts').last, -1);
  assert.equal(en.refers('session.agent').they, 'any');
  assert.ok(en.words('prep', 'np.boundary').has('next'));
});

test('singular: the act set and the lemma set', () => {
  assert.equal(en.singular('boxes', 'act'), 'box');
  assert.equal(en.singular('glass', 'act'), 'glass');
  assert.equal(en.singular('cacti', 'lemma'), 'cactus');
  assert.equal(en.singular('iris', 'lemma'), 'iris');
  assert.equal(en.singular('kiwis', 'lemma'), 'kiwi');
  assert.equal(en.singular('buses', 'lemma'), 'bus');
  assert.equal(en.singular('mice', 'lemma', new Map([['mice', 'mouse']])), 'mouse');
});

test('coordination: heads split before the first preposition; a part that starts with no determiner joins the one before', () => {
  assert.deepEqual(en.splitThings('a sun, a cloud and a man next to the house').map((p) => p.head), ['a sun', 'a cloud', 'a man']);
  assert.equal(en.splitThings('a sun, a cloud and a man next to the house')[0].tail, 'next to the house');
  assert.deepEqual(en.splitThings('red and blue house'), []);
  assert.deepEqual(en.splitList('tables 1 and 2, 3'), ['tables 1', '2', '3']);
  assert.ok(en.bareDistributes('2') && en.bareDistributes('last') && !en.bareDistributes('table'));
});

test('ellipsis markers keep their order (longest marker first)', () => {
  assert.deepEqual(en.leads()[0], ['and', 'what', 'about']);
  assert.ok(en.repeats().has('again') && en.starters().has('what'));
  assert.equal(en.anaphorRegex('discourse.pronoun').exec('what sound does that one make')[1], 'that one');
});

test('a module can read another version of the same world: createLangEn takes texts or wires', () => {
  const other = createLangEn({ determiners: LANG_EN_FACTS.determiners, np: LANG_EN_FACTS.np, prepositions: LANG_EN_FACTS.prepositions, numbers: LANG_EN_FACTS.numbers, pronouns: LANG_EN_FACTS.pronouns, morphology: LANG_EN_FACTS.morphology, ellipsis: LANG_EN_FACTS.ellipsis });
  assert.deepEqual([...other.words('det', 'acts')], [...en.words('det', 'acts')]);
  const wires = Object.values(LANG_EN_FACTS).flatMap((t) => parse(t).wires);
  assert.deepEqual([...createLangEn(wires).words('prep', 'dialogue')], [...en.words('prep', 'dialogue')]);
});
