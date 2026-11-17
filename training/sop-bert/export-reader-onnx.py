"""Real three-graph export, with no intermediate FP32 disk model.
Factories accept verified in-memory CPU modules; this file never loads checkpoints.
Trained invocation requires separately approved proof/storage and frozen identities.
"""
import copy,hashlib,importlib.util,io,json,shutil,threading
from pathlib import Path
from unittest.mock import patch
LOCK=threading.RLock()
ORT_VERSION='1.31.1'
def digest(data):return hashlib.sha256(data).hexdigest()
def prototype():
 path=Path(__file__).with_name('export-key-reader.py');spec=importlib.util.spec_from_file_location('key_export_layout',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def layout_view(config):
 if config.get('format')not in ['sop.key-reader/1','sop.key-reader/2-target-type-candidate']:raise ValueError('unsupported-key-config')
 view={**config,'format':'sop.key-reader/1'};prototype().layout(view);return view

def infer_memory(model):
 import onnx
 from onnxruntime.quantization.quant_utils import add_infer_metadata
 result=onnx.shape_inference.infer_shapes(model);add_infer_metadata(result);return result

def quantize_memory(model):
 """Pinned internal hook: even ONNXQuantizer normally saves FP32 to temp disk."""
 import onnx,onnxruntime as ort
 import onnxruntime.quantization.onnx_quantizer as module
 from onnxruntime.quantization import QuantType
 from onnxruntime.quantization.quant_utils import QuantizationMode
 if ort.__version__!=ORT_VERSION:raise ValueError('unreviewed-ort-quantizer-version')
 with LOCK,patch.object(module,'save_and_reload_model_with_shape_infer',infer_memory):
  quantizer=module.ONNXQuantizer(infer_memory(copy.deepcopy(model)),False,False,QuantizationMode.IntegerOps,False,QuantType.QInt8,QuantType.QUInt8,None,[],[],['MatMul','Gather'],{'MatMulConstBOnly':True})
  quantizer.quantize_model();result=quantizer.model.model
 onnx.checker.check_model(result)
 if any(t.external_data for t in result.graph.initializer):raise ValueError('external-tensor-data-not-supported')
 if not any(t.data_type==onnx.TensorProto.INT8 for t in result.graph.initializer):raise ValueError('no-int8-weights-produced')
 return result.SerializeToString()

def torch_to_proto(model,args,names,outputs,axes):
 import torch,onnx
 if any(p.device.type!='cpu' or p.is_floating_point()and p.dtype!=torch.float32 for p in model.parameters()):raise ValueError('cpu-fp32-module-required')
 buffer=io.BytesIO()
 with torch.no_grad():torch.onnx.export(model.eval(),args,buffer,dynamo=False,opset_version=17,external_data=False,input_names=names,output_names=outputs,dynamic_axes=axes)
 proto=onnx.load_model_from_string(buffer.getvalue());onnx.checker.check_model(proto)
 if [v.name for v in proto.graph.input]!=names or [v.name for v in proto.graph.output]!=outputs:raise ValueError('exported-interface-mismatch')
 return proto

def graphs(key_model,key_config,cutter_model,input_ids,attention_mask,spans,key_indices,source_mask):
 import torch
 view=layout_view(key_config);p=prototype()
 if p.validate_queries(view,spans.tolist(),key_indices.tolist(),source_mask)['skip']:raise ValueError('skip-empty-query-batch')
 encoder,heads=p.make_wrappers(key_model,view)
 with torch.no_grad():hidden=encoder(input_ids[:1],attention_mask[:1])[0][0]
 common={'input_ids':{0:'batch',1:'sequence'},'attention_mask':{0:'batch',1:'sequence'}}
 return {
  'cutter':torch_to_proto(cutter_model,(input_ids,attention_mask),['input_ids','attention_mask'],['bio_logits'],{**common,'bio_logits':{0:'batch',1:'sequence'}}),
  'encoder':torch_to_proto(encoder,(input_ids,attention_mask),['input_ids','attention_mask'],['hidden','bio_logits','presence_logits'],{**common,'hidden':{0:'batch',1:'sequence'},'bio_logits':{0:'batch',2:'sequence'},'presence_logits':{0:'batch'}}),
  'heads':torch_to_proto(heads,(hidden,spans,key_indices),['hidden','spans','key_indices'],['class_logits'],{'hidden':{0:'sequence'},'spans':{0:'queries'},'key_indices':{0:'queries'},'class_logits':{0:'queries'}})}

def parity(model,proto,q8,cases,output_names):
 import numpy as np,torch,onnxruntime as ort
 options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
 fp=ort.InferenceSession(proto.SerializeToString(),sess_options=options,providers=['CPUExecutionProvider']);quant=ort.InferenceSession(q8,sess_options=options,providers=['CPUExecutionProvider']);results=[]
 for inputs in cases:
  with torch.no_grad():expected=model(*inputs)
  if not isinstance(expected,tuple):expected=(expected,)
  feeds={node.name:t.detach().cpu().numpy()for node,t in zip(fp.get_inputs(),inputs)};actual=fp.run(output_names,feeds);compressed=quant.run(output_names,feeds)
  for name,reference,full,reduced in zip(output_names,expected,actual,compressed):
   ref=reference.detach().cpu().numpy();assert ref.shape==full.shape==reduced.shape
   if not all(np.isfinite(a).all()for a in [ref,full,reduced]):raise ValueError('nonfinite-backend-output')
   results.append({'output':name,'shape':list(ref.shape),'fp32MaxAbsError':float(np.max(np.abs(ref-full))),'q8MaxAbsError':float(np.max(np.abs(ref-reduced))),'fp32ArgmaxChanges':int(np.count_nonzero(ref.argmax(-1)!=full.argmax(-1))),'q8ArgmaxChanges':int(np.count_nonzero(ref.argmax(-1)!=reduced.argmax(-1))),'elements':int(ref.size),'outputDtype':str(reduced.dtype)})
 return results

def export_bundle(key_model,key_config,cutter_model,cutter_config,identity,raw_routes,out,examples,*,max_output_bytes,reserve_bytes,key_config_bytes,cutter_config_bytes):
 """Write final q8 graphs only. identity is caller's separately verified authority.
 No calibration/quality is inferred: parity must be attached by the calling proof.
 """
 import onnxruntime as ort,torch,onnx
 from numbers import Integral
 required={'checkpointSha256','cutterCheckpointSha256','trainerSha256','cutterTrainerSha256','preparerSha256','codecSha256','cutterCodecSha256','tokenizerSha256','immutableProofSha256'}
 if not required<=set(identity)or any(not isinstance(identity[k],str)or len(identity[k])!=64 or any(c not in '0123456789abcdef'for c in identity[k])for k in required):raise ValueError('incomplete-export-identity')
 if identity.get('artifactRole')not in ['trained-unverified','fixture']:raise ValueError('explicit-artifact-role-required')
 if any(not isinstance(v,bytes)or len(v)>4*1024**2 for v in [key_config_bytes,cutter_config_bytes]):raise ValueError('config-byte-bound')
 canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False)
 if canonical(json.loads(key_config_bytes))!=canonical(key_config)or canonical(json.loads(cutter_config_bytes))!=canonical(cutter_config):raise ValueError('config-bytes-mismatch')
 if cutter_config.get('format')!='sop.request-cutter-model/1':raise ValueError('unsupported-cutter-config')
 for field in ['trainerSha256','preparerSha256']:
  if field in key_config and key_config[field]!=identity[field]:raise ValueError('key-source-identity-mismatch')
 for field,identity_field in [('trainerSha256','cutterTrainerSha256'),('codecSha256','cutterCodecSha256')]:
  if field in cutter_config and cutter_config[field]!=identity[identity_field]:raise ValueError('cutter-source-identity-mismatch')
 if set(raw_routes)!={'globals','metadata'}or any(not isinstance(v,dict)for v in raw_routes.values()):raise ValueError('invalid-frozen-raw-routes')
 for route,role in [('globals','global'),('metadata','metadata')]:
  expected={k for k,v in key_config['registry'].items()if v['role']==role}
  if set(raw_routes[route])!=expected or any(not isinstance(v,str)or not v for v in raw_routes[route].values()):raise ValueError('incomplete-raw-route-layout')
 if any(not isinstance(v,Integral)or isinstance(v,bool)or v<1 for v in [max_output_bytes,reserve_bytes]):raise ValueError('invalid-storage-bounds')
 out=Path(out)
 if out.exists():raise ValueError('output-already-exists')
 if shutil.disk_usage(out.parent).free<max_output_bytes+reserve_bytes:raise ValueError('insufficient-export-reserve')
 protos=graphs(key_model,key_config,cutter_model,*examples);out.mkdir();files={};used=0
 try:
  for name,proto in protos.items():
   body=quantize_memory(proto);used+=len(body)
   if used>max_output_bytes or shutil.disk_usage(out).free<len(body)+reserve_bytes:raise ValueError('export-output-budget')
   path=out/(name+'.q8.onnx');path.write_bytes(body);files[name]={'path':path.name,'sha256':digest(body),'bytes':len(body)}
  config_bytes=key_config_bytes;cutter_bytes=cutter_config_bytes;manifest={'format':'sop.key-reader-runtime/1','artifactRole':identity['artifactRole'],'dtype':'fp32','weightRepresentation':'q8-dynamic','executionEligible':False,'graphConfidence':None,'configJSON':config_bytes.decode('utf-8'),'configSha256':digest(config_bytes),'cutterConfigJSON':cutter_bytes.decode('utf-8'),'cutterConfigSha256':digest(cutter_bytes),'encoderSha256':files['encoder']['sha256'],'headsSha256':files['heads']['sha256'],'cutterSha256':files['cutter']['sha256'],'hiddenWidth':key_model.key.embedding_dim,'rawRoutes':raw_routes,'bankLayout':prototype().layout(layout_view(key_config))['banks'],'files':files,'identity':identity,**{k:identity[k]for k in required},'exporterSha256':digest(Path(__file__).read_bytes()),'layoutSourceSha256':digest(Path(__file__).with_name('export-key-reader.py').read_bytes()),'torchVersion':torch.__version__,'onnxVersion':onnx.__version__,'onnxruntimeVersion':ort.__version__,'quantization':'dynamic signed-int8 weights, unsigned-int8 dynamic activations; dequantized float32 outputs','parity':'pending actual frozen model/runtime/packet measurement; no calibration inherited'}
  manifest['bundleSha256']=digest(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode());body=(json.dumps(manifest,indent=2)+'\n').encode();used+=len(body)
  if used>max_output_bytes or shutil.disk_usage(out).free<len(body)+reserve_bytes:raise ValueError('manifest-output-budget')
  (out/'manifest.json').write_bytes(body);return manifest
 except Exception:
  # Exclusively owned fresh output; no preexisting or meaningful artifacts removed.
  shutil.rmtree(out);raise
