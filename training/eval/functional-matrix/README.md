# Functional matrix: classes of functionality × areas

Progress is judged by classes of functionality in each area, not by single commits or sentences. `build.py` draws up to 25 rows per cell from `sop-bert/data/haiku-v2` (18 classes × 4 areas, 1,648 rows in `dev-rows.jsonl`, each tagged with its classes). Classes: create, set property, relative change, move / place, remove, connect / group, arrange / layout, select by description, sets / or / not, soft wishes, question, check, propose, several requests, follow-up / undo, objection, cross-area, no request.

These rows are a development split: training must exclude the ids in `exclude-from-training.json`. They are not the final unseen evaluation (Q112).

Report after each landing, for the only engine: per cell, right / partly / honest / wrong, judged against the row's annotation (the request graph) and the resulting state, plus the same table for the owner's English sessions with each turn tagged by class. A cell counts as working when it is mostly right with zero wrong; the table, not a list of commits, is what the owner reads.
