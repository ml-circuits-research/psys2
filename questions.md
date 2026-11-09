# Questions from the worker

The worker appends questions here and never deletes them. The reviewer removes a question only after answering it in a new round of `worker-tasks.md`.

Format:

```
## Q<n> (task Tn, <date>)
Question: ...
Context: what was tried, what the options are.
Blocking: yes/no. If no: the choice taken meanwhile.
```


## Review request (batch complete, 2026-11-09)
Question: Batch complete, please review and write improvement tasks in worker-tasks.md. State and sources: `training/RESULTS.md`.
Context: open decisions for the reviewer / user:
(a) Webchat rule bundle `worlds/index.json` is 4.51 MB against the 2.5 MB target. Options: a compiled pattern format (dictionary/tokenized, needs a loader change), shorter ids and emit templates, lazy per-world loading. Gzip transfer is already 0.64 MB.
(b) The L7 target for total patterns.sop (<= 2 MB) was missed: 2.99 MB. Match text fell 6.04 to 1.87 MB; the rest (examples, emit templates, ids, other keys) is outside the macros' reach. Accept, or set a new target?
(c) "Where were we?" gold labels contradict each other: `dlg.avt#040` and `dlg.mpc#009` expect the previous topic, `dlg.doc#045` expects the story. Which is right?
(d) "What colour is the sky?" gold label: avatar says negative, kids.shapes answers (probably correct). Relabel the gold?
(e) The S1 edit head gives no gain (3 recovered / 7 misled / 1 broken). Keep, drop, or retarget?
(f) PERF: round 2 (57b28bf) did not reproduce 33.6 s page ready; please rerun `node scripts/perf-webchat.mjs --runs 3` (definitions of ready / first answer / model ready are printed in its header; `--net fast4g` for mobile data). Model download on slow links (64 MB dispatcher + ~95 MB normalizer, ~81 s on Fast 4G) remains: shrink or defer the normalizer?
Blocking: no. Choice taken meanwhile: nothing changed for (a)-(f).
