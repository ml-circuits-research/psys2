import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseOrThrow } from '../src/soplang/index.mjs';
import { Legends, LegendError } from '../src/legends/index.mjs';

const core = parseOrThrow(await readFile(new URL('../worlds/core/legend.sop', import.meta.url), 'utf8'));

const LEG = `
@legend.t.a core.legend
    namespace=t.a
@t.a.animal core.type
    doc="x"
@t.a.animal.name core.key
    value=string
    ask="Name?"
@t.a.animal.legs core.key
    value=integer
    ask="How many legs?"
@t.a.dog core.type
    extends=t.a.animal
@t.a.dog.name core.key
    value=string
    ask="Dog name?"
@t.a.dog.owner core.key
    value=$core.agent
    ask="Owner?"
    required=true
@t.a.dog.tags core.key
    value=atom
    card=many
    ask="Tags?"
@t.a.dog.weight core.key
    value=quantity.mass
    ask="Weight?"
@t.a.dog.good core.key
    value=boolean
    ask="Good?"
@t.a.dog.size core.key
    value=number
    ask="Size?"
@t.a.cat core.type
    extends=t.a.animal
@t.a.cat.t.a.animal.legs core.key
    value=integer
    ask="Odd key"
`;
const make = (extra = '') => new Legends().add(core, { worldId: 'core' }).add(parseOrThrow(LEG + extra), { worldId: 't.a' });
const L = make();

test('the core legend loads without problems', () => {
  assert.deepEqual(new Legends().add(core).problems(), []);
});

test('type hierarchy: extends, default core.thing, chain and descendants', () => {
  assert.equal(L.type('t.a.animal').extends, 'core.thing');
  assert.deepEqual(L.chain('t.a.dog'), ['t.a.dog', 't.a.animal', 'core.thing']);
  assert.ok(L.isA('t.a.dog', 'core.thing'));
  assert.ok(!L.isA('t.a.animal', 't.a.dog'));
  assert.deepEqual(L.descendants('t.a.animal').sort(), ['t.a.animal', 't.a.cat', 't.a.dog']);
  assert.ok(L.isA('core.state', 'core.thing'));
});

test('short key resolution: own type, ancestors nearest first, full keys', () => {
  assert.equal(L.resolveKey('t.a.dog', 'owner'), 't.a.dog.owner');
  assert.equal(L.resolveKey('t.a.dog', 'name'), 't.a.dog.name'); // nearest wins over t.a.animal.name
  assert.equal(L.resolveKey('t.a.cat', 'name'), 't.a.animal.name');
  assert.equal(L.resolveKey('t.a.dog', 'legs'), 't.a.animal.legs');
  assert.equal(L.resolveKey('t.a.dog', 't.a.animal.legs'), 't.a.animal.legs');
  assert.equal(L.resolveKey('t.a.dog', 'core.seq'), 'core.seq');
  assert.equal(L.resolveKey('core.agent', 'name'), 'core.agent.name');
});

test('resolution failures and ambiguity are errors', () => {
  assert.throws(() => L.resolveKey('t.a.dog', 'nope'), LegendError);
  assert.throws(() => L.resolveKey('t.a.nope', 'name'), /unknown type/);
  assert.throws(() => L.resolveKey('t.a.cat', 'owner'), /does not resolve/); // dog key does not apply to cat
  // t.a.cat.t.a.animal.legs exists as a short key of cat AND t.a.animal.legs exists in full: ambiguous
  const r = L.tryResolveKey('t.a.cat', 't.a.animal.legs');
  assert.match(r.error, /ambiguous/);
});

test('dynamic where.* and arg.* keys resolve on core.question and core.request', () => {
  assert.equal(L.resolveKey('core.question', 'where.owner'), 'core.question.where.owner');
  assert.equal(L.resolveKey('core.request', 'arg.count'), 'core.request.arg.count');
  assert.throws(() => L.resolveKey('core.question', 'arg.count'));
  assert.deepEqual(L.validateWire(parseOrThrow('@q core.question type=t.a.dog where.owner=$e.x where.legs=4')[0]), []);
});

test('normalizeWire expands short keys; shortKey is its inverse', () => {
  const [w] = parseOrThrow('@d t.a.dog owner=$e.x name="Rex" legs=4');
  const { wire, errors } = L.normalizeWire(w);
  assert.deepEqual(errors, []);
  assert.deepEqual(wire.entries.map((e) => e.key), ['t.a.dog.owner', 't.a.dog.name', 't.a.animal.legs']);
  assert.equal(L.shortKey('t.a.dog', 't.a.dog.owner'), 'owner');
  assert.equal(L.shortKey('t.a.dog', 'core.seq'), 'core.seq');
});

const v = (text, lookup) => L.validateWire(parseOrThrow(text)[0], { lookup });

test('validation: valid wire passes', () => {
  assert.deepEqual(v('@d t.a.dog owner=$e.x name="Rex" tags=a tags=b weight=12kg good=true size=2.5'), []);
});

test('validation: unknown type and unknown key', () => {
  assert.match(v('@d t.a.zebra x=1')[0].message, /unknown type/);
  assert.match(v('@d t.a.dog owner=$e.x bogus=1')[0].message, /does not resolve/);
});

test('validation: cardinality and required keys', () => {
  assert.match(v('@d t.a.dog owner=$e.x name=a name=b')[0].message, /cardinality one/);
  assert.match(v('@d t.a.dog name=a')[0].message, /required key 't.a.dog.owner' is missing/);
});

test('validation: literal kinds', () => {
  assert.match(v('@d t.a.dog owner=$e.x legs=four')[0].message, /not an integer/);
  assert.match(v('@d t.a.dog owner=$e.x legs=2.5')[0].message, /not an integer/);
  assert.match(v('@d t.a.dog owner=$e.x size=big')[0].message, /not a number/);
  assert.match(v('@d t.a.dog owner=$e.x good=yes')[0].message, /not a boolean/);
  assert.match(v('@d t.a.dog owner=$e.x weight=heavy')[0].message, /not a quantity/);
  assert.match(v('@d t.a.dog owner=$e.x tags="two words"')[0].message, /expected an atom/);
  assert.match(v('@d t.a.dog owner=$e.x name=$ref')[0].message, /got a reference/);
});

test('validation: references must be references and point to the declared type or a descendant', () => {
  assert.match(v('@d t.a.dog owner=tom')[0].message, /expected a reference to core.agent/);
  const wires = new Map(parseOrThrow('@e.x core.agent name="X"\n@e.y t.a.dog owner=$e.x').map((w) => [w.id, w]));
  const lookup = (id) => wires.get(id);
  assert.deepEqual(v('@d t.a.dog owner=$e.x', lookup), []);
  assert.match(v('@d t.a.dog owner=$e.y', lookup)[0].message, /is a t.a.dog, expected core.agent/);
  assert.deepEqual(v('@d t.a.dog owner=$unknown', lookup), []); // unavailable targets are not checked
});

test('legend problems: key without owner, unknown extends, cycle, missing ask, namespace, duplicates', () => {
  const l = make(`
@t.a.orphan.x core.key
    value=string
    ask="?"
@t.a.bad core.type
    extends=t.a.nothing
@t.a.p core.type
    extends=t.a.q
@t.a.q core.type
    extends=t.a.p
@t.a.dog.noask core.key
    value=string
@t.a.dog.badkind core.key
    value=floaty
    ask="?"
@t.a.dog.badcard core.key
    value=string
    card=some
    ask="?"
@other.type core.type
`).add(parseOrThrow('@t.a.animal core.type'), { worldId: 'dup' });
  const msgs = l.problems().map((p) => p.message).join('\n');
  assert.match(msgs, /no declared owner type/);
  assert.match(msgs, /extends unknown type 't.a.nothing'/);
  assert.match(msgs, /cycle/);
  assert.match(msgs, /no ask text/);
  assert.match(msgs, /unknown value kind 'floaty'/);
  assert.match(msgs, /invalid card 'some'/);
  assert.match(msgs, /outside namespace 't.a'/);
  assert.match(msgs, /duplicate type 't.a.animal'/);
});

test('decode follows the declared value kind', () => {
  const info = L.keyInfo('t.a.animal.legs');
  assert.equal(L.decode(info, { kind: 'atom', v: '4' }), 4);
  assert.equal(L.decode(L.keyInfo('t.a.dog.good'), { kind: 'atom', v: 'true' }), true);
  assert.equal(L.decode(L.keyInfo('t.a.dog.owner'), { kind: 'ref', v: 'e.x' }), 'e.x');
  assert.equal(L.decode(L.keyInfo('t.a.animal.name'), { kind: 'string', v: 'Rex' }), 'Rex');
});

test('isClosed looks at the type and its ancestors', () => {
  const l = make('@t.a.closedpet core.type\n    extends=t.a.dog\n    closed=true');
  assert.ok(l.isClosed('t.a.closedpet'));
  assert.ok(!l.isClosed('t.a.dog'));
});
