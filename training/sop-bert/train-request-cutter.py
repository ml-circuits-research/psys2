#!/usr/bin/env python3
"""Source-only request BIO cutter. Imports ML dependencies only for training."""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import time

LABELS = ["O", "B", "I"]
CODEC = {
    "format": "sop.request-cutter-codec/1", "labels": LABELS,
    "input": "source-only", "unit": "unicode-scalar",
    "transitionPolicy": "illegal-I-after-O-unresolved", "spanEnd": "exclusive",
    "truncation": "unresolved", "specialAndPadding": "ignored",
}

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))

def gold_spans(text, requests):
    """No positional disambiguation or annotation-derived input."""
    spans, reasons = [], []
    if not isinstance(text, str) or not isinstance(requests, list):
        return None, ["malformed-source-or-request-list"]
    for i, request in enumerate(requests):
        span = request.get("span") if isinstance(request, dict) else None
        if not isinstance(span, str) or not span:
            reasons.append(f"malformed-span:{i}")
            continue
        positions, offset = [], 0
        while True:
            p = text.find(span, offset)
            if p < 0:
                break
            positions.append(p)
            offset = p + 1
        if len(positions) != 1:
            reasons.append(f"{'missing' if not positions else 'ambiguous'}-span:{i}")
        else:
            spans.append((positions[0], positions[0] + len(span)))
    if reasons:
        return None, reasons
    if spans != sorted(spans):
        reasons.append("annotation-order")
    if any(a[1] > b[0] for a, b in zip(sorted(spans), sorted(spans)[1:])):
        reasons.append("overlapping-spans")
    return spans, reasons

def align_labels(text, spans, offsets, sequence_ids, attention_mask, truncated=False, reasons=()):
    """Mask an unsafe row entirely; retain its diagnostics and identity."""
    labels = [-100] * len(offsets)
    issues = list(reasons)
    if not (len(offsets) == len(sequence_ids) == len(attention_mask)):
        return labels, issues + ["token-shape"]
    if truncated:
        issues.append("source-truncated")
    source = []
    previous = 0
    for i, (pair, seq, mask) in enumerate(zip(offsets, sequence_ids, attention_mask)):
        if not mask or seq is None:
            continue
        if seq != 0 or not isinstance(pair, (tuple, list)) or len(pair) != 2:
            issues.append("invalid-source-offset")
            continue
        a, b = pair
        if not (isinstance(a, int) and isinstance(b, int) and previous <= a < b <= len(text)):
            issues.append("invalid-source-offset")
        else:
            source.append((i, a, b))
            previous = b
    if spans is None:
        issues.append("unresolved-gold-spans")
    if not issues:
        for i, _, _ in source:
            labels[i] = 0
        for start, end in spans:
            selected = [(i, a, b) for i, a, b in source if a < end and b > start]
            if not selected or selected[0][1] != start or selected[-1][2] != end or any(
                    a < start or b > end for _, a, b in selected):
                issues.append("unrepresentable-token-boundary")
                break
            for j, (i, _, _) in enumerate(selected):
                if labels[i] != 0:
                    issues.append("overlapping-token-labels")
                    break
                labels[i] = 1 if j == 0 else 2
    if issues:
        labels = [-100] * len(offsets)
    return labels, sorted(set(issues))

def decode_bio(predicted, offsets, sequence_ids, attention_mask, text_length, truncated=False):
    if truncated:
        return [], ["source-truncated"]
    if not (len(predicted) == len(offsets) == len(sequence_ids) == len(attention_mask)):
        return [], ["token-shape"]
    spans, active, previous = [], None, 0
    for label, pair, seq, mask in zip(predicted, offsets, sequence_ids, attention_mask):
        if not mask or seq is None:
            continue
        if seq != 0 or not isinstance(pair, (list, tuple)) or len(pair) != 2:
            return [], ["invalid-source-offset"]
        a, b = pair
        if not (isinstance(a, int) and isinstance(b, int) and previous <= a < b <= text_length):
            return [], ["invalid-source-offset"]
        previous = b
        if label not in (0, 1, 2):
            return [], ["unknown-BIO-label"]
        if label == 2 and active is None:
            return [], ["illegal-I-after-O"]
        if label in (0, 1) and active is not None:
            spans.append(tuple(active))
            active = None
        if label == 1:
            active = [a, b]
        elif label == 2:
            active[1] = b
    if active is not None:
        spans.append(tuple(active))
    return spans, []

def prf(tp, fp, fn):
    return {"tp": tp, "fp": fp, "fn": fn,
            "precision": tp / (tp + fp) if tp + fp else 0.,
            "recall": tp / (tp + fn) if tp + fn else 0.,
            "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.}

def metrics(rows, predictions):
    confusion = [[0] * 4 for _ in range(3)]
    counts, diagnostics = Counter(), Counter()
    for row, pred in zip(rows, predictions):
        for gold, got in zip(row["labels"], pred):
            if gold != -100:
                confusion[gold][got if got in (0, 1, 2) else 3] += 1
        spans, issues = decode_bio(pred, row["offsets"], row["sequence_ids"], row["attention_mask"],
                                  len(row["text"]), row["truncated"])
        diagnostics.update(issues)
        counts["rows"] += 1
        group = "empty" if row["request_count"] == 0 else "positive"
        counts[group + ":rows"] += 1
        gold = row["spans"]
        if gold is None:
            counts["unscorableGoldRows"] += 1
        else:
            counts["spanScorableRows"] += 1
            expected, actual = Counter(map(tuple, gold)), Counter(map(tuple, spans))
            counts["tp"] += sum((expected & actual).values())
            counts["fn"] += sum((expected - actual).values())
            counts["fp"] += sum((actual - expected).values())
            exact = not issues and expected == actual
            counts["utteranceExact"] += exact
            counts[group + ":exact"] += exact
        counts["predictionUnresolvedRows"] += bool(issues)
        counts["maskedSupervisionRows"] += bool(row["issues"])
    per_class = {}
    for i, label in enumerate(LABELS):
        per_class[label] = {**prf(confusion[i][i], sum(r[i] for r in confusion) - confusion[i][i],
                                 sum(confusion[i]) - confusion[i][i]), "support": sum(confusion[i])}
    positive_tp = sum(confusion[i][j] for i in (1, 2) for j in (1, 2))
    result = {
        "counts": dict(counts), "tokenConfusion": confusion, "tokenClasses": per_class,
        "tokenPositive": {**prf(positive_tp, sum(confusion[0][1:]),
                               confusion[1][0] + confusion[2][0] + confusion[1][3] + confusion[2][3]),
                          "support": sum(sum(confusion[i]) for i in (1, 2))},
        "tokenBIMacroF1": (per_class["B"]["f1"] + per_class["I"]["f1"]) / 2,
        "span": prf(counts["tp"], counts["fp"], counts["fn"]),
        "utteranceExactLowerBound": counts["utteranceExact"] / counts["rows"] if counts["rows"] else 0,
        "diagnostics": dict(diagnostics),
    }
    for group in ("positive", "empty"):
        result[group] = {"rows": counts[group + ":rows"], "exact": counts[group + ":exact"],
                         "utteranceExact": counts[group + ":exact"] / counts[group + ":rows"]
                         if counts[group + ":rows"] else None}
    return result

def class_weights(rows):
    counts = Counter(label for r in rows for label in r["labels"] if label != -100)
    total = sum(counts.values())
    return [total / (3 * counts[i]) if counts[i] else 0. for i in range(3)], [counts[i] for i in range(3)]

def load_corpus(data, source_root, exclusion_path):
    data, source_root = Path(data), Path(source_root)
    manifest_path = data / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if digest(exclusion_path) != manifest["exclusion"]["sha256"]:
        raise ValueError("exclusion-hash-mismatch")
    exclusions = set(json.loads(Path(exclusion_path).read_text()))
    original = {}
    source_hashes = {}
    for source in manifest["sources"]:
        path = source_root / source["path"]
        if digest(path) != source["sha256"]:
            raise ValueError("raw-source-hash-mismatch:" + source["path"])
        source_hashes[source["path"]] = source["sha256"]
        for line in path.read_text().splitlines():
            raw = json.loads(line)
            key = source["path"] + ":" + raw["id"]
            if key in original:
                raise ValueError("duplicate-raw-source-id")
            original[key] = raw
    splits = {}
    seen = set()
    for split in ("train", "calibration"):
        path = data / (split + ".jsonl")
        if digest(path) != manifest["outputs"][split]:
            raise ValueError("corpus-hash-mismatch:" + split)
        rows = []
        for line in path.read_text().splitlines():
            row = json.loads(line)
            identity = row["source_path"] + ":" + row["source_id"]
            expected_split = "calibration" if int(hashlib.sha256(identity.encode()).hexdigest()[:8], 16) % 10 == 0 else "train"
            if row["source_id"] in exclusions or row["split"] != split or split != expected_split:
                raise ValueError("reserved-id-or-split-mismatch")
            if identity in seen or row["id"] != identity:
                raise ValueError("duplicate-or-invalid-source-identity")
            seen.add(identity)
            raw = original[identity]
            # Different schema generations use text or message; require an exact declared source field.
            candidates = [raw[k] for k in ("text", "message", "utterance") if k in raw]
            if row["source"]["text"] not in candidates or row["annotations"] != raw.get("requests"):
                raise ValueError("original-annotation-or-text-mismatch:" + identity)
            if row["source_sha256"] != source_hashes[row["source_path"]]:
                raise ValueError("row-source-hash-mismatch")
            text, requests = row["source"]["text"], row["annotations"]
            spans, issues = gold_spans(text, requests)
            rows.append({"id": identity, "text": text, "requests": requests,
                         "request_count": len(requests), "spans": spans, "gold_issues": issues})
        splits[split] = rows
    expected = {key for key, raw in original.items() if raw["id"] not in exclusions}
    if seen != expected:
        raise ValueError("raw-corpus-coverage-mismatch")
    return splits, {"manifestSha256": digest(manifest_path), "outputs": manifest["outputs"],
                    "sourceHashes": source_hashes, "exclusionSha256": digest(exclusion_path),
                    "exclusionCount": len(exclusions), "sourceCount": len(original),
                    "supervision": "original-request-span-only"}

def tokenize_rows(rows, tokenizer, max_length):
    result = []
    for row in rows:
        full = tokenizer(row["text"], truncation=False, add_special_tokens=True)
        encoded = tokenizer(row["text"], truncation=True, max_length=max_length, padding="max_length",
                            return_offsets_mapping=True)
        offsets = [tuple(p) for p in encoded["offset_mapping"]]
        sequences = encoded.sequence_ids()
        truncated = len(full["input_ids"]) > max_length
        labels, issues = align_labels(row["text"], row["spans"], offsets, sequences,
                                      encoded["attention_mask"], truncated, row["gold_issues"])
        result.append({**row, "input_ids": encoded["input_ids"], "attention_mask": encoded["attention_mask"],
                       "offsets": offsets, "sequence_ids": sequences, "truncated": truncated,
                       "labels": labels, "issues": issues})
    return result

def build_model(encoder_path):
    import torch
    from transformers import AutoModel
    class Cutter(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = AutoModel.from_pretrained(encoder_path, local_files_only=True)
            self.bio = torch.nn.Linear(self.encoder.config.hidden_size, 3)
        def forward(self, input_ids, attention_mask):
            return self.bio(self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state)
    return Cutter()

def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")

def audit(splits):
    report = {}
    for split, rows in splits.items():
        counters = Counter()
        examples = []
        for row in rows:
            counters["rows"] += 1
            counters["requests"] += row["request_count"]
            counters["emptyRows" if row["request_count"] == 0 else "positiveRows"] += 1
            counters["diagnosticRows"] += bool(row["gold_issues"])
            counters.update(row["gold_issues"])
            if row["gold_issues"]:
                examples.append({"id": row["id"], "reasons": row["gold_issues"]})
        report[split] = {"counts": dict(counters), "diagnostics": examples}
    return report

def train(args, splits, provenance):
    import torch
    from transformers import AutoTokenizer
    if args.epochs < 3 and not args.smoke:
        raise ValueError("at-least-three-epochs-required")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.set_num_threads(args.cpu_threads)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=False)
    source_path = Path(__file__).resolve()
    source_sha = digest(source_path)
    shutil.copyfile(source_path, out / "trainer.py")
    if args.init_checkpoint:
        if not args.init_sha256 or digest(args.init_checkpoint) != args.init_sha256:
            raise ValueError("warm-checkpoint-hash-mismatch")
        init_manifest = json.loads(Path(args.init_manifest).read_text())
        if init_manifest["format"] != "sop.inventory-bootstrap.run":
            raise ValueError("only-clean-auxiliary-warmstart-supported")
    tokenizer = AutoTokenizer.from_pretrained(args.encoder, local_files_only=True, use_fast=True)
    if not tokenizer.is_fast:
        raise ValueError("exact-fast-tokenizer-offsets-required")
    encoded = {}
    for split, rows in splits.items():
        encoded[split] = tokenize_rows(rows[:args.limit] if args.limit else rows, tokenizer, args.max_length)
    model = build_model(args.encoder)
    if args.init_checkpoint:
        state = torch.load(args.init_checkpoint, map_location="cpu", weights_only=True)
        state = state.get("model", state)
        if any(not k.startswith(("encoder.", "score.", "span.")) for k in state):
            raise ValueError("unexpected-warm-checkpoint-role")
        model.encoder.load_state_dict({k[len("encoder."):]: v for k, v in state.items()
                                       if k.startswith("encoder.")}, strict=True)
    device = torch.device(args.device)
    model.to(device)
    model_bytes = sum(p.numel() * p.element_size() for p in model.parameters())
    if shutil.disk_usage(out).free < 2 * model_bytes + 128 * 1024**2:
        raise ValueError("insufficient-atomic-checkpoint-reserve")
    weights, counts = class_weights(encoded["train"])
    weight = torch.tensor(weights, device=device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    config = {"format": "sop.request-cutter-model/1", "artifactRole": "smoke" if args.smoke else "trained",
              "executionEligible": False, "graphConfidence": None, "codec": CODEC,
              "codecSha256": hashlib.sha256(canonical(CODEC).encode()).hexdigest(),
              "maxLength": args.max_length, "encoder": str(args.encoder),
              "encoderFiles": {p.name: digest(p) for p in Path(args.encoder).iterdir() if p.is_file()},
              "warmCheckpointSha256": args.init_sha256, "warmRole": "clean-auxiliary-encoder-only" if args.init_checkpoint else "pretrained",
              "warmManifestSha256": digest(args.init_manifest) if args.init_checkpoint else None,
              "classCountsTrainOnly": counts, "classWeightsTrainOnly": weights,
              "trainerSha256": source_sha, "seed": args.seed, "provenance": provenance,
              "torch": str(torch.__version__), "transformers": __import__("transformers").__version__,
              "autocast": "bfloat16" if device.type == "cuda" else "none",
              "epochs": args.epochs, "minEpochs": 3, "patience": args.patience,
              "selectionMetric": "calibration.span.f1", "batchSize": args.batch_size, "lr": args.lr}
    write_json(out / "model-config.json", config)
    write_json(out / "span-audit.json", audit(splits))
    prep = {}
    for split, rows in encoded.items():
        issues = Counter(reason for row in rows for reason in row["issues"])
        prep[split] = {"rows": len(rows), "maskedRows": sum(bool(r["issues"]) for r in rows),
                       "truncatedRows": sum(r["truncated"] for r in rows), "diagnostics": dict(issues)}
    write_json(out / "preparation.json", prep)
    def batch(rows):
        return {key: torch.tensor([r[key] for r in rows], dtype=torch.long, device=device)
                for key in ("input_ids", "attention_mask")}
    def infer(rows):
        predictions = []
        model.eval()
        with torch.no_grad():
            for offset in range(0, len(rows), args.batch_size):
                sample = rows[offset:offset + args.batch_size]
                with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
                    logits = model(**batch(sample))
                # Exact ties are unknown labels, causing explicit unresolved decoding.
                maxima = logits.max(-1, keepdim=True).values
                pred = logits.argmax(-1)
                pred[(logits == maxima).sum(-1) != 1] = -1
                predictions.extend(pred.cpu().tolist())
        return predictions
    history, best, best_epoch, stale, step = [], -1., None, 0, 0
    for epoch in range(1, args.epochs + 1):
        model.train()
        order = list(range(len(encoded["train"])))
        random.Random(args.seed + epoch).shuffle(order)
        loss_sum, updates, masked_batches = 0., 0, 0
        for offset in range(0, len(order), args.batch_size):
            if digest(source_path) != source_sha:
                raise ValueError("trainer-source-mutated")
            sample = [encoded["train"][i] for i in order[offset:offset + args.batch_size]]
            labels = torch.tensor([r["labels"] for r in sample], dtype=torch.long, device=device)
            if not (labels != -100).any():
                masked_batches += 1
                continue
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
                logits = model(**batch(sample))
                loss = torch.nn.functional.cross_entropy(logits.reshape(-1, 3), labels.reshape(-1), weight=weight)
            if not torch.isfinite(loss):
                raise ValueError("nonfinite-loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
            optimizer.step()
            step += 1
            updates += 1
            loss_sum += loss.item()
            if step % 20 == 0:
                print(canonical({"epoch": epoch, "step": step, "rows": min(offset + args.batch_size, len(order)),
                                 "loss": loss_sum / updates}), flush=True)
        report = metrics(encoded["calibration"], infer(encoded["calibration"]))
        score = report["span"]["f1"]
        record = {"epoch": epoch, "step": step, "trainLoss": loss_sum / max(updates, 1),
                  "updates": updates, "maskedBatches": masked_batches, "calibration": report}
        history.append(record)
        write_json(out / "history.json", history)
        print(canonical(record), flush=True)
        if score > best:
            best, best_epoch, stale = score, epoch, 0
            if args.smoke:
                continue
            if shutil.disk_usage(out).free < model_bytes + 64 * 1024**2:
                raise ValueError("insufficient-atomic-save-reserve")
            temp = out / "best.tmp"
            torch.save({"model": model.state_dict(), "config": config, "epoch": epoch,
                        "step": step, "optimizerStored": False}, temp)
            os.replace(temp, out / "best.pt")
        else:
            stale += 1
        if epoch >= 3 and stale >= args.patience:
            break
    # Evaluate the immutable selected checkpoint, not the final optimizer state.
    checkpoint_sha = None
    if not args.smoke:
        checkpoint_sha = digest(out / "best.pt")
        saved = torch.load(out / "best.pt", map_location=device, weights_only=True)
        model.load_state_dict(saved["model"], strict=True)
    predictions = infer(encoded["calibration"])
    final = metrics(encoded["calibration"], predictions)
    with (out / "calibration-predictions.jsonl").open("w") as handle:
        for row, pred in zip(encoded["calibration"], predictions):
            spans, issues = decode_bio(pred, row["offsets"], row["sequence_ids"], row["attention_mask"],
                                      len(row["text"]), row["truncated"])
            handle.write(canonical({"id": row["id"], "source": {"text": row["text"], "unit": "unicode-scalar"},
                                    "spans": spans, "coverage": {"complete": not issues, "truncated": row["truncated"]},
                                    "unresolved": issues, "model": {"sha256": checkpoint_sha,
                                    "tokenizerSha256": config["encoderFiles"].get("tokenizer.json"),
                                    "codecSha256": config["codecSha256"], "decoderVersion": CODEC["format"]}}) + "\n")
    if digest(source_path) != source_sha or (not args.smoke and digest(out / "best.pt") != checkpoint_sha):
        raise ValueError("frozen-source-or-checkpoint-mutated")
    if args.init_checkpoint and digest(args.init_checkpoint) != args.init_sha256:
        raise ValueError("warm-checkpoint-mutated")
    if digest(args.exclusions) != provenance["exclusionSha256"]:
        raise ValueError("exclusion-mutated")
    if digest(Path(args.data) / "manifest.json") != provenance["manifestSha256"]:
        raise ValueError("manifest-mutated")
    # Re-verify all data hashes after training; no changing source silently becomes provenance.
    for split, expected in provenance["outputs"].items():
        if digest(Path(args.data) / (split + ".jsonl")) != expected:
            raise ValueError("corpus-mutated")
    for name, expected in provenance["sourceHashes"].items():
        if digest(Path(args.source_root) / name) != expected:
            raise ValueError("raw-source-mutated")
    summary = {"format": "sop.request-cutter-run/1", "complete": True, "executionEligible": False,
               "role": "smoke" if args.smoke else "trained-cutter-only", "bestEpoch": best_epoch,
               "epochsCompleted": len(history), "steps": step, "checkpointSha256": checkpoint_sha,
               "configSha256": digest(out / "model-config.json"), "trainerSha256": source_sha,
               "calibration": final, "provenance": provenance, "confidenceCalibrated": False,
               "boundary": "Cutter spans only; not request field accuracy or complete-command confidence."}
    write_json(out / "final-verification.json", summary)
    print(canonical(summary), flush=True)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("command", choices=["audit", "train"])
    p.add_argument("--data", required=True)
    p.add_argument("--source-root", required=True)
    p.add_argument("--exclusions", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--encoder")
    p.add_argument("--init-checkpoint")
    p.add_argument("--init-sha256")
    p.add_argument("--init-manifest")
    p.add_argument("--max-length", type=int, default=192)
    p.add_argument("--epochs", type=int, default=5)
    p.add_argument("--patience", type=int, default=2)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--cpu-threads", type=int, default=4)
    p.add_argument("--lr", type=float, default=3e-5)
    p.add_argument("--seed", type=int, default=20261117)
    p.add_argument("--device", default="cuda")
    p.add_argument("--limit", type=int)
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args()
    if args.limit and not args.smoke:
        p.error("--limit requires --smoke")
    splits, provenance = load_corpus(args.data, args.source_root, args.exclusions)
    if args.command == "audit":
        write_json(args.out, {"audit": audit(splits), "provenance": provenance})
    else:
        if not args.encoder:
            p.error("--encoder required")
        train(args, splits, provenance)

if __name__ == "__main__":
    main()
