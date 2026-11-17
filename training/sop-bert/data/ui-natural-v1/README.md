# Natural UI requests, version 1

A separate C1-authored corpus for the current Drawing, Diagram (including editable chart groups), Calendar, Documents and Avatar editors. Old datasets and deployed readers are unchanged. No model training or inference runs here.

The generated corpus has **1474 messages**: 1450 individual requests, six compound messages and 18 requests with explicit world-informed completion requirements. **1175 recipes were actually executed** through `invokeNativeControl`, including the six compounds executed sequentially in one fixture. This validates the declared native calls and their effects; it does not measure whether the reader understands the authored language or prove the desired completion reasoning.

| Editor | Messages | Declared operations exercised |
| --- | ---: | ---: |
| Drawing | 472 | 21 |
| Diagram | 401 | 27 |
| Documents | 200 | 25 |
| Calendar | 59 | 7 |
| Avatar | 342 | 19 |

`coverage.json` inventories all 124 native declarations, including parameter types, enum choices, required services and per-operation coverage. The 99 exercised operations cover current editor controls. The remaining 23 advanced/legacy declarations include standalone chart operations and calendar/person/room management; their authoring inspiration is expressed using editable Diagram groups and single-calendar events instead. `document.compose` and `document.rewrite` require knowledge-composer/knowledge-rewriter services. Their examples use supported literal paragraph creation/replacement rather than claiming service execution.

The Avatar inventory comes from the **full published knowledge catalog**, not the fallback face: 14 appearances, 16 part slots and 181 variants with actual geometry. Every variant has an executed recipe; duplicate language is kept once. The exact catalog pin is in `coverage.json`. Drawing kinds, Diagram shapes/layouts and numeric bar/line/pie/doughnut groups, object/group/part selection, properties, arrows, document chapters/subchapters, marks/lists/tables, events, history and ID visibility are represented. Coverage is operation/choice coverage, not every possible parameter combination.

## Finite synonym and omission coverage

The original 592 message IDs/texts and the first 390 actual UI recipe IDs/texts/arguments remain first. Regeneration genuinely reruns the fixtures, so expanded trace provenance refers to the newly measured instances; it is not a fabricated reuse of old instance identifiers.

The appended set contains **198 reviewed synonym messages** (two per operation), **99 elliptical messages** (one per operation), **559 omission messages** and **26 complete counterparts**. The two other omission sentences already occur in the original corpus and are not duplicated; their native executions are retained. Fragments have no invented action trigger. Required action cores and explicit references remain, while omitted optional values are not taught as extracted evidence.

`omission-authoring.mjs` declares 26 finite profiles across 25 operations. For each profile the generator executes **every subset** of its material optional-detail units, including the full and minimal requests. An edit retains at least one effect. This yields 587 executed optional-detail cases. Coordinates, dimensions, size, colour, labels, styles, layout, counts, event details, document metadata/text and Avatar appearance/features are varied where the current editor supports them. Diagram endpoint pairs and document heading kind/level are coupled to avoid incoherent partial structures. Required bounds, explicit chart values, text ranges and event time/duration remain in precise examples; the separate world-informed cases express missing or relative values without manufacturing an executable realization.

This is exhaustive over the documented finite profiles, not all possible English sentences or parameter combinations. Technical locator fields, empty secondary selection arrays, the constant face ID, legacy aliases, compose-only metadata and advanced calendar resources are explicitly excluded from the omission matrix. Operations without material optional UI units still receive both synonyms and an elliptical form. `coverage.json.variantCoverage` gives each operation's message counts, executed finite cases, omitted parameters and applicability.

`lexical-evidence.mjs` is C1 annotation vocabulary only. Explicit forms such as centre/centred, vertically, checklist, smiling and upward retain their actual source phrases and separate lexical normalization; nothing from this file enters runtime parsing. Word boundaries and unique surrounding argument anchors prevent substring and repeated-literal label masks.

`cohort.recipeFamily` groups equivalent concrete recipes and their paraphrases; all subsets of an omission profile share one family. Compounds retain their source recipe families. This metadata is also in `authored.jsonl`; join by `source_id` before splitting because the existing preparer does not retain arbitrary cohort fields. Do not split sibling paraphrases or ablations independently when reporting generalization.

## Meaning and execution are separate

Each `examples.jsonl` record has three distinct layers:

- `requests` and `extraction` retain authored intent and actual source spans. Spans count Unicode scalar values. Literal values and reference descriptions are separate from resolved object IDs.
- `completion` records lexical/unit/reference normalization and requirements for unspecified values. It never claims an omitted coordinate, RGB value or duration was read from the sentence. Desired world-informed requirements explicitly have `verifiedByThisDataset:false`.
- `nativeTool` contains the actual executed UI-equivalent arguments and actual emitted SOP Lang, linked to `native-checks.json`. A concrete UI realization can include context/default choices beyond the text. For the 18 world-informed cases this field is **null**, with constraints and completion requirements retained instead of inventing an executed result.

Examples:

| Text | Extraction | Separate normalization/completion |
| --- | --- | --- |
| `add a house` / `create a house` | New house | Position, size and colour remain unspecified; desired placement avoids overlap. |
| `draw a man` | New drawn catalog object, kind `man` | Actual native tool is `drawing.catalog.make`; no invented ontology binding. |
| `change the avatar to a man` | Existing avatar, appearance `man` | Resolve the face; actual tool is `avatar.face.compose`. |
| `show the object IDs for 4 seconds` | Amount 4, unit second | Native duration 4000 milliseconds. This is a command, not a question. |
| `pick the first part of o1` | Parent reference `o1`, ordinal `first` | Zero-based part index 0. |
| `move Review to 2026-11-18 at 10:00 UTC` | Title reference, date, clock time, timezone | Resolve event ID and normalize to the native epoch. |
| `draw a small house in the top left` | Kind, relative size and region | World-informed size and non-overlapping placement; no coordinates invented. |
| `move the house to 260,180, then make the house blue` | Two ordered requests | Actual native calls executed in sequence. |

Current native defaults can still overlap newly created objects at the canvas centre. Those defaults are not the desired learned completion policy and are not labelled as extracted coordinates. Drawing selection bounds use top-left coordinates; examples do not mislabel them as centres.

Model `context` is generated by the same `observedReaderContext(...,{compact:true,text})` used at runtime. Full observations remain in `observations.json`, referenced by `observationRef`; this is a ranked model input, not deletion of world facts. Native checks retain actual fixture setup, including real history used for undo/redo. Broad selection/relative/informal language remains distinct from an arbitrary precise realization.

## Exact UI source pairs

`ui-actions.jsonl` is separate from the 1474 authored messages. It contains **1175 actual UI recipes / 1181 ordered calls**: 1169 individual calls and six two-call compounds. Every call preserves the exact executed `intentRecord.text`, emitted SOP Lang, native arguments, actual `sourceRanges` (including each rendered span and origin), verification and full-observation reference. These are precise UI-equivalent pairs for every executed capability, not another natural paraphrase or a claim that V2 annotations were derived for the UI text. Calls with nested arguments retain the actual expanded SOP when the compact format cannot represent them. Compound call observations reflect the actual sequential states.

## Files and reproducible checks

From the PSys2 repository root:

```sh
node training/sop-bert/data/ui-natural-v1/build.mjs
python3 -I training/sop-bert/data/ui-natural-v1/validate.py
node --test tests/ui-natural-data-declared-host.test.mjs
```

The build reads current native declarations and the pinned sibling knowledge checkout, then executes every concrete recipe. It fails on a rejected native operation. It writes only this directory. `authoring.mjs` contains the original reviewed language/recipes; `variant-authoring.mjs` adds operation-specific synonyms/fragments, `omission-authoring.mjs` defines the finite omission matrix, and `completion-cases.mjs` contains separate relative/vague and compound cases. Generated files must be regenerated from these sources.

`validate.py` reuses the existing Haiku V2 validator with this corpus's inventory, then checks exact extraction offsets, duplicate rows, native-check links and the separation of vague intent from native execution. Validation additionally runs the actual existing `prepare_authored(..., phase="all", exclude_ids=None)` label loader in a temporary directory and rejects ambiguous or overlapping mention masks. V2 value spans can use a unique surrounding argument phrase while the extraction retains its narrower literal evidence. Reference matching uses word boundaries, so `chapter` is not selected inside `subchapter`, or `neck` inside `necklace`.

The scoped test also decodes every natural-message and exact-UI SOP pair back to its exact native arguments, checks every actual UI source range, verifies runtime context parity, and guards units, ordinals and critical aliases.

`v2/<world>/requests.jsonl` is the existing V2 row shape. `authored.jsonl` additionally supplies `source_id`, `source_path`, `phase` and `expectedTools` for the existing `prepare-key-reader.py --authored-corpus` loader. `inventory.json` extends the existing vocabulary with actual native parameters and explicitly authored completion concepts. These are training annotations, **not newly implemented canonical ontology bindings**; native parameter names must not be mistaken for bindings already understood by the canonical compiler.

For later preparation, pass this inventory and authored corpus explicitly, select `direct` or `world-inference`, and use a new output directory. Do not silently mix with the old active corpus or use its exclusion defaults. Before reporting held-out accuracy, group related paraphrases by `nativeTool.check` (and catalog family as appropriate), then create the intended split: the existing loader's per-row split can otherwise leak sibling paraphrases. Training, canonical-binding integration and reader accuracy evaluation remain separate authorized work.

## Complete old/new preparation

`training/sop-bert/prepare-ui-natural-union.py` uses the shared `prepare-key-reader.py` sample/registry functions. It retains every old and new source and all phases, merges the declared inventories and class banks, and expands the global target-type class bank to exactly the declared `targetFamilies`. Old rows retain their original vocabulary coverage; newly added native heads are unknown there, rather than falsely labelled absent. No namespace conversion or guessed canonical binding is applied.

```sh
python3 -I training/sop-bert/prepare-ui-natural-union.py \
  --oldsource training/sop-bert/data/demo-tool-profile/active.jsonl.gz \
  --newsource training/sop-bert/data/ui-natural-v1/authored.jsonl \
  --inventory training/sop-bert/data/ui-natural-v1/inventory.json \
  --ui-weight 5 --out ../.session-control/overnight-ui-natural-union
node --test tests/ui-natural-union-declared-host.test.mjs
```

The output directory must be new. Old splits preserve the existing source identity hash policy. New splits use connected recipe-family components, so compound constituents and their paraphrases stay together. Weighting repeats only UI training records with unique sample IDs; full and calibration records remain unweighted. Cohort/expected-tool metadata does not enter model text/context.

The completed preparation contains all **36,999 old + 1,474 new messages**. Gold cuts: **43,445 old + 1,480 UI**. Training: **46,098 samples**, including 1,406 distinct UI cuts repeated five times. Calibration: **4,451 samples**, including 74 UI cuts. The merged registry has **257 keys**, with maximum input length 384. The actual shared-preparer diagnostics are empty for both sources. `full-old.jsonl` and `full-ui.jsonl` provide unweighted evaluation cohorts without another full-union duplicate. `manifest.json` records actual counts, source versions, grouping, coverage policy and output checks.

This is completed dataset preparation, not model training or an accuracy result. The subsequent training/evaluation phase consumes the frozen manifest separately.
