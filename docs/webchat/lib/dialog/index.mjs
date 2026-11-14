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
import { precompile as precompileRules, registerClauseStarters } from '../formalizer/rules/index.mjs?v=8cf22363f7';
import { loadWorlds } from '../worlds/index.mjs?v=f44433a6ec';
import { validateWorldSet } from '../worlds/validate.mjs?v=0fbf9e7f56';
import { defaultRouter, namedWorlds, namingTables } from '../formalizer/routing.mjs?v=cb930d49f5';
import { createInterpreter } from '../interpreter/index.mjs?v=9ada531cab';
import { createReasoner } from '../reasoner/index.mjs?v=bf67d6db1e';
import { createRulesFormalizer, createEncoderFormalizer } from '../formalizer/strategy.mjs?v=61d3f9b732';
import { DEFAULT_NX_STRATEGY, normalizeNxStrategy } from '../formalizer/nx.mjs?v=14dd8966ed';
import { serialize, makeWire, atom, str } from '../soplang/index.mjs?v=c57881f705';
import { splitSentences } from '../formalizer/rules/normalize.mjs?v=3ec9167cca';
import { nameCandidates, nameIndex } from '../formalizer/names.mjs?v=d8dfd4bbc4';
import { cleanVoice, garbleCandidates, weakSoundAlikes } from '../formalizer/voice.mjs?v=5acaf302b1';
import { gatherCandidates, chooseCandidate, englishTest } from '../translate/candidates.mjs?v=4b39ead121';
import { spellCorrect, spellAlternates, spellCandidates, protectedWordsOf, worldVocabulary, spellVocabulary, restrictedSet, ignorable, isKnownWord, sameWordForm, FUNCTION_WORDS } from '../formalizer/spell.mjs?v=5333809212';
import { lexIndex } from '../worlds/lexicon.mjs?v=21b36efdb7';
import { perf } from '../formalizer/perf.mjs?v=b75de4ae38';
import { guard, TurnAborted } from '../formalizer/guard.mjs?v=eb1a66f556';
import { createBudget, installBudget, releaseBudget, isBudgetExceeded, budget } from './budget.mjs?v=00bce6e369';
import { findPartialWindow, changesIntoQuestion } from '../formalizer/partial.mjs?v=14d5d2cbdd';
import { looseCandidates, BEST_EFFORT_POLICY } from '../formalizer/best-effort.mjs?v=a537d442a8';
import { checkValues } from './value-check.mjs?v=4ba2f18db3';
import { attachValues } from '../knowledge/values.mjs?v=a137742733';
import { attachOpenWords, ready as openWordsReady } from '../knowledge/open-words.mjs?v=58f658f635';
import { attachArrangement } from '../knowledge/arrangement.mjs?v=f6a995963d';
import { Discourse } from './discourse.mjs?v=bafaad3873';
import { Dialogue } from './dialogue.mjs?v=35bb41e22e';
import { turnSteps } from './steps.mjs?v=cfff076267';
import { createSessionAstra, mirrorFrames } from '../astra/session.mjs?v=65217ad31a';
import { normalizeReader, readerSegments, chooseReader } from './reader-route.mjs?v=d3cd6d5020';
import { knowledgeAnswer, knowledgeFallback, preloadThings } from './knowledge-lookup.mjs?v=f5f9f348c7';
import { repairFromScene } from './scene-referents.mjs?v=23ccc9c438';
import { loadMetaWorlds } from './meta-worlds.mjs?v=a31fd9b2dd';
import { createSymbolicRouter, normalizeRouting, isSymbolic } from './symbolic-router.mjs?v=811229cfd6';
import { reviewSegments, normalizeWorldAware, baseMode, makePicker, reviewBestEffort, explainUnparsed } from './world-aware.mjs?v=315a9c61e2';
import { recognize } from '../astra/moves.mjs?v=69784e24c4';
import { panel } from '../astra/where.mjs?v=72e99182f4';
import { snapshot as astraSnapshot, restore as astraRestore } from '../astra/persist.mjs?v=3e29fd91c2';
import { correctMessage, splitAnswerList } from '../formalizer/rules/expand.mjs?v=a79dafddd9';

export { runWorldTests } from './test-runner.mjs?v=84ab4dd2bc';

const plainSegment = (s) => ({
  text: s.text, span: s.span, isQuestion: s.isQuestion, worlds: s.worlds, routing: s.routing, match: s.match,
  unparsed: s.unparsed, discourse: s.discourse ?? null, alternatives: s.alternatives, errors: s.errors, strategy: s.strategy, reading: s.strategy === 'model' ? 'model' : 'rules', corrections: s.corrections ?? [], ignored: s.ignored ?? [], dispatch: s.dispatch ?? null,
  ...(s.nx ? { nx: { op: s.nx.op, world: s.nx.world, pattern: s.nx.pattern, p: s.nx.p, spans: s.nx.spans } } : {}),
  wires: s.wires.map((w) => w.id),
  ...(s.reader ? { reader: s.reader } : {}),
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
  if (/^[a-z]/.test(src.trim()) && core) core = core[0].toLowerCase() + core.slice(1);
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
/** The last line of a Romanian reply nothing could translate (RO-TRANSLATE-FALLBACK): the session never shows English. */
const NO_RO_REPLY = 'Nu am încă o formulare în română pentru acest răspuns.';
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
export async function translateParts(parts, translator, lang, userWords = null) {
  const flat = parts.map((p) => ({ ...p }));
  let complete = true;   // RD5: a reply is either fully translated or left in English, never mixed
  // M4, output side (spec 06): one path for every language. The candidates of a run are the machine translators' (the browser Translator, the on-device model: each
  // alone, checked) and the language pack's rules translator, if it has the pair; the first complete one wins (the machine ones first, owner rule P7); a run nothing
  // could translate leaves the reply in English, and in a Romanian session it becomes a Romanian sentence, never English.
  const fb = lang !== 'en' && translator.fallbackMode?.() === 'fallback';
  const ownRules = fb && (translator.rules?.supports?.('en', lang) ?? true);
  const prim = fb ? (ownRules ? (translator.rules ?? translator) : NO_RULES) : translator;
  const routes = [];
  let fbCalls = 0, dead = false;   // after a failed machine round in this reply the rules write the rest
  const viaMachine = async (text) => {
    if (!fb || !translator.candidatesViaMT || fbCalls >= MAX_FALLBACK_CALLS || guard.soft() || dead) return null;
    fbCalls++;
    try {
      const cs = await guard.abortable(translator.candidatesViaMT(text, { from: 'en', to: lang }), 'translate');
      const ok = (cs ?? []).find((c) => !c.rejected && c.text && !(typeof translator.leftovers === 'function' && translator.leftovers(c.text, lang).length));
      if (!ok) dead = true;
      return ok ? ok.translation ?? { text: ok.text } : null;
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
    const c = await choose(src, { fallback: run.length === 1 ? run[0].fallback : null });
    if (c.route) { out.push({ text: fitFragment(src, c.text), translate: true, src }); routes.push(c.route); continue; }
    if (c.incomplete) complete = false;
    out.push({ text: c.text ? fitFragment(src, quoteUserWords(c.text, userWords)) : src, translate: true, src });
  }
  let result;
  if (!complete) {   // keep the whole reply in English: translated runs and the examples (which carry their English text in `en`) revert; quoted user text stays as typed
    if (fb && lang === 'ro') {   // never English in a Romanian session: the quoted words of the user stay, the sentence around them is a fixed Romanian line
      routes.length = 0; routes.push('ro-generic');
      const quoted = flat.filter((p) => p.quote && !p.example && !p.reading).map((p) => (/^".*"$/s.test(p.text) ? `„${p.text.slice(1, -1)}”` : p.text));
      result = [{ text: NO_RO_REPLY + (quoted.length ? ` (${quoted.join(', ')})` : ''), translate: false }];
    } else result = flat.map(({ join, fallback, en, src, incomplete, ...p }) => (join ? { text: p.text, translate: false } : { ...p, text: en ?? p.text }));
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
  text = text.replace(/\bx\s+(?:și|si|şi)\s+(?:zero|o|0)\b/gi, 'x și 0').replace(/\b(?:pornește|porneste|lansează|lanseaza|deschide)\s+(?=x și 0\b)/gi, 'începe ');   // the game's name: "x și zero" (the digit is how the world spells it)
  const map = SOUND_ALIKES[tabWorld];
  return map ? text.replace(/\p{L}+/gu, (w) => (Object.hasOwn(map, w.toLowerCase()) ? map[w.toLowerCase()] : w)) : text;
}

/** Tabs of worlds that do not declare one in their manifest (the built-in tabs of the demo page). */
const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };

const langOf = (r) => (typeof r === 'string' ? r : r?.lang) ?? 'en';
const textOf = (r) => (typeof r === 'string' ? r : r?.text);

const QUESTION_WORD = /^(?:what|who|whom|whose|where|when|why|how|which)\b/i;

/** Time budget of the leniency stage (spelling variants and partial windows) of one message, in ms; past it the best reading so far stands (turn guard, spec 06). */
import { LIMITS } from './time-limits.mjs?v=3dc818f0e6';
import { languageCommand } from '../translate/language-command.mjs?v=af45c6bf2e';
/** A settled dry-run answer is reused for the same text and session state for this long (ms). */
export const DRY_CACHE_MS = 5000;
const stripDetail = (r) => { if (!r || !('detail' in r)) return r; const { detail: _d, ...rest } = r; return rest; };
/** A voice dry run is skipped for texts longer than this many words (room talk, not a command). */
const DRY_MAX_WORDS = 25;
export const LENIENT_MAX_STEPS = 600;   // checks of the leniency stage per message (one per variant or window tried); a step count, not a time, so the reading does not depend on machine speed

const FAST_SEGMENT_MARGIN = 0;   // nats of log-probability between the model's best segmentation and the runner-up for the multi-clause fast path

/**
 * A game whose world state says it is still being played (a tic-tac-toe board with a free cell and no winner, chess or hangman with status "playing", the
 * guessing game while it asks), whichever world spoke last: a bare coordinate ("B1") is its move. The host's `activeGame` wins when it is set.
 */
function runningGame(st, last) {
  const g = last && st[last];
  if (!g || typeof g !== 'object') return null;
  const live = last === 'games.tictactoe' ? Array.isArray(g.board) && !g.winner && g.board.some((c) => !c)
    : last === 'games.chess' || last === 'games.hangman' ? g.status === 'playing'
    : last === 'games.guess' ? g.phase === 'asking' || g.phase === 'guessing' : false;
  return live ? last : null;
}

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
  constructor(engine, { language = 'auto', formalizer = 'rules', spell = true, partial = false, fastPath = false, bestEffort = false, nx = DEFAULT_NX_STRATEGY, worldAware, reader, routing, suspect = true } = {}) {
    this.routing = routing;   // spec 20: dispatcher (default) | symbolic | symbolic+encoder
    this.engine = engine;
    /** World-aware reading (spec 16): 'off' (default) | 'veto' | 'choose' | 'observe'. The environment variable PSYS2_WORLD_AWARE sets the default for command-line tools; an explicit option wins. */
    this.worldAware = normalizeWorldAware(worldAware ?? globalThis.process?.env?.PSYS2_WORLD_AWARE);
    /** READER-ROUTE (spec 16 section 7): the library's reader over the `core.word` facts as a third source of readings: 'off' (default) | 'fill' (readings for clauses nobody read) | 'choose' (and a reading that beats one that leaves words out). */
    this.reader = normalizeReader(reader ?? globalThis.process?.env?.PSYS2_READER);
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
    s.engine = this.engine; s.isession = this.isession.clone(); s.isession.sessionFacts = this.isession.sessionFacts; s._recentWorlds = [...(this._recentWorlds ?? [])]; s._lastGame = this._lastGame;
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
    const BUILTIN = { robot: 'ui.avatar', avatar: 'ui.avatar', editor: 'docs.editor', tictactoe: 'games.tictactoe', guess: 'games.guess', hangman: 'games.hangman' };
    const st = this.isession.state;
    const activeTab = st['ui.shell']?.activeTab ?? null;
    const tabWorld = activeTab ? (this.engine.set.list().find((w) => w.tab?.id === activeTab)?.id ?? BUILTIN[activeTab] ?? null) : null;
    const modalWorld = Object.keys(st).find((id) => st[id]?.inputMode) ?? null;
    if (tabWorld?.startsWith('games.')) this._lastGame = tabWorld;   // opening a game tab ("lets play tic tac toe") makes it the game this session plays
    const gameWorld = st['ui.shell']?.activeGame ?? runningGame(st, this._lastGame);
    const recentWorlds = [...(this._recentWorlds ?? [])];
    return { activeTab, tabWorld, modalWorld, gameWorld, recentWorlds, lastWorld: recentWorlds[0] ?? null, states: st, asked: this.discourse?.pending?.world ?? null, lastAction: this.discourse?.frames?.[0]?.world ?? null };   // asked and lastAction: what meta.worlds reads (a question the world asked; the world of the last request)
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
    const ids = segments.map((s) => s.match?.worldId).filter((w) => w && w !== 'ui.shell' && w !== 'kids.common');
    const game = ids.find((w) => w.startsWith('games.'));
    if (game) this._lastGame = game;   // the last game this session played: while its state says it is running, bare coordinates are its moves (context().gameWorld)
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
   * READER-ROUTE (spec 16 section 7): for each clause the library's reader (`interpret` over the English `core.word` facts) is asked for a reading. A clause nobody read
   * takes the reader's reading when it is unambiguous and leaves nothing out; in `choose` mode a clause that was read but leaves words out, or that the world refuses,
   * takes it when the library's `rank` puts it first. Every decision is on the segment (`reader`). Never throws: a failure keeps the reading.
   */
  async _withReader(formal, mode) {
    const ctx = this.context();
    const worldOrder = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...(ctx.recentWorlds ?? [])].filter((w, i, a) => w && a.indexOf(w) === i);
    const inWorlds = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld].filter(Boolean);   // the worlds the user is in: the reader reads only these
    const segments = [];
    for (const seg of formal.segments) {
      budget.tick('dialog.reader');
      let out = null;
      try {
        if (seg.unparsed) {
          const r = readerSegments(this, seg, { worldOrder, allowed: inWorlds, freeWorlds: inWorlds });
          out = r.segments && !r.ambiguous ? r.segments : null;
          if (out && this.isession?.rs) {   // the reading must be one the world instance can take (the library's `score`): a refusal by the rules is an answer, not a reason to drop it
            const sc = this.isession.rs.score(out.map((x) => ({ wires: x.wires })));
            if (sc.results.some((c) => c.judged && c.ok === false && !(c.violations ?? []).length)) out = null;
          }
          if (!out) { segments.push(r.info?.accepted ? { ...seg, reader: { ...r.info, used: false, ambiguous: !!r.ambiguous } } : seg); continue; }
          segments.push(...out.map((x) => ({ ...x, reader: { ...x.reader, used: true, from: 'unparsed' } })));
          continue;
        }
        if (mode === 'choose' && seg.wires?.length) {
          const r = chooseReader(this, seg, { worldOrder, freeWorlds: inWorlds });
          if (r?.segments) { segments.push(...r.segments); continue; }
          if (r?.note) { segments.push({ ...seg, reader: r.note }); continue; }
        }
      } catch { /* keep the reading */ }
      segments.push(seg);
    }
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
      if (!w || w === ctx.tabWorld || w === 'ui.shell' || w === 'ui.help' || namedNow.has(w) || !(set.get(w)?.tab || BUILTIN_TAB[w])) return true;
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

  async _capability(english, res, opts, lenient) {
    const rep = await this._nameRepair(english, res, opts, lenient);
    if (rep) return rep;
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
    if (usable && lenient.fastPath) { const quick = await this._quickRules(english, opts); if (quick) return quick; }
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
    const g = guard.install({ signal: opts.signal ?? null, hardMs: opts.hardMs ?? Infinity, softMs: opts.softMs ?? Infinity, force: !!opts.signal });
    if (g) guard.onModelTimeout((stage, e) => this._noteModelTimeout(stage, e));
    // Compute budget (spec 06 "Compute budgets"): one per turn, passed down through the shared `budget` handle; nested sends join the outer turn's budget.
    const tb = opts.budget ?? createBudget();
    const bt = installBudget(tb, { force: !!opts.budget });
    const snap = g || bt ? (opts.undo ?? this.snapshot()) : null;   // a host that passes `undo` (its own snapshot) restores the session itself
    if (this.engine.knowledge) await openWordsReady(text);   // open classes (lexicons with open=knowledge) are read by lookup: the vocabulary is loaded before the sentence is read
    try {
      const reply = await this._send(text, opts);
      // INVARIANT (every turn gets a reply): a message that produced no words at all (bare punctuation, an empty reading) is answered, quoting what was typed
      if (reply && typeof reply === 'object' && !String(reply.text ?? '').trim() && String(text ?? '').trim() && !opts.silent) {
        const said = `I did not understand "${String(text).trim().slice(0, 80)}".`;
        reply.text = said; reply.parts = [{ text: said, translate: false }]; if (reply.trace) reply.trace.replyEnglish = said; if (Array.isArray(reply.statuses) && !reply.statuses.length) reply.statuses.push('unparsed');
      }
      if (g) guard.check('end');   // (checks the shared guard)   // a stage that swallowed the abort must not let a half-done turn through
      if (bt && tb.exceeded) throw tb.exceeded;   // a stage that swallowed BudgetExceeded must not let a half-done turn through
      if (own && reply && typeof reply === 'object') reply.perf = perf.end();
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
    return { v: 1, discourse: this.discourse.toJSON(), dialogue: this.dialogue.toJSON(), astra, recent: [...(this._recentWorlds ?? [])], lastGame: this._lastGame ?? null, ...(rs ? { rs } : {}) };
  }

  /** Puts a `memoryJSON()` record back (a bad record changes nothing it cannot read). Runs no effect. */
  restoreMemory(mem) {
    if (!mem || typeof mem !== 'object' || mem.v !== 1) return false;
    this.discourse.load(mem.discourse);
    if (mem.dialogue) this.dialogue.load(mem.dialogue);
    if (mem.astra && this.astra) { try { astraRestore(this.astra, mem.astra); } catch { /* the discussions start empty */ } }
    if (Array.isArray(mem.recent)) this._recentWorlds = [...mem.recent];
    if (mem.lastGame !== undefined) this._lastGame = mem.lastGame;
    if (mem.rs && this.isession.rs) this.isession.rs.restoreJSON(mem.rs, this.isession);   // after the world states: the timeline of the matrix reasoner
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
  async _send(text, opts = {}) {
    const tr = this.engine.translator;
    const wantedLang = opts.language ?? this.language;
    if (!tr || tr.fallbackMode?.() !== 'fallback' || wantedLang === 'en' || guard.soft()) return this._sendCore(text, opts);
    return this._sendByCandidates(text, opts);
  }

  /** Points of trouble of a reading of one candidate English in the active tab: 0 = the reader understands all of it (nothing unparsed, ignored or partial; every wire supported; no other world's reading). */
  async _understands(english) {
    const { set, formalizers, interp } = this.engine;
    const f = this.forkForValidation();
    const ctx = f.context();
    const res = await formalizers.rules.formalize(splitAnswerList(interp.lang.stripFiller(english) || english), { worlds: set, session: f.isession, source: 'candidate', context: ctx, router: this._router });
    const segs = res.segments ?? [];
    if (!segs.length) return { issues: 9 };
    const HOME = /^(ui|session|user|meta|common|lang|core)\b|^talk$/;
    let issues = 0;
    for (const sg of segs) {
      budget.tick('index.understands');
      issues += (sg.unparsed ? 3 : 0) + (sg.ignored?.length ?? 0) + (sg.partial ? 2 : 0) + (sg.bestEffort ? 2 : 0);
      const w = sg.match?.worldId;
      if (w && ctx.tabWorld && w !== ctx.tabWorld && !HOME.test(w)) issues += 2;   // a reading in another world than the open tab is not an understanding in it
      if (sg.unparsed) continue;
      f.isession.add(sg.wires);
      for (const wire of sg.wires) { const r = interp.resolve(f.isession, wire); if (r?.status && r.status !== 'supported') issues += r.status === 'unsupported' || r.status === 'error' ? 2 : 1; }
    }
    return { issues };
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
    const cands = await gatherCandidates(text, { from: lang, to: 'en', translator: tr, abortable: (p, stage) => guard.abortable(p, stage) });
    if (!cands.length) return this._sendCore(text, opts);   // nothing translated it: the core says so (MT-SERIOUS)
    const pick = await chooseCandidate(cands, text, { understand: (e) => this._understands(e), isEnglish, soft: () => guard.soft() });
    if (!pick.chosen) return this._sendCore(text, opts);
    const c = pick.chosen, machine = c.source === 'browser' || c.source === 'model' || /^repaired-(browser|model)$/.test(c.source);
    const r = await this._sendCore(text, opts, { english: c.text, translation: c.translation });
    r.trace.candidates = pick.log;
    r.trace.via = machine ? 'translator-in' : 'rules-translate';
    tr.note?.(machine ? 'translator-in' : 'rules-translate', { direction: `${lang}->en`, strategy: machine ? 'browser-api' : 'rules', reason: `candidate ${c.source} chosen among ${cands.length}` });
    return r;
  }

  async _sendCore(text, { language, formalizer, spell, partial, fastPath, bestEffort, mode, nx, worldAware, reader, correction } = {}, override = null) {
    const { engine } = this;
    if (engine.sopworld === undefined) engine.sopworld = await import('../vendor/sopworld/sopworld.mjs?v=b94d7a689a').catch(() => null);   // the dialogue focus lives on its std.focus / std.fill
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
        // INVARIANT (every turn gets a reply): a translator that cannot map a sentence ("negation could not be mapped") returns an empty text; the message then stays as typed, so that the reading is poor and says so (or the browser Translator is asked)
        if (!english.trim() && text.trim()) { english = text; translation = { ...(translation ?? {}), text, alignment: [], unknown: [], notes: [...(translation?.notes ?? []), 'the rules translation was empty'], confidence: 0 }; }
      } else lang = 'en';
    }
    this._waLang = lang;   // world-aware reading (spec 16): the words a Romanian message leaves out are the translator's, not the reading's
    // LANG-FIXED: an explicit "switch the language" command is read as such in either language, whatever language is selected ("treci pe engleză" while English is selected)
    { const switchTo = languageCommand(text); if (switchTo) english = switchTo; }
    this.sources.set(sid, { original: text, english, lang, alignment: translation?.alignment });
    // Correction phase (spec 03 section 1c, review G2): "knight to f3, no, knight to c3" is resolved on the whole message, before the
    // modal interceptors, discourse, segmentation and routing, so the abandoned variant never has an effect.
    english = splitAnswerList(engine.interp.lang.stripFiller(english) || english);   // "lol ok and ...", "uhh and a pig?": leading hesitation never reaches a world
    const selfCorrections = await perf.time('correct', () => this._correct(english));
    if (selfCorrections.corrections.length) english = selfCorrections.text;

    const stateBefore = Object.fromEntries(Object.entries(this.isession.state).map(([k, v]) => [k, JSON.stringify(v)]));
    this.isession.form.turn = this._msg;   // the ids made while this turn is read say which turn made them (spec 15, "Namespaces")
    this.isession.rs?.beginTurn(this._msg);   // the library as it is now is what this turn can be taken back to (spec 15)
    this.isession.effects = [];
    const disc = this.discourse;
    const tabBefore = this.isession.state['ui.shell']?.activeTab;
    const pend = disc.takePending();   // an expectation lives for one turn (spec 11)
    const icpt = interp.intercept(this.isession, english);   // modal input (spec 07 section 2)
    let pre = null;   // discourse resolution (spec 11): the reply fills a pending argument, or a fragment is an ellipsis of an earlier frame
    let meta = null;  // meta-dialogue (spec 11 sections 6-14): cancel, repeat, explain, feedback, topic, list mode, repair, degree, references
    let formalText = english;
    if (!icpt) {
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
      // RD10: a bare coordinate ("B1") with no game running and no game tab open is a game move without a game: offer to start one
      const cm = /^\s*(?:play\s+)?([a-h])\s*([1-8])\s*[.!]?\s*$/i.exec(english);
      const gctx = this.context();
      if (cm && !gctx.gameWorld && !String(gctx.tabWorld ?? '').startsWith('games.')) {
        const sq = `${cm[1]}${cm[2]}`, label = sq.toUpperCase();
        const ttt = /^[a-c][1-3]$/i.test(sq);
        const question = ttt ? 'Do you want to play tic-tac-toe or chess?' : 'Do you want to play chess?';
        disc.pending = { type: 'offer', accept: 'rewrite', rewrite: ttt ? `play tic tac toe and ${sq}` : `play chess and play ${sq}`, world: ttt ? 'games.tictactoe' : 'games.chess', expected: 'yes/no', question, turn: this._msg };
        formal = { segments: [], wires: [] };
        meta = { reply: `${label} looks like a game move. ${question}`, status: 'unparsed', info: { kind: 'offer', offer: 'game', coordinate: label } };
      }
    }
    if (!icpt && !pre && !meta && formal.segments.length === 1 && formal.segments[0].unparsed) {
      // "open the music tab instead": a trailing softener the command does not need
      const bare = engine.interp.lang.stripTrailing(formalText);
      if (bare && bare !== formalText) { const f2 = await this._formalize(bare, sid, formalizer ?? this.formalizer, { spell: spell ?? this.spell, partial: partial ?? this.partial }); if (f2.segments.length && f2.segments.every((x) => !x.unparsed)) formal = f2; }
    }
    if (!icpt && !pre && !meta && (bestEffort ?? this.bestEffort) && formal.segments.length === 1 && formal.segments[0].unparsed) {   // one unparsed clause: a fragment of a longer message is never guessed
      formal = await this._withBestEffort(formal, { worlds: set, session: this.isession, source: sid, context: this.context(), router: this._router });
    }
    { const rm = normalizeReader(reader ?? this.reader); if (!icpt && !pre && !meta && rm !== 'off' && formal.segments.length) formal = await perf.time('reader', () => this._withReader(formal, rm)); }   // spec 16 section 7: the library's reader as a third source
    // spec 17: a knowledge question ("what is a comet?") whose thing the reading leaves out is answered from the catalog by the conversation; the frame decided, the hit only loads
    if (!icpt && !pre && !meta && this.engine.knowledge && formal.segments.length) {
      let ka = null; try { ka = await perf.time('knowledge', () => knowledgeAnswer(this, english, formal)); } catch { /* no knowledge is no change */ }
      if (ka) { meta = { reply: ka.reply, status: ka.status, info: ka.info }; formal = { segments: [], wires: [] }; }
    }
    const { wires, dispatch, encoderError } = formal;
    const waMode = normalizeWorldAware(worldAware ?? this.worldAware);
    const segments = !icpt && !pre && !meta && waMode !== 'off' ? await reviewSegments(this, formal.segments, { mode: waMode, english }) : formal.segments;   // spec 16: the readings are judged against the world instances before anything is executed
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
      const open = segments.filter((x) => x.unparsed && !fillerOnly(x.text) && !x.veto?.say);
      if (open.length) for (const x of segments) if (!x.unparsed && (isDestructive(x) || x.ignored?.length || x.partial || x.bestEffort)) heldDestructive.add(x);   // a clause read only in part (words ignored) next to one not read at all is held too: "You should change this voila ... ta-da ..." must not start a chess game
    }
    for (const seg of segments) {
      if (heldDestructive.has(seg)) {
        const open = segments.find((x) => x.unparsed && !fillerOnly(x.text));
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
      const waSay = seg.unparsed && waMode !== 'off' && waMode !== 'observe' ? explainUnparsed(this, seg.text) : null;
      if (waSay) { lines.push([T(waSay)]); statuses.push('unsupported'); continue; }
      // honest scope: the world of the open tab may refuse a message it cannot talk about, in its own words, with the nearest things it can (hook `outOfScope`, the Talk tab)
      if (seg.unparsed) {
        const cx = this.context(), tw = cx.tabWorld ?? cx.lastWorld;   // no tab open: the world last used says what it can do
        const oos = tw ? this.engine.interp.hook(this.isession, tw, 'outOfScope', { text: seg.text }) : undefined;
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
          exShown = done.length === ex.length ? done : ex;
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
        // RD9: a loose word that reads as "open this tab" ("robot" in "square eyes robot pls") must not add "You are already on the Avatar tab." to the real answer
        const idleTab = seg.match?.worldId === 'ui.shell' && /\.bare/.test(seg.match.patternId ?? '') && /^You are already on the .+ tab\.$/.test(rendered) && segments.some((x) => x !== seg && !x.unparsed && x.match?.worldId && x.match.worldId !== 'ui.shell');
        if (!idleTab) lines.push([T(rendered)]);
        statuses.push(r.status);
        if (r.status === 'supported') { const wid = seg.match?.worldId; const t = set.get(wid)?.tab?.id ?? BUILTIN_TAB[wid]; if (wid === 'ui.shell') followTab = null; else if (t) { followTab = t; followSeg = seg; } }   // an explicit navigation later in the message wins over the tab of an earlier segment
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
        const bad = this.isession.rs ? (rsWhy ? `That does not add up. ${rsWhy}` : null) : this._refuseFacts(seg.match?.worldId, facts);
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
    let englishParts = [];
    lines.forEach((ln, i) => { if (i) englishParts.push({ text: ' ', translate: true, join: true }); englishParts.push(...ln); });
    const englishReply = englishParts.map((p) => p.text).join('');
    let parts = englishParts.map(({ join, fallback, ...p }) => (join ? { text: p.text, translate: false } : p));
    let reply = englishReply;
    let replyRoutes = [];
    if (lang !== 'en' && translator) {
      try {
        parts = await translateParts(englishParts, translator, lang, userWordMap(text, english, translation?.alignment));
        reply = parts.map((p) => p.text).join('');
        replyRoutes = parts.routes ?? [];
        for (const via of replyRoutes) translator.note?.(via, { direction: 'en->ro', strategy: via === 'translator-out' ? 'browser-api' : 'rules' });
      } catch { parts = englishParts.map(({ join, fallback, ...p }) => p); reply = englishReply; }
    }
    disc.noteShown(this._msg, reply);
    if (icpt?.reply) { disc.icptTurn = { turn: this._msg, text: english, reply: icpt.reply, world: icpt.worldId }; disc.noteWorld(icpt.worldId, english, icpt.reply, this._msg); }
    if (!disc.pending) disc.openConfirm(englishReply, this._msg);
    this.isession.rs?.adoptState(this.isession);   // whatever else changed the state of a world with `adopt` in this turn (another world's request) is taken over before the turn is kept
    this.isession.rs?.commitTurn(this._msg, english);   // a turn that changed the library keeps its mark: what "undo that" and the undo of the dialogue layer rewind to (spec 15)
    disc.commitTurn({ turn: this._msg, text: english, before: stateBefore, kind: ['undo', 'redo'].includes(meta?.info?.kind) ? 'keep' : segments.some((x) => /undo/i.test(x.match?.patternId ?? '')) ? 'undo' : segments.some((x) => /redo/i.test(x.match?.patternId ?? '')) ? 'redo' : null });
    disc.noteNavigation({ text: english, tabBefore: tabBefore, tabAfter: this.isession.state['ui.shell']?.activeTab, turn: this._msg });
    this.dialogue.record({ english, original: text, kind: this.dialogue._kind ?? meta?.info?.dialogue ?? (meta?.info?.kind === 'explain' ? 'why' : null) ?? (correction ? 'correction' : 'new'), metaKind: meta?.info?.kind ?? null, segments, statuses, reply: englishReply, effect: disc.actions[0]?.turn === this._msg, tabBefore, tabAfter: this.isession.state['ui.shell']?.activeTab });
    if (meta?.info?.kind !== 'repeat' && meta?.info?.kind !== 'explain') disc.lastAnswer = { text: englishReply, turn: this._msg };
    const feedback = meta?.feedback ?? null;
    const state = {};
    for (const [k, v] of Object.entries(this.isession.state)) if (JSON.stringify(v) !== stateBefore[k] && !(stateBefore[k] === undefined && JSON.stringify(v) === '{}')) state[k] = structuredClone(v);   // a world only looked at (its empty state created on access) is not a changed world
    this._astraTurn({ sid, english, meta, pre, pend, segments, state, stateBefore, tabBefore });
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

/** Create the dialog engine: loads and checks all worlds. */
export async function createEngine({ loader, translator = null, options = {}, formalizers = {} }) {
  // Reasoner switch (spec 15): 'matrix' (default) or 'ops' (the fallback; the worlds that say reasoner=matrix answer through the sopworld library). The option wins over PSYS2_REASONER.
  const mode = (options.reasoner ?? globalThis.process?.env?.PSYS2_REASONER) === 'ops' ? 'ops' : 'matrix';
  // `set`, `reasoner` and `interp` are replaced by `engine.reload(loader)` (LAZY LOADING: the worlds a message needs are added to a running engine); everything below reads them through these bindings.
  let set = await loadWorlds(loader, { reasoner: mode });
  let reasoner = mode === 'matrix' ? await createReasoner(set) : null;
  let interp = createInterpreter(set, { ...options, reasoner });
  attachOpenWords(options.knowledge ?? null);
  interp.knowledge = options.knowledge ?? null;   // the knowledge catalog (spec 17): operations read `ctx.knowledge.peek(name)`
  const engine = {
    knowledge: options.knowledge ?? null,
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
  return engine;
}
