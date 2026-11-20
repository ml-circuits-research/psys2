# Comparative changes, version 1

Requests that change an existing object relative to its current value: "make the house bigger", "make it a bit smaller", "make Box wider", "make the eyes much larger", "make the meeting shorter". The earlier corpora had about a hundred such rows, labelled inconsistently (`eq` with a qualitative value, `degree value=smaller`, `delta` with a value).

- **Label contract:** operator `delta`, `step` `more` / `much_more` / `less` / `much_less` (intensified by "much", "a lot", "way"; "a bit", "slightly" stay `more`/`less`), the comparative word as `value_span`, no `value` and no measure. The library turns it into a factor condition on the declared concept. Absolute degree words ("big", "small") are `degree` conditions instead; `official-dataset/build.py` applies both rules to every source.
- **Combinations:** Drawing (`drawn.size`, `drawn.width`, `drawn.height`), Diagram (`node.size`, `node.width`, `node.height`), Avatar (`part.size`) and Calendar (`meeting.length`) × comparative words × the target referred to by a definite description (target kind, `fill: description`), a pronoun (`fill: context`) or a name (`fill: written` with an id selector) × typing frames.
- **Context:** each tab's fixture objects are in `context.existing`.
- **Not execution-verified** (`nativeTool: null`).

Regenerate: `python3 generate.py`. Counts: `report.json`.
