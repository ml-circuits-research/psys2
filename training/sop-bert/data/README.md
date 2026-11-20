# SOP-BERT data folders: index

The reader is fine-tuned **only** from [`official-dataset/`](../../../official-dataset/README.md), which `official-dataset/build.py` builds from the source corpora below. The folders here are kept as provenance (they have their own build scripts, executed checks or authoring records); they are not read by training directly.

| Folder | What it is | Feeds official-dataset? | Why |
| --- | --- | --- | --- |
| `ui-natural-v1/` | 1,474 C1 commands for the five editors, 1,175 recipes executed through `invokeNativeControl`; synonyms, elliptical forms, the finite omission matrix | **yes** (source `ui-natural-v1`, highest priority) | executed, current label format |
| `ui-human-v1/` | 4,284 human paraphrases (equivalent / complex / simplified) of ui-natural seeds | **yes** (`ui-human-v1`) | human phrasing of executed recipes |
| `ui-coverage-v2/` | 3,180 requests covering every one of 241 tab cases with at least 20 rows (coordinator corpus, `build.py`) | **yes** (`ui-coverage-v2`) | breadth across all operations |
| `ui-relations-v1/` | 890 relative-position placement requests (`generate.py`) | **yes** (`ui-relations-v1`) | the only relation/anchor class at scale |
| `ui-comparatives-v1/` | 786 comparative changes ("make it a bit smaller") with the delta/step contract (`generate.py`) | **yes** (`ui-comparatives-v1`) | the comparative class barely existed and was labelled inconsistently |
| `demo-tool-profile/` | `active.jsonl.gz`: the corpus of the deployed reader (Haiku v1/v2 rewritten against actual tools, plus demo supplements), with its inventory | **yes** (`demo-tool-profile`) | broad coverage of calendar, documents, charts, compounds and chatter; the inventory is the base of the official inventory |
| `haiku-v1/`, `haiku-v2/` | original Haiku-authored batches and their validators | indirectly | every row reaches the dataset through `demo-tool-profile/active.jsonl.gz`, which rewrote them against the actual tools; the raw batches are superseded |
| `ui-natural-v1/v2/` | the per-world V2 row shape of ui-natural | no | same rows as `ui-natural-v1/authored.jsonl` |
| `../../../main-synthetic-dataset/` | owner synthetic set: seeds, variant files, assembled `examples.jsonl` | **yes**, converted (`main-synthetic`) | texts are used where their labels can be made correct; per-file accounting in `official-dataset/MANIFEST.json` |

Superseded preparation outputs (`../.session-control/overnight-ui-natural-union`, `ui-natural-span-corrected-union`, cutter unions) live outside the repository and are not inputs any more. `prepare-ui-natural-union.py` and `prepare-ui-cutter-union.py` remain as history; `prepare-official.py` replaces them for training.
