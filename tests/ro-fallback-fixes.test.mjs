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
    assert.match(await say('ce poți face pe hartă?'), /^Ca să arăți locuri pe hartă, poți spune, de exemplu: „arată Parisul”/);
    const chess = said(await session(createTranslator(), reasoner));
    assert.match(await chess('joacă șah'), /Ești cu albele și muți primul\./);
    await chess('e4');
    assert.match(await chess('anulează'), /Suntem din nou la început\./);   // chess undo keeps "We are back at the start."
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

test('host strings: observeIn puts the engine own chess move into Romanian, never English', async () => {
  const fake = createFakeTranslation();
  const backend = { translatorKind: () => 'translator', detectorKind: () => null, translate: async (t, f, to) => fake.translate(t, f, to), detect: async () => [], prepare: async () => {}, state: () => 'ready' };
  const s = await session(createSwitchTranslator({ rules: base, backend, getStrategy: () => 'auto' }));
  const say = said(s);
  await say('joacă șah');
  await say('e4');
  const out = await s.observeIn({ effect: 'chess.engine.bestmove', ok: true, data: { bestmove: 'e7e6' }, world: 'games.chess' }, { language: 'ro' });
  assert.equal(out.textEnglish, 'I play pawn to e6. Your move.');
  assert.equal(out.text, 'Joc cu pionul la e6. E rândul tău.');
});
