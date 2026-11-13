# ROUND-TRIP-MINING (2026-11-12)

What the round-trip failures are made of, and what we did about the English reading. Data: `round-trip-cases-2026-11-12.jsonl` (before; 9 languages x 216 cases = 1944 rows `{id, world, lang, original, foreign, back_translation, reading{reply, strategy, failing}, verdict, original_verdict, expect, class}`), `round-trip-cases-after-2026-11-12.jsonl` (the same translations read again after the fixes), `round-trip-handcheck-2026-11-12.jsonl` (the hand check). Scripts: `scripts/mt-roundtrip-cases.mjs`, `mt-roundtrip-classify.mjs`, `mt-roundtrip-build.mjs`. Models: Bergamot tiny models (MT-SERIOUS), reasoner matrix, rules reading.

## Classes

For every case whose verdict is not right:
- `original-fails`: the English original itself is not read right (8 to 9 of the 216 cases; the same cases in every language: multi-command mixes of two worlds, "go back one", "put me in the upper right corner", "Show the first result."). A gap of the world, not of the translation; counted apart.
- `mt-wrong`: the meaning did not come back. Mechanical checks (`mechanical()` in the classify script): numbers (digits and number words) equal, negation present in both, quoted and capitalised names kept, the command verb or question word of the original survives, a question stays a question, at least 75% of the original's content words survive, at most 34% new content words.
- `judge-strict`: every expectation of the state holds and only an answer substring differs while the reply is a confident answer (no "did not understand", "I took that as", "OK, ..."). The detector finds almost nothing, and the ones it finds are not judge problems on inspection (see below).
- `reader-gap`: all mechanical checks pass and we still do not read it.

## Shares per language (before the reading fixes)

| language | right before | right after | failures | mt-wrong | reader-gap | judge-strict | original-fails |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fr | 75% | 76.4% | 54 | 27 (50%) | 16 (29.6%) | 2 (3.7%) | 9 |
| it | 74.1% | 76.9% | 56 | 29 (51.8%) | 18 (32.1%) | 1 (1.8%) | 8 |
| nb | 72.7% | 74.5% | 59 | 34 (57.6%) | 17 (28.8%) | 0 (0%) | 8 |
| de | 72.7% | 74.5% | 59 | 32 (54.2%) | 15 (25.4%) | 3 (5.1%) | 9 |
| nl | 71.8% | 76.9% | 61 | 24 (39.3%) | 24 (39.3%) | 4 (6.6%) | 9 |
| is | 71.8% | 75.9% | 61 | 35 (57.4%) | 16 (26.2%) | 1 (1.6%) | 9 |
| bg | 71.3% | 74.1% | 62 | 34 (54.8%) | 18 (29%) | 2 (3.2%) | 8 |
| es | 70.4% | 71.8% | 64 | 37 (57.8%) | 15 (23.4%) | 4 (6.3%) | 8 |
| ro | 61.1% | 63.4% | 84 | 49 (58.3%) | 25 (29.8%) | 2 (2.4%) | 8 |
| total | | | 560 | 301 (53.8%) | 164 (29.3%) | 19 (3.4%) | 76 (13.6%) |

The shares are of the failures. English reads the 216 originals 95.8% right and still does (operational set, matrix: 95.4% right, 0.7% wrong, per-case outcomes identical before and after).

## Hand check (40 cases)

The first 40 French failures, in file order, labelled by reading the original and the back-translation: `round-trip-handcheck-2026-11-12.jsonl` (`hand` against `mechanical`). The classifier agrees with the hand label on 25 of 40 (62%). The 15 disagreements are all the same kind: the mechanical check says "same meaning" where a human sees a changed meaning that keeps most words ("What do red and yellow do" for "make", "Move the house upsides", "New table" for "chart", "What is the C E G" for "what chord is C E G", "min" for "minus" which the reader then takes as minutes: "It will be 8:20."). So the reader-gap share above is an upper bound; from the hand check about 10 of 40 failures (25%) are true reader gaps, 29 of 40 (72%) true mt-wrong, and none is a judge problem. The model is the bottleneck: it drops the verb or the question ("A house is a house" for "Draw a house"), changes a content word to a synonym that the world does not know ("siren" to "mermaid", "chart" to "table", "sharps" to "points", "antenna" to "around"), or turns a currency into a word ("5 lei" to "5 rents", "5 sorry"; ro `lei` is the commonest casualty).

## judge-strict

No judge change. The 19 flagged rows are reader failures (a part of a multi-question message not read, "min" read as minutes, "relative minor of C minor" which is a model error), not cases where we read it right and the judge compares UI words. The judge (`scripts/lib/operational-check.mjs`) compares answer substrings of the reply and the state of the world; across 1944 reads there was no case of a right reading with a wrong UI word.

## What was fixed in the English reading (general means)

- `src/formalizer/rules/variants.mjs` (spec 03 section 4.9 item 6): token rewrites tried only when a sentence is not read as typed and only to a word some world knows: gerund or pronoun-plus-verb lead as an imperative ("Wearing a hat", "Drawing a house", "Adding a sun", "Clearing my shopping list", "Going back", "He draws two houses", "It reminds me to call Grandma", "They make it a line chart"), "will come" as "comes" ("What day will come after Thursday"), "the color of the body" as "the body color", diacritics of names (Zoe with a diaeresis), "add the sun" as "add a sun"; before reading: "make ... in bold / in italics" as "bold / italic". No phrase list, 100 lines.
- `worlds/kids.animals/patterns.sop`: the sound question accepts the verb before the animal ("what sound makes a cow", "what noise makes a duck"): one alternative in an existing group.
- `worlds/kids.shop/patterns.sop`: the currency word of "A kite costs 4" is optional (the currency is the commonest word lost in a round trip).
- Tests: `tests/reading-variants.test.mjs`, `kids.animals` rt1 rt2, `kids.shop` rt1.
- `describe.sop` and `lang.common` were not changed: the default reasoner reads `patterns.sop`; `describe.sop` is read only with `PSYS_GEN_PATTERNS`. The size gate is respected (no line added to any `describe.sop`).

Gate: operational set (matrix, rules mode) right 95.4% / partly 1.7% / wrong 0.7% before and after, identical per case; the rest of the gates are in the worker log.

## Numbers, before and after (round trip, 216-case sample, same translations)

Right: fr 75.0 to 76.4, it 74.1 to 76.9, nb 72.7 to 74.5, de 72.7 to 74.5, nl 71.8 to 76.9, is 71.8 to 75.9, bg 71.3 to 74.1, es 70.4 to 71.8, ro 61.1 to 63.4 (+1.4 to +5.1 points). The language selector stays "beta" for every engine language; `quality.json` was not regenerated here (it needs all 54 languages; the 9 measured above improve).

## Data produced

- `training/eval/paraphrases-rt-2026-11-12.jsonl`: 146 English paraphrases (deduplicated by world, text and expectation, English only, gold = the original case's expectation; `langs` lists the languages that produced the text). Because `reader-gap` is an upper bound, part of the gold is wrong for the text (the model changed the meaning); today the rules read 17.1% right (0% before the fixes, by construction), 11.6% partly, 21.9% wrong, 49.3% not understood. Use it as a to-do list and a regression target, not as a pass rate.
- `training/paraphrases/out/mt-roundtrip.jsonl`: 223 rows in the format of `scripts/collect-paraphrases.mjs` (77 originals as canonicals, 146 variants, `source='mt-roundtrip:<lang>'` on the variants, `source='mt-roundtrip:original'` on the canonicals). 114 variant rows carry an expected circuit (label_status counts of the 146 variants: rules-agree 31, rules-own 28, rules-fail 60 (the canonical's target inherited through the value match, when it applies), rules-differ 1, rules-unverified 2, needs_review 24; rows without a circuit are kept for review, not for training). Not retrained here.

## Next steps 2 and 3 (2026-11-13)

**Step 2, the 9 "original-fails" cases (all fixed; English originals now 216/216 right on the sample).** General means, specified in spec 03 section 1c: (a) a clause that opens with a question word after `and`/`then`/`,` is its own clause, not the free text of the command before it ("draw 2 trees then what sound does a cow make", "add milk to my shopping list and also can penguins fly"; the `kids.tasks` two-list pattern now requires its preposition); (b) a command of another world after a connective that is read mostly by fixed words ("play twinkle twinkle and draw a house"); (c) two neighbouring clauses cut inside one question are read again as one ("what do red and yellow make"). World gaps: `ui.avatar` undo accepts "go back one", `games.tictactoe` accepts "put me in ...", `docs.reader` keeps the counted sentences as the search ("count the witch", "show the first result"). Tests: `tests/compound-messages.test.mjs`. Gate (operational set, matrix, rules mode): right 95.3% to 97.1%, the set of wrong cases identical (10 before and after).

**Step 3, MT keep-list** (`src/translate/keep-list.mjs`, spec 05): currency (`keep=verbatim` lexicon), names (class `name`, capitalised), song titles, "the <tab> tab", names told in the session; placeholders around the model (`Zorqa`...). Same 216-case sample, same reading, 9 languages (`round-trip-cases-keep-2026-11-13.jsonl` = with keep-list; the baseline is the 2026-11-12 translations read with the new reading):

| language | 11-12 | baseline, new reading | with keep-list |
| --- | --- | --- | --- |
| fr | 75.0 | 77.3 | 78.2 |
| it | 74.1 | 78.2 | 79.2 |
| nb | 72.7 | 76.4 | 77.8 |
| de | 72.7 | 76.4 | 76.9 |
| nl | 71.8 | 79.2 | 80.1 |
| is | 71.8 | 77.3 | 78.7 |
| bg | 71.3 | 75.5 | 75.9 |
| es | 70.4 | 73.1 | 74.1 |
| ro | 61.1 | 64.4 | 65.7 |

The keep-list adds +19 right cases over 1944 (23 verdict flips: 21 gained, 2 lost: "4 lei" read back as "leis", "Tom gives" turned into "Tom provides" when a name is a placeholder). The moved classes: mt-wrong -1 to -3 per language (it 30 to 28, de 32 to 30, ro 51 to 48), reader-gap -1 to -3 (nb, is, nl). What it fixes: the currency ("5 lei" to "5 rents / 5 sorry / 5 her / 14 slates"), song titles ("twinkle twinkle" to "sparkle sparkle"), a name ("Zoe" to "Zoë", "Ana" to "Anah"). Caveat: for tab names the round trip is optimistic (a real user writes the localized label; the English-word protection only helps who types the English word). The reading fixes of step 2 account for most of the gain over 11-12 (+2.3 to +7.4 points, mostly the 9 original-fails and the question-after-connective cases that every language shares). `quality.json` updated for these 9 languages (the other languages keep their 11-12 numbers; they were not re-measured).
