# ADR-006: Rule-based discourse layer

Status: accepted

## Context
Conversations broke at the second turn: "And from Berlin?", "Now bigger", "again", "Draw" (then "a cat"), "... and a beard". Each utterance was routed alone, so fragments went to whichever world had a catch-all pattern (charts, music, hangman, chess).

## Decision
A small module (`src/dialog/discourse.mjs`, spec 11) keeps the last 5 formalized requests and questions as frames and one pending expectation. Fragments are resolved by copying a frame's sentence, replacing the slot that fits the fragment and running the unchanged rule formalizer restricted to the frame's world (a candidate is only accepted when it is fully understood there). Operations that lack a required argument return `status=missing` with a `pending` hint and a question; the next reply is tried as the filler first. Modal yes/no offers use the same record. No pattern is added for fragments themselves, so the rules stay the only formalizer and every resolution is explainable in the trace.

## Consequences
- Generic: worlds only need a frame-able pattern (all request and question patterns qualify) and, for clarifications, a tiny bare pattern plus an op returning `pending`.
- The rewritten sentence goes through the normal validator, so wrong guesses mostly fail to parse and fall back to normal routing.
- Cost: up to slots x variants x frames formalizations (restricted to one world), only for marker-led or unparsed fragments.
- Limitation: the replacement is textual, so a frame whose slots do not map back to its text (expanded clauses) cannot be edited, only repeated.

## Amendment: phase 2 (meta-dialogue)
Repairs, cancellation, attribute and ordinal references, degree fragments, choice questions, list-entry mode, repeat and explain, feedback and topic return follow the same principles: rule-based, generic, explainable in the trace (`trace.discourse.meta`). Undo is a restore of the world-state snapshot taken for each effectful turn, so no world needs an undo hook; worlds only add optional read-only hooks `referents(ctx)` and `summary(ctx)`. Choice and offer expectations live one turn like `fill`; the list mode repeats until ended. Shared vocabulary is in `src/dialog/lang.mjs` until the reusable library (worker-tasks L) absorbs it as `ctx.lang`. Spec 11 sections 6-9.
