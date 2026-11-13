# meta.worlds routing rules -> sopworld `std.route`

**What it is.** The "world of worlds": which world should read a message. Each world has a card (title, summary, what it can do, its words); `meta.worlds`
scores the message words against the cards with a prior for the live context (open tab, last world, scene keys) and returns a ranking. The symbolic router uses
it as an alternative to the encoder dispatcher, and can re-rank an encoder prediction with it.

**What moves.** The rules and the code, not the cards: the cards are generated here from each world (`scripts/build-world-cards.mjs`) and stay generated per
application.

**API.** `fn/meta-worlds.mjs`: `lemma(w)`, `messageWords(text)`, `DEFAULT_PRIOR` (`max 60, min 8, span 45`), `loadMetaWorlds(set, { lib, priorWeight })`
(builds the scorer over the loaded worlds' cards), `liveFromContext(ctx, { sceneKeys })` (the prior from the dialogue context).
`fn/symbolic-router.mjs`: `ROUTINGS` (`dispatcher`, `symbolic`, `symbolic+encoder`), `normalizeRouting`, `isSymbolic`, `createSymbolicRouter(base, getMeta)`,
`rerankPrediction(prediction, mw, context, { useEncoder })`. `sop/`: legend (the `meta.card` / `meta.rule` types), matrix, world, tests. `kb.sop` (509 lines)
is NOT copied: it holds facts about the application (cards), which stay.

**Host dependencies.** `set` of loaded worlds (a `{ get(id), list() }`), the dialogue context (tab world, last world, scene keys), an optional encoder
prediction (`{ world, score }` list). `lemma` is an English stemmer: language pack.

**Tests to carry.** `tests/meta-worlds.test.mjs`, `sop/tests.sop`, the routing evaluation (`scripts/eval-world-routing.mjs`, not copied: it drives the host).

**Host keeps.** The card generator, the generated `kb.sop` of cards, the `ROUTING` default decision (reviewer decision 2026-11-13 18:05: `symbolic+encoder`),
the encoder itself.

**General lines still in PSys2:** 407 SOP (legend 231, matrix 161, tests, world), 308 code.
