// RP3: spoken-input repair (src/formalizer/voice.mjs) and the general fixes of the 2026-11-09 afternoon phrase log.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { cleanVoice, garbleCandidates, weakSoundAlikes, skeleton, STEP_BUDGET } from '../src/formalizer/voice.mjs';
import { worldVocabulary, FUNCTION_WORDS } from '../src/formalizer/spell.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const roEngine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() });
const session = (tab, e = engine, language = 'en') => { const s = e.createSession({ language }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };

test('cleanVoice: an immediately repeated function word is one word in every mode', () => {
  assert.equal(cleanVoice('the the next mouth').text, 'the next mouth');
  assert.equal(cleanVoice('make it it red').text, 'make it red');
  assert.equal(cleanVoice('very very big').text, 'very very big');   // legitimate repetition stays
  assert.equal(cleanVoice('add 2 2 apples').text, 'add 2 2 apples');
});

test('cleanVoice: a repetition across a comma is two things ("heading A, a heading B")', () => {
  assert.equal(cleanVoice('add a heading A, a heading B').text, 'add a heading A, a heading B');
  assert.equal(cleanVoice('add a heading A, a heading B', { voice: true }).text, 'add a heading A, a heading B');
});

test('cleanVoice: voice mode drops a repeated phrase and a trailing send word', () => {
  const v = cleanVoice('fă avatarul o persoană avatarul o persoană trimite', { voice: true });
  assert.equal(v.text, 'fă avatarul o persoană');
  assert.deepEqual(v.corrections.map((c) => c.kind).sort(), ['send', 'stutter']);
  assert.equal(cleanVoice('make it red make it red send', { voice: true }).text, 'make it red');
  assert.equal(cleanVoice('make it red, over', { voice: true }).text, 'make it red');
  assert.equal(cleanVoice('make it red make it red').text, 'make it red make it red');   // typed text keeps phrases
});

test('cleanVoice: words that merely look like send words stay', () => {
  assert.equal(cleanVoice('start over', { voice: true }).text, 'start over');
  assert.equal(cleanVoice('i want to send', { voice: true }).text, 'i want to send');
  assert.equal(cleanVoice('send', { voice: true }).text, 'send');
  assert.equal(cleanVoice('sunt gata', { voice: true }).text, 'sunt gata');
});

test('skeleton: sound-alike consonants', () => {
  assert.equal(skeleton('make'), skeleton('mac'));
  assert.equal(skeleton('phone'), skeleton('fone'));
});

test('garbleCandidates: "mcdavatara human" splits into words of the active world', () => {
  const vocab = worldVocabulary(engine.set, 'ui.avatar');
  const c = garbleCandidates('mcdavatara human', { vocab, functionWords: FUNCTION_WORDS });
  assert.ok(c.length, 'a candidate');
  assert.match(c[0].text, /make avatar a human/);
  assert.equal(c[0].cost, 1);
});

test('garbleCandidates is bounded by counts: a long garbled word and many unknown words stay within the step budget', () => {
  // Checked by counted work, not by the clock: a wall-clock limit flaked under machine load (575 ms at load 27).
  const vocab = worldVocabulary(engine.set, 'ui.avatar');
  const stats = {};
  garbleCandidates('qzxqzxqzxqzxqzxqzxqzxqzx zzzzzzzzzzzzzzzzzzzz wwwwwwwwwwwwwwwwwwwwwwww vvvvvvvvvvvvvvvvvvvvv', { vocab, functionWords: FUNCTION_WORDS, stats });
  assert.ok(Number.isFinite(stats.steps) && stats.steps <= STEP_BUDGET * 2 + 64, `steps ${stats.steps}`);
});

test('weakSoundAlikes: "Chester" is near the editor word "chapter", never executed', () => {
  const vocab = worldVocabulary(engine.set, 'docs.editor');
  assert.deepEqual(weakSoundAlikes('Chester', { vocab, functionWords: FUNCTION_WORDS }).map((x) => x.to), ['chapter']);
});

test('rp3-01 voice garble on the avatar tab; the same text typed stays unread', async () => {
  const v = session('robot');
  await v.send('make the avatar an emoji');
  const r = await v.send('mcdavatara human', { mode: 'voice' });
  assert.equal(v.state()['ui.avatar'].character, 'person', r.text);
  const t = session('robot');
  const r2 = await t.send('mcdavatara human');
  assert.match(r2.text, /did not understand/);
});

test('rp3-01 never across worlds: a garble repair only reads the open tab\'s world', async () => {
  const s = session('draw');
  const r = await s.send('mcdavatara human', { mode: 'voice' });
  assert.equal(s.state()['ui.avatar']?.character ?? 'robot', 'robot', r.text);   // the avatar did not change from the drawing tab
});

test('rp3-02 Romanian voice stutter and send word', async () => {
  const s = session('robot', roEngine, 'ro');
  const r = await s.send('fă avatarul o persoană avatarul o persoană trimite', { mode: 'voice', language: 'ro' });
  assert.equal(s.state()['ui.avatar'].character, 'person', r.text);
  assert.match(r.text, /Acum sunt o persoană/);
});

test('rp3-03..06 avatar expressions as loose words, on every character', async () => {
  for (const ch of ['robot', 'person', 'emoji', 'cartoon', 'kid', 'pixel', 'pixelbot', 'funemoji']) {
    const s = session('robot');
    s.setWorldState('ui.avatar', { character: ch });
    for (const m of ['make a big smile', 'big smile', 'make the avatar to geta big smile', 'small smile', 'make a frown']) {
      const r = await s.send(m);
      assert.doesNotMatch(r.text, /did not understand|Something went wrong/, `${ch}: ${m} -> ${r.text}`);
    }
  }
  const s = session('robot');
  const r = await s.send('the the next mouth');
  assert.match(r.text, /mouth/);
  assert.doesNotMatch(r.text, /did not use/);
});

test('rp3-07 editor: several structures in one request', async () => {
  const s = session('editor');
  const r = await s.send('add a header, two chapters and a paragraph');
  const blocks = s.state()['docs.editor'].blocks;
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'heading', 'heading', 'paragraph'], r.text);
  assert.match(blocks[1].text, /^Chapter 1/);
  assert.match(blocks[2].text, /^Chapter 2/);
  assert.equal(blocks[3].text, '');
  assert.ok(!blocks.some((b) => /two chapters/i.test(b.text)));
});

test('rp3-08 editor: "add text" asks for the text and never writes the command words', async () => {
  const s = session('editor');
  const r = await s.send('add text');
  assert.match(r.text, /What text should I add/);
  assert.equal(s.state()['docs.editor'].blocks.length, 0);
  await s.send('hello there');
  assert.match(s.state()['docs.editor'].blocks.at(-1).text, /^Hello there/);
});

test('rp3-09..11 editor by voice: garbled command word, weak sound-alike asks', async () => {
  const s = session('editor');
  await s.send('are the new paragraph', { mode: 'voice' });
  assert.equal(s.state()['docs.editor'].blocks.length, 1);
  await s.send('on the new chapter', { mode: 'voice' });
  assert.equal(s.state()['docs.editor'].blocks.length, 2);
  const r = await s.send('Chester', { mode: 'voice' });
  assert.match(r.text, /Did you mean/);
  assert.match(r.text, /chapter/i);
  assert.equal(s.state()['docs.editor'].blocks.length, 2);
});

test('rp3-12 guess: an answer with a clue keeps the clue as evidence', async () => {
  const s = session('guess');
  await s.send('lets play guess the animal');
  const r = await s.send('yes, it eats meat');
  assert.match(r.text, /Noted: it eats meat/);
  assert.doesNotMatch(r.text, /did not understand/);
  assert.equal(s.state()['games.guess'].evidence.length, 1);
  assert.ok(s.state()['games.guess'].candidates.length > 0);
});

test('rp3-13 guess: "new game" restarts the open game', async () => {
  const s = session('guess');
  await s.send('lets play guess the animal');
  await s.send('yes');
  await s.send('new game');
  assert.equal(s.state()['games.guess'].count, 0);
  assert.equal(s.state()['ui.shell'].activeTab, 'guess');
});

test('rp3-14 tic-tac-toe has other names: x and 0, noughts and crosses, x and o', async () => {
  for (const m of ['start x and 0', 'lets play x and o', 'play noughts and crosses', 'x and 0']) {
    const s = session('robot');
    await s.send(m);
    assert.equal(s.state()['ui.shell'].activeTab, 'tictactoe', m);
  }
  const s = session('guess');
  await s.send('is there an x and o in the word');   // a longer sentence is not the game's name
  assert.notEqual(s.state()['ui.shell'].activeTab, 'tictactoe');
});

test('rp3-15 arithmetic: items that leave are taken away, with typos', async () => {
  const s = session('robot');
  await s.send('Tom has 10 bees.');
  await s.send('One flyes away.');
  const r = await s.send('How many bee Tom has ?');
  assert.match(r.text, /9/);
  const t = session('robot');
  await t.send('Mia has 5 birds.');
  await t.send('Two of them flew away.');
  assert.match((await t.send('How many birds does Mia have?')).text, /3/);
});

test('rp3-16 drawing: three typos fixed by the rest of the sentence', async () => {
  const s = session('draw');
  await s.send('draw 5 clouds and one sun');
  const r = await s.send('the un si up not udner clouds');
  assert.match(r.text, /above/, r.text);
  assert.match(r.text, /I read/);
});

test('rp3-17..18 music: bare play and a random song', async () => {
  const s = session('music');
  const r = await s.send('play');
  assert.match(r.text, /Playing/);
  assert.doesNotMatch(r.text, /What should I play/);
  const first = s.state()['media.music'].current?.songId;
  const r2 = await s.send('play a random song');
  assert.match(r2.text, /Playing "/);
  assert.notEqual(s.state()['media.music'].current?.songId, first);
  const o = session('robot');
  assert.match((await o.send('play')).text, /What should I play/);   // off the Music tab it still asks
});

test('a voice turn stays bounded: garble repair on a long unknown message finishes within the turn budget', async () => {
  const s = session('robot');
  const t0 = Date.now();
  await s.send('zxqvbnm '.repeat(30), { mode: 'voice' });
  assert.ok(Date.now() - t0 < 8000, `took ${Date.now() - t0} ms`);
});
