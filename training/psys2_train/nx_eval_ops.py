"""NX5-lite: agreement of the NX op head with the rules' reading on the operational set (rules-verified cases only).

  python -m psys2_train.nx_eval_ops --runs nx-a-seed1,nx-aplus-seed1 --inputs training/results/nx5-inputs.jsonl --out training/results/nx5-ops.json

Inputs come from `node scripts/nx-eval-inputs.mjs`. For every case whose rules outcome is `right` (verified against the expected answer) and that has no
setup messages, each rules segment is given to the model alone (`tab: <tab> ; recent: none ;; <segment>`); the model's operation is compared with the
rules' operation for that segment. This measures agreement on verified-correct readings, not end-to-end correctness (no canonicalisation or execution).
"""
import argparse, json
from collections import Counter, defaultdict
from pathlib import Path
import torch
from transformers import AutoTokenizer
from .nx_heads import TRAIN, DISPATCH_RUN, NXHeads, load_dispatcher, pad_batch
from .dispatcher import require_cuda


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--runs", required=True); ap.add_argument("--inputs", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args(); dev = require_cuda()
    cases = [json.loads(l) for l in open(a.inputs)]
    tok = AutoTokenizer.from_pretrained(DISPATCH_RUN / "tokenizer")
    items = [(c, s) for c in cases if c["outcome"] == "right" and not c["setup"] for s in c["rules"]]
    texts = [f"tab: {c['tab'] or 'none'} ; recent: none ;; {s['text']}" for c, s in items]
    seqs = tok(texts, truncation=True, max_length=128)["input_ids"]
    res = {"n_cases_right_no_setup": len({c['id'] for c, _ in items}), "n_segments": len(items), "runs": {}}
    for run in a.runs.split(","):
        rd = TRAIN / "runs" / run
        vocab = json.loads((rd / "vocab.json").read_text())
        disp, _ = load_dispatcher(dev)
        model = NXHeads(disp, len(vocab["ops"]), len(vocab["labels"])).to(dev)
        ck = torch.load(rd / "best.pt", map_location="cpu")
        model.op_head.load_state_dict(ck["op_head"]); model.tag_head.load_state_dict(ck["tag_head"])
        if "body" in ck: disp.load_state_dict(ck["body"], strict=False)
        model.eval(); preds = []
        with torch.no_grad():
            for i in range(0, len(seqs), 256):
                ids, am = pad_batch(seqs[i:i + 256], tok.pad_token_id or 0)
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    ol, _ = model(ids.to(dev), am.to(dev))
                p = torch.softmax(ol.float(), -1); top = p.max(-1)
                preds += [(vocab["ops"][k], float(v)) for k, v in zip(p.argmax(-1).tolist(), top.values.tolist())]
        by = defaultdict(Counter); tot = Counter()
        wrong = []
        for (c, s), (op, conf) in zip(items, preds):
            ok = op == s["op"]
            for k in (by[c["world"]], tot):
                k["n"] += 1; k["agree"] += ok; k["none"] += (op == "none")
            if not ok and len(wrong) < 40: wrong.append({"id": c["id"], "text": s["text"], "rules": s["op"], "model": op, "conf": round(conf, 3)})
        f = lambda c: {"n": c["n"], "op_agree": round(c["agree"] / c["n"], 4), "model_says_none": round(c["none"] / c["n"], 4)}
        res["runs"][run] = {"overall": f(tot), "worlds": {w: f(c) for w, c in sorted(by.items())}, "disagreement_sample": wrong}
        print(run, f(tot), flush=True)
    Path(a.out).write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
