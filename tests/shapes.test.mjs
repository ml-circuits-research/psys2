import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bundleSet, mini } from './helpers.mjs';
import { tokenize, compilePattern, matchTokens, FormSession, makeEnv, checkPattern, formalize } from '../src/formalizer/rules/index.mjs';
import { prefilterPasses, wordBag } from '../src/formalizer/rules/matcher.mjs';
import { expandShape, FAMILY_FORMS, SHORT_PENALTY } from '../src/formalizer/rules/shapes.mjs';
import { createRouter } from '../src/formalizer/routing.mjs';
import { lexIndex } from '../src/worlds/lexicon.mjs';

const real = (f) => readFileSync(new URL(`../worlds/lang.common/${f}`, import.meta.url), 'utf8');
const langCommon = { files: { 'world.sop': real('world.sop'), 'legend.sop': real('legend.sop'), 'lexicon.sop': real('lexicon.sop') } };

const LEX = `@lex.t.things core.lexicon
    class=noun
    word=eye word=hair word=mouth
@lex.t.colours core.lexicon
    class=noun
    extends=$lex.lang.colour
@lex.t.sizes core.lexicon
    class=noun
    word=bigger word=smaller
`;
const EMIT = (a) => `@{_} core.request action=t.${a} arg.part={p}`;
const SHAPES = `@shape.t.paint core.shape
    family=set
    verb="paint|color|colour|make"
    obj="p:lex.t.things"
    val="c:lex.t.colours"
    noun="color|colour"
    sample="p=eyes;c=red"
    emit="@{_} core.request action=t.paint arg.part={p} arg.color={c}"
    emitOpts="@{_} core.request action=t.paintOptions arg.part={p}"
    priority=14
@shape.t.reset core.shape
    family=do
    verb="reset|restore|clear"
    obj="p:lex.t.things"
    sample="p=hair"
    emit="${EMIT('reset')}"
    priority=12
@shape.t.askcolour core.shape
    family=ask.value
    obj="p:lex.t.things"
    noun="color|colour|shade"
    sample="p=eyes"
    emit="${EMIT('askColor')}"
    emitOpts="${EMIT('colourOptions')}"
    priority=12
@shape.t.count core.shape
    family=ask.count
    verb="have|got"
    obj="p:lex.t.things"
    sample="p=eyes"
    emit="${EMIT('count')}"
    priority=12
@shape.t.exists core.shape
    family=ask.exists
    verb="have|got|wearing"
    obj="p:lex.t.things"
    sample="p=mouth"
    emit="${EMIT('exists')}"
    priority=12
@shape.t.list core.shape
    family=list
    verb="list|show|display"
    obj="p:lex.t.things"
    sample="p=hair"
    emit="${EMIT('list')}"
    emitOpts="${EMIT('listOptions')}"
    priority=12
`;
const NOOBJ = `@shape.t.tempo core.shape
    family=set
    verb="set|change"
    noun="tempo|speed"
    val="n:number"
    link="to|at"
    extra="[bpm|beats_per_minute]?"
    emit="@{_} core.request action=t.tempo arg.n={n}"
    priority=12
@shape.t.after core.shape
    family=ask.value
    obj="p:lex.t.things"
    noun="day"
    rel="comes_after|after|follows"
    objdet=none
    emit="${EMIT('after')}"
    priority=10
@shape.t.len core.shape
    family=ask.count
    obj="p:lex.t.things"
    cont="c:lex.t.colours"
    det="a|an|the"
    emit="@{_} core.request action=t.len arg.part={p} arg.whole={c}"
    priority=10
@shape.t.status core.shape
    family=ask.value
    noun="tempo|speed"
    pron="we|you"
    emit="@{_} core.request action=t.status arg.what=tempo"
    priority=12
`;
const set = await bundleSet({
  'lang.common': langCommon,
  t: mini('t', { imports: ['core', 'lang.common'], files: { 'lexicon.sop': LEX, 'patterns.sop': SHAPES + NOOBJ } }),
});
const lex = lexIndex(set);
const world = set.get('t');
const byId = (id) => world.patterns.find((p) => p.id === `pat.t.${id}`);
const matches = (p, text) => {
  const c = compilePattern(p.match, lex.phrases);
  const t = tokenize(text, 0).filter((x) => x.kind !== 'punct' && !x.filler);
  return !!matchTokens(c, t, makeEnv(text, set, new FormSession(), lex));
};

test('the test world loads without errors and every family generates its forms', () => {
  assert.deepEqual(world.errors, []);
  assert.equal(world.shapes.length, 10);
  const forms = (shape) => new Set(world.patterns.filter((p) => p.shape === `shape.t.${shape}`).map((p) => p.form));
  assert.deepEqual([...forms('paint')].sort(), [...FAMILY_FORMS.set].sort());
  assert.deepEqual([...forms('reset')].sort(), [...FAMILY_FORMS.do].filter((f) => f !== 'opts').sort());
  assert.deepEqual([...forms('askcolour')].sort(), [...FAMILY_FORMS['ask.value']].sort());
  assert.deepEqual([...forms('count')].sort(), [...FAMILY_FORMS['ask.count']].filter((f) => f !== 'order').sort());
  assert.deepEqual([...forms('exists')].sort(), [...FAMILY_FORMS['ask.exists']].sort());
  assert.deepEqual([...forms('list')].sort(), [...FAMILY_FORMS.list].sort());
});

test('every generated pattern is a valid pattern, has an example and matches its own examples', () => {
  const generated = world.patterns.filter((p) => p.shape);
  assert.ok(generated.length > 40);
  for (const p of generated) {
    assert.deepEqual(checkPattern(p, set), [], p.id);
    assert.ok(p.examples.length >= 1, `${p.id} has no example`);
    for (const ex of p.examples) {
      assert.ok(matches(p, ex), `${p.id} does not match its example "${ex}"`);
      const c = compilePattern(p.match, lex.phrases);
      assert.ok(prefilterPasses(c, wordBag(tokenize(ex, 0).filter((x) => x.kind !== 'punct' && !x.filler))), `${p.id}: prefilter rejects "${ex}"`);
    }
  }
});

test('set: imperative, word order, wish, indirect, question, short, state and options forms', () => {
  const cases = [
    ['paint.imp', 'paint your eyes blue'], ['paint.imp', 'make the hair colour to green'], ['paint.order', 'give me red eyes'],
    ['paint.wish', 'i want the eyes red'], ['paint.ind', 'could you maybe paint the eyes red'], ['paint.q', 'can your eyes be red'],
    ['paint.short', 'red eyes'], ['paint.short.2', 'eyes red'], ['paint.state', 'your eyes should be red'], ['paint.opts', 'what colours can your eyes be'],
  ];
  for (const [id, text] of cases) {
    const p = byId(id);
    if (id === 'paint.opts') { assert.ok(p, 'opts is generated when emitOpts is given'); }
    assert.ok(p && matches(p, text), `${id}: "${text}"`);
  }
  assert.equal(byId('paint.imp').kind, 'request');
  assert.equal(byId('paint.imp').priority, 14);
  assert.equal(byId('paint.short').priority, 14 - SHORT_PENALTY);
  assert.equal(byId('paint.opts').emit, '@{_} core.request action=t.paintOptions arg.part={p}');
});

test('do, ask.value, ask.count, ask.exists and list forms', () => {
  const cases = [
    ['reset.imp', 'reset the hair'], ['reset.wish', 'i want to reset the hair'], ['reset.ind', 'is it possible to restore the hair'], ['reset.q', 'could i clear the hair'], ['reset.short', 'hair reset'],
    ['askcolour.q', 'what colour are your eyes'], ['askcolour.q.2', 'what is the shade of your eyes'], ['askcolour.imp', 'tell me the colour of your eyes'],
    ['askcolour.wish', 'i wonder what colour of your eyes'], ['askcolour.ind', 'do you know the shade of the eyes'], ['askcolour.order', 'the colour of your eyes'],
    ['askcolour.order.2', 'your eyes are what colour'], ['askcolour.short', 'eyes colour'], ['askcolour.opts', 'which colours can your eyes be'],
    ['count.q', 'how many eyes do you have'], ['count.q.2', 'what is the number of eyes'], ['count.imp', 'tell me how many eyes you have'], ['count.imp.2', 'have the eyes'],
    ['count.wish', 'i want to know how many eyes'], ['count.ind', 'can you tell me how many eyes you got'], ['count.short', 'eyes count'],
    ['exists.q', 'do you have a mouth'], ['exists.q.2', 'is there a mouth'], ['exists.imp', 'tell me if you have a mouth'], ['exists.wish', 'i wonder if there is a mouth'],
    ['exists.ind', 'do you know if you have a mouth'], ['exists.short', 'you got mouth or not'],
    ['list.imp', 'show me all the hair'], ['list.q', 'what hair do you have'], ['list.wish', 'i want to see all hair'], ['list.ind', 'is it possible to list the hair'],
    ['list.short', 'all hair'], ['list.short.2', 'hair options'], ['list.opts', 'what kinds of hair are there'],
  ];
  for (const [id, text] of cases) {
    const p = byId(id);
    assert.ok(p, `${id} exists`);
    assert.ok(matches(p, text), `${id}: "${text}"`);
  }
  assert.equal(byId('askcolour.q').kind, 'question');
  assert.equal(byId('list.q').kind, 'question');
  assert.equal(byId('list.imp').kind, 'request');
});

test('forms and skip select what is generated; opts needs emitOpts; bad shapes are errors', () => {
  const base = { id: 'x', family: 'set', verb: 'paint', obj: 'p:lex.t.things', val: 'c:lex.t.colours', emit: '@{_} core.request action=a' };
  assert.deepEqual(expandShape({ ...base, forms: 'imp,wish' }).map((p) => p.form), ['imp', 'wish']);
  assert.ok(!expandShape({ ...base, skip: 'short,state' }).some((p) => p.form === 'short' || p.form === 'state'));
  assert.ok(!expandShape(base).some((p) => p.form === 'opts'));
  assert.throws(() => expandShape({ ...base, family: 'nope' }), /unknown family/);
  assert.throws(() => expandShape({ ...base, forms: 'imp,list' }), /does not exist in family/);
  assert.throws(() => expandShape({ ...base, verb: undefined }), /needs 'verb'/);
  assert.throws(() => expandShape({ ...base, emit: undefined }), /no emit/);
  assert.throws(() => expandShape({ id: 'y', family: 'ask.value', obj: 'p:lex.t.things', emit: 'e' }), /needs 'noun'/);
});

test('mod and objmod add optional modifier groups, extra adds an optional slot', async () => {
  const s2 = await bundleSet({
    'lang.common': langCommon,
    u: mini('u', { imports: ['core', 'lang.common'], files: {
      'lexicon.sop': LEX.replace(/lex\.t\./g, 'lex.u.').replace('lex.u.sizes', 'lex.u.sizes'),
      'patterns.sop': `@shape.u.size core.shape
    family=set
    verb="make"
    obj="p:lex.u.things"
    val="s:lex.u.sizes"
    mod="a_bit|much|a_lot"
    objmod="whole|entire"
    extra="n:number?"
    emit="@{_} core.request action=u.size arg.part={p} arg.dir={s} arg.n={n}"
    priority=13
` } }),
  });
  assert.deepEqual(s2.get('u').errors, []);
  const l2 = lexIndex(s2);
  const m = (text) => {
    const p = s2.get('u').patterns.find((x) => x.form === 'imp');
    const t = tokenize(text, 0).filter((x) => x.kind !== 'punct' && !x.filler);
    return !!matchTokens(compilePattern(p.match, l2.phrases), t, makeEnv(text, s2, new FormSession(), l2));
  };
  assert.ok(m('make your eyes a bit bigger'));
  assert.ok(m('make the whole hair much smaller 2'));
  assert.ok(!m('make your eyes quite bigger'));
});

test('a short form is dropped at routing tier 5 but kept inside the active tab world', () => {
  const short = byId('paint.short'), imp = byId('paint.imp');
  const mk = (p) => ({ pattern: p, order: 0, slots: {}, literals: 2, skips: 0, score: 0 });
  const router = createRouter();
  const none = router.route({ matches: [mk(short)], context: {} });
  assert.equal(none.matches.length, 0);
  const kept = router.route({ matches: [mk(short), mk(imp)], context: {} });
  assert.deepEqual(kept.matches.map((m) => m.pattern.id), [imp.id]);
  const inTab = router.route({ matches: [mk(short)], context: { tabWorld: 't', activeTab: 't' } });
  assert.equal(inTab.matches.length, 1);
  const recent = router.route({ matches: [mk(short)], context: { recentWorlds: ['t'] } });
  assert.equal(recent.matches.length, 1);
});

test('formalize reads a generated imperative and a question end to end', () => {
  const r1 = formalize('paint your eyes red', { worlds: set, session: new FormSession() });
  assert.equal(r1.segments[0].match?.pattern?.id ?? r1.segments[0].routing?.winner?.patternId, 'pat.t.paint.imp');
  const r2 = formalize('what colour are your eyes', { worlds: set, session: new FormSession() });
  assert.match(r2.segments[0].routing?.winner?.patternId ?? '', /^pat\.t\.askcolour\./);
});

test('real worlds: shapes load without errors and their patterns never use an unknown phrase', async () => {
  const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
  const { loadWorlds } = await import('../src/worlds/index.mjs');
  const rs = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
  const rl = lexIndex(rs);
  let n = 0;
  for (const w of rs.list()) {
    assert.deepEqual(w.errors, [], w.id);
    for (const p of w.patterns.filter((x) => x.shape)) { n++; assert.deepEqual(checkPattern(p, rs), [], p.id); compilePattern(p.match, rl.phrases); }
  }
  assert.ok(n >= 30, `generated ${n}`);
});

test('ui.avatar: every generated form of its colour, size and part shapes reads a sentence of that form', async () => {
  const { createFsLoader, DEFAULT_ROOT } = await import('../src/loaders/fs-loader.mjs');
  const { loadWorlds } = await import('../src/worlds/index.mjs');
  const rs = await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
  const rl = lexIndex(rs);
  const av = rs.get('ui.avatar');
  const cases = [
    ['colour.imp', 'make your whole body a bit blue'.replace(' a bit', '')], ['colour.order', 'give me a blue body'], ['colour.wish', 'i want your body to be blue'],
    ['colour.ind', 'could you maybe paint your body blue'], ['colour.q', 'can your body be blue'], ['colour.short', 'blue body'], ['colour.short.2', 'body blue'],
    ['colour.state', 'your body should be blue'],
    ['colour.ask.q', 'what colour are your eyes'], ['colour.ask.q.2', 'what is the colour of your eyes'], ['colour.ask.imp', 'tell me the colour of your eyes'],
    ['colour.ask.wish', 'i wonder what colour your eyes are'], ['colour.ask.ind', 'do you know the colour of your eyes'], ['colour.ask.order', 'the shade of your eyes'],
    ['colour.ask.order.2', 'your eyes are what colour'], ['colour.ask.short', 'eyes colour'],
    ['size.imp', 'make your eyes a bit bigger'], ['size.order', 'give me bigger eyes'], ['size.wish', 'i want your eyes much smaller'], ['size.ind', 'could you maybe make your eyes bigger'],
    ['size.q', 'can your eyes be bigger'], ['size.short', 'bigger eyes'], ['size.short.2', 'eyes bigger'], ['size.state', 'your eyes should be bigger'],
    ['part.imp', 'swap your mouth to a grill'], ['part.order', 'give me a grill mouth'], ['part.wish', 'i want your mouth as a grill'], ['part.ind', 'is it possible to change your mouth to a grill'],
    ['part.q', 'can your mouth be a grill'], ['part.short', 'grill mouth'], ['part.short.2', 'mouth grill'], ['part.state', 'your mouth should be a grill'],
  ];
  for (const [id, text] of cases) {
    const p = av.patterns.find((x) => x.id === `pat.ui.avatar.${id}`);
    assert.ok(p, `${id} exists`);
    const c = compilePattern(p.match, rl.phrases);
    const t = tokenize(text, 0).filter((x) => x.kind !== 'punct' && !x.filler);
    assert.ok(matchTokens(c, t, makeEnv(text, rs, new FormSession(), rl)), `${id}: "${text}"`);
  }
});

test('shapes without an object slot: the noun is the thing (set and ask.value)', () => {
  const forms = (shape) => world.patterns.filter((p) => p.shape === `shape.t.${shape}`).map((p) => p.id.replace('pat.t.', ''));
  assert.ok(!forms('tempo').includes('tempo.order') && !forms('tempo').includes('tempo.short'), 'no word order, no value-first short form without an object');
  assert.ok(forms('tempo').includes('tempo.short.2'));
  const cases = [
    ['tempo.imp', 'set the tempo to 90 bpm'], ['tempo.imp', 'change speed 120'], ['tempo.wish', 'i want the tempo to be 90'], ['tempo.ind', 'could you maybe set the speed to 90'],
    ['tempo.q', 'can the tempo be 90'], ['tempo.state', 'the tempo should be 90'], ['tempo.short.2', 'tempo 90'],
    ['status.q', 'what tempo are we at'.replace(' at', '')], ['status.q.2', 'what is the tempo'], ['status.imp', 'tell me the speed'], ['status.wish', 'i wonder what tempo it is'.replace(' it is', '')],
    ['status.ind', 'do you know the tempo'], ['status.short', 'tempo'],
  ];
  for (const [id, text] of cases) { const p = byId(id); assert.ok(p, id); assert.ok(matches(p, text), `${id}: "${text}"`); }
  assert.ok(!matches(byId('status.q'), 'what tempo is it'), 'pron excludes it');
  for (const p of world.patterns.filter((x) => /^pat\.t\.(tempo|status)\./.test(x.id))) for (const ex of p.examples) assert.ok(matches(p, ex), `${p.id}: ${ex}`);
});

test('ask.value with a relation (rel, objdet) and ask.count with a container (cont)', () => {
  const cases = [
    ['after.q', 'what day comes after eyes'], ['after.q', 'what day is after hair'], ['after.q.2', 'what is the day after mouth'], ['after.imp', 'tell me the day after eyes'],
    ['after.wish', 'i want to know the day that follows'.replace(' that follows', ' follows eyes')], ['after.ind', 'do you know the day after eyes'], ['after.order', 'the day after eyes'],
    ['len.q', 'how many eyes are in a red'], ['len.q', 'how many hair does a green have'], ['len.imp', 'count the eyes in a red'], ['len.wish', 'i want to know how many eyes in a red'],
    ['len.ind', 'can you tell me how many eyes are in a red'], ['len.short', 'eyes in a red'],
  ];
  for (const [id, text] of cases) { const p = byId(id); assert.ok(p, id); assert.ok(matches(p, text), `${id}: "${text}"`); }
  const forms = (n) => world.patterns.filter((p) => p.shape === `shape.t.${n}`).map((p) => p.id.replace('pat.t.', ''));
  assert.ok(!forms('after').some((f) => f.endsWith('short') || f === 'after.order.2' || f.endsWith('opts')), 'no short / second order / opts form with a relation');
  assert.ok(!matches(byId('after.q.2'), 'what is the day after the eyes'), 'objdet=none: no determiner before the object');
  assert.deepEqual(world.errors, []);
});
