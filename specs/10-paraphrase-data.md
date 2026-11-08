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
Ten tasks per batch, ten variants per task. `tab` is the id of the tab the user is looking at (the routing context, ADR-004).

## 2. Run (`scripts/collect-paraphrases.mjs <file|dir> [--report]`)
For every attempt (canonical, retry, variant) a fresh dialog session is created, `ui.shell` state `activeTab` is set to `tab`, the `setup` sentences are sent, then the text. Deterministic, no network. Recorded: reply text, statuses, wires (SOP Lang of the parsed segments), state diff, effects, routed-to worlds.

Canonical grade: `success` (every segment parsed), `partial` (some segments unparsed), `fail` (nothing parsed). Attempts stop at the first `success`; later phrasings in `canonical_retries` are tried only after a failure. A failing canonical is written to `out/<world>.retry.json` and printed, so the agent can add another phrasing to `canonical_retries` and rerun.

## 3. Paraphrase-anchor labelling
The canonical is the anchor: its reading is trusted (the system understood it, the agent confirmed the goal). Each variant is compared with it after id normalization (wire ids renamed by position, bookkeeping keys and `core.agent` dropped):
- `rules-agree` - same normalized SOP, or the same non-empty state diff or effects. Target = the variant's own reading (`target_from=rules`).
- `rules-differ` - parsed but a different reading (possibly a wrong route: a docs reader answering a counting question). Target = the canonical's SOP (`target_from=canonical`).
- `rules-fail` - unparsed. Target = the canonical's SOP.
If the canonical is only `partial`, variants that take their target from it are `needs_review`. If it failed, variants get no trusted target: parsed ones are `rules-unverified` (own reading, `needs_review`), unparsed ones have `target_from=null`.
Canonical records carry `canonical-ok`, `canonical-partial` or `canonical-failed`.

## 4. Why all attempts are kept
Failures are the most valuable rows: a `rules-fail` or `rules-differ` variant with the canonical target is exactly what the encoder must learn and the rules cannot. Failed canonicals document pattern gaps (and become `retry` entries), `rules-agree` rows measure coverage of the rules (`variant_rules_coverage` is a coverage metric next to the agreement rate of spec 08). Each record keeps its `attempt` number, so nothing is silently overwritten.

## 5. Output
`training/paraphrases/out/<world>.jsonl`: spec 08 record shape (`example_id`, `lineage`, `source_group`, `group`, `text`, `context` = setup, `expected_circuit`, `label_status`, `phenomenon` = canonical|variant, `split`; `mentions`/`keys`/`references` empty: spans are not derived from paraphrases) plus `goal`, `mode=paraphrase`, `author`, `attempt`, `target_from`, `needs_review`, `setup`, `tab`, `batch`, `task`, `reply`, `status`, `wires`, `state_diff`, `effects`, `routed_to`. Records with `needs_review` or without `expected_circuit` are excluded from training until a person or a stronger teacher confirms them. Also `out/<world>.retry.json` and `training/paraphrases/report.json` (per world: tasks, attempts, canonical success rate, variant label counts, `variant_rules_coverage`, review count, split counts, retry list). Inbox, out and report are small and committed. Running one file replaces only the records of its own batch.

## 6. Splits and leakage
`group` = world + slug of the task's `goal`; the split (`splitOf`, spec 08) is by group, so the canonical and all variants of a goal, and the same goal in other batches, fall on one side. Paraphrases never straddle train and dev. Dev and test for the ablation (training/README.md) are drawn from groups, and evaluation also reports dev rows of datagen and paraphrases separately: paraphrase dev is the measure of generalization to human wording.

## 7. Relation to datagen.mjs
datagen gives volume, exact symbolic labels and coverage of phenomena; paraphrases give wording diversity and real failures. Both feed one training set per world (mode `generator` / `paraphrase`); the anchor target is always a circuit the rules (or a reviewed teacher) produced for the same goal.
