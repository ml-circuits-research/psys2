#!/usr/bin/env python3
"""Operation x parameter coverage of the official SOP-BERT dataset before and after adding ui-coverage-v2.

Before: official-dataset/{train.jsonl.gz,dev.jsonl,test.jsonl} as on disk (augmented copies excluded).
After: before + examples.jsonl. Writes coverage.md and coverage.json.

A request is attributed to its row's operation when the row names a current operation of the five tabs and has a single
request; otherwise (compound rows, rows without an operation, legacy operation names) it is attributed by its labels:
tab, target type, act and the overlap of its constraint keys with the operation's parameter keys. A request counts for
a case when it carries all the case's keys (cases.py syntax). New rows also always count for the case they were
authored for (simplified paraphrases may leave case values to completion)."""
import collections
import gzip
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from cases import OPS, CASE_INDEX, KEY_EQUIV, DRAW_KINDS, TABS, UI_CONTROLS, check_interfaces  # noqa: E402

REPO = HERE.parents[3]
TARGET = 20
SLOT_ID = re.compile(r'\b(?:[a-z]+_[a-z_]+|[orbag]\d{1,2}|chart:\d+)\b')
QUOTA_DEFICIT, QUOTA_COVERED = 22, 8


def equiv(key):
    return {key, *KEY_EQUIV.get(key, [])}


def op_keys(name):
    o = OPS[name]
    keys = {re.split('[@=]', k)[0] for ks in o['params'].values() for k in ks if k[0] not in '@#?!'}
    keys |= {re.split('[@=]', k)[0] for _, ks in o['cases'] for k in ks if k[0] not in '@#?!'}
    if o['sel']:
        keys.add(o['sel'])
    return {e for k in keys for e in equiv(k)}


OP_KEYS = {n: op_keys(n) for n in OPS}
ORDER = list(OPS)


def classify(world, q):
    t = q.get('target') or {}
    keys = {c['key'] for c in q.get('constraints') or []}
    best, score = None, -1
    for name in ORDER:
        o = OPS[name]
        if o['world'] != world or o['type'] != t.get('type'):
            continue
        s = 2 * (o['act'] == q.get('act')) + (o['mode'] == t.get('mode')) + 2 * len(keys & OP_KEYS[name]) - len(keys - OP_KEYS[name])
        if (o['mood'] == 'ask') != (q.get('mood') in ('ask', 'check')):
            s -= 5
        if s > score:
            best, score = name, s
    if best == 'drawing.object.make' and t.get('kind') and t['kind'] not in DRAW_KINDS:
        best = 'drawing.catalog.make'
    if best == 'calendar.meeting.add' and not keys & {'meeting.people', 'meeting.participants', 'meeting.room', 'meeting.calendar', 'meeting.free'}:
        best = 'calendar.event.add'
    return best


def satisfies(q, key, name):
    t = q.get('target') or {}
    cons = q.get('constraints') or []
    if key == '@kind':
        return 'kind_span' in t or 'kind' in t
    if key == '@name':
        return 'name_span' in t
    if key == '@ctx':
        return t.get('fill') == 'context'
    if key == '@all':
        return t.get('fill') == 'all'
    if key == '@ref':
        return any(f in t for f in ('name_span', 'kind_span', 'description_span')) or t.get('fill') == 'context'
    if key == '#sel2':
        return sum(c.get('phase') == 'selector' for c in cons) >= 2
    if key == '#multi':
        return len({c['key'] for c in cons if c.get('phase') == 'result'} & OP_KEYS[name]) >= 2
    if key.startswith('!'):
        return not satisfies(q, key[1:], name)
    if key.startswith('?'):
        return (q.get('question') or {}).get('ask') == key[1:]
    base, _, rest = key.partition('=')
    value = rest or None
    base, _, oper = base.partition('@')
    for c in cons:
        if c['key'] not in equiv(base):
            continue
        if value is not None and str(c.get('value', c.get('raw_value'))) != value:
            continue
        if oper in ('eq', 'delta', 'degree', 'region', 'relation', 'factor') and c.get('operator') != oper:
            continue
        if oper == 'negative' and c.get('polarity') != 'negative':
            continue
        if oper in ('selector', 'result') and c.get('phase') != oper:
            continue
        if not oper and value is None and c.get('phase') == 'selector' and base != OPS[name]['sel'] and not base.endswith(('.text', '.from', '.to')):
            continue
        return True
    return False


def attribute(row):
    ops = []
    for q in row['requests']:
        op = row.get('operation') if row.get('operation') in OPS and len(row['requests']) == 1 else classify(row['world'], q)
        if op:
            ops.append((op, q))
    return ops


def count(rows, authored=False):
    cases, params, enums = collections.Counter(), collections.Counter(), collections.defaultdict(collections.Counter)
    for row in rows:
        own = row.get('cohort', {}).get('case') if authored else None
        hit = set()
        for op, q in attribute(row):
            for suffix, keys in OPS[op]['cases']:
                cid = f'{op}:{suffix}'
                if all(satisfies(q, k, op) for k in keys):
                    hit.add(cid)
            for p, keys in OPS[op]['params'].items():
                if keys and any(satisfies(q, k, op) for k in keys):
                    params[(op, p)] += 1
            for c in q.get('constraints') or []:
                if 'value' in c and c.get('phase') == 'result':
                    enums[(op, c['key'])][str(c['value'])] += 1
            if q.get('target', {}).get('kind'):
                enums[(op, '@kind')][q['target']['kind']] += 1
        if own:
            hit.add(own)
        for cid in hit:
            cases[cid] += 1
    return cases, params, enums


def official_rows():
    od = REPO / 'official-dataset'
    rows = []
    for p in (od / 'train.jsonl.gz', od / 'dev.jsonl', od / 'test.jsonl'):
        opener = gzip.open if p.suffix == '.gz' else open
        with opener(p, 'rt') as s:
            rows += [json.loads(l) for l in s if l.strip()]
    return [r for r in rows if not r.get('augmentation')]


def main():
    problems, interfaces = check_interfaces()
    before_rows = official_rows()
    new_rows = [json.loads(l) for l in (HERE / 'examples.jsonl').read_text().splitlines() if l.strip()] if (HERE / 'examples.jsonl').exists() else []
    b_cases, b_params, _ = count(before_rows)
    h_cases, _, _ = count([r for r in before_rows if not SLOT_ID.search(r['text'])])
    if '--quotas' in sys.argv:
        quotas = {cid: (QUOTA_DEFICIT if h_cases[cid] < TARGET else QUOTA_COVERED) for cid in CASE_INDEX}
        (HERE / 'quotas.json').write_text(json.dumps(quotas, indent=1, sort_keys=True) + '\n')
    n_cases, n_params, n_enums = count(new_rows, authored=True)
    manifest = json.loads((REPO / 'official-dataset' / 'MANIFEST.json').read_text())
    out = ['# Coverage: operation x parameter, before and after ui-coverage-v2', '',
           f'Produced by `coverage.py`. **Before** = the official dataset as built on disk ({sum(manifest["splits"].values()):,} rows incl. augmented copies; '
           f'{len(before_rows):,} non-augmented rows counted). **New** = this corpus ({len(new_rows):,} rows). **After** = before + new. '
           f'Target: every case at least {TARGET} rows. **Human-named** = before, counting only rows whose text has no slot or tool id '
           f'(o1, r2, b3, a1, hair_front, chart:1); people do not write those, so they do not cover how a case is asked.', '',
           'Attribution: a row\'s own operation when it names a current operation and has one request; otherwise its labels (tab, target type, act, constraint keys). '
           'A row counts for every case whose keys it carries; new rows also count for the case they were authored for. Counts are rows, not distinct meanings.', '']
    if problems:
        out += ['Interface mapping problems:', ''] + [f'- {p}' for p in problems] + ['']
    summary = []
    case_table = []
    for world, wdir in TABS.items():
        ops = [n for n in OPS if OPS[n]['world'] == world]
        cids = [f'{n}:{s}' for n in ops for s, _ in OPS[n]['cases']]
        nparams = sum(len(interfaces[world][n]['params']) for n in ops)
        below_b = sum(h_cases[c] < TARGET for c in cids)
        below_a = sum(h_cases[c] + n_cases[c] < TARGET for c in cids)
        zero_b = sum(h_cases[c] == 0 for c in cids)
        summary.append((world, wdir, len(ops), nparams, len(cids), zero_b, below_b, below_a, sum(1 for r in new_rows if r['world'] == world)))
    out += ['## Summary', '', '| tab | world | operations | declared parameters | cases | cases with 0 human-named rows before | cases < 20 human-named before | cases < 20 human-named after | new rows |',
            '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    out += [f'| {w} | {d} | {a} | {b} | {c} | {z} | {e} | {f} | {g:,} |' for w, d, a, b, c, z, e, f, g in summary]
    t = [sum(x[i] for x in summary) for i in range(2, 9)]
    out += [f'| **all** | | {t[0]} | {t[1]} | {t[2]} | {t[3]} | {t[4]} | {t[5]} | {t[6]:,} |', '']
    for world, wdir in TABS.items():
        out += [f'## {world} ({wdir})', '', '### Cases', '', '| case | keys | before | before, human-named | new | after | after, human-named |', '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
        for n in [n for n in OPS if OPS[n]['world'] == world]:
            for s, keys in OPS[n]['cases']:
                cid = f'{n}:{s}'
                b, h, nn = b_cases[cid], h_cases[cid], n_cases[cid]
                flag = ' ⚠' if h + nn < TARGET else ''
                out.append(f'| `{cid}` | {" ".join(keys) or "(any)"} | {b:,} | {h:,} | {nn:,} | {b + nn:,} | {h + nn:,}{flag} |')
                case_table.append({'case': cid, 'keys': keys, 'before': b, 'beforeHumanNamed': h, 'new': nn, 'after': b + nn, 'afterHumanNamed': h + nn})
        out += ['', '### Operation x parameter (requests carrying the parameter)', '', '| operation | parameter | required | reader keys | before | new | after |',
                '| --- | --- | :---: | --- | ---: | ---: | ---: |']
        for n in [n for n in OPS if OPS[n]['world'] == world]:
            declared = interfaces[world][n]['params']
            if not declared:
                out.append(f'| `{n}` | (none) | | | | | |')
            for p, d in declared.items():
                keys = OPS[n]['params'].get(p) or []
                if not keys:
                    out.append(f'| `{n}` | {p} | {"yes" if d["required"] else ""} | (excluded, see cases.py) | | | |')
                    continue
                b, nn = b_params[(n, p)], n_params[(n, p)]
                out.append(f'| `{n}` | {p} | {"yes" if d["required"] else ""} | {" ".join(keys)} | {b:,} | {nn:,} | {b + nn:,} |')
        out += ['']
    out += ['## Enum spread in the new rows', '', 'Values of closed-enum parameters in this corpus (result values; target kinds).', '', '| operation | key | values |', '| --- | --- | --- |']
    for (n, key), vals in sorted(n_enums.items()):
        if len(vals) > 1:
            out.append(f'| `{n}` | {key} | ' + ', '.join(f'{v} {c}' for v, c in vals.most_common(25)) + ' |')
    out += ['', '## UI controls (buttons, forms) and their cases', '', '| tab | control | case | before | new | after |', '| --- | --- | --- | ---: | ---: | ---: |']
    for world, label, cid in UI_CONTROLS:
        out.append(f'| {world} | {label} | `{cid}` | {b_cases[cid]:,} | {n_cases[cid]:,} | {b_cases[cid] + n_cases[cid]:,} |')
    (HERE / 'coverage.md').write_text('\n'.join(out) + '\n')
    (HERE / 'coverage.json').write_text(json.dumps({'format': 'psys2.ui-coverage-v2-coverage/1', 'target': TARGET, 'beforeRows': len(before_rows), 'newRows': len(new_rows),
                                                   'summary': [dict(zip(['tab', 'world', 'operations', 'parameters', 'cases', 'zeroBefore', 'below20Before', 'below20After', 'newRows'], s)) for s in summary],
                                                   'cases': case_table}, indent=1) + '\n')
    for s in summary:
        print(s)


if __name__ == '__main__':
    main()
