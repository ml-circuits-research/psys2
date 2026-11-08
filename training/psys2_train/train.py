"""Train / evaluate one world (heads: slot tags + intent) or the routing head.

  python -m psys2_train.train --world kids.arith --model answerdotai/ModernBERT-base --epochs 5
  python -m psys2_train.train --task routing --model answerdotai/ModernBERT-base
  python -m psys2_train.train --world kids.arith --model tiny --max-steps 20      # smoke test, no download
"""
from __future__ import annotations
import argparse, json, random, sys, time, platform
from pathlib import Path
import torch
from transformers import AutoTokenizer, get_linear_schedule_with_warmup
from .data import (DATASET, load_world, read_jsonl, TagScheme, token_tag_ids, spans_from_tags, context_text, routing_text, data_hash)
from .sop import ValueMap, decode, NONE_INTENT
from .model import build_model, trainable_summary
from .metrics import slot_f1, accuracy, breakdown


def set_seed(s):
    random.seed(s); torch.manual_seed(s)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(s)


def pick_device(arg):
    if arg != "auto":
        return torch.device(arg)
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ---- encoding ------------------------------------------------------------------------------------------------------
def encode_sop(tok, exs, scheme, intent_id, max_len, with_context=True):
    items = []
    for ex in exs:
        ctx = context_text(ex) if with_context else None
        e = tok(ex["text"], ctx, truncation="only_second" if ctx else True, max_length=max_len, return_offsets_mapping=True)
        seq = e.sequence_ids()
        items.append({"input_ids": e["input_ids"], "offsets": e["offset_mapping"], "seq": [-1 if s is None else s for s in seq],
                      "tags": token_tag_ids(scheme, ex["slots"], e["offset_mapping"], [-1 if s is None else s for s in seq]),
                      "intent": intent_id.get(ex["intent"], -100), "weight": float(ex.get("weight", 1.0)), "ex": ex})
    return items


def encode_routing(tok, rows, route_id, max_len, use_context=True):
    items = []
    for r in rows:
        e = tok(routing_text(r, use_context), truncation=True, max_length=max_len)
        items.append({"input_ids": e["input_ids"], "route": route_id[r["world"]], "weight": float(r.get("weight", 1.0)), "ex": r})
    return items


def collate(batch, pad_id, device):
    n = max(len(b["input_ids"]) for b in batch)
    ids = torch.full((len(batch), n), pad_id); am = torch.zeros((len(batch), n), dtype=torch.long)
    out = {"weights": torch.tensor([b["weight"] for b in batch])}
    for i, b in enumerate(batch):
        ids[i, :len(b["input_ids"])] = torch.tensor(b["input_ids"]); am[i, :len(b["input_ids"])] = 1
    out.update(input_ids=ids, attention_mask=am)
    if "tags" in batch[0]:
        t = torch.full((len(batch), n), -100)
        for i, b in enumerate(batch):
            t[i, :len(b["tags"])] = torch.tensor(b["tags"])
        out["tag_labels"] = t
        out["intent_labels"] = torch.tensor([b["intent"] for b in batch])
    if "route" in batch[0]:
        out["route_labels"] = torch.tensor([b["route"] for b in batch])
    return {k: v.to(device) for k, v in out.items()}


def batches(items, size, shuffle, seed=0):
    idx = list(range(len(items)))
    if shuffle:
        random.Random(seed).shuffle(idx)
    for i in range(0, len(idx), size):
        yield [items[j] for j in idx[i:i + size]]


# ---- evaluation ----------------------------------------------------------------------------------------------------
@torch.no_grad()
def eval_sop(model, items, scheme, intents, vmap, pad_id, device, bs=64):
    model.eval()
    recs, gold_sets, pred_sets = [], [], []
    for b in batches(items, bs, False):
        o = model(**{k: v for k, v in collate(b, pad_id, device).items() if k in ("input_ids", "attention_mask")})
        tags = o["tag_logits"].argmax(-1).cpu().tolist(); intent = o["intent_logits"].argmax(-1).cpu().tolist()
        for it, tg, ic in zip(b, tags, intent):
            ex = it["ex"]
            pi = intents[ic]
            spans = spans_from_tags(scheme, tg[:len(it["input_ids"])], it["offsets"], it["seq"], ex["text"])
            if pi == NONE_INTENT:
                pred = ""
            else:
                filled = {n: ex["text"][a:b_] for n, a, b_ in spans}
                pred = decode(pi, filled, vmap)
            recs.append({"exact": pred == ex["target"], "source": ex["source"], "label_status": ex["label_status"],
                         "intent_ok": pi == ex["intent"], "negative": bool(ex.get("negative")), "pred": pred})
            gold_sets.append([tuple(s) for s in ex["slots"]]); pred_sets.append([] if pi == NONE_INTENT else spans)
    n = max(len(recs), 1)
    pos = [r for r in recs if not r["negative"]]
    return {"n": len(recs), "exact_sop": sum(r["exact"] for r in recs) / n, "intent_acc": sum(r["intent_ok"] for r in recs) / n,
            "exact_sop_positive": sum(r["exact"] for r in pos) / max(len(pos), 1),
            "negative_rejected": (sum(r["exact"] for r in recs if r["negative"]) / max(sum(r["negative"] for r in recs), 1)),
            "slot": slot_f1(gold_sets, pred_sets), "by_source": breakdown(recs, "source")}


@torch.no_grad()
def eval_routing(model, items, routes, pad_id, device, bs=128):
    model.eval()
    pairs = []
    for b in batches(items, bs, False):
        o = model(**{k: v for k, v in collate(b, pad_id, device).items() if k in ("input_ids", "attention_mask")})
        pairs += [(routes[p], it["ex"]["world"], it["ex"]) for p, it in zip(o["route_logits"].argmax(-1).cpu().tolist(), b)]
    ok = [(p == g) or (p in x.get("alt_worlds", [])) for p, g, x in pairs]
    return {"n": len(pairs), "accuracy": sum(ok) / max(len(ok), 1)}


# ---- main ----------------------------------------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", choices=["sop", "routing"], default="sop")
    ap.add_argument("--world"); ap.add_argument("--model", default="answerdotai/ModernBERT-base")
    ap.add_argument("--dataset", default=str(DATASET)); ap.add_argument("--out", default=None)
    ap.add_argument("--epochs", type=int, default=5); ap.add_argument("--max-steps", type=int, default=0)
    ap.add_argument("--batch-size", type=int, default=32); ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--head-lr", type=float, default=1e-3); ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--no-lora", action="store_true", help="full fine-tune (DistilBERT / ModernBERT ablation)")
    ap.add_argument("--lora-r", type=int, default=16); ap.add_argument("--patience", type=int, default=2)
    ap.add_argument("--seed", type=int, default=1); ap.add_argument("--device", default="auto")
    ap.add_argument("--limit", type=int, default=0, help="cap examples per split (smoke test)")
    ap.add_argument("--no-context", action="store_true"); ap.add_argument("--bf16", action="store_true")
    a = ap.parse_args(argv)
    set_seed(a.seed); dev = pick_device(a.device)
    root = Path(a.dataset)
    if a.task == "sop" and not a.world:
        ap.error("--world is required for --task sop")
    name = a.world if a.task == "sop" else "routing"
    out = Path(a.out or Path(__file__).resolve().parents[1] / "runs" / f"{name}-{int(time.time())}")
    out.mkdir(parents=True, exist_ok=True)

    # data
    if a.task == "sop":
        d = load_world(a.world, root, a.limit or None)
        if not d["train"]:
            sys.exit(f"no training data for {a.world} in {root}; run: node scripts/build-dataset.mjs")
        scheme = TagScheme.fit(d["train"])
        intents = sorted({e["intent"] for e in d["train"]} | {NONE_INTENT}); intent_id = {s: i for i, s in enumerate(intents)}
        vmap = ValueMap().fit(d["train"])
        files = [root / a.world / f"{s}.jsonl" for s in ("train", "dev", "test")]
    else:
        rows = read_jsonl(root / "routing.jsonl")
        sp = {s: [r for r in rows if r["split"] == s] for s in ("train", "dev", "test")}
        if a.limit:
            sp = {k: v[:a.limit] for k, v in sp.items()}
        routes = sorted({r["world"] for r in rows}); route_id = {w: i for i, w in enumerate(routes)}
        files = [root / "routing.jsonl"]

    if a.model.startswith("tiny"):
        from .tiny import build_tiny
        texts = [e["text"] for s in d.values() for e in s] if a.task == "sop" else [r["text"] for r in rows[:5000]]
        a.model = build_tiny(out / "tiny-backbone", texts)
    tok = AutoTokenizer.from_pretrained(a.model)
    pad_id = tok.pad_token_id or 0

    if a.task == "sop":
        model = build_model(a.model, n_tags=len(scheme.tags), n_intents=len(intents), lora=not a.no_lora, lora_r=a.lora_r)
        enc = {s: encode_sop(tok, d[s], scheme, intent_id, a.max_len, not a.no_context) for s in d}
    else:
        model = build_model(a.model, n_routes=len(routes), lora=not a.no_lora, lora_r=a.lora_r)
        enc = {s: encode_routing(tok, sp[s], route_id, a.max_len) for s in sp}
    model.to(dev)
    print("model", trainable_summary(model), "device", dev, "train", len(enc["train"]), "dev", len(enc["dev"]), "test", len(enc["test"]))

    heads = [p for n, p in model.named_parameters() if p.requires_grad and not n.startswith("backbone.")]
    body = [p for n, p in model.named_parameters() if p.requires_grad and n.startswith("backbone.")]
    opt = torch.optim.AdamW([{"params": body, "lr": a.lr}, {"params": heads, "lr": a.head_lr}], weight_decay=0.01)
    steps_per_epoch = max(1, (len(enc["train"]) + a.batch_size - 1) // a.batch_size)
    total = a.max_steps or steps_per_epoch * a.epochs
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * total), total)

    def evaluate(split):
        if a.task == "sop":
            return eval_sop(model, enc[split], scheme, intents, vmap, pad_id, dev)
        res = {"with_context": eval_routing(model, enc[split], routes, pad_id, dev)}
        res["without_context"] = eval_routing(model, encode_routing(tok, sp[split], route_id, a.max_len, use_context=False), routes, pad_id, dev)
        return res

    step, best, bad, history = 0, -1.0, 0, []
    amp = torch.autocast(device_type=dev.type, dtype=torch.bfloat16, enabled=a.bf16 and dev.type == "cuda")
    t0 = time.time(); done = False
    for epoch in range(a.epochs if not a.max_steps else 10**6):
        model.train(); losses = []
        for b in batches(enc["train"], a.batch_size, True, a.seed + epoch):
            with amp:
                loss = model(**collate(b, pad_id, dev))["loss"]
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad(); losses.append(loss.item()); step += 1
            if step % 10 == 0:
                print(f"step {step}/{total} loss {sum(losses[-10:]) / len(losses[-10:]):.4f}", flush=True)
            if a.max_steps and step >= a.max_steps:
                done = True; break
        m = evaluate("dev")
        score = m["exact_sop"] if a.task == "sop" else m["with_context"]["accuracy"]
        history.append({"epoch": epoch + 1, "step": step, "loss": sum(losses) / max(len(losses), 1), "dev": m})
        print(f"epoch {epoch + 1} dev {json.dumps({k: v for k, v in m.items() if k != 'by_source'})}", flush=True)
        if score > best:
            best, bad = score, 0; torch.save({k: v for k, v in model.state_dict().items()}, out / "best.pt")
        else:
            bad += 1
        if done or bad > a.patience:
            break
    if (out / "best.pt").exists():
        model.load_state_dict(torch.load(out / "best.pt", map_location=dev))
    final = {"dev": evaluate("dev"), "test": evaluate("test")}
    meta = {"task": a.task, "world": a.world, "args": vars(a), "command": "python -m psys2_train.train " + " ".join(argv if argv is not None else sys.argv[1:]),
            "data_hash": data_hash(files), "seed": a.seed, "versions": {"python": platform.python_version(), "torch": torch.__version__},
            "seconds": time.time() - t0, "steps": step, "model": trainable_summary(model)}
    try:
        import transformers, peft; meta["versions"].update(transformers=transformers.__version__, peft=peft.__version__)
    except Exception:
        pass
    labels = {"tags": scheme.tags, "intents": intents} if a.task == "sop" else {"routes": routes}
    (out / "labels.json").write_text(json.dumps(labels, indent=1)); (out / "metrics.json").write_text(json.dumps({"final": final, "history": history, "meta": meta}, indent=1))
    tok.save_pretrained(out / "tokenizer")
    print("FINAL", json.dumps({s: {k: v for k, v in m.items() if k != "by_source"} for s, m in final.items()}))
    print("run dir", out)
    return final


if __name__ == "__main__":
    main()
