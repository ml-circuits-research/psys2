# People and parts on the Drawing tab, and the Avatar as a view of a person

Owner (2026-11-20): people are drawn as small, fully editable persons ("almost mini avatars"), and everything drawn is
a group of editable parts. The Avatar is a particular case of a drawn person: one person, large, framed on the face.

## Model
- A person is a `w.drawing.object` whose drawing has a body style drawn in its frame (`k.faces.frame`: the style
  `figure` on the drawing `person`). It holds two looks (`w.drawing.object look`, `w.face.face`): a face (style `plain`,
  mounted on the part that bears a face, `k.parts.called also=face`, the head slot fitted into that part's box) and a
  body with clothes (style `figure`: slots body, bottom, shoes, top, coat). The parts of the drawing a look replaces are
  hidden (`k.faces.frame hides`; parts inside the face's part; that part when the face has a head).
- A thing whose drawing has a face-bearing part (the sun's disc, a cat's head) takes a face when a face part or an
  expression is asked for.
- Look parts are parts of their object: index after the drawing's own parts (body look first, then face, by slot
  order), observed as `<code>.<index>` with the word of their slot (`k.parts.name slot`), variant, colour and box.

## Rules (all SOP; no per-kind JavaScript)
- `worlds/art.draw/person-rules.sop` (shared by both tabs): a preset's parts and colours on a face (`ui.person.parts`),
  the preset and the outfit chosen for an age and sex by a seed (`ui.person.want` / `ui.person.pick`, then
  `ui.person.bodywant` / `ui.person.bodypick`), colours chosen by seed (`ui.person.colourpick`); a person with a body
  leaves out the face slots the body draws (`ui.person.replaced`: neck, shoulders).
- `worlds/art.draw/look-rules.sop` (shared): edits of a part of a face joined on that face (`ui.face.edit`,
  `ui.face.add`): variant, size grade or scale, move, place, colour (tint sets the face colour), feature (length), remove.
- `worlds/art.draw/look-projection.sop` (shared): the primitives of each look part in the frame of its style
  (`ui.avatar.draw`); `render-projection.sop` maps them onto the page, `ui.avatar/view-projection.sop` into the Avatar's
  face frame (the body under the face).
- `worlds/art.draw/act-rules.sop`: people kinds are made by catalog name (`k.people.kind drawing=`), with age and sex from
  the kind or the command (`age=`, `sex=`); seed = the new object's layer; `drawing.part.add` (by part name, wearable,
  variant kind or slot; a removed part of the drawing is put back; a face for a thing that bears one; colour through the
  tint); look edits through `drawing.part.change/place/remove` by index; `drawing.part.change shape=` (basic shape or a
  k.layouts outline; refused otherwise); `drawing.person.vary` (next seed: preset, outfit recomposed);
  `drawing.person.expression` (the face's expression; a face made for a thing); removing an object removes its looks.

## Not yet
- Poses (sitting, waving, holding): the figure's arms and legs are fixed in its variants; poses need joint positions
  the garments follow (a skeleton in k.faces style figure), not separate drawings.
- The reader's labels for part length, part shape, part variant and a person's age or sex as constraints (no key in
  the official inventory); `ui-people-parts-v1` labels what the inventory has. The bindings with `k.parts.name` and
  `drawing.part.add` are generated (training/sop-bert/export-structural-bindings.mjs) but not deployed.
- A "different person" as a dialogue alternative (replace the previous person, keep "add another" with undo) needs the
  dialogue's alternative mechanism; the native `drawing.person.vary` replaces the look in place.
