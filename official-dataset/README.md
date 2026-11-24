# Official SOP-BERT reader dataset

The reader's training data lives in the sibling repository
[`webmeet-dataset`](../../webmeet-dataset/README.md): one two-column CSV per tab and source
(`<tab>/<source>[.N].csv`, columns `text` and `sop`, the circuit in the `w.request` schema). Add or fix data there and
run its checker (`node tools/check.mjs`). This folder holds no data rows.

| File | Contents |
| --- | --- |
| `sop_dataset.py` | reads webmeet-dataset and writes the trainer's row files (below); `check <dir>` compares CSVs with the current rows |
| `inventory.json` | the reader's label inventory: areas, target types, keys, heads and class banks (read by the preparers, the exporters and tests). The keys of the drawing, diagram, document and calendar tabs follow the SOP facts of `sop-knowledge-worlds` `w.request/shards/keys.sop`: change a key there, then run `python3 official-dataset/keys_from_sop.py` (`--check` reports a difference) |
| `keys_from_sop.py` | brings the inventory's keys in line with the w.request.key facts |
| `train.jsonl.gz`, `dev.jsonl`, `test.jsonl` | **generated, not in git**: the rows in the trainer's format |

## Generating the rows

```sh
python3 official-dataset/sop_dataset.py load    # webmeet-dataset (sibling checkout, or $WEBMEET_DATASET) -> train/dev/test
```

Each row gets the id `<source>:<hash of text and circuit>`, where `source` is the CSV file stem (`data-drop`,
`ui-diagram`, `main-synthetic`, `human-adapted-drawing`, ...), a split drawn from the id (94% train, 4% dev, 2% test),
and some single-turn rows also appear with an unrelated previous message (labels unchanged). Rerun `load` whenever
webmeet-dataset changes; scripts that read these files print this command when they are missing.

## Training

```sh
.venv/bin/python training/sop-bert/prepare-official.py --out <prepared> --cutter-out <cutter-data>
.venv/bin/python training/sop-bert/train-key-reader.py --data <prepared> --encoder <distilbert-base-uncased> --out <run> --input-padding dynamic
.venv/bin/python training/sop-bert/train-request-cutter.py train --data <cutter-data> --source-root <cutter-data>/raw --exclusions <cutter-data>/exclusions.json --out <cutter run> --encoder <...>
.venv/bin/python training/sop-bert/evaluate-demo-reader.py --model <run> --input <prepared>/test.jsonl --out <report.jsonl> [--cutter-model <cutter run>]
```

`prepare-official.py` weights sources by name at training time (no row is dropped); its outputs are derived and not
committed. The dev split is for model selection, the test split for reporting only.

An answer lookup preserves its source and evidence in a request’s `lookup` list. A same-message
lookup has `key: "answer"`, `from: "request"`, `words`, and a zero-based `antecedent` index into
the row’s `requests`. An answer from the previous message has `from: "previous"` and `words`.
The index is a dataset reference that is converted back to a request wire ID on export.
