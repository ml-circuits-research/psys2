import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { spellCorrect, spellAlternates, worldVocabulary, spellVocabulary, ignorable, spellBudget, ABBREVIATIONS } from '../src/formalizer/spell.mjs';
import { findPartialWindow, looksLikeQuestion, changesIntoQuestion } from '../src/formalizer/partial.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const vocab = (w) => worldVocabulary(engine.set, w);

test('spell budget: none below 3 letters, 1 up to 6, 2 from 7', () => {
  assert.deepEqual([2, 3, 6, 7, 10].map((n) => spellBudget('x'.repeat(n))), [0, 1, 1, 2, 2]);
});

test('the vocabulary comes from the worlds (lexicon, pattern literals, legend names)', () => {
  const v = vocab('kids.arith');
  for (const w of ['times', 'divided', 'plus']) assert.ok(v.has(w), w);
  assert.ok(spellVocabulary(engine.set).size > v.size);
  assert.ok(!v.has('eyes') || vocab('ui.avatar').has('eyes'));
  assert.ok(vocab('ui.avatar').has('eyes'));
});

test('typos are corrected to the candidate world vocabulary, not to another world', () => {
  const arith = spellCorrect('what is seven tmes six', { vocab: vocab('kids.arith') });
  assert.equal(arith.text, 'what is seven times six');
  assert.deepEqual(arith.corrections.map((c) => [c.from, c.to, c.kind]), [['tmes', 'times', 'spell']]);
  assert.deepEqual(arith.corrections[0].span, [14, 18]);
  const slip = spellCorrect('make your eyse bigger', { vocab: vocab('ui.avatar') });
  assert.equal(slip.text, 'make your eyes bigger');
});

test('known words, numbers, names, quoted text and short words are left alone', () => {
  const v = vocab('kids.arith');
  for (const t of ['What is 20 divided by 4', 'Tom has 5 apples', 'say "tmes" please', 'what is 7 tmes6']) {
    const r = spellCorrect(t, { vocab: v });
    assert.ok(!r.corrections.some((c) => /^(Tom|20|5|4|7)$/.test(c.from)), t);
  }
  assert.equal(spellCorrect('say "tmes" please', { vocab: v }).text, 'say "tmes" please');
  assert.equal(spellCorrect('hello Zork is here', { vocab: v }).corrections.some((c) => c.from === 'Zork'), false);
  assert.equal(spellCorrect('so he is ok', { vocab: v }).corrections.length, 0);
});

test('an ambiguous word (two candidates at the same distance) is not guessed', () => {
  const r = spellCorrect('a cat', { vocab: new Set(['bat', 'hat']), spelling: true });
  assert.equal(r.text, 'a cat');
});

test('chat abbreviations: u, ur, pls, plz, whats, 2nd, 3rd', () => {
  const r = spellCorrect('hey could u tell me whats ur 2nd pls', { vocab: new Set() });
  assert.equal(r.text, 'hey could you tell me what is your second please');
  assert.deepEqual(r.corrections.map((c) => c.kind), ['abbreviation', 'abbreviation', 'abbreviation', 'abbreviation', 'abbreviation']);
  assert.equal(ABBREVIATIONS['3rd'], 'third');
  assert.equal(spellCorrect('Whats up', { vocab: new Set() }).text, 'What is up');
});

test('spellAlternates swaps one known word for a close neighbour (yes -> eyes), never a function word', () => {
  const alts = spellAlternates('make bigger yes', { vocab: vocab('ui.avatar') });
  assert.ok(alts.some((a) => a.text === 'make bigger eyes' && a.corrections[0].from === 'yes' && a.corrections[0].to === 'eyes'), JSON.stringify(alts.map((a) => a.text)));
  assert.ok(alts.every((a) => a.corrections.length === 1));
  assert.ok(!alts.some((a) => a.corrections[0].from === 'make'));
});

test('findPartialWindow: longest readable run, tail punctuation kept, negations and known words never ignored', async () => {
  const parse = (re) => (s) => (re.test(s) ? { s } : null);
  const w = await findPartialWindow('hey buddy what is 7 times 6 sweetie', parse(/^what is 7 times 6$/));
  assert.equal(w.text, 'what is 7 times 6');
  assert.deepEqual(w.ignored.map((x) => x.text), ['hey buddy', 'sweetie']);
  const q = await findPartialWindow('hey what is 7 times 6 pls?', parse(/^what is 7 times 6\?$/));
  assert.equal(q.text, 'what is 7 times 6 pls?'.replace(' pls', '') + '', 'question mark is kept');
  const neg = await findPartialWindow('please do not make eyes bigger', parse(/^make eyes bigger$/));
  assert.equal(neg, null);
  const known = await findPartialWindow('hey red make eyes bigger', parse(/^make eyes bigger$/), { canIgnore: ignorable(new Set(['red']), new Set(['red'])) });
  assert.equal(known, null);
  const ok = await findPartialWindow('hey zzz make eyes bigger', parse(/^make eyes bigger$/), { canIgnore: ignorable(new Set(), new Set()) });
  assert.equal(ok.text, 'make eyes bigger');
});

test('a window that turns a request into a bare question is rejected', () => {
  assert.equal(looksLikeQuestion('body color should be red'), false);
  assert.equal(looksLikeQuestion('um how many legs'), true);
  assert.equal(changesIntoQuestion('body color should be red', 'body color', ['question']), true);
  assert.equal(changesIntoQuestion('um whats 3 plus 4 and also how many legs has a spider', 'how many legs has a spider', ['question']), false);
});

test('dialog: spelling fallback on the rules path, with the correction reported', async () => {
  const s = engine.createSession();
  const r = await s.send('what is seven tims six pls');
  assert.match(r.text, /7 times 6 is 42/);
  assert.deepEqual(r.segments[0].corrections.map((c) => [c.from, c.to]), [['tims', 'times']]);
  assert.match(r.text, /I read "tims" as "times"/);
  const off = await engine.createSession({ spell: false }).send('what is seven tims six pls');
  assert.equal(off.statuses.includes('unparsed') || off.statuses.length === 0, true);
});

test('dialog: partial understanding is off by default, on executes what was read and says what was ignored', async () => {
  const text = 'hey could you tell me what is seven times six sweetie';
  const off = await engine.createSession().send(text);
  assert.ok(off.statuses.includes('unparsed'));
  const on = await engine.createSession({ partial: true }).send(text);
  assert.match(on.text, /7 times 6 is 42/);
  assert.match(on.text, /I understood only part of that: I did not use "sweetie"/);
  assert.deepEqual(on.segments[0].ignored, ['sweetie']);
});

test('dialog: multi-command, the readable clause runs and the other is reported', async () => {
  const r = await engine.createSession({ partial: true }).send('um whats 3 plus 4 and also how many legs has a spider');
  assert.match(r.text, /3 plus 4 is 7/);
  assert.match(r.text, /A spider has 8 legs/);
  const mix = await engine.createSession({ partial: true }).send('What is 20 divided by 4? blorp frazzle wibble');
  assert.match(mix.text, /20 divided by 4 is 5/);
  assert.match(mix.text, /I did not understand "blorp frazzle wibble"/);
});

test('dialog: a negation is never dropped by partial understanding', async () => {
  const r = await engine.createSession({ partial: true }).send('hey do not what is seven times six');
  assert.ok(!/7 times 6 is 42/.test(r.text));
});
