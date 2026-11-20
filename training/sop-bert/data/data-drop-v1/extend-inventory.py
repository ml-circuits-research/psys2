#!/usr/bin/env python3
"""Add reader keys for declared native parameters that the official inventory lacks (data-drop-v1/inventory.json).

Families map to the native operations whose parameters they carry; the runtime binds <family>.<parameter> to the
same-named parameter. Closed enums become class keys with their values, numbers number keys, strings and arrays span
keys. Existing keys are never changed. Run: python3 extend-inventory.py && python3 ../../../../official-dataset/build.py"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
FAMILIES = {  # (area, type): (interface, operation prefixes)
    ('diagram', 'link'): ('worlds/diagram.sketch/native-interface.sop', ['diagram.link.']),
    ('diagram', 'chart'): ('worlds/diagram.sketch/native-interface.sop', ['diagram.chart.', 'diagram.group.chart.make']),
    ('avatar', 'figure'): ('worlds/ui.avatar/native-interface.sop', ['avatar.figure.']),
    ('avatar', 'preference'): ('worlds/ui.avatar/native-interface.sop', ['avatar.preference.']),
    ('diagram', 'preference'): ('worlds/diagram.sketch/native-interface.sop', ['diagram.preference.']),
    ('drawing', 'preference'): ('worlds/art.draw/native-interface.sop', ['drawing.preference.']),
}
SKIP = {'ids', 'id'}
PARAM = re.compile(r'op\.(\S+?)\.param\.(\w+) std\.capability\.parameter operation=\S+ name="(\w+)" kind=(\w+)([^@\n]*)')


def main():
    official = json.loads((REPO / 'official-dataset' / 'inventory.json').read_text())
    path = HERE / 'inventory.json'
    inv = json.loads(path.read_text())
    added = []
    for (area, typ), (iface, prefixes) in FAMILIES.items():
        f = REPO / iface
        if not f.exists():
            continue
        for m in PARAM.finditer(f.read_text()):
            op, name, kind, rest = m.group(1), m.group(3), m.group(4), m.group(5)
            if not any(op.startswith(p) for p in prefixes) or name in SKIP:
                continue
            have = official.get(area, {}).get(typ, {}).get('keys', {})
            keys = inv.setdefault(area, {}).setdefault(typ, {'keys': {}})['keys']
            if name in have or name in keys:
                continue
            enums = re.findall(r'enum="([^"]+)"', rest)
            if enums and 'enumClosed=true' in rest:
                spec = {'head': 'class', 'values': enums}
            elif kind in ('number', 'integer'):
                spec = {'head': 'number'}
            elif kind == 'boolean':
                spec = {'head': 'class', 'values': ['on', 'off']}
            else:
                spec = {'head': 'span'}
            keys[name] = {**spec, 'concept': name, 'src': f'native parameter {op}.{name} ({iface})'}
            added.append(f'{area}.{typ}.{name}')
    for area, types in inv.items():
        for typ, d in types.items():
            if typ not in official.get(area, {}):
                d.setdefault('doc', f'native {area} {typ} (declared operations)')
    path.write_text(json.dumps(inv, indent=1, ensure_ascii=False) + '\n')
    print(json.dumps({'added': len(added), 'keys': added}))


if __name__ == '__main__':
    main()
