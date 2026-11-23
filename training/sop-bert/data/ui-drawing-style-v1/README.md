# ui-drawing-style-v1: Drawing transforms, writing, effects, fills and filters

Reader rows for the Drawing controls of catalog b89b4541 (art.draw native interface): named turns and degrees
(`drawn.turn`, `drawn.rotation`), mirrors, facing, leans (`drawn.skew`), opacity, effects, fills, gradients, outlines and
stroke width, writing (`drawn.text`, `drawn.font`, `drawn.weight`, `drawn.slant`, `drawn.align`, `drawn.frame`), the same
transforms on parts (`part.*`, owner as `part.owner` selector) and groups, picture filters (`page.filter`), styled creation,
and follow-ups with the previous message ("a bit more", "back to normal", "remove the filter"). Values are the k.styles
names: 8 fonts, 9 fills, 7 effects, 9 filters, 5 frames, 8 named turns; the words people use map to them in `generate.py`.
31 cases in three tiers plus one robustness variant per row (typo, missing space, ASR, filler, politeness); the keys this
corpus adds are in `inventory.json` (merged into official-dataset/inventory.json by its build).

Run: `python3 generate.py && python3 validate.py` (0 errors required; `validation.json`, `coverage.json`).
