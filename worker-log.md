# Worker log

Append-only, written by the worker. One entry per task:

```
## Tn — <title> — done | partial | blocked (<date time>)
Commands: ...
Results: key numbers (link to training/results/*.json)
Commit: <hash>
Deviations / choices: ...
```
