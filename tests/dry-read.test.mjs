// SPDX-License-Identifier: AGPL-3.0-only
// FREEZE 4: the voice dry run is cancellable, bounded, one in flight, and skips what is not worth reading.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });

test('dryRead: an aborted signal, long text and vocabulary-free text are skipped', async () => {
  const s = engine.createSession({ language: 'en' });
  const ctl = new AbortController(); ctl.abort();
  assert.equal((await s.dryRead('make a house', { language: 'en', signal: ctl.signal })).reason, 'cancelled');
  assert.equal((await s.dryRead(Array(26).fill('house').join(' '), { language: 'en' })).reason, 'too-long');
  assert.equal((await s.dryRead('zzq flarb', { language: 'en' })).reason, 'no-vocabulary');
});

test('dryRead: a newer call cancels the older one; a signal aborting mid-run stops it; the guard is released', async () => {
  const s = engine.createSession({ language: 'en' });
  const older = s.dryRead('make a house', { language: 'en', deadlineMs: 2000 });
  const newer = s.dryRead('make a house', { language: 'en', deadlineMs: 2000 });
  const [a, b] = await Promise.all([older, newer]);
  assert.equal(a.reason, 'cancelled');
  assert.equal(b.complete, true);
  const c2 = new AbortController();
  const p = s.dryRead('make a house', { language: 'en', deadlineMs: 2000, signal: c2.signal });
  c2.abort();
  assert.equal((await p).reason, 'cancelled');
  assert.equal((await s.dryRead('make a house', { language: 'en', deadlineMs: 2000 })).complete, true);
});
