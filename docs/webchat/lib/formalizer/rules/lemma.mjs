/** Singular lemmatizer and a matching pluralizer (spec 03 section 2). Browser-safe. */

/** Built-in irregular plurals of Latin-style nouns (the lexicon `plural=` entries take precedence). */
const LATIN_PLURALS = new Map([['cacti', 'cactus'], ['octopi', 'octopus'], ['fungi', 'fungus'], ['radii', 'radius'], ['nuclei', 'nucleus']]);
/** Plural "-s" forms ending in -is that are not singular -is nouns (kiwis, taxis, ...). */
const IS_PLURALS = /(?:kiwi|taxi|ski|yeti|bikini|alibi|emoji|safari|tsunami|salami|chili|wifi|zucchini|broccoli|deli|rabbi|zombie?|cookie|movie|pixie)s$/;
/** Plurals of -us nouns that end in `uses` (octopuses, buses, viruses, cactuses, walruses ...); "causes", "uses", "houses" are not. */
const US_PLURALS = /(?:^buses|(?:pus|rus|ctus|mbus|mpus|nus|ngus|ccus|rcus)es)$/;

/**
 * Singular lemma of a lowercase word. Irregular plurals first (`irregular` maps plural -> singular),
 * then `ies`->`y`, `ves`->`f`, `(ch|sh|x|ss)es` and `(us)es` plurals -> drop `es`, `s` -> drop
 * (singular nouns ending in `ss`, `us` or `is` -- glass, octopus, iris -- keep their `s`).
 */
export function singularLemma(word, irregular) {
  const w = word.toLowerCase();
  if (irregular?.has(w)) return irregular.get(w);
  if (LATIN_PLURALS.has(w)) return LATIN_PLURALS.get(w);
  if (w.length > 3 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('ves')) return w.slice(0, -3) + 'f';
  if (w.length > 3 && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 4 && US_PLURALS.test(w)) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !/(ss|us)$/.test(w) && !(w.endsWith('is') && !IS_PLURALS.test(w))) return w.slice(0, -1);
  return w;
}

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
