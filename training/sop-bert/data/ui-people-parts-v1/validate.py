#!/usr/bin/env python3
"""Validate ui-people-parts-v1/examples.jsonl. Exit status 1 on any error.

Checks: the official builder's own Validator (official-dataset/build.py) reports no error and applies no fix; the trigger,
kind span and value spans occur in their request span; 20-30 rows per case; no duplicate texts; no text already in the
official dataset.
"""
import collections
import gzip
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
VALIDATOR = official.Validator(official.Inventory(json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())))
norm = lambda t: ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def main():
    rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()]
    errors, ex = collections.Counter(), collections.defaultdict(list)

    def err(kind, row, detail=''):
        errors[kind] += 1
        if len(ex[kind]) < 5:
            ex[kind].append(f"{row['id']}: {row['text']!r} {detail}")
    per_case, seen, official_texts = collections.Counter(), set(), set()
    od = REPO / 'official-dataset'
    for p in (od / 'train.jsonl.gz', od / 'dev.jsonl', od / 'test.jsonl'):
        with (gzip.open if p.suffix == '.gz' else open)(p, 'rt') as s:
            official_texts |= {(o['world'], norm(o['text'])) for o in map(json.loads, s)}
    for r in rows:
        per_case[r['cohort']['case']] += 1
        if (r['world'], norm(r['text'])) in official_texts:
            err('text-in-official-dataset', r)
        if norm(r['text']) in seen:
            err('duplicate-text', r)
        seen.add(norm(r['text']))
        for q in r['requests']:
            span = q['span']
            if span not in r['text']:
                err('span-not-in-text', r)
            if q.get('trigger') and q['trigger'] not in span:
                err('trigger-not-in-span', r)
            if q['target'].get('kind_span') and q['target']['kind_span'] not in span:
                err('kind-span-not-in-span', r)
            for c in q['constraints']:
                if c.get('value_span') and c['value_span'] not in span:
                    err('value-span-not-in-span', r, c['key'])
        probe = {'text': r['text'], 'world': r['world'], 'context': json.loads(json.dumps(r['context'])), 'requests': json.loads(json.dumps(r['requests']))}
        e, w, f = VALIDATOR.check(probe)
        for x in e:
            err('official:' + x, r)
        for x in f:
            err('official-fix:' + x, r)
    for case, n in per_case.items():
        if not 20 <= n <= 30:
            errors['case-row-count'] += 1
            ex['case-row-count'].append(f'{case}: {n}')
    print(json.dumps({'rows': len(rows), 'perCase': dict(per_case), 'errors': dict(errors)}, indent=1))
    for k, v in ex.items():
        print(k, *v, sep='\n  ')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
