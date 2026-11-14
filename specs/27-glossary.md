# 27. Glossary: our words and the established terms

Status: in force (reviewer 05:25, owner 2026-11-14 20:13). The words of our specs, docs and worker-facing text are the established ones; the library (sopworld 0.111) renamed its API the same way. The library's own `docs/literature.md` has one line per concept with its reference and how the library differs; `docs/glossary.md` there has the standard equivalents of SOP Lang's names. Read those for the sources; this page only fixes which word we use.

| We say | We used to say | Established term | Library name (0.111) |
| --- | --- | --- | --- |
| **related cases** (of a case, at a distance, along axes) | cousins (degree, dims) | metamorphic testing, behavioural testing with invariance tests (CheckList), contrast sets | `relatedCases`, `judgeOnRelated` (was `judgeFix`), `generalisationTest` (was `cousinsTest`) |
| **ensemble members**, **readers** | voices | ensembles with reranking; selective prediction | `readEnsemble`, `riskCoverage` |
| **paraphrase rewrite rules** | form operators | paraphrase generation and normalisation | `learnFormOperators` (name kept), `paraphrasesOf` (was `variantsOf`) |
| **delexicalise** | lift tokens | delexicalisation in dialogue state tracking | `delexicalise` (was `liftTokens`) |
| **resolve ellipsis** | continue act | ellipsis and fragment resolution | `resolveEllipsis` (was `continueAct`) |
| **learn a ranking** | calibrate (the order of criteria) | learning to rank | `learnRanking` (was `calibrate`; `calibrate` stays for probability calibration) |

Where the old word survives, it is a name that cannot change without breaking data: the `source` value `cousins` of rows in `training/eval/form-pairs.jsonl`, the result files `training/results/cousins/` and `training/eval/cousins-real.json`, the curve points recorded as `cousinsReal` (read as `relatedReal`), the results `training/eval/voices-2026-11-15.*` and the script `scripts/measure-voices.mjs`. New output uses the new names (`scripts/related-cases.mjs`, `training/results/related-cases/`, `training/eval/related-real.json`). `voice` in `src/reasoner` (a world's own function that says what it did) is a different thing and keeps its name.
