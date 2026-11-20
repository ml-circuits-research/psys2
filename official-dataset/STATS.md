# Statistics

97,992 messages; train 92,057, dev 3,963, test 1,972.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 35,574 | 1,562 | 766 | 37,902 |
| diagram | 28,333 | 1,184 | 615 | 30,132 |
| document | 11,568 | 498 | 242 | 12,308 |
| avatar | 8,904 | 368 | 190 | 9,462 |
| calendar | 7,678 | 351 | 159 | 8,188 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 33,297 |
| main-synthetic | 26,360 |
| data-drop-v1 | 10,269 |
| ui-diagram-v2 | 7,875 |
| ui-relations-v1 | 6,744 |
| ui-human-v1 | 5,001 |
| ui-coverage-v2 | 3,775 |
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
| 1 | 90,062 |
| 2 | 6,470 |
| 3 | 731 |
| 0 | 660 |
| 4 | 53 |
| 5 | 12 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 48,890 |
| change | 30,993 |
| answer | 6,727 |
| place | 6,344 |
| connect | 3,446 |
| remove | 3,250 |
| arrange | 2,109 |
| select | 1,724 |
| group | 650 |
| undo | 383 |
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
| drawing.drawn | 37,943 |
| diagram.node | 16,006 |
| avatar.part | 8,337 |
| calendar.meeting | 7,432 |
| document.section | 7,288 |
| diagram.chart | 6,479 |
| diagram.link | 5,253 |
| document.text | 3,168 |
| document.block | 2,720 |
| diagram.group | 2,078 |
| drawing.part | 1,620 |
| calendar.calendar | 1,370 |
| diagram.diagram | 1,189 |
| avatar.face | 1,169 |
| diagram.point | 750 |
| diagram.sketch | 681 |
| diagram.page | 441 |
| drawing.page | 408 |
| diagram.series | 351 |
| calendar.room | 283 |
| document.document | 249 |
| document.inline | 136 |
| calendar.person | 121 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 24,100 |
| drawing.object.make | 19,789 |
| avatar.part.change | 5,727 |
| drawing.object.change | 4,155 |
| compound | 3,762 |
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
| drawing.part.change | 377 |
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
| diagram.link.remove | 167 |
| … 99 more | 8,202 |

## Relation

| relation | rows |
| --- | ---: |
| below | 3,372 |
| left_of | 1,717 |
| in | 1,325 |
| near | 954 |
| right_of | 876 |
| above | 786 |
| on | 514 |
| by | 70 |
| next_to | 64 |
| next to | 40 |
| to | 35 |
| left of | 34 |
| beside | 28 |
| behind | 23 |
| under | 23 |
| between | 21 |
| over | 20 |
| in_front_of | 17 |
| along | 15 |
| around | 11 |
| off | 8 |
| out of | 7 |
| inside | 4 |
| in front of | 4 |
| close to | 4 |
| right of | 4 |
| into | 4 |
| away from | 3 |
| from | 3 |
| outside | 2 |
| up to | 2 |
| at | 2 |
| near side of | 2 |
| against | 2 |
| up | 2 |
| round | 1 |
| past | 1 |
| other side of | 1 |
| in towards | 1 |
| for | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.anchor | 10,007 |
| drawing.drawn.relation | 9,991 |
| avatar.part.variant | 7,039 |
| drawing.drawn.colour | 6,262 |
| calendar.meeting.day | 5,802 |
| document.section.content | 5,429 |
| diagram.node.colour | 5,347 |
| diagram.node.label | 4,983 |
| calendar.meeting.time | 4,656 |
| drawing.drawn.name | 4,416 |
| diagram.node.ids | 3,811 |
| calendar.meeting.title | 3,757 |
| diagram.link.to | 3,654 |
| calendar.meeting.length | 3,647 |
| diagram.link.from | 3,540 |
| calendar.meeting.calendar | 3,465 |
| drawing.drawn.size | 3,081 |
| diagram.chart.type | 2,971 |
| avatar.part.size | 2,821 |
| avatar.part.colour | 2,339 |
| diagram.chart.labels | 2,240 |
| drawing.drawn.ids | 1,570 |
| avatar.part.id | 1,562 |
| diagram.link.ids | 1,446 |
| document.block.id | 1,429 |
| diagram.group.id | 1,358 |
| drawing.drawn.width | 1,240 |
| diagram.chart.values | 1,211 |
| calendar.calendar.name | 1,180 |
| diagram.node.size | 1,177 |
| diagram.chart.title | 1,124 |
| document.text.about | 1,101 |
| document.text.title | 1,057 |
| document.text.words | 1,044 |
| calendar.meeting.id | 1,038 |
| calendar.meeting.room | 1,007 |
| document.text.content | 961 |
| drawing.drawn.height | 950 |
| diagram.node.n | 852 |
| drawing.part.owner | 844 |
| avatar.part.ids | 809 |
| document.section.id | 779 |
| diagram.node.position | 704 |
| drawing.drawn.label | 694 |
| drawing.part.index | 684 |
| document.block.name | 683 |
| diagram.node.anchor | 654 |
| drawing.drawn.x | 650 |
| drawing.drawn.y | 650 |
| drawing.part.id | 644 |
| drawing.drawn.at | 603 |
| diagram.point.value | 603 |
| diagram.diagram.layout | 593 |
| document.block.rows | 568 |
| drawing.drawn.kind | 566 |
| diagram.group.ids | 563 |
| document.block.level | 553 |
| document.block.text | 516 |
| diagram.group.label | 498 |
| diagram.node.x | 488 |
| … 157 more | 21,555 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 17,506 |
| haiku-v1 | 14,706 |
| mechanical | 10,290 |
| relation-natural | 6,744 |
| drop-equivalent | 6,075 |
| mechanical-trigger | 5,110 |
| mechanical-typo | 4,789 |
| human-equivalent | 2,904 |
| human-simplified | 2,397 |
| drop-complex | 2,043 |
| direct | 1,770 |
| diagram-equivalent | 1,581 |
| coverage-equivalent | 1,570 |
| human-complex | 1,540 |
| coverage-simplified | 1,439 |
| diagram-simplified | 1,365 |
| diagram-complex | 1,301 |
| drop-simplified | 1,295 |
| mechanical-orphan | 1,127 |
| coverage-complex | 1,107 |
| demo-tool-profile | 1,085 |
| human-adapted | 1,077 |
| mechanical-simplified | 968 |
| comparative-natural | 940 |
| drop-equivalent-robustness | 807 |
| mechanical-question | 686 |
| diagram-equivalent-typo | 392 |
| diagram-equivalent-asr | 369 |
| diagram-complex-typo | 362 |
| diagram-complex-asr | 305 |
| human-reorder | 291 |
| human-typo | 283 |
| human-syn | 272 |
| diagram-simplified-typo | 270 |
| mechanical-numberwords | 250 |
| diagram-equivalent-nospace | 224 |
| diagram-simplified-asr | 224 |
| diagram-equivalent-filler | 218 |
| structural-fill | 203 |
| diagram-simplified-filler | 196 |
| … 36 more | 1,911 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 40 | 87 | 268 |
| words | 1 | 8 | 16 | 50 |
