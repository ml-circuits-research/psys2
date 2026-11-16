"""Verify the unchanged source snapshot and recreate its historical held-out messages.
No model training, annotation rewriting or threshold selection takes place here.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def verify(root, entries):
    for entry in entries:
        path = root / entry['path']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f"Source/artifact hash mismatch: {entry['path']}")

def prepare(output):
    manifest = json.loads((ROOT / 'provenance.json').read_text())
    verify(ROOT / 'upstream', manifest['files'])
    path = ROOT / 'upstream/training/neural/make_data.py'
    spec = importlib.util.spec_from_file_location('original_make_data', path)
    original = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    messages, held_ids, sample, missing = original.split_messages(str(path.parent / 'sample1000_ids.txt'), 0)
    if missing:
        raise ValueError(f'Missing sample identities: {sorted(missing)}')
    train = [m for m in messages if m['id'] not in held_ids]
    held = [m for m in messages if m['id'] in held_ids]
    if set(m['id'] for m in train) & held_ids or set(m['id'] for m in sample) & {m['id'] for m in messages}:
        raise ValueError('Historical split overlap')
    counts = {name: {'messages': len(rows), 'requests': sum(len(m['wires']) for m in rows)}
              for name, rows in [('train', train), ('heldout', held), ('sample', sample)]}
    if counts['heldout'] != {'messages': 585, 'requests': 1711}:
        raise ValueError(f'Historical held-out population changed: {counts}')
    output.mkdir(parents=True, exist_ok=True)
    held_path = output / 'heldout.jsonl'
    held_path.write_text(''.join(json.dumps(m, ensure_ascii=False) + '\n' for m in held))
    report = {'sourceCommit': manifest['commit'], 'seed': 0, 'counts': counts,
              'heldoutSHA256': hashlib.sha256(held_path.read_bytes()).hexdigest(),
              'purpose': 'historical reproduction only; not a new unseen acceptance set'}
    (output / 'split.json').write_text(json.dumps(report, indent=2) + '\n')
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.out), indent=2))
