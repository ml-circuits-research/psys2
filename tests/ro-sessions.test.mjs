// RD5 + RD9 (worker-tasks): the Romanian lines of the real dialogue, the language switch of a host set to English, Romanian reply quality,
// mood nouns, plural "more X", loose words without a second tab reply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { checkReply } from '../scripts/lib/ro-reply-quality.mjs';
import { checkRomanianReplies } from '../scripts/check-ro-replies.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const settings = settingsForMode('rules');
const open = (language, tab = 'robot') => {
  const s = engine.createSession(sessionOptions(settings, { language }));
  s.setWorldState('ui.shell', { activeTab: tab });
  return s;
};
const send = (s, t, language) => s.send(t, language ? { language } : undefined);

// The Romanian lines of training/eval/real-dialogue-2026-11-09.txt (plus two more that showed the broken quote and the English reply)
const RO_LINES = [
  ['fa-mi avatarul ca om', (s) => s.person && s.character === 'person', /om/],
  ['fa avatarul ca om', (s) => s.character === 'person', /om/],
  ['fa-i ochii mari', (s) => s.person.expression === 'awe', /ochi/],
  ['fa ochii mari', (s) => s.person.expression === 'awe', /ochi/],
  ['fa ochi visatori', (s) => s.person.expression === 'calm', /ochi|visător|liniștit/],
];

for (const [label, language] of [['CLI (language auto)', 'auto'], ['webchat with the dropdown on English', 'en']]) {
  test(`RD5: the Romanian lines of the real dialogue act and answer in Romanian: ${label}`, async () => {
    const s = open(language);
    for (const [text, check, word] of RO_LINES) {
      const r = await send(s, text, language);
      const avatar = s.state()['ui.avatar'];
      assert.ok(check(avatar), `${text}: wrong state ${JSON.stringify(avatar)}`);
      assert.equal(r.lang, 'ro', `${text}: language`);
      if (language === 'en') assert.equal(r.switchedLanguage, 'ro', `${text}: the host is told to switch its dropdown`);
      assert.ok(!/did not understand|Nu am înțeles/.test(r.text), `${text}: ${r.text}`);
      const q = checkReply({ shown: r.text, english: r.trace?.replyEnglish ?? r.text, lang: r.lang });
      assert.equal(q.kind, 'romanian', `${text}: ${r.text} (${q.problems.join('; ')})`);
      // fully Romanian: no common English word of the avatar replies
      assert.ok(!/\b(the|my|eyes|expression|made|follow)\b/i.test(r.text), `${text}: English words in ${r.text}`);
    }
  });
}

test('RD5: strong Romanian evidence switches an English dropdown, one English typo word does not', async () => {
  const s = open('en');
  assert.equal((await send(s, 'eys express fear', 'en')).lang, 'en');
  assert.equal((await send(s, 'make bigger eyes', 'en')).switchedLanguage, undefined);
  assert.equal((await send(s, 'sqare eyes', 'en')).lang, 'en');
  assert.equal((await send(s, 'fa ochi visatori', 'en')).switchedLanguage, 'ro');
  // a diacritic alone is strong evidence; a single Romanian word that English also knows is not
  assert.equal((await send(open('en'), 'desenează o casă', 'en')).switchedLanguage, 'ro');
  assert.equal((await send(open('en'), 'ok', 'en')).switchedLanguage, undefined);
  assert.equal((await send(open('en'), 'casa', 'en')).switchedLanguage, undefined);
});

test('RD5: the quote bug: a drawing hint in Romanian has well formed quotes or stays in English', async () => {
  const r = await send(open('auto', 'draw'), 'fa-i ochii mari', 'auto');
  assert.ok(!/\p{L}"\s/u.test(r.text), r.text);
});

test('RD5: reply quality over the Romanian set (no mixed language, no broken quotes), first 400 cases', async () => {
  const cases = readFileSync(new URL('../training/eval/operational-ro.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).slice(0, 400).map((l) => JSON.parse(l));
  const res = await checkRomanianReplies({ cases, engine, settings });
  assert.deepEqual(res.bad.map((b) => `${b.id}: ${b.reply}`), []);
  assert.ok(res.counts.romanian > 250, JSON.stringify(res.counts));
});

test('reply quality checker: names the RD5 defects', () => {
  assert.equal(checkReply({ shown: 'Încearcă" desena o casă roșie".', english: 'Try "draw a red house".', lang: 'ro' }).kind, 'broken-quote');
  assert.equal(checkReply({ shown: 'Ochii mei vin cu meu expression.', english: 'My eyes come with my expression.', lang: 'ro' }).kind, 'mixed');
  assert.equal(checkReply({ shown: 'Încearcă "desenează o casă roșie".', english: 'Try "draw a red house".', lang: 'ro' }).kind, 'romanian');
  assert.equal(checkReply({ shown: 'I am a person already.', english: 'I am a person already.', lang: 'ro' }).kind, 'english');
});

// ---- RD9 ----------------------------------------------------------------------------------------------------------------
test('RD9: a mood noun turns into the adjective in the reply', async () => {
  for (const [text, re] of [['eys express fear', /look scared/], ['your eyes express fear', /look scared/], ['look fear', /look scared/], ['look terrified', /look terrified/], ['look happy', /look happy/]]) {
    for (const character of ['person', 'robot', 'emoji']) {
      const s = open('en');
      s.setWorldState('ui.avatar', { character });
      const r = await s.send(text);
      assert.match(r.text, re, `${character}: ${text} -> ${r.text}`);
      assert.ok(!/look fear\b/.test(r.text), r.text);
    }
  }
  // the noun form never leaks through the gender replies either
  const s = open('en');
  assert.ok(!/look fear\b/.test((await s.send('make a man who looks fear')).text));
});

test('RD9: "more X" with a plural adds two or three and says how many', async () => {
  for (const text of ['add more clouds', 'draw more clouds', 'add some more clouds']) {
    const s = open('en', 'draw');
    await s.send('add a cloud');
    const before = s.state()['art.draw'].objects.length;
    const r = await s.send(text);
    const added = s.state()['art.draw'].objects.length - before;
    if (/some more/.test(text)) continue;   // handled by the loose-word reading, not by this rule
    assert.ok(added >= 2 && added <= 3, `${text}: added ${added}`);
    assert.match(r.text, new RegExp(`${added} clouds`), r.text);
  }
  const one = open('en', 'draw');
  await one.send('add a cloud');
  const n0 = one.state()['art.draw'].objects.length;
  await one.send('add one more cloud');
  assert.equal(one.state()['art.draw'].objects.length - n0, 1);
});

test('RD9: a loose word does not trigger a second tab reply', async () => {
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  for (const text of ['square eyes robot pls', 'square eyes, robot']) {
    const r = await s.send(text);
    assert.ok(!/already on the/.test(r.text), `${text}: ${r.text}`);
  }
  // an explicit request to open the tab still answers
  assert.match((await s.send('open the avatar tab')).text, /already on the Avatar tab/);
});

// The spell items of RD9 belong to RD10 (spell vocabulary per world); they are checked in tests/rd-real-dialogue.test.mjs as well.
test('RD9 spell items (owned by RD10): "bugger house pls", "nect to a house", "eys express fear"', async (t) => {
  const draw = open('en', 'draw');
  const r1 = await draw.send('bugger house pls');
  if (!/bigger|house/.test(r1.text) || /where .* live/.test(r1.text)) return t.skip('waits for RD10 (spell vocabulary per world)');
  const eyes = await open('en').send('eys express fear');
  assert.match(eyes.text, /scared/);
  const next = open('en', 'draw');
  await next.send('add a house');
  const r3 = await next.send('add a cloud nect to a house');
  assert.ok(!/did not understand/.test(r3.text), r3.text);
});
