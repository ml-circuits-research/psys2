# Current status

## 2026-11-18 — Session handoff

[Open the demo](https://ml-circuits-research.github.io/psys2/webchat/). **Webchat build `582454509e`** also derives the grounded question graph by SOP rules and keeps worker recovery state private. The app pins SOPWorlds `0.224.0` (`361ecdf`) and knowledge catalog `9e99bc52`. The final application gate passed 650 tests, with three skipped. The catalog gate passed 3,249 with 18 skipped. Reader weights stayed fixed.

- **Diagram.** “Add three circles and add two squares” produced five visible nodes. Their placement used the measured batches and current scene. One Undo restored the earlier rectangle.
- **Drawing.** With a blue tree and one red house, the same count and existence questions gave 1/true before the deletion and 0/false afterwards. The next question found the blue tree. Queries preserved the board.
- **Browser state.** Reading a session snapshot returns a detached copy. Work-file recovery and Undo use the worker’s committed state. The supported diagnostic refresh asks the worker to supply its projection.
- **Worlds.** The Question readings world exposes the rules that connect the standard request, target, query operation and optional selector. The placement trace follows the declared projection and referenced facts. A published browser run verified that the graph stayed idle on opening Worlds and that Animate displayed the command and lit a connecting edge.
- **Cold start.** With the pinned catalog index delayed deliberately by 11.5 seconds, the ordinary “Add a circle” turn finished in 11.67 seconds, created one circle, and made one physical index download. The compute budget remained eight seconds. The previous build timed out on this controlled case. One local run of an authored removal after successive questions still stopped at eight seconds with zero worker kills; its cause is open. A separate historical worker restart has no confirmed reproduction.
- **Still open.** Scoped learning of preferences, dependent cross-editor requests (Calendar → chart → document), relative placement and migration of remaining application-owned reasoning are tracked in the [compiler plan](https://github.com/ml-circuits-research/soplang-words-lib/blob/main/refactoring/request-to-executable-circuits.md). There is no new aggregate reader accuracy measurement from these focused runs.

## Earlier checkpoint — Query after deleting the last member of a kind

Webchat build `0fd10c70f1` verified the full sequence in one Chromium session. With a blue tree and one red house, the count was 1 and existence was true. After deleting that house, the count was 0 and existence was false. The next query found the surviving blue tree. Read-only queries preserved all objects. For the missing noun, SOP rules admitted an alternate span from the current utterance and queried the live instance. The previous answer contributed no facts. The application gate passed 648 tests with three skipped. The reader weights are unchanged.

## Earlier checkpoint — Counted Diagram creation

Webchat build `9e44cd7951` integrates SOPWorlds 0.224.0 and catalog `9e99bc52`. In Chromium, “Add three circles” created three distinct circles while preserving an existing rectangle. The three visible centres matched the compiled group placement. “Add three circles and add two squares” produced five new visible nodes. One Undo removed the five and preserved the original rectangle. The full application gate passed 646 tests with three skipped.

## Earlier checkpoint — Placement evidence and the frozen reader

[Open Webchat](https://ml-circuits-research.github.io/psys2/webchat/). Build `07959a7e9e` (PSys2 `94371dff`) exposes the actual knowledge records referenced by its placement proof in Worlds. The public catalog returned 130 records for the secondary field `place=water`, including the boat, and preserved the connection to the lake’s water anchor. The ordinary Drawing route previously verified boat placement after moving the lake. Diagram creation and Undo preserved other objects. The integrated application gate passed 644 tests with three skipped.

The unchanged SOP-BERT reader can answer a count and an existence question about red houses in sequence. After removing the only red house while a blue house remains, the existence result is false. With only a blue tree remaining, the count is zero but the next existence question can lose the noun. This sequence and a cold-start timeout under delayed catalog loading are open. Reader accuracy over a random sample was not measured in this phase.

The library release `0.224.0` (`361ecdf`) supports defaults conditional on a candidate’s typed arguments. Its source, bundle and copy-on-write gates passed 1015, 1015 and 1013 tests respectively. This public application build still uses 0.223. The [remaining compiler work](https://github.com/ml-circuits-research/soplang-words-lib/blob/main/refactoring/request-to-executable-circuits.md) includes multi-tool data dependencies, relative placement, scoped preferences and generalizing the remaining application-owned reasoning.

## Earlier checkpoint — Declarative knowledge projection and browser tool input

Webchat build `beaab25626` uses SOPWorlds 0.222.0. The Drawing placement profile states which catalog records to read and which rule results to return. The library performs this lookup from SOP bindings. A Chromium run moved the lake, drew the boat at its new position and undid only the boat. A Diagram host test changed the authored region and observed new node coordinates on two pages. The ordinary Diagram catalog still needs equivalent domain coverage. Browser tool input is now a SOP string.

The integrated gate passed 638 tests with 3 skipped. The frozen reader can still omit the noun on an existence question after a count question. In that case the grounded target remains unresolved. No model retraining was performed. Remaining compiler tasks are in the library’s refactoring plan.

## 2026-11-18 — Scene knowledge in ordinary Drawing requests

On a 1000 × 700 frame, Chromium placed a sun at (500, 175). After Undo, “Draw a lake” followed by “Draw a boat” placed both at (500, 525). The boat instruction used the observed lake and its declared water anchor. Undo removed the boat and preserved the lake. Explicit coordinate precedence and occupied placements also passed targeted host tests. The reader weights are unchanged.

## 2026-11-18 — Scene rendering, manual animation and executable circuits

Drawing and Diagram received canonical SOP state in the chat reply where the canvas and SVG expected their render projection. The worker retained the objects. The renderer now uses the committed projected values for the changed worlds. Animate on a response opens Worlds and replays only its recorded activity. Chat now shows the exact dispatched circuit alongside the answer and keeps compiler evidence in Worlds. SOPWorlds 0.219 supports read-only counts, members, values and existence over evidenced object populations.

## 2026-11-18 — Editor gestures travel as SOP

The editor page now submits the actual SOP instruction across the worker boundary. Each editor resolves its live declaration and records the instruction it executed. Chromium traced a Drawing edit from a visible control through the worker, tool and chat. Undo submits its query first, then the history compiler binds the live journal entry. Creation rules now assign names and constructor properties from grounded evidence and preserve unapplied requirements.

## 2026-11-18 — Property readings, request routing and journal state

The frozen reader recognizes both colour roles in “Make the red house purple.” A competing head reported the same catalog property in Diagram with no additional source span. The authored reader-head policy proves their shared declaration and provenance, and the live compiler verifies a complete interpretation before dispatch. The original incomplete proposal remains in the trace. Chromium verified the older red house changed, the newer blue house stayed blue, and Undo restored the colours.

Request routing now uses an authored policy before choosing a concrete interpreter. Worlds exposes the route and its supporting rule. Undo and Redo membership, ordering and head identity are authoritative SOP journal facts; editor payloads live in the journal tool. A browser worker restart preserved the identities and heads of three entries across Drawing and Diagram. The reader admission schema and its decision policy now appear separately in Worlds.

## 2026-11-18 — Grounded request circuits and eligible tools

Creation and contextual edits now derive request, source, target and result wires from grounded evidence using authored rules. Other rules join actual tool metadata to eligible constructors, including catalog tools. Worlds shows both knowledge policies and their schemas. SOPWorlds 0.217 projects the ordered calls of a completed rule circuit into tool input and validates their declared call schema. The history interpreter consumes this projection. Reader-head interpretation, correction coordination and some observation adapters remain application code.

## 2026-11-18 — Reader input and declared tool defaults

The verified reader consumes one `std.request.source` wire. Worlds records the exact input, including Unicode text. The chart and catalog interpreters declare their own argument seeds. The capability policy derives colour lookup and evidence from catalog and observed facts. Chromium exercised creation of two objects from one spoken-form request, Undo, chart labels and catalog construction.

## 2026-11-18 — History commands and compound replies

Undo and Redo from editor controls, authored queries and the reader compile against the observed journal head into an exact SOP call. The history interpreter checks that head and compares current content with the expected revision before restoring it. Worlds shows the schema, compilation policy, JavaScript interpreter and session journal separately. The journal still stores native before/after snapshots.

Mixed replies identify the exact source span they could not apply and return the final editor state even when the final cut fails. The reader still splits “no, the other one” into two parts.

## 2026-11-18 — grounded choices and direct property execution

SOPWorlds 0.216 compiles ranked-choice queries. The creation and reference policies supply criteria for comparing grounded alternatives. Their schemas, rules and actual decisions can be inspected in Worlds. Direct property changes and selectors compile through the same native tool declarations; the former standalone Drawing property host was removed. Admission classes and calibration thresholds are authored SOP policy.

In Chromium, “make it blue” changed the focused fish. “No, the other one” restored the fish and changed the house. Undo restored both prior colors. The cutter treated “no” as a separate clause and generated an extra failure sentence. Seven creation trials, including named shapes and a typo, changed the expected objects and could be undone. The previous live reader test of “Make the red house purple” still lacked an admitted query although the authored selector executed successfully.

Remaining semantic JavaScript includes constructing request graphs from incomplete reader evidence, scheduling and coordinating corrections and history, and portions of the live-to-SOP capability adapter. The migration remains open.

## 2026-11-18 — executable SOP at the tool boundary

The five editor tool hosts accept SOP commands with a separate SOP invocation identity and observed revision. Compiled capability calls carry their typed arguments straight from the compiler into the interpreter. Manual editor gestures retain their compact tool wires. The chat and Worlds show the exact dispatched command. A stale revision is refused; a retry with the same invocation and command returns the prior receipt.

Drawing, Diagram, Documents, Calendar and Avatar now own their editor state as SOP facts. See the latest entry above for the subsequent migration of the property path.

## 2026-11-18 — chat circuits and reader context

Browser build **84eed17ce4** shows each actual SOP query on its user message and its compiled circuit and tool call on the answer. Authored SOP graphs remain in the execution journal. The natural-language reader uses current editor observations without feeding serialized authoring syntax into its previous-utterance input.

A Chromium replay after an authored house recolor and Undo created both requested objects from “draw a tree and a house.” It displayed two admitted queries, two compiled circuits and two native calls. The reader and cutter weights are unchanged. The cutter still returned one span for “draw a circle and a square,” leaving the second target unresolved.

## 2026-11-18 — schema, knowledge and instance ownership

Delivered application build **87d3be7b8b** with library **0.209.0 / 602df0d** and knowledge catalog **59875277**. GitHub Pages deployment [44327544495](https://github.com/ml-circuits-research/psys2/actions/runs/44327544495) succeeded; the [public demo](https://ml-circuits-research.github.io/psys2/webchat/?ui=87d3be7b8b) serves that exact build and catalog. Public schema and vocabulary source bytes were checked against the committed site copy. Calendar and Avatar import reusable schemas into separate contexts, then admit only instance facts through the library guard and their existing domain ownership closure. Direct instance readers reject copied schemas, rules, imports and unrelated knowledge facts. Current five-editor export/restore/query/temporary-reasoning checks preserve all data; schema definitions and temporary deductions do not enter instance storage. Drawing, Diagram and Documents still have authoritative native state with explicit SOP observations.

Execution defaults and request-composition policy facts now have separate imported schema sources. The Worlds inspector shows those owners independently. Vocabulary comes through explicit catalog dependencies rather than concatenation into schema text. Offline person/diagram profiles preserve their prior vocabulary as separate knowledge sources. The operative execution source now contains only declared value-lookup families and references separately held schema modules; its RGB name/value bindings retain exact parity. It is an evaluation context, not copied editor state.

`node scripts/build-lang-en.mjs` regenerated the pinned bundles and declared execution source; `node scripts/build-webchat.mjs` checked them and built the site catalog with **1,318 files**. `npm test`: **589 tests, 586 passed, zero failed, three skipped**. The actual pinned-knowledge probe also created an editable vector apple and resized Avatar eyes after loading its alias data. Existing source/browser gates passed in the integrated suite.

Historical archive bytes and their old knowledge pin remain unchanged and losslessly readable. The current application rejects their incompatible pin atomically, as required by the no-implicit-migration policy. They are not silently relabelled as current files. No model weights or training changed. This delivery enforces ownership boundaries; it does not complete the general request compiler. The ownership and editorial book revision is published in library commit **e7eaf9d**. It separates owned schema/knowledge/instance examples, explains legal declarations versus matches versus semantic choices, and demonstrates compact values and an actual scheduling calculation. The plan records a remaining general-library limit: the legacy rule loader still accepts some invalid pattern keys/literals and unbound conclusions; documentation auditing detects those cases, but that does not complete generic runtime compiler validation.

---

## 2026-11-18 — book and compiler migration plan

The owner requested theory and a concrete plan before runtime refactoring. The revised [SOP Worlds book](../soplang-words-lib/books/sop-worlds-teorie.md) defines a minimal public boundary: provide existing worlds, tool interfaces and context, then compile SOP request/query circuits. LIB encapsulates binding, completion, hypothesis ranking, constraint solving and planning. A plan is a concrete circuit of typed tool calls; tools consume their own instructions.

Chapter9 now explains request classes and resolution algorithms instead of public JavaScript APIs. The whole-book review removes release/implementation diary entries and corrects unsupported examples. `node tools/audit-book-examples.mjs --published --strict` admits all46 SOP examples against real schemas; structural admission is not execution evidence. Library source and bundle gates each passed964tests:962pass,0fail,1skip,1todo; documentation rebuilt.

The [migration plan](../soplang-words-lib/refactoring/request-to-executable-circuits.md) records actual gaps, responsibilities to remove from application JS, typed tool contracts and nine request-family acceptance groups across all five editors. PSys2 `npm test` also passed580tests:577pass,0fail,3skip. The existing [native reduction plan](specs/plans/worlds-native-reduction.md) points to that contract. No runtime or training changes were made for this documentation delivery; the deployed UI/model remain as reported below. Pending label changes remain stashed.

---


Updated: 2026-11-18. Worlds truthfulness and readability review completed.

## Public demo

Latest build: **`4d6b6239e8`**, https://ml-circuits-research.github.io/psys2/webchat/?ui=4d6b6239e8 . Implementation commit `fc7d0523` is pushed; GitHub Pages deployment completed successfully and the public build-info was verified to return `4d6b6239e8`. Model weights are unchanged.

## Latest Worlds review

- Breadcrumbs, relationships and property navigation are borderless links. Why opens first and uses short authored purpose comments. All 40 published catalog definitions have concrete explanations grounded in their source documentation.
- Orange means JavaScript/native implementation or catalog metadata; green means SOP declarations/facts; blue means SOP-BERT. Role icons no longer imply implementation. Native/model/JSON nodes have no fabricated SOP tab; empty Tools, Properties and Schema tabs are omitted.
- Opening a declared SOP source fetches its real catalog files. Flat file links select **one exact complete file at a time**; all fetched files remain accessible and larger worlds use bounded pagination. No file is summarized, truncated or combined with other files.
- Catalog-only, inspection-only and source-read are distinct. Reading bytes is not evidence that reasoning used them. `k.interest` is a genuine published definition but **its scoring mechanism is not connected to this demo**: the older executor snapshot contains its schema, zero scoring facts, and the active native path has no interest-scoring call. This missing integration is now stated, not presented as a working capability.
- Opening Worlds no longer prepares native knowledge services just to construct the map. Explicit source inspection reads raw declared files without compiling a knowledge World, running rules, calling tools, changing editor state or sending a model request.
- Checks: **580 tests, 577 passed, zero failures, three skipped**, including the actual built-app Worlds RPC/source test. Real 390px/1600px visible panes, three-colour palette, Why/link navigation, exact `k.interest` and paginated `k.animals` source text, retained graph identities and unchanged native state/loaded-world set/send count all pass. No console exceptions or missing files.

These changes correct the inspector. They do not implement unused knowledge mechanisms or claim that every catalog definition participates in reasoning. Drawing, Diagram and Documents still have native state authority; Avatar and Calendar retain their verified SOP authority.

## Completed work

- Separate corpus: `training/sop-bert/data/ui-natural-v1/`, with **1,474 messages**. All 99 current UI operations have synonym and elliptical variants; 587 meaningful optional-detail combinations cover shorter requests. Original 592 messages remain. Extraction, normalization and world completion have separate gold annotations.
- **1,175 actually executed UI recipes / 1,181 calls**, with exact text, SOP and observation references in `ui-actions.jsonl`. Existing V2 validation and actual label preparation report zero invalid rows and zero ambiguous/overlapping label masks. Vague completion cases do not manufacture tool effects.
- Union includes all **36,999 older authored messages** plus the new corpus: **46,098 training samples / 4,451 calibration samples, 257 keys**. UI training weight is five; related paraphrases share split cohorts. No source exclusions.
- Worlds: vertical explanatory legend, breadcrumb navigation, separate Activity log page, larger adjustable fonts, visibility/focus-gated animation, and per-response Replay of exact recorded events. Replay does not execute commands again.
- Optional dynamic input padding, compact CPU training labels and compatible-head warm-starting reduce unnecessary inference/training work. Legacy model configurations retain their previous padding behavior.
- Recovered **1,408,461,474 bytes** from superseded checkpoints/export/cache. About 20 GB remains free. Current deployed weights, selected epoch-7 checkpoint, training data and unowned stale worktrees were preserved.

## Actual measurements

On the frozen **1,480 gold request cuts / 1,474 messages**, the old model produced **28 exact intents (1.89%) / 16 complete reader meanings (1.08%)**. Of those cuts, 1,230 require keys absent from the old checkpoint; on the 250 shared-key cuts, exact intent was 28/250. Its old 192-token limit truncated 367 rows. These are conditional checkpoint diagnostics, **not browser execution accuracy**.

The deployed cutter on the fixed 5,218-source comparison achieved **3,728 exact segmentations (71.44%)**: UI 1,389/1,474, older calibration 2,339/3,744. Reports are under `.session-control/overnight-reader-baseline/` and `.session-control/overnight-ui-cutter-baseline/` at workspace root.

## Checks and integration limits

Latest integrated gate: **571 tests, 568 passed, zero failures, three skipped**, including real Chromium touch interaction. Eleven Python key-reader preparation tests also pass.; system map and browser assets rebuilt. Actual Chromium checks passed for the explanatory legend, 15px base font and zoom, breadcrumbs preserving map position, full-page Activity log, usable chat, and visibility/focus pause/resume; zero console exceptions. Replay was independently verified not to execute commands again.

New generic native-interface binding preparation describes 25 families / 144 literal properties in five SOP schemas. Actual gold-request integration changed Avatar base to man and Drawing label to Cabin, with effect verification. This tests the binding/executor mechanism, **not neural recognition**. The overlay is not activated in the deployed model; structured argument codecs and new-model provider-area activation still need integration with the candidate bundle.

## Actual training results and corrected diagnosis

Cutter completed eight epochs, selecting epoch two. Same fixed 5,218 source cases: **5,212 exact (99.885%)**, up from 3,728 (71.44%). However, it regresses the owner noun enumeration: the deployed cutter reads two cuts for `draw a tree and a house`, while the candidate reads one. It is not promoted on aggregate score alone.

Key reader selected epoch three, SHA `3192ac283d00977146543dedf94d72234dcb3020dfc77a8862acd105f8086d04`. Actual CPU comparison on identical 1,480 gold cuts: **1,037 exact intents (70.07%)**, **1,412 exact global fields (95.41%)**, **1,229 exact source spans (83.04%)**, **791 complete reader meanings (53.45%)**. Old intent was 28/1,480. Shared-key intent is 212/250; new-key intent is 825/1,230. These are conditional reader diagnostics, not native/browser execution accuracy.

Training was stopped before completion when supervision/representation defects were confirmed: V2 preparation bypassed existing lexical-inner span extraction, teaching `coloured red` instead of `red`; 88 rows have values outside available classifier banks; unit/measure metadata lacks output heads. The selected checkpoint and both real evaluation passes are retained. Further epochs cannot fix those contracts. No completed-run or deployment success is fabricated.

The new key reader BIO already finds **both** `tree` and `house` spans. Its singleton target.kind conversion refuses multiple mentions; a repeated-target/role contract is needed. A generic source-cut scheduling policy fixes the deployed two-cut runtime failure without splitting English text or inventing a verb, but cannot repair the new one-cut representation. `draw a tree near a house` is a counterexample to blindly creating every noun.

Reports: `.session-control/overnight-ui-cutter-after/comparison.json` and `.session-control/overnight-reader-candidate-eval/`. No model promotion or restart occurs until the unresolved contracts are addressed.

## Delivered implementation and actual runs

- `draw a tree and a house` and `draw a tree and draw a house` each create **two real objects** with the deployed model; **one Undo restores both**. The first retains an extra unapplied tree constraint as a partial result. The reader runs once per actual cut rather than doing a redundant full-batch read first. Actual coordinated-reader/proposal events and SOP policy reads appear on the common activity bus.
- Worlds legend releases the graph width when closed. Mobile explicit navigation opens the visible page. Desktop and 390px Chromium checks pass without horizontal overflow; all actual architecture nodes remain inspectable.
- Mobile Drawing: actual touch Add, drag/move, explicit multi-selection, grouping/ungrouping and cancellation verified. Mobile Diagram: actual touch Add two nodes, multi-selection, group/ungroup, tap-two-node Connect and pinch without object mutation verified. These controls call the same declared tools and produce SOP records; no new operation inventory was invented.
- Diagram's missing `arrows.mjs` and `data.charts/vector-svg.mjs` modules are included in the published runtime closure. A generic asset check covers actual lazy editor module constants and the content manifest. Retired standalone Charts UI moved to `legacy/`.
- Avatar joins Calendar as **canonical SOP state authority**. Session storage owns only `{sop}`; transactions and rendering decode temporary native data. Current composition, shared slot records, colours, geometry, explicit overrides, saved compositions, ordered history/future, options and referents are represented. Current interface bindings are explicit; historical duplicates do not silently become live objects.
- Built-route Avatar Chromium: visible composition change, exact eye scale 1.2, real eyes feature change and Undo verified. Worlds shows sole SOP carrier, authoritative instance, complete governing schema, exact face/eyes facts and zero identity/console errors. Fresh versus 40-history resize measured 15/87 ms in Node; this is not a claim about all mobile devices.
- V2 supervision fix narrows **177 mention spans across 175 request cuts** to the lexical value, retaining the outer disambiguating evidence separately. All utterances, raw gold requests and expected native calls remain unchanged. The corrected future union is `.session-control/ui-natural-span-corrected-union/`, explicitly **`trainingReady:false`** pending the documented contracts. Eleven Python and eight targeted Node checks pass.
- Updated library skills are pushed in **`fba0f38`**. Source and built-library gates each ran 964 tests with zero failures. Historical grammar fixtures are no longer presented as neural application accuracy, and refusal-first/capability-for-free instructions were corrected.

Architecture plan: `specs/plans/worlds-native-reduction.md`. The initial graph inventory had 75 native state properties, nine runtime records, five adapters and seven components. Those 75 properties were not 75 independent algorithms. This delivery moves real Avatar state and execution policies into SOP; it does **not** relabel the remaining JavaScript algorithms as Worlds or claim to have replaced all native components.

## Remaining after standby

- Drawing, Diagram and Documents still have authoritative native state and domain algorithms. Their complete semantic schemas/state migrations remain planned; Avatar and Calendar are the completed storage-authority migrations. Native geometry, renderer/DOM, model tensors and typed primitive boundaries remain legitimate implementation components.
- Repeated target/group/role membership is still absent from the raw reader contract. The candidate cutter's one-cut noun enumeration cannot be repaired merely by running the source-cut scheduler. Preserve the example and the near-a-house counterexample; extend the representation before retraining it.
- Resolve missing unit/measure output contracts, out-of-bank reference/alias supervision and source normalization before another training run. The corrected span preparer alone does not resolve these. The selected measured epoch-3 checkpoint remains available; no training process remains running.
- Omitted positions still use native centre defaults and may overlap; no new spatial reasoning success is claimed. Some existing native operations still return generic effect verification `unverified` despite actual effects checked in the browser; keep that distinction visible.
- Touch flows passed Chromium at 390×844. Broader physical-device/Safari ergonomics and fine resizing/property editing need owner feedback; no claim of universal mobile coverage.

No further training or refactoring is scheduled during standby. Resume on owner return with these concrete remaining contracts and UI feedback.
