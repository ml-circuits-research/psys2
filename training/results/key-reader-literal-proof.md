# Exact literal proof: unchanged epoch-5 weights

The source BIO spans already contained the two remaining wrong Avatar values in the fixed 100-row probe. A separate categorical head replaced them with unrelated canonical values. The decoder now accepts a source span only when it exactly matches one declared canonical string bank entry. It retains the classifier alternative and its probability in diagnostics. Unmatched or ambiguous literals keep the existing path. Numeric count fields additionally accept only complete positive ASCII integers within JavaScript's safe range; their source spans remain intact.

| Same 100 full utterances | Before | Decoder version 3 |
| --- | ---: | ---: |
| Predicted segmentation exact | 100 | 100 |
| Complete labeled intent exact | 98 | 100 |
| Native operation/arguments exact | 98 | 100 |
| Strict complete meaning | 96 | 100 |

Weights are unchanged: selected epoch 5, SHA `bc5217cb48bec1b9c36c4b2adf2ff4349d6cd74da5f0094a8b724dd03359ece1`; cutter epoch 4. The final proof audit contains six exact canonical-string proofs and two typed-integer proofs. Two canonical proofs disagree with the classifier: source `smirk` versus classifier `square` (0.04230 probability), and source `chevron` versus classifier `oval` (0.01634 probability).

Actual outputs: `.session-control/demo-eval100-final-initial-lot.summary.json` before; `.session-control/demo-eval100-epoch5-decoder3-proof-audit.summary.json` and `.jsonl` after. The latter records decoder-source SHA `fd79c018ab4d2cb4d64c9d47adbb5124c17f069662c93452720cc09441dc97ee`, source ranges, classifier alternatives and confidence. This is a 100-row initial-contract measurement, not a complete TRAIN score, current Calendar/Avatar UI accuracy or application execution/deployment result. The original epoch-1 full TRAIN results remain unchanged.

Python and browser implementations share the contract in `specs/key-reader-literal-proof.md`. Nineteen targeted Node tests pass, including the Python predictor suite, cross-language fixtures, unfamiliar fifth-domain inference, duplicate/no canonical matches, boolean/number distinction, integer bounds, a three-head 384-token profile, and malformed role/bank/route/hash rejection. Runtime layouts derive from declared registry/family/bank information rather than fixed model counts. The actual 123-head initial training config validates with all five areas. Core manifests without an embedded preparer hash must carry the frozen data manifest and prove its hash/script chain; that invariant is not waived.
