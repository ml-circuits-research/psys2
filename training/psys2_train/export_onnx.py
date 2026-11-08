"""Dispatcher export to ONNX + int8 + agreement/latency report (D4).

  python -m psys2_train.export_onnx --ckpt training/runs/dispatcher-distilbert [--out training/runs/export/dispatcher-distilbert]
                                    [--n 200] [--seed 7] [--results training/results/export-dispatcher-<name>.json]

Steps (each run redoes all of them, so a re-trained checkpoint just needs the same command):
  1. export the shared encoder + both heads (segmentation per-token logits, world logits) to <out>/model.onnx
     (opset 17, dynamic batch/sequence axes; inputs input_ids, attention_mask; outputs seg_logits [b,t,2], world_logits [b,W] and, for a
     checkpoint with the simplification head (D1b), edit_logits [b,t,K]; the edit tag vocabulary goes to <out>/edit-vocab.json + meta.json);
  2. onnxruntime dynamic quantization (QInt8 weights) -> <out>/model.int8.onnx;
  3. labels.json, tokenizer/vocab.txt + tokenizer_config.json (what the browser WordPiece tokenizer needs), meta.json;
  4. agreement on --n test items (fixed seed) between PyTorch (CUDA, fp32), ONNX fp32 and ONNX int8: same top-1 world
     (routing input `tab: .. ; recent: .. ;; text`) and same boundary decision (p(B) > 0.5 per word-start token of the raw message), and
     for the edit head the same `simplified` text on the paraphrase dev/test/held-out variants;
  5. CPU latency, batch 1, onnxruntime CPU, fixed threads (1 and 4): one encoder pass and the whole dispatch of a message
     (segmentation pass + one world pass per distinct candidate segment, exactly the dispatch() decode of dispatcher.py);
  6. results JSON (small; the models themselves are never committed: training/runs/ is gitignored).
The model files are not committed. The webchat copies model.int8.onnx + vocab from this directory (scripts/build-webchat.mjs).
"""
from __future__ import annotations
import argparse, json, random, statistics, time
from pathlib import Path
import numpy as np
import torch
from transformers import AutoTokenizer

from .data import routing_text
from . import edit as ed
from .dispatcher import build, candidate_segmentations, token_info, require_cuda
from .dispatch_predict import collect_inputs

ROOT = Path(__file__).resolve().parents[1]


class Wrap(torch.nn.Module):
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        h = self.m.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        if hasattr(self.m, "edit_head"):
            return self.m.seg_head(h), self.m.world_head(h[:, 0]), self.m.edit_head(h)
        return self.m.seg_head(h), self.m.world_head(h[:, 0])


def load_torch(ckpt, dev):
    meta = json.loads((Path(ckpt) / "meta.json").read_text())
    m = build(meta["model"], len(meta["worlds"]), meta["lora"], meta.get("lora_r", 16), len(meta.get("edit_tags") or []))
    m.load_state_dict(torch.load(Path(ckpt) / "best.pt", map_location="cpu"))
    if meta["lora"]:
        m.backbone = m.backbone.merge_and_unload()
    return m.to(dev).eval(), meta


def export_fp32(model, path, opset=17):
    model = model.cpu().eval()
    ids = torch.ones(2, 9, dtype=torch.long)
    has_edit = hasattr(model, "edit_head")
    axes = {"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, "seg_logits": {0: "b", 1: "t"}, "world_logits": {0: "b"}}
    if has_edit:
        axes["edit_logits"] = {0: "b", 1: "t"}
    with torch.no_grad():
        torch.onnx.export(Wrap(model), (ids, torch.ones_like(ids)), str(path), input_names=["input_ids", "attention_mask"],
                          output_names=["seg_logits", "world_logits"] + (["edit_logits"] if has_edit else []), opset_version=opset, dynamo=False, dynamic_axes=axes)


def quantize(src, dst):
    from onnxruntime.quantization import quantize_dynamic, QuantType
    # per-channel weights: default per-tensor int8 loses ~2.5 points of top-1 agreement with fp32, per-channel ~1 (see worker-log D4)
    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8, per_channel=True)


def write_support_files(ckpt, out, meta):
    ckpt, out = Path(ckpt), Path(out)
    (out / "tokenizer").mkdir(parents=True, exist_ok=True)
    tj = json.loads((ckpt / "tokenizer" / "tokenizer.json").read_text())
    vocab = sorted(tj["model"]["vocab"].items(), key=lambda kv: kv[1])
    assert [i for _, i in vocab] == list(range(len(vocab)))
    (out / "tokenizer" / "vocab.txt").write_text("\n".join(t for t, _ in vocab) + "\n")
    cfg = json.loads((ckpt / "tokenizer" / "tokenizer_config.json").read_text())
    (out / "tokenizer" / "tokenizer_config.json").write_text(json.dumps({k: cfg[k] for k in ("do_lower_case", "strip_accents", "tokenize_chinese_chars", "unk_token", "cls_token", "sep_token", "pad_token", "model_max_length") if k in cfg}, indent=1))
    (out / "labels.json").write_text((ckpt / "labels.json").read_text())
    outs = ["seg_logits", "world_logits"] + (["edit_logits"] if meta.get("edit_tags") else [])
    (out / "meta.json").write_text(json.dumps({**meta, "onnx": {"inputs": ["input_ids", "attention_mask"], "outputs": outs, "world_max_len": meta["max_len"], "seg_max_len": 192}}, indent=1))
    if meta.get("edit_tags"):
        (out / "edit-vocab.json").write_text(json.dumps({"tags": meta["edit_tags"], "word_regex": ed.WORD_RE.pattern, "note": "per-word tags of the edit head, index = edit_logits channel; see src/formalizer/edit-tags.mjs"}, indent=1))


class OrtModel:
    def __init__(self, path, threads):
        import onnxruntime as ort
        so = ort.SessionOptions(); so.intra_op_num_threads = threads; so.inter_op_num_threads = 1
        so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        self.s = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])

    def run(self, ids_list):
        n = max(len(i) for i in ids_list)
        ids = np.zeros((len(ids_list), n), dtype=np.int64); am = np.zeros_like(ids)
        for k, i in enumerate(ids_list):
            ids[k, :len(i)] = i; am[k, :len(i)] = 1
        res = self.s.run(None, {"input_ids": ids, "attention_mask": am})
        return res[0], res[1]

    def run_full(self, ids_list):
        n = max(len(i) for i in ids_list)
        ids = np.zeros((len(ids_list), n), dtype=np.int64); am = np.zeros_like(ids)
        for k, i in enumerate(ids_list):
            ids[k, :len(i)] = i; am[k, :len(i)] = 1
        res = self.s.run(None, {"input_ids": ids, "attention_mask": am})
        return res[0], res[1], (res[2] if len(res) > 2 else None)


def softmax(x):
    e = np.exp(x - x.max(-1, keepdims=True)); return e / e.sum(-1, keepdims=True)


class Backend:
    """Uniform: seg_probs(text) -> (offsets, P(B) per token); world_probs(text, ctx) -> probs over worlds. Batch 1."""
    def __init__(self, tok, kind, impl):
        self.tok, self.kind, self.impl = tok, kind, impl

    def seg(self, text):
        enc = self.tok(text, truncation=True, max_length=192, return_offsets_mapping=True)
        if self.kind == "torch":
            with torch.no_grad():
                ids = torch.tensor([enc["input_ids"]], device=self.impl.dev)
                lg = self.impl.model.seg_logits(ids, torch.ones_like(ids))
            p = torch.softmax(lg.float(), -1)[0, :, 1].cpu().numpy()
        else:
            lg, _ = self.impl.run([enc["input_ids"]]); p = softmax(lg[0])[:, 1]
        return enc["offset_mapping"], p

    def world(self, text, ctx):
        enc = self.tok(routing_text({"text": text, "context": ctx}, True), truncation=True, max_length=128)
        if self.kind == "torch":
            with torch.no_grad():
                ids = torch.tensor([enc["input_ids"]], device=self.impl.dev)
                lg = self.impl.model.world_logits(ids, torch.ones_like(ids))
            return torch.softmax(lg.float(), -1)[0].cpu().numpy()
        _, lg = self.impl.run([enc["input_ids"]]); return softmax(lg[0])


def simplify_with(be, text, ctx, edit_tags, tau=0.5):
    """(world probs, simplified|None, tags) of one segment from a backend: the world pass and the edit head in one encoder pass."""
    full = routing_text({"text": text, "context": ctx}, True)
    enc = be.tok(full, truncation=True, max_length=128, return_offsets_mapping=True)
    if be.kind == "torch":
        with torch.no_grad():
            ids = torch.tensor([enc["input_ids"]], device=be.impl.dev)
            wl, el = be.impl.model.world_edit_logits(ids, torch.ones_like(ids))
        probs = torch.softmax(wl.float(), -1)[0].cpu().numpy(); ep = torch.softmax(el.float()[0], -1).cpu().numpy()
    else:
        _, wl, el = be.impl.run_full([enc["input_ids"]]); probs = softmax(wl[0]); ep = softmax(el[0])
    et = [(int(row[1:].argmax()) + 1) if row[1:].max() >= tau else 0 for row in ep]
    words = ed.words_of(text)
    tags = ["KEEP" if t is None else edit_tags[et[t]] for t in ed.word_tokens(enc["offset_mapping"], len(full) - len(text), words)]
    return probs, ed.simplified_text(text, words, tags), tags


class TorchImpl:
    def __init__(self, model, dev):
        self.model, self.dev = model, dev


def dispatch_once(be, text, ctx, worlds):
    """dispatch() of dispatcher.py with batch 1 on a backend: segmentation pass, candidates, one world pass per distinct segment."""
    offs, probs = be.seg(text)
    cands = candidate_segmentations(text, offs, list(probs), 4, 6)
    seen = {}
    for _, segs in cands:
        for a, b in segs:
            if text[a:b] not in seen:
                p = be.world(text[a:b], ctx); top = np.argsort(-p)[:3]
                seen[text[a:b]] = [(worlds[i], float(p[i])) for i in top]
    return cands, seen


def dispatch_once_edit(be, text, ctx, worlds, edit_tags):
    """dispatch_once + the edit head: returns candidates, {segment text: top-3 worlds}, {segment text: simplified|None}."""
    offs, probs = be.seg(text)
    cands = candidate_segmentations(text, offs, list(probs), 4, 6)
    seen, simp = {}, {}
    for _, segs in cands:
        for a, b in segs:
            if text[a:b] not in seen:
                p, sm, _ = simplify_with(be, text[a:b], ctx, edit_tags); top = np.argsort(-p)[:3]
                seen[text[a:b]] = [(worlds[i], float(p[i])) for i in top]; simp[text[a:b]] = sm
    return cands, seen, simp


def pct(xs, q):
    xs = sorted(xs); return xs[min(len(xs) - 1, int(round(q * (len(xs) - 1))))]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--out", default=None); ap.add_argument("--results", default=None)
    ap.add_argument("--n", type=int, default=200); ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--latency-n", type=int, default=100); ap.add_argument("--opset", type=int, default=17)
    a = ap.parse_args(argv)
    ckpt = Path(a.ckpt); name = ckpt.name.removeprefix("dispatcher-")
    out = Path(a.out or ROOT / "runs" / "export" / f"dispatcher-{name}"); out.mkdir(parents=True, exist_ok=True)
    dev = require_cuda()
    model, meta = load_torch(ckpt, dev)
    worlds = meta["worlds"]
    tok = AutoTokenizer.from_pretrained(ckpt / "tokenizer")
    fp32, int8 = out / "model.onnx", out / "model.int8.onnx"
    t0 = time.time(); export_fp32(model, fp32, a.opset)
    model, _ = load_torch(ckpt, dev)  # the tracing export leaves the in-process model altered: reload a clean reference
    quantize(fp32, int8)
    write_support_files(ckpt, out, meta)
    print(f"exported in {time.time() - t0:.0f}s: fp32 {fp32.stat().st_size / 2**20:.1f} MB, int8 {int8.stat().st_size / 2**20:.1f} MB", flush=True)

    # ---- agreement ---------------------------------------------------------------------------------------------------
    items = collect_inputs("test")
    rng = random.Random(a.seed); sample = rng.sample(items, min(a.n, len(items)))
    be_t = Backend(tok, "torch", TorchImpl(model, dev))
    be_f = Backend(tok, "onnx", OrtModel(fp32, 4)); be_q = Backend(tok, "onnx", OrtModel(int8, 4))
    agree = {k: {"items": 0, "world_same": 0, "world_n": 0, "boundary_same": 0, "boundary_n": 0, "msgs_all_boundaries_same": 0, "max_abs_prob_diff_world": 0.0, "max_abs_prob_diff_seg": 0.0, "top3_same": 0} for k in ("onnx_fp32", "onnx_int8", "int8_vs_fp32")}
    disagreements = []
    gold_hits = {"torch": 0, "fp32": 0, "int8": 0}; gold_n = 0
    for it in sample:
        text, ctx = it["text"], {"tab": it["context"].get("tab"), "recent_worlds": it["context"].get("recent_worlds", [])}
        # segmentation: raw message; world: every gold segment of the message (a record has one), with the message context
        seg_texts = [s["text"] for s in it["gold"]["segments"]]
        res = {}
        for k, be in (("torch", be_t), ("fp32", be_f), ("int8", be_q)):
            offs, ps = be.seg(text); res[k] = (offs, ps, [be.world(t, ctx) for t in seg_texts])
        for j, t in enumerate(seg_texts):
            gold_n += 1
            for k in gold_hits: gold_hits[k] += int(worlds[res[k][2][j].argmax()] in [it["gold"]["segments"][j]["world"], *it["gold"]["segments"][j].get("alt_worlds", [])])
        info = [i for i, s, b, ws in token_info(text, res["torch"][0]) if ws]
        for key, x, y in (("onnx_fp32", "torch", "fp32"), ("onnx_int8", "torch", "int8"), ("int8_vs_fp32", "fp32", "int8")):
            g = agree[key]; g["items"] += 1
            for wx, wy, t in zip(res[x][2], res[y][2], seg_texts):
                g["world_n"] += 1; g["world_same"] += int(wx.argmax() == wy.argmax()); g["top3_same"] += int(list(np.argsort(-wx)[:3]) == list(np.argsort(-wy)[:3]))
                g["max_abs_prob_diff_world"] = max(g["max_abs_prob_diff_world"], float(np.abs(wx - wy).max()))
                if wx.argmax() != wy.argmax():
                    disagreements.append({"cmp": key, "text": t, "world_a": worlds[wx.argmax()], "world_b": worlds[wy.argmax()], "p_a": float(wx.max()), "p_b": float(wy.max())})
            same = [bool((res[x][1][i] > 0.5) == (res[y][1][i] > 0.5)) for i in info]
            g["boundary_n"] += len(same); g["boundary_same"] += sum(same); g["msgs_all_boundaries_same"] += int(all(same))
            g["max_abs_prob_diff_seg"] = max(g["max_abs_prob_diff_seg"], float(np.abs(res[x][1] - res[y][1]).max()))
            if not all(same):
                disagreements.append({"cmp": key, "text": text, "boundary_flips": len(same) - sum(same)})
    for g in agree.values():
        g["world_agreement"] = g["world_same"] / g["world_n"]; g["boundary_agreement"] = g["boundary_same"] / g["boundary_n"]
        g["message_boundary_agreement"] = g["msgs_all_boundaries_same"] / g["items"]
    print(json.dumps(agree, indent=1), flush=True)

    # ---- edit head agreement (paraphrase variants of dev/test/held-out, fixed seed) -----------------------------------------
    edit_agree = None
    if meta.get("edit_tags"):
        from .data import read_jsonl
        er = [r for sp in ("dev", "test", "heldout") for r in read_jsonl(ed.EDIT_DIR / f"eval-{sp}.jsonl")]
        er = random.Random(a.seed).sample(er, min(a.n, len(er)))
        cmp = {"onnx_fp32": ("torch", "fp32"), "onnx_int8": ("torch", "int8"), "int8_vs_fp32": ("fp32", "int8")}
        bes = {"torch": be_t, "fp32": be_f, "int8": be_q}
        stat = {k: {"n": 0, "simplified_same": 0, "tags_same": 0, "words": 0, "word_tags_same": 0, "top1_world_same": 0} for k in cmp}
        outs = {k: [] for k in bes}
        for r in er:
            for k, be in bes.items():
                outs[k].append(simplify_with(be, r["text"], r["context"], meta["edit_tags"]))
        for key, (x, y) in cmp.items():
            for ox, oy in zip(outs[x], outs[y]):
                g = stat[key]; g["n"] += 1; g["simplified_same"] += int(ox[1] == oy[1]); g["tags_same"] += int(ox[2] == oy[2])
                g["words"] += len(ox[2]); g["word_tags_same"] += sum(p == q for p, q in zip(ox[2], oy[2])); g["top1_world_same"] += int(ox[0].argmax() == oy[0].argmax())
        for g in stat.values():
            g["simplified_agreement"] = g["simplified_same"] / g["n"]; g["tag_sequence_agreement"] = g["tags_same"] / g["n"]; g["word_tag_agreement"] = g["word_tags_same"] / max(g["words"], 1)
        edit_agree = {"n_items": len(er), "seed": a.seed, "rewritten_by_torch": sum(1 for o in outs["torch"] if o[1]) / len(er), **stat,
                      "examples_differing": [{"text": r["text"], "torch": t[1], "int8": q[1]} for r, t, q in zip(er, outs["torch"], outs["int8"]) if t[1] != q[1]][:15]}
        print("edit agreement", json.dumps({k: v for k, v in edit_agree.items() if k != "examples_differing"}), flush=True)

    # ---- latency ------------------------------------------------------------------------------------------------------
    lat_items = sample[:a.latency_n]
    latency = {}
    for threads in (1, 4):
        for label, path in (("fp32", fp32), ("int8", int8)):
            be = Backend(tok, "onnx", OrtModel(path, threads))
            for it in lat_items[:5]:
                dispatch_once(be, it["text"], {"tab": it["context"].get("tab"), "recent_worlds": []}, worlds)
            enc_ms, disp_ms, nseg = [], [], []
            for it in lat_items:
                text, ctx = it["text"], {"tab": it["context"].get("tab"), "recent_worlds": it["context"].get("recent_worlds", [])}
                ids = tok(text, truncation=True, max_length=192)["input_ids"]
                t = time.perf_counter(); be.impl.run([ids]); enc_ms.append((time.perf_counter() - t) * 1e3)
                t = time.perf_counter(); c, s = dispatch_once(be, text, ctx, worlds); disp_ms.append((time.perf_counter() - t) * 1e3); nseg.append(len(s))
            latency[f"{label}_threads{threads}"] = {
                "encoder_pass_ms": {"p50": pct(enc_ms, .5), "p95": pct(enc_ms, .95), "mean": statistics.mean(enc_ms)},
                "dispatch_message_ms": {"p50": pct(disp_ms, .5), "p95": pct(disp_ms, .95), "mean": statistics.mean(disp_ms)},
                "avg_distinct_segments_per_message": statistics.mean(nseg), "n": len(lat_items)}
            print(label, threads, json.dumps(latency[f"{label}_threads{threads}"]), flush=True)

    import onnxruntime, onnx
    res = {"checkpoint": str(ckpt), "model": meta["model"], "export_dir": str(out), "command": "python -m psys2_train.export_onnx " + " ".join(argv if argv is not None else __import__("sys").argv[1:]),
           "sizes_mb": {"fp32": fp32.stat().st_size / 2**20, "int8": int8.stat().st_size / 2**20},
           "targets": {"max_size_mb": 150, "max_ms_per_message": 50, "min_agreement": 0.995},
           "gold_top1_lenient_on_gold_segments_of_sample": {"n": gold_n, **{k: v / max(gold_n, 1) for k, v in gold_hits.items()}},
           "agreement": {"n_items": len(sample), "seed": a.seed, "reference": "PyTorch CUDA fp32", **agree, "disagreements": disagreements[:30]},
           "edit_agreement": edit_agree,
           "latency_cpu_batch1": latency, "cpu": "Grace aarch64 (DGX Spark)",
           "versions": {"torch": torch.__version__, "onnx": onnx.__version__, "onnxruntime": onnxruntime.__version__, "opset": a.opset}}
    rp = Path(a.results or ROOT / "results" / f"export-dispatcher-{name}.json"); rp.parent.mkdir(parents=True, exist_ok=True)
    rp.write_text(json.dumps(res, indent=1))
    print("wrote", rp)


if __name__ == "__main__":
    main()
