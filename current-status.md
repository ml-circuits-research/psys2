# Current status

Updated: 2026-11-17, 21:32 UTC. Owner requested a committed handover and standby. Training may continue unattended; no new weights have been promoted.

## Public demo

Implementation commit: `af6b83c1` (pushed to `origin/main`; working tree clean at handover). The committed UI build is `d840ad120f`: https://ml-circuits-research.github.io/psys2/webchat/?ui=d840ad120f . GitHub Pages can take a short time to update after push; the immediate public check still returned `c342d5df70`, so public activation is not yet verified. The deployed SOP-BERT remains the original epoch-7 model. Its replacement has **not** been declared better, exported or deployed.

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

Full integrated gate: **556 tests, 553 passed, zero failures, three skipped**; system map and browser assets rebuilt. Actual Chromium checks passed for the explanatory legend, 15px base font and zoom, breadcrumbs preserving map position, full-page Activity log, usable chat, and visibility/focus pause/resume; zero console exceptions. Replay was independently verified not to execute commands again.

New generic native-interface binding preparation describes 25 families / 144 literal properties in five SOP schemas. Actual gold-request integration changed Avatar base to man and Drawing label to Cabin, with effect verification. This tests the binding/executor mechanism, **not neural recognition**. The overlay is not activated in the deployed model; structured argument codecs and new-model provider-area activation still need integration with the candidate bundle.

## Training in progress at handover

- Key reader: `.session-control/overnight-ui-key-run/`; log `.session-control/overnight-ui-key-training.log`. Full prepared union, compatible epoch-7 heads/encoder, max 25 epochs, minimum 5, patience 4, best checkpoint only. First retry reached 500 optimizer steps. It was temporarily suspended while the cutter finished to avoid severe GPU context contention; a detached one-shot watcher resumes that exact process automatically, retaining optimizer state.
- Cutter: `.session-control/overnight-ui-cutter-run/`; log `.session-control/overnight-ui-cutter-training.log`. Full old/new corpus, 34,655 training / 3,818 calibration messages, minimum 8/max 12 epochs. Intermediate epoch-2 calibration span F1 was 0.999885; this is **not** the final fixed-source comparison or browser result.
- Initial key-reader attempt failed before any optimizer step during CUDA context allocation. Compact int8 CPU labels and CUDA initialization before label preparation resolved the retry's allocation failure; the initial failure log is retained.

Detached workers: `.session-control/overnight-cutter-resume-key.py` resumes the exact suspended key process when the cutter exits, including failure; `.session-control/overnight-cutter-evaluate-after.py` evaluates the successfully completed cutter on the same 5,218 cases and writes `.session-control/overnight-ui-cutter-after/comparison.json`. These scripts do not wake the agent or promote a model.

No training result is presented as a successful replacement until old/new evaluation, q8 export and actual browser checks have run. A completed unattended training run alone does not publish its model.

## Remaining after standby

Read the completed run logs; compare both selected models on the same frozen cohorts; export and measure q8 in the real browser; promote only a measured improvement. Review UI feedback before expanding further.

Known limits: Avatar man reading can still fail with the deployed model; recognized requests can retain extra unapplied constraints; omitted positions may overlap at native center defaults. Calendar owns canonical SOP state; Drawing, Diagram, Documents and Avatar still expose native JS authority alongside observed SOP facts. Complete world-based reasoning and universal UI-language execution are not claimed.
