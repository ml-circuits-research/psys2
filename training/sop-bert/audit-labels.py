"""Prepare exact original gold-label replay, preserving every original request."""
import argparse
import ast
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import types
from prepare import ROOT, verify


def main(work):
    manifest = json.loads((ROOT / 'provenance.json').read_text())
    verify(ROOT / 'upstream', manifest['files'])
    work.mkdir(parents=True, exist_ok=True)
    rows_dir = work / 'rows'
    source = ROOT / 'upstream/training/neural'
    with (work / 'original-label-build.log').open('w') as log:
        subprocess.run([sys.executable, str(source / 'make_roles.py'), '--out', str(rows_dir)], stdout=log, stderr=subprocess.STDOUT, check=True)
    sys.path.insert(0, str(source))
    import make_data as md
    import make_roles as mr
    layout = json.loads((rows_dir / 'reader.json').read_text())
    # Execute the original loss target method itself without importing torch or changing its sentinel handling.
    tree = ast.parse((source / 'finetune_roles.py').read_text())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Layout')
    method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'class_targets')
    namespace = {}
    exec(compile(ast.Module(body=[method], type_ignores=[]), str(source / 'finetune_roles.py'), 'exec'), namespace)
    targets = lambda row: namespace['class_targets'](types.SimpleNamespace(classes=layout['classes']), row)
    pool, held, sample, missing = md.split_messages(str(source / 'sample1000_ids.txt'), 0)
    if missing: raise ValueError('Missing original samples')
    groups = [('train', [m for m in pool if m['id'] not in held]), ('heldout', [m for m in pool if m['id'] in held]), ('eval_sample1000', sample)]
    messages = []
    counts = collections.Counter()
    collapsed = collections.Counter()
    for split, original in groups:
        by_id = collections.defaultdict(list)
        for line in (rows_dir / (split + '.jsonl')).read_text().splitlines():
            row = json.loads(line); by_id[row['id']].append(row)
        for m in original:
            rows = by_id[m['id']]; at = 0; mapped = []
            for index, wire in enumerate(m['wires']):
                span, act = wire.get('span'), md.act_of(wire.get('type'), wire.get('args', {}))
                issue = 'missing_span' if not span or span not in m['text'] else 'unrepresented_act' if act not in layout['acts'] else None
                if issue:
                    mapped.append({'wire': index, 'issue': issue}); counts[issue] += 1; continue
                if at >= len(rows) or rows[at]['text'] != span or rows[at]['gold'] != wire.get('args', {}):
                    raise ValueError(f'Original row order/annotation mismatch: {m["id"]}/{index}')
                row = rows[at]; at += 1
                encoded = targets(row)
                for (key, _), target in zip(layout['classes'], encoded):
                    if key in row['classes'] and target == 0: collapsed[key] += 1
                mapped.append({**row, 'wire': index, 'targets': encoded})
            if at != len(rows): raise ValueError(f'Unaccounted original rows: {m["id"]}')
            words, cut = mr.cut_tags(m['text'], [w['span'] for w in m['wires'] if w.get('span')])
            messages.append({**m, 'split': split, 'rows': mapped, 'words': [w[0] for w in words], 'cut': cut})
            counts[split + '_messages'] += 1; counts[split + '_requests'] += len(m['wires'])
    output = work / 'audit-input.jsonl'
    output.write_text(''.join(json.dumps(m, ensure_ascii=False) + '\n' for m in messages))
    report = {'sourceCommit': manifest['commit'], 'counts': dict(counts), 'inputSHA256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'readerSHA256': hashlib.sha256((rows_dir / 'reader.json').read_bytes()).hexdigest(),
              'duplicateClassValues': {key: [v for v, n in collections.Counter(values).items() if n > 1] for key, values in layout['classes'] if len(values) != len(set(values))},
              'explicitValuesEncodedAsAbsent': dict(collapsed),
              'classTargetSource': ast.get_source_segment((source / 'finetune_roles.py').read_text(), method)}
    (work / 'audit-input.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--work', type=Path, required=True)
    main(parser.parse_args().work)
