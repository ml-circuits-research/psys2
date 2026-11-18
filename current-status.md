# Current status

Updated: 2026-11-18. Worlds truthfulness and readability review completed.

## Public demo

Latest build: **`4d6b6239e8`**, https://ml-circuits-research.github.io/psys2/webchat/?ui=4d6b6239e8 . Publication is verified after the implementation push; the earlier public build was `78a45da5bc`. Model weights are unchanged.

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
