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
  "can't": ['can', 'not'], "won't": ['will', 'not'], "i'm": ['I', 'am'], "let's": ['let', 'us'],
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
const TOKEN_RE = /(?<![\w)])-\d+(?:\.\d+)?|\d+(?:\.\d+)?|[A-Za-zÀ-ÖØ-öø-ɏ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ɏ]+)*|,|[+\-*\/×÷=]/g;
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
