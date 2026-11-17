"""Synthetic CPU only: no checkpoint/model download, ONNX invocation or binaries."""
import copy,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
import torch
from torch import nn
p=Path(__file__).resolve().parents[1]/'export-key-reader.py';s=importlib.util.spec_from_file_location('exporter',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def config():
 keys=['a','b','c','d'];registry={k:{'role':r,'values':v}for k,r,v in [('a','global',['x']),('b','domain',[]),('c','domain',[None,'<UNKNOWN>']),('d','metadata',['p','q'])]};banks={k:[{'state':'absent'},{'state':'unknown'}]+[{'state':'value','value':v}for v in registry[k]['values']]for k in ['a','c','d']};return {'format':'sop.key-reader/1','keys':keys,'bioKeys':['a','b','c'],'registry':registry,'banks':banks}
class Tiny(nn.Module):
 def __init__(self,c):
  super().__init__();torch.manual_seed(9);self.key=nn.Embedding(len(c['keys']),4);self.classes=nn.ModuleDict({str(c['keys'].index(k)):nn.Linear(4,len(v))for k,v in c['banks'].items()});self.embedding=nn.Embedding(12,4);self.bio=nn.Linear(4,9);self.presence=nn.Linear(4,4)
 def forward(self,ids,mask):
  h=self.embedding(ids);return h,self.bio(h).reshape(h.shape[0],h.shape[1],3,3).permute(0,2,1,3),self.presence(h[:,0])
class Tests(unittest.TestCase):
 def test_layout(self):
  r=m.layout(config());self.assertEqual([(v['keyIndex'],v['start'],v['end'])for v in r['banks']],[(0,0,3),(2,3,7),(3,7,11)]);self.assertEqual(r['domainKeyIndices'],[1,2])
 def test_hash(self):
  with tempfile.TemporaryDirectory()as d:
   p=Path(d)/'config.json';p.write_text(json.dumps(config()));self.assertEqual(m.checked_config(p,hashlib.sha256(p.read_bytes()).hexdigest()),config())
   with self.assertRaisesRegex(ValueError,'hash'):m.checked_config(p,'0'*64)
 def test_bank_invalid(self):
  for change in ['controls','duplicate','registry']:
   c=config()
   if change=='controls':c['banks']['a'][0]={'state':'value','value':'absent'}
   elif change=='duplicate':c['keys'].append('a')
   else:c['banks']['a'][2]['value']='unknown'
   with self.assertRaises(ValueError):m.layout(c)
 def test_encoder_reference(self):
  c=config();tiny=Tiny(c);encoder,_=m.make_wrappers(tiny,c)
  for length in [2,6]:
   ids=torch.arange(length)[None];mask=torch.ones_like(ids)
   for a,b in zip(encoder(ids,mask),tiny(ids,mask)):torch.testing.assert_close(a,b,rtol=0,atol=0)
 def test_predicted_span_pool_reference(self):
  c=config();tiny=Tiny(c);_,heads=m.make_wrappers(tiny,c);hidden=torch.arange(32,dtype=torch.float32).reshape(8,4)/7;spans=[[0,1],[1,3],[3,5],[2,4],[1,3]];keys=[-1,1,1,2,2];m.validate_queries(c,spans,keys,[False,True,True,True,True,True,True,False]);actual=heads(hidden,torch.tensor(spans),torch.tensor(keys));expected=[]
  for(a,b),key in zip(spans,keys):
   feature=hidden[0]if key==-1 else hidden[a:b].mean(0)+tiny.key.weight[key];expected.append(torch.cat([tiny.classes[str(row['keyIndex'])](feature)for row in m.layout(c)['banks']]))
  torch.testing.assert_close(actual,torch.stack(expected),rtol=1e-6,atol=1e-6);self.assertEqual(tuple(actual.shape),(5,11))
 def test_refusal_boundaries(self):
  c=config();mask=[False,True,True,False]
  for spans,keys in [([[1,1]],[1]),([[-1,2]],[1]),([[1,5]],[1]),([[1,4]],[1]),([[1,2]],[0]),([[1,2]],[3]),([[1,2]],[-2]),([[1,2]],[-1]),([[True,2]],[1]),([[1,2]],[True]),([[1,2]],[])]:
   with self.subTest(spans=spans,keys=keys),self.assertRaises(ValueError):m.validate_queries(c,spans,keys,mask)
  self.assertEqual(m.validate_queries(c,[],[],mask),{'skip':True,'count':0})
  with self.assertRaises(ValueError):m.validate_queries(c,[[1,2]],[1],mask,max_queries=0)
 def test_identity_not_ready(self):
  r=m.contract(config(),'0'*64);self.assertFalse(r['identity']['complete']);self.assertFalse(r['executable']);self.assertFalse(r['calibrated']);self.assertIsNone(r['identity']['headsOnnxSha256'])
if __name__=='__main__':unittest.main()
