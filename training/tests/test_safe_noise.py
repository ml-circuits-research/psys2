import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from psys2_train.safe_noise import plain, plain_spans


def test_values_survive():
    assert plain("Go to coordinates 45.5 25.3.") == "go to coordinates 45.5 25.3"
    assert plain("Set speed to 1.5") == "set speed to 1.5"
    assert plain("Wake me at 7:30, please!") == "wake me at 7:30 please"
    assert plain("Play C# and Bb.") == "play c# and bb"
    assert plain("It is -3 degrees.") == "it is -3 degrees"


def test_quoted_payload_is_kept():
    t, spans = plain_spans('Type "Hello, world!" now.')
    assert t == 'type "Hello, world!" now'
    assert spans == [(5, 20)]


def test_plain_punctuation_removed():
    assert plain("Hello. How are you?") == "hello how are you"
