# AGENTS.md — rules for anyone (human or agent) working in this repository

## Language
- **Everything in this repository is in English**: code, identifiers, comments, commit messages, specs, docs, legends, worlds, tests, knowledge-base contents.
- Input in other languages (for example Romanian) is translated to English by `src/translate/` **at the system boundary**. Nothing stored in a world, knowledge base, episode or journal is in another language; the original text is kept only as a source record referenced by `core.source`.

## Repository layout
| Path | Contents |
| --- | --- |
| `vision/` | The architecture vision (current: `PSys2-vision-v1.docx` and its Markdown conversion). Changed only by explicit decision. |
| `specs/` | Design specifications (Markdown). The contract every implementation must follow. `specs/decisions/` holds architecture decision records (ADRs). |
| `src/` | The Node.js server and libraries: ES modules (`.mjs`), no external npm dependencies in the core. |
| `worlds/` | Worlds the server loads and learns. One directory per world, named by namespace (`worlds/kids.arith/`). |
| `docs/` | Detailed HTML documentation for every process and component. `docs/webchat/` is a static, server-less browser demo of C2 (built by `scripts/build-webchat.mjs`). |
| `training/` | Python code for model training (encoder adapters). Python is used where it is the robust choice (training, ML inference workers). |
| `scripts/` | Build and maintenance scripts (`.mjs`). |
| `tests/` | `node:test` test suites. Run with `npm test`. |

## Engineering rules
- Node.js ≥ 20, ES modules only, `.mjs` extension. Core modules use only the Node standard library; modules that must also run in the browser (`src/soplang`, `src/legends`, `src/formalizer`, `src/interpreter`, `src/translate`, `src/dialog`) must not import `node:*` — file access goes through a loader passed in by the caller.
- Open-source libraries are allowed for the **browser host UI** (avatar, games, editor widgets, speech helpers), never in the core. They are vendored as **one bundled file per library** under `docs/webchat/vendor/` (built with a bundler in a temporary directory, not added to `package.json`), each with a header comment naming the library, version, source URL and licence, and listed in `docs/webchat/vendor/README.md`. Licences must be compatible with GPL-3.0 (MIT, BSD, Apache-2.0, ISC, MPL-2.0). Prefer no library when a few dozen lines of our own code do the job.
- Python lives under `training/` with pinned requirements; it is never imported by the Node core, only run as a separate process.
- Every behaviour is specified in `specs/` before or together with its implementation. If code and spec disagree, fix one of them in the same commit.
- No generative LLM is used in C2 (operation). LLMs may only be used by coding agents during C1/C3 authoring.
- Worlds marked `status=fixture` are hand-built platform fixtures and demos; they are not produced by the C1 workflow and must say so.
- Tests: `npm test` must pass before committing. Every world ships `tests.sop` and must pass `node src/cli.mjs test-world <id>`.
- Commits go directly to `main` (no pull requests for now). Small, descriptive commits.

## Worker sessions (training on the DGX Spark)
- A worker agent starts from `worker-tasks.md` and follows its protocol: `worker-tasks.md` is append-only and written by the reviewer; the worker appends questions to `questions.md` (never deletes) and progress to `worker-log.md`.
