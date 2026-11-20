"""Probe a reader checkpoint (and optionally its cutter) on free text: cut, read each cut, print the raw requests.

The same decoding as evaluate-demo-reader.py: predicted request cuts, predicted BIO spans, class heads and the
checkpoint's own predictor. Context per area is the most frequent fixture context of official-dataset (the
objects an editor shows), unless --context gives one. Writes JSON lines; with --wires the raw requests are also
passed through the runtime bridge (src/dialog/raw-structural-bridge.mjs) with the deployed bindings.
"""
import argparse
import collections
import gzip
import importlib.util
import io
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture_contexts():
    votes = collections.defaultdict(collections.Counter)
    with gzip.open(REPO / 'official-dataset' / 'train.jsonl.gz', 'rt') as stream:
        for line in stream:
            r = json.loads(line)
            if r['source'] in ('ui-natural-v1', 'ui-relations-v1'):
                votes[r['world']][json.dumps(r['context'], sort_keys=True)] += 1
    return {w: json.loads(v.most_common(1)[0][0]) for w, v in votes.items()}


def read(args, items):
    import torch
    from transformers import AutoTokenizer
    evaluator = load('evaluator', ROOT / 'evaluate-demo-reader.py')
    codec = load('codec', ROOT / 'prepare-key-reader.py')
    checkpoint = torch.load(io.BytesIO((args.model / 'checkpoint.pt').read_bytes()), map_location='cpu', weights_only=False)
    config = checkpoint['config']
    trainer_path, predictor_path = evaluator.reader_sources(config)
    trainer, predictor = load('trainer', trainer_path), load('predictor', predictor_path)
    model = trainer.build_model(config, config['encoder'])
    model.load_state_dict(checkpoint['model'], strict=True)
    model.to(args.device).eval()
    tokenizer = AutoTokenizer.from_pretrained(config['encoder'], local_files_only=True)
    key_indices = {k: i for i, k in enumerate(config['keys'])}
    cutter = cutter_model = None
    if args.cutter_model:
        cutter = load('cutter', ROOT / 'train-request-cutter.py')
        saved = torch.load(io.BytesIO((args.cutter_model / 'best.pt').read_bytes()), map_location='cpu', weights_only=False)
        cutter_config = saved['config']
        cutter_model = cutter.build_model(cutter_config['encoder'])
        cutter_model.load_state_dict(saved['model'], strict=True)
        cutter_model.to(args.device).eval()
    results = []
    with torch.inference_mode():
        for item in items:
            text, area, context = item['text'], item['area'], item['context']
            spans = [(0, len(text))]
            if cutter_model is not None:
                enc = tokenizer([text], truncation=True, max_length=cutter_config['maxLength'], return_offsets_mapping=True, return_tensors='pt')
                tags = cutter_model(enc['input_ids'].to(args.device), enc['attention_mask'].to(args.device)).argmax(-1).cpu().tolist()[0]
                spans, issues = cutter.decode_bio(tags, enc['offset_mapping'][0].tolist(), enc.sequence_ids(0), enc['attention_mask'][0].tolist(), len(text), False)
            requests = []
            for a, b in spans:
                cut = text[a:b]
                pair = json.dumps({'area': area, 'context': context}, ensure_ascii=False, sort_keys=True)
                enc = tokenizer([cut], [pair], truncation='longest_first', max_length=config['maxLength'], return_offsets_mapping=True, return_tensors='pt')
                hidden, bio, presence = model(enc['input_ids'].to(args.device), enc['attention_mask'].to(args.device))
                globals_ = {k: model.classes[str(key_indices[k])](hidden[:, 0]).float().cpu().tolist()[0] for k in config['banks'] if config['registry'][k]['role'] == 'global'}
                bio_v, pres_v, offsets, attention = bio.float().cpu().tolist()[0], presence.float().cpu().tolist()[0], enc['offset_mapping'][0].tolist(), enc['attention_mask'][0].tolist()
                mention_values, feats, ids = {}, [], []
                for key, logits in zip(config['bioKeys'], bio_v):
                    spec = config['registry'][key]
                    if spec['role'] != 'domain' or spec['area'] != area:
                        continue
                    found, error = predictor.key_spans(logits, offsets, enc.sequence_ids(0), attention, len(cut))
                    if error:
                        continue
                    for s in found:
                        x, y = s['tokens']
                        feats.append(hidden[0, x:y].mean(0) + model.key.weight[key_indices[key]]); ids.append((key, x, y)); mention_values[(key, x, y)] = {}
                if feats:
                    matrix = torch.stack(feats)
                    for k in config['metadataKeys']:
                        for ident, v in zip(ids, model.classes[str(key_indices[k])](matrix).float().cpu().tolist()):
                            mention_values[ident][k] = v
                    for k in config['banks']:
                        if config['registry'][k]['role'] != 'domain':
                            continue
                        sel = [j for j, ident in enumerate(ids) if ident[0] == k]
                        if sel:
                            for j, v in zip(sel, model.classes[str(key_indices[k])](matrix[sel]).float().cpu().tolist()):
                                mention_values[ids[j]][k] = v
                raw, _ = predictor.normalize(config, cut, area, bio_v, pres_v, globals_, mention_values, offsets, enc.sequence_ids(0), attention, {'sha256': 'probe'}, codec.GLOBAL, codec.META, False)
                requests.append({'span': [a, b], 'request': raw['request'], 'unresolved': raw['unresolved']})
            results.append({'text': text, 'area': area, 'cuts': [list(s) for s in spans], 'requests': requests})
    return results


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--model', type=Path, required=True)
    p.add_argument('--cutter-model', type=Path)
    p.add_argument('--input', type=Path, required=True, help='JSON lines {text, area[, context]}')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--device', default='cpu')
    p.add_argument('--wires', action='store_true')
    args = p.parse_args()
    contexts = fixture_contexts()
    items = [json.loads(l) for l in args.input.read_text().splitlines() if l.strip()]
    for item in items:
        item.setdefault('context', contexts.get(item['area'], {'existing': [], 'previous': None}))
    results = read(args, items)
    if args.wires:
        bridged = subprocess.run(['node', str(ROOT / 'probe-bridge.mjs')], input=json.dumps(results), capture_output=True, text=True, cwd=REPO, check=True)
        results = json.loads(bridged.stdout)
    args.out.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in results))


if __name__ == '__main__':
    main()
