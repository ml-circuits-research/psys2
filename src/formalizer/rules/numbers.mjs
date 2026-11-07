/** Number words to digits (spec 03 section 1.4). Browser-safe. */

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** True when the lowercase word is a number word (or a hyphenated combination like twenty-one). */
export function isNumberWord(w) {
  if (w in UNITS || w in TEENS || w in TENS || w === 'hundred' || w === 'thousand') return true;
  const parts = w.split('-');
  return parts.length === 2 && parts[0] in TENS && parts[1] in UNITS && UNITS[parts[1]] > 0;
}

/**
 * Parse the longest number-word run starting at words[i] (lowercase words).
 * Returns { value, length } or null. `and` is allowed after hundred/thousand.
 */
export function parseNumberRun(words, i) {
  let j = i, used = 0;
  let last = 'start'; // start | unit | teen | tens | tensunit | hundred | thousand
  const accept = (len) => { used = len; };
  for (; j < words.length; j++) {
    const w = words[j];
    let next = null;
    if (w === 'and' && (last === 'hundred' || last === 'thousand') && j + 1 < words.length && isNumberWord(words[j + 1]) && words[j + 1] !== 'hundred' && words[j + 1] !== 'thousand') {
      continue; // consume 'and' only if a number follows
    }
    if (w in UNITS && UNITS[w] >= 0) {
      if (last === 'tens' && UNITS[w] > 0) next = 'tensunit';
      else if (last === 'start' || last === 'hundred' || last === 'thousand') next = 'unit';
      if (!next) break;
    } else if (w in TEENS) {
      if (last === 'start' || last === 'hundred' || last === 'thousand') { next = 'teen'; } else break;
    } else if (w in TENS) {
      if (last === 'start' || last === 'hundred' || last === 'thousand') { next = 'tens'; } else break;
    } else if (w.includes('-') && isNumberWord(w)) {
      if (last === 'start' || last === 'hundred' || last === 'thousand') { next = 'tensunit'; } else break;
    } else if (w === 'hundred') {
      if (last === 'unit' || last === 'teen' || last === 'tens' || last === 'tensunit') { next = 'hundred'; }
      else if (last === 'start') { next = 'hundred'; } else break;
    } else if (w === 'thousand') {
      if (last !== 'thousand') next = 'thousand'; else break;
    } else break;
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
    if (w in UNITS) cur += UNITS[w];
    else if (w in TEENS) cur += TEENS[w];
    else if (w in TENS) cur += TENS[w];
    else if (w.includes('-')) { const [a, b] = w.split('-'); cur += TENS[a] + UNITS[b]; }
    else if (w === 'hundred') cur = (cur || 1) * 100;
    else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
  }
  return total + cur;
}
