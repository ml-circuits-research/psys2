#!/usr/bin/env python3
"""Validate authored paraphrases mechanically and assemble ui-human-v1 examples.

C1 only. Every kept value must occur verbatim in the text; dropped or vague values
become completion requirements, never extracted gold. A simplified paraphrase links
to a native call only when an executed subset of its recipe family has exactly the
same kept constraint keys.
"""
import json, re, sys, pathlib, collections, copy
here = pathlib.Path(__file__).parent
seeds = {s['seed']: s for s in map(json.loads, open(here / 'seeds.jsonl'))}
base = {e['id']: e for e in map(json.loads, open(here.parent / 'ui-natural-v1' / 'examples.jsonl'))}
TIERS = {'equivalent', 'complex', 'simplified'}
norm = lambda t: re.sub(r'[^a-z0-9#:,.]+', ' ', t.lower()).strip()
seen = {norm(e['text']) for e in base.values()}
rejects, examples = collections.Counter(), []
reject_samples = collections.defaultdict(list)

def locate(text, surface):
    """Unicode-scalar [start,end) of a verbatim surface; also report ambiguity."""
    start = text.find(surface)
    if start < 0:
        return None, False
    return [start, start + len(surface)], text.find(surface, start + 1) >= 0

def reject(reason, seed, text):
    rejects[reason] += 1
    if len(reject_samples[reason]) < 5:
        reject_samples[reason].append({'seed': seed, 'text': text})

def build(seed, variant, index):
    text, tier = variant.get('text', '').strip(), variant.get('tier')
    if tier not in TIERS or not text:
        return reject('bad-tier-or-text', seed['seed'], text)
    if norm(text) in seen:
        return reject('duplicate', seed['seed'], text)
    reqs = variant.get('requests') or []
    if len(reqs) != len(seed['requests']):
        return reject('request-count', seed['seed'], text)
    out_requests, completion, kept_keys, ambiguous, vague_any = [], [], [], [], False
    for ri, (sr, ar) in enumerate(zip(seed['requests'], reqs)):
        r = copy.deepcopy(sr)
        evidence = []
        trig = ar.get('trigger')
        if sr.get('trigger'):
            if not trig: return reject('missing-trigger', seed['seed'], text)
            loc, amb = locate(text, trig)
            if not loc: return reject('trigger-not-in-text', seed['seed'], text)
            r['trigger'] = trig; evidence.append(loc)
            if amb: ambiguous.append('trigger')
        for field in ('kind_span', 'name_span', 'count_span'):
            if field in sr['target']:
                surface = ar.get(field)
                if not surface: return reject('missing-' + field, seed['seed'], text)
                loc, amb = locate(text, surface)
                if not loc: return reject(field + '-not-in-text', seed['seed'], text)
                r['target'][field] = surface; evidence.append(loc)
                if amb: ambiguous.append(field)
        seed_cs = [c for c in seed['constraints'] if c['request'] == ri]
        authored = ar.get('constraints') or {}
        constraints = []
        for n, (sc, label) in enumerate(zip(seed_cs, sr['constraints'])):
            if str(n) not in authored:
                return reject('constraint-unmapped', seed['seed'], text)
            a = authored[str(n)]
            if a is None:
                if not sc['optional'] or tier != 'simplified':
                    return reject('illegal-drop', seed['seed'], text)
                completion.append({'key': sc['key'], 'parameter': sc['parameter'], 'requirement': 'omitted',
                                   'policy': 'complete from world defaults and preferences', 'verifiedByThisDataset': False})
                continue
            if isinstance(a, dict):
                surface = a.get('vague')
                if not surface or not sc['optional'] or tier != 'simplified':
                    return reject('illegal-vague', seed['seed'], text)
                loc, amb = locate(text, surface)
                if not loc: return reject('vague-not-in-text', seed['seed'], text)
                c = dict(label, value=None, value_span=surface, qualitative=True)
                constraints.append(c); evidence.append(loc); vague_any = True
                completion.append({'key': sc['key'], 'parameter': sc['parameter'], 'requirement': 'qualitative',
                                   'surface': surface, 'seedValue': sc['value'],
                                   'policy': 'resolve the qualitative value against the world (regions, comparison class)',
                                   'verifiedByThisDataset': False})
                continue
            if not isinstance(a, str):
                return reject('bad-constraint', seed['seed'], text)
            loc, amb = locate(text, a)
            if not loc: return reject('value-not-in-text', seed['seed'], text)
            if amb: ambiguous.append(sc['key'])
            constraints.append(dict(label, value_span=a)); evidence.append(loc)
            kept_keys.append(sc['key'])
        r['constraints'] = constraints
        if len(seed['requests']) == 1:
            r['span'] = text
        else:
            r['span'] = text[min(e[0] for e in evidence):max(e[1] for e in evidence)] if evidence else None
            r['spanOrigin'] = 'surface-hull'
        out_requests.append(r)
    seen.add(norm(text))
    native = None
    if not vague_any and seed['executed']:
        linked = seed['verifiedSubsets'].get('|'.join(sorted(kept_keys)))
        if linked:
            native = dict(base[linked]['nativeTool'], linkedExample=linked)
    return {'format': 'psys2.ui-human-example/1', 'id': f"ui-human-{seed['seed'].split('-')[-1]}-{index:02d}",
            'world': seed['world'], 'text': text, 'context': seed['context'], 'requests': out_requests,
            'style': 'human-' + tier, 'tier': tier,
            'cohort': {'operation': seed['operation'], 'recipeFamily': seed['family'], 'seed': seed['seed']},
            'completion': {'requirements': completion,
                           'boundary': 'Completion values are not text-extraction gold.'},
            'ambiguousSurfaces': ambiguous, 'nativeTool': native,
            'provenance': 'C1 paraphrase authored by a coding agent from an executed seed; mechanically validated'}

outs = sorted((here / 'out').glob('b*.jsonl'))
per_seed = collections.Counter()
for path in outs:
    for line_no, line in enumerate(open(path), 1):
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            rejects['bad-json-line'] += 1; continue
        seed = seeds.get(record.get('seed'))
        if not seed:
            rejects['unknown-seed'] += 1; continue
        for i, variant in enumerate(record.get('variants') or []):
            example = build(seed, variant, i)
            if example:
                examples.append(example); per_seed[seed['seed']] += 1

with open(here / 'examples.jsonl', 'w') as f:
    for e in examples:
        f.write(json.dumps(e, ensure_ascii=False) + '\n')
report = {
    'format': 'psys2.ui-human-report/1', 'seeds': len(seeds), 'seedsAuthored': len(per_seed),
    'examples': len(examples), 'rejected': sum(rejects.values()), 'rejectReasons': dict(rejects),
    'byTier': dict(collections.Counter(e['tier'] for e in examples)),
    'byWorld': dict(collections.Counter(e['world'] for e in examples)),
    'linkedToExecutedNativeCall': sum(1 for e in examples if e['nativeTool']),
    'withAmbiguousSurface': sum(1 for e in examples if e['ambiguousSurfaces']),
    'seedsBelow20': sorted(s for s in per_seed if per_seed[s] < 20),
    'seedsMissing': sorted(set(seeds) - set(per_seed)),
    'rejectSamples': reject_samples,
}
json.dump(report, open(here / 'report.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in report.items() if k not in ('rejectSamples', 'seedsMissing')}, indent=1))
