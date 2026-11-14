/** Number words to digits (spec 03 section 1.4). Browser-safe. */

import { budget } from '../../dialog/budget.mjs';
import { numberInfo, numberWordOf } from '../../knowledge/values.mjs';   // the one reader of number words (k.values): no number lexicon in the formalizer
// Misspellings people type (fourty, ninty, fiveteen, eightteen) are read as the right number: spelling, not number knowledge.
const MISSPELLED = { fiveteen: 15, eightteen: 18, fourty: 40, ninty: 90 };

/** The value of a cardinal number word of the catalog (or a misspelling of one), else null. */
const cardinal = (w) => {
  const i = numberInfo(w, 'cardinal');
  if (i && Number.isInteger(i.value)) return i.value;
  if (MISSPELLED[w] != null) return MISSPELLED[w];
  const m = /^([a-z]+)-([a-z]+)$/.exec(w);   // "fourty-five": the catalog has "forty-five"; a misspelled tens word joined to a unit is still the number
  if (m && MISSPELLED[m[1]] >= 20 && MISSPELLED[m[1]] % 10 === 0) { const u = numberInfo(m[2], 'cardinal'); if (u && Number.isInteger(u.value) && u.value > 0 && u.value < 10) return MISSPELLED[m[1]] + u.value; }
  return null;
};
/** What a cardinal is in the grammar of a number run: unit (0-9), teen (10-19), tens (20, 30 ... 90), tensunit (21-99), hundred, scale (thousand, million, billion). */
const classOf = (v) => (v < 10 ? 'unit' : v < 20 ? 'teen' : v < 100 ? (v % 10 ? 'tensunit' : 'tens') : v === 100 ? 'hundred' : 'scale');

/** True when the lowercase word is a number word (or a hyphenated combination like twenty-one). */
export function isNumberWord(w) {
  return cardinal(w) !== null;
}

/**
 * Parse the longest number-word run starting at words[i] (lowercase words).
 * Returns { value, length } or null. `and` is allowed after hundred/thousand.
 */
export function parseNumberRun(words, i) {
  let j = i, used = 0;
  let last = 'start'; // start | unit | teen | tens | tensunit | hundred | scale
  const accept = (len) => { used = len; };
  for (; j < words.length; j++) {
    budget.tick('numbers.accept');
    const w = words[j];
    if (w === 'and' && (last === 'hundred' || last === 'scale') && j + 1 < words.length) {
      const v = cardinal(words[j + 1]);
      if (v !== null && v !== 100 && v < 1000) continue; // consume 'and' only if a number follows
    }
    const v = cardinal(w);
    if (v === null) break;
    const cls = classOf(v), fresh = last === 'start' || last === 'hundred' || last === 'scale';
    let next = null;
    if (cls === 'unit') { if (last === 'tens' && v > 0) next = 'tensunit'; else if (fresh) next = 'unit'; }
    else if (cls === 'teen' || cls === 'tens' || cls === 'tensunit') { if (fresh) next = cls; }
    else if (cls === 'hundred') { if (last !== 'hundred' && last !== 'scale') next = 'hundred'; }
    else if (last !== 'scale') next = 'scale';
    if (!next) break;
    last = next;
    accept(j - i + 1);
  }
  if (used === 0) return null;
  // recompute value over the accepted words only
  return { value: valueOf(words.slice(i, i + used)), length: used };
}

function valueOf(ws) {
  let total = 0, cur = 0;
  for (const w of ws) {
    if (w === 'and') continue;
    const v = cardinal(w), cls = classOf(v);
    if (cls === 'hundred') cur = (cur || 1) * 100;
    else if (cls === 'scale') { total += (cur || 1) * v; cur = 0; }
    else cur += v;
  }
  return total + cur;
}

/** Value of an ordinal word (`third` -> 3, `twenty-first` -> 21) of the catalog, or null. */
export function ordinalWordValue(w) {
  return numberInfo(w, 'ordinal')?.value ?? null;
}

/** Word form of an ordinal number (2 -> `second`; above 20 the digit form `21st`). */
export const ordinalWord = (n) => (n >= 1 && n <= 20 ? numberWordOf(n, 'ordinal') : null);

/** Digit value of a single number word (`five` -> 5) when it is a unit (used after `point`), else null. */
export const digitWordValue = (w) => { const v = cardinal(w); return v !== null && v < 10 ? v : null; };
