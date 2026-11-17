"""Pure proof and tiny synthetic CPU state fixtures; no trained artifacts."""
import copy,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
import torch
ROOT=Path(__file__).parent

def load(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
train=load('current_train','train-key-reader.py');v=load('artifact_contract','artifact-provenance.py');loader=load('artifact_loader','load-artifact.py');old=load('old_fixture','test_run_provenance.py');prep=load('candidate_prep','prepare-key-reader.py')
def fixture():
 c,run,m,h=old.fixture();inv=json.loads((ROOT/'tests/fixtures/target-type-inventory.json').read_text());m.update(registry=prep.registry(inv),inventorySha256='a'*64,exclusionSha256='b'*64,targetFamilies=prep.target_families(inv));c.update(train.configuration(m));c.update(trainingSourceFormat=v.SOURCE,trainingPolicyContract=v.POLICY_CONTRACT,trainingPolicy=train.training_policy(),checkpointWriter=v.WRITER,runId='a'*32)
 metrics={'positiveBioAndGlobalExact':1,'positiveBioAndGlobalSupport':2,'targetTypePresentClass':{'correct':1,'support':2},'decodedMentionF1':.5}
 state=train.advance_plateau(None,1,metrics,c['trainingPolicy'])
 receipt={'sha256':h['checkpoint'],'bytes':12,'firstEpochPin':'epoch-pins/'+h['checkpoint']+'.pt','additionalAllocationUpperBytes':1024,'reserveBytes':134217728}
 a=train.completed_epoch_proof(c,m,metrics,state,receipt,run_id=c['runId'],steps=1,config_sha=h['config'],trainer_sha=h['trainer'],data_manifest_sha=h['dataManifest'],data_counts={'train':1,'calibration':1})
 return c,a,m,h

def final_fixture():
 c,a,m,h=fixture();metrics=a['checkpointMetrics'];state=None
 for epoch in range(1,5):state=train.advance_plateau(state,epoch,metrics,c['trainingPolicy'])
 r={'format':v.RUN,'complete':True,'candidate':True,'executionEligible':False,'tensorArchitectureVersion':2,'preparationFormat':v.v.PREPARATION,'modelConfigFormat':v.v.MODEL,'rawCodecFormat':v.v.CODEC,'epochsCompleted':4,'steps':4,'selectionCriterion':v.v.SELECTION,'checkpointEvaluation':v.v.EVALUATION,'bestSelectionRank':[.5,.5,.5],'bestDecodedMentionF1':.5,'encodedDataSha256':m['outputs'],'warmstart':c['warmstart'],'trainingPolicy':c['trainingPolicy'],'checkpointWriter':v.WRITER,'runId':c['runId'],'firstEpochProofSha256':'f'*64,'stopping':state,'bestCheckpointEpoch':1,'dataRecordCounts':{'train':1,'calibration':1},**{key+'Sha256':value for key,value in h.items()}}
 return c,r,m,h

class ContractTests(unittest.TestCase):
 def test_actual_first_epoch_producer_is_not_final_run_or_calibration(self):
  result=v.validate_artifact(*fixture());self.assertEqual(result['role'],'completed-epoch');self.assertFalse(result['executionEligible']);self.assertIsNone(result['graphConfidence'])
 def test_final_plateau_record_and_exact_checkpoint_epoch(self):
  self.assertEqual(v.validate_artifact(*final_fixture())['checkpointEpoch'],1)
 def test_epoch_roles_metric_hash_rank_pin_and_scope_refuse(self):
  changes=[lambda c,a,m:a.update(runComplete=True),lambda c,a,m:a.update(confidenceCalibrated=True),lambda c,a,m:a.update(checkpointEpoch=2),lambda c,a,m:a['checkpoint'].update(path='checkpoint.pt'),lambda c,a,m:a['checkpointMetrics'].update(decodedMentionF1=.9),lambda c,a,m:a.update(checkpointSelectionRank=[.7,.5,.5]),lambda c,a,m:a['storage'].update(pinCount=2),lambda c,a,m:a['storage'].update(reserveBytes=1),lambda c,a,m:a.update(runId='c'*32),lambda c,a,m:a['dataRecordCounts'].update(train=2),lambda c,a,m:a.update(trainingSourceFormat='other')]
  for change in changes:
   c,a,m,h=fixture();change(c,a,m)
   with self.assertRaises((ValueError,TypeError)):v.validate_artifact(c,a,m,h)
 def test_final_incomplete_wrong_stop_and_precision_refuse(self):
  for change in [lambda c,a,m:a.update(complete=False),lambda c,a,m:a.update(epochsCompleted=1),lambda c,a,m:a['stopping'].update(stopReason='max-epochs'),lambda c,a,m:a.update(checkpointEvaluation={}),lambda c,a,m:a.update(bestCheckpointEpoch=5),lambda c,a,m:a['trainingPolicy'].update(patience=0)]:
   c,a,m,h=final_fixture();change(c,a,m)
   with self.assertRaises((ValueError,TypeError)):v.validate_artifact(c,a,m,h)

class LoaderTests(unittest.TestCase):
 def files(self,root,*,bad_dtype=False,mutate=False):
  c,a,m,h=fixture();encoder=root/'encoder';encoder.mkdir();(encoder/'config.json').write_text('{}')
  preparer=root/'prepare.py';preparer.write_text('# synthetic source only\n')
  trainer=root/'train.py';trainer.write_text("import torch\ndef configuration(manifest):return {}\ndef build_model(config,encoder):\n "+("from pathlib import Path;Path(__file__).write_text(Path(__file__).read_text()+'# changed')\n "if mutate else'')+"return torch.nn.Linear(2,1)\n")
  manifest=root/'manifest.json';m['scriptSha256']=loader.digest(preparer);manifest.write_text(json.dumps(m))
  c.update(encoderFiles={'config.json':loader.digest(encoder/'config.json')},trainerSha256=loader.digest(trainer),preparerSha256=loader.digest(preparer),dataManifestSha256=loader.digest(manifest))
  config=root/'model-config.json';config.write_text(json.dumps(c))
  state={'weight':torch.tensor([[1.,2.]],dtype=torch.bfloat16),'bias':torch.tensor([3.],dtype=torch.bfloat16)}
  if bad_dtype:state['weight']=torch.tensor([[1,2]],dtype=torch.int64)
  temp=root/'synthetic.pt';torch.save({'model':state,'config':c,'epoch':1},temp)
  sha=loader.digest(temp);pins=root/'epoch-pins';pins.mkdir();checkpoint=pins/(sha+'.pt');temp.rename(checkpoint)
  hashes={'config':loader.digest(config),'trainer':loader.digest(trainer),'preparer':loader.digest(preparer),'dataManifest':loader.digest(manifest),'checkpoint':sha}
  a.update(configSha256=hashes['config'],trainerSha256=hashes['trainer'],preparerSha256=hashes['preparer'],dataManifestSha256=hashes['dataManifest']);a['checkpoint']={'sha256':sha,'bytes':checkpoint.stat().st_size,'path':'epoch-pins/'+sha+'.pt'};a['storage']['additionalAllocationUpperBytes']=checkpoint.stat().st_size+1024
  artifact=root/'first-epoch-proof.json';artifact.write_text(json.dumps(a));hashes['artifact']=loader.digest(artifact)
  paths={'config':config,'trainer':trainer,'preparer':preparer,'dataManifest':manifest,'checkpoint':checkpoint,'artifact':artifact,'encoder':encoder}
  return paths,hashes
 def test_exact_compacted_tiny_cpu_model_load_and_no_input_mutation(self):
  with tempfile.TemporaryDirectory()as d:
   paths,hashes=self.files(Path(d));result=loader.load_verified_artifact(paths,hashes);out=result['model'](torch.tensor([[2.,4.]]));self.assertEqual(out.item(),13.);self.assertFalse(result['model'].training);self.assertFalse(any(p.requires_grad for p in result['model'].parameters()));self.assertEqual({k:loader.digest(paths[k])for k in hashes},hashes);self.assertFalse(result['provenance']['executionEligible'])
 def test_hash_encoder_bound_and_float_storage_fail_closed(self):
  with tempfile.TemporaryDirectory()as d:
   paths,hashes=self.files(Path(d));bad={**hashes,'checkpoint':'f'*64}
   with self.assertRaisesRegex(ValueError,'hash'):loader.load_verified_artifact(paths,bad)
   with self.assertRaisesRegex(ValueError,'size-bound'):loader.load_verified_artifact(paths,hashes,max_checkpoint_bytes=1)
   (paths['encoder']/'config.json').write_text('changed')
   with self.assertRaisesRegex(ValueError,'encoder-hash'):loader.load_verified_artifact(paths,hashes)
  with tempfile.TemporaryDirectory()as d:
   paths,hashes=self.files(Path(d),bad_dtype=True)
   with self.assertRaisesRegex(ValueError,'shape-or-dtype'):loader.load_verified_artifact(paths,hashes)
 def test_symlinked_pin_parent_cannot_escape_artifact_directory(self):
  with tempfile.TemporaryDirectory()as d:
   root=Path(d)/'run';root.mkdir();paths,hashes=self.files(root);pin_dir=paths['checkpoint'].parent;external=Path(d)/'external';pin_dir.rename(external);pin_dir.symlink_to(external,target_is_directory=True)
   with self.assertRaisesRegex(ValueError,'epoch-pin-path'):loader.load_verified_artifact(paths,hashes)
 def test_mutated_source_during_build_never_returns_model(self):
  with tempfile.TemporaryDirectory()as d:
   paths,hashes=self.files(Path(d),mutate=True)
   with self.assertRaisesRegex(ValueError,'mutated-during-load'):loader.load_verified_artifact(paths,hashes)
if __name__=='__main__':unittest.main()
