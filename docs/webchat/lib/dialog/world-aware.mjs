// SPDX-License-Identifier: AGPL-3.0-only
/**
 * World-aware reading (spec 16, FORMALIZE-FROM-WORLDS E2). Browser-safe: no `node:*` imports.
 *
 * The formalizer reads a message into wires without looking at the state of any world. This layer judges the readings it is about to act on against the
 * world instances, WITHOUT telling anything (the library's `score`, through `ReasonerSession.score`, and the worlds' read-only `checkReferents` hook),
 * behind the session option `worldAware` (default `off`: nothing below runs):
 *
 *   veto     a reading that leaves out content words of the message, or names an entity the world does not have, is not acted on: the clause becomes
 *            "not understood", or a question built from the world ("There is no shape called End. Shall I add it?"), never a wrong action.
 *   choose   veto, and where the rules (or the best-effort reader) found several readings of one clause they are all scored and the library's `rank`
 *            picks one, with an explanation. A reading that the world cannot take, or that leaves words out, loses to one that does not.
 *   observe  diagnostic: judges and records (`seg.wa`, `seg.pick`), changes nothing.
 *
 * The order is the library's (`rank`, RANKING): consistent, referents left ambiguous, lacks, words left out, assumptions, then the given order. Nothing
 * is learned and nothing is weighted: a reading is dropped for a named reason, and every decision is recorded on the segment (`wa`, `veto`, `pick`).
 */
import { budget } from './budget.mjs?v=00bce6e369';
import { restrictedSet } from '../formalizer/spell.mjs?v=dc2470c516';
import { editDistance } from '../formalizer/rules/normalize.mjs?v=3ec9167cca';
import { foreignFragment } from './continuation.mjs?v=330ee831af';
import { liveFromContext } from './meta-worlds.mjs?v=1bca279ce7';

export const WORLD_AWARE_MODES = Object.freeze(['off', 'veto', 'choose', 'observe', 'veto-strict', 'choose-strict']);
/** The default mode (user decision 2026-11-12): an unset option is `veto`; an explicit `off` turns the layer off. */
export const DEFAULT_WORLD_AWARE = 'veto';
export const normalizeWorldAware = (v) => (WORLD_AWARE_MODES.includes(v) ? v : DEFAULT_WORLD_AWARE);
/** `veto-strict` and `choose-strict` are `veto` and `choose` that also veto a partial reading (words of the message left out by the partial-understanding window). */
export const baseMode = (m) => String(m ?? 'off').replace(/-strict$/, '');

/** The reasons a reading can be vetoed. The default set is the one the measurements support (spec 16, section 6); `-strict` adds `words-partial`; `PSYS2_WA_KINDS` (a comma list) overrides for experiments. */
export const VETO_KINDS = Object.freeze(['no-referent', 'no-game', 'no-continuation', 'words-best-effort']);
/** `library`: the library's own `veto(result)` on the reading (its reasons except `inconsistent` (the world's refusal, answered), `nothing` and `action-unavailable` (an action the operations carry out)). Not in the default set: opt in with `PSYS2_WA_KINDS`. */
const kinds = (mode) => {
  const e = globalThis.process?.env?.PSYS2_WA_KINDS;
  if (e) return new Set(e.split(',').map((x) => x.trim()));
  return new Set(/-strict$/.test(String(mode)) ? [...VETO_KINDS, 'words-partial'] : VETO_KINDS);
};
const NEAR = (w, text) => String(text ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu)?.some((x) => x !== w && x.length >= 3 && w.length >= 3 && editDistance(w, x) <= (w.length >= 6 ? 2 : 1)) ?? false;

/** Words that may be left out of a message without changing what it asks for. Everything else counts as content (interrogatives and auxiliaries too: "is" turns a command into a question). */
export const FILLER = new Set(['please', 'pls', 'plz', 'kindly', 'now', 'just', 'also', 'then', 'ok', 'okay', 'so', 'well', 'and', 'the', 'a', 'an', 'it', 'to', 'of', 'that', 'this', 'really',
  'hey', 'hi', 'hello', 'thanks', 'thx', 'ty', 'rly', 'rlly', 'kno', 'know', 'u', 'ya', 'haha', 'yo', 'idk', 'btw', 'lil', 'bit', 'kinda', 'sorta', 'thank', 'you', 'lol', 'um', 'umm', 'uh', 'uhh', 'hmm', 'oh', 'yes', 'yeah', 'maybe', 'could', 'would', 'can', 'will', 'for', 'me', 'my', 'too', 'again', 'quickly', 'actually']);

const words = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const val = (w, k) => w.entries.find((e) => e.key === k)?.value?.v;

/** The words of the message a reading leaves out, from what the formalizer reports (ignored parts, best effort), content words only. */
export function leftOut(seg, foreign = false) {
  const raw = [...(seg.ignored ?? []), ...(seg.bestEffort?.ignored ?? [])].flatMap((x) => words(typeof x === 'string' ? x : x?.text ?? x?.word));
  const read = seg.bestEffort?.took ?? seg.text;
  return [...new Set(raw)].filter((w) => !FILLER.has(w) && !NEAR(w, read) && !(foreign && w.length <= 3) && !(w.length <= 2 && !/\d/.test(w)));   // a word the reading spells another way ("lie" for "like") was corrected, not left out
}

/** The request wire of a reading as { world, action, args }, or null (a question or a statement). */
export function requestOf(seg) {
  const w = (seg.wires ?? []).find((x) => x.type === 'core.request');
  if (!w) return null;
  const args = {};
  for (const e of w.entries) if (e.key.startsWith('core.request.arg.')) args[e.key.slice('core.request.arg.'.length)] = String(e.value.v);
  return { world: seg.match?.worldId ?? val(w, 'core.in') ?? null, action: val(w, 'core.request.action'), args };
}

/**
 * A world's read-only `checkReferents(ctx, { action, args })` hook, called without leaving a trace: the hook's context creates an empty state for a world
 * that has none, and that empty state is removed again (a session state that gained a key is a change).
 */
function referentsOf(dialog, seg) {
  const rq = requestOf(seg);
  if (!rq?.world || !rq.action) return null;
  if (typeof dialog.engine.set.get(rq.world)?.ops?.checkReferents !== 'function') return null;
  const st = dialog.isession.state;
  const had = rq.world in st;
  let r;
  // the hook reads a COPY of the state (a world's `ensure` fills defaults into the state it is given)
  try { r = dialog.engine.interp.hook(dialog.isession, rq.world, 'checkReferents', { action: rq.action, args: rq.args }, { state: st[rq.world] ?? {} }); } catch { r = undefined; }
  if (!had && st[rq.world] && Object.keys(st[rq.world]).length === 0) delete st[rq.world];
  return r?.missing?.length ? { ...r, world: rq.world } : null;
}

/** What the reading is: a question (asks a value), a request (an action) or a statement (tells facts). */
const readingKind = (seg) => ((seg.wires ?? []).some((w) => w.type === 'core.question') ? 'question' : (seg.wires ?? []).some((w) => w.type === 'core.request') ? 'request' : 'statement');

/**
 * A move in a game that is not running, asked from another tab ("put it in the top right corner" on the Drawing tab is not a tic-tac-toe move): the reading's
 * world declares `tabKind=game`, is not the open tab's world, has no game running in this session, and the action is not the one that starts a game. Read-only:
 * the open tab and the running game come from the session context, the kind and the starting action from the world's manifest.
 */
function idleGame(dialog, seg) {
  const rq = requestOf(seg);
  if (!rq?.world || !rq.action) return null;
  const w = dialog.engine.set.get(rq.world);
  if (!(w?.tab?.kind === 'game' || String(rq.world).startsWith('games.'))) return null;   // the manifest says tabKind=game; the built-in game tabs (tic-tac-toe, guess, hangman) have no manifest tab, only the games. id prefix
  const ctx = dialog.context();
  if (ctx.tabWorld === rq.world || ctx.gameWorld === rq.world || ctx.modalWorld === rq.world) return null;
  // With no tab open a move the router takes into the game is how a game starts ("Top right" opens tic-tac-toe, as the world tests define): acting is not wrong.
  if (!ctx.tabWorld) return null;
  // A message that names the game ("Can u rotate the chess board?") is for that game, whatever tab is open.
  try { if (seg.text && dialog._worldsNamedIn(seg.text).has(rq.world)) return null; } catch { /* keep going */ }
  if (rq.action === w.gameControls?.new) return null;
  return { world: rq.world, title: String(w.title ?? rq.world).replace(/\s*\(.*\)\s*$/, ''), action: rq.action };
}

/**
 * Whether the open tab's own world reads the message completely (the rules of that world alone). The `no-game` veto needs it: a game move from another tab is
 * only wrong when the open tab has a reading of its own ("put it in the top right corner" on the Drawing tab); when it has none, the router's reading is the
 * only one, and taking the move into the game (opening its tab, starting it) is what the world tests define. Never throws; false when it cannot tell.
 */
async function tabReads(dialog, seg) {
  try {
    const ctx = dialog.context();
    const w = dialog.engine.set.get(ctx.tabWorld);
    if (!w?.patterns?.length) return false;
    const res = await dialog.engine.formalizers.rules.formalize(seg.text, { worlds: restrictedSet(dialog.engine.set, [ctx.tabWorld]), session: dialog.isession, source: 'wa', context: ctx, router: dialog.engine.router });
    return !!res.segments.length && res.segments.every((x) => !x.unparsed && !x.ignored?.length && !x.partial && !x.bestEffort);
  } catch { return false; }
}

/** What the world instances say about one reading: the library's scored candidate, reduced to what the layer uses. */
function judgeOne(rs, seg, foreign) {
  const left = leftOut(seg, foreign);
  const r = rs.score([{ wires: seg.wires, unused: left }]);
  return { c: r.results[0], left };
}

const summary = (j, seg) => ({
  judged: j.c.judged, judgedBy: j.c.judgedBy ?? null, libVeto: j.c.libVeto?.answer === false ? j.c.libVeto.reasons : null, ok: j.c.ok, world: j.c.world, kind: j.c.kind ?? null, action: j.c.actionName ?? null,
  availability: j.c.action ? { available: j.c.action.available, status: j.c.action.status } : null,
  answer: j.c.answer ? { status: j.c.answer.status } : null,
  lacks: (j.c.lacks ?? []).map((l) => l.referent ?? l.key ?? '?').slice(0, 4),
  violations: (j.c.violations ?? []).map((v) => v.why ?? v.kind).slice(0, 2),
  isQuestion: !!seg.isQuestion, reading: readingKind(seg),
  left: j.left, how: seg.bestEffort ? 'best-effort' : seg.partial || seg.ignored?.length ? 'partial' : seg.corrections?.length ? 'spelled' : 'exact',
});

const plural = (n) => (/(?:s|x|ch|sh)$/.test(n) ? `${n}es` : /[^aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : `${n}s`);
const quoted = (n) => `\u201c${n}\u201d`;
const orList = (xs, w = 'or') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${w} ${xs.at(-1)}`);
/**
 * The sentence for a reading that names what the world does not have, in plain words: the user's label in quotes, the noun the user (or the world, in its
 * everyday word: "box", never "shape") used, then one short question (the offer to add it) or what the world does have.
 */
export function sayMissing(ref) {
  const names = ref.missing.map((m) => quoted(m.name));
  const noun = ref.missing[0].kind || 'thing';
  if (ref.offer) {
    const many = names.length > 1;
    return { text: `I can't find ${many ? plural(noun) : `a ${noun}`} called ${orList(names)}. Shall I add ${many ? 'them' : 'it'}?`, question: `Shall I add ${many ? 'them' : 'it'}?` };
  }
  const where = ref.where ?? 'world';
  return { text: `I can't find ${orList(names)} in the ${where}. ${ref.here ? `In the ${where} I can see: ${ref.here}.` : `The ${where} is empty.`}` };
}

/**
 * One clause that coordinates a thing the world does not have with an earlier part ("clear everything and zork the plimp"): the whole request is held (nothing runs on a
 * partly read sentence), and the reply names the part that was read and not acted on, as the hold of separate clauses does.
 */
function heldPart(text, missing) {
  const t = String(text ?? ''), low = t.toLowerCase();
  const at = Math.min(...missing.map((m) => low.indexOf(String(m.name).toLowerCase())).filter((i) => i > 0));
  if (!Number.isFinite(at)) return '';
  const m = /^(.*\S)\s*(?:,|\band\b|\bthen\b|\balso\b|\bplus\b)[\s,]*$/i.exec(t.slice(0, at));
  return m && m[1].split(/\s+/).length >= 2 ? ` I did not act on "${m[1].trim()}" either, because I could not read all of your message.` : '';
}

/** The reason a reading must not be acted on, from what the world says of it; null when it may stand. */
export function vetoOf(wa, seg, ref, mode) {
  const k = kinds(mode);
  if (wa.idle && k.has('no-game')) return { kind: 'no-game', why: `no ${wa.idle.title} game is running and its tab is not open`, say: `We are not playing ${wa.idle.title} right now. Tell me you want to play it, then say your move.`, status: 'missing' };
  if (wa.fragment && k.has('no-continuation')) return { kind: 'no-continuation', why: `a piece without a verb of its own, read by ${wa.fragment.world}, which has nothing running and is not the open tab`, say: `I am not sure how “${seg.text}” fits what we were doing. Please say the whole request.`, status: 'missing' };
  if (ref && k.has('no-referent')) {
    const s = sayMissing(ref);
    s.text += heldPart(seg.text, ref.missing);
    return { kind: 'no-referent', why: `the world has no ${ref.missing.map((m) => m.name).join(' or ')}`, say: s.text, status: 'missing', ...(ref.offer ? { offer: { rewrite: ref.offer, world: ref.world, question: s.question } } : {}) };
  }
  if (k.has('library') && wa.libVeto?.some((x) => !LIB_KEEP.has(x))) { const why = wa.libVeto.filter((x) => !LIB_KEEP.has(x)); return { kind: 'library', why: `the library's veto: ${why.join(', ')}`, reasons: why }; }
  if (wa.left.length && wa.how === 'best-effort' && k.has('words-best-effort')) return { kind: 'words-best-effort', why: `the reading leaves out "${wa.left.join('", "')}"`, words: wa.left };
  if (wa.left.length && wa.how !== 'best-effort' && k.has('words-partial')) return { kind: 'words-partial', why: `the reading leaves out "${wa.left.join('", "')}"`, words: wa.left };
  return null;
}

/** The library's veto reasons that are not a veto for the host: the world's own refusal (answered, with its reason), no reading, and an action that the matrix does not declare (the operations carry it out). */
const LIB_KEEP = new Set(['inconsistent', 'nothing', 'action-unavailable']);
const HOLDS = new Set(['no-referent', 'words-partial', 'words-best-effort', 'library']);

/**
 * Review the readings of a message (segments as the formalizer or the dispatcher gave them) before anything is executed. Returns the segments, with a
 * vetoed one replaced by an unparsed clause that says why (`veto: { kind, why, say?, offer? }`). Never throws: a failure to judge keeps the reading.
 */
export async function reviewSegments(dialog, segments, { mode }) {
  const rs = dialog.isession?.rs;
  if (mode === 'off') return segments;
  const reviewed = await reviewEach(dialog, segments, mode, rs);
  // Nothing is half done: when a clause of a message is vetoed, the readable clauses are held back too, because a later clause may rest on an earlier one
  // ("Azi este vineri. Mâine ce zi este?" must not tell the first and lose the second). The reply says which clause was not read.
  // (Only for a clause that could not be read as asked. A move in a game that is not running is the spurious extra reading of a correction ("No, the editor",
  // "sorry, I meant o"): the other clauses of that message are the real ones and run.)
  if (baseMode(mode) !== 'observe' && reviewed.some((s) => s.veto && HOLDS.has(s.veto.kind))) {
    return reviewed.map((s) => (s.unparsed || !s.wires?.length ? s
      : { ...s, unparsed: true, wires: [], match: null, alternatives: [], errors: [], corrections: [], ignored: [], partial: false, bestEffort: null,
        veto: { kind: 'held', why: 'another clause of the message was not acted on', say: `I did not act on "${s.text}" because I could not read all of your message. Please say it again.`, status: 'missing' }, wa: { ...(s.wa ?? {}), veto: 'held' } }));
  }
  return reviewed;
}

async function reviewEach(dialog, segments, mode, rs) {
  const out = [];
  for (const seg of segments) out.push(await reviewOne(dialog, seg, mode, rs, segments.slice(0, out.length)));
  return out;
}

async function reviewOne(dialog, seg, mode, rs, before = []) {
  {
    if (seg.unparsed || !seg.wires?.length) return seg;
    budget.tick('world-aware.segment');
    let wa, ref = null;
    const foreign = !!dialog._waLang && dialog._waLang !== 'en';   // a Romanian message: a word of 3 letters or fewer that the translator left ("la", "cu", "pe") is a function word, not content
    try {
      wa = rs ? summary(judgeOne(rs, seg, foreign), seg) : { judged: false, ok: true, isQuestion: !!seg.isQuestion, reading: readingKind(seg), left: leftOut(seg, foreign), lacks: [], violations: [], how: seg.bestEffort ? 'best-effort' : seg.ignored?.length ? 'partial' : 'exact' };
      ref = referentsOf(dialog, seg);
      // the worlds' state is the state before the message: a name that an earlier clause of the same message mentions ("Add a box called Home. Connect Valid to Home") may be made by it
      if (ref && before.length) {
        const said = before.map((b) => String(b.text ?? '').toLowerCase()).join(' ');
        const missing = ref.missing.filter((m) => !said.includes(String(m.name).toLowerCase()));
        ref = missing.length ? { ...ref, missing } : null;
      }
    } catch { return seg; }
    if (ref) wa.missing = ref.missing.map((m) => m.name);
    try { const idle = idleGame(dialog, seg); if (idle && await tabReads(dialog, seg)) wa.idle = idle; } catch { /* keep the reading */ }
    try {
      const mw = kinds(mode).has('no-continuation') ? await dialog.engine.prepareMeta?.() : null;   // who may take a piece without a verb is a rule of meta.worlds
      const fr = foreignFragment(dialog, seg, mw && ((text) => mw.route({ text, live: liveFromContext(dialog.context(), { sceneKeys: ['thing', 'kind', 'name'] }), fragment: true }).blocked));
      if (fr) wa.fragment = fr;
    } catch { /* keep the reading */ }
    wa.foreign = foreign;
    seg.wa = wa;
    if (baseMode(mode) === 'observe') return seg;
    const veto = vetoOf(wa, seg, ref, mode);
    if (!veto) return seg;
    return { ...seg, unparsed: true, wires: [], match: null, alternatives: [], errors: [], corrections: [], ignored: [], partial: false, bestEffort: null, veto, wa: { ...wa, veto: veto.kind } };
  }
}

const MAX_READINGS = 4;

/**
 * The hook the rule formalizer calls with the readings it found for one clause (`pick`, in `choose` and `observe` mode): the distinct readings are scored
 * against the world instances and put in the library's order. Returns `{ matches, note }`: in `choose` mode the matches are reordered when the library's first
 * reading is not the host's (the library decided on a criterion, not on the given order); `note` records both choices, the scores and the library's explanation.
 */
export function makePicker(dialog) {
  return (matches, { wiresOf }) => {
    const rs = dialog.isession?.rs;
    if (!rs) return null;
    budget.tick('world-aware.pick');
    const cands = [], seen = new Set();
    for (const m of matches) {
      if (cands.length >= MAX_READINGS) break;
      const wires = wiresOf(m);
      if (!wires?.length) continue;
      const sig = `${m.pattern.worldId}|${wires.map((w) => `${w.type}:${w.entries.filter((e) => !e.key.startsWith('core.') || /core\.(request|question)\./.test(e.key)).map((e) => `${e.key}=${e.value?.v}`).join(',')}`).join(';')}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      cands.push({ m, wires });
    }
    if (cands.length < 2) return null;
    const r = rs.score(cands.map((c) => ({ wires: c.wires })));
    const id = (c) => `${c.m.pattern.worldId}:${c.m.pattern.id}`;
    // The host's own criterion, before the library's (spec 16, section 4): a reading that moves in a game that is not running, while another reading exists, comes last.
    const idle = cands.map((c) => { try { return idleGame(dialog, { wires: c.wires, match: { worldId: c.m.pattern.worldId } }) ? 1 : 0; } catch { return 0; } });
    r.order = r.order.slice().sort((a, b) => idle[a] - idle[b]);
    const top = r.order[0];
    const note = {
      source: 'rules', host: id(cands[0]), library: id(cands[top]), libraryDefault: id(cands[r.libraryOrder[0]]), disagree: top !== 0, applied: false,
      readings: cands.map((c, i) => ({ reading: id(c), judged: r.results[i].judged, judgedBy: r.results[i].judgedBy ?? null, ok: r.results[i].ok, lacks: (r.results[i].lacks ?? []).length, idleGame: !!idle[i], place: r.ranked[i].place, why: r.ranked[i].why })),
    };
    if (top === 0 || baseMode(dialog._wa) !== 'choose') return { matches, note };
    note.applied = true;
    return { matches: [cands[top].m, ...matches.filter((m) => m !== cands[top].m)], note };
  };
}

/**
 * The best-effort reader's verified candidates (loose words read by the rules): in `choose` mode the library orders them (words left out count), in
 * `veto` and `choose` mode a first candidate that leaves out content words is not executed ("Did you mean ...?" instead).
 * `verified` items are `{ c: { text, world, ignored, score }, res: { segments } }`. Returns `{ verified, note, veto }`.
 */
export function reviewBestEffort(dialog, verified) {
  const mode = baseMode(dialog._wa);
  const rs = dialog.isession?.rs;
  const foreign = !!dialog._waLang && dialog._waLang !== 'en';
  const left = (v) => (v.c.ignored ?? []).flatMap((x) => words(x)).filter((w) => !FILLER.has(w) && !NEAR(w, v.c.text) && !(foreign && w.length <= 3) && !(w.length <= 2 && !/\d/.test(w)));
  let order = verified.map((_, i) => i), note = null;
  if (rs && verified.length > 1) {
    try {
      const r = rs.score(verified.map((v) => ({ wires: v.res.segments.flatMap((x) => x.wires), unused: left(v) })));
      order = r.order;
      note = { source: 'best-effort', host: verified[0].c.text, library: verified[order[0]].c.text, libraryDefault: verified[r.libraryOrder[0]].c.text, disagree: order[0] !== 0, applied: false,
        readings: verified.map((v, i) => ({ reading: v.c.text, judged: r.results[i].judged, ok: r.results[i].ok, lacks: (r.results[i].lacks ?? []).length, left: left(v), place: r.ranked[i].place, why: r.ranked[i].why })) };
    } catch { order = verified.map((_, i) => i); }
  }
  let out = verified;
  if (mode === 'choose' && order[0] !== 0) { out = order.map((i) => verified[i]); if (note) note.applied = true; }
  const first = out[0];
  const veto = (mode === 'veto' || mode === 'choose') && kinds(dialog._wa).has('words-best-effort') && left(first).length ? { kind: 'words-best-effort', words: left(first), why: `the reading leaves out "${left(first).join('", "')}"` } : null;
  return { verified: out, note, veto };
}

/**
 * An unparsed clause explained from the world: today, "switch to klingon" (a language the app does not have) answers with the languages it has, read from the
 * ui.shell knowledge base. Returns the sentence or null.
 */
export function explainUnparsed(dialog, text) {
  const m = /^\s*(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:switch|change|go|speak|talk|set|use|translate)\s+(?:the\s+)?(?:(?:language|chat)\s+)?(?:over\s+)?(?:to|into|in)\s+([\p{L}]+)\s*[.!?]?\s*$/iu.exec(String(text ?? ''));
  const rs = dialog.isession?.rs;
  if (!m || !rs) return null;
  let langs;
  try { langs = rs.peek('ui.shell').ofType('ui.shell.lang').map((f) => String(f.attrs.word?.[0] ?? '').replace(/^"|"$/g, '')).filter((w) => w.length > 2); } catch { return null; }
  if (!langs?.length || langs.includes(m[1].toLowerCase())) return null;
  const cap = langs.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return `I do not speak ${m[1]}. The languages I have: ${cap.length < 2 ? cap.join('') : `${cap.slice(0, -1).join(', ')} and ${cap.at(-1)}`}.`;
}
