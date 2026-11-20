# Statistics

58,796 messages; train 47,284, dev 5,753, test 5,759.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 18,639 | 2,298 | 2,301 | 23,238 |
| diagram | 14,795 | 1,890 | 1,872 | 18,557 |
| document | 7,486 | 866 | 890 | 9,242 |
| calendar | 3,798 | 391 | 399 | 4,588 |
| avatar | 2,566 | 308 | 297 | 3,171 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 27,525 |
| ui-relations-v1 | 6,744 |
| ui-diagram-v2 | 6,363 |
| main-synthetic | 6,142 |
| ui-human-v1 | 4,964 |
| ui-coverage-v2 | 3,775 |
| ui-natural-v1 | 1,788 |
| ui-comparatives-v1 | 940 |
| ui-features-v1 | 313 |
| ui-quantities-v1 | 216 |
| ui-tiers-v1 | 26 |

## Requests per message

| requests | rows |
| --- | ---: |
| 1 | 52,049 |
| 2 | 5,413 |
| 0 | 657 |
| 3 | 628 |
| 4 | 35 |
| 5 | 10 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 31,429 |
| change | 16,156 |
| place | 4,874 |
| answer | 3,908 |
| connect | 3,092 |
| remove | 1,987 |
| select | 1,214 |
| arrange | 894 |
| group | 433 |
| ungroup | 259 |
| undo | 218 |
| redo | 196 |
| reverse | 83 |
| split | 81 |
| copy | 77 |
| merge | 73 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 23,960 |
| diagram.node | 11,509 |
| document.section | 6,635 |
| diagram.link | 4,549 |
| calendar.meeting | 3,874 |
| diagram.chart | 2,327 |
| document.text | 2,242 |
| avatar.part | 2,133 |
| diagram.group | 1,465 |
| document.block | 1,265 |
| calendar.calendar | 1,115 |
| avatar.face | 1,082 |
| drawing.part | 647 |
| diagram.sketch | 587 |
| diagram.diagram | 424 |
| calendar.room | 283 |
| drawing.page | 217 |
| document.document | 210 |
| diagram.page | 182 |
| document.inline | 136 |
| calendar.person | 112 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| drawing.object.make | 11,819 |
| none | 10,537 |
| drawing.object.change | 3,409 |
| compound | 2,773 |
| diagram.node.change | 2,644 |
| document.block.change | 2,564 |
| diagram.node.make | 1,608 |
| calendar.meeting.add | 1,306 |
| drawing.catalog.make | 1,281 |
| document.write | 1,009 |
| diagram.link.make | 937 |
| chart.make | 936 |
| diagram.link.change | 894 |
| avatar.part.change | 800 |
| calendar.meeting.move | 658 |
| drawing.object.place | 459 |
| avatar.part.add | 445 |
| drawn.observe | 433 |
| world-informed-completion | 417 |
| diagram.observe.node | 396 |
| document.block.make | 374 |
| diagram.node.place | 330 |
| chart.change | 302 |
| avatar.face.preset | 298 |
| diagram.node.select | 292 |
| document.section.remove | 265 |
| diagram.group.make | 256 |
| drawing.part.change | 226 |
| calendar.meeting.change | 217 |
| diagram.node.remove | 215 |
| node.observe | 214 |
| avatar.part.feature | 199 |
| drawing.drawn.size.delta | 185 |
| diagram.group.change | 184 |
| drawing.drawn.height.delta | 181 |
| diagram.ids.show | 179 |
| drawing.ids.show | 176 |
| diagram.group.resize | 175 |
| drawing.object.group | 169 |
| document.block.mark | 165 |
| diagram.group.chart.make | 162 |
| avatar.face.compose | 161 |
| diagram.link.select | 158 |
| diagram.node.resize | 151 |
| document.section.change | 150 |
| calendar.room.add | 148 |
| diagram.link.remove | 147 |
| avatar.part.move | 144 |
| diagram.node.layout | 143 |
| drawing.drawn.width.delta | 140 |
| document.section.make | 138 |
| diagram.observe | 134 |
| diagram.group.chart.adopt | 132 |
| diagram.selection.remove | 131 |
| avatar.part.size.delta | 131 |
| document.block.select | 125 |
| calendar.calendar.add | 125 |
| avatar.ids.show | 124 |
| drawing.part.place | 122 |
| drawing.part.select | 117 |
| … 88 more | 6,086 |

## Relation

| relation | rows |
| --- | ---: |
| below | 3,338 |
| left_of | 1,658 |
| in | 1,232 |
| near | 865 |
| right_of | 856 |
| above | 753 |
| on | 289 |
| next_to | 64 |
| in_front_of | 6 |
| between | 2 |
| along | 2 |
| behind | 2 |
| inside | 2 |
| outside | 2 |
| under | 1 |
| around | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.relation | 9,062 |
| drawing.drawn.anchor | 9,062 |
| document.section.content | 5,296 |
| drawing.drawn.colour | 5,152 |
| diagram.node.colour | 4,627 |
| diagram.node.label | 4,496 |
| diagram.link.from | 3,571 |
| drawing.drawn.name | 3,550 |
| diagram.link.to | 3,421 |
| calendar.meeting.day | 3,182 |
| calendar.meeting.time | 2,933 |
| calendar.meeting.title | 2,308 |
| calendar.meeting.length | 2,198 |
| diagram.node.ids | 2,178 |
| drawing.drawn.size | 1,837 |
| calendar.meeting.calendar | 1,356 |
| drawing.drawn.ids | 1,132 |
| document.text.about | 1,098 |
| document.text.words | 1,041 |
| document.text.title | 1,032 |
| calendar.meeting.room | 1,006 |
| calendar.calendar.name | 968 |
| document.text.content | 961 |
| diagram.chart.title | 948 |
| diagram.chart.labels | 936 |
| diagram.group.id | 877 |
| diagram.chart.values | 866 |
| avatar.part.variant | 843 |
| avatar.part.ids | 798 |
| diagram.node.size | 736 |
| drawing.drawn.width | 735 |
| drawing.drawn.height | 646 |
| diagram.link.ids | 555 |
| diagram.node.n | 544 |
| calendar.meeting.id | 501 |
| document.block.rows | 475 |
| document.section.order | 472 |
| drawing.drawn.y | 465 |
| drawing.drawn.x | 461 |
| diagram.group.ids | 461 |
| drawing.drawn.label | 446 |
| diagram.group.labels | 423 |
| diagram.group.values | 423 |
| drawing.part.index | 411 |
| diagram.node.layout | 406 |
| drawing.part.id | 359 |
| diagram.node.x | 359 |
| diagram.node.y | 352 |
| document.block.id | 329 |
| avatar.part.size | 321 |
| diagram.node.anchor | 315 |
| avatar.face.preset | 300 |
| avatar.part.id | 293 |
| document.block.text | 286 |
| document.section.id | 275 |
| diagram.link.label | 271 |
| document.block.items | 270 |
| avatar.face.id | 267 |
| diagram.group.layout | 257 |
| diagram.chart.sort | 255 |
| … 130 more | 11,333 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 14,688 |
| haiku-v1 | 11,758 |
| relation-natural | 6,744 |
| human-equivalent | 2,336 |
| human-simplified | 1,825 |
| direct | 1,770 |
| coverage-equivalent | 1,568 |
| mechanical-trigger | 1,538 |
| coverage-simplified | 1,439 |
| mechanical | 1,241 |
| diagram-equivalent | 1,202 |
| human-complex | 1,182 |
| diagram-simplified | 1,117 |
| coverage-complex | 1,107 |
| diagram-complex | 1,101 |
| demo-tool-profile | 1,079 |
| mechanical-orphan | 1,079 |
| comparative-natural | 940 |
| mechanical-typo | 764 |
| mechanical-question | 506 |
| diagram-equivalent-typo | 345 |
| diagram-complex-asr | 291 |
| diagram-complex-typo | 289 |
| diagram-equivalent-asr | 273 |
| diagram-simplified-typo | 242 |
| diagram-equivalent-filler | 188 |
| diagram-simplified-asr | 188 |
| diagram-simplified-filler | 158 |
| diagram-complex-filler | 156 |
| coordination | 144 |
| diagram-complex-nospace | 143 |
| diagram-simplified-polite | 140 |
| diagram-equivalent-nospace | 139 |
| diagram-equivalent-polite | 138 |
| diagram-complex-polite | 133 |
| diagram-simplified-nospace | 120 |
| human-wrongish | 108 |
| human-tangle | 102 |
| human-mislead | 101 |
| quantity | 72 |
| … 11 more | 342 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 45 | 94 | 268 |
| words | 1 | 9 | 17 | 46 |
