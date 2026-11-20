# human-benchmark-v1

This is the held-out north-star benchmark of real human utterances, adapted to our five tabs. It is not a training input.
The design and the measured results are in `specs/human-utterance-benchmark.md`.

| Path | Contents |
| --- | --- |
| `items/<tab>.jsonl` | one item per line. Fields: `text`, `tab`, `context.existing` (seedable objects), optional `session`, `source` (corpus, id, licence; the original line is withheld for non-commercial or unlicensed corpora), `adaptation`, `construction` tags, and `expect` (a plain-words `description` plus semantic `effects`) |
| `sources/<tab>.md` | which corpora were used for that tab, how lines were sampled, and the adaptation rules |
| `owner_items.py` | builds the owner phrase-log items. Romanian originals are translated to English; the owner's English typos are kept |
| `run-benchmark.mjs` | runs the items through the app route (`routeNewEngine`), seeding each item's context on a real area host with the pinned site catalog, as `probe-bundle.mjs --run` does. It adds before/after observations and sessions, and does not apply the replay diagnostic budget |
| `score.py` | semantic scorer: pass, partial or fail, plus the primary layer. It is lenient, so its rates are upper bounds |
| `layers.py` | multi-label failure flags, and a static check of whether each expected meaning can be expressed in the current inventory and bindings |
| `taxonomy.py` | coverage per usage class |
| `results/` | the 2026-11-20 run with deployed reader `b8b1a4dd…` at PSys2 `dede8b3b`: `summary.json`, `layers.json`, `taxonomy-*.json` and `<tab>.scored.jsonl` |

Run it like this:

```
node training/sop-bert/data/human-benchmark-v1/run-benchmark.mjs docs/webchat/models/sop-bert/<sha> <node_modules> items/drawing.jsonl > out.jsonl
python3 training/sop-bert/data/human-benchmark-v1/score.py items/drawing.jsonl out.jsonl scored.jsonl
```

Items are counted per tab. Owner items are the phrase logs and sessions; setup turns are not scored.

| Tab | Items | Owner items | Setup turns |
| --- | --- | --- | --- |
| drawing | 329 | 73 | – |
| diagram | 333 | 38 | 45 |
| calendar | 220 | – | – |
| avatar | 228 | 8 | – |
| document | 204 | 3 | 6 |

Licences: the owner's decision (2026-11-20) is that corpus lines are used one by one as inspiration for our own adapted
items. Raw corpora stay local and are never redistributed. Each item records its corpus licence. Items adapted from
CC BY-SA sources (SMCalFlow, TeX.SE, SCONE, Dolly) are derivative works under CC BY-SA.
