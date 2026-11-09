# opus_r3_gaps: the forms the owner's first real session needed (round 3, 2026-11-03)

**Realistic data written by an Opus writer agent** from the gaps found in `training/sketch/collected/SESSION_1_ANALYSIS.md` (the owner's
session of 2026-11-03, test set `llm_bench/collected_1`). Short messages, in the style of that session: dictated and translated phrasing
("make me a square", "place all the elements in the form of a circle", "a text element that says …"), complaints followed by the wanted
command, and the plain commands people fall back to.

138 texts, 136 messages kept (2 excluded), 147 requests. Canvases: the demo's opening drawing (with its panels Backdrop, IntakeZone,
ReviewZone and its text items), the same drawing after the session's edits, and six others (kitchen plan, office network, school timetable,
wedding board, game map, an empty drawing), each with its own panels or text items where the form needs them.

| form | messages | gold |
|---|---|---|
| "make me / do me a <shape>" (and contrasts "make Start a square" = set) | 26 (or3g-0001..0026) | `create` with the shape's keys; "make X a <shape>" stays `set`; "… and put it left of Start" a `move` of `$new` |
| a verbless create followed by a link ("a yellow triangle linked with a line to Check") | 2 (0025, 0026) | `create` + `connect from=$new` (the cut of session turn 4) |
| "a text element / item / box that says / saying / reads X" | 18 (0027..0044) | `create shape=text label=X` (+ size, colour, position as said) |
| "place / put / arrange / lay out all the elements in the form / shape of a <layout>", "so they form a circle", "in a circle shape" | 17 kept (0045..0063) | `arrange target=mention(quantifier=all) layout=…` (circle, row, column, grid, tree), `template=heart`; named shapes as the target |
| "connect all (the elements / shapes / items)", "link all the items together" | 15 (0064..0078) | `connect from=mention(quantifier=all)`, no pairing (the Rules' reading; the engine chains them); `pairing=all / chain / next` only when said ("to each other", "in a chain", "one after the other", "to the next one") |
| the panels: "the background boxes / rectangles / shapes / panels", "the zones", "the lanes", "the panels" | 18 (0079..0096) | `mention(layer=background,quantifier=all[,shape=rectangle])` for "background …" (every panel: background or zone), `mention(layer=zone,quantifier=all)` for zones / panels / lanes; "the backdrop" = the name Backdrop |
| "join / unite A and B" | 10 (0097..0106) | `connect from=A to=B` (with style / arrow as said); "join / unite all … elegantly / nicely" without names gets **no wire** (ambiguous: connect or tidy; a reader should ask), always next to a clear request in the same message |
| a text or shape reached by its words ("delete Order flow", "make Weekly plan bigger", `delete "Do not touch"`, "the text that says Level 1") | 13 (0107..0119) | `target=mention(label=<the words, lower case>)`; "rename <words> to X" = `label target=mention(label=…) label=X` |
| complaints and corrections ("I didn't say X, I said Y", "you drew a circle, I needed a text element", "you deleted Process too. undo that and …") | 19 (0120..0138) | the wanted command(s) only; the complaint gets no wire (an explicit "undo that" is an `undo`) |

## Conventions decided here (proposals for LABEL_CONVENTIONS.md)

1. **"connect all"**: no convention existed for "connect all the elements" without pairing words. Written as the Rules read it,
   `connect from=mention(quantifier=all)`, no pairing (a key is written only when the text expresses it); the engine connects a list
   without `to` as a chain. Pairing words keep their values.
2. **"join / unite"**: with two named shapes (or one to another) = `connect`. "Unite / join everything elegantly / nicely" has no wire: in
   the session (turns 16-17) it meant either connecting or a tidy layout, and the owner's next turns ("improve them", "layout") do not
   settle it. A reader that executes either is guessing.
3. **The panels** (needs the engine change of SESSION_1_ANALYSIS.md fix 2): `layer` in a mention. `layer=background` = everything drawn
   behind the items (layer background or zone), because a user does not tell a backdrop from a zone; `layer=zone` = the zones ("zones",
   "panels", "lanes", "containers": the legend's zone cues). "boxes" / "rectangles" add `shape=rectangle` (the text says it). No new legend
   key: `layer` is the shapes plugin's key.
4. **A text by its words** (same engine change): `label` in a mention, the words in lower case as the user wrote them (the engine is to
   match case- and punctuation-free: "Thank you" finds "Thank you!"). Replaces LEGEND_EXT.md section 9 "Descriptions of texts are not
   mentions; texts are reached by name", which the owner's session shows is not how people refer to texts: they say the words they see.
   A text noun next to the words ("the Order flow title", "the text Order flow") adds no key.
5. **Complaints**: the wire is the wanted command; a pronoun in it that points outside the message ("I wanted them in a row") gets no
   target (whole-drawing operations then act on everything, as the conventions say).
6. **"in a circle shape" / "in the shape of a ring"** = `layout=circle`.

## How it was written and checked (training/sketch/synth/build_opus_r2.py)

1. Texts first: `texts/texts_01.jsonl` (78) and `texts/texts_02.jsonl` (60), saved before the annotation; never edited afterwards. The
   annotated texts are identical to them (checked by the build and again by script).
2. Annotation: `annot/annot_01.txt`, `annot/annot_02.txt` (span | trigger | wire | paraphrase).
3. Label check (the Rules read the paraphrase, an explicit command of the same request, and must give exactly the gold; check_rules.mjs on
   the committed logic.js): **104 of 105 paraphrases read as the gold**. The one difference is the Rules' own limit: "arrange Math, Physics
   and Gym in a row" → `layout=organic` (the shape name "Physics" is read as the cue of the force-directed layout). 42 requests have no
   paraphrase because the Rules do not read the form: the panels and the texts by their words (the proposed mention keys, 33), the
   `$new` moves and links after a create (4), "connect all of them to each other" and "to the next one" (the Rules drop the target), a
   complaint's pronoun without a target, "circle layout" and "I needed a text element" (no explicit form with the same gold). Their gold
   was checked by hand against the conventions above.
4. The Rules on the messages as written (not the paraphrases), for the record: 36 of 136 exact. By form: make me 1/26, free text 2/18,
   arrange in the form of 5/17, connect all 14/15, panels 1/18, join / unite 7/10, text by its words 0/13, complaints 6/19.
5. Overlap with every test set, `llm_bench/collected_*` included (added to `gen_rules_cover.test_texts` for this folder; the six template
   sets, llm_short, fresh2, short3 and its saved texts, collected_1 both variants): exact text after lower-casing and stripping punctuation,
   or the same token set. **0 removed**; no duplicate texts.
6. Excluded (no wire is certain; listed in CHECK.json): or3g-0056 "place all elements in the form of a triangle" (no triangle layout; the
   proposed `layout=triangle`), or3g-0062 "… in the form of a star" (no star layout or template).

Counts: batch 01: 78 texts, 2 excluded, 76 messages, 85 requests; batch 02: 60 texts, 60 messages, 62 requests. In all **136 messages,
147 requests**.

The learned readers cannot use the `layer` / `label` mentions until the engine reads them (otherwise a right reading cannot execute); the
other forms are usable now.

Files: `texts/texts_01..02.jsonl` (saved first), `annot/annot_01..02.txt`, `msg_01..02.jsonl` (the training messages), `CHECK.json`.
