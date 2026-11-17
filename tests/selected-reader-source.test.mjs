import test from 'node:test';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const python=existsSync('.venv/bin/python')?'.venv/bin/python':'python3';
const env={...process.env,CUDA_VISIBLE_DEVICES:'',PYTHONDONTWRITEBYTECODE:'1'};
test('selected completed-reader export preserves proofs and bounded RAM-only component writes',()=>{
 execFileSync(python,['training/sop-bert/tests/test-export-selected-reader.py'],{env,stdio:['ignore','pipe','pipe']});
});
test('presence/BIO training consistency preserves source masks and supervised loss contracts',()=>{
 execFileSync(python,['training/sop-bert/candidates/target-type/test_presence_bio_consistency.py'],{env,stdio:['ignore','pipe','pipe']});
});
