// SPDX-License-Identifier: AGPL-3.0-only
// RP3 item 9 (spec 06 "Phrase log"): a message taken by a world's modal input (interceptInput: the user.profile interview, editor dictation, games)
// is logged with that world and status `supported`, never `unknown` with no world, so the learning loop can learn from it.
// Runs the same engine session and the same record builder the webchat uses, without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { buildRecord, completeRecord, exportRecord, summaryWorlds, summaryStatus, filterRecords } from '../docs/webchat/ui/phrase-log.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });

test('interview answers are logged with world user.profile and status supported', async () => {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'profile' });
  await s.send('get to know me');
  for (const text of ['Sînică', 'Researcher', 'Axiologic', 'R&D', 'Reading']) {
    const reply = await s.send(text);
    assert.equal(reply.trace.intercepted, 'user.profile', text);
    const sent = buildRecord({ text, tab: 'profile' });   // logged when sent (no reply yet)
    const rec = completeRecord(sent, reply);
    const row = exportRecord(rec);
    assert.deepEqual(summaryWorlds(rec), ['user.profile'], text);
    assert.equal(summaryStatus(rec), 'supported', text);
    assert.equal(row.status, 'supported');
    assert.deepEqual(row.worlds, ['user.profile']);
    assert.equal(rec.unparsed, false);
    assert.equal(filterRecords([rec], 'misses').length, 0, 'an interview answer is not a miss');
  }
});

test('a reply nobody handled is still logged as before', () => {
  const rec = buildRecord({ text: 'qwerty', reply: { segments: [], trace: {} } });
  assert.deepEqual(rec.segments, []);
  assert.equal(summaryStatus(rec), 'unknown');
});

test('profile slot alignment through the engine', async () => {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'profile' });
  for (const m of ['get to know me', 'Sînică', 'Researcher', 'Axiologic', 'R&D', 'Reading', 'No way', '20']) await s.send(m);
  const f = s.state()['user.profile'].fields;
  assert.equal(f.org.v, 'Axiologic');
  assert.equal(f.field.v, 'Research and development');
  assert.equal(f.years.v, '20');
  assert.ok(!f.skills, 'a bare number never becomes a skill');
  assert.ok(!f.hobbies.v.some((h) => /^r(?: and |&| )d$/i.test(h)), 'R&D is not a hobby');
});
