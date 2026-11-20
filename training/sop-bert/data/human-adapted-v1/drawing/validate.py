#!/usr/bin/env python3
"""Validate human-adapted-v1/drawing/examples.jsonl and gaps.jsonl. Exit status 1 on any error.

Checks: the official Validator (official-dataset/build.py) reports no error and applies no fix; every request span is a
slice of the text, request spans are in text order and do not overlap; trigger/kind/name/count/value spans lie inside
their request span; count values match their numeral; vague quantity words never carry target.count; every row has a
primary usage class first in `construction`; no duplicate texts (examples and gap-only lines; a labelled example may also
have a gap record for its unlabelled part); no text already in the official
dataset; no text and no (corpus, source id) of the held-out human benchmark items (HB_ITEMS directory, default the
committed training/sop-bert/data/human-benchmark-v1/items; the check is reported as skipped when that directory is absent).
"""
import collections
import glob
import gzip
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
VALIDATOR = official.Validator(official.Inventory(json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())))
NUM = {w: str(i) for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve'.split())}
VAGUE = re.compile(r'\b(some|a few|several|many|a couple of|a handful of)\b', re.I)
CLASSES = {'create', 'compose-scene', 'place-relative', 'quantify', 'refer', 'modify-attribute', 'arrange/layout/align/distribute',
           'part-edit', 'formatting/effects', 'vague-aesthetic', 'correction/undo', 'question', 'compound/multi-step', 'fragment/follow-up'}
HB_ITEMS = os.environ.get('HB_ITEMS', str(Path(__file__).resolve().parents[2] / 'human-benchmark-v1' / 'items'))
norm = lambda t: ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def main():
    rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()]
    gaps = [json.loads(l) for l in (HERE / 'gaps.jsonl').read_text().splitlines() if l.strip()]
    errors = collections.Counter()
    ex = collections.defaultdict(list)

    def err(kind, row, detail=''):
        errors[kind] += 1
        if len(ex[kind]) < 5:
            ex[kind].append(f"{row.get('id', '')}: {row['text']!r} {detail}")

    official_texts = set()
    od = REPO / 'official-dataset'
    for p in (od / 'train.jsonl.gz', od / 'dev.jsonl', od / 'test.jsonl'):
        with (gzip.open if p.suffix == '.gz' else open)(p, 'rt') as s:
            official_texts |= {(o['world'], norm(o['text'])) for o in map(json.loads, s)
                               if not str(o.get('source', '')).startswith('human-adapted-v1')}
    bench_texts, bench_ids, bench_checked = set(), set(), False
    if os.path.isdir(HB_ITEMS):
        bench_checked = True
        for f in glob.glob(os.path.join(HB_ITEMS, '*.jsonl')):
            for l in open(f):
                d = json.loads(l)
                bench_texts.add(norm(d['text']))
                bench_texts.add(norm(d['source'].get('original', '')))
                bench_ids.add((d['source']['corpus'], str(d['source']['id'])))
    seen = {}
    classes = collections.Counter()
    for r in rows + [g for g in gaps if not g.get('labelled_as_example')]:
        text = r['text']
        if norm(text) in seen:
            err('duplicate-text', r)
        seen[norm(text)] = 1
        if ('drawing', norm(text)) in official_texts:
            err('text-in-official-dataset', r)
        if bench_checked and (norm(text) in bench_texts or (r['source'].get('original') and norm(r['source']['original']) in bench_texts)):
            err('text-in-benchmark', r)
        if bench_checked and (r['source']['corpus'], str(r['source']['id'])) in bench_ids:
            err('source-line-in-benchmark', r)
    for g in gaps:
        if g.get('class') not in CLASSES:
            err('gap-without-class', g)
        if not g.get('needs'):
            err('gap-without-needs', g)
    for r in rows:
        text = r['text']
        if not r['construction'] or r['construction'][0] not in CLASSES:
            err('no-primary-class', r)
        else:
            classes[r['construction'][0]] += 1
        cursor = 0
        for q in r['requests']:
            span = q['span']
            at = text.find(span, cursor)
            if at < 0:
                err('request-span-not-in-order', r, span)
            else:
                cursor = at + len(span)
            if 'trigger' in q and q['trigger'] not in span:
                err('trigger-not-in-span', r)
            t = q['target']
            for f in ('kind_span', 'count_span', 'name_span'):
                if f in t and t[f] not in span:
                    err(f'{f}-not-in-span', r)
            if 'count' in t and NUM.get(t['count_span'].lower(), t['count_span']) != t['count']:
                err('count-value-mismatch', r)
            if 'count' in t and VAGUE.search(t['count_span']):
                err('vague-with-count', r)
            for c in q['constraints']:
                if c['value_span'] not in span:
                    err('value-span-not-in-span', r)
        probe = {'text': text, 'world': r['world'], 'context': json.loads(json.dumps(r['context'])), 'requests': json.loads(json.dumps(r['requests']))}
        e, w, f = VALIDATOR.check(probe)
        for x in e:
            err('official:' + x, r)
        for x in f:
            err('official-fix:' + x, r)
    gap_classes = collections.Counter(g['class'] for g in gaps if not g.get('labelled_as_example'))
    report = {'rows': len(rows), 'gaps': len(gaps), 'gapOnly': sum(gap_classes.values()), 'benchmarkChecked': bench_checked,
              'classes': dict(classes), 'gapOnlyClasses': dict(gap_classes), 'errors': dict(errors)}
    print(json.dumps(report, indent=1))
    for k, v in ex.items():
        print(k, *v, sep='\n  ')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
