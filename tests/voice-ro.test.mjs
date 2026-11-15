// The Romanian grammar voice next to the translators (questions.md Q13): it proposes first, abstains outside its frames, and is silent while the setting is off.
// Romanian appears here only as data of the corpus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../src/translate/index.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { gatherCandidates } from '../src/translate/candidates.mjs';
import { createRoGrammarVoice } from '../src/translate/voice-ro.mjs';

const none = { translatorKind: () => null, detectorKind: () => null, translate: async () => { throw new Error('none'); }, detect: async () => { throw new Error('none'); }, prepare: async () => {}, state: () => 'none' };
const voice = createRoGrammarVoice();
const make = (on) => createSwitchTranslator({ rules: createTranslator(), getStrategy: () => 'auto', voices: () => (on ? [voice] : []), backend: none });

test('the voice proposes first where its frames read the sentence', async () => {
  const c = await gatherCandidates('desenează o casă roșie lângă un copac', { from: 'ro', to: 'en', translator: make(true) });
  assert.equal(c[0].source, 'grammar');
  assert.equal(c[0].text, 'draw a red house next to a tree');
  assert.ok(c.length >= 1);   // (a translator candidate with the same text is not repeated)
});
test('the voice abstains outside its frames: the translators read as before', async () => {
  const c = await gatherCandidates('deseneaza o zebra', { from: 'ro', to: 'en', translator: make(true) });   // a word w.lang.ro's dictionary has no lemma for (crocodil has one since catalog 085bc0d: the voice reads it now)
  assert.ok(!c.some((x) => x.source === 'grammar'));
  assert.ok(c.some((x) => x.source === 'rules'));
});
test('with the setting off no voice is heard', async () => {
  const c = await gatherCandidates('desenează o casă roșie', { from: 'ro', to: 'en', translator: make(false) });
  assert.ok(!c.some((x) => x.source === 'grammar'));
});
test('the voice is silent for English and for the other direction, and replies with the article', async () => {
  assert.equal(await voice.propose('draw a house', { from: 'en', to: 'ro' }), null);
  const p = await voice.propose('șterge casa', { from: 'ro', to: 'en' });
  assert.equal(p.text, 'delete the house');
  assert.equal(await voice.reply(p.frame), 'am șters casa');
});
