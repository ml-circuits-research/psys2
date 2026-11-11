// RO-MATRIX: the replies the dialogue layer writes itself (undo, why, refusals, bare yes/no) go through the same outbound en -> ro translation as every
// other reply, quote the user's own words, and no reply of a Romanian session stays in English. Run in both reasoners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { checkReply } from '../scripts/lib/ro-reply-quality.mjs';

const SESSIONS = JSON.parse(readFileSync(new URL('../training/eval/ro-matrix-sessions.json', import.meta.url), 'utf8'));
const settings = settingsForMode('rules');

/** The rules translator, recording every en -> ro call (the browser translator is reached through the same call). */
function recording() {
  const base = createTranslator();
  const calls = [];
  return { calls, translator: { ...base, translate: async (text, o) => { if (o?.from === 'en' && o?.to === 'ro') calls.push(String(text)); return base.translate(text, o); } } };
}
const strip = (t) => String(t).replace(/"/g, '').replace(/\s+/g, ' ').trim();
/** The English reply without the user's own typed words (quotes that repeat something said in the session). */
const withoutUserWords = (t, said) => String(t).replace(/"([^"]*)"/g, (all, x) => (said.has(x.toLowerCase()) ? ' ' : all));

for (const reasoner of ['matrix', 'ops']) {
  for (const sc of SESSIONS) {
    test(`RO regression, ${reasoner}: ${sc.id}`, async () => {
      const { calls, translator } = recording();
      const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator, reasoner });
      const s = engine.createSession(sessionOptions(settings, { language: 'ro' }));
      const said = new Set();
      for (const [input, expect] of sc.turns) {
        said.add(input.toLowerCase());
        const before = calls.length;
        const r = await s.send(input, { language: 'ro' });
        assert.equal(r.lang, 'ro', input);
        assert.match(r.text, new RegExp(expect, 'u'), `${input} -> ${r.text}`);
        // the check-ro-replies gate: not English, not half and half, quotes well formed
        const q = checkReply({ shown: r.text, english: r.trace?.replyEnglish ?? r.text, lang: r.lang });
        assert.equal(q.kind, 'romanian', `${input} -> ${r.text} (${q.kind}: ${q.problems.join('; ')})`);
        // every sentence of the English reply (the user's own quoted words aside) was handed to the translator
        const sent = strip(calls.slice(before).join(' '));
        for (const sentence of withoutUserWords(r.trace.replyEnglish, said).split(/(?<=[.!?:])\s+/).map(strip).filter((x) => /\p{L}{2}/u.test(x))) {
          assert.ok(sent.includes(sentence.replace(/^[:.\s]+/, '')), `${input}: "${sentence}" never reached the translator (sent: ${sent})`);
        }
      }
    });
  }
}

test('the English profile reads "how old am I?" and refuses an impossible age with the reason', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  const s = engine.createSession(sessionOptions(settings, { language: 'en' }));
  const say = async (t) => (await s.send(t, { language: 'en' })).text;
  assert.match(await say('how old am I?'), /do not know your age/);
  assert.match(await say('I am 8 years old'), /8/);
  assert.equal(await say('how old am I?'), 'You are 8 years old.');
  assert.match(await say('I am 300 years old'), /^That does not add up\. No one is 300 years old\./);
});
