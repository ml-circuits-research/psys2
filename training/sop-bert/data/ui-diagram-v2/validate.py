#!/usr/bin/env python3
"""Validate examples.jsonl (and heldout-voice.jsonl). Exit status 1 on any error; writes validation.json.

Errors:
- spans: the request span occurs in the text; trigger, kind/name/description/count spans and value spans occur word-bounded in
  their request span;
- labels: the official builder's Validator (official-dataset/build.py) with this corpus's inventory additions reports no error;
  the builder's own row conversions (anchors_fix, definite_description_fix, degree_fix, harmonise) change nothing;
- references: a written name, a selector or an anchor matches an object of context.existing (label, visible code or link name);
  existing targets referenced by name or kind have a non-empty context;
- no tool slot ids (o1, r2, chart:1, snake_case slots) in the text; visible codes n1/e1/g1 are allowed;
- no duplicate texts. (Owner decision 2026-11-20: benchmark and voice-set texts are never excluded from training.)
Reported: rows per case, cases below 20 rows, official warnings."""
import collections
import copy
import gzip
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from engine import INVENTORY, REPO  # noqa: E402
from vocab import KINDS  # noqa: E402
SYN = {w: k for k, (one, many) in KINDS.items() for w in one + many}

spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
INV = official.Inventory(INVENTORY)
VALIDATOR = official.Validator(INV)
_, LEMMAS = official.kind_vocabulary()
SLOT_ID = re.compile(r'\b(?:[a-z]+_[a-z_]+|[orba]\d{1,2}|chart:\d+|seg-\d+)\b')
CODE = re.compile(r'^\s*(?:the\s+)?([neg])\s*(\d{1,2}|one|two|three|four|five|six|seven|eight|nine)\s*$', re.I)
WORDNUM = {w: str(i) for i, w in enumerate('zero one two three four five six seven eight nine'.split())}


def word_in(span, needle):
    return bool(official.find_all(span, needle)) and needle in span


def norm(t):
    return ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def ref_ok(surface, existing):
    m = CODE.match(surface)
    if m:
        code = m.group(1).lower() + WORDNUM.get(m.group(2).lower(), m.group(2))
        return any(code in (e.get('id'), e.get('name')) for e in existing)
    low = surface.lower().strip('"')
    low = re.sub(r'^(the|a|an|this|that)\s+', '', low)
    if SYN.get(low) and any(e.get('kind') == SYN[low] for e in existing):
        return True
    names = [str(e.get('name', '')).lower() for e in existing] + [str(e.get('kind', '')).lower() for e in existing]
    return any(low and (low == n or low in n.split(' to ')) for n in names) or any(low == n for n in names)


POPULATION = re.compile(r'\b(all|every|each|everything|them|these|those|it|selected|selection|two|each one|both|alle)\b', re.I)


def check_rows(rows, errors, examples, notes, official_texts=None):
    def err(kind, r, detail=''):
        errors[kind] += 1
        if len(examples[kind]) < 6:
            examples[kind].append(f'{r["id"]}: {r["text"]!r} {detail}')
    seen = {}
    for r in rows:
        text, existing = r['text'], r['context']['existing']
        if SLOT_ID.search(text):
            err('slot-or-tool-id-in-text', r, SLOT_ID.search(text).group(0))
        k = norm(text)
        if k in seen:
            err('duplicate-text', r, 'same as ' + seen[k])
        seen[k] = r['id']
        for q in r['requests']:
            span = q['span']
            if span not in text:
                err('request-span-not-in-text', r)
                continue
            if 'trigger' in q and not word_in(span, q['trigger']):
                err('trigger-not-a-span', r, q['trigger'])
            t = q['target']
            for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
                if f in t and not word_in(span, t[f]):
                    err(f'target-{f}-not-in-span', r, t[f])
            if t['mode'] == 'existing' and t.get('fill') in ('written', 'description') and not existing:
                err('existing-target-with-empty-context', r)
            if t.get('fill') == 'written' and 'name_span' in t and not ref_ok(t['name_span'], existing):
                err('reference-not-in-context', r, t['name_span'])
            for c in q['constraints']:
                if not word_in(span, c['value_span']):
                    err('value-span-not-in-span', r, f"{c['key']}={c['value_span']!r}")
                if c['key'] in ('node.ids', 'link.ids', 'group.id') and c['phase'] == 'selector' and not ref_ok(c['value_span'], existing):
                    err('selector-not-in-context', r, c['value_span'])
                if c['key'] in ('node.anchor', 'link.from', 'link.to') and c['phase'] == 'selector' and not POPULATION.search(c['value_span']) \
                        and not ref_ok(c['value_span'], existing) and not re.match(r'^(the )?(arrow|line|link|connection|connector|edge|connecting line)\b', c['value_span']):
                    err('selector-not-in-context', r, f"{c['key']}={c['value_span']!r}")
                if c['key'] in ('link.from', 'link.to') and c['phase'] == 'result' and not POPULATION.search(c['value_span']) and not ref_ok(c['value_span'], existing):
                    err('endpoint-not-in-context', r, f"{c['key']}={c['value_span']!r}")
                if 'value' not in c and not (c.get('qualitative') or c.get('mention') or c.get('operator') == 'delta'):
                    err('constraint-without-value', r, c['key'])
        probe = {'text': text, 'world': 'diagram', 'context': copy.deepcopy(r['context']), 'requests': copy.deepcopy(r['requests'])}
        e, w, f = VALIDATOR.check(probe)
        for x in e:
            err('official:' + x, r)
        for x in f:
            err('official-fix:' + x, r)
        for x in w:
            notes['official-warning:' + x.split(':')[0]] += 1
        conv = {'world': 'diagram', 'text': text, 'context': copy.deepcopy(r['context']), 'requests': copy.deepcopy(r['requests']),
                'operation': r['cohort']['operation']}
        stats = collections.Counter()
        conv = official.harmonise(official.degree_fix(official.definite_description_fix(official.anchors_fix(conv, stats, INV), stats, LEMMAS), stats), stats)
        if conv['requests'] != r['requests']:
            for s in stats or {'changed': 1}:
                err('official-conversion-changes-row:' + s, r)


def main():
    errors, examples, notes = collections.Counter(), collections.defaultdict(list), collections.Counter()
    rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()]
    official_texts = set()
    for p in ('train.jsonl.gz', 'dev.jsonl', 'test.jsonl'):
        path = REPO / 'official-dataset' / p
        with (gzip.open(path, 'rt') if p.endswith('.gz') else open(path)) as s:
            for line in s:
                o = json.loads(line)
                if o['source'] != 'ui-diagram-v2':
                    official_texts.add((o['world'], ' '.join(o['text'].lower().split())))
    check_rows(rows, errors, examples, notes)
    held = HERE / 'heldout-voice.jsonl'
    heldout = [json.loads(l) for l in held.read_text().splitlines() if l.strip()] if held.exists() else []
    if heldout:
        check_rows(heldout, errors, examples, notes, official_texts)
    per_case = collections.Counter(r['cohort']['case'] for r in rows)
    report = {'rows': len(rows), 'heldoutRows': len(heldout), 'cases': len(per_case), 'errors': dict(errors), 'errorExamples': dict(examples),
              'notes': dict(notes), 'casesBelow20': {c: n for c, n in per_case.items() if n < 20}}
    (HERE / 'validation.json').write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({k: report[k] for k in ('rows', 'heldoutRows', 'cases', 'errors', 'notes', 'casesBelow20')}, indent=1))
    for kind, ex in examples.items():
        print(kind, *ex, sep='\n  ')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
