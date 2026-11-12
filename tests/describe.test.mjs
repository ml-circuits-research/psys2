// E3 (spec 03 section 2c): operation descriptions generate patterns, opt-in only (PSYS_GEN_PATTERNS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { describePatterns, makeArg, emitKey, readDescriptionWires, descriptionFor, wordToken } from '../src/worlds/describe.mjs';

const load = async (mode) => {
  if (mode) globalThis.PSYS_GEN_PATTERNS = mode; else delete globalThis.PSYS_GEN_PATTERNS;
  try { return await loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] })); } finally { delete globalThis.PSYS_GEN_PATTERNS; }
};
const WORLDS = ['kids.shop', 'geo.map', 'docs.editor', 'kids.arith', 'kids.tasks', 'kids.time', 'kids.animals', 'kids.shapes', 'user.profile'];

test('an argument is built from wires and keys, with no notation inside a value', () => {
  assert.deepEqual(makeArg({ name: 'i2', cls: 'lex.kids.shop.items', optional: true, qty: 'n2' }, { prep: ['and', 'plus'] }), { name: 'i2', cls: 'lex.kids.shop.items', optional: true, qty: 'n2', prep: ['and', 'plus'], det: null, unit: null });
  assert.throws(() => makeArg({ name: 'x' }));
  assert.equal(wordToken('how much'), 'how_much');
  assert.equal(wordToken("what's my"), 'what_s_my');
  assert.equal(emitKey('@{_} core.request action=geo.zoom arg.dir=in'), 'geo.zoom');
  assert.equal(emitKey('@{_} core.question type=kids.shop.total seek=total'), 'kids.shop.total');
  assert.equal(emitKey('@{_} kids.shop.money count={n}'), 'kids.shop.money');
});

test('describe wires read into descriptions; a word that means something else is an error', () => {
  const src = `@describe.x.buy core.describe\n    op=x.buy\n    intent=statement\n    emit="@{_} x.buy item={i1} count={n1}"\n@describe.x.buy.i1 core.describe.arg\n    of=$describe.x.buy\n    name=i1\n    class=number\n    qty=n1\n@describe.x.buy.en core.describe.words\n    of=$describe.x.buy\n    lang=en\n    verb=$w.buy\n    verb=$w.bad\n@w.buy core.word lang=en text=buy means=x.buy\n@w.bad core.word lang=en text=wrong means=x.other\n`;
  const r = readDescriptionWires(parse(src).wires);
  assert.equal(r.descriptions.size, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /means x\.other, expected x\.buy/);
  const d = descriptionFor([...r.descriptions.values()][0], 'en');
  assert.deepEqual(d.verb, ['buy', 'wrong']);
  assert.equal(descriptionFor([...r.descriptions.values()][0], 'ro'), null);
});

test('a quantified optional item expands to every count form and drops the absent slots from the emit', () => {
  const list = describePatterns({ id: 'x', op: 'x.buy', intent: 'statement', emit: '@{_} x.buy item={i1} count={n1}\n@{_1} x.buy item={i2} count={n2}', args: [makeArg({ name: 'i1', cls: 'number', qty: 'n1' }), makeArg({ name: 'i2', cls: 'number', optional: true, qty: 'n2' }, { prep: ['and'] })], verb: ['buy'], frames: ['stmt'] });
  assert.equal(list.length, 6);   // 2 forms of the first item x 3 of the optional second (number, article, absent)
  const absent = list.filter((p) => !p.emit.includes('@{_1}'));
  assert.equal(absent.length, 2);
  assert.ok(list.some((p) => p.emit.includes('count=1')));
});

test('descriptions are not read unless PSYS_GEN_PATTERNS is set', async () => {
  const set = await load(null);
  for (const id of WORLDS) { const w = set.worlds.get(id); assert.equal(w.descriptions.length, 0); assert.equal(w.generated, null); }
});

test('every description of the three worlds loads clean and generates patterns', async () => {
  const set = await load('add');
  const base = await load(null);
  for (const id of WORLDS) {
    const w = set.worlds.get(id);
    assert.ok(w.descriptions.length >= 10, `${id}: ${w.descriptions.length} descriptions`);
    assert.deepEqual(w.errors.filter((e) => e.file === 'describe.sop'), [], `${id}: describe.sop errors`);
    assert.ok(w.generated.patterns.length >= w.descriptions.length, `${id}: generated ${w.generated.patterns.length}`);
    assert.equal(w.patterns.length, base.worlds.get(id).patterns.length + w.generated.patterns.length, `${id}: add keeps every hand-written pattern`);
    for (const d of w.descriptions) assert.equal(emitKey(d.emit), d.op, `${d.id}: op differs from the key of its emit`);
  }
});

test('`only` replaces the hand-written patterns of the described operations', async () => {
  const set = await load('only');
  const base = await load(null);
  for (const id of WORLDS) {
    const w = set.worlds.get(id);
    assert.ok(w.generated.replaced.length > 0, `${id}: nothing replaced`);
    assert.ok(w.patterns.length < base.worlds.get(id).patterns.length + w.generated.patterns.length);
    const keys = new Set(w.descriptions.map((d) => d.op));
    assert.ok(w.patterns.filter((p) => !p.generatedFrom).every((p) => !keys.has(emitKey(p.emit))), `${id}: a hand-written pattern of a described operation stayed`);
  }
});
