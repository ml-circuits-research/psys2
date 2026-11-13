import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { loadDialogues, validateDialogue, pathKnown, summarize } from '../scripts/eval-dialogues.mjs';

test('pathKnown accepts real fields, dynamic containers and rejects typos', () => {
  const st = { objects: [], current: null, fields: {}, a: { b: 1 } };
  assert.ok(pathKnown(st, 'objects[kind=house].color'));
  assert.ok(pathKnown(st, 'objects.length'));
  assert.ok(pathKnown(st, 'current.songId'));
  assert.ok(pathKnown(st, 'fields.name'));
  assert.ok(pathKnown(st, 'a.b'));
  assert.ok(!pathKnown(st, 'a.c'));
  assert.ok(!pathKnown(st, 'nope'));
});

test('summarize counts turns and whole dialogues', () => {
  const r = (id, outs, fam) => ({ id, world: 'kids.arith', group: 'kids', families: fam, tags: [], turns: outs.map((o, i) => ({ i, outcome: o })), right: outs.every((o) => o === 'right') });
  const s = summarize([r('a', ['right', 'right', 'right'], ['ellipsis']), r('b', ['right', 'wrong', 'right'], ['ellipsis', 'noise'])]);
  assert.equal(s.headline.turns_right, 5);
  assert.equal(s.headline.dialogues_right, 1);
  assert.equal(s.by_family.noise.dialogues, 1);
});

test('every dialogue of training/eval/dialogues.jsonl is valid', async () => {
  const file = new URL('../training/eval/dialogues.jsonl', import.meta.url).pathname;
  if (!existsSync(file)) return;
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const settings = settingsForMode('rules');
  const stateOf = (d) => {
    const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
    if (d.tab) s.setWorldState('ui.shell', { activeTab: d.tab });
    for (const [w, p] of Object.entries(d.init ?? {})) s.setWorldState(w, p);
    return s.state();
  };
  const ids = new Set();
  const bad = [];
  for (const d of loadDialogues(file)) {
    const e = validateDialogue(d, stateOf);
    if (ids.has(d.id)) e.push('duplicate id');
    ids.add(d.id);
    if (e.length) bad.push(`${d.id}: ${e.join('; ')}`);
  }
  assert.deepEqual(bad, []);
});
