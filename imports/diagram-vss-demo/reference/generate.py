"""generate.py: the sketch world, the legend of the SOP Sketchpad demo written as a VSS world folder (legend.json, kinds.tsv,
world.json, split_hints.json, examples/*.sop) that the `sop` tool of ml-circuits-research/vss-demo checks, trains and exports.

One clause per sentence (the demo's rules segmenter cuts messages into clauses before any reader). Commands, questions, facts and
default rules are all events of one legend; question openers are turned into pseudo-verbs by the normalizer (how_many, is_there, which,
where_is, path_q, ...), so the predicate role decides the act exactly as it decides a command. Shape names are never in the lexicon: the
normalizer writes them as NAME tokens (n_<name>) and quoted labels as TEXT tokens (t_<words>), read through the legend's value patterns,
so a name or label never seen in training is read with sentence candidates.

Also writes eval/*.jsonl: the surface sentence, the shape names it mentions, and the gold frame, which the browser benchmark turns into
the demo's own wires with the same adaptor it applies to the VSS reading (docs/js/vss-adapter.js).
Run: python3 generate.py --out worlds/sketch [--n 8000] [--n_eval 300] [--seed 0]   (the sop tool comes from training/vss, or VSS_DEMO)"""
import argparse, collections, datetime, hashlib, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
VSS = os.environ.get("VSS_DEMO", os.path.join(os.path.dirname(HERE), "vss"))
sys.path.insert(0, os.path.join(VSS, "tool")); sys.path.insert(0, HERE)
import numpy as np
from sop import soplang
from sop.legend import sha256_file
from normalize import normalize

SHAPES = {"circle": "circles", "square": "squares", "rectangle": "rectangles", "triangle": "triangles", "diamond": "diamonds",
          "ellipse": "ellipses", "hexagon": "hexagons", "star": "stars"}
SURF_SHAPE = {"rectangle": ["rectangle", "box"], "ellipse": ["ellipse", "oval"], "circle": ["circle", "circle", "dot"]}
COLORS = ["red", "orange", "yellow", "gold", "lime", "green", "teal", "cyan", "blue", "navy", "indigo", "purple", "magenta", "pink", "brown", "gray", "black", "white"]
SIZES = ["tiny", "small", "medium", "large", "huge"]
REL_SURF = {"left_of": ["left of", "to the left of"], "right_of": ["right of", "to the right of"], "above": ["above", "over", "on top of"],
            "below": ["below", "under", "beneath"], "next_to": ["next to", "near", "beside"]}
REGION_SURF = {"center": ["in the center", "in the middle"], "top": ["at the top"], "bottom": ["at the bottom"], "left_side": ["on the left"],
               "right_side": ["on the right"], "top_left": ["in the top left", "in the top left corner"], "top_right": ["in the top right"],
               "bottom_left": ["in the bottom left"], "bottom_right": ["in the bottom right", "in the lower right"]}
DIRS = ["left", "right", "up", "down"]
LAYOUTS = {"row": "in a row", "column": "in a column", "grid": "in a grid", "ring": "in a circle"}
NAMES_TRAIN = ["Start", "Done", "Check", "Process", "Hub", "Alpha", "Beta", "Gamma", "Delta", "Main", "Core", "Gate", "Login", "Form", "Valid", "Home",
               "Error", "Sun", "Earth", "Mars", "Idle", "Ended", "Router", "Server", "Backup", "Laptop", "Printer", "Firewall", "Internet", "CEO",
               "Walls", "Roof", "Door", "Tree", "Cloud", "Ball", "Box1", "Node2", "Input", "Output", "Queue", "Cache", "Api", "Db", "Worker",
               "Leaf", "Root", "Top1", "Side", "A", "B", "C", "D", "X", "Y"]
NAMES_NEW = ["Gem", "Orbit", "Prism", "Nova", "Kiwi", "Atlas", "Zed", "Moon", "Venus", "Ops", "Dev", "Begin", "Finish", "Ledger", "Inbox",
             "E", "F", "Q", "Hub2", "Vault"]
TEXTS_TRAIN = ["ok?", "Validate", "yes", "no", "Enter password", "Dashboard", "retry", "db", "core", "start", "end", "save", "load", "send",
               "approve", "reject", "next", "back", "done", "step 1", "step 2", "user", "admin", "login", "pay", "ship", "cancel", "open", "close", "error"]
TEXTS_NEW = ["checkout", "upload", "refund", "step 3", "review", "archive", "sync", "notify"]
NUMS_TRAIN = [10, 20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150, 200]
NUMS_NEW = [35, 45, 90, 250]
NUM_WORDS = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six"}

EVENTS = {   # event -> verbs as the normalizer writes them (pseudo-verbs for question openers)
    "create": ["draw"], "delete": ["delete"], "move": ["move"], "set": ["make", "color"], "resize": ["resize", "scale", "bigger_v", "smaller_v"],
    "rename": ["rename"], "label": ["label"], "duplicate": ["duplicate"], "swap": ["swap"], "connect": ["connect"], "disconnect": ["disconnect"],
    "align": ["align"], "arrange": ["arrange"], "distribute": ["distribute", "space"], "toFront": ["bring"], "toBack": ["send"], "undo": ["undo"], "redo": ["redo"], "forget": ["forget"],
    "count": ["how_many"], "exists": ["is_there"], "list": ["which"], "property": ["what_color", "what_shape", "where_is", "how_big", "what_says"],
    "describe": ["describe"], "neighbors": ["neigh_q"], "path": ["path_q"], "reachable": ["reach_q"], "cycle": ["cycle_q"],
    "check": ["is_q"], "fact": ["is"], "rule": ["from_now_on"],
    "extreme": ["extreme_q"], "nearest": ["nearest_q"], "connected": ["connected_q"], "degree": ["degree_q"]}
ROLES = [("object", "which shape or shapes?"), ("shape", "which kind of shape?"), ("color", "which colour?"), ("size", "which size?"),
         ("name", "what is it called?"), ("text", "what text is written on it?"), ("relation", "where, relative to another shape?"),
         ("landmark", "relative to which shape?"), ("landmark2", "and which second shape?"), ("region", "where on the canvas?"),
         ("direction", "in which direction?"), ("amount", "how far?"), ("quantity", "how many?"), ("axis", "along which axis?"),
         ("layout", "in which arrangement?"), ("source", "from which shape?"), ("target", "to which shape?"), ("style", "with which line style?"),
         ("arrow", "which way does the line point?"), ("edge", "with which line?"), ("pairing", "connected how among themselves?"),
         ("notcolor", "which colour must they not have?"), ("depth", "to the front or to the back?"),
         ("superlative", "which extreme?"), ("comparison", "bigger or smaller than the other?")]
# LEGEND_EXT=1 (off by default; training/sketch/TRAIN_PLAN_1103.md): the forms of 2026-11-02 become legend events and roles of the VSS
# worlds: the help question (event `help`, pseudo-verb help_q, like how_many), the high-level layout operations (HIGH_LEVEL_OPS.md: one
# event each, the verb token is the action's own lower-cased name) and reverse; the roles of templates, free text, panels and help
# (LEGEND_EXT.md section 7: template / scheme / fill / layer / topic / aspect / property values, width / height numbers, items / items2 /
# parents set roles of texts, title a text). Updated IN PLACE here so that every consumer (msg_to_world.py legend and kinds, wires_for role
# order, train_cutter.py --worlds, front.py event_token) sees the same events; with the switch off nothing changes.
LEGEND_EXT = os.environ.get("LEGEND_EXT") == "1"
if LEGEND_EXT:
    EVENTS.update({"help": ["help_q"], "improve": ["improve"], "respace": ["respace"], "snap": ["snap"], "fit": ["fit"], "flip": ["flip"],
                   "sort": ["sort"], "groupBy": ["group_by"], "equalize": ["equalize"], "straighten": ["straighten"], "untangle": ["untangle"],
                   "reverse": ["reverse"]})
    ROLES += [("template", "which form (template)?"), ("items", "which texts, in order?"), ("items2", "which second list of texts?"),
              ("parents", "the parent of each item?"), ("title", "with which title?"), ("scheme", "in which colour scheme?"),
              ("width", "how wide?"), ("height", "how high?"), ("fill", "how filled?"), ("layer", "on which layer?"),
              ("property", "by which property?"), ("topic", "help about what?"), ("aspect", "what kind of help?"),
              ("kind", "shapes, arrows or groups?"), ("quantifier", "all of them?"),
              # CONVERT_FIX.md (2026-11-03): the gold keys that had no role in any world: outline (a colour or no_outline), at (x, y: two
              # numbers, "at 600,100"), linked (a shape: "a square connected to Approve", "how many shapes are linked to Vcc")
              ("outline", "with which outline colour?"), ("x", "at which x coordinate?"), ("y", "at which y coordinate?"),
              ("linked", "connected to which shape?")]

KINDS = {}
for s, p in SHAPES.items(): KINDS[s] = "SHAPE"; KINDS[p] = "SHAPE"
KINDS["shape"] = "SHAPE"; KINDS["shapes"] = "SHAPE"
for w in ["arrow", "line", "connection"]: KINDS[w] = "EDGE"
for w in COLORS: KINDS[w] = "COLOR"
for w in SIZES + ["bigger", "smaller"]: KINDS[w] = "SIZE"
for w in ["solid", "dashed", "dotted"]: KINDS[w] = "STYLE"
for w in ["two_way", "plain"]: KINDS[w] = "ARROW"
for w in list(REL_SURF) + ["between"]: KINDS[w] = "REL"
for w in REGION_SURF: KINDS[w] = "REGION"
for w in DIRS: KINDS[w] = "DIR"
for w in LAYOUTS: KINDS[w] = "LAYOUT"
for w in ["horizontally", "vertically"]: KINDS[w] = "AXIS"
for w in ["chain", "next", "each_other"]: KINDS[w] = "PAIR"
for w in COLORS: KINDS["not_" + w] = "NOTCOLOR"
for w in ["front", "back"]: KINDS[w] = "DEPTH"
for w in ["newest", "oldest"]: KINDS[w] = "RECENT"
SUPERS = ["biggest", "smallest", "leftmost", "rightmost", "topmost", "bottommost", "mostconnected", "leastconnected", "closest", "farthest"]
for w in SUPERS: KINDS[w] = "SUPER"
for w in ["connected", "linked", "joined", "attached"]: KINDS[w] = "connected"
for w in ["than", "be", "most", "one", "has", "have", "does", "connection"]: KINDS.setdefault(w, w)
KINDS["evenly"] = "evenly"
for vs in EVENTS.values():
    for v in vs: KINDS[v] = "VERB"
for w in ["a", "an", "the", "to", "from", "of", "in", "on", "at", "by", "with", "and", ",", ".", "?", "!", "named", "labeled", "into", "as",
          "are", "there", "be", "should", "px", "times", "it", "them", "everything", "canvas", "rules", "copies", "1", "one", "do", "does",
          "have", "has", "we", "i", "me", "now", "for", "that", "this", "say", "says", "default", "new", "shapes"]:
    KINDS.setdefault(w, w)
for w in ["all", "every", "each", "any"]: KINDS[w] = "QUANT"
for w in ["it", "them", "everything"]: KINDS[w] = "PRON"
for w in ["a", "an"]: KINDS[w] = "a"

LEXICON = set(KINDS)
PREFIXES = [("bare", ""), ("please", "please"), ("could", "could you"), ("can", "can you"), ("now", "now"), ("lets", "let's"), ("want", "I want you to")]


class Gen:
    def __init__(self, rng, names, texts, nums): self.r, self.names, self.texts, self.nums = rng, names, texts, nums
    def pick(self, xs): return xs[int(self.r.integers(len(xs)))]
    def coin(self, p=0.5): return self.r.random() < p
    def num(self, n): return NUM_WORDS[n] if n in NUM_WORDS and self.coin(0.5) else str(n)
    def sname(self, s): return self.pick(SURF_SHAPE.get(s, [s]))
    def name(self): return self.pick(self.names)

    def ref(self, name_p=0.75, plural=False, attr_p=0.5, pron_p=0.0, det_choices=("the",)):
        """a reference to existing shapes: a name, a pronoun, or a description (det + [colour] + shape)"""
        if pron_p and self.coin(pron_p): p = "them" if plural else "it"; return [p], {"head": p}
        if not plural and self.coin(name_p): n = self.name(); return [n], {"head": "n_" + n.lower()}
        s = self.pick(list(SHAPES)); head = SHAPES[s] if plural else s
        det = self.pick(list(det_choices)) if det_choices else None
        if det == "the" and not plural and self.coin(0.1): det = self.pick(["newest", "newest", "oldest"])
        words, spec = [], {"head": head}
        if det in ("newest", "oldest"): words += ["the", self.pick(["new", "last", "latest", "newest"]) if det == "newest" else self.pick(["first", "oldest"])]; spec["det"] = det
        elif det: words.append(det); spec["det"] = det
        if det == "all" and self.coin(0.3): words.append("the")
        if self.coin(attr_p): c = self.pick(COLORS); words.append(c); spec["attr"] = c
        sw = self.sname(s); words.append(sw + ("es" if plural and sw == "box" else "s" if plural and sw != s else "") if plural and sw != s else (head if plural else sw))
        return words, spec

    def place(self, allow_between=True):
        k = self.r.random()
        if k < 0.38:
            reg = self.pick(list(REGION_SURF)); return self.pick(REGION_SURF[reg]).split(), {"region": reg}
        if allow_between and k < 0.46:
            a, b = self.name(), self.name()
            while b == a: b = self.name()
            return ["between", a, "and", b], {"relation": "between", "landmark": {"head": "n_" + a.lower()}, "landmark2": {"head": "n_" + b.lower()}}
        rel = self.pick(list(REL_SURF)); lw, ls = self.ref(name_p=0.55, attr_p=0.6)
        return self.pick(REL_SURF[rel]).split() + lw, {"relation": rel, "landmark": ls}


TEMPLATES = collections.defaultdict(list)
def T(ev, w=1.0):
    def deco(f): TEMPLATES[ev].append((f.__name__, f, w)); return f
    return deco


def new_shape(g, plural=False, size_p=0.4, color_p=0.7):
    s = g.pick(list(SHAPES)); words, roles = [], {}
    spec = {"head": SHAPES[s] if plural else s}
    if g.coin(size_p): z = g.pick(SIZES); words.append(z); roles["size"] = z
    if g.coin(color_p): c = g.pick(COLORS); words.append(c); spec["attr"] = c
    sw = g.sname(s); words.append((sw + ("es" if sw == "box" else "s")) if plural and sw != s else (SHAPES[s] if plural else sw))
    roles["object"] = spec; return words, roles


@T("create", 6)
def cr(g):
    plural = g.coin(0.15); q = g.pick([2, 3, 4, 5]) if plural else None
    w, roles = new_shape(g, plural)
    words = [g.pick(["draw", "add", "create", "make", "put", "insert"])] + ([g.num(q)] if plural else ["an" if w[0][0] in "aeiou" else "a"]) + w
    if plural: roles["quantity"] = str(q)
    if not plural and g.coin(0.45): n = g.name(); words += [g.pick(["named", "called"]), n]; roles["name"] = "n_" + n.lower()
    if g.coin(0.25): t = g.pick(g.texts); words += [g.pick(["labeled", "labelled", "with the text", "saying"]), f'"{t}"']; roles["text"] = "t_" + slug(t)
    if g.coin(0.7): pw, pr = g.place(); words += pw; roles.update(pr)
    return words, roles

@T("create", 1)
def cr_loc_first(g):
    w, roles = new_shape(g); pw, pr = g.place(allow_between=False); roles.update(pr)
    return pw + [",", g.pick(["draw", "add"]), "a"] + w, roles

@T("delete", 2)
def de(g):
    plural = g.coin(0.3); w, s = g.ref(plural=plural, pron_p=0.1, det_choices=("all", "the") if plural else ("the",))
    return [g.pick(["delete", "remove", "erase", "get rid of"])] + w, {"object": s}

@T("move", 3)
def mv_place(g):
    w, s = g.ref(pron_p=0.1); pw, pr = g.place()
    return [g.pick(["move", "put", "place", "drag", "shift"])] + w + pw, {"object": s, **pr}

@T("move", 1.5)
def mv_dir(g):
    w, s = g.ref(pron_p=0.1); d = g.pick(DIRS)
    if g.coin(0.6):
        n = g.pick(g.nums); dw = ["to", "the", d] if d in ("left", "right") else [d]
        return [g.pick(["move", "shift", "push"])] + w + dw + ["by", str(n), g.pick(["px", "pixels"])], {"object": s, "direction": d, "amount": str(n)}
    return [g.pick(["move", "shift", "nudge" if False else "move"])] + w + (["to", "the", d] if d in ("left", "right") else [d]), {"object": s, "direction": d}

@T("set", 3)
def st_color(g):
    plural = g.coin(0.25); w, s = g.ref(plural=plural, pron_p=0.12, det_choices=("all", "the") if plural else ("the",)); c = g.pick(COLORS)
    v = g.pick(["make", "paint", "color", "turn", "colour"]); return [v] + w + [c], {"object": s, "color": c}

@T("set", 1)
def st_shape(g):
    w, s = g.ref(name_p=0.9, attr_p=0.2); sh = g.pick(list(SHAPES))
    return (["make"] + w + ["a" if sh[0] not in "aeiou" else "an", g.sname(sh)] if g.coin(0.6) else ["turn"] + w + ["into", "a" if sh[0] not in "aeiou" else "an", g.sname(sh)]), {"object": s, "shape": sh}

@T("set", 1.2)
def st_size(g):
    w, s = g.ref(pron_p=0.12); z = g.pick(SIZES + ["bigger", "smaller", "bigger"])
    sw = {"bigger": g.pick(["bigger", "larger", "twice as big", "a bit bigger"]), "smaller": g.pick(["smaller", "a bit smaller"])}.get(z, z)
    return ["make"] + w + sw.split(), {"object": s, "size": z}

@T("resize", 1)
def rs(g):
    w, s = g.ref(); v = g.pick(["shrink", "enlarge", "grow"])
    return [v] + w, {"object": s}

@T("rename", 1.5)
def rn(g):
    w, s = g.ref(name_p=0.8); n = g.name()
    return (["rename"] + w + [g.pick(["to", "as"]), n] if g.coin(0.7) else ["call"] + w + [n]), {"object": s, "name": "n_" + n.lower()}

@T("label", 1.2)
def lb(g):
    w, s = g.ref(pron_p=0.1); t = g.pick(g.texts)
    if g.coin(0.7): return ["label"] + w + [f'"{t}"'], {"object": s, "text": "t_" + slug(t)}
    return ["write", f'"{t}"', "on"] + w, {"object": s, "text": "t_" + slug(t)}

@T("duplicate", 1)
def dp(g):
    w, s = g.ref(name_p=0.9)
    if g.coin(0.4): q = g.pick([2, 3]); return ["make", g.num(q), "copies", "of"] + w if False else ["duplicate"] + w + [g.num(q), "times"], {"object": s, "quantity": str(q)}
    return [g.pick(["duplicate", "copy", "clone"])] + w, {"object": s}

@T("swap", 0.6)
def sw(g):
    a, b = g.name(), g.name()
    while b == a: b = g.name()
    return [g.pick(["swap", "exchange"]), a, "and", b], {"object": {"head": "n_" + a.lower()}, "target": {"head": "n_" + b.lower()}}

@T("connect", 4)
def cn(g):
    a, sa = g.ref(name_p=0.55, attr_p=0.6, pron_p=0.05); b, sb = g.ref(name_p=0.6, attr_p=0.6)
    words = [g.pick(["connect", "link", "join", "attach"])] + a + [g.pick(["to", "to", "with"])] + b; roles = {"source": sa, "target": sb}
    if g.coin(0.4):
        style = g.pick(["dashed", "dotted", None]); kind = g.pick(["arrow", "line", "arrow"]); arrow = g.pick([None, None, "two_way"]) if kind == "arrow" else "plain"
        ew = ["with", "a"]
        if arrow == "two_way": ew.append(g.pick(["two-way", "two way"])); roles["arrow"] = "two_way"
        elif kind == "line" and g.coin(0.4): ew.append("plain"); roles["arrow"] = "plain"
        if style: ew.append(style); roles["style"] = style
        ew.append(kind); roles["edge"] = {"head": kind}
        pass  # a plain line needs no arrow role: the adapter reads edge head "line" as no arrowhead
        if g.coin(0.3): t = g.pick(g.texts); ew += ["labeled", f'"{t}"']; roles["text"] = "t_" + slug(t)
        words += ew
    return words, roles

@T("connect", 1)
def cn_draw(g):
    a, b = g.name(), g.name()
    while b == a: b = g.name()
    style = g.pick(["dashed", "dotted", None]); words = ["draw", "a" if style else "an"] + ([style] if style else []) + ["arrow", "from", a, "to", b]
    roles = {"source": {"head": "n_" + a.lower()}, "target": {"head": "n_" + b.lower()}, "edge": {"head": "arrow"}}
    if style: roles["style"] = style
    return words, roles

@T("disconnect", 1)
def dc(g):
    a, b = g.name(), g.name()
    while b == a: b = g.name()
    f = g.pick(["disconnect {a} from {b}", "unlink {a} from {b}", "remove the arrow between {a} and {b}", "cut the link between {a} and {b}", "remove the arrow from {a} to {b}"])
    return f.format(a=a, b=b).split(), {"source": {"head": "n_" + a.lower()}, "target": {"head": "n_" + b.lower()}}

@T("align", 0.7)
def al(g):
    w, s = g.ref(plural=True, det_choices=("all", "the")) if g.coin(0.6) else (["everything"], {"head": "everything"}); ax = g.pick(["horizontally", "vertically"])
    return [g.pick(["align", "line up"])] + w + [ax], {"object": s, "axis": ax}

@T("arrange", 1)
def ar(g):
    lay = g.pick(list(LAYOUTS)); w, s = (["everything"], {"head": "everything"}) if g.coin(0.6) else g.ref(plural=True, det_choices=("all", "the"))
    return [g.pick(["arrange", "organize", "lay out"])] + w + LAYOUTS[lay].split(), {"object": s, "layout": lay}

@T("connect", 1.8)
def cn_pair(g):
    p = g.pick(["chain", "next", "each_other"]); w, s = g.ref(plural=p != "next", det_choices=("all", "the") if p != "next" else ("each", "every"), name_p=0, attr_p=0.5)
    if p == "next":
        sh = g.pick(list(SHAPES)); w = [g.pick(["each", "every"])] + ([g.pick(COLORS)] if g.coin(0.3) else []) + [sh]; s = {"head": sh, "det": w[0]}
        if len(w) == 3: s["attr"] = w[1]
        if g.coin(0.5) and len(w) == 2: c = g.pick(COLORS); w = [w[0], c, w[1]]; s["attr"] = c
        return ["connect"] + w + g.pick(["to the next", "to the next one"]).split(), {"source": s, "pairing": "next"}
    pw = {"chain": g.pick(["in a chain", "one after the other", "in sequence"]), "each_other": "to each other"}[p].split()
    return ["connect"] + w + pw, {"source": s, "pairing": p}

@T("distribute", 0.8)
def dsb(g):
    w, s = (["everything"], {"head": "everything"}) if g.coin(0.4) else g.ref(plural=True, det_choices=("all", "the"), name_p=0)
    ax = g.pick(["horizontally", "vertically", None])
    v = g.pick(["distribute", "space", "space out"])
    return v.split() + w + (["evenly"] if g.coin(0.6) else []) + ([ax] if ax else []), {"object": s, **({"axis": ax} if ax else {})}

@T("toFront", 0.5)
def tf(g):
    w, s = g.ref(pron_p=0.1); return ["bring"] + w + g.pick(["to the front", "to the front", "on top of the others"]).split(), {"object": s, "depth": "front"}
@T("toBack", 0.5)
def tb(g):
    w, s = g.ref(pron_p=0.1); return ["send"] + w + g.pick(["to the back", "behind the others"]).split(), {"object": s, "depth": "back"}

@T("delete", 0.8)
def de_not(g):
    sh = g.pick(list(SHAPES)); c = g.pick(COLORS)
    return [g.pick(["delete", "remove"]), g.pick(["the", "all", "all the"]), SHAPES[sh], g.pick(["that are not", "which are not"]), c], {"object": {"head": SHAPES[sh], "det": "the"}, "notcolor": "not_" + c}

@T("set", 0.6)
def st_not(g):
    sh = g.pick(list(SHAPES)); c, d = g.pick(COLORS), g.pick(COLORS)
    return ["make", "the", SHAPES[sh], "that are not", c, d], {"object": {"head": SHAPES[sh], "det": "the"}, "notcolor": "not_" + c, "color": d}

@T("undo", 0.6)
def ud(g): return [g.pick(["undo", "undo", "take that back", "revert"])], {}
@T("redo", 0.3)
def rd(g): return ["redo"], {}
@T("forget", 0.3)
def fg(g): return [g.pick(["forget the rules", "forget all rules", "forget the defaults"])], {"object": {"head": "rules"}}

def qfilter(g):
    """a plural description with optional place filter, for count / list / exists"""
    roles, words = {}, []
    s = g.pick(list(SHAPES) + ["shape", "shape"]); head = SHAPES.get(s, "shapes") if s != "shape" else "shapes"
    spec = {"head": head}
    if g.coin(0.5): c = g.pick(COLORS); words.append(c); spec["attr"] = c
    words.append(head); roles["object"] = spec
    if "attr" not in spec and g.coin(0.15): c = g.pick(COLORS); words += [g.pick(["that are not", "which are not"]), c]; roles["notcolor"] = "not_" + c
    elif g.coin(0.3):
        if g.coin(0.5): rel = g.pick(list(REL_SURF)); n = g.name(); words += g.pick(REL_SURF[rel]).split() + [n]; roles["relation"] = rel; roles["landmark"] = {"head": "n_" + n.lower()}
        else: reg = g.pick(list(REGION_SURF)); words += g.pick(REGION_SURF[reg]).split(); roles["region"] = reg
    return words, roles

@T("count", 2)
def qc(g):
    w, r = qfilter(g)
    return ["how", "many"] + w + (["are", "there"] if g.coin(0.6) else ["do", "we", "have"]) + ["?"], r
@T("exists", 1)
def qe(g):
    w, r = qfilter(g); sing = r["object"]["head"]
    for s, p in SHAPES.items():
        if p == sing and g.coin(0.5): w = [x if x != p else s for x in w]; r["object"]["head"] = s; w = ["a" if s[0] not in "aeiou" and "attr" not in r["object"] else "a"] + w; return ["is", "there"] + w + ["?"], r
    return ["are", "there", "any"] + w + ["?"], r
@T("list", 1.5)
def ql(g):
    w, r = qfilter(g)
    return [g.pick(["which", "list", "show", "list all"])] + w + (["are", "there"] if "relation" not in r and "region" not in r and g.coin(0.4) else []) + (["?"] if g.coin(0.6) else []), r
@T("property", 1.5)
def qp(g):
    n = g.name(); f = g.pick(["what color is {n} ?", "where is {n} ?", "how big is {n} ?", "what shape is {n} ?", "what does {n} say ?"])
    return f.format(n=n).split(), {"object": {"head": "n_" + n.lower()}}
@T("describe", 0.6)
def qd(g):
    if g.coin(0.4): n = g.name(); return ["describe", n], {"object": {"head": "n_" + n.lower()}}
    return g.pick(["describe the diagram", "describe the canvas", "what is on the canvas ?", "describe everything"]).split(), {"object": {"head": "canvas"}} if True else {}
@T("neighbors", 1.2)
def qn(g):
    n = g.name(); return (g.pick(["what is connected to", "which shapes are connected to", "what links to", "what are the neighbours of"]).split() + [n, "?"]), {"object": {"head": "n_" + n.lower()}}
@T("path", 1.2)
def qpa(g):
    a, b = g.name(), g.name()
    while b == a: b = g.name()
    return (g.pick(["is there a path from", "can I get from", "is there a route from"]).split() + [a, "to", b, "?"]), {"source": {"head": "n_" + a.lower()}, "target": {"head": "n_" + b.lower()}}
@T("reachable", 1)
def qr(g):
    n = g.name(); return (g.pick(["what can be reached from", "what is reachable from", "what comes after"]).split() + [n, "?"]), {"source": {"head": "n_" + n.lower()}}
@T("cycle", 0.6)
def qy(g): return g.pick(["are there any cycles ?", "is there a cycle ?", "is there a loop ?", "are there cycles ?"]).split(), {}
@T("check", 1.5)
def qk(g):
    n = g.name()
    if g.coin(0.5): c = g.pick(COLORS); return ["is", n, c, "?"], {"object": {"head": "n_" + n.lower()}, "color": c}
    rel = g.pick(list(REL_SURF)); m = g.name()
    while m == n: m = g.name()
    return ["is", n] + g.pick(REL_SURF[rel]).split() + [m, "?"], {"object": {"head": "n_" + n.lower()}, "relation": rel, "landmark": {"head": "n_" + m.lower()}}
@T("extreme", 1.2)
def qx(g):
    sup = g.pick(["biggest", "smallest", "leftmost", "rightmost", "topmost", "bottommost", "mostconnected", "leastconnected"])
    surf = {"biggest": g.pick(["the biggest", "the largest"]), "smallest": "the smallest", "leftmost": "the leftmost", "rightmost": "the rightmost",
            "topmost": g.pick(["the topmost", "the highest"]), "bottommost": g.pick(["the bottommost", "the lowest"]),
            "mostconnected": "the most connections", "leastconnected": g.pick(["the fewest connections", "the least connections"])}[sup]
    s = g.pick(list(SHAPES) + ["shape", "shape"]); spec = {"head": s}; w = []
    if g.coin(0.3): c = g.pick(COLORS); w.append(c); spec["attr"] = c
    w.append(g.sname(s) if s in SHAPES else "shape")
    verb = ["has"] if "connections" in surf else ["is"]
    tail = [] if "connections" in surf or g.coin(0.6) else ["one"]
    return ["which"] + w + verb + surf.split() + tail + ["?"], {"object": spec, "superlative": sup}
@T("nearest", 1)
def qne(g):
    sup = g.pick(["closest", "farthest"]); n = g.name(); s = g.pick(list(SHAPES) + ["shape"]); spec = {"head": s}; w = []
    if g.coin(0.3): c = g.pick(COLORS); w.append(c); spec["attr"] = c
    w.append(g.sname(s) if s in SHAPES else "shape")
    sw = {"closest": g.pick(["closest", "nearest"]), "farthest": g.pick(["farthest", "furthest"])}[sup]
    return ["which"] + w + ["is", sw, g.pick(["to", "from"]), n, "?"], {"object": spec, "superlative": sup, "landmark": {"head": "n_" + n.lower()}}
@T("connected", 1)
def qcn(g):
    a, b = g.name(), g.name()
    while b == a: b = g.name()
    f = g.pick(["are {a} and {b} connected ?", "is {a} connected to {b} ?", "is {a} linked to {b} ?", "are {a} and {b} linked ?", "is {a} attached to {b} ?"])
    return f.format(a=a, b=b).split(), {"object": {"head": "n_" + a.lower()}, "landmark": {"head": "n_" + b.lower()}}
@T("degree", 0.8)
def qdg(g):
    n = g.name(); f = g.pick(["how many connections does {n} have ?", "how many arrows does {n} have ?", "how many connections has {n} got ?"])
    return f.format(n=n).split(), {"object": {"head": "n_" + n.lower()}}
@T("check", 0.8)
def qcmp(g):
    a, b = g.name(), g.name()
    while b == a: b = g.name()
    c = g.pick(["bigger", "smaller"]); cw = {"bigger": g.pick(["bigger", "larger"]), "smaller": "smaller"}[c]
    return ["is", a, cw, "than", b, "?"], {"object": {"head": "n_" + a.lower()}, "comparison": c, "landmark": {"head": "n_" + b.lower()}}

@T("fact", 1)
def fa(g):
    n = g.name()
    if g.coin(0.5): c = g.pick(COLORS); return [n, "is", c], {"object": {"head": "n_" + n.lower()}, "color": c}
    rel = g.pick(list(REL_SURF)); m = g.name()
    while m == n: m = g.name()
    return [n, "is"] + g.pick(REL_SURF[rel]).split() + [m], {"object": {"head": "n_" + n.lower()}, "relation": rel, "landmark": {"head": "n_" + m.lower()}}
@T("rule", 0.8)
def ru(g):
    s = g.pick(list(SHAPES) + ["shape"]); head = SHAPES.get(s, "shapes"); roles = {"object": {"head": head}}
    w = ["from now on", "by default"]; pre = g.pick(w).split() + ([","] if g.coin(0.5) else [])
    if g.coin(0.6): c = g.pick(COLORS); roles["color"] = c; return pre + [head, g.pick(["are", "should be"]), c], roles
    z = g.pick(SIZES); roles["size"] = z; return pre + [head, g.pick(["are", "should be"]), z], roles


def slug(s):
    import re; return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_") or "x"


def legend_dict():
    roles_of = collections.defaultdict(set)
    g = Gen(np.random.default_rng(7), NAMES_TRAIN, TEXTS_TRAIN, NUMS_TRAIN)
    for ev, ts in TEMPLATES.items():
        for _, f, _ in ts:
            for _ in range(300): roles_of[ev] |= set(f(g)[1])
    required = {"create": ["object"], "delete": ["object"], "move": ["object"], "set": ["object"], "resize": ["object"], "rename": ["object", "name"],
                "label": ["object", "text"], "duplicate": ["object"], "swap": ["object", "target"], "connect": ["source", "target"],
                "disconnect": ["source", "target"], "align": ["object"], "arrange": ["object"], "property": ["object"], "neighbors": ["object"],
                "path": ["source", "target"], "reachable": ["source"], "check": ["object"], "fact": ["object"], "rule": ["object"]}
    return {"version": 1, "roles": [{"id": r, "question": q} for r, q in ROLES],
            "events": [{"id": e, "verbs": vs, "roles": [r for r, _ in ROLES if r in roles_of[e]], "required": required.get(e, [])} for e, vs in EVENTS.items()],
            "operators": ["not"], "moods": ["command"], "kinds": {"source": "lexicon", "lexicon": "kinds.tsv"},
            "values": [{"kind": "NUM", "pattern": "\\d+"}, {"kind": "NAME", "pattern": "n_[a-z0-9_]+"}, {"kind": "TEXT", "pattern": "t_[a-z0-9_]+"}],
            "reader": {"predicate_role": True, "occupancy_marker": True, "definite_dets": ["the"],
                       "gates_given": {"open": ["to", "from", "of", "in", "on", "at", "by", "with", "into", "as", "and", ",", "named", "labeled"], "closed": []}}}


def wires_for(ev, roles, text, template, ids, world="sketch", source="generator"):
    w = soplang.Wire(next(ids), ev); later = []
    for r in [x for x, _ in ROLES] + [x for x in roles if x not in dict(ROLES)]:
        if r not in roles: continue
        v = roles[r]
        if isinstance(v, dict):
            en = soplang.Wire(next(ids), "entity"); en.set("head", v["head"])
            if v.get("attr"): en.set("attr", v["attr"])
            if v.get("det"): en.set("det", v["det"])
            later.append(en); w.set(r, ("ref", en.id))
        elif isinstance(v, list):   # a set role (world real: members / targets): one entity per member, joined with &
            refs = []
            for x in v:
                en = soplang.Wire(next(ids), "entity"); en.set("head", x["head"]); later.append(en); refs.append(("ref", en.id))
            w.set(r, ("&", refs))
        else: w.set(r, str(v))
    w.lines = [soplang.Line("_text", text), soplang.Line("_world", world), soplang.Line("_source", source), soplang.Line("_template", template), soplang.Line("_mood", "command")] + w.lines
    return [w] + later


def realise(g, ev, tid, f, prefix):
    words, roles = f(g)
    pid, ptxt = prefix
    if ev in ("count", "exists", "list", "property", "describe", "neighbors", "path", "reachable", "cycle", "check", "fact", "rule", "extreme", "nearest", "connected", "degree"): pid, ptxt = "bare", ""
    surface = (ptxt + " " if ptxt else "") + " ".join(words)
    surface = surface.replace(" ?", "?").replace(" ,", ",")
    if g.coin(0.15) and not surface.endswith("?"): surface += "."
    toks, info = normalize(surface, LEXICON, g.names)
    return surface, " ".join(toks), roles, f"{ev}.{tid}.{pid}", info


def build(out, n, n_eval, seed):
    combos = [(ev, tid, f, w, p) for ev, ts in TEMPLATES.items() for tid, f, w in ts for p in PREFIXES]
    h = lambda s: int(hashlib.sha256(f"{seed}:{s}".encode()).hexdigest()[:8], 16) / 2 ** 32
    held = {f"{ev}.{tid}.{p[0]}" for ev, tid, f, w, p in combos if p[0] not in ("bare",) and h(f"{ev}.{tid}.{p[0]}") < 0.15}
    tr = [c for c in combos if f"{c[0]}.{c[1]}.{c[4][0]}" not in held]; ho = [c for c in combos if f"{c[0]}.{c[1]}.{c[4][0]}" in held]
    def draw(cs, k, names, texts, nums, rs):
        g = Gen(rs, names, texts, nums); ws = np.array([c[3] / len(PREFIXES) for c in cs]); ws /= ws.sum(); rows = []
        for _ in range(k):
            ev, tid, f, w, p = cs[int(rs.choice(len(cs), p=ws))]; rows.append((ev,) + realise(g, ev, tid, f, p))
        return rows
    train = draw(tr, n, NAMES_TRAIN, TEXTS_TRAIN, NUMS_TRAIN, np.random.default_rng(100 + seed))
    ev_seen = draw(tr, n_eval, NAMES_TRAIN, TEXTS_TRAIN, NUMS_TRAIN, np.random.default_rng(500 + seed))
    ev_new = draw(tr, n_eval, NAMES_NEW, TEXTS_NEW, NUMS_NEW, np.random.default_rng(600 + seed))
    ev_form = draw(ho or tr, n_eval, NAMES_TRAIN, TEXTS_TRAIN, NUMS_TRAIN, np.random.default_rng(700 + seed)) if ho else []
    legend = legend_dict()
    for d in ("examples", "raw", "audit", "model", "runs", "versions", "requests"): os.makedirs(os.path.join(out, d), exist_ok=True)
    lp = os.path.join(out, "legend.json"); json.dump(legend, open(lp, "w"), indent=1)
    with open(os.path.join(out, "kinds.tsv"), "w") as fh:
        fh.write("# word\tkind: the sketch world's categories (GIVEN); names, labels and numbers come from the legend's value patterns\n")
        for w in sorted(KINDS): fh.write(f"{w}\t{KINDS[w]}\n")
    sha = sha256_file(lp)
    json.dump({"name": "sketch", "language": "en", "description": "SOP Sketchpad legend (diagram-vss-demo)", "created": datetime.date.today().isoformat(),
               "version": 1, "min_examples": 500, "max_versions_per_run": 3, "second_look_escalate": 0.05, "second_look_retrain": 0.05}, open(os.path.join(out, "world.json"), "w"), indent=1)
    def write(fname, rows):
        doc = soplang.Doc(directives=[("world", "sketch", None), ("legend", sha, None), ("generated", f"training/sketch/generate.py seed {seed}", None)]); k = 0
        for ev, surface, text, roles, template, info in rows:
            ids = iter(f"w{k + i}" for i in range(1, 100)); ws = wires_for(ev, roles, text, template, ids); k += len(ws); doc.wires += ws
        open(os.path.join(out, "examples", fname), "w").write(soplang.write(doc))
    write("train.sop", train); write("eval_new_identities.sop", ev_new)
    if ev_form: write("eval_heldout_formulations.sop", ev_form)
    hints = {"heldout_sentence_share": 0.1, "new_identities": ["n_" + x.lower() for x in NAMES_NEW] + ["t_" + slug(x) for x in TEXTS_NEW] + [str(x) for x in NUMS_NEW],
             "file_splits": {"examples/eval_new_identities.sop": "new_identities", **({"examples/eval_heldout_formulations.sop": "heldout_formulations"} if ev_form else {})},
             "template_splits": {"heldout_formulations": sorted(held)},
             "protocol": "sketch world: one clause per sentence; held-out formulations = (template, prefix) combinations; new identities = names, labels and numbers never in training"}
    json.dump(hints, open(os.path.join(out, "split_hints.json"), "w"), indent=1)
    open(os.path.join(out, "raw", "sentences.txt"), "w").write("\n".join(r[1] for r in train[:2000]) + "\n")
    if not os.path.exists(os.path.join(out, "status.json")): json.dump({"label": None, "note": "never trained"}, open(os.path.join(out, "status.json"), "w"))
    ed = os.path.join(HERE, "eval"); os.makedirs(ed, exist_ok=True)
    for fname, rows in (("seen.jsonl", ev_seen), ("new_identities.jsonl", ev_new), ("heldout_formulations.jsonl", ev_form)):
        with open(os.path.join(ed, fname), "w") as fh:
            for ev, surface, text, roles, template, info in rows:
                names = sorted({v for v in info["names"].values()})
                fh.write(json.dumps({"text": surface, "normalized": text, "event": ev, "roles": roles, "names": names, "template": template}) + "\n")
    cnt = collections.Counter(r[0] for r in train)
    print(f"sketch world -> {out}: train {len(train)}, eval seen {len(ev_seen)}, new identities {len(ev_new)}, held-out formulations {len(ev_form)}; legend {sha[:19]}; kinds {len(KINDS)}")
    print("events:", dict(cnt))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=os.path.join(HERE, "worlds", "sketch")); ap.add_argument("--n", type=int, default=8000)
    ap.add_argument("--n_eval", type=int, default=300); ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args(); build(a.out, a.n, a.n_eval, a.seed)
