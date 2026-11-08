/**
 * Normalization, sentence segmentation and tokenization (spec 03 section 1). Browser-safe.
 * Token = { raw, lower, start, end, kind: 'word' | 'number' | 'punct' } with absolute offsets
 * into the original text. Original casing is kept in `raw`.
 */
import { isNumberWord, parseNumberRun } from './numbers.mjs';

export const QUESTION_WORDS = new Set(['how', 'what', 'who', 'where', 'when', 'which', 'why', 'is', 'are', 'does', 'do', 'can', 'did']);
const FILLERS = new Set(['please', 'ok', 'okay', 'well', 'um']);
const INITIAL_DROP = new Set(['so', 'and', 'then']);

const CONTRACTIONS = {
  "can't": ['can', 'not'], cannot: ['can', 'not'], "won't": ['will', 'not'], "i'm": ['I', 'am'], "let's": ['let', 'us'],
  "what's": ['what', 'is'], "who's": ['who', 'is'], "where's": ['where', 'is'], "how's": ['how', 'is'],
  "when's": ['when', 'is'], "why's": ['why', 'is'], "that's": ['that', 'is'], "it's": ['it', 'is'],
  "there's": ['there', 'is'], "here's": ['here', 'is'], "he's": ['he', 'is'], "she's": ['she', 'is'],
  "i've": ['I', 'have'], "i'll": ['I', 'will'], "i'd": ['I', 'would'],
};

/** Expand one lowercase word with an apostrophe into word parts (or null). */
function expand(lower) {
  if (CONTRACTIONS[lower]) return CONTRACTIONS[lower];
  let m = lower.match(/^(.+)n't$/);
  if (m) return [m[1], 'not'];
  m = lower.match(/^(.+)'(re|ve|ll|m|d)$/);
  if (m) return [m[1], { re: 'are', ve: 'have', ll: 'will', m: 'am', d: 'would' }[m[2]]];
  return null;
}

/**
 * Split text into sentences on . ! ? (not inside numbers such as 3.5), keeping offsets.
 * @returns {{start:number,end:number,text:string,terminator:string}[]} text excludes the terminator
 */
export function splitSentences(text) {
  const out = [];
  let start = 0;
  const push = (end, term) => {
    let s = start, e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push({ start: s, end: e, text: text.slice(s, e), terminator: term });
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;
    if (c === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue;
    let j = i;
    while (j + 1 < text.length && '.!?'.includes(text[j + 1])) j++;
    push(i, text.slice(i, j + 1));
    start = j + 1;
    i = j;
  }
  push(text.length, '');
  return out;
}

// Letters exclude the multiplication and division signs (U+00D7, U+00F7), which are operators here.
// Note names with accidentals (F#, B♭) are kept and spoken out: "F#" -> "F sharp".
const TOKEN_RE = /\b[A-Ga-g][#♯♭](?![\w#♯♭])|(?<![\w)])-\d+(?:\.\d+)?|\d+(?:\.\d+)?|[A-Za-zÀ-ÖØ-öø-ɏ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ɏ]+)*|,|[+\-*\/×÷=]/g;
const OP_NORMAL = { '×': '*', '÷': '/' };

/**
 * Tokenize a sentence: words, numbers, `'s` and commas; contractions expanded, number words
 * converted, fillers dropped. `base` is the sentence's offset in the original text.
 */
export function tokenize(sentence, base = 0) {
  let toks = [];
  for (const m of sentence.matchAll(TOKEN_RE)) {
    const raw = m[0].replace(/’/g, "'");
    const start = base + m.index, end = start + m[0].length;
    if (raw === ',') { toks.push({ raw, lower: ',', start, end, kind: 'punct' }); continue; }
    if (/^[A-Ga-g][#♯♭]$/.test(raw)) {
      const acc = raw[1] === '♭' ? 'flat' : 'sharp';
      toks.push({ raw: raw[0], lower: raw[0].toLowerCase(), start, end: start + 1, kind: 'word' }, { raw: acc, lower: acc, start: start + 1, end, kind: 'word' });
      continue;
    }
    if (raw.length === 1 && '+-*/×÷='.includes(raw)) { toks.push({ raw, lower: OP_NORMAL[raw] ?? raw, start, end, kind: 'op' }); continue; }
    if (/^-?\d/.test(raw)) { toks.push({ raw, lower: raw, start, end, kind: 'number' }); continue; }
    const lower = raw.toLowerCase();
    const parts = expand(lower);
    if (parts) {
      for (const p of parts) toks.push({ raw: p, lower: p.toLowerCase(), start, end, kind: 'word' });
      continue;
    }
    const poss = raw.match(/^(.+)'s$/i);
    if (poss) {
      toks.push({ raw: raw.slice(0, -2), lower: poss[1].toLowerCase(), start, end: end - 2, kind: 'word' });
      toks.push({ raw: "'s", lower: "'s", start: end - 2, end, kind: 'word' });
      continue;
    }
    toks.push({ raw, lower, start, end, kind: 'word' });
  }
  toks = convertNumbers(toks, sentence, base);
  toks = keepOperators(toks);
  toks = toks.filter((t) => !FILLERS.has(t.lower));
  // sentence-initial fillers
  for (;;) {
    while (toks.length && toks[0].kind === 'punct') toks.shift();
    if (toks.length && INITIAL_DROP.has(toks[0].lower)) { toks.shift(); continue; }
    if (toks.length > 1 && toks[0].lower === 'after' && toks[1].lower === 'that') { toks.splice(0, 2); continue; }
    break;
  }
  return toks;
}

/**
 * Arithmetic symbols (+ - * / × ÷ =) are kept only where they mean arithmetic: between two numbers,
 * or `=` right after a number ("7 + 5 ="). Anywhere else they are dropped, as before.
 */
function keepOperators(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== 'op') { out.push(t); continue; }
    const prev = out[out.length - 1];
    if (prev?.kind !== 'number') continue;
    if (t.lower === '=' || toks[i + 1]?.kind === 'number') out.push(t);
  }
  return out;
}

/** Replace number-word runs, `half` and `a dozen` by number tokens. */
function convertNumbers(toks, sentence, base) {
  const out = [];
  const lowers = toks.map((t) => (t.kind === 'word' ? t.lower : '\u0000'));
  const span = (a, b) => ({ start: toks[a].start, end: toks[b].end });
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== 'word') { out.push(t); continue; }
    if (t.lower === 'a' && lowers[i + 1] === 'dozen') {
      const s = span(i, i + 1);
      out.push({ raw: sentence.slice(s.start - base, s.end - base), lower: '12', ...s, kind: 'number' });
      i += 1; continue;
    }
    if (t.lower === 'half') { out.push({ ...t, lower: '0.5', kind: 'number' }); continue; }
    if (isNumberWord(t.lower)) {
      const run = parseNumberRun(lowers, i);
      if (run) {
        let value = run.value, last = i + run.length - 1;
        if (lowers[last + 1] === 'dozen') { value *= 12; last += 1; }
        const s = span(i, last);
        out.push({ raw: sentence.slice(s.start - base, s.end - base), lower: String(value), ...s, kind: 'number' });
        i = last; continue;
      }
    }
    out.push(t);
  }
  return out;
}

/**
 * Segment and tokenize a whole text.
 * @returns {{text:string,span:[number,number],isQuestion:boolean,tokens:object[]}[]}
 */
export function analyze(text) {
  const out = [];
  for (const s of splitSentences(text)) {
    const tokens = tokenize(s.text, s.start);
    if (!tokens.length) continue;
    const first = tokens.find((t) => t.kind !== 'punct');
    const isQuestion = s.terminator.includes('?') || (first ? QUESTION_WORDS.has(first.lower) : false);
    out.push({ text: s.text, span: [s.start, s.end], isQuestion, tokens });
  }
  return out;
}

// ---- typo tolerance (spec 03 section 1b) ---------------------------------------------------------------------

/** Damerau-Levenshtein distance (optimal string alignment: insert, delete, substitute, swap neighbours); `max` stops early. */
export function editDistance(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed edit distance for a word: none below 4 letters, 1 for 4 to 7 letters, 2 for 8 and more. */
export const typoBudget = (word) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

const QUOTE_RE = /"[^"]*"|\u201c[^\u201d]*\u201d/g;

/**
 * Correct unknown words to the closest word of `vocab` (a Set of lowercase words; `known(lower)` tells whether a word
 * is understood as it is). Numbers, quoted text, capitalized names (not at the start of the sentence), words with
 * digits, apostrophes or hyphens, known words and ambiguous words (two candidates at the same distance) are left alone.
 * @returns {{ tokens: object[], corrections: {from:string,to:string,span:[number,number]}[] }}
 */
export function correctTokens(tokens, text, vocab, known = (w) => vocab.has(w), { maxCorrections = 3 } = {}) {
  const quoted = [...text.matchAll(QUOTE_RE)].map((m) => [m.index, m.index + m[0].length]);
  const corrections = [];
  const firstWord = tokens.findIndex((t) => t.kind === 'word');
  const out = tokens.map((t, i) => {
    if (corrections.length >= maxCorrections || t.kind !== 'word' || !/^[a-z]+$/.test(t.lower)) return t;
    if (i !== firstWord && /^[A-ZÀ-Þ]/.test(t.raw)) return t;
    if (quoted.some(([a, b]) => t.start >= a && t.end <= b)) return t;
    const budget = typoBudget(t.lower);
    if (!budget || known(t.lower)) return t;
    let best = null, bestD = budget + 1, tie = false;
    for (const w of vocab) {
      if (w.length < 3 || Math.abs(w.length - t.lower.length) > budget || !/^[a-z]+$/.test(w)) continue;
      const d = editDistance(t.lower, w, bestD);
      if (d > budget) continue;
      if (d < bestD) { best = w; bestD = d; tie = false; } else if (d === bestD && w !== best) tie = true;
    }
    if (!best || tie) return t;
    corrections.push({ from: t.raw, to: best, span: [t.start, t.end] });
    return { ...t, raw: best, lower: best };
  });
  return { tokens: out, corrections };
}
