# Standing preferences

A standing preference is something a person states once and the application keeps applying: "I'd prefer a man as my
avatar", "make my avatar an old man with glasses", "always use dashed lines", "I prefer pastel colours", "keep IDs on".

## Data

- Instance: the catalog's `w.preferences` world (sop-knowledge-worlds 1e8f0af4). An area that keeps preferences lists it
  as a second instance module (`area.sop`: `instance=w.preferences`), so the preferences are persisted, restored and
  shown in the Worlds tab's Instances layer with the area's own instance.
- A preference: `key`, `field` (the part of a described value; `value` for a plain key), `value`, `about` (the words as
  said), `scope` (app, tab, kind) and `of`, `source` (default, stated, learned), `at` (order of statement; 0 for a
  default).
- Declared data per area (`worlds/<area>/preferences.sop`): `w.preferences.default` (the default of a key or field and
  its scope), `w.preferences.field` (`many`, `clears`), and `app.pref.operation` (which command states, resets or
  applies a key). Defaults are data the rules read, not constants in a rule.

## Merge (worlds/app.project/preference-rules.sop)

- A statement (`app.pref.statement`) replaces the stated value of its field (adds one value to a `many` field) and
  removes the stated values of the fields it `clears`; other fields keep their values. The new fact has
  `source=stated`, `at` = latest + 1, the declared scope.
- A reset removes the stated and learned values of a key (or one field) and makes the instance hold the declared
  defaults it lacks.
- In force (`app.pref.current`): the stated value of a field; otherwise its declared default unless a stated field
  clears it. `app.pref.stated` holds only what was said (projections that must not override an area's own default
  read it).
- After a statement or a reset of a key, the command the area declares to apply it runs next on the resulting state
  (`app.act.next`; worlds/sop-world-host.mjs runs it, at most 4 levels; a refusal anywhere refuses the whole command).

## Consumers

- Avatar (`worlds/ui.avatar/figure-rules.sop`): key `avatar.figure` (fields preset, kind, age, sex, trait, without,
  colour); default the friendly robot (`preset=robot`, `kind=robot`); the tab's start is `avatar.figure.default`.
  `avatar.figure.describe` (preset, kind, person, age incl. younger/older, sex, traits, without, colour, about) and the
  Composition control (`avatar.face.preset`, `avatar.face.compose`) state it; `avatar.figure.apply` composes it through
  the people model (k.faces presets, k.people.kind faces, art.draw person-rules) and then `avatar.figure.traits`
  applies k.faces traits, empty slots and the colour. Key `ids` keeps object IDs shown while the view says nothing.
- Diagram (`worlds/diagram.sketch/preferences.sop`): `link.style` (an unstyled link is drawn in the stated style),
  `palette` (a page with no theme takes the stated k.styles theme), `ids`; `placement.side` is declared only.

## Not yet

- Preferences are kept per area instance: an app-scope statement made in one tab does not yet reach another tab.
- The reader has no keys for these commands yet (next rebind): see the worker log entry for the needed keys.
- `learned` preferences are declared but nothing infers them yet.
