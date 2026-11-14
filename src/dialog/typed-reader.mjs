// SPDX-License-Identifier: AGPL-3.0-only
/**
 * TYPED READING STEP (spec 16 section 9): the library's type-driven reading (`typedLexicon`, the typing of `readByTypes`) as a reading step AFTER the rules and the reader route.
 * It proposes, the world decides, and it is all-or-nothing:
 *  - it runs only on a clause the rules read and the world REFUSED (a run on a fork of the session ends in the world's own refusal: an answer with a `fallback` code and no change): a reading the world accepts, a clause nobody read, and a clause
 *    that was corrected earlier are never touched;
 *  - the world is typed from its own facts: each thing of the session as a wire (its label, its kind, its attributes) and each value an attribute can take (`schema.attrs`);
 *  - the free-text roles of the refused reading (`thing`, `value`) are read again BY TYPE from the words they took together: a role of the type "thing" takes the words that name a
 *    thing of the session (a kind word with its number: "timeline 1"), a role of the type "value" takes the word typed as a value of the attribute the reading already holds
 *    ("day" for "unit"); the words between them are function words. Word order only splits the words, the types assign them;
 *  - every word of the region must be placed, both roles must be filled, the rebuilt wires must validate, and the world must then ACT on the new reading (a run on a fork: supported, not refused, something changed). Otherwise the
 *    original reading stays, whole.
 * No sentence is generated and nothing is told to a world. Browser-safe: no `node:*`.
 */
import { buildWires, SEGMENT_SLOT } from '../formalizer/rules/emit.mjs';
import { budget } from './budget.mjs';
import { colourLexiconWords } from '../knowledge/values.mjs';

const FREE = new Set(['rest', 'words', 'noun']);   // the classes of a role that takes any words
const FUNCTION = new Set(['to', 'of', 'the', 'a', 'an', 'as', 'into', 'from', 'on', 'in', 'at', 'with', 'be']);
const toks = (t) => String(t ?? '').match(/[\p{L}\p{N}_'-]+/gu) ?? [];

/** The library World of a schema world and the things of the session: things with their kind, label and attributes; one wire per value an attribute can take. */
export function typedWorldOf(lib, executor, state, knowledge) {
  const w = new lib.World();
  const lines = [];
  let n = 0;
  const q = (v) => JSON.stringify(String(v));
  let things = [];
  try { things = executor.referents({ state, knowledge }) ?? []; } catch { things = []; }
  for (const t of things) {
    const label = executor.labels ? String(executor.labels([{ id: t.id, kind: t.kind, n: t.n ?? (Number(/(\d+)$/.exec(t.id)?.[1]) || undefined), name: t.name ?? null, attrs: t.attrs ?? {} }])).replace(/^the /, '') : `${t.kind} ${t.n ?? ''}`.trim();
    const attrs = Object.entries(t.attrs ?? {}).filter(([k, v]) => /^[a-z_]+$/.test(k) && v != null && v !== '' && !/^[{[]/.test(String(v))).map(([k, v]) => `${k}=${q(v)}`);
    lines.push(`@t${++n} ${/^[a-z_]+$/.test(t.kind) ? t.kind : 'thing'} name=${q(label)} kind=${/^[a-z_]+$/.test(t.kind) ? t.kind : 'thing'} ${attrs.join(' ')}`);
  }
  for (const a of Object.values(executor.schema?.attrs ?? {})) {
    if (!/^[a-z_]+$/.test(a.name)) continue;
    for (const v of (a.values?.length ? a.values : a.type === 'colour' ? colourLexiconWords() : []).filter((x) => /^[A-Za-z][A-Za-z ]*$/.test(String(x)))) lines.push(`@v${++n} x.value ${a.name}=${q(v)}`);
  }
  try { w.load(lines.join('\n')); } catch { return null; }
  return w;
}

/** The thing a run of tokens names: the longest run equal to the label of a thing (or a kind word followed by its number), by the typed lexicon. */
function thingIn(lex, words) {
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const p = words.slice(i, i + len).join(' ').toLowerCase();
      const s = lex.get(p)?.find((x) => x.cat === 'thing');
      if (s) return { at: i, len, text: p, id: s.id };
    }
  }
  return null;
}

/**
 * A proposal for a refused reading `seg`, or null. `ctx`: { lib, executor, state, knowledge, set, form, outcomes(segments) }.
 * Returns the segment with the roles read again, `typed: { from, to }` recording what changed.
 */
const why = (r) => { if (globalThis.process?.env?.TYPED_DEBUG) console.error('typed:', r); return null; };
export function proposeByTypes(seg, ctx) {
  const m = seg?.match;
  if (!m?.slots || seg.unparsed || !ctx.lib?.typedLexicon) return why(1);
  const slots = m.slots;
  const thingSlot = slots.thing, valueSlot = slots.value, attrSlot = slots.attribute ?? slots.attr;
  if (!thingSlot || !valueSlot || !attrSlot || !FREE.has(thingSlot.class) || !FREE.has(valueSlot.class)) return why(2);   // the shape this step reads: a thing, an attribute and a value
  budget.tick('typed.reader');
  const tw = typedWorldOf(ctx.lib, ctx.executor, ctx.state, ctx.knowledge);
  if (!tw) return why(3);
  const lex = ctx.lib.typedLexicon(tw);
  const key = String(attrSlot.value ?? attrSlot.text).toLowerCase();
  const region = toks(`${thingSlot.text} ${valueSlot.text}`);
  if (!region.length) return why(4);
  const thing = thingIn(lex, region);
  if (!thing) return why(5);
  const rest = [...region.slice(0, thing.at), ...region.slice(thing.at + thing.len)];
  const contentWords = rest.filter((x) => !FUNCTION.has(x.toLowerCase()));
  // the value: the one word (or run) typed as a value of the attribute the reading holds; everything else must be a function word
  const valueWords = contentWords.filter((x) => (lex.get(x.toLowerCase()) ?? []).some((s) => s.cat === 'value' && s.key === key));
  if (valueWords.length !== 1 || contentWords.length !== 1) return why(6);   // every word placed, one value
  const thingText = region.slice(thing.at, thing.at + thing.len).join(' ');
  const same = (a, b) => String(a?.text ?? '').toLowerCase() === String(b).toLowerCase();
  if (same(thingSlot, thingText) && same(valueSlot, valueWords[0])) return why(7);   // nothing changes
  const pat = ctx.set.get(m.worldId)?.patterns?.find((p) => p.id === m.patternId);
  if (!pat) return why(8);
  const nu = { ...slots, thing: { ...thingSlot, value: thingText, text: thingText }, value: { ...valueSlot, value: valueWords[0].toLowerCase(), text: valueWords[0] } };
  let wires;
  try {
    const emitted = buildWires(pat, { ...nu, [SEGMENT_SLOT]: { value: seg.text, text: seg.text } }, { fresh: () => ctx.form.freshId('w'), nextSeq: () => ctx.form.nextSeq(), sourceRef: `typed#${seg.span?.join('-') ?? '0'}`, worldId: m.worldId });
    const normalized = [], errors = [];
    for (const w of emitted) { const r = ctx.set.legends.normalizeWire(w); errors.push(...r.errors); normalized.push(r.wire); }
    const local = new Map(normalized.map((w) => [w.id, w]));
    for (const w of normalized) errors.push(...ctx.set.legends.validateWire(w, { lookup: (i) => local.get(i) }));
    if (errors.length) return why(9);
    wires = normalized;
  } catch { return why(10); }
  const out = { ...seg, wires, match: { ...m, slots: nu }, typed: { used: true, from: { thing: thingSlot.text, value: valueSlot.text }, to: { thing: thingText, value: valueWords[0] }, id: thing.id } };
  const st = ctx.outcomes([out]) ?? [];
  return st.length && st.every((x) => x.status === 'supported' && !x.refused && x.changed) ? out : null;   // the world decides
}
