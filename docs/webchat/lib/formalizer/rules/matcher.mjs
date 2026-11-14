/**
 * Backtracking pattern matcher (spec 03 section 2). Browser-safe.
 *
 * Syntax elements: word, [a|b|c], [a|b]?, {name:class}, {name:class?}, ...
 * Slot classes: number, ordinal, word, words, noun, <lexicon id>, agent, unit.
 */
import { isFillerWord } from './normalize.mjs?v=c3e9000200';
import { budget } from '../../dialog/budget.mjs?v=00bce6e369';
import { en } from '../../lang/en.mjs?v=1977201eca';

/** Quantity unit table: lowercase token -> canonical symbol. */
export const UNIT_TABLE = new Map(Object.entries({
  kg: 'kg', g: 'g', mg: 'mg', t: 't', m: 'm', cm: 'cm', mm: 'mm', km: 'km', l: 'l', ml: 'ml',
  s: 's', sec: 's', min: 'min', h: 'h', n: 'N', j: 'J', w: 'W', pa: 'Pa', hz: 'Hz', k: 'K',
}));

export const BUILTIN_CLASSES = new Set(['number', 'ordinal', 'word', 'words', 'rest', 'noun', 'agent', 'unit', 'recent', 'lastagent']);

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
// Personal pronouns are never a noun slot value ("I live in Cluj" is not a fact about an animal called "i").
const PERSONAL_PRONOUNS = en.words('pron', 'matcher');

function listsFiller(words) {
  return words.some((w, k) => isFillerWord(w) || w === 'like' || w === 'then' || w === 'so' || w === 'and' || (w === 'that' && words[k - 1] === 'after') || (w === 'me' && words[k - 1] === 'for') || (w === 'know' && ['u', 'you', 'ya'].includes(words[k - 1])));
}

/**
 * Compile a match string into elements.
 * `phrases` (optional) maps a phrase id to `{ alts }`: `[$id]`, `[$id]?` and `[$id|lit]` expand to the phrase's alternatives
 * (a shared array when the group is only the macro); the macro alternatives come first and count as frame literals (spec 03 section 2.5).
 * @returns {{ elements: object[], slots: Map<string, {cls:string, optional:boolean}> }}
 */
export function compilePattern(match, phrases = null) {
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
      if (cls === 'words' && args.length && !(/^[1-9]\d*$/.test(args[0]) && (args.length === 1 || (args.length === 2 && (args[1] === 'label' || args[1] === 'noun'))))) throw new PatternError(`words(...) needs a positive number, optionally followed by 'label' or 'noun', in '${part}'`);
      if (cls === 'rest' && args.length && !(args.length === 1 && (args[0] === 'notes' || args[0] === 'quotes'))) throw new PatternError(`rest(...) takes only 'notes' or 'quotes' in '${part}'`);
      if (cls === 'recent') {
        if (args.length !== 2) throw new PatternError(`recent(<lexicon>, <agent slot>) needs two arguments in '${part}'`);
        const ag = slots.get(args[1]);
        if (!ag || (ag.cls !== 'agent' && ag.cls !== 'lastagent')) throw new PatternError(`recent(...) refers to '${args[1]}', which is not an earlier agent slot in '${part}'`);
      } else if (args.length && cls !== 'words' && cls !== 'rest') throw new PatternError(`slot class '${cls}' takes no arguments in '${part}'`);
      slots.set(name, { cls, args, optional: !!opt });
      elements.push({ t: 'slot', name, cls, args, optional: !!opt });
      continue;
    }
    if ((m = part.match(/^\[([^\[\]]*)\](\?)?$/))) {
      const raw = m[1].split('|');
      const macroIds = raw.filter((a) => a.startsWith('$')).map((a) => a.slice(1));
      const lits = raw.filter((a) => !a.startsWith('$')).map((a) => a.split('_').filter(Boolean).map((w) => w.toLowerCase()));
      if (lits.some((a) => a.length === 0) || macroIds.some((a) => !a)) throw new PatternError(`empty alternative in '${part}'`);
      if (!macroIds.length) { elements.push({ t: 'alt', alts: lits, optional: !!m[2], order: null }); continue; }
      const tables = macroIds.map((id) => {
        const ph = phrases?.get(id);
        if (!ph) throw new PatternError(`unknown phrase '$${id}' in '${part}'`);
        return ph;
      });
      // frame phrases first (they count as frame literals), then content phrases (`frame=false`), then the inline literals
      const ordered = [...tables.filter((p) => p.frame !== false), ...tables.filter((p) => p.frame === false)];
      const alts = ordered.length === 1 && !lits.length ? ordered[0].alts : [...ordered.flatMap((p) => p.alts), ...lits];
      elements.push({ t: 'alt', alts, optional: !!m[2], order: null, frameN: tables.reduce((n, p) => n + (p.frame === false ? 0 : p.alts.length), 0), macros: macroIds });
      continue;
    }
    if (/[\[\]{}|]/.test(part)) throw new PatternError(`malformed element '${part}'`);
    elements.push({ t: 'lit', words: part.split('_').filter(Boolean).map((w) => w.toLowerCase()) });
  }
  // an alternative group directly before a free capture tries its longer alternatives first ("rename yourself to" before "rename yourself"),
  // so a frame word never falls into the capture; elsewhere the written order stays (it can matter: "a" before "a few" with a number slot)
  elements.forEach((e, k) => { if (e.t === 'alt' && elements[k + 1]?.t === 'slot' && elements[k + 1].cls === 'rest') e.order = byLength(e.alts); });
  const usesFiller = elements.some((e) => (e.t === 'lit' && listsFiller(e.words)) || (e.t === 'alt' && e.alts.some(listsFiller)));
  return { elements, slots, hasQ: elements.some((e) => e.t === 'q'), usesFiller };
}

/** Indexes of `alts` by descending word count (stable). */
const byLength = (alts) => alts.map((a, k) => k).sort((x, y) => alts[y].length - alts[x].length || x - y);

/** Guards of free-text slots: `rest(notes)` only music words, `words(N,label)` no pronoun or possessive. */
const NOTE_WORDS = new Set(('a b c d e f g sharp flat natural rest pause break half quarter eighth sixteenth whole dotted double triple twice thrice then and for beat beats '
  + 'octave up down high low higher lower note notes sec second seconds time times x again once end the my melody middle').split(' '));
const NOTE_RE = /^[a-g](?:#|b)?\d*$/;
const isNoteToken = (t) => t.kind === 'number' || (t.kind === 'word' && (NOTE_WORDS.has(t.lower) || NOTE_RE.test(t.lower)));
const SELF_WORDS = new Set(['you', 'your', 'yours', 'yourself', 'my', 'mine', 'me', 'myself', 'i', 'our', 'we', 'his', 'her', 'its', 'their', 'it', 'them']);
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
  if (cls === 'lastagent') {
    // zero-token slot: the agent mentioned most recently (RP3: "One flies away" after "Tom has 10 bees"); none -> no match
    const a = env.lastAgent?.();
    const pos = i > 0 ? tokens[i - 1].end : (tokens[0]?.start ?? 0);
    return a ? [{ len: 0, value: '$' + a.id, text: '', span: [pos, pos], agent: a }] : [];
  }
  const t = tokens[i];
  if (!t || (t.filler && cls !== 'recent')) return [];
  // textOverride: a token the expansion changed (one-anaphora singular noun). A token list the expansion rewrote (verb and determiner of the anchor, the new modifiers, the anchor's noun) is not a slice
  // of the source: its offsets run backwards, so the text of the slot is the words of the tokens ("draw a green one" -> thing "green house", not "").
  const text = (len) => {
    if (len === 1 && t.textOverride != null) return t.textOverride;
    for (let k = 1; k < len; k++) { const a = tokens[i + k - 1], b = tokens[i + k]; if (a.synth || b.synth || b.start < a.end) return tokens.slice(i, i + len).map((x) => x.textOverride ?? x.raw ?? x.lower).join(' '); }
    return env.text.slice(t.start, tokens[i + len - 1].end);
  };
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
      const label = el.args?.[1] === 'label' || el.args?.[1] === 'noun';
      if (el.args?.[1] === 'noun' && (t.lower === 'to' || t.lower === 'very' || t.lower === 'much')) return [];   // words(N,noun): a noun phrase, never an infinitive ("to draw a cat")
      for (let len = 1; len <= max && i + len <= tokens.length && isWordish(tokens[i + len - 1]); len++) {
        if (label && SELF_WORDS.has(tokens[i + len - 1].lower)) break;
        out.push({ len, value: text(len), text: text(len), span: span(len), loose: true });
      }
      return out;
    }
    case 'rest': {
      // everything up to the end of the sentence (1 or more tokens): free text for tools such as dictation
      let end = tokens.findIndex((x, k) => k >= i && x.kind === 'qmark');
      if (end < 0) end = tokens.length;
      const len = end - i;
      if (el.args?.[0] === 'notes' && !tokens.slice(i, end).every(isNoteToken)) return [];
      if (!(len >= 1 && tokens.slice(i, end).every(isWordish))) return [];
      if (el.args?.[0] !== 'quotes') return [{ len, value: text(len), text: text(len), span: span(len), loose: true }];
      // rest(quotes): free text keeps the quotes and the closing punctuation around it ("Hello there." said the fox)
      let a = t.start, b = tokens[end - 1].end;
      while (a > 0 && /["\u201C\u2018(\[]/.test(env.text[a - 1])) { budget.tick('matcher.span'); a--; }
      const close = /^(?:[.!?\u2026]*["\u201D\u2019)\]])+/.exec(env.text.slice(b));   // closing quotes and brackets, with the punctuation before them
      if (close) b += close[0].length;
      const full = env.text.slice(a, b);
      return [{ len, value: full, text: full, span: span(len), loose: true }];
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
      if (t.kind === 'word' && t.lower !== "'s" && !PERSONAL_PRONOUNS.has(t.lower)) out.push({ len: 1, value: lex.lemma(t.lower), text: t.raw, span: span(1) });
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
        if (!ws.every((x, k) => x.kind === 'word' || (lexicon.class === 'counted' && x.kind === 'number' && k < len - 1 && /^\d+$/.test(x.lower)))) continue;   // class=counted: a count may open an entry ("2_chapter": "two chapters")
        const entry = [...ws.slice(0, -1).map((x) => x.lower), env.lex.lemma(ws[len - 1].lower)].join('_');
        if (lexicon.words.has(entry)) out.push({ len, value: entry, text: text(len), span: span(len) });
        else { const raw = ws.map((x) => x.lower).join('_'); if (raw !== entry && lexicon.words.has(raw)) out.push({ len, value: raw, text: text(len), span: span(len) }); }   // a word the lexicon lists in its own form ("canvas", "glasses") that the singular lemma would cut
      }
      return out;
    }
  }
}

/**
 * Match a compiled pattern against the whole token list (anchored).
 * `env` = { text, lex, resolveAgent(tokens, i) }.
 * `literals` counts every matched literal word; `frameLiterals` (<= literals) the ones that came from phrase macros.
 * @returns {{ slots: object, literals: number, skips: number, frameLiterals: number } | null}
 */
function matchTokensRaw(compiled, tokens, env) {
  budget.tick('matcher.attempt');
  const els = compiled.elements;
  // a trailing question mark is visible only to patterns that list `?`; the others behave as if it were not there
  const n = tokens.length - (!compiled.hasQ && tokens[tokens.length - 1]?.kind === 'qmark' ? 1 : 0);
  const slots = {};
  let literals = 0, skips = 0, frameLiterals = 0;

  /** Token index after matching the literal words at tokens[i], or -1. A token matches by `lower` or by `alt` (the original number word, `u`); operator symbols and their words are one literal. */
  const matchWords = (words, i) => {
    let k = 0, p = i;
    // every pass that does not return advances k by at least 1 (the phrases of OP_WORDS are not empty), so a counting guard of words.length passes is exact and
    // lets the loop guard see it is finite without a tick on this very hot path
    for (let pass = 0; pass < words.length && k < words.length; pass++) {
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

  /** True when some alternative of the optional group `el` matches (non-empty) at tokens[i] and what follows it could end the sentence. */
  const matchWords0 = (el, i) => el.alts.some((alt) => { const e = matchWords(alt, i); return e > 0 && e === n; });

  function run(k, i) {
    budget.tick('matcher.backtrack');
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
      for (const a of el.order ?? el.alts.keys()) {
        const alt = el.alts[a];
        const e = matchWords(alt, i);
        if (e < 0) continue;
        const fr = a < (el.frameN ?? 0) ? alt.length : 0;
        literals += alt.length;
        frameLiterals += fr;
        if (run(k + 1, e)) return true;
        literals -= alt.length;
        frameLiterals -= fr;
      }
      return el.optional ? run(k + 1, i) : false;
    }
    if (el.t === 'slot') {
      let cands = candidates(el, tokens, i, env, slots);
      // a free capture stops before an optional suffix that follows it ("Zed from now on", "Bolt please"): the shorter capture with the suffix wins
      const nx = els[k + 1];
      if (el.cls === 'rest' && nx?.t === 'alt' && nx.optional && cands.length) {
        const c0 = cands[0], all = [];
        for (let len = c0.len; len >= 1; len--) {
          const e = matchWords0(nx, i + len);
          if (len === c0.len ? false : e) all.push({ ...c0, len, text: env.text.slice(tokens[i].start, tokens[i + len - 1].end), value: env.text.slice(tokens[i].start, tokens[i + len - 1].end), span: [tokens[i].start, tokens[i + len - 1].end] });
        }
        cands = [...all.slice(0, 1), ...cands];
      }
      for (const c of cands) {
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

  return run(0, 0) ? { slots: { ...slots }, literals, skips, frameLiterals } : null;
}

/** The fields of a token that a match can depend on (positions index `env.text`). */
const tokenKey = (t) => `${t.start},${t.end},${t.lower},${t.alt ?? ''},${t.kind},${t.raw},${t.ordinal ?? ''},${t.filler ? 1 : 0},${t.textOverride ?? ''}`;

/**
 * `matchTokensRaw` with a per-formalize memo (COMPUTE-BUDGET C): the same pattern is matched against the same token view many times in one
 * turn (clause splitting, expansion, leniency and spelling variants re-read the same sentence). A result is reused only when the match did not
 * consult the dialogue state (`env.touched` counts calls of resolveAgent / lastAgent / recentItem), so it is a pure function of pattern, tokens and text.
 */
export function matchTokens(compiled, tokens, env) {
  const memo = env.matchMemo;
  if (!memo) return matchTokensRaw(compiled, tokens, env);
  let tk = memo.keys.get(tokens);
  if (tk === undefined) { tk = tokens.map(tokenKey).join('|'); memo.keys.set(tokens, tk); }
  let per = memo.byPattern.get(compiled);
  if (!per) memo.byPattern.set(compiled, (per = new Map()));
  if (per.has(tk)) { const r = per.get(tk); return r && { ...r, slots: Object.fromEntries(Object.entries(r.slots).map(([k, v]) => [k, { ...v }])) }; }
  const before = env.touched;
  const r = matchTokensRaw(compiled, tokens, env);
  if (env.touched === before) per.set(tk, r && { ...r, slots: Object.fromEntries(Object.entries(r.slots).map(([k, v]) => [k, { ...v }])) });
  return r;
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
