# Statistics

187,553 messages; train 176,331, dev 7,496, test 3,726.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 77,621 | 3,287 | 1,641 | 82,549 |
| diagram | 70,560 | 2,992 | 1,494 | 75,046 |
| document | 11,568 | 498 | 242 | 12,308 |
| avatar | 8,904 | 368 | 190 | 9,462 |
| calendar | 7,678 | 351 | 159 | 8,188 |

## Source

| source | rows |
| --- | ---: |
| data-drop-v1 | 97,590 |
| demo-tool-profile | 33,297 |
| main-synthetic | 26,362 |
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
| 1 | 147,982 |
| 2 | 27,529 |
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
| make | 116,325 |
| change | 90,056 |
| answer | 11,339 |
| place | 9,401 |
| remove | 7,245 |
| arrange | 6,523 |
| connect | 4,069 |
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
| drawing.drawn | 109,763 |
| diagram.chart | 42,058 |
| diagram.node | 27,996 |
| diagram.diagram | 9,594 |
| drawing.page | 9,248 |
| avatar.part | 8,337 |
| diagram.link | 7,900 |
| calendar.meeting | 7,432 |
| document.section | 7,288 |
| drawing.part | 4,756 |
| document.text | 3,168 |
| document.block | 2,720 |
| diagram.group | 2,699 |
| diagram.page | 2,284 |
| drawing.group | 1,725 |
| calendar.calendar | 1,370 |
| avatar.face | 1,169 |
| diagram.point | 724 |
| diagram.series | 720 |
| diagram.sketch | 681 |
| calendar.room | 283 |
| document.document | 249 |
| document.inline | 136 |
| calendar.person | 121 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 79,780 |
| compound | 35,403 |
| drawing.object.make | 19,978 |
| avatar.part.change | 5,727 |
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
| on | 8,680 |
| below | 3,657 |
| in | 2,868 |
| above | 2,380 |
| behind | 2,262 |
| under | 1,972 |
| left_of | 1,717 |
| near | 1,566 |
| on top of | 1,550 |
| by | 1,431 |
| in front of | 1,095 |
| beside | 1,015 |
| right_of | 876 |
| between | 796 |
| along | 672 |
| over | 520 |
| left of | 479 |
| next_to | 420 |
| around | 404 |
| right of | 334 |
| aligned | 132 |
| even | 124 |
| in_front_of | 123 |
| touching | 107 |
| across | 104 |
| at | 98 |
| on each side of | 94 |
| mirrored | 90 |
| in the middle of | 86 |
| level with | 77 |
| to the right of | 73 |
| past | 69 |
| inside | 63 |
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
| outside | 2 |
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
| drawing.drawn.anchor | 47,626 |
| drawing.drawn.relation | 47,503 |
| drawing.drawn.size | 35,651 |
| drawing.drawn.colour | 29,945 |
| drawing.drawn.at | 15,873 |
| drawing.drawn.count | 12,730 |
| diagram.chart.type | 12,313 |
| drawing.drawn.facing | 9,973 |
| avatar.part.variant | 7,039 |
| diagram.node.label | 6,359 |
| drawing.drawn.pose | 5,990 |
| diagram.node.colour | 5,809 |
| calendar.meeting.day | 5,802 |
| document.section.content | 5,429 |
| diagram.chart.dimension | 4,959 |
| calendar.meeting.time | 4,656 |
| diagram.node.position | 4,451 |
| drawing.drawn.name | 4,444 |
| diagram.link.to | 4,161 |
| diagram.node.ids | 4,040 |
| diagram.link.from | 4,040 |
| calendar.meeting.title | 3,757 |
| calendar.meeting.length | 3,647 |
| drawing.drawn.direction | 3,545 |
| diagram.chart.labels | 3,531 |
| drawing.part.owner | 3,506 |
| calendar.meeting.calendar | 3,465 |
| drawing.drawn.expression | 3,348 |
| avatar.part.size | 2,821 |
| diagram.chart.title | 2,744 |
| diagram.diagram.kind | 2,388 |
| avatar.part.colour | 2,339 |
| diagram.chart.legend | 2,131 |
| diagram.chart.sort | 2,012 |
| drawing.drawn.label | 1,864 |
| diagram.chart.grid | 1,681 |
| drawing.drawn.ids | 1,660 |
| diagram.node.n | 1,615 |
| diagram.chart.show_values | 1,599 |
| diagram.node.size | 1,583 |
| avatar.part.id | 1,562 |
| diagram.node.anchor | 1,553 |
| diagram.chart.fontSize | 1,549 |
| diagram.node.x | 1,545 |
| diagram.chart.values | 1,509 |
| diagram.link.ids | 1,471 |
| drawing.drawn.kind | 1,450 |
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
| calendar.meeting.id | 1,038 |
| calendar.meeting.room | 1,007 |
| drawing.part.colour | 992 |
| … 223 more | 52,789 |

## Style (top 40)

| style | rows |
| --- | ---: |
| drop-equivalent | 65,533 |
| haiku-v2 | 17,506 |
| drop-complex | 16,721 |
| haiku-v1 | 14,706 |
| mechanical | 10,291 |
| drop-simplified | 8,556 |
| relation-natural | 6,744 |
| mechanical-trigger | 5,111 |
| mechanical-typo | 4,789 |
| drop-equivalent-robustness | 4,587 |
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
| … 55 more | 3,830 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 51 | 120 | 379 |
| words | 1 | 10 | 24 | 72 |
