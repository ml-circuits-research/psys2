/**
 * Backtracking pattern matcher (spec 03 section 2). Browser-safe.
 *
 * Syntax elements: word, [a|b|c], [a|b]?, {name:class}, {name:class?}, ...
 * Slot classes: number, ordinal, word, words, noun, <lexicon id>, agent, unit.
 */
import { isFillerWord } from './normalize.mjs';

/** Quantity unit table: lowercase token -> canonical symbol. */
export const UNIT_TABLE = new Map(Object.entries({
  kg: 'kg', g: 'g', mg: 'mg', t: 't', m: 'm', cm: 'cm', mm: 'mm', km: 'km', l: 'l', ml: 'ml',
  s: 's', sec: 's', min: 'min', h: 'h', n: 'N', j: 'J', w: 'W', pa: 'Pa', hz: 'Hz', k: 'K',
}));

export const BUILTIN_CLASSES = new Set(['number', 'ordinal', 'word', 'words', 'rest', 'noun', 'agent', 'unit', 'recent']);

/** Default and maximum token count of a `words` slot (`{x:words}` = 12, `{x:words(20)}` = 20). */
export const WORDS_DEFAULT_MAX = 12;

/** Longest multi-word lexicon entry a slot can capture (song titles). */
export const LEXICON_MAX_WORDS = 4;

export class PatternError extends Error {}

/**
 * Operator symbols and the words that mean the same: a literal `+` matches the token `plus` (and the reverse), `/` matches
 * `divided by`, `>` matches `greater than`, `%` matches `percent` (spec 03 section 1.7).
 */
export const OP_WORDS = {
  '+': [['plus']], '-': [['minus']], '*': [['times'], ['multiplied', 'by']], '/': [['divided', 'by'], ['divide', 'by']],
  '>': [['greater', 'than'], ['more', 'than'], ['bigger', 'than']], '<': [['less', 'than'], ['fewer', 'than'], ['smaller', 'than']],
  '=': [['equals'], ['equal', 'to']], '%': [['percent']],
};

/** True when the literal word list contains a filler (an old or new filler word, `for me`, `u know`, `like`) or a leading `then` / `so` / `and` / `after that`. */
function listsFiller(words) {
  return words.some((w, k) => isFillerWord(w) || w === 'like' || w === 'then' || w === 'so' || w === 'and' || (w === 'that' && words[k - 1] === 'after') || (w === 'me' && words[k - 1] === 'for') || (w === 'know' && ['u', 'you', 'ya'].includes(words[k - 1])));
}

/**
 * Compile a match string into elements.
 * @returns {{ elements: object[], slots: Map<string, {cls:string, optional:boolean}> }}
 */
export function compilePattern(match) {
  if (typeof match !== 'string' || !match.trim()) throw new PatternError('empty match string');
  const elements = [];
  const slots = new Map();
  for (const part of match.trim().split(/\s+/)) {
    if (part === '...') { elements.push({ t: 'skip' }); continue; }
    if (part === '?') { elements.push({ t: 'q' }); continue; }
    let m;
    if ((m = part.match(/^\{([A-Za-z_]\w*):([\w.-]+?)(?:\(([^()]*)\))?(\?)?\}$/))) {
      const [, name, cls, rawArgs, opt] = m;
      if (slots.has(name)) throw new PatternError(`duplicate slot name '${name}'`);
      const args = rawArgs === undefined ? [] : rawArgs.split(',').map((a) => a.trim());
      if (cls === 'words' && args.length && !(args.length === 1 && /^[1-9]\d*$/.test(args[0]))) throw new PatternError(`words(...) needs one positive number in '${part}'`);
      if (cls === 'recent') {
        if (args.length !== 2) throw new PatternError(`recent(<lexicon>, <agent slot>) needs two arguments in '${part}'`);
        const ag = slots.get(args[1]);
        if (!ag || ag.cls !== 'agent') throw new PatternError(`recent(...) refers to '${args[1]}', which is not an earlier agent slot in '${part}'`);
      } else if (args.length && cls !== 'words') throw new PatternError(`slot class '${cls}' takes no arguments in '${part}'`);
      slots.set(name, { cls, args, optional: !!opt });
      elements.push({ t: 'slot', name, cls, args, optional: !!opt });
      continue;
    }
    if ((m = part.match(/^\[([^\[\]]*)\](\?)?$/))) {
      const alts = m[1].split('|').map((a) => a.split('_').filter(Boolean).map((w) => w.toLowerCase()));
      if (alts.some((a) => a.length === 0)) throw new PatternError(`empty alternative in '${part}'`);
      elements.push({ t: 'alt', alts, optional: !!m[2] });
      continue;
    }
    if (/[\[\]{}|]/.test(part)) throw new PatternError(`malformed element '${part}'`);
    elements.push({ t: 'lit', words: part.split('_').filter(Boolean).map((w) => w.toLowerCase()) });
  }
  const usesFiller = elements.some((e) => (e.t === 'lit' && listsFiller(e.words)) || (e.t === 'alt' && e.alts.some(listsFiller)));
  return { elements, slots, hasQ: elements.some((e) => e.t === 'q'), usesFiller };
}

const isWordish = (t) => t && t.kind !== 'punct' && t.kind !== 'qmark' && !t.filler;

/** Candidate captures of slot class `cls` at tokens[i], in preference order. */
function candidates(el, tokens, i, env, slotsSoFar) {
  const cls = el.cls;
  if (cls === 'recent') {
    // zero-token slot: the item most recently mentioned for an agent (else in the session); none -> no match
    const [lexId, agentSlot] = el.args;
    const who = slotsSoFar[agentSlot]?.agent?.id;
    const item = env.recentItem?.(lexId, who);
    const pos = i > 0 ? tokens[i - 1].end : (tokens[0]?.start ?? 0);
    return item ? [{ len: 0, value: item, text: '', span: [pos, pos] }] : [];
  }
  const t = tokens[i];
  if (!t || (t.filler && cls !== 'recent')) return [];
  const text = (len) => env.text.slice(t.start, tokens[i + len - 1].end);
  const span = (len) => [t.start, tokens[i + len - 1].end];
  switch (cls) {
    case 'number': {
      if (t.kind === 'number') {
        const out = [{ len: 1, value: t.lower, text: t.raw, span: span(1) }];
        // "2nd", "21st": the number with its suffix is one ordinal (tried after the bare number)
        if (t.ordinal != null && tokens[i + 1]?.suffix) out.push({ len: 2, value: t.lower, text: text(2), span: span(2) });
        return out;
      }
      // "a half" (a, half) reads as 0.5
      if (t.kind === 'word' && (t.lower === 'a' || t.lower === 'an') && tokens[i + 1]?.alt === 'half') return [{ len: 2, value: '0.5', text: text(2), span: span(2) }];
      return [];
    }
    case 'ordinal':
      if (t.kind === 'number' && t.ordinal != null && tokens[i + 1]?.suffix) return [{ len: 2, value: t.lower, text: text(2), span: span(2) }];
      return t.kind === 'word' && t.ordinal != null ? [{ len: 1, value: String(t.ordinal), text: t.raw, span: span(1) }] : [];
    case 'word':
      return isWordish(t) ? [{ len: 1, value: t.lower, text: t.raw, span: span(1) }] : [];
    case 'words': {
      const out = [];
      const max = el.args?.[0] ? Number(el.args[0]) : WORDS_DEFAULT_MAX;
      for (let len = 1; len <= max && i + len <= tokens.length && isWordish(tokens[i + len - 1]); len++) {
        out.push({ len, value: text(len), text: text(len), span: span(len), loose: true });
      }
      return out;
    }
    case 'rest': {
      // everything up to the end of the sentence (1 or more tokens): free text for tools such as dictation
      let end = tokens.findIndex((x, k) => k >= i && x.kind === 'qmark');
      if (end < 0) end = tokens.length;
      const len = end - i;
      return len >= 1 && tokens.slice(i, end).every(isWordish) ? [{ len, value: text(len), text: text(len), span: span(len), loose: true }] : [];
    }
    case 'noun': {
      const out = [];
      const lex = env.lex;
      for (let len = 3; len >= 2; len--) {
        if (i + len > tokens.length) continue;
        const ws = tokens.slice(i, i + len);
        if (!ws.every((x) => x.kind === 'word')) continue;
        const lemma = [...ws.slice(0, -1).map((x) => x.lower), lex.lemma(ws[len - 1].lower)].join('_');
        if (lex.nounsMulti.has(lemma)) out.push({ len, value: lemma, text: text(len), span: span(len) });
      }
      if (t.kind === 'word' && t.lower !== "'s") out.push({ len: 1, value: lex.lemma(t.lower), text: t.raw, span: span(1) });
      return out;
    }
    case 'agent': {
      const a = env.resolveAgent(tokens, i);
      return a ? [{ len: 1, value: '$' + a.id, text: t.raw, span: span(1), agent: a }] : [];
    }
    case 'unit': {
      if (t.kind !== 'word') return [];
      const lemma = env.lex.lemma(t.lower);
      if (env.lex.units.has(lemma)) return [{ len: 1, value: lemma, text: t.raw, span: span(1) }];
      if (UNIT_TABLE.has(t.lower)) return [{ len: 1, value: UNIT_TABLE.get(t.lower), text: t.raw, span: span(1) }];
      return [];
    }
    default: {
      const lexicon = env.lex.lexicons.get(cls);
      if (!lexicon) return [];
      const out = [];
      for (let len = LEXICON_MAX_WORDS; len >= 1; len--) {
        if (i + len > tokens.length) continue;
        const ws = tokens.slice(i, i + len);
        if (!ws.every((x) => x.kind === 'word')) continue;
        const entry = [...ws.slice(0, -1).map((x) => x.lower), env.lex.lemma(ws[len - 1].lower)].join('_');
        if (lexicon.words.has(entry)) out.push({ len, value: entry, text: text(len), span: span(len) });
      }
      return out;
    }
  }
}

/**
 * Match a compiled pattern against the whole token list (anchored).
 * `env` = { text, lex, resolveAgent(tokens, i) }.
 * @returns {{ slots: object, literals: number, skips: number } | null}
 */
export function matchTokens(compiled, tokens, env) {
  const els = compiled.elements;
  // a trailing question mark is visible only to patterns that list `?`; the others behave as if it were not there
  const n = tokens.length - (!compiled.hasQ && tokens[tokens.length - 1]?.kind === 'qmark' ? 1 : 0);
  const slots = {};
  let literals = 0, skips = 0;

  /** Token index after matching the literal words at tokens[i], or -1. A token matches by `lower` or by `alt` (the original number word, `u`); operator symbols and their words are one literal. */
  const matchWords = (words, i) => {
    let k = 0, p = i;
    while (k < words.length) {
      const w = words[k], t = p < n ? tokens[p] : null;
      if (t && (t.lower === w || t.alt === w)) { k++; p++; continue; }
      const phrases = OP_WORDS[w];
      if (phrases) {
        const ph = phrases.find((x) => p + x.length <= n && x.every((y, j) => tokens[p + j].lower === y));
        if (ph) { k++; p += ph.length; continue; }
      }
      if (t && t.kind === 'op' && OP_WORDS[t.lower]) {
        const ph = OP_WORDS[t.lower].find((x) => k + x.length <= words.length && x.every((y, j) => words[k + j] === y));
        if (ph) { k += ph.length; p++; continue; }
      }
      return -1;
    }
    return p;
  };

  function run(k, i) {
    if (k === els.length) return i === n;
    const el = els[k];
    if (el.t === 'lit') {
      const e = matchWords(el.words, i);
      if (e < 0) return false;
      literals += el.words.length;
      if (run(k + 1, e)) return true;
      literals -= el.words.length;
      return false;
    }
    if (el.t === 'q') {
      if (tokens[i]?.kind !== 'qmark') return false;
      literals += 1;
      if (run(k + 1, i + 1)) return true;
      literals -= 1;
      return false;
    }
    if (el.t === 'alt') {
      for (const alt of el.alts) {
        const e = matchWords(alt, i);
        if (e < 0) continue;
        literals += alt.length;
        if (run(k + 1, e)) return true;
        literals -= alt.length;
      }
      return el.optional ? run(k + 1, i) : false;
    }
    if (el.t === 'slot') {
      for (const c of candidates(el, tokens, i, env, slots)) {
        slots[el.name] = { class: el.cls, args: el.args, value: c.value, text: c.text, span: c.span, agent: c.agent, tokens: [i, i + c.len] };
        const loose = c.loose ? c.len : 0;
        skips += loose;
        if (run(k + 1, i + c.len)) return true;
        skips -= loose;
        delete slots[el.name];
      }
      return el.optional ? run(k + 1, i) : false;
    }
    // skip: lazy 0..4
    for (let len = 0; len <= 4 && i + len <= n; len++) {
      skips += len;
      if (run(k + 1, i + len)) return true;
      skips -= len;
    }
    return false;
  }

  return run(0, 0) ? { slots: { ...slots }, literals, skips } : null;
}

// ---- prefilter (spec 03 section 2, "Prefilter") ------------------------------------------------------------------------

/** Words that can start a literal word list `words` (a token matches by `lower`, by `alt`, or through the operator table). */
function firstWords(words, into) {
  const w = words[0];
  if (!w) return;
  into.add(w);
  for (const ph of OP_WORDS[w] ?? []) into.add(ph[0]);
}

const needsCache = new WeakMap();
/**
 * Per compiled pattern: for every mandatory literal / alternative group, the set of words one of which must occur among the
 * sentence's tokens (the possible first words of its alternatives). Smallest sets first, so a miss is found early.
 */
export function prefilterNeeds(compiled) {
  let needs = needsCache.get(compiled);
  if (!needs) {
    needs = [];
    for (const el of compiled.elements) {
      if (el.t === 'lit') { const s = new Set(); firstWords(el.words, s); if (s.size) needs.push(s); }
      else if (el.t === 'alt' && !el.optional) {
        const s = new Set();
        for (const alt of el.alts) firstWords(alt, s);
        if (s.size) needs.push(s);
      }
    }
    needs.sort((a, b) => a.size - b.size);
    needsCache.set(compiled, needs);
  }
  return needs;
}

/** The bag of words a token list offers to literals: `lower`, `alt`, and the first words of the operator phrases of an operator token. */
export function wordBag(tokens) {
  const bag = new Set();
  for (const t of tokens) {
    bag.add(t.lower);
    if (t.alt) bag.add(t.alt);
    if (t.kind === 'op') for (const ph of OP_WORDS[t.lower] ?? []) bag.add(ph[0]);
  }
  return bag;
}

/** False only when `matchTokens(compiled, tokens)` is certain to fail: some mandatory literal / group has none of its first words in the bag. */
export function prefilterPasses(compiled, bag) {
  for (const need of prefilterNeeds(compiled)) {
    let hit = false;
    if (need.size <= bag.size) { for (const w of need) if (bag.has(w)) { hit = true; break; } }
    else for (const w of bag) if (need.has(w)) { hit = true; break; }
    if (!hit) return false;
  }
  return true;
}
