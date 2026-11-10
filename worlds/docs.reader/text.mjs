// Text layer of docs.reader: Markdown / plain-text blocks, sentence splitting, tokens, stemming, BM25 and TF-IDF.
// Browser-safe, imports only ./lang.mjs.
import { STOP, ABBREV } from './lang.mjs';

// ---- blocks ----------------------------------------------------------------------------------------------------
const stripInline = (s) => s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/(\*\*|__)(.+?)\1/g, '$2')
  .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,;:!?])/g, '$1$2')
  .replace(/`([^`]*)`/g, '$1')
  .replace(/<[^>\n]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const looksLikeHeading = (line, prevBlank, nextBlank, first) => {
  const t = line.trim();
  if (!t || t.length > 70 || !prevBlank || !nextBlank) return 0;
  if (/[.!?,;:"”’)]$/.test(t)) return 0;
  if (/^(chapter|part|book|section|act|scene|prologue|epilogue|introduction|conclusion|appendix|abstract|summary|contents)\b/i.test(t)) return /^(part|book)\b/i.test(t) ? 1 : 2;
  if (/^[IVXLC]+\.?$/.test(t) || /^\d+(\.\d+)*\.?\s+\S/.test(t) || /^\d+\.?$/.test(t)) return 2;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase()) return first ? 1 : 2;
  const words = t.split(/\s+/);
  if (words.length <= 8 && words.filter((w) => /^[A-Z]/.test(w) || /^(of|the|a|an|and|in|on|to|for|at|by|with)$/i.test(w)).length === words.length && words.length >= 1 && (first || words.length >= 2)) return first ? 1 : 2;
  return 0;
};

/**
 * Text -> blocks: { type: 'heading', level, text } | { type: 'para', text, note?, list? }.
 * Markdown: #-headings, setext headings, > notes, lists, fenced code is skipped. Plain text: blank-line paragraphs, heading heuristics.
 */
export function toBlocks(text, format = 'md') {
  const lines = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let buf = [], fence = false;
  const flush = (note = false) => {
    if (!buf.length) return;
    const t = stripInline(buf.join(' '));
    if (t) blocks.push({ type: 'para', text: t, ...(note ? { note: true } : {}) });
    buf = [];
  };
  const md = format === 'md';
  // bounded: a pass over a finite token list or text: the index only moves in one direction
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (md && /^\s*(```|~~~)/.test(line)) { flush(); fence = !fence; continue; }
    if (fence) continue;
    const blank = !line.trim();
    if (blank) { flush(); continue; }
    let m;
    if (md && (m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/))) { flush(); blocks.push({ type: 'heading', level: m[1].length, text: stripInline(m[2]) }); continue; }
    if (md && lines[i + 1] && /^(=+|-+)\s*$/.test(lines[i + 1]) && !buf.length && line.trim().length < 90) { blocks.push({ type: 'heading', level: lines[i + 1][0] === '=' ? 1 : 2, text: stripInline(line) }); i++; continue; }
    if (md && /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); continue; }
    if (md && (m = line.match(/^\s*>\s?(.*)$/))) { if (buf.length && !buf.noteMode) flush(); buf.noteMode = true; buf.push(m[1]); if (!lines[i + 1] || !/^\s*>/.test(lines[i + 1])) { flush(true); buf.noteMode = false; } continue; }
    if (md && (m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/))) { flush(); const t = stripInline(m[1]); if (t) blocks.push({ type: 'para', text: /[.!?]["”’)]?$/.test(t) ? t : `${t}.`, list: true }); continue; }
    if (!md && !buf.length) {
      const h = looksLikeHeading(line, i === 0 || !lines[i - 1].trim(), i === lines.length - 1 || !lines[i + 1].trim(), !blocks.length);
      if (h) { blocks.push({ type: 'heading', level: h, text: line.trim() }); continue; }
    }
    buf.push(line.trim());
  }
  flush();
  return blocks;
}

// ---- sentences -------------------------------------------------------------------------------------------------
const OPEN_Q = /["“‘«(]/;
const CLOSE_Q = /["”’»)]/;
/** Split a paragraph into sentences: [{ text, start, end }] with offsets in `text`. Quotes stay with the sentence they end. */
export function splitSentences(text) {
  const out = [];
  let start = 0;
  const n = text.length;
  const push = (end) => {
    let s = start, e = end;
    // bounded: s only increases up to e (whitespace trim)
    while (s < e && /\s/.test(text[s])) s++;
    // bounded: e only decreases down to s (whitespace trim)
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) out.push({ text: text.slice(s, e), start: s, end: e });
  };
  // bounded: a pass over a finite token list or text: the index only moves in one direction
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue;
    let j = i;
    // bounded: j only increases up to the text length
    while (j + 1 < n && /[.!?…]/.test(text[j + 1])) j++;
    // bounded: j only increases up to the text length
    while (j + 1 < n && CLOSE_Q.test(text[j + 1])) j++;
    const after = text.slice(j + 1);
    if (after && !/^\s/.test(after)) { i = j; continue; }                                  // "3.5", "example.com"
    const word = (text.slice(0, i).match(/([A-Za-z]+)$/) ?? [])[1] ?? '';
    if (c === '.' && j === i) {
      if (ABBREV.has(word.toLowerCase()) && /^\s+[A-Za-z0-9]/.test(after)) { continue; }   // Mr. Smith
      if (/^[A-Z]$/.test(word) && /^\s+[A-Z]/.test(after) && /(^|\s)[A-Z]\.?$/.test(text.slice(Math.max(0, i - 3), i + 1))) continue; // initials
      if (/\d$/.test(text.slice(0, i)) && /^\s+\d/.test(after)) continue;
    }
    const next = (after.match(/^\s*(\S)/) ?? [])[1];
    const closed = j > i;
    // a closing quote followed by a lowercase word continues the sentence: "Come in!" said the witch.
    if (next && /[a-z]/.test(next) && (closed || c === '.' || c === '!' || c === '?')) {
      if (closed || c !== '.') { i = j; continue; }
      i = j; continue;
    }
    push(j + 1);
    start = j + 1;
    i = j;
  }
  push(n);
  return out;
}

// ---- tokens and stems ------------------------------------------------------------------------------------------
/** Light English stemmer (plural, -ing, -ed, -ly): good enough for matching "walked" with "walk". */
export function stem(w) {
  let s = w.toLowerCase();
  if (s.length <= 3) return s;
  if (/ies$/.test(s) && s.length > 4) return `${s.slice(0, -3)}y`;
  if (/ied$/.test(s) && s.length > 4) return `${s.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(s)) return s;
  if (/ing$/.test(s) && s.length > 5) { s = s.slice(0, -3); if (/(.)\1$/.test(s) && !/(ll|ss|zz)$/.test(s)) s = s.slice(0, -1); return s.replace(/([^aeiou])$/, (m) => m); }
  if (/ed$/.test(s) && s.length > 4) { s = s.slice(0, -2); if (/(.)\1$/.test(s) && !/(ll|ss|zz)$/.test(s)) s = s.slice(0, -1); return s; }
  if (/(ch|sh|x|ss|zz)es$/.test(s)) return s.slice(0, -2);
  if (/ly$/.test(s) && s.length > 5) return s.slice(0, -2);
  if (/s$/.test(s)) { s = s.slice(0, -1); return /e$/.test(s) && s.length > 4 ? s.slice(0, -1) : s; }   // plural and singular meet on the same stem (pebbles, pebble)
  if (/e$/.test(s) && s.length > 4) return s.slice(0, -1);
  return s;
}
export const words = (text) => (String(text).toLowerCase().replace(/[’]/g, "'").match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []).map((w) => w.replace(/'s$/, ''));
/** Content stems of a text (stop words removed). */
export const contentStems = (text) => words(text).filter((w) => !STOP.has(w) && w.length > 1).map(stem);

// ---- BM25 over sentences --------------------------------------------------------------------------------------
const K1 = 1.5, B = 0.75;
/** Build the BM25 index of a document's sentences: { N, avg, df: Map, tf: [Map], len: [] }. */
export function buildBm25(sentences) {
  const tf = [], len = [], df = new Map();
  for (const s of sentences) {
    const m = new Map();
    const toks = contentStems(s.text);
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    tf.push(m); len.push(toks.length);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = sentences.length;
  return { N, avg: len.reduce((a, b) => a + b, 0) / Math.max(1, N), df, tf, len };
}
/** Ranked sentences for a query: [{ i, score, terms }] (best first, only positive scores). */
export function bm25Search(index, query, { limit = 10, only } = {}) {
  const q = [...new Set(contentStems(query))];
  const hits = [];
  for (let i = 0; i < index.N; i++) {
    if (only && !only(i)) continue;
    let score = 0; const terms = [];
    for (const t of q) {
      const f = index.tf[i].get(t);
      if (!f) continue;
      const n = index.df.get(t) ?? 0;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * index.len[i] / (index.avg || 1))));
      terms.push(t);
    }
    if (score > 0) hits.push({ i, score: Math.round(score * 1000) / 1000, terms });
  }
  hits.sort((a, b) => b.score - a.score || a.i - b.i);
  return { query: q, hits: hits.slice(0, limit), total: hits.length, all: hits };
}

/** Edit distance with a cap (insert, delete, replace, swap of neighbours). */
function near(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length] <= max;
}

/**
 * A query whose words are not in the document ("bred"): each unknown content word becomes the one word of the document within one edit
 * (two for words of 7 letters or more); null when nothing changed or a word has no unique neighbour.
 */
export function correctQuery(index, query) {
  let changed = false;
  const out = [];
  for (const w of words(query)) {
    const s = stem(w);
    if (STOP.has(w) || index.df.has(s) || w.length < 3) { out.push(w); continue; }
    const max = w.length >= 7 ? 2 : 1;
    // the closest word (one edit before two), then the most frequent one; a tie after that is no guess
    let hits = [];
    for (let m = 1; m <= max && !hits.length; m++) hits = [...index.df.keys()].filter((k) => k.length >= 3 && near(s, k, m));
    const top = Math.max(0, ...hits.map((k) => index.df.get(k)));
    hits = hits.filter((k) => index.df.get(k) === top);
    if (hits.length !== 1) return null;
    out.push(hits[0]); changed = true;
  }
  return changed ? out.join(' ') : null;
}

// ---- TF-IDF keywords (paragraphs are the documents) ------------------------------------------------------------
const KEY_STOP = new Set(['said', 'say', 'made', 'make', 'called', 'call', 'came', 'come', 'went', 'go', 'took', 'take', 'saw', 'see', 'got', 'get', 'would', 'could', 'like', 'little', 'every', 'one', 'also', 'may', 'must', 'much', 'many', 'new', 'good', 'first', 'last', 'next', 'time', 'way', 'day', 'thing', 'back', 'long', 'last']);
export function tfidfKeywords(paragraphTexts, { top = 15, exclude = new Set() } = {}) {
  const docs = paragraphTexts.map((t) => contentStems(t));
  const N = docs.length;
  const df = new Map(), tf = new Map(), surface = new Map();
  docs.forEach((d, i) => {
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const w of words(paragraphTexts[i])) { const s = stem(w); if (!surface.has(s) || w.length < surface.get(s).length) surface.set(s, w); }
  });
  const out = [];
  for (const [t, f] of tf) {
    if (exclude.has(t) || KEY_STOP.has(t) || KEY_STOP.has(surface.get(t)) || /^\d+$/.test(t)) continue;
    const idf = Math.log((N + 1) / ((df.get(t) ?? 0) + 0.5)) + 1;
    out.push({ term: surface.get(t) ?? t, stem: t, score: Math.round((1 + Math.log(f)) * idf * 1000) / 1000, count: f });
  }
  out.sort((a, b) => b.score - a.score || b.count - a.count || a.term.localeCompare(b.term));
  return out.slice(0, top);
}
