// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The shared module `session.dialogue` (WORLDS-AS-MODULES M1, spec 22; world directory worlds/session.dialogue). Browser-safe: no `node:*` imports.
 *
 * It owns the answer to the first question of every turn: WHAT KIND OF TURN IS IT? It reads that before any tab world does, and gives the tab a complete
 * request or nothing (one contract for every tab):
 *
 *   continuation   a turn with no verb or no thing ("a sun", "on the lake", "further right", "and a cat") inherits them from the focus;
 *   list           "V a, b and c": every item inherits V and the frame; the items are never read as separate sentences;
 *   correction     "no X, Y", "not on it, on the swing", "that is X, not Y", "I said X", "I mistyped X" and the INPUT-HISTORY flag `correction: { of }`:
 *                  the last request is taken back and redone with the change, one step for the user;
 *   complaint /    "that is wrong", "why is it so low", "how did you get to chess": an answer from the trace of the LAST turn in plain words (which reading,
 *   why-question   which default and where it came from) and an offer to undo; never an action in a world;
 *   scene question "did you not draw a girl before?": answered from the scene and the history;
 *   bare yes / no  with nothing pending: a refusal right after an action is a rejection of that action (an offer to undo), never a command.
 *
 * The focus (last thing, action, place, world) is kept on the vendored sopworld library: a turn is a `std.focus.turn`, what it names are `std.focus.mention`s,
 * and the gap of a fragment is a `std.fill.need` whose value (and tier and source) the library chooses; the source is what the why-answer says. This file
 * holds no vocabulary of a world: the cue words are the core.phrase groups `dialogue.*` of worlds/session.dialogue/lexicon.sop, the closed grammar classes are
 * those of continuation.mjs, and everything else is read from the discourse layer (frames, actions, referents) that it absorbs instead of duplicating:
 * `Discourse._repair`, `_degree`, `_feedback`, `_explain`, `followup.touched`, `continuation.ownWords`.
 *
 * The session as facts (`facts()`): things made and their counts, topics, games and results, places shown. A view takes "the current discussion" as content
 * through `ctx.sessionFacts()` and the operation things.show of session.things (spec 23); this module only offers the facts.
 */
import { budget } from './budget.mjs?v=00bce6e369';
import { en } from '../lang/en.mjs?v=35e9d2e031';
import { GRAMMAR } from './continuation.mjs?v=01b13916e6';
import { touched } from './followup.mjs?v=88af56c068';
import { isKnownWord, spellVocabulary } from '../formalizer/spell.mjs?v=0bbe69ea13';
import { classify, describeReferent, plain } from './meta.mjs?v=aa6dfcad14';

const LOG_LIMIT = 60;
const FOCUS_WINDOW = 30;
const tokens = (t) => String(t ?? '').toLowerCase().replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) ?? [];
const strip = (t) => String(t ?? '').trim().replace(/[\s.!?]+$/, '');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const quoted = (t) => `"${strip(t)}"`;
const DETERMINERS = en.words('det', 'dialogue');
const PREPOSITIONS = en.words('prep', 'dialogue');
const PRONOUNS = en.words('pron', 'dialogue');

/** A phrase group as arrays of tokens, longest first. */
const alts = (lang, id) => [...new Set((lang.phrase?.(id) ?? []))].map((a) => a.split(' ').filter(Boolean)).filter((a) => a.length).sort((a, b) => b.length - a.length);
const at = (ws, i, a) => a.every((w, k) => ws[i + k] === w);
const startsWith = (ws, as) => as.find((a) => at(ws, 0, a)) ?? null;
const contains = (ws, as) => { for (let i = 0; i < ws.length; i++) for (const a of as) if (at(ws, i, a)) return a; return null; };
const isNumber = (w) => /^\d+$/.test(w);

/** The verb of a request: the words before the first determiner, number, pronoun or preposition (closed classes), at most three, without lead-in politeness. */
export function verbOf(text) {
  const ws = tokens(text);
  const out = [];
  for (const w of ws) {
    if (DETERMINERS.has(w) || PRONOUNS.has(w) || PREPOSITIONS.has(w) || isNumber(w) || !/^[a-z]+$/.test(w) || out.length >= 3) break;
    out.push(w);
  }
  const lead = new Set(['please', 'can', 'you', 'could', 'would', 'will', 'lets', 'let', 'us', 'now', 'then', 'also', 'and']);
  while (out.length > 1 && lead.has(out[0])) { budget.tick('dialogue.verb'); out.shift(); }
  return out.length && !lead.has(out[0]) ? out.join(' ') : null;
}

/** What a turn mentions, by the kinds of std.focus: a thing, an action (the verb), a place, a world. Only an effectful turn holds the focus. */
const mention = (r, kind) => (r.effect ? (kind === 'action' ? r.verb : r[kind]) : null);

export class Dialogue {
  /** @param session the DialogSession */
  constructor(session) {
    this.s = session;
    this.log = [];        // one plain record per turn, oldest first (JSON: part of the memory and of the undo snapshot)
    this.note = null;     // what this turn's reading did (the fill sources of a completed fragment), moved into its record
  }

  // ---- memory -------------------------------------------------------------------------------------------------------------------------------------
  toJSON() { return { v: 1, log: this.log.map((r) => ({ ...r })) }; }
  load(json) { if (json && json.v === 1 && Array.isArray(json.log)) this.log = json.log.map((r) => ({ ...r })); return this; }

  get lang() { return this.s.engine.interp.lang; }
  get disc() { return this.s.discourse; }
  worldTitle(id) { return String(this.s.engine.set.get(id)?.title ?? String(id ?? '').split('.').at(-1)).replace(/\s*\([^)]*\)\s*$/, ''); }

  // ---- the focus: sopworld std.focus + std.fill -----------------------------------------------------------------------------------------------------
  /**
   * The roles a fragment lacks, filled by sopworld: the log is written as `std.focus.turn` / `std.focus.mention` wires, the lacking roles as `std.fill.need`s
   * of the new turn, the scene as offers of tier `scene`; the library chooses (said > focus > scene > knowledge > default) and gives tier and source.
   * Returns { role: { value, tier, source } }. Without the library (no `engine.sopworld`) the focus is read from the log in the same order.
   */
  fill(roles, { world = null, scene = {} } = {}) {
    const recs = this.log.filter((r) => !world || r.world === world || !r.world).slice(-FOCUS_WINDOW);
    const lib = this.s.engine.sopworld;
    const out = {};
    if (lib) {
      try {
        const w = new lib.World({});
        w.use('std.focus');
        const q = lib.quote;
        const lines = [];
        for (const r of recs) {
          budget.tick('dialogue.focus');
          lines.push(`@t${r.n} std.focus.turn of=r${r.n} in=d`);
          for (const k of ['thing', 'action', 'place', 'world']) if (mention(r, k)) lines.push(`@m${r.n}.${k} std.focus.mention of=r${r.n} kind=${k} value=${q(String(mention(r, k)))}`);
        }
        const now = (this.s._msg ?? 0) + 1;
        lines.push(`@tnow std.focus.turn of=rnow in=d`);
        for (const role of roles) {
          lines.push(`@need.${role} std.fill.need for=rnow key=${role}`);
          if (scene[role]) lines.push(`@offer.${role} std.fill.offer for=need.${role} value=${q(String(scene[role]))} tier=scene source=scene`);
        }
        const r = w.load(lines.join('\n'));
        if (r.ok) {
          for (const role of roles) {
            const a = w.get(`need.${role}`)?.attrs ?? {};
            const v = a.value?.[0];
            if (v != null) out[role] = { value: lib.str ? lib.str(v) : String(v).replace(/^"|"$/g, ''), tier: a.tier?.[0] ?? null, source: a.source?.[0] ?? null };
          }
          void now;
          return out;
        }
      } catch { /* the plain reading below */ }
    }
    for (const role of roles) {
      const hit = [...recs].reverse().find((r) => mention(r, role));
      if (hit) out[role] = { value: mention(hit, role), tier: 'focus', source: 'focus' };
      else if (scene[role]) out[role] = { value: scene[role], tier: 'scene', source: 'scene' };
    }
    return out;
  }

  /**
   * The effectful turns of `world` that a fragment may continue, newest first: the thread is alive while the turns after the last effect are of that world
   * (or were not read at all) and none of them cancelled it; a turn of another world, a cancellation, a bare yes or no, or more than twelve turns end it.
   */
  thread(world) {
    const recs = this.log.slice(-12);
    for (let i = recs.length - 1; i >= 0; i--) {
      const r = recs[i];
      if (r.effect && r.world === world) return this.effects(world);
      if (r.meta === 'cancel' || r.meta === 'topic' || (r.world && r.world !== world) || r.kind === 'ack') return [];
    }
    return [];
  }

  /** The focus of a world as words, for the acts executor (`ctx.dialogueFocus`): the thing and the place of the last effectful turn there. */
  focusWords(world) {
    const r = this.effects(world)[0];
    return r ? { thing: r.thing ?? null, place: r.place ?? null, world: r.world } : null;
  }

  /** The last effectful turns of a world, newest first. */
  effects(world = null) { return this.log.filter((r) => r.effect && (!world || r.world === world)).reverse(); }

  /** The thing the last effectful action touched, as a noun phrase the world reads ("the fish", "the red house"), from the world's own `referents` hook. */
  thingNow(world) {
    const d = this.disc;
    try {
      const refs = d._refs(world);
      const sal = refs.filter((r) => r.salient);
      if (sal.length === 1) return describeReferent(sal[0], refs, d.lang);
      if (sal.length > 1 && new Set(sal.map((r) => r.kind)).size === 1) return `all the ${sal[0].noun}s`;
      if (!sal.length && refs.length === 1) return describeReferent(refs[0], refs, d.lang);
    } catch { /* no referents */ }
    return null;
  }

  // ---- after the turn: the record --------------------------------------------------------------------------------------------------------------------
  /** Called at the end of a turn with what happened: keeps the plain record the focus and the why-answers are read from. */
  record({ english, original, kind, segments, statuses, reply, effect, tabBefore, tabAfter, routing, corrected, guesses, metaKind }) {
    const d = this.disc, n = this.s._msg;
    const fr = d.frames.find((f) => f.turn === n && f.kind === 'request') ?? null;
    const world = fr?.world ?? segments.find((x) => x.match?.worldId)?.match?.worldId ?? null;
    const verb = effect && fr ? verbOf(fr.text) : null;
    const place = effect && fr ? placeOf(fr.text) : null;
    const act = effect ? d.actions.find((a) => a.turn === n) : null;
    const tc = act ? touched(act) : { added: [], changed: [] };
    const rec = {
      n, text: strip(english), said: strip(original ?? english), kind: kind ?? 'new', world, tab: tabAfter ?? tabBefore ?? null, effect: !!effect,
      made: tc.added.length > 0, changed: tc.changed.length > 0, meta: metaKind || undefined,
      verb: verb || undefined, place: place || undefined, thing: effect && world ? (this.thingNow(world) ?? undefined) : undefined,
      readAs: segments.filter((x) => !x.unparsed && x.text).map((x) => ({ text: strip(x.text), world: x.match?.worldId ?? null, why: x.routing?.reason ?? null, took: x.bestEffort?.took ?? null, ...(x.ignored?.length ? { ignored: x.ignored.slice(0, 4) } : {}), ...(x.corrections?.length ? { fixed: x.corrections.slice(0, 4).map((c) => [c.from, c.to]) } : {}) })),
      unread: segments.filter((x) => x.unparsed).map((x) => strip(x.text)).slice(0, 4),
      statuses: [...new Set(statuses ?? [])],
      reply: strip(reply ?? '').slice(0, 300), ...(/\?/.test(String(reply ?? '')) ? { asked: true } : {}),
      ...(this.note ? { filled: this.note } : {}),
      ...(corrected ? { corrected } : {}),
      ...(guesses?.length ? { guesses: guesses.slice(0, 4) } : {}),
    };
    this.note = null;
    for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
    this.log.push(rec);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    return rec;
  }

  // ---- the turn --------------------------------------------------------------------------------------------------------------------------------------
  /**
   * Reads the kind of `text` before any tab world. Returns null (a new request: the normal pipeline) or the shape of `Discourse.meta`:
   * `{ reply, parts?, info, status? }` (an answer), `{ rewrite, prefix?, info }` (a complete request for the pipeline), `{ pre, prefix? }` (already read).
   */
  async turn(text, { pend = null, sid = null, correction = null } = {}) {
    budget.tick('dialogue.turn');
    const d = this.disc, lang = this.lang;
    const t = plain(text);
    if (!t) return null;
    if (d.list) return null;                                       // list-entry mode of the discourse layer
    const ws = tokens(text);
    // an answer to a question the system asked belongs to the one who asked; only a why-question may pass an open yes/no offer
    if (pend && !(pend.type === 'offer' && startsWith(ws, alts(lang, 'dialogue.why')))) return null;
    // a world that is running something (a game, a modal) or owns the "explain" question answers its own turns
    const ctx = this.s.context();
    if (ctx.modalWorld || (ctx.gameWorld && ctx.gameWorld === ctx.tabWorld)) return null;

    // 0. the INPUT-HISTORY flag: the user recalled the last message, edited it and sent it right after a failed turn
    if (correction) { const r = this.amend(text, correction); if (r) return r; }

    // 1. clauses: a complaint followed by what he asked ("that is wrong, I asked how many sentences"), a restatement ("I said X", "I mistyped X")
    const said = alts(lang, 'dialogue.said');
    const clauses = String(text).split(/\s*[,;]\s*|\s+(?:but)\s+/i).map((c) => c.trim()).filter(Boolean);
    const compl = alts(lang, 'dialogue.complaint');
    const lead = clauses.findIndex((c) => { const cw = tokens(c); return startsWith(cw, said) || (cw.length <= 8 && contains(cw, compl)); });
    if (lead >= 0 && clauses.length > 1) {
      const rest = clauses.slice(lead);
      const j = rest.findIndex((c) => startsWith(tokens(c), said));
      if (j >= 0) {
        const own = tokens(rest[j]), a = startsWith(own, said);
        const content = own.slice(a.length).join(' ');
        const more = rest.slice(j + 1).join(' ');
        if (content) {
          const said2 = plain(`${content} ${more}`);
          const r = await d._repair({ how: 'replace', content: said2 }, sid);
          if (r) return this.tag(r, 'correction');
          // nothing to take back and amend: what he says he asked is the request, read as a request of its own
          return this.tag({ rewrite: said2, prefix: 'Sorry about that.', info: { kind: 'repair', how: 'restate', fragment: text, dialogue: 'correction' } }, 'correction');
        }
      }
    }
    if (startsWith(ws, said)) {                                     // "I said X" / "I mistyped X" / "I meant X"
      const a = startsWith(ws, said), content = ws.slice(a.length).join(' ');
      if (content && this.recent(3)) { const r = await d._repair({ how: 'replace', content }, sid); if (r) return this.tag(r, 'correction'); }
    }

    // 2. why-question about the conversation: from the trace of the last turn, never an action in a world
    const w = await this.why(ws, text, sid);
    if (w) return w;

    // 3. a complaint about the last answer
    if (ws.length <= 10 && contains(ws, compl) && !/\?$/.test(String(text).trim()) && !ws.some((x) => DETERMINERS.has(x) && ws.indexOf(x) === 0)) {
      const r = d._feedback(t);
      if (r) return this.tag(r, 'complaint');
    }

    // 4. a bare yes / no (with politeness) with nothing pending
    const ack = await this.ack(ws, text, sid);
    if (ack) return ack;

    // 4b. a negated request ("do not remove table 3", "never draw a sun"): nothing is carried out, whatever world could have read the verb (handover/lang.en clauses.sop neg.imperative)
    const negated = en.negatedRequest(text);
    // ... unless a world's own pattern reads the negation ("Dont loop it" is the music world's loop off): the negation words are then in no free capture of the reading
    if (negated && !(await this._negationOwned(text, negated, sid))) return this.tag({ reply: `OK, I will not ${negated.rest}. Nothing changed.`, info: { kind: 'negated-request', rest: negated.rest, dialogue: 'negation' } }, 'negation');

    // 4c. "is Monday before Friday": an ORDER in time, never a distance. No world has published an order in time yet (k.time has the names and positions, no before / after relation),
    // so the answer is that it can not be compared yet; when the knowledge repository's order lands, this is the one place that asks it instead.
    const tc = en.timeComparison(text);
    if (tc) {
      const names = { day: 'days', month: 'months', season: 'seasons', part: 'parts of the day', clock: 'hours' };
      const what = tc.kinds.map((k) => names[k]).join(' and ');
      return this.tag({ reply: `I can not compare ${what} in time yet: I know their names, not their order, so I can not tell whether ${tc.a} comes ${tc.rel} ${tc.b}.`, info: { kind: 'time-order-unknown', rel: tc.rel, kinds: tc.kinds, dialogue: 'time-order' } }, 'time-order');
    }

    // 5. a question about the scene or the history
    const q = this.sceneQuestion(ws, text);
    if (q) return q;

    // 6. "that is X, not Y": X replaces Y in the last request
    const m = /^(?:that|this|it) (?:is|was|should be|must be) (.+?)[ ,]+(?:and )?not (.+)$/.exec(t);
    if (m && this.recent(3)) { const r = await d._repair({ how: 'replace', content: plain(m[1]) }, sid); if (r) return this.tag(r, 'correction'); }

    // 6b. "make the house red, not blue": the clause that says what is NOT wanted is not part of the request
    const neg = /^(.+?)\s*,\s*(?:and\s+)?not\s+(?!only\b|just\b|really\b|at all\b)(.+)$/i.exec(strip(text));
    if (neg) {
      const head = await d._readSeg(neg[1], sid);
      if (head && !head.unparsed && !head.ignored?.length) { this._kind = 'correction'; return { rewrite: neg[1], info: { kind: 'repair', how: 'not-clause', dialogue: 'correction', not: neg[2], fragment: text } }; }
    }

    return null;   // "a chart about the current discussion" is not read here: it is a selection of the session things into a view (session.things, spec 23)
  }

  /** Does the world's reading of the whole sentence use the negation (no free-text capture covers the lead)? A reading that swallowed "do not" into a capture ("Do not draw a" + sun) did not. */
  async _negationOwned(text, negated, sid) {
    const seg = await this.disc._readSeg(text, sid);
    if (!seg?.match) return false;
    const free = Object.values(seg.match.slots ?? {}).filter((x) => x?.span && !/^(?:lex\.|number|ordinal)/.test(String(x.class ?? '')));
    return !free.some((x) => x.span[0] < negated.leadEnd);
  }

  tag(r, kind) { r.info = { ...(r.info ?? {}), dialogue: kind }; this._kind = kind; return r; }

  /** The newest effectful action, when it is at most `age` turns old. */
  recent(age = 3) { return this.disc._recentAction(age); }

  // ---- correction by the INPUT-HISTORY flag ------------------------------------------------------------------------------------------------------------
  /** The edited message replaces the failed one: what it did (if anything) is taken back first, then the new text is read as a request of its own. */
  amend(text, { of } = {}) {
    const last = this.log.at(-1);
    this._kind = 'correction';
    if (!last || (of && plain(of) !== plain(last.said ?? last.text) && plain(of) !== plain(last.text))) return null;
    const act = last.effect ? this.disc.actions.find((a) => a.turn === last.n) : null;
    if (act) { this.disc.undoAction(act); return { rewrite: strip(text), prefix: 'OK, I took that back.', info: { kind: 'repair', how: 'amend', dialogue: 'correction', of: last.text, undone: act.text } }; }
    return null;
  }

  // ---- why-questions and the trace -----------------------------------------------------------------------------------------------------------------------
  async why(ws, text, sid) {
    const d = this.disc, lang = this.lang;
    const as = alts(lang, 'dialogue.why');
    const a = startsWith(ws, as);
    if (!a || !this.log.length) return null;
    const rest = ws.slice(a.length);
    const aux = new Set(['did', 'do', 'does', 'is', 'are', 'was', 'were', 'have', 'has', 'would', 'can', 'could', 'didnt', 'isnt', 'wasnt', 'dont', 'doesnt', 'am', 'will', 'wont', 'not', 'so']);
    const about = new Set(['you', 'it', 'that', 'this', 'they', 'them', 'there', 'i']);
    const bare = rest.length === 0 || (rest.length === 1 && (rest[0] === 'not' || rest[0] === 'so'));
    const linked = a.length > 1 /* how come / how did you */ || (aux.has(rest[0]) && rest.slice(1, 3).some((x) => about.has(x)));
    if (!bare && !linked) return null;
    // a world on the open tab (a game, the Talk tab) may own the question; a world that explains a named fact answers it first
    try { if (d._tabOwns('ownsExplain', plain(text))) return null; } catch { /* no hook */ }
    // the stock forms ("why?", "why is that", "what did you do") are the discourse layer's own explanation, which asks the world first (hook `why`, its card, its reason)
    try { if (classify(text, { lang, hasAction: !!d._repairable() })?.intent === 'explain') return null; } catch { /* continue */ }
    const wf = d._whyFact?.(plain(text));
    if (wf) return wf;
    // the world's own explanation comes first: a question that a world of the thread (the open tab, the world last used) reads completely is that world's (ui.help "why did you not understand", a music tempo, a map)
    try {
      const raw = await d._readSeg(text, sid), cx = this.s.context();
      if (raw && !raw.unparsed && [cx.tabWorld, cx.lastWorld].includes(raw.match?.worldId) && this.s._dryStatuses([raw]).every((x) => x === 'supported')) return null;
    } catch { /* the trace answers */ }
    const rec = [...this.log].reverse().find((r) => r.kind !== 'why');
    if (!rec) return null;
    const r = this.explain(rec, text);
    return this.tag(r, 'why');
  }

  /** The why-answer about one turn, in plain words: what was said, which reading, which default and its source, what came of it, and an offer to undo. */
  explain(rec, question = '') {
    const d = this.disc;
    const parts = [];
    const say = (s) => parts.push({ text: s, translate: true });
    const asked = d._quoted(rec.n, rec.said);
    parts.push({ text: 'You said ', translate: true }, asked, { text: '. ', translate: true });
    const read = rec.readAs?.[0];
    if (rec.unread?.length && !read) {
      say(`I could not read ${rec.unread.length > 1 ? 'those parts' : 'it'} as a whole request, so I did not do anything with it`);
      if (rec.unread.length > 1 || plain(rec.unread[0]) !== plain(rec.text)) parts.push({ text: ` (not read: ${rec.unread.map(quoted).join(', ')})`, translate: false });
      say('. ');
    } else if (read) {
      const place = read.world ? this.worldTitle(read.world) : null;
      say(`I read ${read.text === rec.text ? 'it' : ''}`);
      if (read.text !== rec.text) parts.push({ text: quoted(read.text), translate: false, quote: true });
      say(place ? ` as a request for ${/^the /i.test(place) ? '' : 'the '}${place}` : ' as a request');
      if (read.why) say(` ${/world of the active tab|open tab/.test(read.why) ? 'because it is the tab that was open' : /^because /.test(read.why) ? read.why.replace(/\s*\([^)]*\)/g, '') : `(${read.why.replace(/\s*\([^)]*\)/g, '')})`}`);
      say('. ');
      if (read.fixed?.length) say(`I changed ${read.fixed.map(([f, t]) => `${quoted(f)} to ${quoted(t)}`).join(' and ')} because I did not know the first word. `);
      if (read.took) say(`I took it as ${quoted(read.took)} after leaving out the words I could not use${read.ignored?.length ? ` (${read.ignored.map(quoted).join(', ')})` : ''}. `);
      else if (read.ignored?.length) say(`I did not use ${read.ignored.map(quoted).join(' and ')}. `);
    }
    if (rec.filled?.length) say(`${rec.filled.map((f) => `The ${f.role === 'action' ? 'action' : f.role} ${quoted(f.value)}`).join(' and ')} came from ${rec.filled.some((f) => f.source === 'knowledge') ? 'the usual words for that kind of request' : rec.filled.some((f) => f.source === 'scene') ? 'the scene' : 'what we had just talked about'}, because your words did not have ${rec.filled.length > 1 ? 'them' : 'it'}. `);
    for (const g of rec.guesses ?? []) say(`${cap(strip(g))}. `);
    // the world's own why (a default and its source): "I play at 100 beats per minute because nobody has set it: it is my default."
    if (rec.world) {
      try { const h = this.s.engine.interp.hook(this.s.isession, rec.world, 'why', { text: rec.text }); const tx = typeof h === 'string' ? h : h?.text; if (tx) say(`${strip(tx)}. `); } catch { /* no why hook */ }
    }
    if (rec.reply) { parts.push({ text: 'What I answered: ', translate: true }, d._shownOr(rec.n, rec.reply)); say('. '); }
    const act = rec.effect ? d.actions.find((a) => a.turn === rec.n) : null;
    if (act) {
      d.pending = { type: 'offer', accept: 'undo', action: act, world: act.worlds[0], expected: 'yes/no', question: 'Shall I undo it?', turn: this.s._msg };
      say('Shall I undo it? Say "yes" to undo, or tell me what you meant.');
    } else say('Tell me what you meant and I will try again.');
    return d._say(parts, { kind: 'explain', of: rec.text, world: rec.world, changed: act?.worlds ?? [], dialogue: 'why', turn: rec.n });
  }

  // ---- bare yes / no ---------------------------------------------------------------------------------------------------------------------------------
  async ack(ws, text, sid) {
    const d = this.disc, lang = this.lang;
    const yes = alts(lang, 'dialogue.yes'), no = alts(lang, 'dialogue.no'), polite = alts(lang, 'dialogue.polite');
    if (!ws.length || ws.length > 5) return null;
    const left = [];
    let i = 0, pol = null;
    while (i < ws.length) {
      budget.tick('dialogue.ack');
      const hit = [...yes.map((a) => ['yes', a]), ...no.map((a) => ['no', a]), ...polite.map((a) => ['polite', a])].filter(([, a]) => at(ws, i, a)).sort((x, y) => y[1].length - x[1].length)[0];
      if (!hit) return null;
      if (hit[0] !== 'polite') left.push(hit[0]);
      i += hit[1].length;
      pol = true;
    }
    if (!pol || !left.length || new Set(left).size !== 1) return null;
    const bare = left[0];
    if (!d.list && d._gameAsksYesNo?.()) return null;
    // a word some world reads as a request of its own (a music "stop", a game's "wait") is that request, not a refusal
    try { const raw = await d._readSeg(text, sid); if (raw && !raw.unparsed && this.s._dryStatuses([raw]).every((x) => x === 'supported')) return null; } catch { /* read as a bare answer */ }
    const a = this.recent(2), last = this.log.at(-1);
    if (bare === 'no' && a && last?.effect) {
      d.pending = { type: 'offer', accept: 'undo', action: a, world: a.worlds[0], expected: 'yes/no', question: 'Shall I undo it?', turn: this.s._msg };
      return this.tag({ reply: `OK. Do you want me to undo ${quoted(a.text)}? Say "yes" to undo it, or tell me what you meant.`, info: { kind: 'bare', answer: 'no', offer: 'undo', dialogue: 'ack' } }, 'ack');
    }
    return this.tag({ reply: `${bare === 'yes' ? 'Yes' : 'No'} to what? You can ask me a question, give me a command, or say "help" to see what I can do.`, info: { kind: 'bare', answer: bare, dialogue: 'ack' } }, 'ack');
  }

  // ---- the scene and the history ------------------------------------------------------------------------------------------------------------------------
  sceneQuestion(ws, text) {
    const lang = this.lang;
    if (!['did', 'have', 'were', 'was', 'do'].includes(ws[0]) || !['you', 'we'].includes(ws[1]) || this.log.length === 0) return null;
    const hist = alts(lang, 'dialogue.history');
    let rest = ws.slice(2);
    let past = false;
    while (rest[0] === 'not' || rest[0] === 'never' || rest[0] === 'already') { budget.tick('dialogue.scene'); rest = rest.slice(1); past = true; }
    const verb = rest[0];
    const verbs = new Set(this.log.flatMap((r) => (r.verb ?? '').split(' ').filter(Boolean)));
    if (!verb || !(verbs.has(verb) || verbs.has(verb.replace(/ed$/, '').replace(/e?d$/, '')) || contains(ws, hist) || past)) return null;
    if (!verbs.has(verb) && !contains(ws, hist)) return null;
    let obj = rest.slice(1);
    for (let k = 0; k < 4; k++) { const h = startsWith(obj.slice(-3), hist) ?? hist.find((a) => at(obj, obj.length - a.length, a)); if (h && at(obj, obj.length - h.length, h)) obj = obj.slice(0, obj.length - h.length); }
    obj = obj.filter((x) => !DETERMINERS.has(x) || isNumber(x) ? !DETERMINERS.has(x) : false);
    const noun = obj.at(-1);
    if (!noun) return null;
    const forms = new Set([noun, noun.replace(/s$/, ''), noun.replace(/es$/, ''), noun.replace(/ies$/, 'y'), `${noun}s`]);
    const f = this.facts();
    const inScene = f.things.filter((x) => forms.has(x.noun) || forms.has(x.noun.replace(/s$/, '')));
    const turns = this.log.filter((r) => r.effect && tokens(r.text).some((x) => forms.has(x)));
    let reply;
    if (inScene.length) {
      const n = inScene.reduce((a, x) => a + x.count, 0);
      reply = `Yes. There ${n === 1 ? 'is' : 'are'} ${n} ${inScene[0].noun}${n === 1 ? '' : 's'} in the picture now${turns.length ? `, from ${quoted(turns.at(-1).text)}` : ''}.`;
    } else if (turns.length) reply = `Yes, earlier you asked ${quoted(turns.at(-1).text)}, but there is no ${noun} in the picture now.`;
    else reply = `No, there is no ${noun} so far.${f.things.length ? ` What is here: ${f.things.map((x) => `${x.count} ${x.noun}${x.count === 1 ? '' : 's'}`).join(', ')}.` : ''}`;
    return this.tag({ reply, info: { kind: 'scene-question', noun, dialogue: 'question', found: inScene.length > 0 } }, 'question');
  }

  // ---- the session as facts --------------------------------------------------------------------------------------------------------------------------------
  /** Facts of the session any world can use as content: things (with counts), topics, games, places, what was asked. One implementation. */
  facts() {
    const d = this.disc, set = this.s.engine.set, st = this.s.isession.state;
    const things = [], items = [];
    for (const w of set.list()) {
      if (typeof w.ops?.referents !== 'function') continue;
      let refs = []; try { refs = d._refs(w.id); } catch { refs = []; }
      const by = new Map();
      for (const r of refs) by.set(r.noun ?? r.kind, (by.get(r.noun ?? r.kind) ?? 0) + 1);
      for (const [noun, count] of by) things.push({ noun, count, world: w.id });
      for (const r of refs) items.push({ id: `${w.id}:${r.id}`, kind: r.kind, noun: r.noun ?? r.kind, world: w.id, aspects: { ...(r.attrs ?? {}) } });   // identity, kind, aspects: the shape a session.things store holds
    }
    const topics = [...new Set([...(d.topics ?? []), ...this.log.map((r) => r.world)].filter((x) => x && !['ui.shell', 'ui.help', 'kids.common', 'core'].includes(x) && !/^session\./.test(x)))].map((x) => this.worldTitle(x));
    const games = Object.keys(st).filter((id) => id.startsWith('games.')).map((id) => ({ world: id, title: this.worldTitle(id), status: st[id]?.over ? 'finished' : st[id]?.phase ?? null, result: st[id]?.result ?? st[id]?.winner ?? null })).filter((g) => this.log.some((r) => r.world === g.world));
    const places = [...new Set([].concat(st['geo.map']?.shown ?? st['geo.map']?.places ?? st['geo.map']?.pins ?? []).map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean))];
    return { turns: this.log.length, things, items, topics, games, places, asked: this.log.filter((r) => r.kind === 'new').slice(-5).map((r) => r.text) };
  }


  // ---- continuation and list: complete the request from the focus ---------------------------------------------------------------------------------------------
  /**
   * A turn that lacks its verb or its thing is completed from the focus; a list inherits the verb of its first item. A completion is accepted only when the
   * focus world reads it completely (nothing ignored, the dry run supported), so the tab never gets a half request. Returns null when nothing completes.
   */
  async complete(text, sid) {
    const d = this.disc, lang = this.lang;
    if (!this.log.length) return null;
    if (this.log.at(-1).asked) return null;   // the last thing said was a question: the fragment is its answer, not a continuation
    const bare = strip(lang.stripConnective(plain(text)) || plain(text)).replace(/\b(?:too|as well|also)$/, '').trim();
    const bw = bare.split(' ').filter(Boolean);
    if (!bw.length || bw.length > 6) return null;
    // a question or a clause with a verb of its own is a request of its own
    if (/^(?:what|who|where|when|why|how|which|is|are|was|were|does|do|did|can|could|will|would|should|please)\b/.test(bw[0])) return null;
    const first = bw[0];
    const POS = (w) => lang.position?.(w) || lang.COMPARATIVES?.includes(w) || lang.degree?.(w) || lang.DEGREE_ADVERBS?.[w] != null || /^(?:further|more|less|still|even|bit|little|lot|lower|higher|left|right|up|down|top|bottom|upper|centre|center|middle|corner)$/.test(w);
    const placeish = PREPOSITIONS.has(first) || POS(first) || (['a', 'an', 'the'].includes(first) === false && bw.some(POS) && !DETERMINERS.has(first) && bw.length <= 3 && bw.every((w) => POS(w) || GRAMMAR.has(w)));
    const npish = !placeish && (DETERMINERS.has(first) || isNumber(first));
    if (!placeish && !npish) return this.completeList(text, sid);
    // every content word of the fragment must be a word some world knows: a free-text slot would otherwise swallow words nobody read ("the goat flies, fixeaza")
    const vocab = spellVocabulary(this.s.engine.set);
    const scene = new Set(this.effects().flatMap((r) => tokens(r.thing ?? '')));
    if (bw.some((w) => !isNumber(w) && !GRAMMAR.has(w) && !POS(w) && !scene.has(w) && !isKnownWord(w, vocab) && !isKnownWord(w.replace(/(?:es|s)$/, ''), vocab))) return null;
    const tab = this.s.context().tabWorld;
    const worlds = [...new Set([tab, this.effects()[0]?.world].filter(Boolean))].filter((w) => this.effects(w).length || w === tab);
    // the raw text first: when the open tab's world already reads it completely, it is a request of its own
    const raw = await d._readSeg(text, sid);
    if (raw && !raw.unparsed && raw.match?.worldId && worlds.includes(raw.match.worldId) && !raw.ignored?.length) return null;   // read whole by a world of the thread: its own reading, even an answer of "missing", stands
    for (const world of worlds) {
      const recs = this.thread(world);
      if (!recs.length) continue;
      const made = recs.filter((r) => r.made), moved = recs.filter((r) => r.changed);
      const verbs = [...new Set((npish ? (made.length ? made : recs) : moved).map((r) => r.verb).filter(Boolean))].slice(0, 3);
      const placeVerbs = [...new Set(moved.filter((r) => r.place).map((r) => r.verb).filter(Boolean))];
      const f = this.fill(['thing', 'action'], { world, scene: { thing: this.thingNow(world) } });
      const thing = f.thing?.value ?? null;
      const cands = [];
      if (npish) for (const v of verbs) cands.push({ text: `${v} ${bare}`, roles: { action: v } });
      else {
        // the verb of a place comes from the focus (what was done before), else from the words of the act `place` (the knowledge tier: the shared acts module)
        // the order of the catalog's verbs is not the order of use: the verbs that the examples of the world's own move operation start with come first, the most used first (the user's words are the world's words)
        const lead = new Map(); for (const p of this.s.engine.set.get(world)?.patterns ?? []) if (/action=[\w.]*(?:move|place)/.test(p.emit ?? '')) for (const e of p.examples ?? []) { budget.tick('dialogue.verbs'); const w0 = String(e).toLowerCase().split(/\s+/)[0]; lead.set(w0, (lead.get(w0) ?? 0) + 1); }
        const known = alts(lang, 'acts.verb.place').filter((a) => a.length === 1).map((a) => a[0]).filter((v) => !placeVerbs.includes(v)).sort((x, y) => (lead.get(y) ?? 0) - (lead.get(x) ?? 0));
        const pv = [...placeVerbs, ...verbs.filter((v) => !placeVerbs.includes(v)), ...known];
        const things = [thing, thing && /^all the /.test(thing) ? 'them' : 'it'].filter(Boolean);
        for (const v of pv) for (const th of things) cands.push({ text: `${v} ${th} ${bare}`, roles: { action: v, thing: th }, viaKnowledge: known.includes(v) && !placeVerbs.includes(v) && !verbs.includes(v) });
      }
      for (const c of cands) {
        budget.tick('dialogue.complete');
        const hit = await d._try(world, c.text, d._opts(sid));
        if (!hit) continue;
        const seg = hit.res.segments[0];
        let ok = seg.match.patternId !== 'unknown' && !seg.ignored?.length && !Object.values(seg.match.slots ?? {}).some((sl) => sl.class === 'rest');
        if (ok) { try { ok = this.s._dryStatuses(hit.res.segments).every((x) => x === 'supported'); } catch { ok = true; } }
        if (!ok) { this.s.isession.form.restore(hit.snap); continue; }
        this.note = Object.entries(c.roles).map(([role, value]) => ({ role, value, source: role === 'action' ? (c.viaKnowledge ? 'knowledge' : 'focus') : (f.thing?.source ?? 'focus') }));
        const info = { kind: 'continuation', dialogue: 'continuation', of: recs[0].text, fragment: text, rewritten: c.text, world, frameTurn: recs[0].n, filled: this.note };
        this._kind = 'continuation';
        return { pre: d._finish(hit, info) };
      }
    }
    return null;
  }

  /** "V a, b and c": the items that were not read inherit the verb of the item that was. */
  async completeList(text, sid) {
    const d = this.disc, s = this.s;
    if (!/[,;]|\band\b/i.test(text)) return null;
    const form = s.isession.form, snap = form.snapshot();
    let res = null;
    try { res = await s.engine.formalizers.rules.formalize(text, { ...d._opts(sid), worlds: s.engine.set }); } catch { res = null; } finally { form.restore(snap); }
    if (!res || res.segments.length < 2 || !res.segments.some((x) => x.unparsed) || res.segments.every((x) => x.unparsed)) return null;
    const head = res.segments.find((x) => !x.unparsed && verbOf(x.text));
    if (!head) return null;
    const verb = verbOf(head.text);
    const out = [];
    for (const seg of res.segments) {
      const w = tokens(seg.text);
      if (!seg.unparsed) { out.push(strip(seg.text)); continue; }
      if (!w.length || !(DETERMINERS.has(w[0]) || isNumber(w[0]))) return null;   // only items (things) inherit the verb; anything else stays as it is
      out.push(`${verb} ${strip(seg.text)}`);
    }
    const cand = out.join(' and ');
    let again = null;
    try { again = await s.engine.formalizers.rules.formalize(cand, { ...d._opts(sid), worlds: s.engine.set }); } catch { again = null; } finally { form.restore(snap); }
    if (!again || !again.segments.length || again.segments.some((x) => x.unparsed || x.ignored?.length)) return null;
    this._kind = 'list';
    return { rewrite: cand, info: { kind: 'list', dialogue: 'list', verb, items: out.length, fragment: text } };
  }
}

/** The place of a request: the words from its first preposition ("on the lake", "next to the house"), or a direction phrase. */
export function placeOf(text) {
  const ws = tokens(text);
  const i = ws.findIndex((w, k) => k > 0 && PREPOSITIONS.has(w));
  return i > 0 ? ws.slice(i).join(' ') : null;
}
