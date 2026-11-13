# Knowledge by lookup: experiment (2026-11-13)

Design: `specs/17-knowledge-lookup.md`. Set: `training/eval/knowledge-lookup-2026-11-13.jsonl` (built by `scripts/build-knowledge-lookup-set.mjs`; eval only, no training rows). Runner: `scripts/eval-knowledge-lookup.mjs` (four passes over the 200 rows, one fresh session per message: catalog off, on-cold, on-warm, off again for timing). Catalog: the real sop-knowledge-worlds Pages tree (`docs/worlds`, ca8302f: 16218 lemmas, 841 drawable objects, k.commonsense, k.words), read from a local clone; no encoder retraining, no new training data. Reasoner matrix, rules mode.

Set: 40 draw/diagram (28 "draw/sketch a X" on the Drawing tab, 8 "a diagram shaped like a X", 4 "add a box shaped like a X"), 40 knowledge questions (15 define, 8 count, 5 made-of, 6 where, 6 can), 40 controls (30 operational cases spread over the worlds + 10 known-thing messages), and the draw and knowledge cases again with invented nouns (blorp, zindle, ...): 80 more.

## Result (catalog on, cold; "unchanged" is against catalog off)

| group | n | right world | knowledge loaded | answer right | unchanged vs off |
| --- | --- | --- | --- | --- | --- |
| draw/diagram, real nouns | 40 | 36 (90%) | 28 (70%) | 36 (90%) | 14 |
| knowledge questions, real nouns | 40 | 40 (100%) | 33 (83%) | 39 (98%) | 7 |
| controls | 40 | n/a (world labels of shell messages differ) | 0 | 40 (100%) | **40 (100%)** |
| draw/diagram, invented nouns | 40 | 36 (90%) | 0 (no hit, as expected) | 36 (90%) | 40 |
| knowledge questions, invented nouns | 40 | 38 (95%) | 0 (no hit, as expected) | 39 (98%) | 13 |

- Controls: all 40 replies, worlds and statuses identical with the catalog on. No hit moved a message to another world.
- Before this work (catalog off) "draw a comet" was read as "drag" ("Where should it go?") and "what is a comet?" was answered by `media.music` ("A has no common second name"). Now: "Ta-da! I drew a comet." (parts from k.objects) and the WordNet gloss of comet. "draw a lion/monkey" had a hard-coded "I cannot draw a lion yet" (UNDRAWABLE); with a hit the thing is drawn.
- Invented nouns: right world, no shard loaded, plain reply: "I don't know what a blorp is." / "I don't know how to draw a blorp yet." (the animals world says "I don't know how many legs a blorp has yet. You can teach me ..." for count questions, which is its own learning feature).
- Which shard: a hit loads the shards of its lemma only: typically one `k.objects` shard plus one `k.words` shard (comet: `k.objects/shards/noto-sky-weather-05` + `k.words/shards/co`); everyday things also `k.commonsense/shards/core`. 87 shards loaded for 48 lookups over the whole 200-message run.

## Not right (honest list)
- 4 "add a box shaped like a X" (real and invented): `diagram.sketch` does not read that frame (only "a diagram shaped like a X", DRAW-FROM-FACTS item 4); the message falls to `art.draw` and says "I did not understand where to put it". Gap, not hidden: needs a diagram frame, not a catalog change.
- "how many legs do insects have": WordNet does not state a number for the general word; answer "I know what an insect is, but not how many legs it has."
- Invented "what is a snarf": `media.music` reads it as "sharp" through spelling correction (exact reading, nothing left out, so the frame does not take it). "tell me about the plimsy": `media.music` reads it as a song question and refuses plainly. Both are plain refusals from the right-by-frame but wrong-by-routing world: "tell me about X" is ambiguous between worlds.
- Cat legs: the hand-written cat drawing shows 2 legs of 4; so counts use the WordNet number first and say "My picture of a X has N" only when no sense states a number.

## Latency (added per message, ms, 200 messages)
Warm (catalog loaded): mean -0.3 to +1.1 ms per group (noise level), p95 under 6 ms. Cold (first time a thing is looked up): mean +3 to +4 ms, p95 18 to 22 ms with a local catalog. Catalog cost, local files: vocab.json 860 KB parsed once in about 12 ms; all 87 shards (9.1 MB) about 150 ms in total, so one hit costs about 1 to 5 ms. Over GitHub Pages (measured once from this machine): vocab 226 ms (once), first hit 540 ms, a second hit 270 ms (two shards each, 0.5 MB total); a miss costs nothing after the vocabulary. The cold cost is therefore dominated by the network in the browser, once per thing.

## Gates
See worker-log.md (npm test, A/B, operational rules and encoder, test-world all, webchat build).
