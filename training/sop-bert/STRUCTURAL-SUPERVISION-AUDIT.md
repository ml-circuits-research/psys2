# Structural supervision in clean source annotations

This is a read-only inventory of original Haiku v1/v2 annotation fields, after excluding the 1,648 functional-development IDs. It generates no semantic graph labels and reads no final heldout dataset. Ordered JSON containment is explicit; canonical graph identity, scope and reference semantics require a separately reviewed conversion.

| Split | Source version | Rows | Requests | Nested targets | Nested constraints | Both selector/result phases |
|---|---|---:|---:|---:|---:|---:|
| train | haiku-v1 | 14309 | 15812 | 0 | 0 | 0 |
| train | haiku-v2 | 14650 | 17337 | 17337 | 22254 | 825 |
| calibration | haiku-v1 | 1610 | 1760 | 0 | 0 | 0 |
| calibration | haiku-v2 | 1698 | 2000 | 2000 | 2549 | 105 |

Across clean training/calibration: 28,959 / 3,308 source rows, including 611 / 81 explicitly empty request arrays. These directly supervise utterance presence and exact request count. All request/target/constraint explicit-ID counts and numeric source-coordinate-field counts are zero. Row IDs identify source examples, not semantic graph nodes.

Retained evidence:

- v1 has request spans/triggers and flattened answers. It does not retain a nested target/constraint structure.
- v2 nests one target object and an ordered constraint list per request. It supplies scalar mood/act, operator, character, polarity and selector/result phase labels. Training has 20,183 result and 2,071 selector constraints; calibration has 2,282 and 267. This is useful explicit phase supervision, not a graph-edge annotation.
- Scalar constraint grouping labels occur 570 / 67 times (train/cal); target quantifiers 836 / 82 times. The observed fields include all/any/both/each/every_except/none/other/some. There are no explicit group-member reference lists, bound-target identities, binder/body links or scope trees. A scalar “or” label cannot distinguish multiple independent disjunction groups.
- Literal request/value/kind/name/anchor spans are retained and their exact zero/one/multiple occurrence counts are audited. They are strings, not explicit Unicode scalar start/end coordinates. Ambiguous occurrences must not become guessed numeric gold.
- Relation, same, relative-change and unit/anchor evidence is present in scalar fields; full path/type/occurrence counts are in the generated audit. It does not supply canonical goal target refs, typed anchor identities or baseline/binder edges. Do not discard the lexical evidence or invent those edges.
- Raw constraint-key type prefixes differ from target.type on 1,364 / 141 constraints. This is not an annotation-error verdict: part/relationship ownership can require a declared join. It rules out assuming every property key belongs directly to the single target without review.
- Question and turn payloads and context names/kinds/previous prose remain in the path inventory. They are not complete native instance populations, versions or evaluator evidence.

Consequences: text-only presence/count training is directly supported. Scalar and span heads can use supplied fields with explicit unresolved/alignment diagnostics. Full graph training needs reviewed authority for canonical node allocation, constraint ownership/goal joins, group membership, quantifier bindings/scope, source coordinates and operator-specific reference/unit/anchor conversion. No sentence rules or synthetic graph gold were added.

Reproduce from repository root with the recorded environment:

```sh
python3 training/sop-bert/audit-structural-supervision.py --root training/sop-bert --exclude-ids training/eval/functional-matrix/exclude-from-training.json --out ../.session-control/structural-supervision-audit.json
```

Exclusion SHA-256: `66b1ab7f205bedf08c15e3e83f98e3de217922d179e89ae8b99c29a938e29e77` (all 1,648 IDs found; exclusion precedes annotation walking).
Canonical ordered source-manifest SHA-256: `4e2f992dd1ba526d518fb454f715f2bc0181ee6f8ab5c3adee58af1465ace410` (308 files; individual hashes in generated output).
Audit script SHA-256: `6a30ad6efaeffd6cc189b991f9c0b21d5751de63d954ccd91dbd72c6a035f11f`.
Complete generated audit SHA-256: `038cc41a9706bf2c585b93a53a345e9b3cd4cfc5f9625b104e35c2ab5a517484`.

The full path inventory is generated on demand rather than tracked as another large generated corpus. Its report is currently preserved with the local run artifacts.
