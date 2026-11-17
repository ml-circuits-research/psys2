# Frozen per-key reader: five-epoch calibration

Best epoch 5; 21,100 updates. Conditional mention F1 77.0439%. Partial BIO/global subset exact 1153/3841; positive-BIO subset 1029/3603. Neither is full raw request, metadata or canonical graph exact. Actual predicted-cutter pipeline evaluation and whole-graph calibration remain separate gates.

All 134 key counters, present/absent/unknown class supports, gold-mention metadata counts and immutable source/model hashes are in `reports/key-reader-final.json`. Rankings below describe error concentration; no acceptance gate was declared.

| Role | TP | FP | FN |
|---|---:|---:|---:|
| domain | 3530 | 1612 | 536 |
| global | 4414 | 1693 | 893 |

Domain mention heads ranked by F1, among keys with positive calibration support (lowest twenty):

| Key | TP | FP | FN | Precision | Recall |
|---|---:|---:|---:|---:|---:|
| diagram.diagram.links | 2 | 18 | 15 | 0.100 | 0.118 |
| diagram.chart.show_values | 2 | 7 | 0 | 0.222 | 1.000 |
| document.section.content | 13 | 30 | 12 | 0.302 | 0.520 |
| diagram.group.members | 7 | 15 | 4 | 0.318 | 0.636 |
| calendar.meeting.title | 37 | 74 | 26 | 0.333 | 0.587 |
| diagram.chart.values | 7 | 13 | 4 | 0.350 | 0.636 |
| calendar.meeting.end | 12 | 18 | 11 | 0.400 | 0.522 |
| calendar.person.name | 13 | 25 | 2 | 0.342 | 0.867 |
| document.section.role | 90 | 135 | 38 | 0.400 | 0.703 |
| drawing.part.part | 19 | 32 | 3 | 0.373 | 0.864 |
| diagram.chart.palette | 10 | 11 | 7 | 0.476 | 0.588 |
| drawing.page.parts_named | 17 | 21 | 5 | 0.447 | 0.773 |
| calendar.meeting.relation_anchor | 8 | 10 | 2 | 0.444 | 0.800 |
| diagram.chart.labels | 12 | 10 | 8 | 0.545 | 0.600 |
| diagram.chart.sort | 17 | 17 | 8 | 0.500 | 0.680 |
| document.section.length | 9 | 11 | 2 | 0.450 | 0.818 |
| diagram.diagram.size | 15 | 14 | 6 | 0.517 | 0.714 |
| document.text.title | 11 | 8 | 6 | 0.579 | 0.647 |
| document.text.about | 90 | 70 | 44 | 0.562 | 0.672 |
| diagram.chart.legend | 13 | 14 | 2 | 0.481 | 0.867 |

All global mention heads (some semantic closed decisions have no literal source anchor; masked tokens are not negatives):

| Key | TP | FP | FN | Present class correct/support | Absent class correct/support |
|---|---:|---:|---:|---:|---:|
| conversation.turn.fragment | 9 | 28 | 1 | 57/111 | 3673/3730 |
| request.target.description | 152 | 124 | 100 | 0/0 | 0/0 |
| request.target.name | 956 | 577 | 283 | 0/0 | 0/0 |
| request.target.count | 44 | 33 | 1 | 0/0 | 0/0 |
| request.target.kind | 907 | 406 | 110 | 0/0 | 0/0 |
| request.target.ordinal | 83 | 40 | 4 | 69/98 | 3720/3743 |
| request.request.act | 1778 | 415 | 387 | 3390/3760 | 77/81 |
| conversation.turn.repeat_count | 7 | 3 | 0 | 0/0 | 0/0 |
| request.target.fill | 18 | 5 | 2 | 2099/2801 | 656/710 |
| request.logic.quantifier | 133 | 38 | 1 | 130/167 | 3582/3645 |
| conversation.turn.area | 14 | 2 | 0 | 16/24 | 2055/2057 |
| request.question.ask | 219 | 21 | 1 | 468/603 | 3210/3238 |
| request.request.mood | 71 | 1 | 3 | 3611/3760 | 77/81 |
| request.target.mode | 23 | 0 | 0 | 2237/2330 | 77/81 |
| conversation.turn.objection | 0 | 0 | 0 | 11/59 | 2019/2022 |
| request.question.asked_key | 0 | 0 | 0 | 0/0 | 0/0 |
| request.target.determiner | 0 | 0 | 0 | 1587/1771 | 255/310 |

Metadata class accuracy is gold-mention conditioned, not predicted end-to-end metadata accuracy:

| Head | Present correct/support | Unknown correct/support | Absent correct/support |
|---|---:|---:|---:|
| request.constraint.operator | 2290/2418 | 0/0 | 3696/3696 |
| request.constraint.phase | 2280/2418 | 0/0 | 3695/3696 |
| request.constraint.polarity | 2342/2418 | 0/0 | 3695/3696 |
| request.constraint.character | 2371/2418 | 0/0 | 3695/3696 |
| request.constraint.scope | 39/73 | 0/0 | 6001/6041 |
| request.constraint.step | 15/25 | 0/0 | 6068/6089 |
| request.constraint.variety | 14/18 | 0/0 | 6091/6096 |
| request.logic.group | 17/66 | 0/0 | 6038/6048 |

Domain heads with no positive CAL mention support (absence-only evidence, not learned competence): `drawing.drawn.kind` (FP 2).

Coverage remains partial: independent target.type is absent from the inventory; unit/measure normalization, direct concept/negated output and undeclared nonidentity normalization stay unresolved. The separate versioned target-type candidate was not trained in this run. One TRAIN row was truncated and BIO-masked; zero CAL rows truncated. No weights were copied after the first-epoch freeze; final checkpoint is the existing atomic best.

Precision boundary: decoded/per-key calibration evaluated the live FP32 parameter state without autocast; the aggregate token pass used BF16 autocast over live FP32 parameters. Saving then compacted floating weights to BF16. The verified checkpoint hashes establish artifact identity, not parity with those calibration predictions. Actual frozen BF16-roundtrip/backend accuracy, argmax and complete-packet parity remain unmeasured; no saved-artifact accuracy or graph confidence is inherited. No extra evaluation was run for this clarification.
