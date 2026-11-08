/**
 * WordPiece tokenizer for the BERT family uncased models (distilbert-base-uncased). Browser-safe: no `node:*` imports, no dependencies.
 *
 * Mirrors the HuggingFace fast tokenizer pipeline (BertNormalizer: clean text, space around CJK, NFD + strip accents, lowercase;
 * BertPreTokenizer: split on whitespace and on punctuation; WordPiece: greedy longest match with `##`, a word that cannot be
 * matched completely (or has more than 100 characters) is one [UNK]). `encode` also returns, per token, the character offsets in
 * the ORIGINAL text (UTF-16 code units; identical to the Python code point offsets for text in the BMP), special tokens get [0, 0].
 * Truncation is "longest first" on a single sequence: at most `maxLength - 2` word-piece tokens plus [CLS] and [SEP].
 *
 *   const tk = createWordPieceTokenizer(vocabText);          // vocab.txt content (one token per line, line number = id)
 *   const { ids, offsets, tokens } = tk.encode('Hello, world', { maxLength: 128 });
 *
 * Tested against the Python tokenizer on a fixture (tests/wordpiece.test.mjs, tests/fixtures/wordpiece-distilbert.json).
 */

const CJK = [[0x4E00, 0x9FFF], [0x3400, 0x4DBF], [0x20000, 0x2A6DF], [0x2A700, 0x2B73F], [0x2B740, 0x2B81F], [0x2B820, 0x2CEAF], [0xF900, 0xFAFF], [0x2F800, 0x2FA1F]];
const isCjk = (cp) => CJK.some(([a, b]) => cp >= a && cp <= b);
const isControl = (c) => c !== '\t' && c !== '\n' && c !== '\r' && /^[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}]$/u.test(c);
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || (/^\s$/u.test(c) && c !== '﻿');
const isPunct = (c) => {
  const cp = c.codePointAt(0);
  if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true;
  return /^\p{P}$/u.test(c);
};

/** Normalize `text` to an array of { ch, s, e }: a normalized character and the span of the original character it comes from. */
export function normalizeChars(text) {
  const out = [];
  let pos = 0;
  for (const c of text) {
    const s = pos, e = pos + c.length;
    pos = e;
    if (c === '\0' || c === '�' || isControl(c)) continue;
    if (isSpace(c)) { out.push({ ch: ' ', s, e }); continue; }
    const cjk = isCjk(c.codePointAt(0));
    if (cjk) out.push({ ch: ' ', s, e });
    for (const d of c.normalize('NFD')) {
      if (/^\p{Mn}$/u.test(d)) continue;
      for (const l of d.toLowerCase()) out.push({ ch: l, s, e });
    }
    if (cjk) out.push({ ch: ' ', s, e });
  }
  return out;
}

/** Pre-tokenize: words as arrays of { ch, s, e }, split on spaces and around punctuation. */
export function preTokenize(chars) {
  const words = [];
  let cur = [];
  const flush = () => { if (cur.length) words.push(cur); cur = []; };
  for (const c of chars) {
    if (c.ch === ' ') flush();
    else if (isPunct(c.ch)) { flush(); words.push([c]); }
    else cur.push(c);
  }
  flush();
  return words;
}

export function createWordPieceTokenizer(vocabText, { unk = '[UNK]', cls = '[CLS]', sep = '[SEP]', pad = '[PAD]', prefix = '##', maxCharsPerWord = 100 } = {}) {
  const vocab = new Map();
  String(vocabText).split('\n').forEach((t, i) => { if (t !== '' || i === 0) vocab.set(t.replace(/\r$/, ''), i); });
  return createFromMap(vocab, { unk, cls, sep, pad, prefix, maxCharsPerWord });
}

/** Same from a token -> id object (used by the test fixture, whose vocabulary is pruned). */
export function createWordPieceTokenizerFromMap(obj, opts = {}) {
  return createFromMap(new Map(Object.entries(obj)), { unk: '[UNK]', cls: '[CLS]', sep: '[SEP]', pad: '[PAD]', prefix: '##', maxCharsPerWord: 100, ...opts });
}

function createFromMap(vocab, { unk, cls, sep, pad, prefix, maxCharsPerWord }) {
  const id = (t) => { const v = vocab.get(t); if (v === undefined) throw new Error(`vocabulary has no ${t}`); return v; };
  const special = { unk: id(unk), cls: id(cls), sep: id(sep), pad: id(pad) };

  const pieces = (word) => {
    if (word.length > maxCharsPerWord) return [{ tok: unk, s: word[0].s, e: word[word.length - 1].e }];
    const out = [];
    let start = 0;
    while (start < word.length) {
      let end = word.length, hit = null;
      while (start < end) {
        let sub = word.slice(start, end).map((c) => c.ch).join('');
        if (start > 0) sub = prefix + sub;
        if (vocab.has(sub)) { hit = { tok: sub, s: word[start].s, e: word[end - 1].e }; break; }
        end--;
      }
      if (!hit) return [{ tok: unk, s: word[0].s, e: word[word.length - 1].e }];
      out.push(hit);
      start = end;
    }
    return out;
  };

  return {
    special, vocabSize: vocab.size, has: (t) => vocab.has(t),
    encode(text, { maxLength = 512, addSpecial = true } = {}) {
      const toks = [];
      for (const w of preTokenize(normalizeChars(String(text)))) toks.push(...pieces(w));
      const room = addSpecial ? Math.max(maxLength - 2, 0) : maxLength;
      const kept = toks.slice(0, room);
      const ids = kept.map((t) => vocab.get(t.tok));
      const offsets = kept.map((t) => [t.s, t.e]);
      const tokens = kept.map((t) => t.tok);
      if (addSpecial) { ids.unshift(special.cls); offsets.unshift([0, 0]); tokens.unshift(cls); ids.push(special.sep); offsets.push([0, 0]); tokens.push(sep); }
      return { ids, offsets, tokens };
    },
  };
}
