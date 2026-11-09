# Provenance

Source: https://github.com/ml-circuits-research/diagram-vss-demo, commit `9900d34836bf3fc913a6549f3da4c444bfa11304` (2026-11-09).
Licence of the source: **AGPL-3.0**. This repository is GPL-3.0. GPL-3.0 section 13 allows combining with AGPL-3.0 code, but the
copied parts keep their AGPL-3.0 terms (including the network clause) unless the owner of both repositories relicenses them. Both
repositories belong to ml-circuits-research; the owner should confirm the licence before release.
`engine/` files come from `docs/js/`; `docs/js/vss*` (MIT, copied there from vss-demo) was not copied.

| here | source | notes |
| --- | --- | --- |
| `engine/logic.js` | `docs/js/logic.js` | SOP Lang kit, legend (46 questions), plugins, transactional engine, rules formalizer, Datalog reasoner. CommonJS-compatible (`module.exports = SOPKit`); `require('./logic.js').createSystem()` runs in Node. |
| `engine/auto-layout.js`, `templates.js`, `help-answers.js`, `start-diagram.js`, `scenes-extra.js`, `scenarios.js`, `example-reference.js`, `clarify.js`, `snorm.js`, `spell.js`, `spell-model/` | `docs/js/…`, `docs/model/spell/` | Layout engine, 24 diagram templates, help answers (248 topics), clarification questions, normalizer and spell checker used by the rules reader. |
| `engine/ui.js` | `docs/js/ui.js` | The SVG renderer and editor UI. Reference for the Diagram tab only; port the drawing code, do not load the whole file. |
| `data/train/` | `training/sketch/llm_train/` | Labelled training messages (LLM-written, label-checked), `*.jsonl` plus the label-fix records. `texts/` folders (unlabelled duplicates) were not copied. 49,746 messages, 76,637 wires. |
| `data/test/` | `training/sketch/llm_bench/` | Labelled test messages. 4,374 messages, 17,565 wires. |
| `data/bench/` | `docs/bench/` | Benchmark sets of single sentences with gold args (seen, blind, broad, hand, heldout_formulations, new_identities). |
| `data/examples/` | `docs/examples/` | Example sessions (manual, reference). |
| `specs/` | `training/sketch/LABEL_CONVENTIONS.md`, `llm_train/TRAIN_MSG_SPEC.md`, `llm_bench/SPEC.md` (renamed `TEST_MSG_SPEC.md`) | How the messages and wires are written and labelled. |
| `reference/` | `training/sketch/{generate.py,msg_to_world.py,llm_to_world.py,score_rules.mjs,llm_score.mjs}`, `docs/js/bench-canon.js` | Template sentence generator, converters and the scorers that compare readings with the gold wires. Reference only. |
| `world-draft/legend.json` | dumped with `createSystem().engine.legend` | All 46 legend questions with values and cue words. |
| `world-draft/lexicon.sop`, `operations.sop` | generated from `legend.json` by the reviewer | Drafts in this repository's format; not loaded. |

Not copied, on purpose: the fine-tuned DistilBERT (SOP-BERT, `docs/model/neural/`), the VSS micro-worlds and cutters (`docs/model/micro/`),
the confidence models, the training runs and the research notes. We use our own dispatcher and our own rules.
