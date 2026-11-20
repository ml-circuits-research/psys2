# Statistics

39,066 messages; train 31,688, dev 3,779, test 3,599.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 11,827 | 1,432 | 1,417 | 14,676 |
| diagram | 8,466 | 1,075 | 973 | 10,514 |
| document | 6,638 | 807 | 782 | 8,227 |
| calendar | 3,119 | 295 | 260 | 3,674 |
| avatar | 1,638 | 170 | 167 | 1,975 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 27,525 |
| main-synthetic | 4,928 |
| ui-human-v1 | 4,249 |
| ui-natural-v1 | 1,474 |
| ui-relations-v1 | 890 |

## Requests per message

| requests | rows |
| --- | ---: |
| 1 | 32,835 |
| 2 | 4,942 |
| 0 | 657 |
| 3 | 583 |
| 4 | 35 |
| 5 | 10 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 22,152 |
| change | 11,013 |
| place | 4,011 |
| answer | 2,730 |
| connect | 2,378 |
| remove | 1,016 |
| select | 611 |
| arrange | 359 |
| ungroup | 119 |
| undo | 105 |
| redo | 104 |
| group | 85 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 15,487 |
| diagram.node | 6,980 |
| document.section | 6,352 |
| calendar.meeting | 3,331 |
| diagram.link | 2,758 |
| diagram.chart | 2,218 |
| document.text | 2,042 |
| avatar.part | 1,298 |
| calendar.calendar | 959 |
| document.block | 768 |
| avatar.face | 701 |
| drawing.part | 474 |
| diagram.group | 449 |
| document.document | 163 |
| diagram.sketch | 153 |
| document.inline | 136 |
| drawing.page | 127 |
| calendar.room | 116 |
| diagram.diagram | 80 |
| diagram.page | 46 |
| calendar.person | 25 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| none | 10,465 |
| drawing.object.make | 5,373 |
| drawing.object.change | 3,250 |
| document.block.change | 2,507 |
| compound | 2,257 |
| diagram.node.change | 1,769 |
| calendar.meeting.add | 1,179 |
| drawing.catalog.make | 1,011 |
| document.write | 978 |
| chart.make | 936 |
| calendar.meeting.move | 608 |
| avatar.part.change | 519 |
| diagram.node.make | 513 |
| diagram.link.make | 497 |
| world-informed-completion | 395 |
| drawn.observe | 350 |
| avatar.part.add | 345 |
| document.block.make | 319 |
| chart.change | 302 |
| document.section.remove | 247 |
| avatar.face.preset | 227 |
| diagram.link.change | 218 |
| drawing.part.change | 192 |
| node.observe | 166 |
| drawing.object.place | 128 |
| avatar.part.move | 122 |
| avatar.face.compose | 106 |
| calendar.room.add | 101 |
| document.section.change | 98 |
| drawing.ids.show | 97 |
| calendar.meeting.change | 96 |
| document.block.mark | 93 |
| drawing.part.place | 92 |
| document.list.make | 90 |
| calendar.calendar.add | 89 |
| drawing.object.group | 84 |
| diagram.node.select | 84 |
| ui.history.undo | 84 |
| ui.history.redo | 83 |
| document.list.change | 80 |
| avatar.face.expression | 80 |
| document.block.select | 74 |
| block.observe | 74 |
| drawing.part.remove | 70 |
| meeting.observe | 70 |
| diagram.group.change | 68 |
| document.section.make | 67 |
| document.table.make | 62 |
| drawing.part.select | 60 |
| drawing.object.ungroup | 60 |
| drawing.part.extract | 59 |
| diagram.group.resize | 59 |
| document.title.change | 59 |
| diagram.link.select | 57 |
| diagram.group.chart.make | 55 |
| document.block.align | 55 |
| document.table.change | 54 |
| calendar.event.add | 53 |
| document.section.reorder | 52 |
| diagram.node.layout | 51 |
| … 53 more | 1,677 |

## Relation

| relation | rows |
| --- | ---: |
| below | 1,429 |
| left_of | 1,035 |
| right_of | 258 |
| near | 178 |
| above | 84 |
| on | 65 |
| next_to | 32 |
| in | 28 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| document.section.content | 5,292 |
| drawing.drawn.colour | 4,797 |
| diagram.node.colour | 4,125 |
| diagram.node.label | 4,044 |
| drawing.drawn.name | 3,478 |
| drawing.drawn.relation | 3,098 |
| drawing.drawn.anchor | 3,098 |
| calendar.meeting.day | 3,010 |
| calendar.meeting.time | 2,792 |
| diagram.link.from | 2,505 |
| diagram.link.to | 2,505 |
| calendar.meeting.title | 2,208 |
| calendar.meeting.length | 2,045 |
| calendar.meeting.calendar | 1,305 |
| document.text.about | 1,026 |
| document.text.words | 1,026 |
| document.text.title | 979 |
| document.text.content | 949 |
| calendar.meeting.room | 947 |
| diagram.chart.title | 936 |
| diagram.chart.labels | 936 |
| calendar.calendar.name | 904 |
| drawing.drawn.size | 869 |
| diagram.chart.values | 866 |
| avatar.part.ids | 861 |
| avatar.part.variant | 717 |
| drawing.drawn.ids | 662 |
| avatar.face.id | 457 |
| document.section.order | 437 |
| drawing.drawn.width | 429 |
| diagram.node.ids | 357 |
| drawing.part.index | 348 |
| drawing.drawn.height | 335 |
| drawing.drawn.x | 330 |
| drawing.drawn.y | 330 |
| document.block.rows | 316 |
| diagram.group.id | 314 |
| drawing.drawn.label | 311 |
| drawing.part.id | 308 |
| avatar.part.id | 278 |
| calendar.meeting.id | 273 |
| diagram.chart.sort | 255 |
| drawing.drawn.color | 239 |
| diagram.link.ids | 238 |
| diagram.node.size | 236 |
| avatar.face.preset | 227 |
| document.section.id | 226 |
| document.block.items | 198 |
| diagram.node.x | 193 |
| diagram.node.y | 187 |
| drawing.part.owner | 166 |
| drawing.drawn.id | 160 |
| diagram.node.n | 160 |
| document.block.name | 159 |
| document.block.text | 158 |
| document.block.id | 152 |
| avatar.part.size | 150 |
| document.section.text | 147 |
| calendar.meeting.timezone | 144 |
| avatar.part.place | 143 |
| … 98 more | 5,106 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 14,688 |
| haiku-v1 | 11,758 |
| human-equivalent | 1,999 |
| human-simplified | 1,552 |
| direct | 1,456 |
| mechanical-trigger | 1,248 |
| demo-tool-profile | 1,079 |
| human-complex | 1,000 |
| mechanical | 977 |
| relation-natural | 890 |
| mechanical-orphan | 871 |
| mechanical-typo | 615 |
| mechanical-question | 400 |
| human-mislead | 84 |
| human-tangle | 84 |
| human-wrongish | 84 |
| mechanical-numberwords | 39 |
| mechanical-simplified | 38 |
| human-reorder | 37 |
| human-typo | 36 |
| mechanical-orphan2 | 36 |
| human-syn | 32 |
| world-inference | 18 |
| human-compound | 15 |
| human-preference | 15 |
| human-prohibition | 12 |
| compound | 3 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 54 | 101 | 268 |
| words | 1 | 10 | 18 | 46 |
