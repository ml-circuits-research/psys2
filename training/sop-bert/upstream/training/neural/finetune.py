"""finetune.py: fine-tune a sequence classifier (request text -> act) and export it for transformers.js 3.8.1.

Data: make_data.py output (train.jsonl, heldout.jsonl, eval_*.jsonl, acts.json). Training: plain PyTorch loop, fp16 autocast on cuda,
AdamW + linear warm-up/decay, early stop on held-out act accuracy (the best epoch is kept). Export: optimum (onnxruntime) ONNX export,
then dynamic 8-bit quantization as transformers.js scripts/convert.py does for dtype q8 (QUInt8 weights, per_channel, reduce_range) ->
onnx/model_quantized.onnx. The output folder is the layout transformers.js loads: config.json, tokenizer.json, tokenizer_config.json,
onnx/model_quantized.onnx (+ README.md). Then, when node is available, check_node.mjs loads it as a `text-classification` pipeline and
compares its top label with torch's on 50 held-out rows.

--base NAME        a Hugging Face checkpoint (distilbert-base-uncased, microsoft/deberta-v3-xsmall, or the NLI originals
                   typeform/distilbert-base-uncased-mnli, cross-encoder/nli-deberta-v3-xsmall: the 3-way head is replaced)
--base tiny        a 2-layer DistilBERT built from scratch with a WordPiece tokenizer trained on the data (offline smoke test)
--base tiny-deberta  the same for DeBERTa-v2 (the architecture of deberta-v3)
Run: python3 training/neural/finetune.py --base distilbert-base-uncased --name act-distilbert [--data DIR] [--work DIR] [--out DIR]
"""
import argparse, collections, json, os, random, shutil, subprocess, sys, time
import numpy as np, torch
from transformers import (AutoConfig, AutoModelForSequenceClassification, AutoTokenizer, DebertaV2Config, DistilBertConfig,
                          PreTrainedTokenizerFast, get_linear_schedule_with_warmup)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
LICENSE = {"distilbert-base-uncased": "Apache-2.0", "microsoft/deberta-v3-xsmall": "MIT", "typeform/distilbert-base-uncased-mnli": "Apache-2.0",
           "cross-encoder/nli-deberta-v3-xsmall": "Apache-2.0", "tiny": "none (random weights, smoke test)", "tiny-deberta": "none (random weights, smoke test)"}


def read(path): return [json.loads(l) for l in open(path, encoding="utf8") if l.strip()]


def tiny_tokenizer(texts, work):
    from tokenizers import Tokenizer, models, normalizers, pre_tokenizers, trainers, processors, decoders
    tk = Tokenizer(models.WordPiece(unk_token="[UNK]")); tk.normalizer = normalizers.BertNormalizer(lowercase=True)
    tk.pre_tokenizer = pre_tokenizers.BertPreTokenizer()
    tk.train_from_iterator(texts, trainers.WordPieceTrainer(vocab_size=1000, special_tokens=["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"]))
    tk.post_processor = processors.TemplateProcessing(single="[CLS] $A [SEP]", special_tokens=[("[CLS]", tk.token_to_id("[CLS]")), ("[SEP]", tk.token_to_id("[SEP]"))])
    tk.decoder = decoders.WordPiece()
    return PreTrainedTokenizerFast(tokenizer_object=tk, unk_token="[UNK]", pad_token="[PAD]", cls_token="[CLS]", sep_token="[SEP]", mask_token="[MASK]", model_max_length=128)


def build(base, labels, texts, work):
    id2label = {i: l for i, l in enumerate(labels)}; label2id = {l: i for i, l in id2label.items()}
    if base.startswith("tiny"):
        tok = tiny_tokenizer(texts, work); V = len(tok)
        if base == "tiny":
            cfg = DistilBertConfig(vocab_size=V, n_layers=2, n_heads=2, dim=64, hidden_dim=128, max_position_embeddings=128, num_labels=len(labels))
        else:
            cfg = DebertaV2Config(vocab_size=V, num_hidden_layers=2, num_attention_heads=2, hidden_size=64, intermediate_size=128, max_position_embeddings=128,
                                  relative_attention=True, position_buckets=16, norm_rel_ebd="layer_norm", pos_att_type=["p2c", "c2p"], num_labels=len(labels),
                                  pad_token_id=0, type_vocab_size=0)
        cfg.id2label, cfg.label2id = id2label, label2id
        return tok, AutoModelForSequenceClassification.from_config(cfg)
    tok = AutoTokenizer.from_pretrained(base)
    cfg = AutoConfig.from_pretrained(base, num_labels=len(labels), id2label=id2label, label2id=label2id)
    return tok, AutoModelForSequenceClassification.from_pretrained(base, config=cfg, ignore_mismatched_sizes=True)


def batches(rows, tok, bs, shuffle, rng, label2id, dev):
    idx = list(range(len(rows)))
    if shuffle: rng.shuffle(idx)
    for i in range(0, len(idx), bs):
        part = [rows[j] for j in idx[i:i + bs]]
        enc = tok([r["text"] for r in part], padding=True, truncation=True, max_length=64, return_tensors="pt")
        enc = {k: v.to(dev) for k, v in enc.items()}
        yield enc, torch.tensor([label2id[r["label"]] for r in part], device=dev)


@torch.no_grad()
def predict(model, tok, rows, label2id, dev, fp16, bs=128):
    model.eval(); out = []
    for enc, _ in batches(rows, tok, bs, False, None, label2id, dev):
        with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=fp16): out.append(model(**enc).logits.float().cpu())
    return torch.cat(out) if out else torch.zeros(0, len(label2id))


def accuracy(model, tok, rows, label2id, dev, fp16):
    if not rows: return 0.0, []
    pred = predict(model, tok, rows, label2id, dev, fp16).argmax(1).tolist(); gold = [label2id[r["label"]] for r in rows]
    return sum(p == g for p, g in zip(pred, gold)) / len(rows), list(zip(gold, pred))


def confusions(pairs, labels, n=10):
    c = collections.Counter((labels[g], labels[p]) for g, p in pairs if g != p)
    return [f"{g} -> {p}: {k}" for (g, p), k in c.most_common(n)]


def export(model, tok, labels, out, work, rows_for_check):
    from optimum.exporters.onnx import main_export
    from onnxruntime.quantization import QuantType, quantize_dynamic
    best = os.path.join(work, "best"); model.save_pretrained(best); tok.save_pretrained(best)
    ox = os.path.join(work, "onnx_fp32"); shutil.rmtree(ox, ignore_errors=True)
    main_export(best, output=ox, task="text-classification", do_validation=False, device="cpu")
    shutil.rmtree(out, ignore_errors=True); os.makedirs(os.path.join(out, "onnx"))
    quantize_dynamic(os.path.join(ox, "model.onnx"), os.path.join(out, "onnx", "model_quantized.onnx"), per_channel=True, reduce_range=True, weight_type=QuantType.QUInt8)
    tok.save_pretrained(out)
    for f in os.listdir(out):   # keep only what transformers.js reads: tokenizer.json, tokenizer_config.json (+ config.json below)
        if f not in ("tokenizer.json", "tokenizer_config.json", "onnx"): os.remove(os.path.join(out, f))
    shutil.copy(os.path.join(ox, "config.json"), os.path.join(out, "config.json"))
    cfg = json.load(open(os.path.join(out, "config.json"))); cfg["id2label"] = {str(i): l for i, l in enumerate(labels)}; cfg["label2id"] = {l: i for i, l in enumerate(labels)}
    json.dump(cfg, open(os.path.join(out, "config.json"), "w"), indent=2)


def torch_reference(model, tok, rows, label2id, labels, dev, path):
    lg = predict(model, tok, rows, label2id, dev, False)
    with open(path, "w") as f:
        for r, l in zip(rows, lg): f.write(json.dumps({"text": r["text"], "top": labels[int(l.argmax())], "gold": r["label"]}) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--data", default=os.path.expanduser("~/vss-box/ft/data"))
    ap.add_argument("--work", default=None, help="checkpoints and caches, outside the repo (default ~/vss-box/ft/<name>)")
    ap.add_argument("--out", default=None, help="default docs/model/neural/<name>")
    ap.add_argument("--epochs", type=int, default=6); ap.add_argument("--patience", type=int, default=2)
    ap.add_argument("--lr", type=float, default=6e-5); ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--max-steps", type=int, default=0, help="stop after N optimizer steps (smoke test)")
    ap.add_argument("--seed", type=int, default=0); ap.add_argument("--no-fp16", action="store_true")
    ap.add_argument("--no-node-check", action="store_true")
    a = ap.parse_args()
    work = a.work or os.path.expanduser(f"~/vss-box/ft/{a.name}"); out = a.out or os.path.join(REPO, "docs", "model", "neural", a.name)
    os.makedirs(work, exist_ok=True); os.environ.setdefault("HF_HOME", os.path.expanduser("~/vss-box/ft/hf"))
    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed); rng = random.Random(a.seed)
    dev = "cuda" if torch.cuda.is_available() else "cpu"; fp16 = dev == "cuda" and not a.no_fp16
    labels = json.load(open(os.path.join(a.data, "acts.json"))); label2id = {l: i for i, l in enumerate(labels)}
    train, held = read(os.path.join(a.data, "train.jsonl")), read(os.path.join(a.data, "heldout.jsonl"))
    evals = {f[5:-6]: read(os.path.join(a.data, f)) for f in sorted(os.listdir(a.data)) if f.startswith("eval_")}
    tok, model = build(a.base, labels, [r["text"] for r in train], work); model.to(dev)
    import inspect   # the tokenizer must return only what the model's forward takes (DistilBERT has no token_type_ids)
    tok.model_input_names = [n for n in tok.model_input_names if n in inspect.signature(model.forward).parameters]
    nparam = sum(p.numel() for p in model.parameters())
    print(f"base {a.base}: {nparam / 1e6:.1f}M parameters, device {dev}, fp16 {fp16}; train {len(train)} held-out {len(held)}", flush=True)
    steps_per_epoch = (len(train) + a.bs - 1) // a.bs; total = a.max_steps or steps_per_epoch * a.epochs
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    sch = get_linear_schedule_with_warmup(opt, int(0.06 * total), total); scaler = torch.amp.GradScaler("cuda", enabled=fp16)
    best, bad, step, best_state, t0 = -1.0, 0, 0, None, time.time(); done = False
    for ep in range(1, a.epochs + 1):
        model.train(); loss_sum = n = 0
        for enc, y in batches(train, tok, a.bs, True, rng, label2id, dev):
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=fp16): loss = torch.nn.functional.cross_entropy(model(**enc).logits.float(), y)
            opt.zero_grad(); scaler.scale(loss).backward(); scaler.unscale_(opt); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt); scaler.update(); sch.step(); loss_sum += loss.item(); n += 1; step += 1
            if a.max_steps and step >= a.max_steps: done = True; break
        acc, pairs = accuracy(model, tok, held, label2id, dev, fp16)
        print(f"epoch {ep}: loss {loss_sum / max(n, 1):.4f}  held-out act accuracy {acc:.4f}  ({time.time() - t0:.0f}s)", flush=True)
        if acc > best: best, bad, best_state = acc, 0, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}; best_pairs = pairs
        else: bad += 1
        if done or bad >= a.patience: break
    model.load_state_dict(best_state); model.to(dev)
    print(f"\nbest held-out act accuracy {best:.4f}; top-10 confusions (gold -> predicted: count):")
    for c in confusions(best_pairs, labels): print("  " + c)
    ev_acc = {"heldout": best}
    for k, rows in evals.items():
        ev_acc[k], _ = accuracy(model, tok, rows, label2id, dev, fp16); print(f"  eval {k:22} n={len(rows):5}  act accuracy {ev_acc[k]:.4f}")
    model.to("cpu"); dev = "cpu"
    chk = held[:50] if len(held) >= 50 else held
    ref = os.path.join(work, "torch_top.jsonl"); torch_reference(model, tok, chk, label2id, labels, dev, ref)
    export(model, tok, labels, out, work, chk)
    q = os.path.getsize(os.path.join(out, "onnx", "model_quantized.onnx"))
    agree = None
    if not a.no_node_check and shutil.which("node"):
        r = subprocess.run(["node", os.path.join(HERE, "check_node.mjs"), os.path.dirname(os.path.abspath(out)), os.path.basename(os.path.abspath(out)), ref],
                           capture_output=True, text=True); print(r.stdout.strip(), r.stderr.strip()[-500:])
        agree = json.loads(r.stdout.strip().splitlines()[-1])["agree"] if r.returncode == 0 and r.stdout.strip() else None
    lic = LICENSE.get(a.base, "see the base model's card")
    with open(os.path.join(out, "README.md"), "w") as f:
        f.write(f"""# {a.name}: the demo's neural reader, fine-tuned on our annotated requests

A sequence classifier: the text of one request -> its act (the action of a command, the ask of a question, else `fact` or `rule`;
{len(labels)} classes, the act set of docs/js/neural.js ACTION + ASK + fact + rule; the class names are `id2label` in config.json).
Load with transformers.js as `text-classification` (dtype `q8`, file `onnx/model_quantized.onnx`).

- Base model: `{a.base}` (license: {lic}); fine-tuned here, weights are a derivative of it.
- Data: {len(train)} request spans from the span-annotated messages of training/sketch (made by training/neural/make_data.py; split by message id,
  10% of the messages held out; the fixed 1000-message sample and the docs/bench sets are never trained on).
- Held-out act accuracy (fp32 torch): {best:.4f}. Other sets: {", ".join(f"{k} {v:.3f}" for k, v in ev_acc.items() if k != "heldout")}.
- Size: onnx/model_quantized.onnx {q / 1e6:.1f} MB (q8). Node check vs torch top label on {len(chk)} held-out rows: {"agree " + str(agree) if agree is not None else "not run"}.
- Trained with training/neural/finetune.py (epochs <= {a.epochs}, lr {a.lr}, batch {a.bs}, fp16 on cuda, seed {a.seed}).
""")
    print(f"\nwrote {out} ({q / 1e6:.1f} MB q8); README.md inside")


if __name__ == "__main__": main()
