"""Controlled exposure for the dispatcher's heads (review F6): step budgets, source/world/phenomenon sampling, a log of what was shown.

Principles (AGENTS.md data principle): every training row is kept and seen in every epoch. On top of that a fixed share of each
epoch is *reserved* for the cases that teach the most:
  failures      rows the model got wrong at the last probe (recent failures),
  contrastive   near-miss rows: a row whose text differs from another row of a DIFFERENT world by one word
                (set/increase, before/after, three/thirteen, ...), mined once from the data,
  replay        rows that were solved at the last probe (a replay pool, so fixing failures does not forget solved cases),
  floor         rows of under-represented sources (generators are ~78% of the routing rows), repeated up to a per-source floor.
`EpochSampler.epoch()` returns the index list of one epoch and the exact counts shown per kind/source/world/phenomenon;
`ShownLog` accumulates them for the run's metrics. `Budget` gives every head an explicit number of optimizer-step batches.
"""
from __future__ import annotations
import random, re
from collections import Counter, defaultdict

PHENOMENA = {
    "set_increase": r"\b(set|increase|decrease|raise|lower|reduce)\b",
    "before_after": r"\b(before|after)\b",
    "number_words": r"\b(three|thirteen|four|fourteen|five|fifteen|six|sixteen|seven|seventeen|eight|eighteen|nine|nineteen|twenty|thirty|forty|fifty)\b",
    "question": r"(\?\s*$)|(^\s*(what|which|who|where|when|why|how|is|are|do|does|can|could|did)\b)",
    "command": r"^\s*(please\s+)?(set|make|draw|add|open|show|play|put|move|delete|remove|turn|go|start|change|select|create|give|take)\b",
}
_PHEN_RE = {k: re.compile(v, re.I) for k, v in PHENOMENA.items()}
_TOK = re.compile(r"[a-z0-9]+")


def phenomena(text):
    return [k for k, r in _PHEN_RE.items() if r.search(text)]


def tokens(text):
    return _TOK.findall(text.lower())


def mine_near_misses(rows, max_len=14, max_group=400):
    """Indices of rows that have a near-miss in another world: same length, exactly one differing word, different `world`.
    Only rows with a phenomenon tag are considered (set/increase, before/after, number words, question vs command)."""
    groups = defaultdict(list)
    for i, r in enumerate(rows):
        t = tokens(r["text"])
        if not t or len(t) > max_len or not phenomena(r["text"]):
            continue
        for p in range(len(t)):
            groups[(p, tuple(t[:p]), tuple(t[p + 1:]))].append(i)
    hit = set()
    for ids in groups.values():
        if len(ids) < 2 or len(ids) > max_group:
            continue
        by_text = {}
        for i in ids:
            by_text.setdefault(tuple(tokens(rows[i]["text"])), []).append(i)
        if len(by_text) < 2:
            continue
        worlds = {rows[i]["world"] for i in ids}
        if len(worlds) < 2:
            continue
        hit.update(ids)
    return sorted(hit)


class Budget:
    """`n` batches spread evenly over `total` optimizer steps: `active(step)` is True on exactly n of the total steps."""

    def __init__(self, total, n):
        self.total, self.n, self.used = total, max(0, min(int(n), total)), 0

    def active(self, step):
        a = (step + 1) * self.n // self.total > step * self.n // self.total
        self.used += a
        return a


class ShownLog:
    """Counts of examples actually shown to a head, by kind (base/failure/contrastive/replay/floor), source, world and phenomenon/family."""

    def __init__(self):
        self.c = defaultdict(Counter)

    def add(self, head, kind, source=None, world=None, tags=()):
        d = self.c[head]
        d["total"] += 1
        d[f"kind:{kind}"] += 1
        if source:
            d[f"source:{source}"] += 1
        if world:
            d[f"world:{world}"] += 1
        for t in tags:
            d[f"tag:{t}"] += 1

    def summary(self):
        return {h: dict(sorted(c.items())) for h, c in self.c.items()}


class EpochSampler:
    """Routing rows sampler. `rows` carry `text`, `world`, `source`. `focus_frac` = reserved share of an epoch on top of all rows."""

    def __init__(self, rows, seed=1, focus_frac=0.15, source_floor=None, mix=(0.4, 0.4, 0.2)):
        self.rows, self.focus_frac, self.mix = rows, focus_frac, mix
        self.source_floor = source_floor or {}
        self.rng = random.Random(seed)
        self.tags = [phenomena(r["text"]) for r in rows]
        self.contrastive = mine_near_misses(rows)
        self.by_source = defaultdict(list)
        for i, r in enumerate(rows):
            self.by_source[r.get("source", "?")].append(i)

    def epoch(self, failures=(), solved=()):
        """-> (indices in the order to feed, [(kind, index)] counts source). Every row appears at least once."""
        n = len(self.rows)
        plan = [("base", i) for i in range(n)]
        extra = int(n * self.focus_frac)
        want = [int(extra * m) for m in self.mix]
        pools = [("failure", list(failures)), ("contrastive", self.contrastive), ("replay", list(solved))]
        spill = 0
        for (kind, pool), w in zip(pools, want):
            w += spill; spill = 0
            if not pool:
                spill = w; continue
            plan += [(kind, self.rng.choice(pool)) for _ in range(w)]
        if spill and self.contrastive:   # nothing left to spend on: more contrastive exposure
            plan += [("contrastive", self.rng.choice(self.contrastive)) for _ in range(spill)]
        total = len(plan)
        for src, floor in self.source_floor.items():
            ids = self.by_source.get(src, [])
            have = sum(1 for _, i in plan if self.rows[i].get("source") == src)
            need = int(-(-(floor * total - have) // (1 - floor)))   # share >= floor of the final plan
            if ids and need > 0:
                need = min(need, 3 * len(ids))
                plan += [("floor", self.rng.choice(ids)) for _ in range(need)]
        self.rng.shuffle(plan)
        return plan

    def inject(self, failures, solved, n):
        """Extra plan entries to add to the rest of the running epoch right after a probe: 60% recent failures, 40% replay."""
        out = []
        if failures:
            out += [("failure", self.rng.choice(failures)) for _ in range(int(n * 0.6))]
        pool = solved or self.contrastive
        if pool:
            out += [("replay" if solved else "contrastive", self.rng.choice(pool)) for _ in range(n - len(out))]
        return out

    def log_plan(self, log, plan, head="routing"):
        for kind, i in plan:
            r = self.rows[i]
            log.add(head, kind, r.get("source"), r.get("world"), self.tags[i])
