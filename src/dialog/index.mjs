// SPDX-License-Identifier: AGPL-3.0-only
/**
 * C2 dialog pipeline (spec 06). Browser-safe.
 *
 *   const engine = await createEngine({ loader, translator })
 *   const session = engine.createSession({ language: 'auto' })
 *   const reply = await session.send('Tom has 5 apples. How many apples does Tom have?')
 *
 * `translator` is optional: { detectLanguage(text), translate(text, { from, to }) } (spec 05).
 * Without it all input is treated as English.
 */
import { composeReply, sayOf } from './composed-reply.mjs';
import { reviewForeign } from './foreign-reading.mjs';
import { installTextGen } from './textgen.mjs';
import { precompile as precompileRules, registerClauseStarters } from '../formalizer/rules/index.mjs';
import { loadWorlds, tabOfWorld } from '../worlds/index.mjs';
import { validateWorldSet } from '../worlds/validate.mjs';
import { defaultRouter, namedWorlds, namingTables, setWorldChooser } from '../formalizer/routing.mjs';
import { isNumberWord, ordinalWordValue } from '../formalizer/rules/numbers.mjs';
import { createInterpreter } from '../interpreter/index.mjs';
import { createReasoner } from '../reasoner/index.mjs';
import { createRulesFormalizer, createEncoderFormalizer } from '../formalizer/strategy.mjs';
import { DEFAULT_NX_STRATEGY, normalizeNxStrategy } from '../formalizer/nx.mjs';
import { serialize, makeWire, atom, str } from '../soplang/index.mjs';
import { splitSentences } from '../formalizer/rules/normalize.mjs';
import { nameCandidates, nameIndex } from '../formalizer/names.mjs';
import { cleanVoice, garbleCandidates, weakSoundAlikes } from '../formalizer/voice.mjs';
import { gatherCandidates, chooseCandidate, englishTest, nearAny } from '../translate/candidates.mjs';
import { machineReads } from '../translate/reading-policy.mjs';   // reviewer 02:30 (Q50): the machine translator does not read the request in a language with a rules translator (data, reversible)
import { worldThingNames, sessionNames } from '../translate/keep-list.mjs';
import { langRoNow } from '../translate/frames-ro.mjs';
import { repairInContext } from '../translate/source-repair.mjs';
import { spellCorrect, spellAlternates, spellCandidates, protectedWordsOf, worldVocabulary, spellVocabulary, restrictedSet, ignorable, isKnownWord, sameWordForm, FUNCTION_WORDS } from '../formalizer/spell.mjs';
import { lexIndex } from '../worlds/lexicon.mjs';
import { perf } from '../formalizer/perf.mjs';
import { guard, TurnAborted } from '../formalizer/guard.mjs';
import { createBudget, installBudget, releaseBudget, isBudgetExceeded, budget } from './budget.mjs';
import { findPartialWindow, changesIntoQuestion } from '../formalizer/partial.mjs';
import { looseCandidates, BEST_EFFORT_POLICY } from '../formalizer/best-effort.mjs';
import { checkValues } from './value-check.mjs';
import { attachValues } from '../knowledge/values.mjs';
import { attachOpenWords, ready as openWordsReady } from '../knowledge/open-words.mjs';
import { attachArrangement } from '../knowledge/arrangement.mjs';
import { Discourse } from './discourse.mjs';
import { Dialogue } from './dialogue.mjs';
import { turnSteps, withDoor } from './steps.mjs';
import { createSessionAstra, mirrorFrames } from '../astra/session.mjs';
import { knowledgeAnswer, knowledgeFallback, preloadThings, prefetchNext, knowledgeOf, within } from './knowledge-lookup.mjs';
import { personTurn } from './person.mjs';
import { proposeByTypes } from './typed-reader.mjs';
import { withVariants, anyVoiceOn } from './variants.mjs';
import { isIncomplete, completeMode } from '../formalizer/completeness.mjs';
import { createTypedWorlds } from '../formalizer/typed-world.mjs';
import { repairFromScene } from './scene-referents.mjs';
import { loadMetaWorlds } from './meta-worlds.mjs';
import { createSymbolicRouter, normalizeRouting, isSymbolic } from './symbolic-router.mjs';
import { reviewSegments, normalizeWorldAware, baseMode, makePicker, reviewBestEffort, explainUnparsed } from './world-aware.mjs';
import { recognize } from '../astra/moves.mjs';
import { panel } from '../astra/where.mjs';
import { snapshot as astraSnapshot, restore as astraRestore } from '../astra/persist.mjs';
import { correctMessage, splitAnswerList } from '../formalizer/rules/expand.mjs';

export { runWorldTests } from './test-runner.mjs';

const plainSegment = (s) => ({
  text: s.text, span: s.span, isQuestion: s.isQuestion, worlds: s.worlds, routing: s.routing, match: s.match,
  unparsed: s.unparsed, discourse: s.discourse ?? null, alternatives: s.alternatives, errors: s.errors, strategy: s.strategy, reading: s.strategy === 'model' ? 'model' : 'rules', corrections: s.corrections ?? [], ignored: s.ignored ?? [], dispatch: s.dispatch ?? null,
  ...(s.nx ? { nx: { op: s.nx.op, world: s.nx.world, pattern: s.nx.pattern, p: s.nx.p, spans: s.nx.spans } } : {}),
  wires: s.wires.map((w) => w.id),
});

/** Up to two example sentences from the closest world (or any world as a fallback). */
export function examplesFor(set, worldIds) {
  const pick = (patterns) => {
    const out = [];
    const kinds = new Set();
    for (const p of patterns) for (const ex of (p.canonical ?? []).slice(0, 1)) {   // canonical examples only (RD6)
      if (!kinds.has(p.kind) && out.length < 2) { kinds.add(p.kind); out.push(ex); }
    }
    for (const p of patterns) for (const ex of p.canonical ?? []) if (out.length < 2 && !out.includes(ex)) out.push(ex);
    return out;
  };
  for (const id of worldIds) {
    const ex = pick(set.get(id)?.patterns ?? []);
    if (ex.length) return ex;
  }
  for (const w of set.list()) { const ex = pick(w.patterns); if (ex.length) return ex; }
  return [];
}

/** The user's own words for the English segment `seg`: found through the translation alignment, else the original text. */
function originalSentence(original, seg, alignment) {
  const sentences = splitSentences(original);
  if (sentences.length <= 1) return (sentences[0]?.text ?? original).trim();
  const hits = (alignment ?? []).filter((a) => a.tgt[0] < seg.span[1] && a.tgt[1] > seg.span[0]);
  if (hits.length) {
    const lo = Math.min(...hits.map((a) => a.src[0])), hi = Math.max(...hits.map((a) => a.src[1]));
    const inside = sentences.filter((x) => x.start < hi && x.end > lo);
    if (inside.length) return original.slice(inside[0].start, inside.at(-1).end);
  }
  return original.trim();
}

/** Keep the surrounding whitespace of `src` and the initial letter case when translating a fragment. */
function fitFragment(src, out) {
  const lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
  let core = out.trim();
  // a fragment that continues a sentence (", so I did not do it.") keeps its leading punctuation, which a translator drops, and starts in lower case
  const punct = src.trim().match(/^[,;:]\s*/)?.[0] ?? '';
  if (punct && !core.startsWith(punct.trim())) core = `${punct}${core}`;
  const body = src.trim().slice(punct.length);
  if (/^[a-z]/.test(body) && core) { const i = punct && core.startsWith(punct.trim()) ? core.search(/\p{L}/u) : 0; if (i >= 0) core = core.slice(0, i) + core[i].toLowerCase() + core.slice(i + 1); }
  return lead + core + trail;
}

/**
 * The words the user typed that the translation turned into another word, from the alignment: English word (lowercase) -> the user's own word ("dragons" -> "dragoni").
 * A refusal that quotes the word ("There is no dragons tab.") then quotes what the user said, not our English reading of it.
 */
export function userWordMap(original, english, alignment) {
  const map = new Map();
  for (const a of alignment ?? []) {
    const src = String(original).slice(a.src[0], a.src[1]).trim(), tgt = String(english).slice(a.tgt[0], a.tgt[1]).trim();
    if (!src || !tgt || /\s/.test(src) || /\s/.test(tgt) || src.toLowerCase() === tgt.toLowerCase() || !/^\p{L}+$/u.test(src) || !/^\p{L}+$/u.test(tgt)) continue;
    if (!map.has(tgt.toLowerCase())) map.set(tgt.toLowerCase(), src);
  }
  return map;
}
/** In a Romanian output „x”: when x is the English word of a word the user typed, quote the user's word. */
function quoteUserWords(text, userWords) {
  if (!userWords?.size) return text;
  return text.replace(/„([^”]*)”/g, (all, x) => (userWords.has(x.toLowerCase()) ? `„${userWords.get(x.toLowerCase())}”` : all));
}

/** Most Translator calls one turn may make as fallback (each is bounded by the bridge deadline; the turn guard bounds the sum). */
const MAX_FALLBACK_CALLS = 6;
/** A clause whose wire asks to remove, clear, reset or replace something (the action's last name part: draw.clearAll, draw.remove, geo.clearAll ...). */
const DESTRUCTIVE_ACTION = /^(clear|remove|delete|erase|reset|restart|wipe|discard|forget|empty|drop|replace|undo|redo|destroy)/i;
function isDestructive(seg) {
  for (const w of seg.wires ?? []) for (const e of w.entries ?? []) if (e.key === 'core.request.action' && DESTRUCTIVE_ACTION.test(String(e.value?.v ?? '').split('.').pop())) return true;
  return false;
}

/** The "rules translator" of a language that has none (MT-SERIOUS): it translates nothing, so every run goes to the on-device translation. */
const NO_RULES = { translate: (text) => ({ text: '', alignment: [], unknown: [String(text ?? '')], untranslatable: [], notes: ['no rules for this language'], confidence: 0 }), supports: () => false };

/**
 * Translate a reply given as parts [{ text, translate, quote? }] (spec 06): consecutive `translate: true` parts are
 * translated together, `translate: false` parts (quoted user text, already translated examples) are kept verbatim.
 * A part with `fallback` is replaced by the translation of the fallback text when the translator reports unknown words.
 */
/**
 * The parts of a reply in which the names a world gave (`names`: labels of the knowledge, such as a diagram's topic) are kept as they are, the rest translated: a name has no
 * word in the other language and is never translated word by word. Null when there is no name in the text.
 */
export function namedParts(text, names = []) {
  const ns = [...new Set((names ?? []).map(String).filter((n) => n.trim()))].sort((a, b) => b.length - a.length);
  if (!ns.length) return null;
  const out = [];
  let rest = String(text ?? '');
  for (let guardN = 0; guardN < 20 && rest; guardN++) {
    let at = -1, hit = null;
    for (const n of ns) { const k = rest.indexOf(n); if (k >= 0 && (at < 0 || k < at)) { at = k; hit = n; } }
    if (at < 0) break;
    if (at > 0) out.push({ text: rest.slice(0, at), translate: true });
    out.push({ text: hit, translate: false, quote: true });
    rest = rest.slice(at + hit.length);
  }
  if (rest) out.push({ text: rest, translate: true });
  return out.some((p) => !p.translate) ? out : null;
}

export async function translateParts(parts, translator, lang, userWords = null, compose = composeReply) {
  const flat = parts.map((p) => ({ ...p }));
  let complete = true;   // RD5: a reply is either fully translated or left in English, never mixed
  // M4, output side (spec 06): one path for every language. The candidates of a run are the machine translators' (the browser Translator, the on-device model: each
  // alone, checked) and the language pack's rules translator, if it has the pair; the first complete one wins (the machine ones first, owner rule P7); a run nothing
  // could translate leaves the reply in English, and in a Romanian session it becomes a Romanian sentence, never English.
  const fb = lang !== 'en' && translator.fallbackMode?.() === 'fallback';
  const ownRules = fb && (translator.rules?.supports?.('en', lang) ?? true);
  const prim = fb ? (ownRules ? (translator.rules ?? translator) : NO_RULES) : translator;
  const routes = [];
  let fbCalls = 0, dead = false, leftOnly = false;   // after a failed machine round in this reply the rules write the rest; `leftOnly`: a machine round gave a checked text that failed only for English words left over
  const viaMachine = async (text) => {
    if (!fb || !translator.candidatesViaMT || fbCalls >= MAX_FALLBACK_CALLS || guard.soft() || dead) return null;
    fbCalls++;
    try {
      // the register (owner export 2026-11-14 22:43, src/translate/register.mjs): our English elides "I" ("Drew a circle."), which a machine translator reads as he / she: the subject is given
      // before the call; the Romanian that comes back is put in one register (the informal singular)
      const cs = await guard.abortable(translator.candidatesViaMT(withSubject(text), { from: 'en', to: lang }), 'translate');
      const ok = (cs ?? []).find((c) => !c.rejected && c.text && !(typeof translator.leftovers === 'function' && translator.leftovers(c.text, lang).length));
      if (!ok && (cs ?? []).some((c) => c.text && !c.rejected)) leftOnly = true;   // only English words left over: translating the whole reply may still do
      if (!ok) dead = true;
      if (!ok) return null;
      const tr = ok.translation ?? { text: ok.text };
      return { ...tr, text: polishReply(textOf(tr) ?? ok.text, lang) };
    } catch (e) { if (e instanceof TurnAborted) throw e; dead = true; return null; }
  };
  const viaRules = async (text) => { try { return await guard.abortable(prim.translate(text, { from: 'en', to: lang }), 'translate'); } catch (e) { if (e instanceof TurnAborted) throw e; return null; } };
  const isComplete = (r, t) => !!t && !r?.unknown?.length && !r?.untranslatable?.length && !(typeof translator.leftovers === 'function' && translator.leftovers(t, lang).length);
  /** The one candidate chooser: the machine candidates, then the rules (and the rules again on the fallback wording). { text, route, incomplete }; null when `machineOnly` and no machine answered. */
  const choose = async (src, { fallback = null, machineOnly = false } = {}) => {
    const m = await viaMachine(src);
    if (m && textOf(m)) return { text: textOf(m).trim(), route: 'translator-out', incomplete: false };
    if (machineOnly) return null;
    let r = await viaRules(src);
    if (r?.unknown?.length && fallback) r = await viaRules(fallback);
    const t = textOf(r);
    return { text: t ?? '', route: null, incomplete: !isComplete(r, t) };
  };
  for (let i = 0; i < flat.length; i++) if (flat[i].join) flat[i].translate = !!(flat[i - 1]?.translate && flat[i + 1]?.translate);
  const out = [];
  for (let i = 0; i < flat.length;) {
    budget.tick('index.translateParts');
    if (!flat[i].translate) {
      const { join, fallback, incomplete, ...rest } = flat[i];
      if (rest.reading && lang !== 'en') {   // our own English reading of the user's words ("I took that as: ..."): shown in the reply language, never in English
        const c = await choose(rest.text.replace(/^"|"$/g, ''));
        if (c.text && !c.incomplete) { if (c.route) routes.push(c.route); out.push({ ...rest, text: `"${c.text}"` }); i++; continue; }
        if (translator.leftovers) complete = false;
      }
      if (incomplete && fb && rest.en) {   // an example the rules could not translate: the machine translators try it on their own
        const c = await choose(rest.en.replace(/^"|"$/g, ''), { machineOnly: true });
        if (c) { out.push({ ...rest, text: `"${c.text}"`, en: rest.en }); routes.push(c.route); i++; continue; }
      }
      if (incomplete) complete = false;
      out.push(rest); i++; continue;
    }
    let j = i;
    while (j < flat.length && flat[j].translate) { budget.tick('index.translateParts2'); j++; }
    const run = flat.slice(i, j);
    i = j;
    const src = run.map((p) => p.text).join('');
    if (!src.trim()) { out.push({ text: src, translate: false }); continue; }
    // COMPOSED REPLIES (spec 06): a sentence the application composed from a frame is said from the language world's template, before any translator (owner rule: the
    // translators are for free text)
    const say = run.length === 1 && run[0].say && lang !== 'en' && compose ? await compose(run[0].say, lang) : null;
    if (say) { out.push({ text: fitFragment(src, say), translate: true, src }); routes.push('composed'); continue; }
    // several composed sentences in a row ("Moved alfa up. Moved beta up."): each from its template, when every one of them has one
    if (run.length > 1 && lang !== 'en' && compose && run.some((p) => p.say)) {
      // several sentences in a row, some composed ("Moved alfa up. Moved beta up."; the door's reply facts): each composed sentence from its template, every other one through the
      // translators on its own (a sentence with no template never sends the composed ones back to English)
      const each = [];
      let whole = true;
      for (const p of run) {
        if (p.join && !p.text.trim()) { each.push(p.text); continue; }
        const t = p.say ? await compose(p.say, lang) : null;
        if (t) { each.push(fitFragment(p.text, t)); continue; }
        const c = await choose(p.text, { fallback: p.fallback ?? null });
        if (c.route) routes.push(c.route);
        if (c.incomplete || !c.text) { whole = false; break; }
        each.push(fitFragment(p.text, c.text));
      }
      if (whole) { out.push({ text: each.join(''), translate: true, src }); routes.push('composed'); continue; }
    }
    const c = await choose(src, { fallback: run.length === 1 ? run[0].fallback : null });
    if (c.route) { out.push({ text: fitFragment(src, c.text), translate: true, src }); routes.push(c.route); continue; }
    if (c.incomplete) complete = false;
    out.push({ text: c.text ? fitFragment(src, quoteUserWords(c.text, userWords)) : src, translate: true, src });
  }
  let result;
  if (!complete) {   // keep the whole reply in English: translated runs and the examples (which carry their English text in `en`) revert; quoted user text stays as typed
    if (fb && lang !== 'en') {
      // A REPLY IS NEVER WITHHELD (owner 2026-11-15, class B): what the run-by-run chooser could not complete goes to the machine translator as one whole reply (checked for
      // numbers, names and negation; a few English words left are accepted when they are the user's own or few); without one, the best partial translation is shown
      // (the rules' runs, the rest in English). Never a fixed line that says nothing.
      const whole = flat.map((p) => (p.join ? p.text : p.translate ? p.text : (p.en ?? p.text))).join('');
      const userText = flat.filter((p) => p.quote).map((p) => p.text).join(' ').toLowerCase();
      let wholeText = null;
      if (translator.candidatesViaMT && leftOnly && fbCalls < MAX_FALLBACK_CALLS && !guard.soft()) {
        try {
          const cs = await guard.abortable(translator.candidatesViaMT(withSubject(whole), { from: 'en', to: lang }), 'translate');
          const words = (t) => String(t).split(/\s+/).filter(Boolean).length;
          const ok = (cs ?? []).find((c) => {
            if (c.rejected || !c.text || c.text.trim() === whole.trim()) return false;
            const left = (typeof translator.leftovers === 'function' ? translator.leftovers(c.text, lang) : []).filter((w) => !userText.includes(String(w?.word ?? w).toLowerCase()));
            return left.length <= Math.max(1, Math.floor(words(c.text) / 5));
          });
          if (ok) wholeText = polishReply(textOf(ok.translation ?? ok) ?? ok.text, lang);
        } catch (e) { if (e instanceof TurnAborted) throw e; }
      }
      routes.length = 0;
      if (wholeText) { routes.push('translator-out-whole'); result = [{ text: wholeText, translate: false }]; }
      else { routes.push('rules-partial'); result = out.map(({ src, en, ...p }) => p); }
    } else result = flat.map(({ join, fallback, en, src, incomplete, say: _say, ...p }) => (join ? { text: p.text, translate: false } : { ...p, text: en ?? p.text }));
  } else {
    if (fb && !routes.length && out.some((p) => p.translate)) routes.push('rules-translate');
    result = out.map(({ src, en, ...p }) => p);
  }
  if (lang === 'ro') result = result.map((p) => (p.quote && /^".*"$/s.test(p.text) ? { ...p, text: `„${p.text.slice(1, -1)}”` } : p));   // Romanian quotes (RO-TRANSLATE-FALLBACK note c); the user's words inside are untouched
  if (fb) Object.defineProperty(result, 'routes', { value: [...new Set(routes)], enumerable: false });
  return result;
}

/** Romanian words the speech recogniser confuses with a word of the open tab's world (RP5): "un sare" on the Drawing tab is "un soare". */
const SOUND_ALIKES = { 'art.draw': { sare: 'soare', soar: 'soare', soarele: 'soarele' } };
function soundAlikes(text, tabWorld) {
  const map = SOUND_ALIKES[tabWorld];
  return map ? text.replace(/\p{L}+/gu, (w) => (Object.hasOwn(map, w.toLowerCase()) ? map[w.toLowerCase()] : w)) : text;
}


const langOf = (r) => (typeof r === 'string' ? r : r?.lang) ?? 'en';
/** A turn the old readers handled (the door did not take it): `trace.legacy`, with the door's reason. */
/** The segment of the world that took a turn through the door (the readers' segments record theirs), with the slips the request read (as the readers record their corrections). */
/** Whether the language says a noun as a plural noun (an irregular pair whose singular is its plural: eyes, glasses), by its last word; built once per language world. */
const pluralNouns = new WeakMap();
const pluralNoun = (language, noun) => {
  if (!language?.ofType) return false;
  if (!pluralNouns.has(language)) {
    const out = new Set();
    for (const r of language.ofType('w.lang.en.irregular') ?? []) { const sg = String(r.attrs?.singular?.[0] ?? '').replace(/"/g, ''), pl = String(r.attrs?.plural?.[0] ?? '').replace(/"/g, ''); if (sg && sg === pl) out.add(sg.toLowerCase()); }
    pluralNouns.set(language, out);
  }
  return pluralNouns.get(language).has(String(noun).split(' ').pop().toLowerCase());
};
/**
 * THE DOOR'S REPLY AS REPLY FACTS (spec 28 section 14; spec 06 "Composed replies"): one part per fact `{ reply, roles }` (sayRequest's facts, or a reply name the door says), its English
 * said by the language world (`<name>.<key>` first when the fact has a key, as sayRequest says it), its frame `say: { act: <name>, roles }` for the user's language pack (w.lang.ro reply
 * rows), so that a reply reaches every language by the same names and never by a sentence of code. `lead`: parts said before (the reader's repairs). Returns null when the facts'
 * English is not the text given (the reply is then said as it is, through the translators): nothing changes in English.
 */
function factParts(lib, language, facts, text = null) {
  if (!lib || !language || !Array.isArray(facts) || !facts.length) return null;
  const parts = [];
  for (const f of facts) {
    const roles = Object.fromEntries(Object.entries(f.roles ?? {}).filter(([, v]) => v != null && v !== ''));
    const plain = roles.key ? [`${f.reply}.${roles.key}`, f.reply] : f.code && f.reply === 'not_honoured' ? [`${f.reply}.${f.code}`, f.reply] : [f.reply];   // what was not taken, by its code: a language that cannot say the library's English reason (`why`) says the code's own sentence
    const noun = roles.thing ?? roles.kind;   // one thing named by a plural noun (eyes, glasses: the language's irregular pair whose singular is its plural) is said by `<reply>.plural`, as sayRequest says it
    const names = typeof noun === 'string' && (roles.number ?? 1) === 1 && pluralNoun(language, noun) ? [...plain.map((n) => `${n}.plural`), ...plain] : plain;
    let said = null;
    const words = Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, Array.isArray(v?.names) ? v.names.map((w) => `"${w}"`).join(', ') : v]));   // the person's own words, quoted
    for (const n of names) { let t = null; try { t = lib.replyFrom?.(language, n, words) ?? null; } catch { t = null; } if (t) { said = { name: n, text: typeof t === 'string' ? t : t.text ?? String(t) }; break; } }
    if (!said) return null;
    // a list of counts the fact also gives as data (done.whole: `kinds`, `numbers`) is framed as counts, so that a language says each one with its own noun
    const sayRoles = Array.isArray(f.kinds) && Array.isArray(f.numbers) && f.kinds.length === f.numbers.length && typeof roles.parts === 'string' ? { ...roles, parts: f.kinds.map((k, i) => ({ n: f.numbers[i], noun: k })) } : roles;
    parts.push({ text: said.text, translate: true, say: { act: said.name, roles: sayRoles } });
  }
  const out = parts.flatMap((p, i) => (i ? [{ text: ' ', translate: false, join: true }, p] : [p]));
  if (text != null && out.map((p) => p.text).join('').trim() !== String(text).trim()) return null;
  return out;
}
/** One reply name of the language world as the door's reply: `{ text, parts }`, or null when the language has no such reply. */
function sayFact(lib, language, reply, roles = {}) {
  const parts = factParts(lib, language, [{ reply, roles }]);
  return parts ? { text: parts.map((p) => p.text).join(''), parts } : null;
}

function stampDoor(r, tabWorld, text, q) {
  r.trace ??= {};
  const corrections = (q?.corrections ?? []).map((c) => ({ from: c.said, to: c.as }));
  const mine = (r.segments ?? []).find((sg) => (sg.match?.worldId ?? sg.world) === tabWorld);
  if (!mine) r.segments = [...(r.segments ?? []), { world: tabWorld, text: r.trace.english ?? text, planned: true, match: { worldId: tabWorld, patternId: `door.${tabWorld}` }, corrections }];
  else { mine.match ??= { worldId: tabWorld, patternId: `door.${tabWorld}` }; if (corrections.length) mine.corrections = [...(mine.corrections ?? []), ...corrections]; }
  if (Array.isArray(r.worlds) && !r.worlds.includes(tabWorld)) r.worlds.push(tabWorld);
  // the steps of the turn in the page's vocabulary (docs/system-map.html): the world and the operations the door decided
  const calls = (r.trace.request?.tool?.calls ?? []).map((c) => `op.${tabWorld}.${c.op}`);
  const ops = calls.length ? calls : (r.answers ?? []).filter((a) => a?.via === 'door' && a.status === 'supported' && a.to).map((a) => a.to);
  if (Array.isArray(r.trace.steps)) r.trace.steps = withDoor(r.trace.steps, { world: tabWorld, ops });
}
/** A world on the request door: it declares its capabilities (request.sop) and carries a plan out (an operation planRequest). Charts, Map, Music join as they get both. */
const declaredWorld = (w, lib = null) => !!(w?.requestText && (typeof w?.ops?.planRequest === 'function' || (lib && boundTools(lib, liveWorld(lib, w), requestLanguage(lib)))));   // request.sop, and a plan is carried out by its planRequest operation or by the primitives its std.tool wires bind
const markLegacy = (r, why) => { if (r && typeof r === 'object') { r.trace ??= {}; r.trace.legacy = true; r.trace.door = why; } return r; };
/** A request with another act (a stand-in decision of the dialogue world; the library's facts kept). */
const withAct = (req, act) => { const facts = req.facts; const r = Object.assign(plainRequest(req), { act }); Object.defineProperty(r, 'facts', { value: facts, enumerable: false }); return r; };
/** Whether the open world's state holds a thing of a kind (its objects or shapes, by kind / shape / label). */
const hasThing = (state, kind) => { const k = String(kind ?? '').toLowerCase(); if (k === 'link') return (state?.edges ?? []).length > 0; return !!k && [...(state?.objects ?? []), ...(state?.shapes ?? [])].some((o) => [o.kind, o.shape, o.label, o.name].some((v) => String(v ?? '').toLowerCase() === k)); };
const textOf = (r) => (typeof r === 'string' ? r : r?.text);

const QUESTION_WORD = /^(?:what|who|whom|whose|where|when|why|how|which)\b/i;

/** Time budget of the leniency stage (spelling variants and partial windows) of one message, in ms; past it the best reading so far stands (turn guard, spec 06). */
import { LIMITS } from './time-limits.mjs';
import { languageCommand } from '../translate/language-command.mjs';
import { withSubject, polishReply } from '../translate/register.mjs';
import { BARE_DONE, NOTHING_CHANGED, contentChanged } from './honest-done.mjs';
import { intentStep, weakReading, cutWorld } from './intent.mjs';
import { knownEnglishWord } from '../translate/en-ro.mjs';
import { proposeReading, negationWords } from './proposer.mjs';
import { requestLanguage, liveWorld, readTurn, replyOf, stateWorld, worldWholes, typeParents, definiteKind, saysAnything, actOperation, worldWholeOperation, clausesOf, boundTools, goalOf, plainRequest, declarationsOf, isQuestion, madeIn, withSubkindsNegated, unitOfWhole, doorWholes, strongConstraint, madeAgainstSaid } from './request.mjs';
/** A settled dry-run answer is reused for the same text and session state for this long (ms). */
export const DRY_CACHE_MS = 5000;
const stripDetail = (r) => { if (!r || !('detail' in r)) return r; const { detail: _d, ...rest } = r; return rest; };
/** A voice dry run is skipped for texts longer than this many words (room talk, not a command). */
const DRY_MAX_WORDS = 25;
export const LENIENT_MAX_STEPS = 600;   // checks of the leniency stage per message (one per variant or window tried); a step count, not a time, so the reading does not depend on machine speed

const FAST_SEGMENT_MARGIN = 0;   // nats of log-probability between the model's best segmentation and the runner-up for the multi-clause fast path

/** What the trace and the phrase log keep of a turn's compute budget: total ticks, the five busiest sites, and the site that ran out (if any). */
export function budgetReport(b, e = b.exceeded) {
  const top = Object.entries(b.bySite).sort((x, y) => y[1] - x[1]).slice(0, 5);
  return { ticks: b.ticks, top: Object.fromEntries(top), ...(e ? { exceeded: { site: e.site, ticks: e.ticks, limit: e.limit } } : {}) };
}

/**
 * The record of a budget excess, for the trace, the debug view and the phrase log (field `budgetExceeded`): where the loop is.
 * { site, ticks, limit: 'site' | 'turn', bySite: full per-site tick table, input, tab, stage (turn guard stage), stack: short caller id }.
 */
export function budgetRecord(e, b, { input = null, tab = null, stage = null } = {}) {
  return { site: e.site, ticks: e.ticks, limit: e.limit, bySite: e.bySite ?? { ...b.bySite }, input, tab, stage, stack: e.stack_ ?? [] };
}

export const TOO_COMPLEX = 'That was too complex for me \u2014 try a shorter sentence.';

/** The reply of a turn that ran out of compute budget (the session was restored by the caller). Same shape as a normal reply, nothing executed. */
function tooComplexReply(session, text, e, b) {
  const rep = budgetReport(b, e);
  const record = budgetRecord(e, b, { input: text, tab: session.isession?.state?.['ui.shell']?.activeTab ?? null, stage: guard.stage });
  return {
    budgetExceeded: record,
    text: TOO_COMPLEX, parts: [{ text: TOO_COMPLEX }], lang: session._sessionLang ?? 'en', translation: null, segments: [], wires: [], answers: [], statuses: [], state: {}, effects: [],
    tooComplex: true, budget: rep,
    trace: { intercepted: null, effects: [], formalizer: { preferred: session.formalizer, used: [] }, source: null, original: text, english: text, replyEnglish: TOO_COMPLEX, segments: [], router: [], routing: [], patterns: [], operations: [], statuses: [], wires: [], budget: rep, budgetExceeded: record },
  };
}

/** A model call that hit its deadline: an ORT lane timeout (`OrtTimeout`), an aborted encoder fetch (`AbortError`, `TimeoutError`) or a message that says so. */
export const isModelTimeout = (e) => !!e && e.name !== 'TurnAborted' && (['OrtTimeout', 'AbortError', 'TimeoutError'].includes(e.name) || /timed out|timeout|aborted/i.test(String(e.message ?? e)));

export class DialogSession {
  constructor(engine, { language = 'auto', formalizer = 'rules', spell = true, partial = false, fastPath = false, bestEffort = false, nx = DEFAULT_NX_STRATEGY, worldAware, routing, suspect = true } = {}) {
    this.routing = routing;   // spec 20: dispatcher (default) | symbolic | symbolic+encoder
    this.engine = engine;
    /** World-aware reading (spec 16): 'off' (default) | 'veto' | 'choose' | 'observe'. The environment variable PSYS2_WORLD_AWARE sets the default for command-line tools; an explicit option wins. */
    this.worldAware = normalizeWorldAware(worldAware ?? globalThis.process?.env?.PSYS2_WORLD_AWARE);
    /** NX reading strategy (ADR-009): 'hybrid' (default) | 'neural' | 'rules'. Only used with the encoder formalizer and when `engine.formalizers.nx` is ready; otherwise the rules path answers. */
    this.nx = normalizeNxStrategy(nx);
    /** Best effort with loose words (spec 03 section 7.15): after everything else failed, execute the most sensible reading of the content words (off in the library, on in the shipped settings). */
    this.bestEffort = bestEffort;
    /** SUSPECT-WORD leniency (model ablation 2026-11-13, off by default): a segment the rules read completely but whose text holds a word no world knows that is a slip away from a known word is also tried spell-corrected (the correction is kept only when the rules read the corrected text completely), as an unparsed segment is. */
    this.suspect = suspect;
    /** Encoder fast path (PERF): when the rules read the whole message and the interpreter accepts every reading, skip the model. */
    this.fastPath = fastPath;
    /** Leniency (spec 03 sections 7.9 and 7.10): spell-correct unparsed text (on by default), accept the readable part of a message (off by default; the webchat turns it on). */
    this.spell = spell;
    this.partial = partial;
    this.language = language;
    /** Preferred formalizer strategy: 'rules' (default) or 'encoder'; per world it falls back to rules (spec 06). */
    this.formalizer = formalizer === 'encoder' ? 'encoder' : 'rules';
    this.isession = engine.interp.createSession();
    /** Discourse memory (spec 11, ADR-006): recent frames and the pending expectation. */
    this.discourse = new Discourse(this);
    /** The dialogue module (WORLDS-AS-MODULES M1, worlds/session.dialogue): the focus, the kind of every turn, the trace the why-answers are read from. */
    this.dialogue = new Dialogue(this);
    /** Persistent discussions and world instances (spec 13, ADR-008): bookkeeping around the turn, never changes a reading. */
    this.astra = createSessionAstra(this);
    this.sources = new Map();
    this._msg = 0;
    this.isession.add(this.isession.form.initDefaults());
  }

  /**
   * A cheap stand-in for validation (spec 03 section 7): only what `context()`, the rule formalizer and the interpreter read
   * (the interpreter session, the recent worlds). No discourse, no sources. Throws when the state cannot be cloned.
   */
  forkForValidation() {
    const s = Object.create(DialogSession.prototype);
    s.engine = this.engine; s.isession = this.isession.clone(); s.isession.sessionFacts = this.isession.sessionFacts; s._recentWorlds = [...(this._recentWorlds ?? [])];
    return s;
  }

  /**
   * Dry-run reading for the voice end-of-turn detector (spec 06 "Spoken messages"): do the rules find a complete reading of the whole text?
   * Side-effect free: works on a fork of the session, never executes anything on the real session, never touches the session language,
   * the discourse memory or the message counter. Bounded and cancellable (FREEZE 4):
   *   - its own turn guard with `deadlineMs` and the caller's `signal` (honoured at every cancellation point inside the rules);
   *   - at most one in flight per session: a newer call cancels the older (which answers `cancelled`) and waits for it to unwind;
   *   - no leniency (spelling variants, partial windows, best effort), no browser-API translation (the rules translator only);
   *   - skipped without any work for more than DRY_MAX_WORDS words, and for text with no word of any world's vocabulary.
   * While a real turn runs it declines (`busy`). Returns { complete, segments, reason }; `reason` is one of
   * ok, incomplete, refused, missing, ambiguous, empty, busy, cancelled, deadline, too-long, no-vocabulary, error.
   */
  async dryRead(text, { language, deadlineMs = 400, detail = false, signal = null } = {}) {
    const prev = this._dry;
    if (prev) { prev.ctl.abort(); try { await prev.done; } catch { /* the older run reports for itself */ } }
    if (signal?.aborted) return { complete: false, segments: 0, reason: 'cancelled' };
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    // SOAK-BUSY: the end-of-turn check and the NOISE classifier read the same text a moment apart: a settled answer for the same text, language and session state is reused for DRY_CACHE_MS
    const key = `${language ?? this.language}|${this._msg}|${this._rev ?? 0}|${this.isession.state?.['ui.shell']?.activeTab ?? ''}|${String(text ?? '').trim()}`;
    const hit = this._dryCache;
    if (hit && hit.key === key && Date.now() - hit.at < DRY_CACHE_MS) { await Promise.resolve(); if (signal?.aborted) return { complete: false, segments: 0, reason: 'cancelled' }; return detail ? hit.res : stripDetail(hit.res); }
    const run = { ctl, done: null };
    run.done = this._dryRun(text, { language, deadlineMs, detail: true, signal: ctl.signal }).then((res) => {
      if (!['cancelled', 'deadline', 'busy', 'error'].includes(res.reason)) this._dryCache = { key, at: Date.now(), res };
      return detail ? res : stripDetail(res);
    });
    this._dry = run;
    try { return await run.done; } finally { signal?.removeEventListener?.('abort', onAbort); if (this._dry === run) this._dry = null; }
  }


  async _dryRun(text, { language, deadlineMs, detail, signal }) {
    const { set, formalizers, interp, translator } = this.engine;
    const raw = String(text ?? '').trim();
    if (!raw) return { complete: false, segments: 0, reason: 'empty' };
    if (raw.split(/\s+/).length > DRY_MAX_WORDS) return { complete: false, segments: 0, reason: 'too-long', ...(detail ? { detail: { english: raw, language: language ?? this.language, readings: [], skipped: 'more than ' + DRY_MAX_WORDS + ' words' } } : {}) };
    const token = guard.install({ signal, hardMs: deadlineMs, softMs: deadlineMs * 0.7 });
    if (!token) return { complete: false, segments: 0, reason: 'busy' };   // a real turn owns the guard
    const db = createBudget();
    const bt = installBudget(db);   // a dry run is a turn of its own: its own compute budget
    try {
      const f = this.forkForValidation();
      let english = raw;
      const lang = language ?? this.language;
      const quick = translator?.rules ?? translator;   // the rules translator when there is one: the dry run never waits for a browser translator
      if (quick && lang !== 'en' && (quick.supports?.(lang, 'en') ?? true)) { guard.check('dry-translate'); english = textOf(await quick.translate(english, { from: lang, to: 'en' })) ?? english; }
      english = splitAnswerList(interp.lang.stripFiller(english) || english);
      guard.check('dry-vocabulary');
      const vocab = spellVocabulary(set);
      if (!(english.toLowerCase().match(/[a-z']+/g) ?? []).some((w) => vocab.has(w) && !FUNCTION_WORDS.has(w))) return { complete: false, segments: 0, reason: 'no-vocabulary', ...(detail ? { detail: { english, language: lang, readings: [], skipped: 'no word of any world' } } : {}) };
      const res = await formalizers.rules.formalize(english, { worlds: set, session: f.isession, source: 'dry', context: f.context(), router: this._router });
      guard.check('dry-read');
      if (db.exceeded) throw db.exceeded;   // a stage that swallowed BudgetExceeded must not report a reading
      const segs = res.segments ?? [];
      // DBG: with `detail` the answer also says how the text was read (the readings, their wires, the candidate worlds), still without executing anything
      const det = () => (detail ? { detail: { english, language: lang, readings: segs.map((x) => ({ text: x.text ?? '', world: x.match?.worldId ?? null, pattern: x.match?.patternId ?? null, strategy: x.strategy ?? null, unparsed: !!x.unparsed, partial: !!x.partial, ignored: x.ignored ?? [], candidates: (x.worlds ?? []).slice(0, 4), wires: x.wires ?? [] })) } } : {});
      if (!segs.length || segs.some((x) => x.unparsed || x.partial || x.ignored?.length)) return { complete: false, segments: segs.length, reason: 'incomplete', ...det() };
      for (const seg of segs) {
        guard.check('dry-resolve');
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r && (r.status === 'unsupported' || r.status === 'error')) return { complete: false, segments: segs.length, reason: 'refused', ...det() };
          if (r && (r.status === 'missing' || r.status === 'ambiguous')) return { complete: false, segments: segs.length, reason: r.status, ...det() }; }   // EOT2: a reading that still needs an argument ("play" -> what?) is not a whole message
      }
      return { complete: true, segments: segs.length, reason: 'ok', ...det() };
    } catch (e) {
      return { complete: false, segments: 0, reason: e instanceof TurnAborted ? (e.reason === 'stopped' ? 'cancelled' : 'deadline') : isBudgetExceeded(e) || db.exceeded ? 'budget' : 'error', ...(db.exceeded ? { budget: budgetReport(db), budgetExceeded: budgetRecord(db.exceeded, db, { input: raw, tab: this.isession?.state?.['ui.shell']?.activeTab ?? null, stage: guard.stage }) } : {}) };
    } finally { guard.release(token); releaseBudget(bt); }
  }

  /** Session wires as SOP Lang (short keys where unambiguous). */
  memory() {
    const L = this.engine.set.legends;
    const wires = this.isession.memory.sessionWires().map((w) => ({
      ...w, entries: w.entries.map((e) => ({ key: L.shortKey(w.type, e.key), value: e.value })),
    }));
    return serialize(wires);
  }

  /** Current state of one world (a copy), or of every world keyed by world id (spec 07). */
  state(worldId) {
    const all = this.isession.state;
    return structuredClone(worldId ? (all[worldId] ?? null) : all);
  }

  /** Host-initiated state change (a click on a tab, a toggle): shallow-merges `patch` into the world's state. No reply, no effects. */
  setWorldState(worldId, patch = {}) {
    this._rev = (this._rev ?? 0) + 1;
    const st = (this.isession.state[worldId] ??= {});
    Object.assign(st, structuredClone(patch));
    if (worldId === 'ui.shell' && patch.activeTab) this.astra?.onTabChange(patch.activeTab);   // the tab resumes its discussion (spec 13 section 1)
    return structuredClone(st);
  }

  /**
   * `observe` for a host that shows the world's reaction to the user: the text (the engine's own chess move, a tab's report) is put into the reply language the
   * way every reply is (rules and templates first, the on-device Translator as the fallback, a Romanian line when nothing can say it; never English in a Romanian
   * session). `textEnglish` keeps the English, `via` the routes used (RO-TRANSLATE-FALLBACK).
   */
  async observeIn(obs, { language } = {}) {
    const out = this.observe(obs);
    const lang = language ?? this.language ?? 'en', tr = this.engine.translator;
    if (out.text && lang !== 'en' && tr) {
      try {
        const parts = await translateParts([{ text: out.text, translate: true }], tr, lang);
        out.textEnglish = out.text; out.text = parts.map((p) => p.text).join('');
        if (parts.routes?.length) { out.via = [...parts.routes]; for (const v of parts.routes) tr.note?.(v, { direction: 'en->ro', strategy: v === 'translator-out' ? 'browser-api' : 'rules' }); }
      } catch { /* the English text is shown: a host string must reach the user */ }
    }
    return out;
  }

  /**
   * Record the outcome of a host-executed effect as a core.observation wire (spec 07 §1, vision §8), then, when the
   * effect came from a world whose ops.mjs exports `onObservation(ctx, obs)`, let that world react (update its state,
   * queue further effects, answer). Returns `{ id, text, state, effects }`; `text` is null when the world says nothing.
   * The host renders a non-empty `text` as a new assistant message and applies `state` and `effects` like a reply.
   */
  observe({ effect, ok = true, detail = '', data = null, world = null } = {}) {
    this._rev = (this._rev ?? 0) + 1;
    const id = this.isession.form.freshId('o');
    const pairs = [['core.observation.effect', atom(String(effect))], ['core.observation.ok', atom(ok ? 'true' : 'false')]];
    if (detail !== '' && detail != null) pairs.push(['core.observation.detail', str(String(detail))]);
    pairs.push(['core.seq', atom(this.isession.form.nextSeq())]);
    this.isession.add([makeWire(id, 'core.observation', pairs)]);
    const out = { id, text: null, state: {}, effects: [] };
    if (!world) return out;
    const stateBefore = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.effects = [];
    const res = this.engine.interp.observe(this.isession, world, { effect, ok, detail, data, id });
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k]) out.state[k] = structuredClone(v);
    out.effects = this.isession.effects;
    this.isession.effects = [];
    out.text = res?.reply ?? null;
    return out;
  }

  /**
   * Headless host (RD8): in the CLI and in scripts no browser executes the effects of a reply, so a world that waits for an observation
   * (the chess engine move) would wait for ever and answer "I am still thinking" to the next command. This reports every effect of `reply`
   * that a world observes as failed ("no host"); the world then uses its own fallback (the built-in chess player). Returns the texts the
   * worlds answer, in order. A browser host does not call it: it runs the effects and calls `observe` with the real outcome.
   */
  settleHeadless(reply) {
    const out = [];
    const run = (effects, depth) => {
      for (const e of effects ?? []) {
        budget.tick('dialog.settle');
        const world = e.world;
        if (!world || typeof this.engine.set.get(world)?.ops?.onObservation !== 'function') continue;
        const f = this.observe({ effect: e.name, ok: false, detail: 'no host', world });
        if (f.text) out.push(f.text);
        if (f.effects.length && depth < 5) run(f.effects, depth + 1);
      }
    };
    run(reply?.effects, 0);
    return out;
  }

  /**
   * Routing context (spec 03 section 4, ADR-004): what the application state says about where a command belongs.
   * `{ activeTab, tabWorld, modalWorld, gameWorld, recentWorlds, lastWorld }`. The tab owner comes from the `tab=` of a
   * world or the built-in tabs; `gameWorld` is `ui.shell` state `activeGame` (set by the host); `modalWorld` is the
   * world whose state has an open `inputMode`.
   */
  get routing() { return this._routing; }
  set routing(v) { this._routing = normalizeRouting(v); }

  /** The router of this session: the engine's policy router, or (routing=symbolic*, meta.worlds prepared) the same ordered by meta.worlds. */
  get _router() {
    if (!isSymbolic(this._routing) || !this.engine.meta) return this.engine.router;
    return (this._symRouter ??= createSymbolicRouter(this.engine.router, () => this.engine.meta));
  }

  context() {
    const BUILTIN = { robot: 'ui.avatar', avatar: 'ui.avatar', editor: 'docs.editor', documents: 'docs.editor' };
    const st = this.isession.state;
    const activeTab = st['ui.shell']?.activeTab ?? null;
    const tabWorld = activeTab ? (this.engine.set.list().find((w) => w.tab?.id === activeTab)?.id ?? BUILTIN[activeTab] ?? null) : null;
    const modalWorld = Object.keys(st).find((id) => st[id]?.inputMode) ?? null;
    const gameWorld = st['ui.shell']?.activeGame ?? null;
    const recentWorlds = [...(this._recentWorlds ?? [])];
    const ambientWorlds = this.engine.set.list().filter((w) => w.ambient).map((w) => w.id);   // worlds of an always-visible view (the avatar): present on every tab
    const stepWorlds = this.discourse?.actions?.[0]?.worlds ?? [], redoWorlds = this.discourse?.redoStack?.at?.(-1)?.worlds ?? [];   // the worlds of the newest step on the timeline, and of the newest undone step: "undo" / "redo" follow them whichever tab is open
    const project = (segments) => {   // the states and the worlds after these readings are carried out, on a copy of the session (spec 03 "Clauses in sequence")
      const f = this.forkForValidation(), worlds = [];
      for (const seg of segments) {
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = this.engine.interp.resolve(f.isession, w); if (r?.status && r.status !== 'supported') return null; }
        const id = seg.match?.worldId ?? seg.match?.pattern?.worldId ?? seg.routing?.winner?.worldId;
        if (id && !worlds.includes(id)) worlds.unshift(id);
      }
      return { states: f.isession.state, worlds };
    };
    return { project, activeTab, tabWorld, modalWorld, gameWorld, recentWorlds, lastWorld: recentWorlds[0] ?? null, ambientWorlds, stepWorlds, redoWorlds, states: st, asked: this.discourse?.pending?.world ?? null, lastAction: this.discourse?.frames?.[0]?.world ?? null };   // asked and lastAction: what meta.worlds reads (a question the world asked; the world of the last request)
  }

  /** Legacy focus map derived from the context: +3 for the tab world, +1 for each recent world. */
  focus() {
    const c = this.context();
    const focus = {};
    for (const w of c.recentWorlds) focus[w] = (focus[w] ?? 0) + 1;
    if (c.tabWorld) focus[c.tabWorld] = (focus[c.tabWorld] ?? 0) + 3;
    return focus;
  }

  /**
   * Ops reasoner: ask the world whether the facts just told still make a consistent world (hook `checkStatement(ctx, { ids })`, which
   * returns { problem } or nothing). A problem retracts the facts and is returned as the sentence to say; otherwise null.
   */
  _refuseFacts(worldId, facts) {
    if (!worldId) return null;
    const ids = facts.filter((w) => !w.type.startsWith('core.')).map((w) => w.id);
    const r = this.engine.interp.hook(this.isession, worldId, 'checkStatement', { ids });
    if (!r?.problem) return null;
    for (const id of ids) this.isession.memory.retract(id, 'refused: ' + r.problem);
    return `That does not add up. ${r.problem}`;
  }

  _noteWorlds(segments) {
    // an undo / redo moves along the timeline, it does not put its world in charge of the conversation ("undo that" answered by the tab's world with "nothing to take back"
    // must not make that world the one that reads the next question)
    const ids = segments.filter((s) => !/\.(?:undo|redo)(?:\.|$)/.test(s.match?.patternId ?? '')).map((s) => s.match?.worldId).filter((w) => w && w !== 'ui.shell' && w !== 'kids.common');
    this._recentWorlds = [...new Set([...ids.reverse(), ...(this._recentWorlds ?? [])])].slice(0, 3);
  }

  /**
   * Last resort for a segment nobody parsed (spec 03 sections 7.9 and 7.10): the candidate worlds (open tab, modal, game, recent, router top 3)
   * are tried in turn with the text spell-corrected against the world's own vocabulary (abbreviations and typos, then one known word swapped
   * for a close neighbour), and, when `partial` is on, with the longest run of words the rules read. Accepted only when the rules of the
   * world parse the text completely. Returns the replacement segments, or null.
   */
  _lenient(seg, opts, o, depth = 0) { return perf.time('lenient', () => this._lenientRun(seg, opts, o, depth)); }

  async _lenientRun(seg, opts, o, depth = 0) {
    budget.tick('dialog.lenient');
    const late = () => guard.soft() || (o.steps != null && ++o.steps > LENIENT_MAX_STEPS);   // out of time: no further guessing
    if (late()) return null;
    const { spell, partial } = o;
    const { set, formalizers } = this.engine;
    const rules = formalizers.rules;
    const ctx = this.context();
    const ids = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...ctx.recentWorlds, ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)]
      .filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length && !(opts.excluded ?? []).includes(w)).slice(0, 5);
    ids.push('*');   // finally every world together (a clause of a longer message may belong to a world the whole message did not suggest)
    const setOf = (world) => (world === '*' ? (opts.worlds ?? set) : restrictedSet(set, [world]));
    const vocabOf = (world) => (world === '*' ? spellVocabulary(set) : worldVocabulary(set, world));
    const protect = protectedWordsOf(set, ctx.tabWorld);   // words the open tab knows are never changed
    const parse = async (world, text) => {
      let res;
      try { res = await rules.formalize(text, { ...opts, worlds: setOf(world) }); } catch { return null; }
      return res.segments.length && res.segments.every((x) => !x.unparsed) ? res : null;
    };
    const crossTabOk = (res, corrections) => this._crossTabOk(res.segments, corrections, ctx, seg.text);
    const wrap = (res, extra) => res.segments.map((x, k) => ({ ...x, span: seg.span, strategy: 'rules', ...extra, ...(extra.ignored && k > 0 ? { ignored: [] } : {}) }));
    if (depth > 0) { const direct = await parse('*', seg.text); if (direct) return wrap(direct, { corrections: [] }); }   // a clause on its own
    const spelled = new Map();
    if (spell) {
      // proper names and their wrappers (RD10): whole-value matching against the lexicons, bounded in candidates and time
      try { nameIndex(set); } catch { /* none */ }   // built once per world set (not counted in the budget)
            const order = [...new Set(ids.filter((w) => w !== '*').flatMap((w) => set.available(w)))];
      let named = [];
      try { named = perf.timeSync ? perf.timeSync('names', () => nameCandidates(seg.text, { set, vocab: spellVocabulary(set), worldOrder: order })) : nameCandidates(seg.text, { set, vocab: spellVocabulary(set), worldOrder: order }); } catch { named = []; }
      for (const cand of named.slice(0, 4)) {
        // the worlds that own the value first (and are candidates), then the usual order; every world together is tried before the rest
        const own = ids.filter((w) => w !== '*' && cand.worlds.some((cw) => set.available(w).includes(cw)));
        for (const world of [...new Set([...own.slice(0, 2), '*'])]) {
          const res = await parse(world, cand.text);
          if (res) return wrap(res, { corrections: cand.corrections });
        }
      }
      for (const world of ids) {
        if (late()) return null;
        const sp = spellCorrect(seg.text, { vocab: vocabOf(world), protect, short: world === ctx.tabWorld });
        spelled.set(world, sp);
        if (!sp.corrections.length) continue;
        const res = await parse(world, sp.text);
        if (res && crossTabOk(res, sp.corrections)) return wrap(res, { corrections: sp.corrections });
        // several typos in the open tab's world ("the un si up not udner clouds"): after the sure corrections, one more word (also a two-letter one) swapped for a close
        // word of the tab's vocabulary; the rest of the sentence decides, the world must read all of it (at most 12 candidate texts, the stage's time budget)
        if (world === ctx.tabWorld) {
          for (const v of spellAlternates(sp.text, { vocab: vocabOf(world), protect, short: true, maxTexts: 12 })) {
            if (late()) return null;
            const r2 = await parse(world, v.text);
            if (r2 && crossTabOk(r2, [...sp.corrections, ...v.corrections])) return wrap(r2, { corrections: [...sp.corrections, ...v.corrections] });
          }
        }
      }
      // RD1b: a lone word that is valid somewhere ("next") is never swapped for a neighbour ("neat"): there is nothing around it to confirm the guess
      const lone = (seg.text.match(/[\p{L}\p{N}]+/gu) ?? []).length < 2;
      for (const world of lone ? [] : ids) {
        for (const v of spellAlternates(seg.text, { vocab: vocabOf(world), protect })) {
          if (late()) return null;
          const res = await parse(world, v.text);
          if (res && crossTabOk(res, v.corrections)) return wrap(res, { corrections: v.corrections });
        }
      }
    }
    if (spell && this._voice && ctx.tabWorld && set.get(ctx.tabWorld)?.patterns?.length && depth === 0) {
      // RP3: spoken garble ("mcdavatara human" for "make avatar a human"): split / merge / sound-alike words against the ACTIVE tab's vocabulary only
      // (never another world: RD1b). Cheap matches are executed, weak ones (two sound-alike pieces) are offered as "Did you mean".
      let cands = [];
      try { cands = garbleCandidates(seg.text, { vocab: worldVocabulary(set, ctx.tabWorld), known: (w) => !!protect?.has(w) || !!spellVocabulary(set).has(w), functionWords: FUNCTION_WORDS }); } catch { cands = []; }
      for (const c of cands) {
        if (late()) return null;
        const res = await parse(ctx.tabWorld, c.text);
        if (!res) continue;
        if (c.cost <= 1) return wrap(res, { corrections: c.corrections });
        return [{ ...seg, suggestions: [c.text.replace(/^./, (x) => x.toUpperCase()) + '.'] }];
      }
      // a weak sound-alike of one of the tab's own words ("Chester" for "chapter"): never executed, offered with the tab's examples that use the word
      let weak = [];
      try { weak = weakSoundAlikes(seg.text, { vocab: worldVocabulary(set, ctx.tabWorld), functionWords: FUNCTION_WORDS, protect }); } catch { weak = []; }
      for (const wk of weak) {
        const ex = (set.get(ctx.tabWorld)?.patterns ?? []).flatMap((p) => p.canonical ?? []).filter((e) => new RegExp(`\\b${wk.to}s?\\b`, 'i').test(e)).sort((a, b) => Number(new RegExp(`\\b${wk.to}\\b`, 'i').test(b)) - Number(new RegExp(`\\b${wk.to}\\b`, 'i').test(a)) || a.length - b.length).slice(0, 2);
        if (ex.length) return [{ ...seg, suggestions: ex }];
      }
    }
    if (partial) {
      // several clauses and none read: every clause on its own (spelling and partial), the unread ones stay "not understood"
      if (depth === 0) {
        const parts = [];
        let from = 0, any = false;
        const cuts = [...seg.text.matchAll(/,|\b(?:and then|and also|and|then|but|also)\b/gi)];
        const pieces = [];
        for (const m of [...cuts, { index: seg.text.length, 0: '' }]) {
          const text = seg.text.slice(from, m.index);
          if (/\p{L}/u.test(text)) pieces.push({ text: text.trim(), start: from + (text.length - text.trimStart().length) });
          from = m.index + m[0].length;
        }
        if (pieces.length > 1) {
          for (const pc of pieces) {
            const sub = { ...seg, text: pc.text, span: [seg.span[0] + pc.start, seg.span[0] + pc.start + pc.text.length] };
            const fixed = await this._lenient(sub, opts, o, 1);
            if (fixed) { any = true; parts.push(...fixed); } else parts.push({ ...sub, unparsed: true, wires: [], match: null, alternatives: [], errors: seg.errors ?? [], corrections: [], ignored: [] });
          }
          if (any) return parts;
        }
      }
      for (const world of ids) {
        if (late()) return null;
        const sp = spelled.get(world);
        const bases = sp?.corrections.length ? [sp, { text: seg.text, corrections: [] }] : [{ text: seg.text, corrections: [] }];
        for (const base of bases) {
          const win = await findPartialWindow(base.text, async (slice) => { const r = await parse(world, slice); return r && !changesIntoQuestion(base.text, slice, r.segments.map((x) => x.match?.kind)) ? r : null; },
            { stop: late, minCoverage: depth ? 0.5 : 0.25, canIgnore: ignorable(vocabOf(world), spellVocabulary(set)) });
          if (win) {
            const used = win.text.toLowerCase();
            return wrap(win.result, { corrections: base.corrections.filter((c) => used.includes(c.to.toLowerCase())), ignored: win.ignored.map((x) => x.text) });
          }
        }
      }
    }
    return null;
  }

  /**
   * Best effort with loose words (spec 03 section 7.15), the very last resort for a segment nobody read: candidate sentences are built from the
   * pattern examples of the candidate worlds with the input's own values, read by the rules and checked by the value checker (nothing invented,
   * nothing numeric or coloured dropped). Returns { segments } (executed) or { suggestions } (Did you mean) or null.
   */
  async _bestEffortSeg(seg, opts) {
    budget.tick('dialog.besteffort');
    const { set, formalizers, interp } = this.engine;
    const P = BEST_EFFORT_POLICY;
    const ctx = this.context();
    const worlds = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...ctx.recentWorlds, ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)]
      .filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length && !(opts.excluded ?? []).includes(w));
    const cands = looseCandidates(set, seg.text, { worlds, tabWorld: ctx.tabWorld });
    if (!cands.length) return null;
    const norm = (wires) => JSON.stringify(wires.map((w) => [w.type, w.entries.filter((e) => !/^core\.(?:via|source|seq|span|in)$/.test(e.key)).map((e) => [e.key, e.value])]));   // what is asked, not how it was phrased
    let verified = [];
    for (const c of cands.slice(0, P.maxVerify)) {
      if (guard.soft()) break;   // turn guard: score what was verified so far
      const vc = checkValues(seg.text, c.text);
      if (!vc.ok) continue;
      let res;
      try { res = await formalizers.rules.formalize(c.text, { ...opts, worlds: restrictedSet(set, [c.world]) }); } catch { continue; }
      if (!res.segments.length || res.segments.some((x) => x.unparsed)) continue;
      let refused = false;
      try {
        const f = this.forkForValidation();
        for (const sg of res.segments) { f.isession.add(sg.wires); for (const w of sg.wires) { const r = interp.resolve(f.isession, w); if (r && (r.status === 'unsupported' || r.status === 'error')) refused = true; } }
      } catch { /* cannot fork: accept */ }
      if (refused) continue;
      verified.push({ c, res, sop: norm(res.segments.flatMap((x) => x.wires)) });
      if (verified.length >= 3) break;
    }
    if (!verified.length) return null;   // nothing the rules read: the usual "Did you mean" of ui.help
    let waPick = null;
    if (this._wa && this._wa !== 'off') {   // spec 16: the library orders the verified readings; a first reading that leaves content words out is asked about, not executed
      const rv = reviewBestEffort(this, verified);
      verified = rv.verified; waPick = rv.note;
      if (rv.veto) return { suggestions: [...new Set(verified.map((v) => v.c.text))].slice(0, 2), veto: rv.veto, pick: waPick };
    }
    const best = verified[0];
    const rival = verified.find((v) => v.sop !== best.sop);
    if (rival && best.c.score - rival.c.score < P.margin) return { suggestions: [best.c.text, rival.c.text] };
    const real = await formalizers.rules.formalize(best.c.text, { ...opts, worlds: restrictedSet(set, [best.c.world]) });
    const segments = real.segments.map((x, k) => ({ ...x, span: seg.span, strategy: 'rules', corrections: [], ignored: [], ...(k === 0 ? { bestEffort: { took: best.c.text, ignored: best.c.ignored, world: best.c.world }, ...(waPick ? { pick: waPick } : {}) } : {}) }));
    return { segments };
  }

  /**
   * TYPED READING (spec 16 section 9): a clause the rules read and the world refused is read again by the types of its words (`src/dialog/typed-reader.mjs`, the library's typed
   * lexicon). It proposes; the proposal replaces the reading only when the world then supports it. Never throws: a failure keeps the reading.
   */
  /** What the world says to segments on a fork of the session (nothing reaches the real one): per wire `{ status, refused, changed }`; `refused` is the world's own refusal (an answer with a `fallback` code and no change: "1 to day is not a unit I know"). */
  _outcomes(segments) {
    const out = [];
    try {
      const f = this.forkForValidation();
      for (const seg of segments) {
        f.isession.add(seg.wires);
        for (const w of seg.wires) {
          const r = this.engine.interp.resolve(f.isession, w);
          if (!r?.status) continue;
          const env = r.envelope ?? {};
          out.push({ status: r.status, refused: r.status !== 'supported' ? r.status !== 'missing' : !!env.fallback && !(env.diff?.changed?.length || env.diff?.added?.length || env.diff?.removed?.length), changed: !!(env.diff?.changed?.length || env.diff?.added?.length || env.diff?.removed?.length || env.diff?.moved?.length) });
        }
      }
    } catch { return null; }   // no run: no answer (null), not an empty one
    return out;
  }

  _withTypedReader(formal) {
    const lib = this.engine.sopworld;
    if (!lib?.typedLexicon || globalThis.process?.env?.PSYS2_TYPED !== 'on') return formal;   // off unless PSYS2_TYPED=on (P6, spec 16 section 15: no reply of the shipped real set changes)
    const segments = formal.segments.map((seg) => {
      try {
        if (seg.unparsed || !seg.match?.worldId || !seg.wires?.length) return seg;
        if (!this._outcomes([seg])?.some((x) => x.refused)) return seg;   // only a refused reading is read again
        const executor = this.engine.set.get(seg.match.worldId)?.ops?.executor;
        if (!executor?.referents) return seg;
        const out = proposeByTypes(seg, { lib, executor, state: this.isession.state[seg.match.worldId] ?? {}, knowledge: this.engine.knowledge, set: this.engine.set, form: this.isession.form, outcomes: (x) => this._outcomes(x) });
        return out ?? seg;
      } catch { return seg; }
    });
    return { ...formal, segments, wires: segments.flatMap((x) => x.wires ?? []) };
  }

  async _withBestEffort(formal, opts) {
    const segments = [];
    for (const seg of formal.segments) {
      const r = seg.unparsed ? await perf.time('bestEffort', () => this._bestEffortSeg(seg, opts)) : null;
      if (r?.segments) segments.push(...r.segments);
      else segments.push(r?.suggestions ? { ...seg, suggestions: r.suggestions, ...(r.veto ? { veto: r.veto, pick: r.pick } : {}) } : seg);
    }
    return { ...formal, segments, wires: segments.flatMap((x) => x.wires) };
  }

  /** True when the text of `seg` holds a word that no world knows and that is one slip (spell budget) from a known word of some world. */
  _suspectWord(seg) {
    try {
      const set = this.engine.set;
      if (this._dryStatuses([seg]).every((x) => x === 'supported')) return false;   // a reading the interpreter accepts is left alone (names, dictated text); only a refused one (unknown tab, unknown item, missing argument) is suspect
      const protect = protectedWordsOf(set, this.context().tabWorld);
      return spellCorrect(seg.text, { vocab: spellVocabulary(set), protect, short: false, abbreviations: false }).corrections.length > 0;
    } catch { return false; }
  }

  async _withLeniency(res, opts, o) {
    if ((!res.segments.some((x) => x.unparsed) && !(this.suspect && o.spell)) || !(o.spell || o.partial)) return res;
    const segments = [];
    o = { ...o, steps: 0 };   // the whole leniency stage of this message (spelling variants, partial windows) shares one step budget
    for (const seg of res.segments) {
      let fixed = seg.unparsed ? await this._lenient(seg, opts, o) : null;
      if (!fixed && this.suspect && o.spell && !seg.unparsed && !seg.corrections?.length && this._suspectWord(seg)) {
        const f2 = await this._lenient(seg, opts, { ...o, partial: false });   // spelling only
        if (f2?.length && f2.every((x) => !x.unparsed) && f2.some((x) => x.corrections?.length)) fixed = f2;
      }
      if (fixed) segments.push(...fixed); else segments.push(seg);
    }
    return { ...res, segments, wires: segments.flatMap((x) => x.wires) };
  }

  /**
   * Formalize with the preferred strategy, per world falling back to the rule formalizer (spec 06).
   * Each returned segment carries `strategy`. Unparsed encoder segments are retried with the rules.
   */
  /**
   * Encoder fast path: the rules read every segment of `english` completely (no spelling correction, nothing ignored) and the interpreter
   * accepts every reading (nothing unsupported or failing). Tried on a copy of the session, so a refusal leaves no trace; returns the
   * segments read on the real session, or null.
   */
  async _quickRules(english, opts) {
    const { formalizers, interp } = this.engine;
    const clauses = /[,;:\n]|\b(?:and|then|also|but|or|next|after|before|while|so|because|if)\b/i.test(english) || (english.match(/\S+/g)?.length ?? 0) > 8;   // a long message without a connective ("draw a blue house what sound does a duck make ...") is several clauses too   // several clauses: the model segments, the rules alone may cut wrongly
    const encoder = formalizers.encoder;
    if (clauses && !(typeof encoder?.quickSegmentation === 'function' && encoder.ready?.())) return null;
    let f;
    try { f = this.forkForValidation(); } catch { return null; }
    const probe = await perf.time('fast.probe', () => formalizers.rules.formalize(english, { ...opts, session: f.isession, context: f.context(), source: 'fast' }));
    if (probe.segments.length < 1 || probe.segments.length > (clauses ? 4 : 1) || probe.segments.some((s) => s.unparsed || s.corrections?.length || s.ignored?.length || s.partial || (s.routing?.contested && s.routing.runnerUp?.worldId && s.routing.runnerUp.worldId !== s.routing.winner?.worldId))) return null;   // a contested routing (another world read it too: "put it in the top right corner" on the Drawing tab) is the model's to decide
    if (clauses) {   // multi-clause (PERF round 2): one model pass for the segmentation; the fast path holds only when the model cuts exactly where the rules cut and is clearly sure
      const top = await perf.time('fast.segment', () => encoder.quickSegmentation(english, { session: this.isession, context: this.context() }));
      const norm = (t) => t.toLowerCase().replace(/^[\s,;:.!?]*(?:(?:and|then|also|but|so|next|after that)\b[\s,;:]*)*/, '').replace(/[\s,;:.!?]+$/, '').trim();
      if (!top || top.margin < FAST_SEGMENT_MARGIN || top.pieces.length !== probe.segments.length || top.pieces.some((p, i) => norm(p.text) !== norm(probe.segments[i].text) || p.world !== probe.segments[i].routing?.winner?.worldId)) return null;
    }
    try {
      for (const seg of probe.segments) {
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r && (r.status === 'unsupported' || r.status === 'error')) return null; }
      }
    } catch { return null; }
    const res = await perf.time('fast.rules', () => formalizers.rules.formalize(english, opts));
    for (const s of res.segments) s.strategy = 'rules';
    perf.count('fast.path');
    return { segments: res.segments, wires: res.segments.flatMap((s) => s.wires), dispatch: null, fast: true };
  }

  /**
   * The interpreter's statuses (supported, missing, unsupported, error ...) of a reading on a copy of the session (a dry run: the actions run on the copy). The
   * spelling stage, the name repair and the capability check all ask this of the SAME reading of the SAME message (one `segments` array), and a dry run of an
   * action is a whole execution of it, so the answer is kept for the array within the turn (the session does not change before the real run).
   */
  _dryStatuses(segments) {
    const hit = this._dryMemo?.get(segments);
    if (hit && hit.msg === this._msg) return [...hit.out];
    const out = [];
    try {
      const f = this.forkForValidation();
      for (const seg of segments) {
        f.isession.add(seg.wires);
        for (const w of seg.wires) { const r = this.engine.interp.resolve(f.isession, w); if (r?.status) out.push(r.status); }
      }
    } catch { return out; /* no dry run: no statuses (not kept) */ }
    (this._dryMemo ??= new WeakMap()).set(segments, { msg: this._msg, out: [...out] });
    return out;
  }

  /**
   * Active world first (RD1, spec 03 section 7.9a): a message the rules read completely can still carry a typo that another world's free slot
   * swallowed ("bugger house pls" read as "where do buggers live") or that the active world's own free tail hides ("nect to a house").
   * The text is spell-corrected against the vocabulary of the OPEN TAB's world only. The corrected reading replaces the original when
   * (1) every corrected word is unknown to every world (a real word of any world is never "corrected"), (2) the corrected text is read
   * completely, with nothing ignored, by the active world's own rules, and (3) the original reading is weaker: it belongs to another world,
   * or the world refused it (unsupported). Returns the segments of the corrected reading, or null (keep the original).
   */
  async _activeSpell(english, res, opts, lenient) {
    budget.tick('dialog.spell');
    if (!lenient.spell || !res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    const { set, formalizers, interp } = this.engine;
    const ctx = opts.context ?? this.context();
    const world = ctx.tabWorld;
    if (!world || !set.get(world)?.patterns?.length) return null;   // an open modal input that did not consume the message does not matter here
    // the dry run of a reading on a copy of the session: the interpreter's statuses (supported, missing, unsupported, error ...)
    const statusesOf = (segments) => this._dryStatuses(segments);
    const refused = (segments) => statusesOf(segments).some((x) => x === 'unsupported' || x === 'error');
    // is the original weaker? another world read it, or the interpreter refused it
    const origStatuses = statusesOf(res.segments);
    const wasRefused = origStatuses.some((x) => x === 'unsupported' || x === 'error');
    const unhappy = origStatuses.some((x) => x !== 'supported');   // missing, refused, failed: the reading did not do what it said
    const weak = wasRefused || res.segments.some((x) => x.match?.worldId && x.match.worldId !== world && x.match.worldId !== 'ui.shell');
    if (!weak) return null;   // (PERF round 3: the vocabularies below are only built for a weak reading, not for every message)
    // a word some world knows ("yes" for "eyes") is changed only when another world read the original and did not carry it out, or the interpreter refused it; a word nobody knows is a typo whenever the original is weak
    const otherWorld = res.segments.some((x) => x.match?.worldId && x.match.worldId !== world && x.match.worldId !== 'ui.shell');
    const knownToo = otherWorld && (wasRefused || unhappy);   // the wrong world read it and did not carry it out
    // a typo can only hide in a free-text slot (noun, word, words, rest, agent, recent), in a corrected or an ignored word: a reading whose words all matched literals
    // or lexicon entries has no unknown word to repair (PERF round 3: "hello" no longer builds the spelling vocabularies of the first message)
    const FREE = new Set(['noun', 'word', 'words', 'rest', 'agent', 'recent']);
    if (!knownToo && !res.segments.some((x) => x.corrections?.length || x.ignored?.length || x.partial || !x.match || Object.values(x.match.slots ?? {}).some((sl) => FREE.has(sl?.class)))) return null;
    const global = spellVocabulary(set);
    let words;
    try { words = spellCandidates(english, { vocab: worldVocabulary(set, world), protect: protectedWordsOf(set, world) }); } catch { return null; }
    if (!knownToo) words = words.filter((c) => !isKnownWord(c.from.toLowerCase(), global));
    else if (!(otherWorld && wasRefused)) words = words.filter((c) => c.from.length < 4 || !isKnownWord(c.from.toLowerCase(), global));   // a content word some world knows ("shape") is never swapped; only short ones ("yes")
    // candidate texts: the best neighbour of every unknown word, then each word's other neighbours one at a time
    const replace = (text, picks) => { let out = text; for (const [c, w] of [...picks].sort((x, y) => y[0].span[0] - x[0].span[0])) out = out.slice(0, c.span[0]) + w + out.slice(c.span[1]); return out; };
    const texts = [];
    if (words.length) texts.push({ text: replace(english, words.map((c) => [c, c.options[0]])), picks: words.map((c) => ({ from: c.from, to: c.options[0], span: c.span })) });
    for (const c of words) for (const w of c.options.slice(1)) texts.push({ text: replace(english, [[c, w]]), picks: [{ from: c.from, to: w, span: c.span }] });
    // a refused reading may hide a typo that spells another word of the active world ("yes" for "eyes"): one known word swapped for a neighbour
    if (knownToo) for (const v of spellAlternates(english, { vocab: worldVocabulary(set, world), protect: protectedWordsOf(set, world) })) { if (!v.corrections.some((c) => sameWordForm(c.from.toLowerCase(), c.to.toLowerCase()) || (!(otherWorld && wasRefused) && c.from.length >= 4 && isKnownWord(c.from.toLowerCase(), global)))) texts.push({ text: v.text, picks: v.corrections }); };
    if (!texts.length) return null;
    for (const t of texts.slice(0, 12)) {
      let fixed;
      try { fixed = await formalizers.rules.formalize(t.text, { ...opts, worlds: set, session: this.isession, source: opts.source, context: ctx, router: this._router }); } catch { continue; }
      if (!fixed.segments.length || fixed.segments.some((x) => x.unparsed || x.partial || x.ignored?.length)) continue;
      if (!fixed.segments.some((x) => x.match?.worldId === world) || refused(fixed.segments)) continue;
      const segments = fixed.segments.map((x) => ({ ...x, strategy: 'rules', corrections: [...(x.corrections ?? []), ...t.picks.map((p) => ({ ...p, kind: 'spell' }))], activeSpell: true }));
      return { segments, wires: segments.flatMap((x) => x.wires) };
    }
    return null;
  }


  /**
   * RD1b: a spelling correction never opens another world's tab on its own. A reading of a world other than the open tab's that owns a tab is
   * rejected when a free-text slot of that world (a catch-all) swallows most of the sentence, unless the message names the world.
   */
  /** Worlds whose name (tab or object: avatar, chart, map ...) occurs anywhere in `text` (no determiner needed, unlike routing's `namedWorlds`). */
  _worldsNamedIn(text) {
    const padded = ` ${text.toLowerCase().match(/[a-z0-9]+/g)?.join(' ') ?? ''} `;
    return new Set([...namingTables(this.engine.set).names].filter(([, list]) => list.some((n) => padded.includes(` ${n} `))).map(([w]) => w));
  }

  _crossTabOk(segments, corrections, ctx, text) {
    if (!ctx.tabWorld || !corrections?.length) return true;
    const { set } = this.engine;
    const fixedText = corrections.reduce((t, c) => t.replace(c.from, c.to), text);   // a world named through the correction ("vatar" -> avatar) is named
    const namedNow = this._worldsNamedIn(`${text} ${fixedText}`);
    return segments.every((x) => {
      const w = x.match?.worldId;
      if (!w || w === ctx.tabWorld || w === 'ui.shell' || w === 'ui.help' || namedNow.has(w) || !tabOfWorld(set, w)) return true;
      // the world "read" the sentence only if a catch-all does not swallow most of it (a search query, a name sink taking a typo for text)
      const free = Object.values(x.match?.slots ?? {}).filter((sl) => sl.class === 'rest' || sl.class === 'words').reduce((n, sl) => n + (String(sl.text ?? sl.value ?? '').match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0);
      const total = (x.text ?? text).match(/[\p{L}\p{N}]+/gu)?.length ?? 1;
      return !(corrections.some((c) => (c.kind ?? 'spell') === 'spell') && free * 2 > total);
    });
  }

  /**
   * Make the lazily loaded engines (ops `prepare()`, spec 04) of the segments' worlds ready before a dry run: the real run awaits them
   * (see _send), a dry run on a fork would otherwise get "the engine is still loading" (`missing`) and wrongly reject a good reading (RP5c).
   */
  async _prepareWorldsOf(segments) {
    for (const w of new Set(segments.map((x) => x.match?.worldId).filter(Boolean))) {
      const prep = this.engine.set.get(w)?.ops?.prepare;
      if (typeof prep === 'function') { try { await prep(); } catch { /* the operation then says it is not ready */ } }
    }
  }

  /**
   * Capability check (RD10, spec 03 section 7.9c): a world claims a sentence only if it can do it. A reading of a world other than the open
   * tab's (or, when the message names another world, of the tab's world too) whose dry run on a copy of the session is refused or finds nothing
   * to act on ("change avatar to a man" read by the editor when "avatar" is not in the document) drops, and the message is read again without
   * that world: exactly, then with the spelling stage (so "change vatar to a man" reaches the avatar). When nothing else reads it, the original
   * reading stays (its answer explains what is missing). Returns the segments of the new reading, or null.
   */
  /**
   * Name repair (RD10): a free-text slot read a misspelt proper name as an unknown value ("Play Little Almb": "I do not know a song called ...").
   * When a reading found nothing to act on (`missing`) and a lexicon value is close to a window of the message, the message is read again with the
   * value; the new reading must be read completely and carried out (no `missing`, no refusal). Returns the segments, or null.
   */
  async _nameRepair(english, res, opts, lenient) {
    budget.tick('dialog.names');
    if (!lenient.spell || !res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    await this._prepareWorldsOf(res.segments);
    const { set, formalizers, interp } = this.engine;
    const ctx = opts.context ?? this.context();
    const dry = (segments) => this._dryStatuses(segments);
    if (!dry(res.segments).includes('missing')) return null;   // (PERF round 3: the cheap test first; the name vocabulary is built only when something is missing)
    let cands;
    try { cands = nameCandidates(english, { set, vocab: spellVocabulary(set), worldOrder: [...new Set([ctx.tabWorld, ...(ctx.recentWorlds ?? [])].filter(Boolean).flatMap((w) => set.available(w)))] }); } catch { return null; }
    if (!cands.length) return null;
    const t0 = Date.now();
    for (const cand of cands.slice(0, 3)) {
      if (Date.now() - t0 > 300) break;
      let fixed;
      try { fixed = await formalizers.rules.formalize(cand.text, { ...opts, worlds: set, session: this.isession, source: opts.source, context: ctx, router: this._router }); } catch { continue; }
      if (!fixed.segments.length || fixed.segments.some((x) => x.unparsed || x.partial || x.ignored?.length)) continue;
      if (dry(fixed.segments).some((x) => x !== 'supported')) continue;
      const segments = fixed.segments.map((x) => ({ ...x, strategy: 'rules', corrections: [...(x.corrections ?? []), ...cand.corrections] }));
      return { segments, wires: segments.flatMap((x) => x.wires) };
    }
    return null;
  }

  /**
   * ONE STORY (spec 03 "Sentences in sequence", rule 2): a message of two or more sentences whose reading mixes worlds and leaves a part unread ("I want 2 pencils and I give the
   * cashier 10 lei. How much change do I get?" on the drawing tab: the drawing world takes the first sentence, so the change question finds no list) is read again, by the rules,
   * once per world that read a part of it, on a view of that world alone. A world that reads EVERY sentence in sequence, and whose readings its dry run does not refuse, takes the
   * whole message: the sentences of one message are one story, told to one world. The open tab's world is tried first, then the others in the order they read. Returns the segments or null.
   */
  async _oneStory(english, res, opts) {
    if (!res.segments.length || !res.segments.some((x) => x.unparsed) || splitSentences(english).length < 2) return null;
    budget.tick('dialog.story');
    const { set, formalizers } = this.engine;
    const ctx = opts.context ?? this.context();
    const SKIP = new Set(['ui.shell', 'ui.help', 'core', 'lang.common', 'talk', 'conversation']);
    const worldsOf = (segs) => segs.filter((x) => !x.unparsed).map((x) => x.match?.worldId).filter((w) => w && !SKIP.has(w));
    const read = worldsOf(res.segments);
    // a reading by the model (the encoder) may cut the story elsewhere: the worlds the rules read in the message are candidates too
    if (res.segments.some((x) => x.strategy === 'encoder')) { try { read.push(...worldsOf((await formalizers.rules.formalize(english, opts)).segments)); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; } }
    if (!read.length) return null;
    const order = [...new Set(read)].sort((a, b) => (b === ctx.tabWorld) - (a === ctx.tabWorld));
    for (const w of order.slice(0, 3)) {
      const only = set.list().filter((x) => x.id === w);
      if (!only.length) continue;
      const view = Object.create(set);
      view._cache = new Map();
      view.parent = set.parent ?? set;
      view.list = () => only;
      let r;
      try { r = await formalizers.rules.formalize(english, { ...opts, worlds: view }); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; continue; }
      if (!r.segments.length || r.segments.some((x) => x.unparsed || x.partial || x.ignored?.length || x.match?.worldId !== w)) continue;
      const st = this._dryStatuses(r.segments);
      if (st.some((x) => x === 'unsupported' || x === 'error')) continue;
      r.segments.forEach((s) => { s.strategy = 'rules'; s.story = w; });
      return { segments: r.segments, wires: r.segments.flatMap((s) => s.wires) };
    }
    return null;
  }

  /**
   * THE OPEN TAB'S WORLD HAS A STRONG PRIOR (class D, reviewer 2026-11-15 10:00 item 3; spec 03 section 7.9e): another world that owns a tab takes a turn only when the message names
   * it or its things. A reading of such a world that the message does not name is not its reading when
   *   (a) the only words it took as its own things are indefinite ("something", "anything": the phrase group lang.quant.something): "draw something random" on the Diagram tab
   *       is no Documents paragraph about "random"; or
   *   (b) a catch-all slot swallows most of the sentence and holds none of that world's words: "move the elements logically to the three levels" on the Drawing tab is no
   *       transposition in Music.
   * The open world then reads the message alone: as it is, then with the indefinite said as the world's own thing ("something random" -> "a random diagram", then "a diagram");
   * when it cannot, the foreign reading is dropped (the open world answers that it did not understand), never carried out. Returns the segments or null (nothing to do).
   */
  async _openTabPrior(english, res, opts) {
    const ctx = opts.context ?? this.context(), T = ctx.tabWorld;
    if (!T || !res.segments.length) return null;
    const { set, formalizers, interp } = this.engine;
    if (!set.get(T)?.patterns?.length) return null;
    const SKIP = new Set(['ui.shell', 'ui.help', 'core', 'lang.common', 'talk']);
    // a world is named by one of its names, unless that name is a word the open world reads itself ("draw" names the Drawing tab, and the Diagram draws too)
    const tabVocab = worldVocabulary(set, T), padded = ` ${english.toLowerCase().match(/[a-z0-9]+/g)?.join(' ') ?? ''} `;
    const tabPatterns = (set.get(T)?.patterns ?? []).map((p) => String(p.match ?? '')).join(' ').toLowerCase();
    const ownWord = (n) => new RegExp(`(?<![a-z])${n}(?![a-z])`).test(tabPatterns);   // a word of the open world's own patterns
    const named = new Set([...namingTables(set).names].filter(([w, list]) => list.some((n) => padded.includes(` ${n} `) && (n.includes(' ') || w === T || !ownWord(n)))).map(([w]) => w));
    const indef = new Set(interp.lang.phrase?.('lang.quant.something') ?? []);
    const words = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    const free = (sl) => sl.class === 'rest' || sl.class === 'words';
    const notNamed = (x) => {
      budget.tick('dialog.prior');
      const w = x.match?.worldId;
      if (!w || w === T || SKIP.has(w) || named.has(w) || !tabOfWorld(set, w) || x.unparsed) return false;
      const slots = Object.values(x.match?.slots ?? {});
      const own = slots.filter((sl) => !free(sl)).map((sl) => String(sl.text ?? sl.value ?? '').toLowerCase().trim()).filter(Boolean);
      if (own.length && own.every((t) => indef.has(t.replace(/^(?:a|an|the|some)\s+/, '')))) return true;   // (a)
      const vocab = worldVocabulary(set, w);
      const fw = slots.filter(free).flatMap((sl) => words(sl.text ?? sl.value)), total = words(x.text ?? english).length || 1;
      if (fw.length * 2 > total && !fw.some((t) => content(t) && vocab.has(t))) return true;   // (b)
      // (c) every content word of the clause is a word the open world reads itself (the indefinites aside): the other world brings nothing of its own; it yields only to a reading of the open world
      const all = words(x.text ?? english), cw = all.filter((t) => content(t) && !anyWords.has(t));
      if (all.some((t) => indef.has(t)) && cw.length && cw.every((t) => tabVocab.has(t))) { soft.add(x); return true; }   // only for a request of something unspecified
      return false;
    };
    const content = (t) => t.length >= 3 && !FUNCTION_WORDS.has(t) && !isNumberWord(t) && ordinalWordValue(t) == null;   // a number is no word of a world
    const soft = new Set();
    const anyWords = new Set([...indef, ...(interp.lang.phrase?.('lang.intent.surpriseme') ?? [])].flatMap((p) => p.split(/\s+/)));   // the words of asking for anything / something random (lang.common): no world's own
    const bad = res.segments.filter(notNamed);
    if (!bad.length) return null;
    // the open world alone reads the message: as it is, then with the indefinite said as its own thing
    const only = set.list().filter((w) => w.id === T || SKIP.has(w.id));
    const view = Object.create(set);
    view._cache = new Map();
    view.parent = set.parent ?? set;
    view.list = () => only;
    const lower = english.toLowerCase();
    const names = (namingTables(set).names.get(T) ?? []).filter((n) => /^[a-z]+$/.test(n));   // the world's own name, singular, not a word of the message ("draw" is the verb: "drawing")
    const noun = names.find((n) => !(n.endsWith('s') && names.includes(n.slice(0, -1))) && !new RegExp(`\\b${n}\\b`).test(lower));
    const texts = [];
    const ind = [...indef].sort((a, b) => b.length - a.length).find((i) => new RegExp(`\\b${i}\\b`, 'i').test(english));
    if (ind && noun) {
      const m = new RegExp(`\\b${ind}((?:\\s+[a-z]+)?)\\s*([.!?]*)$`, 'i').exec(english);   // "something random" at the end: the word after it describes it
      if (m) {
        const adj = m[1].trim(), head = english.slice(0, m.index);
        if (adj && !FUNCTION_WORDS.has(adj.toLowerCase())) texts.push(`${head}a ${adj} ${noun}${m[2]}`);
        texts.push(`${head}a ${noun}${m[2]}`);
      }
    }
    texts.push(english);
    for (const t of texts) {
      let r;
      try { r = await formalizers.rules.formalize(t, { ...opts, worlds: view }); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; continue; }
      if (!r.segments.length || r.segments.some((x) => x.unparsed || x.partial || x.ignored?.length || isIncomplete(x) || (x.match?.worldId !== T && !SKIP.has(x.match?.worldId)))) continue;
      await this._prepareWorldsOf(r.segments);
      const st = this._dryStatuses(r.segments);
      if (st.some((x) => x === 'unsupported' || x === 'error')) continue;
      r.segments.forEach((x) => { x.strategy = 'rules'; if (t !== english) x.prior = { from: english, read: t }; });
      return { segments: r.segments, wires: r.segments.flatMap((x) => x.wires) };
    }
    // the open world cannot read it either: the foreign reading is dropped, never carried out (the open world says what it did not understand); a reading set aside by (c) alone stays
    if (bad.every((x) => soft.has(x))) return null;
    const segments = res.segments.map((x) => (bad.includes(x) ? { ...x, unparsed: true, wires: [], match: null, alternatives: [], errors: [], corrections: [], ignored: [] } : x));
    return { segments, wires: segments.flatMap((x) => x.wires) };
  }

  async _capability(english, res, opts, lenient) {
    const story = await this._oneStory(english, res, opts);
    if (story) return story;
    const rep = await this._nameRepair(english, res, opts, lenient);
    if (rep) return rep;
    const prior = await this._openTabPrior(english, res, opts);
    if (prior) return prior;
    const r = await this._capabilityRead(english, res, opts, lenient);
    if (r) return r;
    const owner = await this._tabOwnsAct(english, res, opts);
    if (owner) return owner;
    if (!res.segments.length) return r;
    // nothing else read the message and the only reading rests on a correction that would open another world's tab: it is not understood
    const ctx = opts.context ?? this.context();
    const cross = res.segments.filter((x) => !x.unparsed && x.corrections?.length && !this._crossTabOk([x], x.corrections, ctx, english));
    if (!cross.length) return null;
    const segments = res.segments.map((x) => (cross.includes(x) ? { ...x, unparsed: true, wires: [], match: null, alternatives: [], errors: [], corrections: [], ignored: [] } : x));
    return { segments, wires: segments.flatMap((x) => x.wires) };
  }

  /**
   * The act is known in the active world, the thing is found nowhere else (worker-tasks 2026-11-13 20:55, cause 2): a reading of another world that the message does not
   * name, whose act (the last word of its action: remove, add, change ...) is also an action of the world on the open tab, and whose dry run finds nothing to act on, is not
   * the better reading and nothing else read the message: the ACTIVE world takes the same act on the same words and answers (its own "I have no X", or does it). The
   * arguments move by shape: the one text argument of the foreign wire goes to the one text argument of the tab world's pattern for that act. Returns the segments or null.
   */
  async _tabOwnsAct(english, res, opts) {
    const ctx = opts.context ?? this.context(), T = ctx.tabWorld; 
    if (!T || !res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    const { set, interp } = this.engine, tw = set.get(T);
    if (!tw?.patterns?.length) return null;
    const named = this._worldsNamedIn(english);
    const SKIP = new Set(['ui.shell', 'ui.help', 'core', 'lang.common']);
    const act = (a) => String(a ?? '').split('.').pop();
    const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'my', 'your', 'from', 'off', 'to', 'of', 'on', 'in', 'into', 'with', 'and', 'please', 'it', 'this', 'that', 'these', 'those', 'some', 'any', 'all']);
    // the required words of a pattern after its act word (its first required group): a slot, an optional group and a phrase macro say nothing about a thing
    const namesItsOwnThing = (match) => {
      let verbSeen = false;
      for (const t of String(match ?? '').split(/\s+/).filter(Boolean)) {
        if (/^\{\w+:lex\./.test(t)) return true;   // a slot filled from the world's own lexicon names a thing of that world
        if (t.startsWith('{') || t.endsWith('?')) continue;
        if (!verbSeen) { verbSeen = true; continue; }   // the first required group is the act word (a phrase macro, `[$...]`, is one too)
        if (t.startsWith('[$')) continue;
        if (!t.replace(/^\[|\]$/g, '').split('|').every((x) => FUNCTION_WORDS.has(x))) return true;
      }
      return false;
    };
    const out = [];
    let changed = false;
    try {
      await this._prepareWorldsOf(res.segments);
      const f = this.forkForValidation();
      for (const seg of res.segments) {
        const w = seg.match?.worldId, wire = seg.wires?.[0];
        const action = wire?.entries?.find((e) => e.key === 'core.request.action')?.value?.v;
        const arg = wire?.entries?.find((e) => /^core\.request\.arg\./.test(e.key));
        const mine = w && action && !SKIP.has(w) && w !== T && !named.has(w) ? tw.patterns.find((p) => { const m = /action=([\w.]+)\s+arg\.(\w+)=\\?"\{/.exec(p.emit ?? ''); return m && act(m[1]) === act(action) && p.kind === 'request'; }) : null;
        if (!mine || !arg || seg.wires.length !== 1 || namesItsOwnThing(set.get(w)?.patterns?.find((p) => p.id === seg.match.patternId)?.match)) { out.push(seg); continue; }   // a pattern that carries words of its own besides the act ("remove milk from my LIST") names a thing of its world: that world is meant
        f.isession.add(seg.wires);
        if (!['missing', 'unsupported'].includes(interp.resolve(f.isession, wire)?.status)) { out.push(seg); continue; }   // the foreign world finds nothing to act on or refuses
        const [, tAction, tArg] = /action=([\w.]+)\s+arg\.(\w+)=\\?"\{/.exec(mine.emit);
        const words = String(arg.value?.v ?? '').replace(/^(?:(?:the|a|an|my|your|some|any)\s+)+/i, '');
        const entries = wire.entries.filter((e) => !/^core\.request\.arg\./.test(e.key)).map((e) => {
          if (e.key === 'core.request.action') return { ...e, value: { ...e.value, v: tAction } };
          if (e.key === 'core.via') return { ...e, value: { ...e.value, v: mine.id } };
          if (e.key === 'core.in') return { ...e, value: { ...e.value, v: T } };
          return e;
        });
        entries.push({ key: `core.request.arg.${tArg}`, value: { kind: 'string', v: words } });
        const nw = { ...wire, entries, source: mine.id };
        out.push({ ...seg, wires: [nw], match: { ...seg.match, worldId: T, patternId: mine.id }, worlds: [T] });
        changed = true;
      }
    } catch { return null; }
    return changed ? { segments: out, wires: out.flatMap((s) => s.wires) } : null;
  }

  async _capabilityRead(english, res, opts, lenient) {
    budget.tick('dialog.capability');
    if (!res.segments.length || res.segments.some((x) => x.unparsed)) return null;
    const { set, formalizers, interp } = this.engine;
    const ctx = opts.context ?? this.context();
    const named = namedWorlds((english.toLowerCase().match(/[a-z0-9]+/g) ?? []).map((w) => ({ kind: 'word', lower: w, raw: w })), namingTables(set).names);
    const SKIP = new Set(['ui.shell', 'ui.help', 'core', 'lang.common']);
    await this._prepareWorldsOf(res.segments);
    // a phrase the open tab claims for itself (`tabClaim`: "make a diagram of this" on the Talk tab) is that world's answer, also when it is "nothing to send yet"
    const claimed = (x) => !!x.match?.worldId && x.match.worldId === ctx.tabWorld && !!set.get(x.match.worldId)?.patterns?.find((p) => p.id === x.match.patternId)?.tabClaim;
    const suspect = res.segments.filter((x) => { const w = x.match?.worldId; return w && !SKIP.has(w) && !claimed(x) && (w !== ctx.tabWorld || (named.size > 0 && !named.has(w)) || (!!ctx.lastWorld && ctx.lastWorld !== w && !SKIP.has(ctx.lastWorld))); });
    const crossBad = res.segments.filter((x) => x.corrections?.length && !this._crossTabOk([x], x.corrections, ctx, english)).map((x) => x.match.worldId);
    if (!suspect.length && !crossBad.length) return null;
    const bad = new Set(crossBad);
    try {
      const f = this.forkForValidation();
      for (const seg of res.segments) {
        f.isession.add(seg.wires);
        if (!suspect.includes(seg)) continue;
        for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r?.status === 'missing') bad.add(seg.match.worldId); }
      }
    } catch { return null; }
    if (!bad.size) return null;
    const excluded = [...bad];
    const all = set.list().filter((w) => !excluded.includes(w.id));
    const view = Object.create(set);
    view._cache = new Map();
    view.parent = set.parent ?? set;
    view.list = () => all;
    const o2 = { ...opts, worlds: view, excluded };
    let r2;
    try { r2 = await formalizers.rules.formalize(english, o2); } catch { return null; }
    r2.segments.forEach((s) => { s.strategy = 'rules'; });
    if (r2.segments.some((x) => x.unparsed) && (lenient.spell || lenient.partial)) {
      try { r2 = await this._withLeniency(r2, o2, lenient); } catch { return null; }
    }
    if (r2.segments.length === 1 && r2.segments[0].unparsed && this._beNow) { try { r2 = await this._withBestEffort(r2, o2); } catch { return null; } }
    if (!r2.segments.length || r2.segments.some((x) => x.unparsed)) return null;
    // the world just found wrong is not the better reading: a world that answered a moment ago (so it is among the recent ones) must not come back through the leniency
    // ("what is on my shopping list?" after a removal was re-read by the same world as "is it on your list", ignoring "what")
    if (r2.segments.some((x) => x.match?.worldId && excluded.includes(x.match.worldId))) return null;
    // a word some world knows, or an inflection of its correction ("move" -> "moves"), is never a typo here
    const gv = spellVocabulary(set);
    if (r2.segments.some((x) => (x.corrections ?? []).some((c) => c.kind !== 'abbreviation' && (sameWordForm(c.from.toLowerCase(), c.to.toLowerCase()) || isKnownWord(c.from.toLowerCase(), gv))))) return null;
    // the new reading must be the one the user meant: its world is named in the message (also after the corrections: "vatar" -> avatar), owns the open tab, or answered recently
    let fixedText = english;
    for (const sg of r2.segments) for (const c of sg.corrections ?? []) fixedText = fixedText.replace(c.from, c.to);
    const meant = new Set([...named, ...this._worldsNamedIn(`${fixedText} ${r2.segments.map((x) => x.bestEffort?.took ?? '').join(' ')}`), ctx.tabWorld, ...(ctx.recentWorlds ?? [])]);
    if (!r2.segments.every((x) => !x.match?.worldId || x.match.worldId === 'ui.shell' || x.match.worldId === 'ui.help' || meant.has(x.match.worldId))) return null;
    try {
      const f = this.forkForValidation();
      for (const seg of r2.segments) { f.isession.add(seg.wires); for (const w of seg.wires) { const r = interp.resolve(f.isession, w); if (r?.status === 'unsupported' || r?.status === 'error') return null; } }
    } catch { return null; }
    r2.segments.forEach((s) => { s.strategy ??= 'rules'; });
    return { segments: r2.segments, wires: r2.segments.flatMap((s) => s.wires) };
  }

  /**
   * MODEL-TIMEOUTS (spec 06 "Model timeouts are visible"): a model call that timed out (encoder 1500 ms, dispatcher / normalizer lane deadlines) and was answered by the rules
   * instead is recorded, never silent: counted per session and per engine (`engine.modelStats`), listed in the turn's `trace.formalizer.modelTimeouts`, and announced to the host
   * through `engine.onModelTimeout({ stage, message, count, first })` (`first` once per session; the webchat debug panel says it once and keeps the count). Deadlines are unchanged.
   */
  _noteModelTimeout(stage, e) {
    if (!isModelTimeout(e)) return;
    const st = (this.engine.modelStats ??= { timeouts: 0, byStage: {} });
    st.timeouts++; st.byStage[stage] = (st.byStage[stage] ?? 0) + 1;
    this.modelTimeouts = (this.modelTimeouts ?? 0) + 1;
    const message = e?.message ?? String(e);
    (this._turnModelTimeouts ??= []).push({ stage, message });
    const first = this.modelTimeouts === 1;
    try { this.engine.onModelTimeout?.({ stage, message, count: this.modelTimeouts, total: st.timeouts, first }); } catch { /* a listener must not break the turn */ }
  }

  /**
   * Formalize one message (spec 03 section 7.16). The NX strategy picks who reads first:
   *   rules   the shipped path (`_formalizeShipped`)
   *   hybrid  the shipped path, then the model reads the segments it left unparsed (gate and validator)
   *   neural  the model reads the whole message first; any segment it does not read sends the message to the shipped path
   * The model is only asked when the encoder formalizer is preferred, the model is ready and ORT is not paused; a model failure keeps the rules' answer.
   */
  async _formalize(english, sid, preferred = this.formalizer, lenient = { spell: this.spell, partial: this.partial, fastPath: this.fastPath }) {
    budget.tick('dialog.formalize');
    const want = preferred === 'encoder' ? normalizeNxStrategy(lenient.nx ?? this.nx) : 'rules';
    const nx = want !== 'rules' ? this.engine.formalizers.nx : null;
    let on = false;
    try { on = !!nx && nx.available(); } catch { on = false; }
    const tag = (r, by) => { r.nx = { strategy: want, model: on, by }; return r; };
    if (!on) return tag(await this._formalizeShipped(english, sid, preferred, lenient), 'rules');
    const { set } = this.engine;
    const opts = { worlds: set, session: this.isession, source: sid, context: this.context(), router: this._router, ...this._pickOpt() };
    if (want === 'neural') {
      try {
        if (!nx.untrainedReads(english, opts)) {
          const r = await perf.time('nx', () => guard.abortable(nx.formalize(english, opts), 'nx'));
          if (r.complete) return tag({ segments: r.segments, wires: r.wires, dispatch: null }, 'model');
        }
      } catch (e) { if (e instanceof TurnAborted) throw e; this._noteModelTimeout('nx', e); /* the model failed: the rules path answers */ }
    }
    const res = await this._formalizeShipped(english, sid, preferred, lenient);
    if (want === 'hybrid' && res.segments.some((x) => x.unparsed)) {
      try {
        const o2 = { ...opts, context: this.context() };
        const refined = await perf.time('nx', () => guard.abortable(nx.refine(res, o2), 'nx'));
        return tag(refined, refined === res ? 'rules' : 'model');
      } catch (e) { if (e instanceof TurnAborted) throw e; this._noteModelTimeout('nx.refine', e); }
    }
    return tag(res, 'rules');
  }

  /** World-aware choice (spec 16): the hook the rule formalizer calls with the readings it found for one clause; present only while a turn runs in `choose` mode. */
  _pickOpt() { return baseMode(this._wa) === 'choose' || this._wa === 'observe' ? { pick: makePicker(this) } : {}; }

  async _formalizeShipped(english, sid, preferred = this.formalizer, lenient = { spell: this.spell, partial: this.partial, fastPath: this.fastPath }) {
    const { set, formalizers } = this.engine;
    const opts = { worlds: set, session: this.isession, source: sid, context: this.context(), router: this._router, ...this._pickOpt() };
    const rules = formalizers.rules;
    const enc = preferred === 'encoder' ? formalizers.encoder : null;
    let usable = false, encoderError = null;
    try { usable = !!enc && !!(await perf.time('encoder.available', () => guard.abortable(enc.available(), 'encoder.available'))) && set.list().some((w) => enc.supports(w)); } catch (e) { usable = false; if (e instanceof TurnAborted) throw e; this._noteModelTimeout('encoder.available', e); }
    if (usable && lenient.fastPath) { const quick = await this._quickRules(english, opts); if (quick) return (await this._openTabPrior(english, quick, opts)) ?? quick; }   // the fast path keeps the open tab's prior (class D)
    if (usable) {
      try {
        const res = await perf.time('encoder', () => guard.abortable(enc.formalize(english, opts), 'encoder'));
        const segments = [];
        for (const seg of res.segments) {
          if (!seg.unparsed) { segments.push({ ...seg, strategy: 'encoder' }); continue; }
          const sub = await perf.time('rules.retry', () => rules.formalize(seg.text, { ...opts, source: sid }));
          const shift = seg.span[0];
          for (const s of sub.segments) segments.push({ ...s, span: [s.span[0] + shift, s.span[1] + shift], strategy: 'rules' });
        }
        const cap = await this._capability(english, { segments, wires: [] }, opts, lenient);
        if (cap) return { ...cap, dispatch: res.dispatch ?? null };
        const active = await this._activeSpell(english, { segments, wires: [] }, opts, lenient);
        if (active) return { segments: active.segments, wires: active.segments.flatMap((s) => s.wires), dispatch: res.dispatch ?? null };
        const done = await this._withLeniency({ segments, wires: [] }, opts, lenient);
        return { segments: done.segments, wires: done.segments.flatMap((s) => s.wires), dispatch: res.dispatch ?? null };
      } catch (e) { encoderError = e?.message ?? String(e); this._noteModelTimeout('encoder', e); /* the encoder failed: fall through to the rules */ }
    }
    const res = await perf.time('rules', () => rules.formalize(english, opts));
    for (const s of res.segments) s.strategy = 'rules';
    if (encoderError) res.encoderError = encoderError;
    const cap = await this._capability(english, res, opts, lenient);
    if (cap) { if (encoderError) cap.encoderError = encoderError; return cap; }
    const active = await this._activeSpell(english, res, opts, lenient);
    if (active) { active.segments.forEach((s) => { s.strategy ??= 'rules'; }); if (encoderError) active.encoderError = encoderError; return active; }
    const done = await this._withLeniency(res, opts, lenient);
    done.segments.forEach((s) => { s.strategy ??= 'rules'; });
    if (encoderError) done.encoderError = encoderError;
    return done;
  }

  /** The message-level correction phase; `probe` reads a text with the rules, side-effect free with the rules (only used for ambiguous short clauses). */
  async _correct(english) {
    const { set, formalizers } = this.engine;
    const probe = async (t) => {
      try {
        const r = await formalizers.rules.formalize(t, { worlds: set, session: this.isession, source: 'probe', context: this.context(), router: this._router });
        return r.segments.length > 0 && r.segments.every((x) => !x.unparsed) ? r.segments.map((x) => x.match?.patternId).join('+') : null;
      } catch { return null; }
    };
    return correctMessage(english, { probe });
  }

  /** ASTRA bookkeeping at the end of a turn (spec 13): typed moves, attribution to a discussion, tab resume. Never throws, never reads. */
  _astraTurn({ sid, english, meta, pre, pend, segments, state, stateBefore, tabBefore }) {
    const a = this.astra;
    if (!a) return;
    try {
      const moves = recognize({ text: english, meta: meta?.info, pre: pre?.info, consumed: pend, yesNo: pend?.type === 'confirm' ? this.engine.interp.lang.yesNo(english) : null, segments });
      const open = this.discourse.pending;
      if (open?.question) moves.push({ type: 'ask', text: open.question, world: open.world ?? null, source: 'system' });
      const tabAfter = this.isession.state['ui.shell']?.activeTab ?? null;
      a.afterTurn({ msgId: sid, text: english, changed: Object.keys(state), before: stateBefore, tab: tabAfter, moves });
      mirrorFrames(this, { consumed: pend, open, turn: this._msg });
      if (tabAfter && tabAfter !== tabBefore) a.onTabChange(tabAfter);
    } catch { /* bookkeeping must never break a turn */ }
  }

  /** Discussions of this chat as panel data (spec 13 section 8): `{ tab, status, world }` filters. */
  discussions(filter = {}) { return panel(this.astra, filter); }

  /** Persist / restore the discussions through a localStorage-like backend (`new Storage(backend)` from src/astra). Restoring runs no effect. */
  saveDiscussions(storage) { return storage.save(this.astra); }
  loadDiscussions(storage) { return storage.load(this.astra); }

  /** One message in, one reply out. Opens the stage-timing record (`reply.perf`, see formalizer/perf.mjs) unless this is a nested replay. */
  async send(text, opts = {}) {
    const own = perf.start();
    // Turn guard (spec 06 "Turn lifecycle"): the outermost send installs the abort signal and the deadlines; nested sends (validator replays) inherit them.
    const g = guard.install({ signal: opts.signal ?? null, hardMs: opts.hardMs ?? Infinity, softMs: opts.softMs ?? Infinity, ...(opts.clock ? { clock: opts.clock } : {}), force: !!opts.signal });
    if (g) guard.onModelTimeout((stage, e) => this._noteModelTimeout(stage, e));
    // Compute budget (spec 06 "Compute budgets"): one per turn, passed down through the shared `budget` handle; nested sends join the outer turn's budget.
    const tb = opts.budget ?? createBudget();
    const bt = installBudget(tb, { force: !!opts.budget });
    const snap = g || bt ? (opts.undo ?? this.snapshot()) : null;   // a host that passes `undo` (its own snapshot) restores the session itself
    if (this.engine.knowledge) await guard.untimed(() => openWordsReady(text));   // open classes (lexicons with open=knowledge) are read by lookup: the vocabulary is loaded before the sentence is read
    // the open tab's world reads with its own engine (ops `prepare()`, lazy in a browser, spec 04): ready BEFORE the sentence is read, so its reader (hook readsWhole) can answer
    // whether it reads the clause; a reader that cannot tell yet reads nothing (owner export 2026-11-15T11:43, the first turn on the Diagram tab)
    { const tab = this.isession.state?.['ui.shell']?.activeTab, tw = tab ? this.engine.set.list().find((w) => w.tab?.id === tab) : null, prep = tw ? this.engine.set.get(tw.id)?.ops?.prepare : null; if (typeof prep === 'function') { try { await guard.untimed(() => prep()); } catch { /* its reader then says it cannot tell */ } } }
    try {
      const reply = await this._send(text, opts);
      // INVARIANT (every turn gets a reply): a message that produced no words at all (bare punctuation, an empty reading) is answered, quoting what was typed
      if (reply && typeof reply === 'object' && !String(reply.text ?? '').trim() && String(text ?? '').trim() && !opts.silent) {
        const said = `I did not understand "${String(text).trim().slice(0, 80)}".`;
        reply.text = said; reply.parts = [{ text: said, translate: false }]; if (reply.trace) reply.trace.replyEnglish = said; if (Array.isArray(reply.statuses) && !reply.statuses.length) reply.statuses.push('unparsed');
      }
      if (g) guard.check('end');   // (checks the shared guard)   // a stage that swallowed the abort must not let a half-done turn through
      if (bt && tb.exceeded) throw tb.exceeded;   // a stage that swallowed BudgetExceeded must not let a half-done turn through
      if (own && reply && typeof reply === 'object') { reply.perf = perf.end(); if (bt && reply.perf) reply.perf.ticks = { total: tb.ticks, sites: { ...tb.bySite } }; }   // the turn's ticks per site next to its stage times (SCAN-PROFILE)
      if (bt && reply && typeof reply === 'object') reply.budget = budgetReport(tb);
      return reply;
    } catch (e) {
      if (bt && isBudgetExceeded(e)) {   // out of budget: the session goes back to where it was, the turn answers "too complex" and says where
        if (!opts.undo) this.restore(snap);
        return tooComplexReply(this, text, e, tb);
      }
      if (g && (e instanceof TurnAborted || guard.tripped)) {   // aborted: the session goes back to exactly where it was before the message
        if (!opts.undo) this.restore(snap);
        throw e instanceof TurnAborted ? e : new TurnAborted(guard.tripped, guard.trippedStage);
      }
      throw e;
    } finally { if (own) perf.end(); guard.release(g); releaseBudget(bt); }
  }

  /**
   * The conversation memory as plain JSON: discourse (frames, pending question, actions, topics ...), the ASTRA discussions and instances, the recent worlds
   * and the last game. A host that has to replace the engine (the page restarts its worker after a runaway turn) keeps it next to the world states and gives
   * it back with `restoreMemory`. It survives `JSON.stringify` and `structuredClone`.
   */
  memoryJSON() {
    let astra = null;
    try { astra = this.astra ? astraSnapshot(this.astra) : null; } catch { astra = null; }
    let rs = null;
    try { rs = this.isession.rs?.timelineJSON() ?? null; } catch { rs = null; }   // the library instances and the undo timeline (spec 15); absent on the ops reasoner
    return { v: 1, discourse: this.discourse.toJSON(), dialogue: this.dialogue.toJSON(), astra, recent: [...(this._recentWorlds ?? [])], ...(rs ? { rs } : {}) };
  }

  /** Puts a `memoryJSON()` record back (a bad record changes nothing it cannot read). Runs no effect. */
  restoreMemory(mem) {
    if (!mem || typeof mem !== 'object' || mem.v !== 1) return false;
    this.discourse.load(mem.discourse);
    if (mem.dialogue) this.dialogue.load(mem.dialogue);
    if (mem.astra && this.astra) { try { astraRestore(this.astra, mem.astra); } catch { /* the discussions start empty */ } }
    if (Array.isArray(mem.recent)) this._recentWorlds = [...mem.recent];
    if (mem.rs && this.isession.rs) {   // after the world states: the timeline of the matrix reasoner
      // the world states the host put in place are the truth: the library derives a matrix world's state from its instances, which never heard of what the host set (the open tab, a toggle), so replaying the timeline would put the older state back
      const keep = structuredClone(this.isession.state);
      this.isession.rs.restoreJSON(mem.rs, this.isession);
      for (const [id, v] of Object.entries(keep)) {
        const cur = this.isession.state[id];
        if (!cur) { this.isession.state[id] = v; continue; }
        if (JSON.stringify(cur) !== JSON.stringify(v)) { for (const k of Object.keys(cur)) delete cur[k]; Object.assign(cur, v); }
      }
    }
    return true;
  }

  /** Undo snapshot of everything a turn can change (interpreter session, discourse memory, recent worlds, message counter). */
  snapshot() {
    const { dialog, ...dis } = this.discourse;
    return {
      isession: this.isession.clone(), msg: this._msg, recent: [...(this._recentWorlds ?? [])], lang: [this._sessionLang, this._weakRo],
      discourse: { ...dis, frames: [...dis.frames], actions: [...dis.actions], topics: [...dis.topics], lastByWorld: { ...dis.lastByWorld } },
      sources: new Set(this.sources.keys()), astra: this.astra?.capture(), dialogue: this.dialogue.toJSON(),
    };
  }

  /** LAZY LOADING: the actions a turn asked for that no loaded world has (the names), once; the host loads the worlds that have them and reads the turn again. Call it before `restore`. */
  takeMissed() { const m = this.isession.missed; this.isession.missed = null; return m ? [...m] : []; }

  /**
   * UNDO ACROSS A RELOAD: a snapshot of this session as plain data ({ state, meta }, what a host keeps next to the world states), so that a session made by a reloaded engine
   * (`engine.reload`, lazy loading) can take it over with `adoptSnapshot`. The session is put back to what it was.
   */
  portableSnapshot(snap) {
    const now = this.snapshot();
    try {
      this.restore(snap);
      return { state: structuredClone(this.isession.state), meta: { msg: this._msg, lang: this._sessionLang, weakRo: this._weakRo, memory: this.memoryJSON() } };
    } finally { this.restore(now); }
  }

  /** Makes an undo snapshot of this session out of a `portableSnapshot()` record; the session itself is unchanged. */
  adoptSnapshot(rec) {
    const now = this.snapshot();
    try {
      this.isession.state = { ...this.isession.state, ...structuredClone(rec.state) };   // a world loaded since has its initial state
      this._msg = rec.meta.msg ?? this._msg; this._sessionLang = rec.meta.lang ?? this._sessionLang; this._weakRo = rec.meta.weakRo ?? 0;
      if (rec.meta.memory) this.restoreMemory(rec.meta.memory);
      return this.snapshot();
    } finally { this.restore(now); }
  }

  /** Puts the session back to a snapshot taken by `snapshot()`. */
  restore(snap) {
    if (!snap) return;
    this.isession = snap.isession; this._msg = snap.msg; this._recentWorlds = snap.recent; [this._sessionLang, this._weakRo] = snap.lang;
    Object.assign(this.discourse, snap.discourse);
    this.astra?.rollback(snap.astra);
    if (snap.dialogue) this.dialogue.load(snap.dialogue);
    for (const k of [...this.sources.keys()]) if (!snap.sources.has(k)) this.sources.delete(k);
  }

  /**
   * Input side of a foreign-language message (spec 06, M4): with the translators on ('fallback' mode) the English is chosen among candidates by `_sendByCandidates`;
   * with them off, English input, or past the soft time limit, the core reads it as it is (rules translation).
   */
  async _sendRead(text, opts = {}) {
    const snap = opts.intent === false || guard.soft() ? null : this.snapshot();
    const prevTurn = this.dialogue?.log?.at?.(-1) ?? null;
    const dry = new Map();   // CLASS G: the dry readings of this turn's pre-turn state (see `_dryReading`), shared by the translation candidates and the intent step
    this._preDry = dry;
    let first;
    try { first = await this._sendFirst(text, opts); } finally { this._preDry = null; }
    if (!snap || !weakReading(first)) return first;
    // THE INTENT STEP (spec 03 section 7.9f): the first reading was weak; on a copy of the session as it was before the turn, propose what the user may mean and choose
    // (src/dialog/intent.mjs). The live session is touched only when a reading is chosen: then it goes back to before the turn and the turn is read again.
    const view = Object.create(DialogSession.prototype);
    view.engine = this.engine; view.isession = snap.isession.clone(); view.isession.sessionFacts = this.isession.sessionFacts; view._recentWorlds = [...(snap.recent ?? [])];
    view.discourse = this.discourse; view.dialogue = { log: prevTurn ? [prevTurn] : [] }; view._routing = this._routing; view._preDry = dry;
    let alt = null;
    try { const vocab = spellVocabulary(this.engine.set); alt = await perf.time('intent', () => intentStep(view, first.trace?.english ?? text, { understand: (e) => view._understands(e), read: (e) => view._dryReading(e), known: (w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || !!this.engine.translator?.rules?.knownEnglish?.(w) })); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; alt = null; }
    if (!alt) return first;
    this.restore(snap);
    const r = await perf.time('intent.reread', () => this._sendCore(text, opts, { english: alt.english, translation: first.translation ?? null, assumed: alt.assumed, left: alt.left ?? [], say: alt.say ?? null }));
    r.trace.intent = { from: first.trace?.english ?? null, assumed: alt.assumed, log: alt.log };
    if (first.trace?.candidates) r.trace.candidates = first.trace.candidates;
    if (first.trace?.via) r.trace.via = first.trace.via;
    return r;
  }

  /**
   * THE DOOR (spec 28 section 4; reviewer 2026-11-15 16:40, owner-backed): every message is read as a w.request FIRST (the library's readRequest over the open tab's live world);
   * nothing executes before it. The dialogue world (reviseRequest against the OPEN TAB's last result) says new request or revision; planRequest fills and checks; the tab world's
   * executor carries out the plan; sayRequest says what was assumed and not honoured. Only a turn the door does not take (no act, target or reaction read; an act or a constraint
   * the world does not declare; words no fact explains; a question) goes to the old readers (`_sendRead`), marked `trace.legacy = true` with the reason in `trace.door`: the
   * legacy share is what the request path cannot read yet. On a declared tab nothing falls back to the old readers of a declared world (owner 17:55): see below.
   */
  async _send(text, opts = {}) {
    const tabWorld = this.context().tabWorld;
    if (tabWorld && this.engine.set.get(tabWorld)?.requestText && this.engine.sopworld === undefined) this.engine.sopworld = await import('../vendor/sopworld/sopworld.mjs').catch(() => null);
    const decl = tabWorld && declaredWorld(this.engine.set.get(tabWorld), this.engine.sopworld);   // the world declares what it can do (request.sop) and carries a plan out (its planRequest operation, or its bound tool primitives)
    const off = opts.request === false || globalThis.process?.env?.PSYS2_REQUEST === 'off' || guard.soft();   // PSYS2_REQUEST=off: the A/B of the request step
    if (!decl || off) return markLegacy(await this._sendRead(text, opts), off ? 'off' : 'no request declarations');
    if (!globalThis[Symbol.for('psys2.textgen')]) installTextGen(this.engine.sopworld, null);   // the executors of the door (docs.editor composes) run before the core
    let door = null;
    try { door = await perf.time('door', () => this._door(text, opts, tabWorld)); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; if (globalThis.process?.env?.PSYS2_REQUEST_DEBUG) console.error('[door]', e); door = { why: 'door error' }; }
    if (door?.reply) { stampDoor(door.reply, tabWorld, text, door.reply.trace?.request ?? door.q); door.reply.trace.legacy = false; door.reply.trace.door = door.route ?? 'plan'; return door.reply; }
    if (globalThis.process?.env?.PSYS2_REQUEST_DEBUG) console.error('[door] legacy:', door?.why, JSON.stringify(door?.q ?? null)?.slice(0, 300));
    // NO FALLBACK ON A DECLARED TAB (owner 2026-11-15 17:55): the old patterns of the declared worlds never run. The worlds that declare nothing yet (the shell's tabs, help,
    // the conversation) may still answer, marked legacy; a reading by a declared world is taken back and the turn is said honestly.
    const snap0 = this.snapshot();
    const first = await this._sendRead(text, opts);
    const hit = [...new Set((first?.trace?.segments ?? first?.segments ?? []).map((sg) => sg.match?.worldId ?? sg.world).filter(Boolean))];
    if (hit.length && !hit.some((w) => w === tabWorld ? declaredWorld(this.engine.set.get(w), this.engine.sopworld) : declaredWorld(this.engine.set.get(w), this.engine.sopworld) && !this.engine.set.get(w)?.ambient)) return markLegacy(first, `${door?.why ?? 'not read'}; answered by ${hit.join(', ')} (no declarations, or an ambient world off its tab)`);   // an ambient world (the avatar popup over every tab) is declared on its own tab only
    this.restore(snap0);
    const honest = await this._doorHonest(text, opts, tabWorld, door);
    stampDoor(honest, tabWorld, text, door?.q); honest.trace.legacy = false; honest.trace.door = `honest: ${door?.why ?? 'not read'}`;
    return honest;
  }

  /** The language and the English of a turn for the door, before anything runs (an explicit language is the language; 'auto' detects without touching the session's language). */
  async _doorEnglish(text, opts) {
    if (opts?._clause) return opts._clause;   // a clause of a message of several requests: its English is the cut of the message's English
    const tr = this.engine.translator;
    const wanted = opts.language ?? this.language;
    let lang = wanted && wanted !== 'auto' && wanted !== 'unknown' ? wanted : 'en';
    if (tr && wanted === 'auto') {
      const seen = langOf(await guard.abortable(tr.detectLanguage(text), 'detect'));
      const ev = typeof tr.evidence === 'function' ? await guard.abortable(tr.evidence(text), 'detect') : null;
      lang = ev?.strongEn ? 'en' : seen === 'ro' && (ev?.strongRo || this._sessionLang === 'ro') ? 'ro' : (this._sessionLang ?? 'en');
      if (ev?.strongEn || (lang === 'ro' && ev?.strongRo)) { this._sessionLang = lang; this._weakRo = 0; }   // the session's language, as the core keeps it (the core then gets the language explicitly)
    }
    if (lang === 'en' || !tr) return { lang: 'en', english: text, translation: null };
    // the translation candidates of every translator (rules, the source-side repair, the machine translators), chosen by the request reading: the one whose request leaves the
    // fewest words unread in the open world (ties: the earlier candidate). The translators are the system boundary; the reading is the door's.
    let cands = [];
    const contextRepair = this._contextRepairOf(lang, tr);
    // the open world instance's English words: their senses come first in the one lookup of the source words (src/translate/lexicon-ro.mjs), so a tie of the reading keeps them
    let prefer = null;
    try { const tw = this.context().tabWorld, lw = tw ? liveWorld(this.engine.sopworld, this.engine.set.get(tw)) : null; prefer = lw && this.engine.sopworld?.worldWords ? this.engine.sopworld.worldWords(lw) : null; } catch { prefer = null; }
    try { cands = await gatherCandidates(text, { from: lang, to: 'en', machine: machineReads(lang, this.engine.machineReading), translator: tr.rules ? tr : { rules: tr }, abortable: (p, stage) => guard.abortable(p, stage), contextRepair, isEnglish: this._doorIsEnglish(tr), kept: this._doorKept(), prefer }); } catch (e) { if (e instanceof TurnAborted) throw e; cands = []; }
    // THE ARMS OF THE TRANSLATION MEASURE (Q48 proposal 2 item 3; a measuring hook, off by default): 'model' keeps only the machine translator's candidates (after the source repair
    // too); 'both' keeps every candidate and puts the rules' first, so that a tie of the reading goes to the rules. Unset: today's chain.
    const arm = this.engine.translationArm ?? null;
    if (arm === 'model') cands = cands.filter((c) => !/rules/.test(String(c.source)) && !c.voice && !c.glossed);
    else if (arm === 'both') cands = [...cands.filter((c) => /rules/.test(String(c.source))), ...cands.filter((c) => !/rules/.test(String(c.source)))];
    if (!cands.length && arm === 'model') return null;
    if (!cands.length) {
      const translation = await guard.abortable((tr.rules ?? tr).translate(text, { from: lang, to: 'en' }), 'translate');
      const english = textOf(translation);
      return english?.trim() ? { lang, english, translation } : null;
    }
    const lib = this.engine.sopworld, tabWorld = this.context().tabWorld;
    const live = tabWorld ? liveWorld(lib, this.engine.set.get(tabWorld)) : null, language = requestLanguage(lib);
    const score = (c) => { if (!live || !language) return 0; try { const q = readTurn(lib, live, language, c.text, {}); return q.unread.length * 2 + (q.act || q.target || q.reaction ? 0 : 1); } catch { return 9; } };
    let best = cands[0], bestScore = score(cands[0]);
    // a tie keeps the earlier candidate, except that the open world instance's sense of a word wins a tie against the translator's sense of it (src/translate/lexicon-ro.mjs)
    const worldSense = (c) => !!c?.sense && !!prefer?.has?.(String(c.sense.to).toLowerCase()) && !prefer.has(String(c.sense.was ?? '').toLowerCase());
    for (const c of cands.slice(1)) { budget.tick('door.candidates'); const sc = score(c); if (sc < bestScore || (sc === bestScore && best.source === 'rules' && worldSense(c))) { best = c; bestScore = sc; } }
    if (globalThis.process?.env?.PSYS2_REQUEST_DEBUG) console.error('[door] candidates:', cands.map((c) => `${c.source}: ${c.text} (${score(c)})`).join(' | '));
    const recent = (this._recentSource ??= []);
    if (recent.at(-1) !== text) { recent.push(text); if (recent.length > 12) recent.shift(); }
    return { lang, english: best.text, translation: best.translation ?? null, repairs: (best.changes ?? []).filter((c) => c.kind === 'context'), asks: best.asks ?? cands.asks ?? [], changes: best.changes ?? [] };
  }

  /** The reader's vocabulary test and the names kept as they are, for the glossed candidates of the translation (the same ones the readers of the undeclared tabs use). */
  _doorIsEnglish(tr) {
    const vocab = spellVocabulary(this.engine.set);
    return englishTest((w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || !!tr.rules?.knownEnglish?.(w) || !!tr.knownEnglish?.(w));
  }
  _doorKept() {
    const fold = (w) => String(w).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    return new Set([...worldThingNames(this), ...sessionNames(this)].flatMap((n) => fold(n).split(/[\s_]+/)).filter((w) => w.length >= 3));
  }

  /**
   * The contextual repair of a source-language message (Q39 S3): `(text) -> { text, changes, asks }` over the open tab's live world and the other live worlds (their words told in the
   * language through its dictionary and morphology), the things on the screen, the person's recent messages and the language's dictionary (src/translate/source-repair.mjs). null when the
   * language pack is not loaded or has no dictionary. One candidate source of the door's reading (gatherCandidates `contextRepair`).
   */
  _contextRepairOf(lang, tr) {
    const ro = lang === 'ro' ? langRoNow() : null;
    const vocab = tr?.sourceVocabulary?.(lang) ?? tr?.rules?.sourceVocabulary?.(lang);
    const lib = this.engine.sopworld, tabWorld = this.context().tabWorld;
    if (!ro?.formsOfEnglish || !vocab || !lib?.worldWords || !tabWorld) return null;
    return (text) => {
      const open = liveWorld(lib, this.engine.set.get(tabWorld));
      if (!open) return null;
      const others = [];
      for (const w of this.engine.set.list()) { if (w.id === tabWorld) continue; const l = w.requestText ? liveWorld(lib, w) : null; if (l) others.push(lib.worldWords(l)); }
      let shown = [];
      shown = this._shown(tabWorld);
      return repairInContext(text, { ro, vocab, isEnglish: (w) => !!tr.rules?.knownEnglish?.(w) || !!tr.knownEnglish?.(w), open: lib.worldWords(open), others, names: shown.map((x) => x?.name ?? x?.label).filter(Boolean), recent: (this._recentSource ?? []).slice(-8) });
    };
  }

  /**
   * The things the open tab shows: a world bound to tool primitives (std.tool) shows its view (the tool's state as facts: id, kind, attributes); any other world its `referents`
   * hook (the readers' own). No code here is per world.
   */
  _shown(tabWorld) {
    const lib = this.engine.sopworld, world = this.engine.set.get(tabWorld);
    const live = lib && world?.requestText ? liveWorld(lib, world) : null;
    const tools = live ? boundTools(lib, live, requestLanguage(lib)) : null;
    if (tools) { try { return this._toolPrimitives(tabWorld, tools).view().map(({ id, kind, name = null, ...attrs }) => ({ id, kind, name, attrs })); } catch { return []; } }
    try { const r = this.engine.interp.hook(this.isession, tabWorld, 'referents', {}); return Array.isArray(r) ? r : []; } catch { return []; }
  }

  /** The door of one turn: `{ reply, route }` when the request path handled it, else `{ why }` (the reason the turn goes to the old readers). */
  async _door(text, opts, tabWorld) {
    const { set, interp } = this.engine;
    const lib = this.engine.sopworld;
    const world = set.get(tabWorld);
    const language = requestLanguage(lib), live = liveWorld(lib, world);
    if (!language || !live || typeof lib?.readRequest !== 'function') return { why: 'no library' };
    if (languageCommand(text)) return { why: 'language command' };
    const en = await this._doorEnglish(text, opts);
    if (!en) return { why: 'not translated' };
    const { lang, translation } = en;
    let english = en.english;   // let: an accepted proposal of the request proposer (Q48) is read in its place
    // an answer to the timeline's own yes / no question ("Shall I take them all back?"): the dialogue's, before any reading of a request
    const pd = this.discourse.pending;
    if (pd?.expected === 'yes/no' && pd.accept === 'undoTo' && this.engine.interp.lang?.yesNo?.(english)) return this._doorTimeline({ text, opts, lang, english, translation, tabWorld, act: 'undo', live, flat: null, answer: true });
    const rd = this.dialogue.requests;
    const lastRec = rd.last(tabWorld);
    const vocab = spellVocabulary(set);
    const known = (w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || knownEnglishWord(String(w ?? '').toLowerCase());   // a word of the language (the English dictionary, with or without a translator) is never a slip: "baked" is never repaired to "named" (reviewer 20:05 1(a))
    // a word the translation left as the person wrote it (a word of their own language no dictionary knew) is theirs, never a slip of English: the repair of the person's own language is the
    // contextual one before the translation (Q39 S3), so the English reader never "repairs" "stanca" to "stanza"
    const keptWords = lang === 'en' ? null : new Set((String(text).match(/[\p{L}]+/gu) ?? []).map((w) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()));
    const knownHere = keptWords ? (w) => known(w) || keptWords.has(String(w ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) : known;
    const dlg = lastRec ? { last: lastRec.request, result: lastRec.result, previous: lastRec.previous ?? null, seed: lastRec.seed ?? 1, previousSeed: lastRec.previousSeed ?? null } : { last: null, result: null, seed: 1 };
    // THE OPEN STATE AS FACTS (owner 19:10): the things the world shows, told into a fork of its live request World (the spell repair reads their names; references resolve to them)
    const shown = this.isession.state[tabWorld] ? this._shown(tabWorld) : [];
    const present = stateWorld(lib, live, shown);
    const tools = boundTools(lib, live, language);
    let mirrored = null;   // a bound world: its view as things of the declarations, the state the library reads names from and plans on (as its toolSession does)
    if (tools) { try { mirrored = lib.mirrorState(live, this._toolPrimitives(tabWorld, tools).view, { catalog: [language] }).world; } catch { mirrored = null; } }
    let q = readTurn(lib, live, language, english, { dialogue: dlg, known: knownHere, worlds: present.world && present.world !== live ? [present.world] : [], state: mirrored });
    // the words of the person's own language the contextual repair put right before the translation (Q39 S3) and its asks are recorded on the request (trace.request); they are not said in the
    // reply yet: "I read X as Y" has no Romanian phrase (needs the reply phrase in the language world, questions.md), and the machine translation of it is not fit to show
    if (en.repairs?.length) q.sourceRepairs = en.repairs.map((r) => ({ said: r.from, as: r.to, source: r.source }));
    if (en.asks?.length) q.asks = [...(q.asks ?? []), ...en.asks.map((a) => ({ ...a, language: lang }))];
    let flat = { act: q.act, target: q.target, facts: q.facts, reaction: q.reaction, unread: q.unread, used: q.used, corrections: q.corrections, english: q.english, source: 'sopworld', ...(q.sourceRepairs ? { sourceRepairs: q.sourceRepairs } : {}), ...(q.asks?.length ? { asks: q.asks } : {}) };
    const why = (w) => ({ why: w, q: flat });
    // A MESSAGE OF SEVERAL REQUESTS ("draw a sky, then draw a sun"): the library's clause splitter (the language world's cut points) cuts the English where every clause reads as
    // a request with an act and no unread word; each clause is a turn of the door of its own (one step each, undone last first). A list of things stays one clause.
    if (q.unread.length && !opts._clause && typeof lib.clauses === 'function') {
      const count = (t) => (String(t).match(/[\p{L}\p{N}'-]+/gu) ?? []).length;
      const read = (t) => { let r = null; try { r = readTurn(lib, live, language, t, { dialogue: dlg, known: knownHere, state: mirrored }); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; return null; } return r.act && !r.unread.length ? { literal: count(t) } : null; };
      let cut = null;
      try { cut = lib.clauses(cutWorld(lib), english, { read }); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; cut = null; }
      if (cut?.length > 1) {
        const done = [];
        for (const c of cut) {
          budget.tick('door.clauses');
          const d = await this._door(text, { ...opts, _clause: { lang, english: c.text, translation } }, tabWorld);
          if (!d?.reply) break;
          done.push(d);
        }
        if (done.length === cut.length) {
          const last = done.at(-1);
          last.reply.text = done.map((d) => d.reply.text).filter(Boolean).join(' ');
          return { reply: last.reply, route: `clauses ${done.map((d) => d.route).join(' | ')}` };
        }
        if (done.length) return { reply: done.at(-1).reply, route: `clauses (part) ${done.map((d) => d.route).join(' | ')}` };
      }
    }
    // THE REQUEST PROPOSER (Q48; behind a flag: engine.proposer is installed only when asked, PSYS2_PROPOSER=1 in Node): one more candidate reading. The model proposes a phrasing
    // (the turn's words without the ones it finds change nothing, the act's verb when the act has no word); the rules read that phrasing over the same open world, and it is taken
    // only when that reading is complete, agrees with the proposal and keeps every number, negation and name (src/dialog/proposer.mjs). Then the door goes on as for any reading.
    if (this.engine.proposer && !opts._clause) {
      let pr = null;
      try {
        const read = (t) => { try { return readTurn(lib, live, language, t, { dialogue: dlg, known: knownHere, worlds: present.world && present.world !== live ? [present.world] : [] }); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; return null; } };
        pr = await proposeReading(this.engine.proposer, { q, english, world: tabWorld, read, negations: (this.engine._proposerNeg ??= negationWords(language)) });
      } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; pr = { accepted: false, log: { why: `error ${e.message}` } }; }
      if (pr.accepted) {
        const rulesQ = { unread: q.unread, act: q.act, english };
        q = pr.q; english = pr.english;
        q.corrections = [...(q.corrections ?? []), { said: rulesQ.english, as: pr.english }];   // the tier `guessed`: the reply says the reading ("I read ... as ..."), as it says a repaired slip
        if (en.repairs?.length) q.sourceRepairs = en.repairs.map((r) => ({ said: r.from, as: r.to, source: r.source }));
        flat = { act: q.act, target: q.target, facts: q.facts, reaction: q.reaction, unread: q.unread, used: q.used, corrections: q.corrections, english: q.english, source: 'proposer', rules: rulesQ, ...(q.sourceRepairs ? { sourceRepairs: q.sourceRepairs } : {}) };
      }
      if (pr.log) flat.proposer = pr.log;
    }
    // A REACTION THAT CHANGES NOTHING (praise, thanks: w.dialogue.revision `does=none`, data asked through reviseRequest; reviewer 22:45): read on every declared tab before the tab's acts, answered with the dialogue's own reply,
    // no plan and no undo step (a message of the reaction alone: no act, no thing, no unread word, nothing but a manner cue beside it, which the praise word also is)
    // (a praise word is also the cue of a manner, "nice": a constraint made of the very words of the reaction's cue is the praise itself, not a request to refine)
    const sayingCue = (c) => (q.request.reactions ?? []).some((x) => x.value === q.reaction && x.at === c.at && x.words === c.words);
    if (q.reaction && !q.act && !q.target && !q.unread.length) {
      let rv = null;
      const bare = Object.assign(plainRequest(q.request), { constraints: (q.request.constraints ?? []).filter((c) => !sayingCue(c)) });   // the cue's own words are the reaction, not a constraint beside it
      // what the dialogue does with the reaction does not depend on there being a result to change: with none, it is asked as if the turn's own request were the current one
      try { rv = lib.reviseRequest(dlg.result ? dlg : { ...dlg, last: bare, result: { status: 'current' } }, bare, { revisions: language, catalog: [language] }); } catch { rv = null; }
      const said = rv && !rv.request ? replyOf(lib, language, rv.reply ?? '', {}) : null;
      if (said?.text) {
        const r = await this._sendCore(text, { ...opts, language: lang }, { english, translation, say: said.text, parts: factParts(lib, language, [{ reply: said.name, roles: {} }], said.text) ?? undefined });
        r.trace.request = flat;
        return { reply: r, route: `reaction ${rv.reaction}` };
      }
    }
    // THE DECLARED BINDING (sopworld 0.152.1 std.tool; reviewer 2026-11-15 20:45): a world whose request.sop binds its acts to tool primitives is planned, run and said by the
    // library: a question about the state or about what the world can do (askWorld), the acts on the things there and things of kinds (planRequest over the mirrored view, runPlan
    // through the bindings, sayRequest from the view's diff). What the binding does not take goes on (scenes: the world's executor; undo; the honest reply).
    const pageOp = worldWholeOperation(live, q.request);   // "start a new drawing": the world's own whole with nothing said of it is its new page, not a scene (Q93 (6))
    if (pageOp && typeof this.engine.set.get(tabWorld)?.ops?.[pageOp] === 'function' && !q.unread.length) return this._doorOp({ text, opts, lang, english, translation, tabWorld, act: 'make', op: pageOp, args: {}, flat });
    if (tools) { const b = await this._doorBound({ text, opts, lang, english, translation, tabWorld, live, language, q, flat, lastRec, dlg, tools }); if (b) return b; }
    if (isQuestion(english, language)) return why('question');
    // UNDO / REDO are acts of the session's timeline (k.actions undo, redo), not of the tab world's request: the timeline answers ("redo", "undo the whole message", "undo the
    // house"), else the world's own undo or redo declared in its request.sop (psys2.op act=undo op=...) takes back its last step (reviewer 2026-11-15 19:05)
    if (q.act === 'undo' || q.act === 'redo') return this._doorTimeline({ text, opts, lang, english, translation, tabWorld, act: q.act, live, flat, unread: q.unread, named: (q.request?.refers === 'last' ? null : q.target) ?? q.facts.find((f) => f.key === 'kind' && !f.neg)?.value ?? null });   // "undo that": the anaphor names no step
    if (!q.act && !q.target && !q.reaction && !(lastRec && q.request.constraints?.length)) return why('nothing read');   // constraints only count against a last result (a refine)
    if (q.unread.length) return why(`unread: ${q.unread.join(' ')}`);
    const state = this.isession.state[tabWorld] ?? null;
    let rev = null;
    try { rev = lib.reviseRequest(dlg, q.request, { revisions: language, catalog: [language] }); } catch { rev = null; }
    const cap = lib.capabilitiesOf(live, { catalog: [language] });
    const base = { text, opts, lang, english, translation, tabWorld, q, flat, lastRec, dlg, present };
    // 1. an arrangement of what the open world holds: a named layout said with no act, nothing but the layout and kinds (its regions), before any revision ("break it into 3 layers: water, land and sky")
    const layout = q.facts.find((f) => f.key === 'layout' && f.value !== 'better');
    if (!q.act && !q.target && layout && (q.request.constraints ?? []).every((c) => c.on === 'layout' || (c.on === 'kind' && c.want === 'yes') || c.on === 'count') &&   /* a count beside a named layout with no act counts the layout's parts ("3 layers"; the reader attaches it to the next kind, Q42 (9) [LIB]) */ (state?.objects ?? state?.shapes ?? []).length > 0 && cap.honours.some((h) => h.act === 'arrange')) {
      const goalReq = withAct(q.request, 'arrange'); goalReq.target = lastRec?.flat?.target ?? null;
      return this._doorRun({ ...base, goalReq, base: undefined, arrange: true, route: 'arrange' });
    }
    // 2. a reaction to the open tab's last result: the revision of its request, carried out on the state before it (the last result is replaced, never piled on)
    const named = q.target ?? q.facts.find((f) => f.key === 'kind' && !f.neg)?.value ?? null;
    const definite = named && hasThing(state, named) && definiteKind(english, q.request.constraints, language, named);   // "the tree": a thing of the open world, the readers' to change
    if (lastRec?.via === 'plan' && !definite && rev?.sort === 'reaction' && (!q.act || q.request.refers === 'last' || ['redo', 'reduce', 'enlarge'].includes(q.reaction))) {   // the dialogue world's decision: a reaction cue, or constraints only (a refine: "anything but circles")
      if (!rev.request) return why(`reaction ${rev.reaction} changes nothing`);   // thanks, frustration: the dialogue's own reply
      const lastT = lastRec.flat?.target ?? lastRec.request?.target ?? null;
      const keys = new Set(cap.honours.filter((h) => h.act === 'make' && (!lastT || !h.of.length || h.of.includes(lastT) || madeIn(live, language, lastT))).flatMap((h) => [...h.on]));
      const foreign = (q.request.constraints ?? []).filter((c) => !keys.has(c.on));
      if (foreign.length) return why(`revision by ${foreign.map((c) => c.on).join(', ')} not declared`);   // "make it bold" after a story: an edit for the readers, not a revision of the request
      const lastTarget = lastRec.flat?.target ?? lastRec.request?.target ?? null;
      if (lastTarget && rev.request.target !== lastTarget && !q.act) rev.request.target = lastTarget;   // "less trees" after a forest: a part of the last result, never a new thing (stand-in, questions.md Q40)
      return this._doorRun({ ...base, goalReq: rev.request, base: lastRec.before, reaction: rev.reaction, rev, route: `reaction ${rev.reaction}` });
    }
    if (q.reaction && !q.act) return why(lastRec ? `reaction ${q.reaction} not a revision` : `reaction ${q.reaction} with no result`);
    // the same random request again ("draw a random diagram" twice): another sample in place of the last result, never a second one on top
    if (lastRec && q.act && q.target && lastRec.flat?.target === q.target && q.facts.some((f) => f.key === 'manner' && f.value === 'random') && JSON.stringify(q.facts) === JSON.stringify(lastRec.flat?.facts ?? null)) {
      const again = Object.assign(plainRequest(q.request), {}); Object.defineProperty(again, 'facts', { value: q.facts, enumerable: false });
      return this._doorRun({ ...base, goalReq: again, base: lastRec.before, reaction: 'redo', rev: { sort: 'reaction', reaction: 'redo', request: again, vary: true }, route: 'reaction redo' });
    }
    if (!q.act) return why('no act');
    // 3. a new request: the act and the thing must be declared by the open world (std.schema.honours); a thing of the open world named with "the" is a change of it, not a new one
    let req = q.request;
    // "draw something random", "whatever you want": the thing is the world's own whole (its general kind; a general whole is then sampled among the wholes it plans)
    if (q.act === 'make' && !q.target && !(req.constraints ?? []).some((c) => c.on === 'kind' && c.want === 'yes') && saysAnything(english, language)) {
      const whole = [...worldWholes(live)][0];
      if (whole) { req = Object.assign(plainRequest(req), { target: whole, refers: 'kind' }); Object.defineProperty(req, 'facts', { value: q.facts, enumerable: false }); }
    }
    const isMade = (k) => !!k && lib.declares(live, 'make', k, { catalog: [language] });
    const act = req.act;
    const thing = req.target ?? q.facts.find((f) => f.key === 'kind' && !f.neg)?.value ?? null;
    // no thing named: the door's only when a count names the unit of a whole this world makes ("draw 6 nodes"); "add a paragraph ..." is not a story to guess
    if (!thing && !(req.constraints ?? []).some((c) => c.on === 'count' && c.of && unitOfWhole(live, language, c.of))) return why('no thing named');
    if (!(thing ? lib.declares(live, act, thing, { catalog: [language] }) || (act === 'make' && madeIn(live, language, thing) && cap.honours.some((h) => h.act === act)) : cap.honours.some((h) => h.act === act))) return why(`act ${act}${thing ? ` ${thing}` : ''} not declared`);   // a whole the catalog expects made in this world (k.expect.make made_in) is this world's to make
    // a whole the world makes with an operation of its own (request.sop `psys2.op act= of= op=`: a new page) is that operation, one step, with nothing guessed
    const ownOp = thing && actOperation(live, act, thing);
    if (ownOp && typeof world?.ops?.[ownOp] === 'function') {
      const others = (req.constraints ?? []).filter((c) => !(c.on === 'kind' && c.value === thing));
      if (others.length) return why(`not declared: ${others.map((c) => c.words ?? c.on).join(', ')}`);
      return this._doorOp({ text, opts, lang, english, translation, tabWorld, act, op: ownOp, args: {}, flat });
    }
    if (thing && hasThing(state, thing) && definiteKind(english, req.constraints, language, thing)) return why(`refers to the ${thing} of the open world`);
    let dry = null;
    withSubkindsNegated(req, live, world.requestText);
    try { dry = lib.planRequest(present?.world ?? live, req, { catalog: [language], dialogue: dlg, seed: 1 }); } catch { dry = null; }   // planned over the open state: "in it", "there" resolve to what is there
    const undeclared = (dry?.notHonoured ?? []).filter((x) => x.code === 'not_declared');
    // a plan that breaks a count said of one kind ("3 clouds and a sun" planned as 2 clouds and 1 sun) is never carried out (P9: no executed result violates a said constraint)
    const planned = {};
    for (const st of dry?.steps ?? []) if (st.item && st.args?.kind) planned[st.args.kind] = (planned[st.args.kind] ?? 0) + 1;
    const broken = (req.constraints ?? []).filter((c) => c.on === 'count' && c.of && c.number !== undefined && planned[c.of] !== undefined && planned[c.of] !== c.number);
    if (dry?.ok && broken.length) return why(`plan breaks ${broken.map((c) => c.words ?? c.of).join(', ')}`);
    if (undeclared.length) return why(`not declared: ${undeclared.map((x) => x.words ?? x.on).join(', ')}`);   // the readers may do it; their result is checked and the constraint named
    return this._doorRun({ ...base, goalReq: req, base: undefined, route: 'request' });
  }

  /**
   * A TURN THROUGH THE DECLARED BINDING (sopworld 0.152.1; spec 28 section 12): `{ reply, route }`, or null when the binding does not take the turn. No code here is per world:
   *   a question   a reaction of the language world named in the library's WORLD_QUESTIONS (state, capabilities): askWorld over the view and the declarations, said by reply facts;
   *                no step;
   *   a revision   of the last result made through the binding (the dialogue world's reaction: "fewer dogs"): the plan takes the last timeline entry's place (runPlan `replace`);
   *   a request    an act the world binds (std.tool.bind): planRequest over the view told into a fork of the declarations (mirrorState), runPlan through the bindings with the
   *                world's primitives, sayRequest from the diff of the view. A plan of a scene of parts (mode other than things of kinds) is the world's executor's (next slice).
   * One plan is one step of the session's timeline (inside `_sendCore`); a revision replaces the step of the result it revises.
   */
  async _doorBound({ text, opts, lang, english, translation, tabWorld, live, language, q, flat, lastRec, dlg, tools }) {
    const lib = this.engine.sopworld;
    const label = { text: english };   // the words of the world's own history entry: what the plan does (set below from the plan), else the person's words
    const prims = this._toolPrimitives(tabWorld, tools, label);
    const sayOpts = { language };
    const question = (lib.WORLD_QUESTIONS ?? []).find((x) => (q.request.reactions ?? []).some((r) => r.value === x));
    if (question && !q.act && !q.unread.length && (q.request.constraints ?? []).every((c) => c.on === 'kind' || c.on === 'place' || (c.on === 'count' && c.number === undefined))) {   // a question of the world's kinds, places and how many ("what is 2 plus 2" is not one)
      let said = null;
      try { const answer = lib.askWorld(question, q.request, { live, bindings: tools, view: prims.view, catalog: [language] }); said = lib.sayRequest(q.request, { capabilities: answer.capabilities, answer: answer.facts }, sayOpts); } catch { said = null; }
      if (said?.text) {
        const r = await this._sendCore(text, { ...opts, language: lang }, { english, translation, say: said.text, parts: factParts(lib, language, said.facts, said.text) ?? undefined });
        r.trace.request = { ...flat, ask: question };
        return { reply: r, route: `ask ${question}` };
      }
    }
    if (q.act === 'undo' || q.act === 'redo' || q.unread.length || isQuestion(english, language)) return null;
    const rd = this.dialogue.requests;
    let req = q.request, replace = false, rev = null;
    if (lastRec?.via === 'tool') { try { rev = lib.reviseRequest(dlg, q.request, { revisions: language, catalog: [language], live: lib.mirrorState(live, prims.view, { catalog: [language] }).world }); } catch { rev = null; } }   // over the state: a make that refers to things there is a change of its own, not a revision
    if (rev?.sort === 'reaction' && (!q.act || q.act === (lastRec.request?.act ?? 'make')) && (!q.act || q.request.refers === 'last' || ['redo', 'reduce', 'enlarge'].includes(q.reaction))) {   // an act on the things there ("put it in the corner", "remove it") is not a revision of the request that made them
      if (!rev.request) return null;   // thanks, frustration: the dialogue's own reply
      replace = !!rev.replace;   // a reaction that replaces the last result ("fewer dogs")
      req = replace || !q.act ? rev.request : q.request;   // a turn with its own act that replaces nothing ("make the house bigger": the change sense of make) is its own request
    } else if (rev?.reaction === 'continue' && rev.request && !q.act && !(q.request.constraints ?? []).some((c) => c.on === 'place')) req = rev.request;   // a fragment of kinds continues the dialogue's act with a new request ("a sun" after "draw a fish": sopworld 0.154); one read with a place ("I like cats": "like" as a relation) is no fragment of a request (questions.md [LIB])
    if (req.act && !tools.binds.some((b) => b.act === req.act)) return null;   // no act said: the planner decides it from the world's declarations (sopworld 0.162: a noun phrase alone is a make, "put a hat" a make when it is not there, "make it happy" a change of the thing with that key)
    // a thing the world makes with no binding for its kind (a page: request.sop psys2.op) is not the binding's
    // (checked on the plan's target: a general whole with no expectation of its own, "a random picture", is planned as one of its subkind wholes the bindings make: sopworld 0.156)
    // a binding's `of=` names a kind by its lineage, or the type the kind is joined from (std.schema.kinds from=: sopworld 0.160, as the library's runPlan picks the binding)
    let joinedKinds = null;
    const bindLineage = (kind) => { joinedKinds ??= (() => { try { return lib.capabilitiesOf(live, { catalog: [language] }).joined ?? new Map(); } catch { return new Map(); } })(); const j = joinedKinds.get?.(kind); return [...lib.kindLineage(kind, { live, catalog: [language] }), ...(j?.from ? [j.from] : [])]; };
    const boundMake = (kind) => tools.binds.some((b) => b.act === 'make' && (!b.of.length || bindLineage(kind).some((k) => b.of.includes(k))));
    const timeline = rd.timeline(tabWorld);
    if (replace && !(timeline.done.at(-1)?.diff?.added ?? []).every((t) => prims.view().some((x) => x.id === t.id))) replace = false;   // the last entry was taken back (the session's undo): there is nothing to replace
    this._requestSeed = ((this._requestSeed ?? Math.floor(Math.random() * 2 ** 31)) * 1103515245 + 12345) >>> 0;
    const seed = replace && !rev?.vary ? (rev?.seed ?? lastRec?.seed ?? this._requestSeed) : this._requestSeed;
    if (!replace && dlg?.last?.target && req.target && dlg.last.target !== req.target) dlg = { ...dlg, last: null, result: null };   // a new thing does not take the values of the last one: the dialogue's values hold within one thing
    // the dialogue follows the timeline: the last plan run through the binding (of the same thing, when the turn names no new kind), so that a count revision keeps its structure (the library's cutToCount / fillToCount)
    if (lastRec?.via === 'tool' && timeline.done.at(-1)?.plan && (!req.target || timeline.done.at(-1).plan.target === req.target) && !(q.request.constraints ?? []).some((c) => c.on === 'kind' && c.want === 'yes' && c.value && !(timeline.done.at(-1).plan.roles?.kinds ?? []).includes(c.value))) dlg = { ...dlg, lastPlan: timeline.done.at(-1).plan, lastRun: { made: timeline.done.at(-1).result?.things ?? [] } };
    // a reply of the last turn that changed nothing and named a thing ("The hat is already there.", "The eyes are already green."): that thing is what "it" means now (the library's toolApp convention, sopworld 0.163 `plan.referent`; `_msg` is counted in `_sendCore`, after the door has read the turn)
    if (this._doorNamed?.world === tabWorld && this._doorNamed.msg === this._msg) dlg = { ...dlg, lastRun: { made: this._doorNamed.ids } };
    const planOpts = { catalog: [language], dialogue: dlg, seed, vary: !!rev?.vary, replace: replace ? (timeline.done.at(-1)?.diff?.added ?? []).map((t) => t.id) : [] };
    const mirror = lib.mirrorState(live, prims.view, { catalog: [language] }).world;
    let plan = null;
    try { plan = lib.planRequest(mirror, req, planOpts); } catch (e) { if (globalThis.process?.env?.PSYS2_REQUEST_DEBUG) console.error('[door] bound plan', e); plan = null; }
    if (!plan) return null;
    const act = plan.act ?? req.act;   // the act planned (0.162 may decide it, or make a place a make)
    if (!act || !tools.binds.some((b) => b.act === act)) return null;
    if (act === 'make' && (plan.target ?? req.target) && !boundMake(plan.target ?? req.target)) return null;
    if (!plan.ok && (plan.notHonoured ?? []).some((x) => x.code === 'no_target')) return null;   // nothing named: the door's other paths say it
    if (act === 'make' && !req.target && !(req.constraints ?? []).length && (plan.assumed ?? []).some((a) => a.key === 'target')) return null;
    // a whole guessed while the turn names a thing of its own that is not a target ("add a paragraph about rain": a part, not a story to write over the open document) is not the
    // binding's, unless a count names that unit ("draw 6 nodes"); with no thing named at all ("draw whatever you want") the planner's guess stands
    if (act === 'make' && !req.target && (plan.assumed ?? []).some((a) => a.key === 'target') && (q.request.mentions ?? []).some((m) => m.kind) && !(req.constraints ?? []).some((c) => c.on === 'count' && c.of && unitOfWhole(live, language, c.of))) return null;   // a bare "draw" (nothing said but the act): never a whole guessed from the world (the door asks, as on every path); "something random", "5 nodes" are the planner's
    if (replace && (plan.notHonoured ?? []).length) return null;   // a reaction with words the world does not take ("I like horses") is not a revision of its result
    // P9 (spec 28 section 10): a move with no place said whose other words the act does not take ("put a heart on the chest": "on the chest" is no place of the act, "heart" no key
    // of a move) is not carried out and not asked about: the honest reply names what was not taken, in every language (the door's cannot.do). The same when the planner turned the
    // move read into another act (sopworld 0.163: "a heart" as a value of the thing that has the key: the head's variant) while words of the turn stay untaken
    if ((act === 'place' || req.act === 'place') && !(req.constraints ?? []).some((c) => c.on === 'place') && (plan.notHonoured ?? []).some((n) => n.code === 'not_declared')) return { why: `not declared: ${plan.notHonoured.filter((n) => n.code === 'not_declared').map((n) => n.words).join(', ')}`, q: flat };
    // P9: a plan that breaks a count said of one kind ("6 boxes" planned as 3 boxes and 3 circles) is never carried out; the honest reply names it
    if (plan.ok) {
      const planned = {};
      for (const st of plan.steps ?? []) if (st.item && st.args?.kind) for (const k of lib.kindLineage(st.args.kind, { live, catalog: [language] })) planned[k] = (planned[k] ?? 0) + 1;
      const broken = (req.constraints ?? []).filter((c) => c.on === 'count' && c.of && c.number !== undefined && (planned[c.of] ?? 0) !== c.number && !(plan.target && lib.kindLineage(plan.target, { live, catalog: [language] }).includes(c.of)));   // a count of a kind the plan's target is one of ("a random picture" planned as a forest: sopworld 0.156) is the target's
      if (broken.length) return { why: `plan breaks ${broken.map((c) => c.words ?? c.of).join(', ')}`, q: flat };
    }
    // a plan whose steps the bindings do not all cover (a scene of parts whose whole the world binds no primitive to: a pond) is the world's executor's; one the bindings cover
    // (things of kinds, a diagram with its nodes and arrows) runs through them
    const bound = (st) => tools.binds.some((b) => b.act === st.action && (!b.of.length || (st.args?.kind ? bindLineage(st.args.kind) : []).some((k) => b.of.includes(k)) || (st.args?.kind === undefined && st.args?.thing !== undefined)));
    if (act === 'make' && (plan.ok ? !(plan.steps ?? []).every(bound) : !(plan.cannot?.length || plan.notHonoured?.length || plan.replies?.length))) return null;   // a question back (which one?) is the plan's answer
    // the kinds the plan makes that the world takes only by join (std.schema.kinds, not a std.schema.kind of its own: a goat, a child, a frog in a pond) are looked up in the knowledge
    // catalog before the tool runs, as the readers' preloadThings does: the tool draws them from what the lazy loader holds (ctx.knowledge.peek). Bounded: twelve kinds, one
    // catalog deadline; no catalog, nothing loaded
    try { const cat = knowledgeOf(this), joined = cat ? (() => { try { return lib.capabilitiesOf(live, { catalog: [language] }).joined; } catch { return null; } })() : null;
      const own = new Set((live.ofType?.('std.schema.kind') ?? []).map((r) => String(r.attrs?.of?.[0] ?? '')));
      const kinds = [...new Set((plan.steps ?? []).map((st) => st.args?.kind).filter((k) => k && !own.has(String(k)) && joined?.has?.(k) && (typeof cat.peek !== "function" || cat.peek(String(k).replace(/_/g, " ")) === undefined)))].slice(0, 12);
      if (kinds.length) { try { await guard.untimed(() => within(this, Promise.all(kinds.map((k) => cat.thing(String(k).replace(/_/g, ' ')).catch(() => null))))); } catch { /* the tool then says it cannot draw it */ } } } catch { /* a catalog that cannot be asked loads nothing: the tool says what it cannot draw */ }
    // one step per request: a revision replaces the session step of the result it revises
    const replaces = replace && lastRec?.turn != null && this.discourse.actions[0]?.turn === lastRec.turn ? this.discourse.actions[0] : null;
    const before = replaces ? { ...this._doorBegin(), ...replaces.before } : undefined;
    let run = null;
    const r = await this._sendCore(text, { ...opts, language: lang }, { english, translation, ...(before ? { before } : {}), run: () => {
      // the history entry of a make says what the plan adds, in the reply facts' words ("added a sun"), so an undo or a redo says what it took back ("OK, I undid it (added a sun)")
      try { const adds = (plan.steps ?? []).filter((st) => st.action === 'make' && st.args?.kind).map((st, i) => ({ id: `planned${i}`, kind: st.args.kind, attrs: {} })); const pre = adds.length ? lib.sayRequest(req, { ...plan, assumed: [], run: { ok: true, diff: { added: adds, removed: [], changed: [] } } }, sayOpts)?.text ?? '' : ''; const did = pre.split(/(?<=\.)\s+/).filter((x) => /^I /.test(x) && !/^I assumed /.test(x)).map((x) => x.replace(/^I /, '').replace(/\.$/, '')).join(', '); if (did) label.text = did; } catch { /* the person's words stand */ }
      try { run = lib.runPlan(plan, tools, prims, { view: prims.view, timeline, replace, request: req, live, catalog: [language] }); } catch (e) { run = { ok: false, diff: { added: [], removed: [], changed: [] }, failed: { code: 'tool_error', reply: 'why.nothing', roles: {}, detail: String(e?.message ?? e) } }; }
      let said = null;
      const told = madeAgainstSaid(lib, live, language, req, plan, run, prims.view());   // what was made against what was said (short_of), the made whole's title (spec 28 section 20)
      try { said = lib.sayRequest(req, { ...plan, ...told, run, revised: rev?.sort === 'reaction' && replace && run.ok && !run.same && !plan.reference, reply: rev?.reply }, sayOpts); } catch { said = null; }
      const done = run.ok && !run.same;
      const read = (q.corrections ?? []).length ? `I read ${q.corrections.map((c) => `"${c.said}" as "${c.as}"`).join(', ')}. ` : '';   // what the reader repaired is said, as every door reply says it
      const facts = factParts(lib, language, said?.facts, said?.text ?? '');

      const parts = facts ? [...(read ? [{ text: read, translate: true }] : []), ...facts] : null;
      return { reply: read + (said?.text || ''), ...(parts ? { parts } : {}), status: done ? 'supported' : 'unsupported', info: { kind: 'door' }, frame: done ? { world: tabWorld, text: english, act: req.act ?? 'make' } : null };
    } });
    if (replaces && run?.ok) this.discourse.actions = this.discourse.actions.filter((x) => x !== replaces);
    this._doorNamed = null;
    if (run && !run.ok) { const named = plan.referent ?? (run.failed?.code === 'same' ? (plan.steps ?? []).flatMap((x) => [].concat(x.args?.ids ?? x.args?.thing ?? [])) : null) ?? ((plan.replies ?? []).some((x) => x.reply === 'refused.already') ? prims.view().filter((t) => (plan.replies ?? []).some((x) => x.reply === 'refused.already' && String(x.roles?.thing ?? '').replace(/ /g, '_') === String(t.kind))).map((t) => t.id) : null);   /* the things of the kind refused.already names: stand-in until 0.164 gives plan.referent (Q100 (1)) */ const ids = (named ?? []).map((id) => String(id).replace(/^\$/, '')).filter((id) => prims.view().some((t) => String(t.id) === id)); if (ids.length) this._doorNamed = { world: tabWorld, ids, msg: this._msg }; }
    if (run?.ok) {
      if (run.entry) { run.entry.turn = this._msg; run.entry.result = run.result; }   // the session turn of the plan: an undo of that turn is the timeline's
      rd.trimTimeline(tabWorld);
      rd.record(tabWorld, { request: { ...plainRequest(req), act: plan.act ?? req.act }, flat: { ...flat, target: req.target ?? flat.target },   /* the act planned: a make in the change sense is a change */ result: run.result ? { count: run.result.count, kinds: run.result.kinds, links: run.result.links, things: run.result.things ?? [] } : null, seed, previous: lastRec?.request ?? null, previousSeed: lastRec?.seed ?? null, via: 'tool', turn: this._msg });
    }
    const status = run?.ok && !run.same ? 'supported' : [run?.failed, ...(run?.failed?.because ?? []), ...(plan?.replies ?? [])].some((x) => /missing/.test(String(x?.code ?? x?.reply ?? x?.name ?? ''))) ? 'missing' : 'unsupported';   // a value the act needs and nobody said ("move the fish": where?) is missing, as the readers' answers say it
    r.trace.request = { ...flat, revised: replace ? (req.facts ?? null) : null, plan: { roles: plan.roles, assumed: plan.assumed, notHonoured: plan.notHonoured, steps: plan.steps?.length ?? 0 }, tool: { calls: (run?.calls ?? []).map((c) => ({ op: c.op, args: c.args })), assumed: run?.assumed ?? [], failed: run?.failed ?? null, step: run?.step ?? null } };
    if (Array.isArray(r.statuses)) r.statuses = [status];
    if (Array.isArray(r.answers) && !r.answers.length) r.answers.push({ id: null, to: `door.${tabWorld}`, kind: 'action', status, value: null, text: r.text, via: 'door', sentence: english });
    if (Array.isArray(r.worlds) && !r.worlds.includes(tabWorld)) r.worlds.push(tabWorld);
    if (!(r.segments ?? []).some((sg) => (sg.world ?? sg.match?.worldId) === tabWorld)) r.segments = [...(r.segments ?? []), { world: tabWorld, text: english, planned: true }];
    return { reply: r, route: `bound ${req.act}${replace ? ' (revision)' : ''}` };
  }

  /**
   * The primitives table of a bound world for the library's runPlan: each op and custom function its std.tool wires declare, from the world's operations (an op runs as an act of
   * this turn: `{ status: 'supported' }`, else a refusal `{ ok: false, code }`; a custom search is called with its arguments and the view), the view (the world's `toolView`
   * operation: its state as facts; a refusal may carry the tool's reply fact name and roles). No snapshot / restore: the library's timeline takes a plan back by the inverse of its diff through the bindings, so an id is never given twice. No code here is per world.
   */
  _toolPrimitives(tabWorld, tools, labelBox = null) {
    const labelOf = () => (labelBox && typeof labelBox === 'object' ? labelBox.text : labelBox);
    const world = this.engine.set.get(tabWorld);
    const ops = world?.ops ?? {};
    const out = {};
    for (const name of tools.ops.keys()) if (typeof ops[name] === 'function') out[name] = (args) => { const r = this._runWorldAct(tabWorld, name, { ...args, step: `turn${this._msg}`, label: labelOf() }); return r?.status === 'supported' ? r : { ok: false, code: r?.code ?? 'refused', reply: r?.reply ?? 'why.nothing', roles: r?.roles ?? {} }; };   // a tool's refusal may name its reply fact (refused.nothing_known)
    for (const name of tools.customs.keys()) if (typeof ops[name] === 'function') out[name] = (args, view) => ops[name](args, view);
    const state = () => { if (!this.isession.state[tabWorld]) this.isession.state[tabWorld] = typeof ops.initialState === 'function' ? ops.initialState() : {}; return this.isession.state[tabWorld]; };
    out.view = () => (typeof ops.toolView === 'function' ? ops.toolView({ state: state() }) : []);
    return out;
  }

  /**
   * No fallback on a declared tab (owner 2026-11-15 17:55): what the door could not take is said honestly, from the request (its unread words, the act or the thing the world
   * does not declare, what the plan could not honour); nothing of the old tab patterns runs. Every reason is a "needs <generic piece>" of the log's attribution.
   */
  async _doorHonest(text, opts, tabWorld, door) {
    const lib = this.engine.sopworld;
    const live = liveWorld(lib, this.engine.set.get(tabWorld));
    const name = (live?.ofType?.('std.schema.world')?.[0]?.attrs?.name?.[0]) ?? 'open tab';
    const q = door?.q ?? null;
    const why = String(door?.why ?? '');
    const list = (ws) => ({ names: ws.map((w) => String(w)) });   // the person's own words: said as they are, quoted, in every language
    // what the door could not take, as a reply fact of the language world (the reason of `door.why`, not a sentence of code): every language says it by the same name
    let fact;
    const cl = q?.unread?.length ? clausesOf(q.english ?? text, requestLanguage(lib), q.unread) : [];
    if (cl.some((c) => !c.unread) && cl.some((c) => c.unread)) fact = ['not_understood.part', { done: list(cl.filter((c) => !c.unread).map((c) => c.text)), words: list(cl.filter((c) => c.unread).map((c) => c.text)) }];   // a clause next to one not understood never runs (destructive or not)
    else if (q?.unread?.length) fact = ['not_understood.words', { words: list(q.unread) }];
    else if (why === 'question') fact = ['cannot.ask', { world: name }];
    else if (/^act (\S+)(?: (.+))? not declared$/.test(why)) { const [, act, thing] = why.match(/^act (\S+)(?: (.+))? not declared$/); fact = thing ? ['cannot.act.kind', { act, kind: thing.replace(/_/g, ' '), world: name }] : ['cannot.act.any', { act, world: name }]; }
    else if (/^refers to the (.+) of the open world$/.test(why)) fact = ['cannot.act', { act: 'change', thing: why.match(/^refers to the (.+) of the open world$/)[1], world: name }];
    else if (/^(?:plan drops|not declared:) (.+)$/.test(why)) fact = ['cannot.do', { words: list(why.replace(/^(?:plan drops|not declared:) /, '').split(', ')), world: name }];
    else if (/^executor/.test(why) || /^no plan/.test(why) || why === 'no executor') fact = ['cannot.make', { world: name }];
    else if (/^plan breaks (.+)$/.test(why)) fact = ['cannot.plan', { words: why.replace(/^plan breaks /, '') }];
    else if (/^reaction \S+ with no result$/.test(why) || /not a revision$/.test(why)) fact = ['cannot.revise', { world: name }];
    else fact = ['not_understood.here', { world: name }];
    const lang0 = requestLanguage(lib);
    const said = sayFact(lib, lang0, fact[0], fact[1]);
    const say = said?.text ?? `I did not understand that as something to do in the ${name}.`;
    const en = await this._doorEnglish(text, opts).catch(() => null);
    const r = await this._sendCore(text, { ...opts, ...(en?.lang ? { language: en.lang } : {}) }, { english: en?.english ?? text, translation: en?.translation ?? null, say, ...(said ? { parts: said.parts } : {}) });
    r.trace.request = q;
    if (Array.isArray(r.statuses)) r.statuses = ['unsupported'];
    return r;
  }

  /**
   * An undo or a redo on a declared tab, inside the turn (so that it is not itself a step): the timeline's own answer first (discourse `undoRedo`: redo of what the timeline took
   * back, "undo the whole message", "undo the house"), else the world's declared undo / redo operation (its own history). Nothing here is per world.
   */
  async _doorTimeline({ text, opts, lang, english, translation, tabWorld, act, live, flat, unread = [], named = null, answer = false }) {
    const world = this.engine.set.get(tabWorld);
    const op = actOperation(live, act);
    const name = (live?.ofType?.('std.schema.world')?.[0]?.attrs?.name?.[0]) ?? 'open tab';
    const run = async (en, { pend, sid } = {}) => {
      const m = answer ? await this.discourse.meta(en, pend, sid) : await this.discourse.undoRedo(en);   // `answer`: the turn answers the timeline's own question ("Shall I take them all back?")
      if (answer && !m) return { reply: 'I did not understand that as an answer to my question.', status: 'unsupported', info: { kind: 'intent' } };
      if (m) return { ...m, status: m.status ?? 'supported' };
      const lib = this.engine.sopworld, language = requestLanguage(lib);
      if (unread.length || named) { const f = unread.length ? sayFact(lib, language, 'not_understood.undo', { words: { names: unread } }) : sayFact(lib, language, 'nothing.like', { words: { names: [String(named).replace(/_/g, ' ')] } }); return { reply: f?.text ?? 'I took nothing back.', ...(f ? { parts: f.parts } : {}), status: 'unsupported', info: { kind: 'intent' } }; }   // "undo the unicorn": nothing that was done; "undo the house" with no such step never takes back another
      if (!op || typeof world?.ops?.[op] !== 'function') { const f = sayFact(lib, language, 'cannot.act.any', { act, world: name }); return { reply: f?.text ?? `I cannot ${act} here yet.`, ...(f ? { parts: f.parts } : {}), status: 'unsupported', info: { kind: 'intent' } }; }
      const r = this._runWorldAct(tabWorld, op, {});
      const did = r?.status === 'supported';
      const said = String(r?.value ?? r?.note ?? '').trim() || (r?.reply ? replyOf(lib, language, r.reply, r.roles ?? {})?.text : '') || sayFact(lib, language, `nothing.${act}`)?.text || '';   // a tool says what it did by a reply fact's name (done.undo, nothing.undo)
      // the reply fact of the step (done.undo / done.redo, nothing.undo / nothing.redo): the world's English words stay what it said; every other language says the fact
      const fact = r?.reply ?? (did ? `done.${act}` : `nothing.${act}`);
      return { reply: said, parts: [{ text: said, translate: true, say: { act: fact, roles: r?.roles ?? {} } }], status: r?.status ?? 'missing', info: { kind: 'door' }, frame: did ? { world: tabWorld, text: en, act } : null };
    };
    const r = await this._sendCore(text, { ...opts, language: lang }, { english, translation, run });
    r.trace.request = flat;
    return { reply: r, route: `timeline ${act}` };
  }

  /** A declared operation of the open world carried out as one step of this turn (inside the turn, so that the timeline keeps it): its own words are the reply. */
  async _doorOp({ text, opts, lang, english, translation, tabWorld, act, op, args, flat, after = null, corrections = [] }) {
    let done = null;
    const run = () => {
      const r = this._runWorldAct(tabWorld, op, args);
      done = r;
      after?.(r);
      const lib = this.engine.sopworld, language = requestLanguage(lib);
      const fact = !String(r?.value ?? r?.note ?? '').trim() && r?.reply ? replyOf(lib, language, r.reply, r.roles ?? {}) : null;   // a tool says what it did by a reply fact's name (done.page, done.undo)
      const said0 = String(r?.value ?? r?.note ?? '').trim() || fact?.text || 'I could not do that.';
      const said = corrections.length ? `I read ${corrections.map((c) => `"${c.said}" as "${c.as}"`).join(', ')}. ${said0}` : said0;   // what the reader repaired is said, as the plans say it
      const parts = fact && !corrections.length ? [{ text: said, translate: true, say: { act: r.reply, roles: r.roles ?? {} } }] : namedParts(said, [...(r?.names ?? []), ...(args?.ids ?? []).filter((x) => /_/.test(String(x)) || said.includes(String(x)))]);   // the names of the things in the reply are names
      return { reply: said, ...(parts ? { parts } : {}), status: r?.status ?? 'missing', info: { kind: 'door' }, frame: r?.status === 'supported' ? { world: tabWorld, text: english, act } : null };
    };
    const r = await this._sendCore(text, { ...opts, language: lang }, { english, translation, run });
    r.trace.request = flat;
    const status = done?.status ?? 'missing';
    if (Array.isArray(r.statuses)) r.statuses = [status];
    if (Array.isArray(r.answers) && !r.answers.length) r.answers.push({ id: null, to: `op.${tabWorld}.${op}`, kind: 'action', status, value: done?.value ?? null, text: String(done?.value ?? done?.note ?? ''), via: 'door', sentence: english });   // the act of the world, as the readers' answers record theirs
    if (Array.isArray(r.worlds) && !r.worlds.includes(tabWorld)) r.worlds.push(tabWorld);
    if (!(r.segments ?? []).some((sg) => (sg.world ?? sg.match?.worldId) === tabWorld)) r.segments = [...(r.segments ?? []), { world: tabWorld, text: english, planned: true }];
    return { reply: r, route: `op ${op}` };
  }

  /** The state of every world before a door act and the library's mark of this turn (the turn `_sendCore` will open): the act and its turn are one undo step. */
  _doorBegin() {
    const before = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.rs?.beginTurn(this._msg + 1);
    return before;
  }

  /** Plan a request with the library and let the open world carry it out (the door's tail); `{ reply, route }`, or `{ why }` when the world's executor does not take the plan. */
  async _doorRun({ text, opts, lang, english, translation, tabWorld, goalReq, base, reaction = null, rev = null, arrange = false, q, flat, lastRec, dlg, route, present = null }) {
    const { set, interp } = this.engine;
    const lib = this.engine.sopworld;
    const world = set.get(tabWorld);
    const language = requestLanguage(lib), live = liveWorld(lib, world);
    if (typeof world?.ops?.planRequest !== 'function') return { why: 'no executor', q: flat };
    const sendOpts = { ...opts, language: lang };
    const measure = (before) => interp.hook(this.isession, tabWorld, 'requestResult', { before });
    this._requestSeed = ((this._requestSeed ?? Math.floor(Math.random() * 2 ** 31)) * 1103515245 + 12345) >>> 0;   // random is varied across sessions; a session's next plan is the next number
    const seed = reaction && !rev?.vary ? (rev?.seed ?? this._requestSeed) : this._requestSeed;   // a varied redo is a fresh sample
    let plan = null;
    withSubkindsNegated(goalReq, live, world.requestText);
    if (base === undefined && !reaction && dlg?.last?.target && goalReq.target && dlg.last.target !== goalReq.target) dlg = { ...dlg, last: null, result: null };   // a new thing does not take the values of the last one (its colour, its size): the dialogue's values hold within one thing
    const over = base === undefined && present?.world ? present.world : live;   // a new request is planned over the open state (its things are places and referents); a revision over the state before the result it replaces
    try { plan = lib.planRequest(over, goalReq, { catalog: [language], dialogue: dlg, seed, vary: !!rev?.vary }); } catch { plan = null; }
    // A GENERAL WHOLE ("a random picture"): a kind with no parts of its own whose subkinds are the wholes the world plans (pond, forest, garden extend picture) is one of them,
    // sampled with the session's seed (stand-in until planRequest abduces the subkind, questions.md Q42 (8) [LIB])
    if (plan?.ok && goalReq.target && (plan.steps ?? []).filter((st) => st.item).every((st) => st.args?.kind === goalReq.target)) {
      const parents = typeParents(live), wholes = doorWholes(live);
      const own = new Set([...String(world.requestText ?? '').matchAll(/^@\S+ psys2\.door .*$/gm)].flatMap((m) => [...m[0].matchAll(/whole=(\S+)/g)].map((x) => x[1])));   // the world's own wholes come before the catalog's
      const all = [...wholes].filter((w) => w !== goalReq.target && parents.get(w) === goalReq.target);
      const subs = all.some((w) => own.has(w)) ? all.filter((w) => own.has(w)) : all;
      if (subs.length) {
        const sub = subs[seed % subs.length];
        const req2 = Object.assign(plainRequest(goalReq), { target: sub });
        Object.defineProperty(req2, 'facts', { value: goalReq.facts, enumerable: false });
        try { const p2 = lib.planRequest(live, req2, { catalog: [language], dialogue: dlg, seed, vary: !!rev?.vary }); if (p2?.ok) { plan = p2; goalReq = req2; } } catch { /* the plan stands */ }
      }
    }
    if (globalThis.process?.env?.PSYS2_REQUEST_DEBUG) console.error('[door] plan', route, JSON.stringify({ ok: plan?.ok, roles: plan?.roles, nh: plan?.notHonoured, cannot: plan?.cannot })?.slice(0, 600));
    if (!plan?.ok && arrange) plan = { ok: true, roles: { layout: q.facts.find((f) => f.key === 'layout')?.value }, steps: [], assumed: [], notHonoured: plan?.notHonoured ?? [], target: goalReq.target };   // an arrangement of what is there: the world's own act on its things
    if (!plan?.ok && plan?.cannot?.length) {   // the library's reasoning found the plan cannot hold: nothing is made, the reasons are said
      let whyNot = null;
      try { whyNot = lib.sayRequest(goalReq, { cannot: plan.cannot, notHonoured: plan.notHonoured ?? [] }, { language }); } catch { whyNot = null; }
      const r = await this._sendCore(text, sendOpts, { english, translation, say: whyNot?.text || `I could not do that: ${plan.cannot.map((c) => c.why).join('; ')}.` });
      r.trace.request = { ...flat, plan: { cannot: plan.cannot, rejected: plan.rejected } };
      return { reply: r, route: `${route} cannot` };
    }
    if (!plan?.ok) return { why: `no plan (${(plan?.notHonoured ?? []).map((x) => x.code).join(', ') || 'library'})`, q: flat };
    // P9 (no executed result violates what was said): a plan that drops a thing or a key this turn said ("there should be a moon" where the world has no moon; "a sun, a cloud and
    // a bird" planned as one sun) is not carried out; the readers may know it, and their result is checked
    const saidText = english.toLowerCase();
    const twin = (x) => (goalReq.constraints ?? []).some((c) => c.words === x.words && c.on !== x.on && plan.roles?.[c.on] != null);   // "in the corner" is a place AND an extent: the place honoured carries the words
    // a place said by a kind the world makes that is not there yet ("3 fish in water" on an empty page): the world makes the place with the things (stand-in, questions.md Q42 (7) [LIB])
    const makesPlace = (x) => x.on === 'place' && x.code === 'value' && x.value && lib.capabilitiesOf(live, { catalog: [language] }).kinds.get(x.value)?.has('make');
    const dropped = (plan.notHonoured ?? []).filter((x) => !['one_kind', 'nothing_left'].includes(x.code) && x.words && saidText.includes(String(x.words).toLowerCase()) && !twin(x) && !makesPlace(x));
    if (dropped.length && !arrange) return { why: `plan drops ${dropped.map((x) => x.words).join(', ')}`, q: flat };
    const drawnAs = declarationsOf(live, '').drawn;
    const planned = new Set((plan.steps ?? []).filter((st) => st.item && st.args?.kind).flatMap((st) => [st.args.kind, drawnAs[st.args.kind]]));
    const above = new Set(); { const ps = typeParents(live); for (let k = plan.target ?? goalReq.target, i = 0; k && i < 6; i++, k = ps.get(k)) { budget.tick('door.lineage'); above.add(k); } }   // the target and its lineage ("a picture" planned as a pond)
    const wanted = (q.request.constraints ?? []).filter((c) => c.on === 'kind' && c.want === 'yes' && c.value && !above.has(c.value)).map((c) => c.value);
    const lost = (plan.steps ?? []).some((st) => st.item) ? wanted.filter((k) => !planned.has(k)) : [];
    if (lost.length && !arrange) return { why: `plan drops ${lost.join(', ')}`, q: flat };   // an arrangement names regions by their kinds: nothing is made
    const snap = this.snapshot();
    // ONE STEP PER REQUEST (reviewer 2026-11-15 19:05): the turn's state before the act; a revision REPLACES the step of the result it revises (its state before is that step's)
    let before = this._doorBegin();
    const replaces = base !== undefined && lastRec?.turn != null && this.discourse.actions[0]?.turn === lastRec.turn ? this.discourse.actions[0] : null;
    if (replaces) before = { ...before, ...replaces.before };
    if (base !== undefined) this.isession.state[tabWorld] = base ? structuredClone(base) : (typeof world.ops.initialState === 'function' ? world.ops.initialState() : {});
    const beforePlan = this.isession.state[tabWorld] ? structuredClone(this.isession.state[tabWorld]) : null;
    const goal = { ...goalOf(plan, { facts: goalReq.facts ?? flat.facts, target: goalReq.target ?? q.target }, { seed }), declared: declarationsOf(live, (q.corrections ?? []).reduce((t, c) => t.split(String(c.said)).join(String(c.as)), english)), placeWords: (goalReq.constraints ?? []).find((c) => c.on === 'place' && c.want !== 'no')?.words ?? null };   // the place in the user's words ("in the sky"): the world reads it as it reads a place
    let done = null;
    try { done = this._runWorldAct(tabWorld, 'planRequest', goal); } catch (e) { if (globalThis.process?.env?.PSYS2_REQUEST_DEBUG) console.error('[door] act', e); done = null; }
    if (!done || done.status !== 'supported') {   // the world cannot carry it out: it says why (its own words), it never does something else instead
      this.restore(snap);
      const note = done?.note ?? done?.value;
      if (!note) return { why: 'executor: refused', q: flat };
      const r = await this._sendCore(text, sendOpts, { english, translation, say: String(note) });
      r.trace.request = { ...flat, plan: { roles: plan.roles, refused: String(note) } };
      return { reply: r, route: `${route} refused` };
    }
    const result = measure(beforePlan);
    const record = { request: plainRequest(goalReq), flat: { ...flat, facts: goalReq.facts ?? flat.facts, target: goalReq.target ?? flat.target }, result: result ? { count: result.parts ?? 0, kinds: result.kinds ?? {}, links: result.links ?? 0 } : null, before: beforePlan, seed, previous: lastRec?.request ?? null, previousSeed: lastRec?.seed ?? null, via: 'plan' };
    let said = null, head = null;
    try { head = lib.sayRequest(goalReq, { revised: !!reaction && reaction !== 'redo', reply: rev?.reply }, { language }); } catch { head = null; }   // the revision's words first
    const shownDone = String(done.value ?? '').toLowerCase();
    const assumed = (plan.assumed ?? []).filter((a) => !(a.key === 'layout' && ['free', 'better'].includes(String(a.value))) && ![].concat(a.value ?? []).every((v) => shownDone.includes(String(v).toLowerCase().replace(/_/g, ' ')) || (a.key === 'kinds' && /\b(?:it has|the nodes are)\b/.test(shownDone))));   // what the world's own reply already says is not said again
    try { said = lib.sayRequest(goalReq, { assumed, notHonoured: [...(plan.notHonoured ?? []), ...(done.cannot ?? []).map((c) => ({ on: c.key, words: c.words, why: c.why ?? 'the knowledge has no more', code: 'world' }))], reason: plan.cannot }, { language }); } catch { said = null; }
    const parts = [];
    if (q.corrections.length) parts.push(`I read ${q.corrections.map((c) => `"${c.said}" as "${c.as}"`).join(', ')}.`);
    parts.push(reaction ? head?.text ?? '' : '', String(done.value ?? '').trim(), arrange || (done.plain && !(done.cannot ?? []).length) ? '' : said?.text ?? '');   // an arrangement (or an act that used none of the plan's assumptions) says only what it did
    if (replaces) this.discourse.actions = this.discourse.actions.filter((x) => x !== replaces);
    const sayText = parts.filter(Boolean).join(' ');
    // the parts of the reply: the world's own words (translated), the library's reply facts (composed in the user's language, spec 28 section 14)
    const factsOf = (x) => (x?.text ? factParts(lib, language, x.facts, x.text) ?? [{ text: x.text, translate: true }] : []);
    const pieces = [...(q.corrections.length ? [{ text: parts[0], translate: true }] : []), ...(reaction ? factsOf(head) : []), ...(String(done.value ?? '').trim() ? [{ text: String(done.value).trim(), translate: true }] : []), ...(arrange || (done.plain && !(done.cannot ?? []).length) ? [] : factsOf(said))];
    const joined = pieces.flatMap((p, i) => (i ? [{ text: ' ', translate: false, join: true }, p] : [p]));
    const factParts1 = joined.map((p) => p.text).join('') === sayText ? joined : null;
    const r = await this._sendCore(text, sendOpts, { english, translation, say: sayText, parts: namedParts(sayText, done.names) ?? factParts1 ?? undefined, before, frame: { world: tabWorld, text: english, act: goalReq.act ?? 'make' } });
    record.turn = this._msg;
    this.dialogue.requests.record(tabWorld, record);
    r.trace.request = { ...flat, revised: reaction ? (goalReq.facts ?? null) : null, plan: { roles: plan.roles, assumed: plan.assumed, notHonoured: plan.notHonoured, steps: plan.steps?.length ?? 0, result } };
    if (Array.isArray(r.worlds) && !r.worlds.includes(tabWorld)) r.worlds.push(tabWorld);
    if (!(r.segments ?? []).some((sg) => (sg.world ?? sg.match?.worldId) === tabWorld)) r.segments = [...(r.segments ?? []), { world: tabWorld, text: english, planned: true }];   // the world that carried out the request
    r.statuses = Array.isArray(r.statuses) && r.statuses.length ? r.statuses : ['supported'];   // the world carried the request out
    if (r.trace && !(r.trace.statuses ?? []).length) r.trace.statuses = ['supported'];
    if (Array.isArray(r.answers) && !r.answers.length) r.answers.push({ id: null, to: `op.${tabWorld}.planRequest`, kind: 'action', status: 'supported', value: done.value ?? null, text: String(done.value ?? ''), via: 'door', sentence: english });   // the act of the world, as the readers' answers record theirs
    return { reply: r, route };
  }

  /** Run a world's operation as an action of this turn (the planner of a request): the live state of the world, the matrix reasoner adopts what it changed. */
  _runWorldAct(worldId, name, args) {
    const { interp, set } = this.engine;
    const w = set.get(worldId);
    if (typeof w?.ops?.[name] !== 'function') return null;
    if (!this.isession.state[worldId]) this.isession.state[worldId] = typeof w.ops.initialState === 'function' ? w.ops.initialState() : {};
    const op = { id: `op.${worldId}.${name}`, worldId, semantics: 'action' };
    const ctx = interp._makeCtx(this.isession, op, { depth: 0, visited: 0, ops: [] }, { deadline: performance.now() + interp.opTimeoutMs * 5, detached: true });
    const r = w.ops[name](ctx, args);
    try { this.isession.rs?.adoptState(this.isession, worldId); } catch { /* the ops reasoner keeps the state as it is */ }
    return r;
  }

  async _sendFirst(text, opts = {}) {
    const tr = this.engine.translator;
    const wantedLang = opts.language ?? this.language;
    if (!tr || tr.fallbackMode?.() !== 'fallback' || wantedLang === 'en' || guard.soft()) { this._preDry = null; return this._sendCore(text, opts); }
    return this._sendByCandidates(text, opts);
  }

  /** Points of trouble of a reading of one candidate English in the active tab: 0 = the reader understands all of it (nothing unparsed, ignored or partial; every wire supported; no other world's reading). */
  async _understands(english) { return this._dryReading(english); }

  /**
   * The same, synchronous (the rules formalizer and the interpreter's resolve are synchronous): what the library's `clauses` and `chooseRewrite` call as `read`.
   * CLASS G: the readings of one turn's pre-turn state are kept in `_preDry` (a Map the turn opens in `_send`; the candidates of the translation and the intent step
   * read the same English on the same state, so each is read once). `unfilled` counts the required keys a reading leaves open (status `missing`).
   */
  _dryReading(english) {
    const memo = this._preDry;
    if (memo?.has(english)) { perf.count('understands.memo'); return memo.get(english); }
    const r = perf.timeSync('understands', () => this._understandsRun(english));
    memo?.set(english, r);
    return r;
  }

  _understandsRun(english) {
    const { set, formalizers, interp } = this.engine;
    const f = this.forkForValidation();
    const ctx = f.context();
    const res = formalizers.rules.formalize(splitAnswerList(interp.lang.stripFiller(english) || english), { worlds: set, session: f.isession, source: 'candidate', context: ctx, router: this._router });
    const segs = res.segments ?? [];
    if (!segs.length) return { issues: 9, unfilled: 0 };
    const HOME = /^(ui|session|user|meta|common|lang|core)\b|^talk$/;
    let issues = 0, unfilled = 0;
    for (const sg of segs) {
      budget.tick('index.understands');
      issues += (sg.unparsed ? 3 : 0) + (sg.ignored?.length ?? 0) + (sg.partial ? 2 : 0) + (sg.bestEffort ? 2 : 0);
      const w = sg.match?.worldId;
      if (w && ctx.tabWorld && w !== ctx.tabWorld && !HOME.test(w)) issues += 2;   // a reading in another world than the open tab is not an understanding in it
      if (sg.unparsed) continue;
      f.isession.add(sg.wires);
      for (const wire of sg.wires) { const r = interp.resolve(f.isession, wire); if (r?.status && r.status !== 'supported') { issues += r.status === 'unsupported' || r.status === 'error' ? 2 : 1; if (r.status === 'missing') unfilled++; } }
    }
    return { issues, unfilled };
  }

  /**
   * M4 (WORLDS-AS-MODULES), input side, all languages: the English comes from the candidates of every available translator plus one after source-side spelling repair;
   * a candidate that keeps a source word is rejected; among the rest the reader's dry reading in the active tab picks the one it understands completely (ties: the
   * browser Translator first). All candidates are kept in `trace.candidates` (phrase export). The step budget bounds the loop; nothing here is per language.
   */
  async _sendByCandidates(text, opts) {
    const tr = this.engine.translator, lang = opts.language ?? this.language;
    const { set } = this.engine;
    const vocab = spellVocabulary(set);
    const isEnglish = englishTest((w) => FUNCTION_WORDS.has(w) || vocab.has(w) || !!vocab.nouns?.has(w) || !!tr.rules?.knownEnglish?.(w));
    // names kept as they are (spec 05 "Keep-list"): the things of the open tab's world and the names told in the session are never source words left over nor non-words
    const fold = (w) => String(w).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const kept = new Set([...worldThingNames(this), ...sessionNames(this)].flatMap((n) => fold(n).split(/[\s_]+/)).filter((w) => w.length >= 3));
    // a word no dictionary of the language has, with no word of the language near it ("tenerife"; "desenaza" is a typo of desenează, not a name), is a name: a candidate that keeps it is not rejected for it
    const srcVocab = tr.rules?.sourceVocabulary?.(lang);
    const isName = tr.rules?.glossWord ? (w) => !nearAny(w, srcVocab) && !(tr.rules.glossWord(w, lang) ?? []).length && !(tr.rules.knownEnglish?.(fold(w))) : null;
    const cands = await perf.time('candidates.gather', () => gatherCandidates(text, { from: lang, to: 'en', machine: machineReads(lang, this.engine.machineReading), translator: tr, abortable: (p, stage) => guard.abortable(p, stage), isEnglish, kept }));
    if (!cands.length) { this._preDry = null; return this._sendCore(text, opts); }   // nothing translated it: the core says so (MT-SERIOUS)
    const pick = await perf.time('candidates.choose', () => chooseCandidate(cands, text, { understand: (e) => this._understands(e), isEnglish, soft: () => guard.soft(), kept, isName }));
    this._preDry = null;   // the turn now runs: the state is no longer the pre-turn one
    if (!pick.chosen) return this._sendCore(text, opts);
    const c = pick.chosen, machine = c.source === 'browser' || c.source === 'model' || /^(?:repaired|glossed)-(browser|model)$/.test(c.source);
    const r = await this._sendCore(text, opts, { english: c.text, translation: c.translation });
    r.trace.candidates = pick.log;
    r.trace.via = machine ? 'translator-in' : 'rules-translate';
    tr.note?.(machine ? 'translator-in' : 'rules-translate', { direction: `${lang}->en`, strategy: machine ? 'browser-api' : 'rules', reason: `candidate ${c.source} chosen among ${cands.length}` });
    return r;
  }

  async _sendCore(text, { language, formalizer, spell, partial, fastPath, bestEffort, mode, nx, worldAware, correction } = {}, override = null) {
    const { engine } = this;
    if (engine.sopworld === undefined) engine.sopworld = await import('../vendor/sopworld/sopworld.mjs').catch(() => null);   // the dialogue focus lives on its std.focus / std.fill
    if (!globalThis[Symbol.for('psys2.textgen')]) installTextGen(engine.sopworld, null);   // std.summarize / std.compose for docs.editor (spec 26); unavailable until the library ships them
    this.dialogue._kind = null; this.dialogue.note = null; this.isession.dialogueFocus = (w) => this.dialogue.focusWords(w); this.isession.sessionFacts = () => this.dialogue.facts();
    this._voice = mode === 'voice';   // spoken input: stutter and send words are cleaned, garbled words repaired against the active tab's world (voice.mjs)
    { const v = cleanVoice(text, { voice: this._voice }); if (v.corrections.length && v.text.trim()) text = v.text; }
    const { set, interp, translator } = engine;
    const sid = `msg${++this._msg}`;
    this._wa = normalizeWorldAware(worldAware ?? this.worldAware);
    this._turnModelTimeouts = [];
    this._beNow = bestEffort ?? this.bestEffort;
    const wanted = language ?? this.language;
    let lang = 'en', translation = null, english = text;
    if (translator) {
      lang = wanted === 'auto' ? langOf(await perf.time('detect', () => guard.abortable(translator.detectLanguage(text), 'detect'))) : (wanted && wanted !== 'unknown' ? wanted : 'en');
      // LANG-FIXED: an explicit language ('en' or 'ro', what the webchat always passes) is the language of every message: no detection, no override by evidence,
      // no switch of the host's selector. English words in a Romanian message (names, "ok", "stop") go through the Romanian pipeline. Only the CLI/server mode
      // 'auto' detects: RD5 there: the language comes from strong evidence. English with a typo ("eys express fear") is never read as Romanian, and a weak
      // Romanian reading (a browser guess, one ambiguous word) switches an automatic session only when it repeats.
      if (wanted === 'auto') {
        const ev = typeof translator.evidence === 'function' ? await guard.abortable(translator.evidence(text), 'detect') : null;
        if (ev?.strongEn && lang !== 'en') { lang = 'en'; this._sessionLang = 'en'; this._weakRo = 0; }
        else if (lang === 'ro' && ev && !ev.strongRo && this._sessionLang !== 'ro') {   // a short or ambiguous input ("e", "ok") keeps the language of the session (default English)
          this._weakRo = (this._weakRo ?? 0) + 1;
          lang = this._weakRo >= 2 ? 'ro' : (this._sessionLang ?? 'en');
          if (lang === 'ro') { this._sessionLang = 'ro'; this._weakRo = 0; }
        } else if (lang === 'unknown') lang = this._sessionLang ?? 'en';
        else { this._sessionLang = lang; this._weakRo = 0; }
      }
      if (lang !== 'en' && lang !== 'unknown') {
        const heard = lang === 'ro' ? soundAlikes(text, this.context().tabWorld) : text;
        const fbMode = translator.fallbackMode?.() === 'fallback';   // M4: `_send` chose the English among the candidates (`override`); without one the language pack's rules translate (translators off, soft limit, nothing translated)
        translation = override?.translation ?? await perf.time('translate', () => guard.abortable((fbMode ? translator.rules ?? translator : translator).translate(heard, { from: lang, to: 'en' }), 'translate'));
        english = override?.english ?? textOf(translation) ?? text;
        // a machine translator that returns the source text unchanged translated nothing: the language pack's rules translator is asked once (RP5)
        if (!override && translator.rules && translator.rules !== translator && english.trim().toLowerCase() === String(heard).trim().toLowerCase()) {
          const again = await perf.time('translate', () => guard.abortable(translator.rules.translate(heard, { from: lang, to: 'en' }), 'translate'));
          if (textOf(again)?.trim()) { translation = again; english = textOf(again); }
        }
        // INVARIANT (every turn gets a reply): a translator that cannot map a sentence ("negation could not be mapped") returns an empty text; the message then stays as typed, so that the reading is poor and says so (or the browser Translator is asked)
        if (!english.trim() && text.trim()) { english = text; translation = { ...(translation ?? {}), text, alignment: [], unknown: [], notes: [...(translation?.notes ?? []), 'the rules translation was empty'], confidence: 0 }; }
      } else lang = 'en';
    }
    if (override?.english && lang === 'en') english = override.english;   // the intent step's reading of an English message
    this._waLang = lang;   // world-aware reading (spec 16): the words a Romanian message leaves out are the translator's, not the reading's
    // LANG-FIXED: an explicit "switch the language" command is read as such in either language, whatever language is selected ("treci pe engleză" while English is selected)
    { const switchTo = languageCommand(text); if (switchTo) english = switchTo; }
    this.sources.set(sid, { original: text, english, lang, alignment: translation?.alignment });
    // Correction phase (spec 03 section 1c, review G2): "knight to f3, no, knight to c3" is resolved on the whole message, before the
    // modal interceptors, discourse, segmentation and routing, so the abandoned variant never has an effect.
    english = splitAnswerList(engine.interp.lang.stripFiller(english) || english);   // "lol ok and ...", "uhh and a pig?": leading hesitation never reaches a world
    const selfCorrections = await perf.time('correct', () => this._correct(english));
    if (selfCorrections.corrections.length) english = selfCorrections.text;

    // the door carried its act out before this call (spec 28 section 10): the state before the turn and the library's mark are the ones it took before it acted (one undo step)
    const stateBefore = override?.before ?? Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.form.turn = this._msg;   // the ids made while this turn is read say which turn made them (spec 15, "Namespaces")
    this.isession.form.forgetUnheld((id) => this.isession.memory.get(id)?.type === 'core.agent');   // an agent is known to the reader only while the session holds its wire (Q23: a lost trial reading never hides an introduction)
    if (!override?.before) this.isession.rs?.beginTurn(this._msg);   // the library as it is now is what this turn can be taken back to (spec 15)
    this.isession.effects = [];
    const disc = this.discourse;
    const tabBefore = this.isession.state['ui.shell']?.activeTab;
    const pend = disc.takePending();   // an expectation lives for one turn (spec 11)
    const icpt = interp.intercept(this.isession, english);   // modal input (spec 07 section 2)
    let pre = null;   // discourse resolution (spec 11): the reply fills a pending argument, or a fragment is an ellipsis of an earlier frame
    let meta = override?.run ? await override.run(english, { pend, sid }) : override?.say ? { reply: override.say, status: 'supported', info: override.info ?? { kind: 'intent', dialogue: 'about-you' }, ...(override.parts ? { parts: override.parts } : {}) } : null;  // meta-dialogue (spec 11 sections 6-14): cancel, repeat, explain, feedback, topic, list mode, repair, degree, references
    let formalText = english;
    // THE PERSON OF THE SESSION (Q19, spec 23): a statement or a question about the user read by the catalog's person frames, or the interview, is kept as w.person facts before any world reads it
    let personSeg = null;
    if (!icpt && !meta) {
      let pt = null;
      try { pt = await perf.time('person', () => personTurn(this, english)); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; pt = null; }
      if (pt) { meta = { reply: pt.reply, status: pt.status, info: pt.info, ...(pt.say ? { parts: [{ text: pt.reply, translate: true, say: pt.say }] } : {}) }; personSeg = pt.segment; }
    }
    if (!icpt && !meta) {
      // M1: the kind of the turn is read BEFORE any tab world: a fragment is completed from the focus, a complaint or a why-question is answered from the trace, a correction amends the last request
      meta = await perf.time('dialogue', () => this.dialogue.turn(english, { pend, sid, correction })) ?? await perf.time('discourse', () => disc.meta(english, pend, sid));
      if (meta?.rewrite) formalText = meta.rewrite;
      if (meta?.pre) pre = meta.pre;
      if (!pre && !meta) {
        if (pend?.type === 'fill') pre = await disc.fill(pend, english, sid);
        if (!pre) pre = await perf.time('discourse', () => disc.ellipsis(english, sid));
        if (!pre) pre = await disc.pronoun(english, sid);
        // M1: what the frames of the discourse layer could not complete (no verb of its own, a list) is completed from the dialogue focus; the tab gets a complete request or nothing
        if (!pre) { const c = await perf.time('dialogue', () => this.dialogue.complete(english, sid)); if (c?.pre) { pre = c.pre; meta = null; } else if (c?.rewrite) formalText = c.rewrite; }
        // "and how many days are in a week?" with nothing to continue: the connective joins nothing, the question stands on its own
        // "and a heading Dairy too": a fragment nothing could continue loses its trailing "too" (it must not become part of the text)
        if (!pre && english !== engine.interp.lang.stripConnective(english)) formalText = engine.interp.lang.stripTrailing(english);
        if (!pre) { const bare = engine.interp.lang.stripConnective(english); if (bare !== english && QUESTION_WORD.test(bare)) formalText = bare; }
      }
    }
    // SCENE-NATURAL P3: an unknown noun that names a thing of the scene (or of the open tab) with a slip is read as that thing before any dictionary repair
    let sceneFix = null;
    if (!icpt && !pre && meta?.reply == null) {
      try {
        sceneFix = repairFromScene(this, formalText);
        if (sceneFix) {   // a message the rules read completely and a world can carry out as it is needs no repair (a word of a text the user dictates is not a thing of the scene)
          const probe = await this.engine.formalizers.rules.formalize(formalText, { worlds: set, session: this.isession, source: 'probe', context: this.context(), router: this._router });
          if (probe.segments.length && probe.segments.every((x) => !x.unparsed && !x.ignored?.length && !x.partial) && this._dryStatuses(probe.segments).every((x) => x === 'supported')) sceneFix = null;
        }
      } catch { sceneFix = null; }
      if (sceneFix) formalText = sceneFix.text;
    }
    let formal = icpt || meta?.reply != null ? { segments: [], wires: [] } : pre ? { ...pre.res, dispatch: null } : await perf.time('formalize', () => this._formalize(formalText, sid, formalizer ?? this.formalizer, { spell: spell ?? this.spell, partial: partial ?? this.partial, fastPath: fastPath ?? this.fastPath, nx: nx ?? this.nx }));
    if (meta?.rewrite && !pre) for (const sg of formal.segments) sg.discourse = meta.info;
    if (sceneFix) { const sg = formal.segments.find((x) => !x.unparsed); if (sg) sg.corrections = [...(sg.corrections ?? []), ...sceneFix.corrections]; }
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      pre = await disc.ellipsis(english, sid, { bare: true });
      if (pre) formal = { ...pre.res, dispatch: null };
    }
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      // "open the music tab instead": a trailing softener the command does not need
      const bare = engine.interp.lang.stripTrailing(formalText);
      if (bare && bare !== formalText) { const f2 = await this._formalize(bare, sid, formalizer ?? this.formalizer, { spell: spell ?? this.spell, partial: partial ?? this.partial }); if (f2.segments.length && f2.segments.every((x) => !x.unparsed)) formal = f2; }
    }
    if (!icpt && !pre && !meta && (bestEffort ?? this.bestEffort) && formal.segments.length === 1 && formal.segments[0].unparsed) {   // one unparsed clause: a fragment of a longer message is never guessed
      formal = await this._withBestEffort(formal, { worlds: set, session: this.isession, source: sid, context: this.context(), router: this._router });
    }
    if (!icpt && !pre && !meta && anyVoiceOn() && formal.segments.some((x) => x.unparsed || isIncomplete(x))) { try { formal = await perf.time('variants', () => withVariants(this, formal, { worlds: set, session: this.isession, source: sid, context: this.context(), router: this._router })); } catch (e) { if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e; } }   // spec 16 section 10: an unparsed clause read again (alternations, near words, slot types), the world deciding
    if (!icpt && !pre && !meta && formal.segments.length) formal = await perf.time('typed', async () => this._withTypedReader(formal));   // spec 16 section 9: a refused reading is read again by the types of its words
    // spec 17: a knowledge question ("what is a comet?") whose thing the reading leaves out is answered from the catalog by the conversation; the frame decided, the hit only loads
    if (!icpt && !pre && !meta && this.engine.knowledge && formal.segments.length) {
      let ka = null; try { ka = await perf.time('knowledge', () => knowledgeAnswer(this, english, formal)); } catch { /* no knowledge is no change */ }
      if (ka) { meta = { reply: ka.reply, status: ka.status, info: ka.info }; formal = { segments: [], wires: [] }; }
    }
    const { wires, dispatch, encoderError } = formal;
    const waMode = normalizeWorldAware(worldAware ?? this.worldAware);
    let segments = !icpt && !pre && !meta && waMode !== 'off' ? await reviewSegments(this, formal.segments, { mode: waMode, english }) : formal.segments;   // spec 16: the readings are judged against the world instances before anything is executed
    if (!icpt && !pre && !meta && segments.length) segments = reviewForeign(this, segments, { english: formalText });   // spec 16 section 14: a world other than the open tab's acts only on a full reading; a first-person statement is not a command
    if (this.engine.knowledge && segments.length) { try { await perf.time('knowledge', () => preloadThings(this, segments)); } catch { /* no knowledge is no change */ } }   // spec 17: the open slots of the readings, looked up before the operations run
    this._noteWorlds(segments);
    const tInterp = perf.active ? performance.now() : 0;
    const T = (text, extra = {}) => ({ text, translate: true, ...extra });
    const lines = icpt?.reply ? [[T(icpt.reply)]] : [];   // each line is an array of parts [{ text, translate, quote? }]
    if (meta?.reply != null) lines.push(meta.parts ?? [T(meta.reply)]);
    else if (meta?.prefix) lines.push([T(meta.prefix)]);
    const answers = [];
    const statuses = icpt || meta?.reply != null ? [meta?.status ?? 'supported'] : [];
    const ops = [];
    const answerWires = [];
    let followSeg = null;
    let followTab = null;   // tab of the last world that gave a supported answer (tab follow, spec 07 section 6)
    const fillerOnly = (t) => { const w = t.toLowerCase().match(/[\p{L}']+/gu) ?? []; return w.length > 0 && w.every((x) => FUNCTION_WORDS.has(x)); };
    let segNo = 0;
    this.isession.noTabFollow = false;
    // INVARIANT (nothing destructive on a partly understood sentence): when a clause of the message is not understood, a clause that would remove, clear or replace something does not run;
    // the reply names the understood part and what was not understood. Decided from the wires' action names (clearAll, remove, delete, reset ...), for every world alike.
    const heldDestructive = new Set();
    if (!icpt && !pre && !meta) {
      const open = segments.filter((x) => (x.unparsed && !fillerOnly(x.text) && !x.veto?.say) || isIncomplete(x));   // a clause read only in part is half-read too (spec 16 section 12)
      if (open.length) for (const x of segments) if (!x.unparsed && !open.includes(x) && (isDestructive(x) || x.ignored?.length || x.partial || x.bestEffort)) heldDestructive.add(x);   // a clause read only in part (words ignored) next to one not read at all is held too: "You should change this voila ... ta-da ..." must not start a chess game
    }
    for (const seg of segments) {
      // COMPLETENESS (spec 16 section 12): a reading that leaves content words unread is not final. No voice completed it: a destructive one is never executed, and with PSYS2_COMPLETE=ask none is; the person is asked
      if (isIncomplete(seg) && (completeMode() === 'ask' || isDestructive(seg) || seg.match?.catchAll)) {   // a catch-all reading (raw leftover arguments only) is a last resort: half-read, it is not executed
        const unread = [...new Set(seg.match.unread)];
        lines.push([T('I understood only part of '), { text: `"${seg.text}"`, translate: false, quote: true }, T(': I did not use '), ...unread.flatMap((w, k) => [...(k ? [T(' and ')] : []), { text: `"${w}"`, translate: false, quote: true }]), T(', so I did not do it. What did you mean?')]);
        statuses.push('missing');
        continue;
      }
      if (heldDestructive.has(seg)) {
        const open = segments.find((x) => (x.unparsed && !fillerOnly(x.text)) || isIncomplete(x));
        const q = (t) => lang === 'en' ? t : originalSentence(text, { text: t, span: segments.find((y) => y.text === t)?.span }, translation?.alignment);
        lines.push([T('I understood '), { text: `"${q(seg.text)}"`, translate: false, quote: true }, T(' but I did not do it, because I did not understand '), { text: `"${q(open.text)}"`, translate: false, quote: true }, T('. Say the first part on its own and I will do it.')]);
        statuses.push('missing');
        continue;
      }
      // a leftover made only of filler words ("also", "and", "please") next to something that was understood is not worth an error
      if (seg.unparsed && (partial ?? this.partial) && fillerOnly(seg.text) && segments.some((x) => !x.unparsed)) continue;
      if (seg.bestEffort) {
        const line = [T('I took that as: '), { text: `"${seg.bestEffort.took}"`, translate: false, quote: true, reading: true }];
        if (seg.bestEffort.ignored?.length) { line.push(T(' (I did not use ')); seg.bestEffort.ignored.forEach((x, k) => { if (k) line.push(T(' and ')); line.push({ text: `"${x}"`, translate: false, quote: true }); }); line.push(T(')')); }
        lines.push(line);
      }
      if (seg.unparsed && seg.veto?.say) {   // spec 16: the world has no such thing: say what it has, or offer to add it
        lines.push([T(seg.veto.say)]);
        statuses.push(seg.veto.status ?? 'missing');
        if (seg.veto.offer) disc.pending = { type: 'offer', accept: 'rewrite', rewrite: seg.veto.offer.rewrite, world: seg.veto.offer.world, expected: 'yes/no', question: seg.veto.offer.question, turn: this._msg };
        continue;
      }
      // a specific explanation ("I do not speak klingon") comes before the world's graded fallback
      const waSay = seg.unparsed && !(seg.foreign?.guessed && seg.suggestions?.length) && waMode !== 'off' && waMode !== 'observe' ? explainUnparsed(this, seg.text) : null;   // a guessed respelling offered as "Did you mean" (spec 16 section 14 rule 4) is asked first
      if (waSay) { lines.push([T(waSay)]); statuses.push('unsupported'); continue; }
      // honest scope: the world of the open tab may refuse a message it cannot talk about, in its own words, with the nearest things it can (hook `outOfScope`, the Talk tab)
      if (seg.unparsed) {
        const cx = this.context(), tw = cx.tabWorld ?? cx.lastWorld;   // no tab open: the world last used says what it can do
        const oos = tw && !(seg.foreign?.guessed && seg.suggestions?.length) ? this.engine.interp.hook(this.isession, tw, 'outOfScope', { text: seg.text }) : undefined;
        if (typeof oos?.say === 'string' && oos.say) {
          if (set.get('ui.help')) (this.isession.state['ui.help'] ??= {}).lastUnparsed = { text: seg.text, world: tw, suggestions: oos.suggest ?? [] };   // the help still knows what was not understood ("why not?")
          lines.push([T(oos.say)]);
          if (oos.suggest?.length) this.isession.effects.push({ name: 'chat.suggest', args: { items: oos.suggest }, world: tw });
          statuses.push('unsupported');
          continue;
        }
      }
      if (seg.unparsed) {
        // examples from the world of the open tab first: the router's word-overlap guess can point anywhere
        const routed = seg.worlds.map((w) => w.id), here = Object.entries(this.focus()).find(([, n]) => n >= 3)?.[0];
        let ex = examplesFor(set, here ? [here, ...routed.filter((w) => w !== here)] : routed);
        // ui.help: "Did you mean ...?" (closest examples of all worlds) and a note of what failed for "why not?"
        const helpW = set.get('ui.help');
        const dym = [...(helpW?.ops?.didYouMean?.({ text: seg.text, worlds: set.list(), tabWorld: here, recentWorlds: this._recentWorlds ?? [] }) ?? [])];
        if (helpW) (this.isession.state['ui.help'] ??= {}).lastUnparsed = { text: seg.text, world: here ?? routed[0] ?? null, suggestions: dym };
        if (seg.suggestions?.length) dym.splice(0, dym.length, ...seg.suggestions);   // best effort: the two best readings of the loose words
        if (dym.length) { ex = dym; this.isession.effects.push({ name: 'chat.suggest', args: { items: dym }, world: 'ui.help' }); }
        // the user's own words are quoted verbatim and never back-translated
        const quoted = lang === 'en' ? seg.text : originalSentence(text, seg, translation?.alignment);
        const line = [T('I did not understand '), { text: `"${quoted}"`, translate: false, quote: true }, { text: '.', translate: false }];
        const exEn = ex;
        let exShown = ex;
        if (lang !== 'en' && translator) {
          // every example is a simple English sentence: translate each one separately; all or none (a half translated list would mix the languages)
          const done = [];
          for (const e of ex) {
            try {
              const r = await guard.abortable((translator.fallbackMode?.() === 'fallback' ? translator.rules ?? translator : translator).translate(e, { from: 'en', to: lang }), 'translate');
              if (textOf(r) && !r.unknown?.length && !r.untranslatable?.length && !(translator.leftovers?.(textOf(r), lang) ?? []).length) done.push(textOf(r).trim());
            } catch { /* this example stays untranslated */ }
          }
          // no machine translator to try them later (not the app's fallback chain): examples the rules cannot translate are left out, so that the not-understood line itself
          // is shown in the user's language instead of the whole reply reverting to English (RD5: a reply is fully translated or English)
          exShown = done.length === ex.length ? done : translator.fallbackMode?.() === 'fallback' ? ex : [];
        }
        if (exShown.length) {
          line.push(dym.length ? T(' Did you mean ', { fallback: ' You can say: ' }) : T(' For example: ', { fallback: ' You can say: ' }));
          exShown.forEach((e, k) => {
            if (k) line.push(T(' or '));
            line.push({ text: `"${e}"`, translate: false, quote: true, example: true, en: `"${exEn[k]}"`, ...(lang !== 'en' && translator && exShown === exEn ? { incomplete: true } : {}) });
          });
          if (dym.length) line.push({ text: '?', translate: false });
        }
        lines.push(line);
        statuses.push('unparsed');
        continue;
      }
      // a world with a lazily loaded engine (ops `prepare()`, async, idempotent: spec 04) is made ready before its operations run
      { const prep = this.engine.set.get(seg.match?.worldId)?.ops?.prepare; if (typeof prep === 'function') { try { await prep(); } catch { /* the operation then says it is not ready */ } } }
      { const rs = this.isession.rs; if (rs && segments.length > 1) rs.beginStep(seg.text, rs.snapOwn(this.isession), lang === 'en' ? seg.text : originalSentence(text, seg, translation?.alignment)); }   // one step per request of the message: "undo" takes back the last one (spec 15, UNDO-REDO)
      this.isession.noTabFollow = !!(seg.corrections?.length || seg.ignored?.length || seg.bestEffort || seg.partial || segments.some((x) => x.unparsed)) && !this._worldsNamedIn(english).has(seg.match?.worldId);   // invariant (c): a loose reading (a spelling guess, ignored words, or a clause of the message that nobody read) never changes the tab; only a named world does
      this.isession.add(seg.wires);
      this.isession.batch = { index: segNo++, count: segments.length };   // ops see their place in the message (a game's host cannot answer between two commands of one message)
      const statements = [];
      for (const w of seg.wires) {
        const r = interp.resolve(this.isession, w);
        if (!r) { statements.push(w); continue; }
        const rendered = interp.render(this.isession, r);
        // RD9: a loose word that reads as "open this tab" ("robot" in "square eyes robot pls") must not add "You are already on the Talk tab." to the real answer
        const idleTab = seg.match?.worldId === 'ui.shell' && /\.bare/.test(seg.match.patternId ?? '') && /^You are already on the .+ tab\.$/.test(rendered) && segments.some((x) => x !== seg && !x.unparsed && x.match?.worldId && x.match.worldId !== 'ui.shell');
        if (!idleTab) { const say = sayOf(r.envelope, rendered); lines.push([T(rendered, say ? { say } : {})]); }
        statuses.push(r.status);
        if (r.status === 'supported') { const wid = seg.match?.worldId; const t = tabOfWorld(set, wid); if (wid === 'ui.shell') followTab = null; else if (t) { followTab = t; followSeg = seg; } }   // an explicit navigation later in the message wins over the tab of an earlier segment
        ops.push(...r.ops);
        disc.noteTurn(seg, rendered, this._msg);
        if (r.status === 'supported') { const fr = disc.recordFrame(seg, this._msg); if (fr) { fr.reply = rendered; fr.value = r.envelope?.value ?? null; fr.opId = r.ops[0]?.op ?? null; if (r.envelope?.from?.length) fr.from = r.envelope.from; else if (r.envelope?.fromLater) fr.fromLater = r.envelope.fromLater; } }
        else if (r.status === 'missing' && r.envelope?.pending) disc.openFill(seg, r.envelope, rendered, this._msg);
        answerWires.push(r.answer);
        answers.push({
          id: r.answer.id, to: w.id, kind: r.kind, status: r.status, value: r.envelope.value, values: r.envelope.values,
          text: rendered, via: r.envelope.via, envelope: r.envelope, sentence: seg.text,
        });
      }
      const facts = statements.filter((w) => !w.type.startsWith('core.'));
      if (facts.length) {
        // a statement that cannot be true next to what is already known ("Tom has 3 apples" then "Tom ate 5") is said to the user and taken back (ops
        // reasoner; the matrix keeps it and flags it, spec 15): the world's `checkStatement` hook names the problem
        const rsWhy = this.isession.rs?.refuseFacts(facts, this.isession);
        const bad = this.isession.rs ? (rsWhy ? (rsWhy.plain ? rsWhy.text : `That does not add up. ${rsWhy}`) : null) : this._refuseFacts(seg.match?.worldId, facts);
        if (bad) { lines.push([T(bad)]); statuses.push('conflicting'); }
        else {
          const ex = this.isession.rs?.ackExtras(facts);   // matrix reasoner: a default the library filled is told with the acknowledgement
          lines.push([T(interp.renderAck(this.isession, ex?.facts ?? facts) + (ex?.assumed ? ' ' + ex.assumed : ''))]);
        }
        if (!bad) disc.noteFacts(facts, this._msg, seg.text, seg.match?.worldId);
      }
      if (seg.alternatives.length) {
        const titles = seg.alternatives.map((a) => set.get(a.worldId)?.title ?? a.worldId);
        const used = set.get(seg.match.worldId)?.title ?? seg.match.worldId;
        lines.push([T(`This could also be read in another way (${titles.join(', ')}); I used the `), { text: `"${used}"`, translate: false, quote: true }, T(' reading.')]);
      }
    }
    if (this.engine.knowledge && !icpt && !pre && !meta) {   // spec 17: a frame the reading took whole, whose world answered "missing": the catalog is asked before the "I don't know" stands
      try { const kf = await perf.time('knowledge', () => knowledgeFallback(this, english, segments, statuses)); if (kf) { lines.length = 0; lines.push([T(kf.reply)]); statuses[0] = kf.status; segments[0].ignored = []; segments[0].knowledge = kf.info; } } catch { /* the world's own reply stands */ }
    }
    this.isession.batch = null;
    this.isession.noTabFollow = false;
    for (const seg of segments) {
      if (!seg.corrections?.length || seg.unparsed) continue;
      const line = [T('(I read ')];
      seg.corrections.forEach((c, k) => {
        if (k) line.push(T(k === seg.corrections.length - 1 ? ' and ' : ', '));
        line.push({ text: `"${c.from.toLowerCase()}"`, translate: false, quote: true }, T(' as '), { text: `"${c.to}"`, translate: false, quote: true });
      });
      line.push(T(')'));
      lines.push(line);
    }
    for (const seg of segments) {
      if (!seg.ignored?.length || seg.unparsed) continue;
      const line = [T('I understood only part of that: I did not use ')];
      seg.ignored.forEach((x, k) => { if (k) line.push(T(' and ')); line.push({ text: `"${x}"`, translate: false, quote: true }); });
      line.push({ text: '.', translate: false });
      lines.push(line);
    }
    // Tab follow: a world with a tab answered, but its tab is hidden: bring it forward (the existing ui.openTab action).
    const shown = this.isession.state['ui.shell']?.activeTab;
    // INVARIANT (no tab change without a named tab): a reading that needed a spelling correction, ignored words or a best effort does not bring its world's tab forward unless the message names that world
    if (followTab && followSeg && (followSeg.corrections?.length || followSeg.ignored?.length || followSeg.bestEffort || followSeg.partial || segments.some((x) => x.unparsed)) && !this._worldsNamedIn(english).has(followSeg.match?.worldId)) followTab = null;
    if (followTab && shown && shown !== followTab && !this.isession.effects.some((e) => e.name === 'ui.openTab')) {
      try { interp.runAction(this.isession, 'ui.openTab', { tab: followTab }); } catch { /* the shell may be absent */ }
    }
    // A word some reading used (a world-aware veto names it: "I can't find ... “părul”") was known to a reading: never say it was not known.
    const usedBy = (w) => segments.some((s) => s.veto && `${s.veto.why ?? ''} ${s.veto.say ?? ''}`.toLowerCase().includes(String(w).toLowerCase()));
    const unknownWords = (translation?.unknown ?? []).filter((u) => !usedBy(u.word));
    if (unknownWords.length && segments.some((s) => s.unparsed)) {
      lines.push([T(`I did not know the word${unknownWords.length > 1 ? 's' : ''}: `), { text: unknownWords.map((u) => u.word).join(', '), translate: false, quote: true }, { text: '.', translate: false }]);
    }
    if (tInterp) perf.add('interpret', performance.now() - tInterp);
    // HONEST REPLIES (class C): a line that only claims success while no world's content changed says that nothing changed
    if (lines.some((ln) => ln.length === 1 && BARE_DONE.test(ln[0].text ?? '')) && !this.isession.effects.some((e) => e.name !== 'chat.suggest') && !contentChanged(stateBefore, this.isession.state)) {
      for (let i = 0; i < lines.length; i++) if (lines[i].length === 1 && BARE_DONE.test(lines[i][0].text ?? '')) lines[i] = [T(NOTHING_CHANGED)];
    }
    // CLASS F: the replies of a turn of several clauses that say the same act of different things are one sentence ("Moved work done up. Moved problems up." ->
    // "Moved work done and problems up.", composed as one in another language: "Am mutat „work done” și „problems” în sus.")
    for (let i = 0; i + 1 < lines.length; i++) {
      budget.tick('index.joinReplies');
      const a = lines[i], b = lines[i + 1];
      const sa = a.length === 1 ? a[0].say : null, sb = b.length === 1 ? b[0].say : null;
      const na = sa?.roles?.things?.names, nb = sb?.roles?.things?.names;
      if (!Array.isArray(na) || !Array.isArray(nb) || sa.act !== sb.act || na.length + nb.length > 5) continue;
      const rest = (s) => JSON.stringify({ ...s.roles, things: undefined });
      if (rest(sa) !== rest(sb)) continue;
      const names = [...na, ...nb];
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
      const at = a[0].text.indexOf(na.length > 1 ? `${na.slice(0, -1).join(', ')} and ${na.at(-1)}` : na[0]);
      if (at < 0) continue;
      const old = na.length > 1 ? `${na.slice(0, -1).join(', ')} and ${na.at(-1)}` : na[0];
      lines.splice(i, 2, [{ ...a[0], text: a[0].text.slice(0, at) + list + a[0].text.slice(at + old.length), say: { ...sa, roles: { ...sa.roles, things: { ...sa.roles.things, names } } } }]);
      i--;
    }
    // THE INTENT STEP: what was assumed is said first ("I took "make it nicer" as: improve the diagram."), in the user's language through the translator
    if (override?.assumed?.length) lines.unshift([T(`I took that as: ${override.assumed.map((a) => a.as).join('; ')}.`), ...(override.left?.length ? [T(' I left out '), { text: override.left.map((x) => `"${x}"`).join(', '), translate: false, quote: true }, T(': I could not read it.')] : [])]);
    let englishParts = [];
    lines.forEach((ln, i) => { if (i) englishParts.push({ text: ' ', translate: true, join: true }); englishParts.push(...ln); });
    const englishReply = englishParts.map((p) => p.text).join('');
    let parts = englishParts.map(({ join, fallback, say: _say, ...p }) => (join ? { text: p.text, translate: false } : p));
    let reply = englishReply;
    let replyRoutes = [];
    if (lang !== 'en' && translator) {
      try {
        parts = await translateParts(englishParts, translator, lang, userWordMap(text, english, translation?.alignment));
        reply = parts.map((p) => p.text).join('');
        replyRoutes = parts.routes ?? [];
        for (const via of replyRoutes) translator.note?.(via, { direction: 'en->ro', strategy: via === 'translator-out' ? 'browser-api' : 'rules' });
      } catch { parts = englishParts.map(({ join, fallback, say: _say, ...p }) => p); reply = englishReply; }
    }
    disc.noteShown(this._msg, reply);
    if (icpt?.reply) { disc.icptTurn = { turn: this._msg, text: english, reply: icpt.reply, world: icpt.worldId }; disc.noteWorld(icpt.worldId, english, icpt.reply, this._msg); }
    if (!disc.pending) disc.openConfirm(englishReply, this._msg);
    this.isession.rs?.adoptState(this.isession);   // whatever else changed the state of a world with `adopt` in this turn (another world's request) is taken over before the turn is kept
    { const fr = override?.frame ?? meta?.frame; if (fr) disc.recordDoorFrame({ ...fr, turn: this._msg, reply: englishReply }); }   // the door's act is a frame of this turn, as a reader's request is
    this.isession.rs?.commitTurn(this._msg, english);   // a turn that changed the library keeps its mark: what "undo that" and the undo of the dialogue layer rewind to (spec 15)
    disc.commitTurn({ turn: this._msg, text: english, before: stateBefore, kind: ['undo', 'redo'].includes(meta?.info?.kind) ? 'keep' : segments.some((x) => /undo/i.test(x.match?.patternId ?? '')) ? 'undo' : segments.some((x) => /redo/i.test(x.match?.patternId ?? '')) ? 'redo' : null });
    disc.noteNavigation({ text: english, tabBefore: tabBefore, tabAfter: this.isession.state['ui.shell']?.activeTab, turn: this._msg });
    if (personSeg) segments = [personSeg];   // the turn was the person's: its one segment names session.things (no wires: the facts are the state's)
    this.dialogue.record({ english, original: text, kind: this.dialogue._kind ?? meta?.info?.dialogue ?? (meta?.info?.kind === 'explain' ? 'why' : null) ?? (correction ? 'correction' : 'new'), metaKind: meta?.info?.kind ?? null, segments, statuses, reply: englishReply, effect: disc.actions[0]?.turn === this._msg, tabBefore, tabAfter: this.isession.state['ui.shell']?.activeTab });
    if (meta?.info?.kind !== 'repeat' && meta?.info?.kind !== 'explain') disc.lastAnswer = { text: englishReply, turn: this._msg };
    const feedback = meta?.feedback ?? null;
    const state = {};
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k] && !(stateBefore[k] === undefined && JSON.stringify(v) === '{}')) state[k] = structuredClone(v);   // a world only looked at (its empty state created on access) is not a changed world
    this._astraTurn({ sid, english, meta, pre, pend, segments, state, stateBefore, tabBefore });
    try { this._nextPrefetch = prefetchNext(this, Object.keys(state)); } catch { this._nextPrefetch = null; }   // spec 25: what the next chips read, fetched after the reply (never awaited by a turn)
    const effects = this.isession.effects;
    this.isession.effects = [];
    const warnings = this.isession.rs?.newWarnings() ?? [];   // what the library warned about (an ambiguous key, an attribute nothing reads ...): in the debug trace and the phrase log, never in the reply (spec 15, "Namespaces")
    const assumptions = answers.flatMap((a) => a.envelope?.assumptions ?? []);   // the default / guessed values the answers rest on (matrix reasoner; absent otherwise)
    return {
      text: reply, parts, lang, translation, segments, wires: [...wires, ...answerWires], answers, statuses, state, effects, ...(feedback ? { feedback } : {}), ...(assumptions.length ? { assumptions } : {}), ...(warnings.length ? { warnings } : {}),
      trace: {
        intercepted: icpt?.worldId ?? null, effects, formalizer: { preferred: formalizer ?? this.formalizer, used: [...new Set(segments.map((s) => s.strategy))], nx: formal.nx ?? null, ...(encoderError ? { error: encoderError } : {}), modelTimeoutCount: this.modelTimeouts ?? 0, ...(this._turnModelTimeouts?.length ? { modelTimeouts: this._turnModelTimeouts } : {}) },
        dispatch: dispatch ?? null,
        discourse: { resolved: pre?.info ?? null, meta: meta?.info ?? null, ...(feedback ? { feedback } : {}), pending: disc.pending ? { type: disc.pending.type, world: disc.pending.world, key: disc.pending.key, expected: disc.pending.expected, question: disc.pending.question } : null, consumed: pend ? { type: pend.type, world: pend.world, question: pend.question } : null, frames: disc.frames.length },
        ...(feedback ? { feedback } : {}),
        source: sid, language: lang, original: text, english, ...(replyRoutes.length ? { replyVia: replyRoutes } : {}), ...(selfCorrections.corrections.length ? { selfCorrections: selfCorrections.corrections } : {}), replyEnglish: englishReply,
        segments: segments.map(plainSegment), router: segments.map((s) => s.worlds),
        routing: icpt ? [{ router: 'policy', tier: 1, tierName: 'modal', reason: `modal input of ${icpt.worldId}`, contested: false, winner: { worldId: icpt.worldId }, runnerUp: null }] : segments.map((s) => s.routing ?? null),
        patterns: segments.filter((s) => s.match).map((s) => s.match.patternId),
        operations: icpt ? [...ops, ...icpt.ops] : ops, statuses, wires: [...wires, ...answerWires].map((w) => w.id),
        steps: turnSteps({ segments, operations: icpt ? [...ops, ...icpt.ops] : ops, statuses, rec: this.dialogue.log.at(-1) }),   // the same vocabulary as docs/system-map.html (src/dialog/steps.mjs)
      },
    };
  }
}

/** The typed worlds of a world set (spec 16 section 13), built lazily from each world's typed.json once the library is loaded (`engine.sopworld`); `set.typedFor(worldId, { things })`. */
function attachTyped(engine, set) {
  set.typedFor = (id, o) => {
    const lib = engine.sopworld;
    if (!lib) return null;
    set._typedWorlds ??= createTypedWorlds({ lib, set });
    return set._typedWorlds.typedFor(id, o);
  };
}

/** Create the dialog engine: loads and checks all worlds. */
export async function createEngine({ loader, translator = null, options = {}, formalizers = {} }) {
  // Reasoner (spec 15): 'matrix' is the product (the worlds that say reasoner=matrix answer through the sopworld library); 'ops' is the named test oracle, selected only by code that compares the two. The option wins over PSYS2_REASONER.
  const mode = (options.reasoner ?? globalThis.process?.env?.PSYS2_REASONER) === 'ops' ? 'ops' : 'matrix';
  // `set`, `reasoner` and `interp` are replaced by `engine.reload(loader)` (LAZY LOADING: the worlds a message needs are added to a running engine); everything below reads them through these bindings.
  let set = await loadWorlds(loader, { reasoner: mode });
  let reasoner = mode === 'matrix' ? await createReasoner(set) : null;
  try { setWorldChooser((await import('../vendor/sopworld/sopworld.mjs')).choose); } catch { /* no library: the tiers decide alone */ }   // spec 20: arbitration by coverage, tab, priority (the library's std.decide kind world)
  let interp = createInterpreter(set, { ...options, reasoner });
  attachOpenWords(options.knowledge ?? null);
  interp.knowledge = options.knowledge ?? null;   // the knowledge catalog (spec 17): operations read `ctx.knowledge.peek(name)`
  const engine = {
    knowledge: options.knowledge ?? null,
    /** Who reads the person's words (src/translate/reading-policy.mjs): { <lang>: true } puts the machine translator back as a reading candidate (Node: PSYS2_RO_MODEL=1). */
    machineReading: options.machineReading ?? (globalThis.process?.env?.PSYS2_RO_MODEL === '1' ? { ro: true } : null),
    /** Attach or detach the knowledge catalog after creation (an experiment, the webchat once the catalog is reachable). */
    setKnowledge(cat) { engine.knowledge = cat ?? null; interp.knowledge = cat ?? null; attachValues(cat); attachOpenWords(cat); attachArrangement(cat); },   // the colour and number readers (k.values) take the catalog's words in place of the bundled subset
    set, interp, translator, loader, reasonerMode: mode, reasoner, router: options.router ?? defaultRouter,
    /** meta.worlds (spec 20): loaded by `prepareMeta()` (a host that sets `routing` to symbolic awaits it once); null until then. */
    meta: null,
    prepareMeta: async () => { if (!engine.meta) { engine.meta = await loadMetaWorlds(set); if (engine.meta) registerClauseStarters(set, engine.meta.cards); } return engine.meta; },   // the cards also drive the rules' clause cutter (spec 03 7.17)
    /** Formalizer strategies by id (spec 06); `formalizers` overrides them (tests, an encoder endpoint). */
    formalizers: { rules: createRulesFormalizer(), encoder: createEncoderFormalizer({ endpoint: options.encoderEndpoint ?? null }), ...formalizers },
    /** Problems found at load time and by static validation (empty when everything is consistent). */
    problems: () => validateWorldSet(set),
    worlds: () => set.list().map((w) => w.summary()),
    /**
     * LAZY LOADING: replaces the world set with the one `newLoader` lists (the loaded worlds plus the ones a message needs), keeping this engine object (formalizers, translator, knowledge, the
     * dispatcher runtime attached to it). Sessions made before keep their old interpreter session: the host makes a new session and gives it the state and memory back (`restoreMemory`).
     */
    reload: async (newLoader) => {
      const hadMeta = !!engine.meta;
      const nset = await loadWorlds(newLoader, { reasoner: mode });
      const nreasoner = mode === 'matrix' ? await createReasoner(nset) : null;
      const ninterp = createInterpreter(nset, { ...options, reasoner: nreasoner });
      ninterp.knowledge = engine.knowledge;
      set = nset; reasoner = nreasoner; interp = ninterp;
      attachTyped(engine, nset);
      engine.set = nset; engine.reasoner = nreasoner; engine.interp = ninterp; engine.loader = newLoader; engine.meta = null;
      attachOpenWords(engine.knowledge);
      if (hadMeta) await engine.prepareMeta();
      return engine;
    },
    createSession: (opts) => new DialogSession(engine, opts),
    /** Compiles every pattern and builds the vocabularies in slices that yield to the host (the webchat warm-up, PERF round 2). */
    precompile: async (opts) => {
      const r = await precompileRules(set, opts);
      try { nameIndex(set); } catch { /* built lazily */ }
      // the spelling vocabularies (global and one per world) are built here, in slices, not by the first message that needs a correction (COMPUTE-BUDGET C)
      try {
        const clock = () => globalThis.performance?.now?.() ?? Date.now();
        const yieldFn = opts?.yieldFn ?? (() => new Promise((res) => setTimeout(res, 0)));
        spellVocabulary(set);
        let t = clock();
        for (const w of set.list()) {
          if (!w.patterns?.length) continue;
          worldVocabulary(set, w.id);
          if (clock() - t > (opts?.budgetMs ?? 10)) { await yieldFn(); t = clock(); }
        }
      } catch { /* built lazily */ }
      return r;
    },
  };
  attachTyped(engine, set);
  return engine;
}

// The names of the bundled animals are real words for the speller with or without a catalog attached (spec 23 section 11): "cow" is never "corrected" into "wow". A small generated list
// (src/knowledge/bundled-names.mjs), registered under a symbol so that the formalizer imports nothing of the knowledge layer.
import { BUNDLED_NAMES } from '../knowledge/bundled-names.mjs';
{
  const names = new Set(BUNDLED_NAMES);
  globalThis[Symbol.for('psys2.bundledWords')] = (w) => { const x = String(w).toLowerCase(); return names.has(x) || (x.endsWith('s') && names.has(x.slice(0, -1))); };
}
