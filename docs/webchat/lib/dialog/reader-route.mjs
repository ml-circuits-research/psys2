// SPDX-License-Identifier: AGPL-3.0-only
/**
 * READER-ROUTE (spec 16, section 7). Browser-safe: no `node:*` imports.
 *
 * The library's reader core (`interpret` over `core.word` facts) as a THIRD source of readings next to the rules and the encoder, behind the session option `reader`
 * (`'off'` default, `'fill'`, `'choose'`; environment `PSYS2_READER`). The words are the English `core.word` facts of a world's `describe.sop`; the operations, their
 * arguments and their emit templates are the world's `core.describe` wires. The library's readings are turned into the same dialogue wires the rules produce (the
 * description's own `emit` template, filled with what the library found), so they can be acted on, and judged by the same world-aware `rank`.
 *
 * The mapping of `means=` (the 0.12 finding: only kids.shop's words resolved, the others were "unknown-word" warnings because a `means` is an emit key, not a name of the
 * matrix): the reader keeps its own small library world per described world, in which every `means` has a place the library knows: an operation is a type, its argument
 * is a slot of that type (`op.arg` is the key), the values of a lexicon class are entities of the class (`lex.x` is a type with an identifying key), a number is a number
 * slot. Nothing of the matrix is touched: the reader world holds no state of the user; the reading is judged on the real instance afterwards (`ReasonerSession.score`).
 *
 * Read-only, with a budget: `interpret` and `score` run under the turn's budget; nothing is told to any world; a failure keeps the other readings.
 */
import { buildWires, SEGMENT_SLOT } from '../formalizer/rules/emit.mjs?v=8e51d17dc1';
import { lexIndex } from '../worlds/lexicon.mjs?v=bb669c2500';
import { parseNumberRun, isNumberWord } from '../formalizer/rules/numbers.mjs?v=bceb69c353';
import { budget } from './budget.mjs?v=00bce6e369';
import { editDistance } from '../formalizer/rules/normalize.mjs?v=6e86079e49';
import { FILLER, leftOut } from './world-aware.mjs?v=9c4659b787';

/**
 * What the reader may take (measured, spec 16 section 7.4): `freeText` (an argument that takes any words, class `rest`/`noun`/`words`: the descriptions cover only part of a world, so
 * a word they do not know may be content the rules know ("underline"); off), `maxAssume` (the largest edit distance of a word the library read as a near known word),
 * `anchor` (the reading must rest on a content word of the description, spelled as in it or one letter away: "is Kyoto" alone is not "is Kyoto landlocked").
 */
export const READER_POLICY = { freeText: false, maxAssume: 1, anchor: true };

export const READER_MODES = Object.freeze(['off', 'fill', 'choose']);
export const normalizeReader = (v) => (READER_MODES.includes(v) ? v : 'off');

const tokensOf = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+(?:\.\d+)?/gu) ?? [];
/** Words that carry no content for the reader: the host's fillers, the question words and auxiliaries, prepositions and pronouns (an operation's own prepositions are in its description). */
const GLUE = new Set([...FILLER, 'what', 'whats', "what's", 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'how', 'which', 'who', 'where', 'when', 'why', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'there',
  'these', 'those', 'be', 'i', 'you', 'we', 'am', 'if', 'or', 'as', 'its', "it's", 'your', 'our', 'us', 'them', 'they', 'he', 'she', 'his', 'her', 'has', 'have', 'had', 'tell', 'let', 'lets', "let's", 'want', 'need', 'like']);
const NEGATION = /\b(?:not|no|never|none|nothing|without|dont|don't|cant|can't|wont|won't|isnt|isn't|doesnt|doesn't|didnt|didn't|nope)\b/i;
/** A word text as one token: lowercase, the spaces of a multi-word word as `_` (the library keeps the quotes of a quoted text, so a token never needs them). */
const tok = (t) => String(t).toLowerCase().trim().replace(/\s+/g, '_');
const quote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// ---- the reader world of one described world ------------------------------------------------------------------------------------------------

/**
 * Builds the reader world of `worldId` from its `describe.sop` (`set.get(id).descReader`). Returns null when the world has no English description.
 * `{ world, ops, multi, entities, coverage }`: `ops` maps an op to `{ desc, slots, roleWords }`; `coverage` counts the words and where each `means` resolved.
 */
function buildReaderWorld(lib, set, worldId) {
  const w = set.get(worldId);
  const read = w?.descReader;
  if (!read) return null;
  const descs = [...read.descriptions.values()].filter((d) => d.op && d.emit && d.words.has('en'));
  if (!descs.length) return null;
  const lex = lexIndex(set);
  const world = new lib.World({ lemma: (tok) => [lex.lemma(String(tok).toLowerCase())] });
  let n = 0;
  const id = () => `r${++n}`;
  const schema = [], facts = [], wordLines = [];
  const ops = new Map(), entityClasses = new Set();
  const refId = (v) => String(v).replace(/^\$/, '');
  const mapped = new Set();   // source word wires that some description of the world uses and that resolved
  for (const d of descs) {
    // several descriptions may share an `op` (a title and a heading are one action with another emit): each description is its own type of the reader world, named by its id
    const T = d.id;
    const slots = [];
    for (const a of d.args) {
      if (a.cls === 'number') { schema.push(`@${id()} core.slot of=${T} key=${a.name} kind=number`); slots.push({ ...a, type: 'number' }); }
      else if (a.cls.startsWith('lex.') && lex.lexicons.get(a.cls)) { schema.push(`@${id()} core.slot of=${T} key=${a.name} type=${a.cls}`); entityClasses.add(a.cls); slots.push({ ...a, type: 'entity' }); }
      else { schema.push(`@${id()} core.slot of=${T} key=${a.name} kind=string`); slots.push({ ...a, type: 'free' }); }
      if (a.qty) schema.push(`@${id()} core.slot of=${T} key=${a.qty} kind=number`);   // the quantity of a quantified item ("2 pens")
    }
    if (!d.args.length) schema.push(`@${id()} core.slot of=${T} key=_ kind=atom`);   // a type the library knows, whatever it takes
    const o = { T, desc: d, slots, roleWords: new Set() };
    ops.set(T, o);
    // the words of this description, by role: a role word means the description (its type); the words of an argument (`prep.x`, `det.x`, `unit.x`) mean the key `T.x`
    const wire = d.words.get('en').wire;
    const seen = new Set();
    for (const e of wire.entries) {
      const m = /^(verb|tverb|noun|ask|rest|pre|mid|subject|prep\.\w+|det\.\w+|unit\.\w+)$/.exec(e.key);
      if (!m) continue;
      const wd = read.words.get(refId(e.value.v));
      if (!wd) continue;   // words have no language since sopworld 0.13; the description's own `lang=en` wording picked them
      const key = e.key.includes('.') ? `${T}.${e.key.split('.')[1]}` : T;
      const text = tok(wd.text);
      if (seen.has(`${text}|${key}`)) continue;
      seen.add(`${text}|${key}`);
      wordLines.push(`@${id()} core.word text=${/^[\p{L}\p{N}_.-]+$/u.test(text) ? text : quote(text)} means=${key}`);
      o.roleWords.add(text);
      mapped.add(wd.id);
    }
  }
  const entities = new Map();   // class -> Set(name)
  for (const cls of entityClasses) {
    schema.push(`@${id()} core.slot of=${cls} key=name id=true`);
    const names = new Set(lex.lexicons.get(cls).words);
    entities.set(cls, names);
    facts.push(...[...names].map((name) => `@${id()} ${cls} name=${/^[\w-]+$/.test(name) ? name : quote(name)}`));
  }
  world.load(schema.join('\n'));
  world.tell(facts.join('\n'));
  world.tell(wordLines.join('\n'));
  const en = [...read.words.values()].filter((x) => !x.of);
  const lexicon = world.words();
  const cov = { words: en.length, mapped: en.filter((x) => mapped.has(x.id)).length, unmapped: en.filter((x) => !mapped.has(x.id)).map((x) => x.id), descriptions: descs.length, types: ops.size, entityClasses: entityClasses.size,
    wordLines: wordLines.length, resolved: [...lexicon.values()].reduce((k, es) => k + es.filter((e) => e.meanings.length).length, 0), warnings: world.warnings.filter((x) => x.kind === 'unknown-word').length };
  // the tokens the host merges before the library sees them: multi-word texts of words and names ("how_many_people_live_in" is one token, "new_york" too)
  const multi = new Map();
  const addMulti = (parts, merged) => { if (parts.length > 1) (multi.get(parts[0]) ?? multi.set(parts[0], []).get(parts[0])).push({ parts, merged }); };
  for (const [text] of lexicon) addMulti(text.split('_'), text);
  for (const names of entities.values()) for (const name of names) if (name.includes('_')) addMulti(name.split('_'), name);
  for (const list of multi.values()) list.sort((a, b) => b.parts.length - a.parts.length);
  const known = new Set([...lexicon.keys()]);
  const nameSet = new Set([...entities.values()].flatMap((x) => [...x]));
  return { worldId, world, ops, multi, known, nameSet, lex, coverage: cov };
}

/** The reader worlds of a loaded set (memoized on it): `Map(worldId -> reader world)`. */
export function readerWorlds(lib, set) {
  return set.memo('reader-worlds', () => {
    const out = new Map();
    for (const w of set.list()) {
      let rw = null;
      try { rw = buildReaderWorld(lib, set, w.id); } catch (e) { rw = null; out.errors = [...(out.errors ?? []), `${w.id}: ${String(e?.message ?? e).slice(0, 120)}`]; }
      if (rw) out.set(w.id, rw);
    }
    return out;
  });
}

// ---- frames --------------------------------------------------------------------------------------------------------------------------------

/** One clause as tokens for the library: numbers as digits, multi-word words and names merged, a plural name as its singular. */
function clauseTokens(text, rw) {
  const raw = tokensOf(text);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    budget.tick('reader.tokens');
    const t = raw[i];
    if (/^\d+(?:\.\d+)?$/.test(t)) { out.push({ t, num: Number(t) }); continue; }
    if (isNumberWord(t)) { const r = parseNumberRun(raw, i); if (r) { out.push({ t: String(r.value), num: r.value }); i += r.length - 1; continue; } }
    const m = (rw.multi.get(t) ?? []).find((c) => c.parts.every((p, k) => raw[i + k] === p));
    if (m) { out.push({ t: m.merged }); i += m.parts.length - 1; continue; }
    if (!rw.known.has(t) && !rw.nameSet.has(t)) { const l = rw.lex.lemma(t); if (l !== t && (rw.known.has(l) || rw.nameSet.has(l))) { out.push({ t: l, was: t }); continue; } }
    out.push({ t });
  }
  return out;
}

const verbish = (rw, t) => (rw.world.words().get(t) ?? []).some((e) => e.meanings?.some((m) => m.kind === 'type' || m.kind === 'action'));

/** Alternative splits of a text: the clauses one by one and, for a compound text, as one clause (the library keeps the better). */
function framesOf(text, rw) {
  const cl = String(text ?? '').split(/\s*(?:[.;?!]+|,|\band then\b|\bthen\b|\band also\b|\balso\b|\band\b)\s*/i).map((c) => clauseTokens(c, rw)).filter((c) => c.length);
  if (!cl.length) return null;
  const frame = (toks) => {   // a glue word the world has a word for stays ("have" is the verb of a statement)
    const numbers = toks.filter((x) => x.num !== undefined).map((x) => x.num);
    const words = toks.filter((x) => x.num === undefined && !(GLUE.has(x.t) && !rw.known.has(x.t))).map((x) => x.t);
    return { words, numbers };
  };
  const frames = cl.map(frame);
  const whole = cl.length > 1 ? [frame(cl.flat())] : null;
  return { frames, whole, clauses: cl };
}

// ---- reading ------------------------------------------------------------------------------------------------------------------------------

/** The op and the slot values of one library reading (a part of a split): from its wires text and its referents. */
function slotsOfPart(p) {
  if (p.question) { const q = p.question; return { op: q.type, values: Object.fromEntries(Object.entries(q.where ?? {}).map(([k, v]) => [k, String(v)])) }; }
  const m = /^@\S+\s+(\S+)((?:\s+.*)?)$/.exec(String(p.wires ?? ''));
  if (!m) return null;
  const values = {};
  for (const e of m[2].matchAll(/([\w.]+)=("(?:[^"\\]|\\.)*"|\S+)/g)) {
    let v = e[2];
    if (v.startsWith('$') && p.refer?.[v.slice(1)]) v = String(Object.values(p.refer[v.slice(1)].where ?? {})[0] ?? '');
    else if (v.startsWith('"')) v = v.slice(1, -1).replace(/\\(.)/g, '$1');
    values[e[1]] = v;
  }
  return { op: m[1], values };
}

/**
 * What a part of a reading does with the words of its clause: the words that fill a free argument (`rest`, `noun`, `words`: text the description takes as it is, in the
 * order of the message), and `left`, the content words nothing accounts for (not a word of the description, not glue, not text for a free argument).
 */
function accountFor(rw, part, order) {
  const sl = slotsOfPart(part);
  const o = sl && rw.ops.get(sl.op);
  const covered = (w) => o?.roleWords.has(w) || w === part.verb || GLUE.has(w);
  const open = [...new Set([...(part.unused ?? []), ...(part.unresolved ?? [])])].filter((w) => !covered(w));
  const frees = (o?.slots ?? []).filter((x) => x.type === 'free' && (sl.values[x.name] === undefined));
  open.sort((x, y) => (order.indexOf(x) < 0 ? 1e9 : order.indexOf(x)) - (order.indexOf(y) < 0 ? 1e9 : order.indexOf(y)));
  let room = frees.reduce((n, x) => n + (x.size ? Number(x.size) : Infinity), 0);
  const unknown = new Set(part.unresolved ?? []);   // text for a free argument is made of words no description knows; a known word that was left out ("center") is content, not text
  const free = [], left = [];
  for (const w of open) { if (room > 0 && unknown.has(w)) { free.push(w); room--; } else left.push(w); }
  return { free, left };
}

/**
 * Reads `text` in one reader world. Returns the readings in the library's order (`score` + `rank`): each `{ op, parts: [{ op, desc, slots, left }], ... }` or null.
 * A reading is accepted only when it leaves out nothing (`left` empty) and every free argument could be filled.
 */
export function readIn(lib, rw, text, { limit = 12 } = {}) {
  const f = framesOf(text, rw);
  if (!f) return null;
  const splits = f.whole ? [f.frames, f.whole] : [f.frames.length === 1 ? f.frames[0] : f.frames];
  const r = rw.world.interpret(splits.length === 1 ? splits[0] : splits, { limit });
  if (!r.candidates?.length) return { candidates: [], order: [], f };
  const s = rw.world.score(r.candidates);
  // since sopworld 0.13.2 (R14.1) a frame the library cannot read stays in the split as an unresolved part (`unread: true`, its words in `unresolved`): a split with such a part is no reading
  const whole = (c) => !c.parts || !c.parts.some((p) => p.unread);
  const keep = r.candidates.map((c, i) => i).filter((i) => whole(r.candidates[i]));
  const remap = new Map(keep.map((i, k) => [i, k]));
  return { candidates: keep.map((i) => r.candidates[i]), scored: keep.map((i) => s.candidates[i]), order: s.order.filter((i) => remap.has(i)).map((i) => remap.get(i)), ranked: s.ranked ?? null, f, unresolved: r.unresolved ?? [] };
}

/**
 * The readings of one segment text from all reader worlds, as dialogue wires. `worldOrder` is the context order (tab world first). Returns
 * `{ readings: [{ world, desc, wires, slots, left, used, assumes, tie }], tried }`, best first, only the readings that left nothing out.
 */
export function readSegment(dialog, text, { worldOrder = [], allowed = null } = {}) {
  const rs = dialog.isession?.rs;
  const lib = rs?.reasoner?.lib;
  if (!lib) return { readings: [], tried: 0 };
  const rws = readerWorlds(lib, dialog.engine.set);
  const pool = [...rws.keys()].filter((w) => !allowed || allowed.includes(w));   // only the worlds the conversation or the router points at (a free-text world reads anything)
  const order = [...worldOrder.filter((w) => pool.includes(w)), ...pool.filter((w) => !worldOrder.includes(w))];
  const found = [];
  let tried = 0;
  for (const wid of order) {
    budget.tick('reader.world');
    const rw = rws.get(wid);
    let r;
    try { r = readIn(lib, rw, text); } catch { continue; }
    tried++;
    if (!r?.candidates.length) continue;
    r.order.forEach((ci, place) => {
      const cand = r.candidates[ci], sc = r.scored[ci];
      const parts = (cand.parts ?? [cand]).map((p, k) => ({ part: p, k }));
      const built = [];
      for (const { part } of parts) {
        const sl = slotsOfPart(part);
        const o = sl && rw.ops.get(sl.op);
        if (!o) { built.length = 0; break; }
        built.push({ part, sl, o, ...accountFor(rw, part, tokensOf(text)) });
      }
      if (!built.length) return;
      found.push({ world: wid, rw, place, ci, cand, sc, built, order: order.indexOf(wid), split: !!cand.parts, text, scoredPlace: sc?.place ?? place, libWhy: sc?.why ?? null });
    });
  }
  return { found, tried };
}

/** The slot objects (`{ value, text }`) for the emit template of a description from the values the library gave; null when a required argument has none. */
function slotValues(o, values, freeWords) {
  const slots = {};
  let free = [...freeWords];
  for (const a of o.slots) {
    let v = values[a.name];
    if (v === undefined && a.type === 'free') {
      const take = a.size ? free.splice(0, Number(a.size)) : free.splice(0, free.length);
      v = take.length ? take.join(' ') : undefined;
    }
    if (v === undefined || v === '') { if (a.optional) continue; return null; }
    slots[a.name] = a.type === 'entity' ? { value: String(v).toLowerCase(), text: String(v).replace(/_/g, ' ') } : { value: String(v), text: String(v) };
    if (a.qty && values[a.qty] !== undefined) slots[a.qty] = { value: String(values[a.qty]), text: String(values[a.qty]) };
  }
  return slots;
}

/**
 * Turns the best accepted readings of `text` into segments (as the rule formalizer's): one segment per part, wires from the description's emit template,
 * normalized and validated like the rules' wires. Returns `{ segments, info }` or null. `info` records what was tried for the report.
 */
export function readerSegments(dialog, seg, { worldOrder = [], allowed = null, freeWorlds = [] } = {}) {
  const { found, tried } = readSegment(dialog, seg.text, { worldOrder, allowed });
  const info = { tried, candidates: found?.length ?? 0, accepted: 0 };
  if (!found?.length) return { segments: null, info };
  const { set } = dialog.engine;
  const form = dialog.isession.form;
  const raw = new Map();   // the words of the clause as written (a free argument keeps its case: "Shopping")
  for (const m of seg.text.matchAll(/[\p{L}\p{N}']+(?:\.\d+)?/gu)) if (!raw.has(m[0].toLowerCase())) raw.set(m[0].toLowerCase(), m[0]);
  const msgNumbers = tokensOf(seg.text).filter((t) => /^\d+(?:\.\d+)?$/.test(t));
  const out = [];
  for (const f of found) {
    budget.tick('reader.build');
    // a reading leaves nothing out: every part, no word of the clause without a place, and no negation the reading cannot say
    if (f.built.some((b) => b.left.length)) continue;
    if (f.built.some((b) => b.free.length) && (!READER_POLICY.freeText || !freeWorlds.includes(f.world))) continue;   // text for a free argument: only when the policy allows it, in the world the user is in
    if ((f.cand.parts ?? [f.cand]).some((p) => (p.assumes ?? []).some((a) => editDistance(String(a.word), String(a.read), 3) > READER_POLICY.maxAssume))) continue;
    if (READER_POLICY.anchor && f.built.some((b) => { const reads = (b.part.assumes ?? []).map((a) => String(a.read)); return ![...b.o.roleWords].some((w) => !GLUE.has(w) && (reads.includes(w) || tokensOf(seg.text).includes(w))); })) continue;
    if (NEGATION.test(seg.text)) continue;
    const segs = [];
    let ok = true;
    for (const b of f.built) {
      const sl = slotValues(b.o, b.sl.values, b.free.map((w) => raw.get(w) ?? w));
      if (!sl) { ok = false; break; }
      try {
        const pattern = { id: `pat.reader.${b.o.desc.id}`, emit: b.o.desc.emit };
        const emitted = buildWires(pattern, { ...sl, [SEGMENT_SLOT]: { value: seg.text, text: seg.text } }, { fresh: () => form.freshId('w'), nextSeq: () => form.nextSeq(), sourceRef: `reader#${seg.span?.join('-') ?? '0'}`, worldId: f.world });
        const normalized = [], errors = [];
        for (const w of emitted) { const r = set.legends.normalizeWire(w); errors.push(...r.errors); normalized.push(r.wire); }
        const local = new Map(normalized.map((w) => [w.id, w]));
        for (const w of normalized) errors.push(...set.legends.validateWire(w, { lookup: (i) => local.get(i) }));
        if (errors.length) { ok = false; break; }
        segs.push({ b, wires: normalized, slots: sl });
      } catch { ok = false; break; }
    }
    if (!ok || !segs.length) continue;
    // every number the clause states appears in a reading's values
    const vals = new Set(segs.flatMap((x) => Object.values(x.slots).map((s) => String(s.value))));
    if (msgNumbers.some((n) => ![...vals].some((v) => Number(v) === Number(n)))) continue;
    out.push({ f, segs });
  }
  info.accepted = out.length;
  if (!out.length) return { segments: null, info };
  const nearOrder = (w) => (worldOrder.includes(w) ? worldOrder.indexOf(w) : 99);
  for (const x of out) x.vec = [x.segs.reduce((n, q) => n + q.b.left.length, 0), (x.f.cand.assumes ?? []).length, x.f.cand.implied !== undefined || x.f.cand.parts?.some((p) => p.implied !== undefined) ? 1 : 0, -(x.f.cand.used ?? x.f.cand.parts?.flatMap((p) => p.used) ?? []).length];
  out.sort((a, b) => { for (let i = 0; i < a.vec.length; i++) if (a.vec[i] !== b.vec[i]) return a.vec[i] - b.vec[i]; return nearOrder(a.f.world) - nearOrder(b.f.world) || a.f.order - b.f.order || a.f.place - b.f.place; });
  const top = out[0];
  info.top = { world: top.f.world, ops: top.segs.map((s) => s.b.o.T), place: top.f.scoredPlace, split: top.f.split };
  // ambiguous: another accepted reading of another operation that is as good on every criterion (words left out, assumptions, a verb word rather than an implied verb, words used),
  // in a world that is as near the conversation as the best one's (the open tab's world decides between worlds)
  const same = (x) => x.vec.join() === top.vec.join();
  const opsOf = (x) => sigOf(x.segs.flatMap((q) => q.wires));   // two descriptions that emit the same wires are one reading
  const ambiguous = out.slice(1).some((x) => same(x) && nearOrder(x.f.world) === nearOrder(top.f.world) && opsOf(x) !== opsOf(top));
  info.ambiguous = ambiguous;
  const segments = top.segs.map((x, k) => ({
    text: seg.text, span: seg.span, isQuestion: x.b.o.desc.intent === 'query', worlds: [], routing: null, unparsed: false, alternatives: [], errors: [], strategy: 'reader',
    match: { patternId: `pat.reader.${x.b.o.desc.id}`, worldId: top.f.world, kind: x.b.o.desc.kind ?? (x.b.o.desc.intent === 'query' ? 'question' : x.b.o.desc.intent === 'command' ? 'request' : 'statement'), priority: 0, slots: x.slots },
    wires: x.wires, reader: { ...(k === 0 ? info : {}), op: x.b.o.desc.op, world: top.f.world, split: top.f.split, assumes: top.f.cand.assumes ?? null },
  }));
  return { segments, info, ambiguous };
}

const sigOf = (wires) => JSON.stringify((wires ?? []).map((w) => [w.type, w.entries.filter((e) => !/^core\.(?:via|source|seq|span|in)$/.test(e.key)).map((e) => [e.key, String(e.value?.v)]).sort()]));

/**
 * `choose`: a clause the rules (or the encoder) read. The reader's reading replaces it only when the library's `rank` puts the reader's first (the current reading
 * leaves content words out or is refused where the reader's is not): a tie keeps the current reading (the given order). Returns `{ segments }` to replace it, `{ note }` to
 * record what was seen, or null.
 */
export function chooseReader(dialog, seg, { worldOrder = [], freeWorlds = [] } = {}) {
  const rs = dialog.isession?.rs;
  if (!rs) return null;
  const allowed = [seg.match?.worldId, worldOrder[0]].filter(Boolean);   // a rival reading must be of the world the clause was read in, or of the open tab
  const r = readerSegments(dialog, seg, { worldOrder, allowed, freeWorlds });
  if (!r.segments) return r.info?.accepted ? { note: { ...r.info, used: false, why: 'ambiguous or not buildable' } } : null;
  const note = { ...r.info, used: false };
  if (r.ambiguous) return { note: { ...note, why: 'ambiguous' } };
  const mine = r.segments.flatMap((x) => x.wires);
  if (sigOf(seg.wires) === sigOf(mine)) return { note: { ...note, why: 'same reading' } };
  if (r.segments.length !== 1) return { note: { ...note, why: 'a split of several clauses against one clause' } };
  const foreign = !!dialog._waLang && dialog._waLang !== 'en';
  const sc = rs.score([{ wires: seg.wires, unused: leftOut(seg, foreign) }, { wires: mine }]);
  const place = sc.ranked?.map((x) => x.place);
  note.compared = { current: sc.ranked?.[0]?.why ?? null, reader: sc.ranked?.[1]?.why ?? null, order: sc.order };
  if (sc.order[0] !== 1 || /tied with/.test(String(sc.ranked?.[1]?.why ?? ''))) return { note: { ...note, why: 'the library keeps the current reading', place } };
  return { segments: r.segments.map((x) => ({ ...x, reader: { ...x.reader, ...note, used: true, from: 'rank', replaced: seg.match?.patternId ?? null } })), note };
}

/** Coverage of the `means` of every reader world: the 0.12 behaviour (words told to a fork of the matrix) against the reader worlds'. */
export function readerCoverage(lib, set, matrixOf) {
  const rws = readerWorlds(lib, set);
  const out = {};
  for (const w of set.list()) {
    const read = w.descReader;
    const en = read ? [...read.words.values()].filter((x) => !x.of) : [];
    if (!en.length) continue;
    let asIs = null;
    try {
      const fork = matrixOf(w.id);
      const before = fork.warnings.length;
      fork.tell(en.map((x, i) => `@cw${i} core.word text=${quote(String(x.text).toLowerCase())} means=${x.means}`).join('\n'));
      asIs = { unknown: fork.warnings.slice(before).filter((x) => x.kind === 'unknown-word').length };
    } catch (e) { asIs = { error: String(e?.message ?? e).slice(0, 80) }; }
    const rw = rws.get(w.id);
    out[w.id] = { words: en.length, descriptions: read.descriptions.size, asIs, mapped: rw ? { ...rw.coverage, unmapped: rw.coverage.unmapped.length, unmappedIds: rw.coverage.unmapped.slice(0, 8) } : null };
  }
  return out;
}
