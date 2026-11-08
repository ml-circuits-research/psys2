import sys, json, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from psys2_train.safe_noise import plain, plain_spans

# The fixtures are shared with the JavaScript port (scripts/lib/safe-noise.mjs, tests/safe-noise.test.mjs): both must give the same answers.
FIX = json.loads((pathlib.Path(__file__).parent / "fixtures" / "safe_noise.json").read_text(encoding="utf-8"))


def test_shared_fixtures_plain():
    for src, want in FIX["plain"]:
        assert plain(src) == want, src


def test_shared_fixtures_spans():
    for src, want, spans in FIX["plain_spans"]:
        t, got = plain_spans(src)
        assert t == want
        assert [list(s) for s in got] == spans


def test_values_survive():
    assert plain("Go to coordinates 45.5 25.3.") == "go to coordinates 45.5 25.3"
    assert plain("It is -3 degrees.") == "it is -3 degrees"
