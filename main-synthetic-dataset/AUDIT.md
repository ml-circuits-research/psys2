# Audit of main-synthetic-dataset (2026-11-20)

Checked with a script over `examples.jsonl` (26,243 records). The integrity checks the README reports hold (no duplicate texts, no conflicting labels for one text, `value_span` slices equal `surface`). The problems below block training as is.

## Blocking

1. **`trigger` is the canonical act, not a span of the text.** In 15,011 of 26,314 requests (57%) the trigger string does not occur in the text: "rework the long straigth Intro…" carries `trigger: "change"`. The previous corpora (`ui-natural-v1`, `ui-human-v1`) label the trigger as its surface, and the reader learns it as a source span. Fix: keep the act in `act` and label `trigger` as the verbatim surface (with its span).
2. **Avatar part identities are meaningless labels.** `part.ids` values are "Deep Dive", "Plan", "Backup", "Kickoff", "North Area" (about 360 each), which are document or diagram labels; the avatar's parts are its slots (`hair_front`, `eyes`, `mouth`…). These rows teach `avatar.part.change` on objects that cannot exist, and they are 30% of the corpus (8,008 rows). Fix: draw selector values from the editor's observed objects (the slot names) in the same fixture as the seed.
3. **No context for references.** `context.existing` is empty in every record, including the 13,244 rows whose request has a selector. The reader cannot learn to tie "the Start box" or "the red house" to what is on the page. Fix: generate each seed against a fixture state and copy `observedReaderContext` into `context`, as `ui-natural-v1` does.
4. **Label shape differs from the trainer's input.** Spans are `[start, end]` arrays; the existing preparer reads surface strings (`ui-natural-v1`). Either convert on assembly or extend the preparer once, with a test.

## Coverage gaps

- **Relative positions: none.** No relation, anchor or direction key appears in any record, and no text like "add a house next to the lake" exists (183 texts contain a relational word, none as a placement request). The reader's head inventory declares `relation`, `relation_anchor`, `spatial_relation`, `direction` and `distance`, and the library compiles one relation to one anchor (`std.placement`), so this is the class the dataset should add first: subject × relation (`near`, `left`, `right`, `above`, `below`, `in`, `on`) × anchor kind from the fixture.
- **Balance.** Avatar 10,337 and drawing 11,098 rows against calendar 615; two operations (`drawing.object.make` 8,583, `avatar.part.change` 8,008) are 63% of the corpus.
- **Mechanical share 88%.** Template texts like "change the bob Plan dark brown default" read as keyword lists; weight them down or cap them per seed.
- **Not execution-verified.** `nativeTool` is null throughout; recipes were not run through the editors.

## Documentation

The README's totals (26,144; calendar 1,402) disagree with `report.json` and `matrix.md` (26,243; calendar 615). Regenerate the README from the report.

## Re-validation and use (2026-11-20, official-dataset)

`official-dataset/build.py` re-checked every row and generator file; the measured counts are in `official-dataset/VALIDATION.md` and, per file (seeds, variants, mech-variants), in `official-dataset/MANIFEST.json` (`mainSyntheticFiles`). Confirmed: the trigger is not a text span in 14,832 of 26,314 requests; 8,120 avatar part selectors are document labels; context is empty in every row; spans are offset arrays. Also found: 21,426 constraint keys outside the reader inventory (`doc.*`, `calendar.*`, `drawn.kind`, `*.operation`), 10,375 target types outside their area (`object`), 1,863 placeholder values for colour/size/kind keys, 293 numbers that disagree with their text (`x=260` for "400, 30"), 173 avatar slot ids written in the text.

Kept after conversion (about 4,900 rows, capped): questions including all non-avatar hard questions, creation requests with kind vocabulary, avatar presets, attested avatar part additions (slot id replaced by its w.face word), and human-written edits of named objects with a fixture context. Almost every variant file row is already in `examples.jsonl`; the few that are not are assembled from their seed when an assembled sibling exists.
