# training/ — encoder training (Python)

Python is used here because model training and ML inference are where it is the robust choice. The Node core never imports this code; it talks to trained models through a separate inference worker (vision §13).

**Status:** prepared, not run. Nothing has been trained yet. The first session is planned on a DGX Spark.

## What gets trained (vision §5–6)
- A pinned backbone: `answerdotai/ModernBERT-base` (≈149M parameters, English).
- Shared task heads: mention/type detection, key-conditioned span extraction (the key's `ask` question + mention + context → span or no answer), reference linking, scope/relation labels, question-to-query mapping.
- One LoRA adapter per world, trained on that world's data plus pinned parent replay data.

## Data
`node scripts/export-training.mjs` writes one JSONL file per world, `training/data/<world>.jsonl`, plus `training/data/report.json` (spec 08). Options: `--world <id>` (one world; its entry in `report.json` is merged), `--count <n>` (generator examples per world, default 2000), `--out-dir <dir>`, `--dev <share>` (default 0.1), `--seed-salt <text>`, `--no-rules`.

Two sources, both formalized by the rule strategy (ADR-001):
- **rule-derived** - the inputs of every world's `tests.sop` (replayed per test session, so earlier messages are context) and the `example=` entries of `patterns.sop`. `label_status = rule-derived`.
- **generator** - the examples of `worlds/<id>/datagen.mjs` (spec 08: text, `expect` circuit written from the symbolic seed, `group`, `phenomenon`, optional `context` messages, `negative`). The seed of each world is `sha256(world id @ generator version)` and is recorded in every record. The exporter formalizes `context` and then `text` in one session and compares the canonical wires with `expect` (ids, `core.source`, `core.seq`, `core.via`, `core.in` and `core.agent` entity wires ignored): `generator-backed` (they agree), `generator-disagrees` (kept and flagged with `rule_circuit` and `note`: a pattern gap, a conflict with another world's pattern, or a generator bug), `negative` (text this world must not formalize; if the world claims it, it is `generator-disagrees`).

Record fields: `example_id`, `lineage`, `source_group`, `group`, `language`, `text` (the sentence, or the whole generated message), `message`, `context` (earlier messages of the session), `segment_span`, `mentions`, `keys` (wire, full key, character span, value), `references`, `kind`, `expected_circuit` (SOP Lang), `label_status`, `phenomenon`, `split`; generator records also `negative`, `seed`, `generator_version`; disagreements also `rule_circuit`, `note`. Splits are assigned per group (hash of world + group), so paraphrases of one template never straddle train and dev.

`report.json` holds, per world, the counts per status, phenomenon and split, the generator seed and version, the agreement between generator and rules (`rate` over all generator records, `positive_rate` over non-negative ones, `negative_rate`) and `pattern_gaps` (disagreeing groups with one example each). The agreement rate is also a coverage metric of the rule formalizer.

The generators use the worlds' lexicons and KB through the `context` argument of `generate({ rng, count, context })` (`context.lexicons`, `context.names`, `context.kb`) and fall back to small embedded lists, so `datagen.mjs` stays browser-safe and import-free. Volume beyond the generators comes later from C1 generators and teacher annotations (vision section 6).

## Paraphrase data
`node scripts/collect-paraphrases.mjs training/paraphrases/inbox --report` turns batches written by small LLM agents (human-like commands per goal) into `training/paraphrases/out/<world>.jsonl` with paraphrase-anchor labels, plus `training/paraphrases/report.json` (spec 10). Splits are by goal, so paraphrases never leak between train and dev. These files are committed (small).

## Plan for the first GPU session
1. `python training/check_env.py` — GPU, memory, precision support, library versions, backbone download.
2. Write the dataset loader for the JSONL above and the key-conditioned span-extraction head (the task that maps most directly onto SOP Lang keys).
3. Train one LoRA adapter for one world; record the full command, seeds, data hashes, versions and artifact hashes (vision §6).
4. Measure role-conditioned span F1 on dev; compare with the rule formalizer on the same sentences.
5. Export the adapter and define the inference-worker protocol (batching, adapter load/unload, scores and offsets).

## Environment
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r training/requirements.txt
python training/check_env.py
```

## DistilBERT vs ModernBERT ablation
Question: is the smaller, faster DistilBERT enough for the per-world formalizers, especially in the browser?

Models: (a) `distilbert-base-uncased` full fine-tune (about 66M parameters), (b) ModernBERT-base with LoRA, (c) ModernBERT-base full fine-tune. Same data (datagen + rule-derived + paraphrases), same splits (by group), same heads, same seeds (three per model), same epochs budget and early stopping on dev.

Metrics, per world and macro-averaged, on dev (datagen, paraphrase and rule-derived reported separately):
- exact-SOP match (canonical circuit equal after id normalization),
- slot F1 (role-conditioned span/value F1 over keys),
- routing accuracy (right world with the tab context of ADR-004, and without it),
- latency: CPU (batch 1, fixed threads) and in the browser (onnxruntime-web, WASM; WebGPU if available), p50 and p95,
- size of the ONNX int8 export (and the accuracy drop after quantization, measured on the same dev set).

Report one table per world with the rule formalizer as the baseline row; decide per world, not globally (a LoRA adapter per world also saves download size for ModernBERT; DistilBERT needs a full model per world or shared weights plus heads). Record commands, seeds, data hashes and versions as in the first GPU session.

## Dataset (`scripts/build-dataset.mjs`)
`node scripts/build-dataset.mjs` merges `training/data/*.jsonl` (generators + rule-derived; `export-training` runs first if the directory is empty), `training/paraphrases/out/*.jsonl` and optional webchat phrase-log exports dropped in `training/phrase-logs/*.jsonl` into `training/dataset/` (gitignored except `stats.json`):
- `<world>/{train,dev,test}.jsonl` - fields `text`, `context` (earlier messages), `target` (SOP circuit; empty for negatives), `negative`, `label_status`, `source` (generator | rule-derived | paraphrase), `weight`, `group`, `phenomenon`, `tab`, `provenance`, `split`.
- `<world>/review.jsonl` - `needs_review` rows (excluded from training and test) and flagged `generator-disagrees` rows whose group landed in test.
- `routing.jsonl` - `text`, `context {tab, recent_worlds, session, synthetic}` -> `world` (`alt_worlds` when the same text belongs to several worlds), with `split`. Paraphrase and phrase-log rows keep their real tab; generator and rule-derived rows get a deterministic synthetic context (tab: own world 60 %, another 20 %, none 20 %; 0-2 recent worlds), flagged `synthetic`. Negatives are not routed. Phrase-log rows routed to exactly one world with status `supported` join routing (weight 0.8).
- `unlabelled.jsonl` - rows without a trusted target (every phrase-log row carries no circuit; paraphrase rows with `target_from=null`), for review.
- `stats.json` - counts per world / split / source / label, dedupe counts, routing and unlabelled counts.
Splits are per group (world + generator group or task goal), by hash of `--seed` (default 1337), about 80/10/10 per world, so paraphrases of one goal never cross splits. Dedupe is per world on normalized text + context (the most trusted copy wins). Weights: generator-backed, rule-derived, `rules-agree`, `canonical-ok` 1.0; `target_from=canonical` 0.8; `generator-disagrees` 0.5 (never in test).

## Model target format (`training/psys2_train/`)
One encoder pass, three heads (`model.py`), input = `[CLS] text [SEP] last 2 context messages [SEP]`:
1. **Intent (sequence classification, first token).** The class is the circuit *skeleton*: the normalized circuit (`core.agent` wires and `core.via/source/seq/in` dropped, keys shortened to their last segment, entries sorted, wire ids replaced by position) with every value that can be located in the text replaced by a slot placeholder, for example `kids.arith.holding count={w0.count} item={w0.item} owner={w0.owner}`. Values that are not in the text (`action=draw.add`, normalized lemmas that were not aligned) stay constants of the skeleton. Texts the world must not formalize get the class `NONE`. Classes are per world (the skeleton list is saved in `labels.json`).
2. **Slots (token classification, BIO).** Tag names are `w<wire index>.<key>` (`B-w0.owner`, `I-w0.owner`, `O`). Gold spans come from `psys2_train.sop.align`: each value is searched case-insensitively with word boundaries (entities `$e.tom` -> "tom", numbers -> digits or number word, words -> plural forms), leftmost free match. Only the text segment is tagged; context tokens are ignored (-100).
3. **Routing (sequence classification, separate run).** Input `tab: <tab> ; recent: <worlds> ;; <text>` -> world id over all worlds; evaluated with and without the context prefix (ADR-004).

**Decoding to SOP** (`sop.decode`): predicted skeleton, placeholders filled from the predicted spans. A surface is converted to a circuit value by `ValueMap`, learned from the training set per key (surface -> most common value, e.g. "apples" -> `apple`), with a fallback by the key's dominant kind (entity `$e.<surface>`, quoted string, number, word). The result is compared as normalized text, so a prediction is exact only if skeleton, spans and values all agree. `python -m psys2_train.oracle` decodes the gold skeleton and spans and reports the ceiling of this format per world (0.95-1.0 for most worlds; lower for `docs.reader` and `kids.time`, where values are normalized rather than copied from the text; unseen skeletons in dev are the other loss and show the cost of constants in the class).
The emit templates of `patterns.sop` are not needed at training time; because pattern ids are not in the generator records, skeleton classes play the role of the pattern. At inference the skeleton is turned into wires by the same rendering (ids assigned, `core.via` set from the legend), a step for the inference worker.

Metrics (`metrics.py`): exact SOP match after decoding (also split by source: generator / paraphrase / rule-derived), slot F1 (micro over (slot, span)), intent accuracy, negative rejection, routing accuracy with and without context.

## Commands
```bash
# data (CPU, anywhere)
node scripts/export-training.mjs && node scripts/collect-paraphrases.mjs training/paraphrases/inbox --report
node scripts/build-dataset.mjs                      # -> training/dataset/, stats.json
# smoke test (CPU, tiny random BERT, no download, 20 steps)
bash training/smoke_test.sh
# real runs (DGX Spark), from training/
cd training && python check_env.py
python -m psys2_train.train --world kids.arith --model answerdotai/ModernBERT-base --epochs 5 --bf16
python -m psys2_train.train --task routing --model answerdotai/ModernBERT-base --epochs 3 --bf16
python -m psys2_train.train --world kids.arith --model distilbert-base-uncased --no-lora --lr 5e-5   # ablation (a)
# runs are written to training/runs/<name>-<time>/ (best.pt, labels.json, metrics.json with command, data hash, versions)
python -m psys2_train.export_onnx <run dir> <model> out.onnx    # stub, untested
```

## Dispatcher (`psys2_train/dispatcher.py`, `multicmd.py`, `dispatch_predict.py`)
One shared encoder with a per-token segmentation head (B/I) and a world head (sequence classification over all worlds, input `tab: .. ; recent: .. ;; <segment>`, top-3 with softmax scores; alt_worlds = soft target 0.5/0.5, evaluated leniently and strictly). The simplification head (D1b, edit tags KEEP/DELETE/R:/P:/A:, `psys2_train/edit.py`, spec 03 section 7.8) is the third head: `node scripts/build-edit-tags.mjs` builds `training/dataset-edit/` first, then train as below (add `--no-heldout-train` for a clean held-out evaluation, `--no-edit` for the plain D1 model); rewrites of the paraphrase variants: `python -m psys2_train.simplify_predict --ckpt <ckpt> --out-dir runs/edit-tags/<name>` then `node scripts/eval-simplify.mjs --pred-dir training/runs/edit-tags/<name> --merge training/results/dispatcher-<name>.json`. Joint training: each step = one routing batch + one multi-command batch, bf16 on CUDA (asserted), best checkpoint on dev.
```bash
python -m psys2_train.multicmd            # -> training/runs/multicmd/{train,dev,test}.jsonl (+ mirror in training/dataset/multicmd/), seed 1337, same-split sentences only
python -m psys2_train.dispatcher --model distilbert-base-uncased --no-lora --lr 5e-5 --epochs 6 --out runs/dispatcher-distilbert
python -m psys2_train.dispatcher --model answerdotai/ModernBERT-base --lora --lora-r 16 --lr 3e-4 --epochs 6 --out runs/dispatcher-modernbert-lora
python -m psys2_train.dispatch_predict --ckpt runs/dispatcher-distilbert --split test --out runs/dispatch-pred/test.jsonl   # also writes heldout.jsonl next to it
```
Prediction line (one per record; `id` is the dataset record id): `{id, kind, world?, text, context{tab,recent_worlds,session}, gold{segments}, boundaries:[{offset,p}], segmentations:[{score (log-prob <= 0, beam <= 4, best first), segments:[{start,end,text,worlds:[{world,score}] (top-3 probabilities)}]}]}`. Full description in the `dispatch_predict.py` docstring. Metrics go to `training/results/dispatcher-<name>.json`.

### Reviews F4/F6/F7/F8 (compositional data, controlled exposure, pipeline selection, long inputs)
- **Compositional multi-command data** (`psys2_train/compositional.py`, mixed into `multicmd.py` at 40%): a program (initial context = setup messages, tab, recent worlds; atomic `steps`; one verbalization) with the families `shared_arg`, `ellipsis`, `self_correct`, `ref_created`, `repeat_undo`, `world_switch` (spec 03 section 7.11). Labels come from the program; records keep `family`, `context.session` (the setup, never a placeholder) and `program{setup, steps}`. `node scripts/verify-compositional.mjs training/runs/multicmd/test.jsonl [--annotate out.jsonl]` runs setup + steps and the composite text through the rules and reports per family `steps_ok` (the program is expressible), `composite_ok` and `agree` (same order-preserving SOP). Training regenerates the combinations every pass (`--seg-n`, `--seg-seed`, `--no-regen` for the fixed file).
- **Step budgets and sampling** (`psys2_train/sampling.py`): `--steps-routing/--steps-seg/--steps-edit` (explicit batches per head, evenly spread), `--focus-frac` (reserved share of an epoch for recent failures found by a probe after every evaluation, mined contrastive near-misses and a replay pool of solved rows), `--source-floor` (minimum share per routing source). Every row is still seen every epoch. `metrics.json` has `shown` (per head: kind, source, world, phenomenon tag, segmentation family, edit kind), `budgets`, `sampler`; `shown.json` next to it.
- **Selection by the whole pipeline** (`psys2_train/selection.py`): the best `--keep-ckpts` checkpoints by the dev score and the simplifier thresholds 0.5-0.9 are judged on the operational set; the evaluator is `scripts/eval-operational.mjs` (command template `--select-cmd`, default `node scripts/eval-operational.mjs --model-dir {export} --edit-tau {tau} --json`, last stdout line = JSON `{n, right, partly_right, wrong, not_understood, latency_ms}`, optionally under `headline`) once the file exists, otherwise the local stub set `training/eval/operational-stub.jsonl` scored in Python (`python -m psys2_train.selection --make-stub`). score = right - 2 wrong + 0.25 partly right - 0.0002 ms (rates). `metrics.json` `selection` has the whole table; the winner is `best.pt`, its tau goes to `meta.json`. The edit evaluation reports recovered / misled / not_recovered_unchanged / kept_ok / broken (`recovered_misled_broken`).
- **Contrastive role pairs** (`psys2_train/role_pairs.py`, committed `training/eval/role-pairs.jsonl`): the same words, different roles (red eyes + blue body vs blue eyes + red body, 7 minus 3 vs 3 minus 7, above vs below). Any word-preserving checker must tell the two sides apart (`tests/role-pairs.test.mjs`).
- **Long inputs**: overlapping windows (192 / 128 tokens) in `run_seg` / `run_world` and in `dispatcher-runtime.mjs`.
- Tests without GPU: `python training/tests/run_all.py` (also run by `npm test`).
