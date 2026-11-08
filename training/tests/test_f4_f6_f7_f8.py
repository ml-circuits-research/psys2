"""Tests of the F4 (compositional data), F6 (sampling, budgets), F7 (selection, role pairs) and F8 (windows) code. No GPU, no torch needed.

Run: python training/tests/run_all.py   (also run by `npm test` through tests/training-python.test.mjs)
"""
import json, pathlib, random, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from psys2_train import compositional, role_pairs, sampling, selection
from psys2_train.windows import window_spans, merge_window_probs


# ---- F8 windows -----------------------------------------------------------------------------------------------------
def test_window_spans():
    assert window_spans(10, 10) == [(0, 10)] and window_spans(0, 10) == [(0, 0)]
    sp = window_spans(25, 10)
    assert sp[0][0] == 0 and sp[-1][1] == 25 and all(b - a == 10 for a, b in sp)
    assert all(sp[i + 1][0] - sp[i][0] <= 5 for i in range(len(sp) - 1))          # overlap of at least half a window
    covered = set(k for a, b in sp for k in range(a, b))
    assert covered == set(range(25))
    sp = window_spans(26, 10, 5)
    assert sp[-1] == (16, 26)


def test_merge_window_probs_prefers_the_centre():
    sp = window_spans(20, 10)
    probs = [[0.0] * 10 for _ in sp]
    # a boundary at token 9 is seen at the right edge of window 0 (low weight: p=0) and in the middle of window 1 (p=1)
    k = 9 - sp[1][0]
    probs[1][k] = 1.0
    merged = merge_window_probs(20, sp, probs)
    assert merged[9] > 0.5 and merged[0] == 0.0 and len(merged) == 20


# ---- F4 compositional data ------------------------------------------------------------------------------------------
def test_families_and_context():
    seen = set()
    for fam in compositional.FAMILIES:
        recs = compositional.generate(30, "train", 1, fam)
        assert len(recs) == 30
        for r in recs:
            seen.add(r["family"]); assert r["family"] == fam
            assert r["segments"] and r["n_segments"] == len(r["segments"])
            for s in r["segments"]:
                assert r["text"][s["start"]:s["end"]] == s["text"] and s["world"]
            assert [s["start"] for s in r["segments"]] == sorted(s["start"] for s in r["segments"])
            assert r["program"]["steps"]
        if fam in ("repeat_undo",):
            assert all(r["context"]["session"] for r in recs), "repeat_undo needs the created object in the session context"
        if fam in ("shared_arg", "ellipsis", "self_correct"):
            assert all(r["n_segments"] == 1 for r in recs), "the segmenter must not split (nor copy) shared arguments"
        if fam in ("ref_created", "repeat_undo", "world_switch"):
            assert all(r["n_segments"] >= 2 for r in recs)
    assert seen == set(compositional.FAMILIES)


def test_world_switch_uses_different_worlds_and_values_survive():
    for r in compositional.generate(40, "dev", 2, "world_switch"):
        ws = [s["world"] for s in r["segments"]]
        assert len(set(ws)) == len(ws)
    for r in compositional.generate(40, "train", 3, "self_correct"):
        assert r["program"]["steps"][-1].count(" ") >= 2


def test_self_correct_program_keeps_only_the_final_value():
    for r in compositional.generate(40, "train", 4, "self_correct"):
        step = r["program"]["steps"][0]
        fin = re.split(r",\s*", r["text"].rstrip(".?"))[-1].split()
        assert len(r["program"]["steps"]) == 1
        assert fin[-1].lower().rstrip("?.") in step.lower()


def test_splits_are_disjoint_by_signature():
    sigs = {}
    for split in ("train", "dev", "test"):
        for r in compositional.generate(300, split, 5):
            sigs.setdefault(compositional.signature(r["family"], r["text"]), set()).add(split)
    assert all(len(v) == 1 for v in sigs.values())


def test_regenerated_each_epoch():
    a = [r["text"] for r in compositional.generate(50, "train", "1-0")]
    b = [r["text"] for r in compositional.generate(50, "train", "1-1")]
    assert a != b


# ---- F6 sampling ------------------------------------------------------------------------------------------------------
ROWS = ([{"text": f"set the volume to {n}", "world": "a", "source": "generator"} for n in range(5)]
        + [{"text": f"increase the volume to {n}", "world": "b", "source": "generator"} for n in range(5)]
        + [{"text": f"open item {n}", "world": "c", "source": "generator"} for n in range(60)]
        + [{"text": f"draw a house {n}", "world": "d", "source": "paraphrase"} for n in range(8)])


def test_near_miss_mining_finds_set_increase():
    hit = sampling.mine_near_misses(ROWS)
    texts = {ROWS[i]["text"] for i in hit}
    assert "set the volume to 3" in texts and "increase the volume to 3" in texts
    assert not any(t.startswith("open item") for t in texts)


def test_epoch_keeps_all_rows_and_reserves_exposure():
    s = sampling.EpochSampler(ROWS, seed=1, focus_frac=0.3, source_floor={"paraphrase": 0.2})
    plan = s.epoch(failures=[0, 1], solved=[20, 21, 22])
    base = sorted(i for k, i in plan if k == "base")
    assert base == list(range(len(ROWS)))                                   # every row once
    kinds = {k for k, _ in plan}
    assert {"failure", "contrastive", "replay", "floor"} <= kinds
    assert all(i in (0, 1) for k, i in plan if k == "failure")
    para = sum(1 for _, i in plan if ROWS[i]["source"] == "paraphrase")
    assert para >= int(0.2 * len(plan)) - 1
    log = sampling.ShownLog(); s.log_plan(log, plan)
    summ = log.summary()["routing"]
    assert summ["total"] == len(plan) and summ["kind:base"] == len(ROWS) and summ["source:paraphrase"] == para and "tag:set_increase" in summ


def test_epoch_without_failures_spends_the_reserve_on_contrastive():
    s = sampling.EpochSampler(ROWS, seed=1, focus_frac=0.3)
    plan = s.epoch()
    assert sum(1 for k, _ in plan if k == "contrastive") > 0 and not any(k in ("failure", "replay") for k, _ in plan)


def test_budget_is_exact_and_spread():
    for total, n in [(100, 100), (100, 25), (100, 0), (97, 13)]:
        b = sampling.Budget(total, n)
        act = [b.active(i) for i in range(total)]
        assert sum(act) == n == b.used
    b = sampling.Budget(100, 10)
    idx = [i for i in range(100) if b.active(i)]
    assert max(j - i for i, j in zip(idx, idx[1:])) <= 11                   # evenly spread


def test_phenomena_tags():
    assert "question" in sampling.phenomena("Is the light on?") and "command" in sampling.phenomena("Turn on the light")
    assert "number_words" in sampling.phenomena("add thirteen") and "before_after" in sampling.phenomena("do it before lunch")


# ---- F7 selection, role pairs ------------------------------------------------------------------------------------------
def test_role_pairs_same_words_different_meaning():
    pairs = role_pairs.generate(60, 11)
    assert len(pairs) == 60 and {p["family"] for p in pairs} == set(role_pairs.FAMILIES)
    for p in pairs:
        assert role_pairs.bag(p["a"]["text"]) == role_pairs.bag(p["b"]["text"]) and p["a"]["text"] != p["b"]["text"]
        assert p["a"]["steps"] != p["b"]["steps"]
    committed = [json.loads(l) for l in (pathlib.Path(__file__).resolve().parents[1] / "eval" / "role-pairs.jsonl").read_text().splitlines()]
    assert committed == role_pairs.generate(120, 11), "training/eval/role-pairs.jsonl is stale: python -m psys2_train.role_pairs"


def test_selection_prefers_fewer_wrong_actions():
    good = {"n": 100, "right": 80, "partly_right": 5, "wrong": 2, "not_understood": 13, "latency_ms": 10.0}
    risky = {"n": 100, "right": 85, "partly_right": 0, "wrong": 15, "not_understood": 0, "latency_ms": 10.0}
    assert selection.operational_score(good) > selection.operational_score(risky)
    table = {"c1": good, "c2": risky}
    best, tau, _ = selection.select([{"name": "c1"}, {"name": "c2"}], lambda c, t: dict(table[c["name"]], evaluator="stub"), taus=(0.5, 0.7), log=lambda m: None)
    assert best["name"] == "c1"


def test_script_contract(tmp_path=None):
    import tempfile
    d = pathlib.Path(tempfile.mkdtemp())
    (d / "fake.mjs").write_text("console.log('noise'); console.log(JSON.stringify({headline: {n: 10, right: 7, partly_right: 1, wrong: 1, not_understood: 1, latency_ms: 3.5}}))")
    m = selection.run_script(f"node {d / 'fake.mjs'} --tau {{tau}}", None, None, 0.6)
    assert m["evaluator"] == "script" and m["n"] == 10 and m["right"] == 7 and m["wrong"] == 1 and m["latency_ms"] == 3.5


def test_classify():
    gold = [{"start": 0, "world": "a"}, {"start": 10, "world": "b"}]
    seg = lambda s, w: {"start": s, "worlds": [{"world": w}]}
    assert selection.classify([seg(0, "a"), seg(10, "b")], gold) == "right"
    assert selection.classify([seg(0, "a")], gold) == "partly_right"
    assert selection.classify([seg(0, "x"), seg(10, "x")], gold) == "wrong"


def test_stub_set_is_committed_and_covers_families():
    recs = selection.load_stub()
    fams = {r["family"] for r in recs}
    assert set(compositional.FAMILIES) <= fams and "role_pair" in fams and "single" in fams


if __name__ == "__main__":
    n = 0
    for k, v in sorted(globals().items()):
        if k.startswith("test_") and callable(v):
            v(); n += 1; print("ok", k)
    print(n, "tests passed")
