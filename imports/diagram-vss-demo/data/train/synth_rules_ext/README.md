# synth_rules_ext: synthetic short commands for the forms of 39be436 (free text, templates, help questions)

**Synthetic, template-generated data** (AGENTS.md, owner 2026-11-02 22:04), like `synth_rules`: keep it in its own folder and name it in every
result that trains on it. Made by `training/sketch/synth/gen_rules_cover.py --n_ext 3500` (ids `se-*`, its own random stream, seed 0 + 7),
gold by the conventions of LEGEND_EXT.md section 7 (also in LABEL_CONVENTIONS.md, last section); **only messages the Rules read exactly
are kept** (check_rules.mjs, logic.js working tree sha256 27a2145c4956ef03). 2783 messages, 3664 requests; 68% one request, the others with an
ordinary request (from the core builders) before or after.

| form | requests | coverage |
|---|---|---|
| templates (`create template=… items=…`, title, scheme, position, count; `arrange template=… target=…`) | 1258 creates + 183 arranges | all 24 templates (54-60 each), 134 of 136 template cues at least 5 times (organisation chart, organigram: 4) |
| help (`question ask=help topic aspect about`) | 702 | 95 topics (actions with a specific verb, templates, family nouns, shape / colour / style values; at least 3 each except improve 2); aspects how 203, can 272, overview 79, example 47, none 101; every lead at least 27 times; `about` with words outside the legend (images, fonts, emojis ...) |
| free text (`create shape=text label=…`, colour, position) | 640 | add / put / place / insert / write a text, title, heading, headline, caption, subtitle, banner, note; write "x" at a place; title the diagram "x" |

Not covered: width / height / fill / layer (the Rules do not read them from a sentence), the 121 help topics with no natural phrase (plugin
names such as core, history, reasoning) and help questions that mix in a drawing question. Rejects (49 of the ext candidates) are in
`synth/rejects.jsonl` (ids `se-*`): mostly a template clause that swallows the request after it ("... of A, B and C and undo twice").
