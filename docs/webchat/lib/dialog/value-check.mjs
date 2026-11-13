/**
 * Value checker of the seq2seq normalizer (spec 03 section 7.12, ADR-002 idea: a translation must not change the values of the text).
 * Browser-safe, no dependencies beyond the formalizer helpers.
 *
 * A normalized phrasing `cand` of the piece `src` is accepted only when it keeps what the user said:
 *   - typed values are extracted first (signed numbers, decimals "1.5" / "1,5", thousands, times "7:30" / "7 pm", note names "C#", ordinals, number words,
 *     spoken signs "minus 5") and compared AS VALUES, never as word tokens: "-45.5 25.3" is not "45.5 25.3", "1.5" is not "1 5";
 *   - numbers: the multiset of numeric values is equal; adjacent numbers (coordinates) keep their order; "A minus B" / "subtract B from A" / "A divided by B"
 *     keep their operand order; a number followed by a unit keeps its unit;
 *   - role bindings: "from X to Y" keeps X as source and Y as destination; a colour stays bound to the part it describes ("eyes red and body blue");
 *   - colours: the set of colour words is equal;
 *   - negation: both or neither carry a negation (not, no, never, without, n't forms, nothing, none, stop/undo/cancel are NOT negations here);
 *   - quoted strings: every quoted string of the source is in the candidate and the candidate adds none;
 *   - names and other content words that the world does not know (so they are values, not rule words: a name, a title, a typo of one):
 *     every such word of the source has a counterpart in the candidate (equal or within the spelling budget), and every such word
 *     of the candidate has a counterpart in the source. A word the world knows may be dropped or added (that is the point of simplifying).
 * `{ ok, reason }`; with `vocab` absent only the first four checks run.
 */
import { isNumberWord, parseNumberRun } from '../formalizer/rules/numbers.mjs?v=616917393c';
import { editDistance } from '../formalizer/rules/normalize.mjs?v=5de885797a';
import { FUNCTION_WORDS, ABBREVIATIONS, spellBudget } from '../formalizer/spell.mjs?v=afd08aaa2b';
import { budget } from './budget.mjs?v=123c3e1329';

export const COLORS = new Set('red orange yellow green blue purple violet pink brown black white gray grey gold golden silver cyan magenta turquoise beige navy teal maroon lime lilac indigo tan rose peach crimson scarlet azure'.split(' '));
const NEG = new Set("not no never without nothing none nobody nowhere neither nor cannot cant dont doesnt didnt isnt arent wasnt werent wont wouldnt shouldnt couldnt hasnt havent hadnt aint don't doesn't didn't isn't aren't wasn't weren't won't wouldn't shouldn't couldn't hasn't haven't hadn't can't ain't".split(/\s+/));
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const QUOTE_RE = /"([^"]*)"|“([^”]*)”/g;
const ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: 'last', next: 'next' };

/** Chat fillers and abbreviations: never values. */
const FILLERS = new Set([...Object.keys(ABBREVIATIONS), ...'lol haha hehe lmao yo yep yup nope hmm hm um uh er ah oh ok okay yeah so well like kinda sorta stuff thing things maybe actually basically really simply just kindly asap'.split(' ')]);
const NOT_A_NUMBER_BEFORE = new Set('the which this that each every another any my your his her their our a an no new old next last first big small little red green blue yellow pink black white one'.split(' '));

const lc = (s) => s.toLowerCase().replace(/’/g, "'");
const stripQuotes = (t) => t.replace(QUOTE_RE, ' ');

// ---- typed values (extracted BEFORE word tokenization, so "-45.5", "1.5", "7:30", "C#" are values, not words) ------------------------------
const TIME_RE = String.raw`(?<![\w.:])(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?([ap])\.?m\.?(?!\w))?(?![\w:])|(?<![\w.:])(\d{1,2})\s?([ap])\.?m\.?(?!\w)`;
const NOTE_RE = String.raw`(?<![\w#♯♭])([A-Ga-g])([#♯♭]|b(?![a-z]))(\d)?(?![\w#♯♭])|(?<![\w#♯♭])([A-G])(\d)(?![\w])`;
const NUM_RE = String.raw`(?<![\w])([-+−–])?(?:(\d{1,3}(?:,\d{3})+(?:\.\d+)?)|(\d+\.\d+)|(?:(?<!\d,)(\d+,\d{1,2})(?!\d)(?!,\d))|(\d+)|(?<![\w.])(\.\d+))(?:(st|nd|rd|th)(?!\w))?(?!\d)`;
const TYPED = new RegExp(`${TIME_RE}|${NOTE_RE}|${NUM_RE}`, 'giu');
const num = (x) => { const n = Number(x); return Object.is(n, -0) ? '0' : String(n); };
const NEGATIVE_WORDS = new Set(['minus', 'negative']);
const OP_WORDS = new Set(['minus', 'plus', 'times', 'divided', 'over', 'by', 'and', 'or', 'from', 'to']);

/** Preprocess operator symbols between numbers: "10 - 3" -> "10 minus 3", "20 / 4" and "20 ÷ 4" -> "20 divided by 4". */
const symbolsToWords = (t) => t.replace(/(\d)\s+[-−–]\s+(?=\d)/g, '$1 minus ').replace(/(\d)\s+\/\s+(?=\d)|(\d)\s*÷\s*(?=\d)/g, (m, a, b) => `${a ?? b} divided by `);

/**
 * The ordered stream of a text outside quotes: typed values first ({ k: 'n' number | 't' time | 'note' }), then words ({ k: 'w' }); number words and
 * ordinals become numbers, "minus"/"negative" before a number that is not an operand become a sign.
 */
export function streamOf(text) {
  const t = symbolsToWords(stripQuotes(text));
  const raw = [];   // { k, v, start, end }
  let last = 0;
  const words = (from, to) => { for (const m of t.slice(from, to).matchAll(WORD_RE)) raw.push({ k: 'w', w: lc(m[0]), cap: from + m.index > 0 && /^\p{Lu}/u.test(m[0]), start: from + m.index, end: from + m.index + m[0].length }); };
  for (const m of t.matchAll(TYPED)) {
    words(last, m.index);
    last = m.index + m[0].length;
    let it;
    if (m[1] !== undefined || m[4] !== undefined) {   // time
      let h = Number(m[1] ?? m[4]); const mi = m[2] ?? '00'; const ap = (m[3] ?? m[5] ?? '').toLowerCase();
      if (ap === 'p' && h < 12) h += 12; else if (ap === 'a' && h === 12) h = 0;
      it = { k: 't', v: `t${h}:${mi}` };
    } else if (m[6] !== undefined || m[9] !== undefined) {   // note name
      const letter = (m[6] ?? m[9]).toUpperCase(); const acc = m[7] === undefined ? '' : m[7].replace(/b|♭/, 'b').replace('♯', '#');
      it = { k: 'note', v: `n${letter}${acc}${m[8] ?? m[10] ?? ''}` };
    } else {   // number: m[11] sign, m[12] thousands, m[13] dot decimal, m[14] comma decimal, m[15] integer, m[16] .5, m[17] ordinal suffix
      const body = m[12] ? m[12].replace(/,/g, '') : m[14] ? m[14].replace(',', '.') : (m[13] ?? m[15] ?? `0${m[16]}`);
      if (m[17]) it = { k: 'n', v: `o${Number(body)}`, ord: true };
      else { const sign = m[11] && /[-−–]/.test(m[11]) ? '-' : ''; it = { k: 'n', v: num(`${sign}${body}`), signed: !!sign }; }
    }
    raw.push({ ...it, start: m.index, end: last });
  }
  words(last, t.length);
  raw.sort((a, b) => a.start - b.start);
  const out = [];
  const ws = raw.map((x) => (x.k === 'w' ? x.w : '\u0001'));
  for (let i = 0; i < raw.length; i++) {
    budget.tick('value-check.words');
    const x = raw[i];
    if (x.k !== 'w') { out.push({ ...x }); continue; }
    const w = x.w;
    if (w in ORDINAL && typeof ORDINAL[w] === 'number') { out.push({ k: 'n', v: `o${ORDINAL[w]}`, ord: true, start: x.start, end: x.end }); continue; }
    if (w === 'one' && i > 0 && NOT_A_NUMBER_BEFORE.has(ws[i - 1])) { out.push(x); continue; }   // the pronoun ("the red one", "which one")
    if (isNumberWord(w)) {
      const run = parseNumberRun(ws, i);
      if (run) { out.push({ k: 'n', v: num(run.value), start: x.start, end: raw[i + run.length - 1].end }); i += run.length - 1; continue; }
    }
    if (/\d/.test(w)) { out.push({ k: 'n', v: w, mixed: true, start: x.start, end: x.end }); continue; }   // mixed tokens such as g1, a4: kept verbatim
    out.push(x);
  }
  // spoken sign: "minus 5" / "negative five" where the sign word is not an operator (no number right before it)
  const res = [];
  for (let i = 0; i < out.length; i++) {
    budget.tick('value-check.words2');
    const x = out[i], nx = out[i + 1];
    if (x.k === 'w' && NEGATIVE_WORDS.has(x.w) && nx && nx.k === 'n' && !nx.ord && !nx.mixed && !nx.v.startsWith('-') && (x.w === 'negative' || !(res.at(-1)?.k === 'n'))) {
      res.push({ ...nx, v: num(`-${nx.v}`), start: x.start }); i++; continue;
    }
    res.push(x);
  }
  return res;
}

/** Sorted list of the numeric values of a text (digits, number words, ordinals as `o1`..). Signed and decimal values are single values. */
export function numbersOf(text) {
  return streamOf(text).filter((x) => x.k === 'n').map((x) => x.v).sort();
}
/** Sorted list of the other typed values: times (`t19:30`) and note names (`nC#4`). */
export function typedValuesOf(text) {
  return streamOf(text).filter((x) => x.k === 't' || x.k === 'note').map((x) => x.v).sort();
}

/** Runs of adjacent numbers (separated only by blanks or commas): coordinates, ranges. Order inside a run matters. */
function numberRuns(text, st = streamOf(text)) {
  const t = symbolsToWords(stripQuotes(text));
  const runs = []; let cur = null;
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    if (x.k !== 'n' && x.k !== 't') { cur = null; continue; }
    const prev = st[i - 1];
    if (cur && prev && (prev.k === 'n' || prev.k === 't') && /^[\s,]*$/.test(t.slice(prev.end, x.start))) cur.push(x.v);
    else { cur = [x.v]; runs.push(cur); }
  }
  return runs.filter((r) => r.length > 1).map((r) => r.join(' ')).sort();
}

const ARTICLES = new Set('the a an my our your this that these those some'.split(' '));
const stemOf = (w) => w.replace(/(?:ies|es|s)$/, '');
const entity = (x) => (x.k === 'w' ? stemOf(x.w) : x.v);
/** Operation facts: "3 minus 10", "subtract 3 from 10", "20 divided by 4", "divide 20 by 4" -> `sub:A:B` / `div:A:B` (A first operand). */
function opFacts(st) {
  const facts = [];
  const isN = (x) => x && x.k === 'n';
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    if (isN(x) && st[i + 1]?.w === 'minus' && isN(st[i + 2])) facts.push(`sub:${x.v}:${st[i + 2].v}`);
    else if (isN(x) && st[i + 1]?.w === 'divided' && st[i + 2]?.w === 'by' && isN(st[i + 3])) facts.push(`div:${x.v}:${st[i + 3].v}`);
    else if (x.w === 'divide' && isN(st[i + 1]) && st[i + 2]?.w === 'by' && isN(st[i + 3])) facts.push(`div:${st[i + 1].v}:${st[i + 3].v}`);
    else if ((x.w === 'subtract' || (x.w === 'take' && st[i + 1]?.w !== 'away')) && isN(st[i + 1]) && st[i + 2]?.w === 'from' && isN(st[i + 3])) facts.push(`sub:${st[i + 3].v}:${st[i + 1].v}`);
  }
  return facts.sort();
}

/** True when the filler of `cue` in the stream is an entity (a typed value, a mixed token such as e2, or a capitalized name), not a verb of an infinitive. */
function entityBound(st, cue, h) {
  for (let i = 0; i < st.length; i++) {
    if (st[i].k !== 'w' || st[i].w !== cue) continue;
    let j = i + 1;
    while (st[j]?.k === 'w' && (ARTICLES.has(st[j].w) || FILLERS.has(st[j].w) || st[j].w === 'please')) { budget.tick('value-check.entityBound'); j++; }
    if (st[j] && entity(st[j]) === h && (st[j].k !== 'w' || st[j].cap)) return true;
  }
  return false;
}
const ROLE_CUES = new Set(['from', 'to', 'into', 'onto', 'towards', 'toward']);
/** Role bindings of source/destination: cue -> the entity right after it (articles skipped). */
function cueBindings(st) {
  const out = [];
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    if (x.k !== 'w' || !ROLE_CUES.has(x.w)) continue;
    let j = i + 1;
    while (st[j]?.k === 'w' && (ARTICLES.has(st[j].w) || FILLERS.has(st[j].w) || st[j].w === 'please')) { budget.tick('value-check.cueBindings'); j++; }
    if (st[j]) out.push([x.w === 'toward' || x.w === 'towards' || x.w === 'into' || x.w === 'onto' ? 'to' : x.w, entity(st[j])]);
  }
  return out;
}
const UNIT_OF = { minute: 'minute', minutes: 'minute', min: 'minute', mins: 'minute', second: 'second', seconds: 'second', sec: 'second', secs: 'second', hour: 'hour', hours: 'hour', hr: 'hour', hrs: 'hour', day: 'day', days: 'day', week: 'week', weeks: 'week', month: 'month', months: 'month', year: 'year', years: 'year',
  degree: 'degree', degrees: 'degree', percent: 'percent', pixel: 'pixel', pixels: 'pixel', px: 'pixel', meter: 'meter', meters: 'meter', metre: 'meter', metres: 'meter', m: 'meter', km: 'km', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', cm: 'cm', centimeter: 'cm', centimeters: 'cm', mm: 'mm', kg: 'kg', kilogram: 'kg', kilograms: 'kg', gram: 'gram', grams: 'gram', g: 'gram', liter: 'liter', liters: 'liter', litre: 'liter', litres: 'liter', ml: 'ml', mile: 'mile', miles: 'mile', euro: 'euro', euros: 'euro', dollar: 'dollar', dollars: 'dollar', hz: 'hz', bpm: 'bpm', ms: 'ms' };
/** (value, unit) pairs: a number directly followed by a unit word. */
function unitBindings(st) {
  const out = [];
  for (let i = 0; i < st.length - 1; i++) if (st[i].k === 'n' && st[i + 1].k === 'w' && UNIT_OF[st[i + 1].w]) out.push(`${st[i].v} ${UNIT_OF[st[i + 1].w]}`);
  return out.sort();
}
/** Colour -> the noun it describes: the content word right after (red eyes) or, else, right before (eyes red) the colour group. */
function colourBindings(st) {
  const out = [];
  const isNoun = (x) => x && x.k === 'w' && !FUNCTION_WORDS.has(x.w) && !COLORS.has(x.w) && !OP_WORDS.has(x.w);
  for (let i = 0; i < st.length; i++) {
    budget.tick('value-check.isNoun');
    if (!(st[i].k === 'w' && COLORS.has(st[i].w))) continue;
    let end = i;   // colour group: "red and blue", "red, blue"
    while ((st[end + 1]?.w === 'and' || st[end + 1]?.w === 'or') && COLORS.has(st[end + 2]?.w)) { budget.tick('value-check.isNoun2'); end += 2; }
    let noun = isNoun(st[end + 1]) ? st[end + 1] : null;
    if (!noun) { for (let j = i - 1; j >= 0 && j >= i - 3; j--) { if (st[j].k !== 'w' || COLORS.has(st[j].w)) break; if (isNoun(st[j])) { noun = st[j]; break; } } }
    if (noun) for (let c = i; c <= end; c += 2) out.push([st[c].w, stemOf(noun.w)]);
    i = end;
  }
  return out;
}
const sameBag = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
/** Pairs [attr, host]: for every host that occurs in both texts (as a host, or anywhere), the attributes bound to it must be equal. Returns the first conflict or null. */
function bindingConflict(bs, bc, anyS, anyC) {
  const hosts = new Set([...bs.map((x) => x[1]), ...bc.map((x) => x[1])]);
  for (const h of hosts) {
    if (!(anyS.has(h) && anyC.has(h))) continue;
    const a = bs.filter((x) => x[1] === h).map((x) => x[0]), c = bc.filter((x) => x[1] === h).map((x) => x[0]);
    if (!sameBag([...new Set(a)], [...new Set(c)])) return `${h}: ${a.join('/') || 'none'} vs ${c.join('/') || 'none'}`;
  }
  return null;
}
/** Roles: operand order, source/destination, units, colour-property bindings. Returns a reason or null. */
function roleConflict(src, cand) {
  const ss = streamOf(src), sc = streamOf(cand);
  const fs = opFacts(ss), fc = opFacts(sc);
  if (fs.length !== fc.length || fs.some((x, i) => x !== fc[i])) return `operation or operand order differs (${fs.join(' ') || 'none'} vs ${fc.join(' ') || 'none'})`;
  const us = unitBindings(ss), uc = unitBindings(sc);   // a dropped or misspelled unit is not a conflict; the same value with another unit is
  for (const x of us) { const [v] = x.split(' '); const other = uc.filter((y) => y.split(' ')[0] === v); if (other.length && !other.includes(x) && !us.some((y) => other.includes(y))) return `units differ (${us.join(', ')} vs ${uc.join(', ')})`; }
  const rs = numberRuns(src, ss), rc = numberRuns(cand, sc);
  if (!fs.length) {   // without an operation the order of the numbers is the order of the roles (coordinates, "x 10 y 20")
    const seq = (st) => st.filter((x) => x.k === 'n' || x.k === 't').map((x) => x.v).join(' ');
    if (seq(ss) !== seq(sc)) return `order of numbers differs (${seq(ss)} vs ${seq(sc)})`;
  } else if (!sameBag(rs, rc)) return `order of adjacent numbers differs (${rs.join(' | ')} vs ${rc.join(' | ')})`;
  const anyS = new Set(ss.map(entity)), anyC = new Set(sc.map(entity));
  const cs = cueBindings(ss), cc = cueBindings(sc);
  // source/destination: a value bound to "from" must not become bound to "to" (or the reverse); an entity (typed value, capitalized name) bound to a cue stays bound to it
  for (const [cue, h] of cs) {
    const other = cue === 'from' ? 'to' : 'from';
    if (cc.some((x) => x[0] === other && x[1] === h) && !cc.some((x) => x[0] === cue && x[1] === h)) return `"${cue}" and "${other}" are swapped (${h})`;
    if (entityBound(ss, cue, h) && cc.some((x) => x[0] === cue) && anyC.has(h) && !cc.some((x) => x[0] === cue && x[1] === h)) return `"${cue}" is bound to a different value (${h})`;
  }
  const conflict = bindingConflict(colourBindings(ss), colourBindings(sc), anyS, anyC);
  if (conflict) return `colour bound to a different part (${conflict})`;
  return null;
}

const coloursOf = (text) => new Set([...stripQuotes(text).matchAll(WORD_RE)].map((m) => lc(m[0])).filter((w) => COLORS.has(w)));
const hasNegation = (text) => [...stripQuotes(text).matchAll(WORD_RE)].some((m) => NEG.has(lc(m[0])) || /n't$/.test(lc(m[0])));
const quotesOf = (text) => [...text.matchAll(QUOTE_RE)].map((m) => lc((m[1] ?? m[2] ?? '').trim())).sort();
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Words that are values: unknown to the world vocabulary, not function words, not numbers/colours (those are checked separately). */
function valueWords(text, vocab) {
  return [...stripQuotes(text).matchAll(WORD_RE)].map((m) => lc(m[0])).filter((w) => w.length >= 2 && !/\d/.test(w) && !FUNCTION_WORDS.has(w) && !FILLERS.has(w) && !COLORS.has(w) && !isNumberWord(w) && !vocab.has(w) && !vocab.has(w.replace(/(?:'s|s|es)$/, '')));
}
const close = (a, b) => a === b || editDistance(a, b, spellBudget(a.length >= b.length ? a : b)) <= spellBudget(a.length >= b.length ? a : b);

/** Pairs of opposite words (a rewrite may not introduce one that the user did not say: "make it small" is not "make it big"). */
const OPPOSITES = [['big', 'small'], ['bigger', 'smaller'], ['large', 'little'], ['up', 'down'], ['left', 'right'], ['top', 'bottom'], ['on', 'off'], ['open', 'close'], ['start', 'stop'], ['yes', 'no'], ['next', 'previous'],
  ['first', 'last'], ['more', 'less'], ['add', 'remove'], ['add', 'delete'], ['show', 'hide'], ['increase', 'decrease'], ['faster', 'slower'], ['fast', 'slow'], ['louder', 'quieter'], ['before', 'after'], ['north', 'south'], ['east', 'west'],
  ['in', 'out'], ['forward', 'back'], ['full', 'empty'], ['win', 'lose'], ['black', 'white'], ['long', 'short'], ['high', 'low'], ['higher', 'lower'], ['plus', 'minus'], ['times', 'divided'], ['multiply', 'divide'], ['biggest', 'smallest'], ['highest', 'lowest'], ['best', 'worst']];
const OPPOSITE = new Map();
for (const [a, b] of OPPOSITES) { (OPPOSITE.get(a) ?? OPPOSITE.set(a, new Set()).get(a)).add(b); (OPPOSITE.get(b) ?? OPPOSITE.set(b, new Set()).get(b)).add(a); }
/** Words a rewrite may add without a counterpart in the piece (generic request frames). */
const ADDABLE = new Set('add show list make tell give get what how who which where when why name count do is are does has have want let me please can could would the a an it'.split(' '));
const stem = (w) => w.replace(/(?:ies|es|s|ed|ing|er|est)$/, '');
const contentWords = (text) => [...stripQuotes(text).matchAll(WORD_RE)].map((m) => lc(m[0])).filter((w) => w.length >= 2 && !FUNCTION_WORDS.has(w) && !FILLERS.has(w) && !isNumberWord(w) && !/\d/.test(w));

/** Check `cand` against the original `src`. `vocab`: the candidate world's vocabulary (worldVocabulary); optional. */
export function checkValues(src, cand, { vocab = null, lost = 'unknown', grounded = false, keepKnown = false, polarity = false } = {}) {
  const ns = numbersOf(src), nc = numbersOf(cand);
  if (!sameList(ns, nc)) return { ok: false, reason: `numbers differ (${ns.join(' ') || 'none'} vs ${nc.join(' ') || 'none'})` };
  const cs = coloursOf(src), cc = coloursOf(cand);
  if (cs.size !== cc.size || [...cs].some((c) => !cc.has(c))) return { ok: false, reason: `colours differ (${[...cs].join(' ') || 'none'} vs ${[...cc].join(' ') || 'none'})` };
  if (hasNegation(src) !== hasNegation(cand)) return { ok: false, reason: 'negation differs' };
  const qs = quotesOf(src), qc = quotesOf(cand);
  if (!sameList(qs, qc)) return { ok: false, reason: 'quoted text differs' };
  const ts = typedValuesOf(src), tc = typedValuesOf(cand);
  if (!sameList(ts, tc)) return { ok: false, reason: `typed values differ (${ts.join(' ') || 'none'} vs ${tc.join(' ') || 'none'})` };
  const role = roleConflict(src, cand);
  if (role) return { ok: false, reason: role };
  if (vocab) {
    const vs = valueWords(src, vocab), vc = valueWords(cand, vocab);
    const allS = [...stripQuotes(src).matchAll(WORD_RE)].map((m) => lc(m[0])), allC = [...stripQuotes(cand).matchAll(WORD_RE)].map((m) => lc(m[0]));   // a typo of a known word has its counterpart among ALL words
    const caps = lost === 'capitalized' ? new Set([...stripQuotes(src).matchAll(WORD_RE)].filter((m) => m.index > 0 && /^\p{Lu}/u.test(m[0])).map((m) => lc(m[0]))) : null;
    const gone = vs.find((w) => (!caps || caps.has(w)) && !allC.some((x) => close(w, x)));
    if (gone) return { ok: false, reason: `value word "${gone}" is not in the rewrite` };
    const added = vc.find((x) => !allS.some((w) => close(w, x)));
    if (added) return { ok: false, reason: `value word "${added}" was not in the original` };
  }
  if (polarity) {
    const ws = new Set([...stripQuotes(src).matchAll(WORD_RE)].map((m) => lc(m[0]))), wc = [...stripQuotes(cand).matchAll(WORD_RE)].map((m) => lc(m[0]));
    for (const w of wc) if (!ws.has(w) && [...(OPPOSITE.get(w) ?? [])].some((o) => ws.has(o))) return { ok: false, reason: `opposite word "${w}" introduced` };
    const wcs = new Set(wc);
    for (const w of ws) if (OPPOSITE.has(w) && !wcs.has(w)) return { ok: false, reason: `opposite-capable word "${w}" was dropped` };
  }
  if (grounded || keepKnown) {
    const cs2 = contentWords(src), cc2 = contentWords(cand);
    const allSrc = [...stripQuotes(src).matchAll(WORD_RE)].map((m) => lc(m[0])), allCand = [...stripQuotes(cand).matchAll(WORD_RE)].map((m) => lc(m[0]));   // counterparts are searched among ALL words (a typo of a function word counts)
    const has = (list, w) => list.some((x) => x === w || stem(x) === stem(w) || close(x, w));
    const expansions = new Set([...stripQuotes(src).matchAll(WORD_RE)].flatMap((m) => String(ABBREVIATIONS[lc(m[0])] ?? '').split(' ')));   // normalization whitelist: abbreviation expansions (u -> you, whats -> what is)
    if (grounded) { const g = cc2.find((w) => !ADDABLE.has(w) && !expansions.has(w) && !has(allSrc, w)); if (g) return { ok: false, reason: `word "${g}" is not grounded in the original` }; }
    if (keepKnown && vocab) { const k = cs2.find((w) => (vocab.has(w) || vocab.has(stem(w))) && !ADDABLE.has(w) && !has(allCand, w)); if (k) return { ok: false, reason: `known word "${k}" was dropped` }; }
  }
  return { ok: true, reason: 'values preserved' };
}
