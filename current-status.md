# Current status

Updated: 2026-11-17, 22:58 UTC. Owner returned with compound-command and mobile failures; active work resumed. No new weights have been promoted.

## Public demo

Implementation commit: `af6b83c1` (pushed to `origin/main`; working tree clean at handover). The latest committed UI build is `e54e1f807b`: https://ml-circuits-research.github.io/psys2/webchat/?ui=e54e1f807b . GitHub Pages can take a short time to update after push; the immediate public check still returned `c342d5df70`, so public activation is not yet verified. The deployed SOP-BERT remains the original epoch-7 model. Its replacement has **not** been declared better, exported or deployed.

## Completed work

- Separate corpus: `training/sop-bert/data/ui-natural-v1/`, with **1,474 messages**. All 99 current UI operations have synonym and elliptical variants; 587 meaningful optional-detail combinations cover shorter requests. Original 592 messages remain. Extraction, normalization and world completion have separate gold annotations.
- **1,175 actually executed UI recipes / 1,181 calls**, with exact text, SOP and observation references in `ui-actions.jsonl`. Existing V2 validation and actual label preparation report zero invalid rows and zero ambiguous/overlapping label masks. Vague completion cases do not manufacture tool effects.
- Union includes all **36,999 older authored messages** plus the new corpus: **46,098 training samples / 4,451 calibration samples, 257 keys**. UI training weight is five; related paraphrases share split cohorts. No source exclusions.
- Worlds: vertical explanatory legend, breadcrumb navigation, separate Activity log page, larger adjustable fonts, visibility/focus-gated animation, and per-response Replay of exact recorded events. Replay does not execute commands again.
- Optional dynamic input padding, compact CPU training labels and compatible-head warm-starting reduce unnecessary inference/training work. Legacy model configurations retain their previous padding behavior.
- Recovered **1,408,461,474 bytes** from superseded checkpoints/export/cache. About 21 GB remains free. Current deployed weights, selected epoch-7 checkpoint, training data and unowned stale worktrees were preserved.

## Actual measurements

On the frozen **1,480 gold request cuts / 1,474 messages**, the old model produced **28 exact intents (1.89%) / 16 complete reader meanings (1.08%)**. Of those cuts, 1,230 require keys absent from the old checkpoint; on the 250 shared-key cuts, exact intent was 28/250. Its old 192-token limit truncated 367 rows. These are conditional checkpoint diagnostics, **not browser execution accuracy**.

The deployed cutter on the fixed 5,218-source comparison achieved **3,728 exact segmentations (71.44%)**: UI 1,389/1,474, older calibration 2,339/3,744. Reports are under `.session-control/overnight-reader-baseline/` and `.session-control/overnight-ui-cutter-baseline/` at workspace root.

## Checks and integration limits

Latest integrated gate: **568 tests, 565 passed, zero failures, three skipped**; system map and browser assets rebuilt. Actual Chromium checks passed for the explanatory legend, 15px base font and zoom, breadcrumbs preserving map position, full-page Activity log, usable chat, and visibility/focus pause/resume; zero console exceptions. Replay was independently verified not to execute commands again.

New generic native-interface binding preparation describes 25 families / 144 literal properties in five SOP schemas. Actual gold-request integration changed Avatar base to man and Drawing label to Cabin, with effect verification. This tests the binding/executor mechanism, **not neural recognition**. The overlay is not activated in the deployed model; structured argument codecs and new-model provider-area activation still need integration with the candidate bundle.

## Actual training results and corrected diagnosis

Cutter completed eight epochs, selecting epoch two. Same fixed 5,218 source cases: **5,212 exact (99.885%)**, up from 3,728 (71.44%). However, it regresses the owner noun enumeration: the deployed cutter reads two cuts for `draw a tree and a house`, while the candidate reads one. It is not promoted on aggregate score alone.

Key reader selected epoch three, SHA `3192ac283d00977146543dedf94d72234dcb3020dfc77a8862acd105f8086d04`. Actual CPU comparison on identical 1,480 gold cuts: **1,037 exact intents (70.07%)**, **1,412 exact global fields (95.41%)**, **1,229 exact source spans (83.04%)**, **791 complete reader meanings (53.45%)**. Old intent was 28/1,480. Shared-key intent is 212/250; new-key intent is 825/1,230. These are conditional reader diagnostics, not native/browser execution accuracy.

Training was stopped before completion when supervision/representation defects were confirmed: V2 preparation bypassed existing lexical-inner span extraction, teaching `coloured red` instead of `red`; 88 rows have values outside available classifier banks; unit/measure metadata lacks output heads. The selected checkpoint and both real evaluation passes are retained. Further epochs cannot fix those contracts. No completed-run or deployment success is fabricated.

The new key reader BIO already finds **both** `tree` and `house` spans. Its singleton target.kind conversion refuses multiple mentions; a repeated-target/role contract is needed. A generic source-cut scheduling policy fixes the deployed two-cut runtime failure without splitting English text or inventing a verb, but cannot repair the new one-cut representation. `draw a tree near a house` is a counterexample to blindly creating every noun.

Reports: `.session-control/overnight-ui-cutter-after/comparison.json` and `.session-control/overnight-reader-candidate-eval/`. No model promotion or restart occurs until the unresolved contracts are addressed.

## Current implementation batch

Actual Chromium on the built site with deployed reader: both `draw a tree and a house` and the repeated-verb version create both real objects; one Undo restores the pre-command scene; the first retains an extra unapplied tree constraint honestly. Validated requests use refreshed context and one undo group. Operational SOP Worlds now declare scheduling, omitted-argument defaults and knowledge-property joins. Mobile Worlds legend releases space on close; explicit phone navigation opens the visible page. Missing Diagram renderer modules were found in deployment, independently of touch behavior, and added to the runtime closure.

The architecture plan is `specs/plans/worlds-native-reduction.md`. The live graph inventory contains 75 native state properties, nine runtime records, five adapters and seven components; they are not hidden or relabelled as migrated. Avatar typed-state codec preparation roundtrips actual operations, but its authoritative host integration is still pending. Drawing/Diagram touch workflows remain active work. Updated library skills were pushed in `fba0f38` with source/bundle gates each 964 tests, zero failures.

## Remaining after standby

Finish and verify touch editing and the Avatar state-authority migration; correct lexical-span preparation; preserve unresolved multi-target, unit/measure and reference-normalization contracts explicitly. Publish completed batches, update this handover, then return to standby as requested.

Known limits: Avatar man reading can still fail with the deployed model; recognized requests can retain extra unapplied constraints; omitted positions may overlap at native center defaults. Calendar owns canonical SOP state; Drawing, Diagram, Documents and Avatar still expose native JS authority alongside observed SOP facts. Complete world-based reasoning and universal UI-language execution are not claimed.
