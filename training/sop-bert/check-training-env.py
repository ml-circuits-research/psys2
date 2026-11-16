"""Read-only local GPU preflight. No installation, network access or training."""
import argparse
import importlib.metadata as metadata
import json
from pathlib import Path
import platform
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
packages = {}
for package in ['torch', 'numpy', 'transformers', 'tokenizers', 'onnx', 'onnxruntime', 'accelerate']:
    try: packages[package] = metadata.version(package)
    except metadata.PackageNotFoundError: packages[package] = None
report = {'python': platform.python_version(), 'architecture': platform.machine(), 'packages': packages,
          'purpose': 'local GPU availability only; no training/API compatibility claim'}
try:
    import torch
    report['cudaRuntime'] = torch.version.cuda
    report['cudaAvailable'] = torch.cuda.is_available()
    if report['cudaAvailable']:
        report['device'] = torch.cuda.get_device_name(0)
        report['capability'] = list(torch.cuda.get_device_capability(0))
        report['arithmeticResult'] = torch.arange(4, device='cuda').sum().item()
        report['gpuSmokePassed'] = report['arithmeticResult'] == 6
    else: report['gpuSmokePassed'] = False
except Exception as error:
    report['gpuSmokePassed'] = False
    report['error'] = f'{type(error).__name__}: {error}'
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
if not report['gpuSmokePassed']: sys.exit(1)
