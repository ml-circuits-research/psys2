# Proposer experiment (2026-11-14) — measurement only, not shipped

Question (Q14 item 4): of the 71 failing meaning-kept paraphrases (`paraphrases-rt`, rules-C, class `paraphrase: ...` in `failures.jsonl`), how much is a WORDING gap (a phrasing the world already reads right exists) and how much a KNOWLEDGE gap?

Method. A small encoder proposes, for each failing paraphrase, the 5 nearest sentences of the SAME world from the world's accepted sentences (4,892 sentences, 33 worlds: clean `operational.jsonl` rows that rules-C reads right, `tests.sop` inputs, grid v3 cells that were judged right; the noisy and context-dependent operational families are left out). Numbers and names are delexicalised for the search and put back from the paraphrase. The value checker of the normalizer (`src/dialog/value-check.mjs`, with the world vocabulary) must accept the proposal against the paraphrase, plus one extra guard: the names must be the same, because the checker lets known names (ana, mia, tom) swap. The rules then read the accepted proposal; judged exactly as the paraphrase set (`scripts/eval-ablation.mjs`, new set `paraphrases-proposals`, gold = the original expectation). The rule applied is the one a shipped proposer would have: the first proposal the checker accepts. Encoder arms: `minilm` (nreimers/MiniLM-L6-H384-uncased, the act-tagger backbone, NOT fine-tuned: raw mean-pooled embeddings, cosine) and `tfidf` (word 1-2-grams, control). Variant B also removes the original's own template from the pool; it changed nothing for MiniLM (no twin in the pool), so only A is shown.

Recipe: `node scripts/exp-proposer.mjs prepare|cases|report`, `training/psys2_train/proposer_experiment.py` (torch + transformers from the training environment, no new requirement), `node scripts/eval-ablation.mjs --configs rules-C --sets paraphrases-proposals --proposals <cases.jsonl>`. Result: `proposer-2026-11-14.json` (per row verdict, the chosen proposal, per class counts).

## Result (71 failing rows, rules-C)

Bound first: the ORIGINAL sentence each paraphrase was made from reads right in **44 of 71** (62%): that is the wording gap (the knowledge exists). In the other **27** the original fails too: knowledge/act missing (animal sound question 13 of 13, other single paraphrase 13 of 25, story question 1 of 10), or the gold does not fit.

| Outcome (first proposal accepted by the checker) | MiniLM | TF-IDF |
| --- | --- | --- |
| right via a proposal (wording gap closed) | **14** (19.7%; any of the 5: 17) | 14 (any of 5: 15) |
| accepted by the checker but the rules read another meaning | 10 | 5 |
| accepted but not read (not understood / asked) | 11 | 5 |
| all 5 proposals rejected by the checker (values, names, colours, operands) | 28 | 41 |
| no proposal could be written (slots not fillable) | 8 | 6 |

By cause class (MiniLM; original = the original reads right; rejected = checker rejected all):

| Cause class | n | original reads right | right via proposal | wrong meaning | not read | rejected | none |
| --- | --- | --- | --- | --- | --- | --- | --- |
| story question not routed | 10 | 9 | 6 | 0 | 0 | 4 | 0 |
| other single paraphrase | 25 | 12 | 4 | 5 | 4 | 11 | 1 |
| animal sound question (broken order) | 13 | 0 | 0 | 0 | 3 | 7 | 3 |
| currency word changed by translation | 11 | 11 | 2 | 0 | 0 | 5 | 4 |
| music/chess notation, loose wording | 9 | 9 | 0 | 5 | 3 | 1 | 0 |
| arithmetic/time, loose wording | 3 | 3 | 2 | 0 | 1 | 0 | 0 |

## Reading
- Wording versus knowledge: at most 62% wording (44), at least 38% knowledge (27, concentrated in the animal-sound question and the single paraphrases that name something the world has no act for). A proposer with this encoder recovers only 14 (20%) of the 44: a third of the achievable wording gap.
- The checker is a brake on the wrong side: in 13 rows it rejected a proposal that the rules read RIGHT (a currency word or a number-word counts as a value that "changed"; the story rows lose "has/have left"), and it cannot catch a name swap (it knows ana, mia, tom as vocabulary words; our extra guard did). Without the name guard "mia has 13 stickers ..." was accepted for an "Ana ..." story and judged right by the numeric answer: a swap the answer judge cannot see.
- The raw MiniLM is no better than TF-IDF on the first accepted proposal (14 and 14); it only helps a little further down the list (17 versus 15). A trained contrastive encoder is the untested part: this is a lower bound on what an encoder can do, the upper bound is the original-reads-right count (44).
- Meaning changes: 10 proposals the checker accepts are read as another meaning (notation: "Play the G's major scale" became "play the D major scale": the note letter is a value the checker does not bind, spec idea: note names of a scale are values). A shipped proposer would act on these without asking.
- Nothing in `src/` changed. `scripts/eval-ablation.mjs` got the new set `paraphrases-proposals` (reads a file given by `--proposals`; no other set is touched).
