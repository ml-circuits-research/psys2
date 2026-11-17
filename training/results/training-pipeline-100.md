# Actual training-message pipeline diagnosis — 2026-11-17

One diagnostic run requested by the owner; no product fixes during or after the run. The unfinished dice changes remain uncommitted and were not deployed. Epoch 7, installed q8 bundle `2edc5b434cd59224cd44c4a138ab7b8e0770a17934056c211d36bbfca5eeca13`, normal native context, reader, projections, admission and execution on Node CPU. This is not a browser numerical-equivalence measurement.

## Selection and time

100 actual training messages, 25 per area, selected before inference by source-id hash with round-robin over annotation version and zero/one/multiple requests. Every selected source id was found in the exact encoded training corpus used by the epoch-7 run. These messages represent 139 encoded training samples (including 36 no-request samples), with 103 annotated requests in 64 messages. The sample deliberately covers construction groups; its percentages are not a frequency-weighted estimate for the entire training corpus.

All 100 were inferred; none was dropped for failed setup. The inference/execution loop took **29.09 seconds, 0.291 seconds/message** (excluding initial model/data loading). Full stage records and training-head disagreements are in the compressed JSONL; the selection and grouped summary are adjacent files.

## Observed end-to-end result

| Area | Messages | Messages with annotated requests | Complete native setup | Changing effects |
|---|---:|---:|---:|---:|
| Drawing | 25 | 16 | 3 | 3 |
| Diagram | 25 | 16 | 1 | 0 |
| Documents | 25 | 16 | 5 | 0 |
| Calendar | 25 | 16 | 1 | 0 |

56 messages requested an action; 53 produced no state change. Four messages reached a nonempty operational graph; three changed state. All three changing replies disclosed unapplied parts, and none established the complete requested outcome. The other messages include questions and 36 annotated no-request messages; lack of mutation is appropriate for those and is not counted as an action failure.

## Grouped causes

Counts overlap: these are causal observations at different boundaries, not numbers to add together. The 96 non-executable routing outcomes are symptoms, not an extra root cause.

1. **Training context cannot be reproduced by current native capabilities.** 90/100 have incomplete object setup; the fixture reports 139 missing kind mappings and 27 native refusals. 36/100 supply a previous turn only as text, without the executed history/focus that follow-ups need. The union is 94 messages with a context limitation. These rows were still sent to the actual reader and are retained in the report. Consequently, mismatches on them cannot honestly be attributed solely to bad model training.
2. **Neural output is internally inconsistent or disagrees with supervised labels.** 48/100 have reader-output issues: presence versus span disagreement in 39, invalid BIO continuation in 13, presence versus class disagreement in 12, and metadata-presence disagreement in 9. In addition, 31/100 disagree with at least one supervised categorical head (21 target-fill, 7 act, 6 target-type occurrences; a message may contain several). Context limitations above qualify this comparison. Request count disagrees in only 1/100; this does not prove exact boundary accuracy.
3. **The semantic-to-native bridge does not implement much of the annotated contract.** 64/100 show graph/binding conversion issues: canonical property binding in 51, value representation in 50, kind binding in 39, missing request dependencies in 32 and context-reference binding in 19. Predicted ranges remain unconsumed in 50. Thus recognising an act and a noun does not yield an executable complete request. This is an integration/capability gap, not just an admission threshold.
4. **Training supervision itself is incomplete for a required runtime field.** 32/100 contain a training sample explicitly marked `v1-target-type-unknown-masked`. The runtime requires a target family that those samples did not positively supervise. Training annotations specify many expected intermediate fields, but they do not provide a complete native effect contract for every row; unknowns must remain visible.
5. **Reversible best-effort postprocessing substitutes unrelated native kinds.** The three changed examples are below. Source inspection shows `project-create-action.mjs` ranks supported lexical kinds with weighted spelling edit cost (maximum 2), and can discard unresolved requirements while composing a creation. A spelling score does not establish semantic compatibility: the published library returns cost 1.8 for both `donkey` → `rocket` and `face` → `car`. No threshold or vocabulary was changed in this diagnostic.

| Training message | Actual reply/effect | Observed problem |
|---|---|---|
| more bubbles pls | Created a balloon; could not apply count more | Bubble/count/context intent is not fulfilled. |
| make me a doctor face | Created a car; could not apply style doctor; took face as car | Wrong semantic family after projection. |
| draw a donkey in the field and call it Eeyore | Created a rocket; could not apply name Eeyore; took donkey as rocket | Wrong kind and unapplied name. |

## Interpretation

The current system is not functioning acceptably on these training examples. The evidence establishes several failures after model inference, alongside neural-output problems and incomplete training supervision. It does **not** justify claiming either that the model alone is responsible or that the model is sound and only the executor is broken. The concrete postprocessing substitutions already explain some bad effects without retraining. No corrective strategy has been applied; this report is the requested basis for the owner's next decision.

## Reproduce this one run

```sh
node scripts/diagnose-training-pipeline.mjs \
  ../.session-control/active-reader-node-spec.json \
  ../.session-control/structural-gold-review23-full/train.jsonl \
  ../.session-control/target-type-review23-data-v3-full/train.jsonl.gz \
  ../.session-control/training-pipeline-100
```

Choose a fresh output prefix when reproducing: the row writer refuses to overwrite an existing run. No broader test suite or corpus replay was launched for this diagnosis.
