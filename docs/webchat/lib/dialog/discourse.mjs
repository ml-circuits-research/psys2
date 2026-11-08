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
import { yesNo, splitAdverb, COMPARATIVES } from './lang.mjs';
import { classify, resolveReference, describeReferent, chooseOption, plain } from './meta.mjs';

export const FRAME_LIMIT = 5;

/** Worlds whose commands are never remembered as frames: navigation, help, games (own state machines), shared vocabulary. */
const NO_FRAME = (w) => !w || w === 'ui.shell' || w === 'ui.help' || w === 'kids.common' || w === 'core' || w.startsWith('games.');

/** Worlds that never count as a conversation topic and whose state changes are not "actions" (navigation, help, shared vocabulary). */
const NO_TOPIC = new Set(['ui.shell', 'ui.help', 'kids.common', 'core']);
/** Tabs of worlds that do not declare one in their manifest (the built-in tabs of the demo page). */
const BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor', 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman' };
/** First words of an utterance that is a real command or question, not a list item. */
const META_SKIP = new Set(['add', 'remove', 'delete', 'show', 'open', 'what', 'who', 'where', 'when', 'why', 'how', 'undo', 'redo', 'draw', 'play', 'tell', 'is', 'are', 'can', 'do', 'does', 'please', 'make', 'go', 'clear', 'cross', 'check']);
/** A modifying command that points at one thing by a bare noun ("make the house red", "delete the tree"). */
const AMBIGUOUS_VERB = /^(?:please\s+|can you\s+|could you\s+|will you\s+)?(?:make|paint|colou?r|move|delete|remove|erase|resize|turn|flip|rotate|copy|duplicate|select|change|shrink|grow|enlarge)\s+(the|that|this)\s+([a-z]+)\b/i;

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

export class Discourse {
  constructor(dialog) {
    this.dialog = dialog;
    this.frames = [];    // newest first
    this.pending = null; // { type: 'fill' | 'confirm', world, ... }
    this.last = null;    // provenance of the last resolution (for the trace)
    this.actions = [];   // effectful turns, newest first: { turn, text, worlds, before, after, frames } (undo, repair, explain)
    this.lastAnswer = null;   // { text, turn }: the last reply that was not itself a repeat or an explanation
    this.lastByWorld = {};    // world id -> { text, reply, turn } (topic return)
    this.topics = [];         // worlds the conversation was about, newest first
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
    this.pending = { type: 'fill', world: seg.match.worldId, patternId: seg.match.patternId, text: seg.text.trim().replace(/[?!.]+$/g, ''), key: p.key ?? null, expected: p.type ?? null, op: envelope.via ?? null, question, turn };
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
    for (const candidate of [`${pending.text} ${reply}`, reply]) {
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
    for (const frame of this.frames) {
      if (frag.kind === 'repeat') {
        const hit = await this._try(frame.world, frame.text, opts);
        if (hit) return this._finish(hit, { kind: 'ellipsis', how: 'repeat', of: frame.text, fragment: text, rewritten: frame.text, world: frame.world, frameTurn: frame.turn });
        continue;
      }
      for (const cand of this._candidates(frame, frag.content)) {
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

  /** Candidate rewritings of `frame.text`: each typed slot (then each free-text slot) replaced by the fragment content. */
  *_candidates(frame, content) {
    const lead = content[0].toLowerCase();
    const fragPrep = PREPOSITIONS.has(lead) && content.length > 1 ? lead : null;
    const wild = (s) => s.class === 'words' || s.class === 'rest';
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

  /** End of turn: when the turn changed the state of a world, keep what is needed to take it back (undo, repair). */
  commitTurn({ turn, text, before }) {
    const st = this.dialog.isession.state;
    const worlds = Object.keys(st).filter((id) => !NO_TOPIC.has(id) && JSON.stringify(st[id]) !== before[id]);
    const frames = this.frames.filter((f) => f.turn === turn);
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
      Object.assign(cur, JSON.parse(json));
    }
  }

  /** The newest effectful action, when it is recent enough to be what "that" means. */
  _recentAction(maxAge = 3) {
    const a = this.actions[0];
    return a && this.dialog._msg - a.turn <= maxAge ? a : null;
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
      const y = yesNo(text);
      if (y === 'yes' && pend.accept === 'undo') { const a = pend.action; const said = a?.frames[0]?.reply; return this.undoAction(a) ? { reply: `OK, I undid it${said ? `: ${said}` : ''}.`.replace(/\.+$/, '.'), info: { kind: 'offer', accept: 'undo', of: a.text } } : null; }
      if (y === 'no') return { reply: 'OK, I will leave it as it is.', info: { kind: 'offer', declined: true } };
    }
    if (pend?.type === 'repair') { const r = await this._repair({ ...pend, content: plain(text) }, sid); if (r) return r; }
    const c = classify(text, { hasAction: !!this._recentAction(), listMode: !!this.list });
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
        case 'feedback': return this.lastWorld?.startsWith('games.') ? null : this._feedback();   // in a game "no, that's wrong" is an answer
        case 'repeat': return this._repeat();
        case 'explain': return this._explain();
        case 'topic': return this._topic(c.target, sid);
        case 'list.start': return this._listStart(c.list, sid);
        case 'degree': {
          // "a bit slower" may be a complete sentence of the open tab's world; only "more"/"less" and unread fragments continue the last frame
          if (c.degree.type !== 'more' && c.degree.type !== 'less') { const w = await this._tryAny(text, sid); const here = [d.context().tabWorld, d.context().lastWorld]; if (w && here.includes(w)) return null; }
          return this._degree(c.degree, sid);
        }
        case 'repair': { const r = await this._repair({ how: c.how, content: c.content }, sid); if (r) return r; break; }
        default: break;
      }
    }
    return this._references(text, sid);
  }

  _cancel(pend) {
    const dropped = pend ? pend.type : this.list ? 'list' : null;
    this.list = null;
    return { reply: dropped ? 'OK, never mind. I dropped that question; nothing was changed.' : 'OK, never mind.', info: { kind: 'cancel', dropped } };
  }

  _feedback() {
    const a = this._recentAction();
    const last = this.lastAnswer;
    if (!last && !a) return null;
    let reply = 'Oh no, sorry about that, I got it wrong.';
    if (a) {
      this.pending = { type: 'offer', accept: 'undo', action: a, world: a.worlds[0], expected: 'yes/no', question: 'Shall I undo it?', turn: this.dialog._msg };
      reply += ' Shall I undo it? Say "yes" to undo, or tell me what you meant.';
    } else reply += ' Please say it again in other words, or tell me what you meant.';
    return { reply, feedback: 'negative', info: { kind: 'feedback', polarity: 'negative', of: last?.text ?? null, offer: a ? 'undo' : null } };
  }

  _repeat() {
    const last = this.lastAnswer;
    if (!last) return null;
    return { reply: last.text, info: { kind: 'repeat', of: last.turn } };
  }

  _explain() {
    const a = this._recentAction(6);
    const f = a?.frames[0] ?? this.frames[0];
    if (!f) return null;
    // plain wording for the user; ids (rule, operation) stay in info and the trace only
    const asked = String(f.text ?? '').trim().replace(/[.!\s]+$/, '');
    const isQuestion = /\?$/.test(asked) || /^(?:what|who|whom|whose|where|when|why|how|which|is|are|was|were|does|do|did|can|could|will|would|should)\b/i.test(asked);
    const imperative = !isQuestion && /^(?:please\s+)?[a-z]+\b/i.test(asked) && !/^(?:i|we|you|my|the|a|an)\b/i.test(asked);
    const what = imperative ? `You asked me to ${asked.replace(/^please\s+/i, '').replace(/^(\w)/, (c) => c.toLowerCase())}` : `You said "${asked}"`;
    const said = f.reply ? ` What I answered: ${f.reply}` : '';
    const reply = `${what}, so ${a ? 'I did it' : 'I answered it'}.${said}`;
    return { reply, info: { kind: 'explain', of: f.text, world: f.world, pattern: f.patternId, op: f.opId, changed: a?.worlds ?? [] } };
  }

  // ---- topic return --------------------------------------------------------------------------------------------------------------

  _topicWorld(target) {
    const { set } = this.dialog.engine;
    if (!target) return this.topics.find((w) => this.lastByWorld[w]) ?? null;
    const words = target.split(' ').filter((w) => !['game', 'tab', 'the', 'my', 'our', 'a', 'to', 'page', 'screen', 'window'].includes(w));
    if (!words.length) return null;
    let best = null, bestScore = 0;
    for (const w of set.list()) {
      if (NO_TOPIC.has(w.id)) continue;
      const toks = new Set([...w.id.split('.'), ...(w.title ?? '').toLowerCase().split(/\W+/), ...(w.tab ? [w.tab.id, ...(w.tabAliases ?? w.tab.aliases ?? [])] : [])].map((x) => String(x).toLowerCase()).filter(Boolean));
      const score = words.filter((x) => toks.has(x) || toks.has(x.replace(/s$/, '')) || [...toks].some((k) => k.length > 3 && (x.startsWith(k) || k.startsWith(x) && x.length > 3))).length;
      if (score > bestScore) { best = w.id; bestScore = score; }
    }
    return bestScore === words.length ? best : null;   // every word must name the world ("back to the first chart" is not a topic)
  }

  _topic(target, sid) {
    const d = this.dialog, { set, interp } = d.engine;
    const world = this._topicWorld(target);
    if (!world) return null;
    const w = set.get(world);
    const tab = w.tab?.id ?? BUILTIN_TAB[world] ?? null;
    if (tab && d.isession.state['ui.shell']?.activeTab !== tab) { try { interp.runAction(d.isession, 'ui.openTab', { tab }); } catch { /* the shell may be absent */ } }
    const sum = interp.hook(d.isession, world, 'summary', {});
    const last = this.lastByWorld[world];
    const title = (w.title ?? world).replace(/\s*\(.*\)\s*$/, '');
    const parts = [`Back to ${title}.`];
    if (typeof sum === 'string' && sum) parts.push(sum);
    else if (last) parts.push(`Last time you said "${last.text}" and I answered: ${last.reply}`);
    else parts.push('Nothing has happened there yet.');
    return { reply: parts.join(' '), info: { kind: 'topic', world, target: target ?? null, tab } };
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
    const isDegreeWord = (w) => COMPARATIVES.includes(w.toLowerCase()) || /^(left|right|up|down|higher|lower|more|less|forward|back|upward|downward|upwards|downwards)$/i.test(w);
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
  async _repair({ how, content, action = null, frame = null, undone = false }, sid) {
    const d = this.dialog;
    const act = action ?? this._recentAction();
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
      else { const res = resolveReference(`the ${content}`, before, { prefer: target.kind }); pick = res?.matches.length === 1 ? res.matches[0] : null; }
      if (!pick) return giveUp();
      np = describeReferent(pick, before);
      words = np.split(' ');
    }
    if (!words.length) return giveUp();
    const opts = this._opts(sid);
    for (const cand of this._candidates(f, words)) {
      const hit = await this._try(f.world, cand.text, opts);
      if (!hit) continue;
      const seg = hit.res.segments[0];
      const swallowed = Object.values(seg.match.slots ?? {}).some((sl) => !cand.wild && ((sl.class === 'rest') || (sl.class === 'words' && sl.span[0] < cand.end && sl.span[1] > cand.start)));
      if (swallowed || seg.match.patternId === 'unknown') { d.isession.form.restore(hit.snap); continue; }
      if (!undone) { this.actions = this.actions.filter((x) => x !== act); this.frames = this.frames.filter((x) => x.turn !== act.turn); }
      return { pre: this._finish(hit, { kind: 'repair', how, slot: cand.slot, of: f.text, fragment: content, rewritten: cand.text, world: f.world, frameTurn: f.turn, undone: act.text }), prefix: 'OK, I took that back.' };
    }
    return giveUp();
  }

  // ---- references and choice questions ---------------------------------------------------------------------------------------------------

  _ask(question, options, template, world) {
    this.pending = { type: 'choice', world, template, options, expected: 'reference', question, turn: this.dialog._msg };
    return { reply: question, info: { kind: 'choice', world, options: options.map((o) => o.label) } };
  }
  _question(labels) { return `Which one: ${labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels[0]}?`; }

  _answerChoice(pend, text) {
    const hits = chooseOption(text, pend.options);
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
      const res = resolveReference(np[1], refs, { prefer: this._targetKind() });
      if (!res || res.type === 'quantifier' || res.matches.length !== 1) return null;   // several matches: the world's own reading stays
      const template = `${t.slice(0, np.index)}{ref}${t.slice(np.index + np[1].length)}`;
      if (res.matches.length === 1) return { rewrite: template.replace('{ref}', describeReferent(res.matches[0], refs)), info: { kind: 'reference', phrase: np[1], type: res.type, resolved: res.matches[0].id, world } };
      const options = res.matches.map((r) => ({ label: describeReferent(r, refs), fill: describeReferent(r, refs), kind: r.kind, noun: r.noun }));
      return this._ask(this._question(options.map((o) => o.label)), options, template, world);
    }
    const m = t.match(AMBIGUOUS_VERB);
    if (m) {
      const noun = m[2].toLowerCase();
      const same = refs.filter((r) => (r.words ?? [r.noun]).includes(noun));
      if (same.length < 2 || same.some((r) => r.salient)) return null;
      const at = m[0].length - `${m[1]} ${m[2]}`.length;   // the pattern ends with the noun phrase
      const template = `${t.slice(0, at)}{ref}${t.slice(m[0].length)}`;
      const options = same.map((r) => ({ label: describeReferent(r, refs), fill: describeReferent(r, refs), kind: r.kind, noun: r.noun }));
      if (options.some((o) => !/^the [a-z]+ [a-z]+$/.test(o.label) || ORDINAL_RE.test(o.label))) return null;   // only when the colours tell them apart; "the first tree" questions stay with the world
      return this._ask(this._question(options.map((o) => o.label)), options, template, world);
    }
    return null;
  }
}
