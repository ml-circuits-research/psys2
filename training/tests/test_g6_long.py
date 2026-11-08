"""G6: medium/long programs, training windows equal to the inference windows, per-bucket metrics. No GPU, no torch."""
import pathlib, random, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from psys2_train import multicmd, buckets
from psys2_train.windows import window_spans, train_windows


def _rows():
    mk = lambda i, w, t: {"id": f"r{i}", "text": t, "world": w, "alt_worlds": [], "context": {"tab": None, "recent_worlds": []}, "split": "train"}
    return [mk(0, "kids.arith", "What is 3 plus 4?"), mk(1, "art.draw", "Draw a red house."), mk(2, "geo.map", "Show me Paris on the map."),
            mk(3, "ui.shell", "Open the draw tab!"), mk(4, "media.music", "Play a C note")]


def test_chain_offsets_and_sizes():
    rows = _rows()
    for split, rng_k in (("train", (4, 8)), ("dev", (9, 24))):
        from psys2_train import compositional
        pool = [r for r in compositional.generate(200, split, "t") if r["n_segments"] <= 3]
        recs = multicmd.build_chain(rows, pool, 80, random.Random(3), rng_k)
        deps = 0
        for r in recs:
            assert rng_k[0] <= r["n_segments"] <= rng_k[1] + 2, r["n_segments"]
            prev = 0
            for s in r["segments"]:
                assert r["text"][s["start"]:s["end"]] == s["text"] and s["start"] >= prev and s["end"] > s["start"], (r["text"], s)
                prev = s["end"]; deps += bool(s.get("dep"))
        assert deps > 0


def test_mix_has_buckets_in_train():
    rows = _rows() * 40
    for r in rows:
        r["split"] = "train"
    recs = multicmd.build_mix(rows, "train", 600, 1, 0)
    ns = [r["n_segments"] for r in recs]
    assert any(4 <= n <= 8 for n in ns) and any(n >= 9 for n in ns) and any(n == 1 for n in ns)
    assert {"mid", "chain_long", "long"} <= {r["family"] for r in recs}


def test_train_windows_match_inference():
    ids = [101] + list(range(1000, 1500)) + [102]; labels = [-100] + [0] * 500 + [-100]; labels[251] = 1
    ws = train_windows(ids, labels, 192, 101, 102)
    spans = window_spans(500, 190)
    assert len(ws) == len(spans) > 2
    for (wi, wl), (a, b) in zip(ws, spans):
        assert wi == [101] + ids[1 + a:1 + b] + [102] and len(wi) <= 192 and wl[0] == wl[-1] == -100 and len(wl) == len(wi)
    assert sum(sum(x for x in wl if x == 1) for _, wl in ws) >= 1
    assert train_windows(ids[:50], labels[:50], 192, 101, 102) == [(ids[:50], labels[:50])]


def test_bucket_metrics():
    assert [buckets.bucket_of(n) for n in (1, 2, 3, 4, 5, 6, 8, 9, 30)] == ["1", "2-3", "2-3", "4-5", "4-5", "6-8", "6-8", "long", "long"]
    gold = [(0, 10), (12, 20), (22, 30)]
    assert buckets.span_errors(gold, gold) == ([], 0, 0)
    assert buckets.span_errors(gold, [(0, 10), (12, 30)]) == ([2], 0, 0)               # last two merged -> one omission
    assert buckets.span_errors(gold, [(0, 5), (5, 10), (12, 20), (22, 30)]) == ([], 1, 0)  # first one cut -> one duplicate
    b = buckets.Buckets()
    msg = {"segments": [{"start": 0, "end": 10}, {"start": 12, "end": 20, "dep": True}, {"start": 22, "end": 30}]}
    b.add(msg, [{"start": 0, "end": 10}, {"start": 12, "end": 30}], False)
    r = b.report()["2-3"]
    assert r["omitted_segments"] == 1 and r["lost_dependencies"] == 1 and r["final_correct"] == 0.0
    base = {"long": {"n": 50, "final_correct": 0.5, "exact_segmentation": 0.5}}
    assert buckets.selection_guard({"long": {"n": 50, "final_correct": 0.3, "exact_segmentation": 0.6}}, base) == [("long", "final_correct", 0.5, 0.3)]
    assert buckets.selection_guard({"long": {"n": 50, "final_correct": 0.6, "exact_segmentation": 0.6}}, base) == []
