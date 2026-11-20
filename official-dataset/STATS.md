# Statistics

109,668 messages; train 103,028, dev 4,426, test 2,214.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 40,262 | 1,756 | 882 | 42,900 |
| diagram | 34,616 | 1,453 | 741 | 36,810 |
| document | 11,568 | 498 | 242 | 12,308 |
| avatar | 8,904 | 368 | 190 | 9,462 |
| calendar | 7,678 | 351 | 159 | 8,188 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 33,297 |
| main-synthetic | 26,362 |
| data-drop-v1 | 19,705 |
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
| 1 | 99,345 |
| 2 | 8,718 |
| 3 | 844 |
| 0 | 660 |
| 4 | 85 |
| 5 | 12 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 53,623 |
| change | 39,586 |
| answer | 7,062 |
| place | 6,609 |
| connect | 3,501 |
| remove | 3,418 |
| arrange | 2,148 |
| select | 1,756 |
| group | 650 |
| undo | 409 |
| ungroup | 326 |
| redo | 214 |
| merge | 111 |
| reverse | 108 |
| copy | 107 |
| split | 102 |
| repeat | 7 |
| disconnect | 1 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 42,642 |
| diagram.node | 17,497 |
| diagram.chart | 12,975 |
| avatar.part | 8,337 |
| calendar.meeting | 7,432 |
| document.section | 7,288 |
| diagram.link | 5,350 |
| document.text | 3,168 |
| document.block | 2,720 |
| diagram.group | 2,107 |
| drawing.part | 2,097 |
| calendar.calendar | 1,370 |
| diagram.diagram | 1,189 |
| avatar.face | 1,169 |
| diagram.page | 1,001 |
| diagram.point | 694 |
| diagram.sketch | 681 |
| drawing.page | 560 |
| diagram.series | 409 |
| calendar.room | 283 |
| drawing.group | 263 |
| document.document | 249 |
| document.inline | 136 |
| calendar.person | 121 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 31,143 |
| drawing.object.make | 19,978 |
| compound | 6,155 |
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
| below | 3,412 |
| left_of | 1,717 |
| in | 1,343 |
| near | 962 |
| right_of | 876 |
| above | 798 |
| on | 562 |
| under | 121 |
| by | 109 |
| behind | 105 |
| in front of | 89 |
| next to | 76 |
| next_to | 64 |
| left of | 62 |
| beside | 44 |
| to | 34 |
| over | 31 |
| right of | 30 |
| between | 21 |
| at the top of | 21 |
| in_front_of | 17 |
| along | 15 |
| around | 13 |
| underneath | 13 |
| off | 9 |
| out of | 7 |
| at the bottom of | 5 |
| inside | 4 |
| close to | 4 |
| into | 4 |
| away from | 3 |
| from | 3 |
| for | 3 |
| against | 3 |
| towards | 3 |
| nearest | 3 |
| outside | 2 |
| round | 2 |
| up to | 2 |
| at | 2 |
| near side of | 2 |
| up | 2 |
| past | 1 |
| other side of | 1 |
| in towards | 1 |
| on each side of | 1 |
| up by | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.anchor | 10,605 |
| drawing.drawn.relation | 10,592 |
| avatar.part.variant | 7,039 |
| drawing.drawn.colour | 6,394 |
| calendar.meeting.day | 5,802 |
| diagram.node.label | 5,517 |
| document.section.content | 5,429 |
| diagram.node.colour | 5,426 |
| calendar.meeting.time | 4,656 |
| diagram.chart.type | 4,617 |
| drawing.drawn.name | 4,444 |
| diagram.chart.dimension | 4,064 |
| diagram.node.ids | 4,040 |
| calendar.meeting.title | 3,757 |
| drawing.drawn.size | 3,691 |
| diagram.link.to | 3,684 |
| calendar.meeting.length | 3,647 |
| diagram.link.from | 3,566 |
| calendar.meeting.calendar | 3,465 |
| diagram.chart.labels | 2,938 |
| avatar.part.size | 2,821 |
| avatar.part.colour | 2,339 |
| drawing.drawn.ids | 1,660 |
| drawing.drawn.at | 1,589 |
| avatar.part.id | 1,562 |
| diagram.link.ids | 1,471 |
| diagram.chart.title | 1,456 |
| document.block.id | 1,429 |
| diagram.chart.values | 1,391 |
| diagram.group.id | 1,358 |
| drawing.drawn.width | 1,240 |
| diagram.node.size | 1,224 |
| drawing.part.owner | 1,213 |
| calendar.calendar.name | 1,180 |
| document.text.about | 1,101 |
| diagram.node.position | 1,071 |
| document.text.title | 1,057 |
| document.text.words | 1,044 |
| calendar.meeting.id | 1,038 |
| calendar.meeting.room | 1,007 |
| document.text.content | 961 |
| drawing.drawn.height | 950 |
| diagram.node.n | 906 |
| drawing.drawn.facing | 837 |
| avatar.part.ids | 809 |
| document.section.id | 779 |
| diagram.node.anchor | 779 |
| drawing.drawn.label | 755 |
| drawing.part.index | 684 |
| document.block.name | 683 |
| drawing.drawn.x | 650 |
| drawing.drawn.y | 650 |
| drawing.part.id | 644 |
| drawing.drawn.kind | 614 |
| diagram.diagram.layout | 593 |
| document.block.rows | 568 |
| diagram.group.ids | 563 |
| diagram.point.value | 559 |
| document.block.level | 553 |
| diagram.node.layout | 545 |
| … 217 more | 30,918 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 17,506 |
| haiku-v1 | 14,706 |
| drop-equivalent | 12,349 |
| mechanical | 10,291 |
| relation-natural | 6,744 |
| mechanical-trigger | 5,111 |
| mechanical-typo | 4,789 |
| drop-complex | 3,569 |
| human-equivalent | 2,904 |
| human-simplified | 2,397 |
| drop-simplified | 2,060 |
| direct | 1,770 |
| diagram-equivalent | 1,581 |
| drop-equivalent-robustness | 1,581 |
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
| diagram-simplified-asr | 224 |
| … 55 more | 3,668 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 41 | 88 | 268 |
| words | 1 | 8 | 16 | 51 |
