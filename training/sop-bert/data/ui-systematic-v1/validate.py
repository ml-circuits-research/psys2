#!/usr/bin/env python3
"""Validate examples.jsonl with the official builder's Validator (official-dataset/build.py) plus span checks.
Exit status 1 on any error. Writes validation.json.

Errors: the official Validator's errors or fixes on any row; a request span, trigger, target span or value span that does
not occur (word-bounded) in its request; a duplicate text (same tab, text and previous message); a row not marked canonical.
Reported: official warnings (bank extensions = declared values the reader bank lacks), rows whose tool arguments are
incomplete (identity, parent, part index or generated ids resolved by the world), texts already in the official dataset."""
import collections
import gzip
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
INV = official.Inventory(json.loads((REPO / 'official-dataset' / 'inventory.json').read_text()))
VALIDATOR = official.Validator(INV)
LEMMAS = official.kind_vocabulary()[1]


def main():
    rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()]
    errors, warnings, notes, examples = collections.Counter(), collections.Counter(), collections.Counter(), collections.defaultdict(list)

    def err(kind, r):
        errors[kind] += 1
        if len(examples[kind]) < 5:
            examples[kind].append(f"{r['id']}: {r['text']!r}")
    seen = set()
    for r in rows:
        if not r.get('canonical') or r.get('style') != 'canonical':
            err('not-marked-canonical', r)
        k = (r['world'], r['text'].lower(), r['context'].get('previous'))
        if k in seen:
            err('duplicate-text', r)
        seen.add(k)
        for q in r['requests']:
            span = q['span']
            if span not in r['text']:
                err('span-not-in-text', r); continue
            if q.get('trigger') and not official.find_all(span, q['trigger']):
                err('trigger-not-in-span', r)
            for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
                if f in q['target'] and not official.find_all(span, q['target'][f]):
                    err(f'{f}-not-in-span', r)
            for c in q['constraints']:
                if not official.find_all(span, c['value_span']):
                    err('value-span-not-in-span', r)
        probe = {'text': r['text'], 'world': r['world'], 'context': json.loads(json.dumps(r['context'])), 'requests': json.loads(json.dumps(r['requests']))}
        e, w, f = VALIDATOR.check(probe)
        # the official build's own conversion of a UI source row (ui_row -> anchors/definite/degree/harmonise -> Validator)
        conv = collections.Counter()
        row = official.anchors_fix(official.ui_row('ui-systematic-v1', json.loads(json.dumps(r)), 0), conv, INV)
        row = official.harmonise(official.degree_fix(official.definite_description_fix(row, conv, LEMMAS), conv), conv)
        e2, _, _ = VALIDATOR.check(row)
        for x in e2:
            err('official-conversion:' + x, r)
        for x in conv:
            notes['official-conversion-fix:' + x] += conv[x]
        for x in e:
            err('official:' + x, r)
        for x in f:
            err('official-fix:' + x, r)
        for x in w:
            warnings[x] += 1
        for t in (r['nativeTool'] if isinstance(r['nativeTool'], list) else [r['nativeTool']]):
            notes['tool-arguments-complete' if t.get('validArguments') else 'tool-arguments-incomplete:' + str(t.get('argumentIssue'))] += 1
    official_texts = set()
    od = REPO / 'official-dataset'
    for p in (od / 'train.jsonl.gz', od / 'dev.jsonl', od / 'test.jsonl'):
        with (gzip.open if p.suffix == '.gz' else open)(p, 'rt') as s:
            for line in s:
                o = json.loads(line)
                official_texts.add((o['world'], ' '.join(o['text'].lower().split())))
    notes['text-already-in-official-dataset'] = sum((r['world'], ' '.join(r['text'].lower().split())) in official_texts for r in rows)
    report = {'rows': len(rows), 'errors': dict(errors), 'errorExamples': dict(examples), 'warnings': dict(warnings.most_common()), 'notes': dict(notes)}
    (HERE / 'validation.json').write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({k: report[k] for k in ('rows', 'errors', 'notes')}, indent=1))
    print('warnings:', sum(warnings.values()), dict(collections.Counter(w.split(':')[0] for w in warnings.elements())))
    for kind, ex in examples.items():
        print(kind, *ex, sep='\n  ')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
