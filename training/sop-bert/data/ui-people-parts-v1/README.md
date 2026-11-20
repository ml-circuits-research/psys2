# ui-people-parts-v1

175 authored rows teaching the reader people drawn as persons and the parts of drawn things named by the word for them
(Drawing). `generate.py` holds the paraphrases as inline-markup data (deterministic, no network); `validate.py` runs the
official `Validator` plus span, per-case count, duplicate and official-overlap checks (`python3 validate.py`, exit 0 =
pass); `report.json` has the counts. Not wired into the official build; the official-dataset owner adds it.

Cases (21-24 rows each): P1 people kinds ("draw a boy", "add a grandmother"), P2 people with an age ("an old man", "a
young girl"), P3 dressing a person ("put a hat on him", "give the boy a red t-shirt"), P4 undressing ("take off her
jacket"), P5 colours of a person's parts ("make her hair red"), P6 colours of a thing's parts ("make the roof blue",
"make the sun's rays orange"), P7 removing a thing's parts ("remove the chimney"), P8 adding parts ("put eyes on the
sun", "put the chimney back").

Label decisions
- A person is a drawn thing (`target.type: drawn`, `act: make`, `mode: new`); its kind is the people noun ("boy",
  "grandma"); an age adjective stays in the kind span as a compound kind ("old man", "young girl"): the runtime reads it
  against the head kind's declared age (k.people.kind age) and the binding of the compound.
- A part is `target.type: part`, its kind the part word (singular lemma, except pluralia tantum and plural part names the
  catalog uses as names: glasses, trousers, shoes, eyes, rays, windows). Editing or removing a part on the page is
  `mode: existing`, `determiner: definite`, `fill: description`; adding one is `act: make`, `mode: new`.
- The thing or person the part belongs to is `part.owner` (operator eq, phase result, as the existing part rows), its
  `value_span` the owner phrase ("her", "the girl", "the house"), its value without the determiner. A possessive ("the
  sun's rays") puts the owner before the part.
- A colour is `part.colour` on a part; the value is the colour phrase ("dark blue").
- Typos (gril, eys, rof, chimny, glases, har) keep the lemma in `kind`.
- Not labelled here, because the official inventory has no key for them yet (proposed for the combined retrain):
  `part.length` ("make her hair long"), `part.shape` ("make the lake irregular"), `part.variant` ("give him curly hair")
  and a person's age or sex as a constraint; the Drawing area's native operations take them (drawing.part.change length,
  shape, variant; drawing.catalog.make age, sex).
