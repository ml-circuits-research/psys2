# Request proposer — model card and results (2026-11-16; Q48 proposal 1; PROVISIONAL until the reviewer has seen the split)

## Model card
- **Task**: propose a reading of one English request turn on a declared tab (Drawing, Diagram, Documents): one tag per word (ACT, REACT, REF, NAME, constraint keys with their want — kind, kind.no, kind.not_all, count, size, place, attribute, manner, layout, with, about, length, extent — UNREAD, DROP, O) and four sentence labels (act of k.actions or none, reaction value or none, reference, question). Roles over spans; no kind ids. It never executes: the rules read the phrasing it proposes and decide (spec 28 section 15, `src/dialog/proposer.mjs`).
- **Backbone**: `nreimers/MiniLM-L6-H384-uncased` (6 layers, hidden 384, 22.7 M parameters with the heads; MIT licence), chosen over DistilBERT (66 M) and ModernBERT (149 M) because the act tagger P3 (same backbone, same task shape) matched DistilBERT within 0.1-0.5 points at a third of the size and latency, and the reviewer's bound is ≤ 6 layers / ≤ 25 MB.
- **Training**: `python -m psys2_train.request_proposer` (training/psys2_train/request_proposer.py): CUDA bf16, AdamW lr 1.5e-4, wd 0.01, batch 256, 6 epochs, linear warm-up 6 %, seed 1, loss = CE(act) + CE(reaction) + CE(refers) + CE(question) + 2·CE(tags); best epoch by dev exact. torch 2.14.1+cu130, transformers 5.22.2, onnxruntime 1.31.1. Time: 11.5 s (held-out run, 13,123 rows) and 20.2 s (all-worlds run, 21,133 rows) on the GB10.
- **Export**: ONNX opset 17, dynamic int8 quantisation per channel: **23.0 MB** (fp32 90.5 MB). Files stay out of git: `training/runs/request-proposer/minilm6-all-2026-11-16/model.int8.onnx` sha256 `489a43200fe818eeb87e19c54c720da089277e812d50a09a5193f999a43a047f` (the door's), `…/minilm6-holdout-2026-11-16/model.int8.onnx` sha256 `ade09f22dc1201a5dab5bdbd228beb1cb4b7612c0ff498d79b3e52eac696e07a` (the generality test). meta.json (labels, verbs) copied to `training/results/request-proposer/`.
- **Data** (`node scripts/gen-request-data.mjs --per-world 3000 --seed 7`, 336 s): 22,312 rows; train.jsonl sha256 `f19ab470…0685` (gitignored, regenerable), dev.jsonl `737f7f26…9c8d`. Labels are always the library's readRequest reading over the world's request.sop — of the sentence itself (generated, real) or of the CANONICAL sentence projected onto a variant (framed: the frame words DROP; framed.verb: a frame that replaced the verb, the act kept from the canonical reading).

| source | rows | how labelled | label beyond the rules on that sentence |
| --- | --- | --- | --- |
| generated | 1,921 | requests composed from the declarations (acts, kinds, honours) and the language world's cues, numbers, verbs; kept when the rules read them fully | 0 % |
| framed | 16,155 | a frame mined from the paraphrase corpora (1,026 goal groups) around a generated request; label = the request's reading, frame words DROP; a frame is used only when the rules give its words no meaning | 27 % |
| framed.verb | 1,438 | a frame that replaced the verb ("i want …"); label = the request's reading, act from it | 100 % |
| noise | 845 | framed rows with one swapped letter in a frame word (light, owner 2026-11-15) | 43 % |
| unread | 774 | a pseudo-word or a kind the world does not declare inserted; label keeps it UNREAD (honesty) | (incomplete by design) |
| real (set, owner, phrase logs, RO rows through the rules translator) | 113 | the rules' reading where complete | TEST ONLY, never trained |

About 29 % of the training rows (≈ 6,200, unread rows aside) carry a label the rules cannot produce on that sentence (`scripts/request-label-share.mjs`, 150 rows sampled per source).
- **Splits**: dev 5 % by group (the clean request: its frames never straddle); the held-out run leaves out the whole Diagram world and the count-range family; real rows, the owner sessions and the fresh probes are test only.

## Dev and held-out metrics (bf16 on CUDA)
| set | n | exact | act | reaction | refers | tags |
| --- | --- | --- | --- | --- | --- | --- |
| held-out run: dev (Drawing + Documents) | 638 | 0.892 | 0.998 | 0.989 | 0.995 | 0.976 |
| held-out run: **Diagram (never trained)** | 3,000 | **0.656** | 0.977 | 0.979 | 0.910 | 0.935 |
| held-out run: count-range family | 1,146 | 0.693 | 0.993 | 0.989 | 0.949 | 0.961 |
| held-out run: real rows (rules-labelled) | 113 | 0.434 | 0.637 | 0.947 | 0.841 | 0.793 |
| all-worlds run: dev | 1,066 | 0.942 | 0.993 | 0.995 | 0.996 | 0.990 |
| all-worlds run: real rows (rules-labelled) | 113 | 0.425 | 0.681 | 0.956 | 0.876 | 0.813 |
| all-worlds int8 graph + JS tokenizer (Node) on dev | 1,066 | 0.937 | 0.992 | | | 0.989 |

Reading: the act and the drop / role tags transfer to an unseen world (act 0.98, tags 0.94) but whole-sentence exactness falls 24 points (0.89 → 0.66): part of the span roles is vocabulary of the trained worlds (the reviewer's rejection criterion 8a: flagged, not hidden). On real sentences the model is weak (act 0.64-0.68): the generated phrasing is not how people type. In the door this is contained by the strict acceptance; it is still the main limit.

## Latency and size
- Node (onnxruntime-node 1.31, one thread, GB10 Cortex-X925 core), int8, batch 1: **p50 1.0 ms, p95 1.6 ms** on the dev rows (7.3 words mean); 33 words: p50 2.7 ms, p95 3.1 ms. Load 70 ms. Model 23.0 MB.
- Phone profile not measured for this graph; the same backbone and size (act tagger P3, `act-tagger-phone-minilm6.json`: headless Chrome, onnxruntime-web wasm single thread, 4x CPU throttle) took 21 / 28.5 ms p50 / p95 at about 9 tokens; scaled to 32 tokens about 60-80 ms — under the 150 ms bound, far under the old dispatcher's ~1 s. In the door the model runs only on a signal (unread words or no act): 43 of 90 fresh probes, 0 turns the rules read whole.

## Two columns (rules alone / rules + proposer, the all-worlds model, PSYS2_PROPOSER=1)
Expected before running (worker-log stage 0): about 5 % of the real rows the rules do not read whole.

| measure | rules alone | rules + proposer | won | lost | wrong executions |
| --- | --- | --- | --- | --- | --- |
| owner EN session (16 judged) | 12 right / 3 honest / 1 wrong | 12 / 3 / 1 | 0 | 0 | 1 -> 1 |
| owner RO session through translation (rules chain, no MT; session 43 + variants 35 judged together: session 10/43 + variants 19/35; the session alone is 10/43 on build 9fa10af8, as in the committed owner-2026-11-15T0734-slice4.json; a 14/43 is another run) | 29 right / 44 honest / 5 wrong | 29 / 44 / 5 (session 10/43 -> 10/43) | 0 | 0 | 5 -> 5 |
| real set (605 turns replayed; tags `proposer-off` / `proposer-on`) | 129 right, 27 wrong executions | 129 right, 27 wrong executions | 0 | 0 | 27 -> 27 |
| typo set (111; symbolic spell alone / spell + proposer) | right 59, wrong 3, asked 6, missed 43; controls 47/48 | identical; 0 proposals accepted, 0 controls changed | 0 | 0 | — |
| request properties (172) | 158 | 159 | (P3 ro docs: story word counts vary run to run, not the proposer) | 0 | — |
| fresh probes (90, written by the worker before any run, test only) | 49 right / 34 honest / 7 wrong | **56 / 27 / 7** | 7 | 0 | 7 -> 7 |

- Real set: one reply changed (r0278 "n-ai înțeles, desenează maimuță": "I did not understand "n", "understood", "draw"" -> "I cannot make monkey in the drawing yet", more honest, still not done). Probe wins: p004 "can i get a small pond without ducks", p011 "let's have 4 to 6 flowers", p013 "i want a boat on the lake", p021 "i'd like exactly five fish", p042 "i need a flowchart with five steps and no diamonds", p051 "i want a mind map about volcanoes", p072 "i want a long report about volcanoes in 4 chapters" — all one form: a frame in place of the verb.
- **A first wiring was worse and was fixed before these numbers** (recorded, not hidden): with the act allowed on any turn without an act, the real set gained r0546 and r0076 / r0086 but executed bare things and noise ("desene" / "drawing" -> a pond, "de pești" -> a lake, "Da face face face apă" -> water added: about 6 new wrong executions). The fix is the reviewer's item 2 ("every proposed part cites words of the person"): an act put in front must stand on a frame that replaced the verb (words tagged DROP before any word of the request). Every column above is the fixed wiring.
- Latency in the door: the model is consulted on 43 of 90 probes (none the rules read whole); model time p50 2 ms, p95 10 ms in Node, and the extra readRequest of the phrasing (tens of ms) only when a proposal passes the first checks.

## Verdict
**It does not help on real turns today.** On every real measure (owner EN, owner RO, the real set, the typo set) the two columns are identical: 0 turns won, 0 lost, wrong executions unchanged; the expected ~5 % rescue did not appear (0 %). It wins only on the fresh probes (+7 of 90), all of one form ("i want / can i get / let's have X"), which the training frames were mined to cover, and which the real turns of today barely contain. That is close to the reviewer's rejection criterion "gains appear only on generated data", and the held-out world falls from 0.89 to 0.66 exact (vocabulary learned). Where it would help: request phrasings with a frame in place of the verb, once real users type them; it is harmless where it is idle (no control changed, no wrong execution added, ~2 ms only on a signal). Recommendation: keep it behind the flag, off by default; do not spend more on it now. The losses are elsewhere (stage 0: names as references 19 — sopworld 0.154; capability + knowledge 42; translation 30; missing cue words — Q49 [KNOW]). Revisit when phrase logs bring real request phrasings in volume (train on them; the probe and owner sets stay test only).
