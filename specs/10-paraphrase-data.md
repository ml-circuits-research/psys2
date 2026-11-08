# 10 - Paraphrase data (human-like commands, anchor labelling)

`datagen.mjs` (spec 08) produces text from templates, so its wording is only as varied as its author. Real users type "tom's apples?", "how many apples has tom got now", "ana gve tom 3 pears". This pipeline lets small LLM agents (Claude Haiku, run as coding agents, authoring time only - AGENTS.md) write such phrasings, runs them through the system and keeps every outcome as training data for the per-world encoder formalizers.

## 1. Inbox batch
`training/paraphrases/inbox/<world>.<batch>.json`:
```json
{ "world": "kids.arith", "tab": "arith", "author": "haiku-1", "batch": "b1",
  "tasks": [ { "id": "t01", "goal": "plain words: what the user wants",
               "setup": ["Tom has 5 apples."],            // optional English sentences run first
               "canonical": "How many apples does Tom have?",  // a phrasing the agent expects the system to understand
               "canonical_retries": [],                    // further canonical phrasings, tried in order if the first fails
               "variants": [ "10 human-like phrasings: casual, short, typos, polite, indirect, voice-style" ] } ] }
```
**Rule for the authors (review F1): every variant keeps the instance's parameters.** All variants of a task say the same thing as the canonical with the same numbers, names, colours, notes, places and quantities, and run in the same `setup`; only the wording changes. Changing a parameter ("3 flats" -> "4 sharps") is a **new task** with its own canonical, never a variant. A variant that cannot keep the parameters (it needs another setup) is a new task too. The collector enforces this: a variant whose values differ from the canonical's never inherits the canonical's target (section 3).

Ten tasks per batch, ten variants per task. `tab` is the id of the tab the user is looking at (the routing context, ADR-004).

## 2. Run (`scripts/collect-paraphrases.mjs <file|dir> [--report]`)
For every attempt (canonical, retry, variant) a fresh dialog session is created, `ui.shell` state `activeTab` is set to `tab`, the `setup` sentences are sent, then the text. Deterministic, no network. Recorded: reply text, statuses, wires (SOP Lang of the parsed segments), state diff, effects, routed-to worlds.

Canonical grade: `success` (every segment parsed), `partial` (some segments unparsed), `fail` (nothing parsed). Attempts stop at the first `success`; later phrasings in `canonical_retries` are tried only after a failure. A failing canonical is written to `out/<world>.retry.json` and printed, so the agent can add another phrasing to `canonical_retries` and rerun.

## 3. Paraphrase-anchor labelling (review F1: every variant keeps its own parameters)
The unit of a task is a **semantic instance**: operation + arguments + context (`setup`). The **operation family** is the goal (`family` = `group`, used for splits); the instance is `instance_id`. A variant is a different wording of the same instance, never of the same family with other values. The canonical is the anchor for the operation, but its target is **not** copied onto a variant whose values differ.

Each variant is compared with the canonical after id normalization (wire ids renamed by position, bookkeeping keys and `core.agent` dropped, order of actions kept - F2). Slot values are the non-structural entries of the parsed wires (arguments, entity names; flags and default quantity 1 are not checked). A reading is **faithful** to a text when every slot value occurs in the text (numbers as digits or number words, words by substring or stem) and every number in the text is held by some slot.
- `rules-agree` - the rules parse the whole variant and give the same normalized SOP (or the same non-empty state diff or effects). Target = the variant's own reading (`target_from=rules`).
- `rules-own` - the rules parse the whole variant, the SOP differs from the canonical's, but the reading is faithful to the text. Target = the rules' own reading (`target_from=rules`). This is how "a key with 4 sharps?" keeps n=4, acc=sharp although the canonical is "What key has 3 flats?".
- `rules-differ` / `rules-fail` - the rules' reading is not faithful (parser error) or the variant is unparsed or only partly parsed (parser gap). The canonical's target is inherited (`target_from=canonical`) **only when the canonical's values match the variant's text**: every canonical slot value occurs in it and it mentions no number the canonical does not hold.
- `needs_review` - anything else (the variant carries values the canonical does not, and the rules do not read it faithfully). `target_from` is empty and the record stays out of training until it is relabelled by a person or a stronger teacher. `label_reason` says why (`parser-error-other-values`, `unparsed-other-values`, `partial-parse-other-values`).
If the canonical is only `partial`, variants that take their target from it are `needs_review`. If it failed, variants get no trusted target: parsed ones are `rules-unverified` (own reading, `needs_review`), unparsed ones have `target_from=null`.
Canonical records carry `canonical-ok`, `canonical-partial` or `canonical-failed`. The F1 audit (`scripts/audit-f1-labels.mjs`, `training/results/f1-label-audit.json`) separates **labelling errors** (an inherited target contradicting the variant's text) from **parser errors** (the rules' own reading is not faithful) and **parser gaps** (nothing parsed).

### 3.1 The labelled world reads (label repair)
A label is the reading of **the world it names**: the collector formalizes canonicals and variants in a session restricted to the batch's world (`scripts/lib/world-set.mjs`), never over all worlds (that wrote `music.melodyAdd` for a kids.tasks sentence). A note name written `F#` counts as `f_sharp` and a one- or two-letter value ("d") must be a whole word of the text.
`scripts/relabel-training.mjs` audits every source record (training/data and paraphrases/out) with the same restricted reading and repairs the causes found by the phase analysis: `gold_target_from_another_world` (action not defined by the world, or the all-worlds router's reading), `gold_value_not_in_text` (context included: ellipsis takes values from it), `label_says_rules_differ` (generator-disagrees / rules-differ) and promotion of `needs_review` variants that the world reads completely and faithfully. Repair = the world's reading when it is complete and faithful (label_status `relabelled`, `target_from=rules`), else for a variant the canonical's circuit when its values match the text (`rules-fail`), else `needs_review` (label_reason `relabel:<cause>:unreadable`; text and world stay, and `build-dataset` keeps such rows in `routing.jsonl`). Originals are kept in `label_status_orig` and `circuit_orig`. The "plain" multi-command variant lower-cases the text, so the gold of its segments lower-cases string values too (`lowerStrings` in `scripts/lib/dispatch-gold.mjs`). Counts per cause before and after: `training/results/relabel-training.json`.

## 4. Why all attempts are kept
Failures are the most valuable rows: a `rules-fail` or `rules-differ` variant with the canonical target is exactly what the encoder must learn and the rules cannot. Failed canonicals document pattern gaps (and become `retry` entries), `rules-agree` rows measure coverage of the rules (`variant_rules_coverage` is a coverage metric next to the agreement rate of spec 08). Each record keeps its `attempt` number, so nothing is silently overwritten.

## 5. Output
`training/paraphrases/out/<world>.jsonl`: spec 08 record shape (`example_id`, `lineage`, `source_group`, `group`, `text`, `context` = setup, `expected_circuit`, `label_status`, `phenomenon` = canonical|variant, `split`; `mentions`/`keys`/`references` empty: spans are not derived from paraphrases) plus `goal`, `family`, `instance_id`, `label_reason`, `mode=paraphrase`, `author`, `attempt`, `target_from`, `needs_review`, `setup`, `tab`, `batch`, `task`, `reply`, `status`, `wires`, `state_diff`, `effects`, `routed_to`. Records with `needs_review` (label_status `needs_review`) or without `expected_circuit` are excluded from training until a person or a stronger teacher confirms them. Also `out/<world>.retry.json` and `training/paraphrases/report.json` (per world: tasks, attempts, canonical success rate, variant label counts, `variant_rules_coverage`, review count, split counts, retry list). Inbox, out and report are small and committed. Running one file replaces only the records of its own batch.

## 6. Splits and leakage
`group` = world + slug of the task's `goal`; the split (`splitOf`, spec 08) is by group, so the canonical and all variants of a goal, and the same goal in other batches, fall on one side. Paraphrases never straddle train and dev. Dev and test for the ablation (training/README.md) are drawn from groups, and evaluation also reports dev rows of datagen and paraphrases separately: paraphrase dev is the measure of generalization to human wording.

## 7. Relation to datagen.mjs
datagen gives volume, exact symbolic labels and coverage of phenomena; paraphrases give wording diversity and real failures. Both feed one training set per world (mode `generator` / `paraphrase`); the anchor target is always a circuit the rules (or a reviewed teacher) produced for the same goal.
