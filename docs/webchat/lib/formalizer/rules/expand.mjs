/**
 * Conservative pre-parse expansion of elliptic and corrected sentences (spec 03 section 1c). Browser-safe, pure.
 *
 * The functions here only propose token lists; `formalize` accepts a proposal only when every expanded clause is fully
 * understood by one world and the unexpanded sentence was not understood (or was understood with swallowed text).
 * Every proposal keeps provenance: expanded tokens are the original tokens (original offsets), plus a record of which
 * tokens were copied from elsewhere in the sentence and which were dropped.
 */

import { splitSentences, tokenize } from './normalize.mjs?v=8a99155025';
import { budget } from '../../dialog/budget.mjs?v=9f5360afbc';

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
const BARE_ANSWER = /^(yes|yeah|yep|yup|yea|no|nope|nah|maybe|perhaps|probably|sometimes|idk|i dont know|i do not know|dont know|do not know|not sure|unsure|i am not sure|im not sure|i guess|sort of|kind of|kinda)$/;
const isBareAnswer = (toks) => BARE_ANSWER.test(toks.map((t) => t.lower.replace(/'/g, '')).join(' '));

const ANSWER_WORDS = ['i dont know', 'i do not know', 'dont know', 'do not know', 'i am not sure', 'im not sure', 'not sure', 'sort of', 'kind of', 'i guess',
  'yes', 'yeah', 'yep', 'yup', 'yea', 'no', 'nope', 'nah', 'maybe', 'perhaps', 'probably', 'sometimes', 'idk', 'unsure', 'kinda'];

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

const LEAD_ONLY = new Set(['no', 'not', 'wait', 'sorry', 'oops', 'actually', 'hmm', 'hm', 'um', 'uh', 'er', 'oh', 'ah', 'hold', 'on', 'well', 'ok', 'okay', 'my', 'bad', 'mistake', 'a', 'second', 'sec', 'whoops', 'ugh']);

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

/**
 * One-anaphora (spec 03 section 1c): an elliptic noun phrase after a command, "and a yellow one" / "and another yellow one" /
 * "and one yellow" / "and two big ones", repeats the previous command with its noun and the new modifiers.
 * `ct` is the elliptic clause, `anchor` the earlier clause it continues. Returns `null` when `ct` is not such a phrase, else
 * `{ mods, candidates }`: candidate token lists for the new clause (verb and determiner of the anchor, the new modifiers, then
 * the anchor's noun; anchor modifiers of another class than a new one are kept: "a big green house and a yellow one" -> big yellow).
 * Phrasing comes from the caller (phrase groups `lang.elide.*` of lang.common): `leads` (a, an, another, one), `nouns` (one, ones),
 * `sameClass(a, b)` (two words of one lexicon), `isModifier(w)` (a word of some lexicon), `singular(w)`.
 */
export function oneAnaphora(ct, anchor, { leads, nouns, sameClass = () => false, isModifier = () => false, singular = (w) => w }) {
  const w = ct.filter(isWord).map((t) => (t.kind === 'number' && t.alt === 'one' ? { ...t, kind: 'word', lower: 'one' } : t));   // the tokenizer reads "one" as the number 1
  const wa = anchor.filter(isWord);
  if (w.length < 2 || w.length > 5 || wa.length < 2) return null;
  const count = (t) => t.kind === 'number' || /^(two|three|four|five|six|seven|eight|nine|ten)$/.test(t.lower);
  let lead = null, mods, plural = false, bare = false;
  const last = w[w.length - 1].lower;
  if (nouns.has(last)) {   // [lead]? mods* one|ones
    plural = /s$/.test(last);
    const first = w[0];
    const hasLead = leads.has(first.lower) || (count(first) && plural);
    if (hasLead) lead = first;
    mods = w.slice(hasLead ? 1 : 0, -1);
    if (!hasLead && !mods.length) return null;
  } else if (w[0].lower === 'one' && w.length <= 3 && w.slice(1).every((t) => isModifier(t.lower))) {   // one mods+
    lead = w[0]; mods = w.slice(1); bare = true;
  } else return null;
  if (mods.length > 3 || mods.some((t) => count(t) || nouns.has(t.lower) || DETERMINERS.has(t.lower))) return null;
  // the anchor: verb words, then the noun phrase (determiner or number, modifiers, noun tail of 1 or 2 words)
  const out = [];
  const newDet = () => {
    if (lead && count(lead)) return [lead];
    const nxt = (mods[0] ?? wa[wa.length - 1]).lower;
    const base = lead && /^an?$/.test(lead.lower) ? lead.lower : (/^[aeiou]/.test(nxt) ? 'an' : 'a');
    return [{ kind: 'word', raw: base, lower: base, start: ct[0].start, end: ct[0].start, synth: true }];
  };
  for (let t = 1; t <= 2; t++) {
    if (wa.length - t < 1) break;
    const tail = wa.slice(wa.length - t);
    const body = wa.slice(0, wa.length - t);
    // noun phrase start: the last determiner or number of the body, else right after its first word (the verb)
    let s = -1;
    for (let i = body.length - 1; i >= 1; i--) if (DETERMINERS.has(body[i].lower) || count(body[i])) { s = i; break; }
    const hasDet = s >= 0;
    if (!hasDet) s = 1;
    const det = hasDet ? body[s] : null;
    const kept = body.slice(hasDet ? s + 1 : s).filter((m) => !mods.some((n) => sameClass(m.lower, n.lower)));
    const variants = kept.length ? [kept, []] : [[]];
    for (const k of variants) {
      let nounTail = tail;
      const singNP = !plural && (!lead || !count(lead));
      if (singNP && tail.length) {
        const lw = tail[tail.length - 1];
        const sg = singular(lw.lower);
        if (sg !== lw.lower) nounTail = [...tail.slice(0, -1), { ...lw, raw: sg, lower: sg, textOverride: sg }];
      }
      const dets = hasDet ? (DETERMINERS.has(det.lower) && !/^(a|an|the)$/.test(det.lower) ? [det] : newDet()) : (lead && count(lead) ? [lead] : []);
      out.push([...body.slice(0, s), ...dets, ...k, ...mods, ...nounTail]);
    }
  }
  return { mods, lead, bare, candidates: out };
}
