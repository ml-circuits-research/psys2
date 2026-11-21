#!/usr/bin/env python3
"""Coverage matrix: for each declared function (tab, operation, parameter) the rows of the official dataset that carry it
and the distinct human paraphrases among them (target: at least 20 per function).

Function list and parameter -> reader key mapping: functions.json (generate.py; the importer's key rule). A request is
attributed to its row's operation when the row names a declared operation of its tab and has one request; otherwise to
the declared operation whose label template (target type, act, mode, mood, constraint keys) fits it best. A request
carries a parameter when it has the parameter's key (or a historical spelling of it, ui-coverage-v2 KEY_EQUIV);
`@kind` = the new target's kind is written, `@ref` = the target is referred to. The operation row "(operation)" counts
every request attributed to the operation.

Human paraphrases = rows written as whole sentences by people or authoring agents in paraphrase corpora:
corpus-grounded drops (data-drop-v1 without the mechanical robustness variants, human-adapted-v1-*) and the authored
paraphrase sets (ui-human-v1, ui-coverage-v2, ui-tiers-v1, main-synthetic human-* except typos, the owner's voice
sentences). Template generators (ui-natural-v1, ui-relations-v1, ui-comparatives-v1, ui-features-v1, ui-diagram-v2,
ui-drawing-style-v1, ui-quantities-v1, ui-composition-v1, demo-tool-profile, main-synthetic mechanical-*) and this
corpus count as rows only. Distinct = distinct lower-cased texts without punctuation.

Writes coverage.json here and the Markdown matrix given as the first argument (default: management/COVERAGE-MATRIX.md).
"""
import collections
import gzip
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
sys.path.insert(0, str(HERE.parent / 'ui-coverage-v2'))
from cases import KEY_EQUIV  # noqa: E402

TARGET = 20
ORDER = ['diagram', 'drawing', 'document', 'calendar', 'avatar']
EQUIV = {k: set(v) | {k} for k, v in KEY_EQUIV.items()}
for a, b in (('drawn.color', 'drawn.colour'), ('part.color', 'part.colour'), ('meeting.length', 'meeting.duration')):
    EQUIV.setdefault(a, {a}).add(b)
    EQUIV.setdefault(b, {b}).add(a)
CORPUS_GROUNDED = ('data-drop-v1', 'human-adapted-v1-drawing', 'human-adapted-v1-diagram')
AUTHORED = ('ui-human-v1', 'ui-coverage-v2', 'ui-tiers-v1')
MECHANICAL_STYLE = re.compile(r'(robustness|-asr|-typo|-nospace|-filler|-polite|human-typo|structural-fill)')


def kind_of(row):
    s, st = row['source'], str(row.get('style') or '')
    if MECHANICAL_STYLE.search(st):
        return None
    if s in CORPUS_GROUNDED:
        return 'corpus'
    if s in AUTHORED or (s == 'main-synthetic' and st.startswith('human-')) or (s == 'ui-diagram-v2-voice' and st.startswith('heldout-owner')):
        return 'authored'
    return None


def norm(t):
    return ' '.join(re.findall(r"[a-z0-9']+", t.lower()))


def official_rows():
    od = REPO / 'official-dataset'
    for p in (od / 'train.jsonl.gz', od / 'dev.jsonl', od / 'test.jsonl'):
        with (gzip.open if p.suffix == '.gz' else open)(p, 'rt') as s:
            for line in s:
                r = json.loads(line)
                if not r.get('augmentation') and r['source'] != 'ui-systematic-v1':
                    yield r


def main():
    out_md = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'management' / 'COVERAGE-MATRIX.md'
    fx = json.loads((HERE / 'functions.json').read_text())
    templates = fx['templates']
    by_tab = collections.defaultdict(list)
    for name, t in templates.items():
        t['keyset'] = {e for k in t['keys'].values() if k and k[0] not in '@#' for e in EQUIV.get(re.split('[@=]', k)[0], {re.split('[@=]', k)[0]})}
        by_tab[t['tab']].append(name)

    def classify(world, q):
        tg = q.get('target') or {}
        keys = {c['key'] for c in q.get('constraints') or []}
        best, score = None, -99
        for name in by_tab[world]:
            t = templates[name]
            if t['type'] != tg.get('type'):
                continue
            s = 2 * (t['act'] == q.get('act')) + (t['mode'] == tg.get('mode')) + 2 * len(keys & t['keyset']) - len(keys - t['keyset'])
            if (t['mood'] == 'ask') != (q.get('mood') in ('ask', 'check')):
                s -= 5
            if s > score:
                best, score = name, s
        return best

    def carries(q, key):
        tg = q.get('target') or {}
        if key == '@kind':
            return bool(tg.get('kind') or tg.get('kind_span'))
        if key == '@ref':
            return bool(tg.get('name_span') or tg.get('kind_span') or tg.get('description_span') or tg.get('fill') in ('context', 'all', 'written', 'description'))
        if key == '@all':
            return tg.get('fill') == 'all'
        base = re.split('[@=]', key)[0]
        eq = EQUIV.get(base, {base})
        return any(c.get('key') in eq for c in q.get('constraints') or [])
    rows_n = collections.Counter()
    human = collections.defaultdict(set)
    corpus = collections.defaultdict(set)
    total = 0
    key_human = collections.defaultdict(set)  # (tab, reader key) -> distinct human texts, whatever the operation
    for r in official_rows():
        total += 1
        k = kind_of(r)
        for q in r['requests']:
            if k:
                for c in q.get('constraints') or []:
                    for e in EQUIV.get(c.get('key'), {c.get('key')}):
                        key_human[(r['world'], e)].add(norm(r['text']))
            op = r.get('operation') if r.get('operation') in templates and templates[r['operation']]['tab'] == r['world'] and len(r['requests']) == 1 else classify(r['world'], q)
            if not op:
                continue
            hits = [None] + [p for p, key in templates[op]['keys'].items() if key and carries(q, key)]
            for p in hits:
                f = (op, p)
                rows_n[f] += 1
                if k:
                    human[f].add(norm(r['text']))
                if k == 'corpus':
                    corpus[f].add(norm(r['text']))
    canon = {}
    for line in (HERE / 'examples.jsonl').read_text().splitlines():
        e = json.loads(line)
        c = e['cohort']
        if c['operation'] != 'compound':
            canon.setdefault((c['operation'], '*'), (e['text'], c['form']))
        if c['combination'] in ('single', 'operation') and c['form'] in ('name', 'new', 'context', 'description'):
            key = (c['operation'], (c.get('parameters') or [None])[0] if c['combination'] == 'single' else None)
            if key not in canon or (c['form'] == 'name' and canon[key][1] != 'name'):
                canon[key] = (e['text'], c['form'])
    funcs = []
    for f in fx['functions']:
        if f['parameter'] is None or (f['parameter'] in ('id', 'ids') and f['key'] in ('@ref', None)):
            continue  # the target reference: covered by the operation row
        op, p = f['operation'], f['parameter']
        key = f['key']
        kb = re.split('[@=]', key)[0] if key and key[0] not in '@#' else None
        funcs.append({'tab': f['tab'], 'operation': op, 'parameter': p, 'key': key, 'rows': rows_n[(op, p)] if key else 0,
                      'keyHuman': len(key_human[(f['tab'], kb)]) if kb else None,
                      'human': len(human[(op, p)]) if key else 0, 'corpus': len(corpus[(op, p)]) if key else 0,
                      'canonical': (canon.get((op, p)) or canon.get((op, None)) or canon.get((op, '*')) or ('', ''))[0]})
    for op, t in templates.items():
        funcs.append({'tab': t['tab'], 'operation': op, 'parameter': None, 'key': None, 'rows': rows_n[(op, None)], 'human': len(human[(op, None)]),
                      'corpus': len(corpus[(op, None)]), 'canonical': (canon.get((op, None)) or canon.get((op, '*')) or ('', ''))[0], 'opRow': True})
    for f in funcs:
        f['status'] = 'no-key' if (f['key'] is None and not f.get('opRow')) else 'covered' if f['human'] >= TARGET else 'thin' if f['human'] else 'missing'
        f['need'] = 0 if f['status'] == 'covered' else 25 - f['human']
        f['keys'] = f['key'] or ''
        if f.get('opRow'):
            t = templates[f['operation']]
            f['keys'] = f"act={t['act']} target={t['type']}/{t['mode']}"
    funcs.sort(key=lambda f: (ORDER.index(f['tab']), f['status'] == 'covered', f['status'] == 'no-key', -f['need'], f.get('keyHuman') or 0, f['operation'], str(f['parameter'])))
    (HERE / 'coverage.json').write_text(json.dumps({'format': 'psys2.ui-systematic-coverage/1', 'target': TARGET, 'officialRows': total, 'functions': funcs}, indent=1, ensure_ascii=False) + '\n')
    summary = collections.defaultdict(collections.Counter)
    for f in funcs:
        summary[f['tab']][f['status']] += 1
    md = ['# Coverage matrix: declared editor functions x official dataset', '',
          f'Generated by `psys2/training/sop-bert/data/ui-systematic-v1/coverage.py` from the official dataset on disk ({total:,} non-augmented rows) and the '
          'declared native interfaces (`declarations.json`, live `host.bindings()`). One function = (tab, operation, parameter); "(operation)" = every request of that operation.', '',
          f'- **rows**: requests in the official dataset that carry the function (all sources). **human**: distinct human paraphrases among them (corpus-grounded drops + authored paraphrase sets; template generators and mechanical variants excluded; see coverage.py). **corpus**: the corpus-grounded part (data-drop-v1, human-adapted). **key human**: distinct human texts carrying the same reader key under any operation of the tab (a gap with a high key count needs the operation\'s frame, not new vocabulary).',
          f'- **covered**: human >= {TARGET}; **thin**: 1-{TARGET - 1}; **missing**: 0; **no-key**: declared parameter with no reader key in `official-dataset/inventory.json` (needs an inventory key before rows can label it; write rows with `needs`). **need** = paraphrases to reach 25.',
          '- Canonical sentence: the canonical anchor in `ui-systematic-v1/examples.jsonl` (plain command, not a paraphrase).', '', '## Summary', '',
          '| tab | functions | covered | thin (<20) | missing (0) | no reader key |', '| --- | ---: | ---: | ---: | ---: | ---: |']
    for tab in ORDER:
        s = summary[tab]
        md.append(f"| {tab} | {sum(s.values())} | {s['covered']} | {s['thin']} | {s['missing']} | {s['no-key']} |")
    s = collections.Counter()
    for tab in ORDER:
        s.update(summary[tab])
    md += [f"| **all** | {sum(s.values())} | {s['covered']} | {s['thin']} | {s['missing']} | {s['no-key']} |", '']
    for tab in ORDER:
        md += [f'## {tab}', '', '| status | operation | parameter | reader key | rows | human | corpus | key human (any operation) | need | canonical sentence |', '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |']
        for f in [f for f in funcs if f['tab'] == tab]:
            md.append(f"| {f['status']} | `{f['operation']}` | {f['parameter'] or '(operation)'} | {f['keys']} | {f['rows']:,} | {f['human']} | {f['corpus']} | {'' if f.get('keyHuman') is None else f['keyHuman']} | {f['need']} | {f['canonical']} |")
        md.append('')
    out_md.write_text('\n'.join(md) + '\n')
    for tab in ORDER:
        print(tab, dict(summary[tab]))


if __name__ == '__main__':
    main()
