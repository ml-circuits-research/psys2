"""Functional matrix: classes of functionality x areas, drawn from the Haiku v2 rows.
Each cell gets up to N rows; the chosen ids are a development split that training must exclude.
Usage: python3 -I build.py [N]"""
import json, glob, os, random, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', '..', 'sop-bert', 'data', 'haiku-v2')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 25
def classes(req, nreq):
    a, m = req['act'], req['mood']; cs = req.get('constraints') or []; t = req['target']; tu = req.get('turn') or {}
    out = set()
    if a == 'make': out.add('create')
    if a == 'change' and any(c['operator'] not in ('delta', 'factor') and c['phase'] == 'result' for c in cs): out.add('set property')
    if any(c['operator'] in ('delta', 'factor') for c in cs): out.add('relative change')
    if a == 'place': out.add('move / place')
    if a == 'remove': out.add('remove')
    if a in ('connect', 'disconnect', 'group', 'ungroup'): out.add('connect / group')
    if a == 'arrange': out.add('arrange / layout')
    if t.get('fill') == 'description' or t.get('ordinal') or any(c['phase'] == 'selector' for c in cs): out.add('select by description')
    if t.get('quantifier') or any(c.get('group') == 'or' or c['polarity'] == 'negative' for c in cs): out.add('sets, or, not')
    if any(c['character'] in ('preference', 'assumption') for c in cs): out.add('soft wishes')
    if a == 'answer' and m == 'ask': out.add('question')
    if m == 'check': out.add('check')
    if m == 'propose': out.add('propose')
    if nreq > 1: out.add('several requests')
    if tu.get('fragment') or a in ('undo', 'redo', 'repeat'): out.add('follow-up, undo')
    if a == 'object' or tu.get('objection'): out.add('objection')
    if tu.get('area') or a in ('send', 'copy'): out.add('cross-area')
    return out
cells = collections.defaultdict(list)
for p in sorted(glob.glob(os.path.join(DATA, '*', '*.jsonl'))):
    area = os.path.basename(os.path.dirname(p))
    for line in open(p, encoding='utf-8'):
        r = json.loads(line)
        if not r['requests']: cells[('no request', area)].append(r['id']); continue
        for q in r['requests']:
            for c in classes(q, len(r['requests'])): cells[(c, area)].append(r['id'])
random.seed(0); chosen = {}; matrix = {}
for (c, area), ids in sorted(cells.items()):
    ids = sorted(set(ids)); random.shuffle(ids); pick = ids[:N]
    matrix.setdefault(c, {})[area] = {'available': len(ids), 'chosen': len(pick)}
    for i in pick: chosen.setdefault(i, []).append(c)
rows = []
for p in sorted(glob.glob(os.path.join(DATA, '*', '*.jsonl'))):
    for line in open(p, encoding='utf-8'):
        r = json.loads(line)
        if r['id'] in chosen: r['classes'] = sorted(chosen[r['id']]); rows.append(r)
with open(os.path.join(HERE, 'dev-rows.jsonl'), 'w', encoding='utf-8') as f:
    for r in rows: f.write(json.dumps(r, ensure_ascii=False) + '\n')
json.dump(sorted(chosen), open(os.path.join(HERE, 'exclude-from-training.json'), 'w'), indent=0)
json.dump(matrix, open(os.path.join(HERE, 'matrix.json'), 'w'), indent=1)
areas = ['drawing', 'diagram', 'document', 'calendar']
print('| class | ' + ' | '.join(areas) + ' |'); print('|---' * 5 + '|')
for c in sorted(matrix): print(f'| {c} | ' + ' | '.join(str(matrix[c].get(a, {}).get('chosen', 0)) for a in areas) + ' |')
print(len(rows), 'dev rows')
