# Statistics

93,538 messages; train 87,887, dev 3,777, test 1,874.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 34,675 | 1,521 | 749 | 36,945 |
| diagram | 25,062 | 1,039 | 534 | 26,635 |
| document | 11,568 | 498 | 242 | 12,308 |
| avatar | 8,904 | 368 | 190 | 9,462 |
| calendar | 7,678 | 351 | 159 | 8,188 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 33,297 |
| main-synthetic | 26,362 |
| ui-diagram-v2 | 7,873 |
| ui-relations-v1 | 6,744 |
| data-drop-v1 | 5,815 |
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
| 1 | 86,035 |
| 2 | 6,106 |
| 3 | 683 |
| 0 | 660 |
| 4 | 39 |
| 5 | 11 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 46,627 |
| change | 29,234 |
| answer | 6,718 |
| place | 5,849 |
| connect | 3,290 |
| remove | 3,216 |
| arrange | 2,011 |
| select | 1,705 |
| group | 639 |
| undo | 357 |
| ungroup | 329 |
| redo | 213 |
| reverse | 105 |
| merge | 83 |
| copy | 76 |
| split | 72 |
| repeat | 7 |
| disconnect | 1 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 36,873 |
| diagram.node | 14,272 |
| avatar.part | 8,337 |
| calendar.meeting | 7,432 |
| document.section | 7,288 |
| diagram.link | 5,125 |
| diagram.chart | 4,691 |
| document.text | 3,168 |
| document.block | 2,720 |
| diagram.group | 2,083 |
| drawing.part | 1,610 |
| calendar.calendar | 1,370 |
| avatar.face | 1,169 |
| diagram.diagram | 1,137 |
| diagram.point | 752 |
| diagram.sketch | 665 |
| drawing.page | 386 |
| diagram.series | 348 |
| diagram.page | 297 |
| calendar.room | 283 |
| document.document | 249 |
| document.inline | 136 |
| calendar.person | 121 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 20,074 |
| drawing.object.make | 19,791 |
| avatar.part.change | 5,727 |
| drawing.object.change | 4,155 |
| compound | 3,335 |
| document.block.change | 3,113 |
| diagram.node.change | 2,963 |
| calendar.meeting.add | 2,305 |
| diagram.node.make | 1,997 |
| avatar.part.add | 1,714 |
| drawing.catalog.make | 1,692 |
| diagram.link.change | 1,349 |
| calendar.meeting.move | 1,218 |
| document.write | 1,034 |
| chart.make | 936 |
| diagram.link.make | 825 |
| document.block.make | 673 |
| diagram.chart.change | 599 |
| calendar.meeting.change | 598 |
| drawn.observe | 516 |
| drawing.object.place | 489 |
| world-informed-completion | 432 |
| diagram.group.change | 411 |
| diagram.observe.node | 392 |
| calendar.meeting.remove | 384 |
| avatar.face.preset | 380 |
| drawing.part.change | 377 |
| diagram.node.place | 367 |
| document.block.mark | 362 |
| diagram.group.make | 344 |
| diagram.node.select | 328 |
| document.list.change | 310 |
| chart.change | 302 |
| document.section.change | 300 |
| document.section.remove | 287 |
| drawing.object.group | 284 |
| node.observe | 265 |
| document.section.mark | 259 |
| drawing.ids.show | 251 |
| diagram.links.connect | 246 |
| diagram.chart.make | 243 |
| diagram.node.remove | 240 |
| diagram.group.layout | 239 |
| diagram.node.layout | 224 |
| document.section.make | 218 |
| document.block.select | 211 |
| diagram.group.resize | 209 |
| diagram.point.change | 206 |
| diagram.link.select | 203 |
| diagram.ids.show | 201 |
| avatar.part.feature | 201 |
| diagram.group.chart.make | 199 |
| drawing.drawn.size.delta | 185 |
| diagram.node.resize | 182 |
| drawing.drawn.height.delta | 181 |
| document.list.make | 172 |
| calendar.event.add | 171 |
| document.table.make | 169 |
| diagram.selection.remove | 165 |
| diagram.link.remove | 164 |
| … 99 more | 8,171 |

## Relation

| relation | rows |
| --- | ---: |
| below | 3,371 |
| left_of | 1,717 |
| in | 1,298 |
| near | 944 |
| right_of | 876 |
| above | 784 |
| on | 407 |
| next_to | 64 |
| by | 45 |
| left of | 34 |
| next to | 30 |
| between | 21 |
| behind | 19 |
| in_front_of | 17 |
| along | 15 |
| beside | 14 |
| off | 8 |
| under | 7 |
| out of | 7 |
| over | 6 |
| close to | 4 |
| to | 4 |
| right of | 4 |
| from | 3 |
| inside | 2 |
| outside | 2 |
| in front of | 2 |
| up to | 2 |
| at | 2 |
| near side of | 2 |
| around | 1 |
| round | 1 |
| past | 1 |
| other side of | 1 |
| away from | 1 |
| in towards | 1 |
| for | 1 |
| into | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.anchor | 9,723 |
| drawing.drawn.relation | 9,707 |
| avatar.part.variant | 7,039 |
| drawing.drawn.colour | 6,140 |
| calendar.meeting.day | 5,802 |
| document.section.content | 5,429 |
| diagram.node.colour | 5,172 |
| diagram.node.label | 4,722 |
| calendar.meeting.time | 4,656 |
| drawing.drawn.name | 4,417 |
| calendar.meeting.title | 3,757 |
| calendar.meeting.length | 3,647 |
| diagram.link.to | 3,575 |
| diagram.link.from | 3,515 |
| calendar.meeting.calendar | 3,465 |
| drawing.drawn.size | 3,026 |
| diagram.node.ids | 2,951 |
| avatar.part.size | 2,821 |
| avatar.part.colour | 2,339 |
| diagram.chart.labels | 2,182 |
| drawing.drawn.ids | 1,570 |
| avatar.part.id | 1,562 |
| document.block.id | 1,429 |
| diagram.group.id | 1,378 |
| diagram.link.ids | 1,329 |
| diagram.chart.values | 1,247 |
| diagram.chart.type | 1,243 |
| drawing.drawn.width | 1,239 |
| calendar.calendar.name | 1,180 |
| diagram.node.size | 1,132 |
| document.text.about | 1,101 |
| diagram.chart.title | 1,083 |
| document.text.title | 1,057 |
| document.text.words | 1,044 |
| calendar.meeting.id | 1,038 |
| calendar.meeting.room | 1,007 |
| document.text.content | 961 |
| drawing.drawn.height | 942 |
| avatar.part.ids | 809 |
| document.section.id | 779 |
| diagram.node.n | 741 |
| drawing.drawn.label | 694 |
| drawing.part.index | 684 |
| document.block.name | 683 |
| drawing.drawn.x | 650 |
| drawing.drawn.y | 650 |
| drawing.part.id | 644 |
| diagram.point.value | 606 |
| diagram.diagram.layout | 588 |
| document.block.rows | 568 |
| diagram.group.ids | 561 |
| document.block.level | 553 |
| document.block.text | 516 |
| diagram.node.anchor | 491 |
| diagram.group.label | 484 |
| document.section.order | 477 |
| diagram.node.x | 461 |
| diagram.node.y | 449 |
| diagram.link.label | 422 |
| document.block.items | 419 |
| … 157 more | 19,662 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 17,506 |
| haiku-v1 | 14,706 |
| mechanical | 10,291 |
| relation-natural | 6,744 |
| mechanical-trigger | 5,111 |
| mechanical-typo | 4,789 |
| drop-equivalent | 3,471 |
| human-equivalent | 2,904 |
| human-simplified | 2,397 |
| direct | 1,770 |
| coverage-equivalent | 1,570 |
| diagram-equivalent | 1,569 |
| human-complex | 1,540 |
| coverage-simplified | 1,439 |
| diagram-simplified | 1,359 |
| diagram-complex | 1,316 |
| drop-complex | 1,166 |
| mechanical-orphan | 1,127 |
| coverage-complex | 1,107 |
| demo-tool-profile | 1,085 |
| human-adapted | 1,077 |
| mechanical-simplified | 968 |
| comparative-natural | 940 |
| drop-simplified | 728 |
| mechanical-question | 686 |
| diagram-equivalent-typo | 426 |
| drop-robustness | 426 |
| diagram-equivalent-asr | 351 |
| diagram-complex-typo | 348 |
| diagram-complex-asr | 312 |
| diagram-simplified-typo | 303 |
| human-reorder | 291 |
| human-typo | 283 |
| human-syn | 272 |
| mechanical-numberwords | 250 |
| diagram-equivalent-filler | 231 |
| diagram-equivalent-polite | 216 |
| diagram-simplified-filler | 214 |
| structural-fill | 203 |
| diagram-complex-nospace | 196 |
| … 36 more | 1,850 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 39 | 87 | 268 |
| words | 1 | 8 | 16 | 50 |
