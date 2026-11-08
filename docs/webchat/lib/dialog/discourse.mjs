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

export const FRAME_LIMIT = 5;

/** Worlds whose commands are never remembered as frames: navigation, help, games (own state machines), shared vocabulary. */
const NO_FRAME = (w) => !w || w === 'ui.shell' || w === 'ui.help' || w === 'kids.common' || w === 'core' || w.startsWith('games.');

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
    const frame = { turn, world: m.worldId, patternId: m.patternId, kind: m.kind, text, slots, args, op: args.find((a) => a.key === 'action' || a.key === 'core.request.action')?.value ?? null };
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
}
