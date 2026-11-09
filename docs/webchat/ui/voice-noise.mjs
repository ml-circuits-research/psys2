// SPDX-License-Identifier: AGPL-3.0-only
// NOISE: an always-open microphone hears room talk. A spoken message with no complete reading, no world word and no direct address is not for the assistant:
// it is ignored silently (shown greyed, tap to send anyway). Typed messages are never classified. Pure: the dry run is passed in.
const fold = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s'-]+/g, ' ').replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** An incomplete reading of this many words or more is not a command lacking an argument. */
const LONG_WORDS = 5;
/** Words that address the assistant (folded). */
export const ADDRESS_WORDS = ['psys2', 'psys', 'robot', 'robotul', 'robotule', 'assistant', 'asistent', 'asistentule', 'computer', 'calculatorule'];
/** Questions to the assistant itself ("what can I say?"): they start the utterance. */
const QUESTIONS = /^(what can i (say|do|ask)|what do you (know|do)|what can you (do|say)|who are you|how do i|help( me)?|ce pot sa (zic|spun|fac|intreb)|ce stii (sa faci)?|ce poti (sa faci)?|cine esti|cum (pot|fac)|ajutor|ajuta ma)\b/;

export const isAddressed = (text, extra = []) => { const w = fold(text).split(' '); return w.some((x) => ADDRESS_WORDS.includes(x) || extra.includes(x)); };
export const isAssistantQuestion = (text) => QUESTIONS.test(fold(text));

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
  if (slow || !dryRead) return { ignore: false, reason: 'unchecked' };
  // the session language may still be the other one (the first Romanian sentence of an English session): the text is read in both and passes when either reads it
  const langs = [language, language === 'ro' ? 'en' : 'ro'].filter((x, k, a) => x && a.indexOf(x) === k);
  let verdict = { ignore: true, reason: 'no reading' };
  for (const lang of langs.length ? langs : [undefined]) {
    const v = await judge(t, dryRead, lang);
    if (!v.ignore) return v;
    verdict = v;
  }
  return verdict;
}
async function judge(t, dryRead, language) {
  let r = null;
  try { r = await dryRead(t, { language, detail: true }); } catch { r = null; }
  if (!r) return { ignore: false, reason: 'unchecked' };
  if (r.complete) return { ignore: false, reason: 'complete' };
  if (['busy', 'deadline', 'error', 'empty'].includes(r.reason)) return { ignore: false, reason: 'unchecked' };
  const readings = r.detail?.readings;
  if (!Array.isArray(readings)) return { ignore: false, reason: 'unchecked' };
  if (r.reason === 'refused') return { ignore: false, reason: 'understood' };   // understood but unsupported: the person gets the answer
  const worldWord = readings.some((x) => x?.world && !x.unparsed);
  // a world word in a long text that still has no complete reading ("tata ce pot sa zic") is room talk that happens to contain one; a short one ("play") is a command that lacks an argument
  if (worldWord && fold(t).split(' ').length < LONG_WORDS) return { ignore: false, reason: 'world word' };
  return { ignore: true, reason: worldWord ? 'long, no complete reading' : 'no reading' };
}
