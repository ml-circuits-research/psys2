"""Reference outputs of a trained act tagger for the browser phone-profile run: 300 test sentences (150 seen-world, 150 held-out) with their token ids and the fp32 CUDA argmax of
the act head and of every token, so that the int8 graph run in the browser can be checked for agreement.

  python -m psys2_train.act_tagger_ref --size minilm6 [--n 300]    -> training/runs/act-tagger/<size>/ref.json
"""
import argparse, json, random
from pathlib import Path
import torch
from transformers import AutoTokenizer
from .act_tagger import Tagger, SIZES, ACTS, read, ROOT


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--size", required=True); ap.add_argument("--n", type=int, default=300); a = ap.parse_args()
    assert torch.cuda.is_available()
    base, layers = SIZES[a.size]; run = ROOT / f"training/runs/act-tagger/{a.size}"
    tok = AutoTokenizer.from_pretrained(base); m = Tagger(base, layers).cuda(); m.load_state_dict(torch.load(run / "best.pt", map_location="cuda")); m.eval()
    rnd = random.Random(5)
    rows = rnd.sample(read(ROOT / "training/data/act-tagger/test-seen.jsonl"), a.n // 2) + rnd.sample(read(ROOT / "training/data/act-tagger/test-held.jsonl"), a.n // 2)
    out = []
    with torch.no_grad():
        for r in rows:
            e = tok(r["words"], is_split_into_words=True, truncation=True, max_length=64, return_tensors="pt").to("cuda")
            la, lt = m(e["input_ids"], e["attention_mask"])
            out.append({"text": r["text"], "ids": e["input_ids"][0].tolist(), "act": int(la.argmax(-1)[0]), "tags": lt.argmax(-1)[0].tolist(), "world": r["world"]})
    (run / "ref.json").write_text(json.dumps(out))
    print(len(out), "reference rows ->", run / "ref.json")


if __name__ == "__main__":
    main()
