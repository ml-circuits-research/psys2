# Supported demo reader corpus

The active corpus is `active.jsonl.gz`: natural supported commands and complete V2 labels for Drawing, Diagram including vector chart tools, Calendar, Documents and Avatar. It is a replacement authoring pass, not a report of unsupported originals. Every original Haiku source ID has an authored counterpart; genuine no-request chatter is preserved. Original sources remain unchanged. Source provenance is outside model inputs.

`author-demo-data.py` rewrites action requests deliberately using actual tool declarations and supported intent classes; it does not pretend that the original unsupported request was fulfilled. It preserves compound request multiplicity, names/values where useful, measured values, selectors, references, temporal constraints and composition as relevant. Six previously inspected bad annotations have explicit repaired replacements (`calendar-repairs.json` and `repaired-examples.json`), with 46 manually authored examples overall. The generated corpus is not a human semantic review of every original sentence.

`author-avatar-supplement.py` uses the full published `k.faces` through the same `createFacts().faces()` loader as the app. Presets/variants must have real geometry. Colour requests explicitly name present shared-tint peers; fixed-colour changes use only the active variant's declared choices. `author-drawing-supplement.py` adds concrete part-index geometry and grouping operations from the real Drawing primitives. No occupation, external notification or unavailable motion intent remains in the active examples.

Two phases are explicit:

- **direct:** concrete single-tool intents (some require a deterministic sequence such as create-and-label), exact observed identities, typed values and `expectedTools`. This phase is prepared by default for the owner's first reader-fit experiment. Genuine chatter has no requested operation.
- **world-inference:** supported but compound, relational, relative-time, query or knowledge-composition intent. These rows stay in the repaired corpus, outside the first fit experiment. They are not labeled unsupported.

`inventory.json` contains only tool-relevant domain keys plus the shared request contract. It adds the actual Calendar calendar/name/colour, room/location, meeting/calendar, chart/title, document literal content, Drawing part geometry/grouping and Avatar face/part keys. Numeric units stay in the copied BIO span; unimplemented standalone numeric-metadata heads are not trained. `target.type` is explicitly supervised. Full Avatar observed context uses an explicit 384-token configuration.

Prepare the actual consumed phase-one data:

```sh
python3 training/sop-bert/prepare-key-reader.py --out ../.session-control/demo-five-key-direct --supplement-train-ids training/eval/functional-matrix/exclude-from-training.json
```

The command defaults to this active authored corpus, inventory and an empty revised-source exclusion list. The explicit TRAIN supplement places all869 newly rewritten counterparts of historically reserved rows in TRAIN while preserving existing CAL. The cutter preparation accepts the same supplement; its strict loader validates the authored supplement hash and all original source/text/annotation checks. `--phase world-inference` prepares the second phase; `--phase all` prepares both. `--all-annotations --corpus ... --inventory ...` is explicit historical reproduction, not the active dataset. Existing deployed weights are not changed by preparation.

Author a fresh corpus into a new directory, using the current declarations:

```sh
python3 training/sop-bert/author-demo-data.py --out ../.session-control/demo-authored-five
```

The full-corpus existing V2 validator runs during authoring. `check-demo-native-tools.mjs` executes expected concrete tool plans on instantiated native contexts. This tests tool contracts; it does not claim SOP-BERT accuracy. `evaluate-demo-reader.py` measures actual predicted spans, metadata, normalized complete intent and direct native operation/parameter exactness on prepared TRAIN or CAL rows. Near-100% on TRAIN is a separate measured goal, not inferred from validation.

`review-demo-data.py` is the earlier diagnostic audit retained as an analysis tool. Its partitions are not the active training deliverable and do not feed the default preparation path.
