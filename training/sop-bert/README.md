# SOP-BERT port: historical baseline only

Read [PROVENANCE.md](PROVENANCE.md) before interpreting the results. This directory does not register a PSys2 reader or enable `?engine=new`. Its diagram-specific original heads are retained solely for faithful reproduction before the general request-description retarget.

The checked-in files are small source/data artifacts. Obtain the pinned model in an isolated checkout inside the workspace, without checking out every model in that repository:

```sh
git clone --filter=blob:none --no-checkout git@github.com:ml-circuits-research/diagram-vss-demo.git ../.session-control/diagram-vss-demo
cd ../.session-control/diagram-vss-demo
git sparse-checkout set docs/model/neural/sop-bert training/laptop
git checkout --detach ac33631635314bf00e14e222809e8aa4ab934f38
cd training/laptop
npm ci --ignore-scripts --no-audit --no-fund
```

These are acquisition instructions for a new checkout; do not overwrite an existing checkout. Return to the PSys2 repository root for evaluation:

```sh
python3 training/sop-bert/prepare.py --out ../.session-control/sop-bert-baseline
python3 training/sop-bert/upstream/training/neural/make_roles.py --out ../.session-control/sop-bert-original-labels
node training/sop-bert/reproduce.mjs \
  ../.session-control/diagram-vss-demo/training/laptop/node_modules/@huggingface/transformers/dist/transformers.node.mjs \
  ../.session-control/diagram-vss-demo/docs/model/neural/sop-bert \
  ../.session-control/sop-bert-baseline/heldout.jsonl \
  ../.session-control/sop-bert-baseline/reproduction
```

Preparation verifies original file hashes and recreates the historical split. Inference validates source/model hashes and the prepared input, forbids remote model access and Rules fallback, and writes per-message evidence plus a summary. Dependency installation is isolated from PSys2; an unavailable native runtime must be reported, not silently replaced with a different reader. The reported reproduction mismatch is a result, so the command exits normally after a complete measured run and records `reproducedToReportedPrecision: false`.

Next: locate the historical discrepancy, port the later training/roundtrip/confidence improvements with separate provenance, then retarget published general request contracts. Keep the original baseline frozen. Neither provisional semantic labels nor a final holdout may be used to optimize the new reader or its execution threshold.
