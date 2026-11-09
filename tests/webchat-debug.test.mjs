// DBG: the data builders of the debug view (docs/webchat/ui/debug.mjs) on the real worlds, the dry run, and the developer-mode default. No DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { opOfEmit, commandsOf, worldInfo, turnsFor, diffPaths, makeEntry, RING_MAX, LAST_TURNS, DEBUG_SECTIONS } from '../docs/webchat/ui/debug.mjs';
import { hashState } from '../docs/webchat/ui/phrase-log.mjs';
import { DEFAULT_SETTINGS } from '../docs/webchat/ui/settings.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });

test('developer mode is off by default and the sections are the six of the task', () => {
  assert.equal(DEFAULT_SETTINGS.devMode, false);
  assert.deepEqual(DEBUG_SECTIONS.map(([id]) => id), ['commands', 'turns', 'dry', 'state', 'world', 'models']);
  assert.equal(RING_MAX, 200);
  assert.equal(LAST_TURNS, 20);
});

test('opOfEmit: the action of a request, else the core word', () => {
  assert.equal(opOfEmit('@{_} core.request action=avatar.setPart arg.part={p}'), 'avatar.setPart');
  assert.equal(opOfEmit('@{_} core.query kind=x'), 'core.query');
  assert.equal(opOfEmit(''), 'other');
});

test('commands: generated from every loaded world, grouped by operation, with canonical examples', () => {
  const empty = [];
  for (const w of engine.set.list()) {
    if (w.id === 'core') continue;
    const c = commandsOf(w);
    if (!c.patterns) { empty.push(w.id); continue; }
    assert.equal(c.world, w.id);
    assert.ok(c.groups.length >= 1 && c.groups.every((g) => g.patterns.length && g.op));
    assert.equal(c.groups.reduce((n, g) => n + g.patterns.length, 0), c.patterns);
  }
  // worlds that have a tab always have commands; only the library worlds (no patterns of their own) may be empty
  for (const w of engine.set.list()) if (w.tab) assert.ok(!empty.includes(w.id), `${w.id} has a tab but no patterns`);
  const av = commandsOf(engine.set.list().find((w) => w.id === 'ui.avatar'));
  assert.ok(av.groups.some((g) => g.op === 'avatar.setColor'));
  assert.ok(av.canonical.length > 0 && av.shapes.length > 0 && av.examples > 50);
});

test('world: manifest, imports, legend, lexicons, operations and templates as data', () => {
  const info = worldInfo(engine.set.list().find((w) => w.id === 'ui.avatar'));
  assert.deepEqual(info.manifest.namespace, ['ui.avatar']);
  assert.ok(info.imports.length >= 1);
  assert.ok(info.legend.types.length > 0 && info.legend.keys.length > 0);
  assert.ok(info.lexicons.length > 10 && info.counts.words > 100);
  assert.ok(info.operations.some((o) => o.action === 'avatar.setPart' && o.impl === 'setPart' && o.doc));
  assert.ok(info.templates.length > 0);
  assert.equal(worldInfo(null), null);
});

test('state diff: changed, added and removed paths', () => {
  const d = diffPaths({ a: 1, b: { c: [1, 2], d: 'x' }, e: 1 }, { a: 1, b: { c: [1, 3], d: 'x' }, f: 2 });
  assert.deepEqual([...d].sort(), ['b.c.1', 'e', 'f']);
  assert.equal(diffPaths({ a: 1 }, { a: 1 }).size, 0);
});

test('last turns: only the turns that touched the world, newest first, at most 20', () => {
  const mk = (i, worlds, tabWorld = null) => makeEntry({ seq: i, text: `t${i}`, mode: 'typed', tab: 'x', tabWorld, reply: { text: 'ok', segments: worlds.map((w) => ({ text: 't', match: { worldId: w, patternId: 'p' }, wires: [] })), trace: {} } });
  const ring = Array.from({ length: 60 }, (_, i) => mk(i, i % 3 === 0 ? ['a'] : ['b']));
  const t = turnsFor(ring, 'a');
  assert.equal(t.length, 20);
  assert.equal(t[0].seq, 57);
  assert.ok(t.every((x) => x.worlds.includes('a')));
  assert.equal(turnsFor([mk(1, [], 'a')], 'a').length, 1);   // a turn on the tab counts even if nothing was read
});

test('dry run with detail executes nothing: same state hash, readings and wires reported', async () => {
  const s = engine.createSession({});
  await s.send('hello');
  const before = hashState(s.state());
  const res = await s.dryRead('make the eyes blue', { language: 'en', detail: true, deadlineMs: 2000 });
  assert.equal(res.complete, true);
  assert.equal(res.detail.readings[0].world, 'ui.avatar');
  assert.ok(res.detail.readings[0].wires.length >= 1);
  assert.equal(hashState(s.state()), before);
  const plain = await s.dryRead('make the eyes blue', { language: 'en' });
  assert.equal(plain.detail, undefined);   // the voice detector's call is unchanged
  const bad = await s.dryRead('zzq flarb wug', { language: 'en', detail: true });
  assert.equal(bad.complete, false);
  assert.ok(bad.detail);
  assert.equal(hashState(s.state()), before);
});
