# PSys2 — PragmaticSystem2

**A neurosymbolic assistant that runs entirely in your browser.** There is no server and no large language model.

- **Neural models propose.** A small dispatcher (DistilBERT) cuts a message into parts and proposes which world each part belongs to; a small normalizer (FLAN-T5 small) rewrites a part only when nothing else reads it.
- **Symbolic worlds decide.** Formal rules (SOP Lang) turn each part into wires, a value checker confirms that numbers, names and negations are the ones you said, and a world must validate the meaning before anything happens.
- **It tells you what it did not understand.** Partial understanding, spell checking, best-effort reading and a discourse layer (follow-ups, clarifications) work on top; what no world validates is refused, never invented.
- **Worlds and tabs.** Each world is a small package of knowledge, operations and tests (arithmetic, shopping, animals, drawing, charts, maps, music, chess, documents, an editor, an avatar, and more); most have a tab in the page.
- **Small enough for the page.** The models are tiny enough to run in the page: about 64 MB (dispatcher) plus 95 MB (normalizer), downloaded once and cached in your browser.

```text
 your message (typed or spoken, English or Romanian)
        |
        v
 translate to English at the boundary (rules, or the browser's on-device translator)
        |
        v
 dispatcher (DistilBERT)  --- cuts the message, proposes worlds per part ------+
        |                                                                       |  small neural models
        v                                                                       |  (propose only)
 normalizer (FLAN-T5 small) --- only when nothing reads a part, always checked -+
        |
        v
 SOP Lang formal layer: rule formalizer + spell checking + best effort + discourse layer
        |
        v
 value checker (numbers, names, negation)  --- rejects a proposal that changes what you said
        |
        v
 interpreter --- runs the wires on a world; nothing runs unless a world validates it
        |
        v
 worlds and tabs --- answer from templates, update state, drive the tabs (avatar, editor, games, ...)
```

**What runs where.** Everything runs in the browser (ONNX Runtime Web, WASM): the rules, the worlds, the interpreter and the two small models. The page is static files; there is no backend and no call to an LLM service.

**Headline numbers** (`training/RESULTS.md`): on the 1240 authored English test messages the full pipeline answers 98.6% correctly and 0.4% wrongly (the rules alone: 95.4% and 0.5%); on 2480 Romanian cases 84.7% and 2.7%. The sets were written by us and the rules were widened by reading them, so real users will see lower numbers.

**Demo:** open [`docs/webchat/index.html`](docs/webchat/index.html) through any static web server (for example `npx serve docs`). **Licence:** AGPL-3.0-only (see below).

- Vision: [`vision/PSys2-vision-v1.md`](vision/PSys2-vision-v1.md) (source: `.docx`)
- Specifications: [`specs/`](specs/README.md)
- Rules for contributors and agents: [`AGENTS.md`](AGENTS.md) — everything in English
- Documentation: [`docs/`](docs/index.html); browser demo: [`docs/webchat/`](docs/webchat/index.html)

```bash
npm run test:smoke               # smoke suite (under 2 minutes, every commit)
npm test                         # full suite (before a webchat publish, after a re-vendor, daily); add PUPPETEER_CORE for the browser matrix
node src/cli.mjs chat            # terminal dialog (C2)
node src/cli.mjs test-world all  # world competency tests
node src/server/index.mjs        # HTTP API on :8080
```

## Licence

AGPL-3.0-only (see `LICENSE`; relicensed from GPL-3.0 on 2026-11-09). Vendored libraries keep their own licences, listed in `docs/webchat/vendor/README.md`; all are compatible with AGPL-3.0. Anyone who uses the demo over a network can get the source from this repository.
