# Statistics

51,878 messages; train 41,870, dev 5,128, test 4,880.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 18,531 | 2,266 | 2,256 | 23,053 |
| diagram | 9,751 | 1,308 | 1,094 | 12,153 |
| document | 7,475 | 869 | 891 | 9,235 |
| calendar | 3,783 | 405 | 392 | 4,580 |
| avatar | 2,330 | 280 | 247 | 2,857 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 27,525 |
| ui-relations-v1 | 6,744 |
| main-synthetic | 6,141 |
| ui-human-v1 | 4,965 |
| ui-coverage-v2 | 3,775 |
| ui-natural-v1 | 1,788 |
| ui-comparatives-v1 | 940 |

## Requests per message

| requests | rows |
| --- | ---: |
| 1 | 45,524 |
| 2 | 5,065 |
| 0 | 657 |
| 3 | 583 |
| 4 | 35 |
| 5 | 10 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 29,790 |
| change | 13,906 |
| place | 4,574 |
| answer | 3,161 |
| connect | 2,482 |
| remove | 1,526 |
| select | 924 |
| arrange | 483 |
| group | 284 |
| ungroup | 212 |
| undo | 139 |
| redo | 137 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 23,627 |
| diagram.node | 7,844 |
| document.section | 6,635 |
| calendar.meeting | 3,866 |
| diagram.link | 2,976 |
| diagram.chart | 2,252 |
| document.text | 2,239 |
| avatar.part | 1,820 |
| document.block | 1,261 |
| calendar.calendar | 1,115 |
| avatar.face | 1,081 |
| diagram.group | 813 |
| drawing.part | 647 |
| calendar.room | 283 |
| diagram.sketch | 268 |
| drawing.page | 213 |
| document.document | 210 |
| document.inline | 136 |
| diagram.page | 120 |
| calendar.person | 112 |
| diagram.diagram | 80 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| drawing.object.make | 11,819 |
| none | 10,465 |
| drawing.object.change | 3,409 |
| document.block.change | 2,564 |
| compound | 2,380 |
| diagram.node.change | 1,881 |
| calendar.meeting.add | 1,298 |
| drawing.catalog.make | 1,281 |
| document.write | 1,006 |
| chart.make | 936 |
| diagram.node.make | 711 |
| calendar.meeting.move | 658 |
| avatar.part.change | 605 |
| diagram.link.make | 545 |
| drawing.object.place | 459 |
| avatar.part.add | 445 |
| drawn.observe | 433 |
| world-informed-completion | 417 |
| document.block.make | 374 |
| diagram.link.change | 346 |
| chart.change | 302 |
| avatar.face.preset | 297 |
| document.section.remove | 265 |
| drawing.part.change | 226 |
| calendar.meeting.change | 217 |
| node.observe | 214 |
| drawing.drawn.size.delta | 185 |
| drawing.drawn.height.delta | 181 |
| drawing.ids.show | 172 |
| drawing.object.group | 169 |
| document.block.mark | 161 |
| avatar.face.compose | 161 |
| document.section.change | 150 |
| calendar.room.add | 148 |
| avatar.part.move | 144 |
| drawing.drawn.width.delta | 140 |
| document.section.make | 138 |
| diagram.node.select | 134 |
| avatar.part.size.delta | 131 |
| document.block.select | 125 |
| calendar.calendar.add | 125 |
| avatar.ids.show | 124 |
| drawing.part.place | 122 |
| diagram.group.resize | 122 |
| drawing.part.select | 117 |
| diagram.ids.show | 117 |
| document.list.make | 117 |
| document.list.change | 116 |
| diagram.node.size.delta | 115 |
| avatar.face.expression | 110 |
| diagram.group.make | 107 |
| diagram.group.change | 107 |
| document.table.make | 106 |
| document.block.remove | 100 |
| diagram.node.place | 99 |
| document.section.select | 98 |
| block.observe | 98 |
| avatar.part.resize | 97 |
| avatar.face.resize | 96 |
| drawing.part.remove | 95 |
| … 71 more | 3,998 |

## Relation

| relation | rows |
| --- | ---: |
| below | 3,336 |
| left_of | 1,654 |
| in | 1,227 |
| right_of | 854 |
| near | 850 |
| above | 739 |
| on | 287 |
| next_to | 42 |
| in_front_of | 4 |
| between | 2 |
| along | 2 |
| inside | 2 |
| outside | 2 |
| around | 1 |
| behind | 1 |
| under | 1 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.relation | 8,993 |
| drawing.drawn.anchor | 8,993 |
| document.section.content | 5,296 |
| drawing.drawn.colour | 5,152 |
| diagram.node.colour | 4,208 |
| diagram.node.label | 4,149 |
| drawing.drawn.name | 3,550 |
| calendar.meeting.day | 3,174 |
| calendar.meeting.time | 2,925 |
| diagram.link.to | 2,675 |
| diagram.link.from | 2,624 |
| calendar.meeting.title | 2,308 |
| calendar.meeting.length | 2,198 |
| drawing.drawn.size | 1,837 |
| calendar.meeting.calendar | 1,352 |
| drawing.drawn.ids | 1,132 |
| document.text.about | 1,098 |
| document.text.words | 1,041 |
| document.text.title | 1,030 |
| calendar.meeting.room | 1,002 |
| calendar.calendar.name | 968 |
| document.text.content | 958 |
| diagram.chart.title | 945 |
| diagram.chart.labels | 936 |
| diagram.chart.values | 866 |
| avatar.part.ids | 864 |
| avatar.part.variant | 843 |
| drawing.drawn.width | 735 |
| diagram.node.ids | 726 |
| drawing.drawn.height | 646 |
| avatar.face.id | 566 |
| diagram.group.id | 530 |
| calendar.meeting.id | 501 |
| document.block.rows | 475 |
| document.section.order | 472 |
| drawing.drawn.y | 465 |
| drawing.drawn.x | 461 |
| diagram.node.size | 460 |
| drawing.drawn.label | 446 |
| drawing.part.index | 411 |
| drawing.part.id | 359 |
| document.block.id | 326 |
| avatar.part.size | 321 |
| avatar.face.preset | 299 |
| diagram.link.ids | 298 |
| avatar.part.id | 293 |
| document.block.text | 282 |
| diagram.node.x | 275 |
| document.section.id | 275 |
| document.block.items | 270 |
| diagram.node.y | 268 |
| diagram.chart.sort | 255 |
| document.section.text | 250 |
| document.block.name | 225 |
| diagram.node.n | 215 |
| diagram.group.ids | 214 |
| diagram.group.label | 201 |
| diagram.group.labels | 187 |
| diagram.group.values | 187 |
| diagram.node.layout | 178 |
| … 113 more | 8,164 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 14,688 |
| haiku-v1 | 11,758 |
| relation-natural | 6,744 |
| human-equivalent | 2,337 |
| human-simplified | 1,825 |
| direct | 1,770 |
| mechanical-trigger | 1,538 |
| coverage-equivalent | 1,423 |
| coverage-simplified | 1,347 |
| mechanical | 1,241 |
| human-complex | 1,182 |
| demo-tool-profile | 1,079 |
| mechanical-orphan | 1,079 |
| coverage-complex | 1,005 |
| comparative-natural | 940 |
| mechanical-typo | 764 |
| mechanical-question | 506 |
| human-wrongish | 108 |
| human-tangle | 102 |
| human-mislead | 101 |
| human-reorder | 48 |
| mechanical-numberwords | 46 |
| mechanical-orphan2 | 44 |
| mechanical-simplified | 44 |
| human-typo | 43 |
| human-syn | 41 |
| human-compound | 19 |
| human-preference | 19 |
| world-inference | 18 |
| human-prohibition | 16 |
| compound | 3 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 46 | 96 | 268 |
| words | 1 | 9 | 17 | 46 |
