#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Converts the labelled messages of diagram-vss-demo (imports/diagram-vss-demo/data/{train,test}, commit 9900d34, AGPL-3.0) into this project's
// training format, for the world diagram.sketch (task DIAG; imports/diagram-vss-demo/README.md "Conversion of the data").
//
//   node scripts/convert-diagram-data.mjs
//
// One message = one dispatcher example: its segments are the wire spans in text order (overlapping spans are merged), every segment belongs to
// diagram.sketch, the text outside the spans is "no request" filler. Each wire becomes a canonical request: action -> diagram.<action>,
// ask -> diagram.ask.<ask>, fact / rule -> diagram.fact / diagram.rule, args -> arg.* (canonical values of the source legend; "$new" and
// "mention(...)" are kept as the source writes them, ops.mjs nodesOf() maps them to discourse referents).
// Output (training/diagram/; the big jsonl files are gitignored and reproducible with this script):
//   train.jsonl, test.jsonl            dataset records (training/README.md "Dataset"): example_id, lineage, group, world, text, expected_circuit, label_status ...
//                                      build-dataset.mjs ingests train.jsonl; test.jsonl is kept as the first measurement (scripts/eval-diagram.mjs)
//   segments-train.jsonl, segments-test.jsonl   segmentation records in the multicmd format: { id, text, context, variant, n_segments, segments[{start,end,text,world,alt_worlds,source_id}] }
//   top-spans.json                     the 40 most frequent short spans per act (examples for the world's patterns)
//   report.json                        counts
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(REPO, 'imports/diagram-vss-demo/data');
const OUT = join(REPO, 'training/diagram');
const WORLD = 'diagram.sketch';
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

const actOf = (w) => (w.type === 'question' ? `diagram.ask.${w.args.ask}` : w.type === 'fact' ? 'diagram.fact' : w.type === 'rule' ? 'diagram.rule' : `diagram.${w.args.action}`);
const q = (v) => JSON.stringify(String(v));
function circuit(wires) {
  return wires.map((w, i) => {
    const lines = [`@w${i + 1} core.request`, `    core.request.action=${actOf(w)}`];
    for (const [k, v] of Object.entries(w.args)) {
      if (k === 'action' || k === 'ask' || v === null || v === undefined || v === '') continue;
      lines.push(`    core.request.arg.${k}=${/^[\w.-]+$/.test(String(v)) ? v : q(v)}`);
    }
    return lines.join('\n');
  }).join('\n');
}

/** Wire spans located in the text, in order; overlapping or identical spans are merged into one segment. */
function segmentsOf(text, wires) {
  const found = [];
  let from = 0;
  for (const w of wires) {
    const s = String(w.span ?? '').trim();
    if (!s) continue;
    let at = text.indexOf(s, from);
    if (at < 0) at = text.indexOf(s);
    if (at < 0) { const low = text.toLowerCase().indexOf(s.toLowerCase()); at = low; }
    if (at < 0) continue;
    found.push({ start: at, end: at + s.length, wire: w });
    from = at;
  }
  found.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && f.start < last.end) { last.end = Math.max(last.end, f.end); last.wires.push(f.wire); } else merged.push({ start: f.start, end: f.end, wires: [f.wire] });
  }
  return merged;
}

const report = { source: 'diagram-vss-demo@9900d34', splits: {} };
const spans = {};
for (const split of ['train', 'test']) {
  const files = walk(join(SRC, split)).filter((f) => f.endsWith('.jsonl')).sort();
  const records = [], segs = [];
  let noSpan = 0, messages = 0, wires = 0, unlabelled = 0, unlocated = 0;
  const acts = {};
  for (const f of files) {
    const dir = relative(join(SRC, split), f).split('/')[0];
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (!Array.isArray(r.wires) || !r.text) { unlabelled++; continue; }
      const pending = r.wires.filter((w) => !w.args).length;   // test wires that only say what is still to be decided (no args): not requests
      r.wires = r.wires.filter((w) => w.args);
      if (!r.wires.length) { unlabelled++; continue; }
      messages++; wires += r.wires.length; report.pending_wires = (report.pending_wires ?? 0) + pending;
      const segments = segmentsOf(r.text, r.wires);
      const spanned = r.wires.filter((w) => String(w.span ?? '').trim()).length;
      noSpan += r.wires.length - spanned;
      unlocated += spanned - segments.reduce((n, s) => n + s.wires.length, 0);
      for (const w of r.wires) { const a = actOf(w); acts[a] = (acts[a] ?? 0) + 1; if (split === 'train' && w.span) { const sp = String(w.span).trim().replace(/[.!?]+$/, ''); if (sp.length >= 4 && sp.length <= 48 && !/["'“”]/.test(sp)) ((spans[`${w.type}:${w.args.action ?? w.args.ask ?? '-'}`] ??= new Map())).set(sp, (spans[`${w.type}:${w.args.action ?? w.args.ask ?? '-'}`].get(sp) ?? 0) + 1); } }
      const id = `diagram.sketch/${split}/${dir}/${r.id}`;
      const acted = [...new Set(r.wires.map(actOf))];
      records.push({
        example_id: id, lineage: { kind: 'imported', source: 'diagram-vss-demo@9900d34', world: WORLD, file: `${split}/${relative(join(SRC, split), f)}` },
        group: `${WORLD}/${dir}/${String(r.id).replace(/-?\d+$/, '')}`, world: WORLD, language: 'en', text: r.text, message: r.text, context: [],
        canvas: { names: r.names ?? [], groups: r.groups ?? {} }, domain: r.domain ?? null, segment_count: segments.length, spans_complete: spanned === r.wires.length,
        expected_circuit: circuit(r.wires), label_status: 'imported-labelled', phenomenon: acted.length > 1 ? 'multi-act' : 'single-act', acts: acted,
      });
      segs.push({
        id, text: r.text, context: { tab: 'diagram', recent_worlds: [WORLD], session: [], synthetic: true }, variant: 'clean', n_segments: segments.length, spans_complete: spanned === r.wires.length,
        segments: segments.map((s, i) => ({ start: s.start, end: s.end, text: r.text.slice(s.start, s.end), world: WORLD, alt_worlds: [], source_id: `${id}#${i}` })),
      });
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${split}.jsonl`), `${records.map((x) => JSON.stringify(x)).join('\n')}\n`);
  writeFileSync(join(OUT, `segments-${split}.jsonl`), `${segs.map((x) => JSON.stringify(x)).join('\n')}\n`);
  report.splits[split] = { files: files.length, messages, wires, segments: segs.reduce((n, s) => n + s.n_segments, 0), skipped_without_labels: unlabelled, wires_with_span_not_found: unlocated, wires_without_span: noSpan, acts: Object.fromEntries(Object.entries(acts).sort((a, b) => b[1] - a[1])) };
}
const top = {};
for (const [a, m] of Object.entries(spans)) top[a] = [...m].sort((x, y) => y[1] - x[1]).slice(0, 40).map(([s]) => s);
writeFileSync(join(OUT, 'top-spans.json'), `${JSON.stringify(top, null, 1)}\n`);
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify({ train: { ...report.splits.train, acts: undefined }, test: { ...report.splits.test, acts: undefined } }));
