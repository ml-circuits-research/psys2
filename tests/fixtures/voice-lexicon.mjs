// SPDX-License-Identifier: AGPL-3.0-only
// Test fixture: a fake translation layer for the voice word lists (docs/webchat/ui/voice-words.mjs). In the product the layer is the browser Translator or the
// on-device model; here a small dictionary stands in, so the tests check the generic mechanism with a real second language.
import { buildLexicon, setLexicon } from '../../docs/webchat/ui/voice-words.mjs';

const RO = {
  robot: 'robot', assistant: 'asistent', computer: 'calculator',
  'stop microphone': 'oprește microfonul', 'stop listening': 'nu mai asculta', 'mute the microphone': 'pune microfonul pe mute', 'microphone off': 'microfon oprit', 'pause listening': 'pauză ascultare', 'that is all': 'asta e tot',
  stop: 'oprește', pause: 'pauză', close: 'închide', end: 'termină', mic: 'microfon', microphone: 'microfonul', listening: 'ascultarea', recording: 'înregistrarea', cancel: 'anulează',
  and: 'și', then: 'apoi', to: 'la', with: 'cu', or: 'sau', but: 'dar', a: 'un', of: 'de', in: 'în', on: 'pe', for: 'pentru', from: 'din', under: 'sub', over: 'peste',
  play: 'cântă', draw: 'desenează', add: 'adaugă', make: 'fă', open: 'deschide', show: 'arată', put: 'pune', move: 'mută', delete: 'șterge', change: 'schimbă', write: 'scrie',
  this: 'acest', my: 'meu', your: 'tău', some: 'niște', one: 'unu', two: 'doi', three: 'trei', four: 'patru', five: 'cinci', ten: 'zece',
  'what can i say': 'ce pot să zic', 'who are you': 'cine ești', help: 'ajutor', 'how do i': 'cum pot',
  what: 'ce', how: 'cum', who: 'cine', where: 'unde', when: 'când',
  house: 'casă', heart: 'inimă', tree: 'copac', sun: 'soare', cloud: 'nor', fish: 'pește', flower: 'floare', map: 'hartă', music: 'muzică', song: 'cântec', game: 'joc', circle: 'cerc', square: 'pătrat', cow: 'vacă',
  the: 'o',
  undo: 'anulează', redo: 'refă', next: 'următorul', back: 'înapoi', again: 'din nou',
};
/** Installs the lexicon of the test language 'ro' (or clears it with null). Returns the build result. */
export async function installLexicon(lang = 'ro') {
  if (!lang || lang === 'en') { setLexicon('en', null); return null; }
  const r = await buildLexicon({ lang, translate: async (t) => RO[t] ?? t, yieldFn: async () => {} });
  setLexicon(lang, r.lists);
  return r;
}
