// SPDX-License-Identifier: AGPL-3.0-only
// Pilot P1 round 2 (spec 21): the avatar as a schema world (worlds-pilot/ui.avatar), over the fixture catalog, in both reasoners: decline (the next world reads what is not a face),
// focus ("it"), two acts in one sentence, the phrases of the review. No per-phrase code: the cells are acts and roles.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const PILOT = path.join(import.meta.dirname, '../worlds-pilot');
const facts = createFacts({ source: createKnowledgeSource(path.join(import.meta.dirname, 'fixtures/catalog')) });
const engineOf = async (reasoner) => {
  const loader = createFsLoader({ roots: [PILOT, DEFAULT_ROOT] });
  const e = await createEngine({ loader, options: { reasoner } });
  e.setKnowledge(facts);
  return e;
};
const session = (e, tab = 'robot') => { const s = e.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const say = async (s, ...lines) => { const out = []; for (const l of lines) out.push(await s.send(l)); return out; };

for (const reasoner of ['ops', 'matrix']) {
  const e = await engineOf(reasoner);
  test(`${reasoner}: decline: a thing that is not a face part is read by the next world (draw a house on the Avatar tab goes to art.draw)`, async () => {
    const [r] = await say(session(e), 'draw a white house');
    assert.match(r.text, /I drew a white house/);
  });

  test(`${reasoner}: the acts cover the phrases the chat lost: eyes closer together, bare eyeglasses, do you have glasses, add and remove eyeglasses`, async () => {
    const r = await say(session(e), 'make the eyes closer together', 'eyeglasses', 'do you have glasses?', 'remove eyeglasses', 'add eyeglasses');
    assert.match(r[0].text, /moved my eyes closer together/);
    assert.match(r[1].text, /glasses/); assert.doesNotMatch(r[1].text, /did not (catch|understand)/);
    assert.match(r[2].text, /^Yes, I have/);
    assert.match(r[3].text, /took off/);
    assert.match(r[4].text, /put on/);
  });

  test(`${reasoner}: two acts in one sentence (an angry boy = the preset boy and the expression angry)`, async () => {
    const s = session(e);
    const [r] = await say(s, 'make the avatar an angry boy');
    assert.equal(s.state('ui.avatar').face.expression, 'angry');
    assert.equal(s.state('ui.avatar').face.base, 'boy');
    assert.doesNotMatch(r.text, /did not/);
  });

  test(`${reasoner}: focus: "make it red" after "put on a hat" means the hat`, async () => {
    const s = session(e);
    const r = await say(s, 'put on a hat', 'make it red');
    assert.doesNotMatch(r[1].text, /no red head|did not/);
    assert.match(r[1].text, /hat|red/i);
  });
}
