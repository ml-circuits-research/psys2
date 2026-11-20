# Statistics

48,102 messages; train 38,941, dev 4,637, test 4,524.

## Tab (world) × split

| world | train | dev | test | total |
| --- | ---: | ---: | ---: | ---: |
| drawing | 17,912 | 2,170 | 2,195 | 22,277 |
| diagram | 8,996 | 1,135 | 1,044 | 11,175 |
| document | 6,851 | 822 | 790 | 8,463 |
| calendar | 3,188 | 313 | 295 | 3,796 |
| avatar | 1,994 | 197 | 200 | 2,391 |

## Source

| source | rows |
| --- | ---: |
| demo-tool-profile | 27,525 |
| ui-relations-v1 | 6,744 |
| main-synthetic | 6,142 |
| ui-human-v1 | 4,963 |
| ui-natural-v1 | 1,788 |
| ui-comparatives-v1 | 940 |

## Requests per message

| requests | rows |
| --- | ---: |
| 1 | 41,842 |
| 2 | 4,971 |
| 0 | 657 |
| 3 | 583 |
| 4 | 35 |
| 5 | 10 |
| 6 | 3 |
| 7 | 1 |

## Act

| act | rows |
| --- | ---: |
| make | 29,013 |
| change | 12,432 |
| place | 4,373 |
| answer | 2,920 |
| connect | 2,378 |
| remove | 1,098 |
| select | 720 |
| arrange | 359 |
| ungroup | 146 |
| undo | 105 |
| redo | 104 |
| group | 100 |

## Target type

| world.type | rows |
| --- | ---: |
| drawing.drawn | 23,023 |
| diagram.node | 7,475 |
| document.section | 6,448 |
| calendar.meeting | 3,446 |
| diagram.link | 2,836 |
| diagram.chart | 2,218 |
| document.text | 2,042 |
| avatar.part | 1,593 |
| calendar.calendar | 963 |
| document.block | 894 |
| avatar.face | 829 |
| drawing.part | 550 |
| diagram.group | 541 |
| document.document | 179 |
| diagram.sketch | 153 |
| document.inline | 136 |
| drawing.page | 127 |
| calendar.room | 118 |
| diagram.diagram | 80 |
| diagram.page | 46 |
| calendar.person | 31 |
| drawing.group | 20 |

## Operation (top 60)

| operation | rows |
| --- | ---: |
| drawing.object.make | 11,679 |
| none | 10,465 |
| drawing.object.change | 3,304 |
| document.block.change | 2,514 |
| compound | 2,286 |
| diagram.node.change | 1,793 |
| drawing.catalog.make | 1,250 |
| calendar.meeting.add | 1,179 |
| document.write | 988 |
| chart.make | 936 |
| diagram.node.make | 627 |
| calendar.meeting.move | 614 |
| avatar.part.change | 550 |
| diagram.link.make | 510 |
| drawn.observe | 433 |
| world-informed-completion | 416 |
| avatar.part.add | 414 |
| drawing.object.place | 379 |
| document.block.make | 334 |
| chart.change | 302 |
| avatar.face.preset | 279 |
| diagram.link.change | 269 |
| document.section.remove | 256 |
| node.observe | 214 |
| drawing.part.change | 206 |
| drawing.drawn.size.delta | 185 |
| drawing.drawn.height.delta | 181 |
| drawing.drawn.width.delta | 140 |
| avatar.face.compose | 133 |
| avatar.part.move | 133 |
| avatar.part.size.delta | 131 |
| document.section.change | 121 |
| diagram.node.size.delta | 115 |
| calendar.meeting.change | 113 |
| drawing.part.place | 110 |
| document.block.mark | 101 |
| calendar.room.add | 101 |
| drawing.object.group | 99 |
| block.observe | 98 |
| drawing.ids.show | 97 |
| diagram.node.select | 97 |
| document.list.make | 97 |
| avatar.face.expression | 92 |
| document.block.select | 90 |
| document.list.change | 89 |
| calendar.calendar.add | 89 |
| document.section.make | 86 |
| drawing.part.remove | 84 |
| ui.history.undo | 84 |
| ui.history.redo | 83 |
| meeting.observe | 83 |
| diagram.group.change | 80 |
| drawing.part.extract | 76 |
| diagram.group.resize | 76 |
| diagram.node.width.delta | 75 |
| drawing.part.select | 73 |
| document.table.make | 71 |
| drawing.object.ungroup | 70 |
| diagram.node.height.delta | 70 |
| diagram.group.chart.make | 66 |
| … 61 more | 2,416 |

## Relation

| relation | rows |
| --- | ---: |
| below | 3,333 |
| left_of | 1,652 |
| in | 1,225 |
| right_of | 852 |
| near | 848 |
| above | 736 |
| on | 285 |
| next_to | 37 |

## Constraint keys (top 60)

| key | rows |
| --- | ---: |
| drawing.drawn.relation | 8,957 |
| drawing.drawn.anchor | 8,957 |
| document.section.content | 5,296 |
| drawing.drawn.colour | 4,797 |
| diagram.node.colour | 4,173 |
| diagram.node.label | 4,101 |
| drawing.drawn.name | 3,492 |
| calendar.meeting.day | 3,051 |
| calendar.meeting.time | 2,830 |
| diagram.link.from | 2,542 |
| diagram.link.to | 2,542 |
| calendar.meeting.title | 2,247 |
| calendar.meeting.length | 2,095 |
| drawing.drawn.size | 1,760 |
| calendar.meeting.calendar | 1,305 |
| document.text.about | 1,026 |
| document.text.words | 1,026 |
| document.text.title | 979 |
| document.text.content | 949 |
| calendar.meeting.room | 947 |
| diagram.chart.title | 936 |
| diagram.chart.labels | 936 |
| calendar.calendar.name | 904 |
| drawing.drawn.ids | 866 |
| diagram.chart.values | 866 |
| avatar.part.variant | 797 |
| avatar.part.ids | 735 |
| drawing.drawn.width | 683 |
| drawing.drawn.height | 596 |
| avatar.face.id | 567 |
| diagram.node.ids | 520 |
| document.section.order | 437 |
| drawing.drawn.y | 418 |
| drawing.drawn.x | 414 |
| diagram.node.size | 395 |
| drawing.part.index | 394 |
| drawing.drawn.label | 392 |
| diagram.group.id | 383 |
| document.block.rows | 368 |
| calendar.meeting.id | 329 |
| drawing.drawn.color | 305 |
| avatar.part.size | 304 |
| diagram.link.ids | 298 |
| drawing.part.id | 289 |
| avatar.face.preset | 279 |
| avatar.part.id | 274 |
| diagram.chart.sort | 255 |
| diagram.node.x | 241 |
| diagram.node.y | 235 |
| document.block.items | 226 |
| document.section.id | 196 |
| document.block.id | 194 |
| diagram.node.n | 194 |
| document.block.name | 185 |
| document.section.text | 180 |
| document.block.text | 177 |
| calendar.meeting.timezone | 176 |
| drawing.part.owner | 166 |
| avatar.part.place | 159 |
| diagram.node.layout | 156 |
| … 98 more | 5,928 |

## Style (top 40)

| style | rows |
| --- | ---: |
| haiku-v2 | 14,688 |
| haiku-v1 | 11,758 |
| relation-natural | 6,744 |
| human-equivalent | 2,336 |
| human-simplified | 1,824 |
| direct | 1,770 |
| mechanical-trigger | 1,538 |
| mechanical | 1,241 |
| human-complex | 1,182 |
| demo-tool-profile | 1,079 |
| mechanical-orphan | 1,079 |
| comparative-natural | 940 |
| mechanical-typo | 764 |
| mechanical-question | 506 |
| human-wrongish | 108 |
| human-tangle | 102 |
| human-mislead | 101 |
| human-reorder | 48 |
| mechanical-numberwords | 46 |
| human-typo | 44 |
| mechanical-orphan2 | 44 |
| mechanical-simplified | 44 |
| human-syn | 41 |
| human-compound | 19 |
| human-preference | 19 |
| world-inference | 18 |
| human-prohibition | 16 |
| compound | 3 |

## Text length

| measure | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| characters | 2 | 47 | 98 | 268 |
| words | 1 | 9 | 17 | 46 |
