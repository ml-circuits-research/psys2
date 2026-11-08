/**
 * Label repair for the training data (phase analysis, training/results/phase-analysis-train.md).
 *
 * The rules of the LABELLED world are the reference reading of a record: a dialog session whose rule set is restricted to the
 * world (and its imports), seeded with the record's context, reads the record's text. Compared with the record's target this
 * classifies a label problem and says how to repair it:
 *
 *   gold_target_from_another_world  the target uses an action the world does not define, or equals what the all-worlds rule router
 *                                   makes of the text while the world's own rules read something else
 *       fix: the world's reading when it is complete and faithful to the text (value checker), else needs_review
 *   gold_value_not_in_text          the target holds a value the text does not contain although the world reads the text completely
 *       fix: the world's reading when faithful, else needs_review
 *   label_says_rules_differ         the record is rules-differ / generator-disagrees and the world's reading is complete
 *       fix: the world's reading when faithful (otherwise unchanged: the record stays, as weighted data)
 *   needs_review promotion          a needs_review record whose text the world reads completely and faithfully
 *       fix: promoted to a labelled record with the world's reading
 *
 * Text and world label are always kept. Browser-unsafe (node:*): a build-time tool.
 */
import { createHash } from 'node:crypto';
import { DialogSession } from '../../src/dialog/index.mjs';
import { restrictedSet, restrictedEngine } from './world-set.mjs';
export { lowerStrings } from './dispatch-gold.mjs';
import { parse, serialize } from '../../src/soplang/index.mjs';
import { normalizedSop, slotsOf, slotsFaithful, valuesInText, numbersCovered, firmNumbersIn } from '../collect-paraphrases.mjs';

export const CAUSES = ['gold_target_from_another_world', 'gold_value_not_in_text', 'label_says_rules_differ'];
// pronoun defaults of a target (`arg.t="it"` for "reset the styles") are implicit, not values the text must contain
const IMPLICIT = new Set(['it', 'them', 'this', 'that', 'these', 'those']);
const STRUCT_KEY = /(^|\.)(action|type|seek|via|source|seq|in|mode)$/;

const low = (lines) => lines.map((l) => String(l).toLowerCase());
export const sameSop = (a, b) => JSON.stringify(low(a)) === JSON.stringify(low(b));
export const textKey = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Value literals of normalized SOP lines (numbers, quoted strings, bare words), lower-cased, structural keys skipped. */
export function literals(lines) {
  const out = new Set();
  for (const l of lines) for (const m of String(l).matchAll(/([\w.]+)=(-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|[\w.$#-]+)/g)) {
    if (STRUCT_KEY.test(m[1])) continue;
    out.add(m[2].replace(/^\$e\./, '').toLowerCase());
  }
  return out;
}

/** Reader: `read({ world, text, context, tab })` -> the world's complete/partial reading of the text. */
export function makeReader(engine) {
  return async function read({ world = null, text, context = [], tab = null }) {
    const eng = world ? restrictedEngine(engine, [world]) : engine;
    const s = new DialogSession(eng, { language: 'en', formalizer: 'rules' });
    if (tab) s.setWorldState('ui.shell', { activeTab: tab });
    try {
      for (const m of context) await s.send(m);
      const r = await s.send(text);
      const parsed = r.segments.filter((x) => !x.unparsed);
      const wires = parsed.flatMap((x) => x.wires).filter((w) => w.type !== 'core.agent');
      const legends = engine.set.legends;
      return {
        matched: parsed.some((x) => x.match), unparsed: r.segments.length - parsed.length,
        complete: parsed.length > 0 && parsed.length === r.segments.length && parsed.some((x) => x.match),
        sop: normalizedSop(wires, legends), slots: slotsOf(wires, legends), target: serialize(wires),
        worlds: [...new Set(parsed.map((x) => x.match?.worldId).filter(Boolean))],
      };
    } catch (e) { return { matched: false, unparsed: 1, complete: false, sop: [], slots: [], target: '', worlds: [], error: e.message }; }
  };
}

/** Actions of the target that no operation of the world (or its imports) defines. */
export function foreignActions(engine, world, wires) {
  const avail = new Set(engine.set.available(world).flatMap((w) => (engine.set.get(w)?.operations ?? []).map((o) => o.action).filter(Boolean)));
  const out = [];
  for (const w of wires) for (const e of w.entries ?? []) if (e.key === 'core.request.action' && e.value?.v && !avail.has(e.value.v)) out.push(e.value.v);
  return out;
}

/**
 * Judge one record. `rec`: { world, text, context, tab, target, label_status, review, negative }.
 * Returns { ok, cause?, fix?: { kind: 'relabel'|'needs_review'|'promote'|'keep', target? }, detail? }.
 */
export async function judge({ engine, read }, rec) {
  const { world, text } = rec;
  if (rec.negative) return { ok: true, kind: 'negative' };
  const R = await read({ world, text, context: rec.context, tab: rec.tab });
  const faithful = R.complete && slotsFaithful(R.slots, `${text} ${(rec.context ?? []).join(" ")}`);
  if (rec.review) {
    // promotion of needs_review records
    if (faithful) return { ok: false, cause: 'needs_review_readable', fix: { kind: 'promote', target: R.target }, reading: R };
    return { ok: true, kind: 'needs_review_stays', reading: R };
  }
  if (!rec.target) return { ok: true, kind: 'no_target' };
  const p = parse(rec.target, { source: rec.id ?? 'x' });
  if (p.errors.length) return { ok: false, cause: 'target_unparsable', fix: faithful ? { kind: 'relabel', target: R.target } : { kind: 'needs_review' }, reading: R };
  const legends = engine.set.legends;
  const goldSop = normalizedSop(p.wires, legends);
  if (R.complete && sameSop(R.sop, goldSop)) return { ok: true, kind: 'agrees', reading: R };
  const repair = (cause, detail) => ({ ok: false, cause, detail, fix: faithful ? { kind: 'relabel', target: R.target } : { kind: 'needs_review' }, reading: R });
  const foreign = foreignActions(engine, world, p.wires);
  if (foreign.length) return repair('gold_target_from_another_world', foreign.slice(0, 3));
  // the all-worlds router's reading equals the target while the world reads something else: written by another world's rules
  if (R.complete && !sameSop(R.sop, goldSop)) {
    const A = await read({ world: null, text, context: rec.context, tab: rec.tab });
    if (A.complete && sameSop(A.sop, goldSop) && A.worlds.length && !A.worlds.some((w) => engine.set.available(world).includes(w))) return repair('gold_target_from_another_world', A.worlds);
  }
  if (R.complete) {
    const gl = literals(goldSop), ol = literals(R.sop);
    const missing = [...gl].filter((v) => !ol.has(v) && !IMPLICIT.has(v.replace(/^"|"$/g, '')) && !valueInText(v, text + " " + (rec.context ?? []).join(" ")));
    if (missing.length) return repair('gold_value_not_in_text', missing.slice(0, 3));
    if (rec.label_status === 'rules-differ' || rec.label_status === 'generator-disagrees') {
      return faithful ? { ok: false, cause: 'label_says_rules_differ', fix: { kind: 'relabel', target: R.target }, reading: R }
        : { ok: false, cause: 'label_says_rules_differ', fix: { kind: 'keep' }, reading: R };
    }
  }
  return { ok: true, kind: 'system_difference', reading: R };
}

/** Does a literal of a target (number, quoted string, bare word) occur in the text? */
function valueInText(v, text) {
  const t = String(text).toLowerCase();
  if (/^-?\d/.test(v)) return firmNumbersIn(text).has(Number(v)) || t.includes(v);
  const bare = v.replace(/^"|"$/g, '');
  const stem = (x) => x.replace(/(es|s)$/, '');
  return t.includes(bare.replace(/_/g, ' ')) || t.includes(stem(bare)) || valuesInText([{ key: 'x', value: bare }], text).ok;
}

export { numbersCovered, restrictedSet };
