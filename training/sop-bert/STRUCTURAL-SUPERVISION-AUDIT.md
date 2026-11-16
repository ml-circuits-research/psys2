# Structural supervision in clean source annotations

This is a read-only inventory of original Haiku v1/v2 annotation fields, after excluding the 1,648 functional-development IDs. It generates no semantic graph labels and reads no final heldout dataset. Ordered JSON containment is explicit; local identities and ownership can be mechanically projected from containment; semantic binding, logical scope and reference interpretation require separate decisions.

| Split | Source version | Rows | Requests | Nested targets | Nested constraints | Both selector/result phases |
|---|---|---:|---:|---:|---:|---:|
| train | haiku-v1 | 14309 | 15812 | 0 | 0 | 0 |
| train | haiku-v2 | 14650 | 17337 | 17337 | 22254 | 825 |
| calibration | haiku-v1 | 1610 | 1760 | 0 | 0 | 0 |
| calibration | haiku-v2 | 1698 | 2000 | 2000 | 2549 | 105 |

Across clean training/calibration: 28,959 / 3,308 source rows, including 611 / 81 explicitly empty request arrays. These directly supervise utterance presence and exact request count. All supplied request/target/constraint explicit-ID counts and numeric source-coordinate-field counts are zero. This does not mean missing graph gold: local IDs can be allocated mechanically from list indexes, and unique annotated literals can recover scalar ranges. Row IDs identify source examples.

Retained evidence:

- v1 has request spans/triggers and flattened answers. It does not retain a nested target/constraint structure.
- v2 nests one target object and an ordered constraint list per request. It supplies scalar mood/act, operator, character, polarity and selector/result phase labels. Training has 20,183 result and 2,071 selector constraints; calibration has 2,282 and 267. This is useful explicit phase supervision, not a graph-edge annotation.
- Scalar constraint grouping labels occur 570 / 67 times (train/cal); target quantifiers 836 / 82 times. The observed fields include all/any/both/each/every_except/none/other/some. There are no explicit group-member reference lists, bound-target identities, binder/body links or scope trees. A scalar “or” label cannot distinguish multiple independent disjunction groups.
- Literal request/value/kind/name/anchor spans are retained and their exact zero/one/multiple occurrence counts are audited. They are strings rather than supplied numeric coordinates. A unique annotated request span anchors its unique child spans mechanically; ambiguous occurrences require diagnostics, not guesses.
- Relation, same, relative-change and unit/anchor evidence is present in scalar fields; full path/type/occurrence counts are in the generated audit. It does not supply canonical goal target refs, typed anchor identities or baseline/binder edges. Do not discard the lexical evidence or invent those edges.
- Raw constraint-key type prefixes differ from target.type on 1,364 / 141 constraints. This is not an annotation-error verdict: part/relationship ownership can require a declared join. It does not defeat mechanical request containment or authorize changing the target kind from a property prefix. Property-to-target compatibility belongs to declared binding/resolution.
- Question and turn payloads and context names/kinds/previous prose remain in the path inventory. They are not complete native instance populations, versions or evaluator evidence.

Consequences: text-only presence/count training is directly supported. Scalar and span heads can use supplied fields with explicit unresolved/alignment diagnostics. Local node allocation, nested request ownership and unique-span recovery are mechanical projection, not missing semantic supervision. Full graph training still needs declared canonical kind/property binding, relation goal joins, group membership and quantifier scope where not explicit, and operator-specific reference/unit/anchor interpretation. No sentence rules or synthetic graph gold were added.

Reproduce from repository root with the recorded environment:

```sh
python3 training/sop-bert/audit-structural-supervision.py --root training/sop-bert --exclude-ids training/eval/functional-matrix/exclude-from-training.json --out ../.session-control/structural-supervision-audit.json
```

Exclusion SHA-256: `66b1ab7f205bedf08c15e3e83f98e3de217922d179e89ae8b99c29a938e29e77` (all 1,648 IDs found; exclusion precedes annotation walking).
Canonical ordered source-manifest SHA-256: `4e2f992dd1ba526d518fb454f715f2bc0181ee6f8ab5c3adee58af1465ace410` (308 files; individual hashes in generated output).
Audit script SHA-256: `45c45b6006e613818c1956e6eca6c9c5a17b630b3fba8290ecdc8a6f269fdd82`.
Complete generated audit SHA-256: `b5fac7c0d295499f754ce23596104cc1f1cb7f5f710692cff32b7e518b5c93fe`.

The full path inventory is generated on demand rather than tracked as another large generated corpus. Its report is currently preserved with the local run artifacts.

## Mechanical projection versus semantic decisions

The source annotation instructions explicitly order nonoverlapping request spans and distinguish selector from result. A general authoring projection can allocate `r_i`, `t_i`, `c_i_j` from `row.requests[i]`, its sole nested target and `constraints[j]`; request ownership is direct containment. Keep the annotated primary target and property descriptor; never guess a replacement kind from the property's type prefix. Partitioning constraints by their supplied phase is direct supervision. This does not require the model to predict arbitrary wire names.

33,140 / 33,149 training request spans match uniquely in their source; 9 need ambiguity diagnostics. All 3,760 calibration request spans match uniquely. Another 56,540 / 6,417 child span strings can be located uniquely within a unique annotated request span. These are mechanically recoverable Unicode scalar ranges, not absent labels.

A broad flat phase-partition shape exists for 14,818 / 1,731 requests: new/existing target, no quantifier/group/scope/variety fields, and only value-bearing eq/limit/degree/region conditions. This is a structural shape count, not a claim that every lexical kind, concept or operator is already resolved. Nested annotation-tree prediction is directly trainable; a declared generic binder can form standard graphs where its source identities and operator semantics are unambiguous. Genuine unresolved decisions must remain explicit instead of blocking all graph supervision or inventing group/binder/goal edges. Conjunction policy and nontrivial scalar grouping require reviewed annotation semantics before producing canonical logical edges.

Scalar grouping and quantifier labels are positive supervision, not evidence that all group/binder gold is absent. Single unambiguous alternative sets or explicit bound-target/quantifier combinations can support a declared mechanical transform. Multiple group scopes, nonstandard quantifiers or omitted binder decisions must not be filled by heuristics. The generated mode×quantifier cross-table supports reviewing those cases without inspecting evaluation rows.
