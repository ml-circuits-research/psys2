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

## One target per request

A request in `w.request` may carry several `w.request.target` wires, but a trainer row holds one target
per request. `sop_dataset.parse` therefore refuses a second distinct target wire on the same request
(`target r1.t2 and target r1.t1 both belong to request $r1: this codec keeps one target per request ...`)
rather than projecting it away; a wire declared twice with the same id is one target and stays accepted.
Fifteen of the current CSVs still contain such circuits (`1,125` of `189,119` rows), so `load` stops at
the first of them and names its file, row and text. The lossless form for separable effects is one request
per target with `words_origin=hull`; collective effects over several things have no supported lossless
projection in this codec yet. These counts identify unsupported projections, not proof that every
source circuit is semantically valid. The existing 54 unrelated parse failures also remain unresolved;
a successful full dataset load or training export has not been established.

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

An intent (`w.request.intent`) is a fact of the request it belongs to, not a target or a constraint: what the result is
for (`role: "purpose"`) or where it goes (`role: "destination"`). A request row keeps them in `intents`, in wire order,
each `{ role, value, words, polarity }` where `words` is the exact evidence and `polarity` is `positive` or `negative`
(the wire's `want=no`). Render writes them back as typed wires by the request reference (`request=$rN`); a wire whose
owner is missing or is not a request of the circuit is refused with an explicit error, never attached to the nearest
request. The owner is one unquoted reference: `request="$r1"` is quoted text that only looks like a reference, and
`request=$r1 request=$r2` names two owners; both are refused, never resolved to the first token. `value` and `words`
are written text, not references and not numbers: a blank or a number is refused where it is read (not later in
render), a bare `$r1` there is refused as a reference, and a written value that looks like one (`value="$r1"`) is
quoted again on render so it reads back as the same string. Each intent states one `role`, `value`, `words` and
`want`: a second one is refused, never merged or silently dropped. Rows and circuits without intents are unchanged,
and an intent's `words` are evidence of their request for the coverage pass.
