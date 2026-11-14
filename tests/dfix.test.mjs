// D-FIX (dialogue headline per group): behaviours added to reach 85% of dialogues right in every group
// (training/eval/dialogues.jsonl, worker-log "D-FIX"). Specified in specs/11-discourse.md sections 3, 7 and 11.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { fixtureCatalog } from './helpers.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
engine.setKnowledge(await fixtureCatalog());   // the questions of the kids worlds are Talk frames over the catalog
const session = (tab = null) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const say = async (s, ...texts) => { const out = []; for (const t of texts) out.push(await s.send(t)); return out; };

test('a bare question lacking its subject asks for it and the next utterance completes it (kids worlds)', async () => {
  const rs = await say(session(), 'how many legs?', 'a dog', 'what day is after', 'Friday', 'and what day is before', 'Monday');
  assert.match(rs[0].text, /Which animal/); assert.match(rs[1].text, /4 legs/);
  assert.match(rs[2].text, /Which day/); assert.match(rs[3].text, /Saturday/);
  assert.match(rs[4].text, /Which day/); assert.match(rs[5].text, /Sunday/);
  const g = await say(session(), 'what sound does it make?', 'a goat');
  assert.match(g[0].text, /Which animal/); assert.match(g[1].text, /maa/);
  const n = await say(session(), 'my name is', 'Ana', 'what is my name?');
  assert.match(n[0].text, /your name/i); assert.match(n[2].text, /Ana/);
});

test('a pronoun still resolves against the frame when a clarification pattern could read the sentence; "that" can be the last answer', async () => {
  const rs = await say(session(), 'how many legs does a spider have', 'what sound does that one make?');
  assert.match(rs[1].text, /spider/);
  assert.doesNotMatch(rs[1].text, /Which animal/);
  const d = await say(session(), 'what day is 5 days after Friday', 'what day comes after that?');
  assert.match(d[0].text, /Wednesday/); assert.match(d[1].text, /Thursday/);
});

test('hesitation words and a dangling connective never reach a world; "back to X, <request>" is the request about X', async () => {
  const rs = await say(session(), 'what sound does a cow make', 'uhh and a pig?', 'lol ok and how many days are in a week');
  assert.match(rs[1].text, /oink/); assert.match(rs[2].text, /7 days/);
  const b = await say(session(), 'how many legs does a spider have', 'what is 3 times 4', 'back to the spider, how many legs did it have?');
  assert.match(b[2].text, /8/);
  const c = await say(session(), 'which season comes after winter', 'what is 7 plus 5', 'ok back to seasons, which season comes after summer');
  assert.match(c[2].text, /autumn/);
});

test('topic return counts navigation as a topic, "where were we" goes back to it, and the summary hooks speak', async () => {
  const s = session('robot');
  await say(s, 'Open the charts tab.', "Let's play hangman.", 'Where were we?');
  assert.equal(s.state()['ui.shell'].activeTab, 'charts');
  const m = await say(session('music'), 'Play Ode to Joy.', "let's change the instrument to the flute", 'where were we?');
  assert.match(m[2].text, /Ode to Joy/); assert.match(m[2].text, /flute/);
  const d = await say(session('documents'), 'Open the fairy tale story.', 'Summarize the first section.', "Let's draw a cat.", 'Back to the story.', 'Where were we?');
  assert.match(d[4].text, /Poor Woodcutter/);
});

test('"what did you do?" names the last change, not a later question; a modal interceptor turn is explained like any other', async () => {
  const rs = await say(session('map'), 'Mark Paris and Rome.', 'How far is Paris from Rome?', 'Clear the lines.', 'How many markers are there?', 'What did you do?');
  assert.match(rs[4].text, /clear the lines/i); assert.match(rs[4].text, /so I did it/);
  const d = await say(session('documents'), 'Open the fairy tale story.', 'Search for father.', 'What did you do?');
  assert.match(d[2].text, /search for father/i); assert.match(d[2].text, /so I did it/);
  const q = await say(session('documents'), 'Open the fairy tale story.', 'Who is the witch?', 'What did she do?', 'What did you do?');
  assert.match(q[3].text, /What did she do/); assert.match(q[3].text, /answered it/);
});

test('docs.reader search matches the singular and the plural of a word', async () => {
  const [, r] = await say(session('documents'), 'Open the fairy tale story.', 'Search for pebbles.');
  assert.match(r.text, /4 results/);
});
