// SPDX-License-Identifier: AGPL-3.0-only
// NOISE: an always-open microphone hears room talk. A spoken message with no complete reading, no world word and no direct address is not for the assistant:
// it is ignored silently (shown greyed, tap to send anyway). Typed messages are never classified. Pure: the dry run is passed in.
import { normalize as normalizeLanguage } from './language.mjs';
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
  if (slow || !dryRead) return cheap(t);
  // LANG-FIXED: the text is read in the selected language only (never in the other one); English commands inside a Romanian sentence pass through the Romanian pipeline
  const lang = normalizeLanguage(language);
  const verdict = await judge(t, dryRead, lang);
  return verdict;
}
/** Cheap signals, no dry run (slow device, busy, late): a command verb or a domain word near the start, or a question word first, makes a command; anything else is room talk. */
const VERBS = new Set(['draw', 'make', 'add', 'put', 'move', 'delete', 'remove', 'show', 'open', 'close', 'play', 'start', 'set', 'change', 'turn', 'go', 'find', 'search', 'tell', 'give', 'create', 'write', 'rename', 'select', 'undo', 'redo', 'clear', 'erase', 'paint', 'color', 'colour', 'fill', 'rotate', 'resize', 'zoom', 'list', 'display', 'become', 'be', 'sing', 'stop', 'next', 'help', 'cancel', 'please', 'let', 'switch', 'pick', 'choose', 'guess', 'read', 'say', 'fa', 'fac', 'pun', 'mut', 'fii']);
const VERB_STEMS = ['desen', 'deschid', 'arat', 'cant', 'sterg', 'adaug', 'schimb', 'scri', 'caut', 'alege', 'porne', 'opre', 'inchid', 'selecteaz', 'creeaz', 'redenum', 'afis', 'marest', 'micsor', 'rotest', 'colorea', 'vopse', 'joac', 'incep', 'devin', 'transform', 'spune-', 'redau', 'reda', 'anulea', 'inapoi', 'urmator', 'ajutor', 'ghicest', 'citest', 'alatur', 'muta', 'pune', 'fa-'];
const QWORDS = new Set(['what', 'how', 'who', 'where', 'when', 'which', 'why', 'is', 'are', 'does', 'do', 'can', 'could', 'ce', 'cum', 'cine', 'unde', 'cand', 'care', 'cate', 'cati', 'cat', 'de', 'cati']);
const NOUN_STEMS = ['cas', 'house', 'inim', 'heart', 'copac', 'tree', 'soare', 'sun', 'cloud', 'nor', 'pest', 'fish', 'flor', 'flower', 'hart', 'map', 'muzic', 'music', 'song', 'sah', 'chess', 'joc', 'game', 'hangman', 'diagram', 'chart', 'grafic', 'document', 'titl', 'chapter', 'capitol', 'robot', 'avatar', 'emoji', 'cerc', 'circle', 'square', 'patrat', 'triang', 'animal', 'vaca', 'cow', 'legs'];
export function cheap(text) {
  const w = fold(text).split(' ').filter(Boolean);
  if (w.length < 2 && !VERBS.has(w[0]) && !VERB_STEMS.some((s) => w[0]?.startsWith(s))) return { ignore: true, reason: 'cheap: one word' };
  const head = w.slice(0, 3);
  const verb = head.some((x) => VERBS.has(x) || (x.length >= 4 && VERB_STEMS.some((s) => x.startsWith(s))));
  const noun = w.some((x) => x.length >= 3 && NOUN_STEMS.some((s) => x.startsWith(s)));
  if (verb || (QWORDS.has(w[0]) && w.length >= 3) || (noun && w.length <= 6)) return { ignore: false, reason: 'cheap: command shape' };
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
  // a world word in a long text that still has no complete reading ("tata ce pot sa zic") is room talk that happens to contain one; a short one ("play") is a command that lacks an argument
  if (worldWord && fold(t).split(' ').length < LONG_WORDS) return { ignore: false, reason: 'world word' };
  return { ignore: true, reason: worldWord ? 'long, no complete reading' : 'no reading' };
}
