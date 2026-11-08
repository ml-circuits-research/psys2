/**
 * Gold labels for dispatcher evaluation (scripts/eval-dispatch.mjs, scripts/make-oracle-pred.mjs). Node only.
 *
 * A prediction record is joined to its gold by `id`:
 *   - the id of a per-world dataset record (training/dataset/<world>/test.jsonl): one gold segment, world = record world, target = record target;
 *   - the id of a routing row (training/dataset/routing.jsonl): world only (no target: end-to-end SOP is not scored);
 *   - the example_id of a held-out paraphrase (training/paraphrases/heldout/out, needs_review excluded): one gold segment, source 'heldout', target = expected_circuit;
 *   - the id of a multi-command message (training/dataset/multicmd/test.jsonl, ids mc......): gold segments [{start,end,text,world,source_id}],
 *     the target of each segment is the target of the per-world record `source_id` (looked up in any split).
 * Gold is { id, kind: 'single' | 'multi', source, negative, text, context, segments: [{ start, end, text, world, target }], hasTarget }.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The "plain" multi-command variant lower-cases the text, so the string values of a segment's target are lower-cased too (consistent gold). */
export const lowerStrings = (target) => (target == null ? target : String(target).replace(/"(?:[^"\\]|\\.)*"/g, (x) => x.toLowerCase()));
/**
 * Gold target of a multi-command segment: the target of its source record, lower-cased in strings for the "plain" variant, and NONE when the
 * source record reads values from its session context (ellipsis: "Amy eats 2." after "Amy has 8 plums."): the message carries no session, so
 * the circuit cannot be derived from the segment (the segment still counts for segmentation and world routing).
 */
export function segmentTarget(rec, variant) {
  if (!rec?.target || (rec.context ?? []).length > 0) return null;
  return variant === 'plain' ? lowerStrings(rec.target) : rec.target;
}
const readJsonl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** Load every label needed. `root` = training/dataset. */
export function loadGold(root, { heldoutDir = join(root, '..', 'paraphrases', 'heldout', 'out') } = {}) {
  const known = Object.keys(JSON.parse(readFileSync(join(root, 'stats.json'), 'utf8')).worlds);
  const worldDirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && known.includes(d.name)).map((d) => d.name).sort();
  const recs = new Map();      // id -> per-world record (test split first, other splits only for source_id lookups)
  const testIds = new Set();
  for (const split of ['test', 'dev', 'train']) {
    for (const w of worldDirs) {
      const f = join(root, w, `${split}.jsonl`);
      if (!existsSync(f)) continue;
      for (const r of readJsonl(f)) { if (!recs.has(r.id)) recs.set(r.id, r); if (split === 'test') testIds.add(r.id); }
    }
  }
  const routing = new Map(readJsonl(join(root, 'routing.jsonl')).filter((r) => r.split === 'test').map((r) => [r.id, r]));
  // held-out paraphrases (training/paraphrases/heldout/out/<world>.jsonl): id = example_id, target = expected_circuit, needs_review excluded
  const heldout = new Map();
  if (existsSync(heldoutDir)) {
    for (const f of readdirSync(heldoutDir).filter((x) => x.endsWith('.jsonl')).sort()) {
      for (const r of readJsonl(join(heldoutDir, f))) if (!r.needs_review) heldout.set(r.example_id, { ...r, world: r.world ?? f.replace(/\.jsonl$/, '') });
    }
  }
  const mcFile = join(root, 'multicmd', 'test.jsonl');
  const multi = new Map((existsSync(mcFile) ? readJsonl(mcFile) : []).map((r) => [r.id, r]));
  return {
    worldDirs,
    ids: () => [...multi.keys(), ...[...testIds]],
    multiIds: () => [...multi.keys()],
    testIds: () => [...testIds],
    routingRows: () => [...routing.values()],
    heldoutIds: () => [...heldout.keys()],
    get(id) {
      const m = multi.get(id);
      if (m) {
        const segments = m.segments.map((s) => ({ start: s.start, end: s.end, text: s.text, world: s.world, target: segmentTarget(recs.get(s.source_id), m.variant), negative: !!recs.get(s.source_id)?.negative }));
        return { id, kind: 'multi', source: 'multi-command', negative: false, text: m.text, context: m.context, segments, hasTarget: segments.every((s) => s.target), variant: m.variant };
      }
      const r = recs.get(id);
      if (r) {
        const ctx = { tab: r.tab ?? null, recent_worlds: [], session: r.context ?? [] };
        return { id, kind: 'single', source: r.source, negative: !!r.negative, text: r.text, context: ctx, segments: [{ start: 0, end: r.text.length, text: r.text, world: r.world, target: r.negative ? '' : r.target }], hasTarget: true };
      }
      const h = heldout.get(id);
      if (h) return { id, kind: 'single', source: 'heldout', negative: false, text: h.text, context: { tab: h.tab ?? null, recent_worlds: [], session: h.context ?? [] }, segments: [{ start: 0, end: h.text.length, text: h.text, world: h.world, target: h.expected_circuit }], hasTarget: true };
      const g = routing.get(id);
      if (g) return { id, kind: 'single', source: g.source, negative: false, text: g.text, context: g.context, segments: [{ start: 0, end: g.text.length, text: g.text, world: g.world, alt_worlds: g.alt_worlds ?? [], target: null }], hasTarget: false };
      return null;
    },
  };
}

/** Character IoU of two spans. */
export const iou = (a, b) => {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const uni = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return uni > 0 ? inter / uni : 0;
};

/** A predicted segmentation matches the gold one when it has as many segments and each pair overlaps with IoU >= thr. */
export function segmentationMatches(segments, gold, thr = 0.6) {
  return segments.length === gold.length && segments.every((s, i) => iou(s, gold[i]) >= thr);
}

/** Segment-level precision/recall counts between predicted and gold segments (greedy in order, IoU >= thr). */
export function segmentCounts(segments, gold, thr = 0.6) {
  const used = new Set();
  let tp = 0;
  for (const s of segments) {
    const j = gold.findIndex((g, k) => !used.has(k) && iou(s, g) >= thr);
    if (j >= 0) { used.add(j); tp++; }
  }
  return { tp, pred: segments.length, gold: gold.length };
}
