// Static enforcement of compute budgets (spec 06 "Compute budgets"): every unbounded loop and every self-recursive function calls `budget.tick(...)`
// or is verifiably finite (see scripts/lib/loop-scan.mjs). A `// bounded: <reason>` comment is a claim and excuses nothing (the page freeze of
// 2026-11-10 sat behind a false one). A regex loop (`while ((m = re.exec(s)))`) is refused unless the regex provably cannot match the empty string.
// docs/webchat/lib is generated from src (scripts/build-webchat.mjs) and is checked through src.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scan, strip, minLen } from '../scripts/lib/loop-scan.mjs';
import { targets } from '../scripts/lib/loop-targets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('scanner: recognises guarded and unguarded loops', () => {
  const kinds = (s) => scan(s).map((v) => v.kind);
  assert.deepEqual(kinds('let i = 0; while (i < 3) { i++; }'), ['while']);
  assert.deepEqual(kinds('while (x) { budget.tick("a"); x = f(); }'), []);
  assert.deepEqual(kinds('// bounded: x shrinks every pass\nwhile (x) { x = x.next; }'), ['while'], 'a bounded comment excuses nothing');
  assert.deepEqual(kinds('while (x) { budget.tick("a"); x = x.next; } // bounded: x'), []);
  assert.deepEqual(kinds('while (q.length) { await next(q.shift()); }'), [], 'an awaiting loop yields every pass');
  assert.deepEqual(kinds('do { x = f(x); } while (x > 1);'), ['do-while']);
  assert.deepEqual(kinds('for (;;) { go(); }'), ['for(;;)']);
  assert.deepEqual(kinds('for (let i = 0; i < a.length; i++) { use(a[i]); }'), []);
  assert.deepEqual(kinds('for (let i = 0; i < a.length; i++) { a.push(i); }'), ['for(;;) custom']);
  assert.deepEqual(kinds('for (const x of q) { q.push(x + 1); }'), ['for-of worklist']);
  assert.deepEqual(kinds('for (const x of q) { out.push(x); }'), []);
  assert.deepEqual(kinds('function f(n) { return n ? f(n - 1) : 0; }'), ['recursion f']);
  assert.deepEqual(kinds('const g = (n) => (n ? g(n - 1) : 0);'), ['recursion g']);
  assert.deepEqual(kinds('class A {\n  walk(n) {\n    return this.walk(n - 1);\n  }\n}'), ['recursion walk']);
  assert.deepEqual(kinds('function f() { setTimeout(() => f(), 10); }'), [], 'a self-call in a timer callback is not synchronous');
  assert.deepEqual(kinds('function f() { b.onclick = () => f(); }'), []);
  assert.deepEqual(kinds('function f() { p.then(() => f()); }'), []);
  assert.deepEqual(kinds('function w(v, depth) { if (depth > 7) return; for (const k of ks) w(v[k], depth + 1); }'), [], 'depth-capped recursion');
  assert.deepEqual(kinds('function w(v, depth) { if (depth > 7) return; w(v.a, depth); }'), ['recursion w']);
  assert.deepEqual(kinds('const s = "while (x) {}"; // while (y) {}'), []);
});

test('scanner: regex loops', () => {
  const kinds = (s) => scan(s).map((v) => v.kind.replace(/;.*/, '')).filter((k) => /^(?:exec loop|matchAll|replaceAll)/.test(k));   // (the loops themselves have no tick here)
  // the loop that froze the page on 2026-11-10: a regex whose first alternative matches the empty string
  assert.deepEqual(kinds('const re = /(^|[.!?]\\s+)|(\\p{Lu}\\p{L}+)/gu; let m; // bounded: x\nwhile ((m = re.exec(s))) out.push(m[0]);'), ['exec loop: the regex can match the empty string']);
  assert.deepEqual(kinds('const re = /\\p{Lu}\\p{L}+/gu; let m; while ((m = re.exec(s))) out.push(m[0]);'), []);
  assert.deepEqual(kinds('const re = /x*/g; let m; while ((m = re.exec(s))) { if (!m[0]) re.lastIndex++; out.push(m.index); }'), [], 'advances lastIndex on an empty match');
  assert.deepEqual(kinds('const re = /x*/g; let m; while ((m = re.exec(s))) { re.lastIndex = 0; }'), ['exec loop: the regex can match the empty string']);
  assert.deepEqual(kinds('const re = /\\w+/; let m; while ((m = re.exec(s))) out.push(m[0]);'), ['exec loop: non-global regex in a loop condition never advances']);
  assert.deepEqual(kinds('let m; do { m = /a|b?/g.exec(s); } while (m);'), ['exec loop: the regex can match the empty string']);
  assert.deepEqual(kinds('const re = new RegExp(x, "g"); let m; while ((m = re.exec(s))) out.push(m[0]);'), ['exec loop: regex not resolvable here']);
  assert.deepEqual(kinds('const re = /\\w+/g; for (const w of ws) { const m = re.exec(w); }'), [], 'a loop over a finite array ends whatever exec returns');
  assert.deepEqual(kinds('for (const m of s.matchAll(/a*/g)) out.push(m.index);'), []);
  assert.deepEqual(kinds('const re = /a/; for (const m of s.matchAll(re)) out.push(m.index);'), ['matchAll with a non-global regex throws']);
  assert.deepEqual(kinds('const x = s.matchAll(/a/);'), ['matchAll with a non-global regex throws']);
  assert.deepEqual(kinds('const x = s.replace(/a/, "b");'), []);
});

test('minLen: a regex is non-empty only when every top-level alternative consumes a character', () => {
  const cases = [['\\S', 1], ['a|b*', 0], ['(^|[.!?]\\s+)|(\\p{Lu}\\p{L}+)', 0], ['\\p{L}{2,}', 2], ['(?:ab|c)+', 1], ['\\b', 0], ['x?', 0], ['(?=a)b', 1], ['a*?', 0],
    ['[^"\\\\]+|"', 1], ['(?<![\\w])x', 1], ['(a|)', 0], ['\\d{0,3}', 0], ['(?:)', 0], ['^$', 0], ['\\k<n>', 0], ['(@[\\w.$#-]+)|("(?:[^"\\\\]|\\\\.)*")|(#[^\\n]*)', 1]];
  for (const [src, n] of cases) assert.equal(minLen(src), n, src);
});

test('loop guard: no unguarded loop or recursion in src, every world module, docs/webchat/ui', () => {
  const bad = [];
  const allowed = { 'docs/webchat/ui/engine-worker.mjs': 1 };   // the deliberate infinite loop of the fault-injection test hook (marked `loop-guard-allow`)
  for (const f of targets()) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    let vs = scan(readFileSync(f, 'utf8'));
    if (allowed[rel]) {
      const ok = vs.filter((v) => v.snippet.includes('loop-guard-allow'));
      assert.equal(ok.length, allowed[rel], `${rel}: allowed loops`);
      vs = vs.filter((v) => !ok.includes(v));
    }
    for (const v of vs) bad.push(`${rel}:${v.line}  ${v.kind}  ${v.snippet}`);
  }
  if (bad.length) console.log(`loop-guard: ${bad.length} unguarded`);
  assert.equal(bad.length, 0, `unguarded loops (add budget.tick('site'); a "// bounded:" comment excuses nothing):\n${bad.join('\n')}`);
});

test('no "// bounded:" claims are left (they excuse nothing: verifiable loops need no comment, the others tick)', () => {
  const left = [];
  for (const f of targets()) for (const c of strip(readFileSync(f, 'utf8')).comments) if (/\bbounded:/.test(c.text)) left.push(`${path.relative(ROOT, f)}:${c.line}`);
  assert.deepEqual(left, []);
});

test('regex loops and matchAll are checked everywhere, also in the converted diagram engine', () => {
  const walkAll = (d, out = []) => {
    for (const e of readdirSync(d)) {
      const f = path.join(d, e);
      if (statSync(f).isDirectory()) { if (e !== 'vendor' && e !== 'node_modules') walkAll(f, out); } else if (e.endsWith('.mjs')) out.push(f);
    }
    return out;
  };
  const bad = [];
  for (const f of [...walkAll(path.join(ROOT, 'src')), ...walkAll(path.join(ROOT, 'worlds')), ...walkAll(path.join(ROOT, 'docs/webchat/ui'))]) {
    if (f.endsWith('datagen.mjs')) continue;
    for (const v of scan(readFileSync(f, 'utf8'))) if (/^(?:exec loop|matchAll|replaceAll)/.test(v.kind)) bad.push(`${path.relative(ROOT, f)}:${v.line}  ${v.kind}`);
  }
  assert.deepEqual(bad, []);
});

test('diagram engine: the layout, solver, path and name loops carry budget ticks (inserted by scripts/convert-diagram-engine.mjs)', () => {
  const count = (f) => (readFileSync(path.join(ROOT, 'worlds/diagram.sketch/engine', f), 'utf8').match(/budget\.tick\('diagram\./g) ?? []).length;
  assert.ok(count('auto-layout.mjs') >= 8, 'auto-layout.mjs ticks');
  assert.ok(count('templates.mjs') >= 2, 'templates.mjs ticks');
  assert.ok(count('logic.mjs') >= 7, 'logic.mjs ticks');
});
