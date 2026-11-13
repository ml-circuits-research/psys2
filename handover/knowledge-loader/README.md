# knowledge-loader -> sopworld `std.knowledge`

**What it is.** The generic reading path to the knowledge worlds: the catalog (`vocab.json`: lemma -> shard ids), lazy shard loading (one request per hit,
parsed once, cached), the wire parser for shard lines, lemma candidates ("spiders" -> "spider"), fact queries (`facts.wires`, `thing()`), faces (default avatar
slots from facts), learned facts (what the user taught in the session, stored beside the catalog), a cache, and the offline bundle generator.

**API.** `fn/catalog.mjs`: `parseLine`, `parseShard`, `createFetchLoader(base)`, `createCatalog({ vocab, readShard })`. `fn/facts.mjs`: `lemmaCandidates(word)`,
`parseFact(line)`, `createFacts({ source, name })`. `fn/knowledge-lookup.mjs`: lookup of words in the knowledge worlds, a hit says only WHICH shards to load and never
decides a message's world (spec 17). `fn/faces.mjs`: `buildFaces`. `fn/learned.mjs`: `parseTeach`, `learn`, `withLearned` (facts the user taught in the session; `ABILITY_SEED` is a general list for k.attributes). `fn/knowledge-cache.mjs`, `fn/knowledge-source.mjs`
(`{ text(path) -> Promise<string|null> }`: a file reader in Node, `fetch` in a browser), `fn/bundle-loader.mjs`. `generators/build-thing-catalog.mjs`: the
build-time generator that writes the small offline subset of the catalog (today only the drawable objects, `worlds/art.draw/things.catalog.mjs`);
`generators/build-knowledge-lookup-set.mjs`: the evaluation set generator (190 questions).

**Host dependencies.** Only a `source` object. No `node:*` imports in the code (the loaders for fs are host: `src/loaders/fs-loader.mjs`, not copied).

**Gap to close in the library.** The offline bundle generator is today object-only; KNOWLEDGE-OUT step 3 asks for one generated from the catalog covering
colour names, number words, act verbs and the default face. That generator is general and belongs in the library (`tools/`), writing a per-application bundle
from a list of ids. PSys2 will write it against the library's interface once `std.knowledge` exists.

**Tests to carry.** `tests/knowledge-cache.test.mjs`, `tests/knowledge-lookup.test.mjs`, `tests/knowledge-all-worlds.test.mjs`,
`tests/art-draw-lazy-catalog.test.mjs`.

**Host keeps.** The choice of catalog base URL, the fs / bundle loaders for its server and webchat, the avatar and drawing code that consumes facts.

**General lines still in PSys2:** 931 code (catalog 105, facts 292, lookup 176, faces 92, learned 174, loaders 92), 119 generator lines.
