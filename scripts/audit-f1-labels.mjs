#!/usr/bin/env node
/**
 * F1 label audit (review F1): compares paraphrase outputs labelled the old way (canonical target copied onto variants) with the
 * relabelled ones, and separates parser errors from labelling errors.
 *
 *   node scripts/audit-f1-labels.mjs --old <out-dir> [--old <out-dir> ...] --new <out-dir> [--new ...] [--out training/results/f1-label-audit.json]
 *
 * The i-th --old is compared with the i-th --new (train, then held-out). Records are matched by example_id.
 *  - labelling error: the old label inherited the canonical target although the canonical's values do not match the variant's text
 *    ("a key with 4 sharps?" labelled n=3, acc=flat).
 *  - parser error: the rules parsed the variant completely but their own slot values are not a faithful reading of the text.
 *  - parser gap: nothing parsed (not an error of either kind; the canonical target may be inherited when the values match).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from '../src/soplang/index.mjs';
import { slotsOf, slotsFaithful, valuesMatch, numbersCovered } from './collect-paraphrases.mjs';

const args = process.argv.slice(2);
const all = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const olds = all('--old'), news = all('--new');
const outFile = all('--out')[0] ?? 'training/results/f1-label-audit.json';
const readDir = (d) => readdirSync(d).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(join(d, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const slotsOfWires = (w) => { try { return slotsOf(parse(w).wires); } catch { return null; } };

const report = { sets: {}, notes: 'old = canonical target copied onto variants; new = F1 labelling (own reading when faithful, inherit only when values match)' };
news.forEach((nd, i) => {
  const name = i === 0 ? 'train' : 'heldout';
  const oldRecs = readDir(olds[i]), newRecs = readDir(nd);
  const oldBy = new Map(oldRecs.map((r) => [r.example_id, r]));
  const canonOf = new Map();
  for (const r of oldRecs) if (r.phenomenon === 'canonical' && r.label_status !== 'canonical-failed') canonOf.set(`${r.world}|${r.batch}|${r.task}`, r);
  const perWorld = {}, matrix = {}, examples = { labelling_error: [], parser_error: [], inherited_ok: [] };
  const w = (k) => (perWorld[k] ??= { variants: 0, old: {}, new: {}, old_inherited: 0, labelling_errors: 0, parser_errors: 0, parser_errors_number: 0, parser_gaps: 0, old_target_wrong_but_own_ok: 0, number_conflicts: 0 });
  for (const r of newRecs) {
    if (r.phenomenon !== 'variant') continue;
    const o = oldBy.get(r.example_id);
    const pw = w(r.world);
    pw.variants++; pw.new[r.label_status] = (pw.new[r.label_status] ?? 0) + 1;
    if (!o) continue;
    pw.old[o.label_status] = (pw.old[o.label_status] ?? 0) + 1;
    const key = `${o.label_status} -> ${r.label_status}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
    const c = canonOf.get(`${o.world}|${o.batch}|${o.task}`);
    const cSlots = c ? slotsOfWires(c.wires) : null;
    const ownSlots = r.wires ? slotsOfWires(r.wires) : null; // current rules' reading (the old outputs predate later rule changes)
    const parsed = r.wires && /core\.(request|question|fact|retract)/.test(r.wires) && !/I did not understand/.test(r.reply ?? '');
    const ownFaithful = parsed && ownSlots ? slotsFaithful(ownSlots, o.text) : null;
    if (o.target_from === 'canonical') {
      pw.old_inherited++;
      const ok = cSlots ? valuesMatch({ slots: cSlots }, o.text) : false;
      if (!ok) {
        pw.labelling_errors++;
        if (ownFaithful) pw.old_target_wrong_but_own_ok++;
        if (cSlots && !numbersCovered(cSlots, o.text)) pw.number_conflicts++;
        if (examples.labelling_error.length < 25) examples.labelling_error.push({ world: o.world, text: o.text, old_target_from: 'canonical', canonical: c?.text, old_status: o.label_status, new_status: r.label_status, own_reading_faithful: ownFaithful });
      } else if (examples.inherited_ok.length < 10) examples.inherited_ok.push({ world: o.world, text: o.text, canonical: c?.text, new_status: r.label_status });
    }
    if (parsed && ownFaithful === false) {
      pw.parser_errors++;
      if (!numbersCovered(ownSlots, o.text)) pw.parser_errors_number++;
      if (examples.parser_error.length < 25) examples.parser_error.push({ world: o.world, text: o.text, own_slots: ownSlots.map((s) => `${s.key}=${s.value}`), reply: (r.reply ?? '').slice(0, 80), new_status: r.label_status });
    }
    if (!parsed) pw.parser_gaps++;
  }
  const sum = (k) => Object.values(perWorld).reduce((a, p) => a + p[k], 0);
  report.sets[name] = {
    variants: sum('variants'), old_inherited_targets: sum('old_inherited'), labelling_errors: sum('labelling_errors'),
    labelling_errors_where_rules_own_reading_was_right: sum('old_target_wrong_but_own_ok'), labelling_errors_with_number_conflict: sum('number_conflicts'), parser_errors_unfaithful_reading: sum('parser_errors'), parser_errors_number_dropped_or_changed: sum('parser_errors_number'), parser_gaps: sum('parser_gaps'),
    new_label_reasons: newRecs.filter((r) => r.phenomenon === 'variant' && r.label_reason).reduce((a, r) => ({ ...a, [r.label_status + ':' + r.label_reason]: (a[r.label_status + ':' + r.label_reason] ?? 0) + 1 }), {}),
    transition_matrix: Object.fromEntries(Object.entries(matrix).sort()), per_world: perWorld, examples,
  };
});
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 1) + '\n');
for (const [n, s] of Object.entries(report.sets)) console.log(n, JSON.stringify({ variants: s.variants, old_inherited_targets: s.old_inherited_targets, labelling_errors: s.labelling_errors, own_ok: s.labelling_errors_where_rules_own_reading_was_right, parser_errors: s.parser_errors, parser_gaps: s.parser_gaps }));
