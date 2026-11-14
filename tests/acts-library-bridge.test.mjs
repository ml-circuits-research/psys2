// SPDX-License-Identifier: AGPL-3.0-only
// The bridge between host state and the library (sopworld 0.40, specs/21 section 10): noun phrases of the acts executor read by `resolve` (a choice is asked, parts of a set, "the other one", elliptic parts),
// questions over attributes and relations answered by `ask` (shape: number, list, yes/no), acts on a view with no thing (`std.schema.view state=`: zoom, layer, back to normal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/soplang/index.mjs';
import * as A from '../worlds/acts/acts.mjs';
import { askBridge } from '../worlds/acts/ask-lib.mjs';
import { viewOf } from '../worlds/acts/view-lib.mjs';

const FIX = fileURLToPath(new URL('./fixtures/worlds', import.meta.url));
const S = A.parseSchema(parse(readFileSync(path.join(FIX, 'test.seating/schema.sop'), 'utf8')).wires);

function seating() {
  const X = A.createExecutor(S), st = {};
  const run = (act, args) => X.operation({ state: st, lang: {} }, act, args);
  run('make', { thing: 'tables', amount: '4' });
  run('make', { thing: 'guest', value: 'Ann' });
  run('make', { thing: 'guest', value: 'Bob' });
  run('change', { thing: 'table 2', value: 'red' });
  const pick = (thing, focus) => { st.focus = { ids: focus ?? [], place: null, act: null }; return run('pick', { thing, mode: 'select' }).note; };
  return { pick };
}

test('noun phrases: a choice is asked (never both), a part of a set is asked unless the count covers it, "the other one" is what is not in focus, a bare number borrows its noun', () => {
  const { pick } = seating();
  assert.match(pick('table 1 or table 2'), /^Which do you mean: table 1 or table 2\?/);
  assert.match(pick('the red or the blue table'), /^Which do you mean|^There is no|^I selected/, 'a part without its noun borrows the next one');
  assert.match(pick('table 1 or table 1'), /I selected table 1\./, 'one thing named twice is not a choice');
  assert.match(pick('two of the tables'), /^Which 2 of table 1, table 2, table 3 and table 4\? Say their names or numbers\./);
  assert.match(pick('4 of the tables'), /I selected 4 tables\./, 'the count covers the set: all of it');
  assert.match(pick('some of the guests'), /^Which ones of guest Ann and guest Bob\?/);
  assert.match(pick('all of the tables'), /I selected 4 tables\./);
  assert.match(pick('tables 1 and 2'), /I selected table 1 and table 2\./);
  assert.match(pick('tables 2 and 9'), /There is no table 9/, 'the part that fails says so');
  assert.match(pick('the other table', ['table-1']), /^Which other table: table 2, table 3 and table 4?/, 'the other one: of the kind, not the focus; several are asked');
  assert.match(pick('the others', ['table-1']), /I selected table 2, table 3 and table 4\. \(I took table 2, table 3 and table 4 as the other one\.\)/, 'the others: all of them, and said');
  assert.match(pick('the other table'), /^Which other table:/, 'with nothing in focus every one of the kind is a candidate, asked');
  assert.match(pick('two of them', ['guest-1']), /I took "them" to mean guest Ann/, 'a pronoun inside a part of a set reads the focus, and says so');
});

test('ask over attributes and relations: the shape of the answer, over projected things', () => {
  const b = askBridge('place', [{ name: 'capital', type: 'text', many: true }, { name: 'population', type: 'number' }, { name: 'neighbours', type: 'text', many: true }, { name: 'landlocked', type: 'bool' }]);
  const things = [{ id: 'fr', name: 'France', attrs: { capital: ['Paris'], population: 68e6, neighbours: ['Spain', 'Italy'], landlocked: false } }, { id: 'es', name: 'Spain', attrs: { capital: ['Madrid'], neighbours: ['France'] } }];
  const ask = (args) => b.ask(things, args);
  assert.deepEqual([ask({ thing: 'fr', attr: 'population' }).shape, ask({ thing: 'fr', attr: 'population' }).number], ['number', 68e6]);
  assert.deepEqual(ask({ thing: 'fr', attr: 'capital' }).values, ['Paris']);
  assert.deepEqual(ask({ thing: 'fr', attr: 'neighbours' }).values, ['Spain', 'Italy']);
  assert.equal(ask({ thing: 'es', attr: 'population' }).shape, 'none', 'a thing without the fact');
  assert.equal(ask({ thing: 'fr', attr: 'landlocked' }).values[0], 'false');
  assert.equal(ask({ thing: 'es', rel: 'neighbours', of: 'fr' }).answer, true);
  assert.deepEqual(ask({ kind: 'place', rel: 'neighbours', of: 'fr' }).names, ['Spain'], 'which places border France: either way round');
});

test('the view\'s own attributes: a step, a value, a clamp, a reset word, all checked by the library; the state stays the host\'s', () => {
  const schema = { id: 'mapx', kinds: { view: { name: 'view' } }, attrs: {
    zoom: { name: 'zoom', of: ['view'], type: 'number', min: 1, max: 18, def: '2', step: 1, stepMore: ['closer'], stepLess: ['back'], reset: ['normal'], values: [] },
    layer: { name: 'layer', of: ['view'], type: 'enum', values: ['offline', 'osm'], def: 'offline', step: 1 } } };
  const V = viewOf(schema, 'view');
  assert.equal(V.change({ zoom: 5, layer: 'offline' }, { attr: 'zoom', by: 'less', amount: 0.5 }).values.zoom, 4.5);
  assert.equal(V.change({ zoom: 5, layer: 'offline' }, { attr: 'zoom', by: 'more', amount: 2 }).values.zoom, 7);
  const low = V.change({ zoom: 1, layer: 'offline' }, { attr: 'zoom', by: 'less' });
  assert.deepEqual([low.values.zoom, low.clamped], [1, 'min'], 'the bound of the schema holds');
  assert.equal(V.change({ zoom: 5, layer: 'offline' }, { attr: 'layer', value: 'osm' }).values.layer, 'osm');
  assert.equal(V.change({ zoom: 5, layer: 'offline' }, { attr: 'layer', value: 'rivers' }).ok, false, 'an enum value the schema does not have');
  assert.deepEqual([V.stepOf('closer'), V.stepOf('back'), V.stepOf('normal'), V.stepOf('table')], [{ attr: 'zoom', by: 'more' }, { attr: 'zoom', by: 'less' }, { attr: 'zoom', reset: true }, null]);
});
