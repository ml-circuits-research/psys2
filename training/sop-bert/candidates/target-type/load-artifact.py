"""Verified CPU checkpoint loader. No invocation occurs on import.

Call only after the owner's artifact/storage preflight. This never reads training
rows, writes model files, starts training, authorizes effects or uses a GPU.
"""
import hashlib,importlib.util,json,math
from pathlib import Path
ROOT=Path(__file__).parent

def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb')as stream:
  for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def module(path,name):
 spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

def load_verified_artifact(paths,hashes,*,max_checkpoint_bytes=268435456):
 """paths: checkpoint/config/trainer/preparer/dataManifest/artifact/encoder.

 hashes pins all six files, including the immutable epoch proof or completed-run
 record. The encoder directory is independently pinned through config.encoderFiles.
 The returned model is CPU FP32 loaded from exact compacted checkpoint tensors.
 """
 import torch
 implementation={p.name:digest(p)for p in [Path(__file__),ROOT/'artifact-provenance.py',ROOT/'run-provenance.py']}
 contract=module(ROOT/'artifact-provenance.py','candidate_artifact_contract')
 names={'checkpoint','config','trainer','preparer','dataManifest','artifact'}
 if type(paths)is not dict or set(paths)!=names|{'encoder'}or type(hashes)is not dict or set(hashes)!=names or any(not contract.v.is_hash(x)for x in hashes.values()):raise ValueError('invalid-artifact-loader-input')
 if type(max_checkpoint_bytes)is not int or not 0<max_checkpoint_bytes<=1073741824:raise ValueError('invalid-checkpoint-bound')
 files={key:Path(paths[key])for key in names};encoder=Path(paths['encoder'])
 if any(not p.is_file()for p in files.values())or not encoder.is_dir():raise ValueError('missing-artifact-file')
 if files['checkpoint'].stat().st_size>max_checkpoint_bytes:raise ValueError('checkpoint-size-bound')
 if any(files[k].stat().st_size>8388608 for k in names-{'checkpoint'}):raise ValueError('metadata-size-bound')
 actual={key:digest(path)for key,path in files.items()}
 if actual!=hashes:raise ValueError('artifact-hash-mismatch')
 config=json.loads(files['config'].read_text(encoding='utf-8'));artifact=json.loads(files['artifact'].read_text(encoding='utf-8'));manifest=json.loads(files['dataManifest'].read_text(encoding='utf-8'))
 proof=contract.validate_artifact(config,artifact,manifest,hashes)
 if proof['role']=='completed-epoch':
  if files['checkpoint'].is_symlink()or files['checkpoint'].parent.is_symlink()or not files['checkpoint'].resolve().is_relative_to(files['artifact'].parent.resolve())or files['artifact'].name!='first-epoch-proof.json' or files['checkpoint'].resolve()!=(files['artifact'].parent/artifact['checkpoint']['path']).resolve()or files['checkpoint'].stat().st_size!=artifact['checkpoint']['bytes']:raise ValueError('epoch-pin-path-or-size-mismatch')
 encoder_files=config.get('encoderFiles')
 if type(encoder_files)is not dict or not encoder_files or any(type(k)is not str or Path(k).name!=k or not contract.v.is_hash(h)for k,h in encoder_files.items()):raise ValueError('invalid-encoder-identity')
 encoder_paths={name:encoder/name for name in encoder_files}
 if any(not p.is_file()for p in encoder_paths.values())or {name:digest(path)for name,path in encoder_paths.items()}!=encoder_files:raise ValueError('encoder-hash-mismatch')
 trainer=module(files['trainer'],'verified_candidate_trainer')
 expected=trainer.configuration(manifest)
 if any(config.get(k)!=value for k,value in expected.items()):raise ValueError('trained-layout-mismatch')
 payload=torch.load(files['checkpoint'],map_location='cpu',weights_only=True)
 if type(payload)is not dict or set(payload)!={'model','config','epoch'}or payload['config']!=config or type(payload['epoch'])is not int or payload['epoch']!=proof['checkpointEpoch']or type(payload['model'])is not dict:raise ValueError('checkpoint-payload-mismatch')
 for key,tensor in payload['model'].items():
  if type(key)is not str or not isinstance(tensor,torch.Tensor)or tensor.device.type!='cpu' or tensor.is_complex() or tensor.is_floating_point()and tensor.dtype!=torch.bfloat16 or not bool(torch.isfinite(tensor).all()):raise ValueError('invalid-compacted-checkpoint-tensor')
 model=trainer.build_model(config,str(encoder))
 if any(p.device.type!='cpu' or p.is_floating_point()and p.dtype!=torch.float32 for p in model.parameters()):raise ValueError('loader-requires-cpu-float32-model')
 expected_state=model.state_dict()
 if set(expected_state)!=set(payload['model']):raise ValueError('checkpoint-state-keys')
 for key,destination in expected_state.items():
  saved=payload['model'][key]
  if saved.shape!=destination.shape or (destination.is_floating_point()and saved.dtype!=torch.bfloat16)or (not destination.is_floating_point()and saved.dtype!=destination.dtype):raise ValueError('checkpoint-state-shape-or-dtype')
 model.load_state_dict(payload['model'],strict=True);model.eval();model.requires_grad_(False)
 # The same original identities must still hold after source execution and load.
 if {name:digest(ROOT/name)for name in implementation}!=implementation:raise ValueError('loader-source-mutated')
 if {key:digest(path)for key,path in files.items()}!=hashes or {name:digest(path)for name,path in encoder_paths.items()}!=encoder_files:raise ValueError('artifact-mutated-during-load')
 return {'model':model,'config':config,'artifact':artifact,'manifest':manifest,'proof':proof,
         'provenance':{'format':'sop.key-reader-cpu-load/1','hashes':dict(hashes),'encoderFiles':dict(encoder_files),'loaderSha256':implementation[Path(__file__).name],'validatorSha256':implementation['artifact-provenance.py'],'historicalContractSha256':implementation['run-provenance.py'],'device':'cpu','checkpointFloatingStorage':'bfloat16','loadedFloatingDtype':'float32','forwardAutocast':'disabled','graphConfidence':None,'executionEligible':False}}
