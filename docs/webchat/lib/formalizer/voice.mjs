// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Spoken-input repair (spec 03 section 1d, RP3). Browser-safe, no dependencies. Two cheap, bounded, text-only passes:
 *
 *   cleanVoice(text, { voice })   stutter and send words:
 *     - an immediately repeated function word ("the the next mouth") is one word, in every mode;
 *     - in voice mode an immediately repeated phrase of 2 to 6 words ("make it red make it red") is one phrase, and a trailing send word
 *       ("send", "trimite", "over", "gata") is dropped: it was the user's spoken "press send", not part of the request;
 *   garbleCandidates(text, { vocab })   split/merge-word and sound-alike repair of a spoken word against the active world's vocabulary
 *     ("mcdavatara human" -> "make avatar a human"): the caller parses each candidate with the active world only.
 *
 * Every pass is capped (words, candidates, a time budget) and calls the turn guard, so no spoken message can hang the turn.
 */
import { editDistance } from './rules/index.mjs?v=041c4b5635';
import { guard } from './guard.mjs?v=eb1a66f556';
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
/** Words that may legitimately be said twice in a row: never collapsed. */
const REPEATABLE = new Set(['very', 'no', 'ha', 'bye', 'so', 'yes', 'da', 'nu', 'hai', 'much', 'many', 'more', 'long', 'little', 'well', 'ho', 'pa', 'bla', 'tic', 'tac', 'again']);
const FUNCTION_REPEAT = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'in', 'on', 'at', 'is', 'it', 'my', 'your', 'with', 'for', 'i', 'you', 'this', 'that', 'what', 'how', 'make', 'add',
  'un', 'o', 'si', 'și', 'de', 'la', 'cu', 'pe', 'in', 'în', 'pentru', 'fă', 'fa', 'adaugă', 'adauga']);
const MAX_WORDS = 60;

/** Send words said at the end of a spoken message. A comma or full stop before the word is a stronger sign than its position. */
const SEND_AFTER_PUNCT = /[,.;!?]\s*(?:send(?:\s+(?:it|that|message|now))?|over|trimite(?:\s+(?:mesajul|acum))?|gata)\s*[.!?]*\s*$/i;
const SEND_PLAIN = /\s+(?:send(?:\s+(?:it|that|message|now))?|trimite(?:\s+(?:mesajul|acum))?)\s*[.!?]*\s*$/i;
/** Words that make a trailing "send" part of the request ("do not send", "to send"). */
const SEND_KEEP_BEFORE = new Set(['to', 'not', 'dont', "don't", 'will', 'can', 'and', 'or', 'please', 'then', 'nu', 'să', 'sa', 'de']);

/**
 * @returns {{ text: string, corrections: { kind: 'stutter'|'send', from: string, to: string }[] }}
 */
export function cleanVoice(text, { voice = false } = {}) {
  if (typeof text !== 'string' || !text) return { text, corrections: [] };
  const corrections = [];
  let out = text;
  if (voice) {   // trailing send word
    const m = SEND_AFTER_PUNCT.exec(out) ?? SEND_PLAIN.exec(out);
    if (m) {
      const rest = out.slice(0, m.index).trimEnd();
      const last = rest.match(/[\p{L}']+$/u)?.[0]?.toLowerCase();
      const words = rest.match(WORD)?.length ?? 0;
      if (words >= 2 && (SEND_AFTER_PUNCT.test(out) || !SEND_KEEP_BEFORE.has(last))) { corrections.push({ kind: 'send', from: m[0].trim(), to: '' }); out = rest; }
    }
  }
  const toks = [...out.matchAll(WORD)];
  if (toks.length < 2 || toks.length > MAX_WORDS) return corrections.length ? { text: out, corrections } : { text, corrections };
  guard.check('voice');
  const low = toks.map((t) => t[0].toLowerCase());
  // a repetition is words next to each other: a comma, colon or full stop between them ("heading A, a heading B") means two things were said
  const tight = (i, j) => { for (let k = i; k < j; k++) if (!/^[ \t]+$/.test(out.slice(toks[k].index + toks[k][0].length, toks[k + 1].index))) return false; return true; };
  const drop = [];   // [fromTokenIndex, toTokenIndexExclusive] ranges to remove
  for (let i = 0; i < toks.length;) {
    budget.tick('voice.tight');
    let hit = 0;
    if (voice) for (let k = Math.min(6, Math.floor((toks.length - i) / 2)); k >= 2; k--) {   // the longest repeated phrase first
      let same = true;
      for (let j = 0; j < k && same; j++) same = low[i + j] === low[i + k + j];
      if (same && tight(i, i + 2 * k - 1) && !low.slice(i, i + k).every((w) => /^\d+$/.test(w))) { hit = k; break; }
    }
    if (hit) { drop.push([i + hit, i + 2 * hit]); i += 2 * hit; continue; }
    if (low[i] === low[i + 1] && tight(i, i + 1) && !REPEATABLE.has(low[i]) && (FUNCTION_REPEAT.has(low[i]) || voice) && !/^\d+$/.test(low[i])) { drop.push([i + 1, i + 2]); i += 2; continue; }
    i++;
  }
  if (!drop.length) return corrections.length ? { text: out, corrections } : { text, corrections };
  let res = '', last = 0;
  for (const [a, b] of drop) {
    const start = toks[a].index, end = toks[b - 1].index + toks[b - 1][0].length;
    corrections.push({ kind: 'stutter', from: out.slice(start, end), to: '' });
    res += out.slice(last, start).replace(/\s+$/, ' ');
    last = end;
  }
  res += out.slice(last).replace(/^\s+/, res.endsWith(' ') ? '' : ' ');
  return { text: res.replace(/\s+/g, ' ').trim(), corrections };
}

// ---- garble repair --------------------------------------------------------------------------------------------------
/** Consonant skeleton of a word for sound-alike matching: k/c/q -> k, ph -> f, vowels and doubled letters dropped. */
export function skeleton(w) {
  const s = w.toLowerCase().replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[cq]/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/y/g, 'i');
  let out = '';
  for (const ch of s) { if (!/[aeiouh]/.test(ch) && out.at(-1) !== ch) out += ch; }
  return out;
}

// Bounds are counts of work, never wall-clock time: a time budget made the result depend on the machine's load (a slow run cut the search short and the test of
// "mcdavatara human" failed under load). STEP_BUDGET counts the piece lookups of one call, MAX_WEAK_WORDS the words of weakSoundAlikes.
export const STEP_BUDGET = 3000, MAX_WEAK_WORDS = 8;
const MAX_UNKNOWN = 3, MAX_TOKEN = 24, MAX_PIECES = 4, MAX_COST = 2;

/**
 * Candidate texts for a spoken message whose unknown words are garbled run-together or split words. `vocab` is the vocabulary of the ACTIVE world
 * (a Set of words; `vocab.global` optional: a word any world knows is never touched). Each candidate carries its cost (0 exact words, 1 per
 * sound-alike piece); the caller executes cost <= 1 and asks for more. Bounded by counts (deterministic): at most 3 unknown words of at most 24 letters, 4 pieces, STEP_BUDGET piece lookups.
 * @returns {{ text: string, cost: number, corrections: { from: string, to: string, span: [number, number], kind: 'voice' }[] }[]}
 */
export function garbleCandidates(text, { vocab, known = () => false, functionWords = new Set(), maxTexts = 4, stats = null } = {}) {
  let steps = 0;
  const toks = [...text.matchAll(WORD)];
  if (!toks.length || toks.length > MAX_WORDS) return [];
  const isKnown = (w) => functionWords.has(w) || vocab.has(w) || known(w) || /\d/.test(w);
  const words = [...vocab].filter((w) => /^[a-z]{2,}$/.test(w));
  for (const w of functionWords) if (/^[a-z]+$/.test(w) && !vocab.has(w)) words.push(w);
  const byLen = new Map();
  for (const w of words) (byLen.get(w.length) ?? byLen.set(w.length, []).get(w.length)).push(w);
  const skel = new Map();
  for (const w of words) { const k = skeleton(w); if (k.length >= 2) (skel.get(k) ?? skel.set(k, []).get(k)).push(w); }
  const freq = (w) => vocab.freq?.get(w) ?? 0;
  const out = [];
  const unknown = toks.filter((t) => /^[a-z]+$/i.test(t[0]) && t[0].length >= 3 && t[0].length <= MAX_TOKEN && !isKnown(t[0].toLowerCase())).slice(0, MAX_UNKNOWN);

  // one word -> pieces
  function split(word) {
    const n = word.length, memo = new Map();
    const pieceBest = (i, j) => {   // best vocabulary word for word[i..j): [cost, word]
      steps++;
      const seg = word.slice(i, j), len = seg.length;
      if (len === 1) return seg === 'a' || seg === 'i' ? [0, seg] : null;
      if (vocab.has(seg) || functionWords.has(seg)) return [0, seg];
      let best = null;
      if (len >= 3) {
        const sk = skeleton(seg);
        for (const w of skel.get(sk) ?? []) if (!best || freq(w) > freq(best[1])) best = [1, w];   // same consonants
        if (!best) for (let l = len - 1; l <= len + 1 && !best; l++) for (const w of byLen.get(l) ?? []) { if (w.length >= 4 && editDistance(seg, w, 1) <= 1) { if (!best || freq(w) > freq(best[1])) best = [1, w]; } }
        if (!best && len >= 3) {   // one consonant off ("mcd" for "make"): skeleton within edit distance 1, same first consonant
          for (const [k, ws] of skel) { if (k[0] === sk[0] && Math.abs(k.length - sk.length) <= 1 && editDistance(sk, k, 1) <= 1 && k.length >= 2) { for (const w of ws) if (!best || freq(w) > freq(best[1])) best = [1, w]; if (best) break; } }
        }
      }
      return best;
    };
    const rec = (i, pieces) => {   // min [cost, words[]] for word[i..]
      budget.tick('voice.rec');
      if (i === n) return [0, []];
      const key = `${i}:${pieces}`;
      if (memo.has(key)) return memo.get(key);
      let best = null;
      if (pieces < MAX_PIECES && steps < STEP_BUDGET) {
        for (let j = n; j > i; j--) {
          const p = pieceBest(i, j);
          if (!p) continue;
          const rest = rec(j, pieces + 1);
          if (!rest) continue;
          const cost = p[0] + rest[0];
          if (cost <= MAX_COST && (!best || cost < best[0] || (cost === best[0] && rest[1].length + 1 < best[1].length))) best = [cost, [p[1], ...rest[1]]];
        }
      }
      memo.set(key, best);
      return best;
    };
    const r = rec(0, 0);
    return r && r[1].length >= 1 && !(r[1].length === 1 && r[1][0] === word) ? r : null;
  }

  for (const t of unknown) {
    guard.check('voice');
    if (steps >= STEP_BUDGET * 2) break;
    const r = split(t[0].toLowerCase());
    if (!r) continue;
    const start = t.index, end = start + t[0].length;
    const rep = r[1].join(' ');
    out.push({ text: text.slice(0, start) + rep + text.slice(end), cost: r[0] + (r[1].length > 1 ? 0 : 0), corrections: [{ from: t[0], to: rep, span: [start, end], kind: 'voice' }] });
  }
  if (stats) stats.steps = steps; // the work done, for tests that check the bound by counts, not by the clock
  // two adjacent words run together by the recogniser's pause ("avat ar"): the join is a word of the vocabulary
  for (let i = 0; i + 1 < toks.length && out.length < maxTexts * 2; i++) {
    const a = toks[i][0].toLowerCase(), b = toks[i + 1][0].toLowerCase();
    if (isKnown(a) && isKnown(b)) continue;
    const joined = a + b;
    if (joined.length >= 5 && vocab.has(joined)) out.push({ text: text.slice(0, toks[i].index) + joined + text.slice(toks[i + 1].index + toks[i + 1][0].length), cost: 0, corrections: [{ from: `${toks[i][0]} ${toks[i + 1][0]}`, to: joined, span: [toks[i].index, toks[i + 1].index + toks[i + 1][0].length], kind: 'voice' }] });
  }
  // a spoken command word the recogniser heard as a common neighbour at the start ("on the new chapter" for "add the new chapter")
  const first = toks[0]?.[0].toLowerCase();
  if (first) for (const [verb, heard] of Object.entries(LEADING_CONFUSIONS)) {
    if (heard.includes(first) && vocab.has(verb) && !(first.length > 2 && vocab.has(first) && toks.length < 2)) out.push({ text: verb[0] === first[0] && toks[0][0][0] !== toks[0][0][0].toLowerCase() ? text : `${verb[0].toUpperCase()}${verb.slice(1)}${text.slice(toks[0][0].length)}`, cost: 1, corrections: [{ from: toks[0][0], to: verb, span: [toks[0].index, toks[0].index + toks[0][0].length], kind: 'voice' }] });
  }
  out.sort((x, y) => x.cost - y.cost);
  return out.slice(0, maxTexts);
}

/** Common mishearings of the verb that opens a spoken command. */
export const LEADING_CONFUSIONS = { add: ['on', 'are', 'and', 'at', 'ad', 'had', 'ed', 'ate', 'a'], make: ['may', 'mate', 'mic', 'mike'], play: ['pay', 'lay', 'clay'], open: ['oven', 'opened', 'opin'], show: ['so', 'sure'], draw: ['dro', 'drew'], start: ['star', 'stark'] };

/**
 * Weak sound-alikes (edit distance up to 2, same first letter, 6 or more letters) of the words of `text` that the ACTIVE world does not know, among the active
 * world's own words: "Chester" for "chapter". A weak match is only ever offered ("Did you mean ...?"), never executed.
 * @returns {{ from: string, to: string }[]}
 */
export function weakSoundAlikes(text, { vocab, functionWords = new Set(), protect = null } = {}) {
  let tried = 0;
  const out = [];
  const cands = [...vocab].filter((w) => /^[a-z]{6,}$/.test(w));
  for (const m of text.matchAll(WORD)) {
    const w = m[0].toLowerCase();
    if (!/^[a-z]{6,}$/.test(w) || vocab.has(w) || functionWords.has(w) || protect?.has(w)) continue;
    if (++tried > MAX_WEAK_WORDS) break;
    let best = null, bd = 3;
    for (const c of cands) {
      if (c[0] !== w[0] || Math.abs(c.length - w.length) > 2) continue;
      const d = editDistance(w, c, 2);
      if (d < bd || (d === bd && best && (vocab.freq?.get(c) ?? 0) > (vocab.freq?.get(best) ?? 0))) { best = c; bd = d; }
    }
    if (best && bd <= 2) out.push({ from: m[0], to: best });
  }
  return out.slice(0, 2);
}
