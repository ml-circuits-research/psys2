# ui-composition-v1 — PLACEHOLDER

No worker data exists yet for composition requests; this small generated corpus (868 rows, `generate.py`, deterministic)
stands in until it does (coordinator, 2026-11-21). Replace or down-weight it when worker data arrives.

Requests that leave the content to the editor (specs/25-random-as-a-world.md): "surprise me", "draw something random",
"a random scene with a dog", "draw something about what we discussed", "make a diagram of the process I just described",
"chart the numbers I mentioned", "a chart with random values", "another one", "simpler", "busier", "more like that", and the
standing Diagram preference compose.detail.

Labels: target type `composition` (Drawing, Diagram; kind = scene name, diagram kind or chart when said), `composition.source`
(random, conversation), `composition.variant` (another, similar, simpler, richer), `composition.with` (span), `chart.values`
(random, plausible) and `chart.type` on composed charts; preference rows: act `set`, target `preference`,
`preference.key` = compose.detail, `preference.value` (span). Keys are in `inventory.json`, merged by official-dataset/build.py.
