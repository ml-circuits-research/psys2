// THE PERSON OF THE SESSION (Q19, spec 23): statements and questions about the user read by the catalog's person frames (w.lang.en person-frames, bundled from the pin) into
// w.person facts held by the session (session.things `person`): typed tastes, relatives with a count, the user's own keys checked by the schema; the interview; the view a host shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { personView, NOTHING_YET } from '../src/dialog/person.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { STATEMENT_SAY } from '../src/dialog/foreign-reading.mjs';
import { BUNDLED_PERSON } from '../src/knowledge/bundled-person.mjs';
import { fixtureCatalog } from './helpers.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
engine.setKnowledge(await fixtureCatalog());
const talk = async (lines, tab = 'draw') => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: tab });
  const out = [];
  for (const l of lines) out.push(await s.send(l));
  return { s, out, view: personView(s.state()) };
};

test('the frames and the schema are the catalog\'s (bundled from the pin): 16 person frames, w.person with person, relative, taste', () => {
  assert.equal((BUNDLED_PERSON.frames.match(/ w\.lang\.en\.frame /g) ?? []).length, 16);
  for (const t of ['w.person.person', 'w.person.relative', 'w.person.taste']) assert.match(BUNDLED_PERSON.schema, new RegExp(`@${t.replace(/\./g, '\\.')} core\\.type`));
});

test('statements about the user become w.person facts of the session, not drawings and not the old refusal', async () => {
  const { out, view, s } = await talk(['draw a house', 'I have two kids', 'I have a daughter', 'I like cats, dogs and horses', "I don't like spiders", 'I am 45 years old', 'my age is 46', 'My name is Ana', 'I am a teacher', 'I speak English and Romanian']);
  for (const r of out.slice(1)) { assert.notEqual(r.text, STATEMENT_SAY); assert.deepEqual(r.statuses, ['supported'], r.text); }
  assert.equal(s.state()['art.draw'].objects.length, 1, 'nothing drawn for the kids');
  assert.deepEqual(view.relatives, [{ relation: 'child', count: 2 }, { relation: 'daughter', count: 1 }]);
  assert.deepEqual(view.likes.map((x) => x.thing), ['cat', 'dog', 'horse'], 'the list is split and each thing is singular');
  assert.equal(view.likes[0].type, 'k.animals.animal', 'a taste is typed by the catalog');
  assert.deepEqual(view.dislikes.map((x) => x.thing), ['spider']);
  assert.deepEqual([view.name, view.age, view.occupation, view.language], ['Ana', 46, 'teacher', ['English', 'Romanian']]);
});

test('questions about the user are answered from the session\'s person', async () => {
  const { out } = await talk(['what do you know about me', 'I have two kids', 'I am 45', 'I like pizza', 'how many kids do I have', 'how old am I', 'what do I like', 'what is my name', 'what do you know about me']);
  assert.equal(out[0].text, NOTHING_YET, 'nothing told yet: the person frame still owns the question');
  assert.equal(out[4].text, 'You have 2 children.');
  assert.equal(out[5].text, 'You are 45.');
  assert.equal(out[6].text, 'You like pizza.');
  assert.match(out[7].text, /do not know your name/, 'the name is kids.common\'s');
  assert.match(out[8].text, /you are 45; you have 2 children; you like pizza\. .*nothing leaves this device/i);
});

test('the schema checks a fact: an age out of range is refused and nothing is kept', async () => {
  const { out, view } = await talk(['I am 400 years old']);
  assert.match(out[0].text, /could not keep that age/);
  assert.equal(view.age, null);
});

test('the interview asks the keys of w.person in order; stop and resume; a request ends it', async () => {
  const { out, view } = await talk(['get to know me', 'Sînică', 'Researcher', 'stop', 'coming back to knowing me, what questions do you have?', 'draw a cat']);
  assert.match(out[0].text, /What is your name\?/);
  assert.match(out[1].text, /Nice to meet you, Sînică\. What do you do for a living\?/);
  assert.match(out[2].text, /researcher\. How old are you\?/i);
  assert.match(out[3].text, /stop asking/);
  assert.match(out[4].text, /^Welcome back! How old are you\?/);
  assert.notEqual(out[5].segments[0]?.world, 'session.things', 'a request is not the answer to the open question');
  assert.deepEqual([view.name, view.occupation], ['Sînică', 'Researcher']);
});

test('"I like it" and wishes are not tastes; the session keeps no person until told', async () => {
  const { view, out } = await talk(['I would like a red circle', 'I like it']);
  assert.equal(out[0].segments[0]?.world ?? out[0].segments[0]?.match?.worldId, 'art.draw');
  assert.deepEqual(view.likes, []);
});

// live check 2026-11-15 (ledger, real): after "Forget what you know about me" the question fell through and was respelled as the place "Me" (Maine): "Me is a state in New England."
// OWNERSHIP: a frame that reads the whole sentence owns it whether or not its world has facts; an empty world says so, on every tab, fresh and after the forget.
test('an empty profile still owns "what do you know about me": fresh and after the forget, on every tab, never a place', async () => {
  for (const tab of ['avatar', 'draw', 'map', 'chat']) {
    const { out, s } = await talk(['what do you know about me', 'I have two kids', 'what do you know about me'], tab);
    assert.equal(out[0].text, NOTHING_YET, `${tab}: fresh`);
    assert.deepEqual(out[0].statuses, ['supported']);
    assert.match(out[2].text, /you have 2 children/);
    s.setWorldState('session.things', { person: null });   // Settings › Privacy › "Forget what you know about me"
    const r = await s.send('what do you know about me');
    assert.equal(r.text, NOTHING_YET, `${tab}: after the forget`);
    assert.doesNotMatch(r.text, /state|New England|Maine/i);
  }
  // "who am i" with nothing but (at most) a name is the name's home's own question when it reads it whole (kids.common); without that world the frame answers: never a place
  const { out } = await talk(['who am i']);
  assert.match(out[0].text, /do not know your name|do not know anything about you/);
});

test('the empty answer is a composed reply: said from w.lang.ro.reply in a Romanian session, not translated', async () => {
  const ro = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() });
  const s = ro.createSession({ language: 'ro' });
  s.setWorldState('ui.shell', { activeTab: 'avatar' });
  const r = await s.send('ce știi despre mine');
  assert.equal(r.text, 'Încă nu știu nimic despre tine.');
});

test('the catalog types of a list of tastes are asked together and waited for outside the turn limit (first run 4.7 s live)', async () => {
  const inner = createKnowledgeSource(new URL('./fixtures/catalog', import.meta.url).pathname), clk = { t: 0 }, st = { reads: 0, open: 0, inflight: 0 };
  const source = { ...inner, text: async (p) => { st.reads++; st.open++; st.inflight = Math.max(st.inflight, st.open); await new Promise((r) => setTimeout(r, 1)); clk.t += 300; st.open--; return inner.text(p); } };
  const e = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
  e.setKnowledge(createFacts({ source }));
  const s = e.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'avatar' });
  const r = await s.send('I like cats, dogs and horses', { signal: new AbortController().signal, hardMs: 1000, clock: () => clk.t });
  assert.equal(r.text, 'OK, you like cats, dogs and horses. I will remember that.');
  assert.ok(!r.budgetExceeded);
  assert.ok(st.inflight > 1, `the things were asked together (${st.inflight} reads open at once)`);
  assert.equal(personView(s.state()).likes[0].type, 'k.animals.animal');
});
