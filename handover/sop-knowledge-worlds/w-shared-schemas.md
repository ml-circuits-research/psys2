# Shared world schemas proposed to sop-knowledge-worlds (THIN LIVE WORLDS items 2 and 3)

Written 2026-11-14 from the schemas and extras of the tab worlds. The rule: what any drawing, diagram, chart, document, map or player application would share is a `w.*` schema
in the catalog (SOP Lang only, `std.schema` format, acts of `std.acts`), and a live world keeps only a renderer, an engine and what is truly its own.
A live world takes a published schema with `node scripts/import-w-schema.mjs <catalog> <w.id> worlds/<world>` (generated `schema.sop` + the host's `schema.host.sop`;
`tests/import-w-schema.test.mjs` keeps it fresh). Each proposal below names the kinds and slots as they exist today in the tab schemas, so the first version can be written from them.

## A. New schemas

| proposed | taken from | kinds | slots (today's names) | what the live worlds keep |
| --- | --- | --- | --- | --- |
| `w.shapes` (shapes and connectors) | art.draw (`thing`, `group`, `ground`, `sky`; `colour size fill cover time`), diagram.sketch (`shape`, `arrow`, `text`; `colour size`) | `shape` (sort: a name of k.shapes / k.objects, `colour` of k.values, `size` 0.6..1.5 by tenths or tiny..huge, `fill`, `outline`, `x`, `y`, `layer`, `label`), `connector` (`from`, `to`: shapes; `sort`: arrow, line, double; `label`, `colour`), `group` (`members`: many shapes; `layout`: a name of k.layouts), `text` (`content`, `size`, `x`, `y`) | the acts make, remove, change, place, connect, group, pick, ask, copy, send (connect makes a connector); a deny: a connector joins two shapes that exist and are different | the renderer (scene geometry, SVG), the engine (composition of scenes in art.draw; auto-layout and routing in diagram.sketch, which go to `std.space`) |
| `w.chart` (series and points) | data.charts (`chart`, `point`; `type title axis value label colour legend stacked sort palette`) | `chart` (`type`: enum bar, line, pie, doughnut, radar, scatter, polar; `title`, `legend`, `stacked`, `palette`: a name of k.values palettes), `series` (`chart`, `name`, `colour`), `point` (`series`, `label`, `value`, `colour`) | acts make, remove, change, pick, ask, copy, send (send a chart to a document, download); asks over a series are the library `ask` with an aggregate (total, average, extreme, percent, difference, compare) | the Chart.js renderer, the statistics wording of the answers |
| `w.document` (blocks and sections) | docs.editor (`document`, `section`, `paragraph`, `heading`, `title`, `list`, `item`, `task`, `quote`, `table`, `row`, `column`, `cell`, `rule`; `content style type level size align highlight link order checked`), docs.reader (the reading side) | `document` (`title`), `section` (`document`, `heading`, `level` 1..6), `block` (`section`, `sort`: paragraph, quote, list, task, table, rule; `content`, `align`, `style`, `highlight`, `link`, `level`, `done` for a task, `order`), `row` / `cell` of a table | acts make, remove, change, place (move a block), pick, ask, copy, send, save, load; asks: how many words, what is the title, which tasks are open | the TipTap model and renderer (`editor.mjs`, `model.mjs`), selection by voice (`target.mjs`, which goes to `std.things`), dictation |
| `w.player` (settings as attributes) | media.music (`song`, `melody`, `note`, `chord`, `scale`; `tempo volume instrument key loop pitch duration`) | `player` (`tempo`, `volume`, `instrument`: a name of k.words / k.music, `loop`, `key`, `pitch`), `song` (`title`, `melody`) | a `run` act (play, stop, again) in `std.acts` plus change on attributes (faster, louder, higher are the shared more / less) | the audio engine, the notation reader (`abc.mjs`, `reader.mjs`), the theory tables, which become `k.music` (scales, intervals, chords) |

`w.map`, `w.face`, `w.seating`, `w.timeline` are published; the asks that adopting them still raises are in section B.

## B. Asks on the published schemas (what blocked or changed a live world)

| schema | ask | why |
| --- | --- | --- |
| `w.seating` 2 | a `colour` slot on `table` and `guest` (type: colour of k.values) | the seating tab and its tests paint tables and guests; PSys2 adds it in `schema.host.sop` |
| `w.seating` 2 | the act `place` of a guest at a TABLE: "put Ann at table 2" chooses the first free seat of that table (a slot `at` on `guest` that is a table, or a capacity rule that fills seats in order) | users say a table, the published schema asks for a seat ("Guests go at a seat, not at table 2"); PSys2 keeps `guest in=table capacity=seats` in `schema.host.sop` |
| `w.seating` 2 | a default for `table.seats` (4) | a number slot with no default takes its minimum (1) in the host |
| `w.timeline` 2 | a default for `event.at` (0); `event.name` as an alias of `title` | the host names things by `name`; a number with no default takes -10000 |
| `w.map` 1 | zoom 1..18 (the tile levels the renderer draws), default 2 or 3, with the step words (closer, in, out, back, away, further) as view words | `w.map.view.zoom` is 1..10; the map tab and its 450 tests use 1..18 |
| `w.map` 1 | `layer` as two things: the base layer (offline, street, osm) and the overlays (borders, rivers) | the published `layer` is only the overlay; the renderer needs the base too |
| `w.map` 1 | the place attributes of k.geo as slots read by `ask` (capital, population, area, currency, language, continent, neighbours, landlocked, location, distance) and the kinds `route` and `label` | the map schema keeps 12 attributes and two kinds that `w.map` has not; the questions (superlative, compare, distance, count) are `ask` frames over them |
| `w.face` 1 | a kind `moment` (wink, nod, dance, wave, spin, jump, bounce, wiggle, blink) or an act `animate` in `k.motion` terms | the avatar keeps it in `schema.host.sop` |
| `w.face` 1 | the face key `clothes` collides with the kind `clothes` in a host that names kinds and attributes in one space | the converter drops the attribute and says so in the header |

## C. The extras (`patterns.extra.sop`, `lexicon.extra.sop`, `templates.extra.sop`): each one a frame, a view attribute, an ask, or truly own

Counts are patterns (wires) per action of the hand-written extras today. Where a verb is not an act yet, the frame goes to `w.lang.en` as an act frame and the act to `k.actions` (hand-over).

| world | family (patterns) | becomes | to |
| --- | --- | --- | --- |
| docs.editor (44) | read 8, dictate 2, dictateStop 1 | act `read` (read aloud) with a mode; dictation is truly own (the microphone) | `w.lang.en` act frame `read`; `k.actions` verb `read` aloud |
| docs.editor | checkTask 8, countTasks 3, listTasks 2 | `change` of `done` on a task; `ask` count and list over blocks of sort task | already frames of `change` and `ask`; the 13 patterns go once the world runs on `w.document` |
| docs.editor | stats 6, mentions 1, isEmpty 1, whatIs 1, whatSelected 1 | `ask` frames (how many words, does it mention X, is it empty, what is selected) | `ask` frames in `w.lang.en` |
| docs.editor | fromList 2, holdings 2, make 2, report 1, fillTable 1 | `make` from the conversation (`from=` the session things, std.things selection into a view) | `std.things` selection; no pattern of the world |
| docs.editor | download 1, say 1 | `send` (to a file) and `say` | `send` frame |
| data.charts (163) | compare 19, difference 11, total 10, percent 9, extreme 7, average 4 | `ask` over a series with an aggregate | `ask` frames with an aggregate slot in `w.lang.en` |
| data.charts | fromHoldings 14, fromList 10, fromLegs 9, fromPrices 8, setValues 11 | `make` a chart from things with a numeric aspect (legs, prices, holdings are attributes of other worlds' things) | `std.things` selection into the chart view; `setValues` is `change` of `value` |
| data.charts | describe 8, read 5, listCharts 7, options 4, refresh 4 | `ask` frames, `read` act, `pick` | frames |
| data.charts | download 5, downloadData 6, copyData 5, toDocument 4, toDocumentData 3 | `send` (to a file, to the clipboard, to the document view) | `send` frames with a target class |
| geo.map (221) | superlative 54, compare 12, compareYN 5, distance 10, distanceFrom 7, count 7, info 5, capitalOfWhich 8, isCapital 2, isIn 2, borderYN 4, coords 8, locate 4, listOp 2, describe 1, askPlace 1 | `ask` over k.geo attributes (a superlative is `ask` with `order=`, a comparison is `ask` with two things, a distance is an attribute between two things) | `ask` frames in `w.lang.en`; the attributes in `w.map` / k.geo (section B) |
| geo.map | zoom 14, zoomTo 6, pan 8, reset 6, layer 4, world 5, here 6 | view attributes: `std.schema.view` `zoom`, `centre`, `layer`; `here` and `world` are values of `centre` | `w.map` view; the step words are schema data (`step_more`, `step_less`, `reset`) |
| geo.map | show 9, markSet 11, markHere 6, markers 6, highlights 7 | `show` (a new act: bring a thing into view) and `change` `highlight`; `ask` for the list of markers | `k.actions` verb `show`; `w.lang.en` frame |
| media.music (174) | chordName 13, scaleNotes 10, chordNotes 9, keySig 9, frequency 9, interval 7, above 6, relative 6, enharmonic 5, keyChords 4, keyWith 3 | `ask` over `k.music` (not published) | `k.music` with scales, intervals, chords; one `ask` frame |
| media.music | status 11, volume 7, tempo 3, octave 3, instrument 2, key 1 | `ask` and `change` of the player attributes (view attributes) | `w.player` |
| media.music | playAny 5, playScale 2, playNote 2, playChord 1, replay 1, stop 1, random 1, transpose 1, transposeTo 2 | the act `run` (play, stop, again) with a thing; `change` of `key` | `k.actions` `play`; `std.acts` `run` |
| media.music | songInfo 11, listSongs 8, showScore 7, showNotes 6, listTypes 6, listInstruments 5, melodyShow 5, melodySet 1, askWhat 1 | `ask` and `show` over songs and instruments | frames |
| diagram.sketch (lexicon.extra 2,451 lines, 33 lexicons) | colour 30, outline 32, notColor 36, fill 17 | open lexicon over k.values (done for `color` and `outline`: 62 words replaced by `open=colour`) | k.values |
| diagram.sketch | shape 51, shapeany 55, shapenoun 29, object 55, template 136, layout 31, diagramform 27, scheme 41 | k.shapes, k.objects, k.layouts (names of diagram templates are layouts) | k.shapes, k.layouts, k.scenes |
| diagram.sketch | action 169, ask 53, checkword 164, setvalue 118 | act verbs (k.actions has 97 of the 169), question words, value words (k.values 80 of 118) | k.actions, `w.lang.en` |
| diagram.sketch | topic 717 | the topics of a diagram are words of k.words / k.objects (482 of 717 are there) | k.words |

Everything above that is "truly own" stays: the renderers, the Chart.js and TipTap glue, the audio engine, voice selection, dictation, the microphone.

## D. Value lists a knowledge world already has (item 4)

`node scripts/value-lists.mjs <catalog>` prints, for every hand-written lexicon of the worlds with 8 words or more, how many words the catalog has and in which knowledge world.
Largest finds in the tab worlds: `diagram.sketch.topic` (717 words, 482 in k.words), `diagram.sketch.action` (169, 97 in k.actions), `diagram.sketch.checkword` (164), `diagram.sketch.setvalue` (118, 80 in k.values), `diagram.sketch.shape*` (135, k.shapes 22 of 51), `geo.map.demonyms` (59), `geo.map.amounts` (44, 17 in k.values), `data.charts.extent` (40, 27 in k.values).
Done: `diagram.sketch.color` and `diagram.sketch.outline` are open lexicons over the colour reader. Not done: the lists above need the open-lexicon mechanism for more catalog worlds (`open=knowledge catalog=k.shapes` reads kinds, not the diagram's enum synonyms) and a check that each word still reaches the same enum value.
