# E3: operation descriptions and patterns generated from them (2026-11-12)

Experiment for the morning decision (FORMALIZE-FROM-WORLDS, task E3). Rules mode, no model, current main (f1b6710 + this work). Data: `e3-generated-patterns-2026-11-12.json` (same name, `.json`). Nothing shipped changes: the loader reads `describe.sop` only when `PSYS_GEN_PATTERNS=add|only`.

## What was built
- **Schema** `core.describe` (spec 03 section 2c, keys in `worlds/core/legend.sop`): one wire per operation variant with `op`, `intent` (command / query / statement), `emit`, `arg` roles (`name:class[?][*qty];prep=;det=;unit=`), the words (`verb`, `tverb`, `noun`, `ask`, `rest`, `pre`, `mid`, `subject`), and the documentation keys `requires` (matrix denies) and `effect`.
- **Generator** `src/worlds/describe.mjs` (browser-safe, pure; hooked in `src/worlds/index.mjs`): a table of 20 frames (the grammar of asking, commanding, stating) over the lead/tail/shape groups of `lang.common` (ADR-007). Quantified items ("2 balls", "a ball", "ball") and optional second items are expanded by the generator, not written. `node scripts/gen-from-descriptions.mjs <world>` prints the generated SOP.
- **Descriptions** `worlds/{kids.shop,geo.map,docs.editor}/describe.sop`: 63 wires, 764 lines, 398 generated patterns.
- **Flag**: `PSYS_GEN_PATTERNS=add` appends generated patterns after the hand-written ones; `only` first drops every hand-written pattern and shape whose emit key is described. Default off.
- **Measurement scripts**: `scripts/e3-compare.mjs`, `e3-inventory.mjs`, `e3-report.mjs` (use `e1-collect.mjs` for the runs; sets: operational, operational-ro through the translator, dialogues, gold pilot-300, real phrases).
- **Romanian is not generated.** AGENTS.md: everything in a world is English; ADR-005/translation: Romanian enters through the translator. RO patterns would put Romanian words into worlds. The RO sets are run through the translator route unchanged and the RO impact is reported below.

## Coverage of the descriptions
| World | operation keys with patterns | keys described | hand-written pattern blocks / lines replaced | description wires / lines | generated patterns |
| --- | --- | --- | --- | --- | --- |
| kids.shop | 15 | 10 | 481 / 2,936 | 11 / 127 | 194 |
| geo.map | 49 | 25 | 176 / 1,241 | 27 / 348 | 127 |
| docs.editor | 57 | 13 | 139 / 947 | 25 / 289 | 77 |
| total | 121 | 48 | 796 / 5,124 | 63 / 764 | 398 |

For the described operations, 5,124 lines of hand-written patterns (including the `sw` / `w` families of matrix.patterns.sop, which are mass-generated sentence variants) become 764 lines of description: 6.7 times fewer. kids.shop is the clearest case: 449 `core.question` patterns are the combinations of 6 questions x item counts x phrasings; 11 descriptions (127 lines) replace 2,936 lines. The rest of geo.map and docs.editor (73 keys) are not described: that is the work not done, not a verdict.

## Results: hand-written vs `only` (generated replaces hand-written for described operations)
Cases of the three worlds (audited worlds) and all cases. right / wrong+partly / not understood.

| Set | audited: hand-written | audited: generated | all cases: hand-written | all cases: generated |
| --- | --- | --- | --- | --- |
| operational (1,296) | 229 / 5 / 2 of 236 | 220 / 9 / 7 | 1236 / 32 / 28 | 1227 / 36 / 33 |
| dialogues (2,241 turns) | 344 / 0 / 6 of 350 | 328 / 5 / 17 | 2170 / 32 / 39 | 2152 / 38 / 51 |
| gold pilot-300 | 23 / 9 / 5 of 37 | 22 / 9 / 6 | 202 / 51 / 47 | 201 / 51 / 48 |
| real phrases | 3 / 0 / 2 of 5 | 3 / 0 / 2 | 45 / 2 / 33 | 45 / 2 / 33 |
| operational-ro via translator (2,480) | 309 / 26 / 25 of 360 | 283 / 43 / 34 | 2029 / 126 / 325 | 2002 / 144 / 334 |

Per world, English cases (operational + dialogues + gold + real): kids.shop 107 right of 116 with hand-written patterns, 107 with generated (equal; same 2 wrong, 7 not understood); geo.map 231 -> 229 of 238; docs.editor 261 -> 237 of 274.

- **`add` mode (generated next to hand-written): no loss and no gain** on any set. One Romanian case changes from not understood to wrong ("du-ma la madrid" read as `geo.compare.short`, "with la and madrid"): a new wrong answer from an over-generous short form, so `add` does not pass the gate for RO as it stands. English: zero changes.
- **`only` mode: gained 3, lost 55 right cases, 16 new wrong** (audited worlds; plus 1 right -> partly in ui.help, a cascade). Gains: 3 operational cases "mark Paris and Rome and highlight Italy" (compound; right by luck of segmentation, not a real gain). Lost: 24 right -> not understood, 17 right -> partly, 14 right -> wrong. New wrong (strict): 6 English cases of 5 phrases (docs.editor: "make a todo list: wash, cook", "add a heading A, a heading B and a heading C", "add a paragraph with 45.5 degrees", "add a list and make it numbered", "add a numbered list" (read by kids.tasks); the todo-list phrase is in two sets), 9 Romanian cases (renderings of the same docs.editor phrases, and "Sterge tot de pe harta": geo.clearAll lost its `wipe everything off the map` forms and art.draw.remove took it), and 1 ui.help dialogue turn that is a cascade of an earlier docs.editor turn.
- **Gate "no new wrong answers" fails in `only` mode for docs.editor and geo.map** (5 new wrong in English). It passes for kids.shop (no new wrong, equal right).

## Cases lost, and why (all are description gaps, none is a generator limit)
1. **docs.editor, same action, different structure (the largest group, about 45 cases)**: `doc.addHeading` has 6 shapes in the hand-written files (heading, title with level=1, chapter/section role with title, chapter with number "chapter 3: The End", role bare, "start the document with a title: ...", positions "under chapter 1", "after the title"); `doc.addList` has styles (numbered, task, empty then "make it numbered"), `doc.read` chapter forms, `doc.undo` "twice" / "scratch the last thing I added", `doc.newBlank` (not described). The description set lists the variants it knows (title, role, role bare, heading) and the others are exactly the cases lost. A description per *emit variant* is needed; the number of variants per operation is the real size of the work.
2. **Romanian-boundary leftovers**: "cele 3 creioane" (untranslated "Cele" before the count) was matched by a hand-written pattern that has the word as filler; generated patterns do not know translator residue.
3. **geo.map (9 English cases)**: "zoom out 2 levels" (count with unit word), "clear everything on the map", "switch to the street map" (layer after the verb with `the`), "remove the last marker" (`arg.last=true` variant not described), "distance paris to rome in km pls" (bare noun first, fixed with a `bare` frame, one phrasing remains), "which countries share a border with" (opener list).
4. **kids.shop**: none in English once the frames `last` ("2 balls cost how much"), `cond` ("if I give 15 lei for a ball, what is my change"), `compound` ("I want a puzzle and I pay 10 lei, what is the change") and `canlast` ("puzzle + 2 kites, can I pay") existed: **these four frames were the structure no hand-written-free description covered**; adding them took kids.shop from 1,221 right to 1,235 of 1,296 operational (hand-written 1,236) in four iterations. The two Romanian kids.shop losses are the translator's wording ("on a ball", "receive", "cele").

## What a complete description needs that we do not have
Per operation variant (a variant = one emit shape):
1. **Argument roles with classes** (`arg=name:class`). Question operations of kids.shop have `inputs=` in operations.sop but no class; the action operations of geo.map and docs.editor have no `inputs` at all (`doc="Map action geo.zoom: see ops.mjs"`). Roles and classes can only be read back from the hand-written patterns (`{p:lex.geo.map.places}`): derivable by script from the patterns, not from the operation files.
2. **The emit variant itself**: fixed arguments such as `arg.dir=in`, `arg.state=done`, `arg.level=1`, `arg.all=true`, `where.count=1` for "a ball". They exist only in the emit strings of patterns. An operation key is many variants (doc.read has 6, doc.addHeading 8, geo.zoom 4).
3. **Words of the action and of the thing** (`verb`, `noun`, `ask`, `tverb`, `rest`, `pre`, `mid`, `subject`): 131 lines of the 764. They exist nowhere but inside the alternatives of patterns (and inside lexicons for argument words, which is the one thing already separate). I wrote them by mining the existing alternatives, so the number here understates what a new world would cost; a C1 author or a model has to supply them.
4. **Frames the grammar did not have**: sentences where the question comes last, where a condition opens the sentence, and two-clause questions. Four frames were added during the work, all for kids.shop; docs.editor positions ("under chapter 1") and lists would need two more. The frame table is the part that must be maintained by us, once, for all worlds.
5. **Open classes**: "how much does a rocket cost" must be understood (and answered "I don't know the price") although `rocket` is not in the items lexicon. A description needs `class=noun` (open) vs a lexicon class; the first version used the lexicon and lost the guess-the-intent behaviour. This is the user's coherence point: the description must say which arguments may be unknown words.
6. **Preconditions as denies**: `requires=` points to matrix denies (shop.d.debt, shop.d.short, shop.d.left, ed.d.over, ed.d.zero); the denies exist (3 in kids.shop, 14 in geo.map, 11 in docs.editor) but have no link to an operation, only `when=$wire` chains. 8 of 63 descriptions link one; the link is derivable from the `when` wires for the query worlds, not for the action ones.
7. **Effects**: `effect=` is prose (documentation); `doc=` of operations.sop already has it for kids.shop and docs.editor, not for geo.map.

## How much is derivable automatically
- Emit key and action name: 100% (operations.sop `action=` / outputs).
- Argument names and classes: about 85% by inverse from the patterns (every slot of the hand-written patterns has `name:class`), 0% from operations.sop for geo.map and docs.editor, which declare no inputs. In the three worlds, 32 of the 48 described keys have their arguments only in patterns.
- The emit variants (fixed arguments): by inverse from patterns, mechanical.
- Words: not derivable from legend / lexicon / operations / matrix (0%); they are the content of the hand-written patterns and the reason a description is shorter than the patterns, not a free by-product.
- Preconditions: partly (matrix denies exist; the link to the operation is not recorded).
- Effects: partly (`doc=`).

## Verdict for the user
1. **The idea works for the structured, combinatorial worlds.** kids.shop (the world where the hand-written patterns are most mechanical) is reproduced at 100% of the hand-written EN results from 127 lines of description, replacing 2,936 lines. It is also coherent in the user's sense: the sentence forms rest on the operation's roles and state (the basket, the count, the money), not on remembered phrasings, and the four frames added are reusable by any world with baskets, counts or "how much" questions.
2. **It does not yet replace hand-written patterns for the larger action worlds**: geo.map is at 99% and docs.editor at 91% of hand-written right on the described keys, with 5 new wrong answers (all docs.editor). The loss is description incompleteness (variants and words), and it shrinks monotonically as variants are described (the audited operational right count went from 205 to 220 of 236 when the heading variants and bare verbs were added, and the audited dialogue turns from 306 to 328 of 350).
3. **It adds no coverage today.** In `add` mode nothing changes in English: the hand-written patterns already cover what the sets ask. E1 says the largest error class is "structure no pattern covers"; generated patterns only help there if frames for the missing structures exist, and frames are written by hand once (four were needed for kids.shop, the same ones every basket-like world needs).
4. **Romanian**: not generated (worlds are English-only). The translator route shows -26 right in the audited RO cases, which is the same loss as English plus translator wording differences. RO-TRANSLATE-FALLBACK's gain is independent of this.
5. **Recommendation**: do not replace hand-written patterns yet. Keep `describe.sop` as the *source* for new worlds and for the C1 workflow (a world author writes roles and words once; the frames give every phrasing form; the effort is words and variants, not sentences), and make it the generator behind kids.shop where it is already at parity (a follow-up could ship kids.shop in `only` mode after the two RO wording gaps are covered; that retires 2,936 lines). Next steps that would change the verdict: describe the remaining 73 keys of geo.map and docs.editor (variants first), add the two docs frames (position, list style), run the operational set after each batch.
