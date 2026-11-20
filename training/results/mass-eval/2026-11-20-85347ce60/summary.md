# PSys2 mass evaluation — 2026-11-20 @ 85347ce60

Mode: **stratified (rate 0.01, min 20 per tab x usage class, >=3 per operation, >=5 per key family)**, seed `498660`. Rows loaded: 96167 (official 93538, data-drop:dg-batch-02 1765, data-drop:dw-batch-01:duplicate 1799, data-drop:dw-batch-01 7, human-benchmark-v1 857, human-benchmark-v1:session-skipped 508); evaluated: **3002**. Levels: oracle, e2e. Runtime 356 s with 16 workers (8.47 rows/s, each row at every level).

**Verdicts** (scripts/mass-eval/judge.mjs, on the instance-world diff of the tab's SOP area): `success` — acted and every comparable expectation held (kind, count, values, relations geometrically, target, answer); `plausible` — acted on the right objects but some expectations had no comparable observation (degree words, values without an observed input); `wrong-effect` — acted but a hard expectation failed; `refused` — no effect (bridge diagnostics or execution refusal); `error`; `excluded` — needs journal history (undo/redo), not in the denominators. **Rate = success + plausible**; strict = success only. Rates are population estimates (weights N/n per tab × usage class stratum) with Wilson 95% intervals; *under-sampled* = n < 20 or interval wider than 30 points.

**Oracle** = the gold labels as the reader output (trainer view: two-class determiners, closed-bank values outside the bank dropped; `needs` removed) through the real key-reader pipeline, bridge, compiler and executor; it measures the runtime independently of the reader. **End-to-end** = the deployed SOP-BERT bundle reads the text with context and previous message. A reader-induced failure is a row the oracle executes and the deployed reader does not.

## Success per tab

| tab | population | n | oracle | oracle strict | end-to-end | e2e strict | reader-induced | excluded |
|---|---:|---:|---|---|---|---|---:|---:|
| drawing | 37128 | 744 | 44.8% [40.2%–49.6%] | 44.1% | 35.6% [31.8%–39.6%] | 31.2% | 18 | 23 |
| diagram | 28513 | 840 | 13.7% [11.1%–16.7%] | 12.3% | 15.2% [12.7%–18.0%] | 11.3% | 5 | 31 |
| document | 12496 | 584 | 3.0% [1.5%–5.6%] | 3.0% | 1.6% [0.8%–3.2%] | 1.6% | 2 | 20 |
| calendar | 8408 | 436 | 6.6% [3.8%–11.2%] | 6.6% | 3.1% [1.7%–5.6%] | 3.1% | 14 | 0 |
| avatar | 9622 | 398 | 1.4% [0.4%–4.9%] | 0.4% | 0.9% [0.2%–3.1%] | 0.2% | 0 | 23 |
| all | 96167 | 3002 | 23.6% [21.5%–25.8%] | 22.7% | 18.8% [17.2%–20.6%] | 15.9% | 39 | 97 |

## Verdicts and layers

- **oracle** verdicts: refused 1541, success 363, partial 234, excluded 97, wrong-effect 22, plausible 13, error 3; failure layers: bindings 1063, rule 234, execution 208, no-operation 133, excluded 97, knowledge 70, needs 55, wrong-effect 22, setup 12, data 3
- **e2e** verdicts: refused 2141, success 354, partial 273, excluded 97, wrong-effect 73, plausible 64; failure layers: bindings 1606, knowledge 212, execution 203, rule 120, reader 112, no-operation 112, excluded 97, wrong-effect 66, needs 50, setup 6

## Success per tab × usage class

| tab | usage class | population | n | oracle | end-to-end | top oracle cause |
|---|---|---:|---:|---|---|---|
| avatar | comparative | 328 | 23 | 4.3% [0.8%–21.0%] | 4.3% [0.8%–21.0%] | binding missing for avatar.part.size (7) |
| avatar | create *(under-sampled)* | 7 | 7 | – | 0.0% [0.0%–35.4%] |  |
| avatar | create-relation *(under-sampled)* | 6 | 6 | – | 0.0% [0.0%–39.0%] |  |
| avatar | create-with-attributes | 1740 | 35 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–9.9%] | binding missing for avatar.part.id (19) |
| avatar | edit | 6669 | 150 | 1.2% [0.2%–6.3%] | 0.7% [0.1%–3.7%] | tool argument binding missing for change avatar.part [part.colour,part.size,part.variant] (10) |
| avatar | edit-context | 243 | 25 | 0.0% [0.0%–13.3%] | 0.0% [0.0%–13.3%] | binding missing for avatar.face.mode (5) |
| avatar | history *(under-sampled)* | 65 | 22 | – | – |  |
| avatar | multi-request *(under-sampled)* | 74 | 41 | 0.0% [0.0%–24.3%] | 0.0% [0.0%–8.8%] | tool argument binding missing for change avatar.face [face.expression] (8) |
| avatar | place *(under-sampled)* | 152 | 22 | 0.0% [0.0%–16.8%] | 0.0% [0.0%–14.9%] | binding missing for avatar.part.ids (16) |
| avatar | question | 61 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | rule missing: context reference (fill=context) for avatar.face (11) |
| avatar | remove *(under-sampled)* | 156 | 27 | 21.1% [8.5%–43.3%] | 14.8% [5.9%–32.5%] | binding missing: avatar.part target without a kind word (fill=all) (5) |
| avatar | select | 121 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | binding missing: avatar.part target without a kind word (fill=context) (7) |
| calendar | comparative | 103 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | tool argument binding missing for change calendar.meeting [meeting.length] (10) |
| calendar | create *(under-sampled)* | 9 | 9 | 25.0% [4.6%–69.9%] | 22.2% [6.3%–54.7%] | knowledge: kind words of calendar.room not bound (2) |
| calendar | create-with-attributes | 2808 | 92 | 2.4% [0.4%–12.3%] | 1.1% [0.2%–5.9%] | binding missing for calendar.meeting.room (13) |
| calendar | edit | 739 | 51 | 0.0% [0.0%–12.1%] | 2.0% [0.3%–10.3%] | target not resolved for change calendar.meeting (fill=written) (8) |
| calendar | edit-context *(under-sampled)* | 48 | 20 | 20.0% [8.1%–41.6%] | 15.0% [5.2%–36.0%] | tool argument binding missing for change calendar.meeting [meeting.length] (6) |
| calendar | multi-request | 1115 | 35 | 0.0% [0.0%–11.4%] | 0.0% [0.0%–9.9%] | binding missing for calendar.calendar.name (20) |
| calendar | no-request | 171 | 26 | 100.0% [83.9%–100.0%] | 100.0% [87.1%–100.0%] |  |
| calendar | place *(under-sampled)* | 1216 | 31 | 0.0% [0.0%–16.8%] | 0.0% [0.0%–11.0%] | binding missing for calendar.meeting.day (17) |
| calendar | question | 1414 | 55 | 0.0% [0.0%–14.9%] | 0.0% [0.0%–6.5%] | binding missing for calendar.meeting.calendar (16) |
| calendar | remove *(under-sampled)* | 608 | 57 | 46.4% [29.5%–64.2%] | 5.3% [1.8%–14.4%] | binding missing for calendar.meeting.id (3) |
| calendar | select | 90 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | binding missing for calendar.meeting.id (19) |
| calendar | structure | 87 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | binding missing for calendar.meeting.ids (20) |
| diagram | comparative | 691 | 25 | 0.0% [0.0%–13.3%] | 0.0% [0.0%–13.3%] | binding missing: diagram.point target without a kind word (fill=-) (6) |
| diagram | connect *(under-sampled)* | 1256 | 28 | 34.6% [19.4%–53.8%] | 32.1% [17.9%–50.7%] | binding missing: diagram.node target without a kind word (fill=all) (5) |
| diagram | create *(under-sampled)* | 487 | 28 | 42.9% [24.5%–63.5%] | 46.4% [29.5%–64.2%] | wrong effect: kind for make diagram.node (6) |
| diagram | create-relation | 204 | 27 | 0.0% [0.0%–14.9%] | 25.9% [13.2%–44.7%] | binding missing for diagram.node.position (22) |
| diagram | create-with-attributes | 5458 | 116 | 41.7% [31.0%–53.2%] | 33.6% [25.7%–42.6%] | knowledge: kind words of diagram.chart not bound (5) |
| diagram | edit | 5946 | 119 | 6.0% [3.0%–11.9%] | 3.4% [1.3%–8.3%] | binding missing: diagram.node target without a kind word (fill=written) (28) |
| diagram | edit-context | 1913 | 83 | 1.2% [0.2%–6.5%] | 4.8% [1.9%–11.7%] | target not resolved for change diagram.chart (fill=context) (43) |
| diagram | edit-population | 432 | 34 | 0.0% [0.0%–11.4%] | 2.9% [0.5%–14.9%] | target not resolved for change diagram.node (fill=all) (11) |
| diagram | history *(under-sampled)* | 340 | 27 | – | – |  |
| diagram | multi-request | 2662 | 82 | 45.5% [31.7%–59.9%] | 26.9% [18.3%–37.7%] | binding missing: diagram.point target without a kind word (fill=-) (4) |
| diagram | needs | 1124 | 28 | 0.0% [0.0%–12.1%] | 21.4% [10.2%–39.5%] | needs (meaning without a key): chart.dimension (9) |
| diagram | no-request | 162 | 21 | 100.0% [83.9%–100.0%] | 100.0% [84.5%–100.0%] |  |
| diagram | place | 440 | 21 | 9.5% [2.7%–28.9%] | 9.5% [2.7%–28.9%] | binding missing for diagram.node.at (6) |
| diagram | place-relation | 127 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | binding missing for diagram.node.position (13) |
| diagram | question | 2372 | 35 | 5.9% [1.6%–19.1%] | 8.6% [3.0%–22.4%] | rule missing: query projection ask=list for diagram.chart (10) |
| diagram | remove | 1063 | 31 | 0.0% [0.0%–11.0%] | 3.2% [0.6%–16.2%] | binding missing: diagram.sketch target without a kind word (fill=context) (9) |
| diagram | select | 887 | 23 | 0.0% [0.0%–14.3%] | 0.0% [0.0%–14.3%] | binding missing: diagram.node target without a kind word (fill=written) (7) |
| diagram | structure | 2949 | 92 | 0.0% [0.0%–4.1%] | 2.2% [0.6%–7.6%] | wrong effect: changed for arrange diagram.diagram (10) |
| document | comparative | 35 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | target not resolved for change document.text (fill=written) (8) |
| document | create | 39 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | knowledge: kind words of document.block not bound (8) |
| document | create-relation *(under-sampled)* | 6 | 6 | – | 0.0% [0.0%–39.0%] |  |
| document | create-with-attributes | 2911 | 106 | 0.0% [0.0%–7.0%] | 0.9% [0.2%–5.2%] | binding missing for document.text.content (15) |
| document | edit | 4541 | 146 | 2.4% [0.6%–8.2%] | 0.0% [0.0%–2.6%] | binding missing for document.section.content (23) |
| document | edit-context | 336 | 34 | 0.0% [0.0%–10.2%] | 0.0% [0.0%–10.2%] | binding missing for document.block.items (6) |
| document | history *(under-sampled)* | 77 | 20 | – | – |  |
| document | multi-request | 1346 | 64 | 0.0% [0.0%–14.3%] | 0.0% [0.0%–5.7%] | tool argument binding missing for make document.section [section.content] (19) |
| document | no-request | 170 | 20 | 100.0% [83.9%–100.0%] | 100.0% [83.9%–100.0%] |  |
| document | place | 171 | 23 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–14.3%] | binding missing for document.section.ids (6) |
| document | place-relation | 445 | 23 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–14.3%] | binding missing for document.section.order (20) |
| document | question | 1088 | 27 | 0.0% [0.0%–13.3%] | 0.0% [0.0%–12.5%] | rule missing: context reference (fill=context) for document.text (19) |
| document | remove | 454 | 27 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–12.5%] | binding missing: document.section target without a kind word (fill=written) (10) |
| document | select | 362 | 26 | 0.0% [0.0%–12.9%] | 0.0% [0.0%–12.9%] | binding missing for document.block.id (11) |
| document | structure | 515 | 22 | 0.0% [0.0%–14.9%] | 0.0% [0.0%–14.9%] | binding missing for document.block.parent (16) |
| drawing | comparative *(under-sampled)* | 603 | 20 | 30.0% [14.5%–51.9%] | 25.0% [11.2%–46.9%] | tool argument binding missing for change drawing.drawn [drawn.size] (4) |
| drawing | create | 10476 | 112 | 92.4% [85.7%–96.1%] | 86.6% [79.1%–91.7%] | knowledge: kind words of drawing.drawn not bound (4) |
| drawing | create-quantity | 241 | 20 | 100.0% [83.9%–100.0%] | 100.0% [83.9%–100.0%] |  |
| drawing | create-relation | 6865 | 115 | 22.4% [14.1%–33.7%] | 18.3% [12.3%–26.3%] | host refused drawing.drawn.relation (make drawing.drawn) (18) |
| drawing | create-with-attributes | 4913 | 99 | 81.1% [68.6%–89.4%] | 35.4% [26.6%–45.2%] | knowledge: kind words of drawing.drawn not bound (6) |
| drawing | edit | 4743 | 70 | 1.8% [0.3%–9.4%] | 2.9% [0.8%–9.8%] | no operation for change drawing.drawn [drawn.colour] (31) |
| drawing | edit-context *(under-sampled)* | 278 | 20 | 15.0% [5.2%–36.0%] | 5.0% [0.9%–23.6%] | rule missing: context reference (fill=context) for drawing.page (17) |
| drawing | edit-population | 98 | 20 | 0.0% [0.0%–16.1%] | 45.0% [25.8%–65.8%] | rule missing: population/description reference (fill=all, all) for drawing.drawn (6) |
| drawing | history *(under-sampled)* | 102 | 23 | – | – |  |
| drawing | multi-request | 1897 | 39 | 0.0% [0.0%–15.5%] | 0.0% [0.0%–9.0%] | binding missing: relation anchor reference in drawing (10) |
| drawing | needs | 1753 | 26 | 3.8% [0.7%–18.9%] | 7.7% [2.1%–24.1%] | needs (meaning without a key): part.owner (6) |
| drawing | no-request | 167 | 23 | 100.0% [83.9%–100.0%] | 100.0% [85.7%–100.0%] |  |
| drawing | place | 334 | 26 | 7.7% [2.1%–24.1%] | 7.7% [2.1%–24.1%] | binding missing for drawing.drawn.direction (5) |
| drawing | place-relation | 1227 | 40 | 0.0% [0.0%–15.5%] | 5.0% [1.4%–16.5%] | binding missing: relation anchor reference in drawing (10) |
| drawing | question | 1796 | 25 | 0.0% [0.0%–13.3%] | 4.0% [0.7%–19.5%] | rule missing: query projection ask=what for drawing.drawn (15) |
| drawing | remove | 835 | 22 | 4.5% [0.8%–21.8%] | 9.1% [2.5%–27.8%] | reading refused without diagnostics (6) |
| drawing | select | 296 | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] | no operation for select drawing.drawn (8) |
| drawing | structure | 504 | 24 | 0.0% [0.0%–13.8%] | 0.0% [0.0%–13.8%] | binding missing for drawing.group.members (5) |

## Success per usage class (all tabs)

| usage class | n | oracle | end-to-end |
|---|---:|---|---|
| edit | 536 | 3.2% [1.8%–5.6%] | 1.7% [0.9%–3.4%] |
| create-with-attributes | 448 | 36.9% [30.9%–43.4%] | 20.4% [16.8%–24.5%] |
| multi-request | 261 | 16.6% [10.8%–24.6%] | 9.8% [6.4%–14.7%] |
| edit-context | 182 | 2.6% [1.0%–6.7%] | 4.0% [1.8%–8.5%] |
| create | 176 | 90.2% [83.4%–94.5%] | 84.4% [77.0%–89.8%] |
| remove | 164 | 7.6% [3.7%–14.9%] | 5.3% [2.5%–11.0%] |
| question | 162 | 2.4% [0.7%–7.7%] | 4.1% [1.8%–9.2%] |
| structure | 158 | 0.0% [0.0%–2.7%] | 1.6% [0.5%–5.3%] |
| create-relation | 154 | 21.5% [13.6%–32.3%] | 18.5% [12.6%–26.3%] |
| place | 123 | 3.8% [1.2%–11.0%] | 2.9% [0.9%–9.1%] |
| select | 109 | 0.0% [0.0%–5.3%] | 0.0% [0.0%–5.3%] |
| comparative | 108 | 11.1% [5.7%–20.3%] | 9.4% [4.6%–18.2%] |
| history | 92 | – | – |
| no-request | 90 | 100.0% [95.4%–100.0%] | 100.0% [95.9%–100.0%] |
| place-relation | 83 | 0.0% [0.0%–7.4%] | 3.4% [1.0%–10.7%] |
| needs | 54 | 2.3% [0.5%–10.9%] | 13.1% [6.3%–25.0%] |
| edit-population | 54 | 0.0% [0.0%–8.2%] | 10.7% [4.7%–22.7%] |
| connect | 28 | 34.6% [19.4%–53.8%] | 32.1% [17.9%–50.7%] |
| create-quantity | 20 | 100.0% [83.9%–100.0%] | 100.0% [83.9%–100.0%] |

## Success per operation (act on target family)

| operation | n | oracle | end-to-end |
|---|---:|---|---|
| drawing.make:drawn | 377 | 69.5% [63.4%–75.0%] | 51.6% [46.3%–56.9%] |
| diagram.make:node | 199 | 64.3% [54.0%–73.5%] | 41.7% [34.4%–49.3%] |
| avatar.change:part | 181 | 1.8% [0.4%–7.7%] | 1.0% [0.2%–4.2%] |
| document.change:section | 153 | 0.0% [0.0%–7.4%] | 0.0% [0.0%–2.6%] |
| calendar.make:meeting | 135 | 0.0% [0.0%–5.6%] | 0.0% [0.0%–3.3%] |
| drawing.change:drawn | 126 | 6.1% [2.6%–13.6%] | 5.6% [2.5%–11.9%] |
| diagram.change:node | 112 | 10.7% [5.7%–19.2%] | 6.5% [3.1%–13.4%] |
| document.make:section | 108 | 0.0% [0.0%–10.6%] | 1.2% [0.2%–6.0%] |
| (no request) | 90 | 100.0% [95.4%–100.0%] | 100.0% [95.9%–100.0%] |
| drawing.place:drawn | 80 | 1.6% [0.2%–10.5%] | 3.4% [1.0%–10.8%] |
| calendar.change:meeting | 73 | 0.4% [0.0%–11.7%] | 1.7% [0.3%–9.8%] |
| diagram.change:chart | 68 | 0.0% [0.0%–6.0%] | 5.3% [1.8%–14.0%] |
| diagram.connect:link | 65 | 67.8% [52.3%–80.1%] | 44.7% [33.1%–56.8%] |
| avatar.make:part | 58 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–9.6%] |
| avatar.change:face | 55 | 0.0% [0.0%–10.8%] | 0.0% [0.0%–10.8%] |
| calendar.remove:meeting | 53 | 59.1% [36.5%–78.5%] | 4.8% [1.3%–15.7%] |
| calendar.answer:meeting | 53 | 0.0% [0.0%–16.9%] | 0.0% [0.0%–6.8%] |
| calendar.place:meeting | 41 | 0.0% [0.0%–14.7%] | 0.0% [0.0%–10.1%] |
| document.change:block | 41 | 0.0% [0.0%–11.3%] | 0.0% [0.0%–11.3%] |
| diagram.place:node | 39 | 7.5% [2.2%–22.9%] | 7.5% [2.2%–22.9%] |
| document.place:section | 39 | 0.0% [0.0%–12.7%] | 0.0% [0.0%–10.1%] |
| avatar.place:part | 33 | 0.0% [0.0%–14.2%] | 0.0% [0.0%–12.4%] |
| document.make:text | 33 | 0.0% [0.0%–10.7%] | 0.0% [0.0%–10.7%] |
| diagram.change:link | 31 | 0.0% [0.0%–12.5%] | 4.3% [0.8%–19.2%] |
| calendar.make:calendar | 30 | 0.0% [0.0%–11.7%] | 0.0% [0.0%–11.7%] |
| diagram.change:diagram | 29 | 0.0% [0.0%–12.5%] | 0.0% [0.0%–12.5%] |
| diagram.arrange:node | 29 | 0.0% [0.0%–14.9%] | 6.9% [1.9%–22.0%] |
| document.change:text | 29 | 19.7% [6.4%–46.9%] | 0.0% [0.0%–23.0%] |
| document.make:block | 29 | 0.0% [0.0%–15.3%] | 0.0% [0.0%–15.3%] |
| diagram.make:chart | 28 | 0.0% [0.0%–12.1%] | 16.5% [7.0%–34.2%] |
| avatar.remove:part | 28 | 21.1% [8.5%–43.3%] | 14.6% [5.9%–32.1%] |
| diagram.change:point | 25 | 0.0% [0.0%–14.3%] | 0.0% [0.0%–14.3%] |
| drawing.answer:drawn | 25 | 0.0% [0.0%–13.3%] | 4.0% [0.7%–19.5%] |
| diagram.arrange:diagram | 22 | 0.0% [0.0%–14.9%] | 0.0% [0.0%–14.9%] |
| document.remove:section | 22 | 0.0% [0.0%–25.9%] | 0.0% [0.0%–15.0%] |
| calendar.select:meeting | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] |
| avatar.answer:face | 20 | 0.0% [0.0%–16.1%] | 0.0% [0.0%–16.1%] |
| document.answer:text | 19 | 0.0% [0.0%–16.8%] | 0.0% [0.0%–16.8%] |
| document.select:block | 19 | 0.0% [0.0%–16.8%] | 0.0% [0.0%–16.8%] |
| drawing.change:page | 17 | 0.0% [0.0%–18.4%] | 0.0% [0.0%–18.4%] |
| diagram.undo:page | 16 | – | – |
| diagram.select:node | 16 | 0.0% [0.0%–19.4%] | 0.0% [0.0%–19.4%] |
| diagram.answer:node | 16 | 14.5% [4.2%–39.7%] | 20.3% [7.3%–45.0%] |
| drawing.remove:drawn | 16 | 6.7% [1.2%–29.8%] | 12.3% [3.4%–35.8%] |
| drawing.change:part | 16 | 0.0% [0.0%–19.4%] | 0.0% [0.0%–19.4%] |
| diagram.change:group | 15 | 0.0% [0.0%–21.1%] | 0.0% [0.0%–21.1%] |
| avatar.undo:face | 15 | – | – |
| document.change:inline | 14 | 0.0% [0.0%–21.5%] | 0.0% [0.0%–21.5%] |
| avatar.select:part | 14 | 0.0% [0.0%–22.1%] | 0.0% [0.0%–22.1%] |
| diagram.answer:chart | 13 | 0.0% [0.0%–22.8%] | 0.0% [0.0%–22.8%] |
| diagram.remove:sketch | 13 | 0.0% [0.0%–22.8%] | 0.0% [0.0%–22.8%] |
| diagram.change:series | 12 | 0.0% [0.0%–24.3%] | 0.0% [0.0%–24.3%] |
| drawing.redo:drawn | 12 | – | – |
| drawing.group:drawn | 11 | 0.0% [0.0%–25.9%] | 0.0% [0.0%–25.9%] |
| diagram.change:page | 11 | 0.0% [0.0%–25.9%] | 0.0% [0.0%–25.9%] |
| document.redo:document | 11 | – | – |
| drawing.select:drawn | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| document.make:inline | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| diagram.group:group | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| drawing.select:part | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| calendar.change:room | 10 | 0.0% [0.0%–34.6%] | 0.0% [0.0%–34.6%] |
| document.place:block | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| diagram.connect:node | 9 | 0.0% [0.0%–30.1%] | 0.0% [0.0%–30.1%] |
| document.undo:document | 9 | – | – |
| drawing.undo:drawn | 9 | – | – |
| diagram.reverse:link | 8 | 0.0% [0.0%–32.4%] | 0.0% [0.0%–32.4%] |
| drawing.place:part | 8 | 0.0% [0.0%–32.4%] | 0.0% [0.0%–32.4%] |
| diagram.make:group | 8 | 0.0% [0.0%–33.2%] | 0.0% [0.0%–33.2%] |
| avatar.redo:face | 8 | – | – |
| diagram.undo:sketch | 7 | – | – |
| avatar.select:face | 7 | 0.0% [0.0%–35.4%] | 0.0% [0.0%–35.4%] |
| diagram.answer:link | 7 | 0.0% [0.0%–36.3%] | 0.0% [0.0%–36.3%] |
| document.select:section | 7 | 0.0% [0.0%–35.4%] | 0.0% [0.0%–35.4%] |
| drawing.remove:part | 6 | 0.0% [0.0%–41.0%] | 0.0% [0.0%–41.0%] |
| diagram.arrange:group | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| document.remove:block | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| diagram.redo:sketch | 6 | – | – |
| drawing.group:group | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| calendar.make:room | 5 | 0.0% [0.0%–55.1%] | 0.0% [0.0%–55.1%] |
| drawing.ungroup:drawn | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.change:document | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.place:group | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| calendar.change:person | 5 | 19.9% [2.4%–71.2%] | 13.3% [1.2%–66.7%] |
| diagram.remove:series | 4 | 0.0% [0.0%–49.0%] | 25.0% [4.6%–69.9%] |
| diagram.make:point | 4 | 0.0% [0.0%–49.1%] | 0.0% [0.0%–49.1%] |
| diagram.arrange:chart | 4 | 0.0% [0.0%–49.0%] | 0.0% [0.0%–49.0%] |
| document.answer:block | 4 | 0.0% [0.0%–50.3%] | 0.0% [0.0%–50.3%] |
| calendar.change:calendar | 4 | 0.0% [0.0%–64.5%] | 0.0% [0.0%–64.5%] |
| diagram.remove:node | 4 | 0.0% [0.0%–49.0%] | 0.0% [0.0%–49.0%] |
| diagram.select:group | 4 | 0.0% [0.0%–49.0%] | 0.0% [0.0%–49.0%] |
| diagram.remove:point | 4 | 0.0% [0.0%–49.0%] | 0.0% [0.0%–49.0%] |
| diagram.make:series | 4 | 0.0% [0.0%–49.0%] | 0.0% [0.0%–49.0%] |
| document.answer:section | 3 | – | 0.0% [0.0%–57.9%] |
| diagram.select:link | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| drawing.ungroup:part | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.ungroup:group | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| drawing.remove:page | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| calendar.remove:calendar | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| calendar.make:person | 3 | 50.8% [10.0%–90.6%] | 50.8% [10.0%–90.6%] |
| calendar.remove:person | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| calendar.remove:room | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.answer:sketch | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| document.answer:document | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.remove:group | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.remove:link | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.copy:node | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.arrange:link | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.split:node | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.merge:node | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| document.remove:document | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| drawing.undo:page | 2 | – | – |
| drawing.make:part | 2 | 0.0% [0.0%–65.8%] | 0.0% [0.0%–65.8%] |
| diagram.repeat:node | 2 | – | – |
| calendar.answer:calendar | 2 | 0.0% [0.0%–65.8%] | 0.0% [0.0%–65.8%] |
| calendar.answer:person | 2 | 0.0% [0.0%–65.8%] | 0.0% [0.0%–65.8%] |
| drawing.make:page | 1 | 0.0% [0.0%–79.3%] | 0.0% [0.0%–79.3%] |

## Success per key family

Rows that carry a constraint on the key (a row counts for each of its keys).

| key | n | oracle | end-to-end |
|---|---:|---|---|
| drawing.drawn.relation | 187 | 16.1% [10.2%–24.4%] | 13.6% [9.3%–19.4%] |
| drawing.drawn.anchor | 186 | 16.2% [10.3%–24.6%] | 13.7% [9.4%–19.5%] |
| calendar.meeting.day | 137 | 0.0% [0.0%–3.9%] | 0.0% [0.0%–2.8%] |
| calendar.meeting.title | 127 | 0.1% [0.0%–5.5%] | 0.1% [0.0%–3.6%] |
| drawing.drawn.colour | 110 | 38.5% [27.9%–50.4%] | 36.6% [26.8%–47.7%] |
| avatar.part.variant | 109 | 0.0% [0.0%–5.2%] | 0.0% [0.0%–3.8%] |
| calendar.meeting.time | 107 | 0.0% [0.0%–4.8%] | 0.0% [0.0%–3.7%] |
| calendar.meeting.length | 92 | 0.0% [0.0%–5.7%] | 0.0% [0.0%–5.7%] |
| drawing.drawn.size | 88 | 19.5% [9.6%–35.5%] | 3.5% [1.2%–9.8%] |
| avatar.part.colour | 79 | 0.0% [0.0%–13.7%] | 0.0% [0.0%–6.4%] |
| diagram.node.colour | 75 | 44.3% [32.5%–56.9%] | 46.5% [35.1%–58.2%] |
| diagram.node.ids | 71 | 14.1% [7.5%–25.0%] | 4.6% [1.5%–13.1%] |
| diagram.node.label | 70 | 81.1% [69.4%–89.0%] | 76.5% [64.5%–85.3%] |
| calendar.meeting.calendar | 56 | 0.0% [0.0%–6.6%] | 0.0% [0.0%–6.6%] |
| drawing.drawn.name | 56 | 55.8% [42.5%–68.2%] | 47.2% [34.4%–60.3%] |
| diagram.link.to | 55 | 46.8% [34.0%–60.1%] | 46.8% [34.0%–60.1%] |
| diagram.link.from | 53 | 48.1% [34.9%–61.6%] | 48.1% [34.9%–61.6%] |
| document.section.text | 53 | 0.0% [0.0%–30.4%] | 0.0% [0.0%–7.3%] |
| calendar.meeting.id | 51 | 0.0% [0.0%–10.7%] | 0.0% [0.0%–10.7%] |
| diagram.node.position | 50 | 0.0% [0.0%–13.8%] | 30.2% [15.4%–50.7%] |
| avatar.part.size | 48 | 0.0% [0.0%–10.4%] | 0.0% [0.0%–9.3%] |
| document.section.content | 45 | 0.0% [0.0%–8.1%] | 0.0% [0.0%–8.1%] |
| drawing.drawn.position | 45 | – | 0.0% [0.0%–7.9%] |
| diagram.chart.labels | 41 | 0.0% [0.0%–8.9%] | 0.0% [0.0%–8.9%] |
| diagram.node.anchor | 38 | 0.0% [0.0%–17.3%] | 17.8% [7.1%–37.9%] |
| document.section.topic | 38 | – | 2.7% [0.5%–13.8%] |
| document.section.genre | 37 | – | 2.7% [0.5%–13.8%] |
| drawing.drawn.facing | 37 | – | 0.0% [0.0%–9.5%] |
| diagram.node.x | 33 | 19.1% [4.1%–56.2%] | 3.0% [0.5%–15.8%] |
| diagram.group.id | 33 | 0.0% [0.0%–11.1%] | 0.0% [0.0%–11.1%] |
| drawing.drawn.ids | 32 | 0.0% [0.0%–14.2%] | 3.3% [0.5%–19.4%] |
| calendar.calendar.name | 31 | 0.0% [0.0%–11.4%] | 0.0% [0.0%–11.4%] |
| avatar.part.ids | 30 | 0.0% [0.0%–20.2%] | 0.0% [0.0%–20.2%] |
| diagram.node.y | 30 | 24.3% [5.8%–62.5%] | 3.3% [0.6%–17.3%] |
| diagram.node.chart | 29 | – | 3.4% [0.6%–17.2%] |
| diagram.point.value | 28 | 0.0% [0.0%–12.9%] | 0.0% [0.0%–12.9%] |
| avatar.part.place | 27 | 0.0% [0.0%–14.4%] | 0.0% [0.0%–14.4%] |
| document.section.order | 27 | 0.0% [0.0%–13.5%] | 0.0% [0.0%–13.1%] |
| calendar.meeting.ids | 27 | 0.0% [0.0%–20.1%] | 0.0% [0.0%–20.1%] |
| drawing.part.index | 26 | 0.0% [0.0%–16.9%] | 0.0% [0.0%–16.9%] |
| document.section.align | 26 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–14.1%] |
| document.block.id | 26 | 0.0% [0.0%–14.3%] | 0.0% [0.0%–14.3%] |
| calendar.meeting.start | 25 | 0.0% [0.0%–31.6%] | 7.9% [1.4%–34.4%] |
| document.section.mark | 25 | 0.0% [0.0%–31.0%] | 0.0% [0.0%–13.9%] |
| drawing.part.id | 25 | 0.0% [0.0%–18.3%] | 0.0% [0.0%–18.3%] |
| drawing.drawn.expression | 24 | – | 0.0% [0.0%–13.9%] |
| document.section.id | 22 | 0.0% [0.0%–17.3%] | 0.0% [0.0%–17.3%] |
| drawing.drawn.pose | 21 | – | 0.0% [0.0%–15.6%] |
| calendar.meeting.participants | 20 | – | 0.0% [0.0%–16.9%] |
| avatar.part.id | 20 | 0.0% [0.0%–16.7%] | 0.0% [0.0%–16.7%] |
| diagram.chart.type | 19 | 0.0% [0.0%–17.1%] | 28.5% [13.1%–51.1%] |
| document.block.text | 19 | 0.0% [0.0%–19.1%] | 0.0% [0.0%–19.1%] |
| diagram.chart.id | 18 | 0.0% [0.0%–18.1%] | 0.0% [0.0%–18.1%] |
| document.text.title | 18 | 12.5% [3.7%–34.5%] | 0.0% [0.0%–17.6%] |
| calendar.meeting.room | 18 | 0.0% [0.0%–20.7%] | 0.0% [0.0%–17.8%] |
| calendar.meeting.notes | 18 | 0.0% [0.0%–25.2%] | 0.0% [0.0%–25.2%] |
| diagram.series.label | 17 | 0.0% [0.0%–18.7%] | 4.4% [0.6%–25.3%] |
| diagram.node.n | 17 | 26.0% [9.5%–54.0%] | 26.0% [9.5%–54.0%] |
| diagram.link.ids | 17 | 0.0% [0.0%–18.9%] | 0.0% [0.0%–18.9%] |
| diagram.node.size | 17 | 16.5% [5.2%–41.9%] | 15.6% [4.9%–40.1%] |
| document.block.level | 17 | 0.0% [0.0%–20.7%] | 0.0% [0.0%–20.7%] |
| document.block.parent | 16 | 0.0% [0.0%–19.4%] | 0.0% [0.0%–19.4%] |
| document.block.name | 16 | 0.0% [0.0%–20.7%] | 0.0% [0.0%–20.7%] |
| diagram.chart.title | 15 | 0.0% [0.0%–21.0%] | 0.0% [0.0%–21.0%] |
| document.text.content | 15 | 0.0% [0.0%–20.4%] | 0.0% [0.0%–20.4%] |
| document.text.about | 14 | 0.0% [0.0%–21.5%] | 0.0% [0.0%–21.5%] |
| diagram.group.label | 14 | 0.0% [0.0%–22.4%] | 0.0% [0.0%–22.4%] |
| drawing.drawn.height | 14 | 33.1% [14.0%–60.0%] | 20.5% [6.7%–48.0%] |
| document.section.tone | 13 | – | 0.0% [0.0%–23.0%] |
| drawing.drawn.width | 13 | 41.6% [19.3%–68.0%] | 33.7% [14.0%–61.2%] |
| calendar.meeting.reminder | 12 | – | 0.0% [0.0%–26.4%] |
| document.section.colour | 12 | – | 0.0% [0.0%–24.9%] |
| diagram.group.ids | 12 | 0.0% [0.0%–24.3%] | 0.0% [0.0%–24.3%] |
| drawing.drawn.x | 12 | 20.1% [5.0%–54.8%] | 6.9% [0.8%–41.2%] |
| drawing.drawn.y | 12 | 20.1% [5.0%–54.8%] | 6.9% [0.8%–41.2%] |
| avatar.face.expression | 12 | 0.0% [0.0%–50.5%] | 0.0% [0.0%–50.5%] |
| diagram.diagram.theme | 11 | 0.0% [0.0%–27.9%] | 0.0% [0.0%–27.9%] |
| diagram.node.at | 11 | 0.0% [0.0%–26.3%] | 0.0% [0.0%–26.3%] |
| document.section.relation | 11 | – | 0.0% [0.0%–40.7%] |
| document.section.anchor | 11 | – | 0.0% [0.0%–40.7%] |
| drawing.page.duration | 11 | 0.0% [0.0%–25.9%] | 0.0% [0.0%–25.9%] |
| document.text.tone | 11 | 0.0% [0.0%–50.0%] | 0.0% [0.0%–50.0%] |
| diagram.node.width | 10 | 0.0% [0.0%–32.7%] | 0.0% [0.0%–31.3%] |
| drawing.drawn.direction | 10 | 0.0% [0.0%–41.0%] | 0.0% [0.0%–41.0%] |
| document.inline.format | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| document.inline.enabled | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| document.inline.from | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| document.inline.to | 10 | 0.0% [0.0%–27.8%] | 0.0% [0.0%–27.8%] |
| avatar.face.preset | 10 | 0.0% [0.0%–35.2%] | 0.0% [0.0%–35.2%] |
| avatar.face.id | 10 | 0.0% [0.0%–37.7%] | 0.0% [0.0%–37.7%] |
| document.block.mark | 10 | 0.0% [0.0%–30.7%] | 0.0% [0.0%–30.7%] |
| calendar.meeting.people | 10 | 0.0% [0.0%–30.8%] | 0.0% [0.0%–30.8%] |
| document.text.words | 9 | 0.0% [0.0%–29.9%] | 0.0% [0.0%–29.9%] |
| avatar.part.expression | 9 | – | 0.0% [0.0%–34.9%] |
| calendar.meeting.location | 9 | – | 0.0% [0.0%–30.6%] |
| diagram.node.relation | 9 | 0.0% [0.0%–49.0%] | 35.9% [13.5%–66.8%] |
| document.section.size | 9 | – | 0.0% [0.0%–30.6%] |
| document.section.length | 9 | – | 0.0% [0.0%–30.1%] |
| document.section.title | 9 | – | 0.0% [0.0%–30.4%] |
| document.section.level | 9 | 0.0% [0.0%–35.1%] | 0.0% [0.0%–35.1%] |
| document.block.align | 9 | 0.0% [0.0%–35.9%] | 0.0% [0.0%–35.9%] |
| document.text.text | 9 | 0.0% [0.0%–34.6%] | 0.0% [0.0%–34.6%] |
| document.text.genre | 9 | 0.0% [0.0%–30.0%] | 0.0% [0.0%–30.0%] |
| calendar.room.id | 9 | 0.0% [0.0%–30.3%] | 0.0% [0.0%–30.3%] |
| diagram.series.colour | 8 | 0.0% [0.0%–32.4%] | 0.0% [0.0%–32.4%] |
| diagram.link.arrow | 8 | 0.0% [0.0%–35.7%] | 0.0% [0.0%–35.7%] |
| diagram.chart.show_values | 8 | 0.0% [0.0%–33.8%] | 0.0% [0.0%–33.8%] |
| drawing.part.x | 8 | 0.0% [0.0%–32.4%] | 0.0% [0.0%–32.4%] |
| drawing.part.y | 8 | 0.0% [0.0%–32.4%] | 0.0% [0.0%–32.4%] |
| avatar.part.length | 8 | 50.7% [16.4%–84.4%] | 28.7% [7.6%–66.4%] |
| diagram.node.height | 8 | 0.0% [0.0%–40.9%] | 0.0% [0.0%–33.9%] |
| drawing.drawn.label | 8 | 39.5% [12.3%–75.3%] | 31.1% [9.0%–67.4%] |
| drawing.drawn.id | 8 | 0.0% [0.0%–42.8%] | 0.0% [0.0%–42.8%] |
| document.block.ids | 8 | 0.0% [0.0%–36.0%] | 0.0% [0.0%–36.0%] |
| document.block.items | 8 | 0.0% [0.0%–37.4%] | 0.0% [0.0%–37.4%] |
| avatar.part.value | 8 | 0.0% [0.0%–35.2%] | 0.0% [0.0%–35.2%] |
| document.block.to | 8 | 0.0% [0.0%–32.4%] | 0.0% [0.0%–32.4%] |
| document.text.length | 8 | 0.0% [0.0%–61.7%] | 0.0% [0.0%–61.7%] |
| calendar.meeting.timezone | 8 | 0.0% [0.0%–37.0%] | 0.0% [0.0%–37.0%] |
| diagram.link.pattern | 7 | 0.0% [0.0%–35.7%] | 0.0% [0.0%–35.7%] |
| diagram.chart.values | 7 | 0.0% [0.0%–35.5%] | 0.0% [0.0%–35.5%] |
| diagram.node.layout | 7 | 0.0% [0.0%–36.0%] | 0.0% [0.0%–36.0%] |
| diagram.link.style | 7 | 20.8% [4.3%–60.5%] | 45.3% [15.7%–78.6%] |
| diagram.node.colour_by | 7 | – | 0.0% [0.0%–35.4%] |
| document.section.recipient | 7 | – | 0.0% [0.0%–35.4%] |
| diagram.group.colour | 7 | 0.0% [0.0%–36.1%] | 0.0% [0.0%–36.1%] |
| document.block.rows | 7 | 0.0% [0.0%–38.3%] | 0.0% [0.0%–38.3%] |
| document.section.ids | 7 | 0.0% [0.0%–38.5%] | 0.0% [0.0%–38.5%] |
| avatar.face.mode | 7 | 0.0% [0.0%–40.3%] | 0.0% [0.0%–40.3%] |
| calendar.person.name | 7 | 38.8% [9.9%–78.5%] | 36.3% [8.9%–77.0%] |
| document.block.style | 7 | 0.0% [0.0%–42.1%] | 0.0% [0.0%–42.1%] |
| diagram.sketch.nodes | 7 | 0.0% [0.0%–35.4%] | 0.0% [0.0%–35.4%] |
| diagram.chart.legend | 6 | 0.0% [0.0%–40.8%] | 0.0% [0.0%–40.8%] |
| drawing.part.colour | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| diagram.link.colour | 6 | 0.0% [0.0%–41.7%] | 0.0% [0.0%–41.7%] |
| diagram.diagram.layout | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| calendar.room.name | 6 | 0.0% [0.0%–41.9%] | 0.0% [0.0%–41.9%] |
| avatar.part.kind | 6 | – | 0.0% [0.0%–43.1%] |
| avatar.part.relation | 6 | – | 0.0% [0.0%–39.0%] |
| avatar.part.anchor | 6 | – | 0.0% [0.0%–39.0%] |
| document.section.style | 6 | – | 0.0% [0.0%–39.1%] |
| document.section.name | 6 | 0.0% [0.0%–41.1%] | 0.0% [0.0%–41.1%] |
| drawing.part.width | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| diagram.link.width | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| avatar.face.base | 6 | 0.0% [0.0%–41.6%] | 0.0% [0.0%–41.6%] |
| avatar.face.scale | 6 | 0.0% [0.0%–42.9%] | 0.0% [0.0%–42.9%] |
| document.block.from | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| drawing.page.mode | 6 | 0.0% [0.0%–39.0%] | 0.0% [0.0%–39.0%] |
| diagram.chart.grid | 5 | 0.0% [0.0%–44.0%] | 0.0% [0.0%–44.0%] |
| diagram.chart.max | 5 | 0.0% [0.0%–44.0%] | 0.0% [0.0%–44.0%] |
| diagram.series.index | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.node.fontSize | 5 | 0.0% [0.0%–49.4%] | 0.0% [0.0%–49.4%] |
| diagram.diagram.effect | 5 | 0.0% [0.0%–45.3%] | 0.0% [0.0%–45.3%] |
| diagram.diagram.spacing | 5 | 0.0% [0.0%–43.5%] | 20.6% [3.8%–63.0%] |
| diagram.node.rotation | 5 | 0.0% [0.0%–65.8%] | 0.0% [0.0%–44.0%] |
| diagram.node.effect | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.node.textColour | 5 | 0.0% [0.0%–49.4%] | 0.0% [0.0%–49.4%] |
| diagram.node.fontWeight | 5 | 36.2% [7.9%–79.0%] | 0.0% [0.0%–52.5%] |
| diagram.point.chart | 5 | 0.0% [0.0%–43.9%] | 0.0% [0.0%–43.9%] |
| diagram.node.outline | 5 | 31.2% [7.1%–72.8%] | 31.2% [7.1%–72.8%] |
| diagram.chart.sort | 5 | 0.0% [0.0%–43.8%] | 0.0% [0.0%–43.8%] |
| diagram.chart.palette | 5 | 0.0% [0.0%–46.1%] | 0.0% [0.0%–46.1%] |
| diagram.chart.colour | 5 | 0.0% [0.0%–46.8%] | 0.0% [0.0%–46.8%] |
| diagram.chart.yLabel | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.chart.effect | 5 | 0.0% [0.0%–46.1%] | 0.0% [0.0%–46.1%] |
| diagram.chart.min | 5 | 0.0% [0.0%–46.2%] | 0.0% [0.0%–46.2%] |
| diagram.chart.stacked | 5 | 0.0% [0.0%–44.0%] | 0.0% [0.0%–44.0%] |
| diagram.chart.horizontal | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.diagram.direction | 5 | 0.0% [0.0%–43.5%] | 0.0% [0.0%–43.5%] |
| drawing.drawn.count | 5 | 52.5% [18.2%–84.5%] | 76.2% [34.2%–95.2%] |
| diagram.node.rotate | 5 | 0.0% [0.0%–44.4%] | 15.1% [2.1%–59.1%] |
| diagram.chart.xLabel | 5 | 0.0% [0.0%–43.4%] | 40.0% [11.8%–76.9%] |
| drawing.drawn.distanceGrade | 5 | 0.0% [0.0%–58.7%] | 0.0% [0.0%–58.7%] |
| diagram.series.values | 5 | 0.0% [0.0%–43.5%] | 0.0% [0.0%–43.5%] |
| document.inline.rows | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.inline.list_kind | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.inline.items | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.chart.datasets | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| avatar.face.name | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| drawing.part.owner | 5 | 0.0% [0.0%–46.9%] | 0.0% [0.0%–46.9%] |
| drawing.part.height | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| drawing.group.members | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| drawing.group.name | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| calendar.meeting.agenda | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| calendar.room.seats | 5 | 0.0% [0.0%–55.4%] | 0.0% [0.0%–55.4%] |
| calendar.meeting.end | 5 | 0.0% [0.0%–46.5%] | 0.0% [0.0%–46.5%] |
| diagram.node.role | 5 | 0.0% [0.0%–43.5%] | 0.0% [0.0%–43.5%] |
| diagram.diagram.steps | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| drawing.drawn.distance | 5 | 0.0% [0.0%–47.7%] | 0.0% [0.0%–47.7%] |
| drawing.drawn.at | 5 | 0.0% [0.0%–49.3%] | 56.9% [18.5%–88.4%] |
| drawing.drawn.kind | 5 | 0.0% [0.0%–79.3%] | 0.0% [0.0%–48.5%] |
| calendar.meeting.duration_min | 5 | – | 0.0% [0.0%–43.4%] |
| diagram.node.series | 5 | – | 0.0% [0.0%–43.4%] |
| document.section.list | 5 | – | 0.0% [0.0%–44.4%] |
| document.section.attrs | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.group.size | 5 | 0.0% [0.0%–44.4%] | 0.0% [0.0%–44.4%] |
| diagram.group.name | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.link.label | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.section.parent | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.group.labels | 5 | 0.0% [0.0%–44.2%] | 0.0% [0.0%–44.2%] |
| diagram.group.values | 5 | 0.0% [0.0%–44.2%] | 0.0% [0.0%–44.2%] |
| diagram.group.scale | 5 | 0.0% [0.0%–45.6%] | 0.0% [0.0%–45.6%] |
| document.document.id | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.document.title | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.text.id | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.group.x | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.group.y | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.node.value | 5 | 20.0% [3.6%–62.4%] | 0.0% [0.0%–43.4%] |
| diagram.page.mode | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| avatar.face.characterKind | 5 | 0.0% [0.0%–46.6%] | 0.0% [0.0%–46.6%] |
| avatar.part.scale | 5 | 0.0% [0.0%–50.3%] | 0.0% [0.0%–50.3%] |
| avatar.part.property | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| calendar.calendar.id | 5 | 0.0% [0.0%–49.5%] | 0.0% [0.0%–49.5%] |
| calendar.calendar.colour | 5 | 0.0% [0.0%–48.1%] | 0.0% [0.0%–48.1%] |
| calendar.person.id | 5 | 0.0% [0.0%–44.0%] | 0.0% [0.0%–44.0%] |
| calendar.room.location | 5 | 0.0% [0.0%–55.9%] | 0.0% [0.0%–55.9%] |
| calendar.meeting.free | 5 | 0.0% [0.0%–43.5%] | 0.0% [0.0%–43.5%] |
| calendar.meeting.shift | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.page.duration | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.block.attrs | 5 | 0.0% [0.0%–48.2%] | 0.0% [0.0%–48.2%] |
| document.section.order_anchor | 5 | 0.0% [0.0%–46.2%] | 0.0% [0.0%–46.2%] |
| diagram.sketch.links | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.block.kind | 5 | 0.0% [0.0%–48.2%] | 0.0% [0.0%–48.2%] |
| document.block.header | 5 | 0.0% [0.0%–48.1%] | 0.0% [0.0%–48.1%] |
| document.text.chapters | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.chart.source | 5 | 0.0% [0.0%–43.4%] | 20.0% [3.6%–62.4%] |
| diagram.node.edge | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.node.shape | 5 | 44.8% [13.8%–80.5%] | 22.4% [4.2%–65.3%] |
| diagram.node.edges | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.diagram.by | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.diagram.route | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.group.layout | 5 | 0.0% [0.0%–44.2%] | 0.0% [0.0%–44.2%] |
| diagram.node.axis | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| diagram.link.route | 5 | 0.0% [0.0%–49.4%] | 0.0% [0.0%–49.4%] |
| document.section.to | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.block.checked | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| avatar.face.duration | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.section.role | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.block.at | 5 | 0.0% [0.0%–43.4%] | 0.0% [0.0%–43.4%] |
| document.inline.align | 4 | 0.0% [0.0%–49.0%] | 0.0% [0.0%–49.0%] |
| avatar.part.shape | 4 | – | 0.0% [0.0%–64.0%] |
| calendar.meeting.recurrence | 4 | – | 0.0% [0.0%–50.6%] |
| document.section.text_starts | 4 | – | 0.0% [0.0%–55.9%] |
| document.inline.highlight_colour | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| document.inline.link_target | 3 | 0.0% [0.0%–56.2%] | 0.0% [0.0%–56.2%] |
| diagram.node.background colour | 3 | – | 43.5% [9.5%–84.9%] |
| diagram.node.stacked | 3 | – | 0.0% [0.0%–56.2%] |
| diagram.node.facet_by | 3 | – | 0.0% [0.0%–56.2%] |
| diagram.node.labels | 3 | – | 0.0% [0.0%–56.2%] |
| diagram.node.values | 3 | – | 0.0% [0.0%–56.2%] |
| document.section.font | 3 | – | 0.0% [0.0%–56.2%] |
| document.section.background | 3 | – | 0.0% [0.0%–56.6%] |
| document.section.rows | 3 | – | 0.0% [0.0%–56.2%] |
| document.section.columns | 3 | – | 0.0% [0.0%–56.2%] |
| diagram.chart.width | 2 | 0.0% [0.0%–65.8%] | 0.0% [0.0%–65.8%] |
| diagram.chart.height | 2 | 0.0% [0.0%–65.8%] | 0.0% [0.0%–65.8%] |
| calendar.meeting.response | 2 | – | 0.0% [0.0%–65.8%] |
| diagram.node.title | 2 | – | 0.0% [0.0%–66.5%] |
| diagram.node.label colour | 2 | – | 0.0% [0.0%–69.6%] |
| document.section.items | 2 | – | 0.0% [0.0%–65.8%] |
| diagram.diagram.colour | 1 | 0.0% [0.0%–79.3%] | 0.0% [0.0%–79.3%] |
| avatar.part.pattern | 1 | – | 0.0% [0.0%–79.3%] |
| avatar.part.orientation | 1 | – | 0.0% [0.0%–79.3%] |
| avatar.part.text | 1 | – | 0.0% [0.0%–79.3%] |
| avatar.part.age | 1 | – | 0.0% [0.0%–79.3%] |
| avatar.part.count | 1 | – | 0.0% [0.0%–79.3%] |
| avatar.part.position | 1 | – | 0.0% [0.0%–79.3%] |
| calendar.meeting.count | 1 | – | 0.0% [0.0%–79.3%] |
| calendar.meeting.duration | 1 | – | 0.0% [0.0%–79.3%] |
| diagram.node.direction | 1 | – | 100.0% [20.7%–100.0%] |
| diagram.node.sort | 1 | – | 0.0% [0.0%–79.3%] |
| diagram.node.shadow | 1 | – | 0.0% [0.0%–79.3%] |
| diagram.node.fill | 1 | – | 0.0% [0.0%–79.3%] |
| diagram.node.style | 1 | – | 0.0% [0.0%–79.3%] |
| diagram.node.rings | 1 | – | 100.0% [20.7%–100.0%] |
| document.section.numbering | 1 | – | 0.0% [0.0%–79.3%] |
| diagram.node.members | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.layout | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.grouped | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.voice | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.constraint | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.moral | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.caption | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.first_row | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.cells | 1 | – | 0.0% [0.0%–79.3%] |
| drawing.drawn.hat | 1 | – | 0.0% [0.0%–79.3%] |
| drawing.drawn.style | 1 | – | 0.0% [0.0%–79.3%] |
| drawing.drawn.length | 1 | – | 0.0% [0.0%–79.3%] |
| document.section.chapters | 1 | – | 0.0% [0.0%–79.3%] |

## Source datasets

| source | n | oracle | end-to-end |
|---|---:|---|---|
| human-benchmark-v1 | 729 | – | 6.1% [4.4%–8.4%] |
| demo-tool-profile | 579 | 22.4% [18.7%–26.5%] | 21.3% [17.8%–25.4%] |
| main-synthetic | 395 | 49.9% [44.2%–55.7%] | 47.1% [41.4%–52.9%] |
| ui-human-v1 | 298 | 6.8% [3.7%–12.3%] | 7.9% [4.5%–13.6%] |
| ui-coverage-v2 | 259 | 6.2% [3.2%–11.7%] | 6.5% [3.4%–12.1%] |
| ui-diagram-v2 | 243 | 6.3% [3.6%–10.6%] | 6.2% [3.6%–10.6%] |
| data-drop-v1 | 155 | 5.8% [2.8%–11.8%] | 11.6% [6.9%–18.9%] |
| data-drop:dg-batch-02 | 124 | 4.4% [1.8%–10.5%] | 8.9% [4.7%–16.3%] |
| ui-relations-v1 | 69 | 19.7% [11.9%–30.7%] | 20.4% [12.6%–31.5%] |
| ui-natural-v1 | 63 | 18.1% [8.5%–34.6%] | 14.5% [6.2%–30.4%] |
| ui-comparatives-v1 | 39 | 20.9% [10.4%–37.5%] | 17.4% [8.1%–33.6%] |
| human-adapted-v1-diagram | 22 | 7.3% [1.4%–31.0%] | 8.7% [1.8%–32.7%] |
| human-adapted-v1-drawing | 8 | 48.8% [16.9%–81.7%] | 15.8% [2.5%–57.8%] |
| ui-features-v1 | 7 | 36.6% [10.4%–74.3%] | 36.6% [10.4%–74.3%] |
| data-drop:dw-batch-01 | 6 | 0.0% [0.0%–40.0%] | 0.0% [0.0%–40.0%] |
| ui-diagram-v2-voice | 3 | 0.0% [0.0%–57.5%] | 0.0% [0.0%–57.5%] |
| ui-quantities-v1 | 2 | 100.0% [26.5%–100.0%] | 100.0% [26.5%–100.0%] |
| ui-tiers-v1 | 1 | 0.0% [0.0%–79.3%] | 0.0% [0.0%–79.3%] |

## Deployed reader vs labels (field level)

Exact reading (all fields, all constraints, same request count): **46.6%** of 2273 rows. Constraints (key+operator+phase): precision 69.6%, recall 72.1%.

| field | accuracy | n |
|---|---|---:|
| act | 86.2% | 2340 |
| mood | 97.1% | 2340 |
| target.type | 84.9% | 2340 |
| target.mode | 90.8% | 2340 |
| target.determiner | 90.7% | 2340 |
| target.fill | 70.4% | 1641 |
| target.name_span | 73.0% | 775 |
| target.kind_span | 65.5% | 1036 |
| target.count | 65.6% | 32 |
| question.ask | 86.6% | 134 |

Reader-layer failures (the reader own diagnostics, or the oracle executes and end-to-end does not; reader-induced in the tab table counts only the latter):

| rows | estimate | first reading difference | example |
|---:|---:|---|---|
| 10 | 384 | reader: missing-or-ambiguous-act-anchor request.request.act | "Split Ship Mode by category and segement and Avg(Profit) render barchart" |
| 11 | 278 | reader: illegal-I-after-O | "let all the sheep turn white, thanks" |
| 7 | 266 | reader: presence-span-inconsistent request.target.kind | "make all teh dogs brown" |
| 5 | 248 | reader: missed constraint drawn.size | "can you add a sun Roundup 260?" |
| 3 | 184 | reader: ambiguous-global-mention request.target.kind | "change the bird into a rocket" |
| 13 | 139 | reader: extra constraint meeting.ids | "I need you to remove Review. I appreciate it." |
| 2 | 136 | reader: presence-span-inconsistent drawing.drawn.width | "I need you to make axis 61 pixels wide. I appreciate it." |
| 2 | 124 | reader: extra constraint drawn.direction | "a medium helicopter facing left two fingers away from right edge, and an inch from the to |
| 3 | 114 | reader: presence-span-inconsistent drawing.drawn.ids | "clear the houses away — leave the blue one standing" |
| 1 | 94 | reader: target.kind_span zip→∅ | "zip, please" |
| 2 | 89 | reader: presence-span-inconsistent diagram.node.ids | "The revenue chart should sit under the title. Put Quarterly revenue at 120 across, 260 do |
| 1 | 68 | reader: presence-span-inconsistent drawing.part.height | "so: part Intro 2, Second, 400 wide" |
| 1 | 68 | reader: presence-span-inconsistent drawing.part.colour | "the partt Intro, row 2, climbs to 400 tall in Second" |
| 1 | 68 | reader: presence-span-inconsistent drawing.part.y | "update a part Intro 2 Second 400" |
| 1 | 68 | reader: act change→make | "lake name: Mirror Pond" |

## Top 20 missing capabilities (oracle level)

Ranked by estimated rows affected in the whole data (sample rows × stratum weight); full list with examples: missing-capabilities.md.

| # | layer | cause | sample rows | est. rows | tabs |
|---:|---|---|---:|---:|---|
| 1 | bindings | binding missing: diagram.node target without a kind word (fill=written) | 59 | 2519 | diagram 59 |
| 2 | no-operation | no operation for change drawing.drawn [drawn.colour] | 31 | 2100 | drawing 31 |
| 3 | bindings | binding missing: relation anchor reference in drawing | 34 | 1629 | drawing 34 |
| 4 | execution | target not resolved for change diagram.chart (fill=context) | 46 | 1088 | diagram 46 |
| 5 | rule | rule missing: query projection ask=what for drawing.drawn | 15 | 1078 | drawing 15 |
| 6 | execution | host refused drawing.drawn.relation (make drawing.drawn) | 18 | 1075 | drawing 18 |
| 7 | bindings | binding missing for avatar.part.id | 19 | 945 | avatar 19 |
| 8 | knowledge | knowledge: kind words of drawing.drawn not bound | 14 | 813 | drawing 14 |
| 9 | bindings | binding missing for calendar.meeting.calendar | 29 | 808 | calendar 29 |
| 10 | bindings | binding missing for document.section.content | 26 | 791 | document 26 |
| 11 | rule | rule missing: context reference (fill=context) for document.text | 20 | 789 | document 20 |
| 12 | bindings | binding missing: diagram.node target without a kind word (fill=context) | 23 | 774 | diagram 23 |
| 13 | execution | target not resolved for change diagram.chart (fill=written) | 16 | 747 | diagram 16 |
| 14 | bindings | binding missing for calendar.meeting.day | 19 | 728 | calendar 19 |
| 15 | bindings | binding missing for calendar.calendar.name | 23 | 701 | calendar 23 |
| 16 | rule | rule missing: query projection ask=list for diagram.chart | 10 | 678 | diagram 10 |
| 17 | bindings | binding missing for diagram.series.label | 15 | 675 | diagram 15 |
| 18 | bindings | binding missing for document.block.id | 26 | 620 | document 26 |
| 19 | bindings | binding missing: diagram.point target without a kind word (fill=-) | 16 | 590 | diagram 16 |
| 20 | execution | placement refused (tool-binding) for make drawing.drawn [drawn.anchor (selector), drawn.relation] | 9 | 537 | drawing 9 |

## Under-sampled strata

diagram|history (n=27), diagram|connect (n=28), drawing|comparative (n=20), drawing|history (n=23), drawing|edit-context (n=20), diagram|create (n=28), avatar|place (n=22), calendar|remove (n=57), calendar|place (n=31), avatar|create (n=7), avatar|multi-request (n=41), avatar|remove (n=27), avatar|create-relation (n=6), calendar|create (n=9), document|create-relation (n=6), document|history (n=20), avatar|history (n=22), calendar|edit-context (n=20)

Timing: mean route time per row oracle 1488 ms, e2e 690 ms.
