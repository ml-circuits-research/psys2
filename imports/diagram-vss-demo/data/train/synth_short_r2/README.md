# synth_short_r2: synthetic short commands of the 2026-11-02 forms the training data lacked (round 2, 2026-11-03)

**Synthetic, template-generated data** (AGENTS.md, owner 2026-11-02 22:04), like `synth_rules*`: keep it in its own folder and name it in
every result that trains on it. Made by `training/sketch/synth/gen_short_r2.py --seed 0 --n 2400` (ids `sr2-*`), filtered by
`synth/check_file.py --mode rules`: **only messages the Rules read exactly as their gold are kept** (logic.js of commit bb575b8), and every
text that equals or has the same token set as a test text (the six template sets, llm_short, fresh2, short3) is removed.
1997 of 2400 candidates kept (317 duplicate texts, 46 overlaps with a test set, 40 the Rules read otherwise; `synth/synth_short_r2_check.json`).

Why (TRAIN_PLAN_R2.md section 6): counted over job 070's training folders on 2026-11-03, these forms had **no** request at all (undo / redo
with a count, the outline question, a size inside a description) or very few as a short single command (how many arrows 12, outline on
an existing shape 27). gen_rules_cover.py had rejected undo counts when the conventions had no count key; since CONVERT_FIX (LEGEND_EXT) the
count is a role.

| form (meta.form) | kept | examples | gold |
|---|---|---|---|
| undo_count | 47 | "undo twice", "redo it 4 times", "undo three times" | undo / redo count="N" |
| outline_set | 80 | "give Router a red border", "make Lan's outline teal" | set target outline |
| outline_create | 79 | "add a green circle with a red border" | create shape color outline |
| outline_q | 73 | "what is the outline of Db", "what's the border color of Api" | question property property=outline |
| size_desc | 72 | "delete the small circles", "make the big squares blue", "how many tiny stars are there" | mention(quantifier=all,shape,size) / count shape size |
| count_arrows | 21 | "how many arrows are there", "count the connections" | question count kind=edge |
| arrow_label / arrow_unlabel | 80 / 80 | 'label the link between Api and Db "reads"', "remove the label from the arrow from A to B" | label from to label (label="") |
| arrow_style | 80 | "make the arrow from Api to Db dashed / two-way / red" | set from to style / arrow / color |
| every_arrow | 61 | "make all the lines blue", "make the arrows dotted" | set kind=edge quantifier=all |
| tpl_items / tpl_count | 71 / 56 | "make a funnel with Leads, Trials and Sales", "make a cycle with 5 steps" | create template items / count |
| free_text | 64 | 'add a heading "Plan"', 'write "Draft" at the top' | create shape=text label (position) |
| layout_op | 47 | "tidy up the diagram", "sort the shapes by size", "zoom to fit", "flip the diagram vertically" | the layout actions, target=mention(quantifier=all) |
| at_xy | 79 | "add a square at 120,80", "move Router to 300,40" | create / move at="x,y" |
| core commands (set, connect, delete, create, move, undo, redo) | 1007 | "make Lan teal", "connect Router to Lan" | as synth_rules |

**Narration** (1374 of the 1997 messages; meta.narration): a request wrapped in the words people put around it, before ("ok so now", "alright,",
"sorry,", "cool. now", "oh and" ...) and / or after ("pls", "thanks", "for me", "if you can" ...); the span is the request alone. Every core
command here is narrated (the plain ones are in synth_rules). Two wrappers were dropped after the first Rules check because the Rules'
spelling step rewrote them ("real quick" -> "teal quick", "right, next:" read as a direction).

Round trips with job 073's switches and data (2026-11-03): VSS `convert_check.py` 91.1% (1.0% no event token, 0.0% every shape); SOP-BERT
`roles_roundtrip.py` 96.0% right, 4.0% asked (label="" has no word to tag: the engine asks "What should the label say?"), 0.0% silent
wrong labels.
