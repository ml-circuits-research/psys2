#!/usr/bin/env python3
"""Mechanical conversion of the official tool-key labels to the domain-general semantic frame (specs/semantic-frame.md).

Reads official-dataset/{train.jsonl.gz,dev.jsonl,test.jsonl} and inventory.json; writes a separate folder (default
training/runs/official-frame-v1/, not in git) with the same rows carrying `frame` (sop.semantic-frame/1) instead of
`requests`, plus report.json and REPORT.md. The official dataset is not changed.

The role of a constraint comes from the inventory `concept` of its key (frame/concept-roles.json), never from the key's
spelling, except the few reference keys whose concept is the generic `reference` (byKey: which reference it is).
A constraint whose concept is a tool parameter (concept-roles `tool`) or unknown is kept in `unconverted` and counted.

usage: python3 convert_official.py [--official DIR] [--out DIR]
"""
import argparse, collections, gzip, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
FORMAT = 'sop.semantic-frame/1'
NUM = re.compile(r'^-?\d+(\.\d+)?$')
WORDNUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'a': 1, 'an': 1}


def load(path):
    op = gzip.open if path.endswith('.gz') else open
    with op(path, 'rt') as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


class Converter:
    def __init__(self, inventory, table):
        self.inv = inventory
        self.t = table
        self.roles = table['roles']
        self.stats = collections.Counter()
        self.unconverted = collections.Counter()
        self.examples = {}

    def concept(self, world, key):
        typ, _, k = key.partition('.')
        row = self.inv.get(world, {}).get(typ, {}).get('keys', {}).get(k)
        return typ, k, (row or {}).get('concept')

    def role_of(self, world, key, act, value):
        typ, k, concept = self.concept(world, key)
        if concept is None:
            return None, None, 'key-not-in-inventory'
        spec = self.roles.get(concept)
        if spec is None:
            return None, concept, 'concept-without-role'
        if spec.get('tool'):
            return None, concept, 'tool-parameter'
        role = spec.get('byKey', {}).get(k) or spec.get('byType', {}).get(typ) or spec['role']
        if role == 'motion.direction' and not (act in ('place', 'change') and str(value).lower() in self.t['motionValues']):
            role = 'attribute'
        name = spec.get('as', concept)
        if spec.get('keyQualifies'):
            name = k  # a toggle is named by what it toggles (stacked, horizontal)
        if role == 'attribute' and concept == 'reference':
            name = k
        return role, name, None

    def quantity(self, span, value):
        s = (span or '').strip().lower()
        v = value if value is not None else span
        if isinstance(v, (int, float)) or (isinstance(v, str) and NUM.match(v.strip())):
            return {'number': int(float(v))}
        if s in WORDNUM:
            return {'number': WORDNUM[s]}
        for word in self.t['vagueCounts']:
            if re.search(r'\b' + re.escape(word) + r'\b', s):
                return {'vague': word.split()[-1]}
        if s in ('all', 'every', 'each'):
            return {'all': True}
        return None

    def request(self, world, text, req, ctx):
        tgt = req.get('target') or {}
        act = req.get('act')
        clause = {'span': req.get('span'), 'action': {'act': self.t['acts'].get(act, act), 'mood': req.get('mood', 'do')}, 'mentions': []}
        if req.get('trigger'):
            clause['action']['trigger'] = req['trigger']
            clause['action']['predicate'] = req['trigger']
        if act not in self.t['acts']:
            self.unconverted['act:' + str(act)] += 1
        theme = {'role': 'theme'}
        mode = tgt.get('mode')
        if tgt.get('kind_span') or tgt.get('kind'):
            theme['head'] = tgt.get('kind_span') or tgt.get('kind')
        if tgt.get('determiner'):
            theme['determiner'] = tgt['determiner']
        theme['reference'] = 'new' if mode == 'new' else self.t['fills'].get(tgt.get('fill'), 'description')
        if tgt.get('name_span'):
            theme['name'] = tgt['name_span']
            if mode != 'new':
                theme['reference'] = 'name'
        if tgt.get('description_span'):
            theme['span'] = tgt['description_span']
        if tgt.get('ordinal'):
            theme['ordinal'] = [tgt['ordinal']]
            theme['reference'] = 'ordinal'
        if tgt.get('count_span') or tgt.get('count') is not None:
            q = self.quantity(tgt.get('count_span'), tgt.get('count'))
            if q:
                theme['quantity'] = q
        if tgt.get('quantifier') in ('all', 'each', 'every_except', 'both'):
            theme.setdefault('quantity', {'all': True})
            theme['reference'] = 'population'
        if 'head' not in theme and 'name' not in theme and theme['reference'] not in ('anaphora', 'population'):
            # the official target type is a tool family; the frame keeps it only as the head of last resort
            theme['head'] = tgt.get('type')
        theme['family'] = tgt.get('type')  # provenance: the official target family (not a reader label)
        clause['mentions'].append(theme)
        unconverted = []
        for c in req.get('constraints') or []:
            role, name, why = self.role_of(world, c['key'], act, c.get('value'))
            span = c.get('value_span')
            value = c.get('value', span)
            if role is None:
                unconverted.append({'key': c['key'], 'reason': why, 'span': span})
                self.unconverted[f"{why}:{world}.{c['key']}"] += 1
                continue
            self.stats['role:' + role] += 1
            phase = c.get('phase', 'result')
            if role == 'attribute':
                a = {'theme': 0, 'concept': name, 'value_span': span, 'operator': c.get('operator', 'eq'), 'phase': phase,
                     'polarity': c.get('polarity', 'positive')}
                if value is not None:
                    a['value'] = value
                for k in ('step', 'unit'):
                    if c.get(k):
                        a[k] = c[k]
                if c.get('measure') is not None:
                    a['value'] = c['measure']
                if a['operator'] == 'delta' and 'step' not in a and not NUM.match(str(a.get('value', ''))):
                    a['step'] = 'more'
                if c.get('variety'):
                    a['variety'] = c['variety']
                clause.setdefault('attributes', []).append(a)
            elif role == 'goal':
                clause.setdefault('goal', []).append({'theme': 0, 'concept': name, 'value': value, 'span': span})
            elif role == 'manner':
                m = {'theme': 0, 'objective': str(value), 'span': span}
                if c.get('step'):
                    m['degree'] = 'bit' if c['step'] in ('more', 'less') else 'much'
                clause.setdefault('manner', []).append(m)
            elif role == 'spatial.relation':
                clause.setdefault('spatial', []).append({'theme': 0, 'relation': value, 'span': span})
            elif role == 'spatial.region':
                clause.setdefault('spatial', []).append({'theme': 0, 'region': value, 'span': span})
            elif role == 'spatial.distance':
                d = {'value': c.get('measure', value), 'span': span}
                if c.get('unit'):
                    d['unit'] = c['unit']
                motion = clause.get('motion')
                if motion:
                    numeric = NUM.match(str(d['value']).strip())
                    motion[-1]['amount'] = {'number': float(d['value']), **({'unit': d['unit']} if 'unit' in d else {})} if numeric else {'degree': 'much' if 'far' in str(span) or 'lot' in str(span) else 'bit', 'span': span}
                else:
                    sp = clause.setdefault('spatial', [])
                    if sp:
                        sp[-1]['distance'] = d
                    else:
                        sp.append({'theme': 0, 'distance': d})
            elif role == 'spatial.landmark' or role == 'time.landmark':
                lm = {'role': 'landmark', 'head': span, 'reference': 'description', 'span': span}
                if c.get('anchor_fill'):
                    lm['reference'] = self.t['fills'].get(c['anchor_fill'], 'description')
                clause['mentions'].append(lm)
                idx = len(clause['mentions']) - 1
                group = 'time' if role == 'time.landmark' else 'spatial'
                rows = clause.setdefault(group, [])
                target = next((r for r in rows if 'relation' in r and 'landmark' not in r), None)
                if target is None:
                    target = {'theme': 0, 'relation': 'near' if group == 'spatial' else 'after'}
                    if group == 'time':
                        target['role'] = 'start'
                    rows.append(target)
                target['landmark'] = idx
            elif role == 'time.relation':
                rows = clause.setdefault('time', [])
                target = next((r for r in rows if 'landmark' in r and 'relation' not in r), None)
                if target:
                    target['relation'] = value
                else:
                    rows.append({'theme': 0, 'role': 'start', 'relation': value, 'span': span})
            elif role.startswith('time.'):
                t = {'theme': 0, 'role': {'time.day': 'day', 'time.start': 'start', 'time.end': 'end', 'time.duration': 'duration', 'time.shift': 'start'}[role],
                     'span': span, 'value': value}
                if role == 'time.shift':
                    t['operator'] = 'delta'
                if c.get('unit'):
                    t['unit'] = c['unit']
                if c.get('step'):
                    t['step'] = c['step']
                clause.setdefault('time', []).append(t)
            elif role == 'motion.direction':
                clause.setdefault('motion', []).append({'theme': 0, 'direction': str(value).lower(), 'span': span})
            elif role == 'theme.quantity':
                q = self.quantity(span, c.get('measure', value))
                if q:
                    theme['quantity'] = q
                else:
                    unconverted.append({'key': c['key'], 'reason': 'quantity-not-a-number-or-amount', 'span': span})
                    self.unconverted[f"quantity-not-a-number-or-amount:{world}.{c['key']}"] += 1
            elif role == 'theme.code':
                if phase == 'selector' or mode != 'new':
                    theme['code'] = span
                    theme['reference'] = 'code'
                else:
                    clause.setdefault('attributes', []).append({'theme': 0, 'concept': 'members', 'value_span': span, 'value': value, 'operator': 'eq', 'phase': phase})
            elif role == 'theme.ordinal':
                theme.setdefault('ordinal', []).append(value)
                theme['reference'] = 'ordinal'
            elif role == 'possessor':
                clause['mentions'].append({'role': 'possessor', 'head': span, 'reference': 'description', 'span': span})
                theme['possessor'] = len(clause['mentions']) - 1
            elif role == 'reference':
                clause.setdefault('attributes', []).append({'theme': 0, 'concept': name, 'value_span': span, 'value': value, 'operator': 'eq', 'phase': phase, 'value_type': 'reference'})
            else:
                unconverted.append({'key': c['key'], 'reason': 'role-not-handled:' + role, 'span': span})
                self.unconverted[f"role-not-handled:{role}"] += 1
        for rel in clause.get('spatial', []):
            if rel.get('relation') and 'landmark' not in rel:
                # a relation whose landmark the labels leave to context ("put it below")
                clause['mentions'].append({'role': 'landmark', 'reference': 'context'})
                rel['landmark'] = len(clause['mentions']) - 1
        q = req.get('question')
        if q:
            clause['question'] = {'type': q.get('ask')}
            if q.get('asked_key'):
                role, name, _ = self.role_of(world, q['asked_key'], act, None) if '.' in q['asked_key'] else ('attribute', q['asked_key'], None)
                clause['question']['concept'] = name or q['asked_key']
        turn = req.get('turn') or {}
        if turn.get('fragment'):
            clause['fragment'] = turn['fragment']
        if turn.get('objection'):
            clause['discourse'] = 'correction'
        return clause, unconverted

    def row(self, r):
        world = r['world']
        clauses, unconverted = [], []
        for req in r.get('requests') or []:
            c, u = self.request(world, r['text'], req, r.get('context'))
            clauses.append(c)
            unconverted.extend(u)
        frame = {'format': FORMAT, 'text': r['text'], 'area': world, 'clauses': clauses}
        prev = (r.get('context') or {}).get('previous')
        if prev:
            frame['previous'] = {'text': prev if isinstance(prev, str) else prev.get('text')}
        if len(clauses) > 1:
            frame['structure'] = {'relations': [{'type': 'sequence', 'from': i, 'to': i + 1} for i in range(len(clauses) - 1)]}
        out = {k: r[k] for k in ('id', 'split', 'world', 'text', 'context', 'family', 'source', 'source_id', 'style') if k in r}
        out['frame'] = frame
        if unconverted:
            out['unconverted'] = unconverted
        self.stats['rows'] += 1
        self.stats['requests'] += len(clauses)
        self.stats['rows.complete' if not unconverted else 'rows.partial'] += 1
        if not unconverted:
            self.stats['world.complete:' + world] += 1
        self.stats['world.rows:' + world] += 1
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--official', default=os.path.join(ROOT, 'official-dataset'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'training', 'runs', 'official-frame-v1'))
    a = ap.parse_args()
    inv = json.load(open(os.path.join(a.official, 'inventory.json')))
    for name in ('train.jsonl.gz', 'dev.jsonl', 'test.jsonl'):
        if not os.path.exists(os.path.join(a.official, name)):
            raise SystemExit(f'{os.path.join(a.official, name)} is missing: run python3 official-dataset/sop_dataset.py load')
    table = json.load(open(os.path.join(HERE, 'concept-roles.json')))
    conv = Converter(inv, table)
    os.makedirs(a.out, exist_ok=True)
    constraints = collections.Counter()
    for name in ('train.jsonl.gz', 'dev.jsonl', 'test.jsonl'):
        src = os.path.join(a.official, name)
        op = gzip.open if name.endswith('.gz') else open
        with op(os.path.join(a.out, name), 'wt') as f:
            for r in load(src):
                for q in r.get('requests') or []:
                    constraints['constraints'] += len(q.get('constraints') or [])
                f.write(json.dumps(conv.row(r), sort_keys=True) + '\n')
    s = conv.stats
    worlds = sorted(k.split(':')[1] for k in s if k.startswith('world.rows:'))
    report = {'format': 'psys2.frame-conversion-report/1', 'rows': s['rows'], 'requests': s['requests'], 'constraints': constraints['constraints'],
              'rowsComplete': s['rows.complete'], 'rowsPartial': s['rows.partial'],
              'perWorld': {w: {'rows': s['world.rows:' + w], 'complete': s['world.complete:' + w]} for w in worlds},
              'roles': {k[5:]: v for k, v in sorted(s.items()) if k.startswith('role:')},
              'unconverted': dict(conv.unconverted.most_common())}
    json.dump(report, open(os.path.join(a.out, 'report.json'), 'w'), indent=1)
    unconv_total = sum(conv.unconverted.values())
    lines = ['# official-frame-v1: official labels converted to semantic frames', '',
             'Generated by `python3 training/sop-bert/frame/convert_official.py` from `official-dataset/` (not changed). Roles come from',
             'the inventory concept of each key (`frame/concept-roles.json`). Format: `sop.semantic-frame/1` (specs/semantic-frame.md).', '',
             f"Rows {s['rows']}, requests {s['requests']}, constraints {constraints['constraints']}.",
             f"Rows converted completely: {s['rows.complete']} ({100*s['rows.complete']/max(1,s['rows']):.1f}%); with at least one unconverted constraint: {s['rows.partial']}.",
             f"Unconverted constraints: {unconv_total} ({100*unconv_total/max(1,constraints['constraints']):.2f}% of constraints).", '',
             '| World | Rows | Complete |', '| --- | ---: | ---: |']
    for w in worlds:
        n, c = s['world.rows:' + w], s['world.complete:' + w]
        lines.append(f'| {w} | {n} | {c} ({100*c/max(1,n):.1f}%) |')
    lines += ['', '## Roles produced', '', '| Role | Constraints |', '| --- | ---: |']
    lines += [f'| {k} | {v} |' for k, v in sorted(report['roles'].items(), key=lambda x: -x[1])]
    lines += ['', '## What could not be converted', '', 'Reason `tool-parameter`: the key names a tool parameter with no meaning of its own (a block id range, an',
              'attrs record, a chart series index). These need a reader role only if a human says them; most are UI-internal.', '',
              '| Reason: key | Constraints |', '| --- | ---: |']
    lines += [f'| {k} | {v} |' for k, v in conv.unconverted.most_common()]
    open(os.path.join(a.out, 'REPORT.md'), 'w').write('\n'.join(lines) + '\n')
    print(json.dumps({k: report[k] for k in ('rows', 'requests', 'constraints', 'rowsComplete', 'rowsPartial')}), f'unconverted={unconv_total}')


if __name__ == '__main__':
    main()
