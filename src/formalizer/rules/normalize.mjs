/**
 * Normalization, sentence segmentation and tokenization (spec 03 section 1). Browser-safe.
 * Token = { raw, lower, start, end, kind: 'word' | 'number' | 'punct' } with absolute offsets
 * into the original text. Original casing is kept in `raw`.
 */
import { budget } from '../../dialog/budget.mjs';
import { isNumberWord, parseNumberRun, ordinalWordValue, digitWordValue } from './numbers.mjs';

export const QUESTION_WORDS = new Set(['how', 'what', 'who', 'where', 'when', 'which', 'why', 'is', 'are', 'does', 'do', 'can', 'did']);

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
    while (s < e && /\s/.test(text[s])) { budget.tick('normalize.push'); s++; }
    while (e > s && /\s/.test(text[e - 1])) { budget.tick('normalize.push2'); e--; }
    if (e > s) out.push({ start: s, end: e, text: text.slice(s, e), terminator: term });
  };
  const quoted = quotedRanges(text);
  for (let i = 0; i < text.length; i++) {
    budget.tick('normalize.push3');
    const c = text[i];
    if (c !== '.' && c !== '!' && c !== '?') continue;
    if (c === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue;
    if (quoted.some(([a, b]) => i > a && i < b)) continue;   // a terminator inside "double quotes" does not end the sentence
    let j = i;
    while (j + 1 < text.length && '.!?'.includes(text[j + 1])) { budget.tick('normalize.push4'); j++; }
    push(i, text.slice(i, j + 1));
    start = j + 1;
    i = j;
  }
  push(text.length, '');
  return glueTextRequests(text, out);
}

/** Ranges [open, close] of balanced "double quoted" text (straight or curly); an unclosed quote is ignored. */
function quotedRanges(text) {
  const out = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\u201C') open = i;
    else if (c === '\u201D') { if (open >= 0) out.push([open, i]); open = -1; }
    else if (c === '"') { if (open >= 0) { out.push([open, i]); open = -1; } else open = i; }
  }
  return out;
}

/** A request that carries free text ("write ...", "type ...", "add a paragraph ...", "continue with ...") keeps the sentences after it
 *  that do not start like a new request: the text is the user's, whatever its punctuation (docs.editor). */
const TEXT_LEAD = /^(?:(?:please|pls|hey|ok|okay|now|and|then|so)\s+)*(?:(?:can|could|would) you\s+)?(?:(?:add|insert|put|write|type|append|enter)\s+(?:in\s+)?(?:a\s+|an\s+|the\s+|another\s+|one more\s+)?(?:new\s+)?(?:paragraph|text|sentence|line|note|quote|passage)\b|write\b|type\b|continue with\b|continue writing\b|dictate\b|write down\b|note down\b)/i;
const REQUEST_START = /^(?:add|insert|delete|remove|erase|make|read|select|bold|italic|underline|undo|redo|move|go|new|start|stop|open|close|clear|copy|download|show|tell|turn|set|rename|replace|change|count|save|play|what|who|where|when|why|how|is|are|do|does|did|can|could|would|will|i|let|let's|you|please|pls|also|then|and|next|after|before|now|ok|okay|hey|thanks|thank|no|yes|center|centre|align|highlight|link|break|page|chapter|paragraph|heading|title|write|type|continue|call|put|give|create|mark|check|uncheck|finish|dictate|begin)\b/i;
/** GAPS-1: "I want a puzzle and I pay 10 lei. What is the change?" is ONE request: the sentence that says what was paid and the question about the change that follows it. */
const PAYMENT_SENTENCE = /\b(?:pay|paid|paying|give|gave|hand|handed)\b.*\b\d+(?:[.,]\d+)?\s*(?:lei|leu)\b/i;
const CHANGE_QUESTION = /^(?:(?:and|so|then|now|ok|okay)\s+)*(?:what(?:'s|\u2019s| is| would be| will be)|how much|what change)\b.*\bchange\b/i;
function glueTextRequests(text, sents) {
  const out = [];
  for (const s of sents) {
    const prev = out[out.length - 1];
    if (prev && ((TEXT_LEAD.test(prev.text) && !REQUEST_START.test(s.text)) || (PAYMENT_SENTENCE.test(prev.text) && CHANGE_QUESTION.test(s.text)))) {
      out[out.length - 1] = { start: prev.start, end: s.end, text: text.slice(prev.start, s.end), terminator: s.terminator };
    } else out.push(s);
  }
  return out;
}

// Letters exclude the multiplication and division signs (U+00D7, U+00F7), which are operators here.
// Note names with accidentals (F#, B♭) are kept and spoken out: "F#" -> "F sharp".
const TOKEN_RE = /\b[A-Ga-g][#♯♭](?![\w#♯♭])|(?<![\w)])-\d+(?:\.\d+)?|\d+(?:st|nd|rd|th)\b|\d+(?:\.\d+)?|[A-Za-zÀ-ÖØ-öø-ɏ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ɏ]+)*|,|%|[+\-*\/×÷=<>]/g;
const OP_NORMAL = { '×': '*', '÷': '/' };
const OP_CHARS = '+-*/×÷=<>';

/** Chat spellings read as the standard word; the token keeps the original in `alt`, so a pattern that lists `ur` still matches. */
const WORD_ALIASES = { ur: 'your' };

/** Fillers (spec 03 section 1.5): they only colour a message. The first group was always dropped. */
const OLD_FILLERS = new Set(['please', 'ok', 'okay', 'well', 'um']);
const NEW_FILLERS = new Set(['hey', 'uh', 'uhm', 'uhh', 'hmm', 'hm', 'hmmm', 'lol', 'lool', 'pls', 'plz', 'plss', 'plzz', 'thx', 'ty', 'tysm', 'rn', 'pleas']);
const FILLER_PATTERN = /^(?:ple+a+s+e+|pl[sz]{1,3}|hm+|u+h+m*|lo+l+)$/;
/** True for a word that is always a discourse filler (please-variants such as `pleeease` included). */
export function isFillerWord(w) {
  return OLD_FILLERS.has(w) || NEW_FILLERS.has(w) || FILLER_PATTERN.test(w);
}
/** True for the fillers that were always dropped (please, ok, okay, well, um). */
export const isOldFiller = (w) => OLD_FILLERS.has(w);
/** Sentence-initial words dropped for matching unless a pattern lists them (`then E F`). */
const INITIAL_DROP = new Set(['so', 'and', 'then']);
const AUX_BEFORE_KNOW = new Set(['do', 'did', 'does', 'would', 'could', 'can', 'will', 'should', 'to', 'let', 'if', 'not']);
const LIKE_LEAD_NEXT = new Set(['can', 'could', 'would', 'will', 'you', 'u', 'i', 'we', 'what', 'how', 'is', 'do', 'does', 'did', 'are', 'tell', 'show', 'give', 'play', 'make', 'let', 'please', 'where', 'who', 'when', 'which']);

/**
 * Tokenize a sentence: words, numbers, `'s` and commas; contractions expanded, number words
 * converted. `base` is the sentence's offset in the original text. Fillers (section 1.5) are marked
 * `filler: true`; they are removed from the result unless `keepFillers` is set (the matcher keeps them so that a pattern can
 * require `ok` or `please` explicitly).
 */
export function tokenize(sentence, base = 0, { keepFillers = false } = {}) {
  let toks = [];
  for (const m of sentence.matchAll(TOKEN_RE)) {
    const raw = m[0].replace(/’/g, "'");
    const start = base + m.index, end = start + m[0].length;
    if (raw === ',') { toks.push({ raw, lower: ',', start, end, kind: 'punct' }); continue; }
    if (raw === '%') { toks.push({ raw, lower: 'percent', start, end, kind: 'word', pct: true }); continue; }
    if (/^[A-Ga-g][#♯♭]$/.test(raw)) {
      const acc = raw[1] === '♭' ? 'flat' : 'sharp';
      toks.push({ raw: raw[0], lower: raw[0].toLowerCase(), start, end: start + 1, kind: 'word' }, { raw: acc, lower: acc, start: start + 1, end, kind: 'word' });
      continue;
    }
    if (raw.length === 1 && OP_CHARS.includes(raw)) { toks.push({ raw, lower: OP_NORMAL[raw] ?? raw, start, end, kind: 'op' }); continue; }
    const om = raw.match(/^(\d+)(st|nd|rd|th)$/i);
    if (om) {
      // "2nd" stays the number 2 followed by the suffix word `nd` (as it always was); the matcher's `ordinal` slot and `{n:number}` read the pair
      const cut = start + om[1].length;
      toks.push({ raw: om[1], lower: om[1], start, end: cut, kind: 'number', ordinal: Number(om[1]) },
        { raw: om[2], lower: om[2].toLowerCase(), start: cut, end, kind: 'word', suffix: true });
      continue;
    }
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
    const t = { raw, lower, start, end, kind: 'word' };
    if (Object.hasOwn(WORD_ALIASES, lower)) { t.lower = WORD_ALIASES[lower]; t.alt = lower; }
    const ord = ordinalWordValue(lower);
    if (ord !== null) t.ordinal = ord;
    toks.push(t);
  }
  toks = convertNumbers(toks, sentence, base);
  toks = keepOperators(toks, sentence, base);
  toks = gameNames(toks);
  markFillers(toks);
  if (!keepFillers) toks = toks.filter((t) => !t.filler);
  // punctuation before the first word means nothing
  const firstContent = toks.findIndex((t) => t.kind !== 'punct' && !t.filler);
  return firstContent < 0 ? toks : toks.filter((t, i) => i >= firstContent || t.kind !== 'punct');
}

/**
 * "x and 0", "x and o", "x n zero" are the game of tic tac toe (RP3: the Romanian name "X si 0", and the way people type it): three tokens become the
 * one word `tic_tac_toe`, spanning the same text, so every world and lexicon that knows the game by its usual name reads them.
 */
function gameNames(toks) {
  if (toks.length > 6) return toks;   // a name for the game, not a list of letters inside a longer sentence
  for (let i = 0; i + 2 < toks.length; i++) {
    budget.tick('normalize.gameNames');
    const a = toks[i], b = toks[i + 1], c = toks[i + 2];
    if (a.kind === 'word' && a.lower === 'x' && b.kind === 'word' && (b.lower === 'and' || b.lower === 'n' || b.lower === 'si' || b.lower === 'și')
      && ((c.kind === 'number' && c.lower === '0') || (c.kind === 'word' && (c.lower === 'o' || c.lower === 'zero')))) {
      toks.splice(i, 3, { raw: `${a.raw} ${b.raw} ${c.raw}`, lower: 'tic_tac_toe', start: a.start, end: c.end, kind: 'word', alt: 'x and 0' });
    }
  }
  return toks;
}

/** Mark fillers (section 1.5) in place. */
function markFillers(toks) {
  const n = toks.length;
  for (let i = 0; i < n; i++) {
    const t = toks[i];
    if (t.kind !== 'word') continue;
    if (isFillerWord(t.lower)) { t.filler = true; continue; }
    // "like" as a discourse marker: clause-initial before a request or question, or between commas / after a final comma
    if (t.lower === 'like') {
      const prev = toks[i - 1], next = toks[i + 1];
      const initial = !prev || prev.filler || prev.kind === 'punct';
      if ((initial && next && (next.kind === 'punct' || (next.kind === 'word' && LIKE_LEAD_NEXT.has(next.lower)))) || (prev?.kind === 'punct' && (!next || next.kind === 'punct'))) t.filler = true;
      continue;
    }
    // "u know", "ya know", "you know" (the last one only next to a comma or at the end)
    if (t.lower === 'know' && i > 0) {
      const p = toks[i - 1], pp = toks[i - 2];
      const you = p.kind === 'word' && (p.lower === 'u' || p.lower === 'ya' || p.lower === 'you');
      if (you && !(pp && pp.kind === 'word' && AUX_BEFORE_KNOW.has(pp.lower))
        && (p.lower === 'u' || p.lower === 'ya' || pp?.kind === 'punct' || i === n - 1 || toks[i + 1]?.kind === 'punct')) { p.filler = true; t.filler = true; }
      continue;
    }
    // "for me" at the end of the sentence
    if (t.lower === 'me' && i === n - 1 && i >= 2 && toks[i - 1].kind === 'word' && toks[i - 1].lower === 'for') { toks[i - 1].filler = true; t.filler = true; }
  }
  // sentence-initial and / so / then / after that: dropped for matching, kept for patterns that list them
  let i = 0;
  for (;;) {
    budget.tick('normalize.fixpoint');
    while (i < n && (toks[i].kind === 'punct' || toks[i].filler)) { budget.tick('normalize.markFillers'); i++; }
    if (i < n && toks[i].kind === 'word' && INITIAL_DROP.has(toks[i].lower)) { toks[i].filler = true; toks[i].lead = true; i++; continue; }
    if (i + 1 < n && toks[i].lower === 'after' && toks[i + 1].lower === 'that') { toks[i].filler = toks[i + 1].filler = true; toks[i].lead = toks[i + 1].lead = true; i += 2; continue; }
    const phrase = i < n ? leadPhraseAt(toks, i) : 0;
    if (phrase) { for (let k = i; k < i + phrase; k++) { toks[k].filler = true; toks[k].lead = true; } i += phrase; continue; }
    break;
  }
  // "real quick" / "quickly" closing a request: "what day is it real quick"
  let e = n;
  while (e > 0 && (toks[e - 1].kind === 'punct' || toks[e - 1].kind === 'qmark')) { budget.tick('normalize.markFillers2'); e--; }
  for (const tail of TRAIL_PHRASES) {
    const s = e - tail.length;
    if (s > 0 && tail.every((w, k) => toks[s + k].kind === 'word' && toks[s + k].lower === w && !toks[s + k].filler)) { for (let k = s; k < e; k++) toks[k].filler = true; break; }
  }
}

/** Spoken lead-ins that announce a request without being one ("quick one: center", "real quick, what day is it"). Longest first. */
const LEAD_PHRASES = [
  'just a quick one for you', 'quick one for you', 'just a quick one here', 'quick one here', 'just a quick one', 'one quick one', 'a quick one', 'quick one',
  'one quick question', 'a quick question', 'quick question', 'one quick thing', 'a quick thing', 'quick thing', 'just a quick question',
  'a small question', 'small question', 'a little question', 'little question', 'a tiny question', 'tiny question', 'a simple one', 'simple one',
  'an easy one', 'easy one', 'a hard one', 'hard one', 'a tough one', 'tough one', 'a short one', 'short one', 'a trick question', 'trick question',
  'real quick', 'really quick', 'super quick', 'very quick', 'one sec', 'just checking', 'just curious',
].map((x) => x.split(' ')).sort((a, b) => b.length - a.length);
const TRAIL_PHRASES = ['real quick', 'really quick', 'super quick', 'very quick'].map((x) => x.split(' '));

/** Length of a lead phrase starting at token `i` (0 when none): only when something else follows it. */
function leadPhraseAt(toks, i) {
  for (const ph of LEAD_PHRASES) {
    if (i + ph.length >= toks.length) continue;
    if (ph.every((w, k) => (toks[i + k].kind === 'word' || toks[i + k].kind === 'number') && String(toks[i + k].raw).toLowerCase() === w)) {
      let j = i + ph.length;
      while (j < toks.length && (toks[j].kind === 'punct' || toks[j].filler)) { budget.tick('normalize.leadPhraseAt'); j++; }
      if (j < toks.length) return ph.length;
    }
  }
  return 0;
}

/**
 * Arithmetic and comparison symbols (+ - * / × ÷ = < >) are kept where they mean something: between two numbers, `=` right after a
 * number ("7 + 5 ="), and `+ * / < >` between two tokens when one is a number or the symbol stands alone between spaces ("a + b").
 * `-` is kept only between numbers (a dash is also punctuation). Anywhere else they are dropped. The matcher treats a symbol and its
 * words as one literal (`+` = `plus`, `/` = `divided by`, `>` = `greater than`; matcher OP_WORDS).
 */
function keepOperators(toks, sentence, base) {
  const out = [];
  const spaced = (t) => (t.start - base === 0 || /\s/.test(sentence[t.start - base - 1])) && (t.end - base >= sentence.length || /\s/.test(sentence[t.end - base]));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== 'op') { out.push(t); continue; }
    const prev = out[out.length - 1], next = toks[i + 1];
    if (!prev || prev.kind === 'punct') continue;
    if (t.lower === '=') { if (prev.kind === 'number') out.push(t); continue; }
    if (prev.kind === 'number' && next?.kind === 'number') { out.push(t); continue; }
    if (t.lower !== '-' && next && next.kind !== 'punct' && next.kind !== 'op' && (prev.kind === 'number' || next.kind === 'number' || spaced(t))) out.push(t);
  }
  return out;
}

/** Replace number-word runs, `half`, `a dozen`, `one point five` and `one and a half` by number tokens. */
function convertNumbers(toks, sentence, base) {
  const out = [];
  const lowers = toks.map((t) => (t.kind === 'word' ? t.lower : '\u0000'));
  const span = (a, b) => ({ start: toks[a].start, end: toks[b].end });
  for (let i = 0; i < toks.length; i++) {
    budget.tick('normalize.span');
    const t = toks[i];
    if (t.kind !== 'word') { out.push(t); continue; }
    if (t.lower === 'a' && lowers[i + 1] === 'dozen') {
      const s = span(i, i + 1);
      out.push({ raw: sentence.slice(s.start - base, s.end - base), lower: '12', ...s, kind: 'number' });
      i += 1; continue;
    }
    if (t.lower === 'half') { out.push({ ...t, lower: '0.5', alt: 'half', kind: 'number' }); continue; }
    if (isNumberWord(t.lower)) {
      const run = parseNumberRun(lowers, i);
      if (run) {
        let value = run.value, last = i + run.length - 1, single = run.length === 1;
        if (lowers[last + 1] === 'dozen') { value *= 12; last += 1; single = false; }
        else if (lowers[last + 1] === 'point' && digitWordValue(lowers[last + 2]) !== null) {
          // "one point five" -> 1.5, "three point one four" -> 3.14
          let j = last + 2, frac = '';
          while (j < lowers.length && digitWordValue(lowers[j]) !== null) { budget.tick('normalize.span2'); frac += digitWordValue(lowers[j]); j++; }
          value = `${value}.${frac}`; last = j - 1; single = false;
        } else if (lowers[last + 1] === 'and' && (lowers[last + 2] === 'half' || (lowers[last + 2] === 'a' && lowers[last + 3] === 'half'))) {
          // "one and a half" -> 1.5
          value += 0.5; last += lowers[last + 2] === 'half' ? 2 : 3; single = false;
        }
        const s = span(i, last);
        const tok = { raw: sentence.slice(s.start - base, s.end - base), lower: String(value), ...s, kind: 'number' };
        if (single) tok.alt = lowers[i];
        out.push(tok);
        i = last; continue;
      }
    }
    out.push(t);
  }
  return out;
}

/**
 * Segment and tokenize a whole text. Tokens keep their fillers (marked `filler: true`, see `tokenize`); a sentence ending in `?`
 * gets a zero-width `qmark` token at the end (section 1.6). A sentence of only the original fillers (`ok.`) is dropped as before.
 * @returns {{text:string,span:[number,number],isQuestion:boolean,tokens:object[]}[]}
 */
export function analyze(text) {
  const out = [];
  for (const s of splitSentences(text)) {
    const tokens = tokenize(s.text, s.start, { keepFillers: true });
    if (!tokens.length) continue;
    const core = tokens.filter((t) => !t.filler && t.kind !== 'punct');
    if (!core.length && !tokens.some((t) => t.filler && !t.lead && !OLD_FILLERS.has(t.lower))) continue;
    const q = s.terminator.includes('?');
    if (q) {
      // question tags (", right?") carry no content
      const last = tokens[tokens.length - 1];
      if (core.length > 1 && last.kind === 'word' && ['right', 'eh', 'huh', 'yeah'].includes(last.lower) && tokens[tokens.length - 2].kind === 'punct') last.filler = true;
    }
    const first = core[0] ?? tokens.find((t) => t.kind !== 'punct');
    const isQuestion = q || (first ? QUESTION_WORDS.has(first.lower) : false);
    if (q) tokens.push({ raw: '?', lower: '?', start: s.end, end: s.end, kind: 'qmark' });
    out.push({ text: s.text, span: [s.start, s.end], isQuestion, tokens });
  }
  return out;
}

// ---- typo tolerance (spec 03 section 1b) ---------------------------------------------------------------------

/** Damerau-Levenshtein distance (optimal string alignment: insert, delete, substitute, swap neighbours); `max` stops early. */
export function editDistance(a, b, max = Infinity) {
  budget.tick('spell.edit', 1 + (a.length >> 3));
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

/**
 * Chat misspellings of short common words. Below 4 letters the edit distance is not allowed (too many neighbours), so the
 * frequent ones are listed. Used only when the word is unknown and the target is in the vocabulary.
 */
export const SHORT_TYPOS = {
  wat: 'what', wht: 'what', wot: 'what', wut: 'what', waht: 'what', whta: 'what', whts: 'whats', wats: 'whats', hw: 'how', hwo: 'how',
  mak: 'make', mke: 'make', amke: 'make', mkae: 'make', maek: 'make', ther: 'there', thre: 'there', wher: 'where', whre: 'where',
  wen: 'when', whn: 'when', hve: 'have', hav: 'have', giv: 'give', gve: 'give', thn: 'then', hlp: 'help', plya: 'play',
  whch: 'which', wich: 'which', hwmany: 'how many',
  dw: 'draw', srch: 'search', nxt: 'next', bk: 'back', opn: 'open', mpa: 'map', fr: 'for', cn: 'can',
};

/** Closest words of `vocab` within `budget` edits (all ties). Memoized per vocabulary object and word (SOAK-BUSY: the same unknown words came back for every reading of room talk); the vocabularies are immutable once built, the size guards against growth. */
const closestMemo = new WeakMap();
function closest(vocab, word, maxEdits) {
  let m = closestMemo.get(vocab);
  if (!m || m.size !== vocab.size) { m = { size: vocab.size, map: new Map() }; closestMemo.set(vocab, m); }
  const hit = m.map.get(word);
  if (hit) return [...hit];
  let bestD = maxEdits + 1, tied = [];
  for (const w of vocab) {
    if (w.length < 3 || Math.abs(w.length - word.length) > maxEdits || !/^[a-z]+$/.test(w)) continue;
    const d = editDistance(word, w, bestD);
    if (d > maxEdits) continue;
    if (d < bestD) { tied = [w]; bestD = d; } else if (d === bestD) tied.push(w);
  }
  if (m.map.size > 5000) m.map.clear();
  m.map.set(word, tied);
  return [...tied];
}

const QUOTE_RE = /"[^"]*"|\u201c[^\u201d]*\u201d/g;

/**
 * Correct unknown words to the closest word of `vocab` (a Set of lowercase words; `known(lower)` tells whether a word
 * is understood as it is). Numbers, quoted text, capitalized names (not at the start of the sentence), words with
 * digits, apostrophes or hyphens, known words and ambiguous words (two candidates at the same distance) are left alone.
 * @returns {{ tokens: object[], corrections: {from:string,to:string,span:[number,number]}[] }}
 */
export function correctTokens(tokens, text, vocab, known = (w) => vocab.has(w), { maxCorrections = 3, preferred = null, freq = vocab.freq ?? null } = {}) {
  const quoted = [...text.matchAll(QUOTE_RE)].map((m) => [m.index, m.index + m[0].length]);
  const corrections = [];
  const firstWord = tokens.findIndex((t) => t.kind === 'word' && !t.filler);
  const out = tokens.map((t, i) => {
    if (corrections.length >= maxCorrections || t.kind !== 'word' || t.filler || !/^[a-z]+$/.test(t.lower)) return t;
    if (i !== firstWord && /^[A-ZÀ-Þ]/.test(t.raw)) return t;
    if (quoted.some(([a, b]) => t.start >= a && t.end <= b)) return t;
    const maxEdits = typoBudget(t.lower);
    if (!maxEdits || known(t.lower)) return t;
    let tied = closest(vocab, t.lower, maxEdits);
    // equally close candidates: the preferred (candidate world's) vocabulary first, then the most frequent word; never an arbitrary pick
    if (tied.length > 1 && preferred) {
      const pref = typeof preferred === 'function' ? preferred() : preferred;
      const inPref = tied.filter((w) => pref.has(w));
      if (inPref.length) tied = inPref;
    }
    // DIAG3b: still tied: the candidate made of the same letters (an adjacent swap: "lable" -> "label", not "able") is the better guess
    if (tied.length > 1) {
      const letters = [...t.lower].sort().join(''), same = tied.filter((w) => [...w].sort().join('') === letters);
      if (same.length) tied = same;
    }
    if (tied.length > 1 && freq) {
      const top = Math.max(...tied.map((w) => freq.get(w) ?? 0));
      tied = tied.filter((w) => (freq.get(w) ?? 0) === top);
    }
    if (tied.length !== 1) return t;
    const best = tied[0];
    corrections.push({ from: t.raw, to: best, span: [t.start, t.end] });
    return { ...t, raw: best, lower: best };
  });
  return { tokens: out, corrections };
}
