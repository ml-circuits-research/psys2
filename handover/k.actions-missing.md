# What `k.actions` lacks for the act readers of the schema worlds (for the knowledge repository)

Found while moving the act phrases of the generated schema worlds to lookup (spec 21 section 10). The generated verbs (`worlds/acts/verbs.generated.mjs`) come from `k.actions`; what is listed below is read today from small TEMPORARY tables (`worlds/acts/forms.more.mjs`, `worlds/lang.common`) and is deleted from PSys2 as soon as the catalog has it. Checked against `tests/fixtures/catalog` (k.actions).

By act (name as in `k.actions.act`; verbs with underscores for spaces):

| act | missing verbs / phrasal verbs | where PSys2 keeps them now |
| --- | --- | --- |
| make | doodle, whip up, scribble, gimme, give me | `lang.common` phrases (wish forms), forms.more `make.*` |
| place | shove, nudge, scoot | none yet: "shove it to the top right corner" is not read |
| undo | step back (and the whole frame: "undo that change", "undo the last step": one verb plus an optional object word, not a phrase list) | `lang.undo` phrase group, 37 alternatives, and the form `undo.verb` |
| **redo** | the ACT itself is absent: add `redo` with `opposite=undo`, and the verbs redo, do again, put back, bring back, get back ("get that back" is a redo, not an undo), restore | `lang.redo` phrase group |
| pick | click, tap, touch (select by pointing) | form `pick.click` (flag `none`) |
| pick, mode **none** (nothing picked) | deselect, unselect, unmark, unhighlight, untick, "clear the selection", "nothing selected". Needs a way to say an act with no object (a `mode=none` on the verb wire, or an act `unpick` with `opposite=pick`) | forms `pick.none`, `pick.none.state`, `pick.none.clear` |
| save | download, export (with the role `format`: png, svg, markdown ...; `format` is not among the roles of `save`); `download` is listed under `load` today, which is the other direction for a drawing and for a file | forms `save.noun`, `save.download` |
| remove | wipe | none |
| ask (what is near) | none missing as verbs; the frames ("what is near X", "anything next to X", "is anything beside X") are roles with markers: `near`, `next to`, `beside`, `by`, `close to`, `around` for the role `place` of `ask` | forms `ask.near`, `ask.beside` |

Also (not verbs):
- the role `value` of `change` has two kinds of words that the readers still list by hand: sizes (tiny ... huge, bigger / smaller, "the same size as") and fill modes (solid, outline, crayon, "fill in"). Candidate: `k.values` kinds `size` and `fill`, with a `change` marker `into`, `to be`, `in`, `with`.
- discourse fillers ("um", "so", "like", "yeah", "hey yo", "would you mind", "could you") are the words of `lang.lead.filler` / `lang.lead.polite` / `lang.tail.filler` in `lang.common`; they belong with the words of `k.words` (a `discourse particle` class), not in `k.actions`.
