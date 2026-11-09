"""msg_to_world.py: the VSS world `real` (worlds/real), built ONLY from the legend and the annotated training messages
(llm_train/*_msg/msg_*.jsonl), VSS_READER_SPEC.md section 2. No templates, no hand-written word lists.

- The front end (front.py) is LEARNED from the same messages: segmenter, value n-grams, trigger rules (thresholds: front_params.json,
  chosen on held-out training messages by select_front.py). It is written to worlds/real/front.json and exported with the model.
- One training row per gold wire: its span normalized by the learned front end, its event, and its roles located in the span
  (llm_to_world.convert, soft: a role whose words are not in the span is left out and counted; no row is dropped for that).
  `$new` resolves to the name created earlier in the same message (or a pronoun in the span). Lists of shapes fill the set roles
  `members` / `targets`.
- Kinds: a legend value token -> the kind of its legend question (front.value_kinds); an event token -> VERB; every other token seen at
  least --freq times in the training spans -> a kind of its own; all other words -> no entry (the reader's kind `unknown`).
- Rows are dropped only when they cannot be trained at all (no event token and no role: a zero target); they are counted.
- Negative examples (off by default; NEGATIVES=1 on; plan step 1 failed its criterion, ERROR_ANALYSIS.md): every sentence outside the annotated spans whose normalized form carries an
  action token becomes a wire of that event with no roles and `_negative=true` (target = minus its compiled state, vss-demo R81).
Writes worlds/real/{legend.json, kinds.tsv, world.json, split_hints.json, front.json, examples/train.sop} and llm_train/REAL_WORLD.md.
KINDMAP=<file.json> (off by default; diagnosis_kinds/KINDS.md): the kinds of the words that are neither legend value tokens nor event
tokens come from that kind map ({"map": {word: kind}}) instead of "seen >= --freq times -> own kind"; the training rows do not change.
WORLD_EVENTS=<comma list of events> (off by default; a micro-world of the composer, docs/js/vss-composer.js, research/hier/HIER.md):
only the rows of those events AND a legend that lists only those events (HIER.md trap 1: with FAMILY the legend keeps every event, so
another event's token can become this world's predicate). The kinds (lexicon) and the front end stay those learned from all messages
(an event token of another event keeps the kind VERB but is no predicate of this world). Needs --out (never worlds/real); REAL_WORLD.md
is written into the output folder, llm_train/REAL_WORLD.md is not touched; the world's name is the output folder's name (sop train
reads it from the folder). Not combined with FAMILY.
FRONT_ROWS=world (off by default; needs WORLD_EVENTS; owner's decision 2026-11-01, ROUTER_V2.md): the world's front end (value n-grams
AND trigger rules) is learned ONLY from the world's own rows: the spans of the requests of its events (and of its ROW_SHAPE), with no text
outside the spans and no request of another event (front.learn keep=...), so a trigger rule's precision is counted inside the world.
The names of every wire still count as names; the kinds (lexicon) do not change. front.json gets a field "front_rows". Default (unset or
FRONT_ROWS=all): the front end learned from all messages, exactly as before.
FRONT_NEG=1 (round 2, off by default; with FRONT_ROWS=world): the rules are still learned from the world's own rows, but their precision is
also counted over the requests of every other event (front.py learn_values / learn_triggers `neg`). VAL_GUARD=1: front.py's value guard.
HOLDOUT=<word,...> (off by default; experiments only): the messages containing these words are left out (see main).
Run: python3 msg_to_world.py [--frac 0.8] [--freq 8]"""
import argparse, collections, datetime, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import generate as G
import front as FR
from llm_to_world import convert, Skip, EXT_SETS

CAL_SHARE = 0.08
G_EVENT_OF = {v: e for e, vs in G.EVENTS.items() for v in vs}
ROLES = G.ROLES + [("members", "which shapes, as a list?"), ("targets", "to which shapes, as a list?")]   # set roles (lists of shapes)


def shape_is(shape, a):
    """ROW_SHAPE (off by default): the construction of a gold connect wire, from its args. single: one `from`, one `to`; lists: a list on one
    side or both (`from` and `to` both given); chain: a `from` list and no `to` (A to B, B to C / one after the other / all to each other)."""
    lst = lambda v: isinstance(v, list) or (isinstance(v, str) and "," in v)
    fr, to = a.get("from"), a.get("to")
    if a.get("action") != "connect": return False
    if shape == "chain": return lst(fr) and to is None
    if shape == "single": return fr is not None and to is not None and not lst(fr) and not lst(to)
    return fr is not None and to is not None and (lst(fr) or lst(to))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--freq", type=int, default=8); ap.add_argument("--out", default=os.path.join(HERE, "worlds", "real"))
    ap.add_argument("--frac", type=float, default=1.0, help="the training messages whose id hashes below this share (0.8 = the fit split; 0.2 / 0.4 / 0.8 = the learning curve)")
    a = ap.parse_args()
    msgs = [m for m in FR.load_msgs() if a.frac >= 1 or FR.split_of(m, a.frac)]
    # HOLDOUT=<word,...> (off by default; an experiment only, never a shipped model: skills/vss-world-design, the abstraction test):
    # every message whose text contains one of these words (whole word, any case) is left out of the world, the front end and the kinds,
    # so the model never sees them; the legend still lists them (a legend value keeps its question's kind).
    HOLDOUT = [w.lower() for w in os.environ.get("HOLDOUT", "").split(",") if w]
    if HOLDOUT:
        import re
        hold = re.compile(r"\b(" + "|".join(map(re.escape, HOLDOUT)) + r")\b", re.I); n0 = len(msgs)
        msgs = [m for m in msgs if not hold.search(m["text"])]
        print(f"HOLDOUT={','.join(HOLDOUT)}: {n0 - len(msgs)} of {n0} messages left out")
    P = json.load(open(os.path.join(HERE, "front_params.json")))
    FRONT_ROWS = os.environ.get("FRONT_ROWS", "") or "all"     # FRONT_ROWS=world (see the docstring); default all: exactly as before
    if FRONT_ROWS not in ("all", "world"): raise SystemExit(f"FRONT_ROWS={FRONT_ROWS!r}: expected all or world")
    if FRONT_ROWS == "all": F = FR.learn(msgs, P)
    else:
        from llm_to_world import QUESTION_EVENT
        wev = {e for e in os.environ.get("WORLD_EVENTS", "").split(",") if e}; shp = os.environ.get("ROW_SHAPE", "")
        if not wev: raise SystemExit("FRONT_ROWS=world needs WORLD_EVENTS")
        ev_of = lambda w: w["args"].get("action") if w["type"] == "command" else QUESTION_EVENT.get(w["args"].get("ask")) if w["type"] == "question" else w["type"]
        keep = lambda w: ev_of(w) in wev and (not shp or shape_is(shp, w["args"]))
        # FRONT_NEG=1 (round 2, off by default; front.py): the other worlds' requests are negative evidence for this world's rules
        F = FR.learn(msgs, P, keep=keep, neg=FR.neg_labels(wev, ev_of))
        F["front_rows"] = {"rows": "world", "events": sorted(wev), "row_shape": shp, "requests": len([r for r in FR.requests(msgs)[0] if keep(r[1])])}
        F["about"] = F["about"] + f"; FRONT_ROWS=world: values and triggers from the {F['front_rows']['requests']} requests of {','.join(sorted(wev))} only"
    if HOLDOUT: F["holdout"] = HOLDOUT; F["about"] = F["about"] + f"; HOLDOUT={','.join(HOLDOUT)}: messages with these words left out (experiment)"
    norm = lambda text, names: FR.normalize(text, names, F)
    vk = FR.value_kinds(); evtok = {v for vs in G.EVENTS.values() for v in vs}
    base = dict(vk); base.update({v: "VERB" for v in evtok})
    items = []
    nf = lambda row: (lambda text, names: (list(row["_toks"]), row["_info"])) if "_toks" in row else norm
    for m in msgs:
        created = []
        for w in m["wires"]:
            if w.get("span") and w["span"] in m["text"]:
                items.append((m, w, {"text": w["span"], "names": m.get("names") or [], "groups": list(m.get("groups") or {}), "created": list(created), "wire": {"type": w["type"], "args": w["args"]}}))
            if w["type"] == "command" and w["args"].get("action") == "create" and w["args"].get("name"): created.append(w["args"]["name"])
            # DIAGRAM_OPS=1: the name of a group made earlier in the message is a name too (DIAGRAM_OPS.md 6.2; off: as before)
            elif os.environ.get("DIAGRAM_OPS") == "1" and w["type"] == "command" and w["args"].get("action") == "group" and w["args"].get("name"): created.append(w["args"]["name"])
    cnt = collections.Counter()
    for m, w, row in items:
        toks, _ = nf(row)(row["text"], list(row["names"]) + (row.get("groups", []) if os.environ.get("DIAGRAM_OPS") == "1" else []) + row["created"])
        cnt.update(t for t in toks if FR.is_word(t))
    kinds = dict(base)
    # KINDMAP=<file.json> (off by default; diagnosis_kinds/KINDS.md): the kinds of the other words come from a kind map {"map": {word:
    # kind}} written from the training data (diagnosis_kinds/maps.py: own kind for the words whose ablation passes the sign test, the
    # annotation cluster's kind for the other words seen >= 2 times) instead of "seen >= --freq times -> own kind". A map never
    # overrides a legend value token or an event token; a word not in the map gets no entry (kind `unknown`).
    KINDMAP = os.environ.get("KINDMAP"); kindmap_sha = None
    if KINDMAP:
        km = json.load(open(KINDMAP))["map"]; kindmap_sha = G.sha256_file(KINDMAP)
        clash = sorted(w for w in km if w in base)
        if clash: raise SystemExit(f"KINDMAP {KINDMAP}: entries for legend value / event tokens: {clash[:10]}")
        kinds.update(km)
    else:
        for t, c in cnt.items():
            if c >= a.freq and t not in kinds: kinds[t] = t
    lexicon = set(kinds)
    FAMILY = {e for e in os.environ.get("FAMILY", "").split(",") if e}
    if FAMILY - set(G.EVENTS): raise SystemExit(f"FAMILY: unknown events {sorted(FAMILY - set(G.EVENTS))}")
    WEV = {e for e in os.environ.get("WORLD_EVENTS", "").split(",") if e}     # WORLD_EVENTS (see the docstring); empty: every event
    if WEV - set(G.EVENTS): raise SystemExit(f"WORLD_EVENTS: unknown events {sorted(WEV - set(G.EVENTS))}")
    if WEV and FAMILY: raise SystemExit("WORLD_EVENTS is not combined with FAMILY")
    if WEV and os.path.abspath(a.out) == os.path.abspath(os.path.join(HERE, "worlds", "real")): raise SystemExit("WORLD_EVENTS needs --out <folder> (not worlds/real)")
    WNAME = os.path.basename(os.path.normpath(a.out)) if WEV else "real"   # sop train takes the world's name from its folder
    SHAPE = os.environ.get("ROW_SHAPE", "")     # ROW_SHAPE (see shape_is): needs WORLD_EVENTS=connect; off by default
    if SHAPE and (SHAPE not in ("single", "lists", "chain") or WEV != {"connect"}): raise SystemExit("ROW_SHAPE=single|lists|chain needs WORLD_EVENTS=connect")
    rows, lost_why, dropped, by_ev = [], collections.Counter(), collections.Counter(), collections.Counter(); row_key = []
    # the same losses grouped by the legend question of the value (ROUND2.md: values dropped per role kind); "verb" = no event token,
    # "reference" = a name / pronoun / head word / $new / text not in the span (not a legend value)
    lost_kind = collections.Counter()
    def lost_kind_of(x):
        if x.startswith("verb of"): return "verb"
        if x in vk or x.isdigit(): return FR.value_kind(x)
        if x.startswith("shape word"): return "SHAPE"
        return "reference"
    for m, w, row in items:
        lost = []
        try: text, roles, ev = convert(row, lexicon, soft=True, lost=lost, norm=nf(row))
        except Skip as e: dropped[str(e).split(":")[0]] += 1; continue
        if FAMILY and ev not in FAMILY: continue     # FAMILY=<events>: only the rows of these events (INTERFERENCE.md); default: every row
        if WEV and ev not in WEV: continue           # WORLD_EVENTS=<events>: the same, and the legend below lists only these events
        if SHAPE and not shape_is(SHAPE, row["wire"]["args"]): continue   # ROW_SHAPE=single|lists|chain (connect only): rows of one construction
        if not (set(G.EVENTS[ev]) & set(text.split())) and not roles: dropped["no event token and no role (zero target)"] += 1; continue
        for x in lost: lost_why["event token not found" if x.startswith("verb of") else x.split(" ")[0]] += 1
        for x in lost: lost_kind[lost_kind_of(x)] += 1
        rows.append((ev, text, roles, m["id"])); by_ev[ev] += 1; row_key.append(row.get("_key"))
    out = a.out
    for d in ("examples", "raw", "audit", "model", "runs", "versions", "requests"): os.makedirs(os.path.join(out, d), exist_ok=True)
    for f in os.listdir(os.path.join(out, "examples")): os.remove(os.path.join(out, "examples", f))
    roles_of = collections.defaultdict(set)
    for ev, _, roles, _ in rows: roles_of[ev] |= set(roles)
    legend = {"version": 1, "roles": [{"id": r, "question": q} for r, q in ROLES],
              "events": [{"id": e, "verbs": vs, "roles": [r for r, _ in ROLES if r in roles_of[e]], "required": []} for e, vs in G.EVENTS.items() if not WEV or e in WEV],
              "operators": ["not"], "moods": ["command"], "kinds": {"source": "lexicon", "lexicon": "kinds.tsv"},
              "values": [{"kind": "NUM", "pattern": "\\d+"}, {"kind": "NAME", "pattern": "n_[a-z0-9_]+"}, {"kind": "TEXT", "pattern": "t_[a-z0-9_]+"}],
              # MARKER=0 (off by default; owner's decision 2026-10-31, CAPACITY.md S5): no occupancy marker, so a single role's presence is read
              # from the deposit that carries its word (role * F(filler), the rule of the set roles) and the training target has no marker term;
              # with the marker only a word of a one-word kind can write the presence ("delete X": the object is never read)
              "reader": {"predicate_role": True, "occupancy_marker": os.environ.get("MARKER", "1") != "0", "definite_dets": [], "set_roles": ["members", "targets"] + ([r for r in EXT_SETS if r in set().union(*roles_of.values())] if G.LEGEND_EXT else [])}}
    lp = os.path.join(out, "legend.json"); json.dump(legend, open(lp, "w"), indent=1); sha = G.sha256_file(lp)
    with open(os.path.join(out, "kinds.tsv"), "w") as fh:
        rule = (f"the other words -> the kind map KINDMAP={KINDMAP} ({kindmap_sha})" if KINDMAP else
                f"tokens seen >= {a.freq} times in the training spans -> own kind")
        fh.write("# word\tkind: LEARNED by training/sketch/msg_to_world.py (legend value tokens -> their question's kind, event tokens -> VERB, "
                 f"{rule}; everything else unknown)\n")
        for w in sorted(kinds): fh.write(f"{w}\t{kinds[w]}\n")
    json.dump(F, open(os.path.join(out, "front.json"), "w"))
    json.dump({"name": WNAME, "language": "en", "description": "SOP Sketchpad legend, world built from annotated realistic messages", "created": datetime.date.today().isoformat(),
               "version": 1, "min_examples": 500, "max_versions_per_run": 3, "second_look_escalate": 0.05, "second_look_retrain": 0.05}, open(os.path.join(out, "world.json"), "w"), indent=1)
    json.dump({"heldout_sentence_share": 0.0, "new_identities": "none: realistic messages, names are not controlled",
               "file_splits": {"examples/calib.sop": "heldout_formulations"}, "template_splits": {},
               "protocol": f"calib.sop = the requests of {CAL_SHARE:.0%} of the messages: half set the thresholds, half reported; everything else is trained on"},
              open(os.path.join(out, "split_hints.json"), "w"), indent=1)
    k = 0
    # calibration (DECISIONS.md 3): the presence thresholds are set on rows the model does not train on: the requests of CAL_SHARE of the
    # messages (by a hash of the id) go to examples/calib.sop, declared as the held-out formulations split; sop train
    # --calibrate_on_heldout_formulations uses half of them for the thresholds and reports the other half. Every other row is trained on
    # (heldout_sentence_share 0: DECISIONS.md 2).
    cal = lambda mid: int(G.hashlib.sha256((mid + "|cal").encode()).hexdigest()[:8], 16) / 2 ** 32 < CAL_SHARE
    docs = {f: G.soplang.Doc(directives=[("world", WNAME, None), ("legend", sha, None), ("generated", "training/sketch/msg_to_world.py from llm_train/*_msg", None)]) for f in ("train.sop", "calib.sop")}
    wire_of = {}
    for ri, (ev, text, roles, mid) in enumerate(rows):
        ids = iter(f"w{k + i}" for i in range(1, 100)); ws = G.wires_for(ev, roles, text, f"msg.{mid[:2]}", ids, world=WNAME, source="llm")
        k += len(ws); docs["calib.sop" if cal(mid) else "train.sop"].wires += ws
        if row_key[ri] is not None: wire_of[row_key[ri]] = f"examples/{'calib.sop' if cal(mid) else 'train.sop'}#{ws[0].id}"
    # NEGATIVE examples (NEGATIVES=1 turns them on; off by default since plan step 1 failed its criterion, ERROR_ANALYSIS.md): the sentences of the training messages that lie outside
    # every annotated span (front.requests). When the normalized sentence carries an action token E (the first one), it becomes a wire of
    # event E with no roles and `_negative=true`: sop train uses MINUS its compiled state as the target (vss-demo R81), so the reader
    # learns that these sentences are not requests of this world. Sentences with no action token are already unreadable (status
    # unknown-event) and add nothing. Negatives go to train.sop only, never to calib.sop: sop train puts every train.sop row in the
    # `train` split and leaves negatives out of the schema, the calibration rows and the evaluation. The messages whose requests are in
    # calib.sop give no negatives either, so that those messages stay entirely unseen.
    n_neg = 0
    if os.environ.get("NEGATIVES", "0") == "1":
        for m in msgs:
            if cal(m["id"]): continue
            for text, names in FR.requests([m])[1]:
                toks, _ = norm(text, names); evs = [t for t in toks if t in evtok]
                if not evs or (WEV and G_EVENT_OF[evs[0]] not in WEV): continue
                ids = iter(f"w{k + i}" for i in range(1, 100))
                ws = G.wires_for(G_EVENT_OF[evs[0]], {}, " ".join(toks), "msg.neg", ids, world=WNAME, source="llm-outside-spans")
                ws[0].set("_negative", "true"); k += len(ws); docs["train.sop"].wires += ws; n_neg += 1
    for f, d in docs.items(): open(os.path.join(out, "examples", f), "w").write(G.soplang.write(d))
    open(os.path.join(out, "raw", "sentences.txt"), "w").write("\n".join(r[1] for r in rows) + "\n")
    if not os.path.exists(os.path.join(out, "status.json")): json.dump({"label": None, "note": "never trained"}, open(os.path.join(out, "status.json"), "w"))
    kc = collections.Counter(kinds.values())
    rep = [f"# World `real`: built from {len(msgs)} training messages ({len(items)} requests with a span)", "",
           *([f"WORLD_EVENTS={','.join(sorted(WEV))}: only the rows of these events; the legend lists only these events.", ""] if WEV else []),
           *([f"FRONT_ROWS=world: the front end below is learned only from the {F['front_rows']['requests']} requests of this world's events.", ""] if "front_rows" in F else []),
           f"Front end learned from the same messages: {len(F['values'])} value n-grams, {len(F['triggers'])} trigger rules, {len(F['segmenter'])} segmenter weights; params {json.dumps(P)}.", "",
           f"Rows: {len(rows)}. Dropped (cannot be trained): {sum(dropped.values())} {dict(dropped)}. Negative examples (text outside the spans with an action token): {n_neg}.", "",
           (f"Kinds: {len(kc)}; lexicon {len(lexicon)} words (legend value tokens {len(vk)}, event tokens {len(evtok)}, other words from the kind map "
            f"KINDMAP={KINDMAP} ({kindmap_sha}): {len(kinds) - len(base)} words).") if KINDMAP else
           f"Kinds: {len(kc)}; lexicon {len(lexicon)} words (legend value tokens {len(vk)}, event tokens {len(evtok)}, own-kind tokens seen >= {a.freq} times).", "",
           "Own-kind tokens: " + ", ".join(sorted(t for t, c in kinds.items() if c == t)), "",
           *(["Shared kinds (kind: words): " + "; ".join(f"{k}: {' '.join(sorted(w for w, x in kinds.items() if x == k))}"
                                                       for k in sorted({x for w, x in kinds.items() if x != w and w not in base})), ""] if KINDMAP else []),
           "Values left out per legend question kind (value tokens not in the normalized span; rows kept): " + lost_kind_line(lost_kind), "",
           "Roles left out because their words are not in the normalized span (rows kept):", "", "| what | n |", "|---|---|"] + \
          [f"| {x} | {n} |" for x, n in lost_why.most_common(40)] + ["", "| event | rows |", "|---|---|"] + [f"| {e} | {n} |" for e, n in by_ev.most_common()]
    open(os.path.join(out, "REAL_WORLD.md") if WEV else os.path.join(HERE, "llm_train", "REAL_WORLD.md"), "w").write("\n".join(rep) + "\n")
    print("\n".join(rep[:9]))
    print(f"Switches: VAL_PREC={FR.val_prec()} VAL_SUB={FR.val_sub()}{' VAL_PICK=' + FR.val_pick() if os.environ.get('VAL_PICK') else ''}"
          f"{''.join(f' {k}=' + os.environ[k] for k in ('FRONT_NEG', 'VAL_GUARD', 'NEW_DISTINCT') if os.environ.get(k))} CREATE_COLOR={os.environ.get('CREATE_COLOR', '') or 'attr'} LEGEND_EXT={int(G.LEGEND_EXT)} "
          f"DIAGRAM_OPS={os.environ.get('DIAGRAM_OPS', '') or '0'}; data folders {FR.train_dirs()}")
    print("Values left out per legend question kind: " + lost_kind_line(lost_kind))


def lost_kind_line(c):
    vals = {k: n for k, n in c.items() if k not in ("verb", "reference")}
    return f"values {sum(vals.values())} " + json.dumps(dict(sorted(vals.items()))) + f"; event token not found {c['verb']}; references {c['reference']}"


if __name__ == "__main__":
    main()
