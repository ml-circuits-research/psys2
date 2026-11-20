# human-adapted-v1 / diagram

538 labelled rows (`examples.jsonl`, 612 requests, 65 multi-request rows, 58 with `context.previous`) and 256 gap records (`gaps.jsonl`: 123 gap-only lines, 133 notes on labelled rows whose remaining meaning the inventory cannot express). `authored.jsonl` holds one record per adapted line: provenance, context, construction tags (primary usage class first), adaptation note and inline label markup (format in `build.py`). `python3 build.py` regenerates both outputs; `python3 validate.py` (exit 0 = pass) runs the official `Validator` (0 errors, 0 fixes) plus span/order/count checks, duplicates, overlap with the official dataset, and overlap with the held-out benchmark (`HB_ITEMS`, both texts/originals and corpus ids).

Sources (raw lines stay local; licence per row in `source`): PPTC (MIT) 153 rows, ChartDialog describer turns (no licence stated) 55, TeX.SE diagram titles (CC BY-SA) 44, SCONE Tangrams/Scene (CC BY-SA 4.0) 37/23, WildChat-1M (ODC-BY; two more shards filtered for diagram/chart lines) 26, NLVCorpus (MIT) 24. OSWorld had no usable diagram line. 176 rows are `style: structural-fill` (owner phrasing style, `items/owner.jsonl`): chart data edits, link/node editing, ids, quantifiers and chart questions, which no public corpus covers.

| usage class | rows | gaps (gap-only) | | usage class | rows | gaps (gap-only) |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| create | 42 | 11 (2) | | chart-create | 59 | 35 (4) |
| compose | 18 | 11 (3) | | chart-data-edit | 26 | 9 (5) |
| place-relative | 41 | 9 (5) | | chart-formatting | 46 | 25 (9) |
| quantify | 23 | 11 (4) | | formatting/effects | 28 | 18 (13) |
| refer (ordinal/anaphora/population/id) | 37 | 2 (0) | | vague-aesthetic | 10 | 24 (19) |
| modify-attribute | 32 | 8 (7) | | correction/undo | 30 | 13 (5) |
| arrange/layout/align/distribute | 23 | 18 (15) | | question | 18 | 14 (11) |
| connect/structure | 36 | 20 (13) | | compound/multi-step | 39 | 15 (1) |
| | | | | fragment/follow-up | 30 | 13 (7) |

Label decisions (conventions copied from official diagram rows, UI corpora first):
- Whole-diagram creation ("draw a flow chart") is `make` of a `node` target whose kind is the diagram.kind value (flowchart, mind_map, venn, org_chart, network, diagram), as in ui-diagram-v2. A `diagram` target with mode new would be cleaner; not invented here.
- Charts: `make` of a `chart` with `chart.type` (value_span includes "chart"/"graph"), `chart.labels`/`chart.values` in text order (lists stay one span, "%" outside the span); point edits are `point` targets with the label as `name_span` + `chart.labels` selector and `point.value` (eq, or delta+step for "up by 5"/"lower"); series via `series.label` selector/result and `series.values`; sort is `arrange`.
- Written names take `name_span` + the type's id selector (`node.ids`, `link.ids`, `group.id`, `chart.id`); definite descriptions take `kind`/`kind_span` with fill description; undirected "link A and B" is `connect` of existing nodes with two `node.ids`; "connect A to B" is a new `link` with `link.from`/`link.to`.
- Undo/redo/repeat target the `sketch` journal step (`ordinal` for "step three", "the last step"); "do the same with the third box" is `repeat` of that node.
- PPTC "slide" became "page", the "## …" position annotations were dropped, "the title/content/picture" became seeded text/image nodes; SCONE figures/people became boxes/circles (colour kept); ChartDialog fragments got a diagram previous turn. Units ("6 inches") keep `unit`; corners without a side are `node.at=corner` (gap noted).
- Vague quantities ("a few", "some", "a bunch of") carry no count; capability questions, praise and complaints are gap-only.

Gap themes (`needs`, counted once): chart display keys absent (axis position/inversion/log, line style, markers, error bars, bar width, chart size, legend/label fonts, pie explode/radius) 49; node/page geometry (rotation, relative move direction, sequence slot, swap act, page background/index, corner side) 36; chart data fields/encoding/filters (NLV "average MPG by cylinders", world data) 31; conversation-level (objection, confirm, previous-request key reference, repeat count; `conversation.turn` is not registered for the area) 20; link details (tip style, label position, ports, crossings, partial style, width degree) 16; generated-diagram content/topic 16; goal-level aesthetics ("improve", "professional", "cluttered") 15; values outside banks (callout, amoeba, trapezium, named themes) 8; layout objectives (auto, no-overlap, wrap) 8; text style (italic, underline, font family, size steps) 8; other single cases 49.
