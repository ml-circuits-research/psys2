#!/usr/bin/env python3
"""Validate examples.jsonl. Exit status 1 on any error.

Checks (errors):
- the request span occurs verbatim in the text; trigger, kind/name/description/count spans, value spans and anchor spans
  occur verbatim (word-bounded) in their request span; the trigger is a text span, never the canonical act;
- act, mood, target type (per tab), mode, determiner, fill, operator, phase, polarity, character and question kind are
  in the trainer's label inventory (official-dataset/inventory.json); every key is registered for its tab; class-bank
  values are in their bank; a numeric value occurs in its surface;
- a reference to an existing object (name/selector/anchor) matches an object of context.existing by its human name,
  its kind or a w.face word of a context part; existing targets have a non-empty context;
- no slot or tool ids in the text (hair_front, o1, r2, b3, chart:1, ...);
- no duplicate texts in the corpus (case/punctuation/politeness-insensitive);
- the official builder's own Validator (official-dataset/build.py) reports no error and applies no fix to any row.
Reported (not errors): near-duplicates inside a case, texts already present in the official dataset, cases below 20 rows.
"""
import collections
import gzip
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from cases import NON_OBJECT_SELECTORS, CASE_INDEX, OPS  # noqa: E402

REPO = HERE.parents[3]
KNOWLEDGE = REPO.parent / 'sop-knowledge-worlds' / 'docs' / 'worlds'
spec = importlib.util.spec_from_file_location('official_build', REPO / 'official-dataset' / 'build.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
INV = official.Inventory(json.loads((REPO / 'official-dataset' / 'inventory.json').read_text()))
VALIDATOR = official.Validator(INV)
SLOT_ID = re.compile(r'\b(?:[a-z]+_[a-z_]+|[orbag]\d{1,2}|chart:\d+|seg-\d+)\b')
STOP = {'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'our', 'your', 'her', 'his', 'its', 'their', 'of', 'to', 'from', 'and',
        'one', 'ones', 'with', 'in', 'on', 'at', 'for', 'both', 'all', 'two', 'three', 'box', 'node', 'shape', 'thing', 'object'}
POLITE = re.compile(r"\b(please|pls|can you|could you|would you|kindly|thanks|thank you|ok|okay|hey|now|just)\b")


def face_words():
    words = collections.defaultdict(set)
    path = KNOWLEDGE / 'w.face' / 'shards' / 'words.sop'
    for line in path.read_text().splitlines():
        m = re.match(r'@w\.face\.word\.(\S+) core\.word (.*) means=', line)
        if m:
            texts = [a or b for a, b in re.findall(r'text=(?:"([^"]+)"|(\S+))', m.group(2))]
            group = {t.lower() for t in texts}
            for t in group:
                words[t] |= group
    return words


FACE = face_words()


def words(s):
    return [w for w in re.findall(r"[a-z0-9?']+", s.lower()) if w not in STOP]


def stem(w):
    return w[:-1] if len(w) > 3 and w.endswith('s') and not w.endswith('ss') else w


def matches_context(surface, existing, world):
    sw = {stem(w) for w in words(surface)}
    if not sw:
        return False
    for e in existing:
        cw = {stem(w) for w in words(str(e.get('name', '')) + ' ' + str(e.get('kind', '')))}
        if world == 'avatar':
            for t in [str(e.get('name', '')).lower(), str(e.get('kind', '')).lower()]:
                for alias in FACE.get(t, ()):
                    cw |= {stem(w) for w in words(alias)}
        if sw & cw:
            return True
    return False


def word_in(span, needle):
    return bool(official.find_all(span, needle)) and needle in span


def norm(text):
    t = POLITE.sub(' ', text.lower())
    return ' '.join(re.findall(r"[a-z0-9']+", t))


def main():
    path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / 'examples.jsonl'
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    errors, notes = collections.Counter(), collections.Counter()
    examples = collections.defaultdict(list)

    def err(kind, row, detail=''):
        errors[kind] += 1
        if len(examples[kind]) < 5:
            examples[kind].append(f'{row["id"]}: {row["text"]!r} {detail}')
    seen = {}
    per_case = collections.defaultdict(list)
    for r in rows:
        text, world = r['text'], r['world']
        existing = r['context']['existing']
        if r['cohort']['case'] not in CASE_INDEX:
            err('unknown-case', r)
        per_case[r['cohort']['case']].append(r)
        if SLOT_ID.search(text):
            err('slot-or-tool-id-in-text', r, SLOT_ID.search(text).group(0))
        k = (world, norm(text))
        if k in seen:
            err('duplicate-text', r, 'same as ' + seen[k])
        seen[k] = r['id']
        for q in r['requests']:
            span = q['span']
            if span not in text:
                err('request-span-not-in-text', r); continue
            if 'trigger' in q:
                if not word_in(span, q['trigger']):
                    err('trigger-not-a-span', r, q['trigger'])
            t = q['target']
            for f in ('kind_span', 'name_span', 'description_span', 'count_span'):
                if f in t and not word_in(span, t[f]):
                    err(f'target-{f}-not-in-span', r, t[f])
            if t['mode'] == 'existing' and t.get('fill') in ('written', 'description') and not existing:
                err('existing-target-with-empty-context', r)
            if t.get('fill') == 'written' and 'name_span' in t and not matches_context(t['name_span'], existing, world):
                err('reference-not-in-context', r, t['name_span'])
            if t.get('fill') == 'description' and t['mode'] == 'existing' and not matches_context(t['kind_span'], existing, world):
                err('description-kind-not-in-context', r, t['kind_span'])
            for c in q['constraints']:
                if not word_in(span, c['value_span']):
                    err('value-span-not-in-span', r, f"{c['key']}={c['value_span']!r}")
                if 'anchor_span' in c:
                    if not word_in(span, c['anchor_span']):
                        err('anchor-span-not-in-span', r, c['anchor_span'])
                    elif not matches_context(c['anchor_span'], existing, world):
                        err('anchor-not-in-context', r, c['anchor_span'])
                if c['phase'] == 'selector' and c['key'] not in NON_OBJECT_SELECTORS and not matches_context(c['value_span'], existing, world):
                    err('selector-not-in-context', r, c['value_span'])
                if 'value' not in c and not (c.get('qualitative') or c.get('mention')):
                    err('constraint-without-value-not-marked-qualitative', r, c['key'])
        probe = {'text': text, 'world': world, 'context': json.loads(json.dumps(r['context'])), 'requests': json.loads(json.dumps(r['requests']))}
        e, w, f = VALIDATOR.check(probe)
        for x in e:
            err('official:' + x, r)
        for x in f:
            err('official-fix:' + x, r)
        for x in w:
            notes['official-warning:' + x.split(':')[0]] += 1
    # near duplicates inside a case (token-set Jaccard >= 0.85)
    for cid, rs in per_case.items():
        toks = [(r, set(norm(r['text']).split())) for r in rs]
        for i in range(len(toks)):
            for j in range(i + 1, len(toks)):
                a, b = toks[i][1], toks[j][1]
                if a and b and len(a & b) / len(a | b) >= 0.85:
                    notes['near-duplicate-pair'] += 1
    official_texts = set()
    od = REPO / 'official-dataset'
    for p in (od / 'train.jsonl.gz', od / 'dev.jsonl', od / 'test.jsonl'):
        opener = gzip.open if p.suffix == '.gz' else open
        with opener(p, 'rt') as s:
            for line in s:
                o = json.loads(line)
                official_texts.add((o['world'], ' '.join(o['text'].lower().split())))
    for r in rows:
        if (r['world'], ' '.join(r['text'].lower().split())) in official_texts:
            err('text-already-in-official-dataset', r)
    tiers = collections.Counter(r['tier'] for r in rows)
    short = {cid: len(rs) for cid, rs in per_case.items() if len(rs) < 20}
    report = {'rows': len(rows), 'cases': len(per_case), 'tiers': dict(tiers), 'errors': dict(errors), 'errorExamples': dict(examples),
              'notes': dict(notes), 'casesBelow20': short}
    if path.name == 'examples.jsonl':
        (HERE / 'validation.json').write_text(json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    quotas = json.loads((HERE / 'quotas.json').read_text()) if (HERE / 'quotas.json').exists() else {}
    worlds = {r['world'] for r in rows}
    progress = []
    for cid, need in sorted(quotas.items()):
        if OPS[CASE_INDEX[cid][0]]['world'] in worlds:
            rs = per_case.get(cid, [])
            t = collections.Counter(r['tier'][0] for r in rs)
            if len(rs) < need or not all(t[x] for x in 'ecs'):
                progress.append(f'  {cid}: {len(rs)}/{need} (e{t["e"]} c{t["c"]} s{t["s"]})')
    if progress:
        print(f'{len(progress)} cases below quota or missing a tier:', *progress, sep='\n')
    print(json.dumps({k: report[k] for k in ('rows', 'cases', 'tiers', 'errors', 'notes')}, indent=1))
    for kind, ex in examples.items():
        print(kind, *ex, sep='\n  ')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
