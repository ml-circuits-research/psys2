# Authoring human paraphrases (C1 only)

You receive seed requests in `batches/bNN.jsonl`. Each seed is an executed, verified editor command from `ui-natural-v1`. For every seed, write **24 variants** that a real person might type or say to the assistant in that editor. This is offline authoring of training data. No language model runs in the application.

## The seed

- `text` is the original command. `existing` lists the objects currently visible in the editor.
- `requests` contains one item per request: an act, a trigger word, a target, and numbered `constraints`.
- Each constraint has a `key`, a canonical `value`, the `surface` text used in the seed, a `phase` (`selector` identifies an existing thing, `result` is a value to set), and `optional`.

## Three tiers

1. **equivalent** (11 variants). The meaning is the same and every constraint is kept.
   - Vary the verbs: draw, add, put, sketch, create, make, place, give me, I want, I need, can you, could you, let's, please.
   - Vary the register: terse, casual, polite, indirect ("would be nice to have…"), spoken style ("um, add a…").
   - Vary the word order and the sentence type: imperative, question, statement of desire.
   - Up to two variants may contain one small typo, but **never inside a constraint surface or the trigger**.
2. **complex** (5 variants). The text is longer and more natural, and every constraint is still kept.
   - Add a reason or purpose ("…so it stands out"), discourse markers ("ok, now…", "actually"), or a clause that adds no new constraint value.
   - You may refer to an existing object by a description that `existing` supports, for example "the circle" or "the Start box".
   - Do not introduce new values such as colours, positions or sizes that the seed lacks.
3. **simplified** (8 variants). The text is shorter or vaguer, and it relies on the system to choose sensible values from its knowledge and preferences.
   - Drop one or more **optional** constraints. Mark each dropped constraint `null`.
   - Or replace a precise **optional** value with a vague one that the world can reasonably resolve, for example "120,90" → "near the top left", "size 80" → "smallish", "#ff0000" → "reddish", "10:00" → "in the morning". Mark it `{"vague": "<surface>"}`.
   - Never drop or blur a **mandatory** constraint (`optional:false`), the kind of a new object, or the act.
   - When nothing is optional, write short or elliptical forms instead ("a house, please", "house too", "another one like that, a house").

## Output

Write one JSON line per seed to `out/bNN.jsonl` (same NN as the input batch):

```json
{"seed":"ui-natural-00004","variants":[
 {"tier":"equivalent","text":"could you draw a red house at 120,90, size 80, labelled Home?",
  "requests":[{"trigger":"draw","kind_span":"house","name_span":null,"count_span":null,
   "constraints":{"0":"120","1":"90","2":"80","3":"red","4":"Home"}}]},
 {"tier":"simplified","text":"put a small red house up in the corner",
  "requests":[{"trigger":"put","kind_span":"house","name_span":null,"count_span":null,
   "constraints":{"0":{"vague":"up in the corner"},"1":{"vague":"up in the corner"},"2":{"vague":"small"},"3":"red","4":null}}]}
]}
```

Rules for the output fields:

- `requests` has the same length and order as the seed's `requests`. A compound seed with two requests needs both in every variant.
- `constraints` maps **every** constraint number `n` to one of:
  - an exact surface string. It must appear **verbatim** in `text` and express the seed's value. A true synonym is allowed ("large" for big, "Wednesday" for a date that falls on Wednesday only if the seed already uses a weekday).
  - `null` (dropped; optional constraints only, simplified tier only).
  - `{"vague": "<surface>"}` (simplified tier only; the surface appears verbatim in `text`). Two constraints may share one vague surface ("up in the corner" for both x and y).
- `trigger` is the exact surface of the word or phrase that expresses the act. Write it whenever the seed has a trigger; it must appear in `text`.
- `kind_span`, `name_span` and `count_span` give the exact surface when the seed's target has that field. Otherwise use `null`.
- Numbers keep their digits as written in the seed. Write `120,90` or `120, 90` or `x 120 y 90`, never "one hundred twenty".
- Quoted labels and titles keep their exact spelling and case.
- All text is in English. Do not write any other language.
- Do not repeat a text, even with only a case change.

Check your file before finishing: it must have one valid JSON line per seed, 24 variants per seed, and every surface must be a substring of its text.
