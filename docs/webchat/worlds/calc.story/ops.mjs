// SPDX-License-Identifier: AGPL-3.0-only
// Operations of calc.story (kids plan, ADR-011, Q18 L1): word problems read by the library's storyState. The story is the world state (the library's result,
// carried across sentences and turns as `prior`); this file only gathers the words the library needs from the language world and lang.common, and says the
// library's result in English. No name, item or number is listed here. Browser-safe.
import { storyState } from '../../lib/vendor/sopworld/sopworld.mjs?v=1a46c4b8fc';
import { en } from '../../lib/lang/en.mjs?v=37bb133489';
import { pluralize } from '../../lib/formalizer/rules/lemma.mjs?v=b810124a5c';
import { MONEY_WORDS } from '../../lib/knowledge/money-words.generated.mjs?v=f8689c864a';
import { CALC_WORDS } from '../../lib/knowledge/calc-words.generated.mjs?v=3038efb1d8';   // the catalog's words of arithmetic (K4: w.lang.en shard arithmetic)   // the catalog's money words (k.units through w.lang.en)

export function initialState() { return { story: null, turns: 0 }; }

const EFFECTS = ['set', 'add', 'remove', 'give'];
const words = (xs) => [...new Set([].concat(xs ?? []).map((x) => String(x).toLowerCase()))];
const safe = (f, d) => { try { return f() ?? d; } catch { return d; } };

/**
 * The options of storyState from the language data: the verbs and their effect (lang.common lang.story.<effect>: the word of a phrase that is no auxiliary is the
 * verb, "is holding" -> holding, "flies away" -> flies), the number words and pronouns of w.lang.en, the question and "together" words of lang.common, and the
 * function words (determiners, auxiliaries, prepositions, the story's adverbs) that are never an owner or an item.
 */
export function storyOptions(lang) {
  const aux = new Set(words(safe(() => [...en.words('aux')], [])));
  const phrase = (id) => words(safe(() => lang?.phrase?.(id), []));
  const verbs = {};
  // the catalog's typed possession effects first (k.actions holds / money, K5: acts.possession.<effect>), then lang.common's stand-ins for the verbs k.actions has no effect for
  for (const eff of EFFECTS) for (const p of [...phrase(`acts.possession.${eff}`), ...phrase(`lang.story.${eff}`)]) {
    const toks = p.split(/[ _]+/).filter(Boolean);
    const v = toks.find((t) => !aux.has(t)) ?? toks[0];
    if (v && !(v in verbs)) verbs[v] = eff;
  }
  const refers = safe(() => en.refers('session.agent'), {});
  const pronouns = Object.entries(refers).filter(([w, who]) => who !== 'user' && who !== 'assistant' && !/^(?:his|their|its)$/.test(w)).map(([w]) => w);
  const self = Object.entries(refers).filter(([w, who]) => who === 'user' && w !== 'my').map(([w]) => w);
  const askWords = [...phrase('lang.story.ask'), ...safe(() => [...en.words('wh')].filter((w) => /^how /.test(w)), [])].flatMap((p) => p.split(/[ _]+/));   // "how many", "how much" (w.lang.en wh)
  const when = phrase('lang.story.when').flatMap((p) => p.split(/[ _]+/));
  const skip = words([...safe(() => [...en.words('det')], []), ...aux, ...safe(() => [...en.words('prep')], []), ...when, 'away', 'back', 'up']).filter((w) => !(w in verbs) && !/^\d/.test(w) && !w.includes(' ') && !w.includes('_'));
  // K4: the story words of the catalog (aggregate: "in total", "altogether"; extreme: "the most" / "the fewest"; comparison: "more", "fewer", "twice as many as"; state: "at first")
  const k4 = (pred) => CALC_WORDS.filter(pred).map((w) => String(w.text).toLowerCase().split(/\s+/).filter((t) => !aux.has(t) && !['the', 'a', 'to', 'in', 'at', 'with', 'as', 'than', 'all'].includes(t)));
  const lastOf = (pred) => words(k4(pred).map((ts) => ts.at(-1)).filter(Boolean));
  const times = {};
  for (const w of CALC_WORDS.filter((x) => x.kind === 'comparison' && x.form === 'relation' && x.factor)) times[String(w.text).toLowerCase().split(/\s+/)[0]] = w.factor;
  return { verbs, numbers: safe(() => en.numerals(), {}), pronouns, self: self.length ? self : ['i', 'me'], question: words(askWords), all: words([...phrase('lang.story.all').flatMap((p) => p.split(/[ _]+/)), ...lastOf((w) => w.kind === 'aggregate')]), skip,
    more: words(['more', ...lastOf((w) => w.kind === 'comparison' && w.form === 'question' && /^more$/.test(w.text))]), fewer: words(['fewer', 'less', ...lastOf((w) => w.kind === 'comparison' && w.form === 'question' && w.text !== 'more')]),
    most: words(['most', ...lastOf((w) => w.kind === 'extreme' && w.calc === 'argmax')]), least: words(['least', 'fewest', ...lastOf((w) => w.kind === 'extreme' && w.calc === 'argmin')]),
    start: words(['first', 'start', 'beginning', 'begin', 'began', ...k4((w) => w.kind === 'state' && w.state === 'start').flat()]), times: { thrice: 3, triple: 3, double: 2, ...times } };
}

/** The sentence with the case of the words its roles carry (the decline hook sees the lower-cased tokens; the library tells a name by its capital). */
function withCase(text, roles = {}) {
  const raw = new Map();
  for (const v of Object.values(roles)) for (const t of String(v ?? '').match(/[\p{L}\p{N}'-]+/gu) ?? []) if (/^\p{Lu}/u.test(t)) raw.set(t.toLowerCase(), t);
  return String(text ?? '').replace(/[\p{L}\p{N}'-]+/gu, (t) => raw.get(t.toLowerCase()) ?? t);
}

const kept = (r) => ({ state: r.state, steps: r.steps, starts: r.starts, unknown: r.unknown, focus: r.focus });
const who = (o) => (o === 'I' ? 'you' : o);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const has = (o) => (o === 'I' ? 'have' : 'has');
const count = (n, item) => `${n} ${n === 1 ? item : pluralize(item)}`;
const PAST = { add: 'got', remove: 'lost' };
const CANNOT = { give: 'give away', remove: 'lose' };

/** What one step of the story says (the library's step: owner, verb, n, item, to?, from?, negated?, refused?). */
function stepSays(s, verbs, refusal) {
  if (s.refused) return `That does not add up. ${cap(refusal ?? `${who(s.owner)} does not hold enough`)}, so ${who(s.owner)} cannot ${CANNOT[verbs[s.verb]] ?? 'give away'} ${s.n}.`;
  if (s.negated) return `OK, nothing changes for ${who(s.owner)}.`;
  const eff = verbs[s.verb];
  if (s.from !== undefined || eff === 'set') return `OK, ${who(s.owner)} ${has(s.owner)} ${count(s.value ?? s.n, s.item)}.`;
  if (eff === 'give') return s.to ? `OK, ${who(s.owner)} gave ${who(s.to)} ${count(s.n, s.item)}.` : `OK, ${who(s.owner)} gave away ${count(s.n, s.item)}.`;
  return `OK, ${who(s.owner)} ${PAST[eff] ?? s.verb} ${count(s.n, s.item)}.`;
}

/** What an answer of the library says. */
function answerSays(a) {
  if (a.answer === null || a.answer === undefined) return null;
  const q = String(a.question ?? '').toLowerCase();
  if (a.owner === undefined && typeof a.answer === 'string') return `${cap(who(a.answer))} ${has(a.answer)} the ${/\b(?:least|fewest)\b/.test(q) ? 'fewest' : 'most'} ${pluralize(a.item)}.`;
  if (a.owner === undefined) return `Together they have ${count(a.answer, a.item)}.`;
  if (/^what .* held before/.test(a.why ?? '')) return `${cap(who(a.owner))} had ${count(a.answer, a.item)} at first.`;
  if (/^\w+ -?\d+(?:\.\d+)?, \w+ -?\d+/.test(a.why ?? '')) { const n = a.answer; const more = !/\b(?:fewer|less)\b/.test(q); return `${cap(who(a.owner))} ${has(a.owner)} ${Math.abs(n)} ${n >= 0 === more ? (more ? 'more' : 'fewer') : (more ? 'fewer' : 'more')} ${pluralize(a.item)}.`; }
  return `${cap(who(a.owner))} ${has(a.owner)} ${count(a.answer, a.item)}.`;
}

const readOf = (lang, text, prior) => { const o = storyOptions(lang); return { o, r: storyState(String(text ?? ''), { ...o, prior: prior ?? undefined }) }; };

/** DECLINE (spec 21): the world owns a reading only when the library reads the sentence whole: a story sentence that changes or states a holding, or a question
 *  answered from a story in focus. A bare name, a sentence with no amount or no verb of a story, or a question with no story, goes to the next world (plan H7). */
export function accepts({ action, roles, text, state } = {}) {
  if (action !== 'story.tell' && action !== 'story.ask') return true;
  // the hook has no lang.common: the verb is what the pattern read between the owner and the rest (its effect does not decide whether the sentence reads whole)
  const o = storyOptions(null);
  const toks = String(text ?? '').toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? [];
  const whoLow = String(roles?.who ?? '').toLowerCase(), whoNum = o.numbers[whoLow];   // a number word as subject reaches the hook as its digits ("One" -> "1")
  const at = toks.indexOf(whoLow) >= 0 ? toks.indexOf(whoLow) : whoNum !== undefined ? toks.indexOf(String(whoNum)) : -1, restAt = roles?.rest ? toks.lastIndexOf(String(roles.rest).toLowerCase().match(/[\p{L}\p{N}'-]+/u)?.[0] ?? '') : -1;
  const verbs = { ...Object.fromEntries((state?.story?.steps ?? []).map((s) => [s.verb, 'add'])) };
  if (action === 'story.tell' && at >= 0) for (const t of toks.slice(at + 1, restAt > at ? restAt : toks.length)) verbs[t] ??= 'add';
  const said = withCase(text, roles) + (action === 'story.ask' && !/\?\s*$/.test(String(text ?? '')) ? '?' : '');   // the hook's tokens have no question mark
  const r = storyState(said, { ...o, skip: o.skip.filter((w) => !(w in verbs)), verbs, prior: state?.story ?? undefined });
  if (r.unread.length || !readsWhole({ text: said, state })) return false;   // a reading that passes over words is not this world's ("Tom ate 2 apples AND NOW HAS 3": two clauses)
  // a story about money ("Ana has 5 lei": the item is a money word of the catalog) is the shop's while kids.shop holds the wallet (money as a quantity with a unit is the
  // next step: storyState over w.list's budget)
  const money = (i) => !!i && (MONEY_WORDS.has(i) || MONEY_WORDS.has(`${i}s`));
  if (r.steps.slice(state?.story?.steps?.length ?? 0).some((s) => money(s.item)) || r.answers.some((a) => money(a.item))) return false;
  const inFocus = !!state?.story?.steps?.length;
  // "I have one daughter" with no story in focus is a statement about the user (the profile, Q19), not the start of a word problem
  if (action === 'story.tell' && !inFocus && r.steps.length && r.steps.every((s) => s.owner === 'I')) return false;  // 'focus': the story is the dialogue's focus, so the reading does not yield to another world's general frame ("how many ... does Tom have")
  if (action === 'story.ask') return inFocus && r.answers.some((a) => a.answer !== null && a.answer !== undefined) ? 'focus' : false;
  return r.steps.length > (state?.story?.steps?.length ?? 0) ? (inFocus ? 'focus' : true) : false;
}

/** Does the world's own reader (storyState) read the clause whole, so the leftover words of its free slots are read (spec 16 section 13)? The library reads an owner,
 *  a verb, an amount, an item, names and function words; any other word it passes over ("i lost 2 lei BUYING A SWEET") is unread. One word is the verb (its effect
 *  is lang.common's, which this hook does not see). */
function readsWhole({ text, state } = {}) {
  const o = storyOptions(null);
  const known = new Set([...o.skip, ...o.pronouns, ...o.self, ...o.question, ...Object.keys(o.numbers), 'who', 'whose', 'most', 'least', 'fewest', 'more', 'fewer', 'less', 'than', 'together', 'altogether', 'total', 'first', ...(state?.story?.steps ?? []).map((s) => s.verb)]);
  const toks = String(text ?? '').match(/[\p{L}\p{N}'-]+/gu) ?? [];
  const items = new Set(Object.values(state?.story?.state ?? {}).flatMap((h) => Object.keys(h)));
  let other = 0, item = 0;
  for (const t of toks) {
    const w = t.toLowerCase();
    if (known.has(w) || /^\d+(?:\.\d+)?$/.test(w) || /^\p{Lu}/u.test(t)) continue;   // a name (the owner, the one given to)
    if (!item && (items.has(w) || items.has(w.replace(/s$/, '')) || toks[toks.indexOf(t) - 1]?.match(/^(?:\d+|an?)$/i) || o.numbers[toks[toks.indexOf(t) - 1]?.toLowerCase()] !== undefined)) { item++; continue; }
    other++;
  }
  return other <= 1;
}
export const executor = { readsWhole };

export function tell(ctx, { text } = {}) {
  const st = ctx.state;
  const before = st.story?.steps?.length ?? 0;
  const { o, r } = readOf(ctx.lang, text, st.story);
  if (r.unread.length || r.steps.length === before) return { status: 'unsupported', note: `I could not read "${text}" as a step of a story.` };
  const refusals = [...r.refused];
  const says = r.steps.slice(before).map((s) => stepSays(s, o.verbs, s.refused ? refusals.shift()?.why : null));
  st.story = kept(r);
  st.turns = (st.turns ?? 0) + 1;
  const asked = r.answers.map(answerSays).filter(Boolean);
  const refused = r.steps.slice(before).some((s) => s.refused);
  return { status: refused ? 'conflicting' : 'supported', value: [...says, ...asked].join(' ') };
}

export function ask(ctx, { text } = {}) {
  const st = ctx.state;
  if (!st.story?.steps?.length) return { status: 'missing', note: 'There is no story yet: tell me who has what first.' };
  const { r } = readOf(ctx.lang, text, st.story);
  const a = r.answers.at(-1);
  if (!a) return { status: 'unsupported', note: `I could not read "${text}" as a question about the story.` };
  st.story = kept(r);
  const said = answerSays(a);
  if (!said) return { status: 'missing', note: `I do not know: ${a.why}.` };
  return { status: 'supported', value: said, answer: a.answer };
}
