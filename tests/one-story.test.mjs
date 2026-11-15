// SPDX-License-Identifier: AGPL-3.0-only
// ONE STORY (spec 03 "Sentences in sequence", rule 2): a message of two or more sentences whose mixed reading leaves a part unread is read again by each world that read a
// part of it, alone; a world that reads every sentence in sequence (and does not refuse them in its dry run) takes the whole message. Real rows r0622 and r0627 (the 0.129 landing:
// right on its branch, wrong after the merge, because the drawing world took "I want 2 pencils" on the drawing tab and the change question then found no list).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { fixtureCatalog } from './helpers.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
engine.setKnowledge(await fixtureCatalog());   // the catalog makes a ball a thing the drawing world draws ("I want a ball" on the drawing tab is a drawing on its own)
const session = (tab) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const worldsOf = (r) => [...new Set(r.segments.map((x) => x.world ?? x.match?.worldId).filter(Boolean))];
const say = (r) => r.trace?.replyEnglish ?? r.text;

test('a shop story typed on the drawing tab is one story of the list world (r0627)', async () => {
  for (const [text, change] of [['I want a ball and I pay 10 lei. How much change do I get?', 5], ['I want 2 pencils and I give the cashier 10 lei. How much change do I get?', 6]]) {
    const r = await session('draw').send(text);
    assert.deepEqual(worldsOf(r), ['plan.list'], text);
    assert.match(say(r), new RegExp(`Your change from 10 lei is ${change} lei\\.`));
    assert.ok(r.segments.every((x) => !x.unparsed));
  }
});

test('the drawing tab keeps a sentence of its own when the rest is another world\'s complete reading', async () => {
  const r = await session('draw').send('Draw a house. Play twinkle twinkle.');
  assert.ok(worldsOf(r).includes('art.draw'), JSON.stringify(worldsOf(r)));
  assert.ok(r.segments.every((x) => !x.unparsed));
});

test('no world reads every sentence: the mixed reading stays (the part read is done, the rest is said not understood)', async () => {
  const r = await session('draw').send('Draw a house. Blorf the zinky wug.');
  assert.ok(worldsOf(r).includes('art.draw'), JSON.stringify(worldsOf(r)));
  assert.ok(r.segments.some((x) => x.unparsed));
});
