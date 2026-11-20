// SPDX-License-Identifier: AGPL-3.0-only
// The summary of specs/26 (std.summarize): the adapter, its plain absence without the library, and the Talk paragraph over replayed owner logs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createSummarizer } from '../src/dialog/textgen.mjs';

test('without the library the summarizer is unavailable and returns nothing (no local generator)', () => {
  const s = createSummarizer({}, {});
  assert.equal(s.available, false);
  assert.equal(s.turns({ turns: [{ n: 1 }] }), null); assert.equal(s.text({ text: 'x' }), null);
});

test('the vendored sopworld has std.summarize', () => {
  assert.equal(createSummarizer(lib, null).available, true);
});

// ---- the measurement (reviewer 14:45 item 3, summaries): owner-log b and c replayed; the paragraph names every world used and every taught fact in at most 3 sentences
import { replay } from '../scripts/eval-owner-log.mjs';
import { turnRecord, summarize } from '../src/dialog/conversation.mjs';
for (const file of ['owner-log-2026-11-13b.jsonl', 'owner-log-2026-11-13c.jsonl']) {
  test(`Talk paragraph (std.summarizeLog) after ${file}: names every world and every taught fact, at most 3 sentences`, async () => {
    const turns = [], truth = new Set(); let states = {};
    await replay({ log: join(import.meta.dirname, '..', 'training/eval', file), onReply: (rec, reply, sess) => {
      turns.push(turnRecord(rec.i + 1, rec.text, reply, { tab: rec.tab }));
      for (const sg of reply.segments) if (!sg.unparsed && sg.routing?.winner?.worldId) truth.add(sg.routing.winner.worldId);
      states = sess.state();
    } });
    const sum = summarize({ turns, states }), taught = sum.taughtClear;
    const p = createSummarizer(lib, null).turns({ turns, taught, maxSentences: 3 });
    assert.ok(p, 'a paragraph');
    assert.ok(p.sentences.length <= 3 && p.sentences.length >= 1);
    for (const w of truth) assert.ok(p.text.includes(w), `world ${w} is not named: ${p.text}`);
    for (const f of taught) assert.ok(p.text.includes(f), `taught fact "${f}" is not named`);
    // nothing the world did not understand reaches the paragraph: every word is ASCII English letters, numbers and punctuation, and no kind comes from the user's phrase
    assert.ok(!/[^\x20-\x7e]/.test(p.text));
    for (const t of turns) for (const a of t.acts) assert.ok(a.kind === null || /^[a-z]+$/.test(a.kind));
    console.log(`# ${file}: ${p.text}`);
  });
}
