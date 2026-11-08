"""Seq2seq normalizer (worker-tasks N1, spec 03 section 7.11): rewrites a piece into the simplest phrasing the world's rules understand.

  python -m psys2_train.normalizer train   --model google/flan-t5-small --out /home/salboaie/work/psys2/training/runs/n1/flan-t5-small [--epochs 6]
  python -m psys2_train.normalizer predict --ckpt <run dir> --requests <requests.jsonl> --out <outputs.jsonl> [--beams 3]

Input of the model: `<world> | <tab or -> | <piece>`; target: the simplified piece. Pairs: training/dataset-normalizer/{train,dev}.jsonl made by
scripts/build-normalizer-pairs.mjs (every target is verified by the rules). `predict` reads {id, world, tab, text} lines (written by
scripts/eval-normalizer.mjs for every piece the rules do not read) and writes {id, outputs: [beam 1..k]}. Always on the GPU, bf16 autocast.
"""
from __future__ import annotations
import argparse, json, math, os, random, time
from pathlib import Path
os.environ.setdefault("TORCH_DISABLE_NATIVE_JIT", "1")   # torch 2.14 native triton ops need Python.h for gcc (missing on the host)
import torch
from .data import read_jsonl, DATASET

NORM_DIR = DATASET.parent / "dataset-normalizer"
REAL = {"variant", "variant-canonical", "variant-shorter", "variant-identity"}


def require_cuda():
    assert torch.cuda.is_available(), "CUDA is required: this task must run on the GPU (never fall back to CPU)"
    return torch.device("cuda")


def make_input(world, tab, text):
    return f"{world} | {tab or '-'} | {text}"


def load_pairs(split, real_weight=1):
    rows = read_jsonl(NORM_DIR / f"{split}.jsonl")
    out = []
    for r in rows:
        k = real_weight if r["source"] in REAL else 1
        out.extend([(make_input(r["world"], r.get("tab"), r["src"]), r["tgt"])] * k)
    return out


def batches(enc_src, enc_tgt, bs, shuffle, rnd, pad_id):
    """Length-bucketed batches: sort inside chunks of 50 batches, then shuffle the batches."""
    idx = list(range(len(enc_src)))
    if shuffle:
        rnd.shuffle(idx)
    chunk = bs * 50
    bl = []
    for i in range(0, len(idx), chunk):
        part = sorted(idx[i:i + chunk], key=lambda j: len(enc_src[j]))
        bl.extend(part[k:k + bs] for k in range(0, len(part), bs))
    if shuffle:
        rnd.shuffle(bl)
    for b in bl:
        ms = max(len(enc_src[j]) for j in b); mt = max(len(enc_tgt[j]) for j in b)
        ids = torch.full((len(b), ms), pad_id); att = torch.zeros((len(b), ms), dtype=torch.long); lab = torch.full((len(b), mt), -100)
        for r, j in enumerate(b):
            ids[r, :len(enc_src[j])] = torch.tensor(enc_src[j]); att[r, :len(enc_src[j])] = 1; lab[r, :len(enc_tgt[j])] = torch.tensor(enc_tgt[j])
        yield ids, att, lab


@torch.no_grad()
def generate(model, tok, inputs, dev, beams=3, bs=256, max_new=64, max_src=160, scores=False, bf16=True):
    """List (per input) of `beams` rewrites, best first (with `scores`: [(text, length-normalized log-prob)]). Batched by length."""
    order = sorted(range(len(inputs)), key=lambda i: len(inputs[i]))
    res = [None] * len(inputs)
    model.eval()
    for s in range(0, len(order), bs):
        ids = order[s:s + bs]
        enc = tok([inputs[i] for i in ids], return_tensors="pt", padding=True, truncation=True, max_length=max_src).to(dev)
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=bf16):
            out = model.generate(**enc, num_beams=beams, num_return_sequences=beams, max_new_tokens=max_new, early_stopping=True, return_dict_in_generate=True, output_scores=True)
        texts = tok.batch_decode(out.sequences, skip_special_tokens=True)
        sc = out.sequences_scores.float().cpu().tolist() if beams > 1 else [0.0] * len(texts)
        for k, i in enumerate(ids):
            res[i] = [(t.strip(), round(x, 4)) for t, x in zip(texts[k * beams:(k + 1) * beams], sc[k * beams:(k + 1) * beams])] if scores else [t.strip() for t in texts[k * beams:(k + 1) * beams]]
    return res


def train(a):
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    dev = require_cuda()
    torch.manual_seed(a.seed); rnd = random.Random(a.seed)
    tok = AutoTokenizer.from_pretrained(a.model)
    model = AutoModelForSeq2SeqLM.from_pretrained(a.model, attn_implementation="eager").to(dev)
    tr = load_pairs("train", a.real_weight); dv = load_pairs("dev")[: a.dev_limit]
    print(f"pairs: train {len(tr)} (real weight {a.real_weight}), dev {len(dv)}; params {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M", flush=True)
    t0 = time.time()
    enc = lambda xs, ml: tok(xs, truncation=True, max_length=ml)["input_ids"]
    tr_s, tr_t = enc([s for s, _ in tr], a.max_src), enc([t for _, t in tr], a.max_tgt)
    dv_s, dv_t = enc([s for s, _ in dv], a.max_src), enc([t for _, t in dv], a.max_tgt)
    print(f"tokenized in {time.time() - t0:.0f}s; mean src {sum(map(len, tr_s)) / len(tr_s):.1f} tgt {sum(map(len, tr_t)) / len(tr_t):.1f} tokens", flush=True)
    steps = a.epochs * math.ceil(len(tr) / a.bs)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / 300) * max(0.02, 1 - s / steps))
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    step = 0; best = -1.0
    for ep in range(a.epochs):
        model.train(); tl = 0; n = 0; t0 = time.time()
        for ids, att, lab in batches(tr_s, tr_t, a.bs, True, rnd, tok.pad_token_id):
            ids, att, lab = ids.to(dev), att.to(dev), lab.to(dev)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                loss = model(input_ids=ids, attention_mask=att, labels=lab).loss
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
            tl += loss.item(); n += 1; step += 1
            if step % 200 == 0:
                print(f"  step {step}/{steps} loss {tl / n:.4f}", flush=True)
        model.eval(); vl = 0; vn = 0
        with torch.no_grad():
            for ids, att, lab in batches(dv_s, dv_t, 256, False, rnd, tok.pad_token_id):
                ids, att, lab = ids.to(dev), att.to(dev), lab.to(dev)
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    vl += model(input_ids=ids, attention_mask=att, labels=lab).loss.item() * len(ids); vn += len(ids)
        vl /= max(vn, 1)
        sample = dv[:: max(1, len(dv) // 600)][:600]
        gen = generate(model, tok, [s for s, _ in sample], dev, beams=1)
        em = sum(g[0] == t for g, (_, t) in zip(gen, sample)) / len(sample)
        print(f"epoch {ep + 1}/{a.epochs}: train loss {tl / n:.4f} dev loss {vl:.4f} dev exact-match {em:.3f} ({time.time() - t0:.0f}s)", flush=True)
        if em >= best:   # the best checkpoint is chosen by greedy exact match on dev (several targets are valid, so dev loss rises while the model improves)
            best = em; model.save_pretrained(out); tok.save_pretrained(out)
            json.dump({"model": a.model, "epoch": ep + 1, "dev_loss": vl, "dev_exact_match": em, "args": vars(a), "input_format": "<world> | <tab or -> | <piece>"}, open(out / "meta.json", "w"), indent=1)
    print("saved best to", out)


def predict(a):
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    dev = require_cuda()
    tok = AutoTokenizer.from_pretrained(a.ckpt); model = AutoModelForSeq2SeqLM.from_pretrained(a.ckpt, attn_implementation="eager").to(dev)
    reqs = read_jsonl(a.requests)
    t0 = time.time()
    gen = generate(model, tok, [make_input(r["world"], r.get("tab"), r["text"]) for r in reqs], dev, beams=a.beams, bs=a.bs, scores=True, bf16=not a.fp32)
    with open(a.out, "w") as f:
        for r, g in zip(reqs, gen):
            f.write(json.dumps({"id": r["id"], "world": r["world"], "tab": r.get("tab"), "text": r["text"], "outputs": [t for t, _ in g], "scores": [x for _, x in g]}) + "\n")
    print(f"{len(reqs)} requests -> {a.out} in {time.time() - t0:.0f}s")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--model", default="google/flan-t5-small"); t.add_argument("--out", required=True)
    t.add_argument("--epochs", type=int, default=6); t.add_argument("--bs", type=int, default=256); t.add_argument("--lr", type=float, default=5e-4)
    t.add_argument("--real-weight", type=int, default=4, help="repeat factor of the pairs from real paraphrase variants"); t.add_argument("--max-src", type=int, default=128); t.add_argument("--max-tgt", type=int, default=64)
    t.add_argument("--dev-limit", type=int, default=4000); t.add_argument("--seed", type=int, default=7)
    p = sub.add_parser("predict")
    p.add_argument("--ckpt", required=True); p.add_argument("--requests", required=True); p.add_argument("--out", required=True); p.add_argument("--beams", type=int, default=3); p.add_argument("--bs", type=int, default=256); p.add_argument("--fp32", action="store_true", help="no bf16 autocast (what the exported ONNX graphs compute)")
    a = ap.parse_args(argv)
    {"train": train, "predict": predict}[a.cmd](a)


if __name__ == "__main__":
    main()
