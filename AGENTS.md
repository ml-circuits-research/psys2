# AGENTS.md — rules for anyone (human or agent) working in this repository

## Language
- **Everything in this repository is in English**: code, identifiers, comments, commit messages, specs, docs, legends, worlds, tests, knowledge-base contents.
- Input in other languages (for example Romanian) is translated to English by `src/translate/` **at the system boundary**. Nothing stored in a world, knowledge base, episode or journal is in another language; the original text is kept only as a source record referenced by `core.source`.
- **Principle (owner, 2026-11-16): English only, everywhere; other languages exist only in the interface.** Code, tests, worlds, knowledge, test data and dialogue suites contain nothing in Romanian or any other language. Another language appears only when the user selects it in the interface; then the text is translated at the boundary with the browser's translation APIs, and everything behind the boundary stays English. When the owner gives examples in Romanian (or any other language), translate them to English and use the English version in tests, dialogue suites and everything else; never keep the original wording in the repository.

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
- Node.js ≥ 20, ES modules only, `.mjs` extension. Core modules use only the Node standard library; modules that must also run in the browser (`src/soplang`, `src/legends`, `src/formalizer`, `src/interpreter`, `src/translate`, `src/dialog`, `src/lang`) must not import `node:*` — file access goes through a loader passed in by the caller.
- Open-source libraries are allowed for the **browser host UI** (avatar, games, editor widgets, speech helpers), never in the core. They are vendored as **one bundled file per library** under `docs/webchat/vendor/` (built with a bundler in a temporary directory, not added to `package.json`), each with a header comment naming the library, version, source URL and licence, and listed in `docs/webchat/vendor/README.md`. The project is licensed under AGPL-3.0-only (user decision 2026-11-09); licences must be compatible with it (MIT, BSD, Apache-2.0, ISC, MPL-2.0, CC0, CC BY 4.0, GPL-3.0 through section 13 of both licences). Prefer no library when a few dozen lines of our own code do the job.
- Python lives under `training/` with pinned requirements; it is never imported by the Node core, only run as a separate process.
- Every behaviour is specified in `specs/` before or together with its implementation. If code and spec disagree, fix one of them in the same commit.
- No generative LLM is used in C2 (operation). LLMs may only be used by coding agents during C1/C3 authoring. Exception (user decision 2026-11-08): a small seq2seq **normalizer** (about 100M parameters at most, e.g. T5-small) may run in C2. It only proposes a simpler phrasing, which the world's rules must formalize and a value checker (numbers, names, negation) must accept; the rules stay the only formalizer.
- Worlds marked `status=fixture` are hand-built platform fixtures and demos; they are not produced by the C1 workflow and must say so.
- Tests: `npm test` must pass before committing. Every world ships `tests.sop` and must pass `node src/cli.mjs test-world <id>`.
- New phrasing goes into `worlds/lang.common` (a `core.phrase` group) or a `core.shape`, never inline in a world's patterns (ADR-007).
- Commits go directly to `main` (no pull requests for now). Small, descriptive commits.

## Generic or listed (owner, 2026-11-15)
- A case is won only by a generic piece: a world declaration, knowledge, language-world facts, a composition of worlds, a planning or reasoning method, a library mechanism. Never a pattern, special case, sentence or world id in host code to make a case pass. Otherwise the case stays, honestly, on the list of cases waiting for a generic solution ("needs <generic piece>").
- Acceptance in two phases: during the move from patches to generic mechanisms, losing cases won only by patches does not count; once the patches are gone, a loss needs very good arguments and is accepted only for a large gain (about 10 real turns won per 1 lost), each loss listed honestly.
- Use the agent skills of the sopworld library (`../soplang-words-lib/skills/`, see its README): `author-live-world` before writing or changing a world, `propose-generic-method` before building a new mechanism, `improve-world-from-failures` / `consolidate` for batches of real failures, the honest-list format in `skills/HONEST-LIST.md`.

## Data principle: industrial research, not fundamental research
- We never have too much training data. Good data is never deleted or held back from training to keep an evaluation pure.
- Overlap between training and test data is acceptable: when a test set gets contaminated, we generate a fresh test set (as with `training/paraphrases/heldout/`) instead of removing training data.
- The goal is that the system handles what real users ask, not that a model generalizes in a research sense. In production we keep learning from user phrasings (phrase logs) and add them to training, even when this makes the evaluation less clean.

## Worker sessions (training on the DGX Spark)
- A worker agent starts from `worker-tasks.md` and follows its protocol: `worker-tasks.md` is written and managed only by the reviewer (validated tasks move to "Validated", failed ones are rewritten); the worker appends questions to `questions.md` (never deletes) and progress to `worker-log.md`. The reviewer does not commit code: all code changes are made by the worker.
- Do not spend compute on results that pending work will invalidate. Before starting a long training run or a full evaluation (operational set, checkpoint sweeps, dataset rebuilds), check the open and running tasks: if changes to rules, labels, data, checkers or the runtime are about to land, finish and merge those first, then run one combined rebuild/retrain/evaluation. If such a change lands while a run is in progress, cancel the run instead of finishing it. While changes are in flight, use quick targeted checks (unit tests, `test-world`, small smoke runs) only.

## Way of working: bottom-up and top-down at the same time (owner, 2026-11-16)

Step-by-step delivery with a test gate per stage is a software habit and is not the method here. Work from both ends at once, in parallel lanes, each with its own agent:

- Bottom-up: train SOP-BERT now on the reader dataset (sibling repository `webmeet-dataset`, loaded by `official-dataset/sop_dataset.py load`; label inventory `official-dataset/inventory.json`); the tools of the four areas largely exist already, so bind them to the declared acts directly.
- Top-down: the library tries to bind complex commands (several requests, selectors and results, quantifiers, relations, follow-ups) end to end and publishes the general mechanisms they need.
- Simple commands (draw, add, move, recolour, remove, schedule, write) must work in all four areas from the first round, in parallel, as soon as the reader recognises them. Do not widen one construction at a time and do not wait for one area before starting another.
- Tests stay, but they accompany each lane; they are not a sequence of stages that blocks the other lanes. Where a lane needs a mechanism that is not published yet, it lands what it can and says honestly what is not yet verified.
- There is only the new system: no old path, no engine switch, no fallback to old readers.
