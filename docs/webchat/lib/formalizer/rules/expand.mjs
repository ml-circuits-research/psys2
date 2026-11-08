/**
 * Conservative pre-parse expansion of elliptic and corrected sentences (spec 03 section 1c). Browser-safe, pure.
 *
 * The functions here only propose token lists; `formalize` accepts a proposal only when every expanded clause is fully
 * understood by one world and the unexpanded sentence was not understood (or was understood with swallowed text).
 * Every proposal keeps provenance: expanded tokens are the original tokens (original offsets), plus a record of which
 * tokens were copied from elsewhere in the sentence and which were dropped.
 */

const DETERMINERS = new Set(['a', 'an', 'the', 'your', 'my', 'his', 'her', 'its', 'their', 'our', 'this', 'that', 'these', 'those', 'some', 'ur']);
const isWord = (t) => t.kind === 'word' || t.kind === 'number';
const isSep = (t) => t.lower === ',' || t.lower === 'and';

/** Correction markers: [words, needsLeadingComma]. Multi-word markers are unambiguous; single words need a comma before. */
const MARKERS = [
  [['no', 'wait'], false], [['i', 'mean'], false], [['i', 'meant'], false], [['no', 'sorry'], false], [['scratch', 'that'], false],
  [['make', 'that'], true], [['or', 'rather'], false], [['no'], true], [['sorry'], true], [['actually'], true], [['wait'], true], [['rather'], true], [['oops'], true],
];

/** Swallowed free text that holds a correction marker, "then" or a repetition: always a sign of a catch-all reading. */
export const MARKER_RE = /(^|[\s,])(then|no|sorry|actually|wait|rather|mean|meant|oops)([\s,]|$)|(^|\s)(twice|(\d+|two|three|four|five|six|seven|eight|nine|ten) times?)$/i;
/** Swallowed free text that holds a coordination; a sign of a catch-all only when a required lexicon slot follows the free slot. */
export const SEP_RE = /(^|[\s,])(and|but)([\s,]|$)|,/i;

const span = (toks) => [Math.min(...toks.map((t) => t.start)), Math.max(...toks.map((t) => t.end))];
export const joinText = (toks) => toks.filter(isWord).map((t) => t.raw).join(' ');

function markerAt(tokens, i) {
  for (const [words, comma] of MARKERS) {
    if (!words.every((w, k) => tokens[i + k]?.lower === w)) continue;
    if (comma && tokens[i - 1]?.lower !== ',') continue;
    return words.length;
  }
  return 0;
}

/**
 * Self-correction: "blue, no, green" / "red, I mean blue" / "draw a cat, no wait, a dog": the words after the marker replace
 * the same number of words before it (the corrected value); everything else is kept.
 * @returns {{ tokens, dropped: number[][], region: number[] } | null}
 */
export function selfCorrect(tokens) {
  let toks = tokens;
  const dropped = [];
  let region = null;
  for (let guard = 0; guard < 3; guard++) {
    let found = null;
    for (let i = 1; i < toks.length && !found; i++) {
      const len = markerAt(toks, i);
      if (len) found = { i, len };
    }
    if (!found) break;
    const before = toks.slice(0, found.i);
    while (before.length && before[before.length - 1].lower === ',') before.pop();
    let after = toks.slice(found.i + found.len);
    while (after.length && (after[0].lower === ',' || after[0].lower === 'and')) after = after.slice(1);
    // the correction runs up to the next separator
    const cut = after.findIndex((t) => t.lower === ',' || t.lower === 'then');
    const corr = cut < 0 ? after : after.slice(0, cut);
    const rest = cut < 0 ? [] : after.slice(cut);
    if (!before.length || !corr.length) return null;
    const k = Math.min(corr.length, before.filter(isWord).length - 1);
    if (k < 1) return null;
    const kept = before.slice(0, before.length - k);
    const gone = before.slice(before.length - k);
    if (gone.some((t) => t.lower === ',')) return null;
    dropped.push(span([...gone, ...toks.slice(found.i, found.i + found.len)]));
    const reg = [span(before)[0], span(corr)[1]];
    region = region ? [Math.min(region[0], reg[0]), Math.max(region[1], reg[1])] : reg;
    toks = [...kept, ...corr, ...rest];
  }
  return region ? { tokens: toks, dropped, region } : null;
}

/**
 * Shared argument: "make your eyes and body blue", "the tree and the house blue", "eyes, body and mouth blue".
 * Proposes, in order of preference, `prefix head_i suffix` for each coordinated head; the suffix is the shared trailing argument
 * (1 or 2 words), the prefix is the shared leading verb phrase.
 * @returns {Generator<{ clauses: Array<{ tokens, own: number[], copied: number[][] }> }>}
 */
export function* sharedArgument(tokens) {
  if (tokens.some((t) => t.lower === 'then' || t.lower === 'but')) return;
  const parts = [[]];
  for (const t of tokens) { if (isSep(t)) parts.push([]); else parts[parts.length - 1].push(t); }
  const P = parts.map((p) => p.filter(isWord));
  if (P.length < 2 || P.length > 5 || P.some((p) => !p.length)) return;
  const last = P[P.length - 1];
  for (let s = 1; s <= 2; s++) {
    if (last.length - s < 1 || last.length - s > 3) continue;
    const suffix = last.slice(last.length - s);
    for (let h0 = 1; h0 <= Math.min(3, P[0].length); h0++) {
      const prefix = P[0].slice(0, P[0].length - h0);
      const heads = [P[0].slice(P[0].length - h0), ...P.slice(1, -1), last.slice(0, last.length - s)];
      if (heads.some((h) => !h.length || h.length > 3)) continue;
      const pl = prefix[prefix.length - 1]?.lower;
      if (pl && DETERMINERS.has(pl) && heads.some((h, i) => i > 0 && DETERMINERS.has(h[0].lower))) continue;
      yield {
        clauses: heads.map((h) => ({
          tokens: [...prefix, ...h, ...suffix], own: span(h),
          copied: [...(prefix.length ? [span(prefix)] : []), span(suffix)],
        })),
      };
    }
  }
}

/** Repetition: a clause ending in "twice" / "N times" -> { tokens: the clause without it, n, dropped }. */
export function repetition(tokens) {
  const w = tokens.filter(isWord);
  const n = w.length;
  if (n < 2) return null;
  let cnt = 0, drop = 0;
  if (w[n - 1].lower === 'twice') { cnt = 2; drop = 1; }
  else if ((w[n - 1].lower === 'times' || w[n - 1].lower === 'time') && n >= 3 && w[n - 2].kind === 'number' && /^\d+$/.test(w[n - 2].lower)) { cnt = Number(w[n - 2].lower); drop = 2; }
  if (cnt < 2 || cnt > 10) return null;
  return { tokens: w.slice(0, n - drop), n: cnt, dropped: span(w.slice(n - drop)) };
}

/** Verb ellipsis: prefixes (1 then 2 words) of the anchor clause to put before an elliptic clause. */
export function* ellipsisPrefixes(anchorTokens) {
  const w = anchorTokens.filter(isWord);
  for (let len = 1; len <= 2 && len < w.length; len++) {
    const pre = w.slice(0, len);
    if (pre.some((t) => t.kind === 'number')) return;
    if (len === 2 && DETERMINERS.has(pre[1].lower)) return;
    yield pre;
  }
}
