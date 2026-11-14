import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse, serialize, get } from '../src/soplang/index.mjs';
import { parse as parseV1 } from './fixtures/soplang-v1-reference.mjs';

const ok = (text) => { const r = parse(text); assert.deepEqual(r.errors, [], JSON.stringify(r.errors)); return r.wires; };
const bad = (text, re) => {
  const { errors } = parse(text);
  assert.ok(errors.length >= 1, `expected an error for ${JSON.stringify(text)}`);
  assert.match(errors[0].message, re);
};

test('v1.1: variables are a fourth value kind', () => {
  const [w] = ok('@p purchase item=?i qty=?q.x-1 of=$?b on=$f1');
  assert.deepEqual(get(w, 'item'), { kind: 'var', v: 'i' });
  assert.deepEqual(get(w, 'qty'), { kind: 'var', v: 'q.x-1' });
  assert.deepEqual(get(w, 'of'), { kind: 'ref', v: '?b' });
  assert.equal(serialize([w]), '@p purchase\n    item=?i\n    qty=?q.x-1\n    of=$?b\n    on=$f1\n');
  assert.deepEqual(ok(serialize([w], { canonical: true })).map((x) => x.entries.length), [4]);
  bad('@a t k=?', /invalid variable/);
  bad('@a t k=?1', /invalid variable/);
  bad('@a t k=?x"y"', /after variable/);
});

test('v1.1: # comments are skipped where a token could start; # elsewhere is text', () => {
  const wires = ok('# header\n@a t k=1 # trailing\n   j="x # y" c=#fff m=a#b\n# between\n@b t # after type\n  z=2');
  assert.deepEqual(wires.map((w) => w.id), ['a', 'b']);
  assert.deepEqual(wires[0].entries.map((e) => e.value.v), ['1', 'x # y', '#fff', 'a#b']);
  assert.equal(wires[1].entries.length, 1);
  assert.deepEqual(ok('# only a comment'), []);
  bad('# c\nhello @a t', /before the first declaration/);
});

test('v1.1: lexical details (identifier segments, atoms, raw line ends in strings)', () => {
  const [w] = ok('@pat.kids.shop.price.q.2 t mail=ann@example.org eq=a=b d=10$ s="two\nlines\there"');
  assert.equal(w.id, 'pat.kids.shop.price.q.2');
  assert.deepEqual(w.entries.map((e) => e.value.v), ['ann@example.org', 'a=b', '10$', 'two\nlines\there']);
  assert.ok(serialize([w]).includes('"two\\nlines\\there"'));
  bad('@a..b t', /invalid wire id/);
  bad('@1a t', /invalid wire id/);
  bad('@a t k=a"b"', /not allowed in an unquoted value/);
});

test('every worlds/**/*.sop parses exactly as the v1 parser did (except the new comment and variable features)', () => {
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.sop')) files.push(p); } })(new URL('../worlds', import.meta.url).pathname);
  assert.ok(files.length > 100);
  let same = 0;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const old = parseV1(text, { source: f });
    const cur = parse(text, { source: f });
    if (old.errors.length === 0) {
      assert.deepEqual(cur, old, f);
      same++;
    } else {
      // only files that use the new features (comments, variables) were rejected before; they parse now
      assert.deepEqual(cur.errors, [], `${f}: ${JSON.stringify(cur.errors[0])}`);
      // generated schema-world files (build-schema-world.mjs) also use wire ids with a numeric segment (pat.x.apart.2), which v1 rejected
      assert.match(text, /^\s*#|\s#\s|\?[a-z]|Generated from schema\.sop/m, `${f} failed in v1 for a reason other than comments or variables`);
    }
  }
  assert.ok(same > 100);
});
