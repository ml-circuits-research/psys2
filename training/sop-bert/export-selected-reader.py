"""Selected completed-run export preparation. Import never loads weights or models.
CPU modules must be supplied by the separately verified loader after authorization.
Only final q8 bytes reach disk; frozen cutter is verified and hardlinked unchanged.
"""
import hashlib,importlib.util,json,os,shutil,stat
from pathlib import Path

def digest(body):return hashlib.sha256(body).hexdigest()
def file_hash(path):
 h=hashlib.sha256()
 with Path(path).open('rb')as stream:
  for block in iter(lambda:stream.read(1048576),b''):h.update(block)
 return h.hexdigest()
def module(path,name):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def plain_file(path):
 p=Path(path).absolute()
 if p.resolve()!=p or not stat.S_ISREG(p.lstat().st_mode):raise ValueError('nonregular-or-symlink-source')
 return p

def verify_selected_metadata(paths,hashes):
 """Metadata only. Checkpoint hash is an expected identity, NOT read here.
 Reuses published artifact validator; actual loader must rehash/load checkpoint.
 """
 names={'config','trainer','preparer','dataManifest','artifact'}
 if set(paths)!=names or set(hashes)!=names|{'checkpoint'}:raise ValueError('invalid-selected-inputs')
 for key in names:
  p=plain_file(paths[key])
  if p.stat().st_size>8388608 or file_hash(p)!=hashes[key]:raise ValueError('selected-input-hash:'+key)
 values={key:json.loads(Path(paths[key]).read_bytes())for key in ['config','dataManifest','artifact']}
 contract=module(Path(__file__).parent/'candidates/target-type/artifact-provenance.py','selected_contract')
 proof=contract.validate_artifact(values['config'],values['artifact'],values['dataManifest'],hashes)
 if proof['role']!='completed-run':raise ValueError('completed-run-selected-required')
 return {**values,'paths':{k:str(v)for k,v in paths.items()},'artifactBytes':Path(paths['artifact']).read_bytes(),'proof':proof,'hashes':dict(hashes),'validatorSha256':file_hash(Path(contract.__file__)),'historicalContractSha256':file_hash(Path(contract.__file__).with_name('run-provenance.py')),'checkpointRead':False}

def verify_frozen_cutter(manifest_path,manifest_sha,proof_path,proof_sha):
 p=plain_file(manifest_path);proof_file=plain_file(proof_path)
 if file_hash(p)!=manifest_sha or file_hash(proof_file)!=proof_sha:raise ValueError('cutter-proof-hash')
 m=json.loads(p.read_bytes());proof=json.loads(proof_file.read_bytes());d=m['files']['cutter']
 if Path(d['path']).name!=d['path']:raise ValueError('unsafe-cutter-path')
 graph=plain_file(p.parent/d['path'])
 if graph.stat().st_mode&0o222 or graph.stat().st_size!=d['bytes']or file_hash(graph)!=d['sha256']or d['sha256']!=m['cutterSha256']:raise ValueError('cutter-graph-identity-or-mutability')
 if proof.get('format')!='sop.request-cutter-run/1'or proof.get('complete')is not True or proof.get('confidenceCalibrated')is not False or proof.get('executionEligible')is not False or any(proof.get(k)!=m.get(mk)for k,mk in [('checkpointSha256','cutterCheckpointSha256'),('configSha256','cutterConfigSha256'),('trainerSha256','cutterTrainerSha256')]):raise ValueError('cutter-proof-correlation')
 if not isinstance(m.get('cutterConfigJSON'),str)or digest(m['cutterConfigJSON'].encode())!=m['cutterConfigSha256']:raise ValueError('cutter-config-identity')
 return {'graph':str(graph),'descriptor':d,'manifestSha256':manifest_sha,'proofPath':str(proof_file),'proofSha256':proof_sha,'checkpointSha256':m['cutterCheckpointSha256'],'configJSON':m['cutterConfigJSON'],'trainerSha256':m['cutterTrainerSha256'],'codecSha256':m['cutterCodecSha256']}

def key_graph_bytes(model,config,examples):
 """Serial encoder then heads; FP32 Proto/BytesIO never gets a disk path."""
 import torch
 e=module(Path(__file__).with_name('export-reader-onnx.py'),'selected_onnx')
 ids,mask,spans,indices,source_mask=examples;view=e.layout_view(config);p=e.prototype()
 if p.validate_queries(view,spans.tolist(),indices.tolist(),source_mask)['skip']:raise ValueError('empty-query-export')
 encoder,heads=p.make_wrappers(model,view)
 common={'input_ids':{0:'batch',1:'sequence'},'attention_mask':{0:'batch',1:'sequence'}}
 proto=e.torch_to_proto(encoder,(ids,mask),['input_ids','attention_mask'],['hidden','bio_logits','presence_logits'],{**common,'hidden':{0:'batch',1:'sequence'},'bio_logits':{0:'batch',2:'sequence'},'presence_logits':{0:'batch'}})
 yield 'encoder',e.quantize_memory(proto)
 del proto
 with torch.no_grad():hidden=encoder(ids[:1],mask[:1])[0][0]
 proto=e.torch_to_proto(heads,(hidden,spans,indices),['hidden','spans','key_indices'],['class_logits'],{'hidden':{0:'sequence'},'spans':{0:'queries'},'key_indices':{0:'queries'},'class_logits':{0:'queries'}})
 yield 'heads',e.quantize_memory(proto)

def export_selected_components(model,verified,cutter,out,examples,*,max_new_bytes,reserve_bytes):
 """No writer reserve change: caller supplies explicit no-writer activity budget.
 New encoder+heads + metadata count against max_new_bytes, reused cutter does not.
 No bindings are inherited/labelled current. Runtime manifest assembly is separate.
 """
 if any(type(v)is not int or v<=0 for v in [max_new_bytes,reserve_bytes]):raise ValueError('explicit-export-budget-required')
 if verified.get('proof',{}).get('role')!='completed-run':raise ValueError('completed-selected-proof-required')
 fresh=verify_selected_metadata(verified['paths'],verified['hashes'])
 if fresh['config']!=verified['config']or fresh['proof']!=verified['proof']:raise ValueError('selected-metadata-mutated')
 verified=fresh
 out=Path(out).absolute()
 if out.exists()or out.is_symlink():raise ValueError('output-already-exists')
 if out.parent.resolve()!=out.parent:raise ValueError('symlink-output-parent')
 if shutil.disk_usage(out.parent).free<max_new_bytes+reserve_bytes:raise ValueError('nonwriter-export-preflight')
 # Reverify immutable reuse directly before linking; no cutter export/model load.
 graph=plain_file(cutter['graph']);d=cutter['descriptor']
 if graph.stat().st_mode&0o222 or file_hash(graph)!=d['sha256']or graph.stat().st_size!=d['bytes']:raise ValueError('reused-cutter-mutated')
 source_files=[Path(__file__),Path(__file__).with_name('export-reader-onnx.py'),Path(__file__).with_name('export-key-reader.py')]
 source_hashes={str(p):file_hash(p)for p in source_files}
 out.mkdir();used=0;files={}
 def write(name,body):
  nonlocal used
  if used+len(body)>max_new_bytes or shutil.disk_usage(out).free-len(body)<reserve_bytes:raise ValueError('nonwriter-export-write-bound')
  with (out/name).open('xb')as stream:stream.write(body);stream.flush();os.fsync(stream.fileno())
  (out/name).chmod(0o444);used+=len(body);return {'path':name,'sha256':digest(body),'bytes':len(body)}
 try:
  for name,body in key_graph_bytes(model,verified['config'],examples):
   if name not in ['encoder','heads']or name in files:raise ValueError('invalid-key-component')
   files[name]=write(name+'.q8.onnx',body)
  if set(files)!={'encoder','heads'}:raise ValueError('missing-key-components')
  os.link(graph,out/'cutter.q8.onnx');files['cutter']={**d,'path':'cutter.q8.onnx'}
  proof_body=Path(cutter['proofPath']).read_bytes()
  if digest(proof_body)!=cutter['proofSha256']:raise ValueError('cutter-proof-mutated')
  files['cutterProof']=write('cutter-proof.json',proof_body)
  files['keyProof']=write('key-run.json',verified['artifactBytes'])
  # Exact original config bytes are caller-pinned, never reserialized for identity.
  receipt={'format':'sop.selected-key-components/1','checkpointSha256':verified['hashes']['checkpoint'],'selectedEpoch':verified['proof']['checkpointEpoch'],'runComplete':True,'files':files,'newBytesBeforeReceipt':used,'modelAssociation':'trusted loader boundary: caller must supply model from strict load_verified_artifact with this checkpoint/config; not established by metadata validation','reusedBytes':d['bytes'],'sourceHashes':verified['hashes'],'validatorSha256':verified['validatorSha256'],'cutterManifestSha256':cutter['manifestSha256'],'cutterProofSha256':cutter['proofSha256'],'exporterSha256':file_hash(__file__),'exportSourceHashes':source_hashes,'historicalContractSha256':verified['historicalContractSha256'],'fp32DiskFiles':False,'gpu':False,'bindings':'not-selected; requires separately published binding artifact','calibration':'not-run','graphConfidence':None,'executionEligible':False,'budget':{'maxNewBytes':max_new_bytes,'reserveBytes':reserve_bytes}}
  body=(json.dumps(receipt,indent=2)+'\n').encode();write('components.json',body)
  for item in files.values():
   if file_hash(out/item['path'])!=item['sha256']:raise ValueError('postwrite-component-identity')
  verify_selected_metadata(verified['paths'],verified['hashes'])
  if any(file_hash(p)!=sha for p,sha in source_hashes.items()):raise ValueError('export-source-mutated')
  if shutil.disk_usage(out).free<reserve_bytes:raise ValueError('postwrite-export-reserve')
  return {**receipt,'totalNewBytes':used}
 except BaseException:
  shutil.rmtree(out);raise
