import copy,importlib.util,json,unittest
from pathlib import Path
ROOT=Path(__file__).parent

def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
p=load('candidate_predictor',ROOT/'predict-key-reader.py');prep=load('candidate_preparer',ROOT/'prepare-key-reader.py');trainer=load('candidate_trainer',ROOT/'train-key-reader.py')
INV=json.loads((ROOT/'tests/fixtures/target-type-inventory.json').read_text())
class CandidatePredictorTests(unittest.TestCase):
 def fixture(self):
  c=trainer.configuration({'format':prep.CANDIDATE_FORMAT,'registry':prep.registry(INV),'inventorySha256':'fixture','exclusionSha256':'fixture','targetFamilies':prep.target_families(INV)})
  # All optional predictions absent; target.type is the sole class under test.
  bio=[[[3,0,0]]for _ in c['bioKeys']];presence=[-1]*len(c['keys']);global_logits={k:[3]+[0]*(len(v)-1)for k,v in c['banks'].items()if c['registry'][k]['role']=='global'}
  return c,bio,presence,global_logits
 def prediction(self,area='drawing',type_value='drawn',state='value',mutate=None):
  c,bio,presence,logits=self.fixture();key=p.TARGET_TYPE;entry={'state':state,**({'value':type_value}if state=='value'else{})};index=c['banks'][key].index(entry);logits[key]=[3 if i==index else 0 for i in range(len(c['banks'][key]))];presence[c['keys'].index(key)]=1 if state!='absent'else-1
  if mutate:mutate(c,logits)
  return p.normalize(c,'x',area,bio,presence,logits,{},[[0,1]],[0],[1],{},prep.GLOBAL,prep.META)[0]
 def test_learned_type_retained_without_anchor_or_unconditional_issue(self):
  packet=self.prediction();self.assertEqual(packet['request']['target']['type'],'drawn')
  self.assertFalse(any(x['path']==['target','type']for x in packet['ranges']))
  self.assertFalse(any('target-type' in x['reason']for x in packet['unresolved']))
 def test_all_declared_families_and_shared_area_check(self):
  for area,types in prep.target_families(INV).items():
   for typ in types:self.assertEqual(self.prediction(area,typ)['request']['target']['type'],typ)
  packet=self.prediction('calendar','drawn');self.assertNotIn('type',packet['request']['target']);self.assertIn('missing-unknown-or-cross-area-target-type',[x['reason']for x in packet['unresolved']])
 def test_absent_unknown_tie_remain_unresolved(self):
  for state in ['absent','unknown']:
   packet=self.prediction(state=state);self.assertNotIn('type',packet['request']['target'])
  packet=self.prediction(mutate=lambda c,l:l.update({p.TARGET_TYPE:[0]*len(l[p.TARGET_TYPE])}));self.assertNotIn('type',packet['request']['target'])
 def test_old_and_unpublished_formats_refuse(self):
  for fmt in ['sop.key-reader/1','sop.key-reader/3-target-type-migration-candidate']:
   packet=self.prediction(mutate=lambda c,l:c.update(format=fmt));self.assertFalse(packet['coverage']['complete']);self.assertNotIn('type',packet['request']['target'])
 def test_no_type_from_kind_or_property_and_no_bio_type(self):
  packet=self.prediction(state='absent');self.assertNotIn('type',packet['request']['target'])
  packet=self.prediction(mutate=lambda c,l:c['registry'][p.TARGET_TYPE].update(bio=True));self.assertIn('invalid-target-type-profile',[x['reason']for x in packet['unresolved']])
if __name__=='__main__':unittest.main()
