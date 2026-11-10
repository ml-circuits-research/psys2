// SPDX-License-Identifier: AGPL-3.0-only
// The reasoner host layer (SOPWORLD-1, spec 15): the vendored sopworld library, the opt-in of three worlds, the parity gates with the switch on,
// the default (ops) unchanged, the turn budget, forks, and the five things the matrix adds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { createBudget, installBudget, releaseBudget, isBudgetExceeded } from '../src/dialog/budget.mjs';
import { scan } from '../src/vendor/sopworld/tools/scan-loops.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const matrix = await engineWith('matrix');
const ops = await engineWith('ops');

test('vendor: the library is the pinned file, unmodified, and passes its own loop scan', () => {
  const notes = readFileSync(path.join(ROOT, 'src/vendor/LICENSES.md'), 'utf8');
  const file = readFileSync(path.join(ROOT, 'src/vendor/sopworld/sopworld.mjs'));
  assert.match(notes, /a7a8e1669c8a74fba5225a28186d6d83a14d457a/, 'the commit is named');
  assert.match(notes, new RegExp(`${file.length} bytes`), 'the size is recorded');
  assert.match(notes, new RegExp(createHash('sha256').update(file).digest('hex')), 'the sha256 of the vendored file is recorded');
  assert.match(String(file.subarray(0, 120)), /^\/\/ sopworld 0\.4\.0 /);
  assert.equal(scan(path.join(ROOT, 'src/vendor/sopworld')).join('\n'), '', 'the library\'s own scanner finds no unguarded loop in the vendored file');
  assert.ok(readFileSync(path.join(ROOT, 'src/vendor/sopworld/LICENSE'), 'utf8').startsWith('MIT License'));
});

test('default: the engine is ops, no library is loaded and no session has a World', async () => {
  const e = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  assert.equal(e.reasonerMode, process.env.PSYS2_REASONER === 'matrix' ? 'matrix' : 'ops');
  assert.equal(ops.reasonerMode, 'ops');
  assert.equal(ops.reasoner, null);
  assert.equal(ops.createSession({ language: 'en' }).isession.rs, null);
  for (const id of ['kids.shop', 'kids.arith', 'kids.tasks']) assert.equal(ops.set.get(id).reasoner, 'matrix', `${id} opts in`);
  assert.equal(ops.set.get('kids.time').reasoner, 'ops', 'every other world stays on ops');
  assert.equal(ops.set.get('kids.shop').patterns.some((p) => p.id.includes('.m.')), false, 'the matrix-only patterns are not loaded in ops mode');
  assert.deepEqual(ops.problems(), []);
});

test('matrix mode: three worlds opt in, the library loads without problems, the engine has no problems', () => {
  assert.deepEqual(matrix.reasoner.problems, []);
  assert.deepEqual(matrix.reasoner.worlds.sort(), ['kids.arith', 'kids.shop', 'kids.tasks']);
  assert.deepEqual(matrix.problems(), []);
  assert.ok(matrix.createSession({ language: 'en' }).isession.rs, 'a session has its own World');
});

// the failures that remain, each with the library follow-up that closes it (worker-log SOPWORLD-1)
const ARITH_FAILURES = {
  't.arith.ell2': 'G14: "received 2" with an unknown start is reported as what was received',
  't.arith.n24': 'G14: "received 3" with an unknown start',
  't.kids.arith.dm102': 'G14: "received 2" with an unknown start',
  't.arith.n17': 'the library refuses an impossible event when it is told; the old system reports it when asked',
  't.arith.n18': 'same: an impossible event is refused when told',
  't.arith.n19': 'same: an impossible event is refused when told',
  't.arith.n37': 'G10: a tie is ambiguous, the matrix picks one',
};

test('parity gate (switch on): kids.shop 147/147, kids.tasks >= 231/232, kids.arith >= 207/217, every failure listed', async () => {
  const shop = await runWorldTests(matrix, 'kids.shop');
  assert.deepEqual(shop.failed, []); assert.equal(shop.total, 147);
  const tasks = await runWorldTests(matrix, 'kids.tasks');
  assert.ok(tasks.passed >= 231, `${tasks.passed}/${tasks.total}: ${JSON.stringify(tasks.failed)}`);
  const arith = await runWorldTests(matrix, 'kids.arith');
  assert.ok(arith.passed >= 207, `${arith.passed}/${arith.total}`);
  assert.deepEqual(arith.failed.map((f) => f.id).sort(), Object.keys(ARITH_FAILURES).sort(), 'the failures are exactly the listed ones');
});

test('parity: the other worlds that read these three (charts, documents) are unchanged with the switch on', async () => {
  for (const id of ['data.charts', 'docs.editor']) {
    const r = await runWorldTests(matrix, id);
    const o = await runWorldTests(ops, id);
    assert.deepEqual(r.failed, o.failed, `${id} fails the same tests with the switch on and off`);
    assert.equal(r.passed, o.passed);
  }
});

test('the switch off answers exactly as before: the shop, the lists and the sums', async () => {
  for (const id of ['kids.shop', 'kids.arith', 'kids.tasks']) { const r = await runWorldTests(ops, id); assert.deepEqual(r.failed, [], id); }
});

const say = async (e, lines) => { const s = e.createSession({ language: 'en' }); const out = []; for (const l of lines) out.push((await s.send(l, {})).text); return { s, out }; };

test('gain 1: a missing item is asked for and the answer completes the command', async () => {
  const { out } = await say(matrix, ['add to my list', 'bread']);
  assert.equal(out[0], 'What shall I put on the list?');
  assert.match(out[1], /added bread/);
});

test('gain 2: "I buy a ball" then "three of them" revises the purchase, and the money follows', async () => {
  const { out } = await say(matrix, ['I have 20 lei', 'I buy a ball', 'three of them', 'how much money do I have?']);
  assert.match(out[2], /3 balls/);
  assert.match(out[3], /5 lei/);
});

test('gain 3: "undo that" takes the purchase back and the money is back', async () => {
  const { out, s } = await say(matrix, ['I have 20 lei', 'I buy a ball', 'how much money do I have?', 'undo that', 'how much money do I have?']);
  assert.match(out[2], /15 lei/);
  assert.match(out[3], /took that back/);
  assert.match(out[4], /20 lei/);
  assert.equal(s.isession.memory.find('kids.shop.purchase').length, 0, 'the session memory agrees (charts and documents see no purchase)');
});

test('gain 4: "why?" after a shop answer says what it rests on (the library\'s explain)', async () => {
  const { out } = await say(matrix, ['I have 20 lei', 'I buy a ball', 'how much money do I have?', 'why?']);
  assert.match(out[3], /I worked that out from what you told me: "I have 20 lei" and "I buy a ball"/);
  const ops_ = await say(ops, ['I have 20 lei', 'I buy a ball', 'how much money do I have?', 'why?']);
  assert.doesNotMatch(ops_.out[3], /worked that out/, 'with the switch off the answer is the old one');
});

test('gain 5: "I got 5 lei back for a book, what did I pay?" answers 17 (abduction)', async () => {
  const { out } = await say(matrix, ['I got 5 lei back for a book, what did I pay?']);
  assert.match(out[0], /You paid 17 lei/);
});

test('matrix lists are visible to the worlds that read the session memory (mirror=)', async () => {
  const { s } = await say(matrix, ['add milk to my shopping list', 'add eggs to my shopping list', 'remove eggs from my shopping list']);
  const entries = s.isession.memory.find('kids.tasks.entry').map((w) => w.entries.find((e) => e.key.endsWith('.text')).value.v);
  assert.deepEqual(entries, ['milk']);
});

test('the library\'s steps are ticks of the turn budget, sites prefixed sopworld.; running out ends the turn like any other site', async () => {
  const s = matrix.createSession({ language: 'en' });
  await s.send('I have 20 lei', {});
  const b = createBudget();
  const t = installBudget(b, { force: true });
  try {
    await s.send('how much money do I have?', {});
  } finally { releaseBudget(t); }
  const sites = Object.keys(b.bySite).filter((k) => k.startsWith('sopworld.'));
  assert.ok(sites.length > 0, `ticks at ${JSON.stringify(b.bySite)}`);
  // a budget that allows almost nothing: the library call stops, the host layer throws BudgetExceeded for the site
  const tiny = createBudget({ perTurn: 3, perSite: 3 });
  const t2 = installBudget(tiny, { force: true });
  const r = s.isession.rs;
  try {
    assert.throws(() => r.tell([...s.isession.memory.find('kids.shop.money')].map((w) => ({ ...w, id: 'x1' }))), (e) => isBudgetExceeded(e) && String(e.site).startsWith('sopworld.'));
  } finally { releaseBudget(t2); }
});

test('forks: a dry run or a snapshot of a session never changes the original World', async () => {
  const s = matrix.createSession({ language: 'en' });
  await s.send('I have 20 lei', {});
  const copy = s.isession.clone();
  await s.send('I buy a ball', {});
  const q = (sess) => sess.rs.world.query({ type: 'kids.shop.balance', seek: 'amount' }).value;
  assert.equal(q(s.isession), '15');
  assert.equal(q(copy), '20', 'the clone is as it was when it was made');
  const f = s.forkForValidation();
  f.isession.add([]);
  assert.equal(q(f.isession), '15');
});

test('a statement the library refuses is recorded and the world stays as it was', async () => {
  const { s } = await say(matrix, ['Tom has 2 apples', 'Tom gives away 5 apples']);
  assert.ok(s.isession.rs.refused.length >= 1, JSON.stringify(s.isession.rs.refused));
  assert.equal(s.isession.rs.world.query({ type: 'kids.arith.holding', seek: 'count', where: { owner: '$e.tom', item: 'apple' } }).value, '2');
});

test('the setting is part of the webchat defaults and an unknown saved value is ops', async () => {
  const { DEFAULT_SETTINGS, migrateSettings } = await import('../docs/webchat/ui/settings.mjs');
  assert.equal(DEFAULT_SETTINGS.reasoner, 'ops');
  assert.equal(migrateSettings({ reasoner: 'magic', settingsVersion: 2 }).settings.reasoner, 'ops');
  assert.equal(migrateSettings({ reasoner: 'matrix', settingsVersion: 2 }).settings.reasoner, 'matrix');
});

test('the build ships the library and the fns of matrix worlds, versioned like every module of the engine worker', async () => {
  const { buildWebchat } = await import('../scripts/build-webchat.mjs');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const out = await mkdtemp(path.join(tmpdir(), 'psys2-reasoner-'));
  try {
    await buildWebchat({ outDir: out });
    const index = JSON.parse(await readFile(path.join(out, 'worlds/index.json'), 'utf8'));
    assert.equal(index.worlds['kids.shop'].fnsUrl, 'worlds/kids.shop/fns.mjs');
    assert.ok(index.worlds['kids.shop'].files['matrix.sop']);
    assert.equal(index.worlds['kids.time'].fnsUrl, undefined);
    const dialog = await readFile(path.join(out, 'lib/dialog/index.mjs'), 'utf8');
    assert.match(dialog, /\.\.\/reasoner\/index\.mjs\?v=[0-9a-f]{10}/, 'the reasoner module is in the versioned graph');
    const reasoner = await readFile(path.join(out, 'lib/reasoner/index.mjs'), 'utf8');
    assert.match(reasoner, /\.\.\/vendor\/sopworld\/sopworld\.mjs\?v=[0-9a-f]{10}/, 'so is the vendored library');
    assert.equal((await readFile(path.join(out, 'lib/vendor/sopworld/sopworld.mjs'))).length, readFileSync(path.join(ROOT, 'src/vendor/sopworld/sopworld.mjs')).length, 'copied as it is');
  } finally { await rm(out, { recursive: true, force: true }); }
});
