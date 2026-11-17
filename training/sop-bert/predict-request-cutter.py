#!/usr/bin/env python3
"""Read-only inference from a fully frozen BIO cutter. Input is id/text only."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for chunk in iter(lambda: handle.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def load_trainer(path):
    spec = importlib.util.spec_from_file_location('frozen_cutter', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize_cutter(text, logits, offsets, sequence_ids, attention_mask, model, decode_bio, truncated=False):
    """Actual learned logits and exact tokenizer offsets; no annotation arguments."""
    labels = []
    invalid = False
    if not isinstance(logits, list) or len(logits) != len(offsets):
        invalid = True
    else:
        for values in logits:
            if not isinstance(values, list) or len(values) != 3 or any(
                isinstance(x, bool) or not isinstance(x, (float, int)) or not math.isfinite(x) for x in values
            ):
                invalid = True
                break
            best = max(values)
            chosen = [i for i, value in enumerate(values) if value == best]
            labels.append(chosen[0] if len(chosen) == 1 else -1)
    spans, unresolved = ([], ['invalid-logit-shape']) if invalid else decode_bio(
        labels, offsets, sequence_ids, attention_mask, len(text), truncated
    )
    return {'source': {'text': text, 'unit': 'unicode-scalar'}, 'spans': spans,
            'coverage': {'complete': not unresolved, 'truncated': bool(truncated)},
            'unresolved': unresolved, 'model': model}


def run(args):
    import torch
    from transformers import AutoTokenizer
    root = args.model
    files = {'checkpoint': root / 'best.pt', 'config': root / 'model-config.json',
             'verification': root / 'final-verification.json', 'trainer': args.trainer,
             'input': args.input, 'predictor': Path(__file__)}
    expected = {'checkpoint': args.checkpoint_sha256, 'config': args.config_sha256,
                'verification': args.verification_sha256, 'trainer': args.trainer_sha256}
    for key, value in expected.items():
        if digest(files[key]) != value:
            raise ValueError('frozen-hash-mismatch:' + key)
    config = json.loads(files['config'].read_text())
    verification = json.loads(files['verification'].read_text())
    if verification.get('complete') is not True or verification.get('role') != 'trained-cutter-only':
        raise ValueError('complete-frozen-training-required')
    if any(verification.get(key + 'Sha256') != value for key, value in expected.items() if key != 'verification'):
        raise ValueError('verification-chain-mismatch')
    if config.get('format') != 'sop.request-cutter-model/1' or config.get('artifactRole') != 'trained':
        raise ValueError('unsupported-cutter-model')
    if Path(config['encoder']).resolve() != args.encoder.resolve():
        raise ValueError('encoder-source-mismatch')
    for name, value in config['encoderFiles'].items():
        if Path(name).name != name or digest(args.encoder / name) != value:
            raise ValueError('encoder-file-mismatch')
        files['encoder:' + name] = args.encoder / name
    before = {key: digest(path) for key, path in files.items()}
    if any(before[key] != value for key, value in expected.items()):
        raise ValueError('frozen-input-changed-before-load')
    trainer = load_trainer(args.trainer)
    codec_hash = hashlib.sha256(trainer.canonical(trainer.CODEC).encode()).hexdigest()
    if config.get('codec') != trainer.CODEC or config.get('codecSha256') != codec_hash or trainer.CODEC['format'] != 'sop.request-cutter-codec/1':
        raise ValueError('cutter-codec-mismatch')
    model_identity = {'sha256': args.checkpoint_sha256,
                      'tokenizerSha256': config['encoderFiles']['tokenizer.json'],
                      'codecSha256': codec_hash, 'decoderVersion': 1}
    records = []
    for line in args.input.read_text().splitlines():
        row = json.loads(line)
        if not isinstance(row, dict) or set(row) != {'id', 'text'} or not isinstance(row['id'], str) or not row['id'] or not isinstance(row['text'], str) or len(row['text']) > 16384:
            raise ValueError('source-only-input-required')
        records.append(row)
    if len({row['id'] for row in records}) != len(records):
        raise ValueError('duplicate-input-identity')
    tokenizer = AutoTokenizer.from_pretrained(args.encoder, local_files_only=True)
    if not tokenizer.is_fast:
        raise ValueError('exact-fast-tokenizer-required')
    checkpoint = torch.load(files['checkpoint'], map_location='cpu', weights_only=True)
    if checkpoint['config'] != config:
        raise ValueError('checkpoint-config-mismatch')
    model = trainer.build_model(args.encoder)
    model.load_state_dict(checkpoint['model'], strict=True)
    del checkpoint
    model.to(args.device).eval()
    with args.out.open('x') as handle, torch.inference_mode():
        for start in range(0, len(records), args.batch):
            batch = records[start:start + args.batch]
            texts = [row['text'] for row in batch]
            full = tokenizer(texts, truncation=False, padding=False)
            encoded = tokenizer(texts, truncation=True, padding=True, max_length=config['maxLength'], return_offsets_mapping=True, return_tensors='pt')
            ids = encoded['input_ids'].to(args.device)
            mask = encoded['attention_mask'].to(args.device)
            with torch.autocast('cuda', dtype=torch.bfloat16, enabled=args.device.startswith('cuda')):
                logits = model(ids, mask).float().cpu().tolist()
            for index, row in enumerate(batch):
                attention = encoded['attention_mask'][index].tolist()
                prediction = normalize_cutter(row['text'], logits[index], encoded['offset_mapping'][index].tolist(), encoded.sequence_ids(index), attention, model_identity, trainer.decode_bio, len(full['input_ids'][index]) > sum(attention))
                handle.write(json.dumps({'id': row['id'], 'prediction': prediction}, ensure_ascii=False) + '\n')
    if before != {key: digest(path) for key, path in files.items()}:
        raise ValueError('immutable-inference-input-changed')
    manifest = {'format': 'sop.request-cutter-prediction-run/1', 'complete': True,
                'frozenInputs': before, 'outputSha256': digest(args.out), 'rows': len(records),
                'model': model_identity, 'device': args.device,
                'precision': 'cuda-bfloat16' if args.device.startswith('cuda') else 'float32',
                'graphConfidence': None, 'executionEligible': False}
    args.out.with_suffix(args.out.suffix + '.manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    for name in ['model', 'trainer', 'encoder', 'input', 'out']:
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ['checkpoint', 'config', 'verification', 'trainer']:
        parser.add_argument('--' + name + '-sha256', required=True)
    parser.add_argument('--device', default='cpu')
    parser.add_argument('--batch', type=int, default=16)
    args = parser.parse_args()
    if args.batch < 1 or args.batch > 256:
        parser.error('batch must be 1..256')
    run(args)


if __name__ == '__main__':
    main()
