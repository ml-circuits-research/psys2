# training/ — encoder training (Python)

Python is used here because model training and ML inference are where it is the robust choice. The Node core never imports this code; it talks to trained models through a separate inference worker (vision §13).

**Status:** prepared, not run. Nothing has been trained yet. The first session is planned on a DGX Spark.

## What gets trained (vision §5–6)
- A pinned backbone: `answerdotai/ModernBERT-base` (≈149M parameters, English).
- Shared task heads: mention/type detection, key-conditioned span extraction (the key's `ask` question + mention + context → span or no answer), reference linking, scope/relation labels, question-to-query mapping.
- One LoRA adapter per world, trained on that world's data plus pinned parent replay data.

## Data
`node scripts/export-training.mjs --out training/data/rules.jsonl` exports records produced by the rule formalizer (ADR-001) from every world's tests and pattern examples. Label status is `rule-derived`; splits are assigned per source group (world + pattern), so paraphrases never straddle train and dev. Record fields: `example_id`, `lineage`, `source_group`, `language`, `text`, `context`, `segment_span`, `mentions`, `keys` (wire, full key, character span, value), `references`, `kind`, `expected_circuit` (SOP Lang), `label_status`, `split`.

The fixture worlds yield only a few hundred records — enough to test the pipeline end to end, not to train a useful model. Volume comes later from C1 generators and teacher annotations (vision §6).

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
