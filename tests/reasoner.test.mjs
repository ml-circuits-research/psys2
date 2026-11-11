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
  assert.match(notes, /775dfe7cd468fab8e4a48fb6dd9ca83e3414c576/, 'the commit is named');
  assert.match(notes, /build `c034e3804d4e`/, 'the build is recorded');
  assert.match(notes, new RegExp(`${file.length} bytes`), 'the size is recorded');
  assert.match(notes, new RegExp(createHash('sha256').update(file).digest('hex')), 'the sha256 of the vendored file is recorded');
  assert.match(String(file.subarray(0, 120)), /^\/\/ sopworld 0\.6\.1 /);
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

test('parity gate (switch on): kids.shop 147/147, kids.tasks 232/232, kids.arith 217/217', async () => {
  for (const [id, n] of [['kids.shop', 147], ['kids.tasks', 232], ['kids.arith', 217]]) {
    const r = await runWorldTests(matrix, id);
    assert.deepEqual(r.failed.map((f) => f.id), [], id); assert.equal(r.total, n);
  }
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
  const tiny = createBudget({ sites: { 'sopworld.match': 1, 'sopworld.chase': 1, 'sopworld.validate': 1, 'sopworld.fluent': 1 } });
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

test('an impossible statement is kept and flagged by the library (a soft constraint), and the answer says why', async () => {
  const { s, out } = await say(matrix, ['Tom has 2 apples', 'Tom gives away 5 apples', 'How many apples does Tom have?']);
  const rs = s.isession.rs;
  assert.equal(rs.refused.length, 0, 'nothing is refused: the statement stays, somebody said it');
  assert.equal(rs.world.ofType('core.issue').length, 1, 'and it stands as an issue of the world');
  assert.match(out[2], /does not add up. Tom only had 2 apples, so Tom cannot \w+( away)? 5/);
});

// the state of the three worlds is derived from the library (toState), so the dialogue layer's snapshots cannot hold something the library does not
const derived = (s) => {
  const rs = s.isession.rs;
  const states = {};
  for (const [id, toState] of rs.reasoner.stateOf) states[id] = toState({ find: (t) => rs.world.ofType(t), query: (q) => rs.world.query(q) });
  return states;
};
const sameAsLibrary = (s, ids) => {
  const d = derived(s);
  for (const id of ids) {
    if (s.isession.state[id] === undefined) assert.equal(JSON.stringify(d[id]), s.isession.rs.reasoner.emptyState(id), `${id}: a world nobody used has no state and the library has nothing of it`);
    else assert.deepEqual(s.isession.state[id], d[id], `${id}: the session state is what the library says`);
  }
};

test('one undo: "that\'s wrong" + "yes" rewinds the library, and the state and the memory follow (shop, arith and tasks)', async () => {
  const shop = await say(matrix, ['I have 20 lei', 'I buy a ball', 'three of them', 'how much money do I have?', "that's wrong", 'yes', 'how much money do I have?']);
  assert.match(shop.out[3], /5 lei/);
  assert.match(shop.out[4], /Shall I undo it/);
  assert.match(shop.out[5], /undid it/);
  assert.match(shop.out[6], /15 lei/, 'the library has the purchase back at one ball');
  assert.equal(shop.s.isession.state['kids.shop'].money, 15);
  assert.deepEqual(shop.s.isession.state['kids.shop'].purchases.map((p) => p.count), [1]);
  sameAsLibrary(shop.s, ['kids.shop', 'kids.arith', 'kids.tasks']);

  // kids.arith has no request that changes the world, so its statements are taken back with "undo that" (next test)

  const tasks = await say(matrix, ['add milk to my shopping list', 'add eggs to my shopping list', "that's wrong", 'yes', 'what is on my shopping list?']);
  assert.match(tasks.out[4], /milk/);
  assert.doesNotMatch(tasks.out[4], /eggs/);
  assert.equal(tasks.s.isession.state['kids.tasks'].lists.shopping.length, 1);
  sameAsLibrary(tasks.s, ['kids.shop', 'kids.arith', 'kids.tasks']);
});

test('one undo: a statement of kids.arith is taken back with "undo that": library, state and memory agree', async () => {
  const arith = await say(matrix, ['Tom has 3 apples', 'Ana has 2 apples', 'Tom gives 2 apples to Ana', 'How many apples does Ana have?', 'undo that', 'How many apples does Ana have?', 'How many apples does Tom have?']);
  assert.match(arith.out[3], /Ana has 4 apples/);
  assert.match(arith.out[4], /took that back/);
  assert.match(arith.out[5], /Ana has 2 apples/);
  assert.match(arith.out[6], /Tom has 3 apples/);
  assert.deepEqual(arith.s.isession.state['kids.arith'].holdings, { 'e.tom': { apple: 3 }, 'e.ana': { apple: 2 } });
  assert.equal(arith.s.isession.memory.find('kids.arith.give').length, 0);
  sameAsLibrary(arith.s, ['kids.shop', 'kids.arith', 'kids.tasks']);
});

test('one undo: "undo that" and the undo of the dialogue layer are the same rewind; a repair that gives up puts the library back', async () => {
  const a = await say(matrix, ['I have 20 lei', 'I buy a ball', 'undo that', 'how much money do I have?']);
  assert.match(a.out[2], /took that back/);
  assert.match(a.out[3], /20 lei/);
  sameAsLibrary(a.s, ['kids.shop']);
  assert.equal(a.s.isession.rs.canUndo(a.s._msg), true, 'the money statement can still be taken back');
  const b = await say(matrix, ['I have 20 lei', 'I buy a ball', 'three of them', 'undo that', 'how much money do I have?', 'undo that', 'how much money do I have?']);
  assert.match(b.out[4], /15 lei/, 'undo takes back the revision only');
  assert.match(b.out[6], /20 lei|know/, 'and the next one the purchase');
  sameAsLibrary(b.s, ['kids.shop']);
  // the function a rewind returns puts everything back: the library, the state and the session memory
  const c = await say(matrix, ['I have 20 lei', 'I buy a ball']);
  const rs = c.s.isession.rs, bal = () => rs.world.query({ type: 'kids.shop.balance', seek: 'amount' }).value;
  const redo = rs.rewind(rs.turns.at(-1).mark, c.s.isession);
  assert.equal(bal(), '20'); assert.equal(c.s.isession.memory.find('kids.shop.purchase').length, 0);
  redo();
  assert.equal(bal(), '15'); assert.equal(c.s.isession.memory.find('kids.shop.purchase').length, 1);
  sameAsLibrary(c.s, ['kids.shop']);
});

test('the switch does not touch a world without reasoner=matrix: the same messages give the same replies, statuses and state under both settings', async () => {
  const run = async (e) => {
    const s = e.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'guess' });
    const rows = [];
    for (const m of ['I am thinking of an animal', 'Sigur, bine.', 'yes', 'is it big?', 'what is the answer to life']) {
      const before = JSON.stringify(Object.fromEntries(Object.entries(s.state()).filter(([k]) => !['ui.help'].includes(k))));
      const r = await s.send(m, m === 'Sigur, bine.' ? { language: 'auto' } : {});
      const after = JSON.stringify(Object.fromEntries(Object.entries(s.state()).filter(([k]) => !['ui.help'].includes(k))));
      rows.push({ m, text: r.text, statuses: r.statuses, changed: before !== after, guess: s.state()['games.guess'] });
    }
    return rows;
  };
  const off = await run(ops), on = await run(matrix);
  assert.deepEqual(on, off);
  // the case that once differed (games.guess#030.ro): a world that is not a matrix world must be read and answered alike; the lazily created state of the world that read the sentence counts as a change in both
  assert.equal(on[1].changed, true);
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
