"""ONNX export of the T5 / FLAN-T5 normalizer for the browser (N1 step 5), int8, encoder + decoder with past key values.

  python -m psys2_train.export_normalizer --ckpt /home/salboaie/work/psys2/training/runs/n1/flan-t5-small --out /home/salboaie/work/psys2/training/runs/n1/export-flan [--n 200]

Two graphs (opset 17, dynamic batch / length axes), written by hand-made wrappers around the HF weights so that the decode loop is explicit and portable (a JS decoder needs
exactly these inputs; there is no optimum dependency):
  encoder.onnx   input_ids, attention_mask -> cross_k.<l>, cross_v.<l> for every decoder layer ([b, heads, src, d_kv]); the encoder hidden states are not needed again
  decoder.onnx   input_id [b,1], step (int64 scalar: number of tokens already decoded), attention_mask [b,src], self_k.<l>, self_v.<l> (past, [b,heads,step,d_kv]),
                 cross_k.<l>, cross_v.<l> -> logits [b, vocab], new_self_k.<l>, new_self_v.<l> ([b,heads,step+1,d_kv])
The first step passes empty past tensors (step = 0). The relative position bias of the decoder self-attention is a constant table (heads x 128 distances) inside the graph.
Then onnxruntime dynamic quantization (QInt8 weights) of both graphs, agreement of the greedy output with PyTorch on --n real requests (training/runs/n1/requests.jsonl), and CPU latency
per piece (batch 1, onnxruntime CPU, 1 and 4 threads) of the whole greedy decode.  `export.json` in the output directory holds sizes, agreement and latencies; tokenizer files are copied.
"""
from __future__ import annotations
import argparse, json, shutil, statistics, time
from pathlib import Path
import numpy as np
import torch, torch.nn as nn
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from .data import read_jsonl
from .normalizer import make_input

MAXD = 128


def rel_bucket(rel, num_buckets=32, max_distance=128):
    """T5 unidirectional bucket of (key - query) <= 0 (numpy)."""
    n = -np.minimum(rel, 0)
    max_exact = num_buckets // 2
    large = max_exact + (np.log(np.maximum(n, 1) / max_exact) / np.log(max_distance / max_exact) * (num_buckets - max_exact)).astype(np.int64)
    large = np.minimum(large, num_buckets - 1)
    return np.where(n < max_exact, n, large)


class Encoder(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.enc = model.encoder; self.layers = model.decoder.block; self.h = model.config.num_heads; self.d = model.config.d_kv
    def forward(self, input_ids, attention_mask):
        hid = self.enc(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        b, s, _ = hid.shape
        outs = []
        for blk in self.layers:
            att = blk.layer[1].EncDecAttention
            outs.append(att.k(hid).view(b, s, self.h, self.d).transpose(1, 2))
            outs.append(att.v(hid).view(b, s, self.h, self.d).transpose(1, 2))
        return tuple(outs)


class Decoder(nn.Module):
    def __init__(self, model):
        super().__init__()
        c = model.config; dec = model.decoder
        self.dec = dec; self.lm_head = model.lm_head; self.shared = model.shared
        self.h, self.d, self.nl, self.eps = c.num_heads, c.d_kv, c.num_decoder_layers, c.layer_norm_epsilon
        self.tied = bool(getattr(c, "scale_decoder_outputs", c.tie_word_embeddings)); self.dm = c.d_model   # transformers 5: the logits are scaled by d_model**-0.5 iff config.scale_decoder_outputs
        self.gated = 'gated' in c.feed_forward_proj
        w = dec.block[0].layer[0].SelfAttention.relative_attention_bias.weight.detach().cpu()   # [buckets, heads]
        dist = np.arange(MAXD)                                  # distance query - key >= 0
        bucket = rel_bucket(-dist, c.relative_attention_num_buckets, c.relative_attention_max_distance)
        self.register_buffer("table", w[torch.tensor(bucket)].t().contiguous())   # [heads, MAXD]
    def norm(self, ln, x):
        v = x.pow(2).mean(-1, keepdim=True)
        return ln.weight * (x * torch.rsqrt(v + self.eps))
    def ffn(self, ff, x):
        if self.gated:
            return ff.wo(torch.nn.functional.gelu(ff.wi_0(x), approximate="tanh") * ff.wi_1(x))
        return ff.wo(torch.relu(ff.wi(x)))
    def forward(self, input_id, step, attention_mask, *past):
        b = input_id.shape[0]
        x = self.shared(input_id)                                # [b,1,dm]
        sk, sv, ck, cv = past[0:2 * self.nl:2], past[1:2 * self.nl:2], past[2 * self.nl::2], past[2 * self.nl + 1::2]
        keys = torch.arange(step + 1)
        dist = torch.clamp(step - keys, 0, MAXD - 1)
        bias = self.table[:, dist].unsqueeze(0).unsqueeze(2)     # [1,h,1,step+1]
        enc_mask = (1.0 - attention_mask.to(x.dtype))[:, None, None, :] * -1e9   # [b,1,1,src]
        new = []
        for i, blk in enumerate(self.dec.block):
            a = blk.layer[0]; at = a.SelfAttention
            y = self.norm(a.layer_norm, x)
            q = at.q(y).view(b, 1, self.h, self.d).transpose(1, 2)
            k = torch.cat([sk[i], at.k(y).view(b, 1, self.h, self.d).transpose(1, 2)], 2)
            v = torch.cat([sv[i], at.v(y).view(b, 1, self.h, self.d).transpose(1, 2)], 2)
            new += [k, v]
            p = torch.softmax(q @ k.transpose(2, 3) + bias, -1)
            x = x + at.o((p @ v).transpose(1, 2).reshape(b, 1, self.h * self.d))
            cx = blk.layer[1]; ca = cx.EncDecAttention
            y = self.norm(cx.layer_norm, x)
            q = ca.q(y).view(b, 1, self.h, self.d).transpose(1, 2)
            p = torch.softmax(q @ ck[i].transpose(2, 3) + enc_mask, -1)
            x = x + ca.o((p @ cv[i]).transpose(1, 2).reshape(b, 1, self.h * self.d))
            f = blk.layer[-1]
            x = x + self.ffn(f.DenseReluDense, self.norm(f.layer_norm, x))
        x = self.norm(self.dec.final_layer_norm, x)
        if self.tied:
            x = x * (self.dm ** -0.5)
        return (self.lm_head(x)[:, 0, :], *new)


def export(model, tok, out, dev):
    c = model.config; nl = c.num_decoder_layers
    enc, dec = Encoder(model).eval(), Decoder(model).eval()
    ids = tok(["kids.arith | arith | what is 20 divided by 4", "ui.shell | - | go"], return_tensors="pt", padding=True)
    cross_names = [f"cross_{kv}.{i}" for i in range(nl) for kv in "kv"]
    torch.onnx.export(enc, (ids["input_ids"], ids["attention_mask"]), str(out / "encoder.onnx"), opset_version=17, dynamo=False,
                      input_names=["input_ids", "attention_mask"], output_names=cross_names,
                      dynamic_axes={"input_ids": {0: "b", 1: "s"}, "attention_mask": {0: "b", 1: "s"}, **{n: {0: "b", 2: "s"} for n in cross_names}})
    with torch.no_grad():
        cross = enc(ids["input_ids"], ids["attention_mask"])
    b, h, d = ids["input_ids"].shape[0], c.num_heads, c.d_kv
    past = [torch.zeros(b, h, 2, d) for _ in range(2 * nl)]
    self_names = [f"self_{kv}.{i}" for i in range(nl) for kv in "kv"]
    new_names = [f"new_self_{kv}.{i}" for i in range(nl) for kv in "kv"]
    args = (torch.zeros(b, 1, dtype=torch.long), torch.tensor(2), ids["attention_mask"], *past, *cross)
    torch.onnx.export(dec, args, str(out / "decoder.onnx"), opset_version=17, dynamo=False,
                      input_names=["input_id", "step", "attention_mask", *self_names, *cross_names], output_names=["logits", *new_names],
                      dynamic_axes={"input_id": {0: "b"}, "attention_mask": {0: "b", 1: "s"}, **{n: {0: "b", 2: "t"} for n in self_names}, **{n: {0: "b", 2: "s"} for n in cross_names}, **{n: {0: "b", 2: "t1"} for n in new_names}, "logits": {0: "b"}})


def quantize(src, dst):
    from onnxruntime.quantization import quantize_dynamic, QuantType
    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8, per_channel=True)


class OrtGreedy:
    """Greedy decode with the two onnxruntime graphs (the loop a JS host runs)."""
    def __init__(self, enc_path, dec_path, tok, nl, h, d, threads=1):
        import onnxruntime as ort
        so = ort.SessionOptions(); so.intra_op_num_threads = threads; so.inter_op_num_threads = 1
        self.enc = ort.InferenceSession(str(enc_path), so, providers=["CPUExecutionProvider"]); self.dec = ort.InferenceSession(str(dec_path), so, providers=["CPUExecutionProvider"])
        self.tok, self.nl, self.h, self.d = tok, nl, h, d
        self.cross_names = [f"cross_{kv}.{i}" for i in range(nl) for kv in "kv"]
    def run(self, text, max_new=48):
        e = self.tok([text], return_tensors="np", truncation=True, max_length=160)
        ids, mask = e["input_ids"].astype(np.int64), e["attention_mask"].astype(np.int64)
        cross = dict(zip(self.cross_names, self.enc.run(None, {"input_ids": ids, "attention_mask": mask})))
        past = {f"self_{kv}.{i}": np.zeros((1, self.h, 0, self.d), np.float32) for i in range(self.nl) for kv in "kv"}
        cur = np.array([[self.tok.pad_token_id]], np.int64); out = []
        for step in range(max_new):
            r = self.dec.run(None, {"input_id": cur, "step": np.array(step, np.int64), "attention_mask": mask, **past, **cross})
            nxt = int(np.argmax(r[0][0]))
            if nxt == self.tok.eos_token_id:
                break
            out.append(nxt); cur = np.array([[nxt]], np.int64)
            past = {f"self_{kv}.{i}": r[1 + 2 * i + (kv == 'v')] for i in range(self.nl) for kv in "kv"}
        return self.tok.decode(out, skip_special_tokens=True).strip()


def write_meta(out, ckpt, metrics=None, policy=None):
    """meta.json for the webchat (docs/webchat/models/normalizer): config, sizes and the sha256 of every file (the host checks and caches by them)."""
    import hashlib, datetime
    out = Path(out)
    cfg = json.load(open(out / "config.json"))
    files = ["encoder.int8.onnx", "decoder.int8.onnx", "tokenizer.json", "config.json"]
    sha = {n: hashlib.sha256((out / n).read_bytes()).hexdigest() for n in files}
    ver = hashlib.sha256("".join(sha[n] for n in files).encode()).hexdigest()
    base = json.load(open(Path(ckpt) / "meta.json")).get("model", "flan-t5-small")
    meta = {"model": base, "kind": "seq2seq-normalizer", "input_format": "<world> | <tab or -> | <piece>",
            "config": {"layers": cfg["num_decoder_layers"], "heads": cfg["num_heads"], "dKv": cfg["d_kv"]}, "files": files, "sizes_MB": {n: round((out / n).stat().st_size / 1e6, 1) for n in files},
            "policy": policy or {}, "version": {"checkpoint": str(ckpt), "export_date": datetime.date.today().isoformat(), "sha256": ver, "files_sha256": sha, "metrics": metrics or {}}}
    json.dump(meta, open(out / "meta.json", "w"), indent=1)
    return meta


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--out", required=True); ap.add_argument("--n", type=int, default=200); ap.add_argument("--requests", default="/home/salboaie/work/psys2/training/runs/n1/requests.jsonl")
    a = ap.parse_args(argv)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(a.ckpt)
    model = AutoModelForSeq2SeqLM.from_pretrained(a.ckpt, attn_implementation="eager").float().eval()
    export(model, tok, out, "cpu")
    for n in ("encoder", "decoder"):
        quantize(out / f"{n}.onnx", out / f"{n}.int8.onnx")
    tok.save_pretrained(out / "tokenizer"); model.config.save_pretrained(out); shutil.copy(out / "tokenizer" / "tokenizer.json", out / "tokenizer.json")
    c = model.config; nl, h, d = c.num_decoder_layers, c.num_heads, c.d_kv
    reqs = read_jsonl(a.requests)[:: max(1, len(read_jsonl(a.requests)) // a.n)][: a.n]
    inputs = [make_input(r["world"], r.get("tab"), r["text"]) for r in reqs]
    # reference: PyTorch greedy (CPU, fp32)
    ref = []
    for s in inputs:
        e = tok([s], return_tensors="pt")
        with torch.no_grad():
            ref.append(tok.decode(model.generate(**e, num_beams=1, do_sample=False, max_new_tokens=48)[0], skip_special_tokens=True).strip())
    res = {"ckpt": a.ckpt, "params_M": round(sum(p.numel() for p in model.parameters()) / 1e6, 1), "sizes_MB": {}, "agreement_with_pytorch_greedy": {}, "latency_ms_per_piece": {}}
    for n in ("encoder", "decoder"):
        res["sizes_MB"][n + "_fp32"] = round((out / f"{n}.onnx").stat().st_size / 1e6, 1)
        res["sizes_MB"][n + "_int8"] = round((out / f"{n}.int8.onnx").stat().st_size / 1e6, 1)
    res["sizes_MB"]["total_int8"] = round(res["sizes_MB"]["encoder_int8"] + res["sizes_MB"]["decoder_int8"], 1)
    for tag, (ep, dp) in {"fp32": ("encoder.onnx", "decoder.onnx"), "int8": ("encoder.int8.onnx", "decoder.int8.onnx")}.items():
        g = OrtGreedy(out / ep, out / dp, tok, nl, h, d, 1)
        got = [g.run(s) for s in inputs]
        res["agreement_with_pytorch_greedy"][tag] = round(sum(x == y for x, y in zip(got, ref)) / len(ref), 4)
        for th in (1, 4):
            g = OrtGreedy(out / ep, out / dp, tok, nl, h, d, th)
            for s in inputs[:5]:
                g.run(s)
            ts = []
            for s in inputs[:100]:
                t0 = time.perf_counter(); g.run(s); ts.append((time.perf_counter() - t0) * 1000)
            res["latency_ms_per_piece"][f"{tag}_{th}thread"] = {"median": round(statistics.median(ts), 1), "p90": round(sorted(ts)[int(len(ts) * 0.9)], 1)}
        print(tag, res["agreement_with_pytorch_greedy"][tag], res["latency_ms_per_piece"], flush=True)
    json.dump(res, open(out / "export.json", "w"), indent=1)
    write_meta(out, a.ckpt)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
