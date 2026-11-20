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

## The person as a controllable vector model (2026-11-20)
- Knowledge (catalog 8c33bcf8, 87d8c1e4): k.faces skeleton of the figure (`k.faces.bone`: joint, parent, level;
  `k.faces.part bone`: the bone a part moves with: limbs, sleeves, trouser legs, shoes, gloves split at the joints),
  poses (`k.faces.pose` with the holding hand `hold_x`, `hold_y`; `k.faces.turn`: degrees per bone; words of
  `k.faces.pose.name`), expressions smiling, laughing, crying (a tear: `k.faces.expression cheeks`), shocked, scared,
  frowning with words, traits (`k.faces.trait` colours, `k.faces.trait.part` slots filled or emptied: ginger, blond,
  bald, bearded, freckled, spectacled, skin tones ...), figure slots back (cape, cloak), neckwear (scarf, tie, bow tie),
  hands (gloves, mittens), suit jacket, sandals; `w.face.face pose` (a mode, like `expression`).
- `worlds/art.draw/figure-rules.sop`: a posed figure draws each part with a bone turned about its joint and its parent's
  joint (`ui.draw.pose source part x y rotate n`, mirrored with the object's facing); names by name or word (an
  expression also by a k.feelings feeling); make/catalog make with `pose`, `expression`, `trait`, `wear` (a thing worn or
  a trait part replaces the preset's part of its slot: `ui.person.omit`); `drawing.object.change` with `pose`,
  `expression`, `trait`; `drawing.person.pose {id, pose}`; `drawing.person.hold {id, kind | thing}` (a new thing of the
  kind, a third of the person's size, at the hand of its pose; a standing person takes `holding`); refusals
  pose-not-known, pose-needs-a-body, expression-not-known, expression-needs-a-face, trait-not-known,
  trait-needs-a-person, garment-not-drawable, hold-needs-a-person. Observed: `pose` (standing when none), `expression`;
  options `pose`, `trait`, `garment`.
- Avatar (shared view): `ui.avatar/view-projection.sop` turns the figure's limbs in the face frame
  (`ui.avatar.viewpose`); `avatar.face.pose {pose}`; the inspector's "Pose" control.

- `worlds/art.draw/occlusion-rules.sop`: make, catalog make and change take `edge` (left, right, top, bottom) and `cut`
  (the share beyond the page, 0 touching): the centre is put size x (0.5 - cut) from that edge; the page clips the rest.

## Not yet
- Occlusion behind another thing ("half hidden behind the tree": a partial overlap with the layer below) and measured
  offsets ("two hand-widths from the left edge") are not implemented.
- A seated or kicking figure keeps its box: its feet rise rather than its body dropping to the seat (no root shift in a
  pose); a long coat or a dress does not follow the thighs. Holding at make time ("a girl holding a kite") needs a
  `holds` parameter on make; a held thing is placed, not attached (moving the person leaves it).
- Expression causes ("happy because ...") are not kept; a feeling without an expression of k.faces (shy, worried) is
  refused rather than drawn from its own variants.
- The reader's labels for part length, part shape, part variant and a person's age or sex as constraints (no key in
  the official inventory); `ui-people-parts-v1` labels what the inventory has. The bindings with `k.parts.name` and
  `drawing.part.add` are generated (training/sop-bert/export-structural-bindings.mjs) but not deployed.
- A "different person" as a dialogue alternative (replace the previous person, keep "add another" with undo) needs the
  dialogue's alternative mechanism; the native `drawing.person.vary` replaces the look in place.
