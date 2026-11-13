# P3 round 2: the act tagger on REAL messages (2026-11-13, experiment only, no runtime work)

Reviewer's next round (23:30 a-d, 23:55 item 6): (a) segment first, then tag each piece; (b) a `none` class (not a request to a doing world) with `ask` kept as the question act; (c) real data labelled by the acts executor's accepted readings, two worlds held out; (d) no tab, no history. Size: 6 x 384 only (see "Sizes").

## Data (`scripts/gen-act-tagger-real.mjs`, rerunnable; jsonl in ignored `training/data/act-tagger-real/`, `real-stats.json` there)
- Sources: the three owner logs, the failure ledger, the round-trip paraphrases. English only (the English side of a translated row), deduplicated: 1,095 messages (a few rows are Romanian typed without diacritics or other junk the log kept; the files are ignored, nothing is stored in a world).
- Each message is replayed through the whole rule pipeline in its own tab and in the five doing tabs (robot, draw, diagram, seating, timeline) with `worlds-pilot/art.draw` shadowing the drawing board; the PIECES are the engine's segments (rules clause splitter + the card-driven cutter): 1,282 pieces.
- A piece is accepted when its winning reading is a request of ui.avatar, diagram.sketch, plan.seating, plan.timeline or art.draw and the action names an act (the table of `scripts/act-agreement-rules.mjs`); the act is that act, the spans are the reading's slots (thing, set, attribute, value, place, amount; the slot names the rules patterns use, 195 slots of other names are left unlabelled). Own tab wins a disagreement between tabs, else the plurality, ties dropped. Everything else is `none`.
- Held out: every message with a piece accepted by ui.avatar or diagram.sketch, and the `none` messages of the robot and diagram tabs (189 pieces: 48 avatar, 41 diagram, 3 draw, 97 none). Seen: the rest split 80 / 20 by message: train 874 pieces (292 art.draw, 8 seating, 574 none), test-seen 219 (80 accepted: 78 art.draw, 2 seating; 139 none).
- Training: the generated sets of P3 (242,744 sentences; regenerated with the current acts grammar, rows of the new `own` act, a world's own reader form, are left out because `own` is not a universal act) plus the 874 real pieces repeated 20 times in every epoch. 6 epochs, CUDA bf16, batch 256, 5.5 minutes. The trainer is the same (`training/psys2_train/act_tagger.py --real`), 15 classes.

## Table (6 x 384, 22.7 M parameters; real pieces; "accepted" = the executor's accepted readings)
Seed 1 / seed 2 (the two seeds differ by 1 to 5 points on these small sets: read them as a range).

| measure | seen worlds (219 pieces, 186 messages) | held-out worlds (189 pieces, 166 messages) |
| --- | --- | --- |
| act accuracy, all pieces | 80.4 / 81.7 % | 59.3 / 60.8 % |
| act accuracy on accepted pieces (80 / 92) | 81.3 / 85.0 % | 63.0 / 67.4 % |
| message agreement (every piece of the message right) | 78.0 / 79.6 % | 53.6 / 55.4 % |
| span F1 on accepted pieces | 65.3 / 70.4 % | 58.8 / 60.4 % |
| `none` precision | 94.9 / 95.7 % | 79.4 / 82.8 % |
| `none` recall (139 / 97 pieces) | 79.9 / 79.9 % | 55.7 / 54.6 % |
| same model, generated test sets (act / span F1), for reference | 99.5 / 99.7 | 98.6 / 96.5 |

Control: the same model trained on the generated data only (no real pieces, so no `none`): act accuracy on accepted pieces 60.0 % seen / 58.7 % held-out, none recall 0, span F1 38.7 / 41.7 %. The real pieces add about 20 points of act accuracy on accepted pieces on seen worlds and 4 to 9 on held-out worlds, and give `none` (which the generated data cannot teach).
By act, held-out, seed 1: connect 14 of 14, remove 7 of 7, change 8 of 9, make 29 of 59, undo 0 of 3; seen: make 37 of 46, place 14 of 18, change 9 of 11.
Weights fake-quantised to int8 (`real_int8_weights` in the result files): within 0.2 to 2 points of the table.
Size and latency are those of the 6 x 384 row of `act-tagger-p3.md` (the architecture is unchanged, one more output class): 23.0 MB int8, 23 s cold load at 1 MB/s, 21 ms per message at 4x CPU throttle (28.5 ms p95), 4.9 ms at 1x; not re-measured.

## What the table says
1. On seen worlds the tagger agrees with the executor on about 80 % of messages (none is right 95 % of the time it is predicted, but it finds 80 % of the nones), which is the level of "the rules and the tagger mostly agree on the doing worlds' simple turns". It is not at the level that could replace the rules (the rules ARE the label), and the P3 round 1 range (76 to 87 % agreement) was not exceeded.
2. On the two held-out worlds it falls to 54 to 55 % message agreement and 55 % none recall. The generated data transferred to these worlds at 98.6 % on its own sentences; on real, noisy phrasing it does not. Most held-out errors are `none` read as an act (ask 19, change 11, make 4, remove 4: "Describe yourself", "What did you do to the mouth", "why did you paint a new circle", Romanian leftovers) and `make` read as `change` or `none` ("Make your eyes round", "Give yourself sparkle eyes", "make it happy", "create a chart about the current discussion").
3. Much of the disagreement is the label, not the tagger: what the executor does not accept in a tab becomes `none`, so "what did you do" (a request in meaning, declined by the world today) is none; and the rules' slots are the labels of the spans (pattern captures: "the blue crocodile" as one thing, "a" inside a thing), which is why span F1 is 59 to 70 % here against 97 to 99 % on generated schemas. The table measures agreement with today's rules, not correctness.
4. Data is small (874 real training pieces, 80 accepted pieces in test-seen, 92 in test-held; 56 to 65 % of the logs' messages are `none` by this definition): one more sentence is about a point. Per the data principle the final model would train on all real pieces; the split exists only to report.

## Sizes
Not trained at 4 x 384 or DistilBERT: round 1 separated the sizes by 1 to 4 points on spans and nothing on act, and the real sets here (n about 200 pieces, seed range 1 to 5 points) cannot resolve a difference of that order. 6 x 384 stays the candidate.

## Verdict for the reviewer
Segment-first plus a `none` class plus real data gets an act-level reader that agrees with the rules on about 80 % of seen-world pieces and 55 to 60 % of held-out-world pieces, with a 23 MB model. That is below the 83.2 % the ablation measured for the whole learned stack and well below the rules, so it is not a candidate for a world that has rules; its remaining value is the case the reviewer named (a world nobody wrote rules for), and for that the number to watch is act accuracy on the held-out worlds' accepted pieces (63 to 67 % here). More real held-out data (the logs of the avatar and diagram worlds, owner sessions) is what would move it. Nothing is wired.

Files: `scripts/gen-act-tagger-real.mjs`, `training/psys2_train/act_tagger.py` (`--real`, `--real-rep`, `--synth`, 15th class `none`, `real_score`), `training/results/act-tagger-real-minilm6.json` (seed 1), `-seed2.json`, `-synth-only.json`. Models and predictions: ignored `training/runs/act-tagger-real/`.
