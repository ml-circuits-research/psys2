// SPDX-License-Identifier: AGPL-3.0-only
// VOICE ADMISSION: which spoken messages reach the engine. Nothing the person said is judged by word lists here: every
// non-empty spoken message goes to the reader, whose coverage and refusal decide (and say) what happens. The only filter
// is the person's own setting "only respond when I say the wake word"; a message it holds back is shown greyed with
// "tap to send anyway", kept in the phrase log and announced as a `voice.admission` world-activity event (app.mjs).
// Typed messages are never classified. Pure: no DOM.
import { APP_NAMES, SOURCE, addressWords, fold } from './voice-words.mjs';

/** The words that address the assistant in English (the app name and robot, assistant, computer); other languages add their translated words through voice-words. */
export const ADDRESS_WORDS = Object.freeze([...APP_NAMES, ...SOURCE.address]);
export { addressWords };

/** A word addresses the assistant when it is one of the address words, or such a word with a short ending (inflected languages: a case or a vocative ending, up to 3 letters). */
const matchesAddress = (x, own) => own.some((a) => x === a || (a.length >= 5 && x.startsWith(a) && x.length <= a.length + 3));
export const isAddressed = (text, extra = []) => { const own = addressWords(), w = fold(text).split(' '); return w.some((x) => matchesAddress(x, own) || extra.includes(x)); };

/**
 * Returns { ignore, reason }. `wake`: the setting "only respond when I say the wake word": a message without a direct
 * address is held back (visibly). Every other non-empty message is admitted; the reader decides what it means.
 */
export async function classifyVoice(text, { wake = false, wakeWords = [] } = {}) {
  const t = String(text ?? '').trim();
  if (!t) return { ignore: true, reason: 'empty' };
  if (isAddressed(t, wakeWords)) return { ignore: false, reason: 'addressed' };
  if (wake) return { ignore: true, reason: 'wake word setting: no address word' };
  return { ignore: false, reason: 'admitted: the reader decides' };
}
