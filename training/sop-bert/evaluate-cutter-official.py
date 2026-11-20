"""Request-cutter segmentation on an official-dataset split: exact request spans per message, by tab and request count."""
import argparse
import collections
import gzip
import importlib.util
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    import torch
    from transformers import AutoTokenizer
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cutter-model', type=Path, required=True)
    p.add_argument('--split', type=Path, required=True)
    p.add_argument('--device', default='cuda')
    p.add_argument('--out', type=Path)
    a = p.parse_args()
    spec = importlib.util.spec_from_file_location('cutter', ROOT / 'train-request-cutter.py')
    cutter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cutter)
    saved = torch.load(io.BytesIO((a.cutter_model / 'best.pt').read_bytes()), map_location='cpu', weights_only=False)
    config = saved['config']
    model = cutter.build_model(config['encoder'])
    model.load_state_dict(saved['model'], strict=True)
    model.to(a.device).eval()
    tokenizer = AutoTokenizer.from_pretrained(config['encoder'], local_files_only=True)
    opener = gzip.open if a.split.suffix == '.gz' else open
    with opener(a.split, 'rt') as stream:
        rows = [json.loads(line) for line in stream]
    counts = collections.defaultdict(collections.Counter)
    with torch.inference_mode():
        for start in range(0, len(rows), 32):
            batch = rows[start:start + 32]
            enc = tokenizer([r['text'] for r in batch], padding=True, truncation=True, max_length=config['maxLength'], return_offsets_mapping=True, return_tensors='pt')
            tags = model(enc['input_ids'].to(a.device), enc['attention_mask'].to(a.device)).argmax(-1).cpu().tolist()
            for i, r in enumerate(batch):
                spans, issues = cutter.decode_bio(tags[i], enc['offset_mapping'][i].tolist(), enc.sequence_ids(i), enc['attention_mask'][i].tolist(), len(r['text']), False)
                gold, gold_issues = cutter.gold_spans(r['text'], r['requests'])
                if gold_issues:
                    continue
                exact = not issues and [tuple(s) for s in spans] == [tuple(s) for s in gold]
                for key in ('all', 'world:' + r['world'], 'requests:' + str(min(len(r['requests']), 3)), 'source:' + r['source']):
                    counts[key]['rows'] += 1
                    counts[key]['exact'] += exact
                    counts[key]['countRight'] += len(spans) == len(gold)
    report = {k: {**v, 'exactRate': round(v['exact'] / v['rows'], 4), 'countRate': round(v['countRight'] / v['rows'], 4)} for k, v in sorted(counts.items())}
    text = json.dumps({'cutter': str(a.cutter_model), 'split': str(a.split), 'report': report}, indent=1)
    if a.out:
        a.out.write_text(text + '\n')
    print(text)


if __name__ == '__main__':
    main()
