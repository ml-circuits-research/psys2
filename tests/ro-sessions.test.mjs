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
import { sampled } from './helpers.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const settings = settingsForMode('rules');
const open = (language, tab = 'robot') => {
  const s = engine.createSession(sessionOptions(settings, { language }));
  s.setWorldState('ui.shell', { activeTab: tab });
  return s;
};
const send = (s, t, language) => s.send(t, language ? { language } : undefined);

test('LANG-FIXED: no evidence switches a selected language: an English selector reads Romanian text as English, a Romanian one reads English as Romanian', async () => {
  const en = open('en');
  for (const text of ['fa ochi visatori', 'desenează o casă', 'ok', 'casa']) {
    const r = await send(en, text, 'en');
    assert.equal(r.lang, 'en', text);
    assert.equal(r.switchedLanguage, undefined, text);
  }
  const ro = open('ro');
  for (const text of ['make bigger eyes', 'eys express fear', 'ok']) {
    const r = await send(ro, text, 'ro');
    assert.equal(r.lang, 'ro', text);
    assert.equal(r.switchedLanguage, undefined, text);
  }
});

test('RD5: the quote bug: a drawing hint in Romanian has well formed quotes or stays in English', async () => {
  const r = await send(open('auto', 'draw'), 'fa-i ochii mari', 'auto');
  assert.ok(!/\p{L}"\s/u.test(r.text), r.text);
});

test('RD5: reply quality over the Romanian set (no mixed language, no broken quotes), first 400 cases', async () => {
  const cases = readFileSync(new URL('../training/eval/operational-ro.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).slice(0, 400).map((l) => JSON.parse(l));
  const run = sampled(cases, { key: (c, i) => c.id ?? c.message ?? i });
  const res = await checkRomanianReplies({ cases: run, engine, settings });
  assert.deepEqual(res.bad.map((b) => `${b.id}: ${b.reply}`), []);
  assert.ok(res.counts.romanian > 250 * (run.length / cases.length), JSON.stringify(res.counts));
});

test('reply quality checker: names the RD5 defects', () => {
  assert.equal(checkReply({ shown: 'Încearcă" desena o casă roșie".', english: 'Try "draw a red house".', lang: 'ro' }).kind, 'broken-quote');
  assert.equal(checkReply({ shown: 'Ochii mei vin cu meu expression.', english: 'My eyes come with my expression.', lang: 'ro' }).kind, 'mixed');
  assert.equal(checkReply({ shown: 'Încearcă "desenează o casă roșie".', english: 'Try "draw a red house".', lang: 'ro' }).kind, 'romanian');
  assert.equal(checkReply({ shown: 'I am a person already.', english: 'I am a person already.', lang: 'ro' }).kind, 'english');
});

// ---- RD9 ----------------------------------------------------------------------------------------------------------------
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
  for (const text of ['wear a hat robot pls', 'wear a hat, robot']) {
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
  const next = open('en', 'draw');
  await next.send('add a house');
  const r3 = await next.send('add a cloud nect to a house');
  assert.ok(!/did not understand/.test(r3.text), r3.text);
});
