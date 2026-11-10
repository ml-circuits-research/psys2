// Static enforcement of compute budgets (spec 06 "Compute budgets"): every unbounded loop and every self-recursive function either calls
// `budget.tick(...)` or carries a `// bounded: <reason>` comment on its line or the line above. New unguarded loops fail this suite.
// docs/webchat/lib is generated from src (scripts/build-webchat.mjs) and is checked through src.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scan } from '../scripts/lib/loop-scan.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (e.endsWith('.mjs')) out.push(full);
  }
  return out;
}

export function targets() {
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'docs/webchat/ui'))];
  for (const w of readdirSync(path.join(ROOT, 'worlds'))) {
    const f = path.join(ROOT, 'worlds', w, 'ops.mjs');
    try { statSync(f); files.push(f); } catch { /* no ops */ }
  }
  return files;
}

test('scanner: recognises guarded and unguarded loops', () => {
  const kinds = (s) => scan(s).map((v) => v.kind);
  assert.deepEqual(kinds('let i = 0; while (i < 3) { i++; }'), ['while']);
  assert.deepEqual(kinds('while (x) { budget.tick("a"); x = f(); }'), []);
  assert.deepEqual(kinds('// bounded: x shrinks every pass\nwhile (x) { x = x.next; }'), []);
  assert.deepEqual(kinds('do { x = f(x); } while (x > 1);'), ['do-while']);
  assert.deepEqual(kinds('for (;;) { go(); }'), ['for(;;)']);
  assert.deepEqual(kinds('for (let i = 0; i < a.length; i++) { use(a[i]); }'), []);
  assert.deepEqual(kinds('for (let i = 0; i < a.length; i++) { a.push(i); }'), ['for(;;) custom']);
  assert.deepEqual(kinds('for (const x of q) { q.push(x + 1); }'), ['for-of worklist']);
  assert.deepEqual(kinds('for (const x of q) { out.push(x); }'), []);
  assert.deepEqual(kinds('function f(n) { return n ? f(n - 1) : 0; }'), ['recursion f']);
  assert.deepEqual(kinds('const g = (n) => (n ? g(n - 1) : 0);'), ['recursion g']);
  assert.deepEqual(kinds('class A {\n  walk(n) {\n    return this.walk(n - 1);\n  }\n}'), ['recursion walk']);
  assert.deepEqual(kinds('const s = "while (x) {}"; // while (y) {}'), []);
});

test('loop guard: no unguarded loop or recursion in src, worlds/*/ops.mjs, docs/webchat/ui', () => {
  const bad = [];
  for (const f of targets()) {
    for (const v of scan(readFileSync(f, 'utf8'))) bad.push(`${path.relative(ROOT, f)}:${v.line}  ${v.kind}  ${v.snippet}`);
  }
  if (bad.length) console.log(`loop-guard: ${bad.length} unguarded`);
  assert.equal(bad.length, 0, `unguarded loops (add budget.tick('site') or a "// bounded: <reason>" comment):\n${bad.join('\n')}`);
});
