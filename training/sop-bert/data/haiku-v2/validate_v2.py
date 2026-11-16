"""Validate v2 reader rows against inventory.json.
Usage: python3 -I validate_v2.py --check FILE...      (read-only, prints problems per row)
       python3 -I validate_v2.py OUTDIR CLEANDIR       (writes the valid, de-duplicated rows)"""
import json, sys, os, glob, collections, re
HERE = os.path.dirname(os.path.abspath(__file__))
INV = json.load(open(os.path.join(HERE, 'inventory.json')))
REQ = INV['request']
def vals(t, k): return REQ[t]['keys'][k].get('values', [])
MOOD, ACT = vals('request', 'mood'), vals('request', 'act')
MODE, FILL, DET, ORD = vals('target', 'mode'), vals('target', 'fill'), vals('target', 'determiner'), vals('target', 'ordinal')
QUANT, ASK = vals('logic', 'quantifier'), vals('question', 'ask')
OPER, PHASE, POL, CHAR, SCOPE, STEP, VAR = (vals('constraint', x) for x in ('operator', 'phase', 'polarity', 'character', 'scope', 'step', 'variety'))
GROUP = vals('logic', 'group')
FRAG, OBJ, AREA = (INV['conversation']['turn']['keys'][x]['values'] for x in ('fragment', 'objection', 'area'))
DIG = re.compile(r'^-?\d+(\.\d+)?$')
def keys_of(world):
    out = {}
    for typ, x in INV[world].items():
        for k, d in x['keys'].items(): out[f'{typ}.{k}'] = d
    return out
def problems(row, world):
    P = []
    if row.get('world') != world: return ['world']
    text = row.get('text')
    if not isinstance(text, str) or not text.strip(): return ['text']
    ctx = row.get('context')
    if not isinstance(ctx, dict) or not isinstance(ctx.get('existing'), list): return ['context']
    reqs = row.get('requests')
    if not isinstance(reqs, list): return ['requests']
    K = keys_of(world); types = set(INV[world])
    pos = 0
    for i, r in enumerate(reqs):
        tag = f'req{i}'
        span = r.get('span')
        if not isinstance(span, str) or not span: P.append(tag + ':span-missing'); continue
        j = text.find(span, pos)
        if j < 0: P.append(tag + ':span-not-in-text-or-order'); continue
        pos = j + len(span)
        def inspan(field, v):
            if not isinstance(v, str) or not v or v not in span: P.append(f'{tag}:{field}-not-in-span')
        if r.get('trigger') is not None: inspan('trigger', r['trigger'])
        if r.get('mood') not in MOOD: P.append(tag + ':mood')
        if r.get('act') not in ACT: P.append(tag + ':act')
        if r.get('act') == 'answer' and r.get('mood') not in ('ask', 'check'): P.append(tag + ':answer-needs-ask-or-check')
        if r.get('act') == 'answer' and not isinstance(r.get('question'), dict): P.append(tag + ':answer-needs-question')
        t = r.get('target')
        if not isinstance(t, dict): P.append(tag + ':target'); continue
        if t.get('type') not in types: P.append(tag + ':target-type')
        if t.get('mode') not in MODE: P.append(tag + ':target-mode')
        for f, allowed in (('fill', FILL), ('determiner', DET), ('ordinal', ORD), ('quantifier', QUANT)):
            if f in t and t[f] not in allowed: P.append(f'{tag}:target-{f}')
        if t.get('mode') == 'existing' and 'fill' not in t: P.append(tag + ':existing-needs-fill')
        for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
            if f in t: inspan('target-' + f, t[f])
        if 'count' in t and not DIG.match(str(t['count'])): P.append(tag + ':target-count-digits')
        for f in t:
            if f not in ('type', 'mode', 'fill', 'determiner', 'kind', 'kind_span', 'name_span', 'description_span', 'ordinal', 'count', 'count_span', 'quantifier'): P.append(f'{tag}:target-unknown-{f}')
        for n, c in enumerate(r.get('constraints', []) or []):
            ct = f'{tag}.c{n}'
            if not isinstance(c, dict): P.append(ct + ':shape'); continue
            key = c.get('key')
            if key not in K: P.append(f'{ct}:unknown-key:{key}'); continue
            d = K[key]; head = d['head']; v = c.get('value')
            if v is not None:
                if not isinstance(v, str) or not v: P.append(ct + ':value-type')
                elif 'class' in head and 'candidate' not in head and d.get('values'):
                    if v not in d['values'] and not ('number' in head and DIG.match(v)): P.append(f'{ct}:bad-value:{key}={v}')
                elif head.startswith('number') and 'class' not in head and not DIG.match(v): P.append(f'{ct}:value-digits:{key}')
            for f, allowed in (('operator', OPER), ('phase', PHASE), ('polarity', POL), ('character', CHAR), ('step', STEP), ('variety', VAR), ('scope', SCOPE), ('group', GROUP), ('anchor_fill', FILL)):
                if f in c and c[f] not in allowed: P.append(f'{ct}:{f}')
            for f in ('operator', 'phase', 'polarity', 'character'):
                if f not in c: P.append(f'{ct}:missing-{f}')
            if c.get('operator') == 'delta' and 'step' not in c and 'measure' not in c: P.append(ct + ':delta-needs-step-or-measure')
            if c.get('operator') == 'relation' and 'anchor_span' not in c: P.append(ct + ':relation-needs-anchor')
            for f in ('value_span', 'measure_span', 'anchor_span'):
                if f in c: inspan(f'{ct}-{f}', c[f])
            if 'measure' in c and not DIG.match(str(c['measure'])): P.append(ct + ':measure-digits')
            for f in c:
                if f not in ('key', 'value', 'value_span', 'operator', 'phase', 'polarity', 'character', 'step', 'measure', 'measure_span', 'unit', 'anchor_span', 'anchor_fill', 'variety', 'scope', 'group'): P.append(f'{ct}:unknown-field-{f}')
        q = r.get('question')
        if q is not None:
            if not isinstance(q, dict) or q.get('ask') not in ASK: P.append(tag + ':question-ask')
            elif 'asked_key' in q and q['asked_key'] not in K: P.append(tag + ':question-asked_key')
        tu = r.get('turn')
        if tu is not None:
            if not isinstance(tu, dict): P.append(tag + ':turn')
            else:
                for f, allowed in (('fragment', FRAG), ('objection', OBJ), ('area', AREA)):
                    if f in tu and tu[f] not in allowed: P.append(f'{tag}:turn-{f}')
                if 'repeat_count' in tu and not DIG.match(str(tu['repeat_count'])): P.append(tag + ':turn-repeat_count')
                if tu.get('fragment') and not ctx.get('previous'): P.append(tag + ':fragment-needs-previous')
    return P
def read(path):
    for n, line in enumerate(open(path, encoding='utf-8'), 1):
        line = line.strip()
        if not line: continue
        try: yield n, json.loads(line), None
        except Exception as e: yield n, None, 'json'
if sys.argv[1] == '--check':
    bad = 0; total = 0
    for path in sys.argv[2:]:
        world = os.path.basename(os.path.dirname(os.path.abspath(path)))
        for n, row, err in read(path):
            total += 1
            P = [err] if err else problems(row, world)
            if P: bad += 1; print(f'{os.path.basename(path)}:{n} {row.get("id") if row else ""} {"; ".join(P)}')
    print(f'{total} rows, {bad} with problems')
else:
    out, clean = sys.argv[1], sys.argv[2]
    stats = collections.Counter(); reasons = collections.Counter(); seen = set()
    for path in sorted(glob.glob(os.path.join(out, '*', '*.jsonl'))):
        world = os.path.basename(os.path.dirname(path)); good = []
        for n, row, err in read(path):
            stats['lines'] += 1
            P = [err] if err else problems(row, world)
            if P:
                for p in set(x.split(':')[1] if ':' in x else x for x in P): reasons[p] += 1
                continue
            key = (world, row['text'].strip().lower(), json.dumps(row['context'], sort_keys=True))
            if key in seen: reasons['duplicate'] += 1; continue
            seen.add(key); good.append(row); stats['ok:' + world] += 1
        if good:
            os.makedirs(os.path.join(clean, world), exist_ok=True)
            with open(os.path.join(clean, world, os.path.basename(path)), 'w', encoding='utf-8') as f:
                for row in good: f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(json.dumps({'stats': stats, 'rejected': reasons.most_common(30)}, indent=1))
