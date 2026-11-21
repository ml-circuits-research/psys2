// SPDX-License-Identifier: AGPL-3.0-only
// The English voice word lists of the page (worlds/app.project/voice-words.sop): app.voice.word rows, grouped by list in file
// order. Read by docs/webchat/ui/voice-words.mjs. Browser-safe: no `node:*`.
import { parse } from '../soplang/index.mjs?v=df11e6238f';
import VOICE_WORDS from '../../worlds/app.project/voice-words-source.mjs?v=81a95c1b3c';

/** { list: [texts] } in file order; a malformed row throws. */
export const VOICE_SOURCE = (() => {
  const lists = {}, { wires, errors } = parse(VOICE_WORDS, { source: 'voice-words.sop' });
  if (errors?.length) throw Error('invalid-voice-words: ' + errors[0].message);
  for (const w of wires) {
    if (w.type !== 'app.voice.word') continue;
    const value = (k) => w.entries.find((e) => e.key === k || e.key.endsWith('.' + k))?.value?.v;
    const list = value('list'), text = value('text');
    if (typeof list !== 'string' || typeof text !== 'string') throw Error('invalid-voice-words: ' + w.id);
    (lists[list] ??= []).push(text);
  }
  return Object.freeze(Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, Object.freeze(v)])));
})();
