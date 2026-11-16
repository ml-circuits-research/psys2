"""make_roles.py: rows for the neural reader's joint model (training/neural/finetune_roles.py): one request span -> its act, the value of
each legend question that has values (one class per value, or none), and a B / I / O role tag per word for the questions whose answer is
written in the request (names, a new name, a label text, a number).

Same data and the same split as make_data.py (its split_messages: the span-annotated messages minus the fixed 1000-message sample, 10% of
the messages held out by message id, seed 0; the sample and the docs/bench sets are exported as eval sets, never trained on).

The legend (docs/js/logic.js, read with node) decides how each gold key is learned:
  - action / ask                    -> the act (as make_data.py; the act set of docs/js/neural.js)
  - a key whose legend question has values (color, shape, size, position, style, arrow, pairing, ...) -> a class head over
    "none" + the values that key takes in the training gold. No word alignment is needed: the head reads the whole request.
  - a key without values (kinds names, name, text, number: target, anchor, from, to, linked, name, label, count, distance) -> B-key /
    I-key tags on the words of the request that carry the gold value, found by aligning the value to the words:
      * a name, a label text, a number written in digits: the same word sequence in the request (case-insensitive), first free occurrence;
      * "$new" (a shape created earlier in the same message): the name that create gave it, when the request writes that name;
      * a number written as a word ("three"): learned by co-occurrence on the training rows (below);
      * a mention (mention(...)) or a name the request does not write ("it", "them"): not tagged; the filler-kind and description heads
        below read them.
Who fills each name-role (SOP-BERT reads it itself; owner, 2026-11-02: no reference may come from the rules' reading). For every key of
legend kind "names" (target, from, to, anchor, linked ...: REF keys), a class head "fill:<key>" over
  none        the request has no such role;
  written     every value is a name written in the request (or "$new" whose created name is written): the B / I / O tags give it;
  context     a value the request does not write: a pronoun or a vague reference ("it", "them", "the new one", "$new" with no name
              written, "the cities" for names created earlier). The value is taken AFTER reading by the context rule all readers share
              (docs/js/vss-composer.js nextContext: the last shape created or named), not by the model;
  description a mention(...) value ("the red square", "all circles", "the newest one", "every square that is not blue").
and, for the description, one class head "desc:<key>" per key the gold mentions use (quantifier, color, notColor, shape, recency, ... as
found in the training gold, mapped to the legend's key case-insensitively): "none" or a value. The description heads read the request once,
not per role: in the data no request has two described roles (counted below: "requests with 2+ described roles"), so one description per
request loses nothing; if one appears, the first described role in REF key order is the one the heads learn and the count says so.
The fill and desc heads are extra entries of reader.json "classes" (names "fill:<key>", "desc:<key>"), so the model, the export and
docs/js/neural.js makeReader decode them as any class head; reader.json "ref_keys" and "desc_keys" list them.
Counts (printed, saved in coverage.json "fillers"): per REF key and set, the fillers of each kind; requests with 2+ described / context roles;
context fillers that are a list ("them" -> several names: the shared context rule gives one shape, so these cannot come out right); and
the share of context fillers the shared rule gives right when every earlier request of the message is read right (an upper bound).
Co-occurrence alignment (training rows only): for key k, value v and a word w of the request, J(k,v,w) = n(k=v, w) / (n(k=v) + n(w) -
n(k=v, w)) over request spans (Jaccard). In a request with k=v, the word with the highest J is aligned when v is also that word's best
value of k (both directions agree); otherwise the value counts as not aligned. It is used for number words (the learned word -> number map
is saved with the model) and, as evidence only, for the class keys: how many of their gold values a single word of the request expresses.

Cutting (the model cuts the message itself): per message, a B / I / O tag per word of the WHOLE message (B first word of a gold span, I inside,
O outside every span) -> cut_train.jsonl, cut_heldout.jsonl, cut_eval_sample1000.jsonl (same split); finetune_roles.py trains a separate token head on them.
Spans of every annotated request count, also those whose act is not in the act set. Only with --none-rows (comparison, not the default):
No request (act "none"): the text outside every annotated span is learned as the act "none", with no class and no role labels. The pieces are
cut the way the reader sees them at use time: the rules' segmenter (docs/js/logic.js createSystem().formalize(text, ctx).segments, the
units docs/js/neural.js reads) is run on every message of the set (train, held-out, sample), and a segment that overlaps no gold span (no
word of it aligned to a word inside a span) is a "none" row. The segments the gold spans cover are not duplicated: the gold span is the row.
The bench sets (one request per text, no spans) have no "none" rows. The counts are printed and saved in coverage.json.

Words: the request split by WORD_RE (letters/digits runs, every other non-space character alone), the same split docs/js/neural.js
uses (WORD_RE there). Output (default ~/vss-box/ft/roles): train.jsonl, heldout.jsonl, eval_<set>.jsonl, reader.json (the head layout
the model folder's config.json carries: acts, tags, class keys and values, act_keys, number_words, word_re), coverage.json.
Run: python3 training/neural/make_roles.py [--out DIR] [--sample-ids FILE] [--seed 0]
"""
import argparse, collections, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import make_data as MD

REPO = MD.REPO
WORD_RE = r"[^\W_]+|[^\w\s]|_"          # docs/js/neural.js WORD_RE: /[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu
WORD = re.compile(WORD_RE)
ACT_KEYS = {"action", "ask"}
FILL = ["none", "written", "context", "description"]


def is_list(v):
    return len(parts(v)) > 1


def mention_args(p):
    """"mention(color=red,shape=circle)" -> {"color": "red", "shape": "circle"}"""
    return dict(kv.split("=", 1) for kv in parts(p[len("mention("):-1]) if "=" in kv)


def filler_kind(ws, v, created):
    """the kind of one role's gold value: written / context / description (FILL)"""
    ps = parts(v); low = [w[0].lower() for w in ws]
    if any(p.startswith("mention(") for p in ps): return "description"
    def written(p):
        if p == "$new": return any(find_seq(ws, [w[0].lower() for w in words(n)], set()) is not None for n in created)
        return find_seq(ws, [w[0].lower() for w in words(p)], set()) is not None
    return "written" if all(written(p) for p in ps) else "context"
SPAN_KINDS = {"names", "name", "text", "number"}


def legend():
    """{key: {kind, values}} from docs/js/logic.js (the legend is the only hand-written input)"""
    js = ("const K=require(process.argv[1]);const L=K.createSystem().engine.legend;const o={};"
          "for(const [k,q] of L.questions)o[k]={kind:q.kind,values:q.values?Object.keys(q.values):null};console.log(JSON.stringify(o))")
    r = subprocess.run(["node", "-e", js, os.path.join(REPO, "docs", "js", "logic.js")], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def words(text):
    return [(m.group(0), m.start(), m.end()) for m in WORD.finditer(text)]


def parts(v):
    """split "a,b" at commas outside parentheses (bench-canon.js parts)"""
    out, d, cur = [], 0, ""
    for ch in str(v):
        if ch == "(": d += 1
        if ch == ")": d -= 1
        if ch == "," and d == 0: out.append(cur.strip()); cur = ""
        else: cur += ch
    out.append(cur.strip())
    return [p for p in out if p]


def find_seq(ws, seq, taken):
    """first start index where the lower-cased word sequence seq occurs in ws with none of its words taken"""
    n = len(seq)
    if not n: return None
    low = [w[0].lower() for w in ws]
    for i in range(len(ws) - n + 1):
        if low[i:i + n] == seq and not any(j in taken for j in range(i, i + n)): return i
    return None


SEG_JS = ("const K=require(process.argv[1]);const fs=require('fs');const ms=JSON.parse(fs.readFileSync(0,'utf8'));const sys=K.createSystem();"
          "console.log(JSON.stringify(ms.map(t=>{try{return sys.formalize(t,{names:[],last:[],spans:null}).segments.map(s=>s.src)}catch(e){return []}})))")


def segments(texts):
    """the units the rules' segmenter cuts each text into (what neural.js reads at use time)"""
    r = subprocess.run(["node", "-e", SEG_JS, os.path.join(REPO, "docs", "js", "logic.js")], input=json.dumps(texts), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def span_words(text, spans):
    """indices (in words(text)) of the words inside a gold span; each span is found at its first occurrence not overlapping an earlier span"""
    ws = words(text); inside = set(); used = []
    for sp in spans:
        i = -1
        while True:
            i = text.find(sp, i + 1)
            if i < 0 or not any(i < b and i + len(sp) > a for a, b in used): break
        if i < 0: continue
        used.append((i, i + len(sp)))
        inside |= {k for k, w in enumerate(ws) if w[1] >= i and w[2] <= i + len(sp)}
    return ws, inside


def cut_tags(text, spans):
    """(words, B / I / O per word of the whole message): each span at its first occurrence not overlapping an earlier span"""
    ws = words(text); tg = ["O"] * len(ws); used = []
    for sp in spans:
        i = -1
        while True:
            i = text.find(sp, i + 1)
            if i < 0 or not any(i < b and i + len(sp) > a for a, b in used): break
        if i < 0: continue
        idx = [k for k, w in enumerate(ws) if w[1] >= i and w[2] <= i + len(sp)]
        if not idx: continue
        used.append((i, i + len(sp)))
        for n, k in enumerate(idx): tg[k] = "B" if n == 0 else "I"
    return ws, tg


def none_rows(msgs):
    """(message id, segment, "none", {}, "none", []) per segment of the rules' segmenter that overlaps no gold span"""
    import difflib
    out = []; segs = segments([m["text"] for m in msgs])
    for m, ss in zip(msgs, segs):
        ws, inside = span_words(m["text"], [w["span"] for w in m.get("wires", []) if w.get("span")])
        low = [w[0].lower() for w in ws]
        for s in ss:
            sw = [w[0].lower() for w in words(s)]
            if not any(re.match(r"[^\W_]", w) for w in sw): continue
            hit = any(b.size and any(j in inside for j in range(b.a, b.a + b.size)) for b in
                      [type("B", (), {"a": b.a, "size": b.size}) for b in difflib.SequenceMatcher(None, low, sw, autojunk=False).get_matching_blocks()])
            if not hit: out.append((m["id"], s, "none", {}, "none", []))
    return out


def requests(msgs, ACTS, skipped):
    """(message id, span, type, args, act, names created earlier in the message) per annotated request"""
    out = []
    for m in msgs:
        created = []
        for w in m.get("wires", []):
            sp, args = w.get("span"), w.get("args", {}); a = MD.act_of(w.get("type"), args)
            if not sp or sp not in m["text"]: skipped["span missing or not in text"] += 1
            elif a not in ACTS: skipped[f"act not in neural.js set: {a}"] += 1
            else: out.append((m["id"], sp, w.get("type"), args, a, list(created)))
            if args.get("action") in ("create", "duplicate") and args.get("name"): created.append(str(args["name"]))
    return out


class Cooc:
    """span-level co-occurrence of (key, value) with the lower-cased words of the request (training rows only)"""
    def __init__(self):
        self.nv, self.nw, self.nvw = collections.Counter(), collections.Counter(), collections.Counter()

    def add(self, ws, kv):
        W = {w[0].lower() for w in ws if re.match(r"[^\W_]", w[0])}
        for w in W: self.nw[w] += 1
        for k, v in kv:
            self.nv[(k, v)] += 1
            for w in W: self.nvw[(k, v, w)] += 1

    def j(self, k, v, w):
        n = self.nvw[(k, v, w)]
        return n / (self.nv[(k, v)] + self.nw[w] - n) if n else 0.0

    def best_value(self, k, w, values):
        return max(values, key=lambda v: self.j(k, v, w)) if values else None

    def align(self, ws, k, v, values, taken):
        """index of the word expressing k=v in ws (both directions agree), else None"""
        cand = [(self.j(k, v, w[0].lower()), i) for i, w in enumerate(ws) if i not in taken and re.match(r"[^\W_]", w[0])]
        cand = [c for c in cand if c[0] > 0]
        if not cand: return None
        _, i = max(cand)
        return i if self.best_value(k, ws[i][0].lower(), values) == v else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.expanduser("~/vss-box/ft/roles"))
    ap.add_argument("--sample-ids", default=os.path.join(HERE, "sample1000_ids.txt"))
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--none-rows", action="store_true", help="comparison only: also the act \"none\" (segments of the rules' segmenter outside every span); the model cuts by itself now")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    LEG = legend()
    ACTION, ASK = MD.acts_from_neural_js(); ACTS = ACTION + ASK + ["fact", "rule"] + (["none"] if a.none_rows else [])
    skipped = collections.Counter()
    train_msgs, held, sample_msgs, missing = MD.split_messages(a.sample_ids, a.seed)
    pools = {"train": [m for m in train_msgs if m["id"] not in held], "heldout": [m for m in train_msgs if m["id"] in held], "eval_sample1000": sample_msgs}
    sets = {n: requests(ms, ACTS, skipped) for n, ms in pools.items()}
    nreq = {n: len(r) for n, r in sets.items()}
    for n, ms in pools.items():
        if a.none_rows: sets[n] += none_rows(ms)
    for s in MD.EVAL:
        rows = []
        for i, r in enumerate(json.load(open(os.path.join(REPO, "docs", "bench", s + ".json"), encoding="utf8"))):
            if "wires" in r: skipped[f"bench {s}: multi-request message without spans"] += 1; continue
            ac = MD.act_of(r["type"], r["gold"]); ac = next((x for x in ACTS if x.lower() == str(ac).lower()), ac)
            if ac not in ACTS: skipped[f"bench {s}: act {ac}"] += 1; continue
            args = dict(r["gold"])
            if "action" in args: args["action"] = ac
            if "ask" in args: args["ask"] = ac
            rows.append((f"{s}-{i}", r["text"], r["type"], args, ac, []))
        sets["eval_" + s] = rows

    # which keys are learned how: from the legend kind, for the keys the training gold uses
    train = sets["train"]; used = collections.Counter(k for x in train for k in x[3])
    unknown = sorted(k for k in used if k not in LEG)
    if unknown: print("gold keys not in the legend (not learned):", unknown)
    class_keys = sorted(k for k in used if k in LEG and k not in ACT_KEYS and LEG[k]["values"])
    span_keys = sorted(k for k in used if k in LEG and k not in ACT_KEYS and not LEG[k]["values"] and LEG[k]["kind"] in SPAN_KINDS)
    other = sorted(k for k in used if k in LEG and k not in ACT_KEYS and k not in class_keys and k not in span_keys)
    if other: print("gold keys of another legend kind (not learned):", other)
    values = {k: sorted({str(x[3][k]) for x in train if k in x[3]}) for k in class_keys}
    act_keys = {ac: sorted({k for x in train if x[4] == ac for k in x[3] if k in class_keys or k in span_keys}) for ac in ACTS}
    tags = ["O"] + [f"{p}-{k}" for k in span_keys for p in ("B", "I")]
    # who fills each name-role (FILL) and the description's own keys (see the head of the file)
    ref_keys = [k for k in span_keys if LEG[k]["kind"] == "names"]
    DKEY = {k.lower(): k for k in LEG}
    dvals = collections.defaultdict(set); dunknown = collections.Counter()
    for x in train:
        for k in ref_keys:
            for p in parts(x[3].get(k, "")) if k in x[3] else []:
                if not p.startswith("mention("): continue
                for dk, dv in mention_args(p).items():
                    if dk.lower() in DKEY: dvals[DKEY[dk.lower()]].add(dv)
                    else: dunknown[dk] += 1
    if dunknown: print("description keys not in the legend (not learned):", dict(dunknown))
    desc_keys = sorted(dvals)
    fill_classes = [["fill:" + k, FILL] for k in ref_keys] + [["desc:" + k, ["none"] + sorted(dvals[k])] for k in desc_keys]

    # co-occurrence on the training rows: number words (count / distance written as a word) and, as evidence, every class key
    co = Cooc()
    for (_i, sp, _t, args, _a, _c) in train:
        kv = [(k, str(args[k])) for k in class_keys if k in args]
        kv += [(k, p) for k in span_keys if LEG[k]["kind"] == "number" and k in args for p in parts(args[k])]
        co.add(words(sp), kv)
    numvals = {k: sorted({p for x in train if k in x[3] for p in parts(x[3][k])}) for k in span_keys if LEG[k]["kind"] == "number"}

    def label(row, cov, numword):
        rid, sp, typ, args, act, created = row
        ws = words(sp); tag = ["O"] * len(ws); taken = {}
        for k in span_keys:
            if k not in args: continue
            for p in parts(args[k]):
                c = cov[k]; c["values"] += 1
                if p == "$new":
                    seqs = [[w[0].lower() for w in words(n)] for n in reversed(created)]
                    hit = next((s for s in seqs if find_seq(ws, s, taken) is not None), None)
                    if hit is None: c["reference $new (no name written)"] += 1; continue
                    seq, how = hit, "$new: name written"
                elif p.startswith("mention("): c["reference mention(...)"] += 1; continue
                else: seq, how = [w[0].lower() for w in words(p)], "written"
                i = find_seq(ws, seq, taken)
                if i is None and LEG[k]["kind"] == "number":
                    i = co.align(ws, k, p, numvals[k], taken)
                    if i is not None: seq, how = [ws[i][0].lower()], "number word (co-occurrence)"; numword[ws[i][0].lower()][p] += 1
                if i is None:
                    low = {w[0].lower() for w in ws}
                    c["already tagged for another key" if seq and all(s in low for s in seq) else "not written in the request"] += 1; continue
                c["aligned: " + how] += 1
                for j in range(i, i + len(seq)): tag[j] = ("B-" if j == i else "I-") + k; taken[j] = k
        classes = {k: str(args[k]) for k in class_keys if k in args}
        for k in ref_keys:
            if k in args: classes["fill:" + k] = filler_kind(ws, str(args[k]), created)
        d = next((p for k in ref_keys if k in args for p in parts(args[k]) if p.startswith("mention(")), None)
        if d is not None:
            for dk, dv in mention_args(d).items():
                if DKEY.get(dk.lower()) in desc_keys: classes["desc:" + DKEY[dk.lower()]] = dv
        return {"id": rid, "text": sp, "words": [w[0] for w in ws], "tags": tag, "act": act, "classes": classes, "gold": args}

    def fillers(rows, out):
        """per REF key: the gold fillers of each kind; requests with 2+ described / context roles; context fillers that are a list; and the
        context fillers the shared context rule (nextContext, on the gold of the earlier requests of the message) gives right"""
        per = {k: collections.Counter() for k in ref_keys}; multi_d = multi_c = 0; ctx_list = collections.Counter(); rule = collections.Counter()
        last, prev = [], None
        for r, o in zip(rows, out):
            if r[0] != prev: last, prev = [], r[0]   # a new message: the context starts empty (as the scorer: ctx.last = [])
            args, kinds = r[3], {k: o["classes"].get("fill:" + k) for k in ref_keys if k in r[3]}
            for k, kd in kinds.items():
                per[k][kd] += 1
                if kd == "context":
                    if is_list(str(args[k])): ctx_list[k] += 1
                    rule[k + (" right" if len(last) == 1 and last[0].lower() == str(args[k]).lower() else " wrong")] += 1
            multi_d += sum(v == "description" for v in kinds.values()) > 1; multi_c += sum(v == "context" for v in kinds.values()) > 1
            if args.get("action") == "create": last = ["$new"]          # nextContext with the gold args of this request
            elif args.get("target") is not None and not is_list(str(args["target"])): last = [str(args["target"])]
            elif args.get("action") == "connect" and args.get("to") is not None and not is_list(str(args["to"])): last = [str(args["to"])]
        return {"per key": {k: dict(v) for k, v in per.items()}, "requests with 2+ described roles": multi_d, "requests with 2+ context roles": multi_c,
                "context fillers that are a list": dict(ctx_list), "context fillers the shared rule gives right (gold context)": dict(rule)}

    numword = collections.defaultdict(collections.Counter)
    coverage = {}
    for name, rows in sets.items():
        cov = collections.defaultdict(collections.Counter)
        out = [label(r, cov, numword if name == "train" else collections.defaultdict(collections.Counter)) for r in rows]
        with open(os.path.join(a.out, name + ".jsonl"), "w", encoding="utf8") as f:
            for r in out: f.write(json.dumps(r, ensure_ascii=False) + "\n")
        # evidence for the class keys: does one word of the request express the value?
        ccov = {}
        for k in class_keys:
            n = al = 0; pairs = collections.Counter()
            for r in rows:
                if k not in r[3]: continue
                n += 1; v = str(r[3][k]); ws = words(r[1]); i = co.align(ws, k, v, values[k], set())
                if i is not None: al += 1; pairs[(ws[i][0].lower(), v)] += 1
            ccov[k] = {"values": n, "one word expresses it (co-occurrence, both directions)": al, "top word->value": [f"{w}->{v} {c}" for (w, v), c in pairs.most_common(8)]}
        coverage[name] = {"span keys": {k: dict(v) for k, v in cov.items()}, "class keys": ccov, "rows": len(out), "fillers": fillers(rows, out)}
    number_words = {w: c.most_common(1)[0][0] for w, c in numword.items()}
    reader = {"cut": {"tags": ["O", "B", "I"], "max_length": 512}, "acts": ACTS, "tags": tags, "span_keys": span_keys, "ref_keys": ref_keys, "desc_keys": desc_keys,
              "classes": [[k, ["none"] + values[k]] for k in class_keys] + fill_classes,
              "act_keys": act_keys, "number_words": number_words, "word_re": "[\\p{L}\\p{N}]+|[^\\s\\p{L}\\p{N}]", "max_length": 128}
    json.dump(reader, open(os.path.join(a.out, "reader.json"), "w"), indent=1)
    cutn = {}
    for n, ms in pools.items():
        nsp = nw = 0
        with open(os.path.join(a.out, "cut_" + n.replace("eval_", "eval_") + ".jsonl"), "w", encoding="utf8") as f:
            for m in ms:
                ws, tg = cut_tags(m["text"], [w["span"] for w in m.get("wires", []) if w.get("span")])
                f.write(json.dumps({"id": m["id"], "text": m["text"], "words": [w[0] for w in ws], "tags": tg}, ensure_ascii=False) + "\n")
                nw += len(ws); nsp += tg.count("B")
        cutn[n] = {"messages": len(ms), "words": nw, "spans": nsp, "words outside every span": None}
    coverage["cut"] = cutn
    print("cut rows (whole messages, B/I/O per word): " + ", ".join(f"{n} {c['messages']} messages {c['spans']} spans" for n, c in cutn.items()))
    coverage["none"] = {n: {"requests": nreq[n], "none": len(sets[n]) - nreq[n], "none share": round((len(sets[n]) - nreq[n]) / max(len(sets[n]), 1), 4)} for n in nreq}
    coverage["skipped"] = dict(skipped); coverage["sample1000_missing"] = len(missing)
    json.dump(coverage, open(os.path.join(a.out, "coverage.json"), "w"), indent=1)

    print(f"rows: " + ", ".join(f"{k} {coverage[k]['rows']}" for k in sets))
    print("none rows (segments of the rules' segmenter that overlap no gold span): " + ", ".join(f"{n} {c['none']}/{c['none'] + c['requests']} = {c['none share'] * 100:.1f}%" for n, c in coverage["none"].items()))
    print(f"class keys ({len(class_keys)}): " + ", ".join(f"{k}({len(values[k])})" for k in class_keys))
    print(f"span keys ({len(span_keys)}): {', '.join(span_keys)}; tags {len(tags)}; number words learned: {number_words}")
    print("\nspan keys, training rows: gold values aligned to words")
    for k, c in sorted(coverage["train"]["span keys"].items()):
        n = c["values"]; al = sum(v for kk, v in c.items() if kk.startswith("aligned"))
        print(f"  {k:9} {al:5}/{n:5} = {al / n * 100:5.1f}%  " + " · ".join(f"{kk} {v}" for kk, v in sorted(c.items()) if kk != "values"))
    print("\nclass keys, training rows (evidence only; the class head needs no alignment): one word expresses the value")
    for k, c in coverage["train"]["class keys"].items():
        n = c["values"]; al = c["one word expresses it (co-occurrence, both directions)"]
        print(f"  {k:11} {al:5}/{n:5} = {al / max(n, 1) * 100:5.1f}%   e.g. {', '.join(c['top word->value'][:5])}")
    print(f"\nwho fills the name-roles (REF keys {ref_keys}; desc keys {desc_keys}): written / context / description of the gold fillers")
    for n in ("train", "heldout", "eval_sample1000"):
        F = coverage[n]["fillers"]; print(f"  {n}:")
        for k, c in F["per key"].items():
            t = sum(c.values())
            if t: print(f"    {k:7} {t:6} fillers: " + " · ".join(f"{kd} {c.get(kd, 0)} ({c.get(kd, 0) / t * 100:.1f}%)" for kd in FILL[1:]))
        t = {kd: sum(c.get(kd, 0) for c in F["per key"].values()) for kd in FILL[1:]}; T = sum(t.values())
        print(f"    all     {T:6} fillers: " + " · ".join(f"{kd} {v} ({v / max(T, 1) * 100:.1f}%)" for kd, v in t.items()))
        print(f"    requests with 2+ described roles {F['requests with 2+ described roles']} · with 2+ context roles {F['requests with 2+ context roles']}"
              f" · context fillers that are a list (several names) {sum(F['context fillers that are a list'].values())} {F['context fillers that are a list']}")
        rr = F["context fillers the shared rule gives right (gold context)"]
        ok = sum(v for k, v in rr.items() if k.endswith(" right")); tot = sum(rr.values())
        print(f"    context fillers the shared rule (nextContext, gold earlier requests) gives right: {ok}/{tot} = {ok / max(tot, 1) * 100:.1f}%  {rr}")
    if skipped: print("skipped:", dict(skipped))


if __name__ == "__main__": main()
