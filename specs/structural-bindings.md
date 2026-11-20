# Source-backed C1 structural binding families

`training/sop-bert/export-structural-bindings.mjs` owns the declaration export
format `sop.structural-bindings/1`, shared with the structural teacher projector.
It takes only the published knowledge payload, inventory, annotation contract,
actual native declaration tables and optional immutable knowledge Git sources.
No annotation messages, owner rows, functional evaluation or label frequencies
are lookup-generation inputs. The exporter does not modify the projector or
trainer and is not a runtime sentence rule.

Kind records use exact raw `(area, type, lemma)` identities. Entire available
shape, object, animal, person, scene and genre families are exported, together
with owning entity `core.word` declarations. Face-part descendants come from
the declared type hierarchy, not a selected list. Word/value aliases require an
explicit `core.word of=<provider>.name means=<name>` join; plurals are never
guessed. Different canonical identities sharing a raw descriptor stay
unresolved, with all candidates retained in diagnostics. Native-family binding
chains cite actual make-operation source files where declared; they do not claim
that every semantic kind has a native kind/value conversion or renderer.

Property records are explicit C1 data joining an exact inventory descriptor to
a published `k.attributes` fact or an exact owning `core.slot`, and then to an
existing native operation parameter. Missing generic attribute rows do not hide
available owning declarations. Calendar duration cites the declared
`k.attributes.family.duration` link to `k.time.duration`. Calendar date/clock and
Document topic/title/genre/word-count slots retain their actual owning identity.
The full raw inventory descriptor and native export/operation/parameter chain
are retained. No key prefix supplies meaning; no generic quantity replaces
unrelated fields. Raw value token representation does not convert native units,
compose date/time/timezone values, fill defaults or invent numeric regions.

Unit names and aliases come from the whole published `k.units.unit` family and
its explicit owning word joins. Units are canonical source identities; no
suffix stripping or implicit native-unit choice occurs.

Each mapping carries source wire, source snapshot SHA256, owning world and
module version. Native/application alignments additionally cite their source
files and hashes. The exporter retains the enriched source snapshot outside Git
and records its path/hash, the original payload hash, runtime library hash and
immutable knowledge pin. Optional enrichment reads only the requested pin with
Git and records exact shard hashes/wire IDs. All emitted source declarations can
therefore be checked against the retained snapshot. Generated lookups/snapshots
stay outside Git.

CLI compatibility is retained:

```
node training/sop-bert/export-structural-bindings.mjs SOURCE LIBRARY DRAWING_HOST DIAGRAM_HOST OUT --native-root PSYS_ROOT --knowledge KNOWLEDGE_REPO
```

`--inventory PATH` optionally selects an explicit inventory. The output keeps
`kinds`, `properties`, `units`, `projectionPolicy`, `provenance` and explicit
`unresolved` diagnostics. The existing owner-reviewed unmarked-condition AND
policy cites the annotation contract's exact SHA256; alternatives are not inferred.

Check source export behavior with
`node --test tests/structural-bindings.test.mjs`. Missing native capabilities,
component ownership edges, semantic references and lexical value normalization
remain separate obligations, even when a declaration or binding is available.

## Independent semantic and native projection

The exporter accepts optional explicit `familyAlignments` (cap256), requiring an inventory family, existing `core.type` identity, matching owning source wire and nonempty authorial authority. It exports source/module/snapshot evidence; no lexical alias implies a raw family identity. The default CLI does not infer or enable these alignments.

Property alignment (cap4096) requires the exact inventory descriptor and owning semantic declaration. Missing native operation/parameter now retains the semantic property with `nativeCapability.status='unsupported'` and a separate `nativeCapabilities` diagnostic. No hostBinding is invented. Missing semantic declarations still omit the property and report unknown; all unmapped inventory properties remain listed. Native presence is a declared parameter join, not proof of complete operation semantics, value conversion or effect assessment. Existing typed values, unit/frame/source proofs and canonical ambiguity guards remain mandatory. This change adds no property alignments or normalizers by itself.

## Complete semantic alignment catalogue (Review25/26)

`training/sop-bert/bindings/semantic-alignments-v1.json` enumerates exactly the frozen inventory's15 families and105 domain properties. It pins inventory and annotation-prompt bytes, knowledge539dd413, source paths/SHA256, owning module/version and exact declaration excerpts. Authorial raw-to-canonical equivalence remains an explicit C1 decision, not a consequence of similar names. The catalogue presently aligns9 families and15 properties;6 families and90 properties retain explicit unresolved reasons. No owner/evaluation sentences or learned outputs construct this data.

Unresolved families are drawn, part, node, section, inline and whole diagram. The last is deliberately conservative: the inventory says charts are diagrams, but w.chart.chart and w.diagram.diagram are distinct immediate thing subclasses. Canonical family projection therefore cannot assert their equivalence. Whole picture, face, chart, node-edge/link, node-group, document, event/meeting, room and person are explicitly authored alignments; a room family alone does not establish booking semantics.

Property rows retain full raw descriptors and source value boundaries. Calendar day/clock/duration and endpoint references now have explicit candidate declaration evidence but remain unresolved in this opt-in catalogue until typed conversion/context/reference ownership exists. Existing no-option exports retain their prior16 rows. New semantic-only string/name slots cover picture background, face name, link label, group label and room name. No qualitative region becomes a fixed number, and no reference name becomes an ID. Native joins from the old reviewed rows are candidates rechecked against current declarations, not reused historical native-file hashes. Other properties remain unknown instead of being inferred from prefixes/shared concepts. This is semantic representability, not executable correctness.

CLI adds `--alignments PATH`, requiring `--knowledge REPOSITORY`. Complete descriptor coverage and exact inventory/prompt hashes are checked first. Source evidence is read only at the catalogue's explicit immutable pin, independently of the payload's base pin. Needed schema declarations and evidence facts are imported only if missing; any differing existing wire/module identity refuses, never overwrites. Source-file reads have an aggregate2MiB cap and enrichment a50000-step cap. Both pins, catalogue hash, every imported source-file hash and the final enriched snapshot hash remain in output provenance. Missing source dependencies may still make the world reject an enrichment; that is a refusal, not permission to drop those declarations. `--alignments` absent preserves the prior CLI behavior. No deployed artifact is regenerated by this source/data landing.

## Bounded actual artifact regeneration

`regenerate-semantic-bindings.mjs SPEC.json` invokes the actual exporter with an exclusive output directory, hashes inputs before/after, retains stdout/error/exit status and refuses a completed receipt on mutation, output overrun or reserve exhaustion. Logical snapshot+lookup output is capped (maximum16MiB). The exporter serializes both in memory before writing; `--compact true` removes only JSON whitespace, preserving every field. No runtime JSON or bridge budget is raised. `--reuse-source-snapshot PATH` requires byte equality with the newly generated snapshot before an exclusive hardlink; both source paths become0444. `--reserve-bytes N` preflights actual new physical bytes plus64KiB receipt headroom, independently of the logical artifact cap. No input or old output is overwritten.

`verify-semantic-bindings.mjs DIRECTORY REPORT` checks actual compact bytes against the existing4MB factory limit, source/module declarations against retained snapshot, all15/105 status records and catalogue/base identities. Generated structural probes cover every aligned family/property and unresolved family, with default bridge budgets and execution disabled. These probes validate serialization/projection contracts only: synthetic literal values do not establish property-value suitability, neural quality, native capability or semantic accuracy. Receipts and generated artifacts remain outside Git; a compact measured report is published separately.

### Mechanical owning-declaration export (Review 28)

`export-declaration-alignments.mjs` reads every published SOP source at the catalogue's knowledge commit, independently of messages and model output. It derives every domain inventory status through one relational join: authored family identity, library effective inherited slots, exact property key or an owning `core.word` meaning. Child overrides follow `World.schema`; ambiguous meanings remain separate candidates. No hand-written per-property table is an input. Missing broad family identities and missing/ambiguous aliases are knowledge-authoring work, not reader exceptions.

The export retains enum, kind, type/by, provider values and their explicitly owned aliases, cardinality and numeric limits. Typed temporal values retain their declared parser/context obligation. It does not infer relative dates, qualitative regions, live references or native effects from a property identity. Missing parent declarations contribute no inferred slots. Schema and fact identities use the library's separate namespaces. Cycles, conflicting source identities and exhausted source/join/value bounds fail generation.

The measured whole-source results are in `training/results/declaration-alignments.md`; detailed value contracts can be regenerated as JSON outside Git. These proposals do not replace the deployed bindings or authorize admission. In particular `text.about` has two declared meanings (`topic` and `about`); its previous authorial alignment is not evidence that the mechanical join is unique.

## Containment (2026-11-20)

The exporter publishes `containment` rows: a kind family whose entity declares an optional slot typed by another
family's entity of the same area lies in that family (`w.diagram.node.diagram` is a `w.diagram.diagram`; a required
typed slot such as a line's ends is a thing the member needs, not where it lies). The bridge reads a new target whose
kind lemma has no row for its own type, but names a kind (or an ambiguity) of exactly one container family, as a
member of its own family ("a diagram with 5 nodes": five nodes on the page); the slot is the declaration of the kind
evidence. An existing target is never re-read this way. See `specs/diagram-reading-analysis.md`.

## Native-chain coverage (2026-11-20)

For the areas with a declared native interface (`NATIVE_CHAIN_AREAS`: diagram, drawing) the exporter binds every
inventory key that an operation parameter can consume, generated from the interface's SOP declarations
(`declaredOperations` over `native-interface.sop`, no area instance) and the catalog: the reader family's source type
(the interface's source type named by the family, or `SOURCE_TYPE_OF`), the parameter the descriptor names or the
parameter of the key's name (or its other spelling) on that source type, and as concept the family entity's catalog
slot of that name, a reviewed concept already bound to the same parameter, or the native parameter itself
(`<sourceType>.<parameter>`, evidence: the interface file). Reviewed catalogue alignments keep precedence. Every
inventory key appears in the artifact's `coverage` list as bound or unbound with its reason (`no-native-parameter`,
`no-native-source-type`); `tests/binding-coverage-declared-host.test.mjs` re-checks the reasons against the current
interfaces and fails when an interface gains a parameter the deployed bindings do not bind.
