import test from 'node:test';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test('target-type migration preserves semantic rows and fresh values within explicit CPU bounds',()=>{
 const python=existsSync('.venv/bin/python')?'.venv/bin/python':'python3';
 execFileSync(python,['training/sop-bert/candidates/target-type/test_target_type_weight_migration.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
