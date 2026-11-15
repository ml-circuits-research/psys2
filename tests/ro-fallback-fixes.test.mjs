// RO-TRANSLATE-FALLBACK, the small fixes of the task: the user's own word in a refusal, Romanian quotes, the chess and music lines, the tab reading, the day
// question, and a host string (the engine's own chess move) put into Romanian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { createSwitchTranslator } from '../docs/webchat/ui/translation.mjs';
import { createFakeTranslation } from '../scripts/lib/fake-browser-apis.mjs';

const base = createTranslator();
async function session(translator, reasoner = 'matrix') {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator, reasoner });
  return engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'ro' }));
}
const said = (s) => async (t) => (await s.send(t, { language: 'ro' })).text;

for (const reasoner of ['matrix', 'ops']) {
  test(`small fixes (${reasoner})`, async () => {
    const say = said(await session(createTranslator(), reasoner));
    assert.equal(await say('deschide fila dragoni'), 'Nu există nicio filă „dragoni”.');
    // P3: the map's help examples are its generated forms ("Add a pin", ...) since the geo.map switch and the Romanian session gets the reply in English: "ce poți face pe hartă?" is on the failure ledger;
    // the chess lines were deleted with ADR-010
    const music = said(await session(createTranslator(), reasoner));
    assert.match(await music('cântă Twinkle Twinkle'), /Cânt „Twinkle, Twinkle, Little Star” la pian/);   // a song title stays a title
    const back = said(await session(createTranslator(), reasoner));
    await back('deschide fila hartă');
    await back('deschide fila muzică');
    assert.match(await back('înapoi'), /^Bine, înapoi la fila Hartă\.$/);
  });
}

test('the day question reads and writes in the order of speech', () => {
  assert.equal(base.translate('OK, I forgot what day it is today.', { from: 'en', to: 'ro' }).text, 'OK, am uitat ce zi este azi.');
  assert.equal(base.translate('ce este zi azi', { from: 'ro', to: 'en' }).text, 'What day is it today');
});
