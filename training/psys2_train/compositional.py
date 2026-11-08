"""Compositional multi-command messages (review F4): a small program, verbalized several ways.

A *program* is: an initial context (`setup`: messages that were already said, the tab and the recent worlds), a list of
operations (`steps`: one canonical atomic command per operation, in order) and a *verbalization* of the whole program in one
message. The label (segments with their worlds) comes from the program, never from a string join. Families:

  shared_arg     "Make your eyes and body blue"             one segment (the rules expand the shared argument; the segmenter never copies it)
  ellipsis       "Eyes blue and body red"                   one segment (verb ellipsis; same reasoning)
  self_correct   "Make your eyes blue, no, green"           one segment, the final value is the program (steps hold only the final op)
  ref_created    "Draw a circle and put it above the square" two segments, the second refers to the object the first created or to the setup
  repeat_undo    "Move the house left twice, then undo"     two segments over a setup that created the object
  world_switch   "What is 3 plus 4, then open the map"      2-3 segments from different worlds

`family` is stored in every record; records of the older concatenation generator (multicmd.py) have family "concat" (or
"single"). Every record keeps its context: `session` = the setup messages (never an empty placeholder for families that need
one), `tab`, `recent_worlds`. Splits: a program's signature (family + normalized text) decides train/dev/test (80/10/10), so the
same verbalization never lands in two splits; regenerated each epoch (a new seed) the training programs differ every time.

Verification (scripts/verify-compositional.mjs): the rule formalizer runs the setup, then the `steps` one by one (each must be
parsed), then the composite text in a fresh session; the composite SOP must equal the steps' SOP in order. Whatever the rules
cannot parse is reported per family (it is the target of the R2 expansion), never dropped from training.
"""
from __future__ import annotations
import hashlib, random, re
from .safe_noise import plain

COLORS = ["red", "blue", "green", "yellow", "pink", "purple", "orange"]
KINDS = ["house", "tree", "circle", "square", "sun", "cloud", "star", "triangle", "flower", "car", "boat", "heart"]
PARTS = ["eyes", "body"]
DIRS = ["left", "right", "up", "down"]
RELS = ["above", "below", "next to"]
CITIES = ["Paris", "London", "Rome", "Berlin", "Madrid"]
NOTES = list("ABCDEFG")
ITEMS = ["milk", "bread", "eggs", "apples", "cheese"]
TAB = {"art.draw": "draw", "ui.avatar": "robot", "kids.arith": "arith", "geo.map": "map", "media.music": "music", "kids.tasks": "editor",
       "ui.shell": "robot", "docs.editor": "editor", "kids.time": "robot"}
FAMILIES = ["shared_arg", "ellipsis", "self_correct", "ref_created", "repeat_undo", "world_switch"]
FAMILY_W = [1.0, 1.0, 1.0, 1.5, 1.0, 1.5]
JOIN_FULL = [(" and ", 5), (", and ", 1), (" then ", 3), (", then ", 3), (" and then ", 2), (", ", 3), ("; ", 2), (". ", 4), (" after that ", 1), (", also ", 1)]
LEADS = ["", "", "", "", "please ", "can you ", "could you ", "hey, "]

an = lambda w: ("an " if w[0] in "aeiou" else "a ") + w


def _atomic(world, rng):
    """One atomic command of a world: (text, world). Used by world_switch."""
    if world == "art.draw":
        k, c = rng.choice(KINDS), rng.choice(COLORS)
        return rng.choice([f"Draw {an(k)}.", f"Draw {an(c)} {k}.", f"Paint {an(c)} {k}."])
    if world == "ui.avatar":
        return rng.choice([f"Make your {rng.choice(PARTS)} {rng.choice(COLORS)}.", f"Set your eyes to {rng.choice(['cyclops', 'visor', 'round', 'square'])}."])
    if world == "kids.arith":
        a, b = rng.randint(2, 19), rng.randint(2, 19); op = rng.choice(["plus", "minus", "times"])
        if op == "minus" and b > a:
            a, b = b, a
        return rng.choice([f"What is {a} {op} {b}?", f"How much is {a} {op} {b}?"])
    if world == "geo.map":
        return rng.choice([f"Show me {rng.choice(CITIES)} on the map.", f"Where is {rng.choice(CITIES)} on the map?", "Zoom in on the map."])
    if world == "media.music":
        return rng.choice([f"Play a {rng.choice(NOTES)} note.", f"Play the note {rng.choice(NOTES)}."])
    if world == "kids.tasks":
        return f"Add {rng.choice(ITEMS)} to my shopping list."
    if world == "ui.shell":
        return rng.choice(["Open the map.", "Switch to the draw tab."])
    if world == "docs.editor":
        return "Make the text bold."
    return "What time is it?"


SWITCH_WORLDS = ["art.draw", "ui.avatar", "kids.arith", "geo.map", "media.music", "kids.tasks", "ui.shell", "docs.editor", "kids.time"]


def _lc(s):
    return s[0].lower() + s[1:] if len(s) > 1 and s[0].isupper() and not s[1].isupper() and not s.startswith("I ") else s


def _cap(s):
    return s[0].upper() + s[1:]


def _ctx(rng, world, setup, *, extra_recent=()):
    tab = TAB.get(world) if rng.random() < 0.55 else rng.choice([None, *TAB.values()])
    recent = [w for w in extra_recent if w] + ([world] if rng.random() < 0.6 else [])
    recent = list(dict.fromkeys(recent))[-3:]
    return {"tab": tab, "recent_worlds": recent, "session": list(setup), "synthetic": True}


# ---- families: each returns {"parts": [(text, world)], "joined": bool, "setup": [..], "steps": [..], "world": ..} ----------
def fam_shared_arg(rng):
    if rng.random() < 0.6:
        p1, p2 = PARTS, None
        c = rng.choice(COLORS)
        t = rng.choice([f"Make your eyes and body {c}.", f"Make eyes and body {c}.", f"Make both your eyes and your body {c}.", f"Set your body and eyes to {c}.",
                        f"Change your eyes and body to {c}.", f"Eyes and body {c}."])
        steps = [f"Make your eyes {c}.", f"Make your body {c}."]
        if "body and eyes" in t:
            steps.reverse()
        return {"parts": [(t, "ui.avatar")], "joined": False, "setup": [], "steps": steps, "world": "ui.avatar"}
    k1, k2 = rng.sample(KINDS[:6], 2); c = rng.choice(COLORS)
    t = rng.choice([f"Make the {k1} and the {k2} {c}.", f"Make the {k1} and {k2} {c}.", f"Color the {k1} and the {k2} {c}."])
    return {"parts": [(t, "art.draw")], "joined": False, "setup": [f"Draw {an(k1)}.", f"Draw {an(k2)}."], "steps": [f"Make the {k1} {c}.", f"Make the {k2} {c}."], "world": "art.draw"}


def fam_ellipsis(rng):
    if rng.random() < 0.6:
        c1, c2 = rng.sample(COLORS, 2)
        t = rng.choice([f"Make your eyes {c1} and your body {c2}.", f"Make your eyes {c1} and body {c2}.", f"Eyes {c1} and body {c2}.", f"Make eyes {c1}, body {c2}.",
                        f"Your eyes {c1}, your body {c2}.", f"Set your eyes to {c1} and your body to {c2}."])
        return {"parts": [(t, "ui.avatar")], "joined": False, "setup": [], "steps": [f"Make your eyes {c1}.", f"Make your body {c2}."], "world": "ui.avatar"}
    k1, k2 = rng.sample(KINDS, 2); c1, c2 = rng.sample(COLORS, 2)
    t = rng.choice([f"Draw {an(c1)} {k1} and {an(c2)} {k2}.", f"Draw {an(c1)} {k1}, {an(c2)} {k2}.", f"Draw {an(c1)} {k1} and then {an(c2)} {k2}."])
    return {"parts": [(t, "art.draw")], "joined": False, "setup": [], "steps": [f"Draw {an(c1)} {k1}.", f"Draw {an(c2)} {k2}."], "world": "art.draw"}


def fam_self_correct(rng):
    r = rng.random()
    c1, c2 = rng.sample(COLORS, 2)
    fix = rng.choice(["no", "no wait", "I mean", "sorry", "actually", "make that"])
    if r < 0.5:
        part = rng.choice(PARTS)
        return {"parts": [(f"Make your {part} {c1}, {fix}, {c2}.", "ui.avatar")], "joined": False, "setup": [], "steps": [f"Make your {part} {c2}."], "world": "ui.avatar"}
    if r < 0.8:
        k = rng.choice(KINDS)
        return {"parts": [(f"Draw {an(c1)} {k}, {fix}, {c2}.", "art.draw")], "joined": False, "setup": [], "steps": [f"Draw {an(c2)} {k}."], "world": "art.draw"}
    a, b, d = rng.randint(2, 15), rng.randint(2, 15), rng.randint(2, 15)
    return {"parts": [(f"What is {a} plus {b}, {fix}, {a} plus {d}?", "kids.arith")], "joined": False, "setup": [], "steps": [f"What is {a} plus {d}?"], "world": "kids.arith"}


def fam_ref_created(rng):
    k1, k2 = rng.sample(KINDS, 2); rel = rng.choice(RELS); c = rng.choice(COLORS)
    r = rng.random()
    if r < 0.4:   # the second command refers to an object that exists in the setup
        s1 = rng.choice([f"Draw {an(k1)}", f"Draw {an(c)} {k1}"])
        s2 = rng.choice([f"put it {rel} the {k2}", f"place it {rel} the {k2}"])
        return {"parts": [(s1, "art.draw"), (s2, "art.draw")], "joined": True, "setup": [f"Draw {an(k2)}."], "steps": [s1 + ".", s2 + "."], "world": "art.draw"}
    if r < 0.7:   # refers to the object the first segment created
        s1 = f"Draw {an(k1)}"
        s2 = rng.choice([f"make it {c}", f"color it {c}", f"paint it {c}", "delete it", f"move it {rng.choice(DIRS)}"])
        verb = s2.split()[0]
        return {"parts": [(s1, "art.draw"), (s2, "art.draw")], "joined": True, "setup": [], "steps": [s1 + ".", s2 + "."], "world": "art.draw"}
    s1 = f"Draw {an(k1)}"
    s2 = rng.choice([f"put {an(k2)} {rel} it", f"add {an(k2)} {rel} it", f"draw {an(k2)} {rel} it"])
    return {"parts": [(s1, "art.draw"), (s2, "art.draw")], "joined": True, "setup": [], "steps": [s1 + ".", s2 + "."], "world": "art.draw"}


def fam_repeat_undo(rng):
    k = rng.choice(KINDS); d = rng.choice(DIRS)
    setup = [f"Draw {an(k)}."]
    r = rng.random()
    if r < 0.5:
        s1 = rng.choice([f"Move the {k} {d} twice", f"Move the {k} {d} two times", f"Move it {d} twice"])
        s2 = rng.choice(["undo", "undo that", "undo it", "never mind, undo"])
        return {"parts": [(s1, "art.draw"), (s2, "art.draw")], "joined": True, "setup": setup, "steps": [f"Move the {k} {d}.", f"Move the {k} {d}.", "Undo."], "world": "art.draw"}
    if r < 0.8:
        c = rng.choice(COLORS)
        s1 = rng.choice([f"Make the {k} {c}", f"Make it {c}", f"Color the {k} {c}"]); s2 = rng.choice(["undo", "undo that", "take it back"])
        return {"parts": [(s1, "art.draw"), (s2, "art.draw")], "joined": True, "setup": setup, "steps": [f"Make the {k} {c}.", "Undo."], "world": "art.draw"}
    s1 = f"Move the {k} {d}"; s2 = rng.choice([f"move it {d} again", f"and again {d}", f"move it {d} once more"])
    return {"parts": [(s1, "art.draw"), (s2, "art.draw")], "joined": True, "setup": setup, "steps": [f"Move the {k} {d}.", f"Move the {k} {d}."], "world": "art.draw"}


def fam_world_switch(rng):
    n = 3 if rng.random() < 0.25 else 2
    ws = rng.sample(SWITCH_WORLDS, n)
    segs = [(_atomic(w, rng), w) for w in ws]
    return {"parts": [(t.rstrip(".?!"), w) for t, w in segs], "joined": True, "setup": [], "steps": [t for t, _ in segs], "world": ws[0], "worlds": ws}


FAM_FN = {"shared_arg": fam_shared_arg, "ellipsis": fam_ellipsis, "self_correct": fam_self_correct, "ref_created": fam_ref_created, "repeat_undo": fam_repeat_undo,
          "world_switch": fam_world_switch}


def verbalize(prog, rng, plain_variant):
    """Program -> (text, segments [{start,end,text,world}]). Joiner/punctuation handling mirrors multicmd.build_message:
    a segment keeps its own final punctuation only when it is the last one or the joiner is ". "."""
    parts = prog["parts"]
    lead = rng.choice(LEADS)
    if not prog["joined"]:
        raw = parts[0][0]
        endc = raw[-1] if raw[-1] in ".?!" else ""
        t = raw.rstrip(".?!")
        if lead and not t.lower().startswith(("eyes", "your")):
            t = lead + _lc(t)
        if plain_variant:
            t = plain(t)
        else:
            t = _cap(t) + (endc if rng.random() < 0.8 else "")
        return t, [{"start": 0, "end": len(t), "text": t, "world": parts[0][1]}]
    text, segs, prev_period = "", [], False
    for i, (raw, w) in enumerate(parts):
        last = i == len(parts) - 1
        s = raw.rstrip(".?!")
        if i == 0 and lead:
            s = lead + _lc(s)
        j = None
        if not last:
            j = rng.choices([x[0] for x in JOIN_FULL], weights=[x[1] for x in JOIN_FULL])[0]
        period = j == ". "
        if period:
            s += "."
            j = " "
        if plain_variant:
            s = plain(s)
            if j is not None:
                j = " " + plain(j).strip() + " " if re.search(r"[a-z]", j) else " "
                j = re.sub(r"\s+", " ", j)
        elif i == 0 or prev_period:
            s = _cap(s)
        elif rng.random() < 0.5:
            s = _lc(s)
        if last and not plain_variant and raw[-1:] in ".?!" and rng.random() < 0.8:
            s += raw[-1]
        start = len(text); text += s
        segs.append({"start": start, "end": len(text), "text": s, "world": w})
        if j is not None:
            text += j
        prev_period = period
    return text, segs


def signature(family, text):
    return family + "|" + re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", text.lower())).strip()


def split_of(sig):
    h = int(hashlib.sha1(sig.encode()).hexdigest()[:8], 16) % 10
    return "test" if h == 0 else "dev" if h == 1 else "train"


def make_program(rng, family=None):
    """One program record (without id) for a random or given family."""
    family = family or rng.choices(FAMILIES, weights=FAMILY_W)[0]
    prog = FAM_FN[family](rng)
    plain_variant = rng.random() < 0.2
    text, segs = verbalize(prog, rng, plain_variant)
    for s in segs:
        s["alt_worlds"] = []; s["source_id"] = None
    ctx = _ctx(rng, prog["world"], prog["setup"], extra_recent=prog.get("worlds", [])[:0] or [])
    prog["steps"] = [_cap(x) for x in prog["steps"]]
    return {"text": text, "context": ctx, "variant": "plain" if plain_variant else "clean", "family": family, "n_segments": len(segs), "segments": segs,
            "program": {"setup": prog["setup"], "steps": prog["steps"]}}


def generate(n, split, seed, family=None):
    """n compositional programs whose signature falls in `split` (deterministic in seed)."""
    rng = random.Random(f"{seed}-{split}-{family}")
    out, seen = [], set()
    guard = 0
    while len(out) < n and guard < n * 400:
        guard += 1
        rec = make_program(rng, family)
        sig = signature(rec["family"], rec["text"])
        if split_of(sig) != split:
            continue
        if split != "train" and sig in seen:
            continue
        seen.add(sig)
        rec["id"] = f"cp-{split}-{len(out):06d}"
        out.append(rec)
    return out
