// SPDX-License-Identifier: AGPL-3.0-only
// NOISE: an always-open microphone hears room talk. A spoken message with no complete reading, no world word and no direct address is not for the assistant:
// it is ignored silently (shown greyed, tap to send anyway). Typed messages are never classified. Pure: the dry run is passed in.
import { normalize as normalizeLanguage } from './language.mjs';
import { SOURCE, APP_NAMES, extraWords, stemsOf, activeLanguage, addressWords, fold } from './voice-words.mjs';
// SETTINGS-COHERENT 3: no word list of this file is written in any language but English. For another selected language the lists come from
// ui/voice-words.mjs (the English entries translated once by the translation layer and cached); before that exists, only English words match.

/** An incomplete reading of this many words or more is not a command lacking an argument. */
const LONG_WORDS = 5;
/** The words that address the assistant in English (the app name and robot, assistant, computer); other languages add their translated words through voice-words. */
export const ADDRESS_WORDS = Object.freeze([...APP_NAMES, ...SOURCE.address]);
export { addressWords };

/** A word addresses the assistant when it is one of the address words, or such a word with a short ending (inflected languages: a case or a vocative ending, up to 3 letters). */
const matchesAddress = (x, own) => own.some((a) => x === a || (a.length >= 5 && x.startsWith(a) && x.length <= a.length + 3));
export const isAddressed = (text, extra = []) => { const own = addressWords(), w = fold(text).split(' '); return w.some((x) => matchesAddress(x, own) || extra.includes(x)); };
/** Questions to the assistant itself ("what can I say?"): they start the utterance. English, plus the translated starters of the selected language. */
export const isAssistantQuestion = (text) => { const t = fold(text); return [...SOURCE.questionStarters, ...extraWords('questionStarters')].some((q) => t === q || t.startsWith(`${q} `)); };

/**
 * Returns { ignore, reason }. `dryRead(text, { language, detail: true })` is the engine's dry run (no effects).
 * `wake`: the setting "only respond when I say the wake word": every message without a direct address is ignored.
 * When the dry run cannot tell (busy, deadline, error, slow device) the message passes: only a clear "no reading, no world word" is noise.
 */
export async function classifyVoice(text, { dryRead, language, wake = false, wakeWords = [], slow = false } = {}) {
  const t = String(text ?? '').trim();
  if (!t) return { ignore: true, reason: 'empty' };
  if (isAddressed(t, wakeWords)) return { ignore: false, reason: 'addressed' };
  if (wake) return { ignore: true, reason: 'wake word' };
  if (isAssistantQuestion(t)) return { ignore: false, reason: 'question' };
  if (slow || !dryRead) return cheap(t);
  // LANG-FIXED: the text is read in the selected language only
  const lang = normalizeLanguage(language);
  const verdict = await judge(t, dryRead, lang);
  return verdict;
}
/** Cheap signals, no dry run (slow device, busy, late): a command verb or a domain word near the start, or a question word first, makes a command; anything else is room talk. */
const verbs = () => [...SOURCE.commandVerbs, ...extraWords('commandVerbs'), ...SOURCE.openVerbs];
export function cheap(text) {
  const w = fold(text).split(' ').filter(Boolean);
  // another language whose word lists are not available (translator not ready, language not served): nothing here can call it room talk
  if (activeLanguage() !== 'en' && !extraWords('commandVerbs').length) return { ignore: false, reason: 'cheap: no word list for this language' };
  const vs = new Set(verbs()), vStems = stemsOf('commandVerbs').filter((x) => x.length >= 4), q = new Set([...SOURCE.questionWords, ...extraWords('questionWords')]);
  const nounStems = [...SOURCE.nouns, ...stemsOf('nouns')];
  const isVerb = (x) => vs.has(x) || (x.length >= 4 && vStems.some((s) => x.startsWith(s)));
  if (w.length < 2 && !isVerb(w[0] ?? '')) return { ignore: true, reason: 'cheap: one word' };
  const verb = w.slice(0, 3).some(isVerb);
  const noun = w.some((x) => x.length >= 3 && nounStems.some((s) => x.startsWith(s)));
  if (verb || (q.has(w[0]) && w.length >= 3) || (noun && w.length <= 6)) return { ignore: false, reason: 'cheap: command shape' };
  return { ignore: true, reason: 'cheap: no command shape' };
}
async function judge(t, dryRead, language) {
  let r = null;
  try { r = await dryRead(t, { language, detail: true }); } catch { r = null; }
  if (!r) return cheap(t);
  if (r.complete) return { ignore: false, reason: 'complete' };
  if (['busy', 'deadline', 'error', 'empty'].includes(r.reason)) return cheap(t);
  const readings = r.detail?.readings;
  if (!Array.isArray(readings)) return cheap(t);
  if (r.reason === 'refused') return { ignore: false, reason: 'understood' };   // understood but unsupported: the person gets the answer
  const worldWord = readings.some((x) => x?.world && !x.unparsed);
  // a world word in a long text that still has no complete reading ("dad what can I say") is room talk that happens to contain one; a short one ("play") is a command that lacks an argument
  if (worldWord && fold(t).split(' ').length < LONG_WORDS) return { ignore: false, reason: 'world word' };
  return { ignore: true, reason: worldWord ? 'long, no complete reading' : 'no reading' };
}
