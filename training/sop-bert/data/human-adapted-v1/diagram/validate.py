#!/usr/bin/env python3
"""Validate human-adapted-v1/diagram/examples.jsonl and gaps.jsonl. Exit status 1 on any error.

Checks: the official Validator (official-dataset/build.py) reports no error and applies no fix; every request span is a
slice of the text, request spans are in text order and do not overlap; trigger/kind/name/count/description/value spans lie
inside their request span; count values match their numeral; vague quantity words never carry a count; every row and gap
has a primary usage class (first `construction` tag) from the diagram taxonomy; structural fills are marked
`style: structural-fill`; no duplicate texts (examples and gap-only lines); no text already in the official dataset; no
text, original line or (corpus, source id) of the held-out human benchmark items (HB_ITEMS directory, default the
committed training/sop-bert/data/human-benchmark-v1/items; reported as skipped when that directory is absent).
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
VAGUE = re.compile(r'\b(some|a few|several|many|a couple of|a handful of|random)\b', re.I)
CLASSES = ['create', 'compose', 'place-relative', 'quantify', 'refer', 'modify-attribute', 'arrange/layout/align/distribute',
           'connect/structure', 'chart-create', 'chart-data-edit', 'chart-formatting', 'formatting/effects', 'vague-aesthetic',
           'correction/undo', 'question', 'compound/multi-step', 'fragment/follow-up']
HB_ITEMS = os.environ.get('HB_ITEMS', str(Path(__file__).resolve().parents[2] / 'human-benchmark-v1' / 'items'))
norm = lambda t: ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def number(s):
    m = re.search(r'\d+(?:\.\d+)?', s)
    return m.group(0) if m else next((NUM[t] for t in re.findall(r'[a-z]+', s.lower()) if t in NUM), None)


def main():
    rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()]
    gaps = [json.loads(l) for l in (HERE / 'gaps.jsonl').read_text().splitlines() if l.strip()]
    errors = collections.Counter()
    ex = collections.defaultdict(list)

    def err(kind, row, detail=''):
        errors[kind] += 1
        if len(ex[kind]) < 8:
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
    bench_texts.discard('')
    seen = set()
    for r in rows + [g for g in gaps if not g.get('labelled_as_example')]:
        text = r['text']
        if norm(text) in seen:
            err('duplicate-text', r)
        seen.add(norm(text))
        if ('diagram', norm(text)) in official_texts:
            err('text-in-official-dataset', r)
        if bench_checked and (norm(text) in bench_texts or (r['source'].get('original') and norm(r['source']['original']) in bench_texts)):
            err('text-in-benchmark', r)
        if bench_checked and (r['source']['corpus'], str(r['source']['id'])) in bench_ids:
            err('source-line-in-benchmark', r)
        if (r['source']['corpus'] == 'structural-fill') != (r.get('style') == 'structural-fill'):
            err('structural-fill-style-mismatch', r)
    for g in gaps:
        if g.get('class') not in CLASSES:
            err('gap-without-class', g)
        if not g.get('needs'):
            err('gap-without-needs', g)
    classes = collections.Counter()
    for r in rows:
        text = r['text']
        if not r['construction'] or r['construction'][0] not in CLASSES:
            err('no-primary-class', r)
        else:
            classes[r['construction'][0]] += 1
        if text != text.strip() or '  ' in text and 'original' in r['source'] and '  ' not in r['source']['original']:
            err('whitespace', r)
        cursor = 0
        for q in r['requests']:
            span = q['span']
            at = text.find(span, cursor)
            if at < 0:
                err('request-span-not-in-order', r, span)
            else:
                cursor = at + len(span)
            if span != span.strip():
                err('request-span-untrimmed', r, repr(span))
            if 'trigger' in q and q['trigger'] not in span:
                err('trigger-not-in-span', r)
            t = q['target']
            for f in ('kind_span', 'count_span', 'name_span', 'description_span'):
                if f in t and t[f] not in span:
                    err(f'{f}-not-in-span', r)
            if 'count' in t and number(t['count_span']) != t['count']:
                err('count-value-mismatch', r)
            if 'count' in t and VAGUE.search(t['count_span']):
                err('vague-with-count', r)
            for c in q['constraints']:
                if c['value_span'] not in span:
                    err('value-span-not-in-span', r)
                if c['key'].endswith('.n') and VAGUE.search(c['value_span']):
                    err('vague-with-count', r)
        probe = {'text': text, 'world': r['world'], 'context': json.loads(json.dumps(r['context'])), 'requests': json.loads(json.dumps(r['requests']))}
        e, w, f = VALIDATOR.check(probe)
        for x in e:
            err('official:' + x, r)
        for x in f:
            err('official-fix:' + x, r)
    gap_only = collections.Counter(g['class'] for g in gaps if not g.get('labelled_as_example'))
    gap_all = collections.Counter(g['class'] for g in gaps)
    table = {c: {'rows': classes[c], 'gaps': gap_all[c], 'gapOnly': gap_only[c]} for c in CLASSES}
    report = {'rows': len(rows), 'gaps': len(gaps), 'gapOnly': sum(gap_only.values()), 'benchmarkChecked': bench_checked,
              'structuralFillRows': sum(r['style'] == 'structural-fill' for r in rows), 'classes': table, 'errors': dict(errors)}
    print(json.dumps({k: v for k, v in report.items() if k != 'classes'}))
    for c, v in table.items():
        print(f"  {c:34s} rows {v['rows']:4d}  gaps {v['gaps']:4d}  (gap-only {v['gapOnly']})")
    for k, v in ex.items():
        print(k, *v, sep='\n  ')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
