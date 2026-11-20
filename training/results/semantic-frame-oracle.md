# Semantic-frame oracle study (2026-11-20)

What would execute if the reader produced the expected meaning perfectly, through three representations? This
separates representation and compiler gains from reader gains (`specs/semantic-frame.md` §7). No neural reader runs.
Every item runs on the real area host of the app route (authored request graphs through `routeNewEngine`, the same
seeding as `run-benchmark.mjs`) and is scored by the unchanged `score.py`, which is lenient, so these are upper bounds.

Inputs: `human-benchmark-v1` drawing (329) and diagram (333 scored + 45 setup turns), gold frames from
`training/sop-bert/frame/bench_to_frame.py`, deployed bindings `ba26132e…` (reader bundle `2794fa05…`), library
semantic-frame code at sopworld `3b15872`.

```
python3 training/sop-bert/frame/bench_to_frame.py items/<tab>.jsonl > <tab>.frames.jsonl
ORACLE_BINDINGS=<bindings.json> node training/sop-bert/frame/oracle.mjs <keys|strict|frame> items/<tab>.jsonl <tab>.frames.jsonl > <tab>.<mode>.out
python3 training/sop-bert/data/human-benchmark-v1/score.py items/<tab>.jsonl <tab>.<mode>.out <tab>.<mode>.scored
python3 training/sop-bert/frame/oracle-summary.py <dir> drawing diagram      # -> semantic-frame-oracle.json
```

| Mode | What it is |
| --- | --- |
| deployed | end-to-end with the deployed neural reader (`specs/human-utterance-benchmark.md` §4, reader `b8b1a4dd`) |
| keys | perfect reader of the official tool-key labels: a role with no inventory key is absent; a role whose key exists but has no deployed binding makes the bridge refuse the request; no fallback |
| strict | the gold frame admitted all-or-nothing: one unbound role refuses the whole reading; no fallback |
| frame | the gold frame with partial execution: bound roles execute, unbound roles are disclosed; a request the host refuses is retried (make placed, then change; without placement; theme alone; other declared kinds of an ambiguous head) |

## Results (pass / partial / fail)

| Tab | deployed | keys | strict | frame |
| --- | --- | --- | --- | --- |
| Drawing (329) | 36 (10.9%) / 16 | 102 (31.0%) / 11 / 216 | 91 (27.7%) / 6 / 232 | **145 (44.1%)** / 67 / 117 |
| Diagram (333) | 18 (5.4%) / 4 | 56 (16.8%) / 43 / 234 | 47 (14.1%) / 32 / 254 | **67 (20.1%)** / 44 / 222 |

Partial admission against all-or-nothing on the same frames: drawing +54 items (frame passes, strict does not; 0 the
other way), diagram +21 (1 the other way). Frame against perfect tool keys: drawing +43 / −0, diagram +11 / −0.
Items that pass while something was disclosed: drawing 53, diagram 30. The tool-key path refused 96 drawing and 29
diagram items for a key with no deployed binding (mostly `drawn.at`: regions).

Run-time fallbacks used by passing frame items: drawing 9 split (made with its placement, then its attributes changed:
the placement compiler takes relations and a count only) and 4 without placement; diagram 1 by another declared kind
of an ambiguous head ("arrow": a node shape rather than a line).

## What this says

1. **The reader is the largest loss.** A perfect key reader already gives 31% / 17% against 11% / 5% deployed, with the
   same bindings and compiler. A representation the reader can learn (about 25 shared roles in place of about 230 tool
   keys) matters, but this study cannot measure that part; it needs the training experiment.
2. **Partial admission is worth +13 to +16 points in drawing and +3 to +6 in diagram** with no reader change: frame 44.1%
   against strict 27.7% and keys 31.0%. Most of that can be applied to the current key route without frames (§5 of the
   spec): admit the consistent part, drop and disclose the rest, split placement from attributes.
3. **What still fails with a perfect reading is capability and declaration work, not representation.** Most frequent
   unbound roles: drawing — attributes without a declared property (95: facing, pose, expression), regions (58: no
   region placement is declared), kinds not in the catalog (53), goals (24); diagram — undeclared kinds (213, of which
   charts are about 200: chart kinds have no native family binding to `diagram.group.chart.make`), attributes (39),
   relations (10: no placement method for nodes), manner (10: no declared aesthetic objective), motion (8).

## Limits

- The gold frames are written from the benchmark's expected effects, with the reader's value banks for size words; the
  scorer checks kinds, counts, colour, region and relation loosely.
- The tool-key mode approximates the bridge from the declared inventory and bindings (it does not run the bridge on
  gold raw labels); a perfect key reader is assumed to cut coordinated themes into separate requests.
- The frame route is not wired into the app; the reader does not emit frames. No retraining was run: the GPU was
  training reader v8 during this work (`train-key-reader.py`, official-prepared-v8), so the warm-start frame-head
  experiment is the next run.
