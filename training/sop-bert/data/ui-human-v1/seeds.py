#!/usr/bin/env python3
"""Select paraphrase seeds from the executed ui-natural-v1 corpus.

C1 authoring only. A seed is one fully specified, executed example per
(world, operation, constraint-key set). Each constraint is marked optional or
mandatory from the native declaration (selectors and required parameters stay).
Omission subsets already executed in the same recipe family are linked so a
simplified paraphrase can reuse their verified native call.
"""
import json, collections, pathlib
here = pathlib.Path(__file__).parent
src = here.parent / 'ui-natural-v1'
examples = [json.loads(l) for l in open(src / 'examples.jsonl')]
inventory = json.load(open(src / 'coverage.json'))['nativeInventory']
params = {op['id']: op['params'] for ops in inventory.values() for op in ops}

def family(e):
    c = e['cohort']
    return c.get('recipeFamily') or '+'.join(c.get('recipeFamilies', []))

def keyset(e):
    return tuple(sorted(c['key'] for r in e['requests'] for c in r['constraints']))

def param_of(e):
    """constraint key -> native parameter name, from the extraction layer."""
    out = {}
    clauses = e['extraction'].get('clauses') or [e['extraction']]
    for clause in clauses:
        for p in clause.get('parameters', []):
            for v in p.get('v2Constraints', []):
                out[v['key']] = p['parameter']
            out.setdefault(('surface', str(p.get('surface'))), p['parameter'])
    return out

def resolve_param(pmap, constraint, declared):
    if constraint['key'] in pmap:
        return pmap[constraint['key']]
    by_surface = pmap.get(('surface', str(constraint['value_span'])))
    if by_surface:
        return by_surface
    suffix = constraint['key'].split('.', 1)[-1]
    aliases = {'colour': 'color', 'color': 'color'}
    for name in (suffix, aliases.get(suffix)):
        if name and name in declared:
            return name
    return None

by_family = collections.defaultdict(list)
for e in examples:
    by_family[family(e)].append(e)

SEED_STYLES = {'natural-direct', 'optional-detail-complete', 'precise', 'compound',
               'world-informed-completion', 'curated-synonym', 'character-kind'}
rank = {'natural-direct': 0, 'optional-detail-complete': 0, 'compound': 0, 'precise': 1,
        'world-informed-completion': 0, 'character-kind': 2, 'curated-synonym': 3}
chosen = {}
for e in examples:
    if e['style'] not in SEED_STYLES:
        continue
    op = (e.get('nativeTool') or {}).get('operation') or e['cohort'].get('operation') or e['style']
    sig = (e['world'], op, keyset(e), e['style'] == 'compound')
    if sig not in chosen or rank[e['style']] < rank[chosen[sig]['style']]:
        chosen[sig] = e

seeds = []
for (world, op, keys, _), e in sorted(chosen.items(), key=lambda kv: kv[1]['id']):
    pmap = param_of(e)
    declared = params.get(op, {})
    constraints = []
    for ri, r in enumerate(e['requests']):
        for c in r['constraints']:
            p = resolve_param(pmap, c, declared)
            mandatory = c['phase'] == 'selector' or bool(declared.get(p, {}).get('required'))
            constraints.append({'request': ri, 'key': c['key'], 'value': c['value'],
                                'surface': c['value_span'], 'phase': c['phase'],
                                'parameter': p, 'optional': not mandatory})
    links = {}
    for sib in by_family[family(e)]:
        if sib.get('nativeTool') and len(sib['requests']) == len(e['requests']):
            links.setdefault('|'.join(keyset(sib)), sib['id'])
    seeds.append({'seed': e['id'], 'world': world, 'operation': op, 'style': e['style'],
                  'family': family(e), 'text': e['text'], 'context': e['context'],
                  'requests': e['requests'], 'constraints': constraints,
                  'executed': bool(e.get('nativeTool')), 'verifiedSubsets': links})

with open(here / 'seeds.jsonl', 'w') as f:
    for s in seeds:
        f.write(json.dumps(s, ensure_ascii=False) + '\n')
print(len(seeds), collections.Counter(s['world'] for s in seeds))

# Author batches: a compact view with numbered constraints, 16 seeds per batch.
def view(s):
    reqs = []
    for ri, r in enumerate(s['requests']):
        cs = [c for c in s['constraints'] if c['request'] == ri]
        reqs.append({'act': r['act'], 'mood': r['mood'], 'trigger': r['trigger'],
            'target': {k: v for k, v in r['target'].items() if k in ('type', 'mode', 'kind', 'kind_span', 'name_span', 'count_span', 'ordinal')},
            'constraints': [{'n': i, 'key': c['key'], 'value': c['value'], 'surface': c['surface'], 'phase': c['phase'], 'optional': c['optional']} for i, c in enumerate(cs)]})
    return {'seed': s['seed'], 'world': s['world'], 'operation': s['operation'], 'text': s['text'],
            'existing': s['context'].get('existing'), 'requests': reqs}
(here / 'batches').mkdir(exist_ok=True)
for b in range(0, len(seeds), 16):
    with open(here / 'batches' / f'b{b // 16:02d}.jsonl', 'w') as f:
        for s in seeds[b:b + 16]:
            f.write(json.dumps(view(s), ensure_ascii=False) + '\n')
