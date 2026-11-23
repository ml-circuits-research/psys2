"""Export a key-reader run and a cutter run trained from official-dataset/ into the browser reader bundle format.

Produces <out>/<manifest sha256>/ with the files docs/webchat loads (manifest.json, cutter/encoder/heads q8 ONNX,
model-config.json, cutter-config.json, tokenizer files, bindings.json, key-run.json, cutter-proof.json), using the
existing exporter (export-reader-onnx.export_bundle) and verified with package-reader-browser.verifyReaderBundle.
It never edits docs/; installing a bundle is a separate, explicit step (copy the directory under
docs/webchat/models/sop-bert/ and point deployment.json at its manifest).
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
from pathlib import Path

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    import torch
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--key-run', type=Path, required=True)
    p.add_argument('--data', type=Path, required=True, help='prepared data directory the key run was trained on')
    p.add_argument('--cutter-run', type=Path, required=True)
    p.add_argument('--bindings', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True, help='parent directory; the bundle is written to <out>/<manifest sha>')
    a = p.parse_args()
    torch.set_num_threads(4)
    exporter = load('onnx_exporter', ROOT / 'export-reader-onnx.py')
    trainer = load('key_trainer', ROOT / 'train-key-reader.py')
    cutter_trainer = load('cutter_trainer', ROOT / 'train-request-cutter.py')
    codec = load('key_codec', ROOT / 'prepare-key-reader.py')

    key_config_bytes = (a.key_run / 'model-config.json').read_bytes()
    run_bytes = (a.key_run / 'run.json').read_bytes()
    run = json.loads(run_bytes)
    key_checkpoint_bytes = (a.key_run / 'checkpoint.pt').read_bytes()
    if run['format'] != 'sop.key-reader-run/1' or run['checkpointSha256'] != sha(key_checkpoint_bytes) or run['configSha256'] != sha(key_config_bytes):
        raise ValueError('key-run-identity')
    saved = torch.load(io.BytesIO(key_checkpoint_bytes), map_location='cpu', weights_only=False)
    key_config = json.loads(key_config_bytes)
    if saved['config'] != key_config:
        raise ValueError('checkpoint-config-mismatch')
    model = trainer.build_model(key_config, key_config['encoder'])
    model.load_state_dict({k: v.float() if v.is_floating_point() else v for k, v in saved['model'].items()}, strict=True)
    model.eval().float()
    selected_epoch = saved['epoch']
    del saved
    data_manifest_bytes = (a.data / 'manifest.json').read_bytes()
    # The browser offset authority (src/dialog/bert-source-offsets.mjs) accepts only max_length-padded inputs. Padding
    # is attention-masked, so it does not change the model's outputs on real tokens; the exported configs declare
    # max_length and record the training value, and the exported run proof records both config hashes.
    training_config_sha = sha(key_config_bytes)
    key_config = {**key_config, 'inputPadding': 'max_length', 'trainingInputPadding': key_config.get('inputPadding')}
    key_config_bytes = (json.dumps(key_config, indent=2) + '\n').encode()
    run = {**run, 'configSha256': sha(key_config_bytes), 'trainingConfigSha256': training_config_sha,
           'exportConfigChange': 'inputPadding dynamic -> max_length for the browser offset authority; weights unchanged'}
    run_bytes = (json.dumps(run, indent=2) + '\n').encode()

    cutter_checkpoint_bytes = (a.cutter_run / 'best.pt').read_bytes()
    cutter_saved = torch.load(io.BytesIO(cutter_checkpoint_bytes), map_location='cpu', weights_only=False)
    cutter_config = cutter_saved['config']
    cutter_config_bytes = (a.cutter_run / 'model-config.json').read_bytes()
    if json.loads(cutter_config_bytes) != cutter_config:
        raise ValueError('cutter-config-mismatch')
    training_cutter_config_sha = sha(cutter_config_bytes)
    cutter_config = {**cutter_config, 'inputPadding': 'max_length', 'trainingInputPadding': cutter_config.get('inputPadding')}
    cutter_config_bytes = (json.dumps(cutter_config, indent=2, sort_keys=True) + '\n').encode()
    cutter_model = cutter_trainer.build_model(cutter_config['encoder'])
    cutter_model.load_state_dict({k: v.float() if v.is_floating_point() else v for k, v in cutter_saved['model'].items()}, strict=True)
    cutter_model.eval().float()
    cutter_epoch = cutter_saved.get('epoch')
    del cutter_saved
    history = json.loads((a.cutter_run / 'history.json').read_text())

    encoder_dir = Path(key_config['encoder'])
    tokenizer_bytes = (encoder_dir / 'tokenizer.json').read_bytes()
    codec_identity = {'format': 'sop.key-reader-raw-codec/1', 'configSha256': sha(key_config_bytes), 'sourceSha256': sha((ROOT / 'prepare-key-reader.py').read_bytes()),
                      'predictorSha256': sha((ROOT / 'predict-key-reader.py').read_bytes()), 'global': codec.GLOBAL, 'metadata': codec.META}
    cutter_proof = {'format': 'sop.request-cutter-run/1', 'complete': True, 'role': 'trained-cutter-only', 'steps': history[-1]['step'], 'bestEpoch': cutter_epoch,
                    'epochsCompleted': len(history), 'confidenceCalibrated': False, 'executionEligible': False, 'checkpointSha256': sha(cutter_checkpoint_bytes),
                    'configSha256': sha(cutter_config_bytes), 'trainingConfigSha256': training_cutter_config_sha, 'trainerSha256': cutter_config['trainerSha256'],
                    'dataManifestSha256': cutter_config.get('provenance', {}).get('manifestSha256') if isinstance(cutter_config.get('provenance'), dict) else None,
                    'calibration': history[cutter_epoch - 1]['calibration']['span'] if cutter_epoch else None}
    cutter_proof_bytes = (json.dumps(cutter_proof, indent=2) + '\n').encode()
    identity = {'artifactRole': 'trained-unverified', 'checkpointSha256': sha(key_checkpoint_bytes), 'cutterCheckpointSha256': sha(cutter_checkpoint_bytes),
                'trainerSha256': key_config['trainerSha256'], 'cutterTrainerSha256': cutter_config['trainerSha256'], 'preparerSha256': json.loads(data_manifest_bytes)['scriptSha256'],
                'codecSha256': sha(json.dumps(codec_identity, sort_keys=True).encode()), 'cutterCodecSha256': cutter_config['codecSha256'],
                'tokenizerSha256': sha(tokenizer_bytes), 'immutableProofSha256': sha(run_bytes)}
    raw_routes = {'globals': {k: v for k, v in codec.GLOBAL.items() if k in key_config['registry']}, 'metadata': {k: v for k, v in codec.META.items() if k in key_config['registry']}}
    ids = torch.arange(8, dtype=torch.int64).reshape(1, 8)
    mask = torch.ones_like(ids)
    domains = [i for i, k in enumerate(key_config['keys']) if key_config['registry'][k]['role'] == 'domain']
    spans = torch.tensor([[0, 1], [1, 3], [3, 5]], dtype=torch.int64)
    indices = torch.tensor([-1, domains[0], domains[0]], dtype=torch.int64)
    examples = (ids, mask, spans, indices, [False, True, True, True, True, True, True, False])
    staging = a.out / 'staging'
    a.out.mkdir(parents=True, exist_ok=True)
    manifest = exporter.export_bundle(model, key_config, cutter_model, cutter_config, identity, raw_routes, staging, examples, max_output_bytes=400 * 1024 ** 2,
                                      reserve_bytes=512 * 1024 ** 2, key_config_bytes=key_config_bytes, cutter_config_bytes=cutter_config_bytes, data_manifest_bytes=data_manifest_bytes)
    extra = {'model-config.json': key_config_bytes, 'cutter-config.json': cutter_config_bytes, 'key-run.json': run_bytes, 'cutter-proof.json': cutter_proof_bytes,
             'tokenizer.json': tokenizer_bytes, 'bindings.json': a.bindings.read_bytes()}
    for name in ('tokenizer_config.json', 'vocab.txt'):
        if name in key_config['encoderFiles']:
            extra[name] = (encoder_dir / name).read_bytes()
    for name, body in extra.items():
        (staging / name).write_bytes(body)
    manifest['files']['tokenizer'] = {'path': 'tokenizer.json', 'sha256': sha(tokenizer_bytes), 'bytes': len(tokenizer_bytes)}
    manifest['files']['bindings'] = {'path': 'bindings.json', 'sha256': sha(extra['bindings.json']), 'bytes': len(extra['bindings.json'])}
    manifest.update({'bindingsSha256': sha(extra['bindings.json']), 'runComplete': True, 'selectedEpoch': selected_epoch, 'calibration': 'none',
                     'componentProofs': {'key': {'profile': 'completed-run', 'path': 'key-run.json', 'sha256': sha(run_bytes), 'checkpointSha256': sha(key_checkpoint_bytes), 'selectedEpoch': selected_epoch},
                                         'cutter': {'profile': 'frozen-cutter', 'path': 'cutter-proof.json', 'sha256': sha(cutter_proof_bytes), 'checkpointSha256': sha(cutter_checkpoint_bytes)}},
                     'trainingData': {'officialDataSha256': json.loads(data_manifest_bytes).get('officialDataSha256'), 'dataset': 'official-dataset/ (generated from webmeet-dataset)'}})
    body = (json.dumps(manifest, indent=2) + '\n').encode()
    (staging / 'manifest.json').write_bytes(body)
    final = a.out / sha(body)
    if final.exists():
        raise ValueError('bundle-exists')
    os.replace(staging, final)
    for f in final.iterdir():
        f.chmod(0o444)
    verify = subprocess.run(['node', '--input-type=module', '-e', f"import {{verifyReaderBundle}} from {json.dumps(str(ROOT / 'package-reader-browser.mjs'))};const p=await verifyReaderBundle({json.dumps(str(final))},{json.dumps(sha(body))});console.log(JSON.stringify({{files:p.files?.length??null}}))"],
                            capture_output=True, text=True)
    print(json.dumps({'bundle': str(final), 'manifestSha256': sha(body), 'files': {k: v['bytes'] for k, v in manifest['files'].items()}, 'verifyReaderBundle': verify.stdout.strip() or verify.stderr.strip()[-500:]}, indent=1))


if __name__ == '__main__':
    main()
