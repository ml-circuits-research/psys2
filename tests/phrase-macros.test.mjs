import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleSet, mini } from './helpers.mjs';
import { tokenize, compilePattern, matchTokens, FormSession, makeEnv, checkPattern, vocabularyOf, formalize } from '../src/formalizer/rules/index.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';
import { PatternError } from '../src/formalizer/rules/matcher.mjs';
import { validateWorldSet } from '../src/worlds/validate.mjs';

const LEX = `@phrase.t.lead core.phrase
    alt=would_you_kindly alt=can_you alt=kindly
@phrase.t.tail core.phrase
    alt=right_away alt=quickly
@lex.t.colour core.lexicon
    class=noun
    word=red word=green word=navy
@lex.t.shade core.lexicon
    class=noun
    extends=$lex.t.colour
    exclude=navy
    word=teal
`;
const PATTERNS = `@pat.t.paint core.pattern
    match="[$t.lead]? paint {c:lex.t.shade} [$t.tail]?"
    emit="@{_} core.agent name={c}"
    kind=request
@pat.t.bad core.pattern
    match="[$t.nope]? paint {c:word}"
    emit="@{_} core.agent name={c}"
    kind=request
`;
const set = await bundleSet({ t: mini('t', { files: { 'lexicon.sop': LEX, 'patterns.sop': PATTERNS } }), u: mini('u', { imports: ['core'], files: { 'patterns.sop': '' } }) });
const lex = lexIndex(set);
const run = (match, text) => {
  const toks = tokenize(text, 0).filter((t) => t.kind !== 'punct');
  return matchTokens(compilePattern(match, lex.phrases), toks, makeEnv(text, set, new FormSession(), lex));
};

test('phrases load from lexicon.sop', () => {
  assert.deepEqual(lex.phrases.get('t.lead').alts, [['would', 'you', 'kindly'], ['can', 'you'], ['kindly']]);
  assert.equal(lex.phrases.get('t.lead').worldId, 't');
});

test('[$id] expands to the alternatives (shared array)', () => {
  const c = compilePattern('[$t.lead] paint', lex.phrases);
  assert.equal(c.elements[0].alts, lex.phrases.get('t.lead').alts);
  assert.ok(run('[$t.lead] paint', 'would you kindly paint'));
  assert.ok(run('[$t.lead] paint', 'kindly paint'));
  assert.equal(run('[$t.lead] paint', 'paint'), null);
});

test('optional macro and frame literal counts', () => {
  const a = run('[$t.lead]? paint', 'paint');
  assert.deepEqual([a.literals, a.frameLiterals], [1, 0]);
  const b = run('[$t.lead]? paint', 'can you paint');
  assert.deepEqual([b.literals, b.frameLiterals], [3, 2]);
  const c = run('[$t.lead]? paint [$t.tail]?', 'kindly paint right away');
  assert.deepEqual([c.literals, c.frameLiterals], [4, 3]);
});

test('mixed macro and literal alternatives', () => {
  assert.ok(run('[$t.tail|hastily]? paint', 'hastily paint'));
  const r = run('[$t.tail|hastily] paint', 'hastily paint');
  assert.deepEqual([r.literals, r.frameLiterals], [2, 0]);
  const r2 = run('[$t.tail|hastily] paint', 'quickly paint');
  assert.deepEqual([r2.literals, r2.frameLiterals], [2, 1]);
  assert.ok(run('[$t.tail|$t.lead] paint', 'kindly paint'));
});

test('unknown macro id is an error', () => {
  assert.throws(() => compilePattern('[$nope] paint', lex.phrases), PatternError);
  assert.throws(() => compilePattern('[$t.lead] paint'), /unknown phrase/);
  assert.throws(() => compilePattern('[$] paint', lex.phrases), PatternError);
  const bad = set.get('t').patterns.find((p) => p.id === 'pat.t.bad');
  assert.match(checkPattern(bad, set)[0], /unknown phrase '\$t\.nope'/);
});

test('a world must import the phrase owner', () => {
  const p = { id: 'x', worldId: 'u', match: '[$t.lead] paint {c:word}', emit: '@{_} core.agent name={c}', kind: 'request' };
  assert.match(checkPattern(p, set).join(), /does not import/);
  assert.deepEqual(checkPattern({ ...p, worldId: 't' }, set), []);
});

test('vocabularyOf includes macro words; formalize uses the macro', () => {
  const v = vocabularyOf(set);
  assert.ok(v.has("would"), [...v].slice(0, 20).join());
  assert.ok(v.has("quickly"));
  const r = formalize('would you kindly paint teal right away', { worlds: set, session: new FormSession() });
  assert.ok(!r.segments[0].unparsed, JSON.stringify(r.segments[0]).slice(0, 600));
});

test('lexicon extends / exclude', () => {
  const words = [...lex.lexicons.get('lex.t.shade').words].sort();
  assert.deepEqual(words, ['green', 'red', 'teal']);
});

test('validateWorldSet reports load errors of lexicon extends', async () => {
  const s2 = await bundleSet({ t: mini('t', { files: { 'lexicon.sop': '@lex.t.a core.lexicon\n    class=noun\n    extends=$lex.t.zzz\n    word=x\n' } }) });
  assert.ok(validateWorldSet(s2).some((m) => /extends unknown lexicon/.test(m)));
});
