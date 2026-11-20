# Missing capabilities — 2026-11-20 @ 85347ce60

From the mass evaluation (stratified (rate 0.01, min 20 per tab x usage class, >=3 per operation, >=5 per key family), 3002 rows). Each cause is the first failing reusable piece of a row (oracle level: the labels are the reading). "est. rows" scales the sample by the stratum weights. Layers: bindings (no bound property/kind/value representation), knowledge (kind words not in the catalog binding), rule (bridge projection/rule missing), no-operation (no declared capability for act+family+keys), execution (refused at execution or target), wrong-effect (acted, expectation failed), needs (labelled meaning without a key), setup (context object not creatable by the area's commands), data (labels inconsistent with the text).

## Oracle level (runtime, independent of the reader)

1. **binding missing: diagram.node target without a kind word (fill=written)** — 59 sample rows, ≈2519 rows in the data; layer bindings; diagram 59
   - `data-drop-v1:dg-batch-02-diagram-01167`: "bump the Plan label up to 18 point"
   - `data-drop-v1:dg-batch-02-diagram-01458`: "list everything the Review step connects to"
   - `data-drop-v1:dg-batch-02-diagram-01665`: "orange Start and dashed Collect"
2. **no operation for change drawing.drawn [drawn.colour]** — 31 sample rows, ≈2100 rows in the data; layer no-operation; drawing 31
   - `demo-tool-profile:data/haiku-v1/drawing/b01a.jsonl:drawing-b01-0018`: "make flower green."
   - `demo-tool-profile:data/haiku-v1/drawing/b05a.jsonl:drawing-b05-0015`: "I need you to make avatar orange. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/drawing/b12b.jsonl:drawing-b12-0173`: "Hey, make swing red. That would help."
3. **binding missing: relation anchor reference in drawing** — 34 sample rows, ≈1629 rows in the data; layer bindings; drawing 34
   - `data-drop-v1:pilot-drawing-00023`: "please a lake, a little boat on it, a house beside the lake"
   - `data-drop-v1:pilot-drawing-00032`: "lake, boat on it, house nearby, if you can"
   - `demo-tool-profile:data/haiku-v1/drawing/b07a.jsonl:drawing-b07-0017`: "Hey, put heart to the left of Reference. That would help."
4. **target not resolved for change diagram.chart (fill=context)** — 46 sample rows, ≈1088 rows in the data; layer execution; diagram 46
   - `data-drop-v1:dg-batch-02-diagram-00177`: "we keep arguing where 50 lands, turn the grid on"
   - `data-drop-v1:dg-batch-02-diagram-00195`: "please take the gridlines off the chart"
   - `data-drop-v1:dg-batch-02-diagram-00200`: "with only three categories the guides are noise, drop them"
5. **rule missing: query projection ask=what for drawing.drawn** — 15 sample rows, ≈1078 rows in the data; layer rule; drawing 15
   - `demo-tool-profile:data/haiku-v1/drawing/b01a.jsonl:drawing-b01-0114`: "Could you what colour is cat?. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/drawing/b05a.jsonl:drawing-b05-0079`: "what colour is face a?."
   - `demo-tool-profile:data/haiku-v1/drawing/b13a.jsonl:drawing-b13-0006`: "I need you to what colour is castle?. I appreciate it."
6. **host refused drawing.drawn.relation (make drawing.drawn)** — 18 sample rows, ≈1075 rows in the data; layer execution; drawing 18
   - `ui-coverage-v2:ui-coverage-v2-drawing-00086`: "draw a tree next to the house"
   - `ui-relations-v1:ui-relations-00879`: "draw a leafless tree on the left side of the tree"
   - `ui-relations-v1:ui-relations-01748`: "give me a tractor just right of that tree"
7. **binding missing for avatar.part.id** — 19 sample rows, ≈945 rows in the data; layer bindings; avatar 19
   - `main-synthetic:syn-enriched-mech-3629:with-previous`: "a tapered for me, glasses"
   - `main-synthetic:syn-enriched-mech-3682`: "cheeks — add a heart, please"
   - `main-synthetic:syn-enriched-mech-3735`: "a mole for me, earrings"
8. **knowledge: kind words of drawing.drawn not bound** — 14 sample rows, ≈813 rows in the data; layer knowledge; drawing 14
   - values: the trees (2), object (2), a second boat (1), cottage-y home things (1), filed (1), bota (1), ranibow (1), arow (1), blanched almond (1), silver (1), tube (1), magenta (1)
   - `data-drop-v1:dw-batch-01-drawing-01307`: "stick a second boat by the first one"
   - `data-drop-v1:pilot-drawing-00277`: "the same for the trees, thanks"
   - `data-drop-v1:pilot-drawing-00275`: "please the same for the trees"
9. **binding missing for calendar.meeting.calendar** — 29 sample rows, ≈808 rows in the data; layer bindings; calendar 29
   - `demo-tool-profile:data/haiku-v1/calendar/b02a.jsonl:calendar-b02-0084`: "which events are on Work 3 on 2026-12-15?."
   - `demo-tool-profile:data/haiku-v1/calendar/b01a.jsonl:calendar-b01-0122`: "Please, which events are on Work 8 on 2026-12-16?. Thanks!"
   - `demo-tool-profile:data/haiku-v1/calendar/b05b.jsonl:calendar-b05-0219`: "Hey, which events are on Work 2 on 2026-12-06?. That would help."
10. **binding missing for document.section.content** — 26 sample rows, ≈791 rows in the data; layer bindings; document 26
   - `demo-tool-profile:data/haiku-v1/document/b02a.jsonl:document-b02-0101`: "I need you to replace Draft 2 with \"Bring the revised notes to the meeting.\". I appreciate it."
   - `demo-tool-profile:data/haiku-v1/document/b02b.jsonl:document-b02-0144`: "Let us replace Essay draft with \"Everyone can read the new summary.\". That would help."
   - `demo-tool-profile:data/haiku-v1/document/b02b.jsonl:document-b02-0145`: "Could you add a heading called Dinosaur report. I appreciate it."
11. **rule missing: context reference (fill=context) for document.text** — 20 sample rows, ≈789 rows in the data; layer rule; document 20
   - `demo-tool-profile:data/haiku-v1/document/b03b.jsonl:document-b03-0198`: "Please, how many words are in the document?. Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b09b.jsonl:document-b09-0166`: "Hey, how many words are in the document?."
   - `demo-tool-profile:data/haiku-v1/document/b09b.jsonl:document-b09-0194`: "Hey, how many words are in the document?."
12. **binding missing: diagram.node target without a kind word (fill=context)** — 23 sample rows, ≈774 rows in the data; layer bindings; diagram 23
   - `data-drop-v1:dg-batch-02-diagram-00994`: "link them al in a loop"
   - `data-drop-v1:dg-batch-02-diagram-01372`: "not the first, the second"
   - `data-drop-v1:pilot-diagram-00147`: "space the steps out evenly, thanks"
13. **target not resolved for change diagram.chart (fill=written)** — 16 sample rows, ≈747 rows in the data; layer execution; diagram 16
   - `data-drop-v1:dg-batch-02-diagram-00352`: "the marketing deck needs warm colours on the Expenses by department chart"
   - `data-drop-v1:dg-batch-02-diagram-00045`: "hide the legende on the Revenue chart"
   - `data-drop-v1:dg-batch-02-diagram-00412:with-previous`: "drop the shadow from the Sales by month chart"
14. **binding missing for calendar.meeting.day** — 19 sample rows, ≈728 rows in the data; layer bindings; calendar 19
   - `demo-tool-profile:data/haiku-v1/calendar/b02b.jsonl:calendar-b02-0168`: "Hey, place Review to 2026-12-12 at 16:00 UTC."
   - `demo-tool-profile:data/haiku-v1/calendar/b09b.jsonl:calendar-b09-0132`: "put Review to 2026-12-16 at 12:00 UTC."
   - `demo-tool-profile:data/haiku-v1/calendar/b06b.jsonl:calendar-b06-0137`: "Please, place Review to 2026-12-19 at 11:00 UTC. Thanks!"
15. **binding missing for calendar.calendar.name** — 23 sample rows, ≈701 rows in the data; layer bindings; calendar 23
   - `demo-tool-profile:data/haiku-v1/calendar/b05a.jsonl:calendar-b05-0106`: "I need you to create a calendar called Work 1; then book Review on Work 1 on 2026-12-09 at 09:00 UTC for 15 minutes. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/calendar/b11a.jsonl:calendar-b11-0031`: "add a calendar called Work 8; then schedule Review on Work 8 on 2026-12-04 at 16:00 UTC for 60 minutes."
   - `demo-tool-profile:data/haiku-v2/calendar/v2b03b.jsonl:calendar-v2b03-0179`: "Please, add a calendar called Work 3; then schedule Review on Work 3 on 2026-12-19 at 11:00 UTC for 45 minutes. Thanks!"
16. **rule missing: query projection ask=list for diagram.chart** — 10 sample rows, ≈678 rows in the data; layer rule; diagram 10
   - `demo-tool-profile:data/haiku-v1/diagram/b05a.jsonl:diagram-b05-0020`: "Hey, what values does Core router show?."
   - `demo-tool-profile:data/haiku-v1/diagram/b01a.jsonl:diagram-b01-0110`: "I need you to what values does Gateway show?. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/diagram/b06b.jsonl:diagram-b06-0177`: "Let us what values does Photosynthesis show?. That would help."
17. **binding missing for diagram.series.label** — 15 sample rows, ≈675 rows in the data; layer bindings; diagram 15
   - `data-drop-v1:dg-batch-02-diagram-00676`: "remove Series 2"
   - `data-drop:dg-batch-02:diagram:668`: "Series 1 carries outdated figures — fill it with 24, 26, 28"
   - `ui-diagram-v2:ui-diagram-v2-05934`: "retitle the series Target to Online"
18. **binding missing for document.block.id** — 26 sample rows, ≈620 rows in the data; layer bindings; document 26
   - `main-synthetic:syn-document-2-1845`: "That unit Intro, 2 and 3 — picked"
   - `main-synthetic:syn-document-2-1753:with-previous`: "If it's not too much trouble, blocks Intro, 2 and 3 want the underline, enabled Main."
   - `main-synthetic:syn-document-2069`: "mark the block Intro 2 3 with an underline, Main enabled"
19. **binding missing: diagram.point target without a kind word (fill=-)** — 16 sample rows, ≈590 rows in the data; layer bindings; diagram 16
   - `data-drop-v1:dg-batch-02-diagram-00549`: "redcue April by 3"
   - `data-drop-v1:dg-batch-02-diagram-00708`: "bump January to 12 and drop February to 5"
   - `data-drop-v1:dg-batch-02-diagram-00503`: "raise the May value by 6"
20. **placement refused (tool-binding) for make drawing.drawn [drawn.anchor (selector), drawn.relation]** — 9 sample rows, ≈537 rows in the data; layer execution; drawing 9
   - `ui-relations-v1:ui-relations-00921`: "draw a mite left of the mountain"
   - `ui-relations-v1:ui-relations-01144`: "put a tree frog on the left side of that mountain"
   - `ui-relations-v1:ui-relations-03964`: "Make a barracuda into that lake."
21. **knowledge: kind words of diagram.node not bound** — 12 sample rows, ≈511 rows in the data; layer knowledge; diagram 12
   - values: text (2), round node (2), rounded box (1), decision nodes (1), content (1), oval whatsit (1), cirlce (1), diagam (1), texxt label (1), decision box (1)
   - `data-drop-v1:dg-batch-02-diagram-00869`: "add a rounded box called Wrap and give it a green outline"
   - `data-drop:dg-batch-02:diagram:1606`: "add one more of those decision nodes, please"
   - `human-adapted-v1-diagram:human-adapted-diagram-0386:with-previous`: "Set the font size of the content to 20 and the font color to green"
22. **binding missing for document.section.id** — 22 sample rows, ≈505 rows in the data; layer bindings; document 22
   - `main-synthetic:syn-document-2-1879`: "Given a choice, heading Intro suits name Main, level 2, justify."
   - `main-synthetic:syn-document-2048`: "slap the underline on sections Intro 2 3, Main enabled, attrs too"
   - `main-synthetic:syn-document-2-1758`: "division Intro, 2 and 3 wants the underline, enabled Main"
23. **binding missing for avatar.part.ids** — 29 sample rows, ≈470 rows in the data; layer bindings; avatar 29
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-48aa9d8d8f91666ad1`: "make the hair front huge size"
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-4b0eccd4d79f035980`: "please shift the cheeks right"
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-4ff1e5da0f1a016836`: "move the shoulders up"
24. **binding missing: diagram.node target without a kind word (fill=all)** — 17 sample rows, ≈465 rows in the data; layer bindings; diagram 17
   - `data-drop-v1:dg-batch-02-diagram-00988`: "connect all elements in sequence, arrows pointing left to right"
   - `data-drop-v1:dg-batch-02-diagram-00990`: "connect everything in order"
   - `data-drop-v1:dg-batch-02-diagram-01100`: "all elements get a shadow"
25. **needs (meaning without a key): drawn.becomes** — 7 sample rows, ≈453 rows in the data; layer needs; drawing 7
   - values: cluod (1)
   - `data-drop-v1:dw-batch-01-drawing-00027`: "and change the fish into a shark"
   - `data-drop-v1:pilot-drawing-00065:with-previous`: "please change the grass to water"
   - `data-drop-v1:dw-batch-01-drawing-00322`: "one of the fish should be a shark now"
26. **refused: drawing-not-in-catalog for make drawing.drawn** — 7 sample rows, ≈452 rows in the data; layer execution; drawing 7
   - `main-synthetic:syn-orphans-mech-19088`: "add an elk"
   - `ui-relations-v1:ui-relations-01537`: "Give me a lynx to the right of the tree there."
   - `ui-relations-v1:ui-relations-01898`: "sketch a cardinal over the hill there"
27. **tool argument binding missing for change avatar.part [part.colour,part.size,part.variant]** — 10 sample rows, ≈445 rows in the data; layer bindings; avatar 10
   - `main-synthetic:syn-enriched-mech-4745`: "a small for me, ear light huge"
   - `main-synthetic:syn-enriched-mech-5276`: "change a taered neck hazel default"
   - `main-synthetic:syn-enriched-mech-5324`: "change a pie neck grey tiny"
28. **tool argument binding missing for change avatar.part [part.size,part.variant]** — 10 sample rows, ≈445 rows in the data; layer bindings; avatar 10
   - `main-synthetic:syn-enriched-mech-5283`: "change a tappered neck default"
   - `main-synthetic:syn-enriched-mech-7270`: "earring default — change a drop, please"
   - `main-synthetic:syn-enriched-mech-6289:with-previous`: "change a tognue tip mouth huge"
29. **tool argument binding missing for change avatar.part [part.variant]** — 10 sample rows, ≈445 rows in the data; layer bindings; avatar 10
   - `main-synthetic:syn-enriched-mech-5288`: "change a neklace neck"
   - `main-synthetic:syn-enriched-mech-6056`: "mouth — change a full lips, please"
   - `main-synthetic:syn-enriched-mech-6105`: "change a tonngue out mouth"
30. **tool argument binding missing for change avatar.part [part.colour,part.variant]** — 10 sample rows, ≈445 rows in the data; layer bindings; avatar 10
   - `main-synthetic:syn-enriched-mech-5315`: "a pipe for me, neck blond"
   - `main-synthetic:syn-enriched-mech-5990`: "mouth tan — change an open, please"
   - `main-synthetic:syn-enriched-mech-5994`: "change an opn mouth tan"
31. **refused: overwrite-needs-stricter-admission for make document.text** — 16 sample rows, ≈414 rows in the data; layer execution; document 16
   - `demo-tool-profile:data/haiku-v1/document/b04a.jsonl:document-b04-0069`: "Could you write a report about The Fox Who Lost His Tail in approximately 21 words. Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b15b.jsonl:document-b15-0141`: "Hey, write a report about Lab safety note in approximately 27 words. That would help."
   - `demo-tool-profile:data/haiku-v2/document/v2b07a.jsonl:document-v2b07-0056`: "Hey, compose a report about Newsletter in approximately 43 words. That would help."
32. **binding missing for document.text.content** — 15 sample rows, ≈412 rows in the data; layer bindings; document 15
   - `demo-tool-profile:data/haiku-v1/document/b08a.jsonl:document-b08-0068`: "Please, create a document titled Design job application containing \"The next stage begins on Friday.\". Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b01b.jsonl:document-b01-0219`: "Hey, create a document titled Q3 report containing \"Everyone can read the new summary.\"."
   - `demo-tool-profile:data/haiku-v1/document/b06a.jsonl:document-b06-0009`: "Could you create a document titled Wedding invite containing \"Please confirm these updated details.\". I appreciate it."
33. **bridge: requires-measure-projection (drawing.drawn.size)** — 6 sample rows, ≈407 rows in the data; layer rule; drawing 6
   - `demo-tool-profile:data/haiku-v2/drawing/v2b05b.jsonl:drawing-v2b05-0171`: "Let us make Sun 67 pixels wide. That would help."
   - `demo-tool-profile:data/haiku-v2/drawing/v2b10b.jsonl:drawing-v2b10-0113`: "I need you to make axis 61 pixels wide. I appreciate it."
   - `demo-tool-profile:data/haiku-v2/drawing/v2b28a.jsonl:drawing-v2b28-0034`: "Could you make robot 53 pixels wide. Thanks!"
34. **needs (meaning without a key): part.owner** — 6 sample rows, ≈405 rows in the data; layer needs; drawing 6
   - `data-drop-v1:dw-batch-01-drawing-00463:with-previous`: "put a pair of eyes on the sun"
   - `data-drop-v1:dw-batch-01-drawing-00708:with-previous`: "turn the boy's shirt red, please"
   - `data-drop-v1:dw-batch-01-drawing-00712:with-previous`: "can you turn the girl's shirt red?"
35. **tool argument binding missing for make document.section [section.content]** — 19 sample rows, ≈400 rows in the data; layer bindings; document 19
   - `demo-tool-profile:data/haiku-v1/document/b12b.jsonl:document-b12-0204`: "make a heading called Love note Sam; then make a paragraph saying \"Bring the revised notes to the meeting.\"."
   - `demo-tool-profile:data/haiku-v1/document/b16b.jsonl:document-b16-0187`: "Please, make a heading called Lost pets; then make a paragraph saying \"Please confirm these updated details.\". Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b11a.jsonl:document-b11-0017`: "Please, make a heading called Victoria sponge; then add a paragraph saying \"Everyone can read the new summary.\". Thanks!"
36. **reading refused without diagnostics** — 11 sample rows, ≈399 rows in the data; layer rule; drawing 6, diagram 5
   - `demo-tool-profile:data/haiku-v1/drawing/b06b.jsonl:drawing-b06-0225`: "delete barn, but leave fence alone."
   - `demo-tool-profile:data/haiku-v1/drawing/b03a.jsonl:drawing-b03-0037`: "Hey, remove tower block, but leave crane alone."
   - `demo-tool-profile:data/haiku-v1/drawing/b15b.jsonl:drawing-b15-0246`: "I need you to delete Luna, but leave Ada alone. I appreciate it."
37. **binding missing for calendar.meeting.room** — 13 sample rows, ≈397 rows in the data; layer bindings; calendar 13
   - `demo-tool-profile:data/haiku-v1/calendar/b01a.jsonl:calendar-b01-0085`: "I need you to book War room for Planning on 2026-12-08 from 16:00 UTC for 60 minutes. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/calendar/b04a.jsonl:calendar-b04-0057`: "Could you book Room 2 for Planning on 2026-12-19 from 15:00 UTC for 45 minutes. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/calendar/b14b.jsonl:calendar-b14-0163`: "book Studio for Planning on 2026-12-11 from 11:00 UTC for 45 minutes."
38. **binding missing for document.section.order** — 21 sample rows, ≈394 rows in the data; layer bindings; document 21
   - `demo-tool-profile:data/haiku-v1/document/b03a.jsonl:document-b03-0079`: "I need you to place Refund paragraph after Summary. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/document/b08a.jsonl:document-b08-0027`: "I need you to put Agenda after Decisions. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/document/b02b.jsonl:document-b02-0212`: "place Essay draft after Quote bank."
39. **rule missing: context reference (fill=context) for drawing.drawn** — 9 sample rows, ≈384 rows in the data; layer rule; drawing 9
   - `main-synthetic:syn-enriched-mech-13204`: "ask an obejct"
   - `ui-coverage-v2:ui-coverage-v2-drawing-00474`: "describe the drawing"
   - `ui-coverage-v2:ui-coverage-v2-drawing-00479`: "before I add more, give me a quick summary of the scene"
40. **binding missing: diagram.sketch target without a kind word (fill=context)** — 10 sample rows, ≈376 rows in the data; layer bindings; diagram 10
   - `ui-coverage-v2:ui-coverage-v2-diagram-00422`: "this flowchart is beyond saving, let's clear everything and start again"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00425`: "clear all of it"
   - `ui-diagram-v2:ui-diagram-v2-02624`: "Payment and the link into Payment away"
41. **binding missing for document.block.parent** — 16 sample rows, ≈375 rows in the data; layer bindings; document 16
   - `main-synthetic:syn-document-2-1908`: "para under Intro, level 3, with text Second"
   - `main-synthetic:syn-document-2153`: "put a heading after Intro in block form, carrying the text Main at level 3 and the parent's name"
   - `main-synthetic:syn-document-2173`: "at some point today, would you drop a quote block inside Intro with text Main and level 3, named after the parent?"
42. **needs (meaning without a key): chart.dimension** — 9 sample rows, ≈361 rows in the data; layer needs; diagram 9
   - `data-drop-v1:dg-batch-01-diagram-00408`: "hey — make a bar chart of the customers by payment"
   - `data-drop-v1:dg-batch-01-diagram-00430`: "please visualise the sections counts for each year as a line chart"
   - `data-drop-v1:dg-batch-01-diagram-00454`: "a pie chart of employees per role, thanks"
43. **bridge: act without trigger words (change fragments)** — 6 sample rows, ≈353 rows in the data; layer rule; diagram 3, drawing 3
   - `main-synthetic:syn-diagram-1313`: "could you restyle the group Intro as Main, yellow, large?"
   - `main-synthetic:syn-diagram-1371`: "we're relabeling the flowchart to match the deck, which means the group Intro should read Second now, in orange"
   - `main-synthetic:syn-drawing-2753`: "so: part Intro 2, Second, 400 wide"
44. **rule missing: context reference (fill=context) for drawing.page** — 20 sample rows, ≈350 rows in the data; layer rule; drawing 20
   - `main-synthetic:syn-drawing-3136`: "audit runs long, so mount the ids on the page always — duration 1 keeps them fresh"
   - `main-synthetic:syn-drawing-3138`: "duration 1: run the ids always on the page while we tidy up"
   - `main-synthetic:syn-drawing-3144`: "switch the page ids off, duration 1"
45. **wrong effect: changed for arrange diagram.diagram** — 10 sample rows, ≈321 rows in the data; layer wrong-effect; diagram 10
   - `data-drop:dg-batch-02:diagram:1261`: "clean the layout up a bit"
   - `data-drop:dg-batch-02:diagram:1270`: "a general clean-up will do"
   - `data-drop:dg-batch-02:diagram:1272`: "when you have a moment, make this flowchart easier on the eye"
46. **needs (meaning without a key): drawn.region** — 5 sample rows, ≈318 rows in the data; layer needs; drawing 5
   - values: cllouds (1), a hill or two (1)
   - `data-drop-v1:dw-batch-01-drawing-01128`: "leave the top quarter of the page for the sun"
   - `data-drop-v1:pilot-drawing-00298`: "a few cllouds in the sky please"
   - `data-drop-v1:dw-batch-01-drawing-01036`: "put a few birds in the background"
47. **target not resolved for change diagram.node (fill=description)** — 9 sample rows, ≈316 rows in the data; layer execution; diagram 9
   - `data-drop-v1:pilot-diagram-00116:with-previous`: "the first two boxes should be half as wide — go on"
   - `data-drop:dg-batch-02:diagram:1027`: "rotate the first box by 30 degrees"
   - `ui-comparatives-v1:ui-comparatives-00493`: "make the shape slightly smaller, please"
48. **binding missing for document.inline.format** — 10 sample rows, ≈311 rows in the data; layer bindings; document 10
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-3ee584c0da66acb740`: "turn italic off for characters 0 to 5 of Body"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-4dc4b5bd60fc4ab518`: "turn highlight on for characters 0 to 5 of Body using yellow"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-4f97d5e9ef27e177a9`: "turn link on for characters 0 to 5 of Body with target https://example.org/notes"
49. **binding missing for calendar.meeting.id** — 30 sample rows, ≈293 rows in the data; layer bindings; calendar 30
   - `main-synthetic:syn-calendar-2-588`: "On top of that, retitle the Intro meeting to Second and pull its length to 2"
   - `main-synthetic:syn-calendar-2-623:with-previous`: "which one gets selected? the Intro meeting"
   - `main-synthetic:syn-calendar-2-637`: "cancel the Intro appointment by removing it"
50. **bridge: requires-declared-ordinal-projection** — 12 sample rows, ≈288 rows in the data; layer rule; diagram 4, drawing 8
   - `data-drop:dg-batch-02:diagram:1001`: "reverse the middle link"
   - `ui-diagram-v2:ui-diagram-v2-01329`: "can you pick the third bubble together with its links thx"
   - `ui-diagram-v2:ui-diagram-v2-04217:with-previous`: "on a dark fill you need light text, so may da text of the smallest circle teal"
51. **binding missing for drawing.part.owner** — 5 sample rows, ≈284 rows in the data; layer bindings; drawing 5
   - `demo-tool-profile:data/demo-tool-profile/drawing-authored.jsonl:drawing-tools-9ce8678a9d464f9463`: "make part 4 of House A 50 pixels tall"
   - `demo-tool-profile:data/demo-tool-profile/drawing-authored.jsonl:drawing-tools-5ffa414d77526b49be`: "make part 0 of House A 50 pixels tall"
   - `demo-tool-profile:data/demo-tool-profile/drawing-authored.jsonl:drawing-tools-6a9f5aeafae73175d3`: "place part 9 of House A at x 310 and y 280"
52. **binding missing for avatar.face.preset** — 10 sample rows, ≈271 rows in the data; layer bindings; avatar 10
   - `main-synthetic:syn-avatar-2-098`: "swap in an infant face"
   - `main-synthetic:syn-enriched-mech-3223`: "face — change a girl, please"
   - `main-synthetic:syn-mech-variants-full-13430:with-previous`: "make one queen face"
53. **target not resolved for change avatar.part (fill=description)** — 6 sample rows, ≈267 rows in the data; layer execution; avatar 6
   - `main-synthetic:syn-enriched-mech-5750:with-previous`: "change a ful beard default"
   - `main-synthetic:syn-enriched-mech-6823`: "change a smlal round glasses"
   - `main-synthetic:syn-enriched-mech-6840`: "can you change a small round glasses tiny?"
54. **rule missing: context reference (fill=context) for diagram.diagram** — 8 sample rows, ≈256 rows in the data; layer rule; diagram 8
   - `ui-diagram-v2:ui-diagram-v2-04347`: "use curvy lines"
   - `ui-diagram-v2:ui-diagram-v2-04351`: "the slide is wide, make it flow leftwards"
   - `ui-diagram-v2:ui-diagram-v2-04397`: "it is a hierarchy, so lay out the diagram stacked for me"
55. **binding missing for diagram.series.index** — 5 sample rows, ≈250 rows in the data; layer bindings; diagram 5
   - `data-drop-v1:dg-batch-02-diagram-00615`: "one more thing: call the second series Budget"
   - `data-drop-v1:dg-batch-02-diagram-00631`: "change the colour of the first series to teal"
   - `data-drop:dg-batch-02:diagram:622`: "second series: Forecast"
56. **binding missing for diagram.node.position** — 35 sample rows, ≈249 rows in the data; layer bindings; diagram 35
   - `data-drop-v1:dg-batch-02-diagram-00913`: "insert a green box between Start and Bake"
   - `data-drop-v1:dg-batch-02-diagram-00907`: "slip a box in between Order and Ship, would you"
   - `data-drop:dg-batch-02:diagram:888`: "add three steps between Start and Bake"
57. **rule missing: population/description reference (fill=all) for drawing.drawn** — 11 sample rows, ≈244 rows in the data; layer rule; drawing 11
   - `data-drop-v1:dw-batch-01-drawing-01612`: "the flowers should be blue"
   - `data-drop-v1:dw-batch-01-drawing-01612:with-previous`: "the flowers should be blue"
   - `data-drop-v1:dw-batch-01-drawing-01614`: "let the flowers turn blue"
58. **placement refused (tool-binding) for make drawing.drawn [drawn.name]** — 5 sample rows, ≈243 rows in the data; layer execution; drawing 5
   - `demo-tool-profile:data/haiku-v1/drawing/b01b.jsonl:drawing-b01-0179`: "I need you to create a square called cow; then put cow below pig. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/drawing/b03b.jsonl:drawing-b03-0224`: "I need you to create a square called sky; then put sky below kite. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/drawing/b11b.jsonl:drawing-b11-0235`: "sketch a car called octopus; then put octopus below submarine."
59. **rule missing: context reference (fill=context) for diagram.group** — 8 sample rows, ≈236 rows in the data; layer rule; diagram 8
   - `main-synthetic:syn-diagram-1395`: "bar chart it is: Intro as the name, Main the labels, Second the values"
   - `main-synthetic:syn-diagram-1409`: "trends matter more than the totals this quarter, so a line chart called Intro, labels Main and values Second, would tell it better"
   - `main-synthetic:syn-diagram-2-1117`: "Back us up with a line chart: Intro name, Main labels, Second values"
60. **rule missing: query projection ask=exists for diagram.link** — 4 sample rows, ≈236 rows in the data; layer rule; diagram 4
   - `ui-diagram-v2:ui-diagram-v2-03915:with-previous`: "before I add it again, is Client already connected to n4? pls"
   - `ui-diagram-v2:ui-diagram-v2-03927`: "before I add it again, is Build already cnonected to the oval?"
   - `ui-diagram-v2:ui-diagram-v2-03928`: "n1 lnked to n2?"
61. **knowledge: kind words of diagram.chart not bound** — 5 sample rows, ≈235 rows in the data; layer knowledge; diagram 5
   - values: pie (3), bar (1), scatter (1)
   - `demo-tool-profile:data/haiku-v2/diagram/v2b02a.jsonl:diagram-v2b02-0019`: "Hey, make a pie chart called Visits with values 15, 20 for Notes and Sample."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b10b.jsonl:diagram-v2b10-0135`: "Hey, make a pie chart called Customers with values 13, 8 for Q2 and Sample."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b10b.jsonl:diagram-v2b10-0155`: "Please, make a bar chart called Fuel use with values 9, 8 for Car 1 and Sample. Thanks!"
62. **binding missing for diagram.chart.source** — 5 sample rows, ≈235 rows in the data; layer bindings; diagram 5
   - `ui-coverage-v2:ui-coverage-v2-diagram-00809`: "bar chart from this group"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00823`: "polar area chart \"Mix\" from this group"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00797`: "turn the Approval steps group into a line chart"
63. **binding missing for diagram.point.chart** — 5 sample rows, ≈231 rows in the data; layer bindings; diagram 5
   - `data-drop-v1:dg-batch-02-diagram-00728:with-previous`: "for Revenue, make April 33"
   - `data-drop:dg-batch-02:diagram:730`: "update the March value in Revenue to 40"
   - `data-drop:dg-batch-02:diagram:739`: "in Revenue, set March to 40, please"
64. **binding missing: diagram.point target without a kind word (fill=written)** — 6 sample rows, ≈230 rows in the data; layer bindings; diagram 6
   - `ui-diagram-v2:ui-diagram-v2-05806`: "hey, get rid of Phone"
   - `ui-diagram-v2:ui-diagram-v2-05829`: "it is called differently now, rename Green team to Plums"
   - `ui-diagram-v2:ui-diagram-v2-05872`: "it is called differently now, we name thu to Cherries"
65. **tool argument binding missing for connect diagram.link [link.to]** — 5 sample rows, ≈224 rows in the data; layer bindings; diagram 5
   - `ui-coverage-v2:ui-coverage-v2-diagram-00298:with-previous`: "draw an arrow from the selected shape to Publish"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00307`: "ok so Marketing is selected; connect it to Sales since they share a budget"
   - `ui-diagram-v2:ui-diagram-v2-01870`: "then Draft"
66. **no operation for change avatar.face [face.name]** — 5 sample rows, ≈222 rows in the data; layer no-operation; avatar 5
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-1fd0e0bedfc678bf81`: "call Avatar Ada"
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-27efb9e612f3fac585`: "call Avatar Nova"
   - `ui-human-v1:ui-human-00212-11`: "ok, it needs an identity, so name the avatar Alex"
67. **tool argument binding missing for change avatar.part [part.property,part.value]** — 5 sample rows, ≈222 rows in the data; layer bindings; avatar 5
   - `ui-coverage-v2:ui-coverage-v2-avatar-00297`: "she's meant to look older, so set the age of her head to old"
   - `ui-human-v1:ui-human-00866-07`: "I need the mouth feel set as smiling"
   - `ui-human-v1:ui-human-00866-12`: "actually, can you set the mouth feel to smiling, I want it to look friendly"
68. **needs (meaning without a key): drawn.trait** — 3 sample rows, ≈202 rows in the data; layer needs; drawing 3
   - `data-drop:dw-batch-01:drawing:871`: "make the boy's hair sun-bleached blond"
   - `data-drop:dw-batch-01:drawing:904`: "shave the man's head"
   - `data-drop:dw-batch-01:drawing:923`: "shave the man's haed"
69. **tool argument binding missing for change document.text [text.text]** — 9 sample rows, ≈195 rows in the data; layer bindings; document 9
   - `main-synthetic:syn-enriched-mech-9223`: "Follow-up Roadmap — change a text, please"
   - `main-synthetic:syn-enriched-mech-9225:with-previous`: "can you change a text Follow-up Roadmap?"
   - `main-synthetic:syn-enriched-mech-9226:with-previous`: "change a tetx Follow-up Roadmap"
70. **knowledge: kind words of document.block not bound** — 17 sample rows, ≈195 rows in the data; layer knowledge; document 17
   - values: paragraph (5), chapter (4), table (3), quote (2), banner line (1), section (1), heading (1)
   - `main-synthetic:syn-document-hardq-1929`: "Psst — is there a banner line anywhere in the file?"
   - `main-synthetic:syn-document-hardq-1957:with-previous`: "one last thing — how many tables did we end up with and oh, is there a heading too?"
   - `main-synthetic:syn-q2-var-19846`: "Do we have a section anywhere?"
71. **binding missing for avatar.face.base** — 5 sample rows, ≈188 rows in the data; layer bindings; avatar 5
   - `ui-coverage-v2:ui-coverage-v2-avatar-00015`: "recompose her as a woman"
   - `ui-human-v1:ui-human-00203-05`: "could you set the avatar as a man?"
   - `ui-human-v1:ui-human-00203-09`: "convert the avatar to a man"
72. **tool argument binding missing for make drawing.drawn** — 2 sample rows, ≈187 rows in the data; layer bindings; drawing 2
   - `main-synthetic:syn-trigger-batch-22436:with-previous`: "put a jaguar in, please"
   - `main-synthetic:syn-trigger-batch-22437`: "I could use a jaguars here"
73. **placement refused (request-shape) for place drawing.drawn [drawn.anchor (selector), drawn.ids (selector), drawn.relation]** — 6 sample rows, ≈184 rows in the data; layer execution; drawing 6
   - `ui-relations-v1:ui-relations-05366`: "Place the hill on the right side of the house."
   - `ui-relations-v1:ui-relations-05181`: "put the tree on the right side of the lake, please"
   - `ui-relations-v1:ui-relations-05244`: "place the house on top of the hill"
74. **host refused drawing.drawn.size (make drawing.drawn)** — 3 sample rows, ≈179 rows in the data; layer execution; drawing 3
   - `ui-relations-v1:ui-relations-01080`: "make a little shuttlecock left of that house"
   - `ui-relations-v1:ui-relations-04203`: "I'd like a small fish inside the lake"
   - `ui-relations-v1:ui-relations-03291`: "can you add a large pear beneath the tree"
75. **knowledge: kind words of diagram.link not bound** — 5 sample rows, ≈175 rows in the data; layer knowledge; diagram 5
   - values: connectors (2), connection (2), connections (1)
   - `ui-diagram-v2:ui-diagram-v2-02387`: "switch all the connectors no arrowheads"
   - `ui-diagram-v2:ui-diagram-v2-02420`: "switch all a connectors no arrowheads"
   - `ui-diagram-v2:ui-diagram-v2-03498:with-previous`: "how many connections leave n2?"
76. **binding missing: document.section target without a kind word (fill=written)** — 10 sample rows, ≈168 rows in the data; layer bindings; document 10
   - `demo-tool-profile:data/haiku-v1/document/b09b.jsonl:document-b09-0136`: "Could you remove the Cycle route notes section. Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b02b.jsonl:document-b02-0205`: "I need you to delete the Results table section. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/document/b06a.jsonl:document-b06-0094`: "I need you to remove the Retirement party section. I appreciate it."
77. **binding missing for diagram.node.rotate** — 4 sample rows, ≈165 rows in the data; layer bindings; diagram 4
   - `data-drop:dg-batch-02:diagram:1028`: "angle n3 at 45 degrees"
   - `data-drop:dg-batch-02:diagram:1030`: "make Start a rotated box, 60 degrees off straight"
   - `data-drop:dg-batch-02:diagram:1324`: "give the diamond a 45 degree tilt and a green fill while you're there"
78. **needs (meaning without a key): diagram.background** — 4 sample rows, ≈161 rows in the data; layer needs; diagram 4
   - `data-drop-v1:dg-batch-02-diagram-01202`: "the background should be midnight blue with a glow around the edges"
   - `data-drop-v1:dg-batch-02-diagram-01204`: "give the whole canvas a parchment white with soft shadow"
   - `data-drop:dg-batch-02:diagram:1208`: "set the bakcground to white"
79. **needs (meaning without a key): preference** — 4 sample rows, ≈161 rows in the data; layer needs; diagram 4
   - `data-drop-v1:dg-batch-02-diagram-01711`: "pastel as always"
   - `data-drop:dg-batch-02:diagram:1702`: "everything I draw over here should stay pastel — this diagram too"
   - `data-drop:dg-batch-02:diagram:1703`: "keep it pastel across the board, that's just my taste"
80. **target not resolved for arrange diagram.node (fill=all)** — 5 sample rows, ≈160 rows in the data; layer execution; diagram 5
   - `data-drop:dg-batch-02:diagram:1213`: "line all the boxes up in a column"
   - `ui-diagram-v2:ui-diagram-v2-04441`: "hey, line up all the boxes center"
   - `ui-diagram-v2:ui-diagram-v2-04456`: "can you align each box left, cheers"
81. **no operation for group diagram.group [group.ids]** — 5 sample rows, ≈160 rows in the data; layer no-operation; diagram 5
   - `ui-diagram-v2:ui-diagram-v2-03012:with-previous`: "er to move them as one, would you group um both of them"
   - `ui-diagram-v2:ui-diagram-v2-03030`: "just put the selection in a grip"
   - `ui-diagram-v2:ui-diagram-v2-02928`: "please wrap n6 with n1 together"
82. **tool argument binding missing for make calendar.calendar [calendar.name]** — 5 sample rows, ≈159 rows in the data; layer bindings; calendar 5
   - `demo-tool-profile:data/haiku-v1/calendar/b11a.jsonl:calendar-b11-0002`: "Could you make a calendar called Work 5; then book Review on Work 5 on 2026-12-09 at 13:00 UTC for 15 minutes; then make the note \"Bring the final draft\" to 
   - `demo-tool-profile:data/haiku-v1/calendar/b03b.jsonl:calendar-b03-0126`: "Let us add a calendar called Work 8; then book Review on Work 8 on 2026-12-08 at 16:00 UTC for 60 minutes; then add the note \"Bring the final draft\" to Revie
   - `demo-tool-profile:data/haiku-v1/calendar/b03b.jsonl:calendar-b03-0208`: "Could you add a calendar called Work 7; then book Review on Work 7 on 2026-12-07 at 15:00 UTC for 45 minutes; then create the note \"Bring the final draft\" to
83. **binding missing for diagram.node.at** — 7 sample rows, ≈158 rows in the data; layer bindings; diagram 7
   - `human-adapted-v1-diagram:human-adapted-diagram-0018`: "Create a square. Move it to the middle of the page."
   - `ui-coverage-v2:ui-coverage-v2-diagram-00237`: "move Done to the bottom right"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00254`: "Done top right"
84. **binding missing for document.document.id** — 5 sample rows, ≈156 rows in the data; layer bindings; document 5
   - `main-synthetic:syn-enriched-mech-8939`: "change a doument Summary Follow-up"
   - `main-synthetic:syn-mech-variants-full-17046`: "make one document Summary Follow-up"
   - `ui-human-v1:ui-human-00151-21:with-previous`: "just rename the notes document Project notes"
85. **no operation for select diagram.group** — 4 sample rows, ≈154 rows in the data; layer no-operation; diagram 4
   - `ui-diagram-v2:ui-diagram-v2-03100:with-previous`: "let's focus on group g1 please"
   - `ui-diagram-v2:ui-diagram-v2-03115:with-previous`: "please choose group g1"
   - `ui-human-v1:ui-human-00113-03`: "I want group g1 selected"
86. **setup: context object not creatable (dashed: no-node-kind)** — 3 sample rows, ≈150 rows in the data; layer setup; diagram 3
   - `main-synthetic:syn-diagram-2-1068`: "switch the dahsed Intro link over and pin a Main label, yellow colour, forward arrows on it"
   - `main-synthetic:syn-mech-variants-full-16885`: "update a dashed Idea none 12"
   - `main-synthetic:syn-trigger-batch-25871`: "give me a dashed Idea 12, quickly please"
87. **binding missing for drawing.drawn.at** — 3 sample rows, ≈149 rows in the data; layer bindings; drawing 3
   - `human-adapted-v1-drawing:human-adapted-drawing-0186`: "a big cloud is on the left corner, 1/2 cut from top and side."
   - `human-adapted-v1-drawing:human-adapted-drawing-0260`: "big box center grass"
   - `ui-human-v1:ui-human-00575-02`: "please add a small house in the top left"
88. **rule missing: population/description reference (fill=all) for diagram.node** — 5 sample rows, ≈147 rows in the data; layer rule; diagram 5
   - `data-drop-v1:dg-batch-02-diagram-01236`: "hey, space the boxes evenly"
   - `data-drop-v1:dg-batch-02-diagram-01253`: "spread the boxes out but keep the diamonds close to their arrows"
   - `data-drop-v1:dg-batch-02-diagram-01636`: "now make the rest of the rectangles match the Start box, same green outline all round"
89. **binding missing: diagram.node target without a kind word (fill=-)** — 5 sample rows, ≈147 rows in the data; layer bindings; diagram 5
   - `data-drop-v1:pilot-diagram-00231`: "one more thing: please recolour Check yellow and then shove it a bit to the right"
   - `data-drop-v1:pilot-diagram-00233`: "check yellow, then left, if you can"
   - `data-drop:dg-batch-02:diagram:1603`: "one more of the same thing please"
90. **labels: gold-spans-overlap-or-out-of-order** — 3 sample rows, ≈146 rows in the data; layer data; drawing 3
   - `data-drop-v1:dw-batch-01-drawing-00982`: "the background should be mountains, far away and pale blue"
   - `data-drop:dw-batch-01:drawing:1179`: "re-do the roof in thatch and let it overhang the walls a bit"
   - `data-drop-v1:dw-batch-01-drawing-00419`: "turn the boat into a motorbaot and keep it on the lake"
91. **binding missing for document.section.text** — 5 sample rows, ≈145 rows in the data; layer bindings; document 5
   - `ui-human-v1:ui-human-00157-18`: "change the chapter heading to something more general"
   - `ui-human-v1:ui-human-00157-02`: "can you rename the chapter heading Overview?"
   - `ui-human-v1:ui-human-00157-06`: "um, change the chapter heading text to Overview"
92. **bridge: act without trigger words (select fragments)** — 5 sample rows, ≈145 rows in the data; layer rule; diagram 3, drawing 2
   - `data-drop-v1:dg-batch-02-diagram-01333`: "actually, the oval one, not the rectangle"
   - `data-drop-v1:pilot-drawing-00225`: "the other one, please, thanks"
   - `data-drop:dg-batch-02:diagram:1332`: "actually, the oval one, not the rectangle"
93. **binding missing for avatar.face.characterKind** — 4 sample rows, ≈143 rows in the data; layer bindings; avatar 4
   - `ui-coverage-v2:ui-coverage-v2-avatar-00019`: "Recompose the avatar as a robot, keeping the man base."
   - `ui-coverage-v2:ui-coverage-v2-avatar-00023`: "robot kind please, rebuild it"
   - `ui-human-v1:ui-human-00558-09`: "switch the avatar to human"
94. **value normalization missing for diagram.chart.type** — 3 sample rows, ≈141 rows in the data; layer bindings; diagram 3
   - `data-drop-v1:dg-batch-01-diagram-00373`: "make a pie chart with the categories sex 1, sex 2"
   - `human-adapted-v1-diagram:human-adapted-diagram-0292:with-previous`: "Line Graph of SUM (Sales Forecast) vs Order Date"
   - `ui-diagram-v2:ui-diagram-v2-06634`: "create a doughnut chart showing visitors per day"
95. **binding missing for diagram.chart.datasets** — 3 sample rows, ≈141 rows in the data; layer bindings; diagram 3
   - `demo-tool-profile:data/demo-tool-profile/charts-authored.jsonl:chart-tools-acc5f6c8f10032531a`: "create a radar chart called Sales 9 for Jan and Feb with datasets [{\"label\": \"North\", \"data\": [9, 11]}, {\"label\": \"South\", \"data\": [10, 12]}]"
   - `demo-tool-profile:data/demo-tool-profile/charts-authored.jsonl:chart-tools-c33c6f92ed5111485d`: "create a bar chart called Sales 7 for Jan and Feb with datasets [{\"label\": \"North\", \"data\": [7, 9]}, {\"label\": \"South\", \"data\": [8, 10]}]"
   - `demo-tool-profile:data/demo-tool-profile/charts-authored.jsonl:chart-tools-2ce47727969b99d513`: "create a radar chart called Sales 4 for Jan and Feb with datasets [{\"label\": \"North\", \"data\": [4, 6]}, {\"label\": \"South\", \"data\": [5, 7]}]"
96. **value normalization missing for diagram.node.layout** — 3 sample rows, ≈141 rows in the data; layer bindings; diagram 3
   - `ui-diagram-v2:ui-diagram-v2-00530`: "for the team structure drop in 2 triangles top to bottom"
   - `ui-diagram-v2:ui-diagram-v2-00537`: "right make three diamonds in levels"
   - `ui-diagram-v2:ui-diagram-v2-00653`: "to show the parallel jobs sketch 10 orange triangles horizontally"
97. **target not resolved for change diagram.node (fill=all)** — 11 sample rows, ≈140 rows in the data; layer execution; diagram 11
   - `data-drop-v1:dg-batch-02-diagram-01057`: "make every box 80 pixels wide, same for all of them"
   - `data-drop-v1:dg-batch-02-diagram-01072`: "recolor the first three steps orange"
   - `data-drop-v1:dg-batch-02-diagram-01105:with-previous`: "all boxes: black fill, white text"
98. **binding missing for document.inline.rows** — 5 sample rows, ≈137 rows in the data; layer bindings; document 5
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-3ea771af196ac936fd`: "insert a table with rows [[\"Item\", \"Count\"], [\"Draft 1\", \"1\"]]"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-3fc48849d3a30fc91b`: "insert a table with rows [[\"Item\", \"Count\"], [\"Draft 18\", \"18\"]]"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-59abd5981acd9299a4`: "insert a table with rows [[\"Item\", \"Count\"], [\"Draft 30\", \"30\"]]"
99. **refused: overwrite-needs-stricter-admission for make document.inline** — 5 sample rows, ≈137 rows in the data; layer execution; document 5
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-4dd70510acadf2a103`: "add a bullet list with items \"Review draft 4\", \"Check numbers 4\", \"Send notes 4\""
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-4fa90affe140fc18a8`: "add a numbered list with items \"Review draft 15\", \"Check numbers 15\", \"Send notes 15\""
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-9afa6f1bb9114946cc`: "add a numbered list with items \"Review draft 10\", \"Check numbers 10\", \"Send notes 10\""
100. **binding missing: diagram.sketch target without a kind word (fill=written)** — 2 sample rows, ≈136 rows in the data; layer bindings; diagram 2
   - `ui-coverage-v2:ui-coverage-v2-diagram-00544:with-previous`: "Do the charts include a Survey results group, or was that removed?"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00551`: "does South exist"
101. **rule missing: query projection ask=what for diagram.node** — 2 sample rows, ≈136 rows in the data; layer rule; diagram 2
   - `ui-diagram-v2:ui-diagram-v2-03645`: "er the only hexagon colour?"
   - `ui-diagram-v2:ui-diagram-v2-03729`: "right, how big is the top circle?"
102. **no operation for change drawing.part [part.height,part.index,part.width]** — 2 sample rows, ≈136 rows in the data; layer no-operation; drawing 2
   - `main-synthetic:syn-drawing-2717:with-previous`: "possible to switch part Intro 2 over to Second, sized 400 by 30?"
   - `main-synthetic:syn-drawing-2-2375`: "the part Intro 2 drifts over to Secnod at a stretch of 400 and a lift of 30"
103. **no operation for change drawing.part [part.index,part.width]** — 2 sample rows, ≈136 rows in the data; layer no-operation; drawing 2
   - `main-synthetic:syn-enriched-mech-13239`: "Status 1 Follow-up 400 — change a part, please"
   - `main-synthetic:variant:mech-variants.jsonl:6994`: "update a part Intro 2 Second 400"
104. **no operation for change drawing.drawn [drawn.height,drawn.width,drawn.x,drawn.y]** — 2 sample rows, ≈136 rows in the data; layer no-operation; drawing 2
   - `ui-human-v1:ui-human-00025-00`: "can you fit o1 and o2 into a 240 by 160 box at 300,200?"
   - `ui-human-v1:ui-human-00025-04:with-previous`: "please fit o1 and o2 in a 240 by 160 area whose top-left is 300,200"
105. **needs (meaning without a key): drawn.shadow** — 2 sample rows, ≈135 rows in the data; layer needs; drawing 2
   - `data-drop-v1:dw-batch-01-drawing-01375`: "the boat looks flat — put a shadow under it"
   - `data-drop-v1:dw-batch-01-drawing-01376`: "give the whole scene soft shadows"
106. **tool argument binding missing for change avatar.part [part.scale]** — 5 sample rows, ≈132 rows in the data; layer bindings; avatar 5
   - `ui-coverage-v2:ui-coverage-v2-avatar-00199`: "Resize the glasses to 1.3."
   - `ui-coverage-v2:ui-coverage-v2-avatar-00208`: "shrink the nose by 20%"
   - `ui-coverage-v2:ui-coverage-v2-avatar-00223`: "scale the mouth up slightly"
107. **tool argument binding missing for change avatar.part [part.size]** — 5 sample rows, ≈132 rows in the data; layer bindings; avatar 5
   - `ui-comparatives-v1:ui-comparatives-00643`: "turn the mouth a little bit bigger"
   - `ui-comparatives-v1:ui-comparatives-00673`: "can the mouth be a bit larger"
   - `ui-comparatives-v1:ui-comparatives-00685`: "could you make the head a lot larger"
108. **rule missing: population/description reference (fill=all, all) for diagram.diagram** — 4 sample rows, ≈128 rows in the data; layer rule; diagram 4
   - `demo-tool-profile:data/haiku-v1/diagram/b02b.jsonl:diagram-b02-0174`: "arrange the nodes in a circle."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b06a.jsonl:diagram-v2b06-0058`: "arrange the nodes in a layers."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b13b.jsonl:diagram-v2b13-0158`: "I need you to arrange the nodes in a radial. I appreciate it."
109. **target not resolved for arrange diagram.chart (fill=written)** — 4 sample rows, ≈128 rows in the data; layer execution; diagram 4
   - `demo-tool-profile:data/haiku-v2/diagram/v2b11a.jsonl:diagram-v2b11-0014`: "Hey, sort Donations from largest to smallest. That would help."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b11a.jsonl:diagram-v2b11-0033`: "I need you to sort Lunch orders from largest to smallest. I appreciate it."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b11a.jsonl:diagram-v2b11-0063`: "I need you to sort Carpool trips from largest to smallest. I appreciate it."
110. **binding missing for document.inline.align** — 4 sample rows, ≈124 rows in the data; layer bindings; document 4
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-a27ddf940a38dc05d2`: "align Body left"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-7f0ce5093428c7f868`: "align Body center"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-c2d22ab967f012c54b`: "align Body justify"
111. **target not resolved for change calendar.meeting (fill=written)** — 9 sample rows, ≈121 rows in the data; layer execution; calendar 9
   - `ui-coverage-v2:ui-coverage-v2-calendar-00460:with-previous`: "one more person on the budget sync"
   - `ui-coverage-v2:ui-coverage-v2-calendar-00476`: "find a bigger room for the weekly review"
   - `ui-coverage-v2:ui-coverage-v2-calendar-00426:with-previous`: "we never finish the design critique on time, so could you extend it by 15 minutes?"
112. **tool argument binding missing for change drawing.drawn [drawn.size]** — 4 sample rows, ≈121 rows in the data; layer bindings; drawing 4
   - `ui-comparatives-v1:ui-comparatives-00012:with-previous`: "The cloud should be much bigger"
   - `ui-comparatives-v1:ui-comparatives-00051`: "can you make the cloud much larger"
   - `ui-comparatives-v1:ui-comparatives-00000`: "Make the house a lot bigger."
113. **needs (meaning without a key): node.position** — 3 sample rows, ≈120 rows in the data; layer needs; diagram 3
   - `data-drop-v1:dg-batch-02-diagram-01564`: "where's Review?"
   - `data-drop:dg-batch-02:diagram:1553`: "which part of the canvas holds the Review step?"
   - `data-drop:dg-batch-02:diagram:1565`: "where's Publish?"
114. **binding missing for calendar.meeting.ids** — 23 sample rows, ≈119 rows in the data; layer bindings; calendar 23
   - `main-synthetic:syn-calendar-2-554`: "please add a meting Intro with the title Main at 3 for 1, notes Mian too"
   - `main-synthetic:syn-calendar-2-558`: "set up an Intro session with title Main, a 3 o'clock start, 1 long, and notes Primary"
   - `main-synthetic:syn-calendar-2-561`: "There's one more for the Intro meeting: Main as the title, 3 start, 1 long, and Primary in the notes"
115. **binding missing for calendar.room.id** — 9 sample rows, ≈119 rows in the data; layer bindings; calendar 9
   - `ui-coverage-v2:ui-coverage-v2-calendar-00242`: "Board room: 22 seats"
   - `ui-coverage-v2:ui-coverage-v2-calendar-00255`: "I want the location of the Focus pod listed as level 5"
   - `ui-coverage-v2:ui-coverage-v2-calendar-00264`: "Cedar room, now 4th floor"
116. **no operation for select drawing.drawn** — 8 sample rows, ≈118 rows in the data; layer no-operation; drawing 8
   - `main-synthetic:syn-drawing-2968`: "sequence starts from the top left today, and first in line is the object Intro — select it"
   - `main-synthetic:syn-drawing-2-2577`: "object Intor, selected"
   - `ui-coverage-v2:ui-coverage-v2-drawing-00286`: "pick the red car in the selection dropdown"
117. **binding missing for document.section.parent** — 5 sample rows, ≈117 rows in the data; layer bindings; document 5
   - `main-synthetic:syn-document-2234`: "shape a section under Intro whose text is Main, at level 2, with the name from the parent"
   - `main-synthetic:syn-document-2240`: "start a section under Intro"
   - `main-synthetic:syn-enriched-mech-9435`: "can you add a section Hub Main Track Second Pass?"
118. **tool argument binding missing for change diagram.page [page.duration]** — 5 sample rows, ≈115 rows in the data; layer bindings; diagram 5
   - `ui-coverage-v2:ui-coverage-v2-diagram-00451`: "overlay the IDs on the boxes for 30 seconds"
   - `ui-diagram-v2:ui-diagram-v2-02776`: "show idss 3 seconds"
   - `ui-human-v1:ui-human-00102-17`: "show the diagram IDs for a moment"
119. **tool argument binding missing for change diagram.diagram [diagram.by]** — 5 sample rows, ≈115 rows in the data; layer bindings; diagram 5
   - `ui-diagram-v2:ui-diagram-v2-04100`: "I need you to give every depth its own colour"
   - `ui-diagram-v2:ui-diagram-v2-04121`: "colour each type differently"
   - `ui-diagram-v2:ui-diagram-v2-04147`: "to see the hierarchy at a glance, colour eaach group diferently"
120. **binding missing for drawing.group.members** — 5 sample rows, ≈105 rows in the data; layer bindings; drawing 5
   - `demo-tool-profile:data/demo-tool-profile/drawing-authored.jsonl:drawing-tools-c98c10d438d6ecd8c2`: "group Alpha 2 and Beta 2 as Set 2"
   - `demo-tool-profile:data/demo-tool-profile/drawing-authored.jsonl:drawing-tools-ffd3977722e8ebd7f4`: "group Alpha 16 and Beta 16 as Set 16"
   - `demo-tool-profile:data/demo-tool-profile/drawing-authored.jsonl:drawing-tools-8f26035e157313df0c`: "group Alpha 17 and Beta 17 as Set 17"
121. **wrong effect: kind for make diagram.node** — 6 sample rows, ≈104 rows in the data; layer wrong-effect; diagram 6
   - `data-drop:dg-batch-02:diagram:871`: "one more of those steps, yes"
   - `human-adapted-v1-diagram:human-adapted-diagram-0052`: "Draw an flowchart for planning a picnic. Include steps like choosing a location, deciding on the number of participants, preparing a list of items to bring, an
   - `main-synthetic:syn-enriched-mech-8409`: "add a stra"
122. **binding missing: diagram.sketch target without a kind word (fill=all)** — 3 sample rows, ≈103 rows in the data; layer bindings; diagram 3
   - `ui-diagram-v2:ui-diagram-v2-02675`: "the client changed everything, so hey, erase the canvas"
   - `ui-diagram-v2:ui-diagram-v2-02685`: "delete"
   - `ui-diagram-v2:ui-diagram-v2-02729`: "this is a mess, start over with the diagrams and we start again"
123. **binding missing: diagram.point target without a kind word (fill=context)** — 4 sample rows, ≈102 rows in the data; layer bindings; diagram 4
   - `data-drop:dg-batch-02:diagram:827`: "make the third month 30"
   - `data-drop:dg-batch-02:diagram:832`: "I want the seventh month at 52"
   - `data-drop:dg-batch-02:diagram:835`: "the tenth value needs to be 70"
124. **knowledge: kind words of drawing.part not bound** — 6 sample rows, ≈101 rows in the data; layer knowledge; drawing 6
   - values: house (5), tree (1)
   - `ui-coverage-v2:ui-coverage-v2-drawing-00532`: "part 1 of the tree"
   - `ui-human-v1:ui-human-00051-05`: "um, select part 0 of the house"
   - `ui-human-v1:ui-human-00051-20`: "highlight part 0 of the house"
125. **binding missing for diagram.node.rotation** — 2 sample rows, ≈100 rows in the data; layer bindings; diagram 2
   - `data-drop-v1:dg-batch-02-diagram-01027`: "tip Order by 5 degrees"
   - `data-drop-v1:dg-batch-02-diagram-01037:with-previous`: "rotate nodes n3 and n4 by 45 degrees each, a neat offset"
126. **target not resolved for change diagram.chart (fill=description)** — 2 sample rows, ≈100 rows in the data; layer execution; diagram 2
   - `human-adapted-v1-diagram:human-adapted-diagram-0346`: "Resize the chart to be 4 inches by 4 inches"
   - `human-adapted-v1-diagram:human-adapted-diagram-0347`: "Make the chart larger to 10*10"
127. **no operation for change diagram.group [group.colour,group.label,group.size]** — 2 sample rows, ≈100 rows in the data; layer no-operation; diagram 2
   - `main-synthetic:syn-diagram-1314:with-previous`: "switch the group Intro around: label Main, colour yellow, size large"
   - `ui-natural-v1:ui-natural-00116`: "change the group label to Updated process and give the members a large blue style"
128. **setup: context object not creatable (dotted: no-node-kind)** — 2 sample rows, ≈100 rows in the data; layer setup; diagram 2
   - `main-synthetic:syn-diagram-1492:with-previous`: "those faint suggestion lines on the printout — could you make the Intro link dotted, keep the Main label on it, take the colour to yellow, and have its arrow r
   - `main-synthetic:syn-diagram-1494`: "those background relations need to fade back, so set the Intro link dotted with the Main label, yellow stroke, arrow forward"
129. **no operation for change diagram.group [group.scale]** — 2 sample rows, ≈100 rows in the data; layer no-operation; diagram 2
   - `main-synthetic:syn-diagram-1637`: "how far does the group Intro go at scale 20? try it"
   - `main-synthetic:syn-mech-variants-full-17024`: "set one group Kickoff 20"
130. **no operation for change diagram.link [link.label]** — 2 sample rows, ≈100 rows in the data; layer no-operation; diagram 2
   - `main-synthetic:syn-enriched-mech-8663`: "can you change a dashed Review Draft North Area?"
   - `main-synthetic:syn-mech-variants-full-16836`: "update a solid Plan Backup Core"
131. **setup: context object not creatable (solid: no-node-kind)** — 2 sample rows, ≈100 rows in the data; layer setup; diagram 2
   - `main-synthetic:syn-mech-variants-full-16849:with-previous`: "change a solid Hub both 12"
   - `main-synthetic:syn-trigger-batch-25841`: "give me a solid Proposal 12, quickly please"
132. **no operation for change diagram.link** — 2 sample rows, ≈100 rows in the data; layer no-operation; diagram 2
   - `ui-human-v1:ui-human-00094-06`: "redirect the arrow to run from Finish to Start"
   - `ui-human-v1:ui-human-00094-07`: "I need the arrow to run from Finish to Start instead"
133. **no operation for change diagram.group** — 2 sample rows, ≈100 rows in the data; layer no-operation; diagram 2
   - `ui-human-v1:ui-human-00719-09:with-previous`: "would be nice to have Process 20 percent bigger"
   - `ui-human-v1:ui-human-00719-18`: "grow Process 20 percent"
134. **binding missing for avatar.part.size** — 7 sample rows, ≈100 rows in the data; layer bindings; avatar 7
   - `ui-comparatives-v1:ui-comparatives-00690`: "can you make it larger"
   - `ui-comparatives-v1:ui-comparatives-00711`: "can you make it a bit smaller"
   - `ui-comparatives-v1:ui-comparatives-00657`: "Make it bigger."
135. **no operation for group diagram.group [group.label,group.name]** — 3 sample rows, ≈96 rows in the data; layer no-operation; diagram 3
   - `main-synthetic:syn-diagram-1450`: "begin by turning Main into a single group, call it Intro, and keep it labelled Second in the outline"
   - `main-synthetic:syn-diagram-1457`: "go on and Intro-group the Main bits with a rough label"
   - `main-synthetic:syn-enriched-mech-8767`: "add a grooup Draft North Area Idea"
136. **no operation for ungroup diagram.group** — 3 sample rows, ≈96 rows in the data; layer no-operation; diagram 3
   - `main-synthetic:syn-mech-variants-full-17036`: "get rid of a group North Area"
   - `ui-diagram-v2:ui-diagram-v2-03348`: "we do not need that grouping anymore, dissolve group g1 thx"
   - `ui-natural-v1:ui-natural-00125`: "ungroup the Process group"
137. **tool argument binding missing for change calendar.meeting [meeting.length]** — 18 sample rows, ≈95 rows in the data; layer bindings; calendar 18
   - `main-synthetic:syn-enriched-mech-8115`: "change a meteing Core Hub 2"
   - `main-synthetic:syn-trigger-batch-25715`: "give me a meeting Main Track 1 Review, quickly please"
   - `ui-comparatives-v1:ui-comparatives-00753`: "turn Review longer"
138. **rule missing: operator count projection for diagram.node.n** — 2 sample rows, ≈94 rows in the data; layer rule; diagram 2
   - `data-drop:dg-batch-02:diagram:883`: "the missing part is five steps at the bottom"
   - `data-drop:dg-batch-02:diagram:880`: "insert five boxes for the tiers of the org chart"
139. **tool argument binding missing for make diagram.chart [chart.datasets,chart.labels,chart.title]** — 2 sample rows, ≈94 rows in the data; layer bindings; diagram 2
   - `demo-tool-profile:data/demo-tool-profile/charts-authored.jsonl:chart-tools-79c4b194963add5ff9`: "create a line chart called Sales 5 for Jan and Feb with datasets [{\"label\": \"North\", \"data\": [5, 7]}, {\"label\": \"South\", \"data\": [6, 8]}]"
   - `demo-tool-profile:data/demo-tool-profile/charts-authored.jsonl:chart-tools-537f1e71bf3f370ca7`: "create a line chart called Sales 3 for Jan and Feb with datasets [{\"label\": \"North\", \"data\": [3, 5]}, {\"label\": \"South\", \"data\": [4, 6]}]"
140. **value normalization missing for diagram.node.size** — 2 sample rows, ≈94 rows in the data; layer bindings; diagram 2
   - `ui-natural-v1:ui-natural-01227:with-previous`: "add two rectangle nodes, labelled Step, coloured blue, large, in a row, at x 240"
   - `ui-natural-v1:ui-natural-01194`: "add two rectangle nodes, coloured blue, large, in a row"
141. **wrong effect: kind for make drawing.drawn** — 1 sample rows, ≈94 rows in the data; layer wrong-effect; drawing 1
   - `main-synthetic:syn-enriched-mech-12907`: "add a trp"
142. **binding missing for document.section.align** — 3 sample rows, ≈93 rows in the data; layer bindings; document 3
   - `ui-human-v1:ui-human-00165-05:with-previous`: "could you put the chapter heading on the right, please?"
   - `ui-human-v1:ui-human-00165-07`: "the chapter heading should be aligned right"
   - `ui-human-v1:ui-human-00165-14`: "so the body is fine, but move the chapter heading to the right"
143. **tool argument binding missing for change diagram.diagram [diagram.theme]** — 4 sample rows, ≈92 rows in the data; layer bindings; diagram 4
   - `data-drop-v1:dg-batch-02-diagram-01290`: "dress it in a pastel palette"
   - `data-drop:dg-batch-02:diagram:1285`: "switch the diagram to night mode"
   - `ui-diagram-v2:ui-diagram-v2-03985`: "make the whole diagram colourful"
144. **tool argument binding missing for change diagram.page [page.mode]** — 4 sample rows, ≈92 rows in the data; layer bindings; diagram 4
   - `ui-coverage-v2:ui-coverage-v2-diagram-00438`: "ok quick one - show the IDs temporarily, the org chart has two boxes with similar names"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00464`: "I want the IDs on screen the whole time"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00474`: "IDs stay on"
145. **placement refused (tool-binding) for place drawing.drawn [drawn.anchor (selector), drawn.relation]** — 3 sample rows, ≈92 rows in the data; layer execution; drawing 3
   - `demo-tool-profile:data/haiku-v1/drawing/b06a.jsonl:drawing-b06-0042`: "Could you move barn to the left of tractor. Thanks!"
   - `demo-tool-profile:data/haiku-v1/drawing/b12a.jsonl:drawing-b12-0053`: "Could you put kite to the left of tree. I appreciate it."
   - `demo-tool-profile:data/haiku-v2/drawing/v2b04a.jsonl:drawing-v2b04-0094`: "place tiny star to the left of moon."
146. **binding missing for calendar.meeting.people** — 3 sample rows, ≈92 rows in the data; layer bindings; calendar 3
   - `ui-coverage-v2:ui-coverage-v2-calendar-00390:with-previous`: "something with Lee, any time we're both open"
   - `ui-coverage-v2:ui-coverage-v2-calendar-00370`: "book a call with Priya in the first free slot tomorrow"
   - `ui-coverage-v2:ui-coverage-v2-calendar-00381`: "I know my week is packed, but could you slot in a call with Lee wherever there's the first gap on Wednesday?"
147. **rule missing: context reference (fill=context) for diagram.chart** — 2 sample rows, ≈91 rows in the data; layer rule; diagram 2
   - `ui-diagram-v2:ui-diagram-v2-06596`: "colour everybar over 250 brown"
   - `ui-diagram-v2:ui-diagram-v2-06472`: "before I present it, what does that graph say?"
148. **binding missing: document.document target without a kind word (fill=context)** — 4 sample rows, ≈91 rows in the data; layer bindings; document 4
   - `ui-human-v1:ui-human-00191-03`: "I want the document gone"
   - `ui-human-v1:ui-human-00191-09`: "scrap the document"
   - `ui-human-v1:ui-human-00193-23`: "display structure"
149. **tool argument binding missing for change drawing.drawn [drawn.height]** — 3 sample rows, ≈90 rows in the data; layer bindings; drawing 3
   - `ui-comparatives-v1:ui-comparatives-00275`: "can the sun be a lot taller"
   - `ui-comparatives-v1:ui-comparatives-00281`: "turn the cloud way taller"
   - `ui-comparatives-v1:ui-comparatives-00321`: "can the cloud be way higher"
150. **refused: link-exists for connect diagram.link** — 2 sample rows, ≈90 rows in the data; layer execution; diagram 2
   - `data-drop:dg-batch-02:diagram:925`: "hey, draw an arrow from Start to Bake"
   - `data-drop:dg-batch-02:diagram:929`: "Start needs an arrow to Bake"

## End-to-end level (deployed reader)

1. **binding missing: diagram.node target without a kind word (fill=written)** — 125 sample rows, ≈4707 rows in the data; layer bindings; diagram 125
   - `data-drop-v1:dg-batch-02-diagram-00549`: "redcue April by 3"
   - `data-drop-v1:dg-batch-02-diagram-00676`: "remove Series 2"
   - `data-drop-v1:dg-batch-02-diagram-01167`: "bump the Plan label up to 18 point"
2. **binding missing for calendar.meeting.day** — 74 sample rows, ≈2198 rows in the data; layer bindings; calendar 74
   - `demo-tool-profile:data/haiku-v1/calendar/b02b.jsonl:calendar-b02-0168`: "Hey, place Review to 2026-12-12 at 16:00 UTC."
   - `demo-tool-profile:data/haiku-v1/calendar/b01a.jsonl:calendar-b01-0085`: "I need you to book War room for Planning on 2026-12-08 from 16:00 UTC for 60 minutes. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/calendar/b09b.jsonl:calendar-b09-0132`: "put Review to 2026-12-16 at 12:00 UTC."
3. **no operation for change drawing.drawn [drawn.colour]** — 34 sample rows, ≈2115 rows in the data; layer no-operation; drawing 34
   - `data-drop-v1:dw-batch-01-drawing-01664:with-previous`: "hey, make all the dogs brown"
   - `data-drop-v1:dw-batch-01-drawing-01610`: "turn all the flowers blue"
   - `data-drop-v1:dw-batch-01-drawing-01673:with-previous`: "make all teh dogs brown"
4. **binding missing for document.block.text** — 74 sample rows, ≈1992 rows in the data; layer bindings; document 74
   - `demo-tool-profile:data/haiku-v1/document/b02a.jsonl:document-b02-0101`: "I need you to replace Draft 2 with \"Bring the revised notes to the meeting.\". I appreciate it."
   - `demo-tool-profile:data/haiku-v1/document/b02b.jsonl:document-b02-0144`: "Let us replace Essay draft with \"Everyone can read the new summary.\". That would help."
   - `demo-tool-profile:data/haiku-v1/document/b08a.jsonl:document-b08-0068`: "Please, create a document titled Design job application containing \"The next stage begins on Friday.\". Thanks!"
5. **binding missing: relation anchor reference in drawing** — 38 sample rows, ≈1745 rows in the data; layer bindings; drawing 38
   - `data-drop-v1:dw-batch-01-drawing-01307`: "stick a second boat by the first one"
   - `demo-tool-profile:data/haiku-v1/drawing/b07a.jsonl:drawing-b07-0017`: "Hey, put heart to the left of Reference. That would help."
   - `demo-tool-profile:data/haiku-v1/drawing/b05a.jsonl:drawing-b05-0103`: "place hat to the left of Reference."
6. **knowledge: kind words of diagram.node not bound** — 46 sample rows, ≈1500 rows in the data; layer knowledge; diagram 46
   - values: bars (6), series (3), chart (2), text (2), grooup (2), shadow (1), link (1), layout (1), diagram (1), gridlines (1), decision (1), tenth (1)
   - `data-drop-v1:dg-batch-02-diagram-00631`: "change the colour of the first series to teal"
   - `data-drop-v1:dg-batch-02-diagram-01100`: "all elements get a shadow"
   - `data-drop-v1:dg-batch-02-diagram-00368`: "can you give the bars a dark green colour"
7. **binding missing for avatar.part.id** — 34 sample rows, ≈1435 rows in the data; layer bindings; avatar 34
   - `human-benchmark-v1:avatar-magicbrush-74`: "let her have a beard and a moustache"
   - `human-benchmark-v1:avatar-realedit-20`: "Update her face to include the full beard from God of War 2018"
   - `human-benchmark-v1:avatar-realedit-29`: "Add a top hat and monocle to her please?"
8. **binding missing for drawing.drawn.direction** — 35 sample rows, ≈1429 rows in the data; layer bindings; drawing 35
   - `human-adapted-v1-drawing:human-adapted-drawing-0037`: "then the person in a purple hat moves one space to the right"
   - `human-benchmark-v1:drawing-blocks-003`: "block 11's right side should touch block 13's left side"
   - `human-benchmark-v1:drawing-blocks-004`: "Pick up the 20 box and sit it down below and even with the 19 box."
9. **binding missing: diagram.node target without a kind word (fill=context)** — 43 sample rows, ≈1269 rows in the data; layer bindings; diagram 43
   - `data-drop-v1:dg-batch-02-diagram-00195`: "please take the gridlines off the chart"
   - `data-drop-v1:dg-batch-02-diagram-00200`: "with only three categories the guides are noise, drop them"
   - `data-drop-v1:dg-batch-02-diagram-00207`: "cap the y axis at 200"
10. **binding missing: diagram.node target without a kind word (fill=-)** — 36 sample rows, ≈1221 rows in the data; layer bindings; diagram 36
   - `data-drop-v1:dg-batch-02-diagram-00869`: "add a rounded box called Wrap and give it a green outline"
   - `data-drop-v1:dg-batch-02-diagram-00522`: "March: 4 more"
   - `data-drop:dg-batch-02:diagram:1270`: "a general clean-up will do"
11. **binding missing for avatar.part.colour** — 42 sample rows, ≈1172 rows in the data; layer bindings; avatar 42
   - `human-benchmark-v1:avatar-emuedit-18`: "Make the girl's shirt blue instead of the red color it is now."
   - `human-benchmark-v1:avatar-magicbrush-3`: "change the shirt to red shirt"
   - `human-benchmark-v1:avatar-emuedit-31`: "Change her to a young, white male in his 20s- and add a blond crew cut."
12. **knowledge: kind words of drawing.drawn not bound** — 20 sample rows, ≈1160 rows in the data; layer knowledge; drawing 20
   - values: sign (2), rubber duckies (1), round tree (1), balloons (1), slide swing (1), beachball (1), burger (1), fruit basket (1), tail (1), cottage-y home things (1), filed (1), bota (1)
   - `human-adapted-v1-drawing:human-adapted-drawing-0465`: "change the stuffed toys into rubber duckies"
   - `human-benchmark-v1:drawing-codraw-008`: "large round tree to the left of the picture. we can not see the top of it"
   - `human-benchmark-v1:drawing-codraw-042`: "next to her legs small balloons sitting there."
13. **rule missing: query projection ask=what for drawing.drawn** — 15 sample rows, ≈1078 rows in the data; layer rule; drawing 15
   - `demo-tool-profile:data/haiku-v1/drawing/b01a.jsonl:drawing-b01-0114`: "Could you what colour is cat?. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/drawing/b05a.jsonl:drawing-b05-0079`: "what colour is face a?."
   - `demo-tool-profile:data/haiku-v1/drawing/b13a.jsonl:drawing-b13-0006`: "I need you to what colour is castle?. I appreciate it."
14. **host refused drawing.drawn.relation (make drawing.drawn)** — 16 sample rows, ≈955 rows in the data; layer execution; drawing 16
   - `ui-coverage-v2:ui-coverage-v2-drawing-00086`: "draw a tree next to the house"
   - `ui-relations-v1:ui-relations-00879`: "draw a leafless tree on the left side of the tree"
   - `ui-relations-v1:ui-relations-01748`: "give me a tractor just right of that tree"
15. **knowledge: kind words of document.text not bound** — 23 sample rows, ≈879 rows in the data; layer knowledge; document 23
   - values: words (19), paragraph (2), haiku (1), font (1)
   - `demo-tool-profile:data/haiku-v1/document/b03b.jsonl:document-b03-0198`: "Please, how many words are in the document?. Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b09b.jsonl:document-b09-0166`: "Hey, how many words are in the document?."
   - `demo-tool-profile:data/haiku-v1/document/b09b.jsonl:document-b09-0194`: "Hey, how many words are in the document?."
16. **binding missing for calendar.meeting.calendar** — 30 sample rows, ≈839 rows in the data; layer bindings; calendar 30
   - `demo-tool-profile:data/haiku-v1/calendar/b02a.jsonl:calendar-b02-0084`: "which events are on Work 3 on 2026-12-15?."
   - `demo-tool-profile:data/haiku-v1/calendar/b01a.jsonl:calendar-b01-0122`: "Please, which events are on Work 8 on 2026-12-16?. Thanks!"
   - `demo-tool-profile:data/haiku-v1/calendar/b05b.jsonl:calendar-b05-0219`: "Hey, which events are on Work 2 on 2026-12-06?. That would help."
17. **knowledge: kind words of diagram.chart not bound** — 20 sample rows, ≈818 rows in the data; layer knowledge; diagram 20
   - values: pie (6), flow (2), bar (1), scatter (1), graph (1), sc (1), weight buckets (1), origin (1), person (1), data (1), diagram (1), venn (1)
   - `demo-tool-profile:data/haiku-v2/diagram/v2b02a.jsonl:diagram-v2b02-0019`: "Hey, make a pie chart called Visits with values 15, 20 for Notes and Sample."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b10b.jsonl:diagram-v2b10-0135`: "Hey, make a pie chart called Customers with values 13, 8 for Q2 and Sample."
   - `demo-tool-profile:data/haiku-v2/diagram/v2b10b.jsonl:diagram-v2b10-0155`: "Please, make a bar chart called Fuel use with values 9, 8 for Car 1 and Sample. Thanks!"
18. **refused: overwrite-needs-stricter-admission for make document.section** — 29 sample rows, ≈784 rows in the data; layer execution; document 29
   - `human-benchmark-v1:document-dolly-010`: "Write an e-mail to the office asking employees to clean their coffee mugs rather than leave them in the sink. It should be polite, but express some annoyance."
   - `human-benchmark-v1:document-dolly-011`: "Please write a haiku"
   - `human-benchmark-v1:document-dolly-012`: "Write a letter to my mum and dad detailing the reasons why they should buy me a pet tortoise"
19. **binding missing for diagram.node.at** — 23 sample rows, ≈719 rows in the data; layer bindings; diagram 23
   - `data-drop-v1:pilot-diagram-00231`: "one more thing: please recolour Check yellow and then shove it a bit to the right"
   - `data-drop:dg-batch-02:diagram:66`: "legend up top"
   - `data-drop:dg-batch-02:diagram:883`: "the missing part is five steps at the bottom"
20. **binding missing: drawing.? target without a kind word (fill=-)** — 16 sample rows, ≈707 rows in the data; layer bindings; drawing 16
   - `data-drop-v1:pilot-drawing-00225`: "the other one, please, thanks"
   - `data-drop-v1:pilot-drawing-00277`: "the same for the trees, thanks"
   - `human-benchmark-v1:drawing-codraw-019`: "big bear on left, right arm is not visible, and hip at horizon."
21. **binding missing for calendar.calendar.name** — 23 sample rows, ≈701 rows in the data; layer bindings; calendar 23
   - `demo-tool-profile:data/haiku-v1/calendar/b05a.jsonl:calendar-b05-0106`: "I need you to create a calendar called Work 1; then book Review on Work 1 on 2026-12-09 at 09:00 UTC for 15 minutes. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/calendar/b11a.jsonl:calendar-b11-0031`: "add a calendar called Work 8; then schedule Review on Work 8 on 2026-12-04 at 16:00 UTC for 60 minutes."
   - `demo-tool-profile:data/haiku-v2/calendar/v2b03b.jsonl:calendar-v2b03-0179`: "Please, add a calendar called Work 3; then schedule Review on Work 3 on 2026-12-19 at 11:00 UTC for 45 minutes. Thanks!"
22. **knowledge: kind words of document.block not bound** — 34 sample rows, ≈692 rows in the data; layer knowledge; document 34
   - values: paragraph (7), table (4), title (3), quote (3), chapter (3), heading (2), text (2), content (1), square (1), collegue (1), banner line (1), tables (1)
   - `human-benchmark-v1:document-docedit-003`: "Added alphabetical pointers to the headings of the page."
   - `human-benchmark-v1:document-docedit-041`: "Right bottom corner text move to the right top corner"
   - `human-benchmark-v1:document-docedit-037`: "Paragraph \"Since rolling out a largely\" following line\"These difficulties have been well-chronicled \" is replaced with \"These vulnerabilities have been we
23. **binding missing for avatar.part.ids** — 28 sample rows, ≈647 rows in the data; layer bindings; avatar 28
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-48aa9d8d8f91666ad1`: "make the hair front huge size"
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-564207710432029b17`: "set the \"nose\" part to the wide variant"
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-7932aa5bad646fe5b4`: "set the \"nose\" part to the long variant"
24. **tool argument binding missing for change avatar.part [part.colour]** — 16 sample rows, ≈626 rows in the data; layer bindings; avatar 16
   - `human-benchmark-v1:avatar-emuedit-41`: "Change her hair to be all blue"
   - `human-benchmark-v1:avatar-emuedit-42`: "Change the color of the child's hair to black."
   - `human-benchmark-v1:avatar-magicbrush-41`: "Let her eyes turn blue."
25. **binding missing: diagram.sketch target without a kind word (fill=context)** — 18 sample rows, ≈620 rows in the data; layer bindings; diagram 18
   - `data-drop-v1:dg-batch-02-diagram-01372`: "not the first, the second"
   - `data-drop-v1:dg-batch-02-diagram-01458`: "list everything the Review step connects to"
   - `data-drop:dg-batch-02:diagram:1717`: "make it look better, this layout is a mess"
26. **knowledge: kind words of drawing.? not bound** — 9 sample rows, ≈519 rows in the data; layer knowledge; drawing 9
   - values: house (1), hill (1), boat (1), airplane (1), shovel (1), boy (1), pine tree (1), tiger (1), stuffed panda (1)
   - `data-drop-v1:dw-batch-01-drawing-01561`: "leave a single house standing, clear the rest"
   - `data-drop-v1:dw-batch-01-drawing-01451`: "the hill should be bare"
   - `data-drop-v1:pilot-drawing-00032`: "lake, boat on it, house nearby, if you can"
27. **refused: drawing-not-in-catalog for make drawing.drawn** — 8 sample rows, ≈511 rows in the data; layer execution; drawing 8
   - `main-synthetic:syn-orphans-mech-19088`: "add an elk"
   - `ui-relations-v1:ui-relations-01537`: "Give me a lynx to the right of the tree there."
   - `ui-relations-v1:ui-relations-01898`: "sketch a cardinal over the hill there"
28. **placement refused (tool-binding) for make drawing.drawn [drawn.anchor (selector), drawn.relation]** — 8 sample rows, ≈478 rows in the data; layer execution; drawing 8
   - `ui-relations-v1:ui-relations-00921`: "draw a mite left of the mountain"
   - `ui-relations-v1:ui-relations-01144`: "put a tree frog on the left side of that mountain"
   - `ui-relations-v1:ui-relations-03964`: "Make a barracuda into that lake."
29. **binding missing for avatar.part.variant** — 16 sample rows, ≈478 rows in the data; layer bindings; avatar 16
   - `human-benchmark-v1:avatar-emuedit-13`: "change her shirt into a boston red sox t shirt"
   - `human-benchmark-v1:avatar-magicbrush-27`: "let her be bald"
   - `human-benchmark-v1:avatar-realedit-1`: "Could someone please remove the double chin and slim her face?"
30. **binding missing for document.section.id** — 24 sample rows, ≈474 rows in the data; layer bindings; document 24
   - `human-benchmark-v1:document-pptc-035`: "change the font color of the title to red"
   - `human-benchmark-v1:document-pptc-039`: "change the font color of the title to orange. then create a new section and name it \"Data Preprocessing\""
   - `main-synthetic:syn-document-2-1845`: "That unit Intro, 2 and 3 — picked"
31. **binding missing for avatar.face.preset** — 18 sample rows, ≈464 rows in the data; layer bindings; avatar 18
   - `human-benchmark-v1:avatar-emuedit-39`: "Change the girl's long hair into strands of neon lights."
   - `human-benchmark-v1:avatar-magicbrush-49`: "Have the girl have big, green eyes"
   - `human-benchmark-v1:avatar-magicbrush-28`: "what if the girl has glasses?"
32. **needs (meaning without a key): drawn.becomes** — 7 sample rows, ≈453 rows in the data; layer needs; drawing 7
   - `data-drop-v1:dw-batch-01-drawing-00027`: "and change the fish into a shark"
   - `data-drop-v1:pilot-drawing-00065:with-previous`: "please change the grass to water"
   - `data-drop-v1:dw-batch-01-drawing-00322`: "one of the fish should be a shark now"
33. **refused: overwrite-needs-stricter-admission for make document.text** — 17 sample rows, ≈437 rows in the data; layer execution; document 17
   - `demo-tool-profile:data/haiku-v1/document/b04a.jsonl:document-b04-0069`: "Could you write a report about The Fox Who Lost His Tail in approximately 21 words. Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b15b.jsonl:document-b15-0141`: "Hey, write a report about Lab safety note in approximately 27 words. That would help."
   - `demo-tool-profile:data/haiku-v2/document/v2b07a.jsonl:document-v2b07-0056`: "Hey, compose a report about Newsletter in approximately 43 words. That would help."
34. **binding missing for document.section.order** — 23 sample rows, ≈433 rows in the data; layer bindings; document 23
   - `demo-tool-profile:data/haiku-v1/document/b03a.jsonl:document-b03-0079`: "I need you to place Refund paragraph after Summary. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/document/b08a.jsonl:document-b08-0027`: "I need you to put Agenda after Decisions. I appreciate it."
   - `demo-tool-profile:data/haiku-v1/document/b02b.jsonl:document-b02-0212`: "place Essay draft after Quote bank."
35. **binding missing for avatar.face.base** — 11 sample rows, ≈420 rows in the data; layer bindings; avatar 11
   - `human-benchmark-v1:avatar-magicbrush-44`: "change the girl into a man"
   - `human-benchmark-v1:avatar-magicbrush-69`: "turn the girl in a woman"
   - `human-benchmark-v1:avatar-emuedit-36`: "Change her into a space astronaut."
36. **binding missing for document.block.align** — 18 sample rows, ≈418 rows in the data; layer bindings; document 18
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-a27ddf940a38dc05d2`: "align Body left"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-7f0ce5093428c7f868`: "align Body center"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-c2d22ab967f012c54b`: "align Body justify"
37. **binding missing: document.block target without a kind word (fill=context)** — 19 sample rows, ≈415 rows in the data; layer bindings; document 19
   - `human-benchmark-v1:document-docedit-017`: "Changed the placement of text by placing it in the third column."
   - `human-benchmark-v1:document-docedit-012`: "Delete the footnote \"19 As far as the statute is concerned,)"
   - `human-benchmark-v1:document-docedit-014`: "Removed \"(on-line publication)\" from start of the page"
38. **binding missing: diagram.sketch target without a kind word (fill=written)** — 7 sample rows, ≈412 rows in the data; layer bindings; diagram 7
   - `ui-coverage-v2:ui-coverage-v2-diagram-00544:with-previous`: "Do the charts include a Survey results group, or was that removed?"
   - `ui-coverage-v2:ui-coverage-v2-diagram-00551`: "does South exist"
   - `ui-diagram-v2:ui-diagram-v2-02617:with-previous`: "clear awayy Idea-n2 connector"
39. **rule missing: query projection ask=list for diagram.chart** — 6 sample rows, ≈407 rows in the data; layer rule; diagram 6
   - `demo-tool-profile:data/haiku-v1/diagram/b05a.jsonl:diagram-b05-0020`: "Hey, what values does Core router show?."
   - `demo-tool-profile:data/haiku-v1/diagram/b06b.jsonl:diagram-b06-0177`: "Let us what values does Photosynthesis show?. That would help."
   - `demo-tool-profile:data/haiku-v1/diagram/b04b.jsonl:diagram-b04-0189`: "Could you what values does Hannah Cole show?. I appreciate it."
40. **needs (meaning without a key): part.owner** — 6 sample rows, ≈405 rows in the data; layer needs; drawing 6
   - values: eyes (1)
   - `data-drop-v1:dw-batch-01-drawing-00463:with-previous`: "put a pair of eyes on the sun"
   - `data-drop-v1:dw-batch-01-drawing-00708:with-previous`: "turn the boy's shirt red, please"
   - `data-drop-v1:dw-batch-01-drawing-00712:with-previous`: "can you turn the girl's shirt red?"
41. **tool argument binding missing for make document.section [section.content]** — 19 sample rows, ≈400 rows in the data; layer bindings; document 19
   - `demo-tool-profile:data/haiku-v1/document/b12b.jsonl:document-b12-0204`: "make a heading called Love note Sam; then make a paragraph saying \"Bring the revised notes to the meeting.\"."
   - `demo-tool-profile:data/haiku-v1/document/b16b.jsonl:document-b16-0187`: "Please, make a heading called Lost pets; then make a paragraph saying \"Please confirm these updated details.\". Thanks!"
   - `demo-tool-profile:data/haiku-v1/document/b11a.jsonl:document-b11-0017`: "Please, make a heading called Victoria sponge; then add a paragraph saying \"Everyone can read the new summary.\". Thanks!"
42. **reading refused without diagnostics** — 12 sample rows, ≈396 rows in the data; layer rule; diagram 4, drawing 7, calendar 1
   - `data-drop-v1:dg-batch-02-diagram-01643`: "the same for the rest, thanks"
   - `data-drop-v1:dw-batch-01-drawing-01554`: "hey, take down every house except the blue one"
   - `demo-tool-profile:data/haiku-v1/drawing/b03a.jsonl:drawing-b03-0037`: "Hey, remove tower block, but leave crane alone."
43. **binding missing for document.block.at** — 16 sample rows, ≈395 rows in the data; layer bindings; document 16
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-3ee584c0da66acb740`: "turn italic off for characters 0 to 5 of Body"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-4dc4b5bd60fc4ab518`: "turn highlight on for characters 0 to 5 of Body using yellow"
   - `demo-tool-profile:data/demo-tool-profile/documents-authored.jsonl:documents-tools-4f97d5e9ef27e177a9`: "turn link on for characters 0 to 5 of Body with target https://example.org/notes"
44. **reader: missing-or-ambiguous-act-anchor request.request.act** — 10 sample rows, ≈384 rows in the data; layer reader; diagram 4, drawing 6
   - `human-benchmark-v1:diagram-nlv-22`: "Split Ship Mode by category and segement and Avg(Profit) render barchart"
   - `human-benchmark-v1:drawing-blocks-023`: "take block 3 and place it by block 4 such that its bottom touches the top of block 4, such that the sides are flush"
   - `human-benchmark-v1:drawing-codraw-021`: "on your left hand side is a boy the green and blue line are his chest he is turn right has a smile on his face hand on hip"
45. **binding missing for avatar.face.id** — 17 sample rows, ≈379 rows in the data; layer bindings; avatar 17
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-1fd0e0bedfc678bf81`: "call Avatar Ada"
   - `demo-tool-profile:data/demo-tool-profile/avatar-authored.jsonl:avatar-demo-27efb9e612f3fac585`: "call Avatar Nova"
   - `human-benchmark-v1:avatar-realedit-4`: "Could someone turn her into Thanos? (making face purple, adding lines to chin)? Thank you."
46. **binding missing for diagram.chart.source** — 8 sample rows, ≈376 rows in the data; layer bindings; diagram 8
   - `human-benchmark-v1:diagram-nlv-24`: "Give me a scatter chart of budget vs earnings for each age rating"
   - `human-benchmark-v1:diagram-nlv-18`: "Chart scatter plot of budget by worldwide growth coded by genre"
   - `human-benchmark-v1:diagram-nlv-2`: "Show me a bar chart of total profit by region, and stack the bars by ship status"
47. **no operation for change drawing.drawn [drawn.size]** — 6 sample rows, ≈369 rows in the data; layer no-operation; drawing 6
   - `data-drop-v1:dw-batch-01-drawing-01680`: "grow the houses"
   - `demo-tool-profile:data/haiku-v2/drawing/v2b05b.jsonl:drawing-v2b05-0171`: "Let us make Sun 67 pixels wide. That would help."
   - `demo-tool-profile:data/haiku-v2/drawing/v2b28a.jsonl:drawing-v2b28-0034`: "Could you make robot 53 pixels wide. Thanks!"
48. **wrong effect: value:drawn.size for make drawing.drawn** — 7 sample rows, ≈368 rows in the data; layer wrong-effect; drawing 7
   - `human-benchmark-v1:drawing-codraw-020`: "large sun on right third seen in corner"
   - `human-benchmark-v1:drawing-codraw-023`: "large fireplace under the thunder cloud or immediately to the right of the boy."
   - `human-benchmark-v1:drawing-codraw-062`: "a large tree is on the right, 3/4 is hide on right and top."
49. **knowledge: kind words of diagram.? not bound** — 9 sample rows, ≈363 rows in the data; layer knowledge; diagram 9
   - values: flowchart (2), hexagon (2), arrows (1), algorithm (1), polygon (1), connector (1), arrow (1)
   - `data-drop-v1:pilot-diagram-00249`: "same for the arrows, if you can"
   - `human-benchmark-v1:diagram-texse-2`: "Simple flowchart"
   - `human-benchmark-v1:diagram-wc-11`: "You are a programmer and an expert on stock trading. Make an algorithm and a block diagram of a trading robot"
50. **binding missing: diagram.? target without a kind word (fill=-)** — 9 sample rows, ≈344 rows in the data; layer bindings; diagram 9
   - `human-benchmark-v1:diagram-supp-31`: "Drawing complex diagrams using gradients"
   - `human-benchmark-v1:diagram-wc-44`: "I want to create mind map on Medical surgical nursing subject Give me some mind map ideas"
   - `human-benchmark-v1:diagram-wc-35`: "make ER Diagram fot Students, department and college"
51. **binding missing: calendar.calendar target without a kind word (fill=context)** — 14 sample rows, ≈340 rows in the data; layer bindings; calendar 14
   - `human-benchmark-v1:calendar-massive-14`: "save this afternoon for my date"
   - `human-benchmark-v1:calendar-massive-44`: "show future events"
   - `human-benchmark-v1:calendar-massive-33`: "i need this event on a repeating cycle on my calendar"
52. **binding missing: diagram.node target without a kind word (fill=all)** — 12 sample rows, ≈338 rows in the data; layer bindings; diagram 12
   - `data-drop-v1:dg-batch-02-diagram-00971`: "connect all the boxes in order"
   - `data-drop-v1:dg-batch-02-diagram-01009:with-previous`: "reverse all three arrows"
   - `data-drop:dg-batch-02:diagram:1213`: "line all the boxes up in a column"
53. **refused: unapplied-scheduling-details for make calendar.meeting** — 11 sample rows, ≈337 rows in the data; layer execution; calendar 11
   - `human-benchmark-v1:calendar-clinc150-17`: "i need to put my appointment for tomorrow on my calendar"
   - `human-benchmark-v1:calendar-clinc150-6`: "would you schedule a meeting with carrie and lisa please"
   - `human-benchmark-v1:calendar-massive-13`: "add event for this evening meeting with jake"
54. **wrong effect: value:node.x for make diagram.node** — 7 sample rows, ≈329 rows in the data; layer wrong-effect; diagram 7
   - `human-benchmark-v1:diagram-nlv-10`: "line chart of AVG budget of each release year"
   - `human-benchmark-v1:diagram-nlv-15`: "For each data element, draw a circle at (its sales, profit) with the proper color by the region"
   - `human-benchmark-v1:diagram-nlv-28`: "bar chart of number of movies in each creative category"
55. **tool argument binding missing for make drawing.drawn** — 4 sample rows, ≈329 rows in the data; layer bindings; drawing 4
   - `data-drop-v1:pilot-drawing-00023`: "please a lake, a little boat on it, a house beside the lake"
   - `main-synthetic:syn-trigger-batch-20307`: "my current project needs a silver"
   - `main-synthetic:syn-trigger-batch-22436:with-previous`: "put a jaguar in, please"
56. **target not resolved for change diagram.node (fill=description)** — 9 sample rows, ≈316 rows in the data; layer execution; diagram 9
   - `data-drop-v1:pilot-diagram-00116:with-previous`: "the first two boxes should be half as wide — go on"
   - `data-drop:dg-batch-02:diagram:1027`: "rotate the first box by 30 degrees"
   - `ui-comparatives-v1:ui-comparatives-00493`: "make the shape slightly smaller, please"
57. **tool argument binding missing for change avatar.part [part.variant]** — 8 sample rows, ≈313 rows in the data; layer bindings; avatar 8
   - `human-benchmark-v1:avatar-emuedit-12`: "Make her eyes open."
   - `human-benchmark-v1:avatar-emuedit-43`: "Change the hair into a pink mohawk."
   - `human-benchmark-v1:avatar-realedit-51`: "Can someone make her eyes glow, like in ''I'm growing stronger'' meme?"
58. **wrong effect: kind for make drawing.drawn** — 4 sample rows, ≈296 rows in the data; layer wrong-effect; drawing 4
   - `human-adapted-v1-drawing:human-adapted-drawing-0260`: "big box center grass"
   - `human-benchmark-v1:drawing-magicbrush-001`: "Give the car a pig logo."
   - `main-synthetic:syn-enriched-mech-12907`: "add a trp"
59. **rule missing: context reference (fill=context) for drawing.drawn** — 8 sample rows, ≈295 rows in the data; layer rule; drawing 8
   - `data-drop-v1:dw-batch-01-drawing-01652`: "let the sheep turn whtie"
   - `human-benchmark-v1:drawing-magicbrush-056`: "Change the stop sign to say \"GO\""
   - `main-synthetic:syn-drawing-3136`: "audit runs long, so mount the ids on the page always — duration 1 keeps them fresh"
60. **wrong effect: kind for make diagram.node** — 12 sample rows, ≈294 rows in the data; layer wrong-effect; diagram 12
   - `data-drop:dg-batch-02:diagram:901`: "put a step in between n3 and n4"
   - `data-drop:dg-batch-02:diagram:909`: "one more stage between Order and Ship, make it so"
   - `human-adapted-v1-diagram:human-adapted-diagram-0178`: "node with data storage flowchart symbol"

## Top causes per stratum (oracle)

- **avatar|comparative** (n=23): binding missing for avatar.part.size (7); tool argument binding missing for change avatar.part [part.size] (3); tool argument binding missing for change avatar.part [part.scale] (3)
- **avatar|create-with-attributes** (n=35): binding missing for avatar.part.id (19); binding missing for avatar.part.ids (1)
- **avatar|edit** (n=150): tool argument binding missing for change avatar.part [part.colour,part.size,part.variant] (10); tool argument binding missing for change avatar.part [part.size,part.variant] (10); tool argument binding missing for change avatar.part [part.variant] (10)
- **avatar|edit-context** (n=25): binding missing for avatar.face.mode (5); binding missing for avatar.face.preset (5); binding missing for avatar.face.duration (5)
- **avatar|multi-request** (n=41): tool argument binding missing for change avatar.face [face.expression] (8); no operation for change avatar.face [face.mode] (1); binding missing for avatar.part.place (1)
- **avatar|place** (n=22): binding missing for avatar.part.ids (16); tool argument binding missing for place avatar.part [part.place] (3)
- **avatar|question** (n=20): rule missing: context reference (fill=context) for avatar.face (11); rule missing: query projection ask=exists for avatar.face (7); rule missing: query projection ask=describe for avatar.face (1)
- **avatar|remove** (n=27): binding missing: avatar.part target without a kind word (fill=all) (5); binding missing for avatar.part.ids (5); binding missing: avatar.part target without a kind word (fill=context) (5)
- **avatar|select** (n=20): binding missing: avatar.part target without a kind word (fill=context) (7); no operation for select avatar.part (6); binding missing for avatar.face.id (5)
- **calendar|comparative** (n=20): tool argument binding missing for change calendar.meeting [meeting.length] (10); target not resolved for place calendar.meeting (fill=written) (4); rule missing: comparative step projection for calendar.meeting.time (4)
- **calendar|create** (n=9): knowledge: kind words of calendar.room not bound (2); knowledge: kind words of calendar.calendar not bound (1)
- **calendar|create-with-attributes** (n=92): binding missing for calendar.meeting.room (13); binding missing for calendar.meeting.calendar (13); binding missing for calendar.meeting.people (3)
- **calendar|edit** (n=51): target not resolved for change calendar.meeting (fill=written) (8); binding missing for calendar.room.id (6); binding missing for calendar.meeting.id (5)
- **calendar|edit-context** (n=20): tool argument binding missing for change calendar.meeting [meeting.length] (6); binding missing for calendar.room.seats (2); binding missing for calendar.room.location (2)
- **calendar|multi-request** (n=35): binding missing for calendar.calendar.name (20); tool argument binding missing for make calendar.calendar [calendar.name] (5); binding missing for calendar.meeting.id (2)
- **calendar|place** (n=31): binding missing for calendar.meeting.day (17); tool argument binding missing for place calendar.meeting [meeting.start] (1); binding missing for calendar.meeting.id (1)
- **calendar|question** (n=55): binding missing for calendar.meeting.calendar (16); knowledge: kind words of calendar.person not bound (2); rule missing: query projection ask=when for calendar.meeting (2)
- **calendar|remove** (n=57): binding missing for calendar.meeting.id (3); binding missing for calendar.meeting.ids (3); binding missing for calendar.calendar.id (3)
- **calendar|select** (n=20): binding missing for calendar.meeting.id (19); no operation for select calendar.meeting (1)
- **calendar|structure** (n=20): binding missing for calendar.meeting.ids (20)
- **diagram|comparative** (n=25): binding missing: diagram.point target without a kind word (fill=-) (6); target not resolved for change diagram.node (fill=description) (6); binding missing: diagram.node target without a kind word (fill=written) (5)
- **diagram|connect** (n=28): binding missing: diagram.node target without a kind word (fill=all) (5); tool argument binding missing for connect diagram.link [link.to] (5); binding missing: diagram.node target without a kind word (fill=context) (2)
- **diagram|create** (n=28): wrong effect: kind for make diagram.node (6); knowledge: kind words of diagram.node not bound (3); binding missing: diagram.node target without a kind word (fill=-) (2)
- **diagram|create-relation** (n=27): binding missing for diagram.node.position (22)
- **diagram|create-with-attributes** (n=116): knowledge: kind words of diagram.chart not bound (5); binding missing for diagram.chart.source (5); binding missing for diagram.series.label (4)
- **diagram|edit** (n=119): binding missing: diagram.node target without a kind word (fill=written) (28); target not resolved for change diagram.chart (fill=written) (13); binding missing for diagram.series.label (7)
- **diagram|edit-context** (n=83): target not resolved for change diagram.chart (fill=context) (43); tool argument binding missing for change diagram.page [page.duration] (5); tool argument binding missing for change diagram.diagram [diagram.by] (5)
- **diagram|edit-population** (n=34): target not resolved for change diagram.node (fill=all) (11); binding missing: diagram.node target without a kind word (fill=all) (7); tool argument binding missing for change diagram.node [node.effect] (3)
- **diagram|multi-request** (n=82): binding missing: diagram.point target without a kind word (fill=-) (4); binding missing: diagram.node target without a kind word (fill=written) (4); target not resolved for change diagram.chart (fill=context) (3)
- **diagram|needs** (n=28): needs (meaning without a key): chart.dimension (9); needs (meaning without a key): diagram.background (4); needs (meaning without a key): preference (4)
- **diagram|place** (n=21): binding missing for diagram.node.at (6); binding missing: diagram.node target without a kind word (fill=written) (4); target not resolved for place diagram.node (fill=description) (3)
- **diagram|place-relation** (n=20): binding missing for diagram.node.position (13); binding missing for diagram.node.relation (4); tool argument binding missing for place diagram.node [node.position] (2)
- **diagram|question** (n=35): rule missing: query projection ask=list for diagram.chart (10); binding missing: diagram.node target without a kind word (fill=written) (4); rule missing: query projection ask=exists for diagram.link (3)
- **diagram|remove** (n=31): binding missing: diagram.sketch target without a kind word (fill=context) (9); reading refused without diagnostics (5); binding missing for diagram.series.label (4)
- **diagram|select** (n=23): binding missing: diagram.node target without a kind word (fill=written) (7); binding missing: diagram.node target without a kind word (fill=context) (4); no operation for select diagram.group (4)
- **diagram|structure** (n=92): wrong effect: changed for arrange diagram.diagram (10); binding missing: diagram.node target without a kind word (fill=context) (9); rule missing: context reference (fill=context) for diagram.diagram (8)
- **document|comparative** (n=20): target not resolved for change document.text (fill=written) (8); tool argument binding missing for change document.text [text.tone] (6); binding missing for document.section.id (2)
- **document|create** (n=20): knowledge: kind words of document.block not bound (8); tool argument binding missing for make document.section (6); binding missing: document.section target without a kind word (fill=-) (4)
- **document|create-with-attributes** (n=106): binding missing for document.text.content (15); refused: overwrite-needs-stricter-admission for make document.text (15); binding missing for document.inline.rows (5)
- **document|edit** (n=146): binding missing for document.section.content (23); binding missing for document.block.id (15); binding missing for document.section.id (13)
- **document|edit-context** (n=34): binding missing for document.block.items (6); binding missing for document.section.role (5); binding missing for document.block.align (4)
- **document|multi-request** (n=64): tool argument binding missing for make document.section [section.content] (19); binding missing for document.section.content (1); knowledge: kind words of document.block not bound (1)
- **document|place** (n=23): binding missing for document.section.ids (6); knowledge: kind words of document.block not bound (5); binding missing for document.block.ids (5)
- **document|place-relation** (n=23): binding missing for document.section.order (20)
- **document|question** (n=27): rule missing: context reference (fill=context) for document.text (19); knowledge: kind words of document.block not bound (3); knowledge: kind words of document.document not bound (2)
- **document|remove** (n=27): binding missing: document.section target without a kind word (fill=written) (10); binding missing for document.block.ids (3); binding missing: document.document target without a kind word (fill=context) (3)
- **document|select** (n=26): binding missing for document.block.id (11); binding missing for document.section.id (7); binding missing for document.block.from (5)
- **document|structure** (n=22): binding missing for document.block.parent (16); binding missing for document.section.parent (5); rule missing: context reference (fill=context) for document.text (1)
- **drawing|comparative** (n=20): tool argument binding missing for change drawing.drawn [drawn.size] (4); tool argument binding missing for change drawing.drawn [drawn.height] (3); target not resolved for change drawing.drawn (fill=all) (1)
- **drawing|create** (n=112): knowledge: kind words of drawing.drawn not bound (4); tool argument binding missing for make drawing.drawn (2); wrong effect: kind for make drawing.drawn (1)
- **drawing|create-relation** (n=115): host refused drawing.drawn.relation (make drawing.drawn) (18); binding missing: relation anchor reference in drawing (14); placement refused (tool-binding) for make drawing.drawn [drawn.anchor (selector), drawn.relation] (9)
- **drawing|create-with-attributes** (n=99): knowledge: kind words of drawing.drawn not bound (6); binding missing for drawing.drawn.at (3); tool argument binding missing for make drawing.drawn [drawn.x,drawn.y] (1)
- **drawing|edit** (n=70): no operation for change drawing.drawn [drawn.colour] (31); bridge: requires-measure-projection (drawing.drawn.size) (6); binding missing for drawing.part.owner (4)
- **drawing|edit-context** (n=20): rule missing: context reference (fill=context) for drawing.page (17)
- **drawing|edit-population** (n=20): rule missing: population/description reference (fill=all, all) for drawing.drawn (6); rule missing: population/description reference (fill=all) for drawing.drawn (5); setup: context object not creatable (sheep: refused:drawing-not-in-catalog) (3)
- **drawing|multi-request** (n=39): binding missing: relation anchor reference in drawing (10); placement refused (tool-binding) for make drawing.drawn [drawn.name] (5); labels: gold-spans-overlap-or-out-of-order (3)
- **drawing|needs** (n=26): needs (meaning without a key): part.owner (6); needs (meaning without a key): drawn.becomes (6); needs (meaning without a key): drawn.region (4)
- **drawing|place** (n=26): binding missing for drawing.drawn.direction (5); tool argument binding missing for place drawing.drawn [drawn.direction,drawn.distance] (3); bridge: act without trigger words (place fragments) (3)
- **drawing|place-relation** (n=40): binding missing: relation anchor reference in drawing (10); placement refused (request-shape) for place drawing.drawn [drawn.anchor (selector), drawn.ids (selector), drawn.relation] (6); placement refused (tool-binding) for place drawing.drawn [drawn.anchor (selector), drawn.relation] (3)
- **drawing|question** (n=25): rule missing: query projection ask=what for drawing.drawn (15); rule missing: context reference (fill=context) for drawing.drawn (3); rule missing: query projection ask=exists for drawing.drawn (1)
- **drawing|remove** (n=22): reading refused without diagnostics (6); rule missing: population/description reference (fill=all) for drawing.drawn (5); rule missing: context reference (fill=context) for drawing.page (3)
- **drawing|select** (n=20): no operation for select drawing.drawn (8); knowledge: kind words of drawing.part not bound (4); bridge: requires-declared-ordinal-projection (4)
- **drawing|structure** (n=24): binding missing for drawing.group.members (5); no operation for group drawing.drawn (3); no operation for group drawing.drawn [drawn.name] (3)
