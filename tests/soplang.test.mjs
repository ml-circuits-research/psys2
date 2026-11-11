import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseOrThrow, serialize, get, getAll, SopSyntaxError } from '../src/soplang/index.mjs';

const ok = (text) => { const r = parse(text); assert.deepEqual(r.errors, [], JSON.stringify(r.errors)); return r.wires; };
const bad = (text, re) => {
  const { errors } = parse(text, { source: 't.sop' });
  assert.ok(errors.length >= 1, `expected an error for ${JSON.stringify(text)}`);
  assert.match(errors[0].message, re);
  return errors[0];
};

test('parses wires, values and entries', () => {
  const [w] = ok('@b1 phys.mech.body mass=2kg name="Big \\"one\\"" on=$f1 n=-4 x=3.5');
  assert.equal(w.id, 'b1');
  assert.equal(w.type, 'phys.mech.body');
  assert.deepEqual(w.entries.map((e) => e.key), ['mass', 'name', 'on', 'n', 'x']);
  assert.deepEqual(get(w, 'mass'), { kind: 'atom', v: '2kg' });
  assert.deepEqual(get(w, 'name'), { kind: 'string', v: 'Big "one"' });
  assert.deepEqual(get(w, 'on'), { kind: 'ref', v: 'f1' });
  assert.equal(get(w, 'n').v, '-4');
  assert.equal(get(w, 'missing'), undefined);
});

test('wires span lines and end at the next unquoted @', () => {
  const wires = ok('@a t\n  k=1\n  j=2\n\n@b t k=3');
  assert.equal(wires.length, 2);
  assert.equal(wires[0].entries.length, 2);
  assert.equal(wires[1].span.line, 5);
  assert.equal(wires[0].span.start, 0);
});

test('@ $ = inside strings are text; JSON escapes decode', () => {
  const [w] = ok('@a t s="a@b $c d=e \\n \\u00e9 \\\\"');
  assert.equal(get(w, 's').v, 'a@b $c d=e \n é \\');
});

test('repeated keys are kept in order', () => {
  const [w] = ok('@a t k=1 j=x k=2 k=3');
  assert.deepEqual(getAll(w, 'k').map((v) => v.v), ['1', '2', '3']);
});

test('identifiers may have dots, dashes and underscores', () => {
  const [w] = ok('@kids.arith.holding-x_1 legend.kids.arith a-b.c=$legend.kids.arith');
  assert.equal(w.id, 'kids.arith.holding-x_1');
});

test('empty input and whitespace parse to no wires', () => {
  assert.deepEqual(ok(''), []);
  assert.deepEqual(ok('  \n\t '), []);
});

test('error: text before the first @', () => {
  const e = bad('hello @a t', /before the first declaration/);
  assert.equal(e.offset, 0);
  assert.equal(e.line, 1);
  assert.equal(e.column, 1);
  assert.equal(e.source, 't.sop');
});

test('error: declaration without id or type', () => {
  bad('@ t k=1', /without id/);
  bad('@a', /without type/);
  bad('@a @b t', /without type/);
  bad('@a k=1', /without type/);
});

test('error: token that is not key=value', () => {
  bad('@a t foo', /expected key=value/);
  bad('@a t "str"', /expected key=value/);
  bad('@a t $ref', /expected key=value/);
  bad('@a t =1', /expected key=value|invalid key/);
});

test('error: empty value, unterminated string, bad escape', () => {
  bad('@a t k=', /empty value/);
  bad('@a t k= j=1', /empty value/);
  bad('@a t k="abc', /unterminated string/);
  bad('@a t k="a\\qb"', /bad escape/);
  bad('@a t k="a\\u12"', /bad \\u escape/);
});

test('error: invalid identifiers in id, type, key and reference', () => {
  bad('@1a t', /invalid wire id/);
  bad('@a 9t', /invalid wire type/);
  bad('@a. t', /invalid wire id/);
  bad('@a t 1k=x', /invalid key/);
  bad('@a t k=$1x', /invalid reference/);
  bad('@a t k=$', /invalid reference/);
  bad('@a t k..j=1', /invalid key/);
});

test('error: forbidden characters in unquoted atoms', () => {
  bad('@a t k=a"b"', /not allowed in an unquoted value/);
  bad('@a t k=a\\b', /not allowed in an unquoted value/);
  bad('@a t k="x"y', /after string/);
});

test('error: duplicate wire id within one parse unit', () => {
  const e = bad('@a t\n@b t\n@a t', /duplicate wire id 'a'/);
  assert.equal(e.line, 3);
  assert.equal(e.column, 2);
});

test('errors carry offset, line and column; all errors are collected', () => {
  const { wires, errors } = parse('@a t k=1\n@b t k=\n@c t ok=2\n@d t "x"');
  assert.deepEqual(wires.map((w) => w.id), ['a', 'c']);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].line, 2);
  assert.equal(errors[0].column, 8);
  assert.equal(errors[0].offset, 16);
  assert.equal(errors[1].line, 4);
});

test('parseOrThrow throws SopSyntaxError with every error', () => {
  assert.throws(() => parseOrThrow('@a t k=\n@b t j='), (e) => e instanceof SopSyntaxError && e.errors.length === 2 && /1:8/.test(e.message));
  assert.equal(parseOrThrow('@a t k=1').length, 1);
});

test('canonical serialize sorts keys, keeps repeated order, escapes strings, ends with newline', () => {
  const wires = ok('@a t z=1 b="x\\ny" k=2 k=1 m=$r');
  const text = serialize(wires, { canonical: true });
  assert.equal(text, '@a t\n    b="x\\ny"\n    k=2\n    k=1\n    m=$r\n    z=1\n');
  assert.equal(serialize(wires), '@a t\n    z=1\n    b="x\\ny"\n    k=2\n    k=1\n    m=$r\n');
});

test('canonical serialization round-trips and is idempotent', () => {
  const src = '@a t.x s="é \\"q\\" \\\\ @ $ ="  r=$b n=-4\n@b t.y k=2kg k=3.5';
  const w1 = ok(src);
  const c1 = serialize(w1, { canonical: true });
  const w2 = ok(c1);
  assert.equal(serialize(w2, { canonical: true }), c1);
  const strip = (ws) => ws.map((w) => ({ id: w.id, type: w.type, entries: [...w.entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) }));
  assert.deepEqual(strip(w2), strip(w1));
  assert.ok(c1.endsWith('\n'));
  assert.equal(serialize([], { canonical: true }), '');
});
