# LLM-written TRAINING messages: what to write

You write realistic messages that a person types into a chat-based diagram editor, each with its gold formalization in the editor's
legend. They TRAIN a small reader that must later understand messages it has never seen, written by other people. So the data must look
like real use, not like a template: whole messages of any natural length, from one or two sentences up to long messages of 10-20
sentences (a person describing or reworking a whole diagram), simple and complex sentences mixed (subordinate clauses, reasons,
"and then", a question tagged on, self-corrections, text that is not a request). Mostly instructions, plus questions in about half of
the messages. No quotas: never pad a message or add sentences to reach a length or a count per action; write what a person would write.

Do NOT read anything under training/sketch/llm_bench (the test set) or any other file of the repository except this one.

## Output

JSON Lines, one message per line:

```json
{"id": "m-0001", "domain": "network diagram", "names": ["Router", "Lan"], "text": "ok so I'm mapping the office network. Could you slap a gray hexagon named Switch right under the Router? Then hook it up to Lan with a dashed line, it's a backup link. How many hexagons do we have now?", "wires": [
  {"span": "Could you slap a gray hexagon named Switch right under the Router", "trigger": "slap", "type": "command", "args": {"action": "create", "shape": "hexagon", "color": "gray", "name": "Switch", "position": "below", "anchor": "Router"}},
  {"span": "Then hook it up to Lan with a dashed line", "trigger": "hook it up", "type": "command", "args": {"action": "connect", "from": "$new", "to": "Lan", "style": "dashed"}},
  {"span": "How many hexagons do we have now", "trigger": "How many", "type": "question", "args": {"ask": "count", "shape": "hexagon"}}]}
```

- `names`: the shapes ALREADY on the canvas before this message (one capitalised word each, letters and digits only). Mention only these
  or shapes the message itself creates.
- `wires`: one per action or question, IN THE ORDER the text states them. Text that is not a request ("ok so I'm mapping the office
  network", "it's a backup link", "thanks!") gets no wire.
- `span`: the exact substring of `text` (copied character for character) that expresses this request, without the chatter around it.
- `trigger`: the exact word or words inside `span` that say WHICH action or question it is (the verb or question phrase: "slap",
  "hook it up", "How many", "get rid of", "is ... bigger than" -> write "bigger than"). Copied as written, typos included.

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

## Coverage

Spread the requests over EVERY action and question of the legend, roughly in proportion to how often people would use them (create, set,
connect, move most often; but at least 40 requests per file set for every action and every question type, including extreme, nearest, connected,
degree, comparison checks, distribute, toFront / toBack, pairing, notColor and recency mentions). Vary which optional keys appear.
Use different domains, personas and names throughout; never reuse a sentence frame more than a few times.

## Connect conventions (be consistent)

- "connect A to B" -> from "A", to "B". One to several ("link Hub to PcA, PcB and PcC") -> from "Hub", to "PcA,PcB,PcC", no pairing.
- "connect A, B and C in a chain / one after the other" -> from "A,B,C", pairing "chain", no `to`.
- "connect A, B, C each to the next" -> from "A,B,C", pairing "next", no `to`.
- "connect A, B and C all to each other" -> from "A,B,C", pairing "all", no `to`.

## Variety (the point of the exercise)

- Many domains: flowcharts, org charts, network and cloud diagrams, state machines, mind maps, family trees, kanban-like boards, school
  diagrams, UI wireframes made of shapes, pipelines, floor plans, game maps, recipes, sports plays, story boards, anything people draw.
- Many people: terse engineers, chatty students, non-native speakers (small grammar slips), voice dictation (run-ons, "uh", "okay so"),
  self-corrections ("make it blue, no wait, teal": gold = teal), polite requests, imperatives, questions to check the result. About 1
  message in 10 has a typo or two.
- Vary the verbs and phrasings as widely as real people do; every action and every question kind must appear many times, each time in a
  different way. Do not reuse a sentence frame more than a few times in the whole file.
- Use $new for a shape created earlier in the same message (also when a later sentence refers to it by its name or by "it").

## Forms added 2026-11-02 (layout operations, "all", arrow labels, created layouts, free text, templates, help)

Source of each convention: `training/sketch/ops/HIGH_LEVEL_OPS.md` sections 2-3 (layout operations, arrow restyle), `training/sketch/legend_ext/LEGEND_EXT.md`
section 7 (free text, templates, help), the coordinator's decisions of 2026-11-02 (the "all" target, arrow labels). The Rules reader
(`docs/js/logic.js`) reads all of them; `training/sketch/llm_train/synth_rules*` and `ops_formulations` hold examples it reads exactly.

- **New actions** (no new keys): `improve` (tidy / tidy up / clean up / neaten / declutter / make it look better; "tidy" is no longer
  `arrange layout=grid`), `respace comparison=bigger|smaller [scale] [distance]` (more / less space, compact, tighten), `snap [distance]`,
  `flip [axis]`, `reverse from= to= | target= | quantifier=all` (turn arrows around; "reverse that" is an undo), `sort [property]
  [superlative] [layout]`, `groupBy [property]`, `equalize property= [anchor=model]` ("make them the same size"; "equalize the spacing" is
  distribute), `straighten`, `untangle`, `fit [position=center]`; `arrange layout=tree|layers|radial|organic [direction] [anchor=root]`;
  `align direction=left|right|up|down` (line up the left edges / tops / bottoms); "flip A and B" (two named shapes) is a `swap`.
- **Every shape as the object**: all / everything / all the shapes / every shape / the (whole) diagram / the canvas / the drawing / the
  whole thing / them all / all of them, as the object of any command (align, arrange, distribute, set, move, improve ...) ->
  `target=mention(quantifier=all)`, wherever it stands in the clause ("align all horizontally", "arrange them all in a row"). "them all" /
  "all of them" after several shapes named or described in the same message -> those shapes. "all" before a noun quantifies the noun
  ("all circles" -> `mention(quantifier=all,shape=circle)`). No target word -> no `target` key. No axis word -> no `axis` key (the engine
  uses horizontal).
- **Restyling existing arrows**: `set` (or `resize` for thicker / thinner) with the arrow named by its ends, `from=` / `to=`, and the new
  `style` / `color` / `arrow` / `size` (thick -> large, thin -> small); every arrow -> `kind=edge` (+ `quantifier=all` when all / every / each
  is said). A new arrow ("a dotted line from A to B") stays `connect`. This replaces the earlier rule that recolouring a link gets no wire.
- **Arrow labels**: `label from= to= label=` names the arrow by its ends ("label the arrow from A to B "yes""); `label=""` removes it.
  Removing labels never deletes: "remove all the labels on the arrows" -> `label kind=edge quantifier=all label=""`; "the labels on A→B and
  B→C: remove them both" -> `label from=A,B to=B,C label=""`. A pronoun after a request about an arrow refers to that arrow: "what does the
  arrow between A and B say? rename it to "x"" -> `label from=A to=B label=x`; "connect A to B, label it "x"" -> ONE connect with
  `label=x` (the arrow just made; one request).
- **Several new shapes in a layout**: "add 4 dots in a circle / as a ring / side by side / stacked" -> `create count= shape= layout=`.
- **Several to one**: "connect A and B to C" -> one connect from "A,B", to "C". "connect A and B" (no to) -> from "A", to "B" (the Rules'
  reading, kept). "undo twice" -> `count=2` (the Rules' reading, kept).
- **Free text** -> `create shape=text label=… [size] [color] [position] [anchor]`: a quoted text with nothing to be written on ("add a
  title "Q3" at the top", "write "Draft" in the corner", "title the diagram "X""), or the words after a text noun without quotes ("add a big
  title Roadmap" -> label Roadmap, size large; "add a note saying check later"). A text placed next to a shape is a free text ("write "START
  HERE" above Room1" -> position above, anchor Room1); "write "X" on Done" is a label of Done.
- **Templates** -> `create template=… items=…` (items comma-joined as written, without quotes; a courtesy word at the end is not an item),
  `title`, `scheme`, `color`, `size`, `position`, `axis`, `count` ("a 5-step process" -> count 5, no items), `items2` (second list),
  `parents`; existing shapes -> `arrange template=… target=…`. A link layout word on existing shapes (tree, hierarchy, org chart, flow,
  layers, spokes, mind map) is a re-layout (`arrange layout=`), not a template.
- **Help questions** -> `question ask=help [topic] [aspect] [about]` (LEGEND_EXT.md section 7: topic = the most specific legend thing named,
  aspect how / can / values / example / overview, about = the words the legend does not know). A question about the drawing written with a
  help lead stays a drawing question ("which shapes can be reached from the rect?" -> reachable; "tell me about the hexagon" -> describe).
