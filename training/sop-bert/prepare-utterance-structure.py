"""Prepare request-presence/count supervision directly from annotated utterances.

No scalar-key conversion, graph nodes/edges, trainer or final-evaluation access.
"""
import argparse
import collections
import hashlib
import json
import os
from pathlib import Path
import tempfile


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def split_for(source, source_id):
    identity = source + ':' + source_id
    return 'calibration' if int(hashlib.sha256(identity.encode()).hexdigest()[:8], 16) % 10 == 0 else 'train'


def prepare(root, out, exclusion, expected_exclusion_sha256=None):
    root, out, exclusion = Path(root), Path(out), Path(exclusion)
    exclusion_hash = digest(exclusion)
    if expected_exclusion_sha256 is not None and exclusion_hash != expected_exclusion_sha256:
        raise ValueError('exclusion-hash-mismatch')
    excluded_rows = json.loads(exclusion.read_text())
    if not isinstance(excluded_rows, list) or any(not isinstance(x, str) or not x for x in excluded_rows) or len(set(excluded_rows)) != len(excluded_rows):
        raise ValueError('invalid-exclusion-manifest')
    if out.exists():
        raise ValueError('output-already-exists')
    excluded = set(excluded_rows)
    paths = [path for version in ['haiku-v1', 'haiku-v2'] for path in sorted((root / 'data' / version).glob('*/*.jsonl'))]
    if not paths:
        raise ValueError('no-annotation-sources')
    sources = [{'path': str(path.relative_to(root)), 'sha256': digest(path)} for path in paths]
    stats, malformed, unsupported, found = collections.Counter(), collections.Counter(), collections.Counter(), set()
    populations = {split: collections.Counter() for split in ['train', 'calibration']}
    # This is an observed TRAIN support report, not a closed deployment count enum.
    train_counts, train_presence = collections.Counter(), collections.Counter()
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='utterance-prepare-', dir=out.parent) as temp:
        staged = Path(temp) / 'output'
        staged.mkdir()
        handles = {key: (staged / (key + '.jsonl')).open('w') for key in ['train', 'calibration', 'diagnostics']}
        try:
            for path, source in zip(paths, sources):
                seen = set()
                with path.open() as stream:
                    for line_number, raw in enumerate(stream, 1):
                        if not raw.strip():
                            continue
                        stats['inputRows'] += 1
                        row = None
                        def reject(reason):
                            malformed[reason] += 1
                            item = {'status': 'malformed', 'reason': reason, 'source': source['path'], 'line': line_number}
                            if isinstance(row, dict) and isinstance(row.get('id'), str):
                                item['source_id'] = row['id']
                            handles['diagnostics'].write(json.dumps(item, sort_keys=True) + '\n')
                        try:
                            row = json.loads(raw)
                        except (ValueError, TypeError):
                            reject('invalid-json')
                            continue
                        if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id']:
                            reject('invalid-source-id')
                            continue
                        # Reserved rows never contribute labels, inventories or malformed
                        # request-detail diagnostics. Only source/id exclusion counts remain.
                        if row['id'] in excluded:
                            found.add(row['id'])
                            stats['excludedRows'] += 1
                            continue
                        if row['id'] in seen:
                            reject('duplicate-source-id')
                            continue
                        seen.add(row['id'])
                        if not isinstance(row.get('text'), str) or not row['text'].strip():
                            reject('invalid-text')
                            continue
                        if not isinstance(row.get('world'), str) or row['world'] != path.parent.name:
                            reject('invalid-source-world')
                            continue
                        if not isinstance(row.get('context', {}), dict):
                            reject('invalid-context')
                            continue
                        requests = row.get('requests')
                        if not isinstance(requests, list):
                            reject('requests-not-list')
                            continue
                        if any(not isinstance(request, dict) for request in requests):
                            reject('request-not-object')
                            continue
                        count = len(requests)
                        split = split_for(source['path'], row['id'])
                        record = {'id': source['path'] + ':' + row['id'], 'source': source['path'], 'source_id': row['id'],
                                  'source_line': line_number, 'source_sha256': source['sha256'],
                                  'annotation_sha256': hashlib.sha256(raw.encode()).hexdigest(),
                                  'world': row['world'], 'split': split, 'text': row['text'], 'context': row.get('context', {}),
                                  'labels': {'has_request': count > 0, 'request_count': count}}
                        handles[split].write(json.dumps(record, ensure_ascii=False, sort_keys=True) + '\n')
                        stats['emittedRows'] += 1
                        populations[split]['rows'] += 1
                        populations[split]['requestPresent' if count else 'noRequest'] += 1
                        if split == 'train':
                            train_counts[count] += 1
                            train_presence[str(count > 0).lower()] += 1
                        unsupported['graph-node-edge-supervision-not-produced'] += 1
        finally:
            for handle in handles.values():
                handle.close()
        # Refuse a corpus edited during preparation; line provenance must match hashes.
        if any(digest(path) != source['sha256'] for path, source in zip(paths, sources)):
            raise ValueError('annotation-source-changed')
        if digest(exclusion) != exclusion_hash:
            raise ValueError('exclusion-source-changed')
        manifest = {'format': 'sop.utterance-structure-supervision', 'version': 1, 'executable': False,
                    'ready': not bool(malformed), 'labelSemantics': {'has_request': 'len(annotation.requests) > 0', 'request_count': 'len(annotation.requests)'},
                    'scope': 'utterance request presence/count only; not graph reconstruction or execution',
                    'split': "sha256(source relative to training/sop-bert + ':' + source_id), first 8 hex digits modulo 10 == 0 -> calibration; otherwise train",
                    'sources': sources, 'preparerSha256': digest(Path(__file__)), 'counts': dict(stats),
                    'populations': {split: dict(counts) for split, counts in populations.items()},
                    'trainLabelSupport': {'request_count': {str(k): v for k, v in sorted(train_counts.items())}, 'has_request': dict(train_presence)},
                    'labelInventoryScope': 'train rows only, after reserved-ID exclusion; counts are open nonnegative integers',
                    'malformed': dict(malformed), 'unsupported': dict(unsupported),
                    'exclusion': {'manifestSha256': exclusion_hash, 'requestedIds': len(excluded), 'foundIds': len(found), 'missingIds': sorted(excluded - found), 'beforeLabelsAndInventories': True},
                    'outputs': {key: digest(staged / (key + '.jsonl')) for key in handles}}
        (staged / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
        os.rename(staged, out)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True, help='training/sop-bert annotation root')
    parser.add_argument('--out', type=Path, required=True, help='new output directory')
    parser.add_argument('--exclude-ids', type=Path, required=True, help='exact published reserved-ID JSON list')
    parser.add_argument('--expected-exclusion-sha256', required=True, help='hash of the agreed published reserved-ID manifest')
    args = parser.parse_args()
    manifest = prepare(args.root, args.out, args.exclude_ids, args.expected_exclusion_sha256)
    print(json.dumps(manifest, indent=2, sort_keys=True))
    if not manifest['ready']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
