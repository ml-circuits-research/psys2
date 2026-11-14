# Ask to sopworld: `std.summarize` and `std.compose`

Spec: `specs/26-summary-and-composition.md`. The host adapters are `src/dialog/textgen.mjs`; they take `summarize` / `compose` (or `std.summarize` / `std.compose`) from the module and are unavailable without them.

`summarize(world, { kind: 'turns' | 'text', turns, taught, text, doc, maxSentences })` -> `{ text, sentences: [{ text, source }] }`
- `turns`: records `{ n, text, tab, outcome, worlds, answer, asked, pending }`; the paragraph aggregates ("You drew five animals and a farm, seated six guests; you taught me that a hamster is a pet; one request was not understood."), names every world used and every taught fact, at most `maxSentences`.

`compose(world, { type: 'essay' | 'scientific-article' | 'presentation' | 'story' | 'report', topic | null, random, chapters, subchapters, words, seed })` -> `{ title, topic, type, procedure, chapters: [{ title, subchapters: [{ title, sentences: [{ text, source, world }] }] }] }`
- Topic empty = random, combining worlds at random and interestingly (`k.interest`, discourse templates from the knowledge repository). Exact chapter and subchapter counts, about `words` words, seedable.
- Every sentence reads back to its claim and carries `source` (the wire); a sentence without a source is refused by the host.
- Open question: which `world` the host passes (the composite of the worlds used in the session is proposed; today the host passes null).
- Document type: the type's procedure and style come from knowledge (`k.genres`, `k.story`, `k.procedures` composition methods); the host passes only the type word and counts (unset counts = the type's defaults, the library's choice). `procedure` is the wire of the method used and is required (the host refuses a result without it, and one of another `type`). A random story is a story built by the story method, not free random.
