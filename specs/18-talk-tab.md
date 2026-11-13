# 18. The Talk tab: a conversation that draws itself

World `talk` (`worlds/talk`, `status=fixture`, ops strategy: it does not opt in to the matrix, so both reasoner settings give the same answers) and the tab `docs/webchat/ui/tabs/talk.mjs`. Purpose (owner, 2026-11-13): show how worlds and knowledge combine. The frame of the question decides the card; the knowledge supplies the words and the facts by lookup (spec 17); no model takes part and the encoder is not retrained (the frame decides and Talk is the active tab).

This is **stage 1** (frames and renderers, the topic board, "how do you know", honest scope). Stage 2, not built yet: transfers of a card to other tabs, the avatar's reactions, the session and profile cards, the experiments E-T1..E-T5, tree and map cards, and the real layout module (SPACE) and follow-ups without a subject (SCENE-NATURAL P2).

## 1. Question frames and answer cards
A frame is a pattern of `worlds/talk/patterns.sop` whose phrasing lives in `lang.talk.*` phrase groups of `lang.common` (ADR-007). The thing is an open slot; it is looked up in the knowledge catalog by the host (`openSlots` hook, spec 17 section 3 item 2) and read by the operation through `ctx.knowledge.peek`. The basic things shipped with the drawing world (`art.draw/things.catalog.mjs`, read as data) answer when the catalog has nothing or cannot be reached.

| Frame | Action | Card |
| --- | --- | --- |
| what is X, tell me about X, what does X look like | `talk.look` | `drawing`: the parts of X drawn in order, the named parts on tap (a tap marks one part, the others fade) |
| the parts of X, what parts does X have, what is X made of | `talk.parts` | `parts`: a box for X and one box per named part (a plain column layout until SPACE) |
| how many P does X have | `talk.count` | `icons`: that many counted dots (a count of a drawing is said to be a picture, not a fact) |
| which is bigger, A or B; is A bigger than B; which has more P, A or B | `talk.compare` | `bars`: two bars on one scale (planets: kilometres across; things: the size word of the common sense fact; parts: counts) |
| the months, seasons, days, planets (in order, from the sun) | `talk.order` | `line`: a point per item |
| what comes after or before X; which is the third planet | `talk.neighbour` | `line` with the answer marked |
| how do you know (that) | `talk.how` | `how`: the path of the last answer (section 3) |
| what did we talk about, show the topic board | `talk.board` | the board (section 2) |
| what can we talk about | `talk.scope` | the opening line and chips |

The sequences and the planet sizes are a small table in `ops.mjs`, a placeholder until the time and space knowledge worlds are in the catalog; the "how do you know" card says so.

**A plain sentence always comes with the card.** No fact (the thing is not in the catalog nor among the basic things, or the catalog says nothing about the asked part): the plain "I don't know that yet." (or "I know X, but not how many P it has"), status `missing`, no card and no topic. An unreachable catalog says "I can't reach the picture catalog right now, so I can only show the basic things." only for a thing it has no picture of.

State (`ctx.state`): `{ n, cards: [{ id, kind, topic, thing, title, text, data, how }], topics: [{ id, name, parent, say, card, at }], current }`. At most 40 cards are kept (older ones lose their data, their topics keep the sentence). The operation queues the effect `talk.card { id }`; the tab builds the card from `cards.mjs` and puts it inside the answer in the chat (`host.attach`, a new method of the tab host API). `worlds/talk/cards.mjs` holds the renderers as pure functions returning SVG/HTML strings (browser-safe, no DOM, no imports): every text is escaped and every colour is a whitelisted name or `#rrggbb`, so a card cannot carry markup.

## 2. The topic board
Each thing talked about becomes a node (`topicFor`). A new topic hangs under the current one when it is a part of the thing just shown ("what is a tail?" after the comet), else under the root "Talk"; follow-ups without a subject use the current node once SCENE-NATURAL P2 lands. `layoutBoard(topics)` is a tidy tree, left to right, every leaf in its own row, so nodes never overlap (tested; unknown or circular parents hang under the root). Desktop: the board is in the panel beside the chat; phone (up to 720 px): behind the button "Show the topic board". A tap on a node scrolls the chat to the first card of the topic and flashes it. "What did we talk about?" says one line per topic and shows the board (`talk.board` effect). "Save as picture" downloads the board as a PNG (standalone SVG drawn on a canvas, no library).

## 3. How do you know?
`ownsExplain(ctx, { text })` makes the discourse layer leave "how do you know", "why do you say that", "where did you learn that" to this world on the Talk tab (`Discourse._tabOwns`; elsewhere the general explanation of the last turn is unchanged). The card has five steps, in plain words and with no internal names: You asked, I read it as (the frame), I looked in (the picture catalog and its group, the word senses, the common sense facts, or "a small table built into this tab"), I found (the sentence), So I made (the card), and a note when the fact is weaker (a count taken from a picture, a size taken from a size word). The words of the question are rebuilt from the frame and the slots. The catalog lookup does not expose the licence of a fact yet, so none is shown.

## 4. Honest scope
No free chat. The opening line and the chips of the tab (`CHIPS`, every one tested to be read by the world) name what the tab can talk about; "what can we talk about?" gives the same line and chips from the example questions of the world's patterns. A message nothing reads is refused by the tab's own `outOfScope(ctx, { text })` hook (called from the unparsed branch of the dialog for the world of the open tab): "I cannot talk about that here. I can talk about ... You could ask "A" or "B"." with the two example questions nearest to the user's words (word overlap) as chips. A message that another world reads (for example a map question) still goes to that world and its tab, as everywhere.

## 5. Host additions
- `ui.shell` lexicon `declaredtabs`: `talk`; `kb.sop` of `ui.shell` and `ui.help` regenerated by `scripts/gen-ui-kb.mjs`.
- `Discourse._tabOwns(hook, text)` and the `ownsExplain` hook; `outOfScope` hook in `src/dialog/index.mjs` (both are no-ops for a world that does not export them).
- `hostApi.attach(node)` in `docs/webchat/app.mjs`.

## 6. Tests
`worlds/talk/tests.sop` (no catalog: basic things and built-in tables, both reasoner settings), `tests/talk-world.test.mjs` (in-memory catalog: sentences and cards, no fact no card, topics under their parent, the how card, the board, honest scope, every chip is read, escaping, layout without overlaps) and `node scripts/test-webchat-talk.mjs` (headless Chrome at 1440x900 and 390x844: the cards inside the chat, the board, a tap that scrolls, the phone button, no page errors; PUPPETEER_CORE as for the other browser scripts).
