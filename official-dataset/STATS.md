# Statistics

196,865 messages; train 185,107, dev 7,865, test 3,893.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 81,890 | 3,461 | 1,719 | 87,070 |
| diagram | 74,137 | 3,146 | 1,562 | 78,845 |
| document | 11,568 | 498 | 242 | 12,308 |
| avatar | 9,834 | 409 | 211 | 10,454 |
| calendar | 7,678 | 351 | 159 | 8,188 |

## Source

| source | rows |
| --- | ---: |
| data-drop-v1 | 106,901 |
| demo-tool-profile | 33,297 |
| main-synthetic | 26,363 |
| ui-diagram-v2 | 7,875 |
| ui-relations-v1 | 6,744 |
| ui-human-v1 | 5,001 |
| ui-coverage-v2 | 3,775 |
| ui-drawing-style-v1 | 2,238 |
| ui-natural-v1 | 1,788 |
| ui-comparatives-v1 | 940 |
| human-adapted-v1-drawing | 670 |
| human-adapted-v1-diagram | 610 |
| ui-features-v1 | 315 |
| ui-quantities-v1 | 216 |
| ui-diagram-v2-voice | 106 |
| ui-tiers-v1 | 26 |

## Requests per message

| requests | rows |
| --- | ---: |
| 1 | 155,911 |
| 2 | 28,912 |
| 3 | 4,497 |
| 4 | 2,311 |
| 6 | 1,952 |
| 5 | 1,847 |
| 0 | 660 |
| 7 | 501 |
| 8 | 274 |

## Act

| act | rows |
| --- | ---: |
| make | 119,770 |
| change | 93,106 |
| answer | 11,690 |
| place | 11,094 |
| arrange | 8,399 |
| remove | 7,421 |
| connect | 4,173 |
| undo | 2,168 |
| select | 1,877 |
| group | 1,201 |
| redo | 795 |
| copy | 514 |
| ungroup | 326 |
| reverse | 313 |
| merge | 135 |
| split | 126 |
| repeat | 7 |
| disconnect | 1 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 113,896 |
| diagram.chart | 42,058 |
| diagram.node | 31,915 |
| drawing.page | 9,955 |
| diagram.diagram | 9,868 |
| avatar.part | 8,338 |
| diagram.link | 8,003 |
| calendar.meeting | 7,432 |
| document.section | 7,288 |
| drawing.part | 4,756 |
| document.text | 3,168 |
| document.block | 2,720 |
| diagram.group | 2,699 |
| diagram.page | 2,377 |
| drawing.group | 1,725 |
| calendar.calendar | 1,370 |
| avatar.face | 1,169 |
| avatar.figure | 1,111 |
| diagram.point | 724 |
| diagram.series | 720 |
| diagram.sketch | 681 |
| drawing.preference | 306 |
| calendar.room | 283 |
| document.document | 249 |
| document.inline | 136 |
| calendar.person | 121 |
| diagram.preference | 48 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 87,708 |
| compound | 36,786 |
| drawing.object.make | 19,978 |
| avatar.part.change | 5,728 |
| drawing.object.change | 5,496 |
| document.block.change | 3,113 |
| diagram.node.change | 2,943 |
| calendar.meeting.add | 2,305 |
| diagram.node.make | 2,013 |
| avatar.part.add | 1,714 |
| drawing.catalog.make | 1,692 |
| diagram.link.change | 1,354 |
| calendar.meeting.move | 1,218 |
| document.write | 1,034 |
| chart.make | 936 |
| diagram.link.make | 823 |
| drawing.part.change | 733 |
| document.block.make | 673 |
| diagram.chart.change | 599 |
| calendar.meeting.change | 598 |
| drawn.observe | 516 |
| drawing.object.place | 489 |
| world-informed-completion | 432 |
| diagram.group.change | 411 |
| diagram.observe.node | 386 |
| calendar.meeting.remove | 384 |
| avatar.face.preset | 380 |
| document.block.mark | 362 |
| diagram.node.place | 361 |
| diagram.group.make | 355 |
| diagram.node.select | 332 |
| document.list.change | 310 |
| chart.change | 302 |
| document.section.change | 300 |
| document.section.remove | 287 |
| drawing.object.group | 284 |
| node.observe | 265 |
| document.section.mark | 259 |
| drawing.ids.show | 251 |
| drawing.group.change | 243 |
| diagram.links.connect | 240 |
| diagram.node.remove | 238 |
| diagram.chart.make | 235 |
| diagram.group.layout | 233 |
| diagram.node.layout | 229 |
| document.section.make | 218 |
| document.block.select | 211 |
| diagram.group.resize | 209 |
| diagram.link.select | 201 |
| avatar.part.feature | 201 |
| diagram.group.chart.make | 199 |
| diagram.ids.show | 198 |
| diagram.point.change | 189 |
| diagram.node.resize | 185 |
| drawing.drawn.size.delta | 185 |
| drawing.drawn.height.delta | 181 |
| document.list.make | 172 |
| calendar.event.add | 171 |
| document.table.make | 169 |
| diagram.selection.remove | 168 |
| … 101 more | 8,480 |

## Relation

| relation | rows |
| --- | ---: |
| next to | 10,229 |
| on | 9,577 |
| below | 4,122 |
| in | 3,132 |
| above | 2,832 |
| behind | 2,444 |
| under | 2,058 |
| near | 1,999 |
| left_of | 1,884 |
| next_to | 1,639 |
| on top of | 1,550 |
| by | 1,431 |
| in front of | 1,095 |
| right_of | 1,052 |
| beside | 1,015 |
| between | 971 |
| along | 763 |
| over | 520 |
| left of | 479 |
| around | 404 |
| right of | 334 |
| in_front_of | 210 |
| inside | 157 |
| aligned | 132 |
| even | 124 |
| touching | 107 |
| across | 104 |
| at | 98 |
| on each side of | 94 |
| outside | 90 |
| mirrored | 90 |
| in the middle of | 86 |
| level with | 77 |
| to the right of | 73 |
| past | 69 |
| level | 63 |
| same column | 62 |
| same shape | 53 |
| same row | 52 |
| row below | 49 |
| opposite | 46 |
| in line | 45 |
| away from | 42 |
| in line with | 40 |
| underneath | 38 |
| beneath | 38 |
| close to | 34 |
| to | 34 |
| at the bottom of | 31 |
| against | 30 |
| close | 30 |
| aligned with | 29 |
| facing | 28 |
| up_and_down | 28 |
| all_over | 28 |
| throughout | 28 |
| on either side of | 28 |
| settle on | 28 |
| row under | 28 |
| even with | 27 |
| both_sides | 27 |
| touches | 27 |
| below and to the left of | 25 |
| on every side of | 24 |
| closer | 24 |
| in place of | 24 |
| checkerboard | 24 |
| flush | 24 |
| at the top of | 21 |
| over the lake | 21 |
| closer to | 21 |
| swap | 20 |
| higher | 16 |
| corner | 16 |
| from | 13 |
| almost even with | 11 |
| up against | 11 |
| adjacent | 11 |
| east of | 11 |
| resting on | 11 |
| wrapped round | 10 |
| to the left of | 10 |
| immediately to the west of | 10 |
| on the west side of | 10 |
| sitting on | 10 |
| onto | 10 |
| off | 9 |
| down | 9 |
| next to the gate | 9 |
| clear of | 9 |
| directly beneath | 9 |
| on the left side of | 9 |
| to the west of | 8 |
| out of | 7 |
| lower | 7 |
| by the gate | 7 |
| beside the gate | 7 |
| around the gate | 7 |
| above the lake | 7 |
| middle | 6 |
| round every side of | 5 |
| into | 4 |
| left | 3 |
| right of it | 3 |
| left neighbour | 3 |
| to the left of the one added back | 3 |
| for | 3 |
| towards | 3 |
| nearest | 3 |
| right | 2 |
| left of it | 2 |
| to its right | 2 |
| to the left of it | 2 |
| round | 2 |
| up to | 2 |
| near side of | 2 |
| up | 2 |
| next to it | 1 |
| to the left | 1 |
| on the left | 1 |
| right-hand neighbour | 1 |
| just left of it | 1 |
| before the last one | 1 |
| on its left | 1 |
| on its right | 1 |
| to the right of it | 1 |
| between figure three and figure four | 1 |
| after the second figure | 1 |
| between the second and third | 1 |
| after the last one | 1 |
| between the first two figures | 1 |
| to its left | 1 |
| to the left of the figure deleted | 1 |
| right of the one that moved | 1 |
| to the right of the one we deleted | 1 |
| on the left of the figure that just moved | 1 |
| left of the restored one | 1 |
| to the right of the figure added back | 1 |
| just right of the one that moved | 1 |
| left of the one | 1 |
| beside it | 1 |
| immediately to the right of the one | 1 |
| left neighbour of the figure | 1 |
| right of the restored one | 1 |
| to the left of the restored one | 1 |
| previous | 1 |
| between the second and third slots | 1 |
| failed | 1 |
| other side of | 1 |
| in towards | 1 |
| up by | 1 |
| neighbour | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.anchor | 51,257 |
| drawing.drawn.relation | 50,959 |
| drawing.drawn.size | 35,803 |
| drawing.drawn.colour | 31,647 |
| drawing.drawn.at | 15,872 |
| drawing.drawn.count | 12,730 |
| diagram.chart.type | 12,313 |
| drawing.drawn.facing | 9,973 |
| diagram.node.ids | 8,896 |
| avatar.part.variant | 7,040 |
| diagram.node.label | 6,359 |
| drawing.drawn.pose | 5,990 |
| diagram.node.colour | 5,810 |
| calendar.meeting.day | 5,802 |
| document.section.content | 5,429 |
| diagram.chart.dimension | 4,959 |
| calendar.meeting.time | 4,656 |
| diagram.node.position | 4,619 |
| drawing.drawn.name | 4,444 |
| diagram.link.to | 4,264 |
| diagram.node.anchor | 4,215 |
| diagram.link.from | 4,143 |
| calendar.meeting.title | 3,757 |
| drawing.drawn.direction | 3,714 |
| calendar.meeting.length | 3,647 |
| diagram.chart.labels | 3,531 |
| drawing.part.owner | 3,506 |
| calendar.meeting.calendar | 3,465 |
| drawing.drawn.expression | 3,348 |
| avatar.part.size | 2,821 |
| diagram.chart.title | 2,744 |
| diagram.diagram.kind | 2,388 |
| avatar.part.colour | 2,339 |
| diagram.chart.legend | 2,150 |
| diagram.chart.sort | 2,012 |
| drawing.drawn.label | 1,863 |
| diagram.chart.grid | 1,700 |
| diagram.node.relation | 1,669 |
| drawing.drawn.ids | 1,660 |
| diagram.chart.show_values | 1,618 |
| drawing.part.colour | 1,617 |
| diagram.node.n | 1,615 |
| diagram.node.size | 1,583 |
| avatar.part.id | 1,562 |
| diagram.chart.fontSize | 1,549 |
| diagram.node.x | 1,545 |
| diagram.chart.values | 1,509 |
| diagram.link.ids | 1,471 |
| drawing.drawn.kind | 1,450 |
| drawing.preference.scope | 1,442 |
| document.block.id | 1,429 |
| diagram.group.id | 1,358 |
| diagram.chart.yLabel | 1,332 |
| diagram.chart.xLabel | 1,303 |
| drawing.drawn.width | 1,240 |
| calendar.calendar.name | 1,180 |
| diagram.node.y | 1,129 |
| document.text.about | 1,101 |
| document.text.title | 1,057 |
| document.text.words | 1,044 |
| … 225 more | 56,300 |

## Style (top 40)

| style | rows |
| --- | ---: |
| drop-equivalent | 70,690 |
| drop-complex | 19,838 |
| haiku-v2 | 17,506 |
| haiku-v1 | 14,706 |
| mechanical | 10,292 |
| drop-simplified | 9,326 |
| relation-natural | 6,744 |
| mechanical-trigger | 5,111 |
| drop-equivalent-robustness | 4,799 |
| mechanical-typo | 4,789 |
| human-equivalent | 2,904 |
| human-simplified | 2,397 |
| drop-simplified-fragment | 2,109 |
| direct | 1,770 |
| diagram-equivalent | 1,581 |
| coverage-equivalent | 1,570 |
| human-complex | 1,540 |
| coverage-simplified | 1,439 |
| diagram-simplified | 1,365 |
| diagram-complex | 1,301 |
| mechanical-orphan | 1,127 |
| coverage-complex | 1,107 |
| demo-tool-profile | 1,085 |
| human-adapted | 1,077 |
| mechanical-simplified | 968 |
| comparative-natural | 940 |
| mechanical-question | 686 |
| drawing-style-equivalent | 439 |
| diagram-equivalent-typo | 392 |
| drawing-style-complex | 387 |
| diagram-equivalent-asr | 369 |
| drawing-style-simplified | 369 |
| diagram-complex-typo | 362 |
| diagram-complex-asr | 305 |
| human-reorder | 291 |
| human-typo | 283 |
| human-syn | 272 |
| diagram-simplified-typo | 270 |
| mechanical-numberwords | 250 |
| diagram-equivalent-nospace | 224 |
| … 56 more | 3,885 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 52 | 120 | 379 |
| words | 1 | 10 | 24 | 72 |
