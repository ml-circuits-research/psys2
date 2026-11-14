# Asks to sopworld and the knowledge repository for composition (std.compose 0.64+ is wired; std.summarize 0.61 too)

Spec: `specs/26-summary-and-composition.md`. The host adapters are `src/dialog/textgen.mjs`; they take `summarize` / `compose` (or `std.summarize` / `std.compose`) from the module and are unavailable without them.

`std.summarize` is in 0.61 (`summarizeLog` frames, `summarizeText` extractive) and used as is; host notes in spec 26. Two requests: `parentOf` kinds from the catalog for the host's entries, and a frame renderer in the language world (the host's `renderFrames` is a temporary verb table).

`compose(world, { type: 'essay' | 'scientific-article' | 'presentation' | 'story' | 'report', topic | null, random, chapters, subchapters, words, seed })` -> `{ title, topic, type, procedure, chapters: [{ title, subchapters: [{ title, sentences: [{ text, source, world }] }] }] }`
- Topic empty = random, combining worlds at random and interestingly (`k.interest`, discourse templates from the knowledge repository). Exact chapter and subchapter counts, about `words` words, seedable.
- Every sentence reads back to its claim and carries `source` (the wire); a sentence without a source is refused by the host.
- Open question: which `world` the host passes (the composite of the worlds used in the session is proposed; today the host passes null).
- Document type: the type's procedure and style come from knowledge (`k.genres`, `k.story`, `k.procedures` composition methods); the host passes only the type word and counts (unset counts = the type's defaults, the library's choice). `procedure` is the wire of the method used and is required (the host refuses a result without it, and one of another `type`). A random story is a story built by the story method, not free random.

## After wiring the real `std.compose` (2026-11-14)
- Knowledge: `k.genres.genre` for scientific article, presentation, story (with `k.story`), report (names the host will look for: `scientific_article` / `scientific-article`, `presentation`, `story`, `report`); today the catalog has none, so those types are declined.
- Knowledge: facts beyond k.animals (k.geo places, k.objects, ...) for topics such as volcanoes, the moon, bees; the host has only the animal facts bundled, and a topic with no fact is declined ("I know nothing about X").
- Library: a frame renderer in the language world (the host's `realiseFrame` is a temporary clause-per-attribute table for animal facts); sentences per section from a word budget; `short` as data rather than text.
