# PSys2 — PragmaticSystem2

An assistant that builds, uses and improves explicit computational worlds. Natural language is formalized into SOP Lang wires; deterministic interpreters answer questions and execute tasks. No generative language model is used in operation (C2).

- Vision: [`vision/PSys2-vision-v1.md`](vision/PSys2-vision-v1.md) (source: `.docx`)
- Specifications: [`specs/`](specs/README.md)
- Rules for contributors and agents: [`AGENTS.md`](AGENTS.md) — everything in English
- Documentation: [`docs/`](docs/index.html); browser demo: [`docs/webchat/`](docs/webchat/index.html)

```bash
npm test                         # all tests
node src/cli.mjs chat            # terminal dialog (C2)
node src/cli.mjs test-world all  # world competency tests
node src/server/index.mjs        # HTTP API on :8080
```

## Licence

AGPL-3.0-only (see `LICENSE`; relicensed from GPL-3.0 on 2026-11-09). Vendored libraries keep their own licences, listed in `docs/webchat/vendor/README.md`; all are compatible with AGPL-3.0. Anyone who uses the demo over a network can get the source from this repository.
