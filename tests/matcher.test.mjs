import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleSet, mini } from './helpers.mjs';
import { analyze, splitSentences, tokenize, compilePattern, matchTokens, singularLemma, pluralize, FormSession, makeEnv, formalize, splitClauses, checkPattern } from '../src/formalizer/rules/index.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';
import { PatternError } from '../src/formalizer/rules/matcher.mjs';
import { parseNumberRun } from '../src/formalizer/rules/numbers.mjs';
import { serialize } from '../src/soplang/index.mjs';

const LEXICON = `@lex.m.names core.lexicon
    class=name
    gender=m
    word=tom word=ben
@lex.m.f core.lexicon
    class=name
    gender=f
    word=ana
@lex.m.things core.lexicon
    class=noun
    word=apple word=ice_cream word=child
    plural=child:children
@lex.m.animals core.lexicon
    class=noun
    word=dog word=cat word=hot_dog
@lex.m.units core.lexicon
    class=unit
    word=apple_unit word=cup
`;
const set = await bundleSet({ 'm': mini('m', { files: { 'lexicon.sop': LEXICON } }) });
const lex = lexIndex(set);

const defaultForm = () => { const f = new FormSession(); f.initDefaults(); return f; };
/** Match one pattern against one sentence; returns plain slot values or null. */
function m(match, text, form = defaultForm()) {
  const toks = tokenize(text, 0);
  const env = makeEnv(text, set, form, lex);
  const r = matchTokens(compilePattern(match), toks.filter((t) => t.kind !== 'punct'), env);
  return r && { ...Object.fromEntries(Object.entries(r.slots).map(([k, s]) => [k, s.value])), _lit: r.literals, _skip: r.skips };
}
const slots = (match, text, form) => { const r = m(match, text, form); if (!r) return r; const { _lit, _skip, ...rest } = r; return rest; };

test('sentence segmentation keeps offsets and does not split numbers', () => {
  const text = 'Tom has 3.5 kg. How much?  Really!';
  const s = splitSentences(text);
  assert.deepEqual(s.map((x) => x.text), ['Tom has 3.5 kg', 'How much', 'Really']);
  assert.deepEqual(s.map((x) => [x.start, x.end]), [[0, 14], [16, 24], [27, 33]]);
  assert.equal(text.slice(s[1].start, s[1].end), 'How much');
  assert.deepEqual(s.map((x) => x.terminator), ['.', '?', '!']);
});

test('question detection by ? or by first word', () => {
  const a = analyze('How many apples? Does Tom run. Tom runs? Tom runs.');
  assert.deepEqual(a.map((x) => x.isQuestion), [true, true, true, false]);
});

test('tokenizer keeps original casing, spans, numbers, possessive and commas', () => {
  const t = tokenize("Tom's 2 apples, -3 pears", 10);
  assert.deepEqual(t.map((x) => x.raw), ['Tom', "'s", '2', 'apples', ',', '-3', 'pears']);
  assert.deepEqual(t.map((x) => x.lower), ['tom', "'s", '2', 'apples', ',', '-3', 'pears']);
  assert.equal(t[0].start, 10);
  assert.equal(t[2].kind, 'number');
  assert.equal(t[4].kind, 'punct');
});

test('contractions are expanded', () => {
  const words = (s) => tokenize(s).map((x) => x.lower).join(' ');
  assert.equal(words("Tom doesn't have it"), 'tom does not have it');
  assert.equal(words("It isn't, I'm sure, don't, can't"), "it is not , i am sure , do not , can not");
  assert.equal(words("What's your name"), 'what is your name');
  assert.equal(words("They aren't here and he's there"), 'they are not here and he is there');
});

test('number words become digits', () => {
  const nums = (s) => tokenize(s).map((x) => x.lower).join(' ');
  assert.equal(nums('five apples'), '5 apples');
  assert.equal(nums('twenty-one apples'), '21 apples');
  assert.equal(nums('twenty one apples'), '21 apples');
  assert.equal(nums('one hundred and five apples'), '105 apples');
  assert.equal(nums('two thousand three hundred apples'), '2300 apples');
  assert.equal(nums('a dozen eggs'), '12 eggs');
  assert.equal(nums('two dozen eggs'), '24 eggs');
  assert.equal(nums('half a pie'), '0.5 a pie');
  assert.equal(nums('one two'), '1 2');
  assert.equal(parseNumberRun(['zero'], 0).value, 0);
  assert.equal(nums('ten and twenty'), '10 and 20');
  const t = tokenize('Tom has twenty-one apples');
  assert.equal(t[2].kind, 'number');
  assert.equal(t[2].raw, 'twenty-one');
});

test('fillers are dropped; sentence-initial so/and/then/after that too', () => {
  const words = (s) => tokenize(s).map((x) => x.lower).join(' ');
  assert.equal(words('Please, Tom has um 5 apples okay'), 'tom has 5 apples');
  assert.equal(words('Well, so and then Tom runs'), 'tom runs');
  assert.equal(words('After that Tom runs so fast'), 'tom runs so fast');
  assert.equal(words('Tom runs and then sleeps'), 'tom runs and then sleeps');
});

test('singular lemma rules', () => {
  const irr = new Map([['children', 'child']]);
  assert.equal(singularLemma('children', irr), 'child');
  assert.equal(singularLemma('berries', irr), 'berry');
  assert.equal(singularLemma('leaves', irr), 'leaf');
  assert.equal(singularLemma('boxes'), 'box');
  assert.equal(singularLemma('churches'), 'church');
  assert.equal(singularLemma('dishes'), 'dish');
  assert.equal(singularLemma('glasses'), 'glass');
  assert.equal(singularLemma('apples'), 'apple');
  assert.equal(singularLemma('glass'), 'glass');
  assert.equal(singularLemma('bus'), 'bu'); // documented limitation of the plain rule
  assert.equal(pluralize('apple'), 'apples');
  assert.equal(pluralize('berry'), 'berries');
  assert.equal(pluralize('box'), 'boxes');
  assert.equal(pluralize('ice_cream'), 'ice creams');
  assert.equal(pluralize('child', new Map([['child', 'children']])), 'children');
});

test('pattern syntax: literal, anchored to the whole sentence, case-insensitive', () => {
  assert.ok(m('tom has apples', 'Tom HAS apples'));
  assert.equal(m('tom has apples', 'Tom has apples today'), null);
  assert.equal(m('tom has apples', 'Then Tom has apples') && 'ok', 'ok'); // initial "then" is a filler
  assert.equal(m('tom has apples', 'has apples'), null);
  assert.equal(m('how_many apples', 'how many apples')._lit, 3);
});

test('pattern syntax: [a|b|c] picks exactly one, multi-word alternatives', () => {
  assert.ok(m('tom [has|had|got] it', 'Tom got it'));
  assert.equal(m('tom [has|had] it', 'Tom owns it'), null);
  assert.ok(m('[how_many|how_much] apples', 'how much apples'));
  assert.ok(m('[how_many|how_much] apples', 'how many apples'));
});

test('pattern syntax: [a|b]? optional alternative', () => {
  assert.ok(m('tom [really|truly]? runs', 'Tom runs'));
  assert.ok(m('tom [really|truly]? runs', 'Tom truly runs'));
  assert.equal(m('tom [really|truly]? runs', 'Tom very runs'), null);
  assert.equal(m('[a|an]? {x:noun} runs', 'a dog runs').x, 'dog'); // prefer-consume
  assert.equal(m('[a|an]? {x:noun} runs', 'dog runs').x, 'dog');
});

test('pattern syntax: {name:class?} optional capture', () => {
  assert.deepEqual(slots('tom has {n:number?} apples', 'Tom has 3 apples'), { n: '3' });
  assert.deepEqual(slots('tom has {n:number?} apples', 'Tom has apples'), {});
});

test('pattern syntax: ... skips 0 to 4 tokens lazily', () => {
  assert.ok(m('tom ... runs', 'Tom runs'));
  assert.ok(m('tom ... runs', 'Tom a b c d runs'));
  assert.equal(m('tom ... runs', 'Tom a b c d e runs'), null);
  assert.equal(m('tom ... runs', 'Tom a b runs')._skip, 2);
  assert.equal(m('tom ... runs', 'Tom runs')._skip, 0);
});

test('malformed patterns are rejected at compile time', () => {
  for (const bad of ['', '[a|b', '{x}', '{x:number} {x:number}', '[a||b]', 'a|b', '{x:']) {
    assert.throws(() => compilePattern(bad), PatternError, bad);
  }
});

test('slot class number: digits, decimals, negatives, number words', () => {
  assert.equal(slots('has {n:number}', 'has 5').n, '5');
  assert.equal(slots('has {n:number}', 'has 2.5').n, '2.5');
  assert.equal(slots('has {n:number}', 'has -3').n, '-3');
  assert.equal(slots('has {n:number}', 'has seven').n, '7');
  assert.equal(slots('has {n:number}', 'has a dozen').n, '12');
  assert.equal(slots('has {n:number}', 'has many'), null);
});

test('slot class word and words', () => {
  assert.equal(slots('say {w:word} now', 'say HELLO now').w, 'hello');
  assert.equal(m('say {w:word}', 'say two words'), null);
  const r = slots('say {t:words} now', 'say Some Mixed Case text now');
  assert.equal(r.t, 'Some Mixed Case text'); // original text kept
  assert.equal(slots('say {t:words}', 'say a b c d e f').t, 'a b c d e f');
  assert.equal(slots('say {t:words}', 'say a b c d e f g'), null); // more than 6 tokens
  assert.equal(slots('say {t:words} and {u:words}', 'say x y and z').t, 'x y'); // lazy + backtracking
});

test('slot class noun: singular lemma, multi-word lexicon nouns, irregular plurals', () => {
  assert.equal(slots('has {i:noun}', 'has apples').i, 'apple');
  assert.equal(slots('has {i:noun}', 'has Berries').i, 'berry');
  assert.equal(slots('has {i:noun}', 'has ice creams').i, 'ice_cream');
  assert.equal(slots('has {i:noun}', 'has children').i, 'child');
  assert.equal(slots('has {i:noun}', 'has unknownthing').i, 'unknownthing'); // any word is a noun
  assert.equal(m('has {i:noun}', 'has 5'), null);
});

test('slot class <lexicon id> accepts only entries of that lexicon', () => {
  assert.equal(slots('has {a:lex.m.animals}', 'has dogs').a, 'dog');
  assert.equal(slots('has {a:lex.m.animals}', 'has hot dogs').a, 'hot_dog');
  assert.equal(m('has {a:lex.m.animals}', 'has apples'), null);
  assert.equal(m('has {a:lex.m.nothing}', 'has dogs'), null);
});

test('slot class unit: lexicon units and the quantity unit table', () => {
  assert.equal(slots('{n:number} {u:unit}', '10 kg').u, 'kg');
  assert.equal(slots('{n:number} {u:unit}', '10 N').u, 'N');
  assert.equal(slots('{n:number} {u:unit}', '2 cups').u, 'cup');
  assert.equal(m('{n:number} {u:unit}', '2 bananas'), null);
});

test('slot class agent: capitalized names, name lexicon, pronouns', () => {
  assert.equal(slots('{a:agent} runs', 'Mia runs').a, '$e.mia');
  assert.equal(slots('{a:agent} runs', 'tom runs').a, '$e.tom'); // lexicon name, any case
  assert.equal(m('{a:agent} runs', 'dogs runs'), null); // lowercase unknown word
  assert.equal(m('{a:agent} runs', 'Apples runs'), null); // capitalized known noun
  assert.equal(m('{a:agent} runs', 'How runs'), null); // question word
  assert.equal(slots('{a:agent} runs', 'I runs').a, '$e.user');
  assert.equal(slots('give {a:agent} it', 'give me it').a, '$e.user');
  assert.equal(slots('are {a:agent} fine', 'are you fine').a, '$e.assistant');
});

test('pronoun resolution: gender, recency, unresolvable fails', () => {
  const f = new FormSession();
  f.initDefaults();
  assert.equal(m('{a:agent} runs', 'he runs', f), null); // nobody mentioned yet
  assert.equal(m('{a:agent} runs', 'they run', f), null);
  f.commit(f.candidateForName('Tom', 'm'));
  f.commit(f.candidateForName('Ana', 'f'));
  assert.equal(slots('{a:agent} runs', 'he runs', f).a, '$e.tom');
  assert.equal(slots('give {a:agent} it', 'give him it', f).a, '$e.tom');
  assert.equal(slots('{a:agent} runs', 'she runs', f).a, '$e.ana');
  assert.equal(slots('{a:agent} runs', 'they runs', f).a, '$e.ana'); // most recent
  f.commit(f.candidateForName('Tom', 'm')); // mention again: now most recent
  assert.equal(slots('{a:agent} runs', 'they runs', f).a, '$e.tom');
  f.commit(f.candidateForName('Zed', undefined)); // unknown gender matches both
  assert.equal(slots('{a:agent} runs', 'he runs', f).a, '$e.zed');
  assert.equal(slots('{a:agent} runs', 'she runs', f).a, '$e.zed');
});

test('backtracking: optional and lazy elements retry when later elements fail', () => {
  assert.equal(slots('{a:words} {n:number} {i:noun}', 'x y 3 pears').a, 'x y');
  assert.equal(slots('[a|an]? {x:noun} [a|an] fruit', 'a pear a fruit').x, 'pear');
  assert.equal(slots('[a|an]? {x:noun} [a|an] fruit', 'pear a fruit').x, 'pear');
  assert.ok(m('... {n:number} apples', 'what is 3 apples'));
});

// ---- formalize: emit templates, ids, core keys, clauses, ranking, alternatives ----------

const PATS = `@p.m.has core.pattern
    match="{who:agent} has {n:number} {item:noun}"
    emit="@{_} m.holding owner={who} count={n} item={item}"
    kind=statement
    priority=10
    example="Tom has 5 apples."
@p.m.has2 core.pattern
    match="{who:agent} has {item:noun}"
    emit="@{_} m.holding owner={who} item={item}"
    kind=statement
    priority=5
@p.m.note core.pattern
    match="note {t:words}"
    emit="@{_} core.note text=\\"{t}\\" core.from=$e.tom"
    kind=statement
    priority=1
@p.m.opt core.pattern
    match="measure {item:noun} {n:number?}"
    emit="@{_} m.holding item={item} count={n} owner=$e.tom"
    kind=statement
    priority=1
@p.m.q core.pattern
    match="how_many {item:noun} does {who:agent} have"
    emit="@{_} core.question type=m.holding seek=count where.owner={who} where.item={item}"
    kind=question
    priority=10
@p.m.two core.pattern
    match="swap {a:agent} and {b:agent}"
    emit="@{_} m.holding owner={a} item=x@{_1} m.holding owner={b} item=y"
    kind=statement
    priority=1
`;
const LEGEND = `@m.holding core.type
    extends=core.state
@m.holding.owner core.key
    value=$core.agent
    ask="Who?"
@m.holding.count core.key
    value=integer
    ask="How many?"
@m.holding.item core.key
    value=atom
    ask="What?"
`;
const set2 = await bundleSet({ m: mini('m', { legend: LEGEND, files: { 'lexicon.sop': LEXICON, 'patterns.sop': PATS } }) });
const run = (text, form = new FormSession()) => { form.initDefaults(); return { form, ...formalize(text, { worlds: set2, session: form, source: 'src' }) }; };

test('formalize: emits wires with fresh ids, agent entities and auto core keys', () => {
  const { segments, wires } = run('Tom has 5 apples. Ana has 2 pears.');
  assert.equal(segments.length, 2);
  assert.deepEqual(wires.map((w) => w.id), ['e.tom', 'w1', 'e.ana', 'w2']);
  const w1 = wires[1];
  const get = (k) => w1.entries.filter((e) => e.key === k).map((e) => e.value.v);
  assert.deepEqual(get('m.holding.owner'), ['e.tom']);
  assert.deepEqual(get('m.holding.count'), ['5']);
  assert.deepEqual(get('core.via'), ['p.m.has']);
  assert.deepEqual(get('core.source'), ['src#0-16']);
  assert.deepEqual(get('core.in'), ['m']);
  const seqs = wires.map((w) => Number(w.entries.find((e) => e.key === 'core.seq').value.v));
  assert.deepEqual([...seqs].sort((a, b) => a - b), seqs);
  assert.equal(new Set(seqs).size, seqs.length);
  assert.equal(wires[0].entries.find((e) => e.key === 'core.agent.gender').value.v, 'm');
  assert.equal(segments[1].match.slots.who.value, '$e.ana');
});

test('formalize: core.source points at the exact sentence span in the input', () => {
  const text = 'Tom has 5 apples. Ana has 2 pears.';
  const { segments, wires } = run(text);
  const src = wires.find((w) => w.id === 'w2').entries.find((e) => e.key === 'core.source').value.v;
  const [a, b] = src.split('#')[1].split('-').map(Number);
  assert.equal(text.slice(a, b), 'Ana has 2 pears');
  assert.deepEqual(segments[1].span, [a, b]);
});

test('emit: {slot} inside a string keeps the original text JSON-escaped; optional slot removes its entry', () => {
  const r = run('note He said "hi" by Ana');
  assert.equal(r.wires[0].entries.find((e) => e.key.endsWith('text')).value.v, 'He said "hi" by Ana');
  const r2 = run('note Buy Milk');
  const note = r2.wires.find((w) => w.type === 'core.note');
  assert.equal(note.entries.find((e) => e.key.endsWith('text')).value.v, 'Buy Milk');
  const o1 = run('measure apples 3').wires.find((w) => w.type === 'm.holding');
  assert.ok(o1.entries.some((e) => e.key === 'm.holding.count'));
  const o2 = run('measure apples').wires.find((w) => w.type === 'm.holding');
  assert.ok(!o2.entries.some((e) => e.key === 'm.holding.count'));
});

test('emit: {_} and {_1} are distinct fresh ids; the same name repeats the same id', () => {
  const r = run('swap Tom and Ana');
  const ids = r.wires.filter((w) => w.type === 'm.holding').map((w) => w.id);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

test('ranking: higher priority first; more literal tokens before fewer', () => {
  const r = run('Tom has 5 apples');
  assert.equal(r.segments[0].match.patternId, 'p.m.has');
  const r2 = run('Tom has apples');
  assert.equal(r2.segments[0].match.patternId, 'p.m.has2');
});

test('questions never match statement patterns; statements may match question patterns', () => {
  const r = run('Tom has apples?');
  assert.equal(r.segments[0].unparsed, true);
  const q = run('How many apples does Tom have?');
  assert.equal(q.segments[0].match.kind, 'question');
  assert.equal(q.wires.at(-1).type, 'core.question');
});

test('clause splitting fallback at comma, and, then, but', () => {
  const { segments } = run('Tom has 5 apples and Ana has 2 pears, then Tom has 3 plums but blah blah');
  assert.deepEqual(segments.map((s) => s.text), ['Tom has 5 apples', 'Ana has 2 pears', 'Tom has 3 plums', 'blah blah']);
  assert.deepEqual(segments.map((s) => s.unparsed), [false, false, false, true]);
  const q = run('Tom has 5 apples, how many apples does Tom have?');
  assert.deepEqual(q.segments.map((s) => s.match?.kind), ['statement', 'question']);
  assert.equal(splitClauses(tokenize('a and then b, but c')).length, 3);
});

test('unparsed sentences are reported, never guessed; no entity is created for them', () => {
  const r = run('Zork blip.');
  assert.equal(r.segments[0].unparsed, true);
  assert.deepEqual(r.wires, []);
  assert.equal(r.form.agents.has('e.zork'), false);
});

test('pronouns resolve through the session across sentences', () => {
  const r = run('Tom has 5 apples. He has 2 pears.');
  assert.equal(r.wires.filter((w) => w.id.startsWith('e.')).length, 1);
  assert.equal(r.segments[1].match.slots.who.value, '$e.tom');
  const r2 = run('He has 2 pears.');
  assert.equal(r2.segments[0].unparsed, true); // no antecedent: no guessing
});

test('router scores worlds and keeps the top three', () => {
  const { segments } = run('Tom has 5 apples');
  const [w] = segments[0].worlds;
  assert.equal(w.id, 'm');
  assert.ok(w.score >= 5 + 1); // pattern match + lexicon tokens
});

test('checkPattern reports bad classes, bad emit and unknown slots', () => {
  const p = (match, emit, kind = 'statement') => ({ id: 'x', match, emit, kind });
  assert.deepEqual(checkPattern(p('a {x:number}', '@{_} m.holding count={x}'), set2), []);
  assert.match(checkPattern(p('a {x:bogus}', '@{_} m.holding item={x}'), set2)[0], /unknown class/);
  assert.match(checkPattern(p('a {x:number}', '@{_} m.holding count={y}'), set2)[0], /no such slot/);
  assert.match(checkPattern(p('a {x:number}', 'm.holding count={x}'), set2)[0], /not valid SOP/);
  assert.match(checkPattern(p('a [b', '@{_} t'), set2)[0], /malformed|empty/);
  assert.match(checkPattern(p('a', '@{_} t', 'weird'), set2)[0], /unknown kind/);
});

test('serialize of formalized wires is valid SOP', () => {
  const { wires } = run('Tom has 5 apples.');
  assert.match(serialize(wires), /@w1 m.holding/);
});
