"""Minimal SOP Lang circuit reader and the circuit <-> (skeleton, slots) conversion used as the training target."""
from __future__ import annotations
import re
from collections import Counter

BOOKKEEPING = {"core.via", "core.source", "core.seq", "core.in", "core.agent"}
WIRE_RE = re.compile(r"@(\S+)\s+(\S+)")
ENTRY_RE = re.compile(r'([A-Za-z_][\w.\-]*)=("(?:[^"\\]|\\.)*"|\S+)')
NUMBER_WORDS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
                "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve"}
NONE_INTENT = "NONE"


def short_key(key: str) -> str:
    """Last dotted segment of a key: `kids.arith.holding.owner` and generator-style `owner` both give `owner`."""
    return key.rsplit(".", 1)[-1]


def parse_circuit(src: str):
    """-> list of (wire_id, type, [(key, raw_value)]) in source order."""
    wires, cur = [], None
    for line in (src or "").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        m = WIRE_RE.match(s)
        if m and s.startswith("@"):
            cur = (m.group(1), m.group(2), [])
            wires.append(cur)
            s = s[m.end():]
        if cur is not None:
            cur[2].extend(ENTRY_RE.findall(s))
    return wires


def normalize(src: str):
    """Normalized wires: core.agent wires and bookkeeping keys dropped, keys shortened, entries sorted, wire ids -> position.
    Returns list of (type, [(shortkey, raw_value)])."""
    wires = [w for w in parse_circuit(src) if w[1] != "core.agent"]
    idx = {w[0]: f"#{i}" for i, w in enumerate(wires)}
    out = []
    for _, typ, entries in wires:
        es = []
        for k, v in entries:
            if k in BOOKKEEPING:
                continue
            if v.startswith("$") and v[1:] in idx:
                v = "$" + idx[v[1:]]
            es.append((short_key(k), v))
        out.append((typ, sorted(es)))
    return out


def render(wires) -> str:
    return "\n".join(t + " " + " ".join(f"{k}={v}" for k, v in es) for t, es in wires)


def canonical_text(src: str) -> str:
    return render(normalize(src))


def _surfaces(raw: str):
    """Surface forms (lowercase) a raw value may take in the text."""
    if raw.startswith("$e."):
        base = raw[3:].replace("_", " ")
        return [base]
    if raw.startswith("$"):
        return []
    if raw.startswith('"'):
        base = raw[1:-1].lower()
    else:
        base = raw.lower().replace("_", " ")
    forms = [base]
    if re.fullmatch(r"-?\d+", base) and base.lstrip("-") in NUMBER_WORDS:
        forms.append(NUMBER_WORDS[base.lstrip("-")])
    if re.fullmatch(r"[a-z ]+", base):
        forms += [base + "s", base + "es"] + ([base[:-1] + "ies"] if base.endswith("y") else [])
    return forms


def align(text: str, target: str):
    """Aligns slot values of `target` to character spans of `text`.
    Returns (skeleton, slots) where skeleton is the circuit text with `{wI.key}` placeholders for aligned values and
    slots is a list of (slot_name, start, end). Unaligned values stay constants of the skeleton."""
    low = text.lower()
    taken: list[tuple[int, int]] = []
    slots, lines = [], []
    for wi, (typ, entries) in enumerate(normalize(target)):
        parts = []
        for k, raw in entries:
            span = None
            for form in sorted(set(_surfaces(raw)), key=lambda f: -len(f)):
                if len(form) < 2 and not form.isdigit():
                    continue
                for m in re.finditer(r"(?<![a-z0-9])" + re.escape(form) + r"(?![a-z0-9])", low):
                    if all(m.end() <= a or m.start() >= b for a, b in taken):
                        span = (m.start(), m.end())
                        break
                if span:
                    break
            if span:
                taken.append(span)
                name = f"w{wi}.{k}"
                slots.append((name, span[0], span[1]))
                parts.append(f"{k}={{{name}}}")
            else:
                parts.append(f"{k}={raw}")
        lines.append(typ + " " + " ".join(parts))
    return "\n".join(lines), slots


class ValueMap:
    """Surface -> circuit value, learned from the training set (per short key); falls back on the key's dominant kind."""

    def __init__(self):
        self.by_surface: dict[str, Counter] = {}
        self.kinds: dict[str, Counter] = {}

    @staticmethod
    def kind_of(raw: str) -> str:
        if raw.startswith("$e."):
            return "entity"
        if raw.startswith('"'):
            return "string"
        return "number" if re.fullmatch(r"-?\d+(\.\d+)?", raw) else "word"

    def fit(self, examples):
        for ex in examples:
            vals = {f"w{wi}.{k}": raw for wi, (_, es) in enumerate(normalize(ex["target_raw"])) for k, raw in es}
            for name, a, b in ex["slots"]:
                raw = vals.get(name)
                if raw is None:
                    continue
                key = name.split(".", 1)[1]
                self.by_surface.setdefault(f"{key}\u0000{ex['text'][a:b].lower()}", Counter())[raw] += 1
                self.kinds.setdefault(key, Counter())[self.kind_of(raw)] += 1
        return self

    def value(self, key: str, surface: str) -> str:
        s = surface.lower().strip()
        c = self.by_surface.get(f"{key}\u0000{s}")
        if c:
            return c.most_common(1)[0][0]
        kind = self.kinds.get(key, Counter({"word": 1})).most_common(1)[0][0]
        if kind == "entity":
            return "$e." + s.replace(" ", "_")
        if kind == "string":
            return '"' + surface.strip() + '"'
        if kind == "number":
            return s
        return s.replace(" ", "_")


def decode(skeleton: str, filled: dict[str, str], vmap: ValueMap) -> str:
    """Skeleton + {slot name: surface text} -> normalized circuit text (placeholders left in place when a slot is missing)."""
    def sub(m):
        name = m.group(1)
        return vmap.value(name.split(".", 1)[1], filled[name]) if name in filled else m.group(0)
    return re.sub(r"\{(w\d+\.[\w\-]+)\}", sub, skeleton)
