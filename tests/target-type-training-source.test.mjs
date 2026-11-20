import test from 'node:test';
import {trainingPython} from './fixtures/training-python.mjs';
import {execFileSync} from 'node:child_process';
const {python,skip}=trainingPython(['torch']);
test('candidate compressed preparation, warmstart and exact compacted evaluation retain provenance',{skip},()=>{
 for(const name of ['test_target_type_training_io.py','test_target_type_compacted_evaluation.py','test_run_provenance.py','test_target_type_plateau.py','test_target_type_epoch_publication.py','test_artifact_loading.py'])
  execFileSync(python,[`training/sop-bert/candidates/target-type/${name}`],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
