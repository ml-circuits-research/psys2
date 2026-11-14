# Architecture review, 2026-11-15 (overnight, host repository)

Owner request (worker-tasks.md, reviewer block 2026-11-14 23:50, "OVERNIGHT ARCHITECTURE REVIEW"): review the host architecture, list the slips and the chances to unify, fix the safe ones as we go (measured), and turn the larger ones into proposals with `[LIB]` / `[KNOW]` asks.

Scope: this repository only (`src/`, `worlds/`, `docs/webchat/*.mjs`, `docs/webchat/ui/`). `docs/webchat/lib/` is the build copy of `src/` and is not reviewed separately. Line numbers are those of commit `a8b634d9` (the review base) unless a fix below moved them.

Measurements: real set (`scripts/real-set.mjs run --reasoner matrix`, right / judged), `node src/cli.mjs test-world all` (raw failing rows / first failures per session), `npm run test:smoke`. Baseline on `a8b634d9`: **real 142 / 253** (649 turns: executed 391, refused 8, asked 28, not understood 190, other world 32), **test-world 58 / 40**, **smoke 88 / 88**.

Each item ends with a **decision**: FIXED (commit below), PROPOSAL (needs a larger change or another agent's files), `[LIB]` (asked of sopworld), `[KNOW]` (asked of the knowledge catalog), KEEP (two paths kept on purpose, with the reason).

---

## A. One world contract

The contract a world offers today is spread over: the manifest (`world.sop`: `tab*`, `ambient`, `reasoner`, `imports`, `status`), the schema and acts (`schema.sop`, `worlds/acts`), the typed world (`typed.json`, spec 16 section 13), the view effects (`ops.mjs` effects such as `draw.download`), and the renderer (`docs/webchat/ui/tabs/<tab>.mjs` with its `meta.json` row). Shared code still decides by world id in about 60 places. They fall into five groups.

### A1. Built-in tabs written in six places (the Documents tab)
`docs.editor` declares no `tab=` in its manifest, so every consumer of "which tab is this world's" keeps its own table:
- `src/dialog/index.mjs:231` `BUILTIN_TAB = { 'docs.editor': 'editor' }` and `:500` `BUILTIN = { robot, avatar, editor, documents }` (tab -> world).
- `src/dialog/discourse.mjs:34` `BUILTIN_TAB = { 'docs.editor': 'editor' }`.
- `src/astra/session.mjs:10` `BUILTIN_TAB = { 'ui.avatar': 'robot', 'docs.editor': 'editor' }` (still names the avatar, which is not a tab since the tab cut: `docs/webchat/app.mjs:39`).
- `src/formalizer/routing.mjs:72` `BUILTIN_TAB_WORLDS = { 'ui.avatar': ['avatar', 'robot'], 'docs.editor': ['editor', 'document', 'doc'] }`.
- `docs/webchat/ui/engine-worker.mjs:362` `({ 'docs.editor': 'editor' })[id]`.
- and the tab is also declared where it belongs: `worlds/ui.shell/ops.mjs:11-17` (`TABS.editor`, `TAB_OF_WORD`), `docs/webchat/ui/tabs/meta.json` (`editor` -> `docs.editor`).

**Decision:** FIXED in part (one constant, `BUILTIN_TAB` of `src/worlds/index.mjs`, used by the engine, the discourse, ASTRA and the worker; the stale `ui.avatar: 'robot'` of ASTRA dropped). PROPOSAL for the rest: `docs.editor` declares `tab=editor tabTitle="Documents" tabAlias=document ...` in its manifest like every other tool world, `worlds/ui.shell/ops.mjs` drops its hand-written `editor` row (it merges manifest tabs already, `refresh`, line 30), `scripts/gen-ui-kb.mjs` regenerates, and `BUILTIN_TAB` / `BUILTIN_TAB_WORLDS` disappear. Not done tonight: it changes the ui.shell knowledge base and the routing tables (another agent is working in `routing.mjs`).

### A2. World roles written as ad-hoc id sets
"Infrastructure" worlds (the shell, help, small talk, the core vocabulary, the session worlds) are excluded or included by hand-written sets that do not agree:

| Where | Set | Members |
| --- | --- | --- |
| `src/astra/registry.mjs:13` | `USER_SCOPE` | ui.shell, ui.help, kids.common, core, lang.common |
| `src/dialog/discourse.mjs:29` | `NO_FRAME` | ui.shell, kids.common, core |
| `src/dialog/discourse.mjs:32` | `NO_TOPIC` | ui.shell, ui.help, kids.common, core |
| `src/dialog/index.mjs:1048`, `:1099` | `SKIP` | ui.shell, ui.help, core, lang.common |
| `src/dialog/index.mjs:547` | (inline) | ui.shell, kids.common |
| `src/dialog/index.mjs:914`, `:917`, `:965`, `:1141`, `:1682` | (inline) | ui.shell (and ui.help) |
| `src/dialog/dialogue.mjs:451` | (inline) | ui.shell, ui.help, kids.common, core, session.* |
| `src/dialog/conversation.mjs:17`, `:70` | `SHARED` | session.things, ui.shell, ui.help, kids.common |
| `src/dialog/meta-worlds.mjs:221`, `src/dialog/scene-referents.mjs:76` | (inline) | ui.shell |
| `src/formalizer/routing.mjs:160`, `:256` | (inline) | ui.shell, ui.help |
| `src/dialog/variants.mjs:90` | (inline) | lang.common, kids.common (shared lexicons) |

**Decision:** PROPOSAL. A manifest key `role=` with a closed set (`shell`, `help`, `vocabulary`, `smalltalk`, `session`, `tool`), one helper `worldRole(set, id)` in `src/worlds/index.mjs`, and each set above derived from roles (for example `NO_TOPIC = role in {shell, help, smalltalk, vocabulary}`). The kids → general migration (another agent) renames `kids.common`; doing the roles first would make that rename a manifest edit instead of eleven code edits. To be done after that migration lands.

### A3. Behaviour of one world written into shared code
- `src/formalizer/rules/index.mjs:475-480` and `src/dialog/dispatch-validate.mjs:230`: "your ..." belongs to `ui.avatar` (a reading of another world with a `you` target is dropped). This is the avatar's claim on second-person targets; it should be a world property (`ambient=true` worlds own `you` targets: `worlds/ui.avatar/world.sop:8` already says `ambient=true`) or the world's `accepts` hook (spec 21 DECLINE), not an id test.
- `src/formalizer/completeness.mjs:40` `CATALOG_WORLDS = new Set(['art.draw', 'talk'])`: the comment itself says these are the `catalog=yes` cards of `meta.worlds`; read the cards.
- `src/dialog/index.mjs:223` `SOUND_ALIKES = { 'art.draw': { sare: 'soare', ... } }`: Romanian speech confusions keyed by a world id inside the English core. It belongs in the translation boundary (`src/translate/`), keyed by the words the tab's world knows, not by its id. (The tic-tac-toe "x și zero" rewrite of the same function was dead since the tab cut: FIXED, see below.)
- `src/dialog/dialogue.mjs:453`: the session facts read `st['geo.map'].shown/places/pins` directly. A world should expose its places through a view hook (`facts()` / `referents`), not by its state layout.
- `src/formalizer/best-effort.mjs:125` adds `'robot', 'avatar'` to every world's topic words.
- `src/interpreter/index.mjs:351` (`ui.openTab` and `noTabFollow` except for ui.shell) and `:374` (the `*worlds` miss only for ui.help).

**Decision:** PROPOSAL for each (each changes reading or routing; the first two are in files another agent is changing tonight). `[KNOW]` none. Ask recorded for the avatar claim as a contract item: "an ambient world owns second-person targets" (spec 21).

### A4. The page host knows worlds by id
- `docs/webchat/app.mjs:42` the Documents tab is created from a hard-coded `TABS` row (all other tabs come from `ui/tabs/meta.json`), `:509`, `:527` (`docs.editor` state for dictation), `:525`, `:1951`, `:1958` (`ui.avatar`), `:1185`, `:1190`, `:1193`, `:1998` (`'talk'` as the chat's examples), `:1195` (`it.tab !== 'robot'`).
- `docs/webchat/ui/engine-worker.mjs:35` `DEFAULT_DICE_WORLD = 'art.draw'`.

**Decision:** PROPOSAL. The renderer contract (`ui/tabs/<id>.mjs` exports `{ id, label, world, make, effects }`) covers every tab but the editor and the avatar; making the editor a plugin like the others, the avatar a "view" plugin (`VIEWS` of `worlds/ui.shell/ops.mjs:19` already models it), and the dice world a manifest flag (`dice=default`) leaves the page with no world id at all.

### A5. Inert game plumbing (ADR-010 "candidates for a later cut")
No world has had `tabKind=game` since the tab cut, so the idle-game veto (`no-game`), the host's game ordering of readings, the yes/no and "why?" game branches of the discourse could not fire.

**Decision:** FIXED for `src/dialog` (see fixes). PROPOSAL for the rest: the game-tab rules of `src/formalizer/routing.mjs:135-160` (`GAME_CONTROL_ACTIONS`, `isGameControl`) and `rules/index.mjs`, the game controls of `worlds/ui.shell` (`GAME_ACTIONS`, patterns), `gameWorld` in `DialogSession.context()` (`src/dialog/index.mjs:505`, always null), `tabKind=game` / `gameControls` in `src/worlds/index.mjs`, the reply rows of removed worlds in `src/translate/replies.en-ro.mjs` (22 mentions) and `phrases.ro-en.mjs:286`, the removed worlds' rows in `worlds/meta.worlds/kb.sop`, `worlds/ui.help/lexicon.sop`. They are in files of the routing and Romanian-reply agents tonight.

---

## B. Host code that duplicates sopworld

The vendored library (`src/vendor/sopworld/sopworld.mjs`, 0.117 line) now exports most of what the `[LIB]` thinning audit of questions.md asked for (LIB-1 to LIB-8 are all present: `joinList`, `clauseOf`, `actSentence`, `renderFrames`, `genreOf`, `topicIndex`, `randomTopics`, `typedWorldOf`, `readRolesByTypes`, `assignBySlotTypes`, `judgeReply`, `tabulate`, `tableText`). The host has switched `src/lang/en-generate.mjs` and `src/dialog/textgen.mjs` to them; the following still keep their own copy:

| Host | Library | Same behaviour? | Decision |
| --- | --- | --- | --- |
| `src/dialog/compose-world.mjs:26` `topicIndex`, `:34` `randomTopics` | `topicIndex`, `randomTopics` (LIB-5) | No: the host's index is animals + countries by name; the library's is every named thing with at least 2 facts, ordered by facts | PROPOSAL: switch with `types: ['k.animals.animal', 'k.geo.country'], min: 0` and measure the essay topics (textgen tests) |
| `src/dialog/typed-reader.mjs:24` `typedWorldOf`, `:61` `proposeByTypes` | `typedWorldOf`, `readRolesByTypes` (LIB-6) | The library's is the role re-reading the audit described; the host still rebuilds it | PROPOSAL: switch, test `tests/typed-reader.test.mjs` |
| `src/dialog/variants.mjs:63` `assignments`, `:83` `bySlotTypes` | `assignBySlotTypes` (LIB-7) | Yes by the audit's own description | PROPOSAL: switch, tests `variants`, `reading-variants` |
| `scripts/lib/cousins-host.mjs` `judge`, `tabulate`, `tableText` | `judgeReply`, `tabulate`, `tableText` (LIB-8) | Yes | PROPOSAL (scripts only, no runtime effect) |
| `src/dialog/knowledge-lookup.mjs:20-21` `article`, `list`; `src/dialog/discourse.mjs:862` `list`; `src/dialog/world-aware.mjs:100` `plural`; `docs/webchat/ui/state-diff.mjs:25` `plural`; `docs/webchat/ui/tabs/draw.mjs:81` `plural` | `articleFor`, `joinList`, `inflectBy` (via `src/lang/en-generate.mjs`) | Yes for `list`; `plural`/`article` hand rules are weaker (no irregulars) | PROPOSAL: route through `englishOf` (`src/lang/en-generate.mjs`); synchronous callers need the language world loaded first |
| Singular / plural rules written by hand: about 45 copies (`src/dialog/meta-worlds.mjs:31` `lemma`, `src/formalizer/rules/lemma.mjs:12` `pluralize`, `src/knowledge/facts.mjs:33`, `src/knowledge/catalog.mjs:72`, `src/knowledge/animals.mjs:53`, `src/knowledge/diagram-world.mjs:73`, `src/plan/host.mjs:50`, `src/dialog/dialogue.mjs:425`, `src/dialog/meta.mjs:88`, `src/dialog/variants.mjs:175`, `src/formalizer/rules/variants.mjs:32`, `src/translate/inflect.en.mjs:15`, and in worlds: `talk/ops.mjs:44`, `talk/records.mjs:25`, `session.things/view.mjs:13`, `session.things/things.mjs:98`, `art.draw/plan.mjs:15`, `art.draw/scene.mjs:398`, `art.draw/engine.mjs:118`, `diagram.sketch/engine.mjs:609`, `data.charts/chart.mjs:85`, `:330`, `data.charts/hooks.mjs:22`, `geo.map/hooks.mjs:28`, `:64`, `space/pieces.mjs:20`, `ui.help/ops.mjs:155`, `ui.avatar/facelogic.mjs:36`, `docs.editor/hooks.mjs:16`, `docs.editor/editor.mjs:448`, `kids.*/ops.mjs`, and the identical pluralizer at line 16 of ten `datagen.mjs` files) | `src/lang/en.mjs` `singular(w, set)` reads the catalog's morphology facts; the library has `inflectBy`, `morphOf`, `analyse` | No: the copies disagree ("bus" -> "bu" in four of them; "glass" kept in some) | PROPOSAL: one `en.singular(w)` / `en.plural(w)` from the facts for every host and world module (worlds already import `src/lang/en.mjs`); `[LIB]` none needed. A behaviour change per world: one commit per world with test-world |
| Ellipsis and coordination (`src/lang/en.mjs` `sharedArgument`, `ellipsisPrefixes`, `oneAnaphora`) | `resolveEllipsis`, `segment` | Partly | KEEP until the library reads the catalog grammar whole (questions.md, np-resolve note) |
| Rankers: `src/formalizer/routing.mjs` tiers, `src/dialog/meta-worlds.mjs` `route`, `world-aware.mjs` order | `rank`, `arbitrate`, `choose` (already the world chooser, `src/dialog/index.mjs:1814`) | The tiers are host policy (ADR-004) | KEEP the tiers; the coverage arbitration is the library's already |

---

## C. Host data that duplicates the catalog

- **Function-word, filler and question-word lists**: about 30 hand-written sets in host and worlds (`src/formalizer/spell.mjs:19` `FUNCTION_WORDS`, `src/formalizer/rules/session.mjs:11` `STOP_WORDS`, `src/dialog/world-aware.mjs:42` `FILLER`, `src/formalizer/rules/normalize.mjs:101-102` fillers, `src/formalizer/best-effort.mjs:20`, `src/dialog/value-check.mjs:32`, `src/dialog/word-reader.mjs:14`, `src/dialog/typed-reader.mjs:20`, `src/dialog/index.mjs:1050`, `src/dialog/sampler.mjs:11`, `src/knowledge/diagram-world.mjs:72`, `src/astra/focus.mjs:10`, `src/translate/index.mjs:28`, `worlds/space/space.mjs:788`, `worlds/art.draw/engine.mjs:1025`, `worlds/data.charts/chart.mjs:194`, `worlds/ui.help/ops.mjs:150`, `worlds/diagram.sketch/engine/logic.mjs:1984`, `:1997`, `docs/webchat/ui/speech.mjs:17`; question words three times: `src/formalizer/partial.mjs:17`, `src/dialog/meta-worlds.mjs:42`, `src/formalizer/completeness.mjs:30`). `src/lang/en.mjs` already reads determiners, pronouns, auxiliaries and question words from `w.lang.en` (`words(type, view)`, `questionWords(view)`), and `worlds/ui.avatar/facelogic.mjs:27` shows the pattern. **Decision:** PROPOSAL (move each list to `en.words(type, view)`); `[KNOW]` the catalog has no class of ignorable words (politeness, desire, hesitation, chat fillers): `src/lang/en.local.mjs` header already records this ask (`fn`). Restated in questions.md.
- **`src/lang/en.local.mjs`** (61 KB): the frames and words the catalog does not have yet, each a `[KNOW]` queue entry by its own header. **Decision:** KEEP (it is the declared queue), re-check against each catalog refresh.
- **Bundled catalog subsets** (`src/knowledge/bundled-*.mjs`, 1.3 MB; `worlds/art.draw/things.catalog.mjs`, 55 KB): generated from the catalog by one command each, not hand copies. **Decision:** KEEP; they are the offline/first-paint copy. The talk world reads the drawing world's `THINGS` (`worlds/talk/ops.mjs:2`), a world-to-world data import that the contract should express as a knowledge lookup.
- **`src/translate/lexicon.ro-en.mjs`, `phrases*.ro-en.mjs`** (88 KB hand-written Romanian) next to `src/lang/ro.facts.generated.mjs` / `ro.unimorph.generated.mjs` (195 KB from `w.lang.ro`): two Romanian lexicons. **Decision:** PROPOSAL tied to D3.
- **Dead host data:** `NUMBER_WORDS_EN` (`src/translate/inflect.en.mjs`, a copy of the k.values number words, used by nobody): FIXED (removed).

---

## D. Two paths for one job

| Job | Paths | Default | Measurement | Decision |
| --- | --- | --- | --- | --- |
| D1. Execution | `ops` interpreter vs `matrix` reasoner (`src/dialog/index.mjs:1810`) | matrix (user decision 2026-11-11, spec 15) | real set and test-world are measured on matrix only since 2026-11-14; `ops` keeps a result file (`training/results/real-2026-11-15-ops.json`, stale) | PROPOSAL: name `ops` a diagnostic (`--reasoner ops`) and stop maintaining its result file; deleting it needs every world to answer through the matrix (11 of 28 manifests say `reasoner=matrix`, the others run their operations under the matrix reasoner's fallback) |
| D2. Voices of an unread clause | ensemble (`readEnsemble`) vs the sequence (`src/dialog/variants.mjs:276-294`, `PSYS2_ENSEMBLE=off`) | ensemble ("holds everywhere", worker-log typed-worlds entry) | the sequence runs only when the library import fails (`src/dialog/index.mjs:1449`) or the switch is off | KEEP as the named diagnostic `PSYS2_ENSEMBLE=off` (used by eval-ablation) |
| D3. Romanian | rules translator (`src/translate/ro-en.mjs` 1,730 lines + lexicon) vs the on-device model (Bergamot) vs the grammar voice (`voice-ro.mjs`, setting `roGrammar`, off) | rules + model | Q13 round 4: the voice changes 0 of 291 real Romanian turns; the model fixes 17 and breaks 11 | PROPOSAL: the grammar voice stays a diagnostic (no UI row, already so); the rules translator and `w.lang.ro` converge on one lexicon (the generated one), the hand lexicon keeps only what the catalog lacks, as `en.local.mjs` does for English (`[KNOW]` per missing entry) |
| D4. Reading | world patterns (`patterns.sop`) vs generated frames (`schema.sop` + `w.lang.en` frames, `scripts/build-schema-world.mjs`) | both, per world | typed worlds measured (spec 16 section 13) | PROPOSAL: the catch-all patterns (`arg.pre` / `arg.post` / `arg.text`) are being made last-resort readings by the owner-export agent; after that, a world's hand patterns that a generated frame reads identically are deleted (the generator already reports frame ids per world) |
| D5. Completeness signal | typed (`unreadBy`) vs heuristic (`PSYS2_COMPLETE_SRC=heuristic`, `PSYS2_COMPLETE_FOREIGN=1`) | typed | heuristic measured worse (test-world 61 -> 83 hold) | PROPOSAL: delete the heuristic branch of `src/formalizer/completeness.mjs` and both switches (another agent is in that file tonight) |
| D6. Reader route | `PSYS2_READER=fill/choose` (`src/dialog/reader-route.mjs`, 383 lines, plus `describe.sop` loading in `src/worlds/index.mjs:26`) vs the rules | off | spec 03 line 452: `fill` loses 2 dialogue turns and 10 typos; the browser never sets it | PROPOSAL: delete, or keep as a diagnostic with a dated measurement; decision for the owner (it is the only path that reads `describe.sop`) |

---

## E. Every PSYS2_* switch

Runtime switches (read by `src/` or the browser host):

| Switch | Default | Where | Measurement behind the default | Decision |
| --- | --- | --- | --- | --- |
| `PSYS2_REASONER` | matrix | `src/dialog/index.mjs:1810` | spec 15, user decision 2026-11-11 | KEEP (D1) |
| `PSYS2_WORLD_AWARE` | veto | `src/dialog/index.mjs:286` | spec 16 section 6 (gate: 0 new wrong) | KEEP |
| `PSYS2_WA_KINDS` | (unset: `VETO_KINDS`) | `src/dialog/world-aware.mjs:35` | experiments only | KEEP as diagnostic; `no-game` removed from `VETO_KINDS` (FIXED) |
| `PSYS2_READER` | off | `src/dialog/index.mjs:288`, `src/worlds/index.mjs:26` | spec 03:452, negative | PROPOSAL delete (D6) |
| `PSYS2_TYPED` | on (`off` skips) | `src/dialog/index.mjs:788` | worker-log 2183: identical on paraphrases/typos, helps refused readings | KEEP as A/B switch |
| `PSYS2_ENSEMBLE` | on | `src/dialog/variants.mjs:261` | typed-worlds entry: holds everywhere | KEEP as diagnostic (D2) |
| `PSYS2_ALTERNATIONS`, `PSYS2_NEAR`, `PSYS2_SLOTS` | on | `src/dialog/variants.mjs:231-233` | worker-log 2196 (variants 5/5; fork check) | KEEP as ablation switches (eval-ablation voices) |
| `PSYS2_RUNON` | on (when completeness is on) | `src/dialog/variants.mjs:234` | **none recorded** | PROPOSAL: measure off / on on the real set and test-world once, record it in spec 16 section 12 |
| `PSYS2_FORMOPS` (+ `_FILE`, `_ALL`, `_CATALOG` in scripts) | off | `src/dialog/variants.mjs:229` | worker-log 2337: +2 right on the training third, 0 on held-out, one new wrong | KEEP as diagnostic (the browser has no typed operators) |
| `PSYS2_CANON` | off | `src/dialog/variants.mjs:230` | worker-log 2339: no change anywhere (14/85, 2/1165, 60/60) | KEEP only as the `v-canon` voice of eval-ablation / measure-voices; candidate for deletion with that voice |
| `PSYS2_COMPLETE` | hold | `src/formalizer/completeness.mjs:19` | typed-worlds entry: real holds, +5 diagram rows; `ask` +8 test-world rows | KEEP |
| `PSYS2_COMPLETE_SRC` | typed | `src/formalizer/completeness.mjs:25` | heuristic measured worse | PROPOSAL delete with the heuristic (D5) |
| `PSYS2_COMPLETE_FOREIGN` | off | `src/formalizer/completeness.mjs:42` | worker-log 2412: no row changed | PROPOSAL delete (D5) |
| `PSYS2_KNOWLEDGE` | unset | `src/loaders/knowledge-source.mjs:7` | location, not a behaviour | KEEP |
| `PSYS2_PILOT_ROOTS` | unset | `src/loaders/fs-loader.mjs:15` | pilot worlds (spec 21) | KEEP |
| `PSYS2_DEBUG_OPS` | unset | `src/interpreter/index.mjs:274` | debug print | KEEP (also `DBG_UNREAD` in completeness.mjs, not prefixed: rename to `PSYS2_DEBUG_UNREAD` with D5) |

Test and script plumbing (never read by the runtime; all live): `PSYS2_SUITE`, `PSYS2_SAMPLE_SEED`, `PSYS2_CHANGED_WORLDS`, `PSYS2_FAILURES_OUT`, `PSYS2_KNOWN_FAILURES`, `PSYS2_NET_LOG` (run-tests), `PSYS2_EVAL_DIR`, `PSYS2_HELDOUT_DIR` (freeze-heldout tests), `PSYS2_MT_CACHE`, `PSYS2_MT_NETWORK` (Chrome/MT tests), `PSYS2_ORT` (regression-note), `PSYS2_T1_ROOTS` (exp-transfer). None dead.

No runtime switch is unread; the dead ones are the two completeness experiment switches and the reader route, all proposals above.

---

## F. What another application must copy to use the worlds (host kit)

What a host needs today to load the worlds and answer a turn, by the static import closure of `src/dialog/index.mjs` + `src/loaders/fs-loader.mjs`: **96 files, 34,356 lines**, of which 14,999 are the vendored library and **19,357 are host code**: `src/dialog` 23 files / 6,709 lines, `src/formalizer` 26 / 5,238, `src/knowledge` 19 / 1,596, `src/reasoner` 2 / 1,581, `src/interpreter` 4 / 1,087, `src/astra` 7 / 822, `src/worlds` 4 / 780, `src/lang` 4 / 546, `src/legends`, `src/translate` (2), `src/soplang`, `src/plan`, `src/loaders`. Plus the bundled catalog subsets (1.3 MB) and the language facts (`src/lang/*.generated.mjs`, 620 KB).

Worse, the worlds are not self-contained: world modules import host internals directly (`grep "from '../../src/"`): `src/knowledge/values.mjs` (10 imports), `src/vendor/sopworld` (4), `src/lang/en.mjs` (3), `src/knowledge/animals.mjs` (3), `np-resolve`, `open-words`, `diagram-world`, `commonsense`, `bundled-geo` (2 each), `plan/host`, `time`, `learned`, `catalog`, `arrangement`, `en.facts.generated` (1 each), from 11 worlds. Another application must therefore copy `src/knowledge` and `src/lang` even to load one world.

**Proposal: the host kit, `[LIB]`.** What belongs in the library (general over any world set) and what stays the application's:

| Kit part | Today | Goes to |
| --- | --- | --- |
| Load a world set: SOP parse, legends, manifests, patterns, schema, typed world | `src/soplang`, `src/legends`, `src/worlds`, `src/formalizer/typed-world.mjs` | `[LIB]` `loadWorldSet(loader)`: the library already parses SOP and builds typed worlds (`typedWorldFor`, `schemaOf`) |
| Read a turn: rules matcher, routing by tiers, completeness, voices | `src/formalizer/rules/*`, `routing.mjs`, `completeness.mjs`, `src/dialog/variants.mjs` | `[LIB]` `readTurn(set, text, context)` with the tier policy as data (ADR-004's tiers as a table, not code); the voices already are the library's (`readEnsemble`, `normalise`, `nearWords`, `assignBySlotTypes`) |
| Execute: interpreter envelopes, matrix reasoner sessions | `src/interpreter`, `src/reasoner` | `[LIB]` the matrix half is the library's (`World`, `score`, `veto`); the host keeps the envelope of `ops.mjs` effects |
| Session: undo/redo timeline, pending question / fill, ellipsis, discussions | `src/dialog/discourse.mjs` (1,299 lines), `dialogue.mjs`, `src/astra` | `[LIB]` `turnFlow` / `dialogueTurn` / `focusLog` exist; the timeline and pending-fill are general and should move |
| Values and language readers worlds call | `src/knowledge/values.mjs`, `src/lang/en.mjs` | a **world-facing API** passed in the operation context (`ctx.values`, `ctx.lang`) instead of a relative import into the host: then a world is copyable on its own |
| Renderers, settings, speech, translation backends, the page | `docs/webchat/` | stays the application's |

The library's own review (finding 29) found that its compat suite pins PSys2 `45ac4bf`, which imports nothing from sopworld: the library has no test of the surface a host actually calls. The kit is also that surface (see the addendum).

First step, possible in this repository without the library: pass `values`, `lang` and `knowledge` to world operations through `ctx` (the interpreter builds `ctx` already, `src/interpreter/index.mjs:383`) and remove the `../../src/` imports from worlds one world at a time. Then a world directory plus the kit is enough to run it.

---

## Fixes made tonight (measured)

| Commit | What | Real set (right / judged) | test-world (raw / first) | smoke |
| --- | --- | --- | --- | --- |
| baseline `a8b634d9` | | 142 / 253 | 58 / 40 | 88 / 88 |
| `4e6b574b` (+ rebuild `de8dd8b5`) | 9 unused exports removed (`canonicalOf`, `foldText`, `loadLegends`, `stepLabel`, `nameEntry`, `lexiconStats`, `NUMBER_WORDS_EN`, `arrangementFrom`, `wiresToSop`) | 142 / 253 | 58 / 40 | 88 / 88 |
| `24d6df7a` (+ rebuild `10eb5a72`) | inert game plumbing of `src/dialog` removed (A5): `no-game` veto, game ordering, discourse/dialogue game branches, "x și zero" sound-alike; spec 16 and ADR-010 updated (-58 lines) | 142 / 253 | 58 / 40 | 88 / 88 |
| `fdc38130` (+ rebuild `0a7eb3b4`) | one `BUILTIN_TAB` / `tabOfWorld` in `src/worlds/index.mjs` (A1); ASTRA's stale `ui.avatar: 'robot'` dropped; the worker reads the page's tab plugins instead of a world id | 142 / 253 | 58 / 40 | 88 / 88 |

The real set is not fully deterministic: 13-14 rows (songs and "random" diagrams, r0228-r0243, r0548-r0553) change their reply text between any two runs on the same code; no verdict changed in any run. Targeted test files touched by the fixes (dialogue, world-aware, discourse, dialogues, astra-session) have the same pre-existing failures before and after (10, 3, 3, 1, 1).

---

## Addendum: the library review's findings that touch the host (reviewer block 2026-11-15 00:20, item 4)

Source: `reviews/architecture-review-2026-11-15-reviewer.md` of soplang-words-lib (origin/main `7955c4f`).

- **"random" in std.acts picks the first value (library finding 2: the float LCG of `std.mjs` `valuesFor`, vendor line 5758).** Do we rely on it? No runtime path of ours reaches std.acts "random" / "different": no pattern or generated frame emits a random value (`grep value=random worlds/`: none); art.draw's random scene (`worlds/art.draw/engine.mjs:277`) and compose's random topics (`src/dialog/compose-world.mjs:37`) use `Math.imul`, which is exact; the dice use the library's `sample` (mulberry32). Scripts with an inexact LCG: `scripts/eval-nx.mjs:73`, `:90` (`h * 1103515245` above 2^53; evaluation sampling only). The other host LCGs multiply by 1664525 (< 2^21) and stay exact.
  The symptom exists anyway, from another cause: probed 8 times in one session, "Change the circle to a random colour." answers "The circle is red." every time and "Give the dog a random colour." "The dog is brown." every time; "Make the house a random colour." answers "I don't know how to draw a colour yet."; "Make them different colours." "I don't know how to draw colors yet." The first reading is the catch-all `pat.art.draw.ask.attr.short` with `thing = "Change the circle to a random"`: a question about the current colour, not a change. This is the catch-all theft class the owner-export agent is fixing (`arg.*` leftovers marked complete); after it, "random / different <attribute>" needs a change frame with `value=random` and the library's fixed generator. "Draw something random." in fresh sessions gives the same sunny scene 4 of 6 times: the art.draw seed is part of the state ("pictures are reproducible"), so a fresh session repeats; a seed from the session start would vary it. Recorded, not changed.
- **Stale caches after `revise` (library finding 1).** Host caches that wrap library objects: `src/formalizer/typed-world.mjs:49-63` rebuilds a typed World per signature of the session's things (never revised: safe); `targetsOf` is keyed by the pattern object (static); the key maps of `src/reasoner/index.mjs:68-204` are schema-level (static); `src/dialog/compose-world.mjs` and `src/knowledge/diagram-world.mjs` keep bundled worlds told once at build (static); `src/dialog/variants.mjs:179` adds sense wires to a per-call world (its size changes, so a size-keyed cache rebuilds). No host cache goes stale. The exposure is inside the library, on the reasoner's live instances after a `std.acts` change; the library-side fix (`world.version` keys) covers us.
- **The pinned compat PSys2 commit imports nothing from sopworld (library finding 29).** For F: the library's compat suite replays our kids dialogues on PSys2 `45ac4bf`, which predates our use of the library, so nothing in the library's tests exercises the surface we call (`readEnsemble`, `typedWorldFor`, `score`, `sample`, `compose`, ...). The host kit would give the library a real consumer surface to test; until then the compat pin should move to a commit that vendors sopworld.
