// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SCENE-NATURAL P6: is a reply as natural as the request? Checks one reply (English, or the reply text in the user's language) for
 *   - an internal word shown to the user (composite, a bare internal id such as c1 / s2, a template hole {x}, undefined, an ontology key),
 *   - a dangling article ("I do not know how to draw a A.", "put a and a lake", "a ."),
 *   - an incomplete sentence (no terminal punctuation, starts in lower case),
 * and, for a language other than English, English function words left in the reply (`leftovers(text, lang)` of the translator, when given).
 * Returns the list of flags (empty = natural). Pure: usable by the owner-log eval and by the template scan.
 */
const ARTICLES = 'a|an|the|un|o|une|ein|eine|el|la';
const INTERNAL = [
  [/\bcomposite\b/i, 'internal word: composite'],
  [/(?<![\w-])(?:c|s)\d+(?![\w-])/i, 'internal id'],
  [/\{[^}]*\}|\$\{|\[object|\bundefined\b|\bnull\b|\bNaN\b/, 'template hole or placeholder shown'],
  [/\b[a-z]+\.[a-z]+\.[a-z]+(?:\.[a-z]+)*\b/, 'ontology key shown'],
];
const DANGLING = [
  [new RegExp(`\\b(?:${ARTICLES})\\s*(?:[.,!?;:)]|$)`, 'i'), 'dangling article at a clause end'],
  [/\b(?:a|an)\s+(?:a|an|the)\b/i, 'two articles in a row'],
  [new RegExp(`\\b(?:draw|put|move|make|add|paint|place)\\s+(?:and|or|the|a|an)\\s+(?:and|or)\\b`, 'i'), 'article or conjunction taken as the thing'],
  [/\b(?:a|an|the)\s+(?:A|An|The)\b(?![a-z])/, 'an article taken as the thing'],
  [/\bwhat "?(?:a|an|the|and|or|still|of|in|on|at|to)"? is\b/i, 'a function word taken as the thing'],
];
export function replyFlags(text, { lang = 'en', leftovers = null } = {}) {
  const flags = [];
  const t = String(text ?? '').trim();
  if (!t) return ['empty reply'];
  // the app lists the words it did not know, verbatim and unjudged
  const unquoted = t.replace(/ (?:I did not know the words?|Nu am știut cuv[iâî]nt(?:ele|ul)): .*$/s, '').replace(/ \(„.*\)$/s, '').replace(/"[^"]*"|“[^”]*”|„[^”]*”/g, '""');   // the user's own words are quoted verbatim and not judged
  for (const [re, why] of INTERNAL) if (re.test(unquoted)) flags.push(why);
  if (lang === 'en') for (const [re, why] of DANGLING) if (re.test(unquoted)) flags.push(why);
  else for (const [re, why] of DANGLING.slice(0, 1)) if (re.test(unquoted) && lang !== 'ro') flags.push(why);   // other languages: only the clause-end article
  if (lang === 'ro' && /(?:^|[.!?]\s+)(?:Un|O)\s+[A-ZĂÂÎȘȚ]\b(?!\w)/.test(unquoted)) flags.push('an article taken as the thing');
  if (!/[.!?…"”)»]$/.test(t)) flags.push('sentence not complete (no end mark)');
  if (/^[a-zăâîșț]/.test(t)) flags.push('sentence starts in lower case');
  if (lang !== 'en' && typeof leftovers === 'function') { const l = leftovers(unquoted, lang) ?? []; if (l.length) flags.push(`English words left: ${l.slice(0, 3).join(', ')}`); }
  return [...new Set(flags)];
}
