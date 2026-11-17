import test from 'node:test';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test('isolated target-type candidate preserves schema, masking and semantic migration identities',()=>{
 const python=existsSync('.venv/bin/python')?'.venv/bin/python':'python3';
 execFileSync(python,['training/sop-bert/candidates/target-type/test_target_type_candidate.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
