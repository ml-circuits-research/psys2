# 21 — Acts and schemas: one grammar, one executor, worlds as schemas (ACTS x SCHEMAS)

Implementation: `worlds/acts/` (module world: phrase groups, legend, `acts.mjs`), generator `scripts/build-schema-world.mjs`, a schema world is a directory with `schema.sop` plus GENERATED `patterns.sop`, `operations.sop`, `templates.sop`, `lexicon.sop`, `ops.mjs` (never edited, stale-checked by test). Tests: `tests/acts.test.mjs`, fixture `tests/fixtures/worlds/test.seating/`.

## 1. Why
Every doing world (draw, diagram, avatar, Talk, charts, editor, map) has its own patterns, operations and replies, so each has its own holes and a phrase learned in one helps no other. What users ask is the same dozen acts. They are said once; a world declares only what exists in it.

## 2. The acts and their roles
Roles (same everywhere): `thing` (what), `set` (several things: "all", "the guests"), `attribute` (colour, seats), `value` (blue, 4, "Ann"), `place` (a relation and a reference: "at table 2", "next to the lake"), `amount` (a number, "a bit", "more").

| act | meaning | roles | needs |
| --- | --- | --- | --- |
| make | create an instance | thing, [value=name], [place], [amount] | |
| remove | delete instances | thing or set, [place] | |
| change | `set` an attribute to a value, `more`, `less` | thing or set, attribute, value or amount | |
| place | move / put / seat | thing or set, place | |
| connect | relate two things | thing, place (the other) | |
| group | `group` things / `apart` take a group apart | set | |
| pick | make a thing the focus ("select the first table") | thing | |
| ask | `what` (attribute value, what is at a place), `count`, `where`, `why` | thing or place, [attribute] | |
| copy | duplicate | thing | |
| send | hand a thing to another world (an effect, `ctx.host.send`) | thing, place = the world | host |
| undo / redo | one step per request | | |
| save / load | name the state / restore it | value = name | |

The English forms of the acts are written ONCE, as `core.phrase` groups in `worlds/acts/lexicon.sop` (verbs) and as a table of forms in `acts.mjs` (`FORMS`). The seed verbs are local and marked `seed=temporary`: they are deleted when the knowledge repo's `k.actions` (verb -> act, roles) is read through the catalog.

## 3. The schema (SOP Lang, `schema.sop`)
```
@seat acts.schema        noun="seating plan" acts=make acts=remove acts=change acts=place acts=ask acts=undo ...
                         limit.items=60 limit.history=30
@seat.table acts.kind    plural=tables numbered=yes max=10
@seat.guest acts.kind    plural=guests named=yes in=table
@seat.seats acts.attr    of=table type=number min=1 max=12 default=4 more="more seats" less="fewer seats"
@seat.colour acts.attr   of=table of=guest type=colour default=white
```
`acts.kind`: `plural`, `numbered=yes` (instances are "table 1"), `named=yes` (an instance has a `name`), `in=<kind>` (the container kind a `place` refers to, with `capacity=<attr>` on the container), `max`, `acts=` (restricts the world's acts for the kind), `any=knowledge` (any drawable kind from knowledge: the kind is accepted when `know.kind(word)` returns one). `tabOnly=yes` on `acts.schema` makes every generated pattern `tabOnly` (a doing world with a tab: its role slots `{thing:words}` would otherwise read the sentences of other worlds); the world then declares `tab=` and a tab plugin (`docs/webchat/ui/tabs/seating.mjs` is the 50-line one of `plan.seating`).
`acts.attr`: `of` (kinds, repeatable), `type` (`number`, `enum` with `values`, `colour`, `text`, `bool`), `min`, `max`, `default`, `more`/`less` (words), `word` (synonyms of the attribute name). Defaults of values come from the schema, then from `know.attrDefault`.
Generated from it (`scripts/build-schema-world.mjs`): `lex.<ns>.kinds`, `lex.<ns>.attrs`, `lex.<ns>.values` (lexicons), the patterns (about 40 per world, role slots `{thing:words}`, never one per kind), one operation `acts.do` per act, one template per act (`{note}`), the `meta.worlds` card words, the help examples (`examples(schema)`), and the coverage sentences (`sentences(schema)`, A5).

## 4. The executor (`createExecutor(schema, hooks)`)
State (`ctx.state`): `items [{id, kind, n, name, attrs, place}]`, `focus {ids, act, place, kind}`, `history`, `future`, `saved`, `last` (the last act with its roles and the difference), `pending`, `counter`. `run(state, act)` applies one act and returns `{ status, note, diff, guesses, why }`; `diff` = `{ added, removed, changed: [{id, attr, from, to}] }`. The reply ("I removed the glasses") and the why-answer ("because you asked me to remove them") are built from the act and the diff, once, for every world. Undo restores the snapshot taken before the request (one step); redo the reverse. Referents: `it`/`them`/`that` = focus; "table 2", the name, the kind alone (all of it when plural or the only one, else one question), ordinals, spelling slips of one letter. Bounded: every loop ticks the turn budget; `limit.items`, `limit.history`.

## 5. Delegation and the graded fallback
A missing role is filled by the first tier that has it: `said` > `focus` (`hooks.focus`, std.focus when vendored) > `scene` (the state) > `knowledge` (`hooks.know`: kind synonyms, usual place, default value) > `default` (the schema). The reply says every guess ("I used table 2, the one we just talked about"). Order of the fallback: (1) complete -> do. (2) role missing -> fill, do, say the guess. (3) the act does not exist here -> say where it does (`hooks.whereActs(kind, act)`: "a table has no hat; the avatar does"). (4) else ONE question naming the guessed act and thing, answered by "yes" / a role (the `pending` of the world, read by `interceptInput`). A bare "I did not understand" is never produced by a schema world.

## 6. What stays out
Chess legality, the hangman word, arithmetic: rule worlds that keep their moves and only declare their acts for routing. Layouts (`place` with `space`) go through `hooks.layout`. The reader tagger (P3) and the coverage grid (A5) are separate tasks.

## 7. How a schema world meets the engine (implemented)
Every pattern emits `action=<ns>.<act>` with the role arguments plus `arg.text="{segment}"` (the user's sentence, kept in the act log for the why-answer). The generated `ops.mjs` exports one function per act, `interceptInput` (the answer to the one open question: a role, or yes / no to a guessed act; a message that is a new command cancels the question and is read normally) and `outOfScope` (the engine's hook for the world of the open tab when nothing read the sentence: the guessed act and thing, one question, examples). Lexicons of attributes, values and comparatives are `class=modifier` (the engine must not take "blue" for a thing that "it" can mean). The engine's discourse layer owns "redo": it works through the world's own undo and is cancelled by any later turn, a query included; the executor's own redo is the fallback for hosts that call it directly.
Measured on the seating plan (schema of 49 lines, 41 generated patterns): 40 natural requests written without looking at the grammar, read by a rule of the grammar and answered with an act reply in 39 of 40 in both reasoners (the miss is a fragment, "a bigger table 1", which belongs to the dialogue module); reading the replies by hand showed that reading is not correctness: the first run had 9 wrong or odd answers among the 35 read (a table added for "table 2 to have 8 seats", "how many seats does table 1 have" counting tables, "table 1 and table 2" not coordinated, "next to" silently read as "at", duplicate names, ...). Each was a general cell (coordinated things, unread leftovers, relation words the world does not have, attribute questions, unique names), fixed once in the executor or the forms and pinned in tests/acts.test.mjs; the second run was correct on all but the fragment. **P2 on a fresh set of 60 (2026-11-13, `scripts/exp-seating.mjs`, world `worlds/plan.seating/`, the same schema, 49 lines):** 60 natural requests in six conversations, written before the act grammar was read, 6 of them (conversation 3) with a verb drawn from `k.actions` (read through `facts.wires('k.actions.verb')`) for the act. Both reasoners gave identical replies. Read (an act reply, not "did not understand"): 48 of 60. Right by hand (the reply read against the state it left): **31 of 60**. The 29 failures are in `training/eval/failures.jsonl` (tab `plan.seating`, class = cell): act phrase 18 (verbs of `k.actions` that the seed verbs do not hold: generate, produce, scatter, label, forget; "which table is X at", "where is X now", "what is in the plan", "how many are at", "give X N seats" read as send, "swap", "clear", "show me"), referent 9 (a name the plan does not know with a seating verb: the executor says "there is no Tom" instead of adding him; "her", "everyone", "them all" after an add, "it" over two tables), kind 1 (a list of names read as one name), executor 1 (removing a table silently unseats its guests), attribute 0. Run with every world loaded and the tab of the plan open (the default of the script; `--only` loads the plan alone) the same 60 give 31 right again; the 11 requests that nothing read get the graded question of the world ("I did not catch what to do with table 1. I can add, remove, ...") instead of the generic refusal, and two leak to another world although the tab is open ("swap Zoe and Max" to the drawing, "forget the guests" to the task list: a routing cell, the verbs are unread). The round-trip paraphraser needs the on-device translation model, which is not in this checkout: the variation came from the verbs of `k.actions` and from writing the same act several ways.
