// SPDX-License-Identifier: AGPL-3.0-only
// user.profile on the matrix (spec 15): "why?" about a profile fact explained from the library instance, in English and Romanian, with ops unchanged. (The animals questions this file
// used to test, several values and conflicting taught facts through kids.animals, moved with the knowledge: Talk frames over the catalog, tests/talk-kids-frames.test.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
const matrix = await engineWith('matrix');
const ops = await engineWith('ops');
const session = (e, language = 'en') => e.createSession(sessionOptions(settingsForMode('rules'), { language }));
const say = async (s, line, language = 'en') => (await s.send(line, language === 'en' ? {} : { language })).text;

test('profile: "why?" about a fact says the fact, the statement that told it and quotes the user as typed; ops keeps the generic explanation', async () => {
  const s = session(matrix);
  await say(s, 'I am 34 years old.');
  const lib = s.isession.rs.of('user.profile');
  const age = lib.ofType('user.profile.fact').find((w) => w.attrs.field[0] === 'age');
  assert.ok(age.attrs.req?.[0], 'the fact wire names the dialogue wire of the statement');
  const specific = await say(s, 'Why do you think I am 34?');
  assert.match(specific, /^I think your age is 34 because you told me so\. I worked that out from what you told me: "I am 34 years old"/);
  const s2 = session(matrix);
  await say(s2, 'I am 34 years old.');
  assert.equal(await say(s2, 'why?'), specific, 'a bare why? right after the statement says the same');
  const o = session(ops);
  await say(o, 'I am 34 years old.');
  assert.match(await say(o, 'why?'), /^You said "I am 34 years old"/, 'ops: the generic explanation is unchanged');
});

test('profile: the provenance is not part of the state (ops and matrix states are the same), survives the library taking the state over, and says the interview question', async () => {
  const run = async (e) => { const s = session(e); for (const l of ['interview me', 'Andy', 'I live in Cluj']) await say(s, l); return s; };
  const m = await run(matrix), o = await run(ops);
  assert.equal(JSON.stringify(m.isession.state['user.profile']), JSON.stringify(o.isession.state['user.profile']));
  assert.equal(Object.keys(m.isession.state['user.profile']).includes('_prov'), false);
  const first = await say(m, 'why do I live in Cluj?');   // the interview is still on: asked inside it, it is read as an answer; leave it first
  void first;
  await say(m, 'pause');
  const name = await say(m, 'Why do you think my name is Andy?');
  assert.match(name, /preferred name is Andy because I asked you "[^"]+" and you answered "Andy"/);
});

test('profile: Romanian "de ce?" gives the fact and the user\'s own words as typed', async () => {
  const s = session(matrix, 'ro');
  await say(s, 'Locuiesc în Cluj.', 'ro');
  const r = await say(s, 'De ce?', 'ro');
  assert.match(r, /^Am notat Cluj la „[^”]+”, pentru că mi-ai spus asta\. Am aflat asta din ce mi-ai spus: „Locuiesc în Cluj”/);
});
