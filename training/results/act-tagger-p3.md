# P3: the act + roles tagger at three sizes (2026-11-13)

Data: `scripts/gen-act-tagger-data.mjs` (rerunnable; `training/data/act-tagger/`: knowledge-pools.json and stats.json committed, jsonl ignored). 242,744 train / 5,000 dev sentences from 2 real schemas (plan.seating, test.seating) + 60 synthetic schemas built from knowledge words (k.objects / k.attributes things, k.values colours, comparatives, k.feelings, k.geo cities), every form of the act grammar (FORMS of `worlds/acts/acts.mjs`) with verbs from `k.actions` (ACT_VERBS). Labels: act (14 classes) + BIO spans of thing, set, attribute, value, place, amount.
Held out: `diagram.sketch` and `ui.avatar` (6,000 test sentences; their own kind/attribute words are removed from the pools used for the training worlds). Seen worlds: 6,014 fresh sentences (plan.seating, test.seating, synthetic), none equal to a training sentence.
Training: CUDA bf16, batch 256, 6 epochs, AdamW, ~8 to 12 minutes each. minilm6 = nreimers/MiniLM-L6-H384-uncased; minilm4 = its first 4 layers (not re-distilled). int8 = onnxruntime dynamic quantisation, per-channel.

| model | params | int8 MB | cold load at 1 MB/s | graph create at 4x | per message at 4x (median / p95, 9 tokens) | per message at 1x | seen: act / span F1 | held-out: act / span F1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DistilBERT base (6 x 768) | 66.4 M | 67.0 | 67 s | 1.27 s | 72.5 / 97.6 ms | 17.9 ms | 99.42 / 99.82 | 99.03 / 95.38 |
| MiniLM-class 6 x 384 | 22.7 M | 23.0 | 23 s | 1.26 s | 21.1 / 28.5 ms | 4.9 ms | 99.55 / 99.74 | 99.07 / 95.13 |
| MiniLM-class 4 x 384 | 19.2 M | 19.3 | 19 s | 1.10 s | 12.6 / 17.5 ms | 3.4 ms | 99.43 / 99.74 | 98.83 / 93.96 |

Phone profile: headless Chrome, onnxruntime-web 1.31 (the webchat's), single-threaded wasm, CDP CPU throttle 4x, 300 real test sentences (150 seen, 150 held-out), batch 1 (`training/experiments/browser-limits/tagger-run.mjs`; results `act-tagger-phone-<size>.json`). The int8 graph's act equals the fp32 CUDA act on 300 of 300 sentences for all three. Accuracy columns are CUDA scores of the trained weights; with the weights fake-quantised to int8 on CUDA the numbers move by at most 0.02 points (`gpu_int8_weights` in each result file). For reference the present dispatcher: 66 to 68 MB, 172 ms at 4x for a 32-token pass (browser-limits README; not the same inputs).

Held-out by role (span F1, DistilBERT / 6x384 / 4x384): thing 94.6 / 94.3 / 93.0, set 81.8 / 81.7 / 78.3, attribute 99.0 / 98.8 / 97.9, value 98.7 / 98.5 / 98.0, place 98.6 / 97.5 / 97.4, amount 99.9 / 99.8 / 99.7. The gap to the seen worlds (99.8 span F1) is 4.4 points for DistilBERT, 4.6 for 6x384, 5.8 for 4x384 (criterion of P3: within 5 points: met by the first two); it sits in the thing and set roles (not inspected span by span: probably plural kind words of the held-out worlds and multiword avatar kinds); act, attribute, value, place and amount transfer within 1 to 2 points.

Agreement with dispatcher + patterns (`act-tagger-agreement.json`; the rules' winning request action of every message of `training/eval/operational.jsonl` (1,240) and `dialogues.jsonl` (2,297 turns) mapped to an act by its verb, `scripts/act-agreement-rules.mjs`; 748 messages map to an act; the rest are arithmetic, chat, games, map: not comparable). The tagger is context free and sees the whole message; the rules see the tab, the history and the segmented sentence.

| subset (n) | DistilBERT | 6x384 | 4x384 |
| --- | --- | --- | --- |
| all mapped (748) | 67.1 % | 61.5 % | 64.3 % |
| doing worlds (art.draw, diagram.sketch, ui.avatar, kids.tasks, docs.editor): operational + dialogue (443) | 80.6 % | 76.1 % | 77.0 % |
| the same, operational only (171) / dialogue only (272) | 73.1 / 85.3 % | 69.6 / 80.1 % | 74.3 / 78.7 % |
| doing worlds, single command (no and / then / also / but / comma) (362) | 86.7 % | 81.8 % | 81.8 % |
| operational messages whose shipped result is `right`, doing worlds (162) | 72.2 % | 69.1 % | 74.1 % |

Reading the disagreements (30 sampled, DistilBERT): compound messages ("draw a red house and also how many days are in a week": the tagger takes the question, the rules the draw), follow-ups without context ("again", "more", "no, the house"), words the act grammar has no form for ("put a tree on the left" read as place, rules: draw.add), the heuristic mapping itself (`chat.ask` for "Add a heading" in docs.editor; `draw.add` for avatar cases), and real tagger errors ("make your body green": no thing span; "put a hart on ur chest": typo in the thing).

What this says: on the generated sets all three are within 1 point on act and 2 to 4 points on spans, so the table separates them by size and speed, not accuracy. The generated sets are easy (99 % after one epoch): they measure the generalisation to new worlds and words, not to real phrasing. On real messages the act agreement is 73 to 87 % depending on subset and the mapping is itself approximate, so this number is a lower bound of the agreement, not a score of the tagger. Training on the logs' phrasings (AGENTS data principle) is the obvious next step, with `none` / `question` acts and compound messages added, which the present label set does not have.
