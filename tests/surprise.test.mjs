// SPDX-License-Identifier: AGPL-3.0-only
// SURPRISE: the pool of the "try something" button (src/dialog/surprise.mjs, docs/webchat/surprise-pool.json) and the picker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { candidateExamples, createSurprisePicker, replySupported, SURPRISE_EXCLUDED_WORLDS } from '../src/dialog/surprise.mjs';

const engine = await createEngine({ loader: createFsLoader() });
const GAMES = ['games.chess', 'games.tictactoe', 'games.hangman', 'games.guess'];

test('candidates are canonical examples of every world except the games and the shell', () => {
  const c = candidateExamples(engine);
  const worlds = new Set(c.map((e) => e.world));
  for (const g of SURPRISE_EXCLUDED_WORLDS) assert.ok(!worlds.has(g), g);
  for (const g of GAMES) assert.ok(SURPRISE_EXCLUDED_WORLDS.includes(g));
  for (const w of ['diagram.sketch', 'ui.help', 'user.profile', 'kids.arith', 'kids.common', 'docs.reader', 'art.draw']) assert.ok(worlds.has(w), `${w} is in the candidates`);
  const canonical = new Set(engine.set.list().flatMap((w) => w.patterns.flatMap((p) => p.canonical ?? [])));
  for (const e of c) assert.ok(canonical.has(e.text), e.text);
});

test('the shipped pool is validated: supported in a fresh session, no games, many worlds', async () => {
  const pool = JSON.parse(await readFile(new URL('../docs/webchat/surprise-pool.json', import.meta.url), 'utf8'));
  assert.ok(pool.length > 200, `${pool.length} examples`);
  const worlds = new Set(pool.map((p) => p.world));
  assert.ok(worlds.size >= 15, `${worlds.size} worlds`);
  for (const g of GAMES) assert.ok(!worlds.has(g));
  assert.ok(worlds.has('diagram.sketch') && worlds.has('ui.help') && worlds.has('kids.arith'));
  const cand = new Set(candidateExamples(engine).map((e) => e.text));
  for (const p of pool) assert.ok(cand.has(p.text), `stale pool entry "${p.text}" (run npm run build:webchat)`);
  // a sample is re-validated here (the build validates all of them)
  const opts = { language: 'en', formalizer: 'rules' };
  for (let i = 0; i < pool.length; i += Math.ceil(pool.length / 25)) {
    const s = engine.createSession({ language: 'en' });
    const reply = await s.send(pool[i].text, opts);
    assert.ok(replySupported(reply), `"${pool[i].text}" is not supported in a fresh session`);
  }
});

test('the picker never repeats the previous example and rotates across worlds', () => {
  const pool = [];
  for (const w of ['a', 'b', 'c', 'd']) for (let i = 0; i < 5; i++) pool.push({ text: `${w}${i}`, world: w, tab: null });
  const pk = createSurprisePicker(pool);
  let last = null, lastTwo = [];
  for (let i = 0; i < 400; i++) {
    const e = pk.next();
    assert.notEqual(e.text, last);
    assert.ok(!lastTwo.includes(e.world), `${e.world} came again within two picks`);
    last = e.text; lastTwo = [...lastTwo, e.world].slice(-2);
  }
  const one = createSurprisePicker([{ text: 'x', world: 'w' }, { text: 'y', world: 'w' }]);
  let l = null; for (let i = 0; i < 50; i++) { const e = one.next(); assert.notEqual(e.text, l); l = e.text; }
  assert.equal(createSurprisePicker([]).next(), null);
});

test('ui.help: "surprise me with an example" and "give me an example command" queue chat.surprise; "give me an example" stays a help example', async () => {
  const opts = { language: 'en', formalizer: 'rules' };
  for (const t of ['Surprise me with an example.', 'give me an example command', 'try an example', 'can you surprise me with an example please']) {
    const s = engine.createSession({ language: 'en' });
    const r = await s.send(t, opts);
    assert.ok(r.effects?.some((e) => e.name === 'chat.surprise'), `${t}: ${JSON.stringify(r.effects)}`);
  }
  const s = engine.createSession({ language: 'en' });
  const r = await s.send('Give me an example', opts);
  assert.ok(!r.effects?.some((e) => e.name === 'chat.surprise'));
});
