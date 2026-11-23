# Statistics

212,002 messages; train 199,271, dev 8,524, test 4,207.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 88,913 | 3,784 | 1,893 | 94,590 |
| diagram | 80,435 | 3,442 | 1,676 | 85,553 |
| document | 11,912 | 518 | 253 | 12,683 |
| avatar | 10,173 | 419 | 221 | 10,813 |
| calendar | 7,838 | 361 | 164 | 8,363 |

## Source

| source | rows |
| --- | ---: |
| data-drop-v1 | 116,846 |
| demo-tool-profile | 33,297 |
| main-synthetic | 26,362 |
| ui-diagram-v2 | 7,875 |
| ui-relations-v1 | 6,744 |
| ui-human-v1 | 5,001 |
| ui-systematic-v1 | 4,197 |
| ui-coverage-v2 | 3,775 |
| ui-drawing-style-v1 | 2,238 |
| ui-natural-v1 | 1,788 |
| ui-composition-v1 | 996 |
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
| 1 | 167,385 |
| 2 | 31,698 |
| 3 | 5,140 |
| 4 | 2,520 |
| 6 | 1,952 |
| 5 | 1,872 |
| 0 | 660 |
| 7 | 501 |
| 8 | 274 |

## Act

| act | rows |
| --- | ---: |
| make | 126,952 |
| change | 103,866 |
| answer | 11,796 |
| place | 11,258 |
| arrange | 8,528 |
| remove | 8,398 |
| connect | 4,390 |
| undo | 2,340 |
| select | 1,936 |
| group | 1,233 |
| redo | 799 |
| copy | 520 |
| ungroup | 349 |
| reverse | 316 |
| merge | 150 |
| split | 141 |
| set | 72 |
| repeat | 7 |
| disconnect | 1 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 124,257 |
| diagram.chart | 46,669 |
| diagram.node | 32,916 |
| drawing.page | 10,085 |
| diagram.diagram | 9,893 |
| diagram.link | 9,125 |
| avatar.part | 8,578 |
| calendar.meeting | 7,550 |
| document.section | 7,377 |
| drawing.part | 5,088 |
| document.text | 3,296 |
| document.block | 2,887 |
| diagram.group | 2,839 |
| diagram.page | 2,403 |
| drawing.group | 1,725 |
| calendar.calendar | 1,395 |
| avatar.face | 1,244 |
| avatar.figure | 1,150 |
| diagram.series | 907 |
| diagram.point | 751 |
| diagram.sketch | 685 |
| drawing.composition | 519 |
| diagram.composition | 405 |
| calendar.room | 316 |
| drawing.preference | 306 |
| document.document | 258 |
| diagram.preference | 139 |
| document.inline | 136 |
| calendar.person | 135 |
| avatar.preference | 18 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 94,104 |
| compound | 40,449 |
| drawing.object.make | 20,262 |
| drawing.object.change | 5,946 |
| avatar.part.change | 5,818 |
| diagram.node.change | 3,202 |
| document.block.change | 3,145 |
| calendar.meeting.add | 2,336 |
| diagram.node.make | 2,208 |
| drawing.catalog.make | 1,850 |
| avatar.part.add | 1,784 |
| diagram.link.change | 1,554 |
| calendar.meeting.move | 1,222 |
| document.write | 1,084 |
| chart.make | 997 |
| diagram.link.make | 933 |
| drawing.part.change | 834 |
| document.block.make | 692 |
| calendar.meeting.change | 650 |
| diagram.chart.change | 599 |
| drawing.compose | 519 |
| drawn.observe | 516 |
| drawing.object.place | 502 |
| diagram.compose | 477 |
| diagram.group.change | 450 |
| world-informed-completion | 432 |
| avatar.face.preset | 395 |
| chart.change | 394 |
| document.block.mark | 386 |
| diagram.observe.node | 386 |
| calendar.meeting.remove | 384 |
| diagram.node.place | 377 |
| diagram.group.make | 362 |
| diagram.node.select | 338 |
| document.section.change | 326 |
| document.list.change | 325 |
| drawing.object.group | 305 |
| document.section.remove | 290 |
| document.section.mark | 268 |
| node.observe | 265 |
| drawing.ids.show | 256 |
| document.section.make | 252 |
| diagram.group.layout | 250 |
| diagram.links.connect | 246 |
| diagram.node.remove | 245 |
| avatar.part.feature | 243 |
| drawing.group.change | 243 |
| diagram.node.layout | 242 |
| diagram.chart.make | 235 |
| diagram.group.chart.make | 225 |
| diagram.chart.format | 225 |
| document.block.select | 219 |
| diagram.group.resize | 214 |
| diagram.link.select | 205 |
| diagram.ids.show | 203 |
| diagram.node.resize | 199 |
| diagram.point.change | 189 |
| drawing.drawn.size.delta | 185 |
| calendar.event.add | 184 |
| document.list.make | 182 |
| … 148 more | 10,194 |

## Relation

| relation | rows |
| --- | ---: |
| next to | 10,461 |
| on | 9,588 |
| below | 4,230 |
| above | 3,165 |
| in | 3,156 |
| behind | 2,510 |
| under | 2,094 |
| on top of | 2,032 |
| near | 1,999 |
| left_of | 1,884 |
| next_to | 1,639 |
| by | 1,431 |
| between | 1,340 |
| beside | 1,262 |
| in front of | 1,122 |
| right_of | 1,052 |
| along | 855 |
| over | 593 |
| left of | 583 |
| right of | 577 |
| around | 468 |
| past | 305 |
| touching | 233 |
| in_front_of | 210 |
| swap | 207 |
| even | 206 |
| inside | 157 |
| aligned | 157 |
| to | 138 |
| across | 111 |
| against | 100 |
| at | 98 |
| on each side of | 94 |
| outside | 90 |
| mirrored | 90 |
| in the middle of | 86 |
| level with | 85 |
| away from | 78 |
| level | 74 |
| to the right of | 73 |
| clear of | 73 |
| opposite | 71 |
| from | 65 |
| same row | 64 |
| underneath | 63 |
| same column | 62 |
| west of | 55 |
| north of | 54 |
| close | 53 |
| same shape | 53 |
| east side of | 53 |
| at the top of | 51 |
| row below | 49 |
| both sides | 48 |
| of | 47 |
| even with | 46 |
| in line | 45 |
| in line with | 40 |
| in place of | 40 |
| beneath | 38 |
| close to | 34 |
| aligned with | 33 |
| west side of | 33 |
| at the bottom of | 31 |
| same as | 30 |
| facing | 28 |
| up_and_down | 28 |
| all_over | 28 |
| throughout | 28 |
| on either side of | 28 |
| settle on | 28 |
| row under | 28 |
| top right | 28 |
| bottom left | 28 |
| both_sides | 27 |
| touches | 27 |
| same count | 26 |
| below and to the left of | 25 |
| into | 25 |
| on every side of | 24 |
| east of | 24 |
| closer | 24 |
| checkerboard | 24 |
| flush | 24 |
| south side of | 24 |
| not touching | 24 |
| before | 24 |
| on the left side | 24 |
| next to each other | 24 |
| back | 24 |
| short of | 24 |
| northwest | 24 |
| lined up | 23 |
| third row | 23 |
| over the lake | 21 |
| closer to | 21 |
| in a row | 21 |
| up-east diagonal | 21 |
| gap | 20 |
| in the centre of | 18 |
| higher | 16 |
| corner | 16 |
| northeast | 12 |
| almost even with | 11 |
| up against | 11 |
| adjacent | 11 |
| resting on | 11 |
| north side of | 11 |
| wrapped round | 10 |
| to the left of | 10 |
| immediately to the west of | 10 |
| on the west side of | 10 |
| sitting on | 10 |
| onto | 10 |
| off | 9 |
| down | 9 |
| next to the gate | 9 |
| directly beneath | 9 |
| on the left side of | 9 |
| split | 9 |
| to the west of | 8 |
| out of | 7 |
| lower | 7 |
| by the gate | 7 |
| beside the gate | 7 |
| around the gate | 7 |
| above the lake | 7 |
| middle | 6 |
| apart | 6 |
| in order | 6 |
| round every side of | 5 |
| south of | 5 |
| flush with | 5 |
| in rows | 4 |
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
| standing | 2 |
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
| drawing.drawn.anchor | 55,536 |
| drawing.drawn.relation | 55,446 |
| drawing.drawn.colour | 37,792 |
| drawing.drawn.size | 35,891 |
| drawing.drawn.at | 18,120 |
| drawing.drawn.count | 15,472 |
| diagram.chart.type | 13,055 |
| drawing.drawn.facing | 10,080 |
| diagram.node.ids | 7,603 |
| avatar.part.variant | 7,150 |
| diagram.node.label | 6,527 |
| drawing.drawn.pose | 6,139 |
| diagram.node.colour | 5,891 |
| calendar.meeting.day | 5,870 |
| drawing.drawn.direction | 5,489 |
| document.section.content | 5,429 |
| diagram.chart.dimension | 5,351 |
| calendar.meeting.time | 4,724 |
| diagram.node.position | 4,669 |
| diagram.link.to | 4,531 |
| drawing.drawn.name | 4,476 |
| diagram.link.from | 4,398 |
| diagram.node.anchor | 4,274 |
| calendar.meeting.title | 3,823 |
| calendar.meeting.length | 3,711 |
| drawing.part.owner | 3,627 |
| diagram.chart.labels | 3,622 |
| drawing.drawn.expression | 3,564 |
| calendar.meeting.calendar | 3,486 |
| diagram.chart.title | 3,003 |
| avatar.part.size | 2,836 |
| diagram.chart.legend | 2,401 |
| diagram.diagram.kind | 2,388 |
| avatar.part.colour | 2,372 |
| diagram.chart.sort | 2,348 |
| drawing.drawn.ids | 1,953 |
| diagram.chart.grid | 1,921 |
| drawing.drawn.label | 1,894 |
| diagram.chart.id | 1,865 |
| diagram.chart.yLabel | 1,844 |
| drawing.drawn.distanceGrade | 1,789 |
| diagram.chart.show_values | 1,788 |
| drawing.part.colour | 1,762 |
| diagram.link.ids | 1,737 |
| diagram.chart.values | 1,707 |
| diagram.chart.fontSize | 1,694 |
| diagram.node.relation | 1,669 |
| avatar.part.id | 1,632 |
| diagram.node.n | 1,626 |
| diagram.node.size | 1,624 |
| diagram.node.x | 1,575 |
| diagram.chart.xLabel | 1,517 |
| document.block.id | 1,493 |
| drawing.drawn.kind | 1,457 |
| drawing.preference.scope | 1,442 |
| diagram.group.id | 1,432 |
| drawing.drawn.width | 1,297 |
| drawing.drawn.height | 1,294 |
| calendar.calendar.name | 1,198 |
| diagram.node.y | 1,164 |
| … 295 more | 65,930 |

## Style (top 40)

| style | rows |
| --- | ---: |
| drop-equivalent | 76,274 |
| drop-complex | 22,635 |
| haiku-v2 | 17,506 |
| haiku-v1 | 14,706 |
| mechanical | 10,291 |
| drop-simplified | 10,018 |
| relation-natural | 6,744 |
| drop-equivalent-robustness | 5,228 |
| mechanical-trigger | 5,111 |
| mechanical-typo | 4,789 |
| canonical | 4,197 |
| human-equivalent | 2,904 |
| drop-simplified-fragment | 2,552 |
| human-simplified | 2,397 |
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
| composition-placeholder | 996 |
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
| … 58 more | 4,359 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 52 | 122 | 379 |
| words | 1 | 10 | 25 | 74 |
