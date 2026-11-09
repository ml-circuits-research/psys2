# LLM-written benchmark: what to write

You write realistic messages that a person types into a chat-based diagram editor, each with the gold formalization in the editor's
legend. The messages are used to compare two formalizers; neither has seen them. Variety and realism matter more than anything else:
these must read like many different people, not like a template.

## Output

JSON Lines files, one message per line:

```json
{"id": "s-0001", "domain": "network diagram", "names": ["Router", "Fw1", "Lan"], "text": "...4-5 sentences...", "wires": [{"type": "command", "args": {"action": "create", "shape": "hexagon", "color": "gray", "name": "Switch", "position": "below", "anchor": "Router"}}, ...]}
```

- `names`: the shapes ALREADY on the canvas before this message, by name (one capitalised word, letters and digits only, no spaces:
  Router, Db2, Start, Checkout). Mention only these or shapes the message itself creates.
- `text`: 4 to 5 sentences, at least two of them long or complex (subordinate clauses, several actions joined by "and"/"then", a reason,
  a question tagged on). Mixed: mostly instructions, plus at least one question in about half of the messages.
- `wires`: one entry per action or question, IN THE ORDER the text states them. Parts of the text that are not an action or question
  ("I'm sketching our checkout flow", "thanks!") get no wire.

## The legend (the only things the editor can do; express everything in it)

Wire `type` is `command`, `question`, `fact` (the user states how something IS, e.g. "Db is green") or `rule` (a default for shapes created
LATER: "from now on circles are orange").

Commands, by `action` (other keys as listed; leave out what the sentence does not say):
- `create`: shape, color, size, name, label, count (only when 2 or more), position, anchor
- `delete`: target
- `move`: target, then either position (+ anchor) or direction (+ distance in pixels)
- `set`: target and the new color / shape / size (size only as tiny, small, medium, large, huge)
- `resize`: target ("make X bigger / smaller", "enlarge", "shrink")
- `rename`: target, name; `label`: target, label (the text written on the shape)
- `duplicate`: target, count (only when 2 or more); `swap`: target = "A,B"
- `connect`: from, to, and optionally style, arrow, color, label, pairing; `disconnect`: from, to
- `align`: target, axis; `arrange`: target (omit for "everything"), layout; `distribute`: target, axis
- `toFront`, `toBack`: target; `undo`; `redo`; `forget` (forget the default rules)

Questions, by `ask`:
- `count`, `exists`, `list`: filters shape, color, notColor, position + anchor (count of connections: `kind` = "edge")
- `property`: target, property = color | position | size | shape | label
- `describe`: target (omit for the whole diagram); `neighbors`: target; `connected`: target, anchor (are A and B directly linked)
- `degree`: target; `path`: from, to; `reachable`: from; `cycle`; `rules`
- `check`: target and one of color / shape / size / notColor, or position + anchor, or comparison (bigger | smaller) + anchor
- `extreme`: superlative = biggest | smallest | leftmost | rightmost | topmost | bottommost | mostConnected | leastConnected
- `nearest`: anchor, superlative = closest | farthest, optional shape / color

Facts: target and color / shape / size, or position + anchor. Rules: shape (optional) and color or size.

Values:
- shape: circle, square, rectangle (box), triangle, diamond, ellipse (oval), hexagon, star
- color: red, orange, yellow, gold, lime, green, teal, cyan, blue, navy, indigo, purple, magenta, pink, brown, gray, black, white
- size: tiny, small, medium, large, huge
- position: leftOf, rightOf, above, below, near, between (anchor = "A,B"), and canvas places center, top, bottom, left, right, topLeft,
  topRight, bottomLeft, bottomRight
- direction: left, right, up, down; distance: a number of pixels
- style: dashed, dotted; arrow: none (a plain line, no arrowhead), both (two-way); a plain arrow needs no arrow key
- layout: row, column, grid, circle; axis: horizontal, vertical; pairing: chain, next, all

## Gold conventions (exactly these, or the scoring cannot compare)

- An existing shape by name -> its name, as in `names` ("target": "Router").
- A shape created earlier in the same message -> "$new" ("draw a box called Cache and connect it to Db" -> the connect wire has
  from "$new", to "Db"; later sentences that name Cache also write "$new").
- A description instead of a name -> `mention(k=v,...)` with keys in alphabetical order among color, notcolor, quantifier, recency, shape,
  all lower case: "the red circle" -> "mention(color=red,shape=circle)"; "all the squares" / "every square" / "the squares" ->
  "mention(quantifier=all,shape=square)"; "the boxes that are not blue" -> "mention(notcolor=blue,quantifier=all,shape=rectangle)";
  "the new / last / latest diamond" -> "mention(recency=newest,shape=diamond)"; "the first star" -> "mention(recency=oldest,shape=star)";
  "everything" as a target -> "mention(quantifier=all)".
- A pronoun ("it", "them", "that one") -> what it refers to, written as above (a name, "$new" or a mention).
- Several shapes in one key -> comma-joined in order: "Start,Done".
- Numbers as digits ("count": "3", "distance": "40"). Labels exactly as written inside the quotes, without the quotes.
- Never invent keys; never add a key the sentence does not express.

## Variety (the point of the exercise)

- Many domains: flowcharts, org charts, network and cloud diagrams, state machines, mind maps, family trees, kanban-like boards, school
  diagrams (solar system, food chain), UI wireframes made of shapes, pipelines, floor plans made of boxes, game maps.
- Many people: terse engineers, chatty students, non-native speakers (a few small grammar slips), someone dictating by voice (run-on
  sentences, "uh", "okay so"), someone correcting themselves ("make it blue, no wait, teal"), polite requests, imperatives, questions to
  check the result. About 1 message in 10 has a typo or two.
- Vary verbs and wording freely (pop, stick, slap, throw in, get rid of, nudge, scoot, recolour, hook up, wire, tie, etc.), sentence
  openings, word order (place first, action second), plural vs singular, names vs descriptions vs pronouns.
- Do not reuse a sentence frame more than a few times across the file. Write each message fresh.
