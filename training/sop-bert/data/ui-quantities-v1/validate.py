#!/usr/bin/env python3
"""Validate ui-quantities-v1/examples.jsonl. Exit status 1 on any error.

Checks: the official builder's own Validator (official-dataset/build.py) reports no error and applies no fix; every request span
is a text slice, trigger/kind/count/value/anchor spans occur in their request span; request spans are in text order and do not
overlap; the first request of a multi-request row has a trigger (single-request fragments may lack one); kind_span differs from nothing and count values match their numeral;
vague quantity words never carry target.count; 20-30 rows per case; no duplicate texts; no text already in the official dataset.
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
NUM = {w: str(i) for i, w in enumerate('zero one two three four five six seven eight nine ten'.split())}
VAGUE = re.compile(r'\b(some|a few|several|many|a couple of|a handful of)\b', re.I)
norm = lambda t: ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def main():
    rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()]
    errors = collections.Counter()
    ex = collections.defaultdict(list)

    def err(kind, row, detail=''):
        errors[kind] += 1
        if len(ex[kind]) < 5:
            ex[kind].append(f"{row['id']}: {row['text']!r} {detail}")
    per_case, seen = collections.Counter(), {}
    official_texts = set()
    od = REPO / 'official-dataset'
    for p in (od / 'train.jsonl.gz', od / 'dev.jsonl', od / 'test.jsonl'):
        with (gzip.open if p.suffix == '.gz' else open)(p, 'rt') as s:
            official_texts |= {(o['world'], norm(o['text'])) for o in map(json.loads, s)}
    for r in rows:
        text = r['text']
        per_case[r['cohort']['case']] += 1
        if (r['world'], norm(text)) in official_texts:
            err('text-in-official-dataset', r)
        if norm(text) in seen:
            err('duplicate-text', r)
        seen[norm(text)] = r['id']
        cursor = 0
        for i, q in enumerate(r['requests']):
            span = q['span']
            at = text.find(span, cursor)
            if at < 0:
                err('request-span-not-in-order', r, span)
            else:
                cursor = at + len(span)
            if i == 0 and 'trigger' not in q and len(r['requests']) > 1:
                err('first-request-without-trigger', r)
            if i > 0 and 'trigger' in q:
                err('later-request-with-trigger', r)
            t = q['target']
            for f in ('kind_span', 'count_span'):
                if f in t and t[f] not in span:
                    err(f'{f}-not-in-span', r)
            if 'count' in t and NUM.get(t['count_span'], t['count_span']) != t['count']:
                err('count-value-mismatch', r)
            if 'count' in t and VAGUE.search(span):
                err('vague-with-count', r)
            if VAGUE.search(span) and 'count' in t:
                err('vague-count', r)
        probe = {'text': text, 'world': r['world'], 'context': json.loads(json.dumps(r['context'])), 'requests': json.loads(json.dumps(r['requests']))}
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
