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
