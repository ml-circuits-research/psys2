"""Export frozen inventory-conditioned score/span weights. Never a graph reader.

Requires the checkpoint SHA and a matching frozen calibration artifact. The output
is a Transformers.js AutoModel directory with explicit non-executable metadata.
"""
import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
import tempfile


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def export(args):
    checkpoint = args.checkpoint.resolve()
    if sha(checkpoint) != args.checkpoint_sha256:
        raise ValueError('checkpoint-hash-mismatch')
    run = json.loads(args.run_manifest.read_text())
    calibration = json.loads(args.calibration.read_text())
    if run.get('format') != 'sop.inventory-bootstrap.run' or run.get('executable') is not False:
        raise ValueError('unsupported-run-contract')
    if calibration.get('format') != 'sop.inventory-bootstrap.calibration' or calibration.get('checkpointSha256') != args.checkpoint_sha256:
        raise ValueError('calibration-checkpoint-mismatch')
    if args.out.exists():
        raise ValueError('output-already-exists')
    maxlen = int(run['arguments']['maxlen'])
    if not 4 <= maxlen <= 512:
        raise ValueError('invalid-max-length')
    # FP32 graph, quantized graph and exporter temporary files must coexist with
    # the training lane's next atomic checkpoint. Do not exhaust shared storage.
    args.out.parent.mkdir(parents=True, exist_ok=True)
    reserve = 3 * checkpoint.stat().st_size + 512 * 1024 * 1024
    if shutil.disk_usage(args.out.parent).free < reserve:
        raise RuntimeError('insufficient-export-reserve')

    import numpy as np
    import torch
    from torch import nn
    from transformers import AutoModel, AutoTokenizer
    import onnxruntime as ort
    from onnxruntime.quantization import QuantType, quantize_dynamic

    torch.set_num_threads(2)
    encoder = run['encoder']
    tokenizer = AutoTokenizer.from_pretrained(encoder, local_files_only=True)

    class Model(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = AutoModel.from_pretrained(encoder, local_files_only=True, attn_implementation='eager')
            self.score = nn.Linear(self.encoder.config.dim, 1)
            self.span = nn.Linear(self.encoder.config.dim, 2)

        def forward(self, input_ids, attention_mask):
            h = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            return self.score(h[:, 0]).squeeze(-1), self.span(h)

    model = Model().cpu().eval()
    model.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True)['model'], strict=True)
    with tempfile.TemporaryDirectory(prefix='bootstrap-export-', dir=args.out.parent) as temporary:
        output = Path(temporary) / 'model'
        (output / 'onnx').mkdir(parents=True)
        fp32 = output / 'onnx/model.onnx'
        # Multiple lengths and batch sizes check dynamic axes and paired encoding.
        samples = [(['An invented object.'], ['concept=kind key=example.kind phase=result instance=target candidate=object']),
                   (['A second invented object.', 'An object.'], ['concept=kind key=example.kind phase=result instance=target candidate=object'] * 2)]
        example = tokenizer(*samples[0], padding=True, truncation=True, max_length=maxlen, return_tensors='pt')
        torch.onnx.export(model, (example['input_ids'], example['attention_mask']), str(fp32), dynamo=False, opset_version=14,
                          input_names=['input_ids', 'attention_mask'], output_names=['candidate_logits', 'span_logits'],
                          dynamic_axes={'input_ids': {0: 'batch', 1: 'sequence'}, 'attention_mask': {0: 'batch', 1: 'sequence'},
                                        'candidate_logits': {0: 'batch'}, 'span_logits': {0: 'batch', 1: 'sequence'}})
        session = ort.InferenceSession(str(fp32), providers=['CPUExecutionProvider'])
        errors = []
        for texts, queries in samples:
            batch = tokenizer(texts, queries, padding=True, truncation=True, max_length=maxlen, return_tensors='pt')
            feeds = {key: batch[key].numpy() for key in ['input_ids', 'attention_mask']}
            actual = session.run(None, feeds)
            with torch.no_grad():
                expected = model(batch['input_ids'], batch['attention_mask'])
            for left, right in zip(actual, expected):
                np.testing.assert_allclose(left, right.numpy(), rtol=1e-4, atol=1e-4)
                errors.append(float(np.max(np.abs(left - right.numpy()))))
        quantized = output / 'onnx/model_quantized.onnx'
        quantize_dynamic(str(fp32), str(quantized), per_channel=True, reduce_range=True, weight_type=QuantType.QUInt8)
        # Quantized agreement is reported numerically, never equated to semantic quality.
        quant = ort.InferenceSession(str(quantized), providers=['CPUExecutionProvider'])
        quant_errors = []
        for texts, queries in samples:
            batch = tokenizer(texts, queries, padding=True, truncation=True, max_length=maxlen, return_tensors='pt')
            feeds = {key: batch[key].numpy() for key in ['input_ids', 'attention_mask']}
            for left, right in zip(quant.run(None, feeds), session.run(None, feeds)):
                if not np.isfinite(left).all():
                    raise ValueError('nonfinite-quantized-output')
                quant_errors.append(float(np.max(np.abs(left - right))))
        tokenizer.save_pretrained(output)
        cfg = model.encoder.config.to_dict()
        cfg['architectures'] = ['DistilBertModel']
        provenance = {'format': 'sop.inventory-bootstrap.browser', 'version': 1, 'executable': False,
                      'conditioning': ['field instance', 'key', 'phase', 'candidate', 'concept'],
                      'graphProposal': False, 'maxLength': maxlen,
                      'outputs': {'candidate_logits': ['batch'], 'span_logits': ['batch', 'sequence', 2]},
                      'checkpointSha256': args.checkpoint_sha256, 'calibrationSha256': sha(args.calibration),
                      'runManifestSha256': sha(args.run_manifest), 'exporterSha256': sha(Path(__file__)),
                      'modelSha256': sha(quantized), 'fp32MaxAbsError': max(errors),
                      'quantizedMaxAbsError': max(quant_errors), 'quantizedCalibration': False,
                      'tokenizerSha256': sha(output / 'tokenizer.json')}
        cfg['inventoryBootstrap'] = provenance
        (output / 'config.json').write_text(json.dumps(cfg, indent=2) + '\n')
        (output / 'bootstrap-manifest.json').write_text(json.dumps(provenance, indent=2) + '\n')
        if sha(checkpoint) != args.checkpoint_sha256:
            raise ValueError('checkpoint-changed-during-export')
        # Publish only after both runtime checks and immutable checkpoint check.
        os.rename(output, args.out)
    print(json.dumps(provenance, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--checkpoint-sha256', required=True)
    parser.add_argument('--run-manifest', type=Path, required=True)
    parser.add_argument('--calibration', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    export(parser.parse_args())


if __name__ == '__main__':
    main()
