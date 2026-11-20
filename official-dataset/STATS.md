# Statistics

60,373 messages; train 48,619, dev 5,939, test 5,815.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 18,845 | 2,323 | 2,325 | 23,493 |
| diagram | 15,924 | 2,051 | 1,904 | 19,879 |
| document | 7,486 | 866 | 890 | 9,242 |
| calendar | 3,798 | 391 | 399 | 4,588 |
| avatar | 2,566 | 308 | 297 | 3,171 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 27,524 |
| ui-diagram-v2 | 7,686 |
| ui-relations-v1 | 6,742 |
| main-synthetic | 6,141 |
| ui-human-v1 | 4,964 |
| ui-coverage-v2 | 3,775 |
| ui-natural-v1 | 1,788 |
| ui-comparatives-v1 | 940 |
| ui-features-v1 | 313 |
| human-adapted-v1-drawing | 258 |
| ui-quantities-v1 | 216 |
| ui-tiers-v1 | 26 |

## Requests per message

| requests | rows |
| --- | ---: |
| 1 | 53,630 |
| 2 | 5,410 |
| 0 | 658 |
| 3 | 624 |
| 4 | 37 |
| 5 | 10 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 31,830 |
| change | 17,050 |
| place | 4,877 |
| answer | 3,972 |
| connect | 3,065 |
| remove | 2,087 |
| select | 1,220 |
| arrange | 1,044 |
| group | 430 |
| ungroup | 257 |
| undo | 207 |
| redo | 198 |
| merge | 81 |
| reverse | 77 |
| copy | 76 |
| split | 74 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 24,231 |
| diagram.node | 11,940 |
| document.section | 6,635 |
| diagram.link | 4,324 |
| calendar.meeting | 3,874 |
| diagram.chart | 2,995 |
| document.text | 2,242 |
| avatar.part | 2,133 |
| diagram.group | 1,388 |
| document.block | 1,265 |
| calendar.calendar | 1,115 |
| avatar.face | 1,082 |
| drawing.part | 646 |
| diagram.sketch | 577 |
| diagram.diagram | 438 |
| diagram.point | 333 |
| calendar.room | 283 |
| drawing.page | 217 |
| document.document | 210 |
| diagram.page | 181 |
| diagram.series | 168 |
| document.inline | 136 |
| calendar.person | 112 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| drawing.object.make | 11,817 |
| none | 10,782 |
| drawing.object.change | 3,409 |
| compound | 2,768 |
| diagram.node.change | 2,643 |
| document.block.change | 2,564 |
| diagram.node.make | 1,623 |
| calendar.meeting.add | 1,306 |
| drawing.catalog.make | 1,281 |
| document.write | 1,009 |
| chart.make | 936 |
| diagram.link.change | 919 |
| avatar.part.change | 800 |
| diagram.link.make | 784 |
| calendar.meeting.move | 658 |
| diagram.chart.change | 533 |
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
| diagram.chart.make | 144 |
| diagram.node.layout | 141 |
| drawing.drawn.width.delta | 140 |
| document.section.make | 138 |
| diagram.group.chart.adopt | 138 |
| diagram.observe | 132 |
| diagram.selection.remove | 131 |
| avatar.part.size.delta | 131 |
| document.block.select | 125 |
| calendar.calendar.add | 125 |
| … 99 more | 6,968 |

## Relation

| relation | rows |
| --- | ---: |
| below | 3,356 |
| left_of | 1,670 |
| in | 1,245 |
| near | 873 |
| right_of | 867 |
| above | 757 |
| on | 296 |
| next_to | 64 |
| in_front_of | 10 |
| between | 7 |
| behind | 4 |
| along | 2 |
| inside | 2 |
| outside | 2 |
| under | 1 |
| around | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.anchor | 9,159 |
| drawing.drawn.relation | 9,146 |
| document.section.content | 5,296 |
| drawing.drawn.colour | 5,155 |
| diagram.node.colour | 4,654 |
| diagram.node.label | 4,469 |
| drawing.drawn.name | 3,550 |
| diagram.link.to | 3,409 |
| diagram.link.from | 3,344 |
| calendar.meeting.day | 3,182 |
| calendar.meeting.time | 2,933 |
| calendar.meeting.title | 2,308 |
| diagram.node.ids | 2,306 |
| calendar.meeting.length | 2,198 |
| drawing.drawn.size | 1,976 |
| diagram.chart.labels | 1,575 |
| calendar.meeting.calendar | 1,356 |
| drawing.drawn.ids | 1,132 |
| document.text.about | 1,098 |
| diagram.chart.values | 1,098 |
| document.text.words | 1,041 |
| document.text.title | 1,032 |
| diagram.chart.title | 1,027 |
| calendar.meeting.room | 1,006 |
| calendar.calendar.name | 968 |
| document.text.content | 961 |
| diagram.group.id | 904 |
| avatar.part.variant | 843 |
| avatar.part.ids | 798 |
| diagram.node.size | 742 |
| drawing.drawn.width | 735 |
| drawing.drawn.height | 646 |
| diagram.link.ids | 591 |
| diagram.node.n | 536 |
| calendar.meeting.id | 501 |
| document.block.rows | 475 |
| document.section.order | 472 |
| diagram.group.ids | 468 |
| drawing.drawn.y | 465 |
| drawing.drawn.x | 461 |
| drawing.drawn.label | 446 |
| drawing.part.index | 410 |
| diagram.node.layout | 398 |
| drawing.part.id | 359 |
| diagram.node.x | 358 |
| diagram.node.y | 351 |
| document.block.id | 329 |
| diagram.node.anchor | 323 |
| avatar.part.size | 321 |
| avatar.face.preset | 300 |
| avatar.part.id | 293 |
| document.block.text | 286 |
| diagram.chart.sort | 282 |
| document.section.id | 275 |
| diagram.link.label | 270 |
| document.block.items | 270 |
| avatar.face.id | 267 |
| document.section.text | 250 |
| diagram.link.style | 242 |
| diagram.node.position | 242 |
| … 145 more | 12,669 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 14,688 |
| haiku-v1 | 11,757 |
| relation-natural | 6,742 |
| human-equivalent | 2,336 |
| human-simplified | 1,824 |
| direct | 1,770 |
| coverage-equivalent | 1,568 |
| mechanical-trigger | 1,538 |
| diagram-equivalent | 1,527 |
| coverage-simplified | 1,439 |
| diagram-simplified | 1,329 |
| diagram-complex | 1,305 |
| mechanical | 1,241 |
| human-complex | 1,182 |
| coverage-complex | 1,107 |
| demo-tool-profile | 1,079 |
| mechanical-orphan | 1,079 |
| comparative-natural | 940 |
| mechanical-typo | 764 |
| mechanical-question | 506 |
| diagram-equivalent-typo | 380 |
| diagram-equivalent-asr | 369 |
| diagram-complex-typo | 361 |
| diagram-complex-asr | 328 |
| diagram-simplified-typo | 263 |
| human-adapted | 258 |
| diagram-simplified-asr | 229 |
| diagram-equivalent-polite | 220 |
| diagram-simplified-polite | 198 |
| diagram-equivalent-filler | 188 |
| diagram-equivalent-nospace | 184 |
| diagram-simplified-filler | 176 |
| diagram-complex-filler | 175 |
| diagram-complex-polite | 171 |
| diagram-complex-nospace | 160 |
| coordination | 144 |
| diagram-simplified-nospace | 123 |
| human-wrongish | 108 |
| human-tangle | 102 |
| human-mislead | 101 |
| … 12 more | 414 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 45 | 93 | 268 |
| words | 1 | 9 | 17 | 46 |
