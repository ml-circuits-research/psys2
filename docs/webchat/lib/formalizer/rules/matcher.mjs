/**
 * Backtracking pattern matcher (spec 03 section 2). Browser-safe.
 *
 * Syntax elements: word, [a|b|c], [a|b]?, {name:class}, {name:class?}, ...
 * Slot classes: number, word, words, noun, <lexicon id>, agent, unit.
 */

/** Quantity unit table: lowercase token -> canonical symbol. */
export const UNIT_TABLE = new Map(Object.entries({
  kg: 'kg', g: 'g', mg: 'mg', t: 't', m: 'm', cm: 'cm', mm: 'mm', km: 'km', l: 'l', ml: 'ml',
  s: 's', sec: 's', min: 'min', h: 'h', n: 'N', j: 'J', w: 'W', pa: 'Pa', hz: 'Hz', k: 'K',
}));

export const BUILTIN_CLASSES = new Set(['number', 'word', 'words', 'rest', 'noun', 'agent', 'unit']);

export class PatternError extends Error {}

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
    let m;
    if ((m = part.match(/^\{([A-Za-z_]\w*):([\w.-]+?)(\?)?\}$/))) {
      const [, name, cls, opt] = m;
      if (slots.has(name)) throw new PatternError(`duplicate slot name '${name}'`);
      slots.set(name, { cls, optional: !!opt });
      elements.push({ t: 'slot', name, cls, optional: !!opt });
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
  return { elements, slots };
}

const isWordish = (t) => t && t.kind !== 'punct';

/** Candidate captures of slot class `cls` at tokens[i], in preference order. */
function candidates(cls, tokens, i, env) {
  const t = tokens[i];
  if (!t) return [];
  const text = (len) => env.text.slice(t.start, tokens[i + len - 1].end);
  const span = (len) => [t.start, tokens[i + len - 1].end];
  switch (cls) {
    case 'number':
      return t.kind === 'number' ? [{ len: 1, value: t.lower, text: t.raw, span: span(1) }] : [];
    case 'word':
      return isWordish(t) ? [{ len: 1, value: t.lower, text: t.raw, span: span(1) }] : [];
    case 'words': {
      const out = [];
      for (let len = 1; len <= 6 && i + len <= tokens.length && isWordish(tokens[i + len - 1]); len++) {
        out.push({ len, value: text(len), text: text(len), span: span(len), loose: true });
      }
      return out;
    }
    case 'rest': {
      // everything up to the end of the sentence (1 or more tokens): free text for tools such as dictation
      const len = tokens.length - i;
      return len >= 1 && tokens.slice(i).every(isWordish) ? [{ len, value: text(len), text: text(len), span: span(len), loose: true }] : [];
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
      for (let len = 3; len >= 1; len--) {
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
  const n = tokens.length;
  const slots = {};
  let literals = 0, skips = 0;

  const matchWords = (words, i) => {
    if (i + words.length > n) return false;
    for (let k = 0; k < words.length; k++) if (tokens[i + k].lower !== words[k]) return false;
    return true;
  };

  function run(k, i) {
    if (k === els.length) return i === n;
    const el = els[k];
    if (el.t === 'lit') {
      if (!matchWords(el.words, i)) return false;
      literals += el.words.length;
      if (run(k + 1, i + el.words.length)) return true;
      literals -= el.words.length;
      return false;
    }
    if (el.t === 'alt') {
      for (const alt of el.alts) {
        if (!matchWords(alt, i)) continue;
        literals += alt.length;
        if (run(k + 1, i + alt.length)) return true;
        literals -= alt.length;
      }
      return el.optional ? run(k + 1, i) : false;
    }
    if (el.t === 'slot') {
      for (const c of candidates(el.cls, tokens, i, env)) {
        slots[el.name] = { class: el.cls, value: c.value, text: c.text, span: c.span, agent: c.agent, tokens: [i, i + c.len] };
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
