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
import { restrictedSet } from '../formalizer/spell.mjs';
import { SHORT_TYPOS } from '../formalizer/rules/normalize.mjs';
import { classify, resolveReference, describeReferent, chooseOption, plain } from './meta.mjs';

export const FRAME_LIMIT = 5;

/** Worlds whose commands are never remembered as frames: navigation, help, games (own state machines), shared vocabulary. */
const NO_FRAME = (w) => !w || w === 'ui.shell' || w === 'kids.common' || w === 'core' || w.startsWith('games.');

/** Worlds that never count as a conversation topic and whose state changes are not "actions" (navigation, help, shared vocabulary). */
const NO_TOPIC = new Set(['ui.shell', 'ui.help', 'kids.common', 'core']);
/** Tabs of worlds that do not declare one in their manifest (the built-in tabs of the demo page). */
const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };
/** First words of an utterance that is a real command or question, not a list item. */
const META_SKIP = new Set(['add', 'remove', 'delete', 'show', 'open', 'what', 'who', 'where', 'when', 'why', 'how', 'undo', 'redo', 'draw', 'play', 'tell', 'is', 'are', 'can', 'do', 'does', 'please', 'make', 'go', 'clear', 'cross', 'check']);
/** A modifying command that points at one thing by a bare noun ("make the house red", "delete the tree"). */
const AMBIGUOUS_VERB = /^(?:please\s+|can you\s+|could you\s+|will you\s+)?(?:make|paint|colou?r|move|delete|remove|erase|resize|turn|flip|rotate|copy|duplicate|select|change|shrink|grow|enlarge)\s+(the|that|this)\s+([a-z]+)\b/i;

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
  while (content.length && content[0].toLowerCase() === ',') content = content.slice(1);
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
    this.lastAnswer = null;   // { text, turn }: the last reply that was not itself a repeat or an explanation
    this.lastByWorld = {};    // world id -> { text, reply, turn } (topic return)
    this.topics = [];         // worlds the conversation was about, newest first
    this.icptTurn = null;     // the newest turn a modal interceptor answered: { turn, text, reply, world } (explain)
    this.list = null;         // list-entry mode (spec 11 section 10): { list, world, n }; unlike `pending` it repeats until "that's all"
  }

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
    this.pending = { type: 'fill', world: p.world ?? seg.match.worldId, patternId: seg.match.patternId, text: seg.text.trim().replace(/[?!.]+$/g, ''), template: p.template ?? null, key: p.key ?? null, expected: p.type ?? null, op: envelope.via ?? null, question, turn };
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
    if (pending?.type !== 'fill') return null;
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
        if (cand.wild && ((own && own.match?.worldId !== frame.world) || META_SKIP.has(frag.content[0].toLowerCase()) || /^lets?$/i.test(frag.content[0]))) continue;   // a command of its own is no text for a free slot
        const hit = await this._try(frame.world, cand.text, opts);
        if (!hit) continue;
        const seg = hit.res.segments[0];
        const swallowed = Object.values(seg.match.slots ?? {}).some((sl) => (sl.class === 'rest') || (sl.class === 'words' && sl.span[0] < cand.end && sl.span[1] > cand.start && !cand.wild));
        if (swallowed || seg.match.patternId === 'unknown') { this.dialog.isession.form.restore(hit.snap); continue; }
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
    const order = [...frame.slots].sort((a, b) => (wild(a) - wild(b)) || b.start - a.start);
    for (const s of order) {
      const before = wordsOf(frame.text.slice(0, s.start));
      const prev = before.at(-1)?.toLowerCase();
      if (fragPrep && prev !== fragPrep) continue;
      const variants = [];
      const raw = content.join(' ');
      if (fragPrep) variants.push(content.slice(1).join(' '));
      else {
        variants.push(raw);
        if (DETERMINERS.has(lead) && content.length > 1) variants.push(content.slice(1).join(' '));
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
    this.topics = [w, ...this.topics.filter((x) => x !== w)].slice(0, 6);
    if (!this.lastByWorld[w]) this.lastByWorld[w] = { text, reply: null, turn };
    if (classify(text, { lang: this.lang })?.intent === 'topic') this.lastTopic = { world: w, turn };
  }

  /** A modal interceptor answered: the world is a topic and its last exchange is what a topic return summarises. */
  noteWorld(w, text, reply, turn) {
    if (!w) return;
    this.lastByWorld[w] = { text, reply, turn };
    this.lastWorld = w;
    if (!NO_TOPIC.has(w)) this.topics = [w, ...this.topics.filter((x) => x !== w)].slice(0, 6);
  }

  /** End of turn: when the turn changed the state of a world, keep what is needed to take it back (undo, repair). */
  commitTurn({ turn, text, before }) {
    const st = this.dialog.isession.state;
    const frames = this.frames.filter((f) => f.turn === turn);
    // a question only creates the (lazy) state of a world on first use: that is no action to undo
    const onlyQuestions = frames.length > 0 && frames.every((f) => f.kind === 'question');
    const worlds = Object.keys(st).filter((id) => !NO_TOPIC.has(id) && JSON.stringify(st[id]) !== before[id] && !(onlyQuestions && before[id] === undefined));
    if (!worlds.length || !frames.length) return null;
    if (frames.some((f) => /undo/i.test(`${f.patternId} ${f.op}`))) { this.actions.shift(); return null; }   // the world took the last action back itself
    if (frames.some((f) => /redo/i.test(`${f.patternId} ${f.op}`))) return null;
    const act = { turn, text, worlds, before: Object.fromEntries(worlds.map((id) => [id, before[id]])), after: Object.fromEntries(worlds.map((id) => [id, JSON.stringify(st[id])])), frames: frames.slice().reverse() };
    this.actions.unshift(act);
    this.actions.length = Math.min(this.actions.length, 10);
    return act;
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
    this._setState(act.before);
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
    const d = this.dialog;
    const t = plain(text);
    if (!t) return null;
    // 1. the answer to a question this layer asked
    if (pend?.type === 'choice') { const r = this._answerChoice(pend, text); if (r) return r; }
    if (pend?.type === 'offer') {
      const y = this.lang.yesNo(text);
      if (y === 'yes' && pend.accept === 'undo') { const a = pend.action; const said = a?.frames[0]?.reply; return this.undoAction(a) ? { reply: `OK, I undid it${said ? `: ${said}` : ''}.`.replace(/\.+$/, '.'), info: { kind: 'offer', accept: 'undo', of: a.text } } : null; }
      if (y === 'yes' && pend.accept === 'rewrite') return { rewrite: pend.rewrite, info: { kind: 'offer', accept: 'rewrite', rewrite: pend.rewrite, world: pend.world } };
      if (y === 'no' || /^(?:no|nope|nah|not now|not really)(?: (?:thanks|thank you|leave it|keep it|its fine|never mind|leave it as it is|keep it as it is|leave it alone|leave it that way|keep it that way|its ok|its okay))?$/.test(t)) return { reply: 'OK, I will leave it as it is.', info: { kind: 'offer', declined: true } };
    }
    if (pend?.type === 'repair') { const r = await this._repair({ ...pend, content: plain(text) }, sid); if (r) return r; }
    // 1b. a bare yes/no that answers nothing: no pending question here, no list mode and no game that asks yes/no questions
    if (!pend && !this.list) {
      const bare = BARE_YES_NO[t];
      if (bare && !this._gameAsksYesNo()) return { reply: `${bare === 'yes' ? 'Yes' : 'No'} to what? You can ask me a question, give me a command, or say "help" to see what I can do.`, info: { kind: 'bare', answer: bare } };
    }
    // chat spellings of short words ("bk to the doc", "nxt") are read as the word for the recognizers; the sentence itself is passed on unchanged
    const spelled = String(text).replace(/[A-Za-z]+/g, (w) => SHORT_TYPOS[w.toLowerCase()] ?? w);
    const c = classify(spelled, { lang: this.lang, hasAction: !!this._repairable(), listMode: !!this.list });
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

  _explain(t = '') {
    // "what did you do?" asks about the last thing that CHANGED something (a question later on changed nothing); "why?" asks about the newest turn
    const doing = /^what (?:did you|have you) (?:just )?(?:do|done|change)/.test(t);
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
      const what = imperative ? `You asked me to ${asked.replace(/^please\s+/i, '').replace(/^(\w)/, (c) => c.toLowerCase())}` : `You said "${asked}"`;
      return { reply: `${what}, so ${wasQuestion ? 'I answered it' : 'I did it'}. What I answered: ${ic.reply}`, info: { kind: 'explain', of: ic.text, world: ic.world, changed: [] } };
    }
    if (!f) {
      // chat, navigation and games leave no frame: explain from the last thing this session said and answered
      const lw = this.lastByWorld[this.lastWorld];
      if (!lw) return null;
      return { reply: `You said "${sayText(lw.text)}", so I answered it. What I answered: ${lw.reply}`, info: { kind: 'explain', of: lw.text, world: this.lastWorld, changed: [] } };
    }
    // plain wording for the user; ids (rule, operation) stay in info and the trace only
    const asked = String(f.text ?? '').trim().replace(/[.!\s]+$/, '');
    const isQuestion = /\?$/.test(asked) || QUESTION_START.test(asked);
    const imperative = !isQuestion && IMPERATIVE_START.test(asked);
    const what = imperative ? `You asked me to ${asked.replace(/^please\s+/i, '').replace(/^(\w)/, (c) => c.toLowerCase())}` : `You said "${asked}"`;
    const said = f.reply ? ` What I answered: ${f.reply}` : '';
    const reply = `${what}, so ${a ? 'I did it' : 'I answered it'}.${said}`;
    return { reply, info: { kind: 'explain', of: f.text, world: f.world, pattern: f.patternId, op: f.opId, changed: a?.worlds ?? [] } };
  }

  // ---- topic return --------------------------------------------------------------------------------------------------------------

  _topicWorld(target, digression = false) {
    const { set } = this.dialog.engine;
    if (!target && !digression) return this.topics.find((w) => this.lastByWorld[w]) ?? null;   // "continue": the newest topic
    if (!target) {
      // "where were we?": the conversation before the current digression (the newest topic that is not the world of the open tab), else the newest
      const here = this.dialog.context().tabWorld;
      if (this.lastTopic && this.dialog._msg - this.lastTopic.turn <= 1) return this.lastTopic.world;   // right after an explicit return: where we just went
      return this.topics.find((w) => this.lastByWorld[w] && w !== here) ?? this.topics.find((w) => this.lastByWorld[w]) ?? null;
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
    this.lastTopic = { world, turn: d._msg };
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
    const tText = slotT ? slotT.text : 'it';
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
      const c = withDegreeWord(rep);
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
    const afterNow = Object.fromEntries(act.worlds.map((w) => [w, JSON.stringify(d.isession.state[w])]));
    if (!undone) this._setState(act.before);
    const giveUp = () => { if (!undone) this._setState(afterNow); return null; };
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
