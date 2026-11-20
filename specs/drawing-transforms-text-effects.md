# Drawing: transforms, writing, effects and picture filters

Owner request (2026-11-20): "can we add texts, rotate, change fonts, effects?" on the Drawing tab, the generic way:
declared slots, catalog knowledge and SOP rules; no per-kind code. The restored Drawing UI (specs/ui-parity.md) shows
every capability as a control that sends the same declared native command a spoken request compiles to.

## Declarations

- Catalog (sop-knowledge-worlds e23dcd66 and its doc follow-up): `w.drawing.object` rotation (degrees clockwise),
  mirror (none, horizontal, vertical, both), skew, opacity, effect, fill, gradient, outline, stroke; writing: text, font,
  weight, slant, align, frame. `w.drawing.group` and `w.drawing.part` rotation and mirror (parts also opacity and
  effect). `w.drawing.page` filter. `k.styles` font (face + generic family), fill (pattern, gap, angle), effect (kind,
  radius, dx, dy, colour, strength), filter (sepia, grayscale, invert, brightness, contrast, saturate, hue, blur, tint,
  tint_amount), frame (shape, tail, fill, outline) and turn (by or to degrees), with their words.
- Native interface (worlds/art.draw/native-interface.sop): `drawing.object.change` rotation, turn, mirror, skew,
  opacity, effect, fill, gradient, outline, stroke, text, font, weight, slant, align, frame; `drawing.object.make` text,
  font, weight, slant, align, frame, rotation, opacity, effect, fill (kind `text` is a declared kind);
  `drawing.part.change` rotation, turn, mirror, opacity, effect; `drawing.page.change` filter.
- Act rules (worlds/art.draw/style-rules.sop): a turn by number or by a k.styles turn name (relative `by`, absolute
  `to`), kept in 0..360; a mirror toggles through a declared step table; named looks must be k.styles names (otherwise
  refused: effect-, fill-, font-, frame-, turn-, filter-not-declared); a group turns and mirrors as a whole (its own
  rotation and mirror); parts get or change their edit; writing gets its box at make (size = width of the words at a
  letter height of 44, height 1.3 letter heights; character count by a declared length table) and keeps proportions
  when its size changes; new words keep the letter height; the page is made on its first filter. Each value is observed
  (app.observe.input) and the k.styles names are offered as options.
- Projection (worlds/art.draw/style-projection.sop): `ui.draw.pose` (slot or source+part; centre, rotate, skew, mirror,
  order n: group 1, object 2-4, part 6-7), `ui.draw.style` (opacity, effect fields, pattern fields, gradient, outline,
  stroke, typeface, weight, slant, anchor; `pose=none` keeps a ground shadow on the ground), `ui.draw.filter` (one fact
  per picture filter and the tint); text objects are drawn from their box; frames are a box (rounded per k.styles) and
  a tail triangle.
- Renderers: worlds/sop-primitives.mjs wraps each draw in its poses, applies opacity, CSS drop-shadow/blur, pattern and
  gradient paint servers, typefaces, the page filter on the root and the tint rect. The Drawing tab's crayon renderer
  (docs/webchat/ui/tabs/draw/render.mjs) reads rotate/skew transforms (turned boxes and ovals become outlines), group
  opacity, effects as canvas shadows/filters, rough fill styles per k.styles fill, canvas gradients, written text in its
  typeface and width, and the page filter and tint (screen, PNG and SVG).

## Controls (Drawing inspector and toolbar)

Turn (degrees); ↺ 15°, ↻ 15°, ↻ 90°, Upside down (turn names); Flip ⇆ / Flip ⇅ (mirror); Lean; Opacity; Effect; Fill;
Gradient to (shown for a gradient fill); Outline colour and width; for writing Text, Font, Bold, Italic, Align, Frame;
for a part Part turn, Part opacity, Part effect, Flip part ⇆; toolbar Add text and Filter. A selected group turns and
mirrors as a whole; the other styles go to the selected objects.

## Reader keys for the next rebind (not deployed)

The binding exporter binds an inventory key of family `drawn`/`part`/`page` to the native parameter of the same name
(native-parameter chain) with the catalog slot as its concept. Keys to add to the reader inventory and training labels:
drawn.rotation (number), drawn.turn (candidate+number: rotate_right, rotate_left, upside_down, upright, tilt,
tilt_left, half, full), drawn.mirror (class: horizontal, vertical, none), drawn.skew, drawn.opacity, drawn.stroke
(numbers), drawn.effect, drawn.fill, drawn.font, drawn.frame (candidates from k.styles), drawn.gradient and
drawn.outline (colour candidates), drawn.text (span), drawn.weight, drawn.slant, drawn.align (classes), part.rotation,
part.turn, part.mirror, part.opacity, part.effect, page.filter. Writing is made with `drawing.object.make` kind=text.
A local regeneration with these keys was refused by the alignment catalogue's source identity check
(semantic-alignments-v2 is tied to the 06cf9056 snapshot); the data lane regenerates the catalogue with the new pin.

## Not yet done (honest list)

- Spoken requests: the deployed reader v8 has none of these keys, so "turn the house upside down" or "write Happy
  birthday at the top" do not reach these parameters through language yet (needs the keys above, labelled data and a
  rebind).
- Mirroring has two declared paths: `art.draw.facing` (left/right facing, signed horizontal scale, another lane) and
  this `mirror` pose. They compose correctly (both mirror about the object's vertical middle); merging them into one
  (facing sets mirror, or xsign reads mirror) is the next step.
- Observed boxes and part positions stay unturned (no trigonometry in core.calc): selection boxes of a turned object
  are its upright box. A group's turn is dropped by ungroup.
- Typefaces fall back to the generic family when the face is not installed (Linux Chromium shows serif for cursive).
- Look parts (a person's face and clothes) take no part pose (their draws are keyed by face part).
