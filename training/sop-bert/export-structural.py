"""Frozen raw structural head export. Fixture artifacts are never trained models."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def output_layout(config):
    if config.get('format') != 'psys2.raw-structural-model/1' or config.get('reservedIndices') != {'absent': 0, 'unknown': 1} or config.get('spanStates') != ['absent', 'present', 'unresolved']:
        raise ValueError('unsupported-structural-config')
    R, C = config['maxRequests'], config['maxConstraints']
    if not all(isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 128 for n in [R, C]):
        raise ValueError('invalid-slot-capacity')
    layout = {'count': ['batch', R + 2], 'presence': ['batch', 2], 'conditionCount': ['batch', R, C + 2]}
    expected = [p + ':' + name for p, key in [('r', 'requestFields'), ('c', 'constraintFields')] for name in config[key]]
    if set(expected) != set(config['banks']) or len(expected) != len(set(expected)):
        raise ValueError('bank-field-layout-mismatch')
    for key, bank in config['banks'].items():
        if len(bank) < 2 or bank[:2] != [{'kind': 'absent'}, {'kind': 'unknown'}] or any(set(row) != {'kind', 'value'} or row['kind'] != 'value' for row in bank[2:]):
            raise ValueError('invalid-typed-bank')
        layout[key] = ['batch', R] + ([C] if key.startswith('c:') else []) + [len(bank)]
    for prefix, names in [('r', config['requestSpans']), ('c', config['constraintSpans'])]:
        for name in names:
            base = ['batch', R] + ([C] if prefix == 'c' else [])
            for suffix in ['state', 'start', 'end']:
                key = prefix + ':' + name + ':' + suffix
                if key in layout:
                    raise ValueError('duplicate-output-head')
                layout[key] = base + ([3] if suffix == 'state' else ['sequence'])
    if len(layout) != 59:
        raise ValueError('structural-contract-requires-all-59-heads')
    return layout


def lower_attention_for_export(model):
    """Algebraically lower only supported eval cross-attention, preserving weights.

    Legacy ONNX export freezes nn.MultiheadAttention's sequence reshape. Explicit
    projections use tensor-derived dynamic dimensions instead. Parity is mandatory.
    """
    import math
    import torch
    from torch import nn
    from torch.nn import functional as F

    class Attention(nn.Module):
        def __init__(self, original):
            super().__init__()
            if original.training or original.dropout != 0 or not original.batch_first or original.kdim != original.embed_dim or original.vdim != original.embed_dim or original.bias_k is not None or original.bias_v is not None or original.add_zero_attn or not original._qkv_same_embed_dim:
                raise ValueError('unsupported-attention-export-layout')
            self.in_proj_weight = original.in_proj_weight
            self.in_proj_bias = original.in_proj_bias
            self.out_proj = original.out_proj
            self.dim = original.embed_dim
            self.heads = original.num_heads
            self.head_dim = self.dim // self.heads

        def forward(self, query, key, value, key_padding_mask=None, need_weights=False):
            d = self.dim
            bias = self.in_proj_bias
            q = F.linear(query, self.in_proj_weight[:d], bias[:d] if bias is not None else None)
            k = F.linear(key, self.in_proj_weight[d:2*d], bias[d:2*d] if bias is not None else None)
            v = F.linear(value, self.in_proj_weight[2*d:], bias[2*d:] if bias is not None else None)
            q = q.reshape(q.shape[0], q.shape[1], self.heads, self.head_dim).transpose(1, 2)
            k = k.reshape(k.shape[0], k.shape[1], self.heads, self.head_dim).transpose(1, 2)
            v = v.reshape(v.shape[0], v.shape[1], self.heads, self.head_dim).transpose(1, 2)
            score = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.head_dim)
            if key_padding_mask is not None:
                score = score.masked_fill(key_padding_mask[:, None, None, :], float('-inf'))
            weights = torch.softmax(score, dim=-1)
            result = torch.matmul(weights, v).transpose(1, 2)
            result = result.reshape(query.shape[0], query.shape[1], self.dim)
            return self.out_proj(result), None

    model.request_attention = Attention(model.request_attention).eval()
    model.constraint_attention = Attention(model.constraint_attention).eval()
    return model


def export(args):
    for path, expected in [(args.checkpoint, args.checkpoint_sha256), (args.config, args.config_sha256), (args.trainer, args.trainer_sha256)]:
        if sha(path) != expected:
            raise ValueError('immutable-input-hash-mismatch')
    config = json.loads(args.config.read_text())
    layout = output_layout(config)
    run = None
    if not args.fixture:
        if not args.run_manifest or not args.run_manifest_sha256 or sha(args.run_manifest) != args.run_manifest_sha256:
            raise ValueError('trained-export-requires-frozen-run-manifest')
        run = json.loads(args.run_manifest.read_text())
        if run.get('format') != 'sop.raw-structural-training' or run.get('scriptSha256') != args.trainer_sha256 or run.get('modelConfigSha256') != args.config_sha256:
            raise ValueError('run-config-trainer-mismatch')
    if args.out.exists():
        raise ValueError('output-already-exists')
    args.out.parent.mkdir(parents=True, exist_ok=True)
    planned_output_bytes = 2 * args.checkpoint.stat().st_size
    free_reserve_bytes = 512 * 1024 * 1024
    if shutil.disk_usage(args.out.parent).free < planned_output_bytes + free_reserve_bytes:
        raise RuntimeError('insufficient-export-reserve')
    import torch
    import numpy as np
    import onnxruntime as ort
    from transformers import AutoTokenizer
    torch.set_num_threads(2)
    spec = importlib.util.spec_from_file_location('frozen_structural_trainer', args.trainer)
    trainer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(trainer)
    for key, names in [('requestFields', trainer.R_FIELDS), ('constraintFields', trainer.C_FIELDS), ('requestSpans', trainer.R_SPANS), ('constraintSpans', trainer.C_SPANS)]:
        if config[key] != names:
            raise ValueError('trainer-head-contract-mismatch')
    model = trainer.build_model(config, config['encoder']).cpu().eval()
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=True)
    if checkpoint.get('config') != config:
        raise ValueError('checkpoint-config-mismatch')
    if not args.fixture and (not isinstance(checkpoint.get('epoch'), int) or checkpoint['epoch'] < 1 or not isinstance(checkpoint.get('steps'), int) or checkpoint['steps'] < 1):
        raise ValueError('checkpoint-not-completed-trained-epoch')
    model.load_state_dict(checkpoint['model'], strict=True)
    # Preserve the original forward for independent lowering/parity comparison.
    import copy
    reference_model = copy.deepcopy(model).eval()
    model = lower_attention_for_export(model)
    names = list(layout)

    class Flat(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.structural = model

        def forward(self, input_ids, attention_mask):
            output = self.structural(input_ids, attention_mask)
            return tuple(output[key] for key in names)

    flat = Flat().eval()
    tokenizer_source = Path(args.tokenizer or config['encoder'])
    tokenizer_sources = {name: sha(tokenizer_source / name) for name in ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt'] if (tokenizer_source / name).exists()}
    encoder_config_sha = sha(Path(config['encoder']) / 'config.json')
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_source, local_files_only=True)
    maxlen = int(config['maxLength'])
    if not 4 <= maxlen <= 512:
        raise ValueError('invalid-max-length')
    example = tokenizer(['invented source'], ['{"area":"fixture","context":null}'], padding='max_length', truncation=True, max_length=maxlen, return_tensors='pt')
    with tempfile.TemporaryDirectory(prefix='structural-export-', dir=args.out.parent) as temporary:
        output = Path(temporary) / 'model'
        (output / 'onnx').mkdir(parents=True)
        onnx_path = output / 'onnx/model.onnx'
        dynamic = {'input_ids': {0: 'batch', 1: 'sequence'}, 'attention_mask': {0: 'batch', 1: 'sequence'}}
        for key, dims in layout.items():
            dynamic[key] = {i: dim for i, dim in enumerate(dims) if isinstance(dim, str)}
        with torch.no_grad():
            torch.onnx.export(flat, (example['input_ids'], example['attention_mask']), str(onnx_path), dynamo=False, external_data=False, opset_version=18, input_names=['input_ids', 'attention_mask'], output_names=names, dynamic_axes=dynamic)
        if sorted(path.name for path in (output / 'onnx').iterdir()) != ['model.onnx']:
            raise ValueError('unexpected-external-onnx-weights')
        session = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
        if [item.name for item in session.get_outputs()] != names:
            raise ValueError('onnx-head-drop-or-reorder')
        errors = dict.fromkeys(names, 0.0)
        argmax_errors = dict.fromkeys(names, 0)
        for batch, length in [(1, maxlen), (2, max(4, maxlen // 2))]:
            ids = example['input_ids'][:, :length].repeat(batch, 1)
            mask = example['attention_mask'][:, :length].repeat(batch, 1)
            with torch.no_grad():
                expected_map = reference_model(ids, mask)
                expected = tuple(expected_map[key] for key in names)
            actual = session.run(names, {'input_ids': ids.numpy(), 'attention_mask': mask.numpy()})
            for key, left, right in zip(names, actual, expected):
                np.testing.assert_allclose(left, right.numpy(), rtol=1e-4, atol=1e-4, err_msg=key)
                argmax_errors[key] += int(np.count_nonzero(left.argmax(-1) != right.numpy().argmax(-1)))
                errors[key] = max(errors[key], float(np.max(np.abs(left - right.numpy()))))
        if any(argmax_errors.values()):
            raise ValueError('onnx-decision-parity-mismatch: ' + json.dumps({key: value for key, value in argmax_errors.items() if value}))
        tokenizer.save_pretrained(output)
        (output / 'model-config.json').write_bytes(args.config.read_bytes())
        manifest = {'format': 'psys2.structural-onnx/1', 'version': 1, 'artifactRole': 'fixture' if args.fixture else 'trained-unverified', 'executionEligible': False, 'graphConfidence': None, 'dtype': 'fp32', 'attentionLowering': 'loaded Q/K/V and output projections + scaled softmax/key-padding mask; original-forward parity required', 'rawPredictionFormat': 'psys2.raw-structural-predictions/1', 'config': config, 'outputs': layout, 'outputCount': len(layout), 'checkpointSha256': args.checkpoint_sha256, 'modelConfigSha256': args.config_sha256, 'trainerSha256': args.trainer_sha256, 'runManifestSha256': args.run_manifest_sha256 if run else None, 'trainingDataManifestSha256': run.get('dataManifestSha256') if run else None, 'exporterSha256': sha(Path(__file__)), 'modelSha256': sha(onnx_path), 'tokenizerSha256': sha(output / 'tokenizer.json'), 'tokenizerConfigSha256': sha(output / 'tokenizer_config.json'), 'sourceTokenizerFiles': tokenizer_sources, 'sourceEncoderConfigSha256': encoder_config_sha, 'parity': {'allHeads': len(errors), 'maxAbsError': max(errors.values()), 'perHeadMaxAbsError': errors, 'perHeadArgmaxDisagreements': argmax_errors, 'cases': [{'batch': 1, 'sequence': maxlen}, {'batch': 2, 'sequence': max(4, maxlen // 2)}]}, 'inputEncoding': {'pairOrder': 'source then supplied area/context JSON', 'contextJson': 'sort_keys=True, ensure_ascii=False, compact separators', 'maxLength': maxlen, 'truncation': 'longest_first', 'padding': 'max_length'}, 'offsetAuthority': 'Exact original Unicode scalar offsets with token-ID/mask/sequence parity; unavailable offsets must remain unresolved.'}
        cfg = model.encoder.config.to_dict()
        cfg['architectures'] = ['DistilBertModel']
        cfg['structuralManifest'] = 'structural-manifest.json'
        (output / 'config.json').write_text(json.dumps(cfg, indent=2) + '\n')
        (output / 'structural-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        for path, expected in [(args.checkpoint, args.checkpoint_sha256), (args.config, args.config_sha256), (args.trainer, args.trainer_sha256)] + ([(args.run_manifest, args.run_manifest_sha256)] if run else []):
            if sha(path) != expected:
                raise ValueError('immutable-input-changed-during-export')
        if sha(Path(config['encoder']) / 'config.json') != encoder_config_sha or any(sha(tokenizer_source / name) != digest for name, digest in tokenizer_sources.items()):
            raise ValueError('tokenizer-or-encoder-config-changed-during-export')
        output_bytes = sum(path.stat().st_size for path in output.rglob('*') if path.is_file())
        if output_bytes > planned_output_bytes or shutil.disk_usage(args.out.parent).free < free_reserve_bytes:
            raise RuntimeError('export-output-or-reserve-exceeded')
        os.rename(output, args.out)
        if shutil.disk_usage(args.out.parent).free < free_reserve_bytes:
            shutil.rmtree(args.out)
            raise RuntimeError('post-publication-reserve-exceeded-own-output-removed')
    return manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['checkpoint', 'config', 'trainer', 'out']:
        p.add_argument('--' + name, type=Path, required=True)
    for name in ['checkpoint-sha256', 'config-sha256', 'trainer-sha256']:
        p.add_argument('--' + name, required=True)
    p.add_argument('--run-manifest', type=Path)
    p.add_argument('--run-manifest-sha256')
    p.add_argument('--tokenizer', type=Path)
    p.add_argument('--fixture', action='store_true')
    result = export(p.parse_args())
    print(json.dumps({key: result[key] for key in ['format', 'artifactRole', 'executionEligible', 'outputCount', 'modelSha256', 'parity']}, indent=2))


if __name__ == '__main__':
    main()
