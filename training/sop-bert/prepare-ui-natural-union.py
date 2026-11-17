"""Prepare the complete old/new SOP reader union; never trains or changes a model."""
import argparse
import collections
import copy
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_OUT = ROOT.parents[2] / '.session-control' / 'overnight-ui-natural-union'


def load_preparer():
    path = ROOT / 'prepare-key-reader.py'
    spec = importlib.util.spec_from_file_location('shared_key_preparer', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_rows(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def merge_inventory(old, new):
    merged = copy.deepcopy(old)
    for area, types in new.items():
        for typ, definition in types.items():
            target = merged.setdefault(area, {}).setdefault(typ, {'keys': {}})
            for name, value in definition.items():
                if name != 'keys':
                    target[name] = copy.deepcopy(value)
            for key, field in definition['keys'].items():
                prior = target['keys'].get(key)
                if prior and prior['head'] != field['head']:
                    raise ValueError(f'incompatible inventory head: {area}.{typ}.{key}')
                result = {**(prior or {}), **copy.deepcopy(field)}
                if 'values' in field or prior and 'values' in prior:
                    result['values'] = list(dict.fromkeys([*(prior or {}).get('values', []), *field.get('values', [])]))
                target['keys'][key] = result
    return merged


def new_group_splits(rows):
    """Connected components prevent a compound leaking either constituent family."""
    parents = {}

    def find(value):
        parents.setdefault(value, value)
        trail = []
        while parents[value] != value:
            trail.append(value)
            value = parents[value]
        for item in trail:
            parents[item] = value
        return value

    groups = []
    for row in rows:
        cohort = row.get('cohort', {})
        families = cohort.get('recipeFamilies') or [cohort.get('recipeFamily')]
        if not families or any(not isinstance(family, str) or not family for family in families):
            raise ValueError('missing explicit UI cohort: ' + row['source_id'])
        for family in families:
            find(family)
        for family in families[1:]:
            left, right = find(families[0]), find(family)
            parents[max(left, right)] = min(left, right)
        groups.append(families[0])
    return {row['source_id']: find(group) for row, group in zip(rows, groups)}


def split_for(identity):
    return 'calibration' if int(hashlib.sha256(identity.encode()).hexdigest()[:8], 16) % 10 == 0 else 'train'


def prepare(old_source, new_source, inventory_path, out, ui_weight=5, old_inventory_path=None):
    if ui_weight < 1 or ui_weight > 100:
        raise ValueError('ui-weight must be an integer from 1 to 100')
    shared = load_preparer()
    old_inventory_path = old_inventory_path or ROOT / 'data/demo-tool-profile/inventory.json'
    old_inventory = json.loads(old_inventory_path.read_text())
    new_inventory = json.loads(inventory_path.read_text())
    inventory = merge_inventory(old_inventory, new_inventory)
    families = shared.target_families(inventory)
    type_bank = sorted({typ for values in families.values() for typ in values})
    original_types = set(inventory['request']['target']['keys']['type'].get('values', []))
    if not original_types <= set(type_bank):
        raise ValueError('target type classes missing declared families: ' + str(original_types - set(type_bank)))
    inventory['request']['target']['keys']['type']['values'] = type_bank
    registry = shared.registry(inventory)
    old_coverage = set(shared.registry(old_inventory))
    old_rows, ui_rows = read_rows(old_source), read_rows(new_source)
    seen = set()
    for origin, rows in [('old', old_rows), ('ui', ui_rows)]:
        for row in rows:
            identity = origin + ':' + row['source_path'] + ':' + row['source_id']
            if identity in seen:
                raise ValueError('duplicate source identity: ' + identity)
            seen.add(identity)
            for request in row['requests']:
                for condition in request.get('constraints', []):
                    if row['world'] + '.' + condition['key'] not in registry:
                        raise ValueError('unregistered annotation key: ' + row['world'] + '.' + condition['key'])
    ui_groups = new_group_splits(ui_rows)
    out.mkdir(parents=True, exist_ok=False)
    (out / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
    handles = {name: (out / (name + '.jsonl')).open('w') for name in ['train', 'calibration', 'full-old', 'full-ui']}
    counts, diagnostics = collections.Counter(), {'old': collections.Counter(), 'ui': collections.Counter()}
    group_counts = collections.Counter()
    group_splits = {}
    try:
        for origin, rows in [('old', old_rows), ('ui', ui_rows)]:
            for raw in rows:
                identity = raw['source_path'] + ':' + raw['source_id']
                group = identity if origin == 'old' else raw['source_path'] + ':cohort:' + ui_groups[raw['source_id']]
                split = split_for(group)
                if origin == 'ui':
                    group_splits[group] = split
                counts[origin + ':messages'] += 1
                counts[origin + ':' + raw.get('phase', 'unknown') + ':messages'] += 1
                counts[origin + ':' + split + ':messages'] += 1
                source = {'id': identity, 'source_id': raw['source_id'], 'source_path': raw['source_path'], 'source': {'text': raw['text'], 'unit': 'unicode-scalar'}, 'world': raw['world'], 'context': raw['context'], 'annotationVersion': 'v2'}
                for index, request in enumerate(raw['requests'] or [None]):
                    record = shared.sample(source, request, registry, {})
                    if origin == 'old':
                        # These source authors never labelled the newly added native heads.
                        # Preserve all old supervision, but do not invent negative new labels.
                        record['coveredKeys'] = [key for key in record['coveredKeys'] if key in old_coverage]
                    record.update({'id': identity + ':' + str(index), 'source_id': raw['source_id'], 'source_path': raw['source_path'], 'split': split, 'requestIndex': index, 'expectedTools': raw.get('expectedTools'), 'origin': origin, 'phase': raw.get('phase'), 'cohort': raw.get('cohort'), 'splitGroup': group})
                    counts[origin + ':uniqueSamples'] += 1
                    counts[origin + ':' + split + ':uniqueSamples'] += 1
                    diagnostics[origin].update(item['reason'] for item in record['diagnostics'])
                    if origin == 'ui' and record['diagnostics']:
                        raise ValueError('new UI label diagnostics: ' + record['id'] + ': ' + json.dumps(record['diagnostics']))
                    encoded = json.dumps(record, ensure_ascii=False) + '\n'
                    handles['full-' + origin].write(encoded)
                    repetitions = ui_weight if origin == 'ui' and split == 'train' else 1
                    for repetition in range(repetitions):
                        weighted = {**record, 'id': record['id'] + (':ui-repeat-' + str(repetition) if repetitions > 1 else ''), 'repeatIndex': repetition}
                        handles[split].write(json.dumps(weighted, ensure_ascii=False) + '\n')
                        counts[split + ':samples'] += 1
                        counts[origin + ':' + split + ':weightedSamples'] += 1
    finally:
        for handle in handles.values():
            handle.close()
    for split in group_splits.values():
        group_counts[split] += 1
    manifest = {
        'format': 'sop.per-key-supervision/1', 'annotationContract': 'complete authored V2 old corpus plus current UI intent/omission gold; source-specific vocabulary coverage',
        'maxLength': 384, 'registry': registry, 'targetFamilies': families,
        'inventorySha256': shared.sha(out / 'inventory.json'), 'scriptSha256': shared.sha(Path(__file__)), 'sharedPreparerSha256': shared.sha(ROOT / 'prepare-key-reader.py'),
        'sources': {'old': {'path': str(old_source), 'sha256': shared.sha(old_source), 'inventory': str(old_inventory_path)}, 'ui': {'path': str(new_source), 'sha256': shared.sha(new_source), 'inventory': str(inventory_path)}},
        'uiTrainWeight': ui_weight, 'phase': 'all', 'excludedSources': 0, 'counts': dict(counts), 'diagnostics': {key: dict(value) for key, value in diagnostics.items()},
        'uiGroups': dict(group_counts), 'splitPolicy': 'Old source_path:source_id hash preserved; UI connected recipe-family components, including compound constituents. Ten percent deterministic calibration. Full/calibration unweighted. Only UI train samples repeat.',
        'coveragePolicy': 'Old sources supervise their original declared vocabulary; new native keys remain unknown there. No raw request or original inventory key is removed.',
        'outputs': {name: shared.sha(out / (name + '.jsonl')) for name in handles}, 'trainingRun': False,
        'boundary': 'Prepared gold cuts only. No model inference, training, model export or accuracy claim. Cohort/origin/expectedTools are metadata, outside model text/context.'
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--oldsource', type=Path, default=ROOT / 'data/demo-tool-profile/active.jsonl.gz')
    parser.add_argument('--newsource', type=Path, default=ROOT / 'data/ui-natural-v1/authored.jsonl')
    parser.add_argument('--inventory', type=Path, default=ROOT / 'data/ui-natural-v1/inventory.json')
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--ui-weight', type=int, default=5)
    args = parser.parse_args()
    manifest = prepare(args.oldsource, args.newsource, args.inventory, args.out, args.ui_weight)
    print(json.dumps({key: value for key, value in manifest.items() if key not in ['registry', 'targetFamilies']}, indent=2))


if __name__ == '__main__':
    main()
