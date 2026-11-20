import test from 'node:test';
import {trainingPython} from './fixtures/training-python.mjs';
import {execFileSync} from 'node:child_process';
const {python,skip}=trainingPython(['torch']);
test('isolated target-type candidate preserves schema, masking and semantic migration identities',{skip},()=>{
  execFileSync(python,['training/sop-bert/candidates/target-type/test_target_type_candidate.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
