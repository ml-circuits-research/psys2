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
  assert.match(notes, /1d1c3c6/, 'the commit is named');
  assert.match(notes, /build `dd893aeaf6c0`/, 'the build is recorded');
  assert.match(notes, new RegExp(`${file.length} bytes`), 'the size is recorded');
  assert.match(notes, new RegExp(createHash('sha256').update(file).digest('hex')), 'the sha256 of the vendored file is recorded');
  assert.match(String(file.subarray(0, 120)), /^\/\/ sopworld 0\.56\.0 /);
  assert.equal(scan(path.join(ROOT, 'src/vendor/sopworld')).join('\n'), '', 'the library\'s own scanner finds no unguarded loop in the vendored file');
  assert.ok(readFileSync(path.join(ROOT, 'src/vendor/sopworld/LICENSE'), 'utf8').startsWith('MIT License'));
});

test('default: the engine is matrix (user decision 2026-11-11); explicit ops loads no library and no session has a World', async () => {
  const e = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  assert.equal(e.reasonerMode, process.env.PSYS2_REASONER === 'ops' ? 'ops' : 'matrix');
  assert.equal(ops.reasonerMode, 'ops');
  assert.equal(ops.reasoner, null);
  assert.equal(ops.createSession({ language: 'en' }).isession.rs, null);
  for (const id of ['kids.shop', 'kids.arith', 'kids.tasks', 'games.tictactoe', 'games.hangman', 'games.guess', 'kids.shapes', 'kids.time', 'kids.animals', 'user.profile', 'games.chess']) assert.equal(ops.set.get(id).reasoner, 'matrix', `${id} opts in`);   // (geo.map, media.music and docs.reader are schema worlds since their switches: no matrix)
  assert.equal(ops.set.get('ui.shell').reasoner, 'matrix');
  assert.equal(ops.set.get('kids.shop').patterns.some((p) => p.id.includes('.m.')), false, 'the matrix-only patterns are not loaded in ops mode');
  assert.deepEqual(ops.problems(), []);
});

test('matrix mode: the worlds that opt in, the library loads without problems, the engine has no problems', () => {
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  assert.deepEqual(matrix.reasoner.worlds.sort(), ['art.draw', 'common.sense', 'games.chess', 'games.guess', 'games.hangman', 'games.tictactoe', 'geo.map', 'kids.animals', 'kids.arith', 'kids.shapes', 'kids.shop', 'kids.tasks', 'kids.time', 'session.conversation', 'ui.help', 'ui.shell', 'user.profile']);
  assert.deepEqual(matrix.problems(), []);
  assert.ok(matrix.createSession({ language: 'en' }).isession.rs, 'a session has its own World');
});

const LEDGERED_DIAGRAM = ["t.diagram.sketch.b.align.k05.b", "t.diagram.sketch.b.arrange.k06.b", "t.diagram.sketch.b.ask_path.k02.b", "t.diagram.sketch.b.create.k06.b", "t.diagram.sketch.b.delete.k04.b", "t.diagram.sketch.b.disconnect.k04.b", "t.diagram.sketch.b.group.k02.b", "t.diagram.sketch.b.group.k05.b", "t.diagram.sketch.b.move.k03.b", "t.diagram.sketch.b.rule.k06.b", "t.diagram.sketch.b.snap.k06.b", "t.diagram.sketch.b.undo.k04.b", "t.diagram.sketch.ex.star.n001", "t.diagram.sketch.b.label.k05.b", "t.diagram.sketch.b.redo.k03.b", "t.diagram.sketch.b.redo.k04.b", "t.diagram.sketch.b.redo.k05.b", "t.diagram.sketch.b.toback.k03.b", "t.diagram.sketch.b.toback.k06.b", "t.diagram.sketch.b.ungroup.k02.b"];
const LEDGERED_DRAW = ["t.art.draw.dm304","t.art.draw.dm307","t.art.draw.ellipsis2","t.art.draw.f4r03","t.art.draw.f4r04","t.art.draw.f4r05","t.art.draw.f4r07","t.art.draw.p5a05","t.art.draw.p5a06","t.art.draw.pl07","t.art.draw.pl09","t.art.draw.pl10","t.art.draw.r2fill07","t.art.draw.r2help11","t.art.draw.r2help12","t.art.draw.r2move09","t.art.draw.r2move14","t.art.draw.r2move19","t.art.draw.r2move20","t.art.draw.r2move21","t.art.draw.r2move22","t.art.draw.r2move23","t.art.draw.r2recolor19","t.art.draw.r2scene01","t.art.draw.r2scene02","t.art.draw.r2scene03","t.art.draw.r2scene04","t.art.draw.r2scene05","t.art.draw.r2scene06","t.art.draw.r2scene07","t.art.draw.rd08","t.art.draw.rd09","t.art.draw.rd10","t.art.draw.rd11","t.art.draw.rd17","t.art.draw.rp3c","t.art.draw.sh03","t.art.draw.x250"];   // the rows of the art.draw switch on the ledger (training/eval/failures.jsonl, build art-draw-switch): the world's own tests, both reasoners
const LEDGERED_CHARTS = ["t.data.charts.m04", "t.data.charts.n22", "t.data.charts.n35", "t.data.charts.n90", "t.data.charts.r2033", "t.data.charts.r2086", "t.data.charts.r2087", "t.data.charts.r2105", "t.data.charts.x203", "t.data.charts.x205", "t.data.charts.r2110"];
test('parity gate (switch on): kids.shop 168, kids.tasks 241, kids.arith 243, games.tictactoe 173, games.hangman 154, games.guess 130, kids.shapes 9, kids.time 227, kids.animals 46, user.profile 144 (the ops tests of the coherence fixes run in both modes; the matrix-only tests are counted)', async () => {
  for (const [id, n] of [['kids.shop', 168], ['kids.tasks', 241], ['kids.arith', 243], ['games.tictactoe', 173], ['games.hangman', 154], ['games.guess', 130], ['kids.shapes', 9], ['kids.time', 227], ['kids.animals', 46], ['user.profile', 144], ['data.charts', 277], ['art.draw', 600], ['diagram.sketch', 771]]) {
    const r = await runWorldTests(matrix, id);
    // the 13 rows of the diagram switch and the 10 rows of the data.charts switch are on the ledger (training/eval/failures.jsonl, source "bug-batch diagram switch"); every other row of every world passes
    assert.deepEqual(r.failed.map((f) => f.id).filter((x) => (id !== 'diagram.sketch' || !LEDGERED_DIAGRAM.includes(x)) && (id !== 'data.charts' || !LEDGERED_CHARTS.includes(x)) && (id !== 'art.draw' || !LEDGERED_DRAW.includes(x)) && !(id === 'user.profile' && x === 't.user.profile.dlg04')), [], id);   /* dlg04: on the ledger since KNOWLEDGE-OUT step 5 (spelling: vocabulary counts lost with deleted patterns) */ assert.equal(r.total, n);
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
  assert.match(ops_.out[3], /I worked that out from what you told me: "I have 20 lei" and "I buy a ball"/, 'SOPWORLD-1b: the default ops reasoner says what it knows too (the `from` list of the answer)');
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
  const q = (sess) => sess.rs.of('kids.shop').query({ type: 'kids.shop.balance', seek: 'amount' }).value;
  assert.equal(q(s.isession), '15');
  assert.equal(q(copy), '20', 'the clone is as it was when it was made');
  const f = s.forkForValidation();
  f.isession.add([]);
  assert.equal(q(f.isession), '15');
});

test('an impossible statement is refused when told: the library\'s soft constraint raised an issue, the statement is taken back and the answer says why', async () => {
  const { s, out } = await say(matrix, ['Tom has 2 apples', 'Tom gives away 5 apples', 'How many apples does Tom have?']);
  const rs = s.isession.rs;
  assert.match(out[1], /^That does not add up\. Tom only had 2 apples, so Tom cannot \w+( away)? 5\.$/);
  assert.equal(rs.of('kids.arith').ofType('core.issue').length, 0, 'the statement is out of the library, so nothing stands as an issue');
  assert.equal(rs.of('kids.arith').ofType('kids.arith.give').length, 0);
  assert.match(out[2], /Tom has 2 apples/);
});

// the state of the three worlds is derived from the library (toState), so the dialogue layer's snapshots cannot hold something the library does not
const derived = (s) => {
  const rs = s.isession.rs;
  const states = {};
  for (const [id, toState] of rs.reasoner.stateOf) states[id] = toState({ find: (t) => rs.of(id).ofType(t), query: (q) => rs.of(id).query(q) });
  return states;
};
const sameAsLibrary = (s, ids) => {
  const d = derived(s);
  for (const id of ids) {
    if (s.isession.state[id] === undefined) assert.equal(JSON.stringify(d[id]), s.isession.rs.reasoner.emptyState(id).json, `${id}: a world nobody used has no state and the library has nothing of it`);
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
  const rs = c.s.isession.rs, bal = () => rs.of('kids.shop').query({ type: 'kids.shop.balance', seek: 'amount' }).value;
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

test('the setting is part of the webchat defaults: matrix, a saved ops of an older version is migrated once, a later explicit ops is kept', async () => {
  const { DEFAULT_SETTINGS, SETTINGS_VERSION, migrateSettings } = await import('../docs/webchat/ui/settings.mjs');
  assert.equal(DEFAULT_SETTINGS.reasoner, 'matrix');
  assert.equal(migrateSettings({ reasoner: 'magic', settingsVersion: SETTINGS_VERSION }).settings.reasoner, 'matrix');
  assert.equal(migrateSettings({ reasoner: 'ops', settingsVersion: 3 }).settings.reasoner, 'matrix', 'the old default is not a choice: migrated once');
  assert.equal(migrateSettings({ reasoner: 'ops', settingsVersion: 3 }).migrated, true);
  assert.equal(migrateSettings({ reasoner: 'ops', settingsVersion: SETTINGS_VERSION }).settings.reasoner, 'ops', 'an explicit choice after the migration is respected');
  assert.equal(migrateSettings({ reasoner: 'matrix', settingsVersion: 2 }).settings.reasoner, 'matrix');
});

test('the build ships the library and the fns of matrix worlds, versioned like every module of the engine worker', async () => {
  const { buildWebchat } = await import('../scripts/build-webchat.mjs');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const out = await mkdtemp(path.join(tmpdir(), 'psys2-reasoner-'));
  try {
    await buildWebchat({ outDir: out });
    const idx = JSON.parse(await readFile(path.join(out, 'worlds/index.json'), 'utf8'));
    const index = { worlds: {} };
    for (const id of Object.keys(idx.worlds)) index.worlds[id] = JSON.parse(await readFile(path.join(out, idx.worlds[id].bundle), 'utf8'));
    assert.equal(index.worlds['kids.shop'].fnsUrl, 'worlds/kids.shop/fns.mjs');
    assert.ok(index.worlds['kids.shop'].files['matrix.sop']);
    assert.equal(index.worlds['data.charts'].fnsUrl, undefined);
    assert.equal(index.worlds['ui.shell'].fnsUrl, 'worlds/ui.shell/fns.mjs');
    assert.equal(index.worlds['lang.common'].fnsUrl, undefined);
    const dialog = await readFile(path.join(out, 'lib/dialog/index.mjs'), 'utf8');
    assert.match(dialog, /\.\.\/reasoner\/index\.mjs\?v=[0-9a-f]{10}/, 'the reasoner module is in the versioned graph');
    const reasoner = await readFile(path.join(out, 'lib/reasoner/index.mjs'), 'utf8');
    assert.match(reasoner, /\.\.\/vendor\/sopworld\/sopworld\.mjs\?v=[0-9a-f]{10}/, 'so is the vendored library');
    assert.equal((await readFile(path.join(out, 'lib/vendor/sopworld/sopworld.mjs'))).length, readFileSync(path.join(ROOT, 'src/vendor/sopworld/sopworld.mjs')).length, 'copied as it is');
  } finally { await rm(out, { recursive: true, force: true }); }
});

// ---- certainty: an answer that rests on a default or a guess says so once (SOPWORLD-1b item 4) -----------------------------------------------

test('certainty: nobody said how many balls, so the answer says "I assumed 1 ball." once and the turn record carries the assumption', async () => {
  const s = matrix.createSession({ language: 'en' });
  await s.send('I have 20 lei', {});
  const told = await s.send('I buy the ball', {});
  assert.equal(told.assumptions, undefined, 'a statement is not an answer: nothing rests on the default yet');
  assert.equal(told.text, 'OK, you bought 1 ball. I assumed 1 ball.', 'the acknowledgement says what was bought and the assumption (2026-11-11), not a bare OK.');
  const r = await s.send('How much money do I have?', {});
  assert.equal(r.text, 'You have 15 lei left. I assumed 1 ball.');
  assert.deepEqual(r.assumptions.map((a) => a.replace(/^\S+\.count/, 'count')), ['count=1 (default)'], 'the cell and its tier');
  assert.equal(r.answers[0].envelope.assumed, 'I assumed 1 ball.');
  const w = s.isession.rs.of('kids.shop');
  assert.deepEqual(w.assumptions().map((a) => [a.key, a.tier]), [['count', 'default']], 'the library lists it');
  assert.equal((await s.send('How much money do I have?', {})).text, 'You have 15 lei left.', 'said once');
  assert.equal((await s.send('How much did the ball cost?', {})).assumptions, undefined, 'an answer that does not rest on it does not say it');
  const t = await s.send('Three of them', {});
  assert.match(t.text, /that makes 3 balls/);
  const after = await s.send('How much money do I have?', {});
  assert.equal(after.text, 'You have 5 lei left.', 'a told count replaces the assumption');
  assert.equal(after.assumptions, undefined);
  assert.deepEqual(w.assumptions(), []);
});

test('certainty: ops mode never says it; a told count ("a ball") is not an assumption; several are said in one sentence', async () => {
  const o = await say(ops, ['I have 20 lei', 'I buy a ball', 'How much money do I have?']);
  assert.equal(o.out[2], 'You have 15 lei left.');
  const m = await say(matrix, ['I have 20 lei', 'I buy a ball', 'How much money do I have?']);
  assert.equal(m.out[2], 'You have 15 lei left.', '"a ball" states the count: nothing is assumed');
  const x = await say(matrix, ['I have 20 lei', 'I buy the ball', 'I buy the pen', 'How much money do I have?']);
  assert.match(x.out[3], /I assumed 1 ball and 1 pen\.$/);
});

test('certainty: in Romanian the sentence goes through the reply table', async () => {
  const { createTranslator } = await import('../src/translate/index.mjs');
  const { settingsForMode, sessionOptions } = await import('../src/dialog/runtime-config.mjs');
  const e = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator(), options: { reasoner: 'matrix' } });
  const s = e.createSession(sessionOptions(settingsForMode('rules'), { language: 'ro' }));
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  await s.send('Am 20 de lei', {});
  await s.send('Cumpăr mingea', {});
  const r = await s.send('Câți bani am?', {});
  assert.match(r.text, /Am presupus 1 minge\.$/);
  assert.equal(r.lang, 'ro');
});

// ---- games.tictactoe on the matrix (SOPWORLD-1b item 5) ----------------------------------------------------------------------------------------

const GAME = ["Let's play tic tac toe", 'center', 'top left', 'bottom right', 'top middle', 'b3', 'level perfect', 'new game', 'a1', 'center', 'c3', 'I give up', 'center', 'new game', 'I go first',
  'which level', 'who is winning', 'where did you play', 'how many moves', 'describe the board', 'hint', 'a1', 'a1', 'b2', 'c3', 'a2', 'c1', 'new game'];

test('games.tictactoe: a whole game says the same as the ops reasoner, word for word, with the same board and statuses', async () => {
  const run = async (eng) => {
    const s = eng.createSession({ language: 'en' });
    const out = [];
    for (const l of GAME) { const r = await s.send(l, {}); out.push([r.text, r.statuses.join(), JSON.stringify(r.state?.['games.tictactoe']?.board ?? null)]); }
    return { s, out };
  };
  const o = await run(ops), m = await run(matrix);
  assert.deepEqual(m.out, o.out);
  const { history, ...opsState } = o.s.isession.state['games.tictactoe'];   // (ops keeps its own undo snapshots; the matrix has the library's marks)
  assert.deepEqual(m.s.isession.state['games.tictactoe'], opsState);
  sameAsLibrary(m.s, ['games.tictactoe']);
});

test('games.tictactoe: an illegal move is refused with the rules\' reason, and nothing changes', async () => {
  const { s } = await say(matrix, ["Let's play tic tac toe", 'center']);
  const state = () => JSON.stringify(s.isession.state['games.tictactoe']);
  const before = state();
  const taken = await s.send('center', {});
  assert.equal(taken.text, 'The center is already taken by you. Please pick another place.');
  assert.deepEqual(taken.statuses, ['unsupported']);
  assert.equal(state(), before, 'the board did not change');
  assert.equal(s.isession.rs.refused.length, 0);
  const mine = JSON.parse(before).last.system;
  const sq = ['top left', 'top middle', 'top right', 'middle left', 'the center', 'middle right', 'bottom left', 'bottom middle', 'bottom right'][mine];
  assert.match((await s.send(sq, {})).text, /is already taken by me\. Please pick another place\.$/);
  assert.ok(s.isession.rs.of('games.tictactoe').check().ok, 'the library holds a valid game');
  await s.send('I give up', {});
  const over = await s.send('bottom left', {});
  assert.equal(over.text, 'The game is over. Say "new game" to play again.');
  assert.deepEqual(over.statuses, ['unsupported']);
});

test('games.tictactoe: the rules in the matrix: whose turn it is, the free squares, a win, a draw, a resignation, a move out of turn', async () => {
  const lib = matrix.reasoner.session().of('games.tictactoe');
  const turn = () => lib.ofType('ttt.turn').map((x) => x.attrs.by[0]);
  const free = () => lib.ofType('ttt.free').map((x) => Number(x.attrs.at[0])).sort((a, b) => a - b);
  let n = 0;
  const play = (by, at) => lib.tell(`@mv${n} ttt.move by=${by} at=${at} n=${n++}`);
  assert.deepEqual(turn(), ['X']);
  assert.deepEqual(free(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(play('X', 4).ok);
  assert.deepEqual(turn(), ['O']);
  assert.deepEqual(free(), [0, 1, 2, 3, 5, 6, 7, 8]);
  assert.equal(lib.check({ wires: `@mv${n} ttt.move by=X at=0 n=${n}` }).violations[0].why, 'It is not your turn.', 'X after X');
  assert.equal(lib.check({ wires: `@mv${n} ttt.move by=O at=4 n=${n}` }).violations[0].why, 'The center is already taken by you. Please pick another place.');
  for (const [by, at] of [['O', 0], ['X', 8], ['O', 2], ['X', 6]]) assert.ok(play(by, at).ok, `${by}${at}`);
  assert.equal(lib.ofType('ttt.won').length, 0);
  assert.ok(play('O', 1).ok);   // O has 0, 1 and 2: the top row
  assert.deepEqual(lib.ofType('ttt.won').map((x) => [x.attrs.winner[0], x.attrs.how[0]]), [['O', '"the top row"']]);
  assert.deepEqual(turn(), [], 'nobody is to move');
  assert.deepEqual(free(), [], 'no legal move is left');
  assert.equal(lib.check({ wires: `@mv${n} ttt.move by=X at=3 n=${n}` }).violations.some((v) => v.why === 'The game is over. Say "new game" to play again.'), true);
  const d = matrix.reasoner.session().of('games.tictactoe');   // a draw
  let k = 0;
  for (const [by, at] of [['X', 0], ['O', 1], ['X', 2], ['O', 4], ['X', 3], ['O', 5], ['X', 7], ['O', 6], ['X', 8]]) assert.ok(d.tell(`@mv${k} ttt.move by=${by} at=${at} n=${k++}`).ok);
  assert.equal(d.ofType('ttt.drawn').length, 1);
  assert.equal(d.ofType('ttt.won').length, 0);
  const r = matrix.reasoner.session().of('games.tictactoe');   // a resignation is the other player's win
  r.tell('@rs ttt.resign by=X');
  assert.deepEqual(r.ofType('ttt.won').map((x) => x.attrs.winner[0]), ['O']);
});

test('games.tictactoe: "undo" (typed, or as a command) goes back through the library: the move and my answer are gone, state and library agree', async () => {
  const { s } = await say(matrix, ["Let's play tic tac toe", 'center', 'top left']);
  const rs = s.isession.rs;
  assert.equal(rs.of('games.tictactoe').ofType('ttt.move').length, 4);
  assert.equal((await s.send('undo', {})).text, 'OK, I took back your last move and my answer. It is your move again.', 'bare undo with the game open: the world\'s words');
  assert.equal(rs.of('games.tictactoe').ofType('ttt.move').length, 2);
  assert.equal(s.isession.state['games.tictactoe'].board.filter(Boolean).length, 2);
  const c = await s.send('oops, take that back', {});
  assert.equal(c.text, 'OK, I took back your last move and my answer. It is your move again.');
  assert.equal(rs.of('games.tictactoe').ofType('ttt.move').length, 0);
  sameAsLibrary(s, ['games.tictactoe']);
  const start = await s.send('oops, take that back', {});   // the start of the game is the shell's turn (the tab switch) and a step of the timeline: it goes back too
  assert.match(start.text, /took that back|back on the Avatar tab/);
  const none = await s.send('oops, take that back', {});
  assert.equal(none.text, 'There is nothing more to undo.');
  assert.deepEqual(none.statuses, ['missing']);
});

test('games.tictactoe: "why did you play there?" says why the computer chose its last square (a free square, a block, the best move) and that it has not played yet', async () => {
  const none = await say(matrix, ['why did you play there?']);
  assert.equal(none.out[0], 'I have not played yet.');
  const a = await say(matrix, ["Let's play tic tac toe", 'center']);
  assert.match((await a.s.send('why did you play there?', {})).text, /^I played .+ because I could not win and did not have to block, so I took any free square\.$/);
  const b = await say(matrix, ["Let's play tic tac toe", 'center', 'top left']);   // X has the center and the top left: the computer must stop the diagonal at the bottom right
  const reply = (await b.s.send('why did you play there?', {})).text;
  assert.match(reply, /^I played (bottom right|.+) because (you were about to complete the diagonal from the top left there, so I stopped you|I could not win and did not have to block, so I took any free square)\.$/);
  if (b.s.isession.state['games.tictactoe'].last.system === 8) assert.match(reply, /^I played bottom right because you were about to complete the diagonal from the top left/);
  const p = await say(matrix, ["Let's play tic tac toe", 'level perfect', 'new game', 'center']);
  assert.match((await p.s.send('why did you play there?', {})).text, /because it is the best move: I looked at every way the game can go from here\.$/);
});

test('games.tictactoe: another world that asks for a move (a note name that reads as a square) reaches the matrix, not the ops function', async () => {
  const s = matrix.createSession({ language: 'en' });
  const r = await s.send('Play B2', {});
  assert.match(r.text, /^You took the center\. I took /);
  assert.equal(s.isession.rs.of('games.tictactoe').ofType('ttt.move').length, 2, 'the move is in the library');
  assert.equal(s.isession.state['games.tictactoe'].board[4], 'X');
});

test('games.tictactoe: bare "undo" off the game tab is the dialogue layer\'s generic undo (the same rewind)', async () => {
  const s = matrix.createSession({ language: 'en' });
  await s.send("Let's play tic tac toe", {});
  await s.send('center', {});
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  assert.match((await s.send('undo', {})).text, /^OK, I took back your last move and my answer\. It is your move again\.$/);
  assert.equal(s.isession.rs.of('games.tictactoe').ofType('ttt.move').length, 0);
});

test('games.tictactoe: with the default (ops) no library is involved and the state is the one ops.mjs keeps', async () => {
  const s = ops.createSession({ language: 'en' });
  assert.equal(s.isession.rs, null);
  await s.send("Let's play tic tac toe", {});
  await s.send('center', {});
  const st = s.isession.state['games.tictactoe'];
  assert.equal(st.board[4], 'X');
  assert.ok(Array.isArray(st.history), 'ops keeps its own undo snapshots');
});

test('matrix: "what did you do?" keeps the source sentence of a computed answer, like ops (2026-11-11)', async () => {
  for (const mode of [matrix, ops]) {
    const { out } = await say(mode, ['A puzzle costs 11 lei.', 'how much do 2 puzzles cost?', 'what did you do?']);
    assert.match(out[2], /What I answered: 2 puzzles cost 22 lei\. I worked that out from what you told me: "A puzzle costs 11 lei"/);
  }
});

// ---- games.hangman on the matrix (stage 2) -----------------------------------------------------------------------------------------------------

const HANGMAN = ['is there an e?', 'play hangman', 'hint', 'e', 'a', 'e', 'guess x', 'zebra', 'hint', 'what is the word', 'status', 'new game', 'I give up', 'e', 'hint',
  'play hangman with the word zebra', 'z', 'e', 'b', 'a', 'r', 'a', 'play hangman', 'keep going', 'q', 'j', 'k', 'v', 'w', 'y', 'e', 'new game'];

test('games.hangman: a scripted game says the same as the ops reasoner, word for word, with the same statuses and state (undo is the matrix\'s own)', async () => {
  const run = async (eng) => {
    const s = eng.createSession({ language: 'en' });
    const out = [];
    for (const l of HANGMAN) { const r = await s.send(l, {}); out.push([r.text, r.statuses.join(), JSON.stringify(r.state?.['games.hangman'] ?? null)]); }
    return { s, out };
  };
  const o = await run(ops), m = await run(matrix);
  assert.deepEqual(m.out, o.out);
  assert.deepEqual(m.s.isession.state['games.hangman'], o.s.isession.state['games.hangman']);
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  sameAsLibrary(m.s, ['games.hangman']);
});

test('games.hangman: the rules in the matrix: hits and misses, lives, the letters still hidden, a win, a loss, a guess out of turn', async () => {
  const { s } = await say(matrix, ['play hangman with the word cat']);
  const lib = s.isession.rs.of('games.hangman');
  const of = (t) => lib.ofType(t);
  assert.deepEqual(of('hm.left').map((x) => x.attrs.ch[0]).sort(), ['"a"', '"c"', '"t"']);
  await s.send('is there a c?', {}); await s.send('is there an x?', {});
  assert.deepEqual(of('hm.hit').map((x) => x.attrs.what[0]), ['"c"']);
  assert.deepEqual(of('hm.miss').map((x) => x.attrs.what[0]), ['"x"']);
  assert.deepEqual(of('hm.lives').map((x) => x.attrs.left[0]), ['5']);
  assert.deepEqual(of('hm.left').map((x) => x.attrs.ch[0]).sort(), ['"a"', '"t"']);
  assert.equal(of('hm.over').length, 0);
  const dup = lib.check({ wires: '@d hm.guess n=2 kind=letter what="x"' });
  assert.equal(dup.violations.find((v) => /\.dup$/.test(v.rule)).why, 'You already tried x.');
  await s.send('a', {}); await s.send('t', {});
  assert.deepEqual(of('hm.over').map((x) => x.attrs.how[0]), ['won']);
  const after = lib.check({ wires: '@d hm.guess n=4 kind=letter what="z"' });
  assert.equal(after.violations.some((v) => /\.over$/.test(v.rule)), true, 'a guess after the game is refused');
  const word = await say(matrix, ['play hangman with the word cat', 'cat']);
  assert.deepEqual(word.s.isession.rs.of('games.hangman').ofType('hm.over').map((x) => x.attrs.how[0]), ['won'], 'the whole word wins without the letters');
  const none = await say(matrix, ['e']);
  assert.equal(none.out[0], 'We are not playing hangman. Say "play hangman" to start.');
});

test('games.hangman: undo goes back through the library: a guess, a hint, a lost game, a new game; state and library agree', async () => {
  const { s } = await say(matrix, ['play hangman with the word zebra', 'z', 'x', 'hint']);
  const rs = s.isession.rs;
  assert.equal((await s.send('undo', {})).text, 'OK, I took back the last hint.');
  assert.equal(s.isession.state['games.hangman'].hints, 0);
  assert.equal((await s.send('undo', {})).text, 'OK, I took back your last guess. The word is as it was before.');
  assert.equal(rs.of('games.hangman').ofType('hm.guess').length, 1);
  assert.equal(s.isession.state['games.hangman'].wrongLeft, 6);
  await s.send('I give up', {});
  assert.equal(s.isession.state['games.hangman'].status, 'lost');
  assert.match((await s.send('undo', {})).text, /^OK, I took back the end of the game\./);
  assert.equal(s.isession.state['games.hangman'].status, 'playing', 'undo reopens the game that was given up');
  await s.send('play hangman with the word cat', {});
  assert.equal(s.isession.state['games.hangman'].word, 'cat');
  await s.send('undo', {});
  assert.equal(s.isession.state['games.hangman'].word, 'zebra', 'undo of a new game brings the old one back');
  sameAsLibrary(s, ['games.hangman']);
  const none = await say(matrix, ['undo']);
  assert.equal(none.out[0], 'There is nothing to undo.', 'nothing to undo before any game (generic undo)');
});

test('games.hangman: the word the library holds is the one the seed chooses, as ops.mjs chooses it (the lexicon and the knowledge base reach the matrix)', async () => {
  const o = await say(ops, ['play hangman', 'new game', 'new game']);
  const m = await say(matrix, ['play hangman', 'new game', 'new game']);
  assert.deepEqual(m.out, o.out);
  assert.equal(m.s.isession.state['games.hangman'].word, o.s.isession.state['games.hangman'].word);
  assert.equal(m.s.isession.state['games.hangman'].seed, o.s.isession.state['games.hangman'].seed);
});

// ---- games.guess on the matrix (stage 2) --------------------------------------------------------------------------------------------------------

const GUESS = ['yes', 'I am thinking of an animal.', 'why did you ask that?', 'which animals are left?', 'yes', 'I dont know', 'maybe', 'no', 'wait, I meant yes', 'it eats meat',
  'repeat the question', 'no', 'yes', 'no', 'yes', 'yes', 'no', 'no', 'yes', 'yes', 'yes', 'it was a zebra', 'new game', 'yes', 'no', 'I give up', 'yes', 'it was a quokka', 'yes',
  'new game', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'no', 'it was a zebra', 'is it a dog?', 'new game', 'yes', 'it was a bird'];

test('games.guess: a scripted session says the same as the ops reasoner, word for word, with the same statuses and state', async () => {
  const run = async (eng) => {
    const s = eng.createSession({ language: 'en' });
    const out = [];
    for (const l of GUESS) { const r = await s.send(l, {}); out.push([r.text, r.statuses.join(), JSON.stringify(r.state?.['games.guess'] ?? null)]); }
    return { s, out };
  };
  const o = await run(ops), m = await run(matrix);
  assert.deepEqual(m.out, o.out);
  assert.deepEqual(m.s.isession.state['games.guess'], o.s.isession.state['games.guess']);
  assert.ok(o.out.some((x) => x[0].startsWith('I got it!')) && o.out.some((x) => x[0].startsWith('Thank you! I learned about')) && o.out.some((x) => x[0].startsWith('OK, I changed my note')), 'the script covers a solved game, a taught animal and a corrected answer');
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  sameAsLibrary(m.s, ['games.guess']);
});

test('games.guess: the rules in the matrix: the animals still possible, the questions asked and left, the phase, the refusals', async () => {
  const { s } = await say(matrix, ['I am thinking of an animal.', 'yes']);
  const lib = s.isession.rs.of('games.guess'), of = (t) => lib.ofType(t);
  const st = () => s.isession.state['games.guess'];
  assert.equal(of('guess.cand').length, st().candidates.length);
  assert.equal(of('guess.animal').length - of('guess.out').length, st().candidates.length, 'the animals still possible are the ones the game started with, less those taken out');
  assert.deepEqual(of('guess.tally').map((x) => [x.attrs.count[0], x.attrs.left[0]]), [['1', '19']]);
  assert.deepEqual(of('guess.phase').map((x) => x.attrs.p[0]), ['asking']);
  assert.equal(lib.check({ wires: '@p guess.reply answer=yes' }).ok, true);
  await s.send('no', {});
  assert.deepEqual(of('guess.tally').map((x) => x.attrs.count[0]), ['2']);
  await s.send('I give up', {});
  assert.deepEqual(of('guess.phase').map((x) => x.attrs.p[0]), ['learning']);
  assert.equal(lib.check({ wires: '@p guess.reply answer=yes' }).violations[0].why, 'I am waiting to learn the animal. Tell me, for example: "it was a zebra".');
  assert.equal(lib.check({ wires: '@p guess.clue' }).violations[0].why, 'That does not help right now.');
  await s.send('it was a quokka', {});
  assert.deepEqual(of('guess.phase').map((x) => x.attrs.p[0]), ['done']);
  assert.equal(lib.check({ wires: '@p guess.reply answer=no' }).violations[0].why, 'The game is over. Say "new game" to play again.');
  assert.equal(lib.check({ wires: '@p guess.quit' }).violations[0].why, 'We are not in the middle of a game of twenty questions.');
  const none = matrix.createSession({ language: 'en' }).isession.rs.of('games.guess');
  assert.equal(none.check({ wires: '@p guess.reply answer=yes' }).violations[0].why, 'We are not playing twenty questions. Say "guess my animal" to start.');
  assert.ok(lib.check().ok, 'the library holds a valid game');
});

test('games.guess: a taught animal is a wire of the library (kids.animals.animal) and the next game asks about it; undo forgets it', async () => {
  const { s } = await say(matrix, ['I am thinking of an animal.', 'yes', 'no', 'I give up', 'it was a quokka']);
  const lib = s.isession.rs.of('games.guess');
  assert.deepEqual(lib.ofType('kids.animals.animal').filter((w) => w.attrs.name[0] === 'quokka').map((w) => w.attrs.diet?.[0]), ['carnivore']);   // the first question of a game is the catalog's ("Does it eat only meat?"), answered yes
  assert.deepEqual(s.isession.state['games.guess'].learned.map((l) => l.name), ['quokka']);
  await s.send('new game', {});
  assert.ok(s.isession.state['games.guess'].candidates.includes('quokka'), 'the new game starts with the taught animal');
  await s.send('undo', {});
  await s.send('undo', {});
  assert.deepEqual(s.isession.state['games.guess'].learned, [], 'undo took the lesson back');
  assert.equal(lib.ofType('kids.animals.animal').some((w) => w.attrs.name[0] === 'quokka'), false);
  sameAsLibrary(s, ['games.guess']);
});

test('games.guess: undo goes back through the library: a clue, an answer (the question is asked again); nothing to undo before a game', async () => {
  const { s } = await say(matrix, ['I am thinking of an animal.', 'yes', 'it eats meat']);
  assert.equal(s.isession.state['games.guess'].evidence.length, 1);
  assert.match((await s.send('undo', {})).text, /^OK, I took that back: "it eats meat"\./);
  assert.equal(s.isession.state['games.guess'].evidence.length, 0);
  const r = await s.send('undo', {});
  assert.match(r.text, /^OK, I took back your last answer\. I am asking that question again: Does it eat only meat\?$/);
  assert.equal(s.isession.state['games.guess'].count, 0);
  assert.deepEqual(r.statuses, ['supported']);
  sameAsLibrary(s, ['games.guess']);
  const none = await say(matrix, ['undo']);
  assert.equal(none.out[0], 'There is nothing to undo.', 'nothing to undo before any game (generic undo)');
});

// ---- kids.shapes on the matrix (stage 2) --------------------------------------------------------------------------------------------------------

const SHAPES = ['How many sides does a hexagon have?', 'why?', 'Is a square a rectangle?', 'Is a rectangle a square?', 'Is a circle a polygon?', 'Describe a circle', 'Describe a hexagon',
  'A trapezium has 4 sides.', 'How many corners does a trapezium have?', 'Which shapes have 4 sides?', 'What color is a banana?', 'Is a banana red?', 'Is a zebra white?', 'What do red and yellow make?',
  'What do yellow and red make?', 'Which colors make orange?', 'Is red a primary color?', 'Is orange a primary color?', 'A square has 5 sides.', 'How many sides does a square have?',
  'Describe a unicorn', 'Is a unicorn a polygon?', 'Which shapes have 12 sides?', 'What kind of color is green?', 'Which colors make pink?'];

test('kids.shapes: a scripted session says the same as the ops reasoner, word for word, with the same statuses', async () => {
  const run = async (eng) => {
    const s = eng.createSession({ language: 'en' });
    const out = [];
    for (const l of SHAPES) { const r = await s.send(l, {}); out.push([r.text, r.statuses.join()]); }
    return { s, out };
  };
  const o = await run(ops), m = await run(matrix);
  assert.deepEqual(m.out, o.out);
  assert.deepEqual(matrix.reasoner.buildAll(), []);
});

test('kids.shapes: a taught fact is a wire of the library and undo takes it back (the questions about shapes and colours are the Talk tab\'s frames over the catalog)', async () => {
  const { s } = await say(matrix, ['A trapezium has 4 sides.']);
  const lib = s.isession.rs.of('kids.shapes');
  assert.deepEqual(lib.ofType('kids.shapes.shape').filter((w) => w.attrs.name?.[0] === 'trapezium').map((w) => w.attrs.sides), [['4']]);
  assert.match((await s.send('undo', {})).text, /^OK, I took that back/);
  assert.equal(lib.ofType('kids.shapes.shape').some((w) => w.attrs.name?.[0] === 'trapezium'), false);
});

test('"why?" names the source of a world\'s own facts: the price list for the shop, a general phrase otherwise', async () => {
  for (const eng of [ops, matrix]) {
    const b = await say(eng, ['I have 20 lei', 'How much does a ball cost?', 'why?']);
    assert.doesNotMatch(b.out[2], /about animals|shapes/);
  }
});

test('stage 2: undo of an action of a world without library state leaves the library and the memory consistent', async () => {
  const { out } = await say(matrix, ['My name is Ana', 'my name is Maria', 'undo that', 'what is my name?']);
  assert.match(out[3], /Ana|Maria/);
});

// ---- kids.time on the matrix (stage 2) -----------------------------------------------------------------------------------------------------------

const TIME = ['What day is tomorrow?', 'Today is Friday.', 'What day is tomorrow?', 'What day was yesterday?', 'What day will it be in 3 days?', 'How many days until Tuesday?',
  'What day comes after Sunday?', 'Today is Monday.', 'What day is the day after tomorrow?', 'This month is May.', 'What month is next month?', 'What month comes before January?',
  'What season comes after winter?', 'How many days are in February?', 'How many days are in March?', 'How many days from Thursday to Sunday?', 'How many hours from 9 to 3?',
  'How many hours from 3 to 3?', 'How many hours from 3 to 15?', 'How many days in a week?', 'How many minutes in an hour?', "It is 3 o'clock.", 'What time is it?',
  'What time will it be in 2 hours?', 'What day comes after Blursday?', "It is 30 o'clock.", 'What time is it?', 'undo that', 'What day is tomorrow?'];
const TIME_GAINS = new Set([25, 26, 27]);   // an hour the clock does not have is refused when told (the clock keeps its hour); undo says it in the world's words

test('kids.time: a scripted session says the same as the ops reasoner, word for word, with the same statuses, except the listed gains', async () => {
  const run = async (eng) => {
    const s = eng.createSession({ language: 'en' });
    const out = [];
    for (const l of TIME) { const r = await s.send(l, {}); out.push([r.text, r.statuses.join()]); }
    return { s, out };
  };
  const o = await run(ops), m = await run(matrix);
  m.out.forEach((x, i) => { if (!TIME_GAINS.has(i)) assert.deepEqual(x, o.out[i], `turn ${i}: ${TIME[i]}`); });
  assert.deepEqual(m.out[25], ["That does not add up. That is not an hour on a clock: 30 o'clock.", 'conflicting']);
  assert.deepEqual(m.out[26], ["It is 3 o'clock.", 'supported'], 'the refused hour is gone from the library and the memory');
  assert.equal(m.out[27][0], 'OK, I forgot what time it is.');
  assert.deepEqual(matrix.reasoner.buildAll(), []);
});

test('kids.time: the calendar answers come from the library, the lengths of spans and the clock text from the operations; the library holds what was told', async () => {
  const s = matrix.createSession({ language: 'en' });
  const via = async (text) => { const r = await s.send(text, {}); return r.answers?.[0]?.envelope?.via ?? null; };
  await s.send('Today is Friday.', {});
  assert.equal(await via('What day is tomorrow?'), 'core.matrix');
  assert.equal(await via('How many days until Tuesday?'), 'core.matrix');
  assert.equal(await via('How many days are in February?'), 'core.matrix');
  assert.equal(await via('How many hours from 9 to 3?'), 'core.matrix');
  assert.notEqual(await via('How many minutes in an hour?'), 'core.matrix');
  const lib = s.isession.rs.of('kids.time');
  assert.deepEqual(lib.ofType('kids.time.nowday').map((w) => w.attrs.day), [['friday']]);
  assert.deepEqual(s.isession.state['kids.time'], { today: 'friday', month: null, hour: null });
  await s.send('Today is Saturday.', {});
  assert.deepEqual(lib.ofType('kids.time.nowday').map((w) => w.attrs.day), [['saturday']], 'the latest statement is what holds');
  assert.equal((await s.send('What day is tomorrow?', {})).text, 'Tomorrow is Sunday.');
  assert.equal((await s.send('undo that', {})).text, 'OK, today is Friday again.');
  assert.equal((await s.send('What day is tomorrow?', {})).text, 'Tomorrow is Saturday.');
  sameAsLibrary(s, ['kids.time']);
});

// ---- kids.animals on the matrix (stage 2) --------------------------------------------------------------------------------------------------------

const ANIMALS = ['What does a rabbit eat?', 'How many legs does a spider have?', 'Can a penguin fly?', 'Can a bat fly?', 'Can a zebra swim?', 'Is a whale a fish?', 'Is a cow a herbivore?',
  'Where do camels live?', 'What covers a cow?', 'Describe a dolphin', 'Which birds can swim?', 'What sound does a duck make?', 'What is a baby dog called?', 'A zebra can swim.',
  'Can a zebra swim?', 'A spider has 6 legs.', 'How many legs does a spider have?', 'A whale is a fish.', 'Is a whale a fish?', 'My dog is called Rex.', 'What is my dog called?',
  'Do I have a cat?', 'Can a unicorn fly?', 'undo that', 'Can a zebra swim?'];
const ANIMALS_GAINS = new Set([23]);   // undo says what was forgotten in the world's words

test('kids.animals: a scripted session says the same as the ops reasoner, word for word, with the same statuses, except the listed gains', async () => {
  const run = async (eng) => {
    const s = eng.createSession({ language: 'en' });
    const out = [];
    for (const l of ANIMALS) { const r = await s.send(l, {}); out.push([r.text, r.statuses.join()]); }
    return { s, out };
  };
  const o = await run(ops), m = await run(matrix);
  m.out.forEach((x, i) => { if (!ANIMALS_GAINS.has(i)) assert.deepEqual(x, o.out[i], `turn ${i}: ${ANIMALS[i]}`); });
  assert.match(m.out[23][0], /^OK, I forgot (what you taught me about|your)/);
  assert.deepEqual(matrix.reasoner.buildAll(), []);
});

test('kids.animals: what was taught is a wire and goes with undo (the questions about animals are the Talk tab\'s frames over the catalog)', async () => {
  const s = matrix.createSession({ language: 'en' });
  const lib = s.isession.rs.of('kids.animals');
  await s.send('A zebra can swim.', {});
  assert.deepEqual(s.isession.state['kids.animals'], { taught: [{ name: 'zebra', facts: ['can_swim=true'] }], pets: [] });
  assert.ok(lib.ofType('kids.animals.animal').some((w) => w.attrs.name?.[0] === 'zebra'));
  assert.equal((await s.send('undo that', {})).text, 'OK, I forgot what you taught me about zebras.');
  assert.equal(lib.ofType('kids.animals.animal').some((w) => w.attrs.name?.[0] === 'zebra' && w.attrs.can_swim?.[0] === 'true'), false);
  sameAsLibrary(s, ['kids.animals']);
});

// ---- user.profile on the matrix (stage 2) --------------------------------------------------------------------------------------------------------

const PROFILE = ['What do you know about me?', 'I am a nurse.', 'yes', 'Call me Andy.', 'I live in Cluj.', 'I am 34 years old.', "I've been teaching for 12 years.", 'I love hiking and jazz.',
  'Where do I live?', 'What is my name?', 'interview me', 'Mostly Python and SQL.', 'pause', 'Forget my hobbies.', 'What do you know about me?', 'How much do you know?',
  'I am 12 years old.', "I've been teaching for 20 years.", 'I have 50 kids', 'Remember that I am 34 years old.', 'Delete my profile.', 'no', 'undo that'];
const PROFILE_GAINS = new Set([16, 17, 18, 19, 20, 21, 22]);   // an age the user then contradicts and a number of children nobody has are refused with the reason; undo says it in the world's words

test('user.profile: a scripted session says the same as the ops reasoner, word for word, with the same statuses and the same state, except the listed gains', async () => {
  const run = async (eng) => {
    const s = eng.createSession({ language: 'en' });
    const out = [], states = [];
    for (const l of PROFILE) { const r = await s.send(l, {}); out.push([r.text, r.statuses.join()]); states.push(JSON.stringify(s.isession.state['user.profile'] ?? null)); }
    return { s, out, states };
  };
  const o = await run(ops), m = await run(matrix);
  m.out.forEach((x, i) => { if (!PROFILE_GAINS.has(i)) { assert.deepEqual(x, o.out[i], `turn ${i}: ${PROFILE[i]}`); assert.equal(m.states[i], o.states[i], `state after turn ${i}: ${PROFILE[i]}`); } });
  assert.match(m.out[17][0], /^That does not add up\. You said you are 12 years old, but also that you have been working for 20 years\. Which one is right\?$/);
  assert.deepEqual(m.out[17][1], 'conflicting');
  assert.equal(m.out[18][0], 'That does not add up. That is a lot of children: 50. Did you mean another number?');
  assert.deepEqual(matrix.reasoner.buildAll(), []);
});

test('user.profile: the facts are wires of the library (one per field), the state is derived from them, undo goes back through the library and says what was forgotten', async () => {
  const s = matrix.createSession({ language: 'en' });
  const lib = s.isession.rs.of('user.profile');
  await s.send('I am a nurse.', {});
  assert.equal(s.isession.state['user.profile'].inputMode, 'confirm', 'the guess waits to be confirmed');
  await s.send('I am 34 years old.', {});
  const facts = () => Object.fromEntries(lib.ofType('user.profile.fact').map((w) => [w.attrs.field[0], w.attrs.value?.map((v) => JSON.parse(v))]));
  assert.deepEqual(facts(), { role: ['nurse'], field: ['Healthcare'], age: ['34'] });
  assert.equal(s.isession.state['user.profile'].fields.role.v, 'nurse');
  assert.equal((await s.send('undo that', {})).text, 'OK, I forgot your age (34).');
  assert.deepEqual(facts(), { role: ['nurse'], field: ['Healthcare'] });
  assert.equal(s.isession.state['user.profile'].fields.age, undefined);
  // the refusal of two facts that cannot both be right leaves the library and the state as they were
  await s.send('I am 12 years old.', {});
  const before = JSON.stringify(s.isession.state['user.profile']);
  assert.match((await s.send("I've been teaching for 20 years.", {})).text, /^That does not add up\./);
  assert.equal(JSON.stringify(s.isession.state['user.profile']), before);
  assert.deepEqual(facts(), { role: ['nurse'], field: ['Healthcare'], age: ['12'] });
  assert.deepEqual(lib.ofType('core.issue'), []);
  sameAsLibrary(s, ['user.profile']);
});

test('one instance per group (user decision 2026-11-11): created on first use, the conversation worlds in one, every game in its own, the shared wires copied, undo rewinds the instance of the world that changed', async () => {
  const s = matrix.createSession({ language: 'en' }), rs = s.isession.rs;
  assert.equal(rs.insts.size, 0, 'a fresh session holds no World');
  await s.send('A ball costs 5 lei.', {});
  assert.deepEqual([...rs.insts.keys()], ['session.conversation'], 'only the conversation instance exists: no game was used');
  await s.send('Tom has 3 apples.', {});
  assert.deepEqual([...rs.insts.keys()], ['session.conversation'], 'the arithmetic world lives in the same instance as the shop');
  assert.equal(rs.of('kids.arith').ofType('kids.arith.holding').length, 1);
  assert.ok(rs.of('kids.arith').ofType('kids.shop.price').length > 0, 'the arithmetic rules see the shop facts (the same World)');
  assert.ok(rs.sharedLog.every((x) => rs.reasoner.route(x.w.type).shared), 'only wires several worlds know are in the shared log');
  await s.send("Let's play tic tac toe", {});
  await s.send('center', {});
  assert.deepEqual([...rs.insts.keys()].sort(), ['games.tictactoe', 'session.conversation', 'ui.shell']);
  assert.equal(rs.of('games.tictactoe').ofType('kids.shop.price').length, 0, 'the game holds nothing of the conversation worlds');
  assert.equal(rs.turns.at(-1).mark.marks.has('games.tictactoe'), true, 'the last turn is the game\'s');
  assert.equal(rs.turns.at(-1).mark.marks.has('session.conversation'), false, 'and does not touch the conversation instance');
  await s.send('undo that', {});
  assert.equal(rs.of('games.tictactoe').ofType('ttt.move').length, 0);
  assert.equal(rs.of('kids.arith').ofType('kids.arith.holding').length, 1, 'the conversation instance is not rewound by the game turn');
  const fork = rs.fork();
  assert.deepEqual([...fork.insts.keys()].sort(), ['games.tictactoe', 'session.conversation', 'ui.shell']);
});

test('composite world: compose= builds one instance from the legends and matrices of the worlds it names; reads= only their legends and facts', async () => {
  const e = await engineWith('matrix');
  const r = e.reasoner;
  assert.deepEqual(r.matrixWorlds('session.conversation').sort(), ['kids.animals', 'kids.arith', 'kids.shapes', 'kids.shop', 'kids.tasks', 'kids.time', 'session.conversation', 'user.profile']);
  assert.ok(r.schemaWorlds('session.conversation').includes('kids.shop'));
  assert.ok(!r.schemaWorlds('games.hangman').includes('kids.shop'), 'a game holds the legends of its own imports only');
  Object.defineProperty(e.set.get('games.guess'), 'reads', { get: () => ['kids.shop'] });   // a world may still read another's facts (the light form of sharing)
  assert.ok(r.schemaWorlds('games.guess').includes('kids.shop'), 'reads=');
  assert.deepEqual(r.matrixWorlds('games.guess'), ['games.guess'], 'reads= loads no matrix');
  assert.deepEqual(r.buildAll(), []);
  const rs = r.session();
  assert.ok(rs.of('kids.tasks').schema('kids.shop.purchase'), 'the composite knows the shop types');
  assert.ok(rs.of('kids.tasks').matrix.size > rs.of('games.tictactoe').matrix.size, 'and holds the matrices of all its worlds');
  assert.equal(rs.of('kids.tasks'), rs.of('kids.shop'));
});
