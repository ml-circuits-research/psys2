# 26. Summary and composition (host side of `std.summarize` and `std.compose`)

Status: host adapters, commands, world operations and UI implemented against the interface below; the generators are **not released** (sopworld 0.57 has neither), so every generated text is blocked and **the measurement is blocked**. The ask is in `handover/textgen/ASK.md`.

## Rule
No LLM, no local generator, no fallback text. Summaries and compositions come from `std.summarize` / `std.compose` through `src/dialog/textgen.mjs`. Without them the adapters are `available: false`, the UI that needs them is not shown (the Talk paragraph, the Documents buttons and form), and the commands decline plainly ("I cannot write compositions yet: the library has no composer (std.compose) in this build.").

## Interface (as implied by the reviewer's block of 2026-11-14 14:45; to be confirmed with the library)
- `summarize(world, { kind: 'turns', turns, taught, maxSentences })` and `{ kind: 'text', text, doc, maxSentences }` returns `{ text, sentences: [{ text, source }] }`. `turns` are the records of `turnRecord` (`src/dialog/conversation.mjs`); aggregation ("you drew five animals and a farm") is the library's job from the knowledge repository's discourse templates and `k.interest`.
- `compose(world, { topic | null, random, chapters, subchapters, words, seed })` returns `{ title, topic, chapters: [{ title, subchapters: [{ title, sentences: [{ text, source, world }] }] }] }`. Topic empty or "anything" = random: the library combines worlds at random and interestingly. `source` is the wire of the claim a sentence renders.
- The adapter refuses (returns null) a composition with the wrong number of chapters or subchapters, an empty or placeholder sentence, or a sentence without a source (`checkComposition`). Counts are clamped: chapters 1-12, subchapters 0-6, words 50-5000.

## Host
1. **Talk, "what you did"**: `refreshSummary` (`docs/webchat/app.mjs`) adds `paragraph` from `summarizer.turns(...)` (at most 3 sentences) above the structured list (`src/dialog/conversation.mjs` `summarize`, unchanged). No paragraph while unavailable.
2. **Act "summarise"**: `docr.digest` of docs.reader: `summarize the following: <text>` (pasted text) and `condense the document` (the open document, k sentences). The existing extractive `docr.summary` ("summarize the story", "section 2") is unchanged until the library ships; then its whole-document form should move to `std.summarize` (decision for the reviewer).
3. **Composition**: `docr.compose` with roles `topic`, `chapters`, `subchapters`, `words`. Commands (patterns in `worlds/docs.reader/patterns.extra.sop`, kinds in `lex.docs.reader.compkinds`): "write an essay about volcanoes with 3 chapters of 2 subchapters, about 600 words", "write a composition about anything", "write an essay about volcanoes", "... of 400 words". The Documents tab form (topic, chapters, subchapters, size) sends one of these commands, so the form and the command are the same path. Output is a new document (`origin: 'composed'`); `doc.provenance[sentenceIndex]` keeps the source wire and `fromOf` adds it to the answer's `from`, so "why" of a cited sentence names the wire.
4. Wiring: the engine installs the adapters in `globalThis[Symbol.for('psys2.textgen')]` when the library is loaded (`installTextGen`); the world operations (`worlds/docs.reader/textgen.mjs`) read it like the budget. The browser host creates its own adapters for the buttons (`host.textGen()`).

## Measurement plan (blocked until the library ships)
- 20 compositions (10 random, 10 with a topic): shape exact (`checkComposition`), every sentence reads back, every claim traced to a wire, repetition (repeated sentences / 4-grams), interest score (`k.interest`); attach 3 for the reviewer and the owner to read.
- Summaries: owner-log b and c replayed; the summary names every world used and every taught fact (the existing test of `summarize`) and fits in 3 sentences.
- Phrase check: the 7 command shapes above read into the right act and roles (done: `tests/textgen.test.mjs`).
