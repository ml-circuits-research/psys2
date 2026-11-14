// The thin lang.en module (src/lang/en.mjs) reads the English facts of the catalog world w.lang.en: the generated bundle is fresh, every wire parses, and the module answers the questions its callers ask.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { render } from '../scripts/build-lang-en.mjs';
import { en, createLangEn, langEnFromCatalog } from '../src/lang/en.mjs';
import { LANG_EN_LOCAL } from '../src/lang/en.local.mjs';
import { LANG_EN_FACTS } from '../src/lang/en.facts.generated.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// the catalog checkout (docs/worlds of sop-knowledge-worlds): PSYS2_KNOWLEDGE, a folder; the freshness and the equality of the catalog reader with the bundle are checked only where it is at hand
const CATALOG = process.env.PSYS2_KNOWLEDGE && !/^https?:/.test(process.env.PSYS2_KNOWLEDGE) ? process.env.PSYS2_KNOWLEDGE : null;

test('the generated facts module is fresh against the catalog (node scripts/build-lang-en.mjs <catalog>)', { skip: !CATALOG && 'no catalog folder in PSYS2_KNOWLEDGE' }, () => {
  assert.equal(readFileSync(join(REPO, 'src/lang/en.facts.generated.mjs'), 'utf8'), render(CATALOG));
});

test('every bundled shard parses with no error and carries only w.lang.en wires; the local facts too', () => {
  for (const [f, text] of [...Object.entries(LANG_EN_FACTS), ...Object.entries(LANG_EN_LOCAL)]) {
    const r = parse(text);
    assert.deepEqual(r.errors, [], f);
    for (const w of r.wires) assert.ok(/^w\.lang\.en\./.test(w.type), `${f}: ${w.id} ${w.type}`);
  }
  assert.ok(!Object.keys(LANG_EN_FACTS).some((s) => /^(core-plurals|hand-)/.test(s)), 'catalog additions that change what the readers answer are not bundled');
});

test('the reader through the knowledge source answers what the bundle answers', async () => {
  const source = { text: async (p) => { const s = /w\.lang\.en\/shards\/([^/]+)\.sop$/.exec(p)?.[1]; return s === 'phrases' ? LANG_EN_FACTS.lexicons : LANG_EN_FACTS[s] ?? null; } };
  const viaCatalog = await langEnFromCatalog(source);
  const catalogOnly = createLangEn(LANG_EN_FACTS, null);   // the local frames are the bundle's addition: the catalog's own are 233
  assert.equal(catalogOnly.frames().length, 233);
  assert.deepEqual(viaCatalog.frames(), en.frames());
  assert.equal(viaCatalog.timeRelation('before').rel, 'before');
  assert.deepEqual([...viaCatalog.words('det', 'acts')], [...en.words('det', 'acts')]);
  assert.equal(viaCatalog.singular('buses', 'lemma'), en.singular('buses', 'lemma'));
  assert.equal(await langEnFromCatalog({ text: async () => null }), null);
});

test('the reader of the catalog folder answers what the bundle answers, frames included', { skip: !CATALOG && 'no catalog folder in PSYS2_KNOWLEDGE' }, async () => {
  const { createKnowledgeSource } = await import('../src/loaders/knowledge-source.mjs');
  const live = await langEnFromCatalog(createKnowledgeSource(CATALOG));
  assert.deepEqual(live.frames(), en.frames());
  for (const [t, v] of [['det', 'acts'], ['prep', 'dialogue'], ['prep', 'time'], ['pron', 'matcher']]) assert.deepEqual([...live.words(t, v)], [...en.words(t, v)]);
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
  const other = createLangEn({ determiners: LANG_EN_FACTS.determiners, prepositions: LANG_EN_FACTS.prepositions, numbers: LANG_EN_FACTS.numbers, pronouns: LANG_EN_FACTS.pronouns, morphology: LANG_EN_FACTS.morphology, ellipsis: LANG_EN_FACTS.ellipsis, grammar: LANG_EN_FACTS.grammar, lexicons: LANG_EN_FACTS.lexicons });
  assert.deepEqual([...other.words('det', 'acts')], [...en.words('det', 'acts')]);
  const wires = Object.values(LANG_EN_FACTS).flatMap((t) => parse(t).wires);
  assert.deepEqual([...createLangEn(wires).words('prep', 'dialogue')], [...en.words('prep', 'dialogue')]);
});

test('clauses: joiners, frame leads, corrections and question words are facts', () => {
  assert.deepEqual([...en.cutWords(true)].sort(), [',', 'also', 'and', 'but', 'then']);
  assert.ok(!en.cutWords(false).has('also') && en.cardJoiners().has(';') && !en.cutWords(true).has(';'));
  assert.ok(en.frameLeads().has('from now on'));
  assert.deepEqual(en.corrections()[0], [['no', 'wait'], false]);
  assert.ok(en.questionWords('question-start').has('did') && !en.questionWords('question-start').has('whose') && en.questionWords('wh-lead').has('whose'));
  assert.ok(en.answerRegex().test('i dont know') && en.answerWords()[0].split(' ').length >= 4);
});

test('frames: the argument frames of the acts are facts (272: 233 of the catalog and 39 local: acts 85, acts.more 91, acts.data 62, acts.text 27, acts.facts 7), the schema worlds generate from them', () => {
  assert.deepEqual([en.frames('acts').length, en.frames('acts.more').length, en.frames('acts.data').length], [85, 91, 62]);
  const own = en.frames('acts').find((f) => f.id === 'read.own');
  assert.deepEqual([own.tabOnly, own.tabPriority, own.args], [true, 30, ['rest']]);
  assert.deepEqual(en.frames('acts.more').find((f) => f.id === 'ask.near').lit, { rel: 'near' });
});

test('noun phrases: relative clause, "some of", "the other one", "or" are readings of facts (np.sop slice 2)', () => {
  assert.deepEqual(en.nounPhrase('table that is red'), { text: 'red table', relative: true });
  assert.equal(en.nounPhrase('table that is at table 1').relative, undefined);   // a place is no modifier: left to the world
  assert.deepEqual(en.nounPhrase('some of the tables'), { text: 'the tables', partitive: { mode: 'ask' } });
  assert.deepEqual(en.nounPhrase('of the tables').partitive, { mode: 'ask' });   // the form's own determiner took "some"
  assert.deepEqual(en.nounPhrase('two of the houses').partitive, { mode: 'count', n: 2 });
  assert.equal(en.nounPhrase('all of the tables').text, 'all the tables');
  assert.deepEqual(en.nounPhrase('other table').other, { plural: false });
  assert.equal(en.nounPhrase('the other one').text, '');
  const c = en.nounPhrase('the red or the blue house').choice;
  assert.deepEqual(c.map((p) => p.alt), ['the red house', null]);
  assert.equal(en.nounPhrase('red and blue house').choice, undefined);
});

test('negated requests: "do not remove table 3" is no request; "never mind" and "dont know" are not requests either way', () => {
  assert.deepEqual(en.negatedRequest("don't add a table"), { rest: 'add a table', leadEnd: 6 });
  assert.deepEqual(en.negatedRequest('please do not draw a sun'), { rest: 'draw a sun', leadEnd: 14 });
  for (const t of ['never mind', 'never remove table 1', 'dont know', "don't forget to save it", 'do not remove table 3, add table 4', 'I do not know']) assert.equal(en.negatedRequest(t), null, t);
});

test('temporal prepositions are facts (relation and order) that no act form reads as a place', () => {
  assert.deepEqual(en.timeRelation('before'), { rel: 'before', order: 'earlier' });
  assert.deepEqual(en.timeRelation('until'), { rel: 'until', order: 'earlier', span: 'end' });
  assert.equal(en.timeRelation('at'), null);
  assert.ok(!en.words('prep', 'acts.rel').has('before') && !en.words('prep', 'dialogue').has('during'));
});
