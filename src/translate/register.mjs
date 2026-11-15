// SPDX-License-Identifier: AGPL-3.0-only
// THE REGISTER OF A REPLY given to a machine translator and taken back from it (owner export 2026-11-14 22:43, finding 2): "Drew a circle." came back as "A făcut un cerc."
// (the assistant in the third person) and one reply mixed "pentru tine" with "Puteți / faceți" (formal plural). Browser-safe, no `node:*`.
//
//  - English side, every target language: our replies elide the subject "I" ("Drew a circle.", "Moved Done."); a machine translator reads a bare past verb as he / she.
//    `withSubject(text)` gives each such sentence its subject before the text goes to a machine translator.
//  - Romanian side: one register, the informal singular (the app says "tu"). `informalRo(text)` turns the second person plural of a verb into the singular (an imperative at
//    the start of a sentence or a quote, "faceți casa albastră" -> "fă casa albastră"; else the present, "Puteți schimba" -> "Poți schimba"), from the Romanian morphology of
//    the rules translator (no list of verb forms here), and the formal pronouns into the informal ones.
import { analyzeVerbForm, verbPresent } from './morphology.ro.mjs';

/** English past tenses that do not end in -ed (the verbs of the app's own replies and the common irregulars). Not a past that is also a base form (put, set, cut, read: "Put a hat on." is an imperative) or an auxiliary (did: "Did you mean ..."). */
const IRREGULAR_PAST = new Set(['drew', 'made', 'took', 'gave', 'sent', 'wrote', 'undid', 'redid', 'built', 'found', 'left', 'kept', 'threw', 'hid', 'lit', 'ran', 'sang',
  'began', 'brought', 'held', 'met', 'chose', 'spun', 'shook', 'bent', 'swept', 'stuck', 'struck', 'tore', 'wove', 'wound', 'got', 'said', 'told', 'thought', 'heard', 'saw', 'knew', 'forgot', 'sold', 'bought', 'caught', 'taught', 'brought', 'laid', 'paid']);
const PAST = /^[A-Z][a-z]{2,}ed$/;   // a regular past of five letters or more (Moved, Added, Changed); "Red", "Bed" are not
const SUBJECT_WORDS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'there', 'this', 'that', 'the', 'a', 'an']);
/** "Drew a circle. Moved Done." -> "I drew a circle. I moved Done." (a sentence that starts with a bare past verb; anything else is kept). */
export function withSubject(text) {
  return String(text ?? '').replace(/(^|[.!?]\s+)([A-Z][a-z]+)\b/g, (all, lead, w) => {
    const lw = w.toLowerCase();
    if (SUBJECT_WORDS.has(lw)) return all;
    if (!(IRREGULAR_PAST.has(lw) || (PAST.test(w) && !/(?:eed|ced)$/.test(lw)))) return all;   // not "Indeed", "Speed"
    return `${lead}I ${lw}`;
  });
}

const PRONOUNS = [[/\bdumneavoastră\b/g, 'tu'], [/\bDumneavoastră\b/g, 'Tu'], [/\bVă rog\b/g, 'Te rog'], [/\bvă rog\b/g, 'te rog']];
const cap = (w, like) => (/^\p{Lu}/u.test(like) ? w[0].toUpperCase() + w.slice(1) : w);
/** One register in a Romanian reply: the informal singular. Words the morphology does not read as a 2nd person plural verb are kept. */
export function informalRo(text) {
  let s = String(text ?? '');
  for (const [re, to] of PRONOUNS) s = s.replace(re, to);
  return s.replace(/(^|[\s„"«(]|[.!?]\s+)(\p{L}+ți)\b/gu, (all, lead, w) => {
    let reads = [];
    try { reads = analyzeVerbForm(w.toLowerCase()).filter((a) => a.person === 2 && a.number === 'pl' && (a.tense === 'pres' || a.tense === 'imp')); } catch { reads = []; }
    if (!reads.length) return all;
    const e = reads[0].entry;
    const atStart = lead === '' || /[„"«(]$/.test(lead) || /[.!?]\s+$/.test(lead);
    const imperative = atStart && reads.some((a) => a.tense === 'imp' || e?.flags?.imp);
    const to = imperative ? (typeof e.flags?.imp === 'string' ? e.flags.imp.split(',')[0] : verbPresent(e, 3, 'sg')) : verbPresent(e, 2, 'sg');
    return to ? `${lead}${cap(to, w)}` : all;
  });
}

/**
 * The polish of a machine translation of one of our replies into `lang` (the source `src` is our English): Romanian gets one register. The assistant speaking of itself in the third
 * person is prevented on the English side (`withSubject`) before the call.
 */
export function polishReply(out, lang) {
  return lang === 'ro' ? informalRo(out) : out;
}
