/**
 * Discourse layer (spec 11, ADR-006). Browser-safe, rule-based, generic across worlds.
 *
 * Holds, per dialog session:
 *   - frames: the last formalized requests and questions (world, pattern, text, pattern slots with their classes, arguments
 *     with their legend key types), newest first, at most FRAME_LIMIT;
 *   - pending: one expectation, `fill` (an operation lacked a required argument and asked for it) or `confirm` (a world
 *     opened a modal yes/no offer). It lives for exactly one turn.
 *
 * Two resolvers run before (or instead of) the normal routing of an utterance:
 *   - `fill(pending, text)`: the reply completes the incomplete command ("Draw" + "a cat" -> "Draw a cat");
 *   - `ellipsis(text)`: a fragment ("And from Berlin?", "Now bigger", "the same for the tree", "again", "the eyes too") is
 *     resolved against a recent frame by replacing one argument slot of that frame's text and re-running the normal rule
 *     formalizer, restricted to the frame's world. It is accepted only when the result is fully understood there.
 * Both return `{ res, info }`, where `res` has the shape of a formalizer result and `info` is the provenance for the trace.
 */
import { restrictedSet } from '../formalizer/spell.mjs?v=b1676c9611';
import { SHORT_TYPOS } from '../formalizer/rules/normalize.mjs?v=5de885797a';
import { lastUnfinished } from '../astra/where.mjs?v=72e99182f4';
import { runDiscussionCommand } from '../astra/session.mjs?v=65217ad31a';
import { classify, resolveReference, describeReferent, chooseOption, plain } from './meta.mjs?v=aa6dfcad14';
import { budget } from './budget.mjs?v=123c3e1329';
import { touchedCount } from './followup.mjs?v=1e203c3efd';

export const FRAME_LIMIT = 5;

/** Worlds whose commands are never remembered as frames: navigation, help, games (own state machines), shared vocabulary. */
const NO_FRAME = (w) => !w || w === 'ui.shell' || w === 'kids.common' || w === 'core' || w.startsWith('games.');

/** Worlds that never count as a conversation topic and whose state changes are not "actions" (navigation, help, shared vocabulary). */
const NO_TOPIC = new Set(['ui.shell', 'ui.help', 'kids.common', 'core']);
/** Tabs of worlds that do not declare one in their manifest (the built-in tabs of the demo page). */
const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };
/** First words of an utterance that is a real command or question, not a list item. */
const UNDO = /^(?:undo|undo that|undo it|take that back|take it back|revert that|cancel that purchase)$/;
const META_SKIP = new Set(['add', 'remove', 'delete', 'show', 'open', 'what', 'who', 'where', 'when', 'why', 'how', 'undo', 'redo', 'draw', 'play', 'tell', 'is', 'are', 'can', 'do', 'does', 'please', 'make', 'go', 'clear', 'cross', 'check']);
/** A modifying command that points at one thing by a bare noun ("make the house red", "delete the tree"). */
const AMBIGUOUS_VERB = /^(?:please\s+|can you\s+|could you\s+|will you\s+)?(?:make|paint|colou?r|move|delete|remove|erase|resize|turn|flip|rotate|copy|duplicate|select|change|shrink|grow|enlarge)\s+(the|that|this)\s+([a-z]+)\b/i;

const WHY_FACT = /^why (?:do|does|did|am|are|is|have|has) \w+/;
const QUESTION_START = /^(?:what|who|whom|whose|where|when|why|how|which|is|are|was|were|does|do|did|can|could|will|would|should)\b/i;
const IMPERATIVE_START = /^(?:please\s+)?(?!(?:i|we|you|my|the|a|an|no|nope|wait|sorry)\b)[a-z]+\b/i;

/** Patterns that only ask for a missing subject (`pat.<world>.ask.*`, spec 11 section 3): not a reading of the sentence. */
const CLARIFY_PATTERN = /\.ask\./;

const ORDINAL_RE = /^the (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last) /;

const LEADS = [
  ['and', 'what', 'about'], ['and', 'how', 'about'], ['what', 'about'], ['how', 'about'], ['what', 'of'], ['do', 'the', 'same', 'for'], ['the', 'same', 'goes', 'for'],
  ['the', 'same', 'for'], ['the', 'same', 'with'], ['same', 'for'], ['same', 'with'], ['do', 'it', 'for'], ['and', 'then'], ['and', 'also'], ['and', 'now'],
  ['and'], ['now'], ['also'], ['but'],
];
const TRAILS = [['as', 'well'], ['too'], ['also'], ['instead']];
const REPEATS = new Set(['again', 'once more', 'one more time', 'do it again', 'do that again', 'same again', 'the same', 'the same thing', 'same thing', 'and again']);
const DETERMINERS = new Set(['a', 'an', 'the', 'my', 'your', 'his', 'her', 'its', 'their', 'this', 'that', 'some']);
const PREPOSITIONS = new Set(['from', 'to', 'in', 'on', 'at', 'with', 'for', 'of', 'by', 'under', 'over', 'near', 'into', 'about', 'behind', 'above', 'below', 'between']);
const SENTENCE_STARTERS = new Set(['who', 'whom', 'whose', 'what', 'where', 'when', 'why', 'how', 'which', 'is', 'are', 'was', 'were', 'does', 'do', 'did', 'can', 'could', 'will', 'would', 'should', 'has', 'have', 'i', 'you', 'we', 'please']);
const wordsOf = (t) => String(t).trim().replace(/[?!.]+$/g, '').split(/\s+/).filter(Boolean);
const lower = (a) => a.map((w) => w.toLowerCase());
const startsWith = (ws, phrase) => phrase.every((p, i) => ws[i]?.toLowerCase() === p);

/** Split a fragment into its discourse marker and content: { kind: 'repeat' | 'marker' | 'bare', content: string[], marker } */
export function splitFragment(text) {
  const ws = wordsOf(text);
  if (!ws.length) return null;
  if (REPEATS.has(lower(ws).join(' '))) return { kind: 'repeat', content: [], marker: lower(ws).join(' ') };
  let marker = [], content = ws;
  for (const lead of LEADS) if (startsWith(ws, lead)) { marker = lead; content = ws.slice(lead.length); break; }
  let trail = [];
  for (const tr of TRAILS) if (content.length > tr.length && tr.every((p, i) => content[content.length - tr.length + i].toLowerCase() === p)) { trail = tr; content = content.slice(0, content.length - tr.length); break; }
  while (content.length && content[0].toLowerCase() === ',') { budget.tick('discourse.splitFragment'); content = content.slice(1); }
  if (!content.length) return null;
  const all = [...marker, ...trail];
  return { kind: all.length ? 'marker' : 'bare', content, marker: all.join(' ') || null };
}

// bare replies that, with nothing pending, get a neutral answer (a closed table on purpose: ok, sure, right ... are not answers to nothing)
const BARE_YES_NO = { yes: 'yes', yeah: 'yes', yep: 'yes', yup: 'yes', no: 'no', nope: 'no', nah: 'no' };

export class Discourse {
  /** Shared vocabulary (yes/no, ordinals, degree ...) from lang.common, as `ctx.lang` of the interpreter. */
  get lang() { return this.dialog.engine.interp.lang; }

  constructor(dialog) {
    this.dialog = dialog;
    this.frames = [];    // newest first
    this.pending = null; // { type: 'fill' | 'confirm', world, ... }
    this.last = null;    // provenance of the last resolution (for the trace)
    this.actions = [];   // effectful turns, newest first: { turn, text, worlds, before, after, frames } (undo, repair, explain)
    this.redoStack = []; // what a world's own undo or "undo the whole message" took out, newest last: { turn, worlds, pre, act, whole? } (redo; a new action empties it)
    this.shown = {};          // turn -> the reply as the user saw it (translated), for "why?"
    this.lastFacts = null;    // { turn, ids, types, text, world }: the fact wires of the newest statement turn (ops reasoner)
    this.lastAnswer = null;   // { text, turn }: the last reply that was not itself a repeat or an explanation
    this.lastByWorld = {};    // world id -> { text, reply, turn } (topic return)
    this.topics = [];         // worlds the conversation was about, newest first
    this.icptTurn = null;     // the newest turn a modal interceptor answered: { turn, text, reply, world } (explain)
    this.list = null;         // list-entry mode (spec 11 section 10): { list, world, n }; unlike `pending` it repeats until "that's all"
  }

  // ---- serialisable memory (a restarted engine worker gets it back, spec 06 "Engine worker") ----------------------------

  /** The memory as plain JSON (no class instances, no functions): `Discourse.fromJSON(dialog, json)` or `load(json)` puts it back. */
  toJSON() {
    return JSON.parse(JSON.stringify({ frames: this.frames, pending: this.pending, last: this.last, actions: this.actions, redoStack: this.redoStack, lastAnswer: this.lastAnswer,
      lastByWorld: this.lastByWorld, topics: this.topics, icptTurn: this.icptTurn, list: this.list }));
  }

  /** Replaces the memory by a `toJSON()` record (an unusable record leaves it empty). Links a pending repair back to the very action and frame it names. */
  load(json) {
    const j = json && typeof json === 'object' ? JSON.parse(JSON.stringify(json)) : {};
    this.frames = Array.isArray(j.frames) ? j.frames : [];
    this.actions = Array.isArray(j.actions) ? j.actions : [];
    this.redoStack = Array.isArray(j.redoStack) ? j.redoStack : [];
    this.pending = j.pending ?? null; this.last = j.last ?? null; this.lastAnswer = j.lastAnswer ?? null;
    this.lastByWorld = j.lastByWorld && typeof j.lastByWorld === 'object' ? j.lastByWorld : {};
    this.topics = Array.isArray(j.topics) ? j.topics : []; this.icptTurn = j.icptTurn ?? null; this.list = j.list ?? null;
    const p = this.pending;
    if (p?.action) p.action = this.actions.find((a) => a.turn === p.action.turn && a.text === p.action.text) ?? p.action;   // identity: the actions list is filtered by `!== act`
    if (p?.frame) p.frame = this.frames.find((f) => f.turn === p.frame.turn && f.text === p.frame.text) ?? p.frame;
    for (const a of this.actions) a.frames = (a.frames ?? []).map((af) => this.frames.find((f) => f.turn === af.turn && f.text === af.text) ?? af);
    return this;
  }

  static fromJSON(dialog, json) { return new Discourse(dialog).load(json); }

  // ---- frames ------------------------------------------------------------------------------------------------------

  /** Remember a parsed request or question that the interpreter understood. `answer` is the interpreter result record. */
  recordFrame(seg, turn) {
    const m = seg.match;
    if (!m || seg.unparsed || NO_FRAME(m.worldId) || (m.kind !== 'request' && m.kind !== 'question')) return null;
    const L = this.dialog.engine.set.legends;
    let text = seg.text.trim().replace(/[?!.]+$/g, '');
    if (!text) return null;
    if (seg.isQuestion || m.kind === 'question') text += '?';
    const base = seg.span ? seg.span[0] : 0;
    const slots = [];
    for (const [name, s] of Object.entries(m.slots ?? {})) {
      if (!s.span || s.class === 'recent' || s.span[1] <= s.span[0]) continue;
      const start = s.span[0] - base, end = s.span[1] - base;
      if (start < 0 || end > text.length || text.slice(start, end) !== s.text) continue;
      slots.push({ name, class: s.class, text: s.text, start, end });
    }
    slots.sort((a, b) => a.start - b.start);
    const main = seg.wires.find((w) => !w.type.startsWith('core.agent') && w.type !== 'core.source') ?? seg.wires[0];
    const args = (main?.entries ?? []).filter((e) => !/^core\.(seq|via|source|status)/.test(e.key)).map((e) => {
      const info = L.keyInfo(e.key);
      return { key: L.shortKey(main.type, e.key), type: info?.value?.ref ?? info?.value?.kind ?? null, value: e.value?.v ?? null };
    });
    const frame = { turn, world: m.worldId, patternId: m.patternId, kind: m.kind, text, slots, args, op: args.find((a) => a.key === 'action' || a.key === 'core.request.action')?.value ?? null, reply: null, opId: null };
    this.frames.unshift(frame);
    this.frames.length = Math.min(this.frames.length, FRAME_LIMIT);
    return frame;
  }

  // ---- pending -------------------------------------------------------------------------------------------------------

  /** Open a `fill` expectation for an answer whose envelope asks for a missing argument. */
  openFill(seg, envelope, question, turn) {
    const p = envelope?.pending;
    if (!p || !seg.match) return null;
    this.pending = { type: 'fill', world: p.world ?? seg.match.worldId, patternId: seg.match.patternId, text: seg.text.trim().replace(/[?!.]+$/g, ''), template: p.template ?? null, key: p.key ?? null, expected: p.type ?? null, op: envelope.via ?? null, question, turn, tab: this.dialog.isession?.state?.['ui.shell']?.activeTab ?? null };   // the tab the question was asked on: the user leaving it ends the expectation
    return this.pending;
  }

  /** A world opened a modal yes/no offer (its state has `inputMode`): record it as a `confirm` expectation. */
  openConfirm(question, turn) {
    const world = this.dialog.context().modalWorld;
    if (!world) return null;
    this.pending = { type: 'confirm', world, key: null, expected: 'yes/no', op: `op.${world}.interceptInput`, question, turn };
    return this.pending;
  }

  /** Take (and clear) the expectation: it expires after one turn. */
  takePending() { const p = this.pending; this.pending = null; return p; }

  // ---- resolution ----------------------------------------------------------------------------------------------------

  async _try(worldId, text, opts) {
    const { set, formalizers } = this.dialog.engine;
    const form = this.dialog.isession.form;
    const snap = form.snapshot();
    let res = null;
    try { res = await formalizers.rules.formalize(text, { ...opts, worlds: restrictedSet(set, [worldId]) }); } catch { res = null; }
    if (res && res.segments.length === 1 && !res.segments[0].unparsed && res.segments[0].match?.worldId === worldId) return { res, snap };
    form.restore(snap);
    return null;
  }

  _opts(sid) {
    const d = this.dialog;
    return { session: d.isession, source: sid, context: d.context(), router: d.engine.router };
  }

  _finish(hit, info) {
    for (const s of hit.res.segments) { s.strategy = 'rules'; s.discourse = info; }
    this.last = info;
    return { res: { segments: hit.res.segments, wires: hit.res.wires }, info };
  }

  /** The reply completes the incomplete command of the pending expectation. */
  async fill(pending, text, sid) {
    budget.tick('discourse.fill');
    if (pending?.type !== 'fill') return null;
    if (pending.tab && pending.tab !== this.dialog.isession?.state?.['ui.shell']?.activeTab) return null;   // RP3: the answer to a question on another tab is a new request, not the missing text
    const reply = String(text).trim().replace(/[?!.]+$/g, '');
    if (!reply) return null;
    const opts = this._opts(sid);
    // `template` ("how many legs does <x> have"): the operation that asked says how the answer completes the sentence
    const cands = [...(pending.template ? [pending.template.replace('<x>', reply)] : []), `${pending.text} ${reply}`, reply];
    for (const candidate of cands) {
      const hit = await this._try(pending.world, candidate, opts);
      if (!hit || hit.res.segments[0].match.patternId === pending.patternId) { if (hit) this.dialog.isession.form.restore(hit.snap); continue; }
      return this._finish(hit, { kind: 'fill', of: pending.text, fragment: text, rewritten: candidate, world: pending.world, missing: pending.key, expected: pending.expected, question: pending.question });
    }
    return null;
  }

  /** Resolve a fragment against the recent frames. `bare` allows fragments without a discourse marker. */
  async ellipsis(text, sid, { bare = false } = {}) {
    budget.tick('discourse.ellipsis');
    if (!this.frames.length) return null;
    const frag = splitFragment(text);
    if (!frag || (frag.kind === 'bare' && !bare) || frag.content.length > 4) return null;
    if (frag.kind === 'bare' && SENTENCE_STARTERS.has(frag.content[0].toLowerCase())) return null;   // a full question or sentence, not a fragment
    const opts = this._opts(sid);
    // a fragment that is a complete sentence of ANOTHER world ("now lets draw a house" after "open the story") is not a filler for a free-text slot
    const own = frag.kind !== 'repeat' && frag.content.length >= 3 ? await this._readSeg(frag.content.join(' '), sid) : null;
    for (const frame of this.frames) {
      if (frag.kind === 'repeat') {
        const hit = await this._try(frame.world, frame.text, opts);
        if (hit) return this._finish(hit, { kind: 'ellipsis', how: 'repeat', of: frame.text, fragment: text, rewritten: frame.text, world: frame.world, frameTurn: frame.turn });
        continue;
      }
      for (const cand of this._candidates(frame, frag.content)) {
        if (cand.wild && frag.kind === 'bare') continue;   // gibberish with no marker is no text for a free slot ("asdf qwer zxcv")
        if (cand.wild && ((own && own.match?.worldId !== frame.world) || (own && !own.unparsed && own.match?.worldId === frame.world && own.wires?.some((w) => w.type === 'core.request' && !w.entries?.some((e) => /\.ask\./.test(String(own.match.patternId))))) || META_SKIP.has(frag.content[0].toLowerCase()) || /^lets?$/i.test(frag.content[0]))) continue;   // a command of its own is no text for a free slot
        const hit = await this._try(frame.world, cand.text, opts);
        if (!hit) continue;
        const seg = hit.res.segments[0];
        const swallowed = Object.values(seg.match.slots ?? {}).some((sl) => (sl.class === 'rest') || (sl.class === 'words' && sl.span[0] < cand.end && sl.span[1] > cand.start && !cand.wild));
        if (swallowed || seg.match.patternId === 'unknown') { this.dialog.isession.form.restore(hit.snap); continue; }
        // M1: the world must be able to carry the completion out; a reading it would only answer "missing" or refuse ("I can not find a cat in your picture") is not the one meant
        // (a request is continued by a request, a question by a question; a request whose world cannot do the completion is not continued by it)
        if (frame.kind === 'request') {
          if (seg.match.kind && seg.match.kind !== 'request') { this.dialog.isession.form.restore(hit.snap); continue; }
          try { const st = this.dialog._dryStatuses(hit.res.segments); if (st.length && !st.every((x) => x === 'supported')) { this.dialog.isession.form.restore(hit.snap); continue; } } catch { /* no dry run: take it */ }
        }
        return this._finish(hit, { kind: 'ellipsis', how: 'replace', slot: cand.slot, slotClass: cand.cls, of: frame.text, fragment: text, rewritten: cand.text, world: frame.world, frameTurn: frame.turn });
      }
    }
    return null;
  }

  /**
   * A sentence nobody read that holds a pronoun ("how many legs does it have?", "what sound does that one make?"): the pronoun is replaced by the
   * noun phrase of a typed slot of a recent frame ("a duck": "how many legs does a duck have?"), newest frame first, and the result must be read
   * completely by that frame's world. Only lexicon nouns and agents of the frame are referents (no guessing).
   */
  async pronoun(text, sid) {
    budget.tick('discourse.pronoun');
    if (!this.frames.length) return null;
    text = String(text).replace(/[A-Za-z]+/g, (w) => SHORT_TYPOS[w.toLowerCase()] ?? w);   // chat spellings of short words ("mke it a siren")
    const m = String(text).match(/\b(it|that one|this one|that animal|this animal|that shape|this shape|that thing|this thing|them|those|these|that|this)\b/i);
    if (!m) return null;
    const read = await this._readSeg(text, sid);
    if (read && !CLARIFY_PATTERN.test(read.match?.patternId ?? '')) return null;   // a sentence some world reads as it is stays as it is (a clarification question lacking its subject is no reading)
    const opts = this._opts(sid);
    // "what day comes after that?": "that" can be the answer just given ("5 days after Friday" is Wednesday)
    if (/^(?:that|this|it)$/i.test(m[0]) && this.frames[0]?.value != null && !/^\d/.test(String(this.frames[0].value))) {
      const frame = this.frames[0], np = String(frame.value);
      const cand = String(text).slice(0, m.index) + np + String(text).slice(m.index + m[0].length);
      const hit = await this._try(frame.world, cand, opts);
      if (hit && hit.res.segments[0].match.patternId !== 'unknown' && !CLARIFY_PATTERN.test(hit.res.segments[0].match.patternId) && Object.values(hit.res.segments[0].match.slots ?? {}).some((sl) => String(sl.class).startsWith('lex.') && String(sl.text).toLowerCase() === np.toLowerCase())) return this._finish(hit, { kind: 'ellipsis', how: 'pronoun', pronoun: m[0], referent: np, of: frame.text, fragment: text, rewritten: cand, world: frame.world, frameTurn: frame.turn });
      if (hit) this.dialog.isession.form.restore(hit.snap);
    }
    for (const frame of this.frames) {
      for (const s of [...frame.slots].filter((x) => !['number', 'words', 'rest', 'recent'].includes(x.class)).sort((a, b) => b.start - a.start)) {
        const prev = wordsOf(frame.text.slice(0, s.start)).at(-1)?.toLowerCase();
        const np = DETERMINERS.has(prev) && prev !== 'my' ? `${prev} ${s.text}` : s.text;
        // a referent the sentence already says is no referent of the pronoun ("why is it blue" is not "why is blue blue": the colour slot of the last frame is a modifier, not a thing)
        if (wordsOf(text).some((w) => w.toLowerCase() === s.text.toLowerCase())) continue;
        const cand = String(text).slice(0, m.index) + np + String(text).slice(m.index + m[0].length);
        const hit = await this._try(frame.world, cand, opts);
        if (!hit) continue;
        const seg = hit.res.segments[0];
        if (seg.match.patternId === 'unknown' || Object.values(seg.match.slots ?? {}).some((sl) => sl.class === 'rest')) { this.dialog.isession.form.restore(hit.snap); continue; }
        return this._finish(hit, { kind: 'ellipsis', how: 'pronoun', pronoun: m[0], referent: np, of: frame.text, fragment: text, rewritten: cand, world: frame.world, frameTurn: frame.turn });
      }
    }
    return null;
  }

  /** Candidate rewritings of `frame.text`: each typed slot (then each free-text slot) replaced by the fragment content. */
  *_candidates(frame, content) {
    const lead = content[0].toLowerCase();
    const fragPrep = PREPOSITIONS.has(lead) && content.length > 1 ? lead : null;
    const wild = (s) => s.class === 'words' || s.class === 'rest';
    // "the G major one" after "play the C major scale": "one" stands for the last noun of the request; the last noun phrase is replaced
    if (!fragPrep && content.length >= 2 && /^ones?$/i.test(content.at(-1))) {
      const fw = wordsOf(frame.text), noun = fw.at(-1);
      let d = -1;
      for (let i = fw.length - 2; i >= 0; i--) if (DETERMINERS.has(fw[i].toLowerCase())) { d = i; break; }
      if (d >= 0 && noun) {
        const np = [...content.slice(0, -1), noun].join(' ');
        const out = [...fw.slice(0, d), np].join(' ') + (/\?$/.test(frame.text) ? '?' : '');
        yield { text: out, slot: '*', cls: 'one', start: 0, end: out.length, wild: false, whole: true, direct: false };
      }
    }
    // A fragment that already is a complete sentence of the frame's world ("and the one before that", "and 9 minus 2") is tried on its own first.
    if (!fragPrep && content.length > 2) yield { text: content.join(' '), slot: '*', cls: 'sentence', start: 0, end: content.join(' ').length, wild: false, whole: true, direct: true };
    // A fragment that is itself a whole expression ("and 9 minus 2", "I meant 7 times 5", "half of 14") replaces the whole run of arguments
    // of one class (the numbers of "6 times 8", from the first to the last), not one of them: the merged sentence ("6 times 9 minus 2") would be wrong.
    if (!fragPrep && content.length > 1) {
      for (const cls of new Set(frame.slots.filter((x) => !wild(x)).map((x) => x.class))) {
        const same = frame.slots.filter((x) => x.class === cls);
        if (same.length < 2) continue;
        const start = same[0].start, end = same.at(-1).end, raw = content.join(' ');
        if (frame.text.slice(start, end).toLowerCase() === raw.toLowerCase()) continue;
        yield { text: frame.text.slice(0, start) + raw + frame.text.slice(end), slot: same.map((x) => x.name).join('+'), cls, start, end: start + raw.length, wild: false, whole: true };
      }
    }
    // Adjacent typed arguments are one noun phrase ("3 balls": a number and an item): a fragment with its own quantity ("and 5 kites", "and a kite")
    // replaces the whole phrase, not just the item.
    if (!fragPrep && (content.length > 1 || /^\d/.test(lead))) {
      const raw = content.join(' ');
      const typed = frame.slots.filter((x) => !wild(x));
      for (let i = 0; i + 1 < typed.length; i++) {
        const a = typed[i], b = typed[i + 1];
        if (a.class === b.class || !/^\s*$/.test(frame.text.slice(a.end, b.start))) continue;
        for (const v of [raw, ...(DETERMINERS.has(lead) && content.length > 1 ? [content.slice(1).join(' ')] : [])]) {
          yield { text: frame.text.slice(0, a.start) + v + frame.text.slice(b.end), slot: `${a.name}+${b.name}`, cls: a.class, start: a.start, end: a.start + v.length, wild: false, whole: true };
        }
      }
    }
    // The fragment repeats the label of the slot ("and section 1" after "summarize section 2"): drop the label; or ends with it ("and the last
    // section"): the label and the slot are replaced together.
    if (!fragPrep) {
      for (const s of frame.slots) {
        const prevWords = wordsOf(frame.text.slice(0, s.start)).map((w) => w.toLowerCase());
        for (let k = 1; k <= Math.min(2, prevWords.length); k++) {
          const lab = prevWords.slice(-k);
          if (lab.some((w) => DETERMINERS.has(w) || PREPOSITIONS.has(w) || w.length < 3)) continue;
          const lc = content.map((w) => w.toLowerCase());
          if (lc.length > k && lab.every((w, i) => lc[i] === w)) {
            const v = content.slice(k).join(' ');
            yield { text: frame.text.slice(0, s.start) + v + frame.text.slice(s.end), slot: s.name, cls: s.class, start: s.start, end: s.start + v.length, wild: wild(s) };
          }
          const m = frame.text.slice(0, s.start).match(new RegExp(`${lab.map((w) => w.replace(/[^a-z0-9]/gi, '')).join('\\s+')}\\s*$`, 'i'));
          if (m && lc.length > k && lab.every((w, i) => lc[lc.length - k + i] === w)) {
            const at = s.start - m[0].length;
            for (const v of [content.join(' '), ...(DETERMINERS.has(lead) ? [content.slice(1).join(' ')] : [])]) {
              yield { text: frame.text.slice(0, at) + v + frame.text.slice(s.end), slot: s.name, cls: s.class, start: at, end: at + v.length, wild: wild(s), whole: true };
            }
          }
        }
      }
    }
    // "No, to my to-do list" after "Add milk to my list": a fragment that opens with a preposition of the request replaces everything
    // from that same preposition to the end of the request (the target phrase), whatever slots the old wording had
    if (fragPrep) {
      const fw = wordsOf(frame.text);
      let at = -1;
      for (let i = fw.length - 1; i > 0; i--) if (fw[i].toLowerCase() === fragPrep) { at = i; break; }
      if (at > 0) {
        const head = fw.slice(0, at).join(' ');
        const out = `${head} ${content.join(' ')}${/\?$/.test(frame.text) ? '?' : ''}`;
        yield { text: out, slot: '*', cls: 'tail', start: head.length + 1, end: out.length, wild: true, whole: true, direct: false };
      }
    }
    const order = [...frame.slots].sort((a, b) => (wild(a) - wild(b)) || b.start - a.start);
    for (const s of order) {
      const before = wordsOf(frame.text.slice(0, s.start));
      const prev = before.at(-1)?.toLowerCase();
      if (fragPrep && prev !== fragPrep) continue;
      const variants = [];
      const raw = content.join(' ');
      if (fragPrep) variants.push(content.slice(1).join(' '));
      else {
        // "What is a bicycle?" + "and a ball?": the determiner is already in front of the slot, so the fragment's own is dropped first ("What is a ball?", not "What is a a ball?")
        const twice = DETERMINERS.has(lead) && content.length > 1 && DETERMINERS.has(prev);
        if (twice) variants.push(content.slice(1).join(' '));
        variants.push(raw);
        if (!twice && DETERMINERS.has(lead) && content.length > 1) variants.push(content.slice(1).join(' '));
      }
      for (const v of variants) {
        if (!v || v.toLowerCase() === s.text.toLowerCase()) continue;
        const out = frame.text.slice(0, s.start) + v + frame.text.slice(s.end);
        yield { text: out, slot: s.name, cls: s.class, start: s.start, end: s.start + v.length, wild: wild(s) };
      }
    }
  }

  // ---- turn bookkeeping (spec 11 section 7) -----------------------------------------------------------------------------------

  /** Remember what a segment of this turn said and answered: per-world last reply and the topic order. */
  noteTurn(seg, rendered, turn) {
    const w = seg.match?.worldId;
    if (!w || seg.unparsed) return;
    if (this.lastByWorld[w] && this.lastByWorld[w].turn !== turn) (this.prevByWorld ??= {})[w] = this.lastByWorld[w];   // what the world did before (a redo names what an undo took out)
    this.lastByWorld[w] = { text: seg.text, reply: rendered, turn };
    this.lastWorld = w;
    if (!NO_TOPIC.has(w)) this.topics = [w, ...this.topics.filter((x) => x !== w)].slice(0, 6);
  }

  /**
   * The world a tab belongs to (manifest `tab=` or the built-in tabs of the demo page).
   */
  tabWorld(tab) {
    if (!tab) return null;
    return this.dialog.engine.set.list().find((w) => (w.tab?.id ?? BUILTIN_TAB[w.id]) === tab && !NO_TOPIC.has(w.id))?.id ?? null;
  }

  /**
   * Navigation is a conversation topic too: when a turn brought another tab forward, the world of that tab becomes the newest topic
   * ("open the charts tab", "let's play hangman"), so "where were we?" can go back to it. A turn made of "back to <something>" that
   * ended on another tab counts as an explicit return (a following "where were we?" stays there, spec 11 section 10).
   */
  noteNavigation({ text, tabBefore, tabAfter, turn }) {
    if (!tabAfter || tabAfter === tabBefore) return;
    const w = this.tabWorld(tabAfter);
    if (!w) return;
    const knownBefore = this.topics.includes(w);
    this.topics = [w, ...this.topics.filter((x) => x !== w)].slice(0, 6);
    if (!this.lastByWorld[w]) this.lastByWorld[w] = { text, reply: null, turn };
    // "back to X" is a return (not a digression) only when X was already an activity of the conversation; the same turn may already have been
    // handled by `_topic`. Any other navigation is a digression: the world we left is what "where were we?" goes back to (spec 11 section 10).
    if (this._topicTurn === turn) return;
    this.lastTopic = classify(text, { lang: this.lang })?.intent === 'topic' && knownBefore ? { world: w, turn } : null;
  }

  /** A modal interceptor answered: the world is a topic and its last exchange is what a topic return summarises. */
  noteWorld(w, text, reply, turn) {
    if (!w) return;
    this.lastByWorld[w] = { text, reply, turn };
    this.lastWorld = w;
    if (!NO_TOPIC.has(w)) this.topics = [w, ...this.topics.filter((x) => x !== w)].slice(0, 6);
  }

  noteShown(turn, text) { this.shown[turn] = text; const k = Object.keys(this.shown); if (k.length > 12) delete this.shown[k[0]]; }

  /** The fact wires the newest statement turn told (ops reasoner): what "no, she gives him 4" takes back, and what "why?" falls back on. */
  noteFacts(facts, turn, text, world = null) {
    const own = facts.filter((w) => !w.type.startsWith('core.'));
    this.lastFacts = own.length ? { turn, ids: own.map((w) => w.id), types: own.map((w) => w.type), text, world } : null;
  }

  /**
   * "No, she gives him 4." right after "Ana gives him 3 apples.": a correction that is itself a statement of the same kind revises the last
   * statement. The old fact is retracted and the new sentence goes through the normal pipeline (ops reasoner; the matrix has its own `revise`).
   */
  async _correctFact(text, sid) {
    const lf = this.lastFacts, d = this.dialog;
    if (!lf || d._msg - lf.turn > 1) return null;
    const m = /^\s*(?:no|nope|nah|wait|actually|sorry|oops)\b[\s,.:;!-]+(.+?)\s*$/i.exec(String(text));
    if (!m) return null;
    const seg = await this._readSeg(m[1], sid);
    if (!seg || seg.match?.kind !== 'statement') return null;
    const types = new Set(seg.wires.filter((w) => !w.type.startsWith('core.')).map((w) => w.type));
    if (!lf.types.some((t) => types.has(t))) return null;
    // matrix strategy: the library takes the old facts out (retract: what followed from them goes too) and the corrected sentence is told as a new statement
    if (d.isession.rs) { if (!d.isession.rs.retractFacts(lf.ids, d.isession, 'corrected by the user')) return null; }
    else for (const id of lf.ids) d.isession.memory.retract(id, 'corrected by the user');
    this.lastFacts = null;
    return { rewrite: m[1], prefix: 'OK, I took that back.', info: { kind: 'repair', how: 'fact', undone: lf.text, fragment: m[1] } };
  }

  /**
   * "Why do I have nothing left?" / "why is milk done?": a question about a fact the user can name. The worlds that export `why(ctx, { text })`
   * answer from what is known: { text, from }. Returns null when no world takes it (the sentence then goes to the normal pipeline).
   */
  _whyFact(t, only = null) {
    const d = this.dialog, { set, interp } = d.engine;
    const order = only ? [only] : [this.lastFacts?.world, d.context().lastWorld, this.lastWorld, ...set.list().map((w) => w.id)].filter(Boolean);
    const rs = d.isession.rs;
    for (const w of [...new Set(order)]) {
      // matrix strategy (spec 15): a world that exports `why` in its fns.mjs explains from the library instance that holds its facts
      const own = rs?.reasoner.whyOf.get(w);
      if (own) {
        let r;
        try { const lib = rs.of(w); r = own({ text: t, state: d.isession.state[w], find: (ty) => lib.ofType(ty), explain: (id) => rs.explain(id) }); } catch { r = undefined; }
        if (r?.text) return this._say([...(r.parts ?? [{ text: r.text, translate: true }]), ...this._known(r.from)], { kind: 'explain', of: t, world: w, from: r.from ?? [] });
      }
      const r = interp.hook(d.isession, w, 'why', { text: t });
      if (r?.text) return this._say([{ text: r.text, translate: true }, ...this._known(r.from)], { kind: 'explain', of: t, world: w, from: r.from ?? [] });
    }
    return null;
  }

  /** A reply made of parts (translated runs and quoted user text): `reply` is the English text, `parts` what the translator works on. */
  _say(parts, info) { return { reply: parts.map((p) => p.text).join(''), parts, info }; }

  /** True when the user typed the turn in another language (the source keeps the original text, distinct from the English reading). */
  _translated(turn) { const src = this.dialog.sources.get(`msg${turn}`); return !!src?.original && src.original !== src.english; }

  /** What was shown for a turn (already in the user's language: kept as is), else the English reply, which is translated with the rest. */
  _shownOr(turn, english) { const shown = this.shown[turn]; return shown && shown !== english ? { text: shown, translate: false } : { text: english, translate: true }; }

  /** The user's own words of a past turn, quoted as typed (never back-translated); the English reading when the source is gone. */
  _quoted(turn, fallback, orig = null) {
    const src = this.dialog.sources.get(`msg${turn}`);
    const text = String(orig ?? src?.original ?? fallback ?? '').trim().replace(/[.!?\s]+$/, '');
    return { text: `"${text}"`, translate: false, quote: true };
  }

  /**
   * The facts a list of wire ids rests on, in order, as the user said them: parts for " I worked that out from what you told me: "...", "..." and
   * "...".", or [] when nothing is known. Wires without a source of the dialog (the price list) are said as such.
   */
  _known(ids) {
    const d = this.dialog, rs = d.isession.rs;
    const said = [], seen = new Set();
    const kb = [];   // the phrases of the worlds whose own facts (no sentence of the dialogue) the answer rests on
    const from = (id) => {
      const type = rs?.get(id)?.type ?? d.isession.memory.get(id)?.type ?? '';
      const w = this.dialog.engine.set.list().filter((x) => type === x.id || String(type).startsWith(x.id + '.')).sort((a, b) => b.id.length - a.id.length)[0];
      const phrase = w?.sourcePhrase ?? 'what I know';
      if (!kb.includes(phrase)) kb.push(phrase);
    };
    const add = (src) => {
      const sid = String(src ?? '').replace(/^"|"$/g, '').split('#')[0];
      const rec = sid ? d.sources.get(sid) : null;
      if (!rec?.english) return false;
      if (!seen.has(sid)) { seen.add(sid); said.push({ text: `"${String(rec.original ?? rec.english).trim().replace(/[.!?\s]+$/, '')}"`, translate: false, quote: true }); }
      return true;
    };
    // matrix strategy (spec 15): the library's explanation knows the chain, so the facts an answer rests on are the told leaves of it, oldest first
    const leaves = rs ? rs.leaves(ids, d.isession) : [];
    for (const l of leaves) if (!add(l.source)) from(l.id);   // a told wire without a sentence of the dialogue is the price list
    const have = new Set(leaves.map((l) => l.id));
    for (const id of ids ?? []) {
      if (have.has(id)) continue;
      const w = d.isession.memory.get(id);
      if (!w) continue;
      if (!add(w.entries.find((e) => e.key === 'core.source')?.value?.v)) from(id);
    }
    return this._knownParts(said, kb);
  }

  _knownParts(said, kb) {
    if (!said.length && !kb.length) return [];
    const phrase = kb.length > 1 ? `${kb.slice(0, -1).join(', ')} and ${kb.at(-1)}` : kb[0];
    if (!said.length) return [{ text: ` I worked that out from ${phrase}.`, translate: true }];
    const out = [{ text: ' I worked that out from what you told me: ', translate: true }];
    said.forEach((q, i) => { if (i) out.push({ text: i === said.length - 1 ? ' and ' : ', ', translate: true }); out.push(q); });
    if (kb.length) out.push({ text: ` and from ${phrase}`, translate: true });
    out.push({ text: '.', translate: false });
    return out;
  }

  /** End of turn: when the turn changed the state of a world, keep what is needed to take it back (undo, repair). */
  commitTurn({ turn, text, before, kind = null }) {
    const st = this.dialog.isession.state;
    const frames = this.frames.filter((f) => f.turn === turn);
    const rsMark = this.dialog.isession.rs?.markOf(turn);   // matrix reasoner (spec 15): the library as it was before this turn
    // a question only creates the (lazy) state of a world on first use: that is no action to undo
    const onlyQuestions = frames.length > 0 && frames.every((f) => f.kind === 'question');
    const worlds = Object.keys(st).filter((id) => !NO_TOPIC.has(id) && JSON.stringify(st[id]) !== before[id] && !(onlyQuestions && before[id] === undefined));
    if (!worlds.length) return null;
    if (!frames.length) {   // a game's turn (games keep their own state machines: no frames)
      if (kind === 'undo') {
        const w = worlds.find((x) => x.startsWith('games.')) ?? worlds[0], prev = this.prevByWorld?.[w];
        this.redoStack.push({ turn, worlds, pre: Object.fromEntries(worlds.map((id) => [id, before[id]])), act: null, say: prev && !/undo|take back|revert|retract|rewind/i.test(prev.text) ? { text: prev.text, reply: prev.reply, turn: prev.turn } : null });
        if (this.redoStack.length > 10) this.redoStack.shift();
      } else if (kind !== 'redo' && kind !== 'keep') this.redoStack = [];
      return null;
    }
    if (frames.some((f) => /undo/i.test(`${f.patternId} ${f.op}`))) {   // the world took the last action back itself: what it took out is kept for "redo"
      const act = this.actions.shift();
      this.redoStack.push({ turn, worlds, pre: Object.fromEntries(worlds.map((id) => [id, before[id]])), act: act ?? null });
      if (this.redoStack.length > 10) this.redoStack.shift();
      return null;
    }
    if (frames.some((f) => /redo/i.test(`${f.patternId} ${f.op}`))) {   // the world's own redo ran: the action it put back is the newest again, and the list is spent
      const top = this.redoStack.pop();
      if (top?.act && !top.whole) this.actions.unshift(top.act);
      this.redoStack = [];
      return null;
    }
    this.redoStack = [];   // a new action makes what was undone final
    const act = { turn, text, worlds, before: Object.fromEntries(worlds.map((id) => [id, before[id]])), after: Object.fromEntries(worlds.map((id) => [id, JSON.stringify(st[id])])), frames: frames.slice().reverse(), rsMark };
    this.actions.unshift(act);
    this.actions.length = Math.min(this.actions.length, 10);
    return act;
  }

  /**
   * Puts the world(s) of an action back to what they were before it. With the matrix reasoner (spec 15) the library is rewound to its mark of that turn (the
   * state of its worlds is derived from it, so state and library cannot diverge); otherwise the saved state is restored. Returns a function that undoes it.
   */
  _back(act) {
    const d = this.dialog, rs = d.isession.rs;
    if (rs && act.rsMark) {
      // the library is rewound; the state of a world that does not derive it from the library (no `toState`) is restored from the snapshot (spec 15, stage 2)
      const own = act.worlds.filter((w) => !rs.reasoner.stateOf.has(w));
      const now = Object.fromEntries(own.map((w) => [w, JSON.stringify(d.isession.state[w])]));
      const again = rs.rewind(act.rsMark, d.isession);
      this._setState(Object.fromEntries(own.map((w) => [w, act.before[w]])));
      return () => { again(); this._setState(now); };
    }
    const now = Object.fromEntries(act.worlds.map((w) => [w, JSON.stringify(d.isession.state[w])]));
    this._setState(act.before);
    return () => this._setState(now);
  }

  _setState(map) {
    const st = this.dialog.isession.state;
    for (const [id, json] of Object.entries(map)) {
      const cur = (st[id] ??= {});
      for (const k of Object.keys(cur)) delete cur[k];
      // a world whose state did not exist before the action (it is created lazily by its first use) has no snapshot: it goes back to empty
      if (json !== undefined) Object.assign(cur, JSON.parse(json));
    }
  }

  /** The newest effectful action, when it is recent enough to be what "that" means. */
  _recentAction(maxAge = 3) {
    const a = this.actions[0];
    return a && this.dialog._msg - a.turn <= maxAge ? a : null;
  }

  /**
   * What "no, I meant ..." corrects: the newest effectful action, or (when the newest understood request was a question or changed nothing)
   * that request as a read-only pseudo-action (no worlds to restore, so a repair simply redoes the sentence).
   */
  _repairable(maxAge = 3) {
    const a = this._recentAction(maxAge);
    const f = this.frames[0];
    if (f && this.dialog._msg - f.turn <= maxAge && (!a || f.turn > a.turn)) return { turn: f.turn, text: f.text, worlds: [], before: {}, after: {}, frames: [f], readOnly: true };
    return a;
  }

  /** Take back the effect of an action (restores the states it changed). */
  undoAction(act) {
    if (!act) return false;
    this._back(act);
    this.actions = this.actions.filter((x) => x !== act);
    this.frames = this.frames.filter((f) => f.turn !== act.turn);
    return true;
  }

  // ---- referents (spec 11 section 8) ---------------------------------------------------------------------------------------------

  /** Referents a world lists through its `referents(ctx)` hook (optionally for a state snapshot, JSON). */
  _refs(world, stateJson = null) {
    const d = this.dialog;
    const r = d.engine.interp.hook(d.isession, world, 'referents', {}, { state: stateJson ? JSON.parse(stateJson) : null });
    return Array.isArray(r) ? r : [];
  }

  /** The world whose objects "the red one" points at: the open tab, the last frame, the recent topics (the first that has referents). */
  _refWorld() {
    const { set } = this.dialog.engine;
    const has = (w) => w && typeof set.get(w)?.ops?.referents === 'function';
    const ctx = this.dialog.context();
    for (const w of [ctx.tabWorld, this.frames[0]?.world, ...this.topics, ...set.list().map((x) => x.id)]) if (has(w) && this._refs(w).length) return w;
    return null;
  }

  _targetKind() {
    const a = this._recentAction();
    const w = a?.worlds.find((x) => this.dialog.engine.set.get(x)?.ops?.referents);
    if (!w) return null;
    const before = this._refs(w, a.before[w]);
    const changed = this._refs(w).filter((r) => { const b = before.find((x) => x.id === r.id); return !b || b.sig !== r.sig; });
    return changed[0]?.kind ?? null;
  }

  // ---- meta intents ----------------------------------------------------------------------------------------------------------------

  /**
   * Conversational acts that are not requests of a world (spec 11 sections 6-14): cancellation, repeat and explain, feedback, topic
   * return, list-entry mode, repairs of the last action, degree fragments, attribute and ordinal references, choice questions.
   * Returns null (route normally) or one of
   *   { reply, info, feedback? }            a direct answer;
   *   { rewrite, info, prefix? }            a rewritten sentence for the normal pipeline;
   *   { pre: { res, info }, prefix? }       an already formalized sentence (same shape as ellipsis).
   */
  async meta(text, pend, sid) {
    budget.tick('discourse.meta');
    const d = this.dialog;
    const t = plain(text);
    if (!t) return null;
    // 1. the answer to a question this layer asked
    if (pend?.type === 'choice') { const r = this._answerChoice(pend, text); if (r) return r; }
    if (pend?.type === 'offer') {
      const y = this.lang.yesNo(text);
      if (y === 'yes' && pend.accept === 'undo') { const a = pend.action; const said = a?.frames[0]?.reply; return this.undoAction(a) ? this._say(said ? [{ text: 'OK, I undid it: ', translate: true }, this._shownOr(a.frames[0].turn, said), { text: '.', translate: false }] : [{ text: 'OK, I undid it.', translate: true }], { kind: 'offer', accept: 'undo', of: a.text }) : null; }
      if (y === 'yes' && pend.accept === 'undoTo') return this._undoTo(pend);
      if (y === 'yes' && pend.accept === 'rewrite') return { rewrite: pend.rewrite, info: { kind: 'offer', accept: 'rewrite', rewrite: pend.rewrite, world: pend.world } };
      if (y === 'no' || /^(?:no|nope|nah|not now|not really)(?: (?:thanks|thank you|leave it|keep it|its fine|never mind|leave it as it is|keep it as it is|leave it alone|leave it that way|keep it that way|its ok|its okay))?$/.test(t)) return { reply: 'OK, I will leave it as it is.', info: { kind: 'offer', declined: true } };
    }
    if (pend?.type === 'repair') { const r = await this._repair({ ...pend, content: plain(text) }, sid); if (r) return r; }
    // 1b. a bare yes/no that answers nothing: no pending question here, no list mode and no game that asks yes/no questions
    if (!pend && !this.list) {
      const bare = BARE_YES_NO[t];
      if (bare && !this._gameAsksYesNo()) return { reply: `${bare === 'yes' ? 'Yes' : 'No'} to what? You can ask me a question, give me a command, or say "help" to see what I can do.`, info: { kind: 'bare', answer: bare } };
    }
    // discussion commands (spec 13 section 8): only "new discussion", "my discussions" and a reference that names an existing discussion
    if (!this.list) { const ac = runDiscussionCommand(d, text, d._msg); if (ac) return ac; }
    // everything the session timeline held has been taken back: say so (a world's own "undo" would answer for itself, or another world's, whatever its tab)
    if (UNDO.test(t) && d.isession.rs && !d.isession.rs.turns.length && d.isession.rs.undone > 0 && !(this.actions[0]?.turn > d.isession.rs.undoneAt)) return { reply: 'There is nothing more to undo.', status: 'missing', info: { kind: 'undo', of: null, via: 'core.matrix' } };
    // UNDO-REDO (spec 15): "redo", "undo all of that" / "undo the whole message", "undo the sun" (a named earlier step)
    { const ur = this._undoRedo(text); if (ur) return ur; }
    // matrix reasoner (spec 15): "undo that" takes back what the turn before told the library (a purchase, a statement); the money and the counts follow
    if (UNDO.test(t)) { const mu = this._matrixUndo(text); if (mu) return mu; }
    // ops reasoner: "No, she gives him 4." revises the statement just made
    { const cf = await this._correctFact(text, sid); if (cf) return cf; }
    // "Why do I have nothing left?", "why is milk done?": the worlds that can explain the named fact answer from what is known
    if (WHY_FACT.test(t)) { const wf = this._whyFact(t); if (wf) return wf; }
    // chat spellings of short words ("bk to the doc", "nxt") are read as the word for the recognizers; the sentence itself is passed on unchanged
    const spelled = String(text).replace(/[A-Za-z]+/g, (w) => SHORT_TYPOS[w.toLowerCase()] ?? w);
    const c0 = classify(spelled, { lang: this.lang, hasAction: !!this._repairable(), listMode: !!this.list });
    // a world on the open tab may own a question of the "explain" kind (the Talk tab answers "how do you know?" with its own card): `ownsExplain(ctx, { text })` returns true
    const c = c0?.intent === 'explain' && this._tabOwns('ownsExplain', t) ? null : c0;
    // a lone "lol" / "hmm" / "ok" is not a command and not a list item: nothing happens (no world gets to read it as a name, an item or a word)
    if (c?.intent === 'backchannel' && !pend && !this._gameAsksYesNo()) return { reply: 'Mm-hm. Tell me what you would like to do, or say "help".', status: 'unparsed', info: { kind: 'backchannel' } };
    // 2. list-entry mode: every plain item is added to the list until "that's all"
    if (this.list) {
      if (c?.intent === 'list.end') return this._listEnd();
      if (c?.intent === 'cancel') { const l = this.list; this.list = null; return { reply: `OK, I stopped the ${l.list} list. What is on it stays.`, info: { kind: 'cancel', dropped: 'list' } }; }
      const ws = t.split(' ');
      if (!c && ws.length <= 5 && !/[?]/.test(text) && !META_SKIP.has(ws[0])) {
        const list = this.list; list.n++;
        return { rewrite: `Add ${text.trim().replace(/[.!]+$/, '')} to my ${list.list} list`, info: { kind: 'list', list: list.list, entry: text.trim(), n: list.n, world: list.world } };
      }
      if (!c) this.list = null;   // a real command or question ends the list mode silently
    }
    if (c) {
      switch (c.intent) {
        case 'cancel': return this._cancel(pend);
        case 'feedback': return this._feedback(t);
        case 'repeat': return this._repeat();
        case 'explain': return this._explain(t);
        case 'topic': return this._topic(c.target, sid, c.digression) ?? await this._backTo(text, sid);
        case 'list.start': return this._listStart(c.list, sid);
        case 'degree': {
          // "a bit slower" may be a complete sentence of the open tab's world; only "more"/"less" and unread fragments continue the last frame
          if (c.degree.type !== 'more' && c.degree.type !== 'less') { const w = await this._tryAny(text, sid); const here = [d.context().tabWorld, d.context().lastWorld]; if (w && here.includes(w)) return null; }
          return this._degree(c.degree, sid);
        }
        case 'repair': { const r = await this._repair({ how: c.how, content: c.content, restate: c.restate }, sid); if (r) return r; break; }
        default: break;
      }
    }
    return this._references(text, sid);
  }

  // ---- undo, redo, the whole message, a named step (UNDO-REDO, spec 15) ------------------------------------------------------------

  /** The actions and frames of a turn leave the memory once no entry of the timeline holds a request of it any more. */
  _forget(turn) {
    const rs = this.dialog.isession.rs;
    if (rs?.turns.some((t) => t.turn === turn)) return;
    this.actions = this.actions.filter((a) => a.turn !== turn); this.frames = this.frames.filter((f) => f.turn !== turn);
  }

  /**
   * "Undo that" with the matrix reasoner: a tab world that counts steps answers for itself, else the newest entry of the timeline (one request of the user) goes back
   * and the reply names it. Null when there is nothing to take back that way (the world's own undo or the "nothing to undo" answers follow).
   */
  _matrixUndo(text) {
    const d = this.dialog, rs = d.isession.rs;
    if (!(rs?.canUndo(d._msg) && !(this.actions[0]?.turn > rs.turns.at(-1).turn))) return null;   // not when a newer action of a world without library state is what "that" means
    // a tab world whose own undo counts views or steps (docs.editor, docs.reader: a selection move is not an entry) answers for itself, in its words
    const gw = [...rs.reasoner.undoOf.values()].find((w) => w.id === d.context().tabWorld && w.isView);
    if (gw && rs.turns.at(-1).worlds?.includes(gw.id)) {   // the newest request was this world's (a request of another world is undone by the generic step below)
      const env = rs.undoAction(gw, d.isession);
      if (env.undoneTurn != null) this._forget(env.undoneTurn);
      rs.undoneAt = d._msg;
      if (env.status === 'supported' && env.value) return { reply: env.value, info: { kind: 'undo', of: null, via: 'core.matrix' } };
    }
    // one timeline across the worlds' instances (spec 15): the newest entry (one request of the user) goes back, whichever world it belonged to, and the reply says
    // what it was, in the words of that world (a game's "took back your last guess") or by quoting what the user said (their own words, never the English reading)
    const last = rs.turns.at(-1), turn0 = last.turn;
    const undoWorld = last.worlds?.[0] ?? null;
    const noted = (reply) => { if (undoWorld && reply) this.noteWorld(undoWorld, text, reply, d._msg); };   // "What did you do?" afterwards names the undo, as it does when the world undoes by itself
    const act0 = this.actions.find((a) => a.turn === turn0);
    const r = rs.undoLast(d.isession, last.said ?? act0?.text ?? d.sources.get(`msg${turn0}`)?.english ?? null);
    const turn = r.turn;
    rs.undoneAt = d._msg;
    this._restoreOwn(act0, last.snap);
    this._forget(turn);
    noted(r.value);
    if (r.quote) return this._say([{ text: 'OK, I took that back: ', translate: true }, this._quoted(turn, r.quote, r.orig), { text: '.', translate: false }], { kind: 'undo', of: r.quote, via: 'core.matrix' });
    return { reply: r.value, info: { kind: 'undo', of: act0?.text ?? null, via: 'core.matrix' } };
  }
  /** The worlds that do not derive their state from the library go back to the state before the step (its own snapshot, else the one of the turn's action). */
  _restoreOwn(act, snap = null) {
    const rs = this.dialog.isession.rs;
    if (!rs) return;
    const own = [...new Set([...(act?.worlds ?? []), ...Object.keys(snap ?? {})])].filter((w) => !rs.reasoner.stateOf.has(w));
    const map = {};
    for (const w of own) { const v = snap && w in snap ? snap[w] : act?.before?.[w]; if (v !== undefined || (!snap && act)) map[w] = v; }
    this._setState(map);
  }

  /** "redo", "undo all of that", "undo the sun": the three shapes of UNDO-REDO that are not a plain undo. Null for anything else. */
  _undoRedo(text) {
    const lang = this.lang;
    if (lang.redo?.(text)) return this._redo();
    if (lang.undoAll?.(text)) return this._undoAll(text);
    const named = lang.undoNamed?.(text);
    return named ? this._undoNamed(text, named) : null;
  }

  /** What a redo says: the quote of the request that came back. */
  _redoSay(quote, orig, turn) {
    return quote ? this._say([{ text: 'OK, I did it again: ', translate: true }, this._quoted(turn, quote, orig), { text: '.', translate: false }], { kind: 'redo', of: quote }) : { reply: 'OK, I did it again.', info: { kind: 'redo' } };
  }
  _redo() {
    const d = this.dialog, rs = d.isession.rs;
    const nothing = { reply: 'There is nothing to redo.', status: 'missing', info: { kind: 'redo', of: null } };
    // the library's own undos (a generic "undo that", a tab world's undo): the timeline goes forward again
    if (rs) {
      const r = rs.redoLast(d.isession);
      if (r) {
        if (r.quote && /^OK, I did it again: /.test(r.value)) return this._redoSay(r.quote, r.orig, r.turn);
        return { reply: r.value, info: { kind: 'redo', of: r.quote ?? null, via: 'core.matrix' } };
      }
    }
    // what a world's own undo (operations: "undo my move") or "undo all of that" took out: the states before it are put back
    const top = this.redoStack.at(-1);
    const tabWorld = d.context().tabWorld;
    const ownRedo = !!(tabWorld && d.engine.set.get(tabWorld)?.redoAction);   // a tab world with its own redo answers "redo" itself (its operations)
    if (!top) return ownRedo ? null : nothing;   // the tab world answers itself ("There is nothing to redo." in its words)
    if (ownRedo && !rs && !top.whole) return null;
    this.redoStack.pop();
    const act = top.act;
    if (rs && !top.whole && rs.turns.at(-1)?.turn === top.turn) { rs.undoLast(d.isession, null); rs.redos.pop(); this._restoreOwn(null, top.pre); }   // (a redo is not itself redone)   // the undo was a step of the timeline: take that step back
    else this._setState(top.pre);
    if (act) this.actions.splice(Math.min(top.at ?? 0, this.actions.length), 0, act);
    if (!act && top.say) { const w = top.worlds.find((x) => x.startsWith('games.')); if (w) this.noteWorld(w, top.say.text, top.say.reply, top.say.turn); return this._redoSay(top.say.text, null, top.say.turn); }
    return this._redoSay(act?.text, null, act?.turn);
  }

  /** "undo all of that" / "undo the whole message": every request of the last message goes back, as one step. */
  _undoAll(text) {
    const d = this.dialog, rs = d.isession.rs;
    if (rs?.turns.length && rs.canUndo(d._msg) && !(this.actions[0]?.turn > rs.turns.at(-1).turn)) {
      if (rs.lastMessage().length <= 1) return this._matrixUndo(text);   // a message of one request: that is a plain undo
      const act0 = this.actions.find((a) => a.turn === rs.turns.at(-1).turn);
      const first = rs.lastMessage().at(-1);
      const r = rs.undoMessage(d.isession);
      rs.undoneAt = d._msg;
      this._restoreOwn(act0, first.snap);
      this._forget(r.turn);
      const src = d.sources.get(`msg${r.turn}`);
      const what = src?.original ?? r.said.join(' and ');
      return this._say([{ text: `OK, I took back the whole message (${r.count} requests): `, translate: true }, this._quoted(r.turn, what), { text: '.', translate: false }], { kind: 'undo', of: what, via: 'core.matrix', whole: r.count });
    }
    const act = this.actions[0];
    if (!act || act.readOnly) return { reply: rs?.undone ? 'There is nothing more to undo.' : 'There is nothing to undo.', status: 'missing', info: { kind: 'undo', of: null } };
    const now = Object.fromEntries(act.worlds.map((w) => [w, JSON.stringify(d.isession.state[w])]));
    this.undoAction(act);
    this.redoStack.push({ turn: act.turn, worlds: act.worlds, pre: now, act, whole: true, at: 0 });
    return this._say([{ text: 'OK, I took back the whole message: ', translate: true }, this._quoted(act.turn, act.text), { text: '.', translate: false }], { kind: 'undo', of: act.text, whole: true });
  }

  /** "undo the sun": an earlier request that is independent of the later ones goes back alone; otherwise the later ones are named and the user is asked. */
  _undoNamed(text, words) {
    const d = this.dialog, rs = d.isession.rs;
    const norm = (w) => String(w).toLowerCase().replace(/(?:ies)$/, 'y').replace(/(?:es|s)$/, '');
    const list = (xs) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
    const q = (t) => `"${String(t ?? 'a step').replace(/[.!?\s]+$/, '')}"`;
    if (rs?.turns.length) {
      const k = rs.findStep(words);
      if (k < 0) return null;
      if (k === rs.turns.length - 1) return this._matrixUndo(text);
      const e = rs.turns[k], deps = rs.dependents(k);
      if (!deps.length) {
        const act0 = this.actions.find((a) => a.turn === e.turn);
        const r = rs.undoStep(d.isession, k);
        rs.undoneAt = d._msg;
        this._restoreOwn(act0, e.snap);
        this._forget(r.turn);
        return this._say([{ text: 'OK, I took back ', translate: true }, this._quoted(r.turn, r.said ?? words.join(' '), r.orig), { text: '; what you did after it stays.', translate: true }], { kind: 'undo', of: r.said, via: 'core.matrix', named: true });
      }
      this.pending = { type: 'offer', accept: 'undoTo', world: e.worlds[0] ?? null, expected: 'yes/no', question: 'Shall I take them all back?', turn: d._msg };
      this._undoToTarget = e;   // not persisted: after a restart the question is stale
      return this._say([{ text: 'To take back ', translate: true }, this._quoted(e.turn, e.said ?? words.join(' '), e.orig), { text: ` I would also have to take back ${list(deps.map((t) => q(t.orig ?? t.said)))}. Shall I take them all back? Say "yes" or "no".`, translate: true }], { kind: 'offer', accept: 'undoTo', of: e.said, later: deps.map((t) => t.said) });
    }
    // operations: the actions of the last messages (one per message); the worlds they changed are what depends on what
    const j = this.actions.findIndex((a) => { const have = new Set(String(a.text ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean).flatMap((w) => [w, norm(w)])); return words.every((w) => have.has(norm(w))); });
    if (j < 0) return null;
    if (j === 0) return this._undoAll(text);
    const act = this.actions[j], deps = this.actions.slice(0, j).filter((a) => a.worlds.some((w) => act.worlds.includes(w)));
    if (!deps.length) {
      const now = Object.fromEntries(act.worlds.map((w) => [w, JSON.stringify(d.isession.state[w])]));
      this._back(act);
      this.actions = this.actions.filter((x) => x !== act); this.frames = this.frames.filter((f) => f.turn !== act.turn);
      this.redoStack.push({ turn: act.turn, worlds: act.worlds, pre: now, act, whole: true, at: j - 1 });
      return this._say([{ text: 'OK, I took back ', translate: true }, this._quoted(act.turn, act.text), { text: '; what you did after it stays.', translate: true }], { kind: 'undo', of: act.text, named: true });
    }
    this.pending = { type: 'offer', accept: 'undoTo', actionTurn: act.turn, world: act.worlds[0] ?? null, expected: 'yes/no', question: 'Shall I take them all back?', turn: d._msg };
    return this._say([{ text: 'To take back ', translate: true }, this._quoted(act.turn, act.text), { text: ` I would also have to take back ${list(deps.map((a) => q(a.text)))}. Shall I take them all back? Say "yes" or "no".`, translate: true }], { kind: 'offer', accept: 'undoTo', of: act.text, later: deps.map((a) => a.text) });
  }
  /** "yes" to "I would also have to take back ...": the step and everything after it go back. */
  _undoTo(pend) {
    const d = this.dialog, rs = d.isession.rs;
    const stale = { reply: 'That has changed since I asked, so I left everything as it is.', info: { kind: 'offer', accept: 'undoTo', stale: true } };
    if (pend.actionTurn === undefined) {
      const e = this._undoToTarget;
      this._undoToTarget = null;
      const k = e && rs ? rs.turns.indexOf(e) : -1;
      if (k < 0) return stale;
      const acts = this.actions.filter((a) => a.turn >= e.turn);
      const r = rs.undoThrough(d.isession, k);
      rs.undoneAt = d._msg;
      for (const a of acts) this._restoreOwn(a, a.turn === e.turn ? e.snap : null);
      for (const turn of new Set(acts.map((a) => a.turn).concat(r.turn))) this._forget(turn);
      return this._say([{ text: 'OK, I took back ', translate: true }, this._quoted(r.turn, r.said ?? '', r.orig), { text: ' and what came after it.', translate: true }], { kind: 'undo', of: r.said, via: 'core.matrix', through: true });
    }
    const j = this.actions.findIndex((a) => a.turn === pend.actionTurn);
    if (j < 0) return stale;
    const act = this.actions[j];
    const now = Object.fromEntries([...new Set(this.actions.slice(0, j + 1).flatMap((a) => a.worlds))].map((w) => [w, JSON.stringify(d.isession.state[w])]));
    for (let i = 0; i <= j; i++) this._back(this.actions[i]);   // the oldest `before` of a world is applied last
    const gone = this.actions.slice(0, j + 1);
    this.actions = this.actions.slice(j + 1); this.frames = this.frames.filter((f) => !gone.some((a) => a.turn === f.turn));
    this.redoStack.push({ turn: act.turn, worlds: Object.keys(now), pre: now, act, whole: true, at: 0 });
    return this._say([{ text: 'OK, I took back ', translate: true }, this._quoted(act.turn, act.text), { text: ' and what came after it.', translate: true }], { kind: 'undo', of: act.text, through: true });
  }

  /** True while a game that asks or expects yes/no is on: the guessing game in progress, or a game that is the active game or tab of the host. */
  _gameAsksYesNo() {
    const st = this.dialog.isession.state, ctx = this.dialog.context();
    if (['asking', 'guessing', 'learning'].includes(st['games.guess']?.phase)) return true;
    return !!ctx.gameWorld || ['guess', 'tictactoe', 'hangman', 'chess'].includes(ctx.activeTab);
  }

  _cancel(pend) {
    const dropped = pend ? pend.type : this.list ? 'list' : null;
    this.list = null;
    return { reply: dropped ? 'OK, never mind. I dropped that question; nothing was changed.' : 'OK, never mind.', info: { kind: 'cancel', dropped } };
  }

  /** The game the user is playing now (open tab or last world), or null. */
  _activeGame() {
    const ctx = this.dialog.context();
    return [ctx.gameWorld, ctx.tabWorld, this.lastWorld].find((w) => w?.startsWith('games.')) ?? null;
  }

  /**
   * "that's wrong" / "not what I asked": apologise and, when an action can be taken back, offer to undo it. Inside a game the game decides:
   * chess and tic-tac-toe offer to take back the last move (the world's own "undo", through the normal pipeline); the guessing game keeps its
   * answers (the complaint is not a "no") and says how to correct one; when the game itself asked the question ("is it a dog?" and
   * "that's wrong") or hangman is on, the phrase is the game's own answer and goes to the world.
   */
  _feedback(t = '') {
    const game = this._activeGame();
    const st = this.dialog.isession.state;
    if (game) {
      const phase = st[game]?.phase;
      if (game === 'games.hangman' || (game === 'games.guess' && phase !== 'asking')) return null;   // an answer of the game
      const info = { kind: 'feedback', polarity: 'negative', game };
      if (game === 'games.guess' && /^(?:no|nope|nah|oh no)\b/.test(t)) return null;   // "no, that's wrong" answers the question with a no
      if (game === 'games.guess') return { reply: 'Oh no, sorry about that. If I counted one of your answers wrongly, tell me which one, for example "wait, I meant yes".', feedback: 'negative', info };
      const moved = (st[game]?.history?.length ?? 0) > 0 || (st[game]?.board ?? []).some((c) => c);
      if (!moved) return { reply: 'Oh no, sorry about that. Please tell me what you meant.', feedback: 'negative', info };
      this.pending = { type: 'offer', accept: 'rewrite', rewrite: 'undo', world: game, expected: 'yes/no', question: 'Shall I take back the last move?', turn: this.dialog._msg };
      return { reply: 'Oh no, sorry about that, I got it wrong. Shall I take back the last move? Say "yes" to undo it, or tell me what you meant.', feedback: 'negative', info: { ...info, offer: 'undo' } };
    }
    const a = this._recentAction();
    const last = this.lastAnswer;
    if (!last && !a) return null;
    let reply = 'Oh no, sorry about that, I got it wrong.';
    if (a) {
      this.pending = { type: 'offer', accept: 'undo', action: a, world: a.worlds[0], expected: 'yes/no', question: 'Shall I undo it?', turn: this.dialog._msg };
      reply += ' Shall I undo it? Say "yes" to undo, or tell me what you meant.';
    } else {
      // nothing was changed (a question): nothing to take back, but a "no" / "not now" still answers the apology
      this.pending = { type: 'offer', accept: null, world: this.lastWorld, expected: 'yes/no', question: 'What did you mean?', turn: this.dialog._msg };
      reply += ' Please say it again in other words, or tell me what you meant.';
    }
    return { reply, feedback: 'negative', info: { kind: 'feedback', polarity: 'negative', of: last?.text ?? null, offer: a ? 'undo' : null } };
  }

  _repeat() {
    const last = this.lastAnswer;
    if (!last) return null;
    return { reply: last.text, info: { kind: 'repeat', of: last.turn } };
  }

  /** True when the world of the open tab exports the hook `name` and it says yes to this message (a read-only host hook, spec 07). */
  _tabOwns(name, t) {
    const tw = this.dialog.context().tabWorld;
    return !!tw && this.dialog.engine.interp.hook(this.dialog.isession, tw, name, { text: t }) === true;
  }

  _explain(t = '') {
    // "what did you do?" asks about the last thing that CHANGED something (a question later on changed nothing); "why?" asks about the newest turn
    const doing = /^what (?:did you|have you) (?:just )?(?:do|done|change)/.test(t);
    // inside a running game "why?" is about the game's last question, not about the facts told before it
    if (!doing) { const tw = this.dialog.context().gameWorld; if (tw && /^games\./.test(tw)) { const r = this.dialog.engine.interp.hook(this.dialog.isession, tw, 'why', { text: 'why' }); const said = r?.text ?? (typeof r?.value === 'string' ? r.value : null); if (said) return this._say([{ text: said, translate: true }], { kind: 'explain', of: t, world: tw, from: [] }); } }
    // the newest turn only told a fact: "why?" asks about the world that fact belongs to, answered from what is known (hook `why` of the world)
    if (!doing && this.lastFacts && this.dialog._msg - this.lastFacts.turn <= 1 && this.lastFacts.turn >= (this.frames[0]?.turn ?? -1)) { const wf = this._whyFact('why'); if (wf) return wf; }
    // matrix strategy: the newest turn was a statement to a world that explains its own facts (`why` of its fns.mjs: the user profile)
    if (!doing && this.dialog.isession.rs?.reasoner.whyOf.size) {
      const fr = this.frames[0], ic0 = this.icptTurn;
      const last = ic0 && (!fr || ic0.turn > fr.turn) ? { turn: ic0.turn, text: ic0.text, world: ic0.world } : fr ? { turn: fr.turn, text: fr.text, world: fr.world } : null;
      if (last && this.dialog._msg - last.turn <= 1 && this.dialog.isession.rs.reasoner.whyOf.has(last.world) && !/\?$/.test(String(last.text).trim())) { const wf = this._whyFact('why', last.world); if (wf) return wf; }
    }
    const eff = (() => { const x = this._recentAction(6); return x && x.frames.some((fr) => !/\?$/.test(fr.text) && !QUESTION_START.test(fr.text)) ? x : null; })();
    const a0 = doing && eff ? eff : this._repairable(6), a = a0?.readOnly ? null : a0;
    const f = a0?.frames[0] ?? this.frames[0];
    const ic = this.icptTurn;
    const sayText = (x) => String(x ?? '').trim().replace(/[.!\s]+$/, '');
    // a modal interceptor answered the newest turn (docs.reader questions, avatar dictation ...): no frame, but the turn is explained the same way
    if (ic && (!f || ic.turn > f.turn) && this.dialog._msg - ic.turn <= 6 && !(doing && eff && eff.turn > ic.turn)) {
      const asked = sayText(ic.text);
      const wasQuestion = /\?$/.test(ic.text) || QUESTION_START.test(asked);
      const imperative = !wasQuestion && IMPERATIVE_START.test(asked);
      const own = this._translated(ic.turn);   // typed in another language: the user's words are quoted, not re-said in English
      const what = imperative && !own ? `You asked me to ${asked.replace(/^please\s+/i, '').replace(/^(\w)/, (c) => c.toLowerCase())}` : `You said "${asked}"`;
      const head = imperative && !own ? [{ text: `${what}, so I did it. What I answered: `, translate: true }] : [{ text: 'You said ', translate: true }, this._quoted(ic.turn, asked), { text: `, so ${wasQuestion ? 'I answered it' : 'I did it'}. What I answered: `, translate: true }];
      return this._say([...head, this._shownOr(ic.turn, ic.reply)], { kind: 'explain', of: ic.text, world: ic.world, changed: [] });
    }
    if (!f) {
      // chat, navigation and games leave no frame: explain from the last thing this session said and answered
      const lw = this.lastByWorld[this.lastWorld];
      if (!lw) return doing ? null : this._whyFact('why');   // no frame and nothing answered: a world that holds facts may still say what it knows
      if (!doing && !lw.reply) return this._whyFact('why') ?? null;
      return this._say([{ text: 'You said ', translate: true }, this._quoted(lw.turn, sayText(lw.text)), { text: ', so I answered it. What I answered: ', translate: true }, this._shownOr(lw.turn, lw.reply)], { kind: 'explain', of: lw.text, world: this.lastWorld, changed: [] });
    }
    // plain wording for the user; ids (rule, operation) stay in info and the trace only
    const asked = String(f.text ?? '').trim().replace(/[.!\s]+$/, '');
    const isQuestion = /\?$/.test(asked) || QUESTION_START.test(asked);
    const imperative = !isQuestion && IMPERATIVE_START.test(asked);
    const what = imperative ? `You asked me to ${asked.replace(/^please\s+/i, '').replace(/^(\w)/, (c) => c.toLowerCase())}` : `You said "${asked}"`;
    const info = { kind: 'explain', of: f.text, world: f.world, pattern: f.patternId, op: f.opId, changed: a?.worlds ?? [] };
    // what the user said (as typed) and what was answered (as it was shown): parts, so the Romanian reply is built from the Romanian words
    if (!imperative) {
      const shown = this.shown[f.turn];
      const parts = [{ text: 'You said ', translate: true }, this._quoted(f.turn, asked), { text: `, so ${a ? 'I did it' : 'I answered it'}.`, translate: true }];
      if (f.reply) parts.push({ text: ' What I answered: ', translate: true }, shown ? { text: shown, translate: false } : { text: f.reply, translate: true });
      return this._say([...parts, ...this._because(f)], info);
    }
    const own = this._translated(f.turn);
    const head = own ? [{ text: 'You said ', translate: true }, this._quoted(f.turn, asked), { text: `, so ${a ? 'I did it' : 'I answered it'}.`, translate: true }] : [{ text: `${what}, so ${a ? 'I did it' : 'I answered it'}.`, translate: true }];
    if (f.reply) head.push({ text: ' What I answered: ', translate: true }, this._shownOr(f.turn, f.reply));
    return this._say([...head, ...this._because(f)], info);
  }

  /** The statements an answer rests on, as the user said them ("I worked it out from ..."); with the matrix reasoner they come from the library's explanation. */
  _because(f) { return f.from?.length ? this._known(f.from) : f.fromLater ? this._known(f.fromLater()) : []; }

  // ---- topic return --------------------------------------------------------------------------------------------------------------

  _topicWorld(target, digression = false) {
    const { set } = this.dialog.engine;
    if (!target && !digression) return this.topics.find((w) => this.lastByWorld[w]) ?? null;   // "continue": the newest topic
    if (!target) {
      // "where were we?": the conversation before the current digression (the newest topic that is not the world of the open tab), else the newest
      // the definition lives in ASTRA (spec 13 section 8): the most recent unfinished activity left for a digression
      return lastUnfinished({ topics: this.topics, lastByWorld: this.lastByWorld, here: this.dialog.context().tabWorld, lastTopic: this.lastTopic });
    }
    const asksGame = /\bgame\b/.test(target);   // "the animal game" is the guessing game, not the animals quiz
    const words = target.split(' ').filter((w) => !['game', 'tab', 'the', 'my', 'our', 'a', 'to', 'page', 'screen', 'window'].includes(w));
    if (!words.length) return null;
    let best = null, bestScore = 0, bestBonus = 0;
    for (const w of set.list()) {
      if (NO_TOPIC.has(w.id)) continue;
      const toks = new Set([...w.id.split('.'), ...(w.title ?? '').toLowerCase().split(/\W+/), ...(w.tab ? [w.tab.id, ...(w.tabAliases ?? w.tab.aliases ?? [])] : [])].map((x) => String(x).toLowerCase()).filter(Boolean));
      const score = words.filter((x) => toks.has(x) || toks.has(x.replace(/s$/, '')) || [...toks].some((k) => k.length > 3 && (x.startsWith(k) || k.startsWith(x) && x.length > 3))).length;
      const bonus = (asksGame && w.id.startsWith('games.') ? 2 : 0) + (this.topics.includes(w.id) ? 1 - this.topics.indexOf(w.id) / 10 : 0);   // game words, then the newest topic
      if (score > bestScore || (score === bestScore && score > 0 && bonus > bestBonus)) { best = w.id; bestScore = score; bestBonus = bonus; }
    }
    return bestScore === words.length ? best : null;   // every word must name the world ("back to the first chart" is not a topic)
  }

  _topic(target, sid, digression = false) {
    const d = this.dialog, { set, interp } = d.engine;
    const world = this._topicWorld(target, digression);
    if (!world) return null;
    const known = this.topics.includes(world);   // an earlier activity: going there is a return; a world never visited is a digression from the current one
    const w = set.get(world);
    const tab = w.tab?.id ?? BUILTIN_TAB[world] ?? null;
    if (tab && d.isession.state['ui.shell']?.activeTab !== tab) { try { interp.runAction(d.isession, 'ui.openTab', { tab }); } catch { /* the shell may be absent */ } }
    const sum = interp.hook(d.isession, world, 'topicSummary', {}) ?? interp.hook(d.isession, world, 'summary', {});
    const last = this.lastByWorld[world];
    const title = (w.title ?? world).replace(/\s*\(.*\)\s*$/, '');
    const parts = [`Back to ${title}.`];
    if (typeof sum === 'string' && sum) parts.push(sum);
    else if (last && last.reply == null) parts.push('You were last here a moment ago.')
    else if (last) parts.push(`Last time you said "${last.text}" and I answered: ${last.reply}`);
    else parts.push('Nothing has happened there yet.');
    this.lastTopic = known ? { world, turn: d._msg } : null;
    this._topicTurn = d._msg;
    this.topics = [world, ...this.topics.filter((x) => x !== world)].slice(0, 6);
    return { reply: parts.join(' '), info: { kind: 'topic', world, target: target ?? null, tab } };
  }

  /**
   * "back to the spider, how many legs does it have?" / "ok back to seasons, which season comes after summer": the words after "back to X," are the
   * request; X names the subject ("it" means "the spider"), not a world. Tried in order: the request with the pronoun replaced, the request alone.
   */
  async _backTo(text, sid) {
    const m = String(text).trim().match(/^(?:(?:ok|okay|so|and|now|well)[ ,]+)*(?:lets |let us )?(?:go |get |come )?back to (?:the |a |an |my )?([a-z][a-z -]*?)\s*[,:;-]\s*(.+?)[?.!]*$/i);
    if (!m) return null;
    const head = m[1].trim(), rest = m[2].trim();
    const cands = [];
    const pro = rest.match(/\b(it|that one|this one|that animal|this animal|that thing|this thing|them|those|these)\b/i);
    if (pro) for (const det of ['a', 'the']) cands.push(rest.slice(0, pro.index) + `${det} ${head}` + rest.slice(pro.index + pro[0].length));
    cands.push(rest);
    for (const cand of cands) {
      const seg = await this._readSeg(cand, sid);
      if (seg && !CLARIFY_PATTERN.test(seg.match?.patternId ?? '')) return { rewrite: cand, info: { kind: 'topic.lead', head, rewritten: cand } };
    }
    return null;
  }

  // ---- list-entry mode ---------------------------------------------------------------------------------------------------------------

  async _tryAny(text, sid) {
    const d = this.dialog;
    const form = d.isession.form;
    const snap = form.snapshot();
    let res = null;
    try { res = await d.engine.formalizers.rules.formalize(text, { ...this._opts(sid), worlds: d.engine.set }); } catch { res = null; }
    form.restore(snap);
    return res && res.segments.length === 1 && !res.segments[0].unparsed ? res.segments[0].match?.worldId ?? null : null;
  }

  /** The one fully read segment of `text` over all worlds (side-effect free), or null. */
  async _readSeg(text, sid) {
    const d = this.dialog;
    const form = d.isession.form;
    const snap = form.snapshot();
    let res = null;
    try { res = await d.engine.formalizers.rules.formalize(text, { ...this._opts(sid), worlds: d.engine.set }); } catch { res = null; }
    form.restore(snap);
    return res && res.segments.length === 1 && !res.segments[0].unparsed ? res.segments[0] : null;
  }

  async _listStart(raw, sid) {
    const list = /^(?:todo|to do|to-do|task|tasks|chore|chores|things to do)$/.test(raw) || !raw ? 'to-do' : raw.replace(/\s+/g, ' ');
    const world = await this._tryAny(`Add milk to my ${list} list`, sid);
    if (!world) return null;
    this.list = { list, world, n: 0 };
    return { reply: `OK, let's make your ${list} list. Tell me one thing at a time, and say "that's all" when you are done.`, info: { kind: 'list.start', list, world } };
  }

  _listEnd() {
    const l = this.list;
    this.list = null;
    if (!l.n) return { reply: `OK, no ${l.list} list then.`, info: { kind: 'list.end', list: l.list, n: 0 } };
    return { rewrite: `What is on my ${l.list} list`, prefix: `OK, your ${l.list} list is finished (${l.n} ${l.n === 1 ? 'entry' : 'entries'}).`, info: { kind: 'list.end', list: l.list, n: l.n, world: l.world } };
  }

  // ---- degree and comparatives on the last frame ---------------------------------------------------------------------------------------

  async _degree(deg, sid) {
    const frame = this.frames[0];
    if (!frame) return null;
    const cands = [];
    const ws = frame.text.replace(/[?!.]+$/, '').split(' ');
    const isDegreeWord = (w) => this.lang.COMPARATIVES.includes(w.toLowerCase()) || /^(left|right|up|down|higher|lower|more|less|forward|back|upward|downward|upwards|downwards)$/i.test(w);
    const slotT = frame.slots.find((x) => x.name === 't' || x.name === 'target') ?? null;
    const tText = slotT ? slotT.text : touchedCount(this._recentAction()) > 1 ? 'them' : 'it';   // P2: what the last action touched; several things are "them"
    const verb = /^(?:make|let|turn|get)$/i.test(ws[0]) ? ws[0] : 'Make';
    const adv = deg.adv ?? '';
    const join = (...xs) => xs.filter(Boolean).join(' ');
    const withDegreeWord = (replacement) => {
      // replace the last degree word of the frame (and the adverb in front of it) by `replacement`
      for (let i = ws.length - 1; i >= 0; i--) {
        if (!isDegreeWord(ws[i])) continue;
        let from = i;
        for (const a of ['a little bit', 'a tiny bit', 'just a bit', 'a bit', 'a little', 'a lot', 'so much', 'very much', 'slightly', 'much', 'way', 'even', 'far']) {
          const n = a.split(' ').length;
          if (ws.slice(i - n, i).join(' ').toLowerCase() === a) { from = i - n; break; }
        }
        return join(...ws.slice(0, from), replacement, ...ws.slice(i + 1));
      }
      return null;
    };
    if (deg.type === 'more' || deg.type === 'less') {
      const flip = { bigger: 'smaller', smaller: 'bigger', larger: 'smaller', higher: 'lower', lower: 'higher', left: 'right', right: 'left', up: 'down', down: 'up', taller: 'shorter', shorter: 'taller' };
      const lastDeg = [...ws].reverse().find(isDegreeWord)?.toLowerCase();
      if (lastDeg && deg.adv) { const c = withDegreeWord(join(adv, deg.type === 'less' && flip[lastDeg] ? flip[lastDeg] : lastDeg)); if (c) cands.push(c); }
      if (lastDeg && deg.type === 'less' && flip[lastDeg]) { const c = withDegreeWord(flip[lastDeg]); if (c) cands.push(c); }
      cands.push(frame.text.replace(/[?!.]+$/, ''));   // "more" without an adverb: do it once more
    } else if (deg.type === 'comparative') {
      const rep = join(adv, deg.comparative);
      // a size word does not replace a position word of the last frame ("bigger" after "move the houses higher" is a new size request about the same things)
      const POSITION = /^(left|right|up|down|higher|lower|forward|back|upward|downward|upwards|downwards)$/i;
      const lastWord = [...ws].reverse().find(isDegreeWord);
      const c = lastWord && POSITION.test(lastWord) !== POSITION.test(deg.comparative) ? null : withDegreeWord(rep);
      if (c) cands.push(c);
      cands.push(join(verb, tText, rep));
      cands.push(join(verb, 'it', rep));
    } else if (deg.type === 'times') {
      const phrase = deg.ref ? `${deg.factor === 2 ? 'twice' : deg.factor === 0.5 ? 'half' : `${deg.factor} times`} as ${deg.adj === 'size' ? 'big' : deg.adj} as the ${deg.ref}` : deg.text;
      cands.push(join(verb, tText, deg.ref ? `the same size as the ${deg.ref}` : phrase), join(verb, 'it', phrase));
    } else if (deg.type === 'same') {
      cands.push(join(verb, tText, `the same size as the ${deg.ref}`), join(verb, 'it', `the same size as the ${deg.ref}`));
    }
    const opts = this._opts(sid);
    for (const cand of [...new Set(cands)]) {
      const hit = await this._try(frame.world, cand, opts);
      if (!hit) continue;
      if (hit.res.segments[0].match.patternId === 'unknown') { this.dialog.isession.form.restore(hit.snap); continue; }
      // the world must be able to carry the candidate out: a request it would only answer with a question ("where should it go?") is not the follow-up meant
      try { const st = this.dialog._dryStatuses(hit.res.segments); if (st.length && !st.every((x) => x === 'supported')) { this.dialog.isession.form.restore(hit.snap); continue; } } catch { /* no dry run: take it */ }
      return { pre: this._finish(hit, { kind: 'degree', type: deg.type, adverb: deg.adv ?? null, of: frame.text, fragment: deg.text ?? null, rewritten: cand, world: frame.world, frameTurn: frame.turn }) };
    }
    return null;
  }

  // ---- repairs ----------------------------------------------------------------------------------------------------------------------------

  /**
   * "no, I meant the tree" / "actually make it green" / "not that one, the other one": take back the last effectful action and
   * redo its sentence with the corrected argument. `how`: 'replace' (content replaces the argument slot that fits) or 'retarget'
   * (content is a reference such as "the other one"). Everything is undone again when no correction is understood.
   */
  async _repair({ how, content, action = null, frame = null, undone = false, restate = false }, sid) {
    const d = this.dialog;
    const act = action ?? this._repairable();
    if (!act) return null;
    const f = frame ?? act.frames.find((x) => x.slots?.length) ?? act.frames[0];
    if (!f) return null;
    const restore = undone ? null : this._back(act);
    const giveUp = () => { restore?.(); return null; };
    if (how === 'retarget' && !content) {
      // "not that one": take it back and ask which one is meant
      this.undoAction(act);
      this.pending = { type: 'repair', how: 'retarget', action: act, frame: f, undone: true, world: f.world, expected: 'reference', question: 'Which one did you mean?', turn: d._msg };
      return { reply: 'OK, I took that back. Which one did you mean?', info: { kind: 'repair', how: 'retarget', undone: act.text, asked: true } };
    }
    let words = String(content ?? '').split(' ').filter(Boolean);
    let np = null;
    if (how === 'retarget' || /\b(?:one|ones|other|another)\b/.test(content ?? '')) {
      const before = this._refs(f.world, act.before[f.world]);
      const after = this._refs(f.world, act.after[f.world]);
      const target = after.find((r) => { const b = before.find((x) => x.id === r.id); return b && b.sig !== r.sig; });
      if (!before.length || !target) return giveUp();
      let pick = null;
      if (/\b(?:other|another)\b/.test(content ?? '')) pick = before.filter((r) => r.kind === target.kind && r.id !== target.id).at(-1) ?? null;
      else { const res = resolveReference(`the ${content}`, before, { prefer: target.kind, lang: this.lang }); pick = res?.matches.length === 1 ? res.matches[0] : null; }
      if (!pick) return giveUp();
      np = describeReferent(pick, before, this.lang);
      words = np.split(' ');
    }
    if (!words.length) return giveUp();
    const opts = this._opts(sid);
    // a correction that changes the kind of request ("no, I meant the outline"): the words are a request of their own; tried after the slots
    const restated = async () => {
      if (how !== 'replace' || !content) return null;
      const alone = await this._readSeg(String(content), sid);
      if (!alone || CLARIFY_PATTERN.test(alone.match?.patternId ?? '')) return null;
      if (!undone) { this.actions = this.actions.filter((x) => x !== act); this.frames = this.frames.filter((x) => x.turn !== act.turn); }
      return { rewrite: content, prefix: act.readOnly ? 'OK.' : 'OK, I took that back.', info: { kind: 'repair', how: 'restate', of: f.text, fragment: content, undone: act.text } };
    };
    if (restate) { const r = await restated(); return r ?? giveUp(); }
    const slotCands = [...this._candidates(f, words)];
    slotCands.sort((a, b) => (a.direct ? 1 : 0) - (b.direct ? 1 : 0));   // a fragment replaces a slot of the old request before it is read as a request of its own
    for (const cand of slotCands) {
      const hit = await this._try(f.world, cand.text, opts);
      if (!hit) continue;
      const seg = hit.res.segments[0];
      const swallowed = Object.values(seg.match.slots ?? {}).some((sl) => !cand.wild && ((sl.class === 'rest') || (sl.class === 'words' && sl.span[0] < cand.end && sl.span[1] > cand.start)));
      if (swallowed || seg.match.patternId === 'unknown') { d.isession.form.restore(hit.snap); continue; }
      if (!undone) { this.actions = this.actions.filter((x) => x !== act); this.frames = this.frames.filter((x) => x.turn !== act.turn); }
      return { pre: this._finish(hit, { kind: 'repair', how, slot: cand.slot, of: f.text, fragment: content, rewritten: cand.text, world: f.world, frameTurn: f.turn, undone: act.text }), prefix: act.readOnly ? 'OK.' : 'OK, I took that back.' };
    }
    const r = await restated();
    return r ?? giveUp();
  }

  // ---- references and choice questions ---------------------------------------------------------------------------------------------------

  _ask(question, options, template, world) {
    this.pending = { type: 'choice', world, template, options, expected: 'reference', question, turn: this.dialog._msg };
    return { reply: question, info: { kind: 'choice', world, options: options.map((o) => o.label) } };
  }
  _question(labels) { return `Which one: ${labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels[0]}?`; }

  _answerChoice(pend, text) {
    const hits = chooseOption(text, pend.options, this.lang);
    if (!hits) return null;
    let fill;
    if (hits.length === 1) fill = hits[0].fill;
    else { const kinds = new Set(hits.map((h) => h.kind)); fill = hits.length === 2 && kinds.size === 1 ? 'both' : kinds.size === 1 ? `all the ${hits[0].noun}s` : null; }
    if (!fill) return null;
    return { rewrite: pend.template.replace('{ref}', fill), info: { kind: 'choice.answer', chose: hits.map((h) => h.label), of: pend.question, world: pend.world } };
  }

  /** "make the red one bigger" -> "make the red house bigger"; "make the house red" with several houses and none in focus -> a choice question. */
  _references(text, sid) {
    const world = this._refWorld();
    if (!world) return null;
    const refs = this._refs(world);
    if (!refs.length) return null;
    const t = text.trim().replace(/[?!.]+$/, '');
    const np = t.match(/\b((?:the|that|this)\s+(?:[a-z-]+\s+){0,2}?(?:one|ones))\b/i);
    if (np) {
      const res = resolveReference(np[1], refs, { prefer: this._targetKind(), lang: this.lang });
      if (!res || res.type === 'quantifier' || res.matches.length !== 1) return null;   // several matches: the world's own reading stays
      const template = `${t.slice(0, np.index)}{ref}${t.slice(np.index + np[1].length)}`;
      if (res.matches.length === 1) return { rewrite: template.replace('{ref}', describeReferent(res.matches[0], refs, this.lang)), info: { kind: 'reference', phrase: np[1], type: res.type, resolved: res.matches[0].id, world } };
      const options = res.matches.map((r) => ({ label: describeReferent(r, refs, this.lang), fill: describeReferent(r, refs, this.lang), kind: r.kind, noun: r.noun }));
      return this._ask(this._question(options.map((o) => o.label)), options, template, world);
    }
    const m = t.match(AMBIGUOUS_VERB);
    if (m) {
      const noun = m[2].toLowerCase();
      const same = refs.filter((r) => (r.words ?? [r.noun]).includes(noun));
      if (same.length < 2 || same.some((r) => r.salient)) return null;
      const at = m[0].length - `${m[1]} ${m[2]}`.length;   // the pattern ends with the noun phrase
      const template = `${t.slice(0, at)}{ref}${t.slice(m[0].length)}`;
      const options = same.map((r) => ({ label: describeReferent(r, refs, this.lang), fill: describeReferent(r, refs, this.lang), kind: r.kind, noun: r.noun }));
      if (options.some((o) => !/^the [a-z]+ [a-z]+$/.test(o.label) || ORDINAL_RE.test(o.label))) return null;   // only when the colours tell them apart; "the first tree" questions stay with the world
      return this._ask(this._question(options.map((o) => o.label)), options, template, world);
    }
    return null;
  }
}
