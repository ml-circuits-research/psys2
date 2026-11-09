# collected_1: requests collected from the demo (un-annotated)

Made by `training/sketch/collect_to_bench.py` from `eecc4dd6-sop-requests-2026-11-03-1303.jsonl` (format `training/sketch/COLLECT_FORMAT.md`).
26 messages, ids col-0001 .. col-0026.

Files
- `texts/texts_01.jsonl`: id, domain, names, text. The texts as the user sent them (in English; for a message that came through voice or
  translation, the English text that was sent). Saved before any annotation: the annotated texts must stay identical to these.
- `batch_01.jsonl`: the same rows with `wires: []`. Write the gold here, as in `../short3/README.md` (span, trigger, type, args; names as
  in `names`, `$new`, `mention(...)`; `pending` with an intent where the SOP Lang form does not exist).
- `context/context_01.jsonl`: per id, the rest of the collected entry: time, source (via, the original words and their language, how
  they were translated), the model versions (format 2: the readings are recomputed from text, names and models; format 1 entries also
  have every reader's reading), what VSS-BERT executed or held with its confidence, and what the user did next (Do it anyway, Edit,
  superseded, undo right after). **For a blind annotation do not open it**
  before the gold is written; afterwards it is the place to look for the readings that were wrong (a held request done anyway, an
  executed one undone right after).

Counts

- format sop-collect/2: 26
- kept: 26
- original in ro-RO: 22
- via chip: 1
- via typed: 3
- via voice: 22
- messages where VSS-BERT held at least one request: 0

`names` is the drawing of the VSS-BERT tab before the message (the chat speaks for that tab).

## Annotation (2026-11-03): the first real-user test set — keep it out of training

**This is test data from a real user (the owner's first session), not training data.** `training/sketch/synth/gen_rules_cover.py test_texts`
lists `llm_bench/collected_*` (batches and saved texts), so every builder that removes test overlaps (build_opus_r2.py, the synthetic
generators) removes these texts from training folders.

Two variants of the same 26 turns, as separate ids:

| file | ids | text | what it measures |
|---|---|---|---|
| `texts/texts_01.jsonl`, `batch_01.jsonl` | `col-0001..0026` | the English as it was sent (speech recognition + on-device translation) | the whole pipeline after translation |
| `texts/texts_02.jsonl`, `batch_02.jsonl` | `colc-0001..0026` (`as_sent` = the `col-` id) | corrected English: what the owner said, as a good recognizer and translator would have given it (14 texts differ; 12 are identical because nothing went wrong before the reader) | the readers apart from speech and translation errors |

`texts_02.jsonl` was written and saved before `batch_02.jsonl` was annotated; the texts of both batches are identical to their saved texts
(checked by script).

Gold: what the owner MEANT (inferred from the Romanian original, the next turns and the drawing; `context/context_01.jsonl` and
`training/sketch/collected/SESSION_1_ANALYSIS.md`), written on the text of the row with the short3 / LABEL_CONVENTIONS.md conventions and
the newest forms (legend_ext/LEGEND_EXT.md free text, ops/HIGH_LEVEL_OPS.md improve / arrange). 22 requested actions per variant.

Row fields beyond fresh2's:
- `meta` on 7 rows: `chip` (col-0006, the answer to a question), `complaint` (col-0013 no implied command; col-0026 "you drew a circle
  needed a text element" has the implied command as its wire), `ambiguous` (col-0015, 0016 "unite elegantly": connect or tidy? a reader
  should ask), `fragment` (col-0018 "the settlement" = "the layout", col-0019 "Layout"). A row with `meta` and no wire scores every reading
  of it as an extra.
- `note`: why the gold is what it is.
- `proposed` on 8 wires: the wire uses a form the legend or engine does not have yet (SESSION_1_ANALYSIS.md, fixes 2 and 5):
  `mention(layer=background,…)` (the panels; col-0012, 0014), `mention(label=order flow)` (a text item by its words; col-0021..0024),
  `layout=triangle` (col-0011), and the "cover the whole space" part of col-0009/0012 (written as a plain resize). These wires are kept in
  the scoring on purpose: a reading that executes `delete mention(quantifier=all,shape=rectangle)` for "Delete background boxes" must count
  as wrong (it deleted Process). No reader can get them right today; at most 14 of 22 requests are reachable.

Measurement (shipped readers, 2026-11-03): SESSION_1_ANALYSIS.md, section "Measurement on collected_1".
