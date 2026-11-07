# ADR-001 — A rule-based formalization strategy and hand-built fixture worlds

Status: accepted (2026-11-07). Amends vision v1 §1, §5 and §16.

## Context
Vision v1 makes encoder-based formalization (ModernBERT + per-world LoRA) the only formalizer and states that domain worlds must come from the C1 workflow, not be hand-maintained. Two needs are not covered by that:
1. A formalizer that runs without a GPU and without a trained model: to bootstrap worlds quickly, to produce and check training data for the encoder, to test the platform, and for deployments where speed matters more than coverage of linguistic nuance (CPU-only machines, the browser).
2. Small worlds that exist **before** C1 is automated, so that the parser, interpreter, dialog, router and webchat can be built and tested end to end.

## Decision
- Add `formalization=rules` as a declared formalization strategy (spec 03), alongside the encoder strategy. It obeys the same output contract: wires with source spans, typed against legends, validated before use, no generated values.
- The rule strategy is deterministic and never invents values: every slot value is a span of the input (after normalization) or an atom fixed by the pattern.
- Worlds built by hand are marked `status=fixture`. They are platform fixtures and demos; they do not count toward C1 acceptance targets and are not presented as autonomously learned.
- Rule-formalized output may be exported as encoder training data with label status `rule-derived`, which is distinct from `generator-backed`, `mechanically checked` and `teacher-only` (vision §6).

## Consequences
- C1 skills may later author `patterns.sop` as well as encoder data; a world may declare both strategies, with the encoder preferred where it is accepted.
- The rule strategy's coverage is limited by its patterns; unparsed input is reported, never guessed.
