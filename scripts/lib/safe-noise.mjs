/**
 * JavaScript port of training/psys2_train/safe_noise.py (review F3): noise that must never change values.
 * - punctuation is removed only at token boundaries ("." "," ";" "?" "!" followed by a space or the end), never inside a token: decimals (45.5, 1,5),
 *   times (7:30), signs (-3), note names with accidentals (C#, Bb) and URLs survive;
 * - quoted spans ("...", '...', curly quotes) are payload: copied unchanged, case and punctuation included.
 * Shared fixtures: training/tests/fixtures/safe_noise.json (used by the Python and the JavaScript test).
 */
const QUOTED = /"[^"]*"|“[^”]*”|'[^']+'(?=\W|$)/g;
const BOUNDARY_PUNCT = /[.,;?!]+(?=\s|$)/g;

/** Apply `fn` to the free text around quoted spans; quoted spans are kept. Returns { text, protected: [[start, end]] } (spans in the ORIGINAL string). */
export function mapFree(s, fn) {
  const out = [], prot = [];
  let last = 0;
  for (const m of s.matchAll(QUOTED)) {
    out.push(fn(s.slice(last, m.index)), m[0]);
    prot.push([m.index, m.index + m[0].length]);
    last = m.index + m[0].length;
  }
  out.push(fn(s.slice(last)));
  return { text: out.join(''), protected: prot };
}

/** Python `plain_spans`: lower case and no boundary punctuation outside quoted payloads. */
export function plainSpans(s) {
  const out = [], prot = [];
  let last = 0;
  const free = (x) => x.toLowerCase().replace(BOUNDARY_PUNCT, ' ');
  for (const m of s.matchAll(QUOTED)) { out.push(free(s.slice(last, m.index)), m[0]); prot.push([m.index, m.index + m[0].length]); last = m.index + m[0].length; }
  out.push(free(s.slice(last)));
  return { text: out.filter((p) => p).join(' ').replace(/\s+/g, ' ').trim(), protected: prot };
}
export const plain = (s) => plainSpans(s).text;

/** Drop boundary punctuation only (keeps the case): the safe form of `t.replace(/[.!?,]/g, '')`. */
export const dropPunctuation = (s) => mapFree(s, (x) => x.replace(BOUNDARY_PUNCT, ' ')).text.replace(/\s+/g, ' ').trim();
