#!/usr/bin/env node
/**
 * Markdown report from the JSON files of scripts/eval-phases.mjs.
 *   node scripts/lib/phase-report.mjs [training/results/phase-analysis-train.json] [training/results/phase-analysis-operational.json] > training/results/phase-analysis-train.md
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const trainFile = resolve(process.argv[2] ?? 'training/results/phase-analysis-train.json');
const opFile = resolve(process.argv[3] ?? 'training/results/phase-analysis-operational.json');
const T = JSON.parse(readFileSync(trainFile, 'utf8'));
const O = existsSync(opFile) ? JSON.parse(readFileSync(opFile, 'utf8')) : null;
const out = [];
const p = (...x) => out.push(x.join(''));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const q = (s, n = 150) => esc(String(s ?? '').length > n ? String(s).slice(0, n - 1) + '…' : s);
const table = (head, rows) => { p('| ', head.join(' | '), ' |'); p('| ', head.map(() => '---').join(' | '), ' |'); for (const r of rows) p('| ', r.map(esc).join(' | '), ' |'); p(''); };
const pct = (a, b) => (b ? `${Math.round((1000 * a) / b) / 10}%` : '-');

const REASON = {
  rule_unparsed: ['SYSTEM (missing pattern / coverage)', 'The gold world\'s rules parse nothing of this colloquial variant (label `rules-fail`: the paraphrase was written by a model, the canonical circuit is the label). The dispatcher and validator have nothing to validate, so the piece is either not understood or a catch-all reading of another world wins. Only a pattern, the normalizer or partial understanding can fix it; none of G1-G8 covers it.'],
  rule_partial_parse: ['SYSTEM (missing pattern / coverage)', 'The rules read part of the text (one clause, one slot) and drop the rest; partial understanding then returns the incomplete circuit, which differs from the gold. Typical: second clause of a compound statement, a slot phrase the pattern does not know.'],
  negative_accepted_by_validator: ['SYSTEM (over-acceptance)', 'The item is a negative (near-miss, negation, out-of-domain): nothing should be understood. The gold world\'s rules refuse it, but the dispatcher offers 3 worlds per piece and a catch-all pattern of another world (e.g. `geo.unknown`, `music.melodyAdd notes=...`, `chart.removePoint`, `kids.shapes.thing name=sky`) parses it completely, so the validator accepts it. The user would get a confident wrong answer instead of "not understood".'],
  gold_target_from_another_world: ['DATA (wrong label)', 'The gold circuit uses an action that no operation of the labelled world defines (e.g. `music.melodyAdd` for a kids.tasks sentence, `hm.word` for kids.common, `chess.hint` for ui.help). The target was written by the all-worlds rule router (`rules-own`) or inherited from a record of another world. Training on it teaches a wrong circuit.'],
  label_says_rules_differ: ['DATA (known disagreement)', 'The record carries `rules-differ` or `generator-disagrees`: the generator and the rules disagree and the label is a guess. The rules\' reading is usually the right one (`who=we` for "show the captured pieces", `root=f_sharp` for "F# minor" where the gold says `d`).'],
  gold_value_not_in_text: ['DATA (wrong label)', 'The gold circuit holds a value the text does not contain (e.g. `item=plum` for "amy eats 2", `arg.t="it"` for "unformat everything"). The text was edited or paraphrased after the target was written.'],
  wrong_world_chosen: ['SYSTEM (cross-world ambiguity)', 'The rules read the text validly in the gold world, but another world also reads it validly and wins on the dispatcher world score (`give me a clue` ui.hint vs chess.hint, `not so fast` ui.rate vs music.tempo, `what are you called` chat.name vs avatar.askName). The text is ambiguous without the tab; the dispatcher context features do not settle it.'],
  gold_world_not_in_top3: ['SYSTEM (dispatcher)', 'The dispatcher model does not put the gold world in its top-3 for the piece (`double the apples`: chart.adjustPoint wins over draw.duplicate). Nothing downstream can recover.'],
  unknown_argument: ['SYSTEM (execution, F5)', 'SOP is right but the interpreter reports `unknown_argument` (an item or name the state does not know). Counted on right items; the validator already ranks such a reading last.'],
  other_segmentation_won: ['SYSTEM (validator)', 'A different segmentation of the beam beat the one that matches the gold; it splits one command into two readings (`who do i talk to, what name` read as two chat.name requests), or adds a second piece that the rules also read.'],
  'rule_reads_differently:structure_or_values': ['SYSTEM or DATA (rules vs gold disagree, both complete)', 'The gold world\'s rules parse the text completely and differ from the gold in structure or value. Examples: `tasks.done` where the gold says `tasks.check`, `chat.meet` where the gold says `avatar.setName`, a greedy capture. Needs a decision per pattern; not auto-classified as data.'],
  negative_parsed_by_rules: ['DATA or SYSTEM (negative that the rules read)', 'The gold says "nothing to understand" but the gold world\'s rules read it ("I do not want a balloon" as draw.remove, "how many legs does a spider have" as an animals question). Either the negative label is wrong (the question is in-domain for another world) or the pattern is too eager.'],
  discourse_or_meta_answered_instead: ['SYSTEM (discourse layer)', 'The discourse layer (ellipsis / meta-dialogue) answered before the dispatcher saw the text.'],
  segmentation_merges_pieces: ['SYSTEM (dispatcher segmentation)', 'A 3-command message without joiners is cut into fewer pieces than the gold (G6 territory: long messages).'],
  complete_reading_not_chosen: ['SYSTEM (selection, G1)', 'A partial reading beat a complete one.'],
};
const G = { G1: 'selection: complete before partial / generated', G2: 'self-corrections executed early', G3: 'captures and spelling', G6: 'long messages', G8: 'Romanian' };

p('# Phase analysis of the training data (does the whole pipeline close?)');
p('');
p(`Generated by \`scripts/eval-phases.mjs\` + \`scripts/lib/phase-report.mjs\` on ${T.meta.items} sampled training items (${T.meta.scored_items} scored end to end, ${T.meta.items - T.meta.scored_items} needs_review items without a gold circuit), seed ${T.meta.seed}, ${T.meta.seconds} s on 20 workers. Raw data: \`training/results/phase-analysis-train.json\` (one row per item, with the per-phase trace) and \`training/results/phase-analysis-operational.json\` (the operational set through the same tracer).`);
p('');
p('## Method');
p('');
p('Each item goes through the real dialog engine in the webchat configuration (dispatcher v2 int8 via onnxruntime-node, rule validation, spellcheck, partial understanding, acceptRefused; no normalizer, as in the rules/dispatcher evaluation). **Right** = the concatenated, id-normalized SOP of everything understood equals the concatenation of the gold segment SOPs (string values compared case-insensitively; negatives: nothing understood). In parallel an **oracle** runs the rule formalizer on the gold text with the gold world only, in a session seeded like the item, no dispatcher or validator. The first deviating phase of a wrong item is, in this order:');
p('');
table(['Phase', 'Deviation test'], [
  ['P1 translation', 'not applicable: training data is English (counted only for non-ASCII Romanian text; tag G8)'],
  ['P2 expansion', 'oracle fails on an item of the expansion families (self_correct, shared_arg, ellipsis, repeat_undo) or a marker text, with no data cause'],
  ['P3 segmentation', 'no segmentation of the dispatcher beam (4) matches the gold pieces (char IoU >= 0.6)'],
  ['P4 world proposal', 'in the matching segmentation a piece has no gold world in its top-3'],
  ['P5 rule formalizer', 'oracle (gold text, gold world) does not give the gold SOP; split into DATA (label noise) and SYSTEM (pattern missing / reads differently). A data cause is attributed here first, because the gold itself is untrustworthy'],
  ['P6 validation', 'oracle is right, segmentation and world are available, but the validator chose another reading (reason: segmentation, world, variant)'],
  ['P7 execution', 'SOP right but the interpreter reports execution_error / unknown_argument (state-dependent refusals such as precondition_failed are only counted)'],
  ['P8 reply', 'SOP right but the reply holds an unrendered template, "Something went wrong" or nothing'],
  ['discourse', 'the discourse layer answered instead of the dispatcher (not in the user\'s list; shown separately)'],
]);
p('The sample is stratified (not proportional): per-world train records by world x label status (rules-fail, rules-differ, generator-disagrees and negatives oversampled), paraphrase variants by label status x world (needs_review x4, rules-fail/differ x3), multi-command train by family x segment count x variant. Raw percentages therefore **understate** the real quality; every row carries a population weight and the "weighted" columns extrapolate to the pools (',
  `${T.meta.population.pools.train_per_world} per-world train records, ${T.meta.population.pools.paraphrase_variants} paraphrase variants, ${T.meta.population.pools.multicmd} multi-command train messages).`, ')');
p('');

p('## 1. End-to-end correctness on the train sample');
p('');
const ov = T.overall;
p(`Overall: **${ov.right}/${ov.n} right (${ov.right_pct}%)**, population-weighted ${ov.weighted_right_pct}%. Clean (right and no execution/reply artifact): ${ov.clean_pct}%. Strictly case-sensitive differences hidden by the case-insensitive comparison: ${T.data_problems.case_only_mismatch_items} right items (multi-command "plain" variant: text lower-cased, gold keeps the original casing, e.g. \`"C C F A"\` vs \`"c c f a"\`).`);
p('');
const row = (k, v) => [k, v.n, v.right, `${v.right_pct}%`, `${v.weighted_right_pct}%`];
p('**By pool**'); p('');
table(['pool', 'n', 'right', 'right %', 'weighted %'], Object.entries(T.by_set).map(([k, v]) => row(k, v)));
p('**By number of segments**'); p('');
table(['segments', 'n', 'right', 'right %', 'weighted %'], Object.entries(T.by_segments).map(([k, v]) => row(k, v)));
p('**By world**'); p('');
table(['world', 'n', 'right', 'right %', 'weighted %'], Object.entries(T.by_world).map(([k, v]) => row(k, v)));
p('**By family** (`pool/family`, n >= 8)'); p('');
table(['family', 'n', 'right', 'right %', 'weighted %'], Object.entries(T.by_family).filter(([, v]) => v.n >= 8).map(([k, v]) => row(k, v)));
p('**By label status** (the F1 label of the item)'); p('');
table(['label_status', 'n', 'right', 'right %'], Object.entries(T.by_label_status).map(([k, v]) => [k, v.n, v.right, `${v.right_pct}%`]));

p('## 2. Failure funnel');
p('');
const fw = T.funnel_first_failing_phase_wrong_items, fp = T.funnel_weighted_to_population;
const nWrong = Object.values(fw).reduce((a, b) => a + b, 0);
p(`${nWrong} wrong items. Each is counted once, at its first deviating phase.`);
p('');
table(['phase', 'items first failing here', 'share of wrong', 'weighted to population'], Object.keys(fw).filter((k) => fw[k] || ['P1', 'P2', 'P7', 'P8'].includes(k)).map((k) => [k, fw[k], pct(fw[k], nWrong), fp[k]]));
p(`Right items with a P7 artifact (execution_error / unknown_argument): ${T.right_items_flagged_p7_p8.P7}; with a P8 reply artifact: ${T.right_items_flagged_p7_p8.P8}. Interpreter refusals on right items (state reasons, legitimate for context-free training sentences): ${JSON.stringify(T.refusal_reasons_on_right_items)}.`);
p('');
const d = T.independent_deviation_counts;
p(`Independent deviation counts (an item may deviate in several phases; not only the first): P3 ${d.p3}, P4 ${d.p4}, P5 ${d.p5} (oracle differs from gold), P7 ${d.p7}, P8 ${d.p8}. The dispatcher (P3+P4) is almost never the first failure on the training data (P3 ${fw.P3}, P4 ${fw.P4}); the weak points are the rules (P5) and the validator accepting readings it should refuse (P6).`);
p('');
p('Tags of the worker task that would fix the wrong items: ', Object.entries(T.wrong_by_task_tag).map(([k, v]) => `${k} (${G[k]}) ${v}`).join('; ') || 'none', '. Only a handful of training items are G-task failures: G1/G2/G3/G6/G8 are mostly operational-set problems (messy real input), not training-data problems.');
p('');

p('## 3. Top failure causes per phase');
p('');
const byPhase = {};
for (const c of T.causes) (byPhase[c.phase] ??= []).push(c);
for (const ph of ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'discourse']) {
  const cs = byPhase[ph];
  if (!cs?.length) { p(`### ${ph}`); p(''); p('No item first fails here.'); p(''); continue; }
  p(`### ${ph}`); p('');
  for (const c of cs.slice(0, 4)) {
    const [cls, why] = REASON[c.reason] ?? ['SYSTEM', ''];
    p(`**${c.reason}** — ${c.n} items in the sample (weighted ${c.weighted_n}); ${cls}. Tags: ${Object.entries(c.tags).map(([k, v]) => `${k}:${v}`).join(', ') || '-'}. Label status: ${Object.entries(c.label_status).map(([k, v]) => `${k}:${v}`).join(', ')}.`);
    p('');
    p(`Likely reason: ${why}`);
    p('');
    for (const r of c.examples.filter((x) => x.phase === c.phase).slice(0, 4)) {
      p(`- \`${r.world}\` (${r.set}/${r.family}, ${r.label_status}): "${q(r.text, 130)}"`);
      if (r.gold_sop?.length) p(`  - gold: ${q(r.gold_sop.join(' // '), 230)}`);
      if (r.got_sop) p(`  - pipeline: ${q(r.got_sop.join(' // ') || '(not understood)', 230)}${r.chosen ? ` [${q(r.chosen.join('; '), 120)}]` : ''}`);
      if (r.detail?.length) p(`  - evidence: ${q(JSON.stringify(r.detail), 100)}`);
    }
    p('');
  }
}

p('## 4. Data problems versus system problems');
p('');
const dp = T.data_problems;
const pop = T.meta.population;
const totalPop = pop.pools.train_per_world + pop.pools.paraphrase_variants + pop.pools.multicmd;
p(`DATA problems (the oracle shows the gold is wrong, independent of the dispatcher): **${dp.items} of ${T.meta.scored_items} scored items**, about **${dp.weighted_items} of ${totalPop} training items (${pct(dp.weighted_items, totalPop)})** by population weighting. Everything else in the failure list is a SYSTEM problem.`);
p('');
table(['data problem', 'sample items', 'weighted population', 'label statuses', 'proposed fix'], Object.entries(dp.by_reason).map(([k, v]) => [k, v.n, v.weighted_n, JSON.stringify(v.by_label_status),
  k === 'gold_target_from_another_world' ? 'relabel the SOP with the rule reading of the labelled world when it parses completely, otherwise mark `needs_review`; keep the text and world label for dispatcher training (the world label is right, the circuit is wrong)'
  : k === 'label_says_rules_differ' ? 'relabel with the rules\' reading when the text values agree with it (most cases); the remaining `rules-differ` records go to `needs_review`. Do not drop: the sentence is good dispatcher data'
  : k === 'gold_value_not_in_text' ? 'relabel from the text (regenerate the target from the edited text) or drop the SOP target; multicmd: regenerate the segment target after the text edit' : 'review']));
const ownRate = (() => { const r = T.by_label_status['rules-own']; const x = dp.by_reason.gold_target_from_another_world?.by_label_status?.['rules-own'] ?? 0; return r ? `${x}/${r.n} = ${pct(x, r.n)}` : '-'; })();
p(`Highest-density source: label status \`rules-own\` (the target is the rule router's own reading over all worlds): ${ownRate} of the sampled rules-own items carry a circuit from another world. Population check on all ${pop.train_records} per-world train records: ${pop.xworld.text_in_several_worlds_with_different_targets} (${pop.xworld.pct}%) have a text that also occurs in another world with a different target (cross-world ambiguity; the label depends on the tab context).`);
p('');
p('Not data problems, although they look like it at first sight: `rules-fail` paraphrases (the label is the canonical circuit and is right; the rules cannot read the variant), and `generator-disagrees` records where the pipeline reproduces the gold (they are right in most cases: ' + (T.by_label_status['generator-disagrees']?.right_pct ?? '-') + '% of the sample).');
p('');
const negs = T.rows.filter((r) => r.negative);
p(`Items whose gold is \`negative\` deserve a decision: ${negs.filter((r) => r.right === false).length} of ${negs.length} sampled negatives are accepted by the pipeline (P6 over-acceptance). That is a system problem, but \`negation\` records such as "I do not want a balloon" (gold: nothing) are parsed as \`draw.remove\` by the rules of the gold world, which is arguably a better answer than the label; those (\`negative_parsed_by_rules\`) are candidates for relabel.`);
p('');
p('Summary of the split on the wrong items (sample):');
p('');
const dataWrong = nWrong ? T.rows.filter((r) => r.phase && r.right === false && (r.kind === 'data' || r.oracle_cause?.startsWith('data:'))).length : 0;
table(['class', 'wrong items', 'share'], [['DATA (wrong or inherited label)', dataWrong, pct(dataWrong, nWrong)], ['SYSTEM', nWrong - dataWrong, pct(nWrong - dataWrong, nWrong)]]);
p('Within SYSTEM, the largest block is missing rule coverage for colloquial variants (rule_unparsed + rule_partial_parse), followed by over-acceptance of negatives and cross-world ambiguity. No G task addresses the first block; the normalizer and new patterns do.');
p('');

if (T.needs_review) {
  const n = T.needs_review;
  p('## 5. needs_review variants (no gold circuit)');
  p('');
  p(`${n.n} sampled variants whose F1 label is \`needs_review\` (excluded from \`train.jsonl\`; the label has no circuit). The pipeline reads ${n.understood_complete} completely (${n.understood_in_gold_world} in the labelled world, ${n.understood_original_variant} from the original text without generated variants), ${n.partial} partially, and does not understand ${n.not_understood}. Label reasons: ${JSON.stringify(n.by_label_reason)}.`);
  p('');
  p('Proposal: the completely understood ones in the labelled world from the original text (about ' + n.understood_original_variant + ' of ' + n.n + ') are relabel candidates: adopt the pipeline circuit after a value check (numbers, names in the text). The partial and not-understood ones stay out of SOP training and remain dispatcher-only data (world label).');
  p('');
  p('Examples:'); p('');
  for (const e of n.examples.slice(0, 6)) p(`- \`${e.world}\` [${e.label_reason}] "${q(e.text, 100)}" -> ${e.understood ? 'understood' : 'not understood'} ${q(e.sop.join(' // '), 160)}`);
  p('');
}

if (O) {
  p('## 6. Operational set through the same tracer (comparison)');
  p('');
  p(`All ${O.overall.n} operational cases: **${O.overall.right} right (${O.overall.right_pct}%)**. The ${O.overall.n - O.overall.right} failures have no gold SOP, so phases are judged against the case's world (P4: world not among the proposed; P5: nothing parsed in the gold world, or parsed but the result differs; P6: validator took another reading). A reviewer classifies these by hand elsewhere; this table only gives the phase view for comparison.`);
  p('');
  const of = O.funnel_first_failing_phase_wrong_items;
  table(['phase', 'items'], Object.entries(of).filter(([, v]) => v).map(([k, v]) => [k === 'P5_or_P7' ? 'P5/P7 (parsed, result differs)' : k, v]));
  table(['phase', 'reason', 'n', 'tags'], O.causes.map((c) => [c.phase, c.reason, c.n, JSON.stringify(c.tags)]));
  p('Tags: ' + Object.entries(O.wrong_by_task_tag).map(([k, v]) => `${k} ${v}`).join(', ') + '. Contrast with the training sample: on operational input the validator\'s partial readings (G1) and wrong-world picks matter most, while on the training data the rule coverage of paraphrases and the negatives dominate.');
  p('');
  const ex = [];
  for (const c of O.causes) for (const r of c.examples.slice(0, 2)) ex.push(`- ${c.phase}/${c.reason} \`${r.world}\`: "${q(r.text, 90)}" → ${q(r.reply, 90)} (${q((r.failing ?? []).join('; '), 80)})`);
  p('Examples:'); p(''); out.push(...ex.slice(0, 14)); p('');
}

p('## 7. Reproduce');
p('');
p('```');
p('node scripts/eval-phases.mjs --ort <onnxruntime-node entry> --workers 20 --name train         # stratified train sample (--n 1500 --seed 7)');
p('node scripts/eval-phases.mjs --ort <onnxruntime-node entry> --workers 20 --operational          # operational set');
p('node scripts/lib/phase-report.mjs > training/results/phase-analysis-train.md');
p('```');
p('');
p('`--data-root` points at the training directory (the datasets are not tracked in git; the default falls back to the main checkout). Each worker holds one engine and one ONNX session with `intraOpNumThreads=1`.');
p('');
process.stdout.write(`${out.join('\n')}\n`);
