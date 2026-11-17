# Initial reader contract: actual complete TRAIN measurement

The repaired direct-command corpus now reaches **99.908% complete intended fields/native arguments**, **97.915% normalized C1 complete meaning**, and **96.647% fully resolved raw-codec meaning** on all 20,668 TRAIN examples. This is full utterance → predicted cutter → predicted BIO/class fields → typed native arguments, including genuine no-request inputs. Gold request cuts and gold mention features do not enter prediction.

This measurement covers the initial native contract, including its personal calendars, rooms and Avatar preset/part operations. The later single-calendar UI and Avatar composition contract require the pending combined v2 corpus/training. It does not measure that current UI, the separate world-inference corpus, generalization, calibrated admission or browser effects.

## Counts and attribution

| Full TRAIN | Epoch 1, original decoder | Epoch 5, decoder 3 |
| --- | ---: | ---: |
| Population | 20,668 | 20,668 |
| Predicted segmentation exact | 20,667 | 20,667 |
| Complete labeled intent exact | 19,148 | 20,649 |
| Native operation/arguments exact | 19,365 | 20,649 |
| Normalized C1 complete meaning | 13,259 | 20,237 |
| Measured evaluation seconds | 662.15 | 252.06 |

Epoch 1 versus epoch 5 includes **both training and decoder changes**. The decoder contribution was separately measured with unchanged epoch-5 weights and the same 100 source IDs: intent/native arguments improved from 98/100 to 100/100, normalized completeness from 96/100 to 100/100. Unique exact membership in declared canonical string banks corrected two values already extracted by BIO; explicit positive-safe-integer copy resolved two count flags. Classifier alternatives and confidence remain in proof diagnostics. This is source proof from declarations, not additional neural learning.

The final full population contains 19 genuine reading failures. Their 19 native-argument errors coincide: **zero rows have correct reader meaning but wrong derived native arguments**. Another **412 rows contain correct meaning and native arguments but fail consistency checks**. There are 428 rows with reader-consistency flags and one cutter-issue row, giving 429 pipeline inconsistency rows; these overlap reading errors. The leading flags concern presence/BIO disagreement, especially constituent geometry and Avatar controls.

The existing C1 metric filters legacy `normalization-requires-declared-proof` markers while comparing normalized typed meanings. Raw packets retain 268 such flags, all from Diagram/chart aliases that do not exactly equal a canonical bank literal. Of those, 262 otherwise pass the normalized metric. Thus **19,975/20,668 (96.647%)** have correct meaning/arguments and no remaining raw decoder/cutter issue: 19 reading errors + 412 consistency-only blocks + 262 additional normalization-proof blocks explain the raw gap. Exact literal proof does not resolve aliases. Neither metric implies execution admission.

| Area | Rows | Intent/native arguments exact | Normalized C1 complete | Raw codec resolved |
| --- | ---: | ---: | ---: | ---: |
| Drawing | 5,822 | 5,819 | 5,665 | 5,665 |
| Diagram, including charts | 5,180 | 5,173 | 5,098 | 4,836 |
| Calendar, initial contract | 5,064 | 5,058 | 5,058 | 5,058 |
| Documents | 4,019 | 4,019 | 3,980 | 3,980 |
| Avatar, initial contract | 583 | 580 | 436 | 436 |

The 19 reading failures comprise six Calendar examples, seven Diagram/chart examples, three Drawing examples and three Avatar examples. They include six constituent-removal act errors, six chart-switch field collisions, one chart-label extraction error, and six Calendar field/act/segmentation failures. For example, “remove the cheeks” has the correct part identity but the wrong act; “turn stacked on for Sales” confuses compatible chart option heads. All 19 source IDs, source clauses and differing fields are included in the compact JSON summary. No sentence-specific decoder rule was added for them.

## Seed-1 sample of 1,000 sources

The 1,000 IDs were selected from sorted TRAIN source identities using `random.Random(1).sample(..., 1000)` before inspecting any outcomes. Results are derived from the full evaluation, not another model run: **1,000/1,000 intent/native-argument exact**, **978/1,000 normalized C1 complete**, **966/1,000 raw codec resolved**. The normalized 97.8% is close to the full population's 97.915%, while raw resolution is 96.6% versus 96.647%; the perfect 100-row probe did not establish perfect full-population consistency.

| Area | Sample rows | Intent/native arguments exact | Normalized C1 complete | Raw codec resolved |
| --- | ---: | ---: | ---: | ---: |
| Drawing | 298 | 298 | 290 | 290 |
| Diagram, including charts | 245 | 245 | 241 | 229 |
| Calendar, initial contract | 243 | 243 | 243 | 243 |
| Documents | 188 | 188 | 188 | 188 |
| Avatar, initial contract | 26 | 26 | 16 | 16 |

Small area samples can vary substantially; the full table exposes the remaining rare-control consistency gap.

## Frozen inputs and reproduction

Compact committed evidence: `training/results/initial-reader-contract-summary.json`. Full local artifacts are `.session-control/demo-full-train-epoch1.summary.json`, `demo-full-train-epoch5-decoder3.summary.json`, `demo-full-train-epoch5-decoder3-analysis.json`, and `demo-full-train-epoch5-decoder3-sample1000-ids.json`. The initial epoch-1 report is preserved.

- TRAIN input SHA: `ac8ab06c8ef1b8f80c26aed697da9c8ecc9488430d7554f642b00d9f11b49f48`.
- Epoch-1 key checkpoint SHA: `a13ece7622a8c523db4eabd5bfd7158e337bfaab8fe84d33b47ef1cc70d663fb`.
- Retained epoch-5 key checkpoint SHA: `bc5217cb48bec1b9c36c4b2adf2ff4349d6cd74da5f0094a8b724dd03359ece1`.
- Key config SHA: `dbd6607e63fc060eb3bcfb2dffe97e614ed60fc8e5f0bf19c0a7e431c7bd822f`; 123 keys, maximum length 384, TRAIN 20,668 / CAL 2,214.
- Cutter selected epoch 4, SHA: `e55840752341e00ce77d815009fb6e5121f425895673b0646eb68f263ece3dae`.
- Decoder Python source SHA: `fd79c018ab4d2cb4d64c9d47adbb5124c17f069662c93452720cc09441dc97ee`.

Actual fresh key-training command, run from `psys2` with a fresh output directory (the original run intentionally stopped after completed epoch 5 when UI contracts changed):

```sh
.venv/bin/python -u training/sop-bert/train-key-reader.py \
  --data ../.session-control/demo-release-key-inclusive \
  --encoder ../.session-control/hf-cache/models--distilbert--distilbert-base-uncased/snapshots/12040accade4e8a0f71eabdb258fecc2e7e948be \
  --out ../.session-control/demo-reader-inclusive-run \
  --epochs 20 --batch 16 --cpu-threads 2
```

Actual full measurement command (use a fresh output filename to reproduce):

```sh
.venv/bin/python -u training/sop-bert/evaluate-demo-reader.py \
  --model ../.session-control/demo-reader-inclusive-run \
  --input ../.session-control/demo-release-key-inclusive/train.jsonl \
  --cutter-model ../.session-control/demo-cutter-inclusive-run \
  --out ../.session-control/demo-full-train-epoch5-decoder3.jsonl \
  --device cuda --batch-size 16
```

The evaluator pins checkpoint bytes/hash/epoch before prediction and rejoins full utterances from the authored corpus using the frozen preparer manifest and source hash. Training used the grouped objective validated against the previous loss and every parameter gradient; its recorded trainer SHA is in the compact summary. No v2 data regeneration or new model export/deployment is claimed here.
