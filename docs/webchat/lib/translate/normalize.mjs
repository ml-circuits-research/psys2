// Text normalization and tokenization for the translation module (browser-safe).
// Normalization is offset-preserving: every token keeps its span in the ORIGINAL text.
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

const CHAR_MAP = {
  'ş': 'ș', 'Ş': 'Ș', 'ţ': 'ț', 'Ţ': 'Ț',
  '−': '-', '„': '"', '«': '"', '»': '"', '’': "'", '‘': "'", '“': '"', '”': '"', ' ': ' ',
};

const MARK = /\p{M}/u;

/** Unicode NFC + ș/ț comma-below unification, with an index map back to the original. */
export function normalizeWithMap(text) {
  const out = [];
  const starts = [];
  const ends = [];
  let pos = 0;
  while (pos < text.length) {
    budget.tick('translate.tokenize');
    const cp = text.codePointAt(pos);
    let end = pos + (cp > 0xffff ? 2 : 1);
    while (end < text.length && MARK.test(text[end])) { budget.tick('normalize.normalizeWithMap'); end++; }
    const cluster = text.slice(pos, end).normalize('NFC');
    for (let k = 0; k < cluster.length; k++) {
      const ch = cluster[k];
      out.push(CHAR_MAP[ch] ?? ch);
      starts.push(pos);
      ends.push(end);
    }
    pos = end;
  }
  return { text: out.join(''), starts, ends };
}

/** NFC + comma-below unification (no offsets). */
export function normalizeText(text) {
  return normalizeWithMap(String(text)).text;
}

/** Diacritic-insensitive lookup key: lowercase, ă/â/î/ș/ț folded to a/a/i/s/t. */
export function foldKey(word) {
  return normalizeText(word).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

const TOKEN_RE = /\p{L}+(?:['\-]\p{L}+)*|(?<![\p{L}\d])-\d+(?:[.,]\d+)?|\d{1,2}:\d{2}|\d+(?:[.,]\d+)?|\S/gu;

/** Tokenize text; spans refer to the original string. */
export function tokenize(original) {
  const nm = normalizeWithMap(String(original));
  const toks = [];
  for (const m of nm.text.matchAll(TOKEN_RE)) {
    const s = m.index;
    const e = s + m[0].length;
    const raw = m[0];
    let kind = 'punct';
    if (/^\p{L}/u.test(raw)) kind = 'word';
    else if (/^-?\d/.test(raw)) kind = 'num';
    const tok = {
      raw,
      start: nm.starts[s],
      end: nm.ends[e - 1],
      key: kind === 'punct' ? raw : foldKey(raw),
      kind,
      isCap: kind === 'word' && /^\p{Lu}/u.test(raw),
    };
    if (kind === 'num') tok.value = raw.replace(',', '.');
    toks.push(tok);
  }
  return toks;
}

/** Split a token list into sentences; terminal punctuation (. ! ? ...) ends a sentence. */
export function splitSentences(toks) {
  const sentences = [];
  let cur = [];
  const isEnd = (t) => t.kind === 'punct' && (t.raw === '.' || t.raw === '!' || t.raw === '?');
  for (let i = 0; i < toks.length; i++) {
    budget.tick('normalize.isEnd');
    cur.push(toks[i]);
    if (isEnd(toks[i])) {
      while (i + 1 < toks.length && isEnd(toks[i + 1])) { budget.tick('normalize.isEnd2'); cur.push(toks[++i]); }
      sentences.push(cur);
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur);
  return sentences;
}
