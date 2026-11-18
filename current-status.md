# Current status

## 2026-11-18 — schema, knowledge and instance ownership

Delivered application build **87d3be7b8b** with library **0.209.0 / 602df0d** and knowledge catalog **59875277**. Calendar and Avatar import reusable schemas into separate contexts, then admit only instance facts through the library guard and their existing domain ownership closure. Direct instance readers reject copied schemas, rules, imports and unrelated knowledge facts. Current five-editor export/restore/query/temporary-reasoning checks preserve all data; schema definitions and temporary deductions do not enter instance storage. Drawing, Diagram and Documents still have authoritative native state with explicit SOP observations.

Execution defaults and request-composition policy facts now have separate imported schema sources. The Worlds inspector shows those owners independently. Vocabulary comes through explicit catalog dependencies rather than concatenation into schema text. Offline person/diagram profiles preserve their prior vocabulary as separate knowledge sources. The operative execution source now contains only declared value-lookup families and references separately held schema modules; its RGB name/value bindings retain exact parity. It is an evaluation context, not copied editor state.

`node scripts/build-lang-en.mjs` regenerated the pinned bundles and declared execution source; `node scripts/build-webchat.mjs` checked them and built the site catalog with **1,318 files**. `npm test`: **589 tests, 586 passed, zero failed, three skipped**. The actual pinned-knowledge probe also created an editable vector apple and resized Avatar eyes after loading its alias data. Existing source/browser gates passed in the integrated suite.

Historical archive bytes and their old knowledge pin remain unchanged and losslessly readable. The current application rejects their incompatible pin atomically, as required by the no-implicit-migration policy. They are not silently relabelled as current files. No model weights or training changed. This delivery enforces ownership boundaries; it does not complete the general request compiler. The broader book revision is being handled separately.

---

## 2026-11-18 — book and compiler migration plan

The owner requested theory and a concrete plan before runtime refactoring. The revised [SOP Worlds book](../soplang-words-lib/books/sop-worlds-teorie.md) defines a minimal public boundary: provide existing worlds, tool interfaces and context, then compile SOP request/query circuits. LIB encapsulates binding, completion, hypothesis ranking, constraint solving and planning. A plan is a concrete circuit of typed tool calls; tools consume their own instructions.

Chapter9 now explains request classes and resolution algorithms instead of public JavaScript APIs. The whole-book review removes release/implementation diary entries and corrects unsupported examples. `node tools/audit-book-examples.mjs --published --strict` admits all46 SOP examples against real schemas; structural admission is not execution evidence. Library source and bundle gates each passed964tests:962pass,0fail,1skip,1todo; documentation rebuilt.

The [migration plan](../soplang-words-lib/refactoring/request-to-executable-circuits.md) records actual gaps, responsibilities to remove from application JS, typed tool contracts and nine request-family acceptance groups across all five editors. PSys2 `npm test` also passed580tests:577pass,0fail,3skip. The existing [native reduction plan](specs/plans/worlds-native-reduction.md) points to that contract. No runtime or training changes were made for this documentation delivery; the deployed UI/model remain as reported below. Pending label changes remain stashed.

---


Updated: 2026-11-18. Worlds truthfulness and readability review completed.

## Public demo

Latest build: **`4d6b6239e8`**, https://ml-circuits-research.github.io/psys2/webchat/?ui=4d6b6239e8 . Implementation commit `fc7d0523` is pushed; GitHub Pages deployment completed successfully and the public build-info was verified to return `4d6b6239e8`. Model weights are unchanged.

## Latest Worlds review

- Breadcrumbs, relationships and property navigation are borderless links. Why opens first and uses short authored purpose comments. All 40 published catalog definitions have concrete explanations grounded in their source documentation.
- Orange means JavaScript/native implementation or catalog metadata; green means SOP declarations/facts; blue means SOP-BERT. Role icons no longer imply implementation. Native/model/JSON nodes have no fabricated SOP tab; empty Tools, Properties and Schema tabs are omitted.
- Opening a declared SOP source fetches its real catalog files. Flat file links select **one exact complete file at a time**; all fetched files remain accessible and larger worlds use bounded pagination. No file is summarized, truncated or combined with other files.
- Catalog-only, inspection-only and source-read are distinct. Reading bytes is not evidence that reasoning used them. `k.interest` is a genuine published definition but **its scoring mechanism is not connected to this demo**: the older executor snapshot contains its schema, zero scoring facts, and the active native path has no interest-scoring call. This missing integration is now stated, not presented as a working capability.
- Opening Worlds no longer prepares native knowledge services just to construct the map. Explicit source inspection reads raw declared files without compiling a knowledge World, running rules, calling tools, changing editor state or sending a model request.
- Checks: **580 tests, 577 passed, zero failures, three skipped**, including the actual built-app Worlds RPC/source test. Real 390px/1600px visible panes, three-colour palette, Why/link navigation, exact `k.interest` and paginated `k.animals` source text, retained graph identities and unchanged native state/loaded-world set/send count all pass. No console exceptions or missing files.

These changes correct the inspector. They do not implement unused knowledge mechanisms or claim that every catalog definition participates in reasoning. Drawing, Diagram and Documents still have native state authority; Avatar and Calendar retain their verified SOP authority.

## Completed work

- Separate corpus: `training/sop-bert/data/ui-natural-v1/`, with **1,474 messages**. All 99 current UI operations have synonym and elliptical variants; 587 meaningful optional-detail combinations cover shorter requests. Original 592 messages remain. Extraction, normalization and world completion have separate gold annotations.
- **1,175 actually executed UI recipes / 1,181 calls**, with exact text, SOP and observation references in `ui-actions.jsonl`. Existing V2 validation and actual label preparation report zero invalid rows and zero ambiguous/overlapping label masks. Vague completion cases do not manufacture tool effects.
- Union includes all **36,999 older authored messages** plus the new corpus: **46,098 training samples / 4,451 calibration samples, 257 keys**. UI training weight is five; related paraphrases share split cohorts. No source exclusions.
- Worlds: vertical explanatory legend, breadcrumb navigation, separate Activity log page, larger adjustable fonts, visibility/focus-gated animation, and per-response Replay of exact recorded events. Replay does not execute commands again.
- Optional dynamic input padding, compact CPU training labels and compatible-head warm-starting reduce unnecessary inference/training work. Legacy model configurations retain their previous padding behavior.
- Recovered **1,408,461,474 bytes** from superseded checkpoints/export/cache. About 20 GB remains free. Current deployed weights, selected epoch-7 checkpoint, training data and unowned stale worktrees were preserved.

## Actual measurements

On the frozen **1,480 gold request cuts / 1,474 messages**, the old model produced **28 exact intents (1.89%) / 16 complete reader meanings (1.08%)**. Of those cuts, 1,230 require keys absent from the old checkpoint; on the 250 shared-key cuts, exact intent was 28/250. Its old 192-token limit truncated 367 rows. These are conditional checkpoint diagnostics, **not browser execution accuracy**.

The deployed cutter on the fixed 5,218-source comparison achieved **3,728 exact segmentations (71.44%)**: UI 1,389/1,474, older calibration 2,339/3,744. Reports are under `.session-control/overnight-reader-baseline/` and `.session-control/overnight-ui-cutter-baseline/` at workspace root.

## Checks and integration limits

Latest integrated gate: **571 tests, 568 passed, zero failures, three skipped**, including real Chromium touch interaction. Eleven Python key-reader preparation tests also pass.; system map and browser assets rebuilt. Actual Chromium checks passed for the explanatory legend, 15px base font and zoom, breadcrumbs preserving map position, full-page Activity log, usable chat, and visibility/focus pause/resume; zero console exceptions. Replay was independently verified not to execute commands again.

New generic native-interface binding preparation describes 25 families / 144 literal properties in five SOP schemas. Actual gold-request integration changed Avatar base to man and Drawing label to Cabin, with effect verification. This tests the binding/executor mechanism, **not neural recognition**. The overlay is not activated in the deployed model; structured argument codecs and new-model provider-area activation still need integration with the candidate bundle.

## Actual training results and corrected diagnosis

Cutter completed eight epochs, selecting epoch two. Same fixed 5,218 source cases: **5,212 exact (99.885%)**, up from 3,728 (71.44%). However, it regresses the owner noun enumeration: the deployed cutter reads two cuts for `draw a tree and a house`, while the candidate reads one. It is not promoted on aggregate score alone.

Key reader selected epoch three, SHA `3192ac283d00977146543dedf94d72234dcb3020dfc77a8862acd105f8086d04`. Actual CPU comparison on identical 1,480 gold cuts: **1,037 exact intents (70.07%)**, **1,412 exact global fields (95.41%)**, **1,229 exact source spans (83.04%)**, **791 complete reader meanings (53.45%)**. Old intent was 28/1,480. Shared-key intent is 212/250; new-key intent is 825/1,230. These are conditional reader diagnostics, not native/browser execution accuracy.

Training was stopped before completion when supervision/representation defects were confirmed: V2 preparation bypassed existing lexical-inner span extraction, teaching `coloured red` instead of `red`; 88 rows have values outside available classifier banks; unit/measure metadata lacks output heads. The selected checkpoint and both real evaluation passes are retained. Further epochs cannot fix those contracts. No completed-run or deployment success is fabricated.

The new key reader BIO already finds **both** `tree` and `house` spans. Its singleton target.kind conversion refuses multiple mentions; a repeated-target/role contract is needed. A generic source-cut scheduling policy fixes the deployed two-cut runtime failure without splitting English text or inventing a verb, but cannot repair the new one-cut representation. `draw a tree near a house` is a counterexample to blindly creating every noun.

Reports: `.session-control/overnight-ui-cutter-after/comparison.json` and `.session-control/overnight-reader-candidate-eval/`. No model promotion or restart occurs until the unresolved contracts are addressed.

## Delivered implementation and actual runs

- `draw a tree and a house` and `draw a tree and draw a house` each create **two real objects** with the deployed model; **one Undo restores both**. The first retains an extra unapplied tree constraint as a partial result. The reader runs once per actual cut rather than doing a redundant full-batch read first. Actual coordinated-reader/proposal events and SOP policy reads appear on the common activity bus.
- Worlds legend releases the graph width when closed. Mobile explicit navigation opens the visible page. Desktop and 390px Chromium checks pass without horizontal overflow; all actual architecture nodes remain inspectable.
- Mobile Drawing: actual touch Add, drag/move, explicit multi-selection, grouping/ungrouping and cancellation verified. Mobile Diagram: actual touch Add two nodes, multi-selection, group/ungroup, tap-two-node Connect and pinch without object mutation verified. These controls call the same declared tools and produce SOP records; no new operation inventory was invented.
- Diagram's missing `arrows.mjs` and `data.charts/vector-svg.mjs` modules are included in the published runtime closure. A generic asset check covers actual lazy editor module constants and the content manifest. Retired standalone Charts UI moved to `legacy/`.
- Avatar joins Calendar as **canonical SOP state authority**. Session storage owns only `{sop}`; transactions and rendering decode temporary native data. Current composition, shared slot records, colours, geometry, explicit overrides, saved compositions, ordered history/future, options and referents are represented. Current interface bindings are explicit; historical duplicates do not silently become live objects.
- Built-route Avatar Chromium: visible composition change, exact eye scale 1.2, real eyes feature change and Undo verified. Worlds shows sole SOP carrier, authoritative instance, complete governing schema, exact face/eyes facts and zero identity/console errors. Fresh versus 40-history resize measured 15/87 ms in Node; this is not a claim about all mobile devices.
- V2 supervision fix narrows **177 mention spans across 175 request cuts** to the lexical value, retaining the outer disambiguating evidence separately. All utterances, raw gold requests and expected native calls remain unchanged. The corrected future union is `.session-control/ui-natural-span-corrected-union/`, explicitly **`trainingReady:false`** pending the documented contracts. Eleven Python and eight targeted Node checks pass.
- Updated library skills are pushed in **`fba0f38`**. Source and built-library gates each ran 964 tests with zero failures. Historical grammar fixtures are no longer presented as neural application accuracy, and refusal-first/capability-for-free instructions were corrected.

Architecture plan: `specs/plans/worlds-native-reduction.md`. The initial graph inventory had 75 native state properties, nine runtime records, five adapters and seven components. Those 75 properties were not 75 independent algorithms. This delivery moves real Avatar state and execution policies into SOP; it does **not** relabel the remaining JavaScript algorithms as Worlds or claim to have replaced all native components.

## Remaining after standby

- Drawing, Diagram and Documents still have authoritative native state and domain algorithms. Their complete semantic schemas/state migrations remain planned; Avatar and Calendar are the completed storage-authority migrations. Native geometry, renderer/DOM, model tensors and typed primitive boundaries remain legitimate implementation components.
- Repeated target/group/role membership is still absent from the raw reader contract. The candidate cutter's one-cut noun enumeration cannot be repaired merely by running the source-cut scheduler. Preserve the example and the near-a-house counterexample; extend the representation before retraining it.
- Resolve missing unit/measure output contracts, out-of-bank reference/alias supervision and source normalization before another training run. The corrected span preparer alone does not resolve these. The selected measured epoch-3 checkpoint remains available; no training process remains running.
- Omitted positions still use native centre defaults and may overlap; no new spatial reasoning success is claimed. Some existing native operations still return generic effect verification `unverified` despite actual effects checked in the browser; keep that distinction visible.
- Touch flows passed Chromium at 390×844. Broader physical-device/Safari ergonomics and fine resizing/property editing need owner feedback; no claim of universal mobile coverage.

No further training or refactoring is scheduled during standby. Resume on owner return with these concrete remaining contracts and UI feedback.
