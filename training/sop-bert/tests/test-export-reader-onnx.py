"""Actual tiny CPU Torch/ONNX/ORT, never trained checkpoint reads."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np,torch,onnx,onnxruntime as ort
from torch import nn
P=Path(__file__).resolve().parents[1];s=importlib.util.spec_from_file_location('real_export',P/'export-reader-onnx.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def config():
 keys=['generic.global','generic.domain','generic.meta'];registry={k:{'role':role,'values':['a','b']}for k,role in zip(keys,['global','domain','metadata'])};return {'format':'sop.key-reader/2-target-type-candidate','keys':keys,'bioKeys':keys[:2],'registry':registry,'banks':{k:[{'state':'absent'},{'state':'unknown'},{'state':'value','value':'a'},{'state':'value','value':'b'}]for k in keys}}
class Key(nn.Module):
 def __init__(self,attention=False):
  super().__init__();torch.manual_seed(6);self.attention=attention
  if attention:
   from transformers import DistilBertConfig,DistilBertModel
   self.encoder=DistilBertModel(DistilBertConfig(vocab_size=32,n_layers=1,dim=8,hidden_dim=16,n_heads=2,dropout=0,attention_dropout=0));self.encoder.set_attn_implementation(attention if isinstance(attention,str)else'eager')
  else:self.embedding=nn.Embedding(32,8)
  self.key=nn.Embedding(3,8);self.bio=nn.Linear(8,6);self.presence=nn.Linear(8,3);self.classes=nn.ModuleDict({str(i):nn.Linear(8,4)for i in range(3)})
 def forward(self,ids,mask):
  h=self.encoder(input_ids=ids,attention_mask=mask).last_hidden_state if self.attention else self.embedding(ids)*mask[:,:,None];return h,self.bio(h).reshape(h.shape[0],h.shape[1],2,3).permute(0,2,1,3),self.presence(h[:,0])
class Cutter(nn.Module):
 def __init__(self):super().__init__();self.embedding=nn.Embedding(32,8);self.bio=nn.Linear(8,3)
 def forward(self,ids,mask):return self.bio(self.embedding(ids)*mask[:,:,None])
def inputs(batch,length):
 ids=torch.arange(batch*length).reshape(batch,length)%31;return ids,torch.ones_like(ids)
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  torch.set_num_threads(2);cls.config=config();cls.key=Key().eval();cls.cutter=Cutter().eval();cls.examples=(*inputs(1,6),torch.tensor([[0,1],[1,3],[2,4]]),torch.tensor([-1,1,1]),[False,True,True,True,True,False]);cls.protos=m.graphs(cls.key,cls.config,cls.cutter,*cls.examples)
 def test_quantizer_no_disk_shape_inference(self):
  with patch('tempfile.TemporaryDirectory',side_effect=AssertionError('disk temporary forbidden')),patch('onnx.save_model',side_effect=AssertionError('FP32 save forbidden')):body=m.quantize_memory(self.protos['heads'])
  p=onnx.load_model_from_string(body);self.assertTrue(any(t.data_type==onnx.TensorProto.INT8 for t in p.graph.initializer));self.assertFalse(any(t.external_data for t in p.graph.initializer))
 def test_real_dynamic_sessions_logits_argmax(self):
  encoder,heads=m.prototype().make_wrappers(self.key,m.layout_view(self.config));cases=[inputs(1,4),inputs(2,9)];cases[1][1][:,-2:]=0;heads_cases=[]
  for n,length in [(1,4),(4,9)]:
   ids,mask=inputs(1,length);h=encoder(ids,mask)[0][0].detach();spans=torch.tensor([[0,1],[1,3],[2,4],[1,3]][:n]);keys=torch.tensor([-1,1,1,1][:n]);heads_cases.append((h,spans,keys))
  modules={'encoder':encoder,'cutter':self.cutter,'heads':heads};names={'encoder':['hidden','bio_logits','presence_logits'],'cutter':['bio_logits'],'heads':['class_logits']}
  for name,module in modules.items():
   q=m.quantize_memory(self.protos[name]);report=m.parity(module,self.protos[name],q,heads_cases if name=='heads'else cases,names[name]);self.assertTrue(all(r['outputDtype']=='float32'for r in report));self.assertTrue(all(r['fp32MaxAbsError']<1e-5 and r['fp32ArgmaxChanges']==0 for r in report));self.assertTrue(all(r['q8MaxAbsError']<0.15 for r in report));self.assertTrue(all(r['q8ArgmaxChanges']>=0 for r in report));print('SYNTHETIC_PARITY',name,json.dumps(report),flush=True)
 def test_actual_tiny_transformer_dynamic_encoder(self):
  for attention in ['eager','sdpa']:
   key=Key(attention=attention).eval();encoder,_=m.prototype().make_wrappers(key,m.layout_view(self.config));proto=m.graphs(key,self.config,self.cutter,*self.examples)['encoder'];cases=[inputs(1,5),inputs(2,8)];cases[1][1][:,-2:]=0;report=m.parity(encoder,proto,m.quantize_memory(proto),cases,['hidden','bio_logits','presence_logits']);self.assertTrue(all(r['fp32MaxAbsError']<1e-5 for r in report));self.assertTrue(all(r['outputDtype']=='float32'for r in report));print('ATTENTION_PARITY',attention,json.dumps(report),flush=True)
 def test_bundle_only_final_q8_files_and_offsets(self):
  identity={k:'0'*64 for k in ['checkpointSha256','cutterCheckpointSha256','trainerSha256','cutterTrainerSha256','preparerSha256','codecSha256','cutterCodecSha256','tokenizerSha256','immutableProofSha256']};identity['artifactRole']='fixture';cutter={'format':'sop.request-cutter-model/1'}
  with tempfile.TemporaryDirectory(dir=P)as d:
   out=Path(d)/'bundle';r=m.export_bundle(self.key,self.config,self.cutter,cutter,identity,{'globals':{'generic.global':'global'},'metadata':{'generic.meta':'meta'}},out,self.examples,max_output_bytes=1048576,reserve_bytes=1,key_config_bytes=json.dumps(self.config).encode(),cutter_config_bytes=json.dumps(cutter).encode());self.assertEqual(sorted(p.name for p in out.iterdir()),['cutter.q8.onnx','encoder.q8.onnx','heads.q8.onnx','manifest.json']);self.assertEqual([(v['start'],v['end'])for v in r['bankLayout']],[(0,4),(4,8),(8,12)]);self.assertEqual(r['dtype'],'fp32');self.assertEqual(r['weightRepresentation'],'q8-dynamic');self.assertFalse(r['executionEligible']);self.assertEqual(r['configSha256'],m.digest(json.dumps(self.config).encode()));self.assertIsInstance(r['configJSON'],str);self.assertEqual(r['configJSON'].encode('utf-8'),json.dumps(self.config).encode());self.assertEqual(json.loads(r['configJSON']),self.config);self.assertEqual(r['configSha256'],m.digest(r['configJSON'].encode('utf-8')));self.assertEqual(r['cutterConfigJSON'].encode('utf-8'),json.dumps(cutter).encode());self.assertEqual(r['cutterConfigSha256'],m.digest(r['cutterConfigJSON'].encode('utf-8')))
 def test_quantizer_hook_restored_and_version_bound(self):
  import onnxruntime.quantization.onnx_quantizer as q
  original=q.save_and_reload_model_with_shape_infer;m.quantize_memory(self.protos['heads']);self.assertIs(q.save_and_reload_model_with_shape_infer,original)
  with patch.object(ort,'__version__','unreviewed'),self.assertRaisesRegex(ValueError,'version'):m.quantize_memory(self.protos['heads'])
 def test_torch_bytes_export_without_disk_temporary(self):
  with patch('tempfile.TemporaryDirectory',side_effect=AssertionError('disk temporary forbidden')):
   p=m.torch_to_proto(self.cutter,inputs(1,4),['input_ids','attention_mask'],['bio_logits'],{'input_ids':{0:'batch',1:'sequence'},'attention_mask':{0:'batch',1:'sequence'},'bio_logits':{0:'batch',1:'sequence'}})
  self.assertEqual([v.name for v in p.graph.output],['bio_logits'])
 def test_empty_queries_refuse_before_export(self):
  with self.assertRaisesRegex(ValueError,'empty'):m.graphs(self.key,self.config,self.cutter,*inputs(1,4),torch.empty((0,2),dtype=torch.int64),torch.empty((0,),dtype=torch.int64),[False,True,True,False])
if __name__=='__main__':unittest.main()
