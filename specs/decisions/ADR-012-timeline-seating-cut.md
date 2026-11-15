# ADR-012 — The Timeline and Seating tabs are removed (2026-11-15)

Status: accepted (owner request, 2026-11-15; reversible: everything stays in git history; the tag `pre-tab-cut` of ADR-010 predates this cut too, no new tag).

## Decision
The **Timeline** (`plan.timeline`) and **Seating** (`plan.seating`) tabs were incomplete and did not help the demo. Removed, the same way as ADR-010:
- the worlds `worlds/plan.timeline/` and `worlds/plan.seating/` (schema, generated patterns, words, operations, templates, tests, hooks);
- the tab plugins `docs/webchat/ui/tabs/timeline.mjs` and `seating.mjs`, their places in `TAB_ORDER` (`docs/webchat/app.mjs`) and in the tab registry (`ui/tabs/index.json`, `meta.json`, written by `scripts/build-webchat.mjs`), their webchat world bundles;
- their tab names and aliases in `worlds/ui.shell` (lexicon, generated `kb.sop`), their cards in `worlds/meta.worlds/kb.sop` (regenerated), their view words in `worlds/session.things`; the dice and chips that reached them came from their own examples and went with them;
- the fixture copies of their published schemas (`tests/fixtures/w-schemas/w.seating`, `w.timeline`), `tests/timeline-time.test.mjs`, `scripts/exp-seating.mjs` (and `indicators.mjs --seating`); `scripts/exp-transfer.mjs` lost its seating and timeline columns.

Kept: Chat (Talk), Drawing, Diagram, Map, Charts, Documents (`docs.editor`), Music. Kept on purpose: the schema fixture `tests/fixtures/worlds/test.seating` (a test-only world that proves the acts x schemas machinery, spec 21; the typed-reader tests moved onto it) and the **timeline diagram kind** of `diagram.sketch` (a diagram of events in order, unrelated to the tab).

## Checks
Nothing else imported them: no `kids.*` world, no `session.things` code path beyond the view words, no typed world (`typed.json` mentions were the removed worlds' own), and `scripts/build-lang-en.mjs` reads schema worlds by directory (the removed ones are simply no longer found). Tests that used the seating plan or the timeline as a sample view now use the drawing, Talk, the avatar, the map or the fixture.

## The real set
Like ADR-010, rows that need a removed world are retired (`retired`, kept, not counted). **0 rows** of the real set (`training/eval/real-2026-11-15.jsonl`, 651 rows) were typed on the Seating or Timeline tab or judged against `plan.seating` / `plan.timeline`, and no row's shipped reply came from them, so none is retired. Their names only appeared in the generated `world_not` lists of forbid-only owner checks (`THIEVES` in `scripts/real-set.mjs`), which no longer list them. `REMOVED` in `scripts/real-set.mjs` names both tabs and worlds, so a later log row typed there is shown on the Talk tab and the ledger closes the open failure rows that name them (`real-set.mjs ledger --write`: 40 rows).
