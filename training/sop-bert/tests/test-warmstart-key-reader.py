import importlib.util,pathlib,unittest,copy
import torch
p=pathlib.Path(__file__).resolve().parents[1]/'warmstart-key-reader.py';spec=importlib.util.spec_from_file_location('semantic_warmstart',p);helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
def config(keys,banks):return {'keys':keys,'bioKeys':keys,'registry':{k:{'role':'domain','head':'class','concept':k}for k in keys},'banks':banks}
def entries(*values):return [{'state':'value','value':v}for v in values]
class Tiny(torch.nn.Module):
 def __init__(self,c):
  super().__init__();self.encoder=torch.nn.Linear(2,2);self.bio=torch.nn.Linear(2,len(c['bioKeys'])*3);self.presence=torch.nn.Linear(2,len(c['keys']));self.key=torch.nn.Embedding(len(c['keys']),2);self.classes=torch.nn.ModuleDict({str(c['keys'].index(k)):torch.nn.Linear(2,len(bank))for k,bank in c['banks'].items()})
class Transfer(unittest.TestCase):
 def test_reordered_keys_and_labels_keep_meaning_and_preserve_new_heads(self):
  old=config(['a','b'],{'a':entries('x','y'),'b':entries('b')});new=config(['b','a','c'],{'a':entries('y','z','x'),'b':entries('b'),'c':entries('c')});new['registry']['b']['concept']='changed meaning'
  source=Tiny(old)
  with torch.no_grad():
   for i,param in enumerate(source.parameters()):param.copy_(torch.arange(param.numel()).reshape(param.shape)+i*100)
  state={k:v.clone()for k,v in source.state_dict().items()};before={k:v.clone()for k,v in state.items()};target=Tiny(new);fresh={k:v.clone()for k,v in target.state_dict().items()}
  report=helper.transfer(target,{'model':state,'config':old},new);out=target.state_dict()
  self.assertEqual(report['sharedKeys'],1);self.assertEqual(report['newKeys'],2)
  self.assertTrue(torch.equal(out['encoder.weight'],state['encoder.weight']))
  self.assertTrue(torch.equal(out['presence.weight'][1],state['presence.weight'][0]))
  self.assertTrue(torch.equal(out['bio.weight'][3:6],state['bio.weight'][:3]))
  self.assertTrue(torch.equal(out['classes.1.weight'][2],state['classes.0.weight'][0]))
  self.assertTrue(torch.equal(out['classes.1.weight'][1],fresh['classes.1.weight'][1]))
  self.assertTrue(torch.equal(out['classes.0.weight'],fresh['classes.0.weight']))
  self.assertTrue(torch.equal(out['key.weight'][2],fresh['key.weight'][2]))
  for k in state:self.assertTrue(torch.equal(state[k],before[k]),k)
 def test_incompatible_encoder_refuses(self):
  c=config(['a'],{'a':entries('x')});source=Tiny(c).state_dict();source['encoder.weight']=torch.zeros(3,2)
  with self.assertRaisesRegex(ValueError,'incompatible-warmstart-encoder'):helper.transfer(Tiny(c),{'model':source,'config':c},c)
if __name__=='__main__':unittest.main()
