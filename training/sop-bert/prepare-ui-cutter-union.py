"""Prepare all old/new full utterances for source-only cutter training, without exclusions."""
import argparse
import collections
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def union_module():
    spec = importlib.util.spec_from_file_location('union_preparation', ROOT / 'prepare-ui-natural-union.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def prepare(old_source, new_source, out):
    helper = union_module()
    old, new = helper.read_rows(old_source), helper.read_rows(new_source)
    ui_groups = helper.new_group_splits(new)
    out.mkdir(parents=True, exist_ok=False)
    raw_root = out / 'raw'
    raw_root.mkdir()
    raw_files = collections.defaultdict(list)
    for origin, rows in [('old', old), ('ui', new)]:
        for row in rows:
            group = row['source_path'] + ':' + row['source_id'] if origin == 'old' else row['source_path'] + ':cohort:' + ui_groups[row['source_id']]
            relative = origin + '/' + row['source_path'] + '.jsonl'
            # Inputs are always text only. Cohorts and requests are C1 provenance/labels.
            raw_files[relative].append({'id': row['source_id'], 'world': row['world'], 'text': row['text'], 'requests': row['requests'], 'origin': origin, 'split_group': group})
    shared = helper.load_preparer()
    sources, counts = [], collections.Counter()
    exclusion = out / 'exclusions.json'
    exclusion.write_text('[]\n')
    handles = {split: (out / (split + '.jsonl')).open('w') for split in ['train', 'calibration']}
    benchmark_input = (out / 'benchmark-source.jsonl').open('w')
    benchmark_gold = (out / 'benchmark-gold.jsonl').open('w')
    try:
        for relative, rows in raw_files.items():
            path = raw_root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))
            sha = shared.sha(path)
            sources.append({'path': relative, 'sha256': sha})
            for raw in rows:
                identity = relative + ':' + raw['id']
                split = helper.split_for(raw['split_group'])
                record = {'id': identity, 'source_path': relative, 'source_id': raw['id'], 'source_sha256': sha, 'source': {'text': raw['text'], 'unit': 'unicode-scalar'}, 'annotations': raw['requests'], 'split': split, 'split_group': raw['split_group']}
                handles[split].write(json.dumps(record, ensure_ascii=False) + '\n')
                counts[split] += 1
                counts[raw['origin'] + ':' + split] += 1
                if raw['origin'] == 'ui' or split == 'calibration':
                    benchmark_input.write(json.dumps({'id': identity, 'text': raw['text']}, ensure_ascii=False) + '\n')
                    benchmark_gold.write(json.dumps({'id': identity, 'text': raw['text'], 'requests': raw['requests'], 'origin': raw['origin'], 'split': split}, ensure_ascii=False) + '\n')
                    counts['benchmark:' + raw['origin']] += 1
    finally:
        for handle in [*handles.values(), benchmark_input, benchmark_gold]:
            handle.close()
    manifest = {'format': 'psys2.ui-union-cutter-data/1', 'sources': sources, 'outputs': {split: shared.sha(out / (split + '.jsonl')) for split in handles}, 'exclusion': {'sha256': shared.sha(exclusion)}, 'sourceGrouping': {'format': 'psys2.source-cohort-split/1', 'field': 'split_group', 'hash': 'sha256-first8-mod10'}, 'counts': dict(counts), 'authoringSources': {'old': {'path': str(old_source), 'sha256': shared.sha(old_source)}, 'ui': {'path': str(new_source), 'sha256': shared.sha(new_source)}}, 'benchmark': {'input': 'benchmark-source.jsonl', 'gold': 'benchmark-gold.jsonl', 'inputSha256': shared.sha(out / 'benchmark-source.jsonl'), 'goldSha256': shared.sha(out / 'benchmark-gold.jsonl'), 'scope': 'All UI messages and unchanged old calibration messages; fixed before cutter training.'}, 'scriptSha256': shared.sha(Path(__file__)), 'trainingRun': False, 'scope': 'All phases and all sources retained. No semantic annotations or context enter model input; labels use exact request spans only. No exclusions or sentence/domain runtime rules.'}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--oldsource', type=Path, default=ROOT / 'data/demo-tool-profile/active.jsonl.gz')
    parser.add_argument('--newsource', type=Path, default=ROOT / 'data/ui-natural-v1/authored.jsonl')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.oldsource, args.newsource, args.out)['counts'], indent=2))
