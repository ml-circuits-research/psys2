# Initial repaired demo dataset and concrete reader phase — 2026-11-17

This is the initial repaired corpus, before the owner simplified Calendar and changed Avatar to composition properties. It is not a coverage claim for the latest editors; the combined UI v2 corpus is being authored separately.

The initial corpus is authored for the declared **Drawing, Diagram with charts, Calendar, Documents, and Avatar** tools. Every one of the 35,914 original source identities receives a deliberately supported counterpart; genuine incidental-only chatter preserves its text and no-request labels. Unsupported requests are rewritten as new supported utterances with complete V2 annotations, not relabeled as successful unchanged originals. Raw Haiku sources remain untouched. Provenance stays outside model inputs.

## Delivered data

- 36,999 rows overall: 35,914 source counterparts, 642 Avatar examples, 186 Drawing part/group examples, 168 document toolbar examples, and 89 chart options/multi-series examples.
- 46 individually authored reviewed replacements include all six previously inspected semantic defects. The remaining authoring uses explicit native capability classes, natural phrase variants, original display names where useful, typed quantities, and complete fields. It is not a claim of human semantic review of every original sentence.
- 22,882 direct phase-one rows, including harmless chatter; 14,117 supported phase-two rows with compounds, relations, queries, relative context or composition.
- Default preparation produced **20,668 TRAIN + 2,214 CAL** rows, **123 inventory heads**, zero preparation diagnostics. All869 newly authored counterparts of historically reserved IDs are explicitly included in TRAIN; existing CAL identities/text/labels stay unchanged. The revised-source exclusion configuration is empty; historical raw fixtures remain separate. The active input budget is 384 tokens for full Avatar context.

The active inventory adds actual personal-calendar names/colours, room location, meeting calendar identity, chart title/datasets, literal document content, document range/list/table controls, Drawing part geometry/grouping, and Avatar face/part controls. Unsupported standalone measure/unit heads are absent; number and unit remain in the complete copied BIO source span. Target family is explicitly supervised. Shared request structure and reusable concepts remain; professions do not become Calendar CRUD fields.

## What was actually checked

The authoring run reused the existing V2 validator over every emitted row. Complete original source membership is preserved. All **22,882 direct expected tool plans** were then instantiated and invoked on actual native hosts: **0 setup failures, 0 tool failures**, in **100.21 seconds** (concurrent training active). The full local result is `../.session-control/demo-release-native-all-current.json`; the summary is adjacent. This is an actual native-contract run, not neural inference or proof of natural-language generalization.

The existing strict cutter loader audited the exact authored direct corpus: 19,799 TRAIN rows (19,171 positive, 628 chatter), 2,214 CAL rows (2,132 positive, 82 chatter), zero diagnostic rows. Its raw source adapter contains the revised authored text, not the old Haiku annotations. Source ids and split match the key-reader preparation.

## Train and measure intended meaning

Fresh DistilBERT is recommended: new head inventory, type supervision, numeric copy policy and complete source contexts differ from the installed epoch-7 layout. Do not silently reuse incompatible old banks. The encoder is the local pretrained snapshot already present in `.session-control/hf-cache`.

```sh
.venv/bin/python training/sop-bert/train-key-reader.py \
  --data ../.session-control/demo-release-key-inclusive \
  --encoder ../.session-control/hf-cache/models--distilbert--distilbert-base-uncased/snapshots/12040accade4e8a0f71eabdb258fecc2e7e948be \
  --out ../.session-control/demo-reader-inclusive-run --epochs 20 --batch 16
```

The key-reader fit excludes BIO heads that have no source span (for example mood/new/existing categorical choices); their categorical/presence heads remain. The actual predicted-span evaluator separately requires complete normalized intent, exact concrete native operation/arguments, and prediction consistency. Teacher-mention-conditioned metadata scores and average key accuracy do not substitute for that result.

```sh
.venv/bin/python training/sop-bert/evaluate-demo-reader.py \
  --model ../.session-control/demo-reader-inclusive-run \
  --input ../.session-control/demo-release-key-inclusive/train.jsonl \
  --out ../.session-control/demo-train-intent.rows.jsonl --device cuda
```

That first command is explicitly conditional on gold request cuts. For actual full utterances, train or evaluate the cutter on `../.session-control/demo-release-cutter-inclusive` using the existing cutter trainer, `--source-root ../.session-control/demo-release-cutter-inclusive/raw`, and `data/demo-tool-profile/revised-exclusions.json`. Pass the trained cutter directory as `--cutter-model` to the same evaluator: it then runs full text → predicted segmentation → key reader → complete normalized intent/native parameters and reports segmentation exactness separately. It never feeds expected labels into the reader.

Fresh key training completed five epochs; cutter training completed seven epochs with epoch four selected. Full actual predicted-cutter TRAIN measurement is recorded in [initial-reader-contract.md](initial-reader-contract.md): 20,649/20,668 exact intended fields/native arguments, 20,237 normalized complete meanings, and 19,975 raw-codec resolved meanings. The new weights are not deployed. The second phase remains supported intent data, not a claim that world inference or composition already executes it.
