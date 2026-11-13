// SCENE-NATURAL P6: the reply check, and the general fixes it drove (an article or conjunction is never "the thing"; an internal id is said in plain words).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { replyFlags } from '../scripts/lib/reply-check.mjs';

test('replyFlags: internal word, dangling article, incomplete sentence', () => {
  assert.deepEqual(replyFlags('Drew a circle.'), []);
  assert.deepEqual(replyFlags('I did not understand "put a and a". I did not know the words: a, and.'), []);   // the user's words are not judged
  assert.ok(replyFlags('Drew c1.').includes('internal id'));
  assert.ok(replyFlags('I made a composite.').some((f) => /composite/.test(f)));
  assert.ok(replyFlags('I do not know how to draw a A.').some((f) => /article/.test(f)));
  assert.ok(replyFlags('I do not know how to draw a.').some((f) => /dangling/.test(f)));
  assert.ok(replyFlags('I moved the').length >= 1);
  assert.ok(replyFlags('i moved it.').some((f) => /lower case/.test(f)));
  assert.ok(replyFlags('Hello {name}.').some((f) => /hole/.test(f)));
  assert.ok(replyFlags('Am desenat o casă', { lang: 'ro' }).some((f) => /complete/.test(f)));
});

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
async function say(tab, ...texts) {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: tab });
  let r;
  for (const t of texts) r = await s.send(t);
  return r.text;
}

test('a function word is never the thing: the drawing board asks which thing is meant', async () => {
  for (const msg of ['move and up', 'move still up', 'move the or']) {
    const text = await say('draw', 'draw a house', msg);
    assert.doesNotMatch(text, /do not know what "(?:and|still|the|a|or)"/i, `${msg} -> ${text}`);
    assert.deepEqual(replyFlags(text), [], `${msg} -> ${text}`);
  }
});

test('the diagram never shows an internal id in a sentence ("c1 -> s1 already exists")', async () => {
  const text = await say('diagram', 'draw a circle and 2 squares', 'connect all the shapes', 'connect all the shapes');
  assert.deepEqual(replyFlags(text), [], text);
});
