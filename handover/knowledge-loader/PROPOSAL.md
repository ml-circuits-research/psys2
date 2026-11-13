## Q-H8 (hand-over from PSys2, 2026-11-13): the catalog and lookup loader, and an offline bundle generator, in `std.knowledge`

Question: will the library provide the catalog reader (vocab index, lazy shards, lemma candidates, fact queries, learned facts) and a generator of a small offline
bundle, so that no application parses a knowledge shard itself?
Context: PSys2's `catalog.mjs` / `facts.mjs` / `knowledge-lookup.mjs` do this today with a `source` interface; it is browser-safe and has no model. The offline
bundle is built at build time from the catalog for a list of ids (the things of the old drawings, colour names, number words, act verbs, the default face);
the catalog replaces it when reachable. The generator exists only for drawable objects.
Options: (a) `std.knowledge` = reader + `tools/build-bundle.mjs <ids...>`; (b) reader only, bundle built by each application. PSys2 prefers (a): the bundle format
should be the shard format so the reader reads both.
Related to sop-knowledge-worlds: the shard format and `vocab.json` are yours; please confirm the format is frozen enough to be read by a library module.
Blocking: no. Meanwhile: PSys2 keeps its loader.
