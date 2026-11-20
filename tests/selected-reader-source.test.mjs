import test from 'node:test';
import {trainingPython} from './fixtures/training-python.mjs';
import {execFileSync} from 'node:child_process';
const {python,skip}=trainingPython(['numpy','torch','onnx','onnxruntime']);
const env={...process.env,CUDA_VISIBLE_DEVICES:'',PYTHONDONTWRITEBYTECODE:'1'};
test('selected completed-reader export preserves proofs and bounded RAM-only component writes',{skip},()=>{
 execFileSync(python,['training/sop-bert/tests/test-export-selected-reader.py'],{env,stdio:['ignore','pipe','pipe']});
});
test('presence/BIO training consistency preserves source masks and supervised loss contracts',{skip},()=>{
 execFileSync(python,['training/sop-bert/candidates/target-type/test_presence_bio_consistency.py'],{env,stdio:['ignore','pipe','pipe']});
});
