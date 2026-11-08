// Engine normalization and tokenizer improvements (spec 03 sections 1.5-1.9, 4.2a): fillers, indirect-question lead-ins,
// ordinals and number words, operator tokens, the question mark, possessives without apostrophe, sequencing words, typo tie-breaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleSet, mini } from './helpers.mjs';
import {
  analyze, tokenize, compilePattern, matchTokens, FormSession, makeEnv, formalize, correctTokens, splitPossessives, stripLeadIn,
} from '../src/formalizer/rules/index.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';

const LEXICON = `@lex.m.names core.lexicon
    class=name
    gender=m
    word=tom word=ben
@lex.m.things core.lexicon
    class=noun
    word=apple word=marble
`;
const PATS = `@p.m.q core.pattern
    match="how_many {item:noun} does {who:agent} have"
    emit="@{_} core.question type=m.holding seek=count where.owner={who} where.item={item}"
    kind=question
    priority=10
@p.m.go core.pattern
    match="go"
    emit="@{_} core.note text=\\"go\\" core.from=$e.tom"
    kind=statement
    priority=1
@p.m.okstop core.pattern
    match="[ok|please]? stop"
    emit="@{_} core.note text=\\"stop\\" core.from=$e.tom"
    kind=statement
    priority=1
@p.m.hey core.pattern
    match="hey {who:agent}"
    emit="@{_} core.note text=\\"greet\\" core.from={who}"
    kind=statement
    priority=1
@p.m.note core.pattern
    match="note {t:words}"
    emit="@{_} core.note text=\\"{t}\\" core.from=$e.tom"
    kind=statement
    priority=1
@p.m.then core.pattern
    match="then {t:words}"
    emit="@{_} core.note text=\\"then {t}\\" core.from=$e.tom"
    kind=statement
    priority=1
@p.m.glasses core.pattern
    match="glasses on you"
    emit="@{_} core.note text=\\"glasses statement\\" core.from=$e.tom"
    kind=statement
    priority=1
@p.m.glassesq core.pattern
    match="glasses on you ?"
    emit="@{_} core.note text=\\"glasses question\\" core.from=$e.tom"
    kind=question
    priority=1
@p.m.measure core.pattern
    match="measure {item:noun} {n:number?}"
    emit="@{_} core.note text=\\"measure {item} {n}\\" core.from=$e.tom"
    kind=statement
    priority=1
`;
const set = await bundleSet({ m: mini('m', { files: { 'lexicon.sop': LEXICON, 'patterns.sop': PATS } }) });
const lex = lexIndex(set);
const run = (text) => { const form = new FormSession(); form.initDefaults(); return formalize(text, { worlds: set, session: form, source: 'src' }); };
const via = (text) => run(text).segments.map((s) => (s.unparsed ? null : s.match.patternId));
const words = (s) => tokenize(s).filter((t) => t.kind !== 'punct').map((t) => t.lower);
/** Match one pattern against the first sentence of `text` (analyze: fillers kept, `?` token) with the fillers dropped. */
function m(match, text) {
  const s = analyze(text)[0];
  const toks = s.tokens.filter((t) => t.kind !== 'punct' && !t.filler);
  const env = makeEnv(text, set, new FormSession(), lex);
  const r = matchTokens(compilePattern(match), toks, env);
  return r && { ...Object.fromEntries(Object.entries(r.slots).map(([k, sl]) => [k, sl.value])), _lit: r.literals };
}

// ---- 1. fillers ---------------------------------------------------------------------------------------------------
test('global fillers are dropped before matching', () => {
  assert.deepEqual(words('hey uh uhm hmm lol pls play c thx ty tysm rn'), ['play', 'c']);
  assert.deepEqual(words('pleeease plz play c'), ['play', 'c']);
  assert.deepEqual(words('play c for me'), ['play', 'c']);
  assert.deepEqual(words('u know play c'), ['play', 'c']);
  assert.deepEqual(words('like, can you play c'), ['can', 'you', 'play', 'c']);
  assert.deepEqual(words('play c, like, now'), ['play', 'c', 'now']);
});

test('"like" is a filler only as a discourse marker, "for me" only at the end, "you know" not after do', () => {
  assert.deepEqual(words('I like apples'), ['I'.toLowerCase(), 'like', 'apples']);
  assert.deepEqual(words('what is a bird like'), ['what', 'is', 'a', 'bird', 'like']);
  assert.deepEqual(words('do u know the time'), ['do', 'u', 'know', 'the', 'time']);
  assert.deepEqual(words('do you know the time'), ['do', 'you', 'know', 'the', 'time']);
  assert.deepEqual(words('do it for me now'), ['do', 'it', 'for', 'me', 'now']);
});

test('fillers are marked, not lost, when kept; a sentence of only the original fillers is dropped', () => {
  const toks = tokenize('ok hey go please', 0, { keepFillers: true });
  assert.deepEqual(toks.map((t) => [t.lower, !!t.filler]), [['ok', true], ['hey', true], ['go', false], ['please', true]]);
  assert.equal(analyze('ok.').length, 0);
  assert.equal(analyze('hey.').length, 1);   // a greeting pattern may list `hey`
});

test('a pattern that lists ok / please / hey can still require it; patterns without them ignore it', () => {
  assert.deepEqual(via('ok stop'), ['p.m.okstop']);
  assert.deepEqual(via('please stop'), ['p.m.okstop']);
  assert.deepEqual(via('stop'), ['p.m.okstop']);
  assert.deepEqual(via('hey Tom'), ['p.m.hey']);          // `hey` listed by the pattern: kept in the last view
  assert.deepEqual(via('hey go pls'), ['p.m.go']);        // `go` does not list it: dropped
  assert.deepEqual(via('hmm lol note x ok well'), ['p.m.note']);
});

// ---- 2. indirect-question lead-ins --------------------------------------------------------------------------------
test('lead-ins before a question are stripped; the bare question is tried first', () => {
  const q = 'how many apples does Tom have';
  for (const lead of ['tell me', 'can you tell me', 'could you tell me', 'I want to know', 'I wonder', 'do you know', "I'd like to know", 'can u tell me', 'hey can u tell me'])
    assert.deepEqual(via(`${lead} ${q}`), ['p.m.q'], lead);
  assert.deepEqual(via(`Tell me ${q}?`), ['p.m.q']);
  assert.deepEqual(via(`I wonder if how many apples does Tom have`), ['p.m.q']);
  assert.deepEqual(via(`tell me about apples`), [null]);
  const stripped = stripLeadIn(analyze('can you tell me what is it').flatMap((s) => s.tokens));
  assert.deepEqual(stripped.map((t) => t.lower), ['what', 'is', 'it']);
  assert.equal(stripLeadIn(analyze('tell me a joke')[0].tokens), null);
});

test('typo correction also runs after a lead-in and fillers', () => {
  const r = run('hey can u tell me how many apples does Tom hvae');
  assert.deepEqual(r.segments.map((s) => !s.unparsed), [true]);
  assert.ok(r.segments[0].corrections?.length >= 1);
});

// ---- 3. ordinals and number words ---------------------------------------------------------------------------------
test('ordinal tokens: 1st, 2nd, 21st, second, third', () => {
  const t = (s) => tokenize(s).map((x) => [x.lower, x.ordinal ?? null]);
  assert.deepEqual(t('1st 2nd 3rd'), [['1', 1], ['st', null], ['2', 2], ['nd', null], ['3', 3], ['rd', null]]);   // number + suffix, as before
  assert.deepEqual(t('first second third'), [['first', 1], ['second', 2], ['third', 3]]);
  assert.deepEqual(t('21st'), [['21', 21], ['st', null]]);
  assert.deepEqual(t('twenty-first'), [['twenty-first', 21]]);
  assert.deepEqual(t('the second one'), [['the', null], ['second', 2], ['1', null]]);
});

test('ordinal slots accept ordinal words and digit ordinals; {n:number} accepts digit ordinals', () => {
  assert.deepEqual(m('take the {n:ordinal} one', 'take the second one'), { n: '2', _lit: 3 });
  assert.equal(m('take the {n:ordinal} one', 'take the 3rd one').n, '3');
  assert.equal(m('take the {n:ordinal} one', 'take the 21st one').n, '21');
  assert.equal(m('take the {n:ordinal} one', 'take the 5 one'), null);
  assert.equal(m('take the {n:number} one', 'take the 2nd one').n, '2');
  assert.equal(m('take the {n:number} one', 'take the second one'), null);   // a word ordinal is not a plain number
  assert.equal(m('take the second one', 'take the 2nd one'), null);          // a literal `second` does not match `2nd`
  assert.equal(m('take the {n:number} nd one', 'take the 2nd one').n, '2');   // patterns that list the suffix keep working
});

test('"one" matches the literal one and the number 1', () => {
  assert.notEqual(m('next one', 'next one'), null);
  assert.equal(m('take {n:number}', 'take one').n, '1');
  assert.notEqual(m('take [one|two] apples', 'take two apples'), null);
  assert.equal(m('take {n:number} apples', 'take two apples').n, '2');
});

test('number words: one point five, one and a half, a half, misspellings', () => {
  assert.deepEqual(words('one point five'), ['1.5']);
  assert.deepEqual(words('three point one four'), ['3.14']);
  assert.deepEqual(words('one and a half'), ['1.5']);
  assert.deepEqual(words('two and half'), ['2.5']);
  assert.deepEqual(words('half'), ['0.5']);
  assert.deepEqual(words('fourty ninty fiveteen'), ['40', '90', '15']);
  assert.deepEqual(words('fourty-five'), ['45']);
  assert.equal(m('give {n:number} apples', 'give a half apples').n, '0.5');
  assert.equal(m('give {n:number} apples', 'give half apples').n, '0.5');
  assert.equal(m('give a apples', 'give a apples') !== null, true);
});

// ---- 4. operators ---------------------------------------------------------------------------------------------------
test('operator symbols and words are one literal', () => {
  assert.deepEqual(m('{a:number} + {b:number}', '3 plus 4'), { a: '3', b: '4', _lit: 1 });
  assert.notEqual(m('{a:number} plus {b:number}', '3 + 4'), null);
  assert.notEqual(m('{a:number} minus {b:number}', '3 - 4'), null);
  assert.notEqual(m('{a:number} times {b:number}', '3 × 4'), null);
  assert.notEqual(m('{a:number} * {b:number}', '3 times 4'), null);
  assert.notEqual(m('{a:number} divided_by {b:number}', '8 / 4'), null);
  assert.notEqual(m('{a:number} / {b:number}', '8 divided by 4'), null);
  assert.notEqual(m('{a:number} > {b:number}', '8 greater than 4'), null);
  assert.notEqual(m('{a:number} greater_than {b:number}', '8 > 4'), null);
  assert.notEqual(m('{a:number} [<|less_than] {b:number}', '3 less than 4'), null);
  assert.equal(m('{a:number} + {b:number}', '3 minus 4'), null);
});

test('symbols are tokens where they mean something; % is percent', () => {
  assert.deepEqual(words('x > 3'), ['x', '>', '3']);
  assert.deepEqual(words('a + b'), ['a', '+', 'b']);
  assert.deepEqual(words('3<4'), ['3', '<', '4']);
  assert.deepEqual(words('- add milk'), ['add', 'milk']);
  assert.deepEqual(words('50%'), ['50', 'percent']);
  assert.equal(m('{n:number} percent', '50%').n, '50');
  assert.equal(m('{n:number} %', '50 percent').n, '50');
  // a pattern that does not know `%` still reads "measure apples 50%" (the percent word is dropped in the retry view)
  assert.deepEqual(via('measure apples 50%'), ['p.m.measure']);
});

// ---- 5. the question mark -------------------------------------------------------------------------------------------
test('a trailing ? is visible to patterns that list it; others behave as before', () => {
  assert.equal(analyze('queen h5 ok?')[0].isQuestion, true);
  assert.equal(analyze('queen h5?')[0].tokens.at(-1).kind, 'qmark');
  assert.equal(analyze('queen home')[0].tokens.at(-1).kind, 'word');
  assert.deepEqual(via('glasses on you?'), ['p.m.glassesq']);    // the pattern with `?` is more specific
  assert.deepEqual(via('glasses on you'), ['p.m.glasses']);      // without a mark the `?` pattern does not apply
  assert.notEqual(m('glasses on you', 'glasses on you?'), null); // a pattern without `?` ignores it
  assert.equal(m('glasses on you ?', 'glasses on you'), null);
  assert.equal(m('glasses on you ?', 'glasses on you ok?')._lit, 4);   // the filler `ok` does not block the tag question
  assert.equal(m('go {x:rest}', 'go home?').x, 'home');          // `rest` does not swallow the mark
  assert.equal(m('go {x:words} ?', 'go home?').x, 'home');
  assert.deepEqual(analyze('Is it red, right?')[0].tokens.filter((t) => t.filler).map((t) => t.lower), ['right']);
});

// ---- 6. possessives without apostrophe ----------------------------------------------------------------------------
test('"toms apples" is read as "tom \'s apples" when the stem is a known name', () => {
  const read = (s) => splitPossessives(tokenize(s), lex).map((t) => t.lower);
  assert.deepEqual(read('toms apples'), ['tom', "'s", 'apples']);
  assert.deepEqual(read('bens marbles are red'), ['ben', "'s", 'marbles', 'are', 'red']);
  assert.deepEqual(read('the apples'), ['the', 'apples']);   // `the` is not a name + s
  assert.deepEqual(read('Tom has apples'), ['tom', 'has', 'apples']);
  assert.deepEqual(read('how many are toms'), ['how', 'many', 'are', 'toms']);   // no noun follows: left alone
  assert.deepEqual(tokenize('ur apples').map((t) => [t.lower, t.alt]), [['your', 'ur'], ['apples', undefined]]);
  assert.notEqual(m('ur apples', 'ur apples'), null);        // a pattern listing `ur` still matches
});

// ---- 7. sequencing words --------------------------------------------------------------------------------------------
test('sentence-initial then / and then / after that are dropped for matching, kept for patterns that list them', () => {
  assert.deepEqual(via('then note x'), ['p.m.note']);                // dropped: the clean reading wins
  assert.deepEqual(via('after that note x'), ['p.m.note']);
  assert.deepEqual(via('and then note x'), ['p.m.note']);
  assert.deepEqual(via('then abc def'), ['p.m.then']);               // nothing matches without it: the pattern that lists `then` reads it
  assert.deepEqual(via('note a. Then abc def'), ['p.m.note', 'p.m.then']);
  const toks = tokenize('and then go', 0, { keepFillers: true });
  assert.deepEqual(toks.map((t) => [t.lower, !!t.lead]), [['and', true], ['then', true], ['go', false]]);
});

// ---- 8. typo tie-breaks ---------------------------------------------------------------------------------------------
test('typo ties: the preferred vocabulary first, then the most frequent word, never an arbitrary pick', () => {
  const vocab = new Set(['tame', 'tale', 'play']);
  const fix = (opts, v = vocab) => correctTokens(tokenize('tabe'), 'tabe', v, (w) => v.has(w), opts).corrections.map((c) => c.to);
  assert.deepEqual(fix({}), []);                                       // equally close, nothing to decide with
  assert.deepEqual(fix({ preferred: new Set(['tale']) }), ['tale']);   // the active world's word
  assert.deepEqual(fix({ preferred: () => new Set(['tame']) }), ['tame']);
  assert.deepEqual(fix({ freq: new Map([['tame', 5], ['tale', 2]]) }), ['tame']);
  assert.deepEqual(fix({ preferred: new Set(['tale', 'tame']), freq: new Map([['tame', 1], ['tale', 3]]) }), ['tale']);
  assert.deepEqual(fix({ freq: new Map([['tame', 2], ['tale', 2]]) }), []);
});

test('spellCorrect breaks a tie by word frequency, and leaves a still-tied word alone', async () => {
  const { spellCorrect } = await import('../src/formalizer/spell.mjs');
  const vocab = new Set(['tame', 'tale']);
  assert.equal(spellCorrect('tabe', { vocab }).text, 'tabe');
  vocab.freq = new Map([['tame', 4], ['tale', 1]]);
  assert.equal(spellCorrect('tabe', { vocab }).text, 'tame');
  vocab.freq = new Map([['tame', 2], ['tale', 2]]);
  assert.equal(spellCorrect('tabe', { vocab }).text, 'tabe');
});
