#!/usr/bin/env python3
"""Score benchmark results: items.jsonl + results.jsonl -> scored.jsonl and a summary.
Outcome: pass | partial | fail. Failure layer assigned from the system's own trace (reason/failures/wires) plus the
expected effect. Semantic checks are deliberately loose (kind/name match, property changed, direction sign)."""
import json, re, sys, collections

items = {}
for l in open(sys.argv[1]):
    if l.strip():
        it = json.loads(l); items[it['id']] = it
res = [json.loads(l) for l in open(sys.argv[2]) if l.strip()]
OUT = sys.argv[3]

def val(v):
    if isinstance(v, list): return [val(x) for x in v]
    try: return json.loads(v)
    except Exception: return v

def lem(w):
    if isinstance(w, list): w = ' '.join(map(str, w))  # a landmark given as several objects
    w = (w or '').lower().strip()
    w = re.sub(r'^(the|a|an)\s+', '', w)
    for suf, rep in (('ies', 'y'), ('ses', 's'), ('es', 'e'), ('s', '')):
        if len(w) > 3 and w.endswith(suf) and not w.endswith('ss'):
            return w[: -len(suf)] + rep
    return w

SYN = {'node': None, 'box': 'rectangle', 'pond': 'lake', 'water': 'lake', 'child': None, 'bird': None,
       'meeting': ('meeting', 'event'), 'event': ('meeting', 'event'), 'text': None, 'avatar': 'face'}

def names(o):
    out = {lem(o.get('kind') or '')}
    for k in ('name', 'label', 'title', 'text', 'base', 'role'):
        v = o['inputs'].get(k) if k != 'role' else o.get('role')
        v = val(v) if v is not None else None
        if isinstance(v, str) and v: out.add(lem(v))
    return {x for x in out if x}

def matches(o, ref, tab):
    r = lem(ref)
    if len(r.split()) > 1 and r not in names(o):
        r = lem(r.split()[-1])
    if r in ('all', 'any', 'node', 'nodes', 'thing', 'object', 'element'):
        return o.get('kind') not in ('link',) if tab == 'diagram' else True
    if tab == 'calendar' and r in ('meeting', 'event', 'appointment', 'reminder'):
        return o.get('kind') in ('meeting', 'event')
    if tab == 'document' and r in ('text', 'paragraph', 'block', 'heading', 'section', 'list', 'table', 'story'):
        return o.get('kind') not in ('document',)
    ns = names(o)
    if r in ns: return True
    syn = SYN.get(r)
    if isinstance(syn, str) and syn in ns: return True
    return any(r and (r in n.split() or n in r.split()) for n in ns if n)

def num(o, k):
    v = val(o['inputs'].get(k)) if o['inputs'].get(k) is not None else None
    try: return float(v)
    except Exception: return None

def centre(o):
    x, y, w, h = num(o, 'x'), num(o, 'y'), num(o, 'width') or 0, num(o, 'height') or 0
    if x is None or y is None: return None
    return (x, y, w, h)

def rel_ok(o, rel, objs, tab):
    if not rel: return True
    lm = [b for b in objs if b['id'] != o['id'] and 'in' not in b and matches(b, rel.get('landmark', ''), tab)]
    a = centre(o)
    if not lm or not a: return None  # unknown
    b = centre(lm[0]); r = rel.get('rel')
    if not b: return None
    dx, dy = a[0] - b[0], a[1] - b[1]
    if r == 'left_of': return dx < 0
    if r == 'right_of': return dx > 0
    if r in ('above', 'over'): return dy < 0
    if r in ('below', 'under'): return dy > 0
    if r in ('near', 'next_to', 'beside'): return (dx * dx + dy * dy) ** .5 < 400
    if r in ('on', 'in', 'inside'): return abs(dx) < max(b[2], 60) and abs(dy) < max(b[3], 60)
    return None

HEX = {'white': '#ffffff', 'black': '#000000', 'red': '#ff0000', 'green': '#008000', 'blue': '#0000ff', 'yellow': '#ffff00', 'orange': '#ffa500',
       'purple': '#800080', 'pink': '#ffc0cb', 'brown': '#a52a2a', 'gray': '#808080', 'grey': '#808080'}
def colour_ok(o, name):
    blob = json.dumps(o['inputs']).lower(); n = str(name).lower()
    return n in blob or (HEX.get(n) and HEX[n] in blob)
def region_ok(o, pos):
    c = centre(o)
    if not c: return None
    x, y = c[0], c[1]; p = str(pos).lower(); ok = True
    if 'top' in p or 'sky' in p or 'upper' in p: ok &= y < 330
    if 'bottom' in p or 'lower' in p: ok &= y > 450
    if 'left' in p: ok &= x < 400
    if 'right' in p: ok &= x > 600
    if 'center' in p or 'centre' in p or 'middle' in p: ok &= 300 < x < 700
    return ok
COUNT = {'some': 2, 'few': 2, 'several': 3, 'many': 4, 'couple': 2}
def need(c):
    if c is None: return 1
    if isinstance(c, int): return c
    if isinstance(c, str):
        m = re.match(r'(\d+)', c)
        if m: return int(m.group(1))
        return COUNT.get(c, 2)
    return 1

def changed(o, before_by):
    b = before_by.get(o['id'])
    return b is not None and b['inputs'] != o['inputs']

def check(eff, it, r):
    tab = it['tab']; before = r.get('before') or []; after = r.get('after') or []
    bb = {o['id']: o for o in before}; ab = {o['id']: o for o in after}
    new = [o for o in after if o['id'] not in bb]
    top = [o for o in new if 'in' not in o and o.get('kind') not in ('text',)]
    t = eff['type']
    if t == 'create':
        k = eff.get('kind', 'any')
        if tab == 'calendar': cand = [o for o in new if o.get('kind') in ('meeting', 'event', 'person', 'room', 'calendar')]
        elif tab == 'document': cand = [o for o in new if o.get('kind') != 'document'] or [o for o in after if changed(o, bb)]
        elif tab == 'avatar': cand = [o for o in new] + [o for o in after if changed(o, bb)]
        else: cand = [o for o in top if matches(o, k, tab)] if k not in ('any', 'landscape') else top
        if tab == 'diagram' and k not in ('node', 'any'): cand = cand or []
        if len(cand) < need(eff.get('count')):
            return ('fail' if not cand else 'partial'), f"created {len(cand)}/{need(eff.get('count'))} {k}"
        attrs = eff.get('attrs') or {}
        col = attrs.get('colour')
        if col and not any(colour_ok(o, col) for o in cand):
            return 'partial', f'colour {col} not applied'
        pos = attrs.get('position') or attrs.get('region')
        if pos and tab == 'drawing' and not any(region_ok(o, pos) is not False for o in cand):
            return 'partial', f'position {pos} not satisfied'
        if eff.get('relation'):
            ok = rel_ok(cand[-1], eff['relation'], after, tab)
            if ok is False: return 'partial', f"relation {eff['relation'].get('rel')} not satisfied"
        return 'pass', ''
    if t in ('change', 'move'):
        tgt = eff.get('target', '')
        if tab == 'avatar' and lem(tgt) in ('avatar', 'face', 'her', 'him', 'me', 'it'):
            cands = after
        else:
            cands = [o for o in after if matches(o, tgt, tab)]
            ids = {o['id'] for o in cands}
            cands += [o for o in after if o.get('in') in ids]
        ch = [o for o in cands if changed(o, bb)]
        if not ch:
            anych = [o for o in after if changed(o, bb)] or new
            return 'fail', ('changed something else' if anych else 'nothing changed')
        if t == 'move' and eff.get('direction') in ('up', 'down', 'left', 'right'):
            d = eff['direction']; ok = False
            for o in ch:
                b = bb[o['id']]; key = 'y' if d in ('up', 'down') else 'x'
                if tab == 'calendar': break
                nb, na = num(b, key), num(o, key)
                if nb is None or na is None: continue
                if (d in ('up', 'left') and na < nb) or (d in ('down', 'right') and na > nb): ok = True
            if not ok and tab != 'calendar': return 'partial', f'moved but not {d}'
        v = eff.get('value')
        if t == 'change' and v and eff.get('property') in ('colour', 'color') and tab in ('drawing', 'diagram'):
            if not any(colour_ok(o, v) for o in ch): return 'partial', f'colour != {v}'
            return 'pass', ''
        if t == 'change' and v and eff.get('property') in ('colour', 'expression', 'preset', 'variant', 'label', 'title', 'kind'):
            if not any(lem(v) in json.dumps(o['inputs']).lower() for o in ch):
                return 'partial', f"{eff.get('property')} != {v}"
        return 'pass', ''
    if t == 'remove':
        tgt = eff.get('target', '')
        gone = [o for o in before if o['id'] not in ab and matches(o, tgt, tab)]
        return ('pass', '') if gone else ('fail', 'target still present')
    if t == 'connect':
        links = [o for o in new if o.get('kind') == 'link']
        return ('pass', '') if links else ('fail', 'no link created')
    if t == 'layout':
        moved = [o for o in after if o['id'] in bb and changed(o, bb)]
        return ('pass', '') if len(moved) >= 2 else ('fail', 'no rearrangement')
    if t == 'query':
        stc = [o for o in after if changed(o, bb)] or new
        ans = (r.get('answer') or '')
        if stc: return 'fail', 'query changed state'
        if 'unsupported' in (r.get('statuses') or []) or re.search(r'could not|Nothing changed', ans):
            return 'fail', 'no answer'
        ac = eff.get('answer_contains') or []
        if ac and not all(a.lower() in ans.lower() for a in ac): return 'partial', 'answer lacks expected content'
        return 'pass', ''
    if t == 'no_change':
        stc = [o for o in after if changed(o, bb)] or new or [o for o in before if o['id'] not in ab]
        return ('fail', 'state changed') if stc else ('pass', '')
    return 'fail', f'unknown effect {t}'

def layer(r, outcome, notes):
    reason = r.get('reason') or ''; fl = r.get('failures') or []; wires = r.get('wires') or []
    j = ' '.join(fl)
    if r.get('error'): return 'execution', 'exception: ' + r['error'][:80]
    if outcome == 'pass': return None, ''
    sup = 'supported' in (r.get('statuses') or [])
    if sup or (r.get('after') != r.get('before')):
        return 'semantics', 'wrong/partial outcome: ' + '; '.join(notes)[:120]
    if 'cross-area-key' in j: return 'reader', 'cross-area key'
    if any(x in j for x in ('presence-span-inconsistent', 'illegal-I-after-O', 'metadata-presence-inconsistent', 'incomplete-model-coverage', 'ambiguous-global-mention')):
        return 'reader', 'inconsistent/incomplete parse'
    if 'unresolved-canonical-kind-binding' in j: return 'bindings', 'kind word not bound'
    if 'unresolved-canonical-property-binding' in j or 'unresolved-value-representation' in j: return 'representation', 'predicted key/value has no binding/representation'
    if 'unresolved-anchor-reference' in j or 'unresolved' in j and 'reference' in j: return 'bindings', 'reference not resolved'
    if reason in ('no-declared-action',): return 'rule/operation', 'no declared action'
    if reason in ('native-binding-gap',): return 'compiler', 'tool arguments not bound'
    if reason in ('unapplied-scheduling-details',): return 'compiler', 'scheduling details not applied'
    if re.search(r'not-in-catalog|not-in-area|refuse|not-declared', reason): return 'rule/operation', reason
    if reason == 'reading' and not wires and not fl: return 'reader', 'no request read'
    if reason == 'reading': return 'reader', 'reading failed: ' + (fl[0][:60] if fl else '')
    return 'other', reason or 'unknown'

summary = collections.defaultdict(collections.Counter); layers = collections.defaultdict(collections.Counter)
with open(OUT, 'w') as f:
    for r in res:
        it = items.get(r['id'])
        if not it: continue
        if it.get('setup'): continue
        if r.get('error'):
            outcome, notes = 'fail', ['exception']
        else:
            results = [check(e, it, r) for e in it['expect']['effects']]
            outs = [x[0] for x in results]; notes = [x[1] for x in results if x[1]]
            outcome = 'pass' if all(o == 'pass' for o in outs) else ('partial' if any(o in ('pass', 'partial') for o in outs) else 'fail')
        ly, why = layer(r, outcome, notes)
        rec = {'id': it['id'], 'tab': it['tab'], 'text': it['text'], 'owner': it['id'].startswith('owner-'), 'outcome': outcome, 'notes': notes,
               'layer': ly, 'why': why, 'reason': r.get('reason'), 'answer': (r.get('answer') or '')[:200], 'failures': (r.get('failures') or [])[:4],
               'wires': [w[:400] for w in (r.get('wires') or [])][:2], 'construction': it.get('construction', []), 'expect': it['expect']['effects']}
        f.write(json.dumps(rec) + '\n')
        summary[it['tab']][outcome] += 1
        if ly: layers[it['tab']][ly] += 1
for tab in sorted(summary):
    s = summary[tab]; n = sum(s.values())
    print(f"{tab:9s} n={n:4d} pass={s['pass']:4d} ({100*s['pass']/n:4.1f}%) partial={s['partial']:3d} fail={s['fail']:4d} | layers {dict(layers[tab])}")
