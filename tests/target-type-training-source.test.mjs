import test from 'node:test';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test('candidate compressed preparation, warmstart and exact compacted evaluation retain provenance',()=>{
 const python=existsSync('.venv/bin/python')?'.venv/bin/python':'python3';
 for(const name of ['test_target_type_training_io.py','test_target_type_compacted_evaluation.py','test_run_provenance.py'])
  execFileSync(python,[`training/sop-bert/candidates/target-type/${name}`],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
