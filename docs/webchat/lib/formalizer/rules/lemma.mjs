/** Singular lemmatizer and a matching pluralizer (spec 03 section 2). Browser-safe. */

import { en } from '../../lang/en.mjs?v=35d25b1790';

/**
 * Singular lemma of a lowercase word. Irregular plurals first (`irregular` maps plural -> singular, the lexicon's `plural=` entries), then the facts of handover/lang.en (shards/morphology.sop, set `lemma`):
 * Latin-style plurals, `ies`->`y`, `ves`->`f`, `(ch|sh|x|ss)es` and `(us)es` plurals -> drop `es`, `s` -> drop (singular nouns ending in `ss`, `us` or `is` -- glass, octopus, iris -- keep their `s`).
 */
export const singularLemma = (word, irregular) => en.singular(word, 'lemma', irregular);

/** Plural of a singular word; `irregular` maps singular -> plural. Multi-word: last word. */
export function pluralize(word, irregular) {
  const parts = word.split(/[ _]/);
  const last = parts.pop().toLowerCase();
  let pl;
  if (irregular?.has(last)) pl = irregular.get(last);
  else if (/[^aeiou]y$/.test(last)) pl = last.slice(0, -1) + 'ies';
  else if (/(s|x|z|ch|sh)$/.test(last)) pl = last + 'es';
  else pl = last + 's';
  return [...parts, pl].join(' ');
}
