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

test('a reply nobody handled is still logged as before', () => {
  const rec = buildRecord({ text: 'qwerty', reply: { segments: [], trace: {} } });
  assert.deepEqual(rec.segments, []);
  assert.equal(summaryStatus(rec), 'unknown');
});
