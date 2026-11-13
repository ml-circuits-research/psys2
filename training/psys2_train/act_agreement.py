"""Act-level agreement between the act tagger and the dispatcher + patterns (P3).

  node scripts/act-agreement-rules.mjs --out <rules.jsonl>      # what the rules read, as an act, per message (operational set + dialogue set)
  python -m psys2_train.act_agreement --rules <rules.jsonl> --sizes distilbert,minilm6,minilm4 [--out training/results/act-tagger-agreement.json]

For every message the rules mapped to an act (the winning request action of the first segment, mapped by its verb) the tagger's act (CUDA, fp32 weights of the trained checkpoint) is compared.
Subsets: `comparable` = messages of the doing worlds (art.draw, diagram.sketch, ui.avatar, kids.tasks, docs.editor, plan.seating), where the actions of the world are acts;
`single_command` = comparable messages without 'and', 'then', 'also', 'but' or a comma (the dispatcher segments those before any reading; the tagger here sees the whole message);
`right` = the operational messages whose shipped full-pipeline result was `right` (training/results/operational/encoder+n1-6c41eb24-2026-11-09.json), i.e. the rules' act is very likely the true one.
Context-free: the tagger sees the message only (no tab, no history), the rules see the open tab and the dialogue; follow-ups ("and 7 times 8?") are therefore not comparable and are counted as they are.
"""
import argparse, json
from collections import Counter
from pathlib import Path
import torch
from transformers import AutoTokenizer
from .act_tagger import Tagger, SIZES, ACTS, TAGS, ROOT, spans

DOING = {"art.draw", "diagram.sketch", "ui.avatar", "kids.tasks", "docs.editor", "plan.seating"}


@torch.no_grad()
def tag_messages(size, texts):
    base, layers = SIZES[size]; tok = AutoTokenizer.from_pretrained(base)
    m = Tagger(base, layers).cuda(); m.load_state_dict(torch.load(ROOT / f"training/runs/act-tagger/{size}/best.pt", map_location="cuda")); m.eval()
    acts, roles = [], []
    for s in range(0, len(texts), 512):
        chunk = texts[s:s + 512]
        words = [t.lower().replace("?", " ?").replace(".", " .").replace(",", " ,").split() for t in chunk]
        e = tok(words, is_split_into_words=True, truncation=True, max_length=64, padding=True, return_tensors="pt").to("cuda")
        la, lt = m(e["input_ids"], e["attention_mask"])
        ap = la.argmax(-1).cpu().tolist(); tp = lt.argmax(-1).cpu().tolist()
        for j in range(len(chunk)):
            acts.append(ACTS[ap[j]]); wid = e.word_ids(j); prev = None; tg = []
            for k, w in enumerate(wid):
                if w is not None and w != prev: tg.append(TAGS[tp[j][k]])
                prev = w
            roles.append([(r, " ".join(words[j][a:b])) for r, a, b in sorted(spans(tg), key=lambda x: x[1])])
    return acts, roles


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--rules", required=True); ap.add_argument("--sizes", default="distilbert,minilm6,minilm4"); ap.add_argument("--out", default=str(ROOT / "training/results/act-tagger-agreement.json"))
    a = ap.parse_args()
    rows = [json.loads(l) for l in Path(a.rules).read_text().splitlines() if l.strip()]
    pub = json.loads((ROOT / "training/results/operational/encoder+n1-6c41eb24-2026-11-09.json").read_text())
    outc = {c["id"]: c["outcome"] for c in pub["cases"]}
    for r in rows:
        if r["set"] == "operational": r["outcome"] = outc.get(r["id"])
    mapped = [r for r in rows if r["act"]]
    res = {"messages": len(rows), "rules_mapped_to_act": len(mapped), "by_set": dict(Counter(r["set"] for r in mapped)), "sizes": {}}
    for size in a.sizes.split(","):
        acts, roles = tag_messages(size, [r["message"] for r in mapped])
        out = {}
        def agree(sel, name):
            idx = [i for i, r in enumerate(mapped) if sel(r)]
            out[name] = {"n": len(idx), "agree": sum(acts[i] == mapped[i]["act"] for i in idx) / max(1, len(idx))}
        agree(lambda r: True, "all_mapped")
        agree(lambda r: r["world"] in DOING, "comparable_worlds")
        agree(lambda r: r["set"] == "operational" and r["world"] in DOING, "comparable_operational")
        agree(lambda r: r["set"] == "dialogue" and r["world"] in DOING, "comparable_dialogue")
        agree(lambda r: r.get("outcome") == "right" and r["world"] in DOING, "comparable_operational_right")
        agree(lambda r: r.get("outcome") == "right", "all_operational_right")
        agree(lambda r: r["world"] in DOING and not any(w in f" {r['message'].lower()} " for w in (" and ", " then ", ",", " also ", " but ")) and r["message"].strip().lower() not in ("it", "again", "more", "more please"), "comparable_single_command")
        conf = Counter((mapped[i]["act"], acts[i]) for i in range(len(mapped)) if mapped[i]["world"] in DOING and acts[i] != mapped[i]["act"])
        out["top_disagreements_rules_vs_tagger"] = [{"rules": k[0], "tagger": k[1], "n": v} for k, v in conf.most_common(8)]
        out["samples"] = [{"message": mapped[i]["message"], "world": mapped[i]["world"], "rules": mapped[i]["act"], "tagger": acts[i], "roles": roles[i]} for i in range(len(mapped)) if mapped[i]["world"] in DOING][:12]
        res["sizes"][size] = out
        print(size, json.dumps({k: v for k, v in out.items() if k not in ("samples", "top_disagreements_rules_vs_tagger")}))
    Path(a.out).write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
