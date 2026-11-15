// SPDX-License-Identifier: AGPL-3.0-only
/**
 * READING STEPS FOR UNPARSED CLAUSES (spec 16 section 10; sopworld 0.74 `nearWords`, 0.75 `normalise`): the paraphrase gap. Each step proposes another reading of a clause nobody read;
 * the world decides (a run on a fork must support the new reading and must not end in the world's own refusal); all or nothing (a clause with two different acceptable readings
 * keeps none); nothing is told to a world, no sentence is generated, nothing is added to a pattern or a lexicon. One switch per step; EVERY STEP IS OFF unless its switch is `on` (P6, 2026-11-15:
 * on the shipped real set no step changed a verdict, an outcome or a reply, and `test-world all` is the same with all of them off; spec 16 section 15). Named diagnostic switches:
 *   (PSYS2_FORMOPS, typed form operators, and PSYS2_CANON, inverse operators, were deleted in P6: off everywhere, no gain on held-out, no operators in the browser)
 *   PSYS2_ALTERNATIONS=on   alternations: `normalise` over the `w.lang.en.alternation` rules of the language world (passive, wrappers, question and command, dative shift), then the rules read the canonical form
 *   PSYS2_NEAR=on           near words: an unknown word that the word senses of the catalog (k.words) make a synonym or a kind of a word the worlds know (cost 3 at most) is read as that word
 *   PSYS2_SLOTS=on          slot types: the words of the clause are assigned to the typed slots of a pattern of the worlds by their lexicons, whatever their order; the pattern's own words and the function
 *                           words are the rest, no content word may be left over (the frame of `readByTypes`, assembled from the world's lexicons instead of a typed fact world)
 *   PSYS2_RUNON=on          run-on clauses (spec 16 section 12): the library's `splitRunOn` cuts an incomplete clause where its parts read best
 *   PSYS2_ENSEMBLE=on       the voices that are on run side by side and `readEnsemble` decides (spec 16 section 13); without it they run in sequence, the first accepted reading wins
 * Browser-safe: no `node:*`.
 */
import { formalize as rulesFormalize } from '../formalizer/rules/index.mjs?v=ff05a8582c';
import { buildWires, SEGMENT_SLOT } from '../formalizer/rules/emit.mjs?v=8e51d17dc1';
import { lexIndex } from '../worlds/lexicon.mjs?v=f0499f971c';
import { worldVocabulary, FUNCTION_WORDS } from '../formalizer/spell.mjs?v=ff05a8582c';
import { FILLER } from './world-aware.mjs?v=0b5252786f';
import { budget } from './budget.mjs?v=00bce6e369';
import { isIncomplete, completeMode } from '../formalizer/completeness.mjs?v=ff05a8582c';

/** A catalog lookup waits at most LOOKUP_MS; a catalog that does not answer in time is no catalog (the reading is then the rules'), and the turn never waits for it. */
const LOOKUP_MS = 400;
const bounded = (p) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), LOOKUP_MS); Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); }); });
const on = (name) => globalThis.process?.env?.[name] === 'on';   // every voice is off unless asked for (P6, spec 16 section 15)
/** The voices that run when switched on (P6, 2026-11-15: none of them changed a verdict, an outcome or a reply of the shipped real set, so none is on the default path). */
export const VOICE_SWITCHES = Object.freeze(['PSYS2_ALTERNATIONS', 'PSYS2_NEAR', 'PSYS2_SLOTS', 'PSYS2_RUNON']);
/** True when at least one voice is switched on; otherwise `withVariants` is not called at all. */
export const anyVoiceOn = () => VOICE_SWITCHES.some(on);
const toks = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const FUNCTIONAL = new Set([...FILLER, ...FUNCTION_WORDS, 'what', 'which', 'who', 'where', 'when', 'how', 'does', 'do', 'did', 'is', 'are', 'was', 'were', 'be', 'in', 'on', 'at', 'by', 'with', 'its', 'these', 'those', 'tell', 'say', 'i', 'we']);
const unq = (v) => String(v).replace(/^"|"$/g, '');
const sigOf = (wires) => JSON.stringify(wires.map((w) => w.entries.filter((e) => !/^core\.(source|seq|via)$/.test(e.key)).map((e) => `${e.key}=${e.value?.v}`).sort()));

/** The wires of a pattern filled with slot values, validated like the rules' own; null when they do not validate. */
function wiresOf(dialog, pat, slots, seg) {
  const { set } = dialog.engine, form = dialog.isession.form;
  try {
    const emitted = buildWires(pat, { ...slots, [SEGMENT_SLOT]: { value: seg.text, text: seg.text } }, { fresh: () => form.freshId('w'), nextSeq: () => form.nextSeq(), sourceRef: `variant#${seg.span?.join('-') ?? '0'}`, worldId: pat.worldId });
    const normalized = [], errors = [];
    for (const w of emitted) { const r = set.legends.normalizeWire(w); errors.push(...r.errors); normalized.push(r.wire); }
    const local = new Map(normalized.map((w) => [w.id, w]));
    for (const w of normalized) errors.push(...set.legends.validateWire(w, { lookup: (i) => local.get(i) }));
    return errors.length ? null : normalized;
  } catch { return null; }
}

/** The world accepts: supported, not its own refusal. */
const accepted = (dialog, segs) => { const o = dialog._outcomes(segs); return o !== null && segs.every((x) => x.wires?.length) && o.every((x) => x.status === 'supported' && !x.refused); };   // a statement has no answer to run: the validated wires are the reading

// ---- slot types ---------------------------------------------------------------------------------------------------------------------------------------

const SLOT = /\{(\w+):([\w.-]+)\}/g;
const LEXICAL = new Set(['noun', 'name', 'attribute', 'attr', 'colour', 'color', 'animal', 'kind', 'unit', 'word']);   // slot classes whose words are a lexicon's

/** The literal words of a match string (every alternative of every group; a phrase macro through its alternatives). */
function literalsOf(match, lex) {
  const out = new Set();
  const text = String(match).replace(SLOT, ' ').replace(/\$([\w.]+)/g, (_, id) => { for (const alt of lex.phrases.get(id)?.alts ?? []) for (const w of alt) out.add(String(w).toLowerCase()); return ' '; });
  for (const w of text.match(/[\p{L}\p{N}']+/gu) ?? []) out.add(w.toLowerCase());
  return out;
}

/** Every assignment of the content tokens to the typed slots of one pattern, or []: each slot one token, each other content token a literal of the pattern. */
function assignments(pat, content, lex, wordsOf) {
  const slots = [...String(pat.match).matchAll(SLOT)].map((m) => ({ name: m[1], cls: m[2] }));
  if (!slots.length || slots.some((s) => !LEXICAL.has(s.cls))) return [];
  const lits = literalsOf(pat.match, lex), lemmaOf = (t) => lex.lemma(t);
  const isLit = (t) => lits.has(t) || lits.has(lemmaOf(t)) || lits.has(`${t}s`) || lits.has(t.replace(/s$/, ''));
  const out = [];
  const go = (i, used, acc) => {
    if (i === slots.length) { if (content.every((t, k) => used.has(k) || isLit(t)) && content.some((t, k) => !used.has(k) && isLit(t))) out.push(acc); return; }   // an anchor: one word of the pattern itself
    budget.tick('variants.slots');
    for (let k = 0; k < content.length; k++) {
      if (used.has(k)) continue;
      const w = wordsOf(pat.worldId, slots[i].cls);
      const t = content[k];
      if (w.has(t) || w.has(lemmaOf(t))) go(i + 1, new Set([...used, k]), { ...acc, [slots[i].name]: { value: lemmaOf(t), text: t, class: slots[i].cls } });
    }
  };
  go(0, new Set(), {});
  return out;
}

function bySlotTypes(dialog, seg, ctx) {
  const { set } = dialog.engine, lex = lexIndex(set);
  const content = toks(seg.text).filter((t) => !FUNCTIONAL.has(t));
  if (content.length < 2 || content.length > 8) return null;
  const wordsCache = new Map();
  const wordsOf = (world, cls) => {
    const key = `${world}|${cls}`;
    if (!wordsCache.has(key)) { const s = new Set(); for (const l of lex.lexicons.values()) if (l.class === cls && (l.worldId === world || l.worldId === 'lang.common' || l.worldId === 'kids.common') && !l.words.open) for (const w of l.words) s.add(String(w).toLowerCase()); wordsCache.set(key, s); }
    return wordsCache.get(key);
  };
  const order = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...(ctx.recentWorlds ?? []), ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)].filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length);
  for (const id of order) {   // the world the person is in decides first; the first world with a reading owns the clause
    const found = new Map();
    for (const pat of set.get(id).patterns) {
      if (!['question', 'request'].includes(pat.kind)) continue;
      const as = assignments(pat, content, lex, wordsOf);
      if (as.length !== 1) continue;   // two ways to place the words in one pattern: not a reading
      const wires = wiresOf(dialog, pat, as[0], seg);
      if (!wires) continue;
      const sig = sigOf(wires);
      if (!found.has(sig)) found.set(sig, { pat, slots: as[0], wires });
    }
    if (found.size === 1) {
      const { pat, slots, wires } = [...found.values()][0];
      const out = { ...seg, unparsed: false, wires, strategy: 'rules', alternatives: [], errors: [], corrections: [], ignored: [], partial: false, match: { patternId: pat.id, worldId: pat.worldId, kind: pat.kind, priority: pat.priority, slots }, variant: { via: 'slot-types', pattern: pat.id } };
      return accepted(dialog, [out]) ? out : null;
    }
    if (found.size > 1) return null;   // two readings in the world the person is in
  }
  return null;
}

// ---- alternations and near words: another text for the rules to read -----------------------------------------------------------------------------------------

async function reread(dialog, seg, text, opts, via, extra = {}) {
  const res = await dialog.engine.formalizers.rules.formalize(text, { ...opts, worlds: opts.worlds ?? dialog.engine.set });
  if (!res.segments.length || res.segments.some((x) => x.unparsed || x.partial || x.ignored?.length || x.match?.unread?.length)) return null;   // a variant must be a COMPLETE reading
  const segs = res.segments.map((x) => ({ ...x, span: seg.span, strategy: 'rules', variant: { via, from: seg.text, to: text, ...extra } }));
  return accepted(dialog, segs) ? segs : null;
}

/** The library World of the catalog's `w.lang.en.alternation` rules (null when it publishes none); built once per dialogue. */
async function alternationWorld(dialog) {
  const lib = dialog.engine.sopworld, facts = dialog.engine.knowledge;
  if (!lib?.normalise || !facts?.wires) return null;
  let w = dialog._alternationWorld;
  if (w === undefined) {
    try {
      const rows = (await bounded(facts.wires('w.lang.en.alternation'))) ?? [];
      w = rows.length ? new lib.World() : null;
      if (w) w.tell(`@t core.type of=w.lang.en.alternation\n${['name', 'from', 'to', 'mode'].map((k, i) => `@t${i} core.slot of=w.lang.en.alternation key=${k} kind=atom kind=string`).join('\n')}\n${rows.map((r, i) => `@a${i} w.lang.en.alternation ${Object.entries(r.f).filter(([k]) => /^(name|from|to|mode)$/.test(k)).map(([k, v]) => `${k}=${JSON.stringify(unq(v[0]))}`).join(' ')}`).join('\n')}`);
    } catch { w = null; }
    dialog._alternationWorld = w;
  }
  return w;
}

async function alternationText(dialog, seg) {
  const lib = dialog.engine.sopworld, w = await alternationWorld(dialog);
  if (!w) return null;
  const r = lib.normalise(w, seg.text);
  return r?.applied?.length && r.text && r.text !== seg.text ? { text: r.text, applied: r.applied } : null;
}

async function nearTexts(dialog, seg) {
  const lib = dialog.engine.sopworld, facts = dialog.engine.knowledge;
  if (!lib?.nearWords || !facts?.wires) return [];
  const { set } = dialog.engine, ctx = dialog.context();
  // the words of the worlds the clause could belong to (the one the person is in first): a word none of them knows is unknown; the word it is read as must be theirs
  const ids = [ctx.tabWorld, ctx.modalWorld, ctx.gameWorld, ...(ctx.recentWorlds ?? []), ...(seg.worlds ?? []).slice(0, 3).map((w) => w.id)].filter((w, i, a) => w && a.indexOf(w) === i && set.get(w)?.patterns?.length).slice(0, 5);
  const vs = ids.map((id) => worldVocabulary(set, id));
  const vocab = { has: (w) => vs.some((v) => v.has(w)) };
  const unknown = toks(seg.text).filter((t) => t.length > 2 && !vocab.has(t) && !FUNCTIONAL.has(t) && !/^\d/.test(t));
  if (!unknown.length || unknown.length > 2) return [];
  const out = [];
  const lex = lexIndex(dialog.engine.set);
  for (const word of unknown) {
    let lemma = null;
    budget.tick('variants.near');
    // the lemma candidates of the word (possesses -> possess): the catalog's senses are keyed by lemma
    const forms = [...new Set([word, word.replace(/(?:es|s)$/, ''), word.replace(/s$/, ''), word.replace(/ed$/, ''), word.replace(/ed$/, 'e'), word.replace(/ing$/, ''), word.replace(/ies$/, 'y')])].filter((f) => f.length > 2);
    let rows = [];
    for (const f of forms) { try { rows = (await bounded(facts.wires('k.words.sense', { key: f }))) ?? []; } catch { rows = []; } if (rows.length) { lemma = f; break; } }
    const w = new lib.World();
    for (const r of rows.slice(0, 12)) { try { w.tell(`@s${w.wires.size} k.words.sense ${Object.entries(r.f).filter(([k]) => /^(word|pos|n|synonym|is_a|kind_of)$/.test(k)).flatMap(([k, v]) => v.map((x) => `${k}=${JSON.stringify(unq(x))}`)).join(' ')}`); } catch { /* a sense that does not load is not used */ } }
    const near = lib.nearWords(w, lemma ?? word).filter((n) => n.cost <= 3 && (vocab.has(n.word) || vocab.has(lex.lemma(n.word))));
    for (const n of near.slice(0, 3)) out.push({ word, as: n.word, cost: n.cost, via: n.via, text: seg.text.replace(new RegExp(`\\b${word}\\b`, 'i'), n.word) });
  }
  return out.sort((a, b) => a.cost - b.cost).slice(0, 4);
}

// ---- run-on sentences: the library's splitRunOn, each clause read by the rules ------------------------------------------------------------------------------

const OPENERS = ['what', 'how', 'which', 'who', 'where', 'when', 'why'];   // words that open a clause (the library's own advice: question words; a language world's class would add more)
const SPLITTERS = ['and then', 'and also', 'also', 'then', 'but'];

/**
 * `splitRunOn` (sopworld 0.101) cuts a run-on or compound clause where its clauses read best, each clause read by the rules (the reader below: a clause scores its words read, minus a penalty per
 * word left unread). The clauses are read again as segments; the usual contract holds (every clause complete, the world accepts all of them, otherwise the original stays whole).
 */
function runOnSegments(dialog, seg, opts) {
  const lib = dialog.engine.sopworld;
  if (!lib?.splitRunOn || toks(seg.text).length < 5 || toks(seg.text).length > 40) return null;
  const form = dialog.isession.form;
  const reader = (_w, t) => {   // the rules read the clause on a scratch dialogue state; the state is put back
    const snap = form.snapshot();
    try {
      const res = rulesFormalize(t, { ...opts, worlds: opts.worlds ?? dialog.engine.set, session: dialog.isession, source: 'runon' });
      const ok = res.segments.length > 0 && res.segments.every((x) => !x.unparsed && !x.partial && !x.ignored?.length);
      const unread = res.segments.flatMap((x) => x.match?.unread ?? []);
      return ok ? { best: { clause: t }, unread, frames: [{ words: toks(t).filter((w) => !FUNCTIONAL.has(w) && !unread.includes(w)) }] } : { best: null, unread: [] };
    } catch { return { best: null, unread: [] }; } finally { form.restore(snap); }
  };
  let parts;
  try { parts = lib.splitRunOn(new lib.World(), seg.text, { openers: OPENERS, splitters: SPLITTERS, reader }); } catch { return null; }
  if (!parts || parts.length < 2 || parts.some((p) => !p.frame || p.unread?.length)) return null;
  const segs = [];
  for (const p of parts) {
    const res = rulesFormalize(p.text, { ...opts, worlds: opts.worlds ?? dialog.engine.set, session: dialog.isession, source: 'runon' });
    if (!res.segments.length || res.segments.some((x) => x.unparsed || x.partial || x.ignored?.length || x.match?.unread?.length)) return null;
    segs.push(...res.segments.map((x) => ({ ...x, span: seg.span, strategy: 'rules', variant: { via: 'run-on', from: seg.text, to: p.text } })));
  }
  return accepted(dialog, segs) ? segs : null;
}

/**
 * THE ENSEMBLE (spec 16 section 13; sopworld 0.98 `readEnsemble`): the voices below run side by side on the clause, not as a fallback chain. Each voice proposes the complete readings the world
 * accepts (`reread`, `bySlotTypes`, `runOnSegments`); the readings are pooled by their wires and the library decides (std.decide kind `ensemble`, on the typed world of the clause's world:
 * coverage, then agreement = how many voices proposed it, then cost, then specificity). Two different readings with the same agreement and coverage: none (the library's `ask`), the clause
 * keeps its reading. Without `PSYS2_ENSEMBLE=on` (or with no library) the voices run in sequence, the first accepted reading wins.
 */
async function voicesOf(dialog, seg, opts, ctx) {
  const v = {};
  const add = (name, segs, cost) => { if (segs) (v[name] ??= []).push({ segs, cost, sig: sigOf(segs.flatMap((x) => x.wires)), specificity: segs.reduce((n, x) => n + (x.wires?.length ?? 0), 0) }); };
  if (on('PSYS2_ALTERNATIONS')) { const a = await alternationText(dialog, seg); if (a) add('alternation', await reread(dialog, seg, a.text, opts, 'alternation', { applied: a.applied }), 0.5 * (a.applied?.length ?? 1)); }
  if (on('PSYS2_NEAR')) for (const n of await nearTexts(dialog, seg)) add('near', await reread(dialog, seg, n.text, opts, 'near', { word: n.word, as: n.as, cost: n.cost }), n.cost);
  if (on('PSYS2_SLOTS')) { const s = bySlotTypes(dialog, seg, ctx); if (s) add('slot-types', [s], 1); }
  if (completeMode() !== 'off' && on('PSYS2_RUNON')) { const r = runOnSegments(dialog, seg, opts); if (r) add('run-on', r, r.length - 1); }
  return v;
}

function ensembleOf(dialog, seg, voices, ctx) {
  const lib = dialog.engine.sopworld, set = dialog.engine.set;
  const pool = new Map();
  for (const cands of Object.values(voices)) for (const c of cands) if (!pool.has(c.sig)) pool.set(c.sig, c);
  if (!pool.size) return null;
  const id = seg.match?.worldId ?? ctx.tabWorld;
  const world = (id && set.typedFor?.(id)?.world) || new lib.World();   // the typed world of the clause's world decides (its std.decide); a world with none: the library's defaults
  const readers = Object.fromEntries(Object.entries(voices).map(([name, cands]) => [name, () => cands.map((c) => ({ frame: { act: c.sig }, unread: 0, cost: c.cost, specificity: c.specificity }))]));
  let r;
  try { r = lib.readEnsemble(world, seg.text, { readers, threshold: 0 }); } catch { return null; }
  if (!r?.frame || r.ask?.length) return null;   // two different readings as good as each other: none
  const best = pool.get(r.frame.act);
  if (!best) return null;
  return best.segs.map((x) => ({ ...x, variant: { ...x.variant, ensemble: { confidence: r.confidence, voices: r.voices, readings: pool.size } } }));
}

/**
 * The unparsed (and, with PSYS2_COMPLETE on, the incomplete) clauses of `formal` read again by the voices, each behind its switch; a clause keeps its reading when no voice finds a reading the world
 * accepts, or two different ones tie. `opts`: the formalizer options of the turn ({ worlds, session, source, context, router }).
 */
export async function withVariants(dialog, formal, opts) {
  const ctx = dialog.context();
  const segments = [];
  const ensemble = on('PSYS2_ENSEMBLE') && !!dialog.engine.sopworld?.readEnsemble;
  for (const seg of formal.segments) {
    let out = null;
    if ((seg.unparsed || isIncomplete(seg)) && seg.text) {   // an incomplete reading is not final: it goes to the same readers as an unread clause (spec 16 section 12)
      budget.tick('variants.segment');
      try {
        if (ensemble) out = ensembleOf(dialog, seg, await voicesOf(dialog, seg, opts, ctx), ctx);
        else out = await firstVoice(dialog, seg, opts, ctx);
      } catch { out = null; }
    }
    if (out) segments.push(...out); else segments.push(seg);
  }
  return { ...formal, segments, wires: segments.flatMap((x) => x.wires ?? []) };
}

/** Without PSYS2_ENSEMBLE=on: the voices in sequence, the first accepted reading wins; inside one voice two different readings: none. */
async function firstVoice(dialog, seg, opts, ctx) {
  let out = null;
  if (!out && on('PSYS2_ALTERNATIONS')) { const a = await alternationText(dialog, seg); if (a) out = await reread(dialog, seg, a.text, opts, 'alternation', { applied: a.applied }); }
  if (!out && on('PSYS2_NEAR')) {
    const readings = new Map();
    for (const n of await nearTexts(dialog, seg)) { const r = await reread(dialog, seg, n.text, opts, 'near', { word: n.word, as: n.as, cost: n.cost }); if (r) readings.set(sigOf(r.flatMap((x) => x.wires)), r); }
    if (readings.size === 1) out = [...readings.values()][0];   // two different readings of the same unknown word: none
  }
  if (!out && on('PSYS2_SLOTS')) { const s = bySlotTypes(dialog, seg, ctx); if (s) out = [s]; }
  if (!out && completeMode() !== 'off' && on('PSYS2_RUNON')) out = runOnSegments(dialog, seg, opts);   // spec 16 section 12: a run-on clause cut where its parts read best
  return out;
}
