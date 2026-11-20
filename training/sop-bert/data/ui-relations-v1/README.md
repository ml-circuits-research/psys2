# Relative positions, version 1

Requests that place a drawable thing relative to another one ("add a boat in the lake", "put a tree next to the house", "move the house to the left of the mountain"), the class the earlier corpora barely covered (18 rows in `ui-natural-v1`, none in `main-synthetic-dataset`).

- **Combinations:** every kind of the Drawing tool's declared `kind` enum × relation (`near`, `left`, `right`, `above`, `below`, `in`, `on`) × anchor of a fixed scene (lake, tree, house, mountain, road, hill), plus moves of the scene's own objects.
- **Plausibility from the catalog, not from lists here:** `in` and `on` only where a `k.layouts` anchor holds the thing (the lake's water holds the boat and the fish; the hill's top holds the tree and the house) or `k.scenes` says `on=` (the car on the road); a thing whose usual place is water is only near water, a thing of the sky only above, left or right, and nothing of the ground is placed above.
- **Labels in the `ui-natural` format:** `drawn.relation` with the value, its `value_span`, `anchor_span`, `anchor_fill: description` and `anchor_kind`; string spans; the trigger is its surface. Every labelled surface is checked to occur in the text.
- **Context:** the scene's objects are in `context.existing`, so the anchor can be grounded.
- **Not labelled:** coordinates. Placement is a completion requirement: the library solves the relation against the observed anchor, the page and the peers as one `std.problem` (SOPWorlds 0.227).
- **Not execution-verified** (`nativeTool: null`).

Regenerate: `python3 generate.py` (needs the catalog checkout beside the repository). Counts: `report.json`.
