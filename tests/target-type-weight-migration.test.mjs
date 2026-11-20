import test from 'node:test';
import {trainingPython} from './fixtures/training-python.mjs';
import {execFileSync} from 'node:child_process';
const {python,skip}=trainingPython(['torch']);
test('target-type migration preserves semantic rows and fresh values within explicit CPU bounds',{skip},()=>{
  execFileSync(python,['training/sop-bert/candidates/target-type/test_target_type_weight_migration.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
