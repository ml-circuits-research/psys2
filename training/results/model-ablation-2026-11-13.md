# Model ablation (2026-11-13)

Owner's question: measure every possibility, shrink the need for models where they bring no advantage; symbolic rules from general worlds may do more. This is the ablation over every model of the runtime, end to end through the shared pipeline, on the same sets, with the matrix reasoner. Data: `training/results/model-ablation-2026-11-13.json`. Tools: `scripts/eval-ablation.mjs` (one configuration = formalizer, segmentation, routing, reading strategy, normalizer; sets below), `scripts/ablation-report.mjs` (tables, rescue classes). Rerun: `node scripts/eval-ablation.mjs --configs <names> --ort <onnxruntime-node entry> --out <dir>` then `node scripts/ablation-report.mjs --dir <dir>` (everything through the heavy lock; the models are the shipped int8 ones, CPU in Node; the world scores of the router experiment come from CUDA in bf16 in one batch).

## Sets and outcomes
- Gold sets (right / wrong / asked / not understood; "partly" counts as wrong): **operational** (1296), **minimal-pairs** (122), **knowledge** (200, answer regex; the repository copy of the catalog, see finding F1), **dialogues** (470 dialogues, 2241 turns, each turn), **wrong-tab** (388: canonical requests of every world and fragments said on another tab, plus 200 operational messages on another tab; right = the world of the first understood segment is the gold world), **owner-a** (69, with the owner-log checks), and three robustness sets with an equivalence gold (the message must leave the same state and answer values as its original in a fresh session; a junk row must do nothing): **typos** (995), **loose-words** (670), **paraphrases-rt** (146, MT round-trip paraphrases).
- No-gold sets (answered / asked / not understood; "answered" = the system acted or answered and did not say it did not understand, which is not the same as correct): **owner-b**, **owner-c** (the two later owner logs, 63 and 33 messages), **ledger** (the 573 English and Romanian rows of the failure ledger, by cause group; the other 886 rows are foreign-language round-trip rows that need the machine translator).
- **operational-ro** (2480 Romanian messages, translation by rules only: the browser has no Translator in these runs).
- Router-level: the world-routing experiment (spec 20) rerun on current main (cards have grown; SPACE, M1, acts landed).
- Caveat on the sets: most of them were written with the rules in mind (canonical examples and their paraphrases), so rules-only starts high. The robustness sets (typos, loose words, MT paraphrases) are where a model has room; they are reported separately.

## Headline (all gold sets together, n about 6,100 messages)

| configuration | what is on | right | wrong | asked | not understood | ms per message (Node, 1 thread, mean / p50) |
| --- | --- | --- | --- | --- | --- | --- |
| rules-C | nothing learned; rules, M1, symbolic routing | 4,978 (81.7 %) | 589 | 183 | 334 | 38.9 / 18.1 |
| rules-also-suspect | rules plus the two prototypes of this report | 4,999 (82.0 %) | 575 | 181 | 329 | not timed (same path) |
| enc-C | DistilBERT segmentation and world prior, reading by rules | 5,038 (82.6 %) | 601 | 150 | 296 | 165.2 / 130.3 |
| shipped | enc-C + NX hybrid reader + T5 normalizer | 5,073 (83.2 %) | 595 | 140 | 280 | 185.1 / 138.2 |
| enc-neural | model reads first | 4,912 (80.5 %) | 737 | 152 | 285 | 150.6 / 111.4 |

All the models together buy **95 right answers in 6,099 (1.6 points)** over no model at all, and 2 percentage points less "not understood"; the wrong count does not go down (589 against 595). They cost 165.3 MB of download (68.3 + 97.0), 165 s of cold load at 1 MB/s and about 146 ms more per message in Node (4.8 times the rules-only time).

## The full matrix (right / n per gold set)

| config | operational | minimal-pairs | knowledge | dialogues | wrong-tab | owner-a | typos | loose-words | paraphrases-rt | all gold: right / wrong / asked / nu (n) | ms mean (p50) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rules-A | 1140/1296 | 112/122 | 133/200 | 2082/2241 | 287/388 | 43/69 | 818/987 | 338/643 | 22/146 | 4975 / 590 / 181 / 334 (6092) | 38.9 (15.5) |
| rules-C | 1140/1296 | 112/122 | 133/200 | 2082/2241 | 287/388 | 43/69 | 821/991 | 338/643 | 22/146 | 4978 / 589 / 183 / 334 (6096) | 38.9 (18.1) |
| rules-WAveto | 1140/1296 | 112/122 | 133/200 | 2082/2241 | 288/388 | 43/69 | 824/987 | 338/643 | 22/146 | 4982 / 588 / 181 / 329 (6092) | n/a |
| rules-WAchoose | 1141/1296 | 112/122 | 133/200 | 2086/2241 | 285/388 | 43/69 | 817/987 | 340/643 | 22/146 | 4979 / 586 / 180 / 335 (6092) | n/a |
| rules-RDfill | 1141/1296 | 112/122 | 133/200 | 2082/2241 | 287/388 | 43/69 | 830/987 | 340/643 | 24/146 | 4992 / 591 / 178 / 319 (6092) | n/a |
| rules-RDchoose | 1141/1296 | 112/122 | 132/200 | 2082/2241 | 288/388 | 43/69 | 822/987 | 340/643 | 24/146 | 4984 / 589 / 178 / 329 (6092) | n/a |
| rules-WAchoose-RDchoose | 1142/1296 | 112/122 | 132/200 | 2086/2241 | 286/388 | 43/69 | 826/987 | 342/643 | 24/146 | 4993 / 598 / 176 / 313 (6092) | n/a |
| rules-also | 1143/1296 | 112/122 | 133/200 | 2082/2241 | 288/388 | 43/69 | 829/991 | 338/643 | 22/146 | 4990 / 584 / 182 / 328 (6096) | n/a |
| rules-suspect | 1140/1296 | 112/122 | 132/200 | 2082/2241 | 288/388 | 43/69 | 835/987 | 338/643 | 22/146 | 4992 / 574 / 181 / 333 (6092) | n/a |
| rules-also-suspect | 1143/1296 | 112/122 | 132/200 | 2083/2241 | 287/388 | 43/69 | 839/991 | 338/643 | 22/146 | 4999 / 575 / 181 / 329 (6096) | n/a |
| enc-C-segrules | 1140/1296 | 112/122 | 133/200 | 2072/2241 | 287/388 | 45/69 | 856/991 | 329/643 | 25/146 | 4999 / 621 / 153 / 312 (6096) | 111.6 (60.6) |
| enc-C | 1159/1296 | 112/122 | 133/200 | 2079/2241 | 289/388 | 45/69 | 865/991 | 325/643 | 31/146 | 5038 / 601 / 150 / 296 (6096) | 165.2 (130.3) |
| enc-A | 1157/1296 | 112/122 | 125/200 | 2078/2241 | 288/388 | 45/69 | 863/990 | 322/643 | 31/146 | 5021 / 625 / 151 / 287 (6095) | 146.2 (100.5) |
| enc-B | 1156/1296 | 112/122 | 133/200 | 2076/2241 | 284/388 | 44/69 | 860/995 | 317/643 | 31/146 | 5013 / 615 / 161 / 300 (6100) | 174.6 (123) |
| enc-hybrid | 1159/1296 | 112/122 | 125/200 | 2079/2241 | 289/388 | 45/69 | 865/991 | 328/643 | 31/146 | 5033 / 617 / 152 / 283 (6096) | 163.4 (125.9) |
| enc-n1 | 1159/1296 | 112/122 | 128/200 | 2078/2241 | 290/388 | 45/69 | 874/994 | 344/643 | 36/146 | 5066 / 605 / 141 / 276 (6099) | 179.6 (131.6) |
| shipped | 1159/1296 | 112/122 | 132/200 | 2078/2241 | 290/388 | 45/69 | 874/994 | 347/643 | 36/146 | 5073 / 595 / 140 / 280 (6099) | 185.1 (138.2) |
| enc-neural | 1119/1296 | 112/122 | 134/200 | 1997/2241 | 295/388 | 45/69 | 840/991 | 335/644 | 35/146 | 4912 / 737 / 152 / 285 (6097) | 150.6 (111.4) |
| enc-neural-n1 | 1119/1296 | 112/122 | 124/200 | 1997/2241 | 294/388 | 45/69 | 864/995 | 354/644 | 40/146 | 4949 / 736 / 142 / 263 (6101) | 153.5 (113.7) |
| enc-suspect | 1159/1296 | 112/122 | 132/200 | 2079/2241 | 289/388 | 45/69 | 878/991 | 325/643 | 31/146 | 5050 / 596 / 149 / 290 (6096) | n/a |

| config | owner-b answered/asked/nu | owner-c answered/asked/nu | ledger answered/asked/nu | operational-ro right/wrong/asked/nu |
| --- | --- | --- | --- | --- |
| rules-A | 33/1/29 | 25/0/8 | 343/0/141 | - |
| rules-C | 33/1/29 | 25/0/8 | 343/0/141 | 1883/239/71/287 (n=2480) |
| rules-WAveto | 39/1/23 | 27/0/6 | 343/0/141 | - |
| rules-WAchoose | 33/1/29 | 25/0/8 | 343/0/141 | - |
| rules-RDfill | 34/1/28 | 25/0/8 | 343/0/141 | - |
| rules-RDchoose | 34/1/28 | 27/0/6 | 343/0/141 | - |
| rules-WAchoose-RDchoose | 40/1/22 | 27/0/6 | 343/0/141 | - |
| rules-also | 33/1/29 | 25/0/8 | 343/0/141 | - |
| rules-suspect | 33/0/30 | 25/0/8 | 339/0/145 | - |
| rules-also-suspect | 33/0/30 | 25/0/8 | 340/0/144 | - |
| enc-C-segrules | 35/1/27 | 28/0/5 | 346/0/138 | - |
| enc-C | 42/1/20 | 28/0/5 | 350/0/134 | 1910/231/72/267 (n=2480) |
| enc-A | 44/1/18 | 27/0/6 | 348/0/136 | - |
| enc-B | 42/1/20 | 28/0/5 | 349/0/135 | - |
| enc-hybrid | 43/0/20 | 28/0/5 | 351/0/133 | - |
| enc-n1 | 44/1/18 | 28/0/5 | 353/0/131 | - |
| shipped | 45/0/18 | 28/0/5 | 353/0/131 | 1934/231/65/250 (n=2480) |
| enc-neural | 42/1/20 | 28/0/5 | 358/0/126 | - |
| enc-neural-n1 | 38/1/24 | 28/0/5 | 361/0/123 | - |
| enc-suspect | 42/0/21 | 28/0/5 | 350/0/134 | - |


Router experiment at world level (spec 20, 3,984 items; A = encoder top 3 validated by the rules, A1 = encoder top 1 alone, B = symbolic only, C = symbolic with the encoder as a prior; right / wrong / asked):

| set | n | A | A1 | B | C |
| --- | --- | --- | --- | --- | --- |
| operational | 1030 | 915 / 29 / 86 | 990 / 40 / 0 | 759 / 179 / 92 | 948 / 75 / 7 |
| minimal-pairs | 122 | 113 / 6 / 3 | 122 / 0 / 0 | 115 / 7 / 0 | 117 / 5 / 0 |
| knowledge | 190 | 105 / 36 / 49 | 102 / 88 / 0 | 130 / 42 / 18 | 113 / 71 / 6 |
| dialogues | 2241 | 1406 / 452 / 383 | 1628 / 613 / 0 | 1636 / 426 / 179 | 1785 / 430 / 26 |
| owner-log | 13 | 7 / 0 / 6 | 10 / 3 / 0 | 7 / 4 / 2 | 9 / 4 / 0 |
| wrong-tab | 188 | 121 / 38 / 29 | 130 / 58 / 0 | 73 / 78 / 37 | 109 / 69 / 10 |
| wrong-tab-ops | 200 | 141 / 37 / 22 | 181 / 19 / 0 | 94 / 64 / 42 | 159 / 37 / 4 |
| all | 3984 | 2808 (70.5 %) | 3163 (79.4 %) | 2814 (70.6 %) | 3240 (81.3 %) |

Router time per message (Node, in-process, without the encoder pass): A 39.5 ms (the validator), B 3.0 ms, C 5.2 ms. Since the first run of this experiment the cards grew and B went from 693 to 759 right on the operational set, C from 963 to 948 (A from 981 to 915: the validator asks more than it did, the rules reading changed under it; not investigated, A is not the default).

## 1. Segmentation: DistilBERT dispatcher segmentation against the rules' clause splitter (+ M1)

enc-C (model segmentation) against enc-C-segrules (the same pipeline, the model still ranks the worlds of each piece and the validator still checks, but the pieces come from `formalize` of the rules: clause splitter, expansions, ellipsis) and rules-C (no model at all):

| set | rules-C | enc-C-segrules | enc-C |
| --- | --- | --- | --- |
| operational (1296) | 1140 | 1140 | 1159 |
| dialogues (2241) | 2082 | 2072 | 2079 |
| typos (991) | 821 | 856 | 865 |
| owner-b answered (63) | 33 | 35 | 42 |
| ms per message | 38.9 | 111.6 | 165.2 |

The model segmentation is the whole of the encoder's operational advantage: 19 messages of 1296, and nothing on the dialogues, where the rules' own handling (M1 lists and continuations, ellipsis, the session) is as good. Its wins are multi-clause messages the rules do not cut: "draw a red house **and also** what do red and yellow make", "draw 2 trees, **also** how many legs does a spider have", "can you draw a star, **make it yellow**", "add 2 and 2 **then** tell me 10 minus 1". Its losses (67 rows against enc-C-segrules, but these are mostly world-ranking side effects, see section 2). Verdict: **keep for now as the only place the encoder earns its bytes, but replaceable**: the missing mechanism is a clause cutter driven by the cards (cut at a joiner when the right side starts with an action word or a question frame of any world). The prototype "also joins clauses like then" (flag `setProto({ also: true })` in `src/formalizer/rules/index.mjs`) recovers 3 of the 19 operational messages and a few typos, the rest need the world-switch cut; not done.

## 2. World choice: routers A, B, C

End to end, on the same pipeline (sets of the matrix above): enc-A 1157 / enc-B 1156 / enc-C 1159 right on operational, 2078 / 2076 / 2079 on dialogues, 288 / 284 / 289 on wrong-tab, 125 / 133 / 133 on knowledge: **the three routers are within 3 messages of each other once the rules read and validate**. At world level (table above) the picture is larger because the router alone does not have the rules' veto: A1 (the encoder alone) 79.4 %, C 81.3 %, A 70.5 %, B 70.6 %; B asks or errs on a third of the operational set when it must choose alone; C asks 7 times. The prior is worth 189 messages at world level on the operational set (759 to 948) and 5 on the wrong-tab end-to-end set (284 to 289); it costs nothing extra when the encoder runs anyway (one pass, shared with the segmentation). The encoder with no label for `talk` and `user.profile` loses 22 messages that rules-only gets right on the first six sets ("what is my name", "forget my name", "where do I live": the prior pulls them away from the untrained world) and wins 42 there. Verdict: **C is right when the encoder is on; B is enough when it is off** (rules-C = routing B without a prior: same numbers as the rules-A row, 4,975 against 4,978). Router A (the encoder proposes, the rules validate) adds nothing end to end and hurts the knowledge probes (125 against 133): **drop A as a default candidate, keep selectable for comparison**.

## 3. Reading: hybrid, rules only, model first

| strategy | right (all gold) | wrong | turns read by the NX model |
| --- | --- | --- | --- |
| rules only (enc-C) | 5,038 | 601 | 0 |
| hybrid (enc-hybrid, the shipped default) | 5,033 | 617 | **10 of 6,744 turns** |
| model first (enc-neural) | 4,912 | 737 | 1,778 |

The hybrid reader reads **10 turns** in the whole set; 6 are right (all in loose-words: "hint pls", "quit game plz", ...), 1 wrong, 3 answered in the no-gold sets (one of them nonsense: a Romanian "magar" sentence answered with "What should I draw? ... not playing hangman"). Against rules-only it rescues 6 rows and breaks 9 (8 of them the made-up-word probes of the knowledge set: "what is a blorp", "what is a zindle", "how many eyes does a thwippet have" go from the right "I do not know that word" to a wrong reading: the gate lets the NX heads through on a word they have never seen). Rescue classes of the 6: unknown word 1, phrasing 3, typo+unknown 2. **Model first** is 126 right fewer and 136 wrong more than rules only (dialogues 1,997 against 2,079, operational 1,119 against 1,159), as ADR-009 found; it is faster in Node (no validator rounds) but wrong more often. Could a symbolic mechanism rescue the same 6? The 6 are word-order salad of a one-world vocabulary ("hint another ok", "eyes shrink pls"); the library's loose-words best effort (on) already reads 338 of the 643 rows and the world-aware and READER-ROUTE readers (below) add 0 to 4 rows. Verdict: **drop the hybrid reading from the default** (`nxStrategy: 'rules'`): +1 right and 3 answered against 9 broken; no cost saving in bytes because the heads sit inside the dispatcher graph, but the reading logic and its gate can go. Keep `neural` only as a measured counter-example.

What the encoder as a whole rescues over rules only (enc-C against rules-C, 140 gained, 62 lost, over all sets with gold or answered):

| class of the gained rows | rows | would a general symbolic mechanism do it? |
| --- | --- | --- |
| typo (a word one slip from a known word, 39) + unknown word that is a near word (20) + both (8) | 67 | yes, near-word matching on the world vocabularies; prototype below recovers 14 to 18 of the typos set's 44 |
| multi-clause with a joiner the rules do not cut (4 labelled by the classifier, 14 more in the operational set that it labelled phrasing because "and / also / then" are function words) | about 18 | yes, a card-driven clause cutter (section 1) |
| phrasing: other (user.profile and Talk questions, "whats on the board", "Show me Paris", "umm, help?? idk") | about 55 | unknown; 22 of the lost rows are in the same family, the net is +35 |

## 4. Normalizer (T5-class, 97.0 MB): on against off

enc-n1 against enc-C (reading by rules only): +42 rows right, -9 (all gold sets and no-gold sets): typos 874 against 865, loose-words 344 against 325, paraphrases-rt 36 against 31, knowledge 128 against 133 (it rewrites made-up words: the same probes as the hybrid reader), dialogues 2,078 against 2,079, operational equal. Classes: phrasing 34 (word order of loose words: "april days how many" to a sentence, "title Our Trip pls", "sentences story how many"), unknown word 5, typo 3. In the shipped configuration (with the hybrid reader) the normalizer cancels the hybrid reader's damage on the knowledge set (132 against 125) and brings the typos set to 874. Cost: 97.0 MB (97 s at 1 MB/s), 175 ms to load in Node, about +20 ms per message on average (shipped 185 ms against enc-hybrid 163 ms; only the messages the rules could not read pay it). Total gain over the whole gold set: +28 right (0.5 point), concentrated in word-salad and misspelled input. Verdict: **keep as an optional, lazily loaded fallback; first model to drop on a phone profile**. Symbolic replacement to build: reordering of loose words from the card (a bag-of-words reading against the frames of the worlds: the 19 loose-word rescues are all one world's words in another order).

## 5. Translation: rules only against the on-device model

Romanian input, 2480 messages, operational-ro, English reply checked, no browser Translator (the phone situation):

| configuration | right | wrong | asked | not understood |
| --- | --- | --- | --- | --- |
| rules translation, rules reading (rules-C) | 1883 (75.9 %) | 239 | 71 | 287 |
| rules translation, encoder reading (enc-C) | 1910 (77.0 %) | 231 | 72 | 267 |
| rules translation, shipped reading | 1934 (78.0 %) | 231 | 65 | 250 |

The rules translator exists for Romanian only; every other language needs a machine translator (Bergamot: 5.2 MB engine + about 29.7 MB per language pair, MT-only reading 63.5 % of the Romanian set in the MT-SERIOUS run; M4 round trip with the model and the keep-list: ro 63.4 on the 216-case sample, see worker-log 2026-11-13). For completeness: the language-model path (M4 candidates chosen by understanding) is measured in `scripts/mt-roundtrip-m4.mjs` and was not repeated here (it needs the Bergamot cache). Verdict: **keep MT for every language without a rules pack; for Romanian the rules already read 75.9 % and the model is an optional extra, not a requirement**.

## 6. Act tagger (P3) as an alternative reader of schema worlds

Not measurable end to end: the three trained taggers (DistilBERT, MiniLM 6 x 384, MiniLM 4 x 384) were not kept as checkpoints in the repository or the runs directory, and no runtime reads them. From the recorded agreement run (`training/results/act-tagger-agreement.json`): the tagger's act agrees with the act of the generated-pattern reading in 72.2 % (DistilBERT), 69.1 % (6 x 384), 74.1 % (4 x 384) of the operational messages the shipped system answers right in the doing worlds (n = 162), 80.6 / 76.1 / 77.0 % over all 443 comparable messages; the generated patterns are the reference, so a tagger can at best equal them and reads one act and its roles, not wires. Cost: 19.3 to 67.0 MB. Verdict: **drop as a runtime reader**; keep the generator (`scripts/gen-act-tagger-data.mjs`) only as a way to propose acts for new schemas when a world is created (P2), where the symbolic act forms are already the gold.

## Symbolic mechanisms that exist and were switched on

The library already has two general symbolic readers, off by default (spec 16): world-aware reading (`PSYS2_WORLD_AWARE`) and READER-ROUTE (`PSYS2_READER`). Measured in rules-only mode:

| configuration | all gold right | wrong | notes |
| --- | --- | --- | --- |
| rules-C | 4,978 | 589 | |
| world-aware = veto | 4,982 | 588 | +4 |
| world-aware = choose | 4,979 | 586 | dialogues +4, wrong-tab -2 |
| READER-ROUTE = fill | 4,992 | 591 | typos +9, paraphrases +2 |
| READER-ROUTE = choose | 4,984 | 589 | |
| both = choose | 4,993 | 598 | knowledge 132 against 133, wrong +9 (made-up words) |

They recover 4 to 15 messages (about one sixth of the encoder's gain at best) and add no cost; READER-ROUTE fill is the best of them with no regression above 1. They are not the answer to the typo class alone.

## Prototypes built for the top rescue classes (flags, off by default)

1. **Suspect-word leniency** (`suspectWords: true`; `Session.suspect`, `_suspectWord` in `src/dialog/index.mjs`): a segment the rules read completely, but whose dry run is refused by the interpreter (not `supported`: "There is no paitn tab", "I do not know the price of hall", "I can't find 3 pencls ... on any of your lists"), and whose text holds a word no world knows that is one slip from a known word, is also tried spell-corrected, as an unparsed segment is; the correction is kept only when the rules read the corrected text completely. General: no word list, uses the existing spell vocabulary and the interpreter's own refusal as evidence. First version without the refusal gate: typos 821 to 850 (the encoder gets 865) but 17 regressions elsewhere (names such as "lee", dictated text, "nxt", "glimbus"); with the gate: typos 821 to 835, wrong 103 to 89, no regression on operational, dialogues or minimal pairs, knowledge 133 to 132.
2. **"also" as a clause joiner** (`setProto({ also: true })`, `splitClauses` and the swallowed-then test): operational 1140 to 1143, typos +8 (the typo "alos"), no loss.
3. Both: all gold right 4,978 to **4,999** (+21), wrong 589 to **575** (-14), asked/nu 183/334 to 181/329. The encoder alone (enc-C) gets +60, the shipped set +95, so the symbolic prototypes close about 35 % of the encoder's gain and 22 % of the whole model set's, with fewer wrong answers than any model configuration (575 against 589 to 617). With the encoder on, the suspect-word prototype adds nothing new (enc-suspect: typos 878 against 865, +13, others equal): the two mechanisms overlap.

What is left for the models after these: the multi-clause cuts that cross worlds (about 18 of the encoder's 140 gains), word-salad reordering (the normalizer's 33), and the 22-row family of "phrasing" where the encoder wins and loses on user.profile and Talk questions.

## The ledger groups (answered; no gold)

| ledger group | rows | rules-C | enc-C | enc-hybrid | enc-n1 | shipped | enc-neural | rules-also-suspect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Talk: no fact in the catalog / frame not read | 132 | 119 | 121 | 121 | 121 | 121 | 122 | 116 |
| continuation / correction / why-question | 64 | 39 | 39 | 39 | 40 | 40 | 41 | 39 |
| roundtrip: translation changed meaning | 52 | 22 | 23 | 24 | 23 | 24 | 24 | 22 |
| dialogue: other turn kinds | 43 | 25 | 26 | 26 | 26 | 25 | 29 | 25 |
| other / wrong result | 27 | 18 | 19 | 19 | 20 | 20 | 19 | 18 |
| roundtrip: translation kept meaning, reader gap | 25 | 17 | 18 | 18 | 18 | 18 | 18 | 17 |
| translation residue / wrong sense / source typo | 21 | 13 | 13 | 13 | 13 | 13 | 13 | 13 |
| amount / relation / set distribution | 19 | 14 | 14 | 14 | 15 | 15 | 14 | 14 |
| wrong world routing (confusion pair) | 17 | 17 | 17 | 17 | 17 | 17 | 17 | 17 |
| not understood (no cause key) | 14 | 5 | 6 | 6 | 6 | 6 | 6 | 5 |
| fragment / list split | 10 | 5 | 5 | 5 | 5 | 5 | 6 | 5 |
| roundtrip: English original not read | 9 | 6 | 6 | 6 | 6 | 6 | 6 | 6 |
| foreign-world reading | 8 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| region as a thing / ground replaced | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 |
| minimal pair (order) | 6 | 6 | 6 | 6 | 6 | 6 | 6 | 6 |
| unknown kind (no drawing / stand-in) | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| acted on a partly understood sentence | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| avatar part not an operation of the avatar world | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| default place | 3 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| session as content (about the discussion) | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| minimal pair (direction) | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| no reply | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| roundtrip: answer wording only | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| minimal pair (comparison) | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| coherence (contradiction) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| coherence (deduce) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| coherence (assumption-visible) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| coherence (default-revision) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |


The ledger is dominated by round-trip rows and Talk questions that need facts the repository catalog does not have; the models move 1 to 3 rows in each group (Talk 119 to 121, continuation 39 to 40, dialogue turn kinds 25 to 29 for model-first); the groups no model touches (wrong world routing 17 of 17 answered but wrong by construction, region, minimal pairs) are rule and data problems.

## Findings outside the ablation

- **F1. `facts.thing` is unbounded on the current online catalog.** With the sop-knowledge-worlds checkout b705b3c, `createFacts(...).thing('legs')` (and so "How many legs does a spider have?" on the Talk tab) allocates until the heap is gone (a worker thread died at 4 GB, the single process at 600 MB), after 8 earlier words that cost 20 to 50 ms. Profile: all the time in `thing` (`facts.mjs` line 140) and the line scans. The ablation used the repository copy of the catalog for every set because of this; the knowledge set therefore measures the repository copy. A budget (and a cap on the wires collected for one lemma) is needed before the online catalog is used with these messages.
- **F2. The NX gate lets made-up words through.** The 8 knowledge probes the hybrid reader and the normalizer break ("what is a blorp") are the reason both are net negative on the gold sets: neither has a "this word is unknown to every world" veto.
- **F3. Router A drifted** (operational right 981 to 915 since the first experiment); see the router section.

## Decision list

| model | bytes / cold load at 1 MB/s | delta in right answers (all gold) | verdict |
| --- | --- | --- | --- |
| DistilBERT dispatcher: segmentation | 68.3 MB / 68 s (shared with the next three) | +19 operational, +7 dialogues, +9 typos, +7 owner-b over rules-only | keep until a card-driven clause cutter exists (prototype partly built); then drop the model as segmenter |
| dispatcher world head (router A, C prior) | same file | A 0 and hurts knowledge; C prior +5 on wrong-tab, +20 at world level | C when the encoder is on, B (symbolic) when it is off; drop A |
| NX hybrid reader | inside the dispatcher graph (heads, no bytes saved) | +6 right, 9 broken, 10 turns read of 6,744 | drop (set `nxStrategy` rules) |
| NX model first | same | -126 right, +136 wrong | drop (keep selectable as a counter-example) |
| T5 normalizer | 97.0 MB / 97 s | +28 (typos +9, loose words +19, MT paraphrases +5, 9 broken) | optional lazy download; first model to drop on a phone profile |
| MT (Bergamot) | 5.2 MB + 29.7 MB per language pair | needed for every language without a rules pack; Romanian rules 75.9 % without it | keep for foreign languages only |
| act tagger P3 | 19.3 to 67.0 MB | not measurable (no checkpoint, no runtime); 72 to 74 % agreement with the generated patterns | drop as a runtime reader |
| library readers (world-aware, READER-ROUTE) | 0 | +1 to +15 | READER-ROUTE fill: candidate to switch on after a review |
| suspect-word leniency + "also" (this report) | 0 | +21 right, -14 wrong | candidate for the default, owner decision |
