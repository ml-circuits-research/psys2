#!/usr/bin/env bash
# CPU smoke test: dataset build + 20 training steps of a tiny random BERT (no download) on one world, then routing.
# Requires: pip install torch transformers peft. Trains nothing real.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d training/dataset/kids.arith ] || node scripts/build-dataset.mjs
cd training
OUT=$(mktemp -d)
python -m psys2_train.train --world kids.arith --model tiny --max-steps 20 --batch-size 16 --limit 400 --device cpu --out "$OUT/sop"
python -m psys2_train.train --task routing --model tiny --max-steps 10 --batch-size 16 --limit 400 --device cpu --out "$OUT/routing"
echo "smoke test OK ($OUT)"
