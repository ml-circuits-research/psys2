/**
 * Reading variants of a sentence the rules did not read (spec 03 section 4.9, ROUND-TRIP-MINING). Browser-safe, no imports.
 *
 * English that comes back from another language through a translation model (and English typed by non-native speakers) keeps the meaning but changes
 * the grammatical frame: "Wearing a hat" for "wear a hat", "He draws two houses" for "draw two houses", "What day will come after Monday" for "what day
 * comes after Monday", "in italics" for "italic", "The color of the body" for "the body color", "Zoë" for "Zoe". These are general rewrites of the TOKENS, not
 * phrases: each variant is tried only when the sentence as typed was not read, only when the rewritten word is a word some world knows (`known`), and the
 * rewritten text goes through the same rules, so nothing is invented and nothing that already reads is changed.
 */

import { budget } from '../../dialog/budget.mjs';

const SUBJECTS = new Set(['he', 'she', 'it', 'they', 'we', 'someone', 'somebody', 'one']);
const STYLE_IN = new Map([['bold', 'bold'], ['italics', 'italic'], ['italic', 'italic'], ['underline', 'underline'], ['underlined', 'underline']]);
const CLAUSE_START = new Set([',', 'and', 'then', 'also', 'but', 'so', 'please']);
const isWord = (t) => t && t.kind === 'word';
const mk = (t, lower) => ({ ...t, lower, raw: /^\p{Lu}/u.test(t.raw ?? '') ? lower[0].toUpperCase() + lower.slice(1) : lower, alt: t.alt ?? t.lower });

/** Base verb forms of an inflected word, most likely first: "wearing" -> wear; "clearing" -> clear; "making" -> make; "putting" -> put; "draws" -> draw; "highlighted" -> highlight. */
export function baseForms(w) {
  const out = [];
  if (w.length > 4 && w.endsWith('ing')) {
    const s = w.slice(0, -3);
    out.push(s, `${s}e`);
    if (/([^aeiou])\1$/.test(s)) out.push(s.slice(0, -1));
  } else if (w.length > 3 && w.endsWith('ed')) {
    const s = w.slice(0, -2);
    out.push(s, `${s}e`);
    if (/([^aeiou])\1$/.test(s)) out.push(s.slice(0, -1));
    if (w.endsWith('ied')) out.push(`${w.slice(0, -3)}y`);
  } else if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) {
    if (w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
    if (/(?:ch|sh|x|ss|o)es$/.test(w)) out.push(w.slice(0, -2));
    out.push(w.slice(0, -1));
  }
  return out;
}

const stripMarks = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Alternative token lists for a sentence, in order of how conservative they are; [] when no rewrite applies.
 * @param {object[]} tokens   the sentence's tokens ({ kind, lower, raw, ... })
 * @param {(w: string) => boolean} known   true for a word some world knows
 */
export function readingVariants(tokens, known) {
  const out = [];
  const add = (list) => { if (list.length !== tokens.length || list.some((t, i) => t !== tokens[i])) out.push(list); };
  const verb = (w) => baseForms(w).find((b) => known(b));
  const is = (i, f) => isWord(tokens[i]) && f(tokens[i].lower);

  // 1. diacritics of names and words: Zoë -> Zoe
  if (tokens.some((t) => isWord(t) && stripMarks(t.lower) !== t.lower)) add(tokens.map((t) => (isWord(t) && stripMarks(t.lower) !== t.lower ? mk(t, stripMarks(t.lower)) : t)));

  // 2. a clause that starts with a gerund, or with a pronoun and a verb, is a command: "Wearing a hat", "Adding a sun", "He draws two houses", "It reminds me to call Grandma"
  const starts = [0];
  tokens.forEach((t, i) => { if (CLAUSE_START.has(t.lower) && i + 1 < tokens.length) starts.push(i + 1); });
  let v2 = [...tokens], changed = false;
  for (const i of [...starts].reverse()) {
    if (!isWord(v2[i])) continue;
    const w = v2[i].lower;
    if (SUBJECTS.has(w) && isWord(v2[i + 1]) && i + 2 <= v2.length - 1) {
      const next = v2[i + 1].lower;
      const base = verb(next) ?? (known(next) ? next : null);
      if (base) { if (w === 'he' || w === 'she') v2.personal = true; v2.splice(i, 2, base === next ? v2[i + 1] : mk(v2[i + 1], base)); changed = true; }
    } else if (w.endsWith('ing')) {
      const base = verb(w);
      if (base) { v2[i] = mk(v2[i], base); changed = true; }
    }
  }
  if (changed) { v2.command = true; add(v2); }   // `personal`: he/she lead, read only inside the open tab's own world (otherwise "He gets 3 more." is an anaphoric statement, not a command); `command`: the reading must be a request or a question, never a statement ("He gets 3 more." has no agent to give it to)

  // 3. "will come" -> "comes"; "is going to come" is left alone
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (is(i, (w) => w === 'will') && isWord(tokens[i + 1]) && known(tokens[i + 1].lower)) {
      const w = tokens[i + 1].lower, third = /(?:ch|sh|x|ss|o)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`;
      if (known(third)) { add([...tokens.slice(0, i), mk(tokens[i + 1], third), ...tokens.slice(i + 2)]); break; }
    }
  }

  // 4. "in bold", "in italics" -> "bold", "italic"
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (is(i, (w) => w === 'in') && isWord(tokens[i + 1]) && STYLE_IN.has(tokens[i + 1].lower)) {
      add([...tokens.slice(0, i), mk(tokens[i + 1], STYLE_IN.get(tokens[i + 1].lower)), ...tokens.slice(i + 2)]);
      break;
    }
  }

  // 5. "the color of the body" -> "the body color"
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (is(i, (w) => w === 'color' || w === 'colour') && is(i + 1, (w) => w === 'of')) {
      let j = i + 2;
      if (is(j, (w) => w === 'the' || w === 'your' || w === 'my')) j++;
      if (isWord(tokens[j])) { add([...tokens.slice(0, i), tokens[j], tokens[i], ...tokens.slice(j + 1)]); break; }
    }
  }

  // 6. "add the sun" for "add a sun": a definite article after a creating verb
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (is(i, (w) => w === 'add' || w === 'draw' || w === 'put' || w === 'make') && is(i + 1, (w) => w === 'the')) {
      add([...tokens.slice(0, i + 1), mk(tokens[i + 1], 'a'), ...tokens.slice(i + 2)]);
      break;
    }
  }
  return out;
}

/** "make the last paragraph in bold" / "in italics" -> "... bold" / "... italic": a styling command with "in" before a style word. Applied before reading, only to a sentence that starts with a styling verb. */
export function dropStyleIn(tokens) {
  const first = tokens.find((t) => !t.filler && t.kind === 'word');
  if (!first || !['make', 'set', 'turn', 'put', 'change', 'format'].includes(first.lower)) return tokens;
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    budget.tick('variants.dropStyleIn');
    const t = tokens[i], n = tokens[i + 1];
    if (isWord(t) && t.lower === 'in' && isWord(n) && STYLE_IN.has(n.lower)) { out.push(STYLE_IN.get(n.lower) === n.lower ? n : mk(n, STYLE_IN.get(n.lower))); i++; } else out.push(t);
  }
  return out;
}
