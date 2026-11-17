import importlib.util,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('reader','train-key-reader.py');p=load('prep','prepare-key-reader.py')
class Tests(unittest.TestCase):
 def test_inferred_source_span_respects_word_boundaries(self):
  self.assertEqual(p.span_for('Make a line named Pipeline','line',None),[7,11])
  self.assertEqual(p.span_for('Set a bar on bars','bar',None),[6,9])
  self.assertIsNone(p.span_for('Choose line or line','line',None))
  self.assertIsNone(p.span_for('Choose pipeline','line',None))
  self.assertEqual(p.span_for('Use bars','bar','bars'),[4,8])
  self.assertEqual(p.span_for('Name it Pipeline','Pipeline','Pipeline'),[8,16])
  self.assertEqual(p.span_for('Use a_thing and thing','thing',None),[16,21])
  self.assertEqual(p.unique('abcd','bc'),[1,3])
 def test_declared_families_include_targets_without_property_heads(self):
  inventory={'request':{'target':{'keys':{'type':{'values':['vessel','empty']}}}},'novel':{'vessel':{'keys':{'weight':{}}},'empty':{'keys':{}}}}
  families=p.target_families(inventory);self.assertEqual(families,{'novel':['vessel','empty']})
  registry=p.registry(inventory);config=m.configuration({'registry':registry,'targetFamilies':families})
  self.assertEqual(config['targetFamilies'],families);self.assertEqual(config['registry']['request.target.type']['familiesByArea'],families)
  self.assertNotIn('familiesByArea',registry['request.target.type']);self.assertFalse(any(k.startswith('novel.empty.')for k in config['keys']))
  with self.assertRaisesRegex(ValueError,'target-family-registry-mismatch'):m.configuration({'registry':registry,'targetFamilies':{'novel':['vessel']}})
 def test_typed_banks(self):
  b=m.bank({'values':[None,'<ABSENT>','<UNKNOWN>',False]});self.assertEqual(m.label(None,b),2);self.assertEqual(m.label('<ABSENT>',b),3);self.assertEqual(m.label(False,b),5);self.assertEqual(m.label('unseen',b),1)
 def test_bio_decoder(self):
  self.assertEqual(m.bio_mentions([0,1,2,0,1]),[(1,3),(4,5)]);self.assertIsNone(m.bio_mentions([0,2,0]))
 def test_missing_value_not_null(self):
  reg={'drawing.drawn.colour':{'role':'domain'}};r={'world':'drawing','source_path':'haiku-v2','source':{'text':'red'}};q={'span':'red','constraints':[{'key':'drawn.colour','value_span':'red'}]};self.assertFalse(p.sample(r,q,reg,{})['mentions'][0]['valuePresent']);q['constraints'][0]['value']=None;self.assertTrue(p.sample(r,q,reg,{})['mentions'][0]['valuePresent'])
 def test_exact_offsets(self):
  self.assertEqual(m.token_interval([(0,0),(0,3),(4,8)],[4,8]),(2,3));self.assertIsNone(m.token_interval([(0,3)],[0,2]))
 def test_repeat_metadata(self):
  reg={'drawing.drawn.colour':{'role':'domain'}};r={'world':'drawing','source_path':'data/haiku-v2/drawing/x','source':{'text':'red blue'}};q={'span':'red blue','constraints':[{'key':'drawn.colour','value':'red','value_span':'red','phase':'selector'},{'key':'drawn.colour','value':'blue','value_span':'blue','phase':'result'}]};x=p.sample(r,q,reg,{});self.assertEqual([v['metadata']['request.constraint.phase']for v in x['mentions']],['selector','result']);self.assertTrue(all(v['trainable']for v in x['mentions']))
 def test_overlap_retained_masked(self):
  reg={'drawing.drawn.colour':{'role':'domain'}};r={'world':'drawing','source_path':'haiku-v2','source':{'text':'red'}};q={'span':'red','constraints':[{'key':'drawn.colour','value':'red','value_span':'red'},{'key':'drawn.colour','value':'red','value_span':'red'}]};x=p.sample(r,q,reg,{});self.assertEqual(len(x['mentions']),2);self.assertTrue(all(not v['trainable']for v in x['mentions']));self.assertEqual(x['unknownBIOKeys'],['drawing.drawn.colour'])
if __name__=='__main__':unittest.main()
