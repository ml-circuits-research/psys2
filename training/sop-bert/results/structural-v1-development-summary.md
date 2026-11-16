# Frozen structural v1 development replay

Actual checkpoint `2891e4fd7a270cf1f3315da8c47e5aa570cf859dca53733ad06d6f11c4cd790d`, CUDA bfloat16, source text plus actual area/context only. No final holdout was read.

| Suite | Rows | Raw complete | Typed valid (including no-request) | Nonempty graph rows | No-effect replies |
|---|---:|---:|---:|---:|---:|
| matrix | 1648 | 1104 | 98 | 1 | 1648 |
| owner | 205 | 166 | 2 | 0 | 205 |

Typed validity is not semantic accuracy. The only nonempty graph lost the numeric requirement in “make sure the intro is under 100 words”, predicting an underspecified ask. It is not accepted as correct. All proposals remain non-executable; no confidence gate was manufactured.

The 97 matrix no-request proposals comprise **92 annotated empty-request matches and five false omissions of annotated requests**. The two owner no-request proposals remain unscored: those source rows have pending request annotations, not reviewed request arrays. These labels are joined only after frozen inference; they never enter model inputs. Thus there are at least six observed semantic proposal errors (five false no-request outputs plus the lost numeric requirement), despite zero app mutations under the closed gate. This is not a full semantic accuracy evaluation of the remaining proposals.

Class cells: raw-complete / nonempty typed graph / total rows. Classes overlap.

| Class | drawing | diagram | document | calendar |
|---|---|---|---|---|
| arrange / layout | 7/0/10 | 16/0/25 | 4/0/6 | 5/0/6 |
| check | 21/0/25 | 15/0/25 | 24/1/25 | 16/0/25 |
| connect / group | 9/0/17 | 16/0/25 | 8/0/12 | 4/0/6 |
| create | 13/0/25 | 15/0/25 | 18/0/25 | 18/0/25 |
| cross-area | 18/0/25 | 11/0/25 | 21/0/25 | 9/0/25 |
| follow-up, undo | 20/0/25 | 18/0/25 | 19/0/25 | 20/0/25 |
| move / place | 11/0/25 | 13/0/25 | 16/0/25 | 14/0/25 |
| no request | 24/0/25 | 25/0/25 | 24/0/25 | 22/0/25 |
| objection | 22/0/25 | 16/0/25 | 21/0/25 | 15/0/25 |
| propose | 18/0/25 | 16/0/25 | 19/0/25 | 12/0/25 |
| question | 23/0/25 | 20/0/25 | 20/0/25 | 20/0/25 |
| relative change | 15/0/25 | 17/0/25 | 18/0/25 | 16/0/25 |
| remove | 19/0/25 | 12/0/25 | 17/0/25 | 13/0/25 |
| select by description | 18/0/25 | 15/0/25 | 19/0/25 | 16/0/25 |
| set property | 17/0/25 | 15/0/25 | 16/0/25 | 16/0/25 |
| sets, or, not | 19/0/25 | 17/0/25 | 18/0/25 | 13/0/25 |
| several requests | 9/0/25 | 9/0/25 | 5/0/25 | 13/0/25 |
| soft wishes | 16/0/25 | 12/0/25 | 21/0/25 | 14/0/25 |

All 1,648 matrix rows produced actual model proposals and read-only router responses, including setup-incomplete rows; only 301 have complete native baseline setup. These proposal counts are not substituted into the baseline-eligible functional verdict table. Owner history was not reconstructed. Counts and overlapping diagnostics, immutable input/output hashes and per-cell no-effect/setup counters are in the JSON summary; full per-row evidence remains outside Git at the recorded hash.
