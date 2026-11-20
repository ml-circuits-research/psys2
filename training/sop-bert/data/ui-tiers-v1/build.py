#!/usr/bin/env python3
"""Expand seeds.jsonl into examples.jsonl with the ui-coverage-v2 seed expander (same seed syntax, label templates and
completion policies; see ../ui-coverage-v2/build.py). Ids are ui-tiers-v1-<tab>-<nnnnn>. Run: python3 build.py && python3 validate.py"""
import collections
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
COV = HERE.parent / 'ui-coverage-v2'
spec = importlib.util.spec_from_file_location('cov_build', COV / 'build.py')
cb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cb)


def main():
    for world, wdir in cb.TABS.items():
        cb.INTERFACES[world] = cb.parse_interface(wdir)
    out, errors, per_tab = [], [], collections.Counter()
    for line, raw in enumerate((HERE / 'seeds.jsonl').read_text().splitlines(), 1):
        if not raw.strip():
            continue
        seed = json.loads(raw)
        try:
            cid = seed['case']
            opname, case_keys = cb.CASE_INDEX[cid]
            world = cb.OPS[opname]['world']
            if seed.get('tier') not in ('equivalent', 'complex', 'simplified'):
                raise cb.SeedError(f'bad tier {seed.get("tier")}')
            text = seed['text']
            reqs = [cb.request(world, opname, seed, text)]
            comp = cb.completion(opname, case_keys, reqs[0], seed)
            for extra in seed.get('also') or []:
                q = cb.request(world, extra['op'], extra, text)
                reqs.append(q)
                comp += cb.completion(extra['op'], [], q, extra)
            existing = cb.CONTEXTS[seed.get('ctx') or cb.DEFAULT[world]]
        except (cb.SeedError, KeyError) as e:
            errors.append(f'seeds.jsonl:{line}: {e}')
            continue
        per_tab[world] += 1
        fam = int(hashlib.sha256(text.encode()).hexdigest(), 16) % 4
        out.append({
            'format': 'psys2.ui-coverage-example/2', 'id': f'ui-tiers-v1-{world}-{per_tab[world]:05d}', 'world': world, 'text': text,
            'context': {'existing': [dict(e) for e in existing], 'previous': None}, 'requests': reqs,
            'style': f'coverage-{seed["tier"]}', 'tier': seed['tier'], 'phase': 'direct',
            'cohort': {'operation': opname if len(reqs) == 1 else 'compound', 'case': cid, 'recipeFamily': f'{cid}#{fam}',
                       **({'operations': [opname] + [e['op'] for e in seed['also']]} if len(reqs) > 1 else {})},
            'completion': {'requirements': comp, 'boundary': cb.BOUNDARY}, 'nativeTool': None,
            'provenance': f'C1: authored tier paraphrase (ui-tiers-v1/seeds.jsonl:{line}) of case {cid}; labels mark only what the text says; mechanically validated by validate.py',
        })
    if errors:
        raise SystemExit('\n'.join(errors))
    (HERE / 'examples.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in out))
    print(json.dumps({'rows': len(out), 'perTab': dict(per_tab)}))


if __name__ == '__main__':
    main()
