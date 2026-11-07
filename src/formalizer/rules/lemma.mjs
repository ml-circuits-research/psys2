/** Singular lemmatizer and a matching pluralizer (spec 03 section 2). Browser-safe. */

/**
 * Singular lemma of a lowercase word. Irregular plurals first (`irregular` maps plural -> singular),
 * then `ies`->`y`, `ves`->`f`, `(ch|sh|x|ss)es` -> drop `es`, `s` -> drop (not after `ss`).
 */
export function singularLemma(word, irregular) {
  const w = word.toLowerCase();
  if (irregular?.has(w)) return irregular.get(w);
  if (w.length > 3 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('ves')) return w.slice(0, -3) + 'f';
  if (w.length > 3 && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
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
