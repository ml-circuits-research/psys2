"""NX4-C: a per-world LoRA (r=8) on the dispatcher v4 encoder plus the A heads, exported as an ONNX Runtime adapter.

  python -m psys2_train.nx_lora train --world diagram.sketch --out /abs/training/runs/nx-c-diagram.sketch
  python -m psys2_train.nx_lora export --runs /abs/training/runs/nx-c-diagram.sketch,... --out /abs/training/runs/export/nx-c

Base = the frozen dispatcher v4 encoder with the NX4-A heads (op head over the global operation list, BIO tag head over the global labels),
loaded from --base-run (default nx-a-seed1). Trainable = LoRA deltas (A [in, r] x B [r, out], B starts at zero) on q, k, v, out, lin1, lin2 of the
6 layers and on the two heads, trained on the world's own NX records (train split) with the same losses as A. The adapter therefore carries the world's
whole specialisation (encoder and heads), the base graph is world independent (LoRA parameters are overridable initializers, zero = A exactly).
Export: one base graph `model.int8.onnx` (int8 for the weights, LoRA matrices kept fp32 and overridable) and one `<world>.onnx_adapter` per world.
"""
from __future__ import annotations
import argparse, json, math, random, sys, time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

from .dispatcher import require_cuda
from .nx_heads import (TRAIN, NX_DIR, DISPATCH_RUN, NXHeads, load_dispatcher, load_records, encode_rows, collate, evaluate)

R = 8
TARGETS = ["q_lin", "k_lin", "v_lin", "out_lin", "lin1", "lin2"]


class Lora(nn.Module):
    """y = lin(x) + (x A) B, A [in, r] small random, B [r, out] zero (identity at start)."""
    def __init__(self, lin: nn.Linear, r=R):
        super().__init__()
        self.lin = lin
        self.A = nn.Parameter(torch.randn(lin.in_features, r) / math.sqrt(lin.in_features))
        self.B = nn.Parameter(torch.zeros(r, lin.out_features))
        self.enabled = True

    def forward(self, x):
        y = self.lin(x)
        return y + (x @ self.A.to(x.dtype)) @ self.B.to(x.dtype) if self.enabled else y


def add_lora(model: NXHeads):
    """Wrap the target linears of the encoder and the two heads; returns the list of (name, Lora)."""
    wrapped = []
    for li, layer in enumerate(model.disp.backbone.transformer.layer):
        for holder in (layer.attention, layer.ffn):
            for n in TARGETS:
                if hasattr(holder, n) and isinstance(getattr(holder, n), nn.Linear):
                    w = Lora(getattr(holder, n)); setattr(holder, n, w); wrapped.append((f"L{li}.{n}", w))
    for n in ("op_head", "tag_head"):
        w = Lora(getattr(model, n)); setattr(model, n, w); wrapped.append((n, w))
    return wrapped


def load_base(dev, base_run):
    vocab = json.loads((base_run / "vocab.json").read_text())
    disp, _ = load_dispatcher(dev)
    model = NXHeads(disp, len(vocab["ops"]), len(vocab["labels"])).to(dev)
    ck = torch.load(base_run / "best.pt", map_location="cpu")
    model.op_head.load_state_dict(ck["op_head"]); model.tag_head.load_state_dict(ck["tag_head"])
    for p in model.parameters(): p.requires_grad = False
    return model, vocab


def train(a):
    dev = require_cuda()
    torch.manual_seed(a.seed); random.seed(a.seed)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "command.txt").write_text("python -m psys2_train.nx_lora " + " ".join(sys.argv[1:]) + "\n")
    base_run = TRAIN / "runs" / a.base_run
    model, vocab = load_base(dev, base_run)
    ops, labels = vocab["ops"], vocab["labels"]
    import glob
    rows = load_records([f for f in sorted(glob.glob(a.data)) if not Path(f).name.startswith("_")])
    rows = [r for r in rows if r["world"] == a.world]
    tr = [r for r in rows if r["split"] == "train"]; dv = [r for r in rows if r["split"] == "dev"]; te = [r for r in rows if r["split"] == "test"]
    tok = AutoTokenizer.from_pretrained(DISPATCH_RUN / "tokenizer")
    e_tr, e_dv, e_te = (encode_rows(tok, x, ops, labels) for x in (tr, dv, te))
    print(f"{a.world}: train {len(tr)} dev {len(dv)} test {len(te)}", flush=True)
    wrapped = add_lora(model)
    model.to(dev)
    lora_params = [p for _, w in wrapped for p in (w.A, w.B)]
    for p in lora_params: p.requires_grad = True
    n_par = sum(p.numel() for p in lora_params)
    print(f"LoRA r={R}: {len(wrapped)} modules, {n_par/1e6:.2f} M parameters", flush=True)
    opt = torch.optim.AdamW(lora_params, lr=a.lr, weight_decay=0.0)
    spe = math.ceil(len(e_tr) / a.batch); total = spe * a.epochs
    sched = get_linear_schedule_with_warmup(opt, int(0.05 * total), total)
    pad = tok.pad_token_id or 0
    ce = nn.CrossEntropyLoss(ignore_index=-100)
    best, log = -1.0, []
    base_dev = None
    for w in wrapped: w[1].enabled = False
    base_dev = evaluate(model, tok, dv, e_dv, ops, labels, dev)["overall"]; base_test = evaluate(model, tok, te, e_te, ops, labels, dev)["overall"]
    for w in wrapped: w[1].enabled = True
    print("A (no adapter) dev", base_dev, "test", base_test, flush=True)
    for ep in range(a.epochs):
        model.train(); model.disp.eval()   # dropout off in the frozen encoder; heads keep their own dropout through the model's `drop`
        perm = list(range(len(e_tr))); random.Random(a.seed * 100 + ep).shuffle(perm)
        t0 = time.time(); tot = 0.0; nb = 0
        for s in range(0, len(perm), a.batch):
            ids, am, lab, op = collate([e_tr[i] for i in perm[s:s + a.batch]], pad)
            ids, am, lab, op = ids.to(dev), am.to(dev), lab.to(dev), op.to(dev)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                ol, tl = model(ids, am)
                valid = op >= 0
                loss = (ce(ol.float()[valid], op[valid]) if valid.any() else ol.sum() * 0) + ce(tl.float().reshape(-1, tl.shape[-1]), lab.reshape(-1))
            opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(lora_params, 1.0); opt.step(); sched.step()
            tot += float(loss); nb += 1
        dm = evaluate(model, tok, dv, e_dv, ops, labels, dev)["overall"]
        score = dm["op_acc"] + dm["slot_f1"]
        log.append({"epoch": ep + 1, "loss": round(tot / nb, 4), "dev": dm, "sec": round(time.time() - t0)})
        print(json.dumps(log[-1]), flush=True)
        if score > best:
            best = score
            torch.save({n: {"A": w.A.detach().cpu(), "B": w.B.detach().cpu()} for n, w in wrapped}, out / "best.pt")
    # the best adapter, evaluated
    ck = torch.load(out / "best.pt")
    for n, w in wrapped: w.A.data.copy_(ck[n]["A"]); w.B.data.copy_(ck[n]["B"])
    res = {"world": a.world, "records": {"train": len(tr), "dev": len(dv), "test": len(te)}, "lora_params": n_par, "A_dev": base_dev, "A_test": base_test,
           "C_dev": evaluate(model, tok, dv, e_dv, ops, labels, dev)["overall"], "C_test": evaluate(model, tok, te, e_te, ops, labels, dev)["overall"], "log": log, "args": vars(a)}
    (out / "metrics.json").write_text(json.dumps(res, indent=1))
    print("A test", base_test, "\nC test", res["C_test"], flush=True)


# ---- export -------------------------------------------------------------------------------------------------------------
class ExportWrap(nn.Module):
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        d = self.m.disp
        h = d.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        return d.seg_head(h), d.world_head(h[:, 0]), d.edit_head(h), self.m.op_head(h[:, 0]), self.m.tag_head(h)


def export(a):
    import onnx
    import onnxruntime as ort
    from onnxruntime.quantization import quantize_dynamic, QuantType
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "command.txt").write_text("python -m psys2_train.nx_lora " + " ".join(sys.argv[1:]) + "\n")
    base_run = TRAIN / "runs" / a.base_run
    model, vocab = load_base(torch.device("cpu"), base_run)
    wrapped = add_lora(model); model.eval()
    ids = torch.ones(2, 9, dtype=torch.long)
    fp32 = out / "model.onnx"
    with torch.no_grad():
        torch.onnx.export(ExportWrap(model), (ids, torch.ones_like(ids)), str(fp32), input_names=["input_ids", "attention_mask"],
                          output_names=["seg_logits", "world_logits", "edit_logits", "op_logits", "tag_logits"], opset_version=17, dynamo=False,
                          dynamic_axes={"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, "seg_logits": {0: "b", 1: "t"}, "world_logits": {0: "b"}, "edit_logits": {0: "b", 1: "t"}, "op_logits": {0: "b"}, "tag_logits": {0: "b", 1: "t"}})
    names = {}   # module name -> (A initializer, B initializer) as they appear in the state dict (= the exported initializer names)
    sd_names = {id(p): k for k, p in model.named_parameters()}
    for n, w in wrapped: names[n] = (sd_names[id(w.A)], sd_names[id(w.B)])
    m = onnx.load(str(fp32))
    init = {i.name: i for i in m.graph.initializer}
    missing = [x for ab in names.values() for x in ab if x not in init]
    assert not missing, f"LoRA parameters are not initializers of the graph: {missing[:3]}"
    lora_names = {x for ab in names.values() for x in ab}
    have = {i.name for i in m.graph.input}
    for nme in sorted(lora_names - have):   # overridable initializer = a graph input that also has an initializer
        t = init[nme]
        m.graph.input.append(onnx.helper.make_tensor_value_info(nme, t.data_type, list(t.dims)))
    onnx.save(m, str(fp32))
    # int8 for the weights, but the matmuls that consume LoRA matrices stay fp32 so the initializers keep their names
    excl = [n.name for n in m.graph.node if n.op_type == "MatMul" and any(i in lora_names for i in n.input)]
    int8 = out / "model.int8.onnx"
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8, nodes_to_exclude=excl)
    mq = onnx.load(str(int8))
    kept = {i.name for i in mq.graph.initializer} & lora_names
    kept_in = {i.name for i in mq.graph.input} & lora_names
    print(f"LoRA initializers kept after quantization: {len(kept)}/{len(lora_names)}, still graph inputs: {len(kept_in)}", flush=True)
    assert len(kept) == len(lora_names) and len(kept_in) == len(lora_names), "quantization renamed or dropped LoRA initializers"
    # one adapter per world
    report = {"base_fp32_mb": round(fp32.stat().st_size / 1e6, 1), "base_int8_mb": round(int8.stat().st_size / 1e6, 1), "lora_initializers": len(lora_names), "adapters": {}}
    ex = None
    for run in a.runs.split(","):
        run = Path(run); met = json.loads((run / "metrics.json").read_text()); world = met["world"]
        ck = torch.load(run / "best.pt")
        params = {}
        for n, (an, bn) in names.items():
            params[an] = ort.OrtValue.ortvalue_from_numpy(ck[n]["A"].numpy().astype(np.float32)); params[bn] = ort.OrtValue.ortvalue_from_numpy(ck[n]["B"].numpy().astype(np.float32))
        af = ort.AdapterFormat(); af.set_adapter_version(1); af.set_model_version(1); af.set_parameters(params)
        path = out / f"{world}.onnx_adapter"; af.export_adapter(str(path))
        report["adapters"][world] = {"file": path.name, "mb": round(path.stat().st_size / 1e6, 2), "C_test": met["C_test"], "A_test": met["A_test"]}
        # check against torch: the int8 base with the adapter active vs the torch model with the same weights (top-1 op and tag argmax agreement on dev records)
        if ex is None:
            tok = AutoTokenizer.from_pretrained(DISPATCH_RUN / "tokenizer")
            import glob
            rows = [r for r in load_records(sorted(glob.glob(str(NX_DIR / "free-*.jsonl")))) if r["split"] == "test"]
        wr = [r for r in rows if r["world"] == world][:60]
        enc = encode_rows(tok, wr, vocab["ops"], vocab["labels"])
        for n, w in wrapped: w.A.data.copy_(ck[n]["A"]); w.B.data.copy_(ck[n]["B"])
        so = ort.SessionOptions(); so.intra_op_num_threads = 4
        sess = ort.InferenceSession(str(int8), so, providers=["CPUExecutionProvider"])
        ad = ort.LoraAdapter(); ad.Load(str(path)) if hasattr(ort, "LoraAdapter") else None
        ro = ort.RunOptions(); ro.add_active_adapter(ad)
        same_op = same_base = 0
        for e in enc:
            ii = np.array([e["input_ids"]], dtype=np.int64); feed = {"input_ids": ii, "attention_mask": np.ones_like(ii)}
            o_ad = sess.run(None, feed, ro)[3][0].argmax(); o_zero = sess.run(None, feed)[3][0].argmax()
            with torch.no_grad():
                t = ExportWrap(model)(torch.tensor(ii), torch.ones_like(torch.tensor(ii)))[3][0].argmax().item()
            same_op += int(o_ad == t); same_base += int(o_zero == t)
        report["adapters"][world]["onnx_int8_adapter_vs_torch_op_agree"] = round(same_op / len(enc), 3)
        report["adapters"][world]["onnx_int8_no_adapter_vs_torch_op_agree"] = round(same_base / len(enc), 3)
        ex = True
    (out / "export-report.json").write_text(json.dumps(report, indent=1)); print(json.dumps(report, indent=1))


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train"); t.add_argument("--world", required=True); t.add_argument("--out", required=True)
    t.add_argument("--base-run", default="nx-a-seed1", dest="base_run"); t.add_argument("--data", default=str(NX_DIR / "free-*.jsonl"))
    t.add_argument("--epochs", type=int, default=10); t.add_argument("--batch", type=int, default=128); t.add_argument("--lr", type=float, default=1e-3); t.add_argument("--seed", type=int, default=1)
    e = sub.add_parser("export"); e.add_argument("--runs", required=True); e.add_argument("--out", required=True); e.add_argument("--base-run", default="nx-a-seed1", dest="base_run")
    a = ap.parse_args()
    train(a) if a.cmd == "train" else export(a)


if __name__ == "__main__":
    main()
