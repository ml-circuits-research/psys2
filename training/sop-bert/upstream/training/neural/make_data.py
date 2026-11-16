"""make_data.py: rows (request span text -> ACT label) for fine-tuning the demo's neural reader (docs/js/neural.js).

One row per annotated request. The label is the act: the action of a command, the ask of a question, else the type (fact, rule).
The act set is exactly docs/js/neural.js ACTION + ASK + fact + rule (read from that file, so the two cannot drift).

Training data = the span-annotated messages the cutter and the VSS worlds train on (training/sketch/train_cutter.py DIRS, plus
llm_train/{sonnet,haiku}_short). Split by MESSAGE id: 10% held-out, fixed seed. The 1000 messages of the coordinator's fixed sample
(--sample-ids FILE, one id per line) are removed from the train/held-out pools BEFORE the split and exported as their own eval set.
The evaluation sets docs/bench/{hand,blind,broad,seen,new_identities,heldout_formulations}.json are exported, never trained on.
llm_bench/{sonnet,haiku}_spans messages that are not in the sample are not used at all (they are not in the cutter's DIRS).

Output (default ~/vss-box/ft/data, outside the repo): train.jsonl, heldout.jsonl, eval_<set>.jsonl, acts.json, counts.json.
Row: {"id": message id or set name + index, "text": span, "label": act}.
The sample's ids are kept in training/neural/sample1000_ids.txt (the default of --sample-ids).
Run: python3 training/neural/make_data.py [--out DIR] [--sample-ids FILE] [--seed 0]
"""
import argparse, collections, glob, json, os, random, re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
SK = os.path.join(REPO, "training", "sketch")
DIRS = ["llm_train/sonnet_msg", "llm_train/haiku_msg", "llm_train/sonnet_msg2", "llm_train/haiku_msg2", "llm_train/sonnet_long",
        "llm_bench/fresh1/sonnet", "llm_bench/fresh1/haiku", "llm_train/sonnet_short", "llm_train/haiku_short"]
SAMPLE_DIRS = ["llm_bench/sonnet_spans", "llm_bench/haiku_spans"]   # where the sample's h-/s- ids live
EVAL = ["hand", "blind", "broad", "seen", "new_identities", "heldout_formulations"]


def acts_from_neural_js():
    src = open(os.path.join(REPO, "docs", "js", "neural.js"), encoding="utf8").read()
    def keys(name):
        i = src.index(f"const {name} = {{"); j = src.index("\n};", i)
        return re.findall(r"^  (\w+): \[", src[i:j], re.M)
    return keys("ACTION"), keys("ASK")


def act_of(type_, args):
    if type_ == "command": return args.get("action")
    if type_ == "question": return args.get("ask")
    return type_


def messages(dirs):
    out = []
    for d in dirs:
        files = sorted(glob.glob(os.path.join(SK, d, "msg_*.jsonl")) + glob.glob(os.path.join(SK, d, "batch_*.jsonl")))
        for f in files:
            for l in open(f, encoding="utf8"):
                if l.strip(): m = json.loads(l); m["_dir"] = d; out.append(m)
    return out


def rows_of(m, ACTS, skipped):
    rows = []
    for w in m.get("wires", []):
        sp, a = w.get("span"), act_of(w.get("type"), w.get("args", {}))
        if not sp or sp not in m["text"]: skipped["span missing or not in text"] += 1; continue
        if a not in ACTS: skipped[f"act not in neural.js set: {a}"] += 1; continue
        rows.append({"id": m["id"], "text": sp, "label": a})
    return rows


def split_messages(sample_ids, seed):
    """the message pools, shared with make_roles.py so both models see the same split:
    (train_msgs sorted by id, held-out ids, sample messages, sample ids not found)"""
    sample = set(l.strip() for l in open(sample_ids) if l.strip()) if sample_ids else set()
    pool = messages(DIRS)
    ids = [m["id"] for m in pool]; assert len(ids) == len(set(ids)), "message ids are not unique across folders"
    in_sample = [m for m in pool if m["id"] in sample]
    sample_msgs = in_sample + [m for m in messages(SAMPLE_DIRS) if m["id"] in sample and m["id"] not in {x["id"] for x in in_sample}]
    missing = sample - {m["id"] for m in sample_msgs}
    train_msgs = sorted((m for m in pool if m["id"] not in sample), key=lambda m: m["id"])
    rng = random.Random(seed); held = set(rng.sample([m["id"] for m in train_msgs], round(0.1 * len(train_msgs))))
    assert not (held | {m['id'] for m in train_msgs}) & sample, "sample leaked into train/held-out"
    return train_msgs, held, sample_msgs, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.expanduser("~/vss-box/ft/data"))
    ap.add_argument("--sample-ids", default=os.path.join(HERE, "sample1000_ids.txt"), help="file with the ids of the fixed evaluation sample (one per line)")
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ACTION, ASK = acts_from_neural_js(); ACTS = ACTION + ASK + ["fact", "rule"]
    sample = set(l.strip() for l in open(a.sample_ids) if l.strip()) if a.sample_ids else set()
    skipped = collections.Counter()
    train_msgs, held, sample_msgs, missing = split_messages(a.sample_ids, a.seed)
    out = {"train": [], "heldout": [], "eval_sample1000": []}
    for m in train_msgs: out["heldout" if m["id"] in held else "train"] += rows_of(m, ACTS, skipped)
    for m in sample_msgs: out["eval_sample1000"] += rows_of(m, ACTS, skipped)
    for s in EVAL:
        rows = []
        for i, r in enumerate(json.load(open(os.path.join(REPO, "docs", "bench", s + ".json"), encoding="utf8"))):
            if "wires" in r: skipped[f"bench {s}: multi-request message without spans"] += 1; continue
            ac = act_of(r["type"], r["gold"]); ac = next((x for x in ACTS if x.lower() == str(ac).lower()), ac)   # bench gold writes tofront/toback in lower case
            if ac in ACTS: rows.append({"id": f"{s}-{i}", "text": r["text"], "label": ac})
            else: skipped[f"bench {s}: act {ac}"] += 1
        out["eval_" + s] = rows
    for k, rows in out.items():
        with open(os.path.join(a.out, k + ".jsonl"), "w", encoding="utf8") as f:
            for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    json.dump(ACTS, open(os.path.join(a.out, "acts.json"), "w"))
    tr = {r["text"].lower() for r in out["train"]}
    counts = {k: len(v) for k, v in out.items()}
    counts["messages"] = {"train": len(train_msgs) - len(held), "heldout": len(held), "sample1000_found": len(sample_msgs), "sample1000_missing": len(missing)}
    counts["eval_texts_also_in_train"] = {k: sum(r["text"].lower() in tr for r in v) for k, v in out.items() if k.startswith("eval_")}
    counts["skipped"] = dict(skipped)
    json.dump(counts, open(os.path.join(a.out, "counts.json"), "w"), indent=1)
    print(f"acts: {len(ACTS)}; messages train {counts['messages']['train']} heldout {counts['messages']['heldout']}; sample found {len(sample_msgs)} missing {len(missing)}")
    assert not (held | {m['id'] for m in train_msgs}) & sample, "sample leaked into train/held-out"
    print(f"{'act':12}" + "".join(f"{k.replace('eval_', ''):>12}" for k in out))
    for ac in ACTS: print(f"{ac:12}" + "".join(f"{sum(r['label'] == ac for r in v):12}" for v in out.values()))
    print(f"{'TOTAL':12}" + "".join(f"{len(v):12}" for v in out.values()))
    print("eval texts that also occur (case-insensitively) in train:", counts["eval_texts_also_in_train"])
    if skipped: print("skipped:", dict(skipped))


if __name__ == "__main__": main()
