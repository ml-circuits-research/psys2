# Questions from the worker

The worker appends questions here and never deletes them. The reviewer removes a question only after answering it in a new round of `worker-tasks.md`.

Format:

```
## Q<n> (task Tn, <date>)
Question: ...
Context: what was tried, what the options are.
Blocking: yes/no. If no: the choice taken meanwhile.
```

(no open questions)

## Q1 (task T1, 2026-11-08)
Question: Should `routing.jsonl` be split by normalized text (or by a group) so that the same text never lands in two splits?
Context: `check_splits` finds no `group` leaking within worlds, but routing rows have no `group` field; by (world, normalized text) 113 texts appear in two splits (short, context-dependent replies such as "yes!", "make it blue", "undo my move."; games.guess 24, games.chess 16, games.hangman 11, art.draw 10, ...). The same text under different contexts may legitimately belong to both, but it inflates routing dev/test accuracy slightly.
Blocking: no. Choice meanwhile: keep the split as built; for D1/D3 I report routing accuracy both on all test rows and on test rows whose normalized text is not in train.

## Q2 (task T1, 2026-11-08)
Question: games.hangman paraphrase rules coverage drops from 0.565 (committed `training/paraphrases/report.json`) to 0.285 when the collector is rerun at baseline 055fbeb. Is this expected?
Context: The collector run is deterministic (two runs give rules-agree 57, rules-fail 130, rules-differ 13). The collector change in 21c36e7 only adds multi-file input. The committed hangman outputs seem to have been produced with a different rule state than the one committed in 6e81a5c. docs.editor (~10 records), ui.shell (4), ui.avatar (1-5) also changed labels; chess and animals only reordered.
Blocking: no. Choice meanwhile: commit the regenerated outputs, because the baseline numbers (T2) must match what the rules at the baseline commit produce. If this is a hangman rule regression, it shows up as a rule gap in T2/D3.
