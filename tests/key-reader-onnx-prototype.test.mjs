import test from 'node:test';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test('key-reader export prototype preserves actual synthetic module computations and query bounds',()=>{
 const python=existsSync('.venv/bin/python')?'.venv/bin/python':'python3';
 execFileSync(python,['training/sop-bert/tests/test-export-key-reader.py'],{env:{...process.env,CUDA_VISIBLE_DEVICES:''},stdio:['ignore','pipe','pipe']});
});
