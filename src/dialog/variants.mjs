// SPDX-License-Identifier: AGPL-3.0-only
/**
 * READING STEPS FOR UNPARSED CLAUSES (spec 16 section 10; sopworld 0.74 `nearWords`, 0.75 `normalise`): the paraphrase gap. Each step proposes another reading of a clause nobody read;
 * the world decides (a run on a fork must support the new reading and must not end in the world's own refusal); all or nothing (a clause with two different acceptable readings
 * keeps none); nothing is told to a world, no sentence is generated, nothing is added to a pattern or a lexicon. One switch per step for A/B runs:
 *   PSYS2_FORMOPS=on        (off unless set) typed form operators: the operators the library's `learnFormOperators({ world })` admitted rewrite the clause (src/dialog/form-operators.mjs), the rules read each candidate; the first step
 *   PSYS2_CANON=on          (off unless set) inverse operators at read time: `canonicalise` drops the learnt fillers at the start and end of the clause and applies the alternation rules, the rules read the result
 *   PSYS2_ALTERNATIONS=off  alternations: `normalise` over the `w.lang.en.alternation` rules of the language world (passive, wrappers, question and command, dative shift), then the rules read the canonical form
 *   PSYS2_NEAR=off          near words: an unknown word that the word senses of the catalog (k.words) make a synonym or a kind of a word the worlds know (cost 3 at most) is read as that word
 *   PSYS2_SLOTS=off         slot types: the words of the clause are assigned to the typed slots of a pattern of the worlds by their lexicons, whatever their order; the pattern's own words and the function
 *                           words are the rest, no content word may be left over (the frame of `readByTypes`, assembled from the world's lexicons instead of a typed fact world)
 * Browser-safe: no `node:*`.
 */
import { buildWires, SEGMENT_SLOT } from '../formalizer/rules/emit.mjs';
import { lexIndex } from '../worlds/lexicon.mjs';
import { worldVocabulary, FUNCTION_WORDS } from '../formalizer/spell.mjs';
import { FILLER } from './world-aware.mjs';
import { budget } from './budget.mjs';
import { formOperatorTexts } from './form-operators.mjs';

/** A catalog lookup waits at most LOOKUP_MS; a catalog that does not answer in time is no catalog (the reading is then the rules'), and the turn never waits for it. */
const LOOKUP_MS = 400;
const bounded = (p) => new Promise((resolve) => { const t = setTimeout(() => resolve(null), LOOKUP_MS); Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); }); });
const off = (name) => globalThis.process?.env?.[name] === 'off';
const on = (name) => globalThis.process?.env?.[name] === 'on';   // a step that is off unless asked for
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
  if (!res.segments.length || res.segments.some((x) => x.unparsed || x.partial || x.ignored?.length)) return null;
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

/** The inverse operators at read time (sopworld 0.91 `canonicalise`): the learnt filler words dropped at the start and end of the clause, then the alternation rules; one clause (the clause splitter has cut already). */
async function canonicalText(dialog, seg) {
  const fo = dialog.engine.formOperators;
  if (!fo?.lib?.canonicalise || !fo.fillers?.length) return null;
  const w = (await alternationWorld(dialog)) ?? fo.world;
  if (!w) return null;
  const r = fo.lib.canonicalise(w, seg.text, { fillers: fo.fillers, splitters: [] });
  if (r.clauses.length !== 1) return null;
  const c = r.clauses[0];
  return c.text && c.text !== toks(seg.text).join(' ') ? { text: c.text, applied: c.applied, dropped: r.dropped } : null;
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

/**
 * The unparsed clauses of `formal` read again by the three steps, each behind its switch; a clause keeps its reading when no step finds exactly one the world accepts.
 * `opts`: the formalizer options of the turn ({ worlds, session, source, context, router }).
 */
export async function withVariants(dialog, formal, opts) {
  const ctx = dialog.context();
  const segments = [];
  for (const seg of formal.segments) {
    let out = null;
    if (seg.unparsed && seg.text) {
      budget.tick('variants.segment');
      try {
        if (!out && on('PSYS2_FORMOPS')) {   // typed form operators (spec 16 section 11): the clause rewritten by the admitted operators, each candidate read by the rules, the world decides, two different readings: none
          const readings = new Map();
          for (const t of formOperatorTexts(dialog.engine.formOperators, seg.text)) { const r = await reread(dialog, seg, t, opts, 'form-operator', { operator: true }); if (r) readings.set(sigOf(r.flatMap((x) => x.wires)), r); }
          if (readings.size === 1) out = [...readings.values()][0];
        }
        if (!out && on('PSYS2_CANON')) { const c = await canonicalText(dialog, seg); if (c) out = await reread(dialog, seg, c.text, opts, 'canonical', { applied: c.applied, dropped: c.dropped }); }   // inverse operators (spec 16 section 11)
        if (!out && !off('PSYS2_ALTERNATIONS')) { const a = await alternationText(dialog, seg); if (a) out = await reread(dialog, seg, a.text, opts, 'alternation', { applied: a.applied }); }
        if (!out && !off('PSYS2_NEAR')) {
          const readings = new Map();
          for (const n of await nearTexts(dialog, seg)) { const r = await reread(dialog, seg, n.text, opts, 'near', { word: n.word, as: n.as, cost: n.cost }); if (r) readings.set(sigOf(r.flatMap((x) => x.wires)), r); }
          if (readings.size === 1) out = [...readings.values()][0];   // two different readings of the same unknown word: none
        }
        if (!out && !off('PSYS2_SLOTS')) { const s = bySlotTypes(dialog, seg, ctx); if (s) out = [s]; }
      } catch { out = null; }
    }
    if (out) segments.push(...out); else segments.push(seg);
  }
  return { ...formal, segments, wires: segments.flatMap((x) => x.wires ?? []) };
}
