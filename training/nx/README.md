# NX — encoder formalizer experiment: the label format (NX1)

One JSON object per **segment** (one command of a message), world-agnostic. Files: `training/dataset/nx/<source>.jsonl`
(outside git). Converter: `node scripts/export-nx.mjs` (see "Producing the data"). Validator: `node scripts/export-nx.mjs --check <file>`.
Agent B (NX2 pilot) and every later NX stage use exactly this format.

```json
{
  "id": "nx-<16 hex>",
  "group": "kids.tasks/pat.kids.tasks.sw.add.need.n",
  "split": "train | dev | test",
  "world": "kids.tasks",
  "tab": "tasks",
  "context": { "tab": "tasks", "recent": ["kids.shop"], "prev": ["earlier user messages, oldest first"] },
  "message": "i need milk and bread on my shopping list. can u show me the whole list",
  "seg": [0, 41],
  "text": "i need milk and bread on my shopping list",
  "lang": "en",
  "op": "request:tasks.add",
  "ops": ["request:tasks.add"],
  "slots": [
    { "key": "core.request.arg.item", "tag": "kids.tasks|core.request.arg.item", "ask": "What is the item of the tasks.add request?",
      "span": [7, 21], "text": "milk and bread", "value": "milk and bread", "span_source": "rules" },
    { "key": "core.request.arg.list", "tag": "kids.tasks|core.request.arg.list", "ask": "...",
      "span": [28, 36], "text": "shopping", "value": "shopping", "span_source": "rules" }
  ],
  "label_source": "rules-own | generator-backed | rule-derived | canonical-ok | relabelled | paraphrase-inherited | imported-diagram | llm",
  "labeler": "rules | generator | <model id>",
  "judge": null,
  "status": "complete | partial | filler",
  "negative": false
}
```

## Fields

* `text` is the segment; `span` offsets are **relative to `text`** (`text.slice(s, e) === slot.text`, checked by the validator). `seg` is the
  segment's offset in `message`. A message with several commands gives several records with the same `message` and `group`; the
  `context.prev` of later records does not include earlier segments of the same message.
* `context` is the dispatcher's own context: `tab`, `recent` (recent worlds), `prev` (earlier messages). The model input for A is
  `tab: <tab> ; recent: <w1 w2> ;; <text>` exactly as the dispatcher (`psys2_train.data.routing_text`).
* `op` is the operation of the segment (first wire when there are several, all in `ops`, sorted by wire order):
  * `core.request` wire: `request:<action>` (for example `request:tasks.add`, `request:diagram.swap`);
  * `core.question` wire: `question:<type>:<seek>` (for example `question:kids.arith.holding:count`);
  * any other wire: its type (`kids.arith.eat`);
  * no wire (filler, negative, text that is not a request): `none`, `slots: []`, `status: "filler"`.
* `slots` lists every wire entry except the bookkeeping keys (`core.via`, `core.source`, `core.seq`, `core.in`) and the keys that define the
  operation (`core.request.action`, `core.question.type`, `core.question.seek`).
  * `key` is the full entry key in the label wires (`kids.arith.change.who`, `core.question.where.owner`, `core.request.arg.item`).
  * `tag` is the BIO tag family: `key` for domain keys, `<world>|<key>` for the shared `core.request.arg.*` / `core.question.where.*` keys.
  * `ask` is the legend question of the key (`ask=`). For `core.question.where.<k>` it is the `ask` of key `<type>.<k>` when the legend has one;
    `core.request.arg.<k>` has no legend key, so the question is synthesized (`What is the <k> of the <action> request?`), `ask_source: "synthesized"`.
  * `span` is `[start, end]` in `text` or `null` when the value is not stated in the segment (a default, a referent such as `$new`, a computed value).
  * `value` is the canonical value after the lexicon (`apples` -> `apple`, `three` -> `3`, `$e.tom`). The model predicts only spans and the
    operation; canonicalisation stays deterministic.
  * `span_source`: `rules` (the rule formalizer's own slot of the same value), `aligned` (surface search of the value or its lexicon form in the
    segment), `none`.
* `status`: `complete` (every slot has a span, or its value is a referent or a constant that is allowed to have none), `partial` (some slot
  value could not be located: **train the op head only, mask the BIO loss**), `filler`.
* `lang`: `en` (everything stored is English; AGENTS.md).
* `label_source` carries the original dataset label status; `labeler` is who produced the label; `judge` is `null` or `{ model, verdict, reason }`.
  Free labels (NX1) have `labeler: "rules"` or `"generator"`; the LLM labels of NX2/NX3 write the model id and are accepted by the deterministic
  gate (`scripts/nx-validate.mjs`) before use.
* `split` is by `group` (the siblings of a seed stay together) and is inherited from `training/dataset`; the held-out paraphrases keep `test`.

## Protected, never in training

`training/eval/real-phrases-2026-11-09*`, the `expectations-*` files, `operational*.jsonl`, `dialogues.jsonl`, the diagram `data/test` and
`data/bench`. The converter reads every string of the first five and drops any record whose message or segment text (normalized: lowercase,
alphanumerics, single spaces) equals one of them; the count is `protected_dropped` in `training/results/nx-data-report.json`. It never reads
the diagram test/bench files.

## BIO tagging for model A

The tag head labels the sub-tokens of the segment part of the input with `B-<tag>` / `I-<tag>` / `O`. Several slots never overlap in the
data; when two spans overlap, the longer one wins and the other record is `partial`.

## Producing the data

```
node scripts/export-nx.mjs                       # all sources -> /home/salboaie/work/psys2/training/dataset/nx/*.jsonl, report -> training/results/nx-data-report.json
node scripts/export-nx.mjs --check <file.jsonl>  # validate records of a file
npm test -- tests/nx-*.test.mjs                  # (or node --test tests/nx-export.test.mjs)
```
