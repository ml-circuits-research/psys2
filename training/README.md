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
