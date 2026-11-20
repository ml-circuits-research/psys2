#!/usr/bin/env python3
"""Re-pin the semantic alignment catalogue (semantic-alignments-v2.json) to a knowledge catalog pin and to the current
official-dataset inventory. C1 source authoring only: no model, corpus or execution.

- Every aligned family/property keeps its alignment when its declaration line is still in the same file at the new pin
  (evidence re-hashed); otherwise it becomes unresolved with the reason.
- Inventory families/properties missing from the catalogue are added: a property of an aligned family is aligned when the
  family's canonical type declares a slot with the property's own name (`@<canonical>.<name> core.slot of=<canonical> key=<name>`)
  at the pin; the native operation/parameter of that name is recorded when the area's native interface declares it. Anything
  else is unresolved with the standard reason. Properties no longer in the inventory are dropped.
Usage: python3 repin-semantic-catalogue.py KNOWLEDGE_REPO PIN [--write]"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CATALOGUE = ROOT / 'training/sop-bert/bindings/semantic-alignments-v2.json'
AREAS = ['drawing', 'diagram', 'document', 'calendar', 'avatar']
NATIVE = {'drawing': 'worlds/art.draw/native-interface.sop', 'diagram': 'worlds/diagram.sketch/native-interface.sop'}
CHANGE_OP = {('drawing', 'drawn'): 'drawing.object.change', ('drawing', 'part'): 'drawing.part.change', ('drawing', 'page'): 'drawing.page.change',
             ('drawing', 'group'): 'drawing.group.change', ('diagram', 'node'): 'diagram.node.change', ('diagram', 'link'): 'diagram.link.change',
             ('diagram', 'group'): 'diagram.group.change'}
UNRESOLVED = 'Missing reviewed owning semantic declaration/value contract; raw descriptor prefix or shared concept alone is not an alignment.'


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    repo, pin = Path(sys.argv[1]), sys.argv[2]
    write = '--write' in sys.argv
    cache = {}

    def source(path):
        if path not in cache:
            try:
                cache[path] = subprocess.run(['git', '-C', str(repo), 'show', f'{pin}:{path}'], capture_output=True, check=True).stdout
            except subprocess.CalledProcessError:
                cache[path] = None
        return cache[path]

    cat = json.loads(CATALOGUE.read_text())
    inv_bytes = (ROOT / cat['inventory']['path']).read_bytes()
    inv = json.loads(inv_bytes)
    stats = {'repinned': 0, 'lostDeclaration': 0, 'addedAligned': 0, 'addedUnresolved': 0, 'dropped': 0}

    def repin(row):
        e = row.get('evidence')
        if row['status'] != 'aligned' or not e:
            return row
        b = source(e['path'])
        if b is None or e['declaration'] not in b.decode().split('\n'):
            stats['lostDeclaration'] += 1
            return {k: v for k, v in row.items() if k not in ('alignment', 'evidence', 'valueContract', 'canonical', 'sourceWire', 'authority')} | \
                {'status': 'unresolved', 'reason': f'declaration no longer present at knowledge pin {pin}'}
        e.update({'knowledgePin': pin, 'sha256': sha(b)})
        stats['repinned'] += 1
        return row

    families = {(f['area'], f['type']): repin(f) for f in cat['families']}
    props = {(p['area'], p['key']): repin(p) for p in cat['properties']}
    native = {area: (ROOT / path).read_text() for area, path in NATIVE.items()}
    template = next(p['valueContract'] for p in cat['properties'] if p['status'] == 'aligned' and p.get('valueContract', {}).get('representation') == 'string')
    out_f, out_p = [], []
    for area in AREAS:
        for typ, row in inv.get(area, {}).items():
            f = families.get((area, typ)) or {'area': area, 'type': typ, 'rawMeaning': row.get('doc'), 'status': 'unresolved', 'reason': UNRESOLVED}
            f['rawMeaning'] = row.get('doc')
            out_f.append(f)
            for name, desc in row['keys'].items():
                key = f'{typ}.{name}'
                p = props.get((area, key))
                if p:
                    p['descriptor'] = desc
                    out_p.append(p)
                    continue
                canon = f.get('canonical') if f['status'] == 'aligned' else None
                world = canon.rsplit('.', 1)[0] if canon else None
                path = f'docs/worlds/{world}/schema.sop' if world else None
                b = source(path) if path else None
                decl = None
                if b:
                    decl = next((l for l in b.decode().split('\n') if l.startswith(f'@{canon}.{name} core.slot of={canon} key={name} ')), None)
                if not decl:
                    out_p.append({'area': area, 'type': typ, 'key': key, 'descriptor': desc, 'status': 'unresolved', 'reason': UNRESOLVED})
                    stats['addedUnresolved'] += 1
                    continue
                module = re.search(r'@\S+ core\.module name=' + re.escape(world) + r' version=(\S+)', b.decode())
                alignment = {'area': area, 'key': key, 'sourceWire': f'{canon}.{name}', 'canonical': f'{canon}.{name}', 'valueKind': 'string'}
                op = CHANGE_OP.get((area, typ))
                if op and area in native and re.search(rf'op\.{re.escape(op)}\.param\.{re.escape(name)} ', native[area]):
                    alignment.update({'host': area, 'operation': op, 'parameter': name})
                out_p.append({'area': area, 'type': typ, 'key': key, 'descriptor': desc, 'status': 'aligned', 'alignment': alignment,
                              'evidence': {'knowledgePin': pin, 'path': path, 'sha256': sha(b), 'sourceWire': f'{canon}.{name}', 'sourceWorld': world,
                                           'moduleVersion': module.group(1) if module else '1', 'declaration': decl},
                              'valueContract': template})
                stats['addedAligned'] += 1
    stats['dropped'] = len(props) - sum(1 for p in out_p if (p['area'], p['key']) in props)
    sources = []
    for s in cat['sources']:
        b = source(s['path'])
        if b is not None:
            sources.append({**s, 'sha256': sha(b)})
    for p in out_f + out_p:  # every schema used by an aligned row is a declared source
        e = p.get('evidence')
        if p['status'] == 'aligned' and e:
            sp = f"docs/worlds/{e['sourceWorld']}/schema.sop"
            if not any(s['path'] == sp for s in sources) and source(sp) is not None:
                sources.append({'path': sp, 'sha256': sha(source(sp))})
            if not any(s['path'] == e['path'] for s in sources):
                sources.append({'path': e['path'], 'sha256': e['sha256']})
    cat.update({'knowledgePin': pin, 'inventory': {**cat['inventory'], 'sha256': sha(inv_bytes)}, 'families': out_f, 'properties': out_p, 'sources': sources,
                'coverage': {'families': len(out_f), 'alignedFamilies': sum(f['status'] == 'aligned' for f in out_f), 'properties': len(out_p),
                             'alignedProperties': sum(p['status'] == 'aligned' for p in out_p)}})
    print(json.dumps({**stats, 'coverage': cat['coverage']}))
    if write:
        CATALOGUE.write_text(json.dumps(cat, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
