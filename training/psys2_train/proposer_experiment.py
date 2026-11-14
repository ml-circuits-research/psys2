"""Proposer experiment (2026-11-14, MEASUREMENT ONLY): nearest accepted sentences of the same world, by a small encoder.

Arms: `minilm` = nreimers/MiniLM-L6-H384-uncased (the backbone of the act tagger), mean-pooled, cosine; `tfidf` = word 1-2-gram TF-IDF cosine (control: how much the encoder adds).
Texts are delexicalised ([n] numbers, [p] names) so a sentence with other values is a neighbour; the values are put back by scripts/exp-proposer.mjs.
Variants: `A` the pool without the exact original of the paraphrase; `B` also without every sentence of the original's template (no twin).
usage: python proposer_experiment.py --dir <dir> --out scores.json
"""
import argparse, json
import numpy as np
import torch
import math, re
from collections import Counter
from transformers import AutoModel, AutoTokenizer


def rows(p):
    return [json.loads(l) for l in open(p) if l.strip()]


@torch.no_grad()
def embed(texts, tok, model, dev, bs=128):
    out = []
    for i in range(0, len(texts), bs):
        b = tok(texts[i:i + bs], padding=True, truncation=True, max_length=64, return_tensors="pt").to(dev)
        h = model(**b).last_hidden_state
        m = b["attention_mask"].unsqueeze(-1).float()
        v = (h * m).sum(1) / m.sum(1)
        out.append(torch.nn.functional.normalize(v, dim=-1).float().cpu())
    return torch.cat(out).numpy()


def grams(t):
    w = re.findall(r"[\w\[\]']+", t.lower())
    return w + [a + " " + b for a, b in zip(w, w[1:])]


def tfidf(docs):
    df = Counter(g for d in docs for g in set(grams(d)))
    idx = {g: i for i, g in enumerate(df)}
    idf = np.array([math.log((1 + len(docs)) / (1 + df[g])) + 1 for g in idx])
    def vec(ds):
        M = np.zeros((len(ds), len(idx)), dtype=np.float32)
        for r, d in enumerate(ds):
            for g, c in Counter(grams(d)).items():
                M[r, idx[g]] = c * idf[idx[g]]
        return M / np.maximum(np.linalg.norm(M, axis=1, keepdims=True), 1e-9)
    return vec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--k", type=int, default=5)
    a = ap.parse_args()
    pool, qs = rows(f"{a.dir}/pool.jsonl"), rows(f"{a.dir}/queries.jsonl")
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    name = "nreimers/MiniLM-L6-H384-uncased"
    tok, model = AutoTokenizer.from_pretrained(name), AutoModel.from_pretrained(name).to(dev).eval()
    P = embed([p["dx"] for p in pool], tok, model, dev)
    Q = embed([q["dx"] for q in qs], tok, model, dev)
    vec = tfidf([p["dx"] for p in pool] + [q["dx"] for q in qs])
    TP, TQ = vec([p["dx"] for p in pool]), vec([q["dx"] for q in qs])
    res = {"minilm": {"A": {}, "B": {}}, "tfidf": {"A": {}, "B": {}}}
    for qi, q in enumerate(qs):
        orig = q["original"].strip().lower()
        for arm, S in (("minilm", P @ Q[qi]), ("tfidf", TP @ TQ[qi])):
            S = np.array(S, dtype=float)
            for variant in ("A", "B"):
                s = S.copy()
                for pi, p in enumerate(pool):
                    if p["world"] != q["world"] or p["text"].strip().lower() == orig or (variant == "B" and p["dx"] == q["odx"]):
                        s[pi] = -9
                top = [int(i) for i in np.argsort(-s)[: a.k] if s[i] > -9]
                res[arm][variant][q["id"]] = top
    json.dump(res, open(a.out, "w"))
    print("ok", dev, len(qs), "queries,", len(pool), "pool")


main()
