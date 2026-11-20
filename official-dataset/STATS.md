# Statistics

63,038 messages; train 50,773, dev 6,193, test 6,072.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 19,487 | 2,379 | 2,405 | 24,271 |
| diagram | 17,436 | 2,249 | 2,081 | 21,766 |
| document | 7,486 | 866 | 890 | 9,242 |
| calendar | 3,798 | 391 | 399 | 4,588 |
| avatar | 2,566 | 308 | 297 | 3,171 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 27,524 |
| ui-diagram-v2 | 7,811 |
| ui-relations-v1 | 6,744 |
| main-synthetic | 6,141 |
| ui-human-v1 | 4,965 |
| ui-coverage-v2 | 3,775 |
| ui-natural-v1 | 1,788 |
| data-drop-v1 | 1,515 |
| ui-comparatives-v1 | 940 |
| human-adapted-v1-drawing | 670 |
| human-adapted-v1-diagram | 610 |
| ui-features-v1 | 313 |
| ui-quantities-v1 | 216 |
| ui-tiers-v1 | 26 |

## Requests per message

| requests | rows |
| --- | ---: |
| 1 | 56,130 |
| 2 | 5,520 |
| 3 | 675 |
| 0 | 659 |
| 4 | 39 |
| 5 | 11 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 33,506 |
| change | 17,606 |
| place | 5,076 |
| answer | 4,100 |
| connect | 3,127 |
| remove | 2,199 |
| select | 1,250 |
| arrange | 1,106 |
| group | 432 |
| ungroup | 257 |
| undo | 251 |
| redo | 201 |
| merge | 81 |
| copy | 78 |
| reverse | 78 |
| split | 75 |
| repeat | 7 |
| disconnect | 1 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 25,038 |
| diagram.node | 12,540 |
| document.section | 6,635 |
| diagram.link | 4,402 |
| diagram.chart | 4,171 |
| calendar.meeting | 3,874 |
| document.text | 2,242 |
| avatar.part | 2,133 |
| diagram.group | 1,392 |
| document.block | 1,265 |
| calendar.calendar | 1,115 |
| avatar.face | 1,082 |
| drawing.part | 705 |
| diagram.sketch | 606 |
| diagram.diagram | 478 |
| diagram.point | 378 |
| calendar.room | 283 |
| drawing.page | 243 |
| document.document | 210 |
| diagram.page | 188 |
| diagram.series | 183 |
| document.inline | 136 |
| calendar.person | 112 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 13,155 |
| drawing.object.make | 11,819 |
| drawing.object.change | 3,409 |
| compound | 2,932 |
| diagram.node.change | 2,643 |
| document.block.change | 2,564 |
| diagram.node.make | 1,622 |
| calendar.meeting.add | 1,306 |
| drawing.catalog.make | 1,281 |
| document.write | 1,009 |
| chart.make | 936 |
| diagram.link.change | 919 |
| avatar.part.change | 800 |
| diagram.link.make | 784 |
| calendar.meeting.move | 658 |
| diagram.chart.change | 581 |
| drawing.object.place | 459 |
| avatar.part.add | 445 |
| drawn.observe | 433 |
| world-informed-completion | 417 |
| diagram.observe.node | 377 |
| document.block.make | 374 |
| diagram.node.place | 327 |
| chart.change | 302 |
| avatar.face.preset | 298 |
| diagram.node.select | 289 |
| document.section.remove | 265 |
| diagram.group.make | 253 |
| diagram.links.connect | 238 |
| drawing.part.change | 226 |
| diagram.chart.make | 222 |
| diagram.node.remove | 221 |
| calendar.meeting.change | 217 |
| node.observe | 214 |
| avatar.part.feature | 199 |
| diagram.point.change | 199 |
| drawing.drawn.size.delta | 185 |
| diagram.group.change | 183 |
| drawing.drawn.height.delta | 181 |
| diagram.ids.show | 178 |
| diagram.group.resize | 178 |
| drawing.ids.show | 176 |
| drawing.object.group | 169 |
| document.block.mark | 165 |
| diagram.link.select | 164 |
| avatar.face.compose | 161 |
| document.section.change | 150 |
| diagram.node.resize | 148 |
| calendar.room.add | 148 |
| diagram.link.remove | 145 |
| avatar.part.move | 144 |
| diagram.node.layout | 141 |
| drawing.drawn.width.delta | 140 |
| document.section.make | 138 |
| diagram.group.chart.adopt | 138 |
| diagram.observe | 132 |
| diagram.selection.remove | 131 |
| avatar.part.size.delta | 131 |
| document.block.select | 125 |
| calendar.calendar.add | 125 |
| … 99 more | 6,969 |

## Relation

| relation | rows |
| --- | ---: |
| below | 3,367 |
| left_of | 1,699 |
| in | 1,272 |
| near | 924 |
| right_of | 876 |
| above | 772 |
| on | 352 |
| next_to | 64 |
| between | 20 |
| in_front_of | 17 |
| behind | 11 |
| along | 2 |
| inside | 2 |
| outside | 2 |
| around | 1 |
| under | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.anchor | 9,429 |
| drawing.drawn.relation | 9,409 |
| document.section.content | 5,296 |
| drawing.drawn.colour | 5,198 |
| diagram.node.colour | 4,741 |
| diagram.node.label | 4,497 |
| drawing.drawn.name | 3,551 |
| diagram.link.to | 3,456 |
| diagram.link.from | 3,386 |
| calendar.meeting.day | 3,182 |
| calendar.meeting.time | 2,933 |
| diagram.node.ids | 2,342 |
| calendar.meeting.title | 2,308 |
| calendar.meeting.length | 2,198 |
| drawing.drawn.size | 2,032 |
| diagram.chart.labels | 1,759 |
| calendar.meeting.calendar | 1,356 |
| diagram.chart.values | 1,205 |
| diagram.chart.type | 1,189 |
| drawing.drawn.ids | 1,132 |
| document.text.about | 1,098 |
| diagram.chart.title | 1,062 |
| document.text.words | 1,041 |
| document.text.title | 1,032 |
| calendar.meeting.room | 1,006 |
| calendar.calendar.name | 968 |
| document.text.content | 961 |
| diagram.group.id | 905 |
| avatar.part.variant | 843 |
| avatar.part.ids | 803 |
| diagram.node.size | 756 |
| drawing.drawn.width | 735 |
| drawing.drawn.height | 646 |
| diagram.link.ids | 592 |
| diagram.node.n | 552 |
| calendar.meeting.id | 501 |
| document.block.rows | 475 |
| document.section.order | 472 |
| diagram.group.ids | 470 |
| drawing.drawn.y | 465 |
| drawing.drawn.x | 461 |
| drawing.drawn.label | 447 |
| diagram.node.anchor | 419 |
| drawing.part.index | 411 |
| diagram.node.layout | 405 |
| drawing.part.id | 371 |
| diagram.node.x | 358 |
| diagram.node.y | 351 |
| document.block.id | 329 |
| diagram.node.position | 323 |
| avatar.part.size | 321 |
| diagram.point.value | 302 |
| avatar.face.preset | 300 |
| avatar.part.id | 293 |
| diagram.chart.sort | 290 |
| document.block.text | 286 |
| diagram.link.label | 280 |
| diagram.node.width | 279 |
| drawing.drawn.at | 276 |
| document.section.id | 275 |
| … 149 more | 13,266 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 14,688 |
| haiku-v1 | 11,757 |
| relation-natural | 6,744 |
| human-equivalent | 2,337 |
| human-simplified | 1,824 |
| direct | 1,770 |
| coverage-equivalent | 1,568 |
| diagram-equivalent | 1,549 |
| mechanical-trigger | 1,538 |
| coverage-simplified | 1,439 |
| diagram-simplified | 1,355 |
| diagram-complex | 1,329 |
| mechanical | 1,241 |
| human-complex | 1,182 |
| coverage-complex | 1,107 |
| demo-tool-profile | 1,079 |
| mechanical-orphan | 1,079 |
| human-adapted | 1,077 |
| drop-equivalent | 955 |
| comparative-natural | 940 |
| mechanical-typo | 764 |
| mechanical-question | 506 |
| diagram-equivalent-typo | 388 |
| diagram-equivalent-asr | 375 |
| diagram-complex-typo | 370 |
| diagram-complex-asr | 333 |
| drop-complex | 322 |
| diagram-simplified-typo | 267 |
| diagram-simplified-asr | 229 |
| diagram-equivalent-polite | 221 |
| structural-fill | 203 |
| diagram-simplified-polite | 200 |
| diagram-equivalent-filler | 190 |
| diagram-equivalent-nospace | 186 |
| drop-simplified | 185 |
| diagram-simplified-filler | 178 |
| diagram-complex-filler | 177 |
| diagram-complex-polite | 174 |
| diagram-complex-nospace | 163 |
| coordination | 144 |
| … 17 more | 905 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 44 | 93 | 268 |
| words | 1 | 9 | 17 | 50 |
