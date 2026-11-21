# UI systematic, version 1: canonical anchors for every declared editor function

**These rows are canonical, not paraphrases.** Every row has `style: "canonical"`, `tier: "canonical"`, `canonical: true` and a
suggested training weight `weight: 0.2` (`prepare-official.py` SOURCE_WEIGHTS). They anchor the label of every declared
function in one plain, uniform English command; human paraphrases (20-30 per function: equivalent, complex, simplified)
come from the data worker (`management/COVERAGE-MATRIX.md`, `management/tasks-worker.md`).

## What is enumerated (nothing hand-listed per sentence)

- **Operations and parameters**: the live declared native interfaces of the five editor areas, `declarations.json`
  (`node declarations.mjs dump`: `host.bindings()` of Drawing, Diagram, Documents, Calendar, Avatar), with types, enums,
  min/max/defaults and declared formats.
- **Reader keys**: a parameter maps to a key of `official-dataset/inventory.json` through the ui-coverage-v2 case
  catalogue (`cases.py`) when that names a registered key, else through the importer's rule `<target type>.<parameter>`
  (`data-drop-v1/import.py`); parameters without a key are listed in `functions.json` (`unmapped`) and in the coverage
  matrix as "no reader key".
- **Values**: every value of a closed enum (an even spread of 30 above that), the class bank of the key otherwise, two
  representative numbers inside the declared range, representative text for open strings; calendar starts are a day
  and a clock time resolved against 2026-11-21; durations follow the declared `duration-ms` format.
- **Target forms**: new (make), by name, by code (only tabs that declare an `ids.show` operation: the Show-IDs codes),
  by description, by pronoun (a follow-up: `context.previous` holds the turn that introduced the referent), population
  ("all the arrows", operations taking several ids), selection (UI controls) and context (page/document/avatar level).
- **Combinations**: up to 30 parameter pairs and 8 triples per operation; required parameters are always included;
  compounds (two operations of a tab in one message); the UI controls of `specs/ui-parity.md` and the area controls of
  `worlds/*/area.sop` (gesture -> operation and its parameters).
- **Gold**: reader labels in the official row shape (built with ui-coverage-v2 `build.request()`/`completion()`), and
  `nativeTool`: the exact operation and arguments with the canonical intent text and wires of `describeNativeControl`
  (the UI training-pair mechanism). `executed: false`: the calls are not run; `validArguments: false` marks calls whose
  identity, parent, part index or generated id the world resolves (counted in `validation.json`).

Rebuild: `node declarations.mjs dump > declarations.json && python3 generate.py && python3 validate.py && python3 coverage.py`
(`coverage.py` writes `coverage.json` and `management/COVERAGE-MATRIX.md`). `validate.py` runs the official builder's
Validator and its UI-source conversion on every row (exit 1 on any error).


## Counts

3,536 rows over 174 operations and 651 declared parameters (84 without a reader key or representative value), 192 UI controls.

| tab | operations | declared parameters | unmapped | rows | operation alone | single parameter | pair | triple | compound | control |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| drawing | 28 | 169 | 13 | 1,055 | 67 | 785 | 135 | 36 | 8 | 24 |
| diagram | 78 | 306 | 45 | 1,688 | 181 | 1064 | 269 | 95 | 52 | 27 |
| document | 27 | 81 | 12 | 318 | 47 | 165 | 44 | 28 | 18 | 16 |
| calendar | 17 | 47 | 5 | 149 | 27 | 47 | 44 | 15 | 10 | 6 |
| avatar | 24 | 48 | 9 | 326 | 38 | 217 | 35 | 15 | 13 | 8 |

| tab | new | name | code | description | pronoun | population | selection | context |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| drawing | 390 | 199 | 120 | 118 | 110 | 72 | 14 | 24 |
| diagram | 404 | 402 | 298 | 52 | 207 | 103 | 25 | 145 |
| document | 133 | 68 | 0 | 23 | 34 | 4 | 10 | 28 |
| calendar | 53 | 57 | 0 | 0 | 23 | 1 | 4 | 1 |
| avatar | 57 | 36 | 33 | 32 | 30 | 0 | 7 | 118 |

## Rows per operation

| tab | operation | parameters (declared / with key) | rows | single | pairs + triples | controls |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| drawing | `drawing.object.make` | 41 / 38 | 223 | 183 | 38 | 2 |
| drawing | `drawing.catalog.make` | 25 / 22 | 132 | 94 | 38 | 0 |
| drawing | `drawing.object.change` | 44 / 43 | 374 | 330 | 38 | 6 |
| drawing | `drawing.object.select` | 1 / 1 | 4 | 4 | 0 | 0 |
| drawing | `drawing.objects.select` | 1 / 1 | 1 | 1 | 0 | 0 |
| drawing | `drawing.object.place` | 3 / 3 | 13 | 12 | 0 | 1 |
| drawing | `drawing.object.move` | 3 / 3 | 15 | 14 | 1 | 0 |
| drawing | `drawing.objects.transform` | 5 / 5 | 33 | 24 | 8 | 1 |
| drawing | `drawing.page.clear` | 0 / 0 | 1 | 1 | 0 | 0 |
| drawing | `drawing.object.remove` | 1 / 1 | 6 | 5 | 0 | 1 |
| drawing | `drawing.ids.show` | 2 / 2 | 5 | 5 | 0 | 0 |
| drawing | `drawing.observe` | 0 / 0 | 1 | 1 | 0 | 0 |
| drawing | `drawing.undo` | 0 / 0 | 1 | 1 | 0 | 0 |
| drawing | `drawing.redo` | 0 / 0 | 1 | 1 | 0 | 0 |
| drawing | `drawing.object.parts` | 1 / 1 | 4 | 4 | 0 | 0 |
| drawing | `drawing.part.select` | 2 / 2 | 10 | 9 | 1 | 0 |
| drawing | `drawing.part.change` | 14 / 10 | 84 | 43 | 38 | 3 |
| drawing | `drawing.part.place` | 4 / 4 | 17 | 12 | 4 | 1 |
| drawing | `drawing.part.remove` | 2 / 2 | 11 | 9 | 1 | 1 |
| drawing | `drawing.part.extract` | 2 / 2 | 11 | 9 | 1 | 1 |
| drawing | `drawing.object.group` | 3 / 3 | 19 | 17 | 1 | 1 |
| drawing | `drawing.object.ungroup` | 1 / 1 | 5 | 4 | 0 | 1 |
| drawing | `drawing.part.add` | 4 / 3 | 35 | 32 | 1 | 2 |
| drawing | `drawing.person.vary` | 1 / 1 | 1 | 0 | 0 | 1 |
| drawing | `drawing.person.expression` | 3 / 3 | 15 | 13 | 1 | 1 |
| drawing | `drawing.page.change` | 1 / 1 | 9 | 9 | 0 | 0 |
| drawing | `drawing.person.pose` | 2 / 2 | 12 | 11 | 0 | 1 |
| drawing | `drawing.person.hold` | 3 / 2 | 4 | 4 | 0 | 0 |
| diagram | `diagram.node.make` | 18 / 12 | 149 | 110 | 38 | 1 |
| diagram | `diagram.node.change` | 21 / 15 | 213 | 171 | 38 | 4 |
| diagram | `diagram.node.select` | 2 / 2 | 5 | 5 | 0 | 0 |
| diagram | `diagram.node.remove` | 1 / 1 | 6 | 5 | 0 | 1 |
| diagram | `diagram.node.place` | 3 / 3 | 13 | 12 | 0 | 1 |
| diagram | `diagram.node.resize` | 3 / 3 | 14 | 12 | 1 | 1 |
| diagram | `diagram.node.layout` | 2 / 2 | 11 | 11 | 0 | 0 |
| diagram | `diagram.link.make` | 13 / 13 | 89 | 56 | 32 | 1 |
| diagram | `diagram.link.select` | 2 / 2 | 4 | 4 | 0 | 0 |
| diagram | `diagram.link.change` | 21 / 21 | 168 | 122 | 38 | 8 |
| diagram | `diagram.link.remove` | 1 / 1 | 4 | 4 | 0 | 0 |
| diagram | `diagram.selection.remove` | 2 / 2 | 1 | 1 | 0 | 0 |
| diagram | `diagram.page.clear` | 0 / 0 | 0 | 0 | 0 | 0 |
| diagram | `diagram.ids.show` | 2 / 2 | 5 | 5 | 0 | 0 |
| diagram | `diagram.observe` | 0 / 0 | 1 | 1 | 0 | 0 |
| diagram | `diagram.undo` | 0 / 0 | 1 | 1 | 0 | 0 |
| diagram | `diagram.redo` | 0 / 0 | 1 | 1 | 0 | 0 |
| diagram | `diagram.group.make` | 3 / 3 | 5 | 4 | 1 | 0 |
| diagram | `diagram.group.select` | 1 / 1 | 3 | 3 | 0 | 0 |
| diagram | `diagram.group.change` | 4 / 4 | 35 | 29 | 4 | 2 |
| diagram | `diagram.group.layout` | 2 / 2 | 15 | 14 | 0 | 1 |
| diagram | `diagram.group.resize` | 2 / 2 | 5 | 4 | 0 | 1 |
| diagram | `diagram.group.place` | 4 / 3 | 13 | 11 | 1 | 1 |
| diagram | `diagram.group.remove` | 1 / 1 | 4 | 3 | 0 | 1 |
| diagram | `diagram.group.ungroup` | 1 / 1 | 4 | 3 | 0 | 1 |
| diagram | `diagram.group.chart.make` | 14 / 4 | 19 | 12 | 7 | 0 |
| diagram | `diagram.group.chart.adopt` | 1 / 1 | 1 | 1 | 0 | 0 |
| diagram | `diagram.group.chart` | 3 / 3 | 18 | 15 | 3 | 0 |
| diagram | `diagram.layout` | 4 / 0 | 1 | 1 | 0 | 0 |
| diagram | `diagram.layout.improve` | 0 / 0 | 1 | 1 | 0 | 0 |
| diagram | `diagram.steps.number` | 1 / 1 | 2 | 2 | 0 | 0 |
| diagram | `diagram.nodes.align` | 2 / 2 | 10 | 10 | 0 | 0 |
| diagram | `diagram.nodes.distribute` | 2 / 2 | 6 | 6 | 0 | 0 |
| diagram | `diagram.style.apply` | 4 / 3 | 36 | 35 | 1 | 0 |
| diagram | `diagram.colour.by` | 2 / 0 | 0 | 0 | 0 | 0 |
| diagram | `diagram.links.connect` | 4 / 2 | 4 | 4 | 0 | 0 |
| diagram | `diagram.link.reverse` | 1 / 1 | 4 | 4 | 0 | 0 |
| diagram | `diagram.node.insert` | 3 / 2 | 24 | 24 | 0 | 0 |
| diagram | `diagram.node.duplicate` | 1 / 1 | 5 | 5 | 0 | 0 |
| diagram | `diagram.node.merge` | 2 / 2 | 11 | 11 | 0 | 0 |
| diagram | `diagram.node.split` | 2 / 2 | 11 | 11 | 0 | 0 |
| diagram | `diagram.chart.value` | 3 / 3 | 7 | 7 | 0 | 0 |
| diagram | `diagram.chart.category.add` | 3 / 3 | 8 | 8 | 0 | 0 |
| diagram | `diagram.chart.category.remove` | 2 / 2 | 3 | 3 | 0 | 0 |
| diagram | `diagram.chart.category.rename` | 3 / 3 | 7 | 7 | 0 | 0 |
| diagram | `diagram.chart.format` | 37 / 37 | 194 | 156 | 38 | 0 |
| diagram | `diagram.link.improve` | 1 / 1 | 4 | 4 | 0 | 0 |
| diagram | `diagram.nodes.swap` | 1 / 1 | 5 | 5 | 0 | 0 |
| diagram | `diagram.node.scale` | 2 / 1 | 0 | 0 | 0 | 0 |
| diagram | `diagram.chart.highlight` | 4 / 4 | 26 | 24 | 2 | 0 |
| diagram | `diagram.chart.sort` | 2 / 2 | 4 | 4 | 0 | 0 |
| diagram | `diagram.page.change` | 2 / 2 | 5 | 4 | 1 | 0 |
| diagram | `diagram.chart.series.add` | 4 / 4 | 31 | 22 | 9 | 0 |
| diagram | `diagram.preference.state` | 3 / 3 | 10 | 7 | 3 | 0 |
| diagram | `diagram.chart.series.change` | 4 / 4 | 26 | 22 | 4 | 0 |
| diagram | `diagram.preference.reset` | 1 / 1 | 5 | 5 | 0 | 0 |
| diagram | `diagram.chart.series.remove` | 1 / 1 | 1 | 1 | 0 | 0 |
| diagram | `diagram.chart.point.add` | 3 / 2 | 3 | 3 | 0 | 0 |
| diagram | `diagram.chart.point.change` | 6 / 2 | 3 | 3 | 0 | 0 |
| diagram | `diagram.chart.point.remove` | 1 / 1 | 1 | 1 | 0 | 0 |
| diagram | `diagram.link.attach` | 6 / 6 | 53 | 34 | 18 | 1 |
| diagram | `diagram.link.detach` | 5 / 5 | 42 | 32 | 10 | 0 |
| diagram | `diagram.link.bend.add` | 4 / 4 | 18 | 15 | 3 | 0 |
| diagram | `diagram.link.bend.move` | 4 / 4 | 17 | 15 | 2 | 0 |
| diagram | `diagram.link.bend.remove` | 2 / 2 | 5 | 5 | 0 | 0 |
| diagram | `diagram.page.new` | 1 / 1 | 3 | 3 | 0 | 0 |
| diagram | `chart.make` | 7 / 7 | 46 | 19 | 27 | 0 |
| diagram | `chart.change` | 10 / 10 | 79 | 41 | 38 | 0 |
| diagram | `chart.data.change` | 4 / 4 | 13 | 10 | 3 | 0 |
| diagram | `chart.datasets.change` | 3 / 3 | 6 | 6 | 0 | 0 |
| diagram | `chart.series.add` | 4 / 4 | 12 | 5 | 7 | 0 |
| diagram | `chart.series.change` | 5 / 5 | 26 | 8 | 18 | 0 |
| diagram | `chart.series.remove` | 2 / 2 | 4 | 3 | 1 | 0 |
| diagram | `chart.point.change` | 4 / 4 | 14 | 7 | 7 | 0 |
| diagram | `chart.select` | 1 / 1 | 3 | 3 | 0 | 0 |
| diagram | `chart.place` | 5 / 5 | 24 | 14 | 9 | 1 |
| diagram | `chart.remove` | 1 / 1 | 5 | 4 | 0 | 1 |
| diagram | `chart.observe` | 0 / 0 | 1 | 1 | 0 | 0 |
| document | `document.title.change` | 2 / 1 | 3 | 2 | 0 | 1 |
| document | `document.block.select` | 4 / 3 | 7 | 6 | 0 | 1 |
| document | `document.section.select` | 4 / 3 | 4 | 4 | 0 | 0 |
| document | `document.section.change` | 6 / 5 | 21 | 11 | 10 | 0 |
| document | `document.block.mark` | 7 / 6 | 22 | 16 | 5 | 1 |
| document | `document.section.mark` | 7 / 5 | 8 | 8 | 0 | 0 |
| document | `document.block.align` | 2 / 2 | 6 | 5 | 0 | 1 |
| document | `document.section.align` | 2 / 2 | 0 | 0 | 0 | 0 |
| document | `document.block.reorder` | 1 / 1 | 5 | 4 | 0 | 1 |
| document | `document.list.make` | 4 / 3 | 7 | 6 | 1 | 0 |
| document | `document.list.change` | 4 / 4 | 14 | 10 | 1 | 3 |
| document | `document.table.make` | 4 / 3 | 8 | 5 | 3 | 0 |
| document | `document.table.change` | 3 / 3 | 8 | 6 | 1 | 1 |
| document | `document.container.change` | 2 / 2 | 4 | 3 | 0 | 1 |
| document | `document.write` | 4 / 4 | 39 | 29 | 9 | 1 |
| document | `document.compose` | 4 / 4 | 39 | 30 | 9 | 0 |
| document | `document.rewrite` | 2 / 2 | 21 | 20 | 1 | 0 |
| document | `document.block.make` | 5 / 4 | 15 | 8 | 4 | 3 |
| document | `document.section.make` | 5 / 4 | 25 | 15 | 10 | 0 |
| document | `document.block.change` | 6 / 6 | 29 | 10 | 18 | 1 |
| document | `document.block.remove` | 1 / 1 | 5 | 4 | 0 | 1 |
| document | `document.section.remove` | 1 / 1 | 3 | 3 | 0 | 0 |
| document | `document.section.reorder` | 1 / 1 | 3 | 3 | 0 | 0 |
| document | `document.remove` | 0 / 0 | 1 | 1 | 0 | 0 |
| document | `document.observe` | 0 / 0 | 1 | 1 | 0 | 0 |
| document | `document.undo` | 0 / 0 | 1 | 1 | 0 | 0 |
| document | `document.redo` | 0 / 0 | 1 | 1 | 0 | 0 |
| calendar | `calendar.calendar.add` | 3 / 2 | 5 | 4 | 1 | 0 |
| calendar | `calendar.calendar.change` | 3 / 3 | 7 | 6 | 1 | 0 |
| calendar | `calendar.calendar.remove` | 1 / 1 | 2 | 2 | 0 | 0 |
| calendar | `calendar.person.add` | 2 / 1 | 2 | 2 | 0 | 0 |
| calendar | `calendar.person.change` | 2 / 2 | 4 | 4 | 0 | 0 |
| calendar | `calendar.person.remove` | 1 / 1 | 2 | 2 | 0 | 0 |
| calendar | `calendar.room.add` | 4 / 3 | 9 | 5 | 4 | 0 |
| calendar | `calendar.room.change` | 4 / 4 | 12 | 8 | 4 | 0 |
| calendar | `calendar.room.remove` | 1 / 1 | 2 | 2 | 0 | 0 |
| calendar | `calendar.meeting.add` | 8 / 7 | 26 | 9 | 17 | 0 |
| calendar | `calendar.event.select` | 1 / 1 | 2 | 2 | 0 | 0 |
| calendar | `calendar.event.add` | 5 / 4 | 11 | 6 | 3 | 2 |
| calendar | `calendar.meeting.change` | 8 / 8 | 46 | 16 | 29 | 1 |
| calendar | `calendar.meeting.move` | 2 / 2 | 4 | 2 | 0 | 2 |
| calendar | `calendar.events.remove` | 1 / 1 | 4 | 3 | 0 | 1 |
| calendar | `calendar.meeting.remove` | 1 / 1 | 0 | 0 | 0 | 0 |
| calendar | `calendar.observe` | 0 / 0 | 1 | 1 | 0 | 0 |
| avatar | `avatar.face.compose` | 3 / 2 | 20 | 19 | 1 | 0 |
| avatar | `avatar.face.preset` | 2 / 1 | 15 | 15 | 0 | 0 |
| avatar | `avatar.face.expression` | 2 / 1 | 13 | 13 | 0 | 0 |
| avatar | `avatar.face.name` | 2 / 1 | 2 | 2 | 0 | 0 |
| avatar | `avatar.face.select` | 1 / 0 | 1 | 1 | 0 | 0 |
| avatar | `avatar.ids.show` | 2 / 2 | 6 | 5 | 1 | 0 |
| avatar | `avatar.part.select` | 1 / 1 | 4 | 4 | 0 | 0 |
| avatar | `avatar.face.resize` | 2 / 1 | 2 | 2 | 0 | 0 |
| avatar | `avatar.part.resize` | 2 / 2 | 6 | 5 | 0 | 1 |
| avatar | `avatar.part.add` | 2 / 2 | 57 | 56 | 0 | 1 |
| avatar | `avatar.part.change` | 5 / 5 | 79 | 66 | 10 | 3 |
| avatar | `avatar.part.feature` | 3 / 3 | 36 | 35 | 0 | 1 |
| avatar | `avatar.part.move` | 2 / 2 | 8 | 7 | 0 | 1 |
| avatar | `avatar.part.remove` | 1 / 1 | 4 | 4 | 0 | 0 |
| avatar | `avatar.parts.remove` | 1 / 1 | 1 | 0 | 0 | 1 |
| avatar | `avatar.clear` | 1 / 1 | 1 | 1 | 0 | 0 |
| avatar | `avatar.observe` | 0 / 0 | 1 | 1 | 0 | 0 |
| avatar | `avatar.undo` | 0 / 0 | 1 | 1 | 0 | 0 |
| avatar | `avatar.redo` | 0 / 0 | 1 | 1 | 0 | 0 |
| avatar | `avatar.face.pose` | 1 / 0 | 0 | 0 | 0 | 0 |
| avatar | `avatar.figure.default` | 0 / 0 | 0 | 0 | 0 | 0 |
| avatar | `avatar.figure.describe` | 9 / 9 | 39 | 10 | 29 | 0 |
| avatar | `avatar.preference.state` | 4 / 4 | 12 | 4 | 8 | 0 |
| avatar | `avatar.preference.reset` | 2 / 2 | 4 | 3 | 1 | 0 |

## Unmapped declared parameters

| tab | operation | parameter | reason |
| --- | --- | --- | --- |
| drawing | `drawing.object.make` | age | no reader key drawn.age in official-dataset/inventory.json |
| drawing | `drawing.object.make` | sex | no reader key drawn.sex in official-dataset/inventory.json |
| drawing | `drawing.object.make` | toward | no reader key drawn.toward in official-dataset/inventory.json |
| drawing | `drawing.catalog.make` | age | no reader key drawn.age in official-dataset/inventory.json |
| drawing | `drawing.catalog.make` | sex | no reader key drawn.sex in official-dataset/inventory.json |
| drawing | `drawing.catalog.make` | toward | no reader key drawn.toward in official-dataset/inventory.json |
| drawing | `drawing.object.change` | toward | no reader key drawn.toward in official-dataset/inventory.json |
| drawing | `drawing.part.change` | variant | no reader key part.variant in official-dataset/inventory.json |
| drawing | `drawing.part.change` | length | no reader key part.length in official-dataset/inventory.json |
| drawing | `drawing.part.change` | shape | no reader key part.shape in official-dataset/inventory.json |
| drawing | `drawing.part.change` | material | no reader key part.material in official-dataset/inventory.json |
| drawing | `drawing.part.add` | variant | no reader key part.variant in official-dataset/inventory.json |
| drawing | `drawing.person.hold` | thing | no reader key drawn.thing in official-dataset/inventory.json |
| diagram | `diagram.node.make` | fontStyle | no reader key node.fontStyle in official-dataset/inventory.json |
| diagram | `diagram.node.make` | source | no reader key node.source in official-dataset/inventory.json |
| diagram | `diagram.node.make` | caption | no reader key node.caption in official-dataset/inventory.json |
| diagram | `diagram.node.make` | rows | no reader key node.rows in official-dataset/inventory.json |
| diagram | `diagram.node.make` | columns | no reader key node.columns in official-dataset/inventory.json |
| diagram | `diagram.node.make` | cells | no reader key node.cells in official-dataset/inventory.json |
| diagram | `diagram.node.change` | fontStyle | no reader key node.fontStyle in official-dataset/inventory.json |
| diagram | `diagram.node.change` | source | no reader key node.source in official-dataset/inventory.json |
| diagram | `diagram.node.change` | caption | no reader key node.caption in official-dataset/inventory.json |
| diagram | `diagram.node.change` | rows | no reader key node.rows in official-dataset/inventory.json |
| diagram | `diagram.node.change` | columns | no reader key node.columns in official-dataset/inventory.json |
| diagram | `diagram.node.change` | cells | no reader key node.cells in official-dataset/inventory.json |
| diagram | `diagram.node.select` | edges | no representative value (structured array) |
| diagram | `diagram.link.select` | nodes | no representative value (structured array) |
| diagram | `diagram.selection.remove` | nodes | no representative value (structured array) |
| diagram | `diagram.selection.remove` | links | no representative value (structured array) |
| diagram | `diagram.group.make` | ids | no representative value (structured array) |
| diagram | `diagram.group.place` | at | no reader key group.at in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | dimension | no reader key group.dimension in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | measure | no reader key group.measure in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | aggregate | no reader key group.aggregate in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | top | no reader key group.top in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | above | no reader key group.above in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | below | no reader key group.below in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | only | no reader key group.only in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | sort | no reader key group.sort in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | bins | no reader key group.bins in official-dataset/inventory.json |
| diagram | `diagram.group.chart.make` | errors | no reader key group.errors in official-dataset/inventory.json |
| diagram | `diagram.layout` | layout | no reader key page.layout in official-dataset/inventory.json |
| diagram | `diagram.layout` | direction | no reader key page.direction in official-dataset/inventory.json |
| diagram | `diagram.layout` | spacing | no reader key page.spacing in official-dataset/inventory.json |
| diagram | `diagram.layout` | route | no reader key page.route in official-dataset/inventory.json |
| diagram | `diagram.style.apply` | theme | no reader key node.theme in official-dataset/inventory.json |
| diagram | `diagram.colour.by` | by | no reader key node.by in official-dataset/inventory.json |
| diagram | `diagram.colour.by` | theme | no reader key node.theme in official-dataset/inventory.json |
| diagram | `diagram.links.connect` | ids | no representative value (structured array) |
| diagram | `diagram.links.connect` | hub | no reader key link.hub in official-dataset/inventory.json |
| diagram | `diagram.links.connect` | confirm | no reader key link.confirm in official-dataset/inventory.json |
| diagram | `diagram.node.insert` | link | no reader key node.link in official-dataset/inventory.json |
| diagram | `diagram.node.scale` | factor | no reader key node.factor in official-dataset/inventory.json |
| diagram | `diagram.chart.point.add` | label | no reader key point.label in official-dataset/inventory.json |
| diagram | `diagram.chart.point.change` | add | no reader key point.add in official-dataset/inventory.json |
| diagram | `diagram.chart.point.change` | subtract | no reader key point.subtract in official-dataset/inventory.json |
| diagram | `diagram.chart.point.change` | label | no reader key point.label in official-dataset/inventory.json |
| diagram | `diagram.chart.point.change` | colour | no reader key point.colour in official-dataset/inventory.json |
| document | `document.title.change` | id | excluded in ui-coverage-v2/cases.py |
| document | `document.block.select` | at | excluded in ui-coverage-v2/cases.py |
| document | `document.section.select` | at | excluded in ui-coverage-v2/cases.py |
| document | `document.section.change` | kind | excluded in ui-coverage-v2/cases.py |
| document | `document.block.mark` | at | excluded in ui-coverage-v2/cases.py |
| document | `document.section.mark` | at | excluded in ui-coverage-v2/cases.py |
| document | `document.section.mark` | attrs | excluded in ui-coverage-v2/cases.py |
| document | `document.list.make` | parent | excluded in ui-coverage-v2/cases.py |
| document | `document.list.change` | checked | no representative value (structured array) |
| document | `document.table.make` | parent | excluded in ui-coverage-v2/cases.py |
| document | `document.block.make` | parent | excluded in ui-coverage-v2/cases.py |
| document | `document.section.make` | parent | excluded in ui-coverage-v2/cases.py |
| calendar | `calendar.calendar.add` | id | excluded in ui-coverage-v2/cases.py |
| calendar | `calendar.person.add` | id | excluded in ui-coverage-v2/cases.py |
| calendar | `calendar.room.add` | id | excluded in ui-coverage-v2/cases.py |
| calendar | `calendar.meeting.add` | id | excluded in ui-coverage-v2/cases.py |
| calendar | `calendar.event.add` | id | excluded in ui-coverage-v2/cases.py |
| avatar | `avatar.face.compose` | id | excluded in ui-coverage-v2/cases.py |
| avatar | `avatar.face.preset` | id | excluded in ui-coverage-v2/cases.py |
| avatar | `avatar.face.expression` | id | excluded in ui-coverage-v2/cases.py |
| avatar | `avatar.face.name` | id | excluded in ui-coverage-v2/cases.py |
| avatar | `avatar.face.select` | id | excluded in ui-coverage-v2/cases.py |
| avatar | `avatar.face.resize` | id | excluded in ui-coverage-v2/cases.py |
| avatar | `avatar.face.pose` | pose | no reader key face.pose in official-dataset/inventory.json |
| avatar | `avatar.figure.describe` | traits | no representative value (structured array) |
| avatar | `avatar.figure.describe` | without | no representative value (structured array) |
