# Reduce native architecture through operational SOP Worlds

Owner priority, 2026-11-17. This is an implementation plan, not a completed migration claim.

## Governing compiler contract

The owner clarified the public boundary: supply existing worlds, tool interfaces and context, then compile SOP request/query circuits into concrete executable call circuits. Internal resolution, completion, ranking and planning are encapsulated in SOPWorlds LIB. Tools consume their own concrete typed calls; they do not interpret a plan or a human request. UI actions use the same concrete interfaces directly.

The normative explanation is [the book](../../../soplang-words-lib/books/sop-worlds-teorie.md); the current cross-repository implementation sequence and request-family acceptance matrix are in [request-to-executable-circuits.md](../../../soplang-words-lib/refactoring/request-to-executable-circuits.md). These links describe a coordinated sibling workspace. That plan governs the semantic migration below; existing native functionality is replaced after actual call/effect/undo parity. Runtime refactoring remains deferred while the owner reviews the theory and plan.

## Evidence and first end-to-end run

The live graph has 333 worker nodes: 75 are individual JavaScript state properties, nine runtime records, five adapters and seven components. The 75 properties are not 75 independent algorithms, but their state authority is genuinely native and must not be hidden by relabelling. Four application-added nodes make 337 rendered nodes. The compact actual inventory is at workspace `.session-control/worlds-native-inventory.json`.

The first run must execute a two-object request through the real reader and retain both actual effects. The deployed reader already cuts `draw a tree and a house` into two source spans and identifies both objects; the bridge refuses unannotated request dependencies. A newly trained cutter instead retains the noun enumeration as one request. These are distinct composition and representation issues, not proof that more training fixes everything.

## Ordered work

1. Execute independent validated requests under an explicit SOP scheduling policy, using actual cutter spans, refreshed live context, per-step evidence and one undo group. Preserve declared dependencies. Never split source text on English conjunctions or fabricate elided verbs. Measure old and new reader pipelines on conjunctions and noun enumerations separately.
2. Move execution defaults and knowledge-property lookup descriptors from native operation/concept maps into an operational SOP policy World. Keep clock access, numeric conversion and tool invocation as small visible native primitives. Show the exact loaded policy World and links in Worlds. Runtime changes must actually consume the facts.
3. Fix mobile navigation and reclaim graph space when the explanatory legend closes. Retain every actual node; mobile zoom and navigation must work on a real 390px viewport.
4. Restore mobile Drawing and Diagram touch workflows: Add chooser, one-tap selection, explicit multi-selection without keyboard modifiers, drag/move/resize, group/ungroup and accessible group properties. Diagram must connect nodes by touch and allow selecting/editing/removing arrows. Resolve pointer cancellation/capture and touch scrolling conflicts; exercise real touch events at 390px rather than assuming mouse tests establish usability.
5. Audit/update agent skills against actual published contracts and owner policy. The app uses SOP-BERT for C2 reading. Generic grammar mechanisms remain library capabilities, not a hidden replacement reader. Ranked plausible interpretations, uncertainty, alternatives and undo supersede refusal-first instructions.
6. Migrate native state by semantic families, not one synthetic World per JavaScript field. A complete schema must account for each existing field before changing authority. Drawing needs scene/object/group/selection Worlds; Diagram needs nodes/edges/groups/layout; Documents needs document/chapters/blocks/selection; Avatar needs composition/features/adjustments. Shared journal/selection/undo schemas should replace repeated editor implementations where semantics agree. Calendar is already authoritative SOP state.
7. Replace declarative decisions in adapters with existing general world planning, constraints and tool bindings. Native geometry, DOM/rendering, model tensors, clock and storage remain typed interpreters/adapters. A `core.function` declaration identifies a host function; copying JavaScript into an SOP string does not make it a reasoning mechanism.

## Admission for each migration

- Enumerate the actual affected fields and semantic decisions, and the governing schema/knowledge references.
- Exercise actual create/change/group/remove/undo and text execution before and after.
- Establish SOP state as the single authority; JavaScript objects may be temporary tool/render projections only. Do not introduce a second persisted representation or hide unconverted fields.
- Show remaining native boundaries and operational Worlds in the graph, with exact facts, source and capability details. A smaller diagram alone is not a migration.
- Update the status with delivered behavior and unresolved work. Do not promise that all state families or native algorithms have already been replaced.

## Alternatives considered

Existing tool declarations and relational policy lookup are the smallest first step: they replace operation-specific native maps without new language parsing. Full typed-state migration is necessary but requires complete domain schemas and broad editor regression checks. Embedding native code in wires would preserve the same algorithm and trust boundary, so it is reserved for explicit host-function interfaces, not counted as removing native behavior. These follow the library's existing `std.tool`, `core.function`, schema and World contracts; no new evaluator or sentence-specific rule is proposed.


## Delivered checkpoint, 2026-11-18

Items 1–5 have bounded verified deliveries: source-cut execution with one Undo, operational defaults/value joins/scheduling Worlds, usable mobile Worlds layout/navigation, actual touch Drawing/Diagram add/select/group/connect flows, and updated skills. Avatar in item 6 now stores its complete state as typed SOP facts, with native projections only at primitive/render boundaries; Calendar already did so. Drawing/Diagram/Documents authority and further semantic policy migration remain unfinished. No arbitrary embedded-code evaluator was introduced, and native components were not hidden merely to reduce the diagram count.
