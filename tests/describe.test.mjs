// E3 (spec 03 section 2c): operation descriptions. The loader's pattern generator and its switch PSYS_GEN_PATTERNS were deleted in P6 (spec 16 section 15);
// describePatterns stays a pure function (tested here). The reader route that read describe.sop in full was deleted 2026-11-15 (reviewer decision; spec 16 section 7):
// a world's describe.sop holds only `slot=` declarations, and no world ships one with wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { loadWorlds } from '../src/worlds/index.mjs';
import { parse } from '../src/soplang/index.mjs';
import { describePatterns, makeArg, emitKey, readDescriptionWires, descriptionFor, wordToken } from '../src/worlds/describe.mjs';

const load = () => loadWorlds(createFsLoader({ roots: [DEFAULT_ROOT] }));
const WORLDS = ['kids.shop', 'docs.editor', 'kids.arith', 'kids.tasks'];

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

test('no world ships the wording of a description: describe.sop holds only slot= declarations, and the loader reads only those', async () => {
  const { readdirSync, existsSync, readFileSync } = await import('node:fs');
  const root = new URL('../worlds/', import.meta.url);
  for (const id of readdirSync(root)) {
    const f = new URL(`${id}/describe.sop`, root);
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /core\.describe\.words|core\.word\b/, `${id}/describe.sop has wording`);
  }
  const set = await load();
  for (const id of WORLDS) assert.ok(set.worlds.get(id).descriptions.every((d) => d.words.size === 0), id);
});
