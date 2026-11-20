# JavaScript generality audit of the runtime path

Date: 2026-11-20. Scope: every JavaScript module that a chat turn or a UI action can run in the PSys2 web demo. Machine-readable source of truth: `src/dialog/runtime-component-registry.mjs` (one entry per module, grouped into the components the Worlds map shows). `tests/worlds-component-registry-declared-host.test.mjs` keeps this list complete. The stewardship procedure is in `specs/worlds-inspector.md`.

## Method

1. **Reachability.** The registry test walks the real module graph. It starts from `docs/webchat/app.mjs`, `docs/webchat/ui/engine-worker.mjs`, the tab modules (`docs/webchat/ui/tabs/index.json`) and the declared world runtime modules (`runtimeModules`, `nativeHost`, `nativeInitializer`). It follows static and dynamic imports, including `vurl`, `imp`, `host.asset` and `new URL(...)`, and maps `lib/X` to `src/X`. Result: **333 modules in 53 components** (332 at the time of the audit; `docs/webchat/ui/tabs/diagram/tools.mjs` was added by the Diagram work the same day, caught by the registry test, and registered as generic).
2. **Classification.** Every module was read and classified, with file:line evidence:
   - **generic**: parsing, transport, rendering primitives, solver plumbing or storage;
   - **domain-logic**: per-area or per-kind branches, hardcoded words, kinds, world ids, thresholds, orderings, heuristics or fallbacks that choose a result;
   - **data**: tables;
   - **sop-carrier**: JavaScript that only exports SOP text.

   Each module also records its **hidden behaviour**: anything that can change a result without appearing in the trace or as a world-activity event.
3. **Execution measurement.** `scripts/worlds-runtime-coverage.mjs` takes V8 precise coverage in the page and the engine worker during 9 real turns. The run used the published build at HEAD `bdf6cb06`, with these turns:
   - Diagram: "add a circle and a square", "connect the circle to the square";
   - Drawing: "draw a house", "put a sun above the house", "make it bigger", "undo";
   - Calendar: "add a meeting tomorrow at 10";
   - Documents: "write a title about cats";
   - Avatar: "smile".

   4 of the 9 turns succeeded; the drawing turns worked. 124 of the 332 registered modules executed at least one function. Being reachable does not mean being executed.

## Totals

| | Count |
| --- | --- |
| Modules / components | 333 / 53 |
| Modules with domain logic in JS | 96 (in 30 components) |
| Domain-logic modules that executed in the 9 measured turns | 29 |
| Modules with recorded hidden behaviour | 132 |
| Components with no activity hook (can act without lighting up) | 30 |
| JS files on disk that are not reachable (orphans) | 80 |

Most high-impact domain logic is in modules that are still imported but did not run in the measured turns. These are the legacy rule formalizer (`src/formalizer/**`, 28 modules), legacy dialogue helpers (`intent`, `relative`, `value-check`, `world-aware`, `dispatch-validate`), the person/meta worlds and the Romanian translation tables. They stay on the import graph through `src/dialog/index.mjs` and `docs/webchat/app.mjs`. They can still act on paths the measurement did not exercise (fallback ladders, voice, a non-English interface).

## Compilation stream (2026-11-20, after the audit)

What moved out of JavaScript, and where it is declared now. The registry entries of these modules are updated.

| Was in JavaScript | Now |
| --- | --- |
| `reader-routing.mjs`: fixed retry order, retry stop rule and reply notes, coordination trigger (one `make`), comparison bounds 2..16 | `worlds/app.project/interpretation-policy.sop` (`app.interpret.retry`, `.note`, `.compare`, `.coordination`), read by `src/dialog/interpretation-policy.mjs`. Every re-reading attempt, also an unavailable or failed one, is an `app.reader.retry` event and a `contextRetry` trace entry; projection and coordination failures are traced (`app.reader.projection`, `app.reader.coordination`, `trace.readerRouting.projectionErrors`). |
| `index.mjs`: language autodetect at 0.8 | `app.interpret.language`; the decision is `trace.languageDetection`. |
| `index.mjs`: sound-alikes, `BUILTIN` tab aliases, focus weights, lenient ladder, best-effort margin | Deleted with the whole legacy turn ladder (about 2,500 lines that the only turn route, `routeNewEngine`, never called). |
| `app-reader-context.mjs`: `NATIVE_AREAS` table | `worlds/app.project/area-registry.sop` (`app.area.view`, `app.area.path`); the JavaScript keeps only each world's host factories. |
| `project-create-action.mjs`: `otherFamily:0`, top 5, batch 200, 64-character cap | The constant criterion is removed from the creation policy; limits are `app.creation.limits`. |
| `default-placement.mjs`: default weights, budgets, grid, centre share; "first zero-overlap wins" | `worlds/app.project/placement-default-policy.sop` (`app.placement.default`, `std.decide.criterion of=app.place.region`); the solution reports `defaulted` keys and the choice SOP. |
| `spatial-placement-execution.mjs`: unbound target → make | `app.placement.hypothesis create-absent-target`, tried in rank order; knowledge load errors are traced. |
| `quantity-projection.mjs`: kind rewrite / count injection | Traced (`app.reader.quantity` event, `trace.quantities` whenever a projection applied). |
| `app.mjs` yes/no skip, `voice-noise.mjs`/`voice-words.mjs` noun and verb admission lists | Removed: every queued and spoken message reaches the engine (`chat.queue.dispatch`, `voice.admission` events); only the wake-word setting holds a spoken message back, visibly. |
| `src/formalizer/**` on the runtime graph | Out of the runtime graph. Generic pieces moved: `src/dialog/turn-guard.mjs`, `src/dialog/stage-perf.mjs`, `src/dialog/ort-client.mjs`, `src/lang/lemma.mjs`, `src/interpreter/form-session.mjs`. The historical grammar tools (`src/cli.mjs`) pass the pattern compiler to `loadWorlds` explicitly. |

Still in JavaScript (next): the question-versus-request drop rule and failure sentences of `reader-routing.mjs`, the no-kind-word family default of `project-create-action.mjs`, the `regionProblem` template, the coordination split of `coordination-split.mjs` (owned by the Drawing lane), the end-of-turn word lists of `voice-words.mjs`. Tests: `tests/declared-runtime-policies-declared-host.test.mjs`.

## Top 15 JavaScript components that make domain decisions

Order: those that ran in real turns first, then high-impact reachable ones. "Ran" means V8 coverage counted executed functions during the measured turns.

| # | Module (component) | Ran | Decision in JS (evidence) | Hidden behaviour | SOP/knowledge replacement |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/dialog/reader-routing.mjs` (Reader routing) | yes, 25 fns | Fixed retry order `independent` then `literal`, stopping at the first complete reading (`:115`). Coordination is tried only for one `make` request (`:104`). Readings are compared only in uncalibrated best-effort mode, for 2 to 16 candidates (`:186`). | A projection failure falls back to the raw model reading (`:99`). Coordination errors are swallowed (`:107`). Failed retries are skipped (`:119`). `app.reader.retry` is emitted only when a retry wins. | An `app.reader` retry/interpretation policy World: profiles, order, eligibility and comparison bounds as facts. |
| 2 | `src/dialog/index.mjs` (Session coordinator) | yes, 9 fns | `SOUND_ALIKES {art.draw:{sare:'soare'}}` (`:299`). `BUILTIN {robot:ui.avatar, editor:docs.editor}` (`:622`). Focus weights +3 for the tab world and +1 per recent world (`:649`). Candidate-world ladder capped at 5 (`:689`). Clause split on and/then/but (`:770`). | The lenient ladder silently tries spell, name, garble and partial variants and executes the first full parse (`:681`). Best effort executes the top reading unless a rival is within `P.margin` (`:844`). Language autodetect overrides the selected language at ≥0.8 (`:1644`). | A declared reading-recovery policy (stage order, world priors, thresholds). Tab aliases from the app.project registry. Sound-alikes as lexical facts. |
| 3 | `src/dialog/project-create-action.mjs` (Creation/query actions) | yes, 37 fns | `otherFamily:0` is a fixed measure (`:49`). Without a kind word, only the family's own constructor is offered (`:73`). At most 5 alternatives are kept (`:25`). | Alternatives beyond 5 canonicals are discarded (`:59`). Lemmas longer than 64 characters are dropped (`:46`). | `app.creation` policy facts for the measures, the no-kind default and the retention limit. |
| 4 | `src/dialog/default-placement.mjs` (Default placement) | yes, 21 fns | Default weights `peerWeight 100`, `stackWeight 50`, `fy 50`, grid frame/40 and budget 2000/3000 (`:23-48`). Region rule: the first region with zero overlaps wins, otherwise the one with the fewest (`:86`). | The defaults apply silently when the area objective omits them. The region choice is not traced as a rule. | `app.place.objective` / `std.objective` facts in the area rules (lexicographic: overlaps, then declared order). |
| 5 | `src/dialog/spatial-placement-execution.mjs` (Spatial placement) | yes, 32 fns | An unbound target turns `place` into `make`, with mode new and an indefinite determiner (`:97`, `:188-192`). | Knowledge load errors for kinds are swallowed (`:66`). The fallback itself is disclosed in the reply. | A declared alternative-reading hypothesis in the request/placement policy, ranked by SOP. |
| 6 | `src/dialog/app-reader-context.mjs` (Reader context) | yes, 5 fns | A hardcoded `NATIVE_AREAS` tab→world registry (`:9`). Per-area focus paths, e.g. the editor `historySelection` (`:17`). | Focus objects are collected without a trace (`:42`). | The app.project tab registry, with focus keys declared per area schema. |
| 7 | `docs/webchat/app.mjs` (Chat page shell) | yes | `YESNO` regex including `da\|nu\|bine` (`:1271`). `GAME_VIEWS=['arith','tasks']` (`:1428`). Gesture arguments are quantized (`:764`). The persisted world list is hardcoded (`:647`). | A queued yes/no is skipped when the last bot line lacks "?" (`:1302`). The voice classifier drops messages before the engine sees them (`:1344`). | Dialogue-state rules (open question) in SOP. Persisted worlds from project declarations. Precision per parameter in the native interface. |
| 8 | `docs/webchat/ui/tabs/draw.mjs`, `diagram.mjs`, `calendar.mjs`, `editor.mjs` (Tab UIs) | yes | Draw: English plurals and captions (`draw.mjs:38,48`). Diagram: group move on member drag (`diagram.mjs:291`), minimum size 8 (`:312`). Calendar: new event at 09:00 for 1 h (`calendar.mjs:33`). Editor: 'Untitled document' default (`editor.mjs:54`). | The UI computes geometry and defaults before the tool command. Calendar hides objects without numeric start/duration (`calendar.mjs:14`). | Gesture semantics, defaults and nudge steps as `area.sop` controls/args. Captions and plurals from lexicon knowledge. |
| 9 | `src/knowledge/facts.mjs` (Knowledge loaders) | yes, 41 fns | Stand-in drawing: the first `is_a` kind with a drawing wins, with `MAX_KINDS=4` (`:199`). English plural lemma rules (`:28`). | An unreachable catalog is retried after 30 s, and lookups answer empty meanwhile (`:25`). | A declared SOP rule over `k.objects.stand_in` / `k.kinds is_a`, with an explicit ordering. |
| 10 | `src/dialog/textgen.mjs` (Session coordinator) | yes, 6 fns | `DOC_TYPES` sizes: essay 600, report 800 (`:66`). An unknown document word becomes essay (`:72-74`). | The essay default is silent. | `k.genres` size defaults and genre words in knowledge. |
| 11 | `src/dialog/quantity-projection.mjs` (Projections) | no | English singularization (`:37`). Amount names are matched against the source words (`:40`). | The target kind is silently rewritten (`:53`). `count=typical` is injected (`:57`). | The reader proposes amounts as structure. Amount phrases in `w.lang`/`k.expect`. |
| 12 | `src/dialog/coordination-split.mjs` (Coordination) | no (these turns) | It rewrites the user's text into sub-utterances (head + phrase + shared tail, `:142-157`). | The model reads the synthesized text instead of the user's text. | A `w.lang.en` coordination grammar, or a cutter trained on coordinated spans. |
| 13 | `src/dialog/dispatch-validate.mjs` + `world-aware.mjs` (Reader host / routing) | no | `acceptRefused:true`, penalties 3.0, 6.0 and 0.05, `minCoverage 0.25` (`dispatch-validate.mjs:37-49`). Avatar "you" veto (`:247`). `veto` default mode, English FILLER list, edit distance ≤1/≤2 (`world-aware.mjs:26,34,40`). | Refused readings are accepted silently (`dispatch-validate.mjs:315`). A judge failure keeps the reading (`world-aware.mjs:185`). | `std.decide` criteria facts. The addressee rule in `ui.avatar`. Function words from `w.lang.en`. |
| 14 | `src/formalizer/**` (Rule formalizer, 19 domain modules) | no | Tab aliases `{'ui.avatar':['avatar','robot'],…}` (`routing.mjs:72`). Avatar "you" filter (`rules/index.mjs:476`). Coverage policy 8 words / 0.35 / 0.6 (`rules/index.mjs:380`). English normalize lists. | Readings of other worlds are dropped when `ui.avatar` matches. Learned weights reorder tier 5. | World cards and meta.worlds, a declared routing policy, phrases in lang.common. Or remove the module from the import graph. |
| 15 | `docs/webchat/ui/voice-noise.mjs` + `voice-words.mjs` (Speech) | no (no voice) | Hardcoded nouns house/heart/tree/sun… and command verbs (`voice-words.mjs:23,26`). `LONG_WORDS=5`, verb in the first 3 words, ≤6 words (`voice-noise.mjs:10,47-50`). | Voice input is ignored before the engine and is never traced. | Voice admission as SOP rules over reader coverage, with the lexicon from catalog knowledge. |

Also high impact but not run in the measured turns:
- `src/dialog/meta-worlds.mjs`: caps, priors, `minScore 12`, `margin 4`, English word sets.
- `src/dialog/person.mjs`: interview order, `NOT_A_THING`, world ids.
- `src/dialog/scene-referents.mjs`: it rewrites user text with English and Romanian endings; it skips `'sunStash'`.
- `src/dialog/compose-plan.mjs`: topic weights −100/−50/tier×10.
- `src/knowledge/diagram-world.mjs`: English regexes pick the diagram kind; fixed 800×500 canvas.
- `src/translate/replies.en-ro.mjs`: per-domain reply tables (chess pieces, diagram forms).

## What was hidden, and what the map now shows

Before this change, the map showed the SOP side and about a dozen named JavaScript records (reader, admission, session, area interpreter, world host, tool hosts, compiler, loader). About 300 JavaScript modules had no record. Among them were all of the above domain decisions, the cutter, the binding bundle, the translation boundary, the sampler and the turn limits. Silent behaviour (retries, fallbacks, filters, defaults, UI geometry) was visible nowhere.

Now:
- **JavaScript on the runtime path** is a map band with one record per component. A component that names an existing record decorates that record instead of adding a second one. Each record carries:
  - badge **D** (domain logic in JS) or **G** (generic);
  - a dashed ring when the component has no activity hook;
  - its modules, with classification, decision, evidence, SOP replacement and hidden behaviour.

  Area-specific components and tab UI helpers sit in their tab's column.
- **Activity**: a world-activity event lights every component whose registry entry declares the event's operation. The event page names those emitters. New worker events:
  - `reader.cut`: the cutter's spans for each turn, so a wrongly split turn shows its actual cuts;
  - `translation.translate` / `translation.detect`: start, end and error;
  - `suggestion.sample`: sampler runs;
  - a failed turn's event now carries the guard reason, the stage and the active limits.
- **New records**:
  - `component:reader-bindings`: hash, catalog pin and key coverage per area. The deployed bundle states: diagram 58/99, drawing 26/32; calendar, documents and avatar have no coverage rows. It links to the knowledge worlds that supply kind lemmas.
  - `runtime:reader-evidence`: the reader's own diagnostics for the last turn (cut spans, packets, minimum probability, unresolved items, context fit).
  - `runtime:turn-limits`, `runtime:translation-boundary` (calls, last failure reason) and `runtime:suggestion-sampler`.

## Components without an activity hook (they act without lighting up)

- Domain-logic components: `control-interpreter`, `discourse`, `formalizer`, `default-placement`, `projections`, `person-meta`, `astra`, `sop-interpreter`, `language-tables`, `area-host:data.charts`, and the tab UI helpers (`ui:draw`, `ui:diagram`, `ui:calendar`, `ui:editor`, `ui:avatar`, `ui:chat-shell`, `ui:geometry-values`, `ui:speech`).
- Generic components: `raw-structural-bridge`, `instances`, `inspection`, `bundled-knowledge`, `sop-area`, `sop-world-host`, `policy-sources`, `app-project-js`, `acts-table`, `shell-state`, `ui:model-hosts`, `ui:persistence`.

Adding a hook means emitting `session.engine.onWorldActivity({operation, …})` in the module and listing the operation in its registry entry. The most valuable missing hooks:
- `default-placement.mjs`: the region choice;
- `quantity-projection.mjs`: the kind rewrite;
- `coordination-split.mjs`: the rewritten sub-utterances;
- `src/dialog/index.mjs`: the lenient ladder step that was used;
- `app.mjs`: dropped voice and yes/no messages.

The steward does not own these modules; their owners add the hooks.

## Orphans (JavaScript on disk that nothing on the runtime path imports)

80 files at the audit. 41 of them, which nothing imports (not the runtime, tests or scripts), were deleted on 2026-11-20; the rest are imported only by historical tests or scripts. These are not on the map, by design.
- `worlds/art.draw/{board,part-tools,scene,things.catalog,ops}.mjs`
- `worlds/diagram.sketch/{arrows,ops}.mjs` and `engine/{auto-layout,logic,templates}.mjs`
- `worlds/data.charts/{chart,datagen,hooks,ops,own,palettes,vector-svg}.mjs`
- `worlds/acts/*.mjs` except `verbs.generated.mjs`
- the `ops.mjs` / `fns.mjs` / `datagen.mjs` files of the kids, calc, plan, session, ui, geo, media, space and talk worlds
- `docs/webchat/ui/sop-area-view.mjs`, `ui/tabs/charts/*`, `ui/tabs/editor/{toolbar,view}.mjs`

50 of them contain domain logic. Because the restored UIs do not import them, they do not act. If one is imported again, the registry test fails until it is registered with its audit.

## Component table

| Component | Badge | Activity hook | Modules (domain / total) | Ran in measured turns | Map record |
| --- | --- | --- | --- | --- | --- |
| Engine worker and activity bus (engine-worker) | G | project.domain.resolve, z3.preload, knowledge.read, knowledge.inspect.read, reader.context.select, reader.context.fit | 0 / 2 | 0 | js:engine-worker |
| Session turn coordinator (session-coordinator) | D | component:reasoner | 5 / 14 | 3 | component:reasoner (or js:session-coordinator) |
| SOP-BERT reader host and graph decoder (reader-host) | D | reader.propose, reader.proposeRequests, component:reader | 3 / 9 | 0 | component:reader (or js:reader-host) |
| Request cutter and key-reader inference (key-reader-inference) | G | reader.cut | 0 / 6 | 0 | js:key-reader-inference |
| Raw structural bridge (raw-structural-bridge) | G | none | 0 / 1 | 0 | js:raw-structural-bridge |
| Reader routing, retries and choice (reader-routing) | D | app.reader.retry, app.reader.head, app.reader.admission, std.choice, std.interpret, policy.request-composition, app.request.route, app.request.composition.decision | 3 / 7 | 1 | js:reader-routing |
| Coordination split and routing (coordination) | D | app.reader.coordination | 2 / 2 | 0 | js:coordination |
| Reader admission (reader-admission) | G | component:request-admission | 0 / 2 | 0 | component:request-admission (or js:reader-admission) |
| Reader context projection (reader-context) | D | reader.context.select, reader.context.fit | 1 / 5 | 1 | js:reader-context |
| SOP tool command reader and native controls (control-interpreter) | D | none | 2 / 6 | 1 | component:control-interpreter (or js:control-interpreter) |
| Suggestion samplers and proposers (samplers) | D | suggestion.sample | 5 / 5 | 2 | js:samplers |
| Discourse, follow-ups and request records (discourse) | D | none | 8 / 10 | 3 | js:discourse |
| Rule formalizer and guard (legacy reader path) (formalizer) | D | none | 19 / 28 | 1 | js:formalizer |
| Declared execution and capability plans (declared-execution) | D | policy.execution.compile | 3 / 10 | 2 | js:declared-execution |
| Lexical grounding and knowledge lookup (lexical-grounding) | D | app.grounded.project | 1 / 3 | 0 | js:lexical-grounding |
| Default placement and scene defaults (default-placement) | D | none | 2 / 3 | 1 | js:default-placement |
| Spatial placement execution (spatial-placement) | D | std.placement | 1 / 2 | 1 | component:problem-compiler (or js:spatial-placement) |
| Degree, comparative, reference and quantity projections (projections) | D | none | 1 / 5 | 0 | js:projections |
| Creation, query, removal and context actions (project-actions) | D | app.query.read, std.capability.query | 4 / 7 | 3 | js:project-actions |
| Undo/redo history (history) | G | std.compile, app.history.restore | 0 / 5 | 0 | js:history |
| Instance facts, identity and persistence (instances) | G | none | 0 / 5 | 0 | js:instances |
| Person view and meta worlds (person-meta) | D | none | 3 / 3 | 0 | js:person-meta |
| Worlds inspection (this map) (inspection) | G | none | 0 / 8 | 0 | js:inspection |
| ASTRA session frames (astra) | D | none | 2 / 7 | 1 | js:astra |
| SOP interpreter, reasoner and world registry (sop-interpreter) | D | none | 2 / 13 | 0 | js:sop-interpreter |
| Knowledge catalog loaders (knowledge-loaders) | D | knowledge.read, knowledge.inspect.read, knowledge:catalog | 7 / 16 | 1 | knowledge:catalog (or js:knowledge-loaders) |
| Bundled knowledge tables (bundled-knowledge) | G | none | 0 / 15 | 0 | js:bundled-knowledge |
| Language tables (language-tables) | D | none | 1 / 9 | 0 | js:language-tables |
| Translation boundary (translation) | D | translation.translate, translation.detect | 9 / 18 | 0 | js:translation |
| SOPWorlds library (library) | G | component:library | 0 / 3 | 0 | component:library (or js:library) |
| World loader (world-loader) | G | runtime:registry | 0 / 1 | 0 | runtime:registry (or js:world-loader) |
| SOP area interpreter (sop-area) | G | none | 0 / 4 | 0 | component:sop-area (or js:sop-area) |
| SOP world host and native tool interface (sop-world-host) | G | none | 0 / 5 | 0 | component:sop-world-host (or js:sop-world-host) |
| Drawing tool host (area-host:art.draw) | G | interpreter:art.draw | 0 / 3 | 0 | interpreter:art.draw (or js:area-host:art.draw) |
| Diagram tool host (area-host:diagram.sketch) | G | interpreter:diagram.sketch | 0 / 3 | 0 | interpreter:diagram.sketch (or js:area-host:diagram.sketch) |
| Charts declared host (inside Diagram) (area-host:data.charts) | D | none | 1 / 2 | 0 | js:area-host:data.charts |
| Calendar tool host (area-host:time.calendar) | G | interpreter:time.calendar | 0 / 3 | 0 | interpreter:time.calendar (or js:area-host:time.calendar) |
| Documents tool host (area-host:docs.editor) | G | interpreter:docs.editor | 0 / 3 | 0 | interpreter:docs.editor (or js:area-host:docs.editor) |
| Avatar tool host (area-host:ui.avatar) | G | interpreter:ui.avatar | 0 / 3 | 0 | interpreter:ui.avatar (or js:area-host:ui.avatar) |
| Application policy source carriers (policy-sources) | G | none | 0 / 32 | 0 | js:policy-sources |
| Spatial profile and capability policy (JavaScript) (app-project-js) | G | none | 0 / 2 | 0 | js:app-project-js |
| Generated verb table (acts-table) | G | none | 0 / 1 | 0 | js:acts-table |
| Interface shell initial state (shell-state) | G | none | 0 / 1 | 0 | js:shell-state |
| Drawing tab UI and renderer (ui:draw) | D | none | 1 / 3 | 1 | js:ui:draw |
| Diagram tab UI and inspector (ui:diagram) | D | none | 2 / 3 | 2 (tools.mjs added after the measurement) | js:ui:diagram |
| Calendar tab UI (ui:calendar) | D | none | 1 / 1 | 1 | js:ui:calendar |
| Documents tab UI (ui:editor) | D | none | 1 / 1 | 1 | js:ui:editor |
| Avatar tab UI (ui:avatar) | D | none | 1 / 2 | 1 | js:ui:avatar |
| Chat page shell (ui:chat-shell) | D | none | 1 / 14 | 1 | js:ui:chat-shell |
| Gesture geometry quantization (ui:geometry-values) | D | none | 1 / 1 | 0 | js:ui:geometry-values |
| Speech, voice and interface language (ui:speech) | D | none | 3 / 4 | 1 | js:ui:speech |
| Model runtime hosts (ONNX) (ui:model-hosts) | G | none | 0 / 5 | 0 | js:ui:model-hosts |
| Browser persistence and records (ui:persistence) | G | none | 0 / 7 | 0 | js:ui:persistence |
