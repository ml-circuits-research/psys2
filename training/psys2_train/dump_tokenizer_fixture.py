"""Dump a small tokenizer fixture for the JS WordPiece tests (D4):

  python -m psys2_train.dump_tokenizer_fixture --ckpt training/runs/dispatcher-distilbert [--out tests/fixtures/wordpiece-distilbert.json] [--n 180]

The fixture holds ~200 sentences (dataset sentences, routing inputs `tab: .. ; recent: .. ;; text`, multi-command messages and hand-written
edge cases: accents, CJK, punctuation, unknown and very long words), the token ids and character offsets of the Python (HF fast) tokenizer,
and the vocabulary pruned to the tokens that occur in the expected ids (greedy longest match gives the same result with the pruned vocabulary).
"""
from __future__ import annotations
import argparse, json, random
from pathlib import Path
from transformers import AutoTokenizer
from .data import routing_text, read_jsonl, DATASET
from .multicmd import load_multicmd

EDGE = [
    "Café au lait, naïve façade — résumé!", "ÉCOLE Ünïcödé ŞİĞ", "Hello,world;this:is(a)test?yes!", "  leading   and\ttrailing\nwhitespace  ", "",
    "你好 world 世界", "tokenization of unaffordable antidisestablishmentarianism", "x" * 150, "a" * 100, "a" * 101, "3.14 + 2 = 5.14", "it's don't can't o'clock",
    "email@example.com http://example.org/a?b=c#d", "100% sure $5 #tag @user", "zzzzqqqq xkcdwtf", "snake_case-and-kebab", " nbsp​zero width", "tab: chess ; recent: none ;; resign",
    "ǅ ß ﬁ ẞ İstanbul", "ａｂｃ fullwidth １２３", "quote “smart” ‘single’ « guillemets »", "ellipsis… dash – minus − done", "a" + "́" + "bc combining", "Ana has 3 apples. Ben has 2.",
]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--out", default="../tests/fixtures/wordpiece-distilbert.json")
    ap.add_argument("--n", type=int, default=180); ap.add_argument("--seed", type=int, default=11)
    a = ap.parse_args(argv)
    tok = AutoTokenizer.from_pretrained(Path(a.ckpt) / "tokenizer")
    rng = random.Random(a.seed)
    rows = [r for r in read_jsonl(DATASET / "routing.jsonl") if r["split"] == "test"]
    texts = []
    for r in rng.sample(rows, a.n // 2):
        texts.append(r["text"]); 
    for r in rng.sample(rows, a.n // 4):
        texts.append(routing_text(r, True))
    texts += [m["text"] for m in rng.sample(load_multicmd("test"), a.n - len(texts))]
    texts += EDGE
    cases, used = [], set()
    for t in texts:
        enc = tok(t, truncation=True, max_length=128, return_offsets_mapping=True)
        cases.append({"text": t, "ids": enc["input_ids"], "offsets": enc["offset_mapping"]})
        used.update(enc["input_ids"])
    vocab = {tok.convert_ids_to_tokens(i): i for i in sorted(used | {0, 100, 101, 102, 103})}
    Path(a.out).write_text(json.dumps({"model": "distilbert-base-uncased", "max_length": 128, "specials": {"unk": 100, "cls": 101, "sep": 102, "pad": 0}, "vocab": vocab, "cases": cases}, ensure_ascii=False) + "\n")
    print(f"{len(cases)} cases, vocab {len(vocab)} -> {a.out}")


if __name__ == "__main__":
    main()
