"""Checkpoint and threshold selection by the whole pipeline (review F7).

The training loop keeps the best 2-3 checkpoints by the cheap dev score (world top-1 + boundary F1 + 0.5 x edit F1). `select()` then
judges each of them (and each simplifier threshold tau) on a COMPACT OPERATIONAL SET through the full pipeline and picks the one with the
best operational score: right / partly right / wrong / not understood / latency. Wrong actions weigh more than "not understood":

    score = right - 2 * wrong + 0.25 * partly_right - 0.0002 * latency_ms        (rates of the n messages)

Two evaluators, one contract (a dict {n, right, partly_right, wrong, not_understood, latency_ms}):

  script  `node scripts/eval-operational.mjs ...` (built by the operational-set agent: training/eval/operational.jsonl, the real
          dispatcher -> validation -> rules pipeline in the webchat configuration). The command is a template, default
          `node scripts/eval-operational.mjs --mode encoder --model-dir {export} --edit-tau {tau} --json`; {export} is the ONNX export directory made from the
          checkpoint (python -m psys2_train.export_onnx), {ckpt} the checkpoint directory, {tau} the simplifier threshold. The script must print
          one JSON object (the contract above, optionally nested under "headline") on its last stdout line. Used when the script file exists.
  stub    until it lands: a small local set (training/eval/operational-stub.jsonl, `--make-stub`: the compositional families, the contrastive
          role pairs and hand-written singles) scored in Python through dispatch(): right = every gold segment found (start) with its world as
          top-1; partly right = at least one; wrong = a segmentation was produced and no gold segment was found. The stub cannot tell "not
          understood" (no validation/rules in Python), so it reports 0 there. It is a stand-in for wiring, not the headline.
"""
from __future__ import annotations
import argparse, json, random, shutil, subprocess, time
from pathlib import Path
from . import compositional, role_pairs

EVAL = Path(__file__).resolve().parents[1] / "eval"
STUB = EVAL / "operational-stub.jsonl"
REPO = Path(__file__).resolve().parents[2]
DEFAULT_CMD = "node scripts/eval-operational.mjs --mode encoder --model-dir {export} --edit-tau {tau} --json"
TAUS = [0.5, 0.6, 0.7, 0.8, 0.9]

SINGLES = [
    ("Draw a red house.", "art.draw"), ("Draw three trees.", "art.draw"), ("Put a big yellow sun in the top right corner.", "art.draw"),
    ("Make your eyes round.", "ui.avatar"), ("Set your mouth to a grill.", "ui.avatar"),
    ("What is 7 plus 5?", "kids.arith"), ("How much is 12 minus 4?", "kids.arith"), ("What is 6 times 3?", "kids.arith"),
    ("Show me Paris on the map.", "geo.map"), ("Zoom in on the map.", "geo.map"),
    ("Play a C note.", "media.music"), ("Play middle C on the piano.", "media.music"),
    ("Add milk to my shopping list.", "kids.tasks"), ("Make the text bold.", "docs.editor"), ("What time is it?", "kids.time"),
    ("Switch to the draw tab.", "ui.shell"), ("Open the map.", "ui.shell"), ("Start a new game of chess.", "games.chess"),
    ("Delete the last sentence.", "docs.editor"), ("Make the chart a bar chart.", "data.charts"),
]


def make_stub(path=STUB, per_family=8, seed=5):
    """Fixed local set: compositional families + role-pair sides + singles. Deterministic."""
    rng = random.Random(seed); recs = []
    for fam in compositional.FAMILIES:
        for r in compositional.generate(per_family, "test", f"stub-{seed}", fam):
            recs.append({"id": f"st-{fam}-{len(recs):03d}", "family": fam, "text": r["text"], "context": r["context"],
                         "segments": [{"start": s["start"], "end": s["end"], "world": s["world"]} for s in r["segments"]]})
    for p in role_pairs.generate(12, 3):
        for side in ("a", "b"):
            world = "ui.avatar" if p["family"] == "avatar_colors" else "kids.arith" if p["family"] == "arith_operands" else "art.draw"
            t = p[side]["text"]
            recs.append({"id": f"st-role-{p['id']}{side}", "family": "role_pair", "text": t, "context": {"tab": None, "recent_worlds": [], "session": p["setup"], "synthetic": True},
                         "segments": [{"start": 0, "end": len(t), "world": world}]})
    for i, (t, w) in enumerate(SINGLES):
        recs.append({"id": f"st-single-{i:02d}", "family": "single", "text": t, "context": {"tab": None, "recent_worlds": [], "session": [], "synthetic": False},
                     "segments": [{"start": 0, "end": len(t), "world": w}]})
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("".join(json.dumps(r) + "\n" for r in recs))
    return recs


def load_stub(path=STUB):
    if not Path(path).exists():
        make_stub(path)
    return [json.loads(l) for l in Path(path).read_text().splitlines() if l.strip()]


def classify(pred_segments, gold_segments):
    """right / partly_right / wrong for one stub message (see the module docstring)."""
    gold = {g["start"]: g["world"] for g in gold_segments}
    hit = sum(1 for s in pred_segments if gold.get(s["start"]) == (s["worlds"][0]["world"] if s["worlds"] else None))
    if hit == len(gold) and len(pred_segments) == len(gold):
        return "right"
    return "partly_right" if hit else "wrong"


def operational_score(m):
    n = max(m["n"], 1)
    return (m["right"] - 2 * m["wrong"] + 0.25 * m["partly_right"]) / n - 0.0002 * m.get("latency_ms", 0.0)


def eval_stub(model, tok, dev, worlds, use_context, edit_tags=None, edit_tau=0.5, recs=None):
    from .dispatcher import dispatch
    recs = recs or load_stub()
    t0 = time.time()
    outs = dispatch(model, tok, [{"text": r["text"], "context": r["context"]} for r in recs], use_context, dev, worlds, n_beam=1, k_unc=0, edit_tags=edit_tags, edit_tau=edit_tau)
    ms = (time.time() - t0) * 1000 / max(len(recs), 1)
    c = {"right": 0, "partly_right": 0, "wrong": 0}; by_family = {}
    for r, o in zip(recs, outs):
        k = classify(o["candidates"][0]["segments"], r["segments"])
        c[k] += 1
        by_family.setdefault(r["family"], {"n": 0, "right": 0})["n"] += 1
        by_family[r["family"]]["right"] += k == "right"
    return {"evaluator": "stub", "n": len(recs), **c, "not_understood": 0, "latency_ms": ms, "by_family": by_family}


def run_script(script_cmd, export_dir=None, ckpt_dir=None, tau=0.5, timeout=1800):
    """Run the operational evaluator command template; parse the JSON object on the last stdout line."""
    cmd = script_cmd.format(export=export_dir, ckpt=ckpt_dir, tau=tau)
    p = subprocess.run(cmd, shell=True, cwd=REPO, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(f"operational evaluator failed ({p.returncode}): {p.stderr[-500:]}")
    lines = [l for l in p.stdout.splitlines() if l.strip().startswith("{")]
    if not lines:
        raise RuntimeError("operational evaluator printed no JSON object")
    d = json.loads(lines[-1]); d = d.get("headline", d)
    out = {"evaluator": "script", "n": d.get("n", 0), "right": d["right"], "partly_right": d.get("partly_right", 0), "wrong": d.get("wrong", 0),
           "not_understood": d.get("not_understood", 0), "latency_ms": d.get("latency_ms", 0.0)}
    if out["n"] <= 1 and all(isinstance(out[k], float) and out[k] <= 1.0 for k in ("right", "wrong")):   # rates -> counts of a 1000-message scale
        out.update({k: out[k] * 1000 for k in ("right", "partly_right", "wrong", "not_understood")}); out["n"] = 1000
    return out


def script_available(cmd):
    parts = cmd.split()
    return any(p.endswith(".mjs") and (REPO / p).exists() for p in parts)


def export_ckpt(ckpt_dir, out_dir):
    subprocess.run(["python", "-m", "psys2_train.export_onnx", "--ckpt", str(ckpt_dir), "--out", str(out_dir), "--n", "20", "--latency-n", "5"],
                   cwd=REPO / "training", check=True, capture_output=True)


def select(candidates, evaluate, taus=(0.5,), log=print):
    """candidates: [{"name", "dir"}], evaluate(candidate, tau) -> metrics dict. Returns (best candidate, best tau, table)."""
    table = []
    for c in candidates:
        for tau in taus:
            m = evaluate(c, tau); m["score"] = operational_score(m)
            table.append({"name": c["name"], "tau": tau, **m})
            log(f"select {c['name']} tau={tau}: right {m['right']} partly {m['partly_right']} wrong {m['wrong']} not_understood {m['not_understood']} latency {m['latency_ms']:.1f}ms score {m['score']:.4f} [{m['evaluator']}]")
    best = max(table, key=lambda r: (round(r["score"], 3), -r["tau"]))   # latency noise must not decide between thresholds
    return next(c for c in candidates if c["name"] == best["name"]), best["tau"], table


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("--make-stub", action="store_true"); ap.add_argument("--out", default=str(STUB))
    a = ap.parse_args(argv)
    if a.make_stub:
        recs = make_stub(a.out); fam = {}
        for r in recs:
            fam[r["family"]] = fam.get(r["family"], 0) + 1
        print(len(recs), "stub messages", fam, "->", a.out)


if __name__ == "__main__":
    main()
