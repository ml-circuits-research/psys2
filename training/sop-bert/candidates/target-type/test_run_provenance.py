import copy,importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('validator',Path(__file__).with_name('run-provenance.py'));v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
def fixture():
 h={key:chr(97+i)*64 for i,key in enumerate(['checkpoint','config','trainer','dataManifest','preparer'])}
 warm={'format':'sop.key-reader-warmstart-provenance/1','kind':'pretrained-encoder','specSha256':None,'frozenInputs':{},'sourceModelFormat':None,'targetModelFormat':v.MODEL,'elementWorkAllowance':None,'estimatedElements':None,'stats':None,'optimizer':'fresh-AdamW','migrationHelperSha256':None}
 config={'format':v.MODEL,'rawCodecFormat':v.CODEC,'candidate':True,'executionEligible':False,'tensorArchitectureVersion':2,'trainingSourceFormat':'sop.key-reader-source/3-target-type-migration-candidate','selectionCriterion':v.SELECTION,'checkpointEvaluation':v.EVALUATION,'warmstart':warm,**{k+'Sha256':h[k]for k in ['trainer','dataManifest','preparer']}}
 manifest={'format':v.PREPARATION,'scriptSha256':h['preparer'],'outputs':{s:'f'*64 for s in ['train','calibration']},'dataFiles':{s:{'path':s+'.jsonl.gz','encoding':'utf-8','compression':'gzip','sha256':'f'*64,'decodedSha256':'a'*64,'encodedBytes':3,'decodedBytes':5,'records':1}for s in ['train','calibration']}}
 run={'format':v.RUN,'complete':True,'candidate':True,'executionEligible':False,'tensorArchitectureVersion':2,'preparationFormat':v.PREPARATION,'modelConfigFormat':v.MODEL,'rawCodecFormat':v.CODEC,'epochsCompleted':5,'steps':5,'selectionCriterion':v.SELECTION,'checkpointEvaluation':v.EVALUATION,'bestSelectionRank':[.4,.7,.8],'bestDecodedMentionF1':.8,'encodedDataSha256':manifest['outputs'],'warmstart':warm,**{k+'Sha256':x for k,x in h.items()}}
 return copy.deepcopy(config),copy.deepcopy(run),copy.deepcopy(manifest),h
class RunTests(unittest.TestCase):
 def test_pretrained_profile_valid_without_confidence(self):
  self.assertFalse(v.validate_run_v3(*fixture())['executionEligible'])
 def test_semantic_work_chain_valid_and_exhausted_refuses(self):
  c,r,m,h=fixture();w=r['warmstart'];w.update(kind='semantic-migration',specSha256='a'*64,frozenInputs={k:'b'*64 for k in ['checkpoint','config','run','trainer','dataManifest','preparer','helper']},sourceModelFormat='sop.key-reader/1',elementWorkAllowance=12,estimatedElements=10,stats={'elements':10,'copiedElements':2,'tensors':2,'rows':1},migrationHelperSha256='b'*64);c['warmstart']=copy.deepcopy(w)
  v.validate_run_v3(c,r,m,h);r['warmstart']['elementWorkAllowance']=9;c['warmstart']=copy.deepcopy(r['warmstart'])
  with self.assertRaises(ValueError):v.validate_run_v3(c,r,m,h)
 def test_hash_completion_precision_selection_and_data_fail_closed(self):
  for change in [lambda c,r,m:r.update(complete=False),lambda c,r,m:r.update(checkpointSha256='f'*64),lambda c,r,m:r.update(bestSelectionRank=[True,.7,.8]),lambda c,r,m:r.update(checkpointEvaluation={}),lambda c,r,m:r.update(selectionCriterion={}),lambda c,r,m:m['dataFiles']['train'].update(compression='none'),lambda c,r,m:r.update(epochsCompleted=1)]:
   c,r,m,h=fixture();change(c,r,m)
   with self.assertRaises(ValueError):v.validate_run_v3(c,r,m,h)
 def test_helper_hash_and_optimizer_cannot_be_relabelled(self):
  c,r,m,h=fixture();r['warmstart']['optimizer']='restored';c['warmstart']=copy.deepcopy(r['warmstart'])
  with self.assertRaises(ValueError):v.validate_run_v3(c,r,m,h)
if __name__=='__main__':unittest.main()
