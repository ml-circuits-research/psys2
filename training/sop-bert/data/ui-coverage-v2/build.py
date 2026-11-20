#!/usr/bin/env python3
"""Expand the authored seeds (seeds/*.jsonl, compact surface annotations) into examples.jsonl in the reader label format
that official-dataset/build.py consumes (the ui-natural/ui-human/ui-relations row shape).

Deterministic. Run: python3 build.py   (then python3 validate.py and python3 coverage.py)

Seed row (one JSON object per line):
  case     case id from cases.py ("<operation>:<suffix>")
  tier     equivalent | complex | simplified
  text     the message as a person writes it
  ctx      optional context name from contexts.py (default per tab), or an inline list of {"kind", "name"} objects
  trigger  the action word(s) as written; omit only when the text has none
  target   {"kind": s} | {"name": s} | {"refs": [s, ...]} | {"ctx": true} | {"all": s}; optional "lemma", "ordinal",
           "count": s, "desc": s, "nosel": true
  c        constraints: [key, surface, value?, opts?]; value omitted = derived (number from the surface, bank value equal to
           the surface, or the surface itself for copy keys); "?" = qualitative (no gold value; completion requirement); "-" = a mention
           with no class value (e.g. the source group of a chart for chart.source, whose bank has no such class);
           opts: "delta" "degree" "region" "relation" "factor" "sel" "neg" "pref" or {"op","phase","polarity","character",
           "anchor","anchor_kind"}
  q        question kind for answer requests (describe, count, exists, when, ...)
  span     the request span when the text holds more than this request (default: whole text)
  also     further requests of the same message, same fields plus "op" (compound requests)
  complete extra completion requirements (free text), e.g. a world-informed default the text relies on
"""
import collections
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from cases import NON_OBJECT_SELECTORS, OPS, CASE_INDEX, KEY_POLICY, POLICY, TABS, parse_interface  # noqa: E402
from contexts import CONTEXTS, DEFAULT  # noqa: E402

REPO = HERE.parents[3]
INVENTORY = json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())
NUMBER_WORDS = {w: i for i, w in enumerate('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split())}
NUMBER_WORDS.update({'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90, 'hundred': 100,
                     'half': 0.5, 'twice': 2, 'double': 2, 'triple': 3, 'once': 1, 'an': 1, 'a': 1, 'quarter': 15})
OPTS = {'delta': ('operator', 'delta'), 'degree': ('operator', 'degree'), 'region': ('operator', 'region'), 'relation': ('operator', 'relation'),
        'factor': ('operator', 'factor'), 'sel': ('phase', 'selector'), 'neg': ('polarity', 'negative'), 'pref': ('character', 'preference')}
BOUNDARY = 'Completion values are not text-extraction gold.'
INTERFACES = {}


def spec(world, key):
    typ, _, name = key.partition('.')
    return INVENTORY.get(world, {}).get(typ, {}).get('keys', {}).get(name)


def number(surface):
    digits = re.findall(r'(?<![\w.])[-+]?\d+(?:\.\d+)?', surface)
    if len(digits) == 1:
        v = float(digits[0])
        return str(int(v)) if v.is_integer() else str(v)
    if digits:
        return None
    words = [w for w in re.findall(r'[a-z]+', surface.lower()) if w in NUMBER_WORDS and w not in ('a', 'an')]
    if not words:
        words = [w for w in re.findall(r'[a-z]+', surface.lower()) if w in ('a', 'an')]
    if len(words) == 1:
        v = float(NUMBER_WORDS[words[0]])
        return str(int(v)) if v.is_integer() else str(v)
    if len(words) == 2 and NUMBER_WORDS[words[0]] >= 20 and NUMBER_WORDS[words[1]] < 10:
        return str(NUMBER_WORDS[words[0]] + NUMBER_WORDS[words[1]])
    return None


class SeedError(Exception):
    pass


def constraint(world, item, default_phase='result'):
    if not isinstance(item, list) or len(item) < 2:
        raise SeedError(f'bad constraint {item!r}')
    key, surface = item[0], item[1]
    value = item[2] if len(item) > 2 else None
    opts = item[3] if len(item) > 3 else None
    if isinstance(value, (dict,)) or (isinstance(value, str) and value in OPTS and len(item) == 3):
        opts, value = value, None
    s = spec(world, key)
    if s is None:
        raise SeedError(f'unregistered key {world}.{key}')
    c = {'key': key, 'value_span': surface, 'operator': 'eq', 'phase': default_phase, 'polarity': 'positive', 'character': 'requirement'}
    for o in ([opts] if isinstance(opts, (str, dict)) else (opts or [])):
        if isinstance(o, str):
            if o not in OPTS:
                raise SeedError(f'unknown option {o}')
            f, v = OPTS[o]
            c[f] = v
        else:
            for f, v in o.items():
                f = {'op': 'operator', 'anchor': 'anchor_span'}.get(f, f)
                c[f] = v
    if value == '?':
        c['qualitative'] = True
    elif value == '-':
        c['mention'] = True
    else:
        if value is None:
            head, bank = s['head'], s.get('values')
            if bank:
                low = surface.lower()
                value = next((b for b in bank if b.lower() == low), None)
                if value is None and head.startswith('number'):
                    value = number(surface)
                if value is None:
                    raise SeedError(f'{key}: surface {surface!r} is not a bank value; give the value')
            elif head.startswith('number'):
                value = number(surface)
                if value is None:
                    raise SeedError(f'{key}: no single number in {surface!r}; give the value')
            else:
                value = surface
        c['value'] = str(value) if isinstance(value, (int, float)) else value
    if 'anchor_span' in c:
        c.setdefault('anchor_fill', 'description')
    order = ['key', 'value', 'value_span', 'operator', 'phase', 'polarity', 'character']
    return {**{k: c[k] for k in order if k in c}, **{k: v for k, v in c.items() if k not in order}}


def is_ref_selector(c):
    """A selector that names an object (not a text range, a day, a time or a length)."""
    opts = c[3] if len(c) > 3 else c[2] if len(c) > 2 else None
    opts = opts if isinstance(opts, list) else [opts]
    return 'sel' in opts and c[0] not in NON_OBJECT_SELECTORS


def request(world, opname, seed, text):
    o = OPS[opname]
    span = seed.get('span') or text
    if span not in text:
        raise SeedError(f'span not in text: {span!r}')
    tgt = seed.get('target') or {}
    ttype = tgt.get('type') or o['type']
    if ttype not in INVENTORY.get(world, {}):
        raise SeedError(f'target type {ttype} not in {world}')
    t = {'type': ttype, 'mode': o['mode'], 'determiner': 'indefinite' if o['mode'] == 'new' else 'definite'}
    cons = []
    if o['mode'] == 'existing':
        if 'name' in tgt or 'refs' in tgt:
            refs = tgt.get('refs') or [tgt['name']]
            t['fill'] = 'written'
            t['name_span'] = refs[0]
            if o['sel'] and not tgt.get('nosel'):
                cons += [constraint(world, [o['sel'], r, r, 'sel'], 'selector') for r in refs]
        elif 'kind' in tgt:
            t['fill'] = 'description'
            t['kind'] = tgt.get('lemma') or tgt['kind'].lower()
            t['kind_span'] = tgt['kind']
        elif tgt.get('all'):
            t['fill'] = 'all'
            t['description_span'] = tgt['all']
        elif tgt.get('ctx'):
            t['fill'] = 'context'
        elif any(is_ref_selector(c) for c in seed.get('c') or []):
            first = next(c for c in seed['c'] if is_ref_selector(c))
            t['fill'] = 'written'
            t['name_span'] = first[1]
        elif o['fill'] in ('journal_step', 'all', 'context'):
            t['fill'] = o['fill']
        elif o['fill'] in ('description', 'written'):
            t['fill'] = 'context'
        else:
            raise SeedError('existing target without reference (target name/refs/kind/ctx/all)')
        if 'kind' in tgt and t.get('fill') == 'written':
            t['kind'] = tgt.get('lemma') or tgt['kind'].lower()
            t['kind_span'] = tgt['kind']
    elif 'kind' in tgt:
        t['kind'] = tgt.get('lemma') or tgt['kind'].lower()
        t['kind_span'] = tgt['kind']
    for f in ('ordinal',):
        if f in tgt:
            t[f] = tgt[f]
    if 'count' in tgt:
        t['count_span'] = tgt['count']
        n = number(tgt['count'])
        if n:
            t['count'] = n
    if 'desc' in tgt:
        t['description_span'] = tgt['desc']
    cons += [constraint(world, c) for c in seed.get('c') or []]
    q = {'span': span}
    if seed.get('trigger'):
        q['trigger'] = seed['trigger']
    q.update({'act': o['act'], 'mood': o['mood'], 'target': t, 'constraints': cons})
    if o['mood'] == 'ask' or seed.get('q'):
        ask = seed.get('q') or next((k[1:] for _, ks in o['cases'] for k in ks if k.startswith('?')), 'describe')
        q['question'] = {'ask': ask}
    return q


def present_keys(q):
    keys = set()
    for c in q['constraints']:
        keys.add(c['key'])
    return keys


def completion(opname, case_keys, q, seed):
    """Requirements for values the text does not give: case parameters left out, required native parameters the request
    does not express, qualitative/relative values and context references."""
    reqs, seen = [], set()
    o = OPS[opname]
    keys = present_keys(q)
    world = o['world']
    declared = INTERFACES[world].get(opname, {'params': {}})

    def add(key, requirement, policy, **extra):
        if (key, requirement) in seen:
            return
        seen.add((key, requirement))
        reqs.append({'key': key, 'requirement': requirement, 'policy': POLICY.get(policy, policy), **extra, 'verifiedByThisDataset': False})
    for ck in case_keys:
        if ck[0] in '@#?!':
            continue
        base = re.split('[@=]', ck)[0]
        if base not in keys:
            add(base, 'omitted', KEY_POLICY.get(base, 'name'))
    for pname, p in declared['params'].items():
        mapped = o['params'].get(pname) or []
        real = [k for k in mapped if k[0] not in '@#?']
        if not p['required'] or not real or '@ref' in mapped:
            continue
        bases = [re.split('[@=]', k)[0] for k in real]
        if pname == 'start' and 'meeting.shift' in keys:
            add('meeting.time', 'relative', 'new start = current start shifted as stated, kept free of conflicts', parameter=pname)
        elif pname == 'start':  # a start is a day and a clock time: each one the text leaves out is completed
            for b in bases:
                if b not in keys:
                    add(b, 'omitted', KEY_POLICY.get(b, 'name'), parameter=pname)
        elif not any(b in keys for b in bases):
            add(bases[0], 'omitted', KEY_POLICY.get(bases[0], 'name'), parameter=pname)
    for c in q['constraints']:
        if c.get('qualitative'):
            add(c['key'], 'qualitative', 'resolve the vague value against the world (comparison class, page regions, calendar preferences)', surface=c['value_span'])
        elif c['operator'] in ('delta', 'factor'):
            add(c['key'], 'relative', 'relsize' if c['key'].endswith(('size', 'scale')) else 'new value = current value of the referent changed as stated', surface=c['value_span'])
        elif c['operator'] in ('region', 'relation', 'degree'):
            add(c['key'], c['operator'], 'region' if c['operator'] == 'region' else ('position' if c['operator'] == 'relation' else 'size'), surface=c['value_span'])
    if q['target'].get('fill') == 'context':
        add('target', 'reference', 'reference')
    for note in seed.get('complete') or []:
        add('world', 'world-informed', note)
    return reqs


def load_seeds(only=None):
    rows = []
    for path in sorted((HERE / 'seeds').glob('*.jsonl')):
        if only and path.stem not in only:
            continue
        for i, line in enumerate(path.read_text().splitlines(), 1):
            if line.strip() and not line.lstrip().startswith('//'):
                try:
                    rows.append((path.name, i, json.loads(line)))
                except json.JSONDecodeError as e:
                    raise SystemExit(f'{path.name}:{i}: {e}')
    return rows


def main():
    for world, wdir in TABS.items():
        INTERFACES[world] = parse_interface(wdir)
    out, errors, per_tab = [], [], collections.Counter()
    only = sys.argv[1:]
    for fname, line, seed in load_seeds(only):
        where = f'{fname}:{line}'
        try:
            cid = seed['case']
            if cid not in CASE_INDEX:
                raise SeedError(f'unknown case {cid}')
            opname, case_keys = CASE_INDEX[cid]
            world = OPS[opname]['world']
            if seed.get('tier') not in ('equivalent', 'complex', 'simplified'):
                raise SeedError(f'bad tier {seed.get("tier")}')
            text = seed['text']
            reqs = [request(world, opname, seed, text)]
            comp = completion(opname, case_keys, reqs[0], seed)
            for extra in seed.get('also') or []:
                if extra.get('op') not in OPS or OPS[extra['op']]['world'] != world:
                    raise SeedError(f'bad compound operation {extra.get("op")}')
                if not extra.get('span') or not seed.get('span'):
                    raise SeedError('compound requests need explicit spans')
                q = request(world, extra['op'], extra, text)
                reqs.append(q)
                comp += completion(extra['op'], [], q, extra)
            ctx_name = seed.get('ctx') or DEFAULT[world]
            if isinstance(ctx_name, list):
                if not all(isinstance(e, dict) and e.get('kind') and 'name' in e for e in ctx_name):
                    raise SeedError('inline context entries need kind and name')
                existing = ctx_name
            elif ctx_name in CONTEXTS and ctx_name.startswith(world):
                existing = CONTEXTS[ctx_name]
            else:
                raise SeedError(f'bad context {ctx_name}')
        except (SeedError, KeyError) as e:
            errors.append(f'{where}: {e}')
            continue
        per_tab[world] += 1
        fam = int(hashlib.sha256(text.encode()).hexdigest(), 16) % 4
        out.append({
            'format': 'psys2.ui-coverage-example/2', 'id': f'ui-coverage-v2-{world}-{per_tab[world]:05d}', 'world': world, 'text': text,
            'context': {'existing': [dict(e) for e in existing], 'previous': None}, 'requests': reqs,
            'style': f'coverage-{seed["tier"]}', 'tier': seed['tier'], 'phase': 'direct',
            'cohort': {'operation': opname if len(reqs) == 1 else 'compound', 'case': cid, 'recipeFamily': f'{cid}#{fam}',
                       **({'operations': [opname] + [e['op'] for e in seed['also']]} if len(reqs) > 1 else {})},
            'completion': {'requirements': comp, 'boundary': BOUNDARY}, 'nativeTool': None,
            'provenance': f'C1: authored paraphrase ({fname}:{line}) of case {cid}; labels mark only what the text says; mechanically validated by validate.py',
        })
    if errors:
        print('\n'.join(errors[:200]))
        raise SystemExit(f'{len(errors)} seed errors')
    target = HERE / ('examples.jsonl' if not only else f'scratch-examples.{"-".join(only)}.jsonl')
    target.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in out))
    print(json.dumps({'rows': len(out), 'perTab': dict(per_tab), 'written': target.name}))


if __name__ == '__main__':
    main()
