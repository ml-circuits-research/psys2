# 08 — Training data from worlds (generators and rule-derived records)

Every world prepares material for the encoder formalizer (vision §5–6) without any training happening yet. Two sources:

1. **Rule-derived records** — the inputs of `tests.sop` and the `example=` entries of `patterns.sop`, formalized by the rule strategy. Label status `rule-derived`.
2. **Generator-backed records** — a world may ship `datagen.mjs`, an executable generator that builds a formal situation and its text together, so the expected circuit is known independently of the formalizer (vision §6: "deterministic generators retain their symbolic seed, expected circuit and text realization parameters").

## `datagen.mjs` contract (browser-safe, no imports outside the world)
```js
export const version = '1';
/** rng(): seeded uniform in [0,1). Returns at most `count` examples. */
export function generate({ rng, count }) {
  return [{
    text: 'Mia has 7 marbles.',
    expect: '@x1 kids.arith.holding owner=$e.mia count=7 item=marble',   // SOP Lang; ids are placeholders; null = no wire expected
    group: 'arith.has',              // template / problem family: one split per group (no leakage)
    phenomenon: 'statement',         // statement | question | request | negation | coreference | ellipsis | multi-entity | out-of-domain ...
    context: ['Mia has 3 marbles.'], // optional preceding messages in the same session
    negative: false,                 // true: text that must NOT be formalized by this world
  }];
}
```
- Coverage over volume: every pattern family, every phenomenon the world claims, and hard contrasts (two entities in one sentence, negation, near-miss wording, other worlds' sentences as negatives).
- Values come from the world's lexicons and KB, so new vocabulary automatically widens the data.

## Export (`scripts/export-training.mjs`)
- Runs each world's tests/examples (rule-derived) and generators (with a fixed seed per world, recorded).
- For generator records it formalizes `text` (after `context`) with the rule strategy and compares canonical wires with `expect`, ignoring ids and bookkeeping keys (`core.source`, `core.seq`, `core.via`, `core.in`). Status: `generator-backed` (agree), `generator-disagrees` (kept, flagged: either a pattern gap or a generator bug — both are useful), `negative`.
- Writes JSONL (`training/data/<world>.jsonl`) with the record fields of `training/README.md`, plus `label_status`, `phenomenon`, `group`, `split` (by group hash), `seed`, `generator_version`, and a per-world report (`training/data/report.json`: counts per status, phenomenon and split, agreement rate between generator and rules).
- The agreement rate is also a coverage metric for the rule formalizer.
