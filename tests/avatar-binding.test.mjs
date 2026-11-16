// SPDX-License-Identifier: AGPL-3.0-only
// Spec 28 section 20: the avatar on the declared binding (worlds/ui.avatar/request.sop std.tool wires over the kinds joined from k.faces, face.mjs primitives and view).
// Properties through Session.send on the avatar's tab; the view is the tool's own facts (toolView).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { toolView } from '../worlds/ui.avatar/face.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const avatar = (e = engine, language = 'en') => { const s = e.createSession({ language }); s.setWorldState('ui.shell', { activeTab: 'robot' }); return s; };
const view = (s) => toolView({ state: s.state()['ui.avatar'] ?? {} });
const part = (s, id) => view(s).find((t) => t.id === id) ?? null;

test('a value said lands in the view: a colour and a size step of a part (the change sense of make; size by k.expect.scale)', async () => {
  const s = avatar();
  const r1 = await s.send('make the eyes blue');
  assert.equal(part(s, 'eyes').colour, 'blue', r1.text);
  assert.equal(r1.trace.door, 'bound make', r1.text);
  const r2 = await s.send('make the eyes bigger');
  assert.equal(part(s, 'eyes').size, 'big', r2.text);
  const r3 = await s.send('make the eyes bigger');
  assert.equal(part(s, 'eyes').size, 'huge', `a second step goes past the grade it has: ${r3.text}`);
});

test('undo restores the view; one request is one undo step; a reaction does nothing and is no step', async () => {
  const s = avatar();
  const before = JSON.stringify(view(s));
  await s.send('make the eyes blue and bigger');
  assert.notEqual(JSON.stringify(view(s)), before);
  const after = JSON.stringify(view(s));
  const nice = await s.send('nice');
  assert.equal(JSON.stringify(view(s)), after, nice.text);
  await s.send('undo');
  assert.equal(JSON.stringify(view(s)), before, 'one undo takes back the whole request');
});

test('parts are worn and taken off by kind (joined from k.faces.slot); a part every face has is refused by its reply fact; a preset is a kind of face (k.faces.preset)', async () => {
  const s = avatar();
  await s.send('add glasses');
  assert.ok(part(s, 'glasses'));
  const off = await s.send('remove the glasses');
  assert.equal(part(s, 'glasses'), null, off.text);
  const nose = await s.send('remove the nose');
  assert.ok(part(s, 'nose'), nose.text);
  assert.match(nose.text, /cannot take off the nose/);
  const boy = await s.send('make a boy');
  assert.equal(view(s)[0].preset, 'boy', boy.text);
});

test('"what can you do here?" is said from the declarations and changes nothing', async () => {
  const s = avatar();
  const before = JSON.stringify(view(s));
  const r = await s.send('what can you do here?');
  assert.match(r.text, /^I can make: /);
  assert.match(r.text, /glasses/);
  assert.equal(r.trace.door, 'ask capabilities');
  assert.equal(JSON.stringify(view(s)), before);
});

test('Romanian: a colour said lands in the view and the reply is Romanian', async () => {
  const ro = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const s = avatar(ro, 'ro');
  const r = await s.send('fă ochii albaștri');
  assert.equal(part(s, 'eyes').colour, 'blue', r.text);
  assert.match(r.text, /^Ochii sunt (?:acum )?albaștri/);   // composed by done.change.plural (the catalog's word order, "acum" before the value) since slice 14.3, translated before
});
