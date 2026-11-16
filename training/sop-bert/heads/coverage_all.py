import json, glob, collections, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
inv = json.load(open(os.path.join(HERE, 'inventory.json')))
cnt = collections.Counter(); vals = collections.defaultdict(collections.Counter)
def hit(key, v=None):
    cnt[key] += 1
    if v is not None:
        for x in (v if isinstance(v, list) else [v]): vals[key][str(x)] += 1
# v2 rows
for p in glob.glob(os.path.join(HERE, '..', 'data', 'haiku-v2', '*', '*.jsonl')):
    w = p.split(os.sep)[-2]
    for line in open(p):
        r = json.loads(line)
        for q in r['requests']:
            hit('request.request.mood', q['mood']); hit('request.request.act', q['act'])
            t = q['target']; typ = t.get('type')
            for f, k in (('mode','mode'),('fill','fill'),('determiner','determiner'),('ordinal','ordinal'),('count','count')):
                if f in t: hit('request.target.' + k, t[f])
            if 'kind' in t:
                hit('request.target.kind', t['kind'])
                for kk in ('kind', 'genre', 'scene', 'feature', 'part', 'role'):
                    if typ in inv[w] and kk in inv[w][typ]['keys'] and kk in ('kind',): hit(f'{w}.{typ}.kind', t['kind'])
            if 'name_span' in t: hit('request.target.name')
            if 'description_span' in t: hit('request.target.description')
            if 'quantifier' in t: hit('request.logic.quantifier', t['quantifier'])
            if 'count' in t and typ in inv[w] and 'count' in inv[w][typ]['keys']: hit(f'{w}.{typ}.count')
            for c in q.get('constraints', []) or []:
                hit(f"{w}.{c['key']}", c.get('value'))
                hit('request.constraint.concept')
                for f in ('operator','phase','polarity','character','scope','step','variety','unit'):
                    if f in c: hit('request.constraint.' + f, c[f])
                if 'measure' in c: hit('request.constraint.measure')
                if 'group' in c: hit('request.logic.group', c['group'])
                if c.get('polarity') == 'negative': hit('request.logic.negated')
            qq = q.get('question')
            if qq:
                hit('request.question.ask', qq['ask'])
                if 'asked_key' in qq: hit('request.question.asked_key')
            tu = q.get('turn') or {}
            for f in ('fragment','objection','area','repeat_count'):
                if f in tu: hit('conversation.turn.' + f, tu[f])
# v1 rows mapped (reuse coverage_v1 mapping)
sys.path.insert(0, os.path.join(HERE))
src = open(os.path.join(HERE, 'coverage_v1.py')).read().split('cnt = collections.Counter()')[0].replace("inv = json.load(open('v2/inventory.json'))", '')
ns = {'__file__': os.path.join(HERE, 'coverage_v1.py')}; exec(src, ns); M, W, CO = ns['M'], ns['W'], ns['CO']
for p in glob.glob(os.path.join(HERE, '..', 'data', 'haiku-v1', '*', '*.jsonl')):
    w = p.split(os.sep)[-2]
    for line in open(p):
        r = json.loads(line)
        for q in r['requests']:
            seen = set()
            for a, v in q['answers'].items():
                if a in M: key = M[a]
                elif a in W[w]:
                    t = W[w][a]
                    if t == 'chart.*': t = 'chart.' + CO.get(v, 'legend')
                    key = t[1:] if t.startswith('@') else f"{w}.{t}"
                else: continue
                if key in seen: continue
                seen.add(key); hit(key, v)
            fill = q['answers'].get('target_fill')
            if fill: hit('request.target.mode', 'new' if fill == 'new' else 'existing')
rows = []
for w, ts in inv.items():
    for typ, x in ts.items():
        for key, d in x['keys'].items():
            full = f"{w}.{typ}.{key}"; n = cnt.get(full, 0)
            low = [v for v in d.get('values', []) if vals[full][v] < 40] if ('class' in d['head'] and 'candidate' not in d['head']) else []
            rows.append((full, d['head'], n, len(d.get('values', [])), low))
ok = [r for r in rows if r[2] >= 300 and not r[4]]
print('keys', len(rows), 'pass gate (>=300 and every closed value >=40):', len(ok), '| >=300 examples:', sum(r[2] >= 300 for r in rows), '| zero:', sum(r[2] == 0 for r in rows))
for r in sorted(rows, key=lambda r: r[2]): print(f"{r[2]:6d}  {r[0]:42s} {r[1]:22s} low-values={len(r[4])}/{r[3]} {r[4][:8]}")
