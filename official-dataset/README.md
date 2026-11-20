# Official SOP-BERT reader dataset

This folder is the **only** input of SOP-BERT reader fine-tuning. One script, `build.py`, produces every file in it from the source corpora listed in `MANIFEST.json`, deterministically. The fine-tuning commands read only these files (see "Training from this folder").

| File | Contents |
| --- | --- |
| `train.jsonl.gz` | training messages (gzip; one JSON object per line) |
| `dev.jsonl` | development messages: model selection (the trainer's "calibration" split) |
| `test.jsonl` | held-out messages: reporting only, never selection |
| `inventory.json` | the reader's label inventory: areas, target types, keys, heads and class banks |
| `MANIFEST.json` | every source corpus and generator file: path, git commit, SHA-256, rows in / kept / dropped with reasons; output hashes; policy |
| `VALIDATION.md` | the checks, issue counts of each source as delivered, what was fixed or dropped, and the final zero-error check |
| `STATS.md` | counts per tab, source, act, target type, operation, relation, key and style; text length |
| `audit-sample.md` | 100 stratified rows rendered as text → labels for human review |

Regenerate everything with `python3 official-dataset/build.py` (about 10 seconds; needs the sibling `sop-knowledge-worlds` checkout for two vocabulary files). Outputs are byte-identical for identical sources.

## One row

Each line is one message a person types in one tab, with the labels of every request in it.

| Field | Meaning |
| --- | --- |
| `id` | unique id: `<source>:<source row id>` |
| `split` | `train`, `dev` or `test` |
| `world` | the tab/area: `drawing`, `diagram`, `document`, `calendar`, `avatar` (the label keys are `world.type.key`) |
| `text` | the whole message, as typed |
| `context` | what the reader sees besides the text: `existing` (objects on the page, `{kind, name}`, ranked as at runtime) and `previous` (the previous turn or null) |
| `requests` | the labelled requests, in source order (empty for a message with no request) |
| `family` | paraphrase-family id. All paraphrases, omissions and compounds of one seed, and all rows sharing a request text, have the same family; a family is never split across train/dev/test |
| `source`, `source_id` | the source corpus and its row id (provenance) |
| `operation` | the editor operation the seed was written for (provenance, not a model input) |
| `style` | how the text was produced (`natural-direct`, `human-equivalent`, `human-tangle`, `relation-natural`, `haiku-v2`, `mechanical-trigger`, …) |
| `phase` | `direct` or `world-inference` (old corpus) |
| `rewrite` | present only when the build changed the text (main-synthetic avatar slot ids replaced by the w.face word; see MANIFEST) |

A request:

| Field | Meaning |
| --- | --- |
| `span` | the exact substring of `text` this request covers (the request cutter learns these) |
| `trigger` | the exact words that carry the act ("add", "make", "how many"); absent when the text has no such words (fragments like "a sun hat for me") |
| `act` | `make`, `change`, `place`, `remove`, `select`, `group`, `ungroup`, `connect`, `arrange`, `answer`, `undo`, `redo`, … |
| `mood` | `do`, `ask` (a question), `check` (a yes/no question), `propose` |
| `target` | `type` (target family of the area: `drawn`, `node`, `meeting`, `part`, `face`, …), `mode` (`new` / `existing` / `bound`), `determiner`, `fill` (how an existing target is given: `written` name, `context`, `description`, `all`, `journal_step`), and source phrases `kind_span`/`kind`, `name_span`, `description_span`, `count_span`, `ordinal` |
| `question` | for `act=answer`: `ask` (`count`, `exists`, `list`, `what`, `describe`, …) and optionally `asked_key` |
| `constraints` | one per condition: `key` (`type.key` of the area, e.g. `drawn.colour`, `meeting.time`), `value_span` (exact source phrase), `value` (the class-bank value for class keys, the source phrase for copy keys, digits for numbers; absent when the phrase has no declared normalisation, then `raw_value` keeps the author's value), `operator` (`eq`, `degree`, `relation`, `delta`, …), `phase` (`selector` picks the target, `result` is the desired outcome), `polarity`, `character` (`requirement`, `preference`), optional `unit`, `measure`, `step`, `scope` |

Relative positions are two mentions: the relation itself (`drawn.relation`, value from the bank: `near`, `left_of`, `right_of`, `above`, `below`, `in`, `on`, …) and its anchor (`drawn.anchor`, or `meeting.relation_anchor` in the calendar), whose `value_span` is the phrase naming the other object. Coordinates are never labelled unless written.

## Examples

**A relative placement** (ui-relations-v1, drawing). Context: Lake, Tree, House, Mountain, Road, Hill.

```text
"place a large lake left of that tree"
request "place a large lake left of that tree"  trigger "place"  act=make mood=do
  target  type=drawn mode=new determiner=indefinite kind "lake"
  drawn.size     = big       from "large"      degree,   result
  drawn.relation = left_of   from "left of"    relation, result
  drawn.anchor   = that tree from "that tree"  relation, selector (the anchor object)
```

**A question inside a long message** (main-synthetic hard question, drawing).

```text
"You'll laugh, but I showed the canvas to my cat …, and realized I still don't know what's on it — so, how many dogs are we talking about in there?"
request = the whole text  trigger "how many"  act=answer mood=ask question {ask: count}
  target  type=drawn mode=existing fill=all kind "dogs"
```

**Two requests in one message** (demo-tool-profile, drawing). The words outside the request spans ("Let us", "That would help.") belong to no request.

```text
"Let us sketch a flower called bird; then put bird below tree. That would help."
request 1 "sketch a flower called bird"  trigger "sketch"  act=make
  target type=drawn mode=new kind "flower";  drawn.name = bird from "bird"
request 2 "put bird below tree"  trigger "put"  act=place
  target type=drawn mode=existing fill=written name "bird"
  drawn.relation = below from "below";  drawn.anchor = tree from "tree"
```

## How labels become SOP request wires

The reader predicts these fields per request (BIO spans for keys and the trigger, classes for banks), and `src/dialog/raw-structural-bridge.mjs` turns them into the published request graph:

```text
@source std.request.source text="put bird below tree"
@r      std.request act=place mood=do source=$source          # act anchored on the trigger span
@t      std.request.target request=$r mode=existing name="bird" kind=<canonical kind from bindings>
@c      std.request.constraint request=$r target=$t concept=<bound property> operator=… value=… polarity=positive character=requirement
```

Selector constraints become the target's `selector`; result constraints the request root; `question` a query projection. The bridge binds kinds and properties through `bindings.json`; keys without a published binding, relations/anchors and population targets (`fill=all`) are reported as unresolved by the current bridge. The dataset labels them anyway, because they are the text's meaning; the bridge projection is separate work.

## Split policy

- Paraphrase families never cross splits (checked: `leakedFamilies: 0` in MANIFEST). Families come from the source cohorts (`recipeFamily`, seed ids), compound constituents, and identical request texts across sources (union-find).
- Families are assigned per stratum (tab × operation family × act) in a fixed hash order to the split furthest below its share (80/10/10 by rows), so every tab and act appears in each split.
- Identical texts (case and space insensitive) are kept once; when sources disagree, the higher-priority source wins (priority order in MANIFEST: executed UI corpora first, main-synthetic last).

## Balancing

The old corpus and all UI corpora are kept whole (after validation). The main synthetic set is capped: per seed family 40 human-written / 6 mechanical rows (8 / 3 for edits of named objects), and 2,500 rows per operation; human-written variants and hard questions are taken first. In training, UI-corpus rows are repeated three times (`prepare-official.py --ui-weight`).

## What was fixed and what was dropped

See VALIDATION.md and MANIFEST.json for counts. In short:

- **main-synthetic** (owner set): spans converted from offsets to strings; the trigger, which was the canonical act in 56% of requests, replaced by the verb actually in the text (k.actions verbs and reviewed corpus triggers) or removed; questions converted to `act=answer` with `question`; creation rows converted to the target-kind form; avatar presets mapped to `face.preset`; avatar part additions kept only where the variant belongs to the slot (attested in executed recipes) and the slot id in the text ("hair_back") replaced by the w.face word ("back hair"). Dropped: avatar part edits whose selector is a document label ("Deep Dive", "Plan": 8,120 constraints), calendar rows whose values are placeholders ("start 3, duration 1"), colours/kinds that are placeholder names, numbers that disagree with their text ("x=260" for "400, 30"), keyword-list texts about existing objects, and duplicates. Generator files (`seeds-*`, `variants/*`, `mech-variants.jsonl`) are accounted for per file in `MANIFEST.json.mainSyntheticFiles`; variant texts missing from `examples.jsonl` are assembled from their seed when an assembled sibling gives the request frame.
- **ui-natural-v1 / ui-human-v1**: values outside a class bank (`face.id=avatar`, `centred`, `justified`, `briefly`) and vague values keep their phrase as a mention without a class label; rows whose measure/anchor phrase is not in the request are dropped.
- **ui-relations-v1 and relation rows of other sources**: the anchor phrase becomes the anchor mention; `left`/`right` use the bank's `left_of`/`right_of`.
- **demo-tool-profile**: exact duplicate texts removed; identical texts with different labels resolved by keeping the first.

Warnings in VALIDATION.md (`selector-not-in-context`, ambiguous spans) are not errors: compact runtime context lists kinds and names, not ids such as "o1" or "b2", and the preparer masks an ambiguous span rather than guessing.

## Training from this folder

```sh
.venv/bin/python training/sop-bert/prepare-official.py --out ../.session-control/official-prepared --cutter-out ../.session-control/official-cutter
.venv/bin/python training/sop-bert/train-key-reader.py --data ../.session-control/official-prepared --encoder <distilbert-base-uncased> --out <run> --input-padding dynamic
.venv/bin/python training/sop-bert/train-request-cutter.py train --data ../.session-control/official-cutter --source-root ../.session-control/official-cutter/raw --exclusions ../.session-control/official-cutter/exclusions.json --out <cutter run> --encoder <…>
.venv/bin/python training/sop-bert/evaluate-demo-reader.py --model <run> --input ../.session-control/official-prepared/test.jsonl --out <report.jsonl> [--cutter-model <cutter run>]
```

`prepare-official.py` reads only `official-dataset/`; its outputs are derived and not committed.
