# Questions from the worker

The worker appends questions here and never deletes them. The reviewer removes a question only after answering it in a new round of `worker-tasks.md`.

Format:

```
## Q<n> (task Tn, <date>)
Question: ...
Context: what was tried, what the options are.
Blocking: yes/no. If no: the choice taken meanwhile.
```

## Q3 (task D2, 2026-11-08)
Question: Should a candidate whose rules parse completely but whose interpreter result is `unsupported`/`error` still count as valid (policy option `acceptRefused`)?
Context: Round 2 defines valid = full parse and the interpreter does not return `unsupported` or `error`. On oracle predictions (gold world and segmentation) this strict rule rejects correct parses whose action is refused by the current state, e.g. an illegal chess move or a drawing command on an empty canvas: exact SOP drops from 81.9 % (top-1 + rules) to 76.2 % overall, games from 83.6 % to 61.2 %. With `acceptRefused` (refusal = penalty 3 instead of rejection) the oracle stays at 81.8 % and a noisy oracle (30 % of pieces with the gold world at rank 2/3) goes from 74.8 % (strict) to 80.3 %. A refused action is still the correct understanding; the refusal is the reply.
Blocking: no. Choice meanwhile: the validator keeps the strict rule as default as specified, and D3 reports both modes (B strict, Br acceptRefused); the verdict uses Br if you agree.
