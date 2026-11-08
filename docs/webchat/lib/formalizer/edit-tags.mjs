/**
 * Edit tags of the simplification head ("rephraser", spec 03 section 7.2). Browser-safe: no `node:*` imports.
 *
 * A message piece is cut into WORDS (`wordsOf`) and the head predicts one tag per word:
 *   KEEP            keep the word,
 *   DELETE          drop the word (fillers, politeness, hesitations),
 *   R:<text>        replace the word by <text> (one or more words from the edit vocabulary: "hrs" -> "hours", "five" -> "5", "whats" -> "what is"),
 *   P:<text>        keep the word and put <text> before it,
 *   A:<text>        keep the word and append <text> after it (glued when <text> starts with punctuation).
 * `applyEditTags` builds the rewritten text. The same algorithm lives in training/psys2_train/edit.py (kept in sync by tests).
 */
export const WORD_RE = /[0-9A-Za-z_À-￿]+(?:['’][0-9A-Za-z_À-￿]+)*|\S/g;

/** Words of `text` as [{ w, start, end }] (words: letters/digits with inner apostrophes; every other non-blank char is a word). */
export function wordsOf(text) {
  const out = [];
  for (const m of text.matchAll(WORD_RE)) out.push({ w: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

export const isPunctWord = (w) => !/[0-9A-Za-z_À-￿]/.test(w);

/** The rewritten text for per-word `tags` (strings; unknown tags count as KEEP). Whitespace before a kept word is preserved. */
export function applyEditTags(text, words, tags) {
  let out = '';
  words.forEach((wd, i) => {
    const t = tags[i] ?? 'KEEP';
    if (t === 'DELETE') return;
    let piece = wd.w;
    if (t.startsWith('R:')) piece = t.slice(2);
    else if (t.startsWith('P:')) piece = `${t.slice(2)} ${wd.w}`;
    else if (t.startsWith('A:')) { const add = t.slice(2); piece = wd.w + (isPunctWord(add[0] ?? 'a') ? '' : ' ') + add; }
    if (out && wd.start > 0 && /\s/.test(text[wd.start - 1])) out += ' ';
    out += piece;
  });
  return out;
}

/** Rewrite of `text`, or null when the tags leave it unchanged (after trimming) or delete everything. */
export function simplifiedText(text, words, tags) {
  const s = applyEditTags(text, words, tags).trim();
  return s && s !== text.trim() ? s : null;
}
