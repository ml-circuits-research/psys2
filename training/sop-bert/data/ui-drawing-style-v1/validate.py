#!/usr/bin/env python3
"""Validate examples.jsonl: verbatim spans, label banks via the official builder's Validator (with this corpus's keys), the
builder's row conversions change nothing, references to existing objects match context.existing, no duplicate rows."""
import collections, copy, importlib.util, json, re, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec); spec.loader.exec_module(official)
inv = json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())
for extra in (HERE / 'inventory.json', HERE.parent / 'data-drop-v1' / 'inventory.json'):
    for area, types in json.loads(extra.read_text()).items():
        for typ, d in types.items():
            inv[area].setdefault(typ, {'keys': {}})['keys'].update(d['keys'])
INV = official.Inventory(inv); VAL = official.Validator(INV); _, LEMMAS = official.kind_vocabulary()
rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()]
errors, notes, ex = collections.Counter(), collections.Counter(), collections.defaultdict(list)
def err(k, r, d=''):
    errors[k] += 1
    if len(ex[k]) < 5: ex[k].append(f'{r["id"]}: {r["text"]!r} {d}')
seen = set()
for r in rows:
    key = (r['text'].lower(), json.dumps(r['context'], sort_keys=True))
    if key in seen: err('duplicate', r)
    seen.add(key)
    names = {str(e.get('name', '')).lower() for e in r['context']['existing']} | {str(e.get('kind', '')).lower() for e in r['context']['existing']}
    for q in r['requests']:
        if q['span'] not in r['text']: err('span', r); continue
        t = q['target']
        for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
            if f in t and t[f] not in q['span']: err('target-' + f, r)
        if t.get('fill') == 'written' and t.get('name_span', '').lower() not in names: err('name-not-in-context', r, t.get('name_span'))
        for c in q['constraints']:
            if c['value_span'] not in q['span']: err('value-span', r, c['key'])
    e, w, f = VAL.check({'text': r['text'], 'world': 'drawing', 'context': copy.deepcopy(r['context']), 'requests': copy.deepcopy(r['requests'])})
    for x in e: err('official:' + x, r)
    for x in f: err('official-fix:' + x, r)
    for x in w: notes[x.split(':')[0]] += 1
    conv = {'world': 'drawing', 'text': r['text'], 'context': copy.deepcopy(r['context']), 'requests': copy.deepcopy(r['requests']), 'operation': r['cohort']['operation']}
    st = collections.Counter()
    conv = official.harmonise(official.degree_fix(official.definite_description_fix(official.anchors_fix(conv, st, INV), st, LEMMAS), st), st)
    if conv['requests'] != r['requests']:
        for s_ in st or {'changed': 1}: err('conversion:' + s_, r)
rep = {'rows': len(rows), 'errors': dict(errors), 'examples': dict(ex), 'notes': dict(notes)}
(HERE / 'validation.json').write_text(json.dumps(rep, indent=1, ensure_ascii=False) + '\n')
print(json.dumps({k: rep[k] for k in ('rows', 'errors')}, indent=1)); [print(k, *v, sep='\n  ') for k, v in ex.items()]
sys.exit(1 if errors else 0)
