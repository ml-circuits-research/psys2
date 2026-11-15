// SPDX-License-Identifier: AGPL-3.0-only
// THE REGISTER OF A TRANSLATED REPLY (src/translate/register.mjs; owner export 2026-11-14 22:43, finding 2): the on-device model turned "Drew a circle." into "A făcut un cerc." (the
// assistant in the third person) and wrote "Puteți schimba ... faceți casa albastră" next to "pentru tine". Measured with the real model (scripts/lib/mt-node.mjs, en-ro spring-2024):
// "Drew a circle." -> "A făcut un cerc." before, "Am desenat un cerc." after; "Added a table." -> "A adăugat" before, "Am adăugat" after.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../src/translate/index.mjs';
import { withSubject, informalRo, polishReply } from '../src/translate/register.mjs';
import { translateParts } from '../src/dialog/index.mjs';

test('withSubject: a reply sentence that starts with a bare past verb gets its subject "I"; questions, imperatives, sentences with a subject are kept', () => {
  assert.equal(withSubject('Drew a circle.'), 'I drew a circle.');
  assert.equal(withSubject('Moved Done. Added a box.'), 'I moved Done. I added a box.');
  for (const s of ['I drew a sunny scene.', 'Red is a colour.', 'There is nothing to undo.', 'Did you mean "a cat"?', 'Put a hat on.', 'Indeed it is.']) assert.equal(withSubject(s), s);
});

test('informalRo: one register in a Romanian reply, the informal singular (present after a subject, imperative at the start of a sentence or a quote), from the morphology', async () => {
  await createTranslator().translate('Pune un cerc', { from: 'ro', to: 'en' });   // the Romanian lexicon is loaded
  assert.equal(informalRo('Am desenat o scenă pentru tine. Puteți schimba orice, de exemplu „faceți casa albastră”.'), 'Am desenat o scenă pentru tine. Poți schimba orice, de exemplu „fă casa albastră”.');
  assert.equal(informalRo('Spuneți-mi ce să desenez.'), 'Spune-mi ce să desenez.');
  assert.equal(informalRo('Vă rog să încercați din nou.'), 'Te rog să încerci din nou.');
  assert.equal(informalRo('Am desenat un cerc.'), 'Am desenat un cerc.', 'nothing to change');
  assert.equal(polishReply('Puteți', 'de'), 'Puteți', 'only Romanian is polished');
});

test('translateParts: the machine translator gets our English with its subject, and the Romanian it returns is put in the informal singular', async () => {
  const asked = [];
  const rules = createTranslator();
  const translator = {
    rules, fallbackMode: () => 'fallback', leftovers: () => [],
    candidatesViaMT: async (text) => { asked.push(text); return [{ source: 'model', text: text === 'I drew a circle.' ? 'Am desenat un cerc. Puteți schimba culoarea.' : 'A făcut un cerc.' }]; },
    translate: (t, o) => rules.translate(t, o),
  };
  const r = await translateParts([{ text: 'Drew a circle.', translate: true }], translator, 'ro');
  assert.deepEqual(asked, ['I drew a circle.']);
  assert.match(r.text ?? r.parts?.map((p) => p.text).join('') ?? JSON.stringify(r), /Am desenat un cerc\. Poți schimba culoarea\./);
});
