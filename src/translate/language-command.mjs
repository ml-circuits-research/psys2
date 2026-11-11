// An explicit "switch the language" command, in either language, whatever language is selected (browser-safe, pure, no model).
//
// LANG-FIXED: the selected language is the language; only an explicit act changes it, and "treci pe engleză" typed while English is selected is as
// explicit as "switch to Romanian" typed while Romanian is. The command is recognized by its shape, not by a list of sentences:
//   [wish | politeness | filler]*  [verb]*  [the language]?  [preposition]?  <target language>  [politeness]*
// where every word is from a small closed vocabulary (English and Romanian, diacritics folded) and exactly one target language is named.
// Anything else in the sentence ("how do I say hello in English", "don't speak English", "translate this to English") is not a command.
//
//   languageCommand("treci pe engleză")          -> "Change the language to English."
//   languageCommand("vreau în română")           -> "Change the language to Romanian."
//   languageCommand("speak Romanian please")     -> "Change the language to Romanian."
//   languageCommand("make the house bigger")     -> null
//
// The returned sentence is the canonical English command of the `ui.shell` world (action `ui.language`); the dialog reads it instead of the original.

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/[ß]/g, 'ss');
const set = (s) => new Set(s.split(/\s+/).filter(Boolean));

/** Names of the two languages in both languages ("Romanian", "română", "românește"). */
const TARGET = { en: set('english engleza engleze englezeste englezesc'), ro: set('romanian romana romane romaneste romanesc') };
/** Verbs of changing or using a language. "say", "write", "translate" are left out on purpose: they ask for something else. */
const VERB = set(`speak talk switch change go use answer reply respond set put make turn stay come get give keep
  vorbeste vorbesti vorbiti vorbim vorbi trece treci treceti comuta comutati schimba schimbati foloseste folositi raspunde raspundeti
  pune pui fa fii du mergi mergeti ramai revino intoarce intoarceti alege alegeti seteaza`);
/** Wishes and politeness ("I want", "can you", "please", "te rog", "hai să"). */
const WISH = set(`i want wanna like love need prefer would id ill lets let us we should could can you could please pls plz kindly u thanks thx thank
  vreau vrem as vrea ar prefer prefera hai haide poti puteti poate te rog va ti multumesc sa sa mai`);
/** The word "language" and the prepositions that join the verb to the target. */
const NOUN = set('language lang limba limbi limbii');
const PREP = set('to in into on onto at for from with pe la spre cu catre in');
/** Fillers that may stand anywhere ("the", "again", "back", "now", "acum", "din nou"). */
const FILL = set('the a an my me mine mie mi now right again back only just instead forever permanently good acum iar inapoi din nou doar numai definitiv mereu inca si de ca');

/** The canonical English command for `lang` ("en" | "ro"). */
const COMMAND = { en: 'Change the language to English.', ro: 'Change the language to Romanian.' };

/**
 * @param {string} text  what the person typed or said
 * @returns {string | null}  the canonical English command ("Change the language to Romanian."), or null when the sentence is not a switch command
 */
export function languageCommand(text) {
  const words = fold(text).split(/[^\p{L}]+/u).filter(Boolean);
  if (!words.length || words.length > 10) return null;
  let target = null, targetAt = -1, anchor = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const lang = TARGET.en.has(w) ? 'en' : TARGET.ro.has(w) ? 'ro' : null;
    if (lang) {
      if (target && target !== lang) return null;   // "from English to Romanian": two languages, not a plain command
      if (target) return null;                       // the same language twice is no command either
      target = lang; targetAt = i;
      continue;
    }
    if (VERB.has(w) || NOUN.has(w)) { anchor = true; continue; }
    if (WISH.has(w)) { if (w === 'want' || w === 'vreau' || w === 'vrem' || w === 'wanna' || w === 'prefer' || w === 'prefera' || w === 'need') anchor = true; continue; }
    if (PREP.has(w) || FILL.has(w)) continue;
    return null;   // a word outside the closed vocabulary: not a command ("how do I say hello in English")
  }
  if (!target) return null;
  // "in English please" / "pe engleză": the preposition right before the target is an explicit enough act; the bare name alone is not
  if (!anchor && !(targetAt > 0 && PREP.has(words[targetAt - 1]))) return null;
  return COMMAND[target];
}

export default languageCommand;
