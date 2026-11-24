#!/usr/bin/env python3
"""The reader inventory's keys follow the SOP schema.

The reader keys of the four tabs are SOP facts of w.request in sop-knowledge-worlds
(docs/worlds/w.request/shards/keys.sop: `w.request.key tab=... family=... name=family.key head=... value=... about=...`).
This script brings official-dataset/inventory.json in line with them: a key added there is added here (head, values,
src from `about`), a changed head or list is updated, and a key no longer declared there is reported (not deleted:
other areas of the inventory may still read it).

Usage:
    python3 official-dataset/keys_from_sop.py           # update inventory.json
    python3 official-dataset/keys_from_sop.py --check   # exit 1 when inventory.json differs from the SOP keys
The knowledge checkout is ../sop-knowledge-worlds (or $SOP_KNOWLEDGE).
"""
import collections
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KNOWLEDGE = Path(os.environ.get('SOP_KNOWLEDGE', HERE.parent.parent / 'sop-knowledge-worlds'))
SHARD = KNOWLEDGE / 'docs' / 'worlds' / 'w.request' / 'shards' / 'keys.sop'
INVENTORY = HERE / 'inventory.json'
TABS = ('drawing', 'diagram', 'document', 'calendar')


def token(v):
    return json.loads(v) if v.startswith('"') else v


def sop_keys():
    keys = []
    for line in SHARD.read_text().splitlines():
        if not line.startswith('@') or ' w.request.key ' not in line:
            continue
        attrs = collections.defaultdict(list)
        for k, v in re.findall(r' ([a-z_.]+)=("(?:[^"\\]|\\.)*"|\S+)', line):
            attrs[k].append(token(v))
        keys.append({'tab': attrs['tab'][0], 'family': attrs['family'][0], 'name': attrs['name'][0],
                     'head': attrs['head'][0], 'values': attrs.get('value', []), 'about': (attrs.get('about') or [''])[0]})
    return keys


def main():
    check = '--check' in sys.argv
    inv = json.loads(INVENTORY.read_text(), object_pairs_hook=collections.OrderedDict)
    declared, changes = set(), []
    for k in sop_keys():
        tab, fam, key = k['tab'], k['family'], k['name'].split('.', 1)[1]
        declared.add((tab, fam, key))
        families = inv.setdefault(tab, collections.OrderedDict())
        row = families.setdefault(fam, collections.OrderedDict([('doc', fam), ('keys', collections.OrderedDict())]))
        entry = row['keys'].get(key)
        head = k['head'] if '+' not in k['head'] else k['head']
        if entry is None:
            entry = collections.OrderedDict([('concept', key), ('head', head), ('src', k['about'] or 'w.request keys.sop')])
            if k['values']:
                entry['values'] = k['values']
            row['keys'][key] = entry
            changes.append(f'added {tab} {k["name"]}')
            continue
        old_head = '+'.join(entry['head']) if isinstance(entry.get('head'), list) else entry.get('head')
        if old_head != head:
            changes.append(f'head {tab} {k["name"]}: {old_head} -> {head}')
            entry['head'] = head
        if (entry.get('values') or []) != k['values']:
            changes.append(f'values {tab} {k["name"]}')
            if k['values']:
                entry['values'] = k['values']
            else:
                entry.pop('values', None)
    for tab in TABS:
        for fam, row in inv.get(tab, {}).items():
            for key in row.get('keys', {}):
                if (tab, fam, key) not in declared:
                    changes.append(f'not in keys.sop: {tab} {fam}.{key}')
    for c in changes:
        print(c)
    if check:
        sys.exit(1 if changes else 0)
    INVENTORY.write_text(json.dumps(inv, indent=1, ensure_ascii=False) + '\n')
    print(f'{len(changes)} changes written to {INVENTORY.name}')


if __name__ == '__main__':
    main()
