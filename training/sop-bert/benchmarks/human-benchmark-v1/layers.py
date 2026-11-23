#!/usr/bin/env python3
"""Multi-label failure analysis + static expressibility of expected effects in the current label scheme.
usage: layers.py BINDINGS.json INVENTORY.json  tab:items.jsonl:results.out:scored.jsonl ...  > layers.json"""
import json, sys, re, collections

B = json.load(open(sys.argv[1])); INV = json.load(open(sys.argv[2]))
BOUND = {p['area'] + '.' + p['key'] for p in B['properties']}
KEYS = {a + '.' + t + '.' + k for a in ('diagram', 'drawing', 'calendar', 'document', 'avatar') for t, v in INV[a].items() for k in v['keys']}

def need_keys(tab, e):
    """Return list of required (area.type.key) for an expected effect; None entry = no key exists in scheme."""
    t = e['type']; p = (e.get('property') or '').lower(); a = e.get('attrs') or {}
    req = []
    if tab == 'drawing':
        if t == 'create':
            c = e.get('count')
            if isinstance(c, int) and c > 1: req.append('drawing.drawn.count')
            elif isinstance(c, str): req.append(None)  # vague quantity: no representation
            if 'colour' in a: req.append('drawing.drawn.colour')
            if 'size' in a: req.append('drawing.drawn.size')
            if set(a) - {'colour', 'size'}: req.append(None)
            if e.get('relation'): req += ['drawing.drawn.relation', 'drawing.drawn.anchor']
        elif t == 'change':
            if p in ('colour', 'color'): req.append('drawing.drawn.colour')
            elif p in ('size',): req.append('drawing.drawn.size')
            elif p in ('width', 'height', 'label', 'name'): req.append('drawing.drawn.' + p)
            elif p in ('part',): req.append(None)
            else: req.append(None)
        elif t == 'move':
            if e.get('direction'): req.append('drawing.drawn.direction')
            if e.get('relation'): req += ['drawing.drawn.relation', 'drawing.drawn.anchor']
        elif t == 'layout': req.append(None)
    elif tab == 'diagram':
        if t == 'create':
            c = e.get('count')
            if c not in (None, 1): req.append('diagram.node.n' if isinstance(c, int) else None)
            if e.get('kind') in ('chart', 'bar chart', 'pie chart', 'line chart'): req.append('diagram.chart.type')
            if 'colour' in a: req.append('diagram.node.colour')
            if e.get('relation'): req += ['diagram.node.relation', 'diagram.node.anchor']
        elif t == 'connect': req += ['diagram.link.from', 'diagram.link.to']
        elif t == 'layout':
            arr = (e.get('arrangement') or '').lower()
            req.append('diagram.node.layout' if arr in ('tree', 'grid', 'row', 'column', 'circle', 'radial', 'layers') else None)
        elif t == 'change':
            m = {'colour': 'diagram.node.colour', 'size': 'diagram.node.size', 'label': 'diagram.node.label', 'kind': 'diagram.node.kind',
                 'style': 'diagram.link.style', 'title': 'diagram.chart.title', 'type': 'diagram.chart.type', 'arrow': 'diagram.link.arrow'}
            req.append(m.get(p))
        elif t == 'move': req.append(None if e.get('direction') else 'diagram.node.position')
    elif tab == 'calendar':
        if t == 'create':
            for k, key in (('title', 'calendar.meeting.title'), ('time', 'calendar.meeting.time'), ('day', 'calendar.meeting.day'),
                           ('duration_min', 'calendar.meeting.duration'), ('participants', 'calendar.meeting.participants'), ('room', 'calendar.meeting.room')):
                if k in a: req.append(key)
            if set(a) - {'title', 'time', 'day', 'duration_min', 'participants', 'room'}: req.append(None)
        elif t in ('move', 'change'):
            m = {'start': 'calendar.meeting.start', 'time': 'calendar.meeting.time', 'day': 'calendar.meeting.day', 'duration': 'calendar.meeting.duration',
                 'title': 'calendar.meeting.title', 'participants': 'calendar.meeting.participants', 'room': 'calendar.meeting.room', 'notes': 'calendar.meeting.notes'}
            req.append(m.get(p, 'calendar.meeting.start' if t == 'move' else None))
    elif tab == 'document':
        m = {'mark': 'document.block.mark', 'align': 'document.block.align', 'text': 'document.block.text', 'kind': 'document.block.kind',
             'level': 'document.block.level', 'title': 'document.document.title', 'tone': 'document.text.tone', 'length': 'document.text.length'}
        if t == 'create':
            if 'genre' in a: req.append('document.text.genre')
            if 'topic' in a: req.append('document.text.about')
            if not a: req.append('document.block.text')
        elif t == 'change': req.append(m.get(p))
        elif t == 'move': req.append('document.section.order')
    elif tab == 'avatar':
        m = {'colour': 'avatar.part.colour', 'variant': 'avatar.part.variant', 'size': 'avatar.part.size', 'length': 'avatar.part.length',
             'expression': 'avatar.face.expression', 'preset': 'avatar.face.preset', 'scale': 'avatar.face.scale'}
        if t == 'create': req.append('avatar.part.variant')
        elif t == 'change': req.append(m.get(p))
        elif t == 'move': req.append('avatar.part.place')
    if t in ('query',): req.append('request.question.ask')
    return req

def express(tab, effects):
    st = 'bound'
    for e in effects:
        for k in need_keys(tab, e):
            if k is None or k not in KEYS and not k.startswith('request.'): return 'no-key'
            if not k.startswith('request.') and k not in BOUND: st = 'key-unbound'
    return st

def flags(r):
    fl = r.get('failures') or []; j = ' '.join(fl); f = set()
    if r.get('error'): f.add('execution:exception')
    if re.search(r'presence-span-inconsistent|illegal-I-after-O|metadata-presence-inconsistent|presence-class-inconsistent|act-anchor|field-anchor|ambiguous-global-mention', j): f.add('reader:inconsistent-heads')
    if 'cross-area-key' in j: f.add('reader:cross-area-key')
    if not fl and not r.get('wires') and r.get('reason') == 'reading': f.add('reader:no-request')
    if 'unresolved-canonical-property-binding' in j or 'unresolved-value-representation' in j: f.add('binding:property-key-unbound')
    if 'unresolved-canonical-kind-binding' in j: f.add('binding:kind-word-unbound')
    if re.search(r'context-reference-not-bound|unresolved-anchor-reference|unprojected-population-reference', j): f.add('binding:reference')
    if re.search(r'requires-declared-(query|step)-projection', j): f.add('compiler:no-query/step-projection')
    rs = r.get('reason') or ''
    if rs in ('native-binding-gap', 'unapplied-scheduling-details', 'tool-binding', 'unbound-target'): f.add('compiler:' + rs)
    if rs in ('no-declared-action',) or re.search('not-in-catalog|not-in-area|refuse', rs): f.add('rule/operation:' + rs)
    return f

ORDER = ['execution', 'reader', 'binding', 'compiler', 'rule/operation']
out = {}
for spec in sys.argv[3:]:
    tab, items_p, res_p, scored_p = spec.split(':')
    items = {json.loads(l)['id']: json.loads(l) for l in open(items_p) if l.strip()}
    res = {json.loads(l)['id']: json.loads(l) for l in open(res_p) if l.strip()}
    scored = [json.loads(l) for l in open(scored_p) if l.strip()]
    T = collections.Counter(); P = collections.Counter(); X = collections.Counter(); XP = collections.Counter(); ex = collections.defaultdict(list)
    for s in scored:
        it = items[s['id']]; r = res[s['id']]
        x = express(it['tab'], it['expect']['effects']); X[x] += 1
        if s['outcome'] == 'pass': XP[x] += 1; continue
        f = flags(r)
        if s['outcome'] == 'partial' or ('supported' in (r.get('statuses') or []) and not f): f.add('semantics:executed-wrong-or-partial')
        for k in f: T[k] += 1
        prim = next((o for o in ORDER if any(k.startswith(o) for k in f)), 'semantics' if any(k.startswith('semantics') for k in f) else 'other')
        P[prim] += 1
        if len(ex[prim]) < 6: ex[prim].append(it['text'][:90])
    n = len(scored); passed = sum(1 for s in scored if s['outcome'] == 'pass')
    out[tab] = {'n': n, 'pass': passed, 'partial': sum(1 for s in scored if s['outcome'] == 'partial'), 'primary': dict(P.most_common()), 'flags': dict(T.most_common()),
                'expressibility': dict(X), 'passByExpressibility': dict(XP), 'examples': ex}
json.dump(out, sys.stdout, indent=1)
