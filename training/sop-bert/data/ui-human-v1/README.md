# Human paraphrases of executed UI commands, version 1

This is C1 authoring data. No language model runs in the application.

Every seed is a command from [`ui-natural-v1`](../ui-natural-v1/README.md) that was executed through `invokeNativeControl` against the real editor. There is one seed per (editor, native operation, constraint-key set): **188 seeds** across Drawing (42), Diagram (48), Documents (48), Avatar (36) and Calendar (14). Coding agents wrote 24 variants per seed following [`INSTRUCTIONS.md`](INSTRUCTIONS.md). [`assemble.py`](assemble.py) validates them mechanically and writes `examples.jsonl`.

| Tier | Meaning | Examples |
| --- | --- | ---: |
| equivalent | Same constraints, different verb, register, word order and sentence type | 1,894 |
| complex | Longer and natural: a reason, discourse markers, an object named by a description from the context | 940 |
| simplified | Optional values left out, or turned into a vague phrase that the world should resolve ("near the top", "smallish", "in the morning") | 1,450 |

There are **4,284 accepted examples**. All 228 rejections were duplicates of earlier texts in this set or in `ui-natural-v1`; `report.json` has the counts and samples.

## How labels are derived

- Labels are copied from the seed's request graph. Each authored surface replaces the seed's span only after `assemble.py` finds it **verbatim** in the text. Spans are Unicode-scalar positions of the first occurrence. The 144 examples where a surface occurs more than once are listed in `ambiguousSurfaces`.
- A left-out optional value is removed from `constraints` and recorded under `completion.requirements` with `requirement: omitted`.
- A vague value stays as a constraint with `value: null`, `value_span` set to the phrase and `qualitative: true`. It is also recorded under `completion.requirements` with the seed's precise value as `seedValue`. That value is a reference realization, not gold.
- Mandatory constraints (selectors and required native parameters) are never left out or made vague.
- **3,483 examples carry `nativeTool`.** For these, the same constraint keys were executed for the seed's recipe family, either in the seed itself or in an executed omission subset (`linkedExample`). Examples with vague or unexecuted subsets keep `nativeTool: null`. Whether the library completes them as expected has **not** been measured.

## Use and limits

- Keep cohorts intact when splitting: join on `cohort.recipeFamily`, and do not divide one seed's variants between partitions.
- The checks are structural. They prove that each surface is a substring of its text and that only optional values were dropped. They do not prove that every variant means what its seed means. A sample review found a few calendar "complex" variants that add an extra request ("…now please add a short planning meeting"). Review or filter these before reporting quality.
- Labels for qualitative constraints (`value: null`) need a declared representation in the reader preparer. Until it has one, train on the `equivalent` and `complex` tiers and on `simplified` rows without `qualitative`.
- Regenerate: `python3 seeds.py` (seeds and batches), author `out/bNN.jsonl`, then `python3 assemble.py`.
