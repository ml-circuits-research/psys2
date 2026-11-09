"""llm_to_world.py: the LLM-written training clauses (llm_train/*/train_*.jsonl, gold in the demo's legend) as sketch-world examples
(worlds/sketch/examples/train_llm.sop), the inverse of docs/js/vss-adapter.js. Each clause is normalized exactly as the reader will see it,
and its gold wire becomes the event with its roles; every word a role is filled with must be a token of the normalized clause (the reader
reads only what the sentence carries), otherwise the clause is set aside and counted by reason (llm_train/CONVERSION.md).
Run after generate.py: python3 llm_to_world.py"""
import collections, glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from generate import LEXICON, EVENTS, ROLES, SHAPES, LEGEND_EXT, wires_for, sha256_file, soplang
from normalize import normalize, slug

PLURAL = dict(SHAPES) | {"shape": "shapes"}
REL = {"leftOf": "left_of", "rightOf": "right_of", "above": "above", "below": "below", "near": "next_to", "between": "between"}
REGION = {"center": "center", "top": "top", "bottom": "bottom", "left": "left_side", "right": "right_side", "topLeft": "top_left",
          "topRight": "top_right", "bottomLeft": "bottom_left", "bottomRight": "bottom_right"}
SUPER = {"biggest": "biggest", "smallest": "smallest", "leftmost": "leftmost", "rightmost": "rightmost", "topmost": "topmost",
         "bottommost": "bottommost", "mostConnected": "mostconnected", "leastConnected": "leastconnected", "closest": "closest", "farthest": "farthest"}
QUESTION_EVENT = {"count": "count", "exists": "exists", "list": "list", "property": "property", "describe": "describe", "neighbors": "neighbors",
                  "path": "path", "reachable": "reachable", "cycle": "cycle", "check": "check", "extreme": "extreme", "nearest": "nearest",
                  "connected": "connected", "degree": "degree", "rules": "list"}


class Skip(Exception): pass


LISTS = os.environ.get("LISTS", "1") == "1"   # lists of shapes -> the set roles `members` / `targets` (world real); 0: the first shape only

# DIAGRAM_OPS=1 (off by default; DIAGRAM_OPS.md sections 4-6, ROUND2.md): groups and double positions. The events group / ungroup /
# members / groupOf (verb tokens group, ungroup and the question openers members_q, group_q) and the roles relation2 / landmark3 (after
# landmark2) are added to generate.EVENTS / generate.ROLES IN PLACE, so that msg_to_world.py (legend, kinds) and wires_for (role order)
# see them; with the switch off nothing changes. Converter: group names (row field `groups`, and the `name` of an earlier group wire of
# the same message, passed in `created`) are names; group / ungroup / members / groupOf are target events; count / list / exists with
# kind=group get the object head `groups` (or `group`); a position may combine a region and up to two relations (place_ops).
OPS = os.environ.get("DIAGRAM_OPS") == "1"
if OPS:
    EVENTS.update({"group": ["group"], "ungroup": ["ungroup"], "members": ["members_q"], "groupOf": ["group_q"]})
    for _r, _q in (("landmark3", "relative to which other shape?"), ("relation2", "and where else, relative to another shape?")):
        if _r not in dict(ROLES): ROLES.insert([x for x, _ in ROLES].index("landmark2") + 1, (_r, _q))
    QUESTION_EVENT.update({"members": "members", "groupOf": "groupOf"})

# LEGEND_EXT=1 (off by default; generate.py LEGEND_EXT adds the events and roles, front.py the value tables; TRAIN_PLAN_1103.md section 2):
# the converter reads the forms of 2026-11-02 (LABEL_CONVENTIONS.md, last section):
#   help             -> event help, roles topic / aspect (value tokens tp_* / asp_*); `about` (words the legend does not know) is not a role
#                       of a VSS world (an unknown word has no kind to bind): left out and counted ("about");
#   templates        -> create / arrange with the value role `template` (tpl_*), the set roles `items` / `items2` / `parents` (one member per
#                       item: its name token n_* or quoted text t_*; an item of several words has no single token and is left out, counted
#                       "items word"), `title` (a text or name token, as a label), `scheme` (sch_*), and the old roles (count -> quantity,
#                       axis, colour, size, place); a template create has no `object` (no shape word);
#   free text        -> create with the shape word `text` (shape=text; plural texts), the label as `text`; panels: width / height (numbers),
#                       fill / layer (fill_* / layer_*); a create with a layout (4 dots in a ring) -> the role `layout`;
#   layout ops       -> events improve ... untangle: target as for arrange (object / members), axis, comparison, distance -> amount, place
#                       (fit position=center -> region), property (prop_*), superlative, layout, anchor -> landmark;
#                       arrange: layout tree / layers / radial / organic, direction, anchor (the root) -> landmark; align: direction;
#   arrows           -> an existing arrow named by its ends (set / resize / label / property / reverse with from / to) -> source / target (a
#                       list keeps its first shape, counted); the arrows (kind=edge) -> the value role `kind` (kind_edge: the edge word is
#                       learned as a value, so a trigger "how many arrows" keeps it), every arrow (quantifier=all) -> the value role
#                       `quantifier` (all); count / list / exists kind=edge the same;
#                       set / resize: style, arrow (two_way / plain / forward), colour, size; label="" -> the value token no_label.
# GAP_ROLE=1 (off by default; training/sketch/scenes_r3/ROOT_CAUSES.md, 2026-11-03): a gap written with a relation ("6 px above Pot", "a
# brown triangle 2 px above House2", "left of Heart with a 60 px gap": distance + position + anchor) fills the role `amount`, as the gap of a
# move with a direction already does. Before, place() / place_ops() never carried `distance`, so no world row had it (scenes: 0 / 38 gold
# gaps with a relation reach a row) and the reader could not learn it; docs/js/vss-adapter.js place() reads `amount` beside a relation.
GAP_ROLE = os.environ.get("GAP_ROLE") == "1"
EXT_SETS = ("items", "items2", "parents")          # set roles of texts (msg_to_world.py adds them to the legend's reader.set_roles)
OPS_EVENTS = ("improve", "respace", "snap", "fit", "flip", "sort", "groupBy", "equalize", "straighten", "untangle")
if LEGEND_EXT:
    PLURAL["text"] = "texts"
    QUESTION_EVENT["help"] = "help"


def convert(row, lexicon=None, soft=False, lost=None, table=None, norm=None):
    """soft: never set a row aside for a missing word; a role whose words are not in the clause is left out (listed in `lost`)"""
    lexicon = LEXICON if lexicon is None else lexicon; lost = [] if lost is None else lost
    names = list(row.get("names") or []) + (list(row.get("groups") or []) if OPS else []) + list(row.get("created") or [])
    toks, info = norm(row["text"], names) if norm else normalize(row["text"], lexicon, names, table=table)
    T = set(toks); w = row["wire"]; a = w.get("args", {}); typ = w.get("type")
    ev = a.get("action") if typ == "command" else QUESTION_EVENT.get(a.get("ask")) if typ == "question" else typ
    if ev not in EVENTS: raise Skip(f"no event for {typ}:{a.get('action') or a.get('ask')}")
    if not (set(EVENTS[ev]) & T):
        if not soft: raise Skip(f"no {ev} verb in the clause")
        lost.append(f"verb of {ev}")
    def need(tok):
        if tok not in T:
            if soft: lost.append(tok); return None
            raise Skip(f"word not in the clause: {tok}")
        return tok
    def need_text(lbl):   # a quoted label is a t_ token; an unquoted one ("labeled Rocks") is read as a name token (LABEL_AS_NAME=0 turns it off)
        if os.environ.get("LABEL_AS_NAME", "1") != "1": return need("t_" + slug(lbl))
        return "t_" + slug(lbl) if "t_" + slug(lbl) in T else "n_" + slug(lbl) if "n_" + slug(lbl) in T else need("t_" + slug(lbl))
    # NEW_DISTINCT=1 (round 2, off by default; VSS_FROM_TO.md section 1): a wire with several `$new` (shapes made earlier in the message,
    # e.g. "Arrows from Dad and Mom to Me": from=$new,$new to=$new) gives each `$new` its own created name: the created names written in
    # the clause (not named elsewhere in the wire), in text order, one per `$new` in the order the roles are converted. Before, every `$new`
    # became the LAST created name in the clause (members = {Me, Me}, target = Me). A wire with one `$new` is converted as before.
    new_q = None
    if os.environ.get("NEW_DISTINCT") == "1" and sum(str(x).strip() == "$new" for v in a.values() for x in str(v).split(",")) >= 2:
        named = {"n_" + slug(x.strip()) for v in a.values() for x in str(v).split(",") if x.strip() and x.strip() != "$new" and not str(v).startswith("mention(")}
        cr = {"n_" + slug(nm) for nm in row.get("created") or []}
        new_q = [t for i, t in enumerate(toks) if t in cr and t not in named and t not in toks[:i]]
    def ent(v):
        v = str(v)
        if v == "$new" and new_q: return {"head": new_q.pop(0)}, None
        if v == "$new":
            for nm in reversed(row.get("created") or []):
                if "n_" + slug(nm) in T: return {"head": "n_" + slug(nm)}, None
            for p in ("it", "them"):
                if p in T: return {"head": p}, None
            if soft: lost.append("$new"); return None, None
            raise Skip("$new not in the clause")
        if v.startswith("mention("):
            kv = dict(x.split("=", 1) for x in v[len("mention("):-1].split(",") if "=" in x)
            plural = kv.get("quantifier") == "all"
            sh = kv.get("shape")
            cands = ([PLURAL[sh], sh] if sh else ["shapes", "shape", "everything"]) if plural else ([sh] if sh else ["shape", "it"])
            # LEGEND_EXT: "the whole diagram", "all of them": the quantifier token itself is the head when no shape word / pronoun is there
            head = next((c for c in cands if c in T), None) or next((c for c in ("it", "them", "everything") + (("all",) if LEGEND_EXT and plural else ()) if c in T), None)
            # LEGEND_EXT: a description is never written BROADER than its gold. When its shape word is missing (the front end made
            # "stars" into `all`, a typo), a quantifier / pronoun head would read "remove all the stars" as every shape; when a filter
            # (colour, not-colour, recency) has no token, the head alone reads every shape of the kind. Such a description is left
            # out (counted "description filter lost"), so the row says nothing about the role instead of teaching the wrong set.
            # The same holds for a filter key that a world row cannot carry at all (2026-11-03, TRAIN_PLAN_R3.md A.5: layer and label from
            # opus_r3_gaps, "delete all the panels" = mention(layer=zone,quantifier=all) was written as delete every shape; size in a
            # description): the entity holds only a head, a colour and a determiner, so such a description is left out the same way.
            if LEGEND_EXT and head is not None and head not in ("it", "them"):
                miss = (["shape"] if sh and head not in (PLURAL.get(sh, sh), sh) else []) + [k for k, t in (
                    ("color", kv.get("color")), ("notcolor", kv.get("notcolor") and "not_" + kv["notcolor"]), ("recency", kv.get("recency"))) if t and t not in T] \
                    + sorted(k for k in kv if k not in ("quantifier", "shape", "color", "notcolor", "recency"))
                if miss: head = None; lost.append("description filter lost: " + ",".join(miss))
                if miss and not soft: raise Skip(f"description filter lost in {v}")
            if head is None:
                if soft: lost.append(f"head of {v}"); return None, None
                raise Skip(f"no head for {v}")
            e = {"head": head}
            if kv.get("color"): e["attr"] = need(kv["color"])
            if kv.get("recency"): e["det"] = need(kv["recency"])
            elif plural and "all" in T: e["det"] = "all"   # the quantifier, as the learned front end writes it
            return e, kv.get("notcolor")
        n = "n_" + slug(v)
        if n in T: return {"head": n}, None
        for p in ("it", "them", "this", "that"):
            if p in T and p in LEXICON: return {"head": p}, None
        if soft: lost.append(f"name {v}"); return None, None
        raise Skip(f"name not in the clause: {v}")
    roles, neg = {}, None
    def edge_role():   # LEGEND_EXT: the arrows / every arrow: kind=edge -> the value role kind (kind_edge), quantifier=all -> the value role quantifier (all)
        import front as FR
        if a.get("kind") in ("edge", "group"): roles["kind"] = need(FR.value_token("kind", a["kind"]))
        if a.get("quantifier") == "all": roles["quantifier"] = need("all")
    def ext_args(ev):   # LEGEND_EXT, the events of the generic branch: arrows by their ends, every arrow, directions, the ops' own roles
        if ev in ("set", "resize", "label", "property") and (a.get("from") is not None or a.get("to") is not None):
            for k, r in (("from", "source"), ("to", "target")):
                if a.get(k) is None: continue
                xs = [x.strip() for x in str(a[k]).split(",") if x.strip()] if not str(a[k]).startswith("mention(") else [a[k]]
                if len(xs) > 1: lost.append("several ends (first kept)")
                roles[r], _ = ent(xs[0])
        if ev in ("set", "resize", "label") and (a.get("kind") == "edge" or (a.get("quantifier") == "all" and a.get("target") is None)): edge_role()
        if ev in ("set", "resize"):
            if a.get("style"): roles["style"] = need(a["style"])
            if a.get("arrow"): roles["arrow"] = need({"both": "two_way", "none": "plain"}.get(a["arrow"], a["arrow"]))
            if ev == "resize" and a.get("size"): roles["size"] = need(a["size"])
        if ev in ("arrange", "align", "flip") and a.get("direction"): roles["direction"] = need(a["direction"])
        if ev in ("arrange", "equalize", "sort", "groupBy") and a.get("anchor") and not a.get("position"): roles["landmark"], _ = ent(str(a["anchor"]).split(",")[0].strip())
        if ev in OPS_EVENTS:
            if a.get("comparison"): roles["comparison"] = need(a["comparison"])
            if a.get("distance") is not None and str(a["distance"]).isdigit(): roles["amount"] = need(str(a["distance"]))
            if a.get("superlative"): roles["superlative"] = need(SUPER.get(a["superlative"], "?"))
            if a.get("position"): place()
    def ext_values(ev):   # LEGEND_EXT, every event: the new value keys, numbers, lists of texts, the title; `about` is not a role (counted)
        import front as FR
        for k in ("template", "scheme", "fill", "layer", "topic", "aspect"):
            if a.get(k) not in (None, ""): roles[k] = need(FR.value_token(k, a[k]))
        if a.get("property") not in (None, "") and ev != "property": roles["property"] = need(FR.value_token("property", a["property"]))
        for k in ("width", "height"):
            if a.get(k) is not None: roles[k] = need(str(a[k]))
        for k in EXT_SETS:
            if not a.get(k): continue
            mem = []
            for p in [x.strip() for x in str(a[k]).split(",") if x.strip()]:
                s = slug(p); h = "n_" + s if "n_" + s in T else "t_" + s if "t_" + s in T else None
                if h: mem.append({"head": h})
                else: lost.append(f"{k} word" if " " in p else f"{k} {p}")
            if mem: roles[k] = mem
        if a.get("title"): roles["title"] = need_text(a["title"])
        # the keys that had no role (CONVERT_FIX.md, 2026-11-03): outline (its value token), at "x,y" (two number roles), linked (a shape),
        # the count of undo / redo ("undo twice") as the role quantity, as for duplicate
        if a.get("outline") not in (None, ""): roles["outline"] = need(FR.value_token("outline", a["outline"]))
        if a.get("at") not in (None, ""):
            xy = [p.strip() for p in str(a["at"]).split(",")]
            if len(xy) == 2 and all(p.isdigit() for p in xy): roles["x"], roles["y"] = need(xy[0]), need(xy[1])
            else: lost.append(f"at {a['at']}")
        if a.get("linked") not in (None, ""): roles["linked"], _ = ent(str(a["linked"]).split(",")[0].strip()) if not str(a["linked"]).startswith("mention(") else ent(a["linked"])
        if ev in ("undo", "redo") and a.get("count") is not None and str(a["count"]).isdigit(): roles["quantity"] = need(str(a["count"]))
        if ev == "create" and a.get("layout"): roles["layout"] = need({"circle": "ring"}.get(a["layout"], a["layout"]))
        if a.get("about"): lost.append("about")
    def gap():   # GAP_ROLE=1: the gap of a relation (distance in digits) -> the role amount (a number token of the clause)
        if GAP_ROLE and a.get("distance") is not None and str(a["distance"]).isdigit(): roles["amount"] = need(str(a["distance"]))
    def place():
        if OPS: return place_ops()
        if "position" not in a: return
        p = a["position"]
        if p in REGION: roles["region"] = need(REGION[p]); return
        if p not in REL:
            if soft: lost.append(f"position {p}"); return
            raise Skip(f"position {p}")
        roles["relation"] = need(REL[p])
        anc = [x.strip() for x in str(a.get("anchor", "")).split(",") if x.strip()]
        if anc: roles["landmark"], _ = ent(anc[0])
        if len(anc) > 1: roles["landmark2"], _ = ent(anc[1])
        gap()
    def place_ops():   # DIAGRAM_OPS.md 6.5: one relation and no region -> exactly the roles of place()
        p, p2, rg = a.get("position"), a.get("position2"), a.get("region")
        if p is None and p2 is None and rg is None: return
        rels, regs = [], [rg] if rg else []
        for pk, ak in (("position", "anchor"), ("position2", "anchor2")):
            v = a.get(pk)
            if v is None: continue
            if v in REGION: regs.append(v); continue            # a canvas place written in position / position2
            if v not in REL:
                if soft: lost.append(f"position {v}"); continue
                raise Skip(f"position {v}")
            rels.append((v, [x.strip() for x in str(a.get(ak, "")).split(",") if x.strip()]))
        if not rels:                                           # a canvas place alone: exactly as before
            if regs and regs[0] in REGION: roles["region"] = need(REGION[regs[0]])
            elif regs: lost.append(f"position {regs[0]}")
            return
        if len(rels) == 2 and rels[1][0] == "between": rels.reverse()   # a between is always the first relation
        if len(rels) == 2 and rels[1][0] == "between":
            if not soft: raise Skip("two betweens")
            lost.append("two betweens (second dropped)"); rels = rels[:1]
        r1, anc1 = rels[0]
        roles["relation"] = need(REL[r1])
        gap()
        if anc1: roles["landmark"], _ = ent(anc1[0])
        if len(anc1) > 1: roles["landmark2"], _ = ent(anc1[1])
        if len(rels) == 2:
            r2, anc2 = rels[1]
            roles["relation2"] = need(REL[r2])
            if anc2: roles["landmark3"], _ = ent(anc2[0])
        if regs:
            if regs[0] in REGION: roles["region"] = need(REGION[regs[0]])
            else: lost.append(f"region {regs[0]}")
    if ev == "create":
        sh = a.get("shape", "circle"); cnt = a.get("count")
        tpl = LEGEND_EXT and a.get("template")     # LEGEND_EXT: a template create names no shape (no object role)
        head = None if tpl else next((c for c in ([PLURAL[sh], sh] if cnt else [sh]) if c in T), None)
        if head is None and not soft and not tpl: raise Skip(f"no shape word {sh}")
        if head is None and not tpl: lost.append(f"shape word {sh}")
        e = {"head": head}
        # CREATE_COLOR=role (off by default; PLAN_B.md, HOLD: CREATE_COLOR.md): the colour of the new shape fills the event role `color`,
        # as its size fills `size` here and as a colour set on a shape does in set / fact / rule. Default: the attribute of the shape word,
        # which a world that also holds set / fact reads into the event role instead (shapes7: create colour lost in 53.8% of requests).
        # docs/js/vss-adapter.js reads both (obj.attr, then R.color).
        if a.get("color"):
            if os.environ.get("CREATE_COLOR") == "role": roles["color"] = need(a["color"])
            else: e["attr"] = need(a["color"])
        if not tpl: roles["object"] = e
        elif a.get("color"): roles["color"] = e.get("attr") or roles.get("color")   # a template's one colour: the event role (no shape word to carry it)
        if a.get("size"): roles["size"] = need(a["size"])
        if cnt: roles["quantity"] = need(str(cnt))
        if a.get("name"): roles["name"] = need("n_" + slug(a["name"]))
        if a.get("label"): roles["text"] = need_text(a["label"])
        place()
    elif ev in ("delete", "duplicate", "neighbors", "describe", "property", "degree", "toFront", "toBack", "resize", "rename", "label", "set", "align", "arrange", "distribute", "move", "check", "fact", "connected",
                "group", "ungroup", "members", "groupOf") + OPS_EVENTS:   # group ... groupOf exist only with DIAGRAM_OPS=1, OPS_EVENTS only with LEGEND_EXT=1 (EVENTS)
        if a.get("target") is not None:
            tg = [x.strip() for x in str(a["target"]).split(",") if x.strip()] if not str(a["target"]).startswith("mention(") else [a["target"]]
            if LISTS and len(tg) > 1: roles["members"] = [ent(x)[0] for x in tg]
            else: roles["object"], neg = ent(tg[0])
        elif ev == "describe" and "canvas" in T: roles["object"] = {"head": "canvas"}
        elif ev in ("arrange", "distribute") and "everything" in T: roles["object"] = {"head": "everything"}
        if ev == "duplicate" and a.get("count"): roles["quantity"] = need(str(a["count"]))
        if ev == "rename": roles["name"] = need("n_" + slug(a.get("name", "")))
        if ev == "group" and a.get("name"): roles["name"] = need("n_" + slug(a["name"]))   # a group without a name has no name role
        if ev == "label":
            if LEGEND_EXT and a.get("label") == "": roles["text"] = need("no_label")   # remove a label (LABEL_CONVENTIONS.md, arrow labels)
            else: roles["text"] = need_text(a.get("label", ""))
        if ev in ("set", "check", "fact"):
            if a.get("color"): roles["color"] = need(a["color"])
            if a.get("shape"): roles["shape"] = need(a["shape"])
            if a.get("size"): roles["size"] = need(a["size"])
            if a.get("notColor"): neg = a["notColor"]
        if ev == "move":
            if a.get("direction"): roles["direction"] = need(a["direction"]); roles.update({"amount": need(str(a["distance"]))} if a.get("distance") else {})
            else: place()
        if ev in ("check", "fact"):
            if a.get("comparison"): roles["comparison"] = need(a["comparison"]); roles["landmark"], _ = ent(a.get("anchor", ""))
            else: place()
        if ev == "connected": roles["landmark"], _ = ent(a.get("anchor", ""))
        if ev in ("align", "distribute") + (("flip",) if LEGEND_EXT else ()) and a.get("axis"): roles["axis"] = need({"horizontal": "horizontally", "vertical": "vertically"}[a["axis"]])
        if ev in ("arrange",) + (("sort",) if LEGEND_EXT else ()) and a.get("layout"): roles["layout"] = need({"circle": "ring"}.get(a["layout"], a["layout"]))
        if LEGEND_EXT: ext_args(ev)
    elif ev == "swap":
        x = [s.strip() for s in str(a.get("target", "")).split(",")]
        if len(x) != 2:
            if not soft: raise Skip("swap needs two")
            lost.append("swap needs two")
        roles["object"], _ = ent(x[0])
        if len(x) > 1: roles["target"], _ = ent(x[1])
    elif ev in ("connect", "disconnect", "path", "reachable") + (("reverse",) if LEGEND_EXT else ()):
        if a.get("from") is not None:
            fr = [x.strip() for x in str(a["from"]).split(",")] if not str(a["from"]).startswith("mention(") else [a["from"]]
            if len(fr) > 1:
                if not soft: raise Skip("several sources in one role")
                if LISTS: roles["members"] = [ent(x)[0] for x in fr]
                else: lost.append("several sources (first kept)"); roles["source"], neg = ent(fr[0])
            else: roles["source"], neg = ent(fr[0])
        if a.get("to") is not None:
            to = [s.strip() for s in str(a["to"]).split(",")] if not str(a["to"]).startswith("mention(") else [a["to"]]
            if len(to) > 1:
                if not soft: raise Skip("several targets in one role")
                if LISTS: roles["targets"] = [ent(x)[0] for x in to]
                else: lost.append("several targets (first kept)"); roles["target"], _ = ent(to[0])
            else: roles["target"], _ = ent(to[0])
        if ev == "connect":
            if a.get("style"): roles["style"] = need(a["style"])
            if a.get("arrow") == "both": roles["arrow"] = need("two_way")
            if a.get("arrow") == "none" and "plain" in T: roles["arrow"] = "plain"
            edge = next((x for x in ("arrow", "line", "connection") if x in T), None)
            if a.get("color"):
                if not edge and not soft: raise Skip("edge colour without an edge word")
                if edge: roles["edge"] = {"head": edge, "attr": need(a["color"])}
                else: lost.append("edge word")
            elif edge and (a.get("arrow") == "none" or edge != "arrow" or a.get("style")): roles["edge"] = {"head": edge}
            if a.get("label"): roles["text"] = need_text(a["label"])
            if a.get("pairing"): roles["pairing"] = need({"all": "each_other"}.get(a["pairing"], a["pairing"]))
        if LEGEND_EXT and ev in ("disconnect", "reverse"):
            if a.get("target") is not None and a.get("from") is None and a.get("to") is None: roles["object"], _ = ent(str(a["target"]).split(",")[0].strip())
            if a.get("quantifier") == "all" or a.get("kind") == "edge": edge_role()
    elif ev in ("count", "exists", "list", "extreme", "nearest", "rule"):
        if a.get("ask") == "rules": roles["object"] = {"head": need("rules")}
        elif LEGEND_EXT and a.get("kind") in ("edge", "group") and ev in ("count", "exists", "list"): edge_role()   # "how many arrows": kind_edge, no shape
        elif OPS and a.get("kind") == "group" and ev in ("count", "exists", "list"):   # DIAGRAM_OPS.md 6.4: no other filter
            roles["object"] = {"head": "groups" if "groups" in T else "group" if "group" in T else need("groups")}
        else:
            sh = a.get("shape")
            cands = [PLURAL.get(sh, sh), sh] if sh else ["shapes", "shape"]
            head = next((c for c in cands if c in T), None)
            if head: roles["object"] = {"head": head} | ({"attr": need(a["color"])} if a.get("color") and ev != "rule" else {})
            elif sh:
                if not soft: raise Skip(f"no shape word {sh}")
                lost.append(f"shape word {sh}")
            # QCOLOR=1 (off by default; CAPACITY.md S7): a colour filter of a count / exists / list question ("which ones are blue",
            # "how many are red") is a legend key of these questions (docs/js/logic.js LOGIC_MAP color) but was kept only as the
            # attribute of a shape word, so with no shape word it was dropped silently and never trained. Here it fills the role
            # `color`, which the world's events then take (msg_to_world.py derives each event's roles from its rows).
            if os.environ.get("QCOLOR") == "1" and ev in ("count", "exists", "list") and a.get("color") and not head: roles["color"] = need(a["color"])
            if ev == "rule":
                if a.get("color"): roles["color"] = need(a["color"])
                if a.get("size"): roles["size"] = need(a["size"])
            if a.get("notColor"): neg = a["notColor"]
            if ev in ("extreme", "nearest"): roles["superlative"] = need(SUPER.get(a.get("superlative"), "?"))
            if ev == "nearest" and a.get("anchor"): roles["landmark"], _ = ent(a["anchor"])
            elif ev in ("count", "exists", "list"): place()
    elif ev in ("undo", "redo", "forget", "cycle"):
        pass
    if LEGEND_EXT: ext_values(ev)
    if neg: roles["notcolor"] = need("not_" + neg)
    clean = {}
    for r, v in roles.items():
        if v is None: continue
        if isinstance(v, list):   # a set role: its members, each a bare name entity (sets carry heads only)
            v = [{"head": x["head"]} for x in v if x and x.get("head")]
            if not v: continue
            if len(v) == 1 and r not in EXT_SETS:   # only one member found in the clause: the ordinary single role (a list of texts stays a set)
                v = v[0]; r = "target" if r == "targets" else ("source" if ev in ("connect", "disconnect", "path") else "object")
        elif isinstance(v, dict):
            if v.get("head") is None: continue
            v = {k: x for k, x in v.items() if x is not None}
        clean[r] = v
    return " ".join(toks), clean, ev


def main():
    rows = [json.loads(l) for f in sorted(glob.glob(os.path.join(HERE, "llm_train", "*", "train_*.jsonl"))) for l in open(f) if l.strip()]
    out, why = [], collections.Counter()
    for r in rows:
        try: text, roles, ev = convert(r); out.append((ev, text, roles, f"{ev}.llm.{r.get('id', '?')[:2]}"))
        except Skip as e: why[re.sub(r":.*", "", str(e))] += 1
        except Exception as e: why[f"error {type(e).__name__}"] += 1
    wd = os.path.join(HERE, "worlds", "sketch"); sha = sha256_file(os.path.join(wd, "legend.json"))
    doc = soplang.Doc(directives=[("world", "sketch", None), ("legend", sha, None), ("generated", "training/sketch/llm_to_world.py from llm_train/", None)]); k = 0
    for ev, text, roles, template in out:
        ids = iter(f"l{k + i}" for i in range(1, 100)); ws = wires_for(ev, roles, text, template, ids); k += len(ws); doc.wires += ws
    open(os.path.join(wd, "examples", "train_llm.sop"), "w").write(soplang.write(doc))
    by_ev = collections.Counter(o[0] for o in out)
    rep = [f"# Conversion of the LLM training clauses ({len(rows)} clauses)", "", f"Converted: {len(out)} ({len(out) / max(1, len(rows)) * 100:.1f}%). Set aside: {len(rows) - len(out)}.", "",
           "| reason set aside | n |", "|---|---|"] + [f"| {k} | {v} |" for k, v in why.most_common()] + ["", "| event | converted |", "|---|---|"] + [f"| {k} | {v} |" for k, v in by_ev.most_common()]
    open(os.path.join(HERE, "llm_train", "CONVERSION.md"), "w").write("\n".join(rep) + "\n")
    print("\n".join(rep[:6])); print(dict(why.most_common(12)))


if __name__ == "__main__":
    main()
