import importlib.util,unittest,tempfile,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('evaluate_demo',ROOT/'evaluate-demo-reader.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ComparisonContract(unittest.TestCase):
 def test_checkpoint_formats_dispatch_to_their_own_real_decoder(self):
  for format,folder in [('sop.key-reader/1',ROOT),('sop.key-reader/2-target-type-candidate',ROOT/'candidates/target-type')]:
   self.assertEqual(module.reader_sources({'format':format}),(folder/'train-key-reader.py',folder/'predict-key-reader.py'))
  with self.assertRaises(ValueError):module.reader_sources({'format':'invented-format'})
 def test_tool_comparison_ignores_evidence_fields_and_requires_declared_cut_alignment(self):
  row={'expectedTools':[{'operation':'make','args':{'x':3},'wires':'real source','uiOperation':'make'},{'operation':'change','args':{'color':'blue'}}],'requestIndex':1}
  self.assertEqual(module.expected_tools_for_cut(row,2),[{'operation':'change','args':{'color':'blue'}}])
  with self.assertRaises(ValueError):module.expected_tools_for_cut(row,3)
 def test_uncovered_keys_include_global_domain_and_metadata_without_dropping_rows(self):
  row={'globals':{'request.target.type':{}},'mentions':[{'key':'drawing.drawn.label','metadata':{'request.constraint.scope':'group'}}]}
  self.assertEqual(module.gold_coverage(row,{'keys':['request.target.type']}),['drawing.drawn.label','request.constraint.scope'])
 def test_quality_strata_keep_uncovered_rows_in_total_and_score_actual_global_fields(self):
  gold=[{'id':'a','rawRequest':{'act':'make'}},{'id':'b','rawRequest':{'act':'change'}}]
  predicted=[{'id':'a','prediction':{'act':'make'},'missingCheckpointKeys':[],'intentExact':True},{'id':'b','prediction':{'act':'make'},'missingCheckpointKeys':[],'missingReferenceKeys':['new.key'],'intentExact':False}]
  result=module.quality_breakdown(predicted,gold,{'request.act':'act'})
  self.assertEqual(result['strata']['all']['rows'],2);self.assertEqual(result['strata']['newCheckpointKeys']['rows'],1);self.assertEqual(result['globalFields']['request.act']['exact'],1)
  self.assertEqual(result['globalFieldsByStratum']['sharedCheckpointKeys']['request.act']['exact'],1)
  self.assertEqual(result['globalFieldsByStratum']['newCheckpointKeys']['request.act']['exact'],0)
  with self.assertRaises(ValueError):module.quality_breakdown(predicted+predicted,gold,{'request.act':'act'})
 def test_union_sources_verify_hashes_and_reject_conflicting_identity(self):
  with tempfile.TemporaryDirectory()as directory:
   root=Path(directory);source=root/'authored.jsonl';row={'source_id':'a','source_path':'ui','text':'actual words','requests':[],'cohort':{'recipeFamily':'r1'}};source.write_text(json.dumps(row)+'\n');prepared=root/'full-ui.jsonl';prepared.write_text(json.dumps({'source_id':'a','source_path':'ui'})+'\n');manifest={'sources':{'ui':{'path':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}}};(root/'manifest.json').write_text(json.dumps(manifest))
   self.assertEqual(module.utterance_sources(prepared)[('ui','a')][0],'actual words')
   source.write_text(json.dumps({**row,'text':'changed'})+'\n')
   with self.assertRaisesRegex(ValueError,'hash-mismatch'):module.utterance_sources(prepared)
   source.write_text(json.dumps(row)+'\n');other=root/'other.jsonl';other.write_text(json.dumps({**row,'text':'conflicting text'})+'\n');manifest['sources']['other']={'path':str(other),'sha256':hashlib.sha256(other.read_bytes()).hexdigest()};(root/'manifest.json').write_text(json.dumps(manifest))
   with self.assertRaisesRegex(ValueError,'conflicting-authored'):module.utterance_sources(prepared)
 def test_meaning_comparison_preserves_wrong_key_even_if_same_value(self):
  request={'act':'change','target':{'type':'drawn'},'constraints':[{'key':'drawn.label','value':'blue'}]}
  wrong={'act':'change','target':{'type':'drawn'},'constraints':[{'key':'drawn.colour','value':'blue'}]}
  self.assertNotEqual(module.meaning(request,{}),module.meaning(wrong,{}))
if __name__=='__main__':unittest.main()
