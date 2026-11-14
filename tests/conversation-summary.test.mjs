// SPDX-License-Identifier: AGPL-3.0-only
// The live summary of the Talk tab (src/dialog/conversation.mjs), measured on the owner's logs replayed through the engine (training/eval/owner-log-2026-11-13b / c):
// after each log the summary names every world used and every taught fact; one line per item, newest first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { replay } from '../scripts/eval-owner-log.mjs';
import { turnRecord, summarize, outcomeOf, taughtText } from '../src/dialog/conversation.mjs';

const REPO = join(import.meta.dirname, '..');

async function run(file) {
  const turns = [], truth = new Set();
  let states = {};
  await replay({ log: join(REPO, 'training/eval', file), onReply: (rec, reply, s) => {
    turns.push(turnRecord(rec.i + 1, rec.text, reply, { tab: rec.tab }));
    for (const sg of reply.segments) if (!sg.unparsed && sg.routing?.winner?.worldId) truth.add(sg.routing.winner.worldId);   // independent of the record: the engine's own routing
    states = s.state();
  } });
  return { turns, truth, states, sum: summarize({ turns, states }) };
}

for (const file of ['owner-log-2026-11-13b.jsonl', 'owner-log-2026-11-13c.jsonl']) {
  test(`summary after ${file} names every world used and every taught fact`, async () => {
    const { truth, states, sum } = await run(file);
    const text = sum.sections.flatMap((s) => s.lines.map((l) => l.text)).join('\n');
    assert.ok(truth.size > 0);
    for (const w of truth) assert.ok(text.includes(w), `world ${w} is not named`);
    for (const wire of states['session.things']?.learned ?? []) assert.ok(text.includes(taughtText(wire)), `taught fact ${wire} is not named`);
    // one line per item: no line holds a line break; the worlds section has one line per world
    assert.ok(sum.sections.every((s) => s.lines.every((l) => !/\n/.test(l.text))));
    assert.equal(sum.sections.find((s) => s.id === 'worlds').lines.length, truth.size);
    // newest first: the world lines are ordered by the turn they were last used in, descending
    const ns = sum.sections.find((s) => s.id === 'worlds').lines.map((l) => l.n);
    assert.deepEqual(ns, [...ns].sort((a, b) => b - a));
  });
}

test('log c: the failures and the questions asked back are listed, the outcome words are the avatar\'s', async () => {
  const { turns, sum } = await run('owner-log-2026-11-13c.jsonl');
  assert.ok(turns.some((t) => t.outcome === 'done') && turns.some((t) => t.outcome === 'already'));
  assert.ok(sum.sections.some((s) => s.id === 'trouble'));
  assert.ok(turns.every((t) => ['done', 'already', 'refused', 'not-understood', 'answer', 'question-back'].includes(t.outcome)));
});

test('what the user taught is named: wires of the session things', () => {
  const states = { 'session.things': { learned: ['@learned.1 k.commonsense.thing name="villa" kind="house" core.source="user"', '@learned.2 k.commonsense.thing name="my dog" called="Rex" core.source="user"'] } };
  const sum = summarize({ turns: [], states });
  const t = sum.sections.find((s) => s.id === 'taught').lines.map((l) => l.text);
  assert.equal(t.length, 2);
  assert.match(t[0], /my dog/); assert.match(t[1], /villa/);   // newest first
});

test('outcomeOf: an unparsed turn is not understood, an ask back is a question back', () => {
  assert.equal(outcomeOf({ text: 'I did not understand "x".', segments: [{ unparsed: true }], answers: [], statuses: ['unparsed'] }), 'not-understood');
  assert.equal(outcomeOf({ text: 'What should I draw?', segments: [{}], answers: [{ status: 'missing', text: 'What should I draw?' }] }), 'question-back');
  assert.equal(outcomeOf({ text: 'I cannot draw a duck yet.', segments: [{}], answers: [{ status: 'unsupported', text: 'I cannot draw a duck yet.' }] }), 'refused');
});
