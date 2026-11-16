# Frozen auxiliary concept error ranking

Ranking only: no accuracy/precision/recall acceptance threshold has been declared. These are oracle-field-instance-conditioned candidate predictions, not independent concept output heads, graph accuracy or calibrated request confidence. Lower minimum defined positive precision/recall appears first; support and FP/FN remain visible. Zero-support keys are uncalibrated, not passed.

Checkpoint: `68ca1038ccca8932282aede8f430cf261655a8543ba21230ee531794676b4d08`.
Calibration data: `96b7cab1c22d0beb8b6ac6d7983f9b7dc323c0271268cbfc543171f88720f083`.
Calibration container: `b8dbe7285b3d4e2f1b9e0767dd22b1ebf62043980c25d4236a2c39ba35d12b46`.
Inventory: `5e5c4404d392774b6e4754a31988fc2ba943d90289e9a083a6e23ba6cba21832`.
Report script: `4bdb0a17f90bf6896ad9f0e5309ef4e950002c747e41031dd35e309b527eb8ee`.

| Rank | Concept | Pairs | Positive support | TP | FP | FN | Precision | Recall | Per-key FP/FN context |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | `sort` | 114 | 38 | 8 | 3 | 30 | 72.73% | 21.05% | `diagram.chart.sort` 3/30 (n=114) |
| 2 | `objection` | 177 | 59 | 22 | 14 | 37 | 61.11% | 37.29% | `conversation.turn.objection` 14/37 (n=177) |
| 3 | `not` | 87 | 29 | 15 | 9 | 14 | 62.50% | 51.72% | `request.logic.negated` 9/14 (n=87) |
| 4 | `toggle` | 272 | 99 | 65 | 16 | 34 | 80.25% | 65.66% | `diagram.chart.horizontal` 6/6 (n=69); `diagram.chart.legend` 1/9 (n=57); `diagram.chart.show_values` 6/1 (n=33); `diagram.chart.stacked` 0/9 (n=63); `document.inline.checked` 3/9 (n=50) |
| 5 | `free_search` | 102 | 34 | 24 | 0 | 10 | 100.00% | 70.59% | `calendar.meeting.free` 0/10 (n=102) |
| 6 | `heading_level` | 108 | 36 | 35 | 14 | 1 | 71.43% | 97.22% | `document.section.level` 14/1 (n=108) |
| 7 | `align` | 78 | 26 | 25 | 9 | 1 | 73.53% | 96.15% | `document.inline.align` 9/1 (n=78) |
| 8 | `fragment` | 333 | 111 | 99 | 35 | 12 | 73.88% | 89.19% | `conversation.turn.fragment` 35/12 (n=333) |
| 9 | `delta` | 126 | 42 | 37 | 12 | 5 | 75.51% | 88.10% | `calendar.meeting.shift` 12/5 (n=126) |
| 10 | `target.fill` | 9393 | 3131 | 2496 | 625 | 635 | 79.97% | 79.72% | `request.target.fill` 625/635 (n=9393) |
| 11 | `direction` | 120 | 40 | 32 | 1 | 8 | 96.97% | 80.00% | `drawing.drawn.direction` 1/8 (n=120) |
| 12 | `rotation` | 93 | 31 | 25 | 4 | 6 | 86.21% | 80.65% | `drawing.drawn.rotation` 4/6 (n=93) |
| 13 | `arrow` | 78 | 26 | 21 | 0 | 5 | 100.00% | 80.77% | `diagram.link.arrow` 0/5 (n=78) |
| 14 | `concept` | 1017 | 339 | 277 | 52 | 62 | 84.19% | 81.71% | `request.constraint.concept` 13/12 (n=348); `request.question.asked_key` 39/50 (n=669) |
| 15 | `group.operator` | 134 | 67 | 60 | 13 | 7 | 82.19% | 89.55% | `request.logic.group` 13/7 (n=134) |
| 16 | `scope` | 170 | 85 | 71 | 15 | 14 | 82.56% | 83.53% | `request.constraint.scope` 15/14 (n=170) |
| 17 | `flip` | 58 | 29 | 24 | 0 | 5 | 100.00% | 82.76% | `drawing.drawn.flip` 0/5 (n=58) |
| 18 | `area` | 72 | 24 | 20 | 4 | 4 | 83.33% | 83.33% | `conversation.turn.area` 4/4 (n=72) |
| 19 | `animation` | 96 | 32 | 27 | 5 | 5 | 84.38% | 84.38% | `drawing.face.animation` 5/5 (n=96) |
| 20 | `length` | 183 | 61 | 56 | 10 | 5 | 84.85% | 91.80% | `document.section.length` 1/1 (n=30); `document.text.length` 9/4 (n=153) |
| 21 | `ask` | 1809 | 603 | 520 | 47 | 83 | 91.71% | 86.24% | `request.question.ask` 47/83 (n=1809) |
| 22 | `target.mode` | 6000 | 2000 | 1891 | 279 | 109 | 87.14% | 94.55% | `request.target.mode` 279/109 (n=6000) |
| 23 | `region` | 348 | 116 | 108 | 15 | 8 | 87.80% | 93.10% | `diagram.node.at` 9/4 (n=189); `drawing.drawn.at` 6/4 (n=159) |
| 24 | `size` | 279 | 93 | 88 | 12 | 5 | 88.00% | 94.62% | `diagram.node.size` 2/1 (n=78); `drawing.drawn.size` 5/4 (n=126); `drawing.part.size` 5/0 (n=75) |
| 25 | `spatial_relation` | 495 | 165 | 146 | 10 | 19 | 93.59% | 88.48% | `diagram.node.position` 6/5 (n=141); `drawing.drawn.relation` 4/14 (n=354) |
| 26 | `format` | 192 | 64 | 63 | 8 | 1 | 88.73% | 98.44% | `document.inline.format` 8/1 (n=192) |
| 27 | `operator` | 7647 | 2549 | 2450 | 282 | 99 | 89.68% | 96.12% | `request.constraint.operator` 282/99 (n=7647) |
| 28 | `time` | 879 | 293 | 286 | 30 | 7 | 90.51% | 97.61% | `calendar.meeting.end` 4/0 (n=69); `calendar.meeting.time` 26/7 (n=810) |
| 29 | `recurrence` | 132 | 44 | 40 | 0 | 4 | 100.00% | 90.91% | `calendar.meeting.recurrence` 0/4 (n=132) |
| 30 | `list_kind` | 162 | 54 | 51 | 5 | 3 | 91.07% | 94.44% | `document.inline.list_kind` 5/3 (n=162) |
| 31 | `layout` | 237 | 79 | 72 | 5 | 7 | 93.51% | 91.14% | `diagram.diagram.layout` 5/7 (n=237) |
| 32 | `role` | 66 | 22 | 22 | 2 | 0 | 91.67% | 100.00% | `calendar.person.role` 2/0 (n=66) |
| 33 | `quant.kind` | 588 | 196 | 180 | 13 | 16 | 93.26% | 91.84% | `request.logic.quantifier` 13/16 (n=588) |
| 34 | `determiner` | 3542 | 1771 | 1669 | 138 | 102 | 92.36% | 94.24% | `request.target.determiner` 138/102 (n=3542) |
| 35 | `tone` | 396 | 132 | 122 | 10 | 10 | 92.42% | 92.42% | `document.text.tone` 10/10 (n=396) |
| 36 | `day` | 1458 | 486 | 480 | 38 | 6 | 92.66% | 98.77% | `calendar.meeting.day` 38/6 (n=1458) |
| 37 | `order_relation` | 213 | 71 | 66 | 4 | 5 | 94.29% | 92.96% | `document.section.order` 4/5 (n=213) |
| 38 | `phase` | 5098 | 2549 | 2386 | 175 | 163 | 93.17% | 93.61% | `request.constraint.phase` 175/163 (n=5098) |
| 39 | `line_style` | 252 | 84 | 84 | 6 | 0 | 93.33% | 100.00% | `diagram.link.style` 6/0 (n=252) |
| 40 | `act` | 11280 | 3760 | 3527 | 251 | 233 | 93.36% | 93.80% | `request.request.act` 251/233 (n=11280) |
| 41 | `step` | 495 | 165 | 156 | 11 | 9 | 93.41% | 94.55% | `request.constraint.step` 11/9 (n=495) |
| 42 | `fill` | 87 | 29 | 29 | 2 | 0 | 93.55% | 100.00% | `drawing.drawn.fill` 2/0 (n=87) |
| 43 | `quantity` | 87 | 29 | 29 | 2 | 0 | 93.55% | 100.00% | `calendar.room.seats` 1/0 (n=33); `diagram.chart.values` 1/0 (n=33); `diagram.node.value` 0/0 (n=21) |
| 44 | `count` | 705 | 235 | 229 | 15 | 6 | 93.85% | 97.45% | `conversation.turn.repeat_count` 4/2 (n=36); `diagram.diagram.links` 0/0 (n=48); `diagram.diagram.size` 0/0 (n=63); `document.section.count` 1/0 (n=45); `document.text.chapters` 0/0 (n=39); `drawing.drawn.count` 2/2 (n=93); `drawing.part.count` 0/1 (n=54); `request.target.count` 8/1 (n=327) |
| 45 | `mood_region` | 96 | 32 | 31 | 2 | 1 | 93.94% | 96.88% | `drawing.page.mood` 2/1 (n=96) |
| 46 | `duration` | 525 | 175 | 165 | 6 | 10 | 96.49% | 94.29% | `calendar.meeting.length` 6/10 (n=525) |
| 47 | `time_relation` | 114 | 38 | 36 | 2 | 2 | 94.74% | 94.74% | `calendar.meeting.relation` 2/2 (n=114) |
| 48 | `measure` | 531 | 177 | 168 | 4 | 9 | 97.67% | 94.92% | `document.inline.table_size` 2/5 (n=63); `document.section.words` 0/0 (n=39); `document.text.words` 0/1 (n=69); `drawing.drawn.distance` 0/0 (n=30); `request.constraint.measure` 2/3 (n=330) |
| 49 | `room_quality` | 120 | 40 | 38 | 1 | 2 | 97.44% | 95.00% | `calendar.room.quality` 1/2 (n=120) |
| 50 | `ordinal` | 294 | 98 | 97 | 5 | 1 | 95.10% | 98.98% | `request.target.ordinal` 5/1 (n=294) |
| 51 | `literal_text` | 204 | 68 | 67 | 3 | 1 | 95.71% | 98.53% | `calendar.meeting.agenda` 1/0 (n=33); `document.inline.link_target` 1/0 (n=45); `document.inline.task` 0/0 (n=51); `document.section.content` 1/1 (n=75) |
| 52 | `data_source` | 150 | 50 | 48 | 0 | 2 | 100.00% | 96.00% | `diagram.chart.source` 0/2 (n=150) |
| 53 | `colour` | 738 | 246 | 242 | 10 | 4 | 96.03% | 98.37% | `diagram.chart.palette` 0/2 (n=51); `diagram.group.colour` 0/0 (n=84); `diagram.link.colour` 3/0 (n=66); `diagram.node.colour` 1/0 (n=132); `drawing.drawn.colour` 3/2 (n=261); `drawing.face.colour` 1/0 (n=51); `drawing.page.background` 1/0 (n=60); `drawing.part.colour` 1/0 (n=33) |
| 54 | `unit` | 297 | 99 | 99 | 4 | 0 | 96.12% | 100.00% | `request.constraint.unit` 4/0 (n=297) |
| 55 | `part_kind` | 933 | 311 | 304 | 12 | 7 | 96.20% | 97.75% | `document.section.role` 9/7 (n=798); `drawing.face.feature` 2/0 (n=39); `drawing.part.part` 1/0 (n=96) |
| 56 | `parts_list` | 81 | 27 | 26 | 0 | 1 | 100.00% | 96.30% | `drawing.page.parts_named` 0/1 (n=81) |
| 57 | `mood` | 11280 | 3760 | 3639 | 136 | 121 | 96.40% | 96.78% | `request.request.mood` 136/121 (n=11280) |
| 58 | `polarity` | 5098 | 2549 | 2481 | 88 | 68 | 96.57% | 97.33% | `request.constraint.polarity` 88/68 (n=5098) |
| 59 | `layer` | 96 | 32 | 31 | 0 | 1 | 100.00% | 96.88% | `drawing.drawn.layer` 0/1 (n=96) |
| 60 | `variant` | 219 | 73 | 71 | 1 | 2 | 98.61% | 97.26% | `drawing.face.hair_style` 0/0 (n=114); `drawing.part.variant` 1/2 (n=105) |
| 61 | `reference` | 1218 | 406 | 403 | 11 | 3 | 97.34% | 99.26% | `calendar.meeting.relation_anchor` 3/1 (n=30); `calendar.meeting.room` 5/0 (n=249); `diagram.group.members` 0/0 (n=33); `diagram.link.from` 1/0 (n=186); `diagram.link.to` 0/0 (n=180); `diagram.node.anchor` 1/0 (n=135); `diagram.node.group` 0/2 (n=75); `document.section.order_anchor` 0/0 (n=42); `drawing.drawn.anchor` 1/0 (n=288) |
| 62 | `variety` | 117 | 39 | 38 | 0 | 1 | 100.00% | 97.44% | `request.constraint.variety` 0/1 (n=117) |
| 63 | `character` | 7647 | 2549 | 2519 | 64 | 30 | 97.52% | 98.82% | `request.constraint.character` 64/30 (n=7647) |
| 64 | `diagram_kind` | 123 | 41 | 40 | 1 | 1 | 97.56% | 97.56% | `diagram.diagram.kind` 1/1 (n=123) |
| 65 | `kind` | 7359 | 2453 | 2412 | 45 | 41 | 98.17% | 98.33% | `document.text.genre` 5/9 (n=342); `drawing.drawn.kind` 0/0 (n=0); `drawing.page.scene` 0/1 (n=60); `request.target.kind` 40/31 (n=6957) |
| 66 | `description` | 756 | 252 | 252 | 3 | 0 | 98.82% | 100.00% | `request.target.description` 3/0 (n=756) |
| 67 | `person` | 576 | 192 | 191 | 2 | 1 | 98.96% | 99.48% | `calendar.meeting.people` 2/0 (n=324); `calendar.person.name` 0/0 (n=45); `document.text.recipient` 0/1 (n=207) |
| 68 | `shape` | 324 | 108 | 108 | 1 | 0 | 99.08% | 100.00% | `diagram.node.shape` 1/0 (n=324) |
| 69 | `name` | 4743 | 1581 | 1580 | 12 | 1 | 99.25% | 99.94% | `calendar.meeting.title` 0/0 (n=189); `calendar.room.name` 2/0 (n=66); `diagram.chart.axis` 0/1 (n=63); `diagram.chart.labels` 1/0 (n=72); `diagram.chart.series` 0/0 (n=33); `diagram.diagram.title` 0/0 (n=87); `diagram.group.label` 2/0 (n=75); `diagram.link.label` 0/0 (n=42); `diagram.node.label` 0/0 (n=162); `document.text.title` 0/0 (n=51); `drawing.drawn.name` 1/0 (n=51); `drawing.face.name` 0/0 (n=117); `request.target.name` 6/0 (n=3735) |
| 70 | `expression` | 177 | 59 | 59 | 0 | 0 | 100.00% | 100.00% | `drawing.face.expression` 0/0 (n=177) |
| 71 | `style` | 90 | 30 | 30 | 0 | 0 | 100.00% | 100.00% | `drawing.face.preset` 0/0 (n=90) |
| 72 | `topic` | 402 | 134 | 134 | 0 | 0 | 100.00% | 100.00% | `document.text.about` 0/0 (n=402) |

Uncalibrated key support: `drawing.drawn.kind`.

This ranking prioritizes annotation/error inspection and broad concept-family data work. It does not identify individual failed sentences, establish a deployable threshold, or authorize excluding difficult rows. Quantized/browser metrics and functional-class outcomes remain separate.

Reproduce:

```sh
python3 training/sop-bert/report-bootstrap-weakness.py --calibration training/sop-bert/runs/owner-20261116/summary.json --inventory training/sop-bert/heads/inventory.json --run-manifest training/sop-bert/runs/owner-20261116/run-manifest.json --out ../.session-control/bootstrap-concept-errors.md
```
