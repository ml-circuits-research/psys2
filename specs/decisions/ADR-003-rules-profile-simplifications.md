# ADR-003 — Simplifications of the first implementation (rules profile)

Status: accepted (2026-11-07). Temporary: each item is closed by implementing the vision's version.

The first implementation (specs 01–06) deliberately implements less than vision v1. The documentation marks each item; this list keeps them visible.

| Area | Vision v1 | Current specs | Closing condition |
| --- | --- | --- | --- |
| Core keys | `core.source` immutable source record with hash; `core.in` full context; `core.status` = the four observable states, lifecycle separate | locator strings; `core.in` = world; one `core.status` mixing lifecycle and observable states | source registry and context records implemented |
| Answer outcomes | supported, alternatives, contradiction, missing evidence, unsupported, budget; refuted/unresolved; assurance per property | seven statuses, no assurance fields | assurance records in the result envelope |
| Operation declarations | full contract (preconditions, failure contract, evidence, execution) | outputs, inputs, impl, semantics, doc | operation registry with full contract |
| Router | calibrated reranker, unknown-world threshold | lexical scoring; no unknown-world decision | encoder router (vision §7) |
| Closed world | bounded predicate + snapshot + completeness declaration | `closed=true` on a type | completeness declarations |
| World package | data manifest, lineage, training data, releases, journal | directory of SOP files; `status=fixture/candidate/accepted` | registry, manifests and journal (milestone 1) |
| API | full endpoint families | sessions, worlds, health; learning returns 501 | C1/C3 services |
| Cross-artifact references | typed `core.ref` with release hash | plain `$id` across loaded worlds | content-addressed registry |
