# Specifications

The vision (`vision/PSys2-vision-v1.md`) defines the target architecture. These specs define the contracts of what is being implemented now; where they narrow or amend the vision, an ADR in `decisions/` says so.

| Spec | Scope |
| --- | --- |
| [01-soplang.md](01-soplang.md) | SOP Lang v1 syntax, parser API, canonical form, core keys |
| [02-legends-and-worlds.md](02-legends-and-worlds.md) | Legend format, key resolution, world directory and manifest, lexicons, tests |
| [03-rule-formalizer.md](03-rule-formalizer.md) | Rule-based formalization strategy: normalization, patterns, entities, router |
| [04-interpreter.md](04-interpreter.md) | Main interpreter, questions, requests, operations, result envelope, rendering |
| [05-translation.md](05-translation.md) | Translation to English at the system boundary (draft) |
| [06-dialog-server-webchat.md](06-dialog-server-webchat.md) | C2 dialog pipeline, loaders, HTTP API, CLI, browser webchat |
| [decisions/ADR-001](decisions/ADR-001-rule-formalizer-and-fixture-worlds.md) | Rule-based formalizer and fixture worlds |
| [decisions/ADR-002](decisions/ADR-002-translation-strategies-and-speech.md) | Translation strategies (rules, small CPU models, browser API) and speech in the webchat |
| [decisions/ADR-003](decisions/ADR-003-rules-profile-simplifications.md) | Deliberate simplifications of the first implementation |
| [07-tool-worlds-and-demo.md](07-tool-worlds-and-demo.md) | Tool-use worlds (app shell, robot avatar, document editor, games), state and effects contract, hands-free demo page |
| [decisions/ADR-005](decisions/ADR-005-dispatcher-and-rule-validation.md) | Dispatcher proposes, rule formalizers validate (spec 03 section 7) |
| [08-training-data.md](08-training-data.md) | Training data from worlds: generators (datagen.mjs), rule-derived records, export and reports |
| [11-discourse.md](11-discourse.md) | Discourse layer: frames, ellipsis, pending clarifications, coordination |
| [decisions/ADR-006](decisions/ADR-006-discourse-layer.md) | Rule-based discourse layer |
| [13-discussions.md](13-discussions.md) | ASTRA: discussions, world instances, dialogue moves, task frames, focus, event log and persistence |
| [decisions/ADR-008](decisions/ADR-008-astra-discussions.md) | ASTRA as a core library with a compatibility layer over per-world state |
