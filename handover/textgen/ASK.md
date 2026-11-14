# Ask to sopworld: `std.summarize` and `std.compose`

Spec: `specs/26-summary-and-composition.md`. The host adapters are `src/dialog/textgen.mjs`; they take `summarize` / `compose` (or `std.summarize` / `std.compose`) from the module and are unavailable without them.

`summarize(world, { kind: 'turns' | 'text', turns, taught, text, doc, maxSentences })` -> `{ text, sentences: [{ text, source }] }`
- `turns`: records `{ n, text, tab, outcome, worlds, answer, asked, pending }`; the paragraph aggregates ("You drew five animals and a farm, seated six guests; you taught me that a hamster is a pet; one request was not understood."), names every world used and every taught fact, at most `maxSentences`.

`compose(world, { topic | null, random, chapters, subchapters, words, seed })` -> `{ title, topic, chapters: [{ title, subchapters: [{ title, sentences: [{ text, source, world }] }] }] }`
- Topic empty = random, combining worlds at random and interestingly (`k.interest`, discourse templates from the knowledge repository). Exact chapter and subchapter counts, about `words` words, seedable.
- Every sentence reads back to its claim and carries `source` (the wire); a sentence without a source is refused by the host.
- Open question: which `world` the host passes (the composite of the worlds used in the session is proposed; today the host passes null).
