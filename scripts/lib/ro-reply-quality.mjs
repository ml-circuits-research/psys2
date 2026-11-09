// Romanian reply quality (RD5): a reply in a Romanian session is fully Romanian (or deliberately left in English as a whole) and its quotes are well formed.
//   checkReply({ shown, english, lang }) -> { kind: 'romanian' | 'english' | 'mixed' | 'broken-quote' | 'skipped', problems: [string] }
// "Broken quote" is the RD5 report: `Încearcă" desena o casă roșie"` (an opening quote glued to the previous word, an odd number of quotes).
import { englishLeftovers } from '../../src/translate/en-ro.mjs';

const OPEN = /["„«]/;
const quoteProblems = (text) => {
  const problems = [];
  const chars = [...text];
  const marks = chars.map((c, i) => [c, i]).filter(([c]) => c === '"');
  if (marks.length % 2) problems.push('odd number of quotes');
  marks.forEach(([, i], k) => {
    const prev = chars[i - 1], next = chars[i + 1];
    if (k % 2 === 0 && prev && /\p{L}/u.test(prev)) problems.push(`opening quote glued to the word before it (at ${i})`);
    if (k % 2 === 1 && next && /\p{L}/u.test(next)) problems.push(`closing quote glued to the word after it (at ${i})`);
  });
  if (/(^|\s)[„«]/.test(text) && !/[”»]/.test(text)) problems.push('unclosed typographic quote');
  return problems;
};
const unquote = (t) => String(t).replace(/"[^"]*"/g, ' ').replace(/[„«][^”»]*[”»]/g, ' ');

export function checkReply({ shown, english, lang }) {
  if (lang !== 'ro' || !shown) return { kind: 'skipped', problems: [] };
  const strip = (t) => unquote(t).replace(/\s+/g, ' ').trim();
  if (strip(shown) === strip(english)) return { kind: 'english', problems: [] };   // the whole reply was kept in English (never half and half)
  const problems = quoteProblems(shown);
  if (problems.length) return { kind: 'broken-quote', problems };
  const left = englishLeftovers(unquote(shown));
  if (left.length) return { kind: 'mixed', problems: [`English words in a Romanian reply: ${left.join(', ')}`] };
  return { kind: 'romanian', problems: [] };
}
