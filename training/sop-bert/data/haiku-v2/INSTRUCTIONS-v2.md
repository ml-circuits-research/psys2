# Writing training rows for an English request reader (v2: general request form)

You write realistic English messages that one user types into one app, and you annotate each message the way the app's reader must understand it. The app has four areas: drawing, diagram, document, calendar. You write rows for ONE area, given in your task, and your task names a set of FOCUS KEYS that most rows must use.

Read `/home/claude/gen/v2/inventory.json` first. It lists, per area, the wire types and their keys. `request` and `conversation` hold the structure every area shares. For your area, use the wire types under your area's name. A key is written `<type>.<key>`, for example `drawn.colour`, `meeting.time`, `section.order`, `chart.series`. When a key has `values` and its `head` contains `class`, the value must be exactly one of them. When the head is `candidate`, the value is a lowercase English lemma (the listed values are suggestions, not a closed list). A `number` value is digits. Every `*_span` field is an exact, case-sensitive substring of that request's `span` (copy the user's own words, typos included).

## Row format

One JSON object per line, no line breaks inside a row, no comments, no trailing commas:

```
{"id":"<area>-v2b<NN>-<4-digit n>","world":"<area>","context":{"existing":[{"name":"...","kind":"..."}],"previous":"<previous user message or null>"},"text":"<what the user typed>","requests":[<request>, ...]}
```

A request:

```
{"span":"...","trigger":"...","mood":"do|propose|check|ask","act":"<act>",
 "target":{"type":"<wire type of the area>","mode":"new|existing|bound","fill":"written|context|description|all|previous_reply|journal_step","determiner":"definite|indefinite","kind":"<lemma>","kind_span":"...","name_span":"...","description_span":"...","ordinal":"...","count":"<digits>","count_span":"...","quantifier":"..."},
 "constraints":[{"key":"<type>.<key>","value":"...","value_span":"...","operator":"eq|less.equal|greater.equal|degree|region|relation|same|occurred|delta|factor","phase":"selector|result","polarity":"positive|negative","character":"requirement|preference|assumption","step":"more|much_more|less|much_less","measure":"<digits>","measure_span":"...","unit":"<lemma>","anchor_span":"...","anchor_fill":"written|context|description","variety":"same|different|random|matching|alternating","scope":"each|group","group":"and|or"}],
 "question":{"ask":"<request.question.ask value>","asked_key":"<type>.<key>"},
 "turn":{"fragment":"...","objection":"...","repeat_count":"<digits>","area":"drawing|diagram|document|calendar"}}
```

Rules:

- `span`, `trigger`, `mood`, `act`, `target` (at least `type` and `mode`) are always present. `constraints`, `question`, `turn` only when they apply. Inside them, leave out every field that does not apply (absent means none). Never invent a value the text does not support.
- `act` is one value of `request.request.act`: `make` creates, `place` moves or positions, `change` sets a property, `remove` deletes, `arrange` lays out several things. A question is `act: answer` with `mood: ask` and a `question`. A check ("make sure nothing overlaps") is `act: answer`, `mood: check`, `question.ask: exists` or `which`.
- `target.mode`: `new` for something to be made, `existing` for something already there (then `fill` says how it is given: `written` = named, `context` = "it/them/that", `description` = "the red one", `all` = "everything", `previous_reply` = an objection or why-question about the app's last answer, `journal_step` = "undo the last change"), `bound` for "each/every X" under a quantifier.
- Each constraint is ONE condition on ONE key. `phase: selector` picks which existing thing is meant ("the RED square"); `phase: result` is what should hold after the act ("make it BLUE"). "make the red square blue" has two constraints on `drawn.colour`: red/selector and blue/result.
- `operator`: `eq` for a value ("blue", "at 3pm"); `region` for a named region on an axis ("afternoon", "top left", "formal"); `degree` for a degree word judged against others ("big", "long", "warm"); `delta` with `step` for relative change ("bigger", "a bit later", "warmer"); `factor` for "twice as big"; `relation` with `anchor_span` for a relation to another thing ("next to the house", "before the apology", "after standup"); `same` for "the same colour as X"; `less.equal` / `greater.equal` for limits ("at most 200 words", "at least 10 seats"); `occurred` for a past event ("the one I just added").
- `polarity: negative` for excluded conditions ("not in Room 2", "no circles"). `character: preference` for soft wishes ("ideally", "if possible", "preferably"), `assumption` only when the user states an assumption ("assuming the room is free"); otherwise `requirement`.
- `scope: each` when a condition applies to each member ("each box red"), `group` when to the group as a whole ("make them fit on one row"). `group: or` when the user offers alternatives ("Tuesday or Wednesday"); give each alternative its own constraint with `group: or`.
- A message with several requests lists them in text order; spans do not overlap and appear in the text in that order. Greetings and filler stay outside spans. A message with no request at all has `"requests": []` (about 3% of rows).
- `context.existing` lists 2 to 8 things already in the area, consistent with the text. `context.previous` is the previous user message for follow-ups, fragments, corrections and objections; otherwise null.

## Examples

```
{"id":"drawing-v2b00-0001","world":"drawing","context":{"existing":[{"name":"square 1","kind":"square"},{"name":"square 2","kind":"square"}],"previous":null},"text":"make the red square blue, ideally a darker blue","requests":[{"span":"make the red square blue, ideally a darker blue","trigger":"make","mood":"do","act":"change","target":{"type":"drawn","mode":"existing","fill":"description","determiner":"definite","kind":"square","kind_span":"square","description_span":"the red square"},"constraints":[{"key":"drawn.colour","value":"red","value_span":"red","operator":"eq","phase":"selector","polarity":"positive","character":"requirement"},{"key":"drawn.colour","value":"blue","value_span":"blue","operator":"eq","phase":"result","polarity":"positive","character":"requirement"},{"key":"drawn.colour","value":"blue","value_span":"darker blue","operator":"delta","step":"more","phase":"result","polarity":"positive","character":"preference"}]}]}
{"id":"calendar-v2b00-0002","world":"calendar","context":{"existing":[{"name":"Standup","kind":"meeting"},{"name":"Room 2","kind":"room"}],"previous":null},"text":"set up an hour with Ana after standup on tuesday or wednesday, not in room 2","requests":[{"span":"set up an hour with Ana after standup on tuesday or wednesday, not in room 2","trigger":"set up","mood":"do","act":"make","target":{"type":"meeting","mode":"new","determiner":"indefinite"},"constraints":[{"key":"meeting.length","value":"60","value_span":"an hour","operator":"eq","phase":"result","polarity":"positive","character":"requirement","measure":"60","unit":"minute"},{"key":"meeting.people","value":"Ana","value_span":"Ana","operator":"eq","phase":"result","polarity":"positive","character":"requirement"},{"key":"meeting.relation","value":"after","value_span":"after","operator":"relation","anchor_span":"standup","anchor_fill":"written","phase":"result","polarity":"positive","character":"requirement"},{"key":"meeting.day","value":"tuesday","value_span":"tuesday","operator":"eq","group":"or","phase":"result","polarity":"positive","character":"requirement"},{"key":"meeting.day","value":"wednesday","value_span":"wednesday","operator":"eq","group":"or","phase":"result","polarity":"positive","character":"requirement"},{"key":"meeting.room","value":"room 2","value_span":"room 2","operator":"eq","phase":"result","polarity":"negative","character":"requirement"}]}]}
{"id":"document-v2b00-0003","world":"document","context":{"existing":[{"name":"Apology letter","kind":"letter"},{"name":"explanation","kind":"paragraph"}],"previous":"write a short formal letter about the late delivery"},"text":"that's way too stiff. how many words is it?","requests":[{"span":"that's way too stiff","trigger":"too stiff","mood":"do","act":"object","target":{"type":"text","mode":"existing","fill":"previous_reply"},"constraints":[{"key":"text.tone","value":"formal","value_span":"stiff","operator":"delta","step":"less","phase":"result","polarity":"positive","character":"requirement"}],"turn":{"objection":"too_much"}},{"span":"how many words is it","trigger":"how many","mood":"ask","act":"answer","target":{"type":"text","mode":"existing","fill":"context"},"question":{"ask":"count","asked_key":"text.words"}}]}
{"id":"diagram-v2b00-0004","world":"diagram","context":{"existing":[{"name":"Sales Q1-Q4","kind":"bar_chart"},{"name":"Q3","kind":"bar"}],"previous":null},"text":"stack the series and put the legend on, then which quarter is highest?","requests":[{"span":"stack the series","trigger":"stack","mood":"do","act":"change","target":{"type":"chart","mode":"existing","fill":"context","determiner":"definite"},"constraints":[{"key":"chart.stacked","value":"on","value_span":"stack","operator":"eq","phase":"result","polarity":"positive","character":"requirement"}]},{"span":"put the legend on","trigger":"put","mood":"do","act":"change","target":{"type":"chart","mode":"existing","fill":"context"},"constraints":[{"key":"chart.legend","value":"show","value_span":"legend on","operator":"eq","phase":"result","polarity":"positive","character":"requirement"}]},{"span":"which quarter is highest","trigger":"which","mood":"ask","act":"answer","target":{"type":"node","mode":"existing","fill":"all"},"question":{"ask":"max","asked_key":"node.value"}}]}
```

## What makes the data good

Vary verbs, word order, length (1 to 40 words), politeness, names, numbers as digits and words, British and American spelling. Write like people type into an app: lowercase, missing punctuation, about one row in five with a small typo or abbreviation, run-ons, second thoughts. Never repeat a text. Do not copy the examples.

## Tools

Use only Read, Write, Edit and Bash on files under /home/claude/gen/v2/out/<your area>/. Never call send_later, any trigger or scheduling tool, SendMessage, or any tool other than these four; there is nothing to schedule. You may check your rows with `python3 -I /home/claude/gen/v2/validate_v2.py --check <file>` (read-only).

## Your output

Write exactly the number of rows your task asks for, split into two files of equal size (create the first chunk of each file with Write; if a file is too large for one Write, append the rest with Bash `cat >>` heredocs). Number the rows continuously. Run the checker on both files and fix every reported row. When done, reply with one line: the two paths, the row count, and how many rows use each focus key.
