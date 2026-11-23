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
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OFFICIAL = ROOT.parents[1] / 'official-dataset'
UI_SOURCES = {'ui-natural-v1', 'ui-human-v1', 'ui-features-v1', 'ui-quantities-v1', 'human-adapted-v1-drawing', 'human-adapted-v1-diagram', 'ui-drawing-style-v1'}  # executed UI recipes and their paraphrases, and the small avatar feature and quantity corpora; generated relations are already numerous
SOURCE_WEIGHTS = {'ui-diagram-v2': 2, 'data-drop-v1': 2, 'main-synthetic': 0.5, 'ui-systematic-v1': 0.2}  # ui-systematic-v1: canonical anchors, not paraphrases  # sampling weights (owner phase rule 2026-11-20: weights at training time, no row discarded from the dataset)
# Data-drop batches below the quality-profile threshold (management/data-drop/QUALITY-PROFILE.md: manual faithfulness < 0.8 or
# label spans outside the text > 15 per 1k rows) train at weight 1 instead of 2 (coordinator 2026-11-21: down-weight, not exclude).
LOW_QUALITY_BATCHES = {'pilot', 'dg-batch-04', 'dg-batch-05', 'dg-batch-06', 'dg-batch-07', 'dg-batch-15', 'dg-batch-17',
                       'dw-batch-04', 'dw-batch-05', 'dw-batch-07', 'dw-batch-13', 'dw-batch-14', 'dw-batch-15'}
LOW_QUALITY_WEIGHT = 1
BATCH_OF = re.compile(r'^data-drop-v1:((?:dg|dw|pref)-batch-\d+|pilot)')
TRAINER_DETERMINERS = {'demonstrative': 'definite', 'possessive': 'definite', 'quantified': 'definite'}  # stored as said; the current determiner head has two classes


def trainer_view(raw, inventory):
    """The labels as the current trainer can take them: open values outside a closed bank lose their class (the mention stays),
    determiners map to the two-class head. The dataset itself keeps everything."""
    raw = json.loads(json.dumps(raw))
    for q in raw.get('requests') or []:
        t = q.get('target') or {}
        if t.get('determiner') in TRAINER_DETERMINERS:
            t['determiner'] = TRAINER_DETERMINERS[t['determiner']]
        for c in q.get('constraints') or []:
            typ, _, name = c['key'].partition('.')
            bank = inventory.get(raw['world'], {}).get(typ, {}).get('keys', {}).get(name, {}).get('values')
            if c.get('open_value') or (bank and 'value' in c and c['value'] not in bank):
                c.pop('value', None)
            c.pop('open_value', None)
    return raw


def repeats_of(source, row_id, ui_weight):
    w = ui_weight if source in UI_SOURCES else SOURCE_WEIGHTS.get(source, 1)
    m = BATCH_OF.match(row_id) if source == 'data-drop-v1' else None
    if m and m.group(1) in LOW_QUALITY_BATCHES:
        w = LOW_QUALITY_WEIGHT
    whole, frac = int(w), w - int(w)
    return whole + (1 if frac and int(hashlib.sha256(('w:' + row_id).encode()).hexdigest(), 16) % 1000 < frac * 1000 else 0)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def official_files():
    """The generated split files; missing ones mean the dataset was not loaded from webmeet-dataset yet."""
    files = {'train': OFFICIAL / 'train.jsonl.gz', 'calibration': OFFICIAL / 'dev.jsonl', 'test': OFFICIAL / 'test.jsonl'}
    missing = [str(path) for path in files.values() if not path.exists()]
    if missing:
        raise SystemExit(f'missing {", ".join(missing)}: run python3 official-dataset/sop_dataset.py load')
    return files


def official_data_sha():
    return hashlib.sha256(''.join(sha(path) for path in official_files().values()).encode()).hexdigest()


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
    splits = official_files()
    out.mkdir(parents=True, exist_ok=False)
    counts, diagnostics = collections.Counter(), collections.Counter()
    authored = (out / 'authored.jsonl').open('w')
    handles = {name: (out / (name + '.jsonl')).open('w') for name in splits}
    try:
        for split, path in splits.items():
            for raw in rows(path):
                raw = trainer_view(raw, inventory)
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
                    repeats = repeats_of(raw['source'], raw['id'], ui_weight) if split == 'train' else 1
                    if not repeats:
                        continue
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
        'inventorySha256': sha(inventory_path), 'officialDataSha256': official_data_sha(), 'scriptSha256': sha(Path(__file__)),
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
    for split, path in official_files().items():
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
                'counts': {s: len(v) for s, v in records.items()} | {'reservedTest': len(exclusions)}, 'officialDataSha256': official_data_sha(),
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
