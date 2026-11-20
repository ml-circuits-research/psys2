"""Prepare per-key reader supervision from official-dataset/ only; never trains or changes a model.

Reads official-dataset/{train.jsonl.gz,dev.jsonl,test.jsonl,inventory.json} and writes, into a new directory,
the files train-key-reader.py and evaluate-demo-reader.py consume:
  train.jsonl        weighted training request cuts (ui-natural/ui-human repeated --ui-weight times)
  calibration.jsonl  the dev split (model selection)
  test.jsonl         the held-out test split (reporting only)
  authored.jsonl     the official rows in the authored shape the evaluator rejoins for full utterances
  manifest.json      registry, target families, hashes and counts
"""
import argparse
import collections
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OFFICIAL = ROOT.parents[1] / 'official-dataset'
UI_SOURCES = {'ui-natural-v1', 'ui-human-v1', 'ui-features-v1', 'ui-quantities-v1', 'human-adapted-v1-drawing', 'human-adapted-v1-diagram'}  # executed UI recipes and their paraphrases, and the small avatar feature and quantity corpora; generated relations are already numerous
SOURCE_WEIGHTS = {'ui-diagram-v2': 2}  # the Diagram voice corpus is large already: repeated twice, not ui_weight times


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rows(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf8') as stream:
        return [json.loads(line) for line in stream if line.strip()]


def prepare(out, ui_weight=3, max_length=256):
    shared = load('shared_key_preparer', ROOT / 'prepare-key-reader.py')
    inventory_path = OFFICIAL / 'inventory.json'
    inventory = json.loads(inventory_path.read_text())
    registry = shared.registry(inventory)
    old_coverage = set(shared.registry(json.loads((ROOT / 'data/demo-tool-profile/inventory.json').read_text())))
    splits = {'train': OFFICIAL / 'train.jsonl.gz', 'calibration': OFFICIAL / 'dev.jsonl', 'test': OFFICIAL / 'test.jsonl'}
    out.mkdir(parents=True, exist_ok=False)
    counts, diagnostics = collections.Counter(), collections.Counter()
    authored = (out / 'authored.jsonl').open('w')
    handles = {name: (out / (name + '.jsonl')).open('w') for name in splits}
    try:
        for split, path in splits.items():
            for raw in rows(path):
                authored.write(json.dumps({'source_path': 'official-dataset', 'source_id': raw['id'], 'text': raw['text'], 'requests': raw['requests'],
                                           'cohort': {'family': raw['family'], 'operation': raw['operation']}, 'world': raw['world']}, ensure_ascii=False) + '\n')
                source = {'id': raw['id'], 'source_id': raw['id'], 'source_path': 'official-dataset', 'source': {'text': raw['text'], 'unit': 'unicode-scalar'},
                          'world': raw['world'], 'context': raw['context'], 'annotationVersion': 'v2'}
                for index, request in enumerate(raw['requests'] or [None]):
                    record = shared.sample(source, request, registry, {})
                    if raw['source'] == 'demo-tool-profile':
                        # The old authors never labelled the newer native heads: unknown there, not absent.
                        record['coveredKeys'] = [k for k in record['coveredKeys'] if k in old_coverage]
                    record.update({'id': raw['id'] + ':' + str(index), 'source_id': raw['id'], 'source_path': 'official-dataset', 'split': split,
                                   'requestIndex': index, 'origin': raw['source'], 'splitGroup': raw['family'], 'operation': raw['operation']})
                    diagnostics.update(d['reason'] for d in record['diagnostics'])
                    repeats = (ui_weight if raw['source'] in UI_SOURCES else SOURCE_WEIGHTS.get(raw['source'], 1)) if split == 'train' else 1
                    for r in range(repeats):
                        handles[split].write(json.dumps({**record, 'id': record['id'] + (f':w{r}' if repeats > 1 else '')}, ensure_ascii=False) + '\n')
                        counts[split + ':samples'] += 1
                    counts[split + ':uniqueSamples'] += 1
                counts[split + ':messages'] += 1
    finally:
        authored.close()
        for handle in handles.values():
            handle.close()
    manifest = {
        'format': 'sop.per-key-supervision/1', 'annotationContract': 'official-dataset V2 requests; demo-tool-profile rows supervise only their original vocabulary',
        'maxLength': max_length, 'registry': registry, 'targetFamilies': shared.target_families(inventory),
        'inventorySha256': sha(inventory_path), 'officialManifestSha256': sha(OFFICIAL / 'MANIFEST.json'), 'scriptSha256': sha(Path(__file__)),
        'sharedPreparerSha256': sha(ROOT / 'prepare-key-reader.py'), 'uiTrainWeight': ui_weight,
        'sources': {'official': {'path': str(out / 'authored.jsonl'), 'sha256': sha(out / 'authored.jsonl')}},
        'counts': dict(counts), 'diagnostics': dict(diagnostics), 'outputs': {name: sha(out / (name + '.jsonl')) for name in splits},
        'boundary': 'Gold request cuts from official-dataset only. The test split is for reporting, never for selection.'}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def group_key(family, calibration):
    """The cutter loader derives calibration membership as sha256(split_group)[:8] % 10 == 0. Keep the family as the
    group and add the smallest suffix that makes that derivation equal the official split."""
    for n in range(10000):
        key = family if n == 0 else f'{family}#{n}'
        if (int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % 10 == 0) == calibration:
            return key
    raise ValueError('no-group-key')


def prepare_cutter(out):
    """Full utterances with gold request spans for train-request-cutter.py; the test split is reserved (exclusions)."""
    out.mkdir(parents=True, exist_ok=False)
    (out / 'raw').mkdir()
    raw_rows, records, exclusions = [], {'train': [], 'calibration': []}, []
    for split, path in [('train', OFFICIAL / 'train.jsonl.gz'), ('calibration', OFFICIAL / 'dev.jsonl'), ('test', OFFICIAL / 'test.jsonl')]:
        for r in rows(path):
            group = group_key(r['family'], split == 'calibration')
            raw_rows.append({'id': r['id'], 'world': r['world'], 'text': r['text'], 'requests': r['requests'], 'origin': r['source'], 'split_group': group})
            if split == 'test':
                exclusions.append(r['id']); continue
            records[split].append({'id': 'official.jsonl:' + r['id'], 'source_path': 'official.jsonl', 'source_id': r['id'], 'source': {'text': r['text'], 'unit': 'unicode-scalar'},
                                   'annotations': r['requests'], 'split': split, 'split_group': group})
    raw_path = out / 'raw' / 'official.jsonl'
    raw_path.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in raw_rows))
    raw_sha = sha(raw_path)
    for split, items in records.items():
        for item in items:
            item['source_sha256'] = raw_sha
        (out / (split + '.jsonl')).write_text(''.join(json.dumps(i, ensure_ascii=False) + '\n' for i in items))
    (out / 'exclusions.json').write_text(json.dumps(sorted(exclusions)) + '\n')
    manifest = {'format': 'psys2.ui-union-cutter-data/1', 'sources': [{'path': 'official.jsonl', 'sha256': sha(raw_path)}],
                'outputs': {s: sha(out / (s + '.jsonl')) for s in records}, 'exclusion': {'sha256': sha(out / 'exclusions.json')},
                'sourceGrouping': {'format': 'psys2.source-cohort-split/1', 'field': 'split_group', 'hash': 'sha256-first8-mod10'},
                'counts': {s: len(v) for s, v in records.items()} | {'reservedTest': len(exclusions)}, 'officialManifestSha256': sha(OFFICIAL / 'MANIFEST.json'),
                'scriptSha256': sha(Path(__file__)), 'trainingRun': False}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', type=Path)
    p.add_argument('--cutter-out', type=Path)
    p.add_argument('--ui-weight', type=int, default=3)
    p.add_argument('--max-length', type=int, default=256)
    a = p.parse_args()
    if a.out:
        m = prepare(a.out, a.ui_weight, a.max_length)
        print(json.dumps({k: v for k, v in m.items() if k not in ('registry', 'targetFamilies')}, indent=2))
    if a.cutter_out:
        print(json.dumps(prepare_cutter(a.cutter_out)['counts']))
