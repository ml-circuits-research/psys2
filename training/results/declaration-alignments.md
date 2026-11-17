# Mechanical declaration alignment

Knowledge commit: 539dd413ae52d978422d0060a5c8a87f0347c517. Examined 1282 published SOP files.
105 properties: 21 unique declaration proposals, 1 ambiguous, 83 without a unique owning declaration/alias.
These are identity proposals, not validated value conversions, runtime bindings, calibration or execution results. The deployed bindings are unchanged.

| Area | Inventory property | Declared candidates / missing contract |
|---|---|---|
| drawing | page.background | w.picture.picture.background |
| drawing | page.scene | w.picture.picture.scene |
| drawing | page.parts_named | missing-owning-property-or-alias |
| drawing | page.mood | missing-owning-property-or-alias |
| drawing | drawn.kind | missing-applicable-family-identity |
| drawing | drawn.at | missing-applicable-family-identity |
| drawing | drawn.relation | missing-applicable-family-identity |
| drawing | drawn.anchor | missing-applicable-family-identity |
| drawing | drawn.direction | missing-applicable-family-identity |
| drawing | drawn.distance | missing-applicable-family-identity |
| drawing | drawn.size | missing-applicable-family-identity |
| drawing | drawn.colour | missing-applicable-family-identity |
| drawing | drawn.fill | missing-applicable-family-identity |
| drawing | drawn.rotation | missing-applicable-family-identity |
| drawing | drawn.flip | missing-applicable-family-identity |
| drawing | drawn.layer | missing-applicable-family-identity |
| drawing | drawn.count | missing-applicable-family-identity |
| drawing | drawn.name | missing-applicable-family-identity |
| drawing | part.part | missing-applicable-family-identity |
| drawing | part.colour | missing-applicable-family-identity |
| drawing | part.size | missing-applicable-family-identity |
| drawing | part.count | missing-applicable-family-identity |
| drawing | part.variant | missing-applicable-family-identity |
| drawing | face.feature | missing-owning-property-or-alias |
| drawing | face.hair_style | missing-owning-property-or-alias |
| drawing | face.colour | missing-owning-property-or-alias |
| drawing | face.expression | w.face.face.expression |
| drawing | face.preset | w.face.face.preset |
| drawing | face.name | w.face.face.name |
| drawing | face.animation | missing-owning-property-or-alias |
| diagram | diagram.kind | missing-applicable-family-identity |
| diagram | diagram.layout | missing-applicable-family-identity |
| diagram | diagram.title | missing-applicable-family-identity |
| diagram | diagram.size | missing-applicable-family-identity |
| diagram | diagram.links | missing-applicable-family-identity |
| diagram | node.label | missing-applicable-family-identity |
| diagram | node.shape | missing-applicable-family-identity |
| diagram | node.colour | missing-applicable-family-identity |
| diagram | node.size | missing-applicable-family-identity |
| diagram | node.position | missing-applicable-family-identity |
| diagram | node.anchor | missing-applicable-family-identity |
| diagram | node.at | missing-applicable-family-identity |
| diagram | node.value | missing-applicable-family-identity |
| diagram | node.group | missing-applicable-family-identity |
| diagram | link.from | w.diagram.edge.from |
| diagram | link.to | w.diagram.edge.to |
| diagram | link.style | missing-owning-property-or-alias |
| diagram | link.arrow | w.diagram.edge.direction |
| diagram | link.label | w.diagram.edge.label |
| diagram | link.colour | missing-owning-property-or-alias |
| diagram | group.label | w.diagram.group.label |
| diagram | group.members | missing-owning-property-or-alias |
| diagram | group.colour | missing-owning-property-or-alias |
| diagram | chart.series | missing-owning-property-or-alias |
| diagram | chart.labels | missing-owning-property-or-alias |
| diagram | chart.values | missing-owning-property-or-alias |
| diagram | chart.axis | missing-owning-property-or-alias |
| diagram | chart.legend | missing-owning-property-or-alias |
| diagram | chart.show_values | missing-owning-property-or-alias |
| diagram | chart.stacked | missing-owning-property-or-alias |
| diagram | chart.horizontal | missing-owning-property-or-alias |
| diagram | chart.sort | missing-owning-property-or-alias |
| diagram | chart.palette | missing-owning-property-or-alias |
| diagram | chart.source | missing-owning-property-or-alias |
| document | text.genre | w.document.document.genre |
| document | text.about | w.document.document.topic, w.document.document.about |
| document | text.title | w.document.document.title |
| document | text.tone | w.document.document.register |
| document | text.length | w.document.document.words |
| document | text.words | w.document.document.words |
| document | text.recipient | missing-owning-property-or-alias |
| document | text.chapters | missing-owning-property-or-alias |
| document | section.role | missing-applicable-family-identity |
| document | section.order | missing-applicable-family-identity |
| document | section.order_anchor | missing-applicable-family-identity |
| document | section.length | missing-applicable-family-identity |
| document | section.words | missing-applicable-family-identity |
| document | section.content | missing-applicable-family-identity |
| document | section.level | missing-applicable-family-identity |
| document | section.count | missing-applicable-family-identity |
| document | inline.format | missing-applicable-family-identity |
| document | inline.list_kind | missing-applicable-family-identity |
| document | inline.align | missing-applicable-family-identity |
| document | inline.task | missing-applicable-family-identity |
| document | inline.checked | missing-applicable-family-identity |
| document | inline.table_size | missing-applicable-family-identity |
| document | inline.link_target | missing-applicable-family-identity |
| calendar | meeting.title | w.calendar.event.title |
| calendar | meeting.day | w.calendar.event.date |
| calendar | meeting.time | missing-owning-property-or-alias |
| calendar | meeting.length | missing-owning-property-or-alias |
| calendar | meeting.end | w.calendar.event.end |
| calendar | meeting.room | missing-owning-property-or-alias |
| calendar | meeting.people | missing-owning-property-or-alias |
| calendar | meeting.recurrence | missing-owning-property-or-alias |
| calendar | meeting.shift | missing-owning-property-or-alias |
| calendar | meeting.relation | missing-owning-property-or-alias |
| calendar | meeting.relation_anchor | missing-owning-property-or-alias |
| calendar | meeting.free | missing-owning-property-or-alias |
| calendar | meeting.agenda | missing-owning-property-or-alias |
| calendar | room.name | w.room.room.name |
| calendar | room.seats | w.room.room.seats |
| calendar | room.quality | missing-owning-property-or-alias |
| calendar | person.name | w.person.person.name |
| calendar | person.role | missing-owning-property-or-alias |

Regenerate: `node training/sop-bert/export-declaration-alignments.mjs ../sop-knowledge-worlds src/vendor/sopworld/sopworld.mjs training/results/declaration-alignments.md`
