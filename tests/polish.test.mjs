// Engine and world polish found during integration testing: ellipsis, arithmetic symbols, articles, lemmas,
// template conditions, the words slot, ctx.retract, replies in other languages and the capabilities answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleEngine, mini } from './helpers.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { tokenize } from '../src/formalizer/rules/normalize.mjs';
import { singularLemma, pluralize } from '../src/formalizer/rules/lemma.mjs';
import { compilePattern, matchTokens } from '../src/formalizer/rules/matcher.mjs';
import { withArticle } from '../src/interpreter/render.mjs';
import { capabilities } from '../worlds/kids.common/ops.mjs';

const real = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() });
const say = async (lines, lang = 'en') => {
  const s = real.createSession({ language: lang });
  let r;
  for (const l of lines) r = await s.send(l);
  return r;
};

// ---- 1. ellipsis ----------------------------------------------------------------------------------
test('ellipsis: the omitted item is the most recent one of the agent, else of the session; none -> unparsed', async () => {
  assert.equal((await say(['Tom has 5 apples. He gives 2 to Ana.', 'How many apples does Tom have?'])).text, 'Tom has 3 apples.');
  assert.equal((await say(['Ana has 4 pears. Ana eats 1.', 'How many pears does Ana have?'])).text, 'Ana has 3 pears.');
  assert.equal((await say(['Tom has 5 apples. Ana has 2 pears. Tom gets 3 more.', 'How many apples does Tom have?'])).text, 'Tom has 8 apples.');
  // the agent's own item wins over the session's latest item
  assert.equal((await say(['Tom has 5 apples. Ana has 2 pears. Tom buys 1 more.', 'How many pears does Tom have?'])).statuses.at(-1), 'missing');
  assert.equal((await say(['Tom has 5 apples. Ana has 2 pears. Tom buys 1 more.', 'How many apples does Tom have?'])).text, 'Tom has 6 apples.');
  // nothing mentioned yet: not guessed
  assert.ok((await say(['Ana gives 2 to Tom.'])).statuses.includes('unparsed'));
  assert.ok((await say(['He gets 3 more.'])).statuses.includes('unparsed'));
});

// ---- 2. arithmetic symbols ------------------------------------------------------------------------
test('tokenizer keeps arithmetic symbols between numbers and drops them elsewhere', () => {
  const t = (s) => tokenize(s).map((x) => x.lower);
  assert.deepEqual(t('7+5'), ['7', '+', '5']);
  assert.deepEqual(t('7 + 5 ='), ['7', '+', '5', '=']);
  assert.deepEqual(t('12 - 4'), ['12', '-', '4']);
  assert.deepEqual(t('12-4'), ['12', '-', '4']);
  assert.deepEqual(t('3*4'), ['3', '*', '4']);
  assert.deepEqual(t('3 × 4'), ['3', '*', '4']);
  assert.deepEqual(t('20 ÷ 4'), ['20', '/', '4']);
  assert.deepEqual(t('20 / 4'), ['20', '/', '4']);
  assert.deepEqual(t('seven + five'), ['7', '+', '5']);
  assert.deepEqual(t('7 + -3'), ['7', '+', '-3']);
  assert.deepEqual(t('-3 + 5'), ['-3', '+', '5']);
  assert.deepEqual(t('apples + pears'), ['apples', 'pears']);   // not arithmetic: dropped as before
  assert.deepEqual(t('well - done'), ['done']);
});

test('kids.arith understands arithmetic symbols', async () => {
  assert.equal((await say(['what is 7+5?'])).text, '7 plus 5 is 12.');
  assert.equal((await say(['7 + 5 ='])).text, '7 plus 5 is 12.');
  assert.equal((await say(['calculate 3*4'])).text, '3 times 4 is 12.');
  assert.equal((await say(['3 × 4'])).text, '3 times 4 is 12.');
  assert.equal((await say(['12 - 4'])).text, '12 minus 4 is 8.');
  assert.equal((await say(['What is -3 + 5?'])).text, '-3 plus 5 is 2.');
  assert.equal((await say(['20 / 4'])).text, '20 divided by 4 is 5.');
});

// ---- 3. articles ----------------------------------------------------------------------------------
test('renderer :a uses exceptions, not only vowel letters', () => {
  for (const [w, a] of [['apple', 'an'], ['egg', 'an'], ['unicorn', 'a'], ['university', 'a'], ['European', 'a'], ['one-eyed pirate', 'a'],
    ['hour', 'an'], ['honest man', 'an'], ['heir', 'an'], ['umbrella', 'an'], ['uncle', 'an'], ['ugly duck', 'an'], ['unit', 'a'], ['unimportant thing', 'an'],
    ['dog', 'a'], ['house', 'a'], ['Hat', 'a']]) assert.equal(withArticle(w), `${a} ${w}`, w);
});

// ---- 4. lemmas ------------------------------------------------------------------------------------
test('lemmatizer keeps -us/-ss/-is singulars and maps -uses plurals back', () => {
  for (const w of ['octopus', 'walrus', 'bus', 'rhombus', 'cactus', 'virus', 'glass', 'grass', 'iris']) assert.equal(singularLemma(w), w, w);
  for (const [pl, s] of [['octopuses', 'octopus'], ['buses', 'bus'], ['cactuses', 'cactus'], ['cacti', 'cactus'], ['viruses', 'virus'], ['walruses', 'walrus'],
    ['rhombuses', 'rhombus'], ['glasses', 'glass'], ['kiwis', 'kiwi'], ['apples', 'apple'], ['houses', 'house'], ['causes', 'cause']]) assert.equal(singularLemma(pl), s, pl);
  assert.equal(pluralize('octopus'), 'octopuses');
  assert.equal(pluralize('bus'), 'buses');
});

test('kids.animals knows the octopus and the walrus; kids.shapes still handles the rhombus', async () => {
  assert.equal((await say(['How many legs does an octopus have?'])).text, 'An octopus has 8 legs.');
  assert.equal((await say(['How many legs do octopuses have?'])).text, 'An octopus has 8 legs.');
  assert.equal((await say(['Can a walrus swim?'])).text, 'Yes, a walrus can swim.');
  assert.equal((await say(['What does a walrus eat?'])).text, 'Walruses eat clams and fish.');
  assert.equal((await say(['A rhombus has 4 sides.', 'How many sides does a rhombus have?'])).text.includes('4'), true);
  assert.deepEqual(real.problems(), []);
});

// ---- 5 and 7. template conditions, ctx.retract ----------------------------------------------------
const LEGEND = `
@wh.note core.type
    extends=core.state
@wh.note.text core.key
    value=string
    card=one
    ask="What does the note say?"
`;
const OPS = `
export function flag(ctx, { n }) { return { status: 'supported', value: Number(n) > 1 }; }
export function num(ctx, { n }) { return { status: 'supported', value: Number(n) }; }
export function add(ctx, { text }) { ctx.emit('@{_} wh.note text=' + JSON.stringify(text)); return { status: 'supported', value: 'added' }; }
export function drop(ctx) {
  const before = ctx.find('wh.note');
  for (const w of before) ctx.retract(w.id, 'dropped by test');
  return { status: 'supported', value: String(before.length) + ' retracted, ' + ctx.find('wh.note').length + ' left' };
}
export function count(ctx) { return { status: 'supported', value: String(ctx.find('wh.note').length) }; }
export function badRetract(ctx) { return { status: 'supported', value: String(ctx.retract('nothing')) }; }
`;
const act = (impl, action) => `@op.wh.${impl} core.operation\n    impl=${impl}\n    semantics=action\n    action=${action}\n`;
const req = (id, match, action, extra = '') => `@pat.wh.${id} core.pattern\n    match="${match}"\n    emit="@{_} core.request action=${action}${extra}"\n    kind=request\n    example="${match}"\n`;
const tpl = (id, f, when, text) => `@tpl.wh.${id} core.template\n    for=${f}\n${when.map((w) => `    when="${w}"\n`).join('')}    text="${text}"\n`;
const whEngine = () => bundleEngine({
  wh: mini('wh', {
    legend: LEGEND, opsSrc: OPS,
    files: {
      'operations.sop': ['flag', 'num', 'add', 'drop', 'count', 'badRetract'].map((i) => act(i, 'wh.' + i)).join('\n'),
      'patterns.sop': [req('flag', 'flag {n:number}', 'wh.flag', ' arg.n={n}'), req('num', 'num {n:number}', 'wh.num', ' arg.n={n}'),
        `@pat.wh.add core.pattern\n    match="add note {t:word}"\n    emit="@{_} core.request action=wh.add arg.text={t}"\n    kind=request\n    example="add note x"\n`,
        req('drop', 'drop notes', 'wh.drop'), req('count', 'count notes', 'wh.count'), req('bad', 'bad retract', 'wh.badRetract')].join('\n'),
      'templates.sop': [
        tpl('flagT', 'action.wh.flag', ['value=true'], 'yes'), tpl('flagF', 'action.wh.flag', ['value=false'], 'no'),
        tpl('numZ', 'action.wh.num', ['value=0'], 'zero'), tpl('numM', 'action.wh.num', ['value>1'], 'many {value}'),
        tpl('numN', 'action.wh.num', ['value!=1', 'value<0'], 'negative'), tpl('numD', 'action.wh.num', [], 'one'),
      ].join('\n'),
    },
  }),
});

test('core.template when= renders yes/no and numeric cases from one operation', async () => {
  const e = await whEngine();
  assert.deepEqual(e.problems(), []);
  const s = e.createSession();
  assert.equal((await s.send('flag 3')).text, 'yes');
  assert.equal((await s.send('flag 1')).text, 'no');
  assert.equal((await s.send('num 0')).text, 'zero');
  assert.equal((await s.send('num 5')).text, 'many 5');
  assert.equal((await s.send('num 1')).text, 'one');
});

test('ctx.retract marks core.status=retracted; retracted wires leave find/lookup but stay in memory', async () => {
  const e = await whEngine();
  const s = e.createSession();
  await s.send('add note a');
  await s.send('add note b');
  assert.equal((await s.send('count notes')).text, '2');
  assert.equal((await s.send('drop notes')).text, '2 retracted, 0 left');
  assert.equal((await s.send('count notes')).text, '0');
  const mem = s.memory();
  assert.match(mem, /wh\.note/);
  assert.equal((mem.match(/core\.status=retracted/g) ?? []).length, 2);
  assert.match(mem, /core\.reason="dropped by test"/);
  await s.send('add note c');
  assert.equal((await s.send('count notes')).text, '1');
  assert.equal((await s.send('bad retract')).text, 'false');
});

// ---- 6. words slot --------------------------------------------------------------------------------
test('words slot: default maximum 12 tokens, words(N) sets the maximum', () => {
  const run = (match, sentence) => matchTokens(compilePattern(match), tokenize(sentence), { text: sentence, lex: {}, resolveAgent: () => null });
  const n12 = 'a b c d e f g h i j k l';
  assert.equal(run('say {t:words}', 'say ' + n12).slots.t.value, n12);
  assert.equal(run('say {t:words}', 'say ' + n12 + ' m'), null);
  assert.equal(run('say {t:words(20)}', 'say ' + n12 + ' m n o p').slots.t.value, n12 + ' m n o p');
  assert.equal(run('say {t:words(2)}', 'say a b c'), null);
  assert.throws(() => compilePattern('say {t:words(x)}'));
  assert.throws(() => compilePattern('say {t:number(3)}'));
});

// ---- 8. replies in other languages ----------------------------------------------------------------
test('unparsed Romanian input: the user sentence is quoted verbatim, examples are translated one by one', async () => {
  const input = 'Zorbul flimbează repede.';
  const r = await say([input], 'auto');
  assert.equal(r.lang, 'ro');
  assert.ok(r.statuses.includes('unparsed'));
  assert.ok(Array.isArray(r.parts) && r.parts.length > 1);
  const quote = r.parts.find((p) => p.quote && !p.example);
  assert.deepEqual({ text: quote.text, translate: quote.translate }, { text: '"Zorbul flimbează repede"', translate: false });
  assert.equal(r.parts.map((p) => p.text).join(''), r.text);
  assert.match(r.text, /^Nu am înțeles "Zorbul flimbează repede"\./);
  const examples = r.parts.filter((p) => p.example);
  const tr = createTranslator();
  for (const ex of examples) {
    assert.equal(ex.translate, false);
    const back = tr.translate(ex.text.slice(1, -1), { from: 'ro', to: 'en' });
    assert.deepEqual(back.unknown, [], ex.text);   // a real Romanian sentence, not a garbled English one
    assert.doesNotMatch(ex.text, /\b(apples|has|how many)\b/i);
  }
  // no English leftovers around the quote
  assert.doesNotMatch(r.text, /For example|I did not/);
});

test('unparsed English input keeps the plain reply and exposes parts', async () => {
  const r = await say(['Zorb flimbles quickly']);
  assert.match(r.text, /^I did not understand "Zorb flimbles quickly"\. For example: "/);
  assert.equal(r.parts.map((p) => p.text).join(''), r.text);
  assert.equal(r.parts.find((p) => p.quote).translate, false);
});

test('a multi-sentence Romanian message quotes only the sentence that failed', async () => {
  const r = await say(['Tom are cinci mere. Zorbul flimbează repede.'], 'ro');
  const quote = r.parts.find((p) => p.quote && !p.example);
  assert.equal(quote.text, '"Zorbul flimbează repede"');
});

// ---- 9. capabilities ------------------------------------------------------------------------------
test('capabilities: a short grouped sentence from world summaries, falling back to titles', async () => {
  const r = await say(['What can you do?']);
  assert.match(r.text, /^I can chat, /);
  assert.match(r.text, /do sums/);
  assert.match(r.text, /talk about animals, shapes and colors, (shopping and time|time and shopping)/);
  assert.match(r.text, /play (guess the animal|hangman|tic-tac-toe), (guess the animal|hangman|tic-tac-toe) and (guess the animal|hangman|tic-tac-toe)/);
  assert.match(r.text, /change my face/);
  assert.match(r.text, /Ask me "what can I say here\?" for examples\.$/);
  assert.ok(r.text.length < 300);
  const ctx = { worlds: () => [
    { id: 'core', title: 'Core', summary: '' }, { id: 'a', title: 'Chat world', summary: 'chat' }, { id: 'b', title: 'Sums', summary: 'do sums' },
    { id: 'c', title: 'Plain title' }, { id: 'd', title: 'x', summary: '' }, { id: 'e', title: 'x', summary: 'play chess' }, { id: 'f', title: 'x', summary: 'play go' },
  ] };
  assert.equal(capabilities(ctx, {}).value, 'chat, do sums, Plain title, and play chess and go');
});
