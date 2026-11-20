#!/usr/bin/env python3
"""Summarise oracle runs: per tab and mode pass/partial/fail (score.py outcomes), items won by partial admission,
run-time fallbacks used, and the most frequent disclosed (unbound) roles.
usage: python3 oracle-summary.py DIR tab...   (DIR holds <tab>.<mode>.scored and <tab>.<mode>.out)"""
import collections, json, os, sys

d, tabs = sys.argv[1], sys.argv[2:]
modes = ['keys', 'strict', 'frame']
summary = {}
for tab in tabs:
    sc = {m: {json.loads(l)['id']: json.loads(l) for l in open(os.path.join(d, f'{tab}.{m}.scored'))} for m in modes}
    out = {m: {json.loads(l)['id']: json.loads(l) for l in open(os.path.join(d, f'{tab}.{m}.out'))} for m in modes}
    row = {}
    for m in modes:
        c = collections.Counter(r['outcome'] for r in sc[m].values())
        row[m] = {'n': len(sc[m]), 'pass': c['pass'], 'partial': c['partial'], 'fail': c['fail']}
    ids = sc['frame'].keys()
    row['frameOverStrict'] = sum(1 for i in ids if sc['frame'][i]['outcome'] == 'pass' and sc['strict'][i]['outcome'] != 'pass')
    row['strictOverFrame'] = sum(1 for i in ids if sc['strict'][i]['outcome'] == 'pass' and sc['frame'][i]['outcome'] != 'pass')
    row['frameOverKeys'] = sum(1 for i in ids if sc['frame'][i]['outcome'] == 'pass' and sc['keys'][i]['outcome'] != 'pass')
    row['keysOverFrame'] = sum(1 for i in ids if sc['keys'][i]['outcome'] == 'pass' and sc['frame'][i]['outcome'] != 'pass')
    used = collections.Counter(s['used'].split(':')[0] for r in out['frame'].values() for s in r.get('steps', []) if r['id'] in ids)
    row['frameSteps'] = dict(used)
    row['framePassUsing'] = dict(collections.Counter(s['used'].split(':')[0] for i in ids if sc['frame'][i]['outcome'] == 'pass'
                                                     for s in out['frame'][i].get('steps', []) if s['used'] != 'full'))
    row['passWithDisclosure'] = sum(1 for i in ids if sc['frame'][i]['outcome'] == 'pass' and out['frame'][i].get('disclosed'))
    row['keysRefusedItems'] = sum(1 for i in ids if out['keys'][i].get('refused'))
    dis = collections.Counter((x['role'], x['reason']) for i in ids for x in out['frame'][i].get('disclosed', []))
    row['disclosedTop'] = [[f'{a}:{b}', n] for (a, b), n in dis.most_common(12)]
    summary[tab] = row
print(json.dumps(summary, indent=1))
