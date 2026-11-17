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
