# Writing training rows for an English request reader

You write realistic English messages that one user types into one app, and you annotate each message the way a reader of that app must understand it. The app has four areas (worlds): drawing, diagram, document, calendar. You write rows for ONE world, given in your task.

Read `/home/claude/gen/questions.json` first. It lists the questions a reader must answer for every request: the `common` questions (all worlds) plus the questions of your world. A request's answers use only these question keys. A closed question's answer must be exactly one of its `values`. An open answer is a lowercase English lemma or digits, as its `ask` says. A `*_span` answer is an exact, case-sensitive substring of that request's `span` (copy the user's own words, including typos). Leave out every question that does not apply (absent means none). `mood` and `act` are always present. If `act` is `answer`, `mood` is `ask` or `check` and `ask_kind` is present. A check ("check nothing overlaps", "make sure every step is connected") is `mood: check`, `act: answer`, usually `ask_kind: exists` or `which`; it changes nothing.

## Row format

One JSON object per line, no line breaks inside a row, no comments, no trailing commas:

```
{"id":"<world>-b<NN>-<4-digit n>","world":"<world>","context":{"existing":[{"name":"...","kind":"..."}],"previous":"<previous user message or null>"},"text":"<what the user typed>","requests":[{"span":"<exact substring of text>","trigger":"<word(s) in span that signal the act>","answers":{...}}]}
```

- `context.existing` lists the things that already exist in the area (2–8 items, realistic names and kinds). Requests that refer to existing things must use names or descriptions consistent with it.
- `context.previous` is the previous user message when the text is a follow-up, fragment, correction or objection; otherwise null.
- `requests` lists every request in the message, in order; spans do not overlap and appear in the text in that order. Words that are not part of any request (greetings, "thanks", filler like "ok so") stay outside every span. A message with no request at all (small talk, "thanks!", "hmm") has `"requests": []`; about 3% of your rows are like that.
- One request = one act on one target (or one question). "draw a cat and a dog" is two requests if they are two things to make; "make the boxes red and round" is one request with two answers.

## Examples (drawing)

```
{"id":"drawing-b00-0001","world":"drawing","context":{"existing":[{"name":"house","kind":"house"},{"name":"sun","kind":"sun"}],"previous":null},"text":"pls draw a small red car next to the house and make the sun bigger","requests":[{"span":"draw a small red car next to the house","trigger":"draw","answers":{"mood":"do","act":"make","target_fill":"new","kind":"car","kind_span":"car","size":"small","colour":"red","relation":"next_to","anchor_span":"the house"}},{"span":"make the sun bigger","trigger":"make","answers":{"mood":"do","act":"change","target_fill":"written","target_span":"the sun","step":"more","axis":"size"}}]}
{"id":"drawing-b00-0002","world":"drawing","context":{"existing":[{"name":"house","kind":"house"},{"name":"tree","kind":"tree"}],"previous":"move the house down"},"text":"more","requests":[{"span":"more","trigger":"more","answers":{"mood":"do","act":"place","target_fill":"context","fragment":"repeats","direction":"down"}}]}
```

## Examples (calendar)

```
{"id":"calendar-b00-0001","world":"calendar","context":{"existing":[{"name":"Review","kind":"meeting"},{"name":"Room 2","kind":"room"}],"previous":null},"text":"could you set up an hour with Ana and Tom tomorrow afternoon, not in Room 2","requests":[{"span":"set up an hour with Ana and Tom tomorrow afternoon, not in Room 2","trigger":"set up","answers":{"mood":"do","act":"make","target_fill":"new","kind":"meeting","people_span":["Ana","Tom"],"duration":"60","duration_span":"an hour","day":"tomorrow","day_span":"tomorrow","time":"afternoon","time_span":"afternoon","room_span":"Room 2","negated":"room_span"}}]}
{"id":"calendar-b00-0002","world":"calendar","context":{"existing":[{"name":"Standup","kind":"meeting"},{"name":"Budget review","kind":"meeting"}],"previous":null},"text":"who's in the budget review?","requests":[{"span":"who's in the budget review","trigger":"who's","answers":{"mood":"ask","act":"answer","ask_kind":"who","target_fill":"written","target_span":"the budget review"}}]}
```

## What makes the data good

- Vary everything: verbs and synonyms (draw, add, put, sketch, throw in, stick, create, I need, let's have...), word order, sentence length (1 to 40 words), politeness, directness, names, numbers written as digits and as words, British and American spelling.
- Write like real people type into an app: lowercase, missing punctuation, small typos (e.g. "teh", "recieve", "tommorow"), abbreviations ("pls", "mins", "tmrw"), run-on messages, second thoughts ("no wait, blue"). Do not overdo typos: about one row in five has one.
- Mood: "make it red" is do; "maybe make it red?" / "what if it were red" is propose; "is it red?" asking about the thing is ask; "check that nothing overlaps" is check. "Could you make it red?" is still do (an indirect request).
- Never invent answers the text does not support. If a value is implied but not said (no size given), leave it out.
- Never repeat a text you already wrote. Do not copy the examples.

## Tools

Use only Read, Write, Edit and Bash on files under /home/claude/gen/out/<your world>/. Never schedule, message or call any other tool.

## Your output

Write exactly the number of rows your task asks for, split into two files of equal size with the Write tool (create both files; each holds complete lines only). Number the rows continuously across the two files. Before writing, re-check every row: valid JSON on one line, every span and *_span is an exact substring, closed values are from the lists. When done, reply with one line: the two paths and the row count.
