/**
 * Conservative pre-parse expansion of elliptic and corrected sentences (spec 03 section 1c). Browser-safe, pure.
 *
 * The functions here only propose token lists; `formalize` accepts a proposal only when every expanded clause is fully
 * understood by one world and the unexpanded sentence was not understood (or was understood with swallowed text).
 * Every proposal keeps provenance: expanded tokens are the original tokens (original offsets), plus a record of which
 * tokens were copied from elsewhere in the sentence and which were dropped.
 */

import { splitSentences, tokenize } from './normalize.mjs?v=dc30576b7d';
import { budget } from '../../dialog/budget.mjs?v=00bce6e369';
import { en } from '../../lang/en.mjs?v=08dd6017a3';

const isWord = (t) => t.kind === 'word' || t.kind === 'number';

/** Correction markers: [words, needsLeadingComma]. Multi-word markers are unambiguous; single words need a comma before. From the facts of handover/lang.en (clauses shard), in order. */
const MARKERS = en.corrections();

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

const isNum = (t) => t.kind === 'number';

/**
 * Which words of the abandoned clause `A` the correction `B` replaces (indexes `[from, to)` into `A`), and the scope.
 * Context-free alignment, in this order: the correction restarts the command (same first word, or at least as long as the clause)
 * -> whole; a number replaces the last number of the clause ("what 3 pencils cost, no, 4 pencils"); the correction ends with a word
 * that is in the clause -> up to it; the correction starts with a word that is in the clause -> from it; else the last words.
 * `ambiguous` marks a short clause ("top left, no, center" / "move left, no, right") where only a world can tell a whole answer from
 * a replaced value; the caller may then try `whole`.
 */
function align(A, B, whole) {
  const n = A.length, m = B.length;
  const lo = (x) => x.lower;
  if (n === 1 || whole || (lo(B[0]) === lo(A[0]) && lo(A[0]).length > 1) || m >= n) return { from: 0, to: n, scope: n <= 2 ? 'modal-answer' : 'command' };
  const np = A.map(isNum).lastIndexOf(true);
  if (np >= 0 && isNum(B[0])) return { from: np, to: Math.min(n, np + m), scope: m > 1 ? 'object' : 'value' };
  const last = A.map(lo).lastIndexOf(lo(B[m - 1]));
  if (last >= m - 1) return { from: last - m + 1, to: last + 1, scope: m > 1 ? 'object' : 'value' };
  const first = A.map(lo).lastIndexOf(lo(B[0]));
  if (first > 0) return { from: first, to: n, scope: 'object' };
  const k = Math.min(m, n - 1);
  return { from: n - k, to: n, scope: k > 1 ? 'object' : 'value', ambiguous: n <= 2 };
}

/** A bare answer to a yes/no question: a list of them ("yes, no, I don't know, maybe") is a sequence of answers, never "no" correcting "yes". */
const BARE_ANSWER = en.answerRegex();
const isBareAnswer = (toks) => BARE_ANSWER.test(toks.map((t) => t.lower.replace(/'/g, '')).join(' '));

const ANSWER_WORDS = en.answerWords();

/**
 * A message made only of bare answers without separators ("yes no maybe idk") is a sequence of answers: the commas are put in.
 * Anything else, and a single answer, is returned unchanged.
 */
export function splitAnswerList(text) {
  const words = String(text).toLowerCase().replace(/'/g, '').replace(/[.!?]+$/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.some((w) => /[,;]/.test(w))) return text;
  const out = [];
  for (let i = 0; i < words.length;) {
    budget.tick('expand.splitAnswerList');
    const hit = ANSWER_WORDS.find((a) => { const n = a.split(' '); return n.every((x, k) => words[i + k] === x); });
    if (!hit) return text;
    out.push(hit); i += hit.split(' ').length;
  }
  return out.length > 1 ? out.join(', ') : text;
}

const LEAD_ONLY = en.leadOnly();

/**
 * Self-correction: "blue, no, green" / "red, I mean blue" / "draw a cat, no wait, a dog" / "knight to f3, no, knight to c3": the
 * words after the marker replace the part of the abandoned clause they correct (see `align`); everything else is kept.
 * This is the single implementation: the message-level phase (`correctMessage`) and the rule formalizer's own expansion both use it.
 * @param {{ whole?: boolean }} [opts] `whole`: the correction replaces the whole abandoned clause
 * @returns {{ tokens, dropped: number[][], region: number[], scope: string, ambiguous: boolean } | null}
 */
export function selfCorrect(tokens, { whole = false } = {}) {
  let toks = tokens;
  const dropped = [];
  let region = null, scope = null, ambiguous = false;
  for (let guard = 0; guard < 3; guard++) {
    let found = null;
    for (let i = 1; i < toks.length && !found; i++) {
      const len = markerAt(toks, i);
      if (len) found = { i, len };
    }
    if (!found) break;
    const before = toks.slice(0, found.i);
    while (before.length && before[before.length - 1].lower === ',') { budget.tick('expand.selfCorrect'); before.pop(); }
    let after = toks.slice(found.i + found.len);
    if (found.len === 1 && ['and', 'then'].includes(after[0]?.lower) && isBareAnswer(before.filter(isWord).slice(-1))) return null;   // "yes, no and what is 2 plus 2": "no" is an answer joined by "and"
    while (after.length && (after[0].lower === ',' || after[0].lower === 'and')) { budget.tick('expand.selfCorrect2'); after = after.slice(1); }
    // the correction runs up to the next separator
    const cut = after.findIndex((t) => t.lower === ',' || t.lower === 'then');
    const corr = cut < 0 ? after : after.slice(0, cut);
    const rest = cut < 0 ? [] : after.slice(cut);
    if (!before.length || !corr.length) return null;
    // the abandoned clause is the last one before the marker
    let sepAt = -1;
    before.forEach((t, k) => { if (t.lower === ',' || t.lower === 'then') sepAt = k; });
    const head = before.slice(0, sepAt + 1), clause = before.slice(sepAt + 1);
    const A = clause.filter(isWord);
    if (!A.length) return null;
    // "No, I meant the tree": a bare "no" before the marker answers the previous turn (discourse, spec 11), it is no abandoned clause
    if (A.length === 1 && (A[0].lower === 'no' || A[0].lower === 'not')) return null;
    // "wait, I meant yes": an abandoned clause made only of lead words ("wait", "sorry", "oops", "actually", "hmm") is a correction of the
    // previous turn (discourse repair, a game's answer correction), not of a clause of this message
    if (A.every((t) => LEAD_ONLY.has(t.lower))) return null;
    const B = corr.filter(isWord);
    if (!B.length) return null;
    if (found.len === 1 && isBareAnswer(A) && isBareAnswer(B)) return null;   // only the single word marker ("yes, no, maybe"); "no wait" and "I mean" always correct
    const al = align(A, B, whole);
    const gone = A.slice(al.from, al.to);
    const a0 = clause.indexOf(A[al.from]), a1 = clause.indexOf(A[al.to - 1]) + 1;
    dropped.push(span([...gone, ...toks.slice(found.i, found.i + found.len)]));
    const reg = [span(before)[0], span(corr)[1]];
    region = region ? [Math.min(region[0], reg[0]), Math.max(region[1], reg[1])] : reg;
    scope ??= al.scope;
    ambiguous ||= !!al.ambiguous;
    toks = [...head, ...clause.slice(0, a0), ...corr, ...clause.slice(a1), ...rest];
  }
  return region ? { tokens: toks, dropped, region, scope, ambiguous } : null;
}

/**
 * The message-level correction phase (spec 03 section 1c): runs on the whole English message, per sentence, before segmentation,
 * routing, discourse and the modal interceptors, so the abandoned variant never reaches any of them. Pure; `probe` is an optional
 * async `(text) => string | null` (the pattern ids that read the text), used only for the ambiguous short case.
 * @returns {Promise<{ text: string, corrections: { scope, from, to, source: number[] }[] }>}
 */
export async function correctMessage(text, { probe = null } = {}) {
  if (!/\b(no|sorry|actually|wait|rather|mean|meant|oops|scratch|make that)\b/i.test(text)) return { text, corrections: [] };
  let out = '', pos = 0;
  const corrections = [];
  for (const s of splitSentences(text)) {
    const tokens = tokenize(s.text, s.start, { keepFillers: true });
    let sc = selfCorrect(tokens);
    if (!sc) continue;
    // contiguous runs of kept tokens are copied verbatim from the text, the rest is joined with spaces
    const idx = new Map(tokens.map((t, i) => [t, i]));
    const render = (r) => {
      const runs = [];
      let prev = -2;
      for (const t of r.tokens) {
        const i = idx.get(t) ?? -1;
        if (i >= 0 && i === prev + 1) runs[runs.length - 1][1] = t.end; else runs.push([t.start, t.end]);
        prev = i;
      }
      return runs.map(([a, b]) => text.slice(a, b)).join(' ').replace(/ ,/g, ',');
    };
    let fixed = render(sc);
    if (sc.ambiguous && probe) {
      // the whole correction replaces the clause when it is read like the abandoned clause was ("top left, no, center": both are a place);
      // otherwise the patched clause when it is read ("move left, no, right"), else the whole correction when only that is read
      const alt = selfCorrect(tokens, { whole: true });
      const altText = alt && render(alt);
      const at = tokens.findIndex((t, i) => i > 0 && markerAt(tokens, i));
      const pre = tokens.slice(0, at).filter((t) => t.kind !== 'punct');
      const abandoned = text.slice(pre[0].start, pre[pre.length - 1].end);
      if (altText) {
        const [pA, pP, pW] = [await probe(abandoned), await probe(fixed), await probe(altText)];
        if (pW && (pW === pA || !pP)) { sc = alt; fixed = altText; }
      }
    }
    out += text.slice(pos, s.start) + fixed;
    pos = s.end;
    corrections.push({ scope: sc.scope, from: text.slice(sc.region[0], sc.region[1]), to: fixed, source: sc.region });
  }
  return corrections.length ? { text: out + text.slice(pos), corrections } : { text, corrections };
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

// Shared argument, verb ellipsis and one-anaphora are English grammar: they live in src/lang/en.mjs (facts of handover/lang.en), `en.sharedArgument`, `en.ellipsisPrefixes`, `en.oneAnaphora`.
